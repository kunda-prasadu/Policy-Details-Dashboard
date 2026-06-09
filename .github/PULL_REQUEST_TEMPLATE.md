## Description

<!-- What does this PR do? Summarise the change in 2–3 sentences. -->

## Type of Change

- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `refactor` — Code change with no behaviour change
- [ ] `chore` — Build, config, or dependency update
- [ ] `docs` — Documentation only
- [ ] `test` — Adding or updating tests

## Related Ticket

<!-- e.g. Closes CH-103 -->

## Changes Made

<!-- Bullet-point list of files changed and what was done. -->

-
-

## How to Test

<!-- Steps for the reviewer to verify this PR works correctly. -->

1.
2.

## Checklist

- [ ] `ng build --configuration production` passes with zero errors
- [ ] All new public methods, services, and components have JSDoc comments
- [ ] New models/constants/services have barrel exports in `index.ts`
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] `DESIGN_DECISIONS.md` updated if an architectural choice was made
- [ ] `AI-JOURNAL.md` updated if AI assistance was used in this session
- [ ] No `any` types introduced — `strict: true` maintained
- [ ] No direct `localStorage` calls — all storage goes through `StorageService`
- [ ] No hard-coded hex colours — all colours use `var(--mat-sys-*)` tokens
- [ ] `npm audit` shows no `high` or `critical` vulnerabilities

## Screenshots (if UI change)

<!-- Attach before/after screenshots for any visual changes. -->
