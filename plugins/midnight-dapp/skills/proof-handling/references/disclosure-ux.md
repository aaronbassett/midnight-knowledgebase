# Disclosure UX

When Compact circuits use `disclose()`, private data becomes public. Users must understand and consent to what they're revealing.

## What Is Disclosure?

In Midnight, most computations stay private. But sometimes you need to reveal specific values:

```compact
witness get_age(): Uint<8>;

export circuit verify_adult(): Boolean {
    const age = get_age();

    // This comparison reveals whether age > 18
    // but not the exact age
    return age > 18;
}

export circuit reveal_age(): Uint<8> {
    const age = get_age();

    // This explicitly reveals the exact age on-chain
    return disclose(age);
}
```

### Types of Information Disclosure

| Type | What's Revealed | Example |
|------|-----------------|---------|
| **Explicit disclosure** | Exact value | `disclose(balance)` reveals `1000` |
| **Comparison result** | Boolean outcome | `balance > 100` reveals "has more than 100" |
| **Existence proof** | That something exists | Proving you have a credential |
| **Set membership** | You're in a group | Proving you're a verified user |

## Privacy Disclosure Patterns

### Pattern 1: Full Disclosure

User reveals the exact value.

```typescript
interface FullDisclosure {
  type: "full";
  field: string;
  label: string;
  value: string | number | bigint;
  description: string;
}

const disclosure: FullDisclosure = {
  type: "full",
  field: "age",
  label: "Your Age",
  value: 25,
  description: "Your exact age will be permanently recorded on the blockchain"
};
```

**UI Treatment:**
```
┌─────────────────────────────────────────────────┐
│  ⚠️ Data Disclosure                              │
│                                                 │
│  Your Age: 25                                   │
│                                                 │
│  Your exact age will be permanently recorded    │
│  on the blockchain.                             │
│                                                 │
│  [Cancel]                    [I Understand]     │
└─────────────────────────────────────────────────┘
```

### Pattern 2: Range Disclosure

User reveals they're within a range without the exact value.

```typescript
interface RangeDisclosure {
  type: "range";
  field: string;
  label: string;
  condition: string;
  description: string;
}

const disclosure: RangeDisclosure = {
  type: "range",
  field: "age",
  label: "Age Verification",
  condition: "Over 18",
  description: "Others will know you are over 18, but not your exact age"
};
```

**UI Treatment:**
```
┌─────────────────────────────────────────────────┐
│  🔒 Range Proof                                  │
│                                                 │
│  Age Verification: Over 18                      │
│                                                 │
│  Others will know you are over 18, but not      │
│  your exact age.                                │
│                                                 │
│  [Cancel]                    [Verify]           │
└─────────────────────────────────────────────────┘
```

### Pattern 3: Membership Disclosure

User proves they belong to a set.

```typescript
interface MembershipDisclosure {
  type: "membership";
  field: string;
  label: string;
  setName: string;
  description: string;
}

const disclosure: MembershipDisclosure = {
  type: "membership",
  field: "credentials",
  label: "Credential Verification",
  setName: "Verified Users",
  description: "Others will know you hold a valid credential, but not which one"
};
```

**UI Treatment:**
```
┌─────────────────────────────────────────────────┐
│  ✓ Membership Proof                             │
│                                                 │
│  Prove membership in: Verified Users            │
│                                                 │
│  Others will know you hold a valid credential,  │
│  but not which specific credential.             │
│                                                 │
│  [Cancel]                    [Prove]            │
└─────────────────────────────────────────────────┘
```

## User Consent UI

### Pre-Transaction Disclosure Modal

Always show disclosures before generating proofs:

```typescript
interface DisclosureConsentProps {
  disclosures: Disclosure[];
  transactionType: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DisclosureConsent({
  disclosures,
  transactionType,
  onConfirm,
  onCancel
}: DisclosureConsentProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const hasHighRiskDisclosure = disclosures.some(d => d.type === "full");

  return (
    <Modal>
      <h2>Review Privacy Disclosure</h2>

      <p>
        This {transactionType} will reveal the following information
        on the blockchain:
      </p>

      <ul className="disclosure-list">
        {disclosures.map((disclosure, index) => (
          <DisclosureItem key={index} disclosure={disclosure} />
        ))}
      </ul>

      {hasHighRiskDisclosure && (
        <Warning>
          This transaction reveals exact values that will be
          permanently visible on the blockchain.
        </Warning>
      )}

      <label className="acknowledgment">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        I understand what information will be disclosed
      </label>

      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button
          onClick={onConfirm}
          disabled={!acknowledged}
          className="primary"
        >
          Proceed
        </button>
      </div>
    </Modal>
  );
}
```

### Disclosure Item Component

```typescript
function DisclosureItem({ disclosure }: { disclosure: Disclosure }) {
  const icon = getDisclosureIcon(disclosure.type);
  const riskLevel = getDisclosureRisk(disclosure.type);

  return (
    <li className={`disclosure-item risk-${riskLevel}`}>
      <span className="icon">{icon}</span>
      <div className="content">
        <strong>{disclosure.label}</strong>
        {disclosure.type === "full" && (
          <span className="value">{formatValue(disclosure.value)}</span>
        )}
        {disclosure.type === "range" && (
          <span className="condition">{disclosure.condition}</span>
        )}
        <p className="description">{disclosure.description}</p>
      </div>
    </li>
  );
}

function getDisclosureIcon(type: Disclosure["type"]): string {
  switch (type) {
    case "full": return "⚠️";      // Warning - high exposure
    case "range": return "🔒";     // Lock - protected
    case "membership": return "✓"; // Check - verification only
  }
}

function getDisclosureRisk(type: Disclosure["type"]): "high" | "medium" | "low" {
  switch (type) {
    case "full": return "high";
    case "range": return "medium";
    case "membership": return "low";
  }
}
```

## Explaining ZK Proofs to Users

### Simple Language

Avoid cryptographic jargon:

```typescript
const explanations = {
  proofGeneration: {
    title: "Creating Verification",
    description: "Your device is creating a mathematical proof that verifies your information without revealing it.",
    analogy: "Like showing you have a valid ID without revealing your address."
  },

  localProcessing: {
    title: "Processed Locally",
    description: "All sensitive data stays on your device. Only the verification is sent.",
    analogy: "Like a sealed envelope - the contents stay private."
  },

  disclosure: {
    title: "Public Information",
    description: "Some information needs to be visible for this action to work.",
    analogy: "Like signing a public petition - your support is visible."
  }
};
```

### Educational Tooltips

```typescript
function PrivacyTooltip({ type }: { type: "proof" | "witness" | "disclosure" }) {
  const content = {
    proof: {
      title: "What is a proof?",
      text: "A proof lets you prove something is true without revealing the details. For example, proving you're over 18 without showing your birthday."
    },
    witness: {
      title: "What is private data?",
      text: "Private data stays on your device. It's used to create proofs but is never sent to the network."
    },
    disclosure: {
      title: "What is disclosure?",
      text: "Sometimes you need to reveal specific information. This data becomes publicly visible on the blockchain."
    }
  };

  return (
    <Tooltip>
      <h4>{content[type].title}</h4>
      <p>{content[type].text}</p>
    </Tooltip>
  );
}
```

### Progress Explanations

```typescript
const proofStages = {
  preparing: {
    label: "Preparing",
    description: "Setting up the verification process"
  },
  generating: {
    label: "Generating Proof",
    description: "Creating mathematical proof from your private data"
  },
  proving: {
    label: "Finalizing",
    description: "Completing the zero-knowledge verification"
  },
  submitting: {
    label: "Submitting",
    description: "Sending your verified transaction to the network"
  }
};
```

## Trust Indicators

### Showing Privacy Guarantees

```typescript
interface PrivacyIndicator {
  level: "private" | "disclosed" | "mixed";
  privateFields: string[];
  disclosedFields: string[];
}

function TransactionPrivacyBadge({ indicator }: { indicator: PrivacyIndicator }) {
  return (
    <div className={`privacy-badge ${indicator.level}`}>
      {indicator.level === "private" && (
        <>
          <span className="icon">🔒</span>
          <span>Fully Private Transaction</span>
        </>
      )}

      {indicator.level === "disclosed" && (
        <>
          <span className="icon">👁️</span>
          <span>Public Transaction</span>
        </>
      )}

      {indicator.level === "mixed" && (
        <>
          <span className="icon">🔓</span>
          <span>Partial Disclosure</span>
          <ul>
            <li>Private: {indicator.privateFields.join(", ")}</li>
            <li>Public: {indicator.disclosedFields.join(", ")}</li>
          </ul>
        </>
      )}
    </div>
  );
}
```

### Verification Status

```typescript
function ProofVerificationStatus({
  status
}: {
  status: "unverified" | "verified" | "failed"
}) {
  const config = {
    unverified: {
      icon: "⏳",
      label: "Pending Verification",
      color: "gray"
    },
    verified: {
      icon: "✓",
      label: "Cryptographically Verified",
      color: "green"
    },
    failed: {
      icon: "✗",
      label: "Verification Failed",
      color: "red"
    }
  };

  const { icon, label, color } = config[status];

  return (
    <div className={`verification-status ${color}`}>
      <span className="icon">{icon}</span>
      <span className="label">{label}</span>
    </div>
  );
}
```

## Best Practices

### 1. Always Show Disclosures Before Action

Never generate proofs without user awareness of disclosures:

```typescript
// Good: Show disclosure first
const handleTransaction = async () => {
  // Analyze what will be disclosed
  const disclosures = analyzeDisclosures(transactionType, params);

  // Show consent modal
  const confirmed = await showDisclosureModal(disclosures);
  if (!confirmed) return;

  // Only then generate proof
  await generateAndSubmitProof();
};
```

### 2. Use Progressive Disclosure

Don't overwhelm users with information:

```typescript
// Start simple
<p>This action will verify your credential.</p>

// Expandable details
<details>
  <summary>What information is shared?</summary>
  <ul>
    <li>Credential validity (yes/no)</li>
    <li>Issue date (visible)</li>
    <li>Your identity (hidden)</li>
  </ul>
</details>
```

### 3. Provide Clear Cancellation

Users should always be able to back out:

```typescript
// Prominent cancel button
<button onClick={onCancel} className="secondary">
  Cancel
</button>

// Confirmation for accidental dismissal
const handleCancel = () => {
  if (proofInProgress) {
    const confirmed = await confirm("Cancel proof generation?");
    if (!confirmed) return;
  }
  onCancel();
};
```

### 4. Remember User Preferences

For repeated actions, consider preferences (with care):

```typescript
// For non-sensitive disclosures only
const [rememberChoice, setRememberChoice] = useState(false);

if (disclosure.type !== "full" && userPreferences.skipSimilarDisclosures) {
  // Skip modal for low-risk, previously consented disclosures
  return onConfirm();
}
```

### 5. Explain Permanence

Make blockchain permanence clear:

```typescript
<Warning severity="high">
  This information will be <strong>permanently</strong> recorded
  on the blockchain and cannot be deleted or hidden later.
</Warning>
```
