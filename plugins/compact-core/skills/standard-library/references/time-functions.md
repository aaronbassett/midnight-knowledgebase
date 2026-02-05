# Time Functions

Reference for time-related functions in `CompactStandardLibrary`.

## Overview

| Function | Purpose | Returns |
|----------|---------|---------|
| `blockTime()` | Get current block timestamp | `Uint<64>` |
| `blockTimeBefore(time)` | Assert current time < time | `[]` |
| `blockTimeAfter(time)` | Assert current time > time | `[]` |

## Key Concepts

### Block Time

Block time is the timestamp of the block containing the transaction, provided by the network validators.

**Important characteristics**:
- Monotonically increasing (each block >= previous block)
- Resolution is network-dependent (typically seconds)
- Not exact wall-clock time (consensus-based)
- Immutable within a transaction

### Timestamp Format

Block timestamps are Unix timestamps (seconds since January 1, 1970 UTC) stored as `Uint<64>`.

---

## blockTime

Returns the current block's timestamp.

### Signature

```compact
blockTime(): Uint<64>
```

### Example: Record Timestamp

```compact
import { blockTime } from "CompactStandardLibrary";

struct Record {
    data: Bytes<32>,
    created_at: Uint<64>
}

ledger records: Map<Bytes<32>, Record>;

export circuit create_record(id: Bytes<32>, data: Bytes<32>): [] {
    const record = Record {
        data: data,
        created_at: blockTime()
    };

    records.insert(id, record);
}
```

### Example: Audit Log

```compact
import { blockTime } from "CompactStandardLibrary";

struct LogEntry {
    timestamp: Uint<64>,
    action: Field,
    actor: Bytes<32>
}

ledger log: List<LogEntry>;

export circuit log_action(action: Field, actor: Bytes<32>): [] {
    const entry = LogEntry {
        timestamp: blockTime(),
        action: action,
        actor: actor
    };

    log.append(entry);
}
```

---

## blockTimeBefore

Asserts that the current block time is **before** (less than) the specified time. Fails the transaction if the condition is not met.

### Signature

```compact
blockTimeBefore(time: Uint<64>): []
```

### Parameters

- `time`: The deadline timestamp (exclusive upper bound)

### Behavior

- If `blockTime() < time`: Continues execution
- If `blockTime() >= time`: Transaction fails

### Example: Deadline Enforcement

```compact
import { blockTimeBefore } from "CompactStandardLibrary";

ledger deadline: Cell<Uint<64>>;

export circuit submit_before_deadline(data: Bytes<32>): [] {
    // Fails if deadline has passed
    blockTimeBefore(deadline.read());

    // Process submission...
}
```

### Example: Auction Bidding

```compact
import { blockTimeBefore, Maybe } from "CompactStandardLibrary";

struct Auction {
    end_time: Uint<64>,
    highest_bid: Uint<64>,
    highest_bidder: Bytes<32>
}

ledger auctions: Map<Bytes<32>, Auction>;

export circuit place_bid(
    auction_id: Bytes<32>,
    bid_amount: Uint<64>,
    bidder: Bytes<32>
): [] {
    const auction_opt = auctions.lookup(auction_id);
    assert auction_opt is Maybe::Some(_), "Auction not found";

    if auction_opt is Maybe::Some(auction) {
        // Must be before auction ends
        blockTimeBefore(auction.end_time);

        // Must exceed current highest bid
        assert bid_amount > auction.highest_bid, "Bid too low";

        // Update auction
        const updated = Auction {
            end_time: auction.end_time,
            highest_bid: bid_amount,
            highest_bidder: bidder
        };

        auctions.insert(auction_id, updated);
    }
}
```

---

## blockTimeAfter

Asserts that the current block time is **after** (greater than) the specified time. Fails the transaction if the condition is not met.

### Signature

```compact
blockTimeAfter(time: Uint<64>): []
```

### Parameters

- `time`: The unlock timestamp (exclusive lower bound)

### Behavior

- If `blockTime() > time`: Continues execution
- If `blockTime() <= time`: Transaction fails

### Example: Time Lock

```compact
import { blockTimeAfter } from "CompactStandardLibrary";

ledger unlock_time: Cell<Uint<64>>;
ledger locked_value: Cell<Uint<64>>;

export circuit withdraw(): Uint<64> {
    // Fails if unlock time hasn't passed
    blockTimeAfter(unlock_time.read());

    const value = locked_value.read();
    locked_value.write(0);

    return value;
}
```

### Example: Vesting Schedule

```compact
import { blockTimeAfter, blockTime, Maybe } from "CompactStandardLibrary";

struct VestingSchedule {
    beneficiary: Bytes<32>,
    total_amount: Uint<64>,
    start_time: Uint<64>,
    cliff_time: Uint<64>,
    end_time: Uint<64>,
    claimed: Uint<64>
}

ledger schedules: Map<Bytes<32>, VestingSchedule>;

export circuit claim_vested(schedule_id: Bytes<32>): Uint<64> {
    const schedule_opt = schedules.lookup(schedule_id);
    assert schedule_opt is Maybe::Some(_), "Schedule not found";

    if schedule_opt is Maybe::Some(schedule) {
        // Must be past cliff
        blockTimeAfter(schedule.cliff_time);

        // Calculate vested amount
        const now = blockTime();
        const elapsed = now - schedule.start_time;
        const total_duration = schedule.end_time - schedule.start_time;

        var vested: Uint<64> = 0;
        if now >= schedule.end_time {
            vested = schedule.total_amount;
        } else {
            vested = (schedule.total_amount * elapsed) / total_duration;
        }

        // Calculate claimable
        const claimable = vested - schedule.claimed;
        assert claimable > 0, "Nothing to claim";

        // Update claimed amount
        const updated = VestingSchedule {
            beneficiary: schedule.beneficiary,
            total_amount: schedule.total_amount,
            start_time: schedule.start_time,
            cliff_time: schedule.cliff_time,
            end_time: schedule.end_time,
            claimed: schedule.claimed + claimable
        };

        schedules.insert(schedule_id, updated);

        return claimable;
    }

    return 0;
}
```

---

## Common Patterns

### Time Window

Require action within a specific time window:

```compact
import { blockTimeBefore, blockTimeAfter } from "CompactStandardLibrary";

ledger window_start: Cell<Uint<64>>;
ledger window_end: Cell<Uint<64>>;

export circuit action_in_window(): [] {
    // Must be after start
    blockTimeAfter(window_start.read());

    // Must be before end
    blockTimeBefore(window_end.read());

    // Perform action...
}
```

### Cooldown Period

Prevent repeated actions within a time period:

```compact
import { blockTime, blockTimeAfter } from "CompactStandardLibrary";

ledger last_action: Map<Bytes<32>, Uint<64>>;

const COOLDOWN: Uint<64> = 3600;  // 1 hour in seconds

export circuit action_with_cooldown(user: Bytes<32>): [] {
    const last_opt = last_action.lookup(user);

    if last_opt is Maybe::Some(last_time) {
        // Must wait for cooldown
        blockTimeAfter(last_time + COOLDOWN);
    }

    // Perform action...

    // Record action time
    last_action.insert(user, blockTime());
}
```

### Expiration Check

Check if something has expired:

```compact
import { blockTime } from "CompactStandardLibrary";

struct Subscription {
    user: Bytes<32>,
    expires_at: Uint<64>
}

ledger subscriptions: Map<Bytes<32>, Subscription>;

export circuit is_active(user: Bytes<32>): Boolean {
    const sub_opt = subscriptions.lookup(user);

    if sub_opt is Maybe::Some(sub) {
        return blockTime() < sub.expires_at;
    }

    return false;
}
```

### Delayed Execution

Allow action only after a delay from creation:

```compact
import { blockTime, blockTimeAfter } from "CompactStandardLibrary";

struct Proposal {
    created_at: Uint<64>,
    execution_delay: Uint<64>,
    executed: Boolean
}

ledger proposals: Map<Bytes<32>, Proposal>;

export circuit execute_proposal(proposal_id: Bytes<32>): [] {
    const proposal_opt = proposals.lookup(proposal_id);
    assert proposal_opt is Maybe::Some(_), "Proposal not found";

    if proposal_opt is Maybe::Some(proposal) {
        assert !proposal.executed, "Already executed";

        // Must wait for delay
        const earliest_execution = proposal.created_at + proposal.execution_delay;
        blockTimeAfter(earliest_execution);

        // Execute proposal...

        // Mark as executed
        const updated = Proposal {
            created_at: proposal.created_at,
            execution_delay: proposal.execution_delay,
            executed: true
        };

        proposals.insert(proposal_id, updated);
    }
}
```

---

## Best Practices

### Use Appropriate Time Bounds

```compact
// Good: Explicit time bounds
blockTimeAfter(lock_until);
blockTimeBefore(deadline);

// Risky: Manual comparison (may have off-by-one issues)
if blockTime() > lock_until { ... }
```

### Account for Block Time Granularity

Block times are not precise. Don't rely on sub-second accuracy:

```compact
// Good: Use reasonable time margins
const deadline = current_time + 3600;  // 1 hour buffer

// Risky: Tight time constraints
const deadline = current_time + 10;  // Only 10 seconds - may fail
```

### Consider Time Manipulation

Validators have some control over block timestamps. For high-value operations:

```compact
// Consider using block numbers for more predictable timing
// Or add safety margins to time-based logic
```

### Store Timestamps for Auditability

```compact
struct Action {
    data: Field,
    performed_at: Uint<64>  // Always record when actions occur
}
```
