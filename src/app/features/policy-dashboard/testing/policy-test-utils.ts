/**
 * @fileoverview Shared test helpers for the policy-dashboard feature.
 *
 * Centralises the construction of the paginated API response envelope and the
 * summary response so specs don't repeat `of({ data, total })` boilerplate and
 * stay in lock-step with the PolicyApiService contract.
 */

import { Observable, of } from 'rxjs';

import { PolicyPage } from '../models/pagination.model';
import { Policy } from '../models/policy.model';
import {
  EMPTY_SUMMARY,
  PolicySummaryData,
} from '../models/policy-summary.model';

/**
 * Wraps an array of policies in the `{ data, total }` page envelope that
 * `PolicyApiService.getAll()` resolves to. `total` defaults to the array
 * length (single-page result); pass `total` explicitly to simulate a result
 * set larger than the returned page.
 */
export function pageOf(
  data: Policy[],
  total: number = data.length,
): Observable<PolicyPage<Policy>> {
  return of({ data, total });
}

/**
 * Builds a summary response observable, overriding only the fields a test
 * cares about. Everything else falls back to EMPTY_SUMMARY zeros.
 */
export function summaryOf(
  partial: Partial<PolicySummaryData> = {},
): Observable<PolicySummaryData> {
  return of({ ...EMPTY_SUMMARY, ...partial });
}
