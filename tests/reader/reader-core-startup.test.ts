import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    activeLearningTargetLanguage,
    resetActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import {
    endSettingsResetGuard,
} from '../../src/reader/settings';
import { rejectOnboardingTargetPersistence } from './helpers/rejected-onboarding-target';

interface StartupInternals {
    dictionaryStyles: {
        refresh: () => Promise<void>;
        remove: () => void;
    };
    installStyles: () => void;
    installCoreSurfaces: () => Promise<void>;
    loadInitialSettings: () => Promise<boolean>;
    applyReaderThemeClasses: (theme: 'dark' | 'light') => void;
    installFab: () => void;
    setupAutoScan: () => void;
    installSettingsStorageSubscription: () => void;
    installTargetOwnedCoreSurfaces: () => void;
    registerMenuCommands: () => void;
    bindEvents: () => void;
    installOfflineParsingDictionaries: () => Promise<void>;
    parser: { parse: (...args: unknown[]) => Promise<unknown> };
    settings: ReaderSettings;
    onboarding: { complete(openSettings: boolean | 'dictionaries'): Promise<void> };
}

type CompanionHost = typeof globalThis & { __yomuCompanions?: Record<string, unknown> };

describe('ReaderApp core startup', () => {
    let app: ReaderApp | undefined;

    afterEach(() => {
        endSettingsResetGuard();
        resetActiveLearningTargetLanguage();
        app?.destroy();
        app = undefined;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.head.replaceChildren();
        document.body.replaceChildren();
    });

    it('does not hold reader controls behind a delayed dictionary-style refresh', async () => {
        app = new ReaderApp();
        const internals = app as unknown as StartupInternals;
        let releaseDictionaryStyles: (() => void) | undefined;
        const dictionaryStylesFinished = new Promise<void>(resolve => {
            releaseDictionaryStyles = resolve;
        });
        const refresh = vi.fn(() => dictionaryStylesFinished);
        const remove = vi.fn();
        internals.dictionaryStyles = { refresh, remove };
        // jsdom cannot parse the production stylesheet's modern @layer rules;
        // styling itself is outside this startup-order regression.
        internals.installStyles = vi.fn();

        await expect(app.init({ showWelcome: false })).resolves.toBeUndefined();

        expect(refresh).toHaveBeenCalledOnce();
        expect(document.querySelector('.jpdb-reader-fab')).not.toBeNull();
        expect(document.querySelector('.jpdb-subtitle-player')).not.toBeNull();

        releaseDictionaryStyles?.();
        await dictionaryStylesFinished;
    });

    it('does not resume startup after ownership destroys it while settings are loading', async () => {
        app = new ReaderApp();
        const internals = app as unknown as StartupInternals;
        let releaseSettings: ((showWelcome: boolean) => void) | undefined;
        const settingsFinished = new Promise<boolean>(resolve => {
            releaseSettings = resolve;
        });
        internals.loadInitialSettings = vi.fn(() => settingsFinished);
        internals.installCoreSurfaces = vi.fn(async () => undefined);

        const initializing = app.init({ showWelcome: false });
        await vi.waitFor(() => {
            expect(internals.loadInitialSettings).toHaveBeenCalledOnce();
        });
        app.destroy();
        releaseSettings?.(false);
        await initializing;

        expect(internals.installCoreSurfaces).not.toHaveBeenCalled();
        expect(document.querySelector('.jpdb-reader-fab')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-player')).toBeNull();
    });

    it('keeps a fresh ordinary page usable and target-owned work inert when setup is dismissed', async () => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        const hostAction = document.createElement('button');
        hostAction.textContent = '日本語の本文を開く';
        const hostClick = vi.fn();
        hostAction.addEventListener('click', hostClick);
        document.body.append(hostAction);

        app = new ReaderApp();
        const internals = app as unknown as StartupInternals;
        internals.installStyles = vi.fn();
        const dictionaryRefresh = vi.spyOn(internals.dictionaryStyles, 'refresh');
        const parse = vi.spyOn(internals.parser, 'parse');
        internals.installFab = vi.fn();
        internals.setupAutoScan = vi.fn();
        internals.installSettingsStorageSubscription = vi.fn();
        internals.registerMenuCommands = vi.fn();
        internals.bindEvents = vi.fn();
        internals.installOfflineParsingDictionaries = vi.fn(async () => undefined);

        const initializing = app.init({ showWelcome: true });
        await vi.waitFor(() => {
            expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        });

        document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]')?.click();
        await initializing;
        hostAction.click();

        expect(hostClick).toHaveBeenCalledOnce();
        expect(dictionaryRefresh).not.toHaveBeenCalled();
        expect(parse).not.toHaveBeenCalled();
        expect(internals.installOfflineParsingDictionaries).not.toHaveBeenCalled();
        expect(internals.installFab).not.toHaveBeenCalled();
        expect(internals.setupAutoScan).not.toHaveBeenCalled();
        expect(internals.installSettingsStorageSubscription).not.toHaveBeenCalled();
        expect(internals.registerMenuCommands).not.toHaveBeenCalled();
        expect(internals.bindEvents).not.toHaveBeenCalled();
    });

    it('keeps a rejected target choice inert and asks again on the next ordinary-page boot', async () => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        resetActiveLearningTargetLanguage();
        app = new ReaderApp();
        let internals = app as unknown as StartupInternals;
        internals.installStyles = vi.fn();
        internals.installTargetOwnedCoreSurfaces = vi.fn();

        const initializing = app.init({ showWelcome: true });
        await vi.waitFor(() => {
            expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        });
        await rejectOnboardingTargetPersistence(internals.onboarding);
        expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]')?.click();
        await initializing;

        expect(internals.settings.learningTargetChosen).toBe(false);
        expect(internals.settings.languageProfiles[0]?.targetLanguage).toBe('ja');
        expect(activeLearningTargetLanguage()).toBe('ja');
        expect(internals.installTargetOwnedCoreSurfaces).not.toHaveBeenCalled();

        endSettingsResetGuard();
        app.destroy();
        app = new ReaderApp();
        internals = app as unknown as StartupInternals;
        internals.installStyles = vi.fn();
        const reloading = app.init({ showWelcome: true });
        await vi.waitFor(() => {
            expect(document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value).toBe('');
        });
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]')?.click();
        await reloading;
    });

    it('does not apply theme classes after page teardown removes the document root', () => {
        app = new ReaderApp();
        const internals = app as unknown as StartupInternals;
        const rootSpy = vi.spyOn(document, 'documentElement', 'get').mockReturnValue(null as unknown as HTMLElement);

        expect(() => internals.applyReaderThemeClasses('dark')).not.toThrow();

        rootSpy.mockRestore();
    });

    it.each([
        { route: '/', videoKind: 'none', showsSubtitleAction: false },
        { route: '/', videoKind: 'feed-preview', showsSubtitleAction: false },
        { route: '/watch?v=target-video', videoKind: 'main-player', showsSubtitleAction: true },
        { route: '/shorts/target-video', videoKind: 'main-player', showsSubtitleAction: true },
    ])('shows subtitle discovery only for an actual YouTube video candidate at $route', ({
        route,
        videoKind,
        showsSubtitleAction,
    }) => {
        vi.stubGlobal('location', {
            hostname: 'www.youtube.com',
            pathname: route,
            href: `https://www.youtube.com${route}`,
        });
        if (videoKind !== 'none') {
            const video = document.createElement('video');
            Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
            if (videoKind === 'feed-preview') {
                const preview = document.createElement('ytd-video-preview');
                preview.append(video);
                document.body.append(preview);
            } else {
                const player = document.createElement('div');
                player.id = 'movie_player';
                video.className = 'html5-main-video';
                player.append(video);
                document.body.append(player);
            }
        }

        app = new ReaderApp();
        (app as unknown as StartupInternals).installFab();
        document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();

        expect(Boolean(document.querySelector('[data-radial-id="subtitles"]')))
            .toBe(showsSubtitleAction);
    });

    it('keeps the puck safe and hides subtitle discovery when the video companion is missing', () => {
        const host = globalThis as CompanionHost;
        const previous = Object.getOwnPropertyDescriptor(host, '__yomuCompanions');
        const withoutVideo = { ...(host.__yomuCompanions ?? {}) };
        delete withoutVideo.video;
        Object.defineProperty(host, '__yomuCompanions', {
            configurable: true,
            writable: true,
            value: withoutVideo,
        });

        try {
            app = new ReaderApp();
            (app as unknown as StartupInternals).installFab();

            expect(() => document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click())
                .not.toThrow();
            expect(document.querySelector('[data-radial-id="subtitles"]')).toBeNull();
        } finally {
            app?.destroy();
            app = undefined;
            if (previous) Object.defineProperty(host, '__yomuCompanions', previous);
            else Reflect.deleteProperty(host, '__yomuCompanions');
        }
    });
});
