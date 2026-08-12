import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AudioPlayer,
    DEFAULT_SETTINGS,
    ImmersionKitClient,
    ImmersionPopoverController,
    ObjectUrlCache,
    ReaderApp,
    TEST_PROXY_URL,
    bindPrivateCommandCapability,
    card,
    createPageMediaUrl,
    deferred,
    expectKanjiRelatedWordBackNavigation,
    findAudioUrl,
    kanjiRelatedWordNavigationFixture,
    mockAppleMobileBrowser,
    mockAudioPlaybackEnvironment,
    mockHtmlAudioPlayback,
    mockObjectUrls,
    mockProxyAudioBlobFetch,
    mockSpeechSynthesis,
    publicProxyUrlFor,
    registerRenderedWordPrivateState,
    renderedWordPrivateStateForCard,
    resolveUserscriptBlobResponse,
    resolveUserscriptTextResponse,
    stubAudioConstructorPlayback,
    stubCustomJsonAudioRequests,
    stubCustomJsonBlobPlayback,
    testAudioBlob,
    testImmersionKitExample,
    testImmersionPopoverInternals,
    testImmersionPopoverSurface,
    testSynchronousReaderApp,
    unproxiedFetchTarget,
    waitForExpect,
    withKanjiStudyCompanionMissing,
} from './fixtures';
import type {
    ImmersionKitExample,
    JPDBCard,
    JitenApiClient,
    JitenKanjiInfo,
    TestImmersionPopoverInternals,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('fetches custom JSON audio candidates as blobs and caches the source lookup', async () => {
        const audio = stubCustomJsonBlobPlayback();

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                ],
            }));

            await player.play(card);
            await player.play(card);

            expect(audio.requests.source).toBe(1);
            expect(audio.requests.blob).toBe(1);
            expect(audio.played).toEqual(['blob:http://localhost/audio.mp3', 'blob:http://localhost/audio.mp3']);
        } finally {
            audio.restore();
        }
    });

    it('plays custom JSON audio through blob URLs without a direct media attempt', async () => {
        const audio = stubCustomJsonBlobPlayback();

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(audio.requests.source).toBe(1);
            expect(audio.requests.blob).toBe(1);
            expect(audio.played).toEqual(['blob:http://localhost/audio.mp3']);
        } finally {
            audio.restore();
        }
    });

    it('plays hosted custom JSON audio fetched without a userscript bridge before fallback TTS', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: blob => blob.size === 4
                ? 'blob:http://localhost/clip-b.mp3'
                : 'blob:http://localhost/clip-a.mp3',
        });
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', undefined);
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
            const target = unproxiedFetchTarget(input);
            requested.push(target);
            if (target.startsWith('https://audio.test/nested-json')) {
                return Promise.resolve(new Response(JSON.stringify({
                    result: {
                        audioSources: [
                            { source: { url: 'https://audio.test/clip-a.mp3' } },
                            { sources: [{ src: 'https://audio.test/clip-b.mp3' }] },
                        ],
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
            }
            if (target === 'https://audio.test/clip-a.mp3') {
                return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }));
            }
            if (target === 'https://audio.test/clip-b.mp3') {
                return Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }));
            }
            return Promise.reject(new Error(`unexpected fetch: ${target}`));
        }));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioTtsMode: 'fallback',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom-json', url: 'https://audio.test/nested-json?term={term}&reading={reading}', voice: '', enabled: true },
                ],
            }));

            await expect(player.play({ ...card, spelling: '読む', reading: 'よむ' })).resolves.toBe(true);
            await expect(player.play({ ...card, spelling: '読む', reading: 'よむ' })).resolves.toBe(true);

            expect(requested).toEqual([
                'https://audio.test/nested-json?term=%E8%AA%AD%E3%82%80&reading=%E3%82%88%E3%82%80',
                'https://audio.test/clip-a.mp3',
                'https://audio.test/clip-b.mp3',
            ]);
            const audiblePlayed = played.filter(url => !url.includes('UklGRiYAAABX'));
            expect(audiblePlayed).toEqual([
                'blob:http://localhost/clip-a.mp3',
                'blob:http://localhost/clip-b.mp3',
            ]);
            expect(spoken).toEqual([]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('reuses preloaded audio blobs for immediate playback', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const restoreAppleMobile = mockAppleMobileBrowser();
        let blobRequests = 0;
        stubAudioConstructorPlayback(played);
        const restoreObjectUrls = mockObjectUrls(() => 'blob:http://localhost/preloaded-audio');
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                blobRequests += 1;
                details.onload?.({ status: 200, response: testAudioBlob() });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/audio.mp3', voice: '', enabled: true },
                ],
            }));

            player.preload(card);
            await waitForExpect(() => expect(blobRequests).toBe(1));
            await player.play(card);

            expect(blobRequests).toBe(1);
            expect(played).toEqual(['blob:http://localhost/preloaded-audio']);
        } finally {
            restoreObjectUrls();
            restoreMedia();
            restoreAppleMobile();
            vi.unstubAllGlobals();
        }
    });

    it('preloads the next shuffled candidate from multi-url audio responses', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0,
            objectUrl: 'blob:http://localhost/random-preload-candidate',
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.responseType === 'text') {
                    resolveUserscriptTextResponse(details, JSON.stringify({
                        audioSources: [
                            { url: 'http://x.test/first-candidate.mp3' },
                            { url: 'http://x.test/second-candidate.mp3' },
                        ],
                    }));
                    return;
                }
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                ],
            }));

            player.preload(card, { sourceLimit: 1, candidateLimit: 1, prepareAudio: true });
            await waitForExpect(() => expect(requested).toEqual([
                'http://x.test/source?term=%E9%A3%9F%E3%81%B9%E3%82%8B',
                'http://x.test/second-candidate.mp3',
            ]));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual([
                'http://x.test/source?term=%E9%A3%9F%E3%81%B9%E3%82%8B',
                'http://x.test/second-candidate.mp3',
            ]);
            expect(played).toEqual(['blob:http://localhost/random-preload-candidate']);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('can warm audio candidates without downloading playable blobs', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        let blobRequests = 0;
        stubAudioConstructorPlayback(played);
        const restoreObjectUrls = mockObjectUrls(() => 'blob:http://localhost/candidate-only-audio');
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                blobRequests += 1;
                details.onload?.({ status: 200, response: testAudioBlob() });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/audio.mp3', voice: '', enabled: true },
                ],
            }));

            expect(player.preload(card, { prepareAudio: false })).toBe(true);
            await Promise.resolve();

            expect(blobRequests).toBe(0);

            await player.play(card);

            expect(blobRequests).toBe(1);
            expect(played).toEqual(['blob:http://localhost/candidate-only-audio']);
        } finally {
            restoreObjectUrls();
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('skips remote custom JSON lookups for candidate-only background preloads', async () => {
        const requested: string[] = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.responseType === 'text') {
                    resolveUserscriptTextResponse(details, JSON.stringify({
                        audioSources: [{ url: 'http://x.test/audio.mp3' }],
                    }));
                    return;
                }
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                ],
            }));

            expect(player.preload(card, { prepareAudio: false })).toBe(false);
            await Promise.resolve();

            expect(requested).toEqual([]);

            expect(player.preload(card, { prepareAudio: true })).toBe(true);
            await waitForExpect(() => expect(requested).toEqual([
                'http://x.test/source?term=%E9%A3%9F%E3%81%B9%E3%82%8B',
                'http://x.test/audio.mp3',
            ]));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('honors direct custom audio playback when blob playback is disabled in settings', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/forced-custom-audio'),
        });
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
            ok: true,
            status: 200,
            blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
        } as Response)));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'https://audio.test/{term}.mp3', voice: '', enabled: true },
                ],
            }));

            await player.play(card);

            expect(played).toEqual(['https://audio.test/%E9%A3%9F%E3%81%B9%E3%82%8B.mp3']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('forces known CORS-blocked CloudFront audio through proxy blobs even when blob playback is disabled', async () => {
        const target = 'https://d1pra95f92lrn3.cloudfront.net/audio/271184.mp3';
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/study-audio'),
        });
        const fetchMock = mockProxyAudioBlobFetch();

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                corsProxyUrl: TEST_PROXY_URL,
                audioSources: [
                    { type: 'custom', url: target, voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                publicProxyUrlFor(target),
            ]);
            expect(played).toEqual(['blob:http://localhost/study-audio']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('reuses and expires cached object URLs', async () => {
        vi.useFakeTimers();
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });

        try {
            let createCount = 0;
            const cache = new ObjectUrlCache(1000);
            const createUrl = vi.fn(async () => `blob:http://localhost/${++createCount}`);

            await expect(cache.getOrCreate('audio', createUrl)).resolves.toBe('blob:http://localhost/1');
            await expect(cache.getOrCreate('audio', createUrl)).resolves.toBe('blob:http://localhost/1');
            expect(createUrl).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(1000);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/1');

            await expect(cache.getOrCreate('audio', createUrl)).resolves.toBe('blob:http://localhost/2');
            expect(createUrl).toHaveBeenCalledTimes(2);
        } finally {
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            vi.useRealTimers();
        }
    });

    it.each([
        {
            label: 'uses data URLs for page media on jpdb pages to avoid cross-principal blob loads',
            blobType: 'audio/mpeg',
            sourceUrl: undefined,
            objectUrl: 'blob:https://jpdb.io/audio.mp3',
            expectedDataUrl: /^data:audio\/mpeg;base64,/,
        },
        {
            label: 'keeps image MIME types when page media blobs arrive as octet-stream',
            blobType: 'application/octet-stream',
            sourceUrl: 'https://media.example/reference.jpg',
            objectUrl: 'blob:https://jpdb.io/reference.jpg',
            expectedDataUrl: /^data:image\/jpeg;base64,/,
        },
    ])('$label', async ({ blobType, sourceUrl, objectUrl, expectedDataUrl }) => {
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => objectUrl),
        });
        vi.stubGlobal('location', { hostname: 'jpdb.io' });

        try {
            const url = await createPageMediaUrl(
                new Blob(['media'], { type: blobType }),
                sourceUrl,
            );

            expect(url).toMatch(expectedDataUrl);
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            vi.unstubAllGlobals();
        }
    });

    it('falls back to userscript blob fetch for custom JSON audio on Apple mobile', async () => {
        const played: string[] = [];
        const restoreAppleMobile = mockAppleMobileBrowser();
        const restoreMedia = mockHtmlAudioPlayback(played);
        const restoreObjectUrls = mockObjectUrls(() => 'blob:http://localhost/audio-retry');
        stubCustomJsonAudioRequests({
            audioUrl: 'http://x.test/audio/taberu.mp3',
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                ],
            }));

            await player.play(card);

            expect(played).toEqual(['blob:http://localhost/audio-retry']);
        } finally {
            restoreObjectUrls();
            restoreMedia();
            restoreAppleMobile();
            vi.unstubAllGlobals();
        }
    });

    it('rewrites localhost audio URLs returned by a remote custom source', () => {
        expect(findAudioUrl(
            { audioSources: [{ url: 'http://localhost:8080/audio/nhk\\media\\x.mp3' }] },
            'http://tailnet-audio.example:8080/?term=青空&reading=あおぞら',
        )).toBe('http://tailnet-audio.example:8080/audio/nhk/media/x.mp3');
    });

    it('uses userscript GM object requests for Immersion Kit search', async () => {
        const client = new ImmersionKitClient();
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                responseText: JSON.stringify({
                    examples: [{
                        id: 'anime_steins_gate_000002366',
                        sentence: 'メールを読みました',
                        translation: 'I read your message.',
                        image: 'A_SteinsGateS01_E07_1_0.19.51.112.jpg',
                        sound: 'A_SteinsGateS01_E07_1_0.19.50.215-0.19.52.008.mp3',
                        title: 'steins_gate',
                    }],
                }),
            }),
        });

        try {
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimitEnabled: false });

            expect(examples[0]).toMatchObject({ sourceTitle: 'Steins Gate', imageFile: 'A_SteinsGateS01_E07_1_0.19.51.112.jpg' });
            expect(client.mediaUrl(examples[0], 'image')).toContain('https://us-southeast-1.linodeobjects.com/immersionkit/media/anime/Steins%20Gate/media/A_SteinsGateS01_E07_1_0.19.51.112.jpg');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses a configured proxy path for local hosted Immersion Kit search without a userscript bridge', async () => {
        const client = new ImmersionKitClient();
        const configuredProxyUrl = 'https://proxy.example/fetch';
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                examples: [{
                    id: 'anime_steins_gate_000002366',
                    sentence: 'メールを読みました',
                    translation: 'I read your message.',
                    image: 'A_SteinsGateS01_E07_1_0.19.51.112.jpg',
                    sound: 'A_SteinsGateS01_E07_1_0.19.50.215-0.19.52.008.mp3',
                    title: 'steins_gate',
                }],
            }),
        } as Response));
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', fetchMock);

        try {
            const examples = await client.search('読む', {
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitLimitEnabled: false,
                corsProxyUrl: configuredProxyUrl,
            });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0][0])).toContain(configuredProxyUrl);
            expect(String(fetchMock.mock.calls[0][0])).toContain(encodeURIComponent('https://apiv2express.immersionkit.com/search?'));
            expect(examples[0]).toMatchObject({ sourceTitle: 'Steins Gate' });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses direct hosted Immersion Kit search before configured proxy fallbacks', async () => {
        const client = new ImmersionKitClient();
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                examples: [{
                    id: 'anime_steins_gate_000002366',
                    sentence: 'メールを読みました',
                    translation: 'I read your message.',
                    title: 'steins_gate',
                }],
            }),
        } as Response));
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });
            const firstUrl = String(fetchMock.mock.calls[0][0]);

            expect(examples[0]).toMatchObject({ sourceTitle: 'Steins Gate' });
            expect(firstUrl).toContain('https://apiv2express.immersionkit.com/search?');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses the responsive Immersion Kit API host before the legacy host', async () => {
        const client = new ImmersionKitClient();
        let requestUrl = '';
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                requestUrl = url;
                return Promise.resolve({
                    status: 200,
                    responseText: JSON.stringify({
                        examples: [{
                            id: 'anime_steins_gate_000002366',
                            sentence: 'メールを読みました',
                            image: 'A_SteinsGateS01_E07_1_0.19.51.112.jpg',
                            sound: 'A_SteinsGateS01_E07_1_0.19.50.215-0.19.52.008.mp3',
                            title: 'steins_gate',
                        }],
                    }),
                });
            },
        });

        try {
            const [example] = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });

            expect(new URL(requestUrl).host).toBe('apiv2express.immersionkit.com');
            expect(client.mediaUrls(example, 'sound')[0]).toContain('us-southeast-1.linodeobjects.com/immersionkit');
            expect(client.mediaUrls(example, 'sound').some(url => url.includes('apiv2express.immersionkit.com/download_media'))).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('falls back to the legacy Immersion Kit API host when the responsive host fails', async () => {
        const client = new ImmersionKitClient();
        const requestedHosts: string[] = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                const host = new URL(url).host;
                requestedHosts.push(host);
                if (host === 'apiv2express.immersionkit.com') {
                    return Promise.resolve({ status: 504, responseText: '' });
                }
                return Promise.resolve({
                    status: 200,
                    responseText: JSON.stringify({
                        examples: [{
                            id: 'anime_steins_gate_000002366',
                            sentence: 'メールを読みました',
                            title: 'steins_gate',
                        }],
                    }),
                });
            },
        });

        try {
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });

            expect(requestedHosts).toEqual(['apiv2express.immersionkit.com', 'apiv2.immersionkit.com']);
            expect(examples[0]?.sentence).toBe('メールを読みました');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not fan out Immersion Kit host fallbacks after rate limiting', async () => {
        const client = new ImmersionKitClient();
        const requestedHosts: string[] = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                requestedHosts.push(new URL(url).host);
                return Promise.resolve({ status: 429, responseText: 'Too Many Requests' });
            },
        });

        try {
            await expect(client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 }))
                .rejects.toThrow(/429/);

            expect(requestedHosts).toEqual(['apiv2express.immersionkit.com']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not truncate Immersion Kit navigation results to 24 examples', async () => {
        const client = new ImmersionKitClient();
        let requestUrl = '';
        const apiExamples = Array.from({ length: 30 }, (_, index) => ({
            id: `anime_steins_gate_${String(index).padStart(9, '0')}`,
            sentence: `メールを読みました${index}`,
            translation: `I read your message ${index}.`,
            title: 'steins_gate',
        }));
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                requestUrl = url;
                return Promise.resolve({
                    status: 200,
                    responseText: JSON.stringify({ examples: apiExamples }),
                });
            },
        });

        try {
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimitEnabled: false });

            expect(new URL(requestUrl).searchParams.get('limit')).toBe('250');
            expect(examples).toHaveLength(30);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('only applies the Immersion Kit examples-per-word limit when enabled', async () => {
        const client = new ImmersionKitClient();
        const apiExamples = Array.from({ length: 5 }, (_, index) => ({
            id: `anime_steins_gate_${String(index).padStart(9, '0')}`,
            sentence: `メールを読みました${index}`,
            title: 'steins_gate',
        }));
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                responseText: JSON.stringify({ examples: apiExamples }),
            }),
        });

        try {
            await expect(client.search('メール', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimitEnabled: false, immersionKitLimit: 2 })).resolves.toHaveLength(5);
            await expect(client.search('メール', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimitEnabled: true, immersionKitLimit: 2 })).resolves.toHaveLength(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('supports lightweight capped Immersion Kit searches for preloading', async () => {
        const client = new ImmersionKitClient();
        let requestUrl = '';
        const apiExamples = Array.from({ length: 5 }, (_, index) => ({
            id: `anime_steins_gate_${String(index).padStart(9, '0')}`,
            sentence: `メールを読みました${index}`,
            title: 'steins_gate',
        }));
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                requestUrl = url;
                return Promise.resolve({
                    status: 200,
                    responseText: JSON.stringify({ examples: apiExamples }),
                });
            },
        });

        try {
            const examples = await client.search(
                'メール',
                { ...DEFAULT_SETTINGS, immersionKitEnabled: true },
                { requestLimit: 12, resultLimit: 2 },
            );

            expect(new URL(requestUrl).searchParams.get('limit')).toBe('12');
            expect(examples).toHaveLength(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reuses a pending signal-free prefetch for an abortable review reveal', async () => {
        const client = new ImmersionKitClient();
        const response = deferred<{ status: number; responseText: string }>();
        const requests: string[] = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                requests.push(url);
                return response.promise;
            },
        });

        try {
            const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true };
            const searchOptions = { requestLimit: 12, resultLimit: 2, fastFirst: true };
            const prefetch = client.search('読む', settings, searchOptions);
            await vi.waitFor(() => expect(requests).toHaveLength(1));

            const revealController = new AbortController();
            const reveal = client.search('読む', settings, { ...searchOptions, signal: revealController.signal });
            expect(requests).toHaveLength(1);

            response.resolve({
                status: 200,
                responseText: JSON.stringify({
                    examples: [{
                        id: 'anime_steins_gate_000000001',
                        sentence: '本を読む時間です。',
                        title: 'steins_gate',
                    }],
                }),
            });

            const [prefetchedExamples, revealedExamples] = await Promise.all([prefetch, reveal]);
            expect(requests).toHaveLength(1);
            expect(revealedExamples).toEqual(prefetchedExamples);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('searches Nadeshiko with the configured API key and normalizes media examples', async () => {
        const client = new ImmersionKitClient();
        const requests: Array<{ url: string; method?: string; headers?: Record<string, string>; data?: string }> = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: (options: { url: string; method?: string; headers?: Record<string, string>; data?: string }) => {
                requests.push(options);
                return Promise.resolve({
                    status: 200,
                    responseText: JSON.stringify({
                        segments: [{
                            publicId: 'segment-one',
                            mediaPublicId: 'media-one',
                            textJa: { content: 'メールを読みましたよ' },
                            textEn: { content: 'I read the message.' },
                            urls: {
                                imageUrl: 'https://cdn.nadeshiko.co/images/segment-one.jpg',
                                audioUrl: 'https://cdn.nadeshiko.co/audio/segment-one.mp3',
                            },
                        }],
                        includes: {
                            media: {
                                'media-one': { nameRomaji: 'Yuru Camp' },
                            },
                        },
                    }),
                });
            },
        });

        try {
            const [example] = await client.search('読む', {
                ...DEFAULT_SETTINGS,
                immersionKitExampleSource: 'nadeshiko',
                nadeshikoApiKey: 'nad-key',
            });

            expect(requests).toHaveLength(1);
            expect(requests[0].url).toBe('https://api.nadeshiko.co/v1/search');
            expect(requests[0].method).toBe('POST');
            expect(requests[0].headers?.Authorization).toBe('Bearer nad-key');
            expect(JSON.parse(requests[0].data ?? '{}')).toMatchObject({ query: { search: '読む' }, take: 25 });
            expect(example).toMatchObject({
                provider: 'nadeshiko',
                id: 'nadeshiko_segment-one',
                sentence: 'メールを読みましたよ',
                translation: 'I read the message.',
                sourceTitle: 'Yuru Camp',
                imageUrl: 'https://cdn.nadeshiko.co/images/segment-one.jpg',
                soundUrl: 'https://cdn.nadeshiko.co/audio/segment-one.mp3',
            });
            expect(client.mediaUrls(example, 'sound')).toEqual(['https://cdn.nadeshiko.co/audio/segment-one.mp3']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('merges Immersion Kit and Nadeshiko examples with a deterministic blended shuffle', async () => {
        const requestedHosts: string[] = [];
        const immersionExamples = Array.from({ length: 3 }, (_, index) => ({
            id: `anime_steins_gate_${String(index).padStart(9, '0')}`,
            sentence: `メールを読みましたね${index}`,
            title: 'steins_gate',
        }));
        const nadeshikoSegments = Array.from({ length: 3 }, (_, index) => ({
            publicId: `nadeshiko-${index}`,
            mediaPublicId: 'media-one',
            textJa: { content: `メールを読みましたよ${index}` },
            textEn: { content: `I read the message ${index}.` },
            urls: { audioUrl: `https://cdn.nadeshiko.co/audio/${index}.mp3` },
        }));
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                const host = new URL(url).host;
                requestedHosts.push(host);
                if (host === 'api.nadeshiko.co') {
                    return Promise.resolve({
                        status: 200,
                        responseText: JSON.stringify({
                            segments: nadeshikoSegments,
                            includes: { media: { 'media-one': { nameRomaji: 'Yuru Camp' } } },
                        }),
                    });
                }
                return Promise.resolve({
                    status: 200,
                    responseText: JSON.stringify({ examples: immersionExamples }),
                });
            },
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                immersionKitExampleSource: 'combined' as const,
                nadeshikoApiKey: 'nad-key',
                immersionKitLimitEnabled: true,
                immersionKitLimit: 2,
            };
            const firstRun = await new ImmersionKitClient().search('読む', settings);
            const secondRun = await new ImmersionKitClient().search('読む', settings);

            expect(requestedHosts).toEqual(expect.arrayContaining(['apiv2express.immersionkit.com', 'api.nadeshiko.co']));
            expect(firstRun).toHaveLength(2);
            expect(firstRun.map(example => example.provider ?? 'immersion-kit').sort()).toEqual(['immersion-kit', 'nadeshiko']);
            expect(secondRun.map(example => example.id)).toEqual(firstRun.map(example => example.id));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('can return the first combined provider with examples before the slower provider settles', async () => {
        const nadeshikoResponse = deferred<{ status: number; responseText: string }>();
        const requestedHosts: string[] = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                const host = new URL(url).host;
                requestedHosts.push(host);
                if (host === 'api.nadeshiko.co') return nadeshikoResponse.promise;
                return Promise.resolve({
                    status: 200,
                    responseText: JSON.stringify({
                        examples: [{
                            id: 'anime_steins_gate_000000001',
                            sentence: 'メールを読みましたね',
                            title: 'steins_gate',
                        }],
                    }),
                });
            },
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                immersionKitExampleSource: 'combined' as const,
                nadeshikoApiKey: 'nad-key',
            };
            const examples = await new ImmersionKitClient().search('読む', settings, { fastFirst: true, requestLimit: 12, resultLimit: 2 });

            expect(requestedHosts).toEqual(expect.arrayContaining(['apiv2express.immersionkit.com', 'api.nadeshiko.co']));
            expect(examples).toHaveLength(1);
            expect(examples[0]?.provider).toBe('immersion-kit');

            nadeshikoResponse.resolve({
                status: 200,
                responseText: JSON.stringify({ segments: [], includes: { media: {} } }),
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('filters fuzzy Immersion Kit numeric-counter matches back to the selected surface', async () => {
        const client = new ImmersionKitClient();
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                responseText: JSON.stringify({
                    examples: [{
                        id: 'anime_relief_000001',
                        sentence: '1000円の（日代）4点の人',
                        title: 'relife',
                    }, {
                        id: 'anime_nisekoi_000002',
                        sentence: '10年前の日々を思い出します',
                        title: 'nisekoi',
                    }, {
                        id: 'anime_test_000003',
                        sentence: 'あの仕事は少なくとも１０日はかかるな。',
                        title: 'test_source',
                    }, {
                        id: 'anime_test_000004',
                        sentence: 'この仕事は10日で終わります。',
                        title: 'test_source',
                    }],
                }),
            }),
        });

        try {
            const examples = await client.search('１０日', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 4 });

            expect(examples.map(example => example.sentence)).toEqual([
                'あの仕事は少なくとも１０日はかかるな。',
                'この仕事は10日で終わります。',
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps Immersion Kit punctuation in media paths and rejects object-store error documents', async () => {
        const client = new ImmersionKitClient();
        const example = {
            id: 'anime_angel_beats__000001601',
            sentence: '天使',
            sentenceWithFurigana: '天使[てんし]',
            translation: 'Angel.',
            sourceTitle: 'Angel Beats!',
            titleSlug: 'angel_beats_',
            category: 'anime',
            imageFile: 'Angel_Beats!_5_0.05.41.180.jpg',
            soundFile: 'Angel_Beats!_5_0.05.40.830-0.05.41.780.mp3',
            soundUrl: '',
            imageUrl: '',
        };

        expect(client.mediaUrl(example, 'sound')).toContain('https://us-southeast-1.linodeobjects.com/immersionkit/media/anime/Angel%20Beats!/media/Angel_Beats!_5_0.05.40.830-0.05.41.780.mp3');
        expect(client.mediaUrls(example, 'sound').some(url => url.includes('media%2Fanime%2FAngel+Beats%21%2Fmedia%2FAngel_Beats%21_5_0.05.40.830-0.05.41.780.mp3'))).toBe(true);

        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                response: new Blob(['<?xml version="1.0"?><Error>NoSuchKey</Error>'], { type: 'application/xml' }),
            }),
        });

        try {
            await expect(client.fetchBlobUrl(client.mediaUrl(example, 'sound'), DEFAULT_SETTINGS.audioTimeoutMs))
                .rejects.toThrow('Media request returned an error page.');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('fetches hosted Immersion Kit object-store audio through the proxy before creating blob URLs', async () => {
        const client = new ImmersionKitClient();
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:https://hrussellzfac023.github.io/yomu-reader/immersion-kit-audio'),
        });
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        const target = 'https://us-southeast-1.linodeobjects.com/immersionkit/media/anime/Test/media/line.mp3';
        const fetchMock = mockProxyAudioBlobFetch('unexpected direct fetch');

        try {
            await expect(client.fetchBlobUrl(target, DEFAULT_SETTINGS.audioTimeoutMs, TEST_PROXY_URL))
                .resolves.toBe('blob:https://hrussellzfac023.github.io/yomu-reader/immersion-kit-audio');
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                publicProxyUrlFor(target),
            ]);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            vi.unstubAllGlobals();
        }
    });

    it('uses Immersion Kit canonical deck titles for media folders with punctuation', async () => {
        const client = new ImmersionKitClient();
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                responseText: JSON.stringify({
                    examples: [{
                        id: 'anime_re_zero___starting_life_in_another_world_000001845',
                        sentence: 'ああ　確かめたいことがあるんでな',
                        image: 'A_ReZeroS01_E03_1_0.27.20.620.jpg',
                        sound: 'A_ReZeroS01_E03_1_0.27.19.100-0.27.22.140.mp3',
                        title: 're_zero___starting_life_in_another_world',
                    }],
                }),
            }),
        });

        try {
            const [example] = await client.search('確かめたいこと', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });

            expect(example.sourceTitle).toBe('Re Zero − Starting Life in Another World');
            expect(client.mediaUrls(example, 'sound')[0]).toContain('Re%20Zero%20%E2%88%92%20Starting%20Life%20in%20Another%20World');
            expect(client.mediaUrls(example, 'sound')).toContain('https://us-southeast-1.linodeobjects.com/immersionkit/media/anime/Re%20Zero%20%E2%88%92%20Starting%20Life%20in%20Another%20World/media/A_ReZeroS01_E03_1_0.27.19.100-0.27.22.140.mp3');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses canonical Immersion Kit titles instead of humanized slugs', () => {
        const client = new ImmersionKitClient();
        const reZeroWithBadDisplayTitle = {
            id: 'anime_re_zero___starting_life_in_another_world_000001845',
            sentence: 'ああ　確かめたいことがあるんでな',
            sentenceWithFurigana: '',
            translation: '',
            sourceTitle: 'RE Zero Starting Life IN Another World',
            titleSlug: 're_zero___starting_life_in_another_world',
            category: 'anime',
            soundFile: 'A_ReZeroS01_E03_1_0.27.19.100-0.27.22.140.mp3',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const demonSlayer = {
            id: 'anime_demon_slayer___kimetsu_no_yaiba_000001',
            sentence: '鬼だ',
            sentenceWithFurigana: '',
            translation: '',
            sourceTitle: 'Demon Slayer - Kimetsu no Yaiba',
            titleSlug: 'demon_slayer___kimetsu_no_yaiba',
            category: 'anime',
            soundFile: 'Demon_Slayer_01_0.00.01.000-0.00.02.000.mp3',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const fullmetal = {
            ...demonSlayer,
            id: 'anime_fullmetal_alchemist_brotherhood_000001',
            sourceTitle: 'Fullmetal Alchemist Brotherhood',
            titleSlug: 'fullmetal_alchemist_brotherhood',
            soundFile: 'A_FullmetalAlchemistBrotherhood_04_0.15.00.140-0.15.01.090.mp3',
        };

        expect(client.mediaUrls(reZeroWithBadDisplayTitle, 'sound')[0]).toContain('Re%20Zero%20%E2%88%92%20Starting%20Life%20in%20Another%20World');
        expect(client.mediaUrls(reZeroWithBadDisplayTitle, 'sound')[0]).not.toContain('RE+Zero+Starting+Life+IN+Another+World');
        expect(client.mediaUrls(demonSlayer, 'sound')[0]).toContain('Demon%20Slayer%20-%20Kimetsu%20no%20Yaiba');
        expect(client.mediaUrls(fullmetal, 'sound')[0]).toContain('Fullmetal%20Alchemist%20Brotherhood');
        expect(client.mediaUrls(fullmetal, 'sound')[0]).not.toContain('Fullmetal+Alchemist%3A+Brotherhood');
    });

    it('tries the next Immersion Kit media candidate when the first one is an error document', async () => {
        const client = new ImmersionKitClient();
        const originalCreateObjectUrl = URL.createObjectURL;
        const requestedUrls: string[] = [];
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/immersion-ok.mp3'),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                requestedUrls.push(url);
                return Promise.resolve(url.includes('good.mp3')
                    ? { status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) }
                    : { status: 200, response: new Blob(['<?xml version="1.0"?><Error>NoSuchKey</Error>'], { type: 'application/xml' }) });
            },
        });

        try {
            await expect(client.fetchBlobUrl(['https://media.test/bad.mp3', 'https://media.test/good.mp3'], DEFAULT_SETTINGS.audioTimeoutMs))
                .resolves.toBe('blob:http://localhost/immersion-ok.mp3');
            expect(requestedUrls).toEqual(['https://media.test/bad.mp3', 'https://media.test/good.mp3']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            vi.unstubAllGlobals();
        }
    });

    it('waits for an Immersion Kit media candidate to fail before trying the next one', async () => {
        const client = new ImmersionKitClient();
        const originalCreateObjectUrl = URL.createObjectURL;
        const firstRequest = deferred<{ status: number; response: Blob }>();
        const requestedUrls: string[] = [];
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/immersion-ok.mp3'),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ url }: { url: string }) => {
                requestedUrls.push(url);
                if (url.includes('bad.mp3')) return firstRequest.promise;
                return Promise.resolve({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
            },
        });

        try {
            const request = client.fetchBlobUrl(['https://media.test/bad.mp3', 'https://media.test/good.mp3'], DEFAULT_SETTINGS.audioTimeoutMs);
            await Promise.resolve();

            expect(requestedUrls).toEqual(['https://media.test/bad.mp3']);

            firstRequest.resolve({
                status: 200,
                response: new Blob(['<?xml version="1.0"?><Error>NoSuchKey</Error>'], { type: 'application/xml' }),
            });
            await expect(request).resolves.toBe('blob:http://localhost/immersion-ok.mp3');
            expect(requestedUrls).toEqual(['https://media.test/bad.mp3', 'https://media.test/good.mp3']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            vi.unstubAllGlobals();
        }
    });

    it('does not leave popup Immersion Kit examples stuck loading after a hung request', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const container = document.createElement('details');
        container.open = true;
        container.setAttribute('data-immersion-kit', '');
        container.dataset.immersionLoadState = 'loading';
        container.innerHTML = '<summary>Immersion Kit</summary><div class="jpdb-reader-help">Loading examples...</div>';
        const popover = document.createElement('div');
        popover.append(container);
        document.body.append(popover);

        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            immersionPopover: {
                loadExamples(popover: HTMLElement, card: JPDBCard): Promise<void>;
                searchExamples(card: JPDBCard): Promise<unknown>;
            };
        };
        internals.settings = { ...DEFAULT_SETTINGS, audioTimeoutMs: 1000 };
        internals.immersionPopover.searchExamples = vi.fn(() => new Promise(() => undefined));

        try {
            const load = internals.immersionPopover.loadExamples(popover, card);
            await vi.advanceTimersByTimeAsync(2000);
            await load;

            expect(container.dataset.immersionEmpty).toBe('true');
            // The empty verdict hides the whole section instead of rendering a
            // "no examples" note; the loading shell must be gone either way.
            expect(container.hidden).toBe(true);
            expect(container.textContent).not.toContain('Loading examples');
        } finally {
            app.destroy();
            document.body.replaceChildren();
            vi.useRealTimers();
        }
    });

    it('keeps Immersion Kit image fallbacks wired without autoplaying initial render', async () => {
        const { app, container, popover } = testImmersionPopoverSurface();
        const example = testImmersionKitExample({
            sentence: 'ええ 私としては この発音のほうが好ましい',
            imageFile: 'frame.jpg',
        });
        const playSpy = vi.fn(async () => undefined);
        const internals = testImmersionPopoverInternals(app) as TestImmersionPopoverInternals & {
            immersionKit: {
                fetchBlobUrl(url: string | string[], timeoutMs: number): Promise<string>;
            };
        };
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitAutoPlayAudio: true, immersionKitShowImages: true };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '発音',
            usedFallback: false,
            triedQueries: ['発音'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.playExampleAudio = playSpy;
        internals.immersionPopover.mediaUrls = vi.fn((_, kind) => kind === 'image'
            ? ['https://media.test/bad.jpg', 'https://media.test/good.jpg']
            : ['https://media.test/line.mp3']);
        internals.immersionKit.fetchBlobUrl = vi.fn(async url => `blob:http://localhost/${String(Array.isArray(url) ? url[0] : url).split('/').pop()}`);

        await internals.immersionPopover.loadExamples(popover, card);

        const image = container.querySelector<HTMLImageElement>('[data-immersion-image]');
        expect(playSpy).not.toHaveBeenCalled();
        await waitForExpect(() => expect(image?.src).toBe('blob:http://localhost/bad.jpg'));

        image?.dispatchEvent(new Event('error'));

        await waitForExpect(() => expect(image?.src).toBe('blob:http://localhost/good.jpg'));

        container.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();
        expect(playSpy).toHaveBeenCalledWith(example, true);
    });

    it('shows direct Immersion Kit popup images when blob hydration fails', async () => {
        const { app, container, popover } = testImmersionPopoverSurface();
        const imageUrl = 'https://media.test/kakegurui.jpg';
        const example = testImmersionKitExample({
            sentence: 'この塔には謎が多すぎる',
            translation: 'There are too many mysteries in this tower.',
            sourceTitle: 'Kakegurui',
            titleSlug: 'kakegurui',
            imageFile: 'kakegurui.jpg',
        });
        const internals = testImmersionPopoverInternals(app) as TestImmersionPopoverInternals & {
            immersionKit: {
                fetchBlobUrl(url: string | string[], timeoutMs: number): Promise<string>;
            };
        };
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitShowImages: true };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '多',
            usedFallback: false,
            triedQueries: ['多'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.mediaUrls = vi.fn((_, kind) => kind === 'image' ? [imageUrl] : []);
        internals.immersionKit.fetchBlobUrl = vi.fn(async () => {
            throw new Error('proxy offline');
        });

        await internals.immersionPopover.loadExamples(popover, card);

        await waitForExpect(() => {
            const image = container.querySelector<HTMLImageElement>('[data-immersion-image]');
            expect(image?.getAttribute('src')).toBe(imageUrl);
            expect(container.querySelector('.jpdb-reader-example-card')?.classList.contains('has-image')).toBe(true);
        });
    });

    it('does not start Immersion Kit audio on next example when autoplay is disabled', async () => {
        const { app, container, popover } = testImmersionPopoverSurface();
        const example = testImmersionKitExample();
        const playSpy = vi.fn(async () => undefined);
        const internals = testImmersionPopoverInternals(app);
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitAutoPlayAudio: false, immersionKitShowImages: false };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '発音',
            usedFallback: false,
            triedQueries: ['発音'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.playExampleAudio = playSpy;
        internals.immersionPopover.mediaUrls = vi.fn((_, kind) => kind === 'image' ? [] : ['https://media.test/line.mp3']);

        await internals.immersionPopover.loadExamples(popover, card);

        container.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();
        expect(playSpy).not.toHaveBeenCalled();

        playSpy.mockClear();
        container.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();
        expect(playSpy).toHaveBeenCalledWith(example);
    });

    it('routes Immersion Kit popup audio through the shared player with the fetched blob first', async () => {
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
        const playMediaCandidates = vi.fn(async (_urls: string[], _options?: { playbackRate?: number; isCurrent?: () => boolean }) => true);
        const example = {
            id: 'anime_test_000001',
            sentence: 'これは発音です',
            sentenceWithFurigana: '',
            translation: '',
            sourceTitle: 'Test Source',
            titleSlug: 'test_source',
            category: 'anime',
            soundFile: 'line.mp3',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const controller = new ImmersionPopoverController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: false,
            }),
            client: {
                mediaUrls: vi.fn((_: unknown, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/line.mp3'] : []),
                fetchBlobUrl,
            } as unknown as ImmersionKitClient,
            audio: { playMediaCandidates, stop: vi.fn() } as never,
            parseJapanese: vi.fn(async () => []),
            canParseJapanese: () => false,
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast: vi.fn(),
        });

        await (controller as unknown as {
            playExampleAudio(example: ImmersionKitExample): Promise<void>;
        }).playExampleAudio(example);

        expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/line.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);
        expect(playMediaCandidates).toHaveBeenCalledWith(
            ['blob:http://localhost/line.mp3', 'https://media.test/line.mp3'],
            { playbackRate: DEFAULT_SETTINGS.immersionKitPlaybackRate, isCurrent: expect.any(Function) },
        );
    });

    it('still passes the direct Immersion Kit URL to the shared player when blob hydration fails', async () => {
        const fetchBlobUrl = vi.fn(async () => {
            throw new Error('proxy offline');
        });
        const playMediaCandidates = vi.fn(async (_urls: string[], _options?: { playbackRate?: number; isCurrent?: () => boolean }) => true);
        const toast = vi.fn();
        const example = {
            id: 'anime_kakegurui_000006996',
            sentence: 'この塔には謎が多すぎる',
            sentenceWithFurigana: '',
            translation: 'There are too many mysteries in this tower.',
            sourceTitle: 'Kakegurui',
            titleSlug: 'kakegurui',
            category: 'anime',
            soundFile: 'line.mp3',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const controller = new ImmersionPopoverController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: false,
            }),
            client: {
                mediaUrls: vi.fn((_: unknown, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/kakegurui.mp3'] : []),
                fetchBlobUrl,
            } as unknown as ImmersionKitClient,
            audio: { playMediaCandidates, stop: vi.fn() } as never,
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
        }).playExampleAudio(example);

        expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/kakegurui.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);
        expect(playMediaCandidates.mock.calls[0]?.[0]).toEqual(['', 'https://media.test/kakegurui.mp3']);
        expect(toast).not.toHaveBeenCalled();
    });

    it('renders a dictionary-only kanji drilldown fallback when the Kanji/Study companion is missing', async () => {
        await withKanjiStudyCompanionMissing(async () => {
            const { app, restoreAnimationFrame } = testSynchronousReaderApp();

            try {
                const internals = app as unknown as {
                    settings: typeof DEFAULT_SETTINGS;
                    showKanjiCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
                    parsePopoverJapanese(popover: HTMLElement): Promise<void>;
                };
                internals.settings = {
                    ...DEFAULT_SETTINGS,
                    jpdbKanjiEnabled: true,
                    localDictionariesEnabled: false,
                    localDictionaryShowKanji: false,
                    uchisenEnabled: false,
                    rtkEnabled: true,
                    kanjivgEnabled: true,
                    kanjiOriginsEnabled: true,
                    kanjiOriginGraphEnabled: true,
                    similarKanjiWords: false,
                };
                internals.parsePopoverJapanese = vi.fn(async () => undefined);

                await internals.showKanjiCard({ ...card, spelling: '漢字', reading: 'かんじ' }, '漢', '漢字です。');

                await waitForExpect(() => {
                    const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
                    expect(popover.textContent).not.toContain('Install or update the Yomu Kanji/Study companion');
                    expect(popover.textContent).toContain('Kanji details are not available yet.');
                    expect(popover.querySelector('.jpdb-reader-jpdb-kanji')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-rtk')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-kanjivg-svg')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-origin-graph-wrap')).toBeNull();
                    expect(popover.textContent).toContain('Jiten');
                    expect(popover.textContent).toContain('JPDB');
                });
            } finally {
                restoreAnimationFrame();
                vi.unstubAllGlobals();
                app.destroy();
                document.body.replaceChildren();
            }
        });
    });

    it('renders Jiten kanji facts in page-reader kanji drilldown popovers when JPDB is also configured', async () => {
        const { app, restoreAnimationFrame } = testSynchronousReaderApp();
        const jitenInfo: JitenKanjiInfo = {
            character: '寄',
            onReadings: ['キ'],
            kunReadings: ['よ.る'],
            meanings: ['draw near', 'contribute'],
            strokeCount: 11,
            jlptLevel: 3,
            grade: 5,
            frequencyRank: 1234,
            groupingTags: { kanken: '4級', wanikani: null, rtk: 'draw near', klc: null, tmw: null },
            topWords: [],
            wordsByReading: [],
        };
        const lookupKanji = vi.fn(async () => jitenInfo);

        try {
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                jiten: Partial<JitenApiClient>;
                jpdbKanji: { lookup: (kanji: string) => Promise<null> };
                showKanjiCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jitenApiKey: 'ak_jiten-key',
                jpdbKanjiEnabled: true,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                uchisenEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                similarKanjiWords: false,
                immersionKitEnabled: false,
            };
            internals.jiten = { lookupKanji };
            internals.jpdbKanji = { lookup: vi.fn(async () => null) };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);

            await internals.showKanjiCard({ ...card, spelling: '寄付', reading: 'きふ' }, '寄', '寄付です。');

            await waitForExpect(() => {
                const section = document.querySelector<HTMLElement>('.jpdb-reader-jiten-kanji');
                expect(lookupKanji).toHaveBeenCalledWith('寄');
                expect(section?.querySelector('summary')?.textContent?.trim()).toBe('Jiten');
                expect(section?.textContent).toContain('draw near, contribute');
                expect(section?.textContent).toContain('Jiten #1234');
            });
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('adds a late Kanji Alive gloss to the reader popup keyword row', async () => {
        const { app, restoreAnimationFrame } = testSynchronousReaderApp();
        const origin = deferred<{ kanjiAliveKeyword: string } | null>();

        try {
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                jiten: Partial<JitenApiClient>;
                jpdbKanji: { lookup: (kanji: string) => Promise<null> };
                kanjiOrigin: { lookup: () => Promise<{ kanjiAliveKeyword: string } | null> };
                showKanjiCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jitenApiKey: 'ak_jiten-key',
                jpdbKanjiEnabled: true,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                uchisenEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: true,
                kanjiOriginKanjiMapEnabled: true,
                kanjiOriginGraphEnabled: false,
                similarKanjiWords: false,
                immersionKitEnabled: false,
            };
            internals.jiten = { lookupKanji: vi.fn(async () => ({
                character: '生',
                onReadings: ['セイ'],
                kunReadings: ['い.きる'],
                meanings: ['birth'],
                strokeCount: 5,
                jlptLevel: 4,
                grade: 1,
                frequencyRank: 29,
                groupingTags: { kanken: null, wanikani: null, rtk: null, klc: null, tmw: null },
                topWords: [],
                wordsByReading: [],
            })) };
            internals.jpdbKanji = { lookup: vi.fn(async () => null) };
            internals.kanjiOrigin = { lookup: vi.fn(() => origin.promise) };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);

            const render = internals.showKanjiCard({ ...card, spelling: '生活', reading: 'せいかつ' }, '生', '生活です。');
            await waitForExpect(() => expect(document.querySelector('[data-kanji-keyword-mount]')?.textContent).toContain('birth'));
            expect(document.querySelector('[data-kanji-keyword-mount]')?.textContent).not.toContain('Kanji Alive');

            origin.resolve({ kanjiAliveKeyword: 'life' });
            await render;

            await waitForExpect(() => {
                const chips = Array.from(document.querySelectorAll<HTMLElement>('[data-kanji-keyword-mount] .jpdb-reader-kanji-keyword'));
                expect(chips.map(chip => chip.querySelector('.jpdb-reader-kanji-keyword-text')?.textContent)).toEqual(['birth', 'life']);
                expect(chips[1]?.querySelector('.jpdb-reader-kanji-keyword-source')?.textContent).toBe('Kanji Alive');
            });
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not write a late Kanji Alive gloss into a disconnected reader popup', async () => {
        const { app, restoreAnimationFrame } = testSynchronousReaderApp();
        const origin = deferred<{ kanjiAliveKeyword: string } | null>();

        try {
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                kanjiOrigin: { lookup: () => Promise<{ kanjiAliveKeyword: string } | null> };
                showKanjiCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                uchisenEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: true,
                kanjiOriginKanjiMapEnabled: true,
                kanjiOriginGraphEnabled: false,
                similarKanjiWords: false,
                immersionKitEnabled: false,
            };
            internals.kanjiOrigin = { lookup: vi.fn(() => origin.promise) };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);

            const render = internals.showKanjiCard({ ...card, spelling: '生活', reading: 'せいかつ' }, '生', '生活です。');
            await waitForExpect(() => expect(document.querySelector<HTMLElement>('.jpdb-reader-popover')).not.toBeNull());
            const detached = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            detached.remove();
            origin.resolve({ kanjiAliveKeyword: 'life' });
            await render;

            expect(detached.textContent).not.toContain('Kanji Alive');
            expect(detached.textContent).not.toContain('life');
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps kanji dive back navigation inside the kanji stack before returning to the word', async () => {
        const { app, restoreAnimationFrame } = testSynchronousReaderApp();

        try {
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                showKanjiCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                uchisenEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                similarKanjiWords: false,
            };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);
            const kanjiWord = { ...card, spelling: '漢字', reading: 'かんじ' };

            await internals.showKanjiCard(kanjiWord, '漢', '漢字です。');
            document.querySelector<HTMLButtonElement>('[data-action="kanji-next"]')?.click();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('字');
                expect(document.querySelector<HTMLButtonElement>('[data-action="kanji-history-back"]')?.title).toBe('Back to kanji: 漢');
            });

            document.querySelector<HTMLButtonElement>('[data-action="kanji-history-back"]')?.click();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('漢');
                expect(document.querySelector<HTMLButtonElement>('[data-action="word-back"]')?.title).toBe('Back to word: 漢字');
                expect(document.querySelector('[data-action="kanji-history-back"]')).toBeNull();
            });
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
        }
    });

    it('returns from a kanji related word back to the kanji page before the original word', async () => {
        const relatedWord = { ...card, vid: 10, sid: 20, spelling: '漢語', reading: 'かんご' };
        const { app, restoreAnimationFrame, internals, originalWord } = kanjiRelatedWordNavigationFixture(relatedWord);

        try {
            await internals.showKanjiCard(originalWord, '漢', '漢字です。');
            document.querySelector('.jpdb-reader-popover')?.insertAdjacentHTML(
                'beforeend',
                '<button type="button" data-action="similar-word" data-expression="漢語" data-reading="かんご">漢語</button>',
            );
            const similarWord = document.querySelector<HTMLButtonElement>('[data-action="similar-word"]')!;
            bindPrivateCommandCapability(similarWord, {
                kind: 'kanji-word',
                expression: relatedWord.spelling,
                reading: relatedWord.reading,
            });
            similarWord.click();

            await expectKanjiRelatedWordBackNavigation();
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
        }
    });

    it('returns from a kanji dictionary link back to the kanji page before the original word', async () => {
        const linkedWord = { ...card, vid: 11, sid: 21, spelling: '漢語', reading: 'かんご' };
        const { app, restoreAnimationFrame, internals, originalWord } = kanjiRelatedWordNavigationFixture(linkedWord);

        try {
            await internals.showKanjiCard(originalWord, '漢', '漢字です。');
            document.querySelector('.jpdb-reader-popover')?.insertAdjacentHTML(
                'beforeend',
                '<a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="漢語" data-dictionary-reading="かんご" data-dictionary="JPDB"><span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true" data-vid="11" data-sid="21" data-sentence="漢語" tabindex="-1">漢語</span></a>',
            );
            const linkedElement = document.querySelector<HTMLElement>('a.gloss-link[data-dictionary-lookup] .jpdb-reader-word')!;
            registerRenderedWordPrivateState(
                linkedElement,
                renderedWordPrivateStateForCard(linkedWord, 'not-in-deck'),
            );
            linkedElement.click();

            await expectKanjiRelatedWordBackNavigation();
        } finally {
            restoreAnimationFrame();
            vi.unstubAllGlobals();
            app.destroy();
        }
    });

    it('opens the clicked parsed word inside dictionary lookup links instead of the full compound selection', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="日本語訳" data-dictionary-reading="にほんごやく" data-dictionary="JPDB">
                <span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true" data-vid="10" data-sid="20" data-sentence="日本語訳" data-token-start="0" data-token-end="3">日本語</span>
                <span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true" data-vid="11" data-sid="21" data-sentence="日本語訳" data-token-start="3" data-token-end="4">訳</span>
            </a>
        `;
        document.body.append(popover);
        const nestedWord = popover.querySelector<HTMLElement>('.jpdb-reader-word[data-vid="11"]')!;
        const showLookupCandidate = vi.fn(async () => undefined);
        const lookupDictionaryReference = vi.fn(async () => undefined);
        const internals = app as unknown as {
            handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean;
            showLookupCandidate: typeof showLookupCandidate;
            lookupDictionaryReference: typeof lookupDictionaryReference;
        };
        internals.showLookupCandidate = showLookupCandidate;
        internals.lookupDictionaryReference = lookupDictionaryReference;
        let handled = false;
        popover.addEventListener('click', event => {
            handled = internals.handleDictionaryLookupLink(event as MouseEvent, popover, 'modal');
        });

        try {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            nestedWord.dispatchEvent(event);

            expect(handled).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            // Nested-word clicks resolve through the same pointer candidate
            // as every other lookup surface: the compound reference text with
            // the clicked word's offset, so the span authority answers 訳.
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '日本語訳', offset: 3 }),
                'modal',
                expect.objectContaining({ navigation: 'push-current', userGesture: true }),
            );
            expect(lookupDictionaryReference).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('opens the clicked word by identity when the passive shell has no token spans yet', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="日本語訳" data-dictionary-reading="にほんごやく" data-dictionary="JPDB">
                <span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true" data-vid="11" data-sid="21" data-sentence="日本語訳">訳</span>
            </a>
        `;
        document.body.append(popover);
        const nestedWord = popover.querySelector<HTMLElement>('.jpdb-reader-word[data-vid="11"]')!;
        const showWord = vi.fn(async () => undefined);
        const lookupDictionaryReference = vi.fn(async () => undefined);
        const internals = app as unknown as {
            handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean;
            showWord: typeof showWord;
            lookupDictionaryReference: typeof lookupDictionaryReference;
        };
        internals.showWord = showWord;
        internals.lookupDictionaryReference = lookupDictionaryReference;
        let handled = false;
        popover.addEventListener('click', event => {
            handled = internals.handleDictionaryLookupLink(event as MouseEvent, popover, 'modal');
        });

        try {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            nestedWord.dispatchEvent(event);

            expect(handled).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            // The nested re-parse has not stamped token spans, so no pointer
            // candidate resolves — the word's own card identity must still win
            // over the whole-compound reference lookup.
            expect(showWord).toHaveBeenCalledWith(nestedWord, {
                trigger: 'click',
                navigation: 'push-current',
                userGesture: true,
            });
            expect(lookupDictionaryReference).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

});
