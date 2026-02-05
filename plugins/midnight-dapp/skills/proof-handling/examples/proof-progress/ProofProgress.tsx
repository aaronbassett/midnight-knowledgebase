/**
 * ProofProgress - React component for displaying ZK proof generation progress
 *
 * Shows the multi-stage proof generation process with visual feedback,
 * timing information, and error handling.
 */

import React from "react";
import {
  useProofStatus,
  formatElapsedTime,
  getProgressColor,
  type ProofStatus,
  type ProofProgress as ProofProgressData,
  type ProofErrorInfo,
} from "./useProofStatus";

// =============================================================================
// Types
// =============================================================================

interface ProofProgressProps {
  /** Custom class name for styling */
  className?: string;

  /** Show detailed timing information */
  showTiming?: boolean;

  /** Show retry information */
  showRetries?: boolean;

  /** Custom stage labels */
  stageLabels?: Partial<Record<ProofStatus, string>>;
}

interface ProofProgressBarProps {
  progress: ProofProgressData;
  className?: string;
}

interface ProofStatusIndicatorProps {
  status: ProofStatus;
  className?: string;
}

interface ProofErrorDisplayProps {
  error: ProofErrorInfo;
  onRetry?: () => void;
  className?: string;
}

// =============================================================================
// Progress Bar Component
// =============================================================================

export function ProofProgressBar({
  progress,
  className = "",
}: ProofProgressBarProps): JSX.Element {
  const percentage = progress.percentage ?? 0;
  const color = getProgressColor(progress.status);

  return (
    <div className={`proof-progress-bar ${className}`}>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div className="progress-info">
        <span className="progress-message">{progress.message}</span>
        {progress.percentage !== null && (
          <span className="progress-percentage">{percentage}%</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Status Indicator Component
// =============================================================================

export function ProofStatusIndicator({
  status,
  className = "",
}: ProofStatusIndicatorProps): JSX.Element {
  const config: Record<ProofStatus, { icon: string; label: string; color: string }> = {
    idle: { icon: "circle", label: "Ready", color: "gray" },
    preparing: { icon: "spinner", label: "Preparing", color: "blue" },
    generating: { icon: "spinner", label: "Generating", color: "blue" },
    proving: { icon: "spinner", label: "Proving", color: "indigo" },
    submitting: { icon: "spinner", label: "Submitting", color: "purple" },
    complete: { icon: "check", label: "Complete", color: "green" },
    error: { icon: "x", label: "Error", color: "red" },
    timeout: { icon: "clock", label: "Timeout", color: "orange" },
    cancelled: { icon: "stop", label: "Cancelled", color: "gray" },
  };

  const { icon, label, color } = config[status];

  return (
    <div className={`proof-status-indicator status-${color} ${className}`}>
      <span className={`status-icon icon-${icon}`} />
      <span className="status-label">{label}</span>
    </div>
  );
}

// =============================================================================
// Error Display Component
// =============================================================================

export function ProofErrorDisplay({
  error,
  onRetry,
  className = "",
}: ProofErrorDisplayProps): JSX.Element {
  return (
    <div className={`proof-error-display ${className}`}>
      <div className="error-header">
        <span className="error-icon">!</span>
        <span className="error-title">{error.message}</span>
      </div>

      <p className="error-suggestion">{error.suggestion}</p>

      {error.retryable && onRetry && (
        <button onClick={onRetry} className="error-retry-button">
          Try Again
        </button>
      )}

      {process.env.NODE_ENV === "development" && error.cause && (
        <details className="error-details">
          <summary>Technical Details</summary>
          <pre>{error.cause.stack ?? error.cause.message}</pre>
        </details>
      )}
    </div>
  );
}

// =============================================================================
// Stage Timeline Component
// =============================================================================

interface StageTimelineProps {
  currentStatus: ProofStatus;
  className?: string;
}

const STAGES: ProofStatus[] = ["preparing", "generating", "proving", "submitting", "complete"];

export function StageTimeline({
  currentStatus,
  className = "",
}: StageTimelineProps): JSX.Element {
  const currentIndex = STAGES.indexOf(currentStatus);

  return (
    <div className={`stage-timeline ${className}`}>
      {STAGES.map((stage, index) => {
        const isComplete = index < currentIndex || currentStatus === "complete";
        const isCurrent = index === currentIndex && currentStatus !== "complete";
        const isPending = index > currentIndex;

        return (
          <div
            key={stage}
            className={`stage-item ${isComplete ? "complete" : ""} ${isCurrent ? "current" : ""} ${isPending ? "pending" : ""}`}
          >
            <div className="stage-indicator">
              {isComplete && <span className="check-icon">check</span>}
              {isCurrent && <span className="spinner-icon" />}
              {isPending && <span className="dot-icon" />}
            </div>
            <span className="stage-label">{getStageLabel(stage)}</span>
            {index < STAGES.length - 1 && <div className="stage-connector" />}
          </div>
        );
      })}
    </div>
  );
}

function getStageLabel(status: ProofStatus): string {
  const labels: Partial<Record<ProofStatus, string>> = {
    preparing: "Prepare",
    generating: "Generate",
    proving: "Prove",
    submitting: "Submit",
    complete: "Done",
  };
  return labels[status] ?? status;
}

// =============================================================================
// Main Progress Component
// =============================================================================

export function ProofProgress({
  className = "",
  showTiming = true,
  showRetries = true,
}: ProofProgressProps): JSX.Element {
  const { status, progress, error, isGenerating, reset } = useProofStatus();

  return (
    <div className={`proof-progress ${className}`}>
      {/* Status indicator */}
      <ProofStatusIndicator status={status} />

      {/* Progress bar (when generating) */}
      {isGenerating && <ProofProgressBar progress={progress} />}

      {/* Stage timeline */}
      {isGenerating && <StageTimeline currentStatus={status} />}

      {/* Timing information */}
      {showTiming && isGenerating && (
        <div className="proof-timing">
          <span className="elapsed-time">
            Elapsed: {formatElapsedTime(progress.elapsedMs)}
          </span>
          {progress.estimatedRemainingMs !== null && progress.estimatedRemainingMs > 0 && (
            <span className="estimated-time">
              Est. remaining: {formatElapsedTime(progress.estimatedRemainingMs)}
            </span>
          )}
        </div>
      )}

      {/* Retry information */}
      {showRetries && progress.attempt > 1 && (
        <div className="proof-retries">
          Attempt {progress.attempt} of {progress.maxAttempts}
        </div>
      )}

      {/* Error display */}
      {error && <ProofErrorDisplay error={error} onRetry={reset} />}
    </div>
  );
}

// =============================================================================
// Inline Component for Transaction Buttons
// =============================================================================

interface TransactionButtonProps {
  /** Button label when idle */
  label: string;

  /** Function that builds and submits the transaction */
  onSubmit: () => Promise<unknown>;

  /** Called on successful submission */
  onSuccess?: (result: unknown) => void;

  /** Called on error */
  onError?: (error: ProofErrorInfo) => void;

  /** Disable the button */
  disabled?: boolean;

  /** Custom class name */
  className?: string;
}

export function TransactionButton({
  label,
  onSubmit,
  onSuccess,
  onError,
  disabled = false,
  className = "",
}: TransactionButtonProps): JSX.Element {
  const { status, progress, error, isGenerating, generateProof, cancel, reset } =
    useProofStatus();

  const handleClick = async () => {
    const result = await generateProof(onSubmit);

    if (result.success && result.transaction) {
      onSuccess?.(result.transaction);
    } else if (result.error) {
      onError?.(result.error);
    }
  };

  const handleCancel = () => {
    cancel();
    reset();
  };

  // Button content based on status
  const renderButtonContent = () => {
    switch (status) {
      case "preparing":
        return (
          <>
            <span className="spinner" />
            Preparing...
          </>
        );
      case "generating":
        return (
          <>
            <span className="spinner" />
            Generating proof...
          </>
        );
      case "proving":
        return (
          <>
            <span className="spinner" />
            Creating ZK proof...
          </>
        );
      case "submitting":
        return (
          <>
            <span className="spinner" />
            Submitting...
          </>
        );
      default:
        return label;
    }
  };

  return (
    <div className={`transaction-button-container ${className}`}>
      <button
        onClick={isGenerating ? handleCancel : handleClick}
        disabled={disabled && !isGenerating}
        className={`transaction-button ${isGenerating ? "generating" : ""}`}
      >
        {isGenerating ? "Cancel" : renderButtonContent()}
      </button>

      {/* Inline progress */}
      {isGenerating && progress.percentage !== null && (
        <div className="inline-progress">
          <div
            className="inline-progress-bar"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      )}

      {/* Inline error */}
      {error && (
        <div className="inline-error">
          <span className="error-message">{error.message}</span>
          {error.retryable && (
            <button onClick={reset} className="retry-link">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Styles (inline for portability - use CSS modules in production)
// =============================================================================

export const proofProgressStyles = `
/* Progress Bar */
.proof-progress-bar {
  width: 100%;
}

.progress-track {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  border-radius: 4px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}

/* Status Indicator */
.proof-status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
}

.proof-status-indicator.status-gray { background: #f3f4f6; color: #4b5563; }
.proof-status-indicator.status-blue { background: #dbeafe; color: #1d4ed8; }
.proof-status-indicator.status-indigo { background: #e0e7ff; color: #4338ca; }
.proof-status-indicator.status-purple { background: #ede9fe; color: #6d28d9; }
.proof-status-indicator.status-green { background: #d1fae5; color: #059669; }
.proof-status-indicator.status-red { background: #fee2e2; color: #dc2626; }
.proof-status-indicator.status-orange { background: #ffedd5; color: #c2410c; }

.status-icon.icon-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error Display */
.proof-error-display {
  padding: 16px;
  background: #fee2e2;
  border-radius: 8px;
  border: 1px solid #fecaca;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.error-icon {
  width: 20px;
  height: 20px;
  background: #dc2626;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 12px;
}

.error-title {
  font-weight: 600;
  color: #991b1b;
}

.error-suggestion {
  color: #7f1d1d;
  font-size: 14px;
  margin: 0 0 12px 0;
}

.error-retry-button {
  padding: 8px 16px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.error-retry-button:hover {
  background: #b91c1c;
}

.error-details {
  margin-top: 12px;
  font-size: 12px;
}

.error-details pre {
  background: #fef2f2;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
}

/* Stage Timeline */
.stage-timeline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  flex: 1;
}

.stage-indicator {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #9ca3af;
  font-size: 12px;
}

.stage-item.complete .stage-indicator {
  background: #10b981;
  color: white;
}

.stage-item.current .stage-indicator {
  background: #6366f1;
  color: white;
}

.stage-connector {
  position: absolute;
  top: 12px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #e5e7eb;
  z-index: -1;
}

.stage-item.complete .stage-connector {
  background: #10b981;
}

.stage-label {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.stage-item.current .stage-label {
  color: #4f46e5;
  font-weight: 500;
}

/* Timing */
.proof-timing {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #6b7280;
}

/* Transaction Button */
.transaction-button-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transaction-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.transaction-button:hover:not(:disabled) {
  background: #4338ca;
}

.transaction-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.transaction-button.generating {
  background: #6b7280;
}

.transaction-button .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.inline-progress {
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}

.inline-progress-bar {
  height: 100%;
  background: #4f46e5;
  transition: width 0.3s ease;
}

.inline-error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #dc2626;
}

.retry-link {
  background: none;
  border: none;
  color: #4f46e5;
  cursor: pointer;
  text-decoration: underline;
}
`;
