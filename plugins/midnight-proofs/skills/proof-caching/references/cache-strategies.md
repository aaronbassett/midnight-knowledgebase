# Proof Caching Strategies

Effective caching strategies can significantly improve the performance of proof generation and verification services.

## Caching Strategies Overview

### 1. Verification Result Caching

The most common and safest caching strategy. Proofs are immutable, so verification results can be cached indefinitely.

**When to use:**
- High-volume verification services
- Multiple clients verifying the same proofs
- Read-heavy workloads

**Implementation:**

```typescript
interface VerificationCacheEntry {
  valid: boolean;
  circuitId: string;
  verifiedAt: number;
}

// Cache key based on proof and public inputs
function buildVerificationKey(
  circuitId: string,
  proof: Uint8Array,
  publicInputs: Record<string, unknown>
): string {
  const proofHash = hashBytes(proof);
  const inputsHash = hashObject(publicInputs);
  return `verify:v1:${circuitId}:${proofHash}:${inputsHash}`;
}
```

**TTL Recommendations:**
- Proofs are immutable, so long TTLs are safe
- 24 hours to 7 days for most cases
- Shorter for memory-constrained environments

### 2. Proof Caching (Generated Proofs)

Caching generated proofs for potential reuse. More complex due to state dependencies.

**When to use:**
- Repeated identical transactions
- Batch processing with duplicate inputs
- Development/testing environments

**Caution:** State-dependent proofs may become invalid if underlying state changes.

**Implementation:**

```typescript
interface ProofCacheEntry {
  proof: Uint8Array;
  circuitId: string;
  witnessHash: string;
  generatedAt: number;
  stateVersion?: number;
}

function buildProofKey(
  circuitId: string,
  witness: WitnessData,
  stateVersion?: number
): string {
  const witnessHash = hashObject(witness);
  const version = stateVersion ? `:v${stateVersion}` : '';
  return `proof:${circuitId}:${witnessHash}${version}`;
}
```

**TTL Recommendations:**
- 5-15 minutes for state-dependent proofs
- Longer for stateless proofs (pure computations)
- Invalidate on state changes

### 3. Circuit Key Caching

Cache loaded circuit proving/verification keys in memory.

**When to use:**
- Always - circuit keys rarely change
- Pre-load frequently used circuits at startup

**Implementation:**

```typescript
class CircuitKeyCache {
  private provingKeys = new Map<string, ProvingKey>();
  private verificationKeys = new Map<string, VerificationKey>();

  async getProvingKey(circuitId: string): Promise<ProvingKey> {
    let key = this.provingKeys.get(circuitId);
    if (!key) {
      key = await loadProvingKey(circuitId);
      this.provingKeys.set(circuitId, key);
    }
    return key;
  }

  invalidate(circuitId: string): void {
    this.provingKeys.delete(circuitId);
    this.verificationKeys.delete(circuitId);
  }

  invalidateAll(): void {
    this.provingKeys.clear();
    this.verificationKeys.clear();
  }
}
```

**TTL Recommendations:**
- Keep in memory until contract upgrade
- Implement invalidation hooks for contract deployments

## Cache Eviction Policies

### LRU (Least Recently Used)

Best for verification caches where recent proofs are more likely to be re-verified.

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, VerificationCacheEntry>({
  max: 10000,
  ttl: 1000 * 60 * 60, // 1 hour
  updateAgeOnGet: true, // Reset TTL on access
});
```

### LFU (Least Frequently Used)

Better for proof caches where some proofs are accessed much more often than others.

```typescript
import { LFUCache } from 'lfu-cache';

const cache = new LFUCache<string, ProofCacheEntry>({
  max: 5000,
});
```

### TTL-Based Expiration

Essential for state-dependent data.

```typescript
const cache = new LRUCache<string, CacheEntry>({
  max: 10000,
  ttl: 1000 * 60 * 15, // 15 minutes
  ttlAutopurge: true,  // Automatically remove expired entries
});
```

## Cache Invalidation Strategies

### Time-Based Invalidation

```typescript
// Set TTL when caching
await redis.setex(key, ttlSeconds, value);

// Check freshness on read
const entry = await cache.get(key);
if (entry && Date.now() - entry.cachedAt > maxAge) {
  await cache.delete(key);
  return undefined;
}
```

### Event-Based Invalidation

```typescript
// Listen for state changes
stateEvents.on('contractStateChanged', async (contractAddress: string) => {
  // Invalidate all proofs for this contract
  const pattern = `proof:${contractAddress}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
});
```

### Version-Based Invalidation

```typescript
interface VersionedCacheEntry {
  value: unknown;
  version: number;
}

class VersionedCache {
  private currentVersion = 1;

  async get(key: string): Promise<unknown | undefined> {
    const entry = await this.storage.get(key);
    if (!entry || entry.version !== this.currentVersion) {
      return undefined;
    }
    return entry.value;
  }

  invalidateAll(): void {
    this.currentVersion++;
  }
}
```

## Distributed Caching with Redis

### Connection Pooling

```typescript
import Redis from 'ioredis';

const redis = new Redis.Cluster([
  { host: 'redis-1', port: 6379 },
  { host: 'redis-2', port: 6379 },
  { host: 'redis-3', port: 6379 },
], {
  scaleReads: 'slave',
  redisOptions: {
    maxRetriesPerRequest: 3,
  },
});
```

### Batch Operations

```typescript
async function batchGet(keys: string[]): Promise<Map<string, string>> {
  const values = await redis.mget(keys);
  const results = new Map<string, string>();

  keys.forEach((key, i) => {
    if (values[i] !== null) {
      results.set(key, values[i]);
    }
  });

  return results;
}

async function batchSet(
  entries: Array<{ key: string; value: string; ttl: number }>
): Promise<void> {
  const pipeline = redis.pipeline();

  for (const entry of entries) {
    pipeline.setex(entry.key, entry.ttl, entry.value);
  }

  await pipeline.exec();
}
```

### Cache Stampede Prevention

```typescript
import Redlock from 'redlock';

const redlock = new Redlock([redis]);

async function computeWithLock<T>(
  key: string,
  compute: () => Promise<T>,
  ttl: number
): Promise<T> {
  // Check cache first
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  // Acquire lock
  const lock = await redlock.acquire([`lock:${key}`], 5000);

  try {
    // Double-check cache after acquiring lock
    const rechecked = await redis.get(key);
    if (rechecked) {
      return JSON.parse(rechecked);
    }

    // Compute and cache
    const value = await compute();
    await redis.setex(key, ttl, JSON.stringify(value));
    return value;
  } finally {
    await lock.release();
  }
}
```

## Monitoring and Metrics

### Key Metrics to Track

| Metric | Description | Target |
|--------|-------------|--------|
| Hit Rate | Percentage of requests served from cache | > 90% |
| Miss Rate | Percentage of cache misses | < 10% |
| Latency (hit) | Time to serve from cache | < 1ms |
| Latency (miss) | Time to compute and cache | Varies |
| Eviction Rate | Entries evicted due to size limit | Low |
| Memory Usage | Cache memory consumption | Within limits |

### Implementing Metrics

```typescript
import { Counter, Histogram } from 'prom-client';

const cacheHits = new Counter({
  name: 'proof_cache_hits_total',
  help: 'Total proof cache hits',
  labelNames: ['circuit_id'],
});

const cacheMisses = new Counter({
  name: 'proof_cache_misses_total',
  help: 'Total proof cache misses',
  labelNames: ['circuit_id'],
});

const cacheLatency = new Histogram({
  name: 'proof_cache_latency_seconds',
  help: 'Cache operation latency',
  labelNames: ['operation', 'hit'],
});
```

## Best Practices

1. **Start with verification caching** - safest and most beneficial
2. **Use appropriate TTLs** - balance freshness and performance
3. **Implement invalidation** - for state-dependent caches
4. **Monitor hit rates** - tune cache size based on usage
5. **Use multi-level caching** - L1 in-memory, L2 Redis
6. **Handle cache failures gracefully** - fall back to computation
7. **Version your cache keys** - `v1:verify:...` for easy migration
8. **Consider cache warming** - pre-populate common entries
