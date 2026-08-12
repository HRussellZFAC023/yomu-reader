import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
    DEFAULT_SETTINGS,
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    NewTabRuntime,
    PITCH_ENRICHMENT_LIMIT,
    PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT,
    ReaderApp,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
    appendDeferredPitchPopover,
    appendRenderedReaderWord,
    card,
    configurePublicVocabularyEnrichment,
    deferred,
    expectDeferredPitchPopoverUpdated,
    expectHydratedOcrPitchWord,
    expectHydratedPopupAnkiRender,
    expectReaderWordFurigana,
    expectRenderedPitchWord,
    registerRenderedWordPrivateState,
    readerWordSurfaceText,
    renderedWordPrivateStateForCard,
    renderedWordPrivateValue,
    setupHydratedPopupAnkiLookup,
    testAozoraCard,
    testFallbackCard,
    testPublicCard,
    testTokenForCard,
    waitForExpect,
} from './fixtures';
import type {
    AnkiExistingNote,
    AnkiLookupResult,
    CardRenderData,
    JPDBCard,
    JPDBToken,
    TestCardPopoverHydrationContext,
    YomitanTermEntry,
} from './fixtures';
import { ReaderParser } from '../../../src/reader/lookup/parser';
import type { DeferredPublicJitenReadingCoordinator } from '../../../src/reader/app/deferred-public-jiten-readings';
import { hasPaintablePitchComponents } from '../../../src/reader/lookup/pitch-components';
import { noteScannedShadowRoot } from '../../../src/reader/dom/shadow-scan-registry';
import {
    DEFERRED_PUBLIC_PITCH_PER_URL_CAP,
    YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
} from '../../../src/reader/app/main-helpers';
import {
    JitenPublicVocabularyClient,
    publicJitenBackoffRemainingMs,
    resetJitenPublicVocabularyBackoffForTests,
} from '../../../src/reader/dictionaries/jiten-public-vocabulary';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('normalizes public vocabulary pitch and furigana on active OCR fallback words', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -10001,
            sid: -10001,
            spelling: '読む',
        });
        const publicCard = testPublicCard({
            vid: 1556420,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: ['HL'],
        });
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line jpdb-ocr-line-active';
        line.dataset.ocrText = '読む';
        const word = appendRenderedReaderWord(fallbackCard, { parent: line });
        word.dataset.surface = '読む';
        document.body.append(line);

        const search = vi.fn(async () => [publicCard]);
        const { cacheCards, internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: { furiganaMode: 'all', showFurigana: true },
        });

        const token = testTokenForCard(fallbackCard, '読む', {
            rubies: [{ text: 'よ', start: 0, end: 1, length: 1 }],
        });

        try {
            await internals.enrichPitchWords([token]);

            expect(search).toHaveBeenCalledWith('読む', PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT);
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
            expect(token.card).toBe(publicCard);
            expect(token.pitchClass).toBe('atamadaka');
            expectHydratedOcrPitchWord(word, line, {
                vid: '1556420',
                reading: 'よむ',
                pitchClass: 'atamadaka',
                surface: '読む',
                visualText: ['よ', '読', 'む'],
            });
            expect(word.querySelector('ruby')).toBeNull();
        } finally {
            line.remove();
            app.destroy();
        }
    });

    it('normalizes public vocabulary pitch and furigana on inactive OCR fallback words', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -10002,
            sid: -10002,
            spelling: '読む',
        });
        const publicCard = testPublicCard({
            vid: 1556420,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: ['HL'],
        });
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        line.dataset.ocrText = '読む';
        const word = appendRenderedReaderWord(fallbackCard, { parent: line });
        word.dataset.surface = '読む';
        document.body.append(line);

        const search = vi.fn(async () => [publicCard]);
        const { cacheCards, internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: { furiganaMode: 'all', showFurigana: true },
        });

        try {
            await internals.enrichPitchWords([testTokenForCard(fallbackCard, '読む')]);

            expect(search).toHaveBeenCalledWith('読む', PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT);
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
            expectHydratedOcrPitchWord(word, line, {
                vid: '1556420',
                reading: 'よむ',
                pitchClass: 'atamadaka',
                surface: '読む',
                visualText: ['よ', '読', 'む'],
            });
        } finally {
            line.remove();
            app.destroy();
        }
    });

    it('does not replace rendered kana fallback tokens with public reading-only matches', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -404,
            sid: -404,
            spelling: 'した',
        });
        const publicCard = testPublicCard({
            vid: 1217010,
            spelling: '下',
            reading: 'した',
            pitchAccent: ['HL'],
        });
        const word = appendRenderedReaderWord(fallbackCard);

        const search = vi.fn(async () => [publicCard]);
        const { internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: { furiganaMode: 'all', showFurigana: true },
        });

        const token = testTokenForCard(fallbackCard, '本を読みました。');

        try {
            await internals.enrichPitchWords([token]);

            expect(word.dataset.expression).not.toBe('下');
            expect(word.dataset.reading).toBeUndefined();
            expect(word.textContent).toBe('した');
            expect(word.querySelector('rt')).toBeNull();
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
        registerRenderedWordPrivateState(
            word,
            renderedWordPrivateStateForCard(lookupCard, 'not-in-deck'),
        );
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
            expectRenderedPitchWord(word, 'nakadaka');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('enriches every local-only pitch token in a batch beyond PITCH_ENRICHMENT_LIMIT', async () => {
        // Regression: the publicLookup:false branch (local-only/nested visible
        // scans) used to slice(0, PITCH_ENRICHMENT_LIMIT) and drop the rest with
        // no re-queue, so dense pages only ever pitched the first 12 words —
        // pitch appeared to load slowly, one word at a time. Local lookups are
        // network-free, so the whole batch must be covered.
        const app = new ReaderApp();
        const tokenCount = PITCH_ENRICHMENT_LIMIT * 2 + 1;
        const tokens: JPDBToken[] = Array.from({ length: tokenCount }, (_, index) => ({
            card: {
                ...card,
                vid: 5_000 + index,
                sid: index,
                spelling: `単語${index}`,
                reading: 'ねこ',
                source: 'jpdb',
                pitchAccent: [],
            },
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
        }));

        const lookupTermMeta = vi.fn(async (expression: string) => [{
            expression,
            mode: 'pitch',
            data: { reading: 'ねこ', pitches: [{ position: 1 }] },
            dictionary: 'Pitch',
        }]);
        const publicPitch = vi.fn(async () => ['HLL']);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            dictionaries: { lookupTermMeta: typeof lookupTermMeta };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookup?: boolean }): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true, showPitchAccent: true };
        internals.dictionaries = { lookupTermMeta };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichPitchWords(tokens, { publicLookup: false });

            // Every token — not just the first PITCH_ENRICHMENT_LIMIT — gets pitch.
            expect(tokens.every(token => token.pitchClass === 'atamadaka')).toBe(true);
            expect(tokens.every(token => token.card.pitchAccent.length > 0)).toBe(true);
            expect(lookupTermMeta).toHaveBeenCalledTimes(tokenCount);
            // Local-only branch must never reach the network.
            expect(publicPitch).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('uses keyless Jiten vocabulary before JPDB public lookup for fallback words', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -1381470,
            sid: -1381470,
            spelling: '青空',
        });
        const jitenCard: JPDBCard = {
            ...card,
            vid: 1381470,
            sid: 0,
            rid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            frequencyRank: 6924,
            partOfSpeech: ['n'],
            meanings: [{ glosses: ['blue sky'], partOfSpeech: ['noun'] }],
            cardState: ['not-in-deck'],
            pitchAccent: ['LHHLL'],
            wordWithReading: '青[あお]空[ぞら]',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 1381470,
            jitenReadingIndex: 0,
        };
        const word = appendRenderedReaderWord(fallbackCard);
        const search = vi.fn(async () => []);
        const publicPitch = vi.fn(async () => ['LHHLL']);
        const jitenLookup = vi.fn(async () => jitenCard);
        const jitenLookupMany = vi.fn(async (terms: readonly string[]) => new Map(
            terms.includes('青空') ? [['青空', jitenCard]] : [],
        ));
        const { cacheCards, internals } = configurePublicVocabularyEnrichment(app, {
            search,
            pitch: publicPitch,
            jitenLookup,
            jitenLookupMany,
            settings: { apiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
        });

        try {
            await internals.enrichPitchWords([testTokenForCard(fallbackCard)], { publicLookupLimit: 1 });

            expect(jitenLookupMany).toHaveBeenCalledWith(['青空'], { detailLimit: 1, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS });
            expect(jitenLookup).not.toHaveBeenCalled();
            expect(search).not.toHaveBeenCalled();
            expect(publicPitch).not.toHaveBeenCalled();
            expect(cacheCards).toHaveBeenCalledWith([jitenCard]);
            expect(renderedWordPrivateValue(word, 'vid')).toBe('1381470');
            expect(renderedWordPrivateValue(word, 'sid')).toBe('0');
            expect(word.dataset.vid).toBeUndefined();
            expect(word.dataset.sid).toBeUndefined();
            expectReaderWordFurigana(word, 'あおぞら');
            expectRenderedPitchWord(word, 'nakadaka');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('continues from Jiten detail hydration to JPDB pitch when the detail has no accent', async () => {
        const app = new ReaderApp();
        const parsed = testPublicCard({
            vid: 5615641,
            sid: 0,
            spelling: '浜面',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
        });
        const hydrated = testPublicCard({
            ...parsed,
            spelling: '浜面',
            reading: 'はまも',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: '浜[はま]面[も]',
            meanings: [{ glosses: ['Hamamo'], partOfSpeech: ['surname'] }],
        });
        const token = testTokenForCard(parsed, '浜面はそこに集まった。');
        const word = appendRenderedReaderWord(parsed);
        const hydrateCards = vi.fn(async () => new Map([['5615641:0', hydrated]]));
        const publicPitch = vi.fn(async () => ['LHH']);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            parser: { cacheCards(cards: JPDBCard[]): void };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number; urgent?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: true,
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        internals.parser = { cacheCards: vi.fn() };

        try {
            await internals.enrichPitchWords([token], { publicLookupLimit: 1, urgent: true });

            expect(hydrateCards).toHaveBeenCalled();
            expect(publicPitch).toHaveBeenCalledWith('浜面', 'はまも');
            expect(token.card).toBe(hydrated);
            expect(hydrated.pitchAccent).toEqual(['LHH']);
            expect(token.pitchClass).toBe('heiban');
            expectRenderedPitchWord(word, 'heiban');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('hydrates sparse Jiten parse cards even when the authenticated Jiten parser is active', async () => {
        const app = new ReaderApp();
        const parsed = testPublicCard({
            vid: 777,
            sid: 0,
            spelling: '毎日',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
        });
        const hydrated = testPublicCard({
            ...parsed,
            reading: 'まいにち',
            source: 'jiten',
            pitchAccent: ['LHHH'],
            wordWithReading: '毎[まい]日[にち]',
        });
        const token = testTokenForCard(parsed, '毎日使う。');
        const word = appendRenderedReaderWord(parsed);
        const hydrateCards = vi.fn(async () => new Map([['777:0', hydrated]]));
        const publicPitch = vi.fn(async () => [] as string[]);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            parser: { cacheCards(cards: JPDBCard[]): void };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number; urgent?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            jitenApiKey: 'authenticated-jiten',
            localDictionariesEnabled: false,
            showPitchAccent: true,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        internals.parser = { cacheCards: vi.fn() };

        try {
            await internals.enrichPitchWords([token], { publicLookupLimit: 1, urgent: true });

            expect(hydrateCards).toHaveBeenCalledWith([parsed], expect.any(Object));
            expect(token.card).toBe(hydrated);
            expect(word.dataset.reading).toBe('まいにち');
            expect(word.dataset.pitchClass).toBe('heiban');
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(word.querySelector('rt')?.textContent).toBe('まいにち');
            expect(publicPitch).not.toHaveBeenCalled();
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it.each([
        { label: 'pitch only', showPitchAccent: true, showFurigana: false, furiganaMode: 'off', yomuLocalSrsEnabled: false, ankiEnabled: false, bunpro: false, audioEnabled: false, hydrates: true, ruby: false },
        { label: 'pitch with furigana mode off', showPitchAccent: true, showFurigana: true, furiganaMode: 'off', yomuLocalSrsEnabled: false, ankiEnabled: false, bunpro: false, audioEnabled: false, hydrates: true, ruby: false },
        { label: 'furigana only', showPitchAccent: false, showFurigana: true, furiganaMode: 'all', yomuLocalSrsEnabled: false, ankiEnabled: false, bunpro: false, audioEnabled: false, hydrates: true, ruby: true },
        { label: 'both disabled with no canonical consumer', showPitchAccent: false, showFurigana: false, furiganaMode: 'off', yomuLocalSrsEnabled: false, ankiEnabled: false, bunpro: false, audioEnabled: false, hydrates: false, ruby: false },
        { label: 'both disabled with Academy SRS', showPitchAccent: false, showFurigana: false, furiganaMode: 'off', yomuLocalSrsEnabled: true, ankiEnabled: false, bunpro: false, audioEnabled: false, hydrates: true, ruby: false },
        { label: 'both disabled with Anki', showPitchAccent: false, showFurigana: false, furiganaMode: 'off', yomuLocalSrsEnabled: false, ankiEnabled: true, bunpro: false, audioEnabled: false, hydrates: true, ruby: false },
        { label: 'both disabled with Bunpro', showPitchAccent: false, showFurigana: false, furiganaMode: 'off', yomuLocalSrsEnabled: false, ankiEnabled: false, bunpro: true, audioEnabled: false, hydrates: true, ruby: false },
        { label: 'both disabled with guarded audio', showPitchAccent: false, showFurigana: false, furiganaMode: 'off', yomuLocalSrsEnabled: false, ankiEnabled: false, bunpro: false, audioEnabled: true, hydrates: true, ruby: false },
    ] as const)('honours the sparse Jiten prerequisite matrix for $label', async settingsCase => {
        const app = new ReaderApp();
        const sparse = testPublicCard({
            vid: 991177,
            sid: 0,
            spelling: '初心者',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 991177,
            jitenReadingIndex: 0,
        });
        const hydrated = testPublicCard({
            ...sparse,
            reading: 'しょしんしゃ',
            source: 'jiten',
            pitchAccent: ['LHHHH'],
            wordWithReading: '初[しょ]心[しん]者[しゃ]',
        });
        const token = testTokenForCard(sparse, '初心者');
        const word = appendRenderedReaderWord(sparse);
        const hydrateCards = vi.fn(async () => new Map([['991177:0', hydrated]]));
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            parser: { cacheCards(cards: JPDBCard[]): void };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number; urgent?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: settingsCase.showPitchAccent,
            showFurigana: settingsCase.showFurigana,
            furiganaMode: settingsCase.furiganaMode,
            yomuLocalSrsEnabled: settingsCase.yomuLocalSrsEnabled,
            ankiEnabled: settingsCase.ankiEnabled,
            bunproFrontendApiToken: settingsCase.bunpro ? 'bunpro-test-token' : '',
            bunproFrontendApiTokenExpiresAt: '',
            audioEnabled: settingsCase.audioEnabled,
            autoPlayAudio: settingsCase.audioEnabled,
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.parser = { cacheCards: vi.fn() };

        try {
            await internals.enrichPitchWords([token], { publicLookupLimit: 0, urgent: true });

            expect(hydrateCards).toHaveBeenCalledTimes(settingsCase.hydrates ? 1 : 0);
            expect(token.card).toBe(settingsCase.hydrates ? hydrated : sparse);
            expect(word.dataset.reading ?? '').toBe(settingsCase.hydrates ? 'しょしんしゃ' : '');
            expect(word.querySelector('rt')?.textContent ?? '').toBe(settingsCase.ruby ? 'しょしんしゃ' : '');
            if (settingsCase.showPitchAccent) {
                expect(word.dataset.pitchClass).toBe('heiban');
                expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
            } else if (settingsCase.hydrates) {
                expect([...word.classList].some(className => className.startsWith('jpdb-pitch-'))).toBe(false);
                expect(word.dataset.pitchAccent).toBeUndefined();
                expect(word.dataset.pitchComponents).toBeUndefined();
                expect(word.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient')).toBe('');
            }
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('bounds visible sparse-word geometry reads and carries the refill cursor across idle slices', () => {
        const app = new ReaderApp();
        document.body.innerHTML = Array.from({ length: 150 }, (_, index) => [
            '<span class="jpdb-reader-word"',
            index % 2 ? ' data-reading=""' : '',
            ` data-expression="未踏語${index}">未踏語${index}</span>`,
        ].join('')).join('');
        document.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach((word, index) => {
            registerRenderedWordPrivateState(word, {
                vid: String(700000 + index),
                sid: '0',
                cardSource: 'jiten',
                cardId: String(700000 + index),
                readingIndex: '0',
                cardState: 'not-in-deck',
                stateProvenance: 'provisional',
            });
        });
        const rect = {
            x: 0,
            y: 2_000,
            top: 2_000,
            right: 10,
            bottom: 2_010,
            left: 0,
            width: 10,
            height: 10,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
        const internals = app as unknown as {
            deferredPublicJitenReadings: DeferredPublicJitenReadingCoordinator;
        };

        try {
            internals.deferredPublicJitenReadings.refillFromVisibleWords();
            expect(rectSpy).toHaveBeenCalledTimes(64);
            expect(internals.deferredPublicJitenReadings.visibleRefillPending).toBe(true);

            internals.deferredPublicJitenReadings.refillFromVisibleWords();
            expect(rectSpy).toHaveBeenCalledTimes(128);
            expect(internals.deferredPublicJitenReadings.visibleRefillPending).toBe(true);

            internals.deferredPublicJitenReadings.refillFromVisibleWords();
            expect(rectSpy).toHaveBeenCalledTimes(150);
            expect(internals.deferredPublicJitenReadings.visibleRefillPending).toBe(false);
        } finally {
            rectSpy.mockRestore();
            document.body.innerHTML = '';
            app.destroy();
        }
    });

    it('returns ordinary page enrichment before Jiten detail settles, then repaints the live word', async () => {
        const app = new ReaderApp();
        const sparse = testPublicCard({
            vid: 881122,
            sid: 0,
            spelling: '初心者',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 881122,
            jitenReadingIndex: 0,
        });
        const hydrated = testPublicCard({
            ...sparse,
            reading: 'しょしんしゃ',
            source: 'jiten',
            pitchAccent: ['LHHHH'],
            wordWithReading: '初[しょ]心[しん]者[しゃ]',
        });
        const response = deferred<Map<string, JPDBCard>>();
        const hydrateCards = vi.fn(() => response.promise);
        const token = testTokenForCard(sparse, '初心者');
        const word = appendRenderedReaderWord(sparse);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            parser: { cacheCards(cards: JPDBCard[]): void };
            waitForIdle(timeoutMs?: number): Promise<void>;
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.parser = { cacheCards: vi.fn() };
        internals.waitForIdle = vi.fn(async () => undefined);

        try {
            await internals.enrichPitchWords([token], { publicLookupLimit: 0 });

            expect(token.card).toBe(sparse);
            expect(word.querySelector('rt')).toBeNull();
            await waitForExpect(() => expect(hydrateCards).toHaveBeenCalledTimes(1));

            response.resolve(new Map([['881122:0', hydrated]]));
            await waitForExpect(() => expect(token.card).toBe(hydrated));
            expect(word.dataset.reading).toBe('しょしんしゃ');
            expect(word.querySelector('rt')?.textContent).toBe('しょしんしゃ');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('hydrates a required reading before spending the separate bounded pitch slot', async () => {
        const app = new ReaderApp();
        const lookupOrder: string[] = [];
        const pitchOnly = testPublicCard({
            vid: 700,
            sid: 0,
            spelling: '観光',
            reading: 'かんこう',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: '観[かん]光[こう]',
            meanings: [{ glosses: ['sightseeing'], partOfSpeech: ['noun'] }],
            jitenWordId: 700,
            jitenReadingIndex: 0,
        });
        const sparse = testPublicCard({
            vid: 1342860,
            sid: 0,
            spelling: '初心者',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 1342860,
            jitenReadingIndex: 0,
        });
        const hydrated = testPublicCard({
            ...sparse,
            spelling: '初心者',
            reading: 'しょしんしゃ',
            source: 'jiten',
            pitchAccent: ['LHHHH'],
            wordWithReading: '初[しょ]心[しん]者[しゃ]',
            meanings: [{ glosses: ['beginner'], partOfSpeech: ['noun'] }],
        });
        const sentence = '[Day319] 初心者エンジニア、自作した天気予報アプリの処理を責務の分離したい！';
        const start = sentence.indexOf('初心者');
        const sparseToken = testTokenForCard(sparse, sentence, {
            start,
            end: start + sparse.spelling.length,
        });
        const word = appendRenderedReaderWord(sparse, {
            tokenStart: start,
            tokenEnd: start + sparse.spelling.length,
        });
        const hydrateCards = vi.fn(async () => {
            lookupOrder.push('jiten-detail');
            return new Map([['1342860:0', hydrated]]);
        });
        const publicPitch = vi.fn(async () => {
            lookupOrder.push('pitch');
            return ['LHHH'];
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            parser: { cacheCards(cards: JPDBCard[]): void };
            enrichPitchWords(tokens: JPDBToken[], options?: {
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                deferPublicLookup?: boolean;
                urgent?: boolean;
            }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: true,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        internals.parser = { cacheCards: vi.fn() };

        try {
            await internals.enrichPitchWords([
                testTokenForCard(pitchOnly, '観光'),
                sparseToken,
            ], { publicLookupLimit: 1, publicLookupTotalLimit: 1, deferPublicLookup: false, urgent: true });

            expect(hydrateCards).toHaveBeenCalledWith([sparse], expect.any(Object));
            expect(publicPitch).toHaveBeenCalledWith('観光', 'かんこう');
            expect(lookupOrder[0]).toBe('jiten-detail');
            expect(lookupOrder.at(-1)).toBe('pitch');
            expect(sparseToken.card).toBe(hydrated);
            expect(word.dataset.reading).toBe('しょしんしゃ');
            expect([...word.querySelectorAll('rt')].map(reading => reading.textContent).join('')).toBe('しょしんしゃ');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('awaits one 12-card reading batch and eventually hydrates the queued tail', async () => {
        const app = new ReaderApp();
        const sparseCards = Array.from({ length: PITCH_ENRICHMENT_LIMIT + 3 }, (_, index) => testPublicCard({
            vid: 810000 + index,
            sid: 0,
            spelling: '初心者',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 810000 + index,
            jitenReadingIndex: 0,
        }));
        const tokens = sparseCards.map(card => testTokenForCard(card, '初心者'));
        const hydratedCard = (sparse: JPDBCard): JPDBCard => testPublicCard({
            ...sparse,
            reading: 'しょしんしゃ',
            source: 'jiten',
            pitchAccent: ['LHHHH'],
            wordWithReading: '初[しょ]心[しん]者[しゃ]',
            meanings: [{ glosses: ['beginner'], partOfSpeech: ['noun'] }],
        });
        const hydrateCards = vi.fn(async (cards: readonly JPDBCard[]) => new Map(
            cards.map(card => [`${card.vid}:${card.sid}`, hydratedCard(card)]),
        ));
        const word = appendRenderedReaderWord(sparseCards.at(-1)!);
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            parser: { cacheCards(cards: JPDBCard[]): void };
            waitForIdle(timeoutMs?: number): Promise<void>;
            deferredPublicJitenReadings: DeferredPublicJitenReadingCoordinator;
            enrichPitchWords(tokens: JPDBToken[], options?: {
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                deferPublicLookup?: boolean;
                urgent?: boolean;
            }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.parser = { cacheCards };
        internals.waitForIdle = vi.fn(async () => undefined);

        try {
            await internals.enrichPitchWords(tokens, {
                publicLookupLimit: 0,
                publicLookupTotalLimit: 0,
                publicLookupPageBudget: 0,
                deferPublicLookup: false,
                urgent: true,
            });

            expect(hydrateCards.mock.calls.map(([cards]) => cards.length)).toEqual([PITCH_ENRICHMENT_LIMIT]);
            expect(tokens.slice(0, PITCH_ENRICHMENT_LIMIT).every(token => token.card.reading === 'しょしんしゃ')).toBe(true);
            expect(tokens.slice(PITCH_ENRICHMENT_LIMIT).every(token => token.card.reading === '')).toBe(true);

            await internals.deferredPublicJitenReadings.drain();

            expect(hydrateCards.mock.calls.map(([cards]) => cards.length)).toEqual([PITCH_ENRICHMENT_LIMIT, 3]);
            expect(tokens.every(token => token.card.reading === 'しょしんしゃ')).toBe(true);
            expect(cacheCards.mock.calls.flatMap(([cards]) => cards)).toHaveLength(PITCH_ENRICHMENT_LIMIT + 3);
            expect(word.dataset.reading).toBe('しょしんしゃ');
            expect([...word.querySelectorAll('rt')].map(reading => reading.textContent).join('')).toBe('しょしんしゃ');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('promotes an urgent sparse reading ahead of queued page prose without duplicating its request', async () => {
        const app = new ReaderApp();
        const backgroundCards = Array.from({ length: PITCH_ENRICHMENT_LIMIT + 1 }, (_, index) => testPublicCard({
            vid: 840000 + index,
            sid: 0,
            spelling: `背景語${index}`,
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 840000 + index,
            jitenReadingIndex: 0,
        }));
        const backgroundTokens = backgroundCards.map(card => testTokenForCard(card, card.spelling));
        const urgentToken = testTokenForCard(backgroundCards.at(-1)!, backgroundCards.at(-1)!.spelling);
        const hydratedCard = (card: JPDBCard): JPDBCard => testPublicCard({
            ...card,
            reading: 'はいけいご',
            wordWithReading: `${card.spelling}[はいけいご]`,
        });
        const hydrateCards = vi.fn(async (cards: readonly JPDBCard[]) => new Map(
            cards.map(card => [`${card.vid}:${card.sid}`, hydratedCard(card)]),
        ));
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            parser: { cacheCards(cards: JPDBCard[]): void };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number; urgent?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.parser = { cacheCards: vi.fn() };

        try {
            // The ordinary scan only queues its detail work. Before its timer
            // runs, a subtitle/OCR-style urgent request targets the FIFO tail.
            await internals.enrichPitchWords(backgroundTokens, { publicLookupLimit: 0 });
            await internals.enrichPitchWords([urgentToken], { publicLookupLimit: 0, urgent: true });

            const firstBatch = hydrateCards.mock.calls[0]?.[0] ?? [];
            expect(firstBatch).toHaveLength(PITCH_ENRICHMENT_LIMIT);
            expect(firstBatch[0]).toBe(backgroundCards.at(-1));
            expect(firstBatch.filter(card => card.vid === backgroundCards.at(-1)!.vid)).toHaveLength(1);
            expect(backgroundTokens.at(-1)!.card.reading).toBe('はいけいご');
            expect(urgentToken.card.reading).toBe('はいけいご');
        } finally {
            app.destroy();
        }
    });

    it('joins an urgent token to an in-flight exact-id request without requeueing that id', async () => {
        const app = new ReaderApp();
        const cards = Array.from({ length: PITCH_ENRICHMENT_LIMIT + 1 }, (_, index) => testPublicCard({
            vid: 845000 + index,
            sid: 0,
            spelling: `進行語${index}`,
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 845000 + index,
            jitenReadingIndex: 0,
        }));
        const tokens = cards.map(card => testTokenForCard(card, card.spelling));
        const urgentToken = testTokenForCard(cards[0]!, cards[0]!.spelling);
        const firstResponse = deferred<Map<string, JPDBCard>>();
        const resolvedBatch = (batch: readonly JPDBCard[]): Map<string, JPDBCard> => new Map(
            batch.map(card => [`${card.vid}:${card.sid}`, testPublicCard({
                ...card,
                reading: 'しんこうご',
                wordWithReading: `${card.spelling}[しんこうご]`,
            })]),
        );
        let hydrateCall = 0;
        const hydrateCards = vi.fn((batch: readonly JPDBCard[]): Promise<Map<string, JPDBCard>> => {
            hydrateCall += 1;
            return hydrateCall === 1 ? firstResponse.promise : Promise.resolve(resolvedBatch(batch));
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            parser: { cacheCards(cards: JPDBCard[]): void };
            deferredPublicJitenReadings: DeferredPublicJitenReadingCoordinator;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.parser = { cacheCards: vi.fn() };

        try {
            tokens.forEach(token => expect(internals.deferredPublicJitenReadings.queueToken(token)).toBe('queued'));
            const firstDrain = internals.deferredPublicJitenReadings.run({ foreground: true, maxBatches: 1 });
            expect(hydrateCards).toHaveBeenCalledTimes(1);

            expect(internals.deferredPublicJitenReadings.queueToken(urgentToken, true)).toBe('retained');
            internals.deferredPublicJitenReadings.promoteTokens([urgentToken]);
            expect(internals.deferredPublicJitenReadings.queue).not.toContain(`${cards[0]!.vid}:${cards[0]!.sid}`);

            firstResponse.resolve(resolvedBatch(hydrateCards.mock.calls[0]![0]));
            await firstDrain;
            expect(urgentToken.card.reading).toBe('しんこうご');

            await internals.deferredPublicJitenReadings.run({ foreground: true, maxBatches: 1 });
            expect(hydrateCards).toHaveBeenCalledTimes(2);
            expect(hydrateCards.mock.calls.flatMap(([batch]) => batch)
                .filter(card => card.vid === cards[0]!.vid)).toHaveLength(1);
        } finally {
            app.destroy();
        }
    });

    it('keeps a cumulative 256-attempt URL ceiling across queue clears and reserves one urgent batch', async () => {
        const app = new ReaderApp();
        const backgroundLimit = DEFERRED_PUBLIC_PITCH_PER_URL_CAP - PITCH_ENRICHMENT_LIMIT;
        const cards = Array.from({ length: DEFERRED_PUBLIC_PITCH_PER_URL_CAP + 20 }, (_, index) => testPublicCard({
            vid: 850000 + index,
            sid: 0,
            spelling: `長文語${index}`,
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 850000 + index,
            jitenReadingIndex: 0,
        }));
        const tokens = cards.map(card => testTokenForCard(card, card.spelling));
        const hydrateCards = vi.fn(async (batch: readonly JPDBCard[]) => new Map(
            batch.map(card => [`${card.vid}:${card.sid}`, testPublicCard({
                ...card,
                reading: 'ちょうぶんご',
                wordWithReading: `${card.spelling}[ちょうぶんご]`,
            })]),
        ));
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            parser: { cacheCards(cards: JPDBCard[]): void };
            deferredPublicJitenReadings: DeferredPublicJitenReadingCoordinator;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.parser = { cacheCards: vi.fn() };

        try {
            expect(tokens.slice(0, backgroundLimit).map(token =>
                internals.deferredPublicJitenReadings.queueToken(token))).toEqual(
                Array.from({ length: backgroundLimit }, () => 'queued'),
            );
            expect(internals.deferredPublicJitenReadings.queueToken(tokens[backgroundLimit]!)).toBe('url-budget');
            await internals.deferredPublicJitenReadings.run({
                foreground: true,
                maxBatches: Number.POSITIVE_INFINITY,
            });
            expect(internals.deferredPublicJitenReadings.backgroundRequestAttempts).toBe(backgroundLimit);

            // A settings/target-style clear must not replenish the same URL's
            // network allowance. Twelve new urgent ids can still use the slot
            // deliberately held back from background prose.
            internals.deferredPublicJitenReadings.clear();
            const urgentTokens = tokens.slice(backgroundLimit, DEFERRED_PUBLIC_PITCH_PER_URL_CAP);
            expect(urgentTokens.map(token =>
                internals.deferredPublicJitenReadings.queueToken(token, true))).toEqual(
                Array.from({ length: PITCH_ENRICHMENT_LIMIT }, () => 'queued'),
            );
            expect(internals.deferredPublicJitenReadings.queueToken(
                tokens[DEFERRED_PUBLIC_PITCH_PER_URL_CAP]!,
                true,
            ))
                .toBe('url-budget');
            await internals.deferredPublicJitenReadings.run({
                foreground: true,
                maxBatches: Number.POSITIVE_INFINITY,
            });

            const attemptedCards = hydrateCards.mock.calls.flatMap(([batch]) => batch);
            expect(attemptedCards).toHaveLength(DEFERRED_PUBLIC_PITCH_PER_URL_CAP);
            expect(new Set(attemptedCards.map(card => `${card.vid}:${card.sid}`)).size)
                .toBe(DEFERRED_PUBLIC_PITCH_PER_URL_CAP);
            expect(internals.deferredPublicJitenReadings.requestAttempts).toBe(DEFERRED_PUBLIC_PITCH_PER_URL_CAP);
        } finally {
            app.destroy();
        }
    });

    it('allows only one transient retry for a sparse exact id', async () => {
        resetJitenPublicVocabularyBackoffForTests();
        let now = 50_000;
        const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
        const requestJsonImpl = vi.fn(async () => { throw new Error('Jiten timed out.'); });
        const failingClient = new JitenPublicVocabularyClient({ requestJsonImpl });
        const app = new ReaderApp();
        const sparse = testPublicCard({
            vid: 860000,
            sid: 0,
            spelling: '未踏語',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 860000,
            jitenReadingIndex: 0,
        });
        const token = testTokenForCard(sparse, sparse.spelling);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: JitenPublicVocabularyClient;
            deferredPublicJitenReadings: DeferredPublicJitenReadingCoordinator;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = failingClient;

        try {
            expect(internals.deferredPublicJitenReadings.queueToken(token, true)).toBe('queued');
            await internals.deferredPublicJitenReadings.run({ foreground: true, maxBatches: 1 });
            expect(requestJsonImpl).toHaveBeenCalledTimes(1);
            expect(internals.deferredPublicJitenReadings.queue).toHaveLength(1);
            expect([...internals.deferredPublicJitenReadings.work.values()][0]?.attempts).toBe(1);

            now += 30_001;
            await internals.deferredPublicJitenReadings.run({ foreground: true, maxBatches: 1 });
            expect(requestJsonImpl).toHaveBeenCalledTimes(2);
            expect(internals.deferredPublicJitenReadings.queue).toHaveLength(0);
            expect(internals.deferredPublicJitenReadings.work.size).toBe(0);
        } finally {
            app.destroy();
            nowSpy.mockRestore();
            resetJitenPublicVocabularyBackoffForTests();
        }
    });

    it('continues optional pitch for a readable peer while a sparse reading tail stays queued', async () => {
        const app = new ReaderApp();
        const sparseCards = Array.from({ length: PITCH_ENRICHMENT_LIMIT + 1 }, (_, index) => testPublicCard({
            vid: 820000 + index,
            sid: 0,
            spelling: '初心者',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 820000 + index,
            jitenReadingIndex: 0,
        }));
        const readable = testPublicCard({
            vid: 830000,
            sid: 0,
            spelling: '観光',
            reading: 'かんこう',
            source: 'jpdb',
            pitchAccent: [],
        });
        const hydrateCards = vi.fn(async (cards: readonly JPDBCard[]) => new Map(cards.map(card => [
            `${card.vid}:${card.sid}`,
            testPublicCard({
                ...card,
                reading: 'しょしんしゃ',
                source: 'jiten',
                pitchAccent: ['LHHHH'],
                wordWithReading: '初[しょ]心[しん]者[しゃ]',
            }),
        ])));
        const publicPitch = vi.fn(async () => ['LHHH']);
        const tokens = [
            ...sparseCards.map(card => testTokenForCard(card, '初心者')),
            testTokenForCard(readable, '観光'),
        ];
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            parser: { cacheCards(cards: JPDBCard[]): void };
            waitForIdle(timeoutMs?: number): Promise<void>;
            deferredPublicJitenReadings: DeferredPublicJitenReadingCoordinator;
            enrichPitchWords(tokens: JPDBToken[], options?: {
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                deferPublicLookup?: boolean;
                urgent?: boolean;
            }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: true,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        internals.parser = { cacheCards: vi.fn() };
        internals.waitForIdle = vi.fn(async () => undefined);

        try {
            await internals.enrichPitchWords(tokens, {
                publicLookupLimit: 1,
                publicLookupTotalLimit: 1,
                publicLookupPageBudget: 1,
                deferPublicLookup: false,
                urgent: true,
            });

            expect(hydrateCards.mock.calls[0]?.[0]).toHaveLength(PITCH_ENRICHMENT_LIMIT);
            expect(publicPitch).toHaveBeenCalledWith('観光', 'かんこう');
            expect(tokens[PITCH_ENRICHMENT_LIMIT]!.card.reading).toBe('');

            await internals.deferredPublicJitenReadings.drain();
            expect(tokens[PITCH_ENRICHMENT_LIMIT]!.card.reading).toBe('しょしんしゃ');
        } finally {
            app.destroy();
        }
    });

    it.each(['url-change', 'destroy'] as const)('drops in-flight public Jiten reading hydration after %s', async staleBy => {
        vi.stubGlobal('location', {
            href: 'https://example.com/first',
            origin: 'https://example.com',
            hostname: 'example.com',
        });
        const app = new ReaderApp();
        const sparse = testPublicCard({
            vid: 1342860,
            sid: 0,
            spelling: '初心者',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 1342860,
            jitenReadingIndex: 0,
        });
        const hydrated = testPublicCard({
            ...sparse,
            reading: 'しょしんしゃ',
            source: 'jiten',
            pitchAccent: ['LHHHH'],
            wordWithReading: '初[しょ]心[しん]者[しゃ]',
        });
        const token = testTokenForCard(sparse, '初心者');
        const word = appendRenderedReaderWord(sparse);
        const response = deferred<Map<string, JPDBCard>>();
        const hydrateCards = vi.fn(() => response.promise);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            waitForIdle(timeoutMs?: number): Promise<void>;
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number; urgent?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.waitForIdle = vi.fn(async () => undefined);

        try {
            const enrichment = internals.enrichPitchWords([token], { publicLookupLimit: 0, urgent: true });
            await waitForExpect(() => expect(hydrateCards).toHaveBeenCalledTimes(1));
            if (staleBy === 'url-change') location.href = 'https://example.com/second';
            else app.destroy();
            response.resolve(new Map([['1342860:0', hydrated]]));
            await enrichment;

            expect(token.card).toBe(sparse);
            expect(word.dataset.reading).toBeUndefined();
            expect(word.querySelector('rt')).toBeNull();
        } finally {
            word.remove();
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('returns the foreground reading pass promptly while public Jiten is in backoff', async () => {
        resetJitenPublicVocabularyBackoffForTests();
        const sparse = testPublicCard({
            vid: 918273,
            sid: 0,
            spelling: '未踏語',
            reading: '',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: null,
            meanings: [],
            jitenWordId: 918273,
            jitenReadingIndex: 0,
        });
        const failingClient = new JitenPublicVocabularyClient({
            requestJsonImpl: vi.fn(async () => { throw new Error('Jiten timed out.'); }),
        });
        await failingClient.hydrateCards([sparse], { detailLimit: 1 });
        expect(publicJitenBackoffRemainingMs()).toBeGreaterThan(0);

        const app = new ReaderApp();
        const hydrateCards = vi.fn(async () => new Map<string, JPDBCard>());
        const token = testTokenForCard(sparse, '未踏語');
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            waitForIdle(timeoutMs?: number): Promise<void>;
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number; urgent?: boolean }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            showFurigana: true,
            furiganaMode: 'all',
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.waitForIdle = vi.fn(async () => undefined);

        try {
            await internals.enrichPitchWords([token], { publicLookupLimit: 0, urgent: true });

            expect(hydrateCards).not.toHaveBeenCalled();
            expect(token.card).toBe(sparse);
        } finally {
            app.destroy();
            resetJitenPublicVocabularyBackoffForTests();
        }
    });

    it('reconciles missing ruby from an already pitch-complete parse token without another lookup', async () => {
        const app = new ReaderApp();
        const complete = testPublicCard({
            vid: 888,
            sid: 0,
            spelling: '漫画',
            reading: 'まんが',
            pitchAccent: ['LHH'],
            wordWithReading: null,
        });
        const token = testTokenForCard(complete, '漫画を読む。', { rubies: [] });
        const word = appendRenderedReaderWord(complete);
        const search = vi.fn(async () => [] as JPDBCard[]);
        const { internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: {
                localDictionariesEnabled: false,
                showPitchAccent: true,
                showFurigana: true,
                furiganaMode: 'all',
            },
        });

        try {
            await internals.enrichPitchWords([token]);

            expect(search).not.toHaveBeenCalled();
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(word.querySelector('rt')?.textContent).toBe('まんが');
            expect(word.dataset.pitchClass).toBe('heiban');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('aligns a pitch-complete dictionary reading onto an inflected rendered surface', async () => {
        const app = new ReaderApp();
        const complete = testPublicCard({
            vid: 889,
            sid: 0,
            spelling: '使う',
            reading: 'つかう',
            pitchAccent: ['LHH'],
            wordWithReading: null,
        });
        const surface = '使える';
        const token = testTokenForCard(complete, surface, { end: surface.length, rubies: [] });
        const word = appendRenderedReaderWord(complete, { text: surface });
        const search = vi.fn(async () => [] as JPDBCard[]);
        const { internals } = configurePublicVocabularyEnrichment(app, {
            search,
            settings: {
                localDictionariesEnabled: false,
                showPitchAccent: true,
                showFurigana: true,
                furiganaMode: 'all',
            },
        });

        try {
            await internals.enrichPitchWords([token]);

            expect(search).not.toHaveBeenCalled();
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(word.querySelector('rt')?.textContent).toBe('つか');
            expect(word.dataset.pitchClass).toBe('heiban');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('renders aligned compound component accents without inventing a whole-word pitch', async () => {
        const app = new ReaderApp();
        const compound = testPublicCard({
            vid: 2856524,
            sid: 0,
            spelling: '登録者数',
            reading: 'とうろくしゃすう',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: '登[とう]録[ろく]者[しゃ]数[すう]',
            pitchComponents: [
                { spelling: '登録', reading: 'とうろく', pitchAccent: [], wordWithReading: '登[とう]録[ろく]' },
                { spelling: '者', reading: 'しゃ', pitchAccent: [], wordWithReading: '者[しゃ]' },
                { spelling: '数', reading: 'すう', pitchAccent: [], wordWithReading: '数[すう]' },
            ],
        });
        const token = testTokenForCard(compound, 'チャンネル登録者数は五万人です。');
        const word = appendRenderedReaderWord(compound);
        const host = document.createElement('pitch-shadow-host');
        document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        noteScannedShadowRoot(root);
        root.append(word);
        const hydrateCards = vi.fn(async () => new Map([['2856524:0', compound]]));
        const publicPitch = vi.fn(async (spelling: string) => {
            if (spelling === '登録') return ['HLLLL'];
            if (spelling === '者') return ['LH'];
            if (spelling === '数') return ['LHL'];
            return [];
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { hydrateCards: typeof hydrateCards };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            parser: { cacheCards(cards: JPDBCard[]): void };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: true,
        };
        internals.jitenPublicVocabulary = { hydrateCards };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        internals.parser = { cacheCards: vi.fn() };

        try {
            await internals.enrichPitchWords([token], { publicLookupLimit: 1 });

            expect(publicPitch).toHaveBeenCalledWith('登録者数', 'とうろくしゃすう');
            expect(publicPitch).toHaveBeenCalledWith('登録', 'とうろく');
            expect(publicPitch).toHaveBeenCalledWith('者', 'しゃ');
            expect(publicPitch).toHaveBeenCalledWith('数', 'すう');
            expect(compound.pitchAccent).toEqual([]);
            expect(word.dataset.pitchComponents).toBe('true');
            expect(word.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient')).toContain('--jpdb-reader-pitch-atamadaka');
            expect(word.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient')).toContain('--jpdb-reader-pitch-heiban');
        } finally {
            host.remove();
            app.destroy();
        }
    });

    it('recovers exact 申し訳 component pitch while keeping the expression suffix neutral', async () => {
        const app = new ReaderApp();
        const expression = testPublicCard({
            vid: 1612030,
            sid: 0,
            spelling: '申し訳ありません',
            reading: 'もうしわけありません',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: '申[もう]し訳[わけ]ありません',
            pitchComponents: undefined,
        });
        const token = testTokenForCard(expression, '申し訳ありません。');
        const publicPitch = vi.fn(async (spelling: string, reading: string) => {
            if (spelling === '申し訳' && reading === 'もうしわけ') return ['LHHHHH'];
            return [];
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichSubtitleTokensBeforeRender(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichSubtitleTokensBeforeRender([token]);

            expect(publicPitch).toHaveBeenCalledWith('申し訳ありません', 'もうしわけありません');
            expect(publicPitch).toHaveBeenCalledWith('申し訳', 'もうしわけ');
            expect(publicPitch).not.toHaveBeenCalledWith('ありません', 'ありません');
            expect(expression.pitchAccent).toEqual([]);
            expect(expression.pitchComponents).toEqual([
                {
                    spelling: '申し訳',
                    reading: 'もうしわけ',
                    pitchAccent: ['LHHHHH'],
                    wordWithReading: null,
                    inferredFromAnnotatedReading: true,
                },
                {
                    spelling: 'ありません',
                    reading: 'ありません',
                    pitchAccent: [],
                    wordWithReading: null,
                    inferredFromAnnotatedReading: true,
                },
            ]);
            expect(hasPaintablePitchComponents(expression)).toBe(true);
            expect(token.pitchClass).toBe('');

            publicPitch.mockClear();
            await internals.enrichSubtitleTokensBeforeRender([token]);

            expect(publicPitch).toHaveBeenCalledWith('申し訳ありません', 'もうしわけありません');
            expect(publicPitch).not.toHaveBeenCalledWith('申し訳', 'もうしわけ');
            expect(publicPitch).not.toHaveBeenCalledWith('ありません', 'ありません');
        } finally {
            app.destroy();
        }
    });

    it('waits for tokens queued during a completed pitch-drain handoff', async () => {
        const app = new ReaderApp();
        const queued = testTokenForCard(testPublicCard({
            vid: 1268350,
            sid: 0,
            spelling: '仕事',
            reading: 'しごと',
            pitchAccent: [],
        }), '仕事');
        const runPitchEnrichmentQueue = vi.fn(async () => {
            queued.card.pitchAccent = ['LHH'];
            queued.pitchClass = 'heiban';
        });
        const internals = app as unknown as {
            pitchEnrichmentDrain?: Promise<void>;
            drainPitchEnrichmentQueue(): Promise<void>;
            runPitchEnrichmentQueue(): Promise<void>;
        };
        // Model the precise hand-off window: the prior drain has resolved but
        // its cleanup has not yet cleared the shared promise.
        internals.pitchEnrichmentDrain = Promise.resolve();
        internals.runPitchEnrichmentQueue = runPitchEnrichmentQueue;

        try {
            await internals.drainPitchEnrichmentQueue();

            expect(runPitchEnrichmentQueue).toHaveBeenCalledTimes(1);
            expect(queued.card.pitchAccent).toEqual(['LHH']);
            expect(queued.pitchClass).toBe('heiban');
        } finally {
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
                allowSegmentedFallback: true,
                allowJpdbTimeoutFallback: false,
                includeLocalPitch: false,
                jpdbTimeoutMs: 1_200,
                requireJpdb: true,
            }));
            const word = popover.querySelector<HTMLElement>('.jpdb-reader-word');
            expect(word ? readerWordSurfaceText(word) : '').toBe('日本語');
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
            source: 'jiten',
            pitchAccent: ['LHHL'],
        };
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-unknown';
        registerRenderedWordPrivateState(
            word,
            renderedWordPrivateStateForCard(contentFallback, 'not-in-deck'),
        );
        // Span-keyed repaints only touch words whose stamped token span
        // matches the resolved token, exactly like production markup.
        word.dataset.tokenStart = '12';
        word.dataset.tokenEnd = '14';
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
        const jitenLookup = vi.fn(async (term: string) => term === '青空' ? publicCard : null);
        const jitenLookupMany = vi.fn(async (terms: readonly string[]) => new Map(
            terms.includes('青空') ? [['青空', publicCard]] : [],
        ));
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof search };
            jpdbPublicPitch: { lookup: (spelling: string, reading: string) => Promise<string[]> };
            parser: { cacheCards: typeof cacheCards };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number }): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: false, localDictionariesEnabled: false, showPitchAccent: true };
        internals.jpdbVocabulary = { search };
        internals.jpdbPublicPitch = { lookup: vi.fn(async () => []) };
        internals.parser = { cacheCards };
        (internals as unknown as { jitenPublicVocabulary?: { lookup: typeof jitenLookup; lookupMany: typeof jitenLookupMany } }).jitenPublicVocabulary = {
            lookup: jitenLookup,
            lookupMany: jitenLookupMany,
        };

        try {
            await internals.enrichPitchWords(tokens, { publicLookupLimit: 1 });

            expect(jitenLookupMany).toHaveBeenCalledWith(['青空'], { detailLimit: 1, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS });
            expect(jitenLookup).not.toHaveBeenCalled();
            expect(jitenLookup).not.toHaveBeenCalledWith('の');
            expect(search).not.toHaveBeenCalled();
            expect(search).not.toHaveBeenCalledWith('の', PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT);
            expect(tokens[tokens.length - 1]!.card).toBe(publicCard);
            expect(tokens[tokens.length - 1]!.pitchClass).toBe('nakadaka');
            expect(renderedWordPrivateValue(word, 'vid')).toBe('1381470');
            expect(word.dataset.vid).toBeUndefined();
            expect(word.dataset.reading).toBe('あおぞら');
            expectRenderedPitchWord(word, 'nakadaka');
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
        registerRenderedWordPrivateState(
            urgentWord,
            renderedWordPrivateStateForCard(urgentCard, 'not-in-deck'),
        );
        urgentWord.textContent = urgentCard.spelling;
        document.body.append(urgentWord);
        const backgroundTokens = Array.from({ length: 12 }, (_, index) => testTokenForCard({
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
            apiKey: 'test-key',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        let background: Promise<void> | undefined;
        try {
            background = internals.enrichPitchWords(backgroundTokens);
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledTimes(BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY);
            });

            await internals.enrichPitchWords([testTokenForCard(urgentCard)], { urgent: true });

            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
            expect(urgentCard.pitchAccent).toEqual(['HLL']);
            expectRenderedPitchWord(urgentWord, 'atamadaka');
        } finally {
            stalledPitch.resolve([]);
            await background?.catch(() => undefined);
            urgentWord.remove();
            app.destroy();
        }
    });

    it('limits background public pitch fanout while keeping local overflow pitch instant', async () => {
        const app = new ReaderApp();
        const cards = [
            { ...card, vid: 66000, sid: 0, rid: 0, spelling: '公開0', reading: 'こうかい', source: 'jpdb' as const, pitchAccent: [] },
            { ...card, vid: 66001, sid: 0, rid: 0, spelling: '公開1', reading: 'こうかい', source: 'jpdb' as const, pitchAccent: [] },
            { ...card, vid: 66002, sid: 0, rid: 0, spelling: '局所', reading: 'きょくしょ', source: 'jpdb' as const, pitchAccent: [] },
            { ...card, vid: 66003, sid: 0, rid: 0, spelling: '余分', reading: 'よぶん', source: 'jpdb' as const, pitchAccent: [] },
        ];
        const localWord = document.createElement('span');
        localWord.className = 'jpdb-reader-word jpdb-pitch-unknown';
        registerRenderedWordPrivateState(
            localWord,
            renderedWordPrivateStateForCard(cards[2]!, 'not-in-deck'),
        );
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
            await internals.enrichPitchWords(cards.map(lookupCard => testTokenForCard(lookupCard)), { publicLookupLimit: 2 });

            expect(publicPitch).toHaveBeenCalledTimes(2);
            expect(publicPitch).toHaveBeenCalledWith('公開0', 'こうかい');
            expect(publicPitch).toHaveBeenCalledWith('公開1', 'こうかい');
            expect(publicPitch).not.toHaveBeenCalledWith('局所', 'きょくしょ');
            expect(publicPitch).not.toHaveBeenCalledWith('余分', 'よぶん');
            expect(cards[2]!.pitchAccent).toEqual(['LHHH']);
            expectRenderedPitchWord(localWord, 'heiban');
        } finally {
            localWord.remove();
            app.destroy();
        }
    });

    it('de-duplicates queued background pitch enrichment across repeated scans', async () => {
        const app = new ReaderApp();
        const queuedCard = {
            ...card,
            vid: 66010,
            sid: 0,
            rid: 0,
            spelling: '重複',
            reading: 'じゅうふく',
            source: 'jpdb' as const,
            pitchAccent: [],
        };
        const stalledPitch = deferred<void>();
        const publicPitch = vi.fn(async () => {
            await stalledPitch.promise;
            return ['LHHH'];
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        const first = internals.enrichPitchWords([testTokenForCard(queuedCard)], { publicLookupLimit: 1 });
        await waitForExpect(() => expect(publicPitch).toHaveBeenCalledTimes(1));
        const second = internals.enrichPitchWords([testTokenForCard(queuedCard)], { publicLookupLimit: 1 });

        try {
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(publicPitch).toHaveBeenCalledTimes(1);
        } finally {
            stalledPitch.resolve();
            await Promise.all([first, second]).catch(() => undefined);
            app.destroy();
        }
    });

    it('hydrates generic page fallback pitch before the word is selected', async () => {
        vi.stubGlobal('location', {
            href: 'https://www.google.com/search?q=kotu+io',
            origin: 'https://www.google.com',
            hostname: 'www.google.com',
        });
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -424200,
            sid: -424200,
            spelling: 'コツ',
        });
        const publicCard = testPublicCard({
            vid: 424200,
            spelling: 'コツ',
            reading: 'コツ',
            source: 'jiten',
            pitchAccent: ['HL'],
        });
        const word = appendRenderedReaderWord(fallbackCard, {
            className: 'jpdb-reader-word jpdb-reader-passive-word jpdb-pitch-unknown',
        });
        word.dataset.jpdbReaderPassive = 'true';
        word.dataset.expression = 'コツ';

        const lookupMany = vi.fn(async (terms: readonly string[]) => new Map(
            terms.includes('コツ') ? [['コツ', publicCard]] : [],
        ));
        const cacheCards = vi.fn();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { lookupMany: typeof lookupMany };
            parser: { cacheCards: typeof cacheCards };
            backgroundPitchEnrichmentOptions(): {
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                publicLookupTermLimit?: number;
                substantivePublicLookupOnly?: boolean;
                deferPublicLookup?: boolean;
            };
            enrichPitchWords(tokens: JPDBToken[], options?: unknown): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jitenPublicVocabulary = { lookupMany };
        internals.parser = { cacheCards };

        try {
            await internals.enrichPitchWords([testTokenForCard(fallbackCard, 'コツ')], internals.backgroundPitchEnrichmentOptions());

            expect(lookupMany).toHaveBeenCalledWith(['コツ'], { detailLimit: 1, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS });
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
            expect(renderedWordPrivateValue(word, 'vid')).toBe('424200');
            expect(renderedWordPrivateValue(word, 'cardSource')).toBe('jiten');
            expect(word.dataset.vid).toBeUndefined();
            expect(word.dataset.cardSource).toBeUndefined();
            expect(word.dataset.reading).toBe('コツ');
            expect(word.dataset.pitchAccent).toBe('HL');
            expectRenderedPitchWord(word, 'atamadaka');
        } finally {
            word.remove();
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('keeps YouTube background public pitch enrichment bounded', async () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        const app = new ReaderApp();
        const youtubeCards = Array.from({ length: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT + 3 }, (_, index) => ({
            ...card,
            vid: 66011 + index,
            sid: 0,
            rid: 0,
            spelling: `背景${index}`,
            reading: 'はいけい',
            source: 'jpdb' as const,
            pitchAccent: [],
        }));
        const publicPitch = vi.fn(async () => ['LHHH']);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            backgroundPitchEnrichmentOptions(): {
                publicLookup?: boolean;
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                publicLookupTermLimit?: number;
                substantivePublicLookupOnly?: boolean;
                deferPublicLookup?: boolean;
            };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookup?: boolean; publicLookupLimit?: number }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichPitchWords(youtubeCards.map(lookupCard => testTokenForCard(lookupCard)), internals.backgroundPitchEnrichmentOptions());

            expect(internals.backgroundPitchEnrichmentOptions()).toEqual({
                publicLookupLimit: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
                publicLookupTotalLimit: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
                publicLookupPageBudget: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
                publicLookupTermLimit: 3,
                substantivePublicLookupOnly: true,
            });
            expect(publicPitch).toHaveBeenCalledTimes(YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT);
            expect(publicPitch).toHaveBeenCalledWith('背景0', 'はいけい');
            expect(publicPitch).toHaveBeenCalledWith(`背景${YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT - 1}`, 'はいけい');
            expect(publicPitch).not.toHaveBeenCalledWith(`背景${YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT}`, 'はいけい');
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('keeps the paced page budget while allowing the public pitch lane for keyless YouTube background enrichment', async () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=eWHIWDHkYW8',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        const app = new ReaderApp();
        const publicPitch = vi.fn(async () => ['LHHH']);
        const youtubeCards = Array.from({ length: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT + 1 }, (_, index) => testPublicCard({
            vid: 300000 + index,
            spelling: `背景${index}`,
            reading: 'はいけい',
            source: 'jpdb',
            pitchAccent: [],
        }));
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            backgroundPitchEnrichmentOptions(): {
                publicLookup?: boolean;
                jpdbPublicLookup?: boolean;
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                publicLookupTermLimit?: number;
                substantivePublicLookupOnly?: boolean;
                deferPublicLookup?: boolean;
            };
            enrichPitchWords(tokens: JPDBToken[], options?: { publicLookup?: boolean; jpdbPublicLookup?: boolean; publicLookupLimit?: number }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            const options = internals.backgroundPitchEnrichmentOptions();
            // The jpdb.io pitch lane stays ON for keyless YouTube (words the
            // local dict misses would otherwise stay grey forever); the page
            // budget, pacing, and per-URL deferral remain the DOS guard.
            expect(options).toEqual({
                publicLookupLimit: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
                publicLookupTotalLimit: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
                publicLookupPageBudget: YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
                publicLookupTermLimit: 3,
                substantivePublicLookupOnly: true,
            });
            await internals.enrichPitchWords(youtubeCards.map(lookupCard => testTokenForCard(lookupCard)), options);

            expect(publicPitch.mock.calls.length).toBeGreaterThan(0);
            expect(publicPitch.mock.calls.length).toBeLessThanOrEqual(YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('reserves only the sparse cards in each mobile batch so later page text keeps its budget', async () => {
        vi.stubGlobal('location', {
            href: 'https://example.com/feed',
            origin: 'https://example.com',
            hostname: 'example.com',
        });
        const app = new ReaderApp();
        const publicPitch = vi.fn(async () => ['LHHH']);
        const sparseCards = (prefix: string, count: number, startVid: number): JPDBCard[] => Array.from({ length: count }, (_, index) => testPublicCard({
            vid: startVid + index,
            spelling: `${prefix}${index}`,
            reading: 'よみ',
            source: 'jpdb',
            pitchAccent: [],
        }));
        const firstBatch = sparseCards('案内', 3, 410000);
        const laterBatch = sparseCards('初心者タイトル', 10, 420000);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichPitchWords(tokens: JPDBToken[], options?: {
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                publicLookupTermLimit?: number;
                deferPublicLookup?: boolean;
            }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        const options = {
            publicLookupLimit: YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
            publicLookupTotalLimit: YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
            publicLookupPageBudget: YOUTUBE_MOBILE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
            publicLookupTermLimit: 3,
            deferPublicLookup: false,
        };

        try {
            await internals.enrichPitchWords(firstBatch.map(card => testTokenForCard(card)), options);
            expect(publicPitch).toHaveBeenCalledTimes(firstBatch.length);

            await internals.enrichPitchWords(laterBatch.map(card => testTokenForCard(card)), options);

            expect(publicPitch).toHaveBeenCalledTimes(firstBatch.length + laterBatch.length);
            expect(publicPitch).toHaveBeenCalledWith('初心者タイトル9', 'よみ');
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('parks keyless YouTube background public enrichment while a hover card is active', async () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=eWHIWDHkYW8',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        const app = new ReaderApp();
        const hoverPopover = document.createElement('div');
        hoverPopover.className = 'jpdb-reader-popover';
        document.body.append(hoverPopover);
        const fallbackCard: JPDBCard = {
            ...card,
            vid: 300500,
            sid: 1,
            rid: 0,
            spelling: '背景語',
            reading: '',
            source: 'fallback',
            pitchAccent: [],
            fallbackLookupTerms: ['背景語'],
        };
        const resolvedCard = testPublicCard({
            vid: 300501,
            sid: 1,
            spelling: '背景語',
            reading: 'はいけいご',
            source: 'jiten',
            pitchAccent: ['LHHH'],
        });
        const lookupMany = vi.fn(async () => new Map([['背景語', resolvedCard]]));
        const internals = app as unknown as {
            activePopover?: HTMLElement;
            activePopoverMode?: 'modal' | 'hover';
            settings: typeof DEFAULT_SETTINGS;
            jitenPublicVocabulary: { lookupMany: typeof lookupMany };
            waitForIdle(timeoutMs?: number): Promise<void>;
            backgroundPitchEnrichmentOptions(): {
                publicLookup?: boolean;
                jpdbPublicLookup?: boolean;
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                publicLookupTermLimit?: number;
                substantivePublicLookupOnly?: boolean;
                deferPublicLookup?: boolean;
            };
            drainDeferredPublicPitchQueue(): Promise<void>;
            enrichPitchWords(tokens: JPDBToken[], options?: {
                publicLookup?: boolean;
                jpdbPublicLookup?: boolean;
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                publicLookupTermLimit?: number;
                substantivePublicLookupOnly?: boolean;
                deferPublicLookup?: boolean;
            }): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jitenPublicVocabulary = { lookupMany };
        internals.waitForIdle = vi.fn(async () => undefined);
        internals.activePopover = hoverPopover;
        internals.activePopoverMode = 'hover';

        try {
            await internals.enrichPitchWords([testTokenForCard(fallbackCard)], internals.backgroundPitchEnrichmentOptions());

            expect(lookupMany).not.toHaveBeenCalled();

            internals.activePopover = undefined;
            internals.activePopoverMode = undefined;
            await internals.drainDeferredPublicPitchQueue();

            await waitForExpect(() => expect(lookupMany).toHaveBeenCalledTimes(1));
        } finally {
            hoverPopover.remove();
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('lets keyless YouTube subtitle pre-render enrichment use urgent JPDB pitch outside the shared page budget', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=eWHIWDHkYW8',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            subtitleBeforeRenderPitchEnrichmentOptions(): {
                urgent?: boolean;
                jpdbPublicLookup?: boolean;
                publicLookupLimit?: number;
                publicLookupTotalLimit?: number;
                publicLookupPageBudget?: number;
                publicLookupTermLimit?: number;
                substantivePublicLookupOnly?: boolean;
                deferPublicLookup?: boolean;
            };
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };

        try {
            expect(internals.subtitleBeforeRenderPitchEnrichmentOptions()).toEqual({
                urgent: true,
                jpdbPublicLookup: true,
                publicLookupLimit: PITCH_ENRICHMENT_LIMIT * 4,
                publicLookupTotalLimit: PITCH_ENRICHMENT_LIMIT * 4,
                publicLookupPageBudget: undefined,
                publicLookupTermLimit: 3,
                substantivePublicLookupOnly: true,
                deferPublicLookup: false,
            });
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('hydrates keyless YouTube subtitle pitch before rendering the active line', async () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=eWHIWDHkYW8',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        const app = new ReaderApp();
        const publicPitch = vi.fn(async () => ['HLL']);
        const token = testTokenForCard(testPublicCard({
            vid: 441001,
            spelling: '読む',
            reading: 'よむ',
            pitchAccent: [],
        }), '読む。');
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichSubtitleTokensBeforeRender(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichSubtitleTokensBeforeRender([token]);

            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
            expect(token.card.pitchAccent).toEqual(['HLL']);
            expect(token.pitchClass).toBe('atamadaka');
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('repairs a credentialed subtitle surname fragment and resolves its real lemma pitch before render', async () => {
        const sentence = '訪れたのかもしれない。';
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            jitenApiKey: '',
            parserProvider: 'jpdb' as const,
            showPitchAccent: true,
            showFurigana: true,
            furiganaMode: 'all' as const,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
        };
        const surname = testPublicCard({
            vid: 5639848,
            sid: 0,
            spelling: '訪',
            reading: 'ほう',
            source: 'jpdb',
            pitchAccent: ['HLL'],
            wordWithReading: '訪[ほう]',
            partOfSpeech: ['name'],
        });
        const parser = new ReaderParser({
            getSettings: () => settings,
            jpdb: {
                parse: vi.fn(async () => [[{
                    card: surname,
                    start: 0,
                    end: 1,
                    length: 1,
                    rubies: [{ text: 'ほう', start: 0, end: 1, length: 1 }],
                    pitchClass: 'atamadaka',
                    sentence,
                }]]),
            } as never,
            dictionaries: {} as never,
        });
        const [tokens] = await parser.parse([sentence], {
            requireJpdb: true,
            allowSegmentedFallback: true,
        });
        const repaired = tokens.find(token => token.start === 0);
        expect(repaired?.card).toMatchObject({
            spelling: '訪れた',
            source: 'fallback',
            fallbackLookupTerms: expect.arrayContaining(['訪れる']),
        });
        if (!repaired) throw new Error('Expected repaired 訪れた token.');

        const app = new ReaderApp();
        const verb = testPublicCard({
            vid: 1518080,
            sid: 0,
            spelling: '訪れる',
            reading: 'おとずれる',
            source: 'jiten',
            pitchAccent: [],
            wordWithReading: '訪[おとず]れる',
            jitenWordId: 1518080,
            jitenReadingIndex: 0,
        });
        const partialSurname = testPublicCard({
            ...surname,
            source: 'jiten',
            jitenWordId: surname.vid,
            jitenReadingIndex: surname.sid,
        });
        const lookupMany = vi.fn(async (terms: readonly string[]) => new Map<string, JPDBCard>([
            ...(terms.includes('訪る') ? [['訪る', partialSurname] as const] : []),
            ...(terms.includes('訪れる') ? [['訪れる', verb] as const] : []),
        ]));
        const publicPitch = vi.fn(async (spelling: string, reading: string) =>
            spelling === '訪れる' && reading === 'おとずれる' ? ['LHHHHH'] : []);
        const internals = app as unknown as {
            settings: typeof settings;
            jitenPublicVocabulary: { lookupMany: typeof lookupMany };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            enrichSubtitleTokensBeforeRender(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = settings;
        internals.jitenPublicVocabulary = { lookupMany };
        internals.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await internals.enrichSubtitleTokensBeforeRender([repaired]);

            expect(lookupMany).toHaveBeenCalledWith(
                expect.arrayContaining(['訪る', '訪れる']),
                { detailLimit: 1, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS },
            );
            expect(repaired.card).toBe(verb);
            expect(repaired.card.reading).toBe('おとずれる');
            expect(repaired.card.pitchAccent).toEqual(['LHHHHH']);
            expect(repaired.pitchClass).toBe('heiban');
            expect(publicPitch).toHaveBeenCalledWith('訪れる', 'おとずれる');
        } finally {
            app.destroy();
        }
    });

    it('keeps keyless OCR urgent enrichment out of JPDB public search and pitch fan-out', async () => {
        const app = new ReaderApp();
        const fallbackCard = testFallbackCard({
            vid: -441001,
            sid: -441001,
            spelling: '未解析語',
            reading: '',
        });
        const publicSearch = vi.fn(async () => []);
        const publicPitch = vi.fn(async () => ['LHHH']);
        const jitenLookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof publicSearch };
            jpdbPublicPitch: { lookup: typeof publicPitch };
            jitenPublicVocabulary: { lookupMany(terms: readonly string[]): Promise<Map<string, JPDBCard>> };
            enrichOcrTokensBeforeRender(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            showPitchAccent: true,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: true,
        };
        internals.jpdbVocabulary = { search: publicSearch };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        internals.jitenPublicVocabulary = { lookupMany: jitenLookupMany };

        try {
            await internals.enrichOcrTokensBeforeRender([testTokenForCard(fallbackCard, '未解析語')]);

            expect(jitenLookupMany).toHaveBeenCalledWith(['未解析語'], { detailLimit: 1, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS });
            expect(publicSearch).not.toHaveBeenCalled();
            expect(publicPitch).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('updates deferred popup pitch after completed details without replacing parsed popup words', async () => {
        const app = new ReaderApp();
        const lookupCard = testAozoraCard();
        const { popover, originalWord } = appendDeferredPitchPopover(lookupCard);
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

            expectDeferredPitchPopoverUpdated(popover, originalWord);
            expect(parsePopoverJapanese).not.toHaveBeenCalled();
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('updates newtab lookup pitch when public pitch resolves after completed details', () => {
        const runtime = new NewTabRuntime();
        const lookupCard = testAozoraCard({ pitchAccent: ['LHHLL'] });
        const { popover, originalWord } = appendDeferredPitchPopover(lookupCard);
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

            expectDeferredPitchPopoverUpdated(popover, originalWord);
            expect(internals.repositionLookupPopover).toHaveBeenCalled();
        } finally {
            popover.remove();
            runtime.destroy();
        }
    });

    it('repaints a completed popup when uncapped supplemental pitch arrives late', async () => {
        const app = new ReaderApp();
        const lookupCard = testAozoraCard({ pitchAccent: [] });
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const latePitch = deferred<string[]>();
        const hydratePitchAccent = vi.fn(() => latePitch.promise);
        const renderCompletedCardPopover = vi.fn();
        const data: CardRenderData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
        };
        const internals = app as unknown as {
            activePopover: HTMLElement;
            renderCompletedCardPopover: typeof renderCompletedCardPopover;
            renderHydratedCardPitchAccent(
                context: TestCardPopoverHydrationContext,
                renderData: { hydratePitchAccent?: () => Promise<string[]> },
            ): void;
        };
        internals.activePopover = popover;
        internals.renderCompletedCardPopover = renderCompletedCardPopover;

        try {
            internals.renderHydratedCardPitchAccent({
                popover,
                card: lookupCard,
                sentence: '青空です。',
                trigger: 'modal',
                state: { data },
                requestId: 1,
                isCurrentHoverCard: () => true,
            }, { hydratePitchAccent });

            lookupCard.pitchAccent = ['LHHLL'];
            latePitch.resolve(['LHHLL']);
            await vi.waitFor(() => expect(renderCompletedCardPopover).toHaveBeenCalledTimes(1));
            expect(hydratePitchAccent).toHaveBeenCalledTimes(1);
            expect(renderCompletedCardPopover).toHaveBeenCalledWith(
                popover,
                lookupCard,
                '青空です。',
                'modal',
                data,
                undefined,
            );
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('coalesces same-frame card hydration repaints', async () => {
        const app = new ReaderApp();
        const lookupCard = testAozoraCard();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const renderCompletedCardPopover = vi.fn();
        const context: TestCardPopoverHydrationContext = {
            popover,
            card: lookupCard,
            sentence: '青空です。',
            trigger: 'modal',
            state: { data: {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            } },
            requestId: 1,
            isCurrentHoverCard: () => true,
        };
        const internals = app as unknown as {
            activePopover: HTMLElement;
            renderCompletedCardPopover: typeof renderCompletedCardPopover;
            scheduleHydratedCardPopoverRender(context: TestCardPopoverHydrationContext): void;
        };
        internals.activePopover = popover;
        internals.renderCompletedCardPopover = renderCompletedCardPopover;

        try {
            internals.scheduleHydratedCardPopoverRender(context);
            internals.scheduleHydratedCardPopoverRender(context);

            expect(renderCompletedCardPopover).not.toHaveBeenCalled();
            await vi.waitFor(() => expect(renderCompletedCardPopover).toHaveBeenCalledTimes(1));
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('hydrates popup Anki details even when the fast status cache misses', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772201,
            sid: 0,
            spelling: '動画',
            reading: 'どうが',
            source: 'jpdb',
        };
        const fastMiss: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        const hydratedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 55,
                primaryCardId: 7701,
                cardIds: [7701],
                state: 'known',
                deckNames: ['Anime::Mining'],
                modelName: 'Imported Core',
                fields: {
                    Word: '動画',
                    Meaning: 'video',
                },
                tags: ['existing'],
                reps: 14,
                lapses: 2,
            },
        };
        const hydrateAnkiLookup = vi.fn(async () => hydratedLookup);
        const { popover, renderCompletedCardPopover, data, renderData, internals } = setupHydratedPopupAnkiLookup(app, {
            lookup: fastMiss,
            ankiDecks: ['Anime::Mining'],
            hydrateAnkiLookup,
        });

        try {
            await expectHydratedPopupAnkiRender({
                popover,
                lookupCard,
                sentence: '動画を見る。',
                data,
                renderData,
                internals,
                renderCompletedCardPopover,
                ankiLookup: hydratedLookup,
            });
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('hydrates popup Anki details when the detailed lookup has notes without a primary', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772207,
            sid: 0,
            spelling: '音声',
            reading: 'おんせい',
            source: 'jpdb',
        };
        const fastMiss: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null, trusted: true };
        const note: AnkiExistingNote = {
            noteId: 58,
            primaryCardId: 7704,
            cardIds: [7704],
            state: 'known',
            deckNames: ['Audio Mining'],
            modelName: 'Imported Core',
            fields: {
                Word: '音声',
                Audio: '[sound:onsei.mp3]',
            },
            renderedCards: [{
                cardId: 7704,
                deckName: 'Audio Mining',
                question: '<div>音声 [sound:onsei.mp3]</div>',
                answer: '<div>audio</div>',
            }],
            tags: ['existing'],
            reps: 8,
            lapses: 0,
        };
        const hydratedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [note],
            primary: null,
            trusted: true,
        };
        const hydrateAnkiLookup = vi.fn(async () => hydratedLookup);
        const { popover, renderCompletedCardPopover, data, renderData, internals } = setupHydratedPopupAnkiLookup(app, {
            lookup: fastMiss,
            ankiDecks: ['Audio Mining'],
            hydrateAnkiLookup,
        });

        try {
            await expectHydratedPopupAnkiRender({
                popover,
                lookupCard,
                sentence: '音声を聞く。',
                data,
                renderData,
                internals,
                renderCompletedCardPopover,
                ankiLookup: hydratedLookup,
            });
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('renders cached popup Anki status as unavailable when detail hydration fails', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772205,
            sid: 0,
            spelling: '始める',
            reading: 'はじめる',
            source: 'jpdb',
        };
        const cachedLookup: AnkiLookupResult = {
            state: 'due',
            notes: [],
            primary: {
                noteId: 56,
                primaryCardId: 7702,
                cardIds: [7702],
                state: 'due',
                deckNames: ['Vocab 2k'],
                modelName: 'Imported Core',
                fields: {},
                tags: ['cached'],
                reps: 5,
                lapses: 0,
            },
        };
        const hydrateAnkiLookup = vi.fn(async (): Promise<AnkiLookupResult> => {
            throw new Error('AnkiConnect unavailable');
        });
        const { popover, renderCompletedCardPopover, data, renderData, internals } = setupHydratedPopupAnkiLookup(app, {
            lookup: cachedLookup,
            ankiDecks: [],
            hydrateAnkiLookup,
        });

        try {
            await expectHydratedPopupAnkiRender({
                popover,
                lookupCard,
                sentence: 'テストを始めてください。',
                data,
                renderData,
                internals,
                renderCompletedCardPopover,
                ankiLookup: expect.objectContaining({
                    primary: expect.objectContaining({
                        noteId: 56,
                        detailsUnavailable: true,
                    }),
                }),
            });
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('hydrates popup out of pending Anki miss when cache confirms no existing card', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772203,
            sid: 0,
            spelling: '未登録',
            reading: 'みとうろく',
            source: 'jpdb',
        };
        const fastMiss: AnkiLookupResult = {
            state: 'not-in-deck',
            notes: [],
            primary: null,
            trusted: false,
        };
        const hydratedLookup: AnkiLookupResult = {
            state: 'not-in-deck',
            notes: [],
            primary: null,
        };
        const hydrateAnkiLookup = vi.fn(async () => hydratedLookup);
        const { popover, renderCompletedCardPopover, data, renderData, internals } = setupHydratedPopupAnkiLookup(app, {
            lookup: fastMiss,
            ankiDecks: ['Mining'],
            hydrateAnkiLookup,
        });

        try {
            await expectHydratedPopupAnkiRender({
                popover,
                lookupCard,
                sentence: '未登録の語を見る。',
                data,
                renderData,
                internals,
                renderCompletedCardPopover,
                ankiLookup: hydratedLookup,
            });
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('does not start hover Anki detail hydration after the hover becomes stale', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772202,
            sid: 0,
            spelling: '連続',
            reading: 'れんぞく',
            source: 'jpdb',
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const fastMiss: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        const hydrateAnkiLookup = vi.fn(async () => ({
            state: 'known',
            notes: [],
            primary: null,
        } satisfies AnkiLookupResult));
        const renderCompletedCardPopover = vi.fn();
        const data: CardRenderData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: fastMiss,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
        };
        let currentHover = true;
        const internals = app as unknown as {
            activePopover: HTMLElement;
            renderCompletedCardPopover: typeof renderCompletedCardPopover;
            renderHydratedCardAnkiLookup(
                context: TestCardPopoverHydrationContext,
                renderData: { hydrateAnkiLookup?: () => Promise<AnkiLookupResult> },
            ): void;
        };
        internals.activePopover = popover;
        internals.renderCompletedCardPopover = renderCompletedCardPopover;

        try {
            internals.renderHydratedCardAnkiLookup(
                {
                    popover,
                    card: lookupCard,
                    sentence: '連続して読む。',
                    trigger: 'hover',
                    state: { data },
                    requestId: 1,
                    isCurrentHoverCard: () => currentHover,
                },
                { hydrateAnkiLookup },
            );

            expect(hydrateAnkiLookup).not.toHaveBeenCalled();
            currentHover = false;
            await vi.advanceTimersByTimeAsync(180);

            expect(hydrateAnkiLookup).not.toHaveBeenCalled();
            expect(renderCompletedCardPopover).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
            popover.remove();
            app.destroy();
        }
    });

    it('hydrates newtab lookup Anki details even when the fast status cache misses', async () => {
        const runtime = new NewTabRuntime();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772201,
            sid: 0,
            spelling: '動画',
            reading: 'どうが',
            source: 'jpdb',
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const fastMiss: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        const hydratedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 55,
                primaryCardId: 7701,
                cardIds: [7701],
                state: 'known',
                deckNames: ['Anime::Mining'],
                modelName: 'Imported Core',
                fields: { Word: '動画' },
                tags: ['existing'],
                reps: 14,
                lapses: 2,
            },
        };
        const data: CardRenderData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: fastMiss,
            jpdbDecks: [],
            ankiDecks: ['Anime::Mining'],
            jpdbVocabularyInfo: null,
        };
        const hydrateAnkiLookup = vi.fn(async () => hydratedLookup);
        const render = vi.fn(() => '<div class="jpdb-reader-popover-body"><div class="jpdb-reader-meta">Anki Known</div></div>');
        const applyAnkiLookupToRenderedWords = vi.fn();
        const installTracking = vi.fn();
        const parseNewTabContent = vi.fn(async () => undefined);
        const installLookupPopoverSources = vi.fn();
        const repositionLookupPopover = vi.fn();
        const internals = runtime as unknown as {
            activeLookupPopover: HTMLElement;
            nextLookupRenderRequest(): number;
            lookupPopoverRenderer: { render: typeof render };
            applyAnkiLookupToRenderedWords: typeof applyAnkiLookupToRenderedWords;
            localizeLookupPopoverChrome: () => void;
            dictionarySourceState: { installTracking: typeof installTracking };
            parseNewTabContent: typeof parseNewTabContent;
            installLookupPopoverSources: typeof installLookupPopoverSources;
            repositionLookupPopover: typeof repositionLookupPopover;
            renderHydratedLookupAnki(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                data: CardRenderData,
                renderData: { hydrateAnkiLookup?: () => Promise<AnkiLookupResult> },
                requestId: number,
            ): void;
        };
        internals.activeLookupPopover = popover;
        const requestId = internals.nextLookupRenderRequest();
        internals.lookupPopoverRenderer = { render };
        internals.applyAnkiLookupToRenderedWords = applyAnkiLookupToRenderedWords;
        internals.localizeLookupPopoverChrome = vi.fn();
        internals.dictionarySourceState = { installTracking };
        internals.parseNewTabContent = parseNewTabContent;
        internals.installLookupPopoverSources = installLookupPopoverSources;
        internals.repositionLookupPopover = repositionLookupPopover;

        try {
            internals.renderHydratedLookupAnki(
                popover,
                lookupCard,
                '動画を見る。',
                data,
                { hydrateAnkiLookup },
                requestId,
            );

            await vi.waitFor(() => expect(render).toHaveBeenCalled());
            expect(hydrateAnkiLookup).toHaveBeenCalledTimes(1);
            expect(render).toHaveBeenCalledWith(lookupCard, '動画を見る。', 'modal', expect.objectContaining({
                ankiLookup: hydratedLookup,
                loading: false,
            }));
            expect(popover.textContent).toContain('Anki Known');
            expect(applyAnkiLookupToRenderedWords).toHaveBeenCalledWith(lookupCard, hydratedLookup);
        } finally {
            popover.remove();
            runtime.destroy();
        }
    });

    it('renders cached newtab Anki status as unavailable when detail hydration fails', async () => {
        const runtime = new NewTabRuntime();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772206,
            sid: 0,
            spelling: '始める',
            reading: 'はじめる',
            source: 'jpdb',
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const cachedLookup: AnkiLookupResult = {
            state: 'due',
            notes: [],
            primary: {
                noteId: 57,
                primaryCardId: 7703,
                cardIds: [7703],
                state: 'due',
                deckNames: ['Vocab 2k'],
                modelName: 'Imported Core',
                fields: {},
                tags: ['cached'],
                reps: 5,
                lapses: 0,
            },
        };
        const data: CardRenderData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: cachedLookup,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
        };
        const hydrateAnkiLookup = vi.fn(async (): Promise<AnkiLookupResult> => {
            throw new Error('AnkiConnect unavailable');
        });
        const render = vi.fn(() => '<div class="jpdb-reader-popover-body"><div class="jpdb-reader-meta">Anki Due</div><div>Card details did not arrive</div></div>');
        const applyAnkiLookupToRenderedWords = vi.fn();
        const installTracking = vi.fn();
        const parseNewTabContent = vi.fn(async () => undefined);
        const installLookupPopoverSources = vi.fn();
        const repositionLookupPopover = vi.fn();
        const internals = runtime as unknown as {
            activeLookupPopover: HTMLElement;
            nextLookupRenderRequest(): number;
            lookupPopoverRenderer: { render: typeof render };
            applyAnkiLookupToRenderedWords: typeof applyAnkiLookupToRenderedWords;
            localizeLookupPopoverChrome: () => void;
            dictionarySourceState: { installTracking: typeof installTracking };
            parseNewTabContent: typeof parseNewTabContent;
            installLookupPopoverSources: typeof installLookupPopoverSources;
            repositionLookupPopover: typeof repositionLookupPopover;
            renderHydratedLookupAnki(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                data: CardRenderData,
                renderData: { hydrateAnkiLookup?: () => Promise<AnkiLookupResult> },
                requestId: number,
            ): void;
        };
        internals.activeLookupPopover = popover;
        const requestId = internals.nextLookupRenderRequest();
        internals.lookupPopoverRenderer = { render };
        internals.applyAnkiLookupToRenderedWords = applyAnkiLookupToRenderedWords;
        internals.localizeLookupPopoverChrome = vi.fn();
        internals.dictionarySourceState = { installTracking };
        internals.parseNewTabContent = parseNewTabContent;
        internals.installLookupPopoverSources = installLookupPopoverSources;
        internals.repositionLookupPopover = repositionLookupPopover;

        try {
            internals.renderHydratedLookupAnki(
                popover,
                lookupCard,
                'テストを始めてください。',
                data,
                { hydrateAnkiLookup },
                requestId,
            );

            await vi.waitFor(() => expect(render).toHaveBeenCalled());
            expect(hydrateAnkiLookup).toHaveBeenCalledTimes(1);
            expect(render).toHaveBeenCalledWith(lookupCard, 'テストを始めてください。', 'modal', expect.objectContaining({
                ankiLookup: expect.objectContaining({
                    primary: expect.objectContaining({
                        noteId: 57,
                        detailsUnavailable: true,
                    }),
                }),
                loading: false,
            }));
            expect(applyAnkiLookupToRenderedWords).toHaveBeenCalledWith(lookupCard, expect.objectContaining({
                primary: expect.objectContaining({ detailsUnavailable: true }),
            }));
            expect(popover.textContent).toContain('Card details did not arrive');
        } finally {
            popover.remove();
            runtime.destroy();
        }
    });

});
