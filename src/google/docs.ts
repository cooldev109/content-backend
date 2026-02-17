import { getDocsClient } from './auth.js';
import { docs_v1 } from 'googleapis';

/**
 * Write content to a Google Doc
 * Clears existing content and writes new content
 */
export async function writeDocContent(
  docId: string,
  content: string
): Promise<void> {
  const docs = await getDocsClient();

  // First, get the current document to find the end index
  const doc = await docs.documents.get({ documentId: docId });
  const body = doc.data.body;
  const endIndex = body?.content?.[body.content.length - 1]?.endIndex || 1;

  const requests: docs_v1.Schema$Request[] = [];

  // Delete existing content (if any beyond the initial newline)
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: endIndex - 1,
        },
      },
    });
  }

  // Insert new content
  requests.push({
    insertText: {
      location: { index: 1 },
      text: content,
    },
  });

  // Execute batch update
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests },
  });
}

/**
 * Read content from a Google Doc
 */
export async function readDocContent(docId: string): Promise<string> {
  const docs = await getDocsClient();

  const doc = await docs.documents.get({ documentId: docId });
  const content = doc.data.body?.content || [];

  let text = '';
  for (const element of content) {
    if (element.paragraph?.elements) {
      for (const elem of element.paragraph.elements) {
        if (elem.textRun?.content) {
          text += elem.textRun.content;
        }
      }
    }
  }

  return text;
}

/**
 * Write structured content to a Google Doc with formatting
 * Supports basic heading and paragraph formatting
 */
export async function writeFormattedDocContent(
  docId: string,
  sections: Array<{ type: 'heading' | 'paragraph'; text: string; level?: number }>
): Promise<void> {
  const docs = await getDocsClient();

  // First clear the document
  const doc = await docs.documents.get({ documentId: docId });
  const body = doc.data.body;
  const endIndex = body?.content?.[body.content.length - 1]?.endIndex || 1;

  const requests: docs_v1.Schema$Request[] = [];

  // Delete existing content
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: endIndex - 1,
        },
      },
    });
  }

  // Build content string and track positions for formatting
  let fullText = '';
  const formatRanges: Array<{
    start: number;
    end: number;
    type: 'heading' | 'paragraph';
    level?: number;
  }> = [];

  for (const section of sections) {
    const start = fullText.length + 1; // +1 because doc starts at index 1
    const text = section.text + '\n';
    fullText += text;
    const end = fullText.length + 1;

    formatRanges.push({
      start,
      end,
      type: section.type,
      level: section.level,
    });
  }

  // Insert all text
  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });

  // Apply formatting
  for (const range of formatRanges) {
    if (range.type === 'heading') {
      const headingType = `HEADING_${range.level || 1}` as docs_v1.Schema$ParagraphStyle['namedStyleType'];
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: range.start,
            endIndex: range.end,
          },
          paragraphStyle: {
            namedStyleType: headingType,
          },
          fields: 'namedStyleType',
        },
      });
    }
  }

  // Execute batch update
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests },
  });
}
