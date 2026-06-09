/**
 * @fileoverview Unit tests for PolicyStore — signal-based state store.
 *
 * WHY REAL STORE (not spy): Signal graphs break with jasmine.createSpyObj because
 * computed() nodes depend on the actual signal identity, not a spy's return value.
 * All tests use a real PolicyStore instance with a spy on PolicyApiService calls.
 *
 * DECISION: TestBed with provideZonelessChangeDetection() on every test.
 * REASON: The store runs in a zoneless Angular 20 app; TestBed defaults to zone-based
 * change detection which causes signal effects and computeds to behave differently.
 */

import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { PolicyStore } from './policy.store';
import { PolicyApiService } from '../services/policy-api.service';
import { Policy } from '../models/policy.model';

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Policy stub for testing.
 * WHY THIS APPROACH: A factory function with overrides avoids repetitive object
 * literals across all tests while keeping each test's intent visible via the
 * spread override object.
 */
function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'test-id-1',
    policyNumber: 'POL-000001',
    policyHolderName: 'Acme Corp',
    lineOfBusiness: 'Property',
    status: 'Active',
    region: 'Singapore',
    premiumAmount: 100_000,
    currency: 'SGD',
    effectiveDate: '2025-01-01',
    expiryDate: '2026-01-01',
    underwriter: 'Alice Tan',
    flaggedForReview: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PolicyStore', () => {
  let store: PolicyStore;
  let apiSpy: jasmine.SpyObj<PolicyApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<PolicyApiService>('PolicyApiService', [
      'getAll',
      'patch',
      'flagPolicy',
      'flagPolicies',
    ]);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PolicyStore,
        { provide: PolicyApiService, useValue: apiSpy },
      ],
    });

    store = TestBed.inject(PolicyStore);
  });

  // -------------------------------------------------------------------------
  // loadPolicies
  // -------------------------------------------------------------------------

  describe('loadPolicies()', () => {
    it('should set loading to true during in-flight request', () => {
      // WHY Observable never completes: simulates an in-flight HTTP request so
      // we can assert the intermediate loading=true state synchronously before
      // the observable ever emits. No fakeAsync needed — _loading.set(true) runs
      // synchronously inside loadPolicies() before the subscribe callback.
      const { Observable } = require('rxjs');
      apiSpy.getAll.and.returnValue(
        new Observable<Policy[]>(() => { /* never completes */ }),
      );

      // Act
      store.loadPolicies();

      // Assert: loading should be true immediately after calling loadPolicies
      expect(store.loading()).toBeTrue();
    });

    it('should populate policies signal on successful API response', () => {
      const policies = [makePolicy({ id: '1' }), makePolicy({ id: '2' })];
      apiSpy.getAll.and.returnValue(of(policies));

      store.loadPolicies();

      expect(store.policies()).toEqual(policies);
      expect(store.loading()).toBeFalse();
    });

    it('should clear selection after a successful load', () => {
      apiSpy.getAll.and.returnValue(of([makePolicy()]));
      store.selectAll(['test-id-1']);

      store.loadPolicies();

      expect(store.selectedPolicyIds()).toEqual([]);
    });

    it('should set error signal on API failure', () => {
      apiSpy.getAll.and.returnValue(
        throwError(() => ({ message: 'Network error', status: 0 })),
      );

      store.loadPolicies();

      expect(store.error()).toBeTruthy();
      expect(store.loading()).toBeFalse();
    });

    it('should set loading to false on API failure', () => {
      apiSpy.getAll.and.returnValue(throwError(() => new Error('fail')));

      store.loadPolicies();

      expect(store.loading()).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // updateFilters
  // -------------------------------------------------------------------------

  describe('updateFilters()', () => {
    it('should merge patch into existing filters', () => {
      store.updateFilters({ search: 'Acme' });
      store.updateFilters({ statuses: ['Active'] });

      // Both fields should be present simultaneously
      expect(store.filters().search).toBe('Acme');
      expect(store.filters().statuses).toEqual(['Active']);
    });

    it('should clear selection when filters change', () => {
      store.selectAll(['id-1', 'id-2']);
      store.updateFilters({ search: 'test' });

      expect(store.selectedPolicyIds()).toEqual([]);
    });

    it('should NOT call loadPolicies() when filters are updated', fakeAsync(() => {
      // WHY: updateFilters is client-side only; reload only on sort change
      store.updateFilters({ search: 'Acme' });
      tick();

      expect(apiSpy.getAll).not.toHaveBeenCalled();
    }));
  });

  // -------------------------------------------------------------------------
  // summary counts
  // -------------------------------------------------------------------------

  describe('summary computed', () => {
    beforeEach(fakeAsync(() => {
      const policies: Policy[] = [
        makePolicy({ id: '1', status: 'Active', premiumAmount: 100 }),
        makePolicy({ id: '2', status: 'Active', premiumAmount: 200 }),
        makePolicy({ id: '3', status: 'Pending', premiumAmount: 300 }),
        makePolicy({ id: '4', status: 'Expired', premiumAmount: 400 }),
        makePolicy({ id: '5', status: 'Cancelled', premiumAmount: 500 }),
      ];
      apiSpy.getAll.and.returnValue(of(policies));
      store.loadPolicies();
      tick();
    }));

    it('should correctly count active policies', () => {
      expect(store.summary().active).toBe(2);
    });

    it('should correctly count pending policies', () => {
      expect(store.summary().pending).toBe(1);
    });

    it('should correctly count expired policies', () => {
      expect(store.summary().expired).toBe(1);
    });

    it('should correctly count cancelled policies', () => {
      expect(store.summary().cancelled).toBe(1);
    });

    it('should sum totalPremium across all filtered policies', () => {
      expect(store.summary().totalPremium).toBe(1500);
    });

    it('should count expiringWithin30Days for Active policies only', fakeAsync(() => {
      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const expired = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      apiSpy.getAll.and.returnValue(of([
        makePolicy({ id: 'a', status: 'Active', expiryDate: soon }),
        makePolicy({ id: 'b', status: 'Expired', expiryDate: soon }), // not active
        makePolicy({ id: 'c', status: 'Active', expiryDate: expired }), // past
      ]));
      store.loadPolicies();
      tick();

      expect(store.summary().expiringWithin30Days).toBe(1);
    }));
  });

  // -------------------------------------------------------------------------
  // filteredPolicies
  // -------------------------------------------------------------------------

  describe('filteredPolicies computed', () => {
    const policies: Policy[] = [
      makePolicy({ id: '1', policyHolderName: 'Acme Corp', status: 'Active', region: 'Singapore' }),
      makePolicy({ id: '2', policyHolderName: 'Beta Ltd', status: 'Pending', region: 'Japan' }),
      makePolicy({ id: '3', policyHolderName: 'Gamma Inc', status: 'Active', region: 'Australia' }),
    ];

    beforeEach(fakeAsync(() => {
      apiSpy.getAll.and.returnValue(of(policies));
      store.loadPolicies();
      tick();
    }));

    it('should return all policies when no filters are active', () => {
      expect(store.filteredPolicies().length).toBe(3);
    });

    it('should filter by free-text search on policyHolderName', () => {
      store.updateFilters({ search: 'Acme' });
      expect(store.filteredPolicies().length).toBe(1);
      expect(store.filteredPolicies()[0].id).toBe('1');
    });

    it('should filter by status array', () => {
      store.updateFilters({ statuses: ['Pending'] });
      expect(store.filteredPolicies().length).toBe(1);
      expect(store.filteredPolicies()[0].status).toBe('Pending');
    });

    it('should filter by region array', () => {
      store.updateFilters({ regions: ['Japan'] });
      expect(store.filteredPolicies().length).toBe(1);
      expect(store.filteredPolicies()[0].region).toBe('Japan');
    });

    it('should return empty array when no matches for search', () => {
      store.updateFilters({ search: 'nonexistent-xyz' });
      expect(store.filteredPolicies().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // toggleSelection
  // -------------------------------------------------------------------------

  describe('toggleSelection()', () => {
    it('should add an ID to selection when not already selected', () => {
      store.toggleSelection('id-1');
      expect(store.selectedPolicyIds()).toContain('id-1');
    });

    it('should remove an ID from selection when already selected', () => {
      store.toggleSelection('id-1');
      store.toggleSelection('id-1');
      expect(store.selectedPolicyIds()).not.toContain('id-1');
    });

    it('selectedCount should reflect correct count', () => {
      store.toggleSelection('id-1');
      store.toggleSelection('id-2');
      expect(store.selectedCount()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // selectAll / clearSelection
  // -------------------------------------------------------------------------

  describe('selectAll() and clearSelection()', () => {
    it('should replace selection with provided IDs', () => {
      store.selectAll(['a', 'b', 'c']);
      expect(store.selectedPolicyIds()).toEqual(['a', 'b', 'c']);
    });

    it('should deduplicate IDs in selectAll', () => {
      store.selectAll(['a', 'a', 'b']);
      expect(store.selectedPolicyIds().filter((id) => id === 'a').length).toBe(1);
    });

    it('should set hasSelection to true after selectAll', () => {
      store.selectAll(['x']);
      expect(store.hasSelection()).toBeTrue();
    });

    it('should clear all selections on clearSelection()', () => {
      store.selectAll(['a', 'b']);
      store.clearSelection();
      expect(store.selectedPolicyIds()).toEqual([]);
    });

    it('should set hasSelection to false after clearSelection()', () => {
      store.selectAll(['x']);
      store.clearSelection();
      expect(store.hasSelection()).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // flagSelectedPolicies
  // -------------------------------------------------------------------------

  describe('flagSelectedPolicies()', () => {
    it('should call flagPolicies API with selected IDs', fakeAsync(() => {
      const p1 = makePolicy({ id: 'p1' });
      const p2 = makePolicy({ id: 'p2' });
      apiSpy.getAll.and.returnValue(of([p1, p2]));
      apiSpy.flagPolicies.and.returnValue(of([
        { ...p1, flaggedForReview: true },
        { ...p2, flaggedForReview: true },
      ]));

      store.loadPolicies();
      tick();
      store.selectAll(['p1', 'p2']);
      store.flagSelectedPolicies();
      tick();

      expect(apiSpy.flagPolicies).toHaveBeenCalledWith(['p1', 'p2']);
    }));

    it('should clear selection after successful flag', fakeAsync(() => {
      const p = makePolicy({ id: 'p1' });
      apiSpy.getAll.and.returnValue(of([p]));
      apiSpy.flagPolicies.and.returnValue(of([{ ...p, flaggedForReview: true }]));

      store.loadPolicies();
      tick();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();
      tick();

      expect(store.selectedPolicyIds()).toEqual([]);
    }));

    it('should roll back optimistic update on API failure', fakeAsync(() => {
      const p = makePolicy({ id: 'p1', flaggedForReview: false });
      apiSpy.getAll.and.returnValue(of([p]));
      apiSpy.flagPolicies.and.returnValue(throwError(() => new Error('patch failed')));

      store.loadPolicies();
      tick();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();
      tick();

      // After rollback, the policy should be back to flaggedForReview: false
      const rolled = store.policies().find((x) => x.id === 'p1');
      expect(rolled?.flaggedForReview).toBeFalse();
    }));

    it('should set error signal on flag failure', fakeAsync(() => {
      const p = makePolicy({ id: 'p1' });
      apiSpy.getAll.and.returnValue(of([p]));
      apiSpy.flagPolicies.and.returnValue(throwError(() => ({ message: 'Flag failed' })));

      store.loadPolicies();
      tick();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();
      tick();

      expect(store.error()).toBeTruthy();
    }));

    it('should be a no-op when selection is empty', fakeAsync(() => {
      store.clearSelection();
      store.flagSelectedPolicies();
      tick();

      expect(apiSpy.flagPolicies).not.toHaveBeenCalled();
    }));
  });

  // -------------------------------------------------------------------------
  // renewPolicy
  // -------------------------------------------------------------------------

  describe('renewPolicy()', () => {
    it('should call patch API with status Active', fakeAsync(() => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(of([p]));
      apiSpy.patch.and.returnValue(of({ ...p, status: 'Active' }));

      store.loadPolicies();
      tick();
      store.renewPolicy('r1');
      tick();

      expect(apiSpy.patch).toHaveBeenCalledWith('r1', { status: 'Active' });
    }));

    it('should update policy status in store on success', fakeAsync(() => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(of([p]));
      apiSpy.patch.and.returnValue(of({ ...p, status: 'Active' }));

      store.loadPolicies();
      tick();
      store.renewPolicy('r1');
      tick();

      const updated = store.policies().find((x) => x.id === 'r1');
      expect(updated?.status).toBe('Active');
    }));

    it('should roll back status on renew failure', fakeAsync(() => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(of([p]));
      apiSpy.patch.and.returnValue(throwError(() => new Error('renew failed')));

      store.loadPolicies();
      tick();
      store.renewPolicy('r1');
      tick();

      const rolled = store.policies().find((x) => x.id === 'r1');
      expect(rolled?.status).toBe('Expired');
    }));

    it('should set error signal on renew failure', fakeAsync(() => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(of([p]));
      apiSpy.patch.and.returnValue(throwError(() => ({ message: 'Renew failed' })));

      store.loadPolicies();
      tick();
      store.renewPolicy('r1');
      tick();

      expect(store.error()).toBeTruthy();
    }));
  });

  // -------------------------------------------------------------------------
  // clearFilters
  // -------------------------------------------------------------------------

  describe('clearFilters()', () => {
    it('should reset all filters to empty object', () => {
      store.updateFilters({ search: 'test', statuses: ['Active'] });
      store.clearFilters();

      expect(store.filters()).toEqual({});
    });

    it('should clear selection on clearFilters', () => {
      store.selectAll(['x', 'y']);
      store.clearFilters();

      expect(store.selectedPolicyIds()).toEqual([]);
    });
  });
});
