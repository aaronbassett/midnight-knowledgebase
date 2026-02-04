# Generated Contract API

When you compile a Compact contract, the compiler generates TypeScript types and interfaces for interacting with your contract. This reference covers how to use the generated API.

## Generated Files

Compiling `token.compact` produces:

```
build/
├── token.cjs           # CommonJS module
├── token.mjs           # ES module
├── token.d.ts          # TypeScript declarations
├── token.zkir          # ZK intermediate representation
└── token_keys/         # Proving/verification keys
```

## Contract Interface

The generated module exports a contract interface with methods for each exported circuit.

```typescript
import { TokenContract } from './build/token';

// Contract interface includes:
// - callTx: Methods that submit transactions
// - callPure: Methods for local-only execution
// - state: Ledger state accessors
// - witnesses: Type definitions for witnesses
```

## Transaction Methods (callTx)

For circuits that modify ledger state.

```compact
// Compact
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // Modifies ledger state
}

export circuit mint(to: Bytes<32>, amount: Uint<64>): Bytes<32> {
    // Returns transaction hash
}
```

```typescript
// TypeScript
import { Contract, Witnesses } from './build/token';

const witnesses: Witnesses = {
  get_secret_key: () => secretKey
};

// Transfer returns void (empty tuple [])
await contract.callTx.transfer(
  recipientAddress,  // to: Uint8Array
  1000n,             // amount: bigint
  witnesses
);

// Mint returns the result
const txHash: Uint8Array = await contract.callTx.mint(
  recipientAddress,
  5000n,
  witnesses
);
```

### Transaction Options

```typescript
await contract.callTx.transfer(
  recipientAddress,
  1000n,
  witnesses,
  {
    // Optional transaction configuration
    gasLimit: 1000000n,
    timeout: 30000,
    onProofGenerated: (proof) => {
      console.log('Proof ready, submitting...');
    }
  }
);
```

## Pure Methods (callPure)

For circuits that only read state without modifications.

```compact
// Compact
export circuit get_balance(addr: Bytes<32>): Uint<64> {
    return ledger.balances.lookup(addr).unwrap_or(0);
}

export circuit verify_signature(
    message: Bytes<32>,
    signature: Bytes<64>,
    pubkey: Bytes<32>
): Boolean {
    // Pure verification, no state changes
}
```

```typescript
// TypeScript - local execution, no transaction
const balance: bigint = await contract.callPure.get_balance(
  userAddress,
  witnesses
);

const isValid: boolean = await contract.callPure.verify_signature(
  messageHash,
  signature,
  publicKey,
  witnesses
);
```

## Ledger State Access

Direct access to ledger state without circuit execution.

### Simple Values

```compact
// Compact
ledger {
    total_supply: Uint<64>;
    admin: Bytes<32>;
    is_paused: Boolean;
}
```

```typescript
// TypeScript
const totalSupply: bigint = await contract.state.total_supply();
const admin: Uint8Array = await contract.state.admin();
const isPaused: boolean = await contract.state.is_paused();
```

### Counter ADT

```compact
// Compact
ledger {
    counter: Counter;
}
```

```typescript
// TypeScript
const count: bigint = await contract.state.counter();
```

### Map ADT

```compact
// Compact
ledger {
    balances: Map<Bytes<32>, Uint<64>>;
    metadata: Map<Bytes<32>, Opaque<'string'>>;
}
```

```typescript
// TypeScript
// Get single value
const balance: bigint | undefined = await contract.state.balances.get(userAddress);

// Check existence
const exists: boolean = await contract.state.balances.has(userAddress);

// Iterate (if supported by indexer)
for await (const [address, balance] of contract.state.balances.entries()) {
  console.log(`${bytesToHex(address)}: ${balance}`);
}
```

### Set ADT

```compact
// Compact
ledger {
    members: Set<Bytes<32>>;
    used_nullifiers: Set<Bytes<32>>;
}
```

```typescript
// TypeScript
const isMember: boolean = await contract.state.members.has(userAddress);
const isNullifierUsed: boolean = await contract.state.used_nullifiers.has(nullifier);
```

### MerkleTree ADT

```compact
// Compact
ledger {
    commitment_tree: MerkleTree<32>;
}
```

```typescript
// TypeScript
const root: Uint8Array = await contract.state.commitment_tree.root();
const leaf: Uint8Array | undefined = await contract.state.commitment_tree.get(index);
```

## Event Handling

Listen for contract events.

```compact
// Compact
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
    // emit is implicit for certain state changes
}
```

```typescript
// TypeScript
contract.events.on('Transfer', (event) => {
  console.log(`Transfer: ${event.to} received ${event.amount}`);
});

contract.events.on('*', (eventName, event) => {
  console.log(`Event ${eventName}:`, event);
});

// Unsubscribe
const unsubscribe = contract.events.on('Transfer', handler);
unsubscribe();
```

## Type Exports

The generated module exports types for all contract structures.

```compact
// Compact
struct TokenInfo {
    name: Opaque<'string'>,
    symbol: Opaque<'string'>,
    decimals: Uint<8>
}

enum TransferResult {
    Success,
    InsufficientBalance,
    Unauthorized
}
```

```typescript
// TypeScript
import type {
  TokenInfo,
  TransferResult,
  Witnesses
} from './build/token';

const info: TokenInfo = {
  name: "My Token",
  symbol: "MTK",
  decimals: 18n
};

const result: TransferResult = { tag: 'Success' };
```

## Contract Factory

Create new contract instances.

```typescript
import { createTokenContract } from './build/token';
import { MidnightProvider } from '@midnight-ntwrk/midnight-js-provider';

const provider = new MidnightProvider({
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.midnight.network'
});

// Connect to existing contract
const contract = createTokenContract(provider, contractAddress);

// Or deploy new contract
const { contract, address } = await deployTokenContract(provider, {
  initialState: {
    total_supply: 1000000n,
    admin: adminAddress
  },
  witnesses
});
```

## Error Handling

```typescript
import { ContractError, ProofError } from '@midnight-ntwrk/midnight-js-contracts';

try {
  await contract.callTx.transfer(to, amount, witnesses);
} catch (error) {
  if (error instanceof ProofError) {
    // Proof generation failed - circuit assertion failed
    console.error('Invalid proof:', error.message);
  } else if (error instanceof ContractError) {
    // Contract execution failed
    console.error('Contract error:', error.code, error.message);
  } else {
    throw error;
  }
}
```

## Batch Operations

Execute multiple operations efficiently.

```typescript
const batch = contract.batch();

batch.callTx.transfer(recipient1, 100n, witnesses);
batch.callTx.transfer(recipient2, 200n, witnesses);
batch.callTx.transfer(recipient3, 300n, witnesses);

// Submit all in single transaction
const results = await batch.execute();
```

## Type-Safe Patterns

### Generic Contract Wrapper

```typescript
interface ContractState {
  balances: Map<string, bigint>;
  totalSupply: bigint;
}

class TokenClient {
  constructor(
    private contract: TokenContract,
    private witnesses: Witnesses
  ) {}

  async getBalance(address: Uint8Array): Promise<bigint> {
    return await this.contract.state.balances.get(address) ?? 0n;
  }

  async transfer(to: Uint8Array, amount: bigint): Promise<void> {
    await this.contract.callTx.transfer(to, amount, this.witnesses);
  }
}
```

### Result Handling

```typescript
type Result<T, E> =
  | { tag: 'Ok'; value: T }
  | { tag: 'Err'; value: E };

function handleResult<T, E>(result: Result<T, E>): T {
  if (result.tag === 'Ok') {
    return result.value;
  }
  throw new Error(`Contract error: ${JSON.stringify(result.value)}`);
}

const balance = handleResult(
  await contract.callTx.safe_get_balance(address, witnesses)
);
```
