# Mocking Proofs

Mock proof providers enable fast testing by returning dummy proofs instantly instead of performing actual ZK computation.

## Why Mock Proofs?

### The Performance Problem

Real ZK proof generation is computationally expensive:

| Operation | Real Proof Time | Mock Proof Time |
|-----------|----------------|-----------------|
| Simple transfer | 2-5 seconds | < 10ms |
| Credential verification | 5-10 seconds | < 10ms |
| Complex computation | 10-30 seconds | < 10ms |

Running a test suite with 50 contract interactions:
- **Real proofs**: 2-25 minutes
- **Mock proofs**: < 1 second

### What Mocking Preserves

Mock proofs still test:
- Witness function execution
- Type correctness of inputs/outputs
- Transaction building logic
- Error handling paths
- UI state transitions

### What Mocking Skips

Mock proofs do NOT verify:
- Circuit constraint satisfaction
- Cryptographic proof validity
- Actual ZK computation
- Proof size/complexity limits

## Mock Proof Provider Implementation

### Basic Mock Provider

```typescript
import type { ProofProvider, ProofResult } from "@midnight-ntwrk/midnight-js-types";

interface MockProofProviderOptions {
  /** Simulated latency in milliseconds */
  latencyMs?: number;
  /** Whether to fail proof generation */
  shouldFail?: boolean;
  /** Error message when failing */
  errorMessage?: string;
  /** Callback when proof is generated */
  onProofGenerated?: (circuitId: string) => void;
}

export function createMockProofProvider(
  options: MockProofProviderOptions = {}
): ProofProvider {
  const {
    latencyMs = 0,
    shouldFail = false,
    errorMessage = "Mock proof generation failed",
    onProofGenerated,
  } = options;

  return {
    async generateProof(
      circuitId: string,
      witness: unknown
    ): Promise<ProofResult> {
      // Simulate realistic timing if needed
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      // Simulate failures for error testing
      if (shouldFail) {
        throw new Error(errorMessage);
      }

      // Notify callback
      onProofGenerated?.(circuitId);

      // Return a dummy proof structure
      return {
        proof: new Uint8Array(128).fill(0), // Dummy proof bytes
        publicInputs: [],
        circuitId,
      };
    },

    async verifyProof(proof: ProofResult): Promise<boolean> {
      // Mock verification always succeeds
      return true;
    },
  };
}
```

### Configurable Mock Provider

For more control over test scenarios:

```typescript
interface MockProofProviderConfig {
  /** Base latency for all proofs */
  baseLatencyMs: number;
  /** Per-circuit latency overrides */
  circuitLatencies: Map<string, number>;
  /** Circuits that should fail */
  failingCircuits: Set<string>;
  /** Track proof generation calls */
  callHistory: ProofCall[];
}

interface ProofCall {
  circuitId: string;
  timestamp: number;
  duration: number;
  success: boolean;
}

export class ConfigurableMockProofProvider implements ProofProvider {
  private config: MockProofProviderConfig;

  constructor(config: Partial<MockProofProviderConfig> = {}) {
    this.config = {
      baseLatencyMs: config.baseLatencyMs ?? 0,
      circuitLatencies: config.circuitLatencies ?? new Map(),
      failingCircuits: config.failingCircuits ?? new Set(),
      callHistory: [],
    };
  }

  async generateProof(
    circuitId: string,
    witness: unknown
  ): Promise<ProofResult> {
    const startTime = Date.now();

    // Determine latency
    const latency =
      this.config.circuitLatencies.get(circuitId) ??
      this.config.baseLatencyMs;

    if (latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, latency));
    }

    // Check if this circuit should fail
    const shouldFail = this.config.failingCircuits.has(circuitId);

    // Record the call
    this.config.callHistory.push({
      circuitId,
      timestamp: startTime,
      duration: Date.now() - startTime,
      success: !shouldFail,
    });

    if (shouldFail) {
      throw new Error(`Proof generation failed for circuit: ${circuitId}`);
    }

    return {
      proof: this.createDummyProof(),
      publicInputs: [],
      circuitId,
    };
  }

  async verifyProof(proof: ProofResult): Promise<boolean> {
    return true;
  }

  // Test utilities
  getCallHistory(): ReadonlyArray<ProofCall> {
    return this.config.callHistory;
  }

  getCallCount(circuitId?: string): number {
    if (circuitId) {
      return this.config.callHistory.filter(
        (c) => c.circuitId === circuitId
      ).length;
    }
    return this.config.callHistory.length;
  }

  clearHistory(): void {
    this.config.callHistory = [];
  }

  setCircuitLatency(circuitId: string, latencyMs: number): void {
    this.config.circuitLatencies.set(circuitId, latencyMs);
  }

  setCircuitFailure(circuitId: string, shouldFail: boolean): void {
    if (shouldFail) {
      this.config.failingCircuits.add(circuitId);
    } else {
      this.config.failingCircuits.delete(circuitId);
    }
  }

  private createDummyProof(): Uint8Array {
    // Create a recognizable dummy proof for debugging
    const proof = new Uint8Array(128);
    // Header: "MOCK" in ASCII
    proof[0] = 0x4d; // M
    proof[1] = 0x4f; // O
    proof[2] = 0x43; // C
    proof[3] = 0x4b; // K
    return proof;
  }
}
```

## Test Setup Patterns

### Vitest Setup

```typescript
// vitest.setup.ts
import { beforeEach, afterEach, vi } from "vitest";
import { createMockProofProvider } from "./testUtils/mockProofProvider";

let mockProofProvider: ReturnType<typeof createMockProofProvider>;

beforeEach(() => {
  mockProofProvider = createMockProofProvider();

  // Mock the proof provider module
  vi.mock("@midnight-ntwrk/midnight-js-contracts", () => ({
    httpClientProofProvider: () => mockProofProvider,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});
```

### Jest Setup

```typescript
// jest.setup.ts
import { createMockProofProvider } from "./testUtils/mockProofProvider";

const mockProofProvider = createMockProofProvider();

jest.mock("@midnight-ntwrk/midnight-js-contracts", () => ({
  httpClientProofProvider: jest.fn(() => mockProofProvider),
}));
```

### Per-Test Configuration

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ConfigurableMockProofProvider } from "./mockProofProvider";

describe("Transaction Flow", () => {
  let proofProvider: ConfigurableMockProofProvider;

  beforeEach(() => {
    proofProvider = new ConfigurableMockProofProvider();
  });

  it("should handle slow proof generation", async () => {
    // Simulate slow proof for specific circuit
    proofProvider.setCircuitLatency("transfer_circuit", 100);

    const startTime = Date.now();
    await proofProvider.generateProof("transfer_circuit", {});
    const duration = Date.now() - startTime;

    expect(duration).toBeGreaterThanOrEqual(100);
  });

  it("should handle proof failure gracefully", async () => {
    proofProvider.setCircuitFailure("verify_credential", true);

    await expect(
      proofProvider.generateProof("verify_credential", {})
    ).rejects.toThrow("Proof generation failed");
  });

  it("should track proof generation calls", async () => {
    await proofProvider.generateProof("circuit_a", {});
    await proofProvider.generateProof("circuit_b", {});
    await proofProvider.generateProof("circuit_a", {});

    expect(proofProvider.getCallCount("circuit_a")).toBe(2);
    expect(proofProvider.getCallCount("circuit_b")).toBe(1);
    expect(proofProvider.getCallCount()).toBe(3);
  });
});
```

## Limitations and When to Use Real Proofs

### Mock Proofs Cannot Test

1. **Constraint Satisfaction**
   - Witnesses that produce invalid circuit inputs
   - Off-by-one errors in range proofs
   - Incorrect Merkle proof verification

2. **Performance Characteristics**
   - Actual proof generation time
   - Memory usage during proving
   - Circuit complexity limits

3. **Cryptographic Correctness**
   - Proof verification on-chain
   - Soundness of the ZK proof
   - Privacy guarantees

### When to Use Real Proofs

| Scenario | Use Real Proofs? |
|----------|------------------|
| Unit tests | No - too slow |
| Component tests | No - focus on UI |
| Integration tests | Usually no |
| Pre-deployment | Yes - full validation |
| CI/CD (every commit) | No - use mocks |
| CI/CD (nightly) | Yes - comprehensive check |
| Local development | Optional - use for debugging |

### Recommended Test Strategy

```typescript
// test/integration/transfer.test.ts - Uses mocks
describe("Transfer Integration (Mocked)", () => {
  it("should complete transfer flow", async () => {
    // Fast test with mocks
  });
});

// test/e2e/transfer.e2e.test.ts - Uses real proofs (optional)
describe.skipIf(!process.env.ENABLE_REAL_PROOFS)(
  "Transfer E2E (Real Proofs)",
  () => {
    it("should generate valid proof", async () => {
      // Slow test with real proof server
    }, 60_000); // 60 second timeout
  }
);
```

## Test Environment Setup

### Environment Configuration

```typescript
// test/setup/proofProvider.ts
export function getProofProvider() {
  if (process.env.USE_REAL_PROOFS === "true") {
    // Real proof provider for E2E tests
    return httpClientProofProvider(
      process.env.PROOF_SERVER_URL ?? "http://localhost:6300"
    );
  }

  // Mock for all other tests
  return createMockProofProvider({
    latencyMs: process.env.SIMULATE_LATENCY === "true" ? 50 : 0,
  });
}
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --project unit",
    "test:integration": "vitest --project integration",
    "test:e2e:mock": "playwright test",
    "test:e2e:real": "USE_REAL_PROOFS=true playwright test --timeout=120000"
  }
}
```

## Debugging Mock Proofs

### Identifying Mock vs Real

```typescript
function isMockProof(proof: Uint8Array): boolean {
  // Check for "MOCK" header
  return (
    proof[0] === 0x4d &&
    proof[1] === 0x4f &&
    proof[2] === 0x43 &&
    proof[3] === 0x4b
  );
}

// Use in tests or debugging
if (isMockProof(proofResult.proof)) {
  console.warn("Warning: Using mock proof - not valid for production");
}
```

### Logging Proof Generation

```typescript
const loggingProofProvider = createMockProofProvider({
  onProofGenerated: (circuitId) => {
    console.log(`[Mock] Generated proof for circuit: ${circuitId}`);
  },
});
```
