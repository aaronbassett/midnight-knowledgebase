/**
 * Cache configuration for Midnight DApps
 *
 * Defines what data can be cached and where, respecting
 * Midnight's privacy model.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Cache storage backends
 */
export type CacheStorage = 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB';

/**
 * Data sensitivity levels
 */
export enum DataSensitivity {
  /** Public on-chain data - can be cached anywhere */
  PUBLIC = 'PUBLIC',
  /** Private local data - can only be cached locally, encrypted */
  PRIVATE_LOCAL = 'PRIVATE_LOCAL',
  /** Sensitive session data - memory only */
  SESSION_ONLY = 'SESSION_ONLY',
  /** Never cache - witness data, secrets */
  NEVER = 'NEVER',
}

/**
 * Configuration for a cache entry type
 */
export interface CacheEntryConfig {
  /** Human-readable name */
  name: string;
  /** Sensitivity level */
  sensitivity: DataSensitivity;
  /** Allowed storage backends */
  allowedStorage: CacheStorage[];
  /** Default TTL in milliseconds */
  defaultTTL: number;
  /** Maximum TTL in milliseconds */
  maxTTL: number;
  /** Description of what this data contains */
  description: string;
}

/**
 * Complete cache configuration
 */
export interface CacheConfig {
  /** Unique prefix for storage keys */
  prefix: string;
  /** Version for cache invalidation */
  version: number;
  /** Default storage backend */
  defaultStorage: CacheStorage;
  /** Entry type configurations */
  entries: Record<string, CacheEntryConfig>;
  /** Global settings */
  global: {
    /** Maximum total cache size in bytes (memory cache) */
    maxSize: number;
    /** Whether to compress large entries */
    compress: boolean;
    /** Minimum size for compression in bytes */
    compressionThreshold: number;
  };
}

// =============================================================================
// Time Constants
// =============================================================================

/** Time constants in milliseconds */
export const TTL = {
  /** 10 seconds - frequently changing data */
  VERY_SHORT: 10_000,
  /** 30 seconds - moderately dynamic */
  SHORT: 30_000,
  /** 1 minute - standard cache duration */
  MEDIUM: 60_000,
  /** 5 minutes - stable data */
  LONG: 300_000,
  /** 1 hour - rarely changing */
  VERY_LONG: 3_600_000,
  /** 24 hours - static data */
  DAY: 86_400_000,
  /** Never expires (use with caution) */
  FOREVER: Infinity,
} as const;

// =============================================================================
// Default Entry Configurations
// =============================================================================

/**
 * Pre-defined cache entry configurations for common data types
 */
export const ENTRY_CONFIGS: Record<string, CacheEntryConfig> = {
  // Public state values
  publicState: {
    name: 'Public Contract State',
    sensitivity: DataSensitivity.PUBLIC,
    allowedStorage: ['memory', 'localStorage', 'indexedDB'],
    defaultTTL: TTL.MEDIUM,
    maxTTL: TTL.VERY_LONG,
    description: 'On-chain contract state values (balances, totals, etc.)',
  },

  // Contract metadata
  contractMetadata: {
    name: 'Contract Metadata',
    sensitivity: DataSensitivity.PUBLIC,
    allowedStorage: ['memory', 'localStorage', 'indexedDB'],
    defaultTTL: TTL.VERY_LONG,
    maxTTL: TTL.DAY,
    description: 'Contract addresses, ABIs, deployment info',
  },

  // Block numbers and chain info
  chainInfo: {
    name: 'Chain Information',
    sensitivity: DataSensitivity.PUBLIC,
    allowedStorage: ['memory', 'localStorage'],
    defaultTTL: TTL.VERY_SHORT,
    maxTTL: TTL.SHORT,
    description: 'Block numbers, timestamps, network status',
  },

  // Transaction history (confirmed)
  transactionHistory: {
    name: 'Transaction History',
    sensitivity: DataSensitivity.PUBLIC,
    allowedStorage: ['memory', 'localStorage', 'indexedDB'],
    defaultTTL: TTL.LONG,
    maxTTL: TTL.DAY,
    description: 'Confirmed transaction records',
  },

  // User preferences (non-sensitive)
  userPreferences: {
    name: 'User Preferences',
    sensitivity: DataSensitivity.PRIVATE_LOCAL,
    allowedStorage: ['localStorage'],
    defaultTTL: TTL.FOREVER,
    maxTTL: TTL.FOREVER,
    description: 'UI preferences, display settings',
  },

  // Session tokens
  sessionData: {
    name: 'Session Data',
    sensitivity: DataSensitivity.SESSION_ONLY,
    allowedStorage: ['memory', 'sessionStorage'],
    defaultTTL: TTL.VERY_LONG,
    maxTTL: TTL.DAY,
    description: 'Session tokens, temporary auth data',
  },

  // Computed values (derived from state)
  computedValues: {
    name: 'Computed Values',
    sensitivity: DataSensitivity.PUBLIC,
    allowedStorage: ['memory'],
    defaultTTL: TTL.SHORT,
    maxTTL: TTL.MEDIUM,
    description: 'Aggregations, formatted displays, UI computations',
  },

  // NEVER CACHE THESE
  witnessData: {
    name: 'Witness Data',
    sensitivity: DataSensitivity.NEVER,
    allowedStorage: [],
    defaultTTL: 0,
    maxTTL: 0,
    description: 'Private inputs for ZK proofs - NEVER CACHE',
  },

  secretKeys: {
    name: 'Secret Keys',
    sensitivity: DataSensitivity.NEVER,
    allowedStorage: [],
    defaultTTL: 0,
    maxTTL: 0,
    description: 'Cryptographic secrets - NEVER CACHE',
  },

  proofInputs: {
    name: 'Proof Inputs',
    sensitivity: DataSensitivity.NEVER,
    allowedStorage: [],
    defaultTTL: 0,
    maxTTL: 0,
    description: 'Pre-proof transaction data - NEVER CACHE',
  },
};

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default cache configuration
 */
export const defaultCacheConfig: CacheConfig = {
  prefix: 'midnight-dapp',
  version: 1,
  defaultStorage: 'memory',
  entries: ENTRY_CONFIGS,
  global: {
    maxSize: 10 * 1024 * 1024, // 10MB
    compress: false,
    compressionThreshold: 10 * 1024, // 10KB
  },
};

// =============================================================================
// Validation
// =============================================================================

/**
 * Check if a data type can be cached to a specific storage
 */
export function canCache(
  entryType: string,
  storage: CacheStorage,
  config: CacheConfig = defaultCacheConfig
): boolean {
  const entry = config.entries[entryType];

  if (!entry) {
    // Unknown entry type - default to not cacheable
    return false;
  }

  if (entry.sensitivity === DataSensitivity.NEVER) {
    return false;
  }

  return entry.allowedStorage.includes(storage);
}

/**
 * Get the recommended TTL for a data type
 */
export function getRecommendedTTL(
  entryType: string,
  config: CacheConfig = defaultCacheConfig
): number {
  const entry = config.entries[entryType];
  return entry?.defaultTTL ?? TTL.MEDIUM;
}

/**
 * Validate a TTL against entry configuration
 */
export function validateTTL(
  entryType: string,
  ttl: number,
  config: CacheConfig = defaultCacheConfig
): number {
  const entry = config.entries[entryType];

  if (!entry) {
    return Math.min(ttl, TTL.MEDIUM);
  }

  return Math.min(ttl, entry.maxTTL);
}

/**
 * Generate a cache key with proper prefix
 */
export function generateCacheKey(
  entryType: string,
  identifier: string,
  config: CacheConfig = defaultCacheConfig
): string {
  return `${config.prefix}:v${config.version}:${entryType}:${identifier}`;
}

// =============================================================================
// Safety Checks
// =============================================================================

/**
 * List of patterns that should NEVER be cached
 */
export const NEVER_CACHE_PATTERNS = [
  /secret/i,
  /private.*key/i,
  /witness/i,
  /proof.*input/i,
  /password/i,
  /mnemonic/i,
  /seed/i,
  /signature.*data/i,
];

/**
 * Check if a key matches a forbidden pattern
 */
export function isForbiddenKey(key: string): boolean {
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitize data before caching - removes forbidden fields
 */
export function sanitizeForCache<T extends Record<string, unknown>>(
  data: T,
  forbiddenFields: string[] = ['secretKey', 'privateKey', 'witness', 'proofInput']
): Partial<T> {
  const sanitized: Partial<T> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!forbiddenFields.includes(key) && !isForbiddenKey(key)) {
      sanitized[key as keyof T] = value as T[keyof T];
    }
  }

  return sanitized;
}
