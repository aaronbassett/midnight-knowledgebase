# User Messaging

Guidelines for translating technical errors into user-friendly messages that help users understand what happened and what they can do.

## Overview

Good error messages are:

- **Clear** - Use simple language without jargon
- **Specific** - Tell users exactly what went wrong
- **Actionable** - Explain what users can do to resolve it
- **Honest** - Don't hide problems or blame users unfairly
- **Accessible** - Work with screen readers and assistive technology

## Mapping Technical Errors to User Messages

### The Translation Pattern

Every technical error should map to three user-facing components:

```typescript
interface UserFacingError {
  /** Short headline for the error */
  title: string;

  /** Explanation of what happened */
  description: string;

  /** What the user can do about it */
  suggestion: string;

  /** Optional: Technical details for advanced users */
  technicalDetails?: string;

  /** Severity level for styling */
  severity: 'error' | 'warning' | 'info';
}
```

### Translation Examples

| Technical Error | User Title | User Description |
|----------------|------------|------------------|
| `ECONNREFUSED localhost:6300` | "Proof Server Offline" | "The proof server isn't running on your computer" |
| `Circuit constraint failed at gate 1042` | "Transaction Invalid" | "The amount exceeds what's allowed" |
| `WitnessError: credential not found` | "Missing Credential" | "We couldn't find the required credential in your wallet" |
| `Transaction rejected: insufficient gas` | "Insufficient Funds" | "Your account doesn't have enough to cover transaction fees" |

### Implementation

```typescript
function translateError(error: unknown): UserFacingError {
  // Handle typed errors
  if (error instanceof MidnightError) {
    return ERROR_CATALOG[error.code];
  }

  // Classify unknown errors by message patterns
  const message = error instanceof Error ? error.message : String(error);
  return classifyByPattern(message);
}

function classifyByPattern(message: string): UserFacingError {
  const lowerMessage = message.toLowerCase();

  // Connection errors
  if (lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('connection refused')) {
    if (lowerMessage.includes('6300')) {
      return {
        title: 'Proof Server Offline',
        description: 'The proof server is not running on your computer.',
        suggestion: 'Start the proof server and try again.',
        severity: 'error',
      };
    }
    return {
      title: 'Connection Failed',
      description: 'Unable to connect to the required service.',
      suggestion: 'Check your connection and try again.',
      severity: 'error',
    };
  }

  // Balance errors
  if (lowerMessage.includes('insufficient') ||
      lowerMessage.includes('balance')) {
    return {
      title: 'Insufficient Balance',
      description: 'You don\'t have enough tokens for this transaction.',
      suggestion: 'Add funds to your wallet and try again.',
      severity: 'error',
    };
  }

  // Rejection errors
  if (lowerMessage.includes('rejected') ||
      lowerMessage.includes('denied') ||
      lowerMessage.includes('cancelled')) {
    return {
      title: 'Transaction Cancelled',
      description: 'The transaction was cancelled.',
      suggestion: 'You can try again when ready.',
      severity: 'info',
    };
  }

  // Timeout errors
  if (lowerMessage.includes('timeout') ||
      lowerMessage.includes('timed out')) {
    return {
      title: 'Request Timed Out',
      description: 'The operation took too long to complete.',
      suggestion: 'Please try again. If this persists, try later.',
      severity: 'warning',
    };
  }

  // Default fallback
  return {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred.',
    suggestion: 'Please try again. If the problem continues, contact support.',
    severity: 'error',
  };
}
```

## Tone and Clarity Guidelines

### Do

- **Use everyday language**: "You don't have enough tokens" instead of "Insufficient balance"
- **Be specific**: "The proof server isn't running" instead of "Service unavailable"
- **Be helpful**: Always include what the user can do
- **Be honest**: "We couldn't process this" instead of vague "Error occurred"
- **Use contractions**: "You'll" and "can't" feel more natural

### Don't

- **Use technical jargon**: Avoid "ECONNREFUSED", "circuit constraint", "gas exhausted"
- **Blame the user**: "Invalid input" sounds accusatory
- **Be vague**: "Something went wrong" without context isn't helpful
- **Use error codes alone**: "Error E1042" means nothing to users
- **Use all caps**: "ERROR" feels aggressive
- **Use exclamation marks**: They can feel alarming

### Examples

| Bad | Good |
|-----|------|
| "Error: INSUFFICIENT_BALANCE" | "You need more tokens to complete this transfer" |
| "Network error occurred" | "We couldn't reach the network. Check your internet connection." |
| "Invalid input!" | "Please enter a valid amount" |
| "Transaction failed" | "This transfer couldn't be completed because..." |
| "Unauthorized" | "Please connect your wallet to continue" |

## Action-Oriented Error Messages

Every error message should answer: "What should I do now?"

### Structure

```
[What happened] + [Why it matters] + [What to do]
```

### Examples

```typescript
const ACTIONABLE_MESSAGES = {
  INSUFFICIENT_BALANCE: {
    what: "Your balance is too low for this transfer",
    why: "You need to cover both the amount and transaction fees",
    action: "Add more tokens to your wallet, then try again",
  },

  PROOF_SERVER_DOWN: {
    what: "The proof server isn't responding",
    why: "Without it, we can't create the cryptographic proof for your transaction",
    action: "Start the proof server with Docker, then refresh this page",
  },

  WALLET_NOT_CONNECTED: {
    what: "Your wallet isn't connected",
    why: "We need your wallet to sign and send transactions",
    action: "Click 'Connect Wallet' to get started",
  },

  NETWORK_OFFLINE: {
    what: "You appear to be offline",
    why: "We can't reach the network to process transactions",
    action: "Check your internet connection and try again",
  },
};
```

### Providing Clear Actions

```typescript
interface ErrorAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface ActionableError extends UserFacingError {
  actions: ErrorAction[];
}

function getActionsForError(error: MidnightError): ErrorAction[] {
  switch (error.code) {
    case 'PROOF_SERVER_UNAVAILABLE':
      return [
        {
          label: 'View Setup Instructions',
          onClick: () => window.open('/docs/proof-server-setup', '_blank'),
          primary: true,
        },
        {
          label: 'Check Status',
          onClick: () => checkProofServerStatus(),
        },
      ];

    case 'INSUFFICIENT_BALANCE':
      return [
        {
          label: 'View Balance',
          onClick: () => navigateToWallet(),
          primary: true,
        },
      ];

    case 'WALLET_DISCONNECTED':
      return [
        {
          label: 'Reconnect Wallet',
          onClick: () => connectWallet(),
          primary: true,
        },
      ];

    default:
      return [
        {
          label: 'Try Again',
          onClick: () => retryLastAction(),
          primary: true,
        },
      ];
  }
}
```

## When to Show Details vs Hide Complexity

### Show Details When

1. **Users can act on them**: "You need 50 more tokens" is actionable
2. **Advanced users need debugging info**: Expandable technical details
3. **The error is unusual**: Help users report issues accurately
4. **Transaction hashes are involved**: Let users verify on explorer

### Hide Complexity When

1. **Technical details don't help**: Stack traces scare users
2. **The fix is simple**: Don't overwhelm with background info
3. **It's a common error**: Users just need to retry
4. **Security is involved**: Don't expose internal error handling

### Progressive Disclosure Pattern

```tsx
function ErrorMessage({ error }: { error: ClassifiedError }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="error-message" role="alert">
      <h3>{error.title}</h3>
      <p>{error.description}</p>
      <p className="suggestion">{error.suggestion}</p>

      {error.technicalDetails && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
        >
          {showDetails ? 'Hide' : 'Show'} technical details
        </button>
      )}

      {showDetails && error.technicalDetails && (
        <pre className="technical-details">
          <code>{error.technicalDetails}</code>
        </pre>
      )}

      <div className="actions">
        {error.actions?.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={action.primary ? 'primary' : 'secondary'}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

## Accessibility Considerations

### ARIA Roles and Attributes

```tsx
// Use role="alert" for important errors
<div role="alert" aria-live="assertive">
  <h3 id="error-title">{error.title}</h3>
  <p id="error-desc">{error.description}</p>
</div>

// Use aria-live="polite" for non-critical notifications
<div aria-live="polite">
  Transaction submitted. Waiting for confirmation...
</div>

// Associate form errors with inputs
<input
  id="amount"
  aria-invalid={hasError}
  aria-describedby="amount-error"
/>
{hasError && (
  <p id="amount-error" role="alert">
    Please enter a valid amount
  </p>
)}
```

### Screen Reader Considerations

```typescript
// Don't rely only on color
// Bad: Red text for errors
// Good: Icon + text + color

// Announce error counts
const errorSummary = `${errors.length} ${errors.length === 1 ? 'error' : 'errors'} found`;

// Provide context for icons
<span aria-hidden="true">⚠️</span>
<span className="sr-only">Warning:</span>

// Make error dismissable via keyboard
<button
  onClick={dismissError}
  aria-label={`Dismiss error: ${error.title}`}
>
  <span aria-hidden="true">×</span>
</button>
```

### Color and Contrast

```css
/* Ensure sufficient contrast for error states */
.error-message {
  background: #fef2f2; /* Light red background */
  color: #991b1b; /* Dark red text - 7:1 contrast ratio */
  border-left: 4px solid #dc2626; /* Visual indicator beyond color */
}

/* Don't use color alone to convey meaning */
.error-icon::before {
  content: "⚠"; /* Icon provides meaning */
}
```

### Focus Management

```typescript
// Move focus to error message when it appears
function showError(error: ClassifiedError) {
  const errorContainer = document.getElementById('error-container');

  // Render error
  renderError(error, errorContainer);

  // Move focus to error
  errorContainer?.focus();
}

// Trap focus in error modals
function ErrorModal({ error, onClose }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus first focusable element
    const focusable = modalRef.current?.querySelector('button, [href], input');
    (focusable as HTMLElement)?.focus();

    // Trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={modalRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
      aria-describedby="error-modal-desc"
    >
      <h2 id="error-modal-title">{error.title}</h2>
      <p id="error-modal-desc">{error.description}</p>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

## Error Message Catalog

Maintain a central catalog for consistency:

```typescript
export const ERROR_CATALOG: Record<string, UserFacingError> = {
  // Proof errors
  PROOF_TIMEOUT: {
    title: 'Taking Longer Than Expected',
    description: 'Generating the cryptographic proof is taking longer than usual.',
    suggestion: 'Please wait a moment. If this continues, try refreshing the page.',
    severity: 'warning',
  },

  PROOF_SERVER_UNAVAILABLE: {
    title: 'Proof Server Not Running',
    description: 'The local proof server needs to be running to process transactions.',
    suggestion: 'Start the proof server with Docker, then try again.',
    technicalDetails: 'docker run -d -p 6300:6300 midnightnetwork/proof-server',
    severity: 'error',
  },

  CONSTRAINT_VIOLATION: {
    title: 'Transaction Cannot Be Completed',
    description: 'The transaction inputs don\'t meet the required conditions.',
    suggestion: 'Check your inputs and try again.',
    severity: 'error',
  },

  // Wallet errors
  WALLET_NOT_INSTALLED: {
    title: 'Wallet Required',
    description: 'You need the Lace wallet extension to use this application.',
    suggestion: 'Install Lace from lace.io, then refresh this page.',
    severity: 'error',
  },

  WALLET_REJECTED: {
    title: 'Connection Declined',
    description: 'You declined the wallet connection request.',
    suggestion: 'Click Connect Wallet to try again when ready.',
    severity: 'info',
  },

  // Transaction errors
  INSUFFICIENT_BALANCE: {
    title: 'Not Enough Tokens',
    description: 'Your balance is too low for this transaction.',
    suggestion: 'Add more tokens to your wallet and try again.',
    severity: 'error',
  },

  TRANSACTION_REJECTED: {
    title: 'Transaction Cancelled',
    description: 'You cancelled the transaction.',
    suggestion: 'You can try again when ready.',
    severity: 'info',
  },

  // Network errors
  OFFLINE: {
    title: 'You\'re Offline',
    description: 'No internet connection detected.',
    suggestion: 'Check your connection and try again.',
    severity: 'error',
  },

  NETWORK_ERROR: {
    title: 'Network Problem',
    description: 'We\'re having trouble reaching the network.',
    suggestion: 'Check your connection or try again in a moment.',
    severity: 'warning',
  },
};
```

## Testing Error Messages

### Readability Testing

```typescript
// Use automated readability checks
import { fleschReadingEase } from 'reading-ease';

describe('Error Message Readability', () => {
  Object.entries(ERROR_CATALOG).forEach(([code, error]) => {
    it(`${code} description should be readable`, () => {
      const score = fleschReadingEase(error.description);
      // Score of 60+ is "easily understood by 13-15 year olds"
      expect(score).toBeGreaterThan(60);
    });
  });
});
```

### User Testing Checklist

- [ ] Can users understand what happened without technical knowledge?
- [ ] Do users know what action to take?
- [ ] Is the tone helpful, not blaming?
- [ ] Are critical errors distinguishable from warnings?
- [ ] Do screen readers announce errors appropriately?
- [ ] Can keyboard-only users interact with error dialogs?

## Best Practices Summary

1. **Human first** - Write for people, not logs
2. **Be specific** - Generic errors are unhelpful
3. **Guide action** - Every error needs a next step
4. **Show empathy** - "We couldn't" not "You failed"
5. **Progressive disclosure** - Hide complexity by default
6. **Consistent catalog** - Maintain central error definitions
7. **Test accessibility** - Verify screen reader compatibility
8. **Test with users** - Real feedback reveals unclear messaging
