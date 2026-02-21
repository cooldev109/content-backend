import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { runPipeline, saveRunReport } from './pipeline/runner.js';
import { parseIndexDocument, parseIndexContent } from './parser/index-parser.js';
import { readFileContent, listFilesInFolder, findFolder } from './google/drive.js';
import { isAuthenticated, getAuthUrl, exchangeCodeForTokens, deleteToken } from './google/auth.js';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { generateJSON } from './openai/client.js';
import { getModuleGenerationPrompt, MODULE_GENERATION_SYSTEM_PROMPT, loadDefaultPrompts } from './openai/prompts.js';

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(cors());
app.use(express.json());

// Store active generation jobs
const activeJobs = new Map<string, {
  status: 'running' | 'completed' | 'failed';
  progress: number;
  totalTopics: number;
  completedTopics: number;
  currentTopic: string;
  error?: string;
  report?: any;
}>();

// ============================================
// USER LOGIN
// ============================================

const USERS = [
  { username: 'wildanimallfe', password: 'Juan123' },
];

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username && u.password === password);
  if (user) {
    res.json({ success: true, username: user.username });
  } else {
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Check auth status
app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: isAuthenticated() });
});

// Get the Google OAuth URL
app.get('/api/auth/url', (req, res) => {
  const authUrl = getAuthUrl();
  res.json({ url: authUrl });
});

// Exchange authorization code for tokens
app.post('/api/auth/code', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    await exchangeCodeForTokens(code.trim());
    res.json({ success: true });
  } catch (error: any) {
    console.error('Auth code exchange error:', error);
    res.status(500).json({ error: error.message || 'Failed to exchange authorization code' });
  }
});

// Logout - delete saved token
app.post('/api/auth/logout', (req, res) => {
  deleteToken();
  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Validate configuration
app.get('/api/config/validate', (req, res) => {
  try {
    const validation = {
      openaiApiKey: !!config.openai.apiKey,
      googleCredentials: !!config.google.credentialsPath,
      rootFolderId: !!config.google.rootFolderId,
      promptsFolderId: !!config.google.promptsFolderId,
      credentialsFileExists: existsSync(resolve(config.google.credentialsPath)),
    };
    res.json({ valid: validation.openaiApiKey && validation.googleCredentials && validation.credentialsFileExists, validation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate configuration' });
  }
});

// Parse index document from Google Drive
app.post('/api/parse/drive', async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const courseSpec = await parseIndexDocument(fileId);
    res.json({ success: true, courseSpec });
  } catch (error: any) {
    console.error('Parse error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse document' });
  }
});

// Parse manual content
app.post('/api/parse/manual', async (req, res) => {
  try {
    const { content, courseName, level, objective } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Use the internal parser
    const { parseIndexContent } = await import('./parser/index-parser.js');
    const courseSpec = parseIndexContent(content);

    // Override with provided values if any
    if (courseName) courseSpec.courseName = courseName;
    if (level) courseSpec.level = level;
    if (objective) courseSpec.objective = objective;

    courseSpec.metadata = {
      sourceFileId: 'manual-input',
      parsedAt: new Date().toISOString(),
    };

    res.json({ success: true, courseSpec });
  } catch (error: any) {
    console.error('Parse error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse content' });
  }
});

// Start content generation
app.post('/api/generate', async (req, res) => {
  try {
    const { indexFileId, rootFolderId, courseSpec, customPrompts } = req.body;

    if (!indexFileId && !courseSpec) {
      return res.status(400).json({ error: 'Either indexFileId or courseSpec is required' });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const effectiveRootFolderId = rootFolderId || config.google.rootFolderId;

    // Initialize job status
    activeJobs.set(jobId, {
      status: 'running',
      progress: 0,
      totalTopics: 0,
      completedTopics: 0,
      currentTopic: 'Initializing...',
    });

    // Return job ID immediately
    res.json({ success: true, jobId });

    // Run pipeline in background
    (async () => {
      try {
        const report = await runPipeline(
          indexFileId || 'manual',
          effectiveRootFolderId,
          courseSpec,
          (progress) => {
            const job = activeJobs.get(jobId);
            if (job) {
              job.progress = progress.percentage;
              job.totalTopics = progress.total;
              job.completedTopics = progress.completed;
              job.currentTopic = progress.currentTopic || '';
            }
          },
          customPrompts
        );

        // Save report
        const outputDir = resolve('./run-reports');
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = resolve(outputDir, `run-report-${timestamp}.json`);
        saveRunReport(report, reportPath);

        activeJobs.set(jobId, {
          status: 'completed',
          progress: 100,
          totalTopics: report.totalTopics,
          completedTopics: report.completedTopics,
          currentTopic: 'Done',
          report,
        });
      } catch (error: any) {
        console.error('Generation error:', error);
        const job = activeJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error.message;
        }
      }
    })();
  } catch (error: any) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to start generation' });
  }
});

// Get job status
app.get('/api/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// List all jobs
app.get('/api/jobs', (req, res) => {
  const jobs = Array.from(activeJobs.entries()).map(([id, job]) => ({
    id,
    ...job,
  }));
  res.json(jobs);
});

// List files in Google Drive folder
app.get('/api/drive/files/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const files = await listFilesInFolder(folderId);
    res.json({ files });
  } catch (error: any) {
    console.error('Drive list error:', error);
    res.status(500).json({ error: error.message || 'Failed to list files' });
  }
});

// Read file content from Google Drive
app.get('/api/drive/content/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const content = await readFileContent(fileId);
    res.json({ content });
  } catch (error: any) {
    console.error('Drive read error:', error);
    res.status(500).json({ error: error.message || 'Failed to read file' });
  }
});

// ============================================
// NEW WORKFLOWS: Module Generation from Title
// ============================================

// Module structure interfaces
interface GeneratedModule {
  number: number;
  title: string;
  description: string;
  objectives: string[];
  topics: string[];
  estimatedDuration: string;
}

interface GeneratedCourseStructure {
  courseTitle: string;
  courseDescription: string;
  targetAudience: string;
  prerequisites: string;
  estimatedDuration: string;
  modules: GeneratedModule[];
  learningOutcomes: string[];
}

// Custom prompts file path
const CUSTOM_PROMPTS_PATH = resolve('./custom-prompts.json');

// Get default prompt templates for the prompt editor
app.get('/api/prompts/defaults', (req, res) => {
  try {
    const prompts = loadDefaultPrompts();
    res.json({ success: true, prompts });
  } catch (error: any) {
    console.error('Failed to load default prompts:', error);
    res.status(500).json({ error: error.message || 'Failed to load default prompts' });
  }
});

// Get saved custom prompts
app.get('/api/prompts/saved', (req, res) => {
  try {
    if (existsSync(CUSTOM_PROMPTS_PATH)) {
      const data = readFileSync(CUSTOM_PROMPTS_PATH, 'utf-8');
      const prompts = JSON.parse(data);
      res.json({ success: true, prompts });
    } else {
      res.json({ success: true, prompts: {} });
    }
  } catch (error: any) {
    console.error('Failed to load saved prompts:', error);
    res.status(500).json({ error: error.message || 'Failed to load saved prompts' });
  }
});

// Save custom prompts
app.post('/api/prompts/save', (req, res) => {
  try {
    const { prompts } = req.body;
    if (!prompts || typeof prompts !== 'object') {
      return res.status(400).json({ error: 'prompts object is required' });
    }
    writeFileSync(CUSTOM_PROMPTS_PATH, JSON.stringify(prompts, null, 2), 'utf-8');
    console.log('📝 Custom prompts saved');
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to save custom prompts:', error);
    res.status(500).json({ error: error.message || 'Failed to save custom prompts' });
  }
});

// Generate module structure from course title
app.post('/api/modules/generate', async (req, res) => {
  try {
    const { courseTitle, customPrompts } = req.body;

    if (!courseTitle || typeof courseTitle !== 'string' || courseTitle.trim().length === 0) {
      return res.status(400).json({ error: 'courseTitle is required' });
    }

    console.log(`📚 Generating module structure for: "${courseTitle}"`);

    const prompt = getModuleGenerationPrompt({ courseTitle: courseTitle.trim() }, customPrompts?.moduleGeneration);

    const result = await generateJSON<GeneratedCourseStructure>(
      MODULE_GENERATION_SYSTEM_PROMPT,
      prompt,
      { maxTokens: 4096 }
    );

    console.log(`✅ Generated ${result.modules.length} modules for "${courseTitle}"`);

    res.json({ success: true, courseStructure: result });
  } catch (error: any) {
    console.error('Module generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate modules' });
  }
});

// Parse modules from uploaded TXT content
app.post('/api/modules/parse', async (req, res) => {
  try {
    const { content, courseTitle } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    console.log(`📄 Parsing module content for: "${courseTitle || 'Unknown Course'}"`);

    // Parse TXT format: "Module N: Title\nDescription: ...\n"
    const modules: GeneratedModule[] = [];
    const lines = content.split('\n');
    let currentModule: Partial<GeneratedModule> | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Match "Module N: Title" or "Módulo N: Title"
      const moduleMatch = trimmedLine.match(/^(?:Module|Módulo)\s*(\d+)\s*[:\-]\s*(.+)$/i);
      if (moduleMatch) {
        // Save previous module
        if (currentModule && currentModule.title) {
          modules.push({
            number: currentModule.number || modules.length + 1,
            title: currentModule.title,
            description: currentModule.description || '',
            objectives: currentModule.objectives || [],
            topics: currentModule.topics || [],
            estimatedDuration: currentModule.estimatedDuration || '1-2 hours',
          });
        }

        // Start new module
        currentModule = {
          number: parseInt(moduleMatch[1]),
          title: moduleMatch[2].trim(),
          description: '',
          objectives: [],
          topics: [],
        };
        continue;
      }

      // Match "Description: ..." or "Descripción: ..."
      const descMatch = trimmedLine.match(/^(?:Description|Descripción)\s*[:\-]\s*(.+)$/i);
      if (descMatch && currentModule) {
        currentModule.description = descMatch[1].trim();
        continue;
      }

      // Match "Objectives: ..." or "Objetivos: ..."
      const objMatch = trimmedLine.match(/^(?:Objectives|Objetivos)\s*[:\-]\s*(.+)$/i);
      if (objMatch && currentModule) {
        currentModule.objectives = objMatch[1].split(',').map(o => o.trim()).filter(o => o);
        continue;
      }

      // Match "Topics: ..." or "Temas: ..."
      const topicsMatch = trimmedLine.match(/^(?:Topics|Temas)\s*[:\-]\s*(.+)$/i);
      if (topicsMatch && currentModule) {
        currentModule.topics = topicsMatch[1].split(',').map(t => t.trim()).filter(t => t);
        continue;
      }

      // Match "Duration: ..." or "Duración: ..."
      const durationMatch = trimmedLine.match(/^(?:Duration|Duración)\s*[:\-]\s*(.+)$/i);
      if (durationMatch && currentModule) {
        currentModule.estimatedDuration = durationMatch[1].trim();
        continue;
      }

      // If line is not empty and we have a module, append to description
      if (trimmedLine && currentModule && !currentModule.description) {
        currentModule.description = trimmedLine;
      }
    }

    // Save last module
    if (currentModule && currentModule.title) {
      modules.push({
        number: currentModule.number || modules.length + 1,
        title: currentModule.title,
        description: currentModule.description || '',
        objectives: currentModule.objectives || [],
        topics: currentModule.topics || [],
        estimatedDuration: currentModule.estimatedDuration || '1-2 hours',
      });
    }

    if (modules.length === 0) {
      return res.status(400).json({
        error: 'No modules found in content. Expected format: "Module 1: Title\\nDescription: ..."'
      });
    }

    console.log(`✅ Parsed ${modules.length} modules from TXT content`);

    const courseStructure: GeneratedCourseStructure = {
      courseTitle: courseTitle || 'Imported Course',
      courseDescription: `Course with ${modules.length} modules imported from file.`,
      targetAudience: 'General audience',
      prerequisites: 'None specified',
      estimatedDuration: `${modules.length * 2} hours (estimated)`,
      modules,
      learningOutcomes: modules.map(m => `Complete ${m.title}`),
    };

    res.json({ success: true, courseStructure });
  } catch (error: any) {
    console.error('Module parse error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse modules' });
  }
});

// Generate course content from module structure
app.post('/api/modules/generate-content', async (req, res) => {
  try {
    const { courseStructure, rootFolderId, customPrompts } = req.body;

    if (!courseStructure || !courseStructure.modules || courseStructure.modules.length === 0) {
      return res.status(400).json({ error: 'courseStructure with modules is required' });
    }

    // Convert module structure to CourseSpec format
    const courseSpec = {
      courseName: courseStructure.courseTitle,
      level: 'intermedio' as const,
      objective: courseStructure.courseDescription,
      modules: courseStructure.modules.map((mod: GeneratedModule, modIdx: number) => ({
        moduleNumber: mod.number || modIdx + 1,
        moduleName: mod.title,
        topics: mod.topics.length > 0
          ? mod.topics.map((topic: string, idx: number) => ({
              topicNumber: `${mod.number || modIdx + 1}.${idx + 1}`,
              topicName: topic,
              description: mod.description,
            }))
          : [{
              topicNumber: `${mod.number || modIdx + 1}.1`,
              topicName: mod.title,
              description: mod.description,
            }],
      })),
      metadata: {
        sourceFileId: 'module-workflow',
        parsedAt: new Date().toISOString(),
      },
    };

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const effectiveRootFolderId = rootFolderId || config.google.rootFolderId;

    // Initialize job status
    activeJobs.set(jobId, {
      status: 'running',
      progress: 0,
      totalTopics: 0,
      completedTopics: 0,
      currentTopic: 'Initializing...',
    });

    // Return job ID immediately
    res.json({ success: true, jobId });

    // Run pipeline in background
    (async () => {
      try {
        const report = await runPipeline(
          'module-workflow',
          effectiveRootFolderId,
          courseSpec,
          (progress) => {
            const job = activeJobs.get(jobId);
            if (job) {
              job.progress = progress.percentage;
              job.totalTopics = progress.total;
              job.completedTopics = progress.completed;
              job.currentTopic = progress.currentTopic || '';
            }
          },
          customPrompts
        );

        // Save report
        const outputDir = resolve('./run-reports');
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = resolve(outputDir, `run-report-${timestamp}.json`);
        saveRunReport(report, reportPath);

        activeJobs.set(jobId, {
          status: 'completed',
          progress: 100,
          totalTopics: report.totalTopics,
          completedTopics: report.completedTopics,
          currentTopic: 'Done',
          report,
        });
      } catch (error: any) {
        console.error('Generation error:', error);
        const job = activeJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error.message;
        }
      }
    })();
  } catch (error: any) {
    console.error('Module content generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to start generation' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Course Content Generator API Server`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   API endpoints:`);
  console.log(`   - GET  /api/health`);
  console.log(`   - GET  /api/config/validate`);
  console.log(`   - POST /api/parse/drive`);
  console.log(`   - POST /api/parse/manual`);
  console.log(`   - POST /api/generate`);
  console.log(`   - GET  /api/jobs/:jobId`);
  console.log(`   - GET  /api/jobs`);
  console.log(`   - GET  /api/drive/files/:folderId`);
  console.log(`   - GET  /api/drive/content/:fileId`);
  console.log(`   - POST /api/modules/generate       (Generate modules from title)`);
  console.log(`   - POST /api/modules/parse          (Parse modules from TXT)`);
  console.log(`   - POST /api/modules/generate-content (Generate content from modules)\n`);
});

export default app;
