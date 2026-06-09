// DECISION: Separate summary projection from the full Policy interface.
// ALTERNATIVES CONSIDERED: Displaying full Policy objects in the table and
//         letting the template ignore unused fields.
// REASON: The policy list table displays ~8 of the 13 Policy fields. Keeping
//         a typed projection makes it clear which fields the table contract
//         depends on, enables future API response shaping, and prevents
//         accidentally binding to raw Policy fields not in scope for the table.

import { Currency, LineOfBusiness, PolicyStatus, Region } from './policy.model';

/**
 * A read-only projection of Policy fields used by the policy list table.
 *
 * WHY THIS APPROACH: Pick<Policy, ...> rather than extending Policy keeps the
 * summary type structurally independent. If the table ever needs a computed
 * field (e.g. daysToExpiry) that doesn't exist on Policy, we can add it here
 * without touching the canonical model.
 */
export interface PolicySummary {
  /** UUID v4 — used as the router link parameter to the detail view. */
  readonly id: string;

  /** Displayed in the first column of the policy list table. */
  readonly policyNumber: string;

  /** Displayed in the policyholder name column. */
  readonly policyHolderName: string;

  /** Displayed as a badge chip in the line of business column. */
  readonly lineOfBusiness: LineOfBusiness;

  /** Displayed as a colour-coded status badge. */
  readonly status: PolicyStatus;

  /** Displayed in the region column with a flag icon. */
  readonly region: Region;

  /** Formatted by CurrencyPipe with the policy's currency code. */
  readonly premiumAmount: number;

  /** Paired with premiumAmount for CurrencyPipe formatting. */
  readonly currency: Currency;

  /** Displayed in the expiry column; drives the "expiring soon" indicator. */
  readonly expiryDate: string;

  /** Drives the "Review Required" icon badge in the table row. */
  readonly flaggedForReview: boolean;
}
