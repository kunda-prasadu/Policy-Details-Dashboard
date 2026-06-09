# Contributing to Policy Hub

Thank you for contributing to the Policy Hub dashboard. This guide covers branching strategy, commit conventions, code standards, and the PR process.

---

## Table of Contents

1. [Branching Strategy](#branching-strategy)
2. [Commit Conventions](#commit-conventions)
3. [Code Standards](#code-standards)
4. [Running Locally](#running-locally)
5. [Pull Request Process](#pull-request-process)
6. [Testing Requirements](#testing-requirements)

---

## Branching Strategy

This project follows **GitHub Flow** (single `main` branch + short-lived feature branches).

```
main                         ← always deployable
├── feature/ch-XXX-short-description
├── fix/ch-XXX-short-description
├── chore/ch-XXX-short-description
└── docs/ch-XXX-short-description
```

| Branch prefix | When to use |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `chore/` | Build, config, dependency updates |
| `docs/` | Documentation-only changes |
| `refactor/` | Code restructuring with no behaviour change |

**Rules:**
- Branch from `main`, merge back to `main` via PR
- Delete your branch after merge
- Never force-push to `main`
- Prefix branch names with the ticket ID: `feature/ch-103-signal-store`

---

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting, no logic change |
| `refactor` | Code change that is neither fix nor feature |
| `test` | Adding or updating tests |
| `chore` | Build, config, dependency changes |
| `perf` | Performance improvement |

**Scopes** (optional, maps to feature areas):

`core`, `policy-dashboard`, `shared`, `theme`, `api`, `store`, `ui`, `config`

**Examples:**
```
feat(policy-dashboard): add region filter chips to policy list
fix(store): correct pagination reset on filter change
chore(deps): upgrade @angular/material to 20.2.14
docs(architecture): add signal store diagram
test(store): add unit tests for PolicyStore.load()
```

---

## Code Standards

### Global Rules (enforced in all files)

1. **JSDoc** on every class, service, component, and store — explain single responsibility.
2. **JSDoc** on every public method — what it does, why it exists, side effects.
3. `// WHY THIS APPROACH:` comment before any non-obvious logic block.
4. `// DECISION: / ALTERNATIVES CONSIDERED: / REASON:` at the top of files with architectural choices.

### TypeScript
- `strict: true` — no `any`, no non-null assertions without comment
- String union types over enums
- `readonly` on arrays and objects that must not be mutated
- `as const` for constant arrays that drive type inference

### Angular
- Standalone components only — no `@NgModule`
- Zoneless — no `NgZone.run()`, no `markForCheck()`
- Signal-based state — `signal()`, `computed()`, `effect()` only; no `BehaviorSubject` in stores
- Functional interceptors, functional guards, functional resolvers
- Lazy-loaded feature routes

### SCSS
- Component-scoped styles in component `.scss` files
- Global styles in `src/styles.scss` only (resets, Material tokens, utilities)
- Use `var(--mat-sys-*)` tokens rather than hard-coded hex colours
- 8pt spacing scale via `--space-*` CSS variables

---

## Running Locally

```bash
# Install dependencies
npm install

# Start mock API (port 3000) — keep running in a terminal
npm run start:api

# Start Angular dev server (port 4200) — separate terminal
npm start

# Production build (SSR)
npm run build

# Unit tests
npm test

# E2E tests
npx playwright test

# Regenerate mock data (250 policies)
npm run generate:mock
```

---

## Pull Request Process

1. Create a branch from `main` with the correct prefix and ticket ID.
2. Make your changes following the code standards above.
3. Ensure `ng build` passes with **zero errors and zero warnings**.
4. Run unit tests: `npm test` — all must pass.
5. Fill in the PR template fully — do not skip any section.
6. Request review from at least one team member.
7. Address all review comments before merging.
8. Squash-merge into `main` with a Conventional Commit message.
9. Delete your branch after merge.

### PR Checklist (enforced by template)
- [ ] `ng build --configuration production` passes
- [ ] All new public methods have JSDoc
- [ ] New models/constants have barrel exports
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] `DESIGN_DECISIONS.md` updated if an architectural choice was made
- [ ] `AI-JOURNAL.md` updated if AI assistance was used

---

## Testing Requirements

| Layer | Tool | Minimum coverage |
|---|---|---|
| Unit tests | Vitest | 80% lines on services and stores |
| E2E tests | Playwright | Critical user journeys (list, filter, detail) |

New services and stores must ship with unit tests in the same PR.
