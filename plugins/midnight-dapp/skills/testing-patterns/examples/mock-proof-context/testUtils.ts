/**
 * Test Utilities - Helper functions for testing Midnight DApps
 *
 * Provides utilities for creating mock contracts, test private state,
 * and common test assertions.
 */

// =============================================================================
// Types
// =============================================================================

export interface MockContractState {
  /** Map of address to balance */
  balances: Map<string, bigint>;
  /** Total token supply */
  totalSupply: bigint;
  /** Contract admin address */
  admin: string;
  /** Set of member addresses */
  members: Set<string>;
  /** Generic key-value storage */
  storage: Map<string, unknown>;
}

export interface MockContract<TState extends MockContractState = MockContractState> {
  /** Contract address */
  address: string;
  /** State accessors */
  state: MockStateAccessor<TState>;
  /** Transaction builders (mocked) */
  callTx: MockCallTx;
  /** View the raw state (for testing) */
  _rawState: TState;
}

export interface MockStateAccessor<TState extends MockContractState> {
  /** Get total supply */
  total_supply(): Promise<bigint>;
  /** Balance map accessor */
  balances: {
    get(address: string): Promise<bigint | undefined>;
    has(address: string): Promise<boolean>;
  };
  /** Members set accessor */
  members: {
    has(address: string): Promise<boolean>;
  };
  /** Generic storage accessor */
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
}

export interface MockCallTx {
  /** Mock transfer transaction */
  transfer(
    recipient: string,
    amount: bigint,
    witnesses: unknown
  ): Promise<MockTransaction>;
  /** Mock mint transaction */
  mint(to: string, amount: bigint, witnesses: unknown): Promise<MockTransaction>;
  /** Generic transaction call */
  call(method: string, args: unknown[], witnesses: unknown): Promise<MockTransaction>;
}

export interface MockTransaction {
  /** Transaction type */
  type: string;
  /** Transaction arguments */
  args: unknown[];
  /** Transaction hash (generated) */
  hash: string;
  /** Timestamp */
  timestamp: number;
}

export interface TestPrivateState {
  /** 32-byte secret key */
  secretKey: Uint8Array;
  /** 32-byte public key */
  publicKey: Uint8Array;
  /** User's private balance */
  balance: bigint;
  /** Transaction nonce */
  nonce: bigint;
  /** Stored credentials */
  credentials: Map<string, TestCredential>;
  /** Pending transfers */
  pendingTransfers: TestTransfer[];
}

export interface TestCredential {
  /** Credential expiry timestamp */
  expiry: bigint;
  /** Credential data */
  data: Uint8Array;
  /** Issuer public key */
  issuer: Uint8Array;
}

export interface TestTransfer {
  /** Recipient address */
  recipient: string;
  /** Transfer amount */
  amount: bigint;
  /** Transfer memo */
  memo?: string;
}

// =============================================================================
// Mock Contract Factory
// =============================================================================

/**
 * Create a mock contract for testing.
 *
 * @example
 * ```typescript
 * const contract = createMockContract({
 *   state: {
 *     balances: new Map([
 *       ["addr_alice", 1000n],
 *       ["addr_bob", 500n],
 *     ]),
 *     totalSupply: 1500n,
 *   },
 * });
 *
 * const balance = await contract.state.balances.get("addr_alice");
 * expect(balance).toBe(1000n);
 * ```
 */
export function createMockContract(
  options: {
    address?: string;
    state?: Partial<MockContractState>;
  } = {}
): MockContract {
  const {
    address = `contract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    state: initialState = {},
  } = options;

  const state: MockContractState = {
    balances: initialState.balances ?? new Map(),
    totalSupply: initialState.totalSupply ?? 0n,
    admin: initialState.admin ?? "addr_admin",
    members: initialState.members ?? new Set(),
    storage: initialState.storage ?? new Map(),
  };

  const stateAccessor: MockStateAccessor<MockContractState> = {
    total_supply: async () => state.totalSupply,

    balances: {
      get: async (addr: string) => state.balances.get(addr),
      has: async (addr: string) => state.balances.has(addr),
    },

    members: {
      has: async (addr: string) => state.members.has(addr),
    },

    storage: {
      get: async <T>(key: string) => state.storage.get(key) as T | undefined,
      set: async (key: string, value: unknown) => {
        state.storage.set(key, value);
      },
    },
  };

  const callTx: MockCallTx = {
    transfer: async (recipient, amount, _witnesses) => {
      // Simulate transfer logic
      const senderBalance = state.balances.get("sender") ?? 0n;
      if (senderBalance < amount) {
        throw new Error("Insufficient balance");
      }

      state.balances.set("sender", senderBalance - amount);
      const recipientBalance = state.balances.get(recipient) ?? 0n;
      state.balances.set(recipient, recipientBalance + amount);

      return createMockTransaction("transfer", [recipient, amount]);
    },

    mint: async (to, amount, _witnesses) => {
      const currentBalance = state.balances.get(to) ?? 0n;
      state.balances.set(to, currentBalance + amount);
      state.totalSupply += amount;

      return createMockTransaction("mint", [to, amount]);
    },

    call: async (method, args, _witnesses) => {
      return createMockTransaction(method, args);
    },
  };

  return {
    address,
    state: stateAccessor,
    callTx,
    _rawState: state,
  };
}

function createMockTransaction(type: string, args: unknown[]): MockTransaction {
  return {
    type,
    args,
    hash: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
}

// =============================================================================
// Test Private State Factory
// =============================================================================

/**
 * Create test private state with sensible defaults.
 *
 * @example
 * ```typescript
 * const privateState = createTestPrivateState({
 *   balance: 1000n,
 *   nonce: 5n,
 * });
 *
 * expect(privateState.balance).toBe(1000n);
 * expect(privateState.secretKey).toHaveLength(32);
 * ```
 */
export function createTestPrivateState(
  options: Partial<TestPrivateState> = {}
): TestPrivateState {
  const secretKey = options.secretKey ?? generateTestBytes(32);
  const publicKey = options.publicKey ?? deriveTestPublicKey(secretKey);

  return {
    secretKey,
    publicKey,
    balance: options.balance ?? 0n,
    nonce: options.nonce ?? 0n,
    credentials: options.credentials ?? new Map(),
    pendingTransfers: options.pendingTransfers ?? [],
  };
}

/**
 * Create a test credential.
 */
export function createTestCredential(
  options: Partial<TestCredential> & { expiresInSeconds?: number } = {}
): TestCredential {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const expiresInSeconds = options.expiresInSeconds ?? 3600; // 1 hour default

  return {
    expiry: options.expiry ?? now + BigInt(expiresInSeconds),
    data: options.data ?? generateTestBytes(64),
    issuer: options.issuer ?? generateTestBytes(32),
  };
}

/**
 * Create an expired test credential.
 */
export function createExpiredCredential(): TestCredential {
  return createTestCredential({
    expiry: BigInt(Math.floor(Date.now() / 1000) - 3600), // Expired 1 hour ago
  });
}

// =============================================================================
// Witness Context Factory
// =============================================================================

export interface TestWitnessContext<TPrivateState> {
  privateState: TPrivateState;
  setPrivateState: (state: TPrivateState) => void;
  ledgerState: MockContractState;
  contractAddress: string;
}

/**
 * Create a witness context for testing witness functions.
 *
 * @example
 * ```typescript
 * const privateState = createTestPrivateState({ balance: 1000n });
 * const { context, getPrivateState } = createTestWitnessContext(privateState);
 *
 * const balance = witnesses.get_balance(context);
 * expect(balance).toBe(1000n);
 *
 * // Check state mutations
 * witnesses.get_nonce(context);
 * expect(getPrivateState().nonce).toBe(1n);
 * ```
 */
export function createTestWitnessContext<TPrivateState>(
  initialState: TPrivateState
): {
  context: TestWitnessContext<TPrivateState>;
  getPrivateState: () => TPrivateState;
} {
  let currentState = { ...initialState };

  const context: TestWitnessContext<TPrivateState> = {
    privateState: currentState,
    setPrivateState: (newState: TPrivateState) => {
      currentState = { ...newState };
      context.privateState = currentState;
    },
    ledgerState: {
      balances: new Map(),
      totalSupply: 0n,
      admin: "addr_admin",
      members: new Set(),
      storage: new Map(),
    },
    contractAddress: "contract_test",
  };

  return {
    context,
    getPrivateState: () => currentState,
  };
}

// =============================================================================
// Byte Utilities
// =============================================================================

/**
 * Generate random test bytes.
 */
export function generateTestBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Generate deterministic test bytes from a seed string.
 */
export function seedTestBytes(seed: string, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let hash = 0;

  for (let i = 0; i < length; i++) {
    // Simple seeded PRNG
    hash = ((hash << 5) - hash + seed.charCodeAt(i % seed.length)) | 0;
    bytes[i] = Math.abs(hash) % 256;
  }

  return bytes;
}

/**
 * Convert hex string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

/**
 * Convert Uint8Array to hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive a test public key from a secret key (mock implementation).
 */
function deriveTestPublicKey(secretKey: Uint8Array): Uint8Array {
  // This is NOT cryptographically valid - just for testing
  const publicKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKey[i] = (secretKey[i] ^ 0xff) % 256;
  }
  return publicKey;
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that two Uint8Arrays are equal.
 */
export function assertBytesEqual(
  actual: Uint8Array,
  expected: Uint8Array,
  message?: string
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      message ??
        `Byte arrays have different lengths: ${actual.length} vs ${expected.length}`
    );
  }

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        message ??
          `Byte arrays differ at index ${i}: ${actual[i]} vs ${expected[i]}`
      );
    }
  }
}

/**
 * Assert that a function throws an error matching the given pattern.
 */
export function assertThrows(
  fn: () => unknown,
  errorPattern: string | RegExp,
  message?: string
): void {
  let thrown = false;
  let error: unknown;

  try {
    fn();
  } catch (e) {
    thrown = true;
    error = e;
  }

  if (!thrown) {
    throw new Error(message ?? "Expected function to throw, but it did not");
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const pattern =
    typeof errorPattern === "string" ? new RegExp(errorPattern, "i") : errorPattern;

  if (!pattern.test(errorMessage)) {
    throw new Error(
      message ??
        `Expected error matching ${pattern}, but got: "${errorMessage}"`
    );
  }
}

/**
 * Assert that an async function throws an error matching the given pattern.
 */
export async function assertThrowsAsync(
  fn: () => Promise<unknown>,
  errorPattern: string | RegExp,
  message?: string
): Promise<void> {
  let thrown = false;
  let error: unknown;

  try {
    await fn();
  } catch (e) {
    thrown = true;
    error = e;
  }

  if (!thrown) {
    throw new Error(message ?? "Expected function to throw, but it did not");
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const pattern =
    typeof errorPattern === "string" ? new RegExp(errorPattern, "i") : errorPattern;

  if (!pattern.test(errorMessage)) {
    throw new Error(
      message ??
        `Expected error matching ${pattern}, but got: "${errorMessage}"`
    );
  }
}

// =============================================================================
// Time Utilities
// =============================================================================

/**
 * Get current Unix timestamp as bigint.
 */
export function nowTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/**
 * Create a timestamp in the future.
 */
export function futureTimestamp(secondsFromNow: number): bigint {
  return nowTimestamp() + BigInt(secondsFromNow);
}

/**
 * Create a timestamp in the past.
 */
export function pastTimestamp(secondsAgo: number): bigint {
  return nowTimestamp() - BigInt(secondsAgo);
}

/**
 * Wait for a specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Test Address Generation
// =============================================================================

/**
 * Generate a test address with a recognizable prefix.
 */
export function testAddress(name: string): string {
  return `addr_test1_${name}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate multiple test addresses.
 */
export function testAddresses(count: number, prefix = "user"): string[] {
  return Array.from({ length: count }, (_, i) => testAddress(`${prefix}${i + 1}`));
}
