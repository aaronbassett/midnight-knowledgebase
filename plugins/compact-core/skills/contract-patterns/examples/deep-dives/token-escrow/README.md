# Multi-Party Token Escrow

A comprehensive escrow system for Midnight supporting multiple parties, milestone payments, and dispute resolution.

## Overview

This escrow system provides:
- **Multi-party support** - Depositors, beneficiaries, and arbitrators
- **Milestone payments** - Staged releases based on progress
- **Dispute resolution** - Arbitrator-mediated conflict resolution
- **Timeout protection** - Automatic refunds if deadlines pass
- **Flexible configuration** - Customizable delays, windows, and approvals

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Token Escrow System                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Depositors ──deposit()──▶ ┌─────────────────┐                   │
│                            │                 │                    │
│  Beneficiary ◀──release()──│  escrow.compact │                   │
│                            │                 │                    │
│  Arbitrator ──resolve()───▶│  • Deposits     │                   │
│                            │  • Milestones   │                   │
│                            │  • Disputes     │                   │
│                            │  • Releases     │                   │
│                            └─────────────────┘                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `escrow.compact` | Core escrow contract with all functionality |

## State Machine

```
                    ┌───────────┐
                    │  Created  │
                    └─────┬─────┘
                          │ deposit() [all funded]
                    ┌─────▼─────┐
            ┌───────│  Funded   │───────┐
            │       └─────┬─────┘       │
            │             │             │
   raiseDispute()   completeMilestone() │ timeout
            │             │             │
      ┌─────▼─────┐ ┌─────▼──────┐      │
      │ Disputed  │ │ InProgress │──────┤
      └─────┬─────┘ └─────┬──────┘      │
            │             │             │
    resolve()      releaseMilestone()   │
            │             │             │
            │       ┌─────▼─────┐       │
            ├──────▶│ Completed │       │
            │       └───────────┘       │
            │                           │
      ┌─────▼─────┐               ┌─────▼────┐
      │ Refunded  │               │ Refunded │
      └───────────┘               └──────────┘
```

## Use Cases

### 1. Freelance Payment

Client pays freelancer after work completion:

```typescript
// Setup
await escrow.create(clientSecret, escrowId, 1000, 100, 50, deadline, 1);
await escrow.addParty(clientSecret, freelancerCommitment, PartyRole.Beneficiary, 0);
await escrow.addMilestone(clientSecret, milestone1, "Design", 300, week1);
await escrow.addMilestone(clientSecret, milestone2, "Development", 500, week2);
await escrow.addMilestone(clientSecret, milestone3, "Testing", 200, week3);

// Client deposits
await escrow.deposit(clientSecret, 1000);

// Freelancer completes work
await escrow.completeMilestone(freelancerSecret, milestone1);
await escrow.approveRelease(clientSecret);
await escrow.releaseMilestone(milestone1, freelancerCommitment);
```

### 2. Real Estate Transaction

Buyer, seller, and escrow agent:

```typescript
// Setup with arbitrator
await escrow.create(buyerSecret, escrowId, purchasePrice, 1000, 500, deadline, 2);
await escrow.addParty(buyerSecret, sellerCommitment, PartyRole.Beneficiary, 0);
await escrow.addParty(buyerSecret, agentCommitment, PartyRole.Arbitrator, 0);

// Single milestone for full payment
await escrow.addMilestone(buyerSecret, titleTransfer, "Title Transfer", purchasePrice, deadline);

// Buyer deposits full amount
await escrow.deposit(buyerSecret, purchasePrice);

// Agent confirms title transfer
await escrow.completeMilestone(agentSecret, titleTransfer);

// Both buyer and seller approve
await escrow.approveRelease(buyerSecret);
await escrow.approveRelease(sellerSecret);

// Release to seller
await escrow.releaseMilestone(titleTransfer, sellerCommitment);
```

### 3. Trade Finance

Multiple depositors, single beneficiary:

```typescript
// Syndicated funding
await escrow.create(bank1Secret, escrowId, totalAmount, 200, 100, deadline, 3);
await escrow.addParty(bank1Secret, bank2Commitment, PartyRole.Depositor, shareAmount);
await escrow.addParty(bank1Secret, bank3Commitment, PartyRole.Depositor, shareAmount);
await escrow.addParty(bank1Secret, exporterCommitment, PartyRole.Beneficiary, 0);
await escrow.addParty(bank1Secret, insurerCommitment, PartyRole.Arbitrator, 0);

// Banks deposit
await escrow.deposit(bank1Secret, bank1Share);
await escrow.deposit(bank2Secret, bank2Share);
await escrow.deposit(bank3Secret, bank3Share);

// Milestones for trade stages
// ...
```

## API Reference

### Creation & Setup

| Function | Description |
|----------|-------------|
| `create()` | Initialize new escrow |
| `addParty()` | Add depositor/beneficiary/arbitrator |
| `addMilestone()` | Define payment milestone |
| `cancel()` | Cancel before funding |

### Funding

| Function | Description |
|----------|-------------|
| `deposit()` | Depositor adds funds |
| `checkFullyFunded()` | Internal: verify all deposits |

### Execution

| Function | Description |
|----------|-------------|
| `completeMilestone()` | Mark milestone as done |
| `approveRelease()` | Approve fund release |
| `releaseMilestone()` | Release funds for milestone |

### Dispute Resolution

| Function | Description |
|----------|-------------|
| `raiseDispute()` | Initiate dispute |
| `resolveDispute()` | Arbitrator resolution |

### Claims

| Function | Description |
|----------|-------------|
| `claimRefund()` | Depositor claims refund |
| `claimRelease()` | Beneficiary claims release |

### Queries

| Function | Description |
|----------|-------------|
| `getState()` | Current escrow state |
| `getConfig()` | Escrow configuration |
| `getParty()` | Party information |
| `getMilestone()` | Milestone details |
| `getFinancialSummary()` | Total/deposited/released |

## Integration Example

```typescript
import { ContractRuntime } from '@midnight/runtime';
import { escrow } from './contracts';

class EscrowClient {
  private runtime: ContractRuntime;
  private secret: Bytes32;
  private escrowId: Bytes32;

  // Create escrow as depositor
  async createEscrow(amount: bigint, beneficiary: Bytes32) {
    this.escrowId = generateEscrowId();

    await this.runtime.call(escrow.create, {
      creatorSecret: this.secret,
      escrowId: this.escrowId,
      totalAmount: amount,
      releaseDelay: 100n,
      disputeWindow: 50n,
      deadline: BigInt(Date.now()) + 86400000n,
      approvalsRequired: 1
    });

    await this.runtime.call(escrow.addParty, {
      callerSecret: this.secret,
      partyCommitment: beneficiary,
      role: PartyRole.Beneficiary,
      depositRequired: 0n
    });
  }

  // Deposit funds
  async deposit(amount: bigint) {
    await this.runtime.call(escrow.deposit, {
      depositorSecret: this.secret,
      amount
    });
  }

  // Complete milestone (beneficiary)
  async completeMilestone(milestoneId: Bytes32) {
    await this.runtime.call(escrow.completeMilestone, {
      callerSecret: this.secret,
      milestoneId
    });
  }

  // Approve and release
  async approveAndRelease(milestoneId: Bytes32, beneficiary: Bytes32) {
    await this.runtime.call(escrow.approveRelease, {
      callerSecret: this.secret
    });

    return await this.runtime.call(escrow.releaseMilestone, {
      milestoneId,
      beneficiaryCommitment: beneficiary
    });
  }

  // Raise dispute
  async dispute(reason: string) {
    await this.runtime.call(escrow.raiseDispute, {
      callerSecret: this.secret,
      reason: hash(reason)
    });
  }

  // Get status
  async getStatus() {
    const [total, deposited, released] =
      await this.runtime.call(escrow.getFinancialSummary);

    return {
      state: await this.runtime.call(escrow.getState),
      total,
      deposited,
      released,
      remaining: deposited - released
    };
  }
}
```

## Security Considerations

### Attack Vectors

| Attack | Mitigation |
|--------|------------|
| Front-running deposits | Commitment-based party identification |
| Unauthorized release | Multi-approval requirement |
| Indefinite fund lock | Absolute deadline with timeout refund |
| Arbitrator collusion | Multiple arbitrators (extend pattern) |
| Milestone manipulation | Deadline enforcement |

### Best Practices

1. **Set realistic deadlines** - Account for delays and disputes
2. **Use multiple approvals** - For high-value escrows
3. **Include arbitrator** - For any escrow with dispute potential
4. **Define clear milestones** - Measurable, verifiable conditions
5. **Test timeout paths** - Ensure refunds work correctly

## Testing

```typescript
describe('Token Escrow', () => {
  describe('Creation', () => {
    it('should create escrow with valid config', async () => {
      await escrow.create(secret, id, 1000n, 100n, 50n, deadline, 1);
      expect(await escrow.getState()).toBe(EscrowState.Created);
    });

    it('should add parties correctly', async () => {
      await escrow.addParty(secret, beneficiary, PartyRole.Beneficiary, 0n);
      const party = await escrow.getParty(beneficiary);
      expect(party.role).toBe(PartyRole.Beneficiary);
    });
  });

  describe('Funding', () => {
    it('should transition to Funded when fully deposited', async () => {
      await escrow.deposit(depositorSecret, 1000n);
      expect(await escrow.getState()).toBe(EscrowState.Funded);
    });
  });

  describe('Milestones', () => {
    it('should release funds for completed milestone', async () => {
      await escrow.completeMilestone(beneficiarySecret, milestoneId);
      await escrow.approveRelease(depositorSecret);
      const released = await escrow.releaseMilestone(milestoneId, beneficiary);
      expect(released).toBe(milestoneAmount);
    });
  });

  describe('Disputes', () => {
    it('should allow arbitrator to resolve dispute', async () => {
      await escrow.raiseDispute(depositorSecret, reason);
      await escrow.resolveDispute(arbitratorSecret, true, 0);
      expect(await escrow.getState()).toBe(EscrowState.Refunded);
    });
  });

  describe('Timeouts', () => {
    it('should allow refund after deadline', async () => {
      await advanceBlocks(deadline + 1);
      const refund = await escrow.claimRefund(depositorSecret);
      expect(refund).toBe(depositAmount);
    });
  });
});
```

## Extensions

### Private Amount Escrow

Hide deposit amounts using commitments:

```compact
export circuit privateDeposit(
  witness depositorSecret: Bytes<32>,
  witness amount: Uint<64>,
  witness randomness: Bytes<32>
): Void {
  // Commit to amount
  const amountCommitment = hash(amount, randomness);
  depositCommitments.insert(amountCommitment);
}
```

### Multi-Arbitrator

Require consensus among multiple arbitrators:

```compact
ledger arbitratorVotes: Map<Bytes<32>, Boolean>;
ledger arbitratorThreshold: Cell<Uint<8>>;

export circuit voteOnDispute(
  witness arbitratorSecret: Bytes<32>,
  refund: Boolean
): Void {
  // Record vote, check threshold, resolve if met
}
```

## Related Patterns

- [Time Lock](../../simple/time-lock.compact) - Deadline enforcement
- [Multi-Sig](../../simple/multi-sig.compact) - Approval mechanism
- [Pausable](../../simple/pausable.compact) - Emergency stops
- [Fee Collector](../../simple/fee-collector.compact) - Service fees
