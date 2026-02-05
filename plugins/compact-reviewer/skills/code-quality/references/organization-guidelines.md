# Code Organization Guidelines

Best practices for organizing Compact smart contract code.

## File Structure

### Recommended Order

```compact
// 1. Pragma
pragma language_version >= 0.18.0;

// 2. Constants (grouped by purpose)
// --- Configuration ---
const MAX_USERS: Uint<64> = 1000;
const FEE_PERCENT: Uint<8> = 3;

// --- Magic Values ---
const ZERO_ADDRESS: Bytes<32> = 0x00...;

// 3. Type Definitions
struct UserData { ... }
enum Status { ... }

// 4. Ledger Declarations (grouped by purpose)
// --- Core State ---
ledger balances: Map<Bytes<32>, Uint<64>>;
ledger users: Map<Bytes<32>, UserData>;

// --- Admin State ---
ledger owner: Cell<Bytes<32>>;
ledger paused: Cell<Boolean>;

// 5. Witness Declarations
witness get_caller_secret(): Bytes<32>;
witness get_merkle_proof(): MerkleProof<20>;

// 6. Internal Helper Circuits
circuit get_caller(): Bytes<32> { ... }
circuit require_owner(): [] { ... }

// 7. Public Interface (grouped by function)
// --- Admin Functions ---
export circuit initialize(...): [] { ... }
export circuit set_owner(...): [] { ... }

// --- User Functions ---
export circuit deposit(...): [] { ... }
export circuit withdraw(...): [] { ... }

// --- View Functions ---
export circuit get_balance(): Uint<64> { ... }
```

---

## Section Dividers

Use comments to separate logical sections:

```compact
// ============================================================
// CONSTANTS
// ============================================================

const MAX_SUPPLY: Uint<64> = 1000000000;

// ============================================================
// STATE
// ============================================================

ledger balances: Map<Bytes<32>, Uint<64>>;

// ============================================================
// INTERNAL HELPERS
// ============================================================

circuit require_owner(): [] { ... }

// ============================================================
// PUBLIC INTERFACE
// ============================================================

export circuit transfer(...): [] { ... }
```

---

## Circuit Size Guidelines

### Target Size

| Size | Assessment | Action |
|------|------------|--------|
| < 20 lines | ✅ Good | Maintain |
| 20-50 lines | ⚠️ Acceptable | Consider splitting |
| 50-100 lines | ❌ Large | Split into helpers |
| > 100 lines | ❌ Too large | Must refactor |

### Splitting Large Circuits

```compact
// ❌ Too large
export circuit complex_operation(...): [] {
    // 100+ lines of:
    // - Authorization
    // - Validation
    // - Business logic
    // - State updates
    // - Event emission
}

// ✅ Split into focused pieces
circuit authorize_operation(): [] { ... }
circuit validate_input(input: Input): [] { ... }
circuit process_logic(input: Input): Result { ... }
circuit update_state(result: Result): [] { ... }
circuit emit_event(result: Result): [] { ... }

export circuit complex_operation(input: Input): [] {
    authorize_operation();
    validate_input(input);
    const result = process_logic(input);
    update_state(result);
    emit_event(result);
}
```

---

## Grouping Related Items

### By Feature

```compact
// ============================================================
// USER MANAGEMENT
// ============================================================

ledger users: Map<Bytes<32>, UserData>;
ledger user_count: Counter;

circuit get_user(addr: Bytes<32>): UserData { ... }
circuit create_user_internal(data: UserData): [] { ... }

export circuit register_user(...): [] { ... }
export circuit update_user(...): [] { ... }

// ============================================================
// TOKEN OPERATIONS
// ============================================================

ledger balances: Map<Bytes<32>, Uint<64>>;
ledger total_supply: Cell<Uint<64>>;

circuit check_balance(addr: Bytes<32>, amount: Uint<64>): [] { ... }

export circuit transfer(...): [] { ... }
export circuit get_balance(): Uint<64> { ... }
```

### By Access Level

```compact
// ============================================================
// ADMIN FUNCTIONS
// ============================================================

export circuit initialize(...): [] { ... }
export circuit pause(): [] { ... }
export circuit unpause(): [] { ... }
export circuit set_fee(fee: Uint<8>): [] { ... }

// ============================================================
// USER FUNCTIONS
// ============================================================

export circuit deposit(...): [] { ... }
export circuit withdraw(...): [] { ... }
export circuit transfer(...): [] { ... }

// ============================================================
// VIEW FUNCTIONS
// ============================================================

export circuit get_balance(): Uint<64> { ... }
export circuit get_status(): Status { ... }
export circuit is_paused(): Boolean { ... }
```

---

## Helper Circuit Placement

### Near Point of Use

```compact
// ✅ Helper immediately before its user
circuit validate_transfer(from: Bytes<32>, to: Bytes<32>, amount: Uint<64>): [] {
    assert from != to;
    assert amount > 0;
    assert balances.lookup(from) >= amount;
}

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    const from = get_caller();
    validate_transfer(from, to, amount);
    // ... transfer logic
}
```

### Shared Helpers at Top

```compact
// ✅ Widely-used helpers at top of section
// --- Authorization Helpers ---
circuit get_caller(): Bytes<32> {
    return hash(get_caller_secret());
}

circuit require_owner(): [] {
    assert get_caller() == owner.read();
}

circuit require_not_paused(): [] {
    assert !paused.read();
}

// --- Used by multiple circuits below ---
export circuit action_a(): [] {
    require_owner();
    require_not_paused();
    // ...
}

export circuit action_b(): [] {
    require_owner();
    // ...
}
```

---

## Documentation Placement

### File Header

```compact
/**
 * Token Contract v1.0
 *
 * A simple token implementation with transfer, deposit, and withdrawal.
 *
 * Features:
 * - Standard token operations
 * - Admin pause/unpause
 * - Fee on transfers
 *
 * Requires: Compact 0.18.0+
 */

pragma language_version >= 0.18.0;
```

### Circuit Documentation

```compact
/**
 * Transfer tokens from caller to recipient.
 *
 * @param to Recipient address
 * @param amount Amount to transfer (must be > 0)
 *
 * @requires Caller has sufficient balance
 * @requires Contract is not paused
 * @emits Transfer event
 */
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // Implementation
}
```

### Inline Comments

```compact
export circuit complex_calculation(): Uint<64> {
    const base = get_base_value();

    // Apply discount for large amounts (>1000 tokens)
    const discount = if base > 1000 { 10 } else { 0 };

    // Fee is 3% minus any discount
    const fee_rate = FEE_PERCENT - discount;

    // Calculate final amount after fee
    const fee = base * fee_rate / 100;
    return base - fee;
}
```

---

## Anti-Patterns

### Mixed Concerns

```compact
// ❌ Authorization, validation, and logic mixed
export circuit process(input: Field): Field {
    assert get_caller() == owner.read();  // Auth
    assert input > 0;  // Validation
    const result = input * 2;  // Logic
    state.write(result);  // State change
    return disclose(result);  // Output
}

// ✅ Separated concerns
circuit require_owner(): [] { assert get_caller() == owner.read(); }
circuit validate_input(input: Field): [] { assert input > 0; }
circuit compute_result(input: Field): Field { return input * 2; }

export circuit process(input: Field): Field {
    require_owner();
    validate_input(input);
    const result = compute_result(input);
    state.write(result);
    return disclose(result);
}
```

### Random Ordering

```compact
// ❌ No logical order
export circuit withdraw(): [] { ... }
ledger users: Map<Bytes<32>, UserData>;
const MAX: Uint<64> = 100;
export circuit deposit(): [] { ... }
witness get_key(): Bytes<32>;
ledger balances: Map<Bytes<32>, Uint<64>>;
export circuit get_balance(): Uint<64> { ... }

// ✅ Logical grouping (see Recommended Order above)
```

---

## Checklist

| Aspect | Question |
|--------|----------|
| Order | Constants → Types → Ledger → Witness → Helpers → Public? |
| Grouping | Related items together? |
| Size | Circuits under 50 lines? |
| Helpers | Extracted and near point of use? |
| Sections | Clear dividers between sections? |
| Documentation | Public interface documented? |
| Comments | Explain "why" not "what"? |
