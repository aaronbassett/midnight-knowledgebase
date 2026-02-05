# Web3 Comparison: Transaction Flows

Comparing Ethereum transaction patterns with Midnight transaction patterns for developers transitioning from Web3.

## Overview

If you've built DApps with Ethereum, you're familiar with the sign-and-send pattern. Midnight's prove-and-submit pattern is conceptually similar but has significant differences in timing, privacy, and user experience.

## Transaction Lifecycle Comparison

### Ethereum

```
Build → Sign → Submit → Confirm
 ^        ^       ^        ^
 |        |       |        |
~instant  ~1s    ~1s    15s-5min
```

### Midnight

```
Build → Prove → Submit → Confirm
 ^        ^        ^        ^
 |        |        |        |
~instant  5-30s   ~1s    1-5min
```

**Key Difference**: The "Prove" phase in Midnight takes 5-30 seconds, compared to Ethereum's near-instant signing.

## Gas Estimation vs Transaction Fees

### Ethereum: Gas Estimation

```typescript
// Ethereum - estimate gas before sending
const gasEstimate = await contract.estimateGas.transfer(to, amount);
const gasPrice = await provider.getGasPrice();
const maxFee = gasEstimate * gasPrice;

const tx = await contract.transfer(to, amount, {
  gasLimit: gasEstimate * 1.1n, // Add 10% buffer
  maxFeePerGas: gasPrice,
});
```

**Characteristics:**
- Gas estimation is fast (~100ms)
- Fee is paid in ETH
- Can fail if estimation is wrong
- EIP-1559 introduced dynamic fees

### Midnight: Transaction Fees

```typescript
// Midnight - fees handled by wallet
const tx = await contract.callTx.transfer(to, amount, witnesses);
const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
const txHash = await walletAPI.submitTransaction(provenTx);
```

**Characteristics:**
- Fee estimation happens in `balanceAndProveTransaction`
- Wallet handles fee calculation
- Fees paid in DUST (native token)
- No gas limit concept

### Migration Notes

| Ethereum | Midnight | Notes |
|----------|----------|-------|
| `estimateGas()` | Built into wallet | No separate estimation step |
| `gasLimit` option | Not applicable | Wallet handles automatically |
| `maxFeePerGas` | Wallet-determined | User sees total fee in approval |
| Reverted with gas spent | Proof invalid = no submission | Failures happen earlier |

## Signing vs Proof Generation

### Ethereum: Instant Signing

```typescript
// Ethereum - signing is nearly instant
const tx = {
  to: recipient,
  value: ethers.parseEther("1.0"),
  data: contractData,
};

// This pops up MetaMask and completes in ~1 second
const signedTx = await signer.sendTransaction(tx);
```

**User Experience:**
1. Click "Send"
2. MetaMask popup appears
3. User clicks "Confirm"
4. Transaction submitted (total: 2-5 seconds)

### Midnight: Proof Generation

```typescript
// Midnight - proof generation takes time
const tx = await contract.callTx.transfer(recipient, amount, witnesses);

// This takes 5-30 seconds after user approves
const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
const txHash = await walletAPI.submitTransaction(provenTx);
```

**User Experience:**
1. Click "Send"
2. Lace popup appears
3. User clicks "Approve"
4. Loading state for 5-30 seconds (proof generation)
5. Transaction submitted (total: 15-45 seconds)

### UX Implications

```tsx
// Ethereum - simple button, no loading during signing
function EthereumSendButton({ onClick }) {
  return <button onClick={onClick}>Send</button>;
}

// Midnight - must show extended loading state
function MidnightSendButton({ onClick }) {
  const [status, setStatus] = useState<"idle" | "proving" | "submitting">("idle");

  const handleClick = async () => {
    setStatus("proving");
    try {
      await onClick();
      setStatus("submitting");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <button onClick={handleClick} disabled={status !== "idle"}>
      {status === "idle" && "Send"}
      {status === "proving" && "Generating Proof (15-30s)..."}
      {status === "submitting" && "Submitting..."}
    </button>
  );
}
```

## Block Confirmations

### Ethereum: Configurable Confirmations

```typescript
// Ethereum - wait for specific number of confirmations
const tx = await contract.transfer(to, amount);
await tx.wait(6); // Wait for 6 confirmations (~1.5 minutes)
```

**Confirmation Times (PoS):**
- 1 confirmation: ~12 seconds
- 6 confirmations: ~72 seconds
- Finalized: ~15 minutes (justified epoch)

### Midnight: Finality Model

```typescript
// Midnight - poll for confirmation status
const txHash = await walletAPI.submitTransaction(provenTx);

// Poll for status
async function waitForConfirmation(txHash: string): Promise<void> {
  while (true) {
    const status = await checkTransactionStatus(txHash);
    if (status === "confirmed") return;
    if (status === "failed") throw new Error("Transaction failed");
    await new Promise((r) => setTimeout(r, 3000));
  }
}
```

**Confirmation Times:**
- Included in block: Variable
- Finality: Consensus-dependent

### Comparison Table

| Aspect | Ethereum | Midnight |
|--------|----------|----------|
| Confirmation method | `tx.wait(n)` | Polling indexer |
| Events | `provider.on("block", ...)` | WebSocket subscriptions |
| Finality | ~15 min (justified) | Protocol-dependent |
| Reorg risk | Possible before finality | Similar |

## Transaction Replacement

### Ethereum: Speed Up / Cancel

```typescript
// Ethereum - replace pending transaction
const pendingTx = await contract.transfer(to, amount);

// Speed up with higher gas
const speedUpTx = await signer.sendTransaction({
  ...pendingTx,
  nonce: pendingTx.nonce,
  maxFeePerGas: pendingTx.maxFeePerGas * 1.1n, // 10% higher
});

// Cancel with empty transaction
const cancelTx = await signer.sendTransaction({
  to: signer.address,
  nonce: pendingTx.nonce,
  maxFeePerGas: pendingTx.maxFeePerGas * 1.1n,
  value: 0,
});
```

### Midnight: No Direct Replacement

Midnight doesn't support transaction replacement in the same way:

```typescript
// Midnight - if proof is invalid or transaction stuck
// You must create a new transaction

// Cannot speed up or cancel a pending transaction
// If needed, wait for it to timeout/fail, then retry
const tx = await contract.callTx.transfer(to, amount, witnesses);
const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
const txHash = await walletAPI.submitTransaction(provenTx);

// If transaction is pending too long, no way to cancel
// Must wait for timeout or failure
```

### Migration Strategy

| Ethereum Pattern | Midnight Approach |
|------------------|-------------------|
| Speed up transaction | Not supported - wait for result |
| Cancel transaction | Not supported - wait for failure |
| Nonce management | Handled by wallet/protocol |
| Stuck transaction | Wait for timeout, retry |

## Error Handling Comparison

### Ethereum: Error Types

```typescript
// Ethereum error handling
try {
  const tx = await contract.transfer(to, amount);
  await tx.wait();
} catch (error) {
  if (error.code === "ACTION_REJECTED") {
    // User rejected in wallet
  } else if (error.code === "INSUFFICIENT_FUNDS") {
    // Not enough ETH for gas
  } else if (error.code === "CALL_EXCEPTION") {
    // Contract reverted
    const reason = error.reason; // Revert reason if available
  } else if (error.code === "NETWORK_ERROR") {
    // Network issue
  }
}
```

### Midnight: Error Types

```typescript
// Midnight error handling
try {
  const tx = await contract.callTx.transfer(to, amount, witnesses);
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
  await walletAPI.submitTransaction(provenTx);
} catch (error) {
  const message = (error as Error).message.toLowerCase();

  if (message.includes("rejected") || message.includes("denied")) {
    // User rejected in Lace
  } else if (message.includes("insufficient") || message.includes("balance")) {
    // Not enough funds
  } else if (message.includes("constraint") || message.includes("circuit")) {
    // Proof generation failed (circuit assertion)
  } else if (message.includes("timeout")) {
    // Proof generation timeout
  } else if (message.includes("connection refused")) {
    // Proof server not running
  }
}
```

### Error Mapping

| Ethereum Error | Midnight Equivalent |
|----------------|---------------------|
| `ACTION_REJECTED` | Message includes "rejected" |
| `INSUFFICIENT_FUNDS` | Message includes "insufficient" |
| `CALL_EXCEPTION` | Circuit constraint failure |
| `NETWORK_ERROR` | Connection errors |
| `TIMEOUT` | Proof generation timeout |
| N/A | Proof server unavailable |

## Complete Migration Example

### Before (Ethereum/ethers.js)

```typescript
import { ethers } from "ethers";

async function transferToken(to: string, amount: bigint) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);

  // Estimate gas
  const gasEstimate = await contract.estimateGas.transfer(to, amount);

  // Send transaction
  const tx = await contract.transfer(to, amount, {
    gasLimit: gasEstimate * 11n / 10n,
  });

  // Wait for confirmation
  const receipt = await tx.wait(1);

  return receipt.hash;
}
```

### After (Midnight)

```typescript
import type { WitnessContext } from "@midnight-ntwrk/midnight-js-types";

interface PrivateState {
  balance: bigint;
}

async function transferToken(
  contract: TokenContract,
  walletAPI: WalletAPI,
  to: Uint8Array,
  amount: bigint,
  setStatus: (status: string) => void
): Promise<string> {
  // Define witnesses for private data
  const witnesses = {
    get_balance: ({ privateState }: WitnessContext<PrivateState>): bigint => {
      return privateState.balance;
    },
  };

  // Build transaction
  setStatus("Building transaction...");
  const tx = await contract.callTx.transfer(to, amount, witnesses);

  // Prove transaction (this is the slow part)
  setStatus("Generating proof (15-30 seconds)...");
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, []);

  // Submit transaction
  setStatus("Submitting...");
  const txHash = await walletAPI.submitTransaction(provenTx);

  // Wait for confirmation (optional)
  setStatus("Waiting for confirmation...");
  await waitForConfirmation(txHash);

  return txHash;
}
```

## Migration Checklist

- [ ] Replace `gasLimit` with automatic fee handling
- [ ] Remove `estimateGas` calls
- [ ] Add loading states for proof generation (5-30s)
- [ ] Replace `tx.wait()` with polling
- [ ] Update error handling for Midnight errors
- [ ] Remove transaction replacement logic
- [ ] Add proof server availability checks
- [ ] Update UI to explain proof generation to users

## Key Takeaways

1. **Proof generation is slow** - Plan for 5-30 second delays
2. **No gas management** - Wallet handles fees
3. **No transaction replacement** - Must wait for result
4. **Different error types** - Check message content
5. **Privacy implications** - Private data stays local
6. **Confirmation polling** - No built-in `wait()` method
