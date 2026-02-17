import { getDriveClient } from './auth.js';
import { drive_v3 } from 'googleapis';
import mammoth from 'mammoth';

type DriveFile = drive_v3.Schema$File;

/**
 * Find a folder by name within a parent folder
 * Returns the folder if found, null otherwise
 */
export async function findFolder(
  name: string,
  parentId: string
): Promise<DriveFile | null> {
  const drive = await getDriveClient();

  const response = await drive.files.list({
    q: `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const files = response.data.files || [];
  return files.length > 0 ? files[0] : null;
}

/**
 * Create a folder within a parent folder
 */
export async function createFolder(
  name: string,
  parentId: string
): Promise<DriveFile> {
  const drive = await getDriveClient();

  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name',
  });

  return response.data;
}

/**
 * Find or create a folder (idempotent operation)
 * This ensures reruns don't create duplicates
 */
export async function findOrCreateFolder(
  name: string,
  parentId: string
): Promise<DriveFile> {
  const existing = await findFolder(name, parentId);
  if (existing) {
    console.log(`  📁 Found existing folder: ${name}`);
    return existing;
  }

  console.log(`  📁 Creating folder: ${name}`);
  return createFolder(name, parentId);
}

/**
 * Find a Google Doc by name within a parent folder
 */
export async function findDoc(
  name: string,
  parentId: string
): Promise<DriveFile | null> {
  const drive = await getDriveClient();

  const response = await drive.files.list({
    q: `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const files = response.data.files || [];
  return files.length > 0 ? files[0] : null;
}

/**
 * Create a Google Doc within a parent folder
 */
export async function createDoc(
  name: string,
  parentId: string
): Promise<DriveFile> {
  const drive = await getDriveClient();

  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
    },
    fields: 'id, name',
  });

  return response.data;
}

/**
 * Find or create a Google Doc (idempotent operation)
 */
export async function findOrCreateDoc(
  name: string,
  parentId: string
): Promise<DriveFile> {
  const existing = await findDoc(name, parentId);
  if (existing) {
    console.log(`    📝 Found existing doc: ${name}`);
    return existing;
  }

  console.log(`    📝 Creating doc: ${name}`);
  return createDoc(name, parentId);
}

/**
 * Read file content from Google Drive
 * Supports Google Docs (exports as plain text) and other files
 */
export async function readFileContent(fileId: string): Promise<string> {
  const drive = await getDriveClient();

  // First, get file metadata to check type
  const metadata = await drive.files.get({
    fileId,
    fields: 'mimeType, name',
  });

  const mimeType = metadata.data.mimeType;

  // For Google Docs, export as plain text
  if (mimeType === 'application/vnd.google-apps.document') {
    const response = await drive.files.export(
      {
        fileId,
        mimeType: 'text/plain',
      },
      { responseType: 'text' }
    );
    // Handle different response types
    if (typeof response.data === 'string') {
      return response.data;
    }
    // If it's a stream or object, convert to string
    if (response.data && typeof response.data === 'object') {
      return JSON.stringify(response.data);
    }
    return String(response.data || '');
  }

  // For Word documents (.docx), download and extract text using mammoth
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(response.data as ArrayBuffer);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // For other files, download content
  const response = await drive.files.get({
    fileId,
    alt: 'media',
  });

  return response.data as string;
}

/**
 * List all files in a folder
 */
export async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const drive = await getDriveClient();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    spaces: 'drive',
  });

  return response.data.files || [];
}
