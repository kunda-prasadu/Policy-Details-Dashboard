/**
 * Public API surface for the policy-dashboard feature components.
 *
 * Re-export every presentational component from this barrel so parent
 * routes and the shell component can import them with a single path:
 *
 *   import { PolicyTable, PolicyFilter, FilterPanel,
 *            SummaryPanel, BulkActionBar, PolicyDrilldownDialog }
 *     from '../../features/policy-dashboard/components';
 */
export * from './policy-table/policy-table';
export * from './policy-filter/policy-filter';
export * from './filter-panel/filter-panel';
export * from './summary-panel/summary-panel';
export * from './bulk-action-bar/bulk-action-bar';
export * from './policy-drilldown-dialog/policy-drilldown-dialog';
