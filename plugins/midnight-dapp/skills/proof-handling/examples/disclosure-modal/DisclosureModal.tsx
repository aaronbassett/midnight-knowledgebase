/**
 * DisclosureModal - React component for privacy disclosure consent
 *
 * Shows users what data will be revealed when executing a transaction,
 * with risk assessment and clear consent flow.
 */

import React, { useState, useMemo } from "react";
import {
  type Disclosure,
  type DisclosureSummary,
  type DisclosureRiskLevel,
  summarizeDisclosures,
  assessDisclosureRisk,
  formatDisclosureValue,
  getDisclosureIcon,
  getRiskColor,
  type FullDisclosure,
} from "./disclosureTypes";

// =============================================================================
// Types
// =============================================================================

interface DisclosureModalProps {
  /** Disclosures to display */
  disclosures: Disclosure[];

  /** Transaction type description */
  transactionType: string;

  /** Called when user confirms */
  onConfirm: () => void;

  /** Called when user cancels */
  onCancel: () => void;

  /** Whether the modal is open */
  isOpen: boolean;

  /** Custom class name */
  className?: string;

  /** Show detailed risk information */
  showRiskDetails?: boolean;
}

interface DisclosureItemProps {
  disclosure: Disclosure;
  showRisk?: boolean;
}

interface RiskBadgeProps {
  level: DisclosureRiskLevel;
  className?: string;
}

interface PrivacySummaryProps {
  summary: DisclosureSummary;
}

// =============================================================================
// Risk Badge Component
// =============================================================================

export function RiskBadge({ level, className = "" }: RiskBadgeProps): JSX.Element {
  const labels: Record<DisclosureRiskLevel, string> = {
    low: "Low Risk",
    medium: "Medium Risk",
    high: "High Risk",
    critical: "Critical",
  };

  return (
    <span
      className={`risk-badge risk-${level} ${className}`}
      style={{ backgroundColor: getRiskColor(level) }}
    >
      {labels[level]}
    </span>
  );
}

// =============================================================================
// Disclosure Item Component
// =============================================================================

export function DisclosureItem({
  disclosure,
  showRisk = true,
}: DisclosureItemProps): JSX.Element {
  const risk = useMemo(() => assessDisclosureRisk(disclosure), [disclosure]);
  const icon = getDisclosureIcon(disclosure.type);

  return (
    <li className={`disclosure-item type-${disclosure.type}`}>
      <div className="disclosure-header">
        <span className={`disclosure-icon icon-${icon}`} />
        <span className="disclosure-label">{disclosure.label}</span>
        {showRisk && <RiskBadge level={risk.level} />}
      </div>

      <div className="disclosure-content">
        {/* Type-specific content */}
        {disclosure.type === "full" && (
          <div className="disclosure-value">
            <span className="value-label">Value:</span>
            <span className="value-data">
              {formatDisclosureValue(disclosure as FullDisclosure)}
            </span>
          </div>
        )}

        {disclosure.type === "range" && (
          <div className="disclosure-condition">
            <span className="condition-label">Reveals:</span>
            <span className="condition-data">{disclosure.condition}</span>
          </div>
        )}

        {disclosure.type === "membership" && (
          <div className="disclosure-set">
            <span className="set-label">Set:</span>
            <span className="set-data">{disclosure.setName}</span>
            {disclosure.setSize && (
              <span className="set-size">({disclosure.setSize} members)</span>
            )}
          </div>
        )}

        <p className="disclosure-description">{disclosure.description}</p>

        {/* Risk factors */}
        {showRisk && risk.factors.length > 0 && (
          <details className="risk-details">
            <summary>Risk factors</summary>
            <ul className="risk-factors">
              {risk.factors.map((factor, i) => (
                <li key={i}>{factor}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

// =============================================================================
// Privacy Summary Component
// =============================================================================

export function PrivacySummary({ summary }: PrivacySummaryProps): JSX.Element {
  const privacyConfig = {
    private: {
      icon: "lock",
      label: "Fully Private",
      description: "No information will be disclosed",
      color: "#10b981",
    },
    partial: {
      icon: "lock-open",
      label: "Partial Disclosure",
      description: "Some information will be visible",
      color: "#f59e0b",
    },
    public: {
      icon: "eye",
      label: "Public Data",
      description: "Exact values will be disclosed",
      color: "#ef4444",
    },
  };

  const config = privacyConfig[summary.privacyLevel];

  return (
    <div
      className="privacy-summary"
      style={{ borderColor: config.color }}
    >
      <div className="privacy-header">
        <span className={`privacy-icon icon-${config.icon}`} />
        <span className="privacy-label">{config.label}</span>
        <RiskBadge level={summary.maxRiskLevel} />
      </div>

      <p className="privacy-description">{config.description}</p>

      {summary.disclosures.length > 0 && (
        <div className="disclosure-counts">
          {summary.counts.full > 0 && (
            <span className="count-badge count-full">
              {summary.counts.full} full disclosure{summary.counts.full > 1 ? "s" : ""}
            </span>
          )}
          {summary.counts.range > 0 && (
            <span className="count-badge count-range">
              {summary.counts.range} range proof{summary.counts.range > 1 ? "s" : ""}
            </span>
          )}
          {summary.counts.membership > 0 && (
            <span className="count-badge count-membership">
              {summary.counts.membership} membership proof{summary.counts.membership > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Modal Component
// =============================================================================

export function DisclosureModal({
  disclosures,
  transactionType,
  onConfirm,
  onCancel,
  isOpen,
  className = "",
  showRiskDetails = true,
}: DisclosureModalProps): JSX.Element | null {
  const [acknowledged, setAcknowledged] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState(false);

  const summary = useMemo(
    () => summarizeDisclosures(disclosures),
    [disclosures]
  );

  // Reset acknowledgment when disclosures change
  React.useEffect(() => {
    setAcknowledged(false);
  }, [disclosures]);

  if (!isOpen) return null;

  const hasHighRisk =
    summary.maxRiskLevel === "high" || summary.maxRiskLevel === "critical";

  return (
    <div className={`disclosure-modal-overlay ${className}`}>
      <div className="disclosure-modal">
        {/* Header */}
        <div className="modal-header">
          <h2>Review Privacy Disclosure</h2>
          <button
            className="close-button"
            onClick={onCancel}
            aria-label="Close"
          >
            x
          </button>
        </div>

        {/* Privacy Summary */}
        <PrivacySummary summary={summary} />

        {/* Transaction Info */}
        <div className="transaction-info">
          <p>
            This <strong>{transactionType}</strong> transaction will disclose
            the following information on the blockchain:
          </p>
        </div>

        {/* No Disclosures */}
        {disclosures.length === 0 && (
          <div className="no-disclosures">
            <span className="check-icon">check</span>
            <p>This transaction does not disclose any private information.</p>
          </div>
        )}

        {/* Disclosure List */}
        {disclosures.length > 0 && (
          <ul className="disclosure-list">
            {disclosures.map((disclosure) => (
              <DisclosureItem
                key={disclosure.id}
                disclosure={disclosure}
                showRisk={showRiskDetails}
              />
            ))}
          </ul>
        )}

        {/* Warning for High Risk */}
        {hasHighRisk && (
          <div className="high-risk-warning">
            <span className="warning-icon">!</span>
            <div className="warning-content">
              <strong>High Risk Disclosure</strong>
              <p>
                This transaction reveals sensitive information that will be
                permanently visible on the blockchain. This cannot be undone.
              </p>
            </div>
          </div>
        )}

        {/* Educational Content */}
        <details
          className="learn-more"
          open={expandedDetails}
          onToggle={(e) => setExpandedDetails((e.target as HTMLDetailsElement).open)}
        >
          <summary>Learn more about privacy disclosures</summary>
          <div className="learn-content">
            <h4>What is disclosure?</h4>
            <p>
              In zero-knowledge transactions, most data stays private. However,
              some operations require revealing specific information. This is
              called "disclosure."
            </p>

            <h4>Types of disclosure:</h4>
            <ul>
              <li>
                <strong>Full disclosure</strong> - The exact value is visible
                (e.g., your balance is 1000)
              </li>
              <li>
                <strong>Range proof</strong> - A condition is verified without
                revealing the exact value (e.g., age is over 18)
              </li>
              <li>
                <strong>Membership proof</strong> - You prove you belong to a
                group without revealing which member you are
              </li>
            </ul>

            <h4>Is this permanent?</h4>
            <p>
              Yes. Once disclosed, information is permanently recorded on the
              blockchain and cannot be removed or hidden.
            </p>
          </div>
        </details>

        {/* Acknowledgment */}
        {summary.requiresConsent && (
          <label className="acknowledgment">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              I understand that this information will be permanently visible on
              the blockchain
            </span>
          </label>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button
            className="cancel-button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="confirm-button"
            onClick={onConfirm}
            disabled={summary.requiresConsent && !acknowledged}
          >
            {summary.privacyLevel === "private"
              ? "Proceed"
              : "I Accept - Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Hook for Managing Disclosure Flow
// =============================================================================

interface UseDisclosureFlowReturn {
  /** Current disclosures to show */
  disclosures: Disclosure[];

  /** Whether modal is open */
  isOpen: boolean;

  /** Set disclosures and open modal */
  showDisclosures: (disclosures: Disclosure[]) => Promise<boolean>;

  /** Close modal without confirming */
  cancel: () => void;
}

export function useDisclosureFlow(): UseDisclosureFlowReturn {
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [resolvePromise, setResolvePromise] = useState<((confirmed: boolean) => void) | null>(null);

  const showDisclosures = (newDisclosures: Disclosure[]): Promise<boolean> => {
    return new Promise((resolve) => {
      setDisclosures(newDisclosures);
      setIsOpen(true);
      setResolvePromise(() => resolve);
    });
  };

  const confirm = () => {
    setIsOpen(false);
    resolvePromise?.(true);
    setResolvePromise(null);
  };

  const cancel = () => {
    setIsOpen(false);
    resolvePromise?.(false);
    setResolvePromise(null);
  };

  return {
    disclosures,
    isOpen,
    showDisclosures,
    cancel,
  };
}

// =============================================================================
// Styles (inline for portability - use CSS modules in production)
// =============================================================================

export const disclosureModalStyles = `
/* Modal Overlay */
.disclosure-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

/* Modal Container */
.disclosure-modal {
  background: white;
  border-radius: 12px;
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

/* Header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}

.close-button {
  width: 32px;
  height: 32px;
  border: none;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  color: #6b7280;
}

.close-button:hover {
  background: #e5e7eb;
}

/* Privacy Summary */
.privacy-summary {
  margin: 20px 24px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border-left: 4px solid;
}

.privacy-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.privacy-label {
  font-weight: 600;
  font-size: 16px;
  flex: 1;
}

.privacy-description {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.disclosure-counts {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.count-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.count-full { background: #fee2e2; color: #991b1b; }
.count-range { background: #fef3c7; color: #92400e; }
.count-membership { background: #dbeafe; color: #1d4ed8; }

/* Transaction Info */
.transaction-info {
  padding: 0 24px;
  color: #374151;
}

/* No Disclosures */
.no-disclosures {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  background: #d1fae5;
  margin: 16px 24px;
  border-radius: 8px;
  color: #065f46;
}

.no-disclosures .check-icon {
  width: 24px;
  height: 24px;
  background: #10b981;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Disclosure List */
.disclosure-list {
  list-style: none;
  padding: 0;
  margin: 16px 24px;
}

.disclosure-item {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid #e5e7eb;
}

.disclosure-item.type-full {
  border-color: #fecaca;
  background: #fef2f2;
}

.disclosure-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.disclosure-label {
  font-weight: 600;
  flex: 1;
}

.disclosure-value,
.disclosure-condition,
.disclosure-set {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background: white;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  margin-bottom: 8px;
}

.value-label,
.condition-label,
.set-label {
  color: #6b7280;
}

.disclosure-description {
  margin: 0;
  font-size: 14px;
  color: #4b5563;
}

.risk-details {
  margin-top: 12px;
  font-size: 13px;
}

.risk-factors {
  margin: 8px 0 0 0;
  padding-left: 20px;
  color: #6b7280;
}

/* Risk Badge */
.risk-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
}

/* High Risk Warning */
.high-risk-warning {
  display: flex;
  gap: 12px;
  padding: 16px;
  margin: 16px 24px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
}

.warning-icon {
  width: 24px;
  height: 24px;
  background: #dc2626;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.warning-content strong {
  color: #991b1b;
}

.warning-content p {
  margin: 4px 0 0 0;
  font-size: 14px;
  color: #7f1d1d;
}

/* Learn More */
.learn-more {
  margin: 16px 24px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.learn-more summary {
  cursor: pointer;
  font-weight: 500;
  color: #4f46e5;
}

.learn-content {
  padding-top: 12px;
  font-size: 14px;
  color: #4b5563;
}

.learn-content h4 {
  margin: 16px 0 8px 0;
  font-size: 14px;
  color: #111827;
}

.learn-content h4:first-child {
  margin-top: 0;
}

.learn-content ul {
  margin: 8px 0;
  padding-left: 20px;
}

.learn-content li {
  margin-bottom: 4px;
}

/* Acknowledgment */
.acknowledgment {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 24px;
  background: #fef3c7;
  margin: 16px 24px;
  border-radius: 8px;
  cursor: pointer;
}

.acknowledgment input {
  margin-top: 2px;
}

.acknowledgment span {
  font-size: 14px;
  color: #92400e;
}

/* Actions */
.modal-actions {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e5e7eb;
}

.cancel-button {
  flex: 1;
  padding: 12px 24px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  color: #374151;
}

.cancel-button:hover {
  background: #f9fafb;
}

.confirm-button {
  flex: 1;
  padding: 12px 24px;
  background: #4f46e5;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  color: white;
}

.confirm-button:hover:not(:disabled) {
  background: #4338ca;
}

.confirm-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
`;
