/**
 * Public API surface for the policy-dashboard feature components.
 *
 * Re-export every presentational component from this barrel so parent
 * routes and the shell component can import them with a single path:
 *
 *   import { PolicyTable, PolicyFilter, FilterPanel }
 *     from '../../features/policy-dashboard/components';
 */
export * from './policy-table/policy-table';
export * from './policy-filter/policy-filter';
export * from './filter-panel/filter-panel';
