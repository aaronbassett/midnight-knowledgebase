# Compact Error Messages

Complete reference for Compact compiler and runtime errors with explanations and solutions.

## Compilation Errors

### Disclosure Errors

#### `potential witness-value disclosure`

**Cause**: A value derived from a witness function is being used in a context that would make it public without explicit acknowledgment.

**Example of error**:
```compact
witness get_secret(): Field;

export circuit bad(): Field {
    const secret = get_secret();
    return secret;  // ERROR: potential witness-value disclosure
}
```

**Solutions**:

1. **Add explicit `disclose()`** if you intend to reveal the value:
```compact
export circuit reveal(): Field {
    const secret = get_secret();
    return disclose(secret);  // OK: explicit disclosure
}
```

2. **Use a commitment** if you want to store without revealing:
```compact
export circuit commit(): Bytes<32> {
    const secret = get_secret();
    return persistentCommit(secret);  // OK: commitment hides value
}
```

3. **Check the data flow** - the value might be tainted transitively:
```compact
witness get_a(): Field;

export circuit transitive(): Field {
    const a = get_a();
    const b = a + 1;       // b is tainted
    const c = b * 2;       // c is tainted
    return disclose(c);    // Must disclose the final result
}
```

**Common triggers**:
- Returning witness-derived value from `export circuit`
- Writing witness-derived value to ledger
- Using witness-derived value in comparison operations
- Passing witness-derived value to external contracts

---

### Type Errors

#### `type mismatch: expected X, found Y`

**Cause**: Incompatible types in an operation, assignment, or function call.

**Example**:
```compact
// ERROR: type mismatch: expected Uint<64>, found Field
const balance: Uint<64> = some_field_value;
```

**Solutions**:

1. **Use explicit type conversion**:
```compact
const balance: Uint<64> = some_field_value as Uint<64>;
```

2. **Ensure function signatures match**:
```compact
// If function expects Uint<64>, don't pass Field
circuit process(amount: Uint<64>): [] { ... }

// Call with correct type
process(100 as Uint<64>);  // or use a Uint<64> directly
```

**Common type conversion patterns**:
```compact
// Field to Uint (value must fit in target size)
const f: Field = 100;
const u: Uint<64> = f as Uint<64>;

// Uint to Field (always safe)
const u: Uint<64> = 100;
const f: Field = u as Field;

// Uint to larger Uint (always safe)
const small: Uint<32> = 100;
const large: Uint<64> = small as Uint<64>;
```

#### `cannot convert X to Y`

**Cause**: Attempting an impossible or unsupported type conversion.

**Examples**:
```compact
// ERROR: cannot convert Boolean to Field directly
const b: Boolean = true;
const f: Field = b as Field;  // ERROR
```

**Solution**: Use conditional expression:
```compact
const b: Boolean = true;
const f: Field = if b { 1 } else { 0 };  // OK
```

---

### Loop Errors

#### `unbounded loop` / `loop bounds must be compile-time constant`

**Cause**: Loop bounds depend on runtime values, which is not allowed in ZK circuits.

**Example of error**:
```compact
witness get_count(): Uint<64>;

export circuit bad_loop(): Field {
    const n = get_count();
    var sum: Field = 0;
    for i in 0..n {  // ERROR: n is not compile-time constant
        sum = sum + i as Field;
    }
    return sum;
}
```

**Solutions**:

1. **Use a compile-time constant**:
```compact
const MAX_ITERATIONS: Uint<64> = 100;

export circuit fixed_loop(): Field {
    var sum: Field = 0;
    for i in 0..100 {  // OK: literal is compile-time constant
        sum = sum + i as Field;
    }
    return sum;
}
```

2. **Use generic size parameter**:
```compact
circuit process<#N>(values: Vector<Field, #N>): Field {
    var sum: Field = 0;
    for i in 0..#N {  // OK: #N is compile-time constant
        sum = sum + values[i];
    }
    return sum;
}
```

3. **Use maximum bound with early exit**:
```compact
witness get_count(): Uint<8>;

export circuit bounded_process(): Field {
    const actual_count = disclose(get_count());
    var sum: Field = 0;
    for i in 0..256 {  // Max possible value for Uint<8>
        if (i as Uint<8>) < actual_count {
            sum = sum + i as Field;
        }
    }
    return sum;
}
```

---

### Syntax Errors

#### `expected X, found Y`

**Cause**: Syntax error in Compact code.

**Common mistakes**:

1. **Missing semicolons**:
```compact
// ERROR
const x: Field = 1
const y: Field = 2

// CORRECT
const x: Field = 1;
const y: Field = 2;
```

2. **Wrong enum syntax**:
```compact
// ERROR
const opt = Some(42);

// CORRECT
const opt: Option<Field> = Option::Some(42);
```

3. **Wrong struct instantiation**:
```compact
// ERROR
const p = Point(10, 20);

// CORRECT
const p: Point = Point { x: 10, y: 20 };
```

---

## Runtime Errors (Proof Generation)

### Assertion Errors

#### `circuit constraint failed` / `assert failed`

**Cause**: An `assert` statement evaluated to false during proof generation.

**Debugging steps**:

1. **Check the assertion condition**:
```compact
export circuit transfer(amount: Uint<64>): [] {
    const balance = get_balance();
    // If balance < amount, this will fail
    assert disclose(balance) >= amount, "Insufficient balance";
}
```

2. **Verify witness values**:
```typescript
// In TypeScript test
const mockWitness = {
    get_balance: () => BigInt(50)  // Too low for transfer of 100
};

// This will fail with "Insufficient balance"
await ctx.call('transfer', [BigInt(100)], mockWitness);
```

3. **Add logging in tests**:
```typescript
const balance = mockWitness.get_balance();
console.log(`Balance: ${balance}, Amount: ${amount}`);
// Now you can see why the assertion fails
```

### Arithmetic Errors

#### `overflow`

**Cause**: Arithmetic result exceeds the maximum value for the type.

**Example**:
```compact
const a: Uint<8> = 250;
const b: Uint<8> = 10;
const c: Uint<8> = a + b;  // ERROR: 260 > 255 (max for Uint<8>)
```

**Solutions**:

1. **Use larger bit width**:
```compact
const a: Uint<64> = 250;  // Plenty of room
const b: Uint<64> = 10;
const c: Uint<64> = a + b;  // OK: 260
```

2. **Check before operation**:
```compact
const a: Uint<8> = 250;
const b: Uint<8> = 5;
assert a <= 255 - b, "Would overflow";
const c: Uint<8> = a + b;
```

#### `division by zero`

**Cause**: Attempting to divide by zero.

**Solution**: Add explicit check:
```compact
export circuit safe_divide(a: Field, b: Field): Field {
    assert b != 0, "Division by zero";
    return a / b;
}
```

### Proof Generation Errors

#### `proof generation failed`

**Cause**: Typically means witness functions returned invalid or unexpected values.

**Debugging steps**:

1. **Check witness return types match declarations**:
```compact
witness get_hash(): Bytes<32>;  // Expects 32 bytes
```
```typescript
// ERROR: Wrong type
witnesses: {
    get_hash: () => "not a bytes32"  // Wrong!
}

// CORRECT
witnesses: {
    get_hash: () => new Uint8Array(32)  // Correct type
}
```

2. **Verify witness values are valid**:
```typescript
// If a witness should return a valid Merkle path
witnesses: {
    get_path: () => computeValidMerklePath(leaf)  // Must be valid
}
```

3. **Check for constraint violations in witness logic**:
```typescript
witnesses: {
    get_secret: () => {
        // Your witness logic might have bugs
        const secret = calculateSecret();
        if (!secret) throw new Error('Invalid secret');
        return secret;
    }
}
```

---

## Linker Errors

#### `undefined reference to X`

**Cause**: Using a function or type that hasn't been imported or defined.

**Solution**: Add the appropriate import:
```compact
// Before
const h = hash(value);  // ERROR: hash not defined

// After
import { hash } from "CompactStandardLibrary";
const h = hash(value);  // OK
```

#### `module not found: X`

**Cause**: Import path is incorrect or module doesn't exist.

**Solution**: Check the import path and `COMPACT_PATH` environment variable:
```bash
export COMPACT_PATH="/path/to/midnight/libs:/path/to/your/libs"
```

```compact
// Make sure the path is correct
import { someFunction } from "MyModule";  // MyModule.compact must exist
```

---

## Debugging Best Practices

### 1. Isolate the Problem

Create a minimal test case that reproduces the error:

```typescript
it('reproduces the bug', async () => {
    const ctx = await TestContext.create('contract.compact');
    const result = await ctx.call('problematic_circuit', [minimalInput]);
    // Now you can debug with minimal complexity
});
```

### 2. Check Types First

Most errors come from type mismatches:

```compact
// Add explicit types to catch errors early
const x: Field = get_value();
const y: Uint<64> = x as Uint<64>;  // Explicit conversion
```

### 3. Use Assertions for Debugging

```compact
export circuit debug_transfer(amount: Uint<64>): [] {
    const balance = get_balance();

    // Temporary debug assertions
    assert disclose(balance) > 0, "Balance should be positive";
    assert amount > 0, "Amount should be positive";
    assert disclose(balance) >= amount, "Insufficient funds";

    // ... rest of logic
}
```

### 4. Test Incrementally

Build up complex circuits step by step:

```typescript
// Test witness first
it('witness returns valid data', async () => {
    const secret = mockWitness.get_secret();
    expect(secret).toBeDefined();
    expect(typeof secret).toBe('bigint');
});

// Then test simple operation
it('commitment works', async () => {
    const result = await ctx.call('commit', [], mockWitness);
    expect(result.success).toBe(true);
});

// Finally test full flow
it('full transfer works', async () => {
    // ... complete test
});
```
