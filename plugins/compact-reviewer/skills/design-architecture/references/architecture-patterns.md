# Architecture Patterns for Compact Contracts

Recommended design patterns for well-structured Compact smart contracts.

## Ownership Pattern

**Purpose**: Establish clear ownership with cryptographic verification.

```compact
ledger owner_hash: Cell<Bytes<32>>;

witness get_owner_secret(): Bytes<32>;

// Helper circuit for ownership check
circuit require_owner(): [] {
    const secret = get_owner_secret();
    assert hash(secret) == owner_hash.read();
}

export circuit initialize(owner_hash_param: Bytes<32>): [] {
    assert owner_hash.read() == ZERO;  // Only once
    owner_hash.write(owner_hash_param);
}

export circuit owner_action(): [] {
    require_owner();
    // ... owner-only logic
}
```

**Benefits**:
- Clear authorization model
- Reusable ownership check
- Initialization protection

---

## Role-Based Access Pattern

**Purpose**: Multiple roles with different permissions.

```compact
enum Role { Admin, Operator, User }

ledger roles: Map<Bytes<32>, Role>;

witness get_caller(): Bytes<32>;

circuit require_role(required: Role): [] {
    const caller = get_caller();
    const caller_role = roles.lookup(hash(caller));
    assert caller_role == required || caller_role == Role.Admin;
}

export circuit admin_action(): [] {
    require_role(Role.Admin);
    // ...
}

export circuit operator_action(): [] {
    require_role(Role.Operator);
    // ...
}
```

**Benefits**:
- Flexible permission system
- Admin can do everything
- Clear role hierarchy

---

## State Machine Pattern

**Purpose**: Enforce valid state transitions.

```compact
enum ContractState { Created, Active, Paused, Closed }

ledger state: Cell<ContractState>;

circuit require_state(required: ContractState): [] {
    assert state.read() == required;
}

circuit transition_to(new_state: ContractState): [] {
    state.write(new_state);
}

export circuit activate(): [] {
    require_owner();
    require_state(ContractState.Created);
    transition_to(ContractState.Active);
}

export circuit pause(): [] {
    require_owner();
    require_state(ContractState.Active);
    transition_to(ContractState.Paused);
}

export circuit close(): [] {
    require_owner();
    // Can close from Active or Paused
    const current = state.read();
    assert current == ContractState.Active ||
           current == ContractState.Paused;
    transition_to(ContractState.Closed);
}
```

**Benefits**:
- Explicit state transitions
- Invalid transitions prevented
- Easy to reason about

---

## Separation of Concerns Pattern

**Purpose**: Organize code by responsibility.

```compact
// ========== State Layer ==========
ledger balances: Map<Bytes<32>, Uint<64>>;
ledger allowances: Map<Bytes<64>, Uint<64>>;  // (owner, spender) -> amount

// ========== Authorization Layer ==========
witness get_owner_secret(): Bytes<32>;

circuit get_caller_address(): Bytes<32> {
    return hash(get_owner_secret());
}

circuit require_balance(addr: Bytes<32>, amount: Uint<64>): [] {
    assert balances.lookup(addr) >= amount;
}

// ========== Business Logic Layer ==========
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    const from = get_caller_address();
    require_balance(from, amount);

    balances[from].decrement(amount);
    balances[to].increment(amount);
}

export circuit approve(spender: Bytes<32>, amount: Uint<64>): [] {
    const owner = get_caller_address();
    const key = concat(owner, spender);
    allowances.write(key, amount);
}
```

**Benefits**:
- Clear layers (state, auth, logic)
- Reusable helper circuits
- Easy to test each layer

---

## Factory Pattern

**Purpose**: Create multiple instances with shared logic.

```compact
// Instance registry
ledger instances: Map<Bytes<32>, InstanceData>;
ledger instance_count: Counter;

struct InstanceData {
    owner: Bytes<32>,
    balance: Uint<64>,
    created_at: Uint<64>
}

export circuit create_instance(): Bytes<32> {
    const id = hash(instance_count.read());
    instance_count.increment(1);

    const caller = get_caller_address();
    const data = InstanceData {
        owner: caller,
        balance: 0,
        created_at: currentBlockHeight()
    };

    instances.write(id, data);
    return disclose(id);
}

export circuit instance_action(instance_id: Bytes<32>): [] {
    const data = instances.lookup(instance_id);
    assert get_caller_address() == data.owner;
    // ... instance-specific logic
}
```

**Benefits**:
- Reusable contract logic
- Efficient multi-instance management
- Clear instance ownership

---

## Event Emission Pattern

**Purpose**: Record important state changes for off-chain tracking.

```compact
ledger event_log: Vector<Event, 10000>;
ledger event_count: Counter;

struct Event {
    event_type: Uint<8>,
    actor: Bytes<32>,
    data: Bytes<32>,
    timestamp: Uint<64>
}

circuit emit_event(event_type: Uint<8>, data: Bytes<32>): [] {
    const event = Event {
        event_type: event_type,
        actor: get_caller_address(),
        data: data,
        timestamp: currentBlockHeight()
    };

    const idx = event_count.read();
    event_log[idx].write(event);
    event_count.increment(1);
}

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // ... transfer logic
    emit_event(1, hash(from, to, amount));  // Type 1 = Transfer
}
```

**Benefits**:
- Off-chain indexing
- Audit trail
- Event-driven integrations

---

## Commit-Reveal Pattern

**Purpose**: Multi-phase operations for fairness.

```compact
ledger commitments: Map<Bytes<32>, CommitmentData>;

struct CommitmentData {
    commitment: Bytes<32>,
    created_at: Uint<64>,
    revealed: Boolean
}

export circuit commit(commitment_hash: Bytes<32>): Bytes<32> {
    const id = hash(get_caller_address(), commitment_hash);

    commitments.write(id, CommitmentData {
        commitment: commitment_hash,
        created_at: currentBlockHeight(),
        revealed: false
    });

    return disclose(id);
}

export circuit reveal(
    commitment_id: Bytes<32>,
    value: Field,
    nonce: Bytes<32>
): [] {
    const data = commitments.lookup(commitment_id);
    assert !data.revealed;
    assert currentBlockHeight() > data.created_at + REVEAL_DELAY;

    const expected = persistentCommit(nonce, value);
    assert expected == data.commitment;

    // Mark revealed
    commitments.write(commitment_id, CommitmentData {
        commitment: data.commitment,
        created_at: data.created_at,
        revealed: true
    });

    // Process revealed value
    process_value(value);
}
```

**Benefits**:
- Prevents front-running
- Fair ordering
- Time-locked reveals

---

## Batch Operations Pattern

**Purpose**: Efficient bulk operations.

```compact
export circuit batch_transfer(
    recipients: Vector<Bytes<32>, 10>,
    amounts: Vector<Uint<64>, 10>,
    count: Uint<8>
): [] {
    assert count <= 10;
    const from = get_caller_address();

    var total: Uint<64> = 0;
    for i in 0..10 {
        if i < disclose(count) as Uint<64> {
            total = total + amounts[i].read();
        }
    }

    require_balance(from, total);
    balances[from].decrement(total);

    for i in 0..10 {
        if i < disclose(count) as Uint<64> {
            const to = recipients[i].read();
            const amount = amounts[i].read();
            balances[to].increment(amount);
        }
    }
}
```

**Benefits**:
- Amortized cost
- Single authorization
- Atomic batch

---

## Summary

| Pattern | Use When |
|---------|----------|
| Ownership | Single owner controls contract |
| Role-Based | Multiple permission levels needed |
| State Machine | Complex state transitions |
| Separation of Concerns | Large contract with multiple functions |
| Factory | Need multiple instances |
| Event Emission | Off-chain tracking required |
| Commit-Reveal | Fairness in multi-phase operations |
| Batch Operations | Frequent bulk transactions |
