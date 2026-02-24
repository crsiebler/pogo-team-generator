import { syncConfig } from './config';
import { RetryOptions, RateLimitOptions, SyncError } from './types';

/**
 * Default retry options for sync operations
 */
export function getDefaultRetryOptions(): RetryOptions {
  const isLocal = syncConfig.localMode ?? false;
  return {
    maxAttempts: Infinity, // unlimited until success
    baseDelay: isLocal ? 200 : 1000, // 200ms local, 1000ms production
    maxDelay: isLocal ? 5000 : 30000, // 5s local, 30s production
    backoffFactor: isLocal ? 1.5 : 2, // gentler backoff for local
  };
}

/**
 * Default rate limiting options
 */
export function getDefaultRateLimitOptions(): RateLimitOptions {
  const isLocal = syncConfig.localMode ?? false;
  return {
    minDelay: isLocal ? 100 : 1000, // 100ms local, 1000ms production
  };
}

/**
 * Sleep for the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context = 'operation',
): Promise<T> {
  const opts = { ...getDefaultRetryOptions(), ...options };
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt < opts.maxAttempts) {
    try {
      attempt++;
      console.log(
        `[${context}] Attempt ${attempt}/${opts.maxAttempts === Infinity ? '∞' : opts.maxAttempts}`,
      );

      const result = await operation();
      console.log(`[${context}] Success on attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError instanceof SyncError && !lastError.recoverable) {
        console.error(`[${context}] Unrecoverable error: ${lastError.message}`);
        throw lastError;
      }

      console.warn(
        `[${context}] Attempt ${attempt} failed: ${lastError.message}`,
      );

      if (attempt < opts.maxAttempts) {
        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffFactor, attempt - 1),
          opts.maxDelay,
        );
        console.log(`[${context}] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  console.error(`[${context}] All ${opts.maxAttempts} attempts failed`);
  throw new SyncError(
    `Operation failed after ${opts.maxAttempts} attempts`,
    context,
    lastError,
    false,
  );
}

/**
 * Rate limiting wrapper to ensure minimum delays between operations
 */
let lastOperationTime = 0;

export async function withRateLimit<T>(
  operation: () => Promise<T>,
  options: Partial<RateLimitOptions> = {},
  context = 'operation',
): Promise<T> {
  const opts = { ...getDefaultRateLimitOptions(), ...options };
  const now = Date.now();
  const timeSinceLast = now - lastOperationTime;

  if (timeSinceLast < opts.minDelay) {
    const waitTime = opts.minDelay - timeSinceLast;
    console.log(`[${context}] Rate limiting: waiting ${waitTime}ms`);
    await sleep(waitTime);
  }

  lastOperationTime = Date.now();
  return operation();
}

/**
 * Combine retry and rate limiting for HTTP requests
 */
export async function withRetryAndRateLimit<T>(
  operation: () => Promise<T>,
  retryOptions: Partial<RetryOptions> = {},
  rateLimitOptions: Partial<RateLimitOptions> = {},
  context = 'http-request',
): Promise<T> {
  return withRetry(
    () => withRateLimit(operation, rateLimitOptions, context),
    retryOptions,
    context,
  );
}

/**
 * Enhanced error logging with context
 */
export function logError(
  error: Error,
  context: string,
  additionalInfo?: Record<string, unknown>,
): void {
  console.error(`[${context}] Error: ${error.message}`);
  if (error.cause) {
    console.error(`[${context}] Cause: ${error.cause}`);
  }
  if (additionalInfo) {
    console.error(`[${context}] Additional info:`, additionalInfo);
  }
  if (error.stack) {
    console.error(`[${context}] Stack trace:`, error.stack);
  }
}
