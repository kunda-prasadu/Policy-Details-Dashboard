// DECISION: SummaryPanel is a pure presentational component reading from PolicyStore.
// ALTERNATIVES CONSIDERED: Embedding KPI cards directly in the dashboard shell.
// REASON: Extracting the panel into its own component keeps the shell clean and
//         allows the panel to be independently lazy-loaded or replaced in future
//         iterations (e.g. swapping out SVG arc for a chart library widget).

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  LOCALE_ID,
} from '@angular/core';
import { getCurrencySymbol } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';

import { PolicyStore } from '../../store/policy.store';
import { PolicyStatus } from '../../models/policy.model';
import { PolicyDrilldownDialog } from '../policy-drilldown-dialog/policy-drilldown-dialog';
import { DrilldownDialogData } from '../policy-drilldown-dialog/policy-drilldown-dialog';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * Configuration for a single status summary card.
 * Computed once per status so the template can @for over a flat array.
 */
interface StatusCard {
  status: PolicyStatus;
  count: number;
  /** Material icon name rendered inside the card. */
  icon: string;
  /** CSS class suffix for colour theming (maps to SCSS variables). */
  colorClass: string;
  /** Accessible label read by screen readers. */
  ariaLabel: string;
}

// SVG arc geometry constants
/** Radius of the SVG arc circle. */
const ARC_RADIUS = 52;
/** Full circumference of the arc circle (2πr). */
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

/**
 * SummaryPanel component.
 *
 * Renders the KPI summary section of the policy dashboard:
 * 1. Four clickable status cards (Active / Pending / Expired / Cancelled)
 *    — each opens PolicyDrilldownDialog filtered by that status.
 * 2. An animated SVG arc showing the percentage of Active policies expiring
 *    within 30 days (urgency indicator for underwriters).
 * 3. Animated GWP progress bars per line of business (relative share of total).
 *
 * All data is read directly from PolicyStore computed signals — the panel
 * re-renders only when those computed values change (OnPush + signals).
 */
@Component({
  selector: 'app-summary-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './summary-panel.html',
  styleUrl: './summary-panel.scss',
  imports: [MatDialogModule, MatIconModule, MatTooltipModule, MatRippleModule],
})
export class SummaryPanel {
  // ---------------------------------------------------------------------------
  // Injected dependencies
  // ---------------------------------------------------------------------------

  protected readonly store = inject(PolicyStore);
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject<string>(LOCALE_ID);

  // ---------------------------------------------------------------------------
  // SVG arc constants exposed to template
  // ---------------------------------------------------------------------------

  /** Exposed so the template can set `stroke-dasharray` without inline math. */
  protected readonly ARC_CIRCUMFERENCE = ARC_CIRCUMFERENCE;

  // ---------------------------------------------------------------------------
  // Computed signals
  // ---------------------------------------------------------------------------

  /**
   * Flat array of status card configurations derived from the store summary.
   *
   * WHY COMPUTED (not a template-local array): Each card's `count` must update
   * reactively when the store's summary changes. A template-local array literal
   * would not re-evaluate; a computed signal does.
   */
  protected readonly statusCards = computed<StatusCard[]>(() => {
    const s = this.store.summary();
    return [
      {
        status: 'Active',
        count: s.active,
        icon: 'check_circle',
        colorClass: 'active',
        ariaLabel: `${s.active} active policies. Click to view details.`,
      },
      {
        status: 'Pending',
        count: s.pending,
        icon: 'pending',
        colorClass: 'pending',
        ariaLabel: `${s.pending} pending policies. Click to view details.`,
      },
      {
        status: 'Expired',
        count: s.expired,
        icon: 'cancel',
        colorClass: 'expired',
        ariaLabel: `${s.expired} expired policies. Click to view details.`,
      },
      {
        status: 'Cancelled',
        count: s.cancelled,
        icon: 'block',
        colorClass: 'cancelled',
        ariaLabel: `${s.cancelled} cancelled policies. Click to view details.`,
      },
    ];
  });

  /**
   * Stroke-dashoffset for the SVG arc — drives the CSS animation.
   *
   * Full circumference = no arc filled (0% expiring).
   * Zero offset = full arc filled (100% expiring).
   *
   * WHY DASHOFFSET APPROACH: CSS stroke-dasharray + stroke-dashoffset is the
   * native SVG technique for partial circle arcs. It works without any external
   * charting library and is animatable via CSS `transition: stroke-dashoffset`.
   */
  protected readonly arcDashOffset = computed(() => {
    const s = this.store.summary();
    const total = s.active;
    if (total === 0) return ARC_CIRCUMFERENCE;
    const pct = Math.min(s.expiringWithin30Days / total, 1);
    // WHY (1 - pct): SVG strokes draw clockwise from the rightmost point.
    // Subtracting from 1 means a higher percentage fills MORE of the arc,
    // which is the intuitive direction (more = more urgent = fuller ring).
    return ARC_CIRCUMFERENCE * (1 - pct);
  });

  /**
   * Percentage label for the SVG arc centre text (0–100).
   */
  protected readonly arcPercent = computed(() => {
    const s = this.store.summary();
    if (s.active === 0) return 0;
    return Math.round((s.expiringWithin30Days / s.active) * 100);
  });

  /**
   * GWP bars per line of business as an array sorted by descending GWP.
   *
   * Each entry has: `lob` label, `gwp` raw value, `pct` relative percentage
   * (relative to the largest LOB, not total — so the leading bar is always 100%).
   *
   * WHY RELATIVE PERCENTAGE (not share of total): Relative scaling fills the
   * bar container width for the leading LOB, making inter-LOB comparison easier
   * than having all bars be small fractions of the total.
   */
  protected readonly gwpBars = computed(() => {
    const gwpByLob = this.store.summary().gwpByLob;
    const entries = Object.entries(gwpByLob).sort(([, a], [, b]) => b - a);
    const max = entries[0]?.[1] ?? 1;

    return entries.map(([lob, gwp]) => ({
      lob,
      gwp,
      pct: Math.round((gwp / max) * 100),
      label: this.formatPremiumCompact(gwp),
    }));
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Opens the PolicyDrilldownDialog filtered to a specific policy status.
   *
   * WHY 720px MIN-WIDTH: The drilldown dialog contains a mat-table with 6+
   * columns. Below 720px the table would require horizontal scroll inside the
   * dialog, creating nested scroll contexts that confuse touch users.
   *
   * @param status - The PolicyStatus to display in the dialog.
   */
  openStatusDrilldown(status: PolicyStatus): void {
    const data: DrilldownDialogData = { mode: 'status', status };
    this.dialog.open(PolicyDrilldownDialog, {
      data,
      width: '90vw',
      maxWidth: '960px',
      minWidth: '320px',
      autoFocus: 'dialog',
      ariaLabel: `${status} policies`,
    });
  }

  // ---------------------------------------------------------------------------
  // Display helpers
  // ---------------------------------------------------------------------------

  /**
   * Compact premium formatter for GWP bar labels.
   * Mirrors the logic in PolicyTable.formatPremium but without currency symbol —
   * the bar label shows value only; the currency is shown once in the section header.
   *
   * @param value - Raw GWP amount (sum across all currencies — approximate).
   */
  protected formatPremiumCompact(value: number): string {
    // WHY USD SYMBOL: GWP aggregation sums across multiple currencies
    // (SGD, HKD, AUD etc.) without conversion — the result is a blended number,
    // not a true monetary amount. Displaying it as "USD" makes this approximation
    // explicit; a future enhancement would convert to a base currency first.
    const symbol = getCurrencySymbol('USD', 'narrow', this.locale);
    if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
    return `${symbol}${value.toLocaleString()}`;
  }
}
