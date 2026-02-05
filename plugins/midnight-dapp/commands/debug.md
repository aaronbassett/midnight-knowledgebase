---
name: dapp-debug
description: Interactive debugging for wallet, transaction, and proof issues in Midnight DApps
---

# /dapp-debug

Interactive debugging assistant for diagnosing and resolving issues in Midnight DApp development.

## Usage

```
/dapp-debug [category]
```

### Categories

| Category | Focus Area |
|----------|------------|
| `wallet` | Wallet connection, accounts, network issues |
| `transaction` | Transaction building, signing, submission failures |
| `proof` | Proof generation errors, witness issues |
| `network` | Connectivity, indexer, proof server issues |

If no category is specified, runs comprehensive diagnostics.

## Diagnostic Areas

### Wallet Debugging (`/dapp-debug wallet`)

#### Check Wallet Extension

```bash
# Verify Lace extension is installed (browser console)
console.log(window.midnight?.mnLace ? 'Lace found' : 'Lace not found');
```

Common issues:
- Extension not installed
- Extension disabled
- Wrong browser (Lace requires Chrome)
- Extension not authorized for this site

#### Check Connection State

```typescript
const wallet = window.midnight?.mnLace;
if (wallet) {
  console.log('API Version:', wallet.apiVersion);
  console.log('Is Enabled:', await wallet.isEnabled());

  if (await wallet.isEnabled()) {
    const api = await wallet.enable();
    const state = await api.state();
    console.log('Address:', state.address);
  }
}
```

#### Check Network Configuration

```typescript
const uris = await wallet.serviceUriConfig();
console.log('Indexer:', uris.indexerUri);
console.log('Indexer WS:', uris.indexerWsUri);
console.log('Proof Server:', uris.proverServerUri);
```

### Transaction Debugging (`/dapp-debug transaction`)

#### Check Transaction Build

```typescript
// Verify contract instance is properly initialized
console.log('Contract deployed:', !!contract);
console.log('Contract address:', contract.address);

// Check transaction method exists
console.log('Available methods:', Object.keys(contract.callTx));
```

#### Check Signing Flow

Common transaction errors:
- `UserRejected` - User cancelled in wallet
- `InsufficientBalance` - Not enough tokens
- `InvalidWitness` - Witness function returned unexpected data

#### Check Confirmation Status

```typescript
// After submission
const txHash = await walletAPI.submitTransaction(tx);
console.log('Transaction hash:', txHash);

// Poll for confirmation
const status = await indexer.getTransactionStatus(txHash);
console.log('Status:', status);
```

### Proof Debugging (`/dapp-debug proof`)

#### Check Proof Server

```bash
# Verify proof server is running
curl -s http://localhost:6300/health

# Check proof server logs
docker logs midnight-proof-server --tail 50
```

Common proof errors:
- `ProofError: Constraint violation` - Circuit assertion failed
- `ProofError: Timeout` - Proof generation took too long
- `ProofError: Invalid witness` - Witness returned wrong type

#### Check Witness Implementation

```typescript
// Verify witness function signatures match contract
const witnesses = {
  get_secret: ({ privateState }) => {
    console.log('get_secret called');
    console.log('privateState:', privateState);
    return privateState.secret;
  }
};
```

#### Debug Witness Types

```typescript
// Validate types before proof generation
import { bytesToHex } from './utils';

const witnesses = {
  get_credential: ({ privateState }, credId) => {
    console.log('Credential ID:', bytesToHex(credId));
    const cred = privateState.credentials.get(bytesToHex(credId));
    console.log('Found credential:', cred);
    return cred;
  }
};
```

### Network Debugging (`/dapp-debug network`)

#### Check Indexer Connectivity

```bash
# Test indexer HTTP endpoint
curl -s "${INDEXER_URI}/health"

# Test indexer WebSocket
websocat "${INDEXER_WS_URI}"
```

#### Check Proof Server Connectivity

```bash
# Local proof server (default port 6300)
curl -s http://localhost:6300/health

# Docker status
docker ps | grep proof-server
```

#### Check CORS Issues

```
# Browser console errors to look for:
- "CORS policy: No 'Access-Control-Allow-Origin'"
- "net::ERR_CONNECTION_REFUSED"
```

Solutions:
- Ensure proof server allows localhost origin
- Check Docker port mappings
- Verify URLs in wallet serviceUriConfig

## Interactive Flow

When running `/dapp-debug` without a category:

1. **Environment Check**
   - Node.js version
   - Package versions
   - Docker status

2. **Wallet Check**
   - Extension presence
   - Connection status
   - Network configuration

3. **Contract Check**
   - Compilation status
   - Deployment status
   - Method availability

4. **Network Check**
   - Indexer connectivity
   - Proof server status
   - WebSocket connections

## Output Format

```
/dapp-debug Results
====================

Category: wallet

[CHECK] Lace wallet extension
  Status: INSTALLED
  Version: 1.0.0

[CHECK] Wallet authorization
  Status: AUTHORIZED
  Address: addr_test1qz...

[CHECK] Network configuration
  Status: CONNECTED
  Network: testnet
  Indexer: https://indexer.testnet.midnight.network

[ISSUE] Proof server connection
  Status: FAILED
  Error: Connection refused on localhost:6300

  Suggested fix:
  1. Ensure Docker is running
  2. Start proof server:
     docker run -p 6300:6300 midnightnetwork/proof-server -- \
       midnight-proof-server --network testnet

Summary: 3 passed, 1 failed
```

## Related

- `/dapp-check` - Project structure validation
- `error-handling` skill - Error categorization and messaging
- `testing-patterns` skill - Mock providers for debugging
