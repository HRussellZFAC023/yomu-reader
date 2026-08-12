import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    CardPopoverRenderer,
    DEFAULT_SETTINGS,
    JpdbClient,
    ReaderApp,
    StudySourceController,
    card,
    createKanjiLocalParserFixture,
    createLocalPitchParserFixture,
    createMiningDrawerTestSurface,
    createPointerEvent,
    dispatchPenControlTap,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveSubtitleColorSource,
    emptyCardRenderData,
    fallbackDictionaryLookupTermsForText,
    fallbackLookupTermAtOffset,
    installMiningDrawerHandle,
    jitenTestCard,
    normalizeReaderSettings,
    parseSegmentedFallbackTokens,
    parsedProviderToken,
    popoverGradeButtons,
    readFormSettings,
    readerMetaText,
    readerWordSurfaceText,
    renderDefinitionSourcesStack,
    renderModalCard,
    renderSettingsForm,
    renderTokensToHtml,
    testCardActionController,
    testCardPopoverRenderer,
    testJitenAudioActionController,
    performTestJitenAudioAction,
    testReviewGradeController,
    tokenSpellings,
    withFakeSegmenter,
} from './fixtures';
import type {
    JPDBCard,
    JPDBToken,
    JitenApiClient,
} from './fixtures';
import { bindPrivateCommandCapability } from '../../../src/reader/dom/private-command-capabilities';

registerReaderHelpersCleanup();

async function performJitenSentenceAudio(controller: ReturnType<typeof testCardActionController>): Promise<void> {
    await expect(controller.perform({
        kind: 'card-action',
        action: 'jiten-audio',
        jitenSentenceId: 803776181,
        sentence: 'やがて、塗布も終えたのか。',
    }, document.createElement('button'), card)).resolves.toBe(false);
}

describe('reader helpers', () => {
    it('plays Jiten sentence TTS by sentence id using the selected Jiten voice', async () => {
        const { controller, playMediaUrl, playSentenceAudio } = testJitenAudioActionController({
            settings: {
                audioSources: [
                    { type: 'jiten-tts', url: '', voice: 'asmr', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            },
        });
        await performJitenSentenceAudio(controller);

        expect(playMediaUrl).toHaveBeenCalledTimes(1);
        expect(playMediaUrl).toHaveBeenCalledWith('https://api.jiten.moe/api/tts/sentence/803776181?voice=asmr');
        expect(playSentenceAudio).not.toHaveBeenCalled();
    });

    it('plays Jiten word TTS by word id and reading index for related word speakers', async () => {
        const playMediaUrl = vi.fn(async (_audioUrl: string): Promise<boolean | void> => true);
        const playSentenceAudio = vi.fn(async () => undefined);
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                audioSources: [
                    { type: 'jiten-tts', url: '', voice: 'female2', enabled: true },
                ],
            }),
            playMediaUrl,
            playSentenceAudio,
        });
        const button = document.createElement('button');
        button.dataset.jitenWordId = '1332760';
        button.dataset.jitenReadingIndex = '0';
        button.dataset.studySentence = '終える';

        await expect(controller.perform({ kind: 'card-action', action: 'jiten-audio', jitenWordId: 1332760, jitenReadingIndex: 0, sentence: '終える' }, button, card)).resolves.toBe(false);

        expect(playMediaUrl).toHaveBeenCalledTimes(1);
        expect(playMediaUrl).toHaveBeenCalledWith('https://api.jiten.moe/api/tts/word/1332760/0?voice=female2');
        expect(playSentenceAudio).not.toHaveBeenCalled();
    });

    it('tries random Jiten sentence voices before generic sentence TTS', async () => {
        const playMediaUrl = vi.fn(async (_audioUrl: string): Promise<boolean | void> => false);
        const { controller, playSentenceAudio } = testJitenAudioActionController({
            playMediaUrl,
            settings: {
                audioSources: [
                    { type: 'jiten-tts', url: '', voice: '', enabled: true },
                ],
            },
        });
        await performJitenSentenceAudio(controller);

        expect(playMediaUrl).toHaveBeenCalledTimes(5);
        expect(playMediaUrl.mock.calls.map(([url]) => url)).toEqual([
            'https://api.jiten.moe/api/tts/sentence/803776181?voice=female',
            'https://api.jiten.moe/api/tts/sentence/803776181?voice=female2',
            'https://api.jiten.moe/api/tts/sentence/803776181?voice=male',
            'https://api.jiten.moe/api/tts/sentence/803776181?voice=male2',
            'https://api.jiten.moe/api/tts/sentence/803776181?voice=asmr',
        ]);
        expect(playSentenceAudio).toHaveBeenCalledWith('やがて、塗布も終えたのか。');
    });

    it('falls back to sentence TTS when no Jiten audio URL plays', async () => {
        const playMediaUrl = vi.fn(async (_audioUrl: string): Promise<boolean | void> => true)
            .mockRejectedValueOnce(new Error('primary failed'))
            .mockRejectedValueOnce(new Error('backup failed'));
        const { controller, playSentenceAudio } = testJitenAudioActionController({ playMediaUrl });
        await performTestJitenAudioAction(controller);

        expect(playMediaUrl).toHaveBeenCalledTimes(2);
        expect(playSentenceAudio).toHaveBeenCalledWith('訓むこともある。');
    });

    it('switches from a visible Jiten card to an exact JPDB parse even when the saved preference is JPDB', async () => {
        const sourceCard = jitenTestCard({ spelling: '読む', reading: 'よむ', cardState: ['new'] });
        const jpdbCard: JPDBCard = {
            ...card,
            source: 'jpdb',
            vid: 777,
            sid: 3,
            spelling: '読む',
            reading: 'よむ',
            cardState: ['new'],
        };
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[{
            card: jpdbCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '読む',
        }]]);
        const refreshCardState = vi.fn(async () => undefined);
        const showCard = vi.fn(async () => undefined);
        const setApiGradingProvider = vi.fn();
        const invalidateCardData = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jitenApiKey: 'jiten-key',
                apiGradingProvider: 'jpdb',
                jpdbMiningEnabled: true,
                enableReviews: true,
            }),
            jpdb: { parse, refreshCardState } as unknown as JpdbClient,
            isJpdbBackedCard: lookupCard => lookupCard.source === 'jpdb' && lookupCard.vid > 0,
            showCard,
            setApiGradingProvider,
            invalidateCardData,
        });
        const button = document.createElement('button');
        button.dataset.action = 'grade-provider-toggle';

        await expect(controller.perform({ kind: 'card-action', action: 'grade-provider-toggle' }, button, sourceCard, '本を読む。')).resolves.toBe(false);

        expect(parse).toHaveBeenCalledWith(['読む']);
        expect(setApiGradingProvider).toHaveBeenCalledWith('jpdb');
        expect(refreshCardState).toHaveBeenCalledWith(jpdbCard);
        expect(invalidateCardData).toHaveBeenCalledTimes(1);
        expect(showCard).toHaveBeenCalledWith(jpdbCard, '本を読む。', undefined, expect.objectContaining({
            autoPlay: false,
            navigation: 'preserve',
            preservePosition: true,
        }));
    });

    it('does not submit JPDB review grades when JPDB writes are disabled', async () => {
        const { controller, reviewCard, answerCard, invalidateCardData, onAnkiStatusChanged } = testReviewGradeController({
            settings: {
                jpdbMiningEnabled: false,
                enableReviews: true,
            },
        });

        await expect(controller.reviewGrade('okay', card)).rejects.toThrow('API mining actions are disabled in settings.');
        expect(reviewCard).not.toHaveBeenCalled();
        expect(invalidateCardData).not.toHaveBeenCalled();
        expect(onAnkiStatusChanged).not.toHaveBeenCalled();

        await expect(controller.reviewGrade('okay', card, undefined, { ankiCardId: 20 })).resolves.toBeUndefined();
        expect(answerCard).toHaveBeenCalledWith(20, 'okay');
        expect(invalidateCardData).toHaveBeenCalledTimes(1);
        expect(onAnkiStatusChanged).toHaveBeenCalledWith(card);
    });

    it('submits locked JPDB review grades and allows explicit Anki card grading', async () => {
        const { controller, reviewCard, answerCard, invalidateCardData, onAnkiStatusChanged } = testReviewGradeController({
            settings: {
                jpdbMiningEnabled: true,
                enableReviews: true,
            },
        });

        const lockedCard: JPDBCard = { ...card, cardState: ['locked'] };
        await expect(controller.reviewGrade('okay', lockedCard)).resolves.toBeUndefined();
        expect(reviewCard).toHaveBeenCalledWith(lockedCard, 'okay');
        // API reviews now invalidate cached card data so page words recolor.
        expect(invalidateCardData).toHaveBeenCalledTimes(1);
        expect(onAnkiStatusChanged).not.toHaveBeenCalled();

        await expect(controller.reviewGrade('okay', lockedCard, undefined, { ankiCardId: 20 })).resolves.toBeUndefined();
        expect(answerCard).toHaveBeenCalledWith(20, 'okay');
        expect(invalidateCardData).toHaveBeenCalledTimes(2);
        expect(onAnkiStatusChanged).toHaveBeenCalledWith(lockedCard);
    });

    it('submits one popover grade to both JPDB and the selected Anki card', async () => {
        const { controller, addToDeck, reviewCard, answerCard, invalidateCardData, onAnkiStatusChanged } = testReviewGradeController({
            settings: {
                ankiEnabled: true,
                ankiSectionEnabled: true,
                jpdbMiningEnabled: true,
                enableReviews: true,
            },
        });

        await expect(controller.reviewGrade('okay', card, undefined, { target: 'both', ankiCardId: 20 })).resolves.toBeUndefined();

        expect(addToDeck).toHaveBeenCalledWith(DEFAULT_SETTINGS.miningDeck, card, undefined);
        expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
        expect(answerCard).toHaveBeenCalledWith(20, 'okay');
        // Once for the API review (page-word recolor), once for the Anki answer.
        expect(invalidateCardData).toHaveBeenCalledTimes(2);
        expect(onAnkiStatusChanged).toHaveBeenCalledWith(card);
    });

    it('batch grades mining candidates through the shared review path', async () => {
        const addToDeck = vi.fn(async () => undefined);
        const reviewCard = vi.fn(async () => undefined);
        const toast = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
            }),
            jpdb: { addToDeck, reviewCard } as unknown as JpdbClient,
            toast,
        });
        const notInDeckCard: JPDBCard = { ...card, spelling: '読む', reading: 'よむ', cardState: ['not-in-deck'] };
        const newCard: JPDBCard = { ...card, vid: 2, spelling: '書く', reading: 'かく', cardState: ['new'] };

        await expect(controller.reviewBatchMiningCards([
            { card: notInDeckCard, sentence: '本を読む。' },
            { card: newCard, sentence: '字を書く。' },
        ], 'pass')).resolves.toBe(2);

        expect(addToDeck).toHaveBeenCalledTimes(1);
        expect(addToDeck).toHaveBeenCalledWith(DEFAULT_SETTINGS.miningDeck, notInDeckCard, '本を読む。');
        expect(reviewCard).toHaveBeenCalledWith(notInDeckCard, 'pass');
        expect(reviewCard).toHaveBeenCalledWith(newCard, 'pass');
        expect(toast).not.toHaveBeenCalled();
    });

    it('allows locked JPDB cards to be added to the mining deck', async () => {
        const addToDeck = vi.fn(async () => undefined);
        const toast = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                ankiEnabled: false,
                jpdbMiningEnabled: true,
            }),
            jpdb: { addToDeck } as unknown as JpdbClient,
            toast,
        });
        const button = document.createElement('button');
        button.dataset.action = 'add';
        button.dataset.deckId = 'forq';
        const lockedCard: JPDBCard = { ...card, cardState: ['locked'] };

        await expect(controller.perform({ kind: 'card-action', action: 'add', deckSource: 'jpdb', deckId: 'forq' }, button, lockedCard, '食べる。')).resolves.toBe(true);

        expect(addToDeck).toHaveBeenCalledWith('forq', lockedCard, '食べる。');
        expect(toast).toHaveBeenCalledWith('Added to JPDB.');
    });

    it('renders Jiten-native mining controls with Jiten study deck choices', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: 'jiten-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
            }),
            isJpdbBackedCard: () => false,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
            accountDataSurfaceTrusted: () => true,
        });
        const html = renderer.render(jitenTestCard(), '本を読みます。', 'modal', emptyCardRenderData({
            jitenDecks: [{ id: '12', name: 'Mining' }],
        }));
        const mount = document.createElement('div');
        mount.innerHTML = html;

        expect(html).toContain('Jiten New');
        expect(html).toContain('data-deck-source="jiten"');
        expect(html).toContain('data-deck-id="12"');
        expect(html).toContain('Jiten: Mining');
        expect(html).toContain('jpdb-reader-actions-mining-collapsed');
        expect(mount.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
        expect(mount.querySelector('[data-review-target-gutter]')).not.toBeNull();
        expect(mount.querySelector('[data-review-target-current]')).toBeNull();
        expect(mount.querySelector<HTMLButtonElement>('[data-review-target-gutter] [data-action="mining-collapse"]')?.getAttribute('aria-expanded')).toBe('false');
        expect(mount.querySelector('[data-review-target-label]')?.classList.contains('jpdb-reader-sr-only')).toBe(true);
        expect(mount.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Jiten');
        expect(mount.querySelector<HTMLButtonElement>('[data-action="grade"][data-grade="okay"]')?.dataset.reviewTarget).toBe('jiten');
        expect(mount.querySelector<HTMLButtonElement>('[data-action="grade"][data-grade="okay"]')?.getAttribute('aria-label')).toBe('Okay: Grades Jiten');
        expect(mount.querySelector<HTMLButtonElement>('[data-action="grade"][data-grade="okay"]')?.title).toBe('Grades Jiten');
    });

    it('renders Bunpro-backed review and direct mining controls without a provider toggle', () => {
        const renderer = testCardPopoverRenderer({
            bunproFrontendApiToken: 'bunpro-token',
            bunproMiningEnabled: true,
            enableReviews: true,
        });
        const bunproCard: JPDBCard = {
            ...card,
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '123',
            bunproReviewableId: 456,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '44',
            bunproReviewInputMode: 'fsrs',
            bunproReviewEndpoint: 'review',
            cardState: ['due'],
        };

        document.body.innerHTML = renderModalCard(renderer, bunproCard, 'ご飯を食べる。');

        expect(readerMetaText()).toContain('Bunpro');
        expect(document.querySelector('[data-action="grade-provider-toggle"]')).toBeNull();
        expect(popoverGradeButtons().every(button => button.dataset.reviewTarget === 'bunpro')).toBe(true);
        expect(document.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Bunpro');
        expect(document.querySelector<HTMLButtonElement>('.jpdb-reader-mining-title[data-action="add"]')).toBeNull();
        expect(document.querySelector<HTMLButtonElement>('.jpdb-reader-mining-title[data-action="deck-picker"]')).not.toBeNull();
        expect(document.querySelector<HTMLOptionElement>('[data-deck-source="bunpro"]')?.dataset.deckId).toBe('bunpro');
    });

    it('offers Bunpro mining for words and grammar but not sentence reviewables', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: '',
            jitenApiKey: '',
            yomuLocalSrsEnabled: false,
            ankiEnabled: false,
            bunproFrontendApiToken: 'bunpro-token',
            bunproMiningEnabled: true,
        });
        const renderType = (bunproReviewableType: JPDBCard['bunproReviewableType']) => renderModalCard(renderer, {
            ...card,
            source: 'bunpro',
            reviewSource: undefined,
            bunproReviewableType,
            cardState: ['not-in-deck'],
        }, '日本語を勉強します。');

        document.body.innerHTML = renderType('vocabulary');
        expect(document.querySelector('[data-deck-source="bunpro"]')).not.toBeNull();
        document.body.innerHTML = renderType('grammar');
        expect(document.querySelector('[data-deck-source="bunpro"]')).not.toBeNull();
        document.body.innerHTML = renderType('sentence');
        expect(document.querySelector('[data-deck-source="bunpro"]')).toBeNull();
    });

    it('renders local Yomu SRS mining and review controls without external accounts', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: '',
            jitenApiKey: '',
            bunproFrontendApiToken: '',
            yomuLocalSrsEnabled: true,
            enableReviews: true,
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }],
            cardState: ['not-in-deck'],
        }, 'ご飯を食べる。');

        expect(readerMetaText()).not.toContain('Yomu');
        expect(document.querySelector('[data-action="grade-provider-toggle"]')).toBeNull();
        expect(popoverGradeButtons().every(button => button.dataset.reviewTarget === 'yomu-local')).toBe(true);
        expect(document.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Academy');
        const addButton = document.querySelector<HTMLButtonElement>('.jpdb-reader-mining-title[data-action="add"]');
        expect(addButton?.dataset.deckSource).toBe('yomu-local');
    });

    it('keeps dictionary, Immersion Kit, and study source stacks available for Jiten-backed cards', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbDefinitionsEnabled: false,
            localDictionariesEnabled: true,
            immersionKitEnabled: true,
            studyTranslationEnabled: true,
            studyGrammarEnabled: true,
            dictionaryPreferences: [{
                name: 'Jitendex',
                alias: 'Jitendex',
                enabled: true,
                priority: 0,
            }],
        };
        const sourceAttributes = (key: string, initiallyExpanded?: boolean): string => [
            `data-source-state="${key}"`,
            initiallyExpanded === undefined ? '' : `data-source-initial-open="${String(initiallyExpanded)}"`,
        ].filter(Boolean).join(' ');
        const studySources = new StudySourceController({
            getSettings: () => settings,
            dictionarySourceAttributes: sourceAttributes,
            parseJapanese: vi.fn(async () => [[]]),
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            isCurrentPopoverRoot: () => true,
        });
        const html = renderDefinitionSourcesStack({
            card: jitenTestCard(),
            entries: [{
                expression: '読む',
                reading: 'よむ',
                glossary: ['to read'],
                dictionary: 'Jitendex',
            }],
            settings,
            sourceAttributes,
            dictionaryLabel: name => settings.dictionaryPreferences.find(item => item.name === name)?.alias || name,
            noDefinitionsHtml: () => 'none',
            sentence: '本を読みます。',
            extraSectionsOrOptions: { includeJpdbSource: false },
            renderTranslationSource: sentence => studySources.renderTranslationSource(sentence),
            renderGrammarSource: sentence => studySources.renderGrammarSource(sentence),
        });

        expect(html).toContain('data-source="local-dictionary"');
        const root = document.createElement('div');
        root.innerHTML = html;
        const localDictionary = root.querySelector<HTMLElement>('[data-source="local-dictionary"][data-dictionary="Jitendex"]');

        expect(localDictionary).not.toBeNull();
        expect(html).toContain('data-dictionary="Jitendex"');
        expect(html).toContain('data-immersion-kit');
        expect(html).toContain('data-study-translation');
        expect(html).toContain('data-study-grammar');
        expect(html).toContain('本を読みます。');
        expect(html).not.toContain('data-source-state="definition-source:__jpdb__"');
    });

    it('mines and reviews Jiten-backed cards through the Jiten API provider', async () => {
        const addToStudyDeck = vi.fn(async () => undefined);
        const reviewCard = vi.fn(async () => undefined);
        const setVocabularyState = vi.fn(async () => undefined);
        const addToDeck = vi.fn(async () => undefined);
        const toast = vi.fn();
        document.title = 'Example Page';
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: 'jiten-key',
                ankiEnabled: false,
                jpdbMiningEnabled: true,
                enableReviews: true,
            }),
            jpdb: { addToDeck } as unknown as JpdbClient,
            jiten: { addToStudyDeck, reviewCard, setVocabularyState } as unknown as JitenApiClient,
            isJpdbBackedCard: () => false,
            toast,
        });
        const button = document.createElement('button');
        button.dataset.action = 'add';
        button.dataset.deckSource = 'jiten';
        button.dataset.deckId = '12';
        const jitenCard = jitenTestCard();

        await expect(controller.perform({ kind: 'card-action', action: 'add', deckSource: 'jiten', deckId: '12' }, button, jitenCard, '本を読みます。')).resolves.toBe(true);
        await expect(controller.reviewGrade('pass', jitenCard, '本を読みます。')).resolves.toBeUndefined();
        await expect(controller.perform({ kind: 'card-action', action: 'neverforget' }, document.createElement('button'), jitenCard)).resolves.toBe(true);

        expect(addToStudyDeck).toHaveBeenCalledWith('12', jitenCard, '本を読みます。', 'Example Page');
        expect(reviewCard).toHaveBeenCalledWith(jitenCard, 'pass');
        expect(setVocabularyState).toHaveBeenCalledWith(jitenCard, 'neverForget', 'add');
        expect(addToDeck).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Added to Jiten.');
    });

    it('mines and reviews Bunpro-backed cards through the Bunpro SRS adapter', async () => {
        const mine = vi.fn(async () => ({}));
        const review = vi.fn(async () => ({}));
        const toast = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                bunproFrontendApiToken: 'bunpro-token',
                bunproMiningEnabled: true,
                enableReviews: true,
            }),
            srsAdapters: {
                bunpro: {
                    id: 'bunpro',
                    label: 'Bunpro',
                    capabilities: { stats: true, queue: true, review: true, mine: true, import: false },
                    hasCredential: () => true,
                    verify: vi.fn(),
                    stats: vi.fn(),
                    queue: vi.fn(),
                    review,
                    mine,
                } as never,
            },
            isJpdbBackedCard: () => false,
            toast,
        });
        const bunproCard: JPDBCard = {
            ...card,
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '123',
            bunproReviewableId: 456,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '44',
            bunproReviewInputMode: 'fsrs',
            bunproReviewEndpoint: 'review',
            meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }],
            cardState: ['due'],
        };
        const button = document.createElement('button');
        button.dataset.action = 'add';
        button.dataset.deckSource = 'bunpro';

        await expect(controller.perform({ kind: 'card-action', action: 'add', deckSource: 'bunpro' }, button, { ...bunproCard, cardState: ['not-in-deck'] }, 'ご飯を食べる。')).resolves.toBe(true);
        await expect(controller.reviewGrade('okay', bunproCard, 'ご飯を食べる。', { target: 'bunpro' })).resolves.toBeUndefined();

        expect(mine).toHaveBeenCalledWith(expect.objectContaining({
            expression: '食べる',
            reading: 'たべる',
            meaning: 'to eat',
            sentence: 'ご飯を食べる。',
            kind: 'vocabulary',
        }));
        expect(review).toHaveBeenCalledWith(expect.objectContaining({
            grade: 'okay',
            sentence: 'ご飯を食べる。',
            card: expect.objectContaining({
                providerId: 'bunpro',
                providerCardId: '123',
                providerReviewId: '123',
                providerReviewableId: '456',
                kind: 'vocabulary',
            }),
        }));
        expect(toast).toHaveBeenCalledWith('Added to Bunpro.');
    });

    it('mines an ordinary popup word to Bunpro without fabricating a gradeable review', async () => {
        const mine = vi.fn(async () => ({}));
        const review = vi.fn(async () => ({}));
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                ankiEnabled: false,
                yomuLocalSrsEnabled: false,
                bunproFrontendApiToken: 'bunpro-token',
                bunproMiningEnabled: true,
            }),
            srsAdapters: {
                bunpro: {
                    id: 'bunpro',
                    label: 'Bunpro',
                    capabilities: { stats: true, queue: true, review: true, mine: true, import: false },
                    hasCredential: () => true,
                    verify: vi.fn(),
                    stats: vi.fn(),
                    queue: vi.fn(),
                    review,
                    mine,
                } as never,
            },
            isJpdbBackedCard: () => false,
        });
        const pageCard: JPDBCard = {
            ...card,
            source: 'local',
            meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }],
            cardState: ['not-in-deck'],
        };
        const button = document.createElement('button');
        button.dataset.action = 'add';
        button.dataset.deckSource = 'bunpro';

        await expect(controller.perform({ kind: 'card-action', action: 'add', deckSource: 'bunpro' }, button, pageCard, 'ご飯を食べる。')).resolves.toBe(true);
        expect(mine).toHaveBeenCalledWith(expect.objectContaining({
            expression: '食べる',
            reading: 'たべる',
            kind: 'vocabulary',
        }));
        expect(review).not.toHaveBeenCalled();
        expect(pageCard.bunproReviewId).toBeUndefined();
    });

    it('mines and reviews page words through the local Yomu SRS adapter without accounts', async () => {
        const mine = vi.fn(async () => ({}));
        const review = vi.fn(async () => ({}));
        const addToDeck = vi.fn(async () => undefined);
        const toast = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                ankiEnabled: false,
                yomuLocalSrsEnabled: true,
                enableReviews: true,
            }),
            jpdb: { addToDeck } as unknown as JpdbClient,
            srsAdapters: {
                'yomu-local': {
                    id: 'yomu-local',
                    label: 'Academy',
                    capabilities: { stats: true, queue: true, review: true, mine: true, import: true },
                    hasCredential: () => true,
                    verify: vi.fn(),
                    stats: vi.fn(),
                    queue: vi.fn(),
                    review,
                    mine,
                } as never,
            },
            toast,
        });
        const localCard: JPDBCard = {
            ...card,
            meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }],
            cardState: ['not-in-deck'],
        };
        const button = document.createElement('button');
        button.dataset.action = 'add';
        button.dataset.deckSource = 'yomu-local';

        await expect(controller.perform({ kind: 'card-action', action: 'add', deckSource: 'yomu-local' }, button, localCard, 'ご飯を食べる。')).resolves.toBe(true);
        await expect(controller.reviewGrade('okay', localCard, 'ご飯を食べる。', { target: 'yomu-local' })).resolves.toBeUndefined();

        expect(mine).toHaveBeenCalledWith(expect.objectContaining({
            expression: '食べる',
            reading: 'たべる',
            meaning: 'to eat',
            sentence: 'ご飯を食べる。',
            kind: 'vocabulary',
        }));
        expect(review).toHaveBeenCalledWith(expect.objectContaining({
            grade: 'okay',
            sentence: 'ご飯を食べる。',
            card: expect.objectContaining({
                providerId: 'yomu-local',
                providerCardId: '食べる\u0000たべる',
                providerReviewId: '食べる\u0000たべる',
                kind: 'vocabulary',
            }),
        }));
        expect(addToDeck).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Added to Academy.');
        expect(toast).toHaveBeenCalledWith('Added to deck and reviewed.');
    });

    it('says when captured media cannot follow a mine into a Jiten deck (no media API)', async () => {
        const addToStudyDeck = vi.fn(async () => undefined);
        const toast = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: 'jiten-key',
                ankiEnabled: false,
                jpdbMiningEnabled: true,
            }),
            jiten: { addToStudyDeck } as unknown as JitenApiClient,
            isJpdbBackedCard: () => false,
            resolveMiningContext: vi.fn(async () => ({
                sentence: '本を読みます。',
                imageDataUrl: 'data:image/png;base64,abc',
                sourceTitle: 'Example Page',
                sourceUrl: 'https://example.com',
            })) as never,
            toast,
        });
        const button = document.createElement('button');
        button.dataset.action = 'add';
        button.dataset.deckSource = 'jiten';
        button.dataset.deckId = '12';

        await expect(controller.perform({ kind: 'card-action', action: 'add', deckSource: 'jiten', deckId: '12' }, button, jitenTestCard(), '本を読みます。')).resolves.toBe(true);

        const message = String(toast.mock.calls.at(-1)?.[0] ?? '');
        expect(message).toContain('Added to Jiten.');
        // The captured image is NOT silently dropped: Jiten has no media API.
        expect(message).toContain('no media API');
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

        popover.querySelector<HTMLElement>('.jpdb-reader-actions-gutter')?.click();
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(false);
        expect(handle.getAttribute('aria-expanded')).toBe('true');

        handle.click();
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
        expect(handle.getAttribute('aria-expanded')).toBe('false');

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
        popover.remove();
    });

    it('routes pass-through mining drawer gestures instead of opening words underneath', () => {
        const { app, popover, actions, handle } = createMiningDrawerTestSurface(`
            <div class="jpdb-reader-actions jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed">
                <div class="jpdb-reader-actions-gutter">
                    <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="Show mining actions" aria-label="Show mining actions"></button>
                </div>
                <span class="jpdb-reader-word" data-expression="食べる" data-reading="たべる" data-sentence="食べる。">食べる</span>
                <div class="jpdb-reader-mining-details"></div>
            </div>
        `);

        const word = popover.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showWord = vi.fn(async () => undefined);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            activePopoverMode: 'modal';
            settings: typeof DEFAULT_SETTINGS;
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.showWord = showWord;
        internals.bindEvents();
        const setExpanded = (button: HTMLButtonElement, expanded: boolean): void => {
            actions.classList.toggle('jpdb-reader-actions-mining-collapsed', !expanded);
            button.setAttribute('aria-expanded', String(expanded));
        };
        installMiningDrawerHandle(popover, setExpanded);

        const originalElementsFromPoint = document.elementsFromPoint;
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn(() => [handle, word]),
        });

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 80, clientY: 180 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(showWord).not.toHaveBeenCalled();
            expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(false);
            expect(handle.getAttribute('aria-expanded')).toBe('true');

            const dragDownStart = Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 180, pointerId: 21, button: 0 });
            const dragDownMove = Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 226, pointerId: 21 });
            const dragDownEnd = Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), { clientX: 80, clientY: 226, pointerId: 21 });
            word.dispatchEvent(dragDownStart);
            document.dispatchEvent(dragDownMove);
            document.dispatchEvent(dragDownEnd);

            expect(dragDownStart.defaultPrevented).toBe(true);
            expect(showWord).not.toHaveBeenCalled();
            expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
            expect(handle.getAttribute('aria-expanded')).toBe('false');
        } finally {
            if (originalElementsFromPoint) {
                Object.defineProperty(document, 'elementsFromPoint', {
                    configurable: true,
                    value: originalElementsFromPoint,
                });
            } else {
                delete (document as unknown as { elementsFromPoint?: typeof document.elementsFromPoint }).elementsFromPoint;
            }
            app.destroy();
            popover.remove();
        }
    });

    it('installs mining drawer drag gestures on normal word popovers with review target gutters', () => {
        const { app, popover, actions, handle } = createMiningDrawerTestSurface(`
            <div class="jpdb-reader-actions jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed">
                <div class="jpdb-reader-actions-gutter jpdb-reader-review-target-gutter" data-review-target-gutter>
                    <button type="button" class="jpdb-reader-provider-toggle" data-action="grade-provider-toggle" aria-label="Switch grading provider (Jiten)">⇄<span class="jpdb-reader-review-target-current" data-review-target-current aria-label="Grades JPDB">JPDB</span></button>
                    <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="Show mining actions" aria-label="Show mining actions"></button>
                </div>
                <div class="jpdb-reader-mining-panel"></div>
            </div>
        `);

        const gutter = popover.querySelector<HTMLElement>('[data-review-target-gutter]')!;
        const providerToggle = popover.querySelector<HTMLButtonElement>('[data-action="grade-provider-toggle"]')!;
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            installCardPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.installCardPopoverHandlers(popover, card, '食べる。', undefined, 'modal');

        try {
            const providerClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 72, clientY: 180 });
            providerToggle.dispatchEvent(providerClick);
            expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
            expect(handle.getAttribute('aria-expanded')).toBe('false');

            const providerLabel = popover.querySelector<HTMLElement>('[data-review-target-current]')!;
            const labelClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 90, clientY: 180 });
            providerLabel.dispatchEvent(labelClick);
            expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
            expect(handle.getAttribute('aria-expanded')).toBe('false');

            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 80, clientY: 180 });
            gutter.dispatchEvent(click);
            expect(click.defaultPrevented).toBe(true);
            expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(false);
            expect(handle.getAttribute('aria-expanded')).toBe('true');

            const dragStart = createPointerEvent('pointerdown', { clientX: 80, clientY: 180, pointerId: 31, button: 0 });
            const dragMove = createPointerEvent('pointermove', { clientX: 80, clientY: 226, pointerId: 31 });
            const dragEnd = createPointerEvent('pointerup', { clientX: 80, clientY: 226, pointerId: 31 });
            gutter.dispatchEvent(dragStart);
            document.dispatchEvent(dragMove);
            document.dispatchEvent(dragEnd);

            expect(dragStart.defaultPrevented).toBe(true);
            expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
            expect(handle.getAttribute('aria-expanded')).toBe('false');
        } finally {
            app.destroy();
            popover.remove();
        }
    });

    it('activates popup links from Apple Pencil pointer taps without double-clicking', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = '<a href="https://example.test/dictionary" data-test-popup-link>Dictionary</a>';
        document.body.append(popover);
        const link = popover.querySelector<HTMLAnchorElement>('[data-test-popup-link]')!;
        const clicks = vi.fn((event: MouseEvent) => event.preventDefault());
        link.addEventListener('click', clicks);
        const internals = app as unknown as {
            installReaderControlPointerActivation(root: HTMLElement): void;
        };
        internals.installReaderControlPointerActivation(popover);

        try {
            const up = dispatchPenControlTap(link, 41);
            expect(up.defaultPrevented).toBe(true);
            expect(clicks).toHaveBeenCalledTimes(1);

            const duplicateClick = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 25,
                clientY: 18,
                detail: 1,
            });
            link.dispatchEvent(duplicateClick);
            expect(duplicateClick.defaultPrevented).toBe(true);
            expect(clicks).toHaveBeenCalledTimes(1);
        } finally {
            app.destroy();
            popover.remove();
        }
    });

    it('activates popup kanji buttons and trace toggles from Apple Pencil pointer taps', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <button type="button" data-action="kanji" data-kanji="読">読</button>
            <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-trace>Show trace</button>
        `;
        document.body.append(popover);
        const kanjiButton = popover.querySelector<HTMLButtonElement>('[data-action="kanji"]')!;
        bindPrivateCommandCapability(kanjiButton, { kind: 'kanji-lookup', kanji: '読' });
        const trace = popover.querySelector<HTMLButtonElement>('[data-doodle-trace]')!;
        const anchor = document.createElement('span');
        const showKanjiCard = vi.fn(async () => undefined);
        trace.addEventListener('click', () => {
            trace.textContent = trace.textContent === 'Show trace' ? 'Hide trace' : 'Show trace';
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showKanjiCard: typeof showKanjiCard;
            installCardPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.showKanjiCard = showKanjiCard;
        internals.installCardPopoverHandlers(popover, card, '読む。', anchor, 'modal');

        try {
            const kanjiUp = dispatchPenControlTap(kanjiButton, 42);
            expect(kanjiUp.defaultPrevented).toBe(true);
            expect(showKanjiCard).toHaveBeenCalledTimes(1);
            expect(showKanjiCard).toHaveBeenCalledWith(card, '読', '読む。', anchor, { preservePosition: true });

            const traceUp = dispatchPenControlTap(trace, 43);
            expect(traceUp.defaultPrevented).toBe(true);
            expect(trace.textContent).toBe('Hide trace');

            const duplicateTraceClick = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 25,
                clientY: 18,
                detail: 1,
            });
            trace.dispatchEvent(duplicateTraceClick);
            expect(duplicateTraceClick.defaultPrevented).toBe(true);
            expect(trace.textContent).toBe('Hide trace');
        } finally {
            app.destroy();
            popover.remove();
        }
    });

    it('uses concrete color-channel defaults while preserving legacy automatic choices', () => {
        // A20: Yomu's own deck feeds the state channel, so the "nothing can
        // answer what I know" cases have to switch it off to stay about that.
        const deckless = { ...DEFAULT_SETTINGS, yomuLocalSrsEnabled: false };
        expect(effectiveReaderColorSource(deckless, 'auto')).toBe('off');
        expect(effectiveReaderColorSource(deckless, 'auto', 'pitch')).toBe('pitch');
        expect(effectiveReaderColorSource({ ...deckless, wordHighlightMode: 'pitch' }, 'auto')).toBe('pitch');
        expect(effectiveReaderColorSource({ ...DEFAULT_SETTINGS, apiKey: 'key', ankiEnabled: true, wordHighlightMode: 'status' }, 'auto')).toBe('jpdb');
        expect(effectiveReaderColorSource({ ...deckless, wordHighlightMode: 'status' }, 'auto')).toBe('off');
        expect(effectiveReaderColorSource({ ...deckless, wordHighlightMode: 'off' }, 'auto')).toBe('off');
        expect(effectiveReaderColorSource({ ...DEFAULT_SETTINGS, ankiEnabled: true }, 'anki')).toBe('anki');
        expect(effectiveReaderColorSource(deckless, 'anki')).toBe('off');
        expect(effectiveSubtitleColorSource({ ...DEFAULT_SETTINGS, apiKey: 'key', wordHighlightMode: 'status' }, 'auto')).toBe('jpdb');
        expect(effectiveSubtitleColorSource({ ...deckless, wordHighlightMode: 'pitch' }, 'auto')).toBe('pitch');
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
        expect(DEFAULT_SETTINGS.wordHighlightColorSource).toBe('jpdb');
        expect(DEFAULT_SETTINGS.wordUnderlineColorSource).toBe('pitch');
        expect(DEFAULT_SETTINGS.wordTextColorSource).toBe('anki');
        expect(DEFAULT_SETTINGS.subtitleHighlightColorSource).toBe('jpdb');
        expect(DEFAULT_SETTINGS.subtitleUnderlineColorSource).toBe('pitch');
        expect(DEFAULT_SETTINGS.subtitleTextColorSource).toBe('anki');
        expect('wordHighlightMode' in DEFAULT_SETTINGS).toBe(false);
    });

    it('renders color-channel settings as concrete options and saves them back', () => {
        const form = document.createElement('form');
        // An API key so the status labels name JPDB; the keyless case names the
        // local deck instead and is covered in the settings-form suite.
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key' }, 'https://jpdb.io/settings');
        const expected = {
            wordHighlightColorSource: 'jpdb',
            wordUnderlineColorSource: 'pitch',
            wordTextColorSource: 'anki',
            subtitleHighlightColorSource: 'jpdb',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'anki',
        } as const;
        const expectedLabels = [
            'All study statuses',
            'Primary deck status',
            'Anki status',
            'Pitch accent',
            'None',
        ];

        Object.entries(expected).forEach(([name, value]) => {
            const select = form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
            expect(select?.value).toBe(value);
            expect(Array.from(select?.options ?? []).map(option => option.value)).toEqual(['status', 'jpdb', 'anki', 'pitch', 'off']);
            expect(Array.from(select?.options ?? []).map(option => option.textContent)).toEqual(expectedLabels);
        });
        expect(form.querySelector<HTMLSelectElement>('select[name="wordHighlightMode"]')).toBeNull();

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved).toMatchObject(expected);
    });

    // A11: the shipped default reads every parsed word, and legacy 'auto' lands
    // on a mode the surrounding UI can explain.
    it('defaults furigana to every parsed word and migrates legacy automatic mode to concrete behavior (UT-47)', () => {
        expect(DEFAULT_SETTINGS.furiganaMode).toBe('all');
        expect(effectiveFuriganaMode(DEFAULT_SETTINGS)).toBe('all');
        expect(normalizeReaderSettings({ apiKey: '', ankiEnabled: false, yomuLocalSrsEnabled: false, furiganaMode: 'auto' }).furiganaMode).toBe('all');
        expect(normalizeReaderSettings({ apiKey: '', ankiEnabled: false, yomuLocalSrsEnabled: true, furiganaMode: 'auto' }).furiganaMode).toBe('all');
        expect(normalizeReaderSettings({ apiKey: 'key', ankiEnabled: false, jpdbMiningEnabled: false, furiganaMode: 'auto' }).furiganaMode).toBe('all');
        expect(normalizeReaderSettings({ apiKey: '', jitenApiKey: 'jiten-key', ankiEnabled: false, furiganaMode: 'auto' }).furiganaMode).toBe('all');
        expect(normalizeReaderSettings({ apiKey: '', ankiEnabled: true, furiganaMode: 'auto' }).furiganaMode).toBe('all');
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

        // A11: difficulty hiding is now something a learner picks, so this
        // asks for it by name instead of reaching it through legacy 'auto'.
        expect(renderTokensToHtml('日本', [easyToken], { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode: 'difficult-kanji' }))
            .not.toContain('<rt');
        expect(renderTokensToHtml('日本', [easyToken], { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'jiten-key', ankiEnabled: false, furiganaMode: 'auto' }))
            .toContain('<rt class="jpdb-reader-furi">にほん</rt>');
        expect(renderTokensToHtml('鬱', [difficultToken], { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode: 'difficult-kanji' }))
            .toContain('<rt class="jpdb-reader-furi">うつ</rt>');
        expect(renderTokensToHtml('鬱', [difficultToken], { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode: 'difficult-kanji' }))
            .toContain('jpdb-reader-has-furi');
        expect(renderTokensToHtml('日本', [easyToken], { ...DEFAULT_SETTINGS, furiganaMode: 'all' }))
            .toContain('<rt class="jpdb-reader-furi">にほん</rt>');
        expect(renderTokensToHtml('日本', [easyToken], { ...DEFAULT_SETTINGS, furiganaMode: 'all' }))
            .toContain('<span class="jpdb-reader-ruby-base">日本</span>');
        expect(renderTokensToHtml('鬱', [difficultToken], { ...DEFAULT_SETTINGS, furiganaMode: 'off' }))
            .not.toContain('<rt');
    });

    it('falls back to card readings for furigana when parsed ruby spans are missing', () => {
        const token: JPDBToken = {
            card: { ...card, spelling: '日本語', reading: 'にほんご' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '日本語',
        };

        expect(renderTokensToHtml('日本語', [token], { ...DEFAULT_SETTINGS, furiganaMode: 'all' }))
            .toContain('<rt class="jpdb-reader-furi">にほんご</rt>');
    });

    it('centers furigana on kanji instead of trailing kana', () => {
        const cases = [
            { surface: '始める', reading: 'はじめる', rubies: [], bases: ['始'], furis: ['はじ'] },
            { surface: '読み', reading: 'よみ', rubies: [{ text: 'よみ', start: 0, end: 2, length: 2 }], bases: ['読'], furis: ['よ'] },
            { surface: '読んで', spelling: '読む', reading: 'よむ', rubies: [], bases: ['読'], furis: ['よ'] },
            { surface: '問い合わせ', reading: 'といあわせ', rubies: [], bases: ['問', '合'], furis: ['と', 'あ'] },
        ];

        try {
            for (const item of cases) {
                document.body.innerHTML = renderTokensToHtml(item.surface, [{
                    card: { ...card, spelling: item.spelling ?? item.surface, reading: item.reading },
                    start: 0,
                    end: item.surface.length,
                    length: item.surface.length,
                    rubies: item.rubies,
                    pitchClass: '',
                    sentence: item.surface,
                }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

                const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
                expect(readerWordSurfaceText(word)).toBe(item.surface);
                expect(Array.from(word.querySelectorAll('.jpdb-reader-ruby-base')).map(base => base.textContent)).toEqual(item.bases);
                expect(Array.from(word.querySelectorAll('.jpdb-reader-furi')).map(furi => furi.textContent)).toEqual(item.furis);
            }
        } finally {
            document.body.replaceChildren();
        }
    });

    it('emits furigana from local dictionary fallback without a JPDB API key', async () => {
        const { parser, findTermMatches } = createKanjiLocalParserFixture({
            settings: { furiganaMode: 'all' },
        });

        const [tokens] = await parser.parse(['漢字を書く']);

        expect(findTermMatches).toHaveBeenCalledWith(
            '漢字を書く',
            expect.any(Number),
            DEFAULT_SETTINGS.dictionaryPreferences,
            expect.objectContaining({ language: 'ja' }),
        );
        expect(tokens[0].rubies).toEqual([{ text: 'かんじ', start: 0, end: 2, length: 2 }]);
        expect(renderTokensToHtml('漢字を書く', tokens, { ...DEFAULT_SETTINGS, furiganaMode: 'all' }))
            .toContain('<rt class="jpdb-reader-furi">かんじ</rt>');
    });

    it('reuses in-flight local fallback parses for matching text and options', async () => {
        const { parser, findTermMatches } = createKanjiLocalParserFixture();

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
        const { parser, lookupTermMeta } = createLocalPitchParserFixture();

        const [tokens] = await parser.parse(['計量する']);

        expect(lookupTermMeta).toHaveBeenCalledWith('計量', 12, DEFAULT_SETTINGS.dictionaryPreferences);
        expect(tokens[0].card.pitchAccent).toEqual(['LHHHH']);
        expect(tokens[0].pitchClass).toBe('heiban');
        document.body.innerHTML = renderTokensToHtml('計量する', tokens, DEFAULT_SETTINGS);
        const renderedWord = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(renderedWord.classList.contains('jpdb-not-in-deck')).toBe(true);
        expect(renderedWord.classList.contains('local-not-in-deck')).toBe(false);
        expect(renderedWord.classList.contains('jpdb-pitch-heiban')).toBe(true);
    });

    it('keeps local fallback parse cache entries separate when local pitch options differ', async () => {
        const { parser, findTermMatches, lookupTermMeta } = createLocalPitchParserFixture();

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
        const { parser, lookupTermMeta } = createLocalPitchParserFixture();

        const parsed = await parser.parse(['計量する', '計量する']);

        expect(lookupTermMeta).toHaveBeenCalledTimes(1);
        expect(parsed[0][0].pitchClass).toBe('heiban');
        expect(parsed[1][0].pitchClass).toBe('heiban');
    });

    it('does not segment Japanese text without JPDB, unless explicitly asked for a raw fallback', async () => {
        await withFakeSegmenter([
            { segment: 'きょう', index: 0, isWordLike: true },
            { segment: 'は', index: 3, isWordLike: true },
            { segment: 'よむ', index: 4, isWordLike: true },
        ], async parser => {
            expect(parser.canParse()).toBe(true);
            const [defaultTokens] = await parser.parse(['ございます']);
            const [tokens] = await parser.parse(['きょうはよむ'], { allowSegmentedFallback: true });

            expect(defaultTokens).toEqual([]);
            expect(tokens.map(token => token.card.spelling)).toEqual(['きょう', 'は', 'よむ']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 3], [3, 4], [4, 6]]);
            const rendered = renderTokensToHtml('きょうはよむ', tokens, DEFAULT_SETTINGS);
            document.body.innerHTML = rendered;
            const renderedWords = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
            expect(renderedWords).toHaveLength(3);
            expect(renderedWords.map(word => readerWordSurfaceText(word))).toEqual(['きょう', 'は', 'よむ']);
            const contentWords = renderedWords.filter(word => !word.classList.contains('jpdb-reader-particle'));
            expect(contentWords).toHaveLength(2);
            expect(contentWords.every(word => word.classList.contains('jpdb-not-in-deck'))).toBe(true);
            expect(contentWords.every(word => !word.classList.contains('fallback-not-in-deck'))).toBe(true);
            expect(contentWords.every(word => word.classList.contains('jpdb-pitch-unknown'))).toBe(true);
        });
    });

    it('keeps Firefox single-word Japanese Segmenter results that are marked non-word-like', async () => {
        await withFakeSegmenter(value => [{ segment: value, index: 0, isWordLike: false }], async parser => {
            const [japaneseTokens, readTokens] = await parser.parse(['日本語', '読む'], { allowSegmentedFallback: true });

            expect(japaneseTokens.map(token => token.card.spelling)).toEqual(['日本語']);
            expect(readTokens.map(token => token.card.spelling)).toEqual(['読む']);
            expect(renderTokensToHtml('日本語', japaneseTokens, DEFAULT_SETTINGS)).toContain('data-expression="日本語"');
            expect(renderTokensToHtml('読む', readTokens, DEFAULT_SETTINGS)).toContain('data-expression="読む"');
        });
    });

    it('preserves Intl.Segmenter kanji word boundaries instead of merging adjacent compounds', async () => {
        await withFakeSegmenter([
            { segment: '事実', index: 0, isWordLike: true },
            { segment: '上', index: 2, isWordLike: true },
            { segment: '日本', index: 3, isWordLike: true },
            { segment: '国内', index: 5, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['事実上日本国内'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['事実', '上', '日本', '国内']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 2], [2, 3], [3, 5], [5, 7]]);
            expect(tokens.map(token => token.card.spelling)).not.toContain('事実上日本国内');
        });
    });

    it('leaves kanji compound ownership to dictionary lookup instead of hardcoded Segmenter overrides', async () => {
        await withFakeSegmenter([
            { segment: '巨', index: 0, isWordLike: true },
            { segment: '乳', index: 1, isWordLike: true },
            { segment: 'エルフ', index: 2, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['巨乳エルフ'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['巨', '乳', 'エルフ']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 1], [1, 2], [2, 5]]);
            expect(fallbackLookupTermAtOffset('巨乳エルフ', 1)).toBe('乳');
        });
    });

    it('keeps inflected fallback words together for lookup', async () => {
        await withFakeSegmenter([
            { segment: '本', index: 0, isWordLike: true },
            { segment: 'を', index: 1, isWordLike: true },
            { segment: '読み', index: 2, isWordLike: true },
            { segment: 'ま', index: 4, isWordLike: true },
            { segment: 'した', index: 5, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['本を読みました'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['本', 'を', '読みました']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 1], [1, 2], [2, 7]]);
            expect(tokens[2]?.card.fallbackLookupTerms).toContain('読む');
            expect(tokens.map(token => token.card.spelling)).not.toContain('した');
        });
    });

    it('repairs broad pitchless public parser phrase tokens with segmented fallback words', async () => {
        const text = '頭がおかしい';
        const broadPhrase = parsedProviderToken(text, text, 0, 'jiten');
        broadPhrase.card.reading = 'あたまがおかしい';
        broadPhrase.card.pitchAccent = [];

        await withFakeSegmenter([
            { segment: '頭', index: 0, isWordLike: true },
            { segment: 'が', index: 1, isWordLike: true },
            { segment: 'おかしい', index: 2, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

            expect(tokenSpellings(tokens)).toEqual(['頭', 'が', 'おかしい']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 1], [1, 2], [2, 6]]);
            expect(tokenSpellings(tokens)).not.toContain(text);
        }, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false }),
            jitenPublicVocabulary: { parse: vi.fn(async () => [[broadPhrase]]) },
            dictionaries: {} as never,
        });
    });

    it('keeps single-kanji godan-s fallback verbs together before OCR lookup', async () => {
        await withFakeSegmenter([
            { segment: '騙', index: 0, isWordLike: true },
            { segment: 'した', index: 1, isWordLike: true },
            { segment: 'みたい', index: 3, isWordLike: true },
            { segment: 'で', index: 6, isWordLike: true },
            { segment: 'ごめん', index: 7, isWordLike: true },
            { segment: 'ね', index: 10, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['騙したみたいでごめんね'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['騙した', 'みたい', 'で', 'ごめん', 'ね']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 3], [3, 6], [6, 7], [7, 10], [10, 11]]);
            expect(tokens[0]?.card.fallbackLookupTerms).toContain('騙す');
            expect(tokens.map(token => token.card.spelling)).not.toContain('騙');
        });
    });

    it('uses sentence fallback coverage when Segmenter leaves a dangling kana stem', async () => {
        await withFakeSegmenter([
            { segment: 'やや', index: 0, isWordLike: true },
            { segment: 'さし', index: 2, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['ややさしい'], { allowSegmentedFallback: true });

            expect(tokenSpellings(tokens)).toEqual(['ややさしい']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 5]]);
            expect(tokenSpellings(tokens)).not.toContain('さし');
        });
    });

    it('repairs partial Jiten and JPDB kana stems with sentence-context fallback tokens', async () => {
        const text = 'ややさしい';
        const brokenRemoteTokens = (source: 'jpdb' | 'jiten') => [
            parsedProviderToken(text, 'やや', 0, source),
            parsedProviderToken(text, 'さし', 2, source, 'さす'),
        ];
        const segmenter = [
            { segment: 'や', index: 0, isWordLike: true },
            { segment: 'やさしい', index: 1, isWordLike: true },
        ];

        await withFakeSegmenter(segmenter, async parser => {
            const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

            expect(tokenSpellings(tokens)).toEqual(['や', 'やさしい']);
            expect(tokenSpellings(tokens)).not.toContain('さす');
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 1], [1, 5]]);
        }, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', localDictionariesEnabled: false }),
            jpdb: { parse: vi.fn().mockResolvedValue([brokenRemoteTokens('jpdb')]) } as never,
            dictionaries: {} as never,
        });

        await withFakeSegmenter(segmenter, async parser => {
            const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

            expect(tokenSpellings(tokens)).toEqual(['や', 'やさしい']);
            expect(tokenSpellings(tokens)).not.toContain('さす');
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 1], [1, 5]]);
        }, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'ak_test', localDictionariesEnabled: false }),
            jpdb: {} as never,
            jiten: { parse: vi.fn().mockResolvedValue([brokenRemoteTokens('jiten')]) } as never,
            dictionaries: {} as never,
        });
    });

    it('repairs partial local dictionary kana stems with sentence-context fallback tokens', async () => {
        const text = 'ややさしい';
        const findTermMatches = vi.fn().mockResolvedValue([
            {
                entry: {
                    id: 1,
                    sequence: 1,
                    expression: 'やや',
                    reading: 'やや',
                    glossary: ['slightly'],
                    dictionary: 'Local',
                },
                start: 0,
                end: 2,
                surface: 'やや',
            },
            {
                entry: {
                    id: 2,
                    sequence: 2,
                    expression: 'さす',
                    reading: 'さす',
                    glossary: ['to point'],
                    dictionary: 'Local',
                },
                start: 2,
                end: 4,
                surface: 'さし',
                deinflected: { term: 'さす', rules: ['v5s'], reasons: ['synthetic stem'], depth: 1 },
            },
        ]);

        const tokens = await parseSegmentedFallbackTokens([
            { segment: 'や', index: 0, isWordLike: true },
            { segment: 'やさしい', index: 1, isWordLike: true },
        ], text, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches } as never,
        });

        expect(tokenSpellings(tokens)).toEqual(['や', 'やさしい']);
        expect(tokenSpellings(tokens)).not.toContain('さす');
        expect(tokens.every(token => token.card.source === 'fallback')).toBe(true);
    });

    it('keeps common continuous sentence words coherent instead of exposing stems', async () => {
        await withFakeSegmenter([
            { segment: '好き', index: 0, isWordLike: true },
            { segment: 'な', index: 2, isWordLike: true },
            { segment: 'もの', index: 3, isWordLike: true },
            { segment: 'を', index: 5, isWordLike: true },
            { segment: '読', index: 6, isWordLike: true },
            { segment: 'んで', index: 7, isWordLike: true },
            { segment: '日本語', index: 9, isWordLike: true },
            { segment: 'を', index: 12, isWordLike: true },
            { segment: '学ぶ', index: 13, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['好きなものを読んで日本語を学ぶ'], { allowSegmentedFallback: true });

            expect(tokenSpellings(tokens)).toEqual(['好き', 'な', 'もの', 'を', '読んで', '日本語', 'を', '学ぶ']);
            expect(tokenSpellings(tokens)).not.toContain('読');
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 2], [2, 3], [3, 5], [5, 6], [6, 9], [9, 12], [12, 13], [13, 15]]);
        });
    });

    it('keeps compound verbs like 読み取る together when a local match only covers the stem', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([{
            entry: {
                id: 1,
                sequence: 1,
                expression: '読み',
                reading: 'よみ',
                glossary: ['reading'],
                dictionary: 'Local',
            },
            start: 0,
            end: 2,
            surface: '読み',
        }]);
        const tokens = await parseSegmentedFallbackTokens([{ segment: '読み取る', index: 0, isWordLike: true }], '読み取る', {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches } as never,
        });

        expect(tokenSpellings(tokens)).toEqual(['読み取る']);
        expect(tokens[0]?.card.source).toBe('fallback');
    });

    it('stops inflected fallback spans before surrounding grammar chunks', () => {
        const suspicion = '異世界転生疑ってたわけじゃないけどこれは実際に';
        const seen = '目にしてみないとわからない';

        expect(fallbackLookupTermAtOffset(suspicion, suspicion.indexOf('疑'))).toBe('疑ってた');
        expect(fallbackDictionaryLookupTermsForText('疑ってた')[0]).toBe('疑う');
        expect(fallbackLookupTermAtOffset(seen, seen.indexOf('目'))).toBe('目にして');
        expect(fallbackDictionaryLookupTermsForText('目にして')[0]).toBe('目にする');
    });

    it('does not merge polite YouTube comment runs into one fallback word', async () => {
        await withFakeSegmenter([
            { segment: '先生', index: 0, isWordLike: true },
            { segment: 'いつも', index: 2, isWordLike: true },
            { segment: 'ありがとう', index: 5, isWordLike: true },
            { segment: 'ご', index: 10, isWordLike: true },
            { segment: 'ざ', index: 11, isWordLike: true },
            { segment: 'いま', index: 12, isWordLike: true },
            { segment: 'した', index: 14, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['先生いつもありがとうございました'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['先生', 'いつも', 'ありがとう', 'ご', 'ざ', 'いました']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 2], [2, 5], [5, 10], [10, 11], [11, 12], [12, 16]]);
            expect(fallbackLookupTermAtOffset('先生いつもありがとうございました', 1)).toBe('先生');
            expect(tokens.map(token => token.card.spelling)).not.toContain('先生いつもありがとうございました');
        });
    });

    it('keeps suru auxiliary fallback boundaries on the hovered stem', async () => {
        await withFakeSegmenter([
            { segment: '追加', index: 0, isWordLike: true },
            { segment: 'でき', index: 2, isWordLike: true },
            { segment: 'ます', index: 4, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['追加できます'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['追加', 'できます']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 2], [2, 6]]);
            expect(tokens[1]?.card.fallbackLookupTerms).toContain('できる');
            expect(fallbackLookupTermAtOffset('追加できます', 1)).toBe('追加');
            expect(fallbackLookupTermAtOffset('追加できます', 3)).toBe('できます');
        });
    });

    it('does not replace multiple JPDB tokens with one overbroad fallback span', async () => {
        const text = '追加できます';
        const jpdbTokens: JPDBToken[] = [
            {
                card: { ...card, vid: 71, sid: 71, spelling: '追加', reading: 'ついか', cardState: ['not-in-deck'], pitchAccent: [], source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'ついか', start: 0, end: 2, length: 2 }],
                pitchClass: '',
                sentence: text,
            },
            {
                card: { ...card, vid: 72, sid: 72, spelling: 'できる', reading: 'できる', cardState: ['not-in-deck'], pitchAccent: [], source: 'jpdb' },
                start: 2,
                end: 6,
                length: 4,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
        ];
        const tokens = await parseSegmentedFallbackTokens([{ segment: '追加できます', index: 0, isWordLike: true }], text, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: false }),
            jpdb: { parse: vi.fn().mockResolvedValue([jpdbTokens]) } as never,
            dictionaries: {} as never,
        });

        expect(tokenSpellings(tokens)).toEqual(['追加', 'できる']);
        expect(tokens.every(token => token.card.source === 'jpdb')).toBe(true);
        expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 2], [2, 6]]);
    });

    it('keeps polite negative fallback verbs together instead of exposing a kanji fragment', async () => {
        await withFakeSegmenter([
            { segment: '日本語', index: 0, isWordLike: true },
            { segment: 'は', index: 3, isWordLike: true },
            { segment: '分', index: 4, isWordLike: true },
            { segment: 'か', index: 5, isWordLike: true },
            { segment: 'り', index: 6, isWordLike: true },
            { segment: 'ま', index: 7, isWordLike: true },
            { segment: 'せん', index: 8, isWordLike: true },
        ], async parser => {
            const [tokens] = await parser.parse(['日本語は分かりません'], { allowSegmentedFallback: true });

            expect(tokens.map(token => token.card.spelling)).toEqual(['日本語', 'は', '分かりません']);
            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 3], [3, 4], [4, 10]]);
            expect(tokens[2]?.card.fallbackLookupTerms).toContain('分かる');
            expect(tokens.map(token => token.card.spelling)).not.toContain('分');
        });
    });

    it('fills hosted-demo gaps with segmented fallback when JPDB returns a partial parse', async () => {
        const text = '青空の下で日本語を読む';
        const jpdbTokens: JPDBToken[] = [
            {
                card: { ...card, vid: 51, sid: 51, spelling: '日本語', reading: 'にほんご', cardState: ['not-in-deck'], pitchAccent: [], source: 'jpdb' },
                start: 5,
                end: 8,
                length: 3,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
            {
                card: { ...card, vid: 52, sid: 52, spelling: '読む', reading: 'よむ', cardState: ['not-in-deck'], pitchAccent: [], source: 'jpdb' },
                start: 9,
                end: 11,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
        ];
        const tokens = await parseSegmentedFallbackTokens([
            { segment: '青空', index: 0, isWordLike: true },
            { segment: 'の', index: 2, isWordLike: true },
            { segment: '下', index: 3, isWordLike: true },
            { segment: 'で', index: 4, isWordLike: true },
            { segment: '日本語', index: 5, isWordLike: true },
            { segment: 'を', index: 8, isWordLike: true },
            { segment: '読む', index: 9, isWordLike: true },
        ], text, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: false }),
            jpdb: { parse: vi.fn().mockResolvedValue([jpdbTokens]) } as never,
            dictionaries: {} as never,
        });

        expect(tokenSpellings(tokens)).toEqual(['青空', 'の', '下', 'で', '日本語', 'を', '読む']);
        expect(tokens.find(token => token.card.spelling === '日本語')?.card.source).toBe('jpdb');
        expect(tokens.find(token => token.card.spelling === '下')?.card.source).toBe('fallback');
        expect(renderTokensToHtml(text, tokens, DEFAULT_SETTINGS)).toContain('data-expression="下"');
    });

    it('fills local dictionary parse gaps with segmented fallback when requested', async () => {
        const text = '青空の下で日本語';
        const findTermMatches = vi.fn().mockResolvedValue([{
            entry: {
                id: 1,
                sequence: 1,
                expression: '日本語',
                reading: 'にほんご',
                glossary: ['Japanese language'],
                dictionary: 'Local',
            },
            start: 5,
            end: 8,
            surface: '日本語',
        }]);
        const tokens = await parseSegmentedFallbackTokens([
            { segment: '青空', index: 0, isWordLike: true },
            { segment: 'の', index: 2, isWordLike: true },
            { segment: '下', index: 3, isWordLike: true },
            { segment: 'で', index: 4, isWordLike: true },
            { segment: '日本語', index: 5, isWordLike: true },
        ], text, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches } as never,
        });

        expect(tokenSpellings(tokens)).toEqual(['青空', 'の', '下', 'で', '日本語']);
        expect(tokens.find(token => token.card.spelling === '日本語')?.card.source).toBe('local');
        expect(tokens.find(token => token.card.spelling === '下')?.card.source).toBe('fallback');
    });

    it('repairs incomplete remote kana spans with segmented fallback coverage', async () => {
        const text = 'ややさしい';
        const badRemoteTokens: JPDBToken[] = [
            {
                card: { ...card, vid: 81, sid: 81, spelling: 'やや', reading: 'やや', cardState: ['not-in-deck'], pitchAccent: [], source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
            {
                card: { ...card, vid: 82, sid: 82, spelling: '指す', reading: 'さす', cardState: ['not-in-deck'], pitchAccent: [], source: 'jpdb' },
                start: 2,
                end: 4,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
        ];
        const tokens = await parseSegmentedFallbackTokens([
            { segment: 'や', index: 0, isWordLike: true },
            { segment: 'やさしい', index: 1, isWordLike: true },
        ], text, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: false }),
            jpdb: { parse: vi.fn().mockResolvedValue([badRemoteTokens]) } as never,
            dictionaries: {} as never,
        });

        expect(tokenSpellings(tokens)).toEqual(['や', 'やさしい']);
        expect(tokens.map(token => [token.start, token.end])).toEqual([[0, 1], [1, 5]]);
        expect(tokens.map(token => token.card.source)).toEqual(['fallback', 'fallback']);

        document.body.innerHTML = renderTokensToHtml(text, tokens, DEFAULT_SETTINGS);
        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['や', 'やさしい']);
    });

    it('repairs short hiragana and katakana partial overlaps instead of leaving raw Japanese tails', async () => {
        for (const text of ['ここ', 'テスト']) {
            const firstCharacter = text[0]!;
            const partial: JPDBToken = {
                card: {
                    ...card,
                    vid: 91,
                    sid: 91,
                    spelling: firstCharacter,
                    reading: firstCharacter,
                    cardState: ['not-in-deck'],
                    pitchAccent: [],
                    source: 'jpdb',
                },
                start: 0,
                end: 1,
                length: 1,
                rubies: [],
                pitchClass: '',
                sentence: text,
            };
            const tokens = await parseSegmentedFallbackTokens(
                [{ segment: text, index: 0, isWordLike: true }],
                text,
                {
                    getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: false }),
                    jpdb: { parse: vi.fn().mockResolvedValue([[partial]]) } as never,
                    dictionaries: {} as never,
                },
            );

            expect(tokens.map(token => [token.start, token.end])).toEqual([[0, text.length]]);
            expect(tokens.map(token => token.card.spelling)).toEqual([text]);
            expect(tokens[0]?.card.source).toBe('fallback');

            document.body.innerHTML = renderTokensToHtml(text, tokens, DEFAULT_SETTINGS);
            expect([...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')]
                .map(word => readerWordSurfaceText(word))).toEqual([text]);
        }
    });

});
