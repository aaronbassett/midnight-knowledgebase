# Lace Wallet Connection

Complete guide to connecting Lace wallet in Midnight DApps.

## Overview

Lace wallet is accessed via `window.midnight.mnLace`, a JavaScript object injected by the browser extension. The connection process requires user approval and returns an API for wallet operations.

## Prerequisites

- Chrome browser (primary supported browser)
- Lace Beta Wallet extension installed
- Extension enabled for your domain

## Connection Lifecycle

### 1. Detection

Check if Lace wallet is available:

```typescript
interface MidnightWindow {
  midnight?: {
    mnLace?: DAppConnectorAPI;
  };
}

function detectWallet(): DAppConnectorAPI | null {
  const wallet = (window as MidnightWindow).midnight?.mnLace;
  return wallet ?? null;
}
```

### 2. Authorization

Request user permission to connect:

```typescript
async function connect(): Promise<DAppConnectorWalletAPI> {
  const wallet = detectWallet();
  if (!wallet) {
    throw new Error('Lace wallet not installed');
  }

  // This triggers the Lace approval popup
  const api = await wallet.enable();
  return api;
}
```

**User Experience:**
- User sees a popup from Lace asking to authorize the DApp
- User can approve or reject
- If approved, the API is returned
- If rejected, an error is thrown

### 3. State Retrieval

Get current wallet state after connection:

```typescript
interface WalletState {
  address: string;           // Bech32m address
  coinPublicKey: string;     // Public key for coin operations
  encryptionPublicKey: string; // Public key for encryption
}

async function getWalletState(api: DAppConnectorWalletAPI): Promise<WalletState> {
  return await api.state();
}
```

### 4. Service Configuration

Get network service URLs:

```typescript
interface ServiceURIs {
  indexerUri: string;       // HTTP indexer endpoint
  indexerWsUri: string;     // WebSocket indexer endpoint
  proverServerUri: string;  // Local proof server URL
}

async function getServiceURIs(wallet: DAppConnectorAPI): Promise<ServiceURIs> {
  return await wallet.serviceUriConfig();
}
```

## Pre-Connection API

Methods available before `enable()` is called:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `enable()` | `Promise<DAppConnectorWalletAPI>` | Request authorization |
| `isEnabled()` | `Promise<boolean>` | Check if already authorized |
| `apiVersion` | `string` | Semver API version |
| `name` | `string` | Wallet name ("Lace") |
| `serviceUriConfig()` | `Promise<ServiceURIs>` | Network service URLs |

## Post-Connection API

Methods available after successful `enable()`:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `state()` | `Promise<WalletState>` | Current wallet state |
| `balanceAndProveTransaction(tx, newCoins)` | `Promise<ProvenTx>` | Balance and prove transaction |
| `submitTransaction(tx)` | `Promise<string>` | Submit proven transaction |

## Error Handling

### Common Connection Errors

```typescript
async function safeConnect() {
  try {
    const wallet = detectWallet();
    if (!wallet) {
      return { error: 'NOT_INSTALLED', message: 'Please install Lace wallet' };
    }

    const api = await wallet.enable();
    const state = await api.state();
    return { success: true, address: state.address };

  } catch (error) {
    if (error instanceof Error) {
      // User rejected connection
      if (error.message.includes('rejected')) {
        return { error: 'USER_REJECTED', message: 'Connection was cancelled' };
      }
      // Extension error
      if (error.message.includes('extension')) {
        return { error: 'EXTENSION_ERROR', message: 'Wallet extension error' };
      }
    }
    return { error: 'UNKNOWN', message: 'Connection failed' };
  }
}
```

### Error Types

| Error | Cause | User Action |
|-------|-------|-------------|
| Wallet not installed | Extension missing | Install Lace |
| User rejected | User clicked "Reject" | Try again |
| Extension error | Extension crashed | Restart browser |
| Network error | Service unreachable | Check network |

## Persistent Connection

Check if user has previously authorized:

```typescript
async function checkExistingConnection(): Promise<boolean> {
  const wallet = detectWallet();
  if (!wallet) return false;

  return await wallet.isEnabled();
}

// On page load, restore connection if previously authorized
async function restoreConnection(): Promise<DAppConnectorWalletAPI | null> {
  const wallet = detectWallet();
  if (!wallet) return null;

  if (await wallet.isEnabled()) {
    // User already authorized - no popup shown
    return await wallet.enable();
  }
  return null;
}
```

## TypeScript Types

```typescript
// Type declarations for window.midnight
declare global {
  interface Window {
    midnight?: {
      mnLace?: DAppConnectorAPI;
    };
  }
}

interface DAppConnectorAPI {
  enable(): Promise<DAppConnectorWalletAPI>;
  isEnabled(): Promise<boolean>;
  readonly apiVersion: string;
  readonly name: string;
  serviceUriConfig(): Promise<ServiceURIs>;
}

interface DAppConnectorWalletAPI {
  state(): Promise<WalletState>;
  balanceAndProveTransaction(tx: unknown, newCoins: unknown): Promise<unknown>;
  submitTransaction(tx: unknown): Promise<string>;
}
```

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | Full | Primary supported browser |
| Brave | Limited | May require disabled shields |
| Firefox | None | Not supported |
| Safari | None | Not supported |
| Edge | Limited | Chromium-based, may work |

## Best Practices

1. **Always check availability** before attempting connection
2. **Handle rejection gracefully** - users may click "Reject"
3. **Restore connections** on page load to avoid repeated prompts
4. **Show clear status** - users should know if they're connected
5. **Provide fallback** - show installation instructions if wallet missing
