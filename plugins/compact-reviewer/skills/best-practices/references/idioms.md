# Compact Idioms

Idiomatic patterns for writing clean, maintainable Compact code.

## File Structure

### Standard Layout

```compact
pragma language_version >= 0.18.0;

// ========== Constants ==========
const MAX_USERS: Uint<64> = 1000;
const FEE_PERCENT: Uint<8> = 3;

// ========== Type Definitions ==========
struct UserData {
    balance: Uint<64>,
    created_at: Uint<64>,
    active: Boolean
}

enum Status { Pending, Active, Closed }

// ========== Ledger Declarations ==========
ledger users: Map<Bytes<32>, UserData>;
ledger status: Cell<Status>;
ledger admin_hash: Cell<Bytes<32>>;

// ========== Witness Declarations ==========
witness get_caller_secret(): Bytes<32>;
witness get_user_data(): UserData;

// ========== Helper Circuits ==========
circuit get_caller(): Bytes<32> {
    return hash(get_caller_secret());
}

circuit require_admin(): [] {
    assert hash(get_caller_secret()) == admin_hash.read();
}

// ========== Public Interface ==========
export circuit initialize(admin: Bytes<32>): [] { }
export circuit create_user(): [] { }
export circuit get_balance(): Uint<64> { }
```

---

## Authorization Idioms

### Owner Pattern

```compact
// ✅ Idiomatic: Helper circuit for ownership
circuit require_owner(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
}

export circuit owner_action(): [] {
    require_owner();
    // Owner-only logic
}
```

### Role-Based Access

```compact
// ✅ Idiomatic: Role checking helper
circuit require_role(role: Role): [] {
    const caller = get_caller();
    const caller_role = roles.lookup(caller);
    assert caller_role == role || caller_role == Role.Admin;
}
```

---

## State Management Idioms

### Using Appropriate ADTs

```compact
// ❌ Non-idiomatic: Manual counter
ledger count: Cell<Uint<64>>;
export circuit increment(): [] {
    const current = count.read();
    count.write(current + 1);
}

// ✅ Idiomatic: Counter ADT
ledger count: Counter;
export circuit increment(): [] {
    count.increment(1);
}
```

### Initialization Guard

```compact
// ✅ Idiomatic: One-time initialization
ledger initialized: Cell<Boolean>;

export circuit initialize(config: Config): [] {
    assert !initialized.read();  // Only once
    // ... setup logic
    initialized.write(true);
}
```

---

## Naming Idioms

### Circuit Names

```compact
// ✅ Idiomatic: verb_noun or verb format
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] { }
export circuit get_balance(): Uint<64> { }
export circuit is_active(): Boolean { }
export circuit set_config(config: Config): [] { }

// ❌ Non-idiomatic
export circuit doTransfer(): [] { }
export circuit bal(): Uint<64> { }
export circuit proc(): [] { }
```

### Ledger Names

```compact
// ✅ Idiomatic: noun or noun_noun
ledger balances: Map<Bytes<32>, Uint<64>>;
ledger user_count: Counter;
ledger contract_state: Cell<Status>;

// ❌ Non-idiomatic
ledger b: Map<Bytes<32>, Uint<64>>;
ledger cnt: Counter;
ledger s: Cell<Status>;
```

### Witness Functions

```compact
// ✅ Idiomatic: get_* prefix for witnesses
witness get_secret_key(): Bytes<32>;
witness get_merkle_proof(): MerkleProof<20>;
witness get_signature(): Bytes<64>;

// ❌ Non-idiomatic
witness secret(): Bytes<32>;
witness proof(): MerkleProof<20>;
```

---

## Assertion Idioms

### Meaningful Assertions

```compact
// ✅ Idiomatic: Clear assertion purpose
assert balance >= amount;  // Sufficient balance
assert block_height <= deadline;  // Within time limit
assert caller == owner;  // Authorization

// Consider: Document complex assertions
// User must have sufficient balance for transfer plus fee
const total_required = amount + fee;
assert balance >= total_required;
```

### Early Exit Pattern

```compact
// ✅ Idiomatic: Check preconditions first
export circuit withdraw(amount: Uint<64>): [] {
    // 1. Authorization
    require_owner();

    // 2. Validation
    assert amount > 0;
    const balance = get_balance();
    assert balance >= amount;

    // 3. State changes (after all checks pass)
    balances[owner].decrement(amount);
}
```

---

## Loop Idioms

### Fixed-Bound Loops

```compact
// ✅ Idiomatic: Compile-time bounds
for i in 0..10 {
    process_item(items[i]);
}

// ⚠️ Pattern for partial processing
for i in 0..MAX_ITEMS {
    if i < actual_count {
        process_item(items[i]);
    }
}
```

### Accumulator Pattern

```compact
// ✅ Idiomatic: Accumulate in loop
var total: Uint<64> = 0;
for i in 0..10 {
    total = total + values[i].read();
}
```

---

## Return Value Idioms

### Explicit Disclosure

```compact
// ✅ Idiomatic: Explicit about public values
export circuit get_public_count(): Uint<64> {
    return disclose(count.read());
}

// ✅ Idiomatic: Document disclosure intent
export circuit get_status(): Status {
    // Intentionally public: contract state visibility
    return disclose(status.read());
}
```

### Consistent Return Types

```compact
// ✅ Idiomatic: Boolean for predicates
export circuit is_member(user: Bytes<32>): Boolean {
    return disclose(members.member(user));
}

// ✅ Idiomatic: Specific type for data
export circuit get_balance(): Uint<64> {
    return disclose(balances[get_caller()].read());
}
```

---

## Error Handling Idioms

### Fail-Fast Pattern

```compact
// ✅ Idiomatic: Check everything before acting
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // All checks first
    assert to != ZERO_ADDRESS;
    assert amount > 0;
    const from = get_caller();
    const balance = balances[from].read();
    assert balance >= amount;

    // Then act (if all checks pass)
    balances[from].decrement(amount);
    balances[to].increment(amount);
}
```

---

## Documentation Idioms

### Circuit Documentation

```compact
/**
 * Transfer tokens from caller to recipient.
 *
 * @param to Recipient address (32-byte hash)
 * @param amount Amount to transfer
 *
 * Requires: Caller has sufficient balance
 * Effects: Decreases caller balance, increases recipient balance
 */
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // Implementation
}
```

---

## Summary Checklist

| Aspect | Idiomatic | Non-Idiomatic |
|--------|-----------|---------------|
| File structure | Pragma → Constants → Types → Ledger → Witness → Helpers → Public | Mixed ordering |
| Authorization | `require_*()` helpers | Inline checks |
| Counters | `Counter` ADT | `Cell<Uint>` + manual increment |
| Names | Descriptive, `verb_noun` | Abbreviations |
| Assertions | Early, with purpose | Late, unclear |
| Disclosure | Explicit `disclose()` | Implicit |
| Documentation | JSDoc-style comments | None |
