/**
 * Balance Query Example
 *
 * Query account balance and UTXOs from the Midnight indexer.
 */

import { createIndexerClient, IndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

// GraphQL query for balance with UTXOs
const GET_BALANCE_QUERY = `
  query GetBalance($address: String!) {
    balance(address: $address) {
      total
      confirmed
      pending
      utxos {
        txHash
        outputIndex
        amount
        blockHeight
        isShielded
      }
    }
  }
`;

interface UTXO {
  txHash: string;
  outputIndex: number;
  amount: string;
  blockHeight: number;
  isShielded: boolean;
}

interface BalanceResponse {
  balance: {
    total: string;
    confirmed: string;
    pending: string;
    utxos: UTXO[];
  };
}

interface AccountBalance {
  total: bigint;
  confirmed: bigint;
  pending: bigint;
  utxos: UTXO[];
  utxoCount: number;
}

/**
 * Create an indexer client for the specified network
 */
function createClient(network: 'testnet' | 'mainnet' = 'testnet'): IndexerClient {
  const configs = {
    testnet: {
      uri: 'https://indexer.testnet.midnight.network/api/v1/graphql',
      wsUri: 'wss://indexer.testnet.midnight.network/api/v1/graphql',
    },
    mainnet: {
      uri: 'https://indexer.midnight.network/api/v1/graphql',
      wsUri: 'wss://indexer.midnight.network/api/v1/graphql',
    },
  };

  return createIndexerClient(configs[network]);
}

/**
 * Query the balance for a given address
 */
async function queryBalance(
  indexer: IndexerClient,
  address: string
): Promise<AccountBalance> {
  const result = await indexer.query<BalanceResponse>({
    query: GET_BALANCE_QUERY,
    variables: { address },
  });

  if (!result.data) {
    throw new Error('Failed to fetch balance');
  }

  const { balance } = result.data;

  return {
    total: BigInt(balance.total),
    confirmed: BigInt(balance.confirmed),
    pending: BigInt(balance.pending),
    utxos: balance.utxos,
    utxoCount: balance.utxos.length,
  };
}

/**
 * Format balance for display (convert from smallest unit)
 */
function formatBalance(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  return `${whole}.${fraction.toString().padStart(decimals, '0')}`;
}

/**
 * Get spendable UTXOs (excluding shielded)
 */
function getSpendableUTXOs(utxos: UTXO[]): UTXO[] {
  return utxos.filter(utxo => !utxo.isShielded);
}

/**
 * Calculate total spendable amount
 */
function calculateSpendable(utxos: UTXO[]): bigint {
  return getSpendableUTXOs(utxos).reduce(
    (sum, utxo) => sum + BigInt(utxo.amount),
    0n
  );
}

// Main execution
async function main() {
  const address = process.env.MIDNIGHT_ADDRESS;
  if (!address) {
    console.error('Please set MIDNIGHT_ADDRESS environment variable');
    process.exit(1);
  }

  const network = (process.env.MIDNIGHT_NETWORK as 'testnet' | 'mainnet') || 'testnet';

  console.log(`Querying balance on ${network}...`);
  console.log(`Address: ${address}`);
  console.log('---');

  try {
    const indexer = createClient(network);
    const balance = await queryBalance(indexer, address);

    console.log('Balance Summary:');
    console.log(`  Total:     ${formatBalance(balance.total)} DUST`);
    console.log(`  Confirmed: ${formatBalance(balance.confirmed)} DUST`);
    console.log(`  Pending:   ${formatBalance(balance.pending)} DUST`);
    console.log(`  UTXOs:     ${balance.utxoCount}`);
    console.log('');

    const spendable = calculateSpendable(balance.utxos);
    console.log(`Spendable:   ${formatBalance(spendable)} DUST`);
    console.log('');

    if (balance.utxos.length > 0) {
      console.log('UTXOs:');
      for (const utxo of balance.utxos.slice(0, 5)) {
        const shieldedTag = utxo.isShielded ? ' [SHIELDED]' : '';
        console.log(`  ${utxo.txHash.slice(0, 16)}...#${utxo.outputIndex}: ${formatBalance(BigInt(utxo.amount))} DUST${shieldedTag}`);
      }

      if (balance.utxos.length > 5) {
        console.log(`  ... and ${balance.utxos.length - 5} more`);
      }
    }
  } catch (error) {
    console.error('Error querying balance:', error);
    process.exit(1);
  }
}

main();
