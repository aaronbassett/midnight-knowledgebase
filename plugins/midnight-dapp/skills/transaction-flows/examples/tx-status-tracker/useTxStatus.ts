/**
 * useTxStatus - React hook for tracking transaction status in Midnight DApps
 *
 * Provides polling-based transaction status tracking with confirmation
 * counting, timeout handling, and automatic cleanup.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Transaction confirmation status
 */
export type ConfirmationStatus =
  | "unknown"
  | "pending"
  | "included"
  | "confirmed"
  | "failed";

/**
 * Full transaction status including metadata
 */
export interface TxStatusInfo {
  /** Current confirmation status */
  status: ConfirmationStatus;
  /** Number of block confirmations */
  confirmations: number;
  /** Block number where transaction was included (if known) */
  blockNumber: number | null;
  /** Block hash where transaction was included (if known) */
  blockHash: string | null;
  /** Timestamp when status was last updated */
  lastUpdated: number;
}

/**
 * Configuration for useTxStatus hook
 */
export interface UseTxStatusConfig {
  /** Polling interval in milliseconds (default: 3000) */
  pollIntervalMs?: number;
  /** Maximum wait time before timeout in milliseconds (default: 300000 = 5 min) */
  maxWaitMs?: number;
  /** Number of confirmations required (default: 1) */
  requiredConfirmations?: number;
  /** Callback when transaction is confirmed */
  onConfirmed?: (txHash: string) => void;
  /** Callback when transaction fails */
  onFailed?: (txHash: string, error: Error) => void;
  /** Callback when tracking times out */
  onTimeout?: (txHash: string) => void;
}

/**
 * Return type for useTxStatus hook
 */
export interface UseTxStatusReturn {
  /** Current transaction status */
  status: ConfirmationStatus;
  /** Full status information */
  statusInfo: TxStatusInfo;
  /** Whether status is being checked */
  isPolling: boolean;
  /** Whether the transaction is confirmed */
  isConfirmed: boolean;
  /** Whether the transaction has failed */
  isFailed: boolean;
  /** Any error that occurred during tracking */
  error: Error | null;
  /** Time elapsed since tracking started (ms) */
  elapsedMs: number;
  /** Manually refresh the status */
  refresh: () => Promise<void>;
  /** Stop tracking */
  stop: () => void;
}

/**
 * Service for checking transaction status
 * Implement this interface for your specific indexer
 */
export interface TxStatusService {
  getTransactionStatus: (txHash: string) => Promise<TxStatusInfo>;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<
  Omit<UseTxStatusConfig, "onConfirmed" | "onFailed" | "onTimeout">
> = {
  pollIntervalMs: 3_000,
  maxWaitMs: 300_000, // 5 minutes
  requiredConfirmations: 1,
};

const INITIAL_STATUS_INFO: TxStatusInfo = {
  status: "unknown",
  confirmations: 0,
  blockNumber: null,
  blockHash: null,
  lastUpdated: 0,
};

// =============================================================================
// Mock Service (for development)
// =============================================================================

/**
 * Create a mock status service for testing
 * Simulates transaction confirmation over time
 */
export function createMockTxStatusService(
  confirmAfterMs: number = 10_000
): TxStatusService {
  const startTimes: Map<string, number> = new Map();

  return {
    getTransactionStatus: async (txHash: string): Promise<TxStatusInfo> => {
      let startTime = startTimes.get(txHash);
      if (!startTime) {
        startTime = Date.now();
        startTimes.set(txHash, startTime);
      }

      const elapsed = Date.now() - startTime;
      const confirmations = Math.floor(elapsed / (confirmAfterMs / 3));

      if (elapsed < confirmAfterMs / 3) {
        return {
          status: "pending",
          confirmations: 0,
          blockNumber: null,
          blockHash: null,
          lastUpdated: Date.now(),
        };
      }

      if (elapsed < confirmAfterMs) {
        return {
          status: "included",
          confirmations: Math.min(confirmations, 2),
          blockNumber: 1000 + Math.floor(confirmations),
          blockHash: `0x${txHash.slice(0, 16)}`,
          lastUpdated: Date.now(),
        };
      }

      return {
        status: "confirmed",
        confirmations: 6,
        blockNumber: 1006,
        blockHash: `0x${txHash.slice(0, 16)}`,
        lastUpdated: Date.now(),
      };
    },
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for tracking transaction confirmation status
 *
 * @param txHash - Transaction hash to track (null to disable)
 * @param statusService - Service for checking transaction status
 * @param config - Optional configuration
 * @returns Hook state and actions
 *
 * @example
 * ```tsx
 * function TransactionStatus({ txHash }) {
 *   const statusService = useStatusService();
 *   const { status, confirmations, isConfirmed, elapsedMs } = useTxStatus(
 *     txHash,
 *     statusService,
 *     {
 *       onConfirmed: () => toast.success('Transaction confirmed!'),
 *       onTimeout: () => toast.warning('Still pending - check explorer'),
 *     }
 *   );
 *
 *   if (!txHash) return null;
 *
 *   return (
 *     <div>
 *       <p>Status: {status}</p>
 *       <p>Confirmations: {confirmations}</p>
 *       <p>Time: {Math.floor(elapsedMs / 1000)}s</p>
 *       {isConfirmed && <p>Confirmed!</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTxStatus(
  txHash: string | null,
  statusService: TxStatusService,
  config: UseTxStatusConfig = {}
): UseTxStatusReturn {
  const {
    pollIntervalMs,
    maxWaitMs,
    requiredConfirmations,
  } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const { onConfirmed, onFailed, onTimeout } = config;

  // State
  const [statusInfo, setStatusInfo] = useState<TxStatusInfo>(INITIAL_STATUS_INFO);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Refs
  const startTimeRef = useRef<number>(0);
  const isStoppedRef = useRef(false);
  const hasCompletedRef = useRef(false);

  // Derived state
  const isConfirmed = statusInfo.status === "confirmed" &&
    statusInfo.confirmations >= requiredConfirmations;
  const isFailed = statusInfo.status === "failed";

  // Check status once
  const checkStatus = useCallback(async () => {
    if (!txHash || isStoppedRef.current) return;

    try {
      const info = await statusService.getTransactionStatus(txHash);
      setStatusInfo(info);
      setError(null);
      return info;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [txHash, statusService]);

  // Manual refresh
  const refresh = useCallback(async () => {
    await checkStatus();
  }, [checkStatus]);

  // Stop tracking
  const stop = useCallback(() => {
    isStoppedRef.current = true;
    setIsPolling(false);
  }, []);

  // Polling effect
  useEffect(() => {
    if (!txHash) {
      setStatusInfo(INITIAL_STATUS_INFO);
      setIsPolling(false);
      setError(null);
      setElapsedMs(0);
      return;
    }

    // Reset for new transaction
    isStoppedRef.current = false;
    hasCompletedRef.current = false;
    startTimeRef.current = Date.now();
    setIsPolling(true);
    setError(null);

    // Elapsed time updater
    const elapsedInterval = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    // Status polling
    let pollTimeout: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (isStoppedRef.current || hasCompletedRef.current) {
        return;
      }

      try {
        const info = await checkStatus();

        // Check for completion
        if (info && info.status === "confirmed" && info.confirmations >= requiredConfirmations) {
          hasCompletedRef.current = true;
          setIsPolling(false);
          onConfirmed?.(txHash);
          return;
        }

        if (info && info.status === "failed") {
          hasCompletedRef.current = true;
          setIsPolling(false);
          onFailed?.(txHash, new Error("Transaction failed"));
          return;
        }

        // Check for timeout
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed >= maxWaitMs) {
          hasCompletedRef.current = true;
          setIsPolling(false);
          onTimeout?.(txHash);
          return;
        }

        // Schedule next poll
        pollTimeout = setTimeout(poll, pollIntervalMs);
      } catch (err) {
        // Continue polling even on errors (network issues are transient)
        pollTimeout = setTimeout(poll, pollIntervalMs);
      }
    };

    // Start polling immediately
    poll();

    // Cleanup
    return () => {
      clearInterval(elapsedInterval);
      clearTimeout(pollTimeout);
      isStoppedRef.current = true;
    };
  }, [
    txHash,
    checkStatus,
    pollIntervalMs,
    maxWaitMs,
    requiredConfirmations,
    onConfirmed,
    onFailed,
    onTimeout,
  ]);

  return {
    status: statusInfo.status,
    statusInfo,
    isPolling,
    isConfirmed,
    isFailed,
    error,
    elapsedMs,
    refresh,
    stop,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a human-readable message for the status
 */
export function getStatusMessage(status: ConfirmationStatus): string {
  switch (status) {
    case "unknown":
      return "Checking status...";
    case "pending":
      return "Waiting for block inclusion...";
    case "included":
      return "Included in block, confirming...";
    case "confirmed":
      return "Transaction confirmed!";
    case "failed":
      return "Transaction failed";
    default:
      return "Unknown status";
  }
}

/**
 * Get status indicator color
 */
export function getStatusColor(status: ConfirmationStatus): string {
  switch (status) {
    case "confirmed":
      return "#10b981"; // Green
    case "failed":
      return "#ef4444"; // Red
    case "included":
      return "#f59e0b"; // Amber
    case "pending":
      return "#6366f1"; // Indigo
    default:
      return "#6b7280"; // Gray
  }
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
 * Calculate confirmation progress percentage
 */
export function getConfirmationProgress(
  confirmations: number,
  required: number
): number {
  return Math.min((confirmations / required) * 100, 100);
}
