/**
 * Witness Builder - Functions to construct witness objects for Midnight contracts
 *
 * This module provides a complete example of witness implementation patterns
 * including simple, parametric, async, and stateful witnesses.
 */

import type {
  PrivateState,
  WitnessContext,
  Credential,
  MerkleProof,
  Transfer,
  Witnesses,
} from "./types";
import { WitnessError, WITNESS_ERROR_CODES } from "./types";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert Uint8Array to hex string for Map keys
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Compare two Uint8Arrays for equality
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Get current Unix timestamp as bigint
 */
function nowTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

// =============================================================================
// Caching Layer
// =============================================================================

/**
 * Cache for expensive computations (e.g., Merkle proofs)
 * Witnesses may be called multiple times during proof generation
 */
const proofCache = new Map<string, MerkleProof>();

/**
 * Clear all caches (call when private state changes significantly)
 */
export function clearWitnessCaches(): void {
  proofCache.clear();
}

// =============================================================================
// Witness Implementations
// =============================================================================

/**
 * Complete witness object matching Compact declarations.
 *
 * Naming convention: Use snake_case to match Compact witness names.
 *
 * Corresponding Compact:
 * ```compact
 * witness get_secret_key(): Bytes<32>;
 * witness get_public_key(): Bytes<32>;
 * witness get_balance(): Uint<64>;
 * witness get_credential(id: Bytes<32>): Credential;
 * witness get_nonce(): Uint<64>;
 * witness sign_message(message: Bytes<32>): Bytes<64>;
 * witness get_merkle_proof(leaf: Bytes<32>): MerkleProof;
 * witness get_oracle_price(token_id: Bytes<32>): Uint<64>;
 * ```
 */
export const witnesses: Witnesses = {
  // ===========================================================================
  // Simple Witnesses - Direct state access
  // ===========================================================================

  /**
   * Returns the user's secret key (32 bytes)
   *
   * This is the most sensitive piece of data. The key itself is used
   * in the circuit but NEVER appears on-chain - only proofs derived
   * from it are public.
   */
  get_secret_key: ({
    privateState,
  }: WitnessContext<PrivateState>): Uint8Array => {
    if (!privateState.secretKey || privateState.secretKey.length !== 32) {
      throw new WitnessError(
        "Secret key not initialized or invalid length",
        WITNESS_ERROR_CODES.NOT_INITIALIZED,
        { expectedLength: 32, actualLength: privateState.secretKey?.length }
      );
    }
    return privateState.secretKey;
  },

  /**
   * Returns the user's public key (32 bytes)
   */
  get_public_key: ({
    privateState,
  }: WitnessContext<PrivateState>): Uint8Array => {
    if (!privateState.publicKey || privateState.publicKey.length !== 32) {
      throw new WitnessError(
        "Public key not initialized",
        WITNESS_ERROR_CODES.NOT_INITIALIZED
      );
    }
    return privateState.publicKey;
  },

  /**
   * Returns the user's private balance
   */
  get_balance: ({ privateState }: WitnessContext<PrivateState>): bigint => {
    return privateState.balance;
  },

  // ===========================================================================
  // Parametric Witnesses - Accept circuit parameters
  // ===========================================================================

  /**
   * Retrieves a stored credential by ID
   *
   * Includes validation:
   * - Credential must exist
   * - Credential must not be expired
   */
  get_credential: (
    { privateState }: WitnessContext<PrivateState>,
    credentialId: Uint8Array
  ): Credential => {
    // Validate input
    if (!credentialId || credentialId.length !== 32) {
      throw WitnessError.invalidInput(
        "credentialId",
        `expected 32 bytes, got ${credentialId?.length ?? 0}`
      );
    }

    const id = bytesToHex(credentialId);
    const credential = privateState.credentials.get(id);

    // Check existence
    if (!credential) {
      throw WitnessError.notFound("Credential", id);
    }

    // Check expiry
    const now = nowTimestamp();
    if (credential.expiry < now) {
      throw WitnessError.expired("Credential", credential.expiry);
    }

    return credential;
  },

  /**
   * Verifies ownership of an asset
   */
  verify_ownership: (
    { privateState }: WitnessContext<PrivateState>,
    assetOwner: Uint8Array
  ): boolean => {
    return arraysEqual(privateState.publicKey, assetOwner);
  },

  /**
   * Checks if balance is sufficient for transfer
   */
  check_balance: (
    { privateState }: WitnessContext<PrivateState>,
    requiredAmount: bigint
  ): boolean => {
    return privateState.balance >= requiredAmount;
  },

  // ===========================================================================
  // Stateful Witnesses - Modify private state
  // ===========================================================================

  /**
   * Gets and increments the transaction nonce
   *
   * The nonce is incremented to prevent replay attacks.
   * This is one of the few witnesses that legitimately modifies state.
   */
  get_nonce: ({
    privateState,
    setPrivateState,
  }: WitnessContext<PrivateState>): bigint => {
    const currentNonce = privateState.nonce;

    // Increment for next use
    setPrivateState({
      ...privateState,
      nonce: currentNonce + 1n,
    });

    return currentNonce;
  },

  /**
   * Gets next pending transfer and marks it as processed
   */
  get_pending_transfer: ({
    privateState,
    setPrivateState,
  }: WitnessContext<PrivateState>): Transfer => {
    const pending = privateState.pendingTransfers;

    if (pending.length === 0) {
      throw WitnessError.notFound("Pending transfer");
    }

    const transfer = pending[0];

    // Remove from pending list
    setPrivateState({
      ...privateState,
      pendingTransfers: pending.slice(1),
    });

    return transfer;
  },

  // ===========================================================================
  // Async Witnesses - External data fetching
  // ===========================================================================

  /**
   * Signs a message using the secret key
   *
   * This is async because cryptographic operations may be performed
   * in WebCrypto or an external library.
   */
  sign_message: async (
    { privateState }: WitnessContext<PrivateState>,
    message: Uint8Array
  ): Promise<Uint8Array> => {
    // Validate message length
    if (message.length !== 32) {
      throw WitnessError.invalidInput(
        "message",
        `expected 32 bytes, got ${message.length}`
      );
    }

    // In production, use actual Ed25519 signing:
    // import { sign } from '@noble/ed25519';
    // const signature = await sign(message, privateState.secretKey);

    // Mock implementation for example
    const signature = new Uint8Array(64);
    // ... actual signing logic would go here

    return signature;
  },

  /**
   * Fetches oracle price for a token
   *
   * Example of fetching external data during proof generation.
   * The fetched data becomes part of the witness but the source
   * is not revealed on-chain.
   */
  get_oracle_price: async (
    { privateState }: WitnessContext<PrivateState>,
    tokenId: Uint8Array
  ): Promise<bigint> => {
    const tokenHex = bytesToHex(tokenId);

    // Fetch from oracle API
    const response = await fetch(
      `https://api.example.com/price/${tokenHex}`,
      {
        headers: privateState.apiKey
          ? { Authorization: `Bearer ${privateState.apiKey}` }
          : undefined,
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (!response.ok) {
      throw new WitnessError(
        `Oracle API error: ${response.status}`,
        WITNESS_ERROR_CODES.EXTERNAL_ERROR,
        { status: response.status, tokenId: tokenHex }
      );
    }

    const data = await response.json();
    return BigInt(data.price);
  },

  // ===========================================================================
  // Cached Witnesses - Expensive computations
  // ===========================================================================

  /**
   * Generates a Merkle proof for membership verification
   *
   * Uses caching because:
   * 1. Merkle proof computation can be expensive
   * 2. Witnesses may be called multiple times during proof generation
   * 3. The proof doesn't change for the same leaf
   */
  get_merkle_proof: (
    { privateState }: WitnessContext<PrivateState>,
    leaf: Uint8Array
  ): MerkleProof => {
    const cacheKey = bytesToHex(leaf);

    // Return cached proof if available
    const cached = proofCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Validate input
    if (leaf.length !== 32) {
      throw WitnessError.invalidInput(
        "leaf",
        `expected 32 bytes, got ${leaf.length}`
      );
    }

    // Generate proof (mock implementation)
    // In production, this would query a Merkle tree data structure
    const proof: MerkleProof = {
      path: Array(32)
        .fill(null)
        .map(() => new Uint8Array(32)),
      indices: Array(32).fill(false),
    };

    // Cache for subsequent calls
    proofCache.set(cacheKey, proof);

    return proof;
  },
};

// =============================================================================
// Helper Functions for Private State Management
// =============================================================================

/**
 * Create initial private state for a new user
 */
export function createInitialPrivateState(secretKey: Uint8Array): PrivateState {
  if (secretKey.length !== 32) {
    throw WitnessError.invalidInput(
      "secretKey",
      `expected 32 bytes, got ${secretKey.length}`
    );
  }

  // Derive public key (mock - use real derivation in production)
  const publicKey = derivePublicKey(secretKey);

  return {
    secretKey,
    publicKey,
    credentials: new Map(),
    balance: 0n,
    nonce: 0n,
    pendingTransfers: [],
  };
}

/**
 * Derive public key from secret key
 * In production, use proper Ed25519 derivation
 */
function derivePublicKey(secretKey: Uint8Array): Uint8Array {
  // Mock implementation - use @noble/ed25519 in production
  // import { getPublicKey } from '@noble/ed25519';
  // return getPublicKey(secretKey);
  return new Uint8Array(32);
}

/**
 * Add a credential to private state
 */
export function addCredential(
  state: PrivateState,
  id: Uint8Array,
  credential: Credential
): PrivateState {
  const newCredentials = new Map(state.credentials);
  newCredentials.set(bytesToHex(id), credential);

  return {
    ...state,
    credentials: newCredentials,
  };
}

/**
 * Update balance in private state
 */
export function updateBalance(
  state: PrivateState,
  newBalance: bigint
): PrivateState {
  if (newBalance < 0n) {
    throw WitnessError.invalidInput("newBalance", "cannot be negative");
  }

  return {
    ...state,
    balance: newBalance,
  };
}

/**
 * Add a pending transfer to private state
 */
export function addPendingTransfer(
  state: PrivateState,
  transfer: Transfer
): PrivateState {
  return {
    ...state,
    pendingTransfers: [...state.pendingTransfers, transfer],
  };
}

// =============================================================================
// Factory Function for Contract Integration
// =============================================================================

/**
 * Create witnesses bound to a specific private state provider.
 *
 * This pattern is useful when integrating with the Midnight contract APIs
 * which expect a witnesses object.
 *
 * @example
 * ```typescript
 * const { witnesses } = createBoundWitnesses(privateStateProvider);
 *
 * // Use with contract
 * const tx = await contract.callTx.transfer(
 *   recipient,
 *   amount,
 *   witnesses
 * );
 * ```
 */
export function createBoundWitnesses(
  getPrivateState: () => PrivateState,
  setPrivateState: (state: PrivateState) => void
) {
  // Create witness context factory
  const createContext = (): WitnessContext<PrivateState> => ({
    privateState: getPrivateState(),
    setPrivateState,
    ledgerState: {
      balances: new Map(),
      totalSupply: 0n,
      admin: new Uint8Array(32),
      credentialRoot: new Uint8Array(32),
    },
    contractAddress: "",
    transactionContext: {
      timestamp: nowTimestamp(),
    },
  });

  // Return bound witnesses
  return {
    witnesses: Object.fromEntries(
      Object.entries(witnesses).map(([name, fn]) => [
        name,
        (...args: unknown[]) => fn(createContext(), ...args),
      ])
    ),
    clearCaches: clearWitnessCaches,
  };
}
