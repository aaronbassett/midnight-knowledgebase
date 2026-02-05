/**
 * Type definitions for contract state management
 *
 * These types provide a foundation for type-safe state access
 * in Midnight DApps.
 */

// =============================================================================
// Generic State Types
// =============================================================================

/**
 * Possible states for an async state fetch operation
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Result of a state fetch operation
 */
export interface StateResult<T> {
  /** Current state value (null if not loaded) */
  value: T | null;
  /** Loading state of the fetch operation */
  status: LoadingState;
  /** Error if fetch failed */
  error: Error | null;
  /** Timestamp of last successful fetch */
  lastUpdated: number | null;
}

/**
 * Options for state fetch operations
 */
export interface StateFetchOptions {
  /** Time-to-live for cached value in milliseconds */
  ttl?: number;
  /** Whether to refetch if cached value exists */
  forceRefresh?: boolean;
  /** Retry count on failure */
  retryCount?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

// =============================================================================
// Contract State Types
// =============================================================================

/**
 * Generic map accessor interface
 */
export interface MapAccessor<K, V> {
  get(key: K): Promise<V | undefined>;
}

/**
 * Generic set accessor interface
 */
export interface SetAccessor<T> {
  has(value: T): Promise<boolean>;
}

/**
 * Generic MerkleTree accessor interface
 */
export interface MerkleTreeAccessor {
  root(): Promise<Uint8Array>;
}

/**
 * Example contract state shape
 * Customize this based on your contract's ledger definition
 */
export interface ExampleContractState {
  // Simple values
  total_supply(): Promise<bigint>;
  admin(): Promise<Uint8Array>;
  initialized(): Promise<boolean>;

  // Map accessors
  balances: MapAccessor<Uint8Array, bigint>;
  names: MapAccessor<Uint8Array, string>;

  // Set accessors
  members: SetAccessor<Uint8Array>;

  // MerkleTree accessors
  commitment_tree: MerkleTreeAccessor;
}

/**
 * Contract interface with state accessor
 */
export interface ContractWithState<S = ExampleContractState> {
  state: S;
  address: string;
}

// =============================================================================
// Hook Return Types
// =============================================================================

/**
 * Return type for useContractState hook
 */
export interface UseContractStateReturn<T> {
  /** Current value */
  value: T | null;
  /** Whether currently loading */
  loading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch the value */
  refetch: () => Promise<void>;
  /** Whether value is stale (past TTL) */
  isStale: boolean;
}

/**
 * Return type for useContractMap hook
 */
export interface UseContractMapReturn<V> {
  /** Get a value from the map */
  get: (key: Uint8Array) => Promise<V | undefined>;
  /** Cached values */
  cache: Map<string, V>;
  /** Clear the cache */
  clearCache: () => void;
}

/**
 * Return type for useContractSet hook
 */
export interface UseContractSetReturn {
  /** Check if value is in set */
  has: (value: Uint8Array) => Promise<boolean>;
  /** Cached membership checks */
  cache: Map<string, boolean>;
  /** Clear the cache */
  clearCache: () => void;
}

// =============================================================================
// Polling Configuration
// =============================================================================

/**
 * Configuration for state polling
 */
export interface PollingConfig {
  /** Polling interval in milliseconds */
  interval: number;
  /** Whether polling is enabled */
  enabled: boolean;
  /** Pause polling when window is not visible */
  pauseOnHidden?: boolean;
}

/**
 * Default polling configuration
 */
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  interval: 5000,
  enabled: true,
  pauseOnHidden: true,
};

// =============================================================================
// Error Types
// =============================================================================

/**
 * State read error codes
 */
export enum StateErrorCode {
  /** Network error (indexer unreachable) */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Contract not found */
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  /** State key not found */
  STATE_NOT_FOUND = 'STATE_NOT_FOUND',
  /** Timeout reading state */
  TIMEOUT = 'TIMEOUT',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for state operations
 */
export class StateError extends Error {
  constructor(
    message: string,
    public readonly code: StateErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StateError';
  }
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Extract the return type of a state accessor
 */
export type StateValue<T extends () => Promise<unknown>> = Awaited<ReturnType<T>>;

/**
 * Extract map value type from MapAccessor
 */
export type MapValue<T> = T extends MapAccessor<unknown, infer V> ? V : never;

/**
 * Make all properties in T optionally undefined
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
