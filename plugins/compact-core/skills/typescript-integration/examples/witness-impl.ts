/**
 * Complete Witness Implementation Example
 *
 * This file demonstrates implementing witnesses for a Compact contract
 * that handles private credentials and token transfers.
 *
 * Corresponding Compact contract (credential-token.compact):
 * ```compact
 * witness get_secret_key(): Bytes<32>;
 * witness get_credential(id: Bytes<32>): Credential;
 * witness sign_message(message: Bytes<32>): Bytes<64>;
 * witness get_merkle_proof(leaf: Bytes<32>): MerkleProof;
 *
 * struct Credential {
 *     owner: Bytes<32>,
 *     level: Uint<8>,
 *     expiry: Uint<64>
 * }
 *
 * struct MerkleProof {
 *     path: Vector<Bytes<32>, 32>,
 *     indices: Vector<Boolean, 32>
 * }
 * ```
 */

import type { WitnessContext } from "@midnight-ntwrk/midnight-js-types";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Credential structure matching Compact struct
 */
interface Credential {
  owner: Uint8Array; // Bytes<32>
  level: bigint; // Uint<8>
  expiry: bigint; // Uint<64>
}

/**
 * Merkle proof structure matching Compact struct
 */
interface MerkleProof {
  path: Uint8Array[]; // Vector<Bytes<32>, 32>
  indices: boolean[]; // Vector<Boolean, 32>
}

/**
 * Private state managed by the DApp
 */
interface PrivateState {
  // Secret key for signing (never leaves the client)
  secretKey: Uint8Array;

  // Public key derived from secret
  publicKey: Uint8Array;

  // Stored credentials indexed by ID
  credentials: Map<string, Credential>;

  // Merkle tree for membership proofs
  merkleTree: MerkleTreeClient;

  // Transaction nonce
  nonce: bigint;
}

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
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Compare two Uint8Arrays
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// =============================================================================
// Mock Cryptographic Functions (replace with real implementations)
// =============================================================================

/**
 * Sign a message with Ed25519 (mock implementation)
 * In production, use @noble/ed25519 or similar
 */
async function ed25519Sign(
  message: Uint8Array,
  secretKey: Uint8Array
): Promise<Uint8Array> {
  // Mock: In production use actual Ed25519 signing
  const signature = new Uint8Array(64);
  // ... actual signing logic
  return signature;
}

/**
 * Mock Merkle tree client
 */
interface MerkleTreeClient {
  getProof(leaf: Uint8Array): MerkleProof;
  getRoot(): Uint8Array;
}

// =============================================================================
// Witness Implementations
// =============================================================================

/**
 * Custom error class for witness failures
 */
class WitnessError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "WitnessError";
  }
}

/**
 * Complete witness implementations for the credential-token contract
 */
export const witnesses = {
  /**
   * Returns the user's secret key (32 bytes)
   *
   * Compact: witness get_secret_key(): Bytes<32>;
   */
  get_secret_key: ({ privateState }: WitnessContext<PrivateState>): Uint8Array => {
    if (!privateState.secretKey || privateState.secretKey.length !== 32) {
      throw new WitnessError("Secret key not initialized", "NO_SECRET_KEY");
    }
    return privateState.secretKey;
  },

  /**
   * Retrieves a stored credential by ID
   *
   * Compact: witness get_credential(id: Bytes<32>): Credential;
   */
  get_credential: (
    { privateState }: WitnessContext<PrivateState>,
    credentialId: Uint8Array
  ): Credential => {
    const id = bytesToHex(credentialId);
    const credential = privateState.credentials.get(id);

    if (!credential) {
      throw new WitnessError(
        `Credential not found: ${id.substring(0, 16)}...`,
        "CREDENTIAL_NOT_FOUND"
      );
    }

    // Check expiry
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (credential.expiry < now) {
      throw new WitnessError(
        `Credential expired: ${id.substring(0, 16)}...`,
        "CREDENTIAL_EXPIRED"
      );
    }

    return credential;
  },

  /**
   * Signs a message using the secret key
   *
   * Compact: witness sign_message(message: Bytes<32>): Bytes<64>;
   */
  sign_message: async (
    { privateState }: WitnessContext<PrivateState>,
    message: Uint8Array
  ): Promise<Uint8Array> => {
    if (message.length !== 32) {
      throw new WitnessError(
        `Invalid message length: expected 32, got ${message.length}`,
        "INVALID_MESSAGE"
      );
    }

    const signature = await ed25519Sign(message, privateState.secretKey);

    if (signature.length !== 64) {
      throw new WitnessError("Signature generation failed", "SIGN_FAILED");
    }

    return signature;
  },

  /**
   * Generates a Merkle proof for membership
   *
   * Compact: witness get_merkle_proof(leaf: Bytes<32>): MerkleProof;
   */
  get_merkle_proof: (
    { privateState }: WitnessContext<PrivateState>,
    leaf: Uint8Array
  ): MerkleProof => {
    if (!privateState.merkleTree) {
      throw new WitnessError("Merkle tree not initialized", "NO_MERKLE_TREE");
    }

    try {
      const proof = privateState.merkleTree.getProof(leaf);

      // Ensure proof has exactly 32 levels
      if (proof.path.length !== 32 || proof.indices.length !== 32) {
        throw new WitnessError(
          "Invalid proof depth: expected 32 levels",
          "INVALID_PROOF_DEPTH"
        );
      }

      return proof;
    } catch (error) {
      if (error instanceof WitnessError) throw error;
      throw new WitnessError(
        `Failed to generate proof: ${error}`,
        "PROOF_GENERATION_FAILED"
      );
    }
  },

  /**
   * Gets and increments the transaction nonce
   *
   * Compact: witness get_nonce(): Uint<64>;
   */
  get_nonce: ({
    privateState,
    setPrivateState,
  }: WitnessContext<PrivateState>): bigint => {
    const currentNonce = privateState.nonce;

    // Increment nonce for next use
    setPrivateState({
      ...privateState,
      nonce: currentNonce + 1n,
    });

    return currentNonce;
  },
};

// =============================================================================
// Private State Management
// =============================================================================

/**
 * Initialize private state for a new user
 */
export function createInitialPrivateState(secretKey: Uint8Array): PrivateState {
  // Derive public key from secret (mock - use real derivation)
  const publicKey = new Uint8Array(32);

  return {
    secretKey,
    publicKey,
    credentials: new Map(),
    merkleTree: createMerkleTreeClient(),
    nonce: 0n,
  };
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
 * Mock Merkle tree client creation
 */
function createMerkleTreeClient(): MerkleTreeClient {
  return {
    getProof: (leaf: Uint8Array): MerkleProof => {
      // Mock implementation
      return {
        path: Array(32)
          .fill(null)
          .map(() => new Uint8Array(32)),
        indices: Array(32).fill(false),
      };
    },
    getRoot: (): Uint8Array => new Uint8Array(32),
  };
}

// =============================================================================
// Usage Example
// =============================================================================

async function exampleUsage() {
  // Import generated contract
  // import { CredentialTokenContract } from './build/credential-token';
  // import { MidnightProvider } from '@midnight-ntwrk/midnight-js-provider';

  // Initialize provider (mock)
  // const provider = new MidnightProvider({ ... });

  // Create initial private state
  const secretKey = new Uint8Array(32);
  crypto.getRandomValues(secretKey);
  const privateState = createInitialPrivateState(secretKey);

  // Add a credential
  const credentialId = new Uint8Array(32);
  crypto.getRandomValues(credentialId);

  const stateWithCredential = addCredential(privateState, credentialId, {
    owner: privateState.publicKey,
    level: 5n,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86400 * 365), // 1 year
  });

  // Use witnesses with contract
  // const contract = createCredentialTokenContract(provider, contractAddress);
  //
  // await contract.callTx.verify_and_transfer(
  //   credentialId,
  //   recipientAddress,
  //   1000n,
  //   witnesses
  // );

  console.log("Witness implementation ready");
  console.log("Credentials stored:", stateWithCredential.credentials.size);
}

// Run example if executed directly
if (require.main === module) {
  exampleUsage().catch(console.error);
}
