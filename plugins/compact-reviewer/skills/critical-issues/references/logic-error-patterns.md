# Logic Error Detection Patterns

Systematic patterns for detecting logic errors in Compact contracts.

## Detection Strategy

### 1. Symbolic Execution Mindset

Trace possible values through the code:

```
For each variable:
  - What values can it hold at each point?
  - What constraints narrow the range?
  - Can any constraint ever fail?
```

### 2. Assertion Verification

For each `assert` statement:

```
1. What makes the assertion true?
2. What makes it false?
3. Is it possible to reach this assertion with a false condition?
4. If always true, is it redundant?
5. If always false, is the code unreachable?
```

### 3. State Machine Analysis

Model state transitions:

```
1. What states can the contract be in?
2. What transitions are valid?
3. Are all transitions covered?
4. Can invalid states be reached?
```

---

## Pattern: Contradictory Constraints

### Description

Multiple constraints that cannot all be satisfied.

### Detection

```
Collect all assertions on a variable
Build constraint set: {x > 100, x < 50, x == 75}
Check for satisfiability
```

### Example

```compact
export circuit validate(score: Uint<64>): [] {
    assert score >= 60;    // Constraint 1: score ∈ [60, ∞)
    assert score <= 100;   // Constraint 2: score ∈ [0, 100]
    assert score < 50;     // Constraint 3: score ∈ [0, 49]
    // Intersection is empty - always fails
}
```

---

## Pattern: Unreachable Code

### Description

Code paths that can never execute.

### Detection

```
For each statement:
  - Can this statement be reached from entry?
  - Check for:
    - Statements after return
    - Code in never-true branches
    - Code after infinite loops
```

### Example

```compact
export circuit compute(x: Uint<64>): Uint<64> {
    if x > 100 {
        return x * 2;
    } else {
        return x + 1;
    }
    // ❌ Unreachable: both branches return
    const y = x * 3;
    return y;
}
```

---

## Pattern: Tautology/Contradiction in Conditions

### Description

Conditions that are always true or always false.

### Detection

```
For each condition:
  - Substitute known types and ranges
  - Simplify expression
  - Check if result is constant
```

### Examples

```compact
// Tautology (always true)
witness get_x(): Uint<64>;
const x = get_x();
if x >= 0 { ... }  // ⚠️ Uint is always >= 0

// Contradiction (always false)
if x < 0 { ... }  // ⚠️ Uint is never < 0
```

### Type-Based Simplifications

| Type | Always True | Always False |
|------|-------------|--------------|
| Uint<N> | `x >= 0` | `x < 0` |
| Boolean | `x == true \|\| x == false` | N/A |
| Field | None inherent | None inherent |

---

## Pattern: Off-By-One Errors

### Description

Loop or array bounds errors.

### Detection

```
For each loop `for i in start..end`:
  - Does loop execute expected number of times?
  - Are array accesses within bounds for all i?
  - Is there fencepost error in index calculations?
```

### Common Mistakes

```compact
// Mistake 1: Wrong count
for i in 0..10 {  // Executes 10 times (0-9)
    // If expecting 10 iterations, correct
    // If expecting to include 10, wrong (should be 0..11)
}

// Mistake 2: Index calculation error
for i in 0..n {
    arr[i + 1].write(values[i]);  // Skips arr[0], may overflow at i=n-1
}

// Mistake 3: Exclusive vs inclusive
const MAX = 100;
for i in 0..MAX {  // Goes to 99, not 100
    if i == MAX { /* Never executes */ }
}
```

---

## Pattern: Integer Overflow

### Description

Arithmetic exceeding type bounds.

### Detection

```
For each arithmetic operation:
  - What is the maximum possible result?
  - Does it fit in the result type?
  - Are there guards before the operation?
```

### Risk Assessment

| Operation | Risk | Max Input for Safety |
|-----------|------|---------------------|
| `a + b` (Uint<64>) | Overflow | a + b < 2^64 |
| `a * b` (Uint<64>) | Overflow | a * b < 2^64 |
| `a - b` (Uint) | Underflow | a >= b |
| `sum of n terms` | Overflow | Each term × n < max |

### Example

```compact
// Calculating total with potential overflow
var total: Uint<64> = 0;
for i in 0..1000 {
    const amount = amounts[i].read();  // Up to 2^64-1 each
    total = total + amount;  // ⚠️ Could overflow after ~18 additions of max values
}
```

---

## Pattern: Type Mismatch

### Description

Operations on incompatible types.

### Detection

```
For each operation:
  - Check operand types are compatible
  - Check result type is correct
  - Verify casts are safe
```

### Examples

```compact
// Comparing different sizes
const a: Uint<64> = 1000;
const b: Uint<8> = 100;
assert a > b;  // Need: a > (b as Uint<64>)

// Bytes size mismatch
const addr20: Bytes<20> = getAddress20();
const addr32: Bytes<32> = getAddress32();
// These are different types, direct comparison fails
```

---

## Pattern: Missing Error Handling

### Description

Failure to handle edge cases.

### Detection

```
For each operation that can fail:
  - Is the failure case checked?
  - What happens on failure?
```

### Examples

```compact
// Division without zero check
export circuit divide(a: Uint<64>, b: Uint<64>): Uint<64> {
    // ❌ Missing: assert b > 0
    return a / b;
}

// Array access without bounds
export circuit get_item(index: Uint<64>): Field {
    // ❌ Missing: assert index < items.length
    return items[index].read();
}
```

---

## Pattern: State Consistency Violation

### Description

Related state not updated consistently.

### Detection

```
For each group of related state variables:
  - Are they updated together?
  - Can partial updates occur?
  - Are invariants maintained?
```

### Example

```compact
ledger numerator: Counter;
ledger denominator: Counter;

// Invariant: ratio = numerator / denominator should be valid

export circuit update_ratio(n: Uint<64>, d: Uint<64>): [] {
    numerator.write(n);
    // ⚠️ If assertion fails here, numerator updated but not denominator
    assert d > 0;
    denominator.write(d);
}
```

---

## Detection Checklist

| Check | Question | If Yes |
|-------|----------|--------|
| Assertions | Can any assertion always fail? | 🔴 Report Critical |
| Assertions | Can any assertion always pass? | 🟡 Report Medium |
| Reachability | Is there code after return? | 🟡 Report Medium |
| Loops | Do array accesses stay in bounds? | 🔴 Report Critical if not |
| Arithmetic | Can overflow occur? | 🟠 Report High |
| Conditions | Is any condition tautological? | 🟡 Report Medium |
| Division | Is divisor checked for zero? | 🔴 Report Critical if not |
| State | Are related updates atomic? | 🟠 Report High if not |

---

## Review Process

1. **Parse and build CFG** (Control Flow Graph)
2. **Run data flow analysis** to track variable ranges
3. **Check each assertion** against known ranges
4. **Trace all paths** for reachability
5. **Verify arithmetic** is bounded
6. **Confirm state updates** are consistent
7. **Report findings** with line references
