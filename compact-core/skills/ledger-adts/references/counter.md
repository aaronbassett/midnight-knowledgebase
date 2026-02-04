# Counter

Increment-only counter for sequential numbering and totals.

## Declaration

```compact
ledger my_counter: Counter;
```

## Operations

### increment

Add to the counter value.

```compact
// Increment by 1
my_counter.increment(1);

// Increment by any amount
my_counter.increment(100);
```

**Signature**: `increment(amount: Uint<64>): []`

### value

Read the current counter value.

```compact
const current: Uint<64> = my_counter.value();
```

**Signature**: `value(): Uint<64>`

## Use Cases

### Sequential IDs

```compact
ledger id_counter: Counter;
ledger items: Map<Uint<64>, Item>;

export circuit create_item(data: Bytes<32>): Uint<64> {
    // Get next ID
    const id = id_counter.value();

    // Create item with ID
    const item = Item { id: id, data: data };
    items.insert(id, item);

    // Increment for next item
    id_counter.increment(1);

    return id;
}
```

### Tracking Totals

```compact
ledger total_deposits: Counter;

export circuit deposit(amount: Uint<64>): [] {
    // Process deposit...

    // Track total
    total_deposits.increment(amount);
}

export circuit get_total_deposits(): Uint<64> {
    return total_deposits.value();
}
```

### Event Counting

```compact
ledger transfer_count: Counter;
ledger error_count: Counter;

export circuit transfer(to: Bytes<32>, amount: Uint<64>): Boolean {
    // Process transfer
    const success = process_transfer(to, amount);

    if success {
        transfer_count.increment(1);
    } else {
        error_count.increment(1);
    }

    return success;
}
```

## Best Practices

### Initial Value

Counters start at 0 when the contract is deployed.

```compact
ledger counter: Counter;

// First call to value() returns 0
// After increment(5), value() returns 5
```

### Increment-Only

Counters can only increase. For decrementable values, use `Cell<Uint<64>>`:

```compact
// Counter: increment only
ledger counter: Counter;

// Cell: read/write any value
ledger balance: Cell<Uint<64>>;

export circuit decrement_balance(amount: Uint<64>): [] {
    const current = balance.read();
    assert current >= amount, "Insufficient balance";
    balance.write(current - amount);
}
```

### Overflow Consideration

Counters use `Uint<64>`, which maxes out at ~18 quintillion. For practical purposes, overflow is not a concern.

## Patterns

### Rate Limiting by Count

```compact
ledger action_count: Counter;

const MAX_ACTIONS: Uint<64> = 1000;

export circuit perform_action(): [] {
    assert action_count.value() < MAX_ACTIONS, "Action limit reached";

    // Do action...

    action_count.increment(1);
}
```

### Round/Epoch Numbering

```compact
ledger round: Counter;

export circuit advance_round(): Uint<64> {
    round.increment(1);
    return round.value();
}

export circuit get_current_round(): Uint<64> {
    return round.value();
}
```
