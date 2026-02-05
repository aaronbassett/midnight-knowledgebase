/**
 * useMidnightWallet - React hook for Lace wallet connection
 *
 * Manages wallet connection state, handles errors, and provides
 * methods for connecting and disconnecting.
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export enum ConnectionState {
  /** Wallet extension not installed */
  NotInstalled = 'NOT_INSTALLED',
  /** Not connected, ready to connect */
  Disconnected = 'DISCONNECTED',
  /** Connection in progress */
  Connecting = 'CONNECTING',
  /** Successfully connected */
  Connected = 'CONNECTED',
  /** Connection error occurred */
  Error = 'ERROR',
}

export interface WalletState {
  address: string;
  coinPublicKey: string;
  encryptionPublicKey: string;
}

export interface ServiceURIs {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
}

export interface ConnectResult {
  success: boolean;
  address?: string;
  error?: Error;
}

export interface UseMidnightWalletReturn {
  state: ConnectionState;
  address: string | null;
  walletState: WalletState | null;
  serviceURIs: ServiceURIs | null;
  error: Error | null;
  connect: () => Promise<ConnectResult>;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

// =============================================================================
// Type declarations for window.midnight
// =============================================================================

interface DAppConnectorWalletAPI {
  state(): Promise<WalletState>;
  balanceAndProveTransaction(tx: unknown, newCoins: unknown): Promise<unknown>;
  submitTransaction(tx: unknown): Promise<string>;
}

interface DAppConnectorAPI {
  enable(): Promise<DAppConnectorWalletAPI>;
  isEnabled(): Promise<boolean>;
  readonly apiVersion: string;
  readonly name: string;
  serviceUriConfig(): Promise<ServiceURIs>;
}

declare global {
  interface Window {
    midnight?: {
      mnLace?: DAppConnectorAPI;
    };
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useMidnightWallet(): UseMidnightWalletReturn {
  const [state, setState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [address, setAddress] = useState<string | null>(null);
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [serviceURIs, setServiceURIs] = useState<ServiceURIs | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [walletAPI, setWalletAPI] = useState<DAppConnectorWalletAPI | null>(null);

  // Check wallet availability on mount
  useEffect(() => {
    const checkWallet = async () => {
      const wallet = window.midnight?.mnLace;

      if (!wallet) {
        setState(ConnectionState.NotInstalled);
        return;
      }

      // Check for existing connection
      try {
        if (await wallet.isEnabled()) {
          // Restore previous connection
          const api = await wallet.enable();
          const state = await api.state();
          const uris = await wallet.serviceUriConfig();

          setWalletAPI(api);
          setWalletState(state);
          setAddress(state.address);
          setServiceURIs(uris);
          setState(ConnectionState.Connected);
        } else {
          setState(ConnectionState.Disconnected);
        }
      } catch (e) {
        setState(ConnectionState.Disconnected);
      }
    };

    checkWallet();
  }, []);

  // Connect to wallet
  const connect = useCallback(async (): Promise<ConnectResult> => {
    const wallet = window.midnight?.mnLace;

    if (!wallet) {
      setState(ConnectionState.NotInstalled);
      return {
        success: false,
        error: new Error('Lace wallet not installed'),
      };
    }

    setState(ConnectionState.Connecting);
    setError(null);

    try {
      // Request wallet authorization
      const api = await wallet.enable();
      const state = await api.state();
      const uris = await wallet.serviceUriConfig();

      setWalletAPI(api);
      setWalletState(state);
      setAddress(state.address);
      setServiceURIs(uris);
      setState(ConnectionState.Connected);

      return {
        success: true,
        address: state.address,
      };
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Connection failed');
      setError(err);
      setState(ConnectionState.Error);

      return {
        success: false,
        error: err,
      };
    }
  }, []);

  // Disconnect from wallet
  const disconnect = useCallback(() => {
    setWalletAPI(null);
    setWalletState(null);
    setAddress(null);
    setServiceURIs(null);
    setError(null);
    setState(ConnectionState.Disconnected);
  }, []);

  // Refresh wallet state
  const refresh = useCallback(async () => {
    if (!walletAPI) return;

    try {
      const state = await walletAPI.state();
      setWalletState(state);
      setAddress(state.address);
    } catch (e) {
      // If refresh fails, wallet may have been disconnected
      disconnect();
    }
  }, [walletAPI, disconnect]);

  return {
    state,
    address,
    walletState,
    serviceURIs,
    error,
    connect,
    disconnect,
    refresh,
  };
}

// =============================================================================
// Utility exports
// =============================================================================

/**
 * Get wallet instance without React hook
 */
export function getWallet(): DAppConnectorAPI | null {
  return window.midnight?.mnLace ?? null;
}

/**
 * Check if wallet is installed
 */
export function isWalletInstalled(): boolean {
  return !!window.midnight?.mnLace;
}
