# Merkle Tree Usage

## Merkle Trees in Midnight

Merkle trees enable proving set membership without revealing which element.

## Basic Structure

```
        Root (H0123)
       /           \
    H01             H23
   /   \           /   \
  H0    H1       H2    H3
  |     |        |     |
 L0    L1       L2    L3   ← Leaves (data)
```

Each node = Hash(left_child || right_child)

## Membership Proofs

To prove L1 is in the tree:

```
Provide: L1, H0, H23
Verify:
  1. Compute H1 = Hash(L1)
  2. Compute H01 = Hash(H0, H1)
  3. Compute Root = Hash(H01, H23)
  4. Check: Computed Root == Known Root
```

Proof size: O(log n) hashes for n leaves.

## Compact Merkle Tree Types

### MerkleTree<n, T>

Standard Merkle tree with depth n and leaf type T.

```compact
ledger {
  members: MerkleTree<32, Bytes<32>>;
}

export circuit addMember(value: Bytes<32>): Void {
  ledger.members.insert(value);
}

export witness proveMember(
  value: Bytes<32>,
  path: MerkleTreePath<32, Bytes<32>>
): Void {
  assert ledger.members.member(value, path);
}
```

### HistoricMerkleTree<n, T>

Accepts proofs against previous tree states.

```compact
ledger {
  members: HistoricMerkleTree<32, Bytes<32>>;
}

export witness proveMemberHistoric(
  value: Bytes<32>,
  path: MerkleTreePath<32, Bytes<32>>,
  historic_root: Bytes<32>
): Void {
  // Can use path computed before recent insertions
  assert ledger.members.historicMember(value, path, historic_root);
}
```

**Use when**: Tree changes frequently, users need time to generate proofs.

## Privacy Properties

### What's Hidden

- Which leaf the prover knows
- Position in tree
- Other leaves' values

### What's Revealed

- Tree root (public)
- That some valid leaf exists
- Proof validity

## Common Patterns

### Authorization Set

```compact
ledger {
  authorized_keys: MerkleTree<32, Bytes<32>>;
}

// Add authorized user
export circuit authorize(public_key: Bytes<32>): Void {
  ledger.authorized_keys.insert(public_key);
}

// Prove authorization without revealing which key
export witness doAuthorizedAction(
  private_key: Bytes<32>,
  path: MerkleTreePath<32, Bytes<32>>
): Void {
  const public_key = persistentHash(private_key);
  assert ledger.authorized_keys.member(public_key, path);
  // Perform authorized action...
}
```

### Commitment Set (for Nullifier Pattern)

```compact
ledger {
  commitments: MerkleTree<32, Bytes<32>>;
  nullifiers: Set<Bytes<32>>;
}

// Deposit: add commitment
export circuit deposit(commitment: Bytes<32>): Void {
  ledger.commitments.insert(commitment);
}

// Withdraw: prove commitment exists, reveal nullifier
export witness withdraw(
  amount: Field,
  secret: Bytes<32>,
  path: MerkleTreePath<32, Bytes<32>>
): Void {
  // Reconstruct commitment
  const commitment = persistentCommit(amount, secret);

  // Prove it's in the tree
  assert ledger.commitments.member(commitment, path);

  // Compute and check nullifier
  const nullifier = persistentHash(commitment, secret);
  assert !ledger.nullifiers.member(nullifier);
  ledger.nullifiers.insert(nullifier);
}
```

## Path Generation

### User Responsibility

Users must:
1. Track which leaves they own
2. Compute Merkle paths locally
3. Keep paths updated as tree changes (or use HistoricMerkleTree)

### Path Structure

```
MerkleTreePath<depth, LeafType> = {
  siblings: [Hash; depth],
  directions: [bool; depth]  // left or right at each level
}
```

## Performance Considerations

### Tree Depth

| Depth | Max Leaves | Proof Size |
|-------|------------|------------|
| 16 | 65,536 | 16 hashes |
| 24 | 16.7M | 24 hashes |
| 32 | 4.3B | 32 hashes |

### Proof Generation

Done off-chain by user. Requires:
- Knowledge of leaf value
- Access to sibling hashes
- Current (or historic) root

### Proof Verification

Done on-chain. Cost:
- O(depth) hash computations
- Constant in number of leaves
