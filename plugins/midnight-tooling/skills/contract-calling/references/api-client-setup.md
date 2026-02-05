# API Client Setup

Complete guide to initializing the Midnight SDK, configuring providers, and establishing wallet connections for contract interactions.

## SDK Installation

Install the required Midnight packages:

```bash
npm install @midnight-ntwrk/midnight-js-contracts \
            @midnight-ntwrk/midnight-js-wallet \
            @midnight-ntwrk/midnight-js-indexer \
            @midnight-ntwrk/midnight-js-types
```

**Important**: Use exact versions without `^` or `~` prefixes to ensure compatibility:

```json
{
  "dependencies": {
    "@midnight-ntwrk/midnight-js-contracts": "0.9.0",
    "@midnight-ntwrk/midnight-js-wallet": "0.9.0",
    "@midnight-ntwrk/midnight-js-indexer": "0.9.0",
    "@midnight-ntwrk/midnight-js-types": "0.9.0"
  }
}
```

## Wallet Initialization

### From Seed Phrase

```typescript
import { createWallet, Wallet } from '@midnight-ntwrk/midnight-js-wallet';

const wallet: Wallet = await createWallet({
  seed: process.env.MIDNIGHT_WALLET_SEED!,
  keyIndex: 0, // Account index
});

const address = await wallet.getAddress();
console.log('Wallet address:', address);
```

### Multiple Accounts from Same Seed

```typescript
// Create wallets for different purposes
const deployerWallet = await createWallet({
  seed: process.env.WALLET_SEED!,
  keyIndex: 0,
});

const operatorWallet = await createWallet({
  seed: process.env.WALLET_SEED!,
  keyIndex: 1,
});

const treasuryWallet = await createWallet({
  seed: process.env.WALLET_SEED!,
  keyIndex: 2,
});
```

### Wallet Security Best Practices

```typescript
// Load seed securely
function loadWalletSeed(): string {
  const seed = process.env.MIDNIGHT_WALLET_SEED;

  if (!seed) {
    throw new Error('MIDNIGHT_WALLET_SEED environment variable required');
  }

  // Validate BIP39 format (24 words)
  const words = seed.trim().split(/\s+/);
  if (words.length !== 24) {
    throw new Error('Invalid seed phrase: expected 24 words');
  }

  return seed;
}

// Never log or expose the seed
const wallet = await createWallet({
  seed: loadWalletSeed(),
  keyIndex: 0,
});
```

## Provider Configuration

### Network Config Type

```typescript
import type { NetworkConfig } from '@midnight-ntwrk/midnight-js-types';

const testnetConfig: NetworkConfig = {
  indexer: 'https://indexer.testnet.midnight.network',
  indexerWs: 'wss://indexer.testnet.midnight.network/ws',
  prover: 'https://prover.testnet.midnight.network',
};

const mainnetConfig: NetworkConfig = {
  indexer: 'https://indexer.midnight.network',
  indexerWs: 'wss://indexer.midnight.network/ws',
  prover: 'https://prover.midnight.network',
};
```

### Environment-Based Configuration

```typescript
function getNetworkConfig(): NetworkConfig {
  const network = process.env.MIDNIGHT_NETWORK || 'testnet';

  const configs: Record<string, NetworkConfig> = {
    testnet: {
      indexer: process.env.INDEXER_URL || 'https://indexer.testnet.midnight.network',
      indexerWs: process.env.INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/ws',
      prover: process.env.PROVER_URL || 'https://prover.testnet.midnight.network',
    },
    mainnet: {
      indexer: process.env.INDEXER_URL || 'https://indexer.midnight.network',
      indexerWs: process.env.INDEXER_WS_URL || 'wss://indexer.midnight.network/ws',
      prover: process.env.PROVER_URL || 'https://prover.midnight.network',
    },
  };

  const config = configs[network];
  if (!config) {
    throw new Error(`Unknown network: ${network}`);
  }

  return config;
}
```

## Contract Connection

### Connecting to a Deployed Contract

```typescript
import { connectContract, ConnectedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { Contract } from './build/contract.cjs';
import type { ContractState, ContractMethods } from './build/contract.d.cts';

async function connectToContract(
  address: string,
  wallet: Wallet,
  config: NetworkConfig
): Promise<ConnectedContract<ContractState, ContractMethods>> {
  return connectContract({
    address,
    artifact: Contract,
    wallet,
    config,
  });
}
```

### TypeScript Type Imports

Import types from the compiled contract for type safety:

```typescript
// From compiled contract (contract.d.cts)
import type {
  ContractState,      // Ledger state type
  ContractMethods,    // Available circuit methods
  TransferParams,     // Input parameters for transfer circuit
  TransferResult,     // Return type from transfer circuit
} from './build/contract.d.cts';

// Type-safe contract connection
const contract: ConnectedContract<ContractState, ContractMethods> =
  await connectContract({
    address,
    artifact: Contract,
    wallet,
    config,
  });

// Type-checked method calls
const result = await contract.call.transfer({
  to: '0x...',   // TypeScript validates this parameter
  amount: 100n,  // BigInt required
});
```

## Client Factory Pattern

Create a reusable factory for contract clients:

```typescript
import { connectContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet } from '@midnight-ntwrk/midnight-js-wallet';

interface ClientConfig {
  walletSeed: string;
  keyIndex?: number;
  network?: 'testnet' | 'mainnet';
}

class MidnightClientFactory {
  private wallet: Wallet | null = null;
  private config: NetworkConfig;

  constructor(clientConfig: ClientConfig) {
    this.config = getNetworkConfig(clientConfig.network || 'testnet');
  }

  async initialize(clientConfig: ClientConfig): Promise<void> {
    this.wallet = await createWallet({
      seed: clientConfig.walletSeed,
      keyIndex: clientConfig.keyIndex || 0,
    });
  }

  async connectContract<S, M>(
    address: string,
    artifact: ContractArtifact
  ): Promise<ConnectedContract<S, M>> {
    if (!this.wallet) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    return connectContract({
      address,
      artifact,
      wallet: this.wallet,
      config: this.config,
    });
  }

  getWalletAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Client not initialized');
    }
    return this.wallet.getAddress();
  }
}

// Usage
const factory = new MidnightClientFactory({
  walletSeed: process.env.WALLET_SEED!,
  network: 'testnet',
});

await factory.initialize();

const tokenContract = await factory.connectContract(
  TOKEN_ADDRESS,
  TokenContract
);
```

## Connection Pooling

For high-throughput applications, implement connection pooling:

```typescript
class ContractPool<S, M> {
  private connections: ConnectedContract<S, M>[] = [];
  private currentIndex = 0;

  constructor(
    private address: string,
    private artifact: ContractArtifact,
    private config: NetworkConfig,
    private poolSize: number = 3
  ) {}

  async initialize(wallets: Wallet[]): Promise<void> {
    for (let i = 0; i < this.poolSize; i++) {
      const connection = await connectContract({
        address: this.address,
        artifact: this.artifact,
        wallet: wallets[i % wallets.length],
        config: this.config,
      });
      this.connections.push(connection);
    }
  }

  getConnection(): ConnectedContract<S, M> {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return connection;
  }
}
```

## Health Checks

Verify connectivity before operations:

```typescript
import { createIndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

async function checkConnectivity(config: NetworkConfig): Promise<boolean> {
  try {
    const indexer = createIndexerClient({ url: config.indexer });
    const health = await indexer.health();
    return health.status === 'ok';
  } catch {
    return false;
  }
}

// Use before contract operations
async function ensureConnected(config: NetworkConfig): Promise<void> {
  const connected = await checkConnectivity(config);
  if (!connected) {
    throw new Error('Cannot connect to Midnight network');
  }
}
```

## Related Resources

- [error-handling.md](error-handling.md) - Handling connection and call errors
- `contract-deployment` skill - Deploying contracts before connecting
- `midnight-setup` skill - Environment prerequisites
