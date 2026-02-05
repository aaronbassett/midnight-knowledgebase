# Witness Fundamentals

Witnesses are TypeScript functions that provide private inputs to Compact circuits. They bridge your application's private state into zero-knowledge proofs.

## What Are Witnesses?

In zero-knowledge proofs, a "witness" is private data that proves a statement without revealing the data itself. In Midnight:

- **Compact declares** what private data the circuit needs
- **TypeScript implements** functions that provide that data
- **The prover uses** witnesses during proof generation
- **The data never leaves** the user's device

```compact
// Compact: Declares what private data is needed
witness get_secret(): Field;
witness verify_ownership(asset_id: Field): Boolean;
```

```typescript
// TypeScript: Provides the actual data
const witnesses = {
  get_secret: ({ privateState }): bigint => privateState.secret,
  verify_ownership: ({ privateState }, assetId): boolean => {
    return privateState.ownedAssets.has(assetId);
  }
};
```

## WitnessContext Interface

Every witness function receives a context object with access to application state.

```typescript
import type { WitnessContext } from "@midnight-ntwrk/midnight-js-types";

interface WitnessContext<T> {
  /** Your application's private state */
  privateState: T;

  /** Update private state (for nonces, counters, etc.) */
  setPrivateState: (newState: T) => void;

  /** Contract's on-chain ledger state */
  ledgerState: LedgerState;

  /** Address of the deployed contract */
  contractAddress: string;

  /** Transaction metadata */
  transactionContext: TransactionContext;
}
```

### privateState

Your application-defined state containing sensitive data:

```typescript
interface PrivateState {
  secretKey: Uint8Array;        // User's private key
  credentials: Map<string, Credential>;  // Stored credentials
  balance: bigint;               // Private balance
  nonce: bigint;                 // Transaction counter
}

const witnesses = {
  get_secret_key: ({ privateState }: WitnessContext<PrivateState>): Uint8Array => {
    return privateState.secretKey;
  }
};
```

### setPrivateState

Allows witnesses to update state, commonly used for nonces:

```typescript
const witnesses = {
  get_and_increment_nonce: ({
    privateState,
    setPrivateState
  }: WitnessContext<PrivateState>): bigint => {
    const currentNonce = privateState.nonce;

    // Update for next use
    setPrivateState({
      ...privateState,
      nonce: currentNonce + 1n
    });

    return currentNonce;
  }
};
```

### ledgerState

Read-only access to the contract's public on-chain state:

```typescript
const witnesses = {
  check_allowance: ({
    privateState,
    ledgerState
  }: WitnessContext<PrivateState>): bigint => {
    // Read public allowance from ledger
    const allowance = ledgerState.allowances.get(privateState.address);
    return allowance ?? 0n;
  }
};
```

## Witness Patterns

### Simple Witness

Returns a value directly from private state:

```compact
witness get_balance(): Uint<64>;
```

```typescript
const witnesses = {
  get_balance: ({ privateState }: WitnessContext<PrivateState>): bigint => {
    return privateState.balance;
  }
};
```

### Parametric Witness

Receives parameters from the circuit:

```compact
witness get_credential(id: Bytes<32>): Credential;
```

```typescript
const witnesses = {
  get_credential: (
    { privateState }: WitnessContext<PrivateState>,
    credentialId: Uint8Array
  ): Credential => {
    const id = bytesToHex(credentialId);
    const credential = privateState.credentials.get(id);

    if (!credential) {
      throw new WitnessError("Credential not found", "NOT_FOUND");
    }

    return credential;
  }
};
```

### Async Witness

Fetches data from external sources:

```compact
witness get_oracle_price(token: Bytes<32>): Uint<64>;
```

```typescript
const witnesses = {
  get_oracle_price: async (
    { privateState }: WitnessContext<PrivateState>,
    tokenId: Uint8Array
  ): Promise<bigint> => {
    const response = await fetch(
      `${ORACLE_API}/price/${bytesToHex(tokenId)}`,
      {
        headers: { Authorization: `Bearer ${privateState.apiKey}` }
      }
    );

    if (!response.ok) {
      throw new WitnessError("Oracle unavailable", "ORACLE_ERROR");
    }

    const { price } = await response.json();
    return BigInt(price);
  }
};
```

### Stateful Witness

Updates private state as a side effect:

```compact
witness get_nonce(): Uint<64>;
```

```typescript
const witnesses = {
  get_nonce: ({
    privateState,
    setPrivateState
  }: WitnessContext<PrivateState>): bigint => {
    const nonce = privateState.nonce;

    setPrivateState({
      ...privateState,
      nonce: nonce + 1n
    });

    return nonce;
  }
};
```

## Type Mapping: Compact to TypeScript

| Compact Type | TypeScript Type | Notes |
|--------------|-----------------|-------|
| `Field` | `bigint` | Finite field element |
| `Boolean` | `boolean` | True/false |
| `Uint<N>` | `bigint` | Unsigned integer (N bits) |
| `Int<N>` | `bigint` | Signed integer (N bits) |
| `Bytes<N>` | `Uint8Array` | Fixed-size byte array |
| `Vector<T, N>` | `T[]` | Fixed-length array |
| `Set<T>` | `Set<T>` | Unordered collection |
| `Map<K, V>` | `Map<K, V>` | Key-value mapping |
| `Option<T>` | `T \| null` | Optional value |
| `struct { ... }` | `interface { ... }` | Object with fields |
| `enum { ... }` | Discriminated union | Tagged union |

### Struct Mapping Example

```compact
struct Credential {
    owner: Bytes<32>,
    level: Uint<8>,
    expiry: Uint<64>
}
```

```typescript
interface Credential {
  owner: Uint8Array;  // 32 bytes
  level: bigint;       // Fits in 8 bits
  expiry: bigint;      // Fits in 64 bits
}
```

### Enum Mapping Example

```compact
enum Status {
    Active,
    Suspended(reason: Bytes<32>),
    Expired(timestamp: Uint<64>)
}
```

```typescript
type Status =
  | { tag: "Active" }
  | { tag: "Suspended"; reason: Uint8Array }
  | { tag: "Expired"; timestamp: bigint };
```

## Error Handling

Create descriptive errors with codes for debugging:

```typescript
class WitnessError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "WitnessError";
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
        `Credential not found: ${id.slice(0, 16)}...`,
        "CREDENTIAL_NOT_FOUND"
      );
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (credential.expiry < now) {
      throw new WitnessError(
        `Credential expired at ${credential.expiry}`,
        "CREDENTIAL_EXPIRED"
      );
    }

    return credential;
  }
};
```

## Best Practices

### 1. Keep Witnesses Pure When Possible

Avoid side effects that could cause issues during proof retries:

```typescript
// Good: Pure witness
get_balance: ({ privateState }) => privateState.balance;

// Careful: Side effect (only use for nonces/counters)
get_nonce: ({ privateState, setPrivateState }) => {
  const nonce = privateState.nonce;
  setPrivateState({ ...privateState, nonce: nonce + 1n });
  return nonce;
};
```

### 2. Validate Inputs Early

Check parameters before expensive operations:

```typescript
get_credential: ({ privateState }, credentialId) => {
  // Validate input
  if (credentialId.length !== 32) {
    throw new WitnessError("Invalid credential ID length", "INVALID_INPUT");
  }

  // Then proceed with lookup
  const credential = privateState.credentials.get(bytesToHex(credentialId));
  // ...
};
```

### 3. Cache Expensive Computations

Witnesses may be called multiple times during proof generation:

```typescript
const proofCache = new Map<string, MerkleProof>();

const witnesses = {
  get_merkle_proof: ({ privateState }, leafHash) => {
    const cacheKey = bytesToHex(leafHash);

    if (proofCache.has(cacheKey)) {
      return proofCache.get(cacheKey)!;
    }

    const proof = privateState.merkleTree.getProof(leafHash);
    proofCache.set(cacheKey, proof);
    return proof;
  }
};
```

### 4. Use Typed Private State

Always define interfaces for your private state:

```typescript
// Good: Typed state
interface PrivateState {
  secretKey: Uint8Array;
  credentials: Map<string, Credential>;
  nonce: bigint;
}

const witnesses = {
  get_secret: ({ privateState }: WitnessContext<PrivateState>) => {
    return privateState.secretKey; // Type-safe access
  }
};
```

### 5. Never Persist Sensitive Data

Keep witness data in memory only:

```typescript
// Bad: Persisting secrets
localStorage.setItem("privateState", JSON.stringify(privateState));

// Good: Keep in memory, derive from user action
const privateState = await derivePrivateState(walletSignature);
```

### 6. Use snake_case for Witness Names

Match the Compact convention:

```typescript
// Match Compact naming
const witnesses = {
  get_secret_key: ({ privateState }) => privateState.secretKey,
  verify_credential: ({ privateState }, id) => { /* ... */ },
  sign_message: async ({ privateState }, message) => { /* ... */ }
};
```
