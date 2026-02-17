/**
 * Simple logger utility
 * Logs are written to console and can be extended for file logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function debug(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.debug('[DEBUG]', ...args);
  }
}

export function info(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.INFO) {
    console.log('[INFO]', ...args);
  }
}

export function warn(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.WARN) {
    console.warn('[WARN]', ...args);
  }
}

export function error(...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.ERROR) {
    console.error('[ERROR]', ...args);
  }
}

/**
 * Redact sensitive values from logs
 */
export function redact(value: string, showChars: number = 4): string {
  if (value.length <= showChars * 2) {
    return '***';
  }
  return value.slice(0, showChars) + '***' + value.slice(-showChars);
}

/**
 * Create a log entry for the run report
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: unknown;
}

const logEntries: LogEntry[] = [];

export function addLogEntry(level: string, message: string, data?: unknown): void {
  logEntries.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  });
}

export function getLogEntries(): LogEntry[] {
  return [...logEntries];
}

export function clearLogEntries(): void {
  logEntries.length = 0;
}
