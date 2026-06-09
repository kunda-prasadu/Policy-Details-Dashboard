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
  // getAll — no params
  // -------------------------------------------------------------------------

  it('getAll() should GET the policies endpoint with _per_page=250', () => {
    const mockPolicies = [makePolicy()];

    service.getAll().subscribe((policies) => {
      expect(policies).toEqual(mockPolicies);
    });

    const req = httpMock.expectOne(
      (r) => r.url === BASE_URL && r.params.get('_per_page') === '250',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockPolicies);
  });

  // -------------------------------------------------------------------------
  // getAll — with status filter
  // -------------------------------------------------------------------------

  it('getAll() with single status filter should add ?status= param', () => {
    service.getAll({ statuses: ['Active'] }).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === BASE_URL && r.params.get('status') === 'Active',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  // -------------------------------------------------------------------------
  // getAll — with sort
  // -------------------------------------------------------------------------

  it('getAll() with desc sort should prefix field with dash in _sort param', () => {
    service
      .getAll(undefined, { active: 'premiumAmount', direction: 'desc' })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === BASE_URL && r.params.get('_sort') === '-premiumAmount',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getAll() with search should map to policyNumber/policyHolderName/underwriter _like params', () => {
    service.getAll({ search: 'Acme' }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      r.params.get('policyNumber_like') === 'Acme' &&
      r.params.get('policyHolderName_like') === 'Acme' &&
      r.params.get('underwriter_like') === 'Acme',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getAll() with multi-value filters should append repeated params', () => {
    service.getAll({ statuses: ['Active', 'Pending'], regions: ['Japan', 'Singapore'] }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      JSON.stringify(r.params.getAll('status')) === JSON.stringify(['Active', 'Pending']) &&
      JSON.stringify(r.params.getAll('region')) === JSON.stringify(['Japan', 'Singapore']),
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getAll() should include lineOfBusiness and currency repeated params', () => {
    service.getAll({ linesOfBusiness: ['Marine', 'Property'], currencies: ['USD', 'SGD'] }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      JSON.stringify(r.params.getAll('lineOfBusiness')) === JSON.stringify(['Marine', 'Property']) &&
      JSON.stringify(r.params.getAll('currency')) === JSON.stringify(['USD', 'SGD']),
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getAll() should map flaggedForReview and premium range params', () => {
    service.getAll({ flaggedForReview: true, premiumMin: 1000, premiumMax: 9000 }).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === BASE_URL &&
      r.params.get('flaggedForReview') === 'true' &&
      r.params.get('premiumAmount_gte') === '1000' &&
      r.params.get('premiumAmount_lte') === '9000',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
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
      r.params.get('effectiveDate_gte') === '2026-01-01' &&
      r.params.get('effectiveDate_lte') === '2026-03-31' &&
      r.params.get('expiryDate_gte') === '2026-04-01' &&
      r.params.get('expiryDate_lte') === '2026-12-31',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getAll() with asc sort should use field name without dash prefix', () => {
    service
      .getAll(undefined, { active: 'expiryDate', direction: 'asc' })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === BASE_URL && r.params.get('_sort') === 'expiryDate',
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
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
