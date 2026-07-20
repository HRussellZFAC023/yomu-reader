import { isNonNullObject as isRecord } from '../core/object-utils';
import { gmStorageGet, gmStorageSet } from '../app/storage';
import type { CardState } from '../app/types';
import type { BunproClient } from './bunpro';

// Bunpro has no "all reviews" endpoint (/reviews 500s); the stats surface's
// per-tier listing is the only enumerable view of the user's vocab reviews.
// Tier names match /user_stats/srs_level_overview buckets.
const BUNPRO_SRS_TIERS = ['beginner', 'adept', 'seasoned', 'expert', 'master', 'ghost'] as const;
const BUNPRO_WORD_STATES_STORAGE_KEY = 'yomu:bunpro-word-states:v1';
const BUNPRO_WORD_STATES_TTL_MS = 6 * 60 * 60 * 1_000;
const BUNPRO_WORD_STATES_RETRY_BACKOFF_MS = 5 * 60 * 1_000;
const BUNPRO_WORD_STATES_MAX_PAGES = 50;

type BunproSrsTier = (typeof BUNPRO_SRS_TIERS)[number];

export interface BunproWordStateEntry {
    /** Rest state mapped onto the shared card-state tiers. */
    state: CardState;
    /** Epoch ms of the next review, when Bunpro reported one. */
    dueAt: number | null;
}

export type BunproWordStateMap = Map<string, BunproWordStateEntry>;

interface StoredBunproWordStates {
    fetchedAt: number;
    /** Fingerprint of the credential the index was fetched with. */
    credential?: string;
    states: Record<string, { s: string; d: number | null }>;
}

interface BunproWordStateStoreControl {
    clear(): void;
}

/**
 * Cached expression -> SRS-state index of the user's Bunpro vocab reviews.
 * Loads from GM storage when fresh, otherwise pages through the per-tier
 * srs_level_details listings once and persists the result.
 */
export class BunproWordStateStore implements BunproWordStateStoreControl {
    private states: BunproWordStateMap | null = null;
    private pending: Promise<BunproWordStateMap | null> | null = null;

    constructor(
        private readonly client: Pick<BunproClient, 'getSrsOverview' | 'getSrsLevelDetails' | 'hasFrontendCredential' | 'frontendCredentialFingerprint'>,
        private readonly ttlMs = BUNPRO_WORD_STATES_TTL_MS,
    ) {}

    /** Drop the in-memory index (settings may have changed). The persisted
     * cache stays — it is validated against the credential fingerprint on the
     * next load, so a token swap can never colour from the previous account
     * while an unrelated settings change keeps the cheap warm cache. */
    clear(): void {
        this.states = null;
        this.retryAfter = 0;
    }

    async load(now = Date.now()): Promise<BunproWordStateMap | null> {
        if (this.states) return this.states;
        if (now < this.retryAfter) return null;
        this.pending ??= this.loadFresh(now).finally(() => { this.pending = null; });
        return this.pending;
    }

    private retryAfter = 0;

    private async loadFresh(now: number): Promise<BunproWordStateMap | null> {
        const credential = this.client.frontendCredentialFingerprint();
        const stored = await gmStorageGet<StoredBunproWordStates | null>(BUNPRO_WORD_STATES_STORAGE_KEY, null);
        const storedForUser = stored && (stored.credential ?? '') === credential ? stored : null;
        const cached = restoreBunproWordStates(storedForUser);
        if (cached && storedForUser && now - storedForUser.fetchedAt < this.ttlMs) {
            this.states = cached;
            return cached;
        }
        if (!this.client.hasFrontendCredential()) return cached;
        try {
            const fetched = await fetchBunproWordStates(this.client);
            await gmStorageSet(BUNPRO_WORD_STATES_STORAGE_KEY, persistableBunproWordStates(fetched, now, credential));
            this.states = fetched;
            return fetched;
        } catch {
            // Keep colouring from the stale index rather than dropping it. With
            // no cache at all, back off instead of re-running the full tier
            // enumeration on every scan pass while bunpro.jp is erroring.
            this.states = cached;
            if (!cached) this.retryAfter = now + BUNPRO_WORD_STATES_RETRY_BACKOFF_MS;
            return cached;
        }
    }
}

/** The state a matched word should render with right now (due-aware). */
export function effectiveBunproWordState(entry: BunproWordStateEntry, now = Date.now()): CardState {
    const duePromotable = entry.state === 'learning' || entry.state === 'known';
    if (duePromotable && entry.dueAt !== null && entry.dueAt <= now) return 'due';
    return entry.state;
}

export async function fetchBunproWordStates(
    client: Pick<BunproClient, 'getSrsOverview' | 'getSrsLevelDetails'>,
): Promise<BunproWordStateMap> {
    const overview = await client.getSrsOverview();
    const vocabCounts = tierCounts(overview);
    const states: BunproWordStateMap = new Map();
    let pageBudget = BUNPRO_WORD_STATES_MAX_PAGES;
    for (const tier of BUNPRO_SRS_TIERS) {
        if (!vocabCounts[tier]) continue;
        let page = 1;
        let pages = 1;
        while (page <= pages && pageBudget > 0) {
            pageBudget -= 1;
            const response = await client.getSrsLevelDetails(tier, 'Vocab', page);
            pages = Math.min(pageCount(response), page + pageBudget);
            collectBunproWordStates(response, tier, states);
            page += 1;
        }
    }
    return states;
}

function collectBunproWordStates(response: unknown, tier: string, states: BunproWordStateMap): void {
    const reviews = objectAt(response, 'reviews') ?? (isRecord(response) ? response : null);
    if (!reviews) return;
    const titles = reviewableTitlesById(arrayAt(reviews, 'included'));
    for (const review of arrayAt(reviews, 'data')) {
        addBunproWordState(review, tier, titles, states);
    }
}

function addBunproWordState(review: unknown, tier: string, titles: Map<string, string>, states: BunproWordStateMap): void {
    const attributes = objectAt(review, 'attributes') ?? (isRecord(review) ? review : null);
    if (!attributes) return;
    const title = titles.get(String(attributes.reviewable_id ?? ''));
    if (!title) return;
    states.set(title, {
        state: bunproTierCardState(tier, numberAt(attributes, 'streak')),
        dueAt: parseEpoch(attributes.next_review),
    });
}

export function bunproTierCardState(tier: string, streak: number | null): CardState {
    if (tier === 'ghost') return 'failed';
    if (tier === 'master') return 'known';
    if (streak !== null && streak <= 0) return 'new';
    return 'learning';
}

function reviewableTitlesById(included: unknown[]): Map<string, string> {
    const titles = new Map<string, string>();
    for (const item of included) {
        const attributes = objectAt(item, 'attributes');
        if (!attributes) continue;
        const id = String(attributes.id ?? '');
        const title = typeof attributes.title === 'string' ? attributes.title.trim() : '';
        if (id && title) titles.set(id, title);
    }
    return titles;
}

function tierCounts(overview: unknown): Partial<Record<BunproSrsTier, number>> {
    const vocab = objectAt(overview, 'vocab');
    const counts: Partial<Record<BunproSrsTier, number>> = {};
    for (const tier of BUNPRO_SRS_TIERS) {
        const count = numberAt(vocab, tier);
        // Without an overview (unexpected shape) probe every tier once.
        counts[tier] = count ?? (vocab ? 0 : 1);
    }
    return counts;
}

function pageCount(response: unknown): number {
    return numberAt(objectAt(response, 'pagy'), 'pages') ?? 1;
}

function restoreBunproWordStates(stored: StoredBunproWordStates | null): BunproWordStateMap | null {
    if (!stored || !isRecord(stored.states)) return null;
    const states: BunproWordStateMap = new Map();
    for (const [expression, entry] of Object.entries(stored.states)) {
        if (!isRecord(entry) || typeof entry.s !== 'string') continue;
        states.set(expression, {
            state: entry.s as CardState,
            dueAt: typeof entry.d === 'number' ? entry.d : null,
        });
    }
    return states;
}

function persistableBunproWordStates(states: BunproWordStateMap, fetchedAt: number, credential: string): StoredBunproWordStates {
    const stored: StoredBunproWordStates['states'] = {};
    states.forEach((entry, expression) => {
        stored[expression] = { s: entry.state, d: entry.dueAt };
    });
    return { fetchedAt, credential, states: stored };
}

function parseEpoch(value: unknown): number | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function numberAt(value: unknown, key: string): number | null {
    if (!isRecord(value)) return null;
    const raw = Number(value[key]);
    return Number.isFinite(raw) ? raw : null;
}

function arrayAt(value: unknown, key: string): unknown[] {
    if (!isRecord(value)) return [];
    const raw = value[key];
    return Array.isArray(raw) ? raw : [];
}

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
    const nested = isRecord(value) ? value[key] : null;
    return isRecord(nested) && !Array.isArray(nested) ? nested : null;
}
