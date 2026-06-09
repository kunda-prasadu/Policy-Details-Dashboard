/**
 * @fileoverview Unit tests for FilterPanel bottom-sheet component.
 *
 * DECISION: MAT_BOTTOM_SHEET_DATA is provided with a full PolicyFilterFormValue
 * to test form seeding. MatBottomSheetRef is spied on to capture dismiss calls
 * without opening an actual overlay.
 *
 * WHY NO_ERRORS_SCHEMA: FilterPanel imports Material datepicker, select, and
 * form modules. Schema suppresses template errors for components not needed
 * in logic-focused tests.
 */

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';
import { provideZonelessChangeDetection, NO_ERRORS_SCHEMA } from '@angular/core';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { provideAnimations } from '@angular/platform-browser/animations';

import { FilterPanel } from './filter-panel';
import { PolicyFilterFormValue } from '../policy-filter/policy-filter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_DATA: PolicyFilterFormValue = {
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

const SEEDED_DATA: PolicyFilterFormValue = {
  searchTerm: 'Acme',
  status: 'Active',
  region: 'Japan',
  lineOfBusiness: 'Marine',
  startDate: '2026-01-01',
  endDate: '2026-03-01',
  expiryStartDate: '2026-04-01',
  expiryEndDate: '2026-06-01',
  minPremium: 50_000,
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('FilterPanel', () => {
  let fixture: ComponentFixture<FilterPanel>;
  let component: FilterPanel;
  let sheetRefSpy: jasmine.SpyObj<MatBottomSheetRef<FilterPanel, PolicyFilterFormValue | 'reset'>>;

  function buildFixture(data: PolicyFilterFormValue): Promise<void> {
    sheetRefSpy = jasmine.createSpyObj<MatBottomSheetRef<FilterPanel, PolicyFilterFormValue | 'reset'>>(
      'MatBottomSheetRef',
      ['dismiss'],
    );

    return TestBed.configureTestingModule({
      imports: [FilterPanel],
      providers: [
        provideZonelessChangeDetection(),
        provideAnimations(),
        { provide: MAT_BOTTOM_SHEET_DATA, useValue: data },
        { provide: MatBottomSheetRef, useValue: sheetRefSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .compileComponents()
      .then(() => {
        fixture = TestBed.createComponent(FilterPanel);
        component = fixture.componentInstance;
        fixture.detectChanges();
      });
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create the component', async () => {
    await buildFixture(EMPTY_DATA);
    expect(component).toBeTruthy();
  });

  it('form should be seeded with status from injected data', async () => {
    await buildFixture(SEEDED_DATA);
    expect(component.form.get('status')?.value).toBe('Active');
  });

  it('form should be seeded with region from injected data', async () => {
    await buildFixture(SEEDED_DATA);
    expect(component.form.get('region')?.value).toBe('Japan');
  });

  it('form should be seeded with lineOfBusiness from injected data', async () => {
    await buildFixture(SEEDED_DATA);
    expect(component.form.get('lineOfBusiness')?.value).toBe('Marine');
  });

  it('form should be seeded with minPremium from injected data', async () => {
    await buildFixture(SEEDED_DATA);
    expect(component.form.get('minPremium')?.value).toBe(50_000);
  });

  it('form should be seeded with expiry date range from injected data', async () => {
    await buildFixture(SEEDED_DATA);
    expect(component.form.get('expiryStartDate')?.value).toBe('2026-04-01');
    expect(component.form.get('expiryEndDate')?.value).toBe('2026-06-01');
  });

  it('form fields should be null/0 when empty data is injected', async () => {
    await buildFixture(EMPTY_DATA);
    expect(component.form.get('status')?.value).toBeNull();
    expect(component.form.get('minPremium')?.value).toBe(0);
  });

  it('apply() should dismiss the sheet with the current form value', async () => {
    await buildFixture(SEEDED_DATA);
    component.apply();
    expect(sheetRefSpy.dismiss).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ status: 'Active' }),
    );
  });

  it('apply() should dismiss with the complete form value object', async () => {
    await buildFixture(SEEDED_DATA);
    component.form.patchValue({ region: 'Singapore' });
    component.apply();

    const [arg] = sheetRefSpy.dismiss.calls.mostRecent().args;
    expect((arg as PolicyFilterFormValue).region).toBe('Singapore');
  });

  it('reset() should dismiss the sheet with the string "reset"', async () => {
    await buildFixture(EMPTY_DATA);
    component.reset();
    expect(sheetRefSpy.dismiss).toHaveBeenCalledOnceWith('reset');
  });

  it('POLICY_STATUSES should be exposed for template select options', async () => {
    await buildFixture(EMPTY_DATA);
    expect(component['POLICY_STATUSES'].length).toBeGreaterThan(0);
  });

  it('REGIONS should be exposed for template select options', async () => {
    await buildFixture(EMPTY_DATA);
    expect(component['REGIONS'].length).toBeGreaterThan(0);
  });
});
