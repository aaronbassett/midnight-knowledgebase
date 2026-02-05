# Confirmation Patterns

Strategies for tracking transaction status and handling finality in Midnight DApps.

## Overview

After submitting a transaction, you receive a transaction hash. The transaction is now "pending" and must be:

1. Included in a block
2. Propagated through the network
3. Confirmed by subsequent blocks (finality)

Your DApp needs to track this process and update the UI accordingly.

## Finality in Midnight

Midnight uses a consensus mechanism that provides eventual finality. Understanding this helps design appropriate UX:

| Stage | State | User Impact |
|-------|-------|-------------|
| Submitted | In mempool | May still be dropped |
| Included | In block | Likely to succeed |
| Confirmed | Multiple blocks | Safe to consider final |
| Final | Deep confirmations | Irreversible |

## Polling for Status

The most common pattern is polling the indexer for transaction status.

### Basic Polling

```typescript
async function pollTransactionStatus(
  txHash: string,
  pollIntervalMs = 3000,
  maxAttempts = 100
): Promise<"confirmed" | "failed"> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getTransactionStatus(txHash);

    if (status === "confirmed") {
      return "confirmed";
    }

    if (status === "failed") {
      return "failed";
    }

    // Still pending - wait and retry
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Confirmation timeout - transaction status unknown");
}
```

### Adaptive Polling

Adjust polling interval based on time elapsed:

```typescript
async function adaptivePoll(
  txHash: string,
  maxWaitMs = 300_000 // 5 minutes
): Promise<"confirmed" | "failed"> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getTransactionStatus(txHash);

    if (status === "confirmed" || status === "failed") {
      return status;
    }

    // Poll more frequently at first, then back off
    const elapsed = Date.now() - startTime;
    const interval = elapsed < 30_000 ? 2000 : // First 30s: every 2s
                     elapsed < 60_000 ? 5000 : // 30s-60s: every 5s
                     10_000;                   // After 60s: every 10s

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error("Confirmation timeout");
}
```

### React Hook for Polling

```typescript
import { useState, useEffect, useCallback } from "react";

type TxStatus = "pending" | "confirmed" | "failed" | "unknown";

interface UseTxStatusOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

interface UseTxStatusReturn {
  status: TxStatus;
  confirmations: number;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useTxStatus(
  txHash: string | null,
  options: UseTxStatusOptions = {}
): UseTxStatusReturn {
  const { pollIntervalMs = 3000, maxWaitMs = 300_000 } = options;

  const [status, setStatus] = useState<TxStatus>("unknown");
  const [confirmations, setConfirmations] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const checkStatus = useCallback(async () => {
    if (!txHash) return;

    try {
      const result = await getTransactionStatus(txHash);
      setStatus(result.status);
      setConfirmations(result.confirmations ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [txHash]);

  useEffect(() => {
    if (!txHash) {
      setStatus("unknown");
      return;
    }

    setIsLoading(true);
    setStatus("pending");

    const startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      await checkStatus();

      // Stop polling if confirmed, failed, or timeout
      if (status === "confirmed" || status === "failed") {
        setIsLoading(false);
        return;
      }

      if (Date.now() - startTime > maxWaitMs) {
        setIsLoading(false);
        setError(new Error("Confirmation timeout"));
        return;
      }

      timeoutId = setTimeout(poll, pollIntervalMs);
    };

    poll();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [txHash, pollIntervalMs, maxWaitMs, checkStatus, status]);

  return {
    status,
    confirmations,
    isLoading,
    error,
    refresh: checkStatus,
  };
}
```

## Optimistic UI Updates

Update the UI immediately, then verify with the actual transaction result.

### Pattern

```typescript
async function transferWithOptimisticUpdate(
  recipient: Uint8Array,
  amount: bigint,
  contract: Contract,
  walletAPI: WalletAPI
) {
  // Store current state for rollback
  const previousBalance = currentBalance;

  try {
    // Optimistic update
    setBalance((prev) => prev - amount);
    setStatus("pending");

    // Execute transaction
    const tx = await contract.callTx.transfer(recipient, amount, witnesses);
    const provenTx = await walletAPI.balanceAndProveTransaction(tx, []);
    const txHash = await walletAPI.submitTransaction(provenTx);

    // Wait for confirmation (background)
    waitForConfirmation(txHash)
      .then(() => {
        setStatus("confirmed");
        // Refresh actual balance from chain
        refreshBalance();
      })
      .catch(() => {
        // Transaction failed - rollback
        setBalance(previousBalance);
        setStatus("failed");
      });

    return txHash;
  } catch (error) {
    // Immediate failure - rollback
    setBalance(previousBalance);
    setStatus("failed");
    throw error;
  }
}
```

### When to Use Optimistic Updates

| Scenario | Use Optimistic? | Reason |
|----------|-----------------|--------|
| Token transfer | Yes | Likely to succeed |
| Balance display | Yes | Improves UX |
| Critical actions | No | User must see confirmed state |
| Multi-step flows | Maybe | Depends on risk |
| Irreversible actions | No | Can't rollback real-world effects |

### Optimistic Update Hook

```typescript
import { useState, useCallback } from "react";

interface OptimisticState<T> {
  confirmed: T;
  optimistic: T;
}

interface UseOptimisticReturn<T> {
  value: T;
  setValue: (newValue: T) => void;
  confirmOptimistic: () => void;
  rollback: () => void;
  isPending: boolean;
}

export function useOptimistic<T>(initialValue: T): UseOptimisticReturn<T> {
  const [state, setState] = useState<OptimisticState<T>>({
    confirmed: initialValue,
    optimistic: initialValue,
  });
  const [isPending, setIsPending] = useState(false);

  const setValue = useCallback((newValue: T) => {
    setState((prev) => ({ ...prev, optimistic: newValue }));
    setIsPending(true);
  }, []);

  const confirmOptimistic = useCallback(() => {
    setState((prev) => ({ ...prev, confirmed: prev.optimistic }));
    setIsPending(false);
  }, []);

  const rollback = useCallback(() => {
    setState((prev) => ({ ...prev, optimistic: prev.confirmed }));
    setIsPending(false);
  }, []);

  return {
    value: state.optimistic,
    setValue,
    confirmOptimistic,
    rollback,
    isPending,
  };
}
```

## Handling Failures After Submission

Transactions can fail even after successful submission:

### Failure Scenarios

| Scenario | Cause | Detection | Recovery |
|----------|-------|-----------|----------|
| Dropped from mempool | Low fee, congestion | Status never updates | Retry with higher fee |
| Invalid proof | Stale proof, race condition | "Failed" status | Rebuild and re-prove |
| Contract error | On-chain validation failed | "Failed" status | Check inputs, retry |
| Network partition | Node disconnected | Timeout | Retry on different node |

### Failure Recovery Pattern

```typescript
interface TxRecoveryState {
  txHash: string;
  status: "pending" | "confirmed" | "failed" | "timeout";
  retryCount: number;
  lastAttempt: number;
}

async function recoverableSubmit(
  buildTx: () => Promise<Transaction>,
  walletAPI: WalletAPI,
  maxRetries = 3
): Promise<{ txHash: string; status: "confirmed" | "failed" }> {
  let state: TxRecoveryState = {
    txHash: "",
    status: "pending",
    retryCount: 0,
    lastAttempt: Date.now(),
  };

  while (state.retryCount < maxRetries) {
    try {
      // Build and submit
      const tx = await buildTx();
      const provenTx = await walletAPI.balanceAndProveTransaction(tx, []);
      state.txHash = await walletAPI.submitTransaction(provenTx);
      state.lastAttempt = Date.now();

      // Wait for confirmation
      const finalStatus = await pollTransactionStatus(state.txHash);

      if (finalStatus === "confirmed") {
        return { txHash: state.txHash, status: "confirmed" };
      }

      // Failed - will retry
      state.status = "failed";
      state.retryCount++;

      // Exponential backoff
      await new Promise((r) =>
        setTimeout(r, 1000 * Math.pow(2, state.retryCount))
      );
    } catch (error) {
      state.retryCount++;

      // User rejection - don't retry
      if ((error as Error).message.includes("rejected")) {
        throw error;
      }

      // Timeout or other error - retry
      state.status = "timeout";

      if (state.retryCount < maxRetries) {
        await new Promise((r) =>
          setTimeout(r, 1000 * Math.pow(2, state.retryCount))
        );
      }
    }
  }

  return { txHash: state.txHash, status: "failed" };
}
```

## UI Update Strategies

### Strategy 1: Block Until Confirmed

Simple but poor UX for longer waits.

```typescript
function SimpleTransferButton({ onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleTransfer = async () => {
    setIsLoading(true);
    try {
      const txHash = await submitTransfer();
      await waitForConfirmation(txHash);
      onSuccess();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button onClick={handleTransfer} disabled={isLoading}>
      {isLoading ? "Processing..." : "Transfer"}
    </button>
  );
}
```

### Strategy 2: Pending State with Background Confirmation

Better UX - show pending state and let user continue.

```tsx
function TransferWithPendingState({ onSuccess }) {
  const [status, setStatus] = useState<"idle" | "proving" | "pending" | "confirmed">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleTransfer = async () => {
    setStatus("proving");

    const hash = await submitTransfer();
    setTxHash(hash);
    setStatus("pending");

    // Background confirmation
    waitForConfirmation(hash).then(() => {
      setStatus("confirmed");
      onSuccess();
    });
  };

  return (
    <div>
      {status === "idle" && (
        <button onClick={handleTransfer}>Transfer</button>
      )}
      {status === "proving" && (
        <div>Generating proof... This may take 15-30 seconds</div>
      )}
      {status === "pending" && (
        <div>
          <p>Transaction submitted!</p>
          <p>Hash: {txHash}</p>
          <p>Waiting for confirmation...</p>
          <a href={`/explorer/tx/${txHash}`}>View in explorer</a>
        </div>
      )}
      {status === "confirmed" && (
        <div>Transaction confirmed!</div>
      )}
    </div>
  );
}
```

### Strategy 3: Toast Notifications

Non-blocking notifications for transaction status.

```tsx
import { useToast } from "./useToast";

function useTransactionToasts() {
  const { toast, dismiss } = useToast();

  const trackTransaction = async (txHash: string) => {
    const toastId = toast({
      title: "Transaction Submitted",
      description: `Hash: ${txHash.slice(0, 16)}...`,
      status: "info",
      duration: null, // Persist until confirmed
    });

    try {
      await waitForConfirmation(txHash);
      dismiss(toastId);
      toast({
        title: "Transaction Confirmed",
        status: "success",
        duration: 5000,
      });
    } catch (error) {
      dismiss(toastId);
      toast({
        title: "Transaction Failed",
        description: (error as Error).message,
        status: "error",
        duration: null,
      });
    }
  };

  return { trackTransaction };
}
```

## Confirmation Display Components

### Transaction Status Badge

```tsx
type TxStatus = "pending" | "confirmed" | "failed";

const STATUS_STYLES: Record<TxStatus, { bg: string; text: string }> = {
  pending: { bg: "#fef3c7", text: "#92400e" },
  confirmed: { bg: "#d1fae5", text: "#065f46" },
  failed: { bg: "#fee2e2", text: "#991b1b" },
};

function TxStatusBadge({ status }: { status: TxStatus }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.text,
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 500,
      }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
```

### Confirmation Progress

```tsx
interface ConfirmationProgressProps {
  confirmations: number;
  requiredConfirmations: number;
}

function ConfirmationProgress({
  confirmations,
  requiredConfirmations,
}: ConfirmationProgressProps) {
  const percentage = Math.min(
    (confirmations / requiredConfirmations) * 100,
    100
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Confirmations</span>
        <span>
          {confirmations} / {requiredConfirmations}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "4px",
          backgroundColor: "#e5e7eb",
          borderRadius: "2px",
          marginTop: "4px",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            backgroundColor: percentage === 100 ? "#10b981" : "#6366f1",
            borderRadius: "2px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
```

## Best Practices

1. **Always show transaction hash** - Users can verify in explorer
2. **Don't block the UI** - Let users continue while waiting
3. **Provide explorer links** - Let users verify externally
4. **Handle timeout gracefully** - Transaction may still succeed
5. **Store pending transactions** - Survive page refreshes
6. **Show confirmation count** - Users understand progress
7. **Allow manual refresh** - Let users check status on demand

## Anti-Patterns

### Don't: Ignore Pending Transactions

```typescript
// BAD - No tracking after submission
const txHash = await submitTransaction(tx);
showSuccess("Transaction sent!"); // User doesn't know if it succeeded
```

### Don't: Block Indefinitely

```typescript
// BAD - User stuck if confirmation takes long
await waitForConfirmation(txHash); // Could wait forever
showSuccess("Complete!");
```

### Do: Implement Proper Tracking

```typescript
// GOOD - Track with timeout and UI feedback
const txHash = await submitTransaction(tx);
showPending(txHash);

waitForConfirmation(txHash, { timeoutMs: 300_000 })
  .then(() => showSuccess("Confirmed!"))
  .catch(() => showWarning("Confirmation pending - check explorer"));
```
