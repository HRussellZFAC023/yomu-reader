import { gmStorageGet, gmStorageSet, withGmStorageLease } from '../app/storage';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import type { CardState, JPDBMeaning } from '../app/types';
import { ACADEMY_SRS_LABEL } from '../app/constants';
import { canonicalStudyCardIdentity } from './shared';
import {
    mergeStoredYomuSrsCards,
    mergeStoredYomuSrsDecks,
    normalizeStoredYomuSrsDeck,
    removeAcademyVocabularyProvenance as removeAcademyProvenanceFromDeck,
    upsertAcademyVocabulary,
    type AcademyVocabularyInput,
    type AcademyVocabularyRetentionReason,
    type StoredYomuSrsCard,
    type StoredYomuSrsDeck,
} from './local-yomu-deck';
import type {
    YomuSrsAdapter,
    YomuSrsImportBatch,
    YomuSrsImportItem,
    YomuSrsLookupItem,
    YomuSrsMiningRequest,
    YomuSrsMiningResult,
    YomuSrsQueueSnapshot,
    YomuSrsReviewRequest,
    YomuSrsReviewResult,
    YomuSrsReviewable,
    YomuSrsStatsSnapshot,
} from './types';

export type {
    AcademyVocabularyInput,
    AcademyVocabularyProvenance,
    AcademyVocabularyProvenanceKind,
    AcademyVocabularyRetentionReason,
} from './local-yomu-deck';

const YOMU_LOCAL_SRS_STORAGE_KEY = 'yomu:srs-local:v1';
let localDeckMutation = Promise.resolve();
const localDeckMutationListeners = new Set<(cardIds: readonly string[]) => void>();

export function subscribeLocalYomuSrsMutations(listener: (cardIds: readonly string[]) => void): () => void {
    localDeckMutationListeners.add(listener);
    return () => localDeckMutationListeners.delete(listener);
}

export interface AcademyVocabularyCollectionResult {
    readonly cardId: string;
    readonly cardCreated: boolean;
    readonly provenanceAdded: boolean;
    readonly provenanceCount: number;
    readonly card: YomuSrsReviewable;
}

export interface AcademyVocabularyProvenanceRemovalResult {
    readonly provenanceRemoved: boolean;
    readonly cardDeleted: boolean;
    readonly reason: AcademyVocabularyRetentionReason;
    readonly card?: YomuSrsReviewable;
}

export interface AcademySyllabusItem {
    readonly expression: string;
    readonly reading?: string;
}

export interface AcademySyllabusProgress {
    readonly total: number;
    readonly seeded: number;
    readonly unseeded: number;
}

export class LocalYomuSrsRepository {
    constructor(private readonly now: () => number = () => Date.now()) {}

    async importBatch(batch: YomuSrsImportBatch): Promise<{ imported: number; skipped: number }> {
        return this.mutateDeck(deck => {
            let imported = 0;
            let skipped = 0;
            for (const item of batch.items) {
                const card = this.cardFromImportItem(item, batch.importedAt);
                if (!card) {
                    skipped++;
                    continue;
                }
                const existing = deck.cards[card.id];
                deck.cards[card.id] = existing ? mergeStoredYomuSrsCards(existing, card) : card;
                if (existing) skipped++;
                else imported++;
            }
            return { imported, skipped };
        });
    }

    /** Atomically upserts one semantic card and one idempotent Academy provenance. */
    async collectAcademyVocabulary(input: AcademyVocabularyInput): Promise<AcademyVocabularyCollectionResult> {
        return this.mutateDeck(deck => {
            const now = this.now();
            const result = upsertAcademyVocabulary(deck, input, now);
            return {
                cardId: result.card.id,
                cardCreated: result.cardCreated,
                provenanceAdded: result.provenanceAdded,
                provenanceCount: result.provenanceCount,
                card: this.toReviewable(result.card, now),
            };
        });
    }

    /** Reads the shared deck without changing any card or schedule. */
    async academySyllabusProgress(items: readonly AcademySyllabusItem[]): Promise<AcademySyllabusProgress> {
        const deck = await this.readDeck();
        const identities = new Set(items.map(item => canonicalStudyCardIdentity(item.expression, item.reading).key));
        const seeded = [...identities].filter(id => Boolean(deck.cards[id])).length;
        return { total: identities.size, seeded, unseeded: identities.size - seeded };
    }

    /**
     * Removes only the requested provenance. Independent, multiply-sourced,
     * or reviewed cards are retained even when their final Academy source is undone.
     */
    async removeAcademyVocabularyProvenance(
        cardId: string,
        provenanceId: string,
    ): Promise<AcademyVocabularyProvenanceRemovalResult> {
        return this.mutateDeck(deck => {
            const now = this.now();
            const result = removeAcademyProvenanceFromDeck(deck, cardId, provenanceId, now);
            return {
                provenanceRemoved: result.provenanceRemoved,
                cardDeleted: result.cardDeleted,
                reason: result.reason,
                ...(result.card ? { card: this.toReviewable(result.card, now) } : {}),
            };
        });
    }

    async queue(limit = 50): Promise<YomuSrsQueueSnapshot> {
        const now = this.now();
        const cards = Object.values((await this.readDeck()).cards);
        const cap = normalizedQueueLimit(limit);
        const byDue = (a: StoredYomuSrsCard, b: StoredYomuSrsCard): number => a.dueAt - b.dueAt || a.createdAt - b.createdAt;
        const due = cards.filter(card => card.dueAt <= now).sort(byDue);
        const dueNew = due.filter(card => card.reviews === 0).length;
        const dueReviews = due.length - dueNew;
        const queue = due.slice(0, cap).map(card => this.toReviewable(card, now));
        return {
            providerId: 'yomu-local',
            fetchedAt: now,
            cards: queue,
            dueCount: dueReviews,
            newCount: dueNew,
            reviewCount: due.length,
        };
    }

    async stats(): Promise<YomuSrsStatsSnapshot> {
        const now = this.now();
        const cards = Object.values((await this.readDeck()).cards);
        const today = startOfLocalDay(now);
        return {
            providerId: 'yomu-local',
            fetchedAt: now,
            reviewsDue: cards.filter(card => card.dueAt <= now).length,
            reviewsToday: cards.filter(card => (card.lastReviewAt ?? 0) >= today).length,
            newToday: cards.filter(card => card.createdAt >= today).length,
            levelCounts: {
                new: cards.filter(card => card.reviews === 0).length,
                learning: cards.filter(card => card.reviews > 0 && card.intervalDays < 21).length,
                known: cards.filter(card => card.intervalDays >= 21).length,
            },
        };
    }

    /** Read the normalized encrypted-sync payload without exposing the storage key. */
    async snapshot(): Promise<StoredYomuSrsDeck> {
        return structuredClone(await this.readDeck());
    }

    /** Merge a decrypted remote snapshot using the deck's schedule conflict rules. */
    async mergeSnapshot(value: unknown, options: { notifyMutations?: boolean } = {}): Promise<StoredYomuSrsDeck> {
        return this.mutateDeck(deck => {
            const merged = mergeStoredYomuSrsDecks(deck, value);
            deck.cards = merged.cards;
            deck.tombstones = merged.tombstones;
            return structuredClone(merged);
        }, options.notifyMutations !== false);
    }

    /** Resolves an arbitrary parse batch against one consistent deck snapshot. */
    async lookupCards(items: readonly YomuSrsLookupItem[]): Promise<YomuSrsReviewable[]> {
        const now = this.now();
        const deck = await this.readDeck();
        const cards = new Map<string, YomuSrsReviewable>();
        for (const item of items) {
            try {
                const identity = canonicalStudyCardIdentity(item.expression, item.reading);
                const stored = deck.cards[identity.key];
                if (stored) cards.set(identity.key, this.toReviewable(stored, now));
            } catch {
                // A malformed parser candidate is simply not a local SRS card.
            }
        }
        return [...cards.values()];
    }

    async review(request: YomuSrsReviewRequest): Promise<YomuSrsReviewResult> {
        return this.mutateDeck(deck => {
            const now = this.now();
            const identity = canonicalStudyCardIdentity(request.card.expression, request.card.reading);
            const existing = deck.cards[request.card.providerCardId]
                ?? deck.cards[identity.key]
                ?? this.cardFromReviewable(request.card, now);
            const updated = scheduleReviewedCard({ ...existing, id: identity.key }, request.grade, now);
            if (request.card.providerCardId !== identity.key && deck.cards[request.card.providerCardId]) {
                delete deck.cards[request.card.providerCardId];
                deck.tombstones = { ...(deck.tombstones ?? {}), [request.card.providerCardId]: now };
            }
            deck.cards[identity.key] = updated;
            if ((deck.tombstones?.[identity.key] ?? -1) < updated.updatedAt) delete deck.tombstones?.[identity.key];
            return { card: this.toReviewable(updated, now), raw: updated };
        });
    }

    async mine(request: YomuSrsMiningRequest): Promise<YomuSrsMiningResult> {
        return this.mutateDeck(deck => {
            const now = this.now();
            const candidate = this.cardFromImportItem({
                expression: request.expression,
                reading: request.reading,
                meanings: request.meaning ? [request.meaning] : [],
                sentence: request.sentence,
                sourceUrl: request.sourceUrl,
            }, now);
            if (!candidate) throw new TypeError('Vocabulary expression is required.');
            const existing = deck.cards[candidate.id];
            const stored = existing ? mergeStoredYomuSrsCards(existing, candidate) : candidate;
            deck.cards[candidate.id] = stored;
            if ((deck.tombstones?.[candidate.id] ?? -1) < stored.updatedAt) delete deck.tombstones?.[candidate.id];
            return {
                card: this.toReviewable(stored, now),
                raw: { imported: existing ? 0 : 1, skipped: existing ? 1 : 0 },
            };
        });
    }

    private readDeck(): Promise<StoredYomuSrsDeck> {
        const result = localDeckMutation.then(() => this.readDeckUncoordinated());
        localDeckMutation = result.then(() => undefined, () => undefined);
        return result;
    }

    private async readDeckUncoordinated(): Promise<StoredYomuSrsDeck> {
        const stored = await gmStorageGet<unknown>(YOMU_LOCAL_SRS_STORAGE_KEY, null).catch(() => null);
        return normalizeStoredYomuSrsDeck(stored);
    }

    private writeDeck(deck: StoredYomuSrsDeck): Promise<void> {
        return gmStorageSet(YOMU_LOCAL_SRS_STORAGE_KEY, deck);
    }

    private mutateDeck<Result>(operation: (deck: StoredYomuSrsDeck) => Result, notifyMutations = true): Promise<Result> {
        const result = localDeckMutation.then(() => withGmStorageLease('local-yomu-srs-deck', async () => {
            const deck = await this.readDeckUncoordinated();
            const previousCards = new Map(Object.entries(deck.cards));
            const previousTombstones = { ...(deck.tombstones ?? {}) };
            const value = operation(deck);
            await this.writeDeck(normalizeStoredYomuSrsDeck(deck));
            const changedCardIds = new Set([...previousCards.keys(), ...Object.keys(deck.cards),
                ...Object.keys(previousTombstones), ...Object.keys(deck.tombstones ?? {})]);
            const changed = [...changedCardIds].filter(id => !sameStoredCard(previousCards.get(id), deck.cards[id])
                || previousTombstones[id] !== deck.tombstones?.[id]);
            if (notifyMutations) {
                localDeckMutationListeners.forEach(listener => {
                    try { listener(changed); } catch { /* local persistence already succeeded */ }
                });
            }
            return value;
        }));
        localDeckMutation = result.then(() => undefined, () => undefined);
        return result;
    }

    private cardFromImportItem(item: YomuSrsImportItem, now: number): StoredYomuSrsCard | null {
        let identity: ReturnType<typeof canonicalStudyCardIdentity>;
        try {
            identity = canonicalStudyCardIdentity(item.expression, item.reading);
        } catch {
            return null;
        }
        return {
            id: identity.key,
            expression: identity.expression,
            reading: identity.reading,
            meanings: uniqueStrings(item.meanings ?? []),
            sentence: item.sentence?.trim() || undefined,
            sourceProviderId: item.sourceProviderId,
            sourceCardId: item.sourceCardId,
            sourceUrl: item.sourceUrl,
            tags: uniqueStrings(item.tags ?? []),
            dueAt: item.dueAt ?? now,
            lastReviewAt: null,
            createdAt: now,
            updatedAt: now,
            reviews: 0,
            lapses: 0,
            intervalDays: 0,
            ease: 2.5,
            retainWithoutAcademyProvenance: true,
            academyProvenance: {},
        };
    }

    private cardFromReviewable(card: YomuSrsReviewable, now: number): StoredYomuSrsCard {
        const identity = canonicalStudyCardIdentity(card.expression, card.reading);
        return {
            id: identity.key,
            expression: identity.expression,
            reading: identity.reading,
            meanings: card.meanings.flatMap(meaning => meaning.glosses),
            sourceProviderId: card.providerId,
            sourceCardId: card.providerCardId,
            sourceUrl: card.sourceUrl,
            dueAt: card.dueAt ?? now,
            lastReviewAt: card.lastReviewAt ?? null,
            createdAt: now,
            updatedAt: now,
            reviews: 0,
            lapses: 0,
            intervalDays: 0,
            ease: 2.5,
            retainWithoutAcademyProvenance: true,
            academyProvenance: {},
        };
    }

    private toReviewable(card: StoredYomuSrsCard, now: number): YomuSrsReviewable {
        return {
            providerId: 'yomu-local',
            providerCardId: card.id,
            providerReviewId: card.id,
            kind: 'vocabulary',
            expression: card.expression,
            reading: card.reading,
            meanings: meaningsFromGlosses(card.meanings),
            sentence: card.sentence,
            state: localCardState(card, now),
            srsLevel: localSrsLevel(card),
            dueAt: card.dueAt,
            lastReviewAt: card.lastReviewAt,
            sourceUrl: card.sourceUrl,
            raw: card,
        };
    }
}

function sameStoredCard(left: StoredYomuSrsCard | undefined, right: StoredYomuSrsCard | undefined): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    return JSON.stringify(left) === JSON.stringify(right);
}

export function createYomuLocalSrsAdapter(repository = new LocalYomuSrsRepository()): YomuSrsAdapter {
    return {
        id: 'yomu-local',
        // The stored provider id stays yomu-local for migration compatibility.
        label: ACADEMY_SRS_LABEL,
        capabilities: { stats: true, queue: true, review: true, mine: true, import: true },
        hasCredential: () => true,
        verify: async () => true,
        stats: () => repository.stats(),
        queue: limit => repository.queue(limit),
        review: request => repository.review(request),
        mine: request => repository.mine(request),
        lookupCards: items => repository.lookupCards(items),
        importBatch: batch => repository.importBatch(batch),
    };
}

export function yomuSrsImportBatch(source: string, items: YomuSrsImportBatch['items'], importedAt = Date.now()): YomuSrsImportBatch {
    return { source, importedAt, items };
}

function scheduleReviewedCard(card: StoredYomuSrsCard, grade: YomuSrsReviewRequest['grade'], now: number): StoredYomuSrsCard {
    const failed = grade === 'nothing' || grade === 'something' || grade === 'fail' || grade === 'again';
    const intervalDays = failed ? 0 : nextIntervalDays(card, grade);
    return {
        ...card,
        reviews: card.reviews + 1,
        lapses: card.lapses + (failed ? 1 : 0),
        intervalDays,
        ease: Math.min(3.2, Math.max(1.3, card.ease + easeDelta(grade))),
        dueAt: now + (failed ? 10 * 60_000 : intervalDays * 86_400_000),
        lastReviewAt: now,
        updatedAt: now,
    };
}

function nextIntervalDays(card: StoredYomuSrsCard, grade: YomuSrsReviewRequest['grade']): number {
    if (card.reviews <= 0) return grade === 'easy' ? 4 : grade === 'hard' ? 1 : 2;
    const multiplier = grade === 'easy' ? card.ease + 0.7 : grade === 'hard' ? 1.2 : card.ease;
    return Math.max(1, Math.round(Math.max(1, card.intervalDays) * multiplier));
}

function easeDelta(grade: YomuSrsReviewRequest['grade']): number {
    if (grade === 'easy') return 0.15;
    if (grade === 'hard') return -0.15;
    if (grade === 'nothing' || grade === 'something' || grade === 'fail' || grade === 'again') return -0.25;
    return 0;
}

function meaningsFromGlosses(glosses: string[]): JPDBMeaning[] {
    const normalized = uniqueStrings(glosses.map(gloss => gloss.trim()).filter(Boolean));
    return normalized.length ? [{ glosses: normalized, partOfSpeech: [] }] : [];
}

function localCardState(card: StoredYomuSrsCard, now: number): CardState[] {
    if (card.reviews === 0) return ['new'];
    if (card.dueAt <= now) return ['due'];
    if (card.intervalDays >= 21) return ['known'];
    return ['learning'];
}

function localSrsLevel(card: StoredYomuSrsCard): string {
    if (card.reviews === 0) return 'New';
    if (card.intervalDays >= 21) return 'Known';
    if (card.intervalDays >= 7) return 'Young';
    return 'Learning';
}

function startOfLocalDay(now: number): number {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}


function normalizedQueueLimit(limit: number): number {
    if (Number.isNaN(limit) || limit <= 0) return 0;
    return Number.isFinite(limit) ? Math.floor(limit) : Number.MAX_SAFE_INTEGER;
}
