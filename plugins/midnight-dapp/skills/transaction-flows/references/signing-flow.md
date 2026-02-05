# Signing Flow

How Lace wallet signs and proves transactions in Midnight DApps.

## Overview

Unlike traditional wallets that create cryptographic signatures, Lace generates zero-knowledge proofs. This process is more complex and time-consuming but provides privacy guarantees.

## The Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                           DApp                                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. Build transaction with witnesses                              │
│ 2. Call walletAPI.balanceAndProveTransaction(tx, newCoins)      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                        Lace Wallet                               │
├─────────────────────────────────────────────────────────────────┤
│ 3. Display transaction details for user approval                 │
│ 4. User clicks Approve (or Reject)                              │
│ 5. If approved, invoke local proof server                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                      Local Proof Server                          │
│                    (Docker, port 6300)                           │
├─────────────────────────────────────────────────────────────────┤
│ 6. Receive transaction + witness data (local only)               │
│ 7. Execute circuit with private inputs                           │
│ 8. Generate ZK proof (5-30 seconds)                             │
│ 9. Return proven transaction to Lace                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                        Lace Wallet                               │
├─────────────────────────────────────────────────────────────────┤
│ 10. Attach proof to transaction                                  │
│ 11. Discard witness data (privacy preserved)                     │
│ 12. Return proven transaction to DApp                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                           DApp                                   │
├─────────────────────────────────────────────────────────────────┤
│ 13. Call walletAPI.submitTransaction(provenTx)                  │
│ 14. Transaction sent to Midnight network                         │
└─────────────────────────────────────────────────────────────────┘
```

## Key API: balanceAndProveTransaction

The primary method for proving transactions:

```typescript
const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tx` | `Transaction` | Unproven transaction from `contract.callTx.*` |
| `newCoins` | `Coin[]` | New coin commitments for balance updates |

### What It Does

1. **Balances the transaction** - Ensures inputs and outputs match
2. **Invokes proof generation** - Calls local proof server
3. **Generates ZK proof** - Proves circuit constraints are satisfied
4. **Returns proven transaction** - Ready for submission

### Return Value

Returns a proven transaction object that can be submitted with `submitTransaction()`.

## User Approval in Lace

When `balanceAndProveTransaction` is called, Lace displays a confirmation dialog:

### What Users See

```
┌─────────────────────────────────────────┐
│           Approve Transaction           │
├─────────────────────────────────────────┤
│                                         │
│  Contract: Token Transfer               │
│  Action: transfer                       │
│                                         │
│  Recipient: addr_test1qz...xyz         │
│  Amount: 100 DUST                       │
│                                         │
│  Estimated Fee: 0.5 DUST               │
│                                         │
│  ┌─────────┐     ┌──────────┐          │
│  │ Reject  │     │ Approve  │          │
│  └─────────┘     └──────────┘          │
│                                         │
└─────────────────────────────────────────┘
```

### What's Displayed

- Contract name and action being called
- Public parameters (recipient, amount)
- Estimated transaction fee
- **Not displayed**: Private witness data

### User Actions

- **Approve**: Proceeds with proof generation
- **Reject**: Throws error in DApp (catch and handle)

## Error Scenarios

### User Rejection

User clicks "Reject" in Lace:

```typescript
try {
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
} catch (error) {
  if (error.message.includes("rejected") || error.message.includes("denied")) {
    // User rejected - show message and allow retry
    showMessage("Transaction cancelled");
    return;
  }
  throw error;
}
```

### Timeout

Proof generation takes too long:

```typescript
const PROOF_TIMEOUT = 60_000; // 60 seconds

const proveWithTimeout = async (tx: Transaction): Promise<ProvenTransaction> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Proof generation timed out")), PROOF_TIMEOUT);
  });

  return Promise.race([
    walletAPI.balanceAndProveTransaction(tx, []),
    timeoutPromise,
  ]);
};
```

### Proof Server Unavailable

The local proof server is not running:

```typescript
try {
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
} catch (error) {
  if (error.message.includes("connection refused") ||
      error.message.includes("localhost:6300")) {
    showError({
      title: "Proof server not running",
      message: "Please start the proof server",
      instructions: "docker run -p 6300:6300 midnightnetwork/proof-server",
    });
    return;
  }
  throw error;
}
```

### Insufficient Balance

Not enough funds for transaction + fees:

```typescript
try {
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
} catch (error) {
  if (error.message.includes("insufficient") || error.message.includes("balance")) {
    showError({
      title: "Insufficient balance",
      message: "You don't have enough funds for this transaction",
      currentBalance: await getBalance(),
      required: amount + estimatedFee,
    });
    return;
  }
  throw error;
}
```

### Circuit Constraint Failure

The ZK circuit assertions failed:

```typescript
try {
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
} catch (error) {
  if (error.message.includes("constraint") || error.message.includes("circuit")) {
    // Don't expose circuit details - could leak information
    showError({
      title: "Transaction validation failed",
      message: "Please check your inputs and try again",
    });
    return;
  }
  throw error;
}
```

## Complete Implementation

```typescript
import type { Transaction, ProvenTransaction, WalletAPI } from "@midnight-ntwrk/dapp-connector-api";

/**
 * Error codes for proof generation
 */
export const ProofErrorCode = {
  USER_REJECTED: "USER_REJECTED",
  TIMEOUT: "TIMEOUT",
  PROOF_SERVER_UNAVAILABLE: "PROOF_SERVER_UNAVAILABLE",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  CIRCUIT_ERROR: "CIRCUIT_ERROR",
  UNKNOWN: "UNKNOWN",
} as const;

export type ProofErrorCode = typeof ProofErrorCode[keyof typeof ProofErrorCode];

/**
 * Categorize proof generation errors
 */
function categorizeProofError(error: unknown): ProofErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("rejected") || message.includes("denied")) {
    return ProofErrorCode.USER_REJECTED;
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return ProofErrorCode.TIMEOUT;
  }
  if (message.includes("connection refused") || message.includes("6300")) {
    return ProofErrorCode.PROOF_SERVER_UNAVAILABLE;
  }
  if (message.includes("insufficient") || message.includes("balance")) {
    return ProofErrorCode.INSUFFICIENT_BALANCE;
  }
  if (message.includes("constraint") || message.includes("circuit")) {
    return ProofErrorCode.CIRCUIT_ERROR;
  }

  return ProofErrorCode.UNKNOWN;
}

/**
 * Configuration for proof generation
 */
interface ProofConfig {
  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Callback for status updates */
  onStatus?: (status: string) => void;
}

/**
 * Result of proof generation
 */
interface ProofResult {
  success: boolean;
  provenTx?: ProvenTransaction;
  errorCode?: ProofErrorCode;
  error?: Error;
}

/**
 * Generate proof for a transaction with error handling
 */
export async function proveTransaction(
  walletAPI: WalletAPI,
  tx: Transaction,
  newCoins: unknown[] = [],
  config: ProofConfig = {}
): Promise<ProofResult> {
  const { timeoutMs = 60_000, onStatus } = config;

  onStatus?.("Waiting for wallet approval...");

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Proof generation timed out")),
        timeoutMs
      );
    });

    // Race proof generation against timeout
    onStatus?.("Generating proof...");
    const provenTx = await Promise.race([
      walletAPI.balanceAndProveTransaction(tx, newCoins),
      timeoutPromise,
    ]);

    onStatus?.("Proof complete");
    return { success: true, provenTx };
  } catch (error) {
    const errorCode = categorizeProofError(error);
    return {
      success: false,
      errorCode,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get user-friendly error message
 */
export function getProofErrorMessage(errorCode: ProofErrorCode): string {
  switch (errorCode) {
    case ProofErrorCode.USER_REJECTED:
      return "Transaction was cancelled";
    case ProofErrorCode.TIMEOUT:
      return "Proof generation timed out. Please try again.";
    case ProofErrorCode.PROOF_SERVER_UNAVAILABLE:
      return "Proof server is not running. Please start it and try again.";
    case ProofErrorCode.INSUFFICIENT_BALANCE:
      return "Insufficient balance for this transaction";
    case ProofErrorCode.CIRCUIT_ERROR:
      return "Transaction validation failed. Please check your inputs.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(errorCode: ProofErrorCode): boolean {
  return [
    ProofErrorCode.TIMEOUT,
    ProofErrorCode.UNKNOWN,
  ].includes(errorCode);
}
```

## Timing Expectations

| Step | Duration | Notes |
|------|----------|-------|
| User approval | Variable | Depends on user action |
| Proof generation | 5-30s | Depends on circuit complexity |
| Total | 10-60s | Plan for worst case |

## Best Practices

1. **Always show loading UI** during proof generation
2. **Implement timeout handling** - Don't let users wait forever
3. **Categorize errors** - Provide helpful messages for each error type
4. **Allow retry** for transient errors (timeout, network)
5. **Don't retry user rejection** - Respect user's decision
6. **Warn about proof server** - Check if it's running before starting
7. **Secure error messages** - Don't leak circuit details

## Security Considerations

1. **Witness data never leaves the device** - Proof server runs locally
2. **Proof server has no network access** - Cannot exfiltrate data
3. **Only the proof goes on-chain** - Private inputs remain private
4. **Error messages should be generic** - Don't reveal why a constraint failed
