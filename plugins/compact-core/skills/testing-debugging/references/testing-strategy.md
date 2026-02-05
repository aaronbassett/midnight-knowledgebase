# Testing Strategy for Compact Contracts

Comprehensive testing approaches for Midnight smart contracts.

## Testing Layers

### Layer 1: Unit Testing Circuits

Test individual circuits in isolation with mocked witnesses.

**When to use**: Testing circuit logic, edge cases, error conditions.

```typescript
import { TestContext } from '@midnight-ntwrk/compact-testing';

describe('Calculator Circuit', () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await TestContext.create('calculator.compact');
    });

    it('adds two numbers correctly', async () => {
        const result = await ctx.call('add', [BigInt(5), BigInt(3)]);
        expect(result.returnValue).toBe(BigInt(8));
    });

    it('handles zero correctly', async () => {
        const result = await ctx.call('add', [BigInt(0), BigInt(0)]);
        expect(result.returnValue).toBe(BigInt(0));
    });

    it('handles maximum values', async () => {
        const max = BigInt(2) ** BigInt(64) - BigInt(1);
        // This should fail due to overflow
        await expect(ctx.call('add', [max, BigInt(1)]))
            .rejects.toThrow('overflow');
    });
});
```

### Layer 2: Integration Testing with Witnesses

Test circuits with realistic witness implementations.

**When to use**: Testing the interaction between TypeScript witnesses and Compact circuits.

```typescript
describe('Token Contract with Witnesses', () => {
    let ctx: TestContext;
    let userSecrets: Map<string, bigint>;

    beforeEach(async () => {
        ctx = await TestContext.create('token.compact');
        userSecrets = new Map([
            ['alice', BigInt('0x' + 'a'.repeat(64))],
            ['bob', BigInt('0x' + 'b'.repeat(64))]
        ]);
    });

    it('transfers tokens with valid signature', async () => {
        const witnesses = {
            get_private_key: () => userSecrets.get('alice')!,
            get_balance: () => BigInt(1000)
        };

        const result = await ctx.call(
            'transfer',
            [bobAddress, BigInt(100)],
            witnesses
        );

        expect(result.success).toBe(true);
    });

    it('fails transfer with insufficient balance', async () => {
        const witnesses = {
            get_private_key: () => userSecrets.get('alice')!,
            get_balance: () => BigInt(50)  // Not enough
        };

        await expect(
            ctx.call('transfer', [bobAddress, BigInt(100)], witnesses)
        ).rejects.toThrow('Insufficient balance');
    });
});
```

### Layer 3: State Verification Testing

Test that circuits correctly update ledger state.

**When to use**: Testing stateful operations, ensuring ledger consistency.

```typescript
describe('Counter Contract State', () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await TestContext.create('counter.compact');
    });

    it('increments counter correctly', async () => {
        // Initial state
        const initial = await ctx.ledger.get('counter');
        expect(initial).toBe(BigInt(0));

        // Increment
        await ctx.call('increment', [BigInt(5)]);

        // Verify state
        const afterIncrement = await ctx.ledger.get('counter');
        expect(afterIncrement).toBe(BigInt(5));
    });

    it('maintains state across multiple calls', async () => {
        await ctx.call('increment', [BigInt(3)]);
        await ctx.call('increment', [BigInt(7)]);
        await ctx.call('increment', [BigInt(2)]);

        const final = await ctx.ledger.get('counter');
        expect(final).toBe(BigInt(12));
    });
});
```

### Layer 4: End-to-End Testing

Test complete workflows with multiple parties and realistic scenarios.

**When to use**: Validating complete user flows, multi-party interactions.

```typescript
describe('Auction E2E', () => {
    let ctx: TestContext;
    let alice: TestUser;
    let bob: TestUser;

    beforeEach(async () => {
        ctx = await TestContext.create('auction.compact');
        alice = await TestUser.create('alice');
        bob = await TestUser.create('bob');
    });

    it('complete auction flow', async () => {
        // Alice creates auction
        await ctx.asUser(alice).call('create_auction', [
            itemId,
            BigInt(100),  // starting price
            BigInt(3600)  // duration
        ]);

        // Bob places bid
        await ctx.asUser(bob).call('place_bid', [
            auctionId,
            BigInt(150)
        ]);

        // Alice places higher bid
        await ctx.asUser(alice).call('place_bid', [
            auctionId,
            BigInt(200)
        ]);

        // Fast-forward time
        await ctx.advanceTime(3700);

        // Finalize auction
        const result = await ctx.call('finalize_auction', [auctionId]);

        // Verify winner
        expect(result.returnValue.winner).toBe(alice.address);
        expect(result.returnValue.amount).toBe(BigInt(200));
    });
});
```

## Testing Patterns

### Pattern 1: Property-Based Testing

Test that properties hold for many random inputs.

```typescript
import { fc } from 'fast-check';

describe('Property-Based Tests', () => {
    it('addition is commutative', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.bigInt(0n, 2n ** 32n),
                fc.bigInt(0n, 2n ** 32n),
                async (a, b) => {
                    const result1 = await ctx.call('add', [a, b]);
                    const result2 = await ctx.call('add', [b, a]);
                    return result1.returnValue === result2.returnValue;
                }
            )
        );
    });

    it('transfer preserves total supply', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.bigInt(1n, 1000n),
                async (amount) => {
                    const totalBefore = await getTotalSupply(ctx);
                    await ctx.call('transfer', [recipient, amount], mockWitness);
                    const totalAfter = await getTotalSupply(ctx);
                    return totalBefore === totalAfter;
                }
            )
        );
    });
});
```

### Pattern 2: Negative Testing

Explicitly test error conditions.

```typescript
describe('Error Conditions', () => {
    it('rejects zero amount transfer', async () => {
        await expect(
            ctx.call('transfer', [recipient, BigInt(0)], mockWitness)
        ).rejects.toThrow('Amount must be positive');
    });

    it('rejects self-transfer', async () => {
        await expect(
            ctx.call('transfer', [selfAddress, BigInt(100)], mockWitness)
        ).rejects.toThrow('Cannot transfer to self');
    });

    it('rejects transfer without sufficient balance', async () => {
        const poorWitness = {
            get_balance: () => BigInt(10)
        };

        await expect(
            ctx.call('transfer', [recipient, BigInt(100)], poorWitness)
        ).rejects.toThrow('Insufficient balance');
    });
});
```

### Pattern 3: State Machine Testing

Model your contract as a state machine and test transitions.

```typescript
enum AuctionState {
    Created = 'created',
    Active = 'active',
    Ended = 'ended',
    Finalized = 'finalized'
}

describe('Auction State Machine', () => {
    it('follows valid state transitions', async () => {
        // Created -> Active (on first bid)
        await assertState(ctx, AuctionState.Created);
        await ctx.call('place_bid', [auctionId, BigInt(100)], bidderWitness);
        await assertState(ctx, AuctionState.Active);

        // Active -> Ended (on time expiry)
        await ctx.advanceTime(3700);
        await assertState(ctx, AuctionState.Ended);

        // Ended -> Finalized (on finalize call)
        await ctx.call('finalize_auction', [auctionId]);
        await assertState(ctx, AuctionState.Finalized);
    });

    it('rejects invalid state transitions', async () => {
        // Cannot finalize before ended
        await assertState(ctx, AuctionState.Created);
        await expect(
            ctx.call('finalize_auction', [auctionId])
        ).rejects.toThrow('Auction not ended');
    });
});
```

### Pattern 4: Snapshot Testing

Compare ledger state against known-good snapshots.

```typescript
describe('Snapshot Tests', () => {
    it('ledger state matches snapshot after setup', async () => {
        await ctx.call('initialize', [initialConfig]);

        const ledgerState = await ctx.ledger.snapshot();
        expect(ledgerState).toMatchSnapshot();
    });

    it('state after standard operations matches snapshot', async () => {
        await performStandardSetup(ctx);

        const ledgerState = await ctx.ledger.snapshot();
        expect(ledgerState).toMatchSnapshot();
    });
});
```

## Testing Merkle Tree Operations

Merkle trees require special attention for path generation.

```typescript
describe('Merkle Tree Membership', () => {
    let tree: MerkleTree;

    beforeEach(async () => {
        ctx = await TestContext.create('membership.compact');
        tree = new MerkleTree(20);  // 20 levels
    });

    it('proves membership with valid path', async () => {
        // Add member to tree
        const member = computeLeaf(aliceData);
        tree.insert(member);

        // Get proof path
        const path = tree.getPath(member);

        // Create witness that returns the path
        const witnesses = {
            get_member_data: () => aliceData,
            get_merkle_path: () => path
        };

        // Verify membership
        const result = await ctx.call(
            'verify_membership',
            [tree.root()],
            witnesses
        );

        expect(result.returnValue).toBe(true);
    });

    it('rejects non-member with invalid path', async () => {
        const nonMember = computeLeaf(malloryData);
        const fakePath = generateRandomPath();

        const witnesses = {
            get_member_data: () => malloryData,
            get_merkle_path: () => fakePath
        };

        const result = await ctx.call(
            'verify_membership',
            [tree.root()],
            witnesses
        );

        expect(result.returnValue).toBe(false);
    });
});
```

## Test Organization Best Practices

### 1. Structure Tests by Feature

```
tests/
  token/
    transfer.test.ts
    mint.test.ts
    burn.test.ts
  voting/
    create-proposal.test.ts
    cast-vote.test.ts
    tally.test.ts
  shared/
    test-utils.ts
    mock-witnesses.ts
```

### 2. Use Descriptive Test Names

```typescript
// Good
it('rejects transfer when sender balance is less than amount')
it('updates both sender and recipient balances after transfer')
it('emits Transfer event with correct parameters')

// Bad
it('transfer test 1')
it('should work')
it('test')
```

### 3. Keep Tests Independent

```typescript
// Good: Each test sets up its own state
beforeEach(async () => {
    ctx = await TestContext.create('contract.compact');
});

// Bad: Tests depend on order
it('first test modifies state', async () => { ... });
it('second test assumes first ran', async () => { ... });
```

### 4. Test Both Happy Path and Edge Cases

```typescript
describe('division', () => {
    // Happy path
    it('divides two numbers correctly', async () => {
        const result = await ctx.call('divide', [BigInt(10), BigInt(2)]);
        expect(result.returnValue).toBe(BigInt(5));
    });

    // Edge cases
    it('handles division by one', async () => {
        const result = await ctx.call('divide', [BigInt(42), BigInt(1)]);
        expect(result.returnValue).toBe(BigInt(42));
    });

    it('handles zero numerator', async () => {
        const result = await ctx.call('divide', [BigInt(0), BigInt(5)]);
        expect(result.returnValue).toBe(BigInt(0));
    });

    // Error case
    it('rejects division by zero', async () => {
        await expect(
            ctx.call('divide', [BigInt(10), BigInt(0)])
        ).rejects.toThrow('Division by zero');
    });
});
```

## Continuous Integration

### Example GitHub Actions Workflow

```yaml
name: Test Compact Contracts

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Compile Compact contracts
        run: npm run compile

      - name: Run tests
        run: npm test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```
