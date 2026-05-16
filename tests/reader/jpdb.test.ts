import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { isYomuHostedAppUrl } from '../../src/reader/app-pages';
import { AnkiConnectClient, buildYomuAnkiFields, YOMU_MODEL_FIELDS, type AnkiLookupResult } from '../../src/reader/anki';
import { AudioPlayer, findAudioUrl, findAudioUrls, formatAudioUrl, isUnavailableJapanesePod101Audio, ShuffledAudioDeck } from '../../src/reader/audio';
import { positionPopover } from '../../src/reader/browser-ui';
import { CardActionController } from '../../src/reader/card-action-controller';
import { CardPopoverRenderer } from '../../src/reader/card-popover-renderer';
import { CardRenderDataLoader } from '../../src/reader/card-render-data';
import { createAudioPreviewCard } from '../../src/reader/card-utils';
import { STUDY_GRAMMAR_SOURCE_ID, STUDY_TOOLS_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID } from '../../src/reader/constants';
import { deinflectJapaneseTerm, termRulesMatch } from '../../src/reader/deinflect';
import { renderJpdbDefinitionSource, renderLocalDefinitionSourcesSection } from '../../src/reader/definition-source-render';
import { DictionarySourceStateController } from '../../src/reader/dictionary-source-state';
import { applyTokensToScanTarget, applyTokensToTextNode, collectFragmentTextTargetsIn, collectTextTargetsIn, nearestReadableSentenceForElement, readerWordSurfaceText, renderTokensToHtml, unwrapReaderWords } from '../../src/reader/dom';
import { FloatingButtonController } from '../../src/reader/floating-button';
import { buildHanabiraGrammarIndex, detectHanabiraGrammarHintsFromIndex } from '../../src/reader/hanabira-grammar';
import { ImmersionKitClient } from '../../src/reader/immersion-kit';
import { ImmersionPopoverController } from '../../src/reader/immersion-popover-controller';
import { JpdbClient, splitJapaneseSentences } from '../../src/reader/jpdb';
import { jpdbVocabularyToCards } from '../../src/reader/jpdb-parser';
import { isKanjiReviewBack, isKanjiReviewFront, parseJpdbReviewCardValue } from '../../src/reader/jpdb-page-targets';
import { JpdbKanjiClient, parseJpdbKanjiHtml, visibleJpdbKanjiActions } from '../../src/reader/jpdb-kanji';
import { JpdbVocabularyClient, parseJpdbVocabularyHtml } from '../../src/reader/jpdb-vocabulary';
import { JpdbPublicPitchClient, parseJpdbPublicPitchHtml } from '../../src/reader/jpdb-public-pitch';
import { buildKanjiFacts, buildKanjiOriginGraph, parseKanjiMapInfo } from '../../src/reader/kanji-origin';
import { parseKanjiVGSvg } from '../../src/reader/kanjivg';
import { Logger } from '../../src/reader/logger';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationMayContainJapaneseText } from '../../src/reader/mutation-scan';
import { buildNewTabPalette, isYomuNewTabUrl, resolveNewTabBrandAssets } from '../../src/reader/new-tab';
import { ObjectUrlCache } from '../../src/reader/object-url-cache';
import { createPageMediaUrl } from '../../src/reader/page-media-url';
import { normalizeOcrResult, readFallbackOcrResult } from '../../src/reader/ocr';
import { installSettingsDrawerHandle, installSheetHandle, SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, SHEET_HEIGHT_STORAGE_KEY } from '../../src/reader/popover-shell';
import { formatPartOfSpeech } from '../../src/reader/pos';
import { fetchWithCorsFallbacks, proxyUrlCandidates } from '../../src/reader/proxy-fetch';
import { formatMetaFrequency, groupTermEntriesByHeadword, mergeSimilarKanjiWords, renderJpdbKanjiInfo, renderKanjiOrigins, renderPitch, renderRtkInfo, summarizeLearnerGlossary } from '../../src/reader/popup-render';
import { RECOMMENDED_JAPANESE_DICTIONARIES, findRecommendedDictionary } from '../../src/reader/recommended-dictionaries';
import { ReaderApp } from '../../src/reader/main';
import { ReaderParser, fallbackLookupTermAtOffset } from '../../src/reader/reader-parser';
import { parseRtkSearchIndex } from '../../src/reader/rtk';
import { DEFAULT_AUDIO_SOURCES, DEFAULT_SETTINGS, applyUrlBootstrapSettings, defaultDictionaryLookupLinks, effectiveFuriganaMode, effectiveReaderColorSource, effectiveSubtitleColorSource, effectiveWordHighlightMode, loadSettings, matchesShortcut, normalizeAudioSources, normalizeDictionaryLookupLinks, normalizeOcrProvider, sanitizeAccentColor, saveSettings } from '../../src/reader/settings';
import { installSourceRowDrag, localizeSettingsForm, readDictionaryLookupLinks, readFormSettings, renderAudioSourceEditor, renderDictionaryLookupLinkEditor, renderDictionarySourceRows, renderKanjiSourceRows, renderRecommendedDictionaries, renderSettingsForm, updateDictionaryLookupLinkEditor } from '../../src/reader/settings-form';
import { SITE_PARSER_PROFILES, collectScanTargets, collectSiteScanTargets, getMatchingSiteParsers } from '../../src/reader/site-parsers';
import { KANJI_UCHISEN_SOURCE_ID, definitionSourceRows, kanjiSourceRows, orderedDefinitionSourceIds, orderedKanjiSourceIds } from '../../src/reader/source-sections';
import { detectGrammarHints, renderGrammarHints } from '../../src/reader/study-tools';
import { READER_CSS } from '../../src/reader/styles';
import { normalizeSubtitleCues, parseSubtitleText } from '../../src/reader/subtitle-cues';
import { computeSubtitleDrawerLayout } from '../../src/reader/subtitle-layout';
import { collectPageSubtitleSources } from '../../src/reader/subtitle-sources';
import { createSubtitleVideoInsetAdapter } from '../../src/reader/subtitle-video-inset';
import { getYouTubeCaptionTracks, loadYouTubeTrackCues } from '../../src/reader/subtitle-youtube';
import { installUchisenCarousel, loadUchisenImages, parseUchisenImages } from '../../src/reader/uchisen';
import { readPageCaptionText } from '../../src/reader/subtitle-dom-captions';
import { compareSubtitleTrackOptions, isEnglishSubtitleTrack, isJapaneseSubtitleTrack, shouldReplaceWaitingNativeTrack } from '../../src/reader/subtitle-track-metadata';
import { renderSubtitlePrimary } from '../../src/reader/subtitle-rendering';
import { planTranscriptHydrationIndexes } from '../../src/reader/subtitle-transcript-hydration';
import { YomitanDictionaryStore, glossaryToHtml, glossaryToText, parseYomitanSettingsExport, renderDictionaryScopedStyles } from '../../src/reader/yomitan';
import type { AudioSourceSetting, JPDBCard, JPDBToken } from '../../src/reader/types';
import { yomitanZipBlob } from './zip-fixture';
import { isAllowedPublicProxyTarget } from '../../workers/jpdb-public-proxy/src/index';

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
const READER_WORD_CSS = READER_CSS || readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
const IMMERSION_STUDY_CSS = readFileSync('src/reader/styles/immersion-study.css', 'utf8');
const LOCAL_DICTIONARY_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');
const KANJI_CSS = readFileSync('src/reader/styles/kanji.css', 'utf8');
const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');
const SUBTITLES_YOUTUBE_CSS = readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8');

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

function dispatchPointerEvent(target: EventTarget, type: string, clientY: number, pointerType = 'mouse'): void {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        button: { value: 0 },
        clientY: { value: clientY },
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
    });
    target.dispatchEvent(event);
}

function dispatchTouchEvent(target: EventTarget, type: string, clientY: number, identifier = 1): void {
    const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
    const touch = { clientY, identifier } as Touch;
    const touchList = [touch] as unknown as TouchList & Touch[];
    Object.defineProperty(touchList, 'item', {
        value: (index: number) => touchList[index] ?? null,
    });
    Object.defineProperties(event, {
        changedTouches: { value: touchList },
        targetTouches: { value: type === 'touchend' || type === 'touchcancel' ? [] : touchList },
        touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : touchList },
    });
    target.dispatchEvent(event);
}

function mockSourceRowRects(rows: HTMLElement[], rowHeight = 40, rowGap = 8): void {
    rows.forEach((row, index) => {
        const top = index * (rowHeight + rowGap);
        row.getBoundingClientRect = () => ({
            x: 0,
            y: top,
            top,
            left: 0,
            right: 300,
            bottom: top + rowHeight,
            width: 300,
            height: rowHeight,
            toJSON: () => ({}),
        });
    });
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

function withImmediateAnimationFrame<T>(callback: () => T): T {
    const spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frame => {
        frame(0);
        return 1;
    });
    try {
        return callback();
    } finally {
        spy.mockRestore();
    }
}

function mockFloatingButtonRects(left = 700, top = 500, width = 52, height = 52): () => void {
    const spy = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: HTMLButtonElement) {
        const styleLeft = Number.parseFloat(this.style.left);
        const styleTop = Number.parseFloat(this.style.top);
        const x = Number.isFinite(styleLeft) ? styleLeft : left;
        const y = Number.isFinite(styleTop) ? styleTop : top;
        return new DOMRect(x, y, width, height);
    });
    return () => spy.mockRestore();
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
    it('adds cards to JPDB FORQ without parsing the web prioritize response as JSON', async () => {
        const client = new JpdbClient(() => 'token');
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = String(url);
            if (href === 'https://jpdb.io/prioritize') {
                return {
                    status: 200,
                    ok: true,
                    text: async () => '<!doctype html><html></html>',
                };
            }
            if (href === 'https://jpdb.io/api/v1/lookup-vocabulary') {
                return {
                    status: 200,
                    ok: true,
                    text: async () => JSON.stringify({
                        vocabulary_info: [[1, 2, 3, '食べる', 'たべる', 100, ['v1'], [['to eat']], [['v1']], ['new'], ['LHH']]],
                    }),
                };
            }
            throw new Error(`Unexpected URL: ${href}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const addedCard = { ...card };
            await expect(client.addToDeck('forq', addedCard)).resolves.toBeUndefined();
            expect(addedCard.cardState).toEqual(['new']);
            expect(fetchMock).toHaveBeenCalledWith('https://jpdb.io/prioritize', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ v: 1, s: 2, origin: '/' }),
            }));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('routes hosted JPDB API calls through the configured proxy before direct fetch', async () => {
        const proxyUrl = 'https://yomu-proxy.example/fetch';
        const target = 'https://jpdb.io/api/v1/list-user-decks';
        const client = new JpdbClient(() => 'token', () => proxyUrl);
        const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            expect(String(url)).toBe(`${proxyUrl}?url=${encodeURIComponent(target)}`);
            expect(init?.method).toBe('POST');
            expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token');
            return {
                status: 200,
                ok: true,
                text: async () => JSON.stringify({ decks: [['1', 'Main']] }),
            };
        });
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
            pathname: '/yomu-reader/newtab/index.html',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(client.listDecks()).resolves.toEqual([{ id: '1', name: 'Main' }]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

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
        const normalizedCss = READER_WORD_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-reader-word {');
        expect(normalizedCss).toContain('text-decoration-line: underline !important;');
        expect(normalizedCss).toContain('text-decoration-color: var( --jpdb-reader-word-underline, transparent ) !important;');
        expect(normalizedCss).toContain('display: inline;');
        expect(normalizedCss).toContain('.jpdb-reader-word::after { content: none; }');
        expect(normalizedCss).toContain('.jpdb-reader-word.jpdb-reader-has-furi { line-height: 1.85; }');
        expect(normalizedCss).toContain('.jpdb-reader-word ruby {');
        expect(normalizedCss).toContain('display: ruby;');
        expect(normalizedCss).toContain('.jpdb-reader-word rt.jpdb-reader-furi {');
        expect(normalizedCss).toContain('display: ruby-text;');
        expect(normalizedCss).toContain('text-decoration-line: inherit !important;');
        expect(normalizedCss).toContain('text-decoration-color: inherit !important;');
        expect(normalizedCss).toContain('--jpdb-reader-source-jpdb-soft: var(--jpdb-reader-jpdb-soft, transparent);');
        expect(normalizedCss).toContain('--jpdb-reader-source-status-decoration: var(--jpdb-reader-status-color, transparent);');
        expect(normalizedCss).toContain('--jpdb-reader-source-pitch-decoration: var(--jpdb-reader-pitch-color, var(--jpdb-reader-pitch-unknown, #94a3b8));');
        expect(normalizedCss).toContain('.jpdb-reader-word:is(.jpdb-new, .jpdb-suspended, .jpdb-not-in-deck) { --jpdb-reader-jpdb-color: var(--jpdb-reader-state-new, #58a6ff); --jpdb-reader-jpdb-soft: var(--jpdb-reader-state-new-soft, rgba(88, 166, 255, 0.16)); }');
        expect(normalizedCss).toContain('.jpdb-reader-word-highlight-status { --jpdb-reader-word-highlight: var(--jpdb-reader-source-status-soft, transparent); }');
        expect(normalizedCss).toContain(':is(.jpdb-reader-word-underline-status, .jpdb-reader-word-underline-jpdb, .jpdb-reader-word-underline-anki, .jpdb-reader-word-underline-pitch) .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-word-decoration, transparent); }');
        expect(normalizedCss).toContain('.jpdb-ocr-line .jpdb-reader-word { background: transparent !important; --jpdb-reader-word-underline: transparent; text-decoration: none !important;');
    });

    it('resizes sheet popovers continuously when dragging the handle', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);
        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        const down = Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 220, pointerId: 7 });
        const move = Object.assign(new Event('pointermove', { bubbles: true }), { clientY: 140, pointerId: 7 });
        const up = Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 140, pointerId: 7 });
        handle.dispatchEvent(down);
        handle.dispatchEvent(move);

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('618px');
        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-drag-up')).toBe('');
        expect(popover.style.transform).toBe('');

        handle.dispatchEvent(up);

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('618px');
        expect(handle.getAttribute('aria-valuenow')).toBe('618');
        expect(localStorage.getItem(SHEET_HEIGHT_STORAGE_KEY)).toBe('0.8047');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('dismisses sheet popovers when tapping the handle', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);
        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        const down = Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 120, pointerId: 9 });
        const up = Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 120, pointerId: 9 });
        handle.dispatchEvent(down);
        handle.dispatchEvent(up);

        expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('resizes full-height sheet popovers downward without dismissing', () => {
        localStorage.setItem(SHEET_HEIGHT_STORAGE_KEY, JSON.stringify(1));
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet jpdb-reader-sheet-expanded';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);
        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: 120, pointerId: 10 }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 320, pointerId: 10 }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientY: 320, pointerId: 10 }));

        expect(popover.classList.contains('jpdb-reader-sheet-expanded')).toBe(false);
        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('568px');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('resizes sheet popovers through touch drag events on iPhone-style WebKit', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);
        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle')!;
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        dispatchTouchEvent(handle, 'touchstart', 220, 3);
        dispatchTouchEvent(document, 'touchmove', 136, 3);
        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('622px');

        dispatchTouchEvent(document, 'touchend', 136, 3);

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('622px');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('resets sheet viewport sizing when the visual viewport changes', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
        const viewport = new EventTarget() as VisualViewport;
        Object.defineProperties(viewport, {
            height: { configurable: true, writable: true, value: 640 },
            width: { configurable: true, writable: true, value: 390 },
            offsetLeft: { configurable: true, writable: true, value: 0 },
            offsetTop: { configurable: true, writable: true, value: 0 },
            pageLeft: { configurable: true, writable: true, value: 0 },
            pageTop: { configurable: true, writable: true, value: 0 },
            scale: { configurable: true, writable: true, value: 1 },
        });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

        try {
            const popover = document.createElement('div');
            popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
            popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
            popover.style.left = '24px';
            popover.style.maxHeight = '240px';
            document.body.append(popover);

            installSheetHandle(popover, vi.fn());

            expect(popover.style.left).toBe('');
            expect(popover.style.maxHeight).toBe('');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-viewport-height')).toBe('640px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-collapsed-height')).toBe('448px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('448px');

            popover.style.maxHeight = '220px';
            (viewport as unknown as { height: number }).height = 812;
            viewport.dispatchEvent(new Event('resize'));

            expect(popover.style.maxHeight).toBe('');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-viewport-height')).toBe('812px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-collapsed-height')).toBe('568px');
            expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('568px');
        } finally {
            if (viewportDescriptor) Object.defineProperty(window, 'visualViewport', viewportDescriptor);
            else delete (window as unknown as Record<string, unknown>).visualViewport;
            localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        }
    });

    it('keeps sheet popover drags active after the pointer leaves the handle', () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);
        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();
        const dismiss = vi.fn();

        installSheetHandle(popover, dismiss);

        handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: 220, pointerId: 12 }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 136, pointerId: 12 }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientY: 136, pointerId: 12 }));

        expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('622px');
        expect(dismiss).not.toHaveBeenCalled();
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
    });

    it('restores sheet handle button state when popover content is re-rendered', async () => {
        localStorage.removeItem(SHEET_HEIGHT_STORAGE_KEY);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);

        installSheetHandle(popover, vi.fn());
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div><p>updated</p>';
        await Promise.resolve();

        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle');
        expect(handle?.getAttribute('role')).toBe('button');
        expect(handle?.getAttribute('tabindex')).toBe('0');
        expect(handle?.getAttribute('aria-expanded')).toBe('false');
    });

    it('resizes the mobile settings drawer from its top handle and stores the chosen height', () => {
        localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
        const drawer = document.createElement('form');
        drawer.className = 'jpdb-reader-settings';
        drawer.innerHTML = `
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>よむ Settings</h2>
            </div>
            <div class="jpdb-reader-settings-scroll"></div>
            <div class="footer"></div>
        `;
        document.body.append(drawer);
        const handle = drawer.querySelector<HTMLElement>('.jpdb-reader-settings-drag-handle')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();

        installSettingsDrawerHandle(drawer);

        expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-height')).toBe('676px');
        expect(handle.getAttribute('aria-valuenow')).toBe('676');

        handle.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: 120, pointerId: 17 }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 248, pointerId: 17 }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientY: 248, pointerId: 17 }));

        expect(drawer.style.getPropertyValue('--jpdb-reader-settings-drawer-height')).toBe('548px');
        expect(handle.getAttribute('aria-valuenow')).toBe('548');
        expect(localStorage.getItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY)).toBe('0.7135');
        localStorage.removeItem(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY);
    });

    it('renders a mobile settings drawer handle for resizing', () => {
        const html = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        expect(html).toContain('jpdb-reader-settings-drag-handle');
        expect(SETTINGS_CSS).toContain('--jpdb-reader-settings-drawer-height');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-settings-drag-handle');
    });

    it('leaves source summary clicks to native details toggling even when tracking is installed twice', () => {
        const popover = document.createElement('div');
        popover.innerHTML = `
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source-state-key="definition-source:test" data-source-initial-open="true" open>
                <summary class="jpdb-reader-local-title">Test</summary>
                <p>Definition</p>
            </details>
        `;
        const controller = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange: vi.fn(),
        });

        controller.installTracking(popover);
        controller.installTracking(popover);

        const summary = popover.querySelector<HTMLElement>('summary')!;
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        summary.dispatchEvent(click);

        expect(click.defaultPrevented).toBe(false);
    });

    it('still blocks empty immersion source summary toggles', () => {
        const popover = document.createElement('div');
        popover.innerHTML = `
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source-state-key="definition-source:immersion" data-source-initial-open="false" data-immersion-empty="true">
                <summary class="jpdb-reader-local-title">Immersion</summary>
            </details>
        `;
        const controller = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange: vi.fn(),
        });

        controller.installTracking(popover);

        const summary = popover.querySelector<HTMLElement>('summary')!;
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        summary.dispatchEvent(click);

        expect(click.defaultPrevented).toBe(true);
    });

    it('renders the mining drawer affordance as a bar instead of text', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
        };
        const renderer = new CardPopoverRenderer({
            getSettings: () => settings,
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });

        const html = renderer.render(card, '食べる。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        expect(html).toContain('jpdb-reader-mining-drawer-handle');
        expect(html).toContain('aria-label="Show mining actions"');
        expect(html).not.toContain('>+</button>');
        expect(KANJI_CSS).toContain('.jpdb-reader-mining-collapse::before');
    });

    it('hides JPDB review buttons when JPDB writes are disabled but keeps Anki review available', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                jpdbMiningEnabled: false,
                ankiEnabled: true,
                enableReviews: true,
            }),
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });
        const baseData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        };

        const jpdbOnly = renderer.render(card, '食べる。', 'modal', {
            ...baseData,
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        });
        expect(jpdbOnly).not.toContain('data-action="grade"');
        expect(jpdbOnly).toContain('data-action="anki"');

        const ankiBacked = renderer.render(card, '食べる。', 'modal', {
            ...baseData,
            ankiLookup: {
                state: 'due',
                notes: [],
                primary: {
                    noteId: 10,
                    primaryCardId: 20,
                    cardIds: [20],
                    state: 'due',
                    deckNames: ['Yomu'],
                    modelName: 'Yomu Japanese',
                    fields: {},
                    tags: [],
                    reps: 1,
                    lapses: 0,
                },
            },
        });
        expect(ankiBacked).toContain('data-action="grade"');
        expect(ankiBacked).toContain('data-anki-card-id="20"');
        expect(ankiBacked).not.toContain('jpdb-reader-actions-has-mining');
    });

    it('does not submit JPDB review grades when JPDB writes are disabled', async () => {
        const reviewCard = vi.fn(async () => undefined);
        const answerCard = vi.fn(async () => undefined);
        const controller = new CardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                jpdbMiningEnabled: false,
                enableReviews: true,
            }),
            jpdb: { reviewCard } as unknown as JpdbClient,
            anki: { answerCard } as unknown as AnkiConnectClient,
            dictionaries: {} as unknown as YomitanDictionaryStore,
            isJpdbBackedCard: () => true,
            resolveMiningContext: vi.fn(),
            showCard: vi.fn(),
            getActivePopoverAnchor: () => undefined,
            getActivePopoverMode: () => undefined,
            showSettings: vi.fn(),
            playAudio: vi.fn(),
            playSentenceAudio: vi.fn(),
            detectGrammarHints: vi.fn(),
            parsePopoverJapanese: vi.fn(),
            toast: vi.fn(),
        });

        await expect(controller.reviewGrade('okay', card)).rejects.toThrow('JPDB actions are disabled');
        expect(reviewCard).not.toHaveBeenCalled();

        await expect(controller.reviewGrade('okay', card, undefined, { ankiCardId: 20 })).resolves.toBeUndefined();
        expect(answerCard).toHaveBeenCalledWith(20, 'okay');
    });

    it('opens and closes mining controls from the drawer bar by click or drag', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.innerHTML = `
            <div class="jpdb-reader-actions jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed">
                <div class="jpdb-reader-actions-gutter">
                    <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="Show mining actions" aria-label="Show mining actions"></button>
                </div>
                <div class="jpdb-reader-mining-details"></div>
            </div>
        `;
        document.body.append(popover);
        const internals = app as unknown as {
            installCardPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void;
        };
        internals.installCardPopoverHandlers(popover, card, undefined, undefined, 'modal');

        const actions = popover.querySelector<HTMLElement>('.jpdb-reader-actions')!;
        const handle = popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();

        handle.click();
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(false);
        expect(handle.getAttribute('aria-expanded')).toBe('true');
        expect(handle.textContent).toBe('');

        const dragDownStart = Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 180, pointerId: 11 });
        const dragDownMove = Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 226, pointerId: 11 });
        const dragDownEnd = Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 226, pointerId: 11 });
        handle.dispatchEvent(dragDownStart);
        handle.dispatchEvent(dragDownMove);
        handle.dispatchEvent(dragDownEnd);
        handle.click();
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
        expect(handle.getAttribute('aria-expanded')).toBe('false');

        const dragUpStart = Object.assign(new Event('pointerdown', { bubbles: true }), { clientY: 226, pointerId: 12 });
        const dragUpMove = Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientY: 178, pointerId: 12 });
        const dragUpEnd = Object.assign(new Event('pointerup', { bubbles: true }), { clientY: 178, pointerId: 12 });
        handle.dispatchEvent(dragUpStart);
        handle.dispatchEvent(dragUpMove);
        handle.dispatchEvent(dragUpEnd);
        handle.click();
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(false);
        expect(handle.getAttribute('aria-expanded')).toBe('true');
    });

    it('defaults word highlight colors to pitch when mining status is not configured', () => {
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, jpdbMiningEnabled: false })).toBe('pitch');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, apiKey: 'key', ankiEnabled: false, jpdbMiningEnabled: true })).toBe('status');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, apiKey: 'key', ankiEnabled: false, jpdbMiningEnabled: false })).toBe('pitch');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, wordHighlightMode: 'status', apiKey: '', ankiEnabled: false, jpdbMiningEnabled: false })).toBe('status');
        expect(effectiveWordHighlightMode({ ...DEFAULT_SETTINGS, wordHighlightMode: 'off' })).toBe('off');
        expect(effectiveReaderColorSource({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, jpdbMiningEnabled: false }, 'auto')).toBe('pitch');
        expect(effectiveReaderColorSource({ ...DEFAULT_SETTINGS, wordHighlightMode: 'status' }, 'auto')).toBe('status');
        expect(effectiveReaderColorSource(DEFAULT_SETTINGS, 'anki')).toBe('anki');
        expect(effectiveSubtitleColorSource({ ...DEFAULT_SETTINGS, wordHighlightMode: 'status' }, 'auto')).toBe('jpdb');
        expect(effectiveSubtitleColorSource({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, jpdbMiningEnabled: false }, 'auto')).toBe('pitch');
        expect(effectiveSubtitleColorSource(DEFAULT_SETTINGS, 'status')).toBe('status');

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
        expect(DEFAULT_SETTINGS.wordHighlightColorSource).toBe('auto');
        expect(DEFAULT_SETTINGS.wordUnderlineColorSource).toBe('auto');
        expect(DEFAULT_SETTINGS.wordTextColorSource).toBe('off');
        expect(DEFAULT_SETTINGS.subtitleTextColorSource).toBe('auto');
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

    it('uses a common kanji and kana pair for built-in audio previews', () => {
        const previewCard = createAudioPreviewCard();

        expect(previewCard).toMatchObject({
            spelling: '読む',
            reading: 'よむ',
            source: 'fallback',
        });
        expect(formatAudioUrl('http://x.test/?term={term}&reading={reading}', previewCard))
            .toBe('http://x.test/?term=%E8%AA%AD%E3%82%80&reading=%E3%82%88%E3%82%80');
    });

    it('recognizes the Yomu new tab URL and adjusts accent colors for contrast', () => {
        expect(isYomuNewTabUrl('https://hrussellzfac023.github.io/yomu-reader/newtab/')).toBe(true);
        expect(isYomuNewTabUrl('https://example.com/?yomu-newtab=1')).toBe(true);
        expect(isYomuNewTabUrl('https://example.com/reader')).toBe(false);
        expect(resolveNewTabBrandAssets('https://hrussellzfac023.github.io/yomu-reader/newtab/')).toEqual({
            homeHref: '/yomu-reader/',
            iconSrc: '/yomu-reader/yomu-icon.svg',
        });
        expect(resolveNewTabBrandAssets('http://localhost:5173/newtab/')).toEqual({
            homeHref: '/',
            iconSrc: '/yomu-icon.svg',
        });
        expect(buildNewTabPalette('#ffb6c1').accentText).not.toBe('#ffb6c1');
    });

    it('recognizes hosted Yomu app pages where first-run welcome should stay hidden', () => {
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/')).toBe(true);
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/video-player/')).toBe(true);
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/video-player/index.html')).toBe(true);
        expect(isYomuHostedAppUrl('https://hrussellzfac023.github.io/yomu-reader/newtab/index.html')).toBe(true);
        expect(isYomuHostedAppUrl('http://127.0.0.1:5175/yomu-reader/')).toBe(true);
        expect(isYomuHostedAppUrl('https://example.com/japanese/article')).toBe(false);
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

    it('keeps Immersion Kit thumbnails from collapsing in short frames', () => {
        expect(IMMERSION_STUDY_CSS).toContain('--jpdb-reader-example-media-max-height: clamp(150px, calc(100vh - 300px), 260px);');
        expect(IMMERSION_STUDY_CSS).toContain('--jpdb-reader-example-media-max-height: clamp(130px, calc(100vh - 300px), 230px);');
        expect(IMMERSION_STUDY_CSS).not.toContain('max-height: min(260px, calc(100vh - 300px));');
    });

    it('styles structured dictionary form-valid cells without inventing replacement symbols', () => {
        expect(LOCAL_DICTIONARY_CSS).toContain('.jpdb-reader-local-glossary .gloss-sc-td[data-sc-class="form-valid"]');
        expect(LOCAL_DICTIONARY_CSS).toContain('.jpdb-reader-local-glossary [data-sc-class="form-valid"]');
        expect(LOCAL_DICTIONARY_CSS).not.toContain('span[data-sc-class="form-valid"]:empty::before');
        expect(LOCAL_DICTIONARY_CSS).not.toContain('content: "✓";');
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
                controller.install(settings, save, vi.fn());
            }));

            const button = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(button?.style.left).toBe('640px');
            expect(button?.style.top).toBe('420px');
            expect(settings.puckPositionX).toBe(640);
            expect(settings.puckPositionY).toBe(420);
            expect(save).not.toHaveBeenCalled();
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
        vi.stubGlobal('GM_setValue', gmSetValue);
        const settings = {
            ...DEFAULT_SETTINGS,
            puckPositionX: undefined,
            puckPositionY: undefined,
        };

        try {
            withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
                controller.install(settings, () => void saveSettings(settings), vi.fn());
            }));
            const button = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
            expect(button).not.toBeNull();
            button?.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 710, clientY: 510, bubbles: true }));
            button?.dispatchEvent(new MouseEvent('pointermove', { clientX: 810, clientY: 610, bubbles: true }));
            button?.dispatchEvent(new MouseEvent('pointerup', { clientX: 810, clientY: 610, bubbles: true }));

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

    it('defaults legacy settings without a proxy URL to the hosted public proxy', async () => {
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

    it('keeps popover mode usable when saved settings request Japanese copy', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja',
            popupMode: 'popover',
        }, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');
        const popupMode = form.querySelector<HTMLSelectElement>('select[name="popupMode"]');
        const settings = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(form.lang).toBe('en');
        expect(popupMode?.value).toBe('popover');
        expect(Array.from(popupMode?.options ?? []).find(option => option.value === 'popover')?.textContent).toBe('Popover');
        expect(settings.interfaceLanguage).toBe('ja');
        expect(settings.popupMode).toBe('popover');
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

    it('plays text-to-speech sources from the term or kana reading field', async () => {
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
            getVoices: vi.fn(() => [{ name: 'Kyoko', lang: 'ja-JP', default: true }] as SpeechSynthesisVoice[]),
            speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
                spoken.push(utterance.text);
                utterance.onend?.();
            }),
        });

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

    it('uses direct media playback for tapped term audio on iPad Safari', async () => {
        const played: string[] = [];
        const restoreBrowser = mockAppleMobileBrowser();
        const restoreMedia = mockHtmlAudioPlayback(played);
        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                corsProxyUrl: '',
                audioViaBlob: true,
                audioEnableDefaultSources: false,
                audioSources: [{ type: 'jpod101', url: '', voice: '', enabled: true }],
            }));

            await expect(player.play({ ...card, spelling: '月光', reading: 'げっこう' })).resolves.toBe(true);

            expect(played).toHaveLength(1);
            expect(played[0]).toContain('https://assets.languagepod101.com/dictionary/japanese/audiomp3.php');
            expect(played[0]).not.toContain('blob:');
        } finally {
            restoreMedia();
            restoreBrowser();
        }
    });

    it('uses proxy-backed blob audio for hosted GitHub Pages on iPad Safari', async () => {
        const played: string[] = [];
        const restoreBrowser = mockAppleMobileBrowser();
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:https://hrussellzfac023.github.io/yomu-reader/audio'),
        });
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('https://yomu-jpdb-public-proxy')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
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
                audioSources: [{ type: 'jpod101', url: '', voice: '', enabled: true }],
            }));

            await expect(player.play({ ...card, spelling: '月光', reading: 'げっこう' })).resolves.toBe(true);

            const requestedUrl = String(fetchMock.mock.calls[0][0]);
            expect(requestedUrl).toBe(`https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent('https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E6%9C%88%E5%85%89&kana=%E3%81%92%E3%81%A3%E3%81%93%E3%81%86')}`);
            expect(played).toEqual(['blob:https://hrussellzfac023.github.io/yomu-reader/audio']);
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

    it('primes a reusable audio element for gesture-triggered hosted iPad playback', async () => {
        const played: string[] = [];
        const restoreBrowser = mockAppleMobileBrowser();
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        let resolveFetch!: (response: Response) => void;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:https://hrussellzfac023.github.io/yomu-reader/audio'),
        });
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        const fetchMock = vi.fn(() => new Promise<Response>(resolve => {
            resolveFetch = resolve;
        }));
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
            await waitForExpect(() => expect(fetchMock).toHaveBeenCalledTimes(1));

            resolveFetch({
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
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            restoreMedia();
            restoreBrowser();
            vi.unstubAllGlobals();
        }
    });

    it('tries proxy fallbacks for cross-origin built-in audio before browser speech', async () => {
        const spoken: string[] = [];
        class FakeSpeechSynthesisUtterance {
            lang = '';
            voice: SpeechSynthesisVoice | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;

            constructor(public text: string) {}
        }
        vi.stubGlobal('location', { origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('audio fetch failed'))));
        vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(),
            getVoices: vi.fn(() => [{ name: 'Kyoko', lang: 'ja-JP', default: true }] as SpeechSynthesisVoice[]),
            speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
                spoken.push(utterance.text);
                utterance.onend?.();
            }),
        });

        try {
            const player = new AudioPlayer(() => DEFAULT_SETTINGS);

            await expect(player.play(card)).resolves.toBe(true);

            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls[0]).toContain('yomu-jpdb-public-proxy');
            expect(urls).toContain(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://jisho.org/search/%E9%A3%9F%E3%81%B9%E3%82%8B')}`);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('plays each configurable audio source through its Yomitan-compatible lookup path', async () => {
        const played: string[] = [];
        const requested: Array<{ method: string; url: string; data?: string; responseType?: string }> = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        let blobIndex = 0;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => `blob:http://localhost/source-${++blobIndex}`),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
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
        const textResponses = (url: string, data?: string): string => {
            if (url.includes('jisho.org/search/')) return jishoHtml;
            if (url.includes('japanesepod101.com/learningcenter/reference/dictionary_post')) {
                expect(data).toContain('search_query=%E7%8C%AB');
                return languagePodHtml;
            }
            if (url.includes('commons.wikimedia.org') && url.includes('list=search') && url.includes('Lingua_Libre')) {
                return JSON.stringify({ query: { search: [{ title: 'File:LL-Q5287 (jpn)-葵心-猫.wav' }] } });
            }
            if (url.includes('commons.wikimedia.org') && url.includes('list=search')) {
                return JSON.stringify({ query: { search: [{ title: 'File:Ja-satsumaimo.ogg' }] } });
            }
            if (url.includes('File%3ALL-Q5287')) {
                return JSON.stringify({ query: { pages: { 1: { imageinfo: [{ url: 'https://commons.test/lingua-neko.wav', user: '葵心' }] } } } });
            }
            if (url.includes('File%3AJa-satsumaimo.ogg')) {
                return JSON.stringify({ query: { pages: { 1: { imageinfo: [{ url: 'https://commons.test/ja-satsumaimo.ogg', user: 'speaker' }] } } } });
            }
            if (url.includes('custom.test/source')) {
                return JSON.stringify({ audioSources: [{ url: 'https://custom.test/audio/neko.mp3' }] });
            }
            return '';
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

        async function playSource(type: AudioSourceSetting['type'], playCard: JPDBCard = { ...card, spelling: '猫', reading: 'ねこ' }): Promise<void> {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type, url: type === 'custom-json' ? 'https://custom.test/source?term={term}&reading={reading}' : '', voice: '', enabled: true },
                ],
            }));
            await expect(player.play(playCard)).resolves.toBe(true);
        }

        try {
            await playSource('jpod101');
            await playSource('language-pod-101');
            await playSource('jisho');
            await playSource('lingua-libre');
            await playSource('wiktionary', { ...card, spelling: 'satsumaimo', reading: 'satsumaimo' });
            await playSource('custom-json');

            expect(played).toHaveLength(6);
            expect(requested.some(request => request.url.includes('assets.languagepod101.com/dictionary/japanese/audiomp3.php'))).toBe(true);
            expect(requested.some(request => request.method === 'POST' && request.url === 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post')).toBe(true);
            expect(requested.some(request => request.url === 'https://jisho.org/search/%E7%8C%AB')).toBe(true);
            expect(requested.some(request => request.url.includes('Lingua_Libre_pronunciation-jpn'))).toBe(true);
            expect(requested.some(request => request.url.includes('File%3AJa-satsumaimo.ogg'))).toBe(true);
            expect(requested.some(request => request.url.includes('https://custom.test/source?term=%E7%8C%AB&reading=%E3%81%AD%E3%81%93'))).toBe(true);
            expect(parseSpy).not.toHaveBeenCalled();
        } finally {
            parseSpy.mockRestore();
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

    it('tries public proxy fallbacks for JPDB pitch from another site without the userscript bridge', async () => {
        vi.stubGlobal('location', { origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not be called'))));

        try {
            const client = new JpdbPublicPitchClient();

            await expect(client.lookup('易しい', 'やさしい')).resolves.toEqual([]);
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls[0]).toBe(`https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent('https://jpdb.io/search?q=%E6%98%93%E3%81%97%E3%81%84')}`);
            expect(urls).toContain(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://jpdb.io/search?q=%E6%98%93%E3%81%97%E3%81%84')}`);
            expect(urls).toContain(`https://corsproxy.io/?url=${encodeURIComponent('https://jpdb.io/search?q=%E3%82%84%E3%81%95%E3%81%97%E3%81%84')}`);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('tries public proxy fallbacks for JPDB vocabulary details from another site without the userscript bridge', async () => {
        vi.stubGlobal('location', { origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not be called'))));

        try {
            const client = new JpdbVocabularyClient();

            await expect(client.lookup(123, '読む', 'よむ')).resolves.toBeNull();
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls[0]).toBe(`https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent('https://jpdb.io/vocabulary/123/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80')}`);
            expect(urls).toContain(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://jpdb.io/vocabulary/123/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80')}`);
            expect(urls).toContain(`https://corsproxy.io/?url=${encodeURIComponent('https://jpdb.io/search?q=%E3%82%88%E3%82%80')}`);
        } finally {
            vi.unstubAllGlobals();
        }
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
            ['jpdb', true],
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

    it('enables the JPDB lookup pill for old saved default lookup links', async () => {
        const storageKey = 'jpdb-popup-reader-settings';
        const previous = localStorage.getItem(storageKey);
        localStorage.setItem(storageKey, JSON.stringify({
            ...DEFAULT_SETTINGS,
            dictionaryLookupLinks: [
                { id: 'jpdb', label: 'JPDB', urlTemplate: 'https://jpdb.io/search?q={query}', enabled: false },
                { id: 'jisho', label: 'Jisho', urlTemplate: 'https://jisho.org/search/{query}', enabled: true },
                { id: 'copy', label: 'Copy', urlTemplate: '', enabled: true, action: 'copy' },
            ],
        }));

        try {
            const settings = await loadSettings();

            expect(settings.dictionaryLookupLinks.map(link => [link.id, link.enabled])).toEqual([
                ['jpdb', true],
                ['jisho', true],
                ['copy', true],
            ]);
        } finally {
            if (previous === null) localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, previous);
        }
    });

    it('keeps the copy lookup pill fixed and URL-free in settings', () => {
        const html = renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local'));
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
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

    it('uses the JPDB source row checkbox when saving JPDB definitions', () => {
        const settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false };

        expect(definitionSourceRows(settings).map(row => row.name)).toContain('JPDB');
        expect(renderDictionarySourceRows(settings)).toContain('JPDB meanings shown directly from the current card.');

        const data = new FormData();
        data.set('jpdbDefinitionsEnabled', 'on');
        data.set('dictionaryPreferenceCount', '0');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(true);

        data.set('jpdbDefinitions.name', 'JPDB');
        data.set('jpdbDefinitions.priority', '0');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(false);

        data.set('jpdbDefinitions.enabled', 'on');
        expect(readFormSettings(data, settings).jpdbDefinitionsEnabled).toBe(true);
    });

    it('keeps definition source ordering compact until editable dictionaries exist', () => {
        document.body.innerHTML = `<form>${renderDictionarySourceRows(DEFAULT_SETTINGS)}</form>`;

        const header = document.querySelector<HTMLElement>('.jpdb-reader-dictionary-head');
        const row = document.querySelector<HTMLElement>('[data-dictionary-source-row]');

        expect(header?.textContent).not.toContain('Display name');
        expect(header?.textContent).not.toContain('Remove');
        expect(header?.classList.contains('compact')).toBe(true);
        expect(header?.classList.contains('no-remove')).toBe(true);
        expect(row?.classList.contains('compact')).toBe(true);
        expect(row?.classList.contains('no-remove')).toBe(true);
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
        const compactRow = rawName?.closest<HTMLElement>('[data-dictionary-source-row]');

        expect(rawName?.value).toBe('KANJIDIC <raw export>');
        expect(compactRow?.querySelector<HTMLElement>('.jpdb-reader-field-display')?.textContent).toBe('Kanji names');
    });

    it('keeps recommended dictionary downloads as in-reader import buttons', () => {
        const html = renderRecommendedDictionaries([]);
        document.body.innerHTML = `<form>${html}</form>`;
        const dictionary = findRecommendedDictionary('jmdict')!;
        const button = document.querySelector<HTMLButtonElement>('[data-action="download-recommended-dictionary"][data-dictionary-id="jmdict"]');
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-recommended-name a'));

        expect(button?.tagName).toBe('BUTTON');
        expect(button?.getAttribute('href')).toBeNull();
        expect(button?.textContent).toContain('Download & import');
        expect(links.some(link => link.href === dictionary.downloadUrl)).toBe(false);
    });

    it('includes support, donation, issue, and Discord entries in settings help', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="support"]')?.href).toContain('/support');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="issues"]')?.href).toContain('/issues');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="donate"]')?.href).toContain('paypal.me');
        expect(form.querySelector<HTMLElement>('[data-help-support-copy]')?.textContent).toBe('Report bugs on GitHub issues, use Discord for quick questions, or open the support page for donation and project links.');
        expect(form.textContent).not.toContain('Free Japanese reading and mining tools');
        expect(form.querySelector<HTMLButtonElement>('[data-help-link="discord"]')?.dataset.discordHandle).toBe('henry281199');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-help-actions');
        expect(SETTINGS_CSS).toContain('flex-wrap: nowrap');
    });

    it('keeps subtitle CSS from overriding settings dictionary source layouts', () => {
        expect(SUBTITLES_YOUTUBE_CSS).not.toContain('.jpdb-reader-settings');
        expect(SUBTITLES_YOUTUBE_CSS).not.toContain('.jpdb-reader-dictionary-row');
        expect(SUBTITLES_YOUTUBE_CSS).not.toContain('.jpdb-reader-audio-source-row');
    });

    it('reorders dictionary source rows with a desktop pointer drag', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [{
                name: 'Jitendex',
                alias: 'Jitendex',
                enabled: true,
                priority: 4,
                type: 'terms' as const,
            }],
        };
        document.body.innerHTML = `<form><div class="jpdb-reader-dictionary-priorities" data-source-editor>${renderDictionarySourceRows(settings)}</div></form>`;
        const form = document.querySelector('form')!;
        installSourceRowDrag(form);
        const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
        mockSourceRowRects(rows);

        const firstId = rows[0].dataset.sourceId;
        const handle = rows[0].querySelector<HTMLElement>('[data-source-drag-handle]')!;
        dispatchPointerEvent(handle, 'pointerdown', 4, 'mouse');
        dispatchPointerEvent(form, 'pointermove', 240, 'mouse');
        dispatchPointerEvent(form, 'pointerup', 240, 'mouse');

        const reordered = Array.from(form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
        expect(reordered.at(-1)?.dataset.sourceId).toBe(firstId);
        expect(reordered.at(-1)?.querySelector<HTMLInputElement>('input[name$=".priority"]')?.value).toBe(String(reordered.length - 1));
    });

    it('reorders audio source rows while keeping form indexes readable', () => {
        document.body.innerHTML = `<form><div class="jpdb-reader-audio-sources" data-source-editor data-audio-source-editor>${renderAudioSourceEditor(DEFAULT_AUDIO_SOURCES)}</div></form>`;
        const form = document.querySelector('form')!;
        installSourceRowDrag(form);
        const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'));
        mockSourceRowRects(rows);

        const firstType = rows[0].querySelector<HTMLSelectElement>('select[name$=".type"]')?.value;
        const handle = rows[0].querySelector<HTMLElement>('[data-source-drag-handle]')!;
        dispatchPointerEvent(handle, 'pointerdown', 4, 'mouse');
        dispatchPointerEvent(form, 'pointermove', 500, 'mouse');
        dispatchPointerEvent(form, 'pointerup', 500, 'mouse');

        const reordered = Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'));
        expect(reordered.at(-1)?.dataset.sourceId).toBe(`audio-${reordered.length - 1}`);
        expect(reordered.at(-1)?.querySelector<HTMLSelectElement>(`select[name="audioSources.${reordered.length - 1}.type"]`)?.value).toBe(firstType);
    });

    it('reorders kanji source rows with iPad-style touch drag events tracked on the document', () => {
        document.body.innerHTML = `<form><div class="jpdb-reader-kanji-priorities" data-source-editor>${renderKanjiSourceRows(DEFAULT_SETTINGS)}</div></form>`;
        const form = document.querySelector('form')!;
        installSourceRowDrag(form);
        const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
        mockSourceRowRects(rows);

        const firstId = rows[0].dataset.sourceId;
        const handle = rows[0].querySelector<HTMLElement>('[data-source-drag-handle]')!;
        dispatchPointerEvent(handle, 'pointerdown', 4, 'touch');
        dispatchPointerEvent(document, 'pointermove', 500, 'touch');
        dispatchPointerEvent(document, 'pointerup', 500, 'touch');

        expect(Array.from(form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]')).at(-1)?.dataset.sourceId).toBe(firstId);
    });

    it('reorders lookup pill rows through the drag handle', () => {
        document.body.innerHTML = `<form><div class="jpdb-reader-lookup-links" data-source-editor>${renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local'))}</div></form>`;
        const form = document.querySelector('form')!;
        installSourceRowDrag(form);
        const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-lookup-link-row]'));
        mockSourceRowRects(rows);

        const handle = rows[0].querySelector<HTMLElement>('[data-source-drag-handle]')!;
        dispatchPointerEvent(handle, 'pointerdown', 4);
        dispatchPointerEvent(form, 'pointermove', 200);
        dispatchPointerEvent(form, 'pointerup', 200);

        const ids = Array.from(form.querySelectorAll<HTMLInputElement>('input[name$=".id"]')).map(input => input.value);
        expect(ids.at(-1)).toBe('jpdb');
        expect(readDictionaryLookupLinks(new FormData(form)).at(-1)?.id).toBe('jpdb');
    });

    it('builds configured proxy URLs before public fallback URLs', () => {
        const target = 'https://jpdb.io/kanji/%E5%9B%B3';
        const candidates = proxyUrlCandidates(target, 'https://yomu-proxy.example/fetch');

        expect(candidates[0]).toBe(`https://yomu-proxy.example/fetch?url=${encodeURIComponent(target)}`);
        expect(candidates).toContain(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
        expect(proxyUrlCandidates(target, 'https://yomu-proxy.example/fetch', false)).toEqual([
            `https://yomu-proxy.example/fetch?url=${encodeURIComponent(target)}`,
        ]);
    });

    it('falls back from configured proxy HTTP failures for safe public GET requests', async () => {
        const target = 'https://jpdb.io/search?q=%E5%9B%B3';
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('https://yomu-proxy.example/fetch')) {
                return Promise.resolve(new Response('blocked', { status: 403 }));
            }
            if (url.startsWith('https://api.allorigins.win/raw')) {
                return Promise.resolve(new Response('ok', { status: 200 }));
            }
            return Promise.reject(new Error('unexpected fetch'));
        });
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, 'https://yomu-proxy.example/fetch', { credentials: 'omit' });

            expect(await response.text()).toBe('ok');
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-proxy.example/fetch?url=${encodeURIComponent(target)}`,
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(target)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('prefers the public proxy for hosted GitHub Pages cross-origin public requests', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=250';
        const fetchMock = vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response('ok', { status: 200 })));
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, '', { allowDirectCrossOrigin: true, credentials: 'omit' });

            expect(await response.text()).toBe('ok');
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(target)}`,
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('prefers the public proxy for safe iPad cross-origin public requests', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=250';
        const restoreBrowser = mockAppleMobileBrowser();
        const fetchMock = vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response('ok', { status: 200 })));
        vi.stubGlobal('location', {
            href: 'https://www3.nhk.or.jp/news/easy/',
            origin: 'https://www3.nhk.or.jp',
            hostname: 'www3.nhk.or.jp',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, '', { allowDirectCrossOrigin: true, credentials: 'omit' });

            expect(await response.text()).toBe('ok');
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(target)}`,
            ]);
        } finally {
            restoreBrowser();
            vi.unstubAllGlobals();
        }
    });

    it('does not send private network targets to configured or public proxies', async () => {
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not run')));
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(fetchWithCorsFallbacks('http://127.0.0.1:8765', 'https://yomu-proxy.example/fetch', {
                credentials: 'omit',
            })).rejects.toThrow(/configured proxy|userscript/i);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not route credential-bearing JPDB API requests through configured or public proxies', async () => {
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not run')));
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(fetchWithCorsFallbacks('https://jpdb.io/api/v1/lookup-vocabulary', 'https://yomu-proxy.example/fetch', {
                method: 'POST',
                headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
                body: '{}',
            })).rejects.toThrow(/configured proxy|userscript/i);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('allows public Worker GET fallbacks while blocking private and sensitive targets', () => {
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/kanji/%E5%9B%B3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/vocabulary/123/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://uchisen.com/kanji/%E5%9B%B3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://ik.imagekit.io/uchisen/generated/saved/generated_sample.jpg'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://release-assets.githubusercontent.com/github-production-release-asset/123/asset-id?sig=github-signed'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://example.com/dict.zip'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://cdn.example.com/audio.mp3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://www.japanesepod101.com/learningcenter/reference/dictionary_post'))).toBe(true);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://jpdb.io/api/v1/lookup-vocabulary'))).toBe(true);

        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/api/v1/lookup-vocabulary'))).toBe(false);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://jpdb.io/prioritize'))).toBe(false);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://localhost/audio.mp3'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://127.0.0.1/audio.mp3'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://192.168.1.2/audio.mp3'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://[::1]/audio.mp3'))).toBe(false);
    });

    it('combines translation and grammar source ordering while keeping individual toggles', () => {
        const combinedIds = orderedDefinitionSourceIds({
            ...DEFAULT_SETTINGS,
            studyTranslationEnabled: true,
            studyGrammarEnabled: true,
            studyTranslationPriority: 30,
            studyGrammarPriority: 10,
        }, []);
        const translationOnlyIds = orderedDefinitionSourceIds({
            ...DEFAULT_SETTINGS,
            studyTranslationEnabled: true,
            studyGrammarEnabled: false,
        }, []);

        expect(combinedIds).toContain(STUDY_TOOLS_SOURCE_ID);
        expect(combinedIds).not.toContain(STUDY_TRANSLATION_SOURCE_ID);
        expect(combinedIds).not.toContain(STUDY_GRAMMAR_SOURCE_ID);
        expect(definitionSourceRows(DEFAULT_SETTINGS).map(row => row.id)).toEqual(expect.arrayContaining([STUDY_TRANSLATION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID]));
        expect(translationOnlyIds).toContain(STUDY_TRANSLATION_SOURCE_ID);
        expect(translationOnlyIds).not.toContain(STUDY_TOOLS_SOURCE_ID);
    });

    it('adds Uchisen to kanji source ordering', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            uchisenPriority: 1,
        }, 'https://jpdb.io/settings');

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.uchisenEnabled).toBe(true);
        expect(saved.uchisenPriority).toBe(1);
        expect(kanjiSourceRows(saved).map(row => row.id)).toContain(KANJI_UCHISEN_SOURCE_ID);
        expect(orderedKanjiSourceIds(saved)[1]).toBe(KANJI_UCHISEN_SOURCE_ID);
        expect(orderedKanjiSourceIds({ ...saved, uchisenEnabled: false })).not.toContain(KANJI_UCHISEN_SOURCE_ID);
    });

    it('renders JPDB vocabulary page compounds and examples in the popup JPDB source', () => {
        const info = parseJpdbVocabularyHtml(`
            <div class="subsection-meanings">
                <h6 class="subsection-label">Meanings</h6>
                <div class="subsection">
                    <div class="description">1.  head of state</div>
                    <div class="description">2.  national leader</div>
                </div>
            </div>
            <div class="subsection-composed-of-vocabulary">
                <h6 class="subsection-label">Composed of</h6>
                <div class="subsection">
                    <div><div class="spelling"><a href="/vocabulary/2/%E5%9B%BD%E5%AE%B6/%E3%81%93%E3%81%A3%E3%81%8B"><ruby>国家<rt>こっか</rt></ruby></a></div><div class="description">state; country; nation</div></div>
                    <div><div class="spelling"><a href="/vocabulary/3/%E4%B8%BB%E5%B8%AD/%E3%81%97%E3%82%85%E3%81%9B%E3%81%8D"><ruby>主席<rt>しゅせき</rt></ruby></a></div><div class="description">chairman; governor</div></div>
                </div>
            </div>
            <div class="subsection-examples">
                <h6 class="subsection-label">Monolingual examples</h6>
                <div class="subsection"><div class="example"><span class="sentence">大統領は、中国の国家主席と話をする予定です。</span></div></div>
            </div>
        `);

        const html = renderJpdbDefinitionSource({
            ...card,
            spelling: '国家主席',
            reading: 'こっかしゅせき',
            meanings: [{ glosses: ['head of state'], partOfSpeech: ['noun'] }],
        }, (key, initiallyExpanded) => `data-source-state-key="${key}" data-source-initial-open="${String(initiallyExpanded ?? true)}"${initiallyExpanded ? ' open' : ''}`, info);

        expect(html).toContain('head of state');
        expect(html).not.toContain('Composed of');
        expect(html).toContain('国家');
        expect(html).toContain('主席');
        expect(html).toContain('href="#jpdb-reader-dictionary-lookup"');
        expect(html).toContain('data-dictionary-lookup="国家"');
        expect(html).toContain('data-dictionary-reading="こっか"');
        expect(html).toContain('jpdb-reader-jpdb-compound-term jpdb-reader-parseable');
        expect(html).toContain('jpdb-reader-example-count');
        expect(html).not.toContain('jpdb-reader-jpdb-compound-ruby');
        expect(html).toContain('大統領は、中国の国家主席と話をする予定です。');
        expect(html).not.toContain('data-source-state-key="definition-source:__jpdb_examples__"');
        expect(html).toContain('JPDB examples');
        expect(html).toContain('jpdb-reader-jpdb-examples-group');
    });

    it('renders public JPDB meanings for local cards without leaking local dictionary meanings into the JPDB source', () => {
        const info = parseJpdbVocabularyHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80">
            <div class="result vocabulary">
                <a href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a">読む</a>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="subsection">
                        <div class="description">1.  to read</div>
                    </div>
                </div>
            </div>
        `, '読む', 'よむ');

        const html = renderJpdbDefinitionSource({
            ...card,
            spelling: '読む',
            reading: 'よむ',
            meanings: [{ glosses: ['local-only meaning'], partOfSpeech: [] }],
            source: 'local',
        }, key => `data-source-state-key="${key}"`, info);

        expect(info?.meanings).toEqual(['to read']);
        expect(html).toContain('to read');
        expect(html).not.toContain('local-only meaning');
    });

    it('uses JPDB component terms as Immersion Kit fallback queries for compounds', async () => {
        localStorage.clear();
        window.history.replaceState(null, '', '/vocabulary/1/%E5%9B%BD%E5%AE%B6%E4%B8%BB%E5%B8%AD/%E3%81%93%E3%81%A3%E3%81%8B%E3%81%97%E3%82%85%E3%81%9B%E3%81%8D#a');
        const search = vi.fn(async (query: string) => query === '国家'
            ? [{
                id: 'ik-1',
                sentence: '国家のために働く。',
                sentenceWithFurigana: '',
                translation: 'Work for the country.',
                sourceTitle: 'Show',
                titleSlug: 'show',
                category: 'anime',
                soundFile: 'audio.mp3',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            }]
            : []);
        const controller = new ImmersionPopoverController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: false,
            }),
            client: { search } as unknown as ImmersionKitClient,
            audio: { play: vi.fn(async () => undefined) } as never,
            parseJapanese: vi.fn(async () => []),
            canParseJapanese: () => false,
            parsePopoverJapanese: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast: vi.fn(),
        });
        const compoundCard = { ...card, spelling: '国家主席', reading: 'こっかしゅせき' };

        const result = await controller.searchExamples(compoundCard, { relatedQueries: ['国家', '主席'] });

        expect(search).toHaveBeenNthCalledWith(1, '国家主席', expect.any(Object));
        expect(search).toHaveBeenNthCalledWith(2, '国家', expect.any(Object));
        expect(result.query).toBe('国家');
        expect(result.examples[0]?.sourceTitle).toBe('Show');
        expect(result.examples[0]?.sentence).toBe('国家のために働く。');
        expect(result.usedFallback).toBe(true);
    });

    it('falls back from stuck card detail providers', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'api-key',
                audioTimeoutMs: 1000,
                localDictionariesEnabled: true,
                localDictionaryShowKanji: true,
                showPitchAccent: true,
                ankiEnabled: true,
                jpdbMiningEnabled: true,
            };
            const loader = new CardRenderDataLoader({
                getSettings: () => settings,
                dictionaries: {
                    lookup: vi.fn(() => never),
                    lookupKanji: vi.fn(() => never),
                    lookupTermMeta: vi.fn(() => never),
                } as unknown as YomitanDictionaryStore,
                jpdbPublicPitch: { lookup: vi.fn(() => never) } as unknown as JpdbPublicPitchClient,
                jpdbVocabulary: { lookup: vi.fn(() => never) } as unknown as JpdbVocabularyClient,
                anki: {
                    findExistingCards: vi.fn(() => never),
                    deckNames: vi.fn(() => never),
                } as unknown as AnkiConnectClient,
                jpdb: { listDecks: vi.fn(() => never) } as unknown as JpdbClient,
                isJpdbBackedCard: () => true,
            });
            const load = loader.load({ ...card, pitchAccent: [] });
            await vi.advanceTimersByTimeAsync(9000);

            await expect(load.all).resolves.toMatchObject({
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('skips AnkiConnect card details on mobile handoff devices', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const findExistingCards = vi.fn(async (): Promise<AnkiLookupResult> => ({ state: 'known', notes: [], primary: null }));
        const deckNames = vi.fn(async () => ['Desktop Deck']);
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiMobileHandoff: true,
            localDictionariesEnabled: false,
            showPitchAccent: false,
            jpdbDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
        };
        const loader = new CardRenderDataLoader({
            getSettings: () => settings,
            dictionaries: {
                lookup: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as unknown as YomitanDictionaryStore,
            jpdbPublicPitch: { lookup: vi.fn(async () => []) } as unknown as JpdbPublicPitchClient,
            jpdbVocabulary: { lookup: vi.fn(async () => null) } as unknown as JpdbVocabularyClient,
            anki: { findExistingCards, deckNames } as unknown as AnkiConnectClient,
            jpdb: { listDecks: vi.fn(async () => []) } as unknown as JpdbClient,
            isJpdbBackedCard: () => true,
        });

        try {
            await expect(loader.load(card).all).resolves.toMatchObject({
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                ankiDecks: [],
            });
            expect(findExistingCards).not.toHaveBeenCalled();
            expect(deckNames).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
        }
    });

    it('loads public JPDB vocabulary details for local cards without an API key', async () => {
        const lookup = vi.fn(async () => ({ meanings: ['to read'], compounds: [], examples: [] }));
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            showPitchAccent: false,
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: false,
            ankiEnabled: false,
            jpdbMiningEnabled: false,
        };
        const loader = new CardRenderDataLoader({
            getSettings: () => settings,
            dictionaries: {
                lookup: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as unknown as YomitanDictionaryStore,
            jpdbPublicPitch: { lookup: vi.fn(async () => []) } as unknown as JpdbPublicPitchClient,
            jpdbVocabulary: { lookup } as unknown as JpdbVocabularyClient,
            anki: {
                findExistingCards: vi.fn(),
                deckNames: vi.fn(),
            } as unknown as AnkiConnectClient,
            jpdb: { listDecks: vi.fn() } as unknown as JpdbClient,
            isJpdbBackedCard: () => false,
        });

        const localCard: JPDBCard = {
            ...card,
            vid: -1,
            sid: -1,
            spelling: '読む',
            reading: 'よむ',
            meanings: [{ glosses: ['local-only meaning'], partOfSpeech: [] }],
            pitchAccent: [],
            source: 'local',
        };
        const load = loader.load(localCard);

        await expect(load.all).resolves.toMatchObject({
            jpdbVocabularyInfo: { meanings: ['to read'] },
        });
        expect(lookup).toHaveBeenCalledWith(-1, '読む', 'よむ');
    });

    it('renders media controls for compound fallback clips instead of current-sentence pseudo examples', async () => {
        localStorage.clear();
        const popover = document.createElement('div');
        const container = document.createElement('details');
        container.dataset.immersionKit = '';
        popover.append(container);
        document.body.append(popover);
        const controller = new ImmersionPopoverController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: true,
            }),
            client: {
                search: vi.fn(async (query: string) => query === '国家'
                    ? [{
                        id: 'ik-1',
                        sentence: '国家のために働く。',
                        sentenceWithFurigana: '',
                        translation: 'Work for the country.',
                        sourceTitle: 'Show',
                        titleSlug: 'show',
                        category: 'anime',
                        soundFile: 'audio.mp3',
                        imageFile: '',
                        soundUrl: '',
                        imageUrl: '',
                    }]
                    : []),
                mediaUrl: vi.fn((_: unknown, kind: 'image' | 'sound') => kind === 'sound' ? 'https://example.test/audio.mp3' : ''),
                fetchBlobUrl: vi.fn(),
            } as unknown as ImmersionKitClient,
            audio: { play: vi.fn(async () => undefined) } as never,
            parseJapanese: vi.fn(async () => []),
            canParseJapanese: () => false,
            parsePopoverJapanese: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast: vi.fn(),
        });
        const compoundCard = {
            ...card,
            spelling: '国家主席',
            reading: 'こっかしゅせき',
            sentence: '14日に中国の習近平国家主席と話をする予定です。',
        };

        await controller.loadExamples(popover, compoundCard, controller.searchExamples(compoundCard, { relatedQueries: ['国家', '主席'] }));

        expect(container.textContent).toContain('国家 · Show · 1/1');
        expect(container.textContent).toContain('国家のために働く。');
        expect(container.textContent).not.toContain('Current sentence');
        expect(container.querySelector('[data-immersion-action="audio"]')).not.toBeNull();
        expect(container.querySelector('.jpdb-reader-example-media')).toBeNull();
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

            expect(played).toEqual(['blob:http://localhost/audio.mp3']);
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
            expect(played).toEqual(['blob:http://localhost/audio.mp3', 'blob:http://localhost/audio.mp3']);
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

    it('uses data URLs for page media on jpdb pages to avoid cross-principal blob loads', async () => {
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:https://jpdb.io/audio.mp3'),
        });
        vi.stubGlobal('location', { hostname: 'jpdb.io' });

        try {
            const url = await createPageMediaUrl(new Blob(['audio'], { type: 'audio/mpeg' }));

            expect(url).toMatch(/^data:audio\/mpeg;base64,/);
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            vi.unstubAllGlobals();
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

    it('uses page fetch for CORS-enabled Immersion Kit search without a userscript bridge', async () => {
        const client = new ImmersionKitClient();
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
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0][0])).toContain('https://apiv2express.immersionkit.com/search?');
            expect(examples[0]).toMatchObject({ sourceTitle: 'Steins Gate' });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('routes hosted GitHub Pages Immersion Kit search through the public proxy first', async () => {
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
            const proxiedTarget = new URL(firstUrl).searchParams.get('url') ?? '';

            expect(examples[0]).toMatchObject({ sourceTitle: 'Steins Gate' });
            expect(firstUrl).toContain('https://yomu-jpdb-public-proxy');
            expect(proxiedTarget).toContain('https://apiv2express.immersionkit.com/search?');
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
            expect(client.mediaUrls(example, 'sound')[0]).toContain('apiv2express.immersionkit.com/download_media');
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
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });

            expect(new URL(requestUrl).searchParams.get('limit')).toBe('250');
            expect(examples).toHaveLength(30);
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

    it('keeps kanji dive back navigation inside the kanji stack before returning to the word', async () => {
        const app = new ReaderApp();
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: false,
            media: '',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (frame: FrameRequestCallback) => {
                frame(0);
                return 1;
            },
        });

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
            Object.defineProperty(window, 'requestAnimationFrame', {
                configurable: true,
                value: originalRequestAnimationFrame,
            });
            vi.unstubAllGlobals();
            app.destroy();
        }
    });

    it('returns from a kanji related word back to the kanji page before the original word', async () => {
        const app = new ReaderApp();
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: false,
            media: '',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (frame: FrameRequestCallback) => {
                frame(0);
                return 1;
            },
        });

        try {
            const originalWord = { ...card, spelling: '漢字', reading: 'かんじ' };
            const relatedWord = { ...card, vid: 10, sid: 20, spelling: '漢語', reading: 'かんご' };
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                showKanjiCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
                parseJapanese(texts: string[]): Promise<JPDBToken[][]>;
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jpdbMiningEnabled: false,
                ankiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                jpdbKanjiEnabled: false,
                uchisenEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                similarKanjiWords: false,
                showPitchAccent: false,
                immersionKitEnabled: false,
            };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);
            internals.parseJapanese = vi.fn(async () => [[{
                card: relatedWord,
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: '漢語',
            }]]);

            await internals.showKanjiCard(originalWord, '漢', '漢字です。');
            document.querySelector('.jpdb-reader-popover')?.insertAdjacentHTML(
                'beforeend',
                '<button type="button" data-action="similar-word" data-expression="漢語">漢語</button>',
            );
            document.querySelector<HTMLButtonElement>('[data-action="similar-word"]')?.click();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-reader-spelling')?.textContent).toBe('漢語');
                expect(document.querySelector<HTMLButtonElement>('[data-action="word-history-back"]')?.title).toBe('Back to kanji: 漢');
            });

            document.querySelector<HTMLButtonElement>('[data-action="word-history-back"]')?.click();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('漢');
                expect(document.querySelector<HTMLButtonElement>('[data-action="word-back"]')?.title).toBe('Back to word: 漢字');
            });
        } finally {
            Object.defineProperty(window, 'requestAnimationFrame', {
                configurable: true,
                value: originalRequestAnimationFrame,
            });
            vi.unstubAllGlobals();
            app.destroy();
        }
    });

    it('toggles Immersion Kit translation blur without losing the ReaderApp callback binding', async () => {
        const app = new ReaderApp();
        const container = document.createElement('details');
        container.setAttribute('data-immersion-kit', '');
        const popover = document.createElement('div');
        popover.append(container);
        document.body.append(popover);

        const example = {
            id: 'anime_test_000001',
            sentence: '翻訳を確認しました。',
            sentenceWithFurigana: '',
            translation: 'I checked the translation.',
            sourceTitle: 'Test Source',
            titleSlug: 'test_source',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
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
        internals.settings = {
            ...DEFAULT_SETTINGS,
            immersionKitShowImages: false,
            immersionKitShowTranslation: true,
            immersionKitRevealTranslationOnClick: true,
        };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '翻訳',
            usedFallback: false,
            triedQueries: ['翻訳'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.playExampleAudio = vi.fn(async () => undefined);
        internals.immersionPopover.mediaUrls = vi.fn(() => []);

        await internals.immersionPopover.loadExamples(popover, card);

        const translation = container.querySelector<HTMLElement>('.jpdb-reader-example-translation');
        expect(translation?.dataset.immersionTranslationBlurred).toBe('true');

        translation?.click();

        expect(internals.settings.immersionKitRevealTranslationOnClick).toBe(false);
        expect(translation?.dataset.immersionTranslationBlurred).toBeUndefined();
    });

    it('keeps the current Immersion Kit image in place until the next one preloads', async () => {
        const pendingImages: Array<{ src: string; onload: ((event: Event) => void) | null; onerror: ((event: Event) => void) | null; decoding: string }> = [];
        class FakeImage {
            onload: ((event: Event) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;
            decoding = 'auto';
            source = '';

            get src(): string {
                return this.source;
            }

            set src(value: string) {
                this.source = value;
                pendingImages.push(this);
            }
        }
        vi.stubGlobal('Image', FakeImage);

        try {
            const app = new ReaderApp();
            const container = document.createElement('details');
            container.setAttribute('data-immersion-kit', '');
            const popover = document.createElement('div');
            popover.append(container);
            document.body.append(popover);

            const firstExample = {
                id: 'anime_test_000001',
                sentence: '最初の発音です',
                sentenceWithFurigana: '',
                translation: '',
                sourceTitle: 'First Source',
                titleSlug: 'first_source',
                category: 'anime',
                soundFile: 'first.mp3',
                imageFile: 'first.jpg',
                soundUrl: '',
                imageUrl: '',
            };
            const secondExample = {
                ...firstExample,
                id: 'anime_test_000002',
                sentence: '次の発音です',
                sourceTitle: 'Second Source',
                imageFile: 'second.jpg',
            };
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                parseJapanese(texts: string[]): Promise<JPDBToken[][]>;
                immersionPopover: {
                loadExamples(popover: HTMLElement, card: JPDBCard): Promise<void>;
                searchExamples(card: JPDBCard): Promise<unknown>;
                playExampleAudio(example: unknown, quiet?: boolean): Promise<void>;
                mediaUrls(example: { imageFile: string }, kind: 'image' | 'sound'): string[];
            };
            immersionKit: {
                fetchBlobUrl(url: string | string[], timeoutMs: number): Promise<string>;
            };
        };
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitShowImages: true };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [firstExample, secondExample],
            query: '発音',
                usedFallback: false,
                triedQueries: ['発音'],
            }));
            internals.parseJapanese = vi.fn(async () => []);
            internals.immersionPopover.playExampleAudio = vi.fn(async () => undefined);
        internals.immersionPopover.mediaUrls = vi.fn((example, kind) => kind === 'image'
            ? [`https://media.test/${example.imageFile}`]
            : ['https://media.test/line.mp3']);
        internals.immersionKit.fetchBlobUrl = vi.fn(async url => `blob:http://localhost/${String(Array.isArray(url) ? url[0] : url).split('/').pop()}`);

        await internals.immersionPopover.loadExamples(popover, card);
        await waitForExpect(() => expect(container.querySelector<HTMLImageElement>('[data-immersion-image]')?.src).toBe('blob:http://localhost/first.jpg'));

        container.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();

        const imageAfterNavigation = container.querySelector<HTMLImageElement>('[data-immersion-image]');
        expect(imageAfterNavigation?.src).toBe('blob:http://localhost/first.jpg');
        await waitForExpect(() => expect(pendingImages.at(-1)?.src).toBe('blob:http://localhost/second.jpg'));

        pendingImages.at(-1)?.onload?.(new Event('load'));

        expect(imageAfterNavigation?.src).toBe('blob:http://localhost/second.jpg');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('starts Immersion Kit navigation audio before JPDB parsing work', async () => {
        const app = new ReaderApp();
        const container = document.createElement('details');
        container.setAttribute('data-immersion-kit', '');
        const popover = document.createElement('div');
        popover.append(container);
        document.body.append(popover);

        const example = {
            id: 'anime_test_000001',
            sentence: '発音も確かめました。',
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
        const calls: string[] = [];
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
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitShowImages: false };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '発音',
            usedFallback: false,
            triedQueries: ['発音'],
        }));
        internals.parseJapanese = vi.fn(async () => {
            calls.push('parse');
            return [];
        });
        internals.immersionPopover.playExampleAudio = vi.fn(async () => {
            calls.push('audio');
        });
        internals.immersionPopover.mediaUrls = vi.fn((_, kind) => kind === 'image' ? [] : ['https://media.test/line.mp3']);

        await internals.immersionPopover.loadExamples(popover, card);
        calls.length = 0;

        container.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();

        expect(calls.slice(0, 2)).toEqual(['audio', 'parse']);
    });

    it('keeps Immersion Kit audio idle until the audio control is used', async () => {
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
            };
            immersionKit: {
                mediaUrls(example: unknown, kind: 'image' | 'sound'): string[];
            };
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            immersionKitAutoPlayAudio: true,
            immersionKitPlayOnHover: true,
            immersionKitPlayOnImageClick: true,
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

        await internals.immersionPopover.loadExamples(popover, card);

        expect(playSpy).not.toHaveBeenCalled();
        await new Promise(resolve => requestAnimationFrame(resolve));

        container.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();

        expect(playSpy).toHaveBeenCalledWith(example);
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
        expect(DEFAULT_SETTINGS.subtitleNativeBlurred).toBe(true);
        expect(DEFAULT_SETTINGS.subtitleKaraokeMode).toBe(true);
        expect(DEFAULT_SETTINGS.subtitleBackgroundOpacity).toBe(0);
    });

    it('ranks and classifies subtitle tracks by learner usefulness', () => {
        const tracks = [
            { kind: 'youtube' as const, label: 'English', language: 'en' },
            { kind: 'youtube' as const, label: 'Japanese auto', language: 'ja', autoGenerated: true },
            { kind: 'remote' as const, label: '日本語', language: 'ja' },
            { kind: 'file' as const, label: 'Manual load' },
        ].sort(compareSubtitleTrackOptions);

        expect(tracks.map(track => track.label)).toEqual(['Manual load', '日本語', 'Japanese auto', 'English']);
        expect(isJapaneseSubtitleTrack(tracks[1])).toBe(true);
        expect(isEnglishSubtitleTrack(tracks[3])).toBe(true);
    });

    it('replaces waiting native subtitle tracks with matching remote files', () => {
        const nativeJapanese = { kind: 'native' as const, label: 'Japanese', language: 'ja' };
        const remoteJapanese = { kind: 'remote' as const, label: '日本語 subtitles', language: 'ja' };
        const remoteEnglish = { kind: 'remote' as const, label: 'English subtitles', language: 'en' };

        expect(shouldReplaceWaitingNativeTrack(nativeJapanese, remoteJapanese, [])).toBe(true);
        expect(shouldReplaceWaitingNativeTrack(nativeJapanese, remoteEnglish, [])).toBe(false);
        expect(shouldReplaceWaitingNativeTrack(nativeJapanese, remoteJapanese, [{ start: 0, end: 1, text: 'もうあります' }])).toBe(false);
    });

    it('uses a fixed right drawer layout on wide viewports', () => {
        const layout = computeSubtitleDrawerLayout({
            viewportWidth: 1600,
            viewportHeight: 940,
            anchorTop: 96,
            compactPanel: false,
            size: { sideWidth: 520 },
        });

        expect(layout.placement).toBe('right');
        expect(layout.width).toBe(520);
        expect(layout.left + layout.width).toBe(1590);
        expect(layout.top).toBe(96);
    });

    it('honors left drawer placement on wide viewports', () => {
        const layout = computeSubtitleDrawerLayout({
            viewportWidth: 1366,
            viewportHeight: 900,
            anchorTop: 84,
            compactPanel: false,
            preferredPlacement: 'left',
            size: { sideWidth: 420 },
        });

        expect(layout.placement).toBe('left');
        expect(layout.left).toBe(10);
        expect(layout.width).toBe(420);
    });

    it('uses a bottom-sheet drawer layout on compact viewports', () => {
        const layout = computeSubtitleDrawerLayout({
            viewportWidth: 720,
            viewportHeight: 900,
            anchorTop: 96,
            compactPanel: true,
            size: { bottomHeight: 360 },
        });

        expect(layout.placement).toBe('bottom');
        expect(layout.width).toBe(700);
        expect(layout.height).toBe(360);
        expect(layout.top + layout.height).toBe(890);
    });

    it('applies generic video inset through a reversible adapter', () => {
        withViewport(1600, 900, () => {
            document.body.innerHTML = '<main id="player" style="width:1200px;max-width:1200px"><video></video></main>';
            const container = document.querySelector<HTMLElement>('#player')!;
            const video = document.querySelector('video') as HTMLVideoElement;
            Object.defineProperty(container, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(20, 30, 1200, 700),
            });
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(20, 30, 1200, 675),
            });
            Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1600 });
            Object.defineProperty(video, 'videoHeight', { configurable: true, value: 900 });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 1100,
                    panelSize: 460,
                    videoRect: new DOMRect(20, 30, 1200, 675),
                    margin: 10,
                });

                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(true);
                expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('470px');
                expect(container.style.width).toBe('1100px');
                expect(container.style.maxWidth).toBe('1100px');
                expect(container.style.height).toBe('619px');
                expect(container.style.maxHeight).toBe('619px');
                expect(container.style.minWidth).toBe('0px');
                expect(container.style.minHeight).toBe('0px');
                expect(container.style.marginRight).toBe('90px');
            } finally {
                adapter.clear(video);
            }

            expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(false);
            expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('');
            expect(container.style.width).toBe('1200px');
            expect(container.style.maxWidth).toBe('1200px');
            expect(container.style.height).toBe('');
            expect(container.style.maxHeight).toBe('');
            expect(container.style.minWidth).toBe('');
            expect(container.style.minHeight).toBe('');
            expect(container.style.marginRight).toBe('');
        });
    });

    it('keeps the hosted empty video frame at normal aspect ratio with a bottom drawer', () => {
        withViewport(390, 844, () => {
            document.body.innerHTML = '<section data-yomu-video-frame><video></video></section>';
            const container = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            const video = document.querySelector('video') as HTMLVideoElement;
            Object.defineProperty(container, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(9, 116, 372, 209.25),
            });
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(10, 117, 370, 207.25),
            });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    video,
                    side: 'bottom',
                    playerSize: 319,
                    panelSize: 388,
                    videoRect: new DOMRect(9, 116, 372, 209.25),
                    margin: 10,
                });

                expect(container.style.height).toBe('209px');
                expect(container.style.maxHeight).toBe('209px');
            } finally {
                adapter.clear(video);
            }

            expect(container.style.height).toBe('');
            expect(container.style.maxHeight).toBe('');
        });
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

    it('normalizes OCR providers to the current readable options', () => {
        expect(normalizeOcrProvider('local-service')).toBe('local-service');
        expect(normalizeOcrProvider('off')).toBe('off');
        expect(normalizeOcrProvider('old-provider')).toBe('local-service');
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

    it('ships the JMdict recommended dictionary download from Yomitan', () => {
        const dictionary = findRecommendedDictionary('jmdict');
        expect(dictionary?.downloadUrl).toContain('JMdict_english.zip');
        expect(dictionary?.homepage).toContain('jmdict-yomitan');
        expect(RECOMMENDED_JAPANESE_DICTIONARIES.map(item => item.name)).toEqual([
            'Jitendex',
            'JMdict',
            'JMnedict',
            'KANJIDIC',
            'JPDBv2㋕',
            'BCCWJ',
            'Jiten',
        ]);
    });

    it('downloads dictionaries through lowercase GM.xmlhttpRequest when that is the exposed userscript API', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Alias Dict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
            ],
        });
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            if (options.url !== 'https://dict.test/alias.zip') {
                options.onerror?.(new Error(`Unexpected request: ${options.url}`));
                return;
            }
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

            expect(request).toHaveBeenCalled();
            const dictionaryRequest = request.mock.calls
                .map(call => call[0])
                .find(options => options.url === 'https://dict.test/alias.zip');
            expect(dictionaryRequest).toMatchObject({
                method: 'GET',
                url: 'https://dict.test/alias.zip',
                responseType: 'blob',
            });
            expect(summary).toMatchObject({ dictionaries: ['Alias Dict'], terms: 1, entries: 1 });
            expect(progress).toContain('Downloading alias.zip...');
            expect(progress).toContain('Downloading dictionary 100%...');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps GM dictionary downloads working when a mounted userscript window is unreadable', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Firefox GM Dict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
            ],
        });
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({ status: 200, response: blob });
        });
        const monkeyWindowKey = '__monkeyWindow-firefox-xray';

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', { xmlHttpRequest: request });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not run'))));
        Object.defineProperty(document, monkeyWindowKey, {
            configurable: true,
            get: () => {
                throw new Error('Not allowed to access cross-origin object');
            },
        });

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFromUrl('https://dict.test/firefox-gm.zip', 'firefox-gm.zip');

            expect(request).toHaveBeenCalled();
            const dictionaryRequests = request.mock.calls
                .map(call => call[0])
                .filter(options => options.url === 'https://dict.test/firefox-gm.zip');
            expect(dictionaryRequests).toHaveLength(1);
            expect(summary).toMatchObject({ dictionaries: ['Firefox GM Dict'], terms: 1, entries: 1 });
        } finally {
            delete (document as unknown as Record<string, unknown>)[monkeyWindowKey];
            vi.unstubAllGlobals();
        }
    });

    it('downloads dictionaries through vite-plugin-monkey mounted userscript APIs', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Mounted Dict', format: 3 },
            'term_bank_1.json': [
            ['見る', 'みる', '', 'v1', 10, ['to see'], 1, ''],
            ],
        });
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

    it('imports same-origin dictionary ZIPs via fetch without the userscript bridge', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Proxy Dict', format: 3 },
            'term_bank_1.json': [
            ['青空', 'あおぞら', '', '', 10, ['blue sky'], 1, ''],
            ],
        });
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            expect(String(input)).toBe(`${location.origin}/proxy.zip`);
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
            const summary = await store.importFromUrl(`${location.origin}/proxy.zip`, 'proxy.zip');

            expect(fetchMock).toHaveBeenCalled();
            expect(String(fetchMock.mock.calls[0][0])).toBe(`${location.origin}/proxy.zip`);
            expect(summary).toMatchObject({ dictionaries: ['Proxy Dict'], terms: 1, entries: 1 });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('imports remote dictionary ZIPs through the configured public proxy when no userscript bridge is available', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Hosted Proxy Dict', format: 3 },
            'term_bank_1.json': [
            ['読書', 'どくしょ', '', '', 10, ['reading books'], 1, ''],
            ],
        });
        const sourceUrl = 'https://github.com/example/dictionaries/releases/latest/download/hosted.zip';
        const proxyUrl = 'https://yomu-proxy.example/fetch';
        const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe(`${proxyUrl}?url=${encodeURIComponent(sourceUrl)}`);
            expect(init).toMatchObject({ credentials: 'omit' });
            return Promise.resolve({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(blob),
            } as Response);
        });

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab.html', origin: 'https://hrussellzfac023.github.io', hostname: 'hrussellzfac023.github.io' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', fetchMock);

        try {
            const store = new YomitanDictionaryStore(() => proxyUrl);
            await store.clear();
            const summary = await store.importFromUrl(sourceUrl, 'hosted.zip');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(summary).toMatchObject({ dictionaries: ['Hosted Proxy Dict'], terms: 1, entries: 1 });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('imports deflated Yomitan ZIPs without browser DecompressionStream', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Deflated Dict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
            ],
        }, { compression: 'deflate' });
        vi.stubGlobal('DecompressionStream', undefined);

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFile(new File([blob], 'deflated.zip', { type: 'application/zip' }));

            expect(summary).toMatchObject({ dictionaries: ['Deflated Dict'], terms: 1, entries: 1 });
            expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Deflated Dict' }]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reports browser-blocked remote dictionary ZIP fetches without the userscript bridge', async () => {
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();

            await expect(store.importFromUrl('https://github.com/example/dict.zip', 'dict.zip'))
                .rejects.toThrow(/blocked in this browser/i);
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit]> } }).mock.calls.map(([url]) => String(url));
            expect(urls).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent('https://github.com/example/dict.zip')}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent('https://github.com/example/dict.zip')}`,
                `https://corsproxy.io/?url=${encodeURIComponent('https://github.com/example/dict.zip')}`,
            ]);
            expect(fetch).toHaveBeenCalledWith(urls[0], expect.objectContaining({ credentials: 'omit' }));
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

    it('detects richer grammar before basic particles crowd out the hint list', () => {
        const hints = detectGrammarHints('日本語が上手になるために、毎日練習しなくてはいけないと思うけど、明日は友達に手伝ってもらうことができるかもしれない。');
        const names = hints.map(hint => hint.name);

        expect(names).toEqual(expect.arrayContaining([
            'ために',
            'なければならない',
            'と思う',
            'てくれる / てもらう',
            'ことができる',
            'かもしれない',
        ]));
        expect(names.indexOf('ために')).toBeLessThan(names.indexOf('に'));
    });

    it('detects higher-level grammar and keeps rule metadata stable', () => {
        const hints = detectGrammarHints('先生に本を読まされるにもかかわらず、その本について発表するはずです。');
        const names = hints.map(hint => hint.name);

        expect(names).toEqual(expect.arrayContaining(['させられる', 'にもかかわらず', 'について', 'はず']));
        expect(hints.find(hint => hint.name === 'にもかかわらず')).toMatchObject({
            ruleId: 'concession-ni-mo-kakawarazu',
            level: 'N2',
        });
    });

    it('detects the と particle in NHK-style talk sentences', () => {
        const hints = detectGrammarHints('トランプ大統領 14日に中国の習近平国家主席と話をする');
        const names = hints.map(hint => hint.name);

        expect(names).toEqual(expect.arrayContaining(['に', 'の', 'と', 'を']));
        expect(hints.find(hint => hint.name === 'と')).toMatchObject({
            ruleId: 'particle-to',
            level: 'N5',
        });
    });

    it('detects plain past tense in NHK-style talk sentences', () => {
        const hints = detectGrammarHints('トランプ大統領と習近平国家主席が会って話をした');

        expect(hints.find(hint => hint.name === 'た')).toMatchObject({
            ruleId: 'plain-past-ta',
            level: 'N5',
            kind: 'Plain past',
            match: 'した',
        });
    });

    it('detects たち as a group suffix grammar hint', () => {
        const hints = detectGrammarHints('私たちは子供たちと公園で遊びます。');

        expect(hints.filter(hint => hint.name === 'たち / 達')).toHaveLength(2);
        expect(hints.find(hint => hint.name === 'たち / 達')).toMatchObject({
            ruleId: 'suffix-tachi',
            level: 'N5',
        });
    });

    it('keeps common word endings from looking like grammar points', () => {
        const politeHints = detectGrammarHints('私たちは子供たちと公園で遊びます。');
        const desireHints = detectGrammarHints('毎日読んでいるので、もっと読みたい。');
        const potentialHints = detectGrammarHints('日本語を読むことができる。');

        expect(politeHints.map(hint => hint.name)).not.toContain('させる');
        expect(desireHints.map(hint => hint.name)).not.toContain('らしい / みたい');
        expect(desireHints.filter(hint => hint.name === 'で')).toHaveLength(0);
        expect(desireHints.filter(hint => hint.name === 'と')).toHaveLength(0);
        expect(potentialHints.filter(hint => hint.name === 'と')).toHaveLength(0);
    });

    it('detects grammar from a Hanabira-style grammar index', () => {
        const index = buildHanabiraGrammarIndex([{
            title: 'Verb ることができる (〜ru koto ga dekiru)',
            short_explanation: 'Expresses ability or possibility.',
            long_explanation: 'Used to say that someone can do an action.',
            formation: 'Verb-る + ことができる',
            p_tag: 'JLPT_N4',
        }]);
        const hints = detectHanabiraGrammarHintsFromIndex('日本語を読むことができる。', index);

        expect(hints[0]).toMatchObject({
            name: 'Verb ることができる (〜ru koto ga dekiru)',
            ruleId: expect.stringContaining('hanabira-'),
            level: 'N4',
            match: 'ことができる',
            kind: 'Hanabira grammar',
        });
    });

    it('hides known grammar rules while keeping a review toggle available', () => {
        const hints = detectGrammarHints('毎日読んでいるので、もっと読みたい。');
        const html = renderGrammarHints(hints, '毎日読んでいるので、もっと読みたい。', {
            knownRuleIds: ['aspect-te-iru'],
            showKnown: false,
        });

        expect(html).toContain('Show known');
        expect(html).toContain('known hidden');
        expect(html).not.toContain('>ている<');
    });

    it('re-parses popup Japanese after rendering grammar study panels', async () => {
        const sentence = '毎日読んでいるので、もっと読みたい。';
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true" data-jpdb-reader-parse-key="${sentence}">
                <div class="jpdb-reader-study-tools">
                    <button type="button" data-action="study-grammar">Grammar</button>
                    <div class="jpdb-reader-study-panel" data-study-panel hidden></div>
                </div>
            </div>
        `;
        const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
        const button = document.querySelector<HTMLButtonElement>('[data-action="study-grammar"]')!;
        const parsePopoverJapanese = vi.fn(async (target: HTMLElement) => {
            expect(target).toBe(popover);
            expect(target.dataset.jpdbReaderParseKey).toBeUndefined();
        });
        const controller = new CardActionController({
            getSettings: () => DEFAULT_SETTINGS,
            detectGrammarHints: async (value: string) => detectGrammarHints(value),
            parsePopoverJapanese,
            playAudio: vi.fn(),
            playSentenceAudio: vi.fn(),
            showSettings: vi.fn(),
            toast: vi.fn(),
        } as unknown as ConstructorParameters<typeof CardActionController>[0]);

        await controller.perform('study-grammar', button, card, sentence);

        expect(parsePopoverJapanese).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.jpdb-reader-study-original')?.textContent).toBe(sentence);
        expect(document.querySelector<HTMLElement>('[data-study-panel]')?.hidden).toBe(false);
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

    it('preserves dictionary-provided form table symbols', () => {
        const html = glossaryToHtml({
            tag: 'td',
            data: { class: 'form-valid' },
            content: { tag: 'span', title: 'valid form/reading combination', content: '○' },
        }, 'Jitendex');

        expect(html).toContain('data-sc-class="form-valid"');
        expect(html).toContain('title="valid form/reading combination"');
        expect(html).toContain('>○</span>');
    });

    it('renders Yomitan structured image metadata', () => {
        const html = glossaryToHtml({
            type: 'image',
            path: 'scan.png',
            width: 40,
            height: 20,
            preferredHeight: 5,
            pixelated: true,
            collapsed: true,
            collapsible: false,
            verticalAlign: 'middle',
            title: 'source scan',
            alt: 'scan description',
        }, 'Daijisen');

        expect(html).toContain('class="gloss-image-link"');
        expect(html).toContain('data-dictionary="Daijisen"');
        expect(html).toContain('data-path="scan.png"');
        expect(html).toContain('data-image-rendering="pixelated"');
        expect(html).toContain('data-collapsed="true"');
        expect(html).toContain('data-collapsible="false"');
        expect(html).toContain('data-vertical-align="middle"');
        expect(html).toContain('style="width:40em;"');
        expect(html).toContain('padding-top:12.5%;');
        expect(html).toContain('title="source scan"');
        expect(html).toContain('scan description');
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

    it('renders Yomitan JPDB kanji links as in-reader kanji actions', () => {
        const html = glossaryToHtml({
            tag: 'a',
            href: '/kanji/%E8%AA%AD',
            content: '読',
        }, 'Jitendex', { internalSearchLinks: true });

        expect(html).toContain('href="#jpdb-reader-kanji-lookup"');
        expect(html).toContain('data-action="kanji"');
        expect(html).toContain('data-kanji="読"');
        expect(html).toContain('data-external="false"');
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

    it('preserves nested dictionary CSS for Jitendex forms table symbols', () => {
        const css = renderDictionaryScopedStyles([
            {
                title: 'Jitendex',
                alias: 'Jitendex',
                enabled: true,
                priority: 0,
                styles: `
                    td[data-sc-class="form-valid"] > span {
                        color: var(--background-color);
                        &::before {
                            content: "◇";
                        }
                    }
                    div[data-sc-content="xref"], div[data-sc-content="antonym"] {
                        & span[data-sc-content="reference-label"] {
                            color: brown;
                        }
                    }
                `,
            },
        ]);

        expect(css).toContain('[data-dictionary="Jitendex"] td[data-sc-class="form-valid"] > span');
        expect(css).toContain('&::before');
        expect(css).toContain('content: "◇";');
        expect(css).toContain('[data-dictionary="Jitendex"] div[data-sc-content="xref"], [data-dictionary="Jitendex"] div[data-sc-content="antonym"]');
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

    it('does not fetch AnkiConnect directly from content pages without the userscript bridge', async () => {
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not be called'))));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));

            await expect(client.isConnected()).resolves.toBe(false);
            expect(fetch).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('opens AnkiMobile addnote URLs with full Yomu fields on iOS handoff', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const locationStub = { href: 'https://reader.test/article', origin: 'https://reader.test', hostname: 'reader.test' };
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.stubGlobal('location', locationStub);
        vi.stubGlobal('fetch', fetchMock);

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Mobile Deck',
                ankiModel: 'Yomu Japanese',
                ankiTags: 'yomu mobile',
            };
            const client = new AnkiConnectClient(() => settings);
            const noteId = await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
            }, '今日は本を読む。');
            const params = new URL(locationStub.href).searchParams;

            expect(noteId).toBeNull();
            expect(fetchMock).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiMobile to add "読む"?');
            expect(locationStub.href.startsWith('anki://x-callback-url/addnote?')).toBe(true);
            expect(params.get('type')).toBe('Yomu Japanese');
            expect(params.get('deck')).toBe('Mobile Deck');
            expect(params.get('tags')).toBe('yomu mobile');
            expect(params.get('dupes')).toBe('1');
            expect(params.get('fldExpression')).toBe('読む');
            expect(params.get('fldSentence')).toContain('<span class="yomu-highlight">読む</span>');
            expect(params.get('fldMeaning')).toContain('<div class="yomu-definition">');
            expect(params.get('fldMeaning')).toContain('to read');
            expect(params.get('fldImage')).toBeNull();
        } finally {
            confirmSpy.mockRestore();
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('opens mobile Anki handoff from card actions without waiting on hosted detail providers', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const locationStub = {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        };
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const toast = vi.fn();
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiMobileHandoff: true,
            ankiDeck: 'Mobile Deck',
            ankiModel: 'Yomu Japanese',
        };
        const dictionaries = {
            lookup: vi.fn(() => Promise.reject(new Error('local terms should not be queried'))),
            lookupKanji: vi.fn(() => Promise.reject(new Error('local kanji should not be queried'))),
            lookupTermMeta: vi.fn(() => Promise.reject(new Error('local metadata should not be queried'))),
        };
        const resolveMiningContext = vi.fn(() => Promise.reject(new Error('mining context should not be resolved')));
        vi.stubGlobal('location', locationStub);
        vi.stubGlobal('fetch', fetchMock);

        try {
            const controller = new CardActionController({
                getSettings: () => settings,
                jpdb: {} as JpdbClient,
                anki: new AnkiConnectClient(() => settings),
                dictionaries: dictionaries as unknown as YomitanDictionaryStore,
                isJpdbBackedCard: () => true,
                resolveMiningContext,
                showCard: vi.fn(async () => undefined),
                getActivePopoverAnchor: () => undefined,
                getActivePopoverMode: () => undefined,
                showSettings: vi.fn(),
                playAudio: vi.fn(async () => undefined),
                playSentenceAudio: vi.fn(async () => undefined),
                detectGrammarHints: vi.fn(async () => []),
                parsePopoverJapanese: vi.fn(),
                toast,
            });
            const button = document.createElement('button');

            await expect(controller.perform('anki', button, {
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。')).resolves.toBe(true);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(dictionaries.lookup).not.toHaveBeenCalled();
            expect(dictionaries.lookupKanji).not.toHaveBeenCalled();
            expect(dictionaries.lookupTermMeta).not.toHaveBeenCalled();
            expect(resolveMiningContext).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiMobile to add "読む"?');
            expect(locationStub.href.startsWith('anki://x-callback-url/addnote?')).toBe(true);
            expect(new URL(locationStub.href).searchParams.get('deck')).toBe('Mobile Deck');
            expect(toast).toHaveBeenCalledWith('Sent to Anki.');
        } finally {
            confirmSpy.mockRestore();
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('uses AnkiMobile handoff on iPadOS desktop-mode Safari', async () => {
        const originalUserAgent = navigator.userAgent;
        const originalPlatform = navigator.platform;
        const originalMaxTouchPoints = navigator.maxTouchPoints;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            configurable: true,
        });
        Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
        Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
        const locationStub = { href: 'https://reader.test/article', origin: 'https://reader.test', hostname: 'reader.test' };
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.stubGlobal('location', locationStub);
        vi.stubGlobal('fetch', fetchMock);

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Mobile Deck',
                ankiModel: 'Yomu Japanese',
            }));
            await client.addCard({
                ...card,
                spelling: '月光',
                reading: 'げっこう',
                meanings: [{ glosses: ['moonlight'], partOfSpeech: [] }],
            }, '月光が水面を照らした。');

            expect(fetchMock).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiMobile to add "月光"?');
            expect(locationStub.href.startsWith('anki://x-callback-url/addnote?')).toBe(true);
        } finally {
            confirmSpy.mockRestore();
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            Object.defineProperty(window.navigator, 'platform', { value: originalPlatform, configurable: true });
            Object.defineProperty(window.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('opens AnkiDroid ACTION_SEND intent handoff on Android without using AnkiConnect', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            configurable: true,
        });
        const locationStub = { href: 'https://reader.test/article', origin: 'https://reader.test', hostname: 'reader.test' };
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.stubGlobal('location', locationStub);
        vi.stubGlobal('fetch', fetchMock);

        try {
            const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true };
            const client = new AnkiConnectClient(() => settings);
            await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。');
            const textMatch = /S\.android\.intent\.extra\.TEXT=([^;]*)/.exec(locationStub.href);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiDroid to add "読む"?');
            expect(locationStub.href).toContain('intent:#Intent;action=android.intent.action.SEND;type=text/plain;package=com.ichi2.anki');
            expect(locationStub.href).toContain('S.android.intent.extra.SUBJECT=%E8%AA%AD%E3%82%80');
            expect(locationStub.href).toContain('S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.ichi2.anki');
            expect(textMatch).not.toBeNull();
            expect(decodeURIComponent(textMatch?.[1] ?? '')).toContain('よむ');
            expect(decodeURIComponent(textMatch?.[1] ?? '')).toContain('to read');
            expect(decodeURIComponent(textMatch?.[1] ?? '')).not.toContain('<div');
        } finally {
            confirmSpy.mockRestore();
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('skips existing-card AnkiConnect lookups when mobile handoff is active', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true }));
            await expect(client.findExistingCards(card)).resolves.toEqual({ state: 'not-in-deck', notes: [], primary: null });
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('skips existing-card AnkiConnect lookups on iPadOS desktop-mode Safari', async () => {
        const originalUserAgent = navigator.userAgent;
        const originalPlatform = navigator.platform;
        const originalMaxTouchPoints = navigator.maxTouchPoints;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            configurable: true,
        });
        Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
        Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true }));
            await expect(client.findExistingCards(card)).resolves.toEqual({ state: 'not-in-deck', notes: [], primary: null });
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            Object.defineProperty(window.navigator, 'platform', { value: originalPlatform, configurable: true });
            Object.defineProperty(window.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
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
                <tr><td>Type</td><td>Jōyō kanji ?</td></tr>
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
            type: 'Jōyō kanji',
            heisig: '372',
            readings: [{ reading: 'よ', share: '(82%)', common: true }],
            components: [{ kanji: '言', keyword: 'say' }],
            usedInKanji: [{ kanji: '讀', keyword: 'read' }],
            vocabulary: [{ expression: '読む', reading: 'よむ', meaning: 'to read' }],
        });
    });

    it('renders JPDB kanji facts without leaking table help markers', () => {
        const html = renderJpdbKanjiInfo({
            kanji: '読',
            keyword: 'read',
            frequency: 'Top 400-500',
            type: 'Jōyō kanji',
            kanken: '9',
            heisig: '372',
            oldForms: [],
            readings: [],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, 'en');

        expect(html).toContain('Name');
        expect(html).toContain('read');
        expect(html).toContain('Jōyō kanji');
        expect(html).not.toContain('Jōyō kanji ?');
    });

    it('keeps RTK components in the compact elements row only', () => {
        const html = renderRtkInfo({
            kanji: '迎',
            keyword: 'welcome',
            frameNumber: 'Frame number V4: 1702',
            onYomi: 'ゲイ',
            kunYomi: 'むか.える',
            elements: '匕 welcome, 卩 stamp album, road',
            componentKanji: ['匕', '卩'],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [
            { kanji: '匕', keyword: 'spoon', meaning: 'spoon' },
            { kanji: '卩', keyword: 'crooked seal', meaning: 'crooked seal' },
        ], 'en');

        expect(html).toContain('jpdb-reader-rtk-elements');
        expect(html).not.toContain('jpdb-reader-component-grid');
    });

    it('maps RTK component aliases without showing the current keyword or plus separators', () => {
        const html = renderRtkInfo({
            kanji: '習',
            keyword: 'learn',
            frameNumber: 'Frame number V4: 574',
            onYomi: 'シュウ',
            kunYomi: 'なら.う',
            elements: 'learn, feathers, wings, white, dove',
            componentKanji: [],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [
            { kanji: '羽', keyword: 'feathers', meaning: 'feathers' },
            { kanji: '白', keyword: 'white', meaning: 'white' },
        ], 'en');

        expect(html).not.toContain('<span>learn</span>');
        expect(html).not.toContain('<span>+</span>');
        expect(html).toContain('data-kanji="羽"');
        expect(html).toContain('<strong>羽</strong><span>wings</span>');
        expect(html).toContain('data-kanji="白"');
        expect(html).toContain('<strong>白</strong><span>dove</span>');
        expect(KANJI_CSS).not.toContain('content: "+"');
    });

    it('renders actual RTK primitive glyphs beside keyword-only elements', () => {
        const html = renderRtkInfo({
            kanji: '必',
            keyword: 'invariably',
            frameNumber: 'Frame number V4: 635',
            onYomi: 'ヒツ',
            kunYomi: 'かなら.ず',
            elements: 'invariably, heart, stick, drop, fishhook, drop3',
            componentKanji: [],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [], 'en');

        expect(html).not.toContain('<span>invariably</span>');
        expect(html).toContain('data-kanji="心"');
        expect(html).toContain('<strong>心</strong><span>heart</span>');
        expect(html).toContain('<strong>丨</strong><span>stick</span>');
        expect(html).toContain('<strong>丶</strong><span>drop</span>');
        expect(html).toContain('data-kanji="乙"');
        expect(html).toContain('<strong>乙</strong><span>fishhook</span>');
        expect(html).not.toContain('drop3');
    });

    it('keeps duplicate RTK search keywords out of the reverse index', () => {
        const index = parseRtkSearchIndex(`
            var docs = [
                { "kanji" : "心", "keyword" : "heart", "elements" : "heart" },
                { "kanji" : "羽", "keyword" : "feathers", "elements" : "feathers, wings" },
                { "kanji" : "白", "keyword" : "white", "elements" : "white" },
                { "kanji" : "偽", "keyword" : "heart", "elements" : "fake duplicate" }
            ];
        `);

        expect(index.get('feathers')).toBe('羽');
        expect(index.get('heart')).toBeUndefined();
    });

    it('surfaces JPDB kanji mining controls only when the kanji page exposes them', () => {
        const info = parseJpdbKanjiHtml(`
            <meta name="description" content="Dictionary definition of kanji 読 (よ) — read">
            <div class="result kanji">
                <div class="menu">
                    <form action="/kanji/%E8%AA%AD" method="post">
                        <input type="hidden" name="csrf" value="token">
                        <button name="action" value="add">Add to kanji deck</button>
                        <button name="action" value="never">Never forget</button>
                    </form>
                    <a href="/kanji/%E8%AA%AD?blacklist=1">Blacklist</a>
                </div>
            </div>
            <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
        `, '読');

        expect(info?.loggedIn).toBe(true);
        expect(info?.kanjiReviewsEnabled).toBe(true);
        expect(visibleJpdbKanjiActions(info).map(action => [action.label, action.role, action.method, action.payload.action])).toEqual([
            ['Add to kanji deck', 'mine', 'POST', 'add'],
            ['Never forget', 'neverforget', 'POST', 'never'],
            ['Blacklist', 'blacklist', 'GET', undefined],
        ]);
    });

    it('does not treat JPDB kanji setup links as mining controls', () => {
        const info = parseJpdbKanjiHtml(`
            <a href="/login">Login</a>
            <div class="result kanji"><div class="menu"><a href="/settings">Enable kanji reviews</a></div></div>
            <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
        `, '読');

        expect(info?.loggedIn).toBe(false);
        expect(info?.kanjiReviewsEnabled).toBe(false);
        expect(visibleJpdbKanjiActions(info)).toEqual([]);
    });

    it('loads hosted new-tab JPDB kanji info through the configured public proxy', async () => {
        const proxyUrl = 'https://yomu-proxy.example/fetch';
        const target = 'https://jpdb.io/kanji/%E5%9B%B3';
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            expect(String(input)).toBe(`${proxyUrl}?url=${encodeURIComponent(target)}`);
            return Promise.resolve(new Response(`
                <meta name="description" content="Dictionary definition of kanji 図 — diagram">
                <div class="result kanji">
                    <h6 class="subsection-label">Keyword</h6><div class="subsection">diagram</div>
                    <table class="cross-table"><tr><td>Frequency</td><td>1,234</td></tr></table>
                </div>
            `, { status: 200 }));
        });
        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab.html', origin: 'https://hrussellzfac023.github.io', hostname: 'hrussellzfac023.github.io' });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const client = new JpdbKanjiClient(() => proxyUrl);

            await expect(client.lookup('図')).resolves.toMatchObject({
                kanji: '図',
                keyword: 'diagram',
                frequency: '1,234',
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not send logged-in JPDB kanji actions to configured or public proxies', async () => {
        const proxyUrl = 'https://yomu-proxy.example/fetch';
        const target = 'https://jpdb.io/kanji/%E8%AA%AD';
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            expect(String(input)).toBe(`${proxyUrl}?url=${encodeURIComponent(target)}`);
            return Promise.resolve(new Response(`
                <meta name="description" content="Dictionary definition of kanji 読 — read">
                <div class="result kanji">
                    <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
                    <div class="menu">
                        <form action="/kanji/%E8%AA%AD" method="post">
                            <input type="hidden" name="csrf" value="private-token">
                            <button name="action" value="known">Mark known</button>
                        </form>
                    </div>
                </div>
            `, { status: 200 }));
        });
        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab.html', origin: 'https://hrussellzfac023.github.io', hostname: 'hrussellzfac023.github.io' });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const client = new JpdbKanjiClient(() => proxyUrl);
            const info = await client.lookup('読');
            const action = visibleJpdbKanjiActions(info)[0];

            await expect(client.performAction(action.id)).rejects.toThrow(/configured proxy|userscript/i);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock.mock.calls.map(([url]) => String(url)).join('\n')).not.toContain('private-token');
        } finally {
            vi.unstubAllGlobals();
        }
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

    it('moves Uchisen enrollment paywall cards behind free mnemonics', () => {
        const images = parseUchisenImages(`
            <div class="kanji_image_loader" data-large="https://dhblqbsgkimuk.cloudfront.net/kanji/enrollment.png"></div>
            <div id="mnemonic_story">Please subscribe to <a href="/enroll">uchisenPRO</a> to be able to view this mnemonic and hand-drawn picture, along with hundreds more!</div>
            <div class="mnemonic_card selected_mnemonic">
                <input class="story" value="Please subscribe to &lt;a href=&quot;/enroll&quot;&gt;uchisenPRO&lt;/a&gt; to be able to view this mnemonic and hand-drawn picture, along with hundreds more!">
                <input class="image_url" value="/kanji/enrollment.png">
                <input class="can_show_current_mnemonic" value="false">
            </div>
            <div class="mnemonic_card">
                <input class="story" value="Free story one">
                <input class="image_url" value="generated_free_one.jpg">
                <input class="can_show_current_mnemonic" value="true">
            </div>
            <div class="mnemonic_card">
                <input class="story" value="Free story two">
                <input class="image_url" value="generated_free_two.jpg">
                <input class="can_show_current_mnemonic" value="true">
            </div>
        `);

        expect(images).toEqual([
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_free_one.jpg', story: 'Free story one' },
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_free_two.jpg', story: 'Free story two' },
            {
                url: 'https://dhblqbsgkimuk.cloudfront.net/kanji/enrollment.png',
                story: 'Please subscribe to uchisenPRO to be able to view this mnemonic and hand-drawn picture, along with hundreds more!',
            },
        ]);
    });

    it('does not restore an unstarred Uchisen paywall index when free cards exist', async () => {
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/uchisen'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }))));
        localStorage.setItem('yomu-jpdb-uchisen-index:具', JSON.stringify(1));
        localStorage.removeItem('yomu-jpdb-uchisen-star:具');
        const mount = document.createElement('div');
        let cleanup: (() => void) | null = null;

        try {
            document.body.append(mount);
            cleanup = await installUchisenCarousel(mount, '具', [
                { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_free.jpg', story: 'Free mnemonic' },
                {
                    url: 'https://ik.imagekit.io/uchisen/kanji/enrollment.png',
                    story: 'Please subscribe to uchisenPRO to be able to view this mnemonic and hand-drawn picture, along with hundreds more!',
                },
            ]);

            expect(mount.querySelector('.yomu-jpdb-counter')?.textContent).toBe('1/2');
            expect(mount.querySelector('.yomu-jpdb-story')?.textContent).toBe('Free mnemonic');
        } finally {
            cleanup?.();
            mount.remove();
            localStorage.removeItem('yomu-jpdb-uchisen-index:具');
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            vi.unstubAllGlobals();
        }
    });

    it('loads Uchisen mnemonic HTML through the configured public proxy', async () => {
        const proxyUrl = 'https://yomu-proxy.example/fetch';
        const target = 'https://uchisen.com/kanji/%E5%9B%B3';
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            expect(String(input)).toBe(`${proxyUrl}?url=${encodeURIComponent(target)}`);
            return Promise.resolve(new Response(`
                <div class="kanji_image_loader" data-large="generated_diagram.jpg"></div>
                <div id="mnemonic_story">Picture the diagram.</div>
            `, { status: 200 }));
        });
        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab.html', origin: 'https://hrussellzfac023.github.io', hostname: 'hrussellzfac023.github.io' });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(loadUchisenImages('図', proxyUrl)).resolves.toEqual([
                { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_diagram.jpg', story: 'Picture the diagram.' },
            ]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
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

    it('treats JPDB kanji reveal DOM as the back side even before the URL response flag updates', () => {
        window.history.replaceState(null, '', '/review?c=kb,%E8%AA%AD#a');
        document.body.innerHTML = `
            <div class="review-reveal">
                <input name="c" value="kb,読">
                <div class="answer-box">
                    <a class="kanji plain" href="/kanji/%E8%AA%AD">読</a>
                </div>
            </div>
        `;

        expect(isKanjiReviewFront()).toBe(false);
        expect(isKanjiReviewBack()).toBe(true);
    });

    it('sanitizes stroke-order SVGs before embedding them', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <path d="M10,10 C20,20 30,20 40,10" onclick="alert(1)" />
                <path d="bad url(javascript:alert(1))" />
                <text transform="matrix(1 0 0 1 8 12)">1</text>
                <script>alert(1)</script>
            </svg>
        `, '読');

        expect(info?.strokeCount).toBe(1);
        expect(info?.strokeShapes?.[0].length).toBeGreaterThan(2);
        expect(info?.svg).toContain('jpdb-reader-kanjivg-svg');
        expect(info?.svg).toContain('<text transform=');
        expect(info?.svg).not.toContain('onclick');
        expect(info?.svg).not.toContain('script');
        expect(info?.svg).not.toContain('javascript');
    });

    it('uses KanjiVG component positions for straight origin graph arrows', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="思">
                    <g kvg:element="田" kvg:position="top">
                        <path d="M10,10 L20,20" />
                    </g>
                    <g kvg:element="心" kvg:position="bottom">
                        <path d="M30,70 L40,80" />
                    </g>
                </g>
            </svg>
        `, '思');
        const graph = buildKanjiOriginGraph('思', null, null, [], null, info);

        expect(graph.nodes.find(node => node.id === '田')?.position).toBe('top');
        expect(graph.nodes.find(node => node.id === '心')?.position).toBe('bottom');

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('data-target-zone="top"');
        expect(html).toContain('data-target-zone="bottom"');
        expect(html).not.toMatch(/class="jpdb-reader-origin-edge" d="[^"]*[QC]/);
    });

    it('adds nested KanjiVG subcomponents as a separate graph layer', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="敬">
                    <g kvg:element="苟" kvg:position="left">
                        <g kvg:element="艹" kvg:position="top">
                            <path d="M10,20 L45,20" />
                        </g>
                        <g kvg:element="句" kvg:position="bottom">
                            <path d="M15,50 L45,50" />
                            <g kvg:element="口" kvg:position="right">
                                <path d="M30,62 L44,62 L44,78 L30,78 Z" />
                            </g>
                        </g>
                    </g>
                    <g kvg:element="攵" kvg:position="right">
                        <path d="M64,20 L92,88" />
                    </g>
                </g>
            </svg>
        `, '敬');
        const graph = buildKanjiOriginGraph('敬', null, null, [], null, info);

        expect(info?.componentPositions).toEqual(expect.arrayContaining([
            expect.objectContaining({ component: '苟', direct: true, depth: 1 }),
            expect.objectContaining({ component: '艹', parent: '苟', position: 'top', direct: false, depth: 2 }),
            expect.objectContaining({ component: '口', parent: '句', position: 'right', direct: false, depth: 3 }),
        ]));
        expect(graph.edges).toEqual(expect.arrayContaining([
            { from: '苟', to: '敬', label: 'KanjiVG component' },
            { from: '艹', to: '苟', label: 'subcomponent' },
            { from: '句', to: '苟', label: 'subcomponent' },
            { from: '口', to: '句', label: 'subcomponent' },
        ]));

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('data-origin-has-subcomponents="true"');
        expect(html).toContain('data-origin-subcomponent-toggle');
        expect(html).toContain('data-origin-subcomponent="true"');
        expect(html).toContain('class="jpdb-reader-origin-edge-group subcomponent"');
        expect(html).toContain('data-graph-node="口"');
        expect(html).toContain('data-target-zone="right"');
    });

    it('keeps 友 components visually anchored and distinguishes outbound graph links', () => {
        const graph = buildKanjiOriginGraph('友', {
            kanji: '友',
            keyword: 'friend',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: 'ナ', keyword: "by one's side" }, { kanji: '又', keyword: 'once again' }],
            usedInKanji: [
                { kanji: '髪', keyword: 'hair' },
                { kanji: '抜', keyword: 'extract' },
            ],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, [], null, null);

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');

        expect(html).toContain('data-graph-node="ナ"');
        expect(html).toContain('data-graph-node="又"');
        expect(html).toContain('data-target-zone="upper"');
        expect(html).toContain('data-target-zone="bottom"');
        expect(html).toContain('jpdb-reader-origin-edge-arrow-outbound');
        expect(html).toContain('-outbound');
        expect(html).toContain('class="jpdb-reader-origin-edge-group outbound"');
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
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
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

    it('keeps kanji facts useful when only map and stroke data are available', () => {
        const sourceInfo = {
            kanjiMap: parseKanjiMapInfo({
                kanjialiveData: {
                    grade: 1,
                    kstroke: 5,
                    radical: {
                        character: '立',
                        strokes: 5,
                        name: { hiragana: 'たつ', romaji: 'tatsu' },
                        meaning: { english: 'stand' },
                    },
                },
                jishoData: {
                    meaning: 'stand up',
                    jlptLevel: 'N4',
                    taughtIn: 'grade 1',
                    strokeCount: 5,
                    newspaperFrequencyRank: '58',
                    parts: ['亠'],
                },
            }, '立', 'https://example.test/立.json'),
        };
        const facts = buildKanjiFacts('立', null, null, {
            kanji: '立',
            svg: '<svg></svg>',
            strokeCount: 5,
        }, [], sourceInfo);

        expect(facts).toEqual(expect.arrayContaining([
            { label: 'Meaning', value: 'stand up', source: 'Kanji Alive / Jisho' },
            { label: 'JLPT', value: 'N4', source: 'Jisho' },
            { label: 'Grade', value: 'Grade 1', source: 'Kanji Alive / Jisho' },
            { label: 'Strokes', value: '5', source: 'KanjiVG' },
            { label: 'Frequency', value: '#58', source: 'Jisho' },
        ]));
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
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
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
        expect(html).not.toContain('jpdb-reader-origin-edge-particle');
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

    it('parses primary and native VTT subtitle files', () => {
        const japanese = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n今日は本を読む。\n');
        const native = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nToday I read a book.\n');

        expect(japanese).toMatchObject([{ start: 1, end: 3, text: '今日は本を読む。' }]);
        expect(native).toMatchObject([{ start: 1, end: 3, text: 'Today I read a book.' }]);
    });

    it('parses SRT subtitle files from page download buttons', () => {
        const cues = parseSubtitleText('1\n00:00:01,250 --> 00:00:03,500\n今日は本を読む。\n\n2\n00:00:04,000 --> 00:00:05,000\n終わり。');

        expect(cues).toMatchObject([
            { start: 1.25, end: 3.5, text: '今日は本を読む。' },
            { start: 4, end: 5, text: '終わり。' },
        ]);
    });

    it('parses BOM-prefixed SRT files with whole-second timestamps', () => {
        const cues = parseSubtitleText('\uFEFF1\r\n00:00:01 --> 00:00:03\r\n今日は本を読む。\r\n\r\n2\r\n00:00:04 --> 00:00:05\r\n終わり。');

        expect(cues).toMatchObject([
            { start: 1, end: 3, text: '今日は本を読む。' },
            { start: 4, end: 5, text: '終わり。' },
        ]);
    });

    it('discovers page VTT and SRT subtitle sources without site-specific selectors', () => {
        document.body.innerHTML = `
            <video>
                <track kind="subtitles" srclang="ja-JP" label="日本語" src="/media/subtitles.vtt?filename=%E5%B0%8F%E4%BA%BA.vtt&v=123">
            </video>
            <a href="https://media.test/lesson/native.srt" download="native.srt">SRT</a>
            <a href="/lesson/video.mp4">MP4</a>
        `;

        expect(collectPageSubtitleSources(document)).toMatchObject([
            {
                url: expect.stringContaining('/media/subtitles.vtt'),
                label: '小人',
                language: 'ja',
            },
            {
                url: 'https://media.test/lesson/native.srt',
                label: 'native',
                language: 'en',
            },
        ]);
    });

    it('splits multi-sentence subtitle cues with proportional timing', () => {
        const cues = normalizeSubtitleCues([{ start: 10, end: 16, text: '今日は本を読む。明日は学校へ行く。' }]);

        expect(cues).toMatchObject([
            { start: 10, text: '今日は本を読む。', originalText: '今日は本を読む。明日は学校へ行く。' },
            { text: '明日は学校へ行く。', originalText: '今日は本を読む。明日は学校へ行く。' },
        ]);
        expect(cues[0].end).toBeGreaterThan(10);
        expect(cues[1].start).toBe(cues[0].end);
        expect(cues[1].end).toBe(16);
    });

    it('splits overlong subtitle cues without punctuation', () => {
        const cues = normalizeSubtitleCues([{ start: 0, end: 8, text: 'これはとても長い自動生成字幕で句読点がなくても画面からはみ出さないように分割されます' }]);

        expect(cues.length).toBeGreaterThan(1);
        expect(cues[0].start).toBe(0);
        expect(cues.at(-1)?.end).toBe(8);
        expect(cues.every(cue => cue.text.length <= 48)).toBe(true);
    });

    it('parses WebVTT timestamp tags into word timings', () => {
        const [cue] = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<00:00:01.500>今日<00:00:02.500>読む\n');

        expect(cue.text).toBe('今日読む');
        expect(cue.wordTimingsExact).toBe(true);
        expect(cue.words?.[0]).toMatchObject({ text: '今日', start: 1.5 });
        expect(cue.words?.at(-1)?.end).toBe(4);
    });

    it('does not invent karaoke timings for line-level subtitle cues', () => {
        const [plain] = normalizeSubtitleCues([{ start: 1, end: 4, text: 'bottom line. Okay, Nvidia is right now' }]);
        const [phraseTimed] = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<00:00:01.500>bottom line <00:00:02.500>Okay\n');

        expect(plain.wordTimingsExact).toBe(false);
        expect(plain.words).toBeUndefined();
        expect(phraseTimed.wordTimingsExact).not.toBe(true);
        expect(phraseTimed.words).toBeUndefined();
    });

    it('parses YouTube timedtext JSON and XML subtitle payloads', () => {
        const json = parseSubtitleText(JSON.stringify({
            events: [
                { tStartMs: 1250, dDurationMs: 1750, segs: [{ utf8: '今日は' }, { utf8: '本を読む。' }] },
            ],
        }));
        const xml = parseSubtitleText('<transcript><text start="4.5" dur="2">明日 &amp; 勉強</text></transcript>');
        const srv3 = parseSubtitleText('<timedtext><body><p t="1000" d="3000"><s t="0">今日</s><s t="1200">読む</s></p></body></timedtext>');

        expect(json).toMatchObject([{ start: 1.25, end: 3, text: '今日は本を読む。' }]);
        expect(xml).toMatchObject([{ start: 4.5, end: 6.5, text: '明日 & 勉強' }]);
        expect(srv3).toMatchObject([{ start: 1, end: 4, text: '今日読む' }]);
        expect(json[0].wordTimingsExact).toBe(false);
        expect(json[0].words).toBeUndefined();
        expect(srv3[0].wordTimingsExact).toBe(true);
        expect(srv3[0].words).toMatchObject([{ text: '今日', start: 1, end: 2.2 }, { text: '読む', start: 2.2, end: 4 }]);
    });

    it('loads YouTube captions through ordered timedtext fallbacks', async () => {
        const requestedFormats: Array<string | null> = [];
        const cues = await loadYouTubeTrackCues({
            kind: 'youtube',
            label: 'Japanese (ja)',
            language: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
        }, {
            requestText: async url => {
                const format = new URL(url).searchParams.get('fmt');
                requestedFormats.push(format);
                if (format !== 'json3') throw new Error('try the next format');
                return '<timedtext><body><p t="1000" d="3000"><s t="0">今日</s><s t="1200">読む</s></p></body></timedtext>';
            },
        });

        expect(requestedFormats).toEqual(['srv3', 'json3']);
        expect(cues).toMatchObject([{ start: 1, end: 4, text: '今日読む' }]);
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

    it('discovers YouTube caption tracks from the current player response', () => {
        const originalLocation = window.location;
        const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
            videoDetails: { videoId: 'abc123' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja', languageCode: 'ja', name: { simpleText: '日本語' } },
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja', languageCode: 'ja', name: { simpleText: '日本語' } },
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en', kind: 'asr', name: { simpleText: 'English' } },
                    ],
                },
            },
        };

        try {
            const tracks = getYouTubeCaptionTracks();

            expect(tracks).toHaveLength(2);
            expect(tracks[0]).toMatchObject({ label: '日本語 (ja)', language: 'ja', autoGenerated: false });
            expect(tracks[0].url).toContain('fmt=srv3');
            expect(tracks[1]).toMatchObject({ label: 'English (en) · auto-generated', language: 'en', autoGenerated: true });
        } finally {
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
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

    it('silently reparses the page when a clicked reader word has fallen out of cache', async () => {
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
        const toast = vi.fn();
        const internals = app as unknown as {
            getCachedCard: typeof getCachedCard;
            reparseVisiblePage: typeof reparseVisiblePage;
            showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
            toast: typeof toast;
        };
        internals.getCachedCard = getCachedCard;
        internals.reparseVisiblePage = reparseVisiblePage;
        internals.toast = toast;

        try {
            await internals.showWord(word, { trigger: 'click' });
            await vi.runOnlyPendingTimersAsync();

            expect(toast).not.toHaveBeenCalled();
            expect(reparseVisiblePage).toHaveBeenCalledTimes(1);
        } finally {
            app.destroy();
            vi.useRealTimers();
        }
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

    it('uses Comprehensible Japanese transcript parsing across native ruby and cue controls', () => {
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
            <div class="transcript">
                <p>
                    <button class="cue-button">play</button>
                    <span><ruby>小人<rt class="kanji">こびと</rt></ruby>は<ruby>帽子<rt class="kanji">ぼうし</rt></ruby>を<ruby>被<rt class="kanji">かぶ</rt></ruby>っています。</span>
                </p>
            </div>
        `;
        const targets = collectSiteScanTargets(10, 'https://cijapanese.com/video/560') ?? [];
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['小人は帽子を被っています。']);

        applyTokensToScanTarget(targets[0], [{
            card: { ...card, cardState: ['known'], spelling: '被る', reading: 'かぶる' },
            start: 6,
            end: 9,
            length: 3,
            rubies: [{ text: 'かぶ', start: 6, end: 7, length: 1 }],
            pitchClass: '',
            sentence: '小人は帽子を被っています。',
        }], DEFAULT_SETTINGS);

        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['被', 'って']);
        expect(words.every(word => word.dataset.sentence === '小人は帽子を被っています。')).toBe(true);
        expect(document.querySelectorAll('.jpdb-reader-word rt')).toHaveLength(0);
    });

    it('recovers full mining sentences around old partial transcript highlights', () => {
        document.body.innerHTML = `
            <p>
                <span><ruby>花<rt>はな</rt></ruby>を<ruby>持<rt>も</rt></ruby><span class="jpdb-reader-word jpdb-known" data-sentence="っています。">って</span>います。</span>
            </p>
        `;

        expect(nearestReadableSentenceForElement(document.querySelector<HTMLElement>('.jpdb-reader-word')!, 'っています。'))
            .toBe('花を持っています。');
    });

    it('keeps product-page translation context near the looked-up word', () => {
        document.body.innerHTML = `
            <div class="product-detail">
                <span class="jpdb-reader-word jpdb-known" data-sentence="仏花">仏花</span>
                ・お供え・お悔やみ花特集 自宅用にも、送る用にも。贈るシーンや予算、お花のカテゴリ別にさまざまなお供え・お悔やみ花をご用意しています。
                価格帯で探す 3,000円〜 5,000円〜 お花のカテゴリで探す アレンジメント プリザーブドフラワー 胡蝶蘭
            </div>
        `;

        expect(nearestReadableSentenceForElement(document.querySelector<HTMLElement>('.jpdb-reader-word')!, '仏花'))
            .toBe('仏花・お供え・お悔やみ花特集');
    });

    it('clamps long lookup context when no sentence boundary is nearby', () => {
        const longText = `価格帯で探す 3,000円〜 5,000円〜 ${'お供え花 '.repeat(80)}`;
        document.body.innerHTML = `<div>${longText}<span class="jpdb-reader-word jpdb-known" data-sentence="仏花">仏花</span>${' アレンジメント'.repeat(80)}</div>`;

        const sentence = nearestReadableSentenceForElement(document.querySelector<HTMLElement>('.jpdb-reader-word')!, '仏花');
        expect(sentence).toContain('仏花');
        expect(sentence.length).toBeLessThanOrEqual(180);
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

        const targets = collectScanTargets(10, 'http://127.0.0.1:5174/article/');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '青空の下で日本語を読む',
            '今日は静かな喫茶店で新しい本を読みました。',
        ]);
    });

    it('scans all visible NHK Easy Japanese text with the site parser', () => {
        const visibleRect = {
            left: 0,
            right: 800,
            top: 0,
            bottom: 200,
            width: 800,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
        document.body.innerHTML = `
            <header id="nhk-one-header">
                <button>メニュー</button>
                <nav><a href="/news">ニュース</a></nav>
            </header>
            <main>
                <article>
                    <h1 class="article-title">東京でニュースを読む</h1>
                    <div id="js-article-body">
                        <p>今日は本を読みます。</p>
                    </div>
                    <div class="article-buttons">
                        <div><a class="listen-news" href="#audio">ニュースを聞く</a></div>
                        <div><button>漢字の読み方を消す</button></div>
                    </div>
                </article>
            </main>
            <aside>
                <h2>災害で気をつけること</h2>
                <a href="/typhoon">台風</a>
            </aside>
            <footer id="nhk-one-footer">
                <p>許可なく転載することを禁じます。</p>
            </footer>
        `;
        document.querySelectorAll<HTMLButtonElement>('button')
            .forEach(button => { button.getBoundingClientRect = () => visibleRect; });

        const targets = collectScanTargets(10, 'https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            'メニュー',
            'ニュース',
            '東京でニュースを読む',
            '今日は本を読みます。',
            'ニュースを聞く',
            '漢字の読み方を消す',
            '災害で気をつけること',
            '台風',
            '許可なく転載することを禁じます。',
        ]);
        expect(targets.every(target => 'parserId' in target && target.parserId === 'nhk-parser')).toBe(true);
    });

    it('does not scan NHK Easy article audio and ruby controls', () => {
        const visibleRect = {
            left: 0,
            right: 800,
            top: 0,
            bottom: 200,
            width: 800,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
        document.body.innerHTML = `
            <main>
                <article>
                    <h1 class="article-title"><ruby>東京<rt>とうきょう</rt></ruby>でニュースを読む</h1>
                    <div class="article-top-tool">
                        <div class="article-buttons">
                            <a href="#" class="article-buttons__audio js-open-audio">
                                <span>ニュースを<ruby>聞<rt>き</rt></ruby>く</span>
                            </a>
                            <a href="#" class="article-buttons__ruby js-toggle-ruby is-ruby --pc">
                                <ruby>漢字<rt>かんじ</rt></ruby>の<ruby>読<rt>よ</rt></ruby>み<ruby>方<rt>かた</rt></ruby>を<ruby>消<rt>け</rt></ruby>す
                            </a>
                        </div>
                        <a href="#" class="article-buttons__ruby js-toggle-ruby is-ruby --sp">
                            <ruby>漢字<rt>かんじ</rt></ruby>の<ruby>読<rt>よ</rt></ruby>み<ruby>方<rt>かた</rt></ruby>を<ruby>消<rt>け</rt></ruby>す
                        </a>
                        <div class="audio-player" id="js-audio-wrapper">
                            <div id="js-audio-inner">音声</div>
                        </div>
                    </div>
                    <div id="js-article-body">
                        <p><ruby>今日は<rt>きょうは</rt></ruby>本を読みます。</p>
                    </div>
                </article>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://news.web.nhk/news/easy/ne2026051413177/ne2026051413177.html');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '東京でニュースを読む',
            '今日は本を読みます。',
        ]);
        expect(targets.map(target => target.text)).not.toContain('ニュースを聞く');
        expect(targets.map(target => target.text)).not.toContain('漢字の読み方を消す');
    });

    it('rescans Japanese text when NHK menu visibility attributes change', () => {
        const dialog = document.createElement('dialog');
        dialog.textContent = 'メニュー';
        const mutation = {
            type: 'attributes',
            target: dialog,
            addedNodes: [],
        } as unknown as MutationRecord;

        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributes).toBe(true);
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeFilter).toContain('open');
        expect(mutationMayContainJapaneseText(mutation)).toBe(true);
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
            'wikipedia-parser',
            'satori-reader-parser',
            'nhk-parser',
            'bunpro-parser',
            'asbplayer-parser',
        ]));
        expect(getMatchingSiteParsers('https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html').map(profile => profile.id))
            .toContain('nhk-parser');
        expect(getMatchingSiteParsers('file:///Users/me/mokuro/book/index.html').map(profile => profile.id))
            .toContain('mokuro-parser');
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

    it('caps default YouTube watch scans so comment-heavy pages stay responsive', () => {
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
                <h1><yt-formatted-string>日本語タイトル</yt-formatted-string></h1>
            </ytd-watch-metadata>
            ${Array.from({ length: 120 }, (_, index) => `
                <ytd-comment-view-model>
                    <yt-attributed-string id="content-text">コメント${index}です</yt-attributed-string>
                </ytd-comment-view-model>
            `).join('')}
        `;

        const targets = collectScanTargets(undefined, 'https://www.youtube.com/watch?v=TAorfFcb8_g');
        rectSpy.mockRestore();

        expect(targets).toHaveLength(80);
        expect(targets[0]?.text).toBe('日本語タイトル');
        expect(targets.map(target => target.text)).not.toContain('コメント119です');
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
        expect(getMatchingSiteParsers('http://127.0.0.1:5174/article/').map(profile => profile.id))
            .not.toContain('asbplayer-parser');

        document.body.innerHTML += '<div class="asbplayer-offscreen">今日は読む</div>';
        expect(getMatchingSiteParsers('http://127.0.0.1:5174/article/').map(profile => profile.id))
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

    it('scans JPDB example sentences so word color settings apply there too', () => {
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
            <div class="subsection-examples">
                <div class="subsection">
                    <div class="used-in">
                        <div class="jp">あの仕事は少なくとも１０日はかかるな。</div>
                        <div class="en">That job will take at least ten days.</div>
                    </div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jpdb.io/review');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toContain('あの仕事は少なくとも１０日はかかるな。');
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

    it('does not treat YouTube Shorts titles near the video as page captions', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/shorts/abc123') as unknown as Location,
        });
        document.body.innerHTML = `
            <video></video>
            <h3 class="shortsLockupViewModelHostMetadataTitle"><span>鉛筆の音1時間 目を閉じて聴いていたら</span></h3>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const title = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 260, right: 860, top: 120, bottom: 720, width: 600, height: 600 }),
        });
        Object.defineProperty(title, 'innerText', { value: title.textContent ?? '' });
        Object.defineProperty(title, 'getBoundingClientRect', {
            value: () => ({ left: 300, right: 820, top: 740, bottom: 782, width: 520, height: 42 }),
        });

        try {
            expect(readPageCaptionText(video)).toBe('');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
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

    it('deletes the local dictionary database while another Yomu tab has it open', async () => {
        const resetStore = new YomitanDictionaryStore();
        await resetStore.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 10, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'reset-blocked-dictionaries.json', { type: 'application/json' });

        await resetStore.importFile(file);
        const newTabStore = new YomitanDictionaryStore();
        expect(await newTabStore.countEntries()).toBe(1);

        await resetStore.deleteDatabase();

        expect(await newTabStore.countEntries()).toBe(0);
        expect(await resetStore.countEntries()).toBe(0);
    });

    it('factory reset clears dictionary entries even if database deletion stays blocked', async () => {
        const resetStore = new YomitanDictionaryStore();
        await resetStore.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 10, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'reset-blocked-fallback-dictionaries.json', { type: 'application/json' });
        await resetStore.importFile(file);

        const blockingDb = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 2);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        try {
            const result = await resetStore.resetDatabase({ deleteTimeoutMs: 20 });

            expect(result).toEqual({ cleared: true, deleted: false });
            await expect(new Promise<number>((resolve, reject) => {
                const request = blockingDb.transaction('terms', 'readonly').objectStore('terms').count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            })).resolves.toBe(0);
        } finally {
            blockingDb.close();
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    });

    it('deduplicates alternate readings for the same Yomitan sequence and glossary', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const formsGlossary = [{
            type: 'structured-content',
            content: [
                { tag: 'ul', content: [{ tag: 'li', content: 'fifth sign of the Chinese calendar' }] },
                {
                    tag: 'table',
                    data: { content: 'forms' },
                    content: [
                        { tag: 'tr', data: { content: 'forms-header-row' }, content: [{ tag: 'th', content: '' }, { tag: 'th', content: '戊' }] },
                        { tag: 'tr', content: [{ tag: 'th', content: 'つちのえ' }, { tag: 'td', data: { class: 'form-valid' }, content: { tag: 'span', title: 'valid form/reading combination', content: '' } }] },
                        { tag: 'tr', content: [{ tag: 'th', content: 'ぼ' }, { tag: 'td', data: { class: 'form-valid' }, content: { tag: 'span', title: 'valid form/reading combination', content: '' } }] },
                    ],
                },
            ],
        }];
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '戊', reading: 'つちのえ', glossary: formsGlossary, sequence: 1584050, score: 10, dictionary: 'Jitendex' }] },
                        { $: [2, { expression: '戊', reading: 'ぼ', glossary: formsGlossary, sequence: 1584050, score: 8, dictionary: 'Jitendex' }] },
                        { $: [3, { expression: '簿', reading: 'ぼ', glossary: ['register, record, book'], sequence: 1358910, score: 12, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'jitendex-forms.json', { type: 'application/json' });

        await store.importFile(file);
        const entries = await store.lookup('戊', 'ぼ', 5);

        expect(entries.map(entry => `${entry.expression}/${entry.reading}`)).toEqual(['戊/ぼ', '簿/ぼ']);
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
        const zip = yomitanZipBlob({
            'index.json': { title: 'Tiny JMdict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', 'common', '', 10, ['to read'], 1, 'ichi1'],
            ['珍語', 'ちんご', '', '', 0, ['rare word'], 2, ''],
            ['行く', 'いく', '', '', 8, ['to go'], 3, 'news1'],
            ],
        });
        await store.importFile(new File([zip], 'tiny-jmdict.zip', { type: 'application/zip' }));

        const common = await store.listRandomTopTerms(10, 2000);
        expect(common.map(entry => entry.expression).sort()).toEqual(['行く', '読む']);

        const freq = yomitanZipBlob({
            'index.json': { title: 'Tiny Frequency', format: 3 },
            'term_meta_bank_1.json': [
            ['読む', 'freq', { frequency: 400 }],
            ['珍語', 'freq', { frequency: 3000 }],
            ],
        });
        const frequencySummary = await store.importFile(new File([freq], 'tiny-frequency.zip', { type: 'application/zip' }));
        expect(frequencySummary.dictionaryTypes).toMatchObject({ 'Tiny Frequency': 'frequency' });

        const top = await store.listRandomTopTerms(10, 2000);
        expect(top).toHaveLength(1);
        expect(top[0]).toMatchObject({ expression: '読む', jpdbFrequency: 400 });
    });

    it('downloads and imports a recommended dictionary ZIP via userscript requests', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const blob = yomitanZipBlob({
            'index.json': { title: 'Tiny Dictionary', format: 3, revision: 'test' },
            'styles.css': 'ul[data-sc-content="glossary"] { padding-left: 1em; }',
            'term_bank_1.json': [
            ['読む', 'よむ', '', '', 1, ['to read'], 1, ''],
            ],
        });
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

        const firstZip = yomitanZipBlob({
            'index.json': { title: 'Tiny Terms', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', '', 1, ['to read'], 1, ''],
            ],
        });
        const secondZip = yomitanZipBlob({
            'index.json': { title: 'Tiny Kanji', format: 3 },
            'kanji_bank_1.json': [
            ['読', 'ドク', 'よ.む', '', ['read'], {}, {}],
            ],
        });

        await store.importFile(new File([firstZip], 'tiny-terms.zip', { type: 'application/zip' }));
        await store.importFile(new File([secondZip], 'tiny-kanji.zip', { type: 'application/zip' }));
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
        const blob = yomitanZipBlob({
            'index.json': { title: 'Tiny GM Dictionary', format: 3, revision: 'test' },
            'term_bank_1.json': [
            ['書く', 'かく', '', '', 1, ['to write'], 1, ''],
            ],
        });
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
