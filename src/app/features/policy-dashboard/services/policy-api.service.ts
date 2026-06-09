// DECISION: Root-injectable service (providedIn: 'root') rather than feature-scoped.
// ALTERNATIVES CONSIDERED: Providing in a feature-level route via providers[] array.
// REASON: PolicyApiService holds no state — it is a pure HTTP adapter. Providing
//         in root means it is instantiated once, tree-shaken if unused, and
//         injectable anywhere (store, guards, resolvers) without import ceremony.
//         Feature-scoped provision only makes sense for stateful services that
//         must be destroyed with the feature route.

import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { LoggerService } from '../../../core/services/logger.service';
import { PolicyFilter } from '../models/policy-filter.model';
import { Policy } from '../models/policy.model';

// ---------------------------------------------------------------------------
// Sort parameter shape
// ---------------------------------------------------------------------------

/**
 * Represents the active sort state passed from the store to the API service.
 *
 * WHY A STANDALONE INTERFACE: Keeps the sort contract explicit and independent
 * of Angular Material's `Sort` event type — the API layer should not import
 * from `@angular/material/sort`.
 */
export interface PolicySort {
  /** The Policy field name to sort by (e.g. 'expiryDate', 'premiumAmount'). */
  active: string;
  /** Sort direction. Empty string means no sort is applied. */
  direction: 'asc' | 'desc' | '';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * HTTP adapter service for the /policies REST resource.
 *
 * Translates domain-level filter and sort objects into HTTP query parameters
 * and maps json-server responses to typed `Policy` objects.
 *
 * Single responsibility: own ALL HTTP communication with the /policies endpoint.
 * Does NOT hold state — state lives exclusively in PolicyStore.
 */
@Injectable({ providedIn: 'root' })
export class PolicyApiService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(LoggerService);

  /** Base URL for the policies resource, sourced from the build-time environment. */
  private readonly baseUrl = `${environment.apiUrl}/policies`;

  // ---------------------------------------------------------------------------
  // getAll
  // ---------------------------------------------------------------------------

  /**
   * Fetches all policies matching the given filters and sort, up to the
   * server-side maximum of 250 records.
   *
   * WHY _limit=250: json-server returns 10 records by default. Setting a high
   * limit here ensures the store receives all records in a single round-trip,
   * which the client-side computed signal then paginates in memory. A future
   * iteration can switch to true server-side pagination by removing this limit
   * and passing _page/_limit from the store's PaginationState.
   *
   * WHY SERVER-SIDE FILTER PARAMS: Offloading status/region/LOB filtering to
   * json-server reduces the payload size — fetching 250 unfiltered records and
   * then filtering in memory is wasteful when json-server can do the same with
   * a query param. Free-text search (q=) is also server-side for the same reason.
   *
   * @param filters - Optional filter criteria mapped to json-server query params.
   * @param sort    - Optional sort state mapped to _sort/_order params.
   * @returns Observable emitting the array of matching Policy records.
   */
  getAll(filters?: PolicyFilter, sort?: PolicySort): Observable<Policy[]> {
    // WHY THIS APPROACH: HttpParams is immutable — each .set()/.append() returns
    // a new instance. Building via a chain avoids mutating a shared params object
    // across concurrent calls.
    let params = new HttpParams().set('_limit', '250');

    if (filters) {
      // Free-text search: json-server's `q` param does a full-text match
      // across ALL string fields — covers policyNumber and policyHolderName.
      if (filters.search?.trim()) {
        params = params.set('q', filters.search.trim());
      }

      // WHY SINGLE-VALUE STATUS: json-server v0.x does not support array params
      // natively (e.g. ?status[]=Active&status[]=Pending). For multi-status
      // filtering the store falls back to client-side filtering on the full
      // result set. We send the first selected status as a server-side hint
      // when exactly one is chosen.
      if (filters.statuses?.length === 1) {
        params = params.set('status', filters.statuses[0]);
      }

      if (filters.regions?.length === 1) {
        params = params.set('region', filters.regions[0]);
      }

      if (filters.linesOfBusiness?.length === 1) {
        params = params.set('lineOfBusiness', filters.linesOfBusiness[0]);
      }

      if (filters.currencies?.length === 1) {
        params = params.set('currency', filters.currencies[0]);
      }

      // flaggedForReview: json-server matches boolean fields directly
      if (filters.flaggedForReview === true) {
        params = params.set('flaggedForReview', 'true');
      }

      // Premium range: json-server operator-suffix params
      if (filters.premiumMin !== undefined) {
        params = params.set('premiumAmount_gte', filters.premiumMin.toString());
      }
      if (filters.premiumMax !== undefined) {
        params = params.set('premiumAmount_lte', filters.premiumMax.toString());
      }
    }

    if (sort?.active && sort.direction) {
      params = params.set('_sort', sort.active).set('_order', sort.direction);
    }

    this.logger.debug('PolicyApiService.getAll()', { params: params.toString() });

    // RxJS pipe:
    // tap(...)      — logs the number of records received for diagnostic purposes
    // (no catchError here — errorInterceptor handles all HTTP errors upstream)
    return this.http.get<Policy[]>(this.baseUrl, { params }).pipe(
      tap((policies) =>
        this.logger.debug(`PolicyApiService.getAll() → ${policies.length} records`),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // patch
  // ---------------------------------------------------------------------------

  /**
   * Partially updates a policy by ID using HTTP PATCH.
   *
   * WHY PATCH NOT PUT: PATCH semantics allow sending only the changed fields,
   * which prevents race conditions where a concurrent write to a different field
   * is overwritten by a full PUT of the stale original object.
   *
   * @param id      - The UUID of the policy to update.
   * @param changes - Partial Policy object containing only the fields to update.
   * @returns Observable emitting the updated Policy as returned by the server.
   */
  patch(id: string, changes: Partial<Policy>): Observable<Policy> {
    this.logger.debug(`PolicyApiService.patch(${id})`, changes);

    return this.http.patch<Policy>(`${this.baseUrl}/${id}`, changes).pipe(
      tap(() => this.logger.debug(`PolicyApiService.patch(${id}) → success`)),
      catchError((err: unknown) => {
        // Log and rethrow as a typed Error so the store always receives an
        // Error instance regardless of whether errorInterceptor already ran.
        // errorInterceptor converts HttpErrorResponse → NormalisedHttpError;
        // this catchError adds a human-readable message for store-level handling.
        const message =
          err instanceof Error
            ? err.message
            : `Failed to patch policy ${id}`;
        this.logger.error(`PolicyApiService.patch(${id}) failed`, err);
        return throwError(() => new Error(message));
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // flagPolicy
  // ---------------------------------------------------------------------------

  /**
   * Flags a single policy for underwriter review via HTTP PATCH.
   *
   * Exists as a dedicated method (rather than calling patch() directly)
   * because flagging is a named domain operation that may gain additional
   * business logic (audit trail, notification trigger) in future iterations.
   *
   * Side effect: emits a debug log on success, an error log on failure.
   *
   * @param id - The UUID of the policy to flag.
   * @returns Observable emitting the updated Policy with flaggedForReview: true.
   */
  flagPolicy(id: string): Observable<Policy> {
    this.logger.debug(`PolicyApiService.flagPolicy(${id})`);

    // RxJS pipe:
    // catchError — catches any error (HttpErrorResponse already normalised
    // by errorInterceptor), logs it, and rethrows a plain typed Error so
    // forkJoin in flagPolicies() receives a consistent error type.
    return this.http
      .patch<Policy>(`${this.baseUrl}/${id}`, { flaggedForReview: true })
      .pipe(
        tap(() =>
          this.logger.debug(`PolicyApiService.flagPolicy(${id}) → success`),
        ),
        catchError((err: unknown) => {
          const message =
            err instanceof Error
              ? err.message
              : `Failed to flag policy ${id}`;
          this.logger.error(`PolicyApiService.flagPolicy(${id}) failed`, err);
          return throwError(() => new Error(message));
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // flagPolicies (batch)
  // ---------------------------------------------------------------------------

  /**
   * Flags multiple policies for review in a single logical operation.
   *
   * WHY forkJoin: forkJoin subscribes to all inner Observables concurrently
   * and emits a single array of results only when ALL complete. This gives us:
   * - Maximum parallelism (all PATCH requests in-flight simultaneously)
   * - A single emission point for the store to handle (success or failure)
   * - Automatic error propagation — if any single flagPolicy() fails, forkJoin
   *   errors immediately and the store's rollback logic triggers.
   *
   * WHY NOT sequential switchMap/concatMap: Sequential patching would be
   * significantly slower for large selections (25+ policies) with no benefit
   * since json-server handles concurrent writes safely.
   *
   * @param ids - Array of policy UUIDs to flag.
   * @returns Observable emitting an array of updated Policy objects in the
   *          same order as the input ids array.
   */
  flagPolicies(ids: string[]): Observable<Policy[]> {
    this.logger.debug(`PolicyApiService.flagPolicies([${ids.length} ids])`);

    // WHY GUARD: forkJoin([]) with an empty array completes immediately with [].
    // This is the correct behaviour — calling flagPolicies([]) is a no-op that
    // resolves successfully. The guard makes the intent explicit.
    if (ids.length === 0) {
      return new Observable<Policy[]>((subscriber) => {
        subscriber.next([]);
        subscriber.complete();
      });
    }

    // Build one flagPolicy() Observable per id and combine them.
    // forkJoin handles a single subscription to the entire batch.
    return forkJoin(ids.map((id) => this.flagPolicy(id)));
  }
}
