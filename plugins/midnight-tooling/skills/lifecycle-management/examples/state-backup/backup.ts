/**
 * Contract State Backup Example
 *
 * Export and backup contract state for disaster recovery,
 * migration preparation, or auditing purposes.
 *
 * Prerequisites:
 * - Deployed contract address
 * - Contract artifacts in ./build/
 * - MIDNIGHT_WALLET_SEED environment variable
 *
 * Usage:
 *   CONTRACT_ADDRESS="0x..." MIDNIGHT_WALLET_SEED="..." npx ts-node backup.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { connectContract, ConnectedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet } from '@midnight-ntwrk/midnight-js-wallet';
import { createIndexerClient, IndexerClient } from '@midnight-ntwrk/midnight-js-indexer';
import { Contract } from './build/contract.cjs';
import type { ContractState, ContractMethods } from './build/contract.d.cts';

// Backup metadata
interface BackupMetadata {
  version: string;
  timestamp: string;
  contractAddress: string;
  networkEndpoint: string;
  blockHeight: number;
  txCount: number;
}

// Complete backup structure
interface ContractBackup {
  metadata: BackupMetadata;
  state: ContractState;
  rawState: unknown;
  recentTransactions: TransactionInfo[];
}

interface TransactionInfo {
  hash: string;
  blockHeight: number;
  timestamp: string;
  method: string;
}

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

// Collect contract metadata from indexer
async function getContractMetadata(
  indexer: IndexerClient,
  address: string,
  networkEndpoint: string
): Promise<BackupMetadata> {
  const info = await indexer.getContractInfo(address);
  const transactions = await indexer.getContractTransactions(address, { limit: 1000 });

  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    contractAddress: address,
    networkEndpoint,
    blockHeight: info.lastUpdateBlock,
    txCount: transactions.length,
  };
}

// Export state via contract circuits
async function exportContractState(
  contract: ConnectedContract<ContractState, ContractMethods>
): Promise<ContractState> {
  console.log('Exporting state via contract circuits...');

  // Call the export circuit if available
  try {
    const state = await contract.query.export_state();
    return state;
  } catch {
    console.log('No export_state circuit, querying individual fields...');
  }

  // Fallback: Query individual state fields
  const [totalSupply, owner, metadata] = await Promise.all([
    contract.query.get_total_supply(),
    contract.query.get_owner(),
    contract.query.get_metadata(),
  ]);

  // Query all account balances (if circuit available)
  let balances = new Map<string, bigint>();
  try {
    const accounts = await contract.query.get_all_accounts();
    for (const account of accounts) {
      const balance = await contract.query.get_balance({ address: account });
      balances.set(account, balance);
    }
  } catch {
    console.log('Cannot query all accounts, backup may be incomplete');
  }

  return {
    totalSupply,
    owner,
    metadata,
    balances,
  } as unknown as ContractState;
}

// Get raw state from indexer
async function getRawState(
  indexer: IndexerClient,
  address: string
): Promise<unknown> {
  console.log('Fetching raw state from indexer...');
  return indexer.getContractState(address);
}

// Get recent transaction history
async function getRecentTransactions(
  indexer: IndexerClient,
  address: string,
  limit: number = 100
): Promise<TransactionInfo[]> {
  console.log(`Fetching last ${limit} transactions...`);

  const txs = await indexer.getContractTransactions(address, { limit });

  return txs.map((tx) => ({
    hash: tx.hash,
    blockHeight: tx.blockHeight,
    timestamp: tx.timestamp,
    method: tx.method || 'unknown',
  }));
}

// Save backup to file
async function saveBackup(
  backup: ContractBackup,
  outputDir: string
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = backup.metadata.timestamp.replace(/[:.]/g, '-');
  const shortAddress = backup.metadata.contractAddress.slice(0, 10);
  const filename = `backup-${shortAddress}-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  // Custom replacer for BigInt serialization
  const replacer = (_key: string, value: unknown): unknown => {
    if (typeof value === 'bigint') {
      return { __type: 'BigInt', value: value.toString() };
    }
    if (value instanceof Map) {
      return {
        __type: 'Map',
        entries: Array.from(value.entries()).map(([k, v]) => [
          k,
          typeof v === 'bigint' ? { __type: 'BigInt', value: v.toString() } : v,
        ]),
      };
    }
    return value;
  };

  await fs.writeFile(filepath, JSON.stringify(backup, replacer, 2));
  console.log(`Backup saved to: ${filepath}`);

  return filepath;
}

// Verify backup integrity
async function verifyBackup(filepath: string): Promise<boolean> {
  console.log('Verifying backup integrity...');

  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const backup: ContractBackup = JSON.parse(content);

    // Check required fields
    if (!backup.metadata?.contractAddress) {
      console.error('Missing contract address in backup');
      return false;
    }

    if (!backup.metadata?.blockHeight) {
      console.error('Missing block height in backup');
      return false;
    }

    if (!backup.state) {
      console.error('Missing state in backup');
      return false;
    }

    console.log('Backup verification passed');
    return true;
  } catch (error) {
    console.error('Backup verification failed:', (error as Error).message);
    return false;
  }
}

// Main backup function
async function createBackup(): Promise<void> {
  // Validate environment
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error('CONTRACT_ADDRESS environment variable required');
  }

  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) {
    throw new Error('MIDNIGHT_WALLET_SEED environment variable required');
  }

  const outputDir = process.env.BACKUP_DIR || './backups';

  const config = getNetworkConfig();
  console.log('=== Contract State Backup ===');
  console.log('Contract:', contractAddress);
  console.log('Network:', config.indexer);
  console.log('Output:', outputDir);

  // Create clients
  const wallet = await createWallet({
    seed,
    keyIndex: parseInt(process.env.WALLET_KEY_INDEX || '0'),
  });

  const indexer = createIndexerClient({ url: config.indexer });

  // Connect to contract
  console.log('\nConnecting to contract...');
  const contract = await connectContract<ContractState, ContractMethods>({
    address: contractAddress,
    artifact: Contract,
    wallet,
    config,
  });

  // Collect backup data
  console.log('\nCollecting backup data...');

  const [metadata, state, rawState, transactions] = await Promise.all([
    getContractMetadata(indexer, contractAddress, config.indexer),
    exportContractState(contract),
    getRawState(indexer, contractAddress),
    getRecentTransactions(indexer, contractAddress),
  ]);

  const backup: ContractBackup = {
    metadata,
    state,
    rawState,
    recentTransactions: transactions,
  };

  // Save backup
  console.log('\nSaving backup...');
  const filepath = await saveBackup(backup, outputDir);

  // Verify backup
  const valid = await verifyBackup(filepath);

  if (valid) {
    console.log('\n=== Backup Complete ===');
    console.log('File:', filepath);
    console.log('Block height:', metadata.blockHeight);
    console.log('Transaction count:', metadata.txCount);
  } else {
    console.error('\n=== Backup Failed Verification ===');
    process.exit(1);
  }
}

// Run backup
createBackup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backup failed:', error.message);
    process.exit(1);
  });
