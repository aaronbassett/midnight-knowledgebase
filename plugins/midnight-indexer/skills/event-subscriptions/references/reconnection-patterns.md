# Reconnection Patterns

Strategies for handling WebSocket disconnections and ensuring event continuity.

## Overview

WebSocket connections can drop due to network issues, server restarts, or idle timeouts. Robust applications must handle disconnections gracefully, automatically reconnect, and recover any missed events.

## Automatic Reconnection

### Built-in Retry

The SDK provides automatic reconnection:

```typescript
const client = createWebSocketClient({
  uri: 'wss://indexer.testnet.midnight.network/api/v1/graphql',

  // Retry up to 5 times
  retryAttempts: 5,

  // Custom retry delay (exponential backoff)
  retryWait: async (attempt) => {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    await new Promise(r => setTimeout(r, delay));
  },
});
```

### Infinite Retry

For critical applications that must always be connected:

```typescript
const client = createWebSocketClient({
  uri,
  retryAttempts: Infinity,
  retryWait: async (attempt) => {
    // Cap at 1 minute between attempts
    const delay = Math.min(1000 * Math.pow(2, attempt), 60000);
    console.log(`Reconnecting in ${delay / 1000}s (attempt ${attempt})...`);
    await new Promise(r => setTimeout(r, delay));
  },
});
```

## Event Replay

### The Problem

When a connection drops, events may occur that your application misses:

```
Timeline:
[Event A] -> [Event B] -> [DISCONNECT] -> [Event C] -> [Event D] -> [RECONNECT] -> [Event E]

Without replay: Your app only sees A, B, E (missed C, D)
With replay:    Your app sees A, B, C, D, E (no gaps)
```

### Cursor-Based Replay

Track the last received event and replay from that point:

```typescript
class ReplayableSubscription {
  private lastCursor: string | null = null;
  private subscription: Subscription | null = null;

  constructor(
    private client: WebSocketClient,
    private query: string,
    private variables: Record<string, unknown>,
    private onEvent: (data: unknown) => void
  ) {}

  start(): void {
    this.subscribe();

    this.client.on('closed', () => {
      console.log('Connection closed, will replay from:', this.lastCursor);
    });

    this.client.on('connected', () => {
      // Resubscribe with cursor for replay
      this.subscribe();
    });
  }

  private subscribe(): void {
    this.subscription?.unsubscribe();

    const variables = this.lastCursor
      ? { ...this.variables, afterCursor: this.lastCursor }
      : this.variables;

    this.subscription = this.client.subscribe({
      query: this.query,
      variables,
    });

    this.subscription.on('data', (result) => {
      if (result.data) {
        // Extract cursor from event
        const cursor = result.data.cursor;
        if (cursor) {
          this.lastCursor = cursor;
        }
        this.onEvent(result.data);
      }
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
  }
}
```

### Block-Based Replay

Replay events from a specific block number:

```typescript
interface BlockTrackedSubscription {
  lastBlockNumber: number;
  subscribe: (fromBlock: number) => Subscription;
}

function createBlockTrackedSubscription(
  client: WebSocketClient,
  address: string,
  onTransaction: (tx: Transaction) => void
): BlockTrackedSubscription {
  let lastBlock = 0;

  const subscriptionQuery = `
    subscription WatchTransactions($address: String!, $fromBlock: Int) {
      newTransaction(address: $address, fromBlock: $fromBlock) {
        hash
        blockNumber
        timestamp
        # ... other fields
      }
    }
  `;

  return {
    get lastBlockNumber() {
      return lastBlock;
    },

    subscribe(fromBlock = 0) {
      const sub = client.subscribe({
        query: subscriptionQuery,
        variables: { address, fromBlock },
      });

      sub.on('data', (result) => {
        const tx = result.data?.newTransaction;
        if (tx) {
          lastBlock = Math.max(lastBlock, tx.blockNumber);
          onTransaction(tx);
        }
      });

      return sub;
    },
  };
}

// Usage with automatic reconnect
function startWithReconnect(address: string, onTransaction: (tx: Transaction) => void) {
  const client = createWebSocketClient({ uri, retryAttempts: Infinity });
  const tracker = createBlockTrackedSubscription(client, address, onTransaction);

  let subscription: Subscription | null = null;

  client.on('connected', () => {
    // Replay from last known block
    subscription = tracker.subscribe(tracker.lastBlockNumber);
  });

  client.on('closed', () => {
    subscription = null;
  });

  // Initial subscription
  subscription = tracker.subscribe(0);

  return () => {
    subscription?.unsubscribe();
    client.close();
  };
}
```

## Deduplication

Replay can cause duplicate events. Implement deduplication:

```typescript
class DeduplicatedEventHandler<T extends { id: string }> {
  private seen = new Set<string>();
  private maxSize = 10000;

  constructor(private handler: (event: T) => void) {}

  handle(event: T): void {
    if (this.seen.has(event.id)) {
      console.log('Duplicate event ignored:', event.id);
      return;
    }

    this.seen.add(event.id);

    // Prevent unbounded growth
    if (this.seen.size > this.maxSize) {
      const toDelete = Array.from(this.seen).slice(0, this.maxSize / 2);
      toDelete.forEach(id => this.seen.delete(id));
    }

    this.handler(event);
  }
}

// Usage
const deduped = new DeduplicatedEventHandler<Transaction>((tx) => {
  console.log('Processing transaction:', tx.hash);
});

subscription.on('data', (result) => {
  deduped.handle({
    id: result.data.newTransaction.hash,
    ...result.data.newTransaction,
  });
});
```

## Connection State Machine

Manage complex connection states:

```typescript
type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

class ConnectionStateMachine {
  private state: ConnectionState = 'disconnected';
  private listeners = new Set<(state: ConnectionState) => void>();

  constructor(private client: WebSocketClient) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.client.on('connected', () => this.transition('connected'));
    this.client.on('closed', () => this.transition('disconnected'));
    this.client.on('reconnecting', () => this.transition('reconnecting'));
    this.client.on('error', () => this.transition('error'));
  }

  private transition(newState: ConnectionState): void {
    const oldState = this.state;
    this.state = newState;

    console.log(`Connection: ${oldState} -> ${newState}`);

    for (const listener of this.listeners) {
      listener(newState);
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async waitForConnected(timeout = 30000): Promise<void> {
    if (this.state === 'connected') return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('Connection timeout'));
      }, timeout);

      const unsubscribe = this.onStateChange((state) => {
        if (state === 'connected') {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        } else if (state === 'error') {
          clearTimeout(timer);
          unsubscribe();
          reject(new Error('Connection failed'));
        }
      });
    });
  }
}
```

## Fan-Out to Multiple Consumers

Distribute events to multiple consumers:

```typescript
class EventFanOut<T> {
  private consumers = new Map<string, (event: T) => void>();

  register(id: string, consumer: (event: T) => void): () => void {
    this.consumers.set(id, consumer);
    return () => this.consumers.delete(id);
  }

  broadcast(event: T): void {
    for (const [id, consumer] of this.consumers) {
      try {
        consumer(event);
      } catch (error) {
        console.error(`Consumer ${id} error:`, error);
      }
    }
  }
}

// Single subscription, multiple consumers
function createSharedSubscription(
  client: WebSocketClient,
  address: string
): EventFanOut<Transaction> {
  const fanOut = new EventFanOut<Transaction>();

  const subscription = client.subscribe({
    query: WATCH_TRANSACTIONS_QUERY,
    variables: { address },
  });

  subscription.on('data', (result) => {
    if (result.data?.newTransaction) {
      fanOut.broadcast(result.data.newTransaction);
    }
  });

  return fanOut;
}

// Usage
const shared = createSharedSubscription(client, address);

// Consumer 1: Log to console
shared.register('logger', (tx) => console.log('New TX:', tx.hash));

// Consumer 2: Update UI
shared.register('ui', (tx) => updateTransactionList(tx));

// Consumer 3: Send notification
shared.register('notifications', (tx) => sendPushNotification(tx));
```

## Health Monitoring

Monitor connection health and trigger alerts:

```typescript
class ConnectionHealthMonitor {
  private lastEventTime = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private client: WebSocketClient,
    private maxIdleMs = 60000,
    private onUnhealthy: () => void
  ) {}

  start(): void {
    // Update timestamp on any event
    this.client.on('connected', () => this.touch());

    // Periodic health check
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
    }, this.maxIdleMs / 2);
  }

  touch(): void {
    this.lastEventTime = Date.now();
  }

  private checkHealth(): void {
    const idleTime = Date.now() - this.lastEventTime;

    if (idleTime > this.maxIdleMs) {
      console.warn(`Connection idle for ${idleTime}ms`);
      this.onUnhealthy();
    }
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Usage
const monitor = new ConnectionHealthMonitor(
  client,
  60000, // 1 minute max idle
  () => {
    console.log('Connection unhealthy, forcing reconnect');
    client.terminate();
    client.connect();
  }
);
```

## Best Practices

### 1. Always Implement Replay

Lost events can cause data inconsistencies:

```typescript
// Good: Track position for replay
let lastBlock = await getLastProcessedBlock();
subscription = startFrom(lastBlock);

// Bad: Start fresh on reconnect
subscription = startFresh();
```

### 2. Deduplicate Events

Replay may send duplicates:

```typescript
// Good: Check before processing
if (!processed.has(event.id)) {
  processEvent(event);
  processed.add(event.id);
}

// Bad: Process all events blindly
processEvent(event);
```

### 3. Handle Backpressure

Don't let events pile up:

```typescript
// Good: Buffer and batch process
buffer.push(event);
if (buffer.length >= 100 || timeSinceLastFlush > 1000) {
  await processBatch(buffer.splice(0));
}

// Bad: Process synchronously in handler
await processEvent(event); // Blocks receive
```

### 4. Log Connection Events

Debugging is easier with visibility:

```typescript
client.on('connected', () => log.info('WS connected'));
client.on('closed', (e) => log.warn('WS closed', e));
client.on('error', (e) => log.error('WS error', e));
client.on('reconnecting', (n) => log.info(`Reconnecting #${n}`));
```
