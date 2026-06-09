// DECISION: LoadingSkeleton is a pure visual placeholder — no inputs, no
//           outputs, no store dependency. It only renders a shimmer animation.
// ALTERNATIVES CONSIDERED: Inline skeleton markup inside PolicyDashboard,
//   using ngx-skeleton-loader library.
// REASON: A dedicated component keeps the shimmer markup out of the page
//         template, makes it independently testable, and lets us swap the
//         visual implementation (e.g. richer skeletons) without touching the
//         page. No external library is needed for a CSS-only shimmer.

import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Shimmer loading placeholder shown while the policy list is being fetched.
 *
 * Renders a set of animated skeleton rows that approximate the shape of the
 * summary panel and table, reducing perceived load time by giving users
 * immediate visual feedback that content is incoming.
 *
 * Accessibility: the host element carries `role="status"` and `aria-label` so
 * screen readers announce the loading state without rendering the placeholder
 * content as meaningful text.
 */
@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loading-skeleton.html',
  styleUrl: './loading-skeleton.scss',
  host: {
    role: 'status',
    'aria-label': 'Loading policies…',
    'aria-busy': 'true',
  },
})
export class LoadingSkeleton {
  /**
   * Number of skeleton table rows to render.
   *
   * WHY 6: Matches the default page size (10) rounded down to what is
   * visible above the fold on a typical 1080p monitor. More rows add DOM
   * weight without adding visual clarity.
   */
  protected readonly rowCount = Array.from({ length: 6 });
}
