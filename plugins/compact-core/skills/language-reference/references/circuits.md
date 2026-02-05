# Circuits and Witnesses

Reference for circuit definitions and witness declarations in Compact.

## Circuit Basics

Circuits are the core computation units in Compact. They define ZK-provable logic.

### Circuit Syntax

```compact
circuit name(param1: Type1, param2: Type2): ReturnType {
    // body
    return value;
}
```

### Public vs Private Circuits

```compact
// Public circuit - callable from TypeScript
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // Implementation
}

// Private circuit - only callable from other circuits
circuit validate_amount(amount: Uint<64>): Boolean {
    return amount > 0 && amount <= 1000000;
}
```

### Return Types

```compact
// Single return value
circuit square(x: Field): Field {
    return x * x;
}

// Multiple return values (tuple)
circuit divmod(a: Uint<64>, b: Uint<64>): (Uint<64>, Uint<64>) {
    return (a / b, a % b);
}

// No return value (side effects only)
export circuit store_data(data: Field): [] {
    // Modify ledger state
}
```

## Witness Functions

Witnesses provide private input from the TypeScript runtime.

### Witness Declaration

```compact
// Declaration in Compact (no body)
witness get_private_key(): Bytes<32>;

witness get_user_balance(user: Bytes<32>): Uint<64>;

witness get_merkle_path(index: Uint<32>): Vector<Bytes<32>, 20>;
```

### Witness Implementation (TypeScript)

The corresponding TypeScript implementation:

```typescript
// In witness implementation file
const witnesses = {
    get_private_key: () => {
        // Return the private key as Uint8Array
        return privateKey;
    },

    get_user_balance: (user: Uint8Array) => {
        // Look up balance from database
        return balances.get(user) ?? 0n;
    },

    get_merkle_path: (index: bigint) => {
        // Compute Merkle proof
        return merkleTree.getPath(Number(index));
    }
};
```

### Witness Value Protection

Witness values are protected by the compiler. They cannot flow to public outputs without explicit disclosure.

```compact
witness get_secret(): Field;

export circuit bad_example(): Field {
    const secret = get_secret();
    return secret;  // ERROR: potential witness-value disclosure
}

export circuit good_example(): Field {
    const secret = get_secret();
    return disclose(secret);  // OK: explicitly disclosed
}
```

## Circuit Patterns

### Helper Circuits

```compact
// Private helper for reuse
circuit compute_hash(a: Field, b: Field): Bytes<32> {
    return persistentHash(a, b);
}

// Public circuit using helper
export circuit verify(a: Field, b: Field, expected: Bytes<32>): Boolean {
    const actual = compute_hash(a, b);
    return actual == expected;
}
```

### Generic Circuits

```compact
// Generic over type
circuit first<T>(pair: Pair<T, T>): T {
    return pair.first;
}

// Generic over size
circuit sum_array<#N>(values: Vector<Field, #N>): Field {
    var total: Field = 0;
    for i in 0..#N {
        total = total + values[i];
    }
    return total;
}

// Both type and size parameters
circuit map<#N, T, U>(arr: Vector<T, #N>, f: circuit(T): U): Vector<U, #N> {
    // Transform each element
}
```

### State-Modifying Circuits

```compact
ledger counter: Counter;

export circuit increment(): Uint<64> {
    counter.increment(1);
    return counter.value();
}
```

## Circuit Calling Conventions

### Internal Calls

```compact
circuit helper(): Field {
    return 42;
}

export circuit main(): Field {
    const x = helper();  // Direct call
    return x * 2;
}
```

### Cross-Contract Calls

Cross-contract calls are reserved for future Midnight versions. Currently, contracts cannot directly call other contracts.

```compact
// NOT YET IMPLEMENTED
// external contract OtherContract {
//     circuit other_function(): Field;
// }
```

## Best Practices

### Keep Circuits Focused

```compact
// Good: Single responsibility
circuit validate_signature(msg: Bytes<32>, sig: Bytes<64>, pub_key: Bytes<32>): Boolean {
    // Validation logic only
}

circuit process_transfer(from: Bytes<32>, to: Bytes<32>, amount: Uint<64>): [] {
    // Transfer logic only
}

// Avoid: Monolithic circuits with multiple concerns
```

### Use Descriptive Names

```compact
// Good
circuit verify_merkle_membership(leaf: Bytes<32>, root: Bytes<32>, path: Vector<Bytes<32>, 20>): Boolean

// Avoid
circuit check(x: Bytes<32>, y: Bytes<32>, z: Vector<Bytes<32>, 20>): Boolean
```

### Document Complex Circuits

```compact
/// Verifies a user's eligibility for an action based on their
/// Merkle tree membership and balance threshold.
///
/// Parameters:
/// - user_id: The user's unique identifier
/// - merkle_root: Current root of the membership tree
/// - min_balance: Minimum required balance
///
/// Returns: true if user is eligible
export circuit verify_eligibility(
    user_id: Bytes<32>,
    merkle_root: Bytes<32>,
    min_balance: Uint<64>
): Boolean {
    // Implementation
}
```
