/**
 * @fileoverview Unit tests for BulkActionBar component.
 *
 * DECISION: Real PolicyStore is used; MatSnackBar is spied on to prevent
 * actual overlay creation in the test environment.
 * WHY SPY ON SNACKBAR: MatSnackBar opens a CDK overlay which requires a full
 * browser-like environment. Spying on `open()` lets us verify it was called
 * with the correct message without rendering the overlay.
 */

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';
import { provideZonelessChangeDetection, NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';

import { BulkActionBar } from './bulk-action-bar';
import { PolicyStore } from '../../store/policy.store';
import { PolicyApiService } from '../../services/policy-api.service';
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

describe('BulkActionBar', () => {
  let fixture: ComponentFixture<BulkActionBar>;
  let component: BulkActionBar;
  let store: PolicyStore;
  let apiSpy: jasmine.SpyObj<PolicyApiService>;
  let openSnackBarSpy: jasmine.Spy;

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj<PolicyApiService>('PolicyApiService', [
      'getAll', 'patch', 'flagPolicy', 'flagPolicies',
    ]);
    apiSpy.getAll.and.returnValue(of([]));
    apiSpy.flagPolicies.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [BulkActionBar],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PolicyStore,
        { provide: PolicyApiService, useValue: apiSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BulkActionBar);
    component = fixture.componentInstance;
    store = TestBed.inject(PolicyStore);
    const snackBar = (component as unknown as { snackBar: MatSnackBar }).snackBar;
    openSnackBarSpy = spyOn(snackBar, 'open').and.stub();
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('flagForReview() should call store.flagSelectedPolicies()', () => {
    const p = makePolicy({ id: 'b1' });
    apiSpy.getAll.and.returnValue(of([p]));
    apiSpy.flagPolicies.and.returnValue(of([{ ...p, flaggedForReview: true }]));

    store.loadPolicies();
    store.selectAll(['b1']);
    spyOn(store, 'flagSelectedPolicies').and.callThrough();

    component.flagForReview();

    expect(store.flagSelectedPolicies).toHaveBeenCalledTimes(1);
  });

  it('flagForReview() should open snackbar with singular message for 1 policy', () => {
    const p = makePolicy({ id: 'b2' });
    apiSpy.getAll.and.returnValue(of([p]));
    apiSpy.flagPolicies.and.returnValue(of([{ ...p, flaggedForReview: true }]));

    store.loadPolicies();
    store.selectAll(['b2']);

    component.flagForReview();

    expect(openSnackBarSpy).toHaveBeenCalledWith(
      '1 policy flagged for review',
      'Dismiss',
      jasmine.any(Object),
    );
  });

  it('flagForReview() should open snackbar with plural message for multiple policies', () => {
    const p1 = makePolicy({ id: 'b3' });
    const p2 = makePolicy({ id: 'b4' });
    apiSpy.getAll.and.returnValue(of([p1, p2]));
    apiSpy.flagPolicies.and.returnValue(of([
      { ...p1, flaggedForReview: true },
      { ...p2, flaggedForReview: true },
    ]));

    store.loadPolicies();
    store.selectAll(['b3', 'b4']);

    component.flagForReview();

    expect(openSnackBarSpy).toHaveBeenCalledWith(
      '2 policies flagged for review',
      'Dismiss',
      jasmine.any(Object),
    );
  });

  it('flagForReview() should show Retry snackbar and invoke store retry on action when flagging fails', () => {
    const p = makePolicy({ id: 'b5' });
    apiSpy.getAll.and.returnValue(of([p]));
    apiSpy.flagPolicies.and.returnValue(throwError(() => new Error('flag failed')));

    store.loadPolicies();
    store.selectAll(['b5']);
    spyOn(store, 'retryLastFailedFlag').and.callThrough();

    const action$ = new Subject<void>();
    openSnackBarSpy.and.returnValue({
      onAction: () => action$.asObservable(),
    } as never);

    component.flagForReview();

    expect(openSnackBarSpy).toHaveBeenCalledWith(
      'Flag for review failed for 1 policy',
      'Retry',
      jasmine.any(Object),
    );
    action$.next();
    expect(store.retryLastFailedFlag).toHaveBeenCalled();
  });
});
