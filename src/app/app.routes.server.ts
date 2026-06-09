// DECISION: All routes use RenderMode.Server (dynamic SSR) rather than Prerender.
// ALTERNATIVES CONSIDERED: RenderMode.Prerender for static HTML generation at build time.
// REASON: Policy data is user-specific and real-time (filtered by region, status, etc.).
//         Pre-rendering would produce stale static HTML. Dynamic SSR renders on each
//         request with fresh data from the API, which is the correct model for a
//         live dashboard. Prerender is suitable only for fully static marketing pages.

import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Server-side rendering route configuration.
 *
 * Maps all application routes to dynamic SSR so the server renders
 * each page on demand with live API data rather than at build time.
 */
export const serverRoutes: ServerRoute[] = [
  {
    // WHY THIS APPROACH: The wildcard catches all routes including lazy-loaded
    // feature routes. Each feature's router outlet is still lazy-loaded on the
    // server; only the rendering mode changes from static to dynamic.
    path: '**',
    renderMode: RenderMode.Server,
  },
];
