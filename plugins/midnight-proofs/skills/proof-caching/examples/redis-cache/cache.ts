/**
 * Redis-Based Proof Cache
 *
 * Distributed proof caching using Redis for high-availability
 * and cross-instance cache sharing.
 */

import Redis from 'ioredis';
import { createHash } from 'crypto';
import Redlock from 'redlock';

// Types
interface CacheConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  ttl: {
    verification: number;  // seconds
    proof: number;         // seconds
  };
  prefix: string;
}

interface VerificationCacheEntry {
  valid: boolean;
  circuitId: string;
  verifiedAt: number;
}

interface ProofCacheEntry {
  proof: string;  // base64 encoded
  circuitId: string;
  generatedAt: number;
}

// Utility functions
function hashBytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

function hashObject(obj: unknown): string {
  const json = JSON.stringify(obj, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

// Redis Proof Cache implementation
export class RedisProofCache {
  private redis: Redis;
  private redlock: Redlock;
  private config: CacheConfig;

  // Metrics
  private hits = 0;
  private misses = 0;

  constructor(config: CacheConfig) {
    this.config = config;
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redlock = new Redlock([this.redis], {
      driftFactor: 0.01,
      retryCount: 3,
      retryDelay: 200,
    });
  }

  // Verification caching

  async getVerification(
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>
  ): Promise<boolean | undefined> {
    const key = this.buildVerificationKey(circuitId, proof, publicInputs);

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.hits++;
        const entry: VerificationCacheEntry = JSON.parse(cached);
        return entry.valid;
      }
      this.misses++;
      return undefined;
    } catch (error) {
      console.error('Cache get error:', error);
      return undefined;
    }
  }

  async setVerification(
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>,
    valid: boolean
  ): Promise<void> {
    const key = this.buildVerificationKey(circuitId, proof, publicInputs);

    const entry: VerificationCacheEntry = {
      valid,
      circuitId,
      verifiedAt: Date.now(),
    };

    try {
      await this.redis.setex(
        key,
        this.config.ttl.verification,
        JSON.stringify(entry)
      );
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  // Proof caching

  async getProof(
    circuitId: string,
    witness: Record<string, unknown>
  ): Promise<Uint8Array | undefined> {
    const key = this.buildProofKey(circuitId, witness);

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.hits++;
        const entry: ProofCacheEntry = JSON.parse(cached);
        return Buffer.from(entry.proof, 'base64');
      }
      this.misses++;
      return undefined;
    } catch (error) {
      console.error('Cache get error:', error);
      return undefined;
    }
  }

  async setProof(
    circuitId: string,
    witness: Record<string, unknown>,
    proof: Uint8Array
  ): Promise<void> {
    const key = this.buildProofKey(circuitId, witness);

    const entry: ProofCacheEntry = {
      proof: Buffer.from(proof).toString('base64'),
      circuitId,
      generatedAt: Date.now(),
    };

    try {
      await this.redis.setex(
        key,
        this.config.ttl.proof,
        JSON.stringify(entry)
      );
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  // Batch operations

  async getVerificationBatch(
    items: Array<{
      circuitId: string;
      proof: Uint8Array;
      publicInputs: Record<string, unknown>;
    }>
  ): Promise<Map<number, boolean>> {
    const keys = items.map((item) =>
      this.buildVerificationKey(item.circuitId, item.proof, item.publicInputs)
    );

    const results = new Map<number, boolean>();

    try {
      const cached = await this.redis.mget(keys);

      cached.forEach((value, index) => {
        if (value) {
          this.hits++;
          const entry: VerificationCacheEntry = JSON.parse(value);
          results.set(index, entry.valid);
        } else {
          this.misses++;
        }
      });
    } catch (error) {
      console.error('Batch get error:', error);
    }

    return results;
  }

  async setVerificationBatch(
    items: Array<{
      circuitId: string;
      proof: Uint8Array;
      publicInputs: Record<string, unknown>;
      valid: boolean;
    }>
  ): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const item of items) {
      const key = this.buildVerificationKey(
        item.circuitId,
        item.proof,
        item.publicInputs
      );

      const entry: VerificationCacheEntry = {
        valid: item.valid,
        circuitId: item.circuitId,
        verifiedAt: Date.now(),
      };

      pipeline.setex(key, this.config.ttl.verification, JSON.stringify(entry));
    }

    try {
      await pipeline.exec();
    } catch (error) {
      console.error('Batch set error:', error);
    }
  }

  // Cache stampede prevention

  async computeWithLock<T>(
    key: string,
    compute: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    // Try cache first
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Acquire lock
    const lockKey = `${this.config.prefix}:lock:${key}`;
    const lock = await this.redlock.acquire([lockKey], 10000);

    try {
      // Double-check cache
      const rechecked = await this.redis.get(key);
      if (rechecked) {
        return JSON.parse(rechecked);
      }

      // Compute
      const value = await compute();

      // Cache result
      await this.redis.setex(key, ttl, JSON.stringify(value));

      return value;
    } finally {
      await lock.release();
    }
  }

  // Invalidation

  async invalidateCircuit(circuitId: string): Promise<number> {
    const pattern = `${this.config.prefix}:*:${circuitId}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    return keys.length;
  }

  async invalidateAll(): Promise<void> {
    const pattern = `${this.config.prefix}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Metrics

  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  // Key builders

  private buildVerificationKey(
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>
  ): string {
    return `${this.config.prefix}:verify:${circuitId}:${hashBytes(proof)}:${hashObject(publicInputs)}`;
  }

  private buildProofKey(
    circuitId: string,
    witness: Record<string, unknown>
  ): string {
    return `${this.config.prefix}:proof:${circuitId}:${hashObject(witness)}`;
  }

  // Lifecycle

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Factory function
export function createRedisProofCache(config?: Partial<CacheConfig>): RedisProofCache {
  const fullConfig: CacheConfig = {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    },
    ttl: {
      verification: 3600,  // 1 hour
      proof: 900,          // 15 minutes
    },
    prefix: 'midnight:proofs',
    ...config,
  };

  return new RedisProofCache(fullConfig);
}

// Example usage
async function main(): Promise<void> {
  const cache = createRedisProofCache();

  // Cache a verification result
  const circuitId = 'transfer';
  const proof = new Uint8Array(256);
  const publicInputs = { amount: 100n, recipient: '0x1234' };

  await cache.setVerification(circuitId, proof, publicInputs, true);

  // Retrieve from cache
  const cached = await cache.getVerification(circuitId, proof, publicInputs);
  console.log('Cached result:', cached);

  // Get stats
  console.log('Cache stats:', cache.getStats());

  await cache.close();
}

main().catch(console.error);
