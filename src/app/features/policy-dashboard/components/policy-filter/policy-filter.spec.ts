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

import { PolicyFilter } from './policy-filter';
import { PolicyStore } from '../../store/policy.store';
import { PolicyApiService } from '../../services/policy-api.service';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PolicyFilter', () => {
  let fixture: ComponentFixture<PolicyFilter>;
  let component: PolicyFilter;
  let store: PolicyStore;
  let apiSpy: jasmine.SpyObj<PolicyApiService>;

  const fakeRoute = {
    snapshot: { queryParams: {} },
  };

  const fakeRouter = {
    navigate: jasmine.createSpy('navigate'),
  };

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj<PolicyApiService>('PolicyApiService', [
      'getAll', 'patch', 'flagPolicy', 'flagPolicies',
    ]);
    apiSpy.getAll.and.returnValue(of([]));

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
    store = TestBed.inject(PolicyStore);
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
      minPremium: 10000,
    });

    (component as unknown as { clearAllFilters: () => void }).clearAllFilters();

    expect(component.form.get('status')?.value).toBeNull();
    expect(component.form.get('region')?.value).toBeNull();
    expect(component.form.get('lineOfBusiness')?.value).toBeNull();
    expect(component.form.get('minPremium')?.value).toBe(0);
  });
});
