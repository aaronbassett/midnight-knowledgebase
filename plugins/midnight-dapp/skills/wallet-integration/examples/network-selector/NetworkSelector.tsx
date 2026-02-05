/**
 * NetworkSelector - Display and inform about network configuration
 *
 * Shows current network status and provides guidance for switching
 * networks (done in Lace wallet, not programmatically).
 */

import React from 'react';
import { useNetwork, NetworkType, NetworkConfig } from './useNetwork';

interface NetworkSelectorProps {
  /** Expected network for this app */
  expectedNetwork?: NetworkType;
  /** Custom class name */
  className?: string;
  /** Called when network mismatch detected */
  onNetworkMismatch?: (current: NetworkType, expected: NetworkType) => void;
}

export function NetworkSelector({
  expectedNetwork,
  className = '',
  onNetworkMismatch,
}: NetworkSelectorProps): JSX.Element {
  const {
    network,
    config,
    isConnected,
    isLoading,
    isMismatch,
  } = useNetwork({
    expectedNetwork,
    onMismatch: onNetworkMismatch,
  });

  if (isLoading) {
    return (
      <div className={`network-selector loading ${className}`}>
        <div className="skeleton" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={`network-selector disconnected ${className}`}>
        <span className="status-dot offline" />
        <span className="label">Not Connected</span>
      </div>
    );
  }

  return (
    <div className={`network-selector ${network} ${isMismatch ? 'mismatch' : ''} ${className}`}>
      <NetworkStatus network={network} config={config} />
      {isMismatch && expectedNetwork && (
        <NetworkMismatchWarning
          current={network}
          expected={expectedNetwork}
        />
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface NetworkStatusProps {
  network: NetworkType;
  config: NetworkConfig | null;
}

function NetworkStatus({ network, config }: NetworkStatusProps): JSX.Element {
  const networkInfo = {
    testnet: {
      label: 'Testnet',
      description: 'Test network for development',
      icon: '🧪',
    },
    mainnet: {
      label: 'Mainnet',
      description: 'Production network',
      icon: '🌐',
    },
    unknown: {
      label: 'Unknown Network',
      description: 'Could not detect network',
      icon: '❓',
    },
  };

  const info = networkInfo[network];

  return (
    <div className="network-status">
      <span className="status-dot online" />
      <div className="network-info">
        <span className="network-icon">{info.icon}</span>
        <span className="network-label">{info.label}</span>
      </div>
      {config && (
        <div className="service-status">
          <ServiceIndicator
            label="Indexer"
            url={config.indexerUri}
          />
          <ServiceIndicator
            label="Prover"
            url={config.proverServerUri}
          />
        </div>
      )}
    </div>
  );
}

interface ServiceIndicatorProps {
  label: string;
  url: string;
}

function ServiceIndicator({ label, url }: ServiceIndicatorProps): JSX.Element {
  const shortUrl = new URL(url).hostname;

  return (
    <div className="service-indicator" title={url}>
      <span className="service-label">{label}:</span>
      <span className="service-url">{shortUrl}</span>
    </div>
  );
}

interface NetworkMismatchWarningProps {
  current: NetworkType;
  expected: NetworkType;
}

function NetworkMismatchWarning({
  current,
  expected,
}: NetworkMismatchWarningProps): JSX.Element {
  return (
    <div className="network-mismatch-warning">
      <div className="warning-icon">⚠️</div>
      <div className="warning-content">
        <p className="warning-title">Network Mismatch</p>
        <p className="warning-message">
          This app requires <strong>{expected}</strong>, but you're connected to{' '}
          <strong>{current}</strong>.
        </p>
        <p className="warning-instruction">
          Please switch networks in your Lace wallet settings.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================

export const networkSelectorStyles = `
.network-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.network-selector.loading .skeleton {
  width: 120px;
  height: 24px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.network-selector.mismatch {
  border-color: #fbbf24;
  background: #fffbeb;
}

.network-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.status-dot.offline {
  background: #6b7280;
}

.network-info {
  display: flex;
  align-items: center;
  gap: 4px;
}

.network-icon {
  font-size: 14px;
}

.network-label {
  font-weight: 500;
  color: #111827;
}

.service-status {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

.service-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #6b7280;
}

.service-label {
  font-weight: 500;
}

.service-url {
  font-family: monospace;
}

.network-mismatch-warning {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 6px;
}

.warning-icon {
  font-size: 24px;
  line-height: 1;
}

.warning-content {
  flex: 1;
}

.warning-title {
  margin: 0 0 4px;
  font-weight: 600;
  color: #92400e;
}

.warning-message {
  margin: 0 0 4px;
  font-size: 13px;
  color: #78350f;
}

.warning-instruction {
  margin: 0;
  font-size: 12px;
  color: #92400e;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;
