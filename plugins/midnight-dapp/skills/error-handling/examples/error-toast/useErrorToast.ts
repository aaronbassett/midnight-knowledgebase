/**
 * useErrorToast - React hook for showing error toast notifications
 *
 * Provides a simple API for showing errors to users with automatic
 * classification, formatting, and lifecycle management.
 */

import { useState, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { ToastData, ToastType } from './ErrorToast';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for showing a toast
 */
export interface ShowToastOptions {
  /** Toast title */
  title?: string;

  /** Toast message */
  message?: string;

  /** Toast type (default: inferred from error) */
  type?: ToastType;

  /** Auto-dismiss duration in ms (default: 5000, 0 = no auto-dismiss) */
  duration?: number;

  /** Action button */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Error toast context value
 */
export interface ErrorToastContextValue {
  /** Show an error toast (auto-classifies unknown errors) */
  showError: (error: unknown, options?: ShowToastOptions) => string;

  /** Show a warning toast */
  showWarning: (message: string, options?: Omit<ShowToastOptions, 'type'>) => string;

  /** Show an info toast */
  showInfo: (message: string, options?: Omit<ShowToastOptions, 'type'>) => string;

  /** Show a success toast */
  showSuccess: (message: string, options?: Omit<ShowToastOptions, 'type'>) => string;

  /** Dismiss a specific toast */
  dismiss: (id: string) => void;

  /** Dismiss all toasts */
  dismissAll: () => void;

  /** Current toasts */
  toasts: ToastData[];
}

// =============================================================================
// Error Classification (simplified version for hook)
// =============================================================================

interface ClassifiedToast {
  title: string;
  message: string;
  type: ToastType;
}

function classifyErrorForToast(error: unknown): ClassifiedToast {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // User rejection - info, not error
  if (lowerMessage.includes('reject') ||
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('denied')) {
    return {
      title: 'Cancelled',
      message: 'You cancelled the request.',
      type: 'info',
    };
  }

  // Timeouts - warning, retryable
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return {
      title: 'Request Timeout',
      message: 'The operation took too long. Please try again.',
      type: 'warning',
    };
  }

  // Network errors - warning, retryable
  if (lowerMessage.includes('network') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('connection')) {
    return {
      title: 'Connection Error',
      message: 'Check your internet connection and try again.',
      type: 'warning',
    };
  }

  // Balance errors - error
  if (lowerMessage.includes('balance') || lowerMessage.includes('insufficient')) {
    return {
      title: 'Insufficient Balance',
      message: 'You don\'t have enough tokens for this transaction.',
      type: 'error',
    };
  }

  // Proof server errors - error
  if (lowerMessage.includes('proof server') || lowerMessage.includes('6300')) {
    return {
      title: 'Proof Server Offline',
      message: 'Start the proof server and try again.',
      type: 'error',
    };
  }

  // Wallet errors - error
  if (lowerMessage.includes('wallet') || lowerMessage.includes('lace')) {
    return {
      title: 'Wallet Error',
      message: 'Please check your wallet connection.',
      type: 'error',
    };
  }

  // Default - error
  return {
    title: 'Error',
    message: message || 'Something went wrong. Please try again.',
    type: 'error',
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing error toasts in a component
 */
export function useErrorToast(): ErrorToastContextValue {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastIdRef = useRef(0);

  const generateId = useCallback((): string => {
    toastIdRef.current += 1;
    return `toast-${toastIdRef.current}-${Date.now()}`;
  }, []);

  const addToast = useCallback((toast: Omit<ToastData, 'id' | 'timestamp'>): string => {
    const id = generateId();
    const newToast: ToastData = {
      ...toast,
      id,
      timestamp: Date.now(),
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  }, [generateId]);

  const showError = useCallback((
    error: unknown,
    options?: ShowToastOptions
  ): string => {
    const classified = classifyErrorForToast(error);

    return addToast({
      type: options?.type ?? classified.type,
      title: options?.title ?? classified.title,
      message: options?.message ?? classified.message,
      duration: options?.duration ?? 5000,
      action: options?.action,
    });
  }, [addToast]);

  const showWarning = useCallback((
    message: string,
    options?: Omit<ShowToastOptions, 'type'>
  ): string => {
    return addToast({
      type: 'warning',
      title: options?.title ?? 'Warning',
      message,
      duration: options?.duration ?? 5000,
      action: options?.action,
    });
  }, [addToast]);

  const showInfo = useCallback((
    message: string,
    options?: Omit<ShowToastOptions, 'type'>
  ): string => {
    return addToast({
      type: 'info',
      title: options?.title ?? 'Info',
      message,
      duration: options?.duration ?? 4000,
      action: options?.action,
    });
  }, [addToast]);

  const showSuccess = useCallback((
    message: string,
    options?: Omit<ShowToastOptions, 'type'>
  ): string => {
    return addToast({
      type: 'success',
      title: options?.title ?? 'Success',
      message,
      duration: options?.duration ?? 3000,
      action: options?.action,
    });
  }, [addToast]);

  const dismiss = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback((): void => {
    setToasts([]);
  }, []);

  return {
    showError,
    showWarning,
    showInfo,
    showSuccess,
    dismiss,
    dismissAll,
    toasts,
  };
}

// =============================================================================
// Context Provider
// =============================================================================

const ErrorToastContext = createContext<ErrorToastContextValue | null>(null);

export interface ErrorToastProviderProps {
  children: ReactNode;
}

/**
 * Provides error toast context to the component tree
 */
export function ErrorToastProvider({ children }: ErrorToastProviderProps): JSX.Element {
  const errorToast = useErrorToast();

  return (
    <ErrorToastContext.Provider value={errorToast}>
      {children}
    </ErrorToastContext.Provider>
  );
}

/**
 * Hook to use error toast context
 */
export function useErrorToastContext(): ErrorToastContextValue {
  const context = useContext(ErrorToastContext);

  if (!context) {
    throw new Error('useErrorToastContext must be used within an ErrorToastProvider');
  }

  return context;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Show error and return a promise that resolves when dismissed
 */
export function showErrorAsync(
  showError: (error: unknown, options?: ShowToastOptions) => string,
  dismiss: (id: string) => void,
  error: unknown,
  options?: ShowToastOptions
): Promise<void> {
  return new Promise((resolve) => {
    const id = showError(error, {
      ...options,
      action: options?.action ?? {
        label: 'Dismiss',
        onClick: () => {
          dismiss(id);
          resolve();
        },
      },
    });
  });
}

/**
 * Create a wrapped function that shows errors as toasts
 */
export function withErrorToast<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  showError: (error: unknown, options?: ShowToastOptions) => string,
  options?: ShowToastOptions
): (...args: T) => Promise<R | undefined> {
  return async (...args: T): Promise<R | undefined> => {
    try {
      return await fn(...args);
    } catch (error) {
      showError(error, options);
      return undefined;
    }
  };
}

// =============================================================================
// Usage Examples (in comments)
// =============================================================================

/*
// Basic usage with hook
function MyComponent() {
  const { showError, showSuccess, toasts, dismiss } = useErrorToast();

  const handleSubmit = async () => {
    try {
      await submitTransaction();
      showSuccess('Transaction submitted!');
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <button onClick={handleSubmit}>Submit</button>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

// With context provider
function App() {
  return (
    <ErrorToastProvider>
      <MyComponent />
      <ToastRenderer />
    </ErrorToastProvider>
  );
}

function ToastRenderer() {
  const { toasts, dismiss } = useErrorToastContext();
  return <ToastContainer toasts={toasts} onDismiss={dismiss} />;
}

// With custom options
showError(error, {
  title: 'Transaction Failed',
  message: 'Please check your balance and try again.',
  duration: 10000, // 10 seconds
  action: {
    label: 'Retry',
    onClick: () => retryTransaction(),
  },
});
*/
