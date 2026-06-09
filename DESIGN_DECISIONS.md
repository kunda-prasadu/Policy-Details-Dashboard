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

## DD-013 · Mock API via `json-server` (Not In-Memory Web API)

**Decision:** `json-server` serves `mock-api/db.json` as a REST API on port 3000.

**Alternatives Considered:**
- `@angular/in-memory-web-api` (intercepts HttpClient at the Angular layer)
- MSW (Mock Service Worker)

**Reason:** `json-server` is a real HTTP server — it exercises the full network stack, CORS handling, and HTTP status codes that the app will encounter with the real backend. `in-memory-web-api` bypasses the network entirely, hiding real HTTP concerns. MSW is more powerful but adds configuration complexity for a project at this stage. `json-server` also supports the `X-Total-Count` header needed for server-side pagination out of the box.

---

## DD-014 · `_pageIndex` / `_pageSize` as Signals in `PolicyTable`

**Decision:** Pagination state is tracked in two `WritableSignal<number>` values (`_pageIndex`, `_pageSize`) rather than reading `MatTableDataSource.filteredData` or `dataSource.paginator.pageIndex` directly inside computed signals.

**Alternatives Considered:**
- Reading `dataSource.filteredData.length` in a `computed()` to derive the current page slice
- Reading `dataSource.paginator?.pageIndex` directly in `isAllOnPageSelected`

**Reason:** `MatTableDataSource` updates `filteredData` asynchronously via its internal RxJS pipeline. Reading it synchronously inside a `computed()` or `effect()` returns stale (often empty) data. `isAllOnPageSelected` would always evaluate to `false` because `pageIds` would slice an empty array. Tracking page state in signals that are updated synchronously in the `paginator.page` subscription — and deriving `pageIds` from `store.filteredPolicies()` (a synchronous signal) — fixes this category of bug entirely.

---

## DD-015 · Server-Side Sort in `PolicyTable` (No `dataSource.sort` Assignment)

**Decision:** `MatSort` events are forwarded to `store.updateSort()` instead of assigning `matSort` to `dataSource.sort`.

**Alternatives Considered:**
- `dataSource.sort = this.sortRef()!` — standard client-side sort approach

**Reason:** Assigning `dataSource.sort` causes `MatTableDataSource` to sort the local data array client-side. For a dashboard that calls the API on every sort change (to maintain consistent server-driven ordering), this would produce a double-sort: the API returns data sorted by the new field, and `MatTableDataSource` re-sorts the same data locally, potentially producing a different order if the sort fields contain equal values. Server-only sort (via `store.updateSort()`) ensures a single, deterministic sort source.

---

## DD-016 · Two `formValueChanges` Subscriptions in `PolicyFilter`

**Decision:** `PolicyFilter` subscribes to `form.valueChanges` twice: once with no debounce (immediate store update) and once with `debounceTime(400)` (localStorage + URL sync).

**Alternatives Considered:**
- Single subscription that debounces all three side-effects together
- `switchMap` with conditional delay based on which control changed

**Reason:** Store updates must be immediate for responsive table filtering — the data is local (`json-server` or in-memory), so there is no network cost to updating on every keystroke. URL and localStorage writes are debounced to: (a) prevent the browser history stack from gaining one entry per character typed, and (b) reduce localStorage I/O from O(keystrokes) to O(typing pauses). The two-subscription pattern is explicit and easier to audit than a single stream with conditional delays.

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

**Reason:** `PolicyFilter` is serialised to both `localStorage` (via `JSON.stringify`) and URL query params. `Date` objects do not survive `JSON.stringify` round-trips (they become ISO strings with time components, then fail `new Date()` parsing on deserialisation). `YYYY-MM-DD` ISO strings are naturally sortable lexicographically, making the filter predicate in `filteredPolicies` a simple string comparison — no `Date` object allocation per row per filter evaluation.

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
