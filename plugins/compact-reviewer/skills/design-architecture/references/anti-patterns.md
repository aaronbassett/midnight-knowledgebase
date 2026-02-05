# Anti-Patterns in Compact Contracts

Patterns to avoid when designing Compact smart contracts.

## God Circuit Anti-Pattern

**Problem**: Single circuit handles too many responsibilities.

```compact
// ❌ God circuit - does everything
export circuit do_everything(
    action_type: Uint<8>,
    arg1: Field,
    arg2: Field,
    arg3: Field,
    arg4: Field
): Field {
    if action_type == 0 {
        // Deposit logic
    }
    if action_type == 1 {
        // Withdraw logic
    }
    if action_type == 2 {
        // Transfer logic
    }
    if action_type == 3 {
        // Admin logic
    }
    if action_type == 4 {
        // Query logic
    }
    // ... more actions
    return result;
}
```

**Issues**:
- Hard to understand
- Hard to test
- Hard to maintain
- All code paths evaluated (constraint waste)

**Solution**:
```compact
// ✅ Separate circuits
export circuit deposit(amount: Uint<64>): [] { }
export circuit withdraw(amount: Uint<64>): [] { }
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] { }
export circuit admin_action(): [] { }
export circuit get_balance(): Uint<64> { }
```

---

## Magic Numbers Anti-Pattern

**Problem**: Hard-coded values without explanation.

```compact
// ❌ Magic numbers
export circuit process(amount: Uint<64>): [] {
    assert amount <= 1000000000;  // What is this limit?
    const fee = amount * 3 / 100;  // Why 3%?
    assert currentBlockHeight() > 1234567;  // What's special about this block?
}
```

**Issues**:
- Unclear intent
- Hard to maintain
- Easy to introduce bugs when changing

**Solution**:
```compact
// ✅ Named constants
const MAX_TRANSFER_AMOUNT: Uint<64> = 1000000000;  // 1 billion tokens
const FEE_PERCENT: Uint<64> = 3;  // 3% fee
const CONTRACT_ACTIVATION_BLOCK: Uint<64> = 1234567;

export circuit process(amount: Uint<64>): [] {
    assert amount <= MAX_TRANSFER_AMOUNT;
    const fee = amount * FEE_PERCENT / 100;
    assert currentBlockHeight() > CONTRACT_ACTIVATION_BLOCK;
}
```

---

## Excessive State Anti-Pattern

**Problem**: Too much state that's rarely used or duplicated.

```compact
// ❌ Duplicated/excessive state
ledger balances: Map<Bytes<32>, Uint<64>>;
ledger total_balance: Counter;  // Redundant - can compute from balances
ledger last_transfer_amount: Cell<Uint<64>>;  // Why store this?
ledger last_transfer_time: Cell<Uint<64>>;
ledger last_transfer_from: Cell<Bytes<32>>;
ledger last_transfer_to: Cell<Bytes<32>>;
ledger transfer_count: Counter;
ledger user_transfer_counts: Map<Bytes<32>, Uint<64>>;  // Computed from logs
```

**Issues**:
- State synchronization bugs
- Wasted storage
- Inconsistency risks

**Solution**:
```compact
// ✅ Minimal state
ledger balances: Map<Bytes<32>, Uint<64>>;
ledger events: Vector<TransferEvent, 10000>;  // Event log for history
ledger event_count: Counter;

// Compute totals off-chain from events
```

---

## Deeply Nested Logic Anti-Pattern

**Problem**: Multiple levels of nesting make code hard to follow.

```compact
// ❌ Deep nesting
export circuit process(flag1: Boolean, flag2: Boolean, flag3: Boolean): [] {
    if flag1 {
        if flag2 {
            if flag3 {
                // Do something
            } else {
                if condition4 {
                    // Do something else
                } else {
                    // Yet another thing
                }
            }
        } else {
            // More nested logic
        }
    }
}
```

**Issues**:
- Hard to read
- Easy to miss cases
- Hard to test all paths

**Solution**:
```compact
// ✅ Early returns and helper circuits
circuit handle_case_a(): [] { }
circuit handle_case_b(): [] { }
circuit handle_case_c(): [] { }

export circuit process(flag1: Boolean, flag2: Boolean, flag3: Boolean): [] {
    if !flag1 {
        return;  // Early exit
    }

    if flag2 && flag3 {
        handle_case_a();
        return;
    }

    if flag2 && !flag3 {
        handle_case_b();
        return;
    }

    handle_case_c();
}
```

---

## Copy-Paste Code Anti-Pattern

**Problem**: Duplicated code across circuits.

```compact
// ❌ Duplicated authorization in every circuit
export circuit action_a(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
    // Action A logic
}

export circuit action_b(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
    // Action B logic
}

export circuit action_c(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
    // Action C logic
}
```

**Issues**:
- Inconsistency risk
- Maintenance burden
- More code = more bugs

**Solution**:
```compact
// ✅ Extracted helper circuit
circuit require_owner(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
}

export circuit action_a(): [] {
    require_owner();
    // Action A logic
}

export circuit action_b(): [] {
    require_owner();
    // Action B logic
}

export circuit action_c(): [] {
    require_owner();
    // Action C logic
}
```

---

## Unclear Naming Anti-Pattern

**Problem**: Names don't convey meaning.

```compact
// ❌ Unclear names
ledger d: Map<Bytes<32>, Uint<64>>;
ledger x: Counter;
ledger t: Cell<Uint<64>>;

witness f(): Bytes<32>;

export circuit p(a: Bytes<32>, n: Uint<64>): [] {
    const b = f();
    d[b].decrement(n);
    d[a].increment(n);
    x.increment(1);
}
```

**Issues**:
- Impossible to understand
- Can't review for correctness
- Maintenance nightmare

**Solution**:
```compact
// ✅ Descriptive names
ledger balances: Map<Bytes<32>, Uint<64>>;
ledger transfer_count: Counter;
ledger last_update_block: Cell<Uint<64>>;

witness get_sender_secret(): Bytes<32>;

export circuit transfer(recipient: Bytes<32>, amount: Uint<64>): [] {
    const sender = hash(get_sender_secret());
    balances[sender].decrement(amount);
    balances[recipient].increment(amount);
    transfer_count.increment(1);
}
```

---

## Missing Validation Anti-Pattern

**Problem**: Inputs not validated before use.

```compact
// ❌ No validation
export circuit set_config(fee: Uint<64>, max_transfer: Uint<64>): [] {
    require_admin();
    config_fee.write(fee);  // Could be 100%?
    config_max.write(max_transfer);  // Could be 0?
}

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // No check if 'to' is valid
    // No check if 'amount' is reasonable
    balances[from].decrement(amount);
    balances[to].increment(amount);
}
```

**Issues**:
- Invalid state possible
- Attacks via edge cases
- Hard to debug

**Solution**:
```compact
// ✅ Input validation
const MAX_FEE_PERCENT: Uint<64> = 10;  // Max 10% fee
const MIN_TRANSFER: Uint<64> = 1;

export circuit set_config(fee: Uint<64>, max_transfer: Uint<64>): [] {
    require_admin();
    assert fee <= MAX_FEE_PERCENT;
    assert max_transfer > 0;
    config_fee.write(fee);
    config_max.write(max_transfer);
}

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    assert to != ZERO_ADDRESS;
    assert amount >= MIN_TRANSFER;
    assert amount <= config_max.read();
    // ... transfer logic
}
```

---

## Premature Optimization Anti-Pattern

**Problem**: Optimizing before it's needed, sacrificing clarity.

```compact
// ❌ Obscure optimization
export circuit compute(input: Uint<64>): Uint<64> {
    // "Optimized" bitwise operations
    return ((input & 0xFF) << 8) | ((input >> 8) & 0xFF) |
           ((input & 0xFF00) >> 8) | ((input & 0xFF0000) << 8);
}
```

**Issues**:
- Hard to understand intent
- Hard to verify correctness
- May not actually be faster

**Solution**:
```compact
// ✅ Clear code, optimize later if needed
export circuit compute(input: Uint<64>): Uint<64> {
    // Extract bytes and swap
    const byte0 = (input / 1) % 256;
    const byte1 = (input / 256) % 256;
    const byte2 = (input / 65536) % 256;
    const byte3 = (input / 16777216) % 256;

    // Rebuild swapped
    return byte1 + byte0 * 256 + byte3 * 65536 + byte2 * 16777216;
}
```

---

## Summary

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| God Circuit | Too many responsibilities | Separate circuits |
| Magic Numbers | Unclear values | Named constants |
| Excessive State | Too much stored | Minimal state |
| Deep Nesting | Hard to follow | Early returns, helpers |
| Copy-Paste | Duplicated code | Extract helper circuits |
| Unclear Naming | Meaningless names | Descriptive names |
| Missing Validation | Unchecked inputs | Validate everything |
| Premature Optimization | Obscure code | Clear first, optimize later |
