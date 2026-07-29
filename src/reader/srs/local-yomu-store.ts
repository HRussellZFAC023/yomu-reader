import {
    gmStorageDelete,
    gmStorageGet,
    gmStorageSet,
} from '../app/storage';
import {
    mergeStoredYomuSrsDecks,
    normalizeStoredYomuSrsDeck,
    type StoredYomuSrsCard,
    type StoredYomuSrsDeck,
} from './local-yomu-deck';

const LEGACY_DECK_KEY = 'yomu:srs-local:v1';
const DECK_INDEX_KEY = 'yomu:srs-local:v2:index';
const CARD_KEY_PREFIX = 'yomu:srs-local:v2:card:';
const TOMBSTONE_KEY_PREFIX = 'yomu:srs-local:v2:tombstone:';

interface StoredYomuSrsIndex {
    readonly version: 2;
    readonly revision: number;
    readonly cardIds: readonly string[];
    readonly tombstoneIds: readonly string[];
}

export class LocalYomuSrsStorageError extends Error {
    constructor(options?: ErrorOptions) {
        super('Your Academy deck could not be saved. Browser storage may be full. Free some site storage, then try again.', options);
        this.name = 'LocalYomuSrsStorageError';
    }
}

export function isLocalYomuSrsStorageError(error: unknown): error is LocalYomuSrsStorageError {
    return error instanceof LocalYomuSrsStorageError
        || Boolean(error && typeof error === 'object' && (error as { name?: unknown }).name === 'LocalYomuSrsStorageError');
}

/**
 * Persists the local deck as independently addressable cards and tombstones.
 * The small index is committed after new records and before obsolete records
 * are removed, so an interrupted write never points at an uncommitted new id.
 */
export class LocalYomuSrsStore {
    async read(): Promise<StoredYomuSrsDeck> {
        const rawIndex = await gmStorageGet<unknown>(DECK_INDEX_KEY, null);
        const index = normalizeIndex(rawIndex);
        const current = index ? await this.readIndexedDeck(index) : normalizeStoredYomuSrsDeck(null);
        const legacy = await gmStorageGet<unknown>(LEGACY_DECK_KEY, null);
        if (legacy === null || legacy === undefined) return current;

        const migrated = mergeStoredYomuSrsDecks(current, legacy);
        await this.write(current, migrated);
        await gmStorageDelete(LEGACY_DECK_KEY);
        return migrated;
    }

    async write(previousValue: StoredYomuSrsDeck, nextValue: StoredYomuSrsDeck): Promise<void> {
        const previous = normalizeStoredYomuSrsDeck(previousValue);
        const next = normalizeStoredYomuSrsDeck(nextValue);
        const previousIndex = indexForDeck(previous);
        const storedIndex = normalizeIndex(await gmStorageGet<unknown>(DECK_INDEX_KEY, null));
        const nextIndex = indexForDeck(next, (storedIndex?.revision ?? 0) + 1);
        const newlyCreatedKeys: string[] = [];

        try {
            for (const [id, card] of Object.entries(next.cards)) {
                if (sameStoredValue(previous.cards[id], card)) continue;
                const key = cardStorageKey(id);
                await gmStorageSet(key, card);
                if (!previous.cards[id]) newlyCreatedKeys.push(key);
            }
            for (const [id, deletedAt] of Object.entries(next.tombstones ?? {})) {
                if (previous.tombstones?.[id] === deletedAt) continue;
                const key = tombstoneStorageKey(id);
                await gmStorageSet(key, deletedAt);
                if (previous.tombstones?.[id] === undefined) newlyCreatedKeys.push(key);
            }

            // This is also the cross-tab commit signal. Write it for grades
            // even when the id set is unchanged.
            await gmStorageSet(DECK_INDEX_KEY, nextIndex);
        } catch (error) {
            await Promise.all(newlyCreatedKeys.map(key => gmStorageDelete(key)));
            throw new LocalYomuSrsStorageError({ cause: error });
        }

        await Promise.all([
            ...previousIndex.cardIds
                .filter(id => !next.cards[id])
                .map(id => gmStorageDelete(cardStorageKey(id))),
            ...previousIndex.tombstoneIds
                .filter(id => next.tombstones?.[id] === undefined)
                .map(id => gmStorageDelete(tombstoneStorageKey(id))),
        ]);
    }

    private async readIndexedDeck(index: StoredYomuSrsIndex): Promise<StoredYomuSrsDeck> {
        const cards = await Promise.all(index.cardIds.map(async id => [
            id,
            await gmStorageGet<unknown>(cardStorageKey(id), null),
        ] as const));
        const tombstones = await Promise.all(index.tombstoneIds.map(async id => [
            id,
            await gmStorageGet<unknown>(tombstoneStorageKey(id), null),
        ] as const));
        return normalizeStoredYomuSrsDeck({
            version: 1,
            cards: Object.fromEntries(cards.filter((entry): entry is [string, StoredYomuSrsCard] =>
                Boolean(entry[1] && typeof entry[1] === 'object'))),
            tombstones: Object.fromEntries(tombstones.filter((entry): entry is [string, number] =>
                typeof entry[1] === 'number' && Number.isFinite(entry[1]))),
        });
    }
}

function normalizeIndex(value: unknown): StoredYomuSrsIndex | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Partial<StoredYomuSrsIndex>;
    if (candidate.version !== 2) return null;
    if (!Array.isArray(candidate.cardIds) || !candidate.cardIds.every(id => typeof id === 'string')) return null;
    if (!Array.isArray(candidate.tombstoneIds) || !candidate.tombstoneIds.every(id => typeof id === 'string')) return null;
    return {
        version: 2,
        revision: Number.isSafeInteger(candidate.revision) && Number(candidate.revision) >= 0
            ? Number(candidate.revision)
            : 0,
        cardIds: [...new Set(candidate.cardIds)].sort(),
        tombstoneIds: [...new Set(candidate.tombstoneIds)].sort(),
    };
}

function indexForDeck(deck: StoredYomuSrsDeck, revision = 0): StoredYomuSrsIndex {
    return {
        version: 2,
        revision,
        cardIds: Object.keys(deck.cards).sort(),
        tombstoneIds: Object.keys(deck.tombstones ?? {}).sort(),
    };
}

function sameStoredValue(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    return JSON.stringify(left) === JSON.stringify(right);
}

function cardStorageKey(id: string): string {
    return `${CARD_KEY_PREFIX}${encodeURIComponent(id)}`;
}

function tombstoneStorageKey(id: string): string {
    return `${TOMBSTONE_KEY_PREFIX}${encodeURIComponent(id)}`;
}
