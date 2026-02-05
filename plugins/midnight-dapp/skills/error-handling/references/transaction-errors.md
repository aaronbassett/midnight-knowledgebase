# Transaction Errors

Complete guide to handling contract execution and transaction errors in Midnight DApps.

## Overview

Transaction errors occur when submitting transactions to the Midnight network. Unlike proof errors (which happen locally), transaction errors involve network interaction and on-chain validation.

## The ContractError Class

```typescript
class ContractError extends Error {
  constructor(
    message: string,
    public readonly code: ContractErrorCode,
    public readonly txHash?: string,
    public readonly cause?: Error,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ContractError';
  }
}

type ContractErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'STATE_CONFLICT'
  | 'NONCE_MISMATCH'
  | 'GAS_EXHAUSTED'
  | 'CONTRACT_REVERTED'
  | 'INVALID_SIGNATURE'
  | 'NETWORK_REJECTED'
  | 'SUBMISSION_FAILED'
  | 'CONFIRMATION_TIMEOUT';
```

## Common Transaction Error Types

### Insufficient Balance

The most common transaction error - the account lacks funds for the transaction.

**Causes:**
- Transfer amount exceeds available balance
- Insufficient gas/fee tokens
- Balance changed between proof generation and submission (race condition)

**Example Error:**
```
ContractError: Insufficient balance for transfer
Required: 1000 tokens, Available: 500 tokens
```

**Detection:**
```typescript
function isInsufficientBalanceError(error: unknown): boolean {
  if (error instanceof ContractError) {
    return error.code === 'INSUFFICIENT_BALANCE';
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('insufficient') ||
         message.includes('balance') ||
         message.includes('not enough');
}
```

**Recovery:**
```typescript
interface BalanceCheckResult {
  sufficient: boolean;
  available: bigint;
  required: bigint;
  shortfall: bigint;
}

async function checkBalanceForTransfer(
  contract: Contract,
  address: Uint8Array,
  amount: bigint,
  estimatedFee: bigint = 0n
): Promise<BalanceCheckResult> {
  const balance = await contract.state.balances.get(address) ?? 0n;
  const required = amount + estimatedFee;

  return {
    sufficient: balance >= required,
    available: balance,
    required,
    shortfall: required > balance ? required - balance : 0n,
  };
}

// Usage
const check = await checkBalanceForTransfer(contract, userAddress, transferAmount);
if (!check.sufficient) {
  showError({
    title: 'Insufficient Balance',
    message: `You need ${formatAmount(check.shortfall)} more tokens`,
    suggestion: 'Add funds to your wallet and try again',
  });
}
```

### State Conflicts

State conflicts occur when the on-chain state changed between reading and writing.

**Causes:**
- Another transaction modified the state before this one was processed
- Optimistic locking failure
- Race condition between concurrent transactions

**Example Error:**
```
ContractError: State conflict detected
Expected state: 0x1234..., Current state: 0x5678...
```

**Detection:**
```typescript
function isStateConflictError(error: unknown): boolean {
  if (error instanceof ContractError) {
    return error.code === 'STATE_CONFLICT' || error.code === 'NONCE_MISMATCH';
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('conflict') ||
         message.includes('nonce') ||
         message.includes('stale') ||
         message.includes('outdated');
}
```

**Recovery:**
```typescript
async function retryWithFreshState<T>(
  operation: () => Promise<T>,
  refreshState: () => Promise<void>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isStateConflictError(error)) {
        throw error; // Non-recoverable error
      }

      if (attempt < maxRetries) {
        // Refresh state and retry
        await refreshState();
        console.log(`State conflict, retrying (${attempt}/${maxRetries})`);
      }
    }
  }

  throw new ContractError(
    'Transaction failed due to state conflicts after multiple retries',
    'STATE_CONFLICT',
    undefined,
    lastError instanceof Error ? lastError : undefined
  );
}

// Usage
const result = await retryWithFreshState(
  () => contract.callTx.transfer(recipient, amount, witnesses),
  async () => {
    // Re-fetch state before retry
    await syncContractState(contract);
  }
);
```

### Network Rejections

The network may reject transactions for various policy reasons.

**Causes:**
- Transaction too large
- Invalid proof (should not happen with proper client-side generation)
- Network congestion or spam protection
- Contract paused or disabled

**Example Error:**
```
ContractError: Transaction rejected by network
Reason: Transaction size exceeds limit
```

**Detection:**
```typescript
function isNetworkRejectionError(error: unknown): boolean {
  if (error instanceof ContractError) {
    return error.code === 'NETWORK_REJECTED';
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('rejected') ||
         message.includes('denied') ||
         message.includes('policy');
}
```

**Recovery:**
- For size limits: Reduce transaction complexity or split into multiple transactions
- For congestion: Wait and retry with exponential backoff
- For contract issues: Check contract state and notify user

### Gas/Fee Exhaustion

Transactions require fees that may exceed estimates.

**Causes:**
- Complex computation exceeding gas limit
- Network fee spikes
- Incorrect fee estimation

**Example Error:**
```
ContractError: Gas exhausted during execution
Used: 1000000, Limit: 500000
```

**Recovery:**
```typescript
async function submitWithDynamicFee(
  tx: Transaction,
  wallet: WalletAPI,
  options?: { maxFeeMultiplier?: number }
): Promise<string> {
  const { maxFeeMultiplier = 2 } = options ?? {};

  try {
    const estimatedFee = await estimateTransactionFee(tx);
    const maxFee = estimatedFee * BigInt(Math.ceil(maxFeeMultiplier));

    // Prove with higher fee allowance
    const provenTx = await wallet.balanceAndProveTransaction(tx, {
      maxFee,
    });

    return await wallet.submitTransaction(provenTx);
  } catch (error) {
    if (isGasExhaustedError(error)) {
      throw new ContractError(
        'Transaction requires more resources than available',
        'GAS_EXHAUSTED',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
    throw error;
  }
}
```

### Submission Failures

General failures when submitting to the network.

**Causes:**
- Network connectivity issues
- Indexer unavailable
- Temporary node failures

**Example Error:**
```
ContractError: Failed to submit transaction
Reason: Network timeout
```

**Recovery:**
```typescript
async function submitWithRetry(
  provenTx: ProvenTransaction,
  wallet: WalletAPI,
  options?: { maxRetries?: number; delayMs?: number }
): Promise<string> {
  const { maxRetries = 3, delayMs = 2000 } = options ?? {};

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const txHash = await wallet.submitTransaction(provenTx);
      return txHash;
    } catch (error) {
      lastError = error;

      // Don't retry non-network errors
      if (!isNetworkError(error)) {
        throw error;
      }

      if (attempt < maxRetries) {
        await sleep(delayMs * attempt);
        console.log(`Submission failed, retrying (${attempt}/${maxRetries})`);
      }
    }
  }

  throw new ContractError(
    'Failed to submit transaction after multiple attempts',
    'SUBMISSION_FAILED',
    undefined,
    lastError instanceof Error ? lastError : undefined
  );
}
```

### Confirmation Timeout

Transaction submitted but confirmation not received in time.

**Causes:**
- Network congestion
- Block production delays
- WebSocket disconnection missing confirmation

**Example Error:**
```
ContractError: Transaction confirmation timeout
TxHash: 0xabc123...
```

**Recovery:**
```typescript
interface ConfirmationOptions {
  timeoutMs: number;
  pollIntervalMs: number;
  onPending?: (status: TransactionStatus) => void;
}

async function waitForConfirmation(
  txHash: string,
  indexer: IndexerClient,
  options: ConfirmationOptions
): Promise<TransactionReceipt> {
  const { timeoutMs, pollIntervalMs, onPending } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await indexer.getTransactionStatus(txHash);

    if (status.confirmed) {
      return status.receipt;
    }

    if (status.failed) {
      throw new ContractError(
        `Transaction failed: ${status.failureReason}`,
        'CONTRACT_REVERTED',
        txHash
      );
    }

    onPending?.(status);
    await sleep(pollIntervalMs);
  }

  // Don't throw - transaction may still confirm
  // Return pending status and let caller decide
  throw new ContractError(
    'Transaction confirmation timed out - it may still be processed',
    'CONFIRMATION_TIMEOUT',
    txHash
  );
}
```

## Recovery Strategies by Error Type

| Error Code | Retryable | Strategy |
|------------|-----------|----------|
| `INSUFFICIENT_BALANCE` | No | Show balance, suggest funding |
| `STATE_CONFLICT` | Yes | Refresh state and retry |
| `NONCE_MISMATCH` | Yes | Sync nonce and retry |
| `GAS_EXHAUSTED` | Maybe | Increase fee limit or simplify tx |
| `CONTRACT_REVERTED` | No | Show revert reason, guide user |
| `INVALID_SIGNATURE` | No | Re-authenticate user |
| `NETWORK_REJECTED` | Maybe | Wait and retry, or adjust tx |
| `SUBMISSION_FAILED` | Yes | Retry with backoff |
| `CONFIRMATION_TIMEOUT` | - | Poll for status, don't retry send |

## Comprehensive Error Handler

```typescript
interface TransactionErrorHandler {
  canRecover: (error: ContractError) => boolean;
  getRecoveryAction: (error: ContractError) => RecoveryAction;
  formatForUser: (error: ContractError) => UserFacingError;
}

type RecoveryAction =
  | { type: 'RETRY'; delay: number }
  | { type: 'REFRESH_STATE' }
  | { type: 'USER_ACTION'; action: string }
  | { type: 'ABORT'; reason: string };

const transactionErrorHandler: TransactionErrorHandler = {
  canRecover(error: ContractError): boolean {
    return [
      'STATE_CONFLICT',
      'NONCE_MISMATCH',
      'SUBMISSION_FAILED',
    ].includes(error.code);
  },

  getRecoveryAction(error: ContractError): RecoveryAction {
    switch (error.code) {
      case 'STATE_CONFLICT':
      case 'NONCE_MISMATCH':
        return { type: 'REFRESH_STATE' };

      case 'SUBMISSION_FAILED':
        return { type: 'RETRY', delay: 2000 };

      case 'INSUFFICIENT_BALANCE':
        return { type: 'USER_ACTION', action: 'Add funds to your wallet' };

      case 'GAS_EXHAUSTED':
        return { type: 'USER_ACTION', action: 'Try a simpler transaction' };

      default:
        return { type: 'ABORT', reason: error.message };
    }
  },

  formatForUser(error: ContractError): UserFacingError {
    return TRANSACTION_ERROR_MESSAGES[error.code] ?? {
      title: 'Transaction Failed',
      description: error.message,
      suggestion: 'Please try again later',
    };
  },
};
```

## User-Facing Error Messages

```typescript
const TRANSACTION_ERROR_MESSAGES: Record<ContractErrorCode, {
  title: string;
  description: string;
  suggestion: string;
}> = {
  INSUFFICIENT_BALANCE: {
    title: 'Insufficient Balance',
    description: 'You do not have enough tokens to complete this transaction.',
    suggestion: 'Add funds to your wallet and try again.',
  },
  STATE_CONFLICT: {
    title: 'Transaction Conflict',
    description: 'The contract state changed while processing your transaction.',
    suggestion: 'Please review and try again.',
  },
  NONCE_MISMATCH: {
    title: 'Transaction Out of Order',
    description: 'Your transaction sequence is out of sync.',
    suggestion: 'Please wait a moment and try again.',
  },
  GAS_EXHAUSTED: {
    title: 'Transaction Too Complex',
    description: 'The transaction requires more resources than available.',
    suggestion: 'Try a simpler transaction or wait for lower network usage.',
  },
  CONTRACT_REVERTED: {
    title: 'Contract Rejected',
    description: 'The contract rejected this transaction.',
    suggestion: 'Check your inputs and try again.',
  },
  INVALID_SIGNATURE: {
    title: 'Authentication Failed',
    description: 'Your wallet signature could not be verified.',
    suggestion: 'Reconnect your wallet and try again.',
  },
  NETWORK_REJECTED: {
    title: 'Network Rejected',
    description: 'The network rejected your transaction.',
    suggestion: 'Wait a few minutes and try again.',
  },
  SUBMISSION_FAILED: {
    title: 'Submission Failed',
    description: 'Failed to submit transaction to the network.',
    suggestion: 'Check your internet connection and try again.',
  },
  CONFIRMATION_TIMEOUT: {
    title: 'Confirmation Pending',
    description: 'Your transaction was submitted but confirmation is taking longer than expected.',
    suggestion: 'Your transaction may still be processed. Check your transaction history.',
  },
};
```

## Best Practices

1. **Check before submit** - Validate balance and state before proof generation
2. **Handle all error codes** - Every code needs a user message and recovery path
3. **Distinguish retriable errors** - Auto-retry network issues, prompt for user action otherwise
4. **Track transaction status** - Don't assume timeout means failure
5. **Show transaction hash** - Let users verify status in explorer
6. **Provide context** - Include relevant amounts, addresses in error messages
7. **Log for debugging** - Capture full error details (sanitized) for troubleshooting
