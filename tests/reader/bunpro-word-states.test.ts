import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BunproWordStateStore,
    bunproTierCardState,
    effectiveBunproWordState,
    fetchBunproWordStates,
} from '../../src/reader/bunpro/word-states';
import {
    registerRenderedWordPrivateState,
    renderedWordPrivateValue,
} from '../../src/reader/dom/rendered-word-private-state';
import { applyBunproStateToRenderedWord } from '../../src/reader/dom/rendered-word-state';
import { shouldLookupBunproWordStates } from '../../src/reader/settings/index';

const STORAGE_KEY = 'yomu:bunpro-word-states:v1';

interface FixtureEntry {
    reviewId: number;
    reviewableId: number;
    title: string;
    streak: number;
    nextReview?: string;
}

// Shape live-verified against /user_stats/srs_level_details (JSON:API reviews
// envelope + sideloaded reviewable attributes + pagy pagination).
function detailsPage(entries: FixtureEntry[], pages = 1): unknown {
    return {
        type: 'regular',
        reviews: {
            data: entries.map(entry => ({
                id: String(entry.reviewId),
                type: 'review',
                attributes: {
                    id: entry.reviewId,
                    streak: entry.streak,
                    next_review: entry.nextReview ?? '2999-01-01T00:00:00.000Z',
                    reviewable_id: entry.reviewableId,
                    reviewable_type: 'Vocab',
                },
            })),
            included: entries.map(entry => ({
                id: String(entry.reviewableId),
                type: 'reviewable_base_attribute_mixed',
                attributes: { id: entry.reviewableId, slug: entry.title, title: entry.title, type_pascal: 'Vocab' },
            })),
        },
        pagy: { pages, page: 1 },
    };
}

function overview(vocab: Record<string, number>): unknown {
    return {
        grammar: { beginner: 0, adept: 0, seasoned: 0, expert: 0, master: 0, ghost: 0, self_study: 0 },
        vocab: { beginner: 0, adept: 0, seasoned: 0, expert: 0, master: 0, ghost: 0, self_study: 0, ...vocab },
    };
}

describe('bunpro word state mapping', () => {
    it('maps Bunpro SRS tiers onto the shared jpdb/jiten visual tiers', () => {
        expect(bunproTierCardState('beginner', 0)).toBe('new');
        expect(bunproTierCardState('beginner', 2)).toBe('learning');
        expect(bunproTierCardState('adept', 5)).toBe('learning');
        expect(bunproTierCardState('seasoned', 7)).toBe('learning');
        expect(bunproTierCardState('expert', 9)).toBe('learning');
        expect(bunproTierCardState('master', 12)).toBe('known');
        expect(bunproTierCardState('ghost', 3)).toBe('failed');
    });

    it('promotes learning/known words with a past next_review to due', () => {
        const now = Date.parse('2026-07-05T12:00:00.000Z');
        const past = now - 60_000;
        const future = now + 60_000;
        expect(effectiveBunproWordState({ state: 'learning', dueAt: past }, now)).toBe('due');
        expect(effectiveBunproWordState({ state: 'known', dueAt: past }, now)).toBe('due');
        expect(effectiveBunproWordState({ state: 'learning', dueAt: future }, now)).toBe('learning');
        expect(effectiveBunproWordState({ state: 'new', dueAt: past }, now)).toBe('new');
        expect(effectiveBunproWordState({ state: 'failed', dueAt: past }, now)).toBe('failed');
        expect(effectiveBunproWordState({ state: 'learning', dueAt: null }, now)).toBe('learning');
    });
});

describe('fetchBunproWordStates', () => {
    it('collects states per tier and skips empty tiers', async () => {
        const getSrsLevelDetails = vi.fn(async (level: string, _type: string, _page: number) => {
            if (level === 'beginner') {
                return detailsPage([
                    { reviewId: 1, reviewableId: 11, title: '物価', streak: 0 },
                    { reviewId: 2, reviewableId: 12, title: '読む', streak: 3 },
                ]);
            }
            if (level === 'master') return detailsPage([{ reviewId: 3, reviewableId: 13, title: '猫', streak: 12 }]);
            return detailsPage([{ reviewId: 4, reviewableId: 14, title: '犬', streak: 2 }]);
        });
        const states = await fetchBunproWordStates({
            getSrsOverview: async () => overview({ beginner: 2, master: 1, ghost: 1 }),
            getSrsLevelDetails,
        });
        expect(states.get('物価')?.state).toBe('new');
        expect(states.get('読む')?.state).toBe('learning');
        expect(states.get('猫')?.state).toBe('known');
        expect(states.get('犬')?.state).toBe('failed');
        expect(getSrsLevelDetails.mock.calls.map(([level]) => level).sort()).toEqual(['beginner', 'ghost', 'master']);
        expect(getSrsLevelDetails.mock.calls.every(([, type]) => type === 'Vocab')).toBe(true);
    });

    it('walks pagy pagination within one tier', async () => {
        const getSrsLevelDetails = vi.fn(async (_level: string, _type: string, page: number) => {
            return page === 1
                ? detailsPage([{ reviewId: 1, reviewableId: 11, title: '一', streak: 1 }], 2)
                : detailsPage([{ reviewId: 2, reviewableId: 12, title: '二', streak: 1 }], 2);
        });
        const states = await fetchBunproWordStates({
            getSrsOverview: async () => overview({ adept: 300 }),
            getSrsLevelDetails,
        });
        expect(getSrsLevelDetails).toHaveBeenCalledTimes(2);
        expect(states.get('一')?.state).toBe('learning');
        expect(states.get('二')?.state).toBe('learning');
    });
});

describe('BunproWordStateStore', () => {
    beforeEach(() => {
        localStorage.removeItem(STORAGE_KEY);
    });

    it('fetches once, persists, and reuses the in-memory index', async () => {
        const client = {
            hasFrontendCredential: () => true,
            frontendCredentialFingerprint: () => 'fp',
            getSrsOverview: vi.fn(async () => overview({ beginner: 1 })),
            getSrsLevelDetails: vi.fn(async () => detailsPage([{ reviewId: 1, reviewableId: 11, title: '読む', streak: 2 }])),
        };
        const store = new BunproWordStateStore(client);
        const first = await store.load();
        const second = await store.load();
        expect(first?.get('読む')?.state).toBe('learning');
        expect(second).toBe(first);
        expect(client.getSrsOverview).toHaveBeenCalledTimes(1);
        const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        expect(persisted?.states?.['読む']?.s).toBe('learning');
    });

    it('serves a fresh persisted index without hitting the network', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            fetchedAt: Date.now(),
            credential: 'fp',
            states: { '物価': { s: 'known', d: null } },
        }));
        const client = {
            hasFrontendCredential: () => true,
            frontendCredentialFingerprint: () => 'fp',
            getSrsOverview: vi.fn(async () => overview({})),
            getSrsLevelDetails: vi.fn(async () => detailsPage([])),
        };
        const states = await new BunproWordStateStore(client).load();
        expect(states?.get('物価')?.state).toBe('known');
        expect(client.getSrsOverview).not.toHaveBeenCalled();
    });

    it('falls back to a stale persisted index when the refetch fails', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            fetchedAt: 0,
            credential: 'fp',
            states: { '読む': { s: 'learning', d: null } },
        }));
        const client = {
            hasFrontendCredential: () => true,
            frontendCredentialFingerprint: () => 'fp',
            getSrsOverview: vi.fn(async () => { throw new Error('offline'); }),
            getSrsLevelDetails: vi.fn(async () => detailsPage([])),
        };
        const states = await new BunproWordStateStore(client).load();
        expect(client.getSrsOverview).toHaveBeenCalledTimes(1);
        expect(states?.get('読む')?.state).toBe('learning');
    });

    it('rejects a persisted index fetched with a different credential', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            fetchedAt: Date.now(),
            credential: 'other-user',
            states: { '物価': { s: 'known', d: null } },
        }));
        const client = {
            hasFrontendCredential: () => true,
            frontendCredentialFingerprint: () => 'fp',
            getSrsOverview: vi.fn(async () => overview({ beginner: 1 })),
            getSrsLevelDetails: vi.fn(async () => detailsPage([{ reviewId: 1, reviewableId: 11, title: '読む', streak: 2 }])),
        };
        const states = await new BunproWordStateStore(client).load();
        // The other account's cache never colours this user's pages.
        expect(states?.get('物価')).toBeUndefined();
        expect(states?.get('読む')?.state).toBe('learning');
        expect(client.getSrsOverview).toHaveBeenCalledTimes(1);
    });

    it('backs off after a failed fetch with no cache instead of refetching every call', async () => {
        const client = {
            hasFrontendCredential: () => true,
            frontendCredentialFingerprint: () => 'fp',
            getSrsOverview: vi.fn(async () => { throw new Error('offline'); }),
            getSrsLevelDetails: vi.fn(async () => detailsPage([])),
        };
        const store = new BunproWordStateStore(client);
        const start = Date.now();
        expect(await store.load(start)).toBeNull();
        expect(await store.load(start + 1_000)).toBeNull();
        expect(await store.load(start + 60_000)).toBeNull();
        expect(client.getSrsOverview).toHaveBeenCalledTimes(1);
        // After the backoff window a retry is allowed again.
        await store.load(start + 6 * 60_000);
        expect(client.getSrsOverview).toHaveBeenCalledTimes(2);
    });
});

describe('applyBunproStateToRenderedWord', () => {
    function renderedWord(className: string, cardState: string, cardSource = 'local'): HTMLElement {
        const word = document.createElement('span');
        word.className = className;
        word.dataset.expression = '読む';
        registerRenderedWordPrivateState(word, {
            cardSource,
            cardState: cardState || undefined,
            stateProvenance: 'provisional',
        });
        return word;
    }

    it('colours a provider-untracked word with the shared jpdb state tier', () => {
        const word = renderedWord('jpdb-reader-word jpdb-not-in-deck local-not-in-deck', 'not-in-deck');
        expect(applyBunproStateToRenderedWord(word, 'learning')).toBe(true);
        expect(word.classList.contains('jpdb-learning')).toBe(true);
        expect(word.classList.contains('bunpro-learning')).toBe(false);
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(false);
        expect(renderedWordPrivateValue(word, 'cardState')).toBe('learning');
        expect(renderedWordPrivateValue(word, 'bunproState')).toBe('learning');
    });

    it('never clobbers a real jpdb/jiten card state', () => {
        const word = renderedWord('jpdb-reader-word jpdb-mature', 'mature', 'jiten');
        expect(applyBunproStateToRenderedWord(word, 'learning')).toBe(false);
        expect(word.classList.contains('jpdb-mature')).toBe(true);
        expect(word.classList.contains('bunpro-learning')).toBe(false);
        expect(renderedWordPrivateValue(word, 'cardState')).toBe('mature');
    });

    it('swaps tiers in place when the Bunpro state changes', () => {
        const word = renderedWord('jpdb-reader-word jpdb-not-in-deck', 'not-in-deck');
        applyBunproStateToRenderedWord(word, 'learning');
        expect(applyBunproStateToRenderedWord(word, 'due')).toBe(true);
        expect(word.classList.contains('jpdb-due')).toBe(true);
        expect(word.classList.contains('bunpro-due')).toBe(false);
        expect(word.classList.contains('jpdb-learning')).toBe(false);
        expect(word.classList.contains('bunpro-learning')).toBe(false);
    });

    it('restores not-in-deck when the word leaves the Bunpro index', () => {
        const word = renderedWord('jpdb-reader-word jpdb-not-in-deck', 'not-in-deck');
        applyBunproStateToRenderedWord(word, 'known');
        expect(applyBunproStateToRenderedWord(word, null)).toBe(true);
        expect(word.classList.contains('jpdb-known')).toBe(false);
        expect(word.classList.contains('bunpro-known')).toBe(false);
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(true);
        expect(renderedWordPrivateValue(word, 'cardState')).toBe('not-in-deck');
        expect(renderedWordPrivateValue(word, 'bunproState')).toBeUndefined();
    });

    it('restores a blank provider state instead of inventing not-in-deck', () => {
        const word = renderedWord('jpdb-reader-word', '');
        applyBunproStateToRenderedWord(word, 'known');
        expect(applyBunproStateToRenderedWord(word, null)).toBe(true);
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(false);
        expect(word.classList.contains('jpdb-known')).toBe(false);
        expect(renderedWordPrivateValue(word, 'cardState')).toBeUndefined();
    });

    it('clears a stale source-prefixed class without restoring it offhost', () => {
        const word = renderedWord('jpdb-reader-word jpdb-not-in-deck jiten-not-in-deck', 'not-in-deck', 'jiten');
        expect(applyBunproStateToRenderedWord(word, 'learning')).toBe(true);
        expect(word.classList.contains('jiten-not-in-deck')).toBe(false);
        expect(word.classList.contains('jpdb-learning')).toBe(true);
        // Leaving the index restores the generic verdict without exposing its provider.
        applyBunproStateToRenderedWord(word, null);
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(true);
        expect(word.classList.contains('jiten-not-in-deck')).toBe(false);
        expect(renderedWordPrivateValue(word, 'cardState')).toBe('not-in-deck');
    });

    it('is a no-op for untracked words that stay untracked', () => {
        const word = renderedWord('jpdb-reader-word jpdb-not-in-deck', 'not-in-deck');
        expect(applyBunproStateToRenderedWord(word, null)).toBe(false);
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(true);
    });
});

// 2026-07-17: state colouring is a READ and follows the credential alone —
// the review/mining permission must not gate it (a token-configured user
// with mining off previously got no state colours anywhere).
describe('shouldLookupBunproWordStates gate', () => {
    it('colours from a valid credential even when mining is off', () => {
        expect(shouldLookupBunproWordStates({
            bunproMiningEnabled: false,
            bunproFrontendApiToken: 'token-1234',
            bunproFrontendApiTokenExpiresAt: '',
        })).toBe(true);
    });

    it('requires an unexpired credential', () => {
        expect(shouldLookupBunproWordStates({
            bunproMiningEnabled: true,
            bunproFrontendApiToken: 'token-1234',
            bunproFrontendApiTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        })).toBe(false);
        expect(shouldLookupBunproWordStates({
            bunproMiningEnabled: true,
            bunproFrontendApiToken: '',
        })).toBe(false);
    });
});
