#!/usr/bin/env node
// Feed titles must never render blank when YouTube's grid recycler swaps a
// card's title in place (owner iPad report: "text disappears"). The
// non-destructive mirror hides the host text while it paints; if a recycler
// swap strips or rewrites the text after mirroring, the scanner must re-mirror
// or un-hide — a hidden host with no visible mirror IS the blank-title bug.
// Runs the real dist userscript on a synthetic feed served AS www.youtube.com
// via route interception (no live server: system Chrome's HSTS preload
// force-upgrades www.youtube.com to https, so a plain-HTTP loopback can never
// serve it on the CI channel).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchSmokeBrowser } from './lib/smoke-harness.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const distDir = join(appRoot, 'dist');
const readDist = rel => readFileSync(join(distDir, rel), 'utf8');

const TITLE_A = '伝説の陸上アスリートまとめ';
const TITLE_B = '鈴木優香の日本一周の旅';

const FEED_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>feed</title></head><body>
  <ytd-rich-grid-renderer>
    <ytd-rich-item-renderer><a id="link"><yt-formatted-string id="video-title">${TITLE_A}</yt-formatted-string></a></ytd-rich-item-renderer>
  </ytd-rich-grid-renderer>
</body></html>`;

const SETTINGS = {
    onboardingSeen: true, interfaceLanguage: 'ja', apiKey: '', jitenApiKey: '',
    localDictionariesEnabled: false, lookupOnClick: true, showFurigana: true, showPitchAccent: true,
};

const browser = await launchSmokeBrowser(undefined, 'chromium', { headless: true });
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
await context.addInitScript(`(() => {
    const settings = ${JSON.stringify(JSON.stringify(SETTINGS))};
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
})();`);
for (const rel of ['greasyfork/yomu-settings-surface.user.js', 'greasyfork/yomu-ui-copy.user.js', 'yomu.user.js']) {
    await context.addInitScript(readDist(rel));
}

const titleState = () => page.evaluate(() => {
    const host = document.getElementById('video-title');
    if (!host) return { missing: true };
    const mirror = host.querySelector('.jpdb-reader-text-mirror');
    const style = getComputedStyle(host);
    const mirrorVisible = mirror ? getComputedStyle(mirror).visibility !== 'hidden' : false;
    const hostHidden = style.visibility === 'hidden';
    const visibleText = mirrorVisible ? (mirror.textContent ?? '') : hostHidden ? '' : (host.childNodes[0]?.nodeValue ?? host.textContent ?? '');
    return { hostHidden, hasMirror: Boolean(mirror), mirrorVisible, visibleText: visibleText.trim().slice(0, 24) };
});

const failures = [];
async function assertReadable(label, expected) {
    let last = null;
    for (let tick = 0; tick < 25; tick += 1) {
        await page.waitForTimeout(400);
        last = await titleState();
        if (last.visibleText && last.visibleText.includes(expected.slice(0, 4))) return last;
    }
    failures.push(`${label}: title unreadable after 10s → ${JSON.stringify(last)}`);
    return last;
}

try {
    await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#video-title .jpdb-reader-text-mirror', { timeout: 25_000 }).catch(() => {});
    const initial = await titleState();
    console.log('T0', JSON.stringify(initial));
    if (!initial.hasMirror) failures.push('title never mirrored — smoke preconditions failed');

    // Recycler pattern 1: textContent replacement (wipes children incl. mirror).
    await page.evaluate(({ next }) => { document.getElementById('video-title').textContent = next; }, { next: TITLE_B });
    const afterSwap = await assertReadable('textContent swap', TITLE_B);
    console.log('T1_SWAP', JSON.stringify(afterSwap));

    // Recycler pattern 2: mutate the text NODE, keeping other children.
    await page.evaluate(({ next }) => {
        const host = document.getElementById('video-title');
        const textNode = Array.from(host.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.nodeValue = next; else host.prepend(document.createTextNode(next));
    }, { next: TITLE_A });
    const afterNodeSwap = await assertReadable('text-node swap', TITLE_A);
    console.log('T2_NODESWAP', JSON.stringify(afterNodeSwap));

    console.log(JSON.stringify({ failures }));
} finally {
    await browser.close();
}
if (failures.length) { console.error('TITLE_RECYCLER_SMOKE_FAIL'); process.exit(1); }
console.log('TITLE_RECYCLER_SMOKE_OK');
