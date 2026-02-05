/**
 * Reconnect Handler Example
 *
 * Robust WebSocket subscription with automatic reconnection and event replay.
 */

import { createWebSocketClient, WebSocketClient } from '@midnight-ntwrk/midnight-js-indexer';

// Subscription with cursor support for replay
const WATCH_TRANSACTIONS_WITH_CURSOR = `
  subscription WatchTransactions($address: String!, $fromBlock: Int) {
    newTransaction(address: $address, fromBlock: $fromBlock) {
      hash
      blockNumber
      timestamp
      fee
      inputs { address amount }
      outputs { address amount }
    }
  }
`;

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

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Manages reconnection and event replay for WebSocket subscriptions
 */
class ReconnectingSubscription {
  private client: WebSocketClient;
  private subscription: Subscription | null = null;
  private lastBlockNumber = 0;
  private processedHashes = new Set<string>();
  private connectionState: ConnectionState = 'disconnected';
  private isRunning = false;

  // Configuration
  private readonly maxProcessedCacheSize = 10000;
  private readonly stateListeners: Array<(state: ConnectionState) => void> = [];

  constructor(
    private readonly wsUri: string,
    private readonly address: string,
    private readonly onTransaction: (tx: Transaction) => void,
    private readonly onError: (error: Error) => void
  ) {
    this.client = this.createClient();
    this.setupClientEvents();
  }

  /**
   * Create WebSocket client with retry configuration
   */
  private createClient(): WebSocketClient {
    return createWebSocketClient({
      uri: this.wsUri,
      lazy: true,
      keepAlive: 10000,
      retryAttempts: Infinity,
      retryWait: async (attempt) => {
        const delay = Math.min(1000 * Math.pow(2, attempt), 60000);
        console.log(`[Reconnect] Attempt ${attempt}, waiting ${delay / 1000}s`);
        await new Promise(r => setTimeout(r, delay));
      },
    });
  }

  /**
   * Setup client event handlers
   */
  private setupClientEvents(): void {
    this.client.on('connected', () => {
      this.setConnectionState('connected');
      console.log('[Connected]');

      // Re-subscribe with replay from last known block
      if (this.isRunning) {
        this.startSubscription();
      }
    });

    this.client.on('closed', () => {
      this.setConnectionState('disconnected');
      this.subscription = null;
      console.log('[Disconnected]');
    });

    this.client.on('reconnecting', (attempt: number) => {
      this.setConnectionState('reconnecting');
      console.log(`[Reconnecting] Attempt ${attempt}`);
    });

    this.client.on('error', (error: Error) => {
      console.error('[Connection Error]', error.message);
      this.onError(error);
    });
  }

  /**
   * Update connection state and notify listeners
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      for (const listener of this.stateListeners) {
        listener(state);
      }
    }
  }

  /**
   * Start the subscription (called on initial start and reconnect)
   */
  private startSubscription(): void {
    // Clean up existing subscription
    this.subscription?.unsubscribe();

    const fromBlock = this.lastBlockNumber > 0 ? this.lastBlockNumber : undefined;

    console.log(`[Subscribe] Starting from block ${fromBlock ?? 'latest'}`);

    this.subscription = this.client.subscribe({
      query: WATCH_TRANSACTIONS_WITH_CURSOR,
      variables: {
        address: this.address,
        fromBlock,
      },
    }) as Subscription;

    this.subscription.on('data', this.handleData.bind(this));
    this.subscription.on('error', this.handleSubscriptionError.bind(this));
    this.subscription.on('complete', () => {
      console.log('[Subscription Complete]');
    });
  }

  /**
   * Handle incoming subscription data
   */
  private handleData(result: { data?: { newTransaction: Transaction }; errors?: Array<{ message: string }> }): void {
    if (result.errors) {
      this.onError(new Error(result.errors[0].message));
      return;
    }

    const tx = result.data?.newTransaction;
    if (!tx) return;

    // Deduplication: Skip if already processed
    if (this.processedHashes.has(tx.hash)) {
      console.log(`[Dedupe] Skipping duplicate: ${tx.hash.slice(0, 16)}...`);
      return;
    }

    // Track processed transaction
    this.processedHashes.add(tx.hash);

    // Update last block number for replay
    this.lastBlockNumber = Math.max(this.lastBlockNumber, tx.blockNumber);

    // Prevent unbounded cache growth
    if (this.processedHashes.size > this.maxProcessedCacheSize) {
      const toRemove = Array.from(this.processedHashes).slice(0, this.maxProcessedCacheSize / 2);
      toRemove.forEach(hash => this.processedHashes.delete(hash));
    }

    // Deliver to consumer
    this.onTransaction(tx);
  }

  /**
   * Handle subscription-level errors
   */
  private handleSubscriptionError(error: Error): void {
    console.error('[Subscription Error]', error.message);
    this.onError(error);
  }

  /**
   * Start listening for events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Already Running]');
      return;
    }

    this.isRunning = true;
    this.setConnectionState('connecting');

    await this.client.connect();
  }

  /**
   * Stop listening and clean up
   */
  stop(): void {
    this.isRunning = false;
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.client.close();
    this.setConnectionState('disconnected');
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get last processed block number
   */
  getLastBlock(): number {
    return this.lastBlockNumber;
  }

  /**
   * Listen for connection state changes
   */
  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      const index = this.stateListeners.indexOf(listener);
      if (index >= 0) {
        this.stateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Wait for connected state
   */
  async waitForConnected(timeoutMs = 30000): Promise<void> {
    if (this.connectionState === 'connected') return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('Connection timeout'));
      }, timeoutMs);

      const unsubscribe = this.onStateChange((state) => {
        if (state === 'connected') {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  /**
   * Force reconnection (useful for testing or recovery)
   */
  forceReconnect(): void {
    console.log('[Force Reconnect]');
    this.client.terminate();
    // Auto-reconnect will kick in
  }
}

/**
 * Statistics tracking for monitoring
 */
class SubscriptionStats {
  private eventCount = 0;
  private reconnectCount = 0;
  private errorCount = 0;
  private startTime = Date.now();

  recordEvent(): void {
    this.eventCount++;
  }

  recordReconnect(): void {
    this.reconnectCount++;
  }

  recordError(): void {
    this.errorCount++;
  }

  getStats(): {
    events: number;
    reconnects: number;
    errors: number;
    uptimeSeconds: number;
    eventsPerMinute: number;
  } {
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    const eventsPerMinute = this.eventCount / (uptimeSeconds / 60);

    return {
      events: this.eventCount,
      reconnects: this.reconnectCount,
      errors: this.errorCount,
      uptimeSeconds: Math.round(uptimeSeconds),
      eventsPerMinute: Math.round(eventsPerMinute * 100) / 100,
    };
  }

  printStats(): void {
    const stats = this.getStats();
    console.log('\n--- Statistics ---');
    console.log(`  Events:       ${stats.events}`);
    console.log(`  Reconnects:   ${stats.reconnects}`);
    console.log(`  Errors:       ${stats.errors}`);
    console.log(`  Uptime:       ${stats.uptimeSeconds}s`);
    console.log(`  Events/min:   ${stats.eventsPerMinute}`);
  }
}

// Main execution
async function main() {
  const address = process.env.MIDNIGHT_ADDRESS;
  if (!address) {
    console.error('Please set MIDNIGHT_ADDRESS environment variable');
    process.exit(1);
  }

  const wsUri = process.env.INDEXER_WS_URL || 'wss://indexer.testnet.midnight.network/api/v1/graphql';

  console.log('Starting reconnecting subscription...');
  console.log(`Address: ${address}`);
  console.log(`WebSocket: ${wsUri}`);
  console.log('Press Ctrl+C to stop\n');

  const stats = new SubscriptionStats();

  const subscription = new ReconnectingSubscription(
    wsUri,
    address,
    (tx) => {
      stats.recordEvent();
      const time = new Date(tx.timestamp).toISOString().slice(11, 19);
      console.log(`[${time}] Block ${tx.blockNumber}: ${tx.hash.slice(0, 20)}...`);
    },
    (error) => {
      stats.recordError();
      console.error('[Error]', error.message);
    }
  );

  // Track reconnections
  subscription.onStateChange((state) => {
    if (state === 'reconnecting') {
      stats.recordReconnect();
    }
  });

  // Cleanup handler
  const cleanup = () => {
    console.log('\nShutting down...');
    stats.printStats();
    subscription.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Print stats periodically
  setInterval(() => {
    const state = subscription.getState();
    const lastBlock = subscription.getLastBlock();
    console.log(`[Status] ${state}, last block: ${lastBlock}, events: ${stats.getStats().events}`);
  }, 30000);

  try {
    await subscription.start();
    await subscription.waitForConnected();
    console.log('[Ready] Listening for transactions...\n');

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

main();
