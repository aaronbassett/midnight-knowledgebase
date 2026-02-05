# Client-Side Proofs

All Midnight proof generation happens locally on the user's device. This is fundamental to privacy - private data never leaves the browser.

## How Proof Generation Works

### The Local-Only Guarantee

When a user submits a transaction:

1. **Witness execution** - Your TypeScript functions provide private data
2. **Circuit evaluation** - The Compact circuit runs with that data
3. **Proof generation** - A ZK proof is created locally
4. **Submission** - Only the proof (not the data) goes on-chain

```
User's Browser
┌─────────────────────────────────────────────────┐
│                                                 │
│  Private State ──▶ Witness ──▶ Circuit ──▶ Proof │
│  (stays here)      (local)     (local)    (sent) │
│                                                 │
└─────────────────────────────────────────────────┘
                                        │
                                        ▼
                              Midnight Network
                           (receives proof only)
```

### Why Local Matters

- **No trusted third party** - No server ever sees your private data
- **No data exfiltration** - Even if the DApp is compromised, proofs are generated client-side
- **User sovereignty** - Users control what's proven about their data

## Proof Server Setup

The proof server is a local Docker container that handles the cryptographic heavy lifting.

### Starting the Proof Server

```bash
# Pull the proof server image
docker pull midnightnetwork/proof-server:latest

# Start on port 6300 (default)
docker run -d \
  --name midnight-proof-server \
  -p 6300:6300 \
  midnightnetwork/proof-server:latest

# Verify it's running
curl http://localhost:6300/health
```

### Docker Compose Setup

For development, add to your `docker-compose.yml`:

```yaml
version: "3.8"
services:
  proof-server:
    image: midnightnetwork/proof-server:latest
    ports:
      - "6300:6300"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6300/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Verifying the Connection

```typescript
async function checkProofServer(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:6300/health");
    return response.ok;
  } catch {
    return false;
  }
}

// Usage in your app
const isReady = await checkProofServer();
if (!isReady) {
  console.error("Proof server not available. Start it with: docker run ...");
}
```

## Performance Considerations

### Proof Generation Time

ZK proof generation is computationally intensive:

| Operation Type | Typical Time | Notes |
|---------------|--------------|-------|
| Simple transfer | 2-5 seconds | Basic value transfer |
| Credential verification | 5-10 seconds | With Merkle proof |
| Complex computation | 10-30 seconds | Multiple witness calls |

### Why It Takes Time

Unlike Ethereum's instant signatures, Midnight proofs involve:

1. **Circuit compilation** - First-time setup (cached after)
2. **Witness evaluation** - Running your TypeScript functions
3. **Proof computation** - Cryptographic operations
4. **Proof verification** - Local sanity check

### User Experience Implications

```typescript
// Bad: No feedback during proof generation
const handleTransfer = async () => {
  const tx = await contract.callTx.transfer(recipient, amount, witnesses);
  // User sees nothing for 5+ seconds
};

// Good: Show progress
const handleTransfer = async () => {
  setStatus("preparing");

  try {
    setStatus("generating"); // "Generating proof..."
    const tx = await contract.callTx.transfer(recipient, amount, witnesses);

    setStatus("proving"); // "Creating zero-knowledge proof..."
    const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);

    setStatus("submitting"); // "Submitting to network..."
    const txHash = await walletAPI.submitTransaction(provenTx);

    setStatus("complete");
  } catch (error) {
    setStatus("error");
    setError(error);
  }
};
```

## Caching Expensive Computations

### Witness-Level Caching

Cache results within witness functions:

```typescript
const merkleProofCache = new Map<string, MerkleProof>();

const witnesses = {
  get_merkle_proof: ({ privateState }, leafHash) => {
    const key = bytesToHex(leafHash);

    // Return cached proof if available
    const cached = merkleProofCache.get(key);
    if (cached) return cached;

    // Generate and cache
    const proof = privateState.merkleTree.getProof(leafHash);
    merkleProofCache.set(key, proof);
    return proof;
  }
};
```

### Application-Level Caching

Cache derived values that don't change:

```typescript
interface CachedState {
  publicKeyHash: Uint8Array | null;
  credentialHashes: Map<string, Uint8Array>;
}

const cache: CachedState = {
  publicKeyHash: null,
  credentialHashes: new Map()
};

function getPublicKeyHash(privateState: PrivateState): Uint8Array {
  if (!cache.publicKeyHash) {
    cache.publicKeyHash = hash(privateState.publicKey);
  }
  return cache.publicKeyHash;
}
```

### Cache Invalidation

Clear caches when underlying data changes:

```typescript
function updatePrivateState(newState: PrivateState) {
  // Clear related caches
  merkleProofCache.clear();
  cache.publicKeyHash = null;

  // Update state
  setPrivateState(newState);
}
```

## Timeout and Retry Handling

### Default Timeout Configuration

```typescript
const PROOF_CONFIG = {
  /** Maximum time for proof generation */
  PROOF_TIMEOUT_MS: 60_000, // 60 seconds

  /** Maximum retry attempts */
  MAX_RETRIES: 3,

  /** Base delay for exponential backoff */
  RETRY_BASE_DELAY_MS: 1000,
};
```

### Implementing Retries

```typescript
async function generateProofWithRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    timeoutMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const {
    maxRetries = PROOF_CONFIG.MAX_RETRIES,
    timeoutMs = PROOF_CONFIG.PROOF_TIMEOUT_MS,
    onRetry
  } = options ?? {};

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wrap with timeout
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Proof generation timed out")),
            timeoutMs
          )
        )
      ]);

      return result;
    } catch (error) {
      lastError = error as Error;

      // Don't retry user rejections
      if (isUserRejection(error)) {
        throw error;
      }

      // Notify about retry
      onRetry?.(attempt, lastError);

      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = PROOF_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw new ProofError(
    `Proof generation failed after ${maxRetries} attempts`,
    "PROOF_GENERATION_FAILED",
    lastError
  );
}

function isUserRejection(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes("rejected") ||
           error.message.toLowerCase().includes("cancelled");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Usage Example

```typescript
const handleTransfer = async () => {
  setStatus("generating");

  try {
    const txHash = await generateProofWithRetry(
      async () => {
        const tx = await contract.callTx.transfer(recipient, amount, witnesses);
        const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
        return walletAPI.submitTransaction(provenTx);
      },
      {
        maxRetries: 3,
        timeoutMs: 90_000,
        onRetry: (attempt, error) => {
          setStatus(`Retrying (${attempt}/3)...`);
          console.warn(`Proof attempt ${attempt} failed:`, error.message);
        }
      }
    );

    setStatus("complete");
    return txHash;
  } catch (error) {
    setStatus("error");
    throw error;
  }
};
```

## Error Types

### Proof-Specific Errors

```typescript
class ProofError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "ProofError";
  }
}

// Common error codes
const PROOF_ERROR_CODES = {
  TIMEOUT: "PROOF_TIMEOUT",
  SERVER_UNAVAILABLE: "PROOF_SERVER_UNAVAILABLE",
  WITNESS_FAILED: "WITNESS_EXECUTION_FAILED",
  CIRCUIT_ERROR: "CIRCUIT_EVALUATION_FAILED",
  GENERATION_FAILED: "PROOF_GENERATION_FAILED",
  VERIFICATION_FAILED: "PROOF_VERIFICATION_FAILED",
} as const;
```

### Error Recovery Strategies

| Error Code | Recovery Strategy |
|------------|-------------------|
| `PROOF_TIMEOUT` | Retry with longer timeout, check proof server load |
| `PROOF_SERVER_UNAVAILABLE` | Prompt user to start proof server |
| `WITNESS_EXECUTION_FAILED` | Check private state validity |
| `CIRCUIT_EVALUATION_FAILED` | Verify witness outputs match expected types |
| `PROOF_GENERATION_FAILED` | Retry, if persistent check circuit constraints |
| `PROOF_VERIFICATION_FAILED` | Usually indicates a bug - report to developers |

## Monitoring Proof Performance

### Timing Metrics

```typescript
async function measureProofGeneration<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = performance.now();

  try {
    const result = await operation();
    const duration = performance.now() - start;

    console.log(`[Proof] ${name} completed in ${duration.toFixed(0)}ms`);

    // Send to analytics if needed
    trackMetric("proof_generation_time", duration, { operation: name });

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`[Proof] ${name} failed after ${duration.toFixed(0)}ms`);
    throw error;
  }
}

// Usage
const tx = await measureProofGeneration("transfer", () =>
  contract.callTx.transfer(recipient, amount, witnesses)
);
```

### Health Checks

```typescript
async function getProofServerStatus(): Promise<{
  available: boolean;
  latency: number | null;
  version?: string;
}> {
  const start = performance.now();

  try {
    const response = await fetch("http://localhost:6300/health", {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return { available: false, latency: null };
    }

    const latency = performance.now() - start;
    const data = await response.json();

    return {
      available: true,
      latency,
      version: data.version
    };
  } catch {
    return { available: false, latency: null };
  }
}
```
