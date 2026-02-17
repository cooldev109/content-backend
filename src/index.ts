#!/usr/bin/env node

import { Command } from 'commander';
import { config } from './config/index.js';
import { runPipeline, saveRunReport } from './pipeline/runner.js';
import { parseIndexDocument } from './parser/index-parser.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('course-generator')
  .description('Unattended course content automation - generates content from index files')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate course content from an index file')
  .requiredOption('-i, --index-file-id <id>', 'Google Drive file ID of the course index')
  .option('-r, --root-folder-id <id>', 'Root folder ID in Google Drive', config.google.rootFolderId)
  .option('-o, --output <path>', 'Path to save run report', './run-reports')
  .action(async (options) => {
    console.log('\n🚀 Course Content Generator v1.0.0');
    console.log('═══════════════════════════════════════\n');

    try {
      const indexFileId = options.indexFileId;
      const rootFolderId = options.rootFolderId;

      console.log(`Index File ID: ${indexFileId}`);
      console.log(`Root Folder ID: ${rootFolderId}`);

      // Run the pipeline
      const report = await runPipeline(indexFileId, rootFolderId);

      // Save run report
      const outputDir = resolve(options.output);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = resolve(outputDir, `run-report-${timestamp}.json`);
      saveRunReport(report, reportPath);

      // Exit with appropriate code
      process.exit(report.failedTopics > 0 ? 1 : 0);
    } catch (error) {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    }
  });

program
  .command('parse')
  .description('Parse an index file and show the CourseSpec (dry run)')
  .requiredOption('-i, --index-file-id <id>', 'Google Drive file ID of the course index')
  .option('-o, --output <path>', 'Path to save CourseSpec JSON')
  .action(async (options) => {
    console.log('\n📖 Parsing index document...\n');

    try {
      const courseSpec = await parseIndexDocument(options.indexFileId);

      console.log('\n📊 Parsed CourseSpec:');
      console.log('═══════════════════════════════════════');
      console.log(JSON.stringify(courseSpec, null, 2));

      if (options.output) {
        writeFileSync(options.output, JSON.stringify(courseSpec, null, 2));
        console.log(`\n✅ CourseSpec saved to: ${options.output}`);
      }

      console.log('\n✅ Parse complete');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Parse failed:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate environment configuration')
  .action(() => {
    console.log('\n🔍 Validating configuration...\n');

    try {
      console.log('OpenAI API Key: ' + (config.openai.apiKey ? '✅ Set' : '❌ Missing'));
      console.log('Google Credentials: ' + (config.google.credentialsPath ? '✅ Set' : '❌ Missing'));
      console.log('Root Folder ID: ' + (config.google.rootFolderId ? '✅ Set' : '❌ Missing'));
      console.log('Prompts Folder ID: ' + (config.google.promptsFolderId ? '✅ Set' : '⚠️ Not set (optional)'));
      console.log('Max Concurrent Topics: ' + config.generation.maxConcurrentTopics);
      console.log('Default Mode: ' + config.generation.defaultMode);

      // Check if credentials file exists
      const credPath = resolve(config.google.credentialsPath);
      const credExists = existsSync(credPath);
      console.log('\nCredentials file exists: ' + (credExists ? '✅ Yes' : '❌ No'));

      if (!credExists) {
        console.log(`\n⚠️ Please ensure the credentials file exists at: ${credPath}`);
      }

      console.log('\n✅ Validation complete');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Validation failed:', error);
      process.exit(1);
    }
  });

program.parse();
