# Migration Patterns

Strategies and patterns for migrating Midnight contracts between versions, including state transfer, zero-downtime migrations, and rollback procedures.

## Migration Overview

Since Midnight contracts are immutable, "upgrading" a contract requires deploying a new version and migrating state. This reference covers proven patterns for safe migrations.

## Migration Strategies

### 1. Snapshot & Deploy (Simple Migration)

Best for: Small state, acceptable downtime

```
Old Contract ─── Export State ───▶ Deploy New ─── Import State
     │                                  │
     │                                  │
     ▼                                  ▼
 Deprecate                          Activate
```

```typescript
async function snapshotMigration(
  oldContract: ConnectedContract,
  newArtifact: ContractArtifact,
  wallet: Wallet,
  config: NetworkConfig
): Promise<string> {
  // 1. Export state from old contract
  console.log('Exporting state...');
  const state = await oldContract.query.export_state();

  // 2. Deploy new contract with exported state
  console.log('Deploying new contract...');
  const newContract = await deployContract({
    wallet,
    artifact: newArtifact,
    initialState: transformState(state),
    config,
  });

  await newContract.waitForConfirmation();

  // 3. Mark old as deprecated (if supported)
  try {
    await oldContract.call.deprecate({
      successor: newContract.address,
    });
  } catch {
    console.log('Old contract does not support deprecation');
  }

  return newContract.address;
}
```

### 2. Proxy Pattern

Best for: Frequent upgrades, complex systems

```
User ───▶ Proxy Contract ───▶ Implementation v1
               │
               │ (upgrade)
               ▼
          Implementation v2
```

**Proxy Contract (Compact):**
```compact
ledger {
  implementation: Address;
  admin: Address;
}

circuit upgrade(new_impl: Address): Void {
  assert(sender == ledger.admin, "Only admin");
  ledger.implementation = new_impl;
}

circuit forward(method: Bytes, params: Bytes): Bytes {
  return delegate_call(ledger.implementation, method, params);
}
```

**TypeScript Usage:**
```typescript
class UpgradeableContract {
  constructor(
    private proxy: ConnectedContract,
    private wallet: Wallet,
    private config: NetworkConfig
  ) {}

  async upgrade(newImplementation: string): Promise<void> {
    await this.proxy.call.upgrade({
      new_impl: newImplementation,
    });
    console.log('Upgraded to:', newImplementation);
  }

  async getImplementation(): Promise<string> {
    return this.proxy.query.get_implementation();
  }
}
```

### 3. Dual-Write Migration

Best for: Zero-downtime requirements, large user bases

```
                    ┌─── Write ───▶ Old Contract
User ───▶ Router ───┤
                    └─── Write ───▶ New Contract
                           │
                           ▼ (verify)
                    ┌─── Read ────▶ New Contract
User ───▶ Router ───┘
```

```typescript
class DualWriteRouter {
  constructor(
    private oldContract: ConnectedContract,
    private newContract: ConnectedContract
  ) {}

  async write(method: string, params: unknown): Promise<void> {
    // Write to both contracts
    const results = await Promise.allSettled([
      this.oldContract.call[method](params),
      this.newContract.call[method](params),
    ]);

    // Check for consistency
    const oldResult = results[0];
    const newResult = results[1];

    if (oldResult.status === 'fulfilled' && newResult.status === 'rejected') {
      console.error('New contract failed, rolling back may be needed');
      throw newResult.reason;
    }

    // Log any discrepancies for monitoring
    if (oldResult.status !== newResult.status) {
      console.warn('Write results differ between contracts');
    }
  }

  async read(method: string, params: unknown): Promise<unknown> {
    // Read from new contract (source of truth after migration)
    return this.newContract.query[method](params);
  }
}
```

### 4. Lazy Migration

Best for: Very large state, gradual transitions

```typescript
interface LazyMigrator {
  migrateAccount(address: string): Promise<void>;
  isMigrated(address: string): Promise<boolean>;
}

class LazyMigrationContract implements LazyMigrator {
  constructor(
    private oldContract: ConnectedContract,
    private newContract: ConnectedContract
  ) {}

  async migrateAccount(address: string): Promise<void> {
    // Check if already migrated
    if (await this.isMigrated(address)) {
      console.log(`${address} already migrated`);
      return;
    }

    // Get state from old contract
    const balance = await this.oldContract.query.get_balance({ address });
    const metadata = await this.oldContract.query.get_account_metadata({ address });

    // Migrate to new contract
    await this.newContract.call.import_account({
      address,
      balance,
      metadata,
    });

    console.log(`Migrated ${address}`);
  }

  async isMigrated(address: string): Promise<boolean> {
    try {
      const migrated = await this.newContract.query.is_migrated({ address });
      return migrated;
    } catch {
      return false;
    }
  }

  async batchMigrate(addresses: string[], batchSize = 10): Promise<void> {
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      await Promise.all(batch.map((addr) => this.migrateAccount(addr)));
      console.log(`Migrated ${Math.min(i + batchSize, addresses.length)} / ${addresses.length}`);
    }
  }
}
```

## State Transformation

### Schema Evolution

Handle state schema changes during migration:

```typescript
interface StateTransformer<OldState, NewState> {
  transform(old: OldState): NewState;
  validate(transformed: NewState): boolean;
}

// Example: Adding a new field
const v1ToV2Transformer: StateTransformer<V1State, V2State> = {
  transform(old: V1State): V2State {
    return {
      ...old,
      // New field with default value
      lastUpdated: Date.now(),
      // Renamed field
      tokenSymbol: old.symbol,
      // Removed field: old.deprecated is not included
    };
  },

  validate(state: V2State): boolean {
    return (
      state.lastUpdated > 0 &&
      typeof state.tokenSymbol === 'string'
    );
  },
};
```

### Data Type Migrations

```typescript
// Example: Migrating from number to bigint
function migrateBalances(
  oldBalances: Map<string, number>
): Map<string, bigint> {
  const newBalances = new Map<string, bigint>();

  for (const [address, balance] of oldBalances) {
    newBalances.set(address, BigInt(balance));
  }

  return newBalances;
}

// Example: Restructuring nested data
function migrateMetadata(old: OldMetadata): NewMetadata {
  return {
    basic: {
      name: old.name,
      symbol: old.symbol,
    },
    extended: {
      decimals: old.decimals,
      totalSupply: old.totalSupply,
      // New grouping
    },
  };
}
```

## Rollback Procedures

### Pre-Migration Backup

```typescript
interface MigrationBackup {
  timestamp: string;
  oldContractAddress: string;
  stateSnapshot: unknown;
  blockHeight: number;
}

async function createBackup(
  contract: ConnectedContract,
  indexer: IndexerClient
): Promise<MigrationBackup> {
  const state = await contract.query.export_state();
  const info = await indexer.getContractInfo(contract.address);

  const backup: MigrationBackup = {
    timestamp: new Date().toISOString(),
    oldContractAddress: contract.address,
    stateSnapshot: state,
    blockHeight: info.lastUpdateBlock,
  };

  // Save to file
  const filename = `backup-${contract.address}-${backup.blockHeight}.json`;
  await fs.writeFile(filename, JSON.stringify(backup, null, 2));

  console.log(`Backup saved to ${filename}`);
  return backup;
}
```

### Rollback Execution

```typescript
async function rollback(
  backup: MigrationBackup,
  newContractAddress: string,
  wallet: Wallet,
  config: NetworkConfig
): Promise<void> {
  console.log('Starting rollback...');

  // Option 1: Restore old contract (if deprecation is reversible)
  const oldContract = await connectContract({
    address: backup.oldContractAddress,
    artifact: OldContract,
    wallet,
    config,
  });

  try {
    await oldContract.call.undeprecate();
    console.log('Old contract reactivated');
  } catch {
    console.log('Cannot reactivate old contract');
  }

  // Option 2: Deploy fresh with backup state
  const restoredContract = await deployContract({
    wallet,
    artifact: OldContract,
    initialState: backup.stateSnapshot,
    config,
  });

  console.log('Restored contract at:', restoredContract.address);

  // Update routing/references
  console.log('Update your references to:', restoredContract.address);
}
```

## Migration Checklist

Before migration:
- [ ] Create comprehensive state backup
- [ ] Test migration on testnet
- [ ] Verify state transformation logic
- [ ] Prepare rollback procedure
- [ ] Notify users of downtime (if any)
- [ ] Document new contract address

During migration:
- [ ] Execute state export
- [ ] Deploy new contract
- [ ] Verify state import
- [ ] Run validation checks
- [ ] Update routing/references

After migration:
- [ ] Monitor new contract
- [ ] Verify all functionality
- [ ] Deprecate old contract
- [ ] Update documentation
- [ ] Archive backup

## Related Resources

- [state-inspection.md](state-inspection.md) - Inspecting state for migration
- `contract-deployment` skill - Deploying new versions
- `midnight-indexer` plugin - Historical state queries
