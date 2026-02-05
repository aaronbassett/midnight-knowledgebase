# Common Mistakes in Compact

Frequently seen mistakes and how to avoid them.

## Missing Pragma

**Mistake**: Omitting the language version pragma.

```compact
// ❌ No pragma
export circuit example(): [] {
    // ...
}

// ✅ With pragma
pragma language_version >= 0.18.0;

export circuit example(): [] {
    // ...
}
```

**Why it matters**: Pragma ensures compatibility and makes version requirements explicit.

---

## Manual Counter Management

**Mistake**: Using `Cell<Uint>` instead of `Counter` ADT.

```compact
// ❌ Manual counter
ledger count: Cell<Uint<64>>;

export circuit increment(): [] {
    const current = count.read();
    count.write(current + 1);
}

// ✅ Using Counter ADT
ledger count: Counter;

export circuit increment(): [] {
    count.increment(1);
}
```

**Why it matters**: Counter ADT provides atomic operations and clearer intent.

---

## Inline Authorization Checks

**Mistake**: Repeating authorization logic in every circuit.

```compact
// ❌ Repeated inline checks
export circuit action_a(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
    // ...
}

export circuit action_b(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
    // ...
}

// ✅ Extracted helper
circuit require_owner(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
}

export circuit action_a(): [] {
    require_owner();
    // ...
}

export circuit action_b(): [] {
    require_owner();
    // ...
}
```

**Why it matters**: DRY principle, easier maintenance, fewer bugs.

---

## Magic Numbers

**Mistake**: Using literal values without explanation.

```compact
// ❌ Magic numbers
export circuit process(amount: Uint<64>): [] {
    assert amount <= 1000000;
    const fee = amount * 3 / 100;
    assert currentBlockHeight() > 5000000;
}

// ✅ Named constants
const MAX_AMOUNT: Uint<64> = 1000000;
const FEE_PERCENT: Uint<64> = 3;
const CONTRACT_START_BLOCK: Uint<64> = 5000000;

export circuit process(amount: Uint<64>): [] {
    assert amount <= MAX_AMOUNT;
    const fee = amount * FEE_PERCENT / 100;
    assert currentBlockHeight() > CONTRACT_START_BLOCK;
}
```

**Why it matters**: Self-documenting code, easier to change, fewer errors.

---

## Forgotten Disclosure

**Mistake**: Returning witness-derived values without `disclose()`.

```compact
// ❌ Missing disclosure (may cause compilation error)
export circuit get_data(): Field {
    return compute_private_value();
}

// ✅ Explicit disclosure
export circuit get_data(): Field {
    return disclose(compute_private_value());
}
```

**Why it matters**: Compiler requires explicit disclosure decisions.

---

## Unbounded Witness Types

**Mistake**: Using small types for security-critical witnesses.

```compact
// ❌ Small type - brute-forceable
witness get_pin(): Uint<16>;  // Only 65,536 values

export circuit auth(): [] {
    const pin = get_pin();
    assert hash(pin) == stored_hash.read();  // Weak
}

// ✅ Large type or mixed with secret
witness get_pin(): Uint<16>;
witness get_device_secret(): Bytes<32>;

export circuit auth(): [] {
    const pin = get_pin();
    const secret = get_device_secret();
    // Combine with high-entropy secret
    assert hash(secret, pin) == stored_hash.read();
}
```

**Why it matters**: Low-entropy values can be brute-forced offline.

---

## Not Checking Zero Values

**Mistake**: Assuming non-zero values without verification.

```compact
// ❌ Division without zero check
export circuit divide(a: Uint<64>, b: Uint<64>): Uint<64> {
    return a / b;  // Fails if b == 0
}

// ✅ With zero check
export circuit divide(a: Uint<64>, b: Uint<64>): Uint<64> {
    assert b > 0;
    return a / b;
}
```

**Why it matters**: Division by zero causes circuit failure.

---

## Wrong Type for Maps

**Mistake**: Using wrong key size or type for maps.

```compact
// ❌ Address is 20 bytes, but using 32
ledger balances: Map<Bytes<32>, Uint<64>>;

export circuit get_balance(addr: Bytes<20>): Uint<64> {
    // Type mismatch
    return balances.lookup(addr);  // Error
}

// ✅ Consistent types
ledger balances: Map<Bytes<32>, Uint<64>>;

export circuit get_balance(addr: Bytes<20>): Uint<64> {
    const key = hash(addr);  // Convert to Bytes<32>
    return disclose(balances.lookup(key));
}
```

**Why it matters**: Type safety prevents runtime errors.

---

## Ignoring Initialization

**Mistake**: Using ledger values without initialization check.

```compact
// ❌ May use uninitialized value
ledger config: Cell<Uint<64>>;

export circuit process(): [] {
    const cfg = config.read();  // 0 if not initialized
    const result = 100 / cfg;  // Division by zero!
}

// ✅ With initialization check
ledger initialized: Cell<Boolean>;
ledger config: Cell<Uint<64>>;

export circuit process(): [] {
    assert initialized.read();
    const cfg = config.read();
    const result = 100 / cfg;
}
```

**Why it matters**: Ledger starts with default values (0, false, etc.).

---

## Exposing Internal Helpers

**Mistake**: Marking internal helpers as `export`.

```compact
// ❌ Internal logic exposed
export circuit verify_signature(sig: Signature): Boolean {
    // Internal verification - should not be public
    return check_sig(sig);
}

// ✅ Keep internal circuits private
circuit verify_signature(sig: Signature): Boolean {
    return check_sig(sig);
}

export circuit submit(data: Field, sig: Signature): [] {
    assert verify_signature(sig);
    // Process data
}
```

**Why it matters**: Reduces attack surface, clearer API.

---

## Comparing Different Types

**Mistake**: Comparing values of different sizes.

```compact
// ❌ Different size comparison
const small: Uint<8> = 100;
const large: Uint<64> = 100;

if small == large {  // May not work as expected
    // ...
}

// ✅ Explicit conversion
if (small as Uint<64>) == large {
    // ...
}
```

**Why it matters**: Type safety and correctness.

---

## Empty Catch-All Branches

**Mistake**: Having empty else branches that hide bugs.

```compact
// ❌ Silent else branch
export circuit process(action: Uint<8>): [] {
    if action == 0 {
        do_action_0();
    } else if action == 1 {
        do_action_1();
    } else {
        // ❌ What happens for action == 2, 3, etc.?
        // Silent failure
    }
}

// ✅ Explicit handling
export circuit process(action: Uint<8>): [] {
    if action == 0 {
        do_action_0();
    } else if action == 1 {
        do_action_1();
    } else {
        assert false;  // ✅ Explicit: no other actions allowed
    }
}
```

**Why it matters**: Makes assumptions explicit, catches unexpected inputs.

---

## Summary

| Mistake | Impact | Fix |
|---------|--------|-----|
| Missing pragma | Compatibility issues | Add pragma |
| Manual counter | Potential bugs | Use Counter ADT |
| Inline auth | Code duplication | Extract helper |
| Magic numbers | Unclear intent | Named constants |
| Forgotten disclosure | Compilation error | Add disclose() |
| Small witness types | Security vulnerability | Use larger types |
| No zero check | Runtime failure | Assert non-zero |
| Wrong map types | Type errors | Match types |
| Uninitialized state | Unexpected behavior | Check init |
| Exposed helpers | Large attack surface | Keep private |
| Type comparison | Incorrect logic | Explicit cast |
| Empty else | Silent bugs | Assert false |
