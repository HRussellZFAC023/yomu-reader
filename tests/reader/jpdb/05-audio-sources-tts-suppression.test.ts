import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AudioPlayer,
    CardPopoverRenderer,
    DEFAULT_AUDIO_SOURCES,
    DEFAULT_SETTINGS,
    FloatingButtonController,
    IMMERSION_STUDY_CSS,
    ImmersionKitClient,
    ImmersionPopoverController,
    READER_WORD_CSS,
    ReaderApp,
    ReaderAudioActions,
    StudySourceController,
    TEST_PROXY_URL,
    card,
    createPointerEvent,
    decodeJpdbAudioBlob,
    detectGrammarHints,
    fetchWithCorsFallbacks,
    getAudioCandidates,
    immersionExample,
    jitenTestCard,
    jpdbAudioRequest,
    loadSettings,
    localizeSettingsForm,
    mockFloatingButtonRects,
    mockSpeechSynthesis,
    normalizeAudioSources,
    normalizeJpdbAudioIds,
    parseJpdbAudioData,
    readFormSettings,
    renderGrammarHints,
    renderSettingsForm,
    restoreInheritedButtonRectLookup,
    NO_EXPLICIT_USER_CHOICE,
    saveSettings,
    stubFloatingButtonActions,
    syncStickyBottomSheetAvailability,
    unproxiedFetchTarget,
    waitForExpect,
    withImmediateAnimationFrame,
    withViewport,
} from './fixtures';
import type {
    ImmersionKitExample,
    JPDBCard,
    ReaderSettings,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('keeps Yomu hosted audio default-on and every other built-in audio source default-off', () => {
        expect(DEFAULT_AUDIO_SOURCES.map(source => source.type)).toEqual([
            'custom-json',
            'jpod101',
            'language-pod-101',
            'jisho',
            'bunpro',
            'jiten-tts',
            'jpdb-tts',
            'text-to-speech',
        ]);
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', voice: '', enabled: true });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'jpod101', url: '', voice: '', enabled: false });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'language-pod-101', url: '', voice: '', enabled: false });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'jisho', url: '', voice: '', enabled: false });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'bunpro', url: '', voice: '', enabled: false });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'jiten-tts', url: '', voice: '', enabled: false });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'jpdb-tts', url: '', voice: '', enabled: false });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'text-to-speech', url: '', voice: '', enabled: false });
        expect(normalizeAudioSources([
            { type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', voice: '', enabled: true },
            { type: 'jpod101', url: '', voice: '', enabled: true },
            { type: 'language-pod-101', url: '', voice: '', enabled: true },
            { type: 'jisho', url: '', voice: '', enabled: true },
            { type: 'text-to-speech', url: '', voice: '', enabled: true },
        ])).toEqual([
            { type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', voice: '', enabled: true },
            { type: 'jpod101', url: '', voice: '', enabled: false },
            { type: 'language-pod-101', url: '', voice: '', enabled: false },
            { type: 'jisho', url: '', voice: '', enabled: false },
            { type: 'bunpro', url: '', voice: '', enabled: false },
            { type: 'jiten-tts', url: '', voice: '', enabled: false },
            { type: 'jpdb-tts', url: '', voice: '', enabled: false },
            { type: 'text-to-speech', url: '', voice: '', enabled: false },
        ]);
        expect(normalizeAudioSources([
            { type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', voice: '', enabled: true },
            { type: 'jpod101', url: '', voice: '', enabled: true },
            { type: 'language-pod-101', url: '', voice: '', enabled: true },
            { type: 'jisho', url: '', voice: '', enabled: true },
            { type: 'text-to-speech', url: '', voice: '', enabled: true },
            { type: 'custom-json', url: 'http://localhost:9090/?term={term}&reading={reading}', voice: '', enabled: true },
        ])).toEqual([
            { type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', voice: '', enabled: true },
            { type: 'jpod101', url: '', voice: '', enabled: true },
            { type: 'language-pod-101', url: '', voice: '', enabled: true },
            { type: 'jisho', url: '', voice: '', enabled: true },
            { type: 'text-to-speech', url: '', voice: '', enabled: true },
            { type: 'custom-json', url: 'http://localhost:9090/?term={term}&reading={reading}', voice: '', enabled: true },
            { type: 'bunpro', url: '', voice: '', enabled: false },
        ]);
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', voice: '', enabled: true });
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'bunpro', url: '', voice: '', enabled: false });
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'jiten-tts', url: '', voice: '', enabled: false });
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'jpdb-tts', url: '', voice: '', enabled: false });
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'text-to-speech', url: '', voice: '', enabled: false });
        expect(DEFAULT_SETTINGS.audioEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.audioFallbackChimeEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.autoPlayAudio).toBe(true);
        expect(DEFAULT_SETTINGS.suppressAutoAudioOnVideo).toBe(true);
        expect(DEFAULT_SETTINGS.audioAutoPlayMode).toBe('all');
        expect(DEFAULT_SETTINGS.audioTtsMode).toBe('fallback');
    });

    it('generates Jiten TTS candidates for Jiten-backed cards', async () => {
        await expect(getAudioCandidates(
            { type: 'jiten-tts', url: '', voice: 'male2', enabled: true },
            jitenTestCard({ vid: 999, sid: 9, jitenWordId: 42, jitenReadingIndex: 2 }),
            1000,
            '',
        )).resolves.toEqual([{
            url: 'https://api.jiten.moe/api/tts/word/42/2?voice=male2',
            sourceUrl: 'https://api.jiten.moe/api/tts/word/42/2?voice=male2',
        }]);

        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            results: [{
                wordId: 42,
                readingIndex: 2,
                text: card.spelling,
                rubyText: `${card.spelling}[${card.reading}]`,
            }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(getAudioCandidates(
                { type: 'jiten-tts', url: '', voice: '', enabled: true },
                { ...card, source: 'jpdb' },
                1000,
                TEST_PROXY_URL,
            )).resolves.toEqual([
                'female',
                'female2',
                'male',
                'male2',
                'asmr',
            ].map(voice => ({
                url: `https://api.jiten.moe/api/tts/word/42/2?voice=${voice}`,
                sourceUrl: `https://api.jiten.moe/api/tts/word/42/2?voice=${voice}`,
            })));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('filters JPDB text-to-speech candidates by the selected voice', async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const target = unproxiedFetchTarget(input);
            if (target.includes('/vocabulary/1456360/')) {
                return Promise.resolve(new Response(`
                    <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/読む/よむ">
                    <div class="result vocabulary">
                        <div class="subsection-headword">
                            <a href="/vocabulary/1456360/読む/よむ#a"><ruby>読<rt>よ</rt></ruby>む</a>
                            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/word,f1/word,m2/word,f2/word"></a>
                        </div>
                    </div>
                `, { status: 200 }));
            }
            return Promise.resolve(new Response('not found', { status: 404 }));
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const jpdbCard = { ...card, vid: 1456360, sid: 1456360, spelling: '読む', reading: 'よむ', source: 'jpdb' as const };

            await expect(getAudioCandidates(
                { type: 'jpdb-tts', url: '', voice: 'f1', enabled: true },
                jpdbCard,
                1000,
                TEST_PROXY_URL,
            )).resolves.toEqual([
                expect.objectContaining({ jpdbAudioId: 'f1/word' }),
            ]);

            await expect(getAudioCandidates(
                { type: 'jpdb-tts', url: '', voice: 'female', enabled: true },
                jpdbCard,
                1000,
                TEST_PROXY_URL,
            )).resolves.toEqual([
                expect.objectContaining({ jpdbAudioId: 'f1/word' }),
                expect.objectContaining({ jpdbAudioId: 'f2/word' }),
            ]);

            await expect(getAudioCandidates(
                { type: 'jpdb-tts', url: '', voice: 'm2', enabled: true },
                jpdbCard,
                1000,
                TEST_PROXY_URL,
            )).resolves.toEqual([
                expect.objectContaining({ jpdbAudioId: 'm2/word' }),
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not play a different JPDB voice when the selected voice is absent from public HTML', async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const target = unproxiedFetchTarget(input);
            if (target.includes('/vocabulary/1456360/')) {
                return Promise.resolve(new Response(`
                    <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/読む/よむ">
                    <div class="result vocabulary">
                        <div class="subsection-headword">
                            <a href="/vocabulary/1456360/読む/よむ#a"><ruby>読<rt>よ</rt></ruby>む</a>
                            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/public-only"></a>
                        </div>
                    </div>
                `, { status: 200 }));
            }
            return Promise.resolve(new Response('not found', { status: 404 }));
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(getAudioCandidates(
                { type: 'jpdb-tts', url: '', voice: 'female', enabled: true },
                { ...card, vid: 1456360, sid: 1456360, spelling: '読む', reading: 'よむ', source: 'jpdb' as const },
                1000,
                TEST_PROXY_URL,
            )).resolves.toEqual([]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('normalizes and decodes JPDB page audio references', async () => {
        expect(parseJpdbAudioData('m1/a+m1/b,/static/user/example.mp3,https://bad.example/audio.mp3,../bad')).toEqual([
            'm1/a+m1/b',
            '/static/user/example.mp3',
        ]);
        expect(normalizeJpdbAudioIds('m1/a,m1/a,m1/b')).toEqual(['m1/a', 'm1/b']);
        expect(jpdbAudioRequest('m1/e9cac7e3d132')).toMatchObject({
            url: 'https://jpdb.io/static/v/m1/e9cac7e3d132',
            headers: { 'X-Access': "please don't steal these files" },
            encoded: true,
        });

        const oggHeader = [0x4f, 0x67, 0x67, 0x53];
        const encoded = new Uint8Array(oggHeader.map((byte, index) => byte ^ [0x06, 0x23, 0x54, 0x0f][index]));
        const decoded = await decodeJpdbAudioBlob(new Blob([encoded], { type: 'audio/ogg' }), true);
        const decodedBytes = await new Promise<number[]>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve([...new Uint8Array(reader.result as ArrayBuffer)]);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(decoded);
        });

        expect(decodedBytes).toEqual(oggHeader);
        expect(decoded.type).toBe('audio/ogg; codecs=opus');
        await expect(decodeJpdbAudioBlob(new Blob(['<!doctype html>'], { type: 'text/html' }), true))
            .rejects.toThrow('JPDB audio was not playable.');
    });

    it('suppresses automatic lookup audio while a video page is active', () => {
        const app = new ReaderApp();
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'paused', { configurable: true, value: false });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
        Object.defineProperty(video, 'muted', { configurable: true, value: false });
        Object.defineProperty(video, 'volume', { configurable: true, value: 1.0 });
        Object.defineProperty(video, 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, 0, 640, 360),
        });
        document.body.append(video);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            shouldAutoPlay(card: JPDBCard, trigger: 'modal' | 'hover', userGesture?: boolean, anchor?: HTMLElement): boolean;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'all',
            suppressAutoAudioOnVideo: true,
        };

        try {
            expect(internals.shouldAutoPlay(card, 'hover', false)).toBe(false);
            expect(internals.shouldAutoPlay(card, 'modal', true)).toBe(true);

            internals.settings = { ...internals.settings, suppressAutoAudioOnVideo: false };

            expect(internals.shouldAutoPlay(card, 'hover', false)).toBe(true);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not suppress automatic lookup audio when the video is paused', () => {
        const app = new ReaderApp();
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
        Object.defineProperty(video, 'muted', { configurable: true, value: false });
        Object.defineProperty(video, 'volume', { configurable: true, value: 1.0 });
        Object.defineProperty(video, 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, 0, 640, 360),
        });
        document.body.append(video);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            shouldAutoPlay(card: JPDBCard, trigger: 'modal' | 'hover', userGesture?: boolean, anchor?: HTMLElement): boolean;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'all',
            suppressAutoAudioOnVideo: true,
        };

        try {
            expect(internals.shouldAutoPlay(card, 'hover', false)).toBe(true);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('attempts hover lookup audio even before browser page activation', () => {
        const app = new ReaderApp();
        const previousActivation = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
        Object.defineProperty(navigator, 'userActivation', {
            configurable: true,
            value: { hasBeenActive: false, isActive: false },
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            shouldAutoPlay(card: JPDBCard, trigger: 'modal' | 'hover', userGesture?: boolean, anchor?: HTMLElement): boolean;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            suppressAutoAudioOnVideo: false,
        };

        try {
            expect(internals.shouldAutoPlay(card, 'hover', false)).toBe(true);
        } finally {
            if (previousActivation) Object.defineProperty(navigator, 'userActivation', previousActivation);
            else delete (navigator as unknown as { userActivation?: Navigator['userActivation'] }).userActivation;
            app.destroy();
        }
    });

    it('prepares hover-card audio only when hover autoplay is allowed', () => {
        const app = new ReaderApp();
        const preload = vi.fn();
        const anchor = document.createElement('span');
        document.body.append(anchor);
        const internals = app as unknown as {
            audio: { preload: typeof preload };
            settings: typeof DEFAULT_SETTINGS;
            maybePreloadLookupCardAudio(card: JPDBCard, options: { trigger?: 'modal' | 'hover'; autoPlay?: boolean }, anchor?: HTMLElement): void;
        };
        internals.audio = { preload };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            audioEnableDefaultSources: false,
            suppressAutoAudioOnVideo: false,
        };

        try {
            const candidateOnlyCard = { ...card, vid: 4, spelling: '見る', reading: 'みる' };
            // Single-character words (火, 水, 人…) are extremely common lookups but are
            // rejected by the immersion-example heuristic. They must still warm their
            // audio on hover so playback is not cold — matching the auto-play gate.
            const singleCharCard = { ...card, vid: 5, spelling: '火', reading: 'ひ' };
            internals.maybePreloadLookupCardAudio(card, { trigger: 'hover' }, anchor);
            internals.maybePreloadLookupCardAudio(candidateOnlyCard, { trigger: 'hover', autoPlay: false }, anchor);
            internals.maybePreloadLookupCardAudio(singleCharCard, { trigger: 'hover' }, anchor);

            expect(preload).toHaveBeenNthCalledWith(1, card, {
                sourceLimit: 1,
                candidateLimit: 1,
                prepareAudio: true,
            });
            expect(preload).toHaveBeenNthCalledWith(2, candidateOnlyCard, {
                sourceLimit: 1,
                candidateLimit: 1,
                prepareAudio: false,
            });
            expect(preload).toHaveBeenNthCalledWith(3, singleCharCard, {
                sourceLimit: 1,
                candidateLimit: 1,
                prepareAudio: true,
            });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('allows playable audio preparation after candidate-only warmup', () => {
        const app = new ReaderApp();
        const preload = vi.fn(() => true);
        const internals = app as unknown as {
            audio: { preload: typeof preload };
            preloadReaderCardAudio(card: JPDBCard, options: { prepareAudio?: boolean }): boolean;
        };
        internals.audio = { preload };

        try {
            expect(internals.preloadReaderCardAudio(card, { prepareAudio: false })).toBe(true);
            expect(internals.preloadReaderCardAudio(card, { prepareAudio: true })).toBe(true);
            expect(internals.preloadReaderCardAudio(card, { prepareAudio: false })).toBe(false);
            expect(internals.preloadReaderCardAudio(card, { prepareAudio: true })).toBe(false);

            expect(preload).toHaveBeenCalledTimes(2);
            expect(preload).toHaveBeenNthCalledWith(1, card, {
                sourceLimit: 1,
                candidateLimit: 1,
                prepareAudio: false,
            });
            expect(preload).toHaveBeenNthCalledWith(2, card, {
                sourceLimit: 1,
                candidateLimit: 1,
                prepareAudio: true,
            });
        } finally {
            app.destroy();
        }
    });

    it('uses the local dev JPDB audio proxy from the newtab app', () => {
        const yomuWindow = window as typeof window & { __YOMU_READER_RUNTIME__?: string };
        yomuWindow.__YOMU_READER_RUNTIME__ = 'newtab';
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5174/newtab/',
            origin: 'http://127.0.0.1:5174',
            hostname: '127.0.0.1',
            protocol: 'http:',
        });

        try {
            expect(jpdbAudioRequest('m1/e9cac7e3d132')).toMatchObject({
                url: 'http://127.0.0.1:5174/__yomu-jpdb-audio/m1/e9cac7e3d132',
                headers: { 'X-Access': "please don't steal these files" },
                encoded: true,
            });
        } finally {
            delete yomuWindow.__YOMU_READER_RUNTIME__;
            vi.unstubAllGlobals();
        }
    });

    it('routes hosted JPDB static audio through a configured proxy', async () => {
        const target = 'https://jpdb.io/static/v/m1/e9cac7e3d132';
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('audio', { status: 200 })));
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(fetchWithCorsFallbacks(target, TEST_PROXY_URL, {
                allowDirectCrossOrigin: true,
                credentials: 'omit',
                headers: {
                    'X-Access': "please don't steal these files",
                    'X-ForceCAF': '1',
                },
            })).resolves.toBeInstanceOf(Response);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
            const requestedUrl = new URL(String(input));
            expect(`${requestedUrl.origin}${requestedUrl.pathname}`).toBe(TEST_PROXY_URL);
            expect(requestedUrl.searchParams.get('url')).toBe(target);
            expect(requestedUrl.searchParams.get('x-forcecaf')).toBeNull();
            const headers = new Headers(init?.headers);
            expect(headers.get('x-access')).toBe("please don't steal these files");
            expect(headers.get('x-forcecaf')).toBe('1');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('disables popover term audio controls when term audio is off', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: false }),
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });
        const root = document.createElement('div');
        root.innerHTML = renderer.render(card, undefined, 'modal', {
            loading: false,
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
        });

        const audioButton = root.querySelector<HTMLButtonElement>('[data-action="audio"]')!;

        expect(audioButton.disabled).toBe(true);
        expect(audioButton.title).toBe('Audio playback is disabled');
    });

    it('does not log disabled term audio as a playback failure', async () => {
        const play = vi.fn(async () => true);
        const toast = vi.fn();
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: false }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => 0,
            stopImmersionAudio: vi.fn(),
            toast,
        });

        await actions.playTermAudio(card, { userGesture: true });

        expect(play).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Audio playback is disabled.');
    });

    it('coalesces duplicate in-flight term autoplay requests for the same card', async () => {
        let resolvePlay!: (played: boolean) => void;
        const play = vi.fn(() => new Promise<boolean>(resolve => { resolvePlay = resolve; }));
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => 1,
            stopImmersionAudio: vi.fn(),
            toast: vi.fn(),
        });

        const first = actions.playTermAudio(card, { hoverLookupGeneration: 1, autoPlay: true });
        const second = actions.playTermAudio(card, { hoverLookupGeneration: 1, autoPlay: true });

        expect(play).toHaveBeenCalledTimes(1);

        resolvePlay(true);
        await Promise.all([first, second]);
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh manual term audio request while the same card is still loading', async () => {
        const resolvers: Array<(played: boolean) => void> = [];
        const play = vi.fn(() => new Promise<boolean>(resolve => { resolvers.push(resolve); }));
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => 1,
            stopImmersionAudio: vi.fn(),
            toast: vi.fn(),
        });

        const first = actions.playTermAudio(card, { userGesture: true });
        const second = actions.playTermAudio(card, { userGesture: true });

        expect(play).toHaveBeenCalledTimes(2);

        resolvers.forEach(resolve => resolve(true));
        await Promise.all([first, second]);
    });

    it('suppresses immediate duplicate term autoplay without blocking manual replay', async () => {
        const play = vi.fn(async () => true);
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => 0,
            stopImmersionAudio: vi.fn(),
            toast: vi.fn(),
        });

        await actions.playTermAudio(card, { hoverLookupGeneration: 1, autoPlay: true });
        await actions.playTermAudio(card, { userGesture: true, autoPlay: true });
        await actions.playTermAudio(card, { userGesture: true });

        expect(play).toHaveBeenCalledTimes(2);
    });

    it('does not suppress same-spelling autoplay for a distinct card identity', async () => {
        let hoverGeneration = 1;
        const play = vi.fn(async () => true);
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => hoverGeneration,
            stopImmersionAudio: vi.fn(),
            toast: vi.fn(),
        });

        await actions.playTermAudio(card, { hoverLookupGeneration: 1, autoPlay: true });
        hoverGeneration = 2;
        await actions.playTermAudio({ ...card, vid: card.vid + 1, sid: card.sid + 1, reading: '' }, { hoverLookupGeneration: 2, autoPlay: true });

        expect(play).toHaveBeenCalledTimes(2);
    });

    it('does not suppress click autoplay after a stale hover autoplay is superseded', async () => {
        let playCount = 0;
        const play = vi.fn(async () => {
            playCount += 1;
            return playCount > 1;
        });
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => 1,
            stopImmersionAudio: vi.fn(),
            toast: vi.fn(),
        });

        await actions.playTermAudio(card, { hoverLookupGeneration: 1, autoPlay: true });
        await actions.playTermAudio(card, { userGesture: true, autoPlay: true });

        expect(play).toHaveBeenCalledTimes(2);
    });

    it('does not launch stale hover term audio or mark the popover as loading', async () => {
        const popover = document.createElement('div');
        document.body.append(popover);
        const play = vi.fn(async () => true);
        const stopImmersionAudio = vi.fn();
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => popover,
            getHoverLookupGeneration: () => 2,
            stopImmersionAudio,
            toast: vi.fn(),
        });

        try {
            await actions.playTermAudio(card, { hoverLookupGeneration: 1, autoPlay: true });

            expect(play).not.toHaveBeenCalled();
            expect(stopImmersionAudio).not.toHaveBeenCalled();
            expect(popover.dataset.audioLoading).toBeUndefined();
        } finally {
            popover.remove();
        }
    });

    it('does not play sentence audio when audio playback is disabled', async () => {
        const playJapaneseText = vi.fn(async () => undefined);
        const toast = vi.fn();
        const actions = new ReaderAudioActions({
            audio: { playJapaneseText } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: false }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => 0,
            stopImmersionAudio: vi.fn(),
            toast,
        });

        await actions.playSentenceAudio('好きなものを読んで日本語を学ぶ');

        expect(playJapaneseText).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Audio playback is disabled.');
    });

    it('does not play Immersion Kit popup audio when audio playback is disabled', async () => {
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
        const toast = vi.fn();
        const controller = new ImmersionPopoverController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                audioEnabled: false,
                immersionKitEnabled: true,
                immersionKitShowImages: false,
            }),
            client: {
                mediaUrls: vi.fn((_: unknown, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/line.mp3'] : []),
                fetchBlobUrl,
            } as unknown as ImmersionKitClient,
            audio: { play: vi.fn(async () => undefined), stop: vi.fn() } as never,
            parseJapanese: vi.fn(async () => []),
            canParseJapanese: () => false,
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast,
        });

        await (controller as unknown as {
            playExampleAudio(example: ImmersionKitExample): Promise<void>;
        }).playExampleAudio(immersionExample('これは発音です'));

        expect(fetchBlobUrl).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Audio playback is disabled');
    });



    it('renders study sentence rows without visible English language labels', async () => {
        const sentence = '毎日読んでいるので、もっと読みたい。';
        const controller = new StudySourceController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, studyTranslationEnabled: true }),
            dictionarySourceAttributes: () => '',
            parseJapanese: vi.fn(async () => []),
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            isCurrentPopoverRoot: () => true,
        });
        const wrapper = document.createElement('div');
        wrapper.innerHTML = [
            controller.renderTranslationSource(sentence),
            await renderGrammarHints(detectGrammarHints(sentence), sentence),
        ].join('');

        expect(wrapper.textContent).not.toContain('Japanese');
        expect(wrapper.querySelectorAll('.jpdb-reader-study-sentence-row [data-action="study-read-sentence"]')).toHaveLength(2);
        expect(wrapper.querySelectorAll('[data-study-original-render]')).toHaveLength(2);
    });

    it('resolves the grammar section inside dictionary-site page addons instead of leaving the placeholder', async () => {
        const sentence = '私に関して言えば、肉よりも魚が好きだ。';
        const root = document.createElement('div');
        root.dataset.yomuJpdbAddon = 'word';
        document.body.append(root);
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const controller = new StudySourceController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, studyGrammarEnabled: true }),
            dictionarySourceAttributes: () => 'open',
            parseJapanese: vi.fn(async () => []),
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            // Mirrors main.ts wiring: real popovers OR dictionary-site page
            // addon roots pass the guard — addon sections used to fail it and
            // sit on "Finding grammar..." forever.
            isCurrentPopoverRoot: candidate => Boolean(candidate.closest('[data-yomu-jpdb-addon]')),
        });

        try {
            root.innerHTML = controller.renderGrammarSource(sentence);
            expect(root.textContent).toContain('Finding grammar');
            controller.installLoaders(root, sentence);
            await vi.waitFor(() => {
                expect(root.textContent).not.toContain('Finding grammar');
            });
            expect(fetchSpy.mock.calls.some(call => String(call[0]).includes('translate.googleapis.com'))).toBe(false);
        } finally {
            fetchSpy.mockRestore();
            document.body.replaceChildren();
        }
    });

    it('lets parsed study sentences wrap without pushing the sentence audio button off mobile sheets', () => {
        const style = document.createElement('style');
        style.textContent = `${READER_WORD_CSS}\n${IMMERSION_STUDY_CSS}`;
        document.head.append(style);
        document.body.innerHTML = `
            <div data-jpdb-reader-root>
                <div class="jpdb-reader-study-label-row jpdb-reader-study-sentence-row">
                    <div class="jpdb-reader-study-original">
                        <span class="jpdb-reader-word">青空の下で本を読む今日は静かな喫茶店で新しい本を読みました</span>
                    </div>
                    <button class="jpdb-reader-icon-mini" type="button"></button>
                </div>
            </div>
        `;

        try {
            const wordStyle = getComputedStyle(document.querySelector<HTMLElement>('.jpdb-reader-study-original .jpdb-reader-word')!);
            const buttonStyle = getComputedStyle(document.querySelector<HTMLElement>('.jpdb-reader-study-label-row .jpdb-reader-icon-mini')!);

            expect(wordStyle.whiteSpace).toBe('normal');
            expect(wordStyle.overflowWrap).toBe('anywhere');
            expect(buttonStyle.flexBasis).toBe('28px');
            expect(buttonStyle.maxWidth).toBe('28px');
        } finally {
            style.remove();
        }
    });


    it('does not persist restored puck clamps from an unmeasurable startup viewport', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(640, 420);
        const save = vi.fn();
        const settings = {
            ...DEFAULT_SETTINGS,
            puckPositionX: 640,
            puckPositionY: 420,
        };

        try {
            withViewport(0, 0, () => withImmediateAnimationFrame(() => {
                controller.install(settings, save, stubFloatingButtonActions());
            }));

            const button = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(button?.style.left).toBe('640px');
            expect(button?.style.top).toBe('420px');
            expect(button?.style.getPropertyValue('right')).toBe('auto');
            expect(button?.style.getPropertyPriority('right')).toBe('important');
            expect(button?.style.getPropertyValue('bottom')).toBe('auto');
            expect(button?.style.getPropertyPriority('bottom')).toBe('important');
            expect(settings.puckPositionX).toBe(640);
            expect(settings.puckPositionY).toBe(420);
            expect(save).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps the settings puck reachable on coarse-pointer mobile even if stale settings hid it', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(24, 24);
        vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
            matches: query === '(pointer: coarse)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: false,
        };

        try {
            withViewport(390, 844, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions());
            }));

            expect(document.querySelector('.jpdb-reader-fab')).not.toBeNull();
        } finally {
            controller.destroy();
            restoreRects();
            vi.unstubAllGlobals();
            document.body.innerHTML = '';
        }
    });

    it('keeps dense YouTube puck menu actions finger-spaced on iPad layouts', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(1698, 282);
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: true,
        };

        try {
            withViewport(1904, 1307, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions({
                    isYouTube: () => true,
                    isYoutubeFilterEnabled: () => true,
                }));
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            const offsets = Array.from(document.querySelectorAll<HTMLButtonElement>('.jpdb-reader-fab-radial-item'))
                .map(item => ({
                    x: Number.parseFloat(item.style.getPropertyValue('--radial-x')),
                    y: Number.parseFloat(item.style.getPropertyValue('--radial-y')),
                }));
            const labels = Array.from(document.querySelectorAll<HTMLButtonElement>('.jpdb-reader-fab-radial-item'))
                .map(item => item.getAttribute('aria-label'));
            const adjacentDistances = offsets.slice(1).map((offset, index) => (
                Math.hypot(offset.x - offsets[index].x, offset.y - offsets[index].y)
            ));

            expect(offsets).toHaveLength(7);
            expect(labels).not.toContain('Scan page');
            expect(labels).toContain('Open Japanese versions of sites');
            expect(labels).toContain('Hide furigana');
            expect(Math.min(...adjacentDistances)).toBeGreaterThanOrEqual(60);
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps the densest YouTube + subtitle puck menu finger-spaced', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(1698, 282);
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: true,
        };

        try {
            withViewport(1904, 1307, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions({
                    isYouTube: () => true,
                    isYoutubeFilterEnabled: () => true,
                    hasSubtitleVideo: () => true,
                }));
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            const offsets = Array.from(document.querySelectorAll<HTMLButtonElement>('.jpdb-reader-fab-radial-item'))
                .map(item => ({
                    x: Number.parseFloat(item.style.getPropertyValue('--radial-x')),
                    y: Number.parseFloat(item.style.getPropertyValue('--radial-y')),
                }));
            const adjacentDistances = offsets.slice(1).map((offset, index) => (
                Math.hypot(offset.x - offsets[index].x, offset.y - offsets[index].y)
            ));

            expect(offsets).toHaveLength(8);
            expect(Math.min(...adjacentDistances)).toBeGreaterThanOrEqual(60);
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('restores furigana on resume even in a fresh session, via the persisted pre-hide marker', async () => {
        // The hide step persists furiganaMode='off' globally, so the restore
        // marker must be persisted too: with an in-memory marker, hiding on one
        // page and resuming on the next left furigana off forever and the
        // power cycle degraded to pause<->resume.
        type PowerCycleInternals = {
            settings: ReaderSettings;
            cyclePowerState(): Promise<void>;
            puckPowerState(): 'on' | 'no-furigana' | 'paused';
            applyFuriganaMode(mode: ReaderSettings['furiganaMode']): Promise<void>;
            clearAllAnnotations(): void;
            scheduleAutoScan(delay: number, options?: { force?: boolean }): void;
            setAnnotationsPaused(paused: boolean): Promise<void>;
            applyAnnotationsPausedState(): void;
            toast(message: string): void;
        };
        const appInternals = (app: ReaderApp): PowerCycleInternals => {
            const internals = app as unknown as PowerCycleInternals;
            internals.clearAllAnnotations = vi.fn();
            internals.scheduleAutoScan = vi.fn();
            internals.applyAnnotationsPausedState = vi.fn();
            internals.toast = vi.fn();
            return internals;
        };

        const first = appInternals(new ReaderApp());
        first.settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' };
        await first.cyclePowerState();
        expect(first.settings.furiganaMode).toBe('off');
        expect(first.settings.puckFuriganaModeBeforeHide).toBe('all');
        await first.cyclePowerState();
        expect(first.settings.annotationsPaused).toBe(true);

        // "Navigate": a fresh app instance sees only the persisted settings.
        const second = appInternals(new ReaderApp());
        second.settings = { ...first.settings };
        expect(second.puckPowerState()).toBe('paused');
        await second.cyclePowerState();
        expect(second.settings.annotationsPaused).toBe(false);
        expect(second.settings.furiganaMode).toBe('all');
        expect(second.settings.showFurigana).toBe(true);
        expect(second.settings.puckFuriganaModeBeforeHide).toBe('');
        expect(second.puckPowerState()).toBe('on');

        // The explicit-choice store protects these fields from stale writers.
        // Resume therefore has to declare every protected field it stages, not
        // only annotationsPaused, or the earlier explicit "hide furigana"
        // values overlay the new blob and the next page sees the old state.
        const persisted = await loadSettings();
        expect(persisted.annotationsPaused).toBe(false);
        expect(persisted.furiganaMode).toBe('all');
        expect(persisted.showFurigana).toBe(true);
        expect(persisted.puckFuriganaModeBeforeHide).toBe('');
    });

    it('reaches a genuine furigana-on state from a furigana-off preference (no two-state collapse)', async () => {
        // A user whose saved preference is furigana-off starts the cycle in the
        // no-furigana state with no pre-hide marker. Resuming must still land on
        // a TRUE furigana-on "on" state (falling back to the default mode) —
        // otherwise "on" and "furigana off" collapse and the puck only toggles
        // pause<->resume: the reported "only two states" bug.
        type PowerCycleInternals = {
            settings: ReaderSettings;
            cyclePowerState(): Promise<void>;
            puckPowerState(): 'on' | 'no-furigana' | 'paused';
            clearAllAnnotations(): void;
            scheduleAutoScan(delay: number, options?: { force?: boolean }): void;
            applyAnnotationsPausedState(): void;
            toast(message: string): void;
        };
        const app = new ReaderApp() as unknown as PowerCycleInternals;
        app.clearAllAnnotations = vi.fn();
        app.scheduleAutoScan = vi.fn();
        app.applyAnnotationsPausedState = vi.fn();
        app.toast = vi.fn();
        app.settings = { ...DEFAULT_SETTINGS, showFurigana: false, furiganaMode: 'off', annotationsPaused: false, puckFuriganaModeBeforeHide: '' };
        expect(app.puckPowerState()).toBe('no-furigana');

        await app.cyclePowerState();
        expect(app.puckPowerState()).toBe('paused');

        await app.cyclePowerState();
        expect(app.settings.annotationsPaused).toBe(false);
        expect(app.settings.showFurigana).toBe(true);
        expect(app.settings.furiganaMode).not.toBe('off');
        expect(app.settings.furiganaMode).toBe(DEFAULT_SETTINGS.furiganaMode);
        expect(app.puckPowerState()).toBe('on');

        // The loop keeps cycling: on -> furigana hidden again (all three live).
        await app.cyclePowerState();
        expect(app.puckPowerState()).toBe('no-furigana');
    });

    it('marks the puck differently for furigana-hidden and annotation-paused states', async () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(760, 520);
        let powerState: 'on' | 'no-furigana' | 'paused' = 'on';
        const cyclePowerState = vi.fn(async () => {
            powerState = powerState === 'on' ? 'no-furigana'
                : powerState === 'no-furigana' ? 'paused'
                    : 'on';
        });
        const waitForPowerCycle = async (): Promise<void> => {
            await cyclePowerState.mock.results.at(-1)?.value;
            await Promise.resolve();
        };
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: true,
        };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions({
                    cyclePowerState,
                    powerState: () => powerState,
                    isPaused: () => powerState === 'paused',
                }));
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            const puck = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')!;
            const powerButton = () => document.querySelector<HTMLButtonElement>('.jpdb-reader-fab-radial-item[data-radial-id="power"]')!;

            expect(puck.classList.contains('jpdb-reader-fab--on')).toBe(true);
            expect(puck.classList.contains('jpdb-reader-fab--no-furigana')).toBe(false);
            expect(puck.classList.contains('jpdb-reader-fab--paused')).toBe(false);
            expect(powerButton().getAttribute('aria-label')).toBe('Hide furigana');
            expect(powerButton().classList.contains('is-on')).toBe(true);
            const onIcon = powerButton().querySelector<HTMLElement>('.jpdb-reader-fab-radial-icon')?.innerHTML ?? '';
            expect(onIcon).toContain('M12 4v8');
            expect(onIcon).not.toContain('>ふ<');

            powerButton().click();
            await waitForPowerCycle();
            expect(cyclePowerState).toHaveBeenCalledTimes(1);
            expect(puck.classList.contains('jpdb-reader-fab--on')).toBe(false);
            expect(puck.classList.contains('jpdb-reader-fab--no-furigana')).toBe(true);
            expect(puck.classList.contains('jpdb-reader-fab--paused')).toBe(false);
            expect(puck.getAttribute('aria-label')).toContain('Furigana off');
            expect(powerButton().getAttribute('aria-label')).toBe('Pause annotations');
            expect(powerButton().classList.contains('is-partial')).toBe(true);
            const noFuriganaIcon = powerButton().querySelector<HTMLElement>('.jpdb-reader-fab-radial-icon')?.innerHTML ?? '';
            expect(noFuriganaIcon).toContain('>ふ<');
            expect(noFuriganaIcon).not.toBe(onIcon);

            powerButton().click();
            await waitForPowerCycle();
            expect(puck.classList.contains('jpdb-reader-fab--on')).toBe(false);
            expect(puck.classList.contains('jpdb-reader-fab--no-furigana')).toBe(false);
            expect(puck.classList.contains('jpdb-reader-fab--paused')).toBe(true);
            expect(puck.getAttribute('aria-label')).toContain('Annotations paused');
            expect(powerButton().getAttribute('aria-label')).toBe('Resume annotations');
            expect(powerButton().classList.contains('is-off')).toBe(true);
            const pausedIcon = powerButton().querySelector<HTMLElement>('.jpdb-reader-fab-radial-icon')?.innerHTML ?? '';
            expect(pausedIcon).toContain('M9 5v14');
            expect(pausedIcon).not.toBe(onIcon);
            expect(pausedIcon).not.toBe(noFuriganaIcon);

            powerButton().click();
            await waitForPowerCycle();
            expect(puck.classList.contains('jpdb-reader-fab--on')).toBe(true);
            expect(puck.classList.contains('jpdb-reader-fab--no-furigana')).toBe(false);
            expect(puck.classList.contains('jpdb-reader-fab--paused')).toBe(false);
            expect(puck.getAttribute('aria-label')).toBe('よむ — learning target: Japanese');
            expect(powerButton().getAttribute('aria-label')).toBe('Hide furigana');
            expect(powerButton().querySelector<HTMLElement>('.jpdb-reader-fab-radial-icon')?.innerHTML).toBe(onIcon);
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('shows the OCR puck action as off while annotations are paused', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(760, 520);
        const settings = { ...DEFAULT_SETTINGS, showFloatingButton: true };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions({
                    powerState: () => 'paused',
                    isPaused: () => true,
                    ocrMode: () => 'auto',
                }));
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            const ocrButton = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab-radial-item[data-radial-id="ocr"]');
            expect(ocrButton?.classList.contains('is-off')).toBe(true);
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('cycles OCR mode from the puck without closing the radial menu', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(760, 520);
        let mode: 'auto' | 'manual' | 'off' = 'auto';
        const toggleOcrMode = vi.fn(() => {
            mode = mode === 'auto' ? 'manual' : mode === 'manual' ? 'off' : 'auto';
        });
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: true,
        };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions({
                    toggleOcrMode,
                    ocrMode: () => mode,
                }));
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            const ocrButton = () => document.querySelector<HTMLButtonElement>('.jpdb-reader-fab-radial-item[data-radial-id="ocr"]');
            expect(ocrButton()?.getAttribute('aria-label')).toBe('OCR: Auto');
            const autoIcon = ocrButton()?.querySelector<HTMLElement>('.jpdb-reader-fab-radial-icon')?.innerHTML ?? '';
            expect(autoIcon).toContain('<rect');

            ocrButton()?.click();
            expect(toggleOcrMode).toHaveBeenCalledTimes(1);
            expect(ocrButton()?.getAttribute('aria-label')).toBe('OCR: Tap/Hover');
            const manualIcon = ocrButton()?.querySelector<HTMLElement>('.jpdb-reader-fab-radial-icon')?.innerHTML ?? '';
            expect(manualIcon).toContain('M8 3H5');
            expect(manualIcon).not.toBe(autoIcon);
            expect(document.querySelector('.jpdb-reader-fab-radial.is-open')).not.toBeNull();

            ocrButton()?.click();
            expect(ocrButton()?.getAttribute('aria-label')).toBe('OCR: Off');
            expect(ocrButton()?.classList.contains('is-off')).toBe(true);
            expect(ocrButton()?.querySelector<HTMLElement>('.jpdb-reader-fab-radial-icon')?.innerHTML).toBe(autoIcon);
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('toggles Japanese site requests from the puck without closing the radial menu', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(760, 520);
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: true,
        };
        const toggleJapaneseSiteLanguage = vi.fn(() => {
            settings.preferJapaneseSiteLanguage = !settings.preferJapaneseSiteLanguage;
        });

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions({
                    toggleJapaneseSiteLanguage,
                }));
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            const siteButton = () => document.querySelector<HTMLButtonElement>('.jpdb-reader-fab-radial-item[data-radial-id="japanese-site"]');
            expect(siteButton()?.getAttribute('aria-label')).toBe('Open Japanese versions of sites');
            expect(siteButton()?.classList.contains('is-on')).toBe(true);

            siteButton()?.click();

            expect(toggleJapaneseSiteLanguage).toHaveBeenCalledTimes(1);
            expect(siteButton()?.getAttribute('aria-label')).toBe('Open Japanese versions of sites');
            expect(siteButton()?.classList.contains('is-off')).toBe(true);
            expect(document.querySelector('.jpdb-reader-fab-radial.is-open')).not.toBeNull();
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('toggles automatic subtitles from the puck on video pages without closing the menu', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(760, 520);
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: true,
        };
        let autoSubtitles = true;
        const toggleAutoSubtitles = vi.fn(() => {
            autoSubtitles = !autoSubtitles;
        });

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions({
                    hasSubtitleVideo: () => true,
                    isAutoSubtitlesEnabled: () => autoSubtitles,
                    toggleAutoSubtitles,
                }));
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            const subtitlesButton = () => document.querySelector<HTMLButtonElement>('.jpdb-reader-fab-radial-item[data-radial-id="subtitles"]');
            expect(subtitlesButton()?.getAttribute('aria-label')).toBe('Auto-detect Japanese subtitles');
            expect(subtitlesButton()?.classList.contains('is-on')).toBe(true);
            expect(subtitlesButton()?.querySelector('svg')).not.toBeNull();
            expect(subtitlesButton()?.textContent).not.toContain('字');

            subtitlesButton()?.click();

            expect(toggleAutoSubtitles).toHaveBeenCalledTimes(1);
            expect(subtitlesButton()?.getAttribute('aria-label')).toBe('Auto-detect Japanese subtitles');
            expect(subtitlesButton()?.classList.contains('is-off')).toBe(true);
            expect(document.querySelector('.jpdb-reader-fab-radial.is-open')).not.toBeNull();
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('hides the automatic subtitles puck action on pages without a video', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(760, 520);
        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: true,
        };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, vi.fn(), stubFloatingButtonActions());
                document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
            }));

            expect(document.querySelector('.jpdb-reader-fab-radial-item[data-radial-id="subtitles"]')).toBeNull();
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('persists user-adjusted puck coordinates through GM settings storage', async () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(700, 500);
        const gmSetValue = vi.fn(async () => undefined);
        vi.stubGlobal('GM_getValue', vi.fn((_key: string, fallback: unknown) => fallback));
        vi.stubGlobal('GM_setValue', gmSetValue);
        const settings = {
            ...DEFAULT_SETTINGS,
            puckPositionX: undefined,
            puckPositionY: undefined,
        };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(
                    settings,
                    () => void saveSettings(settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE }),
                    stubFloatingButtonActions(),
                );
            }));
            const button = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(button).not.toBeNull();
            button?.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 710, clientY: 510, bubbles: true }));
            button?.dispatchEvent(new MouseEvent('pointermove', { clientX: 810, clientY: 610, bubbles: true }));
            button?.dispatchEvent(new MouseEvent('pointerup', { clientX: 810, clientY: 610, bubbles: true }));
            expect(button?.style.getPropertyValue('right')).toBe('auto');
            expect(button?.style.getPropertyPriority('right')).toBe('important');
            expect(button?.style.getPropertyValue('bottom')).toBe('auto');
            expect(button?.style.getPropertyPriority('bottom')).toBe('important');

            await waitForExpect(() => {
                expect(gmSetValue).toHaveBeenCalledWith('jpdb-popup-reader-settings', expect.objectContaining({
                    puckPositionX: 800,
                    puckPositionY: 600,
                }));
            });
        } finally {
            controller.destroy();
            restoreRects();
            vi.unstubAllGlobals();
            document.body.innerHTML = '';
        }
    });

    it('leaves a tapped default puck anchored to the responsive safe-area corner', () => {
        const controller = new FloatingButtonController();
        const restoreRects = mockFloatingButtonRects(700, 500);
        const save = vi.fn();
        const settings = {
            ...DEFAULT_SETTINGS,
            puckPositionX: undefined,
            puckPositionY: undefined,
        };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, save, stubFloatingButtonActions());
            }));
            const button = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(button).not.toBeNull();

            button?.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 40, button: 0, clientX: 710, clientY: 510 }));
            button?.dispatchEvent(createPointerEvent('pointerup', { pointerType: 'touch', pointerId: 40, clientX: 710, clientY: 510 }));

            expect(button?.style.left).toBe('');
            expect(button?.style.top).toBe('');
            expect(button?.style.getPropertyValue('transform')).toBe('');
            expect(settings.puckPositionX).toBeUndefined();
            expect(settings.puckPositionY).toBeUndefined();
            expect(save).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('moves the iPad puck without remeasuring layout on every touch move', () => {
        const controller = new FloatingButtonController();
        const rectSpy = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: HTMLButtonElement) {
            const styleLeft = Number.parseFloat(this.style.left);
            const styleTop = Number.parseFloat(this.style.top);
            const x = Number.isFinite(styleLeft) ? styleLeft : 700;
            const y = Number.isFinite(styleTop) ? styleTop : 500;
            return new DOMRect(x, y, 52, 52);
        });
        const save = vi.fn();
        const settings = {
            ...DEFAULT_SETTINGS,
            puckPositionX: undefined,
            puckPositionY: undefined,
        };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, save, stubFloatingButtonActions());
            }));
            const button = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(button).not.toBeNull();
            rectSpy.mockClear();

            withImmediateAnimationFrame(() => {
                button?.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 41, button: 0, clientX: 710, clientY: 510 }));
                for (let index = 1; index <= 10; index += 1) {
                    button?.dispatchEvent(createPointerEvent('pointermove', {
                        pointerType: 'touch',
                        pointerId: 41,
                        clientX: 710 + index * 10,
                        clientY: 510 + index * 10,
                    }));
                }
                expect(rectSpy).toHaveBeenCalledTimes(1);
                expect(button?.style.getPropertyValue('transform')).toBe('translate3d(100px, 100px, 0)');
                button?.dispatchEvent(createPointerEvent('pointerup', { pointerType: 'touch', pointerId: 41, clientX: 810, clientY: 610 }));
            });

            expect(rectSpy).toHaveBeenCalledTimes(1);
            expect(button?.style.getPropertyValue('transform')).toBe('');
            expect(button?.style.left).toBe('800px');
            expect(button?.style.top).toBe('600px');
            expect(settings.puckPositionX).toBe(800);
            expect(settings.puckPositionY).toBe(600);
            expect(save).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
            rectSpy.mockRestore();
            restoreInheritedButtonRectLookup();
            document.body.innerHTML = '';
        }
    });

    it('normalizes invalid persisted popup presentation settings', async () => {
        const storageKey = 'jpdb-popup-reader-settings';
        const previous = localStorage.getItem(storageKey);
        localStorage.setItem(storageKey, JSON.stringify({
            ...DEFAULT_SETTINGS,
            theme: 'neon',
            popupMode: 'toast',
            stickyBottomSheet: 'yes',
            popoverWidth: 42,
            popoverHeight: 1200,
            popoverHeightMode: 'giant',
        }));

        try {
            const settings = await loadSettings();

            expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
            expect(settings.popupMode).toBe(DEFAULT_SETTINGS.popupMode);
            expect(settings.stickyBottomSheet).toBe(DEFAULT_SETTINGS.stickyBottomSheet);
            expect(settings.popoverWidth).toBe(280);
            expect(settings.popoverHeight).toBe(900);
            expect(settings.popoverHeightMode).toBe(DEFAULT_SETTINGS.popoverHeightMode);
        } finally {
            if (previous === null) localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, previous);
        }
    });

    it('defaults legacy settings without a proxy URL to no proxy', async () => {
        const storageKey = 'jpdb-popup-reader-settings';
        const previous = localStorage.getItem(storageKey);
        const legacySettings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
        delete legacySettings.corsProxyUrl;
        localStorage.setItem(storageKey, JSON.stringify(legacySettings));

        try {
            const settings = await loadSettings();

            expect(settings.corsProxyUrl).toBe(DEFAULT_SETTINGS.corsProxyUrl);
        } finally {
            if (previous === null) localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, previous);
        }
    });

    it('migrates legacy automatic color-channel defaults to concrete settings', async () => {
        const storageKey = 'jpdb-popup-reader-settings';
        const previous = localStorage.getItem(storageKey);
        localStorage.setItem(storageKey, JSON.stringify({
            ...DEFAULT_SETTINGS,
            wordHighlightColorSource: 'auto',
            wordUnderlineColorSource: 'auto',
            wordTextColorSource: 'off',
            subtitleHighlightColorSource: 'off',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'auto',
            wordHighlightMode: 'auto',
        }));

        try {
            const settings = await loadSettings();

            expect(settings.wordHighlightColorSource).toBe('jpdb');
            expect(settings.wordUnderlineColorSource).toBe('pitch');
            expect(settings.wordTextColorSource).toBe('anki');
            expect(settings.subtitleHighlightColorSource).toBe('jpdb');
            expect(settings.subtitleUnderlineColorSource).toBe('pitch');
            expect(settings.subtitleTextColorSource).toBe('anki');
            expect('wordHighlightMode' in settings).toBe(false);
        } finally {
            if (previous === null) localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, previous);
        }
    });

    it('keeps current select values when settings form values are malformed', () => {
        const current = {
            ...DEFAULT_SETTINGS,
            theme: 'dark' as const,
            popupMode: 'popover' as const,
            popoverHeightMode: 'fixed' as const,
            audioSelectionMode: 'random' as const,
            audioTtsMode: 'source-order' as const,
            audioAutoPlayMode: 'tap' as const,
            interfaceLanguage: 'ja' as const,
        };
        const data = new FormData();
        data.set('theme', 'neon');
        data.set('popupMode', 'toast');
        data.set('popoverHeightMode', 'giant');
        data.set('audioSelectionMode', 'shuffle');
        data.set('audioTtsMode', 'always');
        data.set('audioAutoPlayMode', 'gesture');
        data.set('interfaceLanguage', 'pirate');
        data.set('popoverWidth', '1200');
        data.set('popoverHeight', '12');

        const settings = readFormSettings(data, current);

        expect(settings.theme).toBe('dark');
        expect(settings.popupMode).toBe('popover');
        expect(settings.popoverHeightMode).toBe('fixed');
        expect(settings.audioSelectionMode).toBe('random');
        expect(settings.audioTtsMode).toBe('source-order');
        expect(settings.audioAutoPlayMode).toBe('tap');
        expect(settings.interfaceLanguage).toBe('ja');
        expect(settings.popoverWidth).toBe(900);
        expect(settings.popoverHeight).toBe(220);
    });

    it('keeps popover mode usable when saved settings request Japanese copy', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja',
            popupMode: 'popover',
        }, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');
        const popupMode = form.querySelector<HTMLSelectElement>('select[name="popupMode"]');
        const stickyBottomSheet = form.querySelector<HTMLInputElement>('input[name="stickyBottomSheet"]');
        const stickyBottomSheetField = form.querySelector<HTMLElement>('[data-sticky-bottom-sheet-field]');
        const settings = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(form.lang).toBe('ja');
        expect(popupMode?.value).toBe('popover');
        expect(Array.from(popupMode?.options ?? []).find(option => option.value === 'popover')?.textContent).toBe('ポップオーバー');
        expect(stickyBottomSheet?.checked).toBe(false);
        expect(stickyBottomSheet?.disabled).toBe(true);
        expect(stickyBottomSheetField?.hidden).toBe(true);
        expect(settings.interfaceLanguage).toBe('ja');
        expect(settings.popupMode).toBe('popover');
        expect(settings.stickyBottomSheet).toBe(false);
    });

    it('shows sticky bottom-sheet only while a sheet-capable popup mode is selected', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            popupMode: 'sheet',
            stickyBottomSheet: true,
        }, 'https://jpdb.io/settings');
        const popupMode = form.querySelector<HTMLSelectElement>('select[name="popupMode"]')!;
        const stickyBottomSheet = form.querySelector<HTMLInputElement>('input[name="stickyBottomSheet"]')!;
        const stickyBottomSheetField = form.querySelector<HTMLElement>('[data-sticky-bottom-sheet-field]')!;

        expect(stickyBottomSheetField.hidden).toBe(false);
        expect(stickyBottomSheet.disabled).toBe(false);
        expect(stickyBottomSheet.checked).toBe(true);

        popupMode.value = 'popover';
        syncStickyBottomSheetAvailability(form);

        expect(stickyBottomSheetField.hidden).toBe(true);
        expect(stickyBottomSheet.disabled).toBe(true);
        expect(stickyBottomSheet.checked).toBe(false);
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).stickyBottomSheet).toBe(false);

        popupMode.value = 'auto';
        syncStickyBottomSheetAvailability(form);

        expect(stickyBottomSheetField.hidden).toBe(false);
        expect(stickyBottomSheet.disabled).toBe(false);
    });

    it('saves the sticky bottom-sheet setting from the settings form', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            // The control only renders enabled in sheet-capable popup modes.
            popupMode: 'sheet',
            stickyBottomSheet: true,
        }, 'https://jpdb.io/settings');

        const input = form.querySelector<HTMLInputElement>('input[name="stickyBottomSheet"]');
        const settings = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(input?.checked).toBe(true);
        expect(settings.stickyBottomSheet).toBe(true);
    });

    it('does not expose the legacy transcript position selector in settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(form.querySelector('select[name="subtitleTranscriptPlacement"]')).toBeNull();
    });

    it('keeps subtitle auto-copy off by default but available in settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const autoCopy = form.querySelector<HTMLInputElement>('input[name="subtitleAutoCopyLine"]');

        expect(DEFAULT_SETTINGS.subtitleAutoCopyLine).toBe(false);
        expect(autoCopy?.checked).toBe(false);
        autoCopy!.checked = true;
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).subtitleAutoCopyLine).toBe(true);
    });

    it('reads arbitrary Japanese sentence text aloud with browser TTS', async () => {
        const spoken: string[] = [];
        mockSpeechSynthesis(spoken);

        try {
            const player = new AudioPlayer(() => DEFAULT_SETTINGS);
            await player.playJapaneseText(' 警察が来た！ ');

            expect(spoken).toEqual(['警察が来た！']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses the selected browser TTS voice instead of the first Japanese fallback voice', async () => {
        let spokenVoice = '';
        class FakeSpeechSynthesisUtterance {
            lang = '';
            voice: SpeechSynthesisVoice | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;

            constructor(public text: string) {}
        }
        const voices = [
            { name: 'Kyoko', lang: 'ja-JP', default: true },
            { name: 'Otoya', lang: 'ja-JP', default: false },
        ] as SpeechSynthesisVoice[];
        vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(),
            getVoices: vi.fn(() => voices),
            speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
                spokenVoice = utterance.voice?.name ?? '';
                utterance.onend?.();
            }),
        });

        try {
            const player = new AudioPlayer(() => DEFAULT_SETTINGS);
            await player.playJapaneseText('警察が来た！', 'Otoya');

            expect(spokenVoice).toBe('Otoya');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('rotates automatic browser TTS voices when audio is shuffled', async () => {
        const spokenVoices: string[] = [];
        class FakeSpeechSynthesisUtterance {
            lang = '';
            voice: SpeechSynthesisVoice | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;

            constructor(public text: string) {}
        }
        const voices = [
            { name: 'Kyoko', lang: 'ja-JP', default: true },
            { name: 'Otoya', lang: 'ja-JP', default: false },
        ] as SpeechSynthesisVoice[];
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(),
            getVoices: vi.fn(() => voices),
            speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
                spokenVoices.push(utterance.voice?.name ?? '');
                utterance.onend?.();
            }),
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'text-to-speech', url: '', voice: '', enabled: true }],
            }));

            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(spokenVoices).toEqual(['Otoya', 'Kyoko']);
        } finally {
            randomSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('plays text-to-speech sources from the term or kana reading field', async () => {
        const spoken: string[] = [];
        mockSpeechSynthesis(spoken, [{ name: 'Kyoko', lang: 'ja-JP', default: true }] as SpeechSynthesisVoice[]);

        try {
            for (const type of ['text-to-speech', 'text-to-speech-reading'] as const) {
                const player = new AudioPlayer(() => ({
                    ...DEFAULT_SETTINGS,
                    audioEnableDefaultSources: false,
                    audioFallbackChimeEnabled: false,
                    audioSources: [{ type, url: '', voice: 'Kyoko', enabled: true }],
                }));
                await expect(player.play(card)).resolves.toBe(true);
            }

            expect(spoken).toEqual(['食べる', 'たべる']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

});
