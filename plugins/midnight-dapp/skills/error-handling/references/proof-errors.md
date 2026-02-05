# Proof Errors

Complete guide to handling ZK proof generation failures in Midnight DApps.

## Overview

Proof errors occur during client-side ZK proof generation. Since proofs are generated locally, these errors indicate issues with:

- Circuit constraints not being satisfied
- Invalid witness data
- Proof server connectivity or performance
- Resource exhaustion (memory, time)

## The ProofError Class

```typescript
class ProofError extends Error {
  constructor(
    message: string,
    public readonly code: ProofErrorCode,
    public readonly cause?: Error,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProofError';
  }
}

type ProofErrorCode =
  | 'CONSTRAINT_VIOLATION'
  | 'WITNESS_FAILED'
  | 'PROOF_TIMEOUT'
  | 'SERVER_UNAVAILABLE'
  | 'GENERATION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'RESOURCE_EXHAUSTED';
```

## Common Proof Error Types

### Constraint Violations

Circuit constraints are assertions that must hold for a valid proof. When violated, the proof cannot be generated.

**Causes:**
- Input values out of range (e.g., `amount > max_allowed`)
- Arithmetic overflow in circuit
- Hash mismatches in Merkle proofs
- Invalid signatures or authentication

**Example Error:**
```
Circuit constraint failed: balance >= transfer_amount
Expected: true, Got: false
```

**Diagnosis:**
```typescript
function diagnoseConstraintViolation(error: ProofError): string {
  const message = error.message.toLowerCase();

  if (message.includes('balance')) {
    return 'The account balance is insufficient for this operation';
  }

  if (message.includes('merkle') || message.includes('proof')) {
    return 'The credential or membership proof is invalid';
  }

  if (message.includes('signature')) {
    return 'The signature verification failed';
  }

  if (message.includes('overflow')) {
    return 'A numeric value exceeded its maximum';
  }

  return 'The transaction inputs do not satisfy the contract requirements';
}
```

**Recovery:**
- Check input values against contract constraints
- Verify credentials are valid and not expired
- Ensure sufficient balance before attempting transfer
- Validate all inputs client-side before proof generation

### Invalid Witness Data

Witness errors occur when witness functions fail to provide the required data.

**Causes:**
- Missing private state (credential not found)
- Expired or revoked credentials
- Type mismatches between witness output and circuit expectation
- Async witness timeout

**Example Error:**
```
WitnessError: Credential not found for ID: 0x1234...
```

**Diagnosis:**
```typescript
function diagnoseWitnessError(error: ProofError): DiagnosisResult {
  const cause = error.cause;

  if (cause?.message.includes('not found')) {
    return {
      issue: 'MISSING_DATA',
      userMessage: 'Required data is missing from your wallet',
      suggestion: 'You may need to import or create the required credential',
    };
  }

  if (cause?.message.includes('expired')) {
    return {
      issue: 'EXPIRED_CREDENTIAL',
      userMessage: 'Your credential has expired',
      suggestion: 'Please renew your credential and try again',
    };
  }

  if (cause?.message.includes('type') || cause?.message.includes('mismatch')) {
    return {
      issue: 'TYPE_MISMATCH',
      userMessage: 'Internal error: data format mismatch',
      suggestion: 'Please refresh the page and try again',
    };
  }

  return {
    issue: 'UNKNOWN_WITNESS_ERROR',
    userMessage: 'Failed to prepare transaction data',
    suggestion: 'Please check your wallet connection and try again',
  };
}
```

**Recovery:**
- Ensure private state is properly initialized
- Check credential validity before proof generation
- Verify witness function return types match circuit expectations

### Timeout Errors

Proof generation is computationally intensive and can timeout.

**Causes:**
- Complex circuits requiring long computation
- Proof server under heavy load
- Slow client hardware
- Network latency to local proof server

**Typical Timeouts:**
| Operation | Expected | Timeout |
|-----------|----------|---------|
| Simple transfer | 2-5s | 30s |
| Credential verification | 5-10s | 60s |
| Complex computation | 10-30s | 120s |

**Example Error:**
```
ProofError: Proof generation timed out after 60000ms
```

**Recovery:**
```typescript
async function handleProofTimeout(
  operation: () => Promise<unknown>,
  config: { maxRetries: number; timeoutMultiplier: number }
): Promise<unknown> {
  let timeout = 60_000; // Start with 60 seconds

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await Promise.race([
        operation(),
        createTimeout(timeout, 'Proof generation timed out'),
      ]);
    } catch (error) {
      if (!isTimeoutError(error) || attempt === config.maxRetries) {
        throw error;
      }

      // Increase timeout for next attempt
      timeout *= config.timeoutMultiplier;
      console.warn(`Proof attempt ${attempt} timed out, retrying with ${timeout}ms timeout`);
    }
  }
}
```

### Proof Server Unavailable

The local proof server must be running for proof generation.

**Causes:**
- Docker container not started
- Wrong port configuration
- Container crashed
- Resource exhaustion on proof server

**Example Error:**
```
fetch failed: connect ECONNREFUSED 127.0.0.1:6300
```

**Diagnosis:**
```typescript
async function checkProofServerHealth(): Promise<{
  available: boolean;
  error?: string;
  suggestion?: string;
}> {
  try {
    const response = await fetch('http://localhost:6300/health', {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        available: false,
        error: `Server returned status ${response.status}`,
        suggestion: 'Restart the proof server container',
      };
    }

    return { available: true };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        available: false,
        error: 'Proof server is not running',
        suggestion: 'Start with: docker run -p 6300:6300 midnightnetwork/proof-server',
      };
    }

    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Check Docker is running and the container is healthy',
    };
  }
}
```

**Recovery:**
1. Check Docker is running: `docker ps`
2. Start proof server: `docker run -d -p 6300:6300 midnightnetwork/proof-server`
3. Check logs: `docker logs midnight-proof-server`
4. Restart if unhealthy: `docker restart midnight-proof-server`

## Debugging Proof Errors

### Logging for Diagnosis

```typescript
function logProofError(error: ProofError, context: Record<string, unknown>): void {
  console.group('Proof Error');
  console.error('Code:', error.code);
  console.error('Message:', error.message);
  console.error('Context:', context);

  if (error.cause) {
    console.error('Cause:', error.cause);
  }

  if (error.metadata) {
    console.error('Metadata:', error.metadata);
  }

  console.groupEnd();

  // Send to error tracking (e.g., Sentry)
  // Note: Never include private state in error reports
  trackError({
    type: 'proof_error',
    code: error.code,
    message: error.message,
    // Sanitize context to remove sensitive data
    context: sanitizeContext(context),
  });
}
```

### Validating Inputs Before Proof Generation

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

async function validateTransferInputs(
  contract: Contract,
  sender: Uint8Array,
  recipient: Uint8Array,
  amount: bigint
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Check balance
  const balance = await contract.state.balances.get(sender);
  if (balance === undefined || balance < amount) {
    errors.push(`Insufficient balance: have ${balance ?? 0n}, need ${amount}`);
  }

  // Check amount bounds
  const maxTransfer = await contract.state.max_transfer();
  if (amount > maxTransfer) {
    errors.push(`Amount exceeds maximum: ${amount} > ${maxTransfer}`);
  }

  // Check recipient is valid
  if (recipient.length !== 32) {
    errors.push('Invalid recipient address');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Testing Proof Failures

```typescript
describe('Proof Error Handling', () => {
  it('should handle constraint violation gracefully', async () => {
    // Attempt transfer with insufficient balance
    const result = await attemptTransfer({
      amount: 1000n,
      balance: 100n, // Insufficient
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONSTRAINT_VIOLATION');
    expect(result.error?.userMessage).toContain('insufficient');
  });

  it('should retry on timeout', async () => {
    const mockOperation = vi.fn()
      .mockRejectedValueOnce(new ProofError('timeout', 'PROOF_TIMEOUT'))
      .mockResolvedValueOnce({ success: true });

    const result = await withRetry(mockOperation, { maxRetries: 2 });

    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });
});
```

## User-Facing Error Messages

Map technical proof errors to user-friendly messages:

```typescript
const PROOF_ERROR_MESSAGES: Record<ProofErrorCode, {
  title: string;
  description: string;
  suggestion: string;
}> = {
  CONSTRAINT_VIOLATION: {
    title: 'Transaction Invalid',
    description: 'The transaction cannot be completed with the current inputs.',
    suggestion: 'Please check your inputs and try again.',
  },
  WITNESS_FAILED: {
    title: 'Missing Data',
    description: 'Required data could not be found in your wallet.',
    suggestion: 'Ensure your wallet is connected and has the required credentials.',
  },
  PROOF_TIMEOUT: {
    title: 'Processing Timeout',
    description: 'The transaction took too long to process.',
    suggestion: 'Please try again. If the problem persists, try a simpler transaction.',
  },
  SERVER_UNAVAILABLE: {
    title: 'Proof Server Offline',
    description: 'The local proof server is not responding.',
    suggestion: 'Start the proof server with Docker and try again.',
  },
  GENERATION_FAILED: {
    title: 'Proof Generation Failed',
    description: 'An error occurred while generating the proof.',
    suggestion: 'Please try again. If the problem persists, contact support.',
  },
  VERIFICATION_FAILED: {
    title: 'Proof Verification Failed',
    description: 'The generated proof could not be verified.',
    suggestion: 'This may indicate a bug. Please contact support.',
  },
  RESOURCE_EXHAUSTED: {
    title: 'System Resources Low',
    description: 'Your device may not have enough memory or CPU.',
    suggestion: 'Close other applications and try again.',
  },
};
```

## Best Practices

1. **Validate before proving** - Check inputs client-side before expensive proof generation
2. **Show progress UI** - Proof generation takes seconds; show loading states
3. **Implement retries** - Timeouts can be transient; retry with backoff
4. **Log comprehensively** - Capture full context for debugging (without secrets)
5. **User-friendly messages** - Translate technical errors to actionable guidance
6. **Check proof server** - Verify availability before starting operations
7. **Handle all codes** - Every error code should have a user message
