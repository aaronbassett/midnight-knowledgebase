# Query Patterns

Common query patterns for the Midnight Indexer including balance queries, transaction history, contract state, UTXO lookups, and handling shielded data.

## Overview

The Midnight Indexer provides GraphQL queries for accessing blockchain data. This reference covers the most common query patterns and their optimal usage.

## Balance Queries

### Simple Balance

Get the total balance for an address:

```graphql
query GetBalance($address: String!) {
  balance(address: $address) {
    total
    confirmed
    pending
  }
}
```

**TypeScript Usage:**

```typescript
interface BalanceResponse {
  balance: {
    total: string;      // BigInt as string
    confirmed: string;  // Confirmed balance
    pending: string;    // Pending (unconfirmed) balance
  };
}

async function getBalance(address: string): Promise<bigint> {
  const result = await indexer.query<BalanceResponse>({
    query: GET_BALANCE_QUERY,
    variables: { address },
  });

  return BigInt(result.data.balance.total);
}
```

### Balance with UTXOs

Get balance including individual UTXOs:

```graphql
query GetBalanceWithUTXOs($address: String!) {
  balance(address: $address) {
    total
    utxos {
      txHash
      outputIndex
      amount
      blockHeight
      isShielded
    }
  }
}
```

## Transaction History

### Basic Transaction List

```graphql
query GetTransactions($address: String!, $first: Int!, $after: String) {
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
          utxoRef
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
  }
}
```

### Transactions with Date Filter

```graphql
query GetTransactionsInRange(
  $address: String!
  $first: Int!
  $fromDate: DateTime
  $toDate: DateTime
) {
  transactions(
    address: $address
    first: $first
    filter: {
      timestamp: { gte: $fromDate, lte: $toDate }
    }
  ) {
    edges {
      node {
        hash
        timestamp
        # ... other fields
      }
    }
  }
}
```

### Transactions by Block Range

```graphql
query GetTransactionsByBlocks(
  $address: String!
  $first: Int!
  $fromBlock: Int!
  $toBlock: Int!
) {
  transactions(
    address: $address
    first: $first
    filter: {
      blockNumber: { gte: $fromBlock, lte: $toBlock }
    }
  ) {
    edges {
      node {
        hash
        blockNumber
      }
    }
  }
}
```

## UTXO Queries

### List Unspent Outputs

```graphql
query GetUTXOs($address: String!, $first: Int!) {
  utxos(address: $address, first: $first) {
    edges {
      node {
        txHash
        outputIndex
        amount
        blockHeight
        blockTimestamp
        isSpent
        spentInTx
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Filter UTXOs by Amount

```graphql
query GetLargeUTXOs($address: String!, $minAmount: String!) {
  utxos(
    address: $address
    first: 100
    filter: { amount: { gte: $minAmount } }
  ) {
    edges {
      node {
        txHash
        outputIndex
        amount
      }
    }
  }
}
```

### UTXO Selection for Transactions

When building transactions, select appropriate UTXOs:

```typescript
interface UTXO {
  txHash: string;
  outputIndex: number;
  amount: bigint;
}

function selectUTXOs(utxos: UTXO[], targetAmount: bigint): UTXO[] {
  // Sort by amount descending
  const sorted = [...utxos].sort((a, b) =>
    Number(b.amount - a.amount)
  );

  const selected: UTXO[] = [];
  let total = 0n;

  for (const utxo of sorted) {
    if (total >= targetAmount) break;
    selected.push(utxo);
    total += utxo.amount;
  }

  if (total < targetAmount) {
    throw new Error('Insufficient funds');
  }

  return selected;
}
```

## Contract State Queries

### Read Contract State

```graphql
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
```

### Contract State History

```graphql
query GetContractStateHistory(
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
  }
}
```

### List Deployed Contracts

```graphql
query GetDeployedContracts($deployer: String!, $first: Int!) {
  contracts(deployer: $deployer, first: $first) {
    edges {
      node {
        address
        deploymentTx
        deploymentBlock
        codeHash
      }
    }
  }
}
```

## Shielded Transaction Handling

### Understanding Shielded Data

Shielded transactions protect transaction details using zero-knowledge proofs. The indexer can only show:

- Transaction exists (hash)
- Block inclusion
- Commitment hashes (encrypted data references)

**What is NOT visible:**
- Amounts
- Recipient addresses
- Transaction metadata

### Query Shielded Transactions

```graphql
query GetShieldedTransactions($first: Int!) {
  shieldedTransactions(first: $first) {
    edges {
      node {
        hash
        blockNumber
        timestamp
        commitments {
          hash
          type
        }
        nullifiers {
          hash
        }
      }
    }
  }
}
```

### Detecting Transaction Type

```typescript
interface Transaction {
  hash: string;
  isShielded: boolean;
  inputs: Array<{ address: string; amount: string }>;
  outputs: Array<{ address: string; amount: string }>;
  commitments?: Array<{ hash: string }>;
}

function categorizeTransaction(tx: Transaction): 'transparent' | 'shielded' | 'mixed' {
  const hasTransparent = tx.inputs.length > 0 || tx.outputs.length > 0;
  const hasShielded = tx.commitments && tx.commitments.length > 0;

  if (hasTransparent && hasShielded) return 'mixed';
  if (hasShielded) return 'shielded';
  return 'transparent';
}
```

## Pagination Patterns

### Cursor-Based Pagination

```typescript
async function* paginateResults<T>(
  indexer: IndexerClient,
  query: string,
  variables: Record<string, unknown>,
  pageSize = 100
): AsyncGenerator<T[]> {
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const result = await indexer.query({
      query,
      variables: { ...variables, first: pageSize, after: cursor },
    });

    const connection = result.data[Object.keys(result.data)[0]];
    yield connection.edges.map((e: { node: T }) => e.node);

    hasMore = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }
}

// Usage
for await (const transactions of paginateResults(indexer, QUERY, { address })) {
  console.log('Batch:', transactions.length);
}
```

### Bi-directional Pagination

```graphql
query GetTransactionsPage(
  $address: String!
  $first: Int
  $after: String
  $last: Int
  $before: String
) {
  transactions(
    address: $address
    first: $first
    after: $after
    last: $last
    before: $before
  ) {
    edges {
      node { hash }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}
```

## Query Optimization

### Request Only Needed Fields

```graphql
# Bad - fetching unnecessary data
query GetTransactionsHeavy($address: String!) {
  transactions(address: $address, first: 100) {
    edges {
      node {
        hash
        blockNumber
        blockHash
        timestamp
        fee
        inputs { address amount utxoRef metadata }
        outputs { address amount outputIndex metadata }
        # ... more fields
      }
    }
  }
}

# Good - minimal fields for list view
query GetTransactionsLight($address: String!) {
  transactions(address: $address, first: 100) {
    edges {
      node {
        hash
        timestamp
      }
    }
  }
}
```

### Batch Related Queries

```graphql
query GetAccountOverview($address: String!) {
  balance(address: $address) {
    total
    confirmed
  }
  transactions(address: $address, first: 5) {
    edges {
      node {
        hash
        timestamp
      }
    }
  }
  utxos(address: $address, first: 10) {
    edges {
      node {
        amount
      }
    }
  }
}
```

## Error Handling

### Common Query Errors

```typescript
interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: {
    code: string;
  };
}

function handleQueryError(errors: GraphQLError[]): never {
  const error = errors[0];

  switch (error.extensions?.code) {
    case 'NOT_FOUND':
      throw new Error(`Resource not found: ${error.path?.join('.')}`);
    case 'VALIDATION_ERROR':
      throw new Error(`Invalid query: ${error.message}`);
    case 'RATE_LIMITED':
      throw new Error('Rate limit exceeded, try again later');
    default:
      throw new Error(`Query failed: ${error.message}`);
  }
}
```

## Best Practices

1. **Use fragments** for repeated field selections
2. **Paginate large results** to avoid timeouts
3. **Filter server-side** rather than fetching all and filtering client-side
4. **Cache appropriately** based on data freshness needs
5. **Handle shielded data** gracefully in UI
6. **Batch related queries** when possible
