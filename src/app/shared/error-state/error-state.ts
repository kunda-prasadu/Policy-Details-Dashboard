// DECISION: ErrorState is a shared presentational component. It receives the
//           error message as an input and emits a retryClick event — it has no
//           knowledge of the PolicyStore or any domain context.
// ALTERNATIVES CONSIDERED: Embedding error UI inline in PolicyDashboard.
// REASON: A standalone ErrorState can be reused by other feature pages,
//         tested in isolation, and swapped for a richer error treatment (e.g.
//         separate messages per HTTP status code) without touching the dashboard
//         page template.

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Generic error card shown when an API call or data load fails.
 *
 * Displays a warning icon, a human-readable error message, and a "Try Again"
 * button. The parent component is responsible for deciding what action the
 * retry triggers (typically re-issuing the failed API call).
 *
 * Accessibility: the host element carries `role="alert"` so screen readers
 * announce the error immediately when it appears in the DOM.
 */
@Component({
  selector: 'app-error-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './error-state.html',
  styleUrl: './error-state.scss',
  host: {
    role: 'alert',
    'aria-live': 'assertive',
  },
})
export class ErrorState {
  /**
   * Human-readable error description to display below the title.
   *
   * Passed from the store's `error()` signal — already sanitised by the
   * `errorInterceptor` (OWASP A03: never raw server messages in the UI).
   */
  readonly message = input<string>('Something went wrong. Please try again.');

  /**
   * Emitted when the user clicks the "Try Again" button.
   *
   * The parent binds this to the appropriate store action (e.g.
   * `store.loadPolicies()`). This component does not call the store directly,
   * keeping it decoupled from any specific feature store.
   */
  readonly retryClick = output<void>();
}
