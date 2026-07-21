import { requestHttp } from '../network/http-request';
import type { ReaderHttpOptions } from '../network/http-options';
import { httpStatusFromError } from '../network/error-status';

const BUNPRO_FRONTEND_API_BASE_URL = 'https://api.bunpro.jp/api/frontend';
const BUNPRO_LEGACY_API_BASE_URL = 'https://bunpro.jp/api/user';

const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_EXPIRED_CODE_RE = /AUTH_USER_DENIED|token expired|expired|\b401\b/i;
// A transport failure (CORS wall, dead bridge — no HTTP status at all) means
// EVERY Bunpro call from this page is doomed until the environment changes.
// Without a breaker each hovered word refired the same blocked search request.
const TRANSPORT_FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const TRANSPORT_FAILURE_MESSAGE_RE = /NetworkError|Failed to fetch|load failed|cross-origin|CORS/i;

type BunproRequest = (url: string, options?: ReaderHttpOptions) => Promise<unknown>;

export interface BunproClientOptions {
    getFrontendToken?: () => string;
    getLegacyApiKey?: () => string;
    getProxyUrl?: () => string;
    frontendBaseUrl?: string;
    legacyBaseUrl?: string;
    requestImpl?: BunproRequest;
    timeoutMs?: number;
}

export interface BunproSearchOptions {
    grammar?: boolean;
    vocab?: boolean;
    limit?: number;
    includeReviews?: boolean;
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

export type BunproReviewEndpoint = 'review' | 'ghost-review' | 'self-study-review';

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
    private readonly getProxyUrl: () => string;
    private transportRetryAfter = 0;

    constructor(options: BunproClientOptions = {}) {
        this.getFrontendToken = options.getFrontendToken ?? (() => '');
        this.getLegacyApiKey = options.getLegacyApiKey ?? (() => '');
        this.getProxyUrl = options.getProxyUrl ?? (() => '');
        this.frontendBaseUrl = trimBaseUrl(options.frontendBaseUrl ?? BUNPRO_FRONTEND_API_BASE_URL);
        this.legacyBaseUrl = trimBaseUrl(options.legacyBaseUrl ?? BUNPRO_LEGACY_API_BASE_URL);
        this.requestImpl = options.requestImpl ?? requestHttp;
        this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    }

    hasFrontendCredential(): boolean {
        return Boolean(this.getFrontendToken().trim());
    }

    /** Cheap non-reversible fingerprint of the frontend token, so persisted
     * per-account caches can be validated without storing the token itself. */
    // fallow-ignore-next-line unused-class-member
    frontendCredentialFingerprint(): string {
        const token = this.getFrontendToken().trim();
        if (!token) return '';
        let hash = 5381;
        for (let index = 0; index < token.length; index += 1) {
            hash = ((hash << 5) + hash + token.charCodeAt(index)) >>> 0;
        }
        return `${hash.toString(16)}:${token.length}`;
    }

    // fallow-ignore-next-line unused-class-member
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
        // /user/queue only returns deck settings; the actual review queue
        // Bunpro's own quiz loads is /reviews/quiz_index.
        return this.frontend('/reviews/quiz_index');
    }

    // fallow-ignore-next-line unused-class-member
    getUserFurigana(): Promise<unknown> {
        return this.frontend('/user/user_furigana');
    }

    // fallow-ignore-next-line unused-class-member
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

    // fallow-ignore-next-line unused-class-member
    getJlptProgress(): Promise<unknown> {
        return this.frontend('/user_stats/jlpt_progress_mixed');
    }

    // Called through a structural Pick<> by the word-state store, which the
    // member-usage analysis cannot see.
    // fallow-ignore-next-line unused-class-member
    getSrsOverview(): Promise<unknown> {
        return this.frontend('/user_stats/srs_level_overview');
    }

    // Live API rejects numeric levels: `level` is the tier name Bunpro's own
    // stats page sends (beginner/adept/seasoned/expert/master/ghost). Called
    // through a structural Pick<> by the word-state store.
    // fallow-ignore-next-line unused-class-member
    getSrsLevelDetails(level: string, reviewableType: BunproReviewableReference['type'], page = 1): Promise<unknown> {
        return this.frontend('/user_stats/srs_level_details', {
            query: {
                level,
                reviewable_type: reviewableType,
                page: String(Math.max(1, Math.floor(page))),
            },
        });
    }

    // fallow-ignore-next-line unused-class-member
    getForecastDaily(): Promise<unknown> {
        return this.frontend('/user_stats/forecast_daily');
    }

    // fallow-ignore-next-line unused-class-member
    getForecastHourly(): Promise<unknown> {
        return this.frontend('/user_stats/forecast_hourly');
    }

    // fallow-ignore-next-line unused-class-member
    getReviewActivity(): Promise<unknown> {
        return this.frontend('/user_stats/review_activity');
    }

    getVocab(slugOrId: string | number): Promise<unknown> {
        return this.frontend(`/reviewables/vocab/${encodeURIComponent(String(slugOrId))}`, { auth: 'optional' });
    }

    getGrammarPoint(id: string | number): Promise<unknown> {
        return this.frontend(`/reviewables/grammar_point/${encodeURIComponent(String(id))}`, { auth: 'optional' });
    }

    async search(query: string, options: BunproSearchOptions = {}): Promise<unknown> {
        return this.frontend('/search/reviewables_v1_1', {
            method: 'POST',
            // Definition/frequency lookups read public reviewable data; only a
            // search that asks for the learner's review state needs the token.
            auth: options.includeReviews ? 'required' : 'optional',
            body: {
                query,
                options: {
                    // Definition/mining lookups do not need the learner's
                    // private notes or bookmarks. Review relationships are
                    // opt-in for the rare caller that actually consumes them.
                    include_reviews: options.includeReviews ?? false,
                    include_bookmarks: false,
                    include_notes: false,
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

    updateReview(reviewId: string | number, body: Record<string, unknown>, endpoint: BunproReviewEndpoint = 'review'): Promise<unknown> {
        const collection = endpoint === 'ghost-review'
            ? 'ghost_reviews'
            : endpoint === 'self-study-review' ? 'self_study_reviews' : 'reviews';
        return this.frontend(`/${collection}/${encodeURIComponent(String(reviewId))}/update`, {
            method: 'POST',
            body,
        });
    }

    getLegacyStudyQueue(): Promise<unknown> {
        return this.legacy('/study_queue');
    }

    // fallow-ignore-next-line unused-class-member
    getLegacyRecentItems(limit = 10): Promise<unknown> {
        return this.legacy(`/recent_items/${Math.min(Math.max(Math.floor(limit), 1), 50)}`);
    }

    private async frontend(path: string, options: BunproFrontendRequestOptions = {}): Promise<unknown> {
        const token = this.getFrontendToken().trim();
        const optionalAuth = options.auth === 'optional';
        if (!token && !optionalAuth) throw new BunproApiError('Bunpro frontend token is not set.');
        let response: unknown;
        try {
            response = await this.frontendRequest(path, options, token);
        } catch (error) {
            // Public reviewable data must not go down with a stale login: a
            // 401/403 on an optional-auth request retries anonymously, exactly
            // what an expired or revoked token would otherwise silently break.
            const status = error instanceof BunproApiError ? error.status : httpStatusFromError(error);
            if (!optionalAuth || !token || (status !== 401 && status !== 403)) throw error;
            response = await this.frontendRequest(path, options, '');
        }
        return options.trimLimit ? trimBunproSearchResponse(response, options.trimLimit) : response;
    }

    private frontendRequest(path: string, options: BunproFrontendRequestOptions, token: string): Promise<unknown> {
        const url = urlWithQuery(`${this.frontendBaseUrl}${path}`, options.query);
        return this.requestJson(url, {
            method: options.method ?? 'GET',
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            data: options.body === undefined ? undefined : JSON.stringify(options.body),
            statusFailureMessage: status => status === 401
                ? 'Bunpro token expired or was denied (401).'
                : `Bunpro API request failed (${status}).`,
        });
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
        if (this.transportRetryAfter > Date.now()) {
            throw new BunproApiError('Bunpro is unreachable from this page (cross-origin blocked); backing off.');
        }
        try {
            const response = await this.requestImpl(url, {
                ...options,
                responseType: 'json',
                timeoutMs: this.timeoutMs,
                preferFetch: true,
                allowDirectCrossOrigin: true,
                // The Bearer token must never transit the SHARED public proxy,
                // but the user's own configured proxy is their infrastructure —
                // and on hosted pages with no userscript bridge it is the only
                // transport that can carry an authenticated Bunpro request.
                proxyUrl: this.getProxyUrl(),
                allowPublicProxies: false,
                allowSensitiveConfiguredProxy: true,
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                failureLabel: 'Bunpro request',
            });
            this.transportRetryAfter = 0;
            return response;
        } catch (error) {
            if (isBunproTransportFailure(error)) this.transportRetryAfter = Date.now() + TRANSPORT_FAILURE_BACKOFF_MS;
            throw normalizeBunproError(error);
        }
    }
}

interface BunproFrontendRequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    query?: Record<string, string | undefined>;
    body?: unknown;
    trimLimit?: number;
    // 'optional' marks endpoints whose data is public: the token is attached
    // when present (never required), and an auth failure retries anonymously.
    auth?: 'required' | 'optional';
}

// Transport failures carry no HTTP status: the request never completed (CORS
// wall, dead bridge, offline). An HTTP status — even 401/500 — proves the
// transport works and must NOT trip the breaker.
function isBunproTransportFailure(error: unknown): boolean {
    if (httpStatusFromError(error) !== undefined) return false;
    if (error instanceof BunproApiError) return false;
    return error instanceof Error && TRANSPORT_FAILURE_MESSAGE_RE.test(`${error.name} ${error.message}`);
}

function normalizeBunproError(error: unknown): Error {
    if (error instanceof BunproApiError) return error;
    const status = httpStatusFromError(error);
    if (!(error instanceof Error)) return new BunproApiError('Bunpro request failed.', status);
    if (status === 401 || TOKEN_EXPIRED_CODE_RE.test(error.message)) return new BunproApiError('Bunpro token expired or was denied.', 401);
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
