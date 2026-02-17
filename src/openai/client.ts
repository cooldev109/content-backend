import OpenAI from 'openai';
import { config } from '../config/index.js';
import pRetry from 'p-retry';

let openaiClient: OpenAI | null = null;

/**
 * Get OpenAI client instance
 */
export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openaiClient;
}

export interface GenerationOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  model: 'gpt-4o',
  maxTokens: 8192,
  temperature: 0.6,
};

/**
 * Generate content using OpenAI with retry logic
 */
export async function generateContent(
  systemPrompt: string,
  userPrompt: string,
  options: GenerationOptions = {}
): Promise<string> {
  const client = getOpenAIClient();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const response = await pRetry(
    async () => {
      const completion = await client.chat.completions.create({
        model: opts.model!,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      return content;
    },
    {
      retries: 3,
      onFailedAttempt: (error) => {
        console.warn(
          `  ⚠️ OpenAI attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
        );
      },
    }
  );

  return response;
}

/**
 * Generate JSON content with validation
 */
export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  options: GenerationOptions = {}
): Promise<T> {
  const jsonSystemPrompt = `${systemPrompt}

IMPORTANT: You must respond with valid JSON only. No additional text, no markdown code blocks, just pure JSON.`;

  const content = await generateContent(jsonSystemPrompt, userPrompt, {
    ...options,
    temperature: 0.3, // Lower temperature for more consistent JSON
  });

  // Clean up potential markdown formatting
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```json')) {
    cleanContent = cleanContent.slice(7);
  }
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.slice(3);
  }
  if (cleanContent.endsWith('```')) {
    cleanContent = cleanContent.slice(0, -3);
  }
  cleanContent = cleanContent.trim();

  try {
    return JSON.parse(cleanContent) as T;
  } catch (error) {
    console.error('Failed to parse JSON response:', cleanContent);
    throw new Error(`Invalid JSON response from OpenAI: ${error}`);
  }
}
