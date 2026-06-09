// DECISION: ThemePicker applies palette changes by overriding CSS custom
//           properties directly on document.documentElement at runtime.
// ALTERNATIVES CONSIDERED:
//   1. Pre-generating 10 full @include mat.theme() blocks in styles.scss and
//      switching via a data-palette HTML attribute.
//   2. Using Angular CDK's Overlay theme service.
//   3. A third-party theming library.
// REASON: CSS custom property overrides on the root element are the lightest-
//         weight approach: no SCSS build-time change, no extra payload per
//         palette (tokens are replaced at runtime, not shipped as separate CSS
//         blocks), and compatible with Angular Material 3's token-based system.
//         Only the primary-family tokens are overridden — surface and background
//         tokens are governed by the base mat.theme() and the dark/light toggle.

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

import { StorageService } from '../../core/services/storage.service';
import { PALETTE_STORAGE_KEY } from '../../features/policy-dashboard/constants';

// ---------------------------------------------------------------------------
// Palette definitions
// ---------------------------------------------------------------------------

/**
 * Descriptor for a named Material 3 colour palette override.
 *
 * `primary` / `onPrimary` / `primaryContainer` map directly to the Angular
 * Material 3 system tokens `--mat-sys-primary`, `--mat-sys-on-primary`, and
 * `--mat-sys-primary-container` that drive button, tab, chip, and FAB colours
 * throughout the application.
 */
export interface ThemePalette {
  readonly id: string;
  /** Display name shown in the swatch tooltip. */
  readonly name: string;
  /** CSS colour used to render the swatch circle in the picker. */
  readonly swatch: string;
  /** Value for --mat-sys-primary. */
  readonly primary: string;
  /** Value for --mat-sys-on-primary (contrast text on primary surfaces). */
  readonly onPrimary: string;
  /** Value for --mat-sys-primary-container (tinted chip/badge backgrounds). */
  readonly primaryContainer: string;
  /** Value for --mat-sys-on-primary-container. */
  readonly onPrimaryContainer: string;
}

/**
 * Ten named colour palettes available in the theme picker.
 *
 * WHY 10 PALETTES: 10 fills a 5×2 grid neatly, is meaningful enough to feel
 * personalised, and does not overwhelm users with choice. All colours are
 * drawn from the Material Design colour system to ensure contrast ratios meet
 * WCAG AA requirements against white and dark-surface backgrounds.
 */
export const THEME_PALETTES: readonly ThemePalette[] = [
  {
    id: 'azure',
    name: 'Azure Blue',
    swatch: '#1565C0',
    primary: '#1565C0',
    onPrimary: '#ffffff',
    primaryContainer: '#BBDEFB',
    onPrimaryContainer: '#0d2e5e',
  },
  {
    id: 'forest',
    name: 'Forest',
    swatch: '#2E7D32',
    primary: '#2E7D32',
    onPrimary: '#ffffff',
    primaryContainer: '#C8E6C9',
    onPrimaryContainer: '#1b4d1e',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    swatch: '#C62828',
    primary: '#C62828',
    onPrimary: '#ffffff',
    primaryContainer: '#FFCDD2',
    onPrimaryContainer: '#7f0000',
  },
  {
    id: 'amber',
    name: 'Amber',
    swatch: '#E65100',
    primary: '#E65100',
    onPrimary: '#ffffff',
    primaryContainer: '#FFE0B2',
    onPrimaryContainer: '#7f2d00',
  },
  {
    id: 'violet',
    name: 'Violet',
    swatch: '#6A1B9A',
    primary: '#6A1B9A',
    onPrimary: '#ffffff',
    primaryContainer: '#E1BEE7',
    onPrimaryContainer: '#3d0066',
  },
  {
    id: 'teal',
    name: 'Teal',
    swatch: '#00695C',
    primary: '#00695C',
    onPrimary: '#ffffff',
    primaryContainer: '#B2DFDB',
    onPrimaryContainer: '#003c35',
  },
  {
    id: 'rose',
    name: 'Rose',
    swatch: '#AD1457',
    primary: '#AD1457',
    onPrimary: '#ffffff',
    primaryContainer: '#FCE4EC',
    onPrimaryContainer: '#6b0033',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    swatch: '#283593',
    primary: '#283593',
    onPrimary: '#ffffff',
    primaryContainer: '#C5CAE9',
    onPrimaryContainer: '#0d1a5b',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    swatch: '#1B5E20',
    primary: '#1B5E20',
    onPrimary: '#ffffff',
    primaryContainer: '#DCEDC8',
    onPrimaryContainer: '#003300',
  },
  {
    id: 'slate',
    name: 'Slate',
    swatch: '#37474F',
    primary: '#37474F',
    onPrimary: '#ffffff',
    primaryContainer: '#CFD8DC',
    onPrimaryContainer: '#102027',
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Palette selector that opens a 5×2 swatch grid inside a MatMenu.
 *
 * Each swatch is a coloured circle with a tooltip showing the palette name.
 * The active palette shows a check-mark overlay. Selecting a swatch:
 *  1. Updates the `activePaletteId` signal.
 *  2. Persists the selection to localStorage via StorageService.
 *  3. Applies the palette by overriding Material 3 primary CSS tokens on
 *     `document.documentElement`.
 *
 * SSR-safe: `applyPalette()` is guarded by `isPlatformBrowser()`.
 */
@Component({
  selector: 'app-theme-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './theme-picker.html',
  styleUrl: './theme-picker.scss',
})
export class ThemePickerComponent {
  protected readonly palettes = THEME_PALETTES;

  /**
   * ID of the currently active palette.
   *
   * WHY SIGNAL: The template binds `activePaletteId()` to control the
   * checkmark visibility per swatch. A signal is updated synchronously on
   * selection so the UI reflects the change immediately without requiring
   * change detection coercion.
   */
  protected readonly activePaletteId = signal<string>('azure');

  private readonly storage = inject(StorageService);
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * WHY viewChild(MatMenuTrigger): We need to programmatically close the menu
   * after a swatch is selected. MatMenu's default behaviour closes on
   * [mat-menu-item] clicks only — our swatch buttons are plain `<button>`
   * elements with custom styling, so we close the trigger manually.
   */
  private readonly menuTrigger = viewChild(MatMenuTrigger);

  constructor() {
    // WHY IN CONSTRUCTOR: Apply persisted palette before first render to avoid
    // a flash of the default (azure) primary colour for users who selected a
    // different palette in a previous session.
    const stored = this.storage.get<string>(PALETTE_STORAGE_KEY) ?? 'azure';
    this.activePaletteId.set(stored);
    this.applyPalette(stored);
  }

  /**
   * Selects a palette, persists it, applies CSS token overrides, and closes
   * the swatch menu.
   *
   * @param palette - The palette descriptor the user clicked.
   */
  protected selectPalette(palette: ThemePalette): void {
    this.activePaletteId.set(palette.id);
    this.storage.set<string>(PALETTE_STORAGE_KEY, palette.id);
    this.applyPalette(palette.id);
    this.menuTrigger()?.closeMenu();
  }

  /**
   * Overrides Angular Material 3 primary CSS tokens on `document.documentElement`.
   *
   * WHY ONLY PRIMARY TOKENS: The surface, background, and error colour families
   * are defined by the base mat.theme() in styles.scss and should not vary per
   * palette. Only the primary/on-primary family drives the brand colour visible
   * in buttons, chips, tabs, and focused form controls — which is the user's
   * primary expectation when picking a colour theme.
   *
   * @param id - The palette ID to look up and apply.
   */
  private applyPalette(id: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const palette = THEME_PALETTES.find((p) => p.id === id);
    if (!palette) {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty('--mat-sys-primary', palette.primary);
    root.style.setProperty('--mat-sys-on-primary', palette.onPrimary);
    root.style.setProperty(
      '--mat-sys-primary-container',
      palette.primaryContainer,
    );
    root.style.setProperty(
      '--mat-sys-on-primary-container',
      palette.onPrimaryContainer,
    );
  }
}
