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
                         │  json-server / real API  │
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
│   ├── components/            (added in Prompt 3+)
│   └── pipes/                 (added in Prompt 3+)
│
└── features/
    └── policy-dashboard/      Lazy-loaded feature domain
        ├── models/            TypeScript interfaces (Policy, PolicyFilter, etc.)
        ├── constants/         Typed const arrays (REGIONS, POLICY_STATUSES, etc.)
        ├── store/             Signal-based state (PolicyStore)
        ├── services/          PolicyApiService
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
│   ├── _loading             WritableSignal<boolean>
│   ├── _error               WritableSignal<string | null>
│   ├── _filters             WritableSignal<PolicyFilter>
│   ├── _sort                WritableSignal<PolicySort>  (default: expiryDate/asc)
│   └── _selectedPolicyIds   WritableSignal<string[]>
│
├── Public ReadonlySignals
│   ├── policies             _policies.asReadonly()
│   ├── loading              _loading.asReadonly()
│   ├── error                _error.asReadonly()
│   ├── filters              _filters.asReadonly()
│   ├── sort                 _sort.asReadonly()
│   └── selectedPolicyIds    _selectedPolicyIds.asReadonly()
│
├── Computed Signals (derived, read-only)
│   ├── filteredPolicies     client-side multi-value filter over _policies
│   ├── summary              KPI aggregation (active/pending/expired/cancelled/
│   │                        totalPremium/expiringWithin30Days/gwpByLob)
│   ├── selectedCount        selectedPolicyIds().length
│   ├── hasSelection         selectedCount > 0
│   └── totalPolicies        filteredPolicies().length
│
└── Action Methods
    ├── loadPolicies()        API call → _policies; resets selection + loading
    ├── updateFilters(patch)  merges patch into _filters, calls loadPolicies()
    ├── clearFilters()        resets _filters to {}, calls loadPolicies()
    ├── updateSort(sort)      sets _sort, calls loadPolicies()
    ├── toggleSelection(id)   adds/removes id from _selectedPolicyIds
    ├── selectAll(ids[])      sets _selectedPolicyIds to provided ids
    ├── clearSelection()      empties _selectedPolicyIds
    ├── flagSelectedPolicies() optimistic flag + forkJoin + rollback on error
    └── renewPolicy(id)       optimistic status patch + rollback on error
```

Why signals over NgRx:
- ~300-line store vs. 800+ lines of actions/reducers/selectors/effects
- No boilerplate, no RxJS streams to manage
- Native Angular 20 reactivity — no extra dependencies
- Components bind directly to `store.filteredPolicies()` in templates

---

## 5. HTTP Layer

```
Component → PolicyStore.load() → PolicyApiService.getPolicies(params)
                                         │
                                  HttpClient.get('/policies', { params })
                                         │
                                  errorInterceptor
                                  ├── 200 OK  → Observable<Policy[]>
                                  └── 4xx/5xx → throwError(NormalisedHttpError)
```

**json-server query mapping:**

| PolicyQueryParams field | json-server query param | Example |
|---|---|---|
| `_page` | `_page` | `?_page=1` |
| `_limit` | `_limit` | `?_limit=25` |
| `_sort` | `_sort` | `?_sort=expiryDate` |
| `_order` | `_order` | `?_order=asc` |
| `q` | `q` | `?q=POL-001` |
| `status` | `status` | `?status=Active` |
| `region` | `region` | `?region=Singapore` |
| `premiumAmount_gte` | `premiumAmount_gte` | `?premiumAmount_gte=50000` |

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
                                 ├── mode='status'  → listPolicies = computed from store.filteredPolicies()
                                 ├── mode='expiring'→ listPolicies filtered to ≤30d
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
│   └── data ← effect(() => store.filteredPolicies())
├── _pageIndex/_pageSize: WritableSignal  ← paginator.page subscription
├── pageIds: computed(() => filteredPolicies().slice(page))
├── isAllOnPageSelected / isSomeOnPageSelected: computed()
├── Sort: matSort.sortChange → store.updateSort()   [server-side only]
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
