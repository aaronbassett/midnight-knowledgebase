# Control Flow

Reference for conditionals, loops, and assertions in Compact.

## Conditionals

### If-Else Expressions

Compact's `if` is an expression that returns a value:

```compact
const max: Field = if a > b { a } else { b };
```

### If-Else Statements

When used as a statement (return type `[]`):

```compact
if condition {
    // do something
} else {
    // do something else
}
```

### Nested Conditionals

```compact
const grade: Field = if score >= 90 {
    4  // A
} else if score >= 80 {
    3  // B
} else if score >= 70 {
    2  // C
} else {
    1  // D
};
```

### Pattern Matching with If

```compact
enum Option<T> {
    Some(T),
    None
}

const value: Option<Field> = ...;

const result: Field = if value is Option::Some(v) {
    v
} else {
    0  // default for None
};
```

## Loops

### Bounded For Loops

Compact only supports loops with compile-time known bounds:

```compact
// Iterate 0, 1, 2, ..., 9
for i in 0..10 {
    // loop body using i
}

// Using compile-time constant
const SIZE: Uint<32> = 5;
for i in 0..SIZE {
    // Bound must be known at compile time
}
```

### Loop with Generic Size

```compact
circuit sum<#N>(values: Vector<Field, #N>): Field {
    var total: Field = 0;
    for i in 0..#N {
        total = total + values[i];
    }
    return total;
}
```

### Why Bounded Loops?

ZK circuits must have fixed size determined at compile time. Unbounded loops would create variable-size circuits, which is not possible.

```compact
// INVALID: Runtime-determined bound
witness get_count(): Uint<32>;

circuit bad_example(): Field {
    const count = get_count();
    for i in 0..count {  // ERROR: bound not known at compile time
        // ...
    }
}
```

**Workaround**: Use a fixed maximum with early termination:

```compact
witness get_count(): Uint<32>;

circuit process_up_to_100(): Field {
    const count = get_count();
    var result: Field = 0;

    for i in 0..100 {
        if i < count {
            result = result + i;
        }
    }

    return result;
}
```

## Assertions

### Basic Assert

```compact
assert condition;
```

If `condition` is false, proof generation fails.

### Assert with Message

```compact
assert amount > 0, "Amount must be positive";
assert balance >= amount, "Insufficient balance";
```

Messages help debugging but are not included in the proof.

### Common Assert Patterns

```compact
// Bounds checking
circuit safe_divide(a: Uint<64>, b: Uint<64>): Uint<64> {
    assert b != 0, "Division by zero";
    return a / b;
}

// Authorization
circuit admin_only(caller: Bytes<32>, admin: Bytes<32>): [] {
    assert caller == admin, "Only admin can call";
}

// State validation
circuit withdraw(amount: Uint<64>): [] {
    const balance = get_balance();
    assert balance >= amount, "Insufficient balance";
    // Process withdrawal
}
```

### Assert vs If

Use `assert` when a condition must be true for the circuit to be valid:

```compact
// Assert: Proof fails if condition is false
assert user_authenticated, "Must be authenticated";

// If: Both branches are valid, choose based on condition
const message = if user_authenticated {
    "Welcome back!"
} else {
    "Please log in"
};
```

## Variable Bindings

### Immutable Bindings (const)

```compact
const x: Field = 10;
// x = 20;  // ERROR: cannot reassign const
```

### Mutable Bindings (var)

```compact
var total: Field = 0;
for i in 0..10 {
    total = total + i;  // OK: var can be reassigned
}
```

**Note**: Compact has no mutable references. All values are copied.

## Early Return

Circuits can return early:

```compact
circuit find_first_positive(values: Vector<Field, 10>): Field {
    for i in 0..10 {
        if values[i] > 0 {
            return values[i];  // Early return
        }
    }
    return 0;  // Default if none found
}
```

## Control Flow Best Practices

### Fail Fast

Put assertions early to catch invalid states:

```compact
export circuit transfer(from: Bytes<32>, to: Bytes<32>, amount: Uint<64>): [] {
    // Validate inputs first
    assert amount > 0, "Amount must be positive";
    assert from != to, "Cannot transfer to self";

    // Then process
    const balance = get_balance(from);
    assert balance >= amount, "Insufficient balance";

    // Execute transfer
}
```

### Avoid Deep Nesting

```compact
// Prefer flat conditions
if !condition1 {
    return error_result;
}
if !condition2 {
    return error_result;
}
// Process...

// Avoid deep nesting
if condition1 {
    if condition2 {
        if condition3 {
            // Hard to read
        }
    }
}
```

### Use Helper Circuits

```compact
circuit is_valid_transfer(from: Bytes<32>, to: Bytes<32>, amount: Uint<64>): Boolean {
    return amount > 0 && from != to && get_balance(from) >= amount;
}

export circuit transfer(from: Bytes<32>, to: Bytes<32>, amount: Uint<64>): [] {
    assert is_valid_transfer(from, to, amount), "Invalid transfer";
    // Execute
}
```
