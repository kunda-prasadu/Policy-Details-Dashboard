// WHY THIS FILE: Angular CLI's @angular/build:karma builder picks up karma.conf.js
// from the project root automatically. This file:
// 1. Adds a ChromeHeadlessNoSandbox browser alias for CI environments (GitHub Actions
//    runners run as root in Docker — Chromium requires --no-sandbox in that context).
// 2. Leaves all other configuration to the Angular CLI builder defaults.
//
// DECISION: Minimal karma.conf.js — only add what is not provided by the CLI.
// ALTERNATIVES CONSIDERED: Passing --browsers flag directly to ng test; using
//   CHROMIUM_FLAGS env var. Both are less portable than a committed config file.

// @ts-check
/** @type {import('karma').Config} */
module.exports = function (config) {
  config.set({
    // WHY: Extend the default Angular Karma configuration rather than
    // replacing it. This ensures all Angular-specific reporters, frameworks,
    // and plugins configured by the CLI builder are still active.
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      // Standard CI alias for Chromium without the sandbox restriction.
      // The --disable-gpu and --disable-dev-shm-usage flags improve stability
      // in headless Docker containers with limited shared memory.
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
  });
};
