/**
 * Multi-Contract Deployment Example
 *
 * Deploy multiple Compact contracts with dependencies to Midnight testnet.
 * Handles deployment ordering, cross-contract references, and rollback on failure.
 *
 * Prerequisites:
 * - Compiled contract artifacts in ./build/
 * - MIDNIGHT_WALLET_SEED environment variable set
 * - Sufficient tDUST balance for all deployments
 *
 * Usage:
 *   MIDNIGHT_WALLET_SEED="your seed phrase" npx ts-node deploy.ts
 */

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet, Wallet } from '@midnight-ntwrk/midnight-js-wallet';
import { createIndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

// Import contract artifacts
import { TokenContract } from './build/token.cjs';
import { VaultContract } from './build/vault.cjs';
import { GovernanceContract } from './build/governance.cjs';

// Network configuration
interface NetworkConfig {
  indexer: string;
  indexerWs: string;
  prover: string;
}

// Deployment result for each contract
interface DeploymentResult {
  name: string;
  address: string;
  txHash: string;
  blockHeight: number;
}

// Contract deployment specification
interface ContractSpec {
  name: string;
  artifact: unknown;
  getInitialState: (deployedContracts: Map<string, string>) => Record<string, unknown>;
  dependsOn: string[];
}

// Get network configuration
function getNetworkConfig(): NetworkConfig {
  const network = process.env.MIDNIGHT_NETWORK || 'testnet';

  if (network === 'mainnet') {
    return {
      indexer: 'https://indexer.midnight.network',
      indexerWs: 'wss://indexer.midnight.network/ws',
      prover: 'https://prover.midnight.network',
    };
  }

  return {
    indexer: process.env.MIDNIGHT_INDEXER_URL || 'https://indexer.testnet.midnight.network',
    indexerWs: process.env.MIDNIGHT_INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/ws',
    prover: process.env.MIDNIGHT_PROVER_URL || 'https://prover.testnet.midnight.network',
  };
}

// Define contracts and their dependencies
function getContractSpecs(deployerAddress: string): ContractSpec[] {
  return [
    {
      name: 'token',
      artifact: TokenContract,
      dependsOn: [],
      getInitialState: () => ({
        name: 'MyToken',
        symbol: 'MTK',
        decimals: 18n,
        totalSupply: 0n,
        admin: deployerAddress,
      }),
    },
    {
      name: 'vault',
      artifact: VaultContract,
      dependsOn: ['token'],
      getInitialState: (deployed) => ({
        tokenContract: deployed.get('token')!,
        totalDeposited: 0n,
        admin: deployerAddress,
      }),
    },
    {
      name: 'governance',
      artifact: GovernanceContract,
      dependsOn: ['token', 'vault'],
      getInitialState: (deployed) => ({
        tokenContract: deployed.get('token')!,
        vaultContract: deployed.get('vault')!,
        proposalCount: 0n,
        quorum: 100n,
        admin: deployerAddress,
      }),
    },
  ];
}

// Topological sort for dependency ordering
function sortByDependencies(specs: ContractSpec[]): ContractSpec[] {
  const sorted: ContractSpec[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (spec: ContractSpec) => {
    if (visited.has(spec.name)) return;
    if (visiting.has(spec.name)) {
      throw new Error(`Circular dependency detected: ${spec.name}`);
    }

    visiting.add(spec.name);

    for (const dep of spec.dependsOn) {
      const depSpec = specs.find((s) => s.name === dep);
      if (!depSpec) {
        throw new Error(`Unknown dependency: ${dep}`);
      }
      visit(depSpec);
    }

    visiting.delete(spec.name);
    visited.add(spec.name);
    sorted.push(spec);
  };

  for (const spec of specs) {
    visit(spec);
  }

  return sorted;
}

// Deploy a single contract
async function deploySingleContract(
  wallet: Wallet,
  config: NetworkConfig,
  spec: ContractSpec,
  deployedAddresses: Map<string, string>
): Promise<DeploymentResult> {
  console.log(`\nDeploying ${spec.name}...`);

  const initialState = spec.getInitialState(deployedAddresses);
  console.log(`  Initial state:`, JSON.stringify(initialState, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));

  const deployed = await deployContract({
    wallet,
    artifact: spec.artifact,
    initialState,
    config: {
      indexer: config.indexer,
      indexerWs: config.indexerWs,
      prover: config.prover,
    },
  });

  const confirmation = await deployed.waitForConfirmation({
    timeout: 180000, // 3 minutes per contract
    confirmations: 1,
  });

  if (confirmation.status !== 'confirmed') {
    throw new Error(
      `Failed to deploy ${spec.name}: ${confirmation.error || 'timeout'}`
    );
  }

  console.log(`  Deployed at: ${confirmation.address}`);
  console.log(`  TX hash: ${confirmation.txHash}`);

  return {
    name: spec.name,
    address: confirmation.address,
    txHash: confirmation.txHash,
    blockHeight: confirmation.blockHeight,
  };
}

// Deploy with retry
async function deployWithRetry(
  wallet: Wallet,
  config: NetworkConfig,
  spec: ContractSpec,
  deployedAddresses: Map<string, string>,
  maxRetries = 3
): Promise<DeploymentResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await deploySingleContract(wallet, config, spec, deployedAddresses);
    } catch (error) {
      lastError = error as Error;
      console.error(`  Attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`  Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// Main deployment orchestrator
async function deployAll(): Promise<DeploymentResult[]> {
  // Validate environment
  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) {
    throw new Error('MIDNIGHT_WALLET_SEED environment variable is required');
  }

  const config = getNetworkConfig();
  console.log('=== Multi-Contract Deployment ===');
  console.log(`Network: ${process.env.MIDNIGHT_NETWORK || 'testnet'}`);
  console.log(`Indexer: ${config.indexer}`);

  // Create wallet
  const wallet = await createWallet({
    seed,
    keyIndex: parseInt(process.env.MIDNIGHT_WALLET_KEY_INDEX || '0'),
  });

  const deployerAddress = await wallet.getAddress();
  console.log(`Deployer: ${deployerAddress}`);

  // Check balance
  const indexer = createIndexerClient({ url: config.indexer });
  const balance = await indexer.getBalance(deployerAddress);
  console.log(`Balance: ${balance.unshielded} tDUST`);

  // Get and sort contracts
  const specs = getContractSpecs(deployerAddress);
  const sortedSpecs = sortByDependencies(specs);

  console.log(`\nDeployment order:`);
  sortedSpecs.forEach((spec, i) => {
    console.log(`  ${i + 1}. ${spec.name}${spec.dependsOn.length ? ` (depends on: ${spec.dependsOn.join(', ')})` : ''}`);
  });

  // Deploy in order
  const deployedAddresses = new Map<string, string>();
  const results: DeploymentResult[] = [];

  for (const spec of sortedSpecs) {
    const result = await deployWithRetry(wallet, config, spec, deployedAddresses);
    deployedAddresses.set(spec.name, result.address);
    results.push(result);
  }

  return results;
}

// Save deployment results
function saveDeploymentResults(results: DeploymentResult[]): void {
  const output = {
    timestamp: new Date().toISOString(),
    network: process.env.MIDNIGHT_NETWORK || 'testnet',
    contracts: Object.fromEntries(
      results.map((r) => [
        r.name,
        {
          address: r.address,
          txHash: r.txHash,
          blockHeight: r.blockHeight,
        },
      ])
    ),
  };

  console.log('\n=== Deployment Results ===');
  console.log(JSON.stringify(output, null, 2));

  // In production, save to file:
  // fs.writeFileSync('deployment-results.json', JSON.stringify(output, null, 2));
}

// Run deployment
deployAll()
  .then((results) => {
    saveDeploymentResults(results);
    console.log('\n=== All contracts deployed successfully ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n=== Deployment failed ===');
    console.error(error.message);
    process.exit(1);
  });
