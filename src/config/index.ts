import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenvConfig();

export interface Config {
  openai: {
    apiKey: string;
  };
  google: {
    credentialsPath: string;
    rootFolderId: string;
    promptsFolderId?: string;
  };
  generation: {
    maxConcurrentTopics: number;
    defaultMode: 'course' | 'module';
  };
}

function getEnvVar(name: string, required: boolean = true): string {
  const value = process.env[name];
  if (required && !value) {
    // Don't throw for help/validate commands
    const skipValidation = process.argv.includes('validate') ||
                           process.argv.includes('--help') ||
                           process.argv.includes('-h');
    if (!skipValidation) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }
  return value || '';
}

export function loadConfig(): Config {
  return {
    openai: {
      apiKey: getEnvVar('OPENAI_API_KEY'),
    },
    google: {
      credentialsPath: getEnvVar('GOOGLE_APPLICATION_CREDENTIALS'),
      rootFolderId: getEnvVar('ROOT_FOLDER_ID'),
      promptsFolderId: getEnvVar('PROMPTS_FOLDER_ID', false),
    },
    generation: {
      maxConcurrentTopics: parseInt(getEnvVar('MAX_CONCURRENT_TOPICS', false) || '3', 10),
      defaultMode: (getEnvVar('DEFAULT_MODE', false) || 'course') as 'course' | 'module',
    },
  };
}

export const config = loadConfig();
