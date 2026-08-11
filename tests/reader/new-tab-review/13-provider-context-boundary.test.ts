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
