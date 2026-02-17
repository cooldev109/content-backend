import pLimit from 'p-limit';
import { writeFileSync } from 'fs';
import type { CourseSpec, Topic } from '../schemas/validator.js';
import { parseIndexDocument } from '../parser/index-parser.js';
import { generateTopicContent, GeneratedContent } from './generator.js';
import { createCourseStructure, writeTopicContent, FolderStructure } from './folder-writer.js';
import { config } from '../config/index.js';

export interface TopicResult {
  moduleNumber: number;
  topicNumber: string;
  topicName: string;
  status: 'completed' | 'failed';
  error?: string;
  folderId?: string;
  docs?: {
    topicIndexId: string;
    topicDevelopmentId: string;
    voiceoverScriptId: string;
  };
}

export interface RunReport {
  startTime: Date;
  endTime?: Date;
  courseName: string;
  indexFileId: string;
  rootFolderId: string;
  courseFolderId?: string;
  totalTopics: number;
  completedTopics: number;
  failedTopics: number;
  topicResults: TopicResult[];
  errors: string[];
}

export interface ProgressCallback {
  (progress: {
    percentage: number;
    total: number;
    completed: number;
    currentTopic: string;
  }): void;
}

/**
 * Run the complete content generation pipeline
 */
export async function runPipeline(
  indexFileId: string,
  rootFolderId: string,
  providedCourseSpec?: CourseSpec,
  onProgress?: ProgressCallback
): Promise<RunReport> {
  const report: RunReport = {
    startTime: new Date(),
    courseName: '',
    indexFileId,
    rootFolderId,
    totalTopics: 0,
    completedTopics: 0,
    failedTopics: 0,
    topicResults: [],
    errors: [],
  };

  try {
    // Step 1: Parse the index document (or use provided spec)
    console.log('\n═══════════════════════════════════════');
    console.log('📖 STEP 1: Parsing index document');
    console.log('═══════════════════════════════════════');

    const courseSpec = providedCourseSpec || await parseIndexDocument(indexFileId);
    report.courseName = courseSpec.courseName;

    // Count total topics
    for (const module of courseSpec.modules) {
      report.totalTopics += module.topics.length;
    }

    console.log(`\n📊 Course: ${courseSpec.courseName}`);
    console.log(`   Level: ${courseSpec.level}`);
    console.log(`   Modules: ${courseSpec.modules.length}`);
    console.log(`   Total topics: ${report.totalTopics}`);

    // Step 2: Create folder structure
    console.log('\n═══════════════════════════════════════');
    console.log('📁 STEP 2: Creating folder structure');
    console.log('═══════════════════════════════════════');

    const structure = await createCourseStructure(courseSpec, rootFolderId);
    report.courseFolderId = structure.courseFolderId;

    // Step 3: Generate content for each topic
    console.log('\n═══════════════════════════════════════');
    console.log('✨ STEP 3: Generating content');
    console.log('═══════════════════════════════════════');

    const limit = pLimit(config.generation.maxConcurrentTopics);
    const tasks: Promise<void>[] = [];

    for (const module of courseSpec.modules) {
      const moduleStructure = structure.modules.find(
        (m) => m.moduleNumber === module.moduleNumber
      );

      if (!moduleStructure) {
        report.errors.push(`Module ${module.moduleNumber} not found in structure`);
        continue;
      }

      for (const topic of module.topics) {
        const topicStructure = moduleStructure.topics.find(
          (t) => t.topicNumber === topic.topicNumber
        );

        if (!topicStructure) {
          report.errors.push(
            `Topic ${topic.topicNumber} not found in module ${module.moduleNumber}`
          );
          continue;
        }

        // Queue topic generation with concurrency limit
        tasks.push(
          limit(async () => {
            const result = await generateAndWriteTopic(
              courseSpec,
              module.moduleNumber,
              topic,
              topicStructure
            );
            report.topicResults.push(result);

            if (result.status === 'completed') {
              report.completedTopics++;
            } else {
              report.failedTopics++;
              if (result.error) {
                report.errors.push(
                  `Topic ${topic.topicNumber}: ${result.error}`
                );
              }
            }

            // Report progress
            if (onProgress) {
              onProgress({
                percentage: Math.round((report.completedTopics / report.totalTopics) * 100),
                total: report.totalTopics,
                completed: report.completedTopics,
                currentTopic: `${topic.topicNumber}. ${topic.topicName}`,
              });
            }
          })
        );
      }
    }

    // Wait for all topics to complete
    await Promise.all(tasks);

    report.endTime = new Date();

    // Print summary
    printRunSummary(report);

    return report;
  } catch (error) {
    report.endTime = new Date();
    report.errors.push(`Pipeline failed: ${error}`);
    console.error('\n❌ Pipeline failed:', error);
    return report;
  }
}

/**
 * Generate content for a single topic and write to docs
 */
async function generateAndWriteTopic(
  courseSpec: CourseSpec,
  moduleNumber: number,
  topic: Topic,
  topicStructure: FolderStructure['modules'][0]['topics'][0]
): Promise<TopicResult> {
  const result: TopicResult = {
    moduleNumber,
    topicNumber: topic.topicNumber,
    topicName: topic.topicName,
    status: 'failed',
    folderId: topicStructure.folderId,
    docs: topicStructure.docs,
  };

  try {
    console.log(`\n  🔄 Processing: ${topic.topicNumber}. ${topic.topicName}`);

    // Generate content
    const content = await generateTopicContent(courseSpec, topic);

    // Write to docs
    await writeTopicContent(topicStructure.docs, content);

    result.status = 'completed';
    console.log(`  ✅ Completed: ${topic.topicNumber}. ${topic.topicName}`);
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Failed: ${topic.topicNumber}. ${topic.topicName}`);
    console.error(`     Error: ${result.error}`);
  }

  return result;
}

/**
 * Print run summary
 */
function printRunSummary(report: RunReport): void {
  const duration = report.endTime
    ? (report.endTime.getTime() - report.startTime.getTime()) / 1000
    : 0;

  console.log('\n═══════════════════════════════════════');
  console.log('📊 RUN SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Course: ${report.courseName}`);
  console.log(`Duration: ${duration.toFixed(1)} seconds`);
  console.log(`Total topics: ${report.totalTopics}`);
  console.log(`Completed: ${report.completedTopics} ✅`);
  console.log(`Failed: ${report.failedTopics} ❌`);

  if (report.courseFolderId) {
    console.log(`\nCourse folder: https://drive.google.com/drive/folders/${report.courseFolderId}`);
  }

  if (report.errors.length > 0) {
    console.log('\n⚠️ Errors:');
    for (const error of report.errors) {
      console.log(`  - ${error}`);
    }
  }

  console.log('═══════════════════════════════════════\n');
}

/**
 * Save run report to a JSON file
 */
export function saveRunReport(report: RunReport, outputPath: string): void {
  const reportJson = JSON.stringify(report, null, 2);
  writeFileSync(outputPath, reportJson);
  console.log(`📄 Run report saved to: ${outputPath}`);
}
