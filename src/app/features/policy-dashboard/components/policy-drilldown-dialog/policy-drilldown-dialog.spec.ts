/**
 * @fileoverview Unit tests for PolicyDrilldownDialog component.
 *
 * DECISION: MAT_DIALOG_DATA is provided directly; MatDialogRef is spied on.
 * Real PolicyStore is used to avoid signal graph breakage.
 * WHY NO_ERRORS_SCHEMA: Dialog imports many Material modules; schema suppresses
 * unknown-element errors so tests focus on logic and computed signal values.
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
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { of } from 'rxjs';

import {
  PolicyDrilldownDialog,
  DrilldownDialogData,
} from './policy-drilldown-dialog';
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
    expiryDate: '2030-01-01',
    underwriter: 'Alice',
    flaggedForReview: false,
    ...overrides,
  };
}

/**
 * Creates a ComponentFixture with the given dialog data.
 * Resets TestBed before each call so multiple modes can be tested.
 */
async function createDialogFixture(
  data: DrilldownDialogData,
  apiSpy: jasmine.SpyObj<PolicyApiService>,
): Promise<ComponentFixture<PolicyDrilldownDialog>> {
  const dialogRefSpy = jasmine.createSpyObj<MatDialogRef<PolicyDrilldownDialog>>(
    'MatDialogRef',
    ['close'],
  );

  TestBed.configureTestingModule({
    imports: [PolicyDrilldownDialog],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      PolicyStore,
      { provide: PolicyApiService, useValue: apiSpy },
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRefSpy },
      { provide: LOCALE_ID, useValue: 'en-US' },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  });

  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(PolicyDrilldownDialog);
  fixture.detectChanges();
  return fixture;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PolicyDrilldownDialog', () => {
  let apiSpy: jasmine.SpyObj<PolicyApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<PolicyApiService>('PolicyApiService', [
      'getAll', 'getSummary', 'patch', 'flagPolicy', 'flagPolicies',
    ]);
    apiSpy.getAll.and.returnValue(pageOf([]));
    apiSpy.getSummary.and.returnValue(summaryOf());
  });

  afterEach(() => {
    // WHY NO resetTestingModule(): Angular 20's default teardown
    // ({ destroyAfterEach: true }) resets TestBed automatically between tests.
    // Calling resetTestingModule() explicitly destroys the zone.js ProxyZone
    // that fakeAsync relies on, breaking subsequent tests. Angular handles
    // cleanup; manual reset is redundant and harmful.
  });

  // -------------------------------------------------------------------------
  // Detail mode — policy fields
  // -------------------------------------------------------------------------

  describe('detail mode', () => {
    const samplePolicy = makePolicy({ id: 'det-1', policyHolderName: 'Beta Ltd' });

    it('should create the dialog', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: samplePolicy },
        apiSpy,
      );
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('detailPolicy computed should expose the injected policy', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: samplePolicy },
        apiSpy,
      );
      const component = fixture.componentInstance;
      expect(component.detailPolicy()?.policyHolderName).toBe('Beta Ltd');
    });

    it('detailPolicy should live-update from store after renew', async () => {
      // WHY NO tick(): of() emits synchronously — store operations resolve
      // immediately without needing fake timer flush.
      const expired = makePolicy({ id: 'det-2', status: 'Expired' });
      apiSpy.getAll.and.returnValue(pageOf([expired]));
      apiSpy.patch.and.returnValue(of({ ...expired, status: 'Active' }));

      const fixture = await createDialogFixture(
        { mode: 'detail', policy: expired },
        apiSpy,
      );
      const store = TestBed.inject(PolicyStore);
      store.loadPolicies();

      const component = fixture.componentInstance;
      store.renewPolicy('det-2');

      expect(component.detailPolicy()?.status).toBe('Active');
    });

    it('dialogTitle should be the policy number in detail mode', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: samplePolicy },
        apiSpy,
      );
      expect((fixture.componentInstance as unknown as { dialogTitle: () => string }).dialogTitle()).toBe('POL-000001');
    });

    it('listPolicies should be empty in detail mode', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: samplePolicy },
        apiSpy,
      );
      expect(fixture.componentInstance.listPolicies()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Status mode — list display
  // -------------------------------------------------------------------------

  describe('status mode', () => {
    it('should create the dialog in status mode', async () => {
      const fixture = await createDialogFixture(
        { mode: 'status', status: 'Active' },
        apiSpy,
      );
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('listPolicies should fetch the status-filtered set from the API', async () => {
      // The dialog issues its OWN server-side request scoped to the status; the
      // server returns only matching records (no client-side filtering).
      const active = makePolicy({ id: 'a1', status: 'Active' });
      apiSpy.getAll.and.returnValue(pageOf([active]));

      const fixture = await createDialogFixture(
        { mode: 'status', status: 'Active' },
        apiSpy,
      );

      // getAll was called with a filter narrowed to the Active status.
      const filterArg = apiSpy.getAll.calls.mostRecent().args[0];
      expect(filterArg?.statuses).toEqual(['Active']);
      expect(fixture.componentInstance.listPolicies().length).toBe(1);
      expect(fixture.componentInstance.listPolicies()[0].id).toBe('a1');
    });

    it('dialogTitle should be "Active Policies" for status mode', async () => {
      const fixture = await createDialogFixture(
        { mode: 'status', status: 'Active' },
        apiSpy,
      );
      expect((fixture.componentInstance as unknown as { dialogTitle: () => string }).dialogTitle()).toBe('Active Policies');
    });
  });

  // -------------------------------------------------------------------------
  // daysLabel helper
  // -------------------------------------------------------------------------

  describe('daysLabel()', () => {
    it('should return Xd left for a date within 30 days', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: makePolicy() },
        apiSpy,
      );
      const component = fixture.componentInstance;
      const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const label = (component as unknown as { daysLabel: (d: string) => string })
        .daysLabel(soon);
      expect(label).toMatch(/^\d+d left$/);
    });

    it('should return empty string for a date > 30 days away', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: makePolicy() },
        apiSpy,
      );
      const component = fixture.componentInstance;
      const far = '2030-12-31';
      const label = (component as unknown as { daysLabel: (d: string) => string })
        .daysLabel(far);
      expect(label).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // urgencyClass helper
  // -------------------------------------------------------------------------

  describe('urgencyClass()', () => {
    it('should return "critical" for dates ≤ 7 days away', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: makePolicy() },
        apiSpy,
      );
      const component = fixture.componentInstance;
      const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const cls = (component as unknown as { urgencyClass: (d: string) => string })
        .urgencyClass(inFiveDays);
      expect(cls).toBe('critical');
    });

    it('should return "high" for dates 8–15 days away', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: makePolicy() },
        apiSpy,
      );
      const component = fixture.componentInstance;
      const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const cls = (component as unknown as { urgencyClass: (d: string) => string })
        .urgencyClass(inTenDays);
      expect(cls).toBe('high');
    });

    it('should return "low" for dates 16–30 days away', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: makePolicy() },
        apiSpy,
      );
      const component = fixture.componentInstance;
      const inTwentyDays = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const cls = (component as unknown as { urgencyClass: (d: string) => string })
        .urgencyClass(inTwentyDays);
      expect(cls).toBe('low');
    });

    it('should return empty string for dates > 30 days away', async () => {
      const fixture = await createDialogFixture(
        { mode: 'detail', policy: makePolicy() },
        apiSpy,
      );
      const component = fixture.componentInstance;
      const cls = (component as unknown as { urgencyClass: (d: string) => string })
        .urgencyClass('2035-01-01');
      expect(cls).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // renew() — adds to renewingIds
  // -------------------------------------------------------------------------

  describe('renew()', () => {
    it('should add policy id to renewingIds immediately', async () => {
      const p = makePolicy({ id: 'ren-1' });
      apiSpy.patch.and.returnValue(of({ ...p, status: 'Active' }));
      apiSpy.getAll.and.returnValue(pageOf([p]));

      const fixture = await createDialogFixture(
        { mode: 'detail', policy: p },
        apiSpy,
      );
      const component = fixture.componentInstance;
      component.renew('ren-1');

      expect(component.renewingIds().has('ren-1')).toBeTrue();
    });

    it('should remove id from renewingIds after 1500ms', async () => {
      const p = makePolicy({ id: 'ren-2' });
      apiSpy.patch.and.returnValue(of({ ...p, status: 'Active' }));
      apiSpy.getAll.and.returnValue(pageOf([p]));

      const fixture = await createDialogFixture(
        { mode: 'detail', policy: p },
        apiSpy,
      );
      const component = fixture.componentInstance;

      // WHY jasmine.clock(): The 1500ms removal uses a real setTimeout.
      // jasmine.clock() replaces the browser timer so tick() can advance
      // time synchronously without waiting for a real 1.5s delay.
      jasmine.clock().install();
      component.renew('ren-2');
      jasmine.clock().tick(1500);
      jasmine.clock().uninstall();

      expect(component.renewingIds().has('ren-2')).toBeFalse();
    });

    it('should call store.renewPolicy with the given id', async () => {
      const p = makePolicy({ id: 'ren-3' });
      apiSpy.getAll.and.returnValue(pageOf([p]));
      apiSpy.patch.and.returnValue(of({ ...p, status: 'Active' }));

      const fixture = await createDialogFixture(
        { mode: 'detail', policy: p },
        apiSpy,
      );
      const store = TestBed.inject(PolicyStore);
      spyOn(store, 'renewPolicy').and.callThrough();

      fixture.componentInstance.renew('ren-3');

      expect(store.renewPolicy).toHaveBeenCalledWith('ren-3');
    });
  });

  // -------------------------------------------------------------------------
  // expiring mode
  // -------------------------------------------------------------------------

  describe('expiring mode', () => {
    it('should create in expiring mode', async () => {
      const fixture = await createDialogFixture({ mode: 'expiring' }, apiSpy);
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('should request the expiring window (Active + next 30 days) server-side', async () => {
      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const active = makePolicy({ id: 'exp1', status: 'Active', expiryDate: soon });
      // The server returns the already-filtered expiring set.
      apiSpy.getAll.and.returnValue(pageOf([active]));

      const fixture = await createDialogFixture({ mode: 'expiring' }, apiSpy);

      // The dialog narrowed the request to Active status with an expiry-date window.
      const filterArg = apiSpy.getAll.calls.mostRecent().args[0];
      expect(filterArg?.statuses).toEqual(['Active']);
      expect(filterArg?.expiryDateFrom).toBeTruthy();
      expect(filterArg?.expiryDateTo).toBeTruthy();
      expect(fixture.componentInstance.listPolicies().length).toBe(1);
      expect(fixture.componentInstance.listPolicies()[0].id).toBe('exp1');
    });

    it('dialogTitle should be "Expiring Within 30 Days" for expiring mode', async () => {
      const fixture = await createDialogFixture({ mode: 'expiring' }, apiSpy);
      expect((fixture.componentInstance as unknown as { dialogTitle: () => string }).dialogTitle()).toBe('Expiring Within 30 Days');
    });
  });
});
