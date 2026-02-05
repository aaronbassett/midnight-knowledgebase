# Cryptographic Binding

## Purpose

Cryptographic binding ensures transaction integrity:
- All components linked together
- Cannot mix components from different transactions
- Cannot modify without invalidating proofs
- Atomic execution guaranteed

## Binding Mechanisms

### 1. Pedersen Commitments

Used for value binding in Zswap.

**Structure**:
```
Commit(v) = v·G + r·H
```

**Properties**:
- **Hiding**: Cannot determine v from commitment
- **Binding**: Cannot find different v' with same commitment
- **Homomorphic**: Commit(a) + Commit(b) = Commit(a+b)

**Usage in Midnight**:
```
Coin commitment = Pedersen(type, value, owner, randomness)
Balance verification via homomorphic sum
```

### 2. Schnorr Proofs

Used to prove contract sections don't inject hidden value.

**What it proves**:
"The contract contribution to this transaction has zero net value."

**Why needed**:
Without this, contracts could create value from nothing by hiding it in their section.

**Structure**:
```
SchnorrProof {
  commitment: Point,    // What we're proving about
  challenge: Scalar,    // Fiat-Shamir challenge
  response: Scalar      // Proof response
}
```

### 3. ZK Proof Binding

Each ZK proof commits to:
- Public inputs (transaction data)
- Statement being proven
- Transaction hash

**Prevents**:
- Proof reuse across transactions
- Proof substitution
- Public input manipulation

## Transaction Binding

### Hash Construction

```
TxHash = Hash(
  Hash(guaranteed_offer),
  Hash(fallible_offer),
  Hash(contract_calls),
  binding_randomness
)
```

### What Each Component Binds

| Component | Binds To |
|-----------|----------|
| Input proofs | Specific nullifier, Merkle root, TxHash |
| Output proofs | Specific commitment, TxHash |
| Contract proofs | Specific transcript, TxHash |
| Schnorr proofs | Contract value vector, TxHash |

## Balance Verification

### Homomorphic Balance Check

```
For each token type t:
  ∑(input_value_commits[t]) =
    ∑(output_value_commits[t]) + Commit(fees[t])
```

**How it works**:
1. Each input has type/value commitment
2. Each output has type/value commitment
3. Sum all inputs, sum all outputs
4. Difference must equal fee commitment
5. No actual values revealed

### Multi-Asset Balancing

```
balance_vector = {
  NIGHT: sum(inputs) - sum(outputs),
  TOKEN_A: sum(inputs) - sum(outputs),
  ...
}

For valid transaction:
  ∀ type: balance_vector[type] == fees[type] (or 0)
```

## Proof Composition

### How Proofs Link Together

```
┌─────────────────────────────────────────────┐
│              Transaction                     │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │            TxHash                    │   │
│  │                │                     │   │
│  │    ┌──────────┼──────────┐          │   │
│  │    ↓          ↓          ↓          │   │
│  │ Input     Output    Contract        │   │
│  │ Proofs    Proofs    Proofs          │   │
│  │    │          │          │          │   │
│  │    └──────────┴──────────┘          │   │
│  │              │                       │   │
│  │              ↓                       │   │
│  │       Schnorr Proof                  │   │
│  │    (balance verification)            │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Verification Order

1. Verify each ZK proof independently
2. Verify Schnorr proofs
3. Verify all proofs reference same TxHash
4. Verify homomorphic balance
5. Transaction is valid

## Security Properties

### Unforgeability

Cannot create valid transaction without:
- Knowledge of spent coin secrets
- Valid Merkle paths
- Correct balance

### Non-Malleability

Cannot modify transaction:
- Changing any component invalidates TxHash
- Proofs bound to specific TxHash
- Modified transaction = invalid proofs

### Atomicity

All-or-nothing execution:
- All components cryptographically linked
- Cannot execute partial transaction
- Either everything verifies, or nothing does

## Attack Prevention

### Mix-and-Match Attack

**Attack**: Take input proof from Tx1, output from Tx2.
**Prevention**: Both proofs commit to different TxHashes.

### Value Injection Attack

**Attack**: Create value in contract section.
**Prevention**: Schnorr proof ensures zero net contract value.

### Proof Reuse Attack

**Attack**: Reuse old proof in new transaction.
**Prevention**: Proofs bound to specific TxHash including fresh randomness.

### Double-Spend Attack

**Attack**: Spend same coin twice.
**Prevention**: Nullifier uniqueness + set membership check.
