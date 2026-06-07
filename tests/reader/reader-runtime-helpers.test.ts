import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME, INTERFACE_LANGUAGE_CHANGE_EVENT, OPEN_SETTINGS_EVENT, SETTINGS_CHANGE_EVENT, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from '../../src/reader/app/constants';
import { canAttemptReaderAutoAudio } from '../../src/reader/audio/activation';
import { registerReaderMenuCommands } from '../../src/reader/app/menu-commands';
import { bindReaderRuntimeEvents } from '../../src/reader/app/runtime-events';
import { shouldShowReaderOnboarding } from '../../src/reader/app/startup';
import { scheduleReaderAnkiStatusWarmup } from '../../src/reader/app/status-warmup';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const originalRequestIdleCallback = window.requestIdleCallback;

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'requestIdleCallback', {
        configurable: true,
        value: originalRequestIdleCallback,
    });
});

describe('reader runtime helpers', () => {
    it('keeps hosted pages out of onboarding', () => {
        expect(shouldShowReaderOnboarding(true, 'https://hrussellzfac023.github.io/yomu-reader/')).toBe(false);
        expect(shouldShowReaderOnboarding(true, 'https://example.com/article')).toBe(true);
        expect(shouldShowReaderOnboarding(false, 'https://example.com/article')).toBe(false);
    });

    it('registers userscript menu commands and preserves page opener isolation', () => {
        const commands = new Map<string, () => void>();
        vi.stubGlobal('GM_registerMenuCommand', vi.fn((name: string, fn: () => void) => {
            commands.set(name, fn);
        }));
        const opened = { opener: window } as Window;
        const open = vi.spyOn(window, 'open').mockReturnValue(opened);

        registerReaderMenuCommands({
            factoryReset: vi.fn(),
            getSettings: () => ({ ...DEFAULT_SETTINGS, showFloatingButton: false }),
            installFloatingButton: vi.fn(),
            logInfo: vi.fn(),
            saveSettings: vi.fn().mockResolvedValue(undefined),
            showSettings: vi.fn(),
            toggleYoutubeImmersion: vi.fn(),
        });

        commands.get(`${APP_NAME} open new tab`)?.();

        expect(open).toHaveBeenCalledWith('https://hrussellzfac023.github.io/yomu-reader/newtab/', '_blank');
        expect(opened.opener).toBeNull();
    });

    it('routes runtime custom events through the supplied ReaderApp callbacks', () => {
        const controller = new AbortController();
        const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const };
        const showSettings = vi.fn();
        const setInterfaceLanguage = vi.fn();
        const setSettings = vi.fn();
        const applyTheme = vi.fn();
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const clearBridgeCaches = vi.fn();

        bindReaderRuntimeEvents({
            applyTheme,
            clearBridgeCaches,
            getSettings: () => settings,
            isDestroyed: () => false,
            saveSettings,
            setInterfaceLanguage,
            setSettings,
            showSettings,
        }, controller.signal);

        window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel: 'anki' } }));
        window.dispatchEvent(new CustomEvent(INTERFACE_LANGUAGE_CHANGE_EVENT, { detail: { interfaceLanguage: 'ja' } }));
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings: { theme: 'light' } } }));
        window.dispatchEvent(new CustomEvent(USERSCRIPT_HTTP_BRIDGE_READY_EVENT));
        controller.abort();

        expect(showSettings).toHaveBeenCalledWith('anki');
        expect(setInterfaceLanguage).toHaveBeenCalledWith('ja');
        expect(settings.theme).toBe('light');
        expect(setSettings).toHaveBeenCalledWith(settings);
        expect(applyTheme).toHaveBeenCalled();
        expect(saveSettings).toHaveBeenCalledWith(settings);
        expect(clearBridgeCaches).toHaveBeenCalled();
    });

    it('warms Anki status on an idle callback after startup delay', async () => {
        vi.useFakeTimers();
        const requestIdleCallback = vi.fn((callback: () => void) => {
            callback();
            return 1;
        });
        Object.defineProperty(window, 'requestIdleCallback', {
            configurable: true,
            value: requestIdleCallback,
        });
        const warmStatusIndex = vi.fn().mockResolvedValue({ entries: new Map() });
        const recolorRenderedAnkiWordsFromCache = vi.fn().mockResolvedValue(undefined);

        scheduleReaderAnkiStatusWarmup({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }),
            isDestroyed: () => false,
            onRecolorError: vi.fn(),
            recolorRenderedAnkiWordsFromCache,
            warmStatusIndex,
        });

        await vi.advanceTimersByTimeAsync(999);
        expect(warmStatusIndex).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        await Promise.resolve();

        expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
        expect(warmStatusIndex).toHaveBeenCalled();
        expect(recolorRenderedAnkiWordsFromCache).toHaveBeenCalled();
    });

    it('keeps autoplay activation gated by settings and gestures', () => {
        expect(canAttemptReaderAutoAudio({
            settings: { ...DEFAULT_SETTINGS, audioEnabled: false },
            subtitleSurfaceSelector: '.jpdb-subtitle-player',
            trigger: 'modal',
            userGesture: true,
        })).toBe(false);

        expect(canAttemptReaderAutoAudio({
            settings: { ...DEFAULT_SETTINGS, audioAutoPlayMode: 'hover' },
            subtitleSurfaceSelector: '.jpdb-subtitle-player',
            trigger: 'modal',
            userGesture: true,
        })).toBe(false);

        expect(canAttemptReaderAutoAudio({
            settings: { ...DEFAULT_SETTINGS, audioEnabled: true, autoPlayAudio: true },
            subtitleSurfaceSelector: '.jpdb-subtitle-player',
            trigger: 'modal',
            userGesture: true,
        })).toBe(true);
    });
});
