/**
 * errorCatalog - Central catalog of error codes and user-facing messages
 *
 * Provides consistent error messages across the application with
 * translations ready for i18n if needed.
 */

import { ErrorCode } from './MidnightErrors';

// =============================================================================
// Types
// =============================================================================

/**
 * User-facing error information
 */
export interface ErrorCatalogEntry {
  /** Short title for UI headers */
  title: string;

  /** Detailed description of what happened */
  description: string;

  /** Suggested action for the user */
  suggestion: string;

  /** Technical details for developers (optional) */
  technicalHint?: string;

  /** Severity level for UI styling */
  severity: 'error' | 'warning' | 'info';

  /** Whether the user can retry */
  retryable: boolean;

  /** Help article URL (optional) */
  helpUrl?: string;
}

// =============================================================================
// Error Catalog
// =============================================================================

/**
 * Complete error catalog with user-facing messages
 */
export const ERROR_CATALOG: Record<ErrorCode, ErrorCatalogEntry> = {
  // =========================================================================
  // Proof Errors
  // =========================================================================

  PROOF_TIMEOUT: {
    title: 'Proof Generation Timeout',
    description: 'Creating the cryptographic proof is taking longer than expected.',
    suggestion: 'Please wait and try again. For complex transactions, this may take up to a minute.',
    technicalHint: 'Consider increasing PROOF_TIMEOUT_MS or simplifying the circuit.',
    severity: 'warning',
    retryable: true,
  },

  PROOF_SERVER_UNAVAILABLE: {
    title: 'Proof Server Offline',
    description: 'The proof server is not running on your computer.',
    suggestion: 'Start the proof server with Docker and try again.',
    technicalHint: 'docker run -d -p 6300:6300 midnightnetwork/proof-server',
    severity: 'error',
    retryable: false,
    helpUrl: '/docs/setup/proof-server',
  },

  CONSTRAINT_VIOLATION: {
    title: 'Invalid Transaction',
    description: 'The transaction inputs do not satisfy the contract requirements.',
    suggestion: 'Please check your inputs and try again.',
    technicalHint: 'A circuit constraint failed. Check witness outputs match expected ranges.',
    severity: 'error',
    retryable: false,
  },

  WITNESS_FAILED: {
    title: 'Missing Data',
    description: 'Required data could not be found in your wallet.',
    suggestion: 'Ensure your wallet has the necessary credentials or data.',
    technicalHint: 'Witness function threw an error. Check private state initialization.',
    severity: 'error',
    retryable: false,
  },

  GENERATION_FAILED: {
    title: 'Proof Generation Failed',
    description: 'An error occurred while creating the cryptographic proof.',
    suggestion: 'Please try again. If this continues, contact support.',
    technicalHint: 'General proof generation failure. Check proof server logs.',
    severity: 'error',
    retryable: true,
  },

  VERIFICATION_FAILED: {
    title: 'Proof Verification Failed',
    description: 'The generated proof could not be verified.',
    suggestion: 'This may indicate a bug. Please contact support.',
    technicalHint: 'Local proof verification failed. This should not happen in normal operation.',
    severity: 'error',
    retryable: false,
    helpUrl: '/docs/support',
  },

  RESOURCE_EXHAUSTED: {
    title: 'System Resources Low',
    description: 'Your device may not have enough memory for this operation.',
    suggestion: 'Close other applications and try again.',
    technicalHint: 'Out of memory or CPU during proof generation.',
    severity: 'error',
    retryable: true,
  },

  // =========================================================================
  // Transaction Errors
  // =========================================================================

  INSUFFICIENT_BALANCE: {
    title: 'Insufficient Balance',
    description: 'You do not have enough tokens to complete this transaction.',
    suggestion: 'Add more tokens to your wallet and try again.',
    severity: 'error',
    retryable: false,
  },

  STATE_CONFLICT: {
    title: 'State Conflict',
    description: 'The contract state changed while processing your transaction.',
    suggestion: 'Please review and try again.',
    technicalHint: 'Optimistic locking failure. Refresh state before retrying.',
    severity: 'warning',
    retryable: true,
  },

  NONCE_MISMATCH: {
    title: 'Transaction Sequence Error',
    description: 'Your transaction sequence is out of sync.',
    suggestion: 'Please wait a moment and try again.',
    technicalHint: 'Nonce out of sync. May need to reset local state.',
    severity: 'warning',
    retryable: true,
  },

  GAS_EXHAUSTED: {
    title: 'Transaction Too Complex',
    description: 'The transaction requires more resources than available.',
    suggestion: 'Try a simpler transaction or wait for lower network usage.',
    severity: 'error',
    retryable: false,
  },

  CONTRACT_REVERTED: {
    title: 'Contract Rejected',
    description: 'The smart contract rejected this transaction.',
    suggestion: 'Check your inputs and try again.',
    technicalHint: 'Contract execution reverted. Check require() conditions.',
    severity: 'error',
    retryable: false,
  },

  INVALID_SIGNATURE: {
    title: 'Authentication Failed',
    description: 'Your wallet signature could not be verified.',
    suggestion: 'Reconnect your wallet and try again.',
    severity: 'error',
    retryable: true,
  },

  NETWORK_REJECTED: {
    title: 'Network Rejected',
    description: 'The network rejected your transaction.',
    suggestion: 'Wait a few minutes and try again.',
    technicalHint: 'Transaction rejected by network consensus.',
    severity: 'warning',
    retryable: true,
  },

  SUBMISSION_FAILED: {
    title: 'Submission Failed',
    description: 'Failed to submit your transaction to the network.',
    suggestion: 'Check your internet connection and try again.',
    severity: 'warning',
    retryable: true,
  },

  CONFIRMATION_TIMEOUT: {
    title: 'Confirmation Pending',
    description: 'Your transaction was submitted but confirmation is taking longer than expected.',
    suggestion: 'Your transaction may still be processed. Check your transaction history.',
    severity: 'info',
    retryable: false,
  },

  // =========================================================================
  // Network Errors
  // =========================================================================

  CONNECTION_REFUSED: {
    title: 'Connection Failed',
    description: 'Unable to connect to the required service.',
    suggestion: 'Check that the service is running and try again.',
    severity: 'error',
    retryable: true,
  },

  CONNECTION_TIMEOUT: {
    title: 'Connection Timeout',
    description: 'The connection took too long to establish.',
    suggestion: 'Check your internet connection and try again.',
    severity: 'warning',
    retryable: true,
  },

  DNS_FAILED: {
    title: 'DNS Resolution Failed',
    description: 'Unable to resolve the service address.',
    suggestion: 'Check your network settings.',
    severity: 'error',
    retryable: true,
  },

  WEBSOCKET_CLOSED: {
    title: 'Real-time Connection Lost',
    description: 'Lost connection to real-time updates.',
    suggestion: 'Updates may be delayed. Reconnecting automatically...',
    severity: 'info',
    retryable: true,
  },

  WEBSOCKET_ERROR: {
    title: 'Real-time Connection Error',
    description: 'Error in real-time connection.',
    suggestion: 'Some features may not update in real-time.',
    severity: 'warning',
    retryable: true,
  },

  SERVICE_UNAVAILABLE: {
    title: 'Service Unavailable',
    description: 'The required service is temporarily unavailable.',
    suggestion: 'Please try again in a few minutes.',
    severity: 'warning',
    retryable: true,
  },

  REQUEST_TIMEOUT: {
    title: 'Request Timeout',
    description: 'The request took too long to complete.',
    suggestion: 'Please try again.',
    severity: 'warning',
    retryable: true,
  },

  OFFLINE: {
    title: 'You Are Offline',
    description: 'No internet connection detected.',
    suggestion: 'Check your internet connection.',
    severity: 'error',
    retryable: true,
  },

  // =========================================================================
  // Wallet Errors
  // =========================================================================

  WALLET_NOT_INSTALLED: {
    title: 'Wallet Required',
    description: 'You need the Lace wallet extension to use this application.',
    suggestion: 'Install Lace from lace.io, then refresh this page.',
    severity: 'error',
    retryable: false,
    helpUrl: 'https://www.lace.io',
  },

  USER_REJECTED: {
    title: 'Request Cancelled',
    description: 'You cancelled the request.',
    suggestion: 'You can try again when ready.',
    severity: 'info',
    retryable: true,
  },

  WALLET_DISCONNECTED: {
    title: 'Wallet Disconnected',
    description: 'Your wallet is not connected.',
    suggestion: 'Connect your wallet to continue.',
    severity: 'warning',
    retryable: true,
  },

  WRONG_NETWORK: {
    title: 'Wrong Network',
    description: 'Your wallet is connected to the wrong network.',
    suggestion: 'Switch to the correct network in your wallet.',
    severity: 'error',
    retryable: false,
  },

  ACCOUNT_NOT_FOUND: {
    title: 'Account Not Found',
    description: 'The requested account was not found in your wallet.',
    suggestion: 'Switch to the correct account or import it.',
    severity: 'error',
    retryable: false,
  },

  SIGNATURE_FAILED: {
    title: 'Signing Failed',
    description: 'Failed to sign the message with your wallet.',
    suggestion: 'Please try again. Make sure your wallet is unlocked.',
    severity: 'error',
    retryable: true,
  },

  // =========================================================================
  // Unknown Error
  // =========================================================================

  UNKNOWN_ERROR: {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred.',
    suggestion: 'Please try again. If this continues, contact support.',
    severity: 'error',
    retryable: true,
    helpUrl: '/docs/support',
  },
};

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Get catalog entry for an error code
 */
export function getErrorEntry(code: ErrorCode): ErrorCatalogEntry {
  return ERROR_CATALOG[code] ?? ERROR_CATALOG.UNKNOWN_ERROR;
}

/**
 * Get user-friendly title for an error code
 */
export function getErrorTitle(code: ErrorCode): string {
  return getErrorEntry(code).title;
}

/**
 * Get user-friendly description for an error code
 */
export function getErrorDescription(code: ErrorCode): string {
  return getErrorEntry(code).description;
}

/**
 * Get suggested action for an error code
 */
export function getErrorSuggestion(code: ErrorCode): string {
  return getErrorEntry(code).suggestion;
}

/**
 * Check if error code is retryable
 */
export function isErrorRetryable(code: ErrorCode): boolean {
  return getErrorEntry(code).retryable;
}

/**
 * Get severity for an error code
 */
export function getErrorSeverity(code: ErrorCode): 'error' | 'warning' | 'info' {
  return getErrorEntry(code).severity;
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format error for display
 */
export function formatErrorForDisplay(code: ErrorCode): {
  title: string;
  message: string;
  action: string;
  severity: 'error' | 'warning' | 'info';
} {
  const entry = getErrorEntry(code);
  return {
    title: entry.title,
    message: entry.description,
    action: entry.suggestion,
    severity: entry.severity,
  };
}

/**
 * Format error for toast notification
 */
export function formatErrorForToast(code: ErrorCode): {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
} {
  const entry = getErrorEntry(code);
  return {
    title: entry.title,
    message: entry.suggestion,
    type: entry.severity,
  };
}

/**
 * Format error for logging (includes technical hints)
 */
export function formatErrorForLog(code: ErrorCode, context?: Record<string, unknown>): string {
  const entry = getErrorEntry(code);
  const parts = [
    `[${code}] ${entry.title}`,
    entry.description,
  ];

  if (entry.technicalHint) {
    parts.push(`Hint: ${entry.technicalHint}`);
  }

  if (context) {
    parts.push(`Context: ${JSON.stringify(context)}`);
  }

  return parts.join('\n');
}

// =============================================================================
// Error Groups
// =============================================================================

/**
 * Get all error codes for a category
 */
export function getErrorsByCategory(
  category: 'proof' | 'transaction' | 'network' | 'wallet'
): ErrorCode[] {
  const categoryPrefixes: Record<string, string[]> = {
    proof: ['PROOF', 'CONSTRAINT', 'WITNESS', 'GENERATION', 'VERIFICATION', 'RESOURCE'],
    transaction: ['INSUFFICIENT', 'STATE', 'NONCE', 'GAS', 'CONTRACT', 'INVALID_SIGNATURE', 'NETWORK_REJECTED', 'SUBMISSION', 'CONFIRMATION'],
    network: ['CONNECTION', 'DNS', 'WEBSOCKET', 'SERVICE', 'REQUEST', 'OFFLINE'],
    wallet: ['WALLET', 'USER_REJECTED', 'WRONG_NETWORK', 'ACCOUNT', 'SIGNATURE'],
  };

  const prefixes = categoryPrefixes[category] ?? [];
  return (Object.keys(ERROR_CATALOG) as ErrorCode[]).filter(code =>
    prefixes.some(prefix => code.startsWith(prefix))
  );
}

/**
 * Get all retryable error codes
 */
export function getRetryableErrors(): ErrorCode[] {
  return (Object.keys(ERROR_CATALOG) as ErrorCode[]).filter(code =>
    ERROR_CATALOG[code].retryable
  );
}

/**
 * Get all non-retryable error codes
 */
export function getNonRetryableErrors(): ErrorCode[] {
  return (Object.keys(ERROR_CATALOG) as ErrorCode[]).filter(code =>
    !ERROR_CATALOG[code].retryable
  );
}

// =============================================================================
// i18n Support (Placeholder)
// =============================================================================

/**
 * Get localized error catalog entry
 * This is a placeholder for i18n integration
 */
export function getLocalizedEntry(
  code: ErrorCode,
  _locale: string = 'en'
): ErrorCatalogEntry {
  // In a real implementation, this would look up translated strings
  // For now, return the English version
  return getErrorEntry(code);
}
