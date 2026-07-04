import { gmStorageGet, gmStorageSet } from '../app/storage';
import type { CardState, JPDBMeaning } from '../app/types';
import type {
    YomuSrsAdapter,
    YomuSrsImportBatch,
    YomuSrsImportItem,
    YomuSrsMiningRequest,
    YomuSrsMiningResult,
    YomuSrsQueueSnapshot,
    YomuSrsReviewRequest,
    YomuSrsReviewResult,
    YomuSrsReviewable,
    YomuSrsStatsSnapshot,
} from './types';

const YOMU_LOCAL_SRS_STORAGE_KEY = 'yomu:srs-local:v1';

interface StoredYomuSrsDeck {
    version: 1;
    cards: Record<string, StoredYomuSrsCard>;
}

interface StoredYomuSrsCard {
    id: string;
    expression: string;
    reading: string;
    meanings: string[];
    sentence?: string;
    sourceProviderId?: string;
    sourceCardId?: string;
    sourceUrl?: string;
    tags?: string[];
    dueAt: number;
    lastReviewAt: number | null;
    createdAt: number;
    updatedAt: number;
    reviews: number;
    lapses: number;
    intervalDays: number;
    ease: number;
}

const EMPTY_DECK: StoredYomuSrsDeck = { version: 1, cards: {} };

export class LocalYomuSrsRepository {
    constructor(private readonly now: () => number = () => Date.now()) {}

    async importBatch(batch: YomuSrsImportBatch): Promise<{ imported: number; skipped: number }> {
        const deck = await this.readDeck();
        let imported = 0;
        let skipped = 0;
        for (const item of batch.items) {
            const card = this.cardFromImportItem(item, batch.importedAt);
            if (!card) {
                skipped++;
                continue;
            }
            const existing = deck.cards[card.id];
            if (existing) {
                deck.cards[card.id] = {
                    ...existing,
                    meanings: uniqueStrings([...existing.meanings, ...card.meanings]),
                    sentence: existing.sentence || card.sentence,
                    sourceUrl: existing.sourceUrl || card.sourceUrl,
                    tags: uniqueStrings([...(existing.tags ?? []), ...(card.tags ?? [])]),
                    updatedAt: batch.importedAt,
                };
                skipped++;
            } else {
                deck.cards[card.id] = card;
                imported++;
            }
        }
        await this.writeDeck(deck);
        return { imported, skipped };
    }

    // fallow-ignore-next-line unused-class-member
    async queue(limit = 50): Promise<YomuSrsQueueSnapshot> {
        const now = this.now();
        const cards = Object.values((await this.readDeck()).cards);
        const cap = Math.max(0, Math.floor(limit));
        const byDue = (a: StoredYomuSrsCard, b: StoredYomuSrsCard): number => a.dueAt - b.dueAt || a.createdAt - b.createdAt;
        const due = cards.filter(card => card.dueAt <= now).sort(byDue);
        // Review-ahead fill: once the due cards run out the rest of the deck
        // (soonest-due first) keeps the practice queue going, so the study tab
        // never strands at "N words" when the learner has mined far more.
        const ahead = cards.filter(card => card.dueAt > now).sort(byDue);
        const queue = [...due, ...ahead].slice(0, cap).map(card => this.toReviewable(card, now));
        return {
            providerId: 'yomu-local',
            fetchedAt: now,
            cards: queue,
            dueCount: cards.filter(card => card.dueAt <= now && card.reviews > 0).length,
            newCount: cards.filter(card => card.reviews === 0).length,
            reviewCount: Math.min(due.length, cap),
        };
    }

    // fallow-ignore-next-line unused-class-member
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

    // fallow-ignore-next-line unused-class-member
    async review(request: YomuSrsReviewRequest): Promise<YomuSrsReviewResult> {
        const deck = await this.readDeck();
        const id = request.card.providerCardId || localCardId(request.card.expression, request.card.reading);
        const existing = deck.cards[id] ?? this.cardFromReviewable(request.card, this.now());
        const updated = scheduleReviewedCard(existing, request.grade, this.now());
        deck.cards[id] = updated;
        await this.writeDeck(deck);
        return { card: this.toReviewable(updated, this.now()), raw: updated };
    }

    // fallow-ignore-next-line unused-class-member
    async mine(request: YomuSrsMiningRequest): Promise<YomuSrsMiningResult> {
        const now = this.now();
        const card = reviewableFromMiningRequest(request, now);
        const raw = await this.importBatch({
            source: 'manual-mining',
            importedAt: now,
            items: [{
                expression: card.expression,
                reading: card.reading,
                meanings: card.meanings.flatMap(meaning => meaning.glosses),
                sentence: request.sentence,
                sourceUrl: request.sourceUrl,
            }],
        });
        return { card, raw };
    }

    private async readDeck(): Promise<StoredYomuSrsDeck> {
        const stored = await gmStorageGet<StoredYomuSrsDeck | null>(YOMU_LOCAL_SRS_STORAGE_KEY, null).catch(() => null);
        if (!stored || stored.version !== 1 || !stored.cards || typeof stored.cards !== 'object') return { ...EMPTY_DECK, cards: {} };
        return { version: 1, cards: normalizeStoredCards(stored.cards) };
    }

    private writeDeck(deck: StoredYomuSrsDeck): Promise<void> {
        return gmStorageSet(YOMU_LOCAL_SRS_STORAGE_KEY, deck);
    }

    private cardFromImportItem(item: YomuSrsImportItem, now: number): StoredYomuSrsCard | null {
        const expression = item.expression.trim();
        if (!expression) return null;
        const reading = item.reading?.trim() || expression;
        return {
            id: item.sourceProviderId && item.sourceCardId ? `${item.sourceProviderId}:${item.sourceCardId}` : localCardId(expression, reading),
            expression,
            reading,
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
        };
    }

    private cardFromReviewable(card: YomuSrsReviewable, now: number): StoredYomuSrsCard {
        return {
            id: card.providerCardId || localCardId(card.expression, card.reading),
            expression: card.expression,
            reading: card.reading || card.expression,
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
            state: localCardState(card, now),
            srsLevel: localSrsLevel(card),
            dueAt: card.dueAt,
            lastReviewAt: card.lastReviewAt,
            sourceUrl: card.sourceUrl,
            raw: card,
        };
    }
}

export function createYomuLocalSrsAdapter(repository = new LocalYomuSrsRepository()): YomuSrsAdapter {
    return {
        id: 'yomu-local',
        label: 'Yomu',
        capabilities: { stats: true, queue: true, review: true, mine: true, import: true },
        hasCredential: () => true,
        verify: async () => true,
        stats: () => repository.stats(),
        queue: limit => repository.queue(limit),
        review: request => repository.review(request),
        mine: request => repository.mine(request),
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

function reviewableFromMiningRequest(request: YomuSrsMiningRequest, now: number): YomuSrsReviewable {
    const expression = request.expression.trim();
    const reading = request.reading?.trim() || expression;
    return {
        providerId: 'yomu-local',
        providerCardId: localCardId(expression, reading),
        providerReviewId: localCardId(expression, reading),
        kind: request.kind ?? 'vocabulary',
        expression,
        reading,
        meanings: request.meaning ? meaningsFromGlosses([request.meaning]) : [],
        state: ['new'],
        dueAt: now,
        lastReviewAt: null,
        sourceUrl: request.sourceUrl,
    };
}

function normalizeStoredCards(cards: Record<string, StoredYomuSrsCard>): Record<string, StoredYomuSrsCard> {
    return Object.fromEntries(Object.entries(cards).filter(([, card]) => Boolean(card?.id && card.expression)));
}

function localCardId(expression: string, reading: string): string {
    return `${expression.trim()}\u0000${reading.trim() || expression.trim()}`;
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

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
