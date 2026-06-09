// DECISION: Generic StorageService wrapping localStorage, provided in root.
// ALTERNATIVES CONSIDERED:
//   1. Injecting PLATFORM_ID and using isPlatformBrowser guards inline in each service.
//   2. Using sessionStorage for some keys.
// REASON: Centralising localStorage access in one service means:
//   a) All SSR safety (localStorage is undefined in Node.js) is handled in ONE place.
//   b) All try/catch for QuotaExceededError and SecurityError is handled once.
//   c) JSON serialisation/deserialisation is handled generically with type safety.
//   d) ThemeService, future UserPreferencesService etc. all get SSR safety for free.

import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Generic localStorage wrapper service.
 *
 * Provides type-safe, SSR-safe, error-guarded get/set/remove operations
 * for persisting user preferences and lightweight application state across
 * browser sessions.
 *
 * Single responsibility: abstract localStorage access behind a typed API.
 * Does NOT own any specific keys — consumers (ThemeService, etc.) define
 * their own key constants and call this service.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  // WHY THIS APPROACH: PLATFORM_ID injection rather than a direct typeof window
  // check. Angular's PLATFORM_ID is the canonical SSR-safe platform detection
  // mechanism and works correctly in all rendering environments including
  // Angular Universal and partial hydration.
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Whether the application is running in a browser environment.
   *
   * WHY A PRIVATE GETTER: Evaluated lazily on each call so subclasses or test
   * overrides of PLATFORM_ID are always reflected correctly.
   */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Retrieves a value from localStorage and deserialises it from JSON.
   *
   * WHY GENERIC T: Callers annotate the expected type so the return value is
   * correctly typed without casting at the call site. The null return
   * signals "key not found or storage unavailable" to the caller.
   *
   * @param key - The localStorage key to retrieve.
   * @returns The deserialised value, or null if the key is absent or storage
   *          is unavailable (SSR, private-mode browser, quota errors).
   */
  get<T>(key: string): T | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        return null;
      }
      // WHY JSON.parse: Stored values are always JSON-stringified by set().
      // This ensures booleans, numbers, and objects round-trip correctly
      // rather than being coerced to strings.
      return JSON.parse(raw) as T;
    } catch {
      // Catches: SyntaxError (malformed JSON), SecurityError (cross-origin),
      // and any unexpected runtime errors. We fail silently and return null
      // so the calling service falls back to its default value.
      return null;
    }
  }

  /**
   * Serialises a value to JSON and writes it to localStorage.
   *
   * WHY GENERIC T: Type-safe write ensures the value matches what callers
   * expect to read back via get<T>(), preventing accidental string/object
   * type mismatches.
   *
   * Side effect: writes to localStorage. No-ops silently in SSR or when
   * localStorage is unavailable (private browsing, quota exceeded).
   *
   * @param key   - The localStorage key to write.
   * @param value - The value to serialise and store.
   */
  set<T>(key: string, value: T): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Catches: QuotaExceededError (storage full), SecurityError.
      // We fail silently — a missing persisted preference is acceptable;
      // crashing the application is not.
    }
  }

  /**
   * Removes a key from localStorage.
   *
   * WHY THIS EXISTS: Provides a unified remove path so callers never need to
   * touch localStorage directly, keeping SSR safety and error handling
   * consistent across all storage operations.
   *
   * Side effect: deletes the key from localStorage. No-ops silently in SSR.
   *
   * @param key - The localStorage key to remove.
   */
  remove(key: string): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // Catches SecurityError in restricted environments.
    }
  }
}
