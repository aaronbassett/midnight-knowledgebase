/**
 * useNetwork - React hook for network state and configuration
 *
 * Monitors network configuration and detects mismatches between
 * the current network and expected network.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type NetworkType = 'testnet' | 'mainnet' | 'unknown';

export interface NetworkConfig {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
}

export interface NetworkState {
  network: NetworkType;
  config: NetworkConfig | null;
  isConnected: boolean;
  isLoading: boolean;
  isMismatch: boolean;
}

export interface UseNetworkOptions {
  /** Expected network - triggers mismatch detection */
  expectedNetwork?: NetworkType;
  /** Called when network doesn't match expected */
  onMismatch?: (current: NetworkType, expected: NetworkType) => void;
  /** Called when network changes */
  onNetworkChange?: (network: NetworkType) => void;
  /** Polling interval in ms (default: 10000) */
  pollInterval?: number;
}

export interface UseNetworkReturn extends NetworkState {
  /** Check if network matches expected */
  isCorrectNetwork: () => boolean;
  /** Force refresh network state */
  refresh: () => Promise<void>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useNetwork(options: UseNetworkOptions = {}): UseNetworkReturn {
  const {
    expectedNetwork,
    onMismatch,
    onNetworkChange,
    pollInterval = 10000,
  } = options;

  const [state, setState] = useState<NetworkState>({
    network: 'unknown',
    config: null,
    isConnected: false,
    isLoading: true,
    isMismatch: false,
  });

  const lastNetworkRef = useRef<NetworkType>('unknown');

  const refresh = useCallback(async () => {
    const wallet = window.midnight?.mnLace;

    if (!wallet) {
      setState(s => ({
        ...s,
        isLoading: false,
        isConnected: false,
        isMismatch: false,
      }));
      return;
    }

    try {
      const uris = await wallet.serviceUriConfig();
      const network = detectNetworkFromUri(uris.indexerUri);

      // Detect network change
      if (lastNetworkRef.current !== 'unknown' && lastNetworkRef.current !== network) {
        onNetworkChange?.(network);
      }
      lastNetworkRef.current = network;

      // Check for mismatch
      const isMismatch = expectedNetwork !== undefined && network !== expectedNetwork;
      if (isMismatch && expectedNetwork) {
        onMismatch?.(network, expectedNetwork);
      }

      const isEnabled = await wallet.isEnabled();

      setState({
        network,
        config: uris,
        isConnected: isEnabled,
        isLoading: false,
        isMismatch,
      });
    } catch {
      setState(s => ({
        ...s,
        isLoading: false,
        isConnected: false,
      }));
    }
  }, [expectedNetwork, onMismatch, onNetworkChange]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling for changes
  useEffect(() => {
    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval, refresh]);

  const isCorrectNetwork = useCallback(() => {
    if (!expectedNetwork) return true;
    return state.network === expectedNetwork;
  }, [expectedNetwork, state.network]);

  return {
    ...state,
    isCorrectNetwork,
    refresh,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Detect network type from indexer URI
 */
function detectNetworkFromUri(indexerUri: string): NetworkType {
  const uri = indexerUri.toLowerCase();

  if (uri.includes('testnet')) {
    return 'testnet';
  }

  // If not testnet and looks like a valid URI, assume mainnet
  if (uri.includes('midnight') && !uri.includes('testnet')) {
    return 'mainnet';
  }

  return 'unknown';
}

/**
 * Get network display name
 */
export function getNetworkDisplayName(network: NetworkType): string {
  const names: Record<NetworkType, string> = {
    testnet: 'Midnight Testnet',
    mainnet: 'Midnight Mainnet',
    unknown: 'Unknown Network',
  };
  return names[network];
}

/**
 * Get network color for UI
 */
export function getNetworkColor(network: NetworkType): string {
  const colors: Record<NetworkType, string> = {
    testnet: '#f59e0b', // Amber
    mainnet: '#10b981', // Emerald
    unknown: '#6b7280', // Gray
  };
  return colors[network];
}

/**
 * Check if network is production
 */
export function isProductionNetwork(network: NetworkType): boolean {
  return network === 'mainnet';
}

/**
 * Validate network configuration
 */
export function validateNetworkConfig(config: NetworkConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.indexerUri) {
    errors.push('Missing indexer URI');
  } else if (!isValidUrl(config.indexerUri)) {
    errors.push('Invalid indexer URI');
  }

  if (!config.indexerWsUri) {
    errors.push('Missing indexer WebSocket URI');
  } else if (!config.indexerWsUri.startsWith('ws')) {
    errors.push('Invalid indexer WebSocket URI (must start with ws:// or wss://)');
  }

  if (!config.proverServerUri) {
    errors.push('Missing prover server URI');
  } else if (!isValidUrl(config.proverServerUri)) {
    errors.push('Invalid prover server URI');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Simple URL validation
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
