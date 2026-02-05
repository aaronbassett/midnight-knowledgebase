# Disclosure Rules Reference

Patterns and rules for detecting privacy leaks in Compact smart contracts.

## Core Disclosure Rule

**The Fundamental Rule**: Any value derived from a witness that becomes publicly visible must pass through `disclose()`.

```compact
witness get_secret(): Field;

// ❌ VIOLATION: witness to public without disclose
export circuit reveal(): Field {
    return get_secret();
}

// ✅ CORRECT: explicit disclosure
export circuit reveal(): Field {
    return disclose(get_secret());
}
```

## Disclosure Paths

### 1. Direct Return Values

Values returned from `export circuit` are public.

```compact
// Path: witness → return
witness get_balance(): Uint<64>;

export circuit show_balance(): Uint<64> {
    const balance = get_balance();
    return disclose(balance);  // Must disclose
}
```

### 2. Ledger Writes

Values written to ledger become publicly visible.

```compact
// Path: witness → ledger.write()
witness get_vote(): Uint<8>;

export circuit cast_vote(): [] {
    const vote = get_vote();
    // ⚠️ This makes vote public on ledger
    // May be intentional, but document the intent
    votes.push(vote);
}
```

### 3. Computed Values

Taint propagates through computations.

```compact
// Path: witness → computation → return
witness get_amount(): Uint<64>;

export circuit get_fee(): Uint<64> {
    const amount = get_amount();
    const fee = amount * 3 / 100;  // fee is tainted by amount
    return disclose(fee);  // ⚠️ Leaks information about amount
}
```

### 4. Conditional Branches

Control flow based on witnesses leaks information.

```compact
// Path: witness → if condition
witness get_access_level(): Uint<8>;

export circuit access_resource(): Boolean {
    const level = get_access_level();
    // ⚠️ Return value leaks whether level > 5
    if level > 5 {
        return disclose(true);
    }
    return disclose(false);
}
```

## Detection Patterns

### Pattern 1: Witness Taint Tracking

Track all values derived from witnesses:

```
TAINTED = { all witness function calls }

For each statement:
  If RHS contains TAINTED variable:
    Add LHS to TAINTED
```

### Pattern 2: Public Sink Identification

Identify all public sinks:

```
PUBLIC_SINKS = {
  - export circuit return values
  - ledger.write() arguments
  - ledger.push() arguments
  - arguments to disclosed comparisons
}
```

### Pattern 3: Violation Detection

```
For each PUBLIC_SINK:
  If value in TAINTED:
    If not wrapped in disclose():
      REPORT violation
```

## Taint Propagation Rules

### Propagating Operations

These operations propagate taint:

| Operation | Example | Taint Rule |
|-----------|---------|------------|
| Assignment | `x = tainted` | `x` becomes tainted |
| Arithmetic | `x = tainted + 1` | `x` becomes tainted |
| Comparison | `x = tainted > 5` | `x` becomes tainted |
| Indexing | `x = arr[tainted]` | `x` becomes tainted |
| Field access | `x = tainted.field` | `x` becomes tainted |
| Function call | `x = fn(tainted)` | `x` becomes tainted |

### Non-Propagating Operations

These operations break taint:

| Operation | Example | Result |
|-----------|---------|--------|
| Constant | `x = 42` | `x` is clean |
| `disclose()` | `x = disclose(tainted)` | `x` is clean (disclosed) |
| Hash with entropy | `x = hash(secret, tainted)` | `x` is clean (info-theoretic hiding) |

## Common Violations

### V1: Forgotten disclose() on Return

```compact
witness get_count(): Uint<64>;

export circuit current_count(): Uint<64> {
    // ❌ Missing disclose
    return get_count();
}
```

### V2: Arithmetic Leak

```compact
witness get_private_balance(): Uint<64>;

export circuit has_funds(required: Uint<64>): Boolean {
    const balance = get_private_balance();
    // ❌ Leaks whether balance >= required
    return disclose(balance >= required);
}
```

**Note**: This may be intentional. Document if so:

```compact
// Intentional: User consents to revealing sufficiency check
return disclose(balance >= required);
```

### V3: Index Leak

```compact
witness get_selection(): Uint<8>;

export circuit get_selected_item(): Field {
    const idx = get_selection();
    // ❌ The item returned reveals the selection
    return disclose(items[idx].read());
}
```

### V4: Loop Count Leak

```compact
witness get_iterations(): Uint<8>;

export circuit process(): [] {
    const n = get_iterations();
    // ⚠️ Proof generation time reveals n
    for i in 0..disclose(n) {
        doWork();
    }
}
```

## Safe Patterns

### S1: Commitment Before Reveal

```compact
witness get_secret(): Bytes<32>;
witness get_nonce(): Bytes<32>;

// Phase 1: Commit (hides value)
export circuit commit(): Bytes<32> {
    return persistentCommit(get_nonce(), get_secret());
}

// Phase 2: Reveal (intentional disclosure)
export circuit reveal(): Bytes<32> {
    return disclose(get_secret());
}
```

### S2: Nullifier Generation

```compact
witness get_secret(): Bytes<32>;

export circuit nullifier(): Bytes<32> {
    const secret = get_secret();
    // Nullifier reveals nothing about secret (one-way)
    return persistentHash("nullifier", secret);
}
```

### S3: Merkle Membership Proof

```compact
witness get_leaf(): Bytes<32>;
witness get_proof(): MerkleProof<20>;

export circuit prove_membership(root: Bytes<32>): [] {
    const leaf = get_leaf();
    const proof = get_proof();
    // Only reveals that SOME leaf is in tree
    assert verifyMerkleProof(root, leaf, proof);
}
```

## Disclosure Analysis Process

1. **Build taint graph** from all witness declarations
2. **Trace data flow** through all statements
3. **Identify public sinks** (returns, ledger writes)
4. **Check each sink** for proper disclose() or safe pattern
5. **Report violations** with line references

## Edge Cases

### EC-1: Conditional Taint

```compact
if condition {
    x = tainted_value;
} else {
    x = clean_value;
}
// x is tainted (either branch could execute)
```

### EC-2: Tainted Index, Clean Array

```compact
items: Vector<Field, 100>;  // All items are public
const idx = get_tainted_index();
const item = items[idx];  // item itself is public, but WHICH item reveals idx
```

### EC-3: Aggregate Leakage

```compact
// Individual disclosures may be fine
// But aggregated, they reveal too much
export circuit a(): Uint<64> { return disclose(balance / 3); }
export circuit b(): Uint<64> { return disclose(balance / 5); }
// Attacker computes: balance ≡ gcd(a*3, b*5)
```

## References

- [compact-core/privacy-disclosure](../../../compact-core/skills/privacy-disclosure/SKILL.md) - Compact privacy model
- [Vulnerability Checklist](./vulnerability-checklist.md) - Complete security checklist
- [ZK Attack Vectors](./zk-attack-vectors.md) - Attack patterns
