# AI Journal — Policy Hub (Chubb APAC)

This journal logs every AI-assisted development session: the prompts used, decisions made, outcomes, and anything the AI got wrong that required correction. It serves as an audit trail and a living record of the project's evolution.

---

## Session 001 — 2026-06-09

### Prompt
> Act as a senior architect. I will provide step by step prompts, based on that prompts need to create a policy-details-dashboard. Follow the enterprise standards while creating the project.

### Architectural Baseline Established

| Concern | Decision |
|---|---|
| Framework | Angular 20 (Standalone, Zoneless) |
| UI Library | Angular Material 3 |
| State | Signal-based custom store |
| Rendering | SSR (`@angular/ssr`) |
| Styling | SCSS (component-scoped) |
| Package Manager | npm |
| Unit Tests | Jasmine + Karma |
| E2E Tests | Not configured |
| API | Mock JSON / in-memory (REST-ready) |

### Global Code Rules Agreed
1. JSDoc on every class, service, component, and store
2. `// WHY THIS APPROACH:` comments before every logic block
3. `// DECISION: / ALTERNATIVES CONSIDERED: / REASON:` at file or decision level

---

## Session 002 — 2026-06-09 · Prompt 1: Scaffold & Config

### What was built
- Angular 20 SSR app scaffolded with `ng new --zoneless --ssr`
- Angular Material 3 installed via `ng add @angular/material` (Azure/Blue theme)
- `material-icons`, `json-server`, `@faker-js/faker` installed
- `app.config.ts` configured with `provideZonelessChangeDetection`, `provideHttpClient(withFetch())`, `withComponentInputBinding`
- `angular.json` updated: material-icons CSS before styles.scss, production `fileReplacements`
- `src/environments/environment.ts` and `environment.prod.ts` created
- `src/index.html` updated: custom title, non-blocking Roboto font preload, CDN Material Icons link removed
- `src/styles.scss` replaced with Material 3 token definitions, dark mode class, global reset, reduced-motion query
- `mock-api/generate-data.js` created with faker — 250 policies, 8 regions evenly distributed
- `mock-api/db.json` seeded with 250 records
- `package.json` `start:api` and `generate:mock` scripts added

### Bug Encountered & Fixed
**Angular 20.0.3 — NG0401 "Missing Platform" during SSR route extraction**

Root cause: `main.server.ts` bootstrap function ignored the `BootstrapContext` argument passed by the build tooling's route extractor. Without forwarding this context, `bootstrapApplication` tried to create a new `PlatformRef`, which failed in the build environment.

Fix applied:
```ts
// Before (broken):
const bootstrap = () => bootstrapApplication(App, config);

// After (fixed):
const bootstrap = (context?: BootstrapContext) =>
  bootstrapApplication(App, config, context);
```

Also changed `app.routes.server.ts` from `RenderMode.Prerender` to `RenderMode.Server` — prerender triggers static route extraction which is incompatible with dynamic data-driven routes.

---

## Session 003 — 2026-06-09 · Prompt 2: Models, Constants & Core Services

### What was built

**Models** (`src/app/features/policy-dashboard/models/`)
- `policy.model.ts` — `Policy` interface + `PolicyStatus`, `LineOfBusiness`, `Region`, `Currency` string unions
- `policy-filter.model.ts` — `PolicyFilter` with multi-value array fields for statuses/regions/LOBs
- `pagination.model.ts` — `PaginationState` + `DEFAULT_PAGINATION` frozen const
- `policy-summary.model.ts` — `PolicySummary` projection for the list table
- `policy-query-params.model.ts` — typed json-server query string shape

**Constants** (`src/app/features/policy-dashboard/constants/`)
- `policy.constants.ts` — `POLICY_STATUSES`, `REGIONS`, `LINES_OF_BUSINESS`, `CURRENCIES`, `PAGE_SIZE_OPTIONS`, sort defaults, `THEME_STORAGE_KEY`

**Core Services** (`src/app/core/services/`)
- `storage.service.ts` — generic `get<T>`/`set<T>`/`remove`, SSR-safe via `PLATFORM_ID`, all try/catch guarded
- `theme.service.ts` — `isDark` signal, `toggle()`, `setDark()`, DOM class sync via `effect()`, 3-priority initial theme resolution (localStorage → OS media query → light default)
- `logger.service.ts` — `debug`/`info`/`warn`/`error`, suppressed in production via `isDevMode()`

**Interceptor** (`src/app/core/interceptors/`)
- `error.interceptor.ts` — functional `HttpInterceptorFn`, normalises `HttpErrorResponse` to `NormalisedHttpError`, OWASP-safe (5xx messages never passed to UI), re-throws

**app.config.ts** updated — `withInterceptors([errorInterceptor])` added to `provideHttpClient`.

### Decisions Made
- String union types over TypeScript enums (zero runtime cost)
- `as const` typed arrays for constants (enables `typeof POLICY_STATUSES[number]` inference)
- `DEFAULT_PAGINATION` is `Object.freeze()`-d to prevent accidental mutation of shared reference
- `PolicyQueryParams` models json-server's exact query syntax including operator suffixes (`_gte`, `_lte`)
- Dark mode uses class on `<html>`, not `OverlayContainer.addPanelClass()` (which only affects overlay panels)

---

---

## Session 004 — 2026-06-09 · Prompt 4: PolicyTable Component

### What was built

**`src/app/features/policy-dashboard/components/policy-table/`**
- `policy-table.ts` — `PolicyTable` standalone component (`ChangeDetectionStrategy.OnPush`, `AfterViewInit`)
- `policy-table.html` — 9-column `mat-table` with sticky header, bulk checkbox, status/LOB badges, flag icon, actions column, `*matNoDataRow`, `mat-paginator`
- `policy-table.scss` — component-scoped CSS custom properties for badge colours with `:host-context(html.dark-theme)` overrides; `.is-selected` row highlight; `.is-flagged` left accent border; compact premium column; `prefers-reduced-motion` override for sort-arrow animation

**`src/app/features/policy-dashboard/constants/policy.constants.ts`**
- Added `PAGE_SIZE_STORAGE_KEY = 'policy-hub-page-size'`

### Key Decisions

**`_pageIndex` / `_pageSize` as signals (not reading `dataSource.paginator.pageIndex`):**
`MatTableDataSource.filteredData` is updated asynchronously via its internal RxJS pipeline. Reading it synchronously inside a `computed()` or `effect()` returns stale data, causing `isAllOnPageSelected` to be permanently false. The fix: track page state in `WritableSignal<number>` values updated directly from the `paginator.page` subscription, and derive `pageIds` from `store.filteredPolicies()` (which is synchronous).

**Server-side sort, not `dataSource.sort`:**
Assigning `dataSource.sort` triggers client-side sort on the local data array. Instead, `sortChange` events are subscribed and forwarded to `store.updateSort()`, which rebuilds query params and triggers a fresh API call.

**Constructor `effect()` for data sync:**
An `effect()` in the constructor updates `dataSource.data = store.filteredPolicies()`, calls `paginatorRef()?.firstPage()`, and resets `_pageIndex` to 0 whenever the filtered data changes. This ensures the paginator stays on page 1 after filter changes.

**`formatPremium` — compact K/M suffixes:**
`getCurrencySymbol(currencyCode, 'narrow', locale)` provides locale-aware symbols. Values ≥ 1M render as `S$1.2M`, ≥ 1K as `S$123K`, otherwise raw — designed for scanning, not precision.

### Build Result
`Application bundle generation complete. [2.537 seconds]` — 0 errors, 0 warnings.

---

## Session 005 — 2026-06-09 · Prompt 5: Filter Components (PolicyFilter + FilterPanel)

### What was built

**`src/app/features/policy-dashboard/components/policy-filter/`**
- `policy-filter.ts` — `PolicyFilter` component; owns the filter `FormGroup`; bridges form → store, localStorage, and URL
- `policy-filter.html` — search input + "All Filters" badge button + active chip strip
- `policy-filter.scss` — two-row flex layout, chip fade-in animation, `prefers-reduced-motion` override

**`src/app/features/policy-dashboard/components/filter-panel/`**
- `filter-panel.ts` — `FilterPanel` bottom sheet content component; seeded from `MAT_BOTTOM_SHEET_DATA`; dismisses with typed result
- `filter-panel.html` — Status / Region / LOB selects + date range pickers + min premium input + Apply / Reset footer
- `filter-panel.scss` — flex column layout, sticky footer via `margin-top: auto`, 2-column date grid, dark mode surface override

**Model changes:**
- `policy-filter.model.ts` — added `effectiveDateFrom?: string` and `effectiveDateTo?: string` (ISO 8601 strings, not `Date` — for clean localStorage and URL serialisation)
- `policy.store.ts` — extended `hasFilters` check and `filteredPolicies` predicate with ISO date string range comparison

**Constants:**
- `FILTER_STORAGE_KEY = 'policy-hub-filters'` added to `policy.constants.ts`

### Key Decisions

**Two `formValueChanges` subscriptions (immediate + debounced 400 ms):**
Store updates must be immediate for instant table feedback (client-side filter on local data). URL and localStorage writes are debounced to prevent history-stack spam and excessive I/O while the user types.

**Seed priority: URL query params → localStorage → defaults:**
URL params enable deep-linking and shareable filter contexts. localStorage restores the last session. Defaults are the safe fallback. The form is built with seeded values (not patched after construction) so `valueChanges` does not emit during construction.

**Signal snapshot (`_formSnapshot: WritableSignal<PolicyFilterFormValue>`):**
`activeFilterCount` and `activeFilterChips` are `computed()` signals that read from a `WritableSignal` snapshot of the form value, updated synchronously inside the immediate `valueChanges` subscription. This bridges the RxJS `FormGroup` world into Angular's signal graph cleanly without `toSignal()`.

**`FilterPanel` dismissal contract (typed return via `MatBottomSheetRef.dismiss()`):**
Three distinct outcomes — `PolicyFilterFormValue` object (Apply), `'reset'` string (Reset), `undefined` (backdrop/Escape). The parent handles all three in one `afterDismissed()` subscription. No `@Output`, no shared service, no reference from the overlay back to the parent.

**`provideNativeDateAdapter()` scoped to `FilterPanel`:**
The native date adapter is provided in `FilterPanel`'s `providers` array, not at root. This keeps the adapter out of the global injector and avoids importing `MatNativeDateModule` globally.

**ISO string date comparison in `filteredPolicies`:**
`YYYY-MM-DD` ISO strings are lexicographically chronological. Comparing strings directly avoids `new Date()` allocation on every row in the filter predicate — a meaningful optimisation when filtering 250 records on every keystroke.

### Build Result
`Application bundle generation complete. [2.817 seconds]` — 0 errors, 0 warnings.

---

## Session 006 — 2026-06-09 · Prompt 6: SummaryPanel, BulkActionBar, PolicyDrilldownDialog

### What was built

**`src/app/features/policy-dashboard/components/summary-panel/`**
- `summary-panel.ts` — `SummaryPanel` standalone component; 4 computed status cards; SVG arc for expiry urgency; GWP progress bars per LOB
- `summary-panel.html` — `role="grid"` status card buttons + SVG arc widget + GWP bar grid
- `summary-panel.scss` — CSS custom property tokens per status variant; `stroke-dashoffset` animation (600ms); `width` transition for GWP bars (800ms); dark mode overrides

**`src/app/features/policy-dashboard/components/bulk-action-bar/`**
- `bulk-action-bar.ts` — `BulkActionBar` component; `flagForReview()` snapshots count before store action; MatSnackBar with `panelClass: ['snack-flag-success']`
- `bulk-action-bar.html` — `role="toolbar"`; `aria-live="polite"` `aria-atomic="true"` selection count; Clear + Flag buttons
- `bulk-action-bar.scss` — floating pill surface; `.snack-flag-success` documented (rule lives in `styles.scss`)

**`src/app/features/policy-dashboard/components/policy-drilldown-dialog/`**
- `policy-drilldown-dialog.ts` — `PolicyDrilldownDialog`; `DrilldownDialogData` type exported; `renewingIds = signal<Set<string>>(new Set())`; `detailPolicy` computed from `store.policies()`; `listPolicies` computed from `store.filteredPolicies()`; `renew()` + `flagDetail()` actions; `daysUntilExpiry` / `urgencyClass` / `daysLabel` helpers
- `policy-drilldown-dialog.html` — `aria-labelledby="drilldown-dialog-title"`; `cdkFocusInitial` on close button; `@if (data.mode === 'detail')` detail card with 9-field `<dl>` grid, status-pill, flag-pill, days-badge, lob-chip, Renew + Flag actions; `@if (data.mode !== 'detail')` mat-table with urgency badges and row tinting
- `policy-drilldown-dialog.scss` — status/LOB/urgency/flag CSS custom property tokens; `.urgency-row--critical/high/low` row tinting; dark mode overrides

**`src/styles.scss`** — added `.snack-flag-success` global snackbar override (green background, white text)

### Key Decisions

**`renewingIds = signal<Set<string>>(new Set())`:**
Renewing spinner state is purely presentational — ephemeral 1500ms UI feedback. Putting it in the store would pollute global domain state. A local signal Set allows multiple rows to be in renewing state simultaneously and provides O(1) `.has()` lookup for template bindings.

**Snapshot `selectedCount()` before `flagSelectedPolicies()`:**
`store.flagSelectedPolicies()` calls `clearSelection()` internally after the optimistic update. Reading `selectedCount()` after the dispatch gives 0. Snapshotting before ensures the snackbar message accurately reflects how many policies were actioned.

**SVG `stroke-dashoffset` with CSS `transition: 600ms ease-in-out`:**
No external chart library needed. The arc fills/empties smoothly on filter context changes (e.g. filtering to a region). `rotate(-90 60 60)` shifts the stroke start to 12-o'clock.

**`detailPolicy` derived from `store.policies()` (not `data.policy` snapshot):**
After `store.renewPolicy(id)` optimistically updates `_policies`, the dialog's computed picks up the new status immediately — the user sees "Active" without reopening the dialog.

**`cdkFocusInitial` on close button:**
Angular CDK's FocusTrap automatically manages focus within the dialog. `cdkFocusInitial` on the Close button ensures keyboard users land on a predictable, immediately actionable control rather than the first focusable table cell.

**`aria-labelledby` → `id="drilldown-dialog-title"`:**
Links the dialog container's accessible name to the visible title element. Screen readers announce "Status Policies — dialog" rather than just "dialog".

### Build Result
`Application bundle generation complete. [2.868 seconds]` — 0 errors, 0 warnings.

---

## Session 007 — 2026-06-09 · Prompt 7: Dashboard Page, App Shell & Shared Components

### What was built

**`src/app/features/policy-dashboard/pages/policy-dashboard/`**
- `policy-dashboard.ts` — `PolicyDashboard` page; `ngOnInit` calls `store.loadPolicies()`; `hasResults` computed; `openPolicyDetail()` opens `PolicyDrilldownDialog`; `retry()` and `clearFilters()` handlers; lazy-loaded via `loadComponent()` in `app.routes.ts`
- `policy-dashboard.html` — `PolicyFilter` + `SummaryPanel` always visible; `@if loading / error / defer(on idle)` branches; `@defer` contains `BulkActionBar`, table section, or `EmptyState`; `@placeholder` div with `aria-busy`
- `policy-dashboard.scss` — single-column flex layout; max-width 1440px centred; `dashboard-table` overflow hidden with M3 corner radius

**`src/app/shared/loading-skeleton/`**
- CSS-only shimmer animation (single `@keyframes shimmer` + `background-position` technique)
- Summary card skeleton (4-cell grid) + table header + 6 row skeletons
- `prefers-reduced-motion: reduce` disables animation; static muted surface shown instead
- `role="status" aria-label="Loading policies..." aria-busy="true"` on host

**`src/app/shared/error-state/`**
- `error_outline` icon + "Unable to load policies" title + `message` input
- `retryClick = output<void>()` — decoupled from PolicyStore
- `role="alert" aria-live="assertive"` on host

**`src/app/shared/empty-state/`**
- `search_off` icon + `title`/`description` inputs + "Clear all filters" button
- `clearFilters = output<void>()` — routes through PolicyDashboard to `store.clearFilters()`
- `role="status" aria-live="polite"` on host

**`src/app/shared/theme-picker/`**
- `ThemePickerComponent`: palette icon button opens `MatMenu` with 5×2 swatch grid
- 10 named palettes (`THEME_PALETTES` const array): Azure Blue, Forest, Crimson, Amber, Violet, Teal, Rose, Indigo, Emerald, Slate
- Applies `--mat-sys-primary`, `--mat-sys-on-primary`, `--mat-sys-primary-container`, `--mat-sys-on-primary-container` as inline CSS custom property overrides on `document.documentElement`
- Persists selection via `StorageService` with `PALETTE_STORAGE_KEY = 'policy-hub-palette'`
- Active swatch shows `check` icon; `aria-pressed` on each swatch button
- `viewChild(MatMenuTrigger)` to close menu after selection (plain `<button>` elements don't auto-close MatMenu)
- SSR-safe: `isPlatformBrowser()` guard in `applyPalette()`

**`src/app/app.ts`** — rewritten: `ChangeDetectionStrategy.OnPush`; imports `MatToolbarModule`, `MatButtonModule`, `MatIconModule`, `MatTooltipModule`, `ThemePickerComponent`, `RouterOutlet`; injects `ThemeService`

**`src/app/app.html`** — rewritten: `<mat-toolbar role="banner">` with brand div + spacer + actions (`<app-theme-picker>` + dark/light toggle); `<router-outlet>`

**`src/app/app.scss`** — written: `position: sticky` toolbar; brand title/subtitle typography; flex spacer; actions row gap

**`src/app/app.routes.ts`** — `loadComponent()` lazy-loads `PolicyDashboard` at `path: ''`; `title: 'Policy Dashboard | Chubb APAC'`

**`src/app/features/policy-dashboard/constants/policy.constants.ts`** — added `PALETTE_STORAGE_KEY = 'policy-hub-palette'`

### Key Decisions

**`@defer (on idle)` for the table section:**
The filter bar and summary panel are above the fold and must render immediately. The table, bulk-action bar, and empty state are deferred until the browser has an idle frame — keeping first contentful paint fast and the initial bundle lean. The `@placeholder <div aria-busy>` prevents layout shift.

**ThemePicker overrides CSS custom properties at runtime (not via SCSS classes):**
Rather than pre-generating 10 `@include mat.theme()` blocks in styles.scss (which adds a large CSS payload), the ThemePicker overrides only the 4 primary-family tokens directly on `document.documentElement.style`. This is zero-cost SCSS-wise, instantly reflects in Angular Material 3 components that read `--mat-sys-primary*`, and is SSR-safe with a browser guard.

**EmptyState and ErrorState have no store dependency:**
Both live in `src/app/shared/` and emit events to their parent. This makes them reusable by any future feature page without importing the PolicyStore.

**`loadComponent()` for the `''` route:**
Even though `''` is the only route today, using `loadComponent()` keeps the initial bundle minimal (only App shell + ThemePicker + router). The entire policy domain (store, API service, all 7 components) is loaded only when the route resolves. The build output confirms this: `policy-dashboard` chunk is 627 kB (separate from the 2.2 MB initial bundle).

### Build Result
`Application bundle generation complete. [4.413 seconds]` — 0 errors, 0 warnings.
Lazy chunks: `policy-dashboard` (627 kB), `policy-table` (168 kB), `bulk-action-bar` (49 kB), `empty-state` (6 kB) — all split correctly by `@defer`.

<!-- New sessions will be appended below -->

---

## Session — Move to a fully server-side data architecture + drop Zone.js (2026-06-09)

### Context
A senior-architect review flagged three things: (1) the "server-side filtering" requirement was only nominally met — the store re-filtered all 250 records client-side, duplicating logic; (2) the server-side free-text search was actually broken (three `*_like` params are ANDed by json-server, so it could never match) and was masked by the client filter; (3) Zone.js was still loaded in the test bundle (NG0914 warning). The owner chose the scope: **full server-side** (filter + search + sort + pagination + summary).

### What I changed
**`mock-api/server.js` (new, replaces json-server)** — a ~170-line Express server. `GET /policies` does filter + OR-search + sort + pagination and returns `{ data, total }`; `GET /policies/summary` returns KPI aggregates over the filtered set; `PATCH /policies/:id` mutates in memory. `package.json` `start:api` now runs `node mock-api/server.js`.

**`PolicyApiService`** — `getAll()` now returns `Observable<PolicyPage<Policy>>` and takes an optional `PageRequest`; added `getSummary()`. Extracted a shared `buildFilterParams()` so the list and summary endpoints stay in lock-step. Search now maps to a single `search` param (the AND-bug is gone).

**`PolicyStore`** — removed the client-side `filteredPolicies` computed and the client-side `summary` computed. Now holds `_policies` (current page), `_total`, `_summary`, `_pagination`. `loadPolicies()` `forkJoin`s the page + summary so the table and KPIs never desync. Added `setPage()`; `updateFilters/clearFilters/updateSort` reset to page 0. `renewPolicy` refreshes the summary on success.

**`PolicyTable`** — paginator is now a controlled component bound to `store.total()`/`store.pagination()`; `(page)` → `store.setPage()`. Dropped the `MatTableDataSource.paginator` wiring, the `_pageIndex`/`_pageSize` signals, and the `AfterViewInit`/`viewChild` plumbing. `(matSortChange)` → `store.updateSort()`. `pageIds` is now simply the current page's ids.

**`PolicyDrilldownDialog`** — list mode (status/expiring) can no longer read the full set from the store, so it fetches its own scoped, unpaginated set via `getAll()` (Active + 30-day window for expiring).

**`PolicyFilter`** — the store update is now debounced (400 ms) alongside URL/localStorage, since each filter change is a real HTTP request. The immediate subscription now only updates the chip/count UI.

**Zone.js** — emptied `src/test.ts`; converted the 3 specs that used `fakeAsync`/`tick` to synchronous/`jasmine.clock()` style. NG0914 warning gone.

### Decisions I accepted / challenged / overrode
- **[CHALLENGED] "summary can stay client-side."** Once pagination is server-side the client only holds one page, so a client-side summary would be wrong on every page but the first. Overrode with a dedicated `GET /policies/summary` endpoint loaded via `forkJoin`.
- **[OVERRODE] Keep json-server.** It can't OR-search three named fields and has no summary concept. Replaced with a custom Express server (Express was already a dependency — no new package).
- **[ACCEPTED] In-memory PATCH (no disk write).** Keeps the seed `db.json` pristine in git; documented in TRADE_OFFS as known mock behavior.
- **[ACCEPTED] Drilldown fetches its own data.** The cleanest way to keep it correct without re-introducing a full client dataset.

### Verification
- `ng build` (browser + SSR): 0 errors. SSR output intact.
- `ng test`: **155 specs pass, 0 failures, no NG0914 warning.** Updated the api/store/table/summary/dialog/filter specs; added `src/app/features/policy-dashboard/testing/policy-test-utils.ts` (`pageOf`/`summaryOf`) to keep spec setup DRY against the new contract.
- Manual `curl` smoke test of the Express server confirmed filter + OR-search + sort + pagination + summary responses.

---

## Session — ESLint wired up + branch coverage over 80% (2026-06-09)

### Context
Final gap pass against the requirement checklist found two concrete misses: `ng lint` could not run (the `angular-eslint`/`eslint`/`typescript-eslint` devDeps were declared but never installed, and there was no flat config), and branch coverage sat at 75.7% (lines were already 91%).

### What I changed
- **Lint:** ran `npm install` (pulled in `@angular-eslint/builder` + plugins + `@eslint/js`); confirmed the ESLint 9 flat `eslint.config.js`; added `@typescript-eslint/no-explicit-any: error` to enforce the brief's "no any" rule. First run surfaced one real issue — a leftover unused `of` import in `policy-table.spec.ts` (residue from the server-side refactor) — removed it. `npm run lint` → **All files pass**.
- **Coverage:** the error interceptor was the weak spot (23.5% branches — one branch per HTTP status). Added a `normaliseHttpError` pure-function suite covering status 0 / 5xx / 404 / 403 / 401 / 400-with-server-message / 400-fallback / unhandled-4xx. Branch coverage **75.7% → 80.4%**; statements 92.2%, functions 92.2%, lines 92.9%. Tests **155 → 163**, all passing.

### Decisions
- **[ACCEPTED] Test the pure `normaliseHttpError` directly** rather than 8 HTTP round-trips — same branch coverage, far less ceremony, faster suite.
- **[CHALLENGED] "coverage is already fine at 91% lines."** The checklist bar is generic 80%; branches were the laggard, so I targeted branches specifically instead of padding line coverage.

### Verification
`npm run lint` clean · `ng test` 163 pass, all coverage metrics ≥80% · `ng build` (browser + SSR) 0 errors.
