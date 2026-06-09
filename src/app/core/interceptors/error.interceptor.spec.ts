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
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import {
  errorInterceptor,
  normaliseHttpError,
  NormalisedHttpError,
} from './error.interceptor';

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

// ---------------------------------------------------------------------------
// normaliseHttpError — pure function, one assertion per status branch
// ---------------------------------------------------------------------------

describe('normaliseHttpError', () => {
  /** Build an HttpErrorResponse for a given status (+ optional error body). */
  function errorAt(status: number, error?: unknown): HttpErrorResponse {
    return new HttpErrorResponse({
      status,
      statusText: 'X',
      url: '/api/policies',
      error,
    });
  }

  it('status 0 → connectivity message', () => {
    const r = normaliseHttpError(errorAt(0));
    expect(r.status).toBe(0);
    expect(r.message).toContain('connect');
    expect(r.url).toBe('/api/policies');
    expect(r.timestamp).toBeTruthy();
  });

  it('status 503 → generic server-error message (no internals leaked)', () => {
    const r = normaliseHttpError(errorAt(503, { message: 'stack trace here' }));
    expect(r.message).toContain('server error');
    expect(r.message).not.toContain('stack trace');
  });

  it('status 404 → not found', () => {
    expect(normaliseHttpError(errorAt(404)).message).toContain('not found');
  });

  it('status 403 → permission denied', () => {
    expect(normaliseHttpError(errorAt(403)).message).toContain('permission');
  });

  it('status 401 → session expired', () => {
    expect(normaliseHttpError(errorAt(401)).message).toContain('session');
  });

  it('status 400 with a server message → surfaces the server message', () => {
    const r = normaliseHttpError(errorAt(400, { message: 'Field X is invalid' }));
    expect(r.message).toBe('Field X is invalid');
  });

  it('status 400 without a structured message → generic bad-request fallback', () => {
    const r = normaliseHttpError(errorAt(400, 'plain-string-body'));
    expect(r.message).toContain('Bad request');
  });

  it('unhandled 4xx (e.g. 418) → catch-all message with the status', () => {
    expect(normaliseHttpError(errorAt(418)).message).toContain('418');
  });
});
