// DECISION: Separate filter model from the Policy domain model.
// ALTERNATIVES CONSIDERED: Using Partial<Policy> directly as the filter type.
// REASON: Partial<Policy> would expose fields irrelevant to filtering (premiumAmount,
//         underwriter name as exact match, etc.) and wouldn't model multi-value
//         selections (e.g. filtering by multiple statuses at once). A dedicated
//         model makes the filter contract explicit and allows independent evolution.

import { Currency, LineOfBusiness, PolicyStatus, Region } from './policy.model';

/**
 * Represents the set of active filter criteria applied to the policy list.
 *
 * All fields are optional — an empty PolicyFilter object means "no filters applied".
 * Multi-value fields are arrays to support "select multiple" UI controls.
 *
 * WHY THIS APPROACH: Array-based multi-select for status/region/LOB rather than
 * a single string per field. The dashboard requirement includes multi-select
 * filter chips; a single-value model would require a breaking change later.
 */
export interface PolicyFilter {
  /**
   * Free-text search applied against policyNumber and policyHolderName fields.
   * Case-insensitive substring match on the server; passed as a query param.
   */
  search?: string;

  /**
   * One or more policy statuses to include.
   * Empty array or undefined means all statuses are included.
   */
  statuses?: PolicyStatus[];

  /**
   * One or more APAC regions to include.
   * Empty array or undefined means all regions are included.
   */
  regions?: Region[];

  /**
   * One or more lines of business to include.
   * Empty array or undefined means all lines are included.
   */
  linesOfBusiness?: LineOfBusiness[];

  /**
   * One or more currency codes to include.
   * Empty array or undefined means all currencies are included.
   */
  currencies?: Currency[];

  /**
   * When true, returns only policies flagged for review.
   * When false or undefined, no flag filter is applied.
   */
  flaggedForReview?: boolean;

  /**
   * Minimum premium amount filter (inclusive).
   * Combined with premiumMax to form a range filter.
   */
  premiumMin?: number;

  /**
   * Maximum premium amount filter (inclusive).
   * Combined with premiumMin to form a range filter.
   */
  premiumMax?: number;
}
