import { requestHttp } from '../network/http-request';
import type { ReaderHttpOptions } from '../network/http-options';
import { httpStatusFromError } from '../network/error-status';

const WANIKANI_API_BASE_URL = 'https://api.wanikani.com/v2';
const WANIKANI_REVISION = '20170710';
export const WANIKANI_TOKEN_SETTINGS_URL = 'https://www.wanikani.com/settings/personal_access_tokens';

const REQUEST_TIMEOUT_MS = 30_000;
const FREE_TIER_MAX_LEVEL = 3;

type WanikaniRequest = (url: string, options?: ReaderHttpOptions) => Promise<unknown>;

export class WanikaniApiError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'WanikaniApiError';
    }
}

export interface WanikaniClientOptions {
    getToken?: () => string;
    baseUrl?: string;
    requestImpl?: WanikaniRequest;
    timeoutMs?: number;
    minRequestIntervalMs?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
}

interface WanikaniCollection<T> {
    total_count: number;
    pages?: {
        next_url?: string | null;
    };
    data: T[];
}

export interface WanikaniUserData {
    id: string;
    level: number;
    subscription: {
        active: boolean;
        type: string;
        max_level_granted: number;
        period_ends_at: string | null;
    };
}

export interface WanikaniListOptions {
    ids?: number[];
    levels?: number[];
    types?: string[];
    updatedAfter?: string;
    hidden?: boolean;
    immediatelyAvailableForReview?: boolean;
    immediatelyAvailableForLessons?: boolean;
    subjectIds?: number[];
    slugs?: string[];
    srsStages?: number[];
    availableBefore?: string;
    started?: boolean;
    unlocked?: boolean;
    page?: number;
}

const MIN_REQUEST_INTERVAL_MS = 1100;

export function fingerprintWanikaniToken(value: string): string {
    const token = value.trim();
    if (!token) return '';
    // A compact, non-reversible cache partition. The token itself never
    // appears in URLs, logs, cache keys, or storage outside the setting.
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < token.length; index += 1) {
        const code = token.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193) >>> 0;
        second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
    }
    return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}:${token.length}`;
}

export class WanikaniClient {
    private readonly getToken: () => string;
    private readonly baseUrl: string;
    private readonly requestImpl: WanikaniRequest;
    private readonly timeoutMs: number;
    private readonly minRequestIntervalMs: number;
    private readonly now: () => number;
    private readonly sleep: (milliseconds: number) => Promise<void>;
    private lastRequestAt = 0;
    private requestStartQueue: Promise<void> = Promise.resolve();
    private readonly pending = new Map<string, Promise<unknown>>();
    private readonly responseCache = new Map<string, { expiresAt: number; value: unknown }>();
    private verifiedUser: WanikaniUserData | null = null;
    private verifiedFingerprint = '';

    constructor(options: WanikaniClientOptions = {}) {
        this.getToken = options.getToken ?? (() => '');
        this.baseUrl = trimBaseUrl(options.baseUrl ?? WANIKANI_API_BASE_URL);
        this.requestImpl = options.requestImpl ?? requestHttp;
        this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
        this.minRequestIntervalMs = Math.max(0, options.minRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS);
        this.now = options.now ?? Date.now;
        this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    }

    hasCredential(): boolean {
        return Boolean(this.getToken().trim());
    }

    tokenFingerprint(): string {
        return fingerprintWanikaniToken(this.getToken());
    }

    async getUser(force = false): Promise<WanikaniUserData> {
        const fingerprint = this.currentFingerprint();
        if (!force && this.verifiedUser && this.verifiedFingerprint === fingerprint) return this.verifiedUser;
        const raw = await this.request('/user', {}, { cacheTtlMs: force ? 0 : 60_000 });
        const user = parseWanikaniUser(raw);
        this.verifiedUser = user;
        this.verifiedFingerprint = fingerprint;
        return user;
    }

    async effectiveMaxLevel(): Promise<number> {
        const user = this.verifiedUser ?? await this.getUser();
        const subscription = user.subscription;
        if (!subscription.active) return FREE_TIER_MAX_LEVEL;
        if (!KNOWN_SUBSCRIPTION_TYPES.has(subscription.type)) return FREE_TIER_MAX_LEVEL;
        if (subscription.type === 'free') return FREE_TIER_MAX_LEVEL;
        const granted = Number(subscription.max_level_granted);
        return Number.isFinite(granted) && granted > 0 ? Math.min(60, granted) : FREE_TIER_MAX_LEVEL;
    }

    async getSummary(): Promise<unknown> {
        await this.ensureUser();
        return this.request('/summary', {}, { cacheTtlMs: 30_000 });
    }

    async getAssignments(options: WanikaniListOptions = {}): Promise<unknown[]> {
        await this.ensureUser();
        return this.collect('/assignments', options, 30_000);
    }

    async getSubjects(options: WanikaniListOptions = {}): Promise<unknown[]> {
        await this.ensureUser();
        const maxLevel = await this.effectiveMaxLevel();
        const requestedLevels = options.levels?.filter(level => level >= 1 && level <= maxLevel);
        if (options.levels?.length && !requestedLevels?.length) return [];
        const levels = requestedLevels?.length
            ? requestedLevels
            : Array.from({ length: maxLevel }, (_, index) => index + 1);
        const subjects = await this.collect('/subjects', { ...options, levels }, 24 * 60 * 60 * 1000);
        return subjects.filter(subject => rawSubjectLevel(subject) <= maxLevel);
    }

    async getStudyMaterials(options: WanikaniListOptions = {}): Promise<unknown[]> {
        await this.ensureUser();
        return this.collect('/study_materials', options, 60_000);
    }

    async getReviewStatistics(options: WanikaniListOptions = {}): Promise<unknown[]> {
        await this.ensureUser();
        return this.collect('/review_statistics', options, 60_000);
    }

    async createReview(body: {
        assignment_id: number;
        incorrect_meaning_answers: number;
        incorrect_reading_answers: number;
    }): Promise<unknown> {
        await this.ensureUser();
        const response = await this.request('/reviews', {
            method: 'POST',
            body: { review: body },
        });
        this.invalidateReviewStateCaches();
        return response;
    }

    private async ensureUser(): Promise<WanikaniUserData> {
        return this.getUser();
    }

    private async collect(path: string, options: WanikaniListOptions, cacheTtlMs = 0): Promise<unknown[]> {
        const dedupeKey = `${this.currentFingerprint()}:${path}?${stableOptionsKey(options)}`;
        const cachedResponse = this.responseCache.get(dedupeKey);
        if (cachedResponse && cachedResponse.expiresAt > this.now()) return cachedResponse.value as unknown[];
        const cached = this.pending.get(dedupeKey);
        if (cached) return cached as Promise<unknown[]>;
        const promise = this.collectUncached(path, options).then(items => {
            if (cacheTtlMs > 0) this.responseCache.set(dedupeKey, { expiresAt: this.now() + cacheTtlMs, value: items });
            return items;
        }).finally(() => this.pending.delete(dedupeKey));
        this.pending.set(dedupeKey, promise);
        return promise;
    }

    private async collectUncached(path: string, options: WanikaniListOptions): Promise<unknown[]> {
        const items: unknown[] = [];
        let url: string | null = `${this.baseUrl}${path}${queryString(options)}`;
        const visited = new Set<string>();
        while (url) {
            if (!this.isSafeApiUrl(url)) throw new WanikaniApiError('WaniKani returned an unsafe pagination URL.');
            if (visited.has(url)) throw new WanikaniApiError('WaniKani pagination repeated a page URL.');
            if (visited.size >= 1000) throw new WanikaniApiError('WaniKani pagination exceeded the safety limit.');
            visited.add(url);
            const page: WanikaniCollection<unknown> = await this.requestUrl(url) as WanikaniCollection<unknown>;
            if (Array.isArray(page.data)) items.push(...page.data);
            url = typeof page.pages?.next_url === 'string' ? page.pages.next_url : null;
        }
        return items;
    }

    private request(path: string, options: WanikaniRequestOptions = {}, cache: { cacheTtlMs?: number } = {}): Promise<unknown> {
        const url = `${this.baseUrl}${path}`;
        if (!cache.cacheTtlMs || options.method === 'POST') return this.requestUrl(url, options);
        const key = `${this.currentFingerprint()}:${url}`;
        const cached = this.responseCache.get(key);
        if (cached && cached.expiresAt > this.now()) return Promise.resolve(cached.value);
        const pending = this.pending.get(key);
        if (pending) return pending;
        const request = this.requestUrl(url, options).then(value => {
            this.responseCache.set(key, { expiresAt: this.now() + (cache.cacheTtlMs ?? 0), value });
            return value;
        }).finally(() => this.pending.delete(key));
        this.pending.set(key, request);
        return request;
    }

    private async requestUrl(url: string, options: WanikaniRequestOptions = {}): Promise<unknown> {
        const token = this.getToken().trim();
        if (!token) throw new WanikaniApiError('WaniKani API token is not set.');
        if (!this.isSafeApiUrl(url)) throw new WanikaniApiError('Blocked a WaniKani request outside the official API origin.');
        let attempt = 0;
        while (true) {
            await this.throttle();
            try {
                return await this.requestImpl(url, {
                method: options.method ?? 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Wanikani-Revision': WANIKANI_REVISION,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                data: options.body === undefined ? undefined : JSON.stringify(options.body),
                responseType: 'json',
                timeoutMs: this.timeoutMs,
                preferFetch: true,
                allowDirectCrossOrigin: true,
                proxyUrl: '',
                allowPublicProxies: false,
                allowConfiguredProxy: false,
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                failureLabel: 'WaniKani request',
                statusFailureMessage: status => status === 401
                    ? 'WaniKani token expired or was denied (401).'
                    : status === 403
                        ? 'WaniKani token lacks permission for this request (403).'
                    : `WaniKani API request failed (${status}).`,
                });
            } catch (error) {
                const normalized = normalizeWanikaniError(error);
                if (attempt === 0 && isRateLimitError(normalized)) {
                    attempt += 1;
                    await this.sleep(Math.max(2_000, this.minRequestIntervalMs * 2));
                    continue;
                }
                throw normalized;
            }
        }
    }

    private throttle(): Promise<void> {
        const scheduled = this.requestStartQueue.then(async () => {
            const wait = this.lastRequestAt + this.minRequestIntervalMs - this.now();
            if (wait > 0) await this.sleep(wait);
            this.lastRequestAt = this.now();
        });
        this.requestStartQueue = scheduled.catch(() => undefined);
        return scheduled;
    }

    private currentFingerprint(): string {
        const fingerprint = this.tokenFingerprint();
        if (!fingerprint) throw new WanikaniApiError('WaniKani API token is not set.');
        if (this.verifiedFingerprint && this.verifiedFingerprint !== fingerprint) {
            this.verifiedUser = null;
            this.verifiedFingerprint = '';
            this.pending.clear();
            this.responseCache.clear();
        }
        return fingerprint;
    }

    private invalidateReviewStateCaches(): void {
        const fingerprint = this.tokenFingerprint();
        const summaryKey = `${fingerprint}:${this.baseUrl}/summary`;
        for (const key of this.responseCache.keys()) {
            if (key === summaryKey
                || key.startsWith(`${fingerprint}:/assignments?`)
                || key.startsWith(`${fingerprint}:/review_statistics?`)) {
                this.responseCache.delete(key);
            }
        }
    }

    private isSafeApiUrl(value: string): boolean {
        try {
            const url = new URL(value);
            const base = new URL(`${this.baseUrl}/`);
            return url.protocol === 'https:'
                && url.origin === base.origin
                && url.pathname.startsWith(base.pathname);
        } catch {
            return false;
        }
    }
}

interface WanikaniRequestOptions {
    method?: 'GET' | 'POST';
    body?: unknown;
}

const KNOWN_SUBSCRIPTION_TYPES = new Set(['free', 'recurring', 'lifetime']);

function parseWanikaniUser(raw: unknown): WanikaniUserData {
    const record = isRecord(raw) ? (isRecord(raw.data) ? raw.data as Record<string, unknown> : raw) : {};
    const subscriptionRaw = isRecord(record.subscription) ? record.subscription : {};
    return {
        id: typeof record.id === 'string' ? record.id : '',
        level: typeof record.level === 'number' ? record.level : 0,
        subscription: {
            active: subscriptionRaw.active === true,
            type: typeof subscriptionRaw.type === 'string' ? subscriptionRaw.type : '',
            max_level_granted: typeof subscriptionRaw.max_level_granted === 'number' ? subscriptionRaw.max_level_granted : 0,
            period_ends_at: typeof subscriptionRaw.period_ends_at === 'string' ? subscriptionRaw.period_ends_at : null,
        },
    };
}

// fallow-ignore-next-line complexity
function queryString(options: WanikaniListOptions): string {
    const params = new URLSearchParams();
    if (options.ids?.length) params.set('ids', options.ids.join(','));
    if (options.levels?.length) params.set('levels', options.levels.join(','));
    if (options.types?.length) params.set('types', options.types.join(','));
    if (options.updatedAfter) params.set('updated_after', options.updatedAfter);
    if (options.hidden !== undefined) params.set('hidden', String(options.hidden));
    if (options.immediatelyAvailableForReview !== undefined) params.set('immediately_available_for_review', String(options.immediatelyAvailableForReview));
    if (options.immediatelyAvailableForLessons !== undefined) params.set('immediately_available_for_lessons', String(options.immediatelyAvailableForLessons));
    if (options.subjectIds?.length) params.set('subject_ids', options.subjectIds.join(','));
    if (options.slugs?.length) params.set('slugs', options.slugs.join(','));
    if (options.srsStages?.length) params.set('srs_stages', options.srsStages.join(','));
    if (options.availableBefore) params.set('available_before', options.availableBefore);
    if (options.started !== undefined) params.set('started', String(options.started));
    if (options.unlocked !== undefined) params.set('unlocked', String(options.unlocked));
    if (options.page !== undefined) params.set('page', String(options.page));
    const query = params.toString();
    return query ? `?${query}` : '';
}

function normalizeWanikaniError(error: unknown): Error {
    if (error instanceof WanikaniApiError) return error;
    const status = httpStatusFromError(error);
    if (!(error instanceof Error)) return new WanikaniApiError('WaniKani request failed.', status);
    if (status === 401) return new WanikaniApiError('WaniKani token expired or was denied.', 401);
    if (status === 403) return new WanikaniApiError('WaniKani token lacks permission for this request.', 403);
    if (status !== undefined) return new WanikaniApiError(error.message, status);
    return error;
}

function isRateLimitError(error: Error): boolean {
    return error instanceof WanikaniApiError && error.status === 429 || /\(429\)|rate limit/i.test(error.message);
}

function rawSubjectLevel(value: unknown): number {
    if (!isRecord(value) || !isRecord(value.data)) return Number.POSITIVE_INFINITY;
    return typeof value.data.level === 'number' ? value.data.level : Number.POSITIVE_INFINITY;
}

function stableOptionsKey(options: WanikaniListOptions): string {
    return JSON.stringify(Object.fromEntries(Object.entries(options).sort(([left], [right]) => left.localeCompare(right))));
}

function trimBaseUrl(value: string): string {
    return value.replace(/\/+$/u, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
