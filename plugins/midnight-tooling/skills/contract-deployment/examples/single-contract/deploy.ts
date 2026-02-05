/**
 * Single Contract Deployment Example
 *
 * Deploy a single Compact contract to Midnight testnet.
 *
 * Prerequisites:
 * - Compiled contract artifacts in ./build/
 * - MIDNIGHT_WALLET_SEED environment variable set
 * - Sufficient tDUST balance for deployment
 *
 * Usage:
 *   MIDNIGHT_WALLET_SEED="your seed phrase" npx ts-node deploy.ts
 */

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet } from '@midnight-ntwrk/midnight-js-wallet';
import { createIndexerClient } from '@midnight-ntwrk/midnight-js-indexer';
import { Contract } from './build/contract.cjs';
import type { ContractState, ContractMethods } from './build/contract.d.cts';

// Network configuration
interface NetworkConfig {
  indexer: string;
  indexerWs: string;
  prover: string;
}

// Get network configuration from environment
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

// Check balance before deployment
async function checkBalance(
  indexer: ReturnType<typeof createIndexerClient>,
  address: string,
  minimumRequired: bigint
): Promise<void> {
  const balance = await indexer.getBalance(address);

  console.log(`Current balance: ${balance.unshielded} tDUST`);

  if (balance.unshielded < minimumRequired) {
    throw new Error(
      `Insufficient balance. Have ${balance.unshielded}, need ${minimumRequired}. ` +
      `Get test tokens from https://midnight.network/test-faucet/`
    );
  }
}

// Main deployment function
async function deploy(): Promise<string> {
  // Validate environment
  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) {
    throw new Error('MIDNIGHT_WALLET_SEED environment variable is required');
  }

  const config = getNetworkConfig();
  console.log(`Deploying to ${process.env.MIDNIGHT_NETWORK || 'testnet'}...`);
  console.log(`Indexer: ${config.indexer}`);
  console.log(`Prover: ${config.prover}`);

  // Create wallet
  const wallet = await createWallet({
    seed,
    keyIndex: parseInt(process.env.MIDNIGHT_WALLET_KEY_INDEX || '0'),
  });

  const address = await wallet.getAddress();
  console.log(`Deployer address: ${address}`);

  // Create indexer client and check balance
  const indexer = createIndexerClient({ url: config.indexer });

  const MINIMUM_BALANCE = BigInt(10_000_000); // 10M units
  await checkBalance(indexer, address, MINIMUM_BALANCE);

  // Deploy contract
  console.log('Deploying contract...');
  const startTime = Date.now();

  const deployed = await deployContract<ContractState, ContractMethods>({
    wallet,
    artifact: Contract,
    initialState: {
      // Set initial ledger state based on your contract
      // Example: counter: 0n, owner: address
    },
    config: {
      indexer: config.indexer,
      indexerWs: config.indexerWs,
      prover: config.prover,
    },
  });

  // Wait for confirmation
  const confirmation = await deployed.waitForConfirmation({
    timeout: 120000, // 2 minutes
    confirmations: 1,
  });

  const duration = Date.now() - startTime;

  if (confirmation.status === 'confirmed') {
    console.log('\n--- Deployment Successful ---');
    console.log(`Contract address: ${confirmation.address}`);
    console.log(`Transaction hash: ${confirmation.txHash}`);
    console.log(`Block height: ${confirmation.blockHeight}`);
    console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);

    return confirmation.address;
  }

  if (confirmation.status === 'timeout') {
    console.error('\n--- Deployment Timeout ---');
    console.log(`Transaction may still confirm. Hash: ${deployed.txHash}`);
    throw new Error('Deployment timed out');
  }

  throw new Error(`Deployment failed: ${confirmation.error}`);
}

// Run deployment
deploy()
  .then((address) => {
    console.log(`\nContract deployed successfully at: ${address}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  });
