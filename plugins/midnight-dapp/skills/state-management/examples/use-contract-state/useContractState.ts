/**
 * useContractState - React hook for reading contract state
 *
 * Provides type-safe access to Midnight contract public state with
 * caching, polling, and error handling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ContractWithState,
  UseContractStateReturn,
  StateFetchOptions,
  PollingConfig,
  StateErrorCode,
} from './types';
import { StateError, DEFAULT_POLLING_CONFIG } from './types';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_FETCH_OPTIONS: Required<StateFetchOptions> = {
  ttl: 30000, // 30 seconds
  forceRefresh: false,
  retryCount: 3,
  retryDelay: 1000,
};

// =============================================================================
// Main Hook
// =============================================================================

/**
 * React hook for reading a single contract state value
 *
 * @param contract - The deployed contract instance
 * @param accessor - Function to access the state value
 * @param options - Fetch options (ttl, retry, etc.)
 * @param pollingConfig - Optional polling configuration
 * @returns State value, loading status, and control functions
 *
 * @example
 * ```typescript
 * const { value: totalSupply, loading, refetch } = useContractState(
 *   contract,
 *   (state) => state.total_supply(),
 *   { ttl: 60000 }
 * );
 * ```
 */
export function useContractState<T, S = unknown>(
  contract: ContractWithState<S> | null,
  accessor: (state: S) => Promise<T>,
  options: StateFetchOptions = {},
  pollingConfig?: Partial<PollingConfig>
): UseContractStateReturn<T> {
  const opts = { ...DEFAULT_FETCH_OPTIONS, ...options };
  const polling = { ...DEFAULT_POLLING_CONFIG, ...pollingConfig };

  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const accessorRef = useRef(accessor);
  accessorRef.current = accessor;

  // Calculate if value is stale
  const isStale = lastUpdated !== null && Date.now() - lastUpdated > opts.ttl;

  // Fetch state with retry logic
  const fetchState = useCallback(async (): Promise<void> => {
    if (!contract) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.retryCount; attempt++) {
      try {
        const result = await accessorRef.current(contract.state);

        if (mountedRef.current) {
          setValue(result);
          setLastUpdated(Date.now());
          setError(null);
        }
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        // Don't retry on last attempt
        if (attempt < opts.retryCount) {
          await new Promise((resolve) => setTimeout(resolve, opts.retryDelay));
        }
      }
    }

    // All retries failed
    if (mountedRef.current) {
      const stateError = new StateError(
        lastError?.message ?? 'Failed to fetch state',
        categorizeError(lastError),
        lastError ?? undefined
      );
      setError(stateError);
    }

    setLoading(false);
  }, [contract, opts.retryCount, opts.retryDelay]);

  // Refetch function for manual refresh
  const refetch = useCallback(async (): Promise<void> => {
    await fetchState();
  }, [fetchState]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchState();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchState]);

  // Polling
  useEffect(() => {
    if (!polling.enabled || !contract) return;

    let interval: NodeJS.Timeout | null = null;
    let isVisible = !document.hidden;

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible && polling.pauseOnHidden) {
        // Refetch when becoming visible
        fetchState();
      }
    };

    const poll = () => {
      if (!polling.pauseOnHidden || isVisible) {
        fetchState();
      }
    };

    // Set up visibility listener
    if (polling.pauseOnHidden) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Set up polling interval
    interval = setInterval(poll, polling.interval);

    return () => {
      if (interval) clearInterval(interval);
      if (polling.pauseOnHidden) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [contract, polling.enabled, polling.interval, polling.pauseOnHidden, fetchState]);

  return {
    value,
    loading,
    error,
    refetch,
    isStale,
  };
}

// =============================================================================
// Specialized Hooks
// =============================================================================

/**
 * Hook for reading a map value from contract state
 *
 * @example
 * ```typescript
 * const { value: balance, loading } = useContractMapValue(
 *   contract,
 *   (state) => state.balances,
 *   userAddress
 * );
 * ```
 */
export function useContractMapValue<K, V, S = unknown>(
  contract: ContractWithState<S> | null,
  mapAccessor: (state: S) => { get: (key: K) => Promise<V | undefined> },
  key: K,
  options?: StateFetchOptions
): UseContractStateReturn<V | undefined> {
  return useContractState(
    contract,
    async (state) => {
      const map = mapAccessor(state);
      return map.get(key);
    },
    options
  );
}

/**
 * Hook for checking set membership in contract state
 *
 * @example
 * ```typescript
 * const { value: isMember, loading } = useContractSetMembership(
 *   contract,
 *   (state) => state.members,
 *   userAddress
 * );
 * ```
 */
export function useContractSetMembership<T, S = unknown>(
  contract: ContractWithState<S> | null,
  setAccessor: (state: S) => { has: (value: T) => Promise<boolean> },
  value: T,
  options?: StateFetchOptions
): UseContractStateReturn<boolean> {
  return useContractState(
    contract,
    async (state) => {
      const set = setAccessor(state);
      return set.has(value);
    },
    options
  );
}

/**
 * Hook for reading multiple state values at once
 *
 * @example
 * ```typescript
 * const { value, loading } = useContractStates(contract, [
 *   (state) => state.total_supply(),
 *   (state) => state.admin(),
 * ]);
 * // value: [bigint, Uint8Array] | null
 * ```
 */
export function useContractStates<T extends unknown[], S = unknown>(
  contract: ContractWithState<S> | null,
  accessors: { [K in keyof T]: (state: S) => Promise<T[K]> },
  options?: StateFetchOptions
): UseContractStateReturn<T> {
  return useContractState(
    contract,
    async (state) => {
      const results = await Promise.all(
        accessors.map((accessor) => accessor(state))
      );
      return results as T;
    },
    options
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Categorize an error into a StateErrorCode
 */
function categorizeError(error: Error | null): StateErrorCode {
  if (!error) return 'UNKNOWN' as StateErrorCode;

  const message = error.message.toLowerCase();

  if (message.includes('network') || message.includes('fetch')) {
    return 'NETWORK_ERROR' as StateErrorCode;
  }
  if (message.includes('not found') || message.includes('404')) {
    return 'CONTRACT_NOT_FOUND' as StateErrorCode;
  }
  if (message.includes('timeout')) {
    return 'TIMEOUT' as StateErrorCode;
  }

  return 'UNKNOWN' as StateErrorCode;
}

/**
 * Convert Uint8Array to hex string for use as cache key
 */
export function toHexKey(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a stable accessor function that won't cause unnecessary re-renders
 */
export function createStableAccessor<T, S>(
  accessor: (state: S) => Promise<T>
): (state: S) => Promise<T> {
  return accessor;
}
