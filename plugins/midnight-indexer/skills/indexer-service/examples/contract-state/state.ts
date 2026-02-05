/**
 * Contract State Query Example
 *
 * Read deployed contract state from the Midnight indexer.
 */

import { createIndexerClient, IndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

// GraphQL query for contract state
const GET_CONTRACT_STATE_QUERY = `
  query GetContractState($contractAddress: String!) {
    contract(address: $contractAddress) {
      address
      deploymentTx
      deploymentBlock
      codeHash
      state {
        key
        value
        lastUpdated
      }
    }
  }
`;

// GraphQL query for contract state history
const GET_STATE_HISTORY_QUERY = `
  query GetStateHistory(
    $contractAddress: String!
    $key: String!
    $first: Int!
  ) {
    contractStateHistory(
      address: $contractAddress
      key: $key
      first: $first
    ) {
      edges {
        node {
          value
          blockNumber
          txHash
          timestamp
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// GraphQL query for listing contracts by deployer
const GET_CONTRACTS_BY_DEPLOYER_QUERY = `
  query GetContractsByDeployer($deployer: String!, $first: Int!) {
    contracts(deployer: $deployer, first: $first) {
      edges {
        node {
          address
          deploymentTx
          deploymentBlock
          codeHash
        }
      }
      totalCount
    }
  }
`;

interface ContractStateEntry {
  key: string;
  value: string;
  lastUpdated: string;
}

interface Contract {
  address: string;
  deploymentTx: string;
  deploymentBlock: number;
  codeHash: string;
  state: ContractStateEntry[];
}

interface StateHistoryEntry {
  value: string;
  blockNumber: number;
  txHash: string;
  timestamp: string;
}

interface ContractResponse {
  contract: Contract | null;
}

interface StateHistoryResponse {
  contractStateHistory: {
    edges: Array<{ node: StateHistoryEntry }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

interface ContractsResponse {
  contracts: {
    edges: Array<{ node: Omit<Contract, 'state'> }>;
    totalCount: number;
  };
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
 * Fetch contract state
 */
async function getContractState(
  indexer: IndexerClient,
  contractAddress: string
): Promise<Contract | null> {
  const result = await indexer.query<ContractResponse>({
    query: GET_CONTRACT_STATE_QUERY,
    variables: { contractAddress },
  });

  return result.data?.contract ?? null;
}

/**
 * Fetch state history for a specific key
 */
async function getStateHistory(
  indexer: IndexerClient,
  contractAddress: string,
  key: string,
  limit = 10
): Promise<StateHistoryEntry[]> {
  const result = await indexer.query<StateHistoryResponse>({
    query: GET_STATE_HISTORY_QUERY,
    variables: {
      contractAddress,
      key,
      first: limit,
    },
  });

  return result.data?.contractStateHistory.edges.map(e => e.node) ?? [];
}

/**
 * List contracts deployed by an address
 */
async function getContractsByDeployer(
  indexer: IndexerClient,
  deployer: string,
  limit = 20
): Promise<{ contracts: Omit<Contract, 'state'>[]; total: number }> {
  const result = await indexer.query<ContractsResponse>({
    query: GET_CONTRACTS_BY_DEPLOYER_QUERY,
    variables: {
      deployer,
      first: limit,
    },
  });

  return {
    contracts: result.data?.contracts.edges.map(e => e.node) ?? [],
    total: result.data?.contracts.totalCount ?? 0,
  };
}

/**
 * Parse contract state value (handles different encoding formats)
 */
function parseStateValue(value: string): unknown {
  try {
    // Try JSON parsing first
    return JSON.parse(value);
  } catch {
    // Try hex decoding
    if (value.startsWith('0x')) {
      return Buffer.from(value.slice(2), 'hex').toString('utf8');
    }
    // Return as-is
    return value;
  }
}

/**
 * Format state for display
 */
function formatState(state: ContractStateEntry[]): string {
  if (state.length === 0) {
    return '  (no state entries)';
  }

  return state
    .map(entry => {
      const parsed = parseStateValue(entry.value);
      const displayValue = typeof parsed === 'object'
        ? JSON.stringify(parsed, null, 2).split('\n').join('\n    ')
        : String(parsed);
      const updated = new Date(entry.lastUpdated).toISOString().slice(0, 19);

      return `  ${entry.key}:\n    Value: ${displayValue}\n    Updated: ${updated}`;
    })
    .join('\n\n');
}

// Main execution
async function main() {
  const command = process.argv[2] || 'state';
  const indexer = createClient();

  try {
    switch (command) {
      case 'state': {
        // Query contract state
        const contractAddress = process.env.CONTRACT_ADDRESS;
        if (!contractAddress) {
          console.error('Please set CONTRACT_ADDRESS environment variable');
          process.exit(1);
        }

        console.log(`Querying contract state...`);
        console.log(`Contract: ${contractAddress}`);
        console.log('---');

        const contract = await getContractState(indexer, contractAddress);

        if (!contract) {
          console.log('Contract not found');
          process.exit(1);
        }

        console.log('\nContract Info:');
        console.log(`  Address:         ${contract.address}`);
        console.log(`  Deployment TX:   ${contract.deploymentTx}`);
        console.log(`  Deployment Block: ${contract.deploymentBlock}`);
        console.log(`  Code Hash:       ${contract.codeHash}`);
        console.log('\nState:');
        console.log(formatState(contract.state));
        break;
      }

      case 'history': {
        // Query state history
        const contractAddress = process.env.CONTRACT_ADDRESS;
        const stateKey = process.env.STATE_KEY;

        if (!contractAddress || !stateKey) {
          console.error('Please set CONTRACT_ADDRESS and STATE_KEY environment variables');
          process.exit(1);
        }

        console.log(`Querying state history...`);
        console.log(`Contract: ${contractAddress}`);
        console.log(`Key: ${stateKey}`);
        console.log('---');

        const history = await getStateHistory(indexer, contractAddress, stateKey);

        if (history.length === 0) {
          console.log('No history found');
          process.exit(0);
        }

        console.log('\nState History:');
        for (const entry of history) {
          const date = new Date(entry.timestamp).toISOString().slice(0, 19);
          const value = parseStateValue(entry.value);
          console.log(`\n  Block ${entry.blockNumber} (${date}):`);
          console.log(`    TX: ${entry.txHash}`);
          console.log(`    Value: ${JSON.stringify(value)}`);
        }
        break;
      }

      case 'list': {
        // List contracts by deployer
        const deployer = process.env.DEPLOYER_ADDRESS || process.env.MIDNIGHT_ADDRESS;
        if (!deployer) {
          console.error('Please set DEPLOYER_ADDRESS or MIDNIGHT_ADDRESS environment variable');
          process.exit(1);
        }

        console.log(`Listing contracts deployed by: ${deployer}`);
        console.log('---');

        const { contracts, total } = await getContractsByDeployer(indexer, deployer);

        console.log(`\nFound ${total} contract(s):\n`);

        for (const contract of contracts) {
          console.log(`  Contract: ${contract.address}`);
          console.log(`    Deployed in block: ${contract.deploymentBlock}`);
          console.log(`    TX: ${contract.deploymentTx}`);
          console.log(`    Code hash: ${contract.codeHash.slice(0, 20)}...`);
          console.log('');
        }
        break;
      }

      default:
        console.log('Usage: ts-node state.ts [state|history|list]');
        console.log('');
        console.log('Commands:');
        console.log('  state   - Query contract state (requires CONTRACT_ADDRESS)');
        console.log('  history - Query state history (requires CONTRACT_ADDRESS and STATE_KEY)');
        console.log('  list    - List contracts by deployer (requires DEPLOYER_ADDRESS)');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
