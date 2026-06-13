import { gmStorageGet, gmStorageSet } from '../app/storage';

const READER_CSS_RESOURCE = 'yomuCss';
const READER_CSS_RESOURCE_URL = 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css';
const HOSTED_READER_CSS_PATH = '/yomu-reader/yomu.css';
const READER_CSS_CACHE_KEY = 'yomu:reader-css-cache:v1';

export const READER_CSS = resourceReaderCss();

export const CRITICAL_READER_CSS = `
[data-jpdb-reader-root],
[data-jpdb-reader-root] *,
[data-jpdb-reader-root]::before,
[data-jpdb-reader-root]::after,
[data-jpdb-reader-root] *::before,
[data-jpdb-reader-root] *::after {
  box-sizing: border-box;
}
[data-jpdb-reader-root]:where(button),
[data-jpdb-reader-root] :where(button) {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  color: inherit;
  cursor: pointer;
  display: inline-block;
  font: inherit;
  height: auto;
  min-height: 0;
  width: auto;
  min-width: 0;
  max-width: none;
  line-height: normal;
  margin: 0;
  padding: 0;
  text-align: inherit;
  text-decoration: none;
  transform: none;
  transition: none;
  white-space: normal;
}
.jpdb-reader-popover .jpdb-reader-icon-btn,
.jpdb-reader-settings .jpdb-reader-icon-btn {
  position: relative;
  display: inline-grid;
  place-items: center;
  box-sizing: border-box;
  width: 36px !important;
  min-width: 36px !important;
  max-width: 36px !important;
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  flex: 0 0 auto;
  padding: 0 !important;
  border: 1px solid var(--jpdb-reader-border, rgba(37, 52, 73, 0.18));
  border-radius: 50%;
  background: var(--jpdb-reader-surface, #f4f7fa);
  color: var(--jpdb-reader-text, #17202a);
  cursor: pointer;
  overflow: hidden;
  transform: translateY(-0.01rem);
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-popover .jpdb-reader-icon-btn svg,
.jpdb-reader-settings .jpdb-reader-icon-btn svg {
  display: block;
  width: 20px !important;
  height: 20px !important;
  max-width: 20px !important;
  max-height: 20px !important;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.jpdb-reader-actions .jpdb-reader-mining-collapse {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 72px;
  height: 30px;
  min-width: 72px;
  min-height: 30px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--jpdb-reader-muted, #4f5968);
  cursor: pointer;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-actions .jpdb-reader-mining-collapse::before {
  content: "";
  position: relative;
  z-index: 1;
  display: block;
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: var(--jpdb-reader-faint, #687384);
}
`.trim();

export function initialReaderCss(css = READER_CSS): string {
    return readerCssNeedsFallback(css) ? CRITICAL_READER_CSS : css;
}

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
