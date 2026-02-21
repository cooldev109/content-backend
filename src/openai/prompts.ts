import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileContent } from '../google/drive.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, '../../prompts');

export interface PromptContext {
  courseName: string;
  level: string;
  objective: string;
  topicName: string;
  topicIndex?: string;
  topicDevelopment?: string;
}

export interface ContentReviewContext {
  courseName: string;
  level: string;
  topicName: string;
  content: string;
}

export interface ModuleGenerationContext {
  courseTitle: string;
}

export interface ModuleValidationContext {
  courseTitle: string;
  moduleList: string;
}

/**
 * Load a prompt template from the local prompts directory
 */
function loadLocalPrompt(name: string): string {
  const filePath = resolve(PROMPTS_DIR, `${name}.txt`);

  if (!existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${filePath}`);
  }

  return readFileSync(filePath, 'utf-8');
}

/**
 * Load a prompt from Google Drive (for runtime customization)
 */
async function loadDrivePrompt(fileId: string): Promise<string> {
  return readFileContent(fileId);
}

/**
 * Replace template variables in a prompt
 */
function interpolatePrompt(template: string, context: PromptContext): string {
  return template
    .replace(/\{\{courseName\}\}/g, context.courseName)
    .replace(/\{\{level\}\}/g, context.level)
    .replace(/\{\{objective\}\}/g, context.objective)
    .replace(/\{\{topicName\}\}/g, context.topicName)
    .replace(/\{\{topicIndex\}\}/g, context.topicIndex || '')
    .replace(/\{\{topicDevelopment\}\}/g, context.topicDevelopment || '');
}

/**
 * Replace template variables for module generation
 */
function interpolateModuleGenerationPrompt(template: string, context: ModuleGenerationContext): string {
  return template.replace(/\{\{courseTitle\}\}/g, context.courseTitle);
}

/**
 * Replace template variables for module validation
 */
function interpolateModuleValidationPrompt(template: string, context: ModuleValidationContext): string {
  return template
    .replace(/\{\{courseTitle\}\}/g, context.courseTitle)
    .replace(/\{\{moduleList\}\}/g, context.moduleList);
}

/**
 * Load all default prompt templates (for the prompt editor UI)
 */
export function loadDefaultPrompts(): Record<string, string> {
  return {
    moduleGeneration: loadLocalPrompt('module-generation'),
    topicIndex: loadLocalPrompt('topic-index'),
    topicDevelopment: loadLocalPrompt('topic-development'),
  };
}

/**
 * Get the topic index generation prompt
 */
export function getTopicIndexPrompt(context: PromptContext, customTemplate?: string): string {
  const template = customTemplate || loadLocalPrompt('topic-index');
  return interpolatePrompt(template, context);
}

/**
 * Get the topic development generation prompt
 */
export function getTopicDevelopmentPrompt(context: PromptContext, customTemplate?: string): string {
  const template = customTemplate || loadLocalPrompt('topic-development');
  return interpolatePrompt(template, context);
}

/**
 * Get the voiceover script generation prompt
 */
export function getVoiceoverScriptPrompt(context: PromptContext): string {
  const template = loadLocalPrompt('voiceover-script');
  return interpolatePrompt(template, context);
}

/**
 * Get the module generation prompt (from course title)
 */
export function getModuleGenerationPrompt(context: ModuleGenerationContext, customTemplate?: string): string {
  const template = customTemplate || loadLocalPrompt('module-generation');
  return interpolateModuleGenerationPrompt(template, context);
}

/**
 * Get the module validation prompt
 */
export function getModuleValidationPrompt(context: ModuleValidationContext): string {
  const template = loadLocalPrompt('module-validation');
  return interpolateModuleValidationPrompt(template, context);
}

/**
 * Get the content review/improvement prompt
 */
export function getContentReviewPrompt(context: ContentReviewContext): string {
  const template = loadLocalPrompt('content-review');
  return template
    .replace(/\{\{courseName\}\}/g, context.courseName)
    .replace(/\{\{level\}\}/g, context.level)
    .replace(/\{\{topicName\}\}/g, context.topicName)
    .replace(/\{\{content\}\}/g, context.content);
}

/**
 * System prompt for content generation
 */
export const SYSTEM_PROMPT = `Eres un experto en diseño pedagógico y creación de contenido educativo para cursos online.
Tu trabajo es crear contenido de alta calidad que sea claro, estructurado y fácil de entender para estudiantes.
Siempre escribes en español, con un tono profesional pero cercano.
Nunca mencionas que eres una IA o que el contenido fue generado automáticamente.`;

/**
 * System prompt for module structure generation
 */
export const MODULE_GENERATION_SYSTEM_PROMPT = `Eres un arquitecto de cursos online con amplia experiencia en diseño instruccional.
Tu especialidad es crear estructuras de cursos coherentes, progresivas y pedagógicamente sólidas.
Siempre produces estructuras en formato JSON válido.
Respondes únicamente con el JSON solicitado, sin explicaciones adicionales.`;

/**
 * System prompt for content review and improvement
 */
export const CONTENT_REVIEW_SYSTEM_PROMPT = `Eres un editor senior de contenido educativo con experiencia en publicaciones académicas de primer nivel.
Tu trabajo es mejorar contenido educativo para que alcance estándares de calidad profesional.
Mantienes el estilo y estructura original, pero mejoras profundidad, ejemplos y claridad.
Nunca mencionas que eres una IA o que el contenido fue editado automáticamente.`;
