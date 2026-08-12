import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME, INTERFACE_LANGUAGE_CHANGE_EVENT, NEW_TAB_PAGE_URL, OPEN_SETTINGS_EVENT, SETTINGS_CHANGE_EVENT, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from '../../src/reader/app/constants';
import { canAttemptReaderAutoAudio } from '../../src/reader/audio/activation';
import { registerReaderMenuCommands } from '../../src/reader/app/menu-commands';
import { bindReaderRuntimeEvents } from '../../src/reader/app/runtime-events';
import { publishSettingsChange } from '../../src/reader/settings/settings-change-bus';
import {
    AUTO_SCAN_MIN_INTERVAL_MS,
    YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
    YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
    YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
    backgroundPitchEnrichmentOptionsForHost,
    handleReaderActionPillLink,
    nestedPitchEnrichmentOptionsForHost,
    throttledAutoScanDelay,
} from '../../src/reader/app/main-helpers';
import { normalizedNestedParseOptions } from '../../src/reader/app/main-lookup-helpers';
import { shouldShowReaderOnboarding } from '../../src/reader/app/startup';
import { isHostedYomuOrigin } from '../../src/reader/app/storage';
import { documentLooksLikeImageReadingPage } from '../../src/reader/app/dom-helpers';
import { scheduleReaderAnkiStatusWarmup } from '../../src/reader/app/status-warmup';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { openUrlInNewTab, pauseActiveVideo } from '../../src/reader/ui/browser';

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

describe('pauseActiveVideo', () => {
    function makeVideo({ paused, width = 100, height = 100 }: { paused: boolean; width?: number; height?: number }): HTMLVideoElement {
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
        let isPaused = paused;
        Object.defineProperty(video, 'paused', { configurable: true, get: () => isPaused });
        video.pause = vi.fn(() => { isPaused = true; });
        Object.defineProperty(video, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, width, height) });
        document.body.append(video);
        return video;
    }

    afterEach(() => {
        document.querySelectorAll('video').forEach(video => video.remove());
    });

    it('pauses the playing video and returns it so the caller can resume it later', () => {
        const playing = makeVideo({ paused: false });
        expect(pauseActiveVideo()).toBe(playing);
        expect(playing.pause).toHaveBeenCalledTimes(1);
        expect(playing.paused).toBe(true);
    });

    it('prefers the playing video over a larger paused one', () => {
        makeVideo({ paused: true, width: 800, height: 600 });
        const playing = makeVideo({ paused: false, width: 200, height: 150 });
        expect(pauseActiveVideo()).toBe(playing);
    });

    it('returns undefined when every video is already paused so a user-paused video is never resumed', () => {
        const already = makeVideo({ paused: true });
        expect(pauseActiveVideo()).toBeUndefined();
        expect(already.pause).not.toHaveBeenCalled();
    });

    it('returns undefined when there is no playable video', () => {
        expect(pauseActiveVideo()).toBeUndefined();
    });
});

describe('reader runtime helpers', () => {
    it('does not grant hosted storage authority to an unrelated localhost app', () => {
        vi.stubGlobal('location', {
            href: 'http://localhost:9999/study/',
            hostname: 'localhost',
            origin: 'http://localhost:9999',
            pathname: '/study/',
        });
        expect(isHostedYomuOrigin()).toBe(false);

        vi.stubGlobal('location', {
            href: 'http://localhost:5174/study/',
            hostname: 'localhost',
            origin: 'http://localhost:5174',
            pathname: '/study/',
        });
        expect(isHostedYomuOrigin()).toBe(true);
    });

    it('keeps hosted pages out of onboarding', () => {
        expect(shouldShowReaderOnboarding(true, 'https://hrussellzfac023.github.io/yomu-reader/')).toBe(false);
        expect(shouldShowReaderOnboarding(true, 'https://example.com/article')).toBe(true);
        expect(shouldShowReaderOnboarding(false, 'https://example.com/article')).toBe(false);
    });

    it('gives every host the paced YouTube-tier public pitch budget', () => {
        const desktop = {
            publicLookupLimit: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
            publicLookupTotalLimit: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
            publicLookupPageBudget: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
            publicLookupTermLimit: 3,
            substantivePublicLookupOnly: true,
        };
        const mobile = {
            publicLookupLimit: YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
            publicLookupTotalLimit: YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
            publicLookupPageBudget: YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
            publicLookupTermLimit: 3,
            substantivePublicLookupOnly: true,
        };
        expect(backgroundPitchEnrichmentOptionsForHost('example.com')).toEqual(desktop);
        expect(backgroundPitchEnrichmentOptionsForHost('example.com', true)).toEqual(mobile);
        expect(backgroundPitchEnrichmentOptionsForHost('www.youtube.com')).toEqual(desktop);
        expect(backgroundPitchEnrichmentOptionsForHost('m.youtube.com', true)).toEqual(mobile);
        expect(nestedPitchEnrichmentOptionsForHost('example.com')).toEqual({ publicLookupLimit: 3 });
        expect(nestedPitchEnrichmentOptionsForHost('www.youtube.com')).toEqual({ publicLookupLimit: 3 });
    });

    it('keeps segmented boundary repair enabled for credentialed popup examples', () => {
        expect(normalizedNestedParseOptions({}, {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
        }).allowSegmentedFallback).toBe(true);
        expect(normalizedNestedParseOptions({ allowSegmentedFallback: false }, {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
        }).allowSegmentedFallback).toBe(false);
    });

    it('treats large visible image feeds as OCR reading pages without Japanese DOM text', () => {
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        const image = document.createElement('img');
        image.src = 'https://cdn.example.test/page.jpg';
        image.getBoundingClientRect = () => new DOMRect(100, 20, 760, 720);
        document.body.replaceChildren(document.createTextNode('Explore'), image);

        expect(documentLooksLikeImageReadingPage()).toBe(true);
    });

    it('treats explicit canvas OCR opt-in surfaces as image reading pages', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1600;
        canvas.dataset.yomuCanvasOcr = 'on';
        document.body.replaceChildren(document.createTextNode('Scanned PDF'), canvas);

        expect(documentLooksLikeImageReadingPage()).toBe(true);
    });

    it('does not treat icon-only pages as OCR reading pages', () => {
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        const image = document.createElement('img');
        image.src = 'https://cdn.example.test/icon.png';
        image.getBoundingClientRect = () => new DOMRect(20, 20, 80, 80);
        document.body.replaceChildren(document.createTextNode('Home'), image);

        expect(documentLooksLikeImageReadingPage()).toBe(false);
    });

    it('registers userscript menu commands and preserves page opener isolation', () => {
        const commands = new Map<string, () => void>();
        vi.stubGlobal('GM_registerMenuCommand', vi.fn((name: string, fn: () => void) => {
            commands.set(name, fn);
        }));
        const opened = { opener: window } as Window;
        const open = vi.spyOn(window, 'open').mockReturnValue(opened);
        const cycleOcr = vi.fn();
        const toggleAnnotations = vi.fn();
        const toggleAudio = vi.fn();
        const toggleSiteLanguage = vi.fn();
        const toggleYoutube = vi.fn();

        registerReaderMenuCommands({
            cycleOcr,
            factoryReset: vi.fn(),
            getSettings: () => ({ ...DEFAULT_SETTINGS, showFloatingButton: false }),
            installFloatingButton: vi.fn(),
            logInfo: vi.fn(),
            saveSettings: vi.fn().mockResolvedValue(undefined),
            showSettings: vi.fn(),
            toggleAnnotations,
            toggleAudio,
            toggleSiteLanguage,
            toggleYoutube,
        });

        commands.get(`${APP_NAME} open Study`)?.();
        commands.get(`${APP_NAME} annotations`)?.();
        commands.get(`${APP_NAME} audio`)?.();
        commands.get(`${APP_NAME} OCR`)?.();
        commands.get(`${APP_NAME} language`)?.();
        commands.get(`${APP_NAME} YouTube`)?.();

        expect(open).toHaveBeenCalledWith(NEW_TAB_PAGE_URL, '_blank');
        expect(opened.opener).toBeNull();
        expect(toggleAnnotations).toHaveBeenCalledTimes(1);
        expect(toggleAudio).toHaveBeenCalledTimes(1);
        expect(cycleOcr).toHaveBeenCalledTimes(1);
        expect(toggleSiteLanguage).toHaveBeenCalledTimes(1);
        expect(toggleYoutube).toHaveBeenCalledTimes(1);
    });

    it('opens reader action pills without leaking the click to YouTube page handlers', () => {
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true">
                <a class="jpdb-reader-pill jpdb-reader-action-pill" href="https://jiten.moe/search?query=%E6%97%A5%E6%9C%AC%E8%AA%9E" target="_blank" rel="noopener">
                    Jiten
                </a>
            </div>
        `;
        const pageClick = vi.fn();
        const open = vi.fn(() => true);
        document.addEventListener('click', pageClick);
        const link = document.querySelector<HTMLAnchorElement>('.jpdb-reader-action-pill')!;
        link.addEventListener('click', event => handleReaderActionPillLink(event, open));

        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(click);

        expect(open).toHaveBeenCalledWith('https://jiten.moe/search?query=%E6%97%A5%E6%9C%AC%E8%AA%9E');
        expect(click.defaultPrevented).toBe(true);
        expect(pageClick).not.toHaveBeenCalled();
        document.removeEventListener('click', pageClick);
    });

    it('consumes unsafe action-pill URLs without opening or page navigation', () => {
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true">
                <a class="jpdb-reader-pill jpdb-reader-action-pill" href="javascript:alert(1)" target="_blank" rel="noopener">Jisho</a>
            </div>
        `;
        const open = vi.fn(() => true);
        const link = document.querySelector<HTMLAnchorElement>('.jpdb-reader-action-pill')!;
        link.addEventListener('click', event => handleReaderActionPillLink(event, open));

        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(click);

        expect(open).not.toHaveBeenCalled();
        expect(click.defaultPrevented).toBe(true);
    });

    it('prefers userscript tab APIs for action-pill URLs', () => {
        const openInTab = vi.fn();
        vi.stubGlobal('GM_openInTab', openInTab);
        const open = vi.spyOn(window, 'open').mockReturnValue(null);

        expect(openUrlInNewTab('https://jpdb.io/vocabulary/1/test')).toBe(true);

        expect(openInTab).toHaveBeenCalledWith('https://jpdb.io/vocabulary/1/test', { active: true, insert: true, setParent: false });
        expect(open).not.toHaveBeenCalled();
    });

    it('routes runtime custom events through the supplied ReaderApp callbacks', () => {
        vi.stubGlobal('location', {
            href: 'https://yomureader.com/video-player/',
            hostname: 'yomureader.com',
            origin: 'https://yomureader.com',
            pathname: '/video-player/',
        });
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
        expect(settings.theme).toBe('light');
        publishSettingsChange({ settings: { theme: 'light' } });
        window.dispatchEvent(new CustomEvent(USERSCRIPT_HTTP_BRIDGE_READY_EVENT));
        controller.abort();

        expect(showSettings).toHaveBeenCalledWith('anki');
        expect(setInterfaceLanguage).toHaveBeenCalledWith('ja');
        expect(settings.theme).toBe('light');
        expect(setSettings).toHaveBeenCalledWith(settings);
        expect(applyTheme).toHaveBeenCalled();
        // The theme arrived in the event from the surface the learner switched
        // it on, so the mirroring write declares it.
        expect(saveSettings).toHaveBeenCalledWith(settings, ['theme']);
        expect(clearBridgeCaches).toHaveBeenCalled();
    });

    it('does not let an arbitrary host open settings or persist appearance through forged events', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=test',
            hostname: 'www.youtube.com',
            origin: 'https://www.youtube.com',
            pathname: '/watch',
        });
        const controller = new AbortController();
        const setInterfaceLanguage = vi.fn();
        const showSettings = vi.fn();
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        bindReaderRuntimeEvents({
            applyTheme: () => undefined,
            clearBridgeCaches: () => undefined,
            getSettings: () => DEFAULT_SETTINGS,
            isDestroyed: () => false,
            saveSettings,
            setInterfaceLanguage,
            setSettings: () => undefined,
            showSettings,
        }, controller.signal);

        window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel: 'providers' } }));
        window.dispatchEvent(new CustomEvent(INTERFACE_LANGUAGE_CHANGE_EVENT, {
            detail: { interfaceLanguage: 'ja' },
        }));
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
            detail: { settings: { theme: 'dark' } },
        }));

        expect(showSettings).not.toHaveBeenCalled();
        expect(setInterfaceLanguage).not.toHaveBeenCalled();
        expect(saveSettings).not.toHaveBeenCalled();
        controller.abort();
    });

    it('keeps full settings sandbox-private and exposes only hosted appearance fields', () => {
        let publicDetail: unknown;
        const capture = (event: Event): void => {
            publicDetail = (event as CustomEvent).detail;
        };
        window.addEventListener(SETTINGS_CHANGE_EVENT, capture, { once: true });
        publishSettingsChange({
            settings: { ...DEFAULT_SETTINGS, apiKey: 'never-page-visible', jitenApiKey: 'also-private' },
        });
        expect(publicDetail).toEqual({ preview: false, remote: false, settings: {} });

        vi.stubGlobal('location', {
            href: 'https://yomureader.com/',
            hostname: 'yomureader.com',
            origin: 'https://yomureader.com',
            pathname: '/',
        });
        window.addEventListener(SETTINGS_CHANGE_EVENT, capture, { once: true });
        publishSettingsChange({
            settings: {
                accentColor: '#5ea780',
                apiKey: 'never-page-visible',
                interfaceLanguage: 'ja',
                jitenApiKey: 'also-private',
                theme: 'dark',
            },
        });
        expect(publicDetail).toEqual({
            preview: false,
            remote: false,
            settings: { accentColor: '#5ea780', interfaceLanguage: 'ja', theme: 'dark' },
        });
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

    it('does not schedule Anki status warmup when Anki mining is disabled', async () => {
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
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: false, apiKey: 'jpdb-key' }),
            isDestroyed: () => false,
            onRecolorError: vi.fn(),
            recolorRenderedAnkiWordsFromCache,
            warmStatusIndex,
        });

        await vi.advanceTimersByTimeAsync(1000);
        await Promise.resolve();

        expect(requestIdleCallback).not.toHaveBeenCalled();
        expect(warmStatusIndex).not.toHaveBeenCalled();
        expect(recolorRenderedAnkiWordsFromCache).not.toHaveBeenCalled();
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

    it('only suppresses hover auto-audio for an audibly playing page video', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover' as const,
            suppressAutoAudioOnVideo: true,
        };
        const gate = () => canAttemptReaderAutoAudio({
            settings,
            subtitleSurfaceSelector: '.jpdb-subtitle-player',
            trigger: 'hover',
            userGesture: false,
        });
        const video = document.createElement('video');
        video.getBoundingClientRect = () => ({ width: 320, height: 180, top: 0, left: 0, right: 320, bottom: 180, x: 0, y: 0, toJSON: () => ({}) });
        document.body.append(video);

        try {
            // A merely present, paused video must not silence hover term audio.
            expect(gate()).toBe(true);

            // An audibly playing video should still suppress it.
            Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
            expect(gate()).toBe(false);

            // Playing but muted produces no sound, so it must not suppress.
            video.muted = true;
            expect(gate()).toBe(true);
        } finally {
            video.remove();
        }
    });
});

describe('throttledAutoScanDelay (steady-state churn throttle)', () => {
    const NOW = 1_000_000;

    it('does not throttle non-debounced (forced) scans even on frequent hosts', () => {
        // A forced scan just after another scan started keeps its own delay.
        expect(throttledAutoScanDelay(320, { debounce: false }, NOW - 100, NOW, true)).toBe(320);
    });

    it('does not throttle on non-frequent hosts', () => {
        expect(throttledAutoScanDelay(320, { debounce: true }, NOW - 100, NOW, false)).toBe(320);
    });

    it('stretches a debounced scan to the min interval when the last scan started recently', () => {
        // 100ms since the last scan began => the next debounced scan is floored
        // to AUTO_SCAN_MIN_INTERVAL_MS - 100 (still bounded by the interval).
        expect(throttledAutoScanDelay(320, { debounce: true }, NOW - 100, NOW, true))
            .toBe(AUTO_SCAN_MIN_INTERVAL_MS - 100);
    });

    it('never floors above the min interval even immediately after a scan started', () => {
        expect(throttledAutoScanDelay(50, { debounce: true }, NOW, NOW, true)).toBe(AUTO_SCAN_MIN_INTERVAL_MS);
    });

    it('keeps the requested delay once the interval has already elapsed', () => {
        // Storm has settled (>= interval since last scan): the trailing settle
        // scan uses its own (short) delay — nothing is dropped or over-delayed.
        expect(throttledAutoScanDelay(320, { debounce: true }, NOW - AUTO_SCAN_MIN_INTERVAL_MS - 500, NOW, true)).toBe(320);
    });

    it('keeps a delay already larger than the floor', () => {
        expect(throttledAutoScanDelay(2_000, { debounce: true }, NOW - 100, NOW, true)).toBe(2_000);
    });
});
