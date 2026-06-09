// DECISION: Bootstrap function accepts and forwards BootstrapContext to bootstrapApplication.
// ALTERNATIVES CONSIDERED: () => bootstrapApplication(App, config) — ignores context.
// REASON: During SSR build-time route extraction, Angular calls the bootstrap function
//         with a BootstrapContext that carries the platform reference (PlatformRef) created
//         by the build tooling. Without forwarding this context, bootstrapApplication
//         tries to create a NEW platform and fails with NG0401 "Missing Platform" because
//         the build environment doesn't support multiple platforms being created.
//         Forwarding the context lets bootstrapApplication reuse the existing platform.

import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * Server-side bootstrap entry point.
 *
 * Called by the Angular SSR infrastructure on every incoming server request and
 * during build-time route extraction. Accepts the BootstrapContext supplied by
 * the SSR runtime so bootstrapApplication can reuse the correct PlatformRef.
 *
 * @param context - Optional bootstrap context supplied by @angular/ssr during
 *                  route extraction and server-side rendering.
 */
const bootstrap = (context?: BootstrapContext) =>
  bootstrapApplication(App, config, context);

export default bootstrap;
