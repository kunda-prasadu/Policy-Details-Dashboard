// DECISION: BulkActionBar is a thin coordinator between PolicyStore and MatSnackBar.
// ALTERNATIVES CONSIDERED: Handling bulk actions in the policy table component itself.
// REASON: Separating the toolbar into its own component: (a) keeps PolicyTable focused
//         on rendering; (b) makes the toolbar independently hideable via @if in the
//         shell when selectedCount drops to 0; (c) allows additional bulk actions
//         (export, print, delete) to be added here without touching PolicyTable.

import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { take } from 'rxjs/operators';

import { PolicyStore } from '../../store/policy.store';

/**
 * BulkActionBar component.
 *
 * Renders a contextual toolbar that appears when one or more policies are
 * selected in the policy table. Provides:
 * - A live selection count (announced to screen readers via aria-live).
 * - A "Clear selection" button.
 * - A "Flag for review" button that bulk-flags all selected policies and
 *   confirms the action via a MatSnackBar notification.
 *
 * Visibility is controlled by the parent shell via `@if (store.hasSelection())`.
 * This component itself always renders when mounted.
 */
@Component({
  selector: 'app-bulk-action-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bulk-action-bar.html',
  styleUrl: './bulk-action-bar.scss',
  imports: [MatButtonModule, MatIconModule, MatSnackBarModule, MatTooltipModule],
})
export class BulkActionBar {
  // ---------------------------------------------------------------------------
  // Injected dependencies
  // ---------------------------------------------------------------------------

  /** PolicyStore — provides selectedCount, hasSelection; receives bulk actions. */
  protected readonly store = inject(PolicyStore);

  private readonly snackBar = inject(MatSnackBar);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Flags all currently selected policies for underwriter review.
   *
   * Step-by-step:
   * 1. Snapshot `selectedCount()` BEFORE calling flagSelectedPolicies() — the
   *    action clears the selection internally, so reading count after would give 0.
   * 2. Dispatch the flag action to the store (optimistic update + API call).
   * 3. Open a snackbar confirming how many policies were flagged.
   *
   * WHY SNAPSHOT COUNT BEFORE ACTION: store.flagSelectedPolicies() calls
   * clearSelection() internally as part of its success handler. If we read
   * store.selectedCount() after the synchronous optimistic update phase,
   * the count is already 0 and the snackbar would say "0 policies flagged".
   *
   * WHY NOT AWAIT: The flag action is fire-and-forget from the UI perspective.
   * The store handles success/error and updates the policies signal accordingly.
   * Rollback on failure is handled in the store — the snackbar shows the
   * optimistic intent ("flagged"), not the confirmed API result.
   */
  flagForReview(): void {
    const count = this.store.selectedCount();

    if (count === 0) return;

    this.store.flagSelectedPolicies();

    const failedIds = this.store.lastFailedFlagIds();
    if (failedIds.length > 0) {
      const retryRef = this.snackBar.open(
        `Flag for review failed for ${failedIds.length} ${failedIds.length === 1 ? 'policy' : 'policies'}`,
        'Retry',
        {
          duration: 8000,
          panelClass: ['snack-flag-error'],
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
        },
      );

      retryRef.onAction().pipe(take(1)).subscribe(() => {
        this.store.retryLastFailedFlag();
      });
      return;
    }

    // WHY PLURAL HANDLING: "1 policy flagged" vs "2 policies flagged" — grammatically
    // correct messages reduce cognitive friction for users auditing the action log.
    const label = count === 1 ? '1 policy flagged for review' : `${count} policies flagged for review`;
    this.snackBar.open(label, 'Dismiss', {
      duration: 4000,
      // WHY CUSTOM panelClass: The success snackbar needs a distinct visual
      // treatment (green accent) from the default snackbar (grey). panelClass
      // is the Material way to apply additional classes to the snackbar container
      // element, which sits in a CDK overlay outside the component tree.
      panelClass: ['snack-flag-success'],
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }
}
