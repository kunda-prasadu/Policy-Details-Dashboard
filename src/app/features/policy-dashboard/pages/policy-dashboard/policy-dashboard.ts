// DECISION: PolicyDashboard is a page-level "smart" component — it owns route
//           concern (loading on init, opening dialogs) but keeps all domain
//           state in PolicyStore. Presentational child components receive data
//           through signals, never through @Input props from this page.
// ALTERNATIVES CONSIDERED:
//   1. Embedding every child component directly in App — violates single
//      responsibility; App shell would need to know about policy domain.
//   2. Putting store.loadPolicies() in the store constructor — would load on
//      every injection (e.g. during SSR pre-render) not just when the page is
//      actually navigated to.
// REASON: The page component is the correct place for route lifecycle hooks
//         (ngOnInit) that trigger data loads and for opening dialogs scoped to
//         the dashboard context. All reactive state lives in PolicyStore.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { PolicyStore } from '../../store/policy.store';
import { Policy } from '../../models/policy.model';
import {
  DrilldownDialogData,
  PolicyDrilldownDialog,
} from '../../components/policy-drilldown-dialog/policy-drilldown-dialog';
import { PolicyFilter } from '../../components/policy-filter/policy-filter';
import { SummaryPanel } from '../../components/summary-panel/summary-panel';
import { BulkActionBar } from '../../components/bulk-action-bar/bulk-action-bar';
import { PolicyTable } from '../../components/policy-table/policy-table';
import { LoadingSkeleton } from '../../../../shared/loading-skeleton/loading-skeleton';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { EmptyState } from '../../../../shared/empty-state/empty-state';

/**
 * Dashboard page component — the top-level routed view for the policy hub.
 *
 * Responsibilities:
 *  - Trigger the initial policy data load on navigation.
 *  - Orchestrate child components (filter bar, summary panel, table, overlays).
 *  - Open the PolicyDrilldownDialog in detail mode when a table row is clicked.
 *
 * All domain state is owned by {@link PolicyStore}. This component only
 * reads signals and calls store actions — it holds no local state beyond
 * the `hasResults` derived signal.
 */
@Component({
  selector: 'app-policy-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    PolicyFilter,
    SummaryPanel,
    BulkActionBar,
    PolicyTable,
    LoadingSkeleton,
    ErrorState,
    EmptyState,
  ],
  templateUrl: './policy-dashboard.html',
  styleUrl: './policy-dashboard.scss',
})
export class PolicyDashboard implements OnInit {
  /** Exposes PolicyStore to the template for direct signal bindings. */
  protected readonly store = inject(PolicyStore);

  private readonly dialog = inject(MatDialog);

  /**
   * Whether the filtered policy list has at least one visible result.
   *
   * WHY COMPUTED HERE (not in the store): This is a presentation concern
   * specific to the dashboard page — whether to show the table or the
   * empty state. The store's filtered list is the source of truth; the
   * boolean wrapper lives in the view layer where it is consumed.
   */
  protected readonly hasResults = computed(
    () => this.store.filteredPolicies().length > 0,
  );

  /**
   * Trigger the initial data load when the route is activated.
   *
   * WHY ngOnInit AND NOT A CONSTRUCTOR EFFECT: ngOnInit fires once after
   * the component is fully initialised and attached to the DOM. An effect()
   * in the constructor would also fire on SSR pre-renders before the
   * component is visible, wasting server resources on mock API calls.
   */
  ngOnInit(): void {
    this.store.loadPolicies();
  }

  /**
   * Opens the PolicyDrilldownDialog in single-policy detail mode.
   *
   * Bound to the PolicyTable's `rowClick` output. The dialog is 600px
   * wide (capped at 96vw on small screens) and uses `ariaLabelledBy` to
   * link the dialog container to the `h2[id="drilldown-dialog-title"]`
   * inside the dialog template for screen-reader accessibility.
   *
   * @param policy - The policy row the user clicked.
   */
  protected openPolicyDetail(policy: Policy): void {
    this.dialog.open<PolicyDrilldownDialog, DrilldownDialogData>(
      PolicyDrilldownDialog,
      {
        data: { mode: 'detail', policy },
        width: '600px',
        maxWidth: '96vw',
        ariaLabelledBy: 'drilldown-dialog-title',
        autoFocus: 'dialog',
      },
    );
  }

  /**
   * Re-triggers the policy load after an error dismissal.
   *
   * Bound to the ErrorState component's `retryClick` output.
   */
  protected retry(): void {
    this.store.loadPolicies();
  }

  /**
   * Clears all active filters and reloads the policy list.
   *
   * Bound to the EmptyState component's `clearFilters` output.
   * `store.clearFilters()` resets _filters to the default empty object
   * and calls loadPolicies() internally.
   */
  protected clearFilters(): void {
    this.store.clearFilters();
  }
}
