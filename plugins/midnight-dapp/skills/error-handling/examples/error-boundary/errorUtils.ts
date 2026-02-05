/**
 * errorUtils - Error classification and formatting utilities
 *
 * Provides functions to classify unknown errors into structured types
 * and format them for display and logging.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Error categories for Midnight DApps
 */
export type ErrorCategory = 'proof' | 'transaction' | 'network' | 'wallet' | 'unknown';

/**
 * Classified error with user-facing information
 */
export interface ClassifiedError {
  /** Error code for programmatic handling */
  code: string;

  /** Technical error message */
  message: string;

  /** User-friendly message */
  userMessage: string;

  /** Suggested action for the user */
  suggestion: string;

  /** Whether the operation can be retried */
  retryable: boolean;

  /** Error category */
  category: ErrorCategory;

  /** Original error if available */
  cause?: Error;
}

/**
 * Error pattern for classification
 */
interface ErrorPattern {
  patterns: RegExp[];
  code: string;
  category: ErrorCategory;
  userMessage: string;
  suggestion: string;
  retryable: boolean;
}

// =============================================================================
// Error Patterns
// =============================================================================

const ERROR_PATTERNS: ErrorPattern[] = [
  // Proof errors
  {
    patterns: [
      /proof.*timeout/i,
      /timed?\s*out.*proof/i,
      /proof generation.*timeout/i,
    ],
    code: 'PROOF_TIMEOUT',
    category: 'proof',
    userMessage: 'Proof generation is taking longer than expected.',
    suggestion: 'Please wait and try again. If this persists, try a simpler transaction.',
    retryable: true,
  },
  {
    patterns: [
      /proof\s*server/i,
      /localhost:6300/i,
      /econnrefused.*6300/i,
      /prover.*unavailable/i,
    ],
    code: 'PROOF_SERVER_UNAVAILABLE',
    category: 'proof',
    userMessage: 'The proof server is not running.',
    suggestion: 'Start the proof server with Docker and try again.',
    retryable: false,
  },
  {
    patterns: [
      /constraint.*fail/i,
      /circuit.*fail/i,
      /assertion.*fail/i,
      /constraint.*violation/i,
    ],
    code: 'CONSTRAINT_VIOLATION',
    category: 'proof',
    userMessage: 'The transaction inputs don\'t meet the required conditions.',
    suggestion: 'Check your inputs and try again.',
    retryable: false,
  },
  {
    patterns: [
      /witness.*fail/i,
      /witness.*error/i,
      /witnesserror/i,
      /witness.*not\s*found/i,
    ],
    code: 'WITNESS_FAILED',
    category: 'proof',
    userMessage: 'Required data could not be found.',
    suggestion: 'Ensure your wallet has the necessary credentials.',
    retryable: false,
  },

  // Transaction errors
  {
    patterns: [
      /insufficient.*balance/i,
      /balance.*insufficient/i,
      /not\s*enough.*tokens?/i,
      /balance.*too\s*low/i,
    ],
    code: 'INSUFFICIENT_BALANCE',
    category: 'transaction',
    userMessage: 'You don\'t have enough tokens for this transaction.',
    suggestion: 'Add more tokens to your wallet and try again.',
    retryable: false,
  },
  {
    patterns: [
      /state.*conflict/i,
      /optimistic.*lock/i,
      /concurrent.*modification/i,
    ],
    code: 'STATE_CONFLICT',
    category: 'transaction',
    userMessage: 'The contract state changed while processing.',
    suggestion: 'Please review and try again.',
    retryable: true,
  },
  {
    patterns: [
      /nonce.*mismatch/i,
      /invalid.*nonce/i,
      /nonce.*invalid/i,
    ],
    code: 'NONCE_MISMATCH',
    category: 'transaction',
    userMessage: 'Transaction sequence is out of sync.',
    suggestion: 'Please wait a moment and try again.',
    retryable: true,
  },
  {
    patterns: [
      /gas.*exhaust/i,
      /out\s*of\s*gas/i,
      /gas.*limit/i,
    ],
    code: 'GAS_EXHAUSTED',
    category: 'transaction',
    userMessage: 'The transaction requires more resources than available.',
    suggestion: 'Try a simpler transaction.',
    retryable: false,
  },
  {
    patterns: [
      /contract.*revert/i,
      /execution.*revert/i,
      /revert/i,
    ],
    code: 'CONTRACT_REVERTED',
    category: 'transaction',
    userMessage: 'The contract rejected this transaction.',
    suggestion: 'Check your inputs and try again.',
    retryable: false,
  },

  // Network errors
  {
    patterns: [
      /econnrefused/i,
      /connection\s*refused/i,
      /connect\s*failed/i,
    ],
    code: 'CONNECTION_REFUSED',
    category: 'network',
    userMessage: 'Unable to connect to the service.',
    suggestion: 'Check that the service is running and try again.',
    retryable: true,
  },
  {
    patterns: [
      /timeout/i,
      /timed?\s*out/i,
      /request.*timeout/i,
    ],
    code: 'REQUEST_TIMEOUT',
    category: 'network',
    userMessage: 'The request took too long to complete.',
    suggestion: 'Please try again.',
    retryable: true,
  },
  {
    patterns: [
      /network.*error/i,
      /fetch.*fail/i,
      /failed\s*to\s*fetch/i,
    ],
    code: 'NETWORK_ERROR',
    category: 'network',
    userMessage: 'A network error occurred.',
    suggestion: 'Check your internet connection and try again.',
    retryable: true,
  },
  {
    patterns: [
      /websocket.*close/i,
      /ws.*disconnect/i,
      /socket.*close/i,
    ],
    code: 'WEBSOCKET_CLOSED',
    category: 'network',
    userMessage: 'Lost connection to real-time updates.',
    suggestion: 'Reconnecting automatically...',
    retryable: true,
  },
  {
    patterns: [
      /offline/i,
      /no\s*internet/i,
      /navigator\.online.*false/i,
    ],
    code: 'OFFLINE',
    category: 'network',
    userMessage: 'You appear to be offline.',
    suggestion: 'Check your internet connection.',
    retryable: true,
  },

  // Wallet errors
  {
    patterns: [
      /wallet.*not\s*installed/i,
      /lace.*not\s*found/i,
      /window\.midnight.*undefined/i,
    ],
    code: 'WALLET_NOT_INSTALLED',
    category: 'wallet',
    userMessage: 'Lace wallet is not installed.',
    suggestion: 'Install Lace from lace.io to continue.',
    retryable: false,
  },
  {
    patterns: [
      /user\s*reject/i,
      /rejected\s*by\s*user/i,
      /user\s*denied/i,
      /user\s*cancel/i,
    ],
    code: 'USER_REJECTED',
    category: 'wallet',
    userMessage: 'You cancelled the request.',
    suggestion: 'Try again when you\'re ready.',
    retryable: true,
  },
  {
    patterns: [
      /wallet.*disconnect/i,
      /not\s*connected/i,
      /wallet.*unavailable/i,
    ],
    code: 'WALLET_DISCONNECTED',
    category: 'wallet',
    userMessage: 'Your wallet is not connected.',
    suggestion: 'Connect your wallet to continue.',
    retryable: true,
  },
  {
    patterns: [
      /wrong\s*network/i,
      /network.*mismatch/i,
      /switch.*network/i,
    ],
    code: 'WRONG_NETWORK',
    category: 'wallet',
    userMessage: 'Your wallet is connected to the wrong network.',
    suggestion: 'Switch to the correct network in your wallet.',
    retryable: false,
  },
];

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Classify an unknown error into a structured type
 */
export function classifyError(error: unknown): ClassifiedError {
  // Handle MidnightError or custom typed errors
  if (error && typeof error === 'object' && 'code' in error) {
    const typedError = error as { code: string; message: string };
    const pattern = ERROR_PATTERNS.find(p => p.code === typedError.code);

    if (pattern) {
      return {
        code: pattern.code,
        message: typedError.message,
        userMessage: pattern.userMessage,
        suggestion: pattern.suggestion,
        retryable: pattern.retryable,
        category: pattern.category,
        cause: error instanceof Error ? error : undefined,
      };
    }
  }

  // Classify by message patterns
  const message = error instanceof Error ? error.message : String(error);
  return classifyByMessage(message, error instanceof Error ? error : undefined);
}

/**
 * Classify error by examining its message
 */
function classifyByMessage(message: string, cause?: Error): ClassifiedError {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.patterns.some(regex => regex.test(message))) {
      return {
        code: pattern.code,
        message,
        userMessage: pattern.userMessage,
        suggestion: pattern.suggestion,
        retryable: pattern.retryable,
        category: pattern.category,
        cause,
      };
    }
  }

  // Default unknown error
  return {
    code: 'UNKNOWN_ERROR',
    message,
    userMessage: 'Something unexpected happened.',
    suggestion: 'Please try again. If this continues, contact support.',
    retryable: true,
    category: 'unknown',
    cause,
  };
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.retryable;
}

/**
 * Check if an error is a user rejection
 */
export function isUserRejection(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.code === 'USER_REJECTED';
}

/**
 * Get the error category
 */
export function getErrorCategory(error: unknown): ErrorCategory {
  const classified = classifyError(error);
  return classified.category;
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Log data structure for error tracking
 */
export interface ErrorLogData {
  code: string;
  message: string;
  category: ErrorCategory;
  timestamp: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Format an error for logging (sanitized for external services)
 */
export function formatErrorForLogging(
  error: unknown,
  context?: Record<string, unknown>
): ErrorLogData {
  const classified = classifyError(error);

  return {
    code: classified.code,
    message: classified.message,
    category: classified.category,
    timestamp: new Date().toISOString(),
    context: sanitizeContext(context),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

/**
 * Remove sensitive data from context before logging
 */
function sanitizeContext(
  context?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!context) return undefined;

  const sensitiveKeys = [
    'password',
    'secret',
    'key',
    'token',
    'privateKey',
    'privateState',
    'credential',
    'auth',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Format error for display in a toast notification
 */
export function formatErrorForToast(error: unknown): {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
} {
  const classified = classifyError(error);

  // User rejections are informational, not errors
  const type = classified.code === 'USER_REJECTED' ? 'info' :
               classified.retryable ? 'warning' : 'error';

  return {
    title: getErrorTitle(classified),
    message: classified.suggestion,
    type,
  };
}

/**
 * Get a short title for an error
 */
function getErrorTitle(error: ClassifiedError): string {
  const titles: Record<string, string> = {
    PROOF_TIMEOUT: 'Proof Timeout',
    PROOF_SERVER_UNAVAILABLE: 'Proof Server Offline',
    CONSTRAINT_VIOLATION: 'Invalid Transaction',
    WITNESS_FAILED: 'Missing Data',
    INSUFFICIENT_BALANCE: 'Insufficient Balance',
    STATE_CONFLICT: 'State Conflict',
    NONCE_MISMATCH: 'Sync Error',
    GAS_EXHAUSTED: 'Resource Limit',
    CONTRACT_REVERTED: 'Transaction Rejected',
    CONNECTION_REFUSED: 'Connection Failed',
    REQUEST_TIMEOUT: 'Request Timeout',
    NETWORK_ERROR: 'Network Error',
    WEBSOCKET_CLOSED: 'Connection Lost',
    OFFLINE: 'Offline',
    WALLET_NOT_INSTALLED: 'Wallet Required',
    USER_REJECTED: 'Cancelled',
    WALLET_DISCONNECTED: 'Wallet Disconnected',
    WRONG_NETWORK: 'Wrong Network',
    UNKNOWN_ERROR: 'Error',
  };

  return titles[error.code] ?? 'Error';
}

// =============================================================================
// Error Aggregation
// =============================================================================

/**
 * Aggregate multiple errors into a summary
 */
export function aggregateErrors(errors: unknown[]): {
  count: number;
  byCategory: Record<ErrorCategory, number>;
  mostCommon: ClassifiedError | null;
  hasRetryable: boolean;
} {
  const classified = errors.map(classifyError);

  const byCategory: Record<ErrorCategory, number> = {
    proof: 0,
    transaction: 0,
    network: 0,
    wallet: 0,
    unknown: 0,
  };

  const codeCount: Record<string, number> = {};
  let mostCommonCode = '';
  let maxCount = 0;

  for (const error of classified) {
    byCategory[error.category]++;
    codeCount[error.code] = (codeCount[error.code] ?? 0) + 1;

    if (codeCount[error.code] > maxCount) {
      maxCount = codeCount[error.code];
      mostCommonCode = error.code;
    }
  }

  return {
    count: errors.length,
    byCategory,
    mostCommon: classified.find(e => e.code === mostCommonCode) ?? null,
    hasRetryable: classified.some(e => e.retryable),
  };
}
