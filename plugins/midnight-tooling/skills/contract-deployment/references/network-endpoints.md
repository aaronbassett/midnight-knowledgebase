# Network Endpoints

Complete reference for Midnight network endpoints, connection patterns, and best practices for reliable connectivity.

## Endpoint Overview

### Testnet Endpoints

| Service | URL | Protocol | Purpose |
|---------|-----|----------|---------|
| Indexer REST | `https://indexer.testnet.midnight.network` | HTTPS | Query blockchain data |
| Indexer WebSocket | `wss://indexer.testnet.midnight.network/ws` | WSS | Real-time subscriptions |
| Prover | `https://prover.testnet.midnight.network` | HTTPS | Remote proof generation |

### Mainnet Endpoints

| Service | URL | Protocol | Purpose |
|---------|-----|----------|---------|
| Indexer REST | `https://indexer.midnight.network` | HTTPS | Query blockchain data |
| Indexer WebSocket | `wss://indexer.midnight.network/ws` | WSS | Real-time subscriptions |
| Prover | `https://prover.midnight.network` | HTTPS | Remote proof generation |

## Connection Setup

### Indexer Client

```typescript
import { createIndexerClient } from '@midnight-ntwrk/midnight-js-indexer';

const indexer = createIndexerClient({
  url: 'https://indexer.testnet.midnight.network',
  timeout: 30000, // 30 second timeout
  retries: 3,
});

// Health check
const health = await indexer.health();
console.log('Indexer status:', health.status);
console.log('Latest block:', health.latestBlock);
```

### WebSocket Connection

```typescript
import { createIndexerWsClient } from '@midnight-ntwrk/midnight-js-indexer';

const wsClient = createIndexerWsClient({
  url: 'wss://indexer.testnet.midnight.network/ws',
  reconnect: true,
  reconnectDelay: 1000,
  maxReconnectAttempts: 10,
});

wsClient.on('connect', () => {
  console.log('WebSocket connected');
});

wsClient.on('disconnect', () => {
  console.log('WebSocket disconnected');
});

wsClient.on('error', (error) => {
  console.error('WebSocket error:', error);
});

await wsClient.connect();
```

### Prover Client

```typescript
import { createProverClient } from '@midnight-ntwrk/midnight-js-prover';

const prover = createProverClient({
  url: 'https://prover.testnet.midnight.network',
  timeout: 120000, // Proofs can take time
});

// Check prover availability
const proverHealth = await prover.health();
console.log('Prover status:', proverHealth.status);
```

## Health Check Endpoints

Monitor service availability before operations:

```typescript
interface HealthCheckResult {
  indexer: boolean;
  prover: boolean;
  latestBlock: number;
  latency: {
    indexer: number;
    prover: number;
  };
}

async function checkEndpointHealth(
  config: NetworkConfig
): Promise<HealthCheckResult> {
  const results: HealthCheckResult = {
    indexer: false,
    prover: false,
    latestBlock: 0,
    latency: { indexer: 0, prover: 0 },
  };

  // Check indexer
  try {
    const start = Date.now();
    const response = await fetch(`${config.indexer}/health`);
    results.latency.indexer = Date.now() - start;
    if (response.ok) {
      const data = await response.json();
      results.indexer = true;
      results.latestBlock = data.latestBlock;
    }
  } catch (error) {
    console.error('Indexer health check failed:', error);
  }

  // Check prover
  try {
    const start = Date.now();
    const response = await fetch(`${config.prover}/health`);
    results.latency.prover = Date.now() - start;
    results.prover = response.ok;
  } catch (error) {
    console.error('Prover health check failed:', error);
  }

  return results;
}
```

## Rate Limits and Best Practices

### Rate Limits

Public endpoints have rate limits to ensure fair usage:

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| Indexer REST | 100 requests | per minute |
| Indexer WS | 50 subscriptions | per connection |
| Prover | 10 proof requests | per minute |

### Handling Rate Limits

```typescript
import pRetry from 'p-retry';

async function withRateLimitRetry<T>(
  operation: () => Promise<T>
): Promise<T> {
  return pRetry(operation, {
    retries: 5,
    onFailedAttempt: async (error) => {
      if (error.message.includes('rate limit')) {
        // Exponential backoff for rate limits
        const delay = Math.pow(2, error.attemptNumber) * 1000;
        console.log(`Rate limited, waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    },
  });
}
```

### Connection Pooling

For high-throughput applications, implement connection pooling:

```typescript
class IndexerPool {
  private clients: IndexerClient[] = [];
  private currentIndex = 0;

  constructor(urls: string[], poolSize = 3) {
    for (let i = 0; i < poolSize; i++) {
      this.clients.push(
        createIndexerClient({ url: urls[i % urls.length] })
      );
    }
  }

  getClient(): IndexerClient {
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    return client;
  }
}
```

## WebSocket Connection Patterns

### Subscription Management

```typescript
class SubscriptionManager {
  private ws: IndexerWsClient;
  private subscriptions = new Map<string, () => void>();

  constructor(wsUrl: string) {
    this.ws = createIndexerWsClient({ url: wsUrl });
  }

  async subscribe(
    topic: string,
    filter: Record<string, unknown>,
    handler: (data: unknown) => void
  ): Promise<string> {
    const subscriptionId = await this.ws.subscribe(topic, filter);

    this.ws.on(subscriptionId, handler);
    this.subscriptions.set(subscriptionId, () => {
      this.ws.off(subscriptionId, handler);
    });

    return subscriptionId;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const cleanup = this.subscriptions.get(subscriptionId);
    if (cleanup) {
      cleanup();
      this.subscriptions.delete(subscriptionId);
    }
    await this.ws.unsubscribe(subscriptionId);
  }

  async close(): Promise<void> {
    for (const [id] of this.subscriptions) {
      await this.unsubscribe(id);
    }
    await this.ws.close();
  }
}
```

### Reconnection with State Recovery

```typescript
class ResilientWsClient {
  private ws: IndexerWsClient;
  private activeSubscriptions: Map<string, SubscriptionConfig> = new Map();

  async connect(): Promise<void> {
    this.ws = createIndexerWsClient({
      url: this.wsUrl,
      reconnect: false, // Manual reconnection
    });

    this.ws.on('disconnect', async () => {
      console.log('Connection lost, reconnecting...');
      await this.reconnect();
    });

    await this.ws.connect();
  }

  private async reconnect(): Promise<void> {
    const maxAttempts = 10;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        await this.connect();
        await this.restoreSubscriptions();
        console.log('Reconnected and restored subscriptions');
        return;
      } catch (error) {
        attempt++;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    throw new Error('Failed to reconnect after max attempts');
  }

  private async restoreSubscriptions(): Promise<void> {
    for (const [, config] of this.activeSubscriptions) {
      await this.ws.subscribe(config.topic, config.filter);
    }
  }
}
```

## Timeout Configuration

Recommended timeout values for different operations:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| Health check | 5,000ms | Should be fast |
| Balance query | 10,000ms | Simple lookup |
| Transaction query | 15,000ms | May need indexing |
| Contract deployment | 120,000ms | Includes proof generation |
| Proof generation | 180,000ms | Complex circuits take time |

```typescript
const timeouts = {
  health: 5000,
  query: 15000,
  deployment: 120000,
  proof: 180000,
};
```

## Error Handling

Common endpoint errors and recovery strategies:

| Error | Cause | Recovery |
|-------|-------|----------|
| `ECONNREFUSED` | Service unavailable | Retry with backoff, check status page |
| `ETIMEDOUT` | Network issue | Increase timeout, retry |
| `429 Too Many Requests` | Rate limited | Exponential backoff |
| `503 Service Unavailable` | Service overloaded | Wait and retry |
| `WebSocket closed` | Connection dropped | Reconnect with subscription recovery |

## Related Resources

- [deployment-config.md](deployment-config.md) - Environment and wallet configuration
- `midnight-debugging` skill - Troubleshooting connection issues
