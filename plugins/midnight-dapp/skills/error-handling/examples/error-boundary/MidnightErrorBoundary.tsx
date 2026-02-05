/**
 * MidnightErrorBoundary - React error boundary for Midnight DApps
 *
 * Catches JavaScript errors in child components, logs them, and displays
 * a user-friendly fallback UI with recovery options.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { classifyError, ClassifiedError, formatErrorForLogging } from './errorUtils';

// =============================================================================
// Types
// =============================================================================

export interface MidnightErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;

  /** Custom fallback UI (receives error and reset function) */
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode);

  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;

  /** Called when user resets the error boundary */
  onReset?: () => void;

  /** Key that resets the boundary when changed */
  resetKey?: string | number;

  /** Show technical details in development mode */
  showTechnicalDetails?: boolean;
}

export interface FallbackProps {
  /** The classified error */
  error: ClassifiedError;

  /** Reset the error boundary */
  resetErrorBoundary: () => void;

  /** The original error object */
  originalError: Error;

  /** Component stack trace */
  componentStack?: string;
}

interface MidnightErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  classifiedError: ClassifiedError | null;
  errorInfo: ErrorInfo | null;
}

// =============================================================================
// Component
// =============================================================================

export class MidnightErrorBoundary extends Component<
  MidnightErrorBoundaryProps,
  MidnightErrorBoundaryState
> {
  constructor(props: MidnightErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      classifiedError: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<MidnightErrorBoundaryState> {
    return {
      hasError: true,
      error,
      classifiedError: classifyError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error for debugging
    console.error('MidnightErrorBoundary caught an error:', error, errorInfo);

    // Store component stack
    this.setState({ errorInfo });

    // Call user-provided error handler
    this.props.onError?.(error, errorInfo);

    // Log to error tracking service (e.g., Sentry)
    this.logError(error, errorInfo);
  }

  componentDidUpdate(prevProps: MidnightErrorBoundaryProps): void {
    // Reset on resetKey change
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetErrorBoundary();
    }
  }

  private logError(error: Error, errorInfo: ErrorInfo): void {
    const logData = formatErrorForLogging(error, {
      componentStack: errorInfo.componentStack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry integration
      // Sentry.captureException(error, { extra: logData });
    }

    console.group('Error Boundary Log');
    console.error('Error:', logData.message);
    console.error('Code:', logData.code);
    console.error('Category:', logData.category);
    if (logData.context) {
      console.error('Context:', logData.context);
    }
    console.groupEnd();
  }

  resetErrorBoundary = (): void => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      classifiedError: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, classifiedError, errorInfo } = this.state;
    const { children, fallback, showTechnicalDetails } = this.props;

    if (hasError && error && classifiedError) {
      // Custom fallback renderer
      if (typeof fallback === 'function') {
        return fallback({
          error: classifiedError,
          resetErrorBoundary: this.resetErrorBoundary,
          originalError: error,
          componentStack: errorInfo?.componentStack,
        });
      }

      // Custom fallback element
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <DefaultErrorFallback
          error={classifiedError}
          originalError={error}
          componentStack={errorInfo?.componentStack}
          resetErrorBoundary={this.resetErrorBoundary}
          showTechnicalDetails={showTechnicalDetails ?? process.env.NODE_ENV === 'development'}
        />
      );
    }

    return children;
  }
}

// =============================================================================
// Default Fallback UI
// =============================================================================

interface DefaultErrorFallbackProps extends FallbackProps {
  showTechnicalDetails: boolean;
}

function DefaultErrorFallback({
  error,
  originalError,
  componentStack,
  resetErrorBoundary,
  showTechnicalDetails,
}: DefaultErrorFallbackProps): JSX.Element {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div
      className="midnight-error-boundary"
      role="alert"
      aria-labelledby="error-title"
      aria-describedby="error-description"
    >
      <div className="error-content">
        <div className="error-icon" aria-hidden="true">
          {getErrorIcon(error.category)}
        </div>

        <h2 id="error-title" className="error-title">
          {error.userMessage.split('.')[0]}
        </h2>

        <p id="error-description" className="error-description">
          {error.userMessage}
        </p>

        <p className="error-suggestion">
          {error.suggestion}
        </p>

        <div className="error-actions">
          <button
            onClick={resetErrorBoundary}
            className="error-button primary"
          >
            Try Again
          </button>

          <button
            onClick={() => window.location.reload()}
            className="error-button secondary"
          >
            Refresh Page
          </button>
        </div>

        {showTechnicalDetails && (
          <div className="error-details-section">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="error-details-toggle"
              aria-expanded={showDetails}
            >
              {showDetails ? 'Hide' : 'Show'} Technical Details
            </button>

            {showDetails && (
              <div className="error-technical-details">
                <div className="detail-row">
                  <span className="detail-label">Error Code:</span>
                  <code className="detail-value">{error.code}</code>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Category:</span>
                  <code className="detail-value">{error.category}</code>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Message:</span>
                  <code className="detail-value">{originalError.message}</code>
                </div>

                {originalError.stack && (
                  <details className="stack-trace">
                    <summary>Stack Trace</summary>
                    <pre>{originalError.stack}</pre>
                  </details>
                )}

                {componentStack && (
                  <details className="component-stack">
                    <summary>Component Stack</summary>
                    <pre>{componentStack}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getErrorIcon(category: string): string {
  switch (category) {
    case 'proof':
      return '\u26A0'; // Warning sign
    case 'transaction':
      return '\u2717'; // Cross mark
    case 'network':
      return '\u21BB'; // Refresh arrows
    case 'wallet':
      return '\uD83D\uDCB3'; // Credit card (wallet emoji alternative)
    default:
      return '\u26A0'; // Warning sign
  }
}

// =============================================================================
// Styles (inline for portability - use CSS modules in production)
// =============================================================================

export const errorBoundaryStyles = `
.midnight-error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 32px;
  background: #fef2f2;
  border-radius: 12px;
  border: 1px solid #fecaca;
}

.error-content {
  max-width: 480px;
  text-align: center;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-title {
  font-size: 24px;
  font-weight: 600;
  color: #991b1b;
  margin: 0 0 8px 0;
}

.error-description {
  font-size: 16px;
  color: #7f1d1d;
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.error-suggestion {
  font-size: 14px;
  color: #b91c1c;
  margin: 0 0 24px 0;
}

.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
}

.error-button {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.error-button.primary {
  background: #dc2626;
  color: white;
}

.error-button.primary:hover {
  background: #b91c1c;
}

.error-button.secondary {
  background: white;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.error-button.secondary:hover {
  background: #fef2f2;
}

.error-details-section {
  border-top: 1px solid #fecaca;
  padding-top: 16px;
}

.error-details-toggle {
  background: none;
  border: none;
  color: #b91c1c;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}

.error-technical-details {
  margin-top: 16px;
  text-align: left;
  background: white;
  border-radius: 8px;
  padding: 16px;
  font-size: 13px;
}

.detail-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.detail-label {
  font-weight: 500;
  color: #7f1d1d;
}

.detail-value {
  font-family: monospace;
  color: #991b1b;
  word-break: break-all;
}

.stack-trace,
.component-stack {
  margin-top: 12px;
}

.stack-trace summary,
.component-stack summary {
  cursor: pointer;
  font-weight: 500;
  color: #7f1d1d;
}

.stack-trace pre,
.component-stack pre {
  margin-top: 8px;
  padding: 12px;
  background: #fef2f2;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
  line-height: 1.4;
  color: #7f1d1d;
}
`;

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook to programmatically trigger the nearest error boundary
 */
export function useErrorBoundary(): {
  showBoundary: (error: Error) => void;
} {
  const [, setError] = React.useState<Error | null>(null);

  const showBoundary = React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);

  return { showBoundary };
}

/**
 * HOC to wrap a component with MidnightErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<MidnightErrorBoundaryProps, 'children'>
): React.ComponentType<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <MidnightErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </MidnightErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}
