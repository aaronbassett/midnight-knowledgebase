/**
 * Read-Only Contract Query Example
 *
 * Query contract state without generating proofs.
 * Read-only queries are fast and free (no gas cost).
 *
 * Prerequisites:
 * - Deployed contract address
 * - Contract artifacts in ./build/
 * - MIDNIGHT_WALLET_SEED environment variable
 *
 * Usage:
 *   CONTRACT_ADDRESS="0x..." MIDNIGHT_WALLET_SEED="..." npx ts-node query.ts
 */

import { connectContract, ConnectedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet } from '@midnight-ntwrk/midnight-js-wallet';
import { Contract } from './build/contract.cjs';
import type { ContractState, ContractMethods } from './build/contract.d.cts';

// Network configuration
interface NetworkConfig {
  indexer: string;
  indexerWs: string;
  prover: string;
}

function getNetworkConfig(): NetworkConfig {
  return {
    indexer: process.env.INDEXER_URL || 'https://indexer.testnet.midnight.network',
    indexerWs: process.env.INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/ws',
    prover: process.env.PROVER_URL || 'https://prover.testnet.midnight.network',
  };
}

// Query with timeout
async function queryWithTimeout<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = 15000
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Query timed out')), timeoutMs);
  });

  return Promise.race([queryFn(), timeout]);
}

// Example: Query single value
async function getSingleValue(
  contract: ConnectedContract<ContractState, ContractMethods>
): Promise<void> {
  console.log('\n--- Single Value Query ---');

  // Query a simple value from contract state
  const totalSupply = await contract.query.get_total_supply();
  console.log('Total supply:', totalSupply.toString());

  // Query with parameters
  const address = process.env.QUERY_ADDRESS || await contract.wallet.getAddress();
  const balance = await contract.query.get_balance({ address });
  console.log(`Balance for ${address}:`, balance.toString());
}

// Example: Query multiple values in parallel
async function getMultipleValues(
  contract: ConnectedContract<ContractState, ContractMethods>,
  addresses: string[]
): Promise<Map<string, bigint>> {
  console.log('\n--- Batch Query ---');
  console.log(`Querying balances for ${addresses.length} addresses...`);

  const results = new Map<string, bigint>();
  const startTime = Date.now();

  // Run all queries in parallel
  const queries = addresses.map(async (address) => {
    const balance = await queryWithTimeout(
      () => contract.query.get_balance({ address }),
      10000
    );
    return { address, balance };
  });

  const balances = await Promise.all(queries);

  for (const { address, balance } of balances) {
    results.set(address, balance);
    console.log(`  ${address}: ${balance.toString()}`);
  }

  const duration = Date.now() - startTime;
  console.log(`Batch query completed in ${duration}ms`);

  return results;
}

// Example: Query with error handling
async function safeQuery<T>(
  queryFn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await queryWithTimeout(queryFn);
  } catch (error) {
    console.warn('Query failed, using fallback:', (error as Error).message);
    return fallback;
  }
}

// Example: Repeated polling query
async function pollForChange(
  contract: ConnectedContract<ContractState, ContractMethods>,
  address: string,
  expectedBalance: bigint,
  maxAttempts: number = 10,
  intervalMs: number = 2000
): Promise<boolean> {
  console.log('\n--- Poll for Balance Change ---');
  console.log(`Waiting for balance to reach ${expectedBalance}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const balance = await contract.query.get_balance({ address });
    console.log(`  Attempt ${attempt}: ${balance.toString()}`);

    if (balance >= expectedBalance) {
      console.log('Target balance reached!');
      return true;
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  console.log('Max attempts reached, balance not updated');
  return false;
}

// Main function
async function main(): Promise<void> {
  // Validate environment
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error('CONTRACT_ADDRESS environment variable required');
  }

  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) {
    throw new Error('MIDNIGHT_WALLET_SEED environment variable required');
  }

  const config = getNetworkConfig();
  console.log('=== Contract Query Example ===');
  console.log('Contract:', contractAddress);
  console.log('Network:', config.indexer);

  // Create wallet (required for connection even for read-only queries)
  const wallet = await createWallet({
    seed,
    keyIndex: parseInt(process.env.WALLET_KEY_INDEX || '0'),
  });

  const walletAddress = await wallet.getAddress();
  console.log('Wallet:', walletAddress);

  // Connect to contract
  console.log('\nConnecting to contract...');
  const contract = await connectContract<ContractState, ContractMethods>({
    address: contractAddress,
    artifact: Contract,
    wallet,
    config,
  });

  console.log('Connected successfully');

  // Run example queries
  await getSingleValue(contract);

  // Batch query example
  const addresses = [
    walletAddress,
    // Add more addresses to query
  ];

  if (addresses.length > 0) {
    await getMultipleValues(contract, addresses);
  }

  // Safe query with fallback
  const safeBalance = await safeQuery(
    () => contract.query.get_balance({ address: walletAddress }),
    0n
  );
  console.log('\nSafe query result:', safeBalance.toString());

  console.log('\n=== Query Examples Complete ===');
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
