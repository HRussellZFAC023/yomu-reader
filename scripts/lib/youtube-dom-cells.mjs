import * as smokeDependencyFiles from 'node:fs';
import * as smokeDependencyPaths from 'node:path';
import * as smokeDependencyBundler from 'esbuild';
import * as smokeDependencyBrowsers from 'playwright';
import * as smokeDependencyHarness from './smoke-harness.mjs';
import * as smokeDependencyUrls from 'node:url';
import * as smokeDependencySmokeHelpers from './smoke-test-helpers.mjs';
function finishCell(code) { if (code) throw new Error('Merged smoke cell failed with exit code ' + code); }

// Former youtube-continuation-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertYoutubeContinuation(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { readFileSync, mkdirSync, writeFileSync } = smokeDependencyFiles;
    const { resolve } = smokeDependencyPaths;
    const { build } = smokeDependencyBundler;
    const { chromium, webkit } = smokeDependencyBrowsers;
    const { assert, newTouchSmokePage } = smokeDependencyHarness;
// Deterministic native-IntersectionObserver fixture; no video streams or live
// YouTube requests. Exercise the production filter, not a reimplemented guard.

const root = resolve(_sourceDir, '..');
const output = resolve(root, 'artifacts/youtube-continuation');
mkdirSync(output, { recursive: true });
const bundle = await build({
    stdin: {
        contents: `
            import { YoutubeImmersionFilter } from './src/reader/subtitles/youtube';
            import { DEFAULT_SETTINGS } from './src/reader/settings';
            import { installTrustedReaderRootBoundary } from './src/reader/ui/trusted-interaction';
            const settings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en',
                youtubeImmersionEnabled: true, youtubeShowChannelRecommendations: false };
            const filter = new YoutubeImmersionFilter({ getSettings: () => settings });
            installTrustedReaderRootBoundary(document);
            filter.init();
            Object.assign(window, { stopFilter: () => filter.destroy() });
        `,
        loader: 'ts', resolveDir: root,
    }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent',
});
// Include every shipping Reader rule so root styles cannot silently change
// the resume button's position, visibility or native-observer registration.
const css = readFileSync(resolve(root, 'dist/yomu.css'), 'utf8');
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>
body { margin: 0; background: #111; color: #eee; font: 16px/1.4 system-ui; }
ytd-watch-flexy,ytd-watch-next-secondary-results-renderer,ytd-compact-video-renderer { display: block; }
#secondary { width: 360px; margin: 20px; }
ytd-compact-video-renderer { height: 65px; padding: 8px; box-sizing: border-box; }
ytd-continuation-item-renderer { display: block; height: 32px; }
tp-yt-paper-spinner { display: block; width: 24px; height: 24px; border: 2px solid #999; border-right-color: transparent; border-radius: 50%; }
${css}
</style></head><body><ytd-watch-flexy><div id="secondary">
<ytd-watch-next-secondary-results-renderer><div id="contents">
<ytd-compact-video-renderer><a id="video-title" href="/watch?v=japanese">日本語の会話</a></ytd-compact-video-renderer>
<ytd-compact-video-renderer><a id="video-title" href="/watch?v=english">English tech review</a></ytd-compact-video-renderer>
<ytd-continuation-item-renderer><tp-yt-paper-spinner active></tp-yt-paper-spinner></ytd-continuation-item-renderer>
</div></ytd-watch-next-secondary-results-renderer>
<ytd-comments><ytd-continuation-item-renderer id="comments-loader"></ytd-continuation-item-renderer></ytd-comments>
</div></ytd-watch-flexy></body></html>`;

const results = [];
for (const [name, browserType] of [[_hostEngine, _hostEngine === 'webkit' ? webkit : chromium]]) {
    const browser = _hostBrowser;

        const { page, errors } = await newTouchSmokePage(browser, { width:1024, height:768 });
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture }));
        await page.goto('https://www.youtube.com/watch?v=fixture');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(() => {
            let requests = 0;
            const contents = document.querySelector('#contents');
            const seen = new WeakSet();
            const pager = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting || seen.has(entry.target) || requests >= 20) continue;
                    seen.add(entry.target);
                    requests += 1;
                    // Retain the served marker, as the reported watch lists do.
                    setTimeout(() => {
                        for (let i = 0; i < 2; i += 1) {
                            const card = document.createElement('ytd-compact-video-renderer');
                            card.innerHTML = '<a id="video-title" href="/watch?v=english' + requests + i + '">English recommendation</a>';
                            contents.append(card);
                        }
                        // Hydration can mount the sentinel in a separate task
                        // after the cards; that mutation must reach the guard.
                        setTimeout(() => {
                            const marker = document.createElement('ytd-continuation-item-renderer');
                            marker.innerHTML = '<tp-yt-paper-spinner active></tp-yt-paper-spinner>';
                            contents.append(marker);
                            pager.observe(marker);
                        }, 0);
                    }, 5);
                }
            });
            pager.observe(contents.querySelector('ytd-continuation-item-renderer'));
            Object.assign(window, { nativeRequests: () => requests, stopPager: () => pager.disconnect() });
        });
        await page.locator('.jpdb-youtube-load-more').waitFor();
        await page.waitForTimeout(400);
        const read = () => page.evaluate(() => ({
            requests: window.nativeRequests(), scrollY,
            visibleSpinners: [...document.querySelectorAll('#contents tp-yt-paper-spinner')].filter(e => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
            }).length,
            buttons: document.querySelectorAll('.jpdb-youtube-load-more').length,
            japaneseVisible: document.querySelector('#video-title').getBoundingClientRect().height > 0,
            commentsClass: document.querySelector('#comments-loader').className,
        }));
        const initial = await read();
        assert(initial.requests === 2, 'Fast native paging was not bounded to two automatic batches', initial);
        assert(initial.visibleSpinners === 0 && initial.buttons === 1, 'Served loaders remained visible', initial);
        assert(initial.scrollY === 0 && initial.japaneseVisible && initial.commentsClass === '', 'Filtering altered native content/scroll', initial);
        await page.locator('.jpdb-youtube-load-more').tap();
        await page.waitForFunction(() => window.nativeRequests() >= 4);
        await page.waitForTimeout(400);
        const resumed = await read();
        assert(resumed.requests === 4 && resumed.buttons === 1 && resumed.visibleSpinners === 0, 'Trusted touch did not resume one bounded native batch', resumed);
        await page.screenshot({ path: resolve(output, name + '-fixture.png') });
        await page.evaluate(() => { window.stopPager(); window.stopFilter(); });
        const restored = await page.evaluate(() => ({
            parked: document.querySelectorAll('.jpdb-youtube-continuation-paused,.jpdb-youtube-continuation-stale,.jpdb-youtube-load-more').length,
            nativeMarkers: document.querySelectorAll('#contents ytd-continuation-item-renderer').length,
        }));
        assert(restored.parked === 0 && restored.nativeMarkers === 5, 'Teardown failed to restore native loaders', restored);
        assert(errors.length === 0, 'Browser errors occurred', { errors });
        const stalled = await browser.newPage({ viewport: { width: 1024, height: 768 } });
        await stalled.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture }));
        await stalled.goto('https://www.youtube.com/watch?v=stalled');
        await stalled.addScriptTag({ content: bundle.outputFiles[0].text });
        await stalled.locator('.jpdb-youtube-load-more').waitFor({ timeout: 11000 });
        const deadline = await stalled.evaluate(() => ({
            buttons: document.querySelectorAll('.jpdb-youtube-load-more').length,
            paused: document.querySelectorAll('#contents .jpdb-youtube-continuation-paused').length,
            nativeCards: document.querySelectorAll('ytd-compact-video-renderer').length,
            scrollY,
        }));
        assert(deadline.buttons === 1 && deadline.paused === 1 && deadline.nativeCards === 2 && deadline.scrollY === 0,
            'A never-finishing visible loader did not settle without altering native content', deadline);
        await stalled.evaluate(() => window.stopFilter());
        results.push({ browser: name, initial, resumed, restored, deadline });

}
writeFileSync(resolve(output, 'evidence.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former youtube-title-recycler-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertYoutubeTitleRecycler(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    if (_hostEngine !== 'chromium') return;
const _sourceDir = new URL('..', import.meta.url).pathname;
    const { readFileSync } = smokeDependencyFiles;
    const { join, resolve } = smokeDependencyPaths;


    const { addUserscriptGraphInitScripts } = smokeDependencySmokeHelpers;
// Feed titles must never render blank when YouTube's grid recycler swaps a
// card's title in place (owner iPad report: "text disappears"). The
// source-preserving mirror now keeps native glyphs authoritative and may mount
// in a body-level document portal. If a recycler swap strips or rewrites the
// text after mirroring, the native title must stay readable immediately and
// the in-host or portal annotation must converge to the replacement text.
// Runs the real dist userscript on a synthetic feed served AS www.youtube.com
// via route interception (no live server: system Chrome's HSTS preload
// force-upgrades www.youtube.com to https, so a plain-HTTP loopback can never
// serve it on the CI channel).

const scriptDir = _sourceDir;
const appRoot = resolve(scriptDir, '..');
const distDir = join(appRoot, 'dist');
const SCRIPT_PATH = join(distDir, 'yomu.user.js');
const readDist = rel => readFileSync(join(distDir, rel), 'utf8');

const TITLE_A = '伝説の陸上アスリートまとめ';
const TITLE_B = '鈴木優香の日本一周の旅';

const FEED_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>feed</title></head><body>
  <ytd-rich-grid-renderer>
    <ytd-rich-item-renderer><a id="link"><yt-formatted-string id="video-title">${TITLE_A}</yt-formatted-string></a></ytd-rich-item-renderer>
  </ytd-rich-grid-renderer>
</body></html>`;

const SETTINGS = {
    onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: 'ja', apiKey: '', jitenApiKey: '',
    localDictionariesEnabled: false, lookupOnClick: true, showFurigana: true, showPitchAccent: true,
};

const browser = _hostBrowser;
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', bypassCSP: true });
await context.route('**/*', route => {
    // Mirror the catch-all loopback server this replaced: any youtube.com
    // document navigation (the userscript may re-navigate for language) gets
    // the fixture; subresources get an empty 404.
    const hostname = new URL(route.request().url()).hostname;
    if (hostname.endsWith('youtube.com') && route.request().resourceType() === 'document') {
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FEED_HTML });
    }
    return route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
});
const page = await context.newPage();
await page.exposeFunction('__yomuFeedReq', request => {
    const url = String(request?.url ?? '');
    if (url.includes('/vocabulary/parse')) {
        const text = decodeURIComponent(url.split('text=')[1]?.split('&')[0] ?? '');
        const words = [];
        for (const term of ['伝説', '陸上', '鈴木', '優香', '日本']) {
            const index = text.indexOf(term);
            if (index >= 0) words.push({ wordId: 9000 + index, readingIndex: 0, originalText: term });
        }
        return { status: 200, responseText: JSON.stringify(words), contentType: 'application/json' };
    }
    return { status: 404, responseText: '', contentType: 'text/plain' };
});
const prefixContent = `(() => {
    const settings = ${JSON.stringify(SETTINGS)};
    const store = {};
    window.GM_getValue = (key, fallback) => key === 'jpdb-popup-reader-settings' ? settings : (key in store ? store[key] : fallback);
    window.GM_setValue = (key, value) => { store[key] = value; };
    window.GM_deleteValue = key => { delete store[key]; };
    window.GM_listValues = () => Object.keys(store);
    window.GM_addValueChangeListener = () => 0;
    window.GM_registerMenuCommand = () => 0;
    window.GM_getResourceText = key => /css/i.test(String(key)) ? ${JSON.stringify(readDist('yomu.css'))} : '';
    window.GM_info = { script: { version: 'smoke' } };
    window.GM_xmlhttpRequest = details => {
        window.__yomuFeedReq({ url: details.url }).then(result => {
            details.onload?.({ status: result.status, responseText: result.responseText, response: result.responseText, finalUrl: details.url });
        }).catch(error => details.onerror?.(error));
        return { abort() {} };
    };
})();`;
await addUserscriptGraphInitScripts(context, SCRIPT_PATH, { prefixContent });

const titleState = () => page.evaluate(() => {
    const host = document.getElementById('video-title');
    if (!host) return { missing: true };
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const nativeClone = host.cloneNode(true);
    nativeClone.querySelectorAll('.jpdb-reader-text-mirror').forEach(node => node.remove());
    const nativeText = normalize(nativeClone.textContent ?? '');
    const inHostMirror = host.querySelector('.jpdb-reader-text-mirror');
    const portalMirrors = Array.from(document.querySelectorAll(
        '.jpdb-reader-document-annotation-portal.jpdb-reader-text-mirror',
    ));
    const mirror = inHostMirror
        ?? portalMirrors.find(node => normalize(node.getAttribute('data-source-text') ?? '') === nativeText)
        ?? (portalMirrors.length === 1 ? portalMirrors[0] : null);
    const style = getComputedStyle(host);
    const mirrorVisible = mirror ? getComputedStyle(mirror).visibility !== 'hidden' : false;
    const hostHidden = style.visibility === 'hidden';
    const mirrorSourceText = normalize(mirror?.getAttribute('data-source-text') ?? '');
    const visibleText = hostHidden ? (mirrorVisible ? normalize(mirror?.textContent ?? '') : '') : nativeText;
    return {
        hostHidden,
        hasMirror: Boolean(mirror),
        mirrorVisible,
        mirrorLane: inHostMirror ? 'in-host' : mirror ? 'document-portal' : 'none',
        mirrorSourceText: mirrorSourceText.slice(0, 24),
        annotationCurrent: Boolean(mirror) && mirrorSourceText === nativeText,
        visibleText: visibleText.slice(0, 24),
    };
});

const failures = [];
async function assertReadable(label, expected) {
    let last = null;
    for (let tick = 0; tick < 25; tick += 1) {
        await page.waitForTimeout(400);
        last = await titleState();
        if (last.visibleText
            && last.visibleText.includes(expected.slice(0, 4))
            && last.hasMirror
            && last.annotationCurrent) return last;
    }
    failures.push(`${label}: title unreadable after 10s → ${JSON.stringify(last)}`);
    return last;
}

    await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => Boolean(
        document.querySelector('#video-title .jpdb-reader-text-mirror')
        || document.querySelector('.jpdb-reader-document-annotation-portal.jpdb-reader-text-mirror'),
    ), { timeout: 25_000 }).catch(() => {});
    const initial = await titleState();
    console.log('T0', JSON.stringify(initial));
    if (!initial.hasMirror) failures.push('title never mirrored — smoke preconditions failed');
    if (initial.hostHidden) failures.push('initial title host was hidden by its additive annotation lane');
    if (!initial.annotationCurrent) failures.push(`initial annotation was stale → ${JSON.stringify(initial)}`);

    // Recycler pattern 1: textContent replacement (wipes children incl. mirror).
    await page.evaluate(({ next }) => { document.getElementById('video-title').textContent = next; }, { next: TITLE_B });
    const swapImmediate = await titleState();
    if (swapImmediate.hostHidden || !swapImmediate.visibleText.includes(TITLE_B.slice(0, 4))) {
        failures.push(`textContent swap blanked native title → ${JSON.stringify(swapImmediate)}`);
    }
    const afterSwap = await assertReadable('textContent swap', TITLE_B);
    console.log('T1_SWAP', JSON.stringify(afterSwap));

    // Recycler pattern 2: mutate the text NODE, keeping other children.
    await page.evaluate(({ next }) => {
        const host = document.getElementById('video-title');
        const textNode = Array.from(host.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.nodeValue = next; else host.prepend(document.createTextNode(next));
    }, { next: TITLE_A });
    const nodeSwapImmediate = await titleState();
    if (nodeSwapImmediate.hostHidden || !nodeSwapImmediate.visibleText.includes(TITLE_A.slice(0, 4))) {
        failures.push(`text-node swap blanked native title → ${JSON.stringify(nodeSwapImmediate)}`);
    }
    const afterNodeSwap = await assertReadable('text-node swap', TITLE_A);
    console.log('T2_NODESWAP', JSON.stringify(afterNodeSwap));

    console.log(JSON.stringify({ failures }));

if (failures.length) { console.error('TITLE_RECYCLER_SMOKE_FAIL'); finishCell(1); }
console.log('TITLE_RECYCLER_SMOKE_OK');

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}
