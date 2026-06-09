# TRADE_OFFS

## What Was Cut

- End-to-end tests (Playwright/Cypress) were deferred to keep implementation time focused on core feature delivery.
- Micro-frontend architecture was intentionally not adopted; this is a single monolithic Angular app.
- Virtual scrolling for large data sets was deferred because the mock API is currently limited to 250 records.
- Full i18n extraction and runtime locale switching were deferred.
- FX conversion logic (cross-currency normalization) was not implemented.
- Storybook and visual regression test setup were deferred.

## Technical Debt

- Search and date-range filtering are still partly client-side due JSON Server query limitations.
- Bulk flag operation performs multiple PATCH calls (one per policy) instead of a single batch endpoint.
- Currency display uses formatting helpers but does not include region-aware i18n pipes end-to-end.

## Shortcuts Taken

- MatTableDataSource is used for table data plumbing to reduce custom table state boilerplate.
- JSON Server constraints required API adapter compromises for advanced querying behavior.
- Some interactions rely on optimistic UI assumptions and then rollback on failure for better perceived responsiveness.

## Why These Trade-offs Are Acceptable For This Stage

- The primary objective was to deliver a functional, test-covered dashboard with strong accessibility and filtering UX.
- The current structure keeps future enhancement paths open (real API, batch endpoints, E2E, i18n) without large rewrites.
