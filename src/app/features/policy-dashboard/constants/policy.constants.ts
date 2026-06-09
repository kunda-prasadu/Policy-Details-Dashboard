// DECISION: Constants defined as typed readonly arrays, not plain string literals.
// ALTERNATIVES CONSIDERED: Enum objects, string arrays without typing.
// REASON: `as const` arrays give us `typeof POLICY_STATUSES[number]` inference
//         (which resolves to the PolicyStatus union) so these arrays can drive
//         both template iteration (*ngFor / @for) and TypeScript type checks
//         without duplicating the union definition. Enums would add a runtime
//         object and disconnect from the string-union types in policy.model.ts.

import { Currency, LineOfBusiness, PolicyStatus, Region } from '../models/policy.model';

/**
 * All valid policy lifecycle statuses, in display order.
 *
 * Used to populate filter chip groups, dropdown options, and chart legend
 * labels. The order here is the canonical display order throughout the UI.
 *
 * WHY THIS APPROACH: Derived from the PolicyStatus union via a typed const
 * assertion so adding a new status to the union produces a compile error here
 * if this array is not updated — prevents silent UI omissions.
 */
export const POLICY_STATUSES: readonly PolicyStatus[] = [
  'Active',
  'Pending',
  'Expired',
  'Cancelled',
] as const;

/**
 * All 8 APAC regions served by Chubb, in display order.
 *
 * Used to populate region filter chips, map tooltips, and the regional
 * premium distribution chart legend. Singapore is listed first as the
 * primary APAC hub.
 */
export const REGIONS: readonly Region[] = [
  'Singapore',
  'Hong Kong',
  'Australia',
  'Japan',
  'Thailand',
  'Indonesia',
  'Malaysia',
  'Philippines',
] as const;

/**
 * All lines of business underwritten by Chubb APAC, in display order.
 *
 * Used to populate LOB filter chips and the LOB breakdown chart.
 */
export const LINES_OF_BUSINESS: readonly LineOfBusiness[] = [
  'Property',
  'Casualty',
  'Marine',
  'A&H',
] as const;

/**
 * Supported currency codes across the APAC portfolio, in display order.
 *
 * Aligned with the currencies present in mock data and expected from the
 * real backend. Used to populate currency filter chips.
 */
export const CURRENCIES: readonly Currency[] = [
  'SGD',
  'HKD',
  'AUD',
  'JPY',
  'USD',
  'THB',
] as const;

/**
 * Default page size options for the policy list paginator.
 *
 * WHY THESE VALUES: 10 for quick scanning, 25 as a comfortable default,
 * 50/100 for power users who want to compare many rows at once.
 * Matches the `pageSizeOptions` input of Angular Material's MatPaginator.
 */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100] as const;

/**
 * Default sort field for the policy list.
 *
 * Policies are sorted by expiry date ascending by default so that
 * soon-to-expire policies surface at the top — the most actionable view
 * for an underwriter's daily workflow.
 */
export const DEFAULT_SORT_FIELD = 'expiryDate' as const;

/** Default sort direction for the policy list. */
export const DEFAULT_SORT_ORDER = 'asc' as const;

/**
 * LocalStorage key used by ThemeService to persist the user's theme preference.
 *
 * WHY A CONSTANT: Centralising the key here prevents key name drift between
 * ThemeService (write) and StorageService (read) — a single rename updates both.
 */
export const THEME_STORAGE_KEY = 'policy-hub-theme' as const;

/**
 * LocalStorage value written when the user selects dark mode.
 * The absence of this value (or any other value) defaults to light mode.
 */
export const DARK_THEME_VALUE = 'dark' as const;

/**
 * LocalStorage key used by PolicyTableComponent to persist the user's
 * preferred page size across sessions.
 *
 * WHY A CONSTANT: Same reason as THEME_STORAGE_KEY — a single source of truth
 * prevents key name drift between the component (write) and any future
 * settings panel (read).
 */
export const PAGE_SIZE_STORAGE_KEY = 'policy-hub-page-size' as const;
