/**
 * @fileoverview Karma test entry point.
 *
 * WHY ZONE.JS + ZONE.JS/TESTING: This app uses provideZonelessChangeDetection()
 * in production, but Angular's fakeAsync() test helper requires zone.js to be
 * loaded first, followed by zone.js/testing (which patches zone.js to support
 * fakeAsync, tick, and discardPeriodicTasks). Importing both here makes the
 * full fakeAsync API available to all spec files.
 *
 * WHY ZONE.JS IS SAFE IN TESTS: Loading zone.js in the test bundle does not
 * conflict with provideZonelessChangeDetection() — that provider selects the
 * Angular scheduler, not whether zone.js is present. Tests that explicitly
 * provide provideZonelessChangeDetection() continue to use the zoneless path.
 */

// Load the base zone.js runtime (required by zone.js/testing).
import 'zone.js';
// Required for fakeAsync() and tick() in all spec files.
import 'zone.js/testing';
