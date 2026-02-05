/**
 * useTxSubmit - React hook for transaction submission in Midnight DApps
 *
 * Provides state management for the complete transaction lifecycle with
 * loading states, error handling, and retry support.
 */

import { useState, useCallback, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Transaction submission status
 */
export type TxSubmitStatus =
  | "idle"
  | "building"
  | "proving"
  | "submitting"
  | "success"
  | "error";

/**
 * Error information for failed submissions
 */
export interface TxSubmitError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the error can be retried */
  retryable: boolean;
  /** Suggested action for the user */
  suggestion: string;
}

/**
 * State returned by the useTxSubmit hook
 */
export interface TxSubmitState {
  /** Current submission status */
  status: TxSubmitStatus;
  /** Transaction hash if successful */
  txHash: string | null;
  /** Error information if failed */
  error: TxSubmitError | null;
  /** Whether a submission is in progress */
  isSubmitting: boolean;
  /** Time elapsed during current submission (ms) */
  elapsedMs: number;
  /** Current attempt number (1-based) */
  attempt: number;
}

/**
 * Configuration for useTxSubmit hook
 */
export interface UseTxSubmitConfig {
  /** Timeout for proof generation in milliseconds (default: 60000) */
  proofTimeoutMs?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for retry backoff in milliseconds (default: 1000) */
  retryDelayMs?: number;
  /** Callback when submission succeeds */
  onSuccess?: (txHash: string) => void;
  /** Callback when submission fails */
  onError?: (error: TxSubmitError) => void;
}

/**
 * Return type for useTxSubmit hook
 */
export interface UseTxSubmitReturn extends TxSubmitState {
  /** Submit a transaction */
  submit: (buildTx: () => Promise<unknown>) => Promise<string | null>;
  /** Submit with automatic retry */
  submitWithRetry: (buildTx: () => Promise<unknown>) => Promise<string | null>;
  /** Reset to idle state */
  reset: () => void;
  /** Cancel ongoing submission */
  cancel: () => void;
}

/**
 * Wallet API interface (subset of DApp Connector API)
 */
export interface WalletAPI {
  balanceAndProveTransaction: (
    tx: unknown,
    newCoins: unknown[]
  ) => Promise<unknown>;
  submitTransaction: (provenTx: unknown) => Promise<string>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: Required<Omit<UseTxSubmitConfig, "onSuccess" | "onError">> = {
  proofTimeoutMs: 60_000,
  maxRetries: 3,
  retryDelayMs: 1_000,
};

const STATUS_MESSAGES: Record<TxSubmitStatus, string> = {
  idle: "Ready to submit",
  building: "Building transaction...",
  proving: "Generating proof (15-30 seconds)...",
  submitting: "Submitting to network...",
  success: "Transaction submitted!",
  error: "Submission failed",
};

// =============================================================================
// Error Categorization
// =============================================================================

function categorizeError(error: unknown): TxSubmitError {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message.toLowerCase();

  if (
    message.includes("rejected") ||
    message.includes("cancelled") ||
    message.includes("denied")
  ) {
    return {
      code: "USER_REJECTED",
      message: "Transaction was cancelled",
      retryable: true,
      suggestion: "You can try again when ready",
    };
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      code: "TIMEOUT",
      message: "Proof generation timed out",
      retryable: true,
      suggestion: "The proof server may be busy. Please try again.",
    };
  }

  if (
    message.includes("proof server") ||
    message.includes("localhost:6300") ||
    message.includes("connection refused")
  ) {
    return {
      code: "PROOF_SERVER_UNAVAILABLE",
      message: "Proof server is not running",
      retryable: false,
      suggestion:
        "Start the proof server with: docker run -p 6300:6300 midnightnetwork/proof-server",
    };
  }

  if (message.includes("insufficient") || message.includes("balance")) {
    return {
      code: "INSUFFICIENT_BALANCE",
      message: "Insufficient balance for this transaction",
      retryable: false,
      suggestion: "Add funds to your wallet before trying again",
    };
  }

  if (message.includes("constraint") || message.includes("circuit")) {
    return {
      code: "CIRCUIT_ERROR",
      message: "Transaction validation failed",
      retryable: false,
      suggestion: "Please check your inputs and try again",
    };
  }

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("failed to fetch")
  ) {
    return {
      code: "NETWORK_ERROR",
      message: "Network connection error",
      retryable: true,
      suggestion: "Check your internet connection and try again",
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: err.message || "An unexpected error occurred",
    retryable: true,
    suggestion: "Please try again. If the problem persists, contact support.",
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for transaction submission
 *
 * @param walletAPI - Connected wallet API instance
 * @param config - Optional configuration
 * @returns Hook state and actions
 *
 * @example
 * ```tsx
 * function TransferButton({ recipient, amount }) {
 *   const walletAPI = useWalletAPI();
 *   const { status, error, isSubmitting, submit } = useTxSubmit(walletAPI, {
 *     onSuccess: (hash) => console.log('Submitted:', hash),
 *     onError: (err) => console.error('Failed:', err.message),
 *   });
 *
 *   const handleClick = () => {
 *     submit(() => contract.callTx.transfer(recipient, amount, witnesses));
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleClick} disabled={isSubmitting}>
 *         {isSubmitting ? `${status}...` : 'Transfer'}
 *       </button>
 *       {error && <p style={{ color: 'red' }}>{error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTxSubmit(
  walletAPI: WalletAPI | null,
  config: UseTxSubmitConfig = {}
): UseTxSubmitReturn {
  const { proofTimeoutMs, maxRetries, retryDelayMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const { onSuccess, onError } = config;

  // State
  const [status, setStatus] = useState<TxSubmitStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<TxSubmitError | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [attempt, setAttempt] = useState(1);

  // Refs for cleanup
  const cancelRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start elapsed timer
  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
  }, []);

  // Stop elapsed timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    cancelRef.current = false;
    stopTimer();
    setStatus("idle");
    setTxHash(null);
    setError(null);
    setElapsedMs(0);
    setAttempt(1);
  }, [stopTimer]);

  // Cancel submission
  const cancel = useCallback(() => {
    cancelRef.current = true;
    stopTimer();
    setStatus("idle");
  }, [stopTimer]);

  // Single submission attempt
  const submitOnce = useCallback(
    async (buildTx: () => Promise<unknown>): Promise<string | null> => {
      if (!walletAPI) {
        const err: TxSubmitError = {
          code: "NO_WALLET",
          message: "Wallet not connected",
          retryable: false,
          suggestion: "Please connect your wallet first",
        };
        setError(err);
        setStatus("error");
        onError?.(err);
        return null;
      }

      cancelRef.current = false;
      setError(null);
      startTimer();

      try {
        // Build phase
        setStatus("building");
        if (cancelRef.current) throw new Error("Cancelled");

        const tx = await buildTx();

        // Prove phase (with timeout)
        setStatus("proving");
        if (cancelRef.current) throw new Error("Cancelled");

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("Proof generation timed out")),
            proofTimeoutMs
          );
        });

        const provenTx = await Promise.race([
          walletAPI.balanceAndProveTransaction(tx, []),
          timeoutPromise,
        ]);

        // Submit phase
        setStatus("submitting");
        if (cancelRef.current) throw new Error("Cancelled");

        const hash = await walletAPI.submitTransaction(provenTx);

        // Success
        stopTimer();
        setTxHash(hash);
        setStatus("success");
        onSuccess?.(hash);

        return hash;
      } catch (err) {
        stopTimer();
        const txError = categorizeError(err);
        setError(txError);
        setStatus("error");
        onError?.(txError);
        return null;
      }
    },
    [walletAPI, proofTimeoutMs, onSuccess, onError, startTimer, stopTimer]
  );

  // Submit with retry
  const submitWithRetry = useCallback(
    async (buildTx: () => Promise<unknown>): Promise<string | null> => {
      for (let i = 1; i <= maxRetries; i++) {
        setAttempt(i);

        const result = await submitOnce(buildTx);

        if (result) {
          return result;
        }

        // Check if we should retry
        const currentError = error;
        if (!currentError?.retryable) {
          return null;
        }

        // Don't retry user rejection
        if (currentError.code === "USER_REJECTED") {
          return null;
        }

        // Wait before retry (exponential backoff)
        if (i < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, i - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      return null;
    },
    [submitOnce, maxRetries, retryDelayMs, error]
  );

  // Simple submit (no retry)
  const submit = useCallback(
    async (buildTx: () => Promise<unknown>): Promise<string | null> => {
      setAttempt(1);
      return submitOnce(buildTx);
    },
    [submitOnce]
  );

  return {
    // State
    status,
    txHash,
    error,
    isSubmitting: ["building", "proving", "submitting"].includes(status),
    elapsedMs,
    attempt,

    // Actions
    submit,
    submitWithRetry,
    reset,
    cancel,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a human-readable message for the current status
 */
export function getStatusMessage(status: TxSubmitStatus): string {
  return STATUS_MESSAGES[status];
}

/**
 * Format elapsed time for display
 */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get status indicator color
 */
export function getStatusColor(status: TxSubmitStatus): string {
  switch (status) {
    case "success":
      return "#10b981"; // Green
    case "error":
      return "#ef4444"; // Red
    case "building":
    case "proving":
    case "submitting":
      return "#6366f1"; // Indigo
    default:
      return "#6b7280"; // Gray
  }
}
