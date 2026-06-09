/**
 * @fileoverview Unit tests for ThemeService — dark/light mode state management.
 *
 * DECISION: StorageService is spied on to isolate ThemeService from localStorage.
 * PLATFORM_ID is set to 'browser' so window.matchMedia is available.
 * WHY NOT MOCK matchMedia: window.matchMedia is spied on directly so tests can
 * control the system preference without relying on the test runner's OS setting.
 */

import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, PLATFORM_ID } from '@angular/core';

import { ThemeService } from './theme.service';
import { StorageService } from './storage.service';
import { DARK_THEME_VALUE, THEME_STORAGE_KEY } from '../../features/policy-dashboard/constants';

describe('ThemeService', () => {
  let service: ThemeService;
  let storageSpy: jasmine.SpyObj<StorageService>;

  /**
   * Shared TestBed factory — call with a `storedValue` to control what
   * StorageService.get() returns for the theme key.
   */
  function createService(storedValue: string | null, systemPrefersDark = false): ThemeService {
    storageSpy = jasmine.createSpyObj<StorageService>('StorageService', ['get', 'set', 'remove']);
    storageSpy.get.and.callFake((key: string) =>
      key === THEME_STORAGE_KEY ? (storedValue as unknown as null) : null,
    );

    // WHY: Spy on window.matchMedia to simulate the OS dark-mode preference
    // without depending on the real system setting (which would make the test
    // environment-sensitive).
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? systemPrefersDark : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: StorageService, useValue: storageSpy },
        ThemeService,
      ],
    });

    return TestBed.inject(ThemeService);
  }

  afterEach(() => {
    // Tear down TestBed so the next createService() call gets a fresh environment
    TestBed.resetTestingModule();
    // Clean up DOM class to prevent test bleed-through
    document.documentElement.classList.remove('dark-theme');
  });

  it('should default to system dark preference when no value is stored', () => {
    service = createService(null, true /* systemPrefersDark */);
    expect(service.isDark()).toBeTrue();
  });

  it('should default to light mode when system prefers light and nothing is stored', () => {
    service = createService(null, false /* systemPrefersDark */);
    expect(service.isDark()).toBeFalse();
  });

  it('toggle() should flip isDark from false to true', () => {
    service = createService('light');
    expect(service.isDark()).toBeFalse();
    service.toggle();
    expect(service.isDark()).toBeTrue();
  });

  it('toggle() should persist the new value via StorageService', () => {
    service = createService('light');
    service.toggle();
    expect(storageSpy.set).toHaveBeenCalledWith(THEME_STORAGE_KEY, DARK_THEME_VALUE);
  });

  it('setDark(false) should persist light mode and remove dark state', () => {
    service = createService(DARK_THEME_VALUE);
    service.setDark(false);
    expect(service.isDark()).toBeFalse();
    expect(storageSpy.set).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
  });

  it('toggle() should apply dark-theme class to document.documentElement', () => {
    service = createService('light');
    service.toggle();
    // WHY flushEffects: In zoneless Angular, effects are scheduled and run
    // asynchronously. TestBed.flushEffects() forces all pending effects
    // (including the DOM class mutation in ThemeService's constructor effect)
    // to run synchronously before the assertion.
    TestBed.flushEffects();
    expect(document.documentElement.classList.contains('dark-theme')).toBeTrue();
  });

  it('should fall back to light in server platform when no value is stored', () => {
    TestBed.resetTestingModule();
    storageSpy = jasmine.createSpyObj<StorageService>('StorageService', ['get', 'set', 'remove']);
    storageSpy.get.and.returnValue(null);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: StorageService, useValue: storageSpy },
        ThemeService,
      ],
    });

    const serverService = TestBed.inject(ThemeService);
    expect(serverService.isDark()).toBeFalse();
  });
});
