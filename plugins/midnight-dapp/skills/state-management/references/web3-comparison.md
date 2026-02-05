# Web3 Comparison: Ethereum vs Midnight State

Migration guide for developers transitioning from Ethereum state management patterns to Midnight.

## Overview

The fundamental difference: Ethereum state is entirely public on-chain, while Midnight has dual-state with public and private components.

## State Model Comparison

### Ethereum: All Public

```solidity
// Solidity - all state is public
contract Token {
    uint256 public totalSupply;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;
}
```

Anyone can read any state value by querying the blockchain.

### Midnight: Dual-State

```compact
// Compact - explicit public vs private
ledger {
  total_supply: Uint<64>;  // Public - on-chain
  balances: Map<Bytes<32>, Uint<64>>;  // Public - on-chain
}

// Private state - defined in TypeScript, stored locally
interface PrivateState {
  secretKey: Uint8Array;  // Private - browser only
  nonce: bigint;          // Private - browser only
}
```

Public state is on-chain; private state exists only in the user's browser.

## Reading State

### Ethereum (ethers.js)

```typescript
import { ethers } from 'ethers';

// Connect to contract
const contract = new ethers.Contract(address, abi, provider);

// Read state - direct call
const totalSupply = await contract.totalSupply();
const balance = await contract.balanceOf(userAddress);

// Read mapping
const allowance = await contract.allowances(owner, spender);
```

### Midnight

```typescript
// Connect to contract (after deployment)
const contract = await deployedContract();

// Read public state
const totalSupply = await contract.state.total_supply();
const balance = await contract.state.balances.get(userAddress);

// Private state - only in witnesses
const witnesses = {
  get_secret: ({ privateState }) => privateState.secretKey,
};
```

### Key Differences

| Aspect | Ethereum | Midnight |
|--------|----------|----------|
| State visibility | All public | Public + private |
| Access method | Contract call | `contract.state.*` for public |
| Private data | Not possible | Via `WitnessContext` |
| Data source | Any node | Indexer (public) + LevelDB (private) |

## State Subscriptions

### Ethereum Events

```typescript
// Solidity - emit events for state changes
event Transfer(address indexed from, address indexed to, uint256 value);

function transfer(address to, uint256 amount) public {
    balances[msg.sender] -= amount;
    balances[to] += amount;
    emit Transfer(msg.sender, to, amount);
}
```

```typescript
// ethers.js - subscribe to events
contract.on('Transfer', (from, to, value, event) => {
  console.log(`Transfer: ${from} -> ${to}: ${value}`);
  // Update UI
});

// Filter by indexed parameters
const filter = contract.filters.Transfer(null, myAddress);
contract.on(filter, (from, to, value) => {
  // Only transfers TO myAddress
});
```

### Midnight Polling/WebSocket

Midnight uses polling or WebSocket subscriptions rather than event filters:

```typescript
// Polling pattern
useEffect(() => {
  const interval = setInterval(async () => {
    const newBalance = await contract.state.balances.get(address);
    if (newBalance !== balance) {
      setBalance(newBalance);
    }
  }, 5000);

  return () => clearInterval(interval);
}, [contract, address, balance]);

// WebSocket subscription via indexerWsUri
const uris = await wallet.serviceUriConfig();
const ws = new WebSocket(uris.indexerWsUri);
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle state updates
};
```

### Migration Pattern

```typescript
// Ethereum event-based
contract.on('Transfer', handleTransfer);

// Midnight polling-based
function useTransfers(contract, address) {
  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    const poll = async () => {
      // Query indexer for recent transactions
      const txs = await getRecentTransactions(contract.address);
      setTransfers(txs.filter(tx => tx.to === address || tx.from === address));
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [contract, address]);

  return transfers;
}
```

## State Indexing

### Ethereum: The Graph / Direct RPC

```typescript
// The Graph subgraph query
const query = `
  query GetBalances($address: String!) {
    account(id: $address) {
      balance
      transfers {
        from
        to
        value
      }
    }
  }
`;

// Or direct RPC
const balance = await provider.call({
  to: contractAddress,
  data: contract.interface.encodeFunctionData('balanceOf', [address]),
});
```

### Midnight: Indexer API

```typescript
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

// Set up indexer connection
const uris = await wallet.serviceUriConfig();
const publicDataProvider = indexerPublicDataProvider(
  uris.indexerUri,
  uris.indexerWsUri
);

// State access through contract
const balance = await contract.state.balances.get(address);
```

### Comparison

| Feature | Ethereum | Midnight |
|---------|----------|----------|
| Data source | RPC node / The Graph | Indexer service |
| Historical data | Full history via events | Via indexer queries |
| Real-time | Event subscriptions | WebSocket / polling |
| Custom indexing | The Graph subgraphs | Indexer API |

## Contract Calls

### Ethereum: Read Functions

```typescript
// Solidity view function
function getBalance(address user) public view returns (uint256) {
    return balances[user];
}

// ethers.js call
const balance = await contract.getBalance(userAddress);
// No transaction, just reads state
```

### Midnight: Pure Calls

```typescript
// Compact export circuit
export circuit get_balance(user: Bytes<32>): Uint<64> {
  return balances.lookup(user).unwrap_or(0);
}

// TypeScript call
const balance = await contract.callPure.get_balance(userAddress);
// Executes circuit locally, no transaction
```

### Key Differences

| Aspect | Ethereum | Midnight |
|--------|----------|----------|
| Read method | `view` functions | `callPure` for circuits |
| Execution | On node | Local execution |
| Cost | Free (no gas) | Free (local) |
| Result | On-chain state | Circuit output |

## Caching Patterns

### Ethereum

```typescript
// All state is public - cache freely
const cache = new Map();

async function getCachedBalance(address) {
  if (cache.has(address)) {
    return cache.get(address);
  }
  const balance = await contract.balanceOf(address);
  cache.set(address, balance);
  return balance;
}
```

### Midnight

```typescript
// Only cache public state
const publicCache = new Map();

async function getCachedBalance(address) {
  // Safe - this is public state
  if (publicCache.has(address)) {
    return publicCache.get(address);
  }
  const balance = await contract.state.balances.get(address);
  publicCache.set(address, balance);
  return balance;
}

// NEVER cache private state externally
// Private state is only accessed in witnesses via SDK
```

### Caching Rules Comparison

| Data Type | Ethereum | Midnight |
|-----------|----------|----------|
| Public state | Cache anywhere | Cache anywhere |
| Transaction data | Cache freely | Cache freely |
| Private state | N/A (none exists) | Local only, via SDK |
| User secrets | N/A | Never cache |

## Provider Configuration

### Ethereum (ethers.js)

```typescript
import { ethers } from 'ethers';

// Browser provider (MetaMask)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const contract = new ethers.Contract(address, abi, signer);
```

### Midnight

```typescript
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';

const wallet = window.midnight?.mnLace;
const api = await wallet.enable();
const state = await api.state();
const uris = await wallet.serviceUriConfig();

const providers = {
  publicDataProvider: indexerPublicDataProvider(uris.indexerUri, uris.indexerWsUri),
  privateStateProvider: levelPrivateStateProvider({ privateStateStoreName: 'my-dapp' }),
  // ... proof provider, wallet provider, etc.
};
```

### Provider Differences

| Provider | Ethereum | Midnight |
|----------|----------|----------|
| Wallet | `BrowserProvider(window.ethereum)` | `window.midnight.mnLace` |
| State | Same provider | Separate public + private providers |
| Indexer | Optional (The Graph) | Required for public state |
| Proofs | N/A | Required proof provider |

## Migration Checklist

Converting an Ethereum DApp to Midnight state management:

- [ ] Replace `contract.function()` with `contract.state.*` for reads
- [ ] Replace event subscriptions with polling or WebSocket
- [ ] Separate public and private state in your data model
- [ ] Update caching to respect privacy boundaries
- [ ] Configure both public data provider and private state provider
- [ ] Move private data handling to witness functions
- [ ] Update TypeScript types for Midnight's type system
- [ ] Remove assumptions about global state visibility
- [ ] Add loading states (no instant reads like Ethereum)
- [ ] Implement optimistic updates for better UX

## Mental Model Shift

### Ethereum Thinking

"All data lives on the blockchain. Anyone can read any state. Privacy requires off-chain solutions."

### Midnight Thinking

"Public state is on-chain for verification. Private state stays local for privacy. Proofs connect the two without revealing secrets."

This fundamental shift affects every aspect of state management in your DApp.
