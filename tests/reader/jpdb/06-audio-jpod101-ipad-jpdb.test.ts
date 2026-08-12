import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AudioPlayer,
    DEFAULT_SETTINGS,
    JpdbPublicPitchClient,
    JpdbVocabularyClient,
    NEW_TAB_PAGE_URL,
    SETTINGS_CSS,
    TEST_PROXY_URL,
    card,
    createAudioPreviewCard,
    currentLocalDictionaryTargets,
    defaultDictionaryLookupLinks,
    definitionSourceRows,
    encodedJpdbOggHeader,
    findRecommendedDictionary,
    formatMetaFrequency,
    groupTermEntriesByHeadword,
    jpdbParseResultToTokens,
    jpdbVocabularyToCards,
    loadSettings,
    localDictionaryLookupVariants,
    mergeSimilarKanjiWords,
    mockAppleMobileBrowser,
    mockAudioBlobUserscriptRequest,
    mockAudioPlaybackEnvironment,
    mockHtmlAudioPlayback,
    mockJpdbOggAudioFetch,
    mockObjectUrls,
    mockProxyAudioBlobFetch,
    mockSpeechSynthesis,
    normalizeDictionaryLookupLinks,
    parseJpdbPublicPitchHtml,
    parseJpdbSearchHtml,
    publicProxyUrlFor,
    readDictionaryLookupLinks,
    readFormSettings,
    renderDictionaryLookupLinkEditor,
    renderDictionarySourceRows,
    renderKanjiSourceRows,
    renderLocalDefinitionSourcesSection,
    renderPitch,
    renderRecommendedDictionaries,
    renderSettingsForm,
    resolveUserscriptBlobResponse,
    resolveUserscriptTextResponse,
    stubHostedNewTabLocation,
    stubJishoAudioPlayback,
    stubSharedReaderSettings,
    summarizeLearnerGlossary,
    testBlobAudioPlayerForSources,
    testJpdbSentenceAudioPlayer,
    unproxiedFetchTarget,
    updateDictionaryLookupLinkEditor,
    waitForExpect,
} from './fixtures';
import type {
    AudioSourceSetting,
    JPDBCard,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('checks JapanesePod101 clips before playback so unavailable audio can be skipped', async () => {
        const played: string[] = [];
        const restoreBrowser = mockAppleMobileBrowser();
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/jpod101-audio'),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                expect(details.url).toContain('https://assets.languagepod101.com/dictionary/japanese/audiomp3.php');
                details.onload?.({
                    status: 200,
                    response: new Blob(['audio'], { type: 'audio/mpeg' }),
                });
            },
        });
        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                corsProxyUrl: '',
                audioViaBlob: true,
                audioEnableDefaultSources: false,
                audioSources: [{ type: 'jpod101', url: '', voice: '', enabled: true }],
            }));

            await expect(player.play({ ...card, spelling: '月光', reading: 'げっこう' })).resolves.toBe(true);

            expect(played).toEqual(['blob:http://localhost/jpod101-audio']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            restoreMedia();
            restoreBrowser();
            vi.unstubAllGlobals();
        }
    });

    it('uses the spelling as JapanesePod101 kana when a card has no reading', async () => {
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback([]);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/kana-audio'),
        });
        mockAudioBlobUserscriptRequest(details => requested.push(details.url));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSources: [{ type: 'jpod101', url: '', voice: '', enabled: true }],
            }));

            await expect(player.play({ ...card, spelling: 'ねこ', reading: '' })).resolves.toBe(true);

            expect(requested[0]).toContain('https://assets.languagepod101.com/dictionary/japanese/audiomp3.php');
            expect(requested[0]).toContain('kana=%E3%81%AD%E3%81%93');
            expect(requested[0]).not.toContain('kanji=');
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('falls through to browser text-to-speech when an available JapanesePod101 clip cannot start playback', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('Playback blocked', 'NotAllowedError'));
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/jpod101-audio'),
        });
        mockSpeechSynthesis(spoken);
        mockAudioBlobUserscriptRequest(details => requested.push(details.url));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jpod101', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play({ ...card, spelling: '月光', reading: 'げっこう' })).resolves.toBe(true);

            expect(requested).toHaveLength(1);
            expect(requested[0]).toContain('https://assets.languagepod101.com/dictionary/japanese/audiomp3.php');
            expect(spoken).toEqual(['月光']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('uses proxy-backed blob audio for hosted GitHub Pages on iPad Safari', async () => {
        const played: string[] = [];
        const restoreBrowser = mockAppleMobileBrowser();
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            objectUrl: 'blob:https://hrussellzfac023.github.io/yomu-reader/audio',
        });
        stubHostedNewTabLocation();
        const fetchMock = mockProxyAudioBlobFetch();

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioViaBlob: true,
                audioEnableDefaultSources: false,
                corsProxyUrl: TEST_PROXY_URL,
                audioSources: [{ type: 'jpod101', url: '', voice: '', enabled: true }],
            }));

            await expect(player.play({ ...card, spelling: '月光', reading: 'げっこう' })).resolves.toBe(true);

            const requestedUrl = String(fetchMock.mock.calls[0][0]);
            expect(requestedUrl).toBe(publicProxyUrlFor('https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E6%9C%88%E5%85%89&kana=%E3%81%92%E3%81%A3%E3%81%93%E3%81%86'));
            expect(played).toEqual(['blob:https://hrussellzfac023.github.io/yomu-reader/audio']);
        } finally {
            restoreAudio();
            restoreBrowser();
            vi.unstubAllGlobals();
        }
    });

    it('primes a reusable audio element for gesture-triggered hosted iPad playback', async () => {
        const played: string[] = [];
        const restoreBrowser = mockAppleMobileBrowser();
        let resolveFetch: ((response: Response) => void) | undefined;
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            objectUrl: 'blob:https://hrussellzfac023.github.io/yomu-reader/audio',
        });
        stubHostedNewTabLocation();
        const fetchMock = vi.fn(() => new Promise<Response>(resolve => { resolveFetch ??= resolve; }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioViaBlob: true,
                audioEnableDefaultSources: false,
                audioSources: [{ type: 'jpod101', url: '', voice: '', enabled: true }],
            }));

            const playPromise = player.play({ ...card, spelling: '月光', reading: 'げっこう' }, { userGesture: true });
            expect(played).toEqual([expect.stringMatching(/^data:audio\/wav;base64,/)]);
            await waitForExpect(() => expect(resolveFetch).toBeDefined());

            resolveFetch?.({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
            } as Response);
            await expect(playPromise).resolves.toBe(true);

            expect(played).toEqual([
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:https://hrussellzfac023.github.io/yomu-reader/audio',
            ]);
        } finally {
            restoreAudio();
            restoreBrowser();
            vi.unstubAllGlobals();
        }
    });

    it('reserves a gesture audio element before fetching JPDB example audio', async () => {
        const played: string[] = [];
        const loopStates: boolean[] = [];
        let resolveFetch: ((response: Response) => void) | undefined;
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            loopStates,
            objectUrl: 'blob:https://hrussellzfac023.github.io/yomu-reader/jpdb-example-audio',
        });
        stubHostedNewTabLocation();
        const fetchMock = vi.fn(() => new Promise<Response>(resolve => { resolveFetch ??= resolve; }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioViaBlob: true,
                audioEnableDefaultSources: false,
            }));

            const playPromise = player.playJpdbAudio('m1/b4d5af0478d7', { userGesture: true });
            expect(played).toEqual([expect.stringMatching(/^data:audio\/wav;base64,/)]);
            await waitForExpect(() => expect(resolveFetch).toBeDefined());

            const oggHeader = [0x4f, 0x67, 0x67, 0x53];
            const encoded = new Uint8Array(oggHeader.map((byte, index) => byte ^ [0x06, 0x23, 0x54, 0x0f][index]));
            resolveFetch?.({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(new Blob([encoded], { type: 'audio/ogg' })),
            } as Response);
            await expect(playPromise).resolves.toBe(true);

            expect(played).toEqual([
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:https://hrussellzfac023.github.io/yomu-reader/jpdb-example-audio',
            ]);
            expect(loopStates).toEqual([true, false]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('randomizes JPDB sentence audio candidates across repeated plays', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0,
            objectUrl: 'blob:http://localhost/jpdb-random-sentence-audio',
        });
        mockJpdbOggAudioFetch(requested);

        try {
            const player = testJpdbSentenceAudioPlayer();

            await expect(player.playJpdbAudio('m1/sentence-a,m1/sentence-b', { userGesture: true })).resolves.toBe(true);
            await expect(player.playJpdbAudio('m1/sentence-a,m1/sentence-b', { userGesture: true })).resolves.toBe(true);

            expect(requested).toEqual([
                'https://jpdb.io/static/v/m1/sentence-b',
                'https://jpdb.io/static/v/m1/sentence-a',
            ]);
            expect(played).toEqual([
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:http://localhost/jpdb-random-sentence-audio',
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:http://localhost/jpdb-random-sentence-audio',
            ]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('uses signed-in JPDB vocabulary voices for JPDB word audio without repeating', async () => {
        const played: string[] = [];
        const requested: Array<{ target: string; credentials?: RequestCredentials }> = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:https://jpdb.io/signed-in-jpdb-word-audio',
        });
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80',
        });
        const encodedOggHeader = encodedJpdbOggHeader();
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const target = unproxiedFetchTarget(input);
            requested.push({ target, credentials: init?.credentials });
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
            if (target.includes('/static/v/')) {
                return Promise.resolve(new Response(encodedOggHeader, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }));
            }
            return Promise.resolve(new Response('not found', { status: 404 }));
        }));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'jpdb-tts', url: '', voice: '', enabled: true }],
            }));
            const lookupCard = { ...card, vid: 1456360, sid: 1456360, spelling: '読む', reading: 'よむ', source: 'jpdb' as const };

            for (let index = 0; index < 4; index++) {
                await expect(player.play(lookupCard, { userGesture: true })).resolves.toBe(true);
            }

            const vocabularyRequests = requested.filter(request => request.target.includes('/vocabulary/1456360/'));
            const audioRequests = requested.filter(request => request.target.includes('/static/v/'));
            expect(vocabularyRequests).toHaveLength(1);
            expect(vocabularyRequests[0]?.credentials).toBe('same-origin');
            expect(audioRequests.every(request => request.credentials === 'same-origin')).toBe(true);
            expect(audioRequests.map(request => request.target.replace('https://jpdb.io/static/v/', ''))).toEqual([
                'm1/word',
                'f1/word',
                'm2/word',
                'f2/word',
            ]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('uses the userscript JPDB session for settings preview voices away from jpdb.io', async () => {
        const played: string[] = [];
        const requested: Array<{ url: string; responseType?: string; withCredentials?: boolean }> = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:http://127.0.0.1:5173/jpdb-preview-voice',
        });
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5173/yomu-reader/#jpdb-reader-dictionary-lookup',
            origin: 'http://127.0.0.1:5173',
            hostname: '127.0.0.1',
            pathname: '/yomu-reader/',
        });
        const encodedOggHeader = encodedJpdbOggHeader();
        const request = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            requested.push({
                url: details.url,
                responseType: details.responseType,
                withCredentials: details.withCredentials,
            });
            if (details.url.includes('/search?q=%E8%AA%AD%E3%82%80')) {
                details.onload?.({
                    status: 200,
                    response: `
                        <div class="results search">
                            <div class="result vocabulary">
                                <a href="/vocabulary/1456360/読む/よむ#a"><ruby>読<rt>よ</rt></ruby>む</a>
                                <a class="icon-link vocabulary-audio" href="#" data-audio="m1/preview,f1/preview,m2/preview,f2/preview"></a>
                            </div>
                        </div>
                    `,
                    responseText: `
                        <div class="results search">
                            <div class="result vocabulary">
                                <a href="/vocabulary/1456360/読む/よむ#a"><ruby>読<rt>よ</rt></ruby>む</a>
                                <a class="icon-link vocabulary-audio" href="#" data-audio="m1/preview,f1/preview,m2/preview,f2/preview"></a>
                            </div>
                        </div>
                    `,
                });
                return;
            }
            if (details.url.includes('/static/v/')) {
                details.onload?.({
                    status: 200,
                    response: new Blob([encodedOggHeader], { type: 'audio/ogg' }),
                });
                return;
            }
            details.onerror?.(new Error(`Unexpected request: ${details.url}`));
        });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not run when the userscript bridge is available'))));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'jpdb-tts', url: '', voice: '', enabled: true }],
            }));

            for (let index = 0; index < 4; index++) {
                await expect(player.play(createAudioPreviewCard(), { userGesture: true })).resolves.toBe(true);
            }

            const lookupRequests = requested.filter(item => item.url.includes('/search?q=%E8%AA%AD%E3%82%80'));
            const audioRequests = requested.filter(item => item.url.includes('/static/v/'));
            expect(fetch).not.toHaveBeenCalled();
            expect(lookupRequests).toHaveLength(1);
            expect(requested.every(item => item.withCredentials === true)).toBe(true);
            expect(audioRequests.map(item => item.url.replace('https://jpdb.io/static/v/', ''))).toEqual([
                'm1/preview',
                'f1/preview',
                'm2/preview',
                'f2/preview',
            ]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('does not repeat JPDB sentence audio when the same voice set arrives in a different order', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:http://localhost/jpdb-reordered-sentence-audio',
        });
        mockJpdbOggAudioFetch(requested);

        try {
            const player = testJpdbSentenceAudioPlayer();

            await expect(player.playJpdbAudio('m1/sentence-a,m1/sentence-b,m1/sentence-c', { userGesture: true })).resolves.toBe(true);
            await expect(player.playJpdbAudio('m1/sentence-a,m1/sentence-c,m1/sentence-b', { userGesture: true })).resolves.toBe(true);

            expect(requested).toEqual([
                'https://jpdb.io/static/v/m1/sentence-a',
                'https://jpdb.io/static/v/m1/sentence-c',
            ]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('does not invent JPDB sentence voice candidates for a single rendered audio id', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:http://localhost/jpdb-single-sentence-voice',
        });
        mockJpdbOggAudioFetch(requested);

        try {
            const player = testJpdbSentenceAudioPlayer();

            await expect(player.playJpdbAudio('m1/example', { userGesture: true })).resolves.toBe(true);
            await expect(player.playJpdbAudio('m1/example', { userGesture: true })).resolves.toBe(true);

            expect(requested).toEqual([
                'https://jpdb.io/static/v/m1/example',
            ]);
            expect(played).toEqual([
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:http://localhost/jpdb-single-sentence-voice',
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:http://localhost/jpdb-single-sentence-voice',
            ]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('routes Jisho lookup through the lightweight text proxy without a userscript bridge', async () => {
        const spoken: string[] = [];
        vi.stubGlobal('location', { origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('audio fetch failed'))));
        mockSpeechSynthesis(spoken, [{ name: 'Kyoko', lang: 'ja-JP', default: true }] as SpeechSynthesisVoice[]);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioSources: [
                    { type: 'jisho', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls.some(url => url === 'https://jisho.org/search/%E9%A3%9F%E3%81%B9%E3%82%8B')).toBe(false);
            expect(urls.some(url => url === 'https://r.jina.ai/http://jisho.org/search/%E9%A3%9F%E3%81%B9%E3%82%8B')).toBe(true);
            expect(urls.some(url => url.includes('?url=') && url.includes('jisho.org%2Fsearch'))).toBe(false);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('falls back from blocked LanguagePod101 search to the direct audio asset URL', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:https://hrussellzfac023.github.io/yomu-reader/languagepod-fallback'),
        });
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('www.japanesepod101.com')) {
                return Promise.resolve(new Response('blocked', { status: 403 }));
            }
            if (url.includes('assets.languagepod101.com')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    blob: () => Promise.resolve(new Blob(['audio-data'], { type: 'audio/mpeg' })),
                } as Response);
            }
            return Promise.reject(new Error(`unexpected fetch: ${url}`));
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioViaBlob: true,
                audioEnableDefaultSources: false,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'language-pod-101', url: '', voice: '', enabled: true }],
            }));

            const result = await player.play({ ...card, spelling: '読む', reading: 'よむ' });
            const urls = fetchMock.mock.calls.map(([url]) => String(url));
            expect(result).toBe(true);
            expect(urls[0]).toContain('www.japanesepod101.com');
            expect(urls[1]).toContain('assets.languagepod101.com');
            expect(played).toEqual(['blob:https://hrussellzfac023.github.io/yomu-reader/languagepod-fallback']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('plays each configurable audio source through its Yomitan-compatible lookup path', async () => {
        const played: string[] = [];
        const requested: Array<{ method: string; url: string; data?: string; responseType?: string }> = [];
        let blobIndex = 0;
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            objectUrl: () => `blob:http://localhost/source-${++blobIndex}`,
        });
        const jishoHtml = `
            <audio id="audio_猫:ねこ" preload="none">
                <source src="//jisho.test/audio/neko.mp3" type="audio/mpeg">
            </audio>
        `;
        const languagePodHtml = `
            <div class="dc-box--white dc-result-row">
                <audio preload="none"><source src="https://languagepod.test/audio/neko.mp3" type="audio/mp3"></audio>
                <span class="dc-vocab">猫</span><span class="dc-vocab_kana">ねこ</span>
            </div>
        `;
        const textResponseRoutes: Array<{ fragments: string[]; response: string | ((data?: string) => string) }> = [{
            fragments: ['jisho.org/search/'],
            response: jishoHtml,
        }, {
            fragments: ['japanesepod101.com/learningcenter/reference/dictionary_post'],
            response: data => {
                expect(data).toContain('search_query=%E7%8C%AB');
                return languagePodHtml;
            },
        }, {
            fragments: ['commons.wikimedia.org', 'list=search', 'Lingua_Libre'],
            response: JSON.stringify({ query: { search: [{ title: 'File:LL-Q5287 (jpn)-葵心-猫.wav' }] } }),
        }, {
            fragments: ['commons.wikimedia.org', 'list=search'],
            response: JSON.stringify({ query: { search: [{ title: 'File:Ja-satsumaimo.ogg' }] } }),
        }, {
            fragments: ['File%3ALL-Q5287'],
            response: JSON.stringify({ query: { pages: { 1: { imageinfo: [{ url: 'https://commons.test/lingua-neko.wav', user: '葵心' }] } } } }),
        }, {
            fragments: ['File%3AJa-satsumaimo.ogg'],
            response: JSON.stringify({ query: { pages: { 1: { imageinfo: [{ url: 'https://commons.test/ja-satsumaimo.ogg', user: 'speaker' }] } } } }),
        }, {
            fragments: ['custom.test/source'],
            response: JSON.stringify({ audioSources: [{ url: 'https://custom.test/audio/neko.mp3' }] }),
        }];
        const textResponses = (url: string, data?: string): string => {
            const route = textResponseRoutes.find(candidate => candidate.fragments.every(fragment => url.includes(fragment)));
            if (!route) return '';
            return typeof route.response === 'string' ? route.response : route.response(data);
        };
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push({
                    method: details.method ?? 'GET',
                    url: details.url,
                    data: typeof details.data === 'string' ? details.data : undefined,
                    responseType: details.responseType,
                });
                if (details.responseType === 'text') {
                    const response = textResponses(details.url, typeof details.data === 'string' ? details.data : undefined);
                    details.onload?.({ status: response ? 200 : 404, response, responseText: response });
                    return;
                }
                details.onload?.({
                    status: 200,
                    response: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }),
                });
            },
        });
        const parseSpy = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => {
            throw new Error('DOMParser should not be needed for audio source previews.');
        });

        async function playSource(type: AudioSourceSetting['type'], playCard: JPDBCard = { ...card, spelling: '猫', reading: 'ねこ' }): Promise<string[]> {
            const start = played.length;
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type, url: type === 'custom-json' ? 'https://custom.test/source?term={term}&reading={reading}' : '', voice: '', enabled: true },
                ],
            }));
            await expect(player.play(playCard), type).resolves.toBe(true);
            return played.slice(start);
        }

        try {
            const playedBySource = {
                jpod101: await playSource('jpod101'),
                languagePod101: await playSource('language-pod-101'),
                jisho: await playSource('jisho'),
                linguaLibre: await playSource('lingua-libre'),
                wiktionary: await playSource('wiktionary', { ...card, spelling: 'satsumaimo', reading: 'satsumaimo' }),
                customJson: await playSource('custom-json'),
            };

            expect(played).toHaveLength(6);
            expect(Object.values(playedBySource).flat()).toEqual(played);
            expect(playedBySource.jisho).toEqual([expect.stringMatching(/^blob:/)]);
            expect(playedBySource.linguaLibre).toEqual([expect.stringMatching(/^blob:/)]);
            expect(playedBySource.wiktionary).toEqual([expect.stringMatching(/^blob:/)]);
            expect(played.every(url => url.startsWith('blob:'))).toBe(true);
            expect(requested.some(request => request.url.includes('assets.languagepod101.com/dictionary/japanese/audiomp3.php'))).toBe(true);
            expect(requested.some(request => request.method === 'POST' && request.url === 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post')).toBe(true);
            expect(requested.some(request => request.url === 'https://jisho.org/search/%E7%8C%AB')).toBe(true);
            expect(requested.some(request => request.url.includes('Lingua_Libre_pronunciation-jpn'))).toBe(true);
            expect(requested.some(request => request.url.includes('File%3AJa-satsumaimo.ogg'))).toBe(true);
            expect(requested.some(request => request.url.includes('https://custom.test/source?term=%E7%8C%AB&reading=%E3%81%AD%E3%81%93'))).toBe(true);
            expect(parseSpy).not.toHaveBeenCalled();
        } finally {
            parseSpy.mockRestore();
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('uses blob playback before direct media elements for custom JSON audio', async () => {
        const played: string[] = [];
        const requested: Array<{ url: string; responseType?: string }> = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const restoreObjectUrls = mockObjectUrls(() => 'blob:http://localhost/custom-json-audio');
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push({ url: details.url, responseType: details.responseType });
                if (details.responseType === 'text') {
                    const response = JSON.stringify({
                        type: 'audioSourceList',
                        audioSources: [{ name: 'TTS (Default - No DB)', url: 'https://audiov2.animecards.site/audio/tts?term=%E7%8C%AB&apiKey=redacted' }],
                    });
                    resolveUserscriptTextResponse(details, response);
                    return;
                }
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = testBlobAudioPlayerForSources({
                type: 'custom-json',
                url: 'https://custom.test/source?term={term}',
                voice: '',
                enabled: true,
            });

            await expect(player.play({ ...card, spelling: '猫', reading: 'ねこ' })).resolves.toBe(true);

            expect(requested.map(request => request.url)).toEqual([
                'https://custom.test/source?term=%E7%8C%AB',
                'https://audiov2.animecards.site/audio/tts?term=%E7%8C%AB&apiKey=redacted',
            ]);
            expect(played).toEqual(['blob:http://localhost/custom-json-audio']);
        } finally {
            restoreObjectUrls();
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('does not use JapanesePod101 as a Jisho fallback when Jisho has no own audio', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: '<main>No audio here</main>', responseText: '<main>No audio here</main>' });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'jisho', url: '', voice: '', enabled: true }],
            }));

            await expect(player.play({ ...card, spelling: '猫', reading: 'ねこ' })).resolves.toBe(false);

            expect(played).toEqual([]);
            expect(requested).toEqual(['https://jisho.org/search/%E7%8C%AB']);
            expect(requested.some(url => url.includes('assets.languagepod101.com/dictionary/japanese/audiomp3.php'))).toBe(false);
        } finally {
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('matches Jisho audio by reading instead of playing the first same-spelling source', async () => {
        const audio = stubJishoAudioPlayback('blob:http://localhost/jisho-shita', `
            <audio id="audio_下:げ"><source src="//audio.test/ge.mp3" type="audio/mpeg"></audio>
            <audio id="audio_下:した"><source src="//audio.test/shita.mp3" type="audio/mpeg"></audio>
        `);

        try {
            const player = testBlobAudioPlayerForSources({ type: 'jisho', url: '', voice: '', enabled: true });

            await expect(player.play({ ...card, spelling: '下', reading: 'した' })).resolves.toBe(true);

            expect(audio.played).toEqual(['blob:http://localhost/jisho-shita']);
            expect(audio.requested).toContain('https://jisho.org/search/%E4%B8%8B');
            expect(audio.requested).toContain('https://audio.test/shita.mp3');
            expect(audio.requested).not.toContain('https://audio.test/ge.mp3');
        } finally {
            audio.restore();
        }
    });

    it('matches Jisho audio by reading when the lookup term is kana-only', async () => {
        const audio = stubJishoAudioPlayback('blob:http://localhost/jisho-yomu', `
            <audio id="audio_読む:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/f9585fdca1ef179b5388df7d783e7473.mp3" type="audio/mpeg"></source>
            </audio>
        `);

        try {
            const player = testBlobAudioPlayerForSources({ type: 'jisho', url: '', voice: '', enabled: true });

            await expect(player.play({ ...card, spelling: 'よむ', reading: 'よむ' }, { userGesture: true })).resolves.toBe(true);

            expect(audio.played).toEqual([
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:http://localhost/jisho-yomu',
            ]);
            expect(audio.requested).toContain('https://jisho.org/search/%E3%82%88%E3%82%80');
            expect(audio.requested).toContain('https://d1vjc5dkcd3yh2.cloudfront.net/audio/f9585fdca1ef179b5388df7d783e7473.mp3');
        } finally {
            audio.restore();
        }
    });

    it('plays Jisho audio on hosted pages through a configured proxy', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const restoreObjectUrls = mockObjectUrls(() => 'blob:https://hrussellzfac023.github.io/yomu-reader/jisho-neko');
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
            const rawUrl = String(input);
            const target = unproxiedFetchTarget(input);
            requested.push(rawUrl);
            if (target === 'https://jisho.org/search/%E7%8C%AB') {
                return Promise.resolve(new Response(`
                    <audio id="audio_猫:ねこ" preload="none">
                        <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/6b96f918b54d9a75a6bd12a8fb98c48e.mp3" type="audio/mpeg">
                    </audio>
                `, { status: 200, headers: { 'Content-Type': 'text/html' } }));
            }
            if (target === 'https://d1vjc5dkcd3yh2.cloudfront.net/audio/6b96f918b54d9a75a6bd12a8fb98c48e.mp3') {
                return Promise.resolve(new Response('audio', {
                    status: 200,
                    headers: { 'Content-Type': 'audio/mpeg' },
                }));
            }
            return Promise.reject(new Error(`unexpected fetch: ${rawUrl}`));
        }));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                corsProxyUrl: TEST_PROXY_URL,
                audioSources: [{ type: 'jisho', url: '', voice: '', enabled: true }],
            }));

            const result = await player.play({ ...card, spelling: '猫', reading: 'ねこ' }, { userGesture: true });

            expect(result, JSON.stringify({ played, requested })).toBe(true);
            expect(played).toEqual([
                expect.stringMatching(/^data:audio\/wav;base64,/),
                'blob:https://hrussellzfac023.github.io/yomu-reader/jisho-neko',
            ]);
            expect(requested).toEqual([
                publicProxyUrlFor('https://jisho.org/search/%E7%8C%AB'),
                publicProxyUrlFor('https://d1vjc5dkcd3yh2.cloudfront.net/audio/6b96f918b54d9a75a6bd12a8fb98c48e.mp3'),
            ]);
        } finally {
            restoreObjectUrls();
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('renders the pitch variant matching the contextual reading instead of the first pattern', () => {
        const html = renderPitch({
            ...card,
            spelling: '行く',
            reading: 'いく',
            // First pattern fits a longer reading (おこなう); second fits いく.
            pitchAccent: ['LHHHL', 'LHL'],
            source: 'local',
        });

        expect(html).toContain('jpdb-reader-pitch');
        expect(html).toContain('class="odaka"');
        expect(html).toContain('>い<');
        expect(html).toContain('>く<');
    });

    it('renders a one-mora atamadaka graph as a single high point', () => {
        const html = renderPitch({
            ...card,
            spelling: '自',
            reading: 'じ',
            pitchAccent: ['H'],
            source: 'local',
        });

        expect(html).toContain('jpdb-reader-pitch');
        expect(html).toContain('class="atamadaka"');
        expect(html).toContain('cy="10"');
        expect(html).toContain('>じ<');
        expect(html).not.toContain('<polyline');
    });

    it('renders a one-mora heiban graph as a single low point', () => {
        const html = renderPitch({
            ...card,
            spelling: '手',
            reading: 'て',
            pitchAccent: ['L'],
            source: 'local',
        });

        expect(html).toContain('jpdb-reader-pitch');
        expect(html).toContain('class="heiban"');
        expect(html).toContain('cy="29"');
        expect(html).toContain('>て<');
        expect(html).not.toContain('<polyline');
    });

    it('renders every distinct accent variant when a reading has more than one', () => {
        const html = renderPitch({
            ...card,
            spelling: '双子',
            reading: 'ふたご',
            // ふたご is attested both heiban (0) and odaka-ish (3); which one is
            // right depends on the sentence, so both graphs must be shown.
            pitchAccent: ['LHH', 'LHL'],
            source: 'local',
        }, [
            // The local bank repeating a JPDB accent must not duplicate a graph.
            { expression: '双子', mode: 'pitch', data: { reading: 'ふたご', pitches: [{ position: 0 }] }, dictionary: 'Pitch' },
        ]);

        expect(html).toContain('jpdb-reader-pitch-variants');
        expect(html.match(/<svg /g)).toHaveLength(2);
    });

    it('falls back to local pitch metadata when no card pattern fits the contextual reading', () => {
        const html = renderPitch({
            ...card,
            spelling: '行く',
            reading: 'いく',
            pitchAccent: ['LHHHL'],
            source: 'local',
        }, [
            { expression: '行く', mode: 'pitch', data: { reading: 'いく', pitches: [{ position: 0 }] }, dictionary: 'Pitch' },
        ]);

        expect(html).toContain('jpdb-reader-pitch');
        expect(html).toContain('class="heiban"');
    });

    it('renders pitch accent graphs from local Yomitan metadata without a JPDB card pitch', () => {
        const html = renderPitch({
            ...card,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: [],
            source: 'local',
        }, [
            { expression: '読む', mode: 'pitch', data: { reading: 'よむ', pitches: [{ position: 1 }] }, dictionary: 'Pitch' },
        ]);

        expect(html).toContain('jpdb-reader-pitch');
        expect(html).toContain('class="atamadaka"');
        expect(html).toContain('>よ<');
        expect(html).toContain('>む<');
    });

    it('uses kana spelling as the popup pronunciation when local pitch metadata has no card reading', () => {
        const html = renderPitch({
            ...card,
            spelling: 'いちばん',
            reading: '',
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
        }, [
            { expression: 'いちばん', mode: 'pitch', data: { reading: 'いちばん', pitches: [{ position: 2 }] }, dictionary: 'Pitch' },
        ]);

        expect(html).toContain('jpdb-reader-pitch');
        expect(html).toContain('class="nakadaka"');
        expect(html).toContain('>い<');
        expect(html).toContain('>ち<');
        expect(html).toContain('>ば<');
        expect(html).toContain('>ん<');
    });

    it('collapses JPDB character-aligned pitch over small kana when rendering the graph', () => {
        const today = jpdbVocabularyToCards([[
            1579110,
            0,
            0,
            '今日',
            'きょう',
            200,
            ['adv', 'n'],
            [['today']],
            [['adv', 'n']],
            ['not-in-deck'],
            ['HHL'],
        ]])[0]!;
        const html = renderPitch(today);

        expect(today.pitchAccent).toEqual(['HL']);
        expect(html).toContain('class="atamadaka"');
        // Graphs now centre their contour (startX 21, +24/mora), so the drop
        // from きょ (H) to う (L) plots at 21,10 → 45,29.
        expect(html).toContain('points="21,10 45,29"');
        expect(html).not.toContain('points="21,10 45,10"');
        expect(html).toContain('>きょ<');
        expect(html).toContain('>う<');
    });

    it('renders Hatsuon-style heiban graphs across sokuon and digraph morae', () => {
        const html = renderPitch({
            ...card,
            spelling: '特急',
            reading: 'とっきゅう',
            pitchAccent: [],
            source: 'local',
        }, [
            { expression: '特急', mode: 'pitch', data: { reading: 'とっきゅう', pitches: [{ position: 0 }] }, dictionary: 'Pitch' },
        ]);

        expect(html).toContain('class="heiban"');
        expect(html).toContain('>と<');
        expect(html).toContain('>っ<');
        expect(html).toContain('>きゅ<');
        expect(html).toContain('>う<');
    });

    it('aligns alternate-reading pitch graphs to selected ruby and skips comma-separated kana', () => {
        const html = renderPitch({
            ...card,
            spelling: '様',
            reading: 'よう,さま',
            wordWithReading: '様[さま]',
            pitchAccent: ['LH'],
        });

        expect(html).toContain('jpdb-reader-pitch');
        expect(html).toContain('>さ<');
        expect(html).toContain('>ま<');
        expect(html).not.toContain('>よう<');
        expect(html).not.toContain('>,<');
    });

    it('uses token furigana as the popup pronunciation when a JPDB card reading falls back to kanji', () => {
        const cards = jpdbVocabularyToCards([[
            1407930,
            0,
            0,
            '多読',
            '多読',
            9800,
            ['n'],
            [['wide reading']],
            [['n']],
            ['not-in-deck'],
            ['LHH'],
        ]]);

        const [[token]] = jpdbParseResultToTokens(['多読'], [[
            [0, 0, 2, [['多', 'た'], ['読', 'どく']]],
        ]], cards);

        expect(token?.card.reading).toBe('たどく');
        expect(token?.card.wordWithReading).toBe('多[た]読[どく]');
        const html = renderPitch(token!.card);
        expect(html).toContain('>た<');
        expect(html).toContain('>ど<');
        expect(html).toContain('>く<');
        expect(html).not.toContain('>多<');
        expect(html).not.toContain('>読<');
    });

    it('does not render a pitch graph against kanji when no pronunciation is available', () => {
        expect(renderPitch({ ...card, spelling: '多読', reading: '多読', pitchAccent: ['LHH'], wordWithReading: null })).toBe('');
    });

    it('parses pitch accent patterns from public JPDB vocabulary pages', () => {
        const html = `
            <link rel="canonical" href="https://jpdb.io/vocabulary/1157000/%E6%98%93%E3%81%97%E3%81%84/%E3%82%84%E3%81%95%E3%81%97%E3%81%84">
            <div class="result vocabulary">
                <a href="/vocabulary/1157000/%E6%98%93%E3%81%97%E3%81%84/%E3%82%84%E3%81%95%E3%81%97%E3%81%84#a">易しい</a>
                <div class="subsection-used-in">
                    <a href="/vocabulary/1642590/%E7%94%9F%E6%98%93%E3%81%97%E3%81%84/%E3%81%AA%E3%81%BE%E3%82%84%E3%81%95%E3%81%97%E3%81%84#a">生易しい</a>
                </div>
                <div class="subsection-pitch-accent">
                    <div class="subsection">
                        <div>
                            <div>
                                <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>や</div></div>
                                <div style="background-image: linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e));"><div>さしい</div></div>
                            </div>
                            <div>
                                <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>や</div></div>
                                <div style="background-image: linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e));"><div>さし</div></div>
                                <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>い</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        expect(parseJpdbPublicPitchHtml(html, '易しい', 'やさしい')).toEqual(['LHHH', 'LHHL']);
        expect(parseJpdbPublicPitchHtml(html, '生易しい', 'なまやさしい')).toEqual([]);
        expect(parseJpdbPublicPitchHtml(html, '難しい', 'むずかしい')).toEqual([]);
    });

    it('ignores mobile pitch punctuation when reading public JPDB pitch segments', () => {
        const html = `
            <link rel="canonical" href="https://jpdb.io/vocabulary/1407930/%E6%A7%98/%E3%81%95%E3%81%BE">
            <div class="result vocabulary">
                <a href="/vocabulary/1407930/%E6%A7%98/%E3%81%95%E3%81%BE#a">様</a>
                <div class="subsection-pitch-accent">
                    <div class="subsection">
                        <div>
                            <div>
                                <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>さ , </div></div>
                                <div style="background-image: linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e));"><div>ま</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        expect(parseJpdbPublicPitchHtml(html, '様', 'さま')).toEqual(['LH']);
    });

    it('keeps a valid one-mora atamadaka pattern from a public JPDB vocabulary page', () => {
        const html = `
            <link rel="canonical" href="https://jpdb.io/vocabulary/2259190/%E8%87%AA/%E3%81%98">
            <div class="result vocabulary">
                <a href="/vocabulary/2259190/%E8%87%AA/%E3%81%98#a">自</a>
                <div class="subsection-pitch-accent">
                    <div class="subsection">
                        <div>
                            <div>
                                <div style="background-image: linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e));"><div>じ</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        expect(parseJpdbPublicPitchHtml(html, '自', 'じ')).toEqual(['H']);
    });

    it('keeps a valid one-mora heiban pattern from a public JPDB vocabulary page', () => {
        const html = `
            <link rel="canonical" href="https://jpdb.io/vocabulary/9999999/%E6%89%8B/%E3%81%A6">
            <div class="result vocabulary">
                <a href="/vocabulary/9999999/%E6%89%8B/%E3%81%A6#a">手</a>
                <div class="subsection-pitch-accent">
                    <div class="subsection">
                        <div>
                            <div>
                                <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>て</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        expect(parseJpdbPublicPitchHtml(html, '手', 'て')).toEqual(['L']);
    });

    it('keeps pitch accent from public JPDB search cards', () => {
        const html = `
            <div class="results search">
                <div class="result vocabulary">
                    <a href="/vocabulary/1381470/%E9%9D%92%E7%A9%BA/%E3%81%82%E3%81%8A%E3%81%9E%E3%82%89#a">青空</a>
                    <div class="subsection-headword">
                        <div class="primary-spelling"><div class="spelling"><ruby>青<rt>あお</rt>空<rt>ぞら</rt></ruby></div></div>
                    </div>
                    <div class="subsection-meanings"><div class="description">1. blue sky</div></div>
                    <div class="subsection-pitch-accent">
                        <div class="subsection">
                            <div>
                                <div>
                                    <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>あ</div></div>
                                    <div style="background-image: linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e));"><div>おぞ</div></div>
                                    <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>ら</div></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        expect(parseJpdbSearchHtml(html, 1)[0]).toMatchObject({
            spelling: '青空',
            reading: 'あおぞら',
            pitchAccent: ['LHHL'],
        });
    });

    it('uses the built-in public proxy for JPDB pitch without a configured proxy', async () => {
        vi.stubGlobal('location', { origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('proxy offline'))));

        try {
            const client = new JpdbPublicPitchClient();

            await expect(client.lookup('易しい', 'やさしい')).resolves.toEqual([]);
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls.length).toBeGreaterThan(0);
            expect(urls.every(url => url.startsWith('https://edge.yomureader.com/') || url.startsWith('https://yomu-jpdb-public-proxy.'))).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses the built-in public proxy for JPDB vocabulary details without a configured proxy', async () => {
        vi.stubGlobal('location', { origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('proxy offline'))));

        try {
            const client = new JpdbVocabularyClient();

            await expect(client.lookup(123, '読む', 'よむ')).resolves.toBeNull();
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls.length).toBeGreaterThan(0);
            expect(urls.every(url => url.startsWith('https://edge.yomureader.com/') || url.startsWith('https://yomu-jpdb-public-proxy.'))).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('caches keyless public JPDB search results across client instances', async () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/search',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
        });
        const html = `
            <div class="results search">
                <div class="result vocabulary">
                    <a href="/vocabulary/123/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a">読む</a>
                    <div class="subsection-headword">
                        <div class="primary-spelling"><div class="spelling"><ruby>読<rt>よ</rt>む<rt></rt></ruby></div></div>
                    </div>
                    <div class="subsection-meanings"><div class="description">1. to read</div></div>
                </div>
            </div>
        `;
        const fetchMock = vi.fn(async () => new Response(html, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const first = await new JpdbVocabularyClient().search('読む', 1);
        const second = await new JpdbVocabularyClient().search('読む', 1);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(first[0]).toMatchObject({ spelling: '読む', reading: 'よむ', meanings: [{ glosses: ['to read'] }] });
        expect(second[0]).toMatchObject({ spelling: '読む', reading: 'よむ', meanings: [{ glosses: ['to read'] }] });
        expect(localStorage.getItem('yomu:jpdb-cache:v1')).toContain('search');
    });

    it('summarizes kanji used-in glossary text for quick learner scanning', () => {
        expect(summarizeLearnerGlossary({
            glossary: ['na-adj noun easy simple plain ココの知らせるのは容易ではない。 Testing Koko\'s IQ is not easy. JMdict | Tatoeba'],
        })).toBe('easy, simple, plain');
        expect(summarizeLearnerGlossary({
            glossary: ['noun suru transitive intransitive trade commerce 戦争中、米国は英国との交易を中断した。 During the war, Ame'],
        })).toBe('trade, commerce');

        const words = mergeSimilarKanjiWords([
            {
                expression: '容易',
                reading: 'ようい',
                glossary: ['na-adj noun easy simple plain ココの知らせるのは容易ではない。 Testing Koko\'s IQ is not easy. JMdict | Tatoeba'],
                dictionary: 'JMdict',
            },
        ], [], card, name => name);
        expect(words[0]?.meaning).toBe('easy, simple, plain');
    });

    it('groups repeated local dictionary senses by headword for learner scanning', () => {
        const groups = groupTermEntriesByHeadword([
            { expression: '静か', reading: 'しずか', glossary: ['quiet', 'silent'], dictionary: 'JMdict', jpdbFrequency: 1200 },
            { expression: '静か', reading: 'しずか', glossary: ['slow', 'unhurried'], dictionary: 'JMdict', jpdbFrequency: 900 },
            { expression: '静か', reading: 'しずか', glossary: ['quiet', 'silent'], dictionary: 'JMdict' },
            { expression: '閑か', reading: 'しずか', glossary: ['calm', 'peaceful'], dictionary: 'JMdict' },
        ]);

        expect(groups).toHaveLength(2);
        expect(groups[0]).toMatchObject({
            expression: '静か',
            reading: 'しずか',
            meanings: ['quiet, silent', 'slow, unhurried'],
            frequency: 900,
        });
        expect(groups[0]?.entries).toHaveLength(3);
        expect(groups[1]?.meanings).toEqual(['calm, peaceful']);
    });

    it('formats nested frequency metadata without leaking object placeholders', () => {
        expect(formatMetaFrequency({ frequency: { value: 876, displayValue: '876' } })).toBe('#876');
        expect(formatMetaFrequency({ displayValue: { value: 'Top 400' } })).toBe('#Top 400');
    });

    it('sets external dictionary lookup pill defaults for Yomu-first and local-first setup', () => {
        expect(defaultDictionaryLookupLinks('jpdb').map(link => [link.id, link.enabled])).toEqual([
            ['yomu-search', true],
            ['jiten', true],
            ['jiten-frequency', true],
            ['jpdb', true],
            ['jpdb-frequency', true],
            ['bunpro', true],
            ['bunpro-frequency', true],
            ['jisho', false],
            ['weblio', false],
            ['kotobank', false],
            ['takoboto', false],
            ['wiktionary-ja', false],
            ['immersion-kit', false],
            ['nadeshiko', false],
            ['uchisen', false],
            ['copy', false],
        ]);
        expect(defaultDictionaryLookupLinks('local').map(link => [link.id, link.enabled])).toEqual([
            ['yomu-search', true],
            ['jiten', true],
            ['jiten-frequency', true],
            ['jpdb', true],
            ['jpdb-frequency', true],
            ['bunpro', true],
            ['bunpro-frequency', true],
            ['jisho', false],
            ['weblio', false],
            ['kotobank', false],
            ['takoboto', false],
            ['wiktionary-ja', false],
            ['immersion-kit', false],
            ['nadeshiko', false],
            ['uchisen', false],
            ['copy', true],
        ]);
        expect(defaultDictionaryLookupLinks('local').map(link => [link.id, link.label, link.urlTemplate])).toEqual([
            ['yomu-search', 'Yomu', `${NEW_TAB_PAGE_URL}index.html?q={query}`],
            ['jiten', 'Jiten', 'https://jiten.moe/parse?text={query}'],
            ['jiten-frequency', 'Jiten', ''],
            ['jpdb', 'JPDB', 'https://jpdb.io/search?q={query}'],
            ['jpdb-frequency', 'JPDB', ''],
            ['bunpro', 'Bunpro', 'https://bunpro.jp/search?query={query}'],
            ['bunpro-frequency', 'Bunpro', ''],
            ['jisho', 'Jisho', 'https://jisho.org/search/{query}'],
            ['weblio', 'Weblio', 'https://www.weblio.jp/content/{query}'],
            ['kotobank', 'Kotobank', 'https://kotobank.jp/search?q={query}'],
            ['takoboto', 'Takoboto', 'https://takoboto.jp/?q={query}'],
            ['wiktionary-ja', 'Wiktionary', 'https://ja.wiktionary.org/wiki/{query}'],
            ['immersion-kit', 'Immersion Kit', 'https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1'],
            ['nadeshiko', 'Nadeshiko', 'https://nadeshiko.co/search/{query}'],
            ['uchisen', 'Uchisen', 'https://uchisen.com/kanji/{query}'],
            ['copy', 'Copy', ''],
        ]);
        expect(normalizeDictionaryLookupLinks([
            { id: 'takoboto', label: 'Takoboto', urlTemplate: 'https://takoboto.jp/?q={QUERY}', enabled: true },
        ])).toMatchObject([
            // Built-ins keep learner state, but their checked catalogue payload
            // replaces stale or edited provider metadata from storage.
            { id: 'takoboto', label: 'Takoboto', urlTemplate: 'https://takoboto.jp/?q={query}', enabled: true },
            { id: 'yomu-search' },
            { id: 'jiten' },
            { id: 'jiten-frequency' },
            { id: 'jpdb' },
            { id: 'jpdb-frequency' },
            { id: 'bunpro' },
            { id: 'bunpro-frequency' },
            { id: 'jisho' },
            { id: 'weblio' },
            { id: 'kotobank' },
            { id: 'wiktionary-ja' },
            { id: 'immersion-kit' },
            { id: 'nadeshiko' },
            { id: 'uchisen' },
            { id: 'copy' },
        ]);
        expect(normalizeDictionaryLookupLinks([
            { id: 'goo', label: 'goo', urlTemplate: 'https://dictionary.goo.ne.jp/srch/all/{query}/m0u/', enabled: true },
        ]).map(link => link.id)).not.toContain('goo');
    });

    it('enables the JPDB lookup pill for old saved default lookup links', async () => {
        stubSharedReaderSettings({
            dictionaryLookupLinks: [
                { id: 'jpdb', label: 'JPDB', urlTemplate: 'https://jpdb.io/search?q={query}', enabled: false },
                { id: 'jisho', label: 'Jisho', urlTemplate: 'https://jisho.org/search/{query}', enabled: true },
                { id: 'copy', label: 'Copy', urlTemplate: '', enabled: true, action: 'copy' },
            ],
        });

        const settings = await loadSettings();

        expect(settings.dictionaryLookupLinks.map(link => [link.id, link.enabled])).toEqual([
            ['yomu-search', true],
            ['jiten', true],
            ['jiten-frequency', true],
            ['jpdb', true],
            ['jpdb-frequency', true],
            ['bunpro', true],
            ['bunpro-frequency', true],
            ['jisho', false],
            ['weblio', false],
            ['kotobank', false],
            ['takoboto', false],
            ['wiktionary-ja', false],
            ['immersion-kit', false],
            ['nadeshiko', false],
            ['uchisen', false],
            ['copy', true],
        ]);
    });

    it('moves the previous built-in lookup pill order to Yomu first on load', async () => {
        const linksById = new Map(defaultDictionaryLookupLinks('local').map(link => [link.id, link]));
        const previousDefaultOrder = [
            'yomu-search',
            'jiten',
            'jpdb',
            'jisho',
            'weblio',
            'goo',
            'kotobank',
            'takoboto',
            'wiktionary-ja',
            'immersion-kit',
            'uchisen',
            'copy',
        ].map(id => id === 'goo'
            ? { id: 'goo', label: 'goo', urlTemplate: 'https://dictionary.goo.ne.jp/srch/all/{query}/m0u/', enabled: false }
            : { ...linksById.get(id)! });
        previousDefaultOrder[3]!.enabled = true;
        stubSharedReaderSettings({
            dictionaryLookupLinks: previousDefaultOrder,
        });

        const settings = await loadSettings();

        expect(settings.dictionaryLookupLinks.map(link => link.id).slice(0, 5)).toEqual(['yomu-search', 'jiten', 'jiten-frequency', 'jpdb', 'jpdb-frequency']);
        expect(settings.dictionaryLookupLinks.find(link => link.id === 'jisho')?.enabled).toBe(true);
        expect(settings.dictionaryLookupLinks.map(link => link.id)).not.toContain('goo');
    });


    it('keeps the copy lookup pill fixed and URL-free in settings', () => {
        const html = renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local'));
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
        expect(form.querySelector<HTMLInputElement>('[data-lookup-link-row] input[name$=".id"]')?.value).toBe('yomu-search');
        const copyRow = Array.from(form.querySelectorAll<HTMLElement>('[data-lookup-link-row]'))
            .find(row => row.querySelector<HTMLInputElement>('input[name$=".id"]')?.value === 'copy')!;

        expect(copyRow.querySelector('[data-action="lookup-link-remove"]')).toBeNull();
        expect(copyRow.querySelector<HTMLInputElement>('input[name$=".urlTemplate"]')?.type).toBe('hidden');
        expect(readDictionaryLookupLinks(new FormData(form)).find(link => link.id === 'copy')).toMatchObject({
            action: 'copy',
            label: 'Copy',
            urlTemplate: '',
        });

        updateDictionaryLookupLinkEditor(form, 'lookup-link-remove', copyRow);

        expect(Array.from(form.querySelectorAll<HTMLInputElement>('input[name$=".id"]')).map(input => input.value)).toContain('copy');
    });

    it('preserves JPDB definition state without a source row and reads the row checkbox when present', () => {
        const settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false };

        expect(definitionSourceRows(settings).map(row => row.name)).toEqual(expect.arrayContaining(['Jiten', 'JPDB']));
        expect(renderDictionarySourceRows(settings)).toContain('JPDB meanings from the current card.');
        expect(renderDictionarySourceRows(settings)).toContain('Jiten meanings, examples, and related words.');

        const data = new FormData();
        data.set('jpdbDefinitionsEnabled', 'on');
        data.set('dictionaryPreferenceCount', '0');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(false);

        data.set('jpdbDefinitions.name', 'JPDB');
        data.set('jpdbDefinitions.priority', '0');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(false);

        data.set('jpdbDefinitions.enabled', 'on');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(true);

        data.set('jitenDefinitions.name', 'Jiten');
        data.set('jitenDefinitions.priority', '1');
        expect(readFormSettings(data, settings).jitenDefinitionsEnabled).toBe(false);

        data.set('jitenDefinitions.enabled', 'on');
        expect(readFormSettings(data, settings).jitenDefinitionsEnabled).toBe(true);

        data.set('bunproDefinitions.name', 'Bunpro');
        data.set('bunproDefinitions.priority', '2');
        expect(readFormSettings(data, settings).bunproDefinitionsEnabled).toBe(false);

        data.set('bunproDefinitions.enabled', 'on');
        expect(readFormSettings(data, settings).bunproDefinitionsEnabled).toBe(true);
    });

    it('saves disabled JPDB and Bunpro definition rows independently from lookup pills', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        form.querySelector<HTMLInputElement>('input[name="jpdbDefinitions.enabled"]')!.checked = false;
        form.querySelector<HTMLInputElement>('input[name="bunproDefinitions.enabled"]')!.checked = false;

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.jpdbDefinitionsEnabled).toBe(false);
        expect(saved.bunproDefinitionsEnabled).toBe(false);
        expect(saved.dictionaryLookupLinks.find(link => link.id === 'jpdb')?.enabled).toBe(true);
        expect(saved.dictionaryLookupLinks.find(link => link.id === 'bunpro')?.enabled).toBe(true);

        const rerendered = document.createElement('form');
        rerendered.innerHTML = renderSettingsForm(saved, 'https://jpdb.io/settings');
        expect(rerendered.querySelector<HTMLInputElement>('input[name="jpdbDefinitions.enabled"]')?.checked).toBe(false);
        expect(rerendered.querySelector<HTMLInputElement>('input[name="bunproDefinitions.enabled"]')?.checked).toBe(false);
    });

    it('keeps the Immersion Kit media toggle and definition source row tied together', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const mediaToggle = form.querySelector<HTMLInputElement>('input[name="immersionKitEnabled"]');
        const sourceToggle = form.querySelector<HTMLInputElement>('input[name="immersionKit.enabled"]');

        expect(mediaToggle?.checked).toBe(true);
        expect(sourceToggle?.checked).toBe(true);

        sourceToggle!.checked = false;
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).immersionKitEnabled).toBe(false);

        sourceToggle!.checked = true;
        mediaToggle!.checked = false;
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).immersionKitEnabled).toBe(false);

        mediaToggle!.checked = true;
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).immersionKitEnabled).toBe(true);
    });

    it('saves JPDB page enhancement toggles separately from source ordering', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        form.querySelector<HTMLInputElement>('input[name="jpdbPageWordEnhancementsEnabled"]')!.checked = false;

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.jpdbPageEnhancementsEnabled).toBe(true);
        expect(saved.jpdbPageWordEnhancementsEnabled).toBe(false);
        expect(saved.jpdbPageKanjiEnhancementsEnabled).toBe(true);
        expect(saved.jpdbDefinitionsEnabled).toBe(true);
        expect(saved.kanjiImmersionKitEnabled).toBe(true);
    });

    it('extracts JPDB detail alternates and compounds without re-ingesting generated Yomu ruby', () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/vocabulary/1490000/%E3%81%8A%E7%96%B2%E3%82%8C%E6%A7%98/%E3%81%8A%E3%81%A4%E3%81%8B%E3%82%8C%E3%81%95%E3%81%BE',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/vocabulary/1490000/%E3%81%8A%E7%96%B2%E3%82%8C%E6%A7%98/%E3%81%8A%E3%81%A4%E3%81%8B%E3%82%8C%E3%81%95%E3%81%BE',
            search: '',
        });
        document.body.innerHTML = `
            <div class="result vocabulary">
                <div class="subsection-spelling with-furigana">
                    <div class="primary-spelling"><ruby>お<rt></rt>疲<rt>つか</rt>れ様<rt>さま</rt></ruby></div>
                </div>
                <div class="subsection-other-spellings">
                    <h6 class="subsection-label">Alt. forms</h6>
                    <div class="alt-spelling">
                        <a href="/vocabulary/1490001/%E3%81%8A%E3%81%A4%E3%81%8B%E3%82%8C%E3%81%95%E3%81%BE/%E3%81%8A%E3%81%A4%E3%81%8B%E3%82%8C%E3%81%95%E3%81%BE#a">
                            <span class="jpdb-reader-jpdb-term-with-reading">
                                <span class="jpdb-reader-furi" data-jpdb-reader-surface-ignore="true" aria-hidden="true">おつかれさま</span>おつかれさま
                            </span>
                        </a>
                    </div>
                    <div class="alt-spelling">
                        <a href="/vocabulary/1490002/%E5%BE%A1%E7%96%B2%E3%82%8C/%E3%81%8A%E3%81%A4%E3%81%8B%E3%82%8C#a">
                            <ruby>御<rt>お</rt>疲<rt>つか</rt>れ<rt></rt></ruby>
                        </a>
                    </div>
                </div>
                <div class="subsection-composed-of-vocabulary">
                    <h6 class="subsection-label">Composed of</h6>
                    <div class="subsection">
                        <div>
                            <div class="spelling">
                                <a href="/vocabulary/1490003/%E3%81%8A%E7%96%B2%E3%82%8C/%E3%81%8A%E3%81%A4%E3%81%8B%E3%82%8C#a">
                                    <span class="jpdb-reader-jpdb-term-with-reading">
                                        <span class="jpdb-reader-furi" data-jpdb-reader-surface-ignore="true" aria-hidden="true">おつかれ</span>お疲れ
                                    </span>
                                </a>
                            </div>
                            <div class="description">thanks; tiredness; fatigue</div>
                        </div>
                        <div>
                            <div class="spelling">
                                <a href="/vocabulary/1490004/%E7%96%B2%E3%82%8C/%E3%81%A4%E3%81%8B%E3%82%8C#a">
                                    <span class="jpdb-reader-word jpdb-reader-has-furi">
                                        <span class="jpdb-reader-furi" data-jpdb-reader-surface-ignore="true" aria-hidden="true">つか</span><span class="jpdb-reader-ruby-base">疲</span>れ
                                    </span>
                                </a>
                            </div>
                            <div class="description">tired</div>
                        </div>
                    </div>
                </div>
            </div>
            <div data-jpdb-reader-root="true" data-yomu-jpdb-addon="word">
                <a href="/vocabulary/9999999/%E4%BD%99%E8%A8%88/%E3%82%88%E3%81%91%E3%81%84#a">余計</a>
            </div>
        `;

        try {
            const [target] = currentLocalDictionaryTargets();
            expect(target).toMatchObject({
                term: 'お疲れ様',
                reading: 'おつかれさま',
            });
            expect(target?.alternates).toEqual(expect.arrayContaining([
                'おつかれさま',
                '御疲れ',
                'お疲れ',
                'おつかれ',
                '疲れ',
                'つかれ',
            ]));
            expect(target?.alternates).not.toEqual(expect.arrayContaining([
                'おつかれさまおつかれさま',
                'おつかれお疲れ',
                'つか疲れ',
                '余計',
            ]));
            expect(target?.compounds).toEqual(expect.arrayContaining([
                expect.objectContaining({ term: 'お疲れ', reading: 'おつかれ', meaning: 'thanks; tiredness; fatigue' }),
                expect.objectContaining({ term: '疲れ', reading: 'つかれ', meaning: 'tired' }),
            ]));

            const variants = target ? localDictionaryLookupVariants(target) : [];
            expect(variants).toEqual(expect.arrayContaining([
                { term: 'お疲れ様', reading: 'おつかれさま' },
                { term: 'お疲れ', reading: 'おつかれ' },
                { term: '疲れ', reading: 'つかれ' },
            ]));
            expect(variants).not.toEqual(expect.arrayContaining([
                { term: '疲れ', reading: 'おつかれさま' },
            ]));
        } finally {
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('shows editable display names for built-in definition sources', () => {
        document.body.innerHTML = `<form>${renderDictionarySourceRows(DEFAULT_SETTINGS)}</form>`;

        const header = document.querySelector<HTMLElement>('.jpdb-reader-dictionary-head');
        const row = document.querySelector<HTMLElement>('[data-dictionary-source-row]');
        const alias = document.querySelector<HTMLInputElement>('input[name="jitenDefinitions.alias"]');

        expect(header?.textContent).toContain('Display name');
        expect(header?.textContent).not.toContain('Remove');
        expect(header?.classList.contains('compact')).toBe(false);
        expect(header?.classList.contains('no-remove')).toBe(true);
        expect(row?.classList.contains('compact')).toBe(false);
        expect(row?.classList.contains('no-remove')).toBe(true);
        expect(alias?.type).toBe('text');
    });

    it('saves editable dictionary display names without changing dictionary titles', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [{
                name: 'JITINDEX <1-1-2020>',
                alias: 'JITINDEX <1-1-2020>',
                enabled: true,
                priority: 0,
                type: 'terms' as const,
            }],
        };
        document.body.innerHTML = `<form>${renderDictionarySourceRows(settings)}</form>`;
        const form = document.querySelector('form')!;
        const alias = form.querySelector<HTMLInputElement>('input[name="dictionaryPreferences.0.alias"]');

        expect(form.textContent).toContain('Display name');
        expect(form.textContent).toContain('Remove');
        expect(alias?.type).toBe('text');
        alias!.value = 'Jitendex';

        expect(readFormSettings(new FormData(form), settings).dictionaryPreferences[0]).toMatchObject({
            name: 'JITINDEX <1-1-2020>',
            alias: 'Jitendex',
        });
    });

    it('uses editable dictionary display names in definition and compact source UI', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            localDictionaryShowKanji: true,
            dictionaryPreferences: [
                {
                    name: 'JITINDEX <1-1-2020>',
                    alias: 'Jitendex',
                    enabled: true,
                    priority: 0,
                    type: 'terms' as const,
                },
                {
                    name: 'KANJIDIC <raw export>',
                    alias: 'Kanji names',
                    enabled: true,
                    priority: 0,
                    type: 'kanji' as const,
                },
            ],
        };
        const dictionaryLabel = (name: string) => settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
        const html = renderLocalDefinitionSourcesSection(
            ['JITINDEX <1-1-2020>'],
            new Map([['JITINDEX <1-1-2020>', [{
                expression: '読む',
                reading: 'よむ',
                glossary: ['to read'],
                dictionary: 'JITINDEX <1-1-2020>',
            }]]]),
            settings,
            () => 'data-test-source',
            dictionaryLabel,
            card,
        );

        expect(html).toContain('<span>Jitendex</span>');
        expect(html).toContain('data-dictionary="JITINDEX &lt;1-1-2020&gt;"');

        document.body.innerHTML = `<form>${renderKanjiSourceRows(settings)}</form>`;
        const rawName = document.querySelector<HTMLInputElement>('input[name="dictionaryPreferences.1.name"]');
        const alias = document.querySelector<HTMLInputElement>('input[name="dictionaryPreferences.1.alias"]');

        expect(rawName?.value).toBe('KANJIDIC <raw export>');
        expect(alias?.value).toBe('Kanji names');
    });

    it('keeps recommended dictionary downloads as in-reader import buttons', () => {
        const html = renderRecommendedDictionaries([]);
        document.body.innerHTML = `<form>${html}</form>`;
        const dictionary = findRecommendedDictionary('jmdict')!;
        const button = document.querySelector<HTMLButtonElement>('[data-action="download-recommended-dictionary"][data-dictionary-id="jmdict"]');
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-recommended-name a'));

        expect(button?.tagName).toBe('BUTTON');
        expect(button?.getAttribute('href')).toBeNull();
        expect(button?.textContent).toContain('Install');
        expect(links.some(link => link.href === dictionary.downloadUrl)).toBe(false);
    });

    it('includes factory reset, donation, issue, and Discord entries in settings help', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        const resetButton = form.querySelector<HTMLButtonElement>('[data-help-link="factory-reset"]');
        expect(resetButton?.dataset.action).toBe('factory-reset');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="support"]')).toBeNull();
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="issues"]')?.href).toContain('/issues');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="donate"]')?.href).toBe('https://support.yomureader.com/donate');
        expect(form.querySelector<HTMLElement>('[data-help-support-copy]')?.textContent).toContain('free userscript');
        expect(form.querySelector<HTMLElement>('[data-help-support-copy-extra]')?.textContent).toContain('Donations are optional');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="discord"]')?.href).toBe('https://discord.gg/jD6NPURewD');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-help-actions');
        expect(SETTINGS_CSS).toContain('flex-wrap: nowrap');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-help-actions .jpdb-reader-help-donate');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-help-actions .jpdb-reader-help-reset');
    });

});
