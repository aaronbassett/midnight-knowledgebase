# Contract Deployment from TypeScript

Complete guide to deploying Midnight Compact contracts from TypeScript applications.

## Prerequisites

```typescript
import { MidnightProvider } from '@midnight-ntwrk/midnight-js-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { TokenContract, Witnesses } from './build/token';
```

## Basic Deployment

### 1. Create Provider

```typescript
const provider = new MidnightProvider({
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.midnight.network',
  indexerUrl: 'https://indexer.testnet.midnight.network'
});

// Connect wallet
await provider.connect();
const walletAddress = await provider.getAddress();
```

### 2. Prepare Initial State

```typescript
// Define initial ledger state matching your contract
interface LedgerState {
  admin: Uint8Array;
  total_supply: bigint;
  is_paused: boolean;
}

const initialLedgerState: LedgerState = {
  admin: walletAddress,
  total_supply: 1_000_000n * 10n ** 18n,  // 1M tokens with 18 decimals
  is_paused: false
};
```

### 3. Prepare Private State

```typescript
interface PrivateState {
  adminKey: Uint8Array;
  nonce: bigint;
}

const initialPrivateState: PrivateState = {
  adminKey: generateSecretKey(),
  nonce: 0n
};
```

### 4. Create Witnesses

```typescript
const witnesses: Witnesses = {
  get_admin_key: ({ privateState }) => privateState.adminKey,
  get_nonce: ({ privateState, setPrivateState }) => {
    const nonce = privateState.nonce;
    setPrivateState({ ...privateState, nonce: nonce + 1n });
    return nonce;
  }
};
```

### 5. Deploy Contract

```typescript
const deployment = await deployContract<LedgerState, PrivateState>(provider, {
  contractModule: TokenContract,
  initialLedgerState,
  initialPrivateState,
  witnesses,
  privateStateKey: 'my-token-contract'
});

console.log('Contract deployed at:', deployment.contractAddress);
console.log('Deployment tx:', deployment.transactionHash);
```

## Deployment Options

```typescript
const deployment = await deployContract(provider, {
  contractModule: TokenContract,
  initialLedgerState,
  initialPrivateState,
  witnesses,
  privateStateKey: 'my-token-contract',

  // Optional configuration
  options: {
    // Gas limit for deployment
    gasLimit: 5_000_000n,

    // Timeout for deployment confirmation
    timeout: 120_000,

    // Number of block confirmations to wait
    confirmations: 2,

    // Callback when proof generation completes
    onProofGenerated: (proof) => {
      console.log('Deployment proof generated');
    },

    // Callback when transaction is submitted
    onTransactionSubmitted: (txHash) => {
      console.log('Deployment tx submitted:', txHash);
    }
  }
});
```

## Deployment Result

```typescript
interface DeploymentResult<State, PrivateState> {
  // Deployed contract instance
  contract: Contract<State, PrivateState>;

  // Contract address on chain
  contractAddress: string;

  // Deployment transaction hash
  transactionHash: string;

  // Block number where contract was deployed
  blockNumber: bigint;

  // Gas used for deployment
  gasUsed: bigint;
}
```

## Multi-Contract Deployment

Deploy multiple related contracts.

```typescript
async function deployTokenSystem(provider: MidnightProvider) {
  // 1. Deploy token contract first
  const tokenDeployment = await deployContract(provider, {
    contractModule: TokenContract,
    initialLedgerState: {
      admin: provider.address,
      total_supply: 0n
    },
    initialPrivateState: { adminKey },
    witnesses: tokenWitnesses,
    privateStateKey: 'token'
  });

  // 2. Deploy governance contract with token address
  const governanceDeployment = await deployContract(provider, {
    contractModule: GovernanceContract,
    initialLedgerState: {
      token_address: hexToBytes(tokenDeployment.contractAddress),
      proposal_threshold: 100_000n * 10n ** 18n,
      voting_period: 7n * 24n * 60n * 60n  // 7 days in seconds
    },
    initialPrivateState: { voterKey },
    witnesses: governanceWitnesses,
    privateStateKey: 'governance'
  });

  // 3. Configure token to recognize governance
  await tokenDeployment.contract.callTx.set_governance(
    hexToBytes(governanceDeployment.contractAddress),
    tokenWitnesses
  );

  return {
    token: tokenDeployment,
    governance: governanceDeployment
  };
}
```

## Contract Upgrade Pattern

Midnight contracts are immutable, but you can implement upgrade patterns.

```typescript
// Deploy new version
const newVersion = await deployContract(provider, {
  contractModule: TokenContractV2,
  initialLedgerState: {
    admin: currentAdmin,
    total_supply: currentSupply,
    // New fields in v2
    upgrade_timestamp: BigInt(Date.now())
  },
  initialPrivateState,
  witnesses: v2Witnesses,
  privateStateKey: 'token-v2'
});

// Migrate state if needed
await migrateBalances(oldContract, newVersion.contract);

// Update references in other contracts
await registryContract.callTx.update_token_address(
  hexToBytes(newVersion.contractAddress),
  registryWitnesses
);
```

## Local Testing Deployment

Use a local development environment.

```typescript
import { createLocalProvider } from '@midnight-ntwrk/midnight-js-testing';

async function testDeployment() {
  // Create local test provider
  const provider = await createLocalProvider({
    accounts: 3,
    initialBalance: 10n ** 24n  // 1M tokens per account
  });

  // Deploy with test configuration
  const deployment = await deployContract(provider, {
    contractModule: TokenContract,
    initialLedgerState: {
      admin: provider.accounts[0].address,
      total_supply: 1_000_000n
    },
    initialPrivateState: {
      adminKey: provider.accounts[0].privateKey
    },
    witnesses,
    privateStateKey: 'test-token'
  });

  // Test contract
  await deployment.contract.callTx.mint(
    provider.accounts[1].address,
    1000n,
    witnesses
  );

  const balance = await deployment.contract.state.balances.get(
    provider.accounts[1].address
  );

  console.assert(balance === 1000n, 'Mint should work');
}
```

## Error Handling

```typescript
import {
  DeploymentError,
  InsufficientFundsError,
  InvalidStateError
} from '@midnight-ntwrk/midnight-js-contracts';

try {
  const deployment = await deployContract(provider, config);
} catch (error) {
  if (error instanceof InsufficientFundsError) {
    console.error('Not enough funds for deployment gas');
    console.error('Required:', error.required);
    console.error('Available:', error.available);
  } else if (error instanceof InvalidStateError) {
    console.error('Invalid initial state:', error.field, error.message);
  } else if (error instanceof DeploymentError) {
    console.error('Deployment failed:', error.message);
    console.error('Transaction:', error.transactionHash);
  } else {
    throw error;
  }
}
```

## Deployment Verification

Verify deployment was successful.

```typescript
async function verifyDeployment(
  provider: MidnightProvider,
  contractAddress: string,
  expectedState: Partial<LedgerState>
): Promise<boolean> {
  const contract = createTokenContract(provider, contractAddress);

  // Verify each expected state field
  for (const [key, expected] of Object.entries(expectedState)) {
    const actual = await contract.state[key]();

    if (typeof expected === 'bigint') {
      if (actual !== expected) {
        console.error(`State mismatch for ${key}: expected ${expected}, got ${actual}`);
        return false;
      }
    } else if (expected instanceof Uint8Array) {
      if (!arraysEqual(actual, expected)) {
        console.error(`State mismatch for ${key}`);
        return false;
      }
    }
  }

  console.log('Deployment verified successfully');
  return true;
}
```

## Complete Deployment Script

```typescript
#!/usr/bin/env ts-node

import { MidnightProvider } from '@midnight-ntwrk/midnight-js-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { TokenContract, Witnesses } from './build/token';
import { config } from './deploy.config';

async function main() {
  console.log('Starting deployment...');

  // 1. Initialize provider
  const provider = new MidnightProvider({
    networkId: config.networkId,
    nodeUrl: config.nodeUrl
  });

  await provider.connect();
  console.log('Connected as:', await provider.getAddress());

  // 2. Check balance
  const balance = await provider.getBalance();
  console.log('Balance:', balance);

  if (balance < config.minRequiredBalance) {
    throw new Error('Insufficient balance for deployment');
  }

  // 3. Prepare witnesses
  const witnesses: Witnesses = {
    get_admin_key: ({ privateState }) => privateState.adminKey
  };

  // 4. Deploy
  console.log('Deploying contract...');
  const deployment = await deployContract(provider, {
    contractModule: TokenContract,
    initialLedgerState: config.initialState,
    initialPrivateState: config.privateState,
    witnesses,
    privateStateKey: config.privateStateKey,
    options: {
      onProofGenerated: () => console.log('Proof generated'),
      onTransactionSubmitted: (tx) => console.log('TX submitted:', tx)
    }
  });

  // 5. Output results
  console.log('\nDeployment successful!');
  console.log('Contract address:', deployment.contractAddress);
  console.log('Transaction hash:', deployment.transactionHash);
  console.log('Block number:', deployment.blockNumber);
  console.log('Gas used:', deployment.gasUsed);

  // 6. Save deployment info
  const deploymentInfo = {
    address: deployment.contractAddress,
    txHash: deployment.transactionHash,
    block: deployment.blockNumber.toString(),
    network: config.networkId,
    timestamp: new Date().toISOString()
  };

  await fs.writeFile(
    `deployments/${config.networkId}-token.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log('\nDeployment info saved.');
}

main().catch(console.error);
```
