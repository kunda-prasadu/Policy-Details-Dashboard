/**
 * @fileoverview Unit tests for PolicyApiService — HTTP adapter for /policies resource.
 *
 * DECISION: Uses HttpClientTestingModule to intercept HTTP requests without
 * making real network calls. Tests verify the correct URL, params, and HTTP
 * verb are used for each operation.
 */

import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { PolicyApiService } from './policy-api.service';
import { Policy } from '../models/policy.model';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BASE_URL = `${environment.apiUrl}/policies`;

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'pol-1',
    policyNumber: 'POL-000001',
    policyHolderName: 'Acme Corp',
    lineOfBusiness: 'Property',
    status: 'Active',
    region: 'Singapore',
    premiumAmount: 50_000,
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

describe('PolicyApiService', () => {
  let service: PolicyApiService;
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        PolicyApiService,
      ],
    });

    service = TestBed.inject(PolicyApiService);
    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    // Verifies that no unexpected HTTP requests were made during the test.
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // getAll — response envelope
  // -------------------------------------------------------------------------

  it('getAll() should GET the policies endpoint and return the { data, total } envelope', () => {
    const page = { data: [makePolicy()], total: 123 };

    service.getAll().subscribe((result) => {
      expect(result).toEqual(page);
    });

    const req = httpMock.expectOne((r) => r.url === BASE_URL);
    expect(req.request.method).toBe('GET');
    req.flush(page);
  });

  // -------------------------------------------------------------------------
  // getAll — pagination
  // -------------------------------------------------------------------------

  it('getAll() should map zero-based pageIndex to 1-based page + pageSize params', () => {
    service.getAll(undefined, undefined, { pageIndex: 2, pageSize: 25 }).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === BASE_URL &&
        r.params.get('page') === '3' &&
        r.params.get('pageSize') === '25',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: [], total: 0 });
  });

  // -------------------------------------------------------------------------
  // getAll — filters
  // -------------------------------------------------------------------------

  it('getAll() should add a single ?status= param', () => {
    service.getAll({ statuses: ['Active'] }).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === BASE_URL && r.params.get('status') === 'Active',
    );
    req.flush({ data: [], total: 0 });
  });

  it('getAll() with desc sort should send sort + order params', () => {
    service
      .getAll(undefined, { active: 'premiumAmount', direction: 'desc' })
      .subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === BASE_URL &&
        r.params.get('sort') === 'premiumAmount' &&
        r.params.get('order') === 'desc',
    );
    req.flush({ data: [], total: 0 });
  });

  it('getAll() with asc sort should send order=asc', () => {
    service
      .getAll(undefined, { active: 'expiryDate', direction: 'asc' })
      .subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === BASE_URL &&
        r.params.get('sort') === 'expiryDate' &&
        r.params.get('order') === 'asc',
    );
    req.flush({ data: [], total: 0 });
  });

  it('getAll() with search should map to a single OR-search param (no ANDed _like params)', () => {
    service.getAll({ search: 'Acme' }).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === BASE_URL &&
        r.params.get('search') === 'Acme' &&
        r.params.get('policyNumber_like') === null,
    );
    req.flush({ data: [], total: 0 });
  });

  it('getAll() with multi-value filters should append repeated params', () => {
    service.getAll({ statuses: ['Active', 'Pending'], regions: ['Japan', 'Singapore'] }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      JSON.stringify(r.params.getAll('status')) === JSON.stringify(['Active', 'Pending']) &&
      JSON.stringify(r.params.getAll('region')) === JSON.stringify(['Japan', 'Singapore']),
    );
    req.flush({ data: [], total: 0 });
  });

  it('getAll() should include lineOfBusiness and currency repeated params', () => {
    service.getAll({ linesOfBusiness: ['Marine', 'Property'], currencies: ['USD', 'SGD'] }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      JSON.stringify(r.params.getAll('lineOfBusiness')) === JSON.stringify(['Marine', 'Property']) &&
      JSON.stringify(r.params.getAll('currency')) === JSON.stringify(['USD', 'SGD']),
    );
    req.flush({ data: [], total: 0 });
  });

  it('getAll() should map flaggedForReview and premium range params', () => {
    service.getAll({ flaggedForReview: true, premiumMin: 1000, premiumMax: 9000 }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      r.params.get('flaggedForReview') === 'true' &&
      r.params.get('premiumMin') === '1000' &&
      r.params.get('premiumMax') === '9000',
    );
    req.flush({ data: [], total: 0 });
  });

  it('getAll() with effective and expiry ranges should map date bound params', () => {
    service.getAll({
      effectiveDateFrom: '2026-01-01',
      effectiveDateTo: '2026-03-31',
      expiryDateFrom: '2026-04-01',
      expiryDateTo: '2026-12-31',
    }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      r.params.get('effectiveDateFrom') === '2026-01-01' &&
      r.params.get('effectiveDateTo') === '2026-03-31' &&
      r.params.get('expiryDateFrom') === '2026-04-01' &&
      r.params.get('expiryDateTo') === '2026-12-31',
    );
    req.flush({ data: [], total: 0 });
  });

  // -------------------------------------------------------------------------
  // getSummary
  // -------------------------------------------------------------------------

  it('getSummary() should GET /policies/summary with the filter params and return aggregates', () => {
    const summary = {
      active: 5, pending: 2, expired: 1, cancelled: 0,
      totalPremium: 9999, expiringWithin30Days: 3, gwpByLob: { Marine: 9999 },
    };

    service.getSummary({ statuses: ['Active'] }).subscribe((result) => {
      expect(result).toEqual(summary);
    });

    const req = httpMock.expectOne(
      (r) => r.url === `${BASE_URL}/summary` && r.params.get('status') === 'Active',
    );
    expect(req.request.method).toBe('GET');
    req.flush(summary);
  });

  it('getSummary() should NOT send pagination or sort params', () => {
    service.getSummary({ search: 'x' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${BASE_URL}/summary`);
    expect(req.request.params.get('page')).toBeNull();
    expect(req.request.params.get('pageSize')).toBeNull();
    expect(req.request.params.get('sort')).toBeNull();
    req.flush({
      active: 0, pending: 0, expired: 0, cancelled: 0,
      totalPremium: 0, expiringWithin30Days: 0, gwpByLob: {},
    });
  });

  // -------------------------------------------------------------------------
  // patch — flag
  // -------------------------------------------------------------------------

  it('flagPolicy() should PATCH the policy with flaggedForReview: true', () => {
    const updated = makePolicy({ flaggedForReview: true });

    service.flagPolicy('pol-1').subscribe((result) => {
      expect(result.flaggedForReview).toBeTrue();
    });

    const req = httpMock.expectOne(`${BASE_URL}/pol-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ flaggedForReview: true });
    req.flush(updated);
  });

  // -------------------------------------------------------------------------
  // patch — renew
  // -------------------------------------------------------------------------

  it('patch() should PATCH the policy with the provided partial changes', () => {
    const updated = makePolicy({ status: 'Active' });

    service.patch('pol-1', { status: 'Active' }).subscribe((result) => {
      expect(result.status).toBe('Active');
    });

    const req = httpMock.expectOne(`${BASE_URL}/pol-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Active' });
    req.flush(updated);
  });

  it('patch() should fallback to default message when thrown error is not an Error', () => {
    spyOn(httpClient, 'patch').and.returnValue(
      // Force non-Error branch in catchError
      new Observable<Policy>((subscriber) => {
        subscriber.error('raw-non-error');
      }),
    );

    let captured: Error | undefined;
    service.patch('pol-x', { status: 'Active' }).subscribe({
      error: (err: Error) => {
        captured = err;
      },
    });

    expect(captured).toBeTruthy();
    expect(captured?.message).toBe('Failed to patch policy pol-x');
  });

  it('flagPolicies([]) should complete with empty array', () => {
    let result: Policy[] | undefined;

    service.flagPolicies([]).subscribe((policies) => {
      result = policies;
    });

    expect(result).toEqual([]);
  });
});
