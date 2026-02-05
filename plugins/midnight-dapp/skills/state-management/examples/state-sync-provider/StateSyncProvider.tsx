/**
 * StateSyncProvider - React context for state synchronization
 *
 * Provides centralized state synchronization across components,
 * handling connection status, polling, and error recovery.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

// =============================================================================
// Types
// =============================================================================

/**
 * Synchronization status
 */
export type SyncStatus = 'disconnected' | 'connecting' | 'synced' | 'syncing' | 'error';

/**
 * State for the sync provider
 */
interface SyncState {
  /** Current sync status */
  status: SyncStatus;
  /** Last successful sync timestamp */
  lastSyncTime: number | null;
  /** Current error if any */
  error: Error | null;
  /** Number of consecutive sync failures */
  failureCount: number;
  /** Whether WebSocket is connected */
  wsConnected: boolean;
  /** Current block number from indexer */
  blockNumber: number | null;
}

/**
 * Actions for the sync reducer
 */
type SyncAction =
  | { type: 'START_SYNC' }
  | { type: 'SYNC_SUCCESS'; blockNumber: number }
  | { type: 'SYNC_ERROR'; error: Error }
  | { type: 'WS_CONNECT' }
  | { type: 'WS_DISCONNECT' }
  | { type: 'RESET' };

/**
 * Context value exposed to consumers
 */
interface StateSyncContextValue {
  /** Current sync state */
  state: SyncState;
  /** Manually trigger a sync */
  sync: () => Promise<void>;
  /** Subscribe to state changes for a contract */
  subscribe: (contractAddress: string, callback: () => void) => () => void;
  /** Reset sync state */
  reset: () => void;
}

/**
 * Props for the StateSyncProvider component
 */
interface StateSyncProviderProps {
  /** Child components */
  children: ReactNode;
  /** Indexer HTTP URI */
  indexerUri: string | null;
  /** Indexer WebSocket URI */
  indexerWsUri: string | null;
  /** Polling interval in milliseconds (default: 5000) */
  pollInterval?: number;
  /** Maximum retry attempts (default: 5) */
  maxRetries?: number;
  /** Pause sync when window is hidden (default: true) */
  pauseOnHidden?: boolean;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: SyncState = {
  status: 'disconnected',
  lastSyncTime: null,
  error: null,
  failureCount: 0,
  wsConnected: false,
  blockNumber: null,
};

// =============================================================================
// Reducer
// =============================================================================

function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case 'START_SYNC':
      return {
        ...state,
        status: 'syncing',
        error: null,
      };

    case 'SYNC_SUCCESS':
      return {
        ...state,
        status: 'synced',
        lastSyncTime: Date.now(),
        error: null,
        failureCount: 0,
        blockNumber: action.blockNumber,
      };

    case 'SYNC_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.error,
        failureCount: state.failureCount + 1,
      };

    case 'WS_CONNECT':
      return {
        ...state,
        wsConnected: true,
      };

    case 'WS_DISCONNECT':
      return {
        ...state,
        wsConnected: false,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// =============================================================================
// Context
// =============================================================================

const StateSyncContext = createContext<StateSyncContextValue | null>(null);

// =============================================================================
// Provider Component
// =============================================================================

export function StateSyncProvider({
  children,
  indexerUri,
  indexerWsUri,
  pollInterval = 5000,
  maxRetries = 5,
  pauseOnHidden = true,
}: StateSyncProviderProps): React.ReactElement {
  const [state, dispatch] = useReducer(syncReducer, initialState);

  const subscribersRef = useRef<Map<string, Set<() => void>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  // Notify subscribers for a contract
  const notifySubscribers = useCallback((contractAddress: string) => {
    const callbacks = subscribersRef.current.get(contractAddress);
    if (callbacks) {
      callbacks.forEach((callback) => callback());
    }
  }, []);

  // Perform sync operation
  const sync = useCallback(async (): Promise<void> => {
    if (!indexerUri) return;

    dispatch({ type: 'START_SYNC' });

    try {
      // Fetch current block number from indexer
      const response = await fetch(`${indexerUri}/status`);
      if (!response.ok) {
        throw new Error(`Indexer returned ${response.status}`);
      }

      const data = await response.json();
      const blockNumber = data.blockNumber ?? data.height ?? 0;

      if (mountedRef.current) {
        dispatch({ type: 'SYNC_SUCCESS', blockNumber });

        // Notify all subscribers
        subscribersRef.current.forEach((_, contractAddress) => {
          notifySubscribers(contractAddress);
        });
      }
    } catch (error) {
      if (mountedRef.current) {
        dispatch({
          type: 'SYNC_ERROR',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }, [indexerUri, notifySubscribers]);

  // Subscribe to updates for a contract
  const subscribe = useCallback(
    (contractAddress: string, callback: () => void): (() => void) => {
      if (!subscribersRef.current.has(contractAddress)) {
        subscribersRef.current.set(contractAddress, new Set());
      }

      subscribersRef.current.get(contractAddress)?.add(callback);

      // Return unsubscribe function
      return () => {
        subscribersRef.current.get(contractAddress)?.delete(callback);
        if (subscribersRef.current.get(contractAddress)?.size === 0) {
          subscribersRef.current.delete(contractAddress);
        }
      };
    },
    []
  );

  // Reset state
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    subscribersRef.current.clear();
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!indexerWsUri) return;

    const connectWs = () => {
      try {
        wsRef.current = new WebSocket(indexerWsUri);

        wsRef.current.onopen = () => {
          if (mountedRef.current) {
            dispatch({ type: 'WS_CONNECT' });
          }
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle block updates
            if (data.type === 'block' || data.type === 'newBlock') {
              if (mountedRef.current) {
                dispatch({ type: 'SYNC_SUCCESS', blockNumber: data.blockNumber });

                // Notify all subscribers on new block
                subscribersRef.current.forEach((_, contractAddress) => {
                  notifySubscribers(contractAddress);
                });
              }
            }

            // Handle contract-specific updates
            if (data.type === 'state_update' && data.contract) {
              notifySubscribers(data.contract);
            }
          } catch {
            // Ignore parse errors
          }
        };

        wsRef.current.onclose = () => {
          if (mountedRef.current) {
            dispatch({ type: 'WS_DISCONNECT' });

            // Attempt reconnection after delay
            setTimeout(connectWs, 5000);
          }
        };

        wsRef.current.onerror = () => {
          // Error will be followed by close
        };
      } catch {
        // Connection failed, will retry via onclose
      }
    };

    connectWs();

    return () => {
      wsRef.current?.close();
    };
  }, [indexerWsUri, notifySubscribers]);

  // Polling (fallback when WS not connected)
  useEffect(() => {
    if (!indexerUri) return;

    let interval: NodeJS.Timeout | null = null;
    let isVisible = !document.hidden;

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible && pauseOnHidden) {
        // Sync when becoming visible
        sync();
      }
    };

    const poll = () => {
      // Skip polling if WS is connected and working
      if (state.wsConnected) return;

      // Skip if too many failures
      if (state.failureCount >= maxRetries) return;

      // Skip if hidden and pauseOnHidden is true
      if (pauseOnHidden && !isVisible) return;

      sync();
    };

    // Initial sync
    sync();

    // Set up visibility listener
    if (pauseOnHidden) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Set up polling
    interval = setInterval(poll, pollInterval);

    return () => {
      if (interval) clearInterval(interval);
      if (pauseOnHidden) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [
    indexerUri,
    pollInterval,
    pauseOnHidden,
    maxRetries,
    state.wsConnected,
    state.failureCount,
    sync,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const contextValue: StateSyncContextValue = {
    state,
    sync,
    subscribe,
    reset,
  };

  return (
    <StateSyncContext.Provider value={contextValue}>
      {children}
    </StateSyncContext.Provider>
  );
}

// =============================================================================
// Hook to access context
// =============================================================================

/**
 * Hook to access state sync context
 *
 * @throws Error if used outside StateSyncProvider
 */
export function useStateSyncContext(): StateSyncContextValue {
  const context = useContext(StateSyncContext);

  if (!context) {
    throw new Error('useStateSyncContext must be used within StateSyncProvider');
  }

  return context;
}

// =============================================================================
// Exports
// =============================================================================

export type { SyncState, StateSyncContextValue, StateSyncProviderProps };
