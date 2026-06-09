/**
 * @fileoverview Unit tests for PolicyFilter component.
 *
 * DECISION: Tests use real PolicyStore to avoid signal breakage.
 * Router and ActivatedRoute are provided with minimal stubs because
 * PolicyFilter reads snapshot queryParams on construction and subscribes
 * to valueChanges — neither requires a full RouterTestingModule.
 *
 * WHY FAKE ACTIVATED ROUTE: PolicyFilter reads `this.route.snapshot.queryParams`
 * in its constructor. A fake ActivatedRoute that returns an empty params object
 * is sufficient — the test focus is on filter logic, not routing.
 */

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';
import { provideZonelessChangeDetection, NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { MatBottomSheet } from '@angular/material/bottom-sheet';

import { PolicyFilter } from './policy-filter';
import { PolicyStore } from '../../store/policy.store';
import { PolicyApiService } from '../../services/policy-api.service';
import { pageOf, summaryOf } from '../../testing/policy-test-utils';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PolicyFilter', () => {
  let fixture: ComponentFixture<PolicyFilter>;
  let component: PolicyFilter;
  let apiSpy: jasmine.SpyObj<PolicyApiService>;

  const fakeRoute = {
    snapshot: { queryParams: {} },
  };

  const fakeRouter = {
    navigate: jasmine.createSpy('navigate'),
  };

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj<PolicyApiService>('PolicyApiService', [
      'getAll', 'getSummary', 'patch', 'flagPolicy', 'flagPolicies',
    ]);
    apiSpy.getAll.and.returnValue(pageOf([]));
    apiSpy.getSummary.and.returnValue(summaryOf());

    await TestBed.configureTestingModule({
      imports: [PolicyFilter],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PolicyStore,
        { provide: PolicyApiService, useValue: apiSpy },
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: Router, useValue: fakeRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyFilter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('activeFilterCount should be 0 with default form values', () => {
    expect(component.activeFilterCount()).toBe(0);
  });

  it('activeFilterCount should increment when status filter is set', () => {
    component.form.patchValue({ status: 'Active' });
    expect(component.activeFilterCount()).toBeGreaterThanOrEqual(1);
  });

  it('activeFilterCount should reflect multiple active filters', () => {
    component.form.patchValue({ status: 'Active', region: 'Japan', minPremium: 50000 });
    expect(component.activeFilterCount()).toBe(3);
  });

  it('activeFilterCount should include expiry date range filters', () => {
    component.form.patchValue({ expiryStartDate: '2026-05-01', expiryEndDate: '2026-06-01' });
    expect(component.activeFilterCount()).toBe(2);
  });

  it('removeFilter() should reset a single filter field to its default', () => {
    component.form.patchValue({ status: 'Active', region: 'Japan' });

    // Access protected method via cast for testing
    (component as unknown as { removeFilter: (key: string) => void })
      .removeFilter('status');

    expect(component.form.get('status')?.value).toBeNull();
    // Region should still be set
    expect(component.form.get('region')?.value).toBe('Japan');
  });

  it('clearAllFilters() should reset all advanced form fields', () => {
    component.form.patchValue({
      searchTerm: 'Acme',
      status: 'Active',
      region: 'Japan',
      lineOfBusiness: 'Marine',
      expiryStartDate: '2026-05-01',
      expiryEndDate: '2026-06-01',
      minPremium: 10000,
    });

    (component as unknown as { clearAllFilters: () => void }).clearAllFilters();

    expect(component.form.get('status')?.value).toBeNull();
    expect(component.form.get('region')?.value).toBeNull();
    expect(component.form.get('lineOfBusiness')?.value).toBeNull();
    expect(component.form.get('expiryStartDate')?.value).toBeNull();
    expect(component.form.get('expiryEndDate')?.value).toBeNull();
    expect(component.form.get('minPremium')?.value).toBe(0);
  });

  it('activeFilterChips should include chips for all advanced fields', () => {
    component.form.patchValue({
      status: 'Active',
      region: 'Japan',
      lineOfBusiness: 'Marine',
      startDate: '2026-01-01',
      endDate: '2026-03-01',
      expiryStartDate: '2026-04-01',
      expiryEndDate: '2026-06-01',
      minPremium: 25000,
    });

    const chips = component.activeFilterChips();
    expect(chips.length).toBe(8);
    expect(chips.some((c) => c.key === 'status')).toBeTrue();
    expect(chips.some((c) => c.key === 'region')).toBeTrue();
    expect(chips.some((c) => c.key === 'lineOfBusiness')).toBeTrue();
    expect(chips.some((c) => c.key === 'startDate')).toBeTrue();
    expect(chips.some((c) => c.key === 'endDate')).toBeTrue();
    expect(chips.some((c) => c.key === 'expiryStartDate')).toBeTrue();
    expect(chips.some((c) => c.key === 'expiryEndDate')).toBeTrue();
    expect(chips.some((c) => c.key === 'minPremium')).toBeTrue();
  });

  it('mapToStoreFilter should map single-value form controls and dates correctly', () => {
    const mapped = (
      component as unknown as {
        mapToStoreFilter: (val: {
          searchTerm: string;
          status: 'Active' | null;
          region: 'Japan' | null;
          lineOfBusiness: 'Marine' | null;
          startDate: string | null;
          endDate: string | null;
          expiryStartDate: string | null;
          expiryEndDate: string | null;
          minPremium: number;
        }) => {
          search?: string;
          statuses?: string[];
          regions?: string[];
          linesOfBusiness?: string[];
          effectiveDateFrom?: string;
          effectiveDateTo?: string;
          expiryDateFrom?: string;
          expiryDateTo?: string;
          premiumMin?: number;
        };
      }
    ).mapToStoreFilter({
      searchTerm: 'Acme',
      status: 'Active',
      region: 'Japan',
      lineOfBusiness: 'Marine',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      expiryStartDate: '2026-03-01',
      expiryEndDate: '2026-04-01',
      minPremium: 900,
    });

    expect(mapped.search).toBe('Acme');
    expect(mapped.statuses).toEqual(['Active']);
    expect(mapped.regions).toEqual(['Japan']);
    expect(mapped.linesOfBusiness).toEqual(['Marine']);
    expect(mapped.effectiveDateFrom).toBe('2026-01-01');
    expect(mapped.effectiveDateTo).toBe('2026-02-01');
    expect(mapped.expiryDateFrom).toBe('2026-03-01');
    expect(mapped.expiryDateTo).toBe('2026-04-01');
    expect(mapped.premiumMin).toBe(900);
  });

  it('toIsoDate should return empty string for null and convert Date/string inputs', () => {
    const toIsoDate = (component as unknown as {
      toIsoDate: (date: Date | string | null) => string;
    }).toIsoDate;

    expect(toIsoDate(null)).toBe('');
    expect(toIsoDate('2026-08-09')).toBe('2026-08-09');
    expect(toIsoDate(new Date('2026-09-10T00:00:00.000Z'))).toBe('2026-09-10');
  });

  it('formatChipDate should return empty for null and formatted value for valid date', () => {
    const formatChipDate = (component as unknown as {
      formatChipDate: (date: Date | string | null) => string;
    }).formatChipDate;

    expect(formatChipDate(null)).toBe('');
    expect(formatChipDate('2026-06-01')).toContain('2026');
  });

  it('syncUrl should send mapped query params and null minPremium when zero', () => {
    const host = (component as unknown as {
      syncUrl: (val: {
        searchTerm: string;
        status: string | null;
        region: string | null;
        lineOfBusiness: string | null;
        startDate: string | null;
        endDate: string | null;
        expiryStartDate: string | null;
        expiryEndDate: string | null;
        minPremium: number;
      }) => void;
    });

    host.syncUrl({
      searchTerm: 'Gamma',
      status: 'Pending',
      region: 'Singapore',
      lineOfBusiness: 'Property',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      expiryStartDate: '2026-04-01',
      expiryEndDate: '2026-05-01',
      minPremium: 0,
    });

    expect(fakeRouter.navigate).toHaveBeenCalled();
    const lastCallArgs = fakeRouter.navigate.calls.mostRecent().args;
    expect(lastCallArgs[1].queryParams.q).toBe('Gamma');
    expect(lastCallArgs[1].queryParams.minPremium).toBeNull();
  });

  it('openFilters should clear advanced filters when sheet returns reset', () => {
    const clearSpy = spyOn(component, 'clearAllFilters');
    const bottomSheetSpy = jasmine.createSpyObj<MatBottomSheet>('MatBottomSheet', ['open']);
    bottomSheetSpy.open.and.returnValue({
      afterDismissed: () => of('reset'),
    } as never);
    (component as unknown as { bottomSheet: MatBottomSheet }).bottomSheet = bottomSheetSpy;

    component.openFilters();

    expect(clearSpy).toHaveBeenCalled();
  });

  it('openFilters should patch form when sheet returns an object', () => {
    const patchSpy = spyOn(component.form, 'patchValue').and.callThrough();
    const bottomSheetSpy = jasmine.createSpyObj<MatBottomSheet>('MatBottomSheet', ['open']);
    bottomSheetSpy.open.and.returnValue({
      afterDismissed: () => of({ status: 'Active', region: 'Japan' }),
    } as never);
    (component as unknown as { bottomSheet: MatBottomSheet }).bottomSheet = bottomSheetSpy;

    component.openFilters();

    expect(patchSpy).toHaveBeenCalledWith({ status: 'Active', region: 'Japan' });
  });

  it('openFilters should do nothing when sheet returns undefined', () => {
    const clearSpy = spyOn(component, 'clearAllFilters');
    const patchSpy = spyOn(component.form, 'patchValue').and.callThrough();
    const bottomSheetSpy = jasmine.createSpyObj<MatBottomSheet>('MatBottomSheet', ['open']);
    bottomSheetSpy.open.and.returnValue({
      afterDismissed: () => of(undefined),
    } as never);
    (component as unknown as { bottomSheet: MatBottomSheet }).bottomSheet = bottomSheetSpy;

    component.openFilters();

    expect(clearSpy).not.toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalledWith(jasmine.any(Object));
  });
});
