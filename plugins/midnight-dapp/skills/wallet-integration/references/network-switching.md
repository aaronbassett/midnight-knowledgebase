# Network Switching

Configuring testnet and mainnet networks in Midnight DApps.

## Overview

Network configuration in Midnight is managed through the wallet's `serviceUriConfig()` method. Unlike Ethereum's chain switching (EIP-3085), Midnight network selection is done within the Lace wallet, and the DApp receives the appropriate service URLs.

## Service URIs

The wallet provides three essential service endpoints:

```typescript
interface ServiceURIs {
  indexerUri: string;       // HTTP endpoint for reading chain state
  indexerWsUri: string;     // WebSocket endpoint for subscriptions
  proverServerUri: string;  // Local proof server endpoint
}
```

### Retrieving Service URIs

```typescript
async function getNetworkConfig(): Promise<ServiceURIs> {
  const wallet = window.midnight?.mnLace;
  if (!wallet) {
    throw new Error('Wallet not available');
  }

  return await wallet.serviceUriConfig();
}
```

### Example URIs

**Testnet:**
```javascript
{
  indexerUri: "https://indexer.testnet.midnight.network",
  indexerWsUri: "wss://indexer.testnet.midnight.network/ws",
  proverServerUri: "http://localhost:6300"
}
```

**Mainnet (when available):**
```javascript
{
  indexerUri: "https://indexer.midnight.network",
  indexerWsUri: "wss://indexer.midnight.network/ws",
  proverServerUri: "http://localhost:6300"
}
```

## Network Detection

Detect which network the wallet is configured for:

```typescript
type NetworkType = 'testnet' | 'mainnet' | 'unknown';

async function detectNetwork(): Promise<NetworkType> {
  const uris = await getNetworkConfig();

  if (uris.indexerUri.includes('testnet')) {
    return 'testnet';
  }
  if (!uris.indexerUri.includes('testnet')) {
    return 'mainnet';
  }
  return 'unknown';
}
```

### Network from Address

Addresses indicate network type:

```typescript
function getNetworkFromAddress(address: string): NetworkType {
  if (address.startsWith('addr_test1')) {
    return 'testnet';
  }
  if (address.startsWith('addr1')) {
    return 'mainnet';
  }
  return 'unknown';
}
```

## Provider Setup by Network

Configure providers using wallet-provided URIs:

```typescript
import {
  indexerPublicDataProvider,
  levelPrivateStateProvider,
  httpClientProofProvider,
} from '@midnight-ntwrk/midnight-js-contracts';

async function setupProviders() {
  const wallet = window.midnight?.mnLace;
  const walletAPI = await wallet.enable();
  const walletState = await walletAPI.state();
  const uris = await wallet.serviceUriConfig();

  return {
    // Public state from indexer
    publicDataProvider: indexerPublicDataProvider(
      uris.indexerUri,
      uris.indexerWsUri
    ),

    // Private state in browser
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'my-dapp-private-state'
    }),

    // Proof generation (always local)
    proofProvider: httpClientProofProvider(uris.proverServerUri),

    // Wallet integration
    walletProvider: {
      coinPublicKey: walletState.coinPublicKey,
      encryptionPublicKey: walletState.encryptionPublicKey,
      balanceTx: (tx, newCoins) => walletAPI.balanceAndProveTransaction(tx, newCoins)
    },

    // Transaction submission
    midnightProvider: {
      submitTx: (tx) => walletAPI.submitTransaction(tx)
    }
  };
}
```

## Network-Specific Considerations

### Testnet

- Use for development and testing
- Tokens have no real value
- Get testnet tokens from faucet
- May have different features than mainnet

### Mainnet

- Use for production deployments
- Real token value
- Higher security requirements
- More stable infrastructure

## Network Change Detection

Monitor for network changes:

```typescript
function useNetworkMonitor(onNetworkChange: (network: NetworkType) => void) {
  const lastNetworkRef = useRef<NetworkType | null>(null);

  useEffect(() => {
    const checkNetwork = async () => {
      const wallet = window.midnight?.mnLace;
      if (!wallet) return;

      const uris = await wallet.serviceUriConfig();
      const currentNetwork = uris.indexerUri.includes('testnet')
        ? 'testnet'
        : 'mainnet';

      if (lastNetworkRef.current && lastNetworkRef.current !== currentNetwork) {
        onNetworkChange(currentNetwork);
      }
      lastNetworkRef.current = currentNetwork;
    };

    // Poll for changes
    const interval = setInterval(checkNetwork, 10000);
    checkNetwork(); // Initial check

    return () => clearInterval(interval);
  }, [onNetworkChange]);
}
```

## Network UI Component

Display current network with visual indicator:

```typescript
interface NetworkIndicatorProps {
  network: NetworkType;
  className?: string;
}

function NetworkIndicator({ network, className }: NetworkIndicatorProps) {
  const config = {
    testnet: {
      label: 'Testnet',
      color: 'orange',
      icon: '🧪'
    },
    mainnet: {
      label: 'Mainnet',
      color: 'green',
      icon: '🌐'
    },
    unknown: {
      label: 'Unknown',
      color: 'gray',
      icon: '❓'
    }
  };

  const { label, color, icon } = config[network];

  return (
    <div className={`network-indicator ${className}`} style={{ color }}>
      <span className="icon">{icon}</span>
      <span className="label">{label}</span>
    </div>
  );
}
```

## Environment Configuration

For development, configure environment-specific settings:

```typescript
// config.ts
interface AppConfig {
  expectedNetwork: NetworkType;
  allowedNetworks: NetworkType[];
}

const config: AppConfig = {
  // In development, allow testnet
  expectedNetwork: process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet',
  allowedNetworks: process.env.NODE_ENV === 'production'
    ? ['mainnet']
    : ['testnet', 'mainnet']
};

export function validateNetwork(network: NetworkType): boolean {
  return config.allowedNetworks.includes(network);
}
```

## Network Mismatch Handling

Handle when user is on wrong network:

```typescript
async function ensureCorrectNetwork(expectedNetwork: NetworkType): Promise<void> {
  const currentNetwork = await detectNetwork();

  if (currentNetwork !== expectedNetwork) {
    throw new NetworkMismatchError(
      `Please switch to ${expectedNetwork} in your Lace wallet`,
      currentNetwork,
      expectedNetwork
    );
  }
}

class NetworkMismatchError extends Error {
  constructor(
    message: string,
    public readonly currentNetwork: NetworkType,
    public readonly expectedNetwork: NetworkType
  ) {
    super(message);
    this.name = 'NetworkMismatchError';
  }
}
```

## Best Practices

1. **Validate network early** - Check network on connection before allowing transactions
2. **Show network indicator** - Always show which network the user is connected to
3. **Handle network changes** - Refresh state when network changes
4. **Use environment configs** - Different settings for dev/staging/production
5. **Clear cache on network change** - Cached state from one network is invalid on another
6. **Warn on testnet in production** - Don't allow testnet connections in production builds
