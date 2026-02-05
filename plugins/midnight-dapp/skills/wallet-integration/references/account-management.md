# Account Management

Managing multiple accounts and displaying addresses in Midnight DApps.

## Overview

Lace wallet can manage multiple accounts. Your DApp needs to handle account display, selection (when supported), and address formatting for the Bech32m format used by Midnight.

## Wallet State

After connection, retrieve account information:

```typescript
interface WalletState {
  address: string;            // Bech32m address (e.g., "addr_test1qz...")
  coinPublicKey: string;      // Public key for coin operations
  encryptionPublicKey: string; // Public key for encrypted communication
}

async function getAccountInfo(api: DAppConnectorWalletAPI): Promise<WalletState> {
  return await api.state();
}
```

## Address Format

### Bech32m Addresses

Midnight uses Bech32m encoding for addresses:

```
addr_test1qz7yk...xyz  (testnet)
addr1qz7yk...xyz       (mainnet)
```

**Structure:**
- Prefix: `addr_test1` (testnet) or `addr1` (mainnet)
- Separator: Always `1`
- Data: Encoded address bytes
- Checksum: Last 6 characters

### Address Display

Full addresses are long (~60 characters). Truncate for display:

```typescript
function formatAddress(address: string, prefixLen = 12, suffixLen = 8): string {
  if (address.length <= prefixLen + suffixLen + 3) {
    return address;
  }
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}

// Examples:
// "addr_test1qz7...xyz89ab" (truncated)
// "addr_test1qz" (short enough, not truncated)
```

### Address Validation

Validate Bech32m addresses:

```typescript
function isValidAddress(address: string): boolean {
  // Basic format check
  if (!address.startsWith('addr_test1') && !address.startsWith('addr1')) {
    return false;
  }

  // Length check (typical Midnight address length)
  if (address.length < 50 || address.length > 120) {
    return false;
  }

  // Valid Bech32m characters
  const bech32mChars = /^[a-z0-9]+$/;
  const dataPart = address.includes('1')
    ? address.split('1').slice(1).join('1')
    : '';

  return bech32mChars.test(dataPart);
}
```

## Account Display Component

React component for showing account info:

```typescript
interface AccountDisplayProps {
  address: string;
  isConnected: boolean;
  onDisconnect?: () => void;
}

function AccountDisplay({ address, isConnected, onDisconnect }: AccountDisplayProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="account-display">
      <span className="address" onClick={copyAddress}>
        {formatAddress(address)}
      </span>
      {copied && <span className="copied-tooltip">Copied!</span>}
      {onDisconnect && (
        <button onClick={onDisconnect}>Disconnect</button>
      )}
    </div>
  );
}
```

## Account State Hook

React hook for managing account state:

```typescript
interface AccountState {
  address: string | null;
  coinPublicKey: string | null;
  encryptionPublicKey: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
}

function useAccount(): AccountState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<AccountState>({
    address: null,
    coinPublicKey: null,
    encryptionPublicKey: null,
    isConnected: false,
    isLoading: true,
    error: null,
  });

  const refresh = async () => {
    try {
      setState(s => ({ ...s, isLoading: true, error: null }));

      const wallet = window.midnight?.mnLace;
      if (!wallet) {
        setState(s => ({ ...s, isLoading: false, isConnected: false }));
        return;
      }

      if (!(await wallet.isEnabled())) {
        setState(s => ({ ...s, isLoading: false, isConnected: false }));
        return;
      }

      const api = await wallet.enable();
      const walletState = await api.state();

      setState({
        address: walletState.address,
        coinPublicKey: walletState.coinPublicKey,
        encryptionPublicKey: walletState.encryptionPublicKey,
        isConnected: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: error as Error,
      }));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { ...state, refresh };
}
```

## Multiple Accounts

### Current Limitations

The Lace DApp Connector API currently returns a single account. Account switching is done within the Lace wallet UI, not through the DApp Connector API.

### Detecting Account Changes

When the user switches accounts in Lace, your DApp should detect this:

```typescript
function useAccountChangeDetection(onAccountChange: (newAddress: string) => void) {
  const lastAddressRef = useRef<string | null>(null);

  useEffect(() => {
    const checkForChange = async () => {
      const wallet = window.midnight?.mnLace;
      if (!wallet || !(await wallet.isEnabled())) return;

      const api = await wallet.enable();
      const state = await api.state();

      if (lastAddressRef.current && lastAddressRef.current !== state.address) {
        onAccountChange(state.address);
      }
      lastAddressRef.current = state.address;
    };

    // Poll for changes (no event API currently available)
    const interval = setInterval(checkForChange, 5000);
    return () => clearInterval(interval);
  }, [onAccountChange]);
}
```

### Future API

When multi-account selection is available:

```typescript
// Potential future API (not yet available)
interface MultiAccountAPI {
  accounts(): Promise<WalletState[]>;
  selectAccount(address: string): Promise<void>;
  onAccountChange(callback: (address: string) => void): void;
}
```

## Public Key Usage

### Coin Public Key

Used for transaction operations:

```typescript
const walletState = await api.state();

// Used when setting up wallet provider
const walletProvider = {
  coinPublicKey: walletState.coinPublicKey,
  // ... other provider config
};
```

### Encryption Public Key

Used for encrypted communication:

```typescript
const walletState = await api.state();

// Can be used for end-to-end encryption with other users
const recipientEncryptionKey = walletState.encryptionPublicKey;
```

## Best Practices

1. **Cache wallet state** - Don't call `state()` on every render
2. **Show loading states** - State retrieval is async
3. **Handle disconnection** - Clear cached state when user disconnects
4. **Validate addresses** - Before displaying or using addresses
5. **Provide copy functionality** - Long addresses are hard to manually copy
6. **Show network context** - Indicate testnet vs mainnet addresses
