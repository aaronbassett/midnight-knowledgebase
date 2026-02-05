/**
 * TxStatusTracker - React component for displaying transaction status
 *
 * Provides a visual interface for transaction confirmation tracking with
 * progress indicators, status messages, and explorer links.
 */

import React from "react";
import {
  useTxStatus,
  getStatusMessage,
  getStatusColor,
  formatElapsed,
  getConfirmationProgress,
  type TxStatusService,
  type ConfirmationStatus,
} from "./useTxStatus";

// =============================================================================
// Types
// =============================================================================

export interface TxStatusTrackerProps {
  /** Transaction hash to track */
  txHash: string | null;
  /** Service for checking transaction status */
  statusService: TxStatusService;
  /** Number of confirmations required (default: 1) */
  requiredConfirmations?: number;
  /** Base URL for block explorer (e.g., "https://explorer.midnight.network/tx/") */
  explorerBaseUrl?: string;
  /** Callback when transaction is confirmed */
  onConfirmed?: (txHash: string) => void;
  /** Callback when transaction fails */
  onFailed?: (txHash: string, error: Error) => void;
  /** Whether to show the elapsed time */
  showElapsedTime?: boolean;
  /** Whether to show confirmation count */
  showConfirmations?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// Styles (inline for portability)
// =============================================================================

const styles = {
  container: {
    padding: "16px",
    borderRadius: "8px",
    backgroundColor: "#f9fafb",
    border: "1px solid #e5e7eb",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  statusBadge: (color: string) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 12px",
    borderRadius: "16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: `${color}15`,
    color,
  }),
  statusDot: (color: string) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: color,
  }),
  txHash: {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#6b7280",
    wordBreak: "break-all" as const,
  },
  progressContainer: {
    marginTop: "12px",
  },
  progressLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "#6b7280",
    marginBottom: "4px",
  },
  progressBar: {
    width: "100%",
    height: "6px",
    backgroundColor: "#e5e7eb",
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressFill: (percentage: number, color: string) => ({
    width: `${percentage}%`,
    height: "100%",
    backgroundColor: color,
    borderRadius: "3px",
    transition: "width 0.3s ease",
  }),
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "12px",
    fontSize: "12px",
    color: "#6b7280",
  },
  link: {
    color: "#6366f1",
    textDecoration: "none",
  },
  message: {
    marginTop: "8px",
    fontSize: "14px",
    color: "#374151",
  },
  error: {
    marginTop: "8px",
    padding: "8px 12px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#991b1b",
  },
  spinner: {
    display: "inline-block",
    width: "12px",
    height: "12px",
    border: "2px solid #e5e7eb",
    borderTopColor: "#6366f1",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};

// =============================================================================
// Sub-components
// =============================================================================

interface StatusBadgeProps {
  status: ConfirmationStatus;
  isPolling: boolean;
}

function StatusBadge({ status, isPolling }: StatusBadgeProps) {
  const color = getStatusColor(status);
  const message = getStatusMessage(status);

  return (
    <div style={styles.statusBadge(color)}>
      {isPolling ? (
        <span style={styles.spinner} />
      ) : (
        <span style={styles.statusDot(color)} />
      )}
      <span>{message}</span>
    </div>
  );
}

interface ConfirmationProgressProps {
  confirmations: number;
  required: number;
  color: string;
}

function ConfirmationProgress({
  confirmations,
  required,
  color,
}: ConfirmationProgressProps) {
  const percentage = getConfirmationProgress(confirmations, required);

  return (
    <div style={styles.progressContainer}>
      <div style={styles.progressLabel}>
        <span>Confirmations</span>
        <span>
          {confirmations} / {required}
        </span>
      </div>
      <div style={styles.progressBar}>
        <div style={styles.progressFill(percentage, color)} />
      </div>
    </div>
  );
}

interface ExplorerLinkProps {
  txHash: string;
  baseUrl: string;
}

function ExplorerLink({ txHash, baseUrl }: ExplorerLinkProps) {
  const url = `${baseUrl}${txHash}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={styles.link}
    >
      View in Explorer
    </a>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Transaction status tracker component
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [txHash, setTxHash] = useState<string | null>(null);
 *   const statusService = useStatusService();
 *
 *   return (
 *     <div>
 *       <button onClick={() => submitTransaction().then(setTxHash)}>
 *         Submit
 *       </button>
 *
 *       <TxStatusTracker
 *         txHash={txHash}
 *         statusService={statusService}
 *         requiredConfirmations={6}
 *         explorerBaseUrl="https://explorer.midnight.network/tx/"
 *         onConfirmed={(hash) => console.log('Confirmed:', hash)}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function TxStatusTracker({
  txHash,
  statusService,
  requiredConfirmations = 1,
  explorerBaseUrl = "https://explorer.midnight.network/tx/",
  onConfirmed,
  onFailed,
  showElapsedTime = true,
  showConfirmations = true,
  className,
}: TxStatusTrackerProps) {
  const {
    status,
    statusInfo,
    isPolling,
    isConfirmed,
    error,
    elapsedMs,
  } = useTxStatus(txHash, statusService, {
    requiredConfirmations,
    onConfirmed,
    onFailed,
  });

  // Don't render if no transaction
  if (!txHash) {
    return null;
  }

  const statusColor = getStatusColor(status);

  return (
    <div style={styles.container} className={className}>
      {/* Header with status badge */}
      <div style={styles.header}>
        <StatusBadge status={status} isPolling={isPolling} />
        {showElapsedTime && (
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            {formatElapsed(elapsedMs)}
          </span>
        )}
      </div>

      {/* Transaction hash */}
      <div style={styles.txHash}>
        {txHash.slice(0, 16)}...{txHash.slice(-16)}
      </div>

      {/* Status message */}
      <div style={styles.message}>
        {isConfirmed
          ? "Your transaction has been confirmed!"
          : status === "failed"
          ? "Your transaction has failed. Please try again."
          : "Please wait while your transaction is being confirmed..."}
      </div>

      {/* Confirmation progress */}
      {showConfirmations && status !== "unknown" && status !== "failed" && (
        <ConfirmationProgress
          confirmations={statusInfo.confirmations}
          required={requiredConfirmations}
          color={statusColor}
        />
      )}

      {/* Error message */}
      {error && (
        <div style={styles.error}>
          Error checking status: {error.message}
        </div>
      )}

      {/* Footer with explorer link */}
      <div style={styles.footer}>
        <ExplorerLink txHash={txHash} baseUrl={explorerBaseUrl} />
        {statusInfo.blockNumber && (
          <span>Block #{statusInfo.blockNumber}</span>
        )}
      </div>

      {/* Keyframe animation for spinner (injected once) */}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

// =============================================================================
// Compact Variant
// =============================================================================

export interface TxStatusCompactProps {
  txHash: string | null;
  statusService: TxStatusService;
  onConfirmed?: (txHash: string) => void;
}

/**
 * Compact transaction status indicator for inline use
 */
export function TxStatusCompact({
  txHash,
  statusService,
  onConfirmed,
}: TxStatusCompactProps) {
  const { status, isPolling, statusInfo } = useTxStatus(txHash, statusService, {
    onConfirmed,
  });

  if (!txHash) return null;

  const color = getStatusColor(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "13px",
        color,
      }}
    >
      {isPolling ? (
        <span
          style={{
            ...styles.spinner,
            width: "10px",
            height: "10px",
            borderWidth: "1.5px",
          }}
        />
      ) : (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: color,
          }}
        />
      )}
      {status === "confirmed"
        ? `Confirmed (${statusInfo.confirmations})`
        : status === "failed"
        ? "Failed"
        : "Pending..."}
    </span>
  );
}

// =============================================================================
// Toast Variant
// =============================================================================

export interface TxStatusToastProps {
  txHash: string;
  statusService: TxStatusService;
  onClose: () => void;
  explorerBaseUrl?: string;
}

/**
 * Toast notification style for transaction status
 */
export function TxStatusToast({
  txHash,
  statusService,
  onClose,
  explorerBaseUrl = "https://explorer.midnight.network/tx/",
}: TxStatusToastProps) {
  const { status, isConfirmed, elapsedMs } = useTxStatus(txHash, statusService, {
    onConfirmed: onClose,
  });

  const color = getStatusColor(status);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        backgroundColor: "#fff",
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        borderRadius: "0 8px 8px 0",
        minWidth: "300px",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, marginBottom: "4px" }}>
          {isConfirmed ? "Transaction Confirmed" : "Transaction Pending"}
        </div>
        <div style={{ fontSize: "12px", color: "#6b7280" }}>
          {txHash.slice(0, 8)}...{txHash.slice(-6)} ({formatElapsed(elapsedMs)})
        </div>
      </div>
      <a
        href={`${explorerBaseUrl}${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: "6px 12px",
          fontSize: "12px",
          color: "#6366f1",
          border: "1px solid #6366f1",
          borderRadius: "4px",
          textDecoration: "none",
        }}
      >
        View
      </a>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "18px",
          color: "#9ca3af",
          padding: "4px",
        }}
        aria-label="Close"
      >
        &times;
      </button>
    </div>
  );
}

export default TxStatusTracker;
