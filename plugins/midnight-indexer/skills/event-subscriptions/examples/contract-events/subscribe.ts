/**
 * Contract Events Subscription Example
 *
 * Subscribe to real-time contract state changes using WebSocket.
 */

import { createWebSocketClient, WebSocketClient } from '@midnight-ntwrk/midnight-js-indexer';

// GraphQL subscription for contract state changes
const WATCH_CONTRACT_SUBSCRIPTION = `
  subscription WatchContract($address: String!) {
    contractStateChange(address: $address) {
      contractAddress
      key
      oldValue
      newValue
      txHash
      blockNumber
      timestamp
    }
  }
`;

// GraphQL subscription for new transactions
const WATCH_TRANSACTIONS_SUBSCRIPTION = `
  subscription WatchTransactions($address: String!) {
    newTransaction(address: $address) {
      hash
      blockNumber
      timestamp
      fee
      inputs {
        address
        amount
      }
      outputs {
        address
        amount
      }
    }
  }
`;

interface ContractStateChange {
  contractAddress: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
}

interface Transaction {
  hash: string;
  blockNumber: number;
  timestamp: string;
  fee: string;
  inputs: Array<{ address: string; amount: string }>;
  outputs: Array<{ address: string; amount: string }>;
}

interface Subscription {
  on(event: 'data', callback: (data: unknown) => void): void;
  on(event: 'error', callback: (error: Error) => void): void;
  on(event: 'complete', callback: () => void): void;
  unsubscribe(): void;
}

/**
 * Create WebSocket client with configuration
 */
function createClient(): WebSocketClient {
  const wsUri = process.env.INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/api/v1/graphql';

  return createWebSocketClient({
    uri: wsUri,
    lazy: false, // Connect immediately
    keepAlive: 10000, // Ping every 10 seconds
    retryAttempts: Infinity, // Always reconnect
    retryWait: async (attempt) => {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.log(`Reconnecting in ${delay / 1000}s (attempt ${attempt})...`);
      await new Promise(r => setTimeout(r, delay));
    },
  });
}

/**
 * Subscribe to contract state changes
 */
function subscribeToContractState(
  client: WebSocketClient,
  contractAddress: string,
  onStateChange: (change: ContractStateChange) => void,
  onError: (error: Error) => void
): () => void {
  const subscription = client.subscribe({
    query: WATCH_CONTRACT_SUBSCRIPTION,
    variables: { address: contractAddress },
  }) as Subscription;

  subscription.on('data', (result: { data?: { contractStateChange: ContractStateChange }; errors?: Array<{ message: string }> }) => {
    if (result.errors) {
      onError(new Error(result.errors[0].message));
      return;
    }
    if (result.data?.contractStateChange) {
      onStateChange(result.data.contractStateChange);
    }
  });

  subscription.on('error', onError);

  subscription.on('complete', () => {
    console.log('Contract subscription completed');
  });

  return () => subscription.unsubscribe();
}

/**
 * Subscribe to transactions for an address
 */
function subscribeToTransactions(
  client: WebSocketClient,
  address: string,
  onTransaction: (tx: Transaction) => void,
  onError: (error: Error) => void
): () => void {
  const subscription = client.subscribe({
    query: WATCH_TRANSACTIONS_SUBSCRIPTION,
    variables: { address },
  }) as Subscription;

  subscription.on('data', (result: { data?: { newTransaction: Transaction }; errors?: Array<{ message: string }> }) => {
    if (result.errors) {
      onError(new Error(result.errors[0].message));
      return;
    }
    if (result.data?.newTransaction) {
      onTransaction(result.data.newTransaction);
    }
  });

  subscription.on('error', onError);

  return () => subscription.unsubscribe();
}

/**
 * Parse and format state value for display
 */
function formatStateValue(value: string | null): string {
  if (value === null) return '(null)';

  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    if (value.startsWith('0x')) {
      return value.slice(0, 20) + '...';
    }
    return value;
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}

// Main execution
async function main() {
  const mode = process.argv[2] || 'contract'; // 'contract' or 'transactions'
  const address = process.env.CONTRACT_ADDRESS || process.env.MIDNIGHT_ADDRESS;

  if (!address) {
    console.error('Please set CONTRACT_ADDRESS or MIDNIGHT_ADDRESS environment variable');
    process.exit(1);
  }

  console.log(`Starting ${mode} subscription...`);
  console.log(`Address: ${address}`);
  console.log('Press Ctrl+C to stop\n');
  console.log('---');

  const client = createClient();
  let unsubscribe: () => void;

  // Handle process termination
  const cleanup = () => {
    console.log('\nShutting down...');
    unsubscribe?.();
    client.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Connection events
  client.on('connected', () => {
    console.log('[Connected to indexer]');
  });

  client.on('closed', () => {
    console.log('[Disconnected from indexer]');
  });

  client.on('error', (error) => {
    console.error('[Connection error]', error);
  });

  try {
    if (mode === 'contract') {
      // Subscribe to contract state changes
      unsubscribe = subscribeToContractState(
        client,
        address,
        (change) => {
          console.log(`\n[State Change] ${formatTimestamp(change.timestamp)}`);
          console.log(`  Block:    ${change.blockNumber}`);
          console.log(`  TX:       ${change.txHash.slice(0, 20)}...`);
          console.log(`  Key:      ${change.key}`);
          console.log(`  Old:      ${formatStateValue(change.oldValue)}`);
          console.log(`  New:      ${formatStateValue(change.newValue)}`);
        },
        (error) => {
          console.error('[Subscription error]', error.message);
        }
      );
    } else {
      // Subscribe to transactions
      unsubscribe = subscribeToTransactions(
        client,
        address,
        (tx) => {
          const inputTotal = tx.inputs.reduce((sum, i) => sum + BigInt(i.amount), 0n);
          const outputTotal = tx.outputs.reduce((sum, o) => sum + BigInt(o.amount), 0n);

          console.log(`\n[New Transaction] ${formatTimestamp(tx.timestamp)}`);
          console.log(`  Hash:     ${tx.hash.slice(0, 20)}...`);
          console.log(`  Block:    ${tx.blockNumber}`);
          console.log(`  Inputs:   ${tx.inputs.length} (${inputTotal} total)`);
          console.log(`  Outputs:  ${tx.outputs.length} (${outputTotal} total)`);
          console.log(`  Fee:      ${tx.fee}`);
        },
        (error) => {
          console.error('[Subscription error]', error.message);
        }
      );
    }

    console.log(`[Subscribed to ${mode}]\n`);

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('Failed to start subscription:', error);
    process.exit(1);
  }
}

main();
