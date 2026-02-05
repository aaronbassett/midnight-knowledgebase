# Verification API Reference

The Midnight verifier SDK provides efficient ZK proof verification for Compact smart contracts.

## Installation

```bash
npm install @midnight-ntwrk/midnight-js-verifier
```

## Creating a Verifier Instance

The verifier requires access to circuit verification keys generated during contract compilation.

### Basic Setup

```typescript
import { createVerifier, VerifierConfig } from '@midnight-ntwrk/midnight-js-verifier';

const config: VerifierConfig = {
  verificationKeysPath: './circuit-keys',
};

const verifier = await createVerifier(config);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verificationKeysPath` | `string` | Required | Path to circuit verification keys |
| `preloadCircuits` | `string[]` | `[]` | Circuit IDs to preload at startup |
| `cacheSize` | `number` | `1000` | Number of verification results to cache |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

### Full Configuration Example

```typescript
const verifier = await createVerifier({
  verificationKeysPath: './circuit-keys',
  preloadCircuits: ['transfer', 'mint', 'burn'],
  cacheSize: 5000,
  logLevel: 'info',
});
```

## Verification API

### verify()

Verify a proof against a circuit with given public inputs.

```typescript
async function verify(
  circuitId: string,
  proof: Uint8Array,
  publicInputs: Record<string, unknown>,
  options?: VerifyOptions
): Promise<VerificationResult>
```

**Parameters:**

- `circuitId` - Identifier of the circuit
- `proof` - Proof bytes to verify
- `publicInputs` - Public inputs that should match the proof
- `options` - Optional configuration

**Options:**

```typescript
interface VerifyOptions {
  signal?: AbortSignal;  // For cancellation
  timeout?: number;      // Timeout in milliseconds
}
```

**Returns:**

```typescript
interface VerificationResult {
  valid: boolean;        // Whether proof is valid
  duration: number;      // Verification time in ms
  circuitId: string;     // Circuit that was verified
}
```

**Example:**

```typescript
const proof = Buffer.from(proofBase64, 'base64');

const result = await verifier.verify('transfer', proof, {
  nullifier: nullifierBytes,
  commitment: commitmentBytes,
});

if (result.valid) {
  console.log(`Proof verified in ${result.duration}ms`);
} else {
  console.log('Proof is invalid');
}
```

### verifyBatch()

Verify multiple proofs in a single call for better throughput.

```typescript
async function verifyBatch(
  proofs: BatchProof[],
  options?: VerifyBatchOptions
): Promise<BatchVerificationResult>
```

**Parameters:**

```typescript
interface BatchProof {
  circuitId: string;
  proof: Uint8Array;
  publicInputs: Record<string, unknown>;
}

interface VerifyBatchOptions {
  signal?: AbortSignal;
  concurrency?: number;  // Max parallel verifications (default: 4)
  stopOnFirst?: boolean; // Stop on first invalid proof (default: false)
}
```

**Returns:**

```typescript
interface BatchVerificationResult {
  allValid: boolean;
  results: Map<number, VerificationResult>;
  totalDuration: number;
}
```

**Example:**

```typescript
const proofs = [
  { circuitId: 'transfer', proof: proof1, publicInputs: inputs1 },
  { circuitId: 'transfer', proof: proof2, publicInputs: inputs2 },
  { circuitId: 'mint', proof: proof3, publicInputs: inputs3 },
];

const result = await verifier.verifyBatch(proofs, {
  concurrency: 4,
  stopOnFirst: true,
});

if (result.allValid) {
  console.log('All proofs valid');
} else {
  // Find invalid proofs
  result.results.forEach((r, index) => {
    if (!r.valid) {
      console.log(`Proof ${index} is invalid`);
    }
  });
}
```

### getStatus()

Check verifier health and loaded circuits.

```typescript
async function getStatus(): Promise<VerifierStatus>
```

**Returns:**

```typescript
interface VerifierStatus {
  ready: boolean;
  loadedCircuits: string[];
  cacheHits: number;
  cacheMisses: number;
  totalVerifications: number;
}
```

## Public Inputs

Public inputs must match the circuit's expected public values exactly.

### Type Mapping

| Compact Type | TypeScript | Notes |
|--------------|------------|-------|
| `Uint<N>` | `bigint` | Must be non-negative |
| `Bytes<N>` | `Uint8Array` | Exact length required |
| `Boolean` | `boolean` | `true` or `false` |

### Validation

```typescript
import { z } from 'zod';

const TransferPublicInputsSchema = z.object({
  nullifier: z.instanceof(Uint8Array).refine(
    (arr) => arr.length === 32,
    'Nullifier must be 32 bytes'
  ),
  commitment: z.instanceof(Uint8Array).refine(
    (arr) => arr.length === 32,
    'Commitment must be 32 bytes'
  ),
  amount: z.bigint().nonnegative(),
});

function validatePublicInputs(inputs: unknown) {
  return TransferPublicInputsSchema.parse(inputs);
}
```

## Error Handling

### Error Types

```typescript
enum VerifierErrorCode {
  CIRCUIT_NOT_FOUND = 'CIRCUIT_NOT_FOUND',
  INVALID_PROOF_FORMAT = 'INVALID_PROOF_FORMAT',
  INVALID_PUBLIC_INPUTS = 'INVALID_PUBLIC_INPUTS',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  ABORTED = 'ABORTED',
}

class VerifierError extends Error {
  code: VerifierErrorCode;
  details?: unknown;
}
```

### Error Handling Example

```typescript
try {
  const result = await verifier.verify(circuitId, proof, publicInputs);

  if (!result.valid) {
    // Proof is cryptographically invalid
    throw new Error('Proof verification failed');
  }
} catch (error) {
  if (error instanceof VerifierError) {
    switch (error.code) {
      case 'CIRCUIT_NOT_FOUND':
        // Circuit verification key not loaded
        break;
      case 'INVALID_PROOF_FORMAT':
        // Proof bytes are malformed
        break;
      case 'INVALID_PUBLIC_INPUTS':
        // Public inputs don't match circuit signature
        break;
      case 'VERIFICATION_FAILED':
        // Cryptographic verification failed
        break;
    }
  }
  throw error;
}
```

## Performance Optimization

### Preloading Verification Keys

```typescript
// Preload at startup for faster first verification
const verifier = await createVerifier({
  verificationKeysPath: './circuit-keys',
  preloadCircuits: ['transfer', 'mint', 'burn'],
});
```

### Caching Verification Results

The verifier caches verification results by default:

```typescript
const verifier = await createVerifier({
  verificationKeysPath: './circuit-keys',
  cacheSize: 10000, // Cache up to 10,000 results
});

// First verification - computed
await verifier.verify(circuitId, proof, publicInputs);

// Second verification with same inputs - cached
await verifier.verify(circuitId, proof, publicInputs); // Instant
```

### Batch Processing

For high throughput, use batch verification:

```typescript
// Instead of sequential verification
for (const p of proofs) {
  await verifier.verify(p.circuitId, p.proof, p.publicInputs);
}

// Use batch verification (4x faster for 4 proofs)
await verifier.verifyBatch(proofs, { concurrency: 4 });
```

## Lifecycle Management

### Startup

```typescript
const verifier = await createVerifier(config);

// Verify ready state
const status = await verifier.getStatus();
if (!status.ready) {
  throw new Error('Verifier failed to initialize');
}

console.log('Loaded circuits:', status.loadedCircuits);
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  console.log('Shutting down verifier...');
  await verifier.close();
  process.exit(0);
});
```

## Best Practices

1. **Preload verification keys** for circuits you expect to verify frequently
2. **Use batch verification** when verifying multiple proofs
3. **Set appropriate timeouts** to prevent hung verifications
4. **Enable caching** for repeated verifications of the same proof
5. **Validate public inputs** before calling verify to get better error messages
6. **Monitor cache hit rate** to tune cache size
7. **Log verification failures** for debugging but not proof content
