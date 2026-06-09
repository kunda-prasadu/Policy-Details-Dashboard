// DECISION: EmptyState is a shared presentational component — it receives
//           `title` and `description` as inputs and emits `clearFilters`.
//           It does NOT inject PolicyStore directly.
// ALTERNATIVES CONSIDERED: Injecting PolicyStore inside EmptyState and calling
//   clearFilters() directly.
// REASON: EmptyState lives in src/app/shared/ and must remain domain-agnostic.
//         If a future feature page shows a different empty state (e.g. no
//         reports found), it should be able to reuse this component without
//         pulling in the PolicyStore. The clearFilters output routes the action
//         through the parent, which decides the correct store call.

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Zero-results empty state card.
 *
 * Shown when the policy list returns no results after filtering. Displays a
 * `search_off` icon, a configurable title and description, and a
 * "Clear all filters" action that the parent can bind to `store.clearFilters()`.
 *
 * Accessibility: the host element carries `role="status"` and `aria-live` so
 * screen readers announce the transition from results to no-results without
 * requiring focus movement.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  host: {
    role: 'status',
    'aria-live': 'polite',
  },
})
export class EmptyState {
  /** Primary heading of the empty state card. */
  readonly title = input('No results found');

  /**
   * Supporting description shown below the title.
   * Should guide the user towards a resolution (e.g. "Try adjusting your filters").
   */
  readonly description = input('Try adjusting your search or filter criteria.');

  /**
   * Emitted when the user clicks "Clear all filters".
   *
   * WHY AN OUTPUT (not direct store call): keeps this shared component
   * independent of any feature-specific store. The parent PolicyDashboard
   * page handles the event by calling `store.clearFilters()`.
   */
  readonly clearFilters = output<void>();
}
