import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';

import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  function createLogger(platform: 'browser' | 'server'): LoggerService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: platform },
        LoggerService,
      ],
    });
    return TestBed.inject(LoggerService);
  }

  it('warn() should route to console.warn with prefixed message', () => {
    const logger = createLogger('browser');
    const warnSpy = spyOn(console, 'warn').and.stub();

    logger.warn('be careful', { foo: 1 });

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.calls.mostRecent().args[0]).toContain('[PolicyHub] be careful');
  });

  it('error() should route Error objects as message plus error in args', () => {
    const logger = createLogger('browser');
    const errorSpy = spyOn(console, 'error').and.stub();
    const err = new Error('boom');

    logger.error(err, { context: 'test' });

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.calls.mostRecent().args[0]).toContain('[PolicyHub] boom');
    expect(errorSpy.calls.mostRecent().args[1]).toBe(err);
  });

  it('error() should pass string messages without wrapping', () => {
    const logger = createLogger('browser');
    const errorSpy = spyOn(console, 'error').and.stub();

    logger.error('plain-failure', { id: 1 });

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.calls.mostRecent().args[0]).toContain('[PolicyHub] plain-failure');
  });

  it('debug() should be skipped on server platform', () => {
    const logger = createLogger('server');
    const debugSpy = spyOn(console, 'debug').and.stub();

    logger.debug('server-debug');

    expect(debugSpy).not.toHaveBeenCalled();
  });
});
