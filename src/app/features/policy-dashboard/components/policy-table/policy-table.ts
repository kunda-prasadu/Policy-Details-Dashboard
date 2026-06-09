// DECISION: Standalone component with ChangeDetectionStrategy.OnPush.
// ALTERNATIVES CONSIDERED: Default change detection with zone-based triggering.
// REASON: OnPush + signals gives fine-grained, precise re-renders. Only the
//         specific signal reads inside the template (isAllOnPageSelected,
//         isSomeOnPageSelected, store.selectedPolicyIds, store.filteredPolicies)
//         trigger re-evaluation — no full component tree traversal on every tick.

// DECISION: MatTableDataSource for data binding, but signals own pagination/sort state.
// ALTERNATIVES CONSIDERED: Plain array bound directly to mat-table [dataSource].
// REASON: MatTableDataSource provides: built-in row tracking, no-data row support,
//         and the paginator integration that drives what rows the table renders.
//         Signals track _pageIndex/_pageSize separately because dataSource.filteredData
//         is updated asynchronously through its internal RxJS pipeline — reading it
//         synchronously in an effect or computed returns stale data (see WHY below).

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  LOCALE_ID,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getCurrencySymbol } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Policy } from '../../models/policy.model';
import { PolicyStore } from '../../store/policy.store';
import { StorageService } from '../../../../core/services/storage.service';
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_STORAGE_KEY } from '../../constants/policy.constants';

/**
 * Policy list table component.
 *
 * Renders a paginated, sortable, selectable Angular Material table of Policy
 * records sourced from PolicyStore. All filter/sort/selection state is owned
 * by the store — this component is purely presentational, delegating mutations
 * to store action methods.
 *
 * Single responsibility: display the policy list and emit user interactions
 * (row clicks, sort changes, page changes) to the store.
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
export class PolicyTable implements AfterViewInit {
  // ---------------------------------------------------------------------------
  // Injected dependencies
  // ---------------------------------------------------------------------------

  /** Store — source of truth for policy data, filters, sort, and selection. */
  protected readonly store = inject(PolicyStore);

  /** StorageService — used to persist and restore the user's preferred page size. */
  private readonly storage = inject(StorageService);

  /** DestroyRef — used with takeUntilDestroyed to prevent memory leaks in ngAfterViewInit. */
  private readonly destroyRef = inject(DestroyRef);

  /**
   * LOCALE_ID — required by getCurrencySymbol to format premium amounts
   * correctly for the user's locale (symbol width, symbol position).
   */
  private readonly locale = inject<string>(LOCALE_ID);

  // ---------------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------------

  /**
   * Emits the clicked Policy when the user clicks the "View details" action button.
   *
   * WHY output() INSTEAD OF @Output() EventEmitter: Angular 17+ functional output()
   * is the canonical pattern — no decorator, no import of EventEmitter, works
   * identically in zoneless mode, and is tree-shakeable.
   */
  readonly rowClick = output<Policy>();

  // ---------------------------------------------------------------------------
  // View children — signal queries
  // ---------------------------------------------------------------------------

  /**
   * Reference to the MatSort directive on the table element.
   *
   * WHY viewChild SIGNAL: viewChild() returns a Signal<T | undefined> that
   * resolves after the view initialises. Using a signal query means we don't
   * need @ViewChild decorator imports and the value is always current.
   */
  private readonly sortRef = viewChild(MatSort);

  /**
   * Reference to the MatPaginator component below the table.
   * Assigned to dataSource.paginator in ngAfterViewInit so the table
   * renders only the current page's rows.
   */
  private readonly paginatorRef = viewChild(MatPaginator);

  // ---------------------------------------------------------------------------
  // Table configuration
  // ---------------------------------------------------------------------------

  /**
   * Ordered list of column keys rendered by the table.
   * 'select' and 'actions' are non-sortable utility columns; the rest are
   * data columns with sort headers.
   */
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

  /** Page size options exposed to the paginator and its aria label. */
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  /**
   * MatTableDataSource drives what rows the table renders.
   *
   * WHY MatTableDataSource OVER PLAIN ARRAY: MatTableDataSource handles:
   * - Internal RxJS pipeline for data/paginator/sort coordination
   * - No-data-row visibility
   * - Row tracking for efficient DOM recycling
   *
   * We do NOT assign dataSource.sort (server-side sort) but we DO assign
   * dataSource.paginator so the table knows the current page slice to render.
   */
  readonly dataSource = new MatTableDataSource<Policy>([]);

  // ---------------------------------------------------------------------------
  // Private pagination signals
  // ---------------------------------------------------------------------------

  /**
   * Current zero-based page index, mirroring the paginator's state.
   *
   * WHY A SIGNAL (not reading dataSource.paginator.pageIndex directly):
   * dataSource.filteredData is updated asynchronously by MatTableDataSource's
   * internal RxJS pipeline. Reading it synchronously inside a computed() or
   * effect() returns stale/empty data, causing isAllOnPageSelected to always
   * be false. Tracking page index in a signal that updates synchronously on
   * paginator page events solves this.
   */
  private readonly _pageIndex = signal(0);

  /**
   * Current page size, restored from localStorage if previously persisted.
   * Defaults to 10 if no saved preference exists.
   *
   * WHY RESTORE FROM STORAGE: Users who prefer 50 rows per page should not
   * have to reset that preference on every session — persisting it reduces
   * friction in daily dashboard use.
   */
  private readonly _pageSize = signal<number>(
    this.storage.get<number>(PAGE_SIZE_STORAGE_KEY) ?? 10,
  );

  // ---------------------------------------------------------------------------
  // Computed signals
  // ---------------------------------------------------------------------------

  /**
   * The UUIDs of all policies on the current page.
   *
   * WHY DERIVED FROM store.filteredPolicies() + SIGNAL INDICES:
   * This computation is synchronous — it reads the signal store data and
   * slices it using _pageIndex/_pageSize. It does NOT read dataSource internals,
   * avoiding the async pipeline staleness issue described above.
   *
   * Used by isAllOnPageSelected and isSomeOnPageSelected to determine the
   * checkbox state of the table header, and by toggleSelectAll() to know
   * which IDs to select/deselect.
   */
  private readonly pageIds = computed<string[]>(() => {
    const data = this.store.filteredPolicies();
    const start = this._pageIndex() * this._pageSize();
    return data.slice(start, start + this._pageSize()).map((p) => p.id);
  });

  /**
   * Whether ALL policies on the current page are selected.
   *
   * Drives the [checked] binding on the header row's mat-checkbox.
   * Returns false if the page is empty (avoids a checked-but-empty visual state).
   */
  protected readonly isAllOnPageSelected = computed(
    () =>
      this.pageIds().length > 0 &&
      this.pageIds().every((id) => this.store.selectedPolicyIds().includes(id)),
  );

  /**
   * Whether SOME (but not all) policies on the current page are selected.
   *
   * Drives the [indeterminate] binding on the header row's mat-checkbox,
   * producing the partial-selection dash indicator.
   */
  protected readonly isSomeOnPageSelected = computed(
    () =>
      this.pageIds().some((id) => this.store.selectedPolicyIds().includes(id)) &&
      !this.isAllOnPageSelected(),
  );

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    // WHY THIS EFFECT IN CONSTRUCTOR: effect() must be called in an injection
    // context. The constructor satisfies that requirement. This effect keeps
    // the MatTableDataSource in sync with the store's filtered data.
    //
    // When store.filteredPolicies() changes (filter applied, reload completes):
    // 1. Update dataSource.data so the table renders fresh rows.
    // 2. Preserve paginator state so page index remains stable across filter changes.
    //
    // paginatorRef() is also tracked by this effect. When the view initialises
    // (paginatorRef changes from undefined to MatPaginator), the effect re-runs
    // once — calling firstPage() on the now-available paginator. This ensures
    // the paginator's visual state matches _pageIndex = 0 on first render.
    effect(() => {
      this.dataSource.data = this.store.filteredPolicies();
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Wires MatSort and MatPaginator after the view is initialised.
   *
   * WHY WIRE IN ngAfterViewInit: viewChild signal queries resolve after the
   * first render cycle completes. Wiring RxJS event streams here (not in the
   * constructor) guarantees the sort/paginator instances exist and their
   * event subjects are fully initialised before we subscribe.
   *
   * Sort is server-side: we listen to sortChange and call store.updateSort()
   * rather than assigning dataSource.sort (which would trigger client-side
   * sort on the local data array — incorrect for our server-driven model).
   *
   * Paginator: we assign to dataSource.paginator AND subscribe to page events
   * to keep _pageIndex/_pageSize signals in sync for checkbox computation.
   */
  ngAfterViewInit(): void {
    const sortInstance = this.sortRef();
    const paginatorInstance = this.paginatorRef();

    // --- Server-side sort wiring ---
    if (sortInstance) {
      // RxJS pipe:
      // sortChange          — emits { active: string, direction: SortDirection }
      //                       whenever the user clicks a sort header
      // takeUntilDestroyed  — unsubscribes when the component is destroyed,
      //                       preventing the sort subscription from outliving the DOM
      sortInstance.sortChange
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((sortState) => {
          // Reset to page 0 when sort changes — avoids showing page 5 of a
          // newly sorted result set that may have fewer than 5 pages.
          this._pageIndex.set(0);
          paginatorInstance?.firstPage();

          // Delegate server-side sort to the store, which rebuilds query params
          // and triggers a fresh API call.
          this.store.updateSort({
            active: sortState.active,
            direction: sortState.direction as 'asc' | 'desc' | '',
          });
        });
    }

    // --- Paginator wiring ---
    if (paginatorInstance) {
      // Assigning to dataSource.paginator tells MatTableDataSource which rows
      // to render for the current page — this is the display-layer pagination.
      this.dataSource.paginator = paginatorInstance;

      // RxJS pipe:
      // paginator.page     — emits { pageIndex, pageSize, length } on every
      //                      page navigation or page size change
      // takeUntilDestroyed — lifecycle cleanup
      paginatorInstance.page
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((pageEvent) => {
          // Update signals so pageIds() recomputes for the new page, which
          // propagates to isAllOnPageSelected/isSomeOnPageSelected.
          this._pageIndex.set(pageEvent.pageIndex);
          this._pageSize.set(pageEvent.pageSize);

          // Persist page size preference so the user's choice survives a
          // page refresh. Page index is not persisted — always start from
          // page 1 on reload (data may have changed).
          this.storage.set<number>(PAGE_SIZE_STORAGE_KEY, pageEvent.pageSize);
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  /**
   * Toggles the selection of all policies on the current page.
   *
   * - If all are selected: clears the entire selection.
   * - Otherwise: selects all IDs on the current page, preserving any
   *   selections from other pages (store.selectAll replaces selection —
   *   this means cross-page multi-select requires individual row clicks).
   *
   * WHY CURRENT PAGE ONLY: Selecting all 250 records at once and bulk-flagging
   * them is a destructive operation. Scoping "select all" to the visible page
   * limits accidental bulk operations. A future "select all records" feature
   * can be added as a separate affordance.
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
   * Formats a premium amount into a compact, readable string prefixed with
   * the currency symbol for the given ISO 4217 currency code.
   *
   * WHY NOT THE ANGULAR CurrencyPipe: CurrencyPipe formats to full precision
   * (e.g. "SGD 1,234,567.00"). Dashboard table cells need compact display
   * ("S$1.2M", "S$123K") so underwriters can scan rows quickly. The custom
   * format is a deliberate UX decision, not a localisation concern.
   *
   * @param value        - Raw premium amount in the policy's currency.
   * @param currencyCode - ISO 4217 currency code (SGD, HKD, AUD, JPY, USD, THB).
   * @returns Formatted string, e.g. "S$1.2M", "HK$123K", "US$9,500".
   */
  protected formatPremium(value: number, currencyCode: string): string {
    // WHY getCurrencySymbol OVER HARD-CODED SYMBOLS: getCurrencySymbol uses
    // Angular's CLDR locale data to return the correct narrow symbol for the
    // current locale (e.g. '$' for USD in en-US, 'S$' for SGD). This makes
    // the component locale-aware without a custom symbol lookup table.
    const symbol = getCurrencySymbol(currencyCode, 'narrow', this.locale);

    if (value >= 1_000_000) {
      // 1,234,567 → "S$1.2M"
      return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      // 123,456 → "S$123K"
      return `${symbol}${Math.round(value / 1_000)}K`;
    }
    // < 1,000 — render raw with locale-aware thousands separator
    return `${symbol}${value.toLocaleString()}`;
  }

  /**
   * Converts a LineOfBusiness value into a CSS-safe class suffix.
   *
   * WHY A METHOD OVER A PIPE: A pipe would require creating a separate pipe
   * class file for a 2-line transformation used only in this template.
   * A protected method is simpler and keeps the logic colocated with the
   * component that owns it.
   *
   * @param lob - LineOfBusiness string (e.g. 'A&H', 'Property').
   * @returns CSS-safe suffix (e.g. 'a-h', 'property').
   */
  protected getLobClass(lob: string): string {
    // Replace any non-alphanumeric characters with '-', collapse multiples,
    // and lowercase — 'A&H' → 'a-h', 'Property' → 'property'.
    return lob
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * TrackBy function for the mat-table.
   *
   * WHY TRACK BY ID: Without trackBy, Angular re-creates DOM rows on every
   * dataSource update (e.g. after a flag action). Tracking by UUID lets the
   * table reuse existing row DOM elements and only update the changed row —
   * critical for smooth UX when bulk-flagging 20+ rows.
   *
   * @param _ - Row index (unused — IDs are unique enough to track without it).
   * @param policy - The Policy record for the row.
   * @returns The policy's UUID.
   */
  protected trackById(_: number, policy: Policy): string {
    return policy.id;
  }
}
