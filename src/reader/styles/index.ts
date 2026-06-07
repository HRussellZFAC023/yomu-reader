import { gmStorageGet, gmStorageSet } from '../app/storage';

const READER_CSS_RESOURCE = 'yomuCss';
const READER_CSS_RESOURCE_URL = 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css';
const HOSTED_READER_CSS_PATH = '/yomu-reader/yomu.css';
const READER_CSS_CACHE_KEY = 'yomu:reader-css-cache:v1';

export const READER_CSS = resourceReaderCss();

export async function loadReaderCssFallback(
    fetcher: typeof fetch | undefined = globalThis.fetch,
    href = safeLocationHref(),
): Promise<string> {
    const cached = await cachedReaderCss();
    if (cached) {
        if (typeof fetcher === 'function') void refreshReaderCssFallback(fetcher, href).catch(() => {});
        return cached;
    }
    if (typeof fetcher !== 'function') return '';
    return await refreshReaderCssFallback(fetcher, href);
}

async function refreshReaderCssFallback(fetcher: typeof fetch, href: string): Promise<string> {
    for (const url of readerCssFallbackUrls(href)) {
        try {
            const response = await fetcher(url, { credentials: 'omit', cache: 'force-cache' });
            if (!response.ok) continue;
            const css = await response.text();
            if (isFullReaderCss(css)) {
                await gmStorageSet(READER_CSS_CACHE_KEY, css);
                return css;
            }
        } catch {
            // The tiny critical CSS remains active if a page CSP, network, or offline cache blocks the full sheet.
        }
    }
    return '';
}

export function readerCssNeedsFallback(css = READER_CSS): boolean {
    return !isFullReaderCss(css);
}

export function readerCssFallbackUrls(href = safeLocationHref()): string[] {
    const hostedUrl = hostedReaderCssUrl(href);
    return hostedUrl ? [hostedUrl, READER_CSS_RESOURCE_URL] : [READER_CSS_RESOURCE_URL];
}

async function cachedReaderCss(): Promise<string> {
    const css = await gmStorageGet(READER_CSS_CACHE_KEY, '');
    return typeof css === 'string' && isFullReaderCss(css) ? css : '';
}

function resourceReaderCss(): string {
    try {
        return typeof GM_getResourceText === 'function'
            ? GM_getResourceText(READER_CSS_RESOURCE)
            : '';
    } catch {
        return '';
    }
}

function hostedReaderCssUrl(href: string): string | null {
    try {
        const url = new URL(href);
        if (!isHostedYomuPage(url)) return null;
        return new URL(HOSTED_READER_CSS_PATH, url.origin).href;
    } catch {
        return null;
    }
}

function isHostedYomuPage(url: URL): boolean {
    return url.pathname.startsWith('/yomu-reader/')
        && (
            url.hostname === 'hrussellzfac023.github.io'
            || url.hostname === '127.0.0.1'
            || url.hostname === 'localhost'
        );
}

function isFullReaderCss(css: string): boolean {
    return css.includes('.jpdb-reader-popover')
        && css.includes('.jpdb-reader-settings')
        && css.includes('.jpdb-reader-source-card')
        && css.includes('.jpdb-subtitle-player')
        && css.includes('.jpdb-ocr-layer');
}

function safeLocationHref(): string {
    try {
        return globalThis.location?.href ?? '';
    } catch {
        return '';
    }
}
