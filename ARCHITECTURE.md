# Architecture — Policy Hub (Chubb APAC)

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Node.js                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Angular 20 SSR App                       │  │
│  │                                                           │  │
│  │  ┌────────────┐   ┌──────────────┐   ┌────────────────┐  │  │
│  │  │   Shell    │   │  Dashboard   │   │  Policy Detail │  │  │
│  │  │  (eager)   │──▶│  (lazy)      │──▶│  (lazy)        │  │  │
│  │  └────────────┘   └──────┬───────┘   └───────┬────────┘  │  │
│  │                          │                   │            │  │
│  │                   ┌──────▼───────────────────▼──────┐    │  │
│  │                   │      Signal-Based State Store    │    │  │
│  │                   │  (PolicyStore — signals only)    │    │  │
│  │                   └──────────────┬──────────────────┘    │  │
│  │                                  │                        │  │
│  │                   ┌──────────────▼──────────────────┐    │  │
│  │                   │         PolicyApiService          │    │  │
│  │                   │   (HttpClient + withFetch)        │    │  │
│  │                   └──────────────┬──────────────────┘    │  │
│  │                                  │  HTTP (withInterceptors)  │
│  │                   ┌──────────────▼──────────────────┐    │  │
│  │                   │       errorInterceptor            │    │  │
│  │                   │  (normalises all HTTP errors)     │    │  │
│  │                   └──────────────┬──────────────────┘    │  │
│  └──────────────────────────────────┼──────────────────────┘  │
│                                     │                           │
└─────────────────────────────────────┼───────────────────────────┘
                                      │ REST (JSON)
                                      ▼
                         ┌────────────────────────┐
                         │  Express mock / real API │
                         │  http://localhost:3000   │
                         │  GET /policies           │
                         │  GET /policies/:id       │
                         └────────────────────────┘
```

---

## 2. Module / Feature Structure

```
src/app/
├── app.config.ts              Root provider configuration (zoneless, SSR, HTTP)
├── app.routes.ts              Top-level route definitions (lazy feature routes)
├── app.ts                     Root standalone component (shell)
│
├── core/                      Singleton infrastructure (never feature-specific)
│   ├── services/
│   │   ├── storage.service.ts Generic localStorage wrapper (SSR-safe)
│   │   ├── theme.service.ts   Dark/light mode signal + DOM class sync
│   │   └── logger.service.ts  Structured logger (suppressed in production)
│   └── interceptors/
│       └── error.interceptor.ts Normalises all HTTP errors (NormalisedHttpError)
│
├── shared/                    Reusable presentational components & utilities
│   ├── loading-skeleton/      CSS shimmer placeholder (no store dependency)
│   ├── error-state/           Error card with retryClick output
│   ├── empty-state/           Zero-results card with clearFilters output
│   └── theme-picker/          Palette swatch grid (MatMenu); runtime CSS token overrides
│
└── features/
    └── policy-dashboard/      Lazy-loaded feature domain
        ├── models/            TypeScript interfaces (Policy, PolicyFilter, etc.)
        ├── constants/         Typed const arrays (REGIONS, POLICY_STATUSES, etc.)
        ├── store/             Signal-based state (PolicyStore)
        ├── services/          PolicyApiService
        ├── pages/
        │   └── policy-dashboard/  Routed page component (lazy-loaded via loadComponent)
        ├── components/
        │   ├── policy-table/  Paginated, sortable, selectable mat-table
        │   ├── policy-filter/ Search bar + chip strip + URL/storage sync
        │   ├── filter-panel/  Advanced filters bottom sheet (MatBottomSheet)
        │   ├── summary-panel/ Status KPI cards + SVG arc + GWP bars
        │   ├── bulk-action-bar/ Selection toolbar with flag action
        │   └── policy-drilldown-dialog/ Detail card + filtered list dialog
        └── policy-dashboard.routes.ts  Feature-level route config
```

---

## 3. Rendering Strategy

| Concern | Decision |
|---|---|
| Rendering mode | `RenderMode.Server` (dynamic SSR on every request) |
| Why not Prerender | Policy data is real-time and user-filtered — static HTML would be stale |
| Hydration | `provideClientHydration(withEventReplay())` — events captured during hydration are replayed |
| Change detection | `provideZonelessChangeDetection()` — signals drive all reactivity, no Zone.js |

---

## 4. State Management

**Signal-based custom store** (no NgRx, no NGXS).

```
PolicyStore (Injectable, providedIn: 'root')
│
├── Private WritableSignals (state atoms)
│   ├── _policies            WritableSignal<Policy[]>
│   ├── _total               WritableSignal<number>          (server match count)
│   ├── _summary             WritableSignal<PolicySummaryData> (server-computed)
│   ├── _pagination          WritableSignal<PageRequest>      (pageIndex/pageSize)
│   ├── _loading             WritableSignal<boolean>
│   ├── _error               WritableSignal<string | null>
│   ├── _filters             WritableSignal<PolicyFilter>
│   ├── _sort                WritableSignal<PolicySort>  (default: expiryDate/asc)
│   └── _selectedPolicyIds   WritableSignal<string[]>
│
├── Public ReadonlySignals
│   ├── policies             _policies.asReadonly()   ← CURRENT PAGE only
│   ├── total                _total.asReadonly()
│   ├── summary              _summary.asReadonly()
│   ├── pagination           _pagination.asReadonly()
│   ├── loading / error / filters / sort / selectedPolicyIds
│
├── Computed Signals (derived, read-only)
│   ├── selectedCount        selectedPolicyIds().length
│   └── hasSelection         selectedCount > 0
│
└── Action Methods
    ├── loadPolicies()        forkJoin(getAll page, getSummary) → _policies/_total/_summary
    ├── updateFilters(patch)  merges patch, resets to page 0, reloads
    ├── clearFilters()        resets _filters to {}, page 0, reloads
    ├── updateSort(sort)      sets _sort, resets to page 0, reloads
    ├── setPage(idx, size)    sets _pagination (persists size), reloads
    ├── toggleSelection(id) / selectAll(ids[]) / clearSelection()
    ├── flagSelectedPolicies() optimistic flag + forkJoin + rollback on error
    └── renewPolicy(id)       optimistic status patch + summary refresh + rollback
```

Why signals over NgRx:
- ~300-line store vs. 800+ lines of actions/reducers/selectors/effects
- No boilerplate, no RxJS streams to manage
- Native Angular 20 reactivity — no extra dependencies
- Components bind directly to `store.policies()` / `store.summary()` in templates

**Server-side, not client-side:** filtering, free-text search, sorting, pagination and the summary are all computed by the API. The store holds only the current page + the server's total + the server summary — it never loads the full dataset.

---

## 5. HTTP Layer

```
Component → PolicyStore.loadPolicies()
                 │  forkJoin
                 ├── PolicyApiService.getAll(filters, sort, page)  → { data, total }
                 └── PolicyApiService.getSummary(filters)          → PolicySummaryData
                                         │
                                  HttpClient.get(..., { params })
                                         │
                                  errorInterceptor
                                  ├── 200 OK  → typed response
                                  └── 4xx/5xx → throwError(NormalisedHttpError)
```

**API query mapping (custom Express server):**

| PolicyFilter / page field | query param | Example |
|---|---|---|
| `search` (OR over #, holder, underwriter) | `search` | `?search=POL-001` |
| `statuses[]` | repeated `status` | `?status=Active&status=Pending` |
| `regions[]` / `linesOfBusiness[]` / `currencies[]` | repeated | `?region=Singapore` |
| `premiumMin` / `premiumMax` | `premiumMin` / `premiumMax` | `?premiumMin=50000` |
| `effectiveDateFrom`/`To`, `expiryDateFrom`/`To` | same names | `?expiryDateTo=2026-12-31` |
| sort | `sort` + `order` | `?sort=premiumAmount&order=desc` |
| pagination | `page` (1-based) + `pageSize` | `?page=2&pageSize=25` |

`GET /policies` → `{ data, total }`; `GET /policies/summary` → aggregates over the same filters.

---

## 6. Theme System

```
User clicks toggle
       │
ThemeService.toggle()
       │
  _isDark.set(!current)   ← WritableSignal<boolean>
       │
  effect(() => applyThemeClass(_isDark()))
       │
  document.documentElement.classList.toggle('dark-theme')
       │
  CSS: html.dark-theme { color-scheme: dark }  ← Angular Material M3 tokens flip
```

Persistence: `localStorage['policy-hub-theme']` via `StorageService`.  
Initial resolution: stored value → `prefers-color-scheme` media query → light default.

---

## 7. Component Layer (Prompt 4–5)

```
PolicyFilter (search bar + chip strip)
│  ├── form.valueChanges (immediate) → store.updateFilters()
│  ├── form.valueChanges (debounced 400 ms) → StorageService + router.navigate(replaceUrl)
│  └── openFilters() → MatBottomSheet.open(FilterPanel)
│                              │
│                        FilterPanel (bottom sheet)
│                        ├── seeded from MAT_BOTTOM_SHEET_DATA
│                        └── dismiss(value | 'reset' | undefined)
│
SummaryPanel (KPI cards + widgets)
├── statusCards: computed() → 4 status cards from store.summary()
├── arcDashOffset: computed() → stroke-dashoffset for SVG arc
├── gwpBars: computed() → GWP per LOB, relative % bars
└── openStatusDrilldown(status) → MatDialog.open(PolicyDrilldownDialog)
                                           │
                                 PolicyDrilldownDialog (detail | status | expiring)
                                 ├── mode='detail'  → detailPolicy = computed from store.policies()
                                 ├── mode='status'  → fetches its own status-scoped set via getAll()
                                 ├── mode='expiring'→ fetches Active + ≤30d window via getAll()
                                 ├── renewingIds = signal<Set<string>>()
                                 ├── renew(id) → store.renewPolicy(id) + 1500ms spinner
                                 └── flagDetail() → store.selectAll([id]) + flagSelectedPolicies()
│
BulkActionBar (selection toolbar)
├── aria-live selection count
├── clearSelection() → store.clearSelection()
└── flagForReview() → snapshot count → store.flagSelectedPolicies() → MatSnackBar
│
PolicyTable (mat-table)
├── dataSource: MatTableDataSource<Policy>
│   └── data ← effect(() => store.policies())   ← current page
├── paginator: CONTROLLED — [length]=store.total(), [pageIndex]/[pageSize]=store.pagination()
│   └── (page) → store.setPage(idx, size)        ← server fetch
├── pageIds: computed(() => store.policies().map(p => p.id))
├── isAllOnPageSelected / isSomeOnPageSelected: computed()
├── Sort: (matSortChange) → store.updateSort()   [server-side]
└── output<Policy>() rowClick
```

---

## 8. Security Posture (OWASP Top 10)

| Risk | Mitigation |
|---|---|
| A01 Broken Access Control | No auth in scope; all API calls are to same-origin mock API |
| A02 Cryptographic Failures | No credentials or sensitive data stored — localStorage holds only theme preference |
| A03 Injection | Angular's `DomSanitizer` active; no `innerHTML` usage; API params typed and URL-encoded by `HttpClient` |
| A05 Security Misconfiguration | 5xx server error messages stripped in `errorInterceptor` — never passed to UI |
| A06 Vulnerable Components | `npm audit` run after every dependency install |
| A09 Logging Failures | `LoggerService` suppresses debug/info in production; no credentials logged |

---

## 9. Documentation Maintenance Rule

The following files must be updated at the end of **every prompt** (after the build passes):

| File | What to update |
|---|---|
| `AI-JOURNAL.md` | Add a new session entry with: what was built, key decisions, build result |
| `DESIGN_DECISIONS.md` | Add a DD-NNN entry for every non-obvious design choice |
| `CHANGELOG.md` | Add `Added` / `Changed` / `Fixed` entries under `[Unreleased]` |
| `ARCHITECTURE.md` | Update any diagram or section that no longer reflects the codebase |
