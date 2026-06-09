/**
 * @fileoverview Karma test entry point.
 *
 * WHY NO ZONE.JS: The application runs fully zoneless
 * (provideZonelessChangeDetection()) and Zone.js is absent from the build
 * polyfills. The test suite mirrors production exactly: every spec provides
 * provideZonelessChangeDetection() in its TestBed and drives change detection
 * explicitly via fixture.detectChanges() / await fixture.whenStable().
 *
 * Asynchrony is handled with native async/await over real microtasks rather
 * than fakeAsync()/tick() (which require Zone.js). Keeping Zone.js out of the
 * test bundle means tests exercise the same scheduler as production and removes
 * the NG0914 "still loading Zone.js" warning.
 */

export {};
