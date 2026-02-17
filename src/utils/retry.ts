import pRetry, { AbortError } from 'p-retry';

export interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 30000,
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return pRetry(fn, {
    retries: opts.retries,
    minTimeout: opts.minTimeout,
    maxTimeout: opts.maxTimeout,
    onFailedAttempt: (error) => {
      console.warn(
        `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
      );
      if (opts.onRetry) {
        opts.onRetry(error, error.attemptNumber);
      }
    },
  });
}

/**
 * Check if an error is retryable (rate limit or server error)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limit errors
    if (message.includes('429') || message.includes('rate limit')) {
      return true;
    }

    // Server errors (5xx)
    if (message.includes('500') || message.includes('502') ||
        message.includes('503') || message.includes('504')) {
      return true;
    }

    // Network errors
    if (message.includes('econnreset') || message.includes('etimedout') ||
        message.includes('network')) {
      return true;
    }
  }

  return false;
}

/**
 * Abort retry for non-retryable errors
 */
export function abortRetry(error: Error): never {
  throw new AbortError(error);
}
