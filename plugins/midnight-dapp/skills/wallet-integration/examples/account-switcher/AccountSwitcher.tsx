/**
 * AccountSwitcher - Display and manage wallet account information
 *
 * Shows connected account with copy functionality and network indicator.
 * Detects account changes via polling (Lace doesn't emit events).
 */

import React, { useState } from 'react';
import { useAccounts, formatAddress, NetworkType } from './useAccounts';

interface AccountSwitcherProps {
  /** Custom class name */
  className?: string;
  /** Called when account changes */
  onAccountChange?: (address: string) => void;
  /** Show network indicator */
  showNetwork?: boolean;
}

export function AccountSwitcher({
  className = '',
  onAccountChange,
  showNetwork = true,
}: AccountSwitcherProps): JSX.Element | null {
  const {
    address,
    network,
    isConnected,
    isLoading,
  } = useAccounts({ onAccountChange });

  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className={`account-switcher loading ${className}`}>
        <span className="skeleton" />
      </div>
    );
  }

  if (!isConnected || !address) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className={`account-switcher ${className}`}>
      {showNetwork && (
        <NetworkBadge network={network} />
      )}

      <button
        className="address-button"
        onClick={handleCopy}
        title={`Click to copy: ${address}`}
      >
        <AccountIcon address={address} />
        <span className="address-text">
          {formatAddress(address)}
        </span>
        {copied && <span className="copied-toast">Copied!</span>}
      </button>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface NetworkBadgeProps {
  network: NetworkType;
}

function NetworkBadge({ network }: NetworkBadgeProps): JSX.Element {
  const config = {
    testnet: { label: 'Testnet', className: 'testnet' },
    mainnet: { label: 'Mainnet', className: 'mainnet' },
    unknown: { label: 'Unknown', className: 'unknown' },
  };

  const { label, className } = config[network];

  return (
    <span className={`network-badge ${className}`}>
      {label}
    </span>
  );
}

interface AccountIconProps {
  address: string;
}

function AccountIcon({ address }: AccountIconProps): JSX.Element {
  // Generate a simple identicon-style color from address
  const hash = address.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  const hue = Math.abs(hash) % 360;
  const backgroundColor = `hsl(${hue}, 70%, 60%)`;

  return (
    <div
      className="account-icon"
      style={{ backgroundColor }}
    >
      {address.slice(-2).toUpperCase()}
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================

export const accountSwitcherStyles = `
.account-switcher {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.account-switcher.loading .skeleton {
  width: 160px;
  height: 36px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.network-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.network-badge.testnet {
  background: #fef3c7;
  color: #92400e;
}

.network-badge.mainnet {
  background: #d1fae5;
  color: #065f46;
}

.network-badge.unknown {
  background: #e5e7eb;
  color: #4b5563;
}

.address-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.address-button:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.account-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: white;
}

.address-text {
  font-family: monospace;
  font-size: 13px;
  color: #374151;
}

.copied-toast {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: #1f2937;
  color: white;
  font-size: 11px;
  border-radius: 4px;
  white-space: nowrap;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`;
