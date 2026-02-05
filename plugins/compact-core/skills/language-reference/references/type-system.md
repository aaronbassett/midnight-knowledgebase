# Compact Type System

Complete reference for all 11 types in the Compact language.

## Primitive Types

### Field

The native field element type for zero-knowledge circuits. Approximately 254 bits.

```compact
const f: Field = 42;
const g: Field = f + 1;
const h: Field = f * g;
```

**Operations**: `+`, `-`, `*`, `/`, `==`, `!=`

**Constraints**:
- Division by zero causes proof failure
- Field arithmetic wraps at the field modulus

### Boolean

True or false values.

```compact
const yes: Boolean = true;
const no: Boolean = false;
const and_result: Boolean = yes && no;
const or_result: Boolean = yes || no;
const not_result: Boolean = !yes;
```

**Operations**: `&&`, `||`, `!`, `==`, `!=`

### Uint<N>

Unsigned integers with bit width N (1 ≤ N ≤ 248).

```compact
const small: Uint<8> = 255;      // Max: 2^8 - 1
const medium: Uint<64> = 1000;   // Max: 2^64 - 1
const large: Uint<128> = 0;      // Max: 2^128 - 1
```

**Operations**: `+`, `-`, `*`, `/`, `%`, `<`, `>`, `<=`, `>=`, `==`, `!=`

**Constraints**:
- Maximum bit width is 248 (larger values must use Field)
- Overflow causes proof failure
- Division by zero causes proof failure

**Conversions**:
```compact
// Uint to Field
const u: Uint<64> = 100;
const f: Field = u as Field;

// Field to Uint (only if value fits)
const f2: Field = 50;
const u2: Uint<64> = f2 as Uint<64>;
```

## Composite Types

### Bytes<N>

Fixed-size byte arrays (N is the number of bytes).

```compact
const hash: Bytes<32> = 0x0000...0000;  // 32-byte hash
const addr: Bytes<20> = 0x1234...5678;  // 20-byte address
```

**Common sizes**:
- `Bytes<32>` - Hashes, keys
- `Bytes<20>` - Addresses
- `Bytes<64>` - Signatures

**Operations**:
- Indexing: `bytes[i]` returns `Uint<8>`
- Comparison: `==`, `!=`

### struct

Named record types with fields.

```compact
struct Point {
    x: Field,
    y: Field
}

struct Transfer {
    from: Bytes<32>,
    to: Bytes<32>,
    amount: Uint<64>
}

// Construction
const p: Point = Point { x: 10, y: 20 };

// Field access
const x_val: Field = p.x;
```

**Generic structs**:
```compact
struct Pair<A, B> {
    first: A,
    second: B
}

const pair: Pair<Field, Boolean> = Pair { first: 42, second: true };
```

### enum

Tagged union types (sum types).

```compact
enum Option<T> {
    Some(T),
    None
}

enum Result<T, E> {
    Ok(T),
    Err(E)
}

// Construction
const some_val: Option<Field> = Option::Some(42);
const none_val: Option<Field> = Option::None;

// Pattern matching with if
const result = if some_val is Option::Some(v) {
    v
} else {
    0
};
```

### Vector<T, N>

Fixed-size arrays of type T with length N.

```compact
const nums: Vector<Field, 3> = [1, 2, 3];
const zeros: Vector<Uint<8>, 10> = [0; 10];  // All zeros

// Indexing
const first: Field = nums[0];

// Length (compile-time constant)
// N is known at compile time
```

**Constraints**:
- Size N must be a compile-time constant
- Index must be within bounds (0 to N-1)

## Special Types

### Opaque<'string'>

Represents UTF-8 string data from TypeScript. Cannot be constructed or inspected in Compact.

```compact
witness get_username(): Opaque<'string'>;

export circuit greet(): [] {
    const name = get_username();
    // name can be stored, passed, but not read
}
```

### Opaque<'Uint8Array'>

Represents arbitrary binary data from TypeScript.

```compact
witness get_document(): Opaque<'Uint8Array'>;

export circuit store_document(): [] {
    const doc = get_document();
    // doc can be hashed, stored, but not inspected
}
```

## Type Conversions

| From | To | Method |
|------|-----|--------|
| `Uint<N>` | `Field` | `value as Field` |
| `Field` | `Uint<N>` | `value as Uint<N>` (fails if too large) |
| `Uint<N>` | `Uint<M>` | `value as Uint<M>` (N ≤ M) |
| `Boolean` | `Field` | `if b { 1 } else { 0 }` |

## Generic Parameters

### Size Parameters (`#N`)

Compile-time constant integers for sizes:

```compact
circuit process<#N>(data: Vector<Field, #N>): Field {
    // Works with any fixed-size vector
    return data[0];
}
```

### Type Parameters (`T`)

Generic type parameters:

```compact
circuit identity<T>(x: T): T {
    return x;
}

circuit swap<A, B>(pair: Pair<A, B>): Pair<B, A> {
    return Pair { first: pair.second, second: pair.first };
}
```

### Combined Parameters

```compact
circuit sum<#N>(values: Vector<Field, #N>): Field {
    var total: Field = 0;
    for i in 0..#N {
        total = total + values[i];
    }
    return total;
}
```
