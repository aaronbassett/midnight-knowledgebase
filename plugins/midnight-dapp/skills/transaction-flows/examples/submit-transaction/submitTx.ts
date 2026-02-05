/**
 * submitTx - Complete transaction submission flow for Midnight DApps
 *
 * Handles the full lifecycle: build -> prove -> submit with proper
 * error handling, timeouts, and status callbacks.
 */

import type { WitnessContext } from "@midnight-ntwrk/midnight-js-types";

// =============================================================================
// Types
// =============================================================================

/**
 * Transaction status throughout the lifecycle
 */
export type TxStatus =
  | "idle"
  | "building"
  | "proving"
  | "submitting"
  | "submitted"
  | "error";

/**
 * Error codes for transaction submission
 */
export const TxErrorCode = {
  USER_REJECTED: "USER_REJECTED",
  TIMEOUT: "TIMEOUT",
  PROOF_SERVER_UNAVAILABLE: "PROOF_SERVER_UNAVAILABLE",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  CIRCUIT_ERROR: "CIRCUIT_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN: "UNKNOWN",
} as const;

export type TxErrorCode = (typeof TxErrorCode)[keyof typeof TxErrorCode];

/**
 * Transaction error with categorization
 */
export interface TxError {
  code: TxErrorCode;
  message: string;
  retryable: boolean;
  suggestion: string;
  cause?: Error;
}

/**
 * Configuration for transaction submission
 */
export interface SubmitTxConfig {
  /** Timeout for proof generation in milliseconds (default: 60000) */
  proofTimeoutMs?: number;
  /** Callback for status updates */
  onStatusChange?: (status: TxStatus) => void;
  /** Callback for error handling */
  onError?: (error: TxError) => void;
}

/**
 * Result of transaction submission
 */
export interface SubmitTxResult {
  success: boolean;
  txHash?: string;
  error?: TxError;
  timing: {
    buildMs: number;
    proveMs: number;
    submitMs: number;
    totalMs: number;
  };
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

/**
 * Contract interface (generated from Compact)
 */
export interface ContractCallTx {
  [method: string]: (...args: unknown[]) => Promise<unknown>;
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Categorize an error into a TxErrorCode
 */
function categorizeError(error: unknown): TxError {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message.toLowerCase();

  // User rejection
  if (
    message.includes("rejected") ||
    message.includes("cancelled") ||
    message.includes("denied")
  ) {
    return {
      code: TxErrorCode.USER_REJECTED,
      message: "Transaction was cancelled",
      retryable: true,
      suggestion: "You can try again when ready",
      cause: err,
    };
  }

  // Timeout
  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      code: TxErrorCode.TIMEOUT,
      message: "Proof generation timed out",
      retryable: true,
      suggestion: "The proof server may be busy. Please try again.",
      cause: err,
    };
  }

  // Proof server unavailable
  if (
    message.includes("proof server") ||
    message.includes("localhost:6300") ||
    message.includes("connection refused")
  ) {
    return {
      code: TxErrorCode.PROOF_SERVER_UNAVAILABLE,
      message: "Proof server is not running",
      retryable: false,
      suggestion:
        "Start the proof server with: docker run -p 6300:6300 midnightnetwork/proof-server",
      cause: err,
    };
  }

  // Insufficient balance
  if (message.includes("insufficient") || message.includes("balance")) {
    return {
      code: TxErrorCode.INSUFFICIENT_BALANCE,
      message: "Insufficient balance for this transaction",
      retryable: false,
      suggestion: "Add funds to your wallet before trying again",
      cause: err,
    };
  }

  // Circuit constraint failure
  if (message.includes("constraint") || message.includes("circuit")) {
    return {
      code: TxErrorCode.CIRCUIT_ERROR,
      message: "Transaction validation failed",
      retryable: false,
      suggestion:
        "The transaction inputs may be invalid. Please check and try again.",
      cause: err,
    };
  }

  // Network error
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("failed to fetch")
  ) {
    return {
      code: TxErrorCode.NETWORK_ERROR,
      message: "Network connection error",
      retryable: true,
      suggestion: "Check your internet connection and try again",
      cause: err,
    };
  }

  // Generic error
  return {
    code: TxErrorCode.UNKNOWN,
    message: err.message || "An unexpected error occurred",
    retryable: true,
    suggestion: "Please try again. If the problem persists, contact support.",
    cause: err,
  };
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(code: TxErrorCode): boolean {
  return [
    TxErrorCode.USER_REJECTED,
    TxErrorCode.TIMEOUT,
    TxErrorCode.NETWORK_ERROR,
    TxErrorCode.UNKNOWN,
  ].includes(code);
}

// =============================================================================
// Core Implementation
// =============================================================================

/**
 * Submit a transaction through the complete Midnight lifecycle
 *
 * @param buildTx - Async function that builds the transaction
 * @param walletAPI - Connected wallet API
 * @param config - Optional configuration
 * @returns Promise resolving to the submission result
 *
 * @example
 * ```typescript
 * const result = await submitTx(
 *   () => contract.callTx.transfer(recipient, amount, witnesses),
 *   walletAPI,
 *   {
 *     onStatusChange: (status) => setStatus(status),
 *     proofTimeoutMs: 90_000,
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Transaction hash:', result.txHash);
 * } else {
 *   console.error('Failed:', result.error?.message);
 * }
 * ```
 */
export async function submitTx(
  buildTx: () => Promise<unknown>,
  walletAPI: WalletAPI,
  config: SubmitTxConfig = {}
): Promise<SubmitTxResult> {
  const { proofTimeoutMs = 60_000, onStatusChange, onError } = config;

  const timing = {
    buildMs: 0,
    proveMs: 0,
    submitMs: 0,
    totalMs: 0,
  };

  const totalStart = Date.now();

  const updateStatus = (status: TxStatus) => {
    onStatusChange?.(status);
  };

  try {
    // Phase 1: Build
    updateStatus("building");
    const buildStart = Date.now();
    const tx = await buildTx();
    timing.buildMs = Date.now() - buildStart;

    // Phase 2: Prove (with timeout)
    updateStatus("proving");
    const proveStart = Date.now();

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

    timing.proveMs = Date.now() - proveStart;

    // Phase 3: Submit
    updateStatus("submitting");
    const submitStart = Date.now();
    const txHash = await walletAPI.submitTransaction(provenTx);
    timing.submitMs = Date.now() - submitStart;

    // Success
    updateStatus("submitted");
    timing.totalMs = Date.now() - totalStart;

    return {
      success: true,
      txHash,
      timing,
    };
  } catch (error) {
    const txError = categorizeError(error);
    updateStatus("error");
    onError?.(txError);
    timing.totalMs = Date.now() - totalStart;

    return {
      success: false,
      error: txError,
      timing,
    };
  }
}

/**
 * Submit a transaction with automatic retry on failure
 *
 * @param buildTx - Async function that builds the transaction
 * @param walletAPI - Connected wallet API
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param config - Optional configuration
 * @returns Promise resolving to the submission result
 *
 * @example
 * ```typescript
 * const result = await submitTxWithRetry(
 *   () => contract.callTx.transfer(recipient, amount, witnesses),
 *   walletAPI,
 *   3,
 *   { onStatusChange: setStatus }
 * );
 * ```
 */
export async function submitTxWithRetry(
  buildTx: () => Promise<unknown>,
  walletAPI: WalletAPI,
  maxRetries: number = 3,
  config: SubmitTxConfig = {}
): Promise<SubmitTxResult> {
  let lastResult: SubmitTxResult | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await submitTx(buildTx, walletAPI, config);

    if (lastResult.success) {
      return lastResult;
    }

    // Don't retry non-retryable errors
    if (lastResult.error && !isRetryableError(lastResult.error.code)) {
      return lastResult;
    }

    // Don't retry user rejection
    if (lastResult.error?.code === TxErrorCode.USER_REJECTED) {
      return lastResult;
    }

    // Wait before retrying (exponential backoff)
    if (attempt < maxRetries) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return (
    lastResult ?? {
      success: false,
      error: {
        code: TxErrorCode.UNKNOWN,
        message: "Transaction failed after all retries",
        retryable: false,
        suggestion: "Please try again later",
      },
      timing: { buildMs: 0, proveMs: 0, submitMs: 0, totalMs: 0 },
    }
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a user-friendly message for a transaction error
 */
export function getTxErrorMessage(error: TxError): string {
  return error.message;
}

/**
 * Get the suggestion for recovering from a transaction error
 */
export function getTxErrorSuggestion(error: TxError): string {
  return error.suggestion;
}

/**
 * Format timing information for display
 */
export function formatTxTiming(timing: SubmitTxResult["timing"]): string {
  const parts: string[] = [];

  if (timing.buildMs > 100) {
    parts.push(`Build: ${(timing.buildMs / 1000).toFixed(1)}s`);
  }

  if (timing.proveMs > 0) {
    parts.push(`Prove: ${(timing.proveMs / 1000).toFixed(1)}s`);
  }

  if (timing.submitMs > 0) {
    parts.push(`Submit: ${(timing.submitMs / 1000).toFixed(1)}s`);
  }

  if (parts.length === 0) {
    return `Total: ${(timing.totalMs / 1000).toFixed(1)}s`;
  }

  return parts.join(" | ");
}

// =============================================================================
// Example Usage
// =============================================================================

/**
 * Example: Transfer tokens with full error handling
 */
export async function exampleTransfer(
  contract: { callTx: { transfer: (...args: unknown[]) => Promise<unknown> } },
  walletAPI: WalletAPI,
  recipient: Uint8Array,
  amount: bigint,
  privateState: { balance: bigint }
): Promise<SubmitTxResult> {
  // Define witnesses
  const witnesses = {
    get_balance: ({
      privateState: ps,
    }: WitnessContext<{ balance: bigint }>): bigint => {
      return ps.balance;
    },
  };

  // Submit with retry
  return submitTxWithRetry(
    () => contract.callTx.transfer(recipient, amount, witnesses),
    walletAPI,
    3,
    {
      proofTimeoutMs: 90_000,
      onStatusChange: (status) => {
        console.log("Transaction status:", status);
      },
      onError: (error) => {
        console.error("Transaction error:", error.code, error.message);
        console.log("Suggestion:", error.suggestion);
      },
    }
  );
}
