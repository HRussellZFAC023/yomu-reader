import { requestHttp } from '../network/http-request';
import type { ReaderHttpOptions } from '../network/http-options';
import { httpStatusFromError } from '../network/error-status';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';

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
    return sensitiveFingerprint(value);
}

interface WanikaniAccountContext {
    readonly token: string;
    readonly fingerprint: string;
    readonly generation: number;
    readonly cacheNamespace: string;
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
    private verifiedContext = '';
    private activeFingerprint = '';
    private contextGeneration = 0;

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

    clear(): void {
        this.resetAccountContext('');
    }

    async getUser(force = false): Promise<WanikaniUserData> {
        return this.getUserFor(this.accountContext(), force);
    }

    async effectiveMaxLevel(): Promise<number> {
        const context = this.accountContext();
        return effectiveMaxLevelForUser(await this.getUserFor(context));
    }

    async getSummary(): Promise<unknown> {
        const context = this.accountContext();
        await this.ensureUser(context);
        return this.request(context, '/summary', {}, { cacheTtlMs: 30_000 });
    }

    async getAssignments(options: WanikaniListOptions = {}): Promise<unknown[]> {
        const context = this.accountContext();
        await this.ensureUser(context);
        return this.collect(context, '/assignments', options, 30_000);
    }

    async getSubjects(options: WanikaniListOptions = {}): Promise<unknown[]> {
        const context = this.accountContext();
        const maxLevel = effectiveMaxLevelForUser(await this.ensureUser(context));
        const levels = permittedSubjectLevels(options.levels, maxLevel);
        if (!levels) return [];
        const subjects = await this.collect(context, '/subjects', { ...options, levels }, 24 * 60 * 60 * 1000);
        return subjects.filter(subject => rawSubjectLevel(subject) <= maxLevel);
    }

    async getStudyMaterials(options: WanikaniListOptions = {}): Promise<unknown[]> {
        const context = this.accountContext();
        await this.ensureUser(context);
        return this.collect(context, '/study_materials', options, 60_000);
    }

    async getReviewStatistics(options: WanikaniListOptions = {}): Promise<unknown[]> {
        const context = this.accountContext();
        await this.ensureUser(context);
        return this.collect(context, '/review_statistics', options, 60_000);
    }

    async createReview(body: {
        assignment_id: number;
        incorrect_meaning_answers: number;
        incorrect_reading_answers: number;
    }): Promise<unknown> {
        const context = this.accountContext();
        await this.ensureUser(context);
        const response = await this.request(context, '/reviews', {
            method: 'POST',
            body: { review: body },
        });
        this.invalidateReviewStateCaches(context);
        return response;
    }

    private async getUserFor(context: WanikaniAccountContext, force = false): Promise<WanikaniUserData> {
        const cached = this.cachedUserFor(context, force);
        if (cached) return cached;
        const raw = await this.request(context, '/user', {}, { cacheTtlMs: force ? 0 : 60_000 });
        const user = parseWanikaniUser(raw);
        if (this.isCurrentContext(context)) {
            this.verifiedUser = user;
            this.verifiedContext = context.cacheNamespace;
        }
        return user;
    }

    private cachedUserFor(context: WanikaniAccountContext, force: boolean): WanikaniUserData | null {
        if (force) return null;
        if (this.verifiedContext !== context.cacheNamespace) return null;
        return this.verifiedUser;
    }

    private async ensureUser(context: WanikaniAccountContext): Promise<WanikaniUserData> {
        return this.getUserFor(context);
    }

    private async collect(context: WanikaniAccountContext, path: string, options: WanikaniListOptions, cacheTtlMs = 0): Promise<unknown[]> {
        const cacheKey = `${context.cacheNamespace}:${path}?${stableOptionsKey(options)}`;
        const cachedResponse = this.responseCache.get(cacheKey);
        if (cachedResponse && cachedResponse.expiresAt > this.now()) return cachedResponse.value as unknown[];
        const cached = this.pending.get(cacheKey);
        if (cached) return cached as Promise<unknown[]>;
        const promise = this.collectUncached(context, path, options).then(items => {
            if (cacheTtlMs > 0 && this.isCurrentContext(context)) {
                this.responseCache.set(cacheKey, { expiresAt: this.now() + cacheTtlMs, value: items });
            }
            return items;
        }).finally(() => this.pending.delete(cacheKey));
        this.pending.set(cacheKey, promise);
        return promise;
    }

    private async collectUncached(context: WanikaniAccountContext, path: string, options: WanikaniListOptions): Promise<unknown[]> {
        const items: unknown[] = [];
        let url: string | null = `${this.baseUrl}${path}${queryString(options)}`;
        const visited = new Set<string>();
        while (url) {
            assertWanikaniPaginationUrl(url, visited, value => this.isSafeApiUrl(value));
            visited.add(url);
            const page: WanikaniCollection<unknown> = await this.requestUrl(context, url) as WanikaniCollection<unknown>;
            url = appendWanikaniCollectionPage(items, page);
        }
        return items;
    }

    private request(context: WanikaniAccountContext, path: string, options: WanikaniRequestOptions = {}, cache: { cacheTtlMs?: number } = {}): Promise<unknown> {
        const url = `${this.baseUrl}${path}`;
        const cacheTtlMs = wanikaniCacheTtl(cache);
        if (!isCacheableWanikaniRequest(cacheTtlMs, options.method)) return this.requestUrl(context, url, options);
        const key = `${context.cacheNamespace}:${url}`;
        const existing = this.cachedOrPendingResponse(key);
        if (existing) return existing;
        const request = this.requestUrl(context, url, options).then(value => {
            this.cacheResponseForCurrentContext(context, key, cacheTtlMs, value);
            return value;
        }).finally(() => this.pending.delete(key));
        this.pending.set(key, request);
        return request;
    }

    private cachedOrPendingResponse(key: string): Promise<unknown> | null {
        const cached = this.responseCache.get(key);
        if (cached && cached.expiresAt > this.now()) return Promise.resolve(cached.value);
        return this.pending.get(key) ?? null;
    }

    private cacheResponseForCurrentContext(context: WanikaniAccountContext, key: string, cacheTtlMs: number, value: unknown): void {
        if (!this.isCurrentContext(context)) return;
        this.responseCache.set(key, { expiresAt: this.now() + cacheTtlMs, value });
    }

    private async requestUrl(context: WanikaniAccountContext, url: string, options: WanikaniRequestOptions = {}): Promise<unknown> {
        assertSafeWanikaniRequestUrl(url, value => this.isSafeApiUrl(value));
        return this.requestWithRateLimitRetry(context, url, options);
    }

    private async requestWithRateLimitRetry(
        context: WanikaniAccountContext,
        url: string,
        options: WanikaniRequestOptions,
    ): Promise<unknown> {
        try {
            return await this.requestAttempt(context, url, options);
        } catch (error) {
            const normalized = normalizeWanikaniError(error);
            if (!isRateLimitError(normalized)) throw normalized;
            await this.sleep(Math.max(2_000, this.minRequestIntervalMs * 2));
            try {
                return await this.requestAttempt(context, url, options);
            } catch (retryError) {
                throw normalizeWanikaniError(retryError);
            }
        }
    }

    private async requestAttempt(context: WanikaniAccountContext, url: string, options: WanikaniRequestOptions): Promise<unknown> {
        await this.throttle();
        return this.requestImpl(url, {
            method: options.method ?? 'GET',
            headers: {
                Authorization: `Bearer ${context.token}`,
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
            statusFailureMessage: wanikaniStatusFailureMessage,
        });
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

    private accountContext(): WanikaniAccountContext {
        const token = this.getToken().trim();
        if (!token) {
            this.clear();
            throw new WanikaniApiError('WaniKani API token is not set.');
        }
        const fingerprint = fingerprintWanikaniToken(token);
        if (fingerprint !== this.activeFingerprint) this.resetAccountContext(fingerprint);
        const generation = this.contextGeneration;
        return { token, fingerprint, generation, cacheNamespace: `${generation}:${fingerprint}` };
    }

    private resetAccountContext(fingerprint: string): void {
        this.contextGeneration += 1;
        this.activeFingerprint = fingerprint;
        this.verifiedUser = null;
        this.verifiedContext = '';
        this.pending.clear();
        this.responseCache.clear();
    }

    private isCurrentContext(context: WanikaniAccountContext): boolean {
        return context.generation === this.contextGeneration
            && context.fingerprint === this.activeFingerprint
            && context.token === this.getToken().trim();
    }

    private invalidateReviewStateCaches(context: WanikaniAccountContext): void {
        for (const key of this.currentReviewStateCacheKeys(context)) this.responseCache.delete(key);
    }

    private currentReviewStateCacheKeys(context: WanikaniAccountContext): string[] {
        if (!this.isCurrentContext(context)) return [];
        return [...this.responseCache.keys()].filter(key => isReviewStateCacheKey(key, context, this.baseUrl));
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

function permittedSubjectLevels(requested: number[] | undefined, maxLevel: number): number[] | null {
    if (!requested?.length) return Array.from({ length: maxLevel }, (_, index) => index + 1);
    const levels = requested.filter(level => level >= 1 && level <= maxLevel);
    return levels.length ? levels : null;
}

function assertWanikaniPaginationUrl(
    url: string,
    visited: ReadonlySet<string>,
    isSafe: (value: string) => boolean,
): void {
    if (!isSafe(url)) throw new WanikaniApiError('WaniKani returned an unsafe pagination URL.');
    if (visited.has(url)) throw new WanikaniApiError('WaniKani pagination repeated a page URL.');
    if (visited.size >= 1000) throw new WanikaniApiError('WaniKani pagination exceeded the safety limit.');
}

function appendWanikaniCollectionPage(items: unknown[], page: WanikaniCollection<unknown>): string | null {
    if (Array.isArray(page.data)) items.push(...page.data);
    return typeof page.pages?.next_url === 'string' ? page.pages.next_url : null;
}

function wanikaniStatusFailureMessage(status: number): string {
    if (status === 401) return 'WaniKani token expired or was denied (401).';
    if (status === 403) return 'WaniKani token lacks permission for this request (403).';
    return `WaniKani API request failed (${status}).`;
}

function isReviewStateCacheKey(key: string, context: WanikaniAccountContext, baseUrl: string): boolean {
    if (key === `${context.cacheNamespace}:${baseUrl}/summary`) return true;
    const collectionPrefixes = ['/assignments?', '/review_statistics?'];
    return collectionPrefixes.some(path => key.startsWith(`${context.cacheNamespace}:${path}`));
}

function wanikaniCacheTtl(cache: { cacheTtlMs?: number }): number {
    return cache.cacheTtlMs ?? 0;
}

function isCacheableWanikaniRequest(cacheTtlMs: number, method: WanikaniRequestOptions['method']): boolean {
    return cacheTtlMs > 0 && method !== 'POST';
}

function assertSafeWanikaniRequestUrl(url: string, isSafe: (value: string) => boolean): void {
    if (!isSafe(url)) throw new WanikaniApiError('Blocked a WaniKani request outside the official API origin.');
}

const PAID_SUBSCRIPTION_TYPES = new Set(['recurring', 'lifetime']);

function effectiveMaxLevelForUser(user: WanikaniUserData): number {
    const subscription = user.subscription;
    if (!hasPaidSubscription(subscription)) return FREE_TIER_MAX_LEVEL;
    const granted = Number(subscription.max_level_granted);
    if (!Number.isFinite(granted)) return FREE_TIER_MAX_LEVEL;
    if (granted <= 0) return FREE_TIER_MAX_LEVEL;
    return Math.min(60, granted);
}

function hasPaidSubscription(subscription: WanikaniUserData['subscription']): boolean {
    if (!subscription.active) return false;
    return PAID_SUBSCRIPTION_TYPES.has(subscription.type);
}

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
