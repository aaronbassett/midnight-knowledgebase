# ZK-Specific Attack Vectors

Documentation of zero-knowledge specific vulnerabilities in Compact smart contracts.

## Overview

These attack vectors are unique to ZK-circuit-based systems and may not apply to traditional smart contracts. They exploit properties of proof generation, circuit constraints, and the prover-verifier model.

---

## AV-01: Implicit Information Leakage via Taint

**Severity**: 🟠 High
**Detectability**: Medium

### Description

Circuit execution paths that depend on witness values leak information through proof generation timing or resource consumption.

### Vulnerable Pattern

```compact
witness get_balance(): Uint<64>;

export circuit access_features(): Boolean {
    const balance = get_balance();
    if disclose(balance) > 1000 {
        // Path A: More operations
        for i in 0..1000 { expensiveComputation(); }
    } else {
        // Path B: Fewer operations
        simpleComputation();
    }
    return true;
}
```

### Attack

An observer measures proof generation time:
- Long time → balance > 1000
- Short time → balance ≤ 1000

### Detection

Flag circuits where:
1. `if` conditions depend on `disclose(witness_derived_value)`
2. Loop iteration counts depend on witness values
3. Different code paths have significantly different constraint counts

### Mitigation

```compact
// Option 1: Constant-time execution (pad shorter path)
if disclose(balance) > 1000 {
    for i in 0..1000 { expensiveComputation(); }
} else {
    for i in 0..1000 { dummyComputation(); }  // Pad
}

// Option 2: Avoid witness-dependent branching
// Move decision to witness function
```

---

## AV-02: Commitment Nonce Reuse

**Severity**: 🔴 Critical
**Detectability**: High

### Description

Reusing nonces in commitment schemes allows linking commitments across transactions.

### Vulnerable Pattern

```compact
witness get_fixed_nonce(): Bytes<32>;  // Same nonce reused

export circuit commit_value(value: Field): Bytes<32> {
    return persistentCommit(get_fixed_nonce(), value);
}
```

### Attack

If user commits to values V1 and V2 with same nonce N:
- C1 = Commit(N, V1)
- C2 = Commit(N, V2)

Attacker can detect relationship between C1 and C2.

### Detection

Flag:
1. Single nonce witness used across multiple commitments
2. Nonce derived from deterministic, low-entropy source
3. Missing fresh nonce generation per commitment

### Mitigation

```compact
// Fresh nonce per commitment
witness get_fresh_nonce(): Bytes<32>;

export circuit commit_value(value: Field): Bytes<32> {
    const nonce = get_fresh_nonce();  // New random nonce each time
    return persistentCommit(nonce, value);
}
```

---

## AV-03: Nullifier Linkability

**Severity**: 🔴 Critical
**Detectability**: High

### Description

Nullifiers generated from low-entropy inputs can be brute-forced, enabling user tracking across protocols.

### Vulnerable Pattern

```compact
witness get_vote(): Uint<8>;  // Only 256 possibilities

export circuit vote_nullifier(): Bytes<32> {
    const vote = get_vote();
    // Attacker precomputes all 256 possible nullifiers
    return persistentHash("vote", vote as Field);
}
```

### Attack

1. Observe nullifier N on blockchain
2. Compute `persistentHash("vote", i)` for i = 0..255
3. Find match: now know the vote

### Detection

Flag `persistentHash()` calls where:
1. Input includes Uint<1-20>, Boolean, or small enum
2. No high-entropy secret mixed in
3. Used for nullifier generation

### Mitigation

```compact
witness get_vote(): Uint<8>;
witness get_voter_secret(): Bytes<32>;  // High-entropy secret

export circuit vote_nullifier(): Bytes<32> {
    const vote = get_vote();
    const secret = get_voter_secret();
    // Secret prevents brute-force
    return persistentHash("vote", secret, vote as Field);
}
```

---

## AV-04: Time-Based Race Conditions

**Severity**: 🟠 High
**Detectability**: High

### Description

Using `currentBlockHeight()` in security checks creates TOCTOU (time-of-check-to-time-of-use) vulnerabilities.

### Vulnerable Pattern

```compact
export circuit claim_reward(): [] {
    const now = currentBlockHeight();
    const deadline = deadline_block.read();
    assert now < deadline;  // Check

    // Gap between check and use
    // Block could advance before tx included

    reward.transfer(claimer);  // Use
}
```

### Attack

1. User creates proof at block N where N < deadline
2. Proof sits in mempool
3. Block advances to N+k where N+k ≥ deadline
4. Proof still valid, claim succeeds after deadline

### Detection

Flag:
1. `currentBlockHeight()` in assertions
2. Time-based access control without buffer

### Mitigation

```compact
export circuit claim_reward(max_block: Uint<64>): [] {
    const now = currentBlockHeight();
    assert now <= max_block;  // User commits to block range
    assert max_block < deadline_block.read();
    reward.transfer(claimer);
}
```

---

## AV-05: Merkle Proof Staleness

**Severity**: 🟡 Medium
**Detectability**: Medium

### Description

Using historical Merkle roots without freshness validation allows replay of stale proofs.

### Vulnerable Pattern

```compact
export circuit spend_coin(
    historical_root: Bytes<32>,
    proof: MerkleProof<20>
): [] {
    // No check that root is recent
    assert verifyMerkleProof(historical_root, coin_leaf, proof);
    // Coin may have already been spent in a newer state
}
```

### Detection

Flag:
1. `HistoricMerkleTree` usage without recency check
2. Root parameter accepted without validation
3. Missing nullifier to prevent double-use

### Mitigation

```compact
export circuit spend_coin(proof: MerkleProof<20>): [] {
    const root = merkle_tree.root();  // Current root only
    assert verifyMerkleProof(root, coin_leaf, proof);
    spent_nullifiers.insert(coin_nullifier);  // Prevent replay
}
```

---

## AV-06: Witness Entropy Exhaustion

**Severity**: 🔴 Critical
**Detectability**: High

### Description

Witnesses with bounded ranges allow offline brute-force recovery.

### Vulnerable Pattern

```compact
witness get_pin(): Uint<16>;  // Only 65,536 values

export circuit verify_auth(): Bytes<32> {
    const pin = get_pin();
    return persistentHash("auth", pin as Field);
}
```

### Attack

Attacker observes auth hash, computes all 65,536 possibilities offline.

### Entropy Table

| Type | Entropy | Brute-Force Time |
|------|---------|------------------|
| Boolean | 1 bit | Instant |
| Uint<8> | 8 bits | Milliseconds |
| Uint<16> | 16 bits | Seconds |
| Uint<32> | 32 bits | Hours to days |
| Bytes<32> | 256 bits | Computationally infeasible |

### Detection

Flag security-critical operations using:
1. Uint<1-20>
2. Boolean
3. Small enums
4. Any bounded type < 2^32

### Mitigation

Mix high-entropy secret:

```compact
witness get_pin(): Uint<16>;
witness get_device_secret(): Bytes<32>;

export circuit verify_auth(): Bytes<32> {
    const pin = get_pin();
    const secret = get_device_secret();
    return persistentHash("auth", secret, pin as Field);
}
```

---

## AV-07: Multi-Witness Synchronization

**Severity**: 🟠 High
**Detectability**: Medium

### Description

Multi-circuit workflows sharing witness state can desynchronize.

### Vulnerable Pattern

```compact
// Circuit A: Creates commitment
witness get_secret(): Bytes<32>;

export circuit create_commitment(): Bytes<32> {
    return persistentCommit(nonce, get_secret());
}

// Circuit B: Reveals secret (different invocation)
export circuit reveal_secret(): Bytes<32> {
    return disclose(get_secret());  // ⚠️ Might get different value
}
```

### Attack

Witness implementation returns different values across circuit invocations.

### Detection

Flag:
1. Same witness function called across multiple circuits
2. Witness state assumed to be consistent
3. No cryptographic binding between invocations

### Mitigation

```compact
// Bind related operations with commitment
export circuit create_commitment(): Bytes<32> {
    const secret = get_secret();
    store_secret_hash(hash(secret));  // Bind locally
    return persistentCommit(nonce, secret);
}

export circuit reveal_secret(): Bytes<32> {
    const secret = get_secret();
    assert hash(secret) == stored_secret_hash.read();  // Verify binding
    return disclose(secret);
}
```

---

## AV-08: Circuit Under-Constraint

**Severity**: 🔴 Critical
**Detectability**: Low

### Description

Missing assertions allow invalid operations to succeed at the circuit level.

### Vulnerable Pattern

```compact
witness get_choice(): Uint<8>;

export circuit select_option(): [] {
    const choice = get_choice();
    // ❌ No validation that choice is valid
    options[choice].execute();  // May access invalid index
}
```

### Attack

Malicious prover provides out-of-bounds choice, circuit still generates valid proof.

### Detection

Flag:
1. Witness values used without range assertions
2. Array/map access without bounds check
3. Enum values without variant validation

### Mitigation

```compact
export circuit select_option(): [] {
    const choice = get_choice();
    assert choice < OPTION_COUNT;  // ✅ Explicit constraint
    options[choice].execute();
}
```

---

## AV-09: Multi-Sig Replay and Ordering

**Severity**: 🟠 High
**Detectability**: Medium

### Description

Multi-signature schemes without proper nonces allow signature replay or reordering attacks.

### Vulnerable Pattern

```compact
export circuit execute_proposal(signatures: Vector<Bytes<64>, 3>): [] {
    // ❌ No nonce - same proposal can be re-executed
    verify_multisig(proposal_hash, signatures);
    execute_action();
}
```

### Detection

Flag multi-sig operations missing:
1. Unique nonce per proposal
2. Nonce increment after execution
3. Replay protection mechanism

### Mitigation

```compact
ledger proposal_nonce: Counter;

export circuit execute_proposal(
    nonce: Uint<64>,
    signatures: Vector<Bytes<64>, 3>
): [] {
    assert nonce == proposal_nonce.read();  // Check nonce
    verify_multisig(hash(proposal, nonce), signatures);
    proposal_nonce.increment(1);  // Prevent replay
    execute_action();
}
```

---

## AV-10: Commitment Side-Channel

**Severity**: 🟡 Medium
**Detectability**: Low

### Description

Repeated commitment operations on same value with different nonces can leak information through timing.

### Vulnerable Pattern

```compact
// If same value committed multiple times with measurable timing
for i in 0..N {
    commitments.push(persistentCommit(nonces[i], same_value));
}
```

### Attack

Statistical analysis of commitment timing patterns.

### Detection

Flag:
1. Multiple commitments to same value
2. Loop-based commitment generation
3. Observable patterns in commitment timing

---

## AV-11: Nullifier Context Migration

**Severity**: 🟡 Medium
**Detectability**: High

### Description

Witnesses reused across different protocols allow cross-protocol tracking.

### Vulnerable Pattern

```compact
// Protocol A
export circuit protocol_a_nullifier(): Bytes<32> {
    return persistentHash("protocol_a", get_user_secret());
}

// Protocol B (different contract)
export circuit protocol_b_nullifier(): Bytes<32> {
    return persistentHash("protocol_b", get_user_secret());
}
// ⚠️ Same secret → linkable nullifiers
```

### Detection

Flag witness reuse across:
1. Different contracts
2. Different domain contexts
3. Cross-protocol operations

### Mitigation

Derive context-specific secrets:

```compact
export circuit protocol_a_nullifier(): Bytes<32> {
    const derived = persistentHash("derive-a", get_master_secret());
    return persistentHash("nullifier", derived);
}
```

---

## AV-12: State Machine Reentrancy (ZK)

**Severity**: 🟠 High
**Detectability**: Medium

### Description

Multiple proofs can generate conflicting ledger updates when state machine doesn't enforce serialization.

### Vulnerable Pattern

```compact
export circuit claim_slot(slot_id: Uint<64>): [] {
    assert slots[slot_id].read() == EMPTY;  // Check
    // ❌ Two proofs can race to claim same slot
    slots[slot_id].write(CLAIMED);  // Write
}
```

### Detection

Flag:
1. Read-then-write patterns on shared state
2. Missing unique identifiers (like nullifiers)
3. State transitions without atomic locks

### Mitigation

```compact
ledger claim_nullifiers: Set<Bytes<32>>;

export circuit claim_slot(slot_id: Uint<64>): [] {
    const claim_nullifier = persistentHash("claim", slot_id, get_claimer());
    assert !claim_nullifiers.member(claim_nullifier);  // Unique claim
    claim_nullifiers.insert(claim_nullifier);
    slots[slot_id].write(CLAIMED);
}
```

---

## Summary Table

| ID | Attack Vector | Severity | Detection Method |
|----|---------------|----------|------------------|
| AV-01 | Timing leakage | 🟠 High | Witness-dependent control flow |
| AV-02 | Nonce reuse | 🔴 Critical | Single nonce across commitments |
| AV-03 | Nullifier linkability | 🔴 Critical | Low-entropy hash inputs |
| AV-04 | Time-based race | 🟠 High | currentBlockHeight() in checks |
| AV-05 | Merkle staleness | 🟡 Medium | Historical roots without freshness |
| AV-06 | Entropy exhaustion | 🔴 Critical | Uint<1-20> in crypto operations |
| AV-07 | Witness desync | 🟠 High | Cross-circuit witness sharing |
| AV-08 | Under-constraint | 🔴 Critical | Missing witness assertions |
| AV-09 | Multi-sig replay | 🟠 High | Missing nonces in multi-sig |
| AV-10 | Commitment side-channel | 🟡 Medium | Repeated same-value commits |
| AV-11 | Context migration | 🟡 Medium | Cross-protocol witness reuse |
| AV-12 | ZK reentrancy | 🟠 High | Read-modify-write races |
