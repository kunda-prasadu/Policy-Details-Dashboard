# i18n Scaffolding

This folder contains locale dictionaries for future localization.

## Current state
- `en.json` is the default language dictionary.
- UI currently renders English literals directly in templates/components.
- Dictionary keys are prepared so strings can be progressively migrated.

## Suggested migration path
1. Add an i18n service (or `@ngx-translate/core`) to load `src/assets/i18n/*.json`.
2. Replace hardcoded literals with key lookups in components/templates.
3. Add additional locale files, for example `ja.json`, `th.json`.
4. Wire locale selection to browser preference + user override in storage.
