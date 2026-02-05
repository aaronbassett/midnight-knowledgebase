# UTXO Mechanics Deep Dive

## UTXO Lifecycle

### 1. Creation

A UTXO is created when:
- A transaction output specifies a new coin
- The coin has: value, type, owner commitment, randomness

```
UTXO = Commitment(value, type, owner, randomness)
```

The commitment is added to the global Merkle tree of coin commitments.

### 2. Existence

While unspent, a UTXO:
- Has a position in the Merkle tree
- Can be proven to exist via Merkle path
- Remains spendable by the owner

### 3. Consumption

To spend a UTXO:
1. Prove knowledge of the commitment preimage
2. Prove the commitment exists in the Merkle tree
3. Generate a nullifier
4. Include nullifier in transaction

The entire UTXO is consumed—partial spends are impossible. Change is returned as a new UTXO.

### 4. Prevention of Reuse

The nullifier prevents double-spending:

```
nullifier = Hash(commitment, owner_secret)
```

Properties:
- Deterministic: Same inputs always produce same nullifier
- Unlinkable: Nullifier reveals nothing about which UTXO was spent
- One-way: Cannot derive commitment from nullifier

## Nullifier Computation

### Formula

```
nullifier = Hash(UTXO_commitment, owner_secret)
```

### Privacy Properties

| Observer sees | Observer learns |
|--------------|-----------------|
| Nullifier | A coin was spent |
| Nullifier | Cannot link to commitment |
| Multiple nullifiers | Cannot determine if same owner |

### Why Not Mark Spent?

Bitcoin marks UTXOs as spent directly. Midnight uses nullifiers because:
- Marking requires revealing which UTXO
- Nullifiers hide the connection
- Enables private transactions

## Merkle Tree Structure

### Commitment Tree

```
        Root
       /    \
     H01    H23
    /  \   /   \
  C0   C1 C2   C3  ← Commitments
```

Each leaf is a coin commitment. The root is published on-chain.

### Proving Membership

To prove a coin exists:
1. Provide the commitment
2. Provide sibling hashes (Merkle path)
3. Verifier recomputes root
4. Root must match known valid root

### Historic Roots

Midnight maintains a set of valid past roots because:
- Tree changes with each transaction
- Users may have paths computed against old roots
- Accepting historic roots improves UX

## Shielded vs Unshielded

### Shielded UTXOs

- Commitment hides all details
- Value, type, owner all private
- Default for privacy

### Unshielded UTXOs

- Value may be visible
- Useful for regulatory compliance
- Selective disclosure via viewing keys

### Choosing Privacy Level

```compact
// Shielded (default)
send shielded_amount, to: recipient;

// With viewing key for selective disclosure
// Recipient can share viewing key with regulators
```

## Parallel Processing

UTXOs enable natural parallelism:

```
UTXO A → Tx1
UTXO B → Tx2  ← Can process simultaneously
UTXO C → Tx3
```

No ordering dependency unless:
- Same UTXO spent (impossible—would need same nullifier)
- Contract state conflicts (handled separately)

## Comparison with Bitcoin UTXOs

| Aspect | Bitcoin | Midnight |
|--------|---------|----------|
| Spent marker | Direct reference | Nullifier |
| Privacy | Pseudonymous | Private |
| Merkle tree | Transactions | Commitments |
| Pruning | Can prune spent | Keeps nullifier set |
