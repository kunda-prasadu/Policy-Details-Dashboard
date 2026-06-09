// DECISION: Functional interceptor (HttpInterceptorFn) rather than a class-based
//           HttpInterceptor.
// ALTERNATIVES CONSIDERED: Class implementing HttpInterceptor with @Injectable.
// REASON: Angular 15+ introduced functional interceptors as the preferred pattern.
//         They are tree-shakeable, require no DI decorator, compose cleanly with
//         provideHttpClient(withInterceptors([...])), and are easier to test in
//         isolation (pure functions vs. class instances). Class-based interceptors
//         are still supported but are the legacy approach as of Angular 20.

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { LoggerService } from '../services/logger.service';

// ---------------------------------------------------------------------------
// Error normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Represents a normalised HTTP error surfaced to the application layer.
 *
 * WHY A DEDICATED TYPE: Raw HttpErrorResponse objects expose Angular internals
 * (headers, url, status text) that are not relevant to UI error display logic.
 * Normalising to a simple { message, status, timestamp } object decouples
 * the UI from the HTTP layer and makes error handling predictable across all
 * feature stores and components.
 */
export interface NormalisedHttpError {
  /** Human-readable error message, safe to display in UI components. */
  readonly message: string;

  /**
   * HTTP status code (e.g. 404, 500), or 0 for network/timeout errors.
   * Drives conditional UI (e.g. "Not found" vs "Server error" vs "Offline").
   */
  readonly status: number;

  /** ISO-8601 timestamp of when the error was intercepted. */
  readonly timestamp: string;

  /**
   * The request URL that produced the error.
   * Used for logging context — NOT for display in the UI.
   */
  readonly url: string | null;
}

/**
 * Converts an HttpErrorResponse into a NormalisedHttpError with a
 * human-readable message safe for UI display.
 *
 * WHY THIS IS A STANDALONE FUNCTION: Pure functions are easier to unit-test
 * and reuse than private methods on a class. The interceptor function calls
 * this directly.
 *
 * @param error - The raw Angular HttpErrorResponse.
 * @returns A NormalisedHttpError ready for consumption by stores and components.
 */
export function normaliseHttpError(error: HttpErrorResponse): NormalisedHttpError {
  let message: string;

  if (error.status === 0) {
    // status 0 means the request never reached the server:
    // - Network offline
    // - CORS preflight rejected
    // - Request timeout
    // - DNS resolution failure
    message = 'Unable to connect to the server. Please check your network connection.';
  } else if (error.status >= 500) {
    // 5xx: Server-side errors — do NOT expose error.message as it may contain
    // stack traces or internal implementation details (OWASP A05: Security Misconfiguration).
    message = `A server error occurred (${error.status}). Please try again later.`;
  } else if (error.status === 404) {
    message = 'The requested resource was not found.';
  } else if (error.status === 403) {
    message = 'You do not have permission to access this resource.';
  } else if (error.status === 401) {
    message = 'Your session has expired. Please refresh the page.';
  } else if (error.status === 400) {
    // 400: For client errors, the server's error message is generally safe
    // to surface — it describes a validation or request format problem.
    // We prefer the structured `error.error.message` if available, falling
    // back to the status text to avoid exposing raw server internals.
    const serverMessage =
      typeof error.error?.message === 'string' ? error.error.message : null;
    message = serverMessage ?? `Bad request (${error.status}).`;
  } else {
    // Catch-all for 4xx codes not explicitly handled above.
    message = `Request failed with status ${error.status}.`;
  }

  return {
    message,
    status: error.status,
    timestamp: new Date().toISOString(),
    url: error.url,
  };
}

// ---------------------------------------------------------------------------
// Interceptor
// ---------------------------------------------------------------------------

/**
 * Functional HTTP error interceptor.
 *
 * Intercepts all outgoing HTTP requests, catches any HttpErrorResponse, and:
 * 1. Logs the error via LoggerService (with full context in dev, minimal in prod).
 * 2. Normalises the raw error into a NormalisedHttpError.
 * 3. Re-throws the normalised error so feature stores and components receive
 *    a predictable, UI-safe error shape.
 *
 * Single responsibility: transform raw HTTP errors at the transport boundary
 * before they propagate to application logic.
 *
 * WHY THIS APPROACH: Intercepting at the HTTP layer means every API call in
 * the entire application — past and future — gets error normalisation for free.
 * Alternative: per-service catchError pipes would require duplication and would
 * risk inconsistent error shapes across features.
 *
 * OWASP A03 (Injection) / A05 (Security Misconfiguration):
 * Server error messages (5xx) are deliberately NOT passed through to the UI.
 * The normaliseHttpError function produces safe, generic messages for server errors.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(LoggerService);

  // RxJS pipe comment:
  // next(req)           — forwards the request to the next handler in the chain
  // catchError(...)     — catches only HttpErrorResponse instances (network errors
  //                       and HTTP status errors); non-HTTP errors pass through
  // throwError(...)     — re-throws the normalised error as an Observable error
  //                       so the subscriber's error callback / catchError in the
  //                       feature store receives it
  return next(req).pipe(
    catchError((rawError: unknown) => {
      if (rawError instanceof HttpErrorResponse) {
        const normalised = normaliseHttpError(rawError);

        // Log with full context in dev; log url + status only in prod to avoid
        // leaking internal API paths to production monitoring dashboards.
        logger.error(
          `HTTP ${normalised.status} — ${req.method} ${normalised.url}`,
          normalised,
        );

        return throwError(() => normalised);
      }

      // Non-HTTP errors (programming errors, etc.) are re-thrown as-is.
      // They will surface as unhandled errors caught by Angular's error handler.
      logger.error('Non-HTTP error encountered in interceptor', rawError);
      return throwError(() => rawError);
    }),
  );
};
