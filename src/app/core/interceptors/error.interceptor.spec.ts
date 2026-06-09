/**
 * @fileoverview Unit tests for the errorInterceptor functional interceptor.
 *
 * DECISION: Uses HttpClientTestingModule + provideHttpClient(withInterceptors([errorInterceptor]))
 * to test the interceptor in a real HTTP pipeline rather than calling it as a pure function.
 * This validates that the interceptor is correctly wired, not just that its logic is correct.
 *
 * WHY TEST VIA REAL HTTP PIPELINE: Functional interceptors are stateless pure functions but
 * they are wired into Angular's HttpClient via DI. Testing via a real (mocked) HTTP request
 * guarantees the interceptor registration is correct, which a unit test of the pure function
 * alone would not verify.
 */

import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { errorInterceptor, NormalisedHttpError } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should pass through a successful 200 response unchanged', (done) => {
    const mockData = { id: 1, name: 'test' };

    http.get('/api/test').subscribe({
      next: (data) => {
        expect(data).toEqual(mockData);
        done();
      },
      error: () => {
        fail('Expected success but got error');
        done();
      },
    });

    httpMock.expectOne('/api/test').flush(mockData);
  });

  it('should normalise an HTTP 500 error into a NormalisedHttpError with safe message', (done) => {
    http.get('/api/policies').subscribe({
      next: () => {
        fail('Expected error but got success');
        done();
      },
      error: (err: NormalisedHttpError) => {
        // WHY: 5xx messages must never expose server internals (OWASP A05)
        expect(err.status).toBe(500);
        expect(err.message).toContain('server error');
        expect(err.timestamp).toBeTruthy();
        done();
      },
    });

    httpMock.expectOne('/api/policies').flush(
      { message: 'Internal error details — must not reach UI' },
      { status: 500, statusText: 'Internal Server Error' },
    );
  });

  it('should normalise a network error (status 0) with a connectivity message', (done) => {
    http.get('/api/policies').subscribe({
      next: () => {
        fail('Expected error but got success');
        done();
      },
      error: (err: NormalisedHttpError) => {
        expect(err.status).toBe(0);
        expect(err.message).toContain('connect');
        done();
      },
    });

    const req = httpMock.expectOne('/api/policies');
    // Simulate a network error (status 0, no response body)
    req.error(new ProgressEvent('error'));
  });
});
