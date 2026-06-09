// DECISION: Custom LoggerService rather than direct console.* calls throughout the app.
// ALTERNATIVES CONSIDERED:
//   1. Using console.* directly in services and components.
//   2. A third-party logging library (ngx-logger, log4javascript).
// REASON: Direct console.* calls cannot be globally suppressed in production.
//         A service wrapper lets us:
//         a) Suppress all debug/info logs in production via isDevMode().
//         b) Add a log transport (remote error reporting, structured JSON) later
//            in a single place without touching every call site.
//         c) Write deterministic tests by injecting a mock logger.
//         A third-party library adds bundle weight for functionality we can
//         implement in ~60 lines.

import { inject, Injectable, isDevMode, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Log level hierarchy — higher values mean higher severity.
 * Used internally to guard which methods emit output.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Application-wide logging service.
 *
 * Wraps the browser console to provide:
 * - Production suppression: debug and info logs are no-ops when isDevMode() is false.
 * - Consistent prefix: all log entries include a `[PolicyHub]` prefix for easy
 *   filtering in browser DevTools.
 * - SSR safety: console calls are guarded to avoid issues in Node.js environments
 *   where the console API may differ.
 *
 * Single responsibility: provide a single logging facade for the entire application.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly platformId = inject(PLATFORM_ID);

  /** Prefix applied to every log message for easy DevTools filtering. */
  private readonly prefix = '[PolicyHub]';

  /**
   * Logs a debug-level message.
   *
   * WHY SUPPRESSED IN PRODUCTION: Debug logs are for developer diagnostics only.
   * Leaving them active in production would expose internal state details to
   * end users via the browser console — a minor but avoidable information leak.
   *
   * No-op when isDevMode() returns false.
   *
   * @param message - The debug message.
   * @param args    - Optional additional arguments passed to console.debug.
   */
  debug(message: string, ...args: unknown[]): void {
    if (!isDevMode()) {
      return;
    }
    this.emit('debug', message, args);
  }

  /**
   * Logs an informational message.
   *
   * Used for notable application events (route changes, successful API calls).
   * No-op when isDevMode() returns false to reduce production console noise.
   *
   * @param message - The informational message.
   * @param args    - Optional additional arguments.
   */
  info(message: string, ...args: unknown[]): void {
    if (!isDevMode()) {
      return;
    }
    this.emit('info', message, args);
  }

  /**
   * Logs a warning-level message.
   *
   * WHY ACTIVE IN PRODUCTION: Warnings indicate unexpected-but-recoverable
   * conditions (e.g. missing optional config, deprecated API usage). They are
   * important for monitoring in production and should not be suppressed.
   *
   * @param message - The warning message.
   * @param args    - Optional additional arguments.
   */
  warn(message: string, ...args: unknown[]): void {
    this.emit('warn', message, args);
  }

  /**
   * Logs an error-level message.
   *
   * Always active — errors must be visible in both dev and production
   * environments. In a future iteration this method would also forward
   * to a remote error-reporting service (e.g. Sentry, Azure Application Insights).
   *
   * Side effect (future): may trigger remote error reporting.
   *
   * @param message - The error message or Error object.
   * @param args    - Optional additional arguments (stack traces, context objects).
   */
  error(message: string | Error, ...args: unknown[]): void {
    const msg = message instanceof Error ? message.message : message;
    this.emit('error', msg, message instanceof Error ? [message, ...args] : args);
  }

  /**
   * Internal emit helper — routes to the correct console method and prepends
   * the application prefix.
   *
   * WHY THIS APPROACH: Centralises the prefix injection and platform guard so
   * the four public methods stay DRY. The switch ensures TypeScript knows which
   * console method is called at each log level.
   *
   * @param level   - The log level determining which console method to call.
   * @param message - The formatted log message.
   * @param args    - Additional arguments forwarded to the console method.
   */
  private emit(level: LogLevel, message: string, args: unknown[]): void {
    // WHY PLATFORM GUARD: In Angular SSR (Node.js), console is available but
    // behaves differently. We guard here to allow easy override in tests and
    // to provide a hook for server-side log transport in future.
    if (!isPlatformBrowser(this.platformId) && level === 'debug') {
      // Skip debug logs on the server entirely — they add noise to server logs
      // without providing actionable information.
      return;
    }

    const formattedMessage = `${this.prefix} ${message}`;

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, ...args);
        break;
      case 'info':
        console.info(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'error':
        console.error(formattedMessage, ...args);
        break;
    }
  }
}
