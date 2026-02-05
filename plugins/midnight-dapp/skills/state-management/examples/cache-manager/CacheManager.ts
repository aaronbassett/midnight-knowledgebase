/**
 * CacheManager - Privacy-aware caching utilities for Midnight DApps
 *
 * Provides type-safe caching with automatic privacy checks to ensure
 * sensitive data is never inappropriately cached.
 */

import {
  type CacheConfig,
  type CacheStorage,
  DataSensitivity,
  defaultCacheConfig,
  canCache,
  validateTTL,
  generateCacheKey,
  isForbiddenKey,
  ENTRY_CONFIGS,
} from './cacheConfig';

// =============================================================================
// Types
// =============================================================================

/**
 * Cached entry with metadata
 */
interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when cached */
  timestamp: number;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Entry type for validation */
  entryType: string;
}

/**
 * Statistics for cache performance monitoring
 */
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
}

/**
 * Options for cache operations
 */
interface CacheOptions {
  /** Override default TTL */
  ttl?: number;
  /** Force cache even if normally not allowed (use with caution) */
  force?: boolean;
}

// =============================================================================
// Memory Cache Implementation
// =============================================================================

/**
 * Privacy-aware cache manager
 */
export class CacheManager {
  private memoryCache = new Map<string, CacheEntry<unknown>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    size: 0,
  };
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...defaultCacheConfig, ...config };
  }

  // ===========================================================================
  // Core Operations
  // ===========================================================================

  /**
   * Get a value from cache
   */
  get<T>(entryType: string, identifier: string): T | null {
    const key = generateCacheKey(entryType, identifier, this.config);
    const entry = this.memoryCache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set a value in cache with privacy checks
   */
  set<T>(
    entryType: string,
    identifier: string,
    value: T,
    options: CacheOptions = {}
  ): boolean {
    // Privacy check - refuse to cache forbidden data
    if (!options.force && !this.canCacheEntry(entryType, identifier)) {
      console.warn(
        `CacheManager: Refusing to cache "${entryType}:${identifier}" - privacy check failed`
      );
      return false;
    }

    const key = generateCacheKey(entryType, identifier, this.config);
    const entryConfig = this.config.entries[entryType];
    const ttl = options.ttl
      ? validateTTL(entryType, options.ttl, this.config)
      : entryConfig?.defaultTTL ?? 60000;

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl,
      entryType,
    };

    this.memoryCache.set(key, entry);
    this.stats.sets++;
    this.updateSize();

    // Check if we need to evict entries
    this.enforceMaxSize();

    return true;
  }

  /**
   * Delete a value from cache
   */
  delete(entryType: string, identifier: string): boolean {
    const key = generateCacheKey(entryType, identifier, this.config);
    const deleted = this.memoryCache.delete(key);

    if (deleted) {
      this.stats.deletes++;
      this.updateSize();
    }

    return deleted;
  }

  /**
   * Check if a value exists and is not expired
   */
  has(entryType: string, identifier: string): boolean {
    return this.get(entryType, identifier) !== null;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.memoryCache.clear();
    this.updateSize();
  }

  /**
   * Clear entries matching a pattern
   */
  clearPattern(pattern: RegExp): number {
    let cleared = 0;

    for (const key of this.memoryCache.keys()) {
      if (pattern.test(key)) {
        this.memoryCache.delete(key);
        cleared++;
      }
    }

    this.updateSize();
    return cleared;
  }

  /**
   * Clear all entries for a specific entry type
   */
  clearEntryType(entryType: string): number {
    const pattern = new RegExp(`:${entryType}:`);
    return this.clearPattern(pattern);
  }

  // ===========================================================================
  // Convenience Methods
  // ===========================================================================

  /**
   * Get or set - returns cached value or fetches and caches
   */
  async getOrSet<T>(
    entryType: string,
    identifier: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = this.get<T>(entryType, identifier);

    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(entryType, identifier, value, options);
    return value;
  }

  /**
   * Invalidate and refresh - delete cached value and fetch new
   */
  async invalidateAndRefresh<T>(
    entryType: string,
    identifier: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    this.delete(entryType, identifier);
    const value = await fetcher();
    this.set(entryType, identifier, value, options);
    return value;
  }

  // ===========================================================================
  // Privacy Checks
  // ===========================================================================

  /**
   * Check if an entry can be cached
   */
  private canCacheEntry(entryType: string, identifier: string): boolean {
    // Check if identifier contains forbidden patterns
    if (isForbiddenKey(identifier)) {
      return false;
    }

    // Check entry type configuration
    if (!canCache(entryType, 'memory', this.config)) {
      return false;
    }

    // Check sensitivity level
    const entryConfig = this.config.entries[entryType];
    if (entryConfig?.sensitivity === DataSensitivity.NEVER) {
      return false;
    }

    return true;
  }

  /**
   * Validate that data doesn't contain sensitive fields
   */
  validateData<T extends Record<string, unknown>>(data: T): boolean {
    const sensitiveFields = ['secretKey', 'privateKey', 'witness', 'proofInput', 'mnemonic'];

    for (const field of sensitiveFields) {
      if (field in data) {
        console.warn(`CacheManager: Data contains sensitive field "${field}"`);
        return false;
      }
    }

    return true;
  }

  // ===========================================================================
  // Size Management
  // ===========================================================================

  /**
   * Update the size estimate
   */
  private updateSize(): void {
    let size = 0;

    for (const entry of this.memoryCache.values()) {
      size += this.estimateSize(entry.value);
    }

    this.stats.size = size;
  }

  /**
   * Estimate the size of a value in bytes
   */
  private estimateSize(value: unknown): number {
    const json = JSON.stringify(value);
    return json ? json.length * 2 : 0; // UTF-16 characters
  }

  /**
   * Enforce maximum cache size by evicting oldest entries
   */
  private enforceMaxSize(): void {
    if (this.stats.size <= this.config.global.maxSize) {
      return;
    }

    // Sort by timestamp (oldest first)
    const entries = Array.from(this.memoryCache.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp
    );

    // Evict until under limit
    for (const [key] of entries) {
      if (this.stats.size <= this.config.global.maxSize * 0.8) {
        break;
      }

      this.memoryCache.delete(key);
      this.stats.evictions++;
      this.updateSize();
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit ratio
   */
  getHitRatio(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: this.stats.size,
    };
  }
}

// =============================================================================
// LocalStorage Cache
// =============================================================================

/**
 * Privacy-aware localStorage cache for public data only
 */
export class LocalStorageCache {
  private prefix: string;
  private version: number;

  constructor(prefix: string = 'midnight-dapp', version: number = 1) {
    this.prefix = prefix;
    this.version = version;
    this.cleanStaleEntries();
  }

  /**
   * Get a value from localStorage
   */
  get<T>(entryType: string, identifier: string): T | null {
    // Only allow public data in localStorage
    const entryConfig = ENTRY_CONFIGS[entryType];
    if (entryConfig && entryConfig.sensitivity !== DataSensitivity.PUBLIC) {
      console.warn(
        `LocalStorageCache: Cannot retrieve non-public data "${entryType}" from localStorage`
      );
      return null;
    }

    const key = this.generateKey(entryType, identifier);

    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);

      // Check expiration
      if (Date.now() - entry.timestamp > entry.ttl) {
        localStorage.removeItem(key);
        return null;
      }

      return entry.value;
    } catch {
      return null;
    }
  }

  /**
   * Set a value in localStorage (public data only)
   */
  set<T>(
    entryType: string,
    identifier: string,
    value: T,
    ttl: number = 300000
  ): boolean {
    // Strict check - only PUBLIC data allowed
    const entryConfig = ENTRY_CONFIGS[entryType];
    if (!entryConfig || entryConfig.sensitivity !== DataSensitivity.PUBLIC) {
      console.warn(
        `LocalStorageCache: Refusing to store non-public data "${entryType}" in localStorage`
      );
      return false;
    }

    // Additional check for sensitive patterns in identifier
    if (isForbiddenKey(identifier)) {
      console.warn(
        `LocalStorageCache: Refusing to store data with sensitive identifier "${identifier}"`
      );
      return false;
    }

    const key = this.generateKey(entryType, identifier);
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: validateTTL(entryType, ttl),
      entryType,
    };

    try {
      localStorage.setItem(key, JSON.stringify(entry));
      return true;
    } catch (e) {
      // localStorage might be full
      console.warn('LocalStorageCache: Failed to store entry', e);
      return false;
    }
  }

  /**
   * Delete a value from localStorage
   */
  delete(entryType: string, identifier: string): void {
    const key = this.generateKey(entryType, identifier);
    localStorage.removeItem(key);
  }

  /**
   * Clear all entries for this cache
   */
  clear(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  /**
   * Generate a storage key
   */
  private generateKey(entryType: string, identifier: string): string {
    return `${this.prefix}:v${this.version}:${entryType}:${identifier}`;
  }

  /**
   * Clean up expired entries
   */
  private cleanStaleEntries(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(this.prefix)) continue;

      try {
        const stored = localStorage.getItem(key);
        if (!stored) continue;

        const entry: CacheEntry<unknown> = JSON.parse(stored);
        if (Date.now() - entry.timestamp > entry.ttl) {
          keysToRemove.push(key);
        }
      } catch {
        // Invalid entry, remove it
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a properly configured cache manager
 */
export function createCacheManager(
  appPrefix: string,
  version: number = 1
): {
  memory: CacheManager;
  localStorage: LocalStorageCache;
} {
  return {
    memory: new CacheManager({
      prefix: appPrefix,
      version,
    }),
    localStorage: new LocalStorageCache(appPrefix, version),
  };
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultInstance: CacheManager | null = null;

/**
 * Get the default cache manager instance
 */
export function getDefaultCacheManager(): CacheManager {
  if (!defaultInstance) {
    defaultInstance = new CacheManager();
  }
  return defaultInstance;
}
