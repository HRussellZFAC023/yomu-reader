import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    deferred,
    newTabApiSourceController,
    newTabBareController,
    newTabTestCard,
    registerNewTabReviewCleanup,
    type JPDBCard,
} from './fixtures';
import { newTabSearchResultsText, renderBoundNewTabSearchRoot, renderEnabledNewTabRoot, renderLoadedApiStats, waitForExpect } from "./fixtures";

type ProviderBoundaryInternals = {
    allWords: JPDBCard[];
    browsePool?: JPDBCard[];
    loadBrowsePool(): Promise<JPDBCard[]>;
    loadWordsFromSource(source: 'jpdb'): Promise<{ cards: JPDBCard[] }>;
    sourceResultCache: Map<string, { result: { cards: JPDBCard[] } }>;
    state: { route: string; source: string; jpdbDeck: string; ankiDeck: string; revealAnswer: boolean };
    syncProviderContext(settings: typeof DEFAULT_SETTINGS): boolean;
};

describe('new tab provider-account context boundary', () => {
    registerNewTabReviewCleanup();

    it('invalidates a cached Study source and prevents a delayed old-account response from replacing the new cache', async () => {
        const oldRequest = deferred<JPDBCard[]>();
        const oldCard = newTabTestCard({ spelling: '旧口座', source: 'jpdb', reviewSource: 'jpdb-api' });
        const newCard = newTabTestCard({ spelling: '新口座', source: 'jpdb', reviewSource: 'jpdb-api' });
        const listDeckCards = vi.fn()
            .mockImplementationOnce(() => oldRequest.promise)
            .mockResolvedValueOnce([newCard]);
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'account-a',
            newTabSource: 'jpdb' as const,
            newTabJpdbDeck: 'deck-a',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
        };
        const controller = newTabApiSourceController(settings, {
            jpdb: { listDeckCards, clear: vi.fn() } as never,
        });
        const internals = controller as unknown as ProviderBoundaryInternals;
        internals.state = { ...internals.state, source: 'jpdb', jpdbDeck: 'deck-a' };

        const stale = internals.loadWordsFromSource('jpdb');
        await vi.waitFor(() => expect(listDeckCards).toHaveBeenCalledOnce());
        settings.apiKey = 'account-b';
        expect(internals.syncProviderContext(settings as never)).toBe(true);
        expect(internals.sourceResultCache.size).toBe(0);
        expect(internals.allWords).toEqual([]);

        const current = await internals.loadWordsFromSource('jpdb');
        expect(current.cards.map(card => card.spelling)).toEqual(['新口座']);
        oldRequest.resolve([oldCard]);
        expect((await stale).cards.map(card => card.spelling)).toEqual(['旧口座']);
        expect(internals.sourceResultCache.get('jpdb')?.result.cards.map(card => card.spelling)).toEqual(['新口座']);
        controller.destroy();
    });

    it.each([
        {
            label: 'a selected JPDB deck',
            initialSettings: { apiKey: 'account-a' },
            changeAccount: (settings: Record<string, unknown>) => { settings.apiKey = 'account-b'; },
            selectedDeck: 'deck-42',
            dependencies: (load: ReturnType<typeof vi.fn>) => ({ jpdb: { listDeckCards: load, clear: vi.fn() } as never }),
        },
        {
            label: 'the Jiten provider scope',
            initialSettings: { jitenApiKey: 'account-a' },
            changeAccount: (settings: Record<string, unknown>) => { settings.jitenApiKey = 'account-b'; },
            selectedDeck: 'provider:jiten',
            dependencies: (load: ReturnType<typeof vi.fn>) => ({ jiten: { listStudyBatchCards: load, clear: vi.fn() } as never }),
        },
    ])('partitions My Cards for $label and rejects the delayed old-account pool', async ({ initialSettings, changeAccount, selectedDeck, dependencies }) => {
        const oldRequest = deferred<JPDBCard[]>();
        const oldCard = newTabTestCard({ spelling: '前', source: selectedDeck === 'provider:jiten' ? 'jiten' : 'jpdb' });
        const newCard = newTabTestCard({ spelling: '後', source: selectedDeck === 'provider:jiten' ? 'jiten' : 'jpdb' });
        const load = vi.fn()
            .mockImplementationOnce(() => oldRequest.promise)
            .mockResolvedValueOnce([newCard]);
        const settings = { ...DEFAULT_SETTINGS, ...initialSettings };
        const controller = newTabBareController(settings, dependencies(load));
        const internals = controller as unknown as ProviderBoundaryInternals;
        internals.state = { ...internals.state, route: 'search', jpdbDeck: selectedDeck };

        const stale = internals.loadBrowsePool();
        await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
        changeAccount(settings);
        internals.syncProviderContext(settings as never);
        expect(internals.state.jpdbDeck).toBe('all');
        expect(internals.browsePool).toBeUndefined();

        internals.state.jpdbDeck = selectedDeck;
        expect((await internals.loadBrowsePool()).map(card => card.spelling)).toEqual(['後']);
        oldRequest.resolve([oldCard]);
        await expect(stale).resolves.toEqual([]);
        expect(internals.browsePool?.map(card => card.spelling)).toEqual(['後']);
        controller.destroy();
    });

    it('partitions the unscoped Anki My Cards pool by endpoint and profile', async () => {
        const oldRequest = deferred<JPDBCard[]>();
        const oldCard = newTabTestCard({ spelling: 'A', source: 'anki', reviewSource: 'anki', ankiCardId: 1 });
        const newCard = newTabTestCard({ spelling: 'B', source: 'anki', reviewSource: 'anki', ankiCardId: 2 });
        const listNewTabCards = vi.fn()
            .mockImplementationOnce(() => oldRequest.promise)
            .mockResolvedValueOnce([newCard]);
        const clearAccountContext = vi.fn();
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            ankiConnectUrl: 'http://account-a:8765',
            activeLanguageProfileId: 'profile-a',
        };
        const controller = newTabBareController(settings, {
            anki: { listNewTabCards, clearAccountContext } as never,
        });
        const internals = controller as unknown as ProviderBoundaryInternals;
        internals.state = { ...internals.state, route: 'search', jpdbDeck: 'all', ankiDeck: 'account-a-deck' };

        const stale = internals.loadBrowsePool();
        await vi.waitFor(() => expect(listNewTabCards).toHaveBeenCalledOnce());
        settings.ankiConnectUrl = 'http://account-b:8765';
        settings.activeLanguageProfileId = 'profile-b';
        internals.syncProviderContext(settings as never);
        expect(clearAccountContext).toHaveBeenCalledOnce();
        expect(internals.state.ankiDeck).toBe('all');

        expect((await internals.loadBrowsePool()).map(card => card.spelling)).toEqual(['B']);
        oldRequest.resolve([oldCard]);
        await expect(stale).resolves.toEqual([]);
        expect(internals.browsePool?.map(card => card.spelling)).toEqual(['B']);
        controller.destroy();
    });

    it('does not continue an old-account Anki review against the new account', async () => {
        const answer = deferred<void>();
        const answerCard = vi.fn(() => answer.promise);
        const findExistingCards = vi.fn(async () => ({ state: 'known', notes: [], primary: null }));
        const onAnkiStatusChanged = vi.fn();
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            ankiConnectUrl: 'http://account-a:8765',
        };
        const card = newTabTestCard({ spelling: '暗記', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const controller = newTabBareController(settings, {
            anki: { answerCard, findExistingCards } as never,
            onAnkiStatusChanged,
        });
        const internals = controller as unknown as ProviderBoundaryInternals & {
            submitAnkiGrade(card: JPDBCard, grade: 'okay'): Promise<unknown>;
        };

        const pending = internals.submitAnkiGrade(card, 'okay');
        await vi.waitFor(() => expect(answerCard).toHaveBeenCalledWith(404, 'okay'));
        settings.ankiConnectUrl = 'http://account-b:8765';
        internals.syncProviderContext(settings as never);
        answer.resolve(undefined);

        await expect(pending).resolves.toBeNull();
        expect(findExistingCards).not.toHaveBeenCalled();
        expect(onAnkiStatusChanged).not.toHaveBeenCalled();
        controller.destroy();
    });
});

describe('new tab review — provider context view invalidation', () => {
    type ProviderSearchEntry = {
        expression: string;
        reading: string;
        glossary: string[];
        score: number;
        dictionary: string;
    };


    registerNewTabReviewCleanup();

    it('re-runs a completed Search query after the provider account changes', async () => {
        const settings = { ...DEFAULT_SETTINGS, apiKey: 'account-a', immersionKitEnabled: false };
        const accountAEntry = { expression: '旧結果', reading: 'きゅうけっか', glossary: ['account A'], score: 20, dictionary: 'Local' };
        const accountBEntry = { expression: '新結果', reading: 'しんけっか', glossary: ['account B'], score: 20, dictionary: 'Local' };
        const searchTerms = vi.fn(async () => settings.apiKey === 'account-a' ? [accountAEntry] : [accountBEntry]);
        const harness = renderProviderContextSearchHarness(settings, searchTerms);

        await withProviderViewCleanup(() => harness.destroy(), async () => {
            harness.performSearch('result');
            await waitForExpect(() => expect(newTabSearchResultsText(harness.root)).toContain('旧結果'));

            settings.apiKey = 'account-b';
            await harness.controller.renderPage();

            await waitForExpect(() => {
                expect(searchTerms).toHaveBeenCalledTimes(2);
                expect(newTabSearchResultsText(harness.root)).toContain('新結果');
                expect(newTabSearchResultsText(harness.root)).not.toContain('旧結果');
            });
        });
    });

    it('does not let a delayed Search response from account A overwrite account B', async () => {
        const settings = { ...DEFAULT_SETTINGS, apiKey: 'account-a', immersionKitEnabled: false };
        const accountA = deferred<ProviderSearchEntry[]>();
        const accountB = deferred<ProviderSearchEntry[]>();
        const searchTerms = vi.fn(() => settings.apiKey === 'account-a' ? accountA.promise : accountB.promise);
        const harness = renderProviderContextSearchHarness(settings, searchTerms);

        await withProviderViewCleanup(() => harness.destroy(), async () => {
            harness.performSearch('result');
            await waitForExpect(() => expect(searchTerms).toHaveBeenCalledTimes(1));

            settings.apiKey = 'account-b';
            await harness.controller.renderPage();
            await waitForExpect(() => expect(searchTerms).toHaveBeenCalledTimes(2));

            accountB.resolve([{ expression: '新結果', reading: 'しんけっか', glossary: ['account B'], score: 20, dictionary: 'Local' }]);
            await waitForExpect(() => expect(newTabSearchResultsText(harness.root)).toContain('新結果'));

            accountA.resolve([{ expression: '旧結果', reading: 'きゅうけっか', glossary: ['account A'], score: 20, dictionary: 'Local' }]);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(newTabSearchResultsText(harness.root)).toContain('新結果');
            expect(newTabSearchResultsText(harness.root)).not.toContain('旧結果');
        });
    });

    it('re-runs cached Stats after the provider account changes', async () => {
        const settings = { ...DEFAULT_SETTINGS, apiKey: 'account-a', immersionKitEnabled: false };
        const accountACards = [newTabTestCard({ spelling: '旧統計', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] })];
        const accountBCards = [
            newTabTestCard({ vid: 2, spelling: '新統計一', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['known'] }),
            newTabTestCard({ vid: 3, spelling: '新統計二', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['known'] }),
            newTabTestCard({ vid: 4, spelling: '新統計三', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['learning'] }),
        ];
        const listDeckCards = vi.fn(async () => settings.apiKey === 'account-a' ? accountACards : accountBCards);
        const controller = newTabBareController(() => settings, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
        });
        const internals = controller as unknown as { state: { route: 'study' | 'search' | 'stats' } };
        internals.state.route = 'stats';

        await withProviderViewCleanup(() => {
            controller.destroy();
            document.body.replaceChildren();
        }, async () => {
            const root = await renderLoadedApiStats(controller);
            expect(statsProgressValues(root)).toEqual(['1', '0', '0 (0%)']);

            settings.apiKey = 'account-b';
            await controller.renderPage();

            await waitForExpect(() => {
                expect(listDeckCards).toHaveBeenCalledTimes(2);
                expect(statsProgressValues(root)).toEqual(['3', '1', '2 (67%)']);
            });
        });
    });

    it('does not let delayed Stats from account A overwrite account B', async () => {
        const settings = { ...DEFAULT_SETTINGS, apiKey: 'account-a', immersionKitEnabled: false };
        const accountA = deferred<ReturnType<typeof newTabTestCard>[]>();
        const accountB = deferred<ReturnType<typeof newTabTestCard>[]>();
        const listDeckCards = vi.fn(() => settings.apiKey === 'account-a' ? accountA.promise : accountB.promise);
        const controller = newTabBareController(() => settings, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const internals = controller as unknown as {
            state: { route: 'study' | 'search' | 'stats' };
            loadStatsInto(root: HTMLElement, force?: boolean): Promise<void>;
        };
        internals.state.route = 'stats';

        await withProviderViewCleanup(() => {
            controller.destroy();
            document.body.replaceChildren();
        }, async () => {
            const accountALoad = internals.loadStatsInto(root, true);
            await waitForExpect(() => expect(listDeckCards).toHaveBeenCalledTimes(1));

            settings.apiKey = 'account-b';
            await controller.renderPage();
            await waitForExpect(() => expect(listDeckCards).toHaveBeenCalledTimes(2));

            accountB.resolve([
                newTabTestCard({ spelling: '新統計一', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['known'] }),
                newTabTestCard({ vid: 2, spelling: '新統計二', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['known'] }),
            ]);
            await waitForExpect(() => expect(statsProgressValues(root)).toEqual(['2', '0', '2 (100%)']));

            accountA.resolve([newTabTestCard({ spelling: '旧統計', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] })]);
            await accountALoad;
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(statsProgressValues(root)).toEqual(['2', '0', '2 (100%)']);
        });
    });


    function renderProviderContextSearchHarness(settings: typeof DEFAULT_SETTINGS, searchTerms: unknown) {
        const controller = newTabBareController(() => settings, {
            parser: {
                parse: vi.fn(async () => [[]]),
                localCardFromEntry: vi.fn((entry: ProviderSearchEntry) => newTabTestCard({
                    spelling: entry.expression,
                    reading: entry.reading,
                    meanings: [{ glosses: entry.glossary, partOfSpeech: [] }],
                    source: 'local',
                })),
            } as never,
            dictionaries: {
                hasDictionaries: vi.fn(async () => true),
                summary: vi.fn(async () => ({ dictionaries: [], terms: 2, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
                searchTerms,
            } as never,
        });
        const root = renderBoundNewTabSearchRoot(controller, 'dictionary');
        const internals = controller as unknown as {
            state: { route: 'study' | 'search' | 'stats' };
            searchController: { performSearch(root: HTMLElement, query: string): void };
        };
        internals.state.route = 'search';

        return {
            controller,
            root,
            performSearch(query: string) {
                internals.searchController.performSearch(root, query);
            },
            destroy() {
                controller.destroy();
                document.body.replaceChildren();
            },
        };
    }

    function statsProgressValues(root: HTMLElement): string[] {
        return Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-stats-progress-item strong'))
            .map(element => element.textContent ?? '');
    }

    async function withProviderViewCleanup(cleanup: () => void, run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } finally {
            cleanup();
        }
    }
});
