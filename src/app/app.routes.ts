// DECISION: The dashboard page is lazily loaded via loadComponent().
// ALTERNATIVES CONSIDERED: Eagerly importing PolicyDashboard in app.routes.ts.
// REASON: loadComponent() defers the feature module's JS bundle until the route
//         is actually navigated to. For the default '' route this means the
//         initial bundle only contains App, ThemePickerComponent, and the router
//         — the policy domain code (store, API service, all child components)
//         is loaded after the shell renders, improving Time-to-First-Byte on
//         future routes and keeping the architecture extensible for new pages.

import { Routes } from '@angular/router';

/** Root application routes. */
export const routes: Routes = [
  {
    path: '',
    // WHY loadComponent: Lazy-loads the entire policy dashboard feature.
    // The shell (App) renders immediately; the dashboard JS chunk is fetched
    // after Angular's router resolves the navigation to ''.
    loadComponent: () =>
      import(
        './features/policy-dashboard/pages/policy-dashboard/policy-dashboard'
      ).then((m) => m.PolicyDashboard),
    title: 'Policy Dashboard | Chubb APAC',
  },
];
