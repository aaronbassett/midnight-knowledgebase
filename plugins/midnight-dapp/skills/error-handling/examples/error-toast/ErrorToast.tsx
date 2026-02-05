/**
 * ErrorToast - Toast notification component for Midnight DApp errors
 *
 * Provides a non-intrusive way to display errors to users with
 * automatic dismissal and action buttons.
 */

import React, { useEffect, useState, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface ToastData {
  /** Unique identifier */
  id: string;

  /** Toast type determines styling */
  type: ToastType;

  /** Short title */
  title: string;

  /** Detailed message */
  message: string;

  /** Auto-dismiss timeout in ms (0 = no auto-dismiss) */
  duration: number;

  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };

  /** Timestamp for sorting */
  timestamp: number;
}

export interface ErrorToastProps {
  /** Toast data */
  toast: ToastData;

  /** Called when toast is dismissed */
  onDismiss: (id: string) => void;

  /** Position for animation direction */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

// =============================================================================
// Component
// =============================================================================

export function ErrorToast({
  toast,
  onDismiss,
  position = 'top-right',
}: ErrorToastProps): JSX.Element {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    // Wait for exit animation
    setTimeout(() => {
      onDismiss(toast.id);
    }, 200);
  }, [onDismiss, toast.id]);

  // Auto-dismiss timer
  useEffect(() => {
    if (toast.duration <= 0 || isPaused) return;

    const timer = setTimeout(handleDismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, isPaused, handleDismiss]);

  const icon = getToastIcon(toast.type);
  const colors = getToastColors(toast.type);

  return (
    <div
      className={`error-toast ${toast.type} ${isExiting ? 'exiting' : 'entering'}`}
      style={{
        '--toast-bg': colors.background,
        '--toast-border': colors.border,
        '--toast-icon': colors.icon,
        '--toast-title': colors.title,
      } as React.CSSProperties}
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="toast-icon" aria-hidden="true">
        {icon}
      </div>

      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        <div className="toast-message">{toast.message}</div>

        {toast.action && (
          <button
            className="toast-action"
            onClick={() => {
              toast.action?.onClick();
              handleDismiss();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        className="toast-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        <span aria-hidden="true">&times;</span>
      </button>

      {toast.duration > 0 && !isPaused && (
        <div
          className="toast-progress"
          style={{
            animationDuration: `${toast.duration}ms`,
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Toast Container
// =============================================================================

export interface ToastContainerProps {
  /** Array of toast data */
  toasts: ToastData[];

  /** Called when a toast is dismissed */
  onDismiss: (id: string) => void;

  /** Position on screen */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

  /** Maximum visible toasts */
  maxVisible?: number;
}

export function ToastContainer({
  toasts,
  onDismiss,
  position = 'top-right',
  maxVisible = 5,
}: ToastContainerProps): JSX.Element {
  const visibleToasts = toasts
    .slice(0, maxVisible)
    .sort((a, b) => b.timestamp - a.timestamp);

  const positionClasses: Record<string, string> = {
    'top-right': 'toast-container-tr',
    'top-left': 'toast-container-tl',
    'bottom-right': 'toast-container-br',
    'bottom-left': 'toast-container-bl',
  };

  return (
    <div
      className={`toast-container ${positionClasses[position]}`}
      aria-label="Notifications"
    >
      {visibleToasts.map((toast) => (
        <ErrorToast
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          position={position}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function getToastIcon(type: ToastType): string {
  switch (type) {
    case 'error':
      return '\u2717'; // Cross mark
    case 'warning':
      return '\u26A0'; // Warning sign
    case 'info':
      return '\u2139'; // Info symbol
    case 'success':
      return '\u2713'; // Check mark
    default:
      return '\u2139';
  }
}

function getToastColors(type: ToastType): {
  background: string;
  border: string;
  icon: string;
  title: string;
} {
  switch (type) {
    case 'error':
      return {
        background: '#fef2f2',
        border: '#fecaca',
        icon: '#dc2626',
        title: '#991b1b',
      };
    case 'warning':
      return {
        background: '#fffbeb',
        border: '#fde68a',
        icon: '#d97706',
        title: '#92400e',
      };
    case 'info':
      return {
        background: '#eff6ff',
        border: '#bfdbfe',
        icon: '#2563eb',
        title: '#1e40af',
      };
    case 'success':
      return {
        background: '#f0fdf4',
        border: '#bbf7d0',
        icon: '#16a34a',
        title: '#166534',
      };
    default:
      return {
        background: '#f9fafb',
        border: '#e5e7eb',
        icon: '#6b7280',
        title: '#374151',
      };
  }
}

// =============================================================================
// Styles
// =============================================================================

export const errorToastStyles = `
.toast-container {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  max-width: 400px;
  pointer-events: none;
}

.toast-container-tr {
  top: 0;
  right: 0;
}

.toast-container-tl {
  top: 0;
  left: 0;
}

.toast-container-br {
  bottom: 0;
  right: 0;
}

.toast-container-bl {
  bottom: 0;
  left: 0;
}

.error-toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--toast-bg);
  border: 1px solid var(--toast-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  position: relative;
  overflow: hidden;
}

.error-toast.entering {
  animation: toastEnter 0.3s ease-out forwards;
}

.error-toast.exiting {
  animation: toastExit 0.2s ease-in forwards;
}

@keyframes toastEnter {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toastExit {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

.toast-container-tl .error-toast.entering,
.toast-container-bl .error-toast.entering {
  animation-name: toastEnterLeft;
}

.toast-container-tl .error-toast.exiting,
.toast-container-bl .error-toast.exiting {
  animation-name: toastExitLeft;
}

@keyframes toastEnterLeft {
  from {
    opacity: 0;
    transform: translateX(-100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toastExitLeft {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(-100%);
  }
}

.toast-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--toast-icon);
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--toast-title);
  margin-bottom: 2px;
}

.toast-message {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.4;
}

.toast-action {
  margin-top: 8px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--toast-border);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--toast-title);
  cursor: pointer;
  transition: background 0.2s ease;
}

.toast-action:hover {
  background: rgba(0, 0, 0, 0.05);
}

.toast-dismiss {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  font-size: 18px;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.2s ease, background 0.2s ease;
}

.toast-dismiss:hover {
  color: #6b7280;
  background: rgba(0, 0, 0, 0.05);
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: var(--toast-icon);
  animation: toastProgress linear forwards;
}

@keyframes toastProgress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .error-toast.entering,
  .error-toast.exiting {
    animation: none;
  }

  .toast-progress {
    animation: none;
    width: 100%;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .error-toast {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .error-toast.error {
    --toast-bg: #450a0a;
    --toast-border: #7f1d1d;
    --toast-icon: #ef4444;
    --toast-title: #fecaca;
  }

  .error-toast.warning {
    --toast-bg: #451a03;
    --toast-border: #78350f;
    --toast-icon: #f59e0b;
    --toast-title: #fde68a;
  }

  .error-toast.info {
    --toast-bg: #1e3a8a;
    --toast-border: #1e40af;
    --toast-icon: #60a5fa;
    --toast-title: #bfdbfe;
  }

  .error-toast.success {
    --toast-bg: #14532d;
    --toast-border: #166534;
    --toast-icon: #4ade80;
    --toast-title: #bbf7d0;
  }

  .toast-message {
    color: #d1d5db;
  }

  .toast-dismiss {
    color: #6b7280;
  }

  .toast-dismiss:hover {
    color: #9ca3af;
    background: rgba(255, 255, 255, 0.1);
  }
}
`;
