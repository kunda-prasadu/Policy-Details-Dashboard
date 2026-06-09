// DECISION: Standalone component with ChangeDetectionStrategy.OnPush.
// ALTERNATIVES CONSIDERED: Default change detection with zone-based triggering.
// REASON: OnPush + signals gives fine-grained, precise re-renders. Only the
//         specific signal reads inside the template (isAllOnPageSelected,
//         isSomeOnPageSelected, store.selectedPolicyIds, store.policies)
//         trigger re-evaluation — no full component tree traversal on every tick.

// DECISION: Paginator is a CONTROLLED component, not wired to MatTableDataSource.
// ALTERNATIVES CONSIDERED: Assigning dataSource.paginator for client-side paging.
// REASON: Pagination is server-side — the store holds only the current page and
//         the server's total count. The MatPaginator is bound to store signals
//         ([length]=total, [pageIndex], [pageSize]) and its (page) event drives
//         store.setPage(), which fetches the next page. MatTableDataSource is used
//         purely for trackBy + no-data-row support; it renders every row it is
//         given because that array is already exactly one page.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  LOCALE_ID,
  output,
} from '@angular/core';
import { getCurrencySymbol } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Policy } from '../../models/policy.model';
import { PolicyStore } from '../../store/policy.store';
import { PAGE_SIZE_OPTIONS } from '../../constants/policy.constants';

/**
 * Policy list table component.
 *
 * Renders a server-paginated, server-sorted, selectable Angular Material table
 * of the current page of Policy records sourced from PolicyStore. All
 * filter/sort/pagination/selection state is owned by the store — this component
 * is presentational, delegating mutations to store action methods and emitting
 * row clicks to the parent.
 */
@Component({
  selector: 'app-policy-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './policy-table.html',
  styleUrl: './policy-table.scss',
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
})
export class PolicyTable {
  // ---------------------------------------------------------------------------
  // Injected dependencies
  // ---------------------------------------------------------------------------

  /** Store — source of truth for the current page, total, sort, and selection. */
  protected readonly store = inject(PolicyStore);

  /** LOCALE_ID — required by getCurrencySymbol to format premium amounts. */
  private readonly locale = inject<string>(LOCALE_ID);

  // ---------------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------------

  /** Emits the clicked Policy when the user clicks the "View details" button. */
  readonly rowClick = output<Policy>();

  // ---------------------------------------------------------------------------
  // Table configuration
  // ---------------------------------------------------------------------------

  /** Ordered list of column keys rendered by the table. */
  protected readonly displayedColumns: string[] = [
    'select',
    'policyNumber',
    'policyHolderName',
    'lineOfBusiness',
    'status',
    'region',
    'premium',
    'flagged',
    'actions',
  ];

  /** Page size options exposed to the paginator. */
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  /**
   * MatTableDataSource drives row rendering (trackBy + no-data-row support).
   * Its data is exactly the current page — the paginator is NOT attached to it.
   */
  readonly dataSource = new MatTableDataSource<Policy>([]);

  // ---------------------------------------------------------------------------
  // Computed signals
  // ---------------------------------------------------------------------------

  /**
   * The UUIDs of all policies on the current page.
   * The page IS the loaded data under server-side pagination, so this is simply
   * the ids of every row currently rendered.
   */
  private readonly pageIds = computed<string[]>(() =>
    this.store.policies().map((p) => p.id),
  );

  /**
   * Whether ALL policies on the current page are selected.
   * Returns false on an empty page (avoids a checked-but-empty visual state).
   */
  protected readonly isAllOnPageSelected = computed(
    () =>
      this.pageIds().length > 0 &&
      this.pageIds().every((id) => this.store.selectedPolicyIds().includes(id)),
  );

  /** Whether SOME (but not all) policies on the current page are selected. */
  protected readonly isSomeOnPageSelected = computed(
    () =>
      this.pageIds().some((id) => this.store.selectedPolicyIds().includes(id)) &&
      !this.isAllOnPageSelected(),
  );

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    // Keep the MatTableDataSource in sync with the store's current page.
    // effect() must run in an injection context — the constructor satisfies it.
    effect(() => {
      this.dataSource.data = this.store.policies();
    });
  }

  // ---------------------------------------------------------------------------
  // Event handlers (delegate to the store)
  // ---------------------------------------------------------------------------

  /**
   * Handles a sort-header click. Sort is server-side: delegate to the store,
   * which resets to page 0 and refetches in the new order.
   */
  protected onSortChange(sort: Sort): void {
    this.store.updateSort({
      active: sort.active,
      direction: sort.direction as 'asc' | 'desc' | '',
    });
  }

  /**
   * Handles a paginator page/page-size change. Pagination is server-side:
   * the store fetches the requested page and persists the page size.
   */
  protected onPage(event: PageEvent): void {
    this.store.setPage(event.pageIndex, event.pageSize);
  }

  /**
   * Toggles selection of all policies on the current page.
   * - If all are selected: clears the selection.
   * - Otherwise: selects every id on the current page.
   */
  protected toggleSelectAll(): void {
    if (this.isAllOnPageSelected()) {
      this.store.clearSelection();
    } else {
      this.store.selectAll(this.pageIds());
    }
  }

  // ---------------------------------------------------------------------------
  // Display helpers
  // ---------------------------------------------------------------------------

  /**
   * Formats a premium amount into a compact, readable string prefixed with the
   * currency symbol (e.g. "S$1.2M", "HK$123K", "US$9,500").
   *
   * WHY NOT CurrencyPipe: CurrencyPipe formats to full precision; dashboard
   * cells need compact display so underwriters can scan rows quickly.
   */
  protected formatPremium(value: number, currencyCode: string): string {
    const symbol = getCurrencySymbol(currencyCode, 'narrow', this.locale);

    if (value >= 1_000_000) {
      return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${symbol}${Math.round(value / 1_000)}K`;
    }
    return `${symbol}${value.toLocaleString()}`;
  }

  /**
   * Converts a LineOfBusiness value into a CSS-safe class suffix.
   * 'A&H' → 'a-h', 'Property' → 'property'.
   */
  protected getLobClass(lob: string): string {
    return lob
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * TrackBy function for the mat-table — tracks by UUID so the table reuses
   * existing row DOM elements and only updates changed rows (e.g. after flag).
   */
  protected trackById(_: number, policy: Policy): string {
    return policy.id;
  }
}
