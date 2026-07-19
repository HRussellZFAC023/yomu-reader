import { gmStorageGet, gmStorageSet } from '../app/storage';
import { getUserscriptHttpRequest } from '../userscript/index';

const READER_CSS_RESOURCE = 'yomuCss';
// Cache-busted per release: raw.githubusercontent and intermediary caches key
// on the full URL, so without ?v= a stale sheet can outlive an update.
// (Release tags stopped at v1.6.105 while dist/ is committed to main per
// release, so main + version query is the deterministic-enough pin available.)
const READER_CSS_RESOURCE_URL = `https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=${__YOMU_VERSION__}`;
const READER_CSS_CACHE_KEY = `yomu:reader-css-cache:v2:${__YOMU_VERSION__}`;

export const READER_CSS = resourceReaderCss();

function criticalWordCss(): string {
    const pitchClasses = ['heiban', 'atamadaka', 'nakadaka', 'odaka'];
    const pitchSelector = (pattern: string) => `.jpdb-pitch-${pattern},[data-pitch-class=${pattern}]`;
    const pitches = pitchClasses
        .map(pattern => `.jpdb-reader-word:is(${pitchSelector(pattern)}){--pc:var(--jpdb-reader-pitch-${pattern});--pr:var(--jpdb-reader-pitch-${pattern}-readable)}`)
        .join('');
    const unknownPitch = '.jpdb-reader-word:is(.jpdb-pitch-unknown,[data-pitch-class=unknown],.jpdb-pitch-particle,[data-pitch-class=particle]){--pc:var(--jpdb-reader-pitch-unknown);--pr:var(--jpdb-reader-pitch-unknown-readable);--c2:var(--pr,var(--pc,currentColor));--d2:#0000}';
    const allPitches = pitchClasses.map(pitchSelector).join(',');
    return [
        pitches,
        unknownPitch,
        `.jpdb-reader-word:is(${allPitches}){--c2:var(--pr,var(--pc,currentColor));--d2:var(--pc,#0000)}`,
        '.jpdb-reader-word-underline-pitch .jpdb-reader-word{--yu:var(--d2,#0000)}.jpdb-reader-word-text-pitch .jpdb-reader-word{--yt:var(--c2,currentColor);color:var(--yt,currentColor)!important;-webkit-text-fill-color:var(--yt,currentColor)}',
    ].join('');
}

export const CRITICAL_READER_CSS = `
[data-jpdb-reader-root],[data-jpdb-reader-root] *,[data-jpdb-reader-root]::before,[data-jpdb-reader-root]::after,[data-jpdb-reader-root] *::before,[data-jpdb-reader-root] *::after{box-sizing:border-box}
.jpdb-reader-popover,.jpdb-reader-settings,.jpdb-reader-backdrop,.jpdb-reader-popover-body,.jpdb-reader-word-pills,.jpdb-reader-popover :is(a[href],button,input,select,textarea,summary,[role=button],[data-action],.jpdb-reader-word,.jpdb-reader-action-pill),.jpdb-reader-settings :is(a[href],button,input,select,textarea,summary,[role=button],[data-action]){pointer-events:auto!important}
[data-jpdb-reader-root]:where(button),[data-jpdb-reader-root] :where(button){all:unset;box-sizing:border-box;color:inherit;cursor:pointer;font:inherit}
:is(.jpdb-reader-popover,.jpdb-reader-settings) .jpdb-reader-icon-btn{position:relative;display:inline-grid;place-items:center;box-sizing:border-box;width:36px!important;min-width:36px!important;max-width:36px!important;height:36px!important;min-height:36px!important;max-height:36px!important;flex:0 0 auto;border:1px solid var(--jpdb-reader-border,rgba(37,52,73,.18));border-radius:50%;background:var(--jpdb-reader-surface,#f4f7fa);color:var(--jpdb-reader-text,#17202a);overflow:hidden;-webkit-tap-highlight-color:#0000}
:is(.jpdb-reader-popover,.jpdb-reader-settings) .jpdb-reader-icon-btn svg{display:block;width:20px!important;height:20px!important;max-width:20px!important;max-height:20px!important;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.jpdb-reader-actions .jpdb-reader-mining-collapse{position:relative;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:72px;height:30px;min-width:72px;min-height:30px;flex:none;border:0;border-radius:999px;background:#0000;color:var(--jpdb-reader-muted,#4f5968);cursor:pointer;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:#0000}
.jpdb-reader-actions .jpdb-reader-mining-collapse::before{content:"";position:relative;z-index:1;display:block;width:42px;height:5px;border-radius:999px;background:var(--jpdb-reader-faint,#687384)}
[data-jpdb-reader-root] :where(section,article,aside,main,header,footer,nav,pre,p,ul,ol,li,figure,blockquote,form,table){margin:revert;padding:revert}
a[href] .jpdb-reader-word{-webkit-touch-callout:none}.jpdb-reader-word{--yi:.08em;--yz:calc(100% - var(--yi) - var(--yi));--yo:.12em;--ys:solid;--yw:1px;--yb:var(--jpdb-reader-highlight-backdrop);position:relative;text-decoration:underline var(--ys) #0000 var(--yw)!important;text-underline-offset:var(--yo)!important}.jpdb-reader-word.jpdb-reader-passive-word{--yt:currentColor}:is(button,[role=button],[role=tab],summary,label,.jpdb-reader-control-text-mirror,[data-jpdb-reader-passive-chrome=true]) .jpdb-reader-word.jpdb-reader-passive-word{--yh:#0000}
.jpdb-reader-word::after{content:"";position:absolute;z-index:1;inset-inline:var(--yi);inset-block-end:0;border-block-end:var(--yw) var(--ys) var(--yu,#0000);pointer-events:none}
${criticalWordCss()}
.jpdb-reader-word-underline-pitch .jpdb-reader-text-mirror .jpdb-reader-word{text-decoration-color:var(--yu,#0000)!important}
.jpdb-reader-word-underline-pitch .jpdb-reader-text-mirror .jpdb-reader-word::after{content:none!important}
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

export function shouldLoadReaderCssFallback(hasLinkedReaderCss: boolean, css = READER_CSS): boolean {
    return !hasLinkedReaderCss && readerCssNeedsFallback(css);
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
        if (typeof GM_getResourceText !== 'function') return '';
        // Tampermonkey/Violentmonkey return the resource text synchronously as a
        // string. The browser-extension GM shim (UserScript Compiler) has no
        // bundled resource and returns a Promise that resolves over XHR. A
        // non-string here must degrade to '' so the critical inline CSS is used
        // immediately and loadReaderCssFallback() fetches the full sheet later —
        // otherwise isFullReaderCss(css) would call css.includes on a Promise and
        // throw during ReaderApp.init(), aborting the whole extension boot.
        const resource = GM_getResourceText(READER_CSS_RESOURCE);
        return typeof resource === 'string' ? resource : '';
    } catch {
        return '';
    }
}

function hostedReaderCssUrl(href: string): string | null {
    try {
        const url = new URL(href);
        if (!isHostedYomuPage(url)) return null;
        const path = url.hostname === 'hrussellzfac023.github.io' ? '/yomu-reader/yomu.css' : '/yomu.css';
        // Same per-release cache-bust as the @resource URL: yomureader.com sits
        // behind a CDN cache (max-age 14400), so an unversioned URL can serve
        // the previous release's sheet for hours after a deploy.
        return `${new URL(path, url.origin).href}?v=${__YOMU_VERSION__}`;
    } catch {
        return null;
    }
}

function isHostedYomuPage(url: URL): boolean {
    return (
        url.hostname === 'yomureader.com'
        || (
            url.pathname.startsWith('/yomu-reader/')
            && (
                url.hostname === 'hrussellzfac023.github.io'
                || url.hostname === '127.0.0.1'
                || url.hostname === 'localhost'
            )
        )
    );
}

function isFullReaderCss(css: string): boolean {
    if (typeof css !== 'string') return false;
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
