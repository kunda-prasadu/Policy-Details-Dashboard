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
        ├── components/        Feature components (list, detail, filters, charts)
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
├── Signals (writeable)
│   ├── _policies        WritableSignal<Policy[]>
│   ├── _filter          WritableSignal<PolicyFilter>
│   ├── _pagination      WritableSignal<PaginationState>
│   ├── _loading         WritableSignal<boolean>
│   └── _error           WritableSignal<NormalisedHttpError | null>
│
└── Computed Signals (derived, read-only)
    ├── policies         computed(() => _policies())
    ├── filter           computed(() => _filter())
    ├── pagination       computed(() => _pagination())
    ├── isLoading        computed(() => _loading())
    ├── hasError         computed(() => _error() !== null)
    └── filteredCount    computed(() => derived from _policies + _filter)
```

Why signals over NgRx:
- 250-line store vs. 800+ lines of actions/reducers/selectors/effects
- No boilerplate, no RxJS streams to manage
- Native Angular 20 reactivity — no extra dependencies
- Components bind directly to `store.policies()` in templates

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

## 7. Security Posture (OWASP Top 10)

| Risk | Mitigation |
|---|---|
| A01 Broken Access Control | No auth in scope; all API calls are to same-origin mock API |
| A02 Cryptographic Failures | No credentials or sensitive data stored — localStorage holds only theme preference |
| A03 Injection | Angular's `DomSanitizer` active; no `innerHTML` usage; API params typed and URL-encoded by `HttpClient` |
| A05 Security Misconfiguration | 5xx server error messages stripped in `errorInterceptor` — never passed to UI |
| A06 Vulnerable Components | `npm audit` run after every dependency install |
| A09 Logging Failures | `LoggerService` suppresses debug/info in production; no credentials logged |
