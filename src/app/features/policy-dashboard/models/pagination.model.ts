// DECISION: Generic pagination model shared across all paginated resources.
// ALTERNATIVES CONSIDERED: Embedding pagination state directly in each feature store.
// REASON: Pagination logic is identical for every list view. A shared model
//         prevents duplicating page/pageSize/total fields in every store and
//         makes it trivial to wire any list to a common PaginatorComponent.

/**
 * Represents the pagination state for any paginated data list.
 *
 * WHY THIS APPROACH: Zero-based page index to align with Angular Material's
 * MatPaginator which uses zero-based indices internally. The adapter layer
 * converts to 1-based when building query strings for json-server.
 */
export interface PaginationState {
  /**
   * Zero-based current page index.
   * Page 0 is the first page (aligns with MatPaginator convention).
   */
  pageIndex: number;

  /**
   * Number of items per page.
   * Supported values: 10, 25, 50, 100 — enforced by the paginator component.
   */
  pageSize: number;

  /**
   * Total number of items across all pages.
   * Populated from the `total` field of the API's paginated response envelope.
   * Used by MatPaginator to calculate the page count and disable next/prev.
   */
  totalItems: number;
}

/**
 * The page request portion of pagination state sent to the API.
 * Excludes `totalItems` (a response value, not a request input).
 */
export type PageRequest = Pick<PaginationState, 'pageIndex' | 'pageSize'>;

/**
 * Paginated response envelope returned by `GET /policies`.
 *
 * WHY AN ENVELOPE (not a bare array + header): Returning `{ data, total }`
 * makes the total count a first-class part of the typed response rather than a
 * stringly-typed HTTP header the client must parse. The paginator binds
 * directly to `total`.
 */
export interface PolicyPage<T = unknown> {
  /** The records for the requested page. */
  data: T[];
  /** Total number of records matching the filters, across all pages. */
  total: number;
}

/**
 * Default pagination state used to initialise stores and reset on filter change.
 *
 * WHY A CONST: Exporting a frozen default avoids repeating `{ pageIndex: 0, ... }`
 * across multiple store initialisers and prevents accidental mutation of a shared
 * reference via Object.freeze.
 */
export const DEFAULT_PAGINATION: Readonly<PaginationState> = Object.freeze({
  pageIndex: 0,
  pageSize: 25,
  totalItems: 0,
});
