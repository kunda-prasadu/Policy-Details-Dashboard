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
   * Populated from the X-Total-Count response header (json-server standard).
   * Used by MatPaginator to calculate the page count and disable next/prev.
   */
  totalItems: number;
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
