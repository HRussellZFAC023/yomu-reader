import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger, configureLogger } from '../../src/reader/logger';

type LoggerTestWindow = Window & {
    __YOMU_DEV_VERSION__?: string;
    __YOMU_ENABLE_LOGS__?: boolean;
};

const loggerWindow = window as LoggerTestWindow;

describe('Logger', () => {
    afterEach(() => {
        delete loggerWindow.__YOMU_DEV_VERSION__;
        delete loggerWindow.__YOMU_ENABLE_LOGS__;
        localStorage.removeItem('yomu:enable-logs');
        configureLogger({ forceEnabled: false, settingsProvider: () => ({ enableLogging: false }) });
        Logger.reset();
        vi.restoreAllMocks();
    });

    it('stays disabled in the local dev bootstrap unless logging is explicitly enabled', () => {
        loggerWindow.__YOMU_DEV_VERSION__ = '0.4.2.dev';
        configureLogger({ settingsProvider: () => ({ enableLogging: false }), forceEnabled: false });
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        Logger.scope('Test').info('hidden');

        expect(Logger.isDevMode()).toBe(true);
        expect(Logger.isEnabled()).toBe(false);
        expect(infoSpy).not.toHaveBeenCalled();
    });

    it('allows the dev bootstrap environment flag to enable logging', () => {
        loggerWindow.__YOMU_DEV_VERSION__ = '0.4.2.dev';
        loggerWindow.__YOMU_ENABLE_LOGS__ = true;
        configureLogger({ settingsProvider: () => ({ enableLogging: false }), forceEnabled: false });
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

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
