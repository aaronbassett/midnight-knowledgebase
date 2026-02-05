/**
 * useStateSync - Hook for accessing state synchronization
 *
 * Provides convenience methods for working with the StateSyncProvider.
 */

import { useState, useEffect, useCallback } from 'react';
import { useStateSyncContext, type SyncStatus } from './StateSyncProvider';

// =============================================================================
// Types
// =============================================================================

/**
 * Return type for useStateSync hook
 */
export interface UseStateSyncReturn {
  /** Current sync status */
  status: SyncStatus;
  /** Whether currently synced */
  isSynced: boolean;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Whether there's an error */
  hasError: boolean;
  /** Current error if any */
  error: Error | null;
  /** Last sync timestamp */
  lastSyncTime: number | null;
  /** Current block number */
  blockNumber: number | null;
  /** Whether WebSocket is connected */
  wsConnected: boolean;
  /** Time since last sync in milliseconds */
  timeSinceSync: number | null;
  /** Manually trigger sync */
  sync: () => Promise<void>;
  /** Reset sync state */
  reset: () => void;
}

/**
 * Return type for useContractSync hook
 */
export interface UseContractSyncReturn {
  /** Force refetch of contract state */
  refetch: () => void;
  /** Counter that increments on each sync (use as useEffect dependency) */
  syncVersion: number;
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Hook for accessing overall sync status
 *
 * @returns Sync status and control functions
 *
 * @example
 * ```typescript
 * function SyncIndicator() {
 *   const { status, isSynced, blockNumber } = useStateSync();
 *
 *   return (
 *     <div>
 *       <span>Status: {status}</span>
 *       {isSynced && <span>Block: {blockNumber}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useStateSync(): UseStateSyncReturn {
  const { state, sync, reset } = useStateSyncContext();
  const [now, setNow] = useState(Date.now());

  // Update "now" periodically to calculate time since sync
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeSinceSync = state.lastSyncTime !== null
    ? now - state.lastSyncTime
    : null;

  return {
    status: state.status,
    isSynced: state.status === 'synced',
    isSyncing: state.status === 'syncing' || state.status === 'connecting',
    hasError: state.status === 'error',
    error: state.error,
    lastSyncTime: state.lastSyncTime,
    blockNumber: state.blockNumber,
    wsConnected: state.wsConnected,
    timeSinceSync,
    sync,
    reset,
  };
}

// =============================================================================
// Contract-Specific Hook
// =============================================================================

/**
 * Hook for syncing a specific contract's state
 *
 * @param contractAddress - The contract address to subscribe to
 * @returns Refetch function and sync version counter
 *
 * @example
 * ```typescript
 * function ContractBalance({ contract }) {
 *   const { syncVersion } = useContractSync(contract.address);
 *   const [balance, setBalance] = useState<bigint | null>(null);
 *
 *   useEffect(() => {
 *     contract.state.balances.get(myAddress).then(setBalance);
 *   }, [syncVersion]); // Refetch when sync version changes
 *
 *   return <span>Balance: {balance?.toString()}</span>;
 * }
 * ```
 */
export function useContractSync(contractAddress: string): UseContractSyncReturn {
  const { subscribe } = useStateSyncContext();
  const [syncVersion, setSyncVersion] = useState(0);

  // Subscribe to updates for this contract
  useEffect(() => {
    const unsubscribe = subscribe(contractAddress, () => {
      setSyncVersion((v) => v + 1);
    });

    return unsubscribe;
  }, [contractAddress, subscribe]);

  // Manual refetch
  const refetch = useCallback(() => {
    setSyncVersion((v) => v + 1);
  }, []);

  return {
    refetch,
    syncVersion,
  };
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook that triggers callback when sync status changes to 'synced'
 *
 * @param callback - Function to call when synced
 *
 * @example
 * ```typescript
 * useOnSync(() => {
 *   console.log('State synced, refreshing data...');
 *   fetchLatestData();
 * });
 * ```
 */
export function useOnSync(callback: () => void): void {
  const { status } = useStateSync();
  const prevStatusRef = { current: status };

  useEffect(() => {
    if (prevStatusRef.current !== 'synced' && status === 'synced') {
      callback();
    }
    prevStatusRef.current = status;
  }, [status, callback]);
}

/**
 * Hook that triggers callback when sync error occurs
 *
 * @param callback - Function to call on error
 *
 * @example
 * ```typescript
 * useOnSyncError((error) => {
 *   toast.error(`Sync failed: ${error.message}`);
 * });
 * ```
 */
export function useOnSyncError(callback: (error: Error) => void): void {
  const { error, hasError } = useStateSync();

  useEffect(() => {
    if (hasError && error) {
      callback(error);
    }
  }, [hasError, error, callback]);
}

/**
 * Hook that provides sync status as a simple boolean
 *
 * @param maxStaleMs - Maximum time in ms before considering stale (default: 30000)
 * @returns Whether data is considered fresh
 *
 * @example
 * ```typescript
 * const isFresh = useSyncFreshness(60000); // Consider stale after 1 minute
 *
 * if (!isFresh) {
 *   return <StaleDataWarning />;
 * }
 * ```
 */
export function useSyncFreshness(maxStaleMs: number = 30000): boolean {
  const { timeSinceSync, isSynced } = useStateSync();

  if (!isSynced || timeSinceSync === null) {
    return false;
  }

  return timeSinceSync < maxStaleMs;
}

/**
 * Hook that returns human-readable sync status
 *
 * @returns Object with status text and color suggestion
 *
 * @example
 * ```typescript
 * const { text, color } = useSyncStatusDisplay();
 * return <Badge color={color}>{text}</Badge>;
 * ```
 */
export function useSyncStatusDisplay(): { text: string; color: string } {
  const { status, wsConnected, timeSinceSync } = useStateSync();

  switch (status) {
    case 'disconnected':
      return { text: 'Disconnected', color: 'gray' };

    case 'connecting':
      return { text: 'Connecting...', color: 'yellow' };

    case 'syncing':
      return { text: 'Syncing...', color: 'blue' };

    case 'synced':
      if (wsConnected) {
        return { text: 'Live', color: 'green' };
      }
      if (timeSinceSync !== null && timeSinceSync > 30000) {
        return { text: 'Stale', color: 'yellow' };
      }
      return { text: 'Synced', color: 'green' };

    case 'error':
      return { text: 'Error', color: 'red' };

    default:
      return { text: 'Unknown', color: 'gray' };
  }
}
