# Witness Bridge: TypeScript Implementation

Witnesses bridge private data from TypeScript into Compact circuits. This reference covers implementation patterns, context access, and best practices.

## Witness Basics

A witness is a function that provides private data to a circuit. The data never appears on-chain - only the proof that you know it.

```compact
// Compact declaration
witness get_secret(): Field;
witness get_credentials(): (Bytes<32>, Uint<64>);
```

```typescript
// TypeScript implementation
const witnesses = {
  get_secret: (): bigint => {
    return privateState.secret;
  },

  get_credentials: (): [Uint8Array, bigint] => {
    return [privateState.publicKey, privateState.nonce];
  }
};
```

## Witness Context

Witnesses receive a context object providing access to private state and transaction data.

```typescript
import { WitnessContext } from '@midnight-ntwrk/midnight-js-types';

interface PrivateState {
  secret: bigint;
  keys: Map<string, Uint8Array>;
  balance: bigint;
}

const witnesses = {
  get_secret: ({ privateState }: WitnessContext<PrivateState>): bigint => {
    return privateState.secret;
  },

  get_key: ({ privateState }: WitnessContext<PrivateState>, keyId: string): Uint8Array => {
    const key = privateState.keys.get(keyId);
    if (!key) throw new Error(`Key not found: ${keyId}`);
    return key;
  }
};
```

### Context Properties

| Property | Type | Description |
|----------|------|-------------|
| `privateState` | `T` | Your application's private state |
| `contractAddress` | `string` | Deployed contract address |
| `originalState` | `LedgerState` | Ledger state before transaction |
| `transactionContext` | `TxContext` | Transaction metadata |

## Witness Parameters

Witnesses can receive parameters from the circuit.

```compact
// Compact
witness get_balance(token_id: Bytes<32>): Uint<64>;
witness verify_ownership(asset_id: Field, expected_owner: Bytes<32>): Boolean;
```

```typescript
// TypeScript
const witnesses = {
  get_balance: (
    { privateState }: WitnessContext<PrivateState>,
    tokenId: Uint8Array
  ): bigint => {
    const key = bytesToHex(tokenId);
    return privateState.balances.get(key) ?? 0n;
  },

  verify_ownership: (
    { privateState }: WitnessContext<PrivateState>,
    assetId: bigint,
    expectedOwner: Uint8Array
  ): boolean => {
    const asset = privateState.assets.get(assetId);
    if (!asset) return false;
    return arraysEqual(asset.owner, expectedOwner);
  }
};
```

## Async Witnesses

Witnesses can be async for external data fetching.

```typescript
const witnesses = {
  get_external_price: async (
    { privateState }: WitnessContext<PrivateState>,
    tokenId: Uint8Array
  ): Promise<bigint> => {
    const response = await fetch(`/api/price/${bytesToHex(tokenId)}`);
    const { price } = await response.json();
    return BigInt(price);
  },

  get_merkle_proof: async (
    { privateState }: WitnessContext<PrivateState>,
    leafHash: Uint8Array
  ): Promise<Uint8Array[]> => {
    const proof = await privateState.merkleTree.getProof(leafHash);
    return proof.siblings;
  }
};
```

## State Management

### Initializing Private State

```typescript
import { createPrivateStateProvider } from '@midnight-ntwrk/midnight-js-contracts';

interface PrivateState {
  secretKey: Uint8Array;
  nonce: bigint;
  credentials: Map<string, Credential>;
}

const initialState: PrivateState = {
  secretKey: generateSecretKey(),
  nonce: 0n,
  credentials: new Map()
};

const privateStateProvider = createPrivateStateProvider({
  key: 'my-dapp-state',
  initialState,
  // Optional: persist to localStorage
  storage: localStorage
});
```

### Updating State in Witnesses

Witnesses can update private state through mutations.

```typescript
const witnesses = {
  get_and_increment_nonce: ({
    privateState,
    setPrivateState
  }: WitnessContext<PrivateState>): bigint => {
    const currentNonce = privateState.nonce;

    setPrivateState({
      ...privateState,
      nonce: currentNonce + 1n
    });

    return currentNonce;
  }
};
```

## Error Handling

```typescript
class WitnessError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'WitnessError';
  }
}

const witnesses = {
  get_credential: (
    { privateState }: WitnessContext<PrivateState>,
    credentialId: Uint8Array
  ): Credential => {
    const id = bytesToHex(credentialId);
    const credential = privateState.credentials.get(id);

    if (!credential) {
      throw new WitnessError(
        `Credential not found: ${id}`,
        'CREDENTIAL_NOT_FOUND'
      );
    }

    if (credential.expiry < Date.now()) {
      throw new WitnessError(
        `Credential expired: ${id}`,
        'CREDENTIAL_EXPIRED'
      );
    }

    return credential;
  }
};
```

## Common Patterns

### Signature Generation

```typescript
import { sign } from '@noble/ed25519';

const witnesses = {
  sign_message: async (
    { privateState }: WitnessContext<PrivateState>,
    message: Uint8Array
  ): Promise<Uint8Array> => {
    const signature = await sign(message, privateState.secretKey);
    return signature; // Returns 64 bytes
  }
};
```

### Merkle Proof Generation

```typescript
const witnesses = {
  get_membership_proof: (
    { privateState }: WitnessContext<PrivateState>,
    leafValue: Uint8Array
  ): { path: Uint8Array[], indices: bigint[] } => {
    const tree = privateState.merkleTree;
    const proof = tree.getProof(leafValue);

    return {
      path: proof.siblings,
      indices: proof.pathIndices.map(BigInt)
    };
  }
};
```

### External API Integration

```typescript
const witnesses = {
  get_oracle_data: async (
    { privateState }: WitnessContext<PrivateState>,
    oracleId: Uint8Array
  ): Promise<{ value: bigint; timestamp: bigint; signature: Uint8Array }> => {
    const response = await fetch(
      `${ORACLE_API}/data/${bytesToHex(oracleId)}`,
      {
        headers: { 'Authorization': `Bearer ${privateState.apiKey}` }
      }
    );

    if (!response.ok) {
      throw new WitnessError('Oracle unavailable', 'ORACLE_ERROR');
    }

    const data = await response.json();
    return {
      value: BigInt(data.value),
      timestamp: BigInt(data.timestamp),
      signature: hexToBytes(data.signature)
    };
  }
};
```

### Cached Computation

```typescript
const computationCache = new Map<string, bigint>();

const witnesses = {
  compute_expensive_value: (
    { privateState }: WitnessContext<PrivateState>,
    input: Uint8Array
  ): bigint => {
    const cacheKey = bytesToHex(input);

    if (computationCache.has(cacheKey)) {
      return computationCache.get(cacheKey)!;
    }

    // Expensive computation
    const result = expensiveComputation(input, privateState.params);

    computationCache.set(cacheKey, result);
    return result;
  }
};
```

## Testing Witnesses

```typescript
import { createMockWitnessContext } from '@midnight-ntwrk/midnight-js-testing';

describe('witnesses', () => {
  const mockPrivateState: PrivateState = {
    secret: 42n,
    keys: new Map([['default', new Uint8Array(32)]])
  };

  it('should return secret', () => {
    const context = createMockWitnessContext(mockPrivateState);
    const result = witnesses.get_secret(context);
    expect(result).toBe(42n);
  });

  it('should throw for missing key', () => {
    const context = createMockWitnessContext(mockPrivateState);
    expect(() => witnesses.get_key(context, 'nonexistent'))
      .toThrow('Key not found');
  });
});
```

## Best Practices

1. **Keep witnesses pure when possible** - Avoid side effects that could cause issues during proof generation retries.

2. **Validate inputs** - Check parameter validity before expensive operations.

3. **Handle errors gracefully** - Throw descriptive errors that help debugging.

4. **Cache expensive computations** - Witnesses may be called multiple times during proof generation.

5. **Use typed private state** - Define interfaces for your private state structure.

6. **Test witnesses independently** - Mock the witness context for unit testing.

7. **Avoid blocking operations** - Use async witnesses for I/O operations.
