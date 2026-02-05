# Modularity Guidelines

Principles for creating maintainable, modular Compact contracts.

## Core Principles

### 1. Single Responsibility

Each circuit should do one thing well.

```compact
// ❌ Circuit does too much
export circuit manage_user(action: Uint<8>, ...): [] {
    if action == 0 { /* create */ }
    if action == 1 { /* update */ }
    if action == 2 { /* delete */ }
    if action == 3 { /* query */ }
}

// ✅ Separate circuits for each action
export circuit create_user(...): Bytes<32> { }
export circuit update_user(...): [] { }
export circuit delete_user(...): [] { }
export circuit get_user(...): UserData { }
```

### 2. Separation of Concerns

Group related functionality together.

```compact
// ✅ Logical groupings
// --- Authorization Layer ---
circuit require_owner(): [] { }
circuit require_role(role: Role): [] { }

// --- Validation Layer ---
circuit validate_amount(amount: Uint<64>): [] { }
circuit validate_address(addr: Bytes<32>): [] { }

// --- Business Logic Layer ---
circuit compute_fee(amount: Uint<64>): Uint<64> { }
circuit apply_discount(amount: Uint<64>): Uint<64> { }

// --- State Layer ---
circuit update_balance(addr: Bytes<32>, delta: Int<64>): [] { }
circuit record_transaction(tx: TransactionData): [] { }
```

### 3. Loose Coupling

Minimize dependencies between components.

```compact
// ❌ Tight coupling - knows about UserModule internals
circuit process_order(order: Order): [] {
    const user = users.lookup(order.user_id);  // Direct access
    const balance = user.balance;  // Knows structure
    // ...
}

// ✅ Loose coupling - uses interface
circuit process_order(order: Order): [] {
    const balance = get_user_balance(order.user_id);  // Via helper
    require_balance(order.user_id, order.total);  // Via helper
    // ...
}
```

---

## Modular Design Patterns

### Feature Modules

Group by feature/domain:

```compact
// ============================================================
// USER MODULE
// ============================================================

ledger users: Map<Bytes<32>, UserData>;
ledger user_count: Counter;

circuit internal_create_user(data: UserData): Bytes<32> { }
circuit internal_update_user(id: Bytes<32>, data: UserData): [] { }

export circuit create_user(...): Bytes<32> { }
export circuit update_user(...): [] { }
export circuit get_user(...): UserData { }

// ============================================================
// BALANCE MODULE
// ============================================================

ledger balances: Map<Bytes<32>, Uint<64>>;
ledger total_supply: Cell<Uint<64>>;

circuit internal_credit(addr: Bytes<32>, amount: Uint<64>): [] { }
circuit internal_debit(addr: Bytes<32>, amount: Uint<64>): [] { }

export circuit deposit(...): [] { }
export circuit withdraw(...): [] { }
export circuit get_balance(...): Uint<64> { }
```

### Shared Utilities

Common helpers used across modules:

```compact
// ============================================================
// UTILITIES (used by all modules)
// ============================================================

circuit get_caller(): Bytes<32> {
    return hash(get_caller_secret());
}

circuit require_owner(): [] {
    assert get_caller() == owner.read();
}

circuit require_not_paused(): [] {
    assert !paused.read();
}

circuit emit_event(event_type: Uint<8>, data: Bytes<32>): [] {
    // Common event logging
}
```

---

## Interface Design

### Public Interface

Export only what's needed:

```compact
// ✅ Clean public interface
export circuit create_user(...): Bytes<32>;
export circuit update_user(...): [];
export circuit delete_user(...): [];
export circuit get_user(...): UserData;

// Internal helpers (not exported)
circuit validate_user_data(data: UserData): [] { }
circuit hash_user_id(name: Bytes<32>): Bytes<32> { }
```

### Parameter Design

Use clear, minimal parameters:

```compact
// ❌ Too many parameters
export circuit create_order(
    user_id: Bytes<32>,
    item_id: Bytes<32>,
    quantity: Uint<64>,
    price: Uint<64>,
    discount: Uint<8>,
    shipping: Uint<64>,
    notes: Bytes<64>,
    priority: Uint<8>
): Bytes<32> { }

// ✅ Struct for complex data
struct OrderRequest {
    user_id: Bytes<32>,
    item_id: Bytes<32>,
    quantity: Uint<64>,
    price: Uint<64>,
    options: OrderOptions
}

export circuit create_order(request: OrderRequest): Bytes<32> { }
```

---

## Dependency Management

### Minimal Dependencies

Keep dependencies between modules minimal:

```
User Module
    └── Auth Module (required)

Balance Module
    └── Auth Module (required)
    └── User Module (optional - for user lookup)

Order Module
    └── Auth Module (required)
    └── User Module (required)
    └── Balance Module (required)
```

### Dependency Direction

Dependencies should flow one direction (no cycles):

```
❌ Circular dependency:
User Module ←→ Order Module

✅ One-way dependency:
User Module ← Order Module
```

---

## Change Impact Analysis

### Low Impact Changes

Changes that affect only one module:

```
Adding new field to UserData struct:
  → Changes: User Module only
  → Impact: Low

Adding new validation rule:
  → Changes: Validation helpers
  → Impact: Low
```

### High Impact Changes

Changes that ripple across modules:

```
Changing user ID format (Bytes<32> → Bytes<20>):
  → Changes: All modules using user IDs
  → Impact: High - requires coordination

Changing authorization model:
  → Changes: All authorized circuits
  → Impact: High - security review needed
```

---

## Refactoring Guide

### When to Refactor

```
✓ Circuit > 50 lines
✓ Duplicated code in 3+ places
✓ Deep nesting (> 3 levels)
✓ Hard to write tests
✓ Frequently changing together
```

### How to Refactor

1. **Extract Helper**
```compact
// Before: Inline logic
export circuit process(): [] {
    const secret = get_secret();
    assert hash(secret) == owner_hash.read();
    // ... rest
}

// After: Extracted helper
circuit require_owner(): [] {
    const secret = get_secret();
    assert hash(secret) == owner_hash.read();
}

export circuit process(): [] {
    require_owner();
    // ... rest
}
```

2. **Combine Related State**
```compact
// Before: Scattered state
ledger user_name: Map<Bytes<32>, Bytes<64>>;
ledger user_balance: Map<Bytes<32>, Uint<64>>;
ledger user_created: Map<Bytes<32>, Uint<64>>;

// After: Structured state
struct UserData {
    name: Bytes<64>,
    balance: Uint<64>,
    created_at: Uint<64>
}
ledger users: Map<Bytes<32>, UserData>;
```

---

## Checklist

| Aspect | Question | Target |
|--------|----------|--------|
| Responsibility | Does each circuit do one thing? | Yes |
| Coupling | Are modules independent? | Yes |
| Interface | Is public API minimal? | Yes |
| Dependencies | Are cycles avoided? | Yes |
| Size | Are circuits < 50 lines? | Yes |
| Duplication | Is code DRY? | Yes |
| Change impact | Are changes localized? | Yes |
