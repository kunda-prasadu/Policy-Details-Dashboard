// DECISION: PolicyFilter owns the form and bridges user input → PolicyStore + Router + StorageService.
// ALTERNATIVES CONSIDERED:
//   1. Spread filter state across multiple sibling components.
//   2. Push filter state into the store and let the store own the FormGroup.
// REASON: A dedicated filter component is the boundary between user gesture (form
//         input) and application state (store + URL + storage). Keeping the form
//         here means components that don't care about filtering don't import
//         ReactiveFormsModule. The store remains a pure signal store with no form
//         coupling — easier to unit-test both sides independently.

// DECISION: Two subscriptions to formValueChanges (immediate + debounced 400 ms).
// ALTERNATIVES CONSIDERED: A single debounced subscription for store + URL + storage.
// REASON: Store updates must be immediate so the table re-renders on every keystroke
//         (fast, local data with json-server). URL and storage writes are debounced to
//         avoid flooding the history stack and localStorage on each character typed in
//         the search field.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PolicyStore } from '../../store/policy.store';
import { StorageService } from '../../../../core/services/storage.service';
import { PolicyFilter as PolicyFilterModel } from '../../models/policy-filter.model';
import {
  FILTER_STORAGE_KEY,
  LINES_OF_BUSINESS,
  POLICY_STATUSES,
  REGIONS,
} from '../../constants/policy.constants';
import { LineOfBusiness, PolicyStatus, Region } from '../../models/policy.model';
import { FilterPanel } from '../filter-panel/filter-panel';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * Shape of the raw form value, matching the FormGroup definition below.
 * `status`, `region`, and `lineOfBusiness` are single-value selects.
 * The bottom sheet (FilterPanel) uses the same shape for seeding / returning data.
 */
export interface PolicyFilterFormValue {
  searchTerm: string;
  status: PolicyStatus | null;
  region: Region | null;
  lineOfBusiness: LineOfBusiness | null;
  /** JS Date selected from the datepicker; null when unset. */
  startDate: Date | string | null;
  /** JS Date selected from the datepicker; null when unset. */
  endDate: Date | string | null;
  /** JS Date selected from the datepicker; null when unset. */
  expiryStartDate: Date | string | null;
  /** JS Date selected from the datepicker; null when unset. */
  expiryEndDate: Date | string | null;
  /** Minimum premium amount; 0 means no minimum. */
  minPremium: number;
}

/** A single rendered chip in the active-filter chip strip. */
export interface FilterChip {
  /** Form control key — used by removeFilter() to know which control to reset. */
  key: string;
  /** Human-readable label displayed on the chip (e.g. "Status: Active"). */
  label: string;
}

/**
 * Default form values used for both initial construction and per-field reset.
 * Centralised here so removeFilter() and clearAllFilters() reference the same source.
 */
const FILTER_DEFAULTS: PolicyFilterFormValue = {
  searchTerm: '',
  status: null,
  region: null,
  lineOfBusiness: null,
  startDate: null,
  endDate: null,
  expiryStartDate: null,
  expiryEndDate: null,
  minPremium: 0,
};

/**
 * PolicyFilter component — search bar, "All Filters" button, and active chip strip.
 *
 * Responsibilities:
 * 1. Own the filter FormGroup, seeding it from URL → localStorage → defaults.
 * 2. Propagate form changes immediately to PolicyStore.
 * 3. Debounce-persist form state to localStorage and the URL.
 * 4. Open the FilterPanel bottom sheet for advanced filter editing.
 * 5. Render active filter chips and support per-chip removal and "clear all".
 *
 * This component does NOT display the policy list — it only controls the filter
 * state that drives the list. Parent components compose the two.
 */
@Component({
  selector: 'app-policy-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './policy-filter.html',
  styleUrl: './policy-filter.scss',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatBottomSheetModule,
    MatTooltipModule,
  ],
})
export class PolicyFilter {
  // ---------------------------------------------------------------------------
  // Injected dependencies
  // ---------------------------------------------------------------------------

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly storage = inject(StorageService);
  private readonly destroyRef = inject(DestroyRef);

  /** PolicyStore — receives filter mutations; drives the table data source. */
  protected readonly store = inject(PolicyStore);

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  /**
   * Master form for all filter criteria.
   *
   * WHY NOT SEPARATE FORMS PER SECTION: A single FormGroup allows one
   * subscription to drive both immediate store updates and debounced persistence,
   * without coordinating multiple observables.
   */
  readonly form: FormGroup;

  // ---------------------------------------------------------------------------
  // Signal snapshot — bridges FormGroup RxJS world → Angular Signals world
  // ---------------------------------------------------------------------------

  /**
   * Private writable snapshot of the current form value, updated on every
   * formValueChanges emission.
   *
   * WHY NOT toSignal(): `toSignal()` requires calling inside an injection
   * context. Using a manually-updated WritableSignal lets us control the
   * timing precisely (updated in the same subscription that also calls the
   * store) and avoids an extra `startWith()` pipe to set an initial value.
   */
  private readonly _formSnapshot: WritableSignal<PolicyFilterFormValue>;

  // ---------------------------------------------------------------------------
  // Computed signals
  // ---------------------------------------------------------------------------

  /**
   * Count of active advanced filters (excludes `searchTerm`).
   *
   * Drives the MatBadge on the "All Filters" button.
   * Returns 0 when no advanced filters are set; 1–6 otherwise.
   */
  readonly activeFilterCount: Signal<number>;

  /**
   * Array of active filter chips for the chip strip below the search bar.
   *
   * One chip per active filter field (not per selected value). Template
   * iterates over this to render `<span class="active-filter-chip">` elements.
   */
  readonly activeFilterChips: Signal<FilterChip[]>;

  // ---------------------------------------------------------------------------
  // Template-facing constants
  // ---------------------------------------------------------------------------

  /** Exposed so the FilterPanel import doesn't need to be repeated in the template. */
  protected readonly POLICY_STATUSES = POLICY_STATUSES;
  protected readonly REGIONS = REGIONS;
  protected readonly LINES_OF_BUSINESS = LINES_OF_BUSINESS;

  // ---------------------------------------------------------------------------
  // Constructor — seed, wire subscriptions, initialise computed
  // ---------------------------------------------------------------------------

  constructor() {
    // --- Step 1: Resolve seed values (URL → localStorage → defaults) ----------
    //
    // WHY THIS PRIORITY ORDER:
    // - URL params: allow deep-linking / sharing a specific filter context.
    //   e.g. support team shares a URL pre-filtered to "Expired + Singapore".
    // - localStorage: restores the last session's context for repeat users.
    // - Defaults: safe fallback when neither source has data.
    const params = this.route.snapshot.queryParams;
    const saved = this.storage.get<Partial<PolicyFilterFormValue>>(FILTER_STORAGE_KEY);

    const seed: PolicyFilterFormValue = {
      searchTerm: params['q'] ?? saved?.searchTerm ?? FILTER_DEFAULTS.searchTerm,
      status: (params['status'] as PolicyStatus) ?? saved?.status ?? FILTER_DEFAULTS.status,
      region: (params['region'] as Region) ?? saved?.region ?? FILTER_DEFAULTS.region,
      lineOfBusiness:
        (params['lob'] as LineOfBusiness) ?? saved?.lineOfBusiness ?? FILTER_DEFAULTS.lineOfBusiness,
      startDate: params['startDate'] ?? (saved?.startDate ?? FILTER_DEFAULTS.startDate),
      endDate: params['endDate'] ?? (saved?.endDate ?? FILTER_DEFAULTS.endDate),
      expiryStartDate: params['expiryStartDate'] ?? (saved?.expiryStartDate ?? FILTER_DEFAULTS.expiryStartDate),
      expiryEndDate: params['expiryEndDate'] ?? (saved?.expiryEndDate ?? FILTER_DEFAULTS.expiryEndDate),
      minPremium: params['minPremium']
        ? Number(params['minPremium'])
        : (saved?.minPremium ?? FILTER_DEFAULTS.minPremium),
    };

    // --- Step 2: Build the FormGroup with seeded values ----------------------
    this.form = this.fb.group({
      searchTerm: [seed.searchTerm],
      status: [seed.status],
      region: [seed.region],
      lineOfBusiness: [seed.lineOfBusiness],
      startDate: [seed.startDate],
      endDate: [seed.endDate],
      expiryStartDate: [seed.expiryStartDate],
      expiryEndDate: [seed.expiryEndDate],
      minPremium: [seed.minPremium],
    });

    // --- Step 3: Initialise signal snapshot with the seeded form value -------
    this._formSnapshot = signal<PolicyFilterFormValue>(this.form.value as PolicyFilterFormValue);

    // --- Step 4: Computed signals derived from _formSnapshot -----------------
    this.activeFilterCount = computed(() => {
      const v = this._formSnapshot();
      return [
        v.status,
        v.region,
        v.lineOfBusiness,
        v.startDate,
        v.endDate,
        v.expiryStartDate,
        v.expiryEndDate,
        (v.minPremium ?? 0) > 0 ? v.minPremium : null,
      ].filter(Boolean).length;
    });

    this.activeFilterChips = computed<FilterChip[]>(() => {
      const v = this._formSnapshot();
      const chips: FilterChip[] = [];

      if (v.status) chips.push({ key: 'status', label: `Status: ${v.status}` });
      if (v.region) chips.push({ key: 'region', label: `Region: ${v.region}` });
      if (v.lineOfBusiness) chips.push({ key: 'lineOfBusiness', label: `LOB: ${v.lineOfBusiness}` });
      if (v.startDate) chips.push({ key: 'startDate', label: `From: ${this.formatChipDate(v.startDate)}` });
      if (v.endDate) chips.push({ key: 'endDate', label: `To: ${this.formatChipDate(v.endDate)}` });
      if (v.expiryStartDate) chips.push({ key: 'expiryStartDate', label: `Expiry from: ${this.formatChipDate(v.expiryStartDate)}` });
      if (v.expiryEndDate) chips.push({ key: 'expiryEndDate', label: `Expiry to: ${this.formatChipDate(v.expiryEndDate)}` });
      if ((v.minPremium ?? 0) > 0) {
        chips.push({ key: 'minPremium', label: `Min: $${(v.minPremium).toLocaleString()}` });
      }

      return chips;
    });

    // --- Step 5: Immediate valueChanges → update the local snapshot ----------
    //
    // WHY IMMEDIATE: The snapshot only drives the active-filter chips and count
    // badge — pure local UI with no I/O. Updating it on every keystroke keeps
    // those indicators responsive. The expensive work (API fetch, storage, URL)
    // is debounced separately in Step 6.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => {
        this._formSnapshot.set(val as PolicyFilterFormValue);
      });

    // --- Step 6: Debounced valueChanges → store fetch + persist + URL sync ----
    //
    // WHY DEBOUNCED: Filtering, search and sorting are all SERVER-SIDE — each
    // store.updateFilters() triggers an HTTP request. Firing one per keystroke
    // would hammer the API. Debouncing (a) coalesces rapid typing into a single
    // request, (b) avoids excessive localStorage writes, and (c) prevents a
    // browser-history entry per character. 400 ms is imperceptible to the user.
    this.form.valueChanges
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => {
        const typed = val as PolicyFilterFormValue;
        this.store.updateFilters(this.mapToStoreFilter(typed));
        this.storage.set<PolicyFilterFormValue>(FILTER_STORAGE_KEY, typed);
        this.syncUrl(typed);
      });

    // --- Step 7: Apply initial filter if the form was seeded with non-defaults
    //
    // WHY emitEvent FALSE IS NOT USED: The form is constructed with seed values
    // (not patched after construction), so valueChanges does not fire during
    // construction. We manually trigger the initial store update here.
    if (this.hasAnyAdvancedValue(seed) || seed.searchTerm) {
      this.store.updateFilters(this.mapToStoreFilter(seed));
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Opens the FilterPanel bottom sheet pre-populated with the current form state.
   *
   * Handles three dismissal outcomes:
   * - Object result: user clicked Apply — patch the form with the returned values.
   * - `'reset'` string: user clicked Reset — clear all advanced filters.
   * - `undefined`: user closed via backdrop or Escape — no state change.
   *
   * WHY PATCH NOT SET: patchValue merges the returned values into the existing
   * form rather than replacing it. This means searchTerm is preserved even if
   * the FilterPanel does not include a search field.
   */
  openFilters(): void {
    const sheetRef = this.bottomSheet.open(FilterPanel, {
      data: this.form.value as PolicyFilterFormValue,
      panelClass: 'filter-panel-sheet',
      ariaLabel: 'Advanced policy filters',
    });

    // WHY takeUntilDestroyed HERE: If the host component is destroyed while the
    // sheet is open (e.g. route navigation), the subscription must be cleaned up
    // to avoid calling into a destroyed component's methods.
    sheetRef
      .afterDismissed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: PolicyFilterFormValue | 'reset' | undefined) => {
        if (result === 'reset') {
          this.clearAllFilters();
        } else if (result !== null && result !== undefined && typeof result === 'object') {
          this.form.patchValue(result);
        }
        // undefined → backdrop/Escape dismiss → no state change required
      });
  }

  /**
   * Resets a single filter chip's corresponding form control to its default value.
   *
   * WHY PATCH FORM NOT STORE DIRECTLY: Patching the form triggers the immediate
   * valueChanges subscription which calls store.updateFilters() — the store update
   * is a side-effect of the form update, not the primary action. This maintains
   * the form as the single source of truth for filter UI state.
   *
   * @param key - The form control key to reset (e.g. 'status', 'minPremium').
   */
  removeFilter(key: string): void {
    this.form.patchValue({
      [key]: FILTER_DEFAULTS[key as keyof PolicyFilterFormValue],
    });
  }

  /**
   * Resets all advanced filter controls to their defaults.
   *
   * WHY ADVANCED ONLY (searchTerm preserved): "Clear all" on the chip strip
   * should clear the chips visible there — only advanced filter chips appear in
   * the strip. The search field has its own clear button (×) in the input.
   */
  clearAllFilters(): void {
    this.form.patchValue({
      status: FILTER_DEFAULTS.status,
      region: FILTER_DEFAULTS.region,
      lineOfBusiness: FILTER_DEFAULTS.lineOfBusiness,
      startDate: FILTER_DEFAULTS.startDate,
      endDate: FILTER_DEFAULTS.endDate,
      expiryStartDate: FILTER_DEFAULTS.expiryStartDate,
      expiryEndDate: FILTER_DEFAULTS.expiryEndDate,
      minPremium: FILTER_DEFAULTS.minPremium,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Maps the form value shape to the PolicyFilter shape expected by the store.
   *
   * WHY THIS MAPPING EXISTS: The form uses single-value controls for status/
   * region/LOB (for simplicity and chip-per-filter UX). PolicyFilter uses arrays
   * for these fields to support future multi-select. The mapping wraps singles
   * in one-element arrays and strips null/empty values to `undefined` so the
   * store's `hasFilters` early-exit works correctly.
   */
  private mapToStoreFilter(val: PolicyFilterFormValue): Partial<PolicyFilterModel> {
    return {
      search: val.searchTerm || undefined,
      statuses: val.status ? [val.status] : undefined,
      regions: val.region ? [val.region] : undefined,
      linesOfBusiness: val.lineOfBusiness ? [val.lineOfBusiness] : undefined,
      effectiveDateFrom: val.startDate
        ? this.toIsoDate(val.startDate)
        : undefined,
      effectiveDateTo: val.endDate
        ? this.toIsoDate(val.endDate)
        : undefined,
      expiryDateFrom: val.expiryStartDate
        ? this.toIsoDate(val.expiryStartDate)
        : undefined,
      expiryDateTo: val.expiryEndDate
        ? this.toIsoDate(val.expiryEndDate)
        : undefined,
      premiumMin: (val.minPremium ?? 0) > 0 ? val.minPremium : undefined,
    };
  }

  /**
   * Navigates the current route with the form values as query params.
   * Uses `replaceUrl: true` so the filter interaction doesn't spam the browser
   * history — the user should be able to press Back once to leave the dashboard,
   * not wade through dozens of filter states.
   */
  private syncUrl(val: PolicyFilterFormValue): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: val.searchTerm || null,
        status: val.status || null,
        region: val.region || null,
        lob: val.lineOfBusiness || null,
        startDate: val.startDate ? this.toIsoDate(val.startDate) : null,
        endDate: val.endDate ? this.toIsoDate(val.endDate) : null,
        expiryStartDate: val.expiryStartDate ? this.toIsoDate(val.expiryStartDate) : null,
        expiryEndDate: val.expiryEndDate ? this.toIsoDate(val.expiryEndDate) : null,
        minPremium: (val.minPremium ?? 0) > 0 ? val.minPremium : null,
      },
      replaceUrl: true,
      // WHY MERGE: Preserves query params set by other route participants
      // (e.g. a future tab/view selector param) without wiping them.
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Converts a Date object or ISO string to a YYYY-MM-DD ISO date string.
   *
   * @param date - A Date object or an existing ISO string.
   * @returns `'YYYY-MM-DD'` string, or empty string if conversion fails.
   */
  private toIsoDate(date: Date | string | null): string {
    if (!date) return '';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }

  /**
   * Formats a date value for display in a filter chip label.
   *
   * @param date - Date object or ISO string.
   * @returns Formatted string, e.g. "01 Jun 2025".
   */
  private formatChipDate(date: Date | string | null): string {
    if (!date) return '';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return String(date);
    }
  }

  /**
   * Returns true if any advanced filter field (excluding searchTerm) has a
   * non-default value, so the initial store update is only triggered when needed.
   */
  private hasAnyAdvancedValue(val: PolicyFilterFormValue): boolean {
    return !!(
      val.status ||
      val.region ||
      val.lineOfBusiness ||
      val.startDate ||
      val.endDate ||
      val.expiryStartDate ||
      val.expiryEndDate ||
      (val.minPremium ?? 0) > 0
    );
  }
}
