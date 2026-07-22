import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    WORD_ONLY_STUDY_DISABLED_STEPS,
    DEFAULT_SETTINGS,
    newTabTestCard,
    newTabLocalDictionaryEntries,
    newTabLocalCardFromEntry,
    newTabSentenceToken,
    renderEnabledNewTabRoot,
    newTabBareController,
    disconnectedJpdbReviewBridge,
    newTabLocalDictionarySummary,
    newTabEmptyDictionarySummary,
    newTabTermDictionarySummary,
    newTabLocalFallbackController,
    newTabPublicFallbackController,
    renderSeededNewTabWord,
    resetNewTabReviewStorage,
    newTabStatusButton,
    newTabSourceSelect,
    newTabSourceSelectValues,
    newTabApiSourceController,
    newTabLiveVocabularyStatus,
    NewTabController,
} from './fixtures';
import type {
    JPDBCard,
} from './fixtures';

describe('new tab review — Jiten/JPDB API sources & fallback loading', () => {
    registerNewTabReviewCleanup();


    it('marks JPDB API deck cards as review cards for stable new-tab counts', async () => {
        const jpdbCard = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();

        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0]?.reviewSource).toBe('jpdb-api');
    });

    it('loads Jiten SRS cards through the new-tab API source with a legacy Jiten key', async () => {
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: 'ak_legacy-jiten-key',
            jitenApiKey: '',
            jpdbMiningEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toEqual([expect.objectContaining({
            spelling: '日本語',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        })]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
        expect(listDeckCards).not.toHaveBeenCalled();
    });

    it('keeps Jiten-only API source from being preempted by live JPDB review', async () => {
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const requestCurrent = vi.fn();
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'auto',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => newTabLiveVocabularyStatus(),
                requestCurrent,
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => [card.spelling, card.reviewSource])).toEqual([['日本語', 'jiten-api']]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
        expect(listDeckCards).not.toHaveBeenCalled();
        expect(requestCurrent).not.toHaveBeenCalled();
    });

    it('keeps the active Jiten API source from being preempted by a stale JPDB key', async () => {
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const requestCurrent = vi.fn();
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key-left-from-old-settings',
            jitenApiKey: 'ak_active-jiten-key',
            jpdbMiningEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'auto',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => newTabLiveVocabularyStatus(),
                requestCurrent,
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => [card.spelling, card.reviewSource])).toEqual([['日本語', 'jiten-api']]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
        expect(requestCurrent).not.toHaveBeenCalled();
    });

    it('falls back to study words when the configured Jiten SRS queue is empty', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '余白', reading: 'よはく', source: 'local', reviewSource: 'dictionary' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['余白', 'よはく', 'blank space']));
        const listStudyBatchCards = vi.fn(async () => [] as JPDBCard[]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(listStudyBatchCards).toHaveBeenCalledWith(180);
            expect(result.cards.map(card => card.spelling)).toEqual(['余白']);
            expect(result.sourceLabel).toBe('Jiten');
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
            expect(listDeckCards).not.toHaveBeenCalled();
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(publicSearch).not.toHaveBeenCalled();

            await controller.renderPage();

            const status = newTabStatusButton();
            expect(status.textContent).not.toContain('⇄');
            expect(status.textContent).not.toContain('JPDB');
            expect(status.disabled).toBe(true);
            const select = newTabSourceSelect();
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('jpdb');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
            expect(newTabSourceSelectValues()).toContain('anki');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('resolves Jiten-only practice fallback words through the Jiten API so grades stay available', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '余白', reading: 'よはく', source: 'local', reviewSource: 'dictionary' });
        const jitenCard = newTabTestCard({
            vid: 420,
            sid: 0,
            rid: 0,
            spelling: '余白',
            reading: 'よはく',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 420,
            jitenReadingIndex: 0,
            cardState: ['in-deck'],
        });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['余白', 'よはく', 'blank space']));
        const listStudyBatchCards = vi.fn(async () => [] as JPDBCard[]);
        const parse = vi.fn(async (terms: string[]) => terms.map(term => term === '余白' ? [newTabSentenceToken(jitenCard, term)] : []));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            jpdb: { listDeckCards: vi.fn(async () => [] as JPDBCard[]) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn(), parse } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(parse).toHaveBeenCalledWith(['余白', 'よはく']);
            expect(result.sourceLabel).toBe('Jiten');
            expect(result.reviewCountMode).toBe(false);
            expect(result.cards).toEqual([expect.objectContaining({
                spelling: '余白',
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 420,
                cardState: ['in-deck'],
            })]);

            const root = renderSeededNewTabWord(controller, result.cards[0]!, {
                sourceLabel: result.sourceLabel,
                state: { revealAnswer: true },
            });
            expect(Array.from(root.querySelectorAll<HTMLButtonElement>('[data-grade]')).map(button => button.dataset.grade)).toEqual([
                'nothing',
                'something',
                'hard',
                'okay',
                'easy',
            ]);
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Jiten');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('keeps auto Jiten-only fallback from fetching or labeling JPDB', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '文脈', reading: 'ぶんみゃく', source: 'local', reviewSource: 'dictionary' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['文脈', 'ぶんみゃく', 'context']));
        const listStudyBatchCards = vi.fn(async () => [] as JPDBCard[]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(result.cards.map(card => card.spelling)).toEqual(['文脈']);
            expect(result.sourceLabel).toBe('Jiten');
            expect(result.reviewCountMode).toBe(false);
            expect(listStudyBatchCards).toHaveBeenCalledWith(180);
            expect(listDeckCards).not.toHaveBeenCalled();
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(publicSearch).not.toHaveBeenCalled();

            await controller.renderPage();

            const status = newTabStatusButton();
            expect(status.textContent).not.toContain('JPDB');
            expect(status.dataset.sourceToggleTarget).toBeUndefined();
            const select = newTabSourceSelect();
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('yomu-local');
            expect(select.querySelector<HTMLOptionElement>('option[value="yomu-local"]')?.textContent).toBe('Academy');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
            expect(newTabSourceSelectValues()).not.toContain('anki');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('loads Jiten cards through the auto new-tab review source', async () => {
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
            cardState: ['due'],
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            newTabSource: 'auto',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
            jpdb: { listDeckCards: vi.fn(async () => []) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toEqual([expect.objectContaining({
            spelling: '日本語',
            source: 'jiten',
            reviewSource: 'jiten-api',
        })]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
    });

    it('interleaves Jiten and JPDB SRS cards through the shared new-tab API source', async () => {
        const jpdbCard = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        });
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
            cardState: ['due'],
        });
        const listDeckCards = vi.fn(async () => [jpdbCard]);
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten + JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => [card.spelling, card.reviewSource])).toEqual([
            ['日本語', 'jiten-api'],
            ['復習', 'jpdb-api'],
        ]);
        expect(listDeckCards).toHaveBeenCalledWith('all', 180, { scheduledOnly: true });
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
    });

    it('loads Jiten SRS cards even when API write actions are disabled', async () => {
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: false,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards: vi.fn(async () => []) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => card.reviewSource)).toEqual(['jiten-api']);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
    });

    it('keeps locked JPDB API cards in deck order and makes them gradeable when kanji unlock is off', async () => {
        const locked = newTabTestCard({ spelling: '未解禁', reading: 'みかいきん', source: 'jpdb', cardState: ['locked'] });
        const due = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'jpdb', cardState: ['due'] });
        const reviewCard = vi.fn(async () => undefined);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                // The jpdb-parity default replaces locked words with kanji
                // unlock cards (covered in parity-matrix); this test pins the
                // kanji-off path where locked words study directly as words.
                newTabKanjiUnlockEnabled: false,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [locked, due]),
                reviewCard,
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                sourceLabel: string;
                reviewCountMode: boolean;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                allWords: result.cards,
                sourceLabel: 'JPDB',
                reviewCountMode: true,
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
            });

            (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

            expect(result.reviewCountMode).toBe(true);
            expect(result.cards.map(card => card.spelling)).toEqual(['未解禁', '復習']);
            expect(result.cards.map(card => card.reviewSource)).toEqual(['jpdb-api', 'jpdb-api']);
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['未解禁', '復習']);
            expect(root.querySelectorAll('[data-grade]')).toHaveLength(5);
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades JPDB');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');
            expect(reviewCard).toHaveBeenCalledWith(expect.objectContaining({
                spelling: '未解禁',
                reading: 'みかいきん',
                cardState: ['locked'],
                reviewSource: 'jpdb-api',
            }), 'okay');
        } finally {
            root.remove();
        }
    });

    it('submits new-tab Jiten review grades through the Jiten API provider', async () => {
        const card = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const jitenReviewCard = vi.fn(async () => undefined);
        const jpdbReviewCard = vi.fn(async () => undefined);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }, {
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard: jpdbReviewCard } as never,
            jiten: { listStudyBatchCards: vi.fn(), reviewCard: jitenReviewCard } as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }) } as never,
            parser: { cacheCards: vi.fn() } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'Jiten',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Jiten');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(jitenReviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(jpdbReviewCard).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('loads JPDB review cards from the all-decks queue when the all-decks setting is selected', async () => {
        const locked = newTabTestCard({ spelling: '未解禁', reading: 'みかいきん', source: 'jpdb', cardState: ['locked'] });
        const due = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'jpdb', cardState: ['due'] });
        const listDecks = vi.fn(async () => [{ id: 'deck-1', name: 'Deck 1' }]);
        const listDeckCards = vi.fn(async () => [locked, due]);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'all',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDecks,
                listDeckCards,
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => card.spelling)).toEqual(['未解禁', '復習']);
        expect(result.cards.map(card => card.reviewSource)).toEqual(['jpdb-api', 'jpdb-api']);
        expect(listDeckCards).toHaveBeenCalledWith('all', 180, { scheduledOnly: true });
        expect(listDecks).not.toHaveBeenCalled();
    });

    it('uses built-in starter words for no-key JPDB new-tab fallback without public JPDB requests', async () => {
        const lookup = vi.fn(async (kanji: string) => ({
            kanji,
            keyword: `${kanji} keyword`,
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [{
                expression: `${kanji}語`,
                reading: `${kanji}ご`,
                meaning: `${kanji} word`,
                url: `https://jpdb.io/vocabulary/${kanji.charCodeAt(0)}/${encodeURIComponent(`${kanji}語`)}/${encodeURIComponent(`${kanji}ご`)}`,
            }],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const publicSearch = vi.fn(async () => []);
        const fallbackCardFromText = vi.fn((text: string) => newTabTestCard({
            spelling: text,
            reading: '',
            source: 'fallback',
            reviewSource: 'dictionary',
        }));
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {} as never,
            jpdbKanji: { lookup } as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: { fallbackCardFromText } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabEmptyDictionarySummary()),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Starter words');
        expect(result.reviewCountMode).toBe(false);
        expect(result.cards.length).toBeGreaterThan(0);
        expect(result.cards.every(card => card.source === 'fallback')).toBe(true);
        expect(lookup).not.toHaveBeenCalled();
        expect(publicSearch).not.toHaveBeenCalled();
        expect(fallbackCardFromText).toHaveBeenCalled();
    });

    it('uses local dictionary fallback without public JPDB when no API key is configured', async () => {
        const publicSearch = vi.fn(async (query: string) => [
            newTabTestCard({
                vid: query.charCodeAt(0),
                sid: 0,
                spelling: query,
                reading: query,
                source: 'jpdb',
                cardState: ['not-in-deck'],
            }),
        ]);
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(
            ['書く', 'かく', 'to write'],
            ['見る', 'みる', 'to see'],
        ));
        const kanjiLookup = vi.fn(async () => null);
        const controller = newTabPublicFallbackController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), publicSearch, {
            jpdbKanji: { lookup: kanjiLookup } as never,
            parser: {
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    ...newTabTermDictionarySummary(),
                    terms: 2,
                })),
                listRandomTopTerms,
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(publicSearch).not.toHaveBeenCalled();
        expect(kanjiLookup).not.toHaveBeenCalled();
        expect(result.sourceLabel).toBe('Dictionary');
        expect(result.cards.every(card => card.source === 'local')).toBe(true);
        expect(result.cards.map(card => card.spelling)).toEqual(['書く', '見る']);
    });

    it('shows dictionary fallback cards without waiting for slow public JPDB cards', async () => {
        vi.useFakeTimers();
        const publicSearch = vi.fn(async (query: string) => {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return [newTabTestCard({ spelling: `${query}公開`, reading: `${query}こうかい`, source: 'jpdb' })];
        });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
        const controller = newTabPublicFallbackController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), publicSearch, {
            parser: {
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    ...newTabTermDictionarySummary(),
                })),
                listRandomTopTerms,
            } as never,
        });

        try {
            const resultPromise = (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();
            await vi.advanceTimersByTimeAsync(1000);
            const result = await resultPromise;

            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
            expect(publicSearch).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(3000);
        } finally {
            vi.useRealTimers();
        }
    });

    it('loads JPDB new-tab cards even when JPDB writes are disabled', async () => {
        const listDeckCards = vi.fn(async () => [newTabTestCard({ spelling: '安定', source: 'jpdb' })]);
        const requestCurrent = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: false,
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards,
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent,
            } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['安定']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(listDeckCards).toHaveBeenCalled();
        expect(requestCurrent).not.toHaveBeenCalled();
    });

    it('keeps strict JPDB review empty instead of falling back when no cards are scheduled', async () => {
        const listDeckCards = vi.fn(async () => [newTabTestCard({ spelling: '既知', source: 'jpdb', cardState: ['known'] })]);
        const publicSearch = vi.fn(async (query: string) => [
            newTabTestCard({ spelling: `${query}公開`, reading: `${query}こうかい`, source: 'jpdb', cardState: ['not-in-deck'] }),
        ]);
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['新語', 'しんご', 'new word']));
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards,
            } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(listDeckCards).toHaveBeenCalledWith('deck', 180, { scheduledOnly: true });
        expect(result.cards.length).toBeGreaterThan(0);
        expect(result.sourceLabel).toBe('JPDB + Dictionary');
        expect(result.reviewCountMode).toBe(false);
        expect(publicSearch).toHaveBeenCalled();
        expect(listRandomTopTerms).toHaveBeenCalled();
    });

    it('uses navigation instead of grade buttons for JPDB cards when JPDB writes are disabled', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: false,
                enableReviews: true,
                immersionKitEnabled: false,
            }));
        const root = renderEnabledNewTabRoot(controller);
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: true },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-grade]')).toBeNull();
        expect(root.querySelector('[data-newtab-action="previous"]')).not.toBeNull();
        expect(root.querySelector('[data-newtab-action="reveal"]')?.firstChild?.textContent).toBe('Hide');
        expect(root.querySelector('[data-newtab-action="next"]')).not.toBeNull();
    });

    it('keeps undo on the Previous control without rendering a separate undo button', () => {
        const card = newTabTestCard({
            spelling: '辞典',
            reading: 'じてん',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 0,
        });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                jitenApiKey: 'jiten-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
            }), {
            jiten: { listStudyBatchCards: vi.fn(), reviewCard: vi.fn(), undoReview: vi.fn() } as never,
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Jiten',
            state: { mode: 'word', revealAnswer: false },
            appendToDocument: true,
        });
        Object.assign(controller as unknown as { lastUndoableReview?: { card: JPDBCard; at: number; serverUndo: boolean; counted: boolean } }, {
            lastUndoableReview: { card, at: Date.now(), serverUndo: true, counted: true },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-action="undo-review"]')).toBeNull();
            expect(root.querySelector('[data-newtab-action="previous"]')).not.toBeNull();
            expect(root.querySelector('[data-newtab-action="next"]')).not.toBeNull();
        } finally {
            root.remove();
        }
    });

    it('marks two-button study-step navigation for equal-width controls', () => {
        const card = newTabTestCard({ spelling: '図鑑', reading: 'ずかん' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: false,
                newTabStudyDisabledSteps: ['recall-cloze', 'listen-pitch', 'speaking'],
            }));
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionary',
            state: { mode: 'word', revealAnswer: false },
        });

        try {
            const controls = root.querySelector<HTMLElement>('[data-newtab-controls]');
            const actions = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-newtab-controls] [data-newtab-action]'))
                .map(button => button.dataset.newtabAction);

            expect(controls?.dataset.newtabGradeControls).toBe('false');
            expect(controls?.dataset.newtabControlCount).toBe('2');
            expect(actions).toEqual(['previous', 'next']);
        } finally {
            root.remove();
        }
    });

    it('leaves Previous as a no-op on the first card when there is no undo review', () => {
        const first = newTabTestCard({ spelling: '一', reading: 'いち' });
        const second = newTabTestCard({ spelling: '二', reading: 'に' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: false,
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
            }));
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second],
            sourceLabel: 'Dictionary',
            state: { mode: 'word', revealAnswer: false },
            appendToDocument: true,
            bindRootEvents: true,
        });

        try {
            root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('一');
        } finally {
            root.remove();
        }
    });

    it('exposes grade options to kanji lookup popovers for the revealed review card', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                twoButtonReviews: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: true },
        });

        expect(controller.lookupGradeOptions(card)).toEqual([['fail', 'Fail'], ['pass', 'Pass']]);
        (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: false };
        expect(controller.lookupGradeOptions(card)).toEqual([]);
    });

    it('marks two-button Study controls with pass/fail layout metadata', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                twoButtonReviews: true,
            }));
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: true },
        });

        try {
            const controls = root.querySelector<HTMLElement>('[data-newtab-controls]');
            const gradeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]'));

            expect(controls?.dataset.newtabGradeControls).toBe('true');
            expect(controls?.dataset.newtabGradeCount).toBe('2');
            expect(controls?.dataset.newtabGradeScale).toBe('pass-fail');
            expect(gradeButtons.map(button => button.dataset.grade)).toEqual(['fail', 'pass']);
        } finally {
            root.remove();
        }
    });
});
