# Common Pitfalls in Compact Development

Frequent mistakes when developing Compact smart contracts and how to avoid them.

## 1. Forgetting Disclosure

### The Pitfall

The most common error in Compact development: witness values flowing to public outputs without `disclose()`.

```compact
witness get_balance(): Uint<64>;

// ERROR: Compile-time error
export circuit get_user_balance(): Uint<64> {
    const balance = get_balance();
    return balance;  // potential witness-value disclosure
}
```

### Why It Happens

- New developers expect implicit privacy handling
- Transitive tainting isn't always obvious
- Disclosure requirements apply even to derived values

### The Fix

Always explicitly mark values that should be disclosed:

```compact
// Option 1: Explicit disclosure when revealing is intentional
export circuit get_user_balance(): Uint<64> {
    const balance = get_balance();
    return disclose(balance);  // User knows this reveals balance
}

// Option 2: Use commitment if value should stay private
export circuit get_balance_commitment(): Bytes<32> {
    const balance = get_balance();
    return persistentCommit(balance);  // Balance hidden, commitment public
}
```

### Prevention

- Run the compiler early and often
- Add `disclose()` as a conscious decision, not a fix
- Document why each disclosure is necessary

---

## 2. Wrong ADT Choice

### The Pitfall

Using inefficient or inappropriate abstract data types for your use case.

**Example 1: Using `Map` when `Counter` suffices**
```compact
// BAD: Overhead of Map for simple counting
ledger vote_counts: Map<Bytes<32>, Uint<64>>;

export circuit vote(proposal: Bytes<32>): [] {
    const current = vote_counts.lookup(proposal);
    const count = if current is Maybe::Some(c) { c } else { 0 };
    vote_counts.insert(proposal, count + 1);
}
```

```compact
// GOOD: Use Counter for incrementing values
ledger vote_count: Counter;

export circuit vote(): [] {
    vote_count.increment(1);
}
```

**Example 2: Using `List` when `Set` is appropriate**
```compact
// BAD: List doesn't prevent duplicates
ledger members: List<Bytes<32>>;

export circuit add_member(member: Bytes<32>): [] {
    // Can add same member multiple times!
    members.append(member);
}
```

```compact
// GOOD: Set enforces uniqueness
ledger members: Set<Bytes<32>>;

export circuit add_member(member: Bytes<32>): [] {
    members.insert(member);  // Duplicates ignored
}
```

**Example 3: Using `Map` when `MerkleTree` is needed**
```compact
// BAD: On-chain storage of all members
ledger members: Map<Bytes<32>, Boolean>;

// Requires storing EVERY member on-chain
```

```compact
// GOOD: MerkleTree for large membership sets
ledger members: MerkleTree<Bytes<32>>;

// Only root stored on-chain, members stored off-chain
// Membership proven via Merkle paths
```

### The Fix

Choose ADTs based on your requirements:

| Need | Use | Why |
|------|-----|-----|
| Simple counter | `Counter` | Optimized for increment-only |
| Key-value lookup | `Map<K, V>` | O(1) lookup |
| Unique items | `Set<T>` | Enforces uniqueness |
| Ordered data | `List<T>` | Maintains insertion order |
| Large membership | `MerkleTree<T>` | Logarithmic proof size |
| Historical proofs | `HistoricMerkleTree<T>` | Past state verification |

---

## 3. Attempting Unbounded Loops

### The Pitfall

Trying to use runtime values as loop bounds.

```compact
witness get_array_length(): Uint<64>;

// ERROR: Compile-time error
export circuit process_array(): Field {
    const length = get_array_length();
    var sum: Field = 0;

    for i in 0..length {  // length is not compile-time constant
        sum = sum + get_element(i);
    }

    return sum;
}
```

### Why It Happens

- ZK circuits must have fixed size at compile time
- Traditional programming habits don't apply
- Dynamic data structures seem natural

### The Fix

**Option 1: Use fixed maximum bound**
```compact
const MAX_ELEMENTS: Uint<64> = 100;

export circuit process_array(): Field {
    const actual_length = disclose(get_array_length());
    var sum: Field = 0;

    for i in 0..100 {  // Fixed bound
        if (i as Uint<64>) < actual_length {
            sum = sum + get_element(i as Uint<64>);
        }
    }

    return sum;
}
```

**Option 2: Use generic size parameter**
```compact
circuit process<#N>(data: Vector<Field, #N>): Field {
    var sum: Field = 0;
    for i in 0..#N {  // #N is compile-time constant
        sum = sum + data[i];
    }
    return sum;
}

// Caller specifies size
export circuit process_10(data: Vector<Field, 10>): Field {
    return process(data);
}
```

**Option 3: Restructure to avoid loops**
```compact
// Instead of looping through members, use Merkle proof
export circuit verify_membership(
    member: Bytes<32>,
    path: Vector<Bytes<32>, 20>
): Boolean {
    const root = members.root();
    const computed = merkleTreePathRoot(member, path);
    return computed == root;
}
```

---

## 4. Uint Overflow

### The Pitfall

Arithmetic operations exceeding the type's maximum value.

```compact
export circuit accumulate(values: Vector<Uint<8>, 10>): Uint<8> {
    var sum: Uint<8> = 0;
    for i in 0..10 {
        sum = sum + values[i];  // Can overflow if sum > 255
    }
    return sum;
}
```

### Why It Happens

- Choosing too-small bit widths
- Not anticipating accumulated values
- Optimizing for proof size without considering bounds

### The Fix

**Option 1: Use appropriate bit width**
```compact
export circuit accumulate(values: Vector<Uint<8>, 10>): Uint<16> {
    var sum: Uint<16> = 0;  // Max possible: 255 * 10 = 2550, fits in Uint<16>
    for i in 0..10 {
        sum = sum + values[i] as Uint<16>;
    }
    return sum;
}
```

**Option 2: Check bounds before operations**
```compact
export circuit safe_add(a: Uint<64>, b: Uint<64>): Uint<64> {
    const max: Uint<64> = 18446744073709551615;  // 2^64 - 1
    assert a <= max - b, "Would overflow";
    return a + b;
}
```

**Option 3: Use Field for intermediate calculations**
```compact
export circuit accumulate(values: Vector<Uint<64>, 100>): Uint<64> {
    var sum: Field = 0;  // Field has ~254 bits
    for i in 0..100 {
        sum = sum + values[i] as Field;
    }
    // Final conversion (will fail if too large)
    return sum as Uint<64>;
}
```

---

## 5. Division by Zero

### The Pitfall

Performing division without checking the divisor.

```compact
export circuit calculate_average(sum: Uint<64>, count: Uint<64>): Uint<64> {
    return sum / count;  // Fails if count == 0
}
```

### The Fix

Always check before dividing:

```compact
export circuit calculate_average(sum: Uint<64>, count: Uint<64>): Uint<64> {
    assert count > 0, "Cannot divide by zero";
    return sum / count;
}

// Or return Option to handle gracefully
export circuit safe_average(sum: Uint<64>, count: Uint<64>): Option<Uint<64>> {
    if count == 0 {
        return Option::None;
    }
    return Option::Some(sum / count);
}
```

---

## 6. Misusing Hash vs Commitment

### The Pitfall

Using `persistentHash` when `persistentCommit` is needed for security.

```compact
witness get_secret(): Field;

// BAD: Hash can be brute-forced for small value spaces
export circuit bad_commit(): Bytes<32> {
    const secret = get_secret();
    return persistentHash(secret);  // If secret is a vote (0-9), easily brute-forced
}
```

### Why It Happens

- Confusion between hiding and binding
- Not understanding brute-force attacks
- Traditional hashing habits

### The Fix

Use commitment for values that need hiding:

```compact
// GOOD: Commitment includes random nonce
export circuit good_commit(): Bytes<32> {
    const secret = get_secret();
    return persistentCommit(secret);  // Cannot brute-force due to nonce
}
```

**When to use each**:

| Function | Use Case |
|----------|----------|
| `persistentCommit(x)` | Hiding values (votes, bids, secrets) |
| `persistentHash(x)` | Deriving unique identifiers (nullifiers) |
| `transientCommit(x)` | Temporary hiding within single proof |
| `transientHash(x)` | Temporary derivation within single proof |

---

## 7. Ignoring Return Value Semantics

### The Pitfall

Not understanding that circuit returns go to TypeScript as public values.

```compact
witness get_sensitive_data(): SensitiveStruct;

// BAD: Returns entire sensitive struct
export circuit process(): SensitiveStruct {
    const data = get_sensitive_data();
    // ... processing ...
    return disclose(data);  // Entire struct is now public!
}
```

### The Fix

Only return what's necessary:

```compact
// GOOD: Return only the needed public result
export circuit process(): Boolean {
    const data = get_sensitive_data();
    // ... processing that uses sensitive data ...
    return true;  // Only return the public result
}

// Or return a commitment if the result must be verified later
export circuit process(): Bytes<32> {
    const data = get_sensitive_data();
    const result = compute_result(data);
    return persistentCommit(result);  // Result hidden but verifiable
}
```

---

## 8. Inefficient Vector Operations

### The Pitfall

Creating unnecessary proof overhead with vector operations.

```compact
// BAD: Loops through entire vector even for single lookup
circuit find_element(arr: Vector<Field, 100>, target: Field): Boolean {
    var found: Boolean = false;
    for i in 0..100 {
        if arr[i] == target {
            found = true;
        }
    }
    return found;
}
```

### The Fix

Use appropriate data structures or witness the index:

```compact
// GOOD: Witness provides the index, circuit just verifies
witness get_element_index(): Uint<8>;

circuit verify_element(arr: Vector<Field, 100>, target: Field): Boolean {
    const idx = disclose(get_element_index());
    assert idx < 100, "Index out of bounds";
    return arr[idx as Field as Uint<8>] == target;
}

// For membership in large sets, use MerkleTree instead of Vector
```

---

## 9. Not Testing Edge Cases

### The Pitfall

Only testing the happy path.

```typescript
// BAD: Only tests normal operation
it('processes transfer', async () => {
    const result = await ctx.call('transfer', [recipient, BigInt(100)]);
    expect(result.success).toBe(true);
});
```

### The Fix

Test boundaries, errors, and edge cases:

```typescript
describe('transfer', () => {
    // Happy path
    it('succeeds with valid amount', async () => {
        // ...
    });

    // Edge cases
    it('handles transfer of entire balance', async () => {
        const witnesses = { get_balance: () => BigInt(100) };
        const result = await ctx.call('transfer', [recipient, BigInt(100)], witnesses);
        expect(result.success).toBe(true);
    });

    it('handles minimum valid amount', async () => {
        const result = await ctx.call('transfer', [recipient, BigInt(1)]);
        expect(result.success).toBe(true);
    });

    // Error cases
    it('fails with zero amount', async () => {
        await expect(ctx.call('transfer', [recipient, BigInt(0)]))
            .rejects.toThrow('Amount must be positive');
    });

    it('fails when balance insufficient', async () => {
        const witnesses = { get_balance: () => BigInt(50) };
        await expect(ctx.call('transfer', [recipient, BigInt(100)], witnesses))
            .rejects.toThrow('Insufficient balance');
    });
});
```

---

## 10. Mixing Up Transient and Persistent Operations

### The Pitfall

Using transient operations when persistence is needed, or vice versa.

```compact
// BAD: Transient hash used for nullifier that should be verifiable later
export circuit spend(secret: Field): Bytes<32> {
    const nullifier = transientHash("nullifier", secret);
    // This nullifier won't be verifiable in future proofs!
    return nullifier;
}
```

### Why It Happens

- Confusion about transient vs persistent scope
- Performance optimization attempts
- Copy-paste errors

### The Fix

**Use persistent for cross-proof values**:
```compact
// GOOD: Persistent hash for nullifier
export circuit spend(secret: Field): Bytes<32> {
    const nullifier = persistentHash("nullifier", secret);
    return nullifier;  // This will be the same in any proof
}
```

**Use transient for within-proof values**:
```compact
// GOOD: Transient for intermediate calculations
circuit internal_helper(values: Vector<Field, 10>): Bytes<32> {
    // Intermediate hash only used within this proof
    var h = transientHash(values[0]);
    for i in 1..10 {
        h = transientHash(h, values[i]);
    }
    return h;  // Only returned, not stored
}
```

**Decision guide**:

| Scenario | Use |
|----------|-----|
| Nullifiers | `persistentHash` |
| Commitments stored on ledger | `persistentCommit` |
| Cross-proof verification | Persistent |
| Intermediate calculations | Transient |
| Within single proof only | Transient |
