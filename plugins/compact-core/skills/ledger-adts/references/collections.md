# Collections: Map, Set, List

Reference for collection-type ledger ADTs.

## Map<K, V>

Key-value storage with unique keys.

### Declaration

```compact
ledger users: Map<Bytes<32>, User>;
ledger balances: Map<Bytes<32>, Uint<64>>;
ledger configs: Map<Field, Config>;
```

### Operations

#### lookup

Find a value by key. Returns `Maybe<V>`.

```compact
const result: Maybe<User> = users.lookup(user_id);

if result is Maybe::Some(user) {
    // User found, use user
} else {
    // User not found
}
```

**Signature**: `lookup(key: K): Maybe<V>`

#### insert

Add or update a key-value pair.

```compact
// Insert new
users.insert(user_id, new_user);

// Update existing (same key overwrites)
users.insert(user_id, updated_user);
```

**Signature**: `insert(key: K, value: V): []`

#### remove

Remove a key-value pair.

```compact
users.remove(user_id);
// Subsequent lookup returns Maybe::None
```

**Signature**: `remove(key: K): []`

### Example: User Registry

```compact
struct User {
    id: Bytes<32>,
    name_hash: Bytes<32>,
    balance: Uint<64>
}

ledger users: Map<Bytes<32>, User>;

export circuit register(id: Bytes<32>, name_hash: Bytes<32>): [] {
    // Check not already registered
    const existing = users.lookup(id);
    assert existing is Maybe::None, "Already registered";

    // Create user
    const user = User {
        id: id,
        name_hash: name_hash,
        balance: 0
    };

    users.insert(id, user);
}

export circuit update_balance(id: Bytes<32>, new_balance: Uint<64>): [] {
    const user_opt = users.lookup(id);
    assert user_opt is Maybe::Some(_), "User not found";

    if user_opt is Maybe::Some(user) {
        const updated = User {
            id: user.id,
            name_hash: user.name_hash,
            balance: new_balance
        };
        users.insert(id, updated);
    }
}
```

---

## Set<T>

Membership collection with unique elements.

### Declaration

```compact
ledger whitelist: Set<Bytes<32>>;
ledger used_nonces: Set<Bytes<32>>;
ledger voted: Set<Bytes<32>>;
```

### Operations

#### member

Check if an element exists.

```compact
const is_whitelisted: Boolean = whitelist.member(address);
```

**Signature**: `member(element: T): Boolean`

#### insert

Add an element to the set.

```compact
whitelist.insert(address);
// Inserting duplicate has no effect (still one entry)
```

**Signature**: `insert(element: T): []`

#### remove

Remove an element from the set.

```compact
whitelist.remove(address);
// Subsequent member() returns false
```

**Signature**: `remove(element: T): []`

### Example: Whitelist

```compact
ledger whitelist: Set<Bytes<32>>;
ledger admin: Cell<Bytes<32>>;

witness get_caller(): Bytes<32>;

export circuit add_to_whitelist(address: Bytes<32>): [] {
    const caller = get_caller();
    assert disclose(caller) == admin.read(), "Only admin";

    whitelist.insert(address);
}

export circuit is_whitelisted(address: Bytes<32>): Boolean {
    return whitelist.member(address);
}

export circuit protected_action(): [] {
    const caller = get_caller();
    assert whitelist.member(disclose(caller)), "Not whitelisted";

    // Perform protected action
}
```

### Example: Nonce/Nullifier Tracking

```compact
ledger used_nonces: Set<Bytes<32>>;

export circuit use_nonce(nonce: Bytes<32>): [] {
    assert !used_nonces.member(nonce), "Nonce already used";
    used_nonces.insert(nonce);
}
```

---

## List<T>

Ordered, append-only collection.

### Declaration

```compact
ledger history: List<Transaction>;
ledger log: List<Event>;
```

### Operations

#### append

Add an element to the end.

```compact
const tx = Transaction { ... };
history.append(tx);
```

**Signature**: `append(element: T): []`

#### nth

Get element at index. Returns `Maybe<T>`.

```compact
const first_opt: Maybe<Transaction> = history.nth(0);

if first_opt is Maybe::Some(tx) {
    // Use tx
}
```

**Signature**: `nth(index: Uint<64>): Maybe<T>`

#### length (TypeScript only)

Get the list length. Not available in Compact circuits.

```typescript
// In TypeScript
const len = await contract.history.length();
```

### Example: Transaction Log

```compact
struct LogEntry {
    timestamp: Uint<64>,
    action: Field,
    actor: Bytes<32>,
    data: Bytes<32>
}

ledger log: List<LogEntry>;

export circuit log_action(action: Field, actor: Bytes<32>, data: Bytes<32>): [] {
    const entry = LogEntry {
        timestamp: blockTime(),
        action: action,
        actor: actor,
        data: data
    };

    log.append(entry);
}

export circuit get_entry(index: Uint<64>): LogEntry {
    const entry_opt = log.nth(index);
    assert entry_opt is Maybe::Some(_), "Entry not found";

    if entry_opt is Maybe::Some(entry) {
        return entry;
    }

    // Unreachable due to assert, but needed for compiler
    return LogEntry {
        timestamp: 0,
        action: 0,
        actor: 0x0000000000000000000000000000000000000000000000000000000000000000,
        data: 0x0000000000000000000000000000000000000000000000000000000000000000
    };
}
```

---

## TypeScript-Only Operations

These operations are available when reading ledger state from TypeScript but not in Compact circuits:

| ADT | TypeScript Operations |
|-----|----------------------|
| Map | `entries()`, `keys()`, `values()`, `size` |
| Set | `entries()`, `size` |
| List | `entries()`, `length` |

### Example: TypeScript Iteration

```typescript
// Get all users from Map
const allUsers = await contract.users.entries();
for (const [id, user] of allUsers) {
    console.log(`User ${id}: ${user.balance}`);
}

// Get whitelist members
const members = await contract.whitelist.entries();
console.log(`Whitelist has ${members.length} members`);

// Get history length
const historyLen = await contract.history.length();
```

## Choosing the Right Collection

| Need | Use |
|------|-----|
| Key-value lookups | `Map<K, V>` |
| Membership checks | `Set<T>` |
| Ordered history | `List<T>` |
| Membership proofs | `MerkleTree<T>` |
| Simple value | `Cell<T>` |
| Counter/ID | `Counter` |
