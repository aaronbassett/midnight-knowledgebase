/**
 * useAccounts - React hook for account and network state
 *
 * Monitors the connected wallet account and network, detecting changes
 * via polling since Lace doesn't emit events.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type NetworkType = 'testnet' | 'mainnet' | 'unknown';

export interface AccountState {
  address: string | null;
  coinPublicKey: string | null;
  encryptionPublicKey: string | null;
  network: NetworkType;
  isConnected: boolean;
  isLoading: boolean;
}

export interface UseAccountsOptions {
  /** Called when account address changes */
  onAccountChange?: (address: string) => void;
  /** Called when network changes */
  onNetworkChange?: (network: NetworkType) => void;
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
}

export interface UseAccountsReturn extends AccountState {
  /** Force refresh account state */
  refresh: () => Promise<void>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAccounts(options: UseAccountsOptions = {}): UseAccountsReturn {
  const {
    onAccountChange,
    onNetworkChange,
    pollInterval = 5000,
  } = options;

  const [state, setState] = useState<AccountState>({
    address: null,
    coinPublicKey: null,
    encryptionPublicKey: null,
    network: 'unknown',
    isConnected: false,
    isLoading: true,
  });

  const lastAddressRef = useRef<string | null>(null);
  const lastNetworkRef = useRef<NetworkType>('unknown');

  const refresh = useCallback(async () => {
    const wallet = window.midnight?.mnLace;
    if (!wallet) {
      setState(s => ({ ...s, isLoading: false, isConnected: false }));
      return;
    }

    try {
      if (!(await wallet.isEnabled())) {
        setState(s => ({ ...s, isLoading: false, isConnected: false }));
        return;
      }

      const api = await wallet.enable();
      const walletState = await api.state();
      const uris = await wallet.serviceUriConfig();
      const network = detectNetwork(uris.indexerUri);

      // Detect account change
      if (lastAddressRef.current && lastAddressRef.current !== walletState.address) {
        onAccountChange?.(walletState.address);
      }
      lastAddressRef.current = walletState.address;

      // Detect network change
      if (lastNetworkRef.current !== 'unknown' && lastNetworkRef.current !== network) {
        onNetworkChange?.(network);
      }
      lastNetworkRef.current = network;

      setState({
        address: walletState.address,
        coinPublicKey: walletState.coinPublicKey,
        encryptionPublicKey: walletState.encryptionPublicKey,
        network,
        isConnected: true,
        isLoading: false,
      });
    } catch {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, [onAccountChange, onNetworkChange]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling for changes
  useEffect(() => {
    if (!state.isConnected) return;

    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [state.isConnected, pollInterval, refresh]);

  return {
    ...state,
    refresh,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Detect network type from indexer URI
 */
function detectNetwork(indexerUri: string): NetworkType {
  if (indexerUri.includes('testnet')) {
    return 'testnet';
  }
  if (indexerUri.includes('mainnet') || !indexerUri.includes('testnet')) {
    return 'mainnet';
  }
  return 'unknown';
}

/**
 * Format Bech32m address for display
 */
export function formatAddress(address: string, options: {
  prefixLength?: number;
  suffixLength?: number;
} = {}): string {
  const { prefixLength = 12, suffixLength = 8 } = options;

  if (address.length <= prefixLength + suffixLength + 3) {
    return address;
  }

  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

/**
 * Get network type from address prefix
 */
export function getNetworkFromAddress(address: string): NetworkType {
  if (address.startsWith('addr_test1')) {
    return 'testnet';
  }
  if (address.startsWith('addr1')) {
    return 'mainnet';
  }
  return 'unknown';
}

/**
 * Validate Bech32m address format
 */
export function isValidAddress(address: string): boolean {
  // Check prefix
  if (!address.startsWith('addr_test1') && !address.startsWith('addr1')) {
    return false;
  }

  // Check length (typical Midnight address)
  if (address.length < 50 || address.length > 120) {
    return false;
  }

  // Check characters (Bech32m lowercase alphanumeric)
  const dataPart = address.includes('1')
    ? address.split('1').slice(1).join('1')
    : '';

  return /^[a-z0-9]+$/.test(dataPart);
}

/**
 * Compare two addresses for equality
 */
export function addressesEqual(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return a.toLowerCase() === b.toLowerCase();
}
