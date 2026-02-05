# State Inspection

Comprehensive guide to querying, analyzing, and monitoring Midnight contract state for debugging, auditing, and operational visibility.

## State Access Methods

### Via Contract Circuits

Query state through read-only circuits defined in the contract:

```typescript
import { connectContract } from '@midnight-ntwrk/midnight-js-contracts';

const contract = await connectContract({
  address: CONTRACT_ADDRESS,
  artifact: Contract,
  wallet,
  config,
});

// Query specific state values
const balance = await contract.query.get_balance({ address });
const totalSupply = await contract.query.get_total_supply();
const owner = await contract.query.get_owner();
```

**Advantages:**
- Type-safe with TypeScript
- Respects access control in circuit
- Returns processed/formatted data

**Limitations:**
- Only exposed state is accessible
- Requires circuit to exist for each query

### Via Indexer API

Query raw state directly from the indexer:

```typescript
import { createIndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

const indexer = createIndexerClient({
  url: 'https://indexer.testnet.midnight.network',
});

// Get contract info
const info = await indexer.getContractInfo(CONTRACT_ADDRESS);
console.log('Contract info:', {
  address: info.address,
  codeHash: info.codeHash,
  createdBlock: info.createdBlock,
  lastUpdateBlock: info.lastUpdateBlock,
});

// Get raw state
const rawState = await indexer.getContractState(CONTRACT_ADDRESS);
```

**Advantages:**
- Access all state fields
- Historical state queries possible
- No circuit required

**Limitations:**
- Raw format requires interpretation
- No type safety
- May expose internal implementation details

## State Structure Analysis

### Understanding Ledger State

Compact contracts define state in the `ledger` block:

```compact
ledger {
  balances: Map<Address, Uint>;
  totalSupply: Uint;
  owner: Address;
  metadata: {
    name: String;
    symbol: String;
    decimals: Uint;
  };
}
```

The compiled state follows a predictable structure:

```typescript
interface ContractState {
  balances: Map<string, bigint>;
  totalSupply: bigint;
  owner: string;
  metadata: {
    name: string;
    symbol: string;
    decimals: bigint;
  };
}
```

### Parsing Raw State

```typescript
interface RawContractState {
  fields: Array<{
    name: string;
    value: unknown;
    type: string;
  }>;
}

function parseRawState<T>(raw: RawContractState): T {
  const state: Record<string, unknown> = {};

  for (const field of raw.fields) {
    state[field.name] = parseFieldValue(field.value, field.type);
  }

  return state as T;
}

function parseFieldValue(value: unknown, type: string): unknown {
  switch (type) {
    case 'Uint':
    case 'Int':
      return BigInt(value as string);

    case 'Address':
    case 'String':
      return value as string;

    case 'Boolean':
      return value === 'true' || value === true;

    case 'Map':
      return parseMap(value as Array<[unknown, unknown]>);

    default:
      return value;
  }
}
```

## State Comparison

### Diff Between States

```typescript
interface StateDiff {
  added: Map<string, unknown>;
  removed: Map<string, unknown>;
  changed: Map<string, { from: unknown; to: unknown }>;
}

function compareStates<T extends Record<string, unknown>>(
  before: T,
  after: T
): StateDiff {
  const diff: StateDiff = {
    added: new Map(),
    removed: new Map(),
    changed: new Map(),
  };

  const allKeys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]);

  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];

    if (beforeVal === undefined) {
      diff.added.set(key, afterVal);
    } else if (afterVal === undefined) {
      diff.removed.set(key, beforeVal);
    } else if (!deepEqual(beforeVal, afterVal)) {
      diff.changed.set(key, { from: beforeVal, to: afterVal });
    }
  }

  return diff;
}

// Usage
const stateBefore = await contract.query.get_full_state();
// ... perform some operations ...
const stateAfter = await contract.query.get_full_state();

const diff = compareStates(stateBefore, stateAfter);
console.log('State changes:', diff);
```

### Historical State Analysis

```typescript
async function getStateHistory(
  indexer: IndexerClient,
  address: string,
  fromBlock: number,
  toBlock: number
): Promise<Array<{ block: number; state: unknown }>> {
  const history: Array<{ block: number; state: unknown }> = [];

  // Get transaction history
  const transactions = await indexer.getContractTransactions(address, {
    fromBlock,
    toBlock,
  });

  // Get state at each transaction block
  for (const tx of transactions) {
    const state = await indexer.getContractStateAtBlock(address, tx.blockHeight);
    history.push({
      block: tx.blockHeight,
      state,
    });
  }

  return history;
}
```

## Monitoring Patterns

### Real-Time State Monitoring

```typescript
import { createIndexerWsClient } from '@midnight-ntwrk/midnight-js-indexer';

class StateMonitor {
  private ws: IndexerWsClient;
  private handlers: Map<string, (state: unknown) => void> = new Map();

  constructor(wsUrl: string) {
    this.ws = createIndexerWsClient({ url: wsUrl });
  }

  async start(): Promise<void> {
    await this.ws.connect();
  }

  async watchContract(
    address: string,
    onStateChange: (state: unknown) => void
  ): Promise<string> {
    const subscriptionId = await this.ws.subscribe('contractState', {
      address,
    });

    this.ws.on(subscriptionId, (event) => {
      onStateChange(event.newState);
    });

    this.handlers.set(address, onStateChange);
    return subscriptionId;
  }

  async stopWatching(subscriptionId: string): Promise<void> {
    await this.ws.unsubscribe(subscriptionId);
  }

  async stop(): Promise<void> {
    this.handlers.clear();
    await this.ws.close();
  }
}

// Usage
const monitor = new StateMonitor('wss://indexer.testnet.midnight.network/ws');
await monitor.start();

await monitor.watchContract(CONTRACT_ADDRESS, (state) => {
  console.log('State changed:', state);
  // Trigger alerts, update dashboards, etc.
});
```

### State Validation

```typescript
interface ValidationRule<T> {
  name: string;
  validate: (state: T) => boolean;
  severity: 'error' | 'warning' | 'info';
}

class StateValidator<T> {
  constructor(private rules: ValidationRule<T>[]) {}

  validate(state: T): Array<{ rule: string; severity: string; passed: boolean }> {
    return this.rules.map((rule) => ({
      rule: rule.name,
      severity: rule.severity,
      passed: rule.validate(state),
    }));
  }
}

// Example rules
const tokenRules: ValidationRule<TokenState>[] = [
  {
    name: 'Total supply matches sum of balances',
    severity: 'error',
    validate: (state) => {
      const sum = Array.from(state.balances.values()).reduce(
        (a, b) => a + b,
        0n
      );
      return sum === state.totalSupply;
    },
  },
  {
    name: 'Owner address is set',
    severity: 'warning',
    validate: (state) => state.owner !== '',
  },
];

const validator = new StateValidator(tokenRules);
const results = validator.validate(currentState);
```

## Debugging State Issues

### Common State Problems

| Problem | Symptom | Investigation |
|---------|---------|---------------|
| Stale state | Queries return old data | Check indexer sync status |
| Missing fields | Undefined values | Verify contract version |
| Corrupt state | Invalid values | Compare with expected types |
| Inconsistent state | Values don't match | Run validation rules |

### Debug Session Example

```typescript
async function debugContractState(address: string): Promise<void> {
  console.log('=== Contract State Debug Session ===');
  console.log('Address:', address);

  // 1. Check contract exists
  const info = await indexer.getContractInfo(address);
  if (!info) {
    console.error('Contract not found!');
    return;
  }
  console.log('Contract found, created at block:', info.createdBlock);

  // 2. Get current state
  const state = await indexer.getContractState(address);
  console.log('Raw state:', JSON.stringify(state, null, 2));

  // 3. Parse and validate
  const parsed = parseRawState<ContractState>(state);
  console.log('Parsed state:', parsed);

  // 4. Run validation
  const validation = validator.validate(parsed);
  console.log('Validation results:', validation);

  // 5. Check recent activity
  const recentTxs = await indexer.getContractTransactions(address, {
    limit: 10,
  });
  console.log('Recent transactions:', recentTxs.length);
}
```

## Related Resources

- [migration-patterns.md](migration-patterns.md) - Using state inspection for migrations
- `midnight-indexer` plugin - Advanced indexer queries
- `contract-calling` skill - Invoking state query circuits
