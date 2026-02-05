# Private Voting System

A complete anonymous voting system for Midnight using zero-knowledge proofs.

## Overview

This system provides:
- **Anonymous voter registration** - Voters register with commitments, hiding their identity
- **Secret ballot casting** - Vote choices are never revealed on-chain
- **Double-vote prevention** - Cryptographic nullifiers prevent voting twice
- **Verifiable results** - Anyone can verify the tally is correct

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Private Voting System                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────┐      ┌────────────────────┐        │
│  │   voter.compact    │      │   tally.compact    │        │
│  │                    │      │                    │        │
│  │ • Registration     │─────▶│ • Result compute   │        │
│  │ • Ballot casting   │      │ • Winner select    │        │
│  │ • Nullifier mgmt   │      │ • Verification     │        │
│  │ • Phase control    │      │ • Statistics       │        │
│  └────────────────────┘      └────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `voter.compact` | Voter registration and ballot casting |
| `tally.compact` | Result computation and verification |

## Election Lifecycle

### Phase 1: Setup

Admin initializes the election with configuration:

```typescript
await voter.initializeElection(
  adminCommitment,
  electionId,
  3,          // 3 choices
  1000,       // Registration: 1000 blocks
  2000,       // Voting: 2000 blocks
  10          // Minimum 10 voters
);
```

### Phase 2: Registration

Voters register by committing to their identity:

```typescript
// Voter generates secrets locally
const identitySecret = hash(governmentId + secretSalt);
const randomness = generateRandom();

// Submit commitment (identity hidden)
await voter.register(identitySecret, randomness);
```

**Privacy**: Only `hash(identitySecret, randomness)` is stored on-chain.

### Phase 3: Voting

Registered voters cast anonymous ballots:

```typescript
await voter.castBallot(
  identitySecret,  // Proves registration
  randomness,      // Reconstructs commitment
  1                // Vote for choice 1 (PRIVATE!)
);
```

**Privacy**:
- Choice is in the witness (never published)
- Nullifier prevents double-voting without revealing who voted
- Only aggregate tally is updated

### Phase 4: Finalization

After voting ends, results are computed:

```typescript
await tally.finalize(
  [150, 230, 120],  // Vote counts per choice
  600,               // Total registered voters
  merkleProof        // Proof of correctness
);

const result = await tally.getResult();
const winner = await tally.getWinner();
```

## Privacy Analysis

### What's Public (On-Chain)

| Data | Visibility | Rationale |
|------|------------|-----------|
| Voter commitments | Public | Necessary for registration verification |
| Used nullifiers | Public | Necessary for double-vote prevention |
| Aggregate tallies | Public | Election results must be public |
| Election metadata | Public | Transparency |

### What's Private (Witness Only)

| Data | Visibility | Rationale |
|------|------------|-----------|
| Voter identities | Private | Voter anonymity |
| Individual votes | Private | Ballot secrecy |
| Registration randomness | Private | Commitment binding |
| Identity-nullifier link | Private | Unlinkability |

### Security Properties

1. **Voter Anonymity**: Commitment scheme hides identity
2. **Vote Secrecy**: Choice only appears in aggregate
3. **Eligibility**: Only registered voters can vote
4. **Uniqueness**: Nullifiers prevent double-voting
5. **Verifiability**: Results can be verified by anyone

## Integration Example

```typescript
import { ContractRuntime } from '@midnight/runtime';
import { voter, tally } from './contracts';

class VotingClient {
  private runtime: ContractRuntime;
  private identitySecret: Bytes32;
  private randomness: Bytes32;

  async register(credentials: UserCredentials) {
    // Derive identity from credentials (off-chain)
    this.identitySecret = hash(credentials.id, credentials.salt);
    this.randomness = generateSecureRandom();

    // Register with commitment
    await this.runtime.call(voter.register, {
      identitySecret: this.identitySecret,
      randomness: this.randomness
    });
  }

  async vote(choice: number) {
    // Verify not already voted
    const hasVoted = await this.runtime.call(voter.hasVoted, {
      identitySecret: this.identitySecret
    });

    if (hasVoted) {
      throw new Error('Already voted');
    }

    // Cast ballot
    await this.runtime.call(voter.castBallot, {
      identitySecret: this.identitySecret,
      randomness: this.randomness,
      choice: choice
    });
  }

  async getResults() {
    const stats = await this.runtime.call(tally.getStats);
    return {
      winner: stats.winningChoice,
      totalVotes: stats.totalVotes,
      participation: stats.participationRate
    };
  }
}
```

## Testing

### Unit Tests

```typescript
describe('Private Voting', () => {
  it('should allow registration', async () => {
    const commitment = hash(identity, randomness);
    await voter.register(identity, randomness);
    expect(await voter.isRegistered(commitment)).toBe(true);
  });

  it('should prevent double voting', async () => {
    await voter.castBallot(identity, randomness, 0);
    await expect(
      voter.castBallot(identity, randomness, 1)
    ).rejects.toThrow('nullifier already used');
  });

  it('should not reveal vote choice', async () => {
    // Vote choice should not appear in transaction data
    const tx = await voter.castBallot(identity, randomness, 2);
    expect(tx.publicInputs).not.toContain(2);
  });
});
```

### Integration Tests

```typescript
describe('Full Election', () => {
  it('should complete election lifecycle', async () => {
    // Setup
    await voter.initializeElection(...config);

    // Register 100 voters
    for (const v of voters) {
      await voter.register(v.identity, v.randomness);
    }

    // Advance to voting phase
    await advanceBlocks(1001);
    await voter.startVoting();

    // Cast 100 votes
    for (const v of voters) {
      await voter.castBallot(v.identity, v.randomness, v.choice);
    }

    // Finalize
    await advanceBlocks(2001);
    await tally.finalize(tallies, 100, proof);

    // Verify winner
    expect(await tally.getResult()).toBe(ElectionResult.Winner);
  });
});
```

## Security Considerations

### Attack Vectors

| Attack | Mitigation |
|--------|------------|
| Vote buying | Voters cannot prove how they voted |
| Coercion | Same as vote buying |
| Double voting | Nullifier tracking |
| Impersonation | Commitment scheme |
| Tally manipulation | ZK verification |
| Front-running | Phase deadlines |

### Recommendations

1. **Use hardware security** for generating identity secrets
2. **Implement threshold registration** to prevent spam
3. **Add vote receipt** for voter confirmation (without revealing choice)
4. **Consider audit mechanisms** for disputes
5. **Time-lock result revelation** to prevent early exit

## Extensions

### Weighted Voting

Modify to support different vote weights:

```compact
export circuit castWeightedBallot(
  witness identitySecret: Bytes<32>,
  witness randomness: Bytes<32>,
  witness choice: Uint<8>,
  witness weight: Uint<64>,
  witness weightProof: Vector<Bytes<32>>
): Void {
  // Verify weight via Merkle proof
  assert verifyWeightProof(identity, weight, weightProof);

  // Record weighted vote
  voteTally[choice].increment(weight);
}
```

### Ranked Choice Voting

Support ranking multiple choices:

```compact
export circuit castRankedBallot(
  witness identitySecret: Bytes<32>,
  witness randomness: Bytes<32>,
  witness rankings: Vector<Uint<8>>
): Void {
  // Validate rankings
  assert rankings.length == config.value.choiceCount;

  // Record rankings (complex tally logic)
  // ...
}
```

### Delegated Voting

Allow vote delegation:

```compact
export circuit delegateVote(
  witness delegatorSecret: Bytes<32>,
  witness delegatorRandomness: Bytes<32>,
  delegateeCommitment: Bytes<32>
): Void {
  // Record delegation
  delegations[hash(delegatorSecret, config.value.electionId)] = delegateeCommitment;
}
```

## Related Patterns

- [Whitelist](../../simple/whitelist.compact) - Voter eligibility
- [Time Lock](../../simple/time-lock.compact) - Phase management
- [Multi-Sig](../../simple/multi-sig.compact) - Election administration
