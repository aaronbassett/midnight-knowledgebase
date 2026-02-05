/**
 * ConnectButton - Wallet connection button component for Midnight DApps
 *
 * Provides a simple button to connect Lace wallet with proper loading
 * and error states.
 */

import React from 'react';
import { useMidnightWallet, ConnectionState } from './useMidnightWallet';

interface ConnectButtonProps {
  /** Custom class name for styling */
  className?: string;
  /** Called after successful connection */
  onConnect?: (address: string) => void;
  /** Called after disconnection */
  onDisconnect?: () => void;
}

export function ConnectButton({
  className = '',
  onConnect,
  onDisconnect,
}: ConnectButtonProps): JSX.Element {
  const {
    state,
    address,
    error,
    connect,
    disconnect,
  } = useMidnightWallet();

  const handleConnect = async () => {
    const result = await connect();
    if (result.success && result.address) {
      onConnect?.(result.address);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    onDisconnect?.();
  };

  // Wallet not installed
  if (state === ConnectionState.NotInstalled) {
    return (
      <a
        href="https://www.lace.io"
        target="_blank"
        rel="noopener noreferrer"
        className={`connect-button install ${className}`}
      >
        Install Lace Wallet
      </a>
    );
  }

  // Currently connecting
  if (state === ConnectionState.Connecting) {
    return (
      <button
        className={`connect-button connecting ${className}`}
        disabled
      >
        <span className="spinner" />
        Connecting...
      </button>
    );
  }

  // Connected - show address and disconnect option
  if (state === ConnectionState.Connected && address) {
    return (
      <div className={`connect-button connected ${className}`}>
        <span className="address" title={address}>
          {formatAddress(address)}
        </span>
        <button
          onClick={handleDisconnect}
          className="disconnect-btn"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Error state
  if (state === ConnectionState.Error && error) {
    return (
      <div className={`connect-button error ${className}`}>
        <span className="error-message">{error.message}</span>
        <button onClick={handleConnect}>
          Try Again
        </button>
      </div>
    );
  }

  // Default: Not connected
  return (
    <button
      onClick={handleConnect}
      className={`connect-button ${className}`}
    >
      Connect Wallet
    </button>
  );
}

/**
 * Format Bech32m address for display
 */
function formatAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 12)}...${address.slice(-8)}`;
}

// =============================================================================
// Styles (inline for portability - use CSS modules in production)
// =============================================================================

export const connectButtonStyles = `
.connect-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.connect-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.connect-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.connect-button.install {
  background: #6366f1;
  color: white;
  text-decoration: none;
}

.connect-button.connecting {
  background: #e5e7eb;
  color: #374151;
}

.connect-button.connected {
  background: #10b981;
  color: white;
}

.connect-button.error {
  background: #fee2e2;
  color: #991b1b;
  flex-direction: column;
  gap: 4px;
}

.connect-button .address {
  font-family: monospace;
  font-size: 13px;
}

.connect-button .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #9ca3af;
  border-top-color: #374151;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.disconnect-btn {
  margin-left: 8px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 4px;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.disconnect-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}
`;
