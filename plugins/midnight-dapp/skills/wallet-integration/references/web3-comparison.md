# Web3 Comparison: MetaMask vs Lace

Migration guide for developers transitioning from Ethereum/MetaMask to Midnight/Lace.

## Overview

If you've built DApps with MetaMask, many concepts transfer to Lace with some key differences. This guide maps Ethereum patterns to their Midnight equivalents.

## Global Object

| Ethereum | Midnight |
|----------|----------|
| `window.ethereum` | `window.midnight.mnLace` |

### Detection

**MetaMask:**
```typescript
if (typeof window.ethereum !== 'undefined') {
  console.log('MetaMask is installed');
}
```

**Lace:**
```typescript
if (window.midnight?.mnLace) {
  console.log('Lace is installed');
}
```

## Connecting

| Ethereum | Midnight |
|----------|----------|
| `eth_requestAccounts` | `wallet.enable()` |
| Returns `string[]` | Returns `WalletAPI` |

### Request Connection

**MetaMask:**
```typescript
const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
const address = accounts[0];
```

**Lace:**
```typescript
const wallet = window.midnight.mnLace;
const api = await wallet.enable();
const state = await api.state();
const address = state.address;
```

## Address Format

| Ethereum | Midnight |
|----------|----------|
| Hex: `0x742d35Cc...` | Bech32m: `addr_test1qz...` |
| 42 characters | ~60 characters |
| Checksum in case | Checksum in encoding |

### Address Display

**MetaMask:**
```typescript
function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  // "0x742d...5678"
}
```

**Lace:**
```typescript
function formatAddress(addr: string): string {
  return `${addr.slice(0, 12)}...${addr.slice(-8)}`;
  // "addr_test1qz...xyz89ab"
}
```

## Checking Connection

| Ethereum | Midnight |
|----------|----------|
| Check `accounts.length` | `wallet.isEnabled()` |

**MetaMask:**
```typescript
const accounts = await ethereum.request({ method: 'eth_accounts' });
const isConnected = accounts.length > 0;
```

**Lace:**
```typescript
const isConnected = await wallet.isEnabled();
```

## Network/Chain

| Ethereum | Midnight |
|----------|----------|
| `eth_chainId` | `serviceUriConfig()` |
| Chain ID (hex) | Service URLs |
| `wallet_switchEthereumChain` | Switch in Lace UI |

### Get Network

**MetaMask:**
```typescript
const chainId = await ethereum.request({ method: 'eth_chainId' });
// "0x1" = Mainnet, "0x5" = Goerli, etc.
```

**Lace:**
```typescript
const uris = await wallet.serviceUriConfig();
const isTestnet = uris.indexerUri.includes('testnet');
```

### Switch Network

**MetaMask:**
```typescript
await ethereum.request({
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: '0x5' }]
});
```

**Lace:**
```typescript
// Network switching is done in the Lace wallet UI
// DApp should detect the change and adapt
throw new Error('Please switch to testnet in your Lace wallet settings');
```

## Transaction Signing

| Ethereum | Midnight |
|----------|----------|
| Instant signature | Proof generation (seconds) |
| Client-side ECDSA | Client-side ZK proof |
| `eth_sendTransaction` | `balanceAndProveTransaction` + `submitTransaction` |

### Send Transaction

**MetaMask:**
```typescript
const txHash = await ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    from: account,
    to: recipient,
    value: '0x1000000000000000',
    data: '0x...'
  }]
});
```

**Lace:**
```typescript
// Build transaction with witnesses
const tx = await contract.callTx.transfer(recipient, amount, witnesses);

// Balance and prove (generates ZK proof - takes time)
const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);

// Submit proven transaction
const txHash = await walletAPI.submitTransaction(provenTx);
```

### Key Difference: Proof Generation

MetaMask signs instantly. Lace generates ZK proofs which takes several seconds:

```typescript
// MetaMask: No loading state needed
const txHash = await sendTransaction(tx);

// Lace: Show loading during proof generation
setStatus('Generating proof...');
const provenTx = await walletAPI.balanceAndProveTransaction(tx, newCoins);
setStatus('Submitting...');
const txHash = await walletAPI.submitTransaction(provenTx);
setStatus('Submitted');
```

## Events

| Ethereum | Midnight |
|----------|----------|
| `accountsChanged` event | Poll `state()` |
| `chainChanged` event | Poll `serviceUriConfig()` |

### Account Change Detection

**MetaMask:**
```typescript
ethereum.on('accountsChanged', (accounts) => {
  setAccount(accounts[0]);
});
```

**Lace:**
```typescript
// No event API currently - use polling
setInterval(async () => {
  const state = await walletAPI.state();
  if (state.address !== currentAddress) {
    setAddress(state.address);
  }
}, 5000);
```

## Provider Libraries

| Ethereum | Midnight |
|----------|----------|
| ethers.js / web3.js | @midnight-ntwrk/midnight-js-* |
| `new ethers.BrowserProvider(ethereum)` | Custom provider setup |

### Provider Setup

**Ethereum (ethers.js):**
```typescript
import { ethers } from 'ethers';

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const contract = new ethers.Contract(address, abi, signer);
```

**Midnight:**
```typescript
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-contracts';

const uris = await wallet.serviceUriConfig();
const walletState = await walletAPI.state();

const providers = {
  publicDataProvider: indexerPublicDataProvider(uris.indexerUri, uris.indexerWsUri),
  proofProvider: httpClientProofProvider(uris.proverServerUri),
  walletProvider: {
    coinPublicKey: walletState.coinPublicKey,
    balanceTx: (tx, coins) => walletAPI.balanceAndProveTransaction(tx, coins)
  },
  midnightProvider: {
    submitTx: (tx) => walletAPI.submitTransaction(tx)
  }
};
```

## State Reading

| Ethereum | Midnight |
|----------|----------|
| All state on-chain | Public + private state |
| `contract.balanceOf(addr)` | `contract.state.balances.get(addr)` |

**Ethereum:**
```typescript
const balance = await contract.balanceOf(account);
```

**Midnight:**
```typescript
// Public state (on-chain)
const balance = await contract.state.balances.get(account);

// Private state (local only) - accessed in witnesses
const privateData = privateState.mySecret;
```

## Error Handling

| Ethereum Error | Midnight Equivalent |
|----------------|---------------------|
| User rejected | User rejected (same concept) |
| Insufficient funds | Insufficient balance |
| Transaction reverted | Proof generation failed / Contract error |
| Network error | Indexer/proof server connection error |

### Error Patterns

**MetaMask:**
```typescript
try {
  await ethereum.request({ method: 'eth_sendTransaction', params: [tx] });
} catch (error) {
  if (error.code === 4001) {
    // User rejected
  }
}
```

**Lace:**
```typescript
try {
  await walletAPI.submitTransaction(provenTx);
} catch (error) {
  if (error.message.includes('rejected')) {
    // User rejected
  } else if (error instanceof ProofError) {
    // Proof generation failed
  }
}
```

## Migration Checklist

- [ ] Replace `window.ethereum` with `window.midnight.mnLace`
- [ ] Update address formatting for Bech32m
- [ ] Replace instant signing with proof generation + loading states
- [ ] Update provider setup for Midnight packages
- [ ] Replace event listeners with polling for account/network changes
- [ ] Update error handling for proof errors
- [ ] Add private state management (not applicable in Ethereum)
- [ ] Update network detection logic
