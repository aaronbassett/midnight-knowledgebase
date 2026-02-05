# Contract State

Complete guide to reading public and private contract state in Midnight DApps.

## Overview

Midnight contracts have a dual-state model:

- **Public Ledger State**: Stored on-chain, readable by anyone via indexer
- **Private Local State**: Stored in browser LevelDB, accessible only to the local user

This is fundamentally different from Ethereum where all contract state is public.

## Public Ledger State

Public state is stored on-chain and accessed via `contract.state.*` accessors.

### Simple Values

Read single values defined in your Compact contract:

```typescript
// Compact contract
ledger {
  total_supply: Uint<64>;
  admin: Bytes<32>;
  initialized: Boolean;
}

// TypeScript access
const totalSupply: bigint = await contract.state.total_supply();
const admin: Uint8Array = await contract.state.admin();
const initialized: boolean = await contract.state.initialized();
```

### Map Lookups

Read from Map structures:

```typescript
// Compact contract
ledger {
  balances: Map<Bytes<32>, Uint<64>>;
  names: Map<Bytes<32>, Opaque<'string'>>;
}

// TypeScript access - returns undefined if key not found
const balance: bigint | undefined = await contract.state.balances.get(userAddress);
const name: string | undefined = await contract.state.names.get(userAddress);

// Check if key exists
if (balance !== undefined) {
  console.log(`Balance: ${balance}`);
}
```

### Set Membership

Check membership in Set structures:

```typescript
// Compact contract
ledger {
  members: Set<Bytes<32>>;
  blacklist: Set<Bytes<32>>;
}

// TypeScript access - returns boolean
const isMember: boolean = await contract.state.members.has(userAddress);
const isBlacklisted: boolean = await contract.state.blacklist.has(userAddress);
```

### MerkleTree Roots

Read commitment tree roots:

```typescript
// Compact contract
ledger {
  commitment_tree: MerkleTree<32>;
}

// TypeScript - get the root hash
const root: Uint8Array = await contract.state.commitment_tree.root();
```

**Note**: You cannot read individual MerkleTree leaves from public state. The leaves are private; only the root is public.

### Complex Structures

Read struct values:

```typescript
// Compact contract
struct TokenInfo {
  name: Opaque<'string'>;
  symbol: Opaque<'string'>;
  decimals: Uint<8>;
}

ledger {
  token_info: TokenInfo;
}

// TypeScript access
const info = await contract.state.token_info();
// info: { name: string; symbol: string; decimals: bigint }
```

## Private Local State

Private state is stored in browser LevelDB and accessed through `WitnessContext` in witness functions.

### Storage Setup

Configure the private state provider:

```typescript
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';

const providers = {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: 'my-dapp-state', // Unique name for your DApp
  }),
  // ... other providers
};
```

### Reading in Witnesses

Access private state within witness functions:

```typescript
import type { WitnessContext } from '@midnight-ntwrk/midnight-js-types';

interface PrivateState {
  secretKey: Uint8Array;
  nonce: bigint;
  credentials: Map<string, Credential>;
}

const witnesses = {
  get_secret_key: (
    { privateState }: WitnessContext<PrivateState>
  ): Uint8Array => {
    return privateState.secretKey;
  },

  get_credential: (
    { privateState }: WitnessContext<PrivateState>,
    credentialId: Uint8Array
  ): Credential => {
    const id = bytesToHex(credentialId);
    const credential = privateState.credentials.get(id);
    if (!credential) {
      throw new Error('Credential not found');
    }
    return credential;
  },
};
```

### Mutating Private State

Update private state using `setPrivateState`:

```typescript
const witnesses = {
  get_and_increment_nonce: ({
    privateState,
    setPrivateState,
  }: WitnessContext<PrivateState>): bigint => {
    const currentNonce = privateState.nonce;

    // Update state for next call
    setPrivateState({
      ...privateState,
      nonce: currentNonce + 1n,
    });

    return currentNonce;
  },
};
```

### Initializing Private State

Initialize private state when first connecting:

```typescript
async function initializePrivateState(
  privateStateProvider: PrivateStateProvider,
  contractId: string
) {
  // Check if state exists
  const existing = await privateStateProvider.get(contractId);

  if (!existing) {
    // Initialize with default values
    const initialState: PrivateState = {
      secretKey: generateSecretKey(),
      nonce: 0n,
      credentials: new Map(),
    };

    await privateStateProvider.set(contractId, initialState);
  }
}
```

## Type Safety with TypeScript

### Generated Types

The Compact compiler generates TypeScript types from your contract:

```typescript
// Generated from your contract
import type { MyContractState } from './contract';

// Type-safe access
async function getBalance(
  contract: { state: MyContractState },
  address: Uint8Array
): Promise<bigint> {
  const balance = await contract.state.balances.get(address);
  return balance ?? 0n;
}
```

### Custom Type Definitions

Define private state types to match your contract:

```typescript
// Match your Compact struct definitions
interface Credential {
  owner: Uint8Array;      // Bytes<32>
  level: bigint;          // Uint<8>
  expiry: bigint;         // Uint<64>
}

interface PrivateState {
  secretKey: Uint8Array;  // Bytes<32>
  credentials: Map<string, Credential>;
  nonce: bigint;          // Uint<64>
}
```

### Type Mapping Reference

| Compact Type | TypeScript Type | Notes |
|--------------|-----------------|-------|
| `Field` | `bigint` | ZK field element |
| `Uint<N>` | `bigint` | Any bit width |
| `Boolean` | `boolean` | Direct mapping |
| `Bytes<N>` | `Uint8Array` | Fixed-length |
| `Opaque<'string'>` | `string` | UTF-8 string |
| `struct` | Object literal | Named fields |
| `Vector<T, N>` | `T[]` | Array of mapped type |

## Accessing State Data Provider

For advanced use cases, access the underlying data provider:

```typescript
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

// Get service URIs from wallet
const uris = await wallet.serviceUriConfig();

// Create public data provider
const publicDataProvider = indexerPublicDataProvider(
  uris.indexerUri,
  uris.indexerWsUri
);

// Use for contract state access
const providers = {
  publicDataProvider,
  // ... other providers
};
```

## Error Handling

### State Read Errors

```typescript
async function safeStateRead<T>(
  accessor: () => Promise<T>,
  fallback: T,
  errorHandler?: (error: Error) => void
): Promise<T> {
  try {
    return await accessor();
  } catch (error) {
    if (errorHandler) {
      errorHandler(error as Error);
    }
    return fallback;
  }
}

// Usage
const balance = await safeStateRead(
  () => contract.state.balances.get(address),
  0n,
  (error) => console.error('Failed to read balance:', error)
);
```

### Network Errors

```typescript
async function readWithRetry<T>(
  accessor: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await accessor();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
```

## Best Practices

1. **Check for undefined** - Map lookups return `undefined` if key not found
2. **Use type guards** - Validate data shape before use
3. **Handle network errors** - Indexer may be temporarily unavailable
4. **Cache appropriately** - See [privacy-aware-caching.md](privacy-aware-caching.md)
5. **Batch reads** - Group multiple state reads when possible
6. **Never trust private state for security** - Validate on-chain in circuits

## Common Mistakes

### Mistake: Assuming Map Values Exist

```typescript
// WRONG - may be undefined
const balance = await contract.state.balances.get(address);
console.log(balance.toString()); // Error if undefined!

// CORRECT - handle undefined case
const balance = await contract.state.balances.get(address);
console.log((balance ?? 0n).toString());
```

### Mistake: Mixing State Types

```typescript
// WRONG - private state not accessible outside witnesses
const secret = contract.privateState.secretKey; // Does not exist!

// CORRECT - private state only in witnesses
const witnesses = {
  use_secret: ({ privateState }) => privateState.secretKey,
};
```

### Mistake: Forgetting Async

```typescript
// WRONG - state accessors are async
const balance = contract.state.balances.get(address);
console.log(balance); // Promise, not value!

// CORRECT - await the result
const balance = await contract.state.balances.get(address);
console.log(balance);
```
