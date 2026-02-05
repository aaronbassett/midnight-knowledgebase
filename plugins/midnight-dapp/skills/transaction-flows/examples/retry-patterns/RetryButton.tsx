/**
 * RetryButton - React component for retryable actions in Midnight DApps
 *
 * Provides a button with built-in retry logic, loading states, error display,
 * and user-friendly retry UI for transaction submission and other async actions.
 */

import React, { useState, useCallback } from "react";
import {
  retryWithBackoff,
  type RetryConfig,
  type RetryResult,
} from "./retryWithBackoff";

// =============================================================================
// Types
// =============================================================================

export interface RetryButtonProps {
  /** Button label when idle */
  label: string;
  /** Async action to execute */
  action: () => Promise<unknown>;
  /** Retry configuration */
  retryConfig?: RetryConfig;
  /** Callback when action succeeds */
  onSuccess?: (result: unknown) => void;
  /** Callback when all retries fail */
  onFailure?: (error: Error, attempts: number) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button variant */
  variant?: "primary" | "secondary" | "danger";
  /** Show retry count in button */
  showRetryCount?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

export interface RetryState {
  status: "idle" | "executing" | "retrying" | "success" | "failed";
  attempt: number;
  maxAttempts: number;
  error: Error | null;
  nextRetryIn: number | null;
}

// =============================================================================
// Styles
// =============================================================================

const baseButtonStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  transition: "all 0.2s ease",
  minWidth: "120px",
};

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: "#6366f1",
    color: "#fff",
  },
  secondary: {
    backgroundColor: "#f3f4f6",
    color: "#374151",
    border: "1px solid #d1d5db",
  },
  danger: {
    backgroundColor: "#ef4444",
    color: "#fff",
  },
};

const disabledStyle: React.CSSProperties = {
  opacity: 0.6,
  cursor: "not-allowed",
};

const spinnerStyle: React.CSSProperties = {
  width: "14px",
  height: "14px",
  border: "2px solid currentColor",
  borderTopColor: "transparent",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};

const errorContainerStyle: React.CSSProperties = {
  marginTop: "8px",
  padding: "8px 12px",
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "6px",
  fontSize: "13px",
  color: "#991b1b",
};

const retryInfoStyle: React.CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  color: "#6b7280",
};

// =============================================================================
// Helper Components
// =============================================================================

function Spinner() {
  return (
    <>
      <span style={spinnerStyle} />
      <style>
        {`@keyframes spin { to { transform: rotate(360deg); } }`}
      </style>
    </>
  );
}

interface ErrorDisplayProps {
  error: Error;
  attempt: number;
  maxAttempts: number;
  nextRetryIn: number | null;
  onRetryNow?: () => void;
  onCancel?: () => void;
}

function ErrorDisplay({
  error,
  attempt,
  maxAttempts,
  nextRetryIn,
  onRetryNow,
  onCancel,
}: ErrorDisplayProps) {
  return (
    <div style={errorContainerStyle}>
      <div style={{ fontWeight: 500 }}>
        {error.message}
      </div>
      <div style={retryInfoStyle}>
        {nextRetryIn !== null ? (
          <>
            Attempt {attempt} of {maxAttempts} failed.
            Retrying in {Math.ceil(nextRetryIn / 1000)}s...
          </>
        ) : (
          <>
            Failed after {attempt} attempt{attempt > 1 ? "s" : ""}.
          </>
        )}
      </div>
      <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
        {nextRetryIn !== null && onRetryNow && (
          <button
            onClick={onRetryNow}
            style={{
              padding: "4px 12px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
          >
            Retry Now
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: "4px 12px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "none",
              backgroundColor: "transparent",
              color: "#6b7280",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Button with built-in retry logic for async actions
 *
 * @example
 * ```tsx
 * function TransferForm() {
 *   return (
 *     <RetryButton
 *       label="Transfer"
 *       action={() => submitTransaction(tx)}
 *       retryConfig={{ maxRetries: 3 }}
 *       onSuccess={(hash) => console.log('Success:', hash)}
 *       onFailure={(err) => console.error('Failed:', err)}
 *     />
 *   );
 * }
 * ```
 */
export function RetryButton({
  label,
  action,
  retryConfig = {},
  onSuccess,
  onFailure,
  disabled = false,
  variant = "primary",
  showRetryCount = true,
  className,
  style,
}: RetryButtonProps) {
  const [state, setState] = useState<RetryState>({
    status: "idle",
    attempt: 0,
    maxAttempts: (retryConfig.maxRetries ?? 3) + 1,
    error: null,
    nextRetryIn: null,
  });

  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleClick = useCallback(async () => {
    const controller = new AbortController();
    setAbortController(controller);

    setState((prev) => ({
      ...prev,
      status: "executing",
      attempt: 1,
      error: null,
      nextRetryIn: null,
    }));

    const result = await retryWithBackoff(action, {
      ...retryConfig,
      signal: controller.signal,
      onRetry: (attempt, error, delayMs) => {
        setState({
          status: "retrying",
          attempt: attempt + 1,
          maxAttempts: (retryConfig.maxRetries ?? 3) + 1,
          error,
          nextRetryIn: delayMs,
        });

        // Countdown timer
        const startTime = Date.now();
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, delayMs - elapsed);

          if (remaining === 0) {
            clearInterval(interval);
            setState((prev) => ({ ...prev, nextRetryIn: null }));
          } else {
            setState((prev) => ({ ...prev, nextRetryIn: remaining }));
          }
        }, 100);
      },
    });

    setAbortController(null);

    if (result.success) {
      setState((prev) => ({
        ...prev,
        status: "success",
        error: null,
        nextRetryIn: null,
      }));
      onSuccess?.(result.value);
    } else {
      setState((prev) => ({
        ...prev,
        status: "failed",
        error: result.error ?? new Error("Unknown error"),
        nextRetryIn: null,
      }));
      onFailure?.(result.error ?? new Error("Unknown error"), result.attempts);
    }
  }, [action, retryConfig, onSuccess, onFailure]);

  const handleCancel = useCallback(() => {
    abortController?.abort();
    setState({
      status: "idle",
      attempt: 0,
      maxAttempts: (retryConfig.maxRetries ?? 3) + 1,
      error: null,
      nextRetryIn: null,
    });
  }, [abortController, retryConfig.maxRetries]);

  const handleRetryNow = useCallback(() => {
    // Abort current wait and trigger immediate retry
    abortController?.abort();
    handleClick();
  }, [abortController, handleClick]);

  const isLoading = state.status === "executing" || state.status === "retrying";
  const isDisabled = disabled || isLoading;

  // Determine button label
  let buttonLabel = label;
  if (isLoading && showRetryCount && state.attempt > 1) {
    buttonLabel = `${label} (Attempt ${state.attempt}/${state.maxAttempts})`;
  } else if (isLoading) {
    buttonLabel = `${label}...`;
  } else if (state.status === "success") {
    buttonLabel = "Success!";
  } else if (state.status === "failed") {
    buttonLabel = "Try Again";
  }

  const buttonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    ...variantStyles[variant],
    ...(isDisabled ? disabledStyle : {}),
    ...style,
  };

  return (
    <div className={className}>
      <button
        onClick={state.status === "failed" ? handleClick : handleClick}
        disabled={isDisabled}
        style={buttonStyle}
      >
        {isLoading && <Spinner />}
        {buttonLabel}
      </button>

      {state.error && (state.status === "retrying" || state.status === "failed") && (
        <ErrorDisplay
          error={state.error}
          attempt={state.attempt}
          maxAttempts={state.maxAttempts}
          nextRetryIn={state.nextRetryIn}
          onRetryNow={state.status === "retrying" ? handleRetryNow : undefined}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

// =============================================================================
// Variants
// =============================================================================

export interface RetryIconButtonProps {
  icon: React.ReactNode;
  action: () => Promise<unknown>;
  retryConfig?: RetryConfig;
  onSuccess?: (result: unknown) => void;
  onFailure?: (error: Error) => void;
  disabled?: boolean;
  title?: string;
}

/**
 * Icon-only retry button for compact UIs
 */
export function RetryIconButton({
  icon,
  action,
  retryConfig,
  onSuccess,
  onFailure,
  disabled,
  title,
}: RetryIconButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    const result = await retryWithBackoff(action, retryConfig);
    setIsLoading(false);

    if (result.success) {
      onSuccess?.(result.value);
    } else {
      onFailure?.(result.error ?? new Error("Unknown error"));
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      title={title}
      style={{
        padding: "8px",
        borderRadius: "50%",
        border: "1px solid #d1d5db",
        backgroundColor: "#fff",
        cursor: disabled || isLoading ? "not-allowed" : "pointer",
        opacity: disabled || isLoading ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isLoading ? <Spinner /> : icon}
    </button>
  );
}

// =============================================================================
// Hook for Custom UI
// =============================================================================

export interface UseRetryReturn<T> {
  execute: () => Promise<void>;
  reset: () => void;
  cancel: () => void;
  state: RetryState;
  result: RetryResult<T> | null;
  isLoading: boolean;
}

/**
 * Hook for building custom retry UI
 */
export function useRetry<T>(
  action: () => Promise<T>,
  config: RetryConfig = {}
): UseRetryReturn<T> {
  const [state, setState] = useState<RetryState>({
    status: "idle",
    attempt: 0,
    maxAttempts: (config.maxRetries ?? 3) + 1,
    error: null,
    nextRetryIn: null,
  });

  const [result, setResult] = useState<RetryResult<T> | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  const execute = useCallback(async () => {
    const newController = new AbortController();
    setController(newController);

    setState((prev) => ({
      ...prev,
      status: "executing",
      attempt: 1,
      error: null,
    }));

    const res = await retryWithBackoff(action, {
      ...config,
      signal: newController.signal,
      onRetry: (attempt, error, delayMs) => {
        setState((prev) => ({
          ...prev,
          status: "retrying",
          attempt: attempt + 1,
          error,
          nextRetryIn: delayMs,
        }));
      },
    });

    setController(null);
    setResult(res);

    setState((prev) => ({
      ...prev,
      status: res.success ? "success" : "failed",
      error: res.error ?? null,
      nextRetryIn: null,
    }));
  }, [action, config]);

  const reset = useCallback(() => {
    controller?.abort();
    setController(null);
    setResult(null);
    setState({
      status: "idle",
      attempt: 0,
      maxAttempts: (config.maxRetries ?? 3) + 1,
      error: null,
      nextRetryIn: null,
    });
  }, [controller, config.maxRetries]);

  const cancel = useCallback(() => {
    controller?.abort();
  }, [controller]);

  return {
    execute,
    reset,
    cancel,
    state,
    result,
    isLoading: state.status === "executing" || state.status === "retrying",
  };
}

export default RetryButton;
