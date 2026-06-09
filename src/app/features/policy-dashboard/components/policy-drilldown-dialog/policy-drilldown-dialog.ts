// DECISION: Single dialog component handles both 'detail' and 'status/expiring' modes.
// ALTERNATIVES CONSIDERED: Two separate dialog components (DetailDialog, ListDialog).
// REASON: Both modes share the same data injection pattern (MAT_DIALOG_DATA), the
//         same header/footer chrome, and the same renew/flag actions. Merging them
//         reduces the number of dialog-related files from 6 to 3 and keeps the
//         drilldown navigation logic (SummaryPanel → dialog) in one place.
//         The @if branches in the template keep each mode's markup clean.

// DECISION: renewingIds is a Signal<Set<string>> local to the dialog.
// ALTERNATIVES CONSIDERED: A loading flag in the store per-policy id.
// REASON: The "renewing" spinner state is purely UI — it shows a spinner for 1500ms
//         then removes itself. This is presentation state, not domain state. Putting
//         it in the store would pollute global state with ephemeral UI data. A local
//         signal set in the dialog owns it correctly.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  LOCALE_ID,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getCurrencySymbol } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Policy, PolicyStatus } from '../../models/policy.model';
import { PolicyFilter } from '../../models/policy-filter.model';
import { PolicyStore } from '../../store/policy.store';
import { PolicyApiService } from '../../services/policy-api.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Data contract injected into the dialog via MAT_DIALOG_DATA.
 *
 * Three modes:
 * - `'detail'`   — single policy detail card. `policy` must be provided.
 * - `'status'`   — filtered list of policies matching `status`.
 * - `'expiring'` — filtered list of policies expiring within 30 days.
 */
export interface DrilldownDialogData {
  mode: 'status' | 'expiring' | 'detail';
  /** Required when mode === 'status'. The status to filter by. */
  status?: PolicyStatus;
  /** Required when mode === 'detail'. The policy to display. */
  policy?: Policy;
}

/** Days remaining until a policy expires (negative = already expired). */
function daysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate).getTime();
  const now = Date.now();
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}

/**
 * PolicyDrilldownDialog component.
 *
 * Renders one of two views depending on `data.mode`:
 *
 * **Detail mode** (`mode === 'detail'`):
 * A single-policy detail card with all 9 policy fields, a days-to-expiry
 * badge, a "Renew" button (Expired/Cancelled only), and a "Flag for Review"
 * button (when not already flagged).
 *
 * **List mode** (`mode === 'status' | 'expiring'`):
 * A filtered `mat-table` showing the relevant policy subset, with per-row
 * urgency badges (≤7d = critical, ≤15d = high, ≤30d = low) and Renew buttons.
 *
 * Accessibility:
 * - `aria-labelledby="drilldown-dialog-title"` on the mat-dialog-container
 *   (set via MatDialog config in SummaryPanel).
 * - `cdkFocusInitial` on the close button ensures the first focused element
 *   on open is the dismiss control — keyboard users can immediately press
 *   Enter/Space to close if they opened the dialog accidentally.
 */
@Component({
  selector: 'app-policy-drilldown-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './policy-drilldown-dialog.html',
  styleUrl: './policy-drilldown-dialog.scss',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
})
export class PolicyDrilldownDialog {
  // ---------------------------------------------------------------------------
  // Injected dependencies
  // ---------------------------------------------------------------------------

  /** Dialog data — mode + optional status/policy. */
  readonly data = inject<DrilldownDialogData>(MAT_DIALOG_DATA);

  /** Used to close the dialog from the close button. */
  readonly dialogRef = inject<MatDialogRef<PolicyDrilldownDialog>>(MatDialogRef);

  protected readonly store = inject(PolicyStore);
  private readonly api = inject(PolicyApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject<string>(LOCALE_ID);

  constructor() {
    // In list modes, fetch the full drilldown set from the API (server-side
    // filtering, no page limit). Detail mode reads the single policy from the
    // store's current page via the detailPolicy computed — no fetch needed.
    if (this.data.mode !== 'detail') {
      this.loadListPolicies();
    }
  }

  /**
   * Builds the scoped filter for this drilldown and fetches all matching
   * policies (no pagination) so the dialog can list the complete set.
   */
  private loadListPolicies(): void {
    const base = this.store.filters();
    let filter: PolicyFilter;

    if (this.data.mode === 'expiring') {
      // Active policies whose expiry falls within the next 30 days.
      const today = new Date();
      const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      filter = {
        ...base,
        statuses: ['Active'],
        expiryDateFrom: this.toIsoDate(today),
        expiryDateTo: this.toIsoDate(in30),
      };
    } else {
      // mode === 'status' — current filters narrowed to the chosen status.
      filter = this.data.status
        ? { ...base, statuses: [this.data.status] }
        : base;
    }

    this._listLoading.set(true);
    this.api
      .getAll(filter, this.store.sort())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this._listPolicies.set(page.data);
          this._listLoading.set(false);
        },
        error: () => this._listLoading.set(false),
      });
  }

  /** Formats a Date as an ISO YYYY-MM-DD string for date-range query params. */
  private toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------------------
  // Local UI state
  // ---------------------------------------------------------------------------

  /**
   * Set of policy IDs currently in the "renewing" state (spinner shown).
   *
   * WHY Set INSIDE A SIGNAL: Set gives O(1) `.has()` lookup for the template's
   * `[disabled]` and spinner bindings. Wrapping in a signal ensures OnPush
   * re-renders fire when the set contents change (since Set mutation is not
   * detectable by Angular's change detection without a signal wrapper).
   *
   * WHY NOT PLAIN boolean: Multiple rows could be in renewing state simultaneously
   * if the user clicks Renew on several rows quickly. A Set tracks all of them.
   */
  readonly renewingIds = signal<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Computed signals
  // ---------------------------------------------------------------------------

  /**
   * In detail mode: live-updates the displayed policy from the store.
   *
   * WHY DERIVED FROM store.policies(): After `store.renewPolicy(id)` completes,
   * the store updates `_policies`. A computed that re-reads from the store picks
   * up the updated status automatically — the dialog shows the confirmed status
   * from the server, not just the optimistic value. Falls back to `data.policy`
   * if the policy is not found in the store (e.g. it was deleted externally).
   */
  readonly detailPolicy = computed<Policy | undefined>(() => {
    if (this.data.mode !== 'detail' || !this.data.policy) return undefined;
    return (
      this.store.policies().find((p) => p.id === this.data.policy!.id) ??
      this.data.policy
    );
  });

  /**
   * In list mode: the filtered subset of policies for the dialog's mode.
   *
   * WHY FETCHED (not derived from the store): Under server-side pagination the
   * store holds only the current page, so the dialog cannot derive a full
   * drilldown list from it. Instead it issues its own scoped API request that
   * reflects the dashboard's active filters PLUS the drilldown constraint
   * (status, or the expiring-within-30-days window) with no page limit.
   */
  private readonly _listPolicies = signal<Policy[]>([]);
  readonly listPolicies = this._listPolicies.asReadonly();

  /** True while the list-mode drilldown query is in flight. */
  private readonly _listLoading = signal<boolean>(false);
  readonly listLoading = this._listLoading.asReadonly();

  /** Columns for the list-mode mat-table. */
  readonly listColumns = [
    'policyNumber',
    'policyHolderName',
    'status',
    'region',
    'expiryDate',
    'actions',
  ];

  // ---------------------------------------------------------------------------
  // Computed title
  // ---------------------------------------------------------------------------

  /** Dialog title derived from mode + status. */
  protected readonly dialogTitle = computed<string>(() => {
    if (this.data.mode === 'detail') {
      return this.detailPolicy()?.policyNumber ?? 'Policy Details';
    }
    if (this.data.mode === 'expiring') return 'Expiring Within 30 Days';
    return `${this.data.status ?? ''} Policies`;
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Initiates a policy renewal.
   *
   * 1. Adds the policy ID to `renewingIds` (shows spinner, disables button).
   * 2. Calls `store.renewPolicy(id)` — optimistic update + API call.
   * 3. Removes from `renewingIds` after 1500 ms — gives the user time to
   *    see the spinner and register the action completed.
   *
   * WHY 1500ms TIMEOUT (not waiting for API response): The store's optimistic
   * update changes the policy status in `_policies` synchronously. The dialog's
   * `detailPolicy` computed picks up the change immediately. Waiting for the
   * full API round-trip (~50–200ms on localhost) before removing the spinner
   * would make the action feel janky. The 1500ms window is long enough to show
   * intent; the store handles rollback silently if the API call fails.
   *
   * @param id - The UUID of the policy to renew.
   */
  renew(id: string): void {
    // Create a new Set (not mutate) so the signal's equality check detects the change
    this.renewingIds.update((s) => new Set([...s, id]));
    this.store.renewPolicy(id);

    setTimeout(() => {
      this.renewingIds.update((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, 1500);
  }

  /**
   * Flags the detail-mode policy for review via the store's bulk-flag path.
   *
   * WHY VIA selectAll + flagSelectedPolicies (not a dedicated single-flag action):
   * The store already has `flagSelectedPolicies()` which handles optimistic update,
   * forkJoin, and rollback for multiple IDs. Routing a single flag through the
   * same path reuses that logic without duplication. `selectAll([id])` sets the
   * selection to exactly one ID; `flagSelectedPolicies()` then flags it.
   */
  flagDetail(): void {
    if (!this.data.policy) return;
    this.store.selectAll([this.data.policy.id]);
    this.store.flagSelectedPolicies();
  }

  // ---------------------------------------------------------------------------
  // Display helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the urgency class suffix for a policy's expiry date.
   * Used for row tinting and the urgency badge in list mode.
   *
   * @param expiryDate - ISO date string (YYYY-MM-DD).
   * @returns `'critical'` (≤7d), `'high'` (≤15d), `'low'` (≤30d), or `''`.
   */
  protected urgencyClass(expiryDate: string): string {
    const days = daysUntilExpiry(expiryDate);
    if (days <= 0) return '';       // Already expired — no urgency badge needed
    if (days <= 7) return 'critical';
    if (days <= 15) return 'high';
    if (days <= 30) return 'low';
    return '';
  }

  /**
   * Returns the days-remaining label for the expiry days badge.
   * @param expiryDate - ISO date string.
   * @returns e.g. "5d left", "30d left", or empty string if > 30 days.
   */
  protected daysLabel(expiryDate: string): string {
    const days = daysUntilExpiry(expiryDate);
    if (days <= 0 || days > 30) return '';
    return `${days}d left`;
  }

  /**
   * Formats a date string (YYYY-MM-DD) for human-readable display.
   * @param iso - ISO date string.
   */
  protected formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  /**
   * Compact premium formatter consistent with PolicyTable.formatPremium.
   */
  protected formatPremium(value: number, currencyCode: string): string {
    const symbol = getCurrencySymbol(currencyCode, 'narrow', this.locale);
    if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
    return `${symbol}${value.toLocaleString()}`;
  }

  /**
   * Returns a CSS-safe LOB class suffix (same logic as PolicyTable.getLobClass).
   */
  protected getLobClass(lob: string): string {
    return lob
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
