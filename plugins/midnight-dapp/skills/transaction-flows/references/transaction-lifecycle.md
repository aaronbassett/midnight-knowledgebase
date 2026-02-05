# Transaction Lifecycle

Complete guide to the Midnight transaction lifecycle, from building to finality.

## Overview

Every Midnight transaction progresses through four phases:

```
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌─────────┐
│  Build  │ -> │  Prove  │ -> │  Submit  │ -> │ Confirm │
└─────────┘    └─────────┘    └──────────┘    └─────────┘
   ~instant     5-30 seconds     ~instant      ~minutes
```

Understanding each phase is critical for building responsive DApps.

## Phase 1: Build

Create the transaction using `contract.callTx.*` methods with witness data.

### What Happens

1. TypeScript code calls a circuit method on your contract
2. Witness functions are invoked to gather private data
3. A transaction object is constructed with public parameters
4. No network calls yet - this is purely local

### Code Pattern

```typescript
import type { WitnessContext } from "@midnight-ntwrk/midnight-js-types";

interface PrivateState {
  balance: bigint;
  secretKey: Uint8Array;
}

// Define witnesses to provide private data
const witnesses = {
  get_balance: ({ privateState }: WitnessContext<PrivateState>): bigint => {
    return privateState.balance;
  },
  get_secret_key: ({ privateState }: WitnessContext<PrivateState>): Uint8Array => {
    return privateState.secretKey;
  },
};

// Build the transaction
const tx = await contract.callTx.transfer(
  recipient,  // Public parameter
  amount,     // Public parameter
  witnesses   // Witness functions for private data
);
```

### Duration

Typically instant (<100ms), unless witnesses perform async operations like API calls.

### Possible Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `WitnessError` | Private data not found | Check private state initialization |
| `TypeError` | Wrong parameter types | Verify type mapping (bigint, Uint8Array) |
| Network error in witness | Async witness failed | Retry or check external service |

### UX Considerations

- Can show "Preparing transaction..." briefly
- Usually fast enough that no loading indicator is needed
- Validate inputs before building to catch errors early

## Phase 2: Prove

The wallet invokes the local proof server to generate a ZK proof.

### What Happens

1. Transaction + witnesses sent to Lace wallet
2. Lace invokes the local proof server (Docker, port 6300)
3. Proof server executes the circuit with witness data
4. ZK proof is generated and attached to transaction
5. Witness data is discarded (never leaves local machine)

### Code Pattern

```typescript
// This is the slow step - show loading UI
setStatus("Generating proof...");

// Prove the transaction
const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
// newCoins: Array of new coin commitments (for token transfers)
```

### Duration

**5-30 seconds** depending on circuit complexity. This is the primary UX challenge.

### Possible Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Timeout | Proof server busy/slow | Retry with longer timeout |
| Connection refused | Proof server not running | Show "Start proof server" instructions |
| Constraint violation | Circuit assertion failed | Check inputs, validate before build |
| User rejected | User declined in Lace | Show message, allow retry |
| Insufficient balance | Not enough funds for fees | Show balance requirement |

### UX Considerations

- **Always show loading state** - Users must know something is happening
- Show estimated time ("This may take 15-30 seconds")
- Provide cancel option
- Show progress if available
- Explain what's happening ("Generating zero-knowledge proof...")

### Privacy Guarantee

The proof server runs locally and never opens network connections. Witness data (private inputs) never leave the user's device. Only the cryptographic proof goes on-chain.

## Phase 3: Submit

Send the proven transaction to the Midnight network.

### What Happens

1. Proven transaction sent to the network via wallet
2. Transaction enters the mempool
3. Transaction hash returned immediately
4. Transaction awaits inclusion in a block

### Code Pattern

```typescript
setStatus("Submitting to network...");

const txHash = await walletAPI.submitTransaction(provenTx);
// txHash is a string identifier for the transaction

console.log("Submitted:", txHash);
```

### Duration

Typically instant (<1s) for the submission call. This returns once the transaction is in the mempool, not when it's confirmed.

### Possible Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Network error | Indexer unavailable | Retry, check connection |
| Rejected | Proof invalid or stale | Rebuild and re-prove |
| Duplicate | Same transaction submitted | Check if already submitted |
| Rate limited | Too many submissions | Implement backoff |

### UX Considerations

- Update status to show submission success
- Store txHash for tracking
- Transition to "pending" state
- Don't show "complete" yet - transaction is not confirmed

## Phase 4: Confirm

Wait for the transaction to be included in a block and reach finality.

### What Happens

1. Transaction included in a block
2. Block propagates through the network
3. Additional blocks build on top (confirmations)
4. Transaction reaches finality

### Code Pattern

```typescript
// Poll for confirmation
async function waitForConfirmation(
  txHash: string,
  pollInterval = 3000,
  maxAttempts = 100
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkTransactionStatus(txHash);

    if (status === "confirmed") {
      return true;
    }

    if (status === "failed") {
      throw new Error("Transaction failed");
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("Confirmation timeout");
}
```

### Duration

Varies based on network conditions - typically 1-5 minutes for full finality.

### Confirmation Strategies

**1. Simple Polling**

```typescript
const checkStatus = setInterval(async () => {
  const status = await getTransactionStatus(txHash);
  if (status === "confirmed") {
    clearInterval(checkStatus);
    setConfirmed(true);
  }
}, 3000);
```

**2. WebSocket Subscription** (when available)

```typescript
// Subscribe to transaction events
const unsubscribe = subscribeToTransaction(txHash, (event) => {
  if (event.type === "confirmed") {
    setConfirmed(true);
    unsubscribe();
  }
});
```

**3. Optimistic Updates**

```typescript
// Update UI immediately, verify later
setBalance(prev => prev - amount);

// Confirm in background
waitForConfirmation(txHash).catch(() => {
  // Revert if failed
  setBalance(prev => prev + amount);
  showError("Transaction failed");
});
```

### UX Considerations

- Show "Pending" state with transaction hash
- Allow viewing transaction in explorer
- Show confirmation progress ("1 of 6 confirmations")
- Allow user to continue using app (background confirmation)
- Notify on completion (if user navigated away)

## State Transitions

Complete state machine for transaction lifecycle:

```
                    ┌──────────┐
                    │   idle   │
                    └────┬─────┘
                         │ start
                         v
                    ┌──────────┐
                    │ building │
                    └────┬─────┘
                         │ built
                         v
                    ┌──────────┐
          ┌─────────│ proving  │─────────┐
          │ timeout └────┬─────┘ error   │
          │              │ proved        │
          v              v               v
     ┌─────────┐   ┌───────────┐   ┌─────────┐
     │ timeout │   │ submitting│   │  error  │
     └────┬────┘   └─────┬─────┘   └────┬────┘
          │              │ submitted    │
          │              v              │
          │        ┌─────────┐          │
          │        │ pending │          │
          │        └────┬────┘          │
          │   confirmed │ failed        │
          │        ┌────┴────┐          │
          │        v         v          │
          │   ┌─────────┐ ┌──────┐      │
          │   │confirmed│ │failed│      │
          │   └─────────┘ └──────┘      │
          │                             │
          └───────────> retry <─────────┘
```

## Implementation

```typescript
type TxStatus =
  | "idle"
  | "building"
  | "proving"
  | "submitting"
  | "pending"
  | "confirmed"
  | "failed"
  | "timeout";

interface TxState {
  status: TxStatus;
  txHash: string | null;
  error: Error | null;
  startTime: number | null;
  confirmations: number;
}

function createInitialState(): TxState {
  return {
    status: "idle",
    txHash: null,
    error: null,
    startTime: null,
    confirmations: 0,
  };
}

async function executeTransaction(
  buildTx: () => Promise<Transaction>,
  walletAPI: WalletAPI,
  onStateChange: (state: TxState) => void
): Promise<string> {
  let state = createInitialState();
  const updateState = (updates: Partial<TxState>) => {
    state = { ...state, ...updates };
    onStateChange(state);
  };

  try {
    // Build
    updateState({ status: "building", startTime: Date.now() });
    const tx = await buildTx();

    // Prove
    updateState({ status: "proving" });
    const provenTx = await walletAPI.balanceAndProveTransaction(tx, []);

    // Submit
    updateState({ status: "submitting" });
    const txHash = await walletAPI.submitTransaction(provenTx);

    // Pending
    updateState({ status: "pending", txHash });

    return txHash;
  } catch (error) {
    const isTimeout = (error as Error).message.includes("timeout");
    updateState({
      status: isTimeout ? "timeout" : "failed",
      error: error as Error,
    });
    throw error;
  }
}
```

## Timing Summary

| Phase | Typical Duration | Max Duration | User Impact |
|-------|------------------|--------------|-------------|
| Build | <100ms | 1-2s (async witnesses) | Minimal - can skip loading |
| Prove | 5-15s | 30-60s | High - requires loading UI |
| Submit | <1s | 5s | Low - quick transition |
| Confirm | 1-5 min | Variable | Low - background process |

## Best Practices

1. **Show loading during prove phase** - This is where users wait
2. **Store txHash** - Allow users to track pending transactions
3. **Handle timeouts gracefully** - Allow retry on timeout
4. **Don't block on confirmation** - Let users continue using app
5. **Validate inputs early** - Catch errors before build phase
6. **Implement retry logic** - Network issues are common
7. **Clear status on success** - Reset state after confirmation
