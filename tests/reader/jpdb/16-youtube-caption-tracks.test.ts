import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT,
    ReaderApp,
    appendRenderedReaderWord,
    applySubtitleNativeTrackModes,
    applyTokensToTextNode,
    card,
    collectTextTargetsIn,
    configureJitenRenderedWordTest,
    configurePublicVocabularyEnrichment,
    createFallbackShowCardBoundaryFixture,
    deferred,
    discoverYouTubeCaptionTracks,
    expectActiveYouTubeNativeCaptionSuppression,
    expectPublicVocabularyFurigana,
    expectRenderedKanaModalCard,
    expectRenderedPitchWord,
    expectRenderedWordParse,
    getYouTubeCaptionTracks,
    getYouTubeVideoId,
    jitenTestCard,
    loadSubtitleTrackCues,
    loadYouTubeTrackCues,
    normalizeSubtitleCues,
    parseSubtitleText,
    planTranscriptHydrationIndexes,
    readerWordSurfaceText,
    renderControllerPrimarySubtitle,
    renderSubtitlePrimary,
    renderTokensToHtml,
    stubYouTubeAndroidFallbackEnvironment,
    stubYouTubePlayerResponse,
    testAozoraCard,
    testFallbackCard,
    testPublicCard,
    testTokenForCard,
    testYouTubeCaptionTrack,
    testYouTubePlayerResponse,
    unwrapReaderWords,
    waitForExpect,
} from './fixtures';
import type {
    JPDBCard,
    JPDBToken,
    SubtitleTrackLoadable,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('recovers YouTube auto-translated tracks when translated timedtext is empty', async () => {
        const sourceTrack: SubtitleTrackLoadable = {
            id: 'youtube-en',
            kind: 'youtube' as const,
            label: 'English (en) · auto-generated',
            language: 'en',
            sourceType: 'asr' as const,
            sourceLanguage: 'en',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
        };
        const translatedTrack: SubtitleTrackLoadable = {
            id: 'youtube-ja-from-en',
            kind: 'youtube' as const,
            label: '日本語 (ja) · auto-translated from English',
            language: 'ja',
            sourceType: 'translation' as const,
            sourceLanguage: 'en',
            targetLanguage: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en&tlang=ja',
        };
        const requestedUrls: string[] = [];
        const originalFetch = globalThis.fetch;
        const translateFetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            expect(url).toContain('translate.googleapis.com');
            expect(url).toContain('sl=en');
            expect(url).toContain('tl=ja');
            return new Response(JSON.stringify({ sentences: [{ trans: '今日は読む。' }] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        });
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: translateFetch,
        });

        try {
            const result = await loadSubtitleTrackCues(translatedTrack, {
                tracks: [sourceTrack, translatedTrack],
                transcriptEligible: true,
                requestText: async url => {
                    requestedUrls.push(url);
                    const parsed = new URL(url);
                    if (parsed.searchParams.get('tlang') === 'ja') return '';
                    return '<transcript><text start="1" dur="2">Today I read.</text></transcript>';
                },
            });

            expect(requestedUrls.some(url => new URL(url).searchParams.get('tlang') === 'ja')).toBe(true);
            expect(requestedUrls.some(url => new URL(url).searchParams.get('lang') === 'en' && !new URL(url).searchParams.has('tlang'))).toBe(true);
            expect(translateFetch).toHaveBeenCalledTimes(1);
            expect(result.track).toBe(translatedTrack);
            expect(result.cues).toMatchObject([{ start: 1, end: 3, text: '今日は読む。' }]);
            expect(translatedTrack.cues).toMatchObject([{ start: 1, end: 3, text: '今日は読む。' }]);
        } finally {
            Object.defineProperty(globalThis, 'fetch', {
                configurable: true,
                value: originalFetch,
            });
        }
    });

    it('can skip generated Google translation fallback for secondary YouTube tracks', async () => {
        const sourceTrack: SubtitleTrackLoadable = {
            id: 'youtube-ja',
            kind: 'youtube' as const,
            label: '日本語 (ja) · auto-generated',
            language: 'ja',
            sourceType: 'asr' as const,
            sourceLanguage: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
        };
        const translatedTrack: SubtitleTrackLoadable = {
            id: 'youtube-en-from-ja',
            kind: 'youtube' as const,
            label: 'English (en) · auto-translated from 日本語',
            language: 'en',
            sourceType: 'translation' as const,
            sourceLanguage: 'ja',
            targetLanguage: 'en',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja&tlang=en',
        };
        const requestText = vi.fn(async url => {
            if (new URL(url).searchParams.has('tlang')) return '';
            return '<transcript><text start="1" dur="2">今日は読む。</text></transcript>';
        });
        const originalFetch = globalThis.fetch;
        const translateFetch = vi.fn();
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: translateFetch,
        });

        try {
            const result = await loadSubtitleTrackCues(translatedTrack, {
                tracks: [sourceTrack, translatedTrack],
                transcriptEligible: false,
                requestText,
                translationFallback: 'skip',
            });

            expect(result.track).toBe(translatedTrack);
            expect(result.cues).toEqual([]);
            expect(requestText).toHaveBeenCalled();
            expect(translateFetch).not.toHaveBeenCalled();
            expect(translatedTrack.cues).toEqual([]);
        } finally {
            Object.defineProperty(globalThis, 'fetch', {
                configurable: true,
                value: originalFetch,
            });
        }
    });

    it('falls back to Android InnerTube tracks when YouTube web timedtext is empty', async () => {
        const { requestedUrls, restore } = stubYouTubeAndroidFallbackEnvironment({
            hl: 'en',
            captionTrack: testYouTubeCaptionTrack({
                languageCode: 'ja',
                label: '日本語',
                query: 'android=1',
            }),
        });

        try {
            const cues = await loadYouTubeTrackCues({
                kind: 'youtube',
                label: 'Japanese (ja)',
                language: 'ja',
                url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
            }, {
                requestText: async url => {
                    requestedUrls.push(url);
                    if (!url.includes('android=1')) return '';
                    if (new URL(url).searchParams.get('fmt') !== 'json3') return '';
                    return JSON.stringify({
                        events: [
                            { tStartMs: 1250, dDurationMs: 1750, segs: [{ utf8: '今日は' }, { utf8: '読む。' }] },
                        ],
                    });
                },
            });

            expect(globalThis.fetch).toHaveBeenCalledWith('https://www.youtube.com/youtubei/v1/player?key=test-key', expect.objectContaining({ method: 'POST' }));
            expect(requestedUrls.some(url => url.includes('android=1') && url.includes('lang=ja'))).toBe(true);
            expect(cues).toMatchObject([{ start: 1.25, end: 3, text: '今日は読む。' }]);
        } finally {
            restore();
        }
    });

    it('matches Android YouTube fallback tracks by stream identity when labels differ', async () => {
        const { requestedUrls, restore } = stubYouTubeAndroidFallbackEnvironment({
            hl: 'ja',
            captionTrack: testYouTubeCaptionTrack({
                languageCode: 'ja',
                label: 'Japanese',
                query: 'android=1',
                vssId: '.ja',
            }),
        });

        try {
            const cues = await loadYouTubeTrackCues({
                kind: 'youtube',
                label: '日本語 (ja)',
                language: 'ja',
                sourceType: 'manual',
                sourceLanguage: 'ja',
                vssId: '.ja',
                url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
            }, {
                requestText: async url => {
                    requestedUrls.push(url);
                    if (!url.includes('android=1')) return '';
                    if (new URL(url).searchParams.get('fmt') !== 'json3') return '';
                    return JSON.stringify({
                        events: [
                            { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: '今日は' }, { utf8: '読む。' }] },
                        ],
                    });
                },
            });

            expect(requestedUrls.some(url => url.includes('android=1') && url.includes('lang=ja'))).toBe(true);
            expect(cues).toMatchObject([{ start: 1, end: 3, text: '今日は読む。' }]);
        } finally {
            restore();
        }
    });

    it('suppresses native YouTube captions with CSS while Yomu is using DOM caption fallback', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        document.body.innerHTML = '<div id="movie_player"></div>';
        const player = document.querySelector('#movie_player') as HTMLElement & {
            setOption: ReturnType<typeof vi.fn>;
            unloadModule: ReturnType<typeof vi.fn>;
        };
        player.setOption = vi.fn();
        player.unloadModule = vi.fn();

        try {
            const active = applySubtitleNativeTrackModes({
                tracks: [{ id: 'youtube-0', label: 'Japanese', kind: 'youtube' }],
                selectedTrackId: 'youtube-0',
                secondaryTrackId: '',
                overlayVisible: true,
                hasPrimaryCues: false,
                currentCueText: undefined,
                youtubeDomCaptionFallbackTrackId: 'youtube-0',
                lastYomuCaptionsActive: false,
            });

            expect(active).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(true);
            expect(player.setOption).not.toHaveBeenCalled();
            expect(player.unloadModule).not.toHaveBeenCalled();
        } finally {
            document.body.innerHTML = '';
            document.documentElement.classList.remove('jpdb-subtitle-yomu-captions-active');
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('suppresses native YouTube captions with CSS while a selected track is loading', () => {
        expectActiveYouTubeNativeCaptionSuppression({
            hasPrimaryCues: false,
            currentCueText: '',
        });
    });

    it('hides native YouTube captions after Yomu has loaded subtitle cues', () => {
        expectActiveYouTubeNativeCaptionSuppression({
            hasPrimaryCues: true,
            currentCueText: '今日は',
        });
    });

    it('hides selected native text tracks and disables default CC while Yomu is active', () => {
        const primary = { mode: 'showing' } as TextTrack;
        const secondary = { mode: 'showing' } as TextTrack;
        const defaultCaption = { mode: 'showing' } as TextTrack;

        const active = applySubtitleNativeTrackModes({
            tracks: [
                { id: 'native-ja', label: 'Japanese', kind: 'native', track: primary },
                { id: 'native-en', label: 'English', kind: 'native', track: secondary },
                { id: 'native-default', label: 'Default CC', kind: 'native', track: defaultCaption },
            ],
            selectedTrackId: 'native-ja',
            secondaryTrackId: 'native-en',
            overlayVisible: true,
            hasPrimaryCues: true,
            currentCueText: '今日は',
            youtubeDomCaptionFallbackTrackId: '',
            lastYomuCaptionsActive: false,
        });

        expect(active).toBe(false);
        expect(primary.mode).toBe('hidden');
        expect(secondary.mode).toBe('hidden');
        expect(defaultCaption.mode).toBe('disabled');
        expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(false);
    });

    it('renders subtitle primary states behind a small interface', () => {
        const loading = renderSubtitlePrimary({
            text: '今日は読む',
            hasParser: true,
            lastRenderedText: '',
            lastRenderedHtml: '',
            karaokeMode: false,
            time: 0,
        });
        expect(loading.html).toContain('jpdb-subtitle-primary-loading');
        expect(loading.html).toContain('今日は読む');
        expect(loading.shouldRequestParse).toBe(true);

        const parsed = renderSubtitlePrimary({
            text: '今日は読む',
            parsedHtml: '<span class="jpdb-reader-word">今日は</span>読む',
            hasParser: true,
            lastRenderedText: '',
            lastRenderedHtml: '',
            karaokeMode: false,
            time: 0,
        });
        expect(parsed.html).toContain('jpdb-reader-word');
        expect(parsed.shouldRequestParse).toBe(false);
        expect(parsed.nextRenderedPrimary).toEqual({ text: '今日は読む', html: parsed.html });

        const parsedWithKaraokeTimings = renderSubtitlePrimary({
            cue: {
                start: 1,
                end: 4,
                text: '今日読む',
                wordTimingsExact: true,
                words: [
                    { text: '今日', start: 1, end: 2 },
                    { text: '読む', start: 2, end: 4 },
                ],
            },
            text: '今日読む',
            parsedHtml: '<span class="jpdb-reader-word">今日</span><span class="jpdb-reader-word">読む</span>',
            hasParser: true,
            lastRenderedText: '',
            lastRenderedHtml: '',
            karaokeMode: true,
            time: 1.5,
        });
        expect(parsedWithKaraokeTimings.karaokeActive).toBe(true);
        expect(parsedWithKaraokeTimings.html).toContain('jpdb-reader-word');
        expect(parsedWithKaraokeTimings.html).not.toContain('jpdb-subtitle-word-current');

        const karaoke = renderSubtitlePrimary({
            cue: {
                start: 1,
                end: 4,
                text: '今日読む',
                wordTimingsExact: true,
                words: [
                    { text: '今日', start: 1, end: 2 },
                    { text: '読む', start: 2, end: 4 },
                ],
            },
            text: '今日読む',
            hasParser: false,
            lastRenderedText: '',
            lastRenderedHtml: '',
            karaokeMode: true,
            time: 1.5,
        });
        expect(karaoke.karaokeActive).toBe(true);
        expect(karaoke.html).toContain('jpdb-subtitle-karaoke-word');
    });

    it('keeps an annotated cue on screen while its authoritative upgrade is in flight', () => {
        const annotated = '<span class="jpdb-reader-word" data-card-state="known">読む</span>';
        // While an authoritative upgrade runs, the controller reports no
        // parsed html for this tick. The existing visual commit is reusable
        // only when both its cue text and settings-bearing parse key match.
        const upgrading = renderControllerPrimarySubtitle({
            cue: undefined,
            text: '本を読む',
            settings: DEFAULT_SETTINGS,
            parseKey: 'ja|本を読む',
            parsedHtml: undefined,
            lastRenderedKey: 'ja|本を読む',
            lastRenderedText: '本を読む',
            lastRenderedHtml: annotated,
            hasFreshEmptyParsedHtml: false,
            hasParser: true,
            time: 0,
        });
        expect(upgrading.html).toBe(annotated);
        expect(upgrading.html).not.toContain('jpdb-subtitle-primary-loading');

        const changedSettings = renderControllerPrimarySubtitle({
            cue: undefined,
            text: '本を読む',
            settings: { ...DEFAULT_SETTINGS, furiganaMode: 'off' },
            parseKey: 'ja|furigana-off|本を読む',
            parsedHtml: undefined,
            lastRenderedKey: 'ja|本を読む',
            lastRenderedText: '本を読む',
            lastRenderedHtml: annotated,
            hasFreshEmptyParsedHtml: false,
            hasParser: true,
            time: 0,
        });
        expect(changedSettings.html).toContain('jpdb-subtitle-primary-loading');
        expect(changedSettings.html).not.toBe(annotated);

        // A different cue must never inherit the previous cue's annotated html,
        // even when the stale key happens to match.
        const otherCue = renderControllerPrimarySubtitle({
            cue: undefined,
            text: '違う行',
            settings: DEFAULT_SETTINGS,
            parseKey: 'ja|前の行',
            parsedHtml: undefined,
            lastRenderedKey: 'ja|前の行',
            lastRenderedText: '本を読む',
            lastRenderedHtml: annotated,
            hasFreshEmptyParsedHtml: false,
            hasParser: true,
            time: 0,
        });
        expect(otherCue.html).toContain('jpdb-subtitle-primary-loading');
        expect(otherCue.html).toContain('違う行');

        const pendingOtherCue = renderControllerPrimarySubtitle({
            cue: { start: 2, end: 4, text: '違う行' },
            text: '違う行',
            settings: DEFAULT_SETTINGS,
            parseKey: 'ja|違う行',
            parsedHtml: undefined,
            lastRenderedKey: 'ja|本を読む',
            lastRenderedText: '本を読む',
            lastRenderedHtml: annotated,
            hasFreshEmptyParsedHtml: false,
            hasParser: true,
            holdLastAnnotatedWhilePending: true,
            time: 2,
        });
        expect(pendingOtherCue.html).toBe(annotated);
        expect(pendingOtherCue.html).not.toContain('jpdb-subtitle-primary-loading');
        expect(pendingOtherCue.shouldRequestParse).toBe(true);
    });

    it('plans transcript hydration around active, visible, and background rows', () => {
        const scroller = document.createElement('div');
        const row = document.createElement('div');
        row.className = 'jpdb-subtitle-list-row';
        row.dataset.rowIndex = '7';
        scroller.append(row);
        scroller.getBoundingClientRect = () => new DOMRect(0, 100, 320, 240);
        row.getBoundingClientRect = () => new DOMRect(0, 140, 320, 30);

        const plan = planTranscriptHydrationIndexes({
            preferredIndex: 4,
            rowCount: 12,
            cursor: 10,
            scroller,
            activeBehind: 1,
            activeAhead: 1,
            maxRows: 8,
            backgroundBatch: 1,
        });

        expect(plan.indexes).toEqual([3, 4, 5, 7, 10]);
        expect(plan.nextCursor).toBe(11);
    });

    it('always includes visible transcript rows even when they exceed the warmup cap', () => {
        const scroller = document.createElement('div');
        scroller.getBoundingClientRect = () => new DOMRect(0, 100, 320, 220);
        for (let index = 1; index <= 5; index++) {
            const row = document.createElement('div');
            row.className = 'jpdb-subtitle-list-row';
            row.dataset.rowIndex = String(index);
            row.getBoundingClientRect = () => new DOMRect(0, 104 + index * 30, 320, 26);
            scroller.append(row);
        }

        const plan = planTranscriptHydrationIndexes({
            preferredIndex: -1,
            rowCount: 10,
            cursor: 8,
            scroller,
            activeBehind: 1,
            activeAhead: 1,
            maxRows: 3,
            backgroundBatch: 2,
        });

        expect(plan.indexes).toEqual([1, 2, 3, 4, 5]);
        expect(plan.nextCursor).toBe(8);
    });

    it('discovers YouTube caption tracks from the current player response', () => {
        const restoreYouTube = stubYouTubePlayerResponse({
            response: testYouTubePlayerResponse({
                captionTracks: [
                    testYouTubeCaptionTrack({ languageCode: 'ja', label: '日本語' }),
                    testYouTubeCaptionTrack({ languageCode: 'ja', label: '日本語' }),
                    testYouTubeCaptionTrack({ languageCode: 'ja', label: '日本語', query: 'pot=best&potc=1' }),
                    testYouTubeCaptionTrack({ languageCode: 'en', label: 'English', kind: 'asr' }),
                ],
            }),
        });

        try {
            const tracks = getYouTubeCaptionTracks();

            expect(tracks).toHaveLength(2);
            expect(tracks[0]).toMatchObject({ label: '日本語 (ja)', language: 'ja', autoGenerated: false });
            expect(tracks[0].url).toContain('fmt=srv3');
            expect(tracks[0].url).toContain('pot=best');
            expect(tracks[1]).toMatchObject({ label: 'English (en) · auto-generated', language: 'en', autoGenerated: true });
        } finally {
            restoreYouTube();
        }
    });

    it('does not reuse stale YouTube caption tracks away from a concrete video page', () => {
        const originalLocation = window.location;
        const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
        document.body.innerHTML = '<div id="movie_player"></div>';
        const player = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & {
            getAudioTrack?: () => { captionTracks?: unknown[] };
            getVideoData?: () => { video_id?: string };
        };
        player.getAudioTrack = () => ({
            captionTracks: [
                { baseUrl: 'https://www.youtube.com/api/timedtext?v=old123&lang=ja', languageCode: 'ja', name: { simpleText: '日本語' } },
            ],
        });
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
            videoDetails: { videoId: 'old123' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=old123&lang=ja', languageCode: 'ja', name: { simpleText: '日本語' } },
                    ],
                },
            },
        };
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/') as unknown as Location,
        });

        try {
            expect(getYouTubeVideoId()).toBe('');
            expect(getYouTubeCaptionTracks()).toEqual([]);
        } finally {
            document.body.innerHTML = '';
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('rejects stale YouTube player responses and player tracks for another video id', () => {
        const originalLocation = window.location;
        const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
        document.body.innerHTML = '<div id="movie_player"></div>';
        const player = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & {
            getAudioTrack?: () => { captionTracks?: unknown[] };
            getVideoData?: () => { video_id?: string };
        };
        player.getVideoData = () => ({ video_id: 'old123' });
        player.getAudioTrack = () => ({
            captionTracks: [
                { baseUrl: 'https://www.youtube.com/api/timedtext?v=old123&lang=ja', languageCode: 'ja', name: { simpleText: '日本語' } },
            ],
        });
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=old123&lang=ja', languageCode: 'ja', name: { simpleText: '日本語' } },
                    ],
                },
            },
        };
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=new456') as unknown as Location,
        });

        try {
            expect(getYouTubeCaptionTracks()).toEqual([]);
        } finally {
            document.body.innerHTML = '';
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('accepts YouTube player responses without videoDetails only when caption URLs match the current video', () => {
        const restoreYouTube = stubYouTubePlayerResponse({
            response: testYouTubePlayerResponse({
                includeVideoDetails: false,
                captionTracks: [testYouTubeCaptionTrack({ languageCode: 'ja', label: '日本語' })],
            }),
        });

        try {
            const tracks = getYouTubeCaptionTracks();

            expect(tracks).toHaveLength(1);
            expect(tracks[0]).toMatchObject({ language: 'ja', label: '日本語 (ja)' });
        } finally {
            restoreYouTube();
        }
    });

    it('prefers same-strength Android YouTube caption URLs when web caption URLs are empty-prone', async () => {
        const originalLocation = window.location;
        const originalFetch = globalThis.fetch;
        const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
        const originalConfig = (window as Window & { ytcfg?: unknown }).ytcfg;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
            videoDetails: { videoId: 'abc123' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja', languageCode: 'ja', vssId: '.ja', name: { simpleText: '日本語' } },
                    ],
                },
            },
        };
        (window as Window & { ytcfg?: { data_: Record<string, unknown> } }).ytcfg = {
            data_: {
                INNERTUBE_API_KEY: 'test-key',
                INNERTUBE_CLIENT_NAME: 'WEB',
                HL: 'ja',
            },
        };
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: vi.fn(async () => new Response(JSON.stringify({
                videoDetails: { videoId: 'abc123' },
                captions: {
                    playerCaptionsTracklistRenderer: {
                        captionTracks: [{
                            baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja&android=1',
                            languageCode: 'ja',
                            vssId: '.ja',
                            name: { simpleText: 'Japanese' },
                        }],
                    },
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
        });

        try {
            const tracks = await discoverYouTubeCaptionTracks();

            expect(globalThis.fetch).toHaveBeenCalledWith('https://www.youtube.com/youtubei/v1/player?key=test-key', expect.objectContaining({ method: 'POST' }));
            expect(tracks).toHaveLength(1);
            expect(tracks[0].url).toContain('android=1');
            expect(tracks[0]).toMatchObject({ language: 'ja', sourceType: 'manual', vssId: '.ja' });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            (window as Window & { ytcfg?: unknown }).ytcfg = originalConfig;
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
        }
    });

    it('keeps manual and auto-generated YouTube tracks separate for the same language', () => {
        const restoreYouTube = stubYouTubePlayerResponse({
            response: testYouTubePlayerResponse({
                captionTracks: [
                    testYouTubeCaptionTrack({ languageCode: 'ja', label: 'Japanese', query: 'name=manual', vssId: '.ja' }),
                    testYouTubeCaptionTrack({ languageCode: 'ja', label: 'Japanese', query: 'kind=asr', kind: 'asr', vssId: 'a.ja' }),
                ],
            }),
        });

        try {
            const tracks = getYouTubeCaptionTracks();

            expect(tracks).toHaveLength(2);
            expect(tracks[0]).toMatchObject({ label: 'Japanese (ja)', language: 'ja', autoGenerated: false, sourceType: 'manual' });
            expect(tracks[1]).toMatchObject({ label: 'Japanese (ja) · auto-generated', language: 'ja', autoGenerated: true, sourceType: 'asr' });
        } finally {
            restoreYouTube();
        }
    });

    it('offers preferred YouTube auto-translated tracks from translation languages', () => {
        const originalLocation = window.location;
        const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
        const originalConfig = (window as Window & { ytcfg?: unknown }).ytcfg;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        (window as Window & { ytcfg?: { get?: (key: string) => unknown } }).ytcfg = {
            get: key => key === 'HL' ? 'ja' : '',
        };
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
            videoDetails: { videoId: 'abc123' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en', vssId: '.en', name: { simpleText: 'English' } },
                    ],
                    translationLanguages: [
                        { languageCode: 'ja', languageName: 'Japanese' },
                        { languageCode: 'en', languageName: 'English' },
                        { languageCode: 'fr', languageName: 'French' },
                    ],
                },
            },
        };

        try {
            const tracks = getYouTubeCaptionTracks();

            expect(tracks.map(track => track.label)).toEqual([
                'English (en)',
                'Japanese (ja) · auto-translated from English',
            ]);
            expect(tracks[1]).toMatchObject({
                language: 'ja',
                sourceType: 'translation',
                sourceLanguage: 'en',
                targetLanguage: 'ja',
                autoGenerated: true,
            });
            expect(new URL(tracks[1].url).searchParams.get('tlang')).toBe('ja');
        } finally {
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            (window as Window & { ytcfg?: unknown }).ytcfg = originalConfig;
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('reads YouTube embed video ids for caption discovery', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/embed/embed123?start=12') as unknown as Location,
        });

        try {
            expect(getYouTubeVideoId()).toBe('embed123');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('discovers YouTube caption tracks from the Android fallback when page state is hidden', async () => {
        const originalLocation = window.location;
        const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
        const originalConfig = (window as Window & { ytcfg?: unknown }).ytcfg;
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                videoDetails: { videoId: 'fallback123' },
                captions: {
                    playerCaptionsTracklistRenderer: {
                        captionTracks: [
                            { baseUrl: 'https://www.youtube.com/api/timedtext?v=fallback123&lang=ja', languageCode: 'ja', name: { simpleText: 'Japanese' } },
                            { baseUrl: 'https://www.youtube.com/api/timedtext?v=fallback123&lang=en', languageCode: 'en', kind: 'asr', name: { simpleText: 'English' } },
                        ],
                    },
                },
            }),
        } as Response);
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=fallback123') as unknown as Location,
        });
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = undefined;
        (window as Window & { ytcfg?: { get?: (key: string) => unknown } }).ytcfg = {
            get: (key: string) => key === 'INNERTUBE_API_KEY' ? 'test-api-key' : '',
        };

        try {
            expect(getYouTubeCaptionTracks()).toEqual([]);
            const tracks = await discoverYouTubeCaptionTracks();

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://www.youtube.com/youtubei/v1/player?key=test-api-key',
                expect.objectContaining({ method: 'POST', credentials: 'include' }),
            );
            expect(tracks.map(track => track.label)).toEqual([
                'Japanese (ja)',
                'English (en) · auto-generated',
            ]);
        } finally {
            fetchSpy.mockRestore();
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            (window as Window & { ytcfg?: unknown }).ytcfg = originalConfig;
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps YouTube auto-generated SRV3 rows stable instead of using karaoke timings', () => {
        const cues = parseSubtitleText(`
            <timedtext><body>
                <p t="1000" d="5000"><s t="0">今日</s><s t="1200">読む</s></p>
                <p t="2500" d="0">\n</p>
                <p t="3000" d="2000"><s t="0">次</s><s t="700">です</s></p>
                <p t="4100" d="0">\n</p>
            </body></timedtext>
        `);

        expect(cues).toMatchObject([
            { start: 1, end: 2.5, text: '今日読む', wordTimingsExact: false },
            { start: 3, end: 4.1, text: '次です', wordTimingsExact: false },
        ]);
        expect(cues[0].words).toBeUndefined();
        expect(cues[1].words).toBeUndefined();
    });

    it('clips overlapping YouTube auto-generated XML captions to the next start', () => {
        const cues = parseSubtitleText(`
            <transcript>
                <text start="10.370" dur="5.919">最初の行</text>
                <text start="13.349" dur="5.520">次の行</text>
                <text start="16.289" dur="4.951">最後の行</text>
            </transcript>
        `);

        expect(cues).toMatchObject([
            { start: 10.37, text: '最初の行', wordTimingsExact: false },
            { start: 13.349, text: '次の行', wordTimingsExact: false },
            { start: 16.289, text: '最後の行', wordTimingsExact: false },
        ]);
        expect(cues[0].end).toBeCloseTo(13.348, 3);
        expect(cues[1].end).toBeCloseTo(16.288, 3);
    });

    it('merges YouTube auto-caption fragments into readable Japanese lines', () => {
        const cues = parseSubtitleText(JSON.stringify({
            events: [
                { tStartMs: 81000, dDurationMs: 900, segs: [{ utf8: 'で、YルートのIPアドレス' }] },
                { tStartMs: 82300, dDurationMs: 600, segs: [{ utf8: '確認してみた' }] },
                { tStartMs: 83100, dDurationMs: 100, segs: [{ utf8: '。' }] },
                { tStartMs: 85200, dDurationMs: 1000, segs: [{ utf8: 'あ、そう。' }] },
            ],
        }));

        expect(cues).toMatchObject([
            { start: 81, text: 'で、YルートのIPアドレス確認してみた。' },
            { start: 85.2, text: 'あ、そう。' },
        ]);
        expect(cues[0].end).toBeGreaterThan(83.1);
    });

    it('keeps short YouTube continuation fragments attached to their line', () => {
        const cues = parseSubtitleText(JSON.stringify({
            events: [
                { tStartMs: 5209000, dDurationMs: 900, segs: [{ utf8: 'これ123' }] },
                { tStartMs: 5210500, dDurationMs: 700, segs: [{ utf8: 'って' }] },
                { tStartMs: 5211600, dDurationMs: 600, segs: [{ utf8: 'あのホスト部' }] },
                { tStartMs: 5213000, dDurationMs: 180, segs: [{ utf8: 'っ。' }] },
                { tStartMs: 5214700, dDurationMs: 900, segs: [{ utf8: '次の行です。' }] },
            ],
        }));

        expect(cues.map(cue => cue.text)).toEqual([
            'これ123ってあのホスト部っ。',
            '次の行です。',
        ]);
    });

    it('deduplicates rolling YouTube caption suffixes while merging fragments', () => {
        const cues = parseSubtitleText(JSON.stringify({
            events: [
                { tStartMs: 5232000, dDurationMs: 900, segs: [{ utf8: 'あ、ああ、そういうことか。' }] },
                { tStartMs: 5232600, dDurationMs: 1200, segs: [{ utf8: '、そういうことか。' }] },
                { tStartMs: 5237000, dDurationMs: 800, segs: [{ utf8: '次です。' }] },
            ],
        }));

        expect(cues.map(cue => cue.text)).toEqual([
            'あ、ああ、そういうことか。',
            '次です。',
        ]);
    });

    it('can smooth fragmented YouTube WebVTT captions after json3 and srv3 fallbacks fail', () => {
        const cues = parseSubtitleText(`WEBVTT

00:00:01.000 --> 00:00:01.900
これは

00:00:02.000 --> 00:00:02.700
テスト

00:00:02.700 --> 00:00:02.800
。

00:00:04.000 --> 00:00:05.000
次です。
`, { smoothYouTubeFragments: true });

        expect(cues.map(cue => cue.text)).toEqual(['これはテスト。', '次です。']);
    });

    it('can mark native subtitle cues as transcript-ineligible', () => {
        const native = normalizeSubtitleCues([{ start: 1, end: 3, text: 'Today I read a book.' }], { transcriptEligible: false });

        expect(native).toMatchObject([{ transcriptEligible: false }]);
    });

    it('parses ASS subtitle dialogue with styling stripped', () => {
        const cues = parseSubtitleText(`
            [Script Info]
            Title: sample
            [Events]
            Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
            Dialogue: 0,0:00:01.25,0:00:03.50,Default,,0,0,0,,{\\i1}今日は\\N本を読む。
        `);

        expect(cues).toMatchObject([{ start: 1.25, end: 3.5, text: '今日は\n本を読む。' }]);
    });

    it('renders subtitle words as tappable JPDB spans with status classes', () => {
        const token: JPDBToken = {
            card: { ...card, cardState: ['never-forget'], spelling: '読む', reading: 'よむ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '読む',
        };

        expect(renderTokensToHtml('読む', [token], DEFAULT_SETTINGS))
            .toContain('jpdb-reader-word jpdb-never-forget');
    });

    it('keeps kana-only explicit ruby from duplicating the visible word', () => {
        document.body.innerHTML = '<p>よむ</p>';
        const [target] = collectTextTargetsIn(document.body, 10, false);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: 'よむ', reading: 'よむ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'よむ', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: 'よむ',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-known')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(word.textContent).toBe('よむ');
        expect(word.querySelector('rt')).toBeNull();
    });

    it('ignores overlapping token ranges instead of duplicating text', () => {
        const tokens: JPDBToken[] = [
            {
                card: { ...card, spelling: '日本語', reading: 'にほんご', cardState: ['learning'] },
                start: 0,
                end: 3,
                length: 3,
                rubies: [],
                pitchClass: '',
                sentence: '日本語',
            },
            {
                card: { ...card, spelling: '本', reading: 'ほん', cardState: ['known'] },
                start: 1,
                end: 2,
                length: 1,
                rubies: [],
                pitchClass: '',
                sentence: '日本語',
            },
        ];

        document.body.innerHTML = renderTokensToHtml('日本語', tokens, DEFAULT_SETTINGS);
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word.jpdb-learning')!;
        expect(readerWordSurfaceText(word))
            .toBe('日本語');
        expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(1);
    });

    it('can parse asbplayer-style subtitle DOM nodes', () => {
        document.body.innerHTML = '<div class="asbplayer-subtitles-container-bottom"><span>今日は読む</span></div>';
        const [target] = collectTextTargetsIn(document.querySelector('.asbplayer-subtitles-container-bottom')!, 12, false);
        const token: JPDBToken = {
            card: { ...card, cardState: ['known'], spelling: '読む', reading: 'よむ' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '今日は読む',
        };

        applyTokensToTextNode(target, [token], DEFAULT_SETTINGS);

        const word = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-known')!;
        expect(readerWordSurfaceText(word))
            .toBe('読む');
    });

    it('unwraps scanned reader words back to surface text for reparsing', () => {
        document.body.innerHTML = `
            <p>今日は<span class="jpdb-reader-word jpdb-known"><ruby>読む<rt class="jpdb-reader-furi">よむ</rt></ruby></span>。</p>
            <div data-jpdb-reader-root="true"><span class="jpdb-reader-word jpdb-known">設定</span></div>
        `;

        expect(readerWordSurfaceText(document.querySelector('p .jpdb-reader-word')!)).toBe('読む');
        expect(unwrapReaderWords(document)).toBe(1);
        expect(document.querySelector('p')?.textContent).toBe('今日は読む。');
        expect(document.querySelector('[data-jpdb-reader-root] .jpdb-reader-word')?.textContent).toBe('設定');
    });

    it('does not unwrap reader words inside explicitly ignored surfaces', () => {
        document.body.innerHTML = `
            <p data-jpdb-reader-surface-ignore="true">青空<span class="jpdb-reader-word jpdb-known"><ruby>読む<rt class="jpdb-reader-furi">よむ</rt></ruby></span>。</p>
            <p>今日は<span class="jpdb-reader-word jpdb-known">読む</span>。</p>
        `;

        expect(unwrapReaderWords(document)).toBe(1);
        expect(document.querySelector('[data-jpdb-reader-surface-ignore] .jpdb-reader-word')).not.toBeNull();
        expect(document.querySelector('[data-jpdb-reader-surface-ignore] rt')?.textContent).toBe('よむ');
        expect(document.querySelectorAll('p')[1]?.textContent).toBe('今日は読む。');
    });

    it('restores injected reader words to surface text when destroyed', () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p>今日は<span class="jpdb-reader-word jpdb-known"><ruby>読む<rt class="jpdb-reader-furi">よむ</rt></ruby></span>。</p>
        `;

        app.destroy();

        expect(document.querySelector('p')?.textContent).toBe('今日は読む。');
        expect(document.querySelector('.jpdb-reader-word')).toBeNull();
    });

    it('keeps existing page words visible while a visible-page reparse is pending', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p>今日は<span class="jpdb-reader-word jpdb-known" data-vid="1" data-sid="2">読む</span>。</p>
        `;
        const scan = deferred<void>();
        const scanVisiblePage = vi.fn(() => scan.promise);
        const internals = app as unknown as {
            jpdb: { clear(): void };
            parser: { clearLocalCache(): void; canParse(): boolean };
            pageScanner: { scanVisiblePage(options: { silent?: boolean }): Promise<void> };
            scheduleJpdbPageEnhancements(delay?: number): void;
            reparseVisiblePage(): Promise<void>;
        };
        internals.jpdb = { clear: vi.fn() };
        internals.parser = { clearLocalCache: vi.fn(), canParse: () => true };
        internals.pageScanner = { scanVisiblePage };
        internals.scheduleJpdbPageEnhancements = vi.fn();

        try {
            const reparse = internals.reparseVisiblePage();

            expect(scanVisiblePage).toHaveBeenCalledWith({ silent: true });
            expect(document.querySelector('p .jpdb-reader-word')?.textContent).toBe('読む');

            scan.resolve();
            await reparse;

            expect(document.querySelector('p .jpdb-reader-word')?.textContent).toBe('読む');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('ignores OCR furigana when deriving the reader word surface text', () => {
        document.body.innerHTML = '<span class="jpdb-reader-word"><span class="jpdb-ocr-ruby"><span class="jpdb-ocr-ruby-base"><span class="jpdb-ocr-furi" data-jpdb-reader-surface-ignore="true">かがみ</span><span class="jpdb-ocr-ruby-base-text">鏡</span></span></span>のない<span class="jpdb-ocr-ruby"><span class="jpdb-ocr-ruby-base"><span class="jpdb-ocr-furi" data-jpdb-reader-surface-ignore="true">むら</span><span class="jpdb-ocr-ruby-base-text">村</span></span></span></span>';

        expect(readerWordSurfaceText(document.querySelector('.jpdb-reader-word')!)).toBe('鏡のない村');
    });

    it('falls back to text lookup without reparsing when a clicked page word has fallen out of cache', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-known';
        word.dataset.vid = '1';
        word.dataset.sid = '2';
        word.textContent = '読む';
        document.body.append(word);

        const getCachedCard = vi.fn(() => undefined);
        const reparseVisiblePage = vi.fn(async () => undefined);
        const lookupText = vi.fn(async () => undefined);
        const toast = vi.fn();
        const internals = app as unknown as {
            getCachedCard: typeof getCachedCard;
            reparseVisiblePage: typeof reparseVisiblePage;
            lookupText: typeof lookupText;
            showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
            toast: typeof toast;
        };
        internals.getCachedCard = getCachedCard;
        internals.reparseVisiblePage = reparseVisiblePage;
        internals.lookupText = lookupText;
        internals.toast = toast;

        try {
            await internals.showWord(word, { trigger: 'click' });
            await vi.runOnlyPendingTimersAsync();

            expect(toast).not.toHaveBeenCalled();
            expect(lookupText).toHaveBeenCalledWith('読む', '読む', expect.objectContaining({
                navigation: 'reset',
            }), expect.objectContaining({
                target: expect.any(Object),
                isCurrent: expect.any(Function),
            }));
            expect(reparseVisiblePage).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            vi.useRealTimers();
        }
    });

    it('uses public JPDB candidates for uncached rendered kana fragments before text fallback', async () => {
        const app = new ReaderApp();
        const fragmentCard = testPublicCard({
            vid: 10,
            spelling: 'ほん',
            reading: 'ほん',
        });
        const jpdbCard = testPublicCard({
            vid: 1464530,
            spelling: '日本語',
            reading: 'にほんご',
        });
        const word = appendRenderedReaderWord(fragmentCard, { text: 'ほん' });
        word.dataset.sentence = 'にほんごのじかん';
        const publicLookupCard = vi.fn(async (term: string) => term === 'にほんご' ? jpdbCard : undefined);
        const jitenLookupMany = vi.fn(async (terms: readonly string[]) => new Map(
            terms.includes('にほんご') ? [['にほんご', jpdbCard]] : [],
        ));
        const lookupText = vi.fn(async () => undefined);
        const showCard = vi.fn(async () => undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            publicLookupCard: typeof publicLookupCard;
            jitenPublicVocabulary: { lookupMany: typeof jitenLookupMany };
            lookupText: typeof lookupText;
            showCard: typeof showCard;
            showWord(word: HTMLElement, options: { trigger?: 'click'; userGesture?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: true,
            showPitchAccent: true,
        };
        internals.publicLookupCard = publicLookupCard;
        internals.jitenPublicVocabulary = { lookupMany: jitenLookupMany };
        internals.lookupText = lookupText;
        internals.showCard = showCard;

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expect(jitenLookupMany.mock.calls[0]?.[0]).toContain('にほんご');
            expect(publicLookupCard).not.toHaveBeenCalled();
            expect(lookupText).not.toHaveBeenCalled();
            expectRenderedKanaModalCard({ showCard, card: jpdbCard, word });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses parsed JPDB tokens for uncached rendered kana fragments when API parsing is available', async () => {
        const app = new ReaderApp();
        const fragmentCard = testPublicCard({
            vid: 10,
            spelling: 'ほん',
            reading: 'ほん',
        });
        const jpdbCard = testPublicCard({
            vid: 1464530,
            spelling: '日本語',
            reading: 'にほんご',
        });
        const token = testTokenForCard(jpdbCard, undefined, {
            end: 4,
            pitchClass: 'heiban',
        });
        const word = appendRenderedReaderWord(fragmentCard, { text: 'ほん' });
        word.dataset.sentence = 'にほんごのじかん';
        const parseJapanese = vi.fn(async () => [[token]]);
        const { internals, publicLookupCard, lookupText, showCard } = configureJitenRenderedWordTest(app, {
            parseJapanese,
            settings: {
            apiKey: 'jpdb-key',
                jitenApiKey: '',
            },
        });

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expectRenderedWordParse(parseJapanese, 'にほんごのじかん');
            expect(publicLookupCard).not.toHaveBeenCalled();
            expect(lookupText).not.toHaveBeenCalled();
            expectRenderedKanaModalCard({ showCard, card: jpdbCard, word });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses parsed Jiten tokens for uncached rendered kana fragments when Jiten parsing is available', async () => {
        const app = new ReaderApp();
        const fragmentCard = jitenTestCard({
            vid: 10,
            sid: 0,
            jitenWordId: 10,
            jitenReadingIndex: 0,
            spelling: 'ほん',
            reading: 'ほん',
        });
        const jitenCard = jitenTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
        });
        const token = testTokenForCard(jitenCard, undefined, {
            end: 4,
            pitchClass: 'heiban',
        });
        const word = appendRenderedReaderWord(fragmentCard, { text: 'ほん' });
        word.dataset.sentence = 'にほんごのじかん';
        const parseJapanese = vi.fn(async () => [[token]]);
        const { internals, publicLookupCard, lookupText, showCard } = configureJitenRenderedWordTest(app, {
            parseJapanese,
        });

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true });

            expect(parseJapanese).toHaveBeenCalledWith(['にほんごのじかん'], expect.objectContaining({
                requireJpdb: true,
            }));
            expect(publicLookupCard).not.toHaveBeenCalled();
            expect(lookupText).not.toHaveBeenCalled();
            expectRenderedKanaModalCard({ showCard, card: jitenCard, word });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('announces main reader toasts politely', () => {
        const app = new ReaderApp();
        const internals = app as unknown as { toast(message: string): void };

        try {
            internals.toast('Copied word.');

            const toast = document.querySelector<HTMLElement>('.jpdb-reader-toast');
            expect(toast?.textContent).toBe('Copied word.');
            expect(toast?.getAttribute('role')).toBe('status');
            expect(toast?.getAttribute('aria-live')).toBe('polite');
        } finally {
            document.body.replaceChildren();
            app.destroy();
        }
    });

    it('opens a kanji card when clicking a single kanji OCR word', async () => {
        const app = new ReaderApp();
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line jpdb-ocr-line-active';
        line.dataset.ocrText = '読';
        line.dataset.sentence = '読む 読 読';
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-not-in-deck';
        word.dataset.vid = '-100';
        word.dataset.sid = '-100';
        word.dataset.expression = '読';
        word.textContent = '読';
        line.append(word);
        document.body.append(line);
        const lookupCard: JPDBCard = {
            ...card,
            vid: -100,
            sid: -100,
            rid: 0,
            spelling: '読',
            reading: '',
            source: 'fallback',
        };
        const showKanjiCard = vi.fn(async () => undefined);
        const showCard = vi.fn(async () => undefined);
        const internals = app as unknown as {
            getCachedCard(vid: number, sid: number): JPDBCard | undefined;
            showKanjiCard: typeof showKanjiCard;
            showCard: typeof showCard;
            showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
        };
        internals.getCachedCard = vi.fn(() => lookupCard);
        internals.showKanjiCard = showKanjiCard;
        internals.showCard = showCard;

        try {
            await internals.showWord(word, { trigger: 'click' });

            expect(showKanjiCard).toHaveBeenCalledWith(
                lookupCard,
                '読',
                '読',
                word,
                expect.objectContaining({ navigation: 'reset' }),
            );
            expect(showCard).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('prefers a parsed anchor sentence over a bare lemma when wiring card actions', () => {
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-known';
        word.dataset.sentence = '好きなものを読んで日本語を学ぶ。';
        word.textContent = '読んで';
        document.body.append(word);

        const internals = app as unknown as {
            preferredCardSentence(sentence: string | undefined, anchor?: HTMLElement): string | undefined;
        };

        try {
            expect(internals.preferredCardSentence('読む', word)).toBe('好きなものを読んで日本語を学ぶ。');
            expect(internals.preferredCardSentence('好きなものを読んで日本語を学ぶ。', word)).toBe('好きなものを読んで日本語を学ぶ。');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('resolves fallback cards at the popup boundary before rendering', async () => {
        const app = new ReaderApp();
        const publicCard = testAozoraCard({ pitchAccent: ['LHHL'] });
        const resolveLookupCard = vi.fn(async () => publicCard);
        const { fallbackCard, internals, load, mountInitialCardShell, updateWord } = createFallbackShowCardBoundaryFixture(app, resolveLookupCard);

        try {
            await internals.showCard(fallbackCard);
            expect(resolveLookupCard).toHaveBeenCalledWith(fallbackCard, expect.objectContaining({
                target: expect.objectContaining({ language: 'ja', interfaceVersion: 9 }),
                isCurrent: expect.any(Function),
            }));
            expect(updateWord).toHaveBeenCalledWith(publicCard, undefined, 'modal', 'reset', undefined);
            expect(load).toHaveBeenCalledWith(publicCard);
            expect(mountInitialCardShell).toHaveBeenCalledWith(expect.any(HTMLElement), publicCard, undefined, undefined, expect.any(Object));
        } finally {
            app.destroy();
        }
    });

    it('upgrades fallback rendered popup words before applying pitch accent colors', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -2069890,
            sid: -2069890,
            spelling: 'あらゆる',
        });
        const publicCard = testPublicCard({
            vid: 2069890,
            spelling: 'あらゆる',
            reading: 'あらゆる',
            pitchAccent: ['LHHL'],
        });
        const word = appendRenderedReaderWord(fallbackCard);

        const search = vi.fn(async () => [publicCard]);
        const pitch = vi.fn(async () => ['LHHL']);
        const { cacheCards, internals } = configurePublicVocabularyEnrichment(app, { search, pitch });

        const token = testTokenForCard(fallbackCard, 'それはあらゆる種類の植物である。');

        try {
            await internals.enrichPitchWords([token]);

            expect(search).toHaveBeenCalledWith('あらゆる', PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT);
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
            expect(token.card).toBe(publicCard);
            expect(token.pitchClass).toBe('nakadaka');
            expect(word.dataset.vid).toBe('2069890');
            expect(word.dataset.reading).toBe('あらゆる');
            expectRenderedPitchWord(word, 'nakadaka');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('adds furigana when public vocabulary enrichment supplies a reading after render', async () => {
        await expectPublicVocabularyFurigana({ furiganaMode: 'all', showFurigana: true });
    });

    it('keeps fallback furigana enrichment running when pitch display is disabled', async () => {
        await expectPublicVocabularyFurigana({
            furiganaMode: 'all',
            showFurigana: true,
            showPitchAccent: false,
        });
    });

    it('adds public vocabulary furigana when automatic mode resolves through JPDB settings', async () => {
        await expectPublicVocabularyFurigana({ apiKey: 'jpdb-key', furiganaMode: 'auto', showFurigana: true });
    });

    it('adds stem furigana when public vocabulary resolves an inflected fallback word', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -1556420,
            sid: -1556420,
            spelling: '読みました',
            fallbackLookupTerms: ['読む'],
        });
        const publicCard = testPublicCard({
            vid: 1556420,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: ['HL'],
        });
        const word = appendRenderedReaderWord(fallbackCard);

        const search = vi.fn(async (term: string) => term === '読む' ? [publicCard] : []);
        const { cacheCards, internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: { furiganaMode: 'all', showFurigana: true },
        });

        const token = testTokenForCard(fallbackCard, '本を読みました。');

        try {
            await internals.enrichPitchWords([token]);

            expect(search).toHaveBeenCalledWith('読む', PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT);
            expect(search).not.toHaveBeenCalledWith('読みました', PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT);
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
            expect(token.card).toBe(publicCard);
            expect(word.dataset.expression).toBe('読む');
            expect(word.dataset.reading).toBe('よむ');
            expect(readerWordSurfaceText(word)).toBe('読みました');
            expect(word.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('読');
            expect(word.querySelector('rt')?.textContent).toBe('よ');
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('reapplies cached public vocabulary to fallback words rendered after the original lookup', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -3402921022,
            sid: -3402921022,
            spelling: '読む',
        });
        const publicCard = testPublicCard({
            vid: 1556420,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: ['HL'],
        });
        const firstWord = appendRenderedReaderWord(fallbackCard);

        const search = vi.fn(async () => [publicCard]);
        const { internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: { furiganaMode: 'all', showFurigana: true },
        });

        const firstToken = testTokenForCard(fallbackCard, '読む');

        try {
            await internals.enrichPitchWords([firstToken]);
            expect(search).toHaveBeenCalledWith('読む', PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT);
            expect(firstWord.dataset.vid).toBe('1556420');

            const laterFallbackCard = { ...fallbackCard, pitchAccent: [] };
            const laterWord = appendRenderedReaderWord(laterFallbackCard, {
                className: 'jpdb-reader-word jpdb-pitch-unknown jpdb-reader-passive-word',
            });
            search.mockClear();

            const laterToken = testTokenForCard(laterFallbackCard, '空気を読む');
            await internals.enrichPitchWords([laterToken]);

            expect(search).not.toHaveBeenCalled();
            expect(laterToken.card).toBe(publicCard);
            expect(laterWord.dataset.vid).toBe('1556420');
            expect(laterWord.dataset.reading).toBe('よむ');
            expect(laterWord.dataset.pitchClass).toBe('atamadaka');
            expect(laterWord.querySelector('rt')?.textContent).toBe('よ');
            laterWord.remove();
        } finally {
            firstWord.remove();
            app.destroy();
        }
    });

    it('enriches atomic JPDB related words with the standard pitch color classes', async () => {
        const app = new ReaderApp();
        const relatedCard = testPublicCard({
            vid: 1556420,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: [],
        });
        const host = document.createElement('div');
        document.body.append(host);
        const word = appendRenderedReaderWord(relatedCard, {
            parent: host,
            className: 'jpdb-reader-word jpdb-reader-passive-word jpdb-not-in-deck jpdb-pitch-unknown',
        });
        word.dataset.jpdbReaderPassive = 'true';
        word.dataset.jpdbReaderRelatedWord = 'true';
        word.dataset.cardSource = 'jpdb';
        word.dataset.cardId = String(relatedCard.vid);
        word.dataset.readingIndex = '0';
        word.dataset.cardState = 'not-in-deck';
        word.dataset.pitchClass = 'unknown';
        word.dataset.expression = relatedCard.spelling;
        word.dataset.reading = relatedCard.reading;

        const search = vi.fn(async () => []);
        const pitch = vi.fn(async () => ['HL']);
        const { internals } = configurePublicVocabularyEnrichment(app, { search, pitch });

        try {
            internals.enrichJpdbRelatedWords(host);

            await waitForExpect(() => {
                expectRenderedPitchWord(word, 'atamadaka');
            });
            expect(pitch).toHaveBeenCalledWith('読む', 'よむ');
            expect(search).not.toHaveBeenCalled();
        } finally {
            host.remove();
            app.destroy();
        }
    });

    it('keeps keyless background fallback hydration on Jiten without JPDB search fan-out', async () => {
        const app = new ReaderApp();
        const firstFallbackCard = testFallbackCard({
            vid: -1381470,
            sid: -1381470,
            spelling: '青空',
        });
        const secondFallbackCard = testFallbackCard({
            vid: -1556420,
            sid: -1556420,
            spelling: '読む',
        });
        const firstPublicCard = testAozoraCard({ pitchAccent: ['LHHL'] });
        const secondPublicCard = testPublicCard({
            vid: 1556420,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: ['HL'],
        });
        const firstWord = appendRenderedReaderWord(firstFallbackCard);
        const secondWord = appendRenderedReaderWord(secondFallbackCard);

        const search = vi.fn(async (term: string) => {
            if (term === '青空') return [firstPublicCard];
            if (term === '読む') return [secondPublicCard];
            return [];
        });
        const { internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: { apiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
        });

        try {
            await internals.enrichPitchWords([testTokenForCard(firstFallbackCard), testTokenForCard(secondFallbackCard)], {
                publicLookupLimit: 2,
                jpdbPublicLookup: false,
            });

            expect(search).not.toHaveBeenCalled();
            expect(firstWord.dataset.vid).toBe(String(firstFallbackCard.vid));
            expect(secondWord.dataset.vid).toBe(String(secondFallbackCard.vid));
        } finally {
            firstWord.remove();
            secondWord.remove();
            app.destroy();
        }
    });

    it('batches bounded public fallback pitch lookups through Jiten lookupMany', async () => {
        const app = new ReaderApp();
        const firstFallbackCard = testFallbackCard({
            vid: -1381470,
            sid: -1381470,
            spelling: '青空',
        });
        const secondFallbackCard = testFallbackCard({
            vid: -1556420,
            sid: -1556420,
            spelling: '読む',
        });
        const firstPublicCard = testAozoraCard({ pitchAccent: ['LHHL'] });
        const secondPublicCard = testPublicCard({
            vid: 1556420,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: ['HL'],
        });
        const firstWord = appendRenderedReaderWord(firstFallbackCard);
        const secondWord = appendRenderedReaderWord(secondFallbackCard);

        const search = vi.fn(async () => []);
        const jitenLookup = vi.fn(async () => null);
        const jitenLookupMany = vi.fn(async (terms: readonly string[]) => new Map(terms.flatMap(term => {
            if (term === '青空') return [[term, firstPublicCard]];
            if (term === '読む') return [[term, secondPublicCard]];
            return [];
        })));
        const { cacheCards, internals } = configurePublicVocabularyEnrichment(app, {
            search,
            jitenLookup,
            jitenLookupMany,
            settings: { apiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
        });

        try {
            await internals.enrichPitchWords([testTokenForCard(firstFallbackCard), testTokenForCard(secondFallbackCard)], { publicLookupLimit: 2 });

            expect(jitenLookupMany).toHaveBeenCalledWith(['青空', '読む'], { detailLimit: 2, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS });
            expect(jitenLookup).not.toHaveBeenCalled();
            expect(search).not.toHaveBeenCalled();
            expect(cacheCards).toHaveBeenCalledWith([firstPublicCard, secondPublicCard]);
            expect(firstWord.dataset.vid).toBe('1381470');
            expect(firstWord.dataset.reading).toBe('あおぞら');
            expect(firstWord.dataset.pitchClass).toBe('nakadaka');
            expect(secondWord.dataset.vid).toBe('1556420');
            expect(secondWord.dataset.reading).toBe('よむ');
            expect(secondWord.dataset.pitchClass).toBe('atamadaka');
        } finally {
            firstWord.remove();
            secondWord.remove();
            app.destroy();
        }
    });

    it('uses batched public Jiten lookup for single fallback card resolution', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -1556420,
            sid: -1556420,
            spelling: '読みました',
            fallbackLookupTerms: ['読む'],
        });
        const publicCard = jitenTestCard({
            vid: 1556420,
            sid: 0,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: ['HL'],
        });

        const search = vi.fn(async () => []);
        const jitenLookup = vi.fn(async () => null);
        const jitenLookupMany = vi.fn(async (terms: readonly string[]) => new Map(
            terms.includes('読む') ? [['読む', publicCard]] : [],
        ));
        const { internals } = configurePublicVocabularyEnrichment(app, {
            search,
            jitenLookup,
            jitenLookupMany,
            settings: { apiKey: '', localDictionariesEnabled: false },
        });

        try {
            await expect(internals.cardLookup.publicLookupFallbackCard(fallbackCard)).resolves.toBe(publicCard);

            expect(jitenLookupMany).toHaveBeenCalledTimes(1);
            const [terms] = jitenLookupMany.mock.calls[0] ?? [[]];
            expect(terms).toContain('読む');
            expect(terms).toContain('読みました');
            expect(jitenLookup).not.toHaveBeenCalled();
            expect(search).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('tries later JPDB candidates for explicit lookup after the Jiten batch misses', async () => {
        const app = new ReaderApp();
        const publicCard = testPublicCard({
            vid: 1775000,
            spelling: '当たり',
            reading: 'あたり',
        });
        const jitenLookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const publicLookupCard = vi.fn(async (term: string) => term === '当たり' ? publicCard : undefined);
        const internals = app as unknown as {
            jitenPublicVocabulary: { lookupMany: typeof jitenLookupMany };
            cardLookup: {
                publicLookupCard: typeof publicLookupCard;
                publicLookupFirstCandidateTerm(terms: readonly string[]): Promise<JPDBCard | undefined>;
            };
        };
        internals.jitenPublicVocabulary = { lookupMany: jitenLookupMany };
        internals.cardLookup.publicLookupCard = publicLookupCard;

        try {
            await expect(internals.cardLookup.publicLookupFirstCandidateTerm(['外れ', '当たり'])).resolves.toBe(publicCard);

            expect(jitenLookupMany).toHaveBeenCalledWith(['外れ', '当たり']);
            expect(publicLookupCard).toHaveBeenCalledWith('外れ', true, expect.objectContaining({ allowCandidateLookup: true }));
            expect(publicLookupCard).toHaveBeenCalledWith('当たり', true, expect.objectContaining({ allowCandidateLookup: true }));
        } finally {
            app.destroy();
        }
    });

    it('uses one Jiten reader parse request for fallback candidate spellings', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -1556420,
            sid: -1556420,
            spelling: '読みました',
            fallbackLookupTerms: ['読む'],
        });
        const publicCard = jitenTestCard({
            vid: 1556420,
            sid: 0,
            spelling: '読む',
            reading: 'よむ',
        });
        const parse = vi.fn(async (terms: string[]) => terms.map(term => term === '読む' ? [{
            card: publicCard,
            start: 0,
            end: term.length,
            length: term.length,
            rubies: [],
            pitchClass: 'atamadaka',
            sentence: term,
        }] : []));
        const internals = app as unknown as {
            jiten: { parse: typeof parse };
            cardLookup: { jitenLookupFallbackCard(card: JPDBCard): Promise<JPDBCard | undefined> };
        };
        internals.jiten = { parse };

        try {
            await expect(internals.cardLookup.jitenLookupFallbackCard(fallbackCard)).resolves.toBe(publicCard);

            expect(parse).toHaveBeenCalledTimes(1);
            const [terms] = parse.mock.calls[0] ?? [[]];
            expect(terms).toContain('読む');
            expect(terms).toContain('読みました');
        } finally {
            app.destroy();
        }
    });

});
