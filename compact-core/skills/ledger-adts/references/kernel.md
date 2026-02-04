# Kernel

Reference for the special Kernel ledger type providing transaction context.

## Overview

The Kernel is a special ledger that provides access to transaction-level information and native token operations.

## Declaration

Every contract has access to a kernel:

```compact
ledger kernel: Kernel;
```

## Operations

### balance

Get the contract's native token balance.

```compact
const contract_balance: Uint<64> = kernel.balance();
```

**Signature**: `balance(): Uint<64>`

### round

Get the current transaction round number.

```compact
const current_round: Uint<64> = kernel.round();
```

**Signature**: `round(): Uint<64>`

### currentTransaction

Access the current transaction's details.

```compact
const tx_info = kernel.currentTransaction();
// Returns transaction metadata
```

## Use Cases

### Checking Contract Balance

```compact
ledger kernel: Kernel;

export circuit has_sufficient_funds(amount: Uint<64>): Boolean {
    return kernel.balance() >= amount;
}

export circuit get_contract_balance(): Uint<64> {
    return kernel.balance();
}
```

### Time-Based Logic with Rounds

```compact
ledger kernel: Kernel;
ledger last_action_round: Cell<Uint<64>>;

const MIN_ROUNDS_BETWEEN_ACTIONS: Uint<64> = 10;

export circuit time_gated_action(): [] {
    const current = kernel.round();
    const last = last_action_round.read();

    assert current >= last + MIN_ROUNDS_BETWEEN_ACTIONS,
        "Must wait between actions";

    // Perform action
    last_action_round.write(current);
}
```

### Round-Based Unlocking

```compact
ledger kernel: Kernel;
ledger unlock_round: Cell<Uint<64>>;
ledger locked_amount: Cell<Uint<64>>;

export circuit set_time_lock(amount: Uint<64>, rounds_to_lock: Uint<64>): [] {
    locked_amount.write(amount);
    unlock_round.write(kernel.round() + rounds_to_lock);
}

export circuit withdraw(): Uint<64> {
    assert kernel.round() >= unlock_round.read(), "Still locked";

    const amount = locked_amount.read();
    locked_amount.write(0);
    return amount;
}
```

## Transaction Context

### Accessing Transaction Data

```compact
ledger kernel: Kernel;

export circuit process_with_tx_context(): [] {
    const tx = kernel.currentTransaction();

    // Transaction provides context about the current execution
    // Useful for authorization, logging, and protocol logic
}
```

## Best Practices

### Use Rounds for Time-Based Logic

Rounds provide a consistent measure of time progression:

```compact
// GOOD: Round-based timing
const rounds_elapsed = kernel.round() - start_round;

// ALTERNATIVE: Block time for absolute time
const time_elapsed = blockTime() - start_time;
```

### Check Balance Before Transfers

```compact
ledger kernel: Kernel;

export circuit safe_send(amount: Uint<64>): [] {
    assert kernel.balance() >= amount, "Insufficient contract balance";

    // Proceed with send operation
}
```

### Combine with Block Time

```compact
import { blockTime } from "CompactStandardLibrary";

ledger kernel: Kernel;

export circuit hybrid_time_check(
    min_rounds: Uint<64>,
    min_timestamp: Uint<64>
): Boolean {
    // Both conditions must be met
    const round_ok = kernel.round() >= min_rounds;
    const time_ok = blockTime() >= min_timestamp;

    return round_ok && time_ok;
}
```

## Kernel vs Other State

| Feature | Kernel | Regular Ledger |
|---------|--------|----------------|
| Declared by | System | Developer |
| Balance | Native token | Custom types |
| Round | Transaction order | Not available |
| Modifiable | Read-only (mostly) | Read-write |

## Common Patterns

### Epoch/Round Tracking

```compact
ledger kernel: Kernel;
ledger epoch_start_round: Cell<Uint<64>>;
ledger current_epoch: Counter;

const ROUNDS_PER_EPOCH: Uint<64> = 100;

export circuit check_epoch(): [] {
    const current = kernel.round();
    const epoch_start = epoch_start_round.read();

    if current >= epoch_start + ROUNDS_PER_EPOCH {
        // New epoch
        current_epoch.increment(1);
        epoch_start_round.write(current);
    }
}
```

### Contract Health Check

```compact
ledger kernel: Kernel;

export circuit health_check(): (Uint<64>, Uint<64>) {
    const balance = kernel.balance();
    const round = kernel.round();

    return (balance, round);
}
```
