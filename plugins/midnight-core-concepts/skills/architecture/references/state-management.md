# State Management

## Global State Structure

```
GlobalState {
  zswap: ZswapState,
  contracts: Map<Address, ContractState>
}
```

## Zswap State

### Components

```
ZswapState {
  // Merkle tree of all coin commitments
  commitment_tree: SparseMerkleTree<Bytes<32>>,

  // Next available slot in tree
  free_slot_index: u64,

  // All spent coin nullifiers
  nullifier_set: Set<Bytes<32>>,

  // Recent valid Merkle roots
  valid_roots: CircularBuffer<Bytes<32>>
}
```

### Commitment Tree Operations

**Insert (new coin created)**:
```
1. Compute commitment = Pedersen(type, value, owner, r)
2. Insert at position free_slot_index
3. Increment free_slot_index
4. Recompute Merkle root
5. Add new root to valid_roots
```

**Verify (coin exists)**:
```
1. Receive: commitment, Merkle path, claimed root
2. Verify claimed root in valid_roots
3. Verify path leads from commitment to root
```

### Nullifier Set Operations

**Check (not spent)**:
```
1. Compute nullifier = Hash(commitment, owner_secret)
2. Check: nullifier NOT in nullifier_set
```

**Insert (mark spent)**:
```
1. Add nullifier to nullifier_set
2. Nullifier can never be added again
```

### Valid Roots Window

Maintains recent Merkle roots for:
- Users with slightly stale Merkle paths
- Concurrent transaction handling
- Practical usability

Window typically covers several blocks.

## Contract State

### Structure

```
ContractState {
  // Simple values
  fields: Map<String, Value>,

  // Merkle trees (only roots stored)
  merkle_trees: Map<String, MerkleTreeState>,

  // Sets (membership structures)
  sets: Map<String, SetState>
}
```

### Field Types

| Compact Type | State Representation |
|--------------|---------------------|
| `Field` | Single field element |
| `Boolean` | Field (0 or 1) |
| `Bytes<N>` | N bytes |
| `Address` | 32 bytes |
| `Map<K,V>` | Key-value mapping |

### Merkle Tree State

```
MerkleTreeState {
  root: Bytes<32>,
  depth: u8,
  next_index: u64
}
```

Only root stored on-chain. Users maintain full tree locally.

### Set State

```
SetState {
  // Implementation varies
  // Could be: Merkle tree, bloom filter, etc.
  membership_structure: Implementation
}
```

## State Transitions

### Atomic Updates

All state changes in a transaction are atomic:

```
Before: State_n
Transaction: Tx
After: State_n+1

Either ALL changes apply, or NONE do.
```

### Contract State Update Flow

```
1. Load current state: S_current
2. Execute Impact program with transaction inputs
3. Compute resulting effects: E_result
4. Verify E_result == E_declared (from proof)
5. Apply E_declared to S_current → S_new
6. Store S_new
```

### Zswap State Update Flow

```
For each output:
  commitment_tree.insert(output.commitment)

For each input:
  assert !nullifier_set.contains(input.nullifier)
  nullifier_set.insert(input.nullifier)
```

## State Consistency

### Cross-Component Consistency

Zswap and contract states must be consistent:
- Coins received by contracts match Zswap outputs
- Coins sent by contracts match Zswap inputs
- Values balance across both

### Proof Binding

ZK proofs bind:
- Private inputs to public effects
- Zswap operations to contract operations
- All components to transaction hash

## State Pruning

### What Can Be Pruned

| Component | Prunable? | Notes |
|-----------|-----------|-------|
| Old commitments | Yes | If no longer in valid roots window |
| Nullifiers | Never | Must persist forever |
| Contract state | Current only | Historical states not needed |
| Old valid roots | Yes | After window expires |

### What Cannot Be Pruned

- Nullifier set (prevents historical double-spend)
- Current contract states
- Recent Merkle roots

## State Queries

### User Perspective

Users need to:
1. Track their own coins (commitments they own)
2. Generate Merkle paths for spending
3. Monitor for incoming coins (encrypted outputs)

### Node Perspective

Nodes maintain:
1. Full current state (all components)
2. Ability to verify any transaction
3. State proofs for light clients
