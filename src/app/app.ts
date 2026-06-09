// DECISION: App is a thin shell component — it owns only the persistent header
//           toolbar (brand, theme controls) and the <router-outlet>. All domain
//           logic lives in routed feature pages and stores.
// ALTERNATIVES CONSIDERED:
//   1. Embedding PolicyDashboard directly in App (no routing) — prevents future
//      addition of settings, help, or auth pages without a major refactor.
//   2. Using a layout component injected via the router outlet — extra file for
//      a single-layout app; overkill at this stage.
// REASON: Keeping the App shell minimal ensures it never becomes a god component.
//         The <router-outlet> is the only coupling point to feature pages.

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ThemeService } from './core/services/theme.service';
import { ThemePickerComponent } from './shared/theme-picker/theme-picker';

/**
 * Root application shell.
 *
 * Renders the persistent application header toolbar (brand identity + theme
 * controls) and the Angular Router outlet that hosts feature page components.
 *
 * Responsibilities:
 *  - Display "Policy Hub" title and "Chubb APAC" subtitle.
 *  - Provide palette picker (ThemePickerComponent) and dark/light toggle.
 *  - Host the <router-outlet> for routed feature pages.
 *
 * Does NOT own any domain state — all policy data is in PolicyStore.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ThemePickerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /**
   * ThemeService exposed to the template for the dark/light toggle button.
   *
   * WHY PROTECTED (not private): Angular's template compiler in strict mode
   * requires bindings to be at least `protected`. Keeping it protected (not
   * public) signals that this is view-layer state, not part of the public API.
   */
  protected readonly theme = inject(ThemeService);
}
