import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';

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
}

type CompanionHost = typeof globalThis & { __yomuCompanions?: Record<string, unknown> };

describe('ReaderApp core startup', () => {
    let app: ReaderApp | undefined;

    afterEach(() => {
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
