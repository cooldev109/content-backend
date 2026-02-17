import { findOrCreateFolder, findOrCreateDoc } from '../google/drive.js';
import { writeDocContent } from '../google/docs.js';
import type { CourseSpec, Module, Topic } from '../schemas/validator.js';
import { GeneratedContent, formatTopicIndexForDoc } from './generator.js';

export interface FolderStructure {
  courseFolderId: string;
  modules: Array<{
    moduleNumber: number;
    moduleName: string;
    folderId: string;
    topics: Array<{
      topicNumber: string;
      topicName: string;
      folderId: string;
      docs: {
        topicIndexId: string;
        topicDevelopmentId: string;
        voiceoverScriptId: string;
      };
    }>;
  }>;
}

/**
 * Create the complete folder structure for a course
 * Structure: Course / Module X / Topic Y
 */
export async function createCourseStructure(
  courseSpec: CourseSpec,
  rootFolderId: string
): Promise<FolderStructure> {
  console.log(`\n📁 Creating course structure for: ${courseSpec.courseName}`);

  // Create course folder
  const courseFolder = await findOrCreateFolder(courseSpec.courseName, rootFolderId);
  const courseFolderId = courseFolder.id!;

  const structure: FolderStructure = {
    courseFolderId,
    modules: [],
  };

  // Create module folders
  for (const module of courseSpec.modules) {
    const moduleFolderName = `Módulo ${module.moduleNumber}. ${module.moduleName}`;
    console.log(`\n  📁 Module: ${moduleFolderName}`);

    const moduleFolder = await findOrCreateFolder(moduleFolderName, courseFolderId);
    const moduleFolderId = moduleFolder.id!;

    const moduleStructure = {
      moduleNumber: module.moduleNumber,
      moduleName: module.moduleName,
      folderId: moduleFolderId,
      topics: [] as FolderStructure['modules'][0]['topics'],
    };

    // Create topic folders and docs
    for (const topic of module.topics) {
      const topicFolderName = `${topic.topicNumber}. ${topic.topicName}`;
      console.log(`    📁 Topic: ${topicFolderName}`);

      const topicFolder = await findOrCreateFolder(topicFolderName, moduleFolderId);
      const topicFolderId = topicFolder.id!;

      // Create the 3 required docs
      const topicIndexDoc = await findOrCreateDoc('01_Índice', topicFolderId);
      const topicDevelopmentDoc = await findOrCreateDoc('02_Desarrollo', topicFolderId);
      const voiceoverScriptDoc = await findOrCreateDoc('03_Guión', topicFolderId);

      moduleStructure.topics.push({
        topicNumber: topic.topicNumber,
        topicName: topic.topicName,
        folderId: topicFolderId,
        docs: {
          topicIndexId: topicIndexDoc.id!,
          topicDevelopmentId: topicDevelopmentDoc.id!,
          voiceoverScriptId: voiceoverScriptDoc.id!,
        },
      });
    }

    structure.modules.push(moduleStructure);
  }

  console.log(`\n✅ Course structure created successfully`);
  return structure;
}

/**
 * Write generated content to the topic docs
 */
export async function writeTopicContent(
  topicDocs: {
    topicIndexId: string;
    topicDevelopmentId: string;
    voiceoverScriptId: string;
  },
  content: GeneratedContent
): Promise<void> {
  console.log(`      ✍️ Writing topic index...`);
  await writeDocContent(topicDocs.topicIndexId, formatTopicIndexForDoc(content.topicIndex));

  console.log(`      ✍️ Writing topic development...`);
  await writeDocContent(topicDocs.topicDevelopmentId, content.topicDevelopment);

  console.log(`      ✍️ Writing voiceover script...`);
  await writeDocContent(topicDocs.voiceoverScriptId, content.voiceoverScript);
}

/**
 * Get topic docs from structure by topic number
 */
export function getTopicDocs(
  structure: FolderStructure,
  moduleNumber: number,
  topicNumber: string
): { topicIndexId: string; topicDevelopmentId: string; voiceoverScriptId: string } | null {
  const module = structure.modules.find((m) => m.moduleNumber === moduleNumber);
  if (!module) return null;

  const topic = module.topics.find((t) => t.topicNumber === topicNumber);
  if (!topic) return null;

  return topic.docs;
}
