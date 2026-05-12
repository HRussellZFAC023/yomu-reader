import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { AnkiConnectClient, buildYomuAnkiFields, YOMU_MODEL_FIELDS } from '../../src/reader/anki';
import { AudioPlayer, findAudioUrl, findAudioUrls, formatAudioUrl, isUnavailableJapanesePod101Audio, ShuffledAudioDeck } from '../../src/reader/audio';
import { positionPopover } from '../../src/reader/browser-ui';
import { deinflectJapaneseTerm, termRulesMatch } from '../../src/reader/deinflect';
import { applyTokensToScanTarget, applyTokensToTextNode, collectFragmentTextTargetsIn, collectTextTargetsIn, readerWordSurfaceText, renderTokensToHtml, unwrapReaderWords } from '../../src/reader/dom';
import { ImmersionKitClient } from '../../src/reader/immersion-kit';
import { splitJapaneseSentences } from '../../src/reader/jpdb';
import { jpdbVocabularyToCards } from '../../src/reader/jpdb-parser';
import { JpdbExtensionsController, parseJpdbReviewCardValue, parseUchisenImages } from '../../src/reader/jpdb-extensions';
import { parseJpdbKanjiHtml } from '../../src/reader/jpdb-kanji';
import { parseJpdbPublicPitchHtml } from '../../src/reader/jpdb-public-pitch';
import { buildKanjiFacts, buildKanjiOriginGraph, parseKanjiMapInfo, parseWiktionaryInfo } from '../../src/reader/kanji-origin';
import { parseKanjiVGSvg } from '../../src/reader/kanjivg';
import { Logger } from '../../src/reader/logger';
import { buildNewTabPalette, isYomuNewTabUrl } from '../../src/reader/new-tab';
import { ObjectUrlCache } from '../../src/reader/object-url-cache';
import { normalizeOcrResult, readFallbackOcrResult } from '../../src/reader/ocr';
import { formatPartOfSpeech } from '../../src/reader/pos';
import { formatMetaFrequency, groupTermEntriesByHeadword, mergeSimilarKanjiWords, renderKanjiOrigins, renderPitch, summarizeLearnerGlossary } from '../../src/reader/popup-render';
import { RECOMMENDED_JAPANESE_DICTIONARIES, STARTER_DICTIONARY_IDS, findRecommendedDictionary } from '../../src/reader/recommended-dictionaries';
import { ReaderApp } from '../../src/reader/main';
import { ReaderParser, fallbackLookupTermAtOffset } from '../../src/reader/reader-parser';
import { DEFAULT_AUDIO_SOURCES, DEFAULT_SETTINGS, applyUrlBootstrapSettings, defaultDictionaryLookupLinks, effectiveFuriganaMode, effectiveWordHighlightMode, loadSettings, matchesShortcut, normalizeAudioSources, normalizeDictionaryLookupLinks, normalizeOcrProvider, sanitizeAccentColor } from '../../src/reader/settings';
import { readFormSettings, renderDictionarySourceRows } from '../../src/reader/settings-form';
import { SITE_PARSER_PROFILES, collectScanTargets, collectSiteScanTargets, getMatchingSiteParsers } from '../../src/reader/site-parsers';
import { definitionSourceRows } from '../../src/reader/source-sections';
import { detectGrammarHints } from '../../src/reader/study-tools';
import { READER_CSS } from '../../src/reader/styles';
import { parseSubtitleText, readPageCaptionText } from '../../src/reader/subtitles';
import { collectYouTubeVideoCards, isProbablyJapaneseYouTubeText, readYouTubeCardText, readYouTubeCardVideoId } from '../../src/reader/youtube';
import { YomitanDictionaryStore, glossaryToHtml, glossaryToText, parseYomitanSettingsExport, renderDictionaryScopedStyles } from '../../src/reader/yomitan';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

const card: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '食べる',
    reading: 'たべる',
    frequencyRank: 100,
    partOfSpeech: ['v1'],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: ['LHH'],
    wordWithReading: null,
};

async function waitForExpect(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < timeoutMs) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    if (lastError) throw lastError;
    await assertion();
}

function withPointerTextLookupMock<T>(
    node: Text,
    offset: number,
    rects: Array<{ left: number; top: number; width: number; height: number }>
        | ((start: number, end: number) => Array<{ left: number; top: number; width: number; height: number }>),
    callback: () => T,
): T {
    const caretDescriptor = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
    const rangeDescriptor = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint');
    const originalCreateRange = document.createRange.bind(document);
    const createRangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => {
        const range = originalCreateRange();
        let rangeStart = 0;
        let rangeEnd = 0;
        const originalSetStart = range.setStart.bind(range);
        const originalSetEnd = range.setEnd.bind(range);
        range.setStart = (startNode, startOffset) => {
            rangeStart = startOffset;
            originalSetStart(startNode, startOffset);
        };
        range.setEnd = (endNode, endOffset) => {
            rangeEnd = endOffset;
            originalSetEnd(endNode, endOffset);
        };
        range.getClientRects = () => domRectList(typeof rects === 'function' ? rects(rangeStart, rangeEnd) : rects);
        return range;
    });

    Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: vi.fn(() => ({ offsetNode: node, offset })),
    });
    Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: undefined,
    });

    try {
        return callback();
    } finally {
        createRangeSpy.mockRestore();
        if (caretDescriptor) Object.defineProperty(document, 'caretPositionFromPoint', caretDescriptor);
        else delete (document as unknown as Record<string, unknown>).caretPositionFromPoint;
        if (rangeDescriptor) Object.defineProperty(document, 'caretRangeFromPoint', rangeDescriptor);
        else delete (document as unknown as Record<string, unknown>).caretRangeFromPoint;
    }
}

function domRectList(rects: Array<{ left: number; top: number; width: number; height: number }>): DOMRectList {
    const items = rects.map(rect => ({
        x: rect.left,
        y: rect.top,
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height,
        toJSON: () => ({}),
    })) as DOMRect[];
    return Object.assign(items, { item: (index: number) => items[index] ?? null }) as unknown as DOMRectList;
}

function lookupCandidateFromPoint(app: ReaderApp, x: number, y: number, target: Element): unknown {
    return (app as unknown as {
        lookupCandidateFromPoint: (x: number, y: number, eventTarget: EventTarget | null) => unknown;
    }).lookupCandidateFromPoint(x, y, target);
}

function withViewport<T>(width: number, height: number, callback: () => T): T {
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: { offsetLeft: 0, offsetTop: 0, width, height, scale: 1 },
    });
    try {
        return callback();
    } finally {
        if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor);
        else delete (window as unknown as Record<string, unknown>).innerWidth;
        if (heightDescriptor) Object.defineProperty(window, 'innerHeight', heightDescriptor);
        else delete (window as unknown as Record<string, unknown>).innerHeight;
        if (viewportDescriptor) Object.defineProperty(window, 'visualViewport', viewportDescriptor);
        else delete (window as unknown as Record<string, unknown>).visualViewport;
    }
}

function sizedPopover(width: number, height: number): HTMLElement {
    const popover = document.createElement('div');
    Object.defineProperty(popover, 'offsetWidth', { configurable: true, value: width });
    Object.defineProperty(popover, 'offsetHeight', { configurable: true, value: height });
    document.body.append(popover);
    return popover;
}

function mockHtmlAudioPlayback(played: string[]): () => void {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
        played.push(this.src);
        return Promise.resolve();
    });
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    return () => {
        playSpy.mockRestore();
        pauseSpy.mockRestore();
        loadSpy.mockRestore();
    };
}

function mockAppleMobileBrowser(): () => void {
    const ownUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    const ownPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
    Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    });
    Object.defineProperty(navigator, 'platform', {
        configurable: true,
        value: 'iPad',
    });
    return () => {
        if (ownUserAgent) Object.defineProperty(navigator, 'userAgent', ownUserAgent);
        else delete (navigator as unknown as Record<string, unknown>).userAgent;
        if (ownPlatform) Object.defineProperty(navigator, 'platform', ownPlatform);
        else delete (navigator as unknown as Record<string, unknown>).platform;
    };
}

describe('reader helpers', () => {
    it('normalizes JPDB card states before using them for reader word classes', () => {
        const [neverForget, fallback] = jpdbVocabularyToCards([
            [1, 2, 3, '読む', 'よむ', 100, [], [], [], ['never_forget'], []],
            [4, 5, 6, '未知語', 'みちご', null, [], [], [], ['mystery-state'], []],
        ]);

        expect(neverForget.cardState).toEqual(['never-forget']);
        expect(fallback.cardState).toEqual(['not-in-deck']);

        const html = renderTokensToHtml('読む', [{
            card: { ...card, cardState: ['never_forget'] as unknown as JPDBCard['cardState'], spelling: '読む', reading: 'よむ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '読む',
        }], DEFAULT_SETTINGS);

        expect(html).toContain('jpdb-reader-word jpdb-never-forget');
    });

    it('marks reader word visual styling as important so page CSS resets cannot hide clickable words', () => {
        expect(READER_CSS).toMatch(/\.jpdb-reader-word\s*\{[^}]*text-decoration-line:\s*underline\s*!important;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word\s*\{[^}]*text-decoration-color:\s*var\(--jpdb-reader-word-underline,\s*transparent\)\s*!important;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word\s*\{[^}]*display:\s*inline;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word::after\s*\{[^}]*content:\s*none;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word\.jpdb-reader-has-furi\s*\{[^}]*line-height:\s*1\.85;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word ruby\s*\{[^}]*display:\s*ruby;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word rt\.jpdb-reader-furi\s*\{[^}]*display:\s*ruby-text;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word ruby\s*\{[^}]*text-decoration-line:\s*inherit\s*!important;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word ruby\s*\{[^}]*text-decoration-color:\s*inherit\s*!important;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word\.jpdb-new,[\s\S]*?background:\s*var\(--jpdb-reader-state-new-soft,[^;]+!important;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-word\.jpdb-known,[\s\S]*?--jpdb-reader-word-underline:\s*var\(--jpdb-reader-state-known,[^;]+;/);
        expect(READER_CSS).toMatch(/\.jpdb-reader-highlight-pitch \.jpdb-reader-word\.jpdb-pitch-heiban[\s\S]*?--jpdb-reader-word-underline:\s*#359eff;/);
        expect(READER_CSS).toMatch(/\.jpdb-ocr-line \.jpdb-reader-word\s*\{[^}]*text-decoration:\s*none\s*!important;/);
    });

    it('defaults word highlight colors to pitch when mining status is not configured', () => {
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, jpdbMiningEnabled: false })).toBe('pitch');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, apiKey: 'key', ankiEnabled: false, jpdbMiningEnabled: true })).toBe('status');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, apiKey: 'key', ankiEnabled: false, jpdbMiningEnabled: false })).toBe('pitch');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, wordHighlightMode: 'status', apiKey: '', ankiEnabled: false, jpdbMiningEnabled: false })).toBe('status');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, wordHighlightMode: 'off' })).toBe('off');

        const html = renderTokensToHtml('読む', [{
            card,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '読む',
        }], { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, jpdbMiningEnabled: false });

        expect(html).toContain('jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban');
        expect(READER_CSS).toMatch(/\.jpdb-reader-highlight-off \.jpdb-reader-word,[\s\S]*?text-decoration-color:\s*transparent\s*!important;/);
    });

    it('defaults furigana to difficult kanji without personalization and known-status with JPDB or Anki data', () => {
        expect(effectiveFuriganaMode({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode: 'auto' })).toBe('difficult-kanji');
        expect(effectiveFuriganaMode({ ...DEFAULT_SETTINGS, apiKey: 'key', ankiEnabled: false, jpdbMiningEnabled: false, furiganaMode: 'auto' })).toBe('known-status');
        expect(effectiveFuriganaMode({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true, furiganaMode: 'auto' })).toBe('known-status');
        expect(effectiveFuriganaMode({ ...DEFAULT_SETTINGS, furiganaMode: 'off' })).toBe('off');
    });

    it('can hide furigana for easy kanji while still showing it for difficult kanji', () => {
        const easyToken: JPDBToken = {
            card: { ...card, spelling: '日本', reading: 'にほん' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'にほん', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '日本',
        };
        const difficultToken: JPDBToken = {
            card: { ...card, spelling: '鬱', reading: 'うつ' },
            start: 0,
            end: 1,
            length: 1,
            rubies: [{ text: 'うつ', start: 0, end: 1, length: 1 }],
            pitchClass: '',
            sentence: '鬱',
        };

        expect(renderTokensToHtml('日本', [easyToken], { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode: 'auto' }))
            .not.toContain('<rt');
        expect(renderTokensToHtml('鬱', [difficultToken], { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode: 'auto' }))
            .toContain('<rt class="jpdb-reader-furi">うつ</rt>');
        expect(renderTokensToHtml('鬱', [difficultToken], { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode: 'auto' }))
            .toContain('jpdb-reader-has-furi');
        expect(renderTokensToHtml('日本', [easyToken], { ...DEFAULT_SETTINGS, furiganaMode: 'all' }))
            .toContain('<rt class="jpdb-reader-furi">にほん</rt>');
        expect(renderTokensToHtml('鬱', [difficultToken], { ...DEFAULT_SETTINGS, furiganaMode: 'off' }))
            .not.toContain('<rt');
    });

    it('emits furigana from local dictionary fallback without a JPDB API key', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([{
            entry: {
                expression: '漢字',
                reading: 'かんじ',
                glossary: ['Chinese characters'],
                dictionary: 'JMdict',
            },
            start: 0,
            end: 2,
            surface: '漢字',
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true, furiganaMode: 'all' }),
            jpdb: {} as never,
            dictionaries: { findTermMatches } as never,
        });

        const [tokens] = await parser.parse(['漢字を書く']);

        expect(findTermMatches).toHaveBeenCalledWith('漢字を書く', expect.any(Number), DEFAULT_SETTINGS.dictionaryPreferences);
        expect(tokens[0].rubies).toEqual([{ text: 'かんじ', start: 0, end: 2, length: 2 }]);
        expect(renderTokensToHtml('漢字を書く', tokens, { ...DEFAULT_SETTINGS, furiganaMode: 'all' }))
            .toContain('<rt class="jpdb-reader-furi">かんじ</rt>');
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
            reading: '日本語がある場所ならどこでも',
            source: 'fallback',
            meanings: [],
            cardState: ['not-in-deck'],
        });
        expect(parser.getCachedCard(card.vid, card.sid)).toBe(card);
        expect(fallbackLookupTermAtOffset('日本語がある場所ならどこでも', 1)).toBe('日本語');
        expect(fallbackLookupTermAtOffset('日本語がある場所ならどこでも', 5)).toBe('がある');
        expect(fallbackLookupTermAtOffset('辞書カード', 3)).toBe('カード');
    });

    it('formats Yomitan-compatible audio URLs', () => {
        expect(formatAudioUrl('http://x.test/?term={term}&reading={reading}&language={language}', card))
            .toBe('http://x.test/?term=%E9%A3%9F%E3%81%B9%E3%82%8B&reading=%E3%81%9F%E3%81%B9%E3%82%8B&language=ja');
    });

    it('recognizes the Yomu new tab URL and adjusts accent colors for contrast', () => {
        expect(isYomuNewTabUrl('https://hrussellzfac023.github.io/yomu-reader/newtab/')).toBe(true);
        expect(isYomuNewTabUrl('https://example.com/?yomu-newtab=1')).toBe(true);
        expect(isYomuNewTabUrl('https://example.com/reader')).toBe(false);
        expect(buildNewTabPalette('#ffb6c1').accentText).not.toBe('#ffb6c1');
    });

    it('extracts nested audio URLs from JSON-ish responses', () => {
        expect(findAudioUrl({ sources: [{ name: 'miss' }, { audio: [{ url: 'http://x.test/audio.mp3' }] }] }))
            .toBe('http://x.test/audio.mp3');
        expect(findAudioUrls({ audioSources: [{ url: 'http://x.test/1.mp3' }, { url: 'http://x.test/2.mp3' }] }))
            .toEqual(['http://x.test/1.mp3', 'http://x.test/2.mp3']);
    });

    it('prefers nested Yomitan audio entries over service metadata URLs', () => {
        expect(findAudioUrls({
            url: 'http://x.test/?term=食べる&reading=たべる',
            audioSources: [
                { name: 'NHK', url: 'http://x.test/audio/nhk/taberu.mp3' },
            ],
        })).toEqual(['http://x.test/audio/nhk/taberu.mp3']);
    });

    it('plays random audio like a shuffled deck before repeating clips', () => {
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

    it('keeps text-to-speech enabled in the default audio fallbacks', () => {
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'text-to-speech', url: '', voice: '', enabled: true });
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'text-to-speech', url: '', voice: '', enabled: true });
        expect(DEFAULT_SETTINGS.audioFallbackChimeEnabled).toBe(true);
    });

    it('uses the configured popover height by default', () => {
        expect(DEFAULT_SETTINGS.popoverHeightMode).toBe('fixed');
    });

    it('normalizes invalid persisted popup presentation settings', async () => {
        const storageKey = 'jpdb-popup-reader-settings';
        const previous = localStorage.getItem(storageKey);
        localStorage.setItem(storageKey, JSON.stringify({
            ...DEFAULT_SETTINGS,
            theme: 'neon',
            popupMode: 'toast',
            popoverWidth: 42,
            popoverHeight: 1200,
            popoverHeightMode: 'giant',
        }));

        try {
            const settings = await loadSettings();

            expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
            expect(settings.popupMode).toBe(DEFAULT_SETTINGS.popupMode);
            expect(settings.popoverWidth).toBe(280);
            expect(settings.popoverHeight).toBe(900);
            expect(settings.popoverHeightMode).toBe(DEFAULT_SETTINGS.popoverHeightMode);
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
            interfaceLanguage: 'ja' as const,
        };
        const data = new FormData();
        data.set('theme', 'neon');
        data.set('popupMode', 'toast');
        data.set('popoverHeightMode', 'giant');
        data.set('audioSelectionMode', 'shuffle');
        data.set('interfaceLanguage', 'pirate');
        data.set('popoverWidth', '1200');
        data.set('popoverHeight', '12');

        const settings = readFormSettings(data, current);

        expect(settings.theme).toBe('dark');
        expect(settings.popupMode).toBe('popover');
        expect(settings.popoverHeightMode).toBe('fixed');
        expect(settings.audioSelectionMode).toBe('random');
        expect(settings.interfaceLanguage).toBe('ja');
        expect(settings.popoverWidth).toBe(900);
        expect(settings.popoverHeight).toBe(220);
    });

    it('reads arbitrary Japanese sentence text aloud with browser TTS', async () => {
        const spoken: string[] = [];
        class FakeSpeechSynthesisUtterance {
            lang = '';
            voice: SpeechSynthesisVoice | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;

            constructor(public text: string) {}
        }
        vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(),
            getVoices: vi.fn(() => []),
            speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
                spoken.push(utterance.text);
                utterance.onend?.();
            }),
        });

        try {
            const player = new AudioPlayer(() => DEFAULT_SETTINGS);
            await player.playJapaneseText(' 警察が来た！ ');

            expect(spoken).toEqual(['警察が来た！']);
        } finally {
            vi.unstubAllGlobals();
        }
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

    it('sets external dictionary lookup pill defaults for JPDB-first and local-first setup', () => {
        expect(defaultDictionaryLookupLinks('jpdb').map(link => [link.id, link.enabled])).toEqual([
            ['jpdb', true],
            ['jisho', false],
            ['copy', false],
        ]);
        expect(defaultDictionaryLookupLinks('local').map(link => [link.id, link.enabled])).toEqual([
            ['jpdb', false],
            ['jisho', true],
            ['copy', true],
        ]);
        expect(normalizeDictionaryLookupLinks([
            { id: 'takoboto', label: 'Takoboto', urlTemplate: 'https://takoboto.jp/?q={QUERY}', enabled: true },
        ])).toMatchObject([
            { id: 'takoboto', label: 'Takoboto', urlTemplate: 'https://takoboto.jp/?q={QUERY}', enabled: true },
            { id: 'jpdb' },
            { id: 'jisho' },
            { id: 'copy' },
        ]);
    });

    it('hides the JPDB definition source row when JPDB definitions are disabled', () => {
        const settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false };

        expect(definitionSourceRows(settings).map(row => row.name)).not.toContain('JPDB');
        expect(renderDictionarySourceRows(settings)).not.toContain('Built-in JPDB meanings from the parsed card.');

        const data = new FormData();
        data.set('jpdbDefinitionsEnabled', 'on');
        data.set('dictionaryPreferenceCount', '0');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(true);

        data.set('jpdbDefinitions.name', 'JPDB');
        data.set('jpdbDefinitions.priority', '0');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(false);
    });

    it('adds local dictionaries and Immersion Kit to JPDB romaji search results', async () => {
        window.history.replaceState(null, '', '/search?q=HAHA&lang=english#a');
        document.body.innerHTML = `
            <div class="container bugfix">
                <div class="results search">
                    <div id="result-0">
                        <div class="result vocabulary">
                            <div class="subsection-spelling with-furigana">
                                <div class="primary-spelling"><div class="spelling"><div><ruby class="v">母<rt>はは</rt></ruby></div></div></div>
                            </div>
                            <div class="vbox grow gap">
                                <div class="subsection-meanings">
                                    <h6 class="subsection-label">Meanings</h6>
                                    <div class="subsection"><div class="description">1. mother</div></div>
                                </div>
                                <div class="subsection-other-spellings alt-section">
                                    <div class="subsection"><div class="alt-spelling"><a class="plain" href="/vocabulary/1514990/%E6%AF%8D/%E3%81%AF%E3%81%AF?lang=english#a"><ruby>母<rt>はは</rt></ruby></a></div></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const immersionQueries: string[] = [];
        const controller = new JpdbExtensionsController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                showFloatingButton: false,
                autoScanJapanese: false,
                scanVisiblePage: false,
                audioViaBlob: false,
                immersionKitShowImages: false,
                localDictionariesEnabled: true,
                jpdbLocalDictionariesEnabled: true,
                immersionKitEnabled: true,
                jpdbImmersionKitEnabled: true,
                jpdbKanjiDoodleEnabled: false,
                jpdbKanjiEnabled: false,
                jpdbRtkEnabled: false,
                jpdbUchisenEnabled: false,
            }),
            dictionaries: {
                lookup: vi.fn(async (term: string) => term === 'はは'
                    ? [{
                        expression: 'はは',
                        reading: '',
                        glossary: ['mother; mama'],
                        dictionary: '小学館例解学習国語 第十二版',
                        score: 1,
                    }]
                    : []),
            } as unknown as YomitanDictionaryStore,
            immersionKit: {
                search: vi.fn(async (query: string) => {
                    immersionQueries.push(query);
                    return query === 'HAHA'
                        ? [{
                            id: 'anime_test_1',
                            sentence: 'ははっ｡',
                            sentenceWithFurigana: '',
                            translation: 'The police are here!',
                            sourceTitle: 'My Hero Academia',
                            titleSlug: 'my_hero_academia',
                            category: 'anime',
                            soundFile: 'audio.mp3',
                            imageFile: '',
                            soundUrl: 'https://audio.test/haha.mp3',
                            imageUrl: '',
                        }]
                        : [];
                }),
                mediaUrl: vi.fn(() => 'https://audio.test/haha.mp3'),
                fetchDataUrl: vi.fn(),
                fetchBlobUrl: vi.fn(async () => 'blob:http://localhost/haha.mp3'),
            } as unknown as ImmersionKitClient,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            audio: { play: vi.fn(async () => undefined) } as never,
        });

        (controller as unknown as { run: () => void }).run();

        await waitForExpect(() => {
            expect(document.querySelector('.yomu-jpdb-local-dictionaries')?.textContent).toContain('mother; mama');
            expect(document.querySelector('#yomu-jpdb-immersion')?.textContent).toContain('My Hero Academia');
        });
        expect(immersionQueries[0]).toBe('HAHA');
        controller.destroy();
    });

    it('uses JPDB review answer readings for local dictionaries, keeps RTK collapsed on front, and autoplays review Immersion Kit audio', async () => {
        const played: string[] = [];
        class FakeAudio {
            playbackRate = 1;
            ended = false;
            constructor(public src: string) {}
            addEventListener(): void {}
            pause(): void {}
            play(): Promise<void> {
                played.push(this.src);
                return Promise.resolve();
            }
        }
        vi.stubGlobal('Audio', FakeAudio);

        const settings = {
            ...DEFAULT_SETTINGS,
            showFloatingButton: false,
            autoScanJapanese: false,
            scanVisiblePage: false,
            audioViaBlob: false,
            immersionKitShowImages: false,
            localDictionariesEnabled: true,
            jpdbLocalDictionariesEnabled: true,
            immersionKitEnabled: true,
            jpdbImmersionKitEnabled: true,
            jpdbImmersionKitAutoPlayReviewAudio: true,
            jpdbKanjiDoodleEnabled: false,
            jpdbKanjiEnabled: false,
            jpdbUchisenEnabled: false,
            jpdbRtkEnabled: true,
            rtkEnabled: true,
        };

        document.body.innerHTML = `
            <div class="nav minimal"><div class="menu"><a class="nav-item" href="/learn">Learn (<span style="color:red">121</span>)</a><a class="nav-item" href="/decks">Decks</a></div><button class="menu-icon">menu</button></div>
            <div class="answer-box">
                <input name="c" value="kb,漢">
                <div class="plain kanji-keyword">Chinese</div>
            </div>
        `;
        window.history.replaceState(null, '', '/review?c=kb,%E6%BC%A2#a');
        const frontController = new JpdbExtensionsController({
            getSettings: () => settings,
            dictionaries: { lookup: vi.fn(async () => []) } as unknown as YomitanDictionaryStore,
            immersionKit: { search: vi.fn(async () => []) } as unknown as ImmersionKitClient,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            rtk: {
                lookup: vi.fn(async () => ({
                    kanji: '漢',
                    keyword: 'Sino-',
                    frameNumber: '100',
                    onYomi: 'カン',
                    kunYomi: '',
                    elements: 'water, mouth',
                    heisigStory: 'Water between countries.',
                    heisigComment: '',
                    koohiiStories: [],
                })),
            } as never,
            audio: { play: vi.fn(async () => undefined) } as never,
        });
        (frontController as unknown as { run: () => void }).run();
        await waitForExpect(() => {
            expect(document.querySelector('.nav-item')?.textContent).toContain('Items left (121)');
            expect(document.querySelector('#yomu-jpdb-rtk details')?.hasAttribute('open')).toBe(false);
        });
        frontController.destroy();

        window.history.replaceState(null, '', '/review?c=vf%2C1492670%2C2652238148&r=1#a');
        document.body.innerHTML = `
            <div class="nav minimal"><div class="menu"><a class="nav-item" href="/learn">Learn (<span style="color:red">121</span>)</a><a class="nav-item" href="/decks">Decks</a></div><button class="menu-icon">menu</button></div>
            <div class="review-reveal">
                <div class="answer-box">
                    <div class="plain" style="display:none"><a class="plain" href="/vocabulary/1492670/%E4%B8%8D%E8%87%AA%E7%84%B6#a"><ruby>不<rt>ふ</rt></ruby><ruby>自<rt>し</rt></ruby><ruby>然<rt>ぜん</rt></ruby></a></div>
                    <div class="sentence">この文章は<span class="highlight"><ruby>不<rt>ふ</rt></ruby><ruby>自<rt>し</rt></ruby><ruby>然<rt>ぜん</rt></ruby></span>に感じます。</div>
                </div>
                <div class="result vocabulary">
                    <div class="subsection-meanings">
                        <h6 class="subsection-label">Meanings</h6>
                        <div class="subsection"><div class="description">1. unnatural</div></div>
                    </div>
                </div>
            </div>
        `;
        const backController = new JpdbExtensionsController({
            getSettings: () => settings,
            dictionaries: {
                lookup: vi.fn(async (term: string) => term === 'ふしぜん'
                    ? [{
                        expression: 'ふしぜん',
                        reading: '',
                        glossary: ['わざとらしいこと。自然でないこと。'],
                        dictionary: '小学館例解学習国語 第十二版',
                        score: 1,
                    }]
                    : []),
            } as unknown as YomitanDictionaryStore,
            immersionKit: {
                search: vi.fn(async (query: string) => query === '不自然'
                    ? [{
                        id: 'anime_code_geass_1',
                        sentence: 'うん とっても不自然',
                        sentenceWithFurigana: '',
                        translation: 'Yeah... This is pretty unnatural.',
                        sourceTitle: 'Code Geass',
                        titleSlug: 'code_geass',
                        category: 'anime',
                        soundFile: '',
                        imageFile: '',
                        soundUrl: 'https://audio.test/fushizen.mp3',
                        imageUrl: '',
                    }]
                    : []),
                mediaUrl: vi.fn(() => 'https://audio.test/fushizen.mp3'),
                fetchDataUrl: vi.fn(),
                fetchBlobUrl: vi.fn(async () => 'blob:http://localhost/fushizen.mp3'),
            } as unknown as ImmersionKitClient,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            audio: { play: vi.fn(async () => undefined) } as never,
        });
        (backController as unknown as { run: () => void }).run();
        await waitForExpect(() => {
            expect(document.querySelector('.yomu-jpdb-local-dictionaries')?.textContent).toContain('自然でない');
            expect(document.querySelector('#yomu-jpdb-immersion')?.textContent).toContain('Code Geass');
        });
        expect(played).not.toContain('blob:http://localhost/fushizen.mp3');
        document.querySelector<HTMLButtonElement>('[data-yomu-immersion-action="audio"]')?.click();
        await waitForExpect(() => {
            expect(played).toContain('blob:http://localhost/fushizen.mp3');
        });
        backController.destroy();
        vi.unstubAllGlobals();
    });

    it('skips the JapanesePod101 unavailable clip and plays the next source', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        class FakeAudio {
            preload = '';
            constructor(public src: string) {}
            play(): Promise<void> {
                played.push(this.src);
                return Promise.resolve();
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', FakeAudio);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/audio.mp3'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                if (details.url === 'http://x.test/audio.mp3') {
                    details.onload?.({
                        status: 200,
                        response: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
                    });
                    return;
                }
                details.onload?.({
                    status: 200,
                    response: new Blob([new Uint8Array(52288)], { type: 'audio/mpeg' }),
                });
            },
        });
        vi.stubGlobal('crypto', {
            subtle: {
                digest: () => Promise.reject(new Error('digest unavailable')),
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jpod101', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/audio.mp3', voice: '', enabled: true },
                ],
            }));

            await player.play(card);

            expect(played).toEqual(['http://x.test/audio.mp3']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('caches custom JSON audio candidates across repeated plays', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        let sourceRequests = 0;
        class FakeAudio {
            preload = '';
            constructor(public src: string) {}
            play(): Promise<void> {
                played.push(this.src);
                return Promise.resolve();
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', FakeAudio);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/audio.mp3'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                if (details.responseType === 'text') {
                    sourceRequests += 1;
                    details.onload?.({
                        status: 200,
                        response: JSON.stringify({ audioSources: [{ url: 'http://x.test/audio.mp3' }] }),
                        responseText: JSON.stringify({ audioSources: [{ url: 'http://x.test/audio.mp3' }] }),
                    });
                    return;
                }
                details.onload?.({
                    status: 200,
                    response: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
                });
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

            await player.play(card);
            await player.play(card);

            expect(sourceRequests).toBe(1);
            expect(played).toEqual(['http://x.test/audio.mp3', 'http://x.test/audio.mp3']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('reuses preloaded audio blobs for immediate playback', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const restoreAppleMobile = mockAppleMobileBrowser();
        let blobRequests = 0;
        class FakeAudio {
            preload = '';
            constructor(public src: string) {}
            play(): Promise<void> {
                played.push(this.src);
                return Promise.resolve();
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', FakeAudio);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/preloaded-audio'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                blobRequests += 1;
                details.onload?.({
                    status: 200,
                    response: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
                });
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
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            restoreMedia();
            restoreAppleMobile();
            vi.unstubAllGlobals();
        }
    });

    it('plays direct audio URLs when blob playback is disabled', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        class FakeAudio {
            preload = '';
            constructor(public src: string) {}
            play(): Promise<void> {
                played.push(this.src);
                return Promise.resolve();
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', FakeAudio);

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
            const cache = new ObjectUrlCache(1000, 'test');
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

    it('plays custom audio candidates through userscript blob fetch', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const restoreAppleMobile = mockAppleMobileBrowser();
        class FakeAudio {
            preload = '';
            constructor(public src: string) {}
            play(): Promise<void> {
                played.push(this.src);
                return Promise.resolve();
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', FakeAudio);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/audio-retry'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                if (details.responseType === 'text') {
                    details.onload?.({
                        status: 200,
                        response: JSON.stringify({
                            audioSources: [{ url: 'http://x.test/audio/taberu.mp3' }],
                        }),
                        responseText: JSON.stringify({
                            audioSources: [{ url: 'http://x.test/audio/taberu.mp3' }],
                        }),
                    });
                    return;
                }
                details.onload?.({
                    status: 200,
                    response: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
                });
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

            await player.play(card);

            expect(played).toEqual(['blob:http://localhost/audio-retry']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
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
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });

            expect(examples[0]).toMatchObject({ sourceTitle: 'Steins Gate', imageFile: 'A_SteinsGateS01_E07_1_0.19.51.112.jpg' });
            expect(client.mediaUrl(examples[0], 'image')).toContain('media%2Fanime%2FSteins+Gate%2Fmedia%2FA_SteinsGateS01_E07_1_0.19.51.112.jpg');
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

        expect(client.mediaUrl(example, 'sound')).toContain('media%2Fanime%2FAngel+Beats%21%2Fmedia%2FAngel_Beats%21_5_0.05.40.830-0.05.41.780.mp3');
        expect(client.mediaUrls(example, 'sound')).toContain('https://us-southeast-1.linodeobjects.com/immersionkit/media/anime/Angel%20Beats!/media/Angel_Beats!_5_0.05.40.830-0.05.41.780.mp3');

        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                response: new Blob(['<?xml version="1.0"?><Error>NoSuchKey</Error>'], { type: 'application/xml' }),
            }),
        });

        try {
            await expect(client.fetchBlobUrl(client.mediaUrl(example, 'sound'), DEFAULT_SETTINGS.audioTimeoutMs))
                .rejects.toThrow('error document');
        } finally {
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
            expect(client.mediaUrls(example, 'sound')[0]).toContain('Re+Zero+%E2%88%92+Starting+Life+in+Another+World');
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

        expect(client.mediaUrls(reZeroWithBadDisplayTitle, 'sound')[0]).toContain('Re+Zero+%E2%88%92+Starting+Life+in+Another+World');
        expect(client.mediaUrls(reZeroWithBadDisplayTitle, 'sound')[0]).not.toContain('RE+Zero+Starting+Life+IN+Another+World');
        expect(client.mediaUrls(demonSlayer, 'sound')[0]).toContain('Demon+Slayer+-+Kimetsu+no+Yaiba');
        expect(client.mediaUrls(fullmetal, 'sound')[0]).toContain('Fullmetal+Alchemist+Brotherhood');
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

    it('keeps Immersion Kit image fallbacks wired without autoplaying initial render', async () => {
        const app = new ReaderApp();
        const container = document.createElement('details');
        container.setAttribute('data-immersion-kit', '');
        const popover = document.createElement('div');
        popover.append(container);
        document.body.append(popover);

        const example = {
            id: 'anime_test_000001',
            sentence: 'ええ 私としては この発音のほうが好ましい',
            sentenceWithFurigana: '',
            translation: '',
            sourceTitle: 'Test Source',
            titleSlug: 'test_source',
            category: 'anime',
            soundFile: 'line.mp3',
            imageFile: 'frame.jpg',
            soundUrl: '',
            imageUrl: '',
        };
        const playSpy = vi.fn(async () => undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parseJapanese(texts: string[]): Promise<JPDBToken[][]>;
            immersionPopover: {
                loadExamples(popover: HTMLElement, card: JPDBCard): Promise<void>;
                searchExamples(card: JPDBCard): Promise<unknown>;
                playExampleAudio(example: unknown, quiet?: boolean): Promise<void>;
                mediaUrls(example: unknown, kind: 'image' | 'sound'): string[];
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

        await internals.immersionPopover.loadExamples(popover, card);

        const image = container.querySelector<HTMLImageElement>('[data-immersion-image]');
        expect(playSpy).not.toHaveBeenCalled();
        expect(image?.src).toBe('https://media.test/bad.jpg');

        image?.dispatchEvent(new Event('error'));

        expect(image?.src).toBe('https://media.test/good.jpg');

        container.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();
        expect(playSpy).toHaveBeenCalledWith(example, true);
    });

    it('plays Immersion Kit hover audio only after entering the Immersion Kit panel', async () => {
        const app = new ReaderApp();
        const container = document.createElement('details');
        container.setAttribute('data-immersion-kit', '');
        const popover = document.createElement('div');
        popover.append(container);
        document.body.append(popover);

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
        const playSpy = vi.fn(async () => undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parseJapanese(texts: string[]): Promise<JPDBToken[][]>;
            immersionPopover: {
                loadExamples(popover: HTMLElement, card: JPDBCard): Promise<void>;
                searchExamples(card: JPDBCard): Promise<unknown>;
                playExampleAudio(example: unknown, quiet?: boolean, isCurrent?: () => boolean): Promise<void>;
                mediaUrls(example: unknown, kind: 'image' | 'sound'): string[];
            };
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            immersionKitAutoPlayAudio: true,
            immersionKitPlayOnHover: true,
            immersionKitShowImages: true,
        };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '発音',
            usedFallback: false,
            triedQueries: ['発音'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.playExampleAudio = playSpy;
        internals.immersionPopover.mediaUrls = vi.fn(() => ['https://media.test/line.mp3']);

        await internals.immersionPopover.loadExamples(popover, card);

        expect(playSpy).not.toHaveBeenCalled();
        await new Promise(resolve => requestAnimationFrame(resolve));

        const enter = new Event('pointerover', { bubbles: true }) as PointerEvent;
        Object.defineProperty(enter, 'pointerType', { value: 'mouse' });
        Object.defineProperty(enter, 'relatedTarget', { value: document.body });
        container.querySelector<HTMLElement>('.jpdb-reader-example-media')?.dispatchEvent(enter);

        expect(playSpy).toHaveBeenCalledWith(example, true, expect.any(Function));
    });

    it('does not treat normal-sized JapanesePod101 audio as unavailable', async () => {
        await expect(isUnavailableJapanesePod101Audio(new Blob([new Uint8Array(1512)]))).resolves.toBe(false);
    });

    it('keeps quoted Japanese sentences together', () => {
        expect(splitJapaneseSentences('これは犬です。「本当ですか？」はい。')).toEqual([
            'これは犬です。',
            '「本当ですか？」',
            'はい。',
        ]);
    });

    it('matches configurable shortcuts', () => {
        const event = new KeyboardEvent('keydown', { key: 'J', altKey: true, shiftKey: true });
        expect(matchesShortcut(event, 'Alt+Shift+J')).toBe(true);
        expect(matchesShortcut(event, 'Alt+J')).toBe(false);
    });

    it('defaults hover lookup to immediate open with a short close grace', () => {
        expect(DEFAULT_SETTINGS.hoverOpenDelayMs).toBe(0);
        expect(DEFAULT_SETTINGS.hoverCloseDelayMs).toBeLessThanOrEqual(100);
    });

    it('does not show subtitles by default until a track is selected', () => {
        expect(DEFAULT_SETTINGS.subtitlePlayerEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.subtitleAutoDetect).toBe(true);
        expect(DEFAULT_SETTINGS.subtitleOverlayVisible).toBe(false);
        expect(DEFAULT_SETTINGS.subtitleSecondaryVisible).toBe(false);
        expect(DEFAULT_SETTINGS.subtitleBackgroundOpacity).toBe(0);
    });

    it('positions hover popovers near the cursor without covering it', () => {
        withViewport(600, 420, () => {
            const popover = sizedPopover(220, 120);

            positionPopover(popover, undefined, undefined, { followPoint: { x: 300, y: 180 } });

            const left = Number.parseFloat(popover.style.left);
            const top = Number.parseFloat(popover.style.top);
            expect(left).toBeGreaterThanOrEqual(0);
            expect(left + 220).toBeLessThanOrEqual(600);
            expect(top).toBeGreaterThanOrEqual(0);
            expect(top + 120).toBeLessThanOrEqual(420);
            expect(top >= 190 || top + 120 <= 170).toBe(true);
        });
    });

    it('keeps cursor-following popovers inside the viewport near edges', () => {
        withViewport(360, 260, () => {
            const popover = sizedPopover(220, 120);

            positionPopover(popover, undefined, undefined, { followPoint: { x: 354, y: 248 } });

            const left = Number.parseFloat(popover.style.left);
            const top = Number.parseFloat(popover.style.top);
            expect(left).toBeGreaterThanOrEqual(0);
            expect(left + 220).toBeLessThanOrEqual(360);
            expect(top).toBeGreaterThanOrEqual(0);
            expect(top + 120).toBeLessThanOrEqual(260);
            expect(top + 120).toBeLessThanOrEqual(238);
        });
    });

    it('aligns anchored dictionary popovers to the scanned text like Yomitan', () => {
        withViewport(600, 420, () => {
            const popover = sizedPopover(220, 120);
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(80, 70, 60, 32);
            document.body.append(anchor);

            positionPopover(popover, anchor);

            expect(Number.parseFloat(popover.style.left)).toBe(80);
            expect(Number.parseFloat(popover.style.top)).toBe(112);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('below');
        });
    });

    it('places anchored dictionary popovers above when there is more room there', () => {
        withViewport(600, 260, () => {
            const popover = sizedPopover(220, 120);
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(80, 220, 60, 28);
            document.body.append(anchor);

            positionPopover(popover, anchor);

            expect(Number.parseFloat(popover.style.left)).toBe(80);
            expect(Number.parseFloat(popover.style.top)).toBe(90);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('above');
        });
    });

    it('only uses fallback pointer lookup when the pointer is on real text', () => {
        document.body.innerHTML = '<p>やさしいことば</p>';
        const paragraph = document.querySelector('p')!;
        const node = paragraph.firstChild as Text;
        const app = new ReaderApp();

        withPointerTextLookupMock(node, 2, [{ left: 20, top: 20, width: 120, height: 28 }], () => {
            expect(lookupCandidateFromPoint(app, 64, 30, paragraph)).toMatchObject({
                text: 'やさしいことば',
                offset: 2,
                start: 0,
                end: 7,
                anchor: paragraph,
            });
            expect(lookupCandidateFromPoint(app, 220, 30, paragraph)).toBeNull();
        });
    });

    it('targets the glyph under the pointer when browser caret affinity lands after it', () => {
        document.body.innerHTML = '<p>青空</p>';
        const paragraph = document.querySelector('p')!;
        const node = paragraph.firstChild as Text;
        const app = new ReaderApp();

        withPointerTextLookupMock(node, 1, start => start === 0
            ? [{ left: 20, top: 20, width: 18, height: 28 }]
            : [{ left: 42, top: 20, width: 18, height: 28 }],
        () => {
            expect(lookupCandidateFromPoint(app, 28, 30, paragraph)).toMatchObject({
                text: '青空',
                offset: 0,
                start: 0,
                end: 2,
                anchor: paragraph,
            });
        });
    });

    it('does not use hidden accessibility text for fallback pointer lookup', () => {
        document.body.innerHTML = '<p aria-hidden="true">やさしいことば</p><p class="sr-only">言葉</p>';
        const [ariaHidden, srOnly] = Array.from(document.querySelectorAll('p'));
        const app = new ReaderApp();

        withPointerTextLookupMock(ariaHidden.firstChild as Text, 2, [{ left: 20, top: 20, width: 120, height: 28 }], () => {
            expect(lookupCandidateFromPoint(app, 64, 30, ariaHidden)).toBeNull();
        });
        withPointerTextLookupMock(srOnly.firstChild as Text, 0, [{ left: 20, top: 60, width: 40, height: 28 }], () => {
            expect(lookupCandidateFromPoint(app, 32, 70, srOnly)).toBeNull();
        });
    });

    it('does not use YouTube video metadata counters for fallback pointer lookup', () => {
        document.body.innerHTML = '<ytd-video-meta-block><span id="metadata-line">66万回視聴</span></ytd-video-meta-block>';
        const metadata = document.querySelector('span')!;
        const node = metadata.firstChild as Text;
        const app = new ReaderApp();

        withPointerTextLookupMock(node, 1, [{ left: 20, top: 20, width: 90, height: 24 }], () => {
            expect(lookupCandidateFromPoint(app, 48, 30, metadata)).toBeNull();
        });
    });

    it('does not use standalone metadata words for fallback pointer lookup', () => {
        document.body.innerHTML = '<p>新着</p><p>新卒エンジニア</p>';
        const [metadata, title] = Array.from(document.querySelectorAll('p'));
        const app = new ReaderApp();

        withPointerTextLookupMock(metadata.firstChild as Text, 0, [{ left: 20, top: 20, width: 36, height: 24 }], () => {
            expect(lookupCandidateFromPoint(app, 28, 30, metadata)).toBeNull();
        });
        withPointerTextLookupMock(title.firstChild as Text, 0, [{ left: 20, top: 60, width: 120, height: 24 }], () => {
            expect(lookupCandidateFromPoint(app, 28, 70, title)).toMatchObject({
                text: '新卒エンジニア',
                start: 0,
                end: 7,
                anchor: title,
            });
        });
    });

    it('preserves an intentionally empty Yomitan-style audio source list', () => {
        expect(normalizeAudioSources([])).toEqual([]);
        expect(normalizeAudioSources(undefined, 'http://localhost:9090/?term={term}')).toMatchObject([
            { type: 'custom-json', url: 'http://localhost:9090/?term={term}', enabled: true },
        ]);
    });

    it('applies test-page URL bootstrap settings without mutating defaults', () => {
        const settings = applyUrlBootstrapSettings(DEFAULT_SETTINGS, '?apiKey=test-key&audio=http%3A%2F%2Faudio.test%2F%3Fterm%3D%7Bterm%7D&ocr=http%3A%2F%2Focr.test');

        expect(settings.apiKey).toBe('test-key');
        expect(settings.ocrEndpointUrl).toBe('http://ocr.test');
        expect(settings.audioSources[0]).toMatchObject({
            type: 'custom-json',
            url: 'http://audio.test/?term={term}',
            enabled: true,
        });
        expect(DEFAULT_SETTINGS.apiKey).toBe('');
    });

    it('migrates older OCR provider names to the current readable options', () => {
        expect(normalizeOcrProvider('auto')).toBe('google-lens');
        expect(normalizeOcrProvider('fast')).toBe('google-lens');
        expect(normalizeOcrProvider('custom-json')).toBe('local-service');
    });

    it('keeps numeric token counts visible while redacting real secrets in logs', () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        try {
            Logger.reset();
            Logger.configure({ forceEnabled: true });
            Logger.scope('Test').info('scan summary', {
                tokens: 4,
                token: 'secret-token',
                apiKey: 'secret-key',
            });

            expect(infoSpy).toHaveBeenCalledTimes(1);
            expect(infoSpy.mock.calls[0][4]).toMatchObject({
                tokens: 4,
                token: '[redacted]',
                apiKey: '[redacted]',
            });
        } finally {
            Logger.configure({ forceEnabled: false });
            Logger.reset();
            infoSpy.mockRestore();
        }
    });

    it('ships the JMdict starter dictionary download from Yomitan', () => {
        const starter = findRecommendedDictionary('jmdict');
        expect(starter?.downloadUrl).toContain('JMdict_english.zip');
        expect(starter?.homepage).toContain('jmdict-yomitan');
        expect(RECOMMENDED_JAPANESE_DICTIONARIES.map(item => item.name)).toEqual([
            'Jitendex',
            'JMdict',
            'JMnedict',
            'KANJIDIC',
            'JPDBv2㋕',
            'BCCWJ',
            'Jiten',
        ]);
        expect(STARTER_DICTIONARY_IDS).toEqual(['jmdict']);
    });

    it('downloads dictionaries through lowercase GM.xmlhttpRequest when that is the exposed userscript API', async () => {
        const zip = new JSZip();
        zip.file('index.json', JSON.stringify({ title: 'Alias Dict', format: 3 }));
        zip.file('term_bank_1.json', JSON.stringify([
            ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
        ]));
        const blob = await zip.generateAsync({ type: 'blob' });
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            expect(options.url).toBe('https://dict.test/alias.zip');
            options.onprogress?.({ lengthComputable: true, loaded: blob.size, total: blob.size });
            options.onload?.({ status: 200, response: blob });
        });

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', { xmlhttpRequest: request });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not run'))));

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const progress: string[] = [];
            const summary = await store.importFromUrl('https://dict.test/alias.zip', 'alias.zip', message => progress.push(message));

            expect(request).toHaveBeenCalledTimes(1);
            expect(summary).toMatchObject({ dictionaries: ['Alias Dict'], terms: 1, entries: 1 });
            expect(progress).toContain('Downloading alias.zip...');
            expect(progress).toContain('Downloading dictionary 100%...');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('downloads dictionaries through vite-plugin-monkey mounted userscript APIs', async () => {
        const zip = new JSZip();
        zip.file('index.json', JSON.stringify({ title: 'Mounted Dict', format: 3 }));
        zip.file('term_bank_1.json', JSON.stringify([
            ['見る', 'みる', '', 'v1', 10, ['to see'], 1, ''],
        ]));
        const blob = await zip.generateAsync({ type: 'blob' });
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            expect(options.url).toBe('https://dict.test/mounted.zip');
            options.onload?.({ status: 200, response: blob });
        });
        const monkeyWindowKey = '__monkeyWindow-http://127.0.0.1:5174';

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not run'))));
        Object.defineProperty(document, monkeyWindowKey, {
            configurable: true,
            value: { GM_xmlhttpRequest: request },
        });

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFromUrl('https://dict.test/mounted.zip', 'mounted.zip');

            expect(request).toHaveBeenCalledTimes(1);
            expect(summary).toMatchObject({ dictionaries: ['Mounted Dict'], terms: 1, entries: 1 });
        } finally {
            delete (document as unknown as Record<string, unknown>)[monkeyWindowKey];
            vi.unstubAllGlobals();
        }
    });

    it('uses the local dev dictionary proxy when userscript requests are unavailable on localhost', async () => {
        expect(['localhost', '127.0.0.1', '::1']).toContain(location.hostname);
        const zip = new JSZip();
        zip.file('index.json', JSON.stringify({ title: 'Proxy Dict', format: 3 }));
        zip.file('term_bank_1.json', JSON.stringify([
            ['青空', 'あおぞら', '', '', 10, ['blue sky'], 1, ''],
        ]));
        const blob = await zip.generateAsync({ type: 'blob' });
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            expect(String(input)).toBe('/__jpdb-reader-dictionary-proxy?url=https%3A%2F%2Fdict.test%2Fproxy.zip');
            return Promise.resolve({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(blob),
            } as Response);
        });

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', fetchMock);

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFromUrl('https://dict.test/proxy.zip', 'proxy.zip');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(summary).toMatchObject({ dictionaries: ['Proxy Dict'], terms: 1, entries: 1 });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('sanitizes configurable accent colors', () => {
        expect(sanitizeAccentColor('#7c3aed')).toBe('#7c3aed');
        expect(sanitizeAccentColor('#abc')).toBe('#aabbcc');
        expect(sanitizeAccentColor('lime')).toBe(DEFAULT_SETTINGS.accentColor);
    });

    it('imports useful settings from a Yomitan backup', () => {
        const imported = parseYomitanSettingsExport({
            options: {
                profiles: [{
                    options: {
                        audio: {
                            autoPlay: true,
                            sources: [{ type: 'custom-json', url: 'http://localhost:9090/?term={term}&reading={reading}' }],
                        },
                        general: { popupTheme: 'dark', maxResults: 20 },
                        scanning: { selectText: true, scanWithoutMousemove: true },
                        dictionaries: [{ name: 'Jitendex', enabled: true }],
                    },
                }],
            },
        });
        expect(imported.settings.audioSources?.[0]).toMatchObject({
            type: 'custom-json',
            url: 'http://localhost:9090/?term={term}&reading={reading}',
        });
        expect(imported.settings.audioEnableDefaultSources).toBeUndefined();
        expect(imported.settings.autoPlayAudio).toBe(true);
        expect(imported.settings.localDictionaryMaxResults).toBe(20);
        expect(imported.dictionaryNames).toEqual(['Jitendex']);
        expect(imported.settings.dictionaryPreferences?.[0]).toMatchObject({ name: 'Jitendex', enabled: true, priority: 0 });
    });

    it('detects grammar hints with stable guide links', () => {
        const hints = detectGrammarHints('この日本語の本を読みきりたいので、毎日読んでいる。');
        expect(hints.map(hint => hint.name)).toEqual(expect.arrayContaining(['ている', 'たい', 'ので']));
        expect(hints.find(hint => hint.name === 'ている')?.url).toBe('https://www.tofugu.com/japanese-grammar/verb-continuous-form-teiru/');
        expect(hints.find(hint => hint.name === 'たい')?.confidence).toBe('high');
    });

    it('flattens Yomitan structured glossary content for the compact popup', () => {
        expect(glossaryToText({ type: 'structured-content', content: ['to read ', { tag: 'ruby', content: ['読', { tag: 'rt', content: 'よ' }] }] }))
            .toContain('to read');
        const html = glossaryToHtml({
            type: 'structured-content',
            content: {
                tag: 'ul',
                data: { content: 'glossary' },
                content: [{ tag: 'li', data: { class: 'tag' }, content: 'definition' }],
            },
        }, 'Jitendex');
        expect(html).toContain('class="structured-content"');
        expect(html).toContain('data-dictionary="Jitendex"');
        expect(html).toContain('class="gloss-sc-ul"');
        expect(html).toContain('data-sc-content="glossary"');
        expect(html).toContain('data-sc-class="tag"');
        expect(html).toContain('definition');
        expect(glossaryToHtml(['読', { tag: 'ruby', content: ['む', { tag: 'rt', content: 'む' }] }]))
            .toContain('読<ruby');
    });

    it('renders Yomitan search cross-references as in-reader lookup links when requested', () => {
        const html = glossaryToHtml({
            tag: 'a',
            href: '?query=%E7%88%B6%E3%81%95%E3%82%93&wildcards=off&primary_reading=%E3%81%A8%E3%81%86%E3%81%95%E3%82%93',
            content: '父さん',
        }, 'Jitendex', { internalSearchLinks: true });

        expect(html).toContain('href="#jpdb-reader-dictionary-lookup"');
        expect(html).toContain('data-dictionary-lookup="父さん"');
        expect(html).toContain('data-dictionary-reading="とうさん"');
        expect(html).toContain('data-external="false"');
        expect(html).not.toContain('jpdb.io/search');
        expect(html).not.toContain('target="_blank"');
    });

    it('scopes imported Yomitan dictionary CSS to dictionary content', () => {
        const css = renderDictionaryScopedStyles([
            { title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, styles: 'ul[data-sc-content="glossary"] { padding-left: 1em; }' },
            { title: 'Disabled', alias: 'Disabled', enabled: false, priority: 1, styles: '.x { color: red; }' },
        ], [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 },
            { name: 'Disabled', alias: 'Disabled', enabled: false, priority: 1 },
        ]);
        expect(css).toContain('[data-dictionary="Jitendex"]');
        expect(css).toContain('data-sc-content');
        expect(css).not.toContain('[data-dictionary="Disabled"]');
    });

    it('builds rich Anki fields from JPDB and imported dictionary context', () => {
        const fields = buildYomuAnkiFields({
            ...card,
            vid: 1456360,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: 400,
            meanings: [{ glosses: ['to read'], partOfSpeech: ['vt', 'v5', 'v5m'] }],
            pitchAccent: ['LHH'],
            cardState: ['known'],
        }, '今日は本を読む。', {
            sourceUrl: 'https://example.test/article',
            sourceTitle: 'Example article',
            dictionaryPreferences: [{ name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }],
            localEntries: [{
                expression: '読む',
                reading: 'よむ',
                glossary: [{ tag: 'ul', content: [{ tag: 'li', content: 'to read aloud' }] }],
                dictionary: 'Jitendex',
                definitionTags: 'common',
            }],
            kanjiEntries: [{
                character: '読',
                onyomi: ['ドク'],
                kunyomi: ['よ.む'],
                tags: ['grade 2'],
                meanings: ['read'],
                dictionary: 'KANJIDIC',
            }],
            metaEntries: [
                { expression: '読む', mode: 'freq', data: { displayValue: 123 }, dictionary: 'JPDBv2' },
                { expression: '読む', mode: 'pitch', data: { pitches: [1] }, dictionary: 'Pitch' },
            ],
        });

        expect(YOMU_MODEL_FIELDS).toContain('DictionaryDefinitions');
        expect(fields.Meaning).toContain('to read');
        expect(fields.Meaning).toContain('transitive verb');
        expect(fields.Sentence).toContain('yomu-highlight');
        expect(fields.DictionaryDefinitions).toContain('Jitendex');
        expect(fields.DictionaryDefinitions).toContain('to read aloud');
        expect(fields.Kanji).toContain('読');
        expect(fields.Kanji).toContain('read');
        expect(fields.Frequency).toContain('JPDB #400');
        expect(fields.Frequency).toContain('JPDBv2 #123');
        expect(fields.Pitch).toContain('LHH');
        expect(fields.Source).toContain('Example article');
    });

    it('builds Anki fields for local dictionary cards without requiring JPDB links', () => {
        const localCard: JPDBCard = {
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['blue sky'], partOfSpeech: [] }],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
        };

        const fields = buildYomuAnkiFields(localCard, '青空を見る。');

        expect(fields.Meaning).toContain('blue sky');
        expect(fields.JPDB).toBe('');
        expect(fields.Status).toContain('local dictionary');
    });

    it('uses promise-style GM object requests for AnkiConnect', async () => {
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                response: { result: 6, error: null },
            }),
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));
            await expect(client.isConnected()).resolves.toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('finds local dictionary terms in text for JPDB-free parsing', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '青空', reading: 'あおぞら', glossary: ['blue sky'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [2, { expression: '空', reading: 'そら', glossary: ['sky'], score: 2, dictionary: 'Jitendex' }] },
                        ],
                    },
                ],
            },
        })], 'local-terms.json', { type: 'application/json' });

        await store.importFile(file);
        const text = `${'これは長い前置きです'.repeat(18)}。青空を見る。`;
        const matches = await store.findTermMatches(text, 5);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ surface: '青空', start: text.indexOf('青空'), end: text.indexOf('青空') + 2 });
    });

    it('prefers the longest local dictionary reading match over shorter overlaps', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: 'や', reading: 'や', glossary: ['and'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [2, { expression: '優しい', reading: 'やさしい', rules: 'adj-i', glossary: ['kind'], score: 10, dictionary: 'Jitendex' }] },
                        ],
                    },
                ],
            },
        })], 'local-terms.json', { type: 'application/json' });

        await store.importFile(file);
        const matches = await store.findTermMatches('やさしいことば', 5);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ surface: 'やさしい', start: 0, end: 4 });
        expect(matches[0].entry.expression).toBe('優しい');
    });

    it('keeps independent JMdict-style words clickable around example-sentence particles', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '君', reading: 'きみ', glossary: ['you'], score: 10, dictionary: 'JMdict' }] },
                            { $: [2, { expression: 'どれ位', reading: 'どれくらい', glossary: ['how much'], score: 10, dictionary: 'JMdict' }] },
                            { $: [3, { expression: '海外', reading: 'かいがい', glossary: ['abroad'], score: 10, dictionary: 'JMdict' }] },
                            { $: [4, { expression: '行く', reading: 'いく', rules: 'v5k', glossary: ['to go'], score: 10, dictionary: 'JMdict' }] },
                        ],
                    },
                ],
            },
        })], 'jmdict-example.json', { type: 'application/json' });

        await store.importFile(file);
        const matches = await store.findTermMatches('君はどれくらいよく海外に行きますか。', 8);

        expect(matches.map(match => [match.surface, match.entry.expression])).toEqual([
            ['君', '君'],
            ['どれくらい', 'どれ位'],
            ['海外', '海外'],
            ['行きます', '行く'],
        ]);
    });

    it('deinflects local dictionary terms using Yomitan term rules', async () => {
        expect(deinflectJapaneseTerm('読んだ')).toEqual(expect.arrayContaining([
            expect.objectContaining({ term: '読む', rules: expect.arrayContaining(['v5m']) }),
        ]));
        expect(termRulesMatch('v5m vt', ['v5m', 'v5'])).toBe(true);
        expect(termRulesMatch('', ['v5m', 'v5'])).toBe(false);

        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '読む', reading: 'よむ', rules: 'v5m', glossary: ['to read'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [2, { expression: '食べる', reading: 'たべる', rules: 'v1', glossary: ['to eat'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [3, { expression: '高い', reading: 'たかい', rules: 'adj-i', glossary: ['high'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [4, { expression: '勉強する', reading: 'べんきょうする', rules: 'vs', glossary: ['to study'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [5, { expression: '読む', reading: 'よむ', rules: '', glossary: ['uninflectable duplicate'], score: 99, dictionary: 'Names' }] },
                        ],
                    },
                ],
            },
        })], 'local-terms.json', { type: 'application/json' });

        await store.importFile(file);
        const matches = await store.findTermMatches('本を読んだ。寿司を食べました。高かった。勉強している。', 8);

        expect(matches.map(match => [match.surface, match.entry.expression, match.entry.dictionary, match.deinflected?.term])).toEqual([
            ['読んだ', '読む', 'Jitendex', '読む'],
            ['食べました', '食べる', 'Jitendex', '食べる'],
            ['高かった', '高い', 'Jitendex', '高い'],
            ['勉強して', '勉強する', 'Jitendex', '勉強する'],
        ]);
    });

    it('renders JPDB part-of-speech codes as readable labels', () => {
        expect(formatPartOfSpeech(['vt', 'v5', 'v5m'])).toBe('transitive verb, godan verb, mu ending');
    });

    it('extracts compact kanji details from a JPDB kanji page', () => {
        const info = parseJpdbKanjiHtml(`
            <meta name="description" content="Dictionary definition of kanji 読 (よ) — read">
            <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
            <table class="cross-table">
                <tr><td>Frequency</td><td>Top 400-500</td></tr>
                <tr><td>Heisig</td><td>372</td></tr>
                <tr><td>Readings</td><td class="kanji-reading-list-common"><div><a href="/kanji-reading/読/よ">よ</a><div>(82%)</div></div></td></tr>
            </table>
            <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Composed of</h6><div class="subsection">
                <div><div class="spelling"><a href="/kanji/言">言</a></div><div class="description">say</div></div>
            </div></div>
            <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Used in kanji (1 in total)</h6><div class="subsection">
                <div class="used-in"><div class="spelling"><a href="/kanji/讀">讀</a></div><div class="description">read</div></div>
            </div></div>
            <div class="subsection-used-in"><div class="used-in">
                <div class="jp"><a href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a"><ruby>読<rt>よ</rt></ruby>む</a></div>
                <div class="en">to read</div>
            </div></div>
        `, '読');

        expect(info).toMatchObject({
            keyword: 'read',
            frequency: 'Top 400-500',
            heisig: '372',
            readings: [{ reading: 'よ', share: '(82%)', common: true }],
            components: [{ kanji: '言', keyword: 'say' }],
            usedInKanji: [{ kanji: '讀', keyword: 'read' }],
            vocabulary: [{ expression: '読む', reading: 'よむ', meaning: 'to read' }],
        });
    });

    it('parses and de-duplicates Uchisen mnemonic images', () => {
        const images = parseUchisenImages(`
            <div class="kanji_image_loader" data-large="/kanji/1/main.png"></div>
            <div id="mnemonic_story">Main story</div>
            <div class="mnemonic_card">
                <input class="image_url" value="https://ik.imagekit.io/uchisen//kanji/1/main.png?tr=w-300">
                <input class="story" value="Duplicate story">
            </div>
            <div class="mnemonic_card">
                <input class="image_url" value="generated_sample.jpg">
                <input class="story" value="A &lt;b&gt;second&lt;/b&gt; story">
            </div>
        `);

        expect(images).toEqual([
            { url: 'https://ik.imagekit.io/uchisen/kanji/1/main.png', story: 'Main story' },
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_sample.jpg', story: 'A second story' },
        ]);
    });

    it('detects JPDB kanji review card phases from the hidden card value', () => {
        expect(parseJpdbReviewCardValue('kb,読')).toEqual({
            kind: 'kb',
            kanji: '読',
            isKanji: true,
            phase: 'before',
        });
        expect(parseJpdbReviewCardValue('kb,%E8%AA%AD', '1')).toMatchObject({
            kanji: '読',
            isKanji: true,
            phase: 'after',
        });
        expect(parseJpdbReviewCardValue('vf,1227560,665431007')).toMatchObject({
            kind: 'vf',
            isKanji: false,
            phase: 'none',
        });
    });

    it('sanitizes stroke-order SVGs before embedding them', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
                <path d="M10,10 C20,20 30,20 40,10" onclick="alert(1)" />
                <path d="bad url(javascript:alert(1))" />
                <text transform="matrix(1 0 0 1 8 12)">1</text>
                <script>alert(1)</script>
            </svg>
        `, '読');

        expect(info?.strokeCount).toBe(1);
        expect(info?.svg).toContain('jpdb-reader-kanjivg-svg');
        expect(info?.svg).toContain('<text transform=');
        expect(info?.svg).not.toContain('onclick');
        expect(info?.svg).not.toContain('script');
        expect(info?.svg).not.toContain('javascript');
    });

    it('builds compact kanji facts from JPDB, stroke, and local dictionary data', () => {
        const facts = buildKanjiFacts('読', {
            kanji: '読',
            keyword: 'read',
            frequency: 'Top 400-500',
            type: 'Jouyou grade 2',
            kanken: 'Level 9',
            heisig: '372',
            oldForms: ['讀'],
            readings: [],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
        }, { kanji: '読', keyword: 'read', frameNumber: '372', onYomi: '', kunYomi: '', elements: '', componentKanji: [], heisigStory: '', heisigComment: '', koohiiStories: [] }, {
            kanji: '読',
            svg: '<svg></svg>',
            strokeCount: 14,
        }, [{
            character: '読',
            onyomi: ['ドク'],
            kunyomi: ['よ.む'],
            tags: ['jlpt n4', 'grade 2', 'freq 618'],
            meanings: ['read'],
            stats: { jlpt: 4, grade: 2, strokes: 14 },
            dictionary: 'KANJIDIC',
        }]);

        expect(facts).toEqual(expect.arrayContaining([
            { label: 'Type', value: 'Jōyō kanji', source: 'JPDB' },
            { label: 'JLPT', value: 'N4', source: 'KANJIDIC' },
            { label: 'Grade', value: 'Grade 2', source: 'KANJIDIC' },
            { label: 'Strokes', value: '14', source: 'KanjiVG' },
            { label: 'Frequency', value: 'Top 400-500', source: 'JPDB' },
        ]));
        expect(facts.some(fact => fact.label === 'RTK frame' || fact.label === 'Old forms')).toBe(false);
    });

    it('builds a small 2D kanji origin graph from component sources', () => {
        const sourceInfo = {
            kanjiMap: parseKanjiMapInfo({
                kanjialiveData: {
                    radical: {
                        character: '言',
                        strokes: 7,
                        image: 'https://media.kanjialive.com/radical_character/gonben.svg',
                        name: { hiragana: 'ごんべん', romaji: 'gonben' },
                        meaning: { english: 'words, to speak, say' },
                    },
                },
                jishoData: {
                    meaning: 'read',
                    jlptLevel: 'N5',
                    taughtIn: 'grade 2',
                    strokeCount: 14,
                    newspaperFrequencyRank: '618',
                    parts: ['言', '売', '讠'],
                },
            }, '読', 'https://example.test/読.json'),
        };
        const graph = buildKanjiOriginGraph('読', {
            kanji: '読',
            keyword: 'read',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '言', keyword: 'say' }, { kanji: '買', keyword: 'buy' }],
            usedInKanji: [{ kanji: '讀', keyword: 'traditional read' }],
            mnemonic: '',
            vocabulary: [],
        }, {
            kanji: '読',
            keyword: 'read',
            frameNumber: '372',
            onYomi: '',
            kunYomi: '',
            elements: 'words + sell',
            componentKanji: ['言', '売', '買'],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [{
            character: '読',
            onyomi: ['ドク'],
            kunyomi: ['よ.む'],
            tags: [],
            meanings: ['read'],
            dictionary: 'KANJIDIC',
        }], sourceInfo);

        expect(graph.nodes.map(node => node.id)).toEqual(expect.arrayContaining(['読', '言', '売']));
        expect(graph.edges).toEqual(expect.arrayContaining([
            { from: '言', to: '読', label: 'radical' },
            { from: '売', to: '読', label: 'structural part' },
            { from: '言', to: '読', label: 'JPDB component' },
            { from: '売', to: '読', label: 'RTK element' },
            { from: '読', to: '讀', label: 'used in kanji' },
        ]));

        const html = renderKanjiOrigins([], graph, sourceInfo, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('preserveAspectRatio="none"');
        expect(html).not.toContain('<line ');
        expect(html.match(/class="jpdb-reader-origin-edge"/g)).toHaveLength(3);
        expect(html).toContain('data-origin-outbound="true"');
        expect(html).toContain('data-origin-outbound-toggle');
        expect(html).toContain('data-rx=');
        expect(html).not.toContain('data-graph-node="買"');
        expect(html).not.toContain('data-graph-node="讠"');
    });

    it('normalizes Kanji Alive and Kanji Map data for compact kanji cards', () => {
        const info = parseKanjiMapInfo({
            kanjialiveData: {
                grade: 2,
                kstroke: 14,
                radical: {
                    image: 'https://media.kanjialive.com/radical_character/gonben.svg',
                    animation: ['https://media.kanjialive.com/rad_frames/gonben0.svg'],
                    name: { hiragana: 'ごんべん', romaji: 'gonben' },
                    meaning: { english: 'words, to speak, say' },
                    position: { hiragana: 'へん' },
                },
                examples: [{ japanese: '読む（よむ）', meaning: { english: 'read' } }],
            },
            jishoData: {
                meaning: 'read',
                jlptLevel: 'N5',
                taughtIn: 'grade 2',
                strokeCount: 14,
                newspaperFrequencyRank: '618',
                kunyomi: ['よ.む'],
                onyomi: ['ドク'],
                parts: ['言', '売'],
                radical: { symbol: '言', forms: ['訁'], meaning: 'speech' },
                uri: 'https://jisho.org/search/%E8%AA%AD%23kanji',
            },
        }, '読', 'https://example.test/読.json');

        expect(info).toMatchObject({
            meaning: 'read',
            jlpt: 'N5',
            grade: 'Grade 2',
            strokeCount: 14,
            frequencyRank: '#618',
            parts: ['言', '売'],
            radical: {
                symbol: '言',
                forms: ['訁'],
                reading: 'ごんべん',
                name: 'gonben',
                meaning: 'words, to speak, say',
                image: 'https://media.kanjialive.com/radical_character/gonben.svg',
            },
        });
    });

    it('extracts Wiktionary origin notes and historical form images', () => {
        const info = parseWiktionaryInfo({
            parse: {
                text: {
                    '*': `
                        <div class="mw-heading mw-heading3"><h3 id="Glyph_origin">Glyph origin</h3></div>
                        <p>Pictogram of a thread spool. Compare ancient forms.</p>
                        <table><tr><td><img src="//upload.wikimedia.org/wikipedia/commons/test.svg" width="80" height="80" alt="oracle form"></td></tr></table>
                        <div class="mw-heading mw-heading3"><h3 id="Etymology">Etymology</h3></div>
                        <p>Borrowed as a phonetic element in later compounds.</p>
                        <div class="mw-heading mw-heading3"><h3 id="Definitions">Definitions</h3></div>
                    `,
                },
            },
        }, '己');

        expect(info?.glyphOrigin).toEqual(['Pictogram of a thread spool. Compare ancient forms.']);
        expect(info?.etymology).toEqual(['Borrowed as a phonetic element in later compounds.']);
        expect(info?.images[0]).toMatchObject({
            src: 'https://upload.wikimedia.org/wikipedia/commons/test.svg',
            alt: 'oracle form',
        });
    });

    it('parses primary and native VTT subtitle files', () => {
        const japanese = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n今日は本を読む。\n');
        const native = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nToday I read a book.\n');

        expect(japanese).toMatchObject([{ start: 1, end: 3, text: '今日は本を読む。' }]);
        expect(native).toMatchObject([{ start: 1, end: 3, text: 'Today I read a book.' }]);
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

        expect(renderTokensToHtml('日本語', tokens, DEFAULT_SETTINGS).replace(/<[^>]+>/g, ''))
            .toBe('日本語');
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

        expect(document.querySelector('.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-known')?.textContent)
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

    it('scans native ruby bases without adding duplicate furigana', () => {
        document.body.innerHTML = '<p><ruby>事故<rt>じこ</rt></ruby>がありました。</p>';
        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['事故', 'がありました。']);
        expect(targets[0].hasNativeRuby).toBe(true);

        applyTokensToTextNode(targets[0], [{
            card: { ...card, cardState: ['known'], spelling: '事故', reading: 'じこ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'じこ', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '事故がありました。',
        }], DEFAULT_SETTINGS);

        expect(document.querySelector('ruby .jpdb-reader-word.jpdb-known')?.textContent).toBe('事故');
        expect(document.querySelectorAll('ruby .jpdb-reader-word rt')).toHaveLength(0);
    });

    it('highlights headings without injecting furigana that can be clipped by page title layouts', () => {
        document.body.innerHTML = `
            <main>
                <article>
                    <h1>新卒エンジニア、仕事終わりに勉強する</h1>
                </article>
            </main>
        `;
        const [target] = collectTextTargetsIn(document.body, 10, false);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '新卒エンジニア、仕事終わりに勉強する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(document.querySelector('h1 .jpdb-reader-word.jpdb-known')?.textContent).toBe('新卒');
        expect(document.querySelectorAll('h1 rt')).toHaveLength(0);
    });

    it('highlights clipped prose boxes without injecting furigana that can change their height', () => {
        document.body.innerHTML = `
            <div style="overflow:hidden;max-height:48px;line-height:24px">
                今日は新卒エンジニアとして仕事終わりに勉強する。
            </div>
        `;
        const [target] = collectTextTargetsIn(document.body, 10, false);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 3, end: 5, length: 2 }],
            pitchClass: '',
            sentence: '今日は新卒エンジニアとして仕事終わりに勉強する。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(document.querySelector('.jpdb-reader-word.jpdb-known')?.textContent).toBe('新卒');
        expect(document.querySelectorAll('rt')).toHaveLength(0);
    });

    it('can parse Japanese example fragments inside reader popup roots', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
                    <span>今日は、<ruby>雲<rt>くも</rt></ruby>ひとつない<ruby>青<rt>あお</rt></ruby><ruby>空<rt>ぞら</rt></ruby>だ。</span>
                </div>
            </div>
        `;
        const root = document.querySelector('.jpdb-reader-parseable')!;
        const targets = collectFragmentTextTargetsIn(root, 10, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['今日は、雲ひとつない青空だ。']);

        applyTokensToScanTarget(targets[0], [{
            card: { ...card, spelling: '青空', reading: 'あおぞら', cardState: ['known'] },
            start: 10,
            end: 12,
            length: 2,
            rubies: [{ text: 'あおぞら', start: 10, end: 12, length: 2 }],
            pitchClass: '',
            sentence: '今日は、雲ひとつない青空だ。',
        }], DEFAULT_SETTINGS);

        expect(Array.from(document.querySelectorAll('.jpdb-reader-word')).map(word => readerWordSurfaceText(word))).toEqual(['青', '空']);
    });

    it('uses NHK-style ruby-aware site parsing without duplicating native furigana', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 800,
            top: 0,
            bottom: 200,
            width: 800,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = '<main><p><ruby>東京<rt>とうきょう</rt></ruby>で高校生が本を読みました。</p></main>';
        const targets = collectSiteScanTargets(10, 'https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html') ?? [];
        rectSpy.mockRestore();
        expect(targets.map(target => target.text)).toEqual(['東京で高校生が本を読みました。']);

        const token: JPDBToken = {
            card: { ...card, cardState: ['known'], spelling: '東京', reading: 'とうきょう' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ start: 0, end: 2, length: 2, text: 'とうきょう' }],
            pitchClass: '',
            sentence: '東京で高校生が本を読みました。',
        };

        applyTokensToScanTarget(targets[0], [token], DEFAULT_SETTINGS);

        expect(document.querySelector('rt')?.textContent).toBe('とうきょう');
        expect(document.querySelectorAll('.jpdb-reader-word.jpdb-known')).toHaveLength(1);
        expect(document.querySelector('.jpdb-reader-word')?.textContent).toBe('東京');
    });

    it('scans article titles as readable page text', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 800,
            top: 0,
            bottom: 200,
            width: 800,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <main>
                <article>
                    <h1>青空の下で日本語を読む</h1>
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </article>
            </main>
        `;

        const targets = collectScanTargets(10, 'http://127.0.0.1:5174/reader-test.html');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '青空の下で日本語を読む',
            '今日は静かな喫茶店で新しい本を読みました。',
        ]);
    });

    it('does not fall back to generic scanning on NHK controls', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 800,
            top: 0,
            bottom: 200,
            width: 800,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <main>
                <a class="listen-news" href="#audio">ニュースを聞く</a>
                <button>漢字の読み方を消す</button>
            </main>
            <p>今日は本を読みます。</p>
        `;

        const targets = collectScanTargets(10, 'https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html');
        rectSpy.mockRestore();

        expect(targets).toEqual([]);
    });

    it('ports the supported site parser list from anki-jpdb.reader, including the newer NHK host', () => {
        expect(SITE_PARSER_PROFILES.map(profile => profile.id)).toEqual(expect.arrayContaining([
            'jpdb-parser',
            'jisho-parser',
            'luna-translator-parser',
            'texthooker-parser',
            'exstatic-parser',
            'readwok-parser',
            'ttsu-parser',
            'youtube-comments-parser',
            'mokuro-parser',
            'mokuro-legacy-parser',
            'wikipedia-parser',
            'satori-reader-parser',
            'nhk-parser',
            'bunpro-parser',
            'asbplayer-parser',
        ]));
        expect(getMatchingSiteParsers('https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html').map(profile => profile.id))
            .toContain('nhk-parser');
    });

    it('scans YouTube watch titles, descriptions, and comments', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 1000,
            top: 0,
            bottom: 240,
            width: 1000,
            height: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <h1><yt-formatted-string>新卒エンジニア、仕事終わりにプログラミング勉強をする！！</yt-formatted-string></h1>
                <div id="description-inline-expander">
                    <yt-attributed-string id="attributed-snippet-text">Webアプリ開発を目指して、日本語で勉強中の新卒エンジニアです！</yt-attributed-string>
                </div>
            </ytd-watch-metadata>
            <ytd-comment-view-model>
                <yt-attributed-string id="content-text">今夜も配信見なかったごめんね。</yt-attributed-string>
            </ytd-comment-view-model>
        `;

        const targets = collectScanTargets(10, 'https://www.youtube.com/watch?v=TAorfFcb8_g');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '新卒エンジニア、仕事終わりにプログラミング勉強をする！！',
            'Webアプリ開発を目指して、日本語で勉強中の新卒エンジニアです！',
            '今夜も配信見なかったごめんね。',
        ]));

        const title = targets.find(target => target.text.startsWith('新卒エンジニア'));
        expect(title).toBeTruthy();
        applyTokensToScanTarget(title!, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '新卒エンジニア、仕事終わりにプログラミング勉強をする！！',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(document.querySelector('ytd-watch-metadata h1 .jpdb-reader-word.jpdb-known')?.textContent).toBe('新卒');
        expect(document.querySelectorAll('ytd-watch-metadata h1 rt')).toHaveLength(0);
    });

    it('falls back to generic scanning for parser sites that opt into page text', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 800,
            top: 0,
            bottom: 160,
            width: 800,
            height: 160,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = '<main><p>今日は静かな部屋で本を読みます。</p></main>';

        const targets = collectScanTargets(10, 'https://www.youtube.com/watch?v=TAorfFcb8_g');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['今日は静かな部屋で本を読みます。']);
    });

    it('only enables the asbplayer parser when asbplayer subtitle roots exist', () => {
        document.body.innerHTML = '<main><p>今日は本を読みます。</p></main>';
        expect(getMatchingSiteParsers('http://127.0.0.1:5174/reader-test.html').map(profile => profile.id))
            .not.toContain('asbplayer-parser');

        document.body.innerHTML += '<div class="asbplayer-offscreen">今日は読む</div>';
        expect(getMatchingSiteParsers('http://127.0.0.1:5174/reader-test.html').map(profile => profile.id))
            .toContain('asbplayer-parser');
    });

    it('uses Jisho-specific fragment parsing for result text split across furigana spans', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 900,
            top: 0,
            bottom: 220,
            width: 900,
            height: 220,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div id="main_results">
                <div class="concept_light clearfix">
                    <div class="concept_light-readings japanese japanese_gothic" lang="ja">
                        <div class="concept_light-representation">
                            <span class="furigana"><span>きのう</span></span>
                            <span class="text">昨日</span>
                        </div>
                    </div>
                </div>
                <div class="sentence_content">
                    <ul class="japanese_sentence japanese japanese_gothic" lang="ja">
                        <li style="display:inline"><span class="furigana">きのう</span><span class="unlinked">昨日</span></li>すき焼きを食べました。
                    </ul>
                    <div class="english">I ate sukiyaki yesterday.</div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jisho.org/search/%E6%98%A8%E6%97%A5');
        rectSpy.mockRestore();

        const normalizedTargets = targets.map(target => target.text.replace(/\s+/g, ''));
        expect(normalizedTargets).toContain('昨日');
        expect(normalizedTargets).toContain('昨日すき焼きを食べました。');
        expect(normalizedTargets.some(text => text.includes('きのう昨日'))).toBe(false);
    });

    it('uses JPDB-specific fragment parsing for dictionary result pages', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 900,
            top: 0,
            bottom: 260,
            width: 900,
            height: 260,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div class="result vocabulary">
                <div class="subsection-spelling with-furigana">
                    <div class="primary-spelling"><ruby>母<rt>はは</rt></ruby></div>
                    <div>ハハ</div>
                </div>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="description">かか was used by children</div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jpdb.io/search?q=HAHA&lang=english#a');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining(['母', 'ハハ', 'かか was used by children']));
    });

    it('does not scan form labels, required badges, or compact UI chips', () => {
        document.body.innerHTML = `
            <form><label>パスワードの設定<span class="required">必須</span></label></form>
            <span class="badge">予約</span>
            <p>今日は本を読みます。</p>
        `;

        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['今日は本を読みます。']);
    });

    it('does not rewrite short centered display headings that can break page layout', () => {
        document.body.innerHTML = `
            <h2 style="text-align:center;font-size:22px;line-height:1.1">ポストに届いて、受取ラクラク</h2>
            <p>食卓やリビングなど、おうちのちょっとしたところに飾れる。</p>
        `;

        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['食卓やリビングなど、おうちのちょっとしたところに飾れる。']);
    });

    it('detects Japanese page captions near a video without site-specific selectors', () => {
        document.body.innerHTML = '<video></video><div class="lesson-player"><span>今日は花を見ます。</span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 180, right: 660, top: 380, bottom: 420, width: 480, height: 40 }),
        });

        expect(readPageCaptionText(video)).toBe('今日は花を見ます。');
    });

    it('collapses layout-only page caption line breaks before rendering the overlay', () => {
        document.body.innerHTML = '<video></video><div class="lesson-player"><span></span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('span') as HTMLElement;
        caption.textContent = 'エンジニア\nプログラミング\nする';
        Object.defineProperty(caption, 'innerText', { value: 'エンジニア\nプログラミング\nする' });
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 180, right: 660, top: 320, bottom: 420, width: 480, height: 100 }),
        });

        expect(readPageCaptionText(video)).toBe('エンジニア プログラミング する');
    });

    it('does not treat asbplayer helper DOM as page captions', () => {
        document.body.innerHTML = `
            <video></video>
            <div class="asbplayer-offscreen">新卒エンジニア仕事</div>
            <div class="asbplayer-subtitles-container-bottom"><span>新卒エンジニア仕事</span></div>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 0, right: 840, top: 0, bottom: 480, width: 840, height: 480 }),
        });
        for (const element of Array.from(document.querySelectorAll<HTMLElement>('div, span'))) {
            Object.defineProperty(element, 'innerText', { value: element.textContent ?? '' });
            Object.defineProperty(element, 'getBoundingClientRect', {
                value: () => ({ left: 100, right: 740, top: 360, bottom: 420, width: 640, height: 60 }),
            });
        }

        expect(readPageCaptionText(video)).toBe('');
    });

    it('identifies Japanese-looking YouTube cards without showing English-only cards', () => {
        document.body.innerHTML = `
            <ytd-rich-item-renderer><a id="video-title" href="/watch?v=jp" aria-label="今日は花を見ます">今日は花を見ます</a></ytd-rich-item-renderer>
            <ytd-rich-item-renderer><a id="video-title" href="/watch?v=en" aria-label="10 habits for learning Japanese">10 habits for learning Japanese</a></ytd-rich-item-renderer>
            <ytd-rich-item-renderer><a id="video-title" href="/watch?v=channel" aria-label="study with me">study with me</a><div id="channel-name">日本語チャンネル</div></ytd-rich-item-renderer>
        `;
        const cards = collectYouTubeVideoCards(document);

        expect(cards).toHaveLength(3);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[0]))).toBe(true);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[1]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[2]))).toBe(false);
    });

    it('aligns YouTube title detection with NihongoTube kana filtering', () => {
        expect(isProbablyJapaneseYouTubeText('アニメで日本語')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('東京日記')).toBe(false);
        expect(isProbablyJapaneseYouTubeText('fypシ Japanese study')).toBe(false);
        expect(isProbablyJapaneseYouTubeText('今日のアニメ感想☆')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('アニメ☆')).toBe(false);
    });

    it('collects current Shorts cards without treating the whole shelf as a video', () => {
        document.body.innerHTML = `
            <ytd-rich-shelf-renderer>
                <ytm-shorts-lockup-view-model-v2 data-case="short-en">
                    <a class="shortsLockupViewModelHostEndpoint" href="/shorts/en1">
                        <h3 class="shortsLockupViewModelHostMetadataTitle"><span>English short</span></h3>
                    </a>
                </ytm-shorts-lockup-view-model-v2>
                <ytm-shorts-lockup-view-model-v2 data-case="short-jp">
                    <a class="shortsLockupViewModelHostEndpoint" href="/shorts/jp1">
                        <h3 class="shortsLockupViewModelHostMetadataTitle"><span>日本語で話そう</span></h3>
                    </a>
                </ytm-shorts-lockup-view-model-v2>
            </ytd-rich-shelf-renderer>
        `;
        const cards = collectYouTubeVideoCards(document);

        expect(cards.map(card => card.dataset.case)).toEqual(['short-en', 'short-jp']);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[0]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[1]))).toBe(true);
    });

    it('extracts watch and Shorts ids for original-title lookups', () => {
        document.body.innerHTML = `
            <ytd-rich-item-renderer data-case="watch"><a id="video-title" href="/watch?v=abc123&t=20">Translated title</a></ytd-rich-item-renderer>
            <ytm-shorts-lockup-view-model-v2 data-case="short">
                <a class="shortsLockupViewModelHostEndpoint" href="/shorts/short123?feature=share">
                    <h3 class="shortsLockupViewModelHostMetadataTitle"><span>Translated short</span></h3>
                </a>
            </ytm-shorts-lockup-view-model-v2>
        `;
        const cards = collectYouTubeVideoCards(document);

        expect(cards.map(card => readYouTubeCardVideoId(card))).toEqual(['abc123', 'short123']);
    });

    it('normalizes structured OCR responses for image overlays', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 800, height: 1200 },
            results: [{
                text_lines: [{ content: '学校へ行く' }],
                is_vertical: true,
                box: {
                    top_left: { x: 650, y: 120 },
                    top_right: { x: 720, y: 120 },
                    bottom_right: { x: 720, y: 760 },
                    bottom_left: { x: 650, y: 760 },
                },
            }],
        });

        expect(result?.lines[0]).toMatchObject({
            text: '学校へ行く',
            vertical: true,
            box: { left: 650, top: 120, width: 70, height: 640 },
        });
    });

    it('normalizes YomiNinja scalable OCR regions from native engines', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 1000, height: 1200 },
            ocr_regions: [{
                id: '0',
                position: { left: 0, top: 0 },
                size: { width: 100, height: 100 },
                results: [{
                    id: 'line',
                    box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    text: [{
                        content: '花が咲く',
                        box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    }],
                }],
            }],
        }, 1000, 1200);

        expect(result?.lines[0]).toMatchObject({
            text: '花が咲く',
            box: { left: 200, top: 120, width: 300, height: 96 },
        });
    });

    it('positions YomiNinja OCR template regions relative to the source image', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 1000, height: 1200 },
            ocr_regions: [{
                id: 'manga-panel',
                position: { left: 0.25, top: 0.1 },
                size: { width: 0.5, height: 0.5 },
                results: [{
                    id: 'line',
                    box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    text: [{
                        content: '花が咲く',
                        box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    }],
                }],
            }],
        }, 1000, 1200);

        expect(result?.lines[0]).toMatchObject({
            text: '花が咲く',
            box: { left: 350, top: 180, width: 150, height: 48 },
        });
    });

    it('normalizes Google Cloud Vision OCR responses', () => {
        const result = normalizeOcrResult({
            responses: [{
                fullTextAnnotation: {
                    pages: [{
                        width: 800,
                        height: 600,
                        blocks: [{
                            paragraphs: [{
                                words: [{
                                    symbols: [
                                        { text: '花', boundingBox: { vertices: [{ x: 100, y: 50 }, { x: 130, y: 50 }, { x: 130, y: 90 }, { x: 100, y: 90 }] } },
                                        { text: '火', property: { detectedBreak: { type: 'LINE_BREAK' } }, boundingBox: { vertices: [{ x: 132, y: 50 }, { x: 160, y: 50 }, { x: 160, y: 90 }, { x: 132, y: 90 }] } },
                                    ],
                                }],
                            }],
                        }],
                    }],
                },
            }],
        }, 800, 600);

        expect(result?.lines[0]).toMatchObject({
            text: '花火',
            box: { left: 100, top: 50, width: 60, height: 40 },
        });
    });

    it('uses image OCR metadata as an instant no-endpoint fallback for fixtures', () => {
        const image = document.createElement('img');
        Object.defineProperty(image, 'naturalWidth', { value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { value: 1400 });
        image.dataset.ocrLines = JSON.stringify([
            { text: '今日は学校です', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 }, vertical: true },
        ]);

        expect(readFallbackOcrResult(image)?.lines[0]).toMatchObject({
            text: '今日は学校です',
            vertical: true,
            box: { left: 100, top: 280, width: 300, height: 560 },
        });
    });

    it('does not treat image alt text as OCR output', () => {
        const image = document.createElement('img');
        image.alt = '箱を開ける、お花の定期便';
        Object.defineProperty(image, 'naturalWidth', { value: 1200 });
        Object.defineProperty(image, 'naturalHeight', { value: 800 });

        expect(readFallbackOcrResult(image, false)).toBeNull();
        expect(readFallbackOcrResult(image, true)).toBeNull();
    });

    it('imports Yomitan Dexie exports with term, kanji, and metadata tables', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const progress: string[] = [];
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                tables: [
                    { name: 'dictionaries', rowCount: 2 },
                    { name: 'terms', rowCount: 1 },
                    { name: 'kanji', rowCount: 1 },
                    { name: 'termMeta', rowCount: 1 },
                ],
                data: [
                    {
                        tableName: 'dictionaries',
                        rows: [
                            { $: [1, { title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, styles: 'span[data-sc-content="part-of-speech-info"] { font-weight: bold; }' }] },
                            { $: [2, { title: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1 }] },
                        ],
                    },
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 8, dictionary: 'Jitendex' }] },
                        ],
                    },
                    {
                        tableName: 'kanji',
                        rows: [
                            { $: [1, { character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], meanings: ['read'], dictionary: 'KANJIDIC' }] },
                        ],
                    },
                    {
                        tableName: 'termMeta',
                        rows: [
                            { $: [1, { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'JPDBv2' }] },
                        ],
                    },
                ],
            },
        })], 'yomitan-dictionaries.json', { type: 'application/json' });

        const summary = await store.importFile(file, message => progress.push(message));
        expect(summary).toMatchObject({ terms: 1, kanji: 1, termMeta: 1 });
        expect(progress).toContain('Preparing to import 3 dictionary records...');
        expect(progress).toContain('Importing terms: 0 / 1 entries (0 / 3 total)...');
        expect(progress).toContain('Importing terms: 1 / 1 entries (3 / 3 total)...');
        expect(progress).toContain('Imported 3 / 3 dictionary records...');
        expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Jitendex', glossary: ['to read'] }]);
        expect(await store.lookupKanji('読む', 5)).toMatchObject([{ dictionary: 'KANJIDIC', meanings: ['read'] }]);
        expect(await store.lookupTermMeta('読む', 5)).toMatchObject([{ dictionary: 'JPDBv2', mode: 'freq' }]);
        expect(await store.dictionaryStyleCss()).toContain('part-of-speech-info');
    });

    it('imports direct Dexie rows from current Yomitan dictionary exports', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'dictionaries',
                        inbound: true,
                        rows: [
                            { title: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0 },
                        ],
                    },
                    {
                        tableName: 'terms',
                        inbound: true,
                        rows: [
                            { expression: '青空', reading: 'あおぞら', glossary: [{ tag: 'ul', content: [{ tag: 'li', content: 'blue sky' }] }], score: 10, dictionary: 'Jitendex.org [2025-12-02]' },
                        ],
                    },
                ],
            },
        })], 'yomitan-direct-dictionaries.json', { type: 'application/json' });

        await store.importFile(file);
        const entries = await store.lookup('青空', 'あおぞら', 5);
        expect(entries).toMatchObject([{ dictionary: 'Jitendex.org [2025-12-02]', expression: '青空' }]);
        expect(glossaryToHtml(entries[0].glossary[0])).toContain('blue sky');
    });

    it('sorts local frequency metadata with JPDB dictionaries first', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'termMeta',
                        rows: [
                            { $: [1, { expression: '読む', mode: 'freq', data: { frequency: 10 }, dictionary: 'BCCWJ' }] },
                            { $: [2, { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'JPDBv2㋕' }] },
                            { $: [3, { expression: '読む', mode: 'pitch', data: { pitches: [1] }, dictionary: 'Pitch' }] },
                        ],
                    },
                ],
            },
        })], 'freq.json', { type: 'application/json' });

        await store.importFile(file);
        const entries = await store.lookupTermMeta('読む', 5, [
            { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 0 },
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 5 },
            { name: 'Pitch', alias: 'Pitch', enabled: true, priority: 1 },
        ]);
        expect(entries.map(entry => entry.dictionary)).toEqual(['JPDBv2㋕', 'BCCWJ', 'Pitch']);
    });

    it('loads new-tab dictionary words from top frequency data or common JMdict-style tags', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const zip = new JSZip();
        zip.file('index.json', JSON.stringify({ title: 'Tiny JMdict', format: 3 }));
        zip.file('term_bank_1.json', JSON.stringify([
            ['読む', 'よむ', 'common', '', 10, ['to read'], 1, 'ichi1'],
            ['珍語', 'ちんご', '', '', 0, ['rare word'], 2, ''],
            ['行く', 'いく', '', '', 8, ['to go'], 3, 'news1'],
        ]));
        await store.importFile(new File([await zip.generateAsync({ type: 'blob' })], 'tiny-jmdict.zip', { type: 'application/zip' }));

        const common = await store.listRandomTopTerms(10, 2000);
        expect(common.map(entry => entry.expression).sort()).toEqual(['行く', '読む']);

        const freq = new JSZip();
        freq.file('index.json', JSON.stringify({ title: 'Tiny Frequency', format: 3 }));
        freq.file('term_meta_bank_1.json', JSON.stringify([
            ['読む', 'freq', { frequency: 400 }],
            ['珍語', 'freq', { frequency: 3000 }],
        ]));
        const frequencySummary = await store.importFile(new File([await freq.generateAsync({ type: 'blob' })], 'tiny-frequency.zip', { type: 'application/zip' }));
        expect(frequencySummary.dictionaryTypes).toMatchObject({ 'Tiny Frequency': 'frequency' });

        const top = await store.listRandomTopTerms(10, 2000);
        expect(top).toHaveLength(1);
        expect(top[0]).toMatchObject({ expression: '読む', jpdbFrequency: 400 });
    });

    it('downloads and imports a recommended dictionary ZIP via userscript requests', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const zip = new JSZip();
        zip.file('index.json', JSON.stringify({ title: 'Tiny Dictionary', format: 3, revision: 'test' }));
        zip.file('styles.css', 'ul[data-sc-content="glossary"] { padding-left: 1em; }');
        zip.file('term_bank_1.json', JSON.stringify([
            ['読む', 'よむ', '', '', 1, ['to read'], 1, ''],
        ]));
        const blob = await zip.generateAsync({ type: 'blob' });
        vi.stubGlobal('GM_xmlhttpRequest', (details: {
            onload?: (response: { status: number; response: Blob }) => void;
        }) => details.onload?.({ status: 200, response: blob }));

        try {
            const summary = await store.importFromUrl('https://example.test/tiny.zip', 'tiny.zip');
            const dictionaries = (await store.summary()).dictionaries;

            expect(summary).toMatchObject({ dictionaries: ['Tiny Dictionary'], terms: 1 });
            expect(dictionaries[0]).toMatchObject({ title: 'Tiny Dictionary', revision: 'test', downloadUrl: 'https://example.test/tiny.zip' });
            expect(await store.dictionaryStyleCss()).toContain('data-sc-content');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('removes one imported dictionary without clearing the others', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();

        const firstZip = new JSZip();
        firstZip.file('index.json', JSON.stringify({ title: 'Tiny Terms', format: 3 }));
        firstZip.file('term_bank_1.json', JSON.stringify([
            ['読む', 'よむ', '', '', 1, ['to read'], 1, ''],
        ]));
        const secondZip = new JSZip();
        secondZip.file('index.json', JSON.stringify({ title: 'Tiny Kanji', format: 3 }));
        secondZip.file('kanji_bank_1.json', JSON.stringify([
            ['読', 'ドク', 'よ.む', '', ['read'], {}, {}],
        ]));

        await store.importFile(new File([await firstZip.generateAsync({ type: 'blob' })], 'tiny-terms.zip', { type: 'application/zip' }));
        await store.importFile(new File([await secondZip.generateAsync({ type: 'blob' })], 'tiny-kanji.zip', { type: 'application/zip' }));
        await store.deleteDictionary('Tiny Terms');

        const summary = await store.summary();
        expect(summary.dictionaries.map(item => item.title)).toEqual(['Tiny Kanji']);
        expect(summary.terms).toBe(0);
        expect(summary.kanji).toBe(1);
        expect(await store.lookup('読む', 'よむ', 5)).toEqual([]);
        expect(await store.lookupKanji('読', 5)).toMatchObject([{ dictionary: 'Tiny Kanji' }]);
    });

    it('downloads recommended dictionary ZIPs via the GM object userscript request API', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const zip = new JSZip();
        zip.file('index.json', JSON.stringify({ title: 'Tiny GM Dictionary', format: 3, revision: 'test' }));
        zip.file('term_bank_1.json', JSON.stringify([
            ['書く', 'かく', '', '', 1, ['to write'], 1, ''],
        ]));
        const blob = await zip.generateAsync({ type: 'blob' });
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({ status: 200, response: blob }),
        });

        try {
            const summary = await store.importFromUrl('https://example.test/tiny-gm.zip', 'tiny-gm.zip');
            const dictionaries = (await store.summary()).dictionaries;

            expect(summary).toMatchObject({ dictionaries: ['Tiny GM Dictionary'], terms: 1 });
            expect(dictionaries[0]).toMatchObject({ title: 'Tiny GM Dictionary', revision: 'test', downloadUrl: 'https://example.test/tiny-gm.zip' });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
