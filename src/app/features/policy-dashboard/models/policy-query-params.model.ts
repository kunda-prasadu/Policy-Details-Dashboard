// DECISION: Dedicated query-params model as the bridge between PolicyFilter +
//           PaginationState and the HTTP query string sent to json-server.
// ALTERNATIVES CONSIDERED: Building query strings inline in the service.
// REASON: Isolating the URL parameter shape into a typed model means the
//         PolicyApiService only deals with PolicyQueryParams, not with the
//         intricacies of json-server's query syntax (_page, _limit, _sort, etc.).
//         A dedicated builder function converts PolicyFilter + PaginationState
//         into PolicyQueryParams, centralising the translation logic.

import { Currency, LineOfBusiness, PolicyStatus, Region } from './policy.model';

/**
 * Represents the HTTP query parameters sent to the json-server /policies endpoint.
 *
 * Field names deliberately match json-server's supported query syntax:
 * - `_page` / `_limit` for pagination
 * - `_sort` / `_order` for sorting
 * - Exact-match fields (status, region, etc.) as direct key=value pairs
 *
 * WHY THIS APPROACH: A typed query-params object rather than a plain
 * `Record<string, string>` gives us compile-time safety when the API
 * contract or json-server field names change.
 */
export interface PolicyQueryParams {
  /** Zero-based page index converted to 1-based for json-server. */
  _page?: number;

  /** Number of items per page (json-server: _limit). */
  _limit?: number;

  /** Field name to sort by. */
  _sort?: string;

  /** Sort direction: ascending or descending. */
  _order?: 'asc' | 'desc';

  /**
   * Free-text search term.
   * json-server's `q` param performs a full-text search across all fields.
   */
  q?: string;

  /**
   * Status filter (single value — json-server exact match).
   * For multi-value filtering the service expands to multiple params or
   * falls back to client-side filtering.
   */
  status?: PolicyStatus;

  /** Region filter (single value — json-server exact match). */
  region?: Region;

  /** Line of business filter (single value — json-server exact match). */
  lineOfBusiness?: LineOfBusiness;

  /** Currency filter (single value — json-server exact match). */
  currency?: Currency;

  /** Flagged-for-review filter. json-server matches boolean field directly. */
  flaggedForReview?: boolean;

  /**
   * Minimum premium filter (json-server: premiumAmount_gte).
   * Stored under the json-server operator suffix key.
   */
  premiumAmount_gte?: number;

  /**
   * Maximum premium filter (json-server: premiumAmount_lte).
   * Stored under the json-server operator suffix key.
   */
  premiumAmount_lte?: number;
}
