import { requestHttp } from '../network/http-request';
import type { ReaderHttpOptions } from '../network/http-options';

export const BUNPRO_FRONTEND_API_BASE_URL = 'https://api.bunpro.jp/api/frontend';
export const BUNPRO_LEGACY_API_BASE_URL = 'https://bunpro.jp/api/user';

const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_EXPIRED_CODE_RE = /AUTH_USER_DENIED|token expired|expired/i;

type BunproRequest = (url: string, options?: ReaderHttpOptions) => Promise<unknown>;

export interface BunproClientOptions {
    getFrontendToken?: () => string;
    getLegacyApiKey?: () => string;
    frontendBaseUrl?: string;
    legacyBaseUrl?: string;
    requestImpl?: BunproRequest;
    timeoutMs?: number;
}

export interface BunproSearchOptions {
    grammar?: boolean;
    vocab?: boolean;
    limit?: number;
}

export interface BunproReviewableReference {
    type: 'Vocab' | 'GrammarPoint';
    id: number;
}

export interface BunproReviewActionRequest {
    actionType: 'add' | 'remove';
    reviewables: BunproReviewableReference[];
    deckId?: number | null;
}

export class BunproApiError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'BunproApiError';
    }
}

export class BunproClient {
    private readonly getFrontendToken: () => string;
    private readonly getLegacyApiKey: () => string;
    private readonly frontendBaseUrl: string;
    private readonly legacyBaseUrl: string;
    private readonly requestImpl: BunproRequest;
    private readonly timeoutMs: number;

    constructor(options: BunproClientOptions = {}) {
        this.getFrontendToken = options.getFrontendToken ?? (() => '');
        this.getLegacyApiKey = options.getLegacyApiKey ?? (() => '');
        this.frontendBaseUrl = trimBaseUrl(options.frontendBaseUrl ?? BUNPRO_FRONTEND_API_BASE_URL);
        this.legacyBaseUrl = trimBaseUrl(options.legacyBaseUrl ?? BUNPRO_LEGACY_API_BASE_URL);
        this.requestImpl = options.requestImpl ?? requestHttp;
        this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    }

    hasFrontendCredential(): boolean {
        return Boolean(this.getFrontendToken().trim());
    }

    hasLegacyCredential(): boolean {
        return Boolean(this.getLegacyApiKey().trim());
    }

    getUser(): Promise<unknown> {
        return this.frontend('/user');
    }

    getDueCount(): Promise<unknown> {
        return this.frontend('/user/due');
    }

    getQueue(): Promise<unknown> {
        return this.frontend('/user/queue');
    }

    getUserFurigana(): Promise<unknown> {
        return this.frontend('/user/user_furigana');
    }

    getReviews(page = 1, perPage = 25): Promise<unknown> {
        return this.frontend('/reviews', {
            query: {
                page: String(Math.max(1, Math.floor(page))),
                per_page: String(Math.max(1, Math.floor(perPage))),
            },
        });
    }

    getBaseStats(): Promise<unknown> {
        return this.frontend('/user_stats/base_stats');
    }

    getJlptProgress(): Promise<unknown> {
        return this.frontend('/user_stats/jlpt_progress_mixed');
    }

    getSrsOverview(): Promise<unknown> {
        return this.frontend('/user_stats/srs_level_overview');
    }

    getSrsLevelDetails(level: number, reviewableType: BunproReviewableReference['type'], page = 1): Promise<unknown> {
        return this.frontend('/user_stats/srs_level_details', {
            query: {
                level: String(Math.max(1, Math.floor(level))),
                reviewable_type: reviewableType,
                page: String(Math.max(1, Math.floor(page))),
            },
        });
    }

    getForecastDaily(): Promise<unknown> {
        return this.frontend('/user_stats/forecast_daily');
    }

    getForecastHourly(): Promise<unknown> {
        return this.frontend('/user_stats/forecast_hourly');
    }

    getReviewActivity(): Promise<unknown> {
        return this.frontend('/user_stats/review_activity');
    }

    getVocab(slugOrId: string | number): Promise<unknown> {
        return this.frontend(`/reviewables/vocab/${encodeURIComponent(String(slugOrId))}`);
    }

    async search(query: string, options: BunproSearchOptions = {}): Promise<unknown> {
        return this.frontend('/search/reviewables_v1_1', {
            method: 'POST',
            body: {
                query,
                options: {
                    include_reviews: true,
                    include_bookmarks: true,
                    include_notes: true,
                    only_bookmarks: false,
                },
                is_searching_grammar: options.grammar ?? true,
                is_searching_vocab: options.vocab ?? true,
            },
            trimLimit: options.limit,
        });
    }

    updateReviewsViaActionType(request: BunproReviewActionRequest): Promise<unknown> {
        return this.frontend('/reviews/update_via_action_type', {
            method: 'PATCH',
            body: {
                deck_id: request.deckId ?? null,
                action_type: request.actionType,
                reviewables: request.reviewables.map(item => [item.type, item.id]),
            },
        });
    }

    updateReview(reviewId: string | number, body: Record<string, unknown>): Promise<unknown> {
        return this.frontend(`/reviews/${encodeURIComponent(String(reviewId))}/update`, {
            method: 'POST',
            body,
        });
    }

    getLegacyStudyQueue(): Promise<unknown> {
        return this.legacy('/study_queue');
    }

    getLegacyRecentItems(limit = 10): Promise<unknown> {
        return this.legacy(`/recent_items/${Math.min(Math.max(Math.floor(limit), 1), 50)}`);
    }

    private async frontend(path: string, options: BunproFrontendRequestOptions = {}): Promise<unknown> {
        const token = this.getFrontendToken().trim();
        if (!token) throw new BunproApiError('Bunpro frontend token is not set.');
        const url = urlWithQuery(`${this.frontendBaseUrl}${path}`, options.query);
        const response = await this.requestJson(url, {
            method: options.method ?? 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            data: options.body === undefined ? undefined : JSON.stringify(options.body),
            statusFailureMessage: status => status === 401
                ? 'Bunpro token expired or was denied (401).'
                : `Bunpro API request failed (${status}).`,
        });
        return options.trimLimit ? trimBunproSearchResponse(response, options.trimLimit) : response;
    }

    private legacy(path: string): Promise<unknown> {
        const apiKey = this.getLegacyApiKey().trim();
        if (!apiKey) throw new BunproApiError('Bunpro legacy API key is not set.');
        return this.requestJson(`${this.legacyBaseUrl}/${encodeURIComponent(apiKey)}${path}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
    }

    private async requestJson(url: string, options: ReaderHttpOptions): Promise<unknown> {
        try {
            return await this.requestImpl(url, {
                ...options,
                responseType: 'json',
                timeoutMs: this.timeoutMs,
                preferFetch: true,
                allowDirectCrossOrigin: true,
                allowPublicProxies: false,
                allowSensitiveConfiguredProxy: false,
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                failureLabel: 'Bunpro request',
            });
        } catch (error) {
            throw normalizeBunproError(error);
        }
    }
}

interface BunproFrontendRequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    query?: Record<string, string | undefined>;
    body?: unknown;
    trimLimit?: number;
}

function normalizeBunproError(error: unknown): Error {
    if (error instanceof BunproApiError) return error;
    if (!(error instanceof Error)) return new BunproApiError('Bunpro request failed.');
    if (TOKEN_EXPIRED_CODE_RE.test(error.message)) return new BunproApiError('Bunpro token expired or was denied.', 401);
    return error;
}

function trimBaseUrl(value: string): string {
    return value.replace(/\/+$/u, '');
}

function urlWithQuery(url: string, query: Record<string, string | undefined> | undefined): string {
    if (!query) return url;
    const next = new URL(url);
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) next.searchParams.set(key, value);
    });
    return next.href;
}

function trimBunproSearchResponse(raw: unknown, limit: number): unknown {
    const maxItems = Math.max(1, Math.floor(limit));
    if (!raw || typeof raw !== 'object') return raw;
    const value = raw as Record<string, unknown>;
    return {
        ...value,
        grammar_points: trimBunproSearchSection(value.grammar_points, maxItems),
        vocabs: trimBunproSearchSection(value.vocabs, maxItems),
    };
}

function trimBunproSearchSection(section: unknown, limit: number): unknown {
    if (!section || typeof section !== 'object') return section;
    const value = section as { data?: unknown[] };
    if (!Array.isArray(value.data)) return section;
    return { ...value, data: value.data.slice(0, limit) };
}
