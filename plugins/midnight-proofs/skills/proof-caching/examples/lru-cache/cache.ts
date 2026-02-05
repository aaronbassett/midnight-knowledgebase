/**
 * In-Memory LRU Proof Cache
 *
 * Lightweight in-memory caching for single-instance deployments
 * or as an L1 cache in multi-level caching architectures.
 */

import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';

// Types
interface CacheConfig {
  maxVerificationEntries: number;
  maxProofEntries: number;
  verificationTtl: number;  // milliseconds
  proofTtl: number;         // milliseconds
}

interface VerificationEntry {
  valid: boolean;
  circuitId: string;
  verifiedAt: number;
}

interface ProofEntry {
  proof: Uint8Array;
  circuitId: string;
  generatedAt: number;
}

interface CacheStats {
  verificationHits: number;
  verificationMisses: number;
  proofHits: number;
  proofMisses: number;
  verificationSize: number;
  proofSize: number;
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

// LRU Proof Cache implementation
export class LRUProofCache {
  private verificationCache: LRUCache<string, VerificationEntry>;
  private proofCache: LRUCache<string, ProofEntry>;

  // Metrics
  private verificationHits = 0;
  private verificationMisses = 0;
  private proofHits = 0;
  private proofMisses = 0;

  constructor(config: CacheConfig) {
    this.verificationCache = new LRUCache<string, VerificationEntry>({
      max: config.maxVerificationEntries,
      ttl: config.verificationTtl,
      updateAgeOnGet: true,
      dispose: (value, key) => {
        // Optional: log evictions for debugging
        // console.debug('Evicted verification:', key);
      },
    });

    this.proofCache = new LRUCache<string, ProofEntry>({
      max: config.maxProofEntries,
      ttl: config.proofTtl,
      updateAgeOnGet: true,
      // Calculate size based on proof bytes
      maxSize: 100 * 1024 * 1024, // 100MB max
      sizeCalculation: (entry) => entry.proof.length,
    });
  }

  // Verification caching

  getVerification(
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>
  ): boolean | undefined {
    const key = this.buildVerificationKey(circuitId, proof, publicInputs);
    const entry = this.verificationCache.get(key);

    if (entry) {
      this.verificationHits++;
      return entry.valid;
    }

    this.verificationMisses++;
    return undefined;
  }

  setVerification(
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>,
    valid: boolean
  ): void {
    const key = this.buildVerificationKey(circuitId, proof, publicInputs);

    this.verificationCache.set(key, {
      valid,
      circuitId,
      verifiedAt: Date.now(),
    });
  }

  // Proof caching

  getProof(
    circuitId: string,
    witness: Record<string, unknown>
  ): Uint8Array | undefined {
    const key = this.buildProofKey(circuitId, witness);
    const entry = this.proofCache.get(key);

    if (entry) {
      this.proofHits++;
      return entry.proof;
    }

    this.proofMisses++;
    return undefined;
  }

  setProof(
    circuitId: string,
    witness: Record<string, unknown>,
    proof: Uint8Array
  ): void {
    const key = this.buildProofKey(circuitId, witness);

    this.proofCache.set(key, {
      proof,
      circuitId,
      generatedAt: Date.now(),
    });
  }

  // Compute-if-absent pattern

  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    cache: 'verification' | 'proof' = 'verification'
  ): Promise<T> {
    const targetCache =
      cache === 'verification' ? this.verificationCache : this.proofCache;

    const existing = targetCache.get(key);
    if (existing) {
      return existing as T;
    }

    const value = await compute();
    targetCache.set(key, value as any);
    return value;
  }

  // Verification with caching wrapper

  async verifyWithCache(
    verifier: { verify: (c: string, p: Uint8Array, i: Record<string, unknown>) => Promise<{ valid: boolean }> },
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>
  ): Promise<boolean> {
    // Check cache
    const cached = this.getVerification(circuitId, proof, publicInputs);
    if (cached !== undefined) {
      return cached;
    }

    // Verify
    const result = await verifier.verify(circuitId, proof, publicInputs);

    // Cache result
    this.setVerification(circuitId, proof, publicInputs, result.valid);

    return result.valid;
  }

  // Invalidation

  invalidateCircuit(circuitId: string): void {
    // LRUCache doesn't support pattern-based deletion easily,
    // so we iterate and remove matching entries
    for (const key of this.verificationCache.keys()) {
      if (key.includes(`:${circuitId}:`)) {
        this.verificationCache.delete(key);
      }
    }

    for (const key of this.proofCache.keys()) {
      if (key.includes(`:${circuitId}:`)) {
        this.proofCache.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.verificationCache.clear();
    this.proofCache.clear();
  }

  // Stats

  getStats(): CacheStats {
    return {
      verificationHits: this.verificationHits,
      verificationMisses: this.verificationMisses,
      proofHits: this.proofHits,
      proofMisses: this.proofMisses,
      verificationSize: this.verificationCache.size,
      proofSize: this.proofCache.size,
    };
  }

  getHitRate(): { verification: number; proof: number } {
    const vTotal = this.verificationHits + this.verificationMisses;
    const pTotal = this.proofHits + this.proofMisses;

    return {
      verification: vTotal > 0 ? this.verificationHits / vTotal : 0,
      proof: pTotal > 0 ? this.proofHits / pTotal : 0,
    };
  }

  resetStats(): void {
    this.verificationHits = 0;
    this.verificationMisses = 0;
    this.proofHits = 0;
    this.proofMisses = 0;
  }

  // Key builders

  private buildVerificationKey(
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>
  ): string {
    return `verify:${circuitId}:${hashBytes(proof)}:${hashObject(publicInputs)}`;
  }

  private buildProofKey(
    circuitId: string,
    witness: Record<string, unknown>
  ): string {
    return `proof:${circuitId}:${hashObject(witness)}`;
  }
}

// Factory function with defaults
export function createLRUProofCache(config?: Partial<CacheConfig>): LRUProofCache {
  const fullConfig: CacheConfig = {
    maxVerificationEntries: 10000,
    maxProofEntries: 1000,
    verificationTtl: 1000 * 60 * 60,  // 1 hour
    proofTtl: 1000 * 60 * 15,         // 15 minutes
    ...config,
  };

  return new LRUProofCache(fullConfig);
}

// Singleton for simple use cases
let globalCache: LRUProofCache | null = null;

export function getGlobalCache(): LRUProofCache {
  if (!globalCache) {
    globalCache = createLRUProofCache();
  }
  return globalCache;
}

// Example usage
async function main(): Promise<void> {
  const cache = createLRUProofCache({
    maxVerificationEntries: 5000,
    verificationTtl: 1000 * 60 * 30, // 30 minutes
  });

  // Simulate verification caching
  const circuitId = 'transfer';
  const proof = new Uint8Array(256);
  const publicInputs = { amount: 100n, recipient: '0x1234' };

  // First access - miss
  let result = cache.getVerification(circuitId, proof, publicInputs);
  console.log('First access (should be undefined):', result);

  // Store result
  cache.setVerification(circuitId, proof, publicInputs, true);

  // Second access - hit
  result = cache.getVerification(circuitId, proof, publicInputs);
  console.log('Second access (should be true):', result);

  // Print stats
  console.log('Cache stats:', cache.getStats());
  console.log('Hit rates:', cache.getHitRate());

  // Demonstrate proof caching
  const witness = { sender: '0x1234', amount: 100n };
  const generatedProof = new Uint8Array(512);

  cache.setProof(circuitId, witness, generatedProof);
  const cachedProof = cache.getProof(circuitId, witness);
  console.log('Cached proof length:', cachedProof?.length);

  // Final stats
  console.log('Final stats:', cache.getStats());
}

main().catch(console.error);
