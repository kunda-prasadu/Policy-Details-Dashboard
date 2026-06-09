# TRADE_OFFS

## What Was Cut

- End-to-end tests (Playwright/Cypress) were deferred to keep implementation time focused on core feature delivery.
- Micro-frontend architecture was intentionally not adopted; this is a single monolithic Angular app.
- Virtual scrolling for large data sets was deferred — server-side pagination caps the rendered DOM at one page (≤100 rows), so it is not needed at the current data scale.
- Full i18n extraction and runtime locale switching were deferred.
- FX conversion logic (cross-currency normalization) was not implemented.
- Storybook and visual regression test setup were deferred.

## Technical Debt

- The mock backend is a small custom Express server (`mock-api/server.js`). PATCH mutations are held in memory only and reset on restart — acceptable for a mock, but a real backend would persist them.
- Bulk flag operation performs multiple PATCH calls (one per policy) instead of a single batch endpoint. A real API should expose `POST /policies/flag` accepting an array of IDs.
- The drilldown dialog fetches its full (unpaginated) result set with `pageSize` omitted. For very large status groups this should itself paginate or stream.
- Currency display uses formatting helpers but does not include region-aware i18n pipes end-to-end.

## Shortcuts Taken

- `MatTableDataSource` is used for table data plumbing (trackBy + no-data-row), but the paginator is a controlled component bound to store signals rather than wired to the data source — this keeps pagination authority server-side.
- Some interactions rely on optimistic UI assumptions and then roll back on failure for better perceived responsiveness.
- The Express mock server performs filtering/sorting/pagination in memory over the seed array rather than via a database query planner — fine for 250 records.

## Server-Side Architecture (deliberate, not a shortcut)

- **Filtering, free-text search, sorting, pagination and the KPI summary are all computed server-side.** The Angular client holds only the current page plus the server's total count and summary aggregates — it never loads the full dataset. This is the single source of truth for "what matches" and scales beyond the current 250-record seed.
- Free-text search is a true OR across `policyNumber`, `policyHolderName` and `underwriter`, evaluated by the server from one `search` param (fixing the earlier bug where three ANDed `_like` params could never match).

## Why These Trade-offs Are Acceptable For This Stage

- The primary objective was a functional, test-covered dashboard with strong accessibility, a clean server-side data contract, and clear separation of concerns.
- The current structure keeps future enhancement paths open (real API, batch flag endpoint, E2E, i18n, virtual scrolling) without large rewrites.
