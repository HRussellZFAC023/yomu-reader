export interface ProxyFetchOptions extends RequestInit {
    timeoutMs?: number;
    allowPublicProxies?: boolean;
}

type ProxyUrlBuilder = (targetUrl: string) => string;

const BUILT_IN_PROXY_BUILDERS: ProxyUrlBuilder[] = [
    targetUrl => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    targetUrl => `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
];

export function proxyUrlCandidates(targetUrl: string, configuredProxyUrl = '', allowPublicProxies = true): string[] {
    const candidates = [
        configuredProxyFetchUrl(targetUrl, configuredProxyUrl),
        ...(allowPublicProxies ? BUILT_IN_PROXY_BUILDERS.map(builder => builder(targetUrl)) : []),
    ].filter((url): url is string => Boolean(url));
    return [...new Set(candidates)];
}

function configuredProxyFetchUrl(targetUrl: string, configuredProxyUrl: string): string | null {
    const proxyUrl = configuredProxyUrl.trim();
    if (!proxyUrl) return null;
    try {
        const url = new URL(proxyUrl);
        url.searchParams.set('url', targetUrl);
        return url.href;
    } catch {
        return null;
    }
}

export async function fetchWithCorsFallbacks(
    targetUrl: string,
    configuredProxyUrl = '',
    options: ProxyFetchOptions = {},
): Promise<Response> {
    const urls = fetchUrlCandidates(targetUrl, configuredProxyUrl, options.allowPublicProxies !== false);
    if (!urls.length) throw new Error('Cross-origin request needs a configured proxy or userscript HTTP bridge.');
    let lastError: unknown;
    for (const url of urls) {
        try {
            return await fetchWithTimeout(url, options);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Cross-origin request failed.');
}

function fetchUrlCandidates(targetUrl: string, configuredProxyUrl: string, allowPublicProxies: boolean): string[] {
    return [...new Set([browserReadableUrl(targetUrl), ...proxyUrlCandidates(targetUrl, configuredProxyUrl, allowPublicProxies)].filter((url): url is string => Boolean(url)))];
}

function browserReadableUrl(url: string): string | null {
    if (!isHttpUrl(url)) return url;
    try {
        const target = new URL(url, location.href);
        return target.origin === location.origin ? target.href : null;
    } catch {
        return null;
    }
}

function isHttpUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

function fetchWithTimeout(url: string, options: ProxyFetchOptions): Promise<Response> {
    const { timeoutMs, allowPublicProxies: _allowPublicProxies, signal, ...init } = options;
    if (!timeoutMs) return fetch(url, { ...init, signal });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    return fetch(url, { ...init, signal: controller.signal }).finally(() => {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    });
}
