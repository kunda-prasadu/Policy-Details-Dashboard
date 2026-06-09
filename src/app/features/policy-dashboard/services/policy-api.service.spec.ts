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
});
