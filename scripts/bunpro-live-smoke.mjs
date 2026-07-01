#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { loadLocalEnv } from './lib/qa-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRONTEND_BASE_URL = 'https://api.bunpro.jp/api/frontend';
const LEGACY_BASE_URL = 'https://bunpro.jp/api/user';

loadLocalEnv(ROOT);

const frontendToken = process.env.YOMU_BUNPRO_FRONTEND_API_TOKEN?.trim() ?? '';
const frontendTokenExpiresAt = process.env.YOMU_BUNPRO_FRONTEND_API_TOKEN_EXPIRES_AT?.trim() ?? '';
const legacyApiKey = process.env.YOMU_BUNPRO_API_KEY?.trim() ?? '';

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
    frontendGet('/user/queue'),
    frontendGet('/user_stats/base_stats'),
    frontendPost('/search/reviewables_v1_1', {
        query: '読む',
        options: {
            include_reviews: true,
            include_bookmarks: true,
            include_notes: true,
            only_bookmarks: false,
        },
        is_searching_grammar: true,
        is_searching_vocab: true,
    }),
    legacyApiKey ? legacyGet('/study_queue').catch(error => ({ error: publicError(error) })) : Promise.resolve({ skipped: true }),
]);

const summary = {
    ok: true,
    user: summarizeUser(user),
    due: summarizeDue(due),
    queue: summarizeCollection(queue),
    baseStats: summarizeObject(baseStats),
    search: summarizeSearch(search),
    legacyQueue: summarizeLegacyQueue(legacyQueue),
};

if (!summary.search.vocabCount && !summary.search.grammarCount) {
    throw new Error('Bunpro live smoke search returned no reviewables for 読む.');
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
        throw new Error(`${label} failed with status ${response.status}: ${text.slice(0, 160)}`);
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
    const items = collectionItems(value);
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
    return {
        keys: objectKeys(value),
        vocabCount: collectionItems(value?.vocabs).length,
        grammarCount: collectionItems(value?.grammar_points).length,
    };
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
