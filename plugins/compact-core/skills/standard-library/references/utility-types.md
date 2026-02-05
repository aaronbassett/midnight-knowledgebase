# Utility Types

Reference for `Maybe` and `Either` types from `CompactStandardLibrary`.

## Overview

| Type | Purpose | Variants |
|------|---------|----------|
| `Maybe<T>` | Optional value | `Some(T)`, `None` |
| `Either<L, R>` | Choice/result | `Left(L)`, `Right(R)` |

---

## Maybe<T>

Represents an optional value - either `Some(value)` or `None`.

### Import

```compact
import { Maybe } from "CompactStandardLibrary";
```

### Variants

```compact
Maybe::Some(value)  // Contains a value
Maybe::None         // No value
```

### Construction

```compact
// Create Some
const present: Maybe<Field> = Maybe::Some(42);

// Create None
const absent: Maybe<Field> = Maybe::None;
```

### Pattern Matching

Use `is` for pattern matching:

```compact
const maybe_value: Maybe<Field> = ...;

// Check variant and extract value
if maybe_value is Maybe::Some(v) {
    // v is the contained value
    const result = v + 1;
} else {
    // Handle None case
}
```

### Inline Pattern Matching

Use inline conditional for concise handling:

```compact
const value: Field = if maybe_value is Maybe::Some(v) { v } else { 0 };
```

### Common Patterns

#### Default Value

```compact
circuit get_or_default(opt: Maybe<Field>, default_val: Field): Field {
    return if opt is Maybe::Some(v) { v } else { default_val };
}
```

#### Assert Present

```compact
circuit unwrap(opt: Maybe<Field>): Field {
    assert opt is Maybe::Some(_), "Expected Some";
    if opt is Maybe::Some(v) {
        return v;
    }
    // Unreachable, but needed for compiler
    return 0;
}
```

#### Map Transform

```compact
circuit map_maybe(opt: Maybe<Field>, multiplier: Field): Maybe<Field> {
    if opt is Maybe::Some(v) {
        return Maybe::Some(v * multiplier);
    }
    return Maybe::None;
}
```

#### Chained Lookups

```compact
ledger users: Map<Bytes<32>, User>;
ledger balances: Map<Bytes<32>, Uint<64>>;

export circuit get_user_balance(user_id: Bytes<32>): Uint<64> {
    const user_opt = users.lookup(user_id);

    if user_opt is Maybe::Some(user) {
        const balance_opt = balances.lookup(user.wallet);
        return if balance_opt is Maybe::Some(b) { b } else { 0 };
    }

    return 0;
}
```

### Where Maybe is Returned

| ADT/Function | Returns Maybe |
|--------------|---------------|
| `Map.lookup(key)` | `Maybe<V>` |
| `List.nth(index)` | `Maybe<T>` |
| Many stdlib functions | `Maybe<T>` |

---

## Either<L, R>

Represents a value that is one of two possible types - either `Left(L)` or `Right(R)`.

### Import

```compact
import { Either } from "CompactStandardLibrary";
```

### Variants

```compact
Either::Left(value)   // Left variant
Either::Right(value)  // Right variant
```

### Construction

```compact
// Create Left
const left_val: Either<Field, Boolean> = Either::Left(42);

// Create Right
const right_val: Either<Field, Boolean> = Either::Right(true);
```

### Pattern Matching

```compact
const result: Either<Field, Bytes<32>> = ...;

if result is Either::Left(error_code) {
    // Handle error case
    assert false, "Error occurred";
} else if result is Either::Right(data) {
    // Handle success case
    // Use data...
}
```

### Common Patterns

#### Result Type (Error Handling)

Use `Either<Error, T>` for operations that can fail:

```compact
struct Error {
    code: Field,
    // message stored elsewhere
}

circuit divide(a: Field, b: Field): Either<Error, Field> {
    if b == 0 {
        return Either::Left(Error { code: 1 });  // Division by zero
    }
    return Either::Right(a / b);
}

export circuit safe_divide(a: Field, b: Field): Field {
    const result = divide(a, b);

    if result is Either::Right(value) {
        return value;
    }

    // Handle error
    return 0;
}
```

#### Choice Between Types

Use `Either<A, B>` when a value can be one of two types:

```compact
struct User {
    id: Bytes<32>,
    name_hash: Bytes<32>
}

struct Organization {
    id: Bytes<32>,
    member_count: Uint<64>
}

// Entity can be either a User or an Organization
ledger entities: Map<Bytes<32>, Either<User, Organization>>;

export circuit get_entity_type(id: Bytes<32>): Field {
    const entity_opt = entities.lookup(id);

    if entity_opt is Maybe::Some(entity) {
        if entity is Either::Left(_) {
            return 1;  // User
        } else {
            return 2;  // Organization
        }
    }

    return 0;  // Not found
}
```

#### Validation Result

```compact
struct ValidationError {
    field: Field,
    error_type: Field
}

circuit validate_input(value: Field): Either<ValidationError, Field> {
    if value == 0 {
        return Either::Left(ValidationError {
            field: 1,
            error_type: 1  // Cannot be zero
        });
    }

    if value > 1000 {
        return Either::Left(ValidationError {
            field: 1,
            error_type: 2  // Too large
        });
    }

    return Either::Right(value);
}
```

---

## Combining Maybe and Either

### Optional Result

```compact
// Operation that may not exist AND may fail
circuit lookup_and_validate(key: Bytes<32>): Maybe<Either<Error, Data>> {
    const data_opt = storage.lookup(key);

    if data_opt is Maybe::None {
        return Maybe::None;  // Key not found
    }

    if data_opt is Maybe::Some(raw_data) {
        const validation = validate(raw_data);
        return Maybe::Some(validation);  // Either success or error
    }

    return Maybe::None;
}
```

### Nested Pattern Matching

```compact
export circuit process(key: Bytes<32>): Field {
    const result = lookup_and_validate(key);

    if result is Maybe::None {
        return 0;  // Not found
    }

    if result is Maybe::Some(either_val) {
        if either_val is Either::Left(error) {
            return error.code;  // Return error code
        }

        if either_val is Either::Right(data) {
            return data.value;  // Return data
        }
    }

    return 0;
}
```

---

## Best Practices

### Use Maybe for Optional Values

```compact
// Good: Explicit optional handling
const user_opt: Maybe<User> = users.lookup(id);
if user_opt is Maybe::Some(user) { ... }

// Bad: Using sentinel values
const user: User = users.get_or_default(id, EMPTY_USER);
if user.id != EMPTY_ID { ... }  // Error-prone
```

### Use Either for Error Handling

```compact
// Good: Explicit error type
circuit process(): Either<Error, Result> { ... }

// Bad: Using magic values for errors
circuit process(): Field {
    // Returns -1 for error, positive for success
    // Error-prone and unclear
}
```

### Check Before Accessing

```compact
// Good: Always check Maybe before accessing
if opt is Maybe::Some(v) {
    use(v);
}

// Risky: Assuming Some without checking
// No direct unwrap in Compact - you must pattern match
```
