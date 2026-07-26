const BOOKWALKER_CONTENT_SESSION_PATHS = new Set([
    '/browserWebApi/c',
    '/trial-page/c',
]);
const BOOKWALKER_AUTH_QUERY_KEYS = ['pfCd', 'Policy', 'Signature', 'Key-Pair-Id'] as const;
const SIGNED_URL_REFRESH_MARGIN_MS = 30_000;
const CONTENT_SESSION_TIMEOUT_MS = 6_000;

interface BookwalkerAssetEnvironment {
    currentUrl: () => string;
    resourceUrls: () => string[];
    fetchJson: (url: string) => Promise<unknown>;
    now: () => number;
}

interface BookwalkerContentAuthorization {
    baseUrl: URL;
    query: Map<string, string>;
}

export class BookwalkerAssetResolver {
    private sessionEndpoint = '';
    private refreshPending?: {
        endpoint: string;
        promise: Promise<BookwalkerContentAuthorization | undefined>;
    };

    constructor(private readonly environment: BookwalkerAssetEnvironment = browserEnvironment()) {}

    rememberSessionEndpoint(): void {
        this.findSessionEndpoint();
    }

    async resolve(url: string): Promise<string> {
        if (!isBookwalkerAssetUrl(url)) return url;
        this.rememberSessionEndpoint();
        if (!bookwalkerSignedUrlNeedsRefresh(url, this.environment.now())) return url;
        return await this.refresh(url) ?? url;
    }

    async refresh(url: string): Promise<string | undefined> {
        if (!isBookwalkerAssetUrl(url)) return undefined;
        const endpoint = this.findSessionEndpoint();
        if (!endpoint) return undefined;
        const authorization = await this.loadAuthorization(endpoint);
        if (!authorization) {
            if (this.sessionEndpoint === endpoint) this.sessionEndpoint = '';
            return undefined;
        }
        return applyAuthorization(url, authorization);
    }

    private findSessionEndpoint(): string {
        const current = safeUrl(this.environment.currentUrl());
        if (!current) return '';
        const contentId = current.searchParams.get('cid') ?? '';
        const candidate = this.environment.resourceUrls()
            .slice()
            .reverse()
            .find(url => isMatchingSessionEndpoint(url, current, contentId));
        if (candidate) this.sessionEndpoint = candidate;
        else if (!isMatchingSessionEndpoint(this.sessionEndpoint, current, contentId)) this.sessionEndpoint = '';
        return this.sessionEndpoint;
    }

    private loadAuthorization(endpoint: string): Promise<BookwalkerContentAuthorization | undefined> {
        if (this.refreshPending?.endpoint === endpoint) return this.refreshPending.promise;
        const pending = this.environment.fetchJson(endpoint)
            .then(parseContentAuthorization)
            .catch(() => undefined)
            .finally(() => {
                if (this.refreshPending?.promise === pending) this.refreshPending = undefined;
            });
        this.refreshPending = { endpoint, promise: pending };
        return pending;
    }
}

export function bookwalkerSignedUrlNeedsRefresh(url: string, now = Date.now()): boolean {
    const parsed = safeUrl(url);
    if (!parsed || !isBookwalkerHost(parsed.hostname)) return false;
    const expiresAt = signedUrlExpiry(parsed);
    return expiresAt !== undefined && expiresAt <= now + SIGNED_URL_REFRESH_MARGIN_MS;
}

function browserEnvironment(): BookwalkerAssetEnvironment {
    return {
        currentUrl: () => location.href,
        resourceUrls: () => {
            try {
                return performance.getEntriesByType('resource')
                    .map(entry => entry.name)
                    .filter(Boolean);
            } catch {
                return [];
            }
        },
        fetchJson: async url => {
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), CONTENT_SESSION_TIMEOUT_MS);
            try {
                const response = await fetch(url, {
                    cache: 'no-store',
                    credentials: 'include',
                    headers: { accept: 'application/json' },
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`BookWalker content session returned ${response.status}.`);
                return response.json();
            } finally {
                window.clearTimeout(timer);
            }
        },
        now: () => Date.now(),
    };
}

function isMatchingSessionEndpoint(rawUrl: string, current: URL, contentId: string): boolean {
    const candidate = safeUrl(rawUrl);
    if (!candidate || candidate.origin !== current.origin) return false;
    if (!BOOKWALKER_CONTENT_SESSION_PATHS.has(candidate.pathname)) return false;
    // BID is not required. Same-origin + the content-session path + a matching cid
    // already identifies this book's session endpoint, and demanding an extra
    // parameter the viewer may omit (free-trial sessions do) would silently turn
    // signed-URL renewal off — the same class of failure as a path-keyed matcher.
    return !contentId || candidate.searchParams.get('cid') === contentId;
}

function parseContentAuthorization(value: unknown): BookwalkerContentAuthorization | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const response = value as { status?: unknown; url?: unknown; auth_info?: unknown };
    if (String(response.status ?? '') !== '200' || typeof response.url !== 'string') return undefined;
    const baseUrl = safeUrl(response.url);
    if (!baseUrl || !isBookwalkerHost(baseUrl.hostname)) return undefined;
    if (!response.auth_info || typeof response.auth_info !== 'object') return undefined;
    const source = response.auth_info as Record<string, unknown>;
    const query = new Map<string, string>();
    for (const key of BOOKWALKER_AUTH_QUERY_KEYS) {
        const entry = source[key];
        if (typeof entry === 'string' && entry) query.set(key, entry);
    }
    return query.has('Policy') && query.has('Signature') && query.has('Key-Pair-Id')
        ? { baseUrl, query }
        : undefined;
}

function applyAuthorization(rawUrl: string, authorization: BookwalkerContentAuthorization): string | undefined {
    const target = safeUrl(rawUrl);
    if (!target || target.origin !== authorization.baseUrl.origin) return undefined;
    if (!target.pathname.startsWith(authorization.baseUrl.pathname)) return undefined;
    for (const key of BOOKWALKER_AUTH_QUERY_KEYS) target.searchParams.delete(key);
    for (const [key, value] of authorization.query) target.searchParams.set(key, value);
    return target.toString();
}

function signedUrlExpiry(url: URL): number | undefined {
    const expires = Number(url.searchParams.get('Expires'));
    if (Number.isFinite(expires) && expires > 0) return expires * 1000;
    const policy = url.searchParams.get('Policy');
    if (!policy) return undefined;
    try {
        const normalized = policy.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/');
        const decoded = atob(normalized);
        const parsed = JSON.parse(decoded) as {
            Statement?: Array<{ Condition?: { DateLessThan?: { 'AWS:EpochTime'?: unknown } } }>;
        };
        const epoch = Number(parsed.Statement?.[0]?.Condition?.DateLessThan?.['AWS:EpochTime']);
        return Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : undefined;
    } catch {
        return undefined;
    }
}

// A BookWalker content asset is anything on a BookWalker host carrying a complete
// CloudFront signature. Deliberately NOT keyed on a directory name: the viewer has
// already moved its layout once (`/OPS/images/` → `/OEBPS/text/…`), and a matcher
// tied to the old path silently disables signed-URL renewal. That failure is
// invisible — every replayed asset 403s and OCR reports "Could not read text" —
// so the matcher keys on the property that actually makes a URL expire.
// `applyAuthorization` still refuses anything outside the content session's own
// base path, so widening the match here cannot rewrite an unrelated URL.
function isBookwalkerAssetUrl(rawUrl: string): boolean {
    const url = safeUrl(rawUrl);
    if (!url || !isBookwalkerHost(url.hostname)) return false;
    return url.searchParams.has('Policy')
        && url.searchParams.has('Signature')
        && url.searchParams.has('Key-Pair-Id');
}

function isBookwalkerHost(hostname: string): boolean {
    return hostname === 'bookwalker.jp' || hostname.endsWith('.bookwalker.jp');
}

function safeUrl(value: string): URL | undefined {
    try {
        return new URL(value, typeof location === 'undefined' ? undefined : location.href);
    } catch {
        return undefined;
    }
}
