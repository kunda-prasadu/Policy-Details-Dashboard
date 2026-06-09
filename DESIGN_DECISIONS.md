# Design Decisions — Policy Hub (Chubb APAC)

This document records every significant architectural and technical decision made during the build of the Policy Hub dashboard. Each entry follows the **Decision / Alternatives Considered / Reason** format.

---

## DD-001 · Angular 20 with Standalone Components (no NgModules)

**Decision:** All components, directives, and pipes are standalone. No `@NgModule` declarations anywhere.

**Alternatives Considered:**
- NgModule-based architecture (pre-Angular 15 style)
- Hybrid: standalone components inside a feature NgModule

**Reason:** Angular 20 treats standalone as the default. Standalone components are tree-shakeable at the component level, eliminate the `declarations` boilerplate, and compose cleanly with `provideRouter` lazy loading. The Angular team has indicated NgModules are in maintenance mode.

---

## DD-002 · Zoneless Change Detection (`provideZonelessChangeDetection`)

**Decision:** Zone.js is excluded. Change detection is driven entirely by Angular signals.

**Alternatives Considered:**
- Default Zone.js-based change detection
- `ChangeDetectionStrategy.OnPush` with Zone.js retained

**Reason:** Zone.js patches ~30 browser APIs and adds ~30 kB to the initial bundle. Zoneless + signals gives deterministic, explicit change propagation. Every state mutation is visible in the signal write — no hidden `markForCheck()` calls or `NgZone.run()` wrappers needed.

**Tests mirror production:** Zone.js is also excluded from the Karma bundle (`src/test.ts` is empty of zone imports). Specs provide `provideZonelessChangeDetection()` and drive change detection via `fixture.detectChanges()` / `await fixture.whenStable()`; the few timer-based assertions use `jasmine.clock()` rather than `fakeAsync()`/`tick()` (which require Zone.js). This removes the `NG0914 "still loading Zone.js"` warning and guarantees tests exercise the same scheduler as production.

---

## DD-003 · Signal-Based Custom Store (no NgRx / NGXS)

**Decision:** A purpose-built `PolicyStore` using `signal()`, `computed()`, and `effect()` replaces a Redux-style state library.

**Alternatives Considered:**
- NgRx Store + Effects + Selectors
- NGXS
- Akita
- Component-local state with `@Input`/`@Output`

**Reason:** NgRx adds ~800 lines of boilerplate (actions, reducers, selectors, effects) for a use case fully expressible in ~150 signal lines. The dashboard has one primary entity (Policy) with one primary list view — NgRx is architected for multi-entity, cross-cutting state that does not apply here. Signals are native Angular 20 primitives; no extra package, no extra learning curve for future maintainers.

---

## DD-004 · SSR with `RenderMode.Server` (Dynamic, Not Prerender)

**Decision:** All routes use dynamic server-side rendering on every request.

**Alternatives Considered:**
- `RenderMode.Prerender` — static HTML generated at build time
- `RenderMode.Client` — pure SPA, no SSR

**Reason:** Policy data is real-time and user-filtered. Pre-rendering would produce stale HTML that does not reflect live policy states (Active → Expired transitions, flagged-for-review updates). Dynamic SSR ensures the first paint reflects current data. Client-only rendering would sacrifice TTFB and crawlability for an enterprise ops dashboard.

---

## DD-005 · `provideHttpClient(withFetch())` Instead of `XMLHttpRequest`

**Decision:** Angular's `HttpClient` is configured to use the native Fetch API via `withFetch()`.

**Alternatives Considered:**
- Default `HttpClient` (XMLHttpRequest-based)

**Reason:** `withFetch()` is required for Angular SSR — Node.js 18+ has native `fetch` built in, eliminating the `xhr2` polyfill from the server bundle. It also results in a smaller browser bundle (no `XhrFactory` provider) and aligns with the web platform direction.

---

## DD-006 · Functional HTTP Interceptors

**Decision:** `errorInterceptor` is an `HttpInterceptorFn` (functional), not a class implementing `HttpInterceptor`.

**Alternatives Considered:**
- Class-based `HttpInterceptor` with `@Injectable`

**Reason:** Functional interceptors are the Angular 15+ canonical pattern, registered via `withInterceptors([...])`. They are pure functions — easier to test in isolation, easier to compose, and require no DI decorator. Class-based interceptors remain supported but are the legacy approach.

---

## DD-007 · Material Icons Served Locally (Not via CDN)

**Decision:** `material-icons` npm package is installed; icons are served from `node_modules` via the `angular.json` styles array. No CDN `<link>` tag in `index.html`.

**Alternatives Considered:**
- Google Fonts CDN: `<link href="https://fonts.googleapis.com/icon?family=Material+Icons">`

**Reason:** CDN links add a render-blocking cross-origin request. Local serving: works offline, counts against the app's own caching budget, loads faster on intranets (Chubb internal networks), and eliminates a Content Security Policy exception for `fonts.googleapis.com`.

---

## DD-008 · SCSS Component-Scoped Styles + Global Material 3 CSS Tokens

**Decision:** All component styles are SCSS in component-scoped files. Global `styles.scss` defines only Material 3 CSS custom property aliases and the global reset.

**Alternatives Considered:**
- Tailwind CSS alongside Angular Material
- CSS (no SCSS)
- CSS Modules

**Reason:** Angular Material 3's theming contract is entirely CSS custom properties (`--mat-sys-*`). SCSS is needed to `@use '@angular/material' as mat` and call `mat.theme()`. Tailwind and Angular Material reset each other's baseline styles, requiring significant configuration to coexist. Component-scoped SCSS prevents class name collisions in a large feature set.

---

## DD-009 · TypeScript String Union Types Instead of Enums

**Decision:** `PolicyStatus`, `LineOfBusiness`, `Region`, and `Currency` are string union types, not TypeScript enums.

**Alternatives Considered:**
- `enum PolicyStatus { Active = 'Active', ... }`
- Plain string constants

**Reason:** String union types are erased at compile time — zero runtime cost. TypeScript enums compile to JavaScript objects that remain in the bundle. String unions also work naturally with `@for` loops over the `POLICY_STATUSES` const array, with `typeof POLICY_STATUSES[number]` inference, and with Angular template `ngSwitch`/`@switch` without additional adapter code.

---

## DD-010 · `StorageService` as the Sole LocalStorage Gateway

**Decision:** All `localStorage` reads and writes go through `StorageService`. No direct `localStorage.*` calls anywhere else in the codebase.

**Alternatives Considered:**
- Direct `localStorage` calls in each service that needs persistence
- `@ngrx/component-store` effect-based persistence

**Reason:** Centralising localStorage access means: (a) SSR safety (`isPlatformBrowser` guard) is implemented once; (b) `try/catch` for `QuotaExceededError` and `SecurityError` is in one place; (c) JSON serialisation round-trips are handled generically; (d) tests can inject a mock `StorageService` without patching the global `localStorage`.

---

## DD-011 · Dark Mode via `html.dark-theme` Class (Not `prefers-color-scheme` Only)

**Decision:** Dark mode is controlled by adding/removing the `dark-theme` class on `document.documentElement`, with `prefers-color-scheme` as the default fallback.

**Alternatives Considered:**
- CSS-only `@media (prefers-color-scheme: dark)` with no JS toggle
- Angular CDK `OverlayContainer.addPanelClass('dark-theme')`

**Reason:** A class-based toggle gives full programmatic control — users can override their OS preference. The CDK approach only affects Material overlay panels (dialogs, menus, tooltips), not the full application surface. The CSS-only approach cannot be overridden by user preference stored in `localStorage`.

---

## DD-012 · `LoggerService` Wrapping `console.*`

**Decision:** All application logging goes through `LoggerService`. `debug` and `info` are no-ops in production via `isDevMode()`.

**Alternatives Considered:**
- Direct `console.*` calls throughout the codebase
- Third-party library (`ngx-logger`)

**Reason:** Direct `console.*` calls cannot be globally toggled. A service wrapper costs ~60 lines and provides: (a) production suppression; (b) a consistent `[PolicyHub]` prefix for DevTools filtering; (c) a single injection point for future remote error reporting (Sentry, Application Insights); (d) mockable in unit tests.

---

## DD-013 · Mock API via a Custom Express Server (Not `json-server`)

**Decision:** A small custom Express server (`mock-api/server.js`, ~170 lines) serves `mock-api/db.json` as a REST API on port 3000. It implements `GET /policies` (filter + OR-search + sort + pagination, returning a `{ data, total }` envelope), `GET /policies/summary` (KPI aggregates over the filtered set), `GET /policies/:id`, and `PATCH /policies/:id`.

**Alternatives Considered:**
- `json-server` (the original approach)
- `@angular/in-memory-web-api`
- MSW (Mock Service Worker)

**Reason:** The dashboard requires **true server-side filtering, free-text search, sorting, pagination AND a server-computed summary**. `json-server` cannot express a free-text OR across three specific fields — repeating `policyNumber_like`/`policyHolderName_like`/`underwriter_like` is ANDed, which returns near-empty results (a latent bug in the original implementation). It also has no concept of a domain "summary" endpoint. A custom Express server gives exact control over the contract the Angular client depends on, with Express already present as an SSR dependency (no new package). PATCH mutations are intentionally held in memory so the seed file stays pristine in git. The server is a real HTTP server, so it still exercises the network stack, CORS and HTTP status codes that the real backend will.

---

## DD-014 · Server-Side Pagination with a Controlled `MatPaginator`

**Decision:** The store holds only the **current page** of policies plus the server's `total`. The `MatPaginator` is a controlled component bound to store signals (`[length]="store.total()"`, `[pageIndex]`, `[pageSize]`) with its `(page)` event calling `store.setPage()`. It is NOT attached to `MatTableDataSource`. `pageIds` is derived directly from `store.policies()` (the page itself).

**Alternatives Considered:**
- Fetching all matching records and paginating client-side via `dataSource.paginator`
- Tracking `_pageIndex`/`_pageSize` signals locally in the component and slicing the full set

**Reason:** Loading the full result set into the client defeats the point of server-side filtering and does not scale past the seed data. With the page as the only client-held data, `pageIds` (used by the "select all on page" checkbox) is trivially `store.policies().map(p => p.id)` — no async `MatTableDataSource.filteredData` staleness to work around. `setPage()` persists the chosen page size to `localStorage` and is a no-op when page index and size are unchanged, avoiding redundant requests.

---

## DD-014a · Server-Computed Summary (`GET /policies/summary`)

**Decision:** The KPI summary (status counts, total premium, expiring-within-30-days, GWP by LOB) is fetched from a dedicated endpoint and stored in a `_summary` signal, loaded alongside the page via `forkJoin` in `loadPolicies()`.

**Alternatives Considered:**
- Computing the summary client-side from the loaded policies (the original approach)

**Reason:** Once pagination is server-side the client only holds one page, so it can no longer aggregate across the whole filtered set. The server computes the aggregates over the same filter criteria, keeping the KPI cards correct regardless of which page is displayed. `forkJoin` guarantees the table and the summary always reflect the same filter state (they update together or not at all).

---

## DD-015 · Server-Side Sort in `PolicyTable` (No `dataSource.sort` Assignment)

**Decision:** `MatSort`'s `(matSortChange)` event is forwarded to `store.updateSort()` instead of assigning `matSort` to `dataSource.sort`.

**Alternatives Considered:**
- `dataSource.sort = this.sortRef()!` — standard client-side sort approach

**Reason:** Assigning `dataSource.sort` would sort the local page client-side, conflicting with the server ordering and producing a double-sort. Forwarding to `store.updateSort()` (which resets to page 0 and refetches) keeps a single, deterministic, server-driven sort source.

---

## DD-016 · Two `formValueChanges` Subscriptions in `PolicyFilter`

**Decision:** `PolicyFilter` subscribes to `form.valueChanges` twice: once with no debounce (updates the local chip/count snapshot only) and once with `debounceTime(400)` (store fetch + localStorage + URL sync).

**Alternatives Considered:**
- Single subscription that debounces everything together
- No debounce on the store update (the original approach, when filtering was client-side)

**Reason:** Now that filtering/search/sort are **server-side**, every `store.updateFilters()` triggers an HTTP request — firing one per keystroke would hammer the API. The store fetch, localStorage write and URL replace are therefore all debounced (400 ms): this coalesces rapid typing into one request, prevents a browser-history entry per character, and reduces localStorage I/O to O(typing pauses). The immediate subscription is kept only for the chip/count badge, which is pure local UI with no I/O and benefits from instant feedback.

---

## DD-017 · `FilterPanel` Dismissal Contract via `MatBottomSheetRef`

**Decision:** `FilterPanel` communicates results back to `PolicyFilter` by calling `MatBottomSheetRef.dismiss(value)` with three distinct typed values: `PolicyFilterFormValue` (Apply), `'reset'` (Reset), `undefined` (backdrop/Escape).

**Alternatives Considered:**
- `@Output() EventEmitter` on `FilterPanel` — does not work across the CDK Overlay boundary
- Shared filter service with a `BehaviorSubject` for bidirectional communication
- Callback function passed via `MAT_BOTTOM_SHEET_DATA`

**Reason:** `MatBottomSheetRef.dismiss(value)` is the idiomatic Angular Material pattern for returning data from an overlay. It keeps `FilterPanel` fully decoupled from `PolicyFilter` — no direct reference, no shared service, no event emitter. The parent handles all outcomes in one `afterDismissed()` subscription. The `'reset'` string sentinel is unambiguous (`undefined` already means "dismissed without action", `null` is ambiguous in TypeScript).

---

## DD-018 · `provideNativeDateAdapter()` Scoped to `FilterPanel`

**Decision:** The native date adapter is declared in `FilterPanel`'s `providers` array, not imported globally via `MatNativeDateModule`.

**Alternatives Considered:**
- `import MatNativeDateModule` in the root `AppModule` or `app.config.ts`
- Using a third-party date adapter (Luxon, date-fns)

**Reason:** Scoping the adapter to the `FilterPanel` component's injector means the date adapter is only initialised when the bottom sheet opens — not at app startup. In an SSR context, the native `Date` adapter works without polyfills on both browser and Node.js. Third-party adapters add bundle weight not justified by the simple "pick a date" use case here.

---

## DD-019 · `effectiveDateFrom` / `effectiveDateTo` as ISO 8601 Strings in `PolicyFilter`

**Decision:** Date range filter values in `PolicyFilter` are `string` (ISO `YYYY-MM-DD` format), not `Date` objects.

**Alternatives Considered:**
- `Date` objects in `PolicyFilter`
- Unix timestamp numbers

**Reason:** `PolicyFilter` is serialised to both `localStorage` (via `JSON.stringify`) and URL query params. `Date` objects do not survive `JSON.stringify` round-trips (they become ISO strings with time components, then fail `new Date()` parsing on deserialisation). `YYYY-MM-DD` ISO strings are naturally sortable lexicographically, so the server-side date-range predicate is a simple string comparison — no `Date` object allocation per row. (Filtering now runs server-side; the ISO-string choice still matters for clean localStorage/URL round-tripping.)

---

## DD-020 · SVG `stroke-dashoffset` for the Expiry Arc (No Chart Library)

**Decision:** The expiring-within-30-days indicator is a hand-authored SVG arc using `stroke-dasharray` + `stroke-dashoffset`, animated via a CSS `transition`.

**Alternatives Considered:**
- `@angular/material` progress spinner (no partial-arc support)
- Third-party charting library (Chart.js, ECharts, D3)

**Reason:** The arc is a single data point (one percentage). Importing a charting library for one arc circle adds 60–300 kB to the bundle. The SVG technique is 15 lines of markup and 10 lines of CSS, works offline, is server-renderable, and is fully accessible via `aria-label`. CSS `transition: stroke-dashoffset 600ms ease-in-out` provides smooth animation when the filter context changes without any JS animation loop.

---

## DD-021 · `renewingIds = signal<Set<string>>(new Set())` as Local Dialog State

**Decision:** The "renewing in progress" state is tracked in a `WritableSignal<Set<string>>` local to `PolicyDrilldownDialog`, not in the global `PolicyStore`.

**Alternatives Considered:**
- A `renewingPolicyIds: WritableSignal<string[]>` in `PolicyStore`
- A `Map<string, boolean>` in the component using `ChangeDetectorRef.markForCheck()`

**Reason:** The renewing spinner is ephemeral UI feedback — it shows for 1500 ms then disappears regardless of API outcome. Storing this in the global store would: (a) mix UI presentation state with domain state; (b) require the store to export and manage the renewing set; (c) persist the state across dialog open/close cycles. A local signal scoped to the dialog lifetime is the correct granularity. A `Set` (not array) gives O(1) `.has()` lookup for template `[disabled]` bindings.

---

## DD-022 · Snapshot `selectedCount()` Before `flagSelectedPolicies()` in BulkActionBar

**Decision:** `BulkActionBar.flagForReview()` captures `const count = this.store.selectedCount()` before calling `this.store.flagSelectedPolicies()`.

**Alternatives Considered:**
- Reading `store.selectedCount()` after the dispatch to construct the snackbar message.

**Reason:** `store.flagSelectedPolicies()` calls `clearSelection()` as part of its optimistic update path. Signal updates are synchronous — by the time the next line reads `selectedCount()`, the selection has already been cleared (count = 0). Snapshotting before the dispatch guarantees the snackbar message reflects the actual number of policies actioned.

---

## DD-023 · Single `PolicyDrilldownDialog` for Both Detail and List Modes

**Decision:** One dialog component handles `mode: 'detail'`, `mode: 'status'`, and `mode: 'expiring'` via `@if` branches in the template.

**Alternatives Considered:**
- Two separate dialog components: `PolicyDetailDialog` and `PolicyListDialog`.

**Reason:** Both modes share: `MAT_DIALOG_DATA` injection, `MatDialogRef.close()` for dismissal, `renew()` and `flagDetail()` store actions, and the same dialog header/footer chrome. Merging them reduces file count from 6 to 3. The `@if` branches are clearly separated — neither bleeds into the other. If complexity grows (e.g. the list mode needs its own sort/filter), splitting becomes justified; premature at this stage.

---

## DD-024 · `@defer (on idle)` for the Table Section

**Decision:** The BulkActionBar, PolicyTable, and EmptyState are wrapped in an `@defer (on idle)` block in the PolicyDashboard template.

**Alternatives Considered:**
- Rendering all components eagerly (no `@defer`).
- Using `@defer (on viewport)` scoped to a container div.

**Reason:** The filter bar and summary panel are above the fold and must paint on first render. The table, bulk-action toolbar, and empty state are below the fold. `on idle` defers them until the browser has a free frame after first paint, keeping the LCP focused on the visible summary. `on viewport` was considered but requires a static height placeholder to trigger; `on idle` is simpler and sufficient. The `@placeholder <div aria-busy="true">` prevents layout shift and correctly signals loading state to assistive technologies.

---

## DD-025 · ThemePicker: Runtime CSS Custom Property Overrides vs Build-time SCSS Classes

**Decision:** `ThemePickerComponent` applies palette changes by setting `document.documentElement.style.setProperty('--mat-sys-primary*', value)` at runtime.

**Alternatives Considered:**
1. Pre-generating 10 `@include mat.theme()` blocks in styles.scss, switching via `data-palette` attribute on `<html>`.
2. Angular CDK Overlay theme service.
3. A third-party theming library.

**Reason:** Generating 10 full M3 theme blocks at build time would add ~150–300 kB of CSS (each `mat.theme()` generates ~300+ CSS rules) to the initial stylesheet payload. Runtime `style.setProperty()` on 4 tokens is zero-cost — no extra CSS shipped, no SCSS changes required when adding a new palette. Angular Material 3's token-based architecture is designed to support exactly this pattern: M3 system tokens flow through all components, so overriding only the primary-family tokens produces a visually coherent brand colour change across buttons, chips, tabs, and focused inputs.

---

## DD-026 · `EmptyState` and `ErrorState` Are Store-Agnostic Shared Components

**Decision:** `EmptyState` and `ErrorState` live in `src/app/shared/` and communicate via `output()` events. They do not inject `PolicyStore`.

**Alternatives Considered:**
- Injecting `PolicyStore` directly (simpler in the short term).
- Passing a callback function as an `@Input`.

**Reason:** These components must be reusable across feature pages that have different stores or different retry/clear semantics. Injecting `PolicyStore` would couple a shared component to a feature-specific dependency, violating the shared/ contract. An `output()` event routes the action through the parent (PolicyDashboard), which decides the correct store method to call. A callback `@Input` would work but is less Angular-idiomatic than `output()` for DOM event-like interactions.

---

## DD-027 · `loadComponent()` for the Default Route Even With a Single Route

**Decision:** The `''` route uses `loadComponent()` rather than an eager `component:` import.

**Alternatives Considered:**
- `{ path: '', component: PolicyDashboard }` with an eager import.

**Reason:** The architecture constraint (Prompt 7) specifies "lazy-loaded via Angular Router only". Even with one route today, `loadComponent()` keeps the root bundle minimal (App shell + ThemePickerComponent + router + M3 theme) and defers the 627 kB policy domain chunk until navigation. This future-proofs the app: adding a second route (settings, login) does not require converting the existing route to lazy loading later. Build output confirms the split is working: the initial bundle is 2.2 MB browser (includes Angular + Material), while `policy-dashboard` is a separate 627 kB lazy chunk.
