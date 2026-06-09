// DECISION: Plain TypeScript interfaces (not classes) for domain models.
// ALTERNATIVES CONSIDERED: Classes with constructors, Zod schemas for runtime validation.
// REASON: Interfaces are erased at compile time — zero runtime cost. Zod validation
//         belongs at the API boundary (interceptor/adapter layer) in a later phase,
//         not here in the domain model. Classes would add unnecessary serialisation
//         overhead when passing data through Angular signals.

/**
 * Represents the set of possible lifecycle statuses for an insurance policy.
 *
 * WHY THIS APPROACH: A string union type rather than an enum gives us literal
 * type narrowing without the compiled enum object being included in the bundle,
 * and works naturally with Angular template pipes and NgSwitch.
 */
export type PolicyStatus = 'Active' | 'Pending' | 'Expired' | 'Cancelled';

/**
 * Represents the Chubb APAC lines of business underwritten in this system.
 *
 * WHY THIS APPROACH: String union rather than enum — same reasoning as PolicyStatus.
 * A&H (Accident & Health) is kept as-is to match the domain vocabulary used by
 * underwriters; renaming it would create a mismatch with source data.
 */
export type LineOfBusiness = 'Property' | 'Casualty' | 'Marine' | 'A&H';

/**
 * Represents the APAC regions served by Chubb in this portfolio.
 * All 8 regions align with Chubb's APAC operational footprint.
 */
export type Region =
  | 'Singapore'
  | 'Hong Kong'
  | 'Australia'
  | 'Japan'
  | 'Thailand'
  | 'Indonesia'
  | 'Malaysia'
  | 'Philippines';

/**
 * ISO 4217 currency codes used across APAC policy premiums.
 * Constrained to the 6 currencies present in the mock data and expected
 * in the real backend.
 */
export type Currency = 'USD' | 'SGD' | 'HKD' | 'AUD' | 'JPY' | 'THB';

/**
 * Core domain model representing a single insurance policy.
 *
 * This is the canonical shape of a policy record as returned by the API
 * and stored in the signal-based state store. All other feature models
 * (PolicySummary, PolicyQueryParams) derive from or reference this interface.
 *
 * WHY THIS APPROACH: A single canonical Policy interface rather than separate
 * "list item" and "detail" interfaces at this layer. The summary projection
 * (PolicySummary) picks the subset needed for table display, keeping the full
 * interface as the store's source of truth.
 */
export interface Policy {
  /** UUID v4 — primary key, used as the Angular route parameter for detail view. */
  id: string;

  /** Human-readable policy identifier in POL-XXXXXX format. */
  policyNumber: string;

  /** Full legal name of the insured entity (individual or corporate). */
  policyHolderName: string;

  /** Chubb APAC line of business under which this policy is written. */
  lineOfBusiness: LineOfBusiness;

  /** Current lifecycle status of the policy. */
  status: PolicyStatus;

  /** APAC region where the risk is domiciled. */
  region: Region;

  /**
   * Annual gross written premium expressed in the policy's currency.
   * Stored as a plain number; formatting (locale, symbol) is handled
   * by the CurrencyPipe in the template layer.
   */
  premiumAmount: number;

  /** ISO 4217 currency code for the premiumAmount field. */
  currency: Currency;

  /** Policy inception date in YYYY-MM-DD format. */
  effectiveDate: string;

  /** Policy expiry date in YYYY-MM-DD format. Always 1 year after effectiveDate. */
  expiryDate: string;

  /** Full name of the assigned underwriter. */
  underwriter: string;

  /**
   * Whether this policy has been flagged for manual underwriter review.
   * Used to surface a "Review Required" badge and filter in the dashboard.
   */
  flaggedForReview: boolean;
}
