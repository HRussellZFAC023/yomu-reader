import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    NewTabController,
    NewTabRuntime,
    ReaderApp,
    appendKnownAnkiRenderedWord,
    appendRenderedReaderWord,
    card,
    createRepeatedAnkiWordCacheFixture,
    deferred,
    emptyCardRenderData,
    registerRenderedWordPrivateState,
    renderedWordPrivateValue,
    searchWordDetailHtml,
    setInnerHtml,
    testAozoraCard,
    testFallbackCard,
    waitForExpect,
} from './fixtures';
import { updateRenderedWordPrivateState } from '../../../src/reader/dom/rendered-word-private-state';
import type {
    AnkiLookupResult,
    CardRenderData,
    JPDBCard,
    JPDBToken,
    NewTabSearchDetailViewContext,
    YomitanTermEntry,
} from './fixtures';

registerReaderHelpersCleanup();
beforeEach(() => {
    vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
});

type DeferredPopoverRenderData = {
    localEntries: Promise<YomitanTermEntry[]>;
    jpdbVocabularyInfo?: Promise<null>;
    jitenVocabularyInfo?: Promise<null>;
    ankiLookup?: Promise<AnkiLookupResult>;
    all: Promise<CardRenderData>;
};

type DeferredPopoverInternals = {
    activePopover: HTMLElement;
    settings: typeof DEFAULT_SETTINGS;
    parsePopoverJapanese: () => Promise<void>;
    studySources: { installLoaders: (root: ParentNode, sentence: string) => void };
    immersionPopover: { installLazyLoad: (root: ParentNode, card: JPDBCard, options: object) => void };
    renderDeferredCardLocalEntries(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        renderData: DeferredPopoverRenderData,
        fallbackAnkiLookup: AnkiLookupResult,
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
    installInitialCardBehaviors(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        context: {
            trigger: 'modal' | 'hover';
            options: Record<string, unknown>;
            isCurrentHoverCard: () => boolean;
        },
        instantLocalEntries: null,
    ): void;
};

function expectKnownRenderedAnkiWord(word: HTMLElement, decks: string): void {
    expect(word.classList.contains('anki-known')).toBe(true);
    expect(renderedWordPrivateValue(word, 'ankiState')).toBe('known');
    expect(renderedWordPrivateValue(word, 'ankiDecks')).toBe(decks);
}

function expectClearedRenderedAnkiWord(word: HTMLElement): void {
    expect(word.classList.contains('anki-known')).toBe(false);
    expect(renderedWordPrivateValue(word, 'ankiState')).toBeUndefined();
    expect(renderedWordPrivateValue(word, 'ankiDecks')).toBeUndefined();
    expect(word.title).toBe('');
}

function expectNotInDeckRenderedAnkiWord(word: HTMLElement): void {
    expect(word.classList.contains('anki-known')).toBe(false);
    expect(word.classList.contains('anki-not-in-deck')).toBe(true);
    expect(renderedWordPrivateValue(word, 'ankiState')).toBe('not-in-deck');
    expect(renderedWordPrivateValue(word, 'ankiDecks')).toBeUndefined();
}

function deferredPopoverHarness(settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
    const app = new ReaderApp();
    const lookupCard = testAozoraCard();
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    document.body.append(popover);
    const localEntries = deferred<YomitanTermEntry[]>();
    const all = deferred<CardRenderData>();
    const parsePopoverJapanese = vi.fn(async () => undefined);
    const installLoaders = vi.fn();
    const installLazyLoad = vi.fn();
    const internals = app as unknown as DeferredPopoverInternals;
    internals.activePopover = popover;
    internals.settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, ...settings };

    return {
        all,
        internals,
        localEntries,
        lookupCard,
        popover,
        render(trigger: 'modal' | 'hover', renderData: DeferredPopoverRenderData = {
            localEntries: localEntries.promise,
            all: all.promise,
        }): void {
            internals.renderDeferredCardLocalEntries(
                popover,
                lookupCard,
                '青空です。',
                trigger,
                renderData,
                { state: 'not-in-deck', notes: [], primary: null },
                { instantLocalEntries: null, requestId: 1 },
                { fullRenderCompleted: false },
                () => true,
            );
        },
        async settle(): Promise<void> {
            await Promise.resolve();
            await Promise.resolve();
        },
        trackLoaders(): { installLazyLoad: typeof installLazyLoad; installLoaders: typeof installLoaders } {
            internals.studySources.installLoaders = installLoaders;
            internals.immersionPopover.installLazyLoad = installLazyLoad;
            return { installLazyLoad, installLoaders };
        },
        trackParsing(): typeof parsePopoverJapanese {
            internals.parsePopoverJapanese = parsePopoverJapanese;
            return parsePopoverJapanese;
        },
        destroy(): void {
            popover.remove();
            app.destroy();
        },
    };
}

describe('reader helpers', () => {
    it('renders newtab lookup Anki cards without raw all-caps stored-field labels when rendered HTML exists', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiSectionPriority: 1,
            jpdbDefinitionsEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
            immersionKitEnabled: false,
            dictionaryPreferences: [],
        };
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {},
            jpdb: {},
            jpdbKanji: {},
            kanjiVG: {},
            rtk: {},
            immersionKit: {},
            jpdbReviewBridge: { onUpdate: vi.fn(() => vi.fn()) },
            parser: {},
            dictionaries: {},
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        } as unknown as ConstructorParameters<typeof NewTabController>[0]);
        const lookupCard: JPDBCard = {
            ...card,
            vid: 772204,
            sid: 0,
            spelling: '写真',
            reading: 'しゃしん',
            source: 'jpdb',
        };
        const ankiLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 880,
                primaryCardId: 881,
                cardIds: [881],
                state: 'known',
                deckNames: ['New Tab'],
                modelName: 'All Caps Import',
                fields: {
                    EXPRESSION: '写真',
                    READING_KATAKANA: 'シャシン',
                    TRANSLATION_1: 'raw newtab stored gloss should stay hidden',
                    AUDIO: '[sound:newtab-card.mp3]',
                },
                renderedCards: [{
                    cardId: 881,
                    deckName: 'New Tab',
                    question: '<div>写真 [anki:play:q:0]</div>',
                    answer: '<div>photograph</div>',
                }],
                tags: [],
                reps: 3,
                lapses: 0,
            },
        };
        const internals = (controller as unknown as { searchController: {
            searchDetailViewContext(): NewTabSearchDetailViewContext;
        } }).searchController;

        try {
            setInnerHtml(document.body, searchWordDetailHtml(lookupCard, {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup,
                jpdbVocabularyInfo: null,
            }, internals.searchDetailViewContext()));

            const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-card-preview')!;

            expect(preview.textContent).toContain('写真');
            expect(preview.textContent).toContain('photograph');
            expect(preview.textContent).not.toContain('Card audio');
            expect(preview.querySelector('.jpdb-reader-anki-rendered-card')).not.toBeNull();
            expect(preview.querySelector('.jpdb-reader-anki-stored-fields')).toBeNull();
            expect(preview.querySelector('.jpdb-reader-anki-field')).toBeNull();
            expect(preview.textContent).not.toContain('READING_KATAKANA');
            expect(preview.textContent).not.toContain('TRANSLATION_1');
            expect(preview.textContent).not.toContain('raw newtab stored gloss should stay hidden');
            expect(preview.textContent).not.toContain('Front');
            expect(preview.textContent).not.toContain('Back');
            expect(preview.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]')?.dataset.ankiMediaName)
                .toBe('newtab-card.mp3');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('loads newtab lookup Anki status when the Anki section is enabled without mining', async () => {
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
        const word = appendRenderedReaderWord(lookupCard, {
            className: 'jpdb-reader-word jpdb-not-in-deck',
            parent: popover,
        });
        document.body.append(popover);
        const ankiLookup: AnkiLookupResult = {
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
                tags: [],
                reps: 14,
                lapses: 2,
            },
        };
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [ankiLookup]);
        const internals = runtime as unknown as {
            activeLookupPopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            enrichAnkiWords(tokens: JPDBToken[]): Promise<void>;
        };
        internals.activeLookupPopover = popover;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            wordUnderlineColorSource: 'anki',
        };
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.enrichAnkiWords([{
                card: lookupCard,
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: '動画を見る。',
            }]);

            expect(findCachedStatusBatch).toHaveBeenCalledWith([lookupCard]);
            expectKnownRenderedAnkiWord(word, 'Anime::Mining');
            expect(word.title).toBe('Anki: Known (Anime::Mining)');
        } finally {
            popover.remove();
            runtime.destroy();
        }
    });

    it('preserves loaded Immersion Kit examples across deferred and completed popup rerenders', async () => {
        const harness = deferredPopoverHarness();
        const { internals, localEntries, lookupCard, popover } = harness;
        harness.trackParsing();
        popover.innerHTML = `
            <details open class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit data-immersion-load-state="loaded" data-immersion-lazy-bound="true">
                <summary class="jpdb-reader-local-title">Immersion Kit</summary>
                <div class="jpdb-reader-example-card" data-immersion-sentence="青空です。">ready example</div>
            </details>
        `;
        const originalImmersion = popover.querySelector<HTMLElement>('[data-immersion-kit]')!;

        try {
            harness.render('modal');
            localEntries.resolve([]);
            await harness.settle();

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
            harness.destroy();
        }
    });

    it('rebinds study and Immersion loaders after deferred popup rerenders', async () => {
        const harness = deferredPopoverHarness({ studyGrammarEnabled: true, studyTranslationEnabled: true });
        const { localEntries, lookupCard, popover } = harness;
        const { installLazyLoad, installLoaders } = harness.trackLoaders();
        harness.trackParsing();

        try {
            harness.render('modal');
            localEntries.resolve([]);
            await harness.settle();

            await vi.waitFor(() => {
                expect(popover.querySelector('[data-study-grammar]')).not.toBeNull();
                expect(popover.querySelector('[data-immersion-kit]')).not.toBeNull();
            });
            expect(installLoaders).toHaveBeenCalledWith(popover, '青空です。');
            expect(installLazyLoad).toHaveBeenCalledWith(popover, lookupCard, {});
        } finally {
            harness.destroy();
        }
    });

    it.each(['hover', 'modal'] as const)('coalesces %s deferred popup rerenders before parsing and loading detail sections', async trigger => {
        const harness = deferredPopoverHarness({ studyGrammarEnabled: true, studyTranslationEnabled: true });
        const {
            localEntries,
            lookupCard,
            popover,
        } = harness;
        const { installLazyLoad, installLoaders } = harness.trackLoaders();
        const parsePopoverJapanese = harness.trackParsing();
        const jpdbVocabularyInfo = deferred<null>();
        const jitenVocabularyInfo = deferred<null>();
        const ankiLookup = deferred<AnkiLookupResult>();
        const frameCallbacks: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        });

        try {
            harness.render(trigger, {
                localEntries: localEntries.promise,
                jpdbVocabularyInfo: jpdbVocabularyInfo.promise,
                jitenVocabularyInfo: jitenVocabularyInfo.promise,
                ankiLookup: ankiLookup.promise,
                all: harness.all.promise,
            });

            localEntries.resolve([]);
            jpdbVocabularyInfo.resolve(null);
            jitenVocabularyInfo.resolve(null);
            ankiLookup.resolve({ state: 'not-in-deck', notes: [], primary: null });
            await harness.settle();

            expect(frameCallbacks).toHaveLength(1);
            expect(parsePopoverJapanese).not.toHaveBeenCalled();
            expect(installLoaders).not.toHaveBeenCalled();
            expect(installLazyLoad).not.toHaveBeenCalled();

            frameCallbacks.shift()?.(0);

            if (trigger === 'hover') {
                expect(parsePopoverJapanese).not.toHaveBeenCalled();
                expect(installLoaders).not.toHaveBeenCalled();
                expect(installLazyLoad).not.toHaveBeenCalled();
            }

            const postRenderFrames = frameCallbacks.splice(0);
            expect(postRenderFrames.length).toBeGreaterThanOrEqual(1);
            postRenderFrames.forEach(callback => callback(16));

            expect(parsePopoverJapanese).toHaveBeenCalledTimes(1);
            expect(installLoaders).toHaveBeenCalledTimes(1);
            expect(installLoaders).toHaveBeenCalledWith(popover, '青空です。');
            expect(installLazyLoad).toHaveBeenCalledTimes(1);
            expect(installLazyLoad).toHaveBeenCalledWith(popover, lookupCard, {});
        } finally {
            vi.restoreAllMocks();
            harness.destroy();
        }
    });

    it('defers study and Immersion loaders until after the initial hover card shell paints', () => {
        const harness = deferredPopoverHarness({ studyGrammarEnabled: true, studyTranslationEnabled: true });
        const { internals, lookupCard, popover } = harness;
        const { installLazyLoad, installLoaders } = harness.trackLoaders();
        const frameCallbacks: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        });

        try {
            internals.installInitialCardBehaviors(
                popover,
                lookupCard,
                '青空です。',
                { trigger: 'hover', options: {}, isCurrentHoverCard: () => true },
                null,
            );

            expect(installLoaders).not.toHaveBeenCalled();
            expect(installLazyLoad).not.toHaveBeenCalled();
            expect(frameCallbacks).toHaveLength(1);

            frameCallbacks[0]?.(0);

            expect(installLoaders).toHaveBeenCalledWith(popover, '青空です。');
            expect(installLazyLoad).toHaveBeenCalledWith(popover, lookupCard, {});
        } finally {
            vi.restoreAllMocks();
            harness.destroy();
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
        const words = tokens.map(token => appendRenderedReaderWord(token.card, {
            className: 'jpdb-reader-word jpdb-pitch-unknown',
        }));
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

    it('does not warm rendered Anki status when only the Anki section is enabled', async () => {
        const app = new ReaderApp();
        const token: JPDBToken = {
            card: {
                ...card,
                vid: 777,
                sid: 1,
                rid: 0,
                spelling: '動画',
                reading: 'どうが',
                source: 'jpdb',
            },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
        };
        const word = appendRenderedReaderWord(token.card, {
            className: 'jpdb-reader-word jpdb-not-in-deck',
            parent: document.createElement('div'),
        });
        const outside = word.cloneNode(true) as HTMLElement;
        const container = word.parentElement!;
        document.body.append(container, outside);
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [{
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
                tags: [],
                reps: 14,
                lapses: 2,
            },
        }]);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            enrichAnkiWords(tokens: JPDBToken[], roots?: ParentNode[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            ankiSectionEnabled: true,
            wordUnderlineColorSource: 'anki',
        };
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.enrichAnkiWords([token], [container]);

            expect(findCachedStatusBatch).not.toHaveBeenCalled();
            expectClearedRenderedAnkiWord(word);
            expect(outside.classList.contains('anki-known')).toBe(false);
        } finally {
            container.remove();
            outside.remove();
            app.destroy();
        }
    });

    it('clears stale rendered Anki state when applying lookup data while Anki mining is disabled', () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 778,
            sid: 1,
            rid: 0,
            spelling: '動画',
            reading: 'どうが',
            source: 'jpdb',
        };
        const word = appendKnownAnkiRenderedWord(lookupCard);
        updateRenderedWordPrivateState(word, { ankiDecks: 'Anime::Mining' });
        word.title = 'Anki: Known (Anime::Mining)';
        const lookup: AnkiLookupResult = {
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
                tags: [],
                reps: 14,
                lapses: 2,
            },
        };
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            applyAnkiLookupToRenderedWords(card: JPDBCard, lookup: AnkiLookupResult): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            ankiSectionEnabled: true,
            wordUnderlineColorSource: 'anki',
        };

        try {
            internals.applyAnkiLookupToRenderedWords(lookupCard, lookup);

            expectClearedRenderedAnkiWord(word);
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('clears stale rendered Anki color when modal popover fast lookup resolves a trusted miss', () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 781,
            sid: 2,
            rid: 0,
            spelling: '使用',
            reading: 'しよう',
            source: 'jpdb',
        };
        const staleContrastVars = [
            '--jpdb-reader-page-bg',
            '--jpdb-reader-highlight-backdrop',
            '--jpdb-reader-word-accessible-color',
            '--jpdb-reader-word-accessible-highlight',
            '--jpdb-reader-word-accessible-underline',
            '--jpdb-reader-word-highlight-text',
            '--jpdb-reader-word-contrast-shadow',
        ];
        const word = appendKnownAnkiRenderedWord(lookupCard, { contrastVars: staleContrastVars });
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const parsePopoverJapanese = vi.fn(async () => undefined);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parsePopoverJapanese: typeof parsePopoverJapanese;
            renderCompletedCardPopover(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                data: CardRenderData,
            ): void;
        };
        internals.activePopover = popover;
        internals.settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, wordTextColorSource: 'anki' };
        internals.parsePopoverJapanese = parsePopoverJapanese;

        try {
            internals.renderCompletedCardPopover(popover, lookupCard, '使用します。', 'modal', {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            });

            expectNotInDeckRenderedAnkiWord(word);
            staleContrastVars.forEach(name => {
                expect(word.style.getPropertyValue(name)).not.toBe('#58a6ff');
            });
        } finally {
            word.remove();
            popover.remove();
            app.destroy();
        }
    });

    it('preserves rendered Anki color when hover fast lookup only has an empty status', () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 784,
            sid: 2,
            rid: 0,
            spelling: '維持',
            reading: 'いじ',
            source: 'jpdb',
            pitchAccent: [],
        };
        const word = appendKnownAnkiRenderedWord(lookupCard);
        word.style.setProperty('--jpdb-reader-word-accessible-color', '#58a6ff');
        word.style.setProperty('--jpdb-reader-word-accessible-underline', '#58a6ff');
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const parsePopoverJapanese = vi.fn(async () => undefined);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parsePopoverJapanese: typeof parsePopoverJapanese;
            renderCompletedCardPopover(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                data: CardRenderData,
            ): void;
        };
        internals.activePopover = popover;
        internals.settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, wordTextColorSource: 'anki' };
        internals.parsePopoverJapanese = parsePopoverJapanese;

        try {
            internals.renderCompletedCardPopover(popover, lookupCard, '維持します。', 'hover', {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            });

            expect(word.classList.contains('anki-known')).toBe(true);
            expect(word.classList.contains('anki-not-in-deck')).toBe(false);
            expect(renderedWordPrivateValue(word, 'ankiState')).toBe('known');
            expect(renderedWordPrivateValue(word, 'ankiDecks')).toBe('Mining');
            expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).toBe('#58a6ff');
            expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-underline')).toBe('#58a6ff');
        } finally {
            word.remove();
            popover.remove();
            app.destroy();
        }
    });

    it('scopes hover Anki and pitch updates to the hovered rendered word', () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 786,
            sid: 4,
            rid: 0,
            spelling: '即時',
            reading: 'そくじ',
            source: 'jpdb',
            pitchAccent: ['LH'],
        };
        const target = appendRenderedReaderWord(lookupCard, {
            className: 'jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown',
        });
        const duplicate = appendRenderedReaderWord(lookupCard, {
            className: 'jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown',
        });
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const parsePopoverJapanese = vi.fn(async () => undefined);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            activePopoverAnchor?: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parsePopoverJapanese: typeof parsePopoverJapanese;
            renderCompletedCardPopover(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                data: CardRenderData,
                anchor?: HTMLElement,
            ): void;
        };
        internals.activePopover = popover;
        internals.activePopoverAnchor = target;
        internals.settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, wordTextColorSource: 'anki' };
        internals.parsePopoverJapanese = parsePopoverJapanese;

        try {
            internals.renderCompletedCardPopover(popover, lookupCard, '即時に出ます。', 'hover', {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: {
                    state: 'known',
                    notes: [],
                    primary: {
                        noteId: 86,
                        primaryCardId: 87,
                        cardIds: [87],
                        state: 'known',
                        deckNames: ['Mining'],
                        modelName: 'Imported Core',
                        fields: { Word: lookupCard.spelling },
                        tags: [],
                        reps: 4,
                        lapses: 0,
                    },
                },
                jpdbDecks: [],
                ankiDecks: ['Mining'],
                jpdbVocabularyInfo: null,
            }, target);

            expect(target.classList.contains('anki-known')).toBe(true);
            expect(target.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(target.classList.contains('jpdb-pitch-unknown')).toBe(false);
            expect(target.dataset.pitchClass).toBe('heiban');
            expect(duplicate.classList.contains('anki-known')).toBe(false);
            expect(duplicate.classList.contains('jpdb-pitch-unknown')).toBe(true);
            expect(duplicate.dataset.pitchClass).toBeUndefined();
        } finally {
            target.remove();
            duplicate.remove();
            popover.remove();
            app.destroy();
        }
    });

    it('updates one rendered Anki word without scanning every rendered word in the document', () => {
        const app = new ReaderApp();
        const container = document.createElement('div');
        const lookupCard: JPDBCard = {
            ...card,
            vid: 902001,
            sid: 17,
            rid: 0,
            spelling: '索引',
            reading: 'さくいん',
            source: 'jpdb',
        };
        for (let index = 0; index < 2400; index += 1) {
            const word = document.createElement('span');
            word.className = 'jpdb-reader-word jpdb-not-in-deck';
            registerRenderedWordPrivateState(word, {
                vid: String(901000 + index),
                sid: String(index),
            });
            word.textContent = `単語${index}`;
            container.append(word);
        }
        const target = appendRenderedReaderWord(lookupCard, {
            className: 'jpdb-reader-word jpdb-not-in-deck',
            parent: container,
        });
        document.body.append(container);
        const querySelectorAll = vi.spyOn(Document.prototype, 'querySelectorAll');
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, wordTextColorSource: 'anki' };

        try {
            internals.applyAnkiLookupToRenderedWords(lookupCard, {
                state: 'known',
                notes: [],
                primary: {
                    noteId: 91,
                    primaryCardId: 92,
                    cardIds: [92],
                    state: 'known',
                    deckNames: ['Mining'],
                    modelName: 'Imported Core',
                    fields: { Word: lookupCard.spelling },
                    tags: [],
                    reps: 12,
                    lapses: 0,
                },
            });

            expect(target.classList.contains('anki-known')).toBe(true);
            expect(target.classList.contains('anki-deck-member')).toBe(true);
            expect(target.classList.contains('anki-deck-mining')).toBe(true);
            expect(target.classList.contains('yomu-deck-member')).toBe(false);
            expect(container.querySelectorAll('.jpdb-reader-word.anki-known')).toHaveLength(1);
            expect(querySelectorAll.mock.calls.map(call => call[0])).not.toContain('.jpdb-reader-word[data-vid][data-sid]');
        } finally {
            querySelectorAll.mockRestore();
            container.remove();
            app.destroy();
        }
    });

    it('refreshes rendered Anki color after grading updates the card status', async () => {
        const app = new ReaderApp();
        const lookupCard: JPDBCard = {
            ...card,
            vid: 902101,
            sid: 18,
            rid: 0,
            spelling: '採点',
            reading: 'さいてん',
            source: 'jpdb',
        };
        const word = appendRenderedReaderWord(lookupCard, {
            className: 'jpdb-reader-word jpdb-not-in-deck anki-due',
        });
        updateRenderedWordPrivateState(word, { ankiState: 'due', ankiDecks: 'Mining' });
        const refreshedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 92,
                primaryCardId: 93,
                cardIds: [93],
                state: 'known',
                deckNames: ['Mining'],
                modelName: 'Imported Core',
                fields: { Word: lookupCard.spelling },
                tags: [],
                reps: 13,
                lapses: 0,
            },
        };
        const findExistingCards = vi.fn(async (): Promise<AnkiLookupResult> => refreshedLookup);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            anki: { findExistingCards: typeof findExistingCards };
            refreshRenderedAnkiStatusAfterMutation(card: JPDBCard): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'anki',
        };
        internals.anki = { findExistingCards };

        try {
            await internals.refreshRenderedAnkiStatusAfterMutation(lookupCard);

            expect(findExistingCards).toHaveBeenCalledWith(lookupCard);
            expect(word.classList.contains('anki-due')).toBe(false);
            expectKnownRenderedAnkiWord(word, 'Mining');
            expect(word.title).toBe('Anki: Known (Mining)');
        } finally {
            word.remove();
            app.destroy();
        }
    });

    it('marks trusted Anki cache misses as not in deck during cache enrichment', async () => {
        const app = new ReaderApp();
        const token: JPDBToken = {
            card: {
                ...card,
                vid: 782,
                sid: 3,
                rid: 0,
                spelling: '解除',
                reading: 'かいじょ',
                source: 'jpdb',
            },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
        };
        const container = document.createElement('div');
        const word = appendKnownAnkiRenderedWord(token.card, { parent: container });
        document.body.append(container);
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [{
            state: 'not-in-deck',
            notes: [],
            primary: null,
        }]);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            enrichAnkiWords(tokens: JPDBToken[], roots?: ParentNode[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'anki',
        };
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.enrichAnkiWords([token], [container]);

            expectNotInDeckRenderedAnkiWord(word);
            expect(word.title).toContain('Anki:');
        } finally {
            container.remove();
            app.destroy();
        }
    });

    it('preserves rendered Anki color during untrusted cache enrichment misses', async () => {
        const app = new ReaderApp();
        const token: JPDBToken = {
            card: {
                ...card,
                vid: 783,
                sid: 3,
                rid: 0,
                spelling: '継続',
                reading: 'けいぞく',
                source: 'jpdb',
            },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
        };
        const container = document.createElement('div');
        const word = appendKnownAnkiRenderedWord(token.card, { parent: container });
        document.body.append(container);
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [{
            state: 'not-in-deck',
            notes: [],
            primary: null,
            trusted: false,
        }]);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            enrichAnkiWords(tokens: JPDBToken[], roots?: ParentNode[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'anki',
        };
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.enrichAnkiWords([token], [container]);

            expectKnownRenderedAnkiWord(word, 'Mining');
        } finally {
            container.remove();
            app.destroy();
        }
    });

    it('colors every unique rendered Anki token from cache beyond two thousand words', async () => {
        const app = new ReaderApp();
        const container = document.createElement('div');
        const tokenCount = 2405;
        const tokens: JPDBToken[] = Array.from({ length: tokenCount }, (_, index): JPDBToken => ({
            card: {
                ...card,
                vid: 880000 + index,
                sid: index,
                rid: 0,
                spelling: `確認${index}`,
                reading: 'かくにん',
                source: 'jpdb',
            },
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
        }));
        tokens.forEach(token => {
            appendRenderedReaderWord(token.card, {
                className: 'jpdb-reader-word jpdb-not-in-deck',
                parent: container,
            });
        });
        document.body.append(container);
        const findCachedStatusBatch = vi.fn(async (cards: JPDBCard[]): Promise<AnkiLookupResult[]> => cards.map((lookupCard, index) => ({
            state: 'known',
            notes: [],
            primary: {
                noteId: 9000 + index,
                primaryCardId: 9900 + index,
                cardIds: [9900 + index],
                state: 'known',
                deckNames: ['Cache'],
                modelName: 'Imported Core',
                fields: { Word: lookupCard.spelling },
                tags: [],
                reps: 1,
                lapses: 0,
            },
        })));
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            enrichAnkiWords(tokens: JPDBToken[], roots?: ParentNode[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'anki',
        };
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.enrichAnkiWords(tokens, [container]);

            expect(findCachedStatusBatch).toHaveBeenCalledTimes(1);
            const [lookedUpCards] = findCachedStatusBatch.mock.calls[0] ?? [];
            expect(lookedUpCards).toHaveLength(tokenCount);
            expect(lookedUpCards?.at(0)?.spelling).toBe('確認0');
            expect(lookedUpCards?.at(-1)?.spelling).toBe(`確認${tokenCount - 1}`);
            expect(container.querySelectorAll('.jpdb-reader-word.anki-known')).toHaveLength(tokenCount);
        } finally {
            container.remove();
            app.destroy();
        }
    });

    it('dedupes large warmup Anki recolor passes by card key instead of rendered word count', async () => {
        const app = new ReaderApp();
        const uniqueCount = 37;
        const repeatCount = 90;
        const { container, cards, findCachedStatusBatch } = createRepeatedAnkiWordCacheFixture({
            uniqueCount,
            repeatCount,
            vidStart: -910000,
            spellingPrefix: '反復',
            reading: 'はんぷく',
            noteIdStart: 9100,
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { cacheCards(cards: JPDBCard[]): void };
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            recolorRenderedAnkiWordsFromCache(root?: ParentNode): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'anki',
        };
        internals.parser.cacheCards(cards);
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.recolorRenderedAnkiWordsFromCache(container);

            expect(findCachedStatusBatch).toHaveBeenCalledTimes(1);
            const [lookedUpCards] = findCachedStatusBatch.mock.calls[0] ?? [];
            expect(lookedUpCards).toHaveLength(uniqueCount);
            expect(container.querySelectorAll('.jpdb-reader-word')).toHaveLength(uniqueCount * repeatCount);
            expect(container.querySelectorAll('.jpdb-reader-word.anki-known')).toHaveLength(uniqueCount * repeatCount);
        } finally {
            container.remove();
            app.destroy();
        }
    });

    it('reuses the rendered-word index for document warmup recolor instead of rescanning the page', async () => {
        const app = new ReaderApp();
        const uniqueCount = 48;
        const repeatCount = 60;
        const { container, cards, findCachedStatusBatch } = createRepeatedAnkiWordCacheFixture({
            uniqueCount,
            repeatCount,
            vidStart: -920000,
            spellingPrefix: '索引',
            reading: 'さくいん',
            noteIdStart: 9200,
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { cacheCards(cards: JPDBCard[]): void };
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            registerRenderedWordsInRoot(root: ParentNode): void;
            recolorRenderedAnkiWordsFromCache(root?: ParentNode): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'anki',
        };
        internals.parser.cacheCards(cards);
        internals.registerRenderedWordsInRoot(container);
        internals.anki = { findCachedStatusBatch };
        const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
        const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

        try {
            await internals.recolorRenderedAnkiWordsFromCache(document);

            expect(createTreeWalker).not.toHaveBeenCalled();
            expect(querySelectorAll.mock.calls.map(call => call[0])).not.toContain('.jpdb-reader-word[data-vid][data-sid]');
            expect(findCachedStatusBatch).toHaveBeenCalledTimes(1);
            const [lookedUpCards] = findCachedStatusBatch.mock.calls[0] ?? [];
            expect(lookedUpCards).toHaveLength(uniqueCount);
            expect(container.querySelectorAll('.jpdb-reader-word')).toHaveLength(uniqueCount * repeatCount);
            expect(container.querySelectorAll('.jpdb-reader-word.anki-known')).toHaveLength(uniqueCount * repeatCount);
        } finally {
            querySelectorAll.mockRestore();
            createTreeWalker.mockRestore();
            container.remove();
            app.destroy();
        }
    });

    it('does not full-scan the document when a large Anki lookup batch misses a partial rendered-word index', async () => {
        const app = new ReaderApp();
        const container = document.createElement('div');
        const uniqueCount = 36;
        const cards: JPDBCard[] = Array.from({ length: uniqueCount }, (_, index): JPDBCard => ({
            ...card,
            vid: -930000 - index,
            sid: -index - 1,
            rid: 0,
            spelling: `部分索引${index}`,
            reading: 'ぶぶんさくいん',
            source: 'local',
        }));
        cards.forEach(lookupCard => {
            appendRenderedReaderWord(lookupCard, {
                className: 'jpdb-reader-word jpdb-not-in-deck',
                parent: container,
            });
        });
        const indexedOnly = document.createElement('span');
        indexedOnly.className = 'jpdb-reader-word jpdb-not-in-deck';
        registerRenderedWordPrivateState(indexedOnly, { vid: '123456', sid: '789' });
        indexedOnly.textContent = '既存';
        container.append(indexedOnly);
        document.body.append(container);
        const tokens: JPDBToken[] = cards.map(lookupCard => ({
            card: lookupCard,
            start: 0,
            end: lookupCard.spelling.length,
            length: lookupCard.spelling.length,
            rubies: [],
            pitchClass: '',
            sentence: lookupCard.spelling,
        }));
        const findCachedStatusBatch = vi.fn(async (lookupCards: JPDBCard[]): Promise<AnkiLookupResult[]> => lookupCards.map((lookupCard, index) => ({
            state: 'known',
            notes: [],
            primary: {
                noteId: 9300 + index,
                primaryCardId: 9900 + index,
                cardIds: [9900 + index],
                state: 'known',
                deckNames: ['Cache'],
                modelName: 'Imported Core',
                fields: { Word: lookupCard.spelling },
                tags: [],
                reps: 1,
                lapses: 0,
            },
        })));
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            parser: { cacheCards(cards: JPDBCard[]): void };
            registerRenderedWord(word: HTMLElement): void;
            enrichAnkiWords(tokens: JPDBToken[], roots?: ParentNode[]): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            wordTextColorSource: 'anki',
        };
        internals.parser.cacheCards(cards);
        internals.registerRenderedWord(indexedOnly);
        internals.anki = { findCachedStatusBatch };
        const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
        const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

        try {
            await internals.enrichAnkiWords(tokens);

            expect(findCachedStatusBatch).toHaveBeenCalledTimes(1);
            expect(findCachedStatusBatch.mock.calls[0]?.[0]).toHaveLength(uniqueCount);
            expect(createTreeWalker).not.toHaveBeenCalled();
            expect(querySelectorAll.mock.calls.map(call => call[0])).not.toContain('.jpdb-reader-word[data-vid][data-sid]');
            expect(container.querySelectorAll('.jpdb-reader-word.anki-known')).toHaveLength(uniqueCount);
            expect(indexedOnly.classList.contains('anki-known')).toBe(false);
        } finally {
            querySelectorAll.mockRestore();
            createTreeWalker.mockRestore();
            container.remove();
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

    it('invalidates the connected exact-card popup when background pitch enrichment completes', async () => {
        const app = new ReaderApp();
        const lookupCard = testAozoraCard({ pitchAccent: [] });
        const token: JPDBToken = {
            card: lookupCard,
            start: 0,
            end: lookupCard.spelling.length,
            length: lookupCard.spelling.length,
            rubies: [],
            pitchClass: '',
            sentence: '青空です。',
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const publicPitch = vi.fn(async () => ['LHHH']);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            activePopoverMode: 'modal' | 'hover';
            lastCard: JPDBCard;
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup: typeof publicPitch };
            parsePopoverJapanese(): Promise<void>;
            renderCompletedCardPopover(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                data: CardRenderData,
            ): void;
            enrichPitchToken(token: JPDBToken, options?: { publicLookup?: boolean }): Promise<void>;
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.lastCard = lookupCard;
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false, showPitchAccent: true };
        internals.jpdbPublicPitch = { lookup: publicPitch };
        internals.parsePopoverJapanese = vi.fn(async () => undefined);

        try {
            internals.renderCompletedCardPopover(popover, lookupCard, token.sentence, 'modal', emptyCardRenderData());
            expect(popover.querySelector('.jpdb-reader-pitch-missing')).not.toBeNull();
            expect(popover.querySelector('.jpdb-reader-pitch svg')).toBeNull();
            expect(popover.querySelector('.jpdb-reader-spelling')?.classList.contains('jpdb-pitch-heiban')).toBe(false);

            await internals.enrichPitchToken(token, { publicLookup: true });

            expect(publicPitch).toHaveBeenCalledWith('青空', 'あおぞら');
            expect(popover.querySelector('.jpdb-reader-pitch')).not.toBeNull();
            expect(popover.querySelector<HTMLElement>('.jpdb-reader-spelling')?.dataset.pitchClass).toBe('heiban');
            expect(popover.querySelector('.jpdb-reader-spelling')?.classList.contains('jpdb-pitch-heiban')).toBe(true);
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('distinguishes exact canonical inflection evidence from unresolved sentence fragments', () => {
        const app = new ReaderApp();
        const internals = app as unknown as {
            isExactCanonicalFallbackResolution(fallback: JPDBCard, resolved: JPDBCard): boolean;
        };
        const resolved = (spelling: string, reading: string): JPDBCard => ({
            ...card,
            vid: 88001,
            sid: 0,
            rid: 0,
            spelling,
            reading,
            source: 'jiten',
            pitchAccent: ['LHH'],
        });

        try {
            expect(internals.isExactCanonicalFallbackResolution(testFallbackCard({
                vid: -51,
                sid: -51,
                spelling: '食べました',
                fallbackLookupTerms: ['食べる'],
            }), resolved('食べる', 'たべる'))).toBe(true);
            expect(internals.isExactCanonicalFallbackResolution(testFallbackCard({
                vid: -52,
                sid: -52,
                spelling: 'ざいます',
                fallbackLookupTerms: ['ざいます'],
            }), resolved('ございます', 'ございます'))).toBe(false);
            expect(internals.isExactCanonicalFallbackResolution(testFallbackCard({
                vid: -53,
                sid: -53,
                spelling: '来てく',
                fallbackLookupTerms: ['来てく'],
            }), resolved('来る', 'くる'))).toBe(false);
        } finally {
            app.destroy();
        }
    });

    it('refreshes an inflected surface popup when enrichment resolves an exact canonical card', async () => {
        const app = new ReaderApp();
        const surfaceCard = testFallbackCard({
            vid: -41,
            sid: -41,
            spelling: '食べました',
            reading: '',
            fallbackLookupTerms: ['食べる'],
            pitchAccent: [],
        });
        const canonicalCard: JPDBCard = {
            ...card,
            vid: 1554320,
            sid: 0,
            rid: 0,
            spelling: '食べる',
            reading: 'たべる',
            source: 'jiten',
            reviewSource: 'jiten-api',
            pitchAccent: ['LHH'],
        };
        const token: JPDBToken = {
            card: surfaceCard,
            start: 0,
            end: surfaceCard.spelling.length,
            length: surfaceCard.spelling.length,
            rubies: [],
            pitchClass: '',
            sentence: '昨日食べました。',
        };
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const showCard = vi.fn(async () => undefined);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            activePopoverMode: 'modal' | 'hover';
            activePopoverAnchor?: HTMLElement;
            lastCard: JPDBCard;
            lastCardSentence?: string;
            settings: typeof DEFAULT_SETTINGS;
            parsePopoverJapanese(): Promise<void>;
            pitchEnrichedRenderedCard(card: JPDBCard): Promise<JPDBCard>;
            renderCompletedCardPopover(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                data: CardRenderData,
            ): void;
            showCard: typeof showCard;
            enrichPitchToken(token: JPDBToken, options?: { publicLookup?: boolean }): Promise<void>;
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.lastCard = surfaceCard;
        internals.lastCardSentence = token.sentence;
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false, showPitchAccent: true };
        internals.parsePopoverJapanese = vi.fn(async () => undefined);
        internals.pitchEnrichedRenderedCard = vi.fn(async () => canonicalCard);
        internals.showCard = showCard;

        try {
            internals.renderCompletedCardPopover(popover, surfaceCard, token.sentence, 'modal', emptyCardRenderData());
            await internals.enrichPitchToken(token, { publicLookup: true });

            expect(token.card).toBe(canonicalCard);
            expect(showCard).toHaveBeenCalledWith(canonicalCard, token.sentence, undefined, expect.objectContaining({
                autoPlay: false,
                navigation: 'preserve',
                preservePosition: true,
                trigger: 'modal',
            }));
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('does not invalidate a superseded popup when late pitch enrichment completes', async () => {
        const app = new ReaderApp();
        const lookupCard = testAozoraCard({ pitchAccent: [] });
        const token: JPDBToken = {
            card: lookupCard,
            start: 0,
            end: lookupCard.spelling.length,
            length: lookupCard.spelling.length,
            rubies: [],
            pitchClass: '',
        };
        const oldPopover = document.createElement('div');
        oldPopover.className = 'jpdb-reader-popover';
        const replacementPopover = document.createElement('div');
        replacementPopover.className = 'jpdb-reader-popover';
        document.body.append(oldPopover, replacementPopover);
        const pitch = deferred<string[]>();
        const internals = app as unknown as {
            activePopover: HTMLElement;
            activePopoverMode: 'modal' | 'hover';
            lastCard: JPDBCard;
            settings: typeof DEFAULT_SETTINGS;
            jpdbPublicPitch: { lookup(): Promise<string[]> };
            parsePopoverJapanese(): Promise<void>;
            renderCompletedCardPopover(
                popover: HTMLElement,
                card: JPDBCard,
                sentence: string | undefined,
                trigger: 'modal' | 'hover',
                data: CardRenderData,
            ): void;
            enrichPitchToken(token: JPDBToken, options?: { publicLookup?: boolean }): Promise<void>;
        };
        internals.activePopover = oldPopover;
        internals.activePopoverMode = 'modal';
        internals.lastCard = lookupCard;
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false, showPitchAccent: true };
        internals.jpdbPublicPitch = { lookup: () => pitch.promise };
        internals.parsePopoverJapanese = vi.fn(async () => undefined);

        try {
            internals.renderCompletedCardPopover(oldPopover, lookupCard, undefined, 'modal', emptyCardRenderData());
            const enrichment = internals.enrichPitchToken(token, { publicLookup: true });
            internals.activePopover = replacementPopover;
            pitch.resolve(['LHHH']);
            await enrichment;

            expect(oldPopover.querySelector('.jpdb-reader-pitch-missing')).not.toBeNull();
            expect(oldPopover.querySelector('.jpdb-reader-pitch svg')).toBeNull();
            expect(replacementPopover.querySelector('.jpdb-reader-pitch')).toBeNull();
        } finally {
            oldPopover.remove();
            replacementPopover.remove();
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
        const secondRun = deferred<void>();
        const runPitchEnrichmentQueue = vi.fn(async () => {
            runs += 1;
            if (runs === 1) internals.queuePitchEnrichmentTokens([token]);
            else {
                internals.clearPitchEnrichmentQueue();
                await secondRun.promise;
            }
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
            let drainSettled = false;
            const drain = internals.drainPitchEnrichmentQueue().finally(() => {
                drainSettled = true;
            });

            await waitForExpect(() => expect(runPitchEnrichmentQueue).toHaveBeenCalledTimes(2));
            expect(drainSettled).toBe(false);

            secondRun.resolve(undefined);
            await drain;

            expect(drainSettled).toBe(true);
            expect(runPitchEnrichmentQueue).toHaveBeenCalledTimes(2);
        } finally {
            secondRun.resolve(undefined);
            app.destroy();
        }
    });

});
