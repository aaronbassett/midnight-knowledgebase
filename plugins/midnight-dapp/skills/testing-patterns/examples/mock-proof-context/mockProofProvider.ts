/**
 * Mock Proof Provider - Returns dummy proofs instantly for testing
 *
 * Replaces the real proof server to enable fast, deterministic tests
 * without actual ZK computation.
 */

// =============================================================================
// Types
// =============================================================================

export interface ProofResult {
  /** The proof bytes (dummy in mock) */
  proof: Uint8Array;
  /** Public inputs to the circuit */
  publicInputs: unknown[];
  /** Circuit identifier */
  circuitId: string;
}

export interface ProofProvider {
  /** Generate a proof for the given circuit and witness */
  generateProof(circuitId: string, witness: unknown): Promise<ProofResult>;
  /** Verify a proof (always returns true in mock) */
  verifyProof(proof: ProofResult): Promise<boolean>;
}

export interface MockProofProviderOptions {
  /** Simulated latency in milliseconds (default: 0) */
  latencyMs?: number;
  /** Whether proof generation should fail (default: false) */
  shouldFail?: boolean;
  /** Error message when failing */
  errorMessage?: string;
  /** Callback when proof is generated */
  onProofGenerated?: (circuitId: string, durationMs: number) => void;
}

export interface ProofCall {
  /** Circuit identifier */
  circuitId: string;
  /** Timestamp of the call */
  timestamp: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the call succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Simple Mock Proof Provider
// =============================================================================

/**
 * Create a simple mock proof provider for basic testing.
 *
 * @example
 * ```typescript
 * const mockProofProvider = createMockProofProvider({
 *   latencyMs: 10, // Simulate small delay
 * });
 *
 * const proof = await mockProofProvider.generateProof("transfer", witnessData);
 * // Returns instantly with dummy proof
 * ```
 */
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
      const startTime = performance.now();

      // Simulate realistic timing if needed
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      const durationMs = performance.now() - startTime;

      // Simulate failures for error testing
      if (shouldFail) {
        throw new MockProofError(errorMessage, circuitId);
      }

      // Notify callback
      onProofGenerated?.(circuitId, durationMs);

      // Return a dummy proof structure
      return createDummyProof(circuitId);
    },

    async verifyProof(_proof: ProofResult): Promise<boolean> {
      // Mock verification always succeeds
      return true;
    },
  };
}

// =============================================================================
// Configurable Mock Proof Provider
// =============================================================================

/**
 * Advanced mock proof provider with per-circuit configuration and call tracking.
 *
 * @example
 * ```typescript
 * const provider = new ConfigurableMockProofProvider();
 *
 * // Configure specific circuit to be slow
 * provider.setCircuitLatency("complex_verification", 100);
 *
 * // Configure another circuit to fail
 * provider.setCircuitFailure("broken_circuit", true);
 *
 * // Run tests...
 *
 * // Verify calls were made
 * expect(provider.getCallCount("transfer")).toBe(3);
 * ```
 */
export class ConfigurableMockProofProvider implements ProofProvider {
  private baseLatencyMs: number;
  private circuitLatencies: Map<string, number>;
  private failingCircuits: Map<string, string>;
  private callHistory: ProofCall[];

  constructor(options: { baseLatencyMs?: number } = {}) {
    this.baseLatencyMs = options.baseLatencyMs ?? 0;
    this.circuitLatencies = new Map();
    this.failingCircuits = new Map();
    this.callHistory = [];
  }

  async generateProof(
    circuitId: string,
    _witness: unknown
  ): Promise<ProofResult> {
    const startTime = performance.now();

    // Determine latency for this circuit
    const latency = this.circuitLatencies.get(circuitId) ?? this.baseLatencyMs;

    if (latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, latency));
    }

    const durationMs = performance.now() - startTime;

    // Check if this circuit should fail
    const failureMessage = this.failingCircuits.get(circuitId);

    // Record the call
    this.callHistory.push({
      circuitId,
      timestamp: Date.now(),
      durationMs,
      success: !failureMessage,
      error: failureMessage,
    });

    if (failureMessage) {
      throw new MockProofError(failureMessage, circuitId);
    }

    return createDummyProof(circuitId);
  }

  async verifyProof(_proof: ProofResult): Promise<boolean> {
    return true;
  }

  // ===========================================================================
  // Configuration Methods
  // ===========================================================================

  /**
   * Set simulated latency for a specific circuit.
   */
  setCircuitLatency(circuitId: string, latencyMs: number): void {
    this.circuitLatencies.set(circuitId, latencyMs);
  }

  /**
   * Clear latency override for a circuit.
   */
  clearCircuitLatency(circuitId: string): void {
    this.circuitLatencies.delete(circuitId);
  }

  /**
   * Configure a circuit to fail with the given message.
   */
  setCircuitFailure(circuitId: string, errorMessage: string): void {
    this.failingCircuits.set(circuitId, errorMessage);
  }

  /**
   * Remove failure configuration for a circuit.
   */
  clearCircuitFailure(circuitId: string): void {
    this.failingCircuits.delete(circuitId);
  }

  /**
   * Reset all configuration to defaults.
   */
  resetConfiguration(): void {
    this.circuitLatencies.clear();
    this.failingCircuits.clear();
  }

  // ===========================================================================
  // Call History Methods
  // ===========================================================================

  /**
   * Get all recorded proof generation calls.
   */
  getCallHistory(): ReadonlyArray<ProofCall> {
    return [...this.callHistory];
  }

  /**
   * Get the number of proof generation calls, optionally filtered by circuit.
   */
  getCallCount(circuitId?: string): number {
    if (circuitId) {
      return this.callHistory.filter((c) => c.circuitId === circuitId).length;
    }
    return this.callHistory.length;
  }

  /**
   * Get the last proof generation call.
   */
  getLastCall(): ProofCall | undefined {
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Get calls for a specific circuit.
   */
  getCallsForCircuit(circuitId: string): ReadonlyArray<ProofCall> {
    return this.callHistory.filter((c) => c.circuitId === circuitId);
  }

  /**
   * Get the total time spent in proof generation.
   */
  getTotalDurationMs(): number {
    return this.callHistory.reduce((sum, call) => sum + call.durationMs, 0);
  }

  /**
   * Clear all recorded calls.
   */
  clearHistory(): void {
    this.callHistory = [];
  }

  /**
   * Assert that a circuit was called a specific number of times.
   * Throws if the assertion fails.
   */
  assertCallCount(circuitId: string, expectedCount: number): void {
    const actualCount = this.getCallCount(circuitId);
    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} calls to circuit "${circuitId}", but got ${actualCount}`
      );
    }
  }

  /**
   * Assert that all calls succeeded.
   * Throws if any call failed.
   */
  assertAllSucceeded(): void {
    const failedCalls = this.callHistory.filter((c) => !c.success);
    if (failedCalls.length > 0) {
      const failures = failedCalls
        .map((c) => `${c.circuitId}: ${c.error}`)
        .join(", ");
      throw new Error(`${failedCalls.length} proof calls failed: ${failures}`);
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a dummy proof with recognizable header for debugging.
 */
function createDummyProof(circuitId: string): ProofResult {
  const proof = new Uint8Array(128);

  // Header: "MOCK" in ASCII
  proof[0] = 0x4d; // M
  proof[1] = 0x4f; // O
  proof[2] = 0x43; // C
  proof[3] = 0x4b; // K

  // Include circuit ID hash in bytes 4-7
  const circuitHash = simpleHash(circuitId);
  proof[4] = (circuitHash >> 24) & 0xff;
  proof[5] = (circuitHash >> 16) & 0xff;
  proof[6] = (circuitHash >> 8) & 0xff;
  proof[7] = circuitHash & 0xff;

  // Timestamp in bytes 8-15
  const timestamp = BigInt(Date.now());
  for (let i = 0; i < 8; i++) {
    proof[8 + i] = Number((timestamp >> BigInt(56 - i * 8)) & 0xffn);
  }

  return {
    proof,
    publicInputs: [],
    circuitId,
  };
}

/**
 * Simple hash function for circuit ID embedding.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if a proof is a mock proof by examining its header.
 */
export function isMockProof(proof: Uint8Array): boolean {
  return (
    proof.length >= 4 &&
    proof[0] === 0x4d && // M
    proof[1] === 0x4f && // O
    proof[2] === 0x43 && // C
    proof[3] === 0x4b // K
  );
}

/**
 * Extract metadata from a mock proof.
 */
export function getMockProofMetadata(
  proof: Uint8Array
): { circuitHash: number; timestamp: number } | null {
  if (!isMockProof(proof)) {
    return null;
  }

  const circuitHash =
    (proof[4] << 24) | (proof[5] << 16) | (proof[6] << 8) | proof[7];

  let timestamp = 0n;
  for (let i = 0; i < 8; i++) {
    timestamp = (timestamp << 8n) | BigInt(proof[8 + i]);
  }

  return {
    circuitHash,
    timestamp: Number(timestamp),
  };
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when mock proof generation fails.
 */
export class MockProofError extends Error {
  constructor(
    message: string,
    public readonly circuitId: string
  ) {
    super(message);
    this.name = "MockProofError";
  }
}
