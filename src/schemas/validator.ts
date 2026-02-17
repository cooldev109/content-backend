import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the schema
const schemaPath = resolve(__dirname, '../../schemas/course-spec.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

// Create Ajv instance
const ajv = new Ajv({ allErrors: true, strict: false });

// Compile the validator
const validateCourseSpec = ajv.compile(schema);

export interface Topic {
  topicNumber: string;
  topicName: string;
  description?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
  generatedDocs?: {
    topicIndexId?: string;
    topicDevelopmentId?: string;
    voiceoverScriptId?: string;
  };
}

export interface Module {
  moduleNumber: number;
  moduleName: string;
  moduleResult?: string;
  topics: Topic[];
}

export interface CourseSpec {
  courseName: string;
  level: 'básico' | 'intermedio' | 'avanzado' | 'basic' | 'intermediate' | 'advanced';
  objective: string;
  targetAudience?: string;
  modules: Module[];
  metadata?: {
    sourceFileId?: string;
    parsedAt?: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  courseSpec?: CourseSpec;
}

/**
 * Validate a CourseSpec object against the schema
 */
export function validateCourseSpecSchema(data: unknown): ValidationResult {
  const valid = validateCourseSpec(data);

  if (valid) {
    return {
      valid: true,
      errors: [],
      courseSpec: data as CourseSpec,
    };
  }

  const errors = (validateCourseSpec.errors || []).map((err) => {
    const path = err.instancePath || '/';
    const message = err.message || 'Unknown error';
    return `${path}: ${message}`;
  });

  return {
    valid: false,
    errors,
  };
}

/**
 * Create an empty CourseSpec with default values
 */
export function createEmptyCourseSpec(): CourseSpec {
  return {
    courseName: '',
    level: 'básico',
    objective: '',
    modules: [],
    metadata: {
      parsedAt: new Date().toISOString(),
    },
  };
}
