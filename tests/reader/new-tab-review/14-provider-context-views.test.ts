import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    deferred,
    newTabBareController,
    newTabSearchResultsText,
    newTabTestCard,
    registerNewTabReviewCleanup,
    renderBoundNewTabSearchRoot,
    renderEnabledNewTabRoot,
    renderLoadedApiStats,
    waitForExpect,
} from './fixtures';

type ProviderSearchEntry = {
    expression: string;
    reading: string;
    glossary: string[];
    score: number;
    dictionary: string;
};

describe('new tab review — provider context view invalidation', () => {
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
