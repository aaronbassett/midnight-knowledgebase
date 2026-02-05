/**
 * Disclosure Types - Type definitions for privacy disclosure information
 *
 * These types represent different kinds of data disclosures that can occur
 * when executing Midnight transactions with disclose() calls.
 */

// =============================================================================
// Disclosure Type Definitions
// =============================================================================

/**
 * Base disclosure information common to all disclosure types
 */
interface BaseDisclosure {
  /** Unique identifier for this disclosure */
  id: string;

  /** Field name in the contract/circuit */
  field: string;

  /** Human-readable label for display */
  label: string;

  /** Explanation of what this disclosure means */
  description: string;

  /** Whether this disclosure is required for the transaction */
  required: boolean;
}

/**
 * Full disclosure - exact value is revealed on-chain
 *
 * Example: disclose(balance) reveals the exact balance value
 */
export interface FullDisclosure extends BaseDisclosure {
  type: "full";

  /** The actual value being disclosed */
  value: string | number | bigint;

  /** Formatted value for display */
  displayValue: string;

  /** Data type of the value */
  dataType: "number" | "string" | "address" | "bytes" | "boolean";
}

/**
 * Range disclosure - reveals a value is within a range
 *
 * Example: age > 18 reveals "over 18" without exact age
 */
export interface RangeDisclosure extends BaseDisclosure {
  type: "range";

  /** The comparison condition */
  condition: string;

  /** Description of what range is proven */
  rangeDescription: string;

  /** Whether the comparison result is public */
  resultPublic: boolean;
}

/**
 * Membership disclosure - reveals membership in a set
 *
 * Example: Proving you hold a valid credential without revealing which one
 */
export interface MembershipDisclosure extends BaseDisclosure {
  type: "membership";

  /** Name of the set being checked */
  setName: string;

  /** Description of the set */
  setDescription: string;

  /** Number of members in the set (if known) */
  setSize?: number;
}

/**
 * Existence disclosure - reveals that something exists
 *
 * Example: Proving you have a non-zero balance without revealing amount
 */
export interface ExistenceDisclosure extends BaseDisclosure {
  type: "existence";

  /** What is being proven to exist */
  subject: string;

  /** Whether non-existence is also revealed if check fails */
  revealAbsence: boolean;
}

/**
 * Computed disclosure - reveals a computed/derived value
 *
 * Example: hash(secret) reveals the hash but not the secret
 */
export interface ComputedDisclosure extends BaseDisclosure {
  type: "computed";

  /** Description of the computation */
  computation: string;

  /** Inputs to the computation (names only, not values) */
  inputs: string[];

  /** Whether the computation is reversible */
  reversible: boolean;
}

/**
 * Union type of all disclosure types
 */
export type Disclosure =
  | FullDisclosure
  | RangeDisclosure
  | MembershipDisclosure
  | ExistenceDisclosure
  | ComputedDisclosure;

// =============================================================================
// Risk Assessment Types
// =============================================================================

/**
 * Risk level for a disclosure
 */
export type DisclosureRiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Risk assessment for a disclosure
 */
export interface DisclosureRisk {
  /** Overall risk level */
  level: DisclosureRiskLevel;

  /** Risk score (0-100) */
  score: number;

  /** Factors contributing to the risk */
  factors: string[];

  /** Recommended actions */
  recommendations: string[];
}

/**
 * Summary of all disclosures in a transaction
 */
export interface DisclosureSummary {
  /** All disclosures in the transaction */
  disclosures: Disclosure[];

  /** Overall privacy level of the transaction */
  privacyLevel: "private" | "partial" | "public";

  /** Highest risk level among all disclosures */
  maxRiskLevel: DisclosureRiskLevel;

  /** Count of disclosures by type */
  counts: {
    full: number;
    range: number;
    membership: number;
    existence: number;
    computed: number;
  };

  /** Whether user consent is required */
  requiresConsent: boolean;
}

// =============================================================================
// Risk Assessment Functions
// =============================================================================

/**
 * Assess risk level for a single disclosure
 */
export function assessDisclosureRisk(disclosure: Disclosure): DisclosureRisk {
  const factors: string[] = [];
  const recommendations: string[] = [];
  let score = 0;

  // Base risk by disclosure type
  switch (disclosure.type) {
    case "full":
      score += 70;
      factors.push("Exact value revealed on-chain");

      if (disclosure.dataType === "address") {
        score += 20;
        factors.push("Address can be linked to identity");
      }
      if (disclosure.dataType === "number" && typeof disclosure.value === "bigint") {
        if (disclosure.value > 1_000_000n) {
          score += 10;
          factors.push("Large value may attract attention");
        }
      }

      recommendations.push("Verify this value should be public");
      recommendations.push("Consider if a range proof would suffice");
      break;

    case "range":
      score += 30;
      factors.push("Range information revealed");

      if (disclosure.resultPublic) {
        score += 20;
        factors.push("Comparison result is public");
      }

      recommendations.push("Check if the range reveals sensitive info");
      break;

    case "membership":
      score += 20;
      factors.push("Set membership revealed");

      if (disclosure.setSize && disclosure.setSize < 10) {
        score += 30;
        factors.push(`Small set (${disclosure.setSize} members) reduces anonymity`);
        recommendations.push("Consider if the set is too small");
      }
      break;

    case "existence":
      score += 15;
      factors.push("Existence proof");

      if (disclosure.revealAbsence) {
        score += 10;
        factors.push("Non-existence also revealed if check fails");
      }
      break;

    case "computed":
      score += 25;
      factors.push("Computed value revealed");

      if (disclosure.reversible) {
        score += 30;
        factors.push("Computation may be reversible");
        recommendations.push("Verify the computation cannot be reversed");
      }
      break;
  }

  // Required disclosures are slightly lower risk (user expects them)
  if (disclosure.required) {
    score = Math.max(0, score - 10);
  }

  // Determine level
  let level: DisclosureRiskLevel;
  if (score >= 80) level = "critical";
  else if (score >= 60) level = "high";
  else if (score >= 30) level = "medium";
  else level = "low";

  return {
    level,
    score,
    factors,
    recommendations,
  };
}

/**
 * Create a summary of all disclosures
 */
export function summarizeDisclosures(disclosures: Disclosure[]): DisclosureSummary {
  const counts = {
    full: 0,
    range: 0,
    membership: 0,
    existence: 0,
    computed: 0,
  };

  let maxRiskLevel: DisclosureRiskLevel = "low";
  const riskOrder: DisclosureRiskLevel[] = ["low", "medium", "high", "critical"];

  for (const d of disclosures) {
    counts[d.type]++;

    const risk = assessDisclosureRisk(d);
    if (riskOrder.indexOf(risk.level) > riskOrder.indexOf(maxRiskLevel)) {
      maxRiskLevel = risk.level;
    }
  }

  // Determine privacy level
  let privacyLevel: "private" | "partial" | "public";
  if (disclosures.length === 0) {
    privacyLevel = "private";
  } else if (counts.full > 0) {
    privacyLevel = "public";
  } else {
    privacyLevel = "partial";
  }

  // Consent required for any non-trivial disclosure
  const requiresConsent =
    disclosures.length > 0 &&
    (counts.full > 0 || maxRiskLevel === "high" || maxRiskLevel === "critical");

  return {
    disclosures,
    privacyLevel,
    maxRiskLevel,
    counts,
    requiresConsent,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a disclosure value for display
 */
export function formatDisclosureValue(disclosure: FullDisclosure): string {
  switch (disclosure.dataType) {
    case "number":
      if (typeof disclosure.value === "bigint") {
        return disclosure.value.toLocaleString();
      }
      return Number(disclosure.value).toLocaleString();

    case "address":
      const addr = String(disclosure.value);
      if (addr.length > 20) {
        return `${addr.slice(0, 12)}...${addr.slice(-8)}`;
      }
      return addr;

    case "bytes":
      const bytes = String(disclosure.value);
      if (bytes.length > 20) {
        return `${bytes.slice(0, 10)}...`;
      }
      return bytes;

    case "boolean":
      return disclosure.value ? "Yes" : "No";

    default:
      return String(disclosure.value);
  }
}

/**
 * Get icon for disclosure type
 */
export function getDisclosureIcon(type: Disclosure["type"]): string {
  switch (type) {
    case "full":
      return "eye"; // Full visibility
    case "range":
      return "sliders"; // Range/comparison
    case "membership":
      return "users"; // Group membership
    case "existence":
      return "check-circle"; // Existence check
    case "computed":
      return "calculator"; // Computation
  }
}

/**
 * Get color for risk level
 */
export function getRiskColor(level: DisclosureRiskLevel): string {
  switch (level) {
    case "low":
      return "#10b981"; // Green
    case "medium":
      return "#f59e0b"; // Amber
    case "high":
      return "#f97316"; // Orange
    case "critical":
      return "#ef4444"; // Red
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a full disclosure
 */
export function createFullDisclosure(
  field: string,
  label: string,
  value: string | number | bigint,
  options?: Partial<FullDisclosure>
): FullDisclosure {
  return {
    id: `disclosure-${field}-${Date.now()}`,
    type: "full",
    field,
    label,
    value,
    displayValue: String(value),
    dataType: typeof value === "bigint" ? "number" : typeof value as FullDisclosure["dataType"],
    description: `Your exact ${label.toLowerCase()} will be visible on the blockchain`,
    required: true,
    ...options,
  };
}

/**
 * Create a range disclosure
 */
export function createRangeDisclosure(
  field: string,
  label: string,
  condition: string,
  options?: Partial<RangeDisclosure>
): RangeDisclosure {
  return {
    id: `disclosure-${field}-${Date.now()}`,
    type: "range",
    field,
    label,
    condition,
    rangeDescription: condition,
    resultPublic: true,
    description: `Others will know: ${condition}`,
    required: true,
    ...options,
  };
}

/**
 * Create a membership disclosure
 */
export function createMembershipDisclosure(
  field: string,
  label: string,
  setName: string,
  options?: Partial<MembershipDisclosure>
): MembershipDisclosure {
  return {
    id: `disclosure-${field}-${Date.now()}`,
    type: "membership",
    field,
    label,
    setName,
    setDescription: `Members of ${setName}`,
    description: `Others will know you are a member of ${setName}`,
    required: true,
    ...options,
  };
}
