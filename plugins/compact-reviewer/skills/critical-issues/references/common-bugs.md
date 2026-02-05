# Common Bugs in Compact Contracts

Catalog of frequently encountered bugs in Compact smart contracts.

## Assertion Bugs

### AB-01: Always-Failing Assertion

**Severity**: 🔴 Critical

**Description**: Assertion that can never be satisfied.

```compact
// Bug: x is Uint, so x >= 0 always
witness get_amount(): Uint<64>;

export circuit process(): [] {
    const x = get_amount();
    assert x < 0;  // ❌ Uint can never be < 0
}
```

**Detection**: Check assertions for logical impossibilities based on types.

### AB-02: Contradictory Assertions

**Severity**: 🔴 Critical

**Description**: Multiple assertions that cannot all be true.

```compact
export circuit check(value: Uint<64>): [] {
    assert value > 100;
    assert value < 50;   // ❌ Contradicts previous
    // Circuit always fails
}
```

### AB-03: Tautological Assertion

**Severity**: 🟡 Medium

**Description**: Assertion that always passes.

```compact
export circuit validate(x: Uint<64>): [] {
    assert x >= 0;  // ⚠️ Always true for Uint
    // Provides no security
}
```

### AB-04: Missing Assertion

**Severity**: 🔴 Critical

**Description**: Required validation not performed.

```compact
export circuit divide(a: Uint<64>, b: Uint<64>): Uint<64> {
    // ❌ Missing: assert b > 0
    return a / b;  // Division by zero possible
}
```

---

## Control Flow Bugs

### CF-01: Unreachable Code

**Severity**: 🟡 Medium

**Description**: Code that can never execute.

```compact
export circuit process(): Uint<64> {
    return 42;
    const x = compute();  // ❌ Never executes
    return x;
}
```

### CF-02: Identical Branches

**Severity**: 🟡 Medium

**Description**: If-else with same outcome.

```compact
export circuit choose(flag: Boolean): Uint<64> {
    if flag {
        return 100;
    } else {
        return 100;  // ⚠️ Same as if branch
    }
}
```

### CF-03: Empty Loop Body

**Severity**: 🟠 High

**Description**: Loop that performs no work.

```compact
export circuit process(): [] {
    for i in 0..100 {
        // ❌ Empty body - wastes constraints
    }
}
```

### CF-04: Off-By-One Loop

**Severity**: 🟠 High

**Description**: Loop bounds error.

```compact
ledger items: Vector<Field, 100>;

export circuit initialize(): [] {
    for i in 0..100 {
        items[i + 1].write(0);  // ❌ Index 0 skipped, 100 overflows
    }
}
```

**Fixed**:
```compact
for i in 0..100 {
    items[i].write(0);  // ✅ Correct bounds
}
```

---

## Type Bugs

### TB-01: Integer Overflow

**Severity**: 🟠 High

**Description**: Arithmetic exceeding type bounds.

```compact
export circuit accumulate(values: Vector<Uint<8>, 1000>): Uint<8> {
    var sum: Uint<8> = 0;
    for i in 0..1000 {
        sum = sum + values[i].read();  // ❌ Will overflow Uint<8> (max 255)
    }
    return sum;
}
```

**Fixed**:
```compact
export circuit accumulate(values: Vector<Uint<8>, 1000>): Uint<64> {
    var sum: Uint<64> = 0;  // ✅ Large enough for sum
    // ...
}
```

### TB-02: Precision Loss

**Severity**: 🟡 Medium

**Description**: Loss of precision in division.

```compact
export circuit calculate_percentage(part: Uint<64>, whole: Uint<64>): Uint<64> {
    return (part / whole) * 100;  // ❌ Integer division loses precision
}
```

**Fixed**:
```compact
export circuit calculate_percentage(part: Uint<64>, whole: Uint<64>): Uint<64> {
    return (part * 100) / whole;  // ✅ Multiply first
}
```

### TB-03: Type Confusion in Generics

**Severity**: 🔴 Critical

**Description**: Wrong type parameter used.

```compact
// Type confusion between Bytes<20> and Bytes<32>
ledger owners: Map<Bytes<32>, Boolean>;

export circuit check_owner(addr: Bytes<20>): Boolean {
    // ❌ addr is 20 bytes, map expects 32
    return owners.lookup(addr as Bytes<32>);  // Padding could cause issues
}
```

---

## State Management Bugs

### SM-01: Missing Initialization Check

**Severity**: 🟠 High

**Description**: Using uninitialized ledger state.

```compact
ledger config: Cell<Uint<64>>;  // Starts as 0

export circuit process(): Uint<64> {
    const cfg = config.read();  // ⚠️ May be uninitialized (0)
    return 1000 / cfg;  // Division by zero if not initialized
}
```

**Fixed**:
```compact
ledger initialized: Cell<Boolean>;

export circuit process(): Uint<64> {
    assert initialized.read();  // ✅ Check initialization
    const cfg = config.read();
    return 1000 / cfg;
}
```

### SM-02: Inconsistent State Update

**Severity**: 🟠 High

**Description**: Related state not updated atomically.

```compact
ledger balance: Counter;
ledger total_supply: Counter;

export circuit mint(amount: Uint<64>): [] {
    balance.increment(amount);
    // ❌ If circuit fails after this, state is inconsistent
    total_supply.increment(amount);
}
```

**Note**: In Compact, circuit execution is atomic, but understanding intended atomicity helps catch logic errors.

### SM-03: Read-After-Write Confusion

**Severity**: 🟡 Medium

**Description**: Expecting write to be visible immediately.

```compact
export circuit update_and_check(): [] {
    balance.write(100);
    const new_balance = balance.read();  // ✅ This works in Compact
    assert new_balance == 100;
}
```

---

## Logic Bugs

### LB-01: Inverted Condition

**Severity**: 🟠 High

**Description**: Condition logic reversed.

```compact
export circuit is_allowed(role: Uint<8>): Boolean {
    const ADMIN = 1;
    // ❌ Inverted: allows non-admins
    return role != ADMIN;
}
```

### LB-02: Wrong Operator

**Severity**: 🔴 Critical

**Description**: Using wrong comparison or logical operator.

```compact
export circuit validate(min: Uint<64>, max: Uint<64>, value: Uint<64>): [] {
    assert value >= min || value <= max;  // ❌ Should be && (always true)
}
```

### LB-03: Boundary Error

**Severity**: 🟠 High

**Description**: Inclusive vs exclusive boundary confusion.

```compact
const MAX_USERS = 100;

export circuit add_user(): [] {
    const count = user_count.read();
    assert count < MAX_USERS;  // ⚠️ Allows 0..99, is that intended?
    // If 100 users wanted: assert count < MAX_USERS + 1
}
```

---

## Summary

| Category | ID | Bug | Severity |
|----------|-----|-----|----------|
| Assertion | AB-01 | Always-failing assertion | 🔴 Critical |
| Assertion | AB-02 | Contradictory assertions | 🔴 Critical |
| Assertion | AB-03 | Tautological assertion | 🟡 Medium |
| Assertion | AB-04 | Missing assertion | 🔴 Critical |
| Control Flow | CF-01 | Unreachable code | 🟡 Medium |
| Control Flow | CF-02 | Identical branches | 🟡 Medium |
| Control Flow | CF-03 | Empty loop body | 🟠 High |
| Control Flow | CF-04 | Off-by-one loop | 🟠 High |
| Type | TB-01 | Integer overflow | 🟠 High |
| Type | TB-02 | Precision loss | 🟡 Medium |
| Type | TB-03 | Type confusion | 🔴 Critical |
| State | SM-01 | Missing initialization | 🟠 High |
| State | SM-02 | Inconsistent update | 🟠 High |
| State | SM-03 | Read-after-write | 🟡 Medium |
| Logic | LB-01 | Inverted condition | 🟠 High |
| Logic | LB-02 | Wrong operator | 🔴 Critical |
| Logic | LB-03 | Boundary error | 🟠 High |
