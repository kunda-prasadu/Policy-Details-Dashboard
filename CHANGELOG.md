# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Angular 20 SSR app scaffold with zoneless change detection
- Angular Material 3 (Azure/Blue theme) with local Material Icons font
- `provideHttpClient(withFetch())` + functional `errorInterceptor` for normalised HTTP errors
- Environment files (`environment.ts`, `environment.prod.ts`) with `fileReplacements`
- `src/styles.scss` — Material 3 CSS token aliases, dark mode (`html.dark-theme`), global reset, `prefers-reduced-motion` query
- `mock-api/generate-data.js` — faker-based 250-policy seed script (8 APAC regions, 4 LOBs, all evenly distributed)
- `mock-api/db.json` — seeded mock database for `json-server`
- `package.json` scripts: `start:api`, `generate:mock`
- Domain models: `Policy`, `PolicyFilter`, `PaginationState`, `PolicySummary`, `PolicyQueryParams`
- Constants: `POLICY_STATUSES`, `REGIONS`, `LINES_OF_BUSINESS`, `CURRENCIES`, `PAGE_SIZE_OPTIONS`, `THEME_STORAGE_KEY`, `PAGE_SIZE_STORAGE_KEY`, `FILTER_STORAGE_KEY`
- `StorageService` — SSR-safe generic localStorage wrapper
- `ThemeService` — signal-based dark/light mode with localStorage persistence and `prefers-color-scheme` fallback
- `LoggerService` — production-suppressed structured logger
- `errorInterceptor` — functional HTTP interceptor normalising all errors to `NormalisedHttpError`
- `PolicyApiService` — `getAll()`, `patch()`, `flagPolicy()`, `flagPolicies()` with server-side filter params
- `PolicyStore` — signal-based state store: `filteredPolicies`, `summary`, `selectedCount`, `hasSelection`, all CRUD actions, optimistic flag + rollback
- `PolicyTable` component — paginated, sortable, selectable 9-column `mat-table`; server-side sort; `_pageIndex`/`_pageSize` signals for reliable checkbox state; `formatPremium` compact K/M formatter; status and LOB colour badges; `.is-selected` row highlight; `.is-flagged` accent border
- `PolicyFilter` component — search input, "All Filters" badge button, active chip strip; two-subscription `formValueChanges` (immediate store + debounced 400 ms URL/storage); URL ↔ localStorage ↔ defaults seed priority
- `FilterPanel` bottom-sheet component — Status / Region / LOB selects; date range pickers; min premium input; typed dismissal contract (Apply → form value, Reset → `'reset'`, backdrop → `undefined`)
- `PolicyFilter` model extended with `effectiveDateFrom?: string` and `effectiveDateTo?: string`
- `PolicyStore.filteredPolicies` extended with ISO date-string range predicate
- Documentation: `ARCHITECTURE.md`, `DESIGN_DECISIONS.md` (DD-001–DD-019), `AI-JOURNAL.md` (Sessions 001–005), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- GitHub templates: PR template, bug report, feature request

### Fixed
- Angular 20.0.3 SSR `NG0401 Missing Platform` bug — `BootstrapContext` now forwarded in `main.server.ts`
- `app.routes.server.ts` changed from `RenderMode.Prerender` to `RenderMode.Server` (prevents build-time route extraction failure)

---

## [0.1.0] — 2026-06-09

_Initial project scaffold. No features shipped yet._

---

[Unreleased]: https://github.com/kunda-prasadu/Policy-Details-Dashboard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kunda-prasadu/Policy-Details-Dashboard/releases/tag/v0.1.0
