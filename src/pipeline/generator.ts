import { generateContent, generateJSON } from '../openai/client.js';
import {
  SYSTEM_PROMPT,
  CONTENT_REVIEW_SYSTEM_PROMPT,
  getTopicIndexPrompt,
  getTopicDevelopmentPrompt,
  getVoiceoverScriptPrompt,
  getContentReviewPrompt,
} from '../openai/prompts.js';
import type { PromptContext, ContentReviewContext } from '../openai/prompts.js';
import type { CourseSpec, Topic } from '../schemas/validator.js';

// Extended TopicIndex interface with new fields from improved prompt
export interface TopicIndex {
  topicTitle: string;
  introduction: string;
  learningObjectives?: string[];
  sections: Array<{
    number: string;
    title: string;
    purpose?: string;
    estimatedTime?: string;
    subsections?: Array<{
      number: string;
      title: string;
      keyPoints?: string[];
      practicalExample?: string;
    }>;
  }>;
  conclusion: string;
  estimatedDuration: string;
  prerequisites?: string;
  keyTerms?: string[];
}

export interface GeneratedContent {
  topicIndex: TopicIndex;
  topicIndexText: string;
  topicDevelopment: string;
  voiceoverScript: string;
}

/**
 * Generate all content for a single topic with multi-pass quality improvement
 */
export async function generateTopicContent(
  courseSpec: CourseSpec,
  topic: Topic,
  enableMultiPass: boolean = true,
  customPrompts?: { topicIndex?: string; topicDevelopment?: string }
): Promise<GeneratedContent> {
  const context: PromptContext = {
    courseName: courseSpec.courseName,
    level: courseSpec.level,
    objective: courseSpec.objective,
    topicName: topic.topicName,
  };

  console.log(`    📝 [Pass 1] Generating topic index...`);

  // Step 1: Generate topic index (JSON)
  const topicIndexPrompt = getTopicIndexPrompt(context, customPrompts?.topicIndex);
  const topicIndex = await generateJSON<TopicIndex>(SYSTEM_PROMPT, topicIndexPrompt, {
    maxTokens: 4096,
  });

  // Convert topic index to readable text for the development phase
  const topicIndexText = formatTopicIndexAsText(topicIndex);

  console.log(`    📝 [Pass 1] Generating topic development...`);

  // Step 2: Generate topic development (first pass)
  const developmentContext: PromptContext = {
    ...context,
    topicIndex: topicIndexText,
  };
  const topicDevelopmentPrompt = getTopicDevelopmentPrompt(developmentContext, customPrompts?.topicDevelopment);
  let topicDevelopment = await generateContent(SYSTEM_PROMPT, topicDevelopmentPrompt, {
    maxTokens: 8192,
  });

  // Step 2.5: Multi-pass improvement for topic development
  if (enableMultiPass) {
    console.log(`    🔄 [Pass 2] Reviewing and improving topic development...`);

    const reviewContext: ContentReviewContext = {
      courseName: courseSpec.courseName,
      level: courseSpec.level,
      topicName: topic.topicName,
      content: topicDevelopment,
    };

    const reviewPrompt = getContentReviewPrompt(reviewContext);
    topicDevelopment = await generateContent(CONTENT_REVIEW_SYSTEM_PROMPT, reviewPrompt, {
      maxTokens: 8192,
    });
  }

  console.log(`    📝 [Pass 1] Generating voiceover script...`);

  // Step 3: Generate voiceover script (first pass)
  const voiceoverContext: PromptContext = {
    ...context,
    topicDevelopment,
  };
  const voiceoverPrompt = getVoiceoverScriptPrompt(voiceoverContext);
  let voiceoverScript = await generateContent(SYSTEM_PROMPT, voiceoverPrompt, {
    maxTokens: 6144,
  });

  // Step 3.5: Multi-pass improvement for voiceover script
  if (enableMultiPass) {
    console.log(`    🔄 [Pass 2] Reviewing and improving voiceover script...`);

    const reviewContext: ContentReviewContext = {
      courseName: courseSpec.courseName,
      level: courseSpec.level,
      topicName: topic.topicName,
      content: voiceoverScript,
    };

    const reviewPrompt = getContentReviewPrompt(reviewContext);
    voiceoverScript = await generateContent(CONTENT_REVIEW_SYSTEM_PROMPT, reviewPrompt, {
      maxTokens: 6144,
    });
  }

  // Ensure voiceover ends with the required phrase
  const requiredEnding = 'Nos vemos en la siguiente clase.';
  let finalVoiceover = voiceoverScript.trim();
  if (!finalVoiceover.endsWith(requiredEnding)) {
    // Try to find and fix common variations
    finalVoiceover = finalVoiceover
      .replace(/Nos vemos en la siguiente clase$/i, requiredEnding)
      .replace(/Nos vemos en la próxima clase\.?$/i, requiredEnding);

    // If still not ending correctly, append it
    if (!finalVoiceover.endsWith(requiredEnding)) {
      finalVoiceover += `\n\n${requiredEnding}`;
    }
  }

  console.log(`    ✅ Content generation complete (${enableMultiPass ? 'multi-pass' : 'single-pass'})`);

  return {
    topicIndex,
    topicIndexText,
    topicDevelopment: cleanMarkdownToPlainText(topicDevelopment),
    voiceoverScript: cleanMarkdownToPlainText(finalVoiceover),
  };
}

/**
 * Format TopicIndex JSON as readable text for prompts
 */
function formatTopicIndexAsText(index: TopicIndex): string {
  let text = `TEMA: ${index.topicTitle}\n\n`;

  // Add learning objectives if present
  if (index.learningObjectives && index.learningObjectives.length > 0) {
    text += `OBJETIVOS DE APRENDIZAJE:\n`;
    for (const obj of index.learningObjectives) {
      text += `- ${obj}\n`;
    }
    text += '\n';
  }

  text += `INTRODUCCIÓN:\n${index.introduction}\n\n`;
  text += `CONTENIDO:\n\n`;

  for (const section of index.sections) {
    text += `${section.number}. ${section.title}`;
    if (section.purpose) {
      text += ` (Objetivo: ${section.purpose})`;
    }
    text += '\n';

    if (section.subsections) {
      for (const sub of section.subsections) {
        text += `   ${sub.number}. ${sub.title}\n`;
        if (sub.keyPoints) {
          for (const point of sub.keyPoints) {
            text += `      - ${point}\n`;
          }
        }
        if (sub.practicalExample) {
          text += `      [Ejemplo: ${sub.practicalExample}]\n`;
        }
      }
    }
    text += '\n';
  }

  text += `CONCLUSIÓN:\n${index.conclusion}\n\n`;

  if (index.keyTerms && index.keyTerms.length > 0) {
    text += `TÉRMINOS CLAVE: ${index.keyTerms.join(', ')}\n\n`;
  }

  text += `Duración estimada: ${index.estimatedDuration}`;
  if (index.prerequisites) {
    text += `\nPrerequisitos: ${index.prerequisites}`;
  }

  return text;
}

/**
 * Format TopicIndex as a structured document for Google Docs
 */
export function formatTopicIndexForDoc(index: TopicIndex): string {
  let doc = `ÍNDICE DEL TEMA\n`;
  doc += `═══════════════════════════════════════\n\n`;
  doc += `${index.topicTitle}\n\n`;

  // Add learning objectives if present
  if (index.learningObjectives && index.learningObjectives.length > 0) {
    doc += `OBJETIVOS DE APRENDIZAJE\n\n`;
    for (const obj of index.learningObjectives) {
      doc += `• ${obj}\n`;
    }
    doc += '\n';
  }

  doc += `INTRODUCCIÓN\n\n`;
  doc += `${index.introduction}\n\n`;
  doc += `CONTENIDO\n`;

  for (const section of index.sections) {
    doc += `\n${section.number}. ${section.title.toUpperCase()}\n`;
    if (section.purpose) {
      doc += `   Objetivo: ${section.purpose}\n`;
    }
    if (section.estimatedTime) {
      doc += `   Tiempo estimado: ${section.estimatedTime}\n`;
    }

    if (section.subsections) {
      doc += '\n';
      for (const sub of section.subsections) {
        doc += `   ${sub.number}. ${sub.title}\n`;
        if (sub.keyPoints) {
          for (const point of sub.keyPoints) {
            doc += `      • ${point}\n`;
          }
        }
        if (sub.practicalExample) {
          doc += `      → Ejemplo práctico: ${sub.practicalExample}\n`;
        }
        doc += '\n';
      }
    }
  }

  doc += `CONCLUSIÓN\n\n`;
  doc += `${index.conclusion}\n\n`;

  if (index.keyTerms && index.keyTerms.length > 0) {
    doc += `TÉRMINOS CLAVE\n\n`;
    doc += `${index.keyTerms.join(' • ')}\n\n`;
  }

  doc += `───────────────────────────────────────\n`;
  doc += `Duración estimada: ${index.estimatedDuration}\n`;
  if (index.prerequisites) {
    doc += `Prerequisitos: ${index.prerequisites}\n`;
  }

  return doc;
}

/**
 * Clean markdown formatting from text and convert to plain text
 */
export function cleanMarkdownToPlainText(text: string): string {
  return text
    // Remove markdown headers and convert to uppercase titles
    .replace(/^#{1,6}\s+(.+)$/gm, (_, title) => `${title.toUpperCase()}\n`)
    // Remove bold/italic markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.+?)`/g, '$1')
    // Clean up bullet points to use simple dashes
    .replace(/^[\*\-•]\s+/gm, '- ')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Remove emojis (common ones)
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
