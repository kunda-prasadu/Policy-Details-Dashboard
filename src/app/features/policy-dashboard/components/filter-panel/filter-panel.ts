// DECISION: FilterPanel is a standalone bottom-sheet content component.
// ALTERNATIVES CONSIDERED:
//   1. A full-screen dialog (MatDialog) for advanced filters.
//   2. An inline collapsible panel in the main layout.
// REASON: A bottom sheet is the Material 3 pattern for contextual actions on
//         mobile/tablet — it slides up from the bottom without obscuring the
//         main content entirely. On desktop it renders as a persistent panel
//         anchored to the bottom edge. It is dismissible via swipe, backdrop
//         click, or the explicit Apply/Reset buttons, providing multiple exit
//         paths for all interaction modes (mouse, keyboard, touch).

// DECISION: FilterPanel owns its own FormGroup seeded from MAT_BOTTOM_SHEET_DATA.
// ALTERNATIVES CONSIDERED: Bind directly to the parent PolicyFilter's FormGroup.
// REASON: The bottom sheet is rendered in an Angular CDK Overlay — it is not in
//         the parent's component tree. Sharing the parent's FormGroup would
//         require a service bridge or EventEmitter and complicate change detection
//         across the overlay boundary. An independent FormGroup that returns its
//         value on dismiss is simpler, decoupled, and easier to test in isolation.

import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';

import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { LINES_OF_BUSINESS, POLICY_STATUSES, REGIONS } from '../../constants/policy.constants';
import { PolicyFilterFormValue } from '../policy-filter/policy-filter';

/**
 * FilterPanel bottom sheet component.
 *
 * Provides the full advanced filter form opened from PolicyFilter via MatBottomSheet.
 *
 * Dismissal contract:
 * - `apply()` dismisses with the current form value (`PolicyFilterFormValue` shape).
 * - `reset()` dismisses with the string `'reset'` — the parent interprets this
 *   as a signal to clear all advanced filters.
 * - Backdrop / Escape / swipe-down dismisses with `undefined` — the parent
 *   interprets this as "no change".
 *
 * WHY THIS DISMISSAL PROTOCOL: Using typed return values from `MatBottomSheetRef`
 * avoids an event/service bridge between the overlay and the parent. The parent
 * (PolicyFilter.openFilters()) handles all three outcomes in one place.
 */
@Component({
  selector: 'app-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-panel.html',
  styleUrl: './filter-panel.scss',
  // WHY provideNativeDateAdapter IN providers: MatDatepicker requires a date
  // adapter to be provided. In standalone components, providing it here scopes
  // it to this component's injector, avoiding the need to import MatNativeDateModule
  // globally. Native Date adapter (vs moment.js) is sufficient — we don't need
  // any moment.js formatting features for simple date pickers.
  providers: [provideNativeDateAdapter()],
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
  ],
})
export class FilterPanel {
  // ---------------------------------------------------------------------------
  // Injected dependencies
  // ---------------------------------------------------------------------------

  /**
   * Current filter values passed from PolicyFilter when the sheet is opened.
   * Used to seed the form so the panel shows the user's last applied state.
   */
  private readonly data = inject<PolicyFilterFormValue>(MAT_BOTTOM_SHEET_DATA);

  /** Reference to the bottom sheet, used to dismiss with a typed result. */
  private readonly sheetRef = inject<MatBottomSheetRef<FilterPanel, PolicyFilterFormValue | 'reset'>>(
    MatBottomSheetRef,
  );

  private readonly fb = inject(FormBuilder);

  // ---------------------------------------------------------------------------
  // Form — seeded from injected data
  // ---------------------------------------------------------------------------

  /**
   * Advanced filter form, pre-populated from the data passed on open.
   *
   * WHY SEED FROM INJECTED DATA NOT FROM THE STORE: The store holds a
   * PolicyFilter (server/client filter model) while the form holds a
   * PolicyFilterFormValue (UI form model with Date objects and single-value
   * selects). Reading from the injected data avoids a round-trip conversion
   * and ensures the panel shows exactly what was visible in the chip strip
   * before the sheet was opened.
   */
  readonly form: FormGroup = this.fb.group({
    status: [this.data?.status ?? null],
    region: [this.data?.region ?? null],
    lineOfBusiness: [this.data?.lineOfBusiness ?? null],
    startDate: [this.data?.startDate ?? null],
    endDate: [this.data?.endDate ?? null],
    minPremium: [this.data?.minPremium ?? 0],
  });

  // ---------------------------------------------------------------------------
  // Template-facing constants
  // ---------------------------------------------------------------------------

  /** Policy status options for the Status select. */
  protected readonly POLICY_STATUSES = POLICY_STATUSES;

  /** APAC region options for the Region select. */
  protected readonly REGIONS = REGIONS;

  /** Lines of business for the LOB select. */
  protected readonly LINES_OF_BUSINESS = LINES_OF_BUSINESS;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Applies the form's current values by dismissing the sheet with them.
   *
   * PolicyFilter.openFilters() patches its form with the returned object, which
   * triggers the valueChanges → store.updateFilters() chain.
   *
   * WHY DISMISS NOT EMIT: Dismissing with data is the idiomatic MatBottomSheet
   * communication pattern. It keeps the FilterPanel decoupled from PolicyFilter
   * — no @Output, no shared service, no direct reference.
   */
  apply(): void {
    this.sheetRef.dismiss(this.form.value as PolicyFilterFormValue);
  }

  /**
   * Signals the parent to clear all advanced filters by dismissing with `'reset'`.
   *
   * WHY A STRING SENTINEL NOT null/undefined: `undefined` already means
   * "dismissed without a decision" (backdrop click). `null` is ambiguous.
   * The string `'reset'` is unambiguous and type-safe — the parent's switch
   * on the result handles it explicitly.
   */
  reset(): void {
    this.sheetRef.dismiss('reset');
  }
}
