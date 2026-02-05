# Circuit Complexity Reference

Detailed breakdown of constraint costs in Compact circuits.

## Constraint Cost Model

### Arithmetic Operations

| Operation | Constraints | Notes |
|-----------|-------------|-------|
| `a + b` | 0 | Free - wire addition |
| `a - b` | 0 | Free - wire subtraction |
| `a * b` | 1 | Single R1CS constraint |
| `a / b` | ~1 | Includes inverse |
| `a % b` | ~1 | Modular operation |

**Why arithmetic is cheap**: R1CS (Rank-1 Constraint System) naturally represents multiplication. Addition and subtraction are "free" as they only modify wire values.

### Comparison Operations

| Operation | Constraints | Reason |
|-----------|-------------|--------|
| `a == b` | ~1 | Direct equality check |
| `a != b` | ~2 | Equality + negation |
| `a < b` | ~N | Bit decomposition (N = bit width) |
| `a > b` | ~N | Same as `<` |
| `a <= b` | ~N | Same as `<` |
| `a >= b` | ~N | Same as `<` |

**Why comparisons are expensive**: Inequality requires decomposing numbers into bits to compare bit-by-bit.

### Type-Specific Comparison Costs

| Type | `<` Cost | `==` Cost |
|------|----------|-----------|
| Boolean | 1 | 1 |
| Uint<8> | ~8 | ~1 |
| Uint<16> | ~16 | ~1 |
| Uint<32> | ~32 | ~1 |
| Uint<64> | ~64 | ~1 |
| Uint<128> | ~128 | ~1 |
| Uint<254> | ~254 | ~1 |
| Field | ~254 | ~1 |
| Bytes<32> | ~256 | ~1 |

---

## Cryptographic Operations

### Hash Functions

| Function | Constraints | Use Case |
|----------|-------------|----------|
| `persistentHash()` | ~1,000 | General hashing |
| `persistentCommit()` | ~1,000 | Commitments |
| `hash()` | ~1,000 | Same as persistentHash |
| SHA256 | ~25,000 | Avoid if possible |
| Poseidon | ~300-500 | ZK-optimized (if available) |

### Signature Verification

| Scheme | Constraints | Notes |
|--------|-------------|-------|
| ECDSA | ~5,000-10,000 | Curve operations |
| Schnorr | ~3,000-5,000 | Simpler |
| EdDSA | ~3,000-5,000 | Ed25519 |

### Elliptic Curve Operations

| Operation | Constraints |
|-----------|-------------|
| Point addition | ~500-1,000 |
| Scalar multiplication | ~5,000-10,000 |
| Pairing (if supported) | ~100,000+ |

---

## Data Structure Operations

### Merkle Trees

| Depth | Proof Verification | Notes |
|-------|-------------------|-------|
| 1 | ~1,000 | 2 items |
| 5 | ~5,000 | 32 items |
| 10 | ~10,000 | 1,024 items |
| 15 | ~15,000 | 32,768 items |
| 20 | ~20,000 | ~1 million items |
| 32 | ~32,000 | ~4 billion items |

**Formula**: `depth × hash_cost ≈ depth × 1,000`

### Maps and Sets

| Operation | Constraints | Notes |
|-----------|-------------|-------|
| `lookup(key)` | ~254 | Membership check |
| `member(key)` | ~254 | Same as lookup |
| `insert(key)` | ~1 | State update |

### Vectors and Arrays

| Operation | Constraints | Notes |
|-----------|-------------|-------|
| `read(index)` | ~254 | Index bounds |
| `write(index)` | ~254 | Index bounds + write |
| Iteration | N × body | Linear in size |

---

## Control Flow Costs

### Conditional Statements

```compact
if condition {
    // Branch A
} else {
    // Branch B
}
```

**Cost**: `condition_cost + max(branch_A, branch_B)`

**Important**: Both branches are evaluated in ZK circuits. The condition selects which result to use.

### Loops

```compact
for i in 0..N {
    // Body
}
```

**Cost**: `N × body_cost`

**Important**: Loop count must be known at compile time. Dynamic loops not supported.

---

## Complexity Classes

### Low Complexity (< 1,000 constraints)

- Simple arithmetic
- Few equality checks
- Basic state updates

```compact
export circuit increment(): [] {
    counter.increment(1);  // ~1 constraint
}
```

### Medium Complexity (1,000 - 10,000 constraints)

- Hash operations
- Signature verification
- Small loops

```compact
export circuit verify_auth(): [] {
    const sig = get_signature();
    assert verify(pubkey, message, sig);  // ~5,000
}
```

### High Complexity (10,000 - 100,000 constraints)

- Merkle proofs
- Multiple signatures
- Large loops

```compact
export circuit private_transfer(): [] {
    // Merkle membership: ~20,000
    // Signature: ~5,000
    // Nullifier: ~1,000
    // Total: ~26,000
}
```

### Very High Complexity (> 100,000 constraints)

- Multiple Merkle proofs
- Complex DeFi logic
- Large batch operations

---

## Estimation Formulas

### Basic Formula

```
Total ≈ Σ(operation × count)
```

### Common Patterns

**Token Transfer**:
```
~5,000 (sig) + ~254 (balance check) + ~2 (updates) ≈ 5,256
```

**Private Voting**:
```
~20,000 (Merkle) + ~1,000 (nullifier) + ~254 (membership) ≈ 21,254
```

**Private Auction**:
```
~20,000 (Merkle) + ~1,000 (commitment) + ~5,000 (sig) × 2 ≈ 31,000
```

---

## Optimization Impact

| Optimization | Typical Savings |
|-------------|-----------------|
| SHA256 → Pedersen | 24,000 per hash |
| Reduce Merkle depth by 5 | 5,000 per proof |
| `<` → `==` | 253 per comparison |
| Move to witness | Variable (can be 100%) |
| Batch N items | (N-1)/N of original |

---

## Benchmarking

### Measurement Approach

```
1. Count each operation type
2. Apply cost from tables
3. Sum total
4. Compare with actual compilation (if available)
```

### Accuracy

- Estimation: ±20% typically
- Actual: Requires compactc output
- Always verify critical paths with real compilation

---

## Summary Cheat Sheet

| Category | Cost Range | Notes |
|----------|------------|-------|
| Arithmetic | 0-1 | Essentially free |
| Equality | ~1 | Cheap |
| Inequality | ~N bits | Avoid if possible |
| Hash | ~1,000 | Budget carefully |
| SHA256 | ~25,000 | Avoid |
| Merkle proof | ~D×1,000 | D = depth |
| Signature | ~5,000 | Per signature |
| Loop body | ×N | Multiplied by iterations |
