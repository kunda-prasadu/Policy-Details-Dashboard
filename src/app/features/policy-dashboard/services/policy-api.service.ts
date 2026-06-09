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
import { PageRequest, PolicyPage } from '../models/pagination.model';
import { PolicySummaryData } from '../models/policy-summary.model';
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
   * Builds the HTTP query params for the shared FILTER surface used by both
   * `getAll` and `getSummary`.
   *
   * WHY EXTRACTED: The filter contract (search + multi-value + ranges) is
   * identical for the list endpoint and the summary endpoint. Centralising it
   * here keeps the two methods in lock-step — a new filter field is wired once.
   *
   * WHY THESE PARAM NAMES: They mirror the mock server's query contract
   * (`search`, repeated `status`/`region`/`lineOfBusiness`/`currency`,
   * `premiumMin`/`premiumMax`, `*DateFrom`/`*DateTo`). The server performs an OR
   * free-text search across policyNumber/policyHolderName/underwriter from the
   * single `search` param — fixing the previous bug where three ANDed `_like`
   * params could never match.
   */
  private buildFilterParams(filters?: PolicyFilter): HttpParams {
    // HttpParams is immutable — each set()/append() returns a new instance.
    let params = new HttpParams();
    if (!filters) return params;

    if (filters.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    for (const status of filters.statuses ?? []) {
      params = params.append('status', status);
    }
    for (const region of filters.regions ?? []) {
      params = params.append('region', region);
    }
    for (const lob of filters.linesOfBusiness ?? []) {
      params = params.append('lineOfBusiness', lob);
    }
    for (const currency of filters.currencies ?? []) {
      params = params.append('currency', currency);
    }

    if (filters.flaggedForReview === true) {
      params = params.set('flaggedForReview', 'true');
    }

    if (filters.premiumMin !== undefined) {
      params = params.set('premiumMin', filters.premiumMin.toString());
    }
    if (filters.premiumMax !== undefined) {
      params = params.set('premiumMax', filters.premiumMax.toString());
    }

    if (filters.effectiveDateFrom) {
      params = params.set('effectiveDateFrom', filters.effectiveDateFrom);
    }
    if (filters.effectiveDateTo) {
      params = params.set('effectiveDateTo', filters.effectiveDateTo);
    }
    if (filters.expiryDateFrom) {
      params = params.set('expiryDateFrom', filters.expiryDateFrom);
    }
    if (filters.expiryDateTo) {
      params = params.set('expiryDateTo', filters.expiryDateTo);
    }

    return params;
  }

  /**
   * Fetches ONE page of policies matching the given filters and sort.
   *
   * Filtering, free-text search, sorting AND pagination are ALL performed
   * server-side — the response contains only the requested page plus the total
   * count of matching records. The client never holds the full dataset.
   *
   * @param filters    - Optional filter criteria (shared with getSummary).
   * @param sort       - Optional sort state mapped to `sort`/`order` params.
   * @param pagination - Optional zero-based pageIndex + pageSize. Omitted →
   *                     server returns all matching records (used by drilldowns).
   * @returns Observable emitting `{ data, total }`.
   */
  getAll(
    filters?: PolicyFilter,
    sort?: PolicySort,
    pagination?: PageRequest,
  ): Observable<PolicyPage<Policy>> {
    let params = this.buildFilterParams(filters);

    if (sort?.active && sort.direction) {
      params = params.set('sort', sort.active).set('order', sort.direction);
    }

    if (pagination) {
      // Server uses 1-based page numbers; MatPaginator is 0-based.
      params = params
        .set('page', (pagination.pageIndex + 1).toString())
        .set('pageSize', pagination.pageSize.toString());
    }

    this.logger.debug('PolicyApiService.getAll()', { params: params.toString() });

    // No catchError here — errorInterceptor normalises all HTTP errors upstream.
    return this.http.get<PolicyPage<Policy>>(this.baseUrl, { params }).pipe(
      tap((page) =>
        this.logger.debug(
          `PolicyApiService.getAll() → page of ${page.data.length} / ${page.total} total`,
        ),
      ),
    );
  }

  /**
   * Fetches the KPI summary aggregated SERVER-SIDE over the filtered set.
   *
   * WHY A SEPARATE ENDPOINT: With server-side pagination the client only holds
   * one page, so it cannot compute counts/premiums across the whole filtered
   * dataset. The server aggregates over the same filter criteria and returns
   * the totals — keeping the KPI cards correct on every page.
   *
   * @param filters - Filter criteria (identical contract to getAll).
   * @returns Observable emitting the aggregated PolicySummaryData.
   */
  getSummary(filters?: PolicyFilter): Observable<PolicySummaryData> {
    const params = this.buildFilterParams(filters);
    this.logger.debug('PolicyApiService.getSummary()', { params: params.toString() });

    return this.http
      .get<PolicySummaryData>(`${this.baseUrl}/summary`, { params })
      .pipe(tap(() => this.logger.debug('PolicyApiService.getSummary() → ok')));
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
