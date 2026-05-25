const READER_CSS_RESOURCE = 'yomuCss';
const READER_CSS_RESOURCE_URL = 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css';
const HOSTED_READER_CSS_PATH = '/yomu-reader/yomu.css';

export const READER_CSS = resourceReaderCss();

export async function loadReaderCssFallback(
    fetcher: typeof fetch | undefined = globalThis.fetch,
    href = safeLocationHref(),
): Promise<string> {
    if (typeof fetcher !== 'function') return '';
    for (const url of readerCssFallbackUrls(href)) {
        try {
            const response = await fetcher(url, { credentials: 'omit', cache: 'force-cache' });
            if (!response.ok) continue;
            const css = await response.text();
            if (isFullReaderCss(css)) return css;
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
    const urls = new Set<string>();
    const hostedUrl = hostedReaderCssUrl(href);
    if (hostedUrl) urls.add(hostedUrl);
    urls.add(READER_CSS_RESOURCE_URL);
    return [...urls];
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
