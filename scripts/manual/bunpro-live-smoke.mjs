#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { loadLocalEnv } from '../lib/qa-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRONTEND_BASE_URL = 'https://api.bunpro.jp/api/frontend';
const LEGACY_BASE_URL = 'https://bunpro.jp/api/user';
const DETAIL_PATH_SOURCES = [
    { collection: 'vocabs', identityFields: ['slug', 'id'], path: 'vocab' },
    { collection: 'grammar_points', identityFields: ['id'], path: 'grammar_point' },
];
const DETAIL_ROW_REJECTION_RULES = [
    { reason: 'nonStudyQuestion', rejects: context => context.type !== 'study_question' },
    { reason: 'missingAttributes', rejects: context => context.attributes === null },
    { reason: 'missingSentence', rejects: context => !context.sentence.trim() },
    { reason: 'nonJapaneseSentence', rejects: context => !/[\u3040-\u30ff\u3400-\u9fff]/u.test(context.sentence) },
];

loadLocalEnv(ROOT);

const frontendToken = process.env.YOMU_BUNPRO_FRONTEND_API_TOKEN?.trim() ?? '';
const frontendTokenExpiresAt = process.env.YOMU_BUNPRO_FRONTEND_API_TOKEN_EXPIRES_AT?.trim() ?? '';
const legacyApiKey = process.env.YOMU_BUNPRO_API_KEY?.trim() ?? '';
const liveGrade = process.env.YOMU_BUNPRO_LIVE_GRADE?.trim().toLowerCase() ?? '';

if (!frontendToken) {
    console.error('Bunpro live smoke needs YOMU_BUNPRO_FRONTEND_API_TOKEN in the environment or local .env.');
    process.exit(1);
}

if (frontendTokenExpiresAt) {
    const expiry = new Date(frontendTokenExpiresAt).getTime();
    if (!Number.isFinite(expiry)) {
        console.error('Bunpro live smoke found an invalid YOMU_BUNPRO_FRONTEND_API_TOKEN_EXPIRES_AT value.');
        process.exit(1);
    }
    if (expiry <= Date.now()) {
        console.error('Bunpro live smoke found an expired Bunpro frontend token.');
        process.exit(1);
    }
}

const [user, due, queue, baseStats, search, legacyQueue] = await Promise.all([
    frontendGet('/user'),
    frontendGet('/user/due'),
    frontendGet('/reviews/quiz_index'),
    frontendGet('/user_stats/base_stats'),
    frontendPost('/search/reviewables_v1_1', {
        query: '読む',
        options: {
            include_reviews: false,
            include_bookmarks: false,
            include_notes: false,
            only_bookmarks: false,
        },
        is_searching_grammar: true,
        is_searching_vocab: true,
    }),
    legacyApiKey ? legacyGet('/study_queue').catch(error => ({ error: publicError(error) })) : Promise.resolve({ skipped: true }),
]);
const detail = await fetchSampleDetail(search);

const grade = liveGrade ? await gradeOneQueueItem(queue, liveGrade) : { skipped: true };

const summary = {
    ok: true,
    user: summarizeUser(user),
    due: summarizeDue(due),
    queue: summarizeCollection(queue),
    baseStats: summarizeObject(baseStats),
    search: summarizeSearch(search),
    detail: summarizeDetail(detail),
    grade,
    legacyQueue: summarizeLegacyQueue(legacyQueue),
};

if (!summary.search.vocabCount && !summary.search.grammarCount) {
    throw new Error('Bunpro live smoke search returned no reviewables for 読む.');
}
if (!summary.search.sampleHasMeaning || !summary.search.sampleHasReading) {
    throw new Error('Bunpro live smoke search omitted the meaning or reading needed by the definition source.');
}
if (summary.detail.includedLocation !== 'root') {
    throw new Error('Bunpro live smoke detail response did not expose the supported root included collection.');
}

console.log(JSON.stringify(summary, null, 2));

async function frontendGet(pathname) {
    return await requestJson(`${FRONTEND_BASE_URL}${pathname}`, {
        method: 'GET',
        headers: frontendHeaders(),
    }, pathname);
}

async function frontendPost(pathname, body) {
    return await requestJson(`${FRONTEND_BASE_URL}${pathname}`, {
        method: 'POST',
        headers: frontendHeaders(),
        body: JSON.stringify(body),
    }, pathname);
}

async function fetchSampleDetail(search) {
    const requestPath = sampleDetailPath(search);
    if (requestPath) return await frontendGet(requestPath);
    throw new Error('Bunpro live smoke search returned no detail identity.');
}

function sampleDetailPath(search) {
    return DETAIL_PATH_SOURCES
        .map(source => sampleDetailPathFromSource(search, source))
        .find(Boolean) ?? '';
}

function sampleDetailPathFromSource(search, source) {
    const item = collectionItems(search?.[source.collection])[0];
    const identity = detailIdentity(item, source.identityFields);
    return identity ? `/reviewables/${source.path}/${encodeURIComponent(identity)}` : '';
}

function detailIdentity(item, fields) {
    const attributes = item?.attributes ?? item;
    return fields
        .map(field => detailIdentityValue(attributes?.[field] ?? item?.[field]))
        .find(Boolean) ?? '';
}

function detailIdentityValue(value) {
    if (typeof value === 'string') return value.trim();
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

async function gradeOneQueueItem(queue, requestedGrade) {
    const entry = queue?.pending_attempt?.[0];
    const reviewId = entry?.data?.id ?? entry?.data?.attributes?.id;
    if (!reviewId) return { skipped: true, reason: 'no pending review' };
    const sessionId = Number(queue?.review_session_id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) throw new Error('Bunpro queue returned no active review_session_id.');
    const attributes = entry?.data?.attributes ?? {};
    const endpoint = attributes.user_study_question_id
        ? 'self_study_reviews'
        : Object.prototype.hasOwnProperty.call(attributes, 'ghost_count') ? 'reviews' : 'ghost_reviews';
    const fsrs = endpoint === 'reviews' && attributes.is_fsrs === true;
    const grade = requestedGrade === 'pass' ? 'good' : requestedGrade === 'fail' ? (fsrs ? 'again' : 'hard') : requestedGrade;
    const input = liveGradeInput(grade, fsrs);
    const body = {
        review_session_id: sessionId,
        correct: input.correct,
        fsrs_input: input.fsrsInput,
        loaded_review_ids: null,
        loaded_ghost_review_ids: null,
        loaded_self_study_review_ids: null,
        ...(input.incorrectAnswer ? { incorrect_answer: input.incorrectAnswer } : {}),
    };
    const response = await frontendPost(`/${endpoint}/${encodeURIComponent(String(reviewId))}/update`, body);
    return {
        ok: true,
        outcome: grade,
        inputMode: fsrs ? 'fsrs' : 'regular',
        responseKeys: objectKeys(response),
    };
}

function liveGradeInput(grade, fsrs) {
    if (!fsrs) {
        if (grade === 'hard') return { correct: false, fsrsInput: null, incorrectAnswer: '__FLASHCARD_REGULAR_HARD' };
        if (grade === 'good') return { correct: true, fsrsInput: null };
        throw new Error('Regular Bunpro live grading accepts hard/good (or fail/pass aliases).');
    }
    if (grade === 'again') return { correct: false, fsrsInput: 'again', incorrectAnswer: '__FLASHCARD_FSRS_AGAIN' };
    if (grade === 'hard') return { correct: false, fsrsInput: 'hard', incorrectAnswer: '__FLASHCARD_FSRS_HARD' };
    if (grade === 'good') return { correct: true, fsrsInput: 'good' };
    if (grade === 'easy') return { correct: true, fsrsInput: 'easy' };
    throw new Error('FSRS Bunpro live grading accepts again/hard/good/easy.');
}

async function legacyGet(pathname) {
    return await requestJson(`${LEGACY_BASE_URL}/${encodeURIComponent(legacyApiKey)}${pathname}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    }, `legacy:${pathname}`);
}

function frontendHeaders() {
    return {
        Authorization: `Bearer ${frontendToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };
}

async function requestJson(url, options, label) {
    const response = await fetch(url, options);
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${label} failed with status ${response.status}.`);
    }
    if (!text.trim()) return null;
    return JSON.parse(text);
}

function summarizeUser(value) {
    const user = firstRecord(value?.user, value?.data, value);
    return {
        present: Boolean(user),
        idPresent: Boolean(user?.id),
        usernamePresent: Boolean(user?.username || user?.name),
    };
}

function summarizeDue(value) {
    return {
        keys: objectKeys(value),
        count: numericField(value, ['due', 'reviews_available', 'count', 'total']),
    };
}

function summarizeCollection(value) {
    const items = [...(value?.pending_attempt ?? []), ...(value?.pending_wrapup ?? [])];
    return {
        keys: objectKeys(value),
        count: items.length,
        sampleKinds: [...new Set(items.map(item => stringField(item, ['type', 'kind', 'reviewable_type'])).filter(Boolean))].slice(0, 4),
    };
}

function summarizeObject(value) {
    return {
        keys: objectKeys(value),
        present: Boolean(value && typeof value === 'object'),
    };
}

function summarizeSearch(value) {
    const vocab = collectionItems(value?.vocabs);
    const sample = vocab[0]?.attributes ?? vocab[0] ?? {};
    return {
        keys: objectKeys(value),
        vocabCount: collectionItems(value?.vocabs).length,
        grammarCount: collectionItems(value?.grammar_points).length,
        sampleHasMeaning: Boolean(sample.meaning),
        sampleHasReading: Boolean(sample.kana || sample.furigana || sample.reading),
        sampleHasNuance: Boolean(sample.nuance || sample.nuance_translation),
    };
}

function summarizeDetail(value) {
    const included = detailIncludedCollection(value);
    const stats = detailStats();
    for (const row of included.rows) recordDetailRow(stats, row);
    return {
        topLevelKeys: objectKeys(value),
        includedLocation: included.location,
        includedCount: included.rows.length,
        includedTypeCounts: Object.fromEntries([...stats.types.entries()].sort(([left], [right]) => left.localeCompare(right))),
        studyQuestionAttributeKeys: [...stats.attributeKeys].sort(),
        usableSentenceCount: stats.usableSentences,
        usableTranslationCount: stats.usableTranslations,
        usableAudioRowCount: stats.usableAudioRows,
        rejectedRowCounts: stats.rejected,
        duplicateRowCount: stats.duplicateRows,
        dedupedSentenceCount: stats.dedupeKeys.size,
    };
}

function detailIncludedCollection(value) {
    return Array.isArray(value?.included)
        ? { location: 'root', rows: value.included }
        : { location: 'missing', rows: [] };
}

function detailStats() {
    return {
        types: new Map(),
        attributeKeys: new Set(),
        rejected: { nonStudyQuestion: 0, missingAttributes: 0, missingSentence: 0, nonJapaneseSentence: 0 },
        dedupeKeys: new Set(),
        usableSentences: 0,
        usableTranslations: 0,
        usableAudioRows: 0,
        duplicateRows: 0,
    };
}

function recordDetailRow(stats, row) {
    const context = detailRowContext(row);
    recordDetailRowType(stats, context.type);
    recordDetailAttributeKeys(stats, context);
    const rejection = DETAIL_ROW_REJECTION_RULES.find(rule => rule.rejects(context));
    if (rejection) return rejectDetailRow(stats, rejection.reason);
    recordUsableDetailRow(stats, context.sentence, context.attributes);
}

function detailRowContext(row) {
    const source = row ?? {};
    const attributes = detailRowAttributes(source.attributes);
    return {
        type: detailRowType(source.type),
        attributes,
        sentence: detailRowSentence(attributes),
    };
}

function detailRowType(value) {
    return typeof value === 'string' ? value : '(missing)';
}

function detailRowSentence(attributes) {
    return typeof attributes?.content === 'string' ? attributes.content : '';
}

function detailRowAttributes(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function recordDetailRowType(stats, type) {
    stats.types.set(type, (stats.types.get(type) ?? 0) + 1);
}

function recordDetailAttributeKeys(stats, context) {
    if (context.type !== 'study_question' || context.attributes === null) return;
    Object.keys(context.attributes).forEach(key => stats.attributeKeys.add(key));
}

function rejectDetailRow(stats, reason) {
    stats.rejected[reason] += 1;
}

function recordUsableDetailRow(stats, sentence, attributes) {
    stats.usableSentences += 1;
    const translation = typeof attributes.translation === 'string' ? attributes.translation : '';
    stats.usableTranslations += Number(Boolean(translation.trim()));
    const audioUrls = [attributes.female_audio_url, attributes.male_audio_url];
    stats.usableAudioRows += Number(audioUrls.some(isHttpsUrl));
    const key = `${normalizeMetadataText(sentence)}\u0000${normalizeMetadataText(translation)}`;
    const previousKeyCount = stats.dedupeKeys.size;
    stats.dedupeKeys.add(key);
    stats.duplicateRows += Number(stats.dedupeKeys.size === previousKeyCount);
}

function isHttpsUrl(value) {
    return typeof value === 'string' && value.startsWith('https://');
}

function normalizeMetadataText(value) {
    return value.normalize('NFKC').replace(/<[^>]*>/gu, '').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function summarizeLegacyQueue(value) {
    if (value?.skipped) return { skipped: true };
    if (value?.error) return { error: value.error };
    return {
        keys: objectKeys(value),
        count: numericField(value?.requested_information, ['reviews_available', 'reviewsAvailable'])
            ?? numericField(value, ['reviews_available', 'reviewsAvailable', 'count']),
    };
}

function collectionItems(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.reviews)) return value.reviews;
    if (Array.isArray(value?.reviewables)) return value.reviewables;
    return [];
}

function firstRecord(...values) {
    return values.find(value => value && typeof value === 'object' && !Array.isArray(value)) ?? null;
}

function objectKeys(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).slice(0, 10) : [];
}

function numericField(value, names) {
    if (!value || typeof value !== 'object') return null;
    for (const name of names) {
        const candidate = value[name];
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
        if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
    }
    return null;
}

function stringField(value, names) {
    if (!value || typeof value !== 'object') return '';
    for (const name of names) {
        const candidate = value[name];
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return '';
}

function publicError(error) {
    return error instanceof Error ? error.message.replace(legacyApiKey, '[redacted]') : String(error);
}
