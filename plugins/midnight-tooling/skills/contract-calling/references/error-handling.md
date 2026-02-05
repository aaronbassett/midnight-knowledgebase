# Error Handling

Comprehensive guide to handling errors when calling Midnight contracts, including error types, retry strategies, timeout handling, and proof generation errors.

## Error Categories

### Connection Errors

Errors that occur when establishing connections to the network:

```typescript
class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

// Handle connection errors
try {
  const contract = await connectContract({ /* ... */ });
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('Cannot connect to endpoint:', error.endpoint);
    // Suggest checking network configuration
  } else if (error.code === 'ETIMEDOUT') {
    console.error('Connection timed out');
    // Suggest increasing timeout or checking network
  }
}
```

### Contract Call Errors

Errors during contract method invocation:

| Error Type | Description | Recovery |
|------------|-------------|----------|
| `ContractNotFound` | Invalid contract address | Verify deployment address |
| `CircuitNotFound` | Invalid method name | Check contract artifact |
| `InvalidArguments` | Wrong parameter types | Review circuit signature |
| `InsufficientFunds` | Low wallet balance | Fund the wallet |
| `CircuitAssertionFailed` | Runtime assertion | Review circuit logic |

```typescript
import {
  ContractNotFoundError,
  CircuitExecutionError,
  InsufficientFundsError,
} from '@midnight-ntwrk/midnight-js-contracts';

try {
  const result = await contract.call.transfer({
    to: recipient,
    amount: 100n,
  });
} catch (error) {
  if (error instanceof ContractNotFoundError) {
    console.error('Contract not found at address:', error.address);
  } else if (error instanceof CircuitExecutionError) {
    console.error('Circuit failed:', error.circuitName, error.message);
  } else if (error instanceof InsufficientFundsError) {
    console.error('Need', error.required, 'have', error.available);
  }
}
```

### Proof Generation Errors

Errors during ZK proof creation:

```typescript
import { ProofGenerationError } from '@midnight-ntwrk/midnight-js-prover';

try {
  const result = await contract.call.private_action({ /* ... */ });
} catch (error) {
  if (error instanceof ProofGenerationError) {
    console.error('Proof generation failed:', error.message);
    console.error('Circuit:', error.circuitName);

    if (error.cause?.includes('witness')) {
      console.error('Invalid witness data provided');
    } else if (error.cause?.includes('timeout')) {
      console.error('Proof generation timed out');
    }
  }
}
```

### Transaction Errors

Errors when submitting transactions:

```typescript
import {
  TransactionRejectedError,
  TransactionTimeoutError,
} from '@midnight-ntwrk/midnight-js-contracts';

try {
  const pending = await contract.call.update_state({ /* ... */ });
  const confirmed = await pending.waitForConfirmation({ timeout: 60000 });

  if (confirmed.status !== 'confirmed') {
    throw new Error(`Transaction failed: ${confirmed.status}`);
  }
} catch (error) {
  if (error instanceof TransactionRejectedError) {
    console.error('Transaction rejected:', error.reason);
  } else if (error instanceof TransactionTimeoutError) {
    console.error('Transaction timeout. Hash:', error.txHash);
    // Transaction may still confirm - don't retry immediately
  }
}
```

## Retry Strategies

### Exponential Backoff

```typescript
interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
  retryableErrors: string[];
}

const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
  retryableErrors: [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'rate limit',
  ],
};

async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      const isRetryable = opts.retryableErrors.some(
        (e) => lastError!.message.includes(e) || lastError!.code === e
      );

      if (!isRetryable || attempt === opts.maxRetries) {
        throw lastError;
      }

      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * opts.factor, opts.maxDelay);
    }
  }

  throw lastError;
}

// Usage
const result = await withRetry(
  () => contract.call.transfer({ to, amount }),
  { maxRetries: 5 }
);
```

### Circuit Breaker Pattern

Prevent cascading failures with a circuit breaker:

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failures = 0;
  private lastFailure = 0;

  constructor(
    private threshold: number = 5,
    private resetTimeout: number = 30000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is open');
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

  private onSuccess(): void {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.threshold) {
      this.state = CircuitState.OPEN;
    }
  }
}

// Usage
const breaker = new CircuitBreaker(5, 30000);

try {
  const result = await breaker.execute(() =>
    contract.call.transfer({ to, amount })
  );
} catch (error) {
  if (error.message === 'Circuit breaker is open') {
    // Service is unhealthy, use fallback or queue for later
  }
}
```

## Timeout Handling

### Configurable Timeouts

```typescript
interface TimeoutConfig {
  connection: number;
  query: number;
  transaction: number;
  proofGeneration: number;
}

const defaultTimeouts: TimeoutConfig = {
  connection: 10000,      // 10s for establishing connection
  query: 15000,           // 15s for read-only queries
  transaction: 120000,    // 2min for state-changing transactions
  proofGeneration: 180000, // 3min for complex proofs
};

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]);
}

// Usage
const balance = await withTimeout(
  contract.query.get_balance({ address }),
  defaultTimeouts.query,
  'Balance query timed out'
);
```

### Handling Pending Transactions

```typescript
async function waitForTransactionWithTimeout(
  pending: PendingTransaction,
  timeout: number
): Promise<TransactionResult> {
  const result = await pending.waitForConfirmation({ timeout });

  switch (result.status) {
    case 'confirmed':
      return result;

    case 'timeout':
      // Transaction may still confirm - save txHash for later checking
      console.warn(`Transaction ${pending.txHash} timed out`);
      console.warn('Check status later with indexer');
      return result;

    case 'rejected':
      throw new Error(`Transaction rejected: ${result.reason}`);

    default:
      throw new Error(`Unknown transaction status: ${result.status}`);
  }
}
```

## Error Recovery Patterns

### Graceful Degradation

```typescript
async function getBalanceWithFallback(
  contract: ConnectedContract,
  address: string
): Promise<bigint | null> {
  try {
    return await contract.query.get_balance({ address });
  } catch (error) {
    console.error('Failed to get balance:', error.message);

    // Try cached value
    const cached = await cache.get(`balance:${address}`);
    if (cached !== null) {
      console.log('Using cached balance');
      return cached;
    }

    // Return null to indicate unavailable
    return null;
  }
}
```

### Transaction Idempotency

```typescript
interface IdempotentTransaction {
  id: string;
  params: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
}

class IdempotentExecutor {
  private transactions = new Map<string, IdempotentTransaction>();

  async execute(
    id: string,
    callFn: () => Promise<PendingTransaction>
  ): Promise<TransactionResult> {
    // Check if already processed
    const existing = this.transactions.get(id);
    if (existing?.status === 'confirmed') {
      return { status: 'confirmed', txHash: existing.txHash! };
    }

    // Mark as pending
    this.transactions.set(id, { id, params: {}, status: 'pending' });

    try {
      const pending = await callFn();
      const result = await pending.waitForConfirmation();

      if (result.status === 'confirmed') {
        this.transactions.set(id, {
          id,
          params: {},
          status: 'confirmed',
          txHash: result.txHash,
        });
      }

      return result;
    } catch (error) {
      this.transactions.set(id, { id, params: {}, status: 'failed' });
      throw error;
    }
  }
}
```

## Logging and Monitoring

```typescript
import { Logger } from './logger';

const logger = new Logger('contract-calls');

async function instrumentedCall<T>(
  name: string,
  callFn: () => Promise<T>
): Promise<T> {
  const start = Date.now();

  try {
    const result = await callFn();
    const duration = Date.now() - start;

    logger.info('Contract call succeeded', {
      method: name,
      duration,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    logger.error('Contract call failed', {
      method: name,
      duration,
      error: error.message,
      code: error.code,
    });

    throw error;
  }
}
```

## Related Resources

- [api-client-setup.md](api-client-setup.md) - Client initialization
- `midnight-debugging` skill - Environment troubleshooting
