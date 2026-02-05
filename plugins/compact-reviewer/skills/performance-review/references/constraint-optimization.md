# Constraint Optimization Techniques

Strategies for reducing circuit constraints in Compact contracts.

## Optimization Principles

### 1. Move Computation Off-Chain

**Principle**: Witness functions are free (zero constraints).

```compact
// ❌ On-chain computation: ~3,000 constraints
export circuit compute_hash(): Bytes<32> {
    const a = hash(data1);
    const b = hash(data2);
    return hash(a, b);
}

// ✅ Off-chain computation: ~1,000 constraints
witness compute_combined_hash(): Bytes<32>;  // Free
witness get_intermediate_a(): Bytes<32>;     // Free
witness get_intermediate_b(): Bytes<32>;     // Free

export circuit compute_hash(): Bytes<32> {
    const result = compute_combined_hash();
    const a = get_intermediate_a();
    const b = get_intermediate_b();
    // Only verify, don't compute
    assert a == hash(data1);   // ~1,000
    assert b == hash(data2);   // ~1,000
    assert result == hash(a, b);  // ~1,000
    return result;
    // Total: ~3,000 (same, but enables parallelization)
}

// ✅ Better: Just verify final result
export circuit compute_hash(): Bytes<32> {
    const result = compute_combined_hash();
    const a = hash(data1);
    const b = hash(data2);
    assert result == hash(a, b);  // One verification
    return result;
}
```

### 2. Choose Cheaper Primitives

| Expensive | Cheap Alternative | Savings |
|-----------|-------------------|---------|
| SHA256 | Pedersen/persistentHash | 25x |
| Multiple hashes | Single hash with domain | Linear |
| `<` comparison | `==` check | 254x |
| Deep Merkle | Shallower Merkle | 1,000/level |

```compact
// ❌ SHA256: ~25,000 constraints
const auth = sha256(secret);

// ✅ Pedersen: ~1,000 constraints
const auth = persistentHash("auth", secret);
```

### 3. Minimize Comparisons

```compact
// ❌ Multiple range checks: 3 × 254 = 762 constraints
assert x >= min;
assert x <= max;
assert x != forbidden;

// ✅ Single equality when possible: ~3 constraints
assert x == expected;
```

### 4. Optimize Loops

```compact
// ❌ Hash inside loop: 100 × 1,000 = 100,000 constraints
for i in 0..100 {
    running_hash = hash(running_hash, items[i]);
}

// ✅ Batch hash: 1 × 1,000 = 1,000 constraints
// (if items can be concatenated)
const all_items = concat_items();  // Witness function
const batch_hash = hash(all_items);
```

### 5. Use Appropriate Types

```compact
// ❌ Uint<256> comparison: 256 bit checks
const big: Uint<256>;
if big > threshold { }

// ✅ Uint<64> comparison: 64 bit checks
const small: Uint<64>;
if small > threshold { }
```

---

## Optimization Patterns

### Pattern: Batch Verification

Verify multiple items with single proof.

```compact
// ❌ Individual proofs: N × proof_cost
for i in 0..N {
    verify_item(items[i]);
}

// ✅ Batch proof: ~1 × aggregate_proof_cost
const aggregate = aggregate_items();  // Off-chain
verify_aggregate(aggregate);          // Single verification
```

### Pattern: Lazy Evaluation

Only compute what's necessary.

```compact
// ❌ Always compute both: 2,000 constraints
const result_a = expensive_computation_a();
const result_b = expensive_computation_b();
if condition {
    return result_a;
} else {
    return result_b;
}

// ⚠️ Note: In ZK, both branches are always evaluated
// But witness computation can be conditional:

witness compute_selected_result(cond: Boolean): Field;

export circuit process(condition: Boolean): Field {
    const result = compute_selected_result(condition);  // Free
    // Verify only the relevant computation
    if disclose(condition) {
        assert result == expensive_computation_a();
    } else {
        assert result == expensive_computation_b();
    }
    return result;
}
```

### Pattern: Merkle Tree Right-Sizing

Use minimum necessary depth.

| Items | Min Depth | Constraints |
|-------|-----------|-------------|
| 1-2 | 1 | 1,000 |
| 3-4 | 2 | 2,000 |
| 5-8 | 3 | 3,000 |
| 9-16 | 4 | 4,000 |
| 1M+ | 20 | 20,000 |

```compact
// ❌ Over-provisioned: depth 32 for 1000 items
MerkleTree<32>  // 32,000 constraints per proof

// ✅ Right-sized: depth 10 for 1000 items
MerkleTree<10>  // 10,000 constraints per proof
```

### Pattern: Commitment-Reveal Separation

Split expensive verification across transactions.

```compact
// Phase 1: Cheap commitment
export circuit commit(hidden_data: Bytes<32>): Bytes<32> {
    return persistentCommit(nonce, hidden_data);  // ~1,000
}

// Phase 2: Expensive verification (separate tx)
export circuit reveal_and_verify(
    data: ComplexData,
    commitment: Bytes<32>
): [] {
    // Heavy verification only when needed
    verify_complex_properties(data);  // Many constraints
    assert persistentCommit(nonce, hash(data)) == commitment;
}
```

---

## Cost Estimation Examples

### Example 1: Token Transfer

```compact
export circuit transfer(
    to: Bytes<32>,
    amount: Uint<64>,
    signature: Signature
): [] {
    const from = get_sender_address();           // Free (witness)
    assert verify_signature(from, signature);     // ~5,000 (EC ops)
    const balance = balances[from].read();       // ~254 (lookup)
    assert balance >= amount;                    // ~64 (Uint<64> comparison)
    balances[from].decrement(amount);            // ~1 (arithmetic)
    balances[to].increment(amount);              // ~1 (arithmetic)
}
// Estimated total: ~5,320 constraints
```

### Example 2: Private Voting

```compact
export circuit vote(
    choice: Uint<8>,
    merkle_proof: MerkleProof<20>,
    nullifier_preimage: Bytes<32>
): [] {
    // Voter eligibility (Merkle membership)
    const voter_leaf = hash(get_voter_id());     // ~1,000
    assert verify_merkle(root, voter_leaf, merkle_proof);  // ~20,000

    // Prevent double-voting
    const nullifier = persistentHash("vote", nullifier_preimage);  // ~1,000
    assert !nullifiers.member(nullifier);        // ~254
    nullifiers.insert(nullifier);                // ~1

    // Record vote
    assert choice < NUM_CHOICES;                 // ~8 (Uint<8>)
    vote_counts[choice].increment(1);            // ~1
}
// Estimated total: ~22,264 constraints
```

---

## Optimization Checklist

| Check | Question | Optimization |
|-------|----------|--------------|
| Hashes | Using SHA256? | Replace with Pedersen |
| Loops | Operations inside loops? | Move out if possible |
| Comparisons | Using `<` or `>`? | Use `==` if applicable |
| Types | Using Uint<256>? | Use smaller type if possible |
| Merkle | Depth matches usage? | Right-size the tree |
| Witness | Computation on-chain? | Move to witness if possible |
| Batching | Verifying items individually? | Consider batch verification |

---

## Performance Targets

| Contract Type | Target Constraints | Proof Time |
|---------------|-------------------|------------|
| Simple transfer | < 10,000 | < 1s |
| Token with signatures | < 20,000 | 1-2s |
| Private voting | < 50,000 | 2-5s |
| Complex DeFi | < 100,000 | 5-10s |
| Heavy computation | < 500,000 | 30-60s |

**Note**: Actual proof times depend on hardware and prover implementation.
