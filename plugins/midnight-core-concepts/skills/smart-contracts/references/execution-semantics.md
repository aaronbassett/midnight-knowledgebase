# Execution Semantics

## Transaction Execution Phases

### Phase 1: Well-Formedness Check

Stateless validation (no ledger access needed):

| Check | Description |
|-------|-------------|
| Format | Canonical encoding |
| ZK Proofs | Valid SNARK proofs |
| Schnorr Proofs | Contract contributions balanced |
| Balance | Inputs = Outputs + Fees |
| Claims | Contract inputs match effects |
| Ordering | Contract calls sequential with checkpoints |

If any check fails: Transaction rejected entirely.

### Phase 2: Guaranteed Execution

Stateful execution with mandatory success:

1. **Contract Lookup**
   - Resolve contract addresses
   - Load contract states
   - Verify contracts exist

2. **Zswap Application**
   - Insert new coin commitments
   - Verify nullifiers unused
   - Add nullifiers to set
   - Update Merkle tree

3. **Contract Call Execution**
   - For each call in sequence:
     - Verify ZK proof against circuit
     - Execute Impact program
     - Verify effects match declaration
   - Checkpoint handling between calls

4. **State Persistence**
   - If execution "strong": persist all state changes
   - Update contract map

### Phase 3: Fallible Execution

Optional execution that may fail:

- Same mechanics as guaranteed phase
- Failure does NOT revert guaranteed phase
- Guaranteed effects persist regardless
- Failed fallible: fees from guaranteed still collected

## State Transitions

### Contract State Update

```
OldState + Transaction + Proof → NewState

Verification:
1. Load OldState from ledger
2. Execute Impact with transaction inputs
3. Compute ResultingEffects
4. Assert ResultingEffects == DeclaredEffects
5. If match: Store NewState
```

### Zswap State Update

```
For each coin output:
  commitment_tree.insert(commitment)

For each coin input:
  assert !nullifier_set.contains(nullifier)
  nullifier_set.insert(nullifier)
```

## Effect Declaration

### What Are Effects?

Effects are the public, visible changes a transaction makes:
- Ledger field updates
- Merkle tree insertions
- Set insertions
- Token operations

### Effect Matching

The ZK proof proves:
"Given my private inputs, executing this circuit produces exactly these effects."

The verifier checks:
"The declared effects match what the proof claims."

### Why Two Steps?

1. **Proof verifies logic**: Correct computation
2. **Effect matching verifies outcome**: Expected results

Separating these enables efficient verification.

## Contract Call Ordering

### Sequential Execution

Contract calls execute in declared order:

```
Transaction {
  calls: [
    Call1,  // Executes first
    Call2,  // Executes second
    Call3   // Executes third
  ]
}
```

### Checkpoints

Between calls, system checkpoints ensure:
- State changes persisted
- Effects accumulated
- Failures isolated (in fallible phase)

### Dependencies

Later calls see effects of earlier calls:

```
Call1: ledger.counter = 1
Call2: assert ledger.counter == 1  // Sees Call1's effect
```

## Value Flow

### Zswap Integration

Value moves through Zswap, not directly through contracts:

```
User → Zswap Offer → Contract Receives → Contract Logic → Zswap Send → User
```

### Contract Contributions

Contracts can:
- Receive coins (via Zswap inputs)
- Send coins (via Zswap outputs)
- Not create value from nothing

Schnorr proofs ensure contracts don't inject hidden value.

## Error Handling

### Guaranteed Phase Failures

If guaranteed phase fails:
- Entire transaction rejected
- No state changes
- No fees collected

### Fallible Phase Failures

If fallible phase fails:
- Guaranteed effects persist
- Fallible effects discarded
- Fees from guaranteed collected

### Use Cases

```
Guaranteed: Pay fee, lock collateral
Fallible: Attempt trade

If trade fails:
- Fee paid (guaranteed succeeded)
- Collateral returned (fallible effects discarded)
```

## Concurrency

### Per-Contract Isolation

Different contracts can be processed in parallel if:
- No shared Zswap UTXOs
- No cross-contract calls (currently limited)

### Same-Contract Ordering

Transactions affecting same contract are ordered:
- By blockchain consensus
- Deterministic final state
