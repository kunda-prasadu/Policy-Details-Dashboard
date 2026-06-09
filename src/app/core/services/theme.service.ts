// DECISION: Signal-based theme state with localStorage persistence and OS-preference detection.
// ALTERNATIVES CONSIDERED:
//   1. BehaviorSubject<boolean> — requires subscribe/unsubscribe boilerplate and is
//      less ergonomic in Angular 20's template signal binding.
//   2. CSS-only prefers-color-scheme with no JS toggle — cannot be overridden by user.
//   3. Angular CDK OverlayContainer.addPanelClass() — only affects overlay panels,
//      not the full application surface.
// REASON: A signal gives us a reactive primitive that components can read without
//         subscribing. The class-based approach (adding 'dark-theme' to <html>) means
//         ALL CSS — Material tokens, custom SCSS, and third-party styles — responds to
//         a single class toggle rather than requiring multiple style hooks.

import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StorageService } from './storage.service';
import { DARK_THEME_VALUE, THEME_STORAGE_KEY } from '../../features/policy-dashboard/constants';

/**
 * Application theme management service.
 *
 * Manages the dark/light mode state as a signal, persists user preference
 * to localStorage, and applies or removes the `dark-theme` CSS class on
 * `document.documentElement` to activate the Angular Material 3 dark token set.
 *
 * Single responsibility: own and synchronise the theme preference between
 * the signal state, localStorage, and the DOM class list.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(StorageService);
  private readonly platformId = inject(PLATFORM_ID);

  // WHY THIS APPROACH: The signal is private with a read-only public accessor
  // (`isDark`). External code can read the signal but cannot mutate it directly —
  // all mutations go through toggle() or set(), keeping state changes auditable.
  private readonly _isDark = signal<boolean>(false);

  /**
   * Read-only signal indicating whether dark mode is currently active.
   *
   * Components and directives bind to this signal to reactively update
   * their appearance without subscribing to an Observable.
   *
   * WHY COMPUTED DERIVATION IS NOT USED HERE: The source of truth for isDark
   * is user intent (toggle action + persisted preference), not a derivation
   * from another signal. A plain signal is correct; computed() would be
   * appropriate only if isDark were derived from a more primitive signal.
   */
  readonly isDark = this._isDark.asReadonly();

  constructor() {
    // Resolve the initial theme before registering the DOM-sync effect,
    // so the first effect run reflects the correct initial state.
    this._isDark.set(this.resolveInitialTheme());

    // WHY AN EFFECT HERE: The DOM class mutation is a side effect that must
    // stay in sync with the signal. effect() is the correct Angular 20 API
    // for synchronising signal state to imperative DOM operations — it re-runs
    // automatically whenever _isDark changes, eliminating the need to call
    // applyThemeClass() manually in every code path that mutates _isDark.
    effect(() => {
      this.applyThemeClass(this._isDark());
    });
  }

  /**
   * Toggles between dark and light mode.
   *
   * Side effects:
   * - Mutates the `_isDark` signal (triggers DOM class sync via effect).
   * - Persists the new preference to localStorage via StorageService.
   *
   * WHY THIS IS THE ONLY PUBLIC MUTATOR: Keeps all theme-change logic in
   * one place. If analytics or logging needs to track theme changes, there
   * is a single point of instrumentation.
   */
  toggle(): void {
    const next = !this._isDark();
    this._isDark.set(next);
    this.storage.set<string>(
      THEME_STORAGE_KEY,
      next ? DARK_THEME_VALUE : 'light',
    );
  }

  /**
   * Explicitly sets the theme to dark or light.
   *
   * Used to apply a theme programmatically (e.g. from a settings page select).
   * Persists the preference identically to toggle().
   *
   * @param dark - True to activate dark mode, false for light mode.
   */
  setDark(dark: boolean): void {
    this._isDark.set(dark);
    this.storage.set<string>(
      THEME_STORAGE_KEY,
      dark ? DARK_THEME_VALUE : 'light',
    );
  }

  /**
   * Determines the initial theme on application startup.
   *
   * Priority order (highest to lowest):
   * 1. Persisted localStorage preference (user explicitly chose a theme).
   * 2. OS/browser prefers-color-scheme media query (system default).
   * 3. Light mode (safe fallback for SSR and environments without matchMedia).
   *
   * WHY THIS PRIORITY: Respects user intent first, then system preference,
   * then fails safe to light. This avoids a flash of unstyled dark content
   * on first load for users who prefer light mode on a dark-mode OS.
   *
   * @returns True if dark mode should be active on startup.
   */
  private resolveInitialTheme(): boolean {
    // Step 1: Persisted user preference
    const stored = this.storage.get<string>(THEME_STORAGE_KEY);
    if (stored !== null) {
      return stored === DARK_THEME_VALUE;
    }

    // Step 2: OS/browser media query (browser environment only)
    if (isPlatformBrowser(this.platformId) && typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // Step 3: Light mode fallback (SSR, test environments)
    return false;
  }

  /**
   * Applies or removes the `dark-theme` CSS class on `document.documentElement`.
   *
   * WHY document.documentElement (the <html> element): Angular Material 3's
   * dark token set is scoped to the `html` element via the `color-scheme` CSS
   * property set in styles.scss. Adding the class here ensures every Angular
   * Material component and every custom component that reads `--mat-sys-*`
   * tokens responds to the theme change simultaneously.
   *
   * Side effect: mutates document.documentElement.classList. No-op in SSR.
   *
   * @param isDark - Whether to add (true) or remove (false) the dark-theme class.
   */
  private applyThemeClass(isDark: boolean): void {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') {
      return;
    }
    const { classList } = document.documentElement;
    if (isDark) {
      classList.add('dark-theme');
      classList.remove('light-theme');
    } else {
      classList.remove('dark-theme');
      classList.add('light-theme');
    }
  }
}
