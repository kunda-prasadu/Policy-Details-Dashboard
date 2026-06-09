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
import { Observable, of, throwError } from 'rxjs';

import { PolicyStore } from './policy.store';
import { PolicyApiService } from '../services/policy-api.service';
import { PolicyPage } from '../models/pagination.model';
import { Policy } from '../models/policy.model';
import { pageOf, summaryOf } from '../testing/policy-test-utils';

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
      'getSummary',
      'patch',
      'flagPolicy',
      'flagPolicies',
    ]);
    apiSpy.getAll.and.returnValue(pageOf([]));
    apiSpy.getSummary.and.returnValue(summaryOf());

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
      apiSpy.getAll.and.returnValue(
        new Observable<PolicyPage<Policy>>(() => { /* never completes */ }),
      );

      // Act
      store.loadPolicies();

      // Assert: loading should be true immediately after calling loadPolicies
      expect(store.loading()).toBeTrue();
    });

    it('should populate policies + total signals on successful API response', () => {
      const policies = [makePolicy({ id: '1' }), makePolicy({ id: '2' })];
      // total deliberately larger than the page to assert it is the server count.
      apiSpy.getAll.and.returnValue(pageOf(policies, 57));

      store.loadPolicies();

      expect(store.policies()).toEqual(policies);
      expect(store.total()).toBe(57);
      expect(store.loading()).toBeFalse();
    });

    it('should clear selection after a successful load', () => {
      apiSpy.getAll.and.returnValue(pageOf([makePolicy()]));
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

    it('should call loadPolicies() when filters are updated', () => {
      store.updateFilters({ search: 'Acme' });

      expect(apiSpy.getAll).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // summary counts
  // -------------------------------------------------------------------------

  describe('summary (server-computed)', () => {
    it('should populate the summary signal from the getSummary() response', () => {
      apiSpy.getSummary.and.returnValue(
        summaryOf({
          active: 2,
          pending: 1,
          expired: 1,
          cancelled: 1,
          totalPremium: 1500,
          expiringWithin30Days: 3,
          gwpByLob: { Property: 1000 },
        }),
      );

      store.loadPolicies();

      const s = store.summary();
      expect(s.active).toBe(2);
      expect(s.pending).toBe(1);
      expect(s.expired).toBe(1);
      expect(s.cancelled).toBe(1);
      expect(s.totalPremium).toBe(1500);
      expect(s.expiringWithin30Days).toBe(3);
      expect(s.gwpByLob).toEqual({ Property: 1000 });
    });

    it('should request the summary with the active filters', () => {
      store.updateFilters({ statuses: ['Active'], regions: ['Japan'] });

      expect(apiSpy.getSummary).toHaveBeenCalledWith(
        jasmine.objectContaining({ statuses: ['Active'], regions: ['Japan'] }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Server-side data: page + total + filter/sort/pagination delegation
  // -------------------------------------------------------------------------

  describe('server-side data flow', () => {
    it('should expose the server page as policies() and the count as total()', () => {
      const page = [makePolicy({ id: '1' }), makePolicy({ id: '2' })];
      apiSpy.getAll.and.returnValue(pageOf(page, 240));

      store.loadPolicies();

      expect(store.policies().length).toBe(2);
      expect(store.total()).toBe(240);
    });

    it('should pass the active filters to the API (server-side filtering)', () => {
      store.updateFilters({ search: 'Acme', statuses: ['Pending'] });

      expect(apiSpy.getAll).toHaveBeenCalledWith(
        jasmine.objectContaining({ search: 'Acme', statuses: ['Pending'] }),
        jasmine.anything(),
        jasmine.anything(),
      );
    });

    it('updateFilters should reset pagination to the first page', () => {
      store.setPage(3, 25);
      store.updateFilters({ search: 'x' });

      expect(store.pagination().pageIndex).toBe(0);
      expect(store.pagination().pageSize).toBe(25);
    });

    it('setPage should update pagination and reload with the new page request', () => {
      apiSpy.getAll.calls.reset();
      store.setPage(2, 50);

      expect(store.pagination()).toEqual({ pageIndex: 2, pageSize: 50 });
      expect(apiSpy.getAll).toHaveBeenCalledWith(
        jasmine.anything(),
        jasmine.anything(),
        { pageIndex: 2, pageSize: 50 },
      );
    });

    it('setPage should be a no-op when page index and size are unchanged', () => {
      store.setPage(2, 50);
      apiSpy.getAll.calls.reset();
      store.setPage(2, 50);

      expect(apiSpy.getAll).not.toHaveBeenCalled();
    });

    it('updateSort should reset to first page and reload', () => {
      store.setPage(4, 10);
      apiSpy.getAll.calls.reset();
      store.updateSort({ active: 'premiumAmount', direction: 'desc' });

      expect(store.pagination().pageIndex).toBe(0);
      expect(apiSpy.getAll).toHaveBeenCalledWith(
        jasmine.anything(),
        { active: 'premiumAmount', direction: 'desc' },
        jasmine.anything(),
      );
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
    it('should call flagPolicies API with selected IDs', () => {
      const p1 = makePolicy({ id: 'p1' });
      const p2 = makePolicy({ id: 'p2' });
      apiSpy.getAll.and.returnValue(pageOf([p1, p2]));
      apiSpy.flagPolicies.and.returnValue(of([
        { ...p1, flaggedForReview: true },
        { ...p2, flaggedForReview: true },
      ]));

      store.loadPolicies();
      store.selectAll(['p1', 'p2']);
      store.flagSelectedPolicies();

      expect(apiSpy.flagPolicies).toHaveBeenCalledWith(['p1', 'p2']);
    });

    it('should clear selection after successful flag', () => {
      const p = makePolicy({ id: 'p1' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.flagPolicies.and.returnValue(of([{ ...p, flaggedForReview: true }]));

      store.loadPolicies();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();

      expect(store.selectedPolicyIds()).toEqual([]);
    });

    it('should roll back optimistic update on API failure', () => {
      const p = makePolicy({ id: 'p1', flaggedForReview: false });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.flagPolicies.and.returnValue(throwError(() => new Error('patch failed')));

      store.loadPolicies();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();

      // After rollback, the policy should be back to flaggedForReview: false
      const rolled = store.policies().find((x) => x.id === 'p1');
      expect(rolled?.flaggedForReview).toBeFalse();
    });

    it('should set error signal on flag failure', () => {
      const p = makePolicy({ id: 'p1' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.flagPolicies.and.returnValue(throwError(() => ({ message: 'Flag failed' })));

      store.loadPolicies();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();

      expect(store.error()).toBeTruthy();
    });

    it('should store failed IDs for explicit retry on flag failure', () => {
      const p = makePolicy({ id: 'p1' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.flagPolicies.and.returnValue(throwError(() => ({ message: 'Flag failed' })));

      store.loadPolicies();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();

      expect(store.lastFailedFlagIds()).toEqual(['p1']);
    });

    it('retryLastFailedFlag() should no-op when there are no failed IDs', () => {
      store.retryLastFailedFlag();
      expect(apiSpy.flagPolicies).not.toHaveBeenCalled();
    });

    it('retryLastFailedFlag() should re-dispatch flagSelectedPolicies for failed IDs', () => {
      const p = makePolicy({ id: 'p1' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.flagPolicies.and.returnValue(throwError(() => ({ message: 'Flag failed' })));

      store.loadPolicies();
      store.selectAll(['p1']);
      store.flagSelectedPolicies();

      apiSpy.flagPolicies.calls.reset();
      apiSpy.flagPolicies.and.returnValue(of([{ ...p, flaggedForReview: true }]));
      store.retryLastFailedFlag();

      expect(apiSpy.flagPolicies).toHaveBeenCalledWith(['p1']);
    });

    it('should be a no-op when selection is empty', () => {
      store.clearSelection();
      store.flagSelectedPolicies();

      expect(apiSpy.flagPolicies).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // renewPolicy
  // -------------------------------------------------------------------------

  describe('renewPolicy()', () => {
    it('should call patch API with status Active', () => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.patch.and.returnValue(of({ ...p, status: 'Active' }));

      store.loadPolicies();
      store.renewPolicy('r1');

      expect(apiSpy.patch).toHaveBeenCalledWith('r1', { status: 'Active' });
    });

    it('should update policy status in store on success', () => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.patch.and.returnValue(of({ ...p, status: 'Active' }));

      store.loadPolicies();
      store.renewPolicy('r1');

      const updated = store.policies().find((x) => x.id === 'r1');
      expect(updated?.status).toBe('Active');
    });

    it('should roll back status on renew failure', () => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.patch.and.returnValue(throwError(() => new Error('renew failed')));

      store.loadPolicies();
      store.renewPolicy('r1');

      const rolled = store.policies().find((x) => x.id === 'r1');
      expect(rolled?.status).toBe('Expired');
    });

    it('should set error signal on renew failure', () => {
      const p = makePolicy({ id: 'r1', status: 'Expired' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.patch.and.returnValue(throwError(() => ({ message: 'Renew failed' })));

      store.loadPolicies();
      store.renewPolicy('r1');

      expect(store.error()).toBeTruthy();
    });
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

