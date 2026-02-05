# Circuit Construction

## From Compact to Circuit

### Compilation Pipeline

```
Compact Source
     ↓
   Parser
     ↓
Abstract Syntax Tree
     ↓
Type Checker
     ↓
Circuit IR
     ↓
R1CS Constraints
     ↓
Proving/Verification Keys
```

### What Becomes Constraints

| Compact Construct | Circuit Representation |
|-------------------|----------------------|
| `assert x == y` | Equality constraint |
| `assert x != 0` | Inverse exists constraint |
| `x + y` | Addition gate |
| `x * y` | Multiplication gate |
| `if c then a else b` | Selection constraint |
| `hash(x)` | Hash circuit (many constraints) |

### Constraint Growth

| Operation | Approximate Constraints |
|-----------|------------------------|
| Addition | 0 (free in R1CS) |
| Multiplication | 1 |
| Comparison | ~254 (bit decomposition) |
| SHA256 hash | ~25,000 |
| Pedersen hash | ~1,000 |
| Merkle proof (depth 32) | ~32,000 |

## Witness vs Public Input

### Public Inputs

- Known to verifier
- Part of verified statement
- In Compact: ledger reads, explicit public values

### Witness (Private Inputs)

- Known only to prover
- Never revealed
- In Compact: witness function parameters

### Example

```compact
export witness checkSecret(
  secret: Field,     // Witness (private)
  hint: Field        // Witness (private)
): Void {
  // ledger.hash is public input
  assert persistentHash(secret) == ledger.hash;
}
```

Circuit has:
- Public input: `ledger.hash` value
- Witness: `secret`, `hint`
- Constraint: `Hash(secret) = public_hash`

## Circuit Optimization

### Minimize Constraints

```compact
// More constraints (comparison is expensive)
if amount > 100 { ... }

// Fewer constraints (equality is cheap)
if amount == 100 { ... }
```

### Batch Operations

```compact
// Expensive: Multiple hash calls
hash1 = persistentHash(a);
hash2 = persistentHash(b);

// Consider: Single hash of combined data
combined = persistentHash(a, b);
```

### Reuse Intermediate Values

```compact
// Computed twice (wasteful)
assert persistentHash(x) == target1;
assert persistentHash(x) == target2;

// Computed once
const h = persistentHash(x);
assert h == target1;
assert h == target2;
```

## Circuit Size Impact

### On Proof Generation

Larger circuits mean:
- More memory during proving
- Longer proof generation time
- Larger proving key files

### On Verification

Verification is constant time regardless of circuit size. This is the "succinct" property.

## Debugging Circuits

### Unsatisfied Constraints

When a proof fails:
1. Witness doesn't satisfy some constraint
2. Check assert conditions
3. Verify input values

### Circuit Too Large

If circuit exceeds limits:
1. Reduce hash operations
2. Simplify comparisons
3. Split into multiple circuits
