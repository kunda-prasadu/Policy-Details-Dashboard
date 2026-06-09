// DECISION: Separate environment files per build target (dev / prod)
// ALTERNATIVES CONSIDERED: A single config object with runtime NODE_ENV checks
// REASON: Angular's fileReplacements mechanism in angular.json swaps this file
//         at build time, producing zero runtime overhead and no leaked dev config
//         in the production bundle.

/**
 * Development environment configuration.
 *
 * Consumed via dependency injection or direct import throughout the app.
 * The production equivalent (environment.prod.ts) is substituted automatically
 * during `ng build --configuration production` via angular.json fileReplacements.
 */
export const environment = {
  /** Flag consumed by Angular internals and app guards to enable dev tooling. */
  production: false,

  /**
   * Base URL for all HTTP API calls.
   * Points to the local json-server instance started via `npm run start:api`.
   * Overridden in environment.prod.ts to point at the real backend.
   */
  apiUrl: 'http://localhost:3000',
} as const;
