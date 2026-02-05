/**
 * MidnightErrors - Custom error classes for Midnight DApps
 *
 * Provides typed errors for different failure scenarios, enabling
 * type-safe error handling and consistent error formatting.
 */

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Proof-related error codes
 */
export const ProofErrorCode = {
  PROOF_TIMEOUT: 'PROOF_TIMEOUT',
  PROOF_SERVER_UNAVAILABLE: 'PROOF_SERVER_UNAVAILABLE',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  WITNESS_FAILED: 'WITNESS_FAILED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
} as const;

/**
 * Transaction-related error codes
 */
export const TransactionErrorCode = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  STATE_CONFLICT: 'STATE_CONFLICT',
  NONCE_MISMATCH: 'NONCE_MISMATCH',
  GAS_EXHAUSTED: 'GAS_EXHAUSTED',
  CONTRACT_REVERTED: 'CONTRACT_REVERTED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  NETWORK_REJECTED: 'NETWORK_REJECTED',
  SUBMISSION_FAILED: 'SUBMISSION_FAILED',
  CONFIRMATION_TIMEOUT: 'CONFIRMATION_TIMEOUT',
} as const;

/**
 * Network-related error codes
 */
export const NetworkErrorCode = {
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  DNS_FAILED: 'DNS_FAILED',
  WEBSOCKET_CLOSED: 'WEBSOCKET_CLOSED',
  WEBSOCKET_ERROR: 'WEBSOCKET_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  OFFLINE: 'OFFLINE',
} as const;

/**
 * Wallet-related error codes
 */
export const WalletErrorCode = {
  WALLET_NOT_INSTALLED: 'WALLET_NOT_INSTALLED',
  USER_REJECTED: 'USER_REJECTED',
  WALLET_DISCONNECTED: 'WALLET_DISCONNECTED',
  WRONG_NETWORK: 'WRONG_NETWORK',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  SIGNATURE_FAILED: 'SIGNATURE_FAILED',
} as const;

/**
 * Combined error codes
 */
export const ErrorCode = {
  ...ProofErrorCode,
  ...TransactionErrorCode,
  ...NetworkErrorCode,
  ...WalletErrorCode,
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * Base error class for all Midnight-specific errors
 */
export class MidnightError extends Error {
  /** Error code for programmatic handling */
  public readonly code: ErrorCode;

  /** Error category */
  public readonly category: 'proof' | 'transaction' | 'network' | 'wallet' | 'unknown';

  /** Whether this error is retryable */
  public readonly retryable: boolean;

  /** Original error if this wraps another error */
  public readonly cause?: Error;

  /** Additional metadata */
  public readonly metadata?: Record<string, unknown>;

  /** Timestamp when error occurred */
  public readonly timestamp: Date;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      cause?: Error;
      metadata?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(message);
    this.name = 'MidnightError';
    this.code = code;
    this.category = getErrorCategory(code);
    this.retryable = options?.retryable ?? isRetryableCode(code);
    this.cause = options?.cause;
    this.metadata = options?.metadata;
    this.timestamp = new Date();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MidnightError);
    }
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      retryable: this.retryable,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause?.message,
    };
  }

  /**
   * Create a human-readable string
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

// =============================================================================
// Specialized Error Classes
// =============================================================================

/**
 * Error during ZK proof generation
 */
export class ProofError extends MidnightError {
  constructor(
    code: keyof typeof ProofErrorCode,
    message: string,
    options?: {
      cause?: Error;
      metadata?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(ProofErrorCode[code], message, options);
    this.name = 'ProofError';
  }
}

/**
 * Error during transaction execution
 */
export class TransactionError extends MidnightError {
  /** Transaction hash if available */
  public readonly txHash?: string;

  constructor(
    code: keyof typeof TransactionErrorCode,
    message: string,
    options?: {
      cause?: Error;
      metadata?: Record<string, unknown>;
      retryable?: boolean;
      txHash?: string;
    }
  ) {
    super(TransactionErrorCode[code], message, options);
    this.name = 'TransactionError';
    this.txHash = options?.txHash;
  }
}

/**
 * Error during network operations
 */
export class NetworkError extends MidnightError {
  /** Service that failed */
  public readonly service: 'indexer' | 'proof_server' | 'websocket' | 'wallet';

  constructor(
    code: keyof typeof NetworkErrorCode,
    message: string,
    service: 'indexer' | 'proof_server' | 'websocket' | 'wallet',
    options?: {
      cause?: Error;
      metadata?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(NetworkErrorCode[code], message, options);
    this.name = 'NetworkError';
    this.service = service;
  }
}

/**
 * Error during wallet operations
 */
export class WalletError extends MidnightError {
  constructor(
    code: keyof typeof WalletErrorCode,
    message: string,
    options?: {
      cause?: Error;
      metadata?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(WalletErrorCode[code], message, options);
    this.name = 'WalletError';
  }
}

/**
 * Witness function error
 */
export class WitnessError extends ProofError {
  /** Witness function name */
  public readonly witnessName: string;

  constructor(
    witnessName: string,
    message: string,
    options?: {
      cause?: Error;
      metadata?: Record<string, unknown>;
    }
  ) {
    super('WITNESS_FAILED', message, {
      ...options,
      metadata: {
        ...options?.metadata,
        witnessName,
      },
    });
    this.name = 'WitnessError';
    this.witnessName = witnessName;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get error category from code
 */
function getErrorCategory(code: ErrorCode): 'proof' | 'transaction' | 'network' | 'wallet' | 'unknown' {
  if (Object.values(ProofErrorCode).includes(code as keyof typeof ProofErrorCode)) {
    return 'proof';
  }
  if (Object.values(TransactionErrorCode).includes(code as keyof typeof TransactionErrorCode)) {
    return 'transaction';
  }
  if (Object.values(NetworkErrorCode).includes(code as keyof typeof NetworkErrorCode)) {
    return 'network';
  }
  if (Object.values(WalletErrorCode).includes(code as keyof typeof WalletErrorCode)) {
    return 'wallet';
  }
  return 'unknown';
}

/**
 * Check if error code is retryable by default
 */
function isRetryableCode(code: ErrorCode): boolean {
  const retryableCodes = new Set<ErrorCode>([
    // Proof errors
    'PROOF_TIMEOUT',
    'GENERATION_FAILED',

    // Transaction errors
    'STATE_CONFLICT',
    'NONCE_MISMATCH',
    'SUBMISSION_FAILED',

    // Network errors
    'CONNECTION_REFUSED',
    'CONNECTION_TIMEOUT',
    'WEBSOCKET_CLOSED',
    'WEBSOCKET_ERROR',
    'REQUEST_TIMEOUT',
    'SERVICE_UNAVAILABLE',

    // Wallet errors
    'USER_REJECTED',
    'WALLET_DISCONNECTED',

    // Unknown
    'UNKNOWN_ERROR',
  ]);

  return retryableCodes.has(code);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if error is a MidnightError
 */
export function isMidnightError(error: unknown): error is MidnightError {
  return error instanceof MidnightError;
}

/**
 * Check if error is a ProofError
 */
export function isProofError(error: unknown): error is ProofError {
  return error instanceof ProofError;
}

/**
 * Check if error is a TransactionError
 */
export function isTransactionError(error: unknown): error is TransactionError {
  return error instanceof TransactionError;
}

/**
 * Check if error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Check if error is a WalletError
 */
export function isWalletError(error: unknown): error is WalletError {
  return error instanceof WalletError;
}

/**
 * Check if error is a WitnessError
 */
export function isWitnessError(error: unknown): error is WitnessError {
  return error instanceof WitnessError;
}

/**
 * Check if error has a specific code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isMidnightError(error) && error.code === code;
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (isMidnightError(error)) {
    return error.retryable;
  }
  // Unknown errors are conservatively retryable
  return true;
}

/**
 * Check if error is a user rejection
 */
export function isUserRejection(error: unknown): boolean {
  return hasErrorCode(error, 'USER_REJECTED');
}

// =============================================================================
// Error Wrapping
// =============================================================================

/**
 * Wrap an unknown error as a MidnightError
 */
export function wrapError(
  error: unknown,
  defaultCode: ErrorCode = 'UNKNOWN_ERROR'
): MidnightError {
  // Already a MidnightError
  if (isMidnightError(error)) {
    return error;
  }

  const cause = error instanceof Error ? error : undefined;
  const message = error instanceof Error ? error.message : String(error);

  // Try to infer code from message
  const inferredCode = inferErrorCode(message);

  return new MidnightError(inferredCode ?? defaultCode, message, {
    cause,
  });
}

/**
 * Infer error code from message
 */
function inferErrorCode(message: string): ErrorCode | null {
  const lowerMessage = message.toLowerCase();

  // Proof errors
  if (lowerMessage.includes('timeout') && lowerMessage.includes('proof')) {
    return 'PROOF_TIMEOUT';
  }
  if (lowerMessage.includes('proof server') || lowerMessage.includes('6300')) {
    return 'PROOF_SERVER_UNAVAILABLE';
  }
  if (lowerMessage.includes('constraint') || lowerMessage.includes('circuit')) {
    return 'CONSTRAINT_VIOLATION';
  }
  if (lowerMessage.includes('witness')) {
    return 'WITNESS_FAILED';
  }

  // Transaction errors
  if (lowerMessage.includes('insufficient') || lowerMessage.includes('balance')) {
    return 'INSUFFICIENT_BALANCE';
  }
  if (lowerMessage.includes('conflict') || lowerMessage.includes('stale')) {
    return 'STATE_CONFLICT';
  }
  if (lowerMessage.includes('nonce')) {
    return 'NONCE_MISMATCH';
  }

  // Network errors
  if (lowerMessage.includes('connection') && lowerMessage.includes('refused')) {
    return 'CONNECTION_REFUSED';
  }
  if (lowerMessage.includes('timeout')) {
    return 'REQUEST_TIMEOUT';
  }
  if (lowerMessage.includes('offline')) {
    return 'OFFLINE';
  }

  // Wallet errors
  if (lowerMessage.includes('not installed') || lowerMessage.includes('lace')) {
    return 'WALLET_NOT_INSTALLED';
  }
  if (lowerMessage.includes('rejected') || lowerMessage.includes('cancelled')) {
    return 'USER_REJECTED';
  }
  if (lowerMessage.includes('disconnected')) {
    return 'WALLET_DISCONNECTED';
  }

  return null;
}

// =============================================================================
// Result Type
// =============================================================================

/**
 * Result type for operations that may fail
 */
export type Result<T, E extends MidnightError = MidnightError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create an error result
 */
export function err<E extends MidnightError>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wrap a promise in a Result
 */
export async function toResult<T>(
  promise: Promise<T>
): Promise<Result<T>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (error) {
    return err(wrapError(error));
  }
}
