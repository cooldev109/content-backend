import { readFileContent } from '../google/drive.js';
import type { CourseSpec, Module, Topic } from '../schemas/validator.js';
import { validateCourseSpecSchema, createEmptyCourseSpec } from '../schemas/validator.js';

/**
 * Parse a course index document from Google Drive into a CourseSpec
 * Handles multiple formats seen in the actual Drive content
 */
export async function parseIndexDocument(fileId: string): Promise<CourseSpec> {
  console.log(`📖 Reading index document: ${fileId}`);

  const content = await readFileContent(fileId);
  console.log(`📄 Document content length: ${content.length} characters`);

  const courseSpec = parseIndexContent(content);
  courseSpec.metadata = {
    sourceFileId: fileId,
    parsedAt: new Date().toISOString(),
  };

  // Validate the parsed spec
  const validation = validateCourseSpecSchema(courseSpec);
  if (!validation.valid) {
    console.error('❌ CourseSpec validation failed:');
    validation.errors.forEach((err) => console.error(`  - ${err}`));
    throw new Error(`Invalid CourseSpec: ${validation.errors.join('; ')}`);
  }

  console.log(`✅ Parsed course: "${courseSpec.courseName}" with ${courseSpec.modules.length} modules`);
  return courseSpec;
}

/**
 * Parse the raw text content of an index document
 */
export function parseIndexContent(content: string): CourseSpec {
  const spec = createEmptyCourseSpec();
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);

  // Extract course name (usually first significant line or after emoji)
  spec.courseName = extractCourseName(lines);

  // Extract level
  spec.level = extractLevel(lines);

  // Extract objective
  spec.objective = extractObjective(lines);

  // Parse modules and topics
  spec.modules = parseModules(lines);

  return spec;
}

/**
 * Extract course name from lines
 */
function extractCourseName(lines: string[]): string {
  // Look for patterns like "📘 INVERSIÓN EN BOLSA" or "CURSO INVERSIÓN EN BOLSA"
  for (const line of lines.slice(0, 10)) {
    // Skip lines that are just metadata
    if (line.includes('Objetivo') || line.includes('objetivo')) continue;
    if (line.includes('Nivel') || line.includes('nivel')) continue;

    // Check for course title patterns
    if (line.includes('CURSO') || line.includes('Curso')) {
      return line.replace(/^[📘📗📕📙🎯🧱\s]+/, '').trim();
    }

    // Check for emoji-prefixed titles
    if (/^[📘📗📕📙]/.test(line)) {
      return line.replace(/^[📘📗📕📙\s]+/, '').trim();
    }

    // First substantial line (not a module/topic marker)
    if (line.length > 10 && !line.match(/^[BMI]\d+\./) && !line.match(/^MÓDULO/i)) {
      return line.replace(/^[📘📗📕📙\s]+/, '').trim();
    }
  }

  return lines[0] || 'Untitled Course';
}

/**
 * Extract course level
 */
function extractLevel(lines: string[]): CourseSpec['level'] {
  const content = lines.join(' ').toLowerCase();

  if (content.includes('avanzado') || content.includes('advanced')) {
    return 'avanzado';
  }
  if (content.includes('intermedio') || content.includes('intermediate')) {
    return 'intermedio';
  }
  return 'básico';
}

/**
 * Extract course objective
 */
function extractObjective(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Objetivo') || line.includes('objetivo') || line.includes('🎯')) {
      // Collect objective text (may span multiple lines)
      const objectiveLines: string[] = [];
      let j = i;

      // Skip the header line if it's just "Objetivo del curso"
      if (line.match(/^[🎯\s]*Objetivo/i)) {
        j++;
      } else {
        objectiveLines.push(line.replace(/^[🎯\s]*Objetivo[:\s]*/i, ''));
      }

      // Collect following lines until we hit a module marker
      while (j < lines.length && !lines[j].match(/^[🧱📌MÓDULO]/)) {
        if (lines[j] && !lines[j].match(/^[_─]+$/)) {
          objectiveLines.push(lines[j]);
        }
        j++;
      }

      return objectiveLines.join(' ').trim().replace(/\s+/g, ' ');
    }
  }

  return 'Completar el curso satisfactoriamente';
}

/**
 * Parse modules and topics from lines
 * Supports formats:
 * - MÓDULO 1: Name
 * - B1. Name (module header - no decimal)
 * - B1.1 Name (topic - has decimal)
 * - I2. Name (module header)
 * - I2.3 Name (topic)
 */
function parseModules(lines: string[]): Module[] {
  const modules: Module[] = [];
  let currentModule: Module | null = null;
  let globalModuleCounter = 0;

  for (const line of lines) {
    // Skip course title lines (e.g., "1. Nivel básico", "Nivel intermedio")
    if (line.match(/^[\d.]*\s*Nivel\s+(básico|intermedio|avanzado)/i)) {
      continue;
    }

    // Check for traditional MÓDULO format
    const moduloMatch = line.match(/^(?:🧱\s*)?MÓDULO\s*(\d+)[:\s·.]+(.+)/i);
    if (moduloMatch) {
      if (currentModule && currentModule.topics.length > 0) {
        modules.push(currentModule);
      }
      globalModuleCounter++;
      currentModule = {
        moduleNumber: globalModuleCounter,
        moduleName: moduloMatch[2].replace(/[📌🛠️👉]/g, '').trim(),
        topics: [],
      };
      continue;
    }

    // Check for B1., I2. format (module header - letter + number + dot, NO decimal)
    // Pattern: B1. Name or I2. Name (but NOT B1.1 or I2.3)
    const moduleHeaderMatch = line.match(/^([BI])(\d+)\.\s+(.+)$/);
    if (moduleHeaderMatch && !line.match(/^[BI]\d+\.\d+/)) {
      if (currentModule && currentModule.topics.length > 0) {
        modules.push(currentModule);
      }
      globalModuleCounter++;
      const levelPrefix = moduleHeaderMatch[1]; // B or I
      const moduleNum = moduleHeaderMatch[2];
      const moduleName = moduleHeaderMatch[3].trim();

      currentModule = {
        moduleNumber: globalModuleCounter,
        moduleName: `${levelPrefix}${moduleNum}. ${moduleName}`.replace(/[📌🛠️👉]/g, '').trim(),
        topics: [],
      };
      continue;
    }

    // Check for topic patterns: B1.1, B2.3, I1.2, etc. (letter + number + dot + number)
    const topicMatch = line.match(/^([BI])(\d+)\.(\d+)\s+(.+)$/);
    if (topicMatch) {
      // If no current module, create one
      if (!currentModule) {
        globalModuleCounter++;
        currentModule = {
          moduleNumber: globalModuleCounter,
          moduleName: 'Contenido del curso',
          topics: [],
        };
      }

      const levelPrefix = topicMatch[1]; // B or I
      const moduleNum = topicMatch[2];
      const topicNum = topicMatch[3];
      let topicName = topicMatch[4];

      // Clean up topic name (remove action markers, emoji, etc.)
      topicName = topicName
        .replace(/[🔵⚪🟢🔴🟡]/g, '')
        .replace(/\udd35/g, '') // TV emoji
        .trim();

      if (topicName.length > 0) {
        currentModule.topics.push({
          topicNumber: `${moduleNum}.${topicNum}`,
          topicName: topicName,
          status: 'pending',
        });
      }
      continue;
    }

    // Check for module result
    if (line.includes('📌 Resultado:') && currentModule) {
      currentModule.moduleResult = line.replace('📌 Resultado:', '').trim();
    }
  }

  // Don't forget the last module
  if (currentModule && currentModule.topics.length > 0) {
    modules.push(currentModule);
  }

  // If no modules found, try alternative parsing
  if (modules.length === 0) {
    return parseAlternativeFormat(lines);
  }

  return modules;
}

/**
 * Alternative parsing for simpler index formats
 */
function parseAlternativeFormat(lines: string[]): Module[] {
  const modules: Module[] = [];
  let currentModule: Module = {
    moduleNumber: 1,
    moduleName: 'Contenido del curso',
    topics: [],
  };

  let topicCounter = 1;

  for (const line of lines) {
    // Skip metadata lines
    if (line.includes('Objetivo') || line.includes('🎯')) continue;
    if (line.match(/^[_─]+$/)) continue;
    if (line.length < 5) continue;

    // Check if this looks like a topic
    const hasNumber = line.match(/^\d+\.?\d*[.\s)/]/);
    const isSubstantial = line.length > 10;

    if (hasNumber || isSubstantial) {
      const match = line.match(/^(\d+\.?\d*)[.\s)]+(.+)/) ||
                    [null, String(topicCounter), line];

      if (match) {
        currentModule.topics.push({
          topicNumber: match[1] || String(topicCounter),
          topicName: (match[2] || line).replace(/[📌🛠️👉🧱📘]/g, '').trim(),
          status: 'pending',
        });
        topicCounter++;
      }
    }
  }

  if (currentModule.topics.length > 0) {
    modules.push(currentModule);
  }

  return modules;
}

export { CourseSpec, Module, Topic };
