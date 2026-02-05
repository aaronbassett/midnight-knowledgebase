# Deployment Configuration

Comprehensive guide to configuring Midnight contract deployments, including environment variables, configuration files, wallet setup, and transaction management.

## Environment Variables

Configure deployments using environment variables for flexibility across environments:

```bash
# Network selection
MIDNIGHT_NETWORK=testnet           # 'testnet' or 'mainnet'

# Endpoint overrides (optional, defaults provided per network)
MIDNIGHT_INDEXER_URL=https://indexer.testnet.midnight.network
MIDNIGHT_INDEXER_WS_URL=wss://indexer.testnet.midnight.network/ws
MIDNIGHT_PROVER_URL=https://prover.testnet.midnight.network

# Wallet configuration
MIDNIGHT_WALLET_SEED=your-seed-phrase-here
MIDNIGHT_WALLET_KEY_INDEX=0        # Account index to use

# Deployment options
MIDNIGHT_GAS_LIMIT=1000000         # Maximum gas for deployment
MIDNIGHT_CONFIRMATION_TIMEOUT=60000 # Timeout in ms
```

**Security Note**: Never commit `.env` files containing wallet seeds. Use secret management in production.

## Configuration File Format

For projects requiring detailed configuration, use a `midnight.config.ts` file:

```typescript
import type { MidnightConfig } from '@midnight-ntwrk/midnight-js-types';

const config: MidnightConfig = {
  network: 'testnet',

  endpoints: {
    indexer: process.env.MIDNIGHT_INDEXER_URL,
    indexerWs: process.env.MIDNIGHT_INDEXER_WS_URL,
    prover: process.env.MIDNIGHT_PROVER_URL,
  },

  deployment: {
    gasLimit: 1000000,
    confirmationBlocks: 1,
    timeout: 60000,
  },

  contracts: {
    myContract: {
      path: './build/my-contract.cjs',
      initialState: {},
    },
  },
};

export default config;
```

## Wallet Setup for Deployment

### Creating a Wallet

```typescript
import { createWallet } from '@midnight-ntwrk/midnight-js-wallet';

// From seed phrase
const wallet = await createWallet({
  seed: process.env.MIDNIGHT_WALLET_SEED!,
  keyIndex: parseInt(process.env.MIDNIGHT_WALLET_KEY_INDEX || '0'),
});

// Get wallet address
const address = await wallet.getAddress();
console.log('Deployer address:', address);
```

### Checking Balance

Before deployment, verify sufficient funds:

```typescript
import { createIndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

const indexer = createIndexerClient({
  url: config.endpoints.indexer,
});

const balance = await indexer.getBalance(address);
console.log('Balance:', balance.unshielded, 'tDUST');

// Minimum recommended for contract deployment
const MIN_DEPLOYMENT_BALANCE = BigInt(10_000_000);
if (balance.unshielded < MIN_DEPLOYMENT_BALANCE) {
  throw new Error('Insufficient balance for deployment');
}
```

### Funding on Testnet

For testnet deployments, obtain tDUST from the faucet:

1. Visit https://midnight.network/test-faucet/
2. Enter your wallet address
3. Request test tokens
4. Wait for confirmation (usually 30-60 seconds)

## Gas Estimation

Estimate deployment costs before submitting:

```typescript
import { estimateDeploymentGas } from '@midnight-ntwrk/midnight-js-contracts';

const estimate = await estimateDeploymentGas({
  artifact: contractArtifact,
  initialState: { /* ... */ },
  proverUrl: config.endpoints.prover,
});

console.log('Estimated gas:', estimate.gas);
console.log('Estimated cost:', estimate.cost, 'DUST');
```

**Factors affecting gas costs:**
- Contract bytecode size
- Initial state complexity
- Number of circuits
- Circuit proving key sizes

## Transaction Confirmation

Wait for deployment confirmation with proper error handling:

```typescript
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';

const deployment = await deployContract({
  wallet,
  artifact: contractArtifact,
  initialState: {},
  config: networkConfig,
});

// Wait for confirmation
const confirmed = await deployment.waitForConfirmation({
  timeout: 60000,
  confirmations: 1,
});

if (confirmed.status === 'confirmed') {
  console.log('Contract deployed at:', confirmed.address);
  console.log('Transaction hash:', confirmed.txHash);
  console.log('Block height:', confirmed.blockHeight);
} else if (confirmed.status === 'timeout') {
  console.error('Deployment timed out, check transaction manually');
  console.log('Transaction hash:', deployment.txHash);
} else {
  console.error('Deployment failed:', confirmed.error);
}
```

## Configuration Best Practices

### Use Exact Package Versions

Avoid version ranges in `package.json`:

```json
{
  "dependencies": {
    "@midnight-ntwrk/midnight-js-contracts": "0.9.0",
    "@midnight-ntwrk/midnight-js-wallet": "0.9.0",
    "@midnight-ntwrk/midnight-js-indexer": "0.9.0"
  }
}
```

### Separate Configurations by Environment

```typescript
// config/testnet.ts
export const testnetConfig = {
  network: 'testnet' as const,
  endpoints: {
    indexer: 'https://indexer.testnet.midnight.network',
    indexerWs: 'wss://indexer.testnet.midnight.network/ws',
    prover: 'https://prover.testnet.midnight.network',
  },
};

// config/mainnet.ts
export const mainnetConfig = {
  network: 'mainnet' as const,
  endpoints: {
    indexer: 'https://indexer.midnight.network',
    indexerWs: 'wss://indexer.midnight.network/ws',
    prover: 'https://prover.midnight.network',
  },
};

// config/index.ts
export const config = process.env.MIDNIGHT_NETWORK === 'mainnet'
  ? mainnetConfig
  : testnetConfig;
```

### Validate Configuration at Startup

```typescript
function validateConfig(config: MidnightConfig): void {
  if (!config.endpoints.indexer) {
    throw new Error('Missing indexer endpoint');
  }
  if (!config.endpoints.prover) {
    throw new Error('Missing prover endpoint');
  }
  if (!process.env.MIDNIGHT_WALLET_SEED) {
    throw new Error('Missing wallet seed');
  }
}
```

## Common Configuration Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Wrong endpoint URL | Verify endpoint URLs are correct for network |
| `Insufficient funds` | Low balance | Fund wallet from faucet or transfer funds |
| `Invalid seed` | Malformed seed phrase | Check seed is valid BIP39 mnemonic |
| `Timeout` | Slow network | Increase `MIDNIGHT_CONFIRMATION_TIMEOUT` |
| `Version mismatch` | Package incompatibility | Align all `@midnight-ntwrk` package versions |

## Related Resources

- [network-endpoints.md](network-endpoints.md) - Detailed endpoint documentation
- `midnight-setup` skill - Environment setup guide
- `midnight-debugging` skill - Troubleshooting deployment issues
