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
| Unit Tests | Vitest |
| E2E Tests | Playwright |
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

<!-- New sessions will be appended below -->
