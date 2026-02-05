# Web3 Comparison: Ethereum Signing vs Midnight Proofs

Comparison guide for developers transitioning from Ethereum transaction signing to Midnight zero-knowledge proofs.

## Overview

| Aspect | Ethereum | Midnight |
|--------|----------|----------|
| Authentication | ECDSA Signature | ZK Proof |
| Speed | Instant (<100ms) | Seconds (2-30s) |
| Data visibility | All on-chain | Selective disclosure |
| Private state | None | Local private state |
| User action | "Sign" | "Generate proof" |

## Transaction Signing Comparison

### Ethereum: Instant Signature

```typescript
// Ethereum: Sign and send in one step
async function transferEth(to: string, amount: bigint) {
  const tx = await signer.sendTransaction({
    to,
    value: amount
  });

  // Returns almost instantly
  return tx.hash;
}
```

What happens:
1. Create transaction object (~1ms)
2. Sign with private key (~10ms)
3. Send to network (~100ms)
4. **Total: <200ms**

### Midnight: Proof Generation

```typescript
// Midnight: Build, prove, then submit
async function transferMidnight(to: string, amount: bigint) {
  // Build transaction with witnesses
  const tx = await contract.callTx.transfer(to, amount, witnesses);

  // Generate ZK proof (this takes time)
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);

  // Submit proven transaction
  const txHash = await walletAPI.submitTransaction(provenTx);

  return txHash;
}
```

What happens:
1. Execute witnesses (~10ms)
2. Evaluate circuit (~100ms)
3. Generate ZK proof (~5-20s)
4. Submit to network (~200ms)
5. **Total: 5-25 seconds**

## User Experience Differences

### MetaMask Flow

```
User clicks "Send"
    → MetaMask popup appears
    → User clicks "Confirm"
    → Transaction sent immediately
    → Done (2-3 seconds total)
```

### Lace/Midnight Flow

```
User clicks "Send"
    → Show disclosure consent (if any)
    → User reviews and confirms
    → Show "Generating proof..." (5-20 seconds)
    → Wallet popup for final confirmation
    → Transaction submitted
    → Done (10-30 seconds total)
```

### UI Adaptation Required

**Ethereum Pattern (don't use):**
```typescript
// Bad for Midnight: No feedback during proof generation
<button onClick={handleTransfer}>
  Send
</button>
```

**Midnight Pattern (use this):**
```typescript
function TransferButton() {
  const [status, setStatus] = useState<Status>("idle");

  const handleTransfer = async () => {
    setStatus("preparing");

    // Show disclosure consent if needed
    if (hasDisclosures) {
      const confirmed = await showDisclosureModal();
      if (!confirmed) {
        setStatus("idle");
        return;
      }
    }

    setStatus("generating"); // Shows progress UI

    try {
      const tx = await contract.callTx.transfer(to, amount, witnesses);
      setStatus("proving");

      const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
      setStatus("submitting");

      await walletAPI.submitTransaction(provenTx);
      setStatus("complete");
    } catch (error) {
      setStatus("error");
    }
  };

  return (
    <>
      <button onClick={handleTransfer} disabled={status !== "idle"}>
        {status === "idle" && "Send"}
        {status === "generating" && "Generating Proof..."}
        {status === "proving" && "Creating ZK Proof..."}
        {status === "submitting" && "Submitting..."}
      </button>

      {status === "generating" && <ProgressSpinner />}
    </>
  );
}
```

## Transaction Data Visibility

### Ethereum: Everything Public

```typescript
// This Ethereum transaction reveals:
// - Sender address
// - Recipient address
// - Amount transferred
// - Token contract address
// - Gas used
// - Timestamp

const tx = await token.transfer(recipient, amount);
// All parameters are visible on Etherscan
```

Anyone can see:
- Who sent
- Who received
- How much
- When

### Midnight: Selective Disclosure

```compact
// This Midnight circuit reveals:
// - Only what you explicitly disclose()

export circuit private_transfer(
    recipient_hash: Bytes<32>,
    amount_commitment: Bytes<32>
) {
    witness get_recipient(): Bytes<32>;
    witness get_amount(): Uint<64>;

    // Verify without revealing
    assert hash(get_recipient()) == recipient_hash;
    assert commit(get_amount()) == amount_commitment;

    // Transfer happens but details are hidden
    transfer(get_recipient(), get_amount());
}
```

On-chain visibility:
- Proof is valid (yes/no)
- Commitments (meaningless without keys)
- Transaction occurred (yes)

NOT visible:
- Sender identity
- Recipient identity
- Amount
- Any witness data

## Time Expectations

### Ethereum User Expectations

| Action | Expected Time |
|--------|---------------|
| Sign message | Instant |
| Send transaction | 1-2 seconds |
| Confirmation | 12-15 seconds (1 block) |
| Finality | ~2 minutes (6 blocks) |

### Midnight User Expectations

| Action | Expected Time |
|--------|---------------|
| Build transaction | <1 second |
| Generate proof | **5-30 seconds** |
| Submit transaction | 1-2 seconds |
| Confirmation | ~20 seconds |
| Finality | ~2 minutes |

### Setting User Expectations

```typescript
// Inform users about timing differences
function ProofGenerationInfo() {
  return (
    <div className="info-banner">
      <h4>Why does this take longer than other wallets?</h4>
      <p>
        Midnight creates a mathematical proof that verifies your transaction
        without revealing your private data. This computation takes a few
        seconds but ensures your privacy.
      </p>
      <p>
        Traditional wallets like MetaMask just sign data, which is faster
        but reveals all transaction details publicly.
      </p>
    </div>
  );
}
```

## Privacy Guarantees Comparison

### Ethereum Privacy Model

```
┌─────────────────────────────────────────┐
│           Ethereum Transaction          │
├─────────────────────────────────────────┤
│ From: 0x742d...    ← Public             │
│ To: 0x1234...      ← Public             │
│ Value: 1.5 ETH     ← Public             │
│ Data: 0xa9059...   ← Public (function)  │
│ Nonce: 42          ← Public             │
│ Gas: 21000         ← Public             │
└─────────────────────────────────────────┘

Privacy tools needed:
- Tornado Cash (mixer) - now sanctioned
- New addresses for each transaction
- Off-chain transactions
```

### Midnight Privacy Model

```
┌─────────────────────────────────────────┐
│           Midnight Transaction          │
├─────────────────────────────────────────┤
│ Proof: valid       ← Public (boolean)   │
│ Commitments: ...   ← Public (encrypted) │
│ Disclosed: [none]  ← Public if chosen   │
├─────────────────────────────────────────┤
│ HIDDEN:                                 │
│ - Actual sender                         │
│ - Actual recipient                      │
│ - Actual amounts                        │
│ - Business logic inputs                 │
└─────────────────────────────────────────┘

Privacy is default:
- No mixers needed
- Same address can be reused
- On-chain privacy built-in
```

## Error Handling Differences

### Ethereum Errors

```typescript
try {
  await contract.transfer(recipient, amount);
} catch (error) {
  if (error.code === 4001) {
    // User rejected in MetaMask
  } else if (error.code === -32000) {
    // Execution reverted
  } else if (error.code === -32603) {
    // Internal error
  }
}
```

### Midnight Errors

```typescript
try {
  const tx = await contract.callTx.transfer(recipient, amount, witnesses);
  const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
  await walletAPI.submitTransaction(provenTx);
} catch (error) {
  if (error.message.includes("rejected")) {
    // User rejected in Lace
  } else if (error instanceof WitnessError) {
    // Witness function failed
    // - Missing private data
    // - Validation failed
    // - External API error
  } else if (error.message.includes("timeout")) {
    // Proof generation timed out
    // - Retry with backoff
  } else if (error.message.includes("constraint")) {
    // Circuit constraint failed
    // - Invalid inputs
    // - Business logic violation
  } else if (error.message.includes("proof server")) {
    // Proof server unavailable
    // - Docker not running
    // - Wrong port
  }
}
```

## Mental Model Shift

### Ethereum Mental Model

> "I sign a message to authorize a state change. Everyone can see the change."

```
Private Key → Signature → Public Transaction → State Change
```

### Midnight Mental Model

> "I prove I know something that allows a state change. Only the proof is public."

```
Private Data → Witness → Proof → State Change
     ↓                      ↓
 (stays local)        (goes on-chain)
```

## Migration Checklist

### Code Changes

- [ ] Replace instant signing with proof generation + loading states
- [ ] Add disclosure consent flows before transactions
- [ ] Implement retry logic for proof timeouts
- [ ] Update error handling for witness/proof errors
- [ ] Add progress indicators for proof generation

### UX Changes

- [ ] Set user expectations about timing (5-30 seconds vs instant)
- [ ] Explain privacy benefits to justify wait time
- [ ] Show clear progress during proof generation
- [ ] Provide disclosure transparency before transactions
- [ ] Handle proof failures gracefully with retry options

### Architecture Changes

- [ ] Implement private state management (new concept)
- [ ] Design witness functions for your business logic
- [ ] Plan disclosure strategy (what MUST be public)
- [ ] Set up local proof server for development
- [ ] Configure proof generation timeouts and retries
