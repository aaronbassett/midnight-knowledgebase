/**
 * retryWithBackoff - Exponential backoff retry utility for Midnight DApps
 *
 * Provides robust retry logic with configurable backoff, jitter, and
 * intelligent error handling for transient failures.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffFactor?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Function to determine if an error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value if successful */
  value?: T;
  /** The final error if failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Total time elapsed in milliseconds */
  totalTimeMs: number;
}

/**
 * Retry statistics for monitoring
 */
export interface RetryStats {
  /** Total retries across all operations */
  totalRetries: number;
  /** Total successful operations */
  successCount: number;
  /** Total failed operations */
  failureCount: number;
  /** Average attempts per successful operation */
  avgAttemptsOnSuccess: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<Omit<RetryConfig, "onRetry" | "signal" | "isRetryable">> = {
  maxRetries: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffFactor: 2,
  jitter: true,
};

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Default function to determine if an error is retryable
 *
 * Retryable errors:
 * - Network errors (connection, timeout)
 * - Server errors (5xx)
 * - Rate limiting
 *
 * Non-retryable errors:
 * - User rejection
 * - Validation errors
 * - Insufficient balance
 * - Circuit constraint failures
 */
export function defaultIsRetryable(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Non-retryable errors
  const nonRetryable = [
    "rejected",
    "cancelled",
    "denied",
    "insufficient",
    "balance",
    "constraint",
    "circuit",
    "invalid",
    "unauthorized",
    "forbidden",
  ];

  if (nonRetryable.some((term) => message.includes(term))) {
    return false;
  }

  // Retryable errors
  const retryable = [
    "timeout",
    "network",
    "connection",
    "econnreset",
    "econnrefused",
    "socket",
    "fetch",
    "5",
    "rate limit",
    "too many requests",
    "temporarily unavailable",
  ];

  return retryable.some((term) => message.includes(term));
}

/**
 * Error codes that are always retryable
 */
export const RETRYABLE_ERROR_CODES = new Set([
  "TIMEOUT",
  "NETWORK_ERROR",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ERR_NETWORK",
  "RATE_LIMITED",
]);

/**
 * Error codes that are never retryable
 */
export const NON_RETRYABLE_ERROR_CODES = new Set([
  "USER_REJECTED",
  "INSUFFICIENT_BALANCE",
  "CIRCUIT_ERROR",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

// =============================================================================
// Core Implementation
// =============================================================================

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateDelay(
  attempt: number,
  config: Required<Omit<RetryConfig, "onRetry" | "signal" | "isRetryable">>
): number {
  const { initialDelayMs, maxDelayMs, backoffFactor, jitter } = config;

  // Exponential backoff: delay = initial * (factor ^ attempt)
  const exponentialDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (0.5x to 1.5x)
  if (jitter) {
    const jitterFactor = 0.5 + Math.random();
    return Math.floor(cappedDelay * jitterFactor);
  }

  return Math.floor(cappedDelay);
}

/**
 * Sleep for a specified duration with optional abort signal
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Aborted"));
    });
  });
}

/**
 * Execute an operation with exponential backoff retry
 *
 * @param operation - Async function to execute
 * @param config - Optional retry configuration
 * @returns Promise resolving to the retry result
 *
 * @example
 * ```typescript
 * // Simple usage
 * const result = await retryWithBackoff(
 *   () => submitTransaction(tx),
 *   { maxRetries: 3 }
 * );
 *
 * if (result.success) {
 *   console.log('Submitted:', result.value);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With callbacks and custom retry logic
 * const result = await retryWithBackoff(
 *   () => submitTransaction(tx),
 *   {
 *     maxRetries: 5,
 *     initialDelayMs: 2000,
 *     isRetryable: (error) => error.message.includes('timeout'),
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} in ${delay}ms: ${error.message}`);
 *     },
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<RetryResult<T>> {
  const finalConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const isRetryable = config.isRetryable ?? defaultIsRetryable;
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
    try {
      // Check for abort before each attempt
      if (config.signal?.aborted) {
        return {
          success: false,
          error: new Error("Aborted"),
          attempts: attempt - 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      const value = await operation();

      return {
        success: true,
        value,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is the last attempt
      if (attempt > finalConfig.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryable(lastError)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Calculate delay
      const delay = calculateDelay(attempt, finalConfig);

      // Call retry callback
      config.onRetry?.(attempt, lastError, delay);

      // Wait before retrying
      try {
        await sleep(delay, config.signal);
      } catch (abortError) {
        return {
          success: false,
          error: new Error("Aborted"),
          attempts: attempt,
          totalTimeMs: Date.now() - startTime,
        };
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: finalConfig.maxRetries + 1,
    totalTimeMs: Date.now() - startTime,
  };
}

// =============================================================================
// Specialized Retry Functions
// =============================================================================

/**
 * Retry with linear backoff (constant delay between attempts)
 */
export async function retryWithLinearBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<RetryResult<T>> {
  return retryWithBackoff(operation, {
    maxRetries,
    initialDelayMs: delayMs,
    backoffFactor: 1, // No exponential increase
    jitter: false,
  });
}

/**
 * Retry immediately without delay (for transient errors)
 */
export async function retryImmediate<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<RetryResult<T>> {
  return retryWithBackoff(operation, {
    maxRetries,
    initialDelayMs: 0,
    backoffFactor: 1,
    jitter: false,
  });
}

/**
 * Retry with custom delays for each attempt
 */
export async function retryWithCustomDelays<T>(
  operation: () => Promise<T>,
  delays: number[]
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const value = await operation();
      return {
        success: true,
        value,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= delays.length) {
        break;
      }

      if (!defaultIsRetryable(lastError)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      await sleep(delays[attempt]);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: delays.length + 1,
    totalTimeMs: Date.now() - startTime,
  };
}

// =============================================================================
// Transaction-Specific Retry
// =============================================================================

/**
 * Retry configuration optimized for Midnight transactions
 */
export const TX_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
  backoffFactor: 2,
  jitter: true,
  isRetryable: (error) => {
    const message = error.message.toLowerCase();

    // Never retry these
    if (
      message.includes("rejected") ||
      message.includes("insufficient") ||
      message.includes("circuit") ||
      message.includes("constraint")
    ) {
      return false;
    }

    // Always retry these
    if (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("connection")
    ) {
      return true;
    }

    // Default to retry for unknown errors
    return true;
  },
};

/**
 * Retry a transaction submission with Midnight-optimized settings
 */
export async function retryTransaction<T>(
  submitTx: () => Promise<T>,
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<RetryResult<T>> {
  return retryWithBackoff(submitTx, {
    ...TX_RETRY_CONFIG,
    onRetry,
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a retry wrapper for a function
 */
export function withRetry<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  config: RetryConfig = {}
): (...args: T) => Promise<RetryResult<R>> {
  return async (...args: T): Promise<RetryResult<R>> => {
    return retryWithBackoff(() => fn(...args), config);
  };
}

/**
 * Create an abort controller with timeout
 */
export function createTimeoutAbort(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

/**
 * Format retry result for logging
 */
export function formatRetryResult<T>(result: RetryResult<T>): string {
  if (result.success) {
    return `Success after ${result.attempts} attempt(s) in ${result.totalTimeMs}ms`;
  }
  return `Failed after ${result.attempts} attempt(s) in ${result.totalTimeMs}ms: ${result.error?.message}`;
}
