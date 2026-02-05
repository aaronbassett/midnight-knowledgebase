# Privacy-Aware Caching

Safe caching strategies for Midnight DApps that respect the privacy model.

## Overview

Midnight's dual-state model requires careful consideration of what can be cached and where. Improper caching can leak private data or compromise security.

## Caching Rules

### What's Safe to Cache

| Data Type | Cache Locally | Cache Remotely | Notes |
|-----------|---------------|----------------|-------|
| Public ledger state | Yes | Yes | Already public on-chain |
| Contract addresses | Yes | Yes | Public deployment info |
| Block numbers | Yes | Yes | Public chain data |
| Transaction hashes | Yes | Yes | Public after submission |
| Private state | Yes (encrypted) | **Never** | User's browser only |
| Witness data | **Never** | **Never** | Discard after proof |
| Secret keys | **Never** | **Never** | Only in memory during use |

### What Must Never Be Cached

1. **Witness Inputs** - Private circuit inputs should never be persisted
2. **Pre-proof Transaction Data** - Contains unproven private information
3. **Secret Keys** - Only hold in memory, never localStorage
4. **Decrypted Private State** - Only in memory during session

## Public State Caching

### Memory Cache

Simple in-memory cache for session data:

```typescript
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, value: T, ttlMs: number = 60000): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// Usage
const stateCache = new MemoryCache();

async function getCachedBalance(contract: Contract, address: string): Promise<bigint> {
  const cacheKey = `balance:${contract.address}:${address}`;

  const cached = stateCache.get<bigint>(cacheKey);
  if (cached !== null) return cached;

  const balance = await contract.state.balances.get(address);
  stateCache.set(cacheKey, balance ?? 0n, 30000); // 30s TTL

  return balance ?? 0n;
}
```

### localStorage for Public Data

Safe for public state that persists across sessions:

```typescript
interface StoredCacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class LocalStorageCache {
  private prefix: string;

  constructor(prefix: string = 'midnight-dapp') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  set<T>(key: string, value: T, ttlMs: number = 300000): void {
    const entry: StoredCacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttlMs,
    };
    localStorage.setItem(this.getKey(key), JSON.stringify(entry));
  }

  get<T>(key: string): T | null {
    const stored = localStorage.getItem(this.getKey(key));
    if (!stored) return null;

    try {
      const entry: StoredCacheEntry<T> = JSON.parse(stored);

      // Check expiration
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.invalidate(key);
        return null;
      }

      return entry.value;
    } catch {
      return null;
    }
  }

  invalidate(key: string): void {
    localStorage.removeItem(this.getKey(key));
  }

  clearAll(): void {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    }
  }
}

// Only use for public data!
const publicCache = new LocalStorageCache('my-dapp-public');

// Safe: Contract metadata is public
publicCache.set('contract:metadata', contractInfo, 86400000); // 24h

// Safe: Public state values
publicCache.set(`state:totalSupply`, totalSupply.toString(), 60000);
```

### IndexedDB for Larger Datasets

For larger public datasets:

```typescript
async function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('midnight-cache', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('publicState')) {
        const store = db.createObjectStore('publicState', { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp');
      }
    };
  });
}

async function cachePublicState(key: string, value: unknown, ttlMs: number): Promise<void> {
  const db = await openCacheDB();
  const tx = db.transaction('publicState', 'readwrite');
  const store = tx.objectStore('publicState');

  store.put({
    key,
    value,
    timestamp: Date.now(),
    ttl: ttlMs,
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

## Private State Handling

### LevelDB Provider

Private state is stored securely via the SDK's LevelDB provider:

```typescript
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';

// The SDK handles secure browser storage
const privateStateProvider = levelPrivateStateProvider({
  privateStateStoreName: 'my-dapp-private', // Unique per DApp
});
```

**Important**: This is the ONLY approved method for persisting private state. Do not attempt to cache private state elsewhere.

### Session-Only Private Data

Some private data should only exist in memory:

```typescript
// Session-only storage - never persisted
class SessionPrivateStore {
  private data = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  // Clear everything on logout/disconnect
  clear(): void {
    this.data.clear();
  }
}

const sessionStore = new SessionPrivateStore();

// Clear on page unload
window.addEventListener('beforeunload', () => {
  sessionStore.clear();
});
```

## Cache Invalidation Strategies

### Time-Based Expiration

```typescript
const TTL = {
  SHORT: 10_000,      // 10 seconds - frequently changing data
  MEDIUM: 60_000,     // 1 minute - moderate change rate
  LONG: 300_000,      // 5 minutes - stable data
  VERY_LONG: 3600_000 // 1 hour - rarely changing data
};

// Use appropriate TTL based on data volatility
cache.set('fastChangingState', value, TTL.SHORT);
cache.set('contractMetadata', metadata, TTL.VERY_LONG);
```

### Event-Based Invalidation

```typescript
class EventInvalidatingCache {
  private cache = new MemoryCache();
  private subscriptions = new Map<string, Set<string>>();

  // Cache with event subscription
  setWithEvent(key: string, value: unknown, event: string): void {
    this.cache.set(key, value, Infinity); // No TTL, event-based

    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)?.add(key);
  }

  // Invalidate all entries for an event
  invalidateEvent(event: string): void {
    const keys = this.subscriptions.get(event);
    if (keys) {
      for (const key of keys) {
        this.cache.invalidate(key);
      }
    }
  }
}

// Usage
const cache = new EventInvalidatingCache();

// Cache balance, invalidate on transfer
cache.setWithEvent(`balance:${address}`, balance, 'transfer');

// When transfer happens
cache.invalidateEvent('transfer');
```

### Version-Based Invalidation

```typescript
interface VersionedCache {
  version: number;
  data: Map<string, unknown>;
}

class VersionedCacheManager {
  private currentVersion: number;
  private cache = new Map<string, unknown>();

  constructor(version: number) {
    this.currentVersion = version;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    const stored = localStorage.getItem('cache-version');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version !== this.currentVersion) {
        // Version mismatch - clear cache
        localStorage.removeItem('cache-data');
      }
    }
    localStorage.setItem('cache-version', JSON.stringify({
      version: this.currentVersion,
    }));
  }
}
```

## Security Considerations

### Never Cache Sensitive Data

```typescript
// DANGEROUS - never do this!
localStorage.setItem('secretKey', secretKey); // WRONG!
localStorage.setItem('witnessData', JSON.stringify(witness)); // WRONG!

// SAFE - only cache public data
localStorage.setItem('publicBalance', balance.toString()); // OK
```

### Secure Logout

Clear all cached data on disconnect:

```typescript
function secureLogout(): void {
  // Clear memory caches
  memoryCache.clear();
  sessionStore.clear();

  // Clear localStorage (public cache only)
  publicCache.clearAll();

  // SDK handles private state provider cleanup
  // Do not manually clear LevelDB - let SDK manage it
}
```

### Browser Security Headers

Ensure your DApp sets appropriate headers:

```http
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
```

## Cache Configuration Example

```typescript
interface CacheConfig {
  // Public state caching
  publicState: {
    enabled: boolean;
    storage: 'memory' | 'localStorage' | 'indexedDB';
    defaultTTL: number;
  };

  // Private state - always LevelDB via SDK
  privateState: {
    // No configuration needed - SDK handles this
    // Just document that it exists
  };

  // Never cache list
  neverCache: string[];
}

const defaultCacheConfig: CacheConfig = {
  publicState: {
    enabled: true,
    storage: 'memory',
    defaultTTL: 60000,
  },
  privateState: {
    // Managed by SDK's levelPrivateStateProvider
  },
  neverCache: [
    'witnessData',
    'proofInputs',
    'secretKey',
    'privateKey',
    'encryptionKey',
  ],
};
```

## Best Practices Summary

1. **Default to memory cache** - Safest option, clears on page close
2. **localStorage only for public data** - Never private or sensitive
3. **Use SDK for private state** - `levelPrivateStateProvider` only
4. **Never cache witnesses** - Discard immediately after proof
5. **Clear on logout** - All caches, all storage
6. **Validate before caching** - Ensure data is actually public
7. **Set reasonable TTLs** - Match data volatility
8. **Monitor cache size** - Implement eviction for memory caches
