/**
 * useProofStatus - React hook for tracking ZK proof generation status
 *
 * Provides state management for the multi-step proof generation process
 * including timing, retries, and error handling.
 */

import { useState, useCallback, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Proof generation status states
 */
export type ProofStatus =
  | "idle"
  | "preparing"
  | "generating"
  | "proving"
  | "submitting"
  | "complete"
  | "error"
  | "timeout"
  | "cancelled";

/**
 * Progress information for proof generation
 */
export interface ProofProgress {
  /** Current status */
  status: ProofStatus;

  /** Progress percentage (0-100) if available */
  percentage: number | null;

  /** Human-readable message for current stage */
  message: string;

  /** Time elapsed in milliseconds */
  elapsedMs: number;

  /** Estimated time remaining in milliseconds (if available) */
  estimatedRemainingMs: number | null;

  /** Current retry attempt (1-based) */
  attempt: number;

  /** Maximum retry attempts */
  maxAttempts: number;
}

/**
 * Error information for failed proof generation
 */
export interface ProofErrorInfo {
  /** Error code for programmatic handling */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Whether the error is retryable */
  retryable: boolean;

  /** Suggested action for the user */
  suggestion: string;

  /** Original error object (if available) */
  cause?: Error;
}

/**
 * Result of proof generation
 */
export interface ProofResult<T> {
  success: boolean;
  transaction?: T;
  error?: ProofErrorInfo;
  timing: {
    totalMs: number;
    attempts: number;
  };
}

/**
 * Configuration for proof generation
 */
export interface ProofConfig {
  /** Maximum time for proof generation in milliseconds */
  timeoutMs?: number;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Base delay for exponential backoff in milliseconds */
  retryDelayMs?: number;

  /** Callback for progress updates */
  onProgress?: (progress: ProofProgress) => void;
}

/**
 * Return type for useProofStatus hook
 */
export interface UseProofStatusReturn {
  /** Current proof status */
  status: ProofStatus;

  /** Current progress information */
  progress: ProofProgress;

  /** Error information (if status is "error") */
  error: ProofErrorInfo | null;

  /** Whether proof generation is in progress */
  isGenerating: boolean;

  /** Start proof generation with a transaction builder function */
  generateProof: <T>(
    buildTransaction: () => Promise<T>,
    config?: ProofConfig
  ) => Promise<ProofResult<T>>;

  /** Cancel ongoing proof generation */
  cancel: () => void;

  /** Reset to idle state */
  reset: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: Required<ProofConfig> = {
  timeoutMs: 60_000, // 60 seconds
  maxRetries: 3,
  retryDelayMs: 1_000,
  onProgress: () => {},
};

const STATUS_MESSAGES: Record<ProofStatus, string> = {
  idle: "Ready",
  preparing: "Preparing transaction...",
  generating: "Generating proof...",
  proving: "Creating zero-knowledge proof...",
  submitting: "Submitting to network...",
  complete: "Transaction complete",
  error: "An error occurred",
  timeout: "Proof generation timed out",
  cancelled: "Cancelled",
};

// Estimated durations for progress calculation (in milliseconds)
const STAGE_DURATIONS: Record<ProofStatus, number> = {
  idle: 0,
  preparing: 500,
  generating: 5_000,
  proving: 15_000,
  submitting: 2_000,
  complete: 0,
  error: 0,
  timeout: 0,
  cancelled: 0,
};

// =============================================================================
// Error Handling
// =============================================================================

function categorizeError(error: unknown): ProofErrorInfo {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message.toLowerCase();

  // User rejection
  if (message.includes("rejected") || message.includes("cancelled") || message.includes("denied")) {
    return {
      code: "USER_REJECTED",
      message: "Transaction was rejected",
      retryable: true,
      suggestion: "You can try again when ready",
      cause: err,
    };
  }

  // Timeout
  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      code: "TIMEOUT",
      message: "Proof generation timed out",
      retryable: true,
      suggestion: "The proof server may be busy. Please try again.",
      cause: err,
    };
  }

  // Proof server unavailable
  if (message.includes("proof server") || message.includes("localhost:6300") || message.includes("connection refused")) {
    return {
      code: "PROOF_SERVER_UNAVAILABLE",
      message: "Proof server is not running",
      retryable: false,
      suggestion: "Start the proof server with: docker run -p 6300:6300 midnightnetwork/proof-server",
      cause: err,
    };
  }

  // Witness error
  if (message.includes("witness") || err.name === "WitnessError") {
    return {
      code: "WITNESS_ERROR",
      message: "Failed to retrieve private data",
      retryable: false,
      suggestion: "Check that your wallet is connected and has the required data",
      cause: err,
    };
  }

  // Insufficient balance
  if (message.includes("insufficient") || message.includes("balance")) {
    return {
      code: "INSUFFICIENT_BALANCE",
      message: "Insufficient balance for this transaction",
      retryable: false,
      suggestion: "Add funds to your wallet before trying again",
      cause: err,
    };
  }

  // Circuit constraint failure
  if (message.includes("constraint") || message.includes("circuit")) {
    return {
      code: "CIRCUIT_ERROR",
      message: "Transaction validation failed",
      retryable: false,
      suggestion: "The transaction inputs may be invalid. Please check and try again.",
      cause: err,
    };
  }

  // Network error
  if (message.includes("network") || message.includes("fetch")) {
    return {
      code: "NETWORK_ERROR",
      message: "Network connection error",
      retryable: true,
      suggestion: "Check your internet connection and try again",
      cause: err,
    };
  }

  // Generic error
  return {
    code: "UNKNOWN_ERROR",
    message: err.message || "An unexpected error occurred",
    retryable: true,
    suggestion: "Please try again. If the problem persists, contact support.",
    cause: err,
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useProofStatus(): UseProofStatusReturn {
  const [status, setStatus] = useState<ProofStatus>("idle");
  const [progress, setProgress] = useState<ProofProgress>({
    status: "idle",
    percentage: null,
    message: STATUS_MESSAGES.idle,
    elapsedMs: 0,
    estimatedRemainingMs: null,
    attempt: 1,
    maxAttempts: DEFAULT_CONFIG.maxRetries,
  });
  const [error, setError] = useState<ProofErrorInfo | null>(null);

  const cancelRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update progress with timing
  const updateProgress = useCallback(
    (
      newStatus: ProofStatus,
      attempt: number,
      maxAttempts: number,
      onProgress?: (progress: ProofProgress) => void
    ) => {
      const elapsed = Date.now() - startTimeRef.current;

      // Calculate estimated progress based on stage
      const totalEstimated = Object.values(STAGE_DURATIONS).reduce((a, b) => a + b, 0);
      const stagesComplete = Object.entries(STAGE_DURATIONS)
        .filter(([s]) => {
          const stages: ProofStatus[] = ["preparing", "generating", "proving", "submitting"];
          const currentIdx = stages.indexOf(newStatus);
          const stageIdx = stages.indexOf(s as ProofStatus);
          return stageIdx < currentIdx && stageIdx >= 0;
        })
        .reduce((sum, [, duration]) => sum + duration, 0);

      const percentage = Math.min(
        Math.round((stagesComplete / totalEstimated) * 100),
        95
      );

      const newProgress: ProofProgress = {
        status: newStatus,
        percentage: newStatus === "complete" ? 100 : percentage,
        message: STATUS_MESSAGES[newStatus],
        elapsedMs: elapsed,
        estimatedRemainingMs:
          newStatus === "complete" ? 0 : Math.max(0, totalEstimated - elapsed),
        attempt,
        maxAttempts,
      };

      setProgress(newProgress);
      setStatus(newStatus);
      onProgress?.(newProgress);
    },
    []
  );

  // Start elapsed time tracker
  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setProgress((prev) => ({
        ...prev,
        elapsedMs: Date.now() - startTimeRef.current,
      }));
    }, 100);
  }, []);

  // Stop elapsed time tracker
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Generate proof with retries
  const generateProof = useCallback(
    async <T>(
      buildTransaction: () => Promise<T>,
      config?: ProofConfig
    ): Promise<ProofResult<T>> => {
      const finalConfig = { ...DEFAULT_CONFIG, ...config };
      cancelRef.current = false;
      startTimer();
      setError(null);

      let lastError: ProofErrorInfo | null = null;

      for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
        if (cancelRef.current) {
          stopTimer();
          updateProgress("cancelled", attempt, finalConfig.maxRetries, finalConfig.onProgress);
          return {
            success: false,
            error: { code: "CANCELLED", message: "Cancelled by user", retryable: true, suggestion: "" },
            timing: { totalMs: Date.now() - startTimeRef.current, attempts: attempt },
          };
        }

        try {
          // Stage 1: Preparing
          updateProgress("preparing", attempt, finalConfig.maxRetries, finalConfig.onProgress);

          // Stage 2: Generating
          updateProgress("generating", attempt, finalConfig.maxRetries, finalConfig.onProgress);

          // Create timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("Proof generation timed out")),
              finalConfig.timeoutMs
            );
          });

          // Race transaction building against timeout
          const transaction = await Promise.race([
            buildTransaction(),
            timeoutPromise,
          ]);

          if (cancelRef.current) {
            throw new Error("Cancelled");
          }

          // Stage 3: Proving
          updateProgress("proving", attempt, finalConfig.maxRetries, finalConfig.onProgress);

          // Stage 4: Submitting
          updateProgress("submitting", attempt, finalConfig.maxRetries, finalConfig.onProgress);

          // Stage 5: Complete
          stopTimer();
          updateProgress("complete", attempt, finalConfig.maxRetries, finalConfig.onProgress);

          return {
            success: true,
            transaction,
            timing: {
              totalMs: Date.now() - startTimeRef.current,
              attempts: attempt,
            },
          };
        } catch (err) {
          lastError = categorizeError(err);

          // Don't retry non-retryable errors or user rejections
          if (!lastError.retryable || lastError.code === "USER_REJECTED") {
            stopTimer();
            setError(lastError);
            updateProgress("error", attempt, finalConfig.maxRetries, finalConfig.onProgress);

            return {
              success: false,
              error: lastError,
              timing: {
                totalMs: Date.now() - startTimeRef.current,
                attempts: attempt,
              },
            };
          }

          // Wait before retry (exponential backoff)
          if (attempt < finalConfig.maxRetries) {
            const delay = finalConfig.retryDelayMs * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries exhausted
      stopTimer();
      if (lastError) {
        setError(lastError);
        updateProgress(
          lastError.code === "TIMEOUT" ? "timeout" : "error",
          finalConfig.maxRetries,
          finalConfig.maxRetries,
          finalConfig.onProgress
        );
      }

      return {
        success: false,
        error: lastError ?? {
          code: "UNKNOWN_ERROR",
          message: "Proof generation failed",
          retryable: true,
          suggestion: "Please try again",
        },
        timing: {
          totalMs: Date.now() - startTimeRef.current,
          attempts: finalConfig.maxRetries,
        },
      };
    },
    [startTimer, stopTimer, updateProgress]
  );

  // Cancel ongoing proof generation
  const cancel = useCallback(() => {
    cancelRef.current = true;
    stopTimer();
  }, [stopTimer]);

  // Reset to idle state
  const reset = useCallback(() => {
    cancelRef.current = false;
    stopTimer();
    setStatus("idle");
    setError(null);
    setProgress({
      status: "idle",
      percentage: null,
      message: STATUS_MESSAGES.idle,
      elapsedMs: 0,
      estimatedRemainingMs: null,
      attempt: 1,
      maxAttempts: DEFAULT_CONFIG.maxRetries,
    });
  }, [stopTimer]);

  return {
    status,
    progress,
    error,
    isGenerating: ["preparing", "generating", "proving", "submitting"].includes(status),
    generateProof,
    cancel,
    reset,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format elapsed time for display
 */
export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get progress bar color based on status
 */
export function getProgressColor(status: ProofStatus): string {
  switch (status) {
    case "complete":
      return "#10b981"; // Green
    case "error":
    case "timeout":
      return "#ef4444"; // Red
    case "cancelled":
      return "#6b7280"; // Gray
    default:
      return "#6366f1"; // Indigo
  }
}
