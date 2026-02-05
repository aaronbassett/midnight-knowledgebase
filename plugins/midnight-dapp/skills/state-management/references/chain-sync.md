# Chain Synchronization

Patterns for keeping DApp state synchronized with on-chain state changes.

## Overview

On-chain state can change at any time from other transactions. Your DApp must handle:

1. **Initial Load** - Fetch current state when component mounts
2. **Periodic Refresh** - Poll for updates at regular intervals
3. **Real-time Updates** - Subscribe via WebSocket for instant notifications
4. **Optimistic Updates** - Update UI before chain confirmation
5. **Reorg Handling** - Handle blockchain reorganizations

## Polling Patterns

### Basic Polling

Simple interval-based state refresh:

```typescript
function usePolledState<T>(
  accessor: () => Promise<T>,
  intervalMs: number = 5000
) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await accessor();
        if (!cancelled) {
          setValue(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // Initial fetch
    poll();

    // Set up polling interval
    const interval = setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessor, intervalMs]);

  return { value, loading, error };
}

// Usage
const { value: balance, loading } = usePolledState(
  () => contract.state.balances.get(userAddress),
  5000 // Poll every 5 seconds
);
```

### Adaptive Polling

Adjust polling frequency based on activity:

```typescript
interface AdaptivePollingOptions {
  minInterval: number;  // Minimum polling interval (ms)
  maxInterval: number;  // Maximum polling interval (ms)
  backoffFactor: number; // Multiply interval when no changes
}

function useAdaptivePolling<T>(
  accessor: () => Promise<T>,
  options: AdaptivePollingOptions = {
    minInterval: 1000,
    maxInterval: 30000,
    backoffFactor: 1.5,
  }
) {
  const [value, setValue] = useState<T | null>(null);
  const [interval, setIntervalMs] = useState(options.minInterval);
  const previousValue = useRef<T | null>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    async function poll() {
      try {
        const result = await accessor();

        // Check if value changed
        const changed = JSON.stringify(result) !== JSON.stringify(previousValue.current);
        previousValue.current = result;

        if (changed) {
          setValue(result);
          // Reset to fast polling when changes detected
          setIntervalMs(options.minInterval);
        } else {
          // Back off when no changes
          setIntervalMs(prev =>
            Math.min(prev * options.backoffFactor, options.maxInterval)
          );
        }
      } catch (e) {
        console.error('Polling error:', e);
      }

      // Schedule next poll
      timeout = setTimeout(poll, interval);
    }

    poll();

    return () => clearTimeout(timeout);
  }, [accessor, interval, options]);

  return value;
}
```

### Focus-Aware Polling

Pause polling when tab is not visible:

```typescript
function useFocusAwarePolling<T>(
  accessor: () => Promise<T>,
  intervalMs: number = 5000
) {
  const [value, setValue] = useState<T | null>(null);
  const [isVisible, setIsVisible] = useState(!document.hidden);

  // Track visibility
  useEffect(() => {
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Poll only when visible
  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;

    async function poll() {
      const result = await accessor();
      if (!cancelled) setValue(result);
    }

    poll();
    const interval = setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessor, intervalMs, isVisible]);

  return value;
}
```

## WebSocket Subscriptions

### Connecting via indexerWsUri

Midnight provides WebSocket connectivity through the indexer:

```typescript
interface StateSubscription<T> {
  value: T | null;
  connected: boolean;
  error: Error | null;
  unsubscribe: () => void;
}

async function subscribeToState<T>(
  wsUri: string,
  contractAddress: string,
  stateKey: string,
  onUpdate: (value: T) => void
): Promise<StateSubscription<T>> {
  let connected = false;
  let error: Error | null = null;
  let value: T | null = null;

  const ws = new WebSocket(wsUri);

  ws.onopen = () => {
    connected = true;

    // Subscribe to state changes
    ws.send(JSON.stringify({
      type: 'subscribe',
      contract: contractAddress,
      state: stateKey,
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state_update') {
      value = data.value as T;
      onUpdate(value);
    }
  };

  ws.onerror = (e) => {
    error = new Error('WebSocket error');
  };

  ws.onclose = () => {
    connected = false;
  };

  return {
    get value() { return value; },
    get connected() { return connected; },
    get error() { return error; },
    unsubscribe: () => ws.close(),
  };
}
```

### React Hook for WebSocket

```typescript
function useStateSubscription<T>(
  wsUri: string | null,
  contractAddress: string,
  stateKey: string,
  fallback: T
): T {
  const [value, setValue] = useState<T>(fallback);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!wsUri) return;

    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUri);

      ws.onopen = () => {
        setConnected(true);
        ws?.send(JSON.stringify({
          type: 'subscribe',
          contract: contractAddress,
          state: stateKey,
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'state_update') {
          setValue(data.value as T);
        }
      };

      ws.onclose = () => setConnected(false);
    } catch (e) {
      console.error('WebSocket connection failed:', e);
    }

    return () => {
      ws?.close();
    };
  }, [wsUri, contractAddress, stateKey]);

  return value;
}
```

### Hybrid Polling + WebSocket

Use WebSocket as primary, with polling as fallback:

```typescript
function useHybridSync<T>(
  httpAccessor: () => Promise<T>,
  wsUri: string | null,
  contractAddress: string,
  stateKey: string,
  pollInterval: number = 30000
) {
  const [value, setValue] = useState<T | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // WebSocket subscription
  useEffect(() => {
    if (!wsUri) return;

    const ws = new WebSocket(wsUri);
    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({
        type: 'subscribe',
        contract: contractAddress,
        state: stateKey,
      }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'state_update') {
        setValue(data.value as T);
      }
    };
    ws.onclose = () => setWsConnected(false);

    return () => ws.close();
  }, [wsUri, contractAddress, stateKey]);

  // Fallback polling when WebSocket not connected
  useEffect(() => {
    if (wsConnected) return;

    let cancelled = false;

    async function poll() {
      const result = await httpAccessor();
      if (!cancelled) setValue(result);
    }

    poll();
    const interval = setInterval(poll, pollInterval);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [httpAccessor, pollInterval, wsConnected]);

  return { value, wsConnected };
}
```

## Optimistic Updates

### Pattern Overview

Update UI immediately when user initiates action, then reconcile with chain:

```typescript
interface OptimisticState<T> {
  confirmed: T;     // Last confirmed on-chain value
  optimistic: T;    // Current displayed value (may be optimistic)
  pending: boolean; // Whether an optimistic update is pending confirmation
}

function useOptimisticState<T>(
  fetchState: () => Promise<T>,
  initialValue: T
) {
  const [state, setState] = useState<OptimisticState<T>>({
    confirmed: initialValue,
    optimistic: initialValue,
    pending: false,
  });

  // Fetch confirmed state
  const refresh = useCallback(async () => {
    const confirmed = await fetchState();
    setState(prev => ({
      ...prev,
      confirmed,
      // If not pending, sync optimistic with confirmed
      optimistic: prev.pending ? prev.optimistic : confirmed,
    }));
  }, [fetchState]);

  // Apply optimistic update
  const applyOptimistic = useCallback((transform: (current: T) => T) => {
    setState(prev => ({
      ...prev,
      optimistic: transform(prev.optimistic),
      pending: true,
    }));
  }, []);

  // Confirm or revert optimistic update
  const confirmOptimistic = useCallback((success: boolean) => {
    setState(prev => ({
      ...prev,
      optimistic: success ? prev.optimistic : prev.confirmed,
      pending: false,
    }));
  }, []);

  return {
    value: state.optimistic,
    confirmed: state.confirmed,
    pending: state.pending,
    refresh,
    applyOptimistic,
    confirmOptimistic,
  };
}
```

### Usage Example

```typescript
function TransferComponent({ contract }: { contract: Contract }) {
  const { value: balance, applyOptimistic, confirmOptimistic, refresh } =
    useOptimisticState(
      () => contract.state.balances.get(myAddress),
      0n
    );

  async function handleTransfer(amount: bigint) {
    // Optimistically update balance
    applyOptimistic(current => (current ?? 0n) - amount);

    try {
      await contract.callTx.transfer(recipient, amount, witnesses);
      // Transaction submitted - wait for confirmation
      confirmOptimistic(true);
      // Refresh to get actual on-chain state
      await refresh();
    } catch (error) {
      // Transaction failed - revert optimistic update
      confirmOptimistic(false);
      throw error;
    }
  }

  return (
    <div>
      <p>Balance: {balance?.toString() ?? 'Loading...'}</p>
      <button onClick={() => handleTransfer(100n)}>Transfer 100</button>
    </div>
  );
}
```

## Handling Reorgs and Finality

### Understanding Finality

Midnight transactions go through finality stages:

| Stage | Description | Action |
|-------|-------------|--------|
| Submitted | Transaction sent to network | Show "pending" |
| Included | In a block, not finalized | Show "confirming" |
| Finalized | Irreversible | Show "confirmed" |

### Tracking Finality

```typescript
interface TransactionStatus {
  hash: string;
  stage: 'submitted' | 'included' | 'finalized' | 'failed';
  blockNumber?: number;
  confirmations: number;
}

async function waitForFinality(
  txHash: string,
  publicDataProvider: PublicDataProvider,
  onStatusChange: (status: TransactionStatus) => void
): Promise<void> {
  let status: TransactionStatus = {
    hash: txHash,
    stage: 'submitted',
    confirmations: 0,
  };

  onStatusChange(status);

  // Poll for transaction inclusion
  const pollInterval = setInterval(async () => {
    try {
      const tx = await publicDataProvider.getTransaction(txHash);

      if (tx.blockNumber) {
        const currentBlock = await publicDataProvider.getBlockNumber();
        const confirmations = currentBlock - tx.blockNumber;

        status = {
          ...status,
          stage: confirmations >= 10 ? 'finalized' : 'included',
          blockNumber: tx.blockNumber,
          confirmations,
        };

        onStatusChange(status);

        if (status.stage === 'finalized') {
          clearInterval(pollInterval);
        }
      }
    } catch (e) {
      // Transaction may not be found yet
    }
  }, 2000);
}
```

### Handling Reorgs

When a reorg occurs, state may revert:

```typescript
function useReorgAwareState<T>(
  fetchState: () => Promise<T>,
  pollInterval: number = 5000
) {
  const [value, setValue] = useState<T | null>(null);
  const [lastBlockNumber, setLastBlockNumber] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const currentBlock = await publicDataProvider.getBlockNumber();

        // Detect reorg - block number decreased
        if (lastBlockNumber !== null && currentBlock < lastBlockNumber) {
          console.warn('Reorg detected! Refreshing state...');
          // Clear any optimistic updates
          // Force full state refresh
        }

        const result = await fetchState();
        if (!cancelled) {
          setValue(result);
          setLastBlockNumber(currentBlock);
        }
      } catch (e) {
        console.error('State fetch error:', e);
      }
    }

    poll();
    const interval = setInterval(poll, pollInterval);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchState, pollInterval, lastBlockNumber]);

  return value;
}
```

## Best Practices

### 1. Choose the Right Strategy

| Scenario | Strategy |
|----------|----------|
| Dashboard display | Polling (5-30s interval) |
| Active transaction | Aggressive polling (1-2s) |
| Real-time trading | WebSocket subscription |
| Background sync | Adaptive polling |

### 2. Handle Loading States

```typescript
function StateDisplay({ loading, value, error }) {
  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (value === null) return <EmptyState />;
  return <Value>{value.toString()}</Value>;
}
```

### 3. Debounce Updates

```typescript
function useDebouncedState<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

### 4. Clean Up Subscriptions

Always clean up WebSocket connections and intervals when components unmount to prevent memory leaks and stale updates.
