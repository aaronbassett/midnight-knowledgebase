/**
 * Pre-Submit Proof Validation
 *
 * Verify proofs before submitting transactions to the network.
 * Catches invalid proofs early to avoid failed transactions.
 */

import { createVerifier, Verifier, VerifierError } from '@midnight-ntwrk/midnight-js-verifier';
import { z } from 'zod';

// Types
interface Transaction {
  circuitId: string;
  proof: Uint8Array;
  publicInputs: Record<string, unknown>;
  metadata?: {
    sender: string;
    timestamp: number;
  };
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  verificationTime?: number;
}

// Public inputs schema for transfer circuit
const TransferPublicInputsSchema = z.object({
  nullifier: z.instanceof(Uint8Array).refine(
    (arr) => arr.length === 32,
    'Nullifier must be 32 bytes'
  ),
  commitment: z.instanceof(Uint8Array).refine(
    (arr) => arr.length === 32,
    'Commitment must be 32 bytes'
  ),
  root: z.instanceof(Uint8Array).refine(
    (arr) => arr.length === 32,
    'Merkle root must be 32 bytes'
  ),
});

// Validator class
class TransactionValidator {
  private verifier: Verifier;
  private usedNullifiers: Set<string> = new Set();

  constructor(verifier: Verifier) {
    this.verifier = verifier;
  }

  /**
   * Validate a transaction before submission
   */
  async validate(tx: Transaction): Promise<ValidationResult> {
    try {
      // Step 1: Validate public inputs structure
      this.validatePublicInputsStructure(tx);

      // Step 2: Check for double-spend (duplicate nullifier)
      this.checkNullifier(tx.publicInputs);

      // Step 3: Cryptographic proof verification
      const result = await this.verifyProof(tx);

      if (!result.valid) {
        return {
          valid: false,
          error: 'Proof verification failed',
          errorCode: 'INVALID_PROOF',
        };
      }

      // Step 4: Record nullifier to prevent double-spend
      this.recordNullifier(tx.publicInputs);

      return {
        valid: true,
        verificationTime: result.duration,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Validate public inputs match expected schema
   */
  private validatePublicInputsStructure(tx: Transaction): void {
    if (tx.circuitId === 'transfer') {
      TransferPublicInputsSchema.parse(tx.publicInputs);
    }
    // Add schemas for other circuits as needed
  }

  /**
   * Check if nullifier has been used (double-spend prevention)
   */
  private checkNullifier(publicInputs: Record<string, unknown>): void {
    const nullifier = publicInputs.nullifier as Uint8Array;
    if (nullifier) {
      const nullifierHex = Buffer.from(nullifier).toString('hex');
      if (this.usedNullifiers.has(nullifierHex)) {
        throw new Error('Nullifier already used (double-spend attempt)');
      }
    }
  }

  /**
   * Record nullifier after successful validation
   */
  private recordNullifier(publicInputs: Record<string, unknown>): void {
    const nullifier = publicInputs.nullifier as Uint8Array;
    if (nullifier) {
      const nullifierHex = Buffer.from(nullifier).toString('hex');
      this.usedNullifiers.add(nullifierHex);
    }
  }

  /**
   * Verify proof cryptographically
   */
  private async verifyProof(tx: Transaction): Promise<{
    valid: boolean;
    duration: number;
  }> {
    const result = await this.verifier.verify(
      tx.circuitId,
      tx.proof,
      tx.publicInputs,
      { timeout: 5000 }
    );

    return {
      valid: result.valid,
      duration: result.duration,
    };
  }

  /**
   * Convert errors to validation results
   */
  private handleError(error: unknown): ValidationResult {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        error: `Invalid public inputs: ${error.errors[0].message}`,
        errorCode: 'INVALID_PUBLIC_INPUTS',
      };
    }

    if (error instanceof VerifierError) {
      return {
        valid: false,
        error: error.message,
        errorCode: error.code,
      };
    }

    if (error instanceof Error) {
      if (error.message.includes('double-spend')) {
        return {
          valid: false,
          error: error.message,
          errorCode: 'DOUBLE_SPEND',
        };
      }

      return {
        valid: false,
        error: error.message,
        errorCode: 'VALIDATION_ERROR',
      };
    }

    return {
      valid: false,
      error: 'Unknown validation error',
      errorCode: 'UNKNOWN_ERROR',
    };
  }
}

// Example usage
async function main(): Promise<void> {
  // Initialize verifier
  const verifier = await createVerifier({
    verificationKeysPath: process.env.CIRCUIT_KEYS_PATH || './circuit-keys',
    preloadCircuits: ['transfer'],
  });

  const validator = new TransactionValidator(verifier);

  // Example transaction
  const transaction: Transaction = {
    circuitId: 'transfer',
    proof: new Uint8Array(256), // Proof bytes
    publicInputs: {
      nullifier: new Uint8Array(32),
      commitment: new Uint8Array(32),
      root: new Uint8Array(32),
    },
    metadata: {
      sender: '0x1234...',
      timestamp: Date.now(),
    },
  };

  // Validate before submit
  console.log('Validating transaction...');
  const result = await validator.validate(transaction);

  if (result.valid) {
    console.log(`Transaction valid! Verification took ${result.verificationTime}ms`);
    // Proceed to submit transaction to network
    // await submitToNetwork(transaction);
  } else {
    console.error(`Validation failed: ${result.error} (${result.errorCode})`);
    // Return error to client
  }

  // Cleanup
  await verifier.close();
}

main().catch(console.error);
