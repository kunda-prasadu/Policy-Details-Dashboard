// DECISION: Production environment config — swapped in by angular.json fileReplacements.
// ALTERNATIVES CONSIDERED: Runtime env vars injected via window.__ENV__
// REASON: Build-time replacement is AOT-friendly, tree-shakeable, and prevents
//         any development configuration from leaking into the production bundle.

/**
 * Production environment configuration.
 *
 * This file is substituted for environment.ts during `ng build --configuration production`.
 * The apiUrl must be updated to the real backend base URL before deploying.
 */
export const environment = {
  /** Enables Angular production mode: disables dev assertions and double change detection. */
  production: true,

  /**
   * Base URL for all HTTP API calls.
   * Replace with the real backend URL before deploying to production.
   */
  apiUrl: 'https://api.chubb-apac-policy-hub.example.com',
} as const;
