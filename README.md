# Policy Hub — Chubb APAC

A production-quality insurance policy management dashboard built with **Angular 20**, **Angular Material 3**, and a custom **signal-based state store**. Designed for Chubb APAC operations to provide real-time visibility into policy portfolios across regions and lines of business.

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Angular 20 (Standalone, Zoneless) |
| UI Library | Angular Material 3 |
| State | Signal-based custom store |
| Rendering | SSR (`@angular/ssr`) |
| Styling | SCSS (component-scoped) |
| Unit Tests | Jasmine + Karma |
| E2E Tests | Not configured in this repo |
| Mock API | Custom Express server (server-side filter/search/sort/pagination + summary) |

## i18n Readiness

- Locale provider is configured to `en-US` in app configuration.
- Translation dictionary scaffolding is available under `src/assets/i18n/en.json`.
- The current UI remains English-first; keys are prepared for incremental migration.

## Prerequisites

- Node.js 20+
- npm 10+
- Angular CLI 20: `npm install -g @angular/cli`

## Getting Started

```bash
# Install dependencies
npm install

# Start the mock API (port 3000)
npm run start:api

# Start the Angular dev server (port 4200) — in a separate terminal
npm start
```

## Available Scripts

| Script | Description |
|---|---|
| `npm start` | Start Angular dev server at http://localhost:4200 |
| `npm run build` | Production build with SSR |
| `npm run start:api` | Start the Express mock API at http://localhost:3000 |
| `npm run generate:mock` | Regenerate 250 mock policy records |
| `npm run watch` | Dev build in watch mode |
| `npm test` | Run unit tests |

## Project Structure

```
src/
├── app/
│   ├── core/          # Singleton services, interceptors, guards
│   ├── shared/        # Reusable components, pipes, directives
│   ├── features/      # Lazy-loaded feature modules
│   │   ├── dashboard/ # Portfolio overview
│   │   └── policies/  # Policy list & detail
│   ├── app.config.ts
│   ├── app.routes.ts
│   └── app.ts
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
└── styles.scss
mock-api/
├── server.js          # Express mock API: server-side filter/search/sort/pagination + /summary
├── generate-data.js   # Faker-based seed script
└── db.json            # Seed database (250 records)
```

## API Contract

The Angular client holds only the current page — filtering, search, sorting, pagination and the KPI summary are all computed server-side.

| Endpoint | Purpose |
|---|---|
| `GET /policies?search=&status=&region=&lineOfBusiness=&currency=&premiumMin=&premiumMax=&effectiveDateFrom=&effectiveDateTo=&expiryDateFrom=&expiryDateTo=&sort=&order=&page=&pageSize=` | One filtered/sorted page; returns `{ data: Policy[], total: number }` |
| `GET /policies/summary?<same filters>` | KPI aggregates over the filtered set (status counts, total premium, expiring-within-30-days, GWP by LOB) |
| `GET /policies/:id` | Single policy |
| `PATCH /policies/:id` | Partial update (flag for review, renew) — in-memory only |

`search` is a true OR across `policyNumber`, `policyHolderName` and `underwriter`.


## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

E2E tests are currently not configured in this repository.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
