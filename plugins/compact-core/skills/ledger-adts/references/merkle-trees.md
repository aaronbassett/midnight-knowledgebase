# Merkle Trees

Reference for MerkleTree and HistoricMerkleTree ledger ADTs.

## MerkleTree<T>

Append-only Merkle tree for efficient membership proofs.

### Declaration

```compact
ledger members: MerkleTree<Bytes<32>>;
ledger commitments: MerkleTree<Bytes<32>>;
```

### Operations

#### insert

Add a leaf to the tree.

```compact
const commitment = persistentCommit(value);
members.insert(commitment);
```

**Signature**: `insert(leaf: T): []`

#### root

Get the current Merkle root.

```compact
const current_root: Bytes<32> = members.root();
```

**Signature**: `root(): Bytes<32>`

#### pathForLeaf (TypeScript only)

Compute the Merkle path for a leaf. Available in TypeScript, not Compact.

```typescript
// In TypeScript
const path = await contract.members.pathForLeaf(leafValue);
```

### Verifying Membership

Use `merkleTreePathRoot` from the standard library:

```compact
import { merkleTreePathRoot } from "CompactStandardLibrary";

witness get_merkle_path(index: Uint<32>): Vector<Bytes<32>, 20>;

export circuit prove_membership(
    leaf: Bytes<32>,
    expected_root: Bytes<32>,
    leaf_index: Uint<32>
): Boolean {
    // Get witness-provided path
    const path = get_merkle_path(leaf_index);

    // Compute root from leaf and path
    const computed_root = merkleTreePathRoot(leaf, path);

    // Verify against expected root
    return computed_root == expected_root;
}
```

### Example: Membership Registry

```compact
ledger members: MerkleTree<Bytes<32>>;

// Registration
export circuit register(commitment: Bytes<32>): [] {
    members.insert(commitment);
}

// Membership proof
witness get_member_secret(): Bytes<32>;
witness get_proof_path(index: Uint<32>): Vector<Bytes<32>, 20>;

export circuit prove_membership(leaf_index: Uint<32>): Boolean {
    const secret = get_member_secret();
    const commitment = persistentCommit(secret);
    const path = get_proof_path(leaf_index);

    const computed_root = merkleTreePathRoot(commitment, path);
    const actual_root = members.root();

    return computed_root == actual_root;
}
```

---

## HistoricMerkleTree<T>

Merkle tree that maintains historical roots for delayed verification.

### When to Use

Use `HistoricMerkleTree` when:
- Proofs are generated against an old root
- Concurrent insertions might invalidate proofs
- You need to verify against a past state

### Declaration

```compact
ledger historic_members: HistoricMerkleTree<Bytes<32>>;
```

### Additional Operations

#### resetHistory

Clear historical roots to save storage.

```compact
historic_members.resetHistory();
```

**Signature**: `resetHistory(): []`

### Verification Against Historical Root

```compact
ledger historic_tree: HistoricMerkleTree<Bytes<32>>;

witness get_proof_path(index: Uint<32>): Vector<Bytes<32>, 20>;

export circuit verify_historical(
    leaf: Bytes<32>,
    historical_root: Bytes<32>,
    leaf_index: Uint<32>
): Boolean {
    const path = get_proof_path(leaf_index);
    const computed_root = merkleTreePathRoot(leaf, path);

    // HistoricMerkleTree validates against stored historical roots
    // The runtime verifies historical_root was a valid past root
    return computed_root == historical_root;
}
```

### Example: Delayed Verification

```compact
ledger notes: HistoricMerkleTree<Bytes<32>>;

// User creates a proof off-chain against root R1
// By the time they submit, root might be R2
// HistoricMerkleTree allows verification against R1

witness get_note_data(): NoteData;
witness get_proof_path(index: Uint<32>): Vector<Bytes<32>, 20>;

export circuit spend_note(
    note_index: Uint<32>,
    claimed_root: Bytes<32>  // The root at proof generation time
): [] {
    const note = get_note_data();
    const commitment = persistentCommit(note.secret);
    const path = get_proof_path(note_index);

    // Compute root from proof
    const computed_root = merkleTreePathRoot(commitment, path);

    // Verify against the claimed historical root
    assert computed_root == claimed_root, "Invalid proof";

    // The runtime validates claimed_root is a valid historical root
    // Process the spend...
}
```

---

## Tree Capacity

### Checking Capacity

```compact
ledger members: MerkleTree<Bytes<32>>;

// Trees have a fixed maximum capacity based on depth
// For depth 20: 2^20 = ~1 million leaves

export circuit safe_insert(leaf: Bytes<32>): Boolean {
    // Check if tree is full
    if members.isFull() {
        return false;
    }

    members.insert(leaf);
    return true;
}
```

### isFull

Check if the tree has reached capacity.

```compact
const is_full: Boolean = members.isFull();
```

**Signature**: `isFull(): Boolean`

---

## Best Practices

### Use Commitments as Leaves

```compact
// GOOD: Store commitments
const commitment = persistentCommit(secret_data);
tree.insert(commitment);

// BAD: Store raw data (reveals information)
tree.insert(raw_data);  // Avoid unless data is intentionally public
```

### Verify Root Before Action

```compact
export circuit action_requiring_membership(
    expected_root: Bytes<32>,
    leaf_index: Uint<32>
): [] {
    // First verify membership
    assert prove_membership(expected_root, leaf_index), "Not a member";

    // Then perform action
    // ...
}
```

### Handle Tree Updates

When the tree updates, old paths become invalid:

```compact
// Path computed against root R1
// Tree inserts happen, root becomes R2
// Path now invalid for R2

// Solutions:
// 1. Use HistoricMerkleTree
// 2. Recompute path after each insert
// 3. Design protocol to handle stale proofs
```

---

## Merkle Path Depth

The standard library function expects a specific path depth:

```compact
// Path depth is typically 20 (2^20 capacity)
witness get_path(): Vector<Bytes<32>, 20>;

// For different depths, adjust the Vector size
witness get_shallow_path(): Vector<Bytes<32>, 10>;  // 2^10 capacity
```

---

## Common Patterns

### Anonymous Authentication

```compact
ledger auth_tree: MerkleTree<Bytes<32>>;

export circuit anonymous_auth(
    root: Bytes<32>,
    index: Uint<32>
): Bytes<32> {
    // Prove membership without revealing identity
    const secret = get_secret();
    const commitment = persistentCommit(secret);
    const path = get_path(index);

    assert merkleTreePathRoot(commitment, path) == root;

    // Generate nullifier (prevents double-use)
    return persistentHash(secret, "nullifier");
}
```

### Batch Membership

```compact
// Verify multiple memberships efficiently
circuit verify_batch<#N>(
    leaves: Vector<Bytes<32>, #N>,
    paths: Vector<Vector<Bytes<32>, 20>, #N>,
    root: Bytes<32>
): Boolean {
    for i in 0..#N {
        const computed = merkleTreePathRoot(leaves[i], paths[i]);
        if computed != root {
            return false;
        }
    }
    return true;
}
```
