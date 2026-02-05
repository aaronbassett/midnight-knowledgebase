# WebSocket Setup

Complete guide to configuring WebSocket connections for Midnight indexer subscriptions.

## Overview

The Midnight indexer supports GraphQL subscriptions over WebSocket using the `graphql-ws` protocol. This enables real-time event delivery for blockchain state changes, new transactions, and contract events.

## Connection Configuration

### Basic Setup

```typescript
import { createWebSocketClient } from '@midnight-ntwrk/midnight-js-indexer';

const client = createWebSocketClient({
  uri: 'wss://indexer.testnet.midnight.network/api/v1/graphql',
});
```

### Full Configuration

```typescript
interface WebSocketConfig {
  uri: string;
  connectionParams?: Record<string, unknown>;
  lazy?: boolean;
  keepAlive?: number;
  retryAttempts?: number;
  retryWait?: (attempt: number) => Promise<void>;
}

const client = createWebSocketClient({
  uri: 'wss://indexer.testnet.midnight.network/api/v1/graphql',

  // Optional: Authentication or headers
  connectionParams: {
    authorization: process.env.API_KEY,
  },

  // Lazy: Only connect when first subscription is created
  lazy: true,

  // Keep-alive ping interval (ms)
  keepAlive: 10000,

  // Retry configuration
  retryAttempts: 5,
  retryWait: async (attempt) => {
    await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 30000)));
  },
});
```

## Network Endpoints

### Testnet

```
WebSocket: wss://indexer.testnet.midnight.network/api/v1/graphql
HTTP:      https://indexer.testnet.midnight.network/api/v1/graphql
```

### Mainnet

```
WebSocket: wss://indexer.midnight.network/api/v1/graphql
HTTP:      https://indexer.midnight.network/api/v1/graphql
```

## Protocol Details

### graphql-ws Protocol

The indexer uses the `graphql-ws` protocol (previously known as `subscriptions-transport-ws`). This is the standard protocol for GraphQL subscriptions.

**Message Types:**

| Type | Direction | Purpose |
|------|-----------|---------|
| `connection_init` | Client -> Server | Initialize connection |
| `connection_ack` | Server -> Client | Confirm connection |
| `subscribe` | Client -> Server | Start subscription |
| `next` | Server -> Client | Subscription data |
| `error` | Server -> Client | Subscription error |
| `complete` | Both | End subscription |
| `ping` | Both | Keep-alive |
| `pong` | Both | Keep-alive response |

### Connection Handshake

```typescript
// Low-level example (handled by SDK)
const ws = new WebSocket('wss://indexer.testnet.midnight.network/api/v1/graphql', 'graphql-ws');

ws.onopen = () => {
  // Send connection init
  ws.send(JSON.stringify({
    type: 'connection_init',
    payload: {
      // Optional connection params
    },
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'connection_ack':
      console.log('Connection established');
      // Now safe to subscribe
      break;
    case 'next':
      console.log('Subscription data:', message.payload);
      break;
    case 'error':
      console.error('Subscription error:', message.payload);
      break;
    case 'complete':
      console.log('Subscription completed');
      break;
  }
};
```

## Subscription Queries

### Available Subscriptions

```graphql
# New transaction affecting an address
subscription WatchTransactions($address: String!) {
  newTransaction(address: $address) {
    hash
    blockNumber
    timestamp
    fee
    inputs { address amount }
    outputs { address amount }
  }
}

# New blocks
subscription WatchBlocks {
  newBlock {
    number
    hash
    timestamp
    transactionCount
  }
}

# Contract state changes
subscription WatchContract($address: String!) {
  contractStateChange(address: $address) {
    contractAddress
    key
    oldValue
    newValue
    txHash
    blockNumber
  }
}

# UTXO changes for an address
subscription WatchUTXOs($address: String!) {
  utxoChange(address: $address) {
    type  # "created" or "spent"
    txHash
    outputIndex
    amount
    blockNumber
  }
}

# Transaction confirmation
subscription TrackTransaction($hash: String!) {
  transactionConfirmation(hash: $hash) {
    hash
    blockNumber
    confirmations
    timestamp
  }
}
```

## Connection Lifecycle

### Event Handlers

```typescript
const client = createWebSocketClient({ uri });

// Connection opened
client.on('connected', () => {
  console.log('WebSocket connected');
});

// Connection closed
client.on('closed', (event) => {
  console.log('WebSocket closed:', event.code, event.reason);
});

// Connection error
client.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Reconnecting
client.on('reconnecting', (attempt) => {
  console.log('Reconnecting, attempt:', attempt);
});
```

### Manual Connection Control

```typescript
// Connect immediately (if lazy: true)
await client.connect();

// Check connection state
if (client.isConnected()) {
  console.log('Connected');
}

// Gracefully close
await client.close();

// Terminate immediately
client.terminate();
```

## Authentication

### API Key Authentication

```typescript
const client = createWebSocketClient({
  uri: 'wss://indexer.testnet.midnight.network/api/v1/graphql',
  connectionParams: {
    authorization: `Bearer ${process.env.API_KEY}`,
  },
});
```

### Dynamic Authentication

```typescript
const client = createWebSocketClient({
  uri,
  connectionParams: async () => {
    // Fetch fresh token
    const token = await getAuthToken();
    return { authorization: `Bearer ${token}` };
  },
});
```

## Keep-Alive

### Ping/Pong

The client automatically handles keep-alive pings:

```typescript
const client = createWebSocketClient({
  uri,
  keepAlive: 10000, // Send ping every 10 seconds
});
```

### Server Timeout

If the server doesn't respond to pings, the connection will be considered dead:

```typescript
const client = createWebSocketClient({
  uri,
  keepAlive: 10000,
  connectionTimeout: 5000, // Max time to wait for pong
});
```

## TLS/SSL Configuration

### Custom Certificate (Node.js)

```typescript
import { Agent } from 'https';
import { readFileSync } from 'fs';

const agent = new Agent({
  ca: readFileSync('/path/to/ca-cert.pem'),
  cert: readFileSync('/path/to/client-cert.pem'),
  key: readFileSync('/path/to/client-key.pem'),
});

const client = createWebSocketClient({
  uri,
  webSocketImpl: (url: string) => {
    return new WebSocket(url, { agent });
  },
});
```

### Disable Certificate Verification (Development Only)

```typescript
// WARNING: Never use in production!
const client = createWebSocketClient({
  uri,
  webSocketImpl: (url: string) => {
    return new WebSocket(url, {
      rejectUnauthorized: false,
    });
  },
});
```

## Best Practices

### 1. Use Lazy Connections

Don't connect until needed:

```typescript
const client = createWebSocketClient({
  uri,
  lazy: true, // Connect on first subscribe()
});
```

### 2. Handle All Events

```typescript
subscription.on('data', handleData);
subscription.on('error', handleError);
subscription.on('complete', handleComplete);
```

### 3. Clean Up Properly

```typescript
// Store unsubscribe functions
const unsubscribes: (() => void)[] = [];

unsubscribes.push(subscription.unsubscribe);

// On cleanup
for (const unsub of unsubscribes) {
  unsub();
}
client.close();
```

### 4. Implement Health Checks

```typescript
async function checkWebSocketHealth(client: WebSocketClient): Promise<boolean> {
  try {
    if (!client.isConnected()) {
      await client.connect();
    }

    // Simple ping test
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);

      const unsub = client.subscribe({
        query: '{ __typename }',
      });

      unsub.on('data', () => {
        clearTimeout(timeout);
        unsub.unsubscribe();
        resolve(true);
      });

      unsub.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}
```

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED
```

- Check the WebSocket URL is correct
- Verify the indexer service is running
- Check firewall rules

### Protocol Error

```
Error: Unexpected server response: 400
```

- Ensure using `graphql-ws` protocol
- Check for correct subprotocol header

### Authentication Error

```
Error: Connection rejected: Unauthorized
```

- Verify API key or token
- Check connectionParams format

### Timeout

```
Error: Connection timeout
```

- Increase keepAlive timeout
- Check network connectivity
- Verify server is responding to pings
