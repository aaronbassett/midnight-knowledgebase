# Impact VM Reference

## Overview

Impact is Midnight's on-chain virtual machine. Developers write Compact, which compiles to Impact. Understanding Impact helps when debugging or inspecting transactions.

## Architecture

### Stack-Based Execution

Impact operates on a three-element stack:

```
[Context, Effects, State]
    ↓        ↓        ↓
 Tx data  Actions  Contract
```

### Non-Turing-Complete

- Linear execution (no backward jumps)
- Bounded operations
- Every operation has fixed cost
- Guaranteed termination

## Value Types

### Supported Values

| Type | Description |
|------|-------------|
| Null | Empty value |
| Cell | Field-aligned binary data |
| Map | Key-value mapping (0-16 entries displayed) |
| Array | Indexed collection (0-16 items) |
| MerkleTree | Depth 1-32 |

### Immutability

Values cannot be modified in-place. Operations return new values:

```
old_state → operation → new_state
```

## Execution Modes

### Evaluating Mode

- Full execution
- Updates state
- Used for transaction processing

### Verifying Mode

- Checks constraints
- Validates proofs
- Used for validation

## Gas System

### Bounded Costs

Every operation has a fixed gas cost. Programs declare maximum gas upfront.

### Cost Categories

| Category | Examples |
|----------|----------|
| Computation | Arithmetic, hashing |
| Storage | State reads/writes |
| Cryptography | Proof verification |

**Note**: Storage costs are still being finalized and may change.

## Program Structure

### Context Object

Contains transaction-related data:
- Public inputs
- Caller information
- Block data

### Effects Object

Actions performed during execution:
- State changes
- Token operations
- Events

### State Object

Contract's persistent data:
- Ledger fields
- Maps
- Merkle trees
- Sets

## Operation Categories

### Stack Operations

- Push/pop values
- Duplicate
- Swap positions

### Arithmetic

- Add, subtract, multiply, divide
- Field arithmetic (modular)

### Logic

- Boolean operations
- Comparisons

### Memory

- Load from state
- Store to state
- Map operations

### Cryptographic

- Hash computation
- Commitment verification
- Proof checking

## Transaction Integration

### Effect Matching

After Impact execution:
1. Compute resulting effects
2. Compare to declared effects
3. Must match exactly
4. If match: store new state

### Failure Handling

If execution fails:
- Guaranteed section: Entire tx rejected
- Fallible section: Section skipped, tx continues

## Developer Interaction

### When You See Impact

- Transaction inspection
- Debugging failures
- Understanding execution traces

### When You Don't

- Writing contracts (use Compact)
- Normal development
- High-level design

## Debugging Tips

### Common Issues

| Symptom | Possible Cause |
|---------|----------------|
| Gas exceeded | Circuit too complex |
| Effect mismatch | State change doesn't match proof |
| Invalid state | Corrupted or unexpected state |

### Inspection Tools

```bash
# View transaction Impact (conceptual)
midnight tx inspect <tx-hash>
```

## Performance Characteristics

| Aspect | Property |
|--------|----------|
| Execution | Deterministic |
| Timing | Bounded by gas |
| Memory | Bounded by state size |
| Parallelism | Per-contract isolation |
