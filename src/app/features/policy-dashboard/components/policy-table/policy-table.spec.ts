/**
 * @fileoverview Unit tests for PolicyTable component.
 *
 * DECISION: Uses real PolicyStore (not a spy) to avoid signal graph breakage.
 * PolicyApiService is spied on to prevent real HTTP calls.
 * WHY NO_ERRORS_SCHEMA: PolicyTable imports many Angular Material modules;
 * using NO_ERRORS_SCHEMA avoids registering all of them while keeping the
 * test focused on component logic, not template rendering. For tests that
 * verify DOM output, individual Material modules are imported instead.
 */

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';
import {
  provideZonelessChangeDetection,
  LOCALE_ID,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { PolicyTable } from './policy-table';
import { PolicyStore } from '../../store/policy.store';
import { PolicyApiService } from '../../services/policy-api.service';
import { pageOf, summaryOf } from '../../testing/policy-test-utils';
import { Policy } from '../../models/policy.model';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'p1',
    policyNumber: 'POL-000001',
    policyHolderName: 'Acme Corp',
    lineOfBusiness: 'Property',
    status: 'Active',
    region: 'Singapore',
    premiumAmount: 100_000,
    currency: 'SGD',
    effectiveDate: '2025-01-01',
    expiryDate: '2026-01-01',
    underwriter: 'Alice',
    flaggedForReview: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PolicyTable', () => {
  let fixture: ComponentFixture<PolicyTable>;
  let component: PolicyTable;
  let store: PolicyStore;
  let apiSpy: jasmine.SpyObj<PolicyApiService>;

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj<PolicyApiService>('PolicyApiService', [
      'getAll', 'getSummary', 'patch', 'flagPolicy', 'flagPolicies',
    ]);
    apiSpy.getAll.and.returnValue(pageOf([]));
    apiSpy.getSummary.and.returnValue(summaryOf());

    await TestBed.configureTestingModule({
      imports: [PolicyTable],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PolicyStore,
        { provide: PolicyApiService, useValue: apiSpy },
        // WHY en-US: Fixes getCurrencySymbol locale errors in test runner
        { provide: LOCALE_ID, useValue: 'en-US' },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyTable);
    component = fixture.componentInstance;
    store = TestBed.inject(PolicyStore);
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // formatPremium — SGD
  // -------------------------------------------------------------------------

  it('formatPremium() should format 1,200,000 as compact M notation', () => {
    // WHY: getCurrencySymbol returns locale-specific narrow symbol — in en-US
    // both SGD and AUD map to '$'. Test the numeric format, not the symbol.
    const result = (component as unknown as { formatPremium: (v: number, c: string) => string })
      .formatPremium(1_200_000, 'SGD');
    expect(result).toContain('1.2M');
  });

  // -------------------------------------------------------------------------
  // formatPremium — JPY
  // -------------------------------------------------------------------------

  it('formatPremium() should format JPY 500,000 as compact K format', () => {
    const result = (component as unknown as { formatPremium: (v: number, c: string) => string })
      .formatPremium(500_000, 'JPY');
    expect(result).toContain('500K');
  });

  // -------------------------------------------------------------------------
  // formatPremium — AUD value below 1000
  // -------------------------------------------------------------------------

  it('formatPremium() should format AUD 800 as raw locale number without K or M', () => {
    const result = (component as unknown as { formatPremium: (v: number, c: string) => string })
      .formatPremium(800, 'AUD');
    // 800 < 1000 so no K or M suffix
    expect(result).toContain('800');
    expect(result).not.toContain('M');
    expect(result).not.toContain('K');
  });

  // -------------------------------------------------------------------------
  // toggleSelectAll — selects page IDs when none are selected
  // -------------------------------------------------------------------------

  it('toggleSelectAll() should select all page IDs when none are selected', () => {
    const policies = [
      makePolicy({ id: 'a' }),
      makePolicy({ id: 'b' }),
      makePolicy({ id: 'c' }),
    ];
    apiSpy.getAll.and.returnValue(pageOf(policies));
    store.loadPolicies();
    fixture.detectChanges();

    // Trigger toggleSelectAll via the protected method (cast for testing)
    (component as unknown as { toggleSelectAll: () => void }).toggleSelectAll();

    expect(store.selectedPolicyIds()).toContain('a');
    expect(store.selectedPolicyIds()).toContain('b');
    expect(store.selectedPolicyIds()).toContain('c');
  });

  // -------------------------------------------------------------------------
  // toggleSelectAll — clears when all are selected
  // -------------------------------------------------------------------------

  it('toggleSelectAll() should clear selection when all page items are already selected', () => {
    const policies = [makePolicy({ id: 'a' }), makePolicy({ id: 'b' })];
    apiSpy.getAll.and.returnValue(pageOf(policies));
    store.loadPolicies();
    fixture.detectChanges();

    // Select all first
    store.selectAll(['a', 'b']);

    // Now toggle should clear
    (component as unknown as { toggleSelectAll: () => void }).toggleSelectAll();

    expect(store.selectedPolicyIds()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // dataSource
  // -------------------------------------------------------------------------

  it('dataSource should update when the store page (store.policies) changes', () => {
    const policies = [makePolicy({ id: 'x' }), makePolicy({ id: 'y' })];
    apiSpy.getAll.and.returnValue(pageOf(policies));
    store.loadPolicies();
    fixture.detectChanges();

    expect(component.dataSource.data.length).toBe(2);
  });
});
