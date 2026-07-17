import { isNonNullObject as isRecord } from '../core/object-utils';
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
        stats: async () => {
            const [base, due] = await Promise.all([client.getBaseStats(), client.getDueCount().catch(() => null)]);
            return normalizeBunproStatsResponse(base, due);
        },
        queue: async limit => normalizeBunproQueueResponse(await client.getQueue(), limit),
        review: request => reviewBunproCard(client, request),
        mine: request => mineBunproCard(client, request),
    };
}

export function normalizeBunproQueueResponse(raw: unknown, limit = 50): YomuSrsQueueSnapshot {
    const reviewSessionId = readString(raw, ['review_session_id', 'reviewSessionId']);
    const cards = collectBunproReviewables(raw)
        .map(card => normalizeBunproReviewable(card))
        .filter((card): card is YomuSrsReviewable => card !== null)
        .map(card => {
            if (!reviewSessionId) return card;
            const endpoint = normalizeBunproReviewEndpoint(readString(card.raw, ['review_endpoint_kind', 'reviewEndpointKind']));
            return {
                ...card,
                reviewSession: {
                    id: reviewSessionId,
                    inputMode: endpoint === 'review' && readBoolean(card.raw, ['is_fsrs', 'isFsrs']) ? 'fsrs' as const : 'regular' as const,
                    endpoint,
                },
            };
        })
        .slice(0, Math.max(0, Math.floor(limit)));
    return {
        providerId: 'bunpro',
        fetchedAt: Date.now(),
        cards,
        dueCount: readFirstNumber(raw, ['due_count', 'dueCount', 'reviews_due', 'reviewsDue', 'total_pending_attempt_count']) ?? cards.filter(card => card.state.includes('due')).length,
        newCount: readFirstNumber(raw, ['new_count', 'newCount', 'new_cards', 'newCards']) ?? cards.filter(card => card.state.includes('new')).length,
        reviewCount: readFirstNumber(raw, ['review_count', 'reviewCount', 'reviews_count', 'reviewsCount']) ?? cards.length,
    };
}

export function normalizeBunproStatsResponse(raw: unknown, due?: unknown): YomuSrsStatsSnapshot {
    // base_stats nests the useful numbers under `facts`; due counts come from
    // /user/due as separate grammar/vocab totals.
    const source = isRecord(raw) ? { ...(objectAt(raw, 'facts') ?? {}), ...raw } : raw;
    return {
        providerId: 'bunpro',
        fetchedAt: Date.now(),
        reviewsDue: bunproDueTotal(due) ?? readFirstNumber(source, ['reviews_due', 'reviewsDue', 'due', 'due_count']),
        reviewsToday: readFirstNumber(source, ['reviews_today', 'reviewsToday', 'reviews_done_today']),
        newToday: readFirstNumber(source, ['new_today', 'newToday', 'new_cards_today']),
        streakDays: readFirstNumber(source, ['streak', 'streak_days', 'streakDays']),
        levelCounts: normalizeLevelCounts(raw),
        raw,
    };
}

function bunproDueTotal(due: unknown): number | undefined {
    const grammar = readFirstNumber(due, ['total_due_grammar']);
    const vocab = readFirstNumber(due, ['total_due_vocab']);
    if (grammar === undefined && vocab === undefined) return undefined;
    return (grammar ?? 0) + (vocab ?? 0);
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
    const session = request.card.reviewSession;
    if (!positiveIntegerString(reviewId)) {
        throw new BunproApiError('Bunpro grading needs a valid numeric review id. Reload the Bunpro queue and try again.');
    }
    if (!session || !positiveIntegerString(session.id)) {
        throw new BunproApiError('Bunpro grading needs an active review session. Reload the Bunpro queue and try again.');
    }
    if (session.inputMode === 'fsrs' && session.endpoint !== 'review') {
        throw new BunproApiError('Bunpro FSRS grading is available only for ordinary review cards. Reload the queue and try again.');
    }
    const input = bunproReviewInput(session.inputMode, request.grade);
    const body: Record<string, unknown> = {
        review_session_id: Number(session.id),
        correct: input.correct,
        fsrs_input: input.fsrsInput,
        loaded_review_ids: null,
        loaded_ghost_review_ids: null,
        loaded_self_study_review_ids: null,
    };
    if (input.incorrectAnswer) body.incorrect_answer = input.incorrectAnswer;
    const raw = await client.updateReview(reviewId, body, session.endpoint);
    const normalized = normalizeBunproReviewable(raw);
    return { card: normalized ? { ...normalized, reviewSession: session } : request.card, raw };
}

async function mineBunproCard(client: BunproClient, request: YomuSrsMiningRequest): Promise<YomuSrsMiningResult> {
    const rawSearch = await client.search(request.expression, { grammar: request.kind !== 'vocabulary', vocab: request.kind !== 'grammar', limit: 12 });
    const requestedKind = request.kind === 'grammar' ? 'grammar' : 'vocabulary';
    const reviewable = exactBunproSearchReviewable(rawSearch, request.expression, request.reading, requestedKind);
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

interface BunproReviewInput {
    correct: boolean;
    fsrsInput: 'again' | 'hard' | 'good' | 'easy' | null;
    incorrectAnswer?: string;
}

function bunproReviewInput(mode: 'regular' | 'fsrs', grade: YomuSrsReviewRequest['grade']): BunproReviewInput {
    if (mode === 'regular') {
        if (grade === 'fail') return { correct: false, fsrsInput: null, incorrectAnswer: '__FLASHCARD_REGULAR_HARD' };
        if (grade === 'pass') return { correct: true, fsrsInput: null };
        throw new BunproApiError('This Bunpro review accepts only Hard or Good.');
    }
    if (grade === 'nothing' || grade === 'again') return { correct: false, fsrsInput: 'again', incorrectAnswer: '__FLASHCARD_FSRS_AGAIN' };
    if (grade === 'hard') return { correct: false, fsrsInput: 'hard', incorrectAnswer: '__FLASHCARD_FSRS_HARD' };
    if (grade === 'okay' || grade === 'good') return { correct: true, fsrsInput: 'good' };
    if (grade === 'easy') return { correct: true, fsrsInput: 'easy' };
    throw new BunproApiError('This Bunpro FSRS review accepts Again, Hard, Good, or Easy.');
}

function collectBunproReviewables(raw: unknown): unknown[] {
    const quizEntries = collectBunproQuizIndexEntries(raw);
    if (quizEntries.length) return quizEntries;
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

// /reviews/quiz_index wraps each due review in a JSON:API envelope whose
// review record only carries ids — the expression/reading/meaning live on the
// sideloaded reviewable. Flatten both into one record the shared normalizer
// understands, keeping the review id (the gradeable id) as `id`.
function collectBunproQuizIndexEntries(raw: unknown): unknown[] {
    if (!isRecord(raw)) return [];
    const entries = [...readArray(raw, ['pending_attempt']), ...readArray(raw, ['pending_wrapup'])];
    return entries
        .map(entry => flattenBunproQuizIndexEntry(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function flattenBunproQuizIndexEntry(entry: unknown): Record<string, unknown> | null {
    if (!isRecord(entry)) return null;
    const review = objectAt(entry, 'data');
    if (!review) return null;
    const attributes = objectAt(review, 'attributes') ?? {};
    const reviewId = readString(review, ['id']) || readString(attributes, ['id']);
    if (!reviewId) return null;
    const reviewable = bunproQuizIndexReviewable(entry, attributes);
    return {
        ...reviewable,
        ...attributes,
        // Slugs can be disambiguated ("カレー-dup"); the title is the word.
        japanese: readString(reviewable, ['title']) || undefined,
        id: reviewId,
        review_id: reviewId,
        review_endpoint_kind: bunproQuizReviewEndpoint(attributes),
        // `state` is the last key the shared normalizer's srs_stage/srs_level/
        // status/state chain reads, so nothing else may reintroduce those keys.
        state: 'due',
        srs_stage: undefined,
        srs_level: undefined,
        status: undefined,
        next_review_at: readString(attributes, ['next_review']) || undefined,
    };
}

function bunproQuizReviewEndpoint(attributes: Record<string, unknown>): 'review' | 'ghost-review' | 'self-study-review' {
    if (readString(attributes, ['user_study_question_id', 'userStudyQuestionId'])) return 'self-study-review';
    return Object.prototype.hasOwnProperty.call(attributes, 'ghost_count') ? 'review' : 'ghost-review';
}

function normalizeBunproReviewEndpoint(value: string): 'review' | 'ghost-review' | 'self-study-review' {
    if (value === 'ghost-review' || value === 'self-study-review') return value;
    return 'review';
}

function bunproQuizIndexReviewable(entry: Record<string, unknown>, reviewAttributes: Record<string, unknown>): Record<string, unknown> {
    const type = readString(reviewAttributes, ['reviewable_type']).toLowerCase();
    const wantedKind = type.includes('vocab') ? 'vocab' : 'grammar_point';
    const included = readArray(entry, ['included']);
    for (const item of included) {
        if (!isRecord(item) || readString(item, ['type']) !== wantedKind) continue;
        const attributes = objectAt(item, 'attributes');
        if (attributes) return attributes;
    }
    return {};
}

function exactBunproSearchReviewable(
    raw: unknown,
    expression: string,
    reading: string | undefined,
    preferredKind: Extract<YomuSrsReviewableKind, 'grammar' | 'vocabulary'>,
): YomuSrsReviewable | null {
    const record = isRecord(raw) ? raw : {};
    const section = preferredKind === 'vocabulary' ? record.vocabs : record.grammar_points;
    const hits = readArray(section, ['data'])
        .map(hit => normalizeBunproReviewable(hit, preferredKind))
        .filter((hit): hit is YomuSrsReviewable => hit !== null)
        .filter(hit => normalizedLookupText(hit.expression) === normalizedLookupText(expression));
    if (!hits.length) return null;
    if (reading) {
        const readingMatches = hits.filter(hit => normalizedLookupText(hit.reading) === normalizedLookupText(reading));
        if (readingMatches.length === 1) return readingMatches[0] ?? null;
        if (readingMatches.length > 1) return sameBunproReviewableIdentity(readingMatches) ? readingMatches[0] ?? null : null;
        return null;
    }
    return hits.length === 1 || sameBunproReviewableIdentity(hits) ? hits[0] ?? null : null;
}

function normalizedLookupText(value: string): string {
    return value.normalize('NFKC').trim();
}

function sameBunproReviewableIdentity(cards: YomuSrsReviewable[]): boolean {
    const first = cards[0];
    return Boolean(first && cards.every(card => card.providerCardId === first.providerCardId));
}

function positiveIntegerString(value: string): boolean {
    const number = Number(value);
    return Number.isInteger(number) && number > 0;
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

function readBoolean(value: unknown, keys: string[]): boolean {
    const record = isRecord(value) ? value : null;
    if (!record) return false;
    for (const key of keys) {
        const raw = record[key];
        if (typeof raw === 'boolean') return raw;
        if (raw === 1 || raw === '1' || raw === 'true') return true;
    }
    const data = record.data;
    if (isRecord(data) && !Array.isArray(data)) return readBoolean(data, keys);
    const attributes = objectAt(record, 'attributes');
    return attributes ? readBoolean(attributes, keys) : false;
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

