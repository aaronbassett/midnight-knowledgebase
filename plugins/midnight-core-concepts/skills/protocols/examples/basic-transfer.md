# Basic Shielded Transfer

## Overview

A simple private token transfer from Alice to Bob using Zswap.

## Steps

### 1. Alice's Preparation

Alice has a coin (UTXO) she wants to send:

```
Alice's Coin:
  commitment: 0xabc...
  value: 100 NIGHT
  secret: 0x123... (only Alice knows)
```

### 2. Construct Zswap Input

Alice creates an input to spend her coin:

```
Input {
  nullifier: Hash(0xabc..., 0x123...),  // Unlinkable to commitment
  type_value_commit: Pedersen(NIGHT, 100),
  merkle_proof: [path to commitment in tree],
  zk_proof: "I know the preimage and it's in the tree"
}
```

### 3. Construct Zswap Output

Alice creates an output for Bob:

```
Output {
  commitment: Pedersen(NIGHT, 100, Bob's_key, new_randomness),
  type_value_commit: Pedersen(NIGHT, 100),
  ciphertext: Encrypt(100, new_randomness, to: Bob's_public_key),
  zk_proof: "This commitment is well-formed"
}
```

### 4. Build Offer

```
Offer {
  inputs: [Alice's input],
  outputs: [Bob's output],
  balance: { NIGHT: 0 },  // Balanced (ignoring fees)
}
```

### 5. Submit Transaction

```
Transaction {
  guaranteed_offer: Offer,
  // No contract calls needed
}
```

### 6. On-Chain Processing

1. Verify nullifier not in nullifier set
2. Verify Merkle proof against valid root
3. Verify all ZK proofs
4. Add nullifier to nullifier set
5. Add new commitment to Merkle tree

### 7. Bob Receives

Bob scans blockchain for outputs encrypted to his key:

```
1. Decrypt ciphertext with Bob's private key
2. Learn: value = 100 NIGHT, randomness
3. Compute commitment (verify it matches)
4. Store locally: commitment, value, randomness
5. Bob can now spend this coin
```

## Privacy Analysis

| Participant | What They See |
|-------------|---------------|
| Alice | Everything about her coin |
| Bob | Only his received coin |
| Observers | A transaction occurred (nullifier, new commitment) |
| Observers | NOT: sender, receiver, amount, or which coin spent |

## Code Representation

```compact
// This is abstracted in Compact as:
send { value: 100, type: NIGHT }, to: bob_address;
```

The Zswap machinery (commitments, nullifiers, proofs) happens automatically.
