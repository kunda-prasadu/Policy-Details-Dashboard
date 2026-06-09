/**
 * @fileoverview Unit tests for StorageService — localStorage wrapper.
 *
 * DECISION: Tests manipulate localStorage directly via spyOn to keep tests
 * deterministic without relying on actual browser storage state.
 * WHY PLATFORM_ID 'browser': StorageService guards against SSR with
 * isPlatformBrowser(); providing 'browser' activates the localStorage path.
 */

import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, PLATFORM_ID } from '@angular/core';

import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StorageService,
        // WHY 'browser': activates the localStorage code path inside the service.
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(StorageService);

    // Start each test with a clean localStorage state
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('get() should return null when the key does not exist', () => {
    const result = service.get<string>('nonexistent-key');
    expect(result).toBeNull();
  });

  it('set() then get() should round-trip the stored value correctly', () => {
    service.set<string>('test-key', 'hello');
    const result = service.get<string>('test-key');
    expect(result).toBe('hello');
  });

  it('remove() should clear the stored value and get() returns null afterwards', () => {
    service.set<string>('remove-key', 'value');
    service.remove('remove-key');
    expect(service.get<string>('remove-key')).toBeNull();
  });

  it('get() should return null and not throw when the stored JSON is malformed', () => {
    // Directly write malformed JSON to bypass service's JSON.stringify
    localStorage.setItem('bad-json', '{not valid json}');

    // WHY: The service must swallow SyntaxError and return null gracefully
    expect(() => service.get<unknown>('bad-json')).not.toThrow();
    expect(service.get<unknown>('bad-json')).toBeNull();
  });
});
