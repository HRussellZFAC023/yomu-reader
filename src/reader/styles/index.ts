import { gmStorageGet, gmStorageSet } from '../app/storage';
import { getUserscriptHttpRequest } from '../userscript/index';

const READER_CSS_RESOURCE = 'yomuCss';
const READER_CSS_RESOURCE_URL = 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css';
const HOSTED_READER_CSS_PATH = '/yomu-reader/yomu.css';
const READER_CSS_CACHE_KEY = 'yomu:reader-css-cache:v1';

export const READER_CSS = resourceReaderCss();

const CRITICAL_STATES = [
    ['new', ['new', 'not-in-deck', 'in-deck']],
    ['learning', ['learning', 'young']],
    ['known', ['known', 'mature', 'mastered', 'never-forget', 'redundant']],
    ['due', ['due']],
    ['failed', ['failed']],
    ['ignored', ['suspended', 'blacklisted', 'locked']],
] as const;
const CRITICAL_PITCHES = ['heiban', 'atamadaka', 'nakadaka', 'odaka', 'kifuku'] as const;

function criticalSelector(states: readonly string[]): string {
    return states.map(state => `[data-card-state=${state}]`).join(',');
}

function criticalAnkiSelector(states: readonly string[]): string {
    return states.flatMap(state => [`.anki-${state}`, `[data-anki-state=${state}]`]).join(',');
}

function criticalPitchSelector(pattern: string): string {
    return `.jpdb-pitch-${pattern},[data-pitch-class=${pattern}]`;
}

function criticalVars(color: string): string {
    return `--ysc:var(--jpdb-reader-state-${color});--ysr:var(--jpdb-reader-state-${color}-readable);--hs:color-mix(in srgb,var(--ysc,transparent) 36%,var(--yb))`;
}

function criticalAnkiVars(color: string): string {
    return `--ac:var(--jpdb-reader-state-${color});--ar:var(--jpdb-reader-state-${color}-readable);--ah:color-mix(in srgb,var(--ac,transparent) 36%,var(--yb))`;
}

function criticalWordCss(): string {
    const states = CRITICAL_STATES
        .map(([color, group]) => `.jpdb-reader-word:is(${criticalSelector(group)}){${criticalVars(color)}}`)
        .join('');
    const ankiStates = CRITICAL_STATES
        .map(([color, group]) => `.jpdb-reader-word:is(${criticalAnkiSelector(group)}){${criticalAnkiVars(color)}}`)
        .join('');
    const pitches = CRITICAL_PITCHES
        .map(pattern => `.jpdb-reader-word:is(${criticalPitchSelector(pattern)}){--pc:var(--jpdb-reader-pitch-${pattern});--pr:var(--jpdb-reader-pitch-${pattern}-readable)}`)
        .join('');
    const pitchSelector = CRITICAL_PITCHES.map(criticalPitchSelector).join(',');
    return [
        states,
        ankiStates,
        '.jpdb-reader-word:is([data-card-source=jpdb],[data-card-source=jiten]){--h1:color-mix(in srgb,var(--ysc,transparent) 36%,var(--yb))}',
        pitches,
        `.jpdb-reader-word:is(${pitchSelector}){--c2:var(--pr,var(--pc,currentColor));--d2:var(--pc,transparent);--h2:color-mix(in srgb,var(--pc) 36%,var(--yb))}`,
        criticalChannelCss(),
    ].join('');
}

function criticalChannelCss(): string {
    return [
        '.jpdb-reader-word-highlight-status .jpdb-reader-word{--yh:var(--hs,transparent)}.jpdb-reader-word-highlight-jpdb .jpdb-reader-word{--yh:var(--h1,transparent)}.jpdb-reader-word-highlight-anki .jpdb-reader-word{--yh:var(--ah,transparent)}.jpdb-reader-word-highlight-pitch .jpdb-reader-word{--yh:var(--h2,transparent)}',
        ':is(.jpdb-reader-word-highlight-status,.jpdb-reader-word-highlight-jpdb,.jpdb-reader-word-highlight-anki,.jpdb-reader-word-highlight-pitch) .jpdb-reader-word{--yhp:var(--yh,transparent);background:linear-gradient(var(--yhp),var(--yhp)) center/var(--yz) 100% no-repeat!important}',
        '.jpdb-reader-word-underline-status .jpdb-reader-word{--yu:var(--ysc,transparent)}.jpdb-reader-word-underline-jpdb .jpdb-reader-word{--yu:var(--ysc,transparent)}.jpdb-reader-word-underline-anki .jpdb-reader-word{--yu:var(--ac,transparent)}.jpdb-reader-word-underline-pitch .jpdb-reader-word{--yu:var(--d2,transparent)}',
        '.jpdb-reader-word-text-status .jpdb-reader-word{--yt:var(--ysr,var(--ysc,currentColor))}.jpdb-reader-word-text-jpdb .jpdb-reader-word{--yt:var(--ysr,var(--ysc,currentColor))}.jpdb-reader-word-text-anki .jpdb-reader-word{--yt:var(--ar,var(--ac,currentColor))}.jpdb-reader-word-text-pitch .jpdb-reader-word{--yt:var(--c2,currentColor)}',
        ':is(.jpdb-reader-word-text-status,.jpdb-reader-word-text-jpdb,.jpdb-reader-word-text-anki,.jpdb-reader-word-text-pitch) .jpdb-reader-word{color:var(--yt,currentColor)!important;-webkit-text-fill-color:var(--yt,currentColor)}',
    ].join('');
}

export const CRITICAL_READER_CSS = `
[data-jpdb-reader-root],
[data-jpdb-reader-root] *,
[data-jpdb-reader-root]::before,
[data-jpdb-reader-root]::after,
[data-jpdb-reader-root] *::before,
[data-jpdb-reader-root] *::after {
  box-sizing: border-box;
}
.jpdb-reader-popover,
.jpdb-reader-settings,
.jpdb-reader-backdrop {
  pointer-events: auto !important;
}
.jpdb-reader-popover-body,
.jpdb-reader-word-pills,
.jpdb-reader-popover :is(a[href], button, input, select, textarea, summary, [role="button"], [data-action], .jpdb-reader-word, .jpdb-reader-action-pill),
.jpdb-reader-settings :is(a[href], button, input, select, textarea, summary, [role="button"], [data-action]) {
  pointer-events: auto !important;
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
.jpdb-reader-word{--yi:.08em;--yz:calc(100% - var(--yi) - var(--yi));--yo:.12em;--ys:solid;--yw:1px;--yb:var(--jpdb-reader-highlight-backdrop);position:relative;text-decoration:underline var(--ys) transparent var(--yw)!important;text-underline-offset:var(--yo)!important}
.jpdb-reader-word::after{content:"";position:absolute;z-index:1;inset-inline:var(--yi);inset-block-end:calc(-1 * var(--yo));border-block-end:var(--yw) var(--ys) var(--yu,transparent);pointer-events:none}
${criticalWordCss()}
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
            const css = await fetchReaderCssFallbackUrl(url, fetcher);
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

async function fetchReaderCssFallbackUrl(url: string, fetcher: typeof fetch): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        try {
            return await requestReaderCssViaUserscript(url, userscriptRequest);
        } catch {
            // Strict sites such as Discord may block page fetch; userscript HTTP
            // is preferred, but a broken/limited bridge should not prevent the
            // normal CORS-enabled fetch fallback from trying next.
        }
    }
    const response = await fetcher(url, { credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) return '';
    return await response.text();
}

function requestReaderCssViaUserscript(url: string, request: UserscriptHttpRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        const handleLoad = (response: UserscriptHttpResponse) => {
            if (response.status < 200 || response.status >= 300) {
                reject(new Error(`Reader CSS request failed (${response.status}).`));
                return;
            }
            resolve(String(response.responseText ?? response.response ?? ''));
        };
        const result = request({
            method: 'GET',
            url,
            responseType: 'text',
            timeout: 6000,
            anonymous: true,
            onload: handleLoad,
            onerror: error => reject(error instanceof Error ? error : new Error('Reader CSS request failed.')),
            ontimeout: () => reject(new Error('Reader CSS request timed out.')),
        });
        if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
            (result as Promise<UserscriptHttpResponse>).then(handleLoad, error => reject(error instanceof Error ? error : new Error('Reader CSS request failed.')));
        }
    });
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
