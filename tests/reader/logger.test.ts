import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger, configureLogger } from '../../src/reader/logger';

describe('Logger', () => {
    afterEach(() => {
        localStorage.removeItem('yomu:enable-logs');
        configureLogger({ forceEnabled: false, settingsProvider: () => ({ enableLogging: false }) });
        Logger.reset();
        vi.restoreAllMocks();
    });

    it('stays disabled when no setting or runtime override enables logging', () => {
        configureLogger({ settingsProvider: () => ({ enableLogging: false }), forceEnabled: false });
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        Logger.scope('Test').info('hidden');

        expect(Logger.isEnabled()).toBe(false);
        expect(infoSpy).not.toHaveBeenCalled();
    });

    it('honors an explicit runtime logging override', () => {
        configureLogger({ settingsProvider: () => ({ enableLogging: false }), forceEnabled: false });
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        Logger.enable(true);
        infoSpy.mockClear();

        Logger.scope('Test').info('visible');

        expect(Logger.isEnabled()).toBe(true);
        expect(infoSpy).toHaveBeenCalledOnce();
    });

    it('honors the persisted settings checkbox outside dev mode', () => {
        configureLogger({ settingsProvider: () => ({ enableLogging: true }), forceEnabled: false });
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        Logger.scope('Test').info('visible');

        expect(Logger.isEnabled()).toBe(true);
        expect(infoSpy).toHaveBeenCalledOnce();
    });
});
