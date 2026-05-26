import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { isYomuHostedAppUrl, isYomuHostedPassivePage } from '../../src/reader/app-pages';
import { AnkiConnectClient, buildYomuAnkiFields, YOMU_MODEL_FIELDS, type AnkiLookupResult } from '../../src/reader/anki';
import { AudioPlayer, decodeJpdbAudioBlob, findAudioUrl, findAudioUrls, formatAudioUrl, isUnavailableJapanesePod101Audio, jpdbAudioRequest, normalizeJpdbAudioIds, resolveAnkiWordAudio, ShuffledAudioDeck } from '../../src/reader/audio';
import { positionPopover } from '../../src/reader/browser-ui';
import { CardActionController } from '../../src/reader/card-action-controller';
import { CardPopoverRenderer } from '../../src/reader/card-popover-renderer';
import { CardRenderDataLoader, type CardRenderData } from '../../src/reader/card-render-data';
import { createAudioPreviewCard } from '../../src/reader/card-utils';
import { HOSTED_DEMO_LOOKUP_SCAN_EVENT, IMMERSION_KIT_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID } from '../../src/reader/constants';
import { deinflectJapaneseTerm, termRulesMatch } from '../../src/reader/deinflect';
import { definitionSourceStateKey, renderJpdbDefinitionSource, renderLocalDefinitionSourcesSection } from '../../src/reader/definition-source-render';
import { DictionarySourceStateController } from '../../src/reader/dictionary-source-state';
import { applyTokensToScanTarget, applyTokensToTextNode, collectFragmentTextTargetsIn, collectTextTargetsIn, nearestReadableSentenceForElement, readerWordSurfaceText, renderTokensToHtml, unwrapReaderWords } from '../../src/reader/dom';
import { FloatingButtonController } from '../../src/reader/floating-button';
import { ImmersionKitClient, type ImmersionKitExample } from '../../src/reader/immersion-kit';
import { ImmersionPopoverController } from '../../src/reader/immersion-popover-controller';
import { JpdbClient, splitJapaneseSentences } from '../../src/reader/jpdb';
import { jpdbParseResultToTokens, jpdbVocabularyToCards } from '../../src/reader/jpdb-parser';
import { isKanjiReviewBack, isKanjiReviewFront, parseJpdbReviewCardValue } from '../../src/reader/jpdb-page-targets';
import { JpdbKanjiClient, parseJpdbKanjiHtml, visibleJpdbKanjiActions } from '../../src/reader/jpdb-kanji';
import { JpdbVocabularyClient, parseJpdbAudioData, parseJpdbSearchHtml, parseJpdbVocabularyHtml } from '../../src/reader/jpdb-vocabulary';
import { JpdbPublicPitchClient, parseJpdbPublicPitchHtml } from '../../src/reader/jpdb-public-pitch';
import { buildKanjiFacts, buildKanjiOriginGraph, parseKanjiMapInfo } from '../../src/reader/kanji-origin';
import { parseKanjiVGSvg } from '../../src/reader/kanjivg';
import { Logger } from '../../src/reader/logger';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationMayContainJapaneseText } from '../../src/reader/mutation-scan';
import { buildNewTabPalette, isYomuNewTabUrl, resolveNewTabBrandAssets } from '../../src/reader/new-tab';
import { ObjectUrlCache } from '../../src/reader/object-url-cache';
import { createPageMediaUrl } from '../../src/reader/page-media-url';
import { ImageOcrController, normalizeOcrResult, parseGoogleLensUploadHtml, readFallbackOcrResult } from '../../src/reader/ocr';
import { createReaderBackdrop, createReaderPopover, installMiningDrawerHandle, installSettingsDrawerHandle, installSheetCloseButton, installSheetHandle, SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, SHEET_HEIGHT_STORAGE_KEY, shouldUseSheet } from '../../src/reader/popover-shell';
import { formatPartOfSpeech } from '../../src/reader/pos';
import { DEFAULT_YOMU_PUBLIC_PROXY_URL, fetchWithCorsFallbacks, proxyUrlCandidates } from '../../src/reader/proxy-fetch';
import { formatMetaFrequency, groupTermEntriesByHeadword, mergeSimilarKanjiWords, renderJpdbKanjiInfo, renderJpdbKanjiMiningControls, renderKanjiOrigins, renderKanjiPractice, renderPitch, renderRtkInfo, summarizeLearnerGlossary, tokensOverlappingSelection } from '../../src/reader/popup-render';
import { RECOMMENDED_JAPANESE_DICTIONARIES, findRecommendedDictionary } from '../../src/reader/recommended-dictionaries';
import { ReaderApp } from '../../src/reader/main';
import { NewTabRuntime } from '../../src/reader/newtab-runtime';
import { ReaderAudioActions } from '../../src/reader/reader-audio-actions';
import { ReaderParser, fallbackLookupTermAtOffset } from '../../src/reader/reader-parser';
import { parseRtkSearchIndex } from '../../src/reader/rtk';
import { DEFAULT_AUDIO_SOURCES, DEFAULT_SETTINGS, applyUrlBootstrapSettings, defaultDictionaryLookupLinks, effectiveFuriganaMode, effectiveReaderColorSource, effectiveSubtitleColorSource, loadSettings, matchesShortcut, normalizeAudioSources, normalizeDictionaryLookupLinks, normalizeOcrProvider, sanitizeAccentColor, saveSettings } from '../../src/reader/settings';
import { installSourceRowDrag, localizeSettingsForm, readDictionaryLookupLinks, readFormSettings, renderAudioSourceEditor, renderDictionaryLookupLinkEditor, renderDictionarySourceRows, renderKanjiSourceRows, renderRecommendedDictionaries, renderSettingsForm, syncStickyBottomSheetAvailability, updateDictionaryLookupLinkEditor } from '../../src/reader/settings-form';
import { SITE_PARSER_PROFILES, collectScanTargets, collectSiteScanTargets, getMatchingSiteParsers } from '../../src/reader/site-parsers';
import { KANJI_UCHISEN_SOURCE_ID, definitionSourceRows, kanjiSourceRows, orderedDefinitionSourceIds, orderedKanjiSourceIds } from '../../src/reader/source-sections';
import { detectGrammarHints, renderGrammarHints, translateJapaneseSentence } from '../../src/reader/study-tools';
import { loadReaderCssFallback, READER_CSS, readerCssFallbackUrls, readerCssNeedsFallback } from '../../src/reader/styles';
import { findActiveSubtitleCue, normalizeSubtitleCues, parseSubtitleText } from '../../src/reader/subtitle-cues';
import { computeSubtitleDrawerLayout } from '../../src/reader/subtitle-layout';
import { collectPageSubtitleSources } from '../../src/reader/subtitle-sources';
import { createSubtitleVideoInsetAdapter } from '../../src/reader/subtitle-video-inset';
import { discoverYouTubeCaptionTracks, getYouTubeCaptionTracks, getYouTubeVideoId, loadYouTubeTrackCues } from '../../src/reader/subtitle-youtube';
import { applySubtitleNativeTrackModes } from '../../src/reader/subtitle-native-track-modes';
import { installUchisenCarousel, loadUchisenImages, parseUchisenComponents, parseUchisenData, parseUchisenImages, parseUchisenKanjiKeyword } from '../../src/reader/uchisen';
import { readPageCaptionText } from '../../src/reader/subtitle-dom-captions';
import { compareSubtitleTrackOptions, isEnglishSubtitleTrack, isJapaneseSubtitleTrack, shouldReplaceWaitingNativeTrack } from '../../src/reader/subtitle-track-metadata';
import { loadSubtitleTrackCues } from '../../src/reader/subtitle-track-loader';
import { renderSubtitlePrimary } from '../../src/reader/subtitle-rendering';
import { planTranscriptHydrationIndexes } from '../../src/reader/subtitle-transcript-hydration';
import { getUserscriptHttpRequest, installUserscriptHttpBridge } from '../../src/reader/userscript';
import { YomitanDictionaryStore, glossaryToHtml, glossaryToText, parseYomitanSettingsExport, renderDictionaryScopedStyles, type YomitanTermEntry } from '../../src/reader/yomitan';
import type { AudioSourceSetting, JPDBCard, JPDBToken } from '../../src/reader/types';
import { yomitanZipBlob } from './zip-fixture';
import PublicProxyWorker, { isAllowedPublicProxyTarget } from '../../workers/jpdb-public-proxy/src/index';

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
const READER_WORD_CSS = readerCssNeedsFallback(READER_CSS) ? readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8') : READER_CSS;
const IMMERSION_STUDY_CSS = readFileSync('src/reader/styles/immersion-study.css', 'utf8');
const LOCAL_DICTIONARY_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');
const KANJI_CSS = readFileSync('src/reader/styles/kanji.css', 'utf8');
const NEW_TAB_CSS = readFileSync('src/reader/styles/new-tab.css', 'utf8');
const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');
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

function immersionExample(sentence: string): ImmersionKitExample {
    return {
        id: `ik-${sentence}`,
        sentence,
        sentenceWithFurigana: '',
        translation: 'Example translation.',
        sourceTitle: 'Test Source',
        titleSlug: 'test_source',
        category: 'anime',
        soundFile: '',
        imageFile: '',
        soundUrl: '',
        imageUrl: '',
    };
}

function immersionPopoverTestController(
    search: (query: string, settings: typeof DEFAULT_SETTINGS, options: { signal?: AbortSignal }) => Promise<ImmersionKitExample[]>,
): ImmersionPopoverController {
    return new ImmersionPopoverController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: true,
            immersionKitShowImages: false,
        }),
        client: {
            search,
            mediaUrls: vi.fn(() => []),
            fetchBlobUrl: vi.fn(async () => ''),
        } as unknown as ImmersionKitClient,
        audio: { play: vi.fn(async () => undefined) } as never,
        parseJapanese: vi.fn(async () => []),
        canParseJapanese: () => false,
        parsePopoverJapanese: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        repositionPopover: vi.fn(),
        setImmersionTranslationBlurred: vi.fn(),
        toast: vi.fn(),
    });
}

function immersionLazyLoadSurface(open: boolean): { popover: HTMLElement; container: HTMLDetailsElement } {
    const popover = document.createElement('div');
    const container = document.createElement('details');
    container.dataset.immersionKit = 'true';
    container.open = open;
    container.innerHTML = `
        <summary class="jpdb-reader-local-title">Immersion Kit</summary>
        <div class="jpdb-reader-help">Loading examples...</div>
    `;
    popover.append(container);
    document.body.append(popover);
    return { popover, container };
}

function dispatchPointerEvent(target: EventTarget, type: string, clientY: number, pointerType = 'mouse', clientX = 0): void {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        button: { value: 0 },
        clientX: { value: clientX },
        clientY: { value: clientY },
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
    });
    target.dispatchEvent(event);
}

function pointerEventLike(pointerType = 'mouse', button = 0): PointerEvent {
    const event = new Event('pointermove', { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        button: { value: button },
        clientX: { value: 0 },
        clientY: { value: 0 },
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
    });
    return event;
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

function mockHtmlAudioPlayback(played: string[], loopStates?: boolean[]): () => void {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
        played.push(this.src);
        loopStates?.push(this.loop);
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

    it('scans JPDB deck vocabulary chunks until scheduled cards are found', async () => {
        const client = new JpdbClient(() => 'token');
        const lookupBatches: Array<Array<[number, number]>> = [];
        const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const href = String(url);
            const body = JSON.parse(String(init?.body ?? '{}')) as { list?: Array<[number, number]> };
            if (href === 'https://jpdb.io/api/v1/deck/list-vocabulary') {
                return {
                    status: 200,
                    ok: true,
                    text: async () => JSON.stringify({
                        vocabulary: Array.from({ length: 205 }, (_, index) => {
                            const vid = index + 1;
                            return [vid, vid + 1000];
                        }),
                    }),
                };
            }
            if (href === 'https://jpdb.io/api/v1/lookup-vocabulary') {
                const list = body.list ?? [];
                lookupBatches.push(list);
                return {
                    status: 200,
                    ok: true,
                    text: async () => JSON.stringify({
                        vocabulary_info: list.map(([vid, sid]) => [
                            vid,
                            sid,
                            vid + 2000,
                            `語${vid}`,
                            `ご${vid}`,
                            vid,
                            ['n'],
                            [[`word ${vid}`]],
                            [['n']],
                            vid === 150 ? ['due'] : vid === 151 ? ['new'] : ['known'],
                            [],
                        ]),
                    }),
                };
            }
            throw new Error(`Unexpected URL: ${href}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const cards = await client.listDeckCards('deck', 2, { scheduledOnly: true });

            expect(cards.map(card => card.spelling)).toEqual(['語150', '語151']);
            expect(lookupBatches.map(batch => batch.length)).toEqual([100, 100]);
            expect(lookupBatches[0][0]).toEqual([1, 1001]);
            expect(lookupBatches[1][0]).toEqual([101, 1101]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reuses JPDB parse results for individual paragraphs after a batch parse', async () => {
        const client = new JpdbClient(() => 'token');
        const parseBodies: string[][] = [];
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string[] };
            const text = body.text ?? [];
            parseBodies.push(text);
            const vocabulary = text.map((paragraph, index) => [
                index + 1,
                index + 2,
                index + 3,
                paragraph,
                paragraph,
                100 + index,
                [],
                [[`meaning ${paragraph}`]],
                [[]],
                ['new'],
                [],
            ]);
            return {
                status: 200,
                ok: true,
                text: async () => JSON.stringify({
                    vocabulary,
                    tokens: text.map((paragraph, index) => [[index, 0, paragraph.length, null]]),
                }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const [cat, dog] = await client.parse(['猫', '犬']);
            const [cachedCat] = await client.parse(['猫']);
            const [catAgain, bird] = await client.parse(['猫', '鳥']);

            expect(cat[0].card.spelling).toBe('猫');
            expect(dog[0].card.spelling).toBe('犬');
            expect(cachedCat[0].card.spelling).toBe('猫');
            expect(catAgain[0].card.spelling).toBe('猫');
            expect(bird[0].card.spelling).toBe('鳥');
            expect(parseBodies).toEqual([
                ['猫', '犬'],
                ['鳥'],
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('batches large JPDB parse requests by UTF-8 size like the reference reader', async () => {
        const client = new JpdbClient(() => 'token');
        const parseBodies: string[][] = [];
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string[] };
            const text = body.text ?? [];
            parseBodies.push(text);
            return {
                status: 200,
                ok: true,
                text: async () => JSON.stringify({
                    vocabulary: text.map((paragraph, index) => [
                        index + 1,
                        index + 2,
                        index + 3,
                        paragraph.slice(0, 2),
                        paragraph.slice(0, 2),
                        100 + index,
                        [],
                        [[`meaning ${index}`]],
                        [[]],
                        ['new'],
                        [],
                    ]),
                    tokens: text.map((_paragraph, index) => [[index, 0, 2, null]]),
                }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const first = '喧嘩'.repeat(1500);
            const second = '日本語'.repeat(1000);
            const [firstTokens, secondTokens] = await client.parse([first, second]);

            expect(firstTokens[0].card.spelling).toBe('喧嘩');
            expect(secondTokens[0].card.spelling).toBe('日本');
            expect(parseBodies).toEqual([[first], [second]]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('clears in-flight JPDB parses when caches are reset', async () => {
        const client = new JpdbClient(() => 'token');
        let resolveFirst!: (response: { status: number; ok: boolean; text: () => Promise<string> }) => void;
        const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string[] };
            const text = body.text ?? [];
            const response = {
                status: 200,
                ok: true,
                text: async () => JSON.stringify({
                    vocabulary: text.map((paragraph, index) => [
                        index + 1,
                        index + 2,
                        index + 3,
                        paragraph,
                        paragraph,
                        100 + index,
                        [],
                        [[`meaning ${paragraph}`]],
                        [[]],
                        ['new'],
                        [],
                    ]),
                    tokens: text.map((paragraph, index) => [[index, 0, paragraph.length, null]]),
                }),
            };
            if (fetchMock.mock.calls.length === 1) {
                return new Promise<typeof response>(resolve => {
                    resolveFirst = resolve;
                });
            }
            return Promise.resolve(response);
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const first = client.parse(['猫']);
            client.clear();
            const second = client.parse(['猫']);
            resolveFirst({
                status: 200,
                ok: true,
                text: async () => JSON.stringify({
                    vocabulary: [[9, 10, 11, '猫', '猫', 100, [], [['old']], [[]], ['new'], []]],
                    tokens: [[[0, 0, 1, null]]],
                }),
            });

            await expect(first).resolves.toHaveLength(1);
            await expect(second).resolves.toHaveLength(1);
            expect(fetchMock).toHaveBeenCalledTimes(2);
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
        expect(normalizedCss).toContain('.jpdb-reader-word:is(.jpdb-known, .jpdb-never-forget, .jpdb-redundant) { --jpdb-reader-jpdb-color: var(--jpdb-reader-state-known, #7bd88f); --jpdb-reader-jpdb-soft: var(--jpdb-reader-state-known-soft, rgba(123, 216, 143, 0.16)); }');
        expect(normalizedCss).toContain('.jpdb-reader-word:is(.jpdb-known, .jpdb-never-forget, .jpdb-redundant, .anki-known) { --jpdb-reader-status-color: var(--jpdb-reader-state-known, #7bd88f); --jpdb-reader-status-soft: var(--jpdb-reader-state-known-soft, rgba(123, 216, 143, 0.16)); }');
        expect(normalizedCss).toContain('.jpdb-reader-word-highlight-status .jpdb-reader-word { background: var(--jpdb-reader-source-status-soft, transparent) !important; }');
        expect(normalizedCss).toContain('.jpdb-reader-word-underline-status .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-source-status-decoration, transparent); }');
        expect(normalizedCss).toContain('.jpdb-reader-word-underline-pitch .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-source-pitch-decoration, transparent); }');
        expect(normalizedCss).toContain('.jpdb-reader-word-text-jpdb .jpdb-reader-word { color: var(--jpdb-reader-source-jpdb-color, currentColor) !important; }');
        expect(normalizedCss).toContain('.jpdb-ocr-line .jpdb-reader-word { background: transparent !important; --jpdb-reader-word-underline: transparent; text-decoration: none !important;');
    });

    it('detects when userscript GM resource CSS is unavailable', () => {
        expect(READER_CSS).toBe('');
        expect(readerCssNeedsFallback(READER_CSS)).toBe(true);
    });

    it('loads the hosted full reader CSS without userscript GM resource APIs', async () => {
        const fullCss = '.jpdb-reader-popover{} .jpdb-reader-settings{} .jpdb-reader-source-card{} .jpdb-subtitle-player{} .jpdb-ocr-layer{}';
        const fetcher = vi.fn(async () => ({
            ok: true,
            text: async () => fullCss,
        } as Response));

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://hrussellzfac023.github.io/yomu-reader/'))
            .resolves.toBe(fullCss);

        expect(fetcher).toHaveBeenCalledWith('https://hrussellzfac023.github.io/yomu-reader/yomu.css', expect.objectContaining({
            credentials: 'omit',
        }));
    });

    it('falls back to the raw CSS asset off the hosted site', () => {
        expect(readerCssFallbackUrls('https://example.com/article'))
            .toEqual(['https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css']);
    });

    it('resolves subtitle color channels on each parsed word', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-reader-subtitle-highlight-pitch :is(.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .asbplayer-subtitles-container-bottom) .jpdb-reader-word { background: var(--jpdb-reader-source-pitch-soft, transparent) !important; }');
        expect(normalizedCss).toContain('.jpdb-reader-subtitle-underline-pitch :is(.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .asbplayer-subtitles-container-bottom) .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-source-pitch-decoration, transparent); text-decoration-line: underline !important; }');
        expect(normalizedCss).toContain('.jpdb-reader-subtitle-text-pitch :is(.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .asbplayer-subtitles-container-bottom) .jpdb-reader-word { color: var(--jpdb-reader-source-pitch-color, var(--jpdb-reader-subtitle-fallback, currentColor)) !important; }');
    });

    it('forces current YouTube player nodes to honor side transcript insets', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('html.jpdb-subtitle-video-inset-right ytd-watch-flexy #player, html.jpdb-subtitle-video-inset-left ytd-watch-flexy #player');
        expect(normalizedCss).toContain('html.jpdb-subtitle-video-inset-right ytd-watch-flexy #movie_player, html.jpdb-subtitle-video-inset-left ytd-watch-flexy #movie_player { width: var(--ytd-watch-flexy-player-width, auto) !important; max-width: var(--ytd-watch-flexy-player-width, none) !important; min-width: 0 !important; }');
    });

    it('uses configurable pitch colors in graphs and visible new-tab target highlights', () => {
        const normalizedKanjiCss = KANJI_CSS.replace(/\s+/g, ' ');
        const normalizedNewTabCss = NEW_TAB_CSS.replace(/\s+/g, ' ');
        const normalizedImmersionCss = IMMERSION_STUDY_CSS.replace(/\s+/g, ' ');
        const html = renderPitch({ ...card, spelling: '読む', reading: 'よむ', pitchAccent: ['HLL'] });

        expect(normalizedKanjiCss).toContain('.jpdb-reader-pitch .atamadaka { color: var(--jpdb-reader-pitch-atamadaka, #fe4b74); }');
        expect(html).toContain('<polyline class="atamadaka"');
        expect(html).toContain('<circle class="atamadaka"');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-sentence .jpdb-reader-example-target { padding: 0 0.08em; border-radius: 0.22em; background: color-mix( in srgb, var(--jpdb-reader-accent-readable, var(--jpdb-reader-accent, #5ea780)) 14%, transparent );');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-target { padding: 0 0.08em; border-radius: 0.22em; background: color-mix( in srgb, var(--jpdb-reader-accent-readable, var(--jpdb-reader-accent, #5ea780)) 15%, transparent );');
        expect(normalizedNewTabCss).toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word.jpdb-reader-example-target { background: transparent !important;');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-example-target { padding: 0 0.08em; border-radius: 0.22em; background: color-mix( in srgb, var(--jpdb-reader-accent-readable) 15%, transparent );');
        expect(normalizedImmersionCss).toContain('.jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word.jpdb-reader-example-target { background: transparent !important;');
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

    it('uses the accent color when the sheet handle is hovered', () => {
        const normalizedCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-reader-sheet-handle:hover::before, .jpdb-reader-sheet-handle:focus-visible::before { background: var(--jpdb-reader-accent); }');
    });

    it('keeps forced bottom-sheet popovers positioned on desktop viewports', () => {
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const };
        withViewport(1440, 900, () => {
            const popover = createReaderPopover('よむ', settings);
            const normalizedCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');

            expect(shouldUseSheet(settings)).toBe(true);
            expect(popover.classList.contains('jpdb-reader-sheet')).toBe(true);
            expect(normalizedCss).toContain('.jpdb-reader-popover.jpdb-reader-sheet { left: 0 !important; right: 0 !important; top: auto !important; bottom: 0 !important;');
            expect(normalizedCss).toContain('.jpdb-reader-sheet .jpdb-reader-sheet-handle { display: block; }');
        });
    });

    it('keeps an explicit sheet close button after drawer content rerenders', async () => {
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet jpdb-reader-sheet-sticky';
        popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
        document.body.append(popover);
        const dismiss = vi.fn();

        try {
            installSheetCloseButton(popover, dismiss, 'Close drawer');

            const initialButton = popover.querySelector<HTMLButtonElement>('[data-jpdb-reader-sheet-close="true"]');
            expect(initialButton?.title).toBe('Close drawer');
            initialButton?.click();
            expect(dismiss).toHaveBeenCalledTimes(1);

            popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div><p>updated</p>';
            await waitForExpect(() => {
                expect(popover.querySelector('[data-jpdb-reader-sheet-close="true"]')).not.toBeNull();
            });
        } finally {
            popover.remove();
        }
    });

    it('adds the sticky sheet close button only for click-opened sheets', () => {
        const app = new ReaderApp();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const, stickyBottomSheet: true };
        const internals = app as unknown as {
            settings: typeof settings;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
        };
        internals.settings = settings;

        try {
            const modal = createReaderPopover('よむ', settings);
            modal.innerHTML = '<div class="jpdb-reader-popover-body"><div class="jpdb-reader-sheet-handle"></div></div>';
            internals.mountPopover(modal, undefined, { mode: 'modal' });

            expect(modal.getAttribute('aria-modal')).toBe('false');
            expect(modal.classList.contains('jpdb-reader-sheet-sticky')).toBe(true);
            expect(modal.querySelector('[data-jpdb-reader-sheet-close="true"]')).not.toBeNull();

            const hover = createReaderPopover('よむ', settings);
            hover.innerHTML = '<div class="jpdb-reader-popover-body"><div class="jpdb-reader-sheet-handle"></div></div>';
            internals.mountPopover(hover, undefined, { mode: 'hover' });

            expect(hover.classList.contains('jpdb-reader-sheet-sticky')).toBe(false);
            expect(hover.querySelector('[data-jpdb-reader-sheet-close="true"]')).toBeNull();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('can preserve parsed page words during demo-to-real runtime handoff', () => {
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-heiban';
        word.dataset.vid = '10';
        word.dataset.sid = '20';
        word.textContent = '青空';
        document.body.replaceChildren(word);

        app.destroy({ preservePageWords: true });

        expect(document.querySelector('.jpdb-reader-word')).toBe(word);
        expect(word.textContent).toBe('青空');

        const cleanup = new ReaderApp();
        cleanup.destroy();

        expect(document.querySelector('.jpdb-reader-word')).toBeNull();
        expect(document.body.textContent).toBe('青空');
        document.body.replaceChildren();
    });

    it('stacks lookup popovers over settings without dismissing the settings dialog', () => {
        const app = new ReaderApp();
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const };
        const settingsForm = document.createElement('form');
        settingsForm.className = 'jpdb-reader-settings';
        settingsForm.dataset.jpdbReaderRoot = 'true';
        const settingsBackdrop = createReaderBackdrop(() => undefined);
        const anchor = document.createElement('span');
        anchor.textContent = '設定';
        document.body.append(settingsBackdrop, settingsForm, anchor);
        const internals = app as unknown as {
            settings: typeof settings;
            activePopover?: HTMLElement;
            activeBackdrop?: HTMLElement;
            mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover'; stackOverSettings?: boolean }): void;
            dismiss(): void;
        };
        internals.settings = settings;
        internals.activePopover = settingsForm;
        internals.activeBackdrop = settingsBackdrop;

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
            internals.mountPopover(lookup, anchor, { mode: 'modal', stackOverSettings: true });

            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(lookup.isConnected).toBe(true);
            expect(lookup.getAttribute('aria-modal')).toBe('false');
            expect(lookup.classList.contains('jpdb-reader-sheet')).toBe(false);
            expect(lookup.querySelector('.jpdb-reader-sheet-handle')).toBeNull();
            expect(internals.activePopover).toBe(lookup);

            internals.dismiss();

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(internals.activePopover).toBe(settingsForm);
            expect(internals.activeBackdrop).toBe(settingsBackdrop);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
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
        expect(SETTINGS_CSS).toContain('.jpdb-reader-settings-drag-handle:hover::before');
        expect(SUBTITLES_YOUTUBE_CSS).toContain('.jpdb-subtitle-transcript-bottom .jpdb-subtitle-resize:hover::before');
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

    it('remembers collapsed source state for later renders', () => {
        const onStateChange = vi.fn();
        const popover = document.createElement('div');
        popover.innerHTML = `
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source-state-key="definition-source:translation" data-source-initial-open="true" open>
                <summary class="jpdb-reader-local-title">Translation</summary>
                <p>Definition</p>
            </details>
        `;
        const controller = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange,
        });

        controller.installTracking(popover);
        const details = popover.querySelector<HTMLDetailsElement>('details')!;
        details.open = false;
        details.dispatchEvent(new Event('toggle', { bubbles: true }));

        expect(onStateChange).toHaveBeenCalledTimes(1);
        expect(controller.isOpen('definition-source:translation')).toBe(false);
        const attributes = controller.attributes('definition-source:translation');
        expect(attributes).toContain('data-source-initial-open="false"');
        expect(attributes).not.toContain(' open');
    });

    it('renders Immersion Kit mounts through the shared dictionary source state', () => {
        localStorage.removeItem('jpdb-reader-source-open-state');
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: true,
            dictionarySourcesInitiallyExpanded: true,
            jpdbDefinitionsEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
        };
        const internals = app as unknown as {
            settings: typeof settings;
            dictionarySourceState: DictionarySourceStateController;
            renderDefinitionSources(card: JPDBCard, entries: never[], sentence?: string): string;
            renderKanjiImmersionKitMount(): string;
        };
        internals.settings = settings;

        try {
            const root = document.createElement('div');
            root.innerHTML = internals.renderDefinitionSources(card, []);
            const details = root.querySelector<HTMLDetailsElement>('[data-immersion-kit]');

            expect(details?.dataset.sourceStateKey).toBe(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID));
            expect(details?.dataset.sourceInitialOpen).toBe('false');
            expect(details?.open).toBe(false);

            internals.dictionarySourceState.installTracking(root);
            details!.open = true;
            details!.dispatchEvent(new Event('toggle', { bubbles: true }));

            const opened = document.createElement('div');
            opened.innerHTML = internals.renderDefinitionSources(card, []);
            const openedDetails = opened.querySelector<HTMLDetailsElement>('[data-immersion-kit]');

            expect(openedDetails?.dataset.sourceInitialOpen).toBe('true');
            expect(openedDetails?.open).toBe(true);

            details!.open = false;
            details!.dispatchEvent(new Event('toggle', { bubbles: true }));

            const rerendered = document.createElement('div');
            rerendered.innerHTML = internals.renderDefinitionSources(card, []);
            const rerenderedDetails = rerendered.querySelector<HTMLDetailsElement>('[data-immersion-kit]');

            expect(rerenderedDetails?.dataset.sourceInitialOpen).toBe('false');
            expect(rerenderedDetails?.open).toBe(false);
            expect(internals.renderKanjiImmersionKitMount()).toContain('data-source-initial-open="false"');
        } finally {
            app.destroy();
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-source-open-state');
        }
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

    it('keeps Add to Anki inside the expandable mining drawer panel', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
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

        document.body.innerHTML = renderer.render(card, '食べる。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const panel = document.querySelector<HTMLElement>('.jpdb-reader-mining-panel')!;
        const ankiButton = document.querySelector<HTMLButtonElement>('[data-action="anki"]')!;

        expect(panel.contains(ankiButton)).toBe(true);
        expect(KANJI_CSS).toContain('.jpdb-reader-actions-mining-collapsed .jpdb-reader-mining-panel');
    });

    it('renders the popup title spelling as a nested Japanese parse target', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => DEFAULT_SETTINGS,
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });

        document.body.innerHTML = renderer.render({
            ...card,
            spelling: '漢語',
            reading: 'かんご',
            cardState: ['known'],
        }, '漢語です。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });
        const spelling = document.querySelector<HTMLElement>('.jpdb-reader-spelling')!;
        const targets = collectFragmentTextTargetsIn(spelling, 10, false, '', { allowUiText: true, minLength: 1 });

        expect(spelling.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(targets.map(target => target.text)).toEqual(['漢語']);

        applyTokensToScanTarget(targets[0], [{
            card: { ...card, spelling: '漢語', reading: 'かんご', cardState: ['known'] },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'かんご', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '漢語',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-spelling .jpdb-reader-word')!;
        const kanjiButtons = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-spelling .jpdb-reader-kanji-inline')];
        expect(readerWordSurfaceText(word)).toBe('漢語');
        expect(document.querySelector('.jpdb-reader-spelling rt')?.textContent).toBe('かんご');
        expect(kanjiButtons.map(button => button.dataset.kanji)).toEqual(['漢', '語']);
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

    it('uses the hosted new-tab review fallback when a dictionary card is gradeable outside JPDB API lookup', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                enableReviews: true,
            }),
            isJpdbBackedCard: () => false,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
            renderReviewButtonsFallback: () => '<div data-fallback-review><button data-action="grade" data-grade="pass">Pass</button></div>',
        });

        const html = renderer.render({ ...card, reviewSource: 'jpdb-live' }, '漢字です。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        });

        expect(html).toContain('data-fallback-review');
        expect(html).toContain('data-action="grade"');
    });

    it('renders existing Anki edit actions inside the card preview', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
            }),
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });

        document.body.innerHTML = renderer.render(card, '食べる。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'known',
                notes: [],
                primary: {
                    noteId: 10,
                    primaryCardId: 20,
                    cardIds: [20],
                    state: 'known',
                    deckNames: ['Yomu'],
                    modelName: 'Yomu Japanese',
                    fields: { Sentence: '食べる。', Meaning: 'eat' },
                    tags: [],
                    reps: 3,
                    lapses: 0,
                },
            },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-card-preview')!;
        const editButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-action="anki-edit"]')];

        expect(document.querySelector('.jpdb-reader-anki-existing summary > span')?.textContent).toBe('Anki');
        expect(document.querySelector('.jpdb-reader-anki-existing summary small')?.textContent).toBe('Yomu');
        expect(editButtons).toHaveLength(1);
        expect(editButtons[0]?.dataset.noteId).toBe('10');
        expect(preview.contains(editButtons[0]!)).toBe(true);
        expect(document.querySelector('.jpdb-reader-actions [data-action="anki-edit"]')).toBeNull();
        expect(document.querySelector('.jpdb-reader-actions [data-action="anki"]')).toBeNull();
    });

    it('renders unfamiliar Anki notes from their rendered card and non-empty fields', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
            }),
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });

        document.body.innerHTML = renderer.render({ ...card, spelling: '女', reading: 'おんな' }, '女の人です。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'due',
                notes: [],
                primary: {
                    noteId: 168,
                    primaryCardId: 167,
                    cardIds: [167],
                    state: 'due',
                    deckNames: ['Vocab 2k'],
                    modelName: 'Imported Vocab',
                    fields: {
                        Expression: '女',
                        Readings: 'おんな, おみな, おうな, うみな, おな',
                        Translation_1: 'female, woman, female sex',
                        Restriction_1: '',
                        Translation_2: "female lover, girlfriend, mistress, (someone's) woman",
                        audio: '[sound:h2k-167.mp3]',
                    },
                    renderedCards: [{
                        cardId: 167,
                        deckName: 'Vocab 2k',
                        question: '<div class="front">女 [anki:play:q:0]<script>window.bad = true</script></div>',
                        answer: '<div><strong>female</strong> [anki:play:a:0]<a href="javascript:bad()">bad link</a></div>',
                    }],
                    tags: [],
                    reps: 2,
                    lapses: 0,
                },
            },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-card-preview')!;

        expect(preview.textContent).toContain('女');
        expect(preview.textContent).toContain('Readings');
        expect(preview.textContent).toContain('Translation_1');
        expect(preview.textContent).toContain('h2k-167.mp3');
        expect(preview.querySelector('.jpdb-reader-anki-rendered-side-body')?.textContent).toContain('女');
        expect(preview.textContent).not.toContain('[anki:play');
        expect(preview.querySelectorAll('.jpdb-reader-anki-playback-marker')).toHaveLength(2);
        expect(preview.querySelector<HTMLButtonElement>('.jpdb-reader-anki-playback-marker')?.dataset.ankiMediaName).toBe('h2k-167.mp3');
        expect(preview.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]')?.tagName).toBe('BUTTON');
        expect(preview.innerHTML).not.toContain('<script');
        expect(preview.innerHTML).not.toContain('javascript:bad');
    });

    it('plays Anki media audio chips through AnkiConnect media retrieval', async () => {
        const mediaFileDataUrl = vi.fn(async () => 'data:audio/mpeg;base64,audio-data');
        const playMediaUrl = vi.fn(async () => undefined);
        const controller = new CardActionController({
            getSettings: () => DEFAULT_SETTINGS,
            jpdb: {} as unknown as JpdbClient,
            anki: { mediaFileDataUrl } as unknown as AnkiConnectClient,
            dictionaries: {} as unknown as YomitanDictionaryStore,
            isJpdbBackedCard: () => true,
            resolveMiningContext: vi.fn(),
            showCard: vi.fn(),
            getActivePopoverAnchor: () => undefined,
            getActivePopoverMode: () => undefined,
            showSettings: vi.fn(),
            playAudio: vi.fn(),
            playMediaUrl,
            playSentenceAudio: vi.fn(),
            detectGrammarHints: vi.fn(async () => []),
            parsePopoverJapanese: vi.fn(),
            toast: vi.fn(),
        });
        const button = document.createElement('button');
        button.dataset.ankiMediaName = 'h2k-167.mp3';

        await expect(controller.perform('anki-media-audio', button, card)).resolves.toBe(false);
        expect(mediaFileDataUrl).toHaveBeenCalledWith('h2k-167.mp3');
        expect(playMediaUrl).toHaveBeenCalledWith('data:audio/mpeg;base64,audio-data');
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

        const actions = popover.querySelector<HTMLElement>('.jpdb-reader-actions')!;
        const handle = popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!;
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();
        const setExpanded = (button: HTMLButtonElement, expanded: boolean): void => {
            actions.classList.toggle('jpdb-reader-actions-mining-collapsed', !expanded);
            button.setAttribute('aria-expanded', String(expanded));
        };
        installMiningDrawerHandle(popover, setExpanded);
        handle.addEventListener('click', () => {
            setExpanded(handle, actions.classList.contains('jpdb-reader-actions-mining-collapsed'));
        });

        handle.click();
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(false);
        expect(handle.getAttribute('aria-expanded')).toBe('true');
        expect(handle.textContent).toBe('');

        const dragDownStart = Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 180, pointerId: 11, button: 0 });
        const dragDownMove = Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 226, pointerId: 11 });
        const dragDownEnd = Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 226, pointerId: 11 });
        handle.dispatchEvent(dragDownStart);
        document.dispatchEvent(dragDownMove);
        document.dispatchEvent(dragDownEnd);
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);

        handle.click();
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
        expect(handle.getAttribute('aria-expanded')).toBe('false');

        const dragUpStart = Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 226, pointerId: 12, button: 0 });
        const dragUpMove = Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 178, pointerId: 12 });
        const dragUpEnd = Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 178, pointerId: 12 });
        handle.dispatchEvent(dragUpStart);
        document.dispatchEvent(dragUpMove);
        document.dispatchEvent(dragUpEnd);

        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(false);
        expect(handle.getAttribute('aria-expanded')).toBe('true');
    });

    it('uses concrete color-channel defaults while preserving legacy automatic choices', () => {
        expect(effectiveReaderColorSource(DEFAULT_SETTINGS, 'auto')).toBe('pitch');
        expect(effectiveReaderColorSource(DEFAULT_SETTINGS, 'auto', 'pitch')).toBe('pitch');
        expect(effectiveReaderColorSource({ ...DEFAULT_SETTINGS, wordHighlightMode: 'pitch' }, 'auto')).toBe('pitch');
        expect(effectiveReaderColorSource({ ...DEFAULT_SETTINGS, wordHighlightMode: 'status' }, 'auto')).toBe('status');
        expect(effectiveReaderColorSource({ ...DEFAULT_SETTINGS, wordHighlightMode: 'off' }, 'auto')).toBe('off');
        expect(effectiveReaderColorSource(DEFAULT_SETTINGS, 'anki')).toBe('anki');
        expect(effectiveSubtitleColorSource({ ...DEFAULT_SETTINGS, wordHighlightMode: 'status' }, 'auto')).toBe('jpdb');
        expect(effectiveSubtitleColorSource({ ...DEFAULT_SETTINGS, wordHighlightMode: 'pitch' }, 'auto')).toBe('pitch');
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
        expect(DEFAULT_SETTINGS.wordHighlightColorSource).toBe('pitch');
        expect(DEFAULT_SETTINGS.wordUnderlineColorSource).toBe('jpdb');
        expect(DEFAULT_SETTINGS.wordTextColorSource).toBe('off');
        expect(DEFAULT_SETTINGS.subtitleHighlightColorSource).toBe('jpdb');
        expect(DEFAULT_SETTINGS.subtitleUnderlineColorSource).toBe('pitch');
        expect(DEFAULT_SETTINGS.subtitleTextColorSource).toBe('jpdb');
        expect('wordHighlightMode' in DEFAULT_SETTINGS).toBe(false);
    });

    it('renders color-channel settings as concrete options and saves them back', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const expected = {
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'jpdb',
            wordTextColorSource: 'off',
            subtitleHighlightColorSource: 'jpdb',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'jpdb',
        } as const;

        Object.entries(expected).forEach(([name, value]) => {
            const select = form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
            expect(select?.value).toBe(value);
            expect(Array.from(select?.options ?? []).map(option => option.value)).toEqual(['status', 'jpdb', 'anki', 'pitch', 'off']);
            expect(Array.from(select?.options ?? []).map(option => option.textContent)).toContain('Available status');
        });
        expect(form.textContent).not.toContain('JPDB + Anki status');
        expect(form.querySelector<HTMLSelectElement>('select[name="wordHighlightMode"]')).toBeNull();

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved).toMatchObject(expected);
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

    it('reuses in-flight local fallback parses for matching text and options', async () => {
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
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches } as never,
        });

        const [first, second] = await Promise.all([
            parser.parse(['漢字を書く'], { includeLocalPitch: false }),
            parser.parse(['漢字を書く'], { includeLocalPitch: false }),
        ]);
        const [third] = await parser.parse(['漢字を書く'], { includeLocalPitch: false });

        expect(findTermMatches).toHaveBeenCalledTimes(1);
        expect(first[0][0].card.spelling).toBe('漢字');
        expect(second[0][0].card.spelling).toBe('漢字');
        expect(third[0].card.spelling).toBe('漢字');
    });

    it('enriches local dictionary fallback tokens with local pitch metadata', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([{
            entry: {
                expression: '計量',
                reading: 'けいりょう',
                glossary: ['measurement'],
                dictionary: 'JMdict',
            },
            start: 0,
            end: 2,
            surface: '計量',
        }]);
        const lookupTermMeta = vi.fn().mockResolvedValue([{
            expression: '計量',
            mode: 'pitch',
            data: { reading: 'けいりょう', pitches: [{ position: 0 }] },
            dictionary: 'Pitch',
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true, showPitchAccent: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        });

        const [tokens] = await parser.parse(['計量する']);

        expect(lookupTermMeta).toHaveBeenCalledWith('計量', 12, DEFAULT_SETTINGS.dictionaryPreferences);
        expect(tokens[0].card.pitchAccent).toEqual(['LHHHH']);
        expect(tokens[0].pitchClass).toBe('heiban');
        expect(renderTokensToHtml('計量する', tokens, DEFAULT_SETTINGS))
            .toContain('jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban');
    });

    it('keeps local fallback parse cache entries separate when local pitch options differ', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([{
            entry: {
                expression: '計量',
                reading: 'けいりょう',
                glossary: ['measurement'],
                dictionary: 'JMdict',
            },
            start: 0,
            end: 2,
            surface: '計量',
        }]);
        const lookupTermMeta = vi.fn().mockResolvedValue([{
            expression: '計量',
            mode: 'pitch',
            data: { reading: 'けいりょう', pitches: [{ position: 0 }] },
            dictionary: 'Pitch',
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true, showPitchAccent: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        });

        const [withoutPitch] = await parser.parse(['計量する'], { includeLocalPitch: false });
        const [withPitch] = await parser.parse(['計量する']);
        const [cachedWithPitch] = await parser.parse(['計量する']);

        expect(findTermMatches).toHaveBeenCalledTimes(2);
        expect(lookupTermMeta).toHaveBeenCalledTimes(1);
        expect(withoutPitch[0].pitchClass).toBe('');
        expect(withPitch[0].pitchClass).toBe('heiban');
        expect(cachedWithPitch[0].pitchClass).toBe('heiban');
    });

    it('deduplicates repeated local pitch metadata lookups while parsing', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([{
            entry: {
                expression: '計量',
                reading: 'けいりょう',
                glossary: ['measurement'],
                dictionary: 'JMdict',
            },
            start: 0,
            end: 2,
            surface: '計量',
        }]);
        const lookupTermMeta = vi.fn().mockResolvedValue([{
            expression: '計量',
            mode: 'pitch',
            data: { reading: 'けいりょう', pitches: [{ position: 0 }] },
            dictionary: 'Pitch',
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true, showPitchAccent: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        });

        const parsed = await parser.parse(['計量する', '計量する']);

        expect(lookupTermMeta).toHaveBeenCalledTimes(1);
        expect(parsed[0][0].pitchClass).toBe('heiban');
        expect(parsed[1][0].pitchClass).toBe('heiban');
    });

    it('segments Japanese text without a JPDB API key or imported local dictionaries', async () => {
        const originalSegmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
        class FakeSegmenter {
            segment(_value: string): Array<{ segment: string; index: number; isWordLike: boolean }> {
                return [
                    { segment: 'きょう', index: 0, isWordLike: true },
                    { segment: 'は', index: 3, isWordLike: true },
                    { segment: 'よむ', index: 4, isWordLike: true },
                ];
            }
        }
        Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: FakeSegmenter });
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false }),
            jpdb: {} as never,
            dictionaries: {} as never,
        });

        try {
            expect(parser.canParse()).toBe(true);
            const [tokens] = await parser.parse(['きょうはよむ']);

            expect(tokens.map(token => token.card.spelling)).toEqual(['きょう', 'は', 'よむ']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 3], [3, 4], [4, 6]]);
            const rendered = renderTokensToHtml('きょうはよむ', tokens, DEFAULT_SETTINGS);
            expect(rendered).toContain('jpdb-reader-word jpdb-pitch-unknown');
            expect(rendered).not.toContain('jpdb-not-in-deck');
        } finally {
            if (originalSegmenter) Object.defineProperty(Intl, 'Segmenter', originalSegmenter);
            else delete (Intl as unknown as { Segmenter?: unknown }).Segmenter;
        }
    });

    it('segments Japanese text when JPDB parsing stalls without local dictionaries', async () => {
        vi.useFakeTimers();
        const originalSegmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
        class FakeSegmenter {
            segment(_value: string): Array<{ segment: string; index: number; isWordLike: boolean }> {
                return [
                    { segment: '今日', index: 0, isWordLike: true },
                    { segment: 'は', index: 2, isWordLike: true },
                    { segment: '読む', index: 3, isWordLike: true },
                ];
            }
        }
        Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: FakeSegmenter });
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: false }),
            jpdb: { parse: vi.fn(() => new Promise(() => undefined)) } as never,
            dictionaries: {} as never,
        });

        try {
            const parsed = parser.parse(['今日は読む'], { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true });
            await vi.advanceTimersByTimeAsync(1200);
            const [tokens] = await parsed;

            expect(tokens.map(token => token.card.spelling)).toEqual(['今日', 'は', '読む']);
        } finally {
            vi.useRealTimers();
            if (originalSegmenter) Object.defineProperty(Intl, 'Segmenter', originalSegmenter);
            else delete (Intl as unknown as { Segmenter?: unknown }).Segmenter;
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
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: true }),
            jpdb: { parse: vi.fn(() => new Promise(() => undefined)) } as never,
            dictionaries: { findTermMatches } as never,
        });

        try {
            const parsed = parser.parse(['漢字を書く'], { allowJpdbTimeoutFallback: true });
            await vi.advanceTimersByTimeAsync(6000);
            const [tokens] = await parsed;

            expect(findTermMatches).toHaveBeenCalledWith('漢字を書く', expect.any(Number), DEFAULT_SETTINGS.dictionaryPreferences);
            expect(tokens[0].card.spelling).toBe('漢字');
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
        expect(isYomuHostedAppUrl('https://example.com/japanese/article')).toBe(false);
    });

    it('keeps image OCR active on local hosted documentation pages', async () => {
        const app = new ReaderApp();
        const lookupText = vi.fn(async () => undefined);
        const internals = app as unknown as {
            lookupText: typeof lookupText;
        };
        internals.lookupText = lookupText;
        const image = document.createElement('img');
        image.src = '/yomu-reader/screenshots/real-popup-lookup.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);

        const text = document.createElement('p');
        text.textContent = 'よむ';
        document.body.replaceChildren(text, image);

        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });
        vi.stubGlobal('IntersectionObserver', class {
            constructor(private readonly callback: IntersectionObserverCallback) {}
            observe(target: Element): void {
                this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
            }
            unobserve(): void {}
            disconnect(): void {}
            takeRecords(): IntersectionObserverEntry[] { return []; }
            root = null;
            rootMargin = '0px';
            thresholds = [0];
        });
        const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

        try {
            expect(isYomuHostedPassivePage(location.href)).toBe(true);

            await app.init({ showWelcome: false });

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-layer')).not.toBeNull();
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe('日本語');
                expect(document.querySelector('.jpdb-reader-floating-button')).toBeNull();
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: () => line,
            });
            dispatchPointerEvent(line, 'pointerover', 120, 'mouse', 40);

            await waitForExpect(() => {
                expect(lookupText).toHaveBeenCalledWith('日本語', '日本語', expect.objectContaining({
                    anchor: line,
                    navigation: 'reset',
                    preservePosition: true,
                }));
            });
        } finally {
            if (elementFromPointDescriptor) Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
            else delete (document as Partial<Document>).elementFromPoint;
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('scans hosted Try Me text once when a real passive runtime replaces an in-flight demo', async () => {
        const app = new ReaderApp();
        const scanVisiblePage = vi.fn(async () => undefined);
        Object.assign(app as unknown as {
            pageScanner: { scanVisiblePage(options: { silent?: boolean }): Promise<void>; destroy(): void };
        }, {
            pageScanner: { scanVisiblePage, destroy: vi.fn() },
        });
        document.body.innerHTML = '<main data-yomu-demo-lookup>日本語を読む</main>';
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });

        try {
            await app.init({ showWelcome: false });

            expect(scanVisiblePage).toHaveBeenCalledWith({ silent: true });
            expect(document.querySelector('.jpdb-reader-floating-button')).toBeNull();
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('scans hosted Try Me text after VitePress route changes expose it', async () => {
        const app = new ReaderApp();
        const scanVisiblePage = vi.fn(async () => undefined);
        Object.assign(app as unknown as {
            pageScanner: { scanVisiblePage(options: { silent?: boolean }): Promise<void>; destroy(): void };
        }, {
            pageScanner: { scanVisiblePage, destroy: vi.fn() },
        });
        document.body.innerHTML = '<main>Docs feature page</main>';
        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/features/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });

        try {
            await app.init({ showWelcome: false });
            expect(scanVisiblePage).not.toHaveBeenCalled();

            document.body.innerHTML = '<main data-yomu-demo-lookup>青空の下で日本語を読む</main>';
            window.dispatchEvent(new CustomEvent(HOSTED_DEMO_LOOKUP_SCAN_EVENT));

            expect(scanVisiblePage).toHaveBeenCalledWith({ silent: true });
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not auto-render fallback OCR metadata when OCR auto-scan is off', () => {
        const image = document.createElement('img');
        image.src = '/yomu-reader/screenshots/real-popup-lookup.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);

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

    it('opens OCR line taps through the same sticky click lookup path as page words', async () => {
        const app = new ReaderApp();
        const lookupText = vi.fn(async () => undefined);
        const internals = app as unknown as {
            lookupText: typeof lookupText;
        };
        internals.lookupText = lookupText;

        const image = document.createElement('img');
        image.src = '/yomu-reader/screenshots/real-popup-lookup.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: '日本語を読む', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);

        vi.stubGlobal('location', {
            href: 'http://127.0.0.1:5177/yomu-reader/',
            origin: 'http://127.0.0.1:5177',
            hostname: '127.0.0.1',
        });
        vi.stubGlobal('IntersectionObserver', class {
            constructor(private readonly callback: IntersectionObserverCallback) {}
            observe(target: Element): void {
                this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
            }
            unobserve(): void {}
            disconnect(): void {}
            takeRecords(): IntersectionObserverEntry[] { return []; }
            root = null;
            rootMargin = '0px';
            thresholds = [0];
        });

        try {
            await app.init({ showWelcome: false });
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe('日本語を読む');
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            lookupText.mockClear();
            const tap = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 });
            const clickWasNotCanceled = line.dispatchEvent(tap);

            expect(clickWasNotCanceled).toBe(false);
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(lookupText).toHaveBeenCalledWith('日本語を読む', '日本語を読む', expect.objectContaining({
                anchor: line,
                navigation: 'reset',
                trigger: 'modal',
                userGesture: true,
            }));

            line.querySelector<HTMLElement>('.jpdb-ocr-line-text')!.innerHTML = '<span class="jpdb-reader-word jpdb-not-in-deck" data-vid="10" data-sid="20" data-sentence="日本語を読む" tabindex="0">日本語</span>を読む';
            const word = line.querySelector<HTMLElement>('.jpdb-reader-word[data-vid]')!;
            lookupText.mockClear();
            word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 130, clientY: 120 }));

            expect(lookupText).toHaveBeenCalledWith('日本語', '日本語を読む', expect.objectContaining({
                anchor: word,
                navigation: 'reset',
                trigger: 'modal',
                userGesture: true,
            }));
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
            { text: '日本語', box: { left: 0, top: 0, width: 561, height: 442 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 561 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 442 });
        image.getBoundingClientRect = () => new DOMRect(100, 50, 541, 371.9375);
        document.body.replaceChildren(image);

        vi.stubGlobal('IntersectionObserver', class {
            constructor(private readonly callback: IntersectionObserverCallback) {}
            observe(target: Element): void {
                this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
            }
            unobserve(): void {}
            disconnect(): void {}
            takeRecords(): IntersectionObserverEntry[] { return []; }
            root = null;
            rootMargin = '0px';
            thresholds = [0];
        });

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
            const expectedLeft = (541 - renderedWidth) / 2;

            await waitForExpect(() => {
                const line = document.querySelector<HTMLElement>('.jpdb-ocr-line');
                expect(line).not.toBeNull();
                expect(Number.parseFloat(line?.style.left || '')).toBeCloseTo(expectedLeft, 1);
                expect(Number.parseFloat(line?.style.width || '')).toBeCloseTo(renderedWidth, 1);
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('extracts nested audio URLs from JSON-ish responses', () => {
        expect(findAudioUrl({ sources: [{ name: 'miss' }, { audio: [{ url: 'http://x.test/audio.mp3' }] }] }))
            .toBe('http://x.test/audio.mp3');
        expect(findAudioUrls({ audioSources: [{ url: 'http://x.test/1.mp3' }, { url: 'http://x.test/2.mp3' }] }))
            .toEqual(['http://x.test/1.mp3', 'http://x.test/2.mp3']);
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

    it('shuffles available audio sources across repeated play presses', async () => {
        const played: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
            },
        });

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

            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual([]);
            expect(played).toEqual([
                'http://x.test/second.mp3',
                'http://x.test/first.mp3',
            ]);
        } finally {
            randomSpy.mockRestore();
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('keeps JPDB and browser text-to-speech enabled in the default audio fallbacks', () => {
        expect(DEFAULT_AUDIO_SOURCES.map(source => source.type)).toEqual([
            'jpod101',
            'language-pod-101',
            'jisho',
            'jpdb-tts',
            'text-to-speech',
        ]);
        expect(normalizeAudioSources([
            { type: 'jpod101', url: '', voice: '', enabled: true },
            { type: 'language-pod-101', url: '', voice: '', enabled: true },
            { type: 'jisho', url: '', voice: '', enabled: true },
            { type: 'text-to-speech', url: '', voice: '', enabled: true },
        ]).map(source => source.type)).toEqual([
            'jpod101',
            'language-pod-101',
            'jisho',
            'jpdb-tts',
            'text-to-speech',
        ]);
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'jpdb-tts', url: '', voice: '', enabled: true });
        expect(DEFAULT_AUDIO_SOURCES).toContainEqual({ type: 'text-to-speech', url: '', voice: '', enabled: true });
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'jpdb-tts', url: '', voice: '', enabled: true });
        expect(normalizeAudioSources(undefined)).toContainEqual({ type: 'text-to-speech', url: '', voice: '', enabled: true });
        expect(DEFAULT_SETTINGS.audioFallbackChimeEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.autoPlayAudio).toBe(true);
        expect(DEFAULT_SETTINGS.audioAutoPlayMode).toBe('all');
        expect(DEFAULT_SETTINGS.audioTtsMode).toBe('fallback');
    });

    it('normalizes and decodes JPDB page audio references', async () => {
        expect(parseJpdbAudioData('m1/a+m1/b,/static/user/example.mp3,https://bad.example/audio.mp3,../bad')).toEqual([
            'm1/a',
            'm1/b',
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
            .rejects.toThrow('JPDB audio response was not a playable audio file');
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

    it('routes hosted JPDB static audio through the public proxy without custom browser headers', async () => {
        const target = 'https://jpdb.io/static/v/m1/e9cac7e3d132';
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('audio', { status: 200 })));
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(fetchWithCorsFallbacks(target, DEFAULT_YOMU_PUBLIC_PROXY_URL, {
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
            expect(requestedUrl.origin).toBe(DEFAULT_YOMU_PUBLIC_PROXY_URL);
            expect(requestedUrl.searchParams.get('url')).toBe(target);
            expect(requestedUrl.searchParams.get('x-forcecaf')).toBe('1');
            const headers = new Headers(init?.headers);
            expect(headers.has('x-access')).toBe(false);
            expect(headers.has('x-forcecaf')).toBe(false);
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

    it('uses the configured popover height by default', () => {
        expect(DEFAULT_SETTINGS.popoverHeightMode).toBe('fixed');
    });

    it('keeps Immersion Kit thumbnails from collapsing in short frames', () => {
        expect(IMMERSION_STUDY_CSS).toContain('--jpdb-reader-example-media-max-height: clamp(150px, calc(100vh - 300px), 260px);');
        expect(IMMERSION_STUDY_CSS).toContain('--jpdb-reader-example-media-max-height: clamp(130px, calc(100vh - 300px), 230px);');
        expect(IMMERSION_STUDY_CSS).not.toContain('max-height: min(260px, calc(100vh - 300px));');
    });

    it('lets parsed study sentences wrap without pushing the sentence audio button off mobile sheets', () => {
        const style = document.createElement('style');
        style.textContent = `${READER_WORD_CSS}\n${IMMERSION_STUDY_CSS}`;
        document.head.append(style);
        document.body.innerHTML = `
            <div data-jpdb-reader-root>
                <div class="jpdb-reader-study-label-row">
                    <div class="jpdb-reader-study-label">Japanese</div>
                    <button class="jpdb-reader-icon-mini" type="button"></button>
                </div>
                <div class="jpdb-reader-study-original">
                    <span class="jpdb-reader-word">青空の下で日本語を読む今日は静かな喫茶店で新しい本を読みました</span>
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

    it('styles structured dictionary form-valid cells without inventing replacement symbols', () => {
        expect(LOCAL_DICTIONARY_CSS).toContain('.jpdb-reader-local-glossary .gloss-sc-td[data-sc-class="form-valid"]');
        expect(LOCAL_DICTIONARY_CSS).toContain('.jpdb-reader-local-glossary [data-sc-class="form-valid"]');
        expect(LOCAL_DICTIONARY_CSS).not.toContain('span[data-sc-class="form-valid"]:empty::before');
        expect(LOCAL_DICTIONARY_CSS).not.toContain('content: "✓";');
    });

    it('contains Jitendex structured boxes inside the popover column', () => {
        expect(LOCAL_DICTIONARY_CSS).toContain('overflow-wrap: anywhere;');
        expect(LOCAL_DICTIONARY_CSS).toContain('.jpdb-reader-local-glossary [data-sc-class="extra-box"]');
        expect(LOCAL_DICTIONARY_CSS).toContain('box-sizing: border-box;');
        expect(LOCAL_DICTIONARY_CSS).toContain('max-width: 100%;');
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

            expect(settings.wordHighlightColorSource).toBe('pitch');
            expect(settings.wordUnderlineColorSource).toBe('jpdb');
            expect(settings.wordTextColorSource).toBe('off');
            expect(settings.subtitleHighlightColorSource).toBe('jpdb');
            expect(settings.subtitleUnderlineColorSource).toBe('pitch');
            expect(settings.subtitleTextColorSource).toBe('jpdb');
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
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({
                    status: 200,
                    response: new Blob(['audio'], { type: 'audio/mpeg' }),
                });
            },
        });

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

    it('does not fall through to browser text-to-speech when an available JapanesePod101 clip cannot start playback', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
        class FakeSpeechSynthesisUtterance {
            lang = '';
            voice: SpeechSynthesisVoice | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(public text: string) {}
        }
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('Playback blocked', 'NotAllowedError'));
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
        const originalCreateObjectUrl = URL.createObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/jpod101-audio'),
        });
        vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(),
            getVoices: vi.fn(() => []),
            speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
                spoken.push(utterance.text);
                utterance.onend?.();
            }),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({
                    status: 200,
                    response: new Blob(['audio'], { type: 'audio/mpeg' }),
                });
            },
        });

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

            await expect(player.play({ ...card, spelling: '月光', reading: 'げっこう' })).resolves.toBe(false);

            expect(requested).toHaveLength(1);
            expect(requested[0]).toContain('https://assets.languagepod101.com/dictionary/japanese/audiomp3.php');
            expect(spoken).toEqual([]);
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
        const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
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

    it('reserves a gesture audio element before fetching JPDB example audio', async () => {
        const played: string[] = [];
        const loopStates: boolean[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played, loopStates);
        const originalCreateObjectUrl = URL.createObjectURL;
        let resolveFetch!: (response: Response) => void;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:https://hrussellzfac023.github.io/yomu-reader/jpdb-example-audio'),
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
            }));

            const playPromise = player.playJpdbAudio('m1/b4d5af0478d7', { userGesture: true });
            expect(played).toEqual([expect.stringMatching(/^data:audio\/wav;base64,/)]);
            await waitForExpect(() => expect(fetchMock).toHaveBeenCalledTimes(1));

            const oggHeader = [0x4f, 0x67, 0x67, 0x53];
            const encoded = new Uint8Array(oggHeader.map((byte, index) => byte ^ [0x06, 0x23, 0x54, 0x0f][index]));
            resolveFetch({
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
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            restoreMedia();
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
            const player = new AudioPlayer(() => ({ ...DEFAULT_SETTINGS, audioSelectionMode: 'first' }));

            await expect(player.play(card)).resolves.toBe(true);

            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls[0]).toContain('yomu-jpdb-public-proxy');
            expect(urls).toContain(`https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent('https://jisho.org/search/%E9%A3%9F%E3%81%B9%E3%82%8B')}`);
            expect(urls).toContain('https://r.jina.ai/http://r.jina.ai/http://https://jisho.org/search/%E9%A3%9F%E3%81%B9%E3%82%8B');
            expect(urls).not.toContain(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://jisho.org/search/%E9%A3%9F%E3%81%B9%E3%82%8B')}`);
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
            await expect(player.play(playCard), type).resolves.toBe(true);
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

    it('tries public proxy fallbacks for JPDB pitch from another site without the userscript bridge', async () => {
        vi.stubGlobal('location', { origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not be called'))));

        try {
            const client = new JpdbPublicPitchClient();

            await expect(client.lookup('易しい', 'やさしい')).resolves.toEqual([]);
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(urls[0]).toBe(`https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent('https://jpdb.io/search?q=%E6%98%93%E3%81%97%E3%81%84')}`);
            expect(urls).toContain(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://jpdb.io/search?q=%E6%98%93%E3%81%97%E3%81%84')}`);
            expect(urls.some(url => url.startsWith('https://corsproxy.io/'))).toBe(false);
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
            expect(urls.some(url => url.startsWith('https://corsproxy.io/'))).toBe(false);
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
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="donate"]')?.href).toContain('paypal.me');
        expect(form.querySelector<HTMLElement>('[data-help-support-copy]')?.textContent).toContain('よむ brings popup lookup');
        expect(form.querySelector<HTMLElement>('[data-help-support-copy-extra]')?.textContent).toContain('Donations are optional');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="discord"]')?.href).toBe('https://discord.gg/WvDt57uk5');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-help-actions');
        expect(SETTINGS_CSS).toContain('flex-wrap: nowrap');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-help-actions .jpdb-reader-help-donate');
        expect(SETTINGS_CSS).toContain('.jpdb-reader-help-actions .jpdb-reader-help-reset');
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
        const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
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

    it('does not bypass public API rate limits through proxy fallbacks', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=250';
        const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve(new Response('rate limited', { status: 429 })));
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, DEFAULT_YOMU_PUBLIC_PROXY_URL, { allowDirectCrossOrigin: true, credentials: 'omit' });

            expect(response.status).toBe(429);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0]?.[0])).toBe(target);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses direct fetch for CORS-friendly hosted Immersion Kit requests', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=250';
        const fetchMock = vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response('ok', { status: 200 })));
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, DEFAULT_YOMU_PUBLIC_PROXY_URL, { allowDirectCrossOrigin: true, credentials: 'omit' });

            expect(await response.text()).toBe('ok');
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                target,
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses direct fetch for CORS-friendly iPad Immersion Kit requests', async () => {
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
                target,
            ]);
        } finally {
            restoreBrowser();
            vi.unstubAllGlobals();
        }
    });

    it('skips direct browser fetches for known CORS-blocked public audio lookup URLs', async () => {
        const target = 'https://jisho.org/search/%E5%A4%A7%E5%88%87';
        const jishoAudioTarget = 'https://d1vjc5dkcd3yh2.cloudfront.net/audio/7f5db2ba73cff9c5ef681c0431a12d93.mp3';
        const japanesePodTarget = 'https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E5%A4%A7%E5%88%87&kana=%E3%81%9F%E3%81%84%E3%81%9B%E3%81%A4';
        const innovativeLanguageTarget = 'https://cdn.innovativelanguage.com/japanesepod101/learningcenter/audio/vocabulary/4306.mp3';
        const languagePodPostTarget = 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post';
        const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith('https://api.allorigins.win/raw?') && url.includes('jisho.org')) {
                return Promise.resolve(new Response('ok', { status: 200 }));
            }
            if (url.startsWith('https://yomu-jpdb-public-proxy') && url.includes('jisho.org')) {
                return Promise.resolve(new Response('ok', { status: 200 }));
            }
            if (url.startsWith('https://yomu-jpdb-public-proxy') && url.includes('d1vjc5dkcd3yh2.cloudfront.net')) {
                return Promise.resolve(new Response('jisho audio', { status: 200 }));
            }
            if (url.startsWith('https://yomu-jpdb-public-proxy') && url.includes('assets.languagepod101.com')) {
                return Promise.resolve(new Response('audio', { status: 200 }));
            }
            if (url.startsWith('https://yomu-jpdb-public-proxy') && url.includes('cdn.innovativelanguage.com')) {
                return Promise.resolve(new Response('innovative audio', { status: 200 }));
            }
            if (url.startsWith('https://yomu-jpdb-public-proxy') && url.includes('www.japanesepod101.com')) {
                return Promise.resolve(new Response('language pod html', { status: 200 }));
            }
            if (url.startsWith('https://r.jina.ai/')) return Promise.resolve(new Response('ok', { status: 200 }));
            return Promise.reject(new Error(`unexpected fetch: ${url}`));
        });
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, '', { allowDirectCrossOrigin: true, credentials: 'omit' });

            expect(await response.text()).toBe('ok');
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(target)}`,
            ]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(jishoAudioTarget, '', { allowDirectCrossOrigin: true, credentials: 'omit' }))
                .resolves.toBeInstanceOf(Response);
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(jishoAudioTarget)}`,
            ]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(japanesePodTarget, '', { allowDirectCrossOrigin: true, credentials: 'omit' }))
                .resolves.toBeInstanceOf(Response);
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(japanesePodTarget)}`,
            ]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(innovativeLanguageTarget, '', { allowDirectCrossOrigin: true, credentials: 'omit' }))
                .resolves.toBeInstanceOf(Response);
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(innovativeLanguageTarget)}`,
            ]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(languagePodPostTarget, DEFAULT_YOMU_PUBLIC_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'post=dictionary_reference',
                allowDirectCrossOrigin: true,
                credentials: 'omit',
            })).resolves.toBeInstanceOf(Response);
            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(languagePodPostTarget)}`,
            ]);
            const [, proxiedPostInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
            expect(proxiedPostInit).toMatchObject({
                method: 'POST',
                body: 'post=dictionary_reference',
            });
        } finally {
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

    it('allows public Worker proxying for arbitrary HTTP targets and methods', () => {
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/kanji/%E5%9B%B3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/vocabulary/123/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/static/v/m1/e9cac7e3d132'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://uchisen.com/kanji/%E5%9B%B3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://ik.imagekit.io/uchisen/generated/saved/generated_sample.jpg'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://release-assets.githubusercontent.com/github-production-release-asset/123/asset-id?sig=github-signed'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://example.com/dict.zip'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://cdn.example.com/audio.mp3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://www.japanesepod101.com/learningcenter/reference/dictionary_post'))).toBe(true);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://jpdb.io/api/v1/lookup-vocabulary'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/api/v1/lookup-vocabulary'))).toBe(true);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://jpdb.io/prioritize'))).toBe(true);
        expect(isAllowedPublicProxyTarget('PUT', new URL('https://api.example.com/items/1'))).toBe(true);
        expect(isAllowedPublicProxyTarget('PATCH', new URL('https://api.example.com/items/1'))).toBe(true);
        expect(isAllowedPublicProxyTarget('DELETE', new URL('https://api.example.com/items/1'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('http://127.0.0.1/audio.mp3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('file:///tmp/audio.mp3'))).toBe(false);
    });

    it('strips browser fetch metadata before forwarding public Worker requests', async () => {
        const upstreamFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok', { status: 200 })));
        vi.stubGlobal('fetch', upstreamFetch);

        try {
            const response = await PublicProxyWorker.fetch(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jisho.org/search/%E8%AA%AD%E3%82%80')}`, {
                    headers: {
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'cross-site',
                    },
                }),
                {},
                { waitUntil: vi.fn() },
            );

            expect(response.status).toBe(200);
            const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as unknown as Request;
            const headers = upstreamRequest.headers;
            expect(upstreamRequest.url).toBe('https://jisho.org/search/%E8%AA%AD%E3%82%80');
            expect(headers.has('sec-fetch-dest')).toBe(false);
            expect(headers.has('sec-fetch-mode')).toBe(false);
            expect(headers.has('sec-fetch-site')).toBe(false);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('forwards JPDB public audio access headers through the public Worker', async () => {
        const upstreamFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('audio', { status: 200 })));
        vi.stubGlobal('fetch', upstreamFetch);

        try {
            const preflight = await PublicProxyWorker.fetch(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jpdb.io/static/v/m1/e9cac7e3d132')}`, {
                    method: 'OPTIONS',
                    headers: {
                        Origin: 'http://127.0.0.1:5174',
                        'Access-Control-Request-Method': 'GET',
                        'Access-Control-Request-Headers': 'x-access, x-forcecaf',
                    },
                }),
                {},
                { waitUntil: vi.fn() },
            );
            const response = await PublicProxyWorker.fetch(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jpdb.io/static/v/m1/e9cac7e3d132')}`, {
                    headers: {
                        'X-Access': "please don't steal these files",
                        'X-ForceCAF': '1',
                    },
                }),
                {},
                { waitUntil: vi.fn() },
            );

            const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as unknown as Request;
            expect(preflight.headers.get('access-control-allow-headers')).toContain('x-access');
            expect(preflight.headers.get('access-control-allow-headers')).toContain('x-forcecaf');
            expect(response.status).toBe(200);
            expect(upstreamRequest.url).toBe('https://jpdb.io/static/v/m1/e9cac7e3d132');
            expect(upstreamRequest.headers.get('x-access')).toBe("please don't steal these files");
            expect(upstreamRequest.headers.get('x-forcecaf')).toBe('1');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('adds JPDB public audio access headers in the public Worker when the browser request omits them', async () => {
        const upstreamFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('audio', { status: 200 })));
        vi.stubGlobal('fetch', upstreamFetch);

        try {
            const response = await PublicProxyWorker.fetch(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jpdb.io/static/v/m1/e9cac7e3d132')}&x-forcecaf=1`),
                {},
                { waitUntil: vi.fn() },
            );

            const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as unknown as Request;
            expect(response.status).toBe(200);
            expect(upstreamRequest.url).toBe('https://jpdb.io/static/v/m1/e9cac7e3d132');
            expect(upstreamRequest.headers.get('x-access')).toBe("please don't steal these files");
            expect(upstreamRequest.headers.get('x-forcecaf')).toBe('1');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('forwards arbitrary public Worker methods, bodies, and request headers', async () => {
        const upstreamFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('updated', {
            status: 202,
            headers: { 'X-Upstream-Trace': 'trace-1' },
        })));
        vi.stubGlobal('fetch', upstreamFetch);

        try {
            const response = await PublicProxyWorker.fetch(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://api.example.com/items/1?debug=1')}`, {
                    method: 'PATCH',
                    headers: {
                        Origin: 'https://hrussellzfac023.github.io',
                        Authorization: 'Bearer token',
                        'Content-Type': 'application/json',
                        'X-Custom-Request': 'yes',
                        'Sec-Fetch-Mode': 'cors',
                    },
                    body: JSON.stringify({ name: '読む' }),
                }),
                {},
                { waitUntil: vi.fn() },
            );

            const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as unknown as Request;
            expect(response.status).toBe(202);
            expect(response.headers.get('access-control-allow-origin')).toBe('https://hrussellzfac023.github.io');
            expect(response.headers.get('access-control-allow-credentials')).toBe('true');
            expect(response.headers.get('access-control-expose-headers')).toContain('x-upstream-trace');
            expect(upstreamRequest.url).toBe('https://api.example.com/items/1?debug=1');
            expect(upstreamRequest.method).toBe('PATCH');
            expect(upstreamRequest.headers.get('authorization')).toBe('Bearer token');
            expect(upstreamRequest.headers.get('content-type')).toBe('application/json');
            expect(upstreamRequest.headers.get('x-custom-request')).toBe('yes');
            expect(upstreamRequest.headers.has('sec-fetch-mode')).toBe(false);
            expect(await upstreamRequest.text()).toBe(JSON.stringify({ name: '読む' }));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('orders translation and grammar as separate definition sources', () => {
        const orderedIds = orderedDefinitionSourceIds({
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

        expect(orderedIds).toContain(STUDY_TRANSLATION_SOURCE_ID);
        expect(orderedIds).toContain(STUDY_GRAMMAR_SOURCE_ID);
        expect(orderedIds.indexOf(STUDY_GRAMMAR_SOURCE_ID)).toBeLessThan(orderedIds.indexOf(STUDY_TRANSLATION_SOURCE_ID));
        expect(definitionSourceRows(DEFAULT_SETTINGS).map(row => row.id)).toEqual(expect.arrayContaining([STUDY_TRANSLATION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID]));
        expect(translationOnlyIds).toContain(STUDY_TRANSLATION_SOURCE_ID);
        expect(translationOnlyIds).not.toContain(STUDY_GRAMMAR_SOURCE_ID);
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

    it('adds Immersion Kit to kanji source ordering', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            kanjiImmersionKitPriority: 1,
        }, 'https://jpdb.io/settings');

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.kanjiImmersionKitEnabled).toBe(true);
        expect(saved.kanjiImmersionKitPriority).toBe(1);
        expect(kanjiSourceRows(saved).map(row => row.id)).toContain(IMMERSION_KIT_SOURCE_ID);
        expect(orderedKanjiSourceIds(saved)[1]).toBe(IMMERSION_KIT_SOURCE_ID);
        expect(orderedKanjiSourceIds({ ...saved, kanjiImmersionKitEnabled: false })).not.toContain(IMMERSION_KIT_SOURCE_ID);
        expect(orderedKanjiSourceIds({ ...saved, immersionKitEnabled: false })).not.toContain(IMMERSION_KIT_SOURCE_ID);
    });

    it('parses public JPDB search results into word cards', () => {
        const cards = parseJpdbSearchHtml(`
            <div class="results search">
                <div class="result vocabulary">
                    <div class="subsection-headword">
                        <div class="primary-spelling">
                            <div class="spelling"><ruby>お<rt></rt>母<rt>かあ</rt>さん<rt></rt></ruby></div>
                        </div>
                    </div>
                    <div class="subsection-meanings">
                        <div class="part-of-speech"><div>Noun</div><div>Honorific</div></div>
                        <div class="description">1.  mother;  mom;  mum;  ma</div>
                        <div class="description">2.  wife</div>
                    </div>
                    <div class="tags"><div class="tag">Top 1,400</div></div>
                    <a class="view-conjugations-link" href="/vocabulary/1002650/%E3%81%8A%E6%AF%8D%E3%81%95%E3%82%93/%E3%81%8A%E3%81%8B%E3%81%82%E3%81%95%E3%82%93#a">More details...</a>
                </div>
            </div>
        `);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            vid: 1002650,
            sid: 0,
            spelling: 'お母さん',
            reading: 'おかあさん',
            frequencyRank: 1400,
            partOfSpeech: ['Noun', 'Honorific'],
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: 'お母さん',
        });
        expect(cards[0]?.meanings.map(meaning => meaning.glosses[0])).toEqual([
            'mother; mom; mum; ma',
            'wife',
        ]);
    });

    it('does not treat public JPDB supplemental path slugs as readings', () => {
        const cards = parseJpdbSearchHtml(`
            <div class="results search">
                <div class="result vocabulary">
                    <div class="subsection-headword">
                        <div class="primary-spelling">
                            <div class="spelling"><ruby>日<rt>に</rt>本<rt>ほん</rt>語<rt>ご</rt></ruby></div>
                        </div>
                    </div>
                    <div class="subsection-meanings">
                        <div class="part-of-speech"><div>Noun</div></div>
                        <div class="description">1. Japanese language</div>
                    </div>
                    <div class="tags"><div class="tag">Top 4,800</div></div>
                    <a class="view-conjugations-link" href="/vocabulary/1464530/%E6%97%A5%E6%9C%AC%E8%AA%9E/used-in">Used in: 4800</a>
                </div>
            </div>
        `);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            vid: 1464530,
            spelling: '日本語',
            reading: 'にほんご',
            frequencyRank: 4800,
        });
    });

    it('uses canonical JPDB detail readings before supplemental links when resolving public cards', () => {
        const cards = parseJpdbSearchHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1407930/%E5%A4%9A%E8%AA%AD/%E3%81%9F%E3%81%A9%E3%81%8F">
            <meta name="description" content="Dictionary definition of 多読 (たどく) — wide reading; extensive reading">
            <div class="results details">
                <div class="result vocabulary">
                    <div class="subsection-headword">
                        <div class="primary-spelling">
                            <div class="spelling"><div><ruby class="v">多<rt>た</rt>読<rt>どく</rt></ruby></div></div>
                        </div>
                    </div>
                    <div class="subsection-meanings">
                        <div class="part-of-speech"><div>Noun</div><div>Verb (する)</div></div>
                        <div class="description">1. wide reading; extensive reading</div>
                    </div>
                    <a class="view-conjugations-link" href="/vocabulary/1407930/%E5%A4%9A%E8%AA%AD/used-in">Used in: 10</a>
                </div>
            </div>
        `);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            vid: 1407930,
            spelling: '多読',
            reading: 'たどく',
            partOfSpeech: ['Noun', 'Verb (する)'],
        });
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
                <div class="subsection"><div class="example"><a class="icon-link example-audio" href="#" data-audio="m1/example-audio"></a><span class="sentence">大統領は、中国の国家主席と話をする予定です。</span><span class="translation">The president plans to talk with China's national leader.</span></div></div>
            </div>
            <div class="subsection-used-in">
                <h6 class="subsection-label">Used in vocabulary</h6>
                <div class="subsection">
                    <div class="used-in">
                        <div class="jp"><a href="/vocabulary/4/%E5%9B%BD%E5%AE%B6%E4%B8%BB%E7%BE%A9/%E3%81%93%E3%81%A3%E3%81%8B%E3%81%97%E3%82%85%E3%81%8E#a"><ruby>国家<rt>こっか</rt></ruby>主義</a></div>
                        <div class="en">nationalism</div>
                    </div>
                </div>
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
        expect(html).toContain('data-jpdb-reader-suppress-ruby');
        expect(info?.usedInVocabulary).toEqual([{
            term: '国家主義',
            reading: 'こっかしゅぎ',
            meaning: 'nationalism',
            url: '/vocabulary/4/%E5%9B%BD%E5%AE%B6%E4%B8%BB%E7%BE%A9/%E3%81%93%E3%81%A3%E3%81%8B%E3%81%97%E3%82%85%E3%81%8E#a',
        }]);
        expect(html).toContain('jpdb-reader-jpdb-used-in-group');
        expect(html).toContain('Used in vocabulary');
        expect(html).toContain('data-source-state-key="definition-source:__jpdb__:used-in-vocabulary"');
        expect(html).toContain('data-dictionary-lookup="国家主義"');
        expect(html).toContain('jpdb-reader-jpdb-used-in-term jpdb-reader-parseable');
        expect(html).not.toContain('<span class="jpdb-reader-jpdb-compound-reading">こっかしゅぎ</span>');
        expect(html).toContain('jpdb-reader-example-count');
        expect(html).not.toContain('jpdb-reader-jpdb-compound-ruby');
        expect(html).toContain('大統領は、中国の国家主席と話をする予定です。');
        expect(html).not.toContain('data-source-state-key="definition-source:__jpdb_examples__"');
        expect(html).toContain('Example sentences');
        expect(html).toContain('jpdb-reader-jpdb-examples-group');
        expect(html).toContain('data-action="jpdb-example-audio"');
        expect(html).toContain('data-jpdb-audio="m1/example-audio"');
        expect(html).toContain('jpdb-reader-example-sentence jpdb-reader-parseable');
        expect(html).toContain('jpdb-reader-example-translation');
        expect(html).not.toContain('jpdb-reader-example-translation jpdb-reader-parseable');
    });

    it('keeps host page section spacing out of JPDB compound extras', () => {
        const style = document.createElement('style');
        style.textContent = `
            section { margin: 96px; padding: 48px; }
            ${POPOVER_CORE_CSS}
        `;
        const host = document.createElement('div');
        host.setAttribute('data-jpdb-reader-root', '');
        host.innerHTML = renderJpdbDefinitionSource({
            ...card,
            spelling: '無料',
            reading: 'むりょう',
            meanings: [{ glosses: ['free; gratis'], partOfSpeech: [] }],
        }, key => `data-source-state-key="${key}" open`, {
            meanings: ['free; gratis'],
            compounds: [
                { term: '無', reading: 'む', meaning: 'nothing; naught; nought; un-; non-', url: '/vocabulary/1' },
                { term: '料', reading: 'りょう', meaning: 'fee; charge; rate; material', url: '/vocabulary/2' },
            ],
            usedInVocabulary: [
                { term: '無料体験', reading: 'むりょうたいけん', meaning: 'free trial', url: '/vocabulary/3' },
            ],
            examples: [],
        });
        document.head.append(style);
        document.body.append(host);

        try {
            const extra = host.querySelector<HTMLElement>('.jpdb-reader-jpdb-extra');
            expect(extra).not.toBeNull();
            const computed = getComputedStyle(extra!);
            expect(computed.marginTop).toBe('0px');
            expect(computed.marginBottom).toBe('0px');
            expect(computed.paddingTop).toBe('0px');
            expect(computed.paddingBottom).toBe('0px');
        } finally {
            host.remove();
            style.remove();
        }
    });

    it('parses live-shaped JPDB used-in rows, example audio, and keeps popup extras bounded', () => {
        const info = parseJpdbVocabularyHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1549340/嵐/あらし">
            <div class="result vocabulary">
                <a href="/vocabulary/1549340/嵐/あらし#a"><ruby>嵐<rt>あらし</rt></ruby></a>
                <div class="subsection-meanings"><div class="subsection"><div class="description">1. storm; tempest</div></div></div>
                <div class="subsection-used-in">
                    <h6 class="subsection-label">Used in vocabulary (18 in total)</h6>
                    <div class="subsection">
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1291650/砂嵐/すなあらし#a"><ruby>砂<rt>すな</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">sandstorm</div></div>
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1381790/青嵐/あおあらし#a"><ruby>青<rt>あお</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">mountain air</div></div>
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1786730/大嵐/おおあらし#a"><ruby>大<rt>おお</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">raging storm</div></div>
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1/春嵐/はるあらし#a"><ruby>春<rt>はる</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">spring storm</div></div>
                    </div>
                </div>
                <div class="subsection-examples">
                    <h6 class="subsection-label">Examples (55 in total)</h6>
                    <div class="subsection">
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/e9cac7e3d132"></a><div class="used-in"><div class="jp"><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>になりそうです。</div><div class="en">There's going to be a storm.</div></div></div>
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/7ab144f810b0"></a><div class="used-in"><div class="jp">この<span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>はいつまで続くんだろう？</div><div class="en">How long will this storm last?</div></div></div>
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/cb7ee21b999b"></a><div class="used-in"><div class="jp"><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>が私たちの町に近づいていた。</div><div class="en">A storm was approaching our town.</div></div></div>
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/extra"></a><div class="used-in"><div class="jp"><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>がしだいにおさまってきた。</div><div class="en">The storm has gradually abated.</div></div></div>
                    </div>
                </div>
            </div>
        `, '嵐', 'あらし');

        expect(info?.usedInVocabulary).toHaveLength(3);
        expect(info?.usedInVocabulary?.map(entry => entry.term)).toEqual(['砂嵐', '青嵐', '大嵐']);
        expect(info?.examples).toHaveLength(3);
        expect(info?.examples[0]).toMatchObject({
            sentence: '嵐になりそうです。',
            translation: "There's going to be a storm.",
            audioIds: ['m1/e9cac7e3d132'],
        });
        expect(info?.examples.map(example => example.audioIds?.[0])).not.toContain('m1/extra');
    });

    it('parses JPDB monolingual examples by section label', () => {
        const info = parseJpdbVocabularyHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1608130/難波/なにわ">
            <div class="result vocabulary">
                <a href="/vocabulary/1608130/難波/なにわ#a"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></a>
                <div class="subsection-meanings"><div class="subsection"><div class="description">1. Naniwa (former name for Osaka region)</div></div></div>
                <div class="jpdb-example-section">
                    <h6 class="subsection-label">Monolingual examples (44 in total)</h6>
                    <div class="subsection">
                        <div><div class="jp">じゃあちょっと<span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>の方まで出ようか。</div></div>
                        <div><div class="jp"><span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>先生に何か言われたの。</div></div>
                        <div><div class="jp">それで、<span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>は負けたのだ。</div></div>
                        <div><div class="jp">もう一つの<span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>です。</div></div>
                    </div>
                </div>
            </div>
        `, '難波', 'なにわ');

        expect(info?.examples).toHaveLength(3);
        expect(info?.examples.map(example => example.sentence)).toEqual([
            'じゃあちょっと難波の方まで出ようか。',
            '難波先生に何か言われたの。',
            'それで、難波は負けたのだ。',
        ]);
    });

    it('ignores JPDB media used-in pages in popup supplements', async () => {
        const detailUrl = 'https://jpdb.io/vocabulary/1297200/%E5%92%B2%E3%81%8D%E4%B9%B1%E3%82%8C%E3%82%8B/%E3%81%95%E3%81%8D%E3%81%BF%E3%81%A0%E3%82%8C%E3%82%8B';
        const usedInUrl = 'https://jpdb.io/vocabulary/1297200/%E5%92%B2%E3%81%8D%E4%B9%B1%E3%82%8C%E3%82%8B/used-in';
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === detailUrl) {
                return Promise.resolve(new Response(`
                    <link rel="canonical" href="https://jpdb.io/vocabulary/1297200/咲き乱れる/さきみだれる">
                    <div class="result vocabulary">
                        <a href="/vocabulary/1297200/咲き乱れる/さきみだれる#a"><ruby>咲<rt>さ</rt>き乱れる</ruby></a>
                        <div class="subsection-meanings"><div class="subsection"><div class="description">1. to bloom in profusion</div></div></div>
                        <a class="view-conjugations-link" href="/vocabulary/1297200/咲き乱れる/used-in">Used in: 528</a>
                    </div>
                `, { status: 200 }));
            }
            return Promise.reject(new Error(`unexpected fetch: ${url}`));
        });
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const info = await new JpdbVocabularyClient().lookup(1297200, '咲き乱れる', 'さきみだれる');
            const html = renderJpdbDefinitionSource({
                ...card,
                spelling: '咲き乱れる',
                reading: 'さきみだれる',
                meanings: [{ glosses: ['to bloom in profusion'], partOfSpeech: ['verb'] }],
            }, key => `data-source-state-key="${key}"`, info);

            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([detailUrl]);
            expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(usedInUrl);
            expect(html).toContain('to bloom in profusion');
            expect(html).not.toContain('jpdb-reader-jpdb-used-in-sources-group');
            expect(html).not.toContain('Used in: 528');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('follows JPDB search result detail links for fallback cards before rendering extras', async () => {
        const searchUrl = 'https://jpdb.io/search?q=%E4%B8%80%E6%96%B9';
        const detailUrl = 'https://jpdb.io/vocabulary/1166510/%E4%B8%80%E6%96%B9/%E3%81%84%E3%81%A3%E3%81%BD%E3%81%86#a';
        const usedInUrl = 'https://jpdb.io/vocabulary/1166510/%E4%B8%80%E6%96%B9/used-in';
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === searchUrl) {
                return Promise.resolve(new Response(`
                    <div class="results search">
                        <div class="result vocabulary">
                            <a href="/vocabulary/1166510/一方/いっぽう#a"><ruby>一<rt>いっ</rt>方<rt>ぽう</rt></ruby></a>
                            <div class="subsection-meanings"><div class="subsection"><div class="description">1. one; the other</div></div></div>
                            <a class="view-conjugations-link" href="/vocabulary/1166510/一方/いっぽう#a">More details...</a>
                            <a class="view-conjugations-link" href="/vocabulary/1166510/一方/used-in">Used in: 4067</a>
                        </div>
                    </div>
                `, { status: 200 }));
            }
            if (url === detailUrl) {
                return Promise.resolve(new Response(`
                    <link rel="canonical" href="https://jpdb.io/vocabulary/1166510/一方/いっぽう">
                    <div class="result vocabulary">
                        <a href="/vocabulary/1166510/一方/いっぽう#a"><ruby>一<rt>いっ</rt>方<rt>ぽう</rt></ruby></a>
                        <div class="subsection-meanings"><div class="subsection"><div class="description">1. one; the other</div></div></div>
                        <div class="subsection-used-in">
                            <h6 class="subsection-label">Used in vocabulary (7 in total)</h6>
                            <div class="subsection">
                                <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1166560/一方的/いっぽうてき#a"><ruby>一方的<rt>いっぽうてき</rt></ruby></a></div><div class="en">one-sided</div></div>
                            </div>
                        </div>
                        <div class="subsection-examples">
                            <h6 class="subsection-label">Examples (14 in total)</h6>
                            <div class="subsection">
                                <div><a class="icon-link example-audio" href="#" data-audio="m1/126be5be3a94"></a><div class="used-in"><div class="jp">生活費は上がる<span class="highlight"><ruby>一<rt>いっ</rt>方<rt>ぽう</rt></ruby></span>だ。</div><div class="en">The cost of living is rising.</div></div></div>
                            </div>
                        </div>
                    </div>
                `, { status: 200 }));
            }
            return Promise.reject(new Error(`unexpected fetch: ${url}`));
        });
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/',
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const info = await new JpdbVocabularyClient().lookup(-1, '一方', 'いっぽう');
            const html = renderJpdbDefinitionSource({
                ...card,
                vid: -1,
                sid: -1,
                spelling: '一方',
                reading: 'いっぽう',
                meanings: [{ glosses: ['one; the other'], partOfSpeech: ['noun'] }],
                source: 'fallback',
            }, key => `data-source-state-key="${key}"`, info);

            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([searchUrl, detailUrl]);
            expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(usedInUrl);
            expect(info?.usedInVocabulary?.[0]).toMatchObject({ term: '一方的', reading: 'いっぽうてき', meaning: 'one-sided' });
            expect(info?.examples?.[0]).toMatchObject({
                sentence: '生活費は上がる一方だ。',
                translation: 'The cost of living is rising.',
                audioIds: ['m1/126be5be3a94'],
            });
            expect(html).toContain('Used in vocabulary');
            expect(html).toContain('Example sentences');
            expect(html).toContain('data-jpdb-audio="m1/126be5be3a94"');
        } finally {
            vi.unstubAllGlobals();
        }
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
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast: vi.fn(),
        });
        const compoundCard = { ...card, spelling: '国家主席', reading: 'こっかしゅせき' };

        const result = await controller.searchExamples(compoundCard, { relatedQueries: ['国家', '主席'] });

        expect(search).toHaveBeenNthCalledWith(1, '国家主席', expect.any(Object), expect.objectContaining({ requestLimit: 48, resultLimit: 6 }));
        expect(search).toHaveBeenNthCalledWith(2, '国家', expect.any(Object), expect.objectContaining({ requestLimit: 48, resultLimit: 6 }));
        expect(result.query).toBe('国家');
        expect(result.examples[0]?.sourceTitle).toBe('Show');
        expect(result.examples[0]?.sentence).toBe('国家のために働く。');
        expect(result.usedFallback).toBe(true);
    });

    it('uses exact Immersion Kit hits without waiting for parsed fallback queries', async () => {
        const search = vi.fn(async (query: string) => query === '国家主席'
            ? [{
                id: 'ik-exact',
                sentence: '国家主席と話をする。',
                sentenceWithFurigana: '',
                translation: 'Talk with the president.',
                sourceTitle: 'News',
                titleSlug: 'news',
                category: 'drama',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            }]
            : []);
        const parseJapanese = vi.fn(async () => {
            throw new Error('fallback parsing should not run for an exact hit');
        });
        const controller = new ImmersionPopoverController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: true }),
            client: { search } as unknown as ImmersionKitClient,
            audio: { play: vi.fn(async () => undefined) } as never,
            parseJapanese,
            canParseJapanese: () => true,
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast: vi.fn(),
        });

        const result = await controller.searchExamples({ ...card, spelling: '国家主席', reading: 'こっかしゅせき' });

        expect(result.query).toBe('国家主席');
        expect(result.usedFallback).toBe(false);
        expect(search).toHaveBeenCalledTimes(1);
        expect(parseJapanese).not.toHaveBeenCalled();
    });

    it('passes abort signals through Immersion Kit popup searches and caches completed results', async () => {
        const search = vi.fn(async (_query: string, _settings: typeof DEFAULT_SETTINGS, _options: { signal?: AbortSignal }) => [{
            id: 'ik-1',
            sentence: '食べる。',
            sentenceWithFurigana: '',
            translation: 'Eat.',
            sourceTitle: 'Show',
            titleSlug: 'show',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        }]);
        const controller = new ImmersionPopoverController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: true }),
            client: { search } as unknown as ImmersionKitClient,
            audio: { play: vi.fn(async () => undefined) } as never,
            parseJapanese: vi.fn(async () => []),
            canParseJapanese: () => false,
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            repositionPopover: vi.fn(),
            setImmersionTranslationBlurred: vi.fn(),
            toast: vi.fn(),
        });
        const first = new AbortController();
        const second = new AbortController();

        await controller.searchExamples(card, { signal: first.signal });
        await controller.searchExamples(card, { signal: second.signal });

        expect(search).toHaveBeenCalledTimes(1);
        expect(search.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ signal: first.signal }));
    });

    it('does not start lazy Immersion Kit popup searches until the source is opened', async () => {
        vi.useFakeTimers();
        try {
            const search = vi.fn(async () => [immersionExample('食べる。')]);
            const controller = immersionPopoverTestController(search);
            const { popover, container } = immersionLazyLoadSurface(false);

            controller.installLazyLoad(popover, card);
            await vi.advanceTimersByTimeAsync(500);

            expect(search).not.toHaveBeenCalled();

            container.open = true;
            container.dispatchEvent(new Event('toggle'));
            await vi.advanceTimersByTimeAsync(200);
            await Promise.resolve();
            await Promise.resolve();

            expect(search).toHaveBeenCalledTimes(1);
        } finally {
            document.body.replaceChildren();
            vi.useRealTimers();
        }
    });

    it('cancels scheduled lazy Immersion Kit popup searches when the source closes', async () => {
        vi.useFakeTimers();
        try {
            const search = vi.fn(async () => [immersionExample('食べる。')]);
            const controller = immersionPopoverTestController(search);
            const { popover, container } = immersionLazyLoadSurface(true);

            controller.installLazyLoad(popover, card);
            container.open = false;
            container.dispatchEvent(new Event('toggle'));
            await vi.advanceTimersByTimeAsync(500);

            expect(search).not.toHaveBeenCalled();

            container.open = true;
            container.dispatchEvent(new Event('toggle'));
            await vi.advanceTimersByTimeAsync(200);
            await Promise.resolve();
            await Promise.resolve();

            expect(search).toHaveBeenCalledTimes(1);
        } finally {
            document.body.replaceChildren();
            vi.useRealTimers();
        }
    });

    it('aborts in-flight lazy Immersion Kit popup searches when the source closes and can retry', async () => {
        vi.useFakeTimers();
        try {
            let firstSignal: AbortSignal | undefined;
            const search = vi.fn((_query: string, _settings: typeof DEFAULT_SETTINGS, options: { signal?: AbortSignal }) => {
                if (search.mock.calls.length === 1) {
                    firstSignal = options.signal;
                    return new Promise<ImmersionKitExample[]>((_resolve, reject) => {
                        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
                    });
                }
                return Promise.resolve([immersionExample('食べる。')]);
            });
            const controller = immersionPopoverTestController(search);
            const { popover, container } = immersionLazyLoadSurface(true);

            controller.installLazyLoad(popover, card);
            await vi.advanceTimersByTimeAsync(200);
            await Promise.resolve();

            expect(search).toHaveBeenCalledTimes(1);

            container.open = false;
            container.dispatchEvent(new Event('toggle'));
            expect(firstSignal?.aborted).toBe(true);

            container.open = true;
            container.dispatchEvent(new Event('toggle'));
            await vi.advanceTimersByTimeAsync(200);
            await Promise.resolve();
            await Promise.resolve();

            expect(search).toHaveBeenCalledTimes(2);
        } finally {
            document.body.replaceChildren();
            vi.useRealTimers();
        }
    });

    it('backs off Immersion Kit network searches after a 429 response', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Too Many Requests', {
            status: 429,
            statusText: 'Too Many Requests',
        }));
        try {
            const client = new ImmersionKitClient();
            const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, audioTimeoutMs: 1000 };

            await expect(client.search('読む', settings, { requestLimit: 1, resultLimit: 1 })).rejects.toThrow(/429|rate/i);
            await expect(client.search('書く', settings, { requestLimit: 1, resultLimit: 1 })).rejects.toThrow(/rate/i);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
        } finally {
            fetchSpy.mockRestore();
        }
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

    it('does not let slow shared deck lists block card details', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'api-key',
                localDictionariesEnabled: false,
                showPitchAccent: false,
                ankiEnabled: true,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: true,
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
                anki: {
                    findExistingCards: vi.fn(async (): Promise<AnkiLookupResult> => ({ state: 'not-in-deck', notes: [], primary: null })),
                    deckNames: vi.fn(() => never),
                } as unknown as AnkiConnectClient,
                jpdb: { listDecks: vi.fn(() => never) } as unknown as JpdbClient,
                isJpdbBackedCard: () => true,
            });
            const load = loader.load(card).all;

            await vi.advanceTimersByTimeAsync(1_500);

            await expect(load).resolves.toMatchObject({
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('caches shared deck lists across card detail loads', async () => {
        const listDecks = vi.fn(async () => [{ id: 'deck', name: 'Deck' }]);
        const deckNames = vi.fn(async () => ['Yomu']);
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'api-key',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            ankiEnabled: true,
            jpdbDefinitionsEnabled: false,
            jpdbMiningEnabled: true,
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
            anki: {
                findExistingCards: vi.fn(async (): Promise<AnkiLookupResult> => ({ state: 'not-in-deck', notes: [], primary: null })),
                deckNames,
            } as unknown as AnkiConnectClient,
            jpdb: { listDecks } as unknown as JpdbClient,
            isJpdbBackedCard: () => true,
        });

        const [first, second] = await Promise.all([
            loader.load(card).all,
            loader.load({ ...card, vid: 4, sid: 5, spelling: '飲む', reading: 'のむ' }).all,
        ]);

        expect(first.jpdbDecks).toEqual([{ id: 'deck', name: 'Deck' }]);
        expect(second.ankiDecks).toEqual(['Yomu']);
        expect(listDecks).toHaveBeenCalledTimes(1);
        expect(deckNames).toHaveBeenCalledTimes(1);
    });

    it('does not let slow public JPDB pitch block card details', async () => {
        vi.useFakeTimers();
        try {
            const publicPitch = vi.fn(() => new Promise<string[]>(resolve => {
                window.setTimeout(() => resolve(['HLL']), 5_500);
            }));
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                showPitchAccent: true,
                ankiEnabled: false,
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
                jpdbPublicPitch: { lookup: publicPitch } as unknown as JpdbPublicPitchClient,
                jpdbVocabulary: { lookup: vi.fn(async () => null) } as unknown as JpdbVocabularyClient,
                anki: {
                    findExistingCards: vi.fn(),
                    deckNames: vi.fn(),
                } as unknown as AnkiConnectClient,
                jpdb: { listDecks: vi.fn() } as unknown as JpdbClient,
                isJpdbBackedCard: () => false,
            });
            const lookupCard = { ...card, spelling: '読む', reading: 'よむ', pitchAccent: [] };
            const load = loader.load(lookupCard);

            await expect(load.all).resolves.toMatchObject({
                localEntries: [],
                jpdbVocabularyInfo: null,
            });
            await Promise.resolve();
            expect(lookupCard.pitchAccent).toEqual([]);
            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');

            await vi.advanceTimersByTimeAsync(5_500);

            await expect(load.pitchAccent).resolves.toEqual(['HLL']);
            expect(lookupCard.pitchAccent).toEqual(['HLL']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('exposes public pitch before slower card details finish', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const publicPitch = vi.fn(() => new Promise<string[]>(resolve => {
                window.setTimeout(() => resolve(['HLL']), 250);
            }));
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                showPitchAccent: true,
                ankiEnabled: false,
                jpdbDefinitionsEnabled: true,
                jpdbMiningEnabled: false,
            };
            const loader = new CardRenderDataLoader({
                getSettings: () => settings,
                dictionaries: {
                    lookup: vi.fn(async () => []),
                    lookupKanji: vi.fn(async () => []),
                    lookupTermMeta: vi.fn(async () => []),
                } as unknown as YomitanDictionaryStore,
                jpdbPublicPitch: { lookup: publicPitch } as unknown as JpdbPublicPitchClient,
                jpdbVocabulary: { lookup: vi.fn(() => never) } as unknown as JpdbVocabularyClient,
                anki: {
                    findExistingCards: vi.fn(),
                    deckNames: vi.fn(),
                } as unknown as AnkiConnectClient,
                jpdb: { listDecks: vi.fn() } as unknown as JpdbClient,
                isJpdbBackedCard: () => false,
            });
            const lookupCard = { ...card, spelling: '読む', reading: 'よむ', pitchAccent: [] };
            const load = loader.load(lookupCard);
            let allResolved = false;
            void load.all.then(() => { allResolved = true; });

            await vi.advanceTimersByTimeAsync(250);

            await expect(load.pitchAccent).resolves.toEqual(['HLL']);
            expect(lookupCard.pitchAccent).toEqual(['HLL']);
            expect(allResolved).toBe(false);
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
            enrichPitchWords: vi.fn(),
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

        await controller.loadExamples(popover, compoundCard, { relatedQueries: ['国家', '主席'] });

        expect(container.querySelector('.jpdb-reader-example-title')?.textContent).toBe('国家 · Show');
        expect(container.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/1');
        expect(container.querySelector('.jpdb-reader-example-inline-source')).toBeNull();
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

    it('tries configured real audio sources before text-to-speech and caches playable audio', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
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
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/random-source-audio.mp3'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.url === 'http://x.test/missing.mp3') {
                    details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
                    return;
                }
                details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
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
                    { type: 'custom', url: 'http://x.test/available.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/missing.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual([
                'http://x.test/missing.mp3',
                'http://x.test/available.mp3',
                'http://x.test/missing.mp3',
            ]);
            expect(played).toEqual(['blob:http://localhost/random-source-audio.mp3', 'blob:http://localhost/random-source-audio.mp3']);
            expect(spoken).toEqual([]);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            randomSpy.mockRestore();
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('starts the next audio source quickly when the first source is slow', async () => {
        vi.useFakeTimers();
        const played: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/fast-audio.mp3'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.url === 'http://x.test/slow-missing.mp3') {
                    window.setTimeout(() => {
                        details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
                    }, 6000);
                    return;
                }
                details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/slow-missing.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/fast.mp3', voice: '', enabled: true },
                ],
            }));

            const play = player.play(card);
            await vi.advanceTimersByTimeAsync(0);
            expect(requested).toEqual(['http://x.test/slow-missing.mp3']);

            await vi.advanceTimersByTimeAsync(119);
            expect(requested).toEqual(['http://x.test/slow-missing.mp3']);

            await vi.advanceTimersByTimeAsync(1);
            await expect(play).resolves.toBe(true);

            expect(requested).toContain('http://x.test/fast.mp3');
            expect(played).toEqual(['blob:http://localhost/fast-audio.mp3']);
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
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('uses text-to-speech only after configured real audio sources all miss', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
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
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
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
                    { type: 'custom', url: 'http://x.test/first-missing.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/second-missing.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual(['http://x.test/second-missing.mp3', 'http://x.test/first-missing.mp3']);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            randomSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('can let text-to-speech follow the configured source order', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
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
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioTtsMode: 'source-order',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/available.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(spoken).toEqual([card.spelling]);
            expect(requested).toEqual([]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('can let JPDB word audio follow real audio before browser text-to-speech', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: Array<{ url: string; responseType?: string; headers?: Record<string, string> }> = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
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
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/jpdb-word-audio'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        const jpdbCard = { ...card, vid: 2805500, spelling: '大切な人', reading: 'たいせつなひと' };
        const encodedOggHeader = new Uint8Array([0x4f, 0x67, 0x67, 0x53].map((byte, index) => byte ^ [0x06, 0x23, 0x54, 0x0f][index]));
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push({
                    url: details.url,
                    responseType: details.responseType,
                    headers: details.headers,
                });
                if (details.url === 'http://x.test/missing.mp3') {
                    details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
                    return;
                }
                if (details.responseType === 'text') {
                    details.onload?.({
                        status: 200,
                        response: `
                            <link rel="canonical" href="https://jpdb.io/vocabulary/2805500/大切な人/たいせつなひと">
                            <a href="/vocabulary/2805500/大切な人/たいせつなひと#a"><ruby>大切な人<rt>たいせつなひと</rt></ruby></a>
                            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/b3b1e4e100d9"></a>
                        `,
                        responseText: `
                            <link rel="canonical" href="https://jpdb.io/vocabulary/2805500/大切な人/たいせつなひと">
                            <a href="/vocabulary/2805500/大切な人/たいせつなひと#a"><ruby>大切な人<rt>たいせつなひと</rt></ruby></a>
                            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/b3b1e4e100d9"></a>
                        `,
                    });
                    return;
                }
                details.onload?.({
                    status: 200,
                    response: new Blob([encodedOggHeader], { type: 'application/octet-stream' }),
                });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioTtsMode: 'source-order',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/missing.mp3', voice: '', enabled: true },
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(jpdbCard)).resolves.toBe(true);

            expect(requested.map(request => request.url)).toEqual([
                'http://x.test/missing.mp3',
                'https://jpdb.io/vocabulary/2805500/%E5%A4%A7%E5%88%87%E3%81%AA%E4%BA%BA/%E3%81%9F%E3%81%84%E3%81%9B%E3%81%A4%E3%81%AA%E3%81%B2%E3%81%A8',
                'https://jpdb.io/static/v/m1/b3b1e4e100d9',
            ]);
            expect(requested[2]?.headers).toMatchObject({ 'X-Access': "please don't steal these files" });
            expect(played).toEqual(['blob:http://localhost/jpdb-word-audio']);
            expect(spoken).toEqual([]);
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

    it('uses browser text-to-speech before slow JPDB word audio in fallback mode', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
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
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/missing.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual(['http://x.test/missing.mp3']);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps slow JPDB word audio behind browser text-to-speech in fallback mode', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
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
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({
                    status: 200,
                    response: '<link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる"><main>No word audio</main>',
                    responseText: '<link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる"><main>No word audio</main>',
                });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual([]);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('streams custom JSON audio candidates directly and caches the source lookup', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        let sourceRequests = 0;
        let blobRequests = 0;
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
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                ],
            }));

            await player.play(card);
            await player.play(card);

            expect(sourceRequests).toBe(1);
            expect(blobRequests).toBe(0);
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

    it('falls back to a blob fetch when direct custom JSON playback fails', async () => {
        const played: string[] = [];
        let sourceRequests = 0;
        let blobRequests = 0;
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            played.push(this.src);
            return this.src === 'http://x.test/audio.mp3'
                ? Promise.reject(new DOMException('Unsupported direct media', 'NotSupportedError'))
                : Promise.resolve();
        });
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
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
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(sourceRequests).toBe(1);
            expect(blobRequests).toBe(1);
            expect(played).toEqual(['http://x.test/audio.mp3', 'blob:http://localhost/audio.mp3']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
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

    it('can warm audio candidates without downloading playable blobs', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
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
            value: vi.fn(() => 'blob:http://localhost/candidate-only-audio'),
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

            player.preload(card, { prepareAudio: false });
            await Promise.resolve();

            expect(blobRequests).toBe(0);

            await player.play(card);

            expect(blobRequests).toBe(1);
            expect(played).toEqual(['blob:http://localhost/candidate-only-audio']);
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

    it('falls back to userscript blob fetch for custom JSON audio on Apple mobile', async () => {
        const played: string[] = [];
        const restoreAppleMobile = mockAppleMobileBrowser();
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            played.push(this.src);
            return this.src === 'http://x.test/audio/taberu.mp3'
                ? Promise.reject(new DOMException('Unsupported direct media', 'NotSupportedError'))
                : Promise.resolve();
        });
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
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

            expect(played).toEqual(['http://x.test/audio/taberu.mp3', 'blob:http://localhost/audio-retry']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            playSpy.mockRestore();
            pauseSpy.mockRestore();
            loadSpy.mockRestore();
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
            expect(client.mediaUrl(examples[0], 'image')).toContain('https://us-southeast-1.linodeobjects.com/immersionkit/media/anime/Steins%20Gate/media/A_SteinsGateS01_E07_1_0.19.51.112.jpg');
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

    it('uses direct hosted Immersion Kit search before public proxy fallbacks', async () => {
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
            const examples = await client.search('読む', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 1 });

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
            await expect(client.search('メール', { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitLimit: 2 })).resolves.toHaveLength(5);
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

    it('starts Immersion Kit audio on next example even when initial autoplay is disabled', async () => {
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
                playExampleAudio(example: unknown, quiet?: boolean): Promise<void>;
                mediaUrls(example: unknown, kind: 'image' | 'sound'): string[];
            };
        };
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
        expect(playSpy).toHaveBeenCalledWith(example, true);

        playSpy.mockClear();
        container.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();
        expect(playSpy).toHaveBeenCalledWith(example);
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
                jpdbDefinitionsEnabled: false,
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

    it('returns from a kanji dictionary link back to the kanji page before the original word', async () => {
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
            const linkedWord = { ...card, vid: 11, sid: 21, spelling: '漢語', reading: 'かんご' };
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
                jpdbDefinitionsEnabled: false,
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
                card: linkedWord,
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
                '<a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="漢語" data-dictionary-reading="かんご" data-dictionary="JPDB">漢語</a>',
            );
            document.querySelector<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]')?.click();

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

        translation?.click();

        expect(internals.settings.immersionKitRevealTranslationOnClick).toBe(true);
        expect(translation?.dataset.immersionTranslationBlurred).toBe('true');
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
        const nextExample = {
            ...example,
            id: 'anime_test_000002',
            sentence: '文法も確かめました。',
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
            examples: [example, nextExample],
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
        expect(layout.left).toBe(0);
        expect(layout.width).toBe(720);
        expect(layout.height).toBe(360);
        expect(layout.top + layout.height).toBe(900);
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

    it('keeps cursor-following hover popovers out of the next-word path when there is room above', () => {
        withViewport(600, 420, () => {
            const popover = sizedPopover(220, 120);

            positionPopover(popover, undefined, undefined, {
                followPoint: { x: 300, y: 180 },
                preferBefore: true,
            });

            const top = Number.parseFloat(popover.style.top);
            expect(top + 120).toBeLessThanOrEqual(170);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('above');
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

    it('does not turn touch movement over a word into transient hover lookup', () => {
        const app = new ReaderApp();
        const canBeginPrimaryPressLookup = (app as unknown as {
            canBeginPrimaryPressLookup: (event: PointerEvent) => boolean;
        }).canBeginPrimaryPressLookup.bind(app);

        expect(canBeginPrimaryPressLookup(pointerEventLike('touch'))).toBe(false);
        expect(canBeginPrimaryPressLookup(pointerEventLike('mouse'))).toBe(true);
    });

    it('keeps pointer-text hover current only while the pointer remains on that text range', () => {
        document.body.innerHTML = '<p>青空</p><div>outside</div>';
        const paragraph = document.querySelector('p')!;
        const outside = document.querySelector('div')!;
        const node = paragraph.firstChild as Text;
        const app = new ReaderApp();
        const internals = app as unknown as {
            lastPointerPosition?: { x: number; y: number };
            isCurrentPointerTextHoverCandidate: (candidate: {
                text: string;
                offset: number;
                start: number;
                end: number;
                anchor: HTMLElement;
            }) => boolean;
        };
        const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
        let elementAtPoint: Element = paragraph;
        const candidate = { text: '青空', offset: 0, start: 0, end: 2, anchor: paragraph };

        try {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: () => elementAtPoint,
            });
            withPointerTextLookupMock(node, 0, [{ left: 20, top: 20, width: 40, height: 28 }], () => {
                internals.lastPointerPosition = { x: 28, y: 30 };
                expect(internals.isCurrentPointerTextHoverCandidate(candidate)).toBe(true);

                elementAtPoint = outside;
                internals.lastPointerPosition = { x: 220, y: 30 };
                expect(internals.isCurrentPointerTextHoverCandidate(candidate)).toBe(false);
            });
        } finally {
            if (elementFromPointDescriptor) Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
            else delete (document as Partial<Document>).elementFromPoint;
        }
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
        expect(normalizeOcrProvider('google-lens')).toBe('google-lens');
        expect(normalizeOcrProvider('cloud-vision')).toBe('cloud-vision');
        expect(normalizeOcrProvider('local-service')).toBe('local-service');
        expect(normalizeOcrProvider('off')).toBe('off');
        expect(normalizeOcrProvider('auto')).toBe('google-lens');
        expect(normalizeOcrProvider('page-text')).toBe('google-lens');
        expect(normalizeOcrProvider('custom-json')).toBe('local-service');
        expect(normalizeOcrProvider('old-provider')).toBe('google-lens');
        expect(normalizeOcrProvider('local-service', { ocrEndpointUrl: '' })).toBe('google-lens');
        expect(normalizeOcrProvider('local-service', { ocrEndpointUrl: '', ocrCloudVisionApiKey: '' })).toBe('local-service');
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

    it('announces the userscript bridge when a page shadows window.dispatchEvent', () => {
        const request = vi.fn();

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';

        try {
            withWindowProperty('dispatchEvent', undefined, () => {
                expect(() => installUserscriptHttpBridge()).not.toThrow();
            });

            expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBe('true');
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('routes userscript bridge requests through the document target when window dispatch is shadowed', async () => {
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({
                status: 200,
                response: 'raw-ok',
                responseText: 'raw-ok',
                finalUrl: options.url,
            });
        });

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;

        try {
            installUserscriptHttpBridge();
            vi.unstubAllGlobals();

            const bridgeRequest = getUserscriptHttpRequest();
            expect(bridgeRequest).toBeDefined();

            const response = await withWindowProperty('dispatchEvent', undefined, () => bridgeRequest?.({
                url: 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js',
                method: 'GET',
            }) as Promise<UserscriptHttpResponse> | undefined);

            expect(request).toHaveBeenCalledTimes(1);
            expect(response?.responseText).toBe('raw-ok');
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('does not expose the userscript bridge on arbitrary matched pages', () => {
        const request = vi.fn();

        vi.stubGlobal('location', { href: 'https://example.com/article' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;

        try {
            installUserscriptHttpBridge();
            expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBeUndefined();
            expect(getUserscriptHttpRequest()).toBeDefined();
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
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
            expect(progress).toContain('Downloading: alias.zip...');
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

            expect(request).toHaveBeenCalled();
            const mountedRequests = request.mock.calls
                .map(call => call[0])
                .filter(options => options.url === 'https://dict.test/mounted.zip');
            expect(mountedRequests).toHaveLength(request.mock.calls.length);
            expect(mountedRequests.length).toBeGreaterThanOrEqual(1);
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
            fetchMock.mockClear();
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
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit]> } }).mock.calls
                .map(([url]) => String(url))
                .filter(url => url.includes('dict.zip'));
            expect(urls).toEqual([
                `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent('https://github.com/example/dict.zip')}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent('https://github.com/example/dict.zip')}`,
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

    it('imports active-profile Yomitan settings beyond the minimal backup fields', () => {
        const imported = parseYomitanSettingsExport({
            options: {
                profileCurrent: 1,
                profiles: [
                    { options: { general: { popupTheme: 'light' }, dictionaries: [{ name: 'Ignored', enabled: true }] } },
                    {
                        options: {
                            general: {
                                language: 'ja',
                                popupTheme: 'dark',
                                popupWidth: 640,
                                popupHeight: 480,
                                popupVerticalOffset: 16,
                                showPitchAccentGraph: false,
                                showPitchAccentDownstepNotation: false,
                            },
                            audio: { fallbackSoundType: 'none' },
                            scanning: {
                                delay: 125,
                                hideDelay: 250,
                                inputs: [{ include: 'alt', options: {} }],
                            },
                            dictionaries: [
                                { name: 'Primary', alias: 'Main', enabled: true, allowSecondarySearches: true },
                                { name: 'Disabled', alias: 'Off', enabled: false },
                            ],
                            anki: {
                                enable: true,
                                server: 'http://127.0.0.1:8765',
                                tags: ['yomitan', 'imported'],
                                cardFormats: [{ type: 'term', deck: 'Mining', model: 'Japanese' }],
                                screenshot: { format: 'png', quality: 92 },
                            },
                            inputs: {
                                hotkeys: [
                                    { action: 'playAudio', key: 'KeyP', modifiers: ['alt'], enabled: true },
                                    { action: 'close', key: 'Escape', modifiers: [], enabled: true },
                                ],
                            },
                        },
                    },
                ],
            },
        });

        expect(imported.dictionaryNames).toEqual(['Primary']);
        expect(imported.settings).toMatchObject({
            interfaceLanguage: 'ja',
            theme: 'dark',
            popoverWidth: 640,
            popoverHeight: 480,
            subtitleBottomOffset: 16,
            showPitchAccent: false,
            hoverOpenDelayMs: 125,
            hoverCloseDelayMs: 250,
            audioFallbackChimeEnabled: false,
            popupActivationMode: 'modifier',
            scanModifierKey: 'alt',
            ankiEnabled: true,
            ankiDeck: 'Mining',
            ankiModel: 'Japanese',
            ankiTags: 'yomitan imported',
        });
        expect(imported.settings.shortcuts).toMatchObject({ hoverLookup: 'Alt', playAudio: 'Alt+P', closePopup: 'Escape' });
        expect(imported.settings.dictionaryPreferences).toEqual([
            expect.objectContaining({ name: 'Primary', alias: 'Main', enabled: true, priority: 0, allowSecondarySearches: true }),
            expect.objectContaining({ name: 'Disabled', alias: 'Off', enabled: false, priority: 1 }),
        ]);
    });

    it('keeps sentence translation targeting English when the UI is Japanese', async () => {
        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response(JSON.stringify({
            sentences: [{ trans: 'Sophie, move forward.' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        try {
            await expect(translateJapaneseSentence('ソフィー、前へ移れ。', 'ja')).resolves.toBe('Sophie, move forward.');

            const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
            const targetUrl = new URL(requestedUrl).searchParams.get('url') ?? requestedUrl;
            const translateUrl = new URL(targetUrl);
            expect(translateUrl.hostname).toBe('translate.googleapis.com');
            expect(translateUrl.searchParams.get('sl')).toBe('ja');
            expect(translateUrl.searchParams.get('tl')).toBe('en');
        } finally {
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
        }
    });

    it('normalizes Japanese quote punctuation before requesting sentence translation', async () => {
        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response(JSON.stringify({
            sentences: [{ trans: 'NPO Multilingual Extensive Reading proposes and supports "extensive reading".' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        try {
            await expect(translateJapaneseSentence('NPO多言語多読は「多読」を提案します。', 'en'))
                .resolves.toBe('NPO Multilingual Extensive Reading proposes and supports "extensive reading".');

            const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
            const targetUrl = new URL(requestedUrl).searchParams.get('url') ?? requestedUrl;
            const translateUrl = new URL(targetUrl);
            expect(translateUrl.searchParams.get('q')).toBe('NPO多言語多読は"多読"を提案します。');
        } finally {
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
        }
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

    it('hides known grammar rules while keeping a review toggle available', async () => {
        const hints = detectGrammarHints('毎日読んでいるので、もっと読みたい。');
        const html = await renderGrammarHints(hints, '毎日読んでいるので、もっと読みたい。', {
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

    it('uses Anki front-field settings when updating the Yomu model', async () => {
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                requests.push(request);
                const result = request.action === 'modelNames'
                    ? ['よむ Japanese']
                    : request.action === 'modelFieldNames'
                        ? YOMU_MODEL_FIELDS
                        : null;
                return Promise.resolve({ status: 200, response: { result, error: null } });
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: false,
                ankiFrontReading: false,
                ankiFrontSentence: false,
                ankiFrontImage: false,
            }));

            await client.ensureDeckAndModel();

            const templateRequest = requests.find(request => request.action === 'updateModelTemplates');
            const templates = (templateRequest?.params.model as { templates: Record<string, { Front: string; Back: string }> }).templates;
            expect(templates.Recognition.Front).not.toContain('{{Reading}}');
            expect(templates.Recognition.Front).not.toContain('{{Sentence}}');
            expect(templates.Recognition.Front).not.toContain('{{Image}}');
            expect(templates.Recognition.Back).toContain('{{#Audio}}');
            expect(templates.Recognition.Back).not.toContain('{{#Status}}');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('attaches Immersion Kit audio data to Anki notes and refreshes the lookup cache', async () => {
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                requests.push(request);
                const resultByAction: Record<string, unknown> = {
                    createDeck: null,
                    modelNames: ['よむ Japanese'],
                    modelFieldNames: YOMU_MODEL_FIELDS,
                    updateModelTemplates: null,
                    updateModelStyling: null,
                    addNote: 42,
                    notesInfo: [{
                        noteId: 42,
                        modelName: 'よむ Japanese',
                        tags: [],
                        fields: {
                            Expression: { value: '読む' },
                            Reading: { value: 'よむ' },
                        },
                        cards: [99],
                    }],
                    cardsInfo: [{
                        cardId: 99,
                        note: 42,
                        deckName: 'よむ',
                        queue: 0,
                        type: 0,
                        reps: 0,
                        lapses: 0,
                        question: '<div>読む</div>',
                        answer: '<div>to read</div>',
                    }],
                };
                return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。', { audioDataUrl: 'data:audio/mpeg;base64,audio-data' });

            const addNote = requests.find(request => request.action === 'addNote')?.params.note as { audio?: Array<Record<string, unknown>> };
            expect(YOMU_MODEL_FIELDS).toContain('Audio');
            expect(addNote.audio?.[0]).toMatchObject({
                data: 'audio-data',
                fields: ['Audio'],
            });
            expect(String(addNote.audio?.[0].filename)).toMatch(/\.mp3$/);

            requests.length = 0;
            await expect(client.findExistingCards({ ...card, spelling: '読む', reading: 'よむ' })).resolves.toMatchObject({
                primary: {
                    noteId: 42,
                    primaryCardId: 99,
                    renderedCards: [{ cardId: 99, question: '<div>読む</div>', answer: '<div>to read</div>' }],
                },
            });
            expect(requests.map(request => request.action)).not.toContain('findNotes');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('can attach both word audio and Immersion Kit context audio to Anki notes', async () => {
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                requests.push(request);
                const resultByAction: Record<string, unknown> = {
                    createDeck: null,
                    modelNames: ['よむ Japanese'],
                    modelFieldNames: YOMU_MODEL_FIELDS,
                    updateModelTemplates: null,
                    updateModelStyling: null,
                    addNote: 43,
                    notesInfo: [{
                        noteId: 43,
                        modelName: 'よむ Japanese',
                        tags: [],
                        fields: {
                            Expression: { value: '読む' },
                            Reading: { value: 'よむ' },
                        },
                        cards: [100],
                    }],
                    cardsInfo: [{ cardId: 100, note: 43, deckName: 'よむ', queue: 0, type: 0, reps: 0, lapses: 0 }],
                };
                return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                audioDataUrl: 'data:audio/ogg;base64,context-audio',
            });

            const addNote = requests.find(request => request.action === 'addNote')?.params.note as { audio?: Array<Record<string, unknown>> };
            expect(addNote.audio).toHaveLength(2);
            expect(addNote.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['Audio'] });
            expect(addNote.audio?.[1]).toMatchObject({ data: 'context-audio', fields: ['Audio'] });
            expect(String(addNote.audio?.[0].filename)).toContain('_word_');
            expect(String(addNote.audio?.[1].filename)).toContain('_context_');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('merges Yomu fields and audio into an existing unfamiliar Anki note without changing its model', async () => {
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                requests.push(request);
                const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 168,
                        modelName: 'Imported Vocab',
                        tags: [],
                        fields: {
                            Word: { value: '読む' },
                            Readings: { value: '' },
                            Translation_1: { value: '' },
                            Source: { value: '' },
                            audio: { value: '[sound:old.mp3]' },
                        },
                        cards: [167],
                    }],
                    updateNoteFields: null,
                };
                return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const result = await client.mergeYomuData(168, {
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                audioMergeMode: 'both',
                sourceTitle: 'Example article',
                sourceUrl: 'https://example.test/article',
            });

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                id: number;
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
            };
            expect(result.modelName).toBe('Imported Vocab');
            expect(update.id).toBe(168);
            expect(update.fields.Word).toBeUndefined();
            expect(update.fields.Readings).toBe('よむ');
            expect(update.fields.Translation_1).toContain('to read');
            expect(update.fields.Source).toContain('Example article');
            expect(update.audio?.[0]).toMatchObject({
                data: 'word-audio',
                fields: ['audio'],
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('lets existing Anki audio win when merging an unfamiliar note', async () => {
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                requests.push(request);
                const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 168,
                        modelName: 'Imported Vocab',
                        tags: [],
                        fields: {
                            Word: { value: '読む' },
                            audio: { value: '[sound:old.mp3]' },
                        },
                        cards: [167],
                    }],
                    updateNoteFields: null,
                };
                return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.mergeYomuData(168, {
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                audioMergeMode: 'theirs',
            });

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
            } | undefined;
            expect(update).toBeUndefined();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps existing-note merge desktop-only because mobile handoff cannot update notes', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true }));
            await expect(client.mergeYomuData(168, card, '食べる。')).rejects.toThrow('needs AnkiConnect on desktop');
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
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

        expect(html).toContain('Keyword');
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

    it('renders RTK aliases learned from the search index', () => {
        const html = renderRtkInfo({
            kanji: '収',
            keyword: 'income',
            frameNumber: 'Frame number V4: 1510',
            onYomi: 'シュウ',
            kunYomi: 'おさ.める',
            elements: 'income, cornucopia, crotch',
            componentKanji: [],
            elementGlyphs: {
                crotch: { glyph: '又', kanji: '又' },
            },
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [], 'en');

        expect(html).toContain('<strong>丩</strong><span>cornucopia</span>');
        expect(html).toContain('data-kanji="又"');
        expect(html).toContain('<strong>又</strong><span>crotch</span>');
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

    it('indexes RTK element aliases at the kanji where they are introduced', () => {
        const index = parseRtkSearchIndex(`
            var docs = [
                { "kanji" : "一", "keyword" : "one", "elements" : "one" },
                { "kanji" : "十", "keyword" : "ten", "elements" : "ten, needle" },
                { "kanji" : "古", "keyword" : "old", "elements" : "old, tombstone, gravestone, church, ten, needle, mouth" },
                { "kanji" : "白", "keyword" : "white", "elements" : "white, drop, sun, day" },
                { "kanji" : "百", "keyword" : "hundred", "elements" : "hundred, one, ceiling, white, dove" },
                { "kanji" : "又", "keyword" : "or again", "elements" : "or again, crotch" },
                { "kanji" : "収", "keyword" : "income", "elements" : "income, cornucopia, crotch" },
                { "kanji" : "仮", "keyword" : "provisional", "elements" : "sham, provisional, person" },
                { "kanji" : "碑", "keyword" : "tombstone", "elements" : "tombstone, stone, old" }
            ];
        `);

        expect(index.get('needle')).toBe('十');
        expect(index.get('gravestone')).toBe('古');
        expect(index.get('church')).toBe('古');
        expect(index.get('ceiling')).toBe('一');
        expect(index.get('dove')).toBe('白');
        expect(index.get('crotch')).toBe('又');
        expect(index.get('sham')).toBe('仮');
        expect(index.get('tombstone')).toBe('碑');
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

        const controls = renderJpdbKanjiMiningControls(info, 'en');
        expect(controls).toContain('jpdb-reader-mining-details jpdb-reader-kanji-mining');
        expect(controls).toContain('jpdb-reader-mining-action-row jpdb-reader-kanji-mining-row');
        expect(controls).toContain('data-action="jpdb-kanji-action"');
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

    it('parses Uchisen kanji prime and compound component groups', () => {
        const groups = parseUchisenComponents(`
            <div class="kanji_info_container">
                <div class="components">
                    <div class="KP_primes">
                        <div class="prime_label prime_color"><span class="eng_transl">Kanji Primes</span></div>
                        <div class="name_combo"><a href="/primes/dwarf">dwarf: &nbsp;<span class="component_symbol">⺍</span></a></div>
                        <div class="name_combo"><a href="/primes/crown">crown: &nbsp;<span class="component_symbol">冖</span></a></div>
                    </div>
                    <div class="KP_primes">
                        <div class="compound_label kanji_color"><span class="eng_transl">Compound Kanji</span></div>
                        <div class="name_combo flex_end black_font"><a href="/kanji/子">Child: &nbsp;<span class="component_symbol">子</span></a></div>
                    </div>
                </div>
            </div>
            <div class="mnemonic_studio_right">
                <div class="components">
                    <div class="KP_primes">
                        <div class="name_combo"><a href="/primes/ignored">ignored: <span class="component_symbol">火</span></a></div>
                    </div>
                </div>
            </div>
        `);

        expect(groups).toEqual([
            {
                title: 'Kanji Primes',
                components: [
                    { name: 'dwarf', symbol: '⺍', url: 'https://uchisen.com/primes/dwarf' },
                    { name: 'crown', symbol: '冖', url: 'https://uchisen.com/primes/crown' },
                ],
            },
            {
                title: 'Compound Kanji',
                components: [
                    { name: 'Child', symbol: '子', url: 'https://uchisen.com/kanji/%E5%AD%90' },
                ],
            },
        ]);
    });

    it('parses the Uchisen kanji keyword separately from prime keywords', () => {
        expect(parseUchisenKanjiKeyword(`
            <div class="kanji_info_container">
                <div class="kanji_info" id="kanji_keyword_container">
                    <span>後 - After</span>
                </div>
                <div class="components">
                    <div class="KP_primes">
                        <div class="prime_label prime_color"><span class="eng_transl">Kanji Primes</span></div>
                        <div class="name_combo"><a href="/primes/water+slide">water slide: &nbsp;<span class="component_symbol">彳</span></a></div>
                    </div>
                </div>
            </div>
        `)).toEqual({
            kanji: '後',
            keyword: 'After',
            url: 'https://uchisen.com/kanji/%E5%BE%8C',
        });
    });

    it('detects Uchisen generation fields from kanji pages', () => {
        const authenticated = parseUchisenData(`
            <input id="user_id" value="42">
            <input id="kanji_id" value="1177">
            <div class="kanji_info" id="kanji_keyword_container"><span>甘 - Sweet</span></div>
        `);
        const loggedOut = parseUchisenData(`
            <div id="lo_links"><a href="/login">Login</a></div>
            <input id="kanji_id" value="1177">
        `);

        expect(authenticated.kanjiId).toBe('1177');
        expect(authenticated.canGenerateImages).toBe(true);
        expect(loggedOut.canGenerateImages).toBe(true);
    });

    it('renders the Uchisen kanji keyword before prime chips', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }))));
        const mount = document.createElement('div');
        let cleanup: (() => void) | null = null;

        try {
            document.body.append(mount);
            cleanup = await installUchisenCarousel(mount, '後', [
                { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_after.jpg', story: 'After story' },
            ], {
                kanjiKeyword: { kanji: '後', keyword: 'After', url: 'https://uchisen.com/kanji/%E5%BE%8C' },
                componentGroups: [{
                    title: 'Kanji Primes',
                    components: [
                        { name: 'water slide', symbol: '彳', url: 'https://uchisen.com/primes/water+slide' },
                    ],
                }],
            });

            const groups = Array.from(mount.querySelectorAll<HTMLElement>('.yomu-jpdb-component-group'));
            expect(groups.map(group => group.querySelector('.yomu-jpdb-component-group-label')?.textContent)).toEqual([
                'Kanji Keyword',
                'Kanji Primes',
            ]);
            expect(groups[0]?.textContent).toContain('後');
            expect(groups[0]?.textContent).toContain('After');
            expect(groups[1]?.textContent).toContain('water slide');
        } finally {
            cleanup?.();
            mount.remove();
            vi.unstubAllGlobals();
        }
    });

    it('renders authenticated Uchisen generation beside the external link', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }))));
        const mount = document.createElement('div');
        let cleanup: (() => void) | null = null;

        try {
            document.body.append(mount);
            cleanup = await installUchisenCarousel(mount, '甘', [
                { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_sweet.jpg', story: 'Sweet story' },
            ], {
                kanjiId: '1177',
                canGenerateImages: true,
            });

            const linkRow = mount.querySelector<HTMLElement>('.yomu-jpdb-uchisen-link-row');
            const externalLink = linkRow?.querySelector<HTMLAnchorElement>('a.yomu-jpdb-uchisen-summary-link');
            const generateLink = linkRow?.querySelector<HTMLButtonElement>('button.yomu-jpdb-uchisen-generate-link');

            expect(externalLink?.textContent).toContain('View on Uchisen');
            expect(generateLink?.textContent).toBe('Generate image +');
            expect(Array.from(linkRow?.children ?? [])).toEqual([externalLink, generateLink]);
            expect(generateLink?.classList.contains('yomu-jpdb-uchisen-summary-link')).toBe(true);
        } finally {
            cleanup?.();
            mount.remove();
            vi.unstubAllGlobals();
        }
    });

    it('renders the Uchisen controls and external link outside the summary', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }))));
        const mount = document.createElement('div');
        let cleanup: (() => void) | null = null;

        try {
            document.body.append(mount);
            cleanup = await installUchisenCarousel(mount, '着', [
                { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_wear.jpg', story: 'Wear story' },
            ]);

            const summary = mount.querySelector<HTMLElement>('summary.jpdb-reader-local-head');
            const body = mount.querySelector<HTMLElement>('.yomu-jpdb-uchisen-body');
            const controls = Array.from(body?.querySelectorAll<HTMLElement>('[data-uchisen-action]') ?? []);
            const link = body?.querySelector<HTMLAnchorElement>('.yomu-jpdb-uchisen-summary-link');

            expect(summary?.querySelector('.yomu-jpdb-counter')?.textContent).toBe('1/1');
            expect(summary?.querySelector('[data-uchisen-action]')).toBeNull();
            expect(summary?.querySelector('a[href*="uchisen.com/kanji"]')).toBeNull();
            expect(controls.map(control => control.dataset.uchisenAction)).toEqual(['previous', 'next']);
            expect(link?.textContent).toContain('View on Uchisen');
            expect(link?.querySelector('svg')).not.toBeNull();
        } finally {
            cleanup?.();
            mount.remove();
            vi.unstubAllGlobals();
        }
    });

    it('restores the last selected Uchisen index without a star control', async () => {
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

            expect(mount.querySelector('[data-uchisen-action="star"]')).toBeNull();
            expect(mount.querySelector('.yomu-jpdb-counter')?.textContent).toBe('2/2');
            expect(mount.querySelector('.yomu-jpdb-story')?.textContent).toContain('Please subscribe');
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

    it('renders the new-tab doodle result hook in popover kanji practice cards', () => {
        const root = document.createElement('div');
        root.innerHTML = renderKanjiPractice({
            kanji: '嵐',
            strokeCount: 12,
            svg: '<svg class="jpdb-reader-kanjivg-svg"></svg>',
        }, '嵐', 'en');

        const result = root.querySelector<HTMLElement>('.jpdb-reader-kanjivg [data-newtab-doodle-result]');
        expect(result).not.toBeNull();
        expect(result?.classList.contains('jpdb-reader-newtab-doodle-result')).toBe(true);
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

    it('uses KanjiVG component geometry for the initial origin graph layout', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 100 100">
                <g kvg:element="線">
                    <g kvg:element="糸" kvg:position="left">
                        <path d="M8,15 L32,15 L32,92 L8,92 Z" />
                    </g>
                    <g kvg:element="泉" kvg:position="right">
                        <g kvg:element="白" kvg:position="top">
                            <path d="M58,8 L93,8 L93,38 L58,38 Z" />
                        </g>
                        <g kvg:element="水" kvg:position="bottom">
                            <path d="M55,55 L96,55 L96,98 L55,98 Z" />
                        </g>
                    </g>
                </g>
            </svg>
        `, '線');
        const graph = buildKanjiOriginGraph('線', null, null, [], null, info);
        const byId = new Map(graph.nodes.map(node => [node.id, node]));

        expect(info?.componentPositions?.find(component => component.component === '糸')?.center).toEqual({ x: 0.2, y: 0.535 });
        expect(byId.get('糸')?.geometry?.x).toBeLessThan(byId.get('泉')?.geometry?.x ?? 0);
        expect(byId.get('白')?.geometry?.y).toBeLessThan(byId.get('水')?.geometry?.y ?? 0);

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const position = (id: string) => {
            const match = new RegExp(`data-graph-node="${id}"[^>]+data-x="([^"]+)"[^>]+data-y="([^"]+)"`, 'u').exec(html);
            expect(match).not.toBeNull();
            return { x: Number(match?.[1]), y: Number(match?.[2]) };
        };
        const thread = position('糸');
        const spring = position('泉');
        const white = position('白');
        const water = position('水');

        expect(thread.x).toBeLessThan(spring.x);
        expect(white.x).toBeGreaterThan(thread.x);
        expect(water.x).toBeGreaterThan(thread.x);
        expect(white.y).toBeLessThan(water.y);
    });

    it('projects close KanjiVG geometry anchors away from the current node', () => {
        const graph = {
            nodes: [
                { id: '波', label: '波', kind: 'current' as const, detail: 'a wave', source: 'current lookup' },
                { id: '皮', label: '皮', kind: 'component' as const, detail: 'skin', source: 'JPDB', position: 'right', geometry: { x: 0.5303, y: 0.2761 } },
                { id: '氵', label: '氵', kind: 'component' as const, detail: 'water drops', source: 'JPDB', position: 'left', geometry: { x: 0.087, y: 0.517 } },
                { id: '婆', label: '婆', kind: 'component' as const, detail: 'old woman', source: 'JPDB' },
                { id: '菠', label: '菠', kind: 'component' as const, detail: 'spinach', source: 'JPDB' },
            ],
            edges: [
                { from: '皮', to: '波', label: 'JPDB component' },
                { from: '氵', to: '波', label: 'JPDB component' },
                { from: '波', to: '婆', label: 'used in kanji' },
                { from: '波', to: '菠', label: 'used in kanji' },
            ],
        };
        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const position = (id: string) => {
            const match = new RegExp(`data-graph-node="${id}"[^>]+data-x="([^"]+)" data-y="([^"]+)" data-rx="([^"]+)" data-ry="([^"]+)"`, 'u').exec(html);
            expect(match).not.toBeNull();
            return {
                x: Number(match?.[1]),
                y: Number(match?.[2]),
                rx: Number(match?.[3]),
                ry: Number(match?.[4]),
            };
        };
        const wave = position('波');
        const skin = position('皮');

        const separated = Math.abs(skin.x - wave.x) > skin.rx + wave.rx
            || Math.abs(skin.y - wave.y) > skin.ry + wave.ry;
        expect(separated).toBe(true);
    });

    it('carries KanjiVG radical variant positions onto JPDB component nodes', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="険">
                    <g kvg:element="⻖" kvg:original="阜" kvg:position="left">
                        <path d="M13,20 L32,17 L16,96" />
                    </g>
                    <g kvg:element="㑒" kvg:position="right">
                        <path d="M62,11 L41,45 M62,16 L93,42" />
                    </g>
                </g>
            </svg>
        `, '険');
        const graph = buildKanjiOriginGraph('険', {
            kanji: '険',
            keyword: 'risky and steep',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '阝', keyword: 'mound' }, { kanji: '㑒', keyword: 'all together' }],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, [], null, info);

        expect(graph.nodes.find(node => node.id === '阝')?.position).toBe('left');

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('data-graph-node="阝"');
        expect(html).toContain('data-from="阝" data-to="険" data-label="JPDB component" data-target-zone="left"');
    });

    it('keeps nested KanjiVG components inside edge-side parents instead of stacking on the edge', () => {
        const graph = buildKanjiOriginGraph('憾', null, null, [], null, {
            kanji: '憾',
            svg: '<svg></svg>',
            strokeCount: 16,
            componentPositions: [
                { component: '忄', original: '心', position: 'left', direct: true, depth: 1 },
                { component: '感', position: 'right', direct: true, depth: 1 },
                { component: '咸', parent: '感', position: 'top', direct: false, depth: 2 },
                { component: '心', parent: '感', position: 'bottom', direct: false, depth: 2 },
                { component: '口', parent: '咸', position: 'left', direct: false, depth: 3 },
                { component: '戍', parent: '咸', position: 'center', direct: false, depth: 3 },
            ],
        });
        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const position = (id: string) => {
            const match = new RegExp(`data-graph-node="${id}"[^>]+style="left:([\\d.]+)%;top:([\\d.]+)%`, 'u').exec(html);
            expect(match).not.toBeNull();
            return { x: Number(match?.[1]), y: Number(match?.[2]) };
        };

        const leftRadical = position('忄');
        const rightParent = position('感');
        const innerChild = position('口');
        const sibling = position('戍');

        expect(leftRadical.x).toBeGreaterThan(16);
        expect(leftRadical.x).toBeLessThan(36);
        expect(rightParent.x).toBeGreaterThan(60);
        expect(innerChild.x).toBeLessThan(rightParent.x);
        expect(Math.abs(innerChild.y - sibling.y)).toBeGreaterThan(12);
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

    it('keeps direct components out of the KanjiVG subcomponent layer', () => {
        const graph = buildKanjiOriginGraph('即', {
            kanji: '即',
            keyword: 'instant',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '厶', keyword: 'private' }, { kanji: '日', keyword: 'sun' }],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, [], null, {
            kanji: '即',
            svg: '<svg></svg>',
            strokeCount: 7,
            componentPositions: [
                { component: '卩', position: 'right', direct: true, depth: 1 },
                { component: '厶', parent: '卩', position: 'center', direct: false, depth: 2 },
            ],
        });

        expect(graph.edges).toEqual(expect.arrayContaining([
            { from: '厶', to: '即', label: 'JPDB component' },
        ]));
        expect(graph.edges).not.toEqual(expect.arrayContaining([
            { from: '厶', to: '卩', label: 'subcomponent' },
        ]));
    });

    it('does not treat nested KanjiVG variant wrappers as subcomponents', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="即">
                    <g kvg:element="艮" kvg:position="left">
                        <path d="M16,17 L45,18" />
                    </g>
                    <g kvg:element="卩" kvg:position="right">
                        <g kvg:element="厶" kvg:variant="true" kvg:original="厶">
                            <path d="M61,23 L87,21" />
                        </g>
                    </g>
                </g>
            </svg>
        `, '即');
        const graph = buildKanjiOriginGraph('即', null, null, [], null, info);

        expect(info?.componentPositions).toEqual(expect.arrayContaining([
            expect.objectContaining({ component: '厶', parent: '卩', direct: false, variant: true }),
        ]));
        expect(graph.edges).not.toEqual(expect.arrayContaining([
            { from: '厶', to: '卩', label: 'subcomponent' },
        ]));

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).not.toContain('data-origin-subcomponent-toggle');
        expect(html).not.toContain('data-origin-subcomponent="true"');
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

    it('spaces crowded outbound kanji graph nodes apart', () => {
        const graph = {
            nodes: [
                { id: '川', label: '川', kind: 'current' as const, detail: 'river', source: 'test' },
                { id: '訓', label: '訓', kind: 'component' as const, detail: 'instruction', source: 'test' },
                { id: '州', label: '州', kind: 'component' as const, detail: 'state', source: 'test' },
                { id: '順', label: '順', kind: 'component' as const, detail: 'order', source: 'test' },
                { id: '馴', label: '馴', kind: 'component' as const, detail: 'tame', source: 'test' },
            ],
            edges: [
                { from: '川', to: '訓', label: 'used in kanji' },
                { from: '川', to: '州', label: 'used in kanji' },
                { from: '川', to: '順', label: 'used in kanji' },
                { from: '川', to: '馴', label: 'used in kanji' },
            ],
        };
        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const positionByNode = new Map(
            Array.from(html.matchAll(/data-graph-node="([^"]+)".*?data-x="([^"]+)".*?data-y="([^"]+)"/gs))
                .map(match => [match[1], { x: Number(match[2]), y: Number(match[3]) }]),
        );
        const distance = (a: string, b: string): number => {
            const first = positionByNode.get(a);
            const second = positionByNode.get(b);
            return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
        };

        expect(positionByNode.get('訓')?.y).toBeLessThan(positionByNode.get('州')?.y ?? 0);
        expect(positionByNode.get('州')?.y).toBeLessThan(positionByNode.get('順')?.y ?? 0);
        expect(positionByNode.get('順')?.y).toBeLessThan(positionByNode.get('馴')?.y ?? 0);
        expect(distance('訓', '州')).toBeGreaterThan(21);
        expect(distance('州', '順')).toBeGreaterThan(21);
        expect(distance('順', '馴')).toBeGreaterThan(21);
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

    it('finds active subtitle cues without sorting the whole cue list on every tick', () => {
        const cues = Array.from({ length: 5000 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `字幕${index}`,
        }));
        cues.splice(1200, 0,
            { start: 1200.1, end: 1204, text: '長い字幕' },
            { start: 1203.5, end: 1204.4, text: '新しい字幕' },
        );
        cues.sort((a, b) => a.start - b.start || a.end - b.end);

        expect(findActiveSubtitleCue(cues, 1203.6)?.text).toBe('新しい字幕');
        expect(findActiveSubtitleCue(cues, 1203.9)?.text).toBe('新しい字幕');
        expect(findActiveSubtitleCue(cues, 1204.3)?.text).toBe('字幕1204');
        expect(findActiveSubtitleCue(cues, 5001)).toBeUndefined();
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
        const requestErrors: Array<{ format: string | null; message: string }> = [];
        const cues = await loadYouTubeTrackCues({
            kind: 'youtube',
            label: 'Japanese (ja)',
            language: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
        }, {
            requestText: async url => {
                const format = new URL(url).searchParams.get('fmt');
                requestedFormats.push(format);
                if (format === 'srv3') return '';
                if (format !== 'json3') throw new Error('try the next format');
                return '<timedtext><body><p t="1000" d="3000"><s t="0">今日</s><s t="1200">読む</s></p></body></timedtext>';
            },
            onRequestError: (_track, url, error) => requestErrors.push({
                format: new URL(url).searchParams.get('fmt'),
                message: error instanceof Error ? error.message : String(error),
            }),
        });

        expect(requestedFormats).toEqual(['srv3', 'json3']);
        expect(requestErrors).toEqual([{ format: 'srv3', message: 'YouTube timedtext response was empty.' }]);
        expect(cues).toMatchObject([{ start: 1, end: 4, text: '今日読む' }]);
    });

    it('reuses loaded remote and YouTube subtitle cues without refetching', async () => {
        const remoteTrack = {
            id: 'remote-ja',
            kind: 'remote' as const,
            label: 'Remote Japanese',
            url: 'https://example.test/captions.xml',
        };
        const youtubeTrack = {
            id: 'youtube-ja',
            kind: 'youtube' as const,
            label: 'Japanese',
            language: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
        };
        const remoteRequest = vi.fn(async () => '<transcript><text start="1" dur="2">日本語</text></transcript>');
        const youtubeRequest = vi.fn(async () => '<transcript><text start="4" dur="1.5">字幕</text></transcript>');

        const firstRemote = await loadSubtitleTrackCues(remoteTrack, {
            tracks: [remoteTrack],
            transcriptEligible: true,
            requestText: remoteRequest,
        });
        const secondRemote = await loadSubtitleTrackCues(remoteTrack, {
            tracks: [remoteTrack],
            transcriptEligible: true,
            requestText: remoteRequest,
        });
        const firstYoutube = await loadSubtitleTrackCues(youtubeTrack, {
            tracks: [youtubeTrack],
            transcriptEligible: true,
            requestText: youtubeRequest,
        });
        const secondYoutube = await loadSubtitleTrackCues(youtubeTrack, {
            tracks: [youtubeTrack],
            transcriptEligible: true,
            requestText: youtubeRequest,
        });

        expect(remoteRequest).toHaveBeenCalledTimes(1);
        expect(youtubeRequest).toHaveBeenCalledTimes(1);
        expect(firstRemote.cues).toBe(secondRemote.cues);
        expect(firstYoutube.cues).toBe(secondYoutube.cues);
        expect(secondRemote.cues).toMatchObject([{ start: 1, end: 3, text: '日本語' }]);
        expect(secondYoutube.cues).toMatchObject([{ start: 4, end: 5.5, text: '字幕' }]);
    });

    it('falls back to Android InnerTube tracks when YouTube web timedtext is empty', async () => {
        const originalLocation = window.location;
        const originalFetch = globalThis.fetch;
        const originalYtcfg = (window as Window & { ytcfg?: unknown }).ytcfg;
        const requestedUrls: string[] = [];
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        (window as Window & { ytcfg?: { get: (key: string) => string } }).ytcfg = {
            get: key => ({
                INNERTUBE_API_KEY: 'test-key',
                INNERTUBE_CLIENT_NAME: 'WEB',
                HL: 'en',
            })[key] ?? '',
        };
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: vi.fn(async () => new Response(JSON.stringify({
                videoDetails: { videoId: 'abc123' },
                captions: {
                    playerCaptionsTracklistRenderer: {
                        captionTracks: [{
                            baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&android=1',
                            languageCode: 'ja',
                            name: { simpleText: '日本語' },
                        }],
                    },
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
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
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
            (window as Window & { ytcfg?: unknown }).ytcfg = originalYtcfg;
        }
    });

    it('matches Android YouTube fallback tracks by stream identity when labels differ', async () => {
        const originalLocation = window.location;
        const originalFetch = globalThis.fetch;
        const originalYtcfg = (window as Window & { ytcfg?: unknown }).ytcfg;
        const requestedUrls: string[] = [];
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        (window as Window & { ytcfg?: { get: (key: string) => string } }).ytcfg = {
            get: key => ({
                INNERTUBE_API_KEY: 'test-key',
                INNERTUBE_CLIENT_NAME: 'WEB',
                HL: 'ja',
            })[key] ?? '',
        };
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: vi.fn(async () => new Response(JSON.stringify({
                videoDetails: { videoId: 'abc123' },
                captions: {
                    playerCaptionsTracklistRenderer: {
                        captionTracks: [{
                            baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&android=1&lang=ja',
                            languageCode: 'ja',
                            vssId: '.ja',
                            name: { simpleText: 'Japanese' },
                        }],
                    },
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
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
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
            (window as Window & { ytcfg?: unknown }).ytcfg = originalYtcfg;
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
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const active = applySubtitleNativeTrackModes({
                tracks: [{ id: 'youtube-0', label: 'Japanese', kind: 'youtube' }],
                selectedTrackId: 'youtube-0',
                secondaryTrackId: '',
                overlayVisible: true,
                hasPrimaryCues: false,
                currentCueText: '',
                youtubeDomCaptionFallbackTrackId: '',
                lastYomuCaptionsActive: false,
            });

            expect(active).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(true);
        } finally {
            document.documentElement.classList.remove('jpdb-subtitle-yomu-captions-active');
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('hides native YouTube captions after Yomu has loaded subtitle cues', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const active = applySubtitleNativeTrackModes({
                tracks: [{ id: 'youtube-0', label: 'Japanese', kind: 'youtube' }],
                selectedTrackId: 'youtube-0',
                secondaryTrackId: '',
                overlayVisible: true,
                hasPrimaryCues: true,
                currentCueText: '今日は',
                youtubeDomCaptionFallbackTrackId: '',
                lastYomuCaptionsActive: false,
            });

            expect(active).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(true);
        } finally {
            document.documentElement.classList.remove('jpdb-subtitle-yomu-captions-active');
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
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
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja&pot=best&potc=1', languageCode: 'ja', name: { simpleText: '日本語' } },
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
            expect(tracks[0].url).toContain('pot=best');
            expect(tracks[1]).toMatchObject({ label: 'English (en) · auto-generated', language: 'en', autoGenerated: true });
        } finally {
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
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
        const originalLocation = window.location;
        const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja', languageCode: 'ja', name: { simpleText: '日本語' } },
                    ],
                },
            },
        };

        try {
            const tracks = getYouTubeCaptionTracks();

            expect(tracks).toHaveLength(1);
            expect(tracks[0]).toMatchObject({ language: 'ja', label: '日本語 (ja)' });
        } finally {
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
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
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja&name=manual', languageCode: 'ja', vssId: '.ja', name: { simpleText: 'Japanese' } },
                        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja&kind=asr', languageCode: 'ja', kind: 'asr', vssId: 'a.ja', name: { simpleText: 'Japanese' } },
                    ],
                },
            },
        };

        try {
            const tracks = getYouTubeCaptionTracks();

            expect(tracks).toHaveLength(2);
            expect(tracks[0]).toMatchObject({ label: 'Japanese (ja)', language: 'ja', autoGenerated: false, sourceType: 'manual' });
            expect(tracks[1]).toMatchObject({ label: 'Japanese (ja) · auto-generated', language: 'ja', autoGenerated: true, sourceType: 'asr' });
        } finally {
            (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
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
        document.body.innerHTML = '<span class="jpdb-reader-word"><span class="jpdb-ocr-ruby"><span class="jpdb-ocr-furi" data-jpdb-reader-surface-ignore="true">かがみ</span><span class="jpdb-ocr-ruby-base">鏡</span></span>のない<span class="jpdb-ocr-ruby"><span class="jpdb-ocr-furi" data-jpdb-reader-surface-ignore="true">むら</span><span class="jpdb-ocr-ruby-base">村</span></span></span>';

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
            }));
            expect(reparseVisiblePage).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            vi.useRealTimers();
        }
    });

    it('resolves fallback cards at the popup boundary before rendering', async () => {
        const app = new ReaderApp();
        const fallbackCard: JPDBCard = {
            ...card,
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '青空',
            reading: '青空',
            source: 'fallback',
            pitchAccent: [],
        };
        const publicCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            rid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: ['LHHL'],
        };
        const resolveLookupCard = vi.fn(async () => publicCard);
        const updateWord = vi.fn();
        const clearKanji = vi.fn();
        const load = vi.fn(() => ({
            localEntries: Promise.resolve([]),
            all: Promise.resolve({
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            }),
        }));
        const mountInitialCardShell = vi.fn(async () => null);
        const internals = app as unknown as {
            resolveLookupCard: typeof resolveLookupCard;
            createPopover(): HTMLElement;
            navigation: { updateWord: typeof updateWord; clearKanji: typeof clearKanji };
            rememberCardMiningContext(): void;
            maybePreloadLookupCardAudio(): void;
            cardRenderData: { load: typeof load };
            mountInitialCardShell: typeof mountInitialCardShell;
            showCard(card: JPDBCard, sentence?: string): Promise<void>;
        };
        internals.resolveLookupCard = resolveLookupCard;
        internals.createPopover = () => document.createElement('div');
        internals.navigation = { updateWord, clearKanji };
        internals.rememberCardMiningContext = vi.fn();
        internals.maybePreloadLookupCardAudio = vi.fn();
        internals.cardRenderData = { load };
        internals.mountInitialCardShell = mountInitialCardShell;

        try {
            await internals.showCard(fallbackCard);
            expect(resolveLookupCard).toHaveBeenCalledWith(fallbackCard);
            expect(updateWord).toHaveBeenCalledWith(publicCard, undefined, 'modal', 'reset', undefined);
            expect(load).toHaveBeenCalledWith(publicCard);
            expect(mountInitialCardShell).toHaveBeenCalledWith(expect.any(HTMLElement), publicCard, undefined, undefined, expect.any(Object));
        } finally {
            app.destroy();
        }
    });

    it('upgrades fallback rendered popup words before applying pitch accent colors', async () => {
        const app = new ReaderApp();
        const fallbackCard: JPDBCard = {
            ...card,
            vid: -2069890,
            sid: -2069890,
            rid: 0,
            spelling: 'あらゆる',
            reading: '',
            source: 'fallback',
            pitchAccent: [],
        };
        const publicCard: JPDBCard = {
            ...card,
            vid: 2069890,
            sid: 0,
            rid: 0,
            spelling: 'あらゆる',
            reading: 'あらゆる',
            source: 'jpdb',
            pitchAccent: ['LHHL'],
        };
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-unknown';
        word.dataset.vid = String(fallbackCard.vid);
        word.dataset.sid = String(fallbackCard.sid);
        word.textContent = 'あらゆる';
        document.body.append(word);

        const search = vi.fn(async () => [publicCard]);
        const pitch = vi.fn(async () => ['LHHL']);
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof search };
            jpdbPublicPitch: { lookup: typeof pitch };
            parser: { cacheCards: typeof cacheCards };
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false, showPitchAccent: true };
        internals.jpdbVocabulary = { search };
        internals.jpdbPublicPitch = { lookup: pitch };
        internals.parser = { cacheCards };

        const token: JPDBToken = {
            card: fallbackCard,
            start: 0,
            end: 4,
            length: 4,
            rubies: [],
            pitchClass: '',
            sentence: 'それはあらゆる種類の植物である。',
        };

        try {
            await internals.enrichPitchWords([token]);

            expect(search).toHaveBeenCalledWith('あらゆる', 1);
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
            expect(token.card).toBe(publicCard);
            expect(token.pitchClass).toBe('nakadaka');
            expect(word.dataset.vid).toBe('2069890');
            expect(word.dataset.reading).toBe('あらゆる');
            expect(word.dataset.pitchClass).toBe('nakadaka');
            expect(word.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(false);
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('uses local pitch metadata for rendered page words before public pitch lookup', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: [],
        };
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-unknown';
        word.dataset.vid = String(lookupCard.vid);
        word.dataset.sid = String(lookupCard.sid);
        word.textContent = '青空';
        document.body.append(word);

        const lookupTermMeta = vi.fn(async () => [{
            expression: '青空',
            mode: 'pitch',
            data: { reading: 'あおぞら', pitches: [{ position: 3 }] },
            dictionary: 'Pitch',
        }]);
        const publicPitch = vi.fn(async () => ['LHHH']);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            dictionaries: { lookupTermMeta: typeof lookupTermMeta };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true, showPitchAccent: true };
        internals.dictionaries = { lookupTermMeta };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        const token: JPDBToken = {
            card: lookupCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
        };

        try {
            await internals.enrichPitchWords([token]);

            expect(lookupTermMeta).toHaveBeenCalledWith('青空', 12, internals.settings.dictionaryPreferences);
            expect(publicPitch).not.toHaveBeenCalled();
            expect(lookupCard.pitchAccent).toEqual(['LHHLL']);
            expect(token.pitchClass).toBe('nakadaka');
            expect(word.dataset.pitchClass).toBe('nakadaka');
            expect(word.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(false);
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('keeps nested popup pitch enrichment from fanning out public JPDB lookups', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: [],
        };
        const publicPitch = vi.fn(async () => ['LHHLL']);
        const token: JPDBToken = {
            card: lookupCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
        };
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookup?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: true,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichPitchWords([token], { publicLookup: false });

            expect(publicPitch).not.toHaveBeenCalled();
            expect(lookupCard.pitchAccent).toEqual([]);
            expect(token.pitchClass).toBe('');
        } finally {
            app.destroy();
        }
    });

    it('reuses in-flight popup parses across deferred rerenders', async () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = '<div class="jpdb-reader-parseable">日本語です。</div>';
        document.body.append(popover);
        const parsed = deferred<JPDBToken[][]>();
        const parse = vi.fn(() => parsed.promise);
        const parsedCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            spelling: '日本語',
            reading: 'にほんご',
            pitchAccent: [],
        };
        const token: JPDBToken = {
            card: parsedCard,
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '日本語です。',
        };
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parser: { parse: typeof parse };
            parsePopoverJapanese(popover: HTMLElement): Promise<void>;
        };
        internals.activePopover = popover;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: false,
            ankiEnabled: false,
            localDictionariesEnabled: false,
            showPitchAccent: false,
        };
        internals.parser = { parse };

        try {
            const first = internals.parsePopoverJapanese(popover);
            await waitForExpect(() => expect(parse).toHaveBeenCalledTimes(1));

            popover.innerHTML = '<div class="jpdb-reader-parseable">日本語です。</div>';
            delete popover.dataset.jpdbReaderParseLoadingKey;
            delete popover.dataset.jpdbReaderParseLoadingId;
            const second = internals.parsePopoverJapanese(popover);
            expect(parse).toHaveBeenCalledTimes(1);

            parsed.resolve([[token]]);
            await Promise.all([first, second]);

            expect(parse).toHaveBeenCalledWith(['日本語です。'], expect.objectContaining({
                allowJpdbTimeoutFallback: true,
                includeLocalPitch: false,
                jpdbTimeoutMs: 1_200,
            }));
            expect(popover.querySelector<HTMLElement>('.jpdb-reader-word')?.textContent).toBe('日本語');
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('prefetches pitch for the first parsed popup word without requiring a click', async () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = '<div class="jpdb-reader-parseable">青空です。</div>';
        document.body.append(popover);
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: [],
        };
        const token: JPDBToken = {
            card: lookupCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '青空です。',
        };
        const parse = vi.fn(async () => [[token]]);
        const publicPitch = vi.fn(async () => ['LHHLL']);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parser: { parse: typeof parse };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            parsePopoverJapanese(popover: HTMLElement): Promise<void>;
        };
        internals.activePopover = popover;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: false,
            ankiEnabled: false,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: true,
        };
        internals.parser = { parse };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.parsePopoverJapanese(popover);

            await waitForExpect(() => {
                const word = popover.querySelector<HTMLElement>('.jpdb-reader-word');
                expect(word?.dataset.pitchClass).toBe('nakadaka');
                expect(word?.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
            });
            expect(publicPitch).toHaveBeenCalledWith('青空', 'あおぞら');
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('prioritizes fallback content words over one-kana particles when enriching pitch', async () => {
        const app = new ReaderApp();
        const particles = ['の', 'で', 'を', 'は', 'な', 'た', 'に', 'が', 'へ', 'も', 'と', 'か'];
        const contentFallback: JPDBCard = {
            ...card,
            vid: -1381470,
            sid: -1381470,
            rid: 0,
            spelling: '青空',
            reading: '',
            source: 'fallback',
            pitchAccent: [],
        };
        const publicCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            rid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: ['LHHL'],
        };
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-unknown';
        word.dataset.vid = String(contentFallback.vid);
        word.dataset.sid = String(contentFallback.sid);
        word.textContent = '青空';
        document.body.append(word);

        const tokens: JPDBToken[] = [
            ...particles.map((surface, index): JPDBToken => ({
                card: {
                    ...card,
                    vid: -1000 - index,
                    sid: -1000 - index,
                    rid: 0,
                    spelling: surface,
                    reading: '',
                    source: 'fallback',
                    pitchAccent: [],
                },
                start: index,
                end: index + 1,
                length: 1,
                rubies: [],
                pitchClass: '',
            })),
            {
                card: contentFallback,
                start: 12,
                end: 14,
                length: 2,
                rubies: [],
                pitchClass: '',
            },
        ];

        const search = vi.fn(async (term: string) => term === '青空' ? [publicCard] : []);
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof search };
            jpdbPublicPitch: { lookup: (spelling: string, reading: string) => Promise<string[]> };
            parser: { cacheCards: typeof cacheCards };
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false, showPitchAccent: true };
        internals.jpdbVocabulary = { search };
        internals.jpdbPublicPitch = { lookup: vi.fn(async () => []) };
        internals.parser = { cacheCards };

        try {
            await internals.enrichPitchWords(tokens);

            expect(search).toHaveBeenCalledWith('青空', 1);
            expect(search).not.toHaveBeenCalledWith('の', 1);
            expect(tokens[tokens.length - 1]!.card).toBe(publicCard);
            expect(tokens[tokens.length - 1]!.pitchClass).toBe('nakadaka');
            expect(word.dataset.vid).toBe('1381470');
            expect(word.dataset.reading).toBe('あおぞら');
            expect(word.dataset.pitchClass).toBe('nakadaka');
            expect(word.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(false);
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('lets urgent pitch enrichment bypass a saturated background queue', async () => {
        const app = new ReaderApp();
        const stalledPitch = deferred<string[]>();
        const urgentCard: JPDBCard = {
            ...card,
            vid: 64001,
            sid: 1,
            rid: 0,
            spelling: '読む',
            reading: 'よむ',
            source: 'jpdb',
            pitchAccent: [],
        };
        const urgentWord = document.createElement('span');
        urgentWord.className = 'jpdb-reader-word jpdb-pitch-unknown';
        urgentWord.dataset.vid = String(urgentCard.vid);
        urgentWord.dataset.sid = String(urgentCard.sid);
        urgentWord.textContent = urgentCard.spelling;
        document.body.append(urgentWord);
        const tokenFor = (lookupCard: JPDBCard): JPDBToken => ({
            card: lookupCard,
            start: 0,
            end: lookupCard.spelling.length,
            length: lookupCard.spelling.length,
            rubies: [],
            pitchClass: '',
        });
        const backgroundTokens = Array.from({ length: 12 }, (_, index) => tokenFor({
            ...card,
            vid: 65000 + index,
            sid: 1,
            rid: 0,
            spelling: `背景${index}`,
            reading: `はいけい${index}`,
            source: 'jpdb',
            pitchAccent: [],
        }));
        const publicPitch = vi.fn((spelling: string) => spelling === urgentCard.spelling
            ? Promise.resolve(['HLL'])
            : stalledPitch.promise);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[], options?: { urgent?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        let background: Promise<void> | undefined;
        try {
            background = internals.enrichPitchWords(backgroundTokens);
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledTimes(2);
            });

            await internals.enrichPitchWords([tokenFor(urgentCard)], { urgent: true });

            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
            expect(urgentCard.pitchAccent).toEqual(['HLL']);
            expect(urgentWord.dataset.pitchClass).toBe('atamadaka');
            expect(urgentWord.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
            expect(urgentWord.classList.contains('jpdb-pitch-unknown')).toBe(false);
        } finally {
            stalledPitch.resolve([]);
            await background?.catch(() => undefined);
            urgentWord.remove();
            app.destroy();
        }
    });

    it('limits background public pitch fanout while keeping local overflow pitch instant', async () => {
        const app = new ReaderApp();
        const tokenFor = (lookupCard: JPDBCard): JPDBToken => ({
            card: lookupCard,
            start: 0,
            end: lookupCard.spelling.length,
            length: lookupCard.spelling.length,
            rubies: [],
            pitchClass: '',
        });
        const cards = [
            { ...card, vid: 66000, sid: 0, rid: 0, spelling: '公開0', reading: 'こうかい', source: 'jpdb' as const, pitchAccent: [] },
            { ...card, vid: 66001, sid: 0, rid: 0, spelling: '公開1', reading: 'こうかい', source: 'jpdb' as const, pitchAccent: [] },
            { ...card, vid: 66002, sid: 0, rid: 0, spelling: '局所', reading: 'きょくしょ', source: 'jpdb' as const, pitchAccent: [] },
            { ...card, vid: 66003, sid: 0, rid: 0, spelling: '余分', reading: 'よぶん', source: 'jpdb' as const, pitchAccent: [] },
        ];
        const localWord = document.createElement('span');
        localWord.className = 'jpdb-reader-word jpdb-pitch-unknown';
        localWord.dataset.vid = String(cards[2]!.vid);
        localWord.dataset.sid = String(cards[2]!.sid);
        localWord.textContent = cards[2]!.spelling;
        document.body.append(localWord);
        const lookupTermMeta = vi.fn(async (term: string) => term === '局所'
            ? [{
                expression: '局所',
                mode: 'pitch',
                data: { reading: 'きょくしょ', pitches: [{ position: 0 }] },
                dictionary: 'Pitch',
            }]
            : []);
        const publicPitch = vi.fn(async () => ['LHH']);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            dictionaries: { lookupTermMeta: typeof lookupTermMeta };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            showPitchAccent: true,
            localDictionariesEnabled: true,
            jpdbDefinitionsEnabled: false,
        };
        internals.dictionaries = { lookupTermMeta };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichPitchWords(cards.map(tokenFor), { publicLookupLimit: 2 });

            expect(publicPitch).toHaveBeenCalledTimes(2);
            expect(publicPitch).toHaveBeenCalledWith('公開0', 'こうかい');
            expect(publicPitch).toHaveBeenCalledWith('公開1', 'こうかい');
            expect(publicPitch).not.toHaveBeenCalledWith('局所', 'きょくしょ');
            expect(publicPitch).not.toHaveBeenCalledWith('余分', 'よぶん');
            expect(cards[2]!.pitchAccent).toEqual(['LHHH']);
            expect(localWord.dataset.pitchClass).toBe('heiban');
            expect(localWord.classList.contains('jpdb-pitch-heiban')).toBe(true);
        } finally {
            localWord.remove();
            app.destroy();
        }
    });

    it('updates deferred popup pitch after completed details without replacing parsed popup words', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: [],
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <div class="jpdb-reader-popover-body">
                <div class="jpdb-reader-header">
                    <div class="jpdb-reader-heading">
                        <div class="jpdb-reader-title-row">
                            <div class="jpdb-reader-spelling jpdb-known jpdb-reader-parseable">
                                <span class="jpdb-reader-word jpdb-pitch-unknown" data-vid="${lookupCard.vid}" data-sid="${lookupCard.sid}" tabindex="0">青空</span>
                            </div>
                        </div>
                    </div>
                    <div class="jpdb-reader-card-tools">
                        <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button">Audio</button>
                    </div>
                </div>
            </div>
        `;
        document.body.append(popover);
        const originalWord = popover.querySelector<HTMLElement>('.jpdb-reader-spelling .jpdb-reader-word')!;
        const pitchAccent = deferred<string[]>();
        const localEntries = deferred<YomitanTermEntry[]>();
        const all = deferred<CardRenderData>();
        const parsePopoverJapanese = vi.fn(async () => undefined);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parsePopoverJapanese: typeof parsePopoverJapanese;
            renderDeferredCardLocalEntries(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                renderData: {
                    localEntries: Promise<YomitanTermEntry[]>;
                    pitchAccent?: Promise<string[]>;
                    all: Promise<CardRenderData>;
                },
                fallbackAnkiLookup: { state: string; notes: unknown[]; primary: null },
                mounted: { instantLocalEntries: null; requestId: number },
                renderState: { fullRenderCompleted: boolean },
                isCurrentHoverCard: () => boolean,
            ): void;
        };
        internals.activePopover = popover;
        internals.settings = { ...DEFAULT_SETTINGS, showPitchAccent: true };
        internals.parsePopoverJapanese = parsePopoverJapanese;

        try {
            internals.renderDeferredCardLocalEntries(
                popover,
                lookupCard,
                '青空です。',
                'modal',
                {
                    localEntries: localEntries.promise,
                    pitchAccent: pitchAccent.promise,
                    all: all.promise,
                },
                { state: 'not-in-deck', notes: [], primary: null },
                { instantLocalEntries: null, requestId: 1 },
                { fullRenderCompleted: true },
                () => true,
            );

            pitchAccent.resolve(['LHHLL']);
            await Promise.resolve();
            await Promise.resolve();

            expect(popover.querySelector('.jpdb-reader-spelling .jpdb-reader-word')).toBe(originalWord);
            expect(originalWord.dataset.pitchClass).toBe('nakadaka');
            expect(originalWord.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
            expect(popover.querySelector('.jpdb-reader-pitch')).not.toBeNull();
            expect(parsePopoverJapanese).not.toHaveBeenCalled();
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('updates newtab lookup pitch when public pitch resolves after completed details', () => {
        const runtime = new NewTabRuntime();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: ['LHHLL'],
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <div class="jpdb-reader-popover-body">
                <div class="jpdb-reader-header">
                    <div class="jpdb-reader-heading">
                        <div class="jpdb-reader-title-row">
                            <div class="jpdb-reader-spelling jpdb-known jpdb-reader-parseable">
                                <span class="jpdb-reader-word jpdb-pitch-unknown" data-vid="${lookupCard.vid}" data-sid="${lookupCard.sid}" tabindex="0">青空</span>
                            </div>
                        </div>
                    </div>
                    <div class="jpdb-reader-card-tools">
                        <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button">Audio</button>
                    </div>
                </div>
            </div>
        `;
        document.body.append(popover);
        const originalWord = popover.querySelector<HTMLElement>('.jpdb-reader-spelling .jpdb-reader-word')!;
        const internals = runtime as unknown as {
            activeLookupPopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            repositionLookupPopover: () => void;
            updateDeferredLookupPitch(popover: HTMLElement, card: JPDBCard, metaEntries: []): void;
        };
        internals.activeLookupPopover = popover;
        internals.settings = { ...DEFAULT_SETTINGS, showPitchAccent: true };
        internals.repositionLookupPopover = vi.fn();

        try {
            internals.updateDeferredLookupPitch(popover, lookupCard, []);

            expect(popover.querySelector('.jpdb-reader-spelling .jpdb-reader-word')).toBe(originalWord);
            expect(originalWord.dataset.pitchClass).toBe('nakadaka');
            expect(originalWord.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
            expect(popover.querySelector('.jpdb-reader-pitch')).not.toBeNull();
            expect(internals.repositionLookupPopover).toHaveBeenCalled();
        } finally {
            popover.remove();
            runtime.destroy();
        }
    });

    it('preserves loaded Immersion Kit examples across deferred and completed popup rerenders', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
            pitchAccent: [],
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <details open class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit data-immersion-load-state="loaded" data-immersion-lazy-bound="true">
                <summary class="jpdb-reader-local-title">Immersion Kit</summary>
                <div class="jpdb-reader-example-card" data-immersion-sentence="青空です。">ready example</div>
            </details>
        `;
        document.body.append(popover);
        const originalImmersion = popover.querySelector<HTMLElement>('[data-immersion-kit]')!;
        const localEntries = deferred<YomitanTermEntry[]>();
        const all = deferred<CardRenderData>();
        const parsePopoverJapanese = vi.fn(async () => undefined);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parsePopoverJapanese: typeof parsePopoverJapanese;
            renderDeferredCardLocalEntries(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                renderData: {
                    localEntries: Promise<YomitanTermEntry[]>;
                    all: Promise<CardRenderData>;
                },
                fallbackAnkiLookup: { state: string; notes: unknown[]; primary: null },
                mounted: { instantLocalEntries: null; requestId: number },
                renderState: { fullRenderCompleted: boolean },
                isCurrentHoverCard: () => boolean,
            ): void;
            renderCompletedCardPopover(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                data: CardRenderData,
            ): void;
        };
        internals.activePopover = popover;
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true };
        internals.parsePopoverJapanese = parsePopoverJapanese;

        try {
            internals.renderDeferredCardLocalEntries(
                popover,
                lookupCard,
                '青空です。',
                'modal',
                {
                    localEntries: localEntries.promise,
                    all: all.promise,
                },
                { state: 'not-in-deck', notes: [], primary: null },
                { instantLocalEntries: null, requestId: 1 },
                { fullRenderCompleted: false },
                () => true,
            );

            localEntries.resolve([]);
            await Promise.resolve();
            await Promise.resolve();

            expect(popover.querySelector('[data-immersion-kit]')).toBe(originalImmersion);
            expect(popover.querySelector('.jpdb-reader-example-card')?.textContent).toContain('ready example');

            internals.renderCompletedCardPopover(popover, lookupCard, '青空です。', 'modal', {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            });

            expect(popover.querySelector('[data-immersion-kit]')).toBe(originalImmersion);
            expect(popover.querySelector('.jpdb-reader-example-card')?.textContent).toContain('ready example');
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('continues background pitch enrichment beyond the first small batch', async () => {
        const app = new ReaderApp();
        const tokenCount = 16;
        const tokens: JPDBToken[] = Array.from({ length: tokenCount }, (_, index): JPDBToken => ({
            card: {
                ...card,
                vid: 200000 + index,
                sid: index,
                rid: 0,
                spelling: `青空${index}`,
                reading: 'あおぞら',
                source: 'jpdb',
                pitchAccent: [],
            },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
        }));
        const words = tokens.map(token => {
            const word = document.createElement('span');
            word.className = 'jpdb-reader-word jpdb-pitch-unknown';
            word.dataset.vid = String(token.card.vid);
            word.dataset.sid = String(token.card.sid);
            word.textContent = token.card.spelling;
            document.body.append(word);
            return word;
        });
        const publicPitch = vi.fn(async () => ['LHHLL']);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false, jpdbDefinitionsEnabled: false, showPitchAccent: true };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichPitchWords(tokens);

            expect(publicPitch).toHaveBeenCalledTimes(tokenCount);
            expect(publicPitch).toHaveBeenCalledWith('青空15', 'あおぞら');
            expect(tokens.at(-1)?.pitchClass).toBe('nakadaka');
            expect(words.at(-1)?.dataset.pitchClass).toBe('nakadaka');
            expect(words.at(-1)?.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
        } finally {
            words.forEach(word => word.remove());
            app.destroy();
        }
    });

    it('prioritizes the current card when it is already queued for pitch enrichment', async () => {
        const app = new ReaderApp();
        const tokens: JPDBToken[] = Array.from({ length: 8 }, (_, index): JPDBToken => ({
            card: {
                ...card,
                vid: 300000 + index,
                sid: index,
                rid: 0,
                spelling: `優先${index}`,
                reading: 'ゆうせん',
                source: 'jpdb',
                pitchAccent: [],
            },
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
        }));
        const lookupOrder: string[] = [];
        const publicPitch = vi.fn(async (spelling: string) => {
            lookupOrder.push(spelling);
            return ['LHHH'];
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            queuePitchEnrichmentTokens(tokens: JPDBToken[]): void;
            prioritizeQueuedPitchEnrichment(card: JPDBCard): void;
            drainPitchEnrichmentQueue(): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false, showPitchAccent: true };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            internals.queuePitchEnrichmentTokens(tokens);
            internals.prioritizeQueuedPitchEnrichment(tokens[5]!.card);
            await internals.drainPitchEnrichmentQueue();

            expect(lookupOrder[0]).toBe('優先5');
        } finally {
            app.destroy();
        }
    });

    it('continues pitch enrichment when new work is queued as a drain completes', async () => {
        const app = new ReaderApp();
        const token: JPDBToken = {
            card: {
                ...card,
                vid: 310000,
                sid: 0,
                rid: 0,
                spelling: '再開',
                reading: 'さいかい',
                source: 'jpdb',
                pitchAccent: [],
            },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
        };
        let runs = 0;
        const runPitchEnrichmentQueue = vi.fn(async () => {
            runs += 1;
            if (runs === 1) internals.queuePitchEnrichmentTokens([token]);
            else internals.clearPitchEnrichmentQueue();
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            queuePitchEnrichmentTokens(tokens: JPDBToken[]): void;
            clearPitchEnrichmentQueue(): void;
            runPitchEnrichmentQueue: typeof runPitchEnrichmentQueue;
            drainPitchEnrichmentQueue(): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, showPitchAccent: true };
        internals.runPitchEnrichmentQueue = runPitchEnrichmentQueue;

        try {
            await internals.drainPitchEnrichmentQueue();
            await waitForExpect(() => expect(runPitchEnrichmentQueue).toHaveBeenCalledTimes(2));
        } finally {
            app.destroy();
        }
    });

    it('renders fallback lookup cards promptly when public JPDB resolution is slow', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const fallbackCard: JPDBCard = {
            ...card,
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '青空',
            reading: '青空',
            source: 'fallback',
            pitchAccent: [],
        };
        const resolveLookupCard = vi.fn(() => new Promise<JPDBCard>(() => undefined));
        const updateWord = vi.fn();
        const clearKanji = vi.fn();
        const load = vi.fn(() => ({
            localEntries: Promise.resolve([]),
            all: Promise.resolve({
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            }),
        }));
        const mountInitialCardShell = vi.fn(async () => null);
        const internals = app as unknown as {
            resolveLookupCard: typeof resolveLookupCard;
            createPopover(): HTMLElement;
            navigation: { updateWord: typeof updateWord; clearKanji: typeof clearKanji };
            rememberCardMiningContext(): void;
            maybePreloadLookupCardAudio(): void;
            cardRenderData: { load: typeof load };
            mountInitialCardShell: typeof mountInitialCardShell;
            showCard(card: JPDBCard, sentence?: string): Promise<void>;
        };
        internals.resolveLookupCard = resolveLookupCard;
        internals.createPopover = () => document.createElement('div');
        internals.navigation = { updateWord, clearKanji };
        internals.rememberCardMiningContext = vi.fn();
        internals.maybePreloadLookupCardAudio = vi.fn();
        internals.cardRenderData = { load };
        internals.mountInitialCardShell = mountInitialCardShell;

        try {
            const show = internals.showCard(fallbackCard);
            await vi.advanceTimersByTimeAsync(181);
            await show;

            expect(resolveLookupCard).toHaveBeenCalledWith(fallbackCard);
            expect(updateWord).toHaveBeenCalledWith(fallbackCard, undefined, 'modal', 'reset', undefined);
            expect(load).toHaveBeenCalledWith(fallbackCard);
            expect(mountInitialCardShell).toHaveBeenCalledWith(expect.any(HTMLElement), fallbackCard, undefined, undefined, expect.any(Object));
        } finally {
            app.destroy();
            vi.useRealTimers();
        }
    });

    it('resolves segmented fallback lookup cards through public JPDB search before rendering', async () => {
        const app = new ReaderApp();
        const fallbackCard: JPDBCard = {
            ...card,
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '青空',
            reading: '青空',
            source: 'fallback',
            pitchAccent: [],
        };
        const publicCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            rid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            frequencyRank: 6100,
            source: 'jpdb',
            pitchAccent: ['LHHL'],
        };
        const search = vi.fn(async () => [publicCard]);
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof search };
            parser: { cacheCards: typeof cacheCards };
            resolveLookupCard(card: JPDBCard): Promise<JPDBCard>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false, showPitchAccent: true };
        internals.jpdbVocabulary = { search };
        internals.parser = { cacheCards };

        try {
            await expect(internals.resolveLookupCard(fallbackCard)).resolves.toBe(publicCard);
            expect(search).toHaveBeenCalledWith('青空', 1);
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
        } finally {
            app.destroy();
        }
    });

    it('falls back to text lookup for uncached parsed words inside the popup', async () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word jpdb-known" data-vid="91" data-sid="92" data-sentence="甘言蜜語だ。" tabindex="0">甘言蜜語</span>
            </div>
        `;
        document.body.append(popover);
        const word = popover.querySelector<HTMLElement>('.jpdb-reader-word')!;

        const getCachedCard = vi.fn(() => undefined);
        const reparseVisiblePage = vi.fn(async () => undefined);
        const lookupText = vi.fn(async () => undefined);
        const internals = app as unknown as {
            getCachedCard: typeof getCachedCard;
            reparseVisiblePage: typeof reparseVisiblePage;
            lookupText: typeof lookupText;
            showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
        };
        internals.getCachedCard = getCachedCard;
        internals.reparseVisiblePage = reparseVisiblePage;
        internals.lookupText = lookupText;

        try {
            await internals.showWord(word, { trigger: 'click' });

            expect(lookupText).toHaveBeenCalledWith('甘言蜜語', '甘言蜜語だ。', expect.objectContaining({
                navigation: 'push-current',
                preservePosition: true,
            }));
            expect(reparseVisiblePage).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps a back arrow when clicking study-source words inside a hover-opened popup', async () => {
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
            const sourceCard: JPDBCard = { ...card, spelling: '印刷', reading: 'いんさつ' };
            const nestedCard: JPDBCard = { ...card, vid: -91, sid: -92, spelling: '技術', reading: 'ぎじゅつ', source: 'fallback' };
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                parser: { cacheCards(cards: JPDBCard[]): void };
                parsePopoverJapanese(popover: HTMLElement): Promise<void>;
                showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { trigger?: 'modal' | 'hover'; navigation?: 'reset' | 'preserve' | 'push-current'; autoPlay?: boolean }): Promise<void>;
                showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' }): Promise<void>;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                audioEnabled: false,
                ankiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
                showPitchAccent: false,
                immersionKitEnabled: false,
                studyGrammarEnabled: false,
                studyTranslationEnabled: false,
            };
            internals.parsePopoverJapanese = vi.fn(async () => undefined);
            internals.parser.cacheCards([nestedCard]);

            await internals.showCard(sourceCard, '印刷技術です。', undefined, { trigger: 'hover', navigation: 'reset', autoPlay: false });
            const hoverPopover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            hoverPopover.querySelector<HTMLElement>('.jpdb-reader-popover-body')?.insertAdjacentHTML('beforeend', `
                <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>
                    Grammar また、PDFファイルをダウンロードしたり、印刷して本にすることもできます。
                    <span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-vid="${nestedCard.vid}" data-sid="${nestedCard.sid}" data-sentence="Grammar また、PDFファイルをダウンロードしたり、印刷して本にすることもできます。" tabindex="0">技術</span>
                </div>
            `);

            await internals.showWord(hoverPopover.querySelector<HTMLElement>('.jpdb-reader-study-original .jpdb-reader-word')!, { trigger: 'click' });

            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-reader-popover')?.getAttribute('aria-modal')).toBe('true');
                expect(document.querySelector<HTMLButtonElement>('[data-action="word-history-back"]')?.title).toBe('Back to word: 印刷');
            });
        } finally {
            Object.defineProperty(window, 'requestAnimationFrame', {
                configurable: true,
                value: originalRequestAnimationFrame,
            });
            vi.unstubAllGlobals();
            app.destroy();
            document.body.replaceChildren();
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

    it('marks scanned page words with wrapping CSS so furigana cannot create a page-wide line', () => {
        expect(READER_WORD_CSS).toContain('.jpdb-reader-word.jpdb-reader-scan-word');
        expect(READER_WORD_CSS).toContain('overflow-wrap: anywhere !important');
        document.body.innerHTML = '<p>検索履歴から検索語句を削除することができます。</p>';
        const [target] = collectTextTargetsIn(document.body, 10, false);

        applyTokensToTextNode(target, [{
            card: { ...card, cardState: ['known'], spelling: '検索履歴', reading: 'けんさくりれき' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [{ text: 'けんさくりれき', start: 0, end: 4, length: 4 }],
            pitchClass: '',
            sentence: '検索履歴から検索語句を削除することができます。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-reader-scan-word')).toBe(true);
        expect(word.querySelector('rt')?.textContent).toBe('けんさくりれき');
    });

    it('parses compact related vocabulary for status colors without adding furigana', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true" class="jpdb-reader-word-text-status">
                <span class="jpdb-reader-jpdb-compound-term jpdb-reader-parseable" data-jpdb-reader-suppress-ruby>甘言</span>
            </div>
        `;
        const root = document.querySelector<HTMLElement>('.jpdb-reader-parseable')!;
        const targets = collectFragmentTextTargetsIn(root, 10, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['甘言']);
        expect(targets[0]?.suppressRuby).toBe(true);

        applyTokensToScanTarget(targets[0], [{
            card: { ...card, spelling: '甘言', reading: 'かんげん', cardState: ['known'] },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'かんげん', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '甘言',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-known')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(readerWordSurfaceText(word)).toBe('甘言');
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

        expect(Array.from(document.querySelectorAll('.jpdb-reader-word')).map(word => readerWordSurfaceText(word))).toEqual(['青空']);
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

    it('keeps Tadoku ruby-base words together with trailing kana', () => {
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
            <main id="main" role="main">
                <section>
                    <div class="bd-title"><h1><ruby>鏡<rt>かがみ</rt></ruby>のない<ruby>村<rt>むら</rt></ruby></h1></div>
                    <div class="bd-desc-jp">
                        <p><ruby>親思<rt>おやおも</rt></ruby>いの<ruby>正助<rt>しょうすけ</rt></ruby>は、<ruby>殿様<rt>とのさま</rt></ruby>にほしいものを<ruby>聞<rt>き</rt></ruby>かれます。</p>
                    </div>
                </section>
            </main>
        `;
        const targets = collectSiteScanTargets(10, 'https://tadoku.org/japanese/book/61371/') ?? [];
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toContain('親思いの正助は、殿様にほしいものを聞かれます。');

        const target = targets.find(item => item.text.startsWith('親思い'))!;
        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '親思い', reading: 'おやおもい' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'おやおも', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: target.text,
        }], DEFAULT_SETTINGS);

        const words = Array.from(document.querySelectorAll<HTMLElement>('.bd-desc-jp .jpdb-reader-word'));
        expect(words).toHaveLength(1);
        expect(readerWordSurfaceText(words[0])).toBe('親思い');
        expect(words[0]?.querySelector('rt')?.textContent).toBe('おやおも');
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
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['被って']);
        expect(words.every(word => word.dataset.sentence === '小人は帽子を被っています。')).toBe(true);
        expect(document.querySelectorAll('.jpdb-reader-word rt.jpdb-reader-furi')).toHaveLength(0);
        expect(document.querySelector('.jpdb-reader-word rt.kanji')?.textContent).toBe('かぶ');
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

    it('adds safe UI chrome labels after prose as passive no-ruby scan targets', () => {
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
            <header><nav><a href="/help">ヘルプセンター</a></nav></header>
            <main>
                <article><p>今日は静かな喫茶店で新しい本を読みました。</p></article>
                <a href="/history">検索履歴を管理する</a>
                <button type="button">設定を保存する</button>
            </main>
            <form><button type="submit">登録する</button></form>
        `;
        document.querySelectorAll<HTMLButtonElement>('button')
            .forEach(button => { button.getBoundingClientRect = () => ({
                left: 0,
                right: 160,
                top: 0,
                bottom: 40,
                width: 160,
                height: 40,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect); });

        const targets = collectScanTargets(10, 'https://support.google.com/youtube/answer/6342839');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '今日は静かな喫茶店で新しい本を読みました。',
            'ヘルプセンター',
            '検索履歴を管理する',
            '設定を保存する',
        ]);
        const uiTarget = targets.find(target => target.text === '検索履歴を管理する')!;
        expect('passiveInteraction' in uiTarget && uiTarget.passiveInteraction).toBe(true);
        expect('suppressRuby' in uiTarget && uiTarget.suppressRuby).toBe(true);

        applyTokensToScanTarget(uiTarget, [{
            card: { ...card, cardState: ['known'], spelling: '検索履歴', reading: 'けんさくりれき' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [{ text: 'けんさくりれき', start: 0, end: 4, length: 4 }],
            pitchClass: '',
            sentence: '検索履歴を管理する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('a[href="/history"] .jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(word.classList.contains('jpdb-reader-scan-word')).toBe(true);
        expect(word.tabIndex).toBe(-1);
        expect(word.querySelector('rt')).toBeNull();
    });

    it('collects the hosted Try Me text as parser-owned source text', () => {
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
            <div class="yomu-try-me" data-yomu-demo-lookup>
                <strong>Try me</strong>
                <div class="yomu-try-me-text">
                    <h3>青空の下で日本語を読む</h3>
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </div>
            </div>
        `;

        const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/');
        rectSpy.mockRestore();

        expect(document.querySelector('[data-yomu-demo-lookup] .jpdb-reader-word')).toBeNull();
        expect(targets.map(target => target.text)).toEqual([
            '青空の下で日本語を読む',
            '今日は静かな喫茶店で新しい本を読みました。',
        ]);
    });

    it('does not recollect hosted Try Me source text after tokenization', () => {
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
            <div class="yomu-try-me" data-yomu-demo-lookup>
                <strong>Try me</strong>
                <div class="yomu-try-me-text">
                    <h3>青空</h3>
                    <p>日本語</p>
                </div>
            </div>
        `;

        try {
            const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/');
            expect(targets.map(target => target.text)).toEqual(['青空', '日本語']);
            targets.forEach(target => {
                applyTokensToScanTarget(target, [{
                    card: { ...card, spelling: target.text, reading: target.text, cardState: ['known'], pitchAccent: ['LH'] },
                    start: 0,
                    end: target.text.length,
                    length: target.text.length,
                    rubies: [],
                    pitchClass: 'heiban',
                    sentence: target.text,
                }], DEFAULT_SETTINGS);
            });

            expect(collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/')).toEqual([]);
        } finally {
            rectSpy.mockRestore();
        }
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

    it('scans YouTube watch descriptions and comments without mutating SPA titles', () => {
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
            'Webアプリ開発を目指して、日本語で勉強中の新卒エンジニアです！',
            '今夜も配信見なかったごめんね。',
        ]));
        expect(targets.map(target => target.text)).not.toContain('新卒エンジニア、仕事終わりにプログラミング勉強をする！！');

        const description = targets.find(target => target.text.startsWith('Webアプリ開発'));
        expect(description).toBeTruthy();
        applyTokensToScanTarget(description!, [{
            card: { ...card, cardState: ['known'], spelling: 'アプリ', reading: 'アプリ' },
            start: 3,
            end: 6,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: 'Webアプリ開発を目指して、日本語で勉強中の新卒エンジニアです！',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(document.querySelector('ytd-watch-metadata h1 .jpdb-reader-word')).toBeNull();
        expect(document.querySelector('ytd-watch-metadata #description-inline-expander .jpdb-reader-word.jpdb-known')?.textContent).toBe('アプリ');
        expect(document.querySelectorAll('ytd-watch-metadata h1 rt')).toHaveLength(0);
    });

    it('keeps YouTube comment controls clickable while comment text remains active', () => {
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
            <ytd-comment-view-model>
                <yt-attributed-string id="content-text">今夜も配信見なかったごめんね。</yt-attributed-string>
                <span class="more-button" slot="more-button"><span>続きを読む</span></span>
            </ytd-comment-view-model>
        `;

        const targets = collectScanTargets(10, 'https://www.youtube.com/watch?v=TAorfFcb8_g');
        rectSpy.mockRestore();

        const comment = targets.find(target => target.text === '今夜も配信見なかったごめんね。');
        const more = targets.find(target => target.text === '続きを読む');
        expect(comment).toBeTruthy();
        expect(more).toBeTruthy();
        expect('passiveInteraction' in comment! && comment.passiveInteraction).not.toBe(true);
        expect('passiveInteraction' in more! && more.passiveInteraction).toBe(true);

        applyTokensToScanTarget(comment!, [{
            card: { ...card, cardState: ['known'], spelling: '配信', reading: 'はいしん' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '今夜も配信見なかったごめんね。',
        }], DEFAULT_SETTINGS);
        applyTokensToScanTarget(more!, [{
            card: { ...card, cardState: ['not-in-deck'], spelling: '続き', reading: 'つづき' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '続きを読む',
        }], DEFAULT_SETTINGS);

        const commentWord = document.querySelector<HTMLElement>('#content-text .jpdb-reader-word')!;
        const moreWord = document.querySelector<HTMLElement>('.more-button .jpdb-reader-word')!;
        expect(commentWord.dataset.jpdbReaderPassive).toBeUndefined();
        expect(commentWord.tabIndex).toBe(0);
        expect(moreWord.dataset.jpdbReaderPassive).toBe('true');
        expect(moreWord.tabIndex).toBe(-1);
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
                <div id="description-inline-expander">
                    <yt-attributed-string id="attributed-snippet-text">概要文です</yt-attributed-string>
                </div>
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
        expect(targets[0]?.text).toBe('概要文です');
        expect(targets.map(target => target.text)).not.toContain('日本語タイトル');
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

    it('skips JPDB primary spellings because their native ruby layout is fragile', () => {
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

        const texts = targets.map(target => target.text);
        expect(texts).toContain('かか was used by children');
        expect(texts).not.toContain('母');
        expect(texts).not.toContain('ハハ');
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

    it('keeps prose parseable when content class names contain UI-ish words', () => {
        document.body.innerHTML = `
            <main>
                <article>
                    <p class="article-label">今日は静かな部屋で本を読みます。</p>
                    <p class="story-tag">猫と暮らすための日本語を読みます。</p>
                </article>
            </main>
        `;

        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual([
            '今日は静かな部屋で本を読みます。',
            '猫と暮らすための日本語を読みます。',
        ]);
    });

    it('does not rewrite short centered display headings that can break page layout', () => {
        document.body.innerHTML = `
            <h2 style="text-align:center;font-size:22px;line-height:1.1">ポストに届いて、受取ラクラク</h2>
            <p>食卓やリビングなど、おうちのちょっとしたところに飾れる。</p>
        `;

        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['食卓やリビングなど、おうちのちょっとしたところに飾れる。']);
    });

    it('keeps nested text inside short centered headings out of text-node scans', () => {
        document.body.innerHTML = `
            <main>
                <h2 style="text-align:center;font-size:22px;line-height:1.1"><span>お花のプラン</span></h2>
            </main>
        `;

        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets).toEqual([]);
    });

    it('keeps short centered display headings out of broad page scans too', () => {
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
            <h2 style="text-align:center;font-size:22px;line-height:1.1">ポストに届いて、受取ラクラク</h2>
            <p>食卓やリビングなど、おうちのちょっとしたところに飾れる。</p>
        `;

        const targets = collectScanTargets(10, 'https://bloomeelife.com/');
        rectSpy.mockRestore();

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

    it('allows non-Japanese page captions only when a real selected caption track asks for them', () => {
        document.body.innerHTML = '<video></video><div class="lesson-player"><span>today we read subtitles</span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 180, right: 660, top: 380, bottom: 420, width: 480, height: 40 }),
        });

        expect(readPageCaptionText(video)).toBe('');
        expect(readPageCaptionText(video, undefined, { allowNonJapanese: true })).toBe('today we read subtitles');
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

    it('drops separate OCR furigana rows when a larger kanji title row is present', () => {
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'かがみ', box: { left: 180, top: 110, width: 150, height: 34 } },
                { text: 'むら', box: { left: 670, top: 104, width: 120, height: 34 } },
                { text: '鏡のない村', box: { left: 170, top: 145, width: 620, height: 120 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['鏡のない村']);
    });

    it('drops vertical OCR furigana columns next to larger kanji title columns', () => {
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'かがみ', vertical: true, box: { left: 300, top: 120, width: 28, height: 150 } },
                { text: '鏡のない村', vertical: true, box: { left: 335, top: 110, width: 90, height: 520 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['鏡のない村']);
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

    it('normalizes Cloud Vision OCR responses for image overlays', () => {
        const result = normalizeOcrResult({
            responses: [{
                fullTextAnnotation: {
                    pages: [{
                        width: 640,
                        height: 480,
                        blocks: [{
                            paragraphs: [{
                                words: [{
                                    symbols: [
                                        { text: '学', boundingBox: { vertices: [{ x: 10, y: 20 }, { x: 38, y: 20 }, { x: 38, y: 58 }, { x: 10, y: 58 }] } },
                                        { text: '校', boundingBox: { vertices: [{ x: 40, y: 20 }, { x: 70, y: 20 }, { x: 70, y: 58 }, { x: 40, y: 58 }] }, property: { detectedBreak: { type: 'LINE_BREAK' } } },
                                    ],
                                }],
                            }],
                        }],
                    }],
                },
            }],
        }, 640, 480);

        expect(result?.lines[0]).toMatchObject({
            text: '学校',
            box: { left: 10, top: 20, width: 60, height: 38 },
        });
    });

    it('parses Google Lens upload HTML without evaluating remote code', () => {
        const lineItems = [[[[['学', null, null, '校']], [0.1, 0.2, 0.3, 0.4]]]];
        const block = [null, null, [[null, null, null, null, null, [null, null, null, lineItems]]]];
        const callback = {
            key: 'ds:1',
            data: [null, null, [null, null, null, [[block]]]],
            sideChannel: {},
        };
        const literal = JSON.stringify(callback)
            .replace('"key"', 'key')
            .replace('"ds:1"', "'ds:1'");
        const html = `<script>AF_initDataCallback({key:'unused',data:[]});AF_initDataCallback(${literal});</script>`;
        const result = parseGoogleLensUploadHtml(html, 1000, 800);

        expect(result?.lines[0]).toMatchObject({
            text: '学校',
            box: { top: 80, left: 200, width: 300, height: 320 },
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
                            { expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '山猫', reading: 'やまねこ', glossary: ['wildcat (European wildcat)'], score: 16, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '面白い', reading: 'おもしろい', glossary: ['interesting; amusing'], score: 18, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '女', reading: 'おんな', glossary: ['woman'], score: 22, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '別語', reading: 'べつご', glossary: ['女'], score: 30, dictionary: 'Jitendex.org [2025-12-02]' },
                        ],
                    },
                ],
            },
        })], 'yomitan-direct-dictionaries.json', { type: 'application/json' });

        await store.importFile(file);
        const importTermSearchCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termSearch', 'readonly').objectStore('termSearch').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(importTermSearchCount).toBe(0);
        const entries = await store.lookup('青空', 'あおぞら', 5);
        expect(entries).toMatchObject([{ dictionary: 'Jitendex.org [2025-12-02]', expression: '青空' }]);
        expect(glossaryToHtml(entries[0].glossary[0])).toContain('blue sky');
        expect((await store.searchTerms('cat', 5)).map(entry => entry.expression)).toEqual(expect.arrayContaining(['猫', '山猫']));
        expect((await store.searchTerms('おもし', 5)).map(entry => entry.expression)).toContain('面白い');
        const kanjiSearchExpressions = (await store.searchTerms('女', 5)).map(entry => entry.expression);
        expect(kanjiSearchExpressions).toContain('女');
        expect(kanjiSearchExpressions).not.toContain('別語');
        await store.prepareTermSearchIndex();
        const termSearchCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termSearch', 'readonly').objectStore('termSearch').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(termSearchCount).toBeGreaterThan(0);
    });

    it('populates a kanji-to-term index and uses it for similar term lookups', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '山猫', reading: 'やまねこ', glossary: ['wildcat'], score: 10, dictionary: 'Jitendex' }] },
                        { $: [2, { expression: '猫舌', reading: 'ねこじた', glossary: ['sensitive to hot food'], score: 12, dictionary: 'Jitendex' }] },
                        { $: [3, { expression: '犬', reading: 'いぬ', glossary: ['dog'], score: 20, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'similar-kanji-index.json', { type: 'application/json' });

        await store.importFile(file);
        const termKanjiCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termKanji', 'readonly').objectStore('termKanji').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(termKanjiCount).toBe(0);
        expect((await store.lookupSimilarTermsByKanji('猫', 5)).map(entry => entry.expression)).toEqual(['猫舌', '山猫']);

        const indexedTermKanjiCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termKanji', 'readonly').objectStore('termKanji').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(indexedTermKanjiCount).toBe(5);
    });

    it('coalesces concurrent hot local dictionary lookups and keys them by normalized preferences', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 10, dictionary: 'Primary' }] },
                        { $: [2, { expression: '猫', reading: 'ねこ', glossary: ['cat alt'], score: 20, dictionary: 'Secondary' }] },
                    ],
                }],
            },
        })], 'hot-lookup-cache.json', { type: 'application/json' });

        await store.importFile(file);
        store.invalidateCaches();

        const originalGetAll = IDBIndex.prototype.getAll;
        const getAllSpy = vi
            .spyOn(IDBIndex.prototype, 'getAll')
            .mockImplementation(function (this: IDBIndex, ...args: Parameters<IDBIndex['getAll']>) {
                return originalGetAll.apply(this, args);
            });

        try {
            const [first, second] = await Promise.all([
                store.lookup('猫', '猫', 5),
                store.lookup('猫', '猫', 5),
            ]);
            expect(first).toEqual(second);
            expect(getAllSpy).toHaveBeenCalledTimes(1);

            const primaryOnly = await store.lookup('猫', '猫', 5, [
                { name: 'Primary', alias: 'Primary', enabled: true, priority: 0 },
                { name: 'Secondary', alias: 'Secondary', enabled: false, priority: 1 },
            ]);
            const secondaryOnly = await store.lookup('猫', '猫', 5, [
                { name: 'Secondary', alias: 'Secondary', enabled: true, priority: 0 },
                { name: 'Primary', alias: 'Primary', enabled: false, priority: 1 },
            ]);

            expect(primaryOnly.map(entry => entry.dictionary)).toEqual(['Primary']);
            expect(secondaryOnly.map(entry => entry.dictionary)).toEqual(['Secondary']);
        } finally {
            getAllSpy.mockRestore();
        }
    });

    it('uses a bounded legacy glossary fallback while the token index is being prepared', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('terms', 'readwrite');
                tx.objectStore('terms').add({
                    expression: '猫',
                    reading: 'ねこ',
                    glossary: ['cat'],
                    score: 20,
                    dictionary: 'Jitendex',
                });
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            };
            request.onerror = () => reject(request.error);
        });

        expect((await store.searchTerms('cat', 5)).map(entry => entry.expression)).toContain('猫');
        await store.prepareTermSearchIndex();
        expect((await store.searchTerms('cat', 5)).map(entry => entry.expression)).toContain('猫');
    });

    it('can run interactive glossary search without starting the full token index rebuild', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'interactive-search-dictionaries.json', { type: 'application/json' }));

        expect((await store.searchTerms('cat', 5, [], {
            candidateLimit: 12,
            glossaryFallbackMaxRows: 20,
            glossaryFallbackMaxMs: 20,
            prepareIndex: false,
        })).map(entry => entry.expression)).toContain('猫');

        const termSearchCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termSearch', 'readonly').objectStore('termSearch').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(termSearchCount).toBe(0);
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
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
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

function withWindowProperty<T>(key: keyof Window, value: unknown, callback: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    Object.defineProperty(window, key, {
        configurable: true,
        value,
    });
    try {
        return callback();
    } finally {
        if (descriptor) Object.defineProperty(window, key, descriptor);
        else delete (window as unknown as Record<string, unknown>)[key as string];
    }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
