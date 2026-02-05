# Network Errors

Complete guide to handling network connectivity issues in Midnight DApps.

## Overview

Midnight DApps depend on several network services:

| Service | Purpose | Default Port |
|---------|---------|--------------|
| **Indexer (HTTP)** | Read contract state, submit transactions | 8001 |
| **Indexer (WebSocket)** | Real-time state updates | 8002 |
| **Proof Server** | Local ZK proof generation | 6300 |
| **Lace Wallet** | Browser extension | N/A |

Network errors occur when these services are unreachable or unresponsive.

## The NetworkError Class

```typescript
class NetworkError extends Error {
  constructor(
    message: string,
    public readonly code: NetworkErrorCode,
    public readonly service: 'indexer' | 'proof_server' | 'websocket' | 'wallet',
    public readonly cause?: Error,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

type NetworkErrorCode =
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_TIMEOUT'
  | 'DNS_FAILED'
  | 'WEBSOCKET_CLOSED'
  | 'WEBSOCKET_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'REQUEST_TIMEOUT'
  | 'OFFLINE';
```

## Connection Errors

### Indexer Connection Errors

The indexer provides contract state and transaction submission.

**Causes:**
- Indexer service down
- Network connectivity issues
- Incorrect URL configuration
- Firewall blocking

**Detection:**
```typescript
async function checkIndexerConnection(indexerUri: string): Promise<{
  connected: boolean;
  latencyMs: number | null;
  error?: string;
}> {
  const start = performance.now();

  try {
    const response = await fetch(`${indexerUri}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        connected: false,
        latencyMs: null,
        error: `Indexer returned status ${response.status}`,
      };
    }

    return {
      connected: true,
      latencyMs: performance.now() - start,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('ECONNREFUSED')) {
      return {
        connected: false,
        latencyMs: null,
        error: 'Indexer is not running or not reachable',
      };
    }

    if (message.includes('timeout') || message.includes('AbortError')) {
      return {
        connected: false,
        latencyMs: null,
        error: 'Indexer connection timed out',
      };
    }

    return {
      connected: false,
      latencyMs: null,
      error: message,
    };
  }
}
```

**Recovery:**
```typescript
async function withIndexerRetry<T>(
  operation: () => Promise<T>,
  indexerUri: string,
  options?: { maxRetries?: number; delayMs?: number }
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000 } = options ?? {};

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Check if indexer is reachable before retrying
      const health = await checkIndexerConnection(indexerUri);

      if (!health.connected) {
        if (attempt === maxRetries) {
          throw new NetworkError(
            'Indexer service is unavailable',
            'SERVICE_UNAVAILABLE',
            'indexer',
            error instanceof Error ? error : undefined
          );
        }

        // Wait longer if service is down
        await sleep(delayMs * 2);
        continue;
      }

      // If service is up but operation failed, it's not a network error
      throw error;
    }
  }

  throw new NetworkError(
    'Failed to connect to indexer',
    'CONNECTION_REFUSED',
    'indexer'
  );
}
```

### Proof Server Connection Errors

The proof server runs locally for ZK proof generation.

**Causes:**
- Docker container not running
- Wrong port mapping
- Container crashed
- Resource exhaustion

**Detection and Recovery:**
```typescript
interface ProofServerStatus {
  available: boolean;
  version?: string;
  error?: string;
  suggestion?: string;
}

async function getProofServerStatus(): Promise<ProofServerStatus> {
  try {
    const response = await fetch('http://localhost:6300/health', {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        available: false,
        error: `Server unhealthy: ${response.status}`,
        suggestion: 'Restart the proof server container',
      };
    }

    const data = await response.json();
    return {
      available: true,
      version: data.version,
    };
  } catch (error) {
    return {
      available: false,
      error: 'Proof server not reachable',
      suggestion: 'Start with: docker run -d -p 6300:6300 midnightnetwork/proof-server',
    };
  }
}

async function ensureProofServerRunning(): Promise<void> {
  const status = await getProofServerStatus();

  if (!status.available) {
    throw new NetworkError(
      status.error ?? 'Proof server unavailable',
      'SERVICE_UNAVAILABLE',
      'proof_server',
      undefined,
      { suggestion: status.suggestion }
    );
  }
}
```

## Timeout Handling

### Request Timeouts

Individual requests may timeout due to network latency or server load.

**Configuration:**
```typescript
const TIMEOUT_CONFIG = {
  /** Health check timeout */
  HEALTH_CHECK_MS: 5_000,

  /** State read timeout */
  STATE_READ_MS: 10_000,

  /** Transaction submission timeout */
  SUBMIT_TX_MS: 30_000,

  /** WebSocket connection timeout */
  WS_CONNECT_MS: 10_000,

  /** Proof generation timeout (handled separately) */
  PROOF_GENERATION_MS: 60_000,
};
```

**Implementation:**
```typescript
async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit & { timeoutMs: number }
): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new NetworkError(
        `Request failed with status ${response.status}`,
        'SERVICE_UNAVAILABLE',
        'indexer'
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError(
        `Request timed out after ${timeoutMs}ms`,
        'REQUEST_TIMEOUT',
        'indexer'
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Adaptive Timeouts

Adjust timeouts based on observed latency:

```typescript
class AdaptiveTimeout {
  private samples: number[] = [];
  private readonly maxSamples = 10;

  constructor(
    private baseTimeout: number,
    private multiplier: number = 3
  ) {}

  recordLatency(latencyMs: number): void {
    this.samples.push(latencyMs);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getTimeout(): number {
    if (this.samples.length === 0) {
      return this.baseTimeout;
    }

    // Use p95 latency as base
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[p95Index] ?? sorted[sorted.length - 1];

    return Math.max(
      this.baseTimeout,
      (p95Latency ?? this.baseTimeout) * this.multiplier
    );
  }
}

// Usage
const stateReadTimeout = new AdaptiveTimeout(5000, 3);

async function readState<T>(accessor: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const timeout = stateReadTimeout.getTimeout();

  try {
    const result = await Promise.race([
      accessor(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeout)
      ),
    ]);

    stateReadTimeout.recordLatency(performance.now() - start);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === 'timeout') {
      throw new NetworkError(
        'State read timed out',
        'REQUEST_TIMEOUT',
        'indexer'
      );
    }
    throw error;
  }
}
```

## WebSocket Disconnection

### Handling Disconnects

```typescript
interface WebSocketManager {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(topic: string, handler: (data: unknown) => void): () => void;
  isConnected(): boolean;
}

function createWebSocketManager(wsUri: string): WebSocketManager {
  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  const maxReconnectAttempts = 5;
  const handlers = new Map<string, Set<(data: unknown) => void>>();

  const connect = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      ws = new WebSocket(wsUri);

      const timeout = setTimeout(() => {
        ws?.close();
        reject(new NetworkError(
          'WebSocket connection timed out',
          'CONNECTION_TIMEOUT',
          'websocket'
        ));
      }, TIMEOUT_CONFIG.WS_CONNECT_MS);

      ws.onopen = () => {
        clearTimeout(timeout);
        reconnectAttempt = 0;
        console.log('WebSocket connected');
        resolve();
      };

      ws.onerror = (event) => {
        clearTimeout(timeout);
        reject(new NetworkError(
          'WebSocket connection failed',
          'WEBSOCKET_ERROR',
          'websocket'
        ));
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed: ${event.code} ${event.reason}`);
        scheduleReconnect();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const topic = message.topic as string;
          const topicHandlers = handlers.get(topic);
          topicHandlers?.forEach(handler => handler(message.data));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
    });
  };

  const scheduleReconnect = () => {
    if (reconnectAttempt >= maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    reconnectAttempt++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
    setTimeout(() => {
      connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  };

  const subscribe = (
    topic: string,
    handler: (data: unknown) => void
  ): (() => void) => {
    if (!handlers.has(topic)) {
      handlers.set(topic, new Set());
    }
    handlers.get(topic)!.add(handler);

    // Send subscription message
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'subscribe', topic }));
    }

    return () => {
      handlers.get(topic)?.delete(handler);
      if (handlers.get(topic)?.size === 0) {
        handlers.delete(topic);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'unsubscribe', topic }));
        }
      }
    };
  };

  return {
    connect,
    disconnect: () => ws?.close(),
    subscribe,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
  };
}
```

### React Hook for WebSocket Status

```typescript
function useWebSocketStatus(wsManager: WebSocketManager): {
  connected: boolean;
  reconnecting: boolean;
  error: NetworkError | null;
} {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<NetworkError | null>(null);

  useEffect(() => {
    const checkStatus = setInterval(() => {
      const isConnected = wsManager.isConnected();
      setConnected(isConnected);
      setReconnecting(!isConnected && error === null);
    }, 1000);

    return () => clearInterval(checkStatus);
  }, [wsManager, error]);

  return { connected, reconnecting, error };
}
```

## Retry Strategies

### Exponential Backoff

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  shouldRetry: (error, attempt) => {
    if (error instanceof NetworkError) {
      // Always retry connection issues
      return ['CONNECTION_REFUSED', 'CONNECTION_TIMEOUT', 'REQUEST_TIMEOUT']
        .includes(error.code);
    }
    return false;
  },
};

async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!finalConfig.shouldRetry(error, attempt)) {
        throw error;
      }

      if (attempt < finalConfig.maxRetries) {
        const delay = Math.min(
          finalConfig.baseDelayMs * Math.pow(2, attempt - 1),
          finalConfig.maxDelayMs
        );

        // Add jitter to prevent thundering herd
        const jitter = delay * 0.2 * Math.random();
        await sleep(delay + jitter);
      }
    }
  }

  throw lastError;
}
```

### Circuit Breaker

Prevent cascading failures by stopping requests when service is unhealthy:

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeMs: number;
}

class CircuitBreaker {
  private failures = 0;
  private lastFailure: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        throw new NetworkError(
          'Circuit breaker is open',
          'SERVICE_UNAVAILABLE',
          'indexer'
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) return true;
    return Date.now() - this.lastFailure >= this.config.resetTimeMs;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }
}

// Usage
const indexerCircuit = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeMs: 30000,
});

async function readContractState<T>(accessor: () => Promise<T>): Promise<T> {
  return indexerCircuit.execute(accessor);
}
```

## Offline Detection

### Browser Online Status

```typescript
function useOnlineStatus(): {
  isOnline: boolean;
  lastOnline: Date | null;
} {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastOnline, setLastOnline] = useState<Date | null>(
    navigator.onLine ? new Date() : null
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastOnline(new Date());
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, lastOnline };
}
```

### Service Health Dashboard

```typescript
interface ServiceHealth {
  indexer: { status: 'up' | 'down' | 'degraded'; latencyMs?: number };
  proofServer: { status: 'up' | 'down' | 'degraded'; version?: string };
  websocket: { status: 'connected' | 'disconnected' | 'reconnecting' };
}

function useServiceHealth(
  indexerUri: string,
  wsManager: WebSocketManager
): ServiceHealth {
  const [health, setHealth] = useState<ServiceHealth>({
    indexer: { status: 'down' },
    proofServer: { status: 'down' },
    websocket: { status: 'disconnected' },
  });

  useEffect(() => {
    const checkHealth = async () => {
      // Check indexer
      const indexerHealth = await checkIndexerConnection(indexerUri);
      // Check proof server
      const proofHealth = await getProofServerStatus();
      // Check WebSocket
      const wsConnected = wsManager.isConnected();

      setHealth({
        indexer: {
          status: indexerHealth.connected ? 'up' : 'down',
          latencyMs: indexerHealth.latencyMs ?? undefined,
        },
        proofServer: {
          status: proofHealth.available ? 'up' : 'down',
          version: proofHealth.version,
        },
        websocket: {
          status: wsConnected ? 'connected' : 'disconnected',
        },
      });
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);

    return () => clearInterval(interval);
  }, [indexerUri, wsManager]);

  return health;
}
```

## User-Facing Error Messages

```typescript
const NETWORK_ERROR_MESSAGES: Record<NetworkErrorCode, {
  title: string;
  description: string;
  suggestion: string;
}> = {
  CONNECTION_REFUSED: {
    title: 'Connection Failed',
    description: 'Unable to connect to the service.',
    suggestion: 'Check that the service is running and try again.',
  },
  CONNECTION_TIMEOUT: {
    title: 'Connection Timeout',
    description: 'The connection took too long to establish.',
    suggestion: 'Check your internet connection and try again.',
  },
  DNS_FAILED: {
    title: 'DNS Resolution Failed',
    description: 'Unable to resolve the service address.',
    suggestion: 'Check your network settings.',
  },
  WEBSOCKET_CLOSED: {
    title: 'Real-time Connection Lost',
    description: 'Lost connection to real-time updates.',
    suggestion: 'Updates may be delayed. Reconnecting automatically...',
  },
  WEBSOCKET_ERROR: {
    title: 'Real-time Connection Error',
    description: 'Error in real-time connection.',
    suggestion: 'Some features may not update in real-time.',
  },
  SERVICE_UNAVAILABLE: {
    title: 'Service Unavailable',
    description: 'The required service is not available.',
    suggestion: 'Please try again later.',
  },
  REQUEST_TIMEOUT: {
    title: 'Request Timeout',
    description: 'The request took too long to complete.',
    suggestion: 'Try again. If the problem persists, try later.',
  },
  OFFLINE: {
    title: 'You Are Offline',
    description: 'No internet connection detected.',
    suggestion: 'Check your internet connection.',
  },
};
```

## Best Practices

1. **Health checks first** - Verify service availability before operations
2. **Graceful degradation** - Continue with limited functionality when possible
3. **User feedback** - Show connection status in UI
4. **Automatic retry** - Retry transient failures with backoff
5. **Circuit breaker** - Prevent overloading failing services
6. **Offline support** - Handle offline state explicitly
7. **Reconnection** - Automatically reconnect WebSocket connections
8. **Timeout tuning** - Use adaptive timeouts based on observed latency
