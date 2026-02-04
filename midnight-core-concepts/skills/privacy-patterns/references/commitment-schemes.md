# Commitment Schemes

## What is a Commitment?

A commitment scheme allows you to:
1. **Commit**: Lock in a value without revealing it
2. **Open**: Later reveal the value and prove it matches

Like a sealed envelope: contents fixed when sealed, revealed when opened.

## Properties

### Hiding

The commitment reveals nothing about the committed value.

```
Given: commitment = Commit(value, randomness)
Cannot determine: value (computationally infeasible)
```

### Binding

Cannot open a commitment to a different value than originally committed.

```
Given: commitment = Commit(v1, r1)
Cannot find: (v2, r2) where Commit(v2, r2) = commitment and v2 ≠ v1
```

## Pedersen Commitments

Midnight uses Pedersen commitments:

```
Commit(v, r) = v·G + r·H
```

Where:
- G, H are elliptic curve points (generators)
- v is the value
- r is randomness
- · is scalar multiplication

### Properties

| Property | Pedersen Provides |
|----------|-------------------|
| Hiding | Perfect (information-theoretic) |
| Binding | Computational |
| Homomorphic | Yes |

### Homomorphic Property

```
Commit(v1, r1) + Commit(v2, r2) = Commit(v1 + v2, r1 + r2)
```

This enables:
- Adding committed values without revealing them
- Verifying sums without seeing components
- Efficient balance proofs in Zswap

## Compact's persistentCommit

```compact
import { persistentCommit } from "std/compact/commitments";

// Create commitment
const commitment = persistentCommit(value, randomness);
```

### Randomness Requirements

**Fresh randomness is critical:**

```compact
// WRONG: Same randomness = correlatable
commit(vote1, fixed_r);
commit(vote2, fixed_r);
// If vote1 = vote2, commitments are equal!

// CORRECT: Fresh randomness each time
commit(vote1, random1);
commit(vote2, random2);
// Even if votes equal, commitments differ
```

### Deriving Randomness

Options for generating randomness:

```compact
// Option 1: True random (ideal but must store)
const r = generateSecureRandom();

// Option 2: Derived from secret + counter (deterministic)
const r = persistentHash(user_secret, counter);
// Increment counter for each commitment
```

## Opening a Commitment

To prove a commitment contains a specific value:

```compact
// Stored earlier
ledger.commitment = persistentCommit(secret_value, randomness);

// Later, prove knowledge
export witness openCommitment(
  revealed_value: Field,
  revealed_randomness: Bytes<32>
): Void {
  // Recompute commitment
  const recomputed = persistentCommit(revealed_value, revealed_randomness);

  // Must match stored
  assert recomputed == ledger.commitment;
}
```

## Use Cases

### Sealed-Bid Auction

```
1. Bid phase: Store Commit(bid, r)
2. Reveal phase: Open commitments
3. Winner determination: Compare revealed bids
```

No one can change bid after seeing others.

### Voting

```
1. Vote: Store Commit(choice, r) in Merkle tree
2. Tally: Prove vote without revealing choice
3. Verify: Use homomorphic property for totals
```

### Two-Phase Commits

```
1. Promise phase: Commit to action
2. Execution phase: Prove action matches commitment
```

Ensures atomicity without revealing intent early.

## Security Considerations

### Randomness Reuse

Never reuse randomness across commitments:
- Same value + same randomness = same commitment
- Enables correlation attacks
- Destroys hiding property

### Small Value Sets

For small domains (e.g., yes/no votes):
- Without randomness: Only 2 possible commitments
- Attacker can enumerate and match
- Randomness prevents this attack

### Commitment Malleability

Some schemes allow commitment manipulation:
- Pedersen is additively malleable
- Consider whether this matters for your use case
- Zswap uses this property constructively
