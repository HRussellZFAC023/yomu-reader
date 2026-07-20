import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    WORD_ONLY_STUDY_DISABLED_STEPS,
    DEFAULT_SETTINGS,
    newTabTestCard,
    deferred,
    newTabLocalDictionaryEntry,
    newTabLocalCardFromEntry,
    newTabPromptController,
    renderEnabledNewTabRoot,
    newTabBareController,
    disconnectedJpdbReviewBridge,
    newTabLocalDictionarySummary,
    newTabLocalFallbackController,
    renderSeededNewTabRoot,
    jpdbAnkiReviewCard,
    resetNewTabReviewStorage,
    expectNewTabDictionaryCard,
    newTabStatusButton,
    expectNewTabPromptText,
    newTabPromptText,
    advanceNewTabStudyCard,
    showNextNewTabWord,
    newTabSourceSelect,
    newTabSourceSelectValues,
    switchNewTabSource,
    expectNewTabMergedStatusSelect,
    expectNewTabSourcePrompt,
    newTabJpdbAnkiSourceFixture,
    newTabVisibleWordFixture,
    renderNewTabCardFront,
    NewTabController,
    definitionSourceRows,
    waitForExpect,
} from './fixtures';
import type {
    JPDBCard,
} from './fixtures';

function dictionaryBatchOverrides(listRandomTopTerms: () => Promise<Array<ReturnType<typeof newTabLocalDictionaryEntry>>>) {
    return {
        parser: {
            cacheCards: vi.fn(),
            localCardFromEntry: vi.fn((entry: { expression: string; reading: string }) => newTabTestCard({
                spelling: entry.expression,
                reading: entry.reading,
                source: 'local',
                reviewSource: 'dictionary',
            })),
        } as never,
        dictionaries: {
            summary: vi.fn(async () => newTabLocalDictionarySummary()),
            listRandomTopTerms,
            listRandomTerms: vi.fn(async () => []),
        } as never,
    };
}

describe('new tab review — cache reuse & source switching', () => {
    registerNewTabReviewCleanup();


    it('does not reuse a stale JPDB cache entry when switching to Anki', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expectNewTabPromptText('日本語');
            const internals = controller as unknown as {
                sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean } }>;
                sourceCacheSignature(source: 'anki'): string;
            };
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [newTabTestCard({
                        vid: 1,
                        sid: 1,
                        spelling: '日本語',
                        reading: 'にほんご',
                        source: 'jpdb',
                        reviewSource: 'jpdb-api',
                    })],
                    sourceLabel: 'JPDB',
                    reviewCountMode: true,
                },
            });

            switchNewTabSource('anki');

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(listNewTabCards).toHaveBeenCalledOnce();
                expect(newTabSourceSelect().value).toBe('anki');
                expectNewTabPromptText('暗記');
            }, 3000);
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(newTabSourceSelectValues()).toContain('jpdb');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse an unreachable empty Anki cache entry when switching from JPDB', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expectNewTabPromptText('日本語');
            const internals = controller as unknown as {
                sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean; emptyMessageKey?: string } }>;
                sourceCacheSignature(source: 'anki'): string;
            };
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [],
                    sourceLabel: 'Anki',
                    reviewCountMode: false,
                    emptyMessageKey: 'ankiUnreachable',
                },
            });

            switchNewTabSource('anki');

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(listNewTabCards).toHaveBeenCalledOnce();
                expectNewTabPromptText('暗記');
            }, 3000);
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(newTabSourceSelectValues()).toContain('jpdb');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse an empty Anki cache entry when switching from JPDB to Anki fallback words', async () => {
        resetNewTabReviewStorage();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb', reviewSource: 'jpdb-api' });
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards: vi.fn(async () => [jpdbCard]) } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        try {
            await controller.renderPage();
            expectNewTabPromptText('日本語');
            const internals = controller as unknown as {
                sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean } }>;
                sourceCacheSignature(source: 'anki'): string;
            };
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [],
                    sourceLabel: 'Anki',
                    reviewCountMode: true,
                },
            });

            switchNewTabSource('anki');

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(newTabPromptText()).toBe('書く');
                expect(newTabSourceSelect().value).toBe('anki');
                expect(newTabSourceSelectValues()).toContain('jpdb');
            }, 3000);
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse cached Anki cards after Anki mining is disabled', async () => {
        resetNewTabReviewStorage();
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki' as const,
            immersionKitEnabled: false,
        };
        const staleAnkiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const listNewTabCards = vi.fn(async () => [staleAnkiCard]);
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabLocalFallbackController(() => settings, localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
        });
        const internals = controller as unknown as {
            sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean } }>;
            sourceCacheSignature(source: 'anki'): string;
            loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }>;
        };

        try {
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [staleAnkiCard],
                    sourceLabel: 'Anki',
                    reviewCountMode: true,
                },
            });
            settings.ankiEnabled = false;

            const result = await internals.loadWords();

            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.reviewCountMode).toBe(false);
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('switches from Anki to JPDB when saved source state is already stale JPDB', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('anki');

        try {
            await controller.renderPage();
            expectNewTabPromptText('暗記');
            expect(newTabSourceSelectValues()).toContain('jpdb');

            const internals = controller as unknown as {
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            };
            internals.state = { ...internals.state, source: 'jpdb' };
            switchNewTabSource('jpdb');

            await expectNewTabSourcePrompt(settings, 'jpdb', '日本語');
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listDeckCards).toHaveBeenCalledOnce();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('cycles merged JPDB and Anki review cards from the selected source', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const root = renderEnabledNewTabRoot(controller);
        const card = jpdbAnkiReviewCard();
        const internals = controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        Object.assign(internals, {
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });

        internals.renderWord(root, card);
        expectNewTabMergedStatusSelect('jpdb', 'anki', root);

        internals.state = { ...internals.state, source: 'anki' };
        internals.sourceLabel = 'JPDB + Anki';
        internals.renderWord(root, card);

        expectNewTabMergedStatusSelect('anki', 'jpdb', root);
    });

    it('switches between the rendered JPDB and Anki sources through the source dropdown', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const card = jpdbAnkiReviewCard();
        const root = renderSeededNewTabRoot(controller, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            appendToDocument: true,
        });
        const switched: string[] = [];
        const internals = controller as unknown as {
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            sourceLabel: string;
            switchReviewSource(root: HTMLElement, source: 'jpdb' | 'anki' | 'dictionary'): Promise<void>;
        };
        internals.switchReviewSource = vi.fn(async (_root, source) => {
            switched.push(source);
            internals.state = { ...internals.state, source, revealAnswer: false };
            internals.sourceLabel = 'JPDB + Anki';
            internals.renderWord(root, card);
        });

        try {
            internals.bindRootEvents(root);
            internals.renderWord(root, card);

            // The select is the ONE switcher while a card is shown; the pill
            // is pure status (disabled, no source-toggle action).
            const firstStatus = newTabStatusButton(root);
            expect(firstStatus.disabled).toBe(true);
            expect(firstStatus.dataset.newtabAction).toBeUndefined();
            const firstSelect = newTabSourceSelect(root);
            expect(firstSelect.hidden).toBe(false);
            expect(firstSelect.value).toBe('jpdb');
            expect(newTabSourceSelectValues(root)).toContain('anki');
            switchNewTabSource('anki', root);
            expect(switched).toEqual(['anki']);

            expect(newTabSourceSelect(root).value).toBe('anki');
            switchNewTabSource('jpdb', root);
            expect(switched).toEqual(['anki', 'jpdb']);
        } finally {
            root.remove();
        }
    });

    it('toggles from the visible source when selected source state is stale', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
        });
        const root = renderEnabledNewTabRoot(controller);
        const card = jpdbAnkiReviewCard();
        const internals = controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        Object.assign(internals, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false },
        });

        internals.renderWord(root, card);
        expectNewTabMergedStatusSelect('anki', 'jpdb', root);
    });

    it('offers both JPDB and Anki in the dropdown for a visible JPDB card when Anki is selected', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
        });
        const card = jpdbAnkiReviewCard();
        const root = renderNewTabCardFront(controller, card, {
            sort: 'random',
            source: 'anki',
            sourceLabel: '',
        });

        expectNewTabMergedStatusSelect('anki', 'jpdb', root);
    });

    it('falls back to study words when the status footer toggles to unavailable Anki', async () => {
        resetNewTabReviewStorage();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb' });
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: {
                listNewTabCards,
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
        });

        await controller.renderPage();
        expect(newTabSourceSelect().value).toBe('jpdb');
        expect(newTabSourceSelectValues()).toContain('anki');

        switchNewTabSource('anki');

        await waitForExpect(() => expect(settings.newTabSource).toBe('anki'));
        await expectNewTabDictionaryCard('書く', document, null);
        expect(newTabSourceSelect().value).toBe('dictionary');
        expect(listNewTabCards).toHaveBeenCalledOnce();
        expect(listRandomTopTerms).toHaveBeenCalled();

        resetNewTabReviewStorage();
    });

    it('falls back to study words when explicitly opening an unavailable Anki source', async () => {
        resetNewTabReviewStorage();
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards,
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('書く', document, 'Dictionary');
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('retries unavailable Anki and falls back to study words after auto review loads JPDB first', async () => {
        resetNewTabReviewStorage();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb', reviewSource: 'jpdb-api' });
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: {
                listNewTabCards,
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        await controller.renderPage();
        expect(newTabPromptText()).toBe('日本語');
        expect(listNewTabCards).toHaveBeenCalledOnce();
        expect(newTabSourceSelect().value).toBe('jpdb');
        expect(newTabSourceSelectValues()).toContain('anki');

        switchNewTabSource('anki');

        await waitForExpect(() => expect(settings.newTabSource).toBe('anki'));
        await expectNewTabDictionaryCard('書く', document, null);
        expect(newTabSourceSelect().value).toBe('dictionary');
        expect(listNewTabCards).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalled();

        resetNewTabReviewStorage();
    });

    it('ignores stale Anki source switch completions after switching back to JPDB', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb' as const,
            immersionKitEnabled: false,
        };
        const firstSettingsSave = deferred<void>();
        let settingsSaveCalls = 0;
        const onSettingsChange = vi.fn(() => {
            settingsSaveCalls++;
            return settingsSaveCalls === 1 ? firstSettingsSave.promise : Promise.resolve();
        });
        const controller = newTabPromptController(settings, { onSettingsChange });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const loadedSources: string[] = [];
        const internals = controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto(root: HTMLElement, preferStoredWord: boolean, options: { useOfflineCache: boolean }): Promise<void>;
            switchReviewSource(root: HTMLElement, source: 'anki' | 'jpdb'): Promise<void>;
        };
        internals.state = { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false };
        internals.loadWordsInto = vi.fn(async () => {
            loadedSources.push(internals.state.source);
        });

        try {
            const ankiSwitch = internals.switchReviewSource(root, 'anki');
            expect(settings.newTabSource).toBe('anki');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Loading...');

            await internals.switchReviewSource(root, 'jpdb');
            expect(settings.newTabSource).toBe('jpdb');
            expect(loadedSources).toEqual(['jpdb']);

            firstSettingsSave.resolve();
            await ankiSwitch;

            expect(loadedSources).toEqual(['jpdb']);
        } finally {
            root.remove();
        }
    });

    it('restores a rendered card when navigation supplement loading fails', async () => {
        const card = newTabTestCard({ spelling: '一番', reading: 'いちばん', source: 'local', reviewSource: 'dictionary' });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabSource: 'dictionary' as const,
            immersionKitEnabled: false,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            reviewCountMode: boolean;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
            loadNavigationSupplementCards(source: 'dictionary'): Promise<JPDBCard[]>;
            loadMoreForNavigation(root: HTMLElement, direction: 1, source: 'dictionary'): Promise<void>;
        };
        Object.assign(internals, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            sourceLabel: 'Dictionary',
            reviewCountMode: false,
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'dictionary', revealAnswer: false },
        });
        internals.loadNavigationSupplementCards = vi.fn(async () => {
            throw new Error('dictionary unavailable');
        });

        try {
            internals.renderWord(root, card);

            await internals.loadMoreForNavigation(root, 1, 'dictionary');

            expect(newTabPromptText(root)).toBe('一番');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(root.querySelector('[data-newtab-status]')?.textContent).not.toContain('Looking for more words');
        } finally {
            root.remove();
        }
    });

    it('keeps the Anki-only status pill inert and lists sources only in the dropdown', () => {
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                jpdbMiningEnabled: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { search: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
            } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderEnabledNewTabRoot(controller);
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [ankiCard],
            sourceLabel: 'Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, ankiCard);

        const status = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(status.textContent).toBe('1 / 1');
        expect(status.dataset.newtabAction).toBeUndefined();
        expect(status.dataset.sourceToggleTarget).toBeUndefined();
        expect(status.title).toBe('');
        expect(status.disabled).toBe(true);
        expect(newTabSourceSelect(root).value).toBe('anki');
        // The dropdown lists Dictionary as an explicit destination — unlike
        // the old cycle-toggle, picking it is a deliberate choice, not a
        // misleading implied alternative.
        expect(newTabSourceSelectValues(root)).toEqual(['anki', 'dictionary']);
    });

    it('falls back to study words when the selected Anki source has no card lister', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('見る', 'みる', 'to see')]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            await controller.renderPage();

            expect(newTabPromptText()).toBe('見る');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('lets JPDB users switch to study words when Anki is enabled but unavailable', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabSource: 'jpdb' as const,
            newTabAnkiEnabled: true,
            immersionKitEnabled: false,
        };
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
        });
        const { controller, root } = newTabVisibleWordFixture(settings, {
            card,
            sourceLabel: 'JPDB',
            source: 'jpdb',
            revealAnswer: false,
            controllerOverrides: {
                jpdbReviewBridge: {
                    onUpdate: () => () => {},
                    latestStatus: () => ({ connected: false }),
                } as never,
                parser: {
                    cacheCards: vi.fn(),
                    localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
                } as never,
                dictionaries: {
                    summary: vi.fn(async () => newTabLocalDictionarySummary()),
                    listRandomTopTerms: vi.fn(async () => [newTabLocalDictionaryEntry('読む', 'よむ', 'to read')]),
                } as never,
            },
        });

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(newTabSourceSelectValues(root)).toContain('anki');

            switchNewTabSource('anki', root);

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(newTabPromptText(root)).toBe('読む');
                expect(newTabSourceSelect(root).value).toBe('dictionary');
                expect(root.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
            });
        } finally {
            root.remove();
        }
    });

    it('defaults auto source to Anki when Anki is connected and JPDB is not configured', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto' as const,
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const listNewTabCards = vi.fn(async () => [ankiCard]);
        const listDeckCards = vi.fn(async () => [newTabTestCard({ spelling: '日本語', reading: 'にほんご', source: 'jpdb' })]);
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        try {
            await controller.renderPage();

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('anki');
            expect(newTabPromptText()).toBe('暗記');
            expect(settings.newTabSource).toBe('auto');
            expect(listNewTabCards).toHaveBeenCalledTimes(1);
            expect(listDeckCards).not.toHaveBeenCalled();
            expect(publicSearch).not.toHaveBeenCalled();
            expect(listRandomTopTerms).not.toHaveBeenCalled();
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('falls back to study words instead of JPDB when switching explicitly from JPDB to an empty Anki queue', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb' });
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards: vi.fn(async () => [jpdbCard]) } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        await controller.renderPage();
        expect(newTabPromptText()).toBe('日本語');
        listRandomTopTerms.mockClear();

        switchNewTabSource('anki');
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).not.toBe('日本語');
            expect(newTabSourceSelect().value).toBe('anki');
        });

        expect(listNewTabCards).toHaveBeenCalledTimes(2);
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).not.toBe('日本語');
        expect(newTabSourceSelectValues()).toContain('jpdb');

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('keeps JPDB visible in the dictionary source rows when disabled', () => {
        const rows = definitionSourceRows({
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: false,
        });

        const jpdb = rows.find(row => row.name === 'JPDB');
        const jiten = rows.find(row => row.name === 'Jiten');
        expect(jpdb).toBeTruthy();
        expect(jpdb?.enabled).toBe(false);
        expect(jiten).toBeTruthy();
        expect(jiten?.enabled).toBe(true);
    });

    it('keeps auto JPDB review cards strict for a tiny queue', async () => {
        const jpdbCard: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
        const loadDictionary = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDecks: vi.fn(async () => [{ id: 'deck', name: 'Deck' }]),
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                localCardFromEntry: vi.fn(() => ({ ...jpdbCard, spelling: '書く', reading: 'かく', source: 'local' })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms: loadDictionary,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['読む']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(loadDictionary).not.toHaveBeenCalled();
    });

    it('does not navigate from a single SRS card into supplemental dictionary cards', async () => {
        resetNewTabReviewStorage();
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const dictionaryCard = newTabTestCard({ vid: -2, sid: 0, spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => dictionaryCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        await controller.renderPage();
        expectNewTabPromptText('読む');
        expect(listRandomTopTerms).not.toHaveBeenCalled();

        advanceNewTabStudyCard(document, 3);
        expectNewTabPromptText('読む');

        resetNewTabReviewStorage();
    });

    it('loads another dictionary batch when next reaches the end of the visible queue', async () => {
        resetNewTabReviewStorage();
        const batches = [
            [newTabLocalDictionaryEntry('読む', 'よむ', 'to read')],
            [newTabLocalDictionaryEntry('書く', 'かく', 'to write')],
        ];
        const listRandomTopTerms = vi.fn(async () => batches.shift() ?? []);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
                immersionKitEnabled: false,
            }), dictionaryBatchOverrides(listRandomTopTerms));

        await controller.renderPage();
        expectNewTabPromptText('読む');

        advanceNewTabStudyCard(document, 3);

        await waitForExpect(() => {
            expectNewTabPromptText('書く');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む', '書く']);
        });
        expect(listRandomTopTerms).toHaveBeenCalledTimes(2);

        resetNewTabReviewStorage();
    });

    it('migrates legacy kanji state into the shared queue and loads the next dictionary word', async () => {
        document.body.replaceChildren();
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'kanji',
            sort: 'random',
            filter: 'study',
            source: 'dictionary',
            revealAnswer: false,
        }));
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const batches = [
            [newTabLocalDictionaryEntry('日本', 'にほん', 'Japan')],
            [newTabLocalDictionaryEntry('語学', 'ごがく', 'language study')],
        ];
        const listRandomTopTerms = vi.fn(async () => batches.shift() ?? []);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            ...dictionaryBatchOverrides(listRandomTopTerms),
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            await controller.renderPage();
            await waitForExpect(() => {
                const state = controller as unknown as { visibleWords: JPDBCard[]; index: number };
                expect(state.visibleWords[state.index]?.spelling).toBe('日本');
            });

            showNextNewTabWord(controller);

            await waitForExpect(() => {
                const state = controller as unknown as { visibleWords: JPDBCard[]; index: number };
                expect(state.visibleWords[state.index]?.spelling).toBe('語学');
                expect(state.visibleWords.map(card => card.spelling)).toEqual(['日本', '語学']);
            });
            expect(listRandomTopTerms).toHaveBeenCalledTimes(2);
            expect((controller as unknown as { state: object }).state).toMatchObject({ route: 'study', source: 'dictionary' });
            expect((controller as unknown as { state: object }).state).not.toHaveProperty('mode');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('uses JPDB cards first in auto source without interleaving Anki cards', async () => {
        const jpdbCards = [
            newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb' }),
            newTabTestCard({ vid: 2, sid: 1, spelling: '辞書', reading: 'じしょ', source: 'jpdb' }),
            newTabTestCard({ vid: 3, sid: 1, spelling: '復習', reading: 'ふくしゅう', source: 'jpdb' }),
        ];
        const ankiCards = [
            newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ vid: -2, sid: -2, spelling: '例文', reading: 'れいぶん', source: 'anki', reviewSource: 'anki' }),
        ];
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => ankiCards),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => jpdbCards),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['日本語', '辞書', '復習', '暗記', '例文']);
        expect(result.sourceLabel).toBe('JPDB + Anki');
    });

    it('loads Anki new-tab reviews when Anki is enabled', async () => {
        document.body.replaceChildren();
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'anki',
            revealAnswer: false,
        }));
        const ankiCards = [
            newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' }),
        ];
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => ankiCards),
            } as never,
        });

        try {
            await controller.renderPage();

            await waitForExpect(() => {
                expect(newTabPromptText()).toBe('暗記');
            });
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('uses Anki in auto source when JPDB has no cards', async () => {
        const ankiCards = [
            newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ vid: -2, sid: -2, spelling: '例文', reading: 'れいぶん', source: 'anki', reviewSource: 'anki' }),
        ];
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => ankiCards),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => []),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['暗記', '例文']);
        expect(result.sourceLabel).toBe('Anki');
    });

    it('requests a larger Anki batch when navigation reaches the end of the review queue', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const first = newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const second = newTabTestCard({ vid: -2, sid: -2, spelling: '例文', reading: 'れいぶん', source: 'anki', reviewSource: 'anki' });
        const listNewTabCards = vi.fn(async (limit = 180) => limit > 180 ? [first, second] : [first]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
                apiKey: '',
                immersionKitEnabled: false,
            }),
            anki: {
                listNewTabCards,
            } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {
                hasDictionaries: vi.fn(async () => false),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(newTabPromptText()).toBe('暗記');

        showNextNewTabWord(controller);

        await waitForExpect(() => {
            expect(newTabPromptText()).toBe('例文');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['暗記', '例文']);
        });
        expect(listNewTabCards).toHaveBeenNthCalledWith(1, 180, undefined);
        expect(listNewTabCards).toHaveBeenNthCalledWith(2, 181, undefined);

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });
});
