// WHY CUSTOM STORE OVER NgRx: NgRx requires actions + reducers + effects + selectors — ~4x the
// boilerplate for a single-feature app. Angular signals give fine-grained reactivity with plain
// methods. State reads are synchronous signal reads; state writes are method calls. No action
// dispatch, no selector memoisation library, no effect streams to manage.
//
// DECISION: Injectable class store (not a standalone function or factory).
// ALTERNATIVES CONSIDERED:
//   1. @ngrx/signals SignalStore
//   2. Akita
//   3. Component-local state with @Input/@Output
// REASON: A plain Injectable class with signals is the minimum viable pattern that satisfies
//         the requirements — shared across multiple components, signal-reactive, testable by
//         injecting mock dependencies, and zero extra dependencies. @ngrx/signals is the
//         right choice only once the codebase grows to multiple feature stores that need
//         composable store features; premature here.

import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';

import { LoggerService } from '../../../core/services/logger.service';
import { StorageService } from '../../../core/services/storage.service';
import { NormalisedHttpError } from '../../../core/interceptors/error.interceptor';
import { PolicyFilter } from '../models/policy-filter.model';
import { PageRequest } from '../models/pagination.model';
import {
  EMPTY_SUMMARY,
  PolicySummaryData,
} from '../models/policy-summary.model';
import { Policy, PolicyStatus } from '../models/policy.model';
import { PolicyApiService, PolicySort } from '../services/policy-api.service';
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_STORAGE_KEY } from '../constants/policy.constants';

// Re-exported for backwards compatibility — the canonical definition now lives
// in the model file so the API service can import it without a circular import.
export type { PolicySummaryData } from '../models/policy-summary.model';

/** Default page size when the user has no persisted preference. */
const DEFAULT_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Signal-based state store for the policy dashboard feature.
 *
 * Owns all policy data state: the raw list, active filters, sort, pagination,
 * selection, loading, and error signals. Exposes derived state as computed
 * signals and provides action methods that mutate state and trigger API calls.
 *
 * Single responsibility: be the single source of truth for policy data in the UI.
 * All components read from this store; none maintain their own policy state.
 */
@Injectable({ providedIn: 'root' })
export class PolicyStore {
  private readonly api = inject(PolicyApiService);
  private readonly logger = inject(LoggerService);
  private readonly storage = inject(StorageService);
  private readonly destroyRef = inject(DestroyRef);

  // ---------------------------------------------------------------------------
  // Private writeable signals — the raw state atoms
  // ---------------------------------------------------------------------------

  /**
   * The CURRENT PAGE of policies returned by the last successful API call.
   *
   * WHY ONLY A PAGE (not the full dataset): Filtering, sorting and pagination
   * are all performed server-side. The client never holds more than `pageSize`
   * records — this is the core of the server-side architecture.
   */
  private readonly _policies = signal<Policy[]>([]);

  /** Total number of records matching the active filters, across all pages. */
  private readonly _total = signal<number>(0);

  /**
   * KPI summary aggregated server-side over the full filtered set.
   * WHY SERVER-SOURCED: With only one page in memory the client cannot compute
   * counts/premiums across all matching records — the server does it.
   */
  private readonly _summary = signal<PolicySummaryData>(EMPTY_SUMMARY);

  /**
   * Pagination request state (zero-based pageIndex + pageSize).
   * pageSize is seeded from the user's persisted preference on construction.
   */
  private readonly _pagination = signal<PageRequest>({
    pageIndex: 0,
    pageSize: this.resolveInitialPageSize(),
  });

  /** Loading flag — true while an API request is in-flight. */
  private readonly _loading = signal<boolean>(false);

  /** Error message from the last failed operation, or null when healthy. */
  private readonly _error = signal<string | null>(null);

  /** Last failed bulk-flag selection; used to offer explicit retry UX. */
  private readonly _lastFailedFlagIds = signal<string[]>([]);

  /** Active filter criteria applied to the policy list. */
  private readonly _filters = signal<PolicyFilter>({});

  /**
   * Active sort state.
   * WHY DEFAULT TO expiryDate/asc: Soonest-to-expire policies are the most
   * actionable for underwriters — surfacing them first reduces the time to
   * identify policies that need renewal action.
   */
  private readonly _sort = signal<PolicySort>({
    active: 'expiryDate',
    direction: 'asc',
  });

  /**
   * Set of selected policy IDs (for bulk operations).
   * WHY STRING[]: Preserves insertion order for display; Set would lose order.
   * Uniqueness is enforced in toggleSelection().
   */
  private readonly _selectedPolicyIds = signal<string[]>([]);

  // ---------------------------------------------------------------------------
  // Public read-only signals
  // ---------------------------------------------------------------------------

  /** Read-only view of the current page of policies. */
  readonly policies = this._policies.asReadonly();

  /** Total number of records matching the active filters (drives the paginator). */
  readonly total = this._total.asReadonly();

  /** Server-computed KPI summary over the filtered set. */
  readonly summary = this._summary.asReadonly();

  /** Current pagination request state (pageIndex + pageSize). */
  readonly pagination = this._pagination.asReadonly();

  /** True while any async operation is in-flight. */
  readonly loading = this._loading.asReadonly();

  /** Last error message, or null. Consumed by error banner components. */
  readonly error = this._error.asReadonly();

  /** IDs from the most recent failed bulk flag operation. */
  readonly lastFailedFlagIds = this._lastFailedFlagIds.asReadonly();

  /** Currently active filter criteria. */
  readonly filters = this._filters.asReadonly();

  /** Currently active sort state. */
  readonly sort = this._sort.asReadonly();

  /** Currently selected policy IDs. */
  readonly selectedPolicyIds = this._selectedPolicyIds.asReadonly();

  // ---------------------------------------------------------------------------
  // Computed signals — derived state
  // ---------------------------------------------------------------------------

  /**
   * Number of currently selected policies.
   * WHY COMPUTED: Components bind to this directly rather than reading
   * selectedPolicyIds().length — avoids array creation on every binding evaluation.
   */
  readonly selectedCount = computed(() => this._selectedPolicyIds().length);

  /** True when at least one policy is selected. Drives bulk-action button states. */
  readonly hasSelection = computed(() => this._selectedPolicyIds().length > 0);

  // ---------------------------------------------------------------------------
  // Constructor — logging effect
  // ---------------------------------------------------------------------------

  constructor() {
    // WHY AN EFFECT IN THE CONSTRUCTOR: This diagnostic effect logs filter changes
    // in development. effect() in the constructor runs in the component/service
    // injection context, which is required for signal tracking to work correctly.
    // In production isDevMode() is false so the log is a no-op but the effect
    // still runs (minimal overhead). An alternative is to wrap with isDevMode()
    // guard inside the effect body.
    effect(() => {
      this.logger.debug('PolicyStore filters changed', this._filters());
    });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Loads the current page of policies AND the filtered summary from the API.
   *
   * WHY forkJoin (one combined load): The page list and the KPI summary are
   * driven by the same filter criteria and should update together. forkJoin
   * issues both requests in parallel and emits once both complete, so the table
   * and the summary cards never display data from different filter states.
   *
   * Side effects:
   * - Sets `_loading` true before, false after.
   * - Writes the page into `_policies`, the count into `_total`, and the
   *   aggregates into `_summary` on success.
   * - Writes a human-readable error message into `_error` on failure.
   * - Resets the selection on each successful load (stale IDs after a reload
   *   could cause silent no-ops in bulk operations).
   */
  loadPolicies(): void {
    this._loading.set(true);
    this._error.set(null);

    const filters = this._filters();

    // WHY takeUntilDestroyed: Prevents memory leaks if the store or its
    // consumers are destroyed while a request is in-flight.
    forkJoin({
      page: this.api.getAll(filters, this._sort(), this._pagination()),
      summary: this.api.getSummary(filters),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ page, summary }) => {
          this._policies.set(page.data);
          this._total.set(page.total);
          this._summary.set(summary);
          this._selectedPolicyIds.set([]);
          this._lastFailedFlagIds.set([]);
          this._loading.set(false);
          this.logger.info(
            `PolicyStore: loaded page of ${page.data.length} / ${page.total} policies`,
          );
        },
        error: (err: HttpErrorResponse | NormalisedHttpError | Error | unknown) => {
          this._loading.set(false);
          const message = this.extractErrorMessage(err);
          this._error.set(message);
          this.logger.error('PolicyStore.loadPolicies() failed', err);
        },
      });
  }

  /**
   * Updates the active filter criteria and triggers a data reload.
   *
   * WHY MERGE NOT REPLACE: Callers can update a single filter field (e.g. just
   * `search`) without having to provide the entire PolicyFilter object. The spread
   * merge ensures unmentioned fields retain their current values.
   *
   * Side effect: resets the selection (selected IDs may no longer be in the
   * filtered result set after the filter changes).
   *
   * @param patch - Partial PolicyFilter to merge into the current filter state.
   */
  updateFilters(patch: Partial<PolicyFilter>): void {
    this._filters.update((current) => ({ ...current, ...patch }));
    this.resetToFirstPage();
    this._selectedPolicyIds.set([]);
    this.loadPolicies();
  }

  /**
   * Clears all active filters and reloads.
   *
   * Side effect: resets selection, returns to page 0, and triggers a reload.
   */
  clearFilters(): void {
    this._filters.set({});
    this.resetToFirstPage();
    this._selectedPolicyIds.set([]);
    this.loadPolicies();
  }

  /**
   * Updates the active sort state and triggers a server-side re-sort + reload.
   *
   * WHY RESET TO PAGE 0: A new sort order makes the current page index
   * meaningless — the user should see the top of the newly ordered results.
   *
   * @param sort - The new sort state.
   */
  updateSort(sort: PolicySort): void {
    this._sort.set(sort);
    this.resetToFirstPage();
    this.loadPolicies();
  }

  /**
   * Updates pagination (page navigation or page-size change) and reloads.
   *
   * WHY PERSIST pageSize: The user's preferred page size should survive a
   * refresh. Page index is intentionally NOT persisted — every session starts
   * at page 0 since the underlying data may have changed.
   *
   * @param pageIndex - Zero-based page index from MatPaginator.
   * @param pageSize  - Records per page from MatPaginator.
   */
  setPage(pageIndex: number, pageSize: number): void {
    const current = this._pagination();
    if (current.pageIndex === pageIndex && current.pageSize === pageSize) {
      return; // No change — avoid a redundant request.
    }
    if (pageSize !== current.pageSize) {
      this.storage.set<number>(PAGE_SIZE_STORAGE_KEY, pageSize);
    }
    this._pagination.set({ pageIndex, pageSize });
    this.loadPolicies();
  }

  /**
   * Toggles the selection state of a single policy by ID.
   *
   * - If the ID is already selected, it is removed.
   * - If the ID is not selected, it is appended.
   *
   * WHY APPEND/FILTER: O(n) for n selected items, which is acceptable given
   * the maximum selection size is bounded by the page size (≤100 items).
   *
   * @param id - The UUID of the policy to toggle.
   */
  toggleSelection(id: string): void {
    this._selectedPolicyIds.update((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id],
    );
  }

  /**
   * Replaces the current selection with the provided array of IDs.
   *
   * Used by the "select all on page" checkbox in the policy table.
   * De-duplicates the input to prevent double-entries.
   *
   * @param ids - Array of policy UUIDs to select.
   */
  selectAll(ids: string[]): void {
    // WHY DEDUP: The caller may pass IDs that are already selected (e.g. when
    // toggling "select all" on a page where some rows were already checked).
    this._selectedPolicyIds.set([...new Set(ids)]);
  }

  /**
   * Clears the entire selection.
   *
   * Called after a bulk operation completes or when the user navigates away.
   */
  clearSelection(): void {
    this._selectedPolicyIds.set([]);
  }

  /**
   * Flags all currently selected policies for underwriter review.
   *
   * Uses an optimistic-update pattern:
   * 1. Capture a snapshot of the current policy list.
   * 2. Optimistically update the local signal.
   * 3. Fire the batch API call.
   * 4. On success: clear selection.
   * 5. On failure: roll back to the snapshot and write the error signal.
   *
   * WHY OPTIMISTIC UPDATE: The UI feels instant. For a bulk flag operation the
   * risk of rollback is low (it's a simple boolean patch). The snapshot rollback
   * guarantees consistency even if partial failures occur.
   *
   * WHY forkJoin via flagPolicies: A single subscription handles the entire
   * batch — no nested subscribes, no manual counter tracking.
   *
   * Side effects:
   * - Mutates `_policies` optimistically, rolls back on error.
   * - Writes error message to `_error` on failure.
   * - Clears selection on success.
   * - Emits logs via LoggerService.
   */
  flagSelectedPolicies(): void {
    const selectedIds = this._selectedPolicyIds();
    if (selectedIds.length === 0) {
      return;
    }

    // Snapshot for rollback
    const snapshot = this._policies();

    // Optimistic update: mark selected policies as flagged in the local signal
    this._policies.update((current) =>
      current.map((p) =>
        selectedIds.includes(p.id) ? { ...p, flaggedForReview: true } : p,
      ),
    );

    this._loading.set(true);
    this._error.set(null);
    this._lastFailedFlagIds.set([]);

    // RxJS pipe:
    // flagPolicies(ids)         — forkJoin of N parallel PATCH requests
    // takeUntilDestroyed(...)   — cancels the batch if the store is destroyed
    //                             mid-flight (e.g. during SSR teardown)
    this.api
      .flagPolicies(selectedIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          // Merge server-confirmed updates into the policy list.
          // The server response is authoritative — it may include fields
          // updated by server-side business logic beyond flaggedForReview.
          const updatedMap = new Map(updated.map((p) => [p.id, p]));
          this._policies.update((current) =>
            current.map((p) => updatedMap.get(p.id) ?? p),
          );
          this._loading.set(false);
          this.clearSelection();
          this._lastFailedFlagIds.set([]);
          this.logger.info(
            `PolicyStore: flagged ${selectedIds.length} policies successfully`,
          );
        },
        error: (err: unknown) => {
          // Rollback to snapshot — the optimistic update is reverted
          this._policies.set(snapshot);
          this._loading.set(false);
          this._lastFailedFlagIds.set(selectedIds);
          const message = this.extractErrorMessage(err);
          this._error.set(message);
          this.logger.error('PolicyStore.flagSelectedPolicies() failed', err);
        },
      });
  }

  /**
   * Retries the last failed bulk-flag operation, if any.
   */
  retryLastFailedFlag(): void {
    const ids = this._lastFailedFlagIds();
    if (ids.length === 0) {
      return;
    }
    this.selectAll(ids);
    this.flagSelectedPolicies();
  }

  /**
   * Renews a single policy by setting its status to 'Active' via HTTP PATCH.
   *
   * WHY A NAMED METHOD: "Renew" is a domain operation — it is not the same as
   * a generic status update. The name communicates intent clearly to future
   * developers. In a later iteration this may also update effectiveDate and
   * expiryDate server-side.
   *
   * Uses optimistic update — sets status locally before the API call,
   * rolls back to the previous status on failure.
   *
   * Side effects:
   * - Mutates `_policies` optimistically.
   * - Writes error message to `_error` on failure.
   *
   * @param id - The UUID of the policy to renew.
   */
  renewPolicy(id: string): void {
    const snapshot = this._policies();
    const newStatus: PolicyStatus = 'Active';

    // Optimistic update
    this._policies.update((current) =>
      current.map((p) => (p.id === id ? { ...p, status: newStatus } : p)),
    );

    this._error.set(null);

    // RxJS pipe:
    // patch(id, { status: 'Active' })  — PATCH request to the API
    // takeUntilDestroyed(destroyRef)   — lifecycle guard
    this.api
      .patch(id, { status: newStatus })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          // Merge server-confirmed policy — authoritative over optimistic value
          this._policies.update((current) =>
            current.map((p) => (p.id === updated.id ? updated : p)),
          );
          // A renewal changes the policy's status, which shifts the KPI counts.
          // Refresh the server-computed summary so the cards stay accurate.
          this.refreshSummary();
          this.logger.info(`PolicyStore: renewed policy ${id}`);
        },
        error: (err: unknown) => {
          // Rollback
          this._policies.set(snapshot);
          const message = this.extractErrorMessage(err);
          this._error.set(message);
          this.logger.error(`PolicyStore.renewPolicy(${id}) failed`, err);
        },
      });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the initial page size from persisted user preference, validating
   * it against the allowed options and falling back to the default.
   *
   * WHY VALIDATE: A stale or tampered localStorage value (e.g. a removed page
   * size) must not produce a paginator option that doesn't exist.
   */
  private resolveInitialPageSize(): number {
    const saved = this.storage.get<number>(PAGE_SIZE_STORAGE_KEY);
    return saved && PAGE_SIZE_OPTIONS.includes(saved) ? saved : DEFAULT_PAGE_SIZE;
  }

  /** Resets pagination to the first page, preserving the current page size. */
  private resetToFirstPage(): void {
    this._pagination.update((p) => ({ ...p, pageIndex: 0 }));
  }

  /**
   * Re-fetches ONLY the summary aggregates for the current filters.
   *
   * Used after a single-policy mutation (e.g. renew) that changes a KPI metric
   * but does not warrant reloading the whole page list.
   */
  private refreshSummary(): void {
    this.api
      .getSummary(this._filters())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => this._summary.set(summary),
        error: (err: unknown) =>
          this.logger.error('PolicyStore.refreshSummary() failed', err),
      });
  }

  /**
   * Extracts a human-readable error message from any thrown error type.
   *
   * WHY THIS HELPER: The store receives errors from three possible sources:
   * 1. `NormalisedHttpError` (from errorInterceptor) — has a `.message` string
   * 2. `HttpErrorResponse` (if interceptor is bypassed) — has `.message`
   * 3. Plain `Error` — has `.message`
   * 4. Unknown shape — must be handled defensively
   *
   * Centralising this extraction prevents duplicated `instanceof` chains in
   * every action method.
   *
   * @param err - Any thrown value.
   * @returns A safe, human-readable error string.
   */
  private extractErrorMessage(err: unknown): string {
    if (err === null || err === undefined) {
      return 'An unknown error occurred.';
    }
    // NormalisedHttpError from errorInterceptor — shape: { message, status, ... }
    if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    if (typeof err === 'string') {
      return err;
    }
    return 'An unexpected error occurred. Please try again.';
  }
}
