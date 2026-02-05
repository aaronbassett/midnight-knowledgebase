# Indexer API Versions

Complete guide to Midnight Indexer API versions, differences, and migration paths.

## Overview

The Midnight Indexer exposes a GraphQL API for querying blockchain data. The API has evolved through several versions, each adding features and improving performance. Understanding version differences is crucial for building compatible applications.

## Version History

### Version 2.0.0 (Base Release)

The initial stable release providing core query capabilities.

**Features:**
- Balance queries by address
- Transaction history
- Block information
- Contract state queries
- Basic pagination with offset/limit

**Endpoints:**
```
HTTP:  /api/v1/graphql
WS:    /api/v1/graphql (for subscriptions)
```

**Example Query (v2.0.0):**
```graphql
query GetBalance($address: String!) {
  balance(address: $address) {
    total
    confirmed
    pending
  }
}
```

### Version 2.1.0 (Enhanced Filters)

Added advanced filtering capabilities and cursor-based pagination.

**New Features:**
- Cursor-based pagination (Relay-style)
- Date range filters on transactions
- Block height filters
- Contract-specific queries
- Enhanced UTXO queries

**Breaking Changes from 2.0.0:**
- Pagination changed from offset/limit to cursor-based
- `transactions` query returns connection type with edges/nodes
- `utxos` query response structure changed

**Migration from 2.0.0:**

Before (v2.0.0):
```graphql
query GetTransactions($address: String!, $offset: Int!, $limit: Int!) {
  transactions(address: $address, offset: $offset, limit: $limit) {
    hash
    blockNumber
    timestamp
  }
}
```

After (v2.1.0):
```graphql
query GetTransactions($address: String!, $first: Int!, $after: String) {
  transactions(address: $address, first: $first, after: $after) {
    edges {
      node {
        hash
        blockNumber
        timestamp
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Version 2.1.4 (Latest)

Performance optimizations and stability improvements.

**New Features:**
- Query batching support
- Improved WebSocket stability
- Enhanced caching headers
- Better error messages

**No Breaking Changes from 2.1.0**

This is a non-breaking update focusing on performance.

**New Headers:**
```http
X-Indexer-Version: 2.1.4
Cache-Control: public, max-age=10
```

## Version Detection

Detect the indexer version programmatically:

```typescript
async function getIndexerVersion(uri: string): Promise<string> {
  const response = await fetch(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query {
          __indexerInfo {
            version
            chainId
            latestBlock
          }
        }
      `,
    }),
  });

  const result = await response.json();
  return result.data.__indexerInfo.version;
}
```

## Schema Introspection

Query available types and fields:

```typescript
const introspectionQuery = `
  query IntrospectSchema {
    __schema {
      queryType { name }
      types {
        name
        fields {
          name
          type { name }
        }
      }
    }
  }
`;
```

## Version Compatibility Matrix

| Feature | 2.0.0 | 2.1.0 | 2.1.4 |
|---------|-------|-------|-------|
| Balance queries | Yes | Yes | Yes |
| Transaction history | Yes | Yes | Yes |
| Cursor pagination | No | Yes | Yes |
| Date filters | No | Yes | Yes |
| Query batching | No | No | Yes |
| WebSocket subscriptions | Basic | Enhanced | Stable |
| Contract state queries | Basic | Enhanced | Enhanced |
| UTXO detailed queries | No | Yes | Yes |

## Handling Multiple Versions

Build version-aware clients:

```typescript
interface IndexerClient {
  version: string;
  query<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

function createVersionedClient(uri: string, version: string): IndexerClient {
  return {
    version,
    async query(query, variables) {
      // Transform queries for older versions if needed
      const [major, minor, patch] = version.split('.').map(Number);
      const isLegacy = major < 2 || (major === 2 && minor < 1);
      const transformedQuery = isLegacy
        ? transformForLegacy(query)
        : query;

      const response = await fetch(uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: transformedQuery,
          variables,
        }),
      });

      return response.json();
    },
  };
}
```

## Migration Guide

### Migrating from 2.0.0 to 2.1.x

1. **Update pagination queries** to use cursor-based pagination
2. **Update result parsing** to handle edges/nodes structure
3. **Test all queries** against the new schema

**Pagination Migration Helper:**

```typescript
// Adapter for legacy offset-based code
async function queryWithLegacyPagination<T>(
  indexer: IndexerClient,
  query: string,
  variables: { offset: number; limit: number }
): Promise<T[]> {
  // Convert offset to cursor if indexer supports 2.1.x
  const results: T[] = [];
  let cursor: string | null = null;
  let fetched = 0;

  while (fetched < variables.offset + variables.limit) {
    const result = await indexer.query(query, {
      first: Math.min(100, variables.offset + variables.limit - fetched),
      after: cursor,
    });

    const edges = result.data.items.edges;
    const startIndex = Math.max(0, variables.offset - fetched);

    results.push(
      ...edges.slice(startIndex, startIndex + variables.limit - results.length)
        .map(e => e.node)
    );

    cursor = result.data.items.pageInfo.endCursor;
    fetched += edges.length;

    if (!result.data.items.pageInfo.hasNextPage) break;
  }

  return results;
}
```

## Best Practices

1. **Always check version** before making assumptions about available features
2. **Use introspection** to validate queries against the schema
3. **Handle pagination properly** - cursor-based is more reliable for large datasets
4. **Implement retries** for transient failures
5. **Cache responses** appropriately based on data freshness requirements

## Troubleshooting

### Query Validation Errors

If you receive validation errors, the schema may have changed:

```typescript
async function validateQuery(uri: string, query: string): Promise<boolean> {
  const response = await fetch(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  return !result.errors;
}
```

### Version Mismatch Errors

```typescript
class VersionMismatchError extends Error {
  constructor(
    public expected: string,
    public actual: string
  ) {
    super(`Indexer version mismatch: expected ${expected}, got ${actual}`);
  }
}

async function assertVersion(uri: string, minVersion: string): Promise<void> {
  const version = await getIndexerVersion(uri);
  if (version < minVersion) {
    throw new VersionMismatchError(minVersion, version);
  }
}
```
