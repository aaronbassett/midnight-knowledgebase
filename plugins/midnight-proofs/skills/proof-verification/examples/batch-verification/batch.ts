/**
 * Batch Proof Verification
 *
 * Verify multiple proofs efficiently in parallel.
 * Useful for high-throughput verification services.
 */

import {
  createVerifier,
  Verifier,
  VerifierError,
} from '@midnight-ntwrk/midnight-js-verifier';

// Types
interface ProofItem {
  id: string;
  circuitId: string;
  proof: Uint8Array;
  publicInputs: Record<string, unknown>;
}

interface BatchResult {
  totalCount: number;
  validCount: number;
  invalidCount: number;
  errorCount: number;
  totalDuration: number;
  results: ProofResult[];
}

interface ProofResult {
  id: string;
  valid: boolean;
  duration: number;
  error?: string;
}

// Batch verifier class
class BatchVerifier {
  private verifier: Verifier;
  private concurrency: number;

  constructor(verifier: Verifier, concurrency = 4) {
    this.verifier = verifier;
    this.concurrency = concurrency;
  }

  /**
   * Verify a batch of proofs with controlled concurrency
   */
  async verifyBatch(proofs: ProofItem[]): Promise<BatchResult> {
    const startTime = Date.now();
    const results: ProofResult[] = [];

    // Process in chunks to control concurrency
    for (let i = 0; i < proofs.length; i += this.concurrency) {
      const chunk = proofs.slice(i, i + this.concurrency);

      const chunkResults = await Promise.all(
        chunk.map((proof) => this.verifySingle(proof))
      );

      results.push(...chunkResults);
    }

    const validCount = results.filter((r) => r.valid).length;
    const errorCount = results.filter((r) => r.error).length;

    return {
      totalCount: proofs.length,
      validCount,
      invalidCount: proofs.length - validCount - errorCount,
      errorCount,
      totalDuration: Date.now() - startTime,
      results,
    };
  }

  /**
   * Verify a batch using the native batch API
   */
  async verifyBatchNative(proofs: ProofItem[]): Promise<BatchResult> {
    const startTime = Date.now();

    const batchInput = proofs.map((p) => ({
      circuitId: p.circuitId,
      proof: p.proof,
      publicInputs: p.publicInputs,
    }));

    const nativeResult = await this.verifier.verifyBatch(batchInput, {
      concurrency: this.concurrency,
    });

    const results: ProofResult[] = proofs.map((proof, index) => {
      const result = nativeResult.results.get(index);
      return {
        id: proof.id,
        valid: result?.valid ?? false,
        duration: result?.duration ?? 0,
      };
    });

    const validCount = results.filter((r) => r.valid).length;

    return {
      totalCount: proofs.length,
      validCount,
      invalidCount: proofs.length - validCount,
      errorCount: 0,
      totalDuration: Date.now() - startTime,
      results,
    };
  }

  /**
   * Verify a single proof with error handling
   */
  private async verifySingle(proof: ProofItem): Promise<ProofResult> {
    const startTime = Date.now();

    try {
      const result = await this.verifier.verify(
        proof.circuitId,
        proof.proof,
        proof.publicInputs,
        { timeout: 5000 }
      );

      return {
        id: proof.id,
        valid: result.valid,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        id: proof.id,
        valid: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stream verification for very large batches
   */
  async *verifyStream(
    proofs: AsyncIterable<ProofItem>
  ): AsyncGenerator<ProofResult> {
    const pending: Promise<ProofResult>[] = [];

    for await (const proof of proofs) {
      // Add to pending
      pending.push(this.verifySingle(proof));

      // When we reach concurrency limit, yield completed results
      if (pending.length >= this.concurrency) {
        const result = await Promise.race(
          pending.map((p, i) => p.then((r) => ({ result: r, index: i })))
        );

        pending.splice(result.index, 1);
        yield result.result;
      }
    }

    // Yield remaining results
    const remaining = await Promise.all(pending);
    for (const result of remaining) {
      yield result;
    }
  }
}

// Example API endpoint
import express from 'express';

async function createBatchVerificationAPI(verifier: Verifier): Promise<express.Express> {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const batchVerifier = new BatchVerifier(verifier, 4);

  // Batch verification endpoint
  app.post('/api/verify/batch', async (req, res) => {
    const { proofs } = req.body;

    if (!Array.isArray(proofs)) {
      return res.status(400).json({ error: 'proofs must be an array' });
    }

    if (proofs.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 proofs per batch' });
    }

    try {
      // Convert base64 proofs to Uint8Array
      const proofItems: ProofItem[] = proofs.map((p, i) => ({
        id: p.id || `proof-${i}`,
        circuitId: p.circuitId,
        proof: Buffer.from(p.proof, 'base64'),
        publicInputs: p.publicInputs,
      }));

      const result = await batchVerifier.verifyBatch(proofItems);

      res.json({
        success: true,
        summary: {
          total: result.totalCount,
          valid: result.validCount,
          invalid: result.invalidCount,
          errors: result.errorCount,
          duration: result.totalDuration,
        },
        results: result.results.map((r) => ({
          id: r.id,
          valid: r.valid,
          duration: r.duration,
          error: r.error,
        })),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Batch verification failed',
      });
    }
  });

  // Streaming batch endpoint for large batches
  app.post('/api/verify/batch/stream', async (req, res) => {
    const { proofs } = req.body;

    if (!Array.isArray(proofs)) {
      return res.status(400).json({ error: 'proofs must be an array' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');

    async function* proofGenerator(): AsyncGenerator<ProofItem> {
      for (let i = 0; i < proofs.length; i++) {
        const p = proofs[i];
        yield {
          id: p.id || `proof-${i}`,
          circuitId: p.circuitId,
          proof: Buffer.from(p.proof, 'base64'),
          publicInputs: p.publicInputs,
        };
      }
    }

    let validCount = 0;
    let totalCount = 0;

    for await (const result of batchVerifier.verifyStream(proofGenerator())) {
      totalCount++;
      if (result.valid) validCount++;

      res.write(JSON.stringify(result) + '\n');
    }

    // Write summary
    res.write(
      JSON.stringify({
        type: 'summary',
        total: totalCount,
        valid: validCount,
      }) + '\n'
    );

    res.end();
  });

  return app;
}

// Main
async function main(): Promise<void> {
  const verifier = await createVerifier({
    verificationKeysPath: process.env.CIRCUIT_KEYS_PATH || './circuit-keys',
    preloadCircuits: ['transfer', 'mint'],
  });

  const app = await createBatchVerificationAPI(verifier);

  const PORT = parseInt(process.env.PORT || '3001');
  app.listen(PORT, () => {
    console.log(`Batch verification server running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await verifier.close();
    process.exit(0);
  });
}

main().catch(console.error);
