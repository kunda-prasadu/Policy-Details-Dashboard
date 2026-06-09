/**
 * @fileoverview Unit tests for SummaryPanel component.
 *
 * DECISION: Real PolicyStore is used; MatDialog is spied on to prevent
 * actual dialog creation (which requires a full overlay environment).
 * WHY NO_ERRORS_SCHEMA: The panel template uses SVG, MatIcon, and custom
 * directives that are not the focus of these tests.
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
import { MatDialog } from '@angular/material/dialog';

import { SummaryPanel } from './summary-panel';
import { PolicyStore } from '../../store/policy.store';
import { PolicyApiService } from '../../services/policy-api.service';
import { pageOf, summaryOf } from '../../testing/policy-test-utils';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SummaryPanel', () => {
  let fixture: ComponentFixture<SummaryPanel>;
  let component: SummaryPanel;
  let store: PolicyStore;
  let apiSpy: jasmine.SpyObj<PolicyApiService>;
  let openDialogSpy: jasmine.Spy;

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj<PolicyApiService>('PolicyApiService', [
      'getAll', 'getSummary', 'patch', 'flagPolicy', 'flagPolicies',
    ]);
    apiSpy.getAll.and.returnValue(pageOf([]));
    apiSpy.getSummary.and.returnValue(summaryOf());

    await TestBed.configureTestingModule({
      imports: [SummaryPanel],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PolicyStore,
        { provide: PolicyApiService, useValue: apiSpy },
        { provide: LOCALE_ID, useValue: 'en-US' },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SummaryPanel);
    component = fixture.componentInstance;
    store = TestBed.inject(PolicyStore);
    const dialog = (component as unknown as { dialog: MatDialog }).dialog;
    openDialogSpy = spyOn(dialog, 'open').and.returnValue({} as ReturnType<MatDialog['open']>);
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // statusCards — counts
  // -------------------------------------------------------------------------

  describe('statusCards computed', () => {
    beforeEach(() => {
      // Summary is now SERVER-COMPUTED: the panel reads store.summary(), which
      // is populated from the getSummary() response — not derived from the page.
      apiSpy.getSummary.and.returnValue(
        summaryOf({ active: 2, pending: 1, expired: 1, cancelled: 1 }),
      );
      store.loadPolicies();
      fixture.detectChanges();
    });

    it('Active card should show count 2', () => {
      const activeCard = component['statusCards']().find((c) => c.status === 'Active');
      expect(activeCard?.count).toBe(2);
    });

    it('Pending card should show count 1', () => {
      const card = component['statusCards']().find((c) => c.status === 'Pending');
      expect(card?.count).toBe(1);
    });

    it('Expired card should show count 1', () => {
      const card = component['statusCards']().find((c) => c.status === 'Expired');
      expect(card?.count).toBe(1);
    });

    it('Cancelled card should show count 1', () => {
      const card = component['statusCards']().find((c) => c.status === 'Cancelled');
      expect(card?.count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // arcPercent — expiringPct
  // -------------------------------------------------------------------------

  describe('arcPercent computed', () => {
    it('arcPercent should be 0 when there are no active policies', () => {
      // Default store has no policies loaded
      expect(component['arcPercent']()).toBe(0);
    });

    it('arcPercent should be 100 when all active policies expire within 30 days', () => {
      apiSpy.getSummary.and.returnValue(
        summaryOf({ active: 1, expiringWithin30Days: 1 }),
      );
      store.loadPolicies();

      expect(component['arcPercent']()).toBe(100);
    });

    it('arcPercent should be 50 when half of active policies expire within 30 days', () => {
      apiSpy.getSummary.and.returnValue(
        summaryOf({ active: 2, expiringWithin30Days: 1 }),
      );
      store.loadPolicies();

      expect(component['arcPercent']()).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // arcDashOffset
  // -------------------------------------------------------------------------

  describe('arcDashOffset computed', () => {
    it('arcDashOffset should equal ARC_CIRCUMFERENCE when there are no active policies', () => {
      const circ = (component as unknown as { ARC_CIRCUMFERENCE: number }).ARC_CIRCUMFERENCE;
      expect(component['arcDashOffset']()).toBe(circ);
    });

    it('arcDashOffset should be 0 when 100% of active policies are expiring', () => {
      apiSpy.getSummary.and.returnValue(
        summaryOf({ active: 1, expiringWithin30Days: 1 }),
      );
      store.loadPolicies();

      expect(component['arcDashOffset']()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // gwpBars — barPct
  // -------------------------------------------------------------------------

  describe('gwpBars computed', () => {
    beforeEach(() => {
      apiSpy.getSummary.and.returnValue(
        summaryOf({ gwpByLob: { Property: 1_000_000, Marine: 500_000 } }),
      );
      store.loadPolicies();
      fixture.detectChanges();
    });

    it('should produce one bar per line of business', () => {
      expect(component['gwpBars']().length).toBe(2);
    });

    it('the leading LOB bar should have pct = 100', () => {
      const bars = component['gwpBars']();
      const max = bars.reduce((a, b) => (a.gwp > b.gwp ? a : b));
      expect(max.pct).toBe(100);
    });

    it('bars should be sorted in descending GWP order', () => {
      const bars = component['gwpBars']();
      expect(bars[0].gwp).toBeGreaterThanOrEqual(bars[1].gwp);
    });
  });

  // -------------------------------------------------------------------------
  // formatPremiumCompact
  // -------------------------------------------------------------------------

  describe('formatPremiumCompact()', () => {
    it('should format 1,500,000 as "$1.5M"', () => {
      const result = component['formatPremiumCompact'](1_500_000);
      expect(result).toContain('1.5M');
    });

    it('should format 250,000 as "$250K"', () => {
      const result = component['formatPremiumCompact'](250_000);
      expect(result).toContain('250K');
    });
  });

  // -------------------------------------------------------------------------
  // openStatusDrilldown — opens MatDialog
  // -------------------------------------------------------------------------

  describe('openStatusDrilldown()', () => {
    it('should open MatDialog with status mode data', () => {
      component.openStatusDrilldown('Active');
      expect(openDialogSpy).toHaveBeenCalledOnceWith(
        jasmine.any(Function),
        jasmine.objectContaining({
          data: jasmine.objectContaining({ mode: 'status', status: 'Active' }),
        }),
      );
    });

    it('should open for different statuses', () => {
      component.openStatusDrilldown('Expired');
      expect(openDialogSpy).toHaveBeenCalledWith(
        jasmine.any(Function),
        jasmine.objectContaining({
          data: jasmine.objectContaining({ status: 'Expired' }),
        }),
      );
    });
  });
});
