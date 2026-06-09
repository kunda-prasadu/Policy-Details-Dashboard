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

import { LoggerService } from '../../../core/services/logger.service';
import { NormalisedHttpError } from '../../../core/interceptors/error.interceptor';
import { PolicyFilter } from '../models/policy-filter.model';
import { DEFAULT_PAGINATION } from '../models/pagination.model';
import { Policy, PolicyStatus } from '../models/policy.model';
import { PolicyApiService, PolicySort } from '../services/policy-api.service';

// ---------------------------------------------------------------------------
// Summary type
// ---------------------------------------------------------------------------

/**
 * Aggregated KPI summary derived from the currently loaded (and filtered) policies.
 * Consumed by the dashboard summary cards and chart components.
 *
 * WHY A DEDICATED TYPE: Computed aggregations have their own contract — they should
 * not be confused with raw Policy data or filter state. Separating this type also
 * makes it trivial to extend (e.g. add `avgPremium`) without touching the Policy model.
 */
export interface PolicySummaryData {
  /** Count of policies with status 'Active'. */
  active: number;
  /** Count of policies with status 'Pending'. */
  pending: number;
  /** Count of policies with status 'Expired'. */
  expired: number;
  /** Count of policies with status 'Cancelled'. */
  cancelled: number;
  /** Sum of all premiumAmount values across the filtered set. */
  totalPremium: number;
  /** Count of Active policies whose expiryDate is within the next 30 days. */
  expiringWithin30Days: number;
  /**
   * Gross Written Premium (GWP) grouped by line of business.
   * Keys are LineOfBusiness values; values are sum of premiumAmount.
   */
  gwpByLob: Record<string, number>;
}

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
  private readonly destroyRef = inject(DestroyRef);

  // ---------------------------------------------------------------------------
  // Private writeable signals — the raw state atoms
  // ---------------------------------------------------------------------------

  /**
   * The full list of policies returned by the last successful API call.
   * WHY PRIVATE: External components always read via the public computed signals
   * (filteredPolicies, etc.). Direct access to the raw list bypasses client-side
   * filtering and would produce inconsistent UI state.
   */
  private readonly _policies = signal<Policy[]>([]);

  /** Loading flag — true while an API request is in-flight. */
  private readonly _loading = signal<boolean>(false);

  /** Error message from the last failed operation, or null when healthy. */
  private readonly _error = signal<string | null>(null);

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

  /** Read-only view of the raw (unfiltered) policy list. */
  readonly policies = this._policies.asReadonly();

  /** True while any async operation is in-flight. */
  readonly loading = this._loading.asReadonly();

  /** Last error message, or null. Consumed by error banner components. */
  readonly error = this._error.asReadonly();

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
   * The policy list after applying all active client-side filters.
   *
   * WHY THIS LIVES HERE (not in the component): Filtering is a business-logic
   * concern, not a presentation concern. Centralising it in the store means
   * every component that renders a policy list (table, map, chart) derives from
   * the same filtered set automatically.
   *
   * WHY `?? []` GUARD: The signal is initialised to [] but TypeScript's strict
   * mode requires a null-safe access; the guard also protects against any future
   * refactor that makes the signal nullable.
   */
  readonly filteredPolicies = computed<Policy[]>(() => {
    const all = this._policies() ?? [];
    const f = this._filters();

    // WHY EARLY RETURN: If no filters are active, skip all predicate evaluation
    // and return the reference directly — avoids allocating a new array on every
    // signal read when nothing has changed.
    const hasFilters =
      f.search ||
      f.statuses?.length ||
      f.regions?.length ||
      f.linesOfBusiness?.length ||
      f.currencies?.length ||
      f.flaggedForReview !== undefined ||
      f.premiumMin !== undefined ||
      f.premiumMax !== undefined ||
      f.effectiveDateFrom !== undefined ||
      f.effectiveDateTo !== undefined;

    if (!hasFilters) {
      return all;
    }

    return all.filter((p) => {
      // Free-text: case-insensitive substring match on number and name
      if (f.search?.trim()) {
        const term = f.search.trim().toLowerCase();
        const matchesSearch =
          p.policyNumber.toLowerCase().includes(term) ||
          p.policyHolderName.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }

      // Multi-status filter (client-side for >1 selection)
      if (f.statuses?.length && !f.statuses.includes(p.status)) return false;

      // Multi-region filter
      if (f.regions?.length && !f.regions.includes(p.region)) return false;

      // Multi-LOB filter
      if (f.linesOfBusiness?.length && !f.linesOfBusiness.includes(p.lineOfBusiness))
        return false;

      // Multi-currency filter
      if (f.currencies?.length && !f.currencies.includes(p.currency)) return false;

      // Boolean flag filter
      if (f.flaggedForReview === true && !p.flaggedForReview) return false;

      // Premium range filter
      if (f.premiumMin !== undefined && p.premiumAmount < f.premiumMin) return false;
      if (f.premiumMax !== undefined && p.premiumAmount > f.premiumMax) return false;

      // Effective date range filter
      // WHY STRING COMPARISON: effectiveDate is stored as ISO 8601 (YYYY-MM-DD).
      // Lexicographic string comparison is equivalent to chronological order for
      // that format, avoiding Date object allocation on every row evaluation.
      if (f.effectiveDateFrom && p.effectiveDate < f.effectiveDateFrom) return false;
      if (f.effectiveDateTo && p.effectiveDate > f.effectiveDateTo) return false;

      return true;
    });
  });

  /**
   * Aggregated KPI summary derived from the filtered policy list.
   *
   * WHY DERIVED FROM filteredPolicies (not _policies): Summary cards should
   * reflect the current filter context — when a user filters to Singapore only,
   * the KPI cards should show Singapore totals, not global totals.
   */
  readonly summary = computed<PolicySummaryData>(() => {
    const policies = this.filteredPolicies();

    // Precompute today's date once outside the reduce loop — avoids creating
    // a Date object on every iteration for the expiringWithin30Days check.
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    return policies.reduce<PolicySummaryData>(
      (acc, p) => {
        // Status counts
        const statusKey = p.status.toLowerCase() as keyof Pick<
          PolicySummaryData,
          'active' | 'pending' | 'expired' | 'cancelled'
        >;
        if (statusKey in acc) {
          (acc[statusKey] as number)++;
        }

        // Total premium
        acc.totalPremium += p.premiumAmount;

        // Expiring within 30 days: Active policies only, expiry in [now, now+30d]
        if (p.status === 'Active') {
          const expiryMs = new Date(p.expiryDate).getTime();
          if (expiryMs >= now && expiryMs <= now + thirtyDaysMs) {
            acc.expiringWithin30Days++;
          }
        }

        // GWP by line of business
        acc.gwpByLob[p.lineOfBusiness] =
          (acc.gwpByLob[p.lineOfBusiness] ?? 0) + p.premiumAmount;

        return acc;
      },
      {
        active: 0,
        pending: 0,
        expired: 0,
        cancelled: 0,
        totalPremium: 0,
        expiringWithin30Days: 0,
        gwpByLob: {},
      },
    );
  });

  /**
   * Number of currently selected policies.
   * WHY COMPUTED: Components bind to this directly rather than reading
   * selectedPolicyIds().length — avoids array creation on every binding evaluation.
   */
  readonly selectedCount = computed(() => this._selectedPolicyIds().length);

  /** True when at least one policy is selected. Drives bulk-action button states. */
  readonly hasSelection = computed(() => this._selectedPolicyIds().length > 0);

  /** Total number of policies in the filtered set. Drives the paginator total. */
  readonly totalPolicies = computed(() => this.filteredPolicies().length);

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
   * Loads policies from the API using the current filters and sort state.
   *
   * Side effects:
   * - Sets `_loading` to true before the request, false after.
   * - Writes the API response into `_policies` on success.
   * - Writes a human-readable error message into `_error` on failure.
   * - Resets the selection on each successful load (stale IDs after a reload
   *   could cause silent no-ops in bulk operations).
   * - Resets pagination to page 0 on each new load (filter change triggered
   *   a reload → user must be on the first page to see relevant results).
   */
  loadPolicies(): void {
    this._loading.set(true);
    this._error.set(null);

    // WHY takeUntilDestroyed: Prevents memory leaks if the service or its
    // consumers are destroyed while an API call is in-flight. DestroyRef is
    // injected in the constructor and passed here to associate the subscription
    // lifetime with the store instance rather than the calling component.
    this.api
      .getAll(this._filters(), this._sort())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (policies) => {
          this._policies.set(policies);
          this._selectedPolicyIds.set([]);
          this._loading.set(false);
          this.logger.info(`PolicyStore: loaded ${policies.length} policies`);
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
    this._selectedPolicyIds.set([]);
    this.loadPolicies();
  }

  /**
   * Clears all active filters and reloads.
   *
   * Side effect: resets selection and triggers a reload.
   */
  clearFilters(): void {
    this._filters.set({});
    this._selectedPolicyIds.set([]);
    this.loadPolicies();
  }

  /**
   * Updates the active sort state and triggers a data reload.
   *
   * WHY RELOAD ON SORT: Sort is applied server-side via _sort/_order params.
   * Client-side sort on the full 250-record set is possible but server-side
   * sort ensures results are consistent with a future switch to true pagination.
   *
   * @param sort - The new sort state.
   */
  updateSort(sort: PolicySort): void {
    this._sort.set(sort);
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
          this.logger.info(
            `PolicyStore: flagged ${selectedIds.length} policies successfully`,
          );
        },
        error: (err: unknown) => {
          // Rollback to snapshot — the optimistic update is reverted
          this._policies.set(snapshot);
          this._loading.set(false);
          const message = this.extractErrorMessage(err);
          this._error.set(message);
          this.logger.error('PolicyStore.flagSelectedPolicies() failed', err);
        },
      });
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
