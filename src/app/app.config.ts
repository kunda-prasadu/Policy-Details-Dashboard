// DECISION: Functional provider configuration (no NgModule AppModule)
// ALTERNATIVES CONSIDERED: NgModule-based bootstrapping with BrowserModule
// REASON: Angular 20 standalone API is the canonical approach; no NgModule
//         overhead, tree-shakeable, and directly composable in SSR config.

import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';

/**
 * Root application configuration.
 *
 * Registers all top-level Angular providers:
 * - Zoneless change detection (signal-based, no Zone.js overhead)
 * - Router with component input binding and view transitions
 * - HttpClient using the Fetch API (SSR-compatible, no XMLHttpRequest)
 * - Client hydration with event replay for SSR-rendered pages
 */
export const appConfig: ApplicationConfig = {
  providers: [
    // WHY THIS APPROACH: provideBrowserGlobalErrorListeners registers uncaught
    // error and unhandled rejection handlers at the platform level, giving us
    // a single centralised error boundary before any app-level handler.
    provideBrowserGlobalErrorListeners(),

    // WHY THIS APPROACH: provideZonelessChangeDetection removes Zone.js from
    // the change detection cycle entirely. All reactivity is driven by Angular
    // signals, which is the Angular 20 recommended approach and eliminates
    // the ~30 kB Zone.js bundle from production output.
    provideZonelessChangeDetection(),

    // withComponentInputBinding: maps route params/data directly to @Input()
    // DECISION: withViewTransitions omitted from root config — the View Transitions
    // API is browser-only and causes NG0401 during Angular 20 SSR route extraction.
    // It will be added in a browser-specific platform override in a later phase.
    provideRouter(routes, withComponentInputBinding()),

    // WHY THIS APPROACH: withFetch() replaces XMLHttpRequest with the native
    // Fetch API. This is required for SSR (Node 18+ has fetch built-in) and
    // reduces polyfill surface area in the browser bundle.
    provideHttpClient(withFetch()),

    // withEventReplay: captures user events during SSR hydration and replays
    // them once the client-side app takes over, preventing lost interactions.
    provideClientHydration(withEventReplay()),
  ],
};
