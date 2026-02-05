/**
 * Type definitions for witness implementations
 *
 * These interfaces map Compact types to TypeScript, enabling type-safe
 * witness function implementations.
 */

// =============================================================================
// Compact Type Mappings
// =============================================================================

/**
 * Credential structure matching Compact struct:
 * ```compact
 * struct Credential {
 *     owner: Bytes<32>,
 *     level: Uint<8>,
 *     expiry: Uint<64>
 * }
 * ```
 */
export interface Credential {
  /** Owner's public key hash (32 bytes) */
  owner: Uint8Array;
  /** Access level (0-255) */
  level: bigint;
  /** Unix timestamp of expiry */
  expiry: bigint;
}

/**
 * Merkle proof structure matching Compact struct:
 * ```compact
 * struct MerkleProof {
 *     path: Vector<Bytes<32>, 32>,
 *     indices: Vector<Boolean, 32>
 * }
 * ```
 */
export interface MerkleProof {
  /** Sibling hashes along the path (32 elements) */
  path: Uint8Array[];
  /** Direction at each level (true = right, false = left) */
  indices: boolean[];
}

/**
 * Transfer details matching Compact struct:
 * ```compact
 * struct Transfer {
 *     recipient: Bytes<32>,
 *     amount: Uint<64>,
 *     memo: Bytes<32>
 * }
 * ```
 */
export interface Transfer {
  /** Recipient's public key hash */
  recipient: Uint8Array;
  /** Amount to transfer */
  amount: bigint;
  /** Optional memo (32 bytes) */
  memo: Uint8Array;
}

// =============================================================================
// Private State Types
// =============================================================================

/**
 * Application private state containing all sensitive data.
 * This state is stored locally and never transmitted.
 */
export interface PrivateState {
  /** User's secret key (32 bytes) - never leaves the device */
  secretKey: Uint8Array;

  /** Derived public key (32 bytes) */
  publicKey: Uint8Array;

  /** Stored credentials indexed by ID (hex string) */
  credentials: Map<string, Credential>;

  /** Current balance (private) */
  balance: bigint;

  /** Transaction nonce for replay protection */
  nonce: bigint;

  /** Pending transfers awaiting confirmation */
  pendingTransfers: Transfer[];

  /** Optional API key for external services */
  apiKey?: string;
}

// =============================================================================
// Witness Context Types
// =============================================================================

/**
 * Context provided to witness functions.
 * Matches @midnight-ntwrk/midnight-js-types WitnessContext interface.
 */
export interface WitnessContext<T> {
  /** Application's private state */
  privateState: T;

  /** Function to update private state */
  setPrivateState: (newState: T) => void;

  /** Contract's on-chain ledger state */
  ledgerState: LedgerState;

  /** Address of the deployed contract */
  contractAddress: string;

  /** Transaction metadata */
  transactionContext: TransactionContext;
}

/**
 * On-chain ledger state (public data)
 */
export interface LedgerState {
  /** Public balances (address hash -> balance) */
  balances: Map<string, bigint>;

  /** Total supply */
  totalSupply: bigint;

  /** Contract admin address */
  admin: Uint8Array;

  /** Merkle root of valid credentials */
  credentialRoot: Uint8Array;
}

/**
 * Transaction metadata
 */
export interface TransactionContext {
  /** Current block timestamp */
  timestamp: bigint;

  /** Transaction initiator (if known) */
  sender?: Uint8Array;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes for witness failures
 */
export const WITNESS_ERROR_CODES = {
  /** Required data not found in private state */
  NOT_FOUND: "NOT_FOUND",

  /** Data has expired */
  EXPIRED: "EXPIRED",

  /** Input validation failed */
  INVALID_INPUT: "INVALID_INPUT",

  /** Insufficient balance or allowance */
  INSUFFICIENT: "INSUFFICIENT",

  /** Cryptographic operation failed */
  CRYPTO_ERROR: "CRYPTO_ERROR",

  /** External service unavailable */
  EXTERNAL_ERROR: "EXTERNAL_ERROR",

  /** State not initialized */
  NOT_INITIALIZED: "NOT_INITIALIZED",
} as const;

export type WitnessErrorCode = typeof WITNESS_ERROR_CODES[keyof typeof WITNESS_ERROR_CODES];

/**
 * Custom error class for witness failures.
 * Provides structured error information for debugging and user feedback.
 */
export class WitnessError extends Error {
  public readonly name = "WitnessError";

  constructor(
    message: string,
    public readonly code: WitnessErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WitnessError);
    }
  }

  /**
   * Create error for missing data
   */
  static notFound(resource: string, id?: string): WitnessError {
    const idSuffix = id ? `: ${id.slice(0, 16)}...` : "";
    return new WitnessError(
      `${resource} not found${idSuffix}`,
      WITNESS_ERROR_CODES.NOT_FOUND,
      { resource, id }
    );
  }

  /**
   * Create error for expired data
   */
  static expired(resource: string, expiry: bigint): WitnessError {
    return new WitnessError(
      `${resource} expired at ${expiry}`,
      WITNESS_ERROR_CODES.EXPIRED,
      { resource, expiry: expiry.toString() }
    );
  }

  /**
   * Create error for invalid input
   */
  static invalidInput(field: string, reason: string): WitnessError {
    return new WitnessError(
      `Invalid ${field}: ${reason}`,
      WITNESS_ERROR_CODES.INVALID_INPUT,
      { field, reason }
    );
  }

  /**
   * Create error for insufficient resources
   */
  static insufficient(resource: string, required: bigint, available: bigint): WitnessError {
    return new WitnessError(
      `Insufficient ${resource}: required ${required}, available ${available}`,
      WITNESS_ERROR_CODES.INSUFFICIENT,
      { resource, required: required.toString(), available: available.toString() }
    );
  }
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Result type for operations that may fail
 */
export type Result<T, E = WitnessError> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Helper to create success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

/**
 * Helper to create failure result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Type for witness function signatures
 */
export type WitnessFn<TState, TArgs extends unknown[], TResult> =
  (context: WitnessContext<TState>, ...args: TArgs) => TResult | Promise<TResult>;

/**
 * Type for the witnesses object exported to the contract
 */
export interface Witnesses {
  [name: string]: WitnessFn<PrivateState, unknown[], unknown>;
}
