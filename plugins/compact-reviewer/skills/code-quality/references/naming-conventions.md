# Naming Conventions for Compact

Guidelines for clear, consistent naming in Compact smart contracts.

## General Principles

1. **Be descriptive** - Names should convey meaning
2. **Be consistent** - Use the same conventions throughout
3. **Be concise** - Long enough to be clear, short enough to be practical
4. **Avoid abbreviations** - Except for common ones (id, tx, addr)

---

## Circuit Names

### Format: `verb_noun` or `verb`

**Verbs for actions**:
- `get_` - Retrieve data
- `set_` - Modify data
- `create_` - Create new entity
- `delete_` / `remove_` - Remove entity
- `transfer_` - Move value
- `verify_` - Check validity
- `compute_` - Calculate result
- `is_` / `has_` - Boolean check

**Examples**:
```compact
// ✅ Good names
export circuit get_balance(): Uint<64> { }
export circuit set_config(config: Config): [] { }
export circuit create_user(name: Bytes<32>): Bytes<32> { }
export circuit transfer_tokens(to: Bytes<32>, amount: Uint<64>): [] { }
export circuit verify_signature(sig: Signature): Boolean { }
export circuit is_active(): Boolean { }
export circuit has_permission(user: Bytes<32>, perm: Permission): Boolean { }

// ❌ Poor names
export circuit bal(): Uint<64> { }  // Too short
export circuit doStuff(): [] { }    // Vague
export circuit x(a: Field): Field { }  // Meaningless
```

### Helper Circuits

**Format**: `verb_noun` without export, or `require_*` for assertions

```compact
// Internal helpers
circuit compute_fee(amount: Uint<64>): Uint<64> { }
circuit hash_credentials(creds: Credentials): Bytes<32> { }

// Assertion helpers (common pattern)
circuit require_owner(): [] { }
circuit require_active(): [] { }
circuit require_balance(amount: Uint<64>): [] { }
```

---

## Ledger Names

### Format: `noun` or `noun_noun`

**Use plural for collections**:
```compact
// ✅ Good ledger names
ledger balances: Map<Bytes<32>, Uint<64>>;  // Plural for collection
ledger users: Map<Bytes<32>, UserData>;
ledger events: Vector<Event, 1000>;
ledger event_count: Counter;

ledger owner: Cell<Bytes<32>>;              // Singular for single value
ledger config: Cell<Config>;
ledger contract_state: Cell<Status>;

// ❌ Poor names
ledger b: Map<Bytes<32>, Uint<64>>;  // Too short
ledger data: Cell<Field>;            // Too vague
```

---

## Constant Names

### Format: `UPPER_SNAKE_CASE`

```compact
// ✅ Good constant names
const MAX_SUPPLY: Uint<64> = 1000000000;
const FEE_PERCENT: Uint<8> = 3;
const ZERO_ADDRESS: Bytes<32> = 0x00...;
const CONTRACT_VERSION: Uint<8> = 1;
const MIN_TRANSFER_AMOUNT: Uint<64> = 100;

// ❌ Poor names
const max: Uint<64> = 1000000000;  // Should be uppercase
const MaxSupply: Uint<64> = 1000000000;  // Wrong case
```

---

## Parameter Names

### Format: `snake_case`

```compact
// ✅ Good parameter names
export circuit transfer(
    recipient_address: Bytes<32>,
    token_amount: Uint<64>,
    memo_data: Bytes<32>
): [] { }

// ❌ Poor names
export circuit transfer(
    r: Bytes<32>,      // Too short
    amt: Uint<64>,     // Abbreviation
    d: Bytes<32>       // Meaningless
): [] { }
```

### Common Parameter Names

| Purpose | Suggested Name |
|---------|---------------|
| Recipient | `recipient`, `to`, `recipient_address` |
| Amount | `amount`, `value`, `token_amount` |
| Sender | `sender`, `from`, `sender_address` |
| Index | `index`, `idx` |
| Count | `count`, `n` |
| Limit | `limit`, `max_count` |
| Proof | `proof`, `merkle_proof` |
| Signature | `signature`, `sig` |

---

## Witness Function Names

### Format: `get_*` prefix

```compact
// ✅ Good witness names
witness get_secret_key(): Bytes<32>;
witness get_merkle_proof(): MerkleProof<20>;
witness get_user_credentials(): Credentials;
witness get_signing_key(): Bytes<32>;

// ❌ Poor names
witness secret(): Bytes<32>;        // Missing get_ prefix
witness key(): Bytes<32>;           // Vague
witness w1(): Bytes<32>;            // Meaningless
```

---

## Type Names

### Structs: `PascalCase`

```compact
// ✅ Good struct names
struct UserData {
    balance: Uint<64>,
    created_at: Uint<64>,
    status: Status
}

struct TransferRecord {
    from: Bytes<32>,
    to: Bytes<32>,
    amount: Uint<64>
}
```

### Enums: `PascalCase` for type, `PascalCase` for variants

```compact
// ✅ Good enum names
enum Status {
    Pending,
    Active,
    Suspended,
    Closed
}

enum Permission {
    Read,
    Write,
    Admin
}
```

---

## Local Variable Names

### Format: `snake_case`

```compact
export circuit process(): [] {
    // ✅ Good variable names
    const caller_address = get_caller();
    const current_balance = balances.lookup(caller_address);
    const fee_amount = compute_fee(transfer_amount);

    // ❌ Poor names
    const ca = get_caller();   // Too short
    const x = balances.lookup(ca);  // Meaningless
}
```

---

## Naming Anti-Patterns

### Single-Letter Names

```compact
// ❌ Avoid (except for loop counters)
const x = get_value();
const a = compute_result();

// ✅ OK for loop counters
for i in 0..10 {
    items[i].write(0);
}
```

### Unclear Abbreviations

```compact
// ❌ Unclear abbreviations
const cfg = get_config();
const usr = get_user();
const tx = get_transaction();  // ⚠️ 'tx' is commonly understood

// ✅ Full words
const config = get_config();
const user = get_user();
const transaction = get_transaction();
```

### Misleading Names

```compact
// ❌ Misleading - name doesn't match behavior
circuit get_user(): [] {  // Returns nothing, not a getter
    // Modifies state
}

// ✅ Accurate
circuit process_user(): [] {
    // Modifies state
}
```

### Inconsistent Names

```compact
// ❌ Inconsistent (user vs usr vs u)
ledger users: Map<Bytes<32>, UserData>;
witness get_usr_data(): UserData;
const u = get_usr_data();

// ✅ Consistent
ledger users: Map<Bytes<32>, UserData>;
witness get_user_data(): UserData;
const user = get_user_data();
```

---

## Summary

| Element | Convention | Example |
|---------|------------|---------|
| Export circuits | `verb_noun` | `transfer_tokens` |
| Helper circuits | `verb_noun` or `require_*` | `require_owner` |
| Ledgers | `noun` (plural for collections) | `balances`, `config` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_SUPPLY` |
| Parameters | `snake_case` | `recipient_address` |
| Witnesses | `get_*` | `get_secret_key` |
| Structs | `PascalCase` | `UserData` |
| Enums | `PascalCase` | `Status` |
| Variables | `snake_case` | `current_balance` |
