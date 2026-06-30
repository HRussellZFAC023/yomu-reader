import type { CardState, JPDBMeaning } from '../app/types';
import { BunproApiError, BunproClient, type BunproReviewActionRequest } from '../bunpro/bunpro';
import type {
    YomuSrsAdapter,
    YomuSrsMiningRequest,
    YomuSrsMiningResult,
    YomuSrsQueueSnapshot,
    YomuSrsReviewRequest,
    YomuSrsReviewResult,
    YomuSrsReviewable,
    YomuSrsReviewableKind,
    YomuSrsStatsSnapshot,
} from './types';

const BUNPRO_SETTINGS_URL = 'https://bunpro.jp/settings/api';

export function createBunproSrsAdapter(client: BunproClient): YomuSrsAdapter {
    return {
        id: 'bunpro',
        label: 'Bunpro',
        capabilities: { stats: true, queue: true, review: true, mine: true, import: false },
        hasCredential: () => client.hasFrontendCredential(),
        verify: () => client.getUser().then(() => true, () => false),
        stats: async () => normalizeBunproStatsResponse(await client.getBaseStats()),
        queue: async limit => normalizeBunproQueueResponse(await client.getQueue(), limit),
        review: request => reviewBunproCard(client, request),
        mine: request => mineBunproCard(client, request),
    };
}

export function normalizeBunproQueueResponse(raw: unknown, limit = 50): YomuSrsQueueSnapshot {
    const cards = collectBunproReviewables(raw)
        .map(card => normalizeBunproReviewable(card))
        .filter((card): card is YomuSrsReviewable => card !== null)
        .slice(0, Math.max(0, Math.floor(limit)));
    return {
        providerId: 'bunpro',
        fetchedAt: Date.now(),
        cards,
        dueCount: readFirstNumber(raw, ['due_count', 'dueCount', 'reviews_due', 'reviewsDue']) ?? cards.filter(card => card.state.includes('due')).length,
        newCount: readFirstNumber(raw, ['new_count', 'newCount', 'new_cards', 'newCards']) ?? cards.filter(card => card.state.includes('new')).length,
        reviewCount: readFirstNumber(raw, ['review_count', 'reviewCount', 'reviews_count', 'reviewsCount']) ?? cards.length,
    };
}

export function normalizeBunproStatsResponse(raw: unknown): YomuSrsStatsSnapshot {
    return {
        providerId: 'bunpro',
        fetchedAt: Date.now(),
        reviewsDue: readFirstNumber(raw, ['reviews_due', 'reviewsDue', 'due', 'due_count']),
        reviewsToday: readFirstNumber(raw, ['reviews_today', 'reviewsToday', 'reviews_done_today']),
        newToday: readFirstNumber(raw, ['new_today', 'newToday', 'new_cards_today']),
        streakDays: readFirstNumber(raw, ['streak', 'streak_days', 'streakDays']),
        levelCounts: normalizeLevelCounts(raw),
        raw,
    };
}

export function normalizeBunproReviewable(raw: unknown, fallbackKind: YomuSrsReviewableKind = 'grammar'): YomuSrsReviewable | null {
    const record = reviewableRecord(raw);
    if (!record) return null;
    const id = readString(record, ['id', 'review_id', 'reviewId', 'card_id', 'cardId'])
        || readString(raw, ['id'])
        || readString(record, ['reviewable_id', 'reviewableId', 'grammar_id', 'grammarId', 'vocab_id', 'vocabId']);
    const reviewableId = readString(record, ['reviewable_id', 'reviewableId', 'grammar_id', 'grammarId', 'vocab_id', 'vocabId']);
    const expression = readString(record, ['grammar_point', 'grammarPoint', 'japanese', 'word', 'expression', 'slug', 'title'])
        || readString(raw, ['slug', 'title']);
    if (!id || !expression) return null;
    const kind = normalizeBunproKind(
        readString(record, ['reviewable_type', 'reviewableType', 'type', 'kind']),
        inferBunproKind(record, fallbackKind),
    );
    const slug = readString(record, ['slug', 'grammar_point_slug', 'grammarPointSlug']);
    return {
        providerId: 'bunpro',
        providerCardId: id,
        providerReviewId: readString(record, ['review_id', 'reviewId']) || id,
        providerReviewableId: reviewableId || undefined,
        kind,
        expression,
        reading: readString(record, ['reading', 'kana', 'furigana']) || expression,
        meanings: normalizeBunproMeanings(record, kind),
        state: normalizeBunproCardState(readString(record, ['srs_stage', 'srsStage', 'srs_level', 'srsLevel', 'status', 'state'])),
        srsLevel: readString(record, ['srs_stage', 'srsStage', 'srs_level', 'srsLevel']) || undefined,
        dueAt: readFirstDate(record, ['next_review_at', 'nextReviewAt', 'due_at', 'dueAt']),
        lastReviewAt: readFirstDate(record, ['last_reviewed_at', 'lastReviewedAt', 'last_review_at', 'lastReviewAt']),
        sourceUrl: bunproReviewableUrl(kind, slug || reviewableId || id),
        raw,
    };
}

async function reviewBunproCard(client: BunproClient, request: YomuSrsReviewRequest): Promise<YomuSrsReviewResult> {
    const reviewId = request.card.providerReviewId || request.card.providerCardId;
    const raw = await client.updateReview(reviewId, {
        grade: request.grade,
        rating: bunproRatingForGrade(request.grade),
        sentence: request.sentence,
    });
    return { card: normalizeBunproReviewable(raw) ?? request.card, raw };
}

async function mineBunproCard(client: BunproClient, request: YomuSrsMiningRequest): Promise<YomuSrsMiningResult> {
    const rawSearch = await client.search(request.expression, { grammar: request.kind !== 'vocabulary', vocab: request.kind !== 'grammar', limit: 1 });
    const requestedKind = request.kind === 'grammar' ? 'grammar' : 'vocabulary';
    const reviewable = normalizeBunproReviewable(firstBunproSearchHit(rawSearch, requestedKind), requestedKind);
    if (!reviewable) throw new BunproApiError(`No Bunpro item found for "${request.expression}".`);
    if (reviewable.kind !== 'vocabulary' && reviewable.kind !== 'grammar') {
        throw new BunproApiError(`Bunpro can only add vocabulary and grammar points from Yomu (${reviewable.kind} was returned).`);
    }
    const providerReviewableId = reviewable.providerReviewableId || reviewable.providerCardId;
    const providerReviewableIdNumber = Number(providerReviewableId);
    if (!Number.isFinite(providerReviewableIdNumber) || providerReviewableIdNumber <= 0) {
        throw new BunproApiError(`Bunpro returned no addable reviewable id for "${request.expression}".`);
    }
    const type: BunproReviewActionRequest['reviewables'][number]['type'] = reviewable.kind === 'vocabulary' ? 'Vocab' : 'GrammarPoint';
    const raw = await client.updateReviewsViaActionType({
        actionType: 'add',
        reviewables: [{ type, id: providerReviewableIdNumber }],
    });
    return { card: { ...reviewable, providerReviewableId }, raw };
}

function bunproRatingForGrade(grade: YomuSrsReviewRequest['grade']): number {
    if (grade === 'nothing' || grade === 'fail' || grade === 'again') return 1;
    if (grade === 'something' || grade === 'hard') return 2;
    if (grade === 'okay' || grade === 'pass' || grade === 'good') return 3;
    return 4;
}

function collectBunproReviewables(raw: unknown): unknown[] {
    const arrays = [
        readArray(raw, ['data']),
        readArray(raw, ['reviews']),
        readArray(raw, ['reviewables']),
        readArray(raw, ['items']),
        readArray(raw, ['queue']),
        readArray(raw, ['due']),
    ];
    return arrays.find(items => items.length) ?? (Array.isArray(raw) ? raw : []);
}

function firstBunproSearchHit(raw: unknown, preferredKind: Extract<YomuSrsReviewableKind, 'grammar' | 'vocabulary'> = 'grammar'): unknown {
    const record = isRecord(raw) ? raw : {};
    const grammarHit = readArray(record.grammar_points, ['data'])[0];
    const vocabHit = readArray(record.vocabs, ['data'])[0];
    return preferredKind === 'vocabulary'
        ? vocabHit ?? grammarHit
        : grammarHit ?? vocabHit
        ?? readArray(raw, ['data', 'reviewables'])[0]
        ?? raw;
}

function reviewableRecord(raw: unknown): Record<string, unknown> | null {
    const unwrapped = unwrapBunproData(raw);
    if (!isRecord(unwrapped)) return null;
    const attributes = objectAt(unwrapped, 'attributes');
    return attributes ? { ...unwrapped, ...attributes } : unwrapped;
}

function unwrapBunproData(value: unknown): unknown {
    if (!isRecord(value)) return value;
    const data = value.data;
    if (isRecord(data) && !Array.isArray(data)) return data;
    const review = value.review;
    if (isRecord(review)) return review;
    const item = value.item;
    if (isRecord(item)) return item;
    return value;
}

function normalizeBunproKind(value: string, fallback: YomuSrsReviewableKind): YomuSrsReviewableKind {
    const normalized = value.toLowerCase();
    if (normalized.includes('vocab')) return 'vocabulary';
    if (normalized.includes('grammar')) return 'grammar';
    if (normalized.includes('kanji')) return 'kanji';
    if (normalized.includes('sentence') || normalized.includes('question')) return 'sentence';
    return fallback;
}

function inferBunproKind(record: Record<string, unknown>, fallback: YomuSrsReviewableKind): YomuSrsReviewableKind {
    if (readString(record, ['vocab_id', 'vocabId', 'vocabulary_id', 'vocabularyId', 'word'])) return 'vocabulary';
    if (readString(record, ['grammar_id', 'grammarId', 'grammar_point', 'grammarPoint'])) return 'grammar';
    return fallback;
}

function normalizeBunproCardState(value: string): CardState[] {
    const normalized = value.toLowerCase();
    if (!normalized) return ['in-deck'];
    if (normalized.includes('due') || normalized.includes('review')) return ['due'];
    if (normalized.includes('new') || normalized.includes('beginner')) return ['new'];
    if (normalized.includes('ghost') || normalized.includes('fail')) return ['failed'];
    if (normalized.includes('master') || normalized.includes('known')) return ['known'];
    if (normalized.includes('seasoned') || normalized.includes('expert') || normalized.includes('adept')) return ['learning'];
    return ['in-deck'];
}

function normalizeBunproMeanings(record: Record<string, unknown>, kind: YomuSrsReviewableKind): JPDBMeaning[] {
    const glosses = readStringList(record, ['meaning', 'meanings', 'english', 'translation', 'translations', 'definition']).filter(Boolean);
    return glosses.length ? [{ glosses, partOfSpeech: kind === 'grammar' ? ['grammar'] : [] }] : [];
}

function normalizeLevelCounts(raw: unknown): Record<string, number> | undefined {
    const record = objectAt(raw, 'srs_level_counts') ?? objectAt(raw, 'srsLevelCounts') ?? objectAt(raw, 'level_counts') ?? objectAt(raw, 'levelCounts');
    if (!record) return undefined;
    const counts: Record<string, number> = {};
    for (const [key, value] of Object.entries(record)) {
        const number = Number(value);
        if (Number.isFinite(number)) counts[key] = number;
    }
    return Object.keys(counts).length ? counts : undefined;
}

function bunproReviewableUrl(kind: YomuSrsReviewableKind, slugOrId: string): string {
    const value = slugOrId.trim();
    if (!value) return BUNPRO_SETTINGS_URL;
    const encoded = encodeURIComponent(value);
    if (kind === 'vocabulary') return `https://bunpro.jp/vocabs/${encoded}`;
    if (kind === 'sentence') return BUNPRO_SETTINGS_URL;
    return `https://bunpro.jp/grammar_points/${encoded}`;
}

function readFirstDate(value: unknown, keys: string[]): number | null {
    const raw = readString(value, keys);
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function readFirstNumber(value: unknown, keys: string[]): number | undefined {
    const record = isRecord(value) ? value : null;
    if (!record) return undefined;
    for (const key of keys) {
        const number = Number(record[key]);
        if (Number.isFinite(number)) return number;
    }
    const data = record.data;
    if (isRecord(data) && !Array.isArray(data)) return readFirstNumber(data, keys);
    const attributes = objectAt(record, 'attributes');
    return attributes ? readFirstNumber(attributes, keys) : undefined;
}

function readString(value: unknown, keys: string[]): string {
    const record = isRecord(value) ? value : null;
    if (!record) return '';
    for (const key of keys) {
        const raw = record[key];
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    }
    const data = record.data;
    if (isRecord(data) && !Array.isArray(data)) return readString(data, keys);
    return '';
}

function readStringList(value: unknown, keys: string[]): string[] {
    const record = isRecord(value) ? value : null;
    if (!record) return [];
    for (const key of keys) {
        const raw = record[key];
        if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
        if (Array.isArray(raw)) return raw.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean);
    }
    return [];
}

function readArray(value: unknown, keys: string[]): unknown[] {
    const record = isRecord(value) ? value : null;
    if (!record) return [];
    for (const key of keys) {
        const raw = record[key];
        if (Array.isArray(raw)) return raw;
    }
    const data = record.data;
    if (isRecord(data) && !Array.isArray(data)) return readArray(data, keys);
    return [];
}

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
    if (!isRecord(value)) return null;
    const nested = value[key];
    return isRecord(nested) && !Array.isArray(nested) ? nested : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}
