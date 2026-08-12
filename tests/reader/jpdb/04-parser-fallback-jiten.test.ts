import { describe, expect, it, vi } from 'vitest';
import { privateRasterImageForHost } from '../../../src/reader/ocr/private-raster-presenter';
import {
    registerReaderHelpersCleanup,
    AudioPlayer,
    DEFAULT_SETTINGS,
    ImageOcrController,
    ReaderApp,
    ReaderParser,
    SETTINGS_STORAGE_KEY,
    ShuffledAudioDeck,
    buildNewTabPalette,
    card,
    collectScanTargets,
    createAudioPreviewCard,
    createFallbackOcrImage,
    createKanjiLocalParserFixture,
    createPointerEvent,
    currentJapaneseLookupScopeMatcher,
    dispatchPointerEvent,
    expectKanjiLocalFallbackAfterTimeout,
    expectSilentPageScan,
    fallbackLookupTermAtOffset,
    findAudioUrl,
    findAudioUrls,
    formatAudioUrl,
    isYomuHostedAppUrl,
    isYomuHostedPassivePage,
    isYomuNewTabUrl,
    jitenTestCard,
    jpdbFirstParseOptions,
    mockAudioBlobUserscriptRequest,
    mockAudioPlaybackEnvironment,
    mockElementBoundingClientRect,
    mockHtmlAudioPlayback,
    mockJpdbVocabularyAudioFetch,
    mockSpeechSynthesis,
    parseSegmentedFallbackTokens,
    resolveAnkiWordAudio,
    resolveNewTabBrandAssets,
    resolveUserscriptBlobResponse,
    setupJpdbWordVoicePlayback,
    stubInstantIntersectionObserver,
    stubLocalHostedReaderLocation,
    stubSharedReaderSettings,
    testDomRect,
    testReaderAppWithPageScanner,
    testTokenForCard,
    tokenSpellings,
    tokensOverlappingSelection,
    waitForExpect,
    withFakeSegmenter,
} from './fixtures';
import type {
    JPDBToken,
    JitenApiClient,
    ReaderSettings,
} from './fixtures';

registerReaderHelpersCleanup();

async function withHostedReaderSettings(assertSettings: (settings: ReaderSettings) => void): Promise<void> {
    const app = new ReaderApp();
    document.body.innerHTML = '<main>Hosted docs</main>';
    vi.stubGlobal('location', new URL('https://hrussellzfac023.github.io/yomu-reader/'));
    try {
        await app.init({ showWelcome: false });
        assertSettings((app as unknown as { settings: ReaderSettings }).settings);
    } finally {
        app.destroy();
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    }
}

describe('reader helpers', () => {
    it('skips local term matching when dictionaries are enabled but no term dictionaries are installed', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([]);
        const hasTermDictionaries = vi.fn().mockResolvedValue(false);
        const tokens = await parseSegmentedFallbackTokens([
            { segment: '日本語', index: 0, isWordLike: true },
            { segment: 'を', index: 3, isWordLike: true },
            { segment: '読む', index: 4, isWordLike: true },
        ], '日本語を読む', {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, hasTermDictionaries } as never,
        });

        expect(tokenSpellings(tokens)).toEqual(['日本語', 'を', '読む']);
        expect(tokens.every(token => token.card.source === 'fallback')).toBe(true);
        expect(hasTermDictionaries).toHaveBeenCalledTimes(1);
        expect(findTermMatches).not.toHaveBeenCalled();
    });

    it('keeps an inflected word whole instead of surfacing a stranded stem match', async () => {
        // The local dictionary knows 分 ("minute") but not 分かる. Confirming
        // the lone 分 would show the wrong word and strand かりません; the
        // whole inflected span stays together and carries the dictionary form
        // the learner actually needs. Adjacent CONFIRMED words are the
        // exception — see the neighbouring test — because there the cut ends
        // where another confirmed word begins.
        const findTermMatches = vi.fn().mockResolvedValue([{
            entry: {
                id: 1,
                sequence: 1,
                expression: '分',
                reading: 'ぶん',
                glossary: ['minute'],
                dictionary: 'Local',
            },
            start: 0,
            end: 1,
            surface: '分',
        }]);
        await withFakeSegmenter([
            { segment: '分', index: 0, isWordLike: true },
            { segment: 'か', index: 1, isWordLike: true },
            { segment: 'り', index: 2, isWordLike: true },
            { segment: 'ま', index: 3, isWordLike: true },
            { segment: 'せん', index: 4, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['分かりません'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['分かりません']);
            expect(tokens[0]).toMatchObject({ start: 0, end: 6 });
            expect(tokens[0]?.card.source).toBe('fallback');
            expect(tokens[0]?.card.fallbackLookupTerms).toContain('分かる');
        }, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches } as never,
        });
    });

    it('keeps adjacent dictionary spans when a broader fallback crosses both', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([
            {
                entry: {
                    id: 1,
                    sequence: 1,
                    expression: '優しい',
                    reading: 'やさしい',
                    rules: 'adj-i',
                    glossary: ['kind'],
                    dictionary: 'Local',
                },
                start: 0,
                end: 3,
                surface: '優しい',
            },
            {
                entry: {
                    id: 2,
                    sequence: 2,
                    expression: '言葉',
                    reading: 'ことば',
                    rules: 'n',
                    glossary: ['word'],
                    dictionary: 'Local',
                },
                start: 3,
                end: 5,
                surface: '言葉',
            },
        ]);
        await withFakeSegmenter([
            { segment: '優しい言葉', index: 0, isWordLike: true },
            { segment: 'を', index: 5, isWordLike: true },
            { segment: 'かけた', index: 6, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['優しい言葉をかけた'], { allowSegmentedFallback: true });

            expect(tokens.slice(0, 2).map(token => ({
                spelling: token.card.spelling,
                source: token.card.source,
                start: token.start,
                end: token.end,
            }))).toEqual([
                { spelling: '優しい', source: 'local', start: 0, end: 3 },
                { spelling: '言葉', source: 'local', start: 3, end: 5 },
            ]);
            expect(tokens.every((token, index) => index === 0 || tokens[index - 1].end <= token.start)).toBe(true);
        }, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches } as never,
        });
    });

    it('times out instead of segmenting text when JPDB stalls without local dictionaries', async () => {
        vi.useFakeTimers();
        try {
            await withFakeSegmenter([
                { segment: '今日', index: 0, isWordLike: true },
                { segment: 'は', index: 2, isWordLike: true },
                { segment: '読む', index: 3, isWordLike: true },
            ], async parser => {
                const parsed = parser.parse(['今日は読む'], { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true });
                const expectation = expect(parsed).rejects.toThrow('JPDB parse timed out.');
                await vi.advanceTimersByTimeAsync(1200);

                await expectation;
            }, {
                getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: false }),
                jpdb: { parse: vi.fn(() => new Promise(() => undefined)) } as never,
                dictionaries: {} as never,
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('filters fallback token-list candidates to the selected text span', () => {
        const sentence = 'よむ Settings 働く';
        const tokens: JPDBToken[] = [
            {
                card: { ...card, spelling: 'よ', reading: 'よ' },
                start: 0,
                end: 1,
                length: 1,
                rubies: [],
                pitchClass: '',
            },
            {
                card: { ...card, spelling: 'よむ', reading: 'よむ' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
            },
        ];

        expect(tokensOverlappingSelection(tokens, '働く', sentence)).toEqual([]);
        expect(tokensOverlappingSelection(tokens, 'よむ', sentence).map(token => token.card.spelling)).toEqual(['よ', 'よむ']);
    });

    it('waits for JPDB by default instead of locking in local compound fallback tokens', async () => {
        vi.useFakeTimers();
        const jpdbTokens: JPDBToken[][] = [[{
            card: { ...card, spelling: '喧嘩', reading: 'けんか', cardState: ['known'] },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'けんか', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '喧嘩した',
        }]];
        const parse = vi.fn(() => new Promise<JPDBToken[][]>(resolve => {
            window.setTimeout(() => resolve(jpdbTokens), 1500);
        }));
        const findTermMatches = vi.fn().mockResolvedValue([]);
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: true }),
            jpdb: { parse } as never,
            dictionaries: { findTermMatches } as never,
        });

        try {
            const parsed = parser.parse(['喧嘩した'], { jpdbTimeoutMs: 1200 });
            await vi.advanceTimersByTimeAsync(1500);

            await expect(parsed).resolves.toBe(jpdbTokens);
            expect(findTermMatches).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('falls back to local parsing when JPDB parsing stalls', async () => {
        vi.useFakeTimers();
        const { parser, findTermMatches } = createKanjiLocalParserFixture({
            settings: { apiKey: 'api-key' },
            jpdb: { parse: vi.fn(() => new Promise(() => undefined)) },
        });

        try {
            await expectKanjiLocalFallbackAfterTimeout(parser, findTermMatches, { allowJpdbTimeoutFallback: true }, 6000);
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses one Jiten reader parse request for the full paragraph batch', async () => {
        const jitenTokens: JPDBToken[][] = [[{
            card: jitenTestCard(),
            start: 2,
            end: 4,
            length: 2,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '本を読む。',
        }], [{
            card: { ...jitenTestCard(), spelling: '見る', reading: 'みる' },
            start: 2,
            end: 4,
            length: 2,
            rubies: [],
            pitchClass: 'atamadaka',
            sentence: '猫を見る。',
        }]];
        const parse = vi.fn(async () => jitenTokens);
        const jpdbParse = vi.fn();
        const findTermMatches = vi.fn();
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: 'jiten-key',
                localDictionariesEnabled: true,
            }),
            jpdb: { parse: jpdbParse } as never,
            jiten: { parse } as unknown as JitenApiClient,
            dictionaries: { findTermMatches } as never,
        });

        await expect(parser.parse(['本を読む。', '猫を見る。'])).resolves.toBe(jitenTokens);
        expect(parse).toHaveBeenCalledTimes(1);
        expect(parse).toHaveBeenCalledWith(['本を読む。', '猫を見る。']);
        expect(jpdbParse).not.toHaveBeenCalled();
        expect(findTermMatches).not.toHaveBeenCalled();
    });

    it('prefers Jiten parsing over JPDB parsing when both API keys are configured', async () => {
        const jitenTokens: JPDBToken[][] = [[{
            card: jitenTestCard(),
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '読む',
        }]];
        const jitenParse = vi.fn(async () => jitenTokens);
        const jpdbParse = vi.fn(async () => [[testTokenForCard(card)]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jitenApiKey: 'jiten-key',
                localDictionariesEnabled: true,
            }),
            jpdb: { parse: jpdbParse } as never,
            jiten: { parse: jitenParse } as unknown as JitenApiClient,
            dictionaries: { findTermMatches: vi.fn() } as never,
        });

        await expect(parser.parse(['読む'])).resolves.toBe(jitenTokens);
        expect(jitenParse).toHaveBeenCalledWith(['読む']);
        expect(jpdbParse).not.toHaveBeenCalled();
    });

    it('falls back to local parsing when Jiten parsing stalls', async () => {
        vi.useFakeTimers();
        const { parser, findTermMatches } = createKanjiLocalParserFixture({
            settings: {
                apiKey: '',
                jitenApiKey: 'jiten-key',
            },
            jiten: { parse: vi.fn(() => new Promise(() => undefined)) },
        });

        try {
            await expectKanjiLocalFallbackAfterTimeout(parser, findTermMatches, { allowApiTimeoutFallback: true, apiTimeoutMs: 800 }, 800);
        } finally {
            vi.useRealTimers();
        }
    });

    it('honors API timeout aliases when remote parsing falls back locally', async () => {
        vi.useFakeTimers();
        const { parser, findTermMatches } = createKanjiLocalParserFixture({
            settings: { apiKey: 'api-key' },
            jpdb: { parse: vi.fn(() => new Promise(() => undefined)) },
        });

        try {
            await expectKanjiLocalFallbackAfterTimeout(parser, findTermMatches, { allowApiTimeoutFallback: true, apiTimeoutMs: 800 }, 800);
        } finally {
            vi.useRealTimers();
        }
    });

    it('treats JPDB-origin cards as JPDB-backed even without an API key', () => {
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '' }),
            jpdb: { getCard: vi.fn(() => undefined) } as never,
            dictionaries: {} as never,
        });

        expect(parser.isJpdbBackedCard({ ...card, source: 'jpdb' })).toBe(true);
        expect(parser.isJpdbBackedCard({ ...card, source: 'local' })).toBe(false);
    });

    it('creates a useful fallback card before JPDB or dictionaries are configured', () => {
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: { getCard: vi.fn(() => undefined) } as never,
            dictionaries: {} as never,
        });

        const card = parser.fallbackCardFromText(' 日本語がある場所ならどこでも ');

        expect(card).toMatchObject({
            spelling: '日本語がある場所ならどこでも',
            reading: '',
            source: 'fallback',
            meanings: [],
            cardState: ['not-in-deck'],
        });
        expect(parser.getCachedCard(card.vid, card.sid)).toBe(card);
        expect(fallbackLookupTermAtOffset('日本語がある場所ならどこでも', 1)).toBe('日本語');
        expect(fallbackLookupTermAtOffset('日本語がある場所ならどこでも', 5)).toBe('ある');
        expect(fallbackLookupTermAtOffset('好きなものを読んで日本語を学ぶ', 5)).toBe('を');
        expect(fallbackLookupTermAtOffset('好きなものを読んで日本語を学ぶ', 6)).toBe('読んで');
        expect(fallbackLookupTermAtOffset('辞書カード', 3)).toBe('カード');
    });

    it('does not return local or segmented fallback tokens from JPDB-first parsing after JPDB fails', async () => {
        const findTermMatches = vi.fn(async () => [{
            entry: {
                expression: '読む',
                reading: 'よむ',
                glossary: ['to read'],
                dictionary: 'Local',
            },
            start: 6,
            end: 9,
            surface: '読んで',
            deinflected: true,
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: true }),
            jpdb: {
                parse: vi.fn(async () => { throw new Error('jpdb down'); }),
                getCard: vi.fn(() => undefined),
            } as never,
            dictionaries: { findTermMatches } as never,
        });

        await expect(parser.parse(['好きなものを読んで日本語を学ぶ'], jpdbFirstParseOptions({ requireJpdb: true })))
            .rejects.toThrow('jpdb down');
        expect(findTermMatches).not.toHaveBeenCalled();
    });

    it('formats Yomitan-compatible audio URLs', () => {
        expect(formatAudioUrl('http://x.test/?term={term}&reading={reading}&language={language}', card))
            .toBe('http://x.test/?term=%E9%A3%9F%E3%81%B9%E3%82%8B&reading=%E3%81%9F%E3%81%B9%E3%82%8B&language=ja');
    });

    it('uses a common kanji and kana pair for built-in audio previews', () => {
        const previewCard = createAudioPreviewCard();

        expect(previewCard).toMatchObject({
            vid: 1456360,
            spelling: '読む',
            reading: 'よむ',
            source: 'jpdb',
        });
        expect(formatAudioUrl('http://x.test/?term={term}&reading={reading}', previewCard))
            .toBe('http://x.test/?term=%E8%AA%AD%E3%82%80&reading=%E3%82%88%E3%82%80');
    });

    it('recognizes the Yomu new tab URL and adjusts accent colors for contrast', () => {
        expect(isYomuNewTabUrl('https://hrussellzfac023.github.io/yomu-reader/newtab/')).toBe(true);
        expect(isYomuNewTabUrl('https://example.com/?yomu-newtab=1')).toBe(false);
        expect(isYomuNewTabUrl('https://example.com/reader')).toBe(false);
        expect(resolveNewTabBrandAssets('https://hrussellzfac023.github.io/yomu-reader/newtab/')).toEqual({
            homeHref: '/yomu-reader/',
            iconSrc: '/yomu-reader/yomu-icon.svg',
        });
        expect(resolveNewTabBrandAssets('http://localhost:5173/newtab/')).toEqual({
            homeHref: '/',
            iconSrc: '/yomu-icon.svg',
        });
        const previousBrowser = (globalThis as typeof globalThis & { browser?: unknown }).browser;
        (globalThis as typeof globalThis & { browser?: unknown }).browser = {
            runtime: { getURL: (path: string) => `moz-extension://yomu-test/${path}` },
        };
        try {
            expect(resolveNewTabBrandAssets('moz-extension://yomu-test/newtab/index.html')).toEqual({
                homeHref: 'moz-extension://yomu-test/newtab/index.html',
                iconSrc: 'moz-extension://yomu-test/newtab/yomu-icon.svg',
            });
        } finally {
            if (previousBrowser === undefined) delete (globalThis as typeof globalThis & { browser?: unknown }).browser;
            else (globalThis as typeof globalThis & { browser?: unknown }).browser = previousBrowser;
        }
        expect(buildNewTabPalette('#ffb6c1').accentText).not.toBe('#ffb6c1');
    });

    it('recognizes hosted Yomu app pages where first-run welcome should stay hidden', () => {
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/')).toBe(true);
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/video-player/')).toBe(true);
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/video-player/index.html')).toBe(true);
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/newtab/index.html')).toBe(true);
        expect(isYomuHostedAppUrl('http://127.0.0.1:5175/yomu-reader/')).toBe(true);
        expect(isYomuHostedAppUrl('http://127.0.0.1:5175/')).toBe(true);
        expect(isYomuHostedPassivePage('http://127.0.0.1:5175/')).toBe(true);
        expect(isYomuHostedPassivePage('https://yomureader.com/ja/learn/reading')).toBe(true);
        expect(isYomuHostedPassivePage('https://yomureader.com/study/')).toBe(false);
        expect(isYomuHostedPassivePage('http://yomureader.localhost:4199/')).toBe(true);
        expect(isYomuHostedPassivePage('http://yomureader.localhost:4199/ja/')).toBe(true);
        expect(isYomuHostedPassivePage('http://yomureader.localhost:4199/learn/reading')).toBe(true);
        expect(isYomuHostedPassivePage('http://yomureader.localhost:4199/study/')).toBe(false);
        expect(isYomuHostedAppUrl('http://other.yomureader.localhost:4199/')).toBe(false);
        expect(isYomuHostedAppUrl('https://example.com/japanese/article')).toBe(false);
    });

    it('keeps image OCR active on local hosted documentation pages', async () => {
        const app = new ReaderApp();
        const lookupText = vi.fn(async () => undefined);
        const internals = app as unknown as {
            lookupText: typeof lookupText;
        };
        internals.lookupText = lookupText;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            lookupOnHover: false,
        }));
        const image = createFallbackOcrImage('日本語');

        const text = document.createElement('p');
        text.textContent = 'よむ';
        document.body.replaceChildren(text, image);

        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });
        stubInstantIntersectionObserver();
        const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

        try {
            expect(isYomuHostedPassivePage(location.href)).toBe(true);

            await app.init({ showWelcome: false });

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-layer')).not.toBeNull();
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe('日本語');
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: () => line,
            });
            dispatchPointerEvent(line, 'pointerover', 120, 'mouse', 40);

            await new Promise(resolve => window.setTimeout(resolve, 20));
            expect(lookupText).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-ocr-line')).toBe(line);
        } finally {
            if (elementFromPointDescriptor) Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
            else delete (document as Partial<Document>).elementFromPoint;
            localStorage.removeItem(SETTINGS_STORAGE_KEY);
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('uses the normal reader path on real hosted documentation pages', async () => {
        const { app, scanVisiblePage } = testReaderAppWithPageScanner('<main class="hosted-text-fixture">日本語を読む</main>');
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });

        try {
            await app.init({ showWelcome: false });

            await waitForExpect(() => {
                expect(scanVisiblePage).toHaveBeenCalledWith({ silent: true });
            });
            expect(document.querySelector('.jpdb-reader-fab')).not.toBeNull();
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('defers reader-page surfaces until document.body exists during early userscript startup', async () => {
        const { app } = testReaderAppWithPageScanner('<main class="hosted-text-fixture">日本語を読む</main>');
        const bodySpy = vi.spyOn(document, 'body', 'get').mockReturnValue(null as unknown as HTMLElement);
        let resolved = false;

        try {
            const initPromise = app.init({ showWelcome: false }).then(() => {
                resolved = true;
            });

            await new Promise(resolve => window.setTimeout(resolve, 20));
            expect(resolved).toBe(false);
            expect(document.querySelector('.jpdb-reader-fab')).toBeNull();

            bodySpy.mockRestore();
            document.dispatchEvent(new Event('DOMContentLoaded'));
            await initPromise;

            expect(resolved).toBe(true);
            expect(document.querySelector('.jpdb-reader-fab')).not.toBeNull();
            expect(document.querySelector('.jpdb-subtitle-player')).not.toBeNull();
        } finally {
            bodySpy.mockRestore();
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('ignores obsolete disabled scan settings on hosted documentation pages', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja',
            autoScanJapanese: false,
            scanVisiblePage: false,
        }));
        const { app, scanVisiblePage } = testReaderAppWithPageScanner('<main><p>好きなものを読んで日本語を学ぶ</p></main>');
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });

        try {
            await app.init({ showWelcome: false });

            await waitForExpect(() => {
                expect(scanVisiblePage).toHaveBeenCalledWith({ silent: true });
            });
            const { settings } = app as unknown as { settings: Record<string, unknown> };
            expect(settings).not.toHaveProperty('autoScanJapanese');
            expect(settings).not.toHaveProperty('scanVisiblePage');
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            localStorage.removeItem(SETTINGS_STORAGE_KEY);
            document.body.replaceChildren();
        }
    });

    it('ignores obsolete disabled scan settings on hosted video-player pages', async () => {
        const rectSpy = mockElementBoundingClientRect();
        stubSharedReaderSettings({
            learningTargetChosen: true,
            interfaceLanguage: 'ja',
            autoScanJapanese: false,
            scanVisiblePage: false,
        });
        const { app, scanVisiblePage } = testReaderAppWithPageScanner(`
            <main data-app>
                <section data-yomu-video-frame>
                    <button class="empty" type="button"><strong>動画を開くかドロップ</strong></button>
                </section>
            </main>
        `);
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/video-player/index.html',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });

        try {
            await app.init({ showWelcome: false });

            await waitForExpect(() => {
                expect(scanVisiblePage).toHaveBeenCalledWith({ silent: true });
            });
            const { settings } = app as unknown as { settings: Record<string, unknown> };
            expect(settings).not.toHaveProperty('autoScanJapanese');
            expect(settings).not.toHaveProperty('scanVisiblePage');
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            rectSpy.mockRestore();
            document.body.replaceChildren();
        }
    });

    it('uses ordinary audio and word color settings on hosted docs', async () => {
        localStorage.clear();
        await withHostedReaderSettings(settings => {
            expect(settings.audioEnabled).toBe(DEFAULT_SETTINGS.audioEnabled);
            expect(settings.autoPlayAudio).toBe(DEFAULT_SETTINGS.autoPlayAudio);
            expect(settings.immersionKitAutoPlayAudio).toBe(DEFAULT_SETTINGS.immersionKitAutoPlayAudio);
            expect(settings.showFurigana).toBe(DEFAULT_SETTINGS.showFurigana);
            expect(settings.furiganaMode).toBe(DEFAULT_SETTINGS.furiganaMode);
            expect(settings.wordHighlightColorSource).toBe(DEFAULT_SETTINGS.wordHighlightColorSource);
            expect(settings.wordUnderlineColorSource).toBe(DEFAULT_SETTINGS.wordUnderlineColorSource);
            expect(settings.wordTextColorSource).toBe(DEFAULT_SETTINGS.wordTextColorSource);
        });
    });

    it('respects persisted disabled audio on hosted docs', async () => {
        stubSharedReaderSettings({
            audioEnabled: false,
            autoPlayAudio: true,
            immersionKitAutoPlayAudio: true,
        });
        await withHostedReaderSettings(settings => {
            expect(settings.audioEnabled).toBe(false);
            expect(settings.autoPlayAudio).toBe(true);
            expect(settings.immersionKitAutoPlayAudio).toBe(true);
        });
    });

    it('scans hosted docs text after VitePress route changes expose it', async () => {
        const { app, scanVisiblePage } = testReaderAppWithPageScanner('<main>Docs feature page</main>');
        stubLocalHostedReaderLocation('/yomu-reader/features/');

        try {
            await app.init({ showWelcome: false });
            expect(scanVisiblePage).not.toHaveBeenCalled();

            document.body.innerHTML = '<main><div class="vp-doc"><div class="hosted-text-fixture" data-yomu-runtime-surface>青空の下で本を読む</div></div></main>';

            await expectSilentPageScan(scanVisiblePage);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not schedule a hosted scan when route changes expose only translated site copy', async () => {
        const { app, scanVisiblePage } = testReaderAppWithPageScanner('<main>Docs feature page</main>');
        stubLocalHostedReaderLocation();

        try {
            await app.init({ showWelcome: false });
            expect(scanVisiblePage).not.toHaveBeenCalled();

            document.body.innerHTML = `
                <main>
                    <section class="VPHero"><h1>好きなものを読んで日本語を学ぶ</h1></section>
                    <section class="VPFeatures"><article>必要なツールをまとめて使えます。</article></section>
                    <div class="vp-doc"><p>文脈で理解しながら読み続けます。</p></div>
                </main>
            `;
            await new Promise(resolve => window.setTimeout(resolve, 50));
            expect(scanVisiblePage).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('scans hosted docs text when VitePress mounts it after reader init', async () => {
        const { app, scanVisiblePage } = testReaderAppWithPageScanner('<main id="app">Loading docs</main>');
        stubLocalHostedReaderLocation();

        try {
            await app.init({ showWelcome: false });
            await new Promise(resolve => window.setTimeout(resolve, 20));
            expect(scanVisiblePage).not.toHaveBeenCalled();

            document.querySelector('main')!.innerHTML = `
                <div class="vp-doc">
                    <div class="hosted-text-fixture" data-yomu-runtime-surface>
                        <h3>青空の下で本を読む</h3>
                        <p>今日は静かな喫茶店で新しい本を読みました。</p>
                    </div>
                </div>
            `;

            await expectSilentPageScan(scanVisiblePage);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('scans Japanese that hydrates after init inside an otherwise shadow-only generic page', async () => {
        stubSharedReaderSettings({
            learningTargetChosen: true,
        });
        const { app, scanVisiblePage } = testReaderAppWithPageScanner('<main>Loading</main><div id="late-shadow"></div>');
        vi.stubGlobal('location', {
            href: 'https://example.com/reader',
            origin: 'https://example.com',
            pathname: '/reader',
            hostname: 'example.com',
        });
        const root = document.querySelector<HTMLElement>('#late-shadow')!.attachShadow({ mode: 'open' });

        try {
            await app.init({ showWelcome: false });
            await new Promise(resolve => window.setTimeout(resolve, 30));
            expect(scanVisiblePage).not.toHaveBeenCalled();

            root.innerHTML = '<button>並べ替え基準</button>';
            await expectSilentPageScan(scanVisiblePage);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not wake a scoped page for Japanese hydrating in docs chrome outside a Reader Surface', async () => {
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        const { app, scanVisiblePage } = testReaderAppWithPageScanner(`
            <main>Loading docs</main>
            <section data-yomu-runtime-surface>Demo loading</section>
            <div id="outside-shadow"></div>
        `);
        vi.stubGlobal('location', {
            href: 'https://example.com/docs',
            origin: 'https://example.com',
            pathname: '/docs',
            hostname: 'example.com',
        });
        const root = document.querySelector<HTMLElement>('#outside-shadow')!.attachShadow({ mode: 'open' });

        try {
            await app.init({ showWelcome: false });
            await new Promise(resolve => window.setTimeout(resolve, 30));
            expect(scanVisiblePage).not.toHaveBeenCalled();

            root.innerHTML = '<nav>はじめる</nav>';
            // Exceed both the generic 450ms mutation delay and the 900ms
            // steady-state throttle so a wrongly scheduled scan cannot pass
            // merely because its timer has not fired yet.
            await new Promise(resolve => window.setTimeout(resolve, 1_100));
            expect(scanVisiblePage).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.documentElement.removeAttribute('data-yomu-annotation-scope');
            document.body.replaceChildren();
        }
    });

    it('scans Japanese hydrating in an open root inside a scoped Reader Surface', async () => {
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        stubSharedReaderSettings({
            learningTargetChosen: true,
        });
        const { app, scanVisiblePage } = testReaderAppWithPageScanner(`
            <main>Loading docs</main>
            <section data-yomu-runtime-surface><div id="surface-shadow"></div></section>
        `);
        vi.stubGlobal('location', {
            href: 'https://example.com/docs',
            origin: 'https://example.com',
            pathname: '/docs',
            hostname: 'example.com',
        });
        const root = document.querySelector<HTMLElement>('#surface-shadow')!.attachShadow({ mode: 'open' });

        try {
            await app.init({ showWelcome: false });
            await new Promise(resolve => window.setTimeout(resolve, 30));
            expect(scanVisiblePage).not.toHaveBeenCalled();

            root.innerHTML = '<button>フィード</button>';
            await expectSilentPageScan(scanVisiblePage);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.documentElement.removeAttribute('data-yomu-annotation-scope');
            document.body.replaceChildren();
        }
    });

    it('ignores obsolete disabled scan settings in English HUD mode', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en',
            autoScanJapanese: false,
            scanVisiblePage: false,
        }));
        const { app, scanVisiblePage } = testReaderAppWithPageScanner(`
            <main>
                <div class="hosted-text-fixture" data-yomu-runtime-surface>
                    <h3>青空の下で本を読む</h3>
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </div>
            </main>
        `);
        stubLocalHostedReaderLocation();

        try {
            await app.init({ showWelcome: false });

            await expectSilentPageScan(scanVisiblePage);
            const { settings } = app as unknown as { settings: Record<string, unknown> };
            expect(settings).not.toHaveProperty('autoScanJapanese');
            expect(settings).not.toHaveProperty('scanVisiblePage');
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            localStorage.removeItem(SETTINGS_STORAGE_KEY);
            document.body.replaceChildren();
        }
    });

    it('keeps collecting hosted docs text until all Japanese surface text is parsed', () => {
        const rectSpy = mockElementBoundingClientRect();
        const hostedBlock = document.createElement('div');
        hostedBlock.setAttribute('data-yomu-runtime-surface', '');
        document.body.innerHTML = '<main><div class="vp-doc"></div></main>';
        document.querySelector('.vp-doc')!.append(hostedBlock);

        try {
            hostedBlock.innerHTML = `
                <h3>青空の下で本を読む</h3>
                <p><span class="jpdb-reader-word">今日</span>は静かな喫茶店で新しい本を読みました。</p>
            `;
            expect(collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/').map(target => target.text))
                .toEqual(expect.arrayContaining(['青空の下で本を読む', 'は静かな喫茶店で新しい本を読みました。']));

            hostedBlock.innerHTML = `
                <h3><span class="jpdb-reader-word">青空</span>の下で本を読む</h3>
                <p><span class="jpdb-reader-word">今日</span>は静かな喫茶店で新しい本を読みました。</p>
            `;
            expect(collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/').map(target => target.text))
                .toEqual(expect.arrayContaining(['の下で本を読む', 'は静かな喫茶店で新しい本を読みました。']));

            hostedBlock.innerHTML = `
                <h3><span class="jpdb-reader-word">青空の下で本を読む</span></h3>
                <p><span class="jpdb-reader-word">今日は静かな喫茶店で新しい本を読みました</span>。</p>
            `;
            expect(collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/')).toEqual([]);
        } finally {
            rectSpy.mockRestore();
            document.body.replaceChildren();
        }
    });

    it('keeps the VitePress hero and docs copy plain while collecting a declared Reader Surface', () => {
        const rectSpy = mockElementBoundingClientRect({ height: 240 });
        document.body.innerHTML = `
            <section class="VPHero has-image">
                <div class="container">
                    <div class="main">
                        <h1 class="heading">よむ 好きなものを読んで日本語を学ぶ</h1>
                        <p class="tagline">どこでも単語をタップし、文脈で理解し、復習用に保存して、そのまま読み続けられます。</p>
                    </div>
                </div>
            </section>
            <div class="vp-doc"><p>今日は静かな喫茶店で新しい本を読みました。</p></div>
            <section data-yomu-runtime-surface><p>青空の下で本を読む。</p></section>
        `;

        try {
            const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/');
            const texts = targets.map(target => target.text);
            expect(texts.some(text => text.includes('好きなものを読んで日本語を学ぶ'))).toBe(false);
            expect(texts.some(text => text.includes('どこでも単語をタップし'))).toBe(false);
            expect(texts).not.toContain('今日は静かな喫茶店で新しい本を読みました。');
            expect(texts).toContain('青空の下で本を読む。');
        } finally {
            rectSpy.mockRestore();
            document.body.replaceChildren();
        }
    });

    it('does not auto-render fallback OCR metadata when OCR auto-scan is off', () => {
        document.body.replaceChildren(createFallbackOcrImage('日本語'));
        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: false,
                ocrShowTextOverlay: true,
                ocrProvider: 'google-lens' as const,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            expect(document.querySelector('.jpdb-ocr-layer')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('skips explicitly ignored OCR images without disabling nearby image OCR', async () => {
        const ignored = createFallbackOcrImage('スクリーンショット');
        ignored.dataset.yomuOcr = 'ignore';
        const readable = createFallbackOcrImage('日本語');
        readable.getBoundingClientRect = () => testDomRect({ left: 20, top: 420, width: 500, height: 300 });
        document.body.replaceChildren(ignored, readable);
        stubInstantIntersectionObserver();
        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: true,
                ocrProvider: 'google-lens' as const,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                const labels = Array.from(document.querySelectorAll('.jpdb-ocr-line'), line => line.getAttribute('aria-label'));
                expect(labels).toEqual(['日本語']);
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('skips YouTube feed thumbnail images while still reading non-thumbnail images', async () => {
        // YouTube feed thumbnails (<img> inside yt-thumbnail-view-model /
        // ytd-rich-item-renderer) are not reading material; auto-scan must never
        // send them to the OCR provider, even though the feed is full of
        // Japanese text. A regular nearby image is still read.
        const tile = document.createElement('ytd-rich-item-renderer');
        const lockup = document.createElement('yt-lockup-view-model');
        const thumbWrap = document.createElement('yt-thumbnail-view-model');
        thumbWrap.append(createFallbackOcrImage('チャンネル登録'));
        lockup.append(thumbWrap);
        tile.append(lockup);
        const readable = createFallbackOcrImage('日本語');
        readable.getBoundingClientRect = () => testDomRect({ left: 20, top: 420, width: 500, height: 300 });
        document.body.replaceChildren(tile, readable);
        stubInstantIntersectionObserver();
        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: true,
                ocrProvider: 'google-lens' as const,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                const labels = Array.from(document.querySelectorAll('.jpdb-ocr-line'), line => line.getAttribute('aria-label'));
                expect(labels).toEqual(['日本語']);
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('opens OCR line taps through the same sticky click lookup path as page words', async () => {
        const app = new ReaderApp();
        const lookupText = vi.fn(async () => undefined);
        const internals = app as unknown as {
            lookupText: typeof lookupText;
        };
        internals.lookupText = lookupText;

        document.body.replaceChildren(createFallbackOcrImage('日本語を読む'));
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });
        stubInstantIntersectionObserver();

        try {
            await app.init({ showWelcome: false });
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe('日本語を読む');
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            lookupText.mockClear();
            line.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 17, button: 0, clientX: 120, clientY: 120 }));
            const tap = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 });
            const clickWasNotCanceled = line.dispatchEvent(tap);

            expect(clickWasNotCanceled).toBe(false);
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(lookupText).not.toHaveBeenCalled();

            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);

            line.querySelector<HTMLElement>('.jpdb-ocr-line-text')!.innerHTML = '<span class="jpdb-reader-word jpdb-not-in-deck" data-vid="10" data-sid="20" data-sentence="日本語を読む" tabindex="-1">日本語</span>を読む';
            const word = line.querySelector<HTMLElement>('.jpdb-reader-word[data-vid]')!;
            lookupText.mockClear();
            word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 130, clientY: 120 }));

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            await waitForExpect(() => expect(lookupText).toHaveBeenCalledWith('日本語', '日本語を読む', expect.objectContaining({
                anchor: word,
                navigation: 'reset',
                trigger: 'modal',
                userGesture: true,
            }), currentJapaneseLookupScopeMatcher()));
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('aligns OCR boxes to the rendered object-fit image pixels', async () => {
        const image = document.createElement('img');
        image.src = '/yomu-reader/screenshots/real-kanji-drilldown.png';
        image.style.cssText = 'width: 541px; height: 371.9375px; object-fit: contain; object-position: center;';
        image.dataset.ocrLines = JSON.stringify([
            { text: '日', box: { left: 50, top: 100, width: 300, height: 100 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 561 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 442 });
        image.getBoundingClientRect = () => new DOMRect(100, 50, 541, 371.9375);
        document.body.replaceChildren(image);

        stubInstantIntersectionObserver();

        const settings = {
            ...DEFAULT_SETTINGS,
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrShowTextOverlay: true,
            ocrProvider: 'google-lens' as const,
            ocrMinImageArea: 1,
            ocrMaxImagesPerPage: 5,
            ocrPrefetchMargin: 0,
        };
        const controller = new ImageOcrController({
            getSettings: () => settings,
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();
            const renderedWidth = 371.9375 * 561 / 442;
            const objectLeft = (541 - renderedWidth) / 2;
            const expectedLeft = objectLeft + renderedWidth * 50 / 561;
            const expectedTop = 371.9375 * 100 / 442;
            const expectedWidth = renderedWidth * 300 / 561;
            const expectedHeight = 371.9375 * 100 / 442;

            await waitForExpect(() => {
                const line = document.querySelector<HTMLElement>('.jpdb-ocr-line');
                expect(line).not.toBeNull();
                expect(Number.parseFloat(line?.style.left || '')).toBeCloseTo(expectedLeft, 1);
                expect(Number.parseFloat(line?.style.width || '')).toBeCloseTo(expectedWidth, 1);
                // The highlight grows around the type that ends up inside it — a single
                // glyph in an 84px-thick box is typeset near 84px and needs more than 84px
                // of frame to hold it with its padding — so what the object-fit mapping
                // pins vertically is where the box's CENTRE lands, not the frame's height.
                const top = Number.parseFloat(line?.style.top || '');
                const height = Number.parseFloat(line?.style.height || '');
                expect(top + height / 2).toBeCloseTo(expectedTop + expectedHeight / 2, 1);
                expect(height).toBeGreaterThanOrEqual(expectedHeight);
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('aligns paused-video OCR boxes to fullscreen contain pixels after parsing is ready', async () => {
        const player = document.createElement('div');
        player.id = 'movie_player';
        const video = document.createElement('video');
        video.style.objectPosition = 'left center';
        Object.defineProperties(video, {
            videoWidth: { configurable: true, value: 1080 },
            videoHeight: { configurable: true, value: 1920 },
        });
        video.getBoundingClientRect = () => testDomRect({ left: 0, top: 0, width: 1920, height: 1080 });
        player.append(video);
        document.body.replaceChildren(player);

        let resolveParse: (tokens: JPDBToken[]) => void = () => undefined;
        let resolveEnrich: () => void = () => undefined;
        const parseJapanese = vi.fn(() => new Promise<JPDBToken[]>(resolve => { resolveParse = resolve; }));
        const enrichTokensBeforeRender = vi.fn(() => new Promise<void>(resolve => { resolveEnrich = resolve; }));
        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrVideoPauseFrames: true,
                ocrShowTextOverlay: true,
                ocrProvider: 'google-lens' as const,
                ocrMinImageArea: 1,
                ocrConcurrency: 1,
            }),
            captureVideoFrame: () => 'data:image/jpeg;base64,ZmFrZQ==',
            parseJapanese,
            enrichTokensBeforeRender,
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();
            video.dispatchEvent(new Event('pause'));

            const frame = privateRasterImageForHost(document.querySelector('.jpdb-ocr-video-frame'))!;
            expect(frame).not.toBeNull();
            expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
            expect(frame.dataset.ocrPending).toBe('true');
            expect(Number.parseFloat(frame.style.left)).toBeCloseTo(0, 1);
            expect(Number.parseFloat(frame.style.width)).toBeCloseTo(607.5, 1);

            Object.defineProperties(frame, {
                naturalWidth: { configurable: true, value: 540 },
                naturalHeight: { configurable: true, value: 960 },
            });
            frame.getBoundingClientRect = () => testDomRect({
                left: Number.parseFloat(frame.style.left),
                top: Number.parseFloat(frame.style.top),
                width: Number.parseFloat(frame.style.width),
                height: Number.parseFloat(frame.style.height),
            });
            frame.dataset.ocrLines = JSON.stringify([
                { text: '一人だった。', box: { left: 0, top: 420, width: 540, height: 80 } },
            ]);
            frame.dispatchEvent(new Event('load'));

            await waitForExpect(() => expect(parseJapanese).toHaveBeenCalledWith('一人だった。', expect.any(Object)));
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);

            resolveParse([]);
            await waitForExpect(() => expect(enrichTokensBeforeRender).toHaveBeenCalled());
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);

            resolveEnrich();
            await waitForExpect(() => {
                const overlay = document.querySelector<HTMLElement>('.jpdb-ocr-layer');
                const line = document.querySelector<HTMLElement>('.jpdb-ocr-line');
                expect(overlay).not.toBeNull();
                expect(line).not.toBeNull();
                expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(false);
                expect(Number.parseFloat(overlay?.style.left || '')).toBeCloseTo(0, 1);
                expect(Number.parseFloat(overlay?.style.width || '')).toBeCloseTo(607.5, 1);
                expect(Number.parseFloat(line?.style.left || '')).toBeCloseTo(0, 1);
                expect(Number.parseFloat(line?.style.width || '')).toBeCloseTo(607.5, 1);
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('extracts nested audio URLs from JSON-ish responses', () => {
        expect(findAudioUrl({ sources: [{ name: 'miss' }, { audio: [{ url: 'http://x.test/audio.mp3' }] }] }))
            .toBe('http://x.test/audio.mp3');
        expect(findAudioUrls({ audioSources: [{ url: 'http://x.test/1.mp3' }, { url: 'http://x.test/2.mp3' }] }))
            .toEqual(['http://x.test/1.mp3', 'http://x.test/2.mp3']);
        expect(findAudioUrls({
            type: 'audioSourceList',
            audioSources: [
                { name: 'TTS (Default - No DB)', url: 'https://audiov2.animecards.site/audio/tts?term=%E7%8C%AB&apiKey=redacted' },
            ],
        })).toEqual(['https://audiov2.animecards.site/audio/tts?term=%E7%8C%AB&apiKey=redacted']);
    });

    it('recognises JapanesePod101 URLs from the hosted audio fallback', () => {
        expect(findAudioUrls({
            type: 'audioSourceList',
            audioSources: [
                { name: 'jpod', url: 'https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E4%BF%9D%E6%9C%89&kana=%E3%81%BB%E3%82%86%E3%81%86' },
            ],
        })).toEqual(['https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E4%BF%9D%E6%9C%89&kana=%E3%81%BB%E3%82%86%E3%81%86']);
    });

    it('extracts audio URLs embedded in fetched text responses', () => {
        expect(findAudioUrls('Audio: https://d1vjc5dkcd3yh2.cloudfront.net/audio/neko.mp3'))
            .toEqual(['https://d1vjc5dkcd3yh2.cloudfront.net/audio/neko.mp3']);
    });

    it('prefers nested Yomitan audio entries over service metadata URLs', () => {
        expect(findAudioUrls({
            url: 'http://x.test/?term=食べる&reading=たべる',
            audioSources: [
                { name: 'NHK', url: 'http://x.test/audio/nhk/taberu.mp3' },
            ],
        })).toEqual(['http://x.test/audio/nhk/taberu.mp3']);
    });

    it('resolves configured word audio to data URLs for Anki media attachments', async () => {
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                details.onload?.({
                    status: 200,
                    response: new Blob(['audio'], { type: 'audio/mpeg' }),
                });
            },
        });

        try {
            const audio = await resolveAnkiWordAudio(card, {
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
                audioEnableDefaultSources: false,
                audioSources: [{ type: 'custom', url: 'https://audio.test/{term}.mp3', voice: '', enabled: true }],
            });

            expect(audio?.dataUrl).toMatch(/^data:audio\/mpeg;base64,/);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not pass non-audio word-source responses through to Anki as remote media', async () => {
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                details.onload?.({
                    status: 200,
                    response: new Blob(['missing'], { type: 'text/html' }),
                });
            },
        });

        try {
            await expect(resolveAnkiWordAudio(card, {
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
                audioEnableDefaultSources: false,
                audioSources: [{ type: 'jpod101', url: '', voice: '', enabled: true }],
            })).resolves.toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('shuffles audio like a deck before repeating clips', () => {
        const deck = new ShuffledAudioDeck(() => 0);
        const ids = ['a', 'b', 'c'];
        const played: string[] = [];

        for (let index = 0; index < ids.length; index++) {
            const next = deck.order('読む', ids)[0];
            played.push(next);
            deck.markPlayed('読む', next);
        }

        expect(new Set(played)).toEqual(new Set(ids));
        const afterReset = deck.order('読む', ids)[0];
        expect(afterReset).not.toBe(played[played.length - 1]);
        const secondCycle = [afterReset];
        deck.markPlayed('読む', afterReset);
        while (secondCycle.length < ids.length) {
            const next = deck.order('読む', ids)[0];
            secondCycle.push(next);
            deck.markPlayed('読む', next);
        }
        expect(new Set(secondCycle)).toEqual(new Set(ids));
    });

    it('consumes skipped shuffled clips without treating them as last played', () => {
        const deck = new ShuffledAudioDeck(() => 0);
        const ids = ['a', 'b', 'c'];
        const first = deck.order('読む', ids)[0];
        deck.markSkipped('読む', first);
        const second = deck.order('読む', ids)[0];
        deck.markPlayed('読む', second);

        expect(first).toBe('b');
        expect(second).toBe('c');
        expect(deck.order('読む', ids)[0]).toBe('a');
    });

    it('avoids repeating the last shuffled clip when candidate order changes', () => {
        const deck = new ShuffledAudioDeck(() => 0.99);
        const first = deck.order('読む', ['a', 'b', 'c'])[0];
        deck.markPlayed('読む', first);

        expect(first).toBe('a');
        expect(deck.order('読む', ['a', 'c', 'b'])[0]).not.toBe(first);
    });

    it('rotates to a different audio source on repeated presses in shuffle mode without reshuffling priority', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        mockAudioBlobUserscriptRequest(details => requested.push(details.url));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/first.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/second.mp3', voice: '', enabled: true },
                ],
            }));

            window.dispatchEvent(new Event('click'));
            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual([]);
            // The configured first source plays first; pressing again rotates to the
            // next source to avoid an immediate repeat — the priority order is never
            // reshuffled, so the first source always leads.
            expect(played).toEqual([
                'http://x.test/first.mp3',
                'http://x.test/second.mp3',
            ]);
        } finally {
            randomSpy.mockRestore();
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('continues to the next source when a media element cannot start playback', async () => {
        const played: string[] = [];
        const rejected: string[] = [];
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            if (this.src.includes('blocked.mp3')) {
                rejected.push(this.src);
                return Promise.reject(new Error('NotAllowedError'));
            }
            played.push(this.src);
            return Promise.resolve();
        });
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/blocked.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/fallback.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(rejected).toEqual(['http://x.test/blocked.mp3']);
            expect(played).toEqual(['http://x.test/fallback.mp3']);
        } finally {
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
        }
    });

    it('does not retry the blocked source when reserved gesture audio falls back', async () => {
        const played: string[] = [];
        const rejected: string[] = [];
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            if (this.src.includes('data:audio/wav')) return Promise.resolve();
            if (this.src.includes('blocked.mp3')) {
                rejected.push(this.src);
                return Promise.reject(new Error('NotAllowedError'));
            }
            played.push(this.src);
            return Promise.resolve();
        });
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/blocked.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/fallback.mp3', voice: '', enabled: true },
                ],
            }));

            expect(player.primeUserGesture()).toBe(true);
            await expect(player.play(card, { userGesture: true })).resolves.toBe(true);

            expect(rejected).toEqual(['http://x.test/blocked.mp3']);
            expect(played).toEqual(['http://x.test/fallback.mp3']);
        } finally {
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
        }
    });

    it('does not duplicate blocked fallback playback after prepared audio preload', async () => {
        const played: string[] = [];
        const rejected: string[] = [];
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            if (this.src.includes('data:audio/wav')) return Promise.resolve();
            if (this.src.includes('blocked.mp3')) {
                rejected.push(this.src);
                return Promise.reject(new Error('NotAllowedError'));
            }
            played.push(this.src);
            return Promise.resolve();
        });
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/blocked.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/fallback.mp3', voice: '', enabled: true },
                ],
            }));

            expect(player.preload(card, { sourceLimit: 1, candidateLimit: 1, prepareAudio: true })).toBe(true);
            await Promise.resolve();
            expect(player.primeUserGesture()).toBe(true);
            await expect(player.play(card, { userGesture: true })).resolves.toBe(true);

            expect(rejected).toEqual(['http://x.test/blocked.mp3']);
            expect(played).toEqual(['http://x.test/fallback.mp3']);
        } finally {
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
        }
    });

    it('reuses a tap-time audio reservation after delayed lookup rendering', async () => {
        const plays: Array<{ element: HTMLMediaElement; loop: boolean; src: string }> = [];
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            plays.push({ element: this, loop: this.loop, src: this.src });
            return Promise.resolve();
        });
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'custom', url: 'http://x.test/tapped-word.mp3', voice: '', enabled: true }],
            }));

            expect(player.primeUserGesture()).toBe(true);
            await Promise.resolve();
            await expect(player.play(card, { userGesture: true })).resolves.toBe(true);

            expect(plays).toHaveLength(2);
            expect(plays[0]?.loop).toBe(true);
            expect(plays[0]?.src).toContain('data:audio/wav;base64,');
            expect(plays[1]?.element).toBe(plays[0]?.element);
            expect(plays[1]?.loop).toBe(false);
            expect(plays[1]?.src).toBe('http://x.test/tapped-word.mp3');
        } finally {
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
        }
    });

    it('pauses active single-source audio before reserving a replay gesture', async () => {
        const events: string[] = [];
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            events.push(`play:${this.src}`);
            return Promise.resolve();
        });
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause(this: HTMLMediaElement) {
            events.push(`pause:${this.src}`);
        });
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'custom', url: 'http://x.test/single-source.mp3', voice: '', enabled: true }],
            }));

            await expect(player.play(card, { userGesture: true })).resolves.toBe(true);
            await expect(player.play(card, { userGesture: true })).resolves.toBe(true);

            const audiblePlay = 'play:http://x.test/single-source.mp3';
            const audiblePause = 'pause:http://x.test/single-source.mp3';
            const firstAudiblePlay = events.indexOf(audiblePlay);
            const secondGestureReservation = events.findIndex((event, index) =>
                index > firstAudiblePlay && event.startsWith('play:data:audio/wav;base64,')
            );
            const pauseBeforeReplay = events.lastIndexOf(audiblePause, secondGestureReservation);

            expect(firstAudiblePlay).toBeGreaterThan(-1);
            expect(secondGestureReservation).toBeGreaterThan(firstAudiblePlay);
            expect(pauseBeforeReplay).toBeGreaterThan(firstAudiblePlay);
            expect(pauseBeforeReplay).toBeLessThan(secondGestureReservation);
            expect(events.filter(event => event === audiblePlay)).toHaveLength(2);
        } finally {
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
        }
    });

    it('honors the configured source order in shuffle mode even when a later source prepares faster', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0,
            objectUrl: blob => blob.size === 31
                ? 'blob:http://localhost/slow-source-audio'
                : 'blob:http://localhost/fast-source-audio',
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                const slow = details.url.includes('slow');
                const response = new Blob([new Uint8Array(slow ? 31 : 17)], { type: 'audio/mpeg' });
                window.setTimeout(() => details.onload?.({ status: 200, response }), slow ? 500 : 0);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioTtsMode: 'fallback',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioTimeoutMs: 2000,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/slow.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/fast.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            // Shuffle mode varies clips within a source, never the source priority:
            // the first configured source wins even though the later one is faster.
            expect(requested).toEqual(['http://x.test/slow.mp3']);
            expect(played).toEqual(['blob:http://localhost/slow-source-audio']);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('preloads the first configured audio source so the hover play is already warm', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0,
            objectUrl: 'blob:http://localhost/first-preload-source',
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
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
                    { type: 'custom', url: 'http://x.test/first.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/second.mp3', voice: '', enabled: true },
                ],
            }));

            // Preload warms exactly the source the subsequent play will use (the first
            // configured one), so the hover-triggered play reuses the cached blob.
            player.preload(card, { sourceLimit: 1, candidateLimit: 1, prepareAudio: true });
            await waitForExpect(() => expect(requested).toEqual(['http://x.test/first.mp3']));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual(['http://x.test/first.mp3']);
            expect(played).toEqual(['blob:http://localhost/first-preload-source']);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('replays prepared recorded audio instead of falling through to TTS', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const restoreAudio = mockHtmlAudioPlayback(played);
        mockSpeechSynthesis(spoken, [
            { name: 'Kyoko', lang: 'ja-JP', default: true },
            { name: 'Otoya', lang: 'ja-JP', default: false },
        ] as SpeechSynthesisVoice[]);
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            audioEnableDefaultSources: false,
            audioSelectionMode: 'first',
            audioViaBlob: false,
            audioFallbackChimeEnabled: false,
            audioSources: [
                { type: 'custom', url: 'http://x.test/repeated.mp3', voice: '', enabled: true },
                { type: 'custom', url: 'http://x.test/unused.mp3', voice: '', enabled: true },
            ],
        };

        try {
            const player = new AudioPlayer(() => settings);

            await expect(player.play(card)).resolves.toBe(true);
            settings = {
                ...settings,
                audioSelectionMode: 'random',
                audioSources: [
                    { type: 'custom', url: 'http://x.test/repeated.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            };
            await expect(player.play(card)).resolves.toBe(true);

            expect(played).toEqual([
                'http://x.test/repeated.mp3',
                'http://x.test/repeated.mp3',
            ]);
            expect(spoken).toEqual([]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('keeps JPDB word audio as a fallback when shuffled recorded audio is available', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0,
            objectUrl: blob => blob.type.includes('ogg')
                ? 'blob:http://localhost/jpdb-word-audio'
                : 'blob:http://localhost/recorded-word-audio',
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
            },
        });
        mockJpdbVocabularyAudioFetch(requested, `
            <link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる">
            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/jpdb-first"></a>
        `);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/recorded.mp3', voice: '', enabled: true },
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual(['http://x.test/recorded.mp3']);
            expect(played).toEqual(['blob:http://localhost/recorded-word-audio']);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('randomizes JPDB word voice candidates even when audio source order is fixed', async () => {
        const { played, requested, restoreAudio, player } = setupJpdbWordVoicePlayback({
            dataAudio: 'm1/voice-a,m1/voice-b',
            randomValue: 0,
            objectUrl: 'blob:http://localhost/jpdb-random-word-audio',
        });

        try {
            window.dispatchEvent(new Event('click'));
            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            const jpdbAudioRequests = requested.filter(target => target.includes('/vocabulary/1/') || target.includes('/static/v/m1/'));
            expect(jpdbAudioRequests).toEqual([
                'https://jpdb.io/vocabulary/1/%E9%A3%9F%E3%81%B9%E3%82%8B/%E3%81%9F%E3%81%B9%E3%82%8B',
                'https://jpdb.io/static/v/m1/voice-b',
                'https://jpdb.io/static/v/m1/voice-a',
            ]);
            expect(played).toEqual([
                'blob:http://localhost/jpdb-random-word-audio',
                'blob:http://localhost/jpdb-random-word-audio',
            ]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('does not invent JPDB word voice candidates for a single rendered audio id', async () => {
        const { played, requested, restoreAudio, player } = setupJpdbWordVoicePlayback({
            dataAudio: 'm1/only-one',
            randomValue: 0.99,
            objectUrl: 'blob:http://localhost/jpdb-single-word-voice',
        });

        try {
            window.dispatchEvent(new Event('click'));
            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(requested[0]).toBe('https://jpdb.io/vocabulary/1/%E9%A3%9F%E3%81%B9%E3%82%8B/%E3%81%9F%E3%81%B9%E3%82%8B');
            expect(requested.filter(url => url.includes('/static/v/'))).toEqual([
                'https://jpdb.io/static/v/m1/only-one',
            ]);
            expect(played).toEqual([
                'blob:http://localhost/jpdb-single-word-voice',
                'blob:http://localhost/jpdb-single-word-voice',
            ]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

});
