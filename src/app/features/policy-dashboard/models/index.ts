/**
 * @fileoverview Barrel export for all policy-dashboard domain models.
 *
 * Import from this index rather than individual model files to keep
 * feature-module imports clean and allow internal file reorganisation
 * without touching consumer import paths.
 *
 * WHY THIS APPROACH: Barrel exports (index.ts) are the Angular style-guide
 * recommended pattern for feature organisation. They also enable the TypeScript
 * compiler's path-mapping to resolve @features/policy-dashboard/models as a
 * single entry point rather than requiring consumers to know internal file names.
 */

export * from './policy.model';
export * from './policy-filter.model';
export * from './pagination.model';
export * from './policy-summary.model';
export * from './policy-query-params.model';
