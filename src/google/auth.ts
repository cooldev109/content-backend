import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/index.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

// Use redirect to localhost so Google shows the code in the browser URL bar
const REDIRECT_URI = 'http://localhost';

let oauth2Client: OAuth2Client | null = null;

function getTokenPath(): string {
  const credentialsPath = config.google.credentialsPath;
  const dir = dirname(credentialsPath);
  return resolve(dir, 'oauth-token.json');
}

function loadCredentials(): { client_id: string; client_secret: string } {
  const content = readFileSync(config.google.credentialsPath, 'utf-8');
  const credentials = JSON.parse(content);

  const key = credentials.installed || credentials.web;
  if (!key) {
    throw new Error('Invalid OAuth credentials file. Expected "installed" or "web" key.');
  }

  return {
    client_id: key.client_id,
    client_secret: key.client_secret,
  };
}

function saveToken(token: object): void {
  const tokenPath = getTokenPath();
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
  console.log(`Token saved to ${tokenPath}`);
}

function loadSavedToken(): object | null {
  const tokenPath = getTokenPath();
  if (existsSync(tokenPath)) {
    const content = readFileSync(tokenPath, 'utf-8');
    return JSON.parse(content);
  }
  return null;
}

export function deleteToken(): void {
  const tokenPath = getTokenPath();
  if (existsSync(tokenPath)) {
    unlinkSync(tokenPath);
    console.log('Token deleted.');
  }
  oauth2Client = null;
}

export function isAuthenticated(): boolean {
  return loadSavedToken() !== null;
}

function getOAuth2Client(): OAuth2Client {
  if (oauth2Client) {
    return oauth2Client;
  }

  const credentials = loadCredentials();

  oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    REDIRECT_URI
  );

  const savedToken = loadSavedToken();
  if (savedToken) {
    oauth2Client.setCredentials(savedToken as any);
    console.log('Using saved authentication token.');
  }

  return oauth2Client;
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveToken(tokens);
  console.log('Authentication successful!');
}

export async function getAuthClient(): Promise<OAuth2Client> {
  const client = getOAuth2Client();

  if (!isAuthenticated()) {
    throw new Error('Google authentication required. Please connect Google Drive first.');
  }

  return client;
}

export async function getDriveClient() {
  const auth = await getAuthClient();
  return google.drive({ version: 'v3', auth });
}

export async function getDocsClient() {
  const auth = await getAuthClient();
  return google.docs({ version: 'v1', auth });
}
