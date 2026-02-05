# Prover API Reference

The Midnight prover SDK provides server-side ZK proof generation capabilities for Compact smart contracts.

## Installation

```bash
npm install @midnight-ntwrk/midnight-js-prover
```

## Creating a Prover Instance

The prover requires access to circuit proving keys generated during contract compilation.

### Basic Setup

```typescript
import { createProver, ProverConfig } from '@midnight-ntwrk/midnight-js-prover';

const config: ProverConfig = {
  circuitKeysPath: './circuit-keys',
};

const prover = await createProver(config);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `circuitKeysPath` | `string` | Required | Path to directory containing circuit proving keys |
| `memoryLimit` | `number` | `4096` | Maximum memory in MB for proof generation |
| `threads` | `number` | CPU count | Number of worker threads |
| `preloadCircuits` | `string[]` | `[]` | Circuit IDs to preload at startup |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

### Full Configuration Example

```typescript
const prover = await createProver({
  circuitKeysPath: './circuit-keys',
  memoryLimit: 8192,
  threads: 4,
  preloadCircuits: ['transfer', 'mint', 'burn'],
  logLevel: 'info',
});
```

## Proof Generation API

### prove()

Generate a proof for a circuit with the given witness data.

```typescript
async function prove(
  circuitId: string,
  witness: WitnessData,
  options?: ProveOptions
): Promise<Proof>
```

**Parameters:**

- `circuitId` - Identifier of the circuit to prove
- `witness` - Witness data containing public and private inputs
- `options` - Optional configuration for this proof

**Options:**

```typescript
interface ProveOptions {
  signal?: AbortSignal;  // For cancellation
  timeout?: number;      // Timeout in milliseconds
  priority?: number;     // Queue priority (higher = sooner)
}
```

**Example:**

```typescript
const witness = {
  publicInputs: {
    recipient: recipientAddress,
    amount: 1000n,
  },
  privateInputs: {
    senderSecret: secretKey,
    balance: currentBalance,
  },
};

const proof = await prover.prove('transfer', witness);
```

### proveAsync()

Submit a proof request and receive a job handle for status polling.

```typescript
async function proveAsync(
  circuitId: string,
  witness: WitnessData,
  options?: ProveOptions
): Promise<ProofJob>
```

**Returns a ProofJob:**

```typescript
interface ProofJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  result?: Proof;
  error?: Error;
  wait(): Promise<Proof>;  // Block until completion
}
```

**Example:**

```typescript
const job = await prover.proveAsync('transfer', witness);

// Option 1: Poll for status
while (job.status !== 'completed' && job.status !== 'failed') {
  await new Promise(r => setTimeout(r, 1000));
  await job.refresh();
}

// Option 2: Wait for completion
const proof = await job.wait();
```

### getStatus()

Check prover health and capacity.

```typescript
async function getStatus(): Promise<ProverStatus>
```

**Returns:**

```typescript
interface ProverStatus {
  ready: boolean;
  activeJobs: number;
  queuedJobs: number;
  memoryUsage: number;      // Current MB
  memoryLimit: number;      // Max MB
  loadedCircuits: string[]; // Preloaded circuit IDs
}
```

## Witness Data Structure

Witness data must match the circuit's expected inputs exactly.

### WitnessData Type

```typescript
interface WitnessData {
  publicInputs: Record<string, unknown>;
  privateInputs: Record<string, unknown>;
}
```

### Type Mapping

| Compact Type | TypeScript Type | Example |
|--------------|-----------------|---------|
| `Uint<N>` | `bigint` | `1000n` |
| `Int<N>` | `bigint` | `-50n` |
| `Boolean` | `boolean` | `true` |
| `Bytes<N>` | `Uint8Array` | `new Uint8Array([1, 2, 3])` |
| `Vector<T>` | `T[]` | `[1n, 2n, 3n]` |
| `Map<K,V>` | `Map<K, V>` | `new Map([['key', value]])` |

### Validation

The prover validates witness structure before generating proofs:

```typescript
try {
  const proof = await prover.prove('transfer', witness);
} catch (error) {
  if (error.code === 'INVALID_WITNESS') {
    console.error('Witness validation failed:', error.details);
    // { missing: ['amount'], invalid: ['recipient'] }
  }
}
```

## Error Handling

### Error Types

```typescript
enum ProverErrorCode {
  CIRCUIT_NOT_FOUND = 'CIRCUIT_NOT_FOUND',
  INVALID_WITNESS = 'INVALID_WITNESS',
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  TIMEOUT = 'TIMEOUT',
  ABORTED = 'ABORTED',
}

class ProverError extends Error {
  code: ProverErrorCode;
  details?: unknown;
}
```

### Error Handling Example

```typescript
try {
  const proof = await prover.prove('transfer', witness, {
    timeout: 30000,
  });
} catch (error) {
  if (error instanceof ProverError) {
    switch (error.code) {
      case 'CIRCUIT_NOT_FOUND':
        // Load or compile the circuit
        break;
      case 'INVALID_WITNESS':
        // Check witness structure
        console.error('Invalid fields:', error.details);
        break;
      case 'TIMEOUT':
        // Increase timeout or optimize witness
        break;
      case 'OUT_OF_MEMORY':
        // Reduce concurrent proofs or increase memory limit
        break;
    }
  }
  throw error;
}
```

## Lifecycle Management

### Startup

```typescript
// Create and wait for initialization
const prover = await createProver(config);

// Verify ready state
const status = await prover.getStatus();
if (!status.ready) {
  throw new Error('Prover failed to initialize');
}
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  console.log('Shutting down prover...');

  // Wait for in-progress proofs to complete
  await prover.drain();

  // Release resources
  await prover.close();

  process.exit(0);
});
```

## Best Practices

1. **Preload frequently-used circuits** at startup to avoid loading delays
2. **Set appropriate memory limits** based on circuit complexity
3. **Implement request timeouts** to prevent hung connections
4. **Use async proving** for circuits taking longer than 10 seconds
5. **Monitor memory usage** and implement backpressure when high
6. **Validate witness data** before submitting to prover
7. **Implement graceful shutdown** to complete in-progress proofs
