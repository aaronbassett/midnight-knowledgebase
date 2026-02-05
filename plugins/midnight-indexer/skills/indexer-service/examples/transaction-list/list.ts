/**
 * Transaction List Example
 *
 * List transaction history with cursor-based pagination.
 */

import { createIndexerClient, IndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

// GraphQL query for transaction history
const GET_TRANSACTIONS_QUERY = `
  query GetTransactions(
    $address: String!
    $first: Int!
    $after: String
  ) {
    transactions(address: $address, first: $first, after: $after) {
      edges {
        node {
          hash
          blockNumber
          blockHash
          timestamp
          fee
          inputs {
            address
            amount
          }
          outputs {
            address
            amount
            outputIndex
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

interface TransactionInput {
  address: string;
  amount: string;
}

interface TransactionOutput {
  address: string;
  amount: string;
  outputIndex: number;
}

interface Transaction {
  hash: string;
  blockNumber: number;
  blockHash: string;
  timestamp: string;
  fee: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
}

interface TransactionEdge {
  node: Transaction;
  cursor: string;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

interface TransactionsResponse {
  transactions: {
    edges: TransactionEdge[];
    pageInfo: PageInfo;
    totalCount: number;
  };
}

interface TransactionPage {
  transactions: Transaction[];
  pageInfo: PageInfo;
  totalCount: number;
}

/**
 * Create an indexer client
 */
function createClient(): IndexerClient {
  const uri = process.env.INDEXER_URL || 'https://indexer.testnet.midnight.network/api/v1/graphql';
  const wsUri = process.env.INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/api/v1/graphql';

  return createIndexerClient({ uri, wsUri });
}

/**
 * Fetch a page of transactions
 */
async function fetchTransactionPage(
  indexer: IndexerClient,
  address: string,
  pageSize: number,
  cursor?: string
): Promise<TransactionPage> {
  const result = await indexer.query<TransactionsResponse>({
    query: GET_TRANSACTIONS_QUERY,
    variables: {
      address,
      first: pageSize,
      after: cursor,
    },
  });

  if (!result.data) {
    throw new Error('Failed to fetch transactions');
  }

  const { edges, pageInfo, totalCount } = result.data.transactions;

  return {
    transactions: edges.map(edge => edge.node),
    pageInfo,
    totalCount,
  };
}

/**
 * Fetch all transactions using pagination
 */
async function fetchAllTransactions(
  indexer: IndexerClient,
  address: string,
  pageSize = 100
): Promise<Transaction[]> {
  const allTransactions: Transaction[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchTransactionPage(indexer, address, pageSize, cursor);
    allTransactions.push(...page.transactions);

    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor ?? undefined;

    console.log(`Fetched ${allTransactions.length}/${page.totalCount} transactions`);
  }

  return allTransactions;
}

/**
 * Generator for streaming transactions page by page
 */
async function* streamTransactions(
  indexer: IndexerClient,
  address: string,
  pageSize = 50
): AsyncGenerator<Transaction[]> {
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchTransactionPage(indexer, address, pageSize, cursor);
    yield page.transactions;

    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor ?? undefined;
  }
}

/**
 * Categorize transaction as incoming, outgoing, or internal
 */
function categorizeTransaction(
  tx: Transaction,
  address: string
): 'incoming' | 'outgoing' | 'internal' {
  const isInput = tx.inputs.some(i => i.address === address);
  const isOutput = tx.outputs.some(o => o.address === address);

  if (isInput && isOutput) return 'internal';
  if (isInput) return 'outgoing';
  return 'incoming';
}

/**
 * Calculate net amount for an address in a transaction
 */
function calculateNetAmount(tx: Transaction, address: string): bigint {
  const inputSum = tx.inputs
    .filter(i => i.address === address)
    .reduce((sum, i) => sum + BigInt(i.amount), 0n);

  const outputSum = tx.outputs
    .filter(o => o.address === address)
    .reduce((sum, o) => sum + BigInt(o.amount), 0n);

  return outputSum - inputSum;
}

/**
 * Format transaction for display
 */
function formatTransaction(tx: Transaction, address: string): string {
  const category = categorizeTransaction(tx, address);
  const netAmount = calculateNetAmount(tx, address);
  const sign = netAmount >= 0n ? '+' : '';
  const date = new Date(tx.timestamp).toISOString().slice(0, 19).replace('T', ' ');

  return `${date} | ${tx.hash.slice(0, 16)}... | ${category.padEnd(8)} | ${sign}${netAmount.toString()}`;
}

// Main execution
async function main() {
  const address = process.env.MIDNIGHT_ADDRESS;
  if (!address) {
    console.error('Please set MIDNIGHT_ADDRESS environment variable');
    process.exit(1);
  }

  const mode = process.argv[2] || 'page'; // 'page', 'all', or 'stream'
  const pageSize = parseInt(process.env.PAGE_SIZE || '10', 10);

  console.log(`Listing transactions for: ${address}`);
  console.log(`Mode: ${mode}, Page size: ${pageSize}`);
  console.log('---');

  try {
    const indexer = createClient();

    if (mode === 'all') {
      // Fetch all transactions at once
      const transactions = await fetchAllTransactions(indexer, address, pageSize);
      console.log(`\nTotal transactions: ${transactions.length}\n`);

      for (const tx of transactions.slice(0, 20)) {
        console.log(formatTransaction(tx, address));
      }

      if (transactions.length > 20) {
        console.log(`... and ${transactions.length - 20} more`);
      }
    } else if (mode === 'stream') {
      // Stream transactions page by page
      let count = 0;

      for await (const batch of streamTransactions(indexer, address, pageSize)) {
        console.log(`\n--- Batch ${++count} (${batch.length} transactions) ---`);

        for (const tx of batch) {
          console.log(formatTransaction(tx, address));
        }

        // In a real app, you might process each batch before fetching the next
      }
    } else {
      // Fetch just the first page
      const page = await fetchTransactionPage(indexer, address, pageSize);

      console.log(`Showing ${page.transactions.length} of ${page.totalCount} transactions\n`);

      for (const tx of page.transactions) {
        console.log(formatTransaction(tx, address));
      }

      if (page.pageInfo.hasNextPage) {
        console.log(`\n... more available (cursor: ${page.pageInfo.endCursor?.slice(0, 20)}...)`);
      }
    }
  } catch (error) {
    console.error('Error listing transactions:', error);
    process.exit(1);
  }
}

main();
