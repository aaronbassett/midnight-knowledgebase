/**
 * State-Changing Transaction Example
 *
 * Execute state-changing contract calls that require proof generation.
 * These operations modify ledger state and consume gas.
 *
 * Prerequisites:
 * - Deployed contract address
 * - Contract artifacts in ./build/
 * - MIDNIGHT_WALLET_SEED environment variable
 * - Sufficient tDUST balance for gas
 *
 * Usage:
 *   CONTRACT_ADDRESS="0x..." MIDNIGHT_WALLET_SEED="..." npx ts-node transaction.ts
 */

import { connectContract, ConnectedContract, PendingTransaction } from '@midnight-ntwrk/midnight-js-contracts';
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

// Transaction result
interface TransactionResult {
  success: boolean;
  txHash: string;
  blockHeight?: number;
  error?: string;
}

function getNetworkConfig(): NetworkConfig {
  return {
    indexer: process.env.INDEXER_URL || 'https://indexer.testnet.midnight.network',
    indexerWs: process.env.INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/ws',
    prover: process.env.PROVER_URL || 'https://prover.testnet.midnight.network',
  };
}

// Check balance before transaction
async function ensureSufficientBalance(
  indexerUrl: string,
  address: string,
  minimum: bigint
): Promise<void> {
  const indexer = createIndexerClient({ url: indexerUrl });
  const balance = await indexer.getBalance(address);

  console.log(`Current balance: ${balance.unshielded} tDUST`);

  if (balance.unshielded < minimum) {
    throw new Error(
      `Insufficient balance. Have ${balance.unshielded}, need ${minimum}. ` +
      `Get test tokens from https://midnight.network/test-faucet/`
    );
  }
}

// Execute transaction with progress monitoring
async function executeWithProgress<T>(
  callFn: () => Promise<PendingTransaction<T>>,
  options: {
    timeout?: number;
    onProgress?: (stage: string, progress: number) => void;
  } = {}
): Promise<TransactionResult> {
  const { timeout = 180000, onProgress } = options;

  console.log('Initiating transaction...');

  // Execute the contract call (starts proof generation)
  const pending = await callFn();
  const txHash = pending.txHash;

  console.log(`Transaction hash: ${txHash}`);

  // Monitor proof generation progress
  let lastProgress = 0;
  if (onProgress) {
    pending.onProgress?.((progress) => {
      if (progress > lastProgress + 0.1) {
        onProgress('proof', progress);
        lastProgress = progress;
      }
    });
  }

  console.log('Generating proof and submitting transaction...');

  // Wait for confirmation
  const confirmation = await pending.waitForConfirmation({
    timeout,
    confirmations: 1,
  });

  if (confirmation.status === 'confirmed') {
    return {
      success: true,
      txHash,
      blockHeight: confirmation.blockHeight,
    };
  }

  if (confirmation.status === 'timeout') {
    return {
      success: false,
      txHash,
      error: 'Transaction timed out. It may still confirm - check later.',
    };
  }

  return {
    success: false,
    txHash,
    error: confirmation.error || 'Unknown error',
  };
}

// Example: Simple transfer transaction
async function executeTransfer(
  contract: ConnectedContract<ContractState, ContractMethods>,
  to: string,
  amount: bigint
): Promise<TransactionResult> {
  console.log('\n--- Execute Transfer ---');
  console.log(`To: ${to}`);
  console.log(`Amount: ${amount}`);

  return executeWithProgress(
    () => contract.call.transfer({ to, amount }),
    {
      timeout: 180000,
      onProgress: (stage, progress) => {
        console.log(`  ${stage}: ${(progress * 100).toFixed(0)}%`);
      },
    }
  );
}

// Example: Transaction with retry
async function executeWithRetry<T>(
  callFn: () => Promise<PendingTransaction<T>>,
  maxRetries: number = 3
): Promise<TransactionResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\nAttempt ${attempt} of ${maxRetries}...`);

    try {
      const result = await executeWithProgress(callFn, { timeout: 180000 });

      if (result.success) {
        return result;
      }

      lastError = result.error;

      // Don't retry if transaction might be pending
      if (result.error?.includes('may still confirm')) {
        console.log('Transaction may be pending, not retrying');
        return result;
      }
    } catch (error) {
      lastError = (error as Error).message;
      console.error(`Attempt ${attempt} failed:`, lastError);
    }

    if (attempt < maxRetries) {
      const delay = 2000 * attempt;
      console.log(`Waiting ${delay / 1000}s before retry...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return {
    success: false,
    txHash: '',
    error: `Failed after ${maxRetries} attempts: ${lastError}`,
  };
}

// Example: Sequential transactions
async function executeSequential(
  contract: ConnectedContract<ContractState, ContractMethods>,
  operations: Array<{
    name: string;
    call: () => Promise<PendingTransaction<unknown>>;
  }>
): Promise<TransactionResult[]> {
  console.log('\n--- Sequential Transactions ---');
  console.log(`Executing ${operations.length} operations...`);

  const results: TransactionResult[] = [];

  for (const op of operations) {
    console.log(`\nExecuting: ${op.name}`);

    const result = await executeWithProgress(op.call, { timeout: 180000 });
    results.push(result);

    if (!result.success) {
      console.error(`Operation "${op.name}" failed, stopping sequence`);
      break;
    }

    console.log(`${op.name} confirmed at block ${result.blockHeight}`);
  }

  return results;
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
  console.log('=== State-Changing Transaction Example ===');
  console.log('Contract:', contractAddress);
  console.log('Network:', config.indexer);

  // Create wallet
  const wallet = await createWallet({
    seed,
    keyIndex: parseInt(process.env.WALLET_KEY_INDEX || '0'),
  });

  const walletAddress = await wallet.getAddress();
  console.log('Wallet:', walletAddress);

  // Check balance
  const MINIMUM_BALANCE = BigInt(5_000_000);
  await ensureSufficientBalance(config.indexer, walletAddress, MINIMUM_BALANCE);

  // Connect to contract
  console.log('\nConnecting to contract...');
  const contract = await connectContract<ContractState, ContractMethods>({
    address: contractAddress,
    artifact: Contract,
    wallet,
    config,
  });

  console.log('Connected successfully');

  // Example: Execute a transfer
  const recipient = process.env.RECIPIENT_ADDRESS || walletAddress;
  const amount = BigInt(process.env.TRANSFER_AMOUNT || '100');

  const result = await executeTransfer(contract, recipient, amount);

  if (result.success) {
    console.log('\n=== Transaction Successful ===');
    console.log('Transaction hash:', result.txHash);
    console.log('Block height:', result.blockHeight);
  } else {
    console.log('\n=== Transaction Failed ===');
    console.log('Error:', result.error);
    process.exit(1);
  }
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
