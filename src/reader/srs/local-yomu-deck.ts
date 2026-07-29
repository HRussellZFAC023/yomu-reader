import { isRecord } from '../core/object-utils';
import { canonicalStudyCardIdentity } from './shared';
import type { LanguageTag } from '../languages/types';

export interface StoredYomuSrsDeck {
    version: 1;
    cards: Record<string, StoredYomuSrsCard>;
    /** Latest deletion per semantic card, retained until every device observes it. */
    tombstones?: Record<string, number>;
}

export interface StoredYomuSrsCard {
    id: string;
    expression: string;
    reading: string;
    partOfSpeech?: string;
    /** Missing on legacy cards is the elided Japanese default. */
    language?: LanguageTag;
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
    /** Missing on legacy cards means the card predates Academy provenance and must be retained. */
    retainWithoutAcademyProvenance?: boolean;
    academyProvenance?: Record<string, StoredAcademyVocabularyProvenance>;
}

export type AcademyVocabularyProvenanceKind = 'review-seed' | 'study-encounter';

export interface AcademyVocabularyProvenance {
    readonly id: string;
    readonly kind: AcademyVocabularyProvenanceKind;
    readonly activityId?: string;
    readonly conceptId?: string;
    readonly sourceId?: string;
    readonly reason?: 'new-learning' | 'repair' | 'delayed-review';
}

export interface AcademyVocabularyInput {
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence?: string;
    readonly dueAt?: number;
    readonly postponeExisting?: boolean;
    readonly provenance: AcademyVocabularyProvenance;
}

export interface StoredAcademyVocabularyProvenance extends AcademyVocabularyProvenance {
    addedAt: number;
}

export interface AcademyVocabularyUpsertMutation {
    readonly card: StoredYomuSrsCard;
    readonly cardCreated: boolean;
    readonly provenanceAdded: boolean;
    readonly provenanceCount: number;
}

export type AcademyVocabularyRetentionReason =
    | 'deleted'
    | 'other-provenance'
    | 'independent-card'
    | 'study-history'
    | 'card-not-found'
    | 'provenance-not-found';

export interface AcademyVocabularyRemovalMutation {
    readonly card: StoredYomuSrsCard | null;
    readonly provenanceRemoved: boolean;
    readonly cardDeleted: boolean;
    readonly reason: AcademyVocabularyRetentionReason;
}

export function normalizeStoredYomuSrsDeck(value: unknown): StoredYomuSrsDeck {
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.cards)) return { version: 1, cards: {} };
    const cards: Record<string, StoredYomuSrsCard> = {};
    for (const candidate of Object.values(value.cards)) {
        const normalized = normalizeStoredCard(candidate);
        if (!normalized) continue;
        cards[normalized.id] = cards[normalized.id]
            ? mergeStoredYomuSrsCards(cards[normalized.id]!, normalized)
            : normalized;
    }
    const tombstones: Record<string, number> = {};
    if (isRecord(value.tombstones)) {
        for (const [id, timestamp] of Object.entries(value.tombstones)) {
            if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) continue;
            const card = cards[id];
            if (card && card.updatedAt > timestamp) continue;
            delete cards[id];
            tombstones[id] = timestamp;
        }
    }
    return Object.keys(tombstones).length ? { version: 1, cards, tombstones } : { version: 1, cards };
}

/** Merge two complete replicas. Newer tombstones beat older cards; newer cards revive. */
export function mergeStoredYomuSrsDecks(leftValue: unknown, rightValue: unknown): StoredYomuSrsDeck {
    const left = normalizeStoredYomuSrsDeck(leftValue);
    const right = normalizeStoredYomuSrsDeck(rightValue);
    const cards = { ...left.cards };
    const tombstones = { ...(left.tombstones ?? {}) };
    for (const [id, timestamp] of Object.entries(right.tombstones ?? {})) {
        tombstones[id] = Math.max(tombstones[id] ?? 0, timestamp);
    }
    for (const [id, incoming] of Object.entries(right.cards)) {
        const tombstone = tombstones[id];
        if (tombstone !== undefined && tombstone >= incoming.updatedAt) continue;
        if (tombstone !== undefined) delete tombstones[id];
        cards[id] = cards[id] ? mergeStoredYomuSrsCards(cards[id]!, incoming) : incoming;
    }
    return normalizeStoredYomuSrsDeck({ version: 1, cards, tombstones });
}

export function mergeStoredYomuSrsCards(
    existing: StoredYomuSrsCard,
    incoming: StoredYomuSrsCard,
): StoredYomuSrsCard {
    const existingIdentity = storedCardIdentity(existing);
    const incomingIdentity = storedCardIdentity(incoming);
    if (existingIdentity.key !== incomingIdentity.key) {
        throw new TypeError('Cannot merge Yomu SRS cards with different identities.');
    }
    const identity = existingIdentity;
    const schedule = preferredSchedule(existing, incoming);
    const scheduleFields = { ...schedule };
    delete scheduleFields.language;
    delete scheduleFields.partOfSpeech;
    return {
        ...scheduleFields,
        id: identity.key,
        expression: identity.expression,
        reading: identity.reading,
        ...(identity.partOfSpeech ? { partOfSpeech: identity.partOfSpeech } : {}),
        ...(identity.language !== 'ja' ? { language: identity.language } : {}),
        meanings: uniqueText([...existing.meanings, ...incoming.meanings]),
        sentence: existing.sentence || incoming.sentence,
        sourceProviderId: existing.sourceProviderId || incoming.sourceProviderId,
        sourceCardId: existing.sourceCardId || incoming.sourceCardId,
        sourceUrl: existing.sourceUrl || incoming.sourceUrl,
        tags: uniqueText([...(existing.tags ?? []), ...(incoming.tags ?? [])]),
        createdAt: Math.min(existing.createdAt, incoming.createdAt),
        updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
        reviews: Math.max(existing.reviews, incoming.reviews),
        lapses: Math.max(existing.lapses, incoming.lapses),
        retainWithoutAcademyProvenance: retainsWithoutAcademy(existing) || retainsWithoutAcademy(incoming),
        academyProvenance: {
            ...(incoming.academyProvenance ?? {}),
            ...(existing.academyProvenance ?? {}),
        },
    };
}

export function upsertAcademyVocabulary(
    deck: StoredYomuSrsDeck,
    input: AcademyVocabularyInput,
    now: number,
): AcademyVocabularyUpsertMutation {
    const identity = canonicalStudyCardIdentity(input.expression, input.reading);
    const meanings = uniqueText(input.meanings);
    const provenance = normalizeProvenance(input.provenance, now);
    const existing = deck.cards[identity.key];
    const previousProvenance = existing?.academyProvenance?.[provenance.id];
    if (previousProvenance && !sameProvenance(previousProvenance, provenance)) {
        throw new Error(`Conflicting Academy vocabulary provenance id: ${provenance.id}`);
    }

    const incoming: StoredYomuSrsCard = {
        id: identity.key,
        expression: identity.expression,
        reading: identity.reading,
        meanings,
        sentence: cleanOptional(input.sentence),
        tags: ['academy'],
        dueAt: finiteDueAt(input.dueAt, now),
        lastReviewAt: null,
        createdAt: now,
        updatedAt: now,
        reviews: 0,
        lapses: 0,
        intervalDays: 0,
        ease: 2.5,
        retainWithoutAcademyProvenance: false,
        academyProvenance: { [provenance.id]: previousProvenance ?? provenance },
    };
    const card = existing
        ? preserveExistingSchedule(
            mergeStoredYomuSrsCards(existing, incoming),
            existing,
            input.postponeExisting === true && !previousProvenance ? input.dueAt : undefined,
        )
        : incoming;
    deck.cards[identity.key] = card;
    return {
        card,
        cardCreated: !existing,
        provenanceAdded: !previousProvenance,
        provenanceCount: Object.keys(card.academyProvenance ?? {}).length,
    };
}

function finiteDueAt(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) && value >= fallback ? value : fallback;
}

/** Academy collection enriches an existing card; it never reschedules it. */
function preserveExistingSchedule(
    merged: StoredYomuSrsCard,
    existing: StoredYomuSrsCard,
    notBefore?: number,
): StoredYomuSrsCard {
    return {
        ...merged,
        dueAt: notBefore === undefined ? existing.dueAt : Math.max(existing.dueAt, notBefore),
        lastReviewAt: existing.lastReviewAt,
        reviews: existing.reviews,
        lapses: existing.lapses,
        intervalDays: existing.intervalDays,
        ease: existing.ease,
    };
}

/**
 * Removes one Academy provenance. A card is deleted only when it was created
 * solely by Academy, has no other provenance, and has never been reviewed.
 */
export function removeAcademyVocabularyProvenance(
    deck: StoredYomuSrsDeck,
    cardId: string,
    provenanceId: string,
    now: number,
): AcademyVocabularyRemovalMutation {
    const direct = deck.cards[cardId];
    const card = direct ?? Object.values(deck.cards).find(candidate => candidate.academyProvenance?.[provenanceId]);
    if (!card) return { card: null, provenanceRemoved: false, cardDeleted: false, reason: 'card-not-found' };
    if (!card.academyProvenance?.[provenanceId]) {
        return { card, provenanceRemoved: false, cardDeleted: false, reason: 'provenance-not-found' };
    }

    const academyProvenance = { ...card.academyProvenance };
    delete academyProvenance[provenanceId];
    const remaining = Object.keys(academyProvenance).length;
    if (!remaining && !retainsWithoutAcademy(card) && !hasStudyHistory(card)) {
        delete deck.cards[card.id];
        deck.tombstones = { ...(deck.tombstones ?? {}), [card.id]: now };
        return { card: null, provenanceRemoved: true, cardDeleted: true, reason: 'deleted' };
    }

    const updated: StoredYomuSrsCard = {
        ...card,
        updatedAt: now,
        tags: remaining
            ? card.tags
            : uniqueText([...(card.tags ?? []).filter(tag => tag !== 'academy'), 'legacy-academy']),
        academyProvenance,
    };
    deck.cards[card.id] = updated;
    const reason: AcademyVocabularyRetentionReason = remaining
        ? 'other-provenance'
        : retainsWithoutAcademy(card)
            ? 'independent-card'
            : 'study-history';
    return { card: updated, provenanceRemoved: true, cardDeleted: false, reason };
}

function normalizeStoredCard(value: unknown): StoredYomuSrsCard | null {
    if (!isRecord(value) || typeof value.expression !== 'string') return null;
    let identity: ReturnType<typeof canonicalStudyCardIdentity>;
    try {
        identity = canonicalStudyCardIdentity(
            value.expression,
            typeof value.reading === 'string' ? value.reading : '',
            {
                ...(typeof value.partOfSpeech === 'string' ? { partOfSpeech: value.partOfSpeech } : {}),
                ...(typeof value.language === 'string' ? { language: value.language } : {}),
            },
        );
    } catch {
        return null;
    }
    const createdAt = finiteNumber(value.createdAt, 0);
    const updatedAt = finiteNumber(value.updatedAt, createdAt);
    return {
        id: identity.key,
        expression: identity.expression,
        reading: identity.reading,
        ...(identity.partOfSpeech ? { partOfSpeech: identity.partOfSpeech } : {}),
        ...(identity.language !== 'ja' ? { language: identity.language } : {}),
        meanings: stringArray(value.meanings),
        ...(cleanOptional(value.sentence) ? { sentence: cleanOptional(value.sentence) } : {}),
        ...(cleanOptional(value.sourceProviderId) ? { sourceProviderId: cleanOptional(value.sourceProviderId) } : {}),
        ...(cleanOptional(value.sourceCardId) ? { sourceCardId: cleanOptional(value.sourceCardId) } : {}),
        ...(cleanOptional(value.sourceUrl) ? { sourceUrl: cleanOptional(value.sourceUrl) } : {}),
        tags: stringArray(value.tags),
        dueAt: finiteNumber(value.dueAt, createdAt),
        lastReviewAt: value.lastReviewAt === null ? null : finiteNumber(value.lastReviewAt, null),
        createdAt,
        updatedAt,
        reviews: nonNegativeInteger(value.reviews),
        lapses: nonNegativeInteger(value.lapses),
        intervalDays: Math.max(0, finiteNumber(value.intervalDays, 0)),
        ease: finiteNumber(value.ease, 2.5),
        retainWithoutAcademyProvenance: typeof value.retainWithoutAcademyProvenance === 'boolean'
            ? value.retainWithoutAcademyProvenance
            : true,
        academyProvenance: normalizeProvenanceRecord(value.academyProvenance, updatedAt),
    };
}

function storedCardIdentity(card: StoredYomuSrsCard): ReturnType<typeof canonicalStudyCardIdentity> {
    return canonicalStudyCardIdentity(card.expression, card.reading, {
        partOfSpeech: card.partOfSpeech,
        language: card.language ?? 'ja',
    });
}

function preferredSchedule(left: StoredYomuSrsCard, right: StoredYomuSrsCard): StoredYomuSrsCard {
    if (left.reviews !== right.reviews) return left.reviews > right.reviews ? left : right;
    const leftReviewed = left.lastReviewAt ?? -1;
    const rightReviewed = right.lastReviewAt ?? -1;
    if (leftReviewed !== rightReviewed) return leftReviewed > rightReviewed ? left : right;
    if (left.reviews === 0 && left.dueAt !== right.dueAt) return left.dueAt < right.dueAt ? left : right;
    return left.updatedAt >= right.updatedAt ? left : right;
}

function normalizeProvenance(value: AcademyVocabularyProvenance, addedAt: number): StoredAcademyVocabularyProvenance {
    const id = requiredText(value.id, 'Academy vocabulary provenance id');
    if (value.kind !== 'review-seed' && value.kind !== 'study-encounter') {
        throw new TypeError('Academy vocabulary provenance kind is invalid.');
    }
    return {
        id,
        kind: value.kind,
        addedAt,
        ...(cleanOptional(value.activityId) ? { activityId: cleanOptional(value.activityId) } : {}),
        ...(cleanOptional(value.conceptId) ? { conceptId: cleanOptional(value.conceptId) } : {}),
        ...(cleanOptional(value.sourceId) ? { sourceId: cleanOptional(value.sourceId) } : {}),
        ...(value.reason ? { reason: value.reason } : {}),
    };
}

function normalizeProvenanceRecord(value: unknown, fallbackAt: number): Record<string, StoredAcademyVocabularyProvenance> {
    if (!isRecord(value)) return {};
    const result: Record<string, StoredAcademyVocabularyProvenance> = {};
    for (const candidate of Object.values(value)) {
        if (!isRecord(candidate)) continue;
        try {
            const normalized = normalizeProvenance({
                id: String(candidate.id ?? ''),
                kind: candidate.kind as AcademyVocabularyProvenanceKind,
                ...(typeof candidate.activityId === 'string' ? { activityId: candidate.activityId } : {}),
                ...(typeof candidate.conceptId === 'string' ? { conceptId: candidate.conceptId } : {}),
                ...(typeof candidate.sourceId === 'string' ? { sourceId: candidate.sourceId } : {}),
                ...(candidate.reason === 'new-learning' || candidate.reason === 'repair' || candidate.reason === 'delayed-review'
                    ? { reason: candidate.reason }
                    : {}),
            }, finiteNumber(candidate.addedAt, fallbackAt));
            result[normalized.id] = normalized;
        } catch {
            // Invalid provenance cannot make an otherwise valid legacy card unreadable.
        }
    }
    return result;
}

function sameProvenance(left: StoredAcademyVocabularyProvenance, right: StoredAcademyVocabularyProvenance): boolean {
    return left.id === right.id
        && left.kind === right.kind
        && left.activityId === right.activityId
        && left.conceptId === right.conceptId
        && left.sourceId === right.sourceId;
}

function retainsWithoutAcademy(card: StoredYomuSrsCard): boolean {
    return card.retainWithoutAcademyProvenance !== false;
}

function hasStudyHistory(card: StoredYomuSrsCard): boolean {
    return card.reviews > 0
        || card.lapses > 0
        || card.intervalDays > 0
        || card.lastReviewAt !== null;
}

function requiredText(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized) throw new TypeError(`${label} is required.`);
    return normalized;
}

function cleanOptional(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? uniqueText(value.filter((item): item is string => typeof item === 'string')) : [];
}

function uniqueText(values: readonly string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function finiteNumber<T extends number | null>(value: unknown, fallback: T): number | T {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
