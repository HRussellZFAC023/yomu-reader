// Live repro: does the shipped userscript still truncate m.youtube Shorts CTA
// labels and float detached furigana on the watch page? Real site, real
// bundle, mobile emulation, keyless JA settings.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { dismissConsent, installUserscriptFixtureBridge, mockJpdbApiRequest, YOMU_SETTINGS_KEY } from '../lib/smoke-harness.mjs';

const USERSCRIPT = readFileSync(new URL('../../dist/yomu.user.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../../dist/yomu.css', import.meta.url), 'utf8');

const SETTINGS = {
    interfaceLanguage: 'ja',
    showFurigana: true,
    furiganaMode: 'all',
    apiKey: 'live-repro-jpdb-key',
    parserProvider: 'jpdb',
};

// Vocabulary covering the chrome labels under test, WITH readings, so the
// mirror channel renders detached furigana exactly as it does for a keyed
// user (surface, spelling, reading, gloss, pos, freq, state, pitch).
const VOCAB = [
    ['チャンネル', 'チャンネル', 'チャンネル', 'channel', 'n', 500, 'known', ''],
    ['登録', '登録', 'とうろく', 'registration', 'n', 800, 'new', 'heiban'],
    ['共有', '共有', 'きょうゆう', 'sharing', 'n', 900, 'new', 'heiban'],
    ['高く', '高い', 'たかく', 'high', 'adj', 300, 'known', ''],
    ['評価', '評価', 'ひょうか', 'rating', 'n', 700, 'new', 'heiban'],
    ['視聴', '視聴', 'しちょう', 'viewing', 'n', 1000, 'new', 'heiban'],
    ['回', '回', 'かい', 'times', 'ctr', 200, 'known', ''],
    ['分前', '分前', 'ふんまえ', 'minutes ago', 'n', 400, 'known', ''],
    ['時間', '時間', 'じかん', 'hour', 'n', 100, 'known', ''],
    ['前', '前', 'まえ', 'before', 'n', 150, 'known', ''],
    ['保存', '保存', 'ほぞん', 'save', 'n', 600, 'new', 'heiban'],
    ['件', '件', 'けん', 'items', 'ctr', 250, 'known', ''],
];
const requestLog = [];

// Real-network passthrough for GM_xmlhttpRequest: node-side fetch has no CORS,
// so keyless jiten/proxy lookups behave as they do under a real userscript
// manager.
async function passthroughRequest(request) {
    const mocked = mockJpdbApiRequest(request, requestLog, VOCAB);
    if (mocked) return mocked;
    try {
        const response = await fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: request.body ?? undefined,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
            status: response.status,
            responseText: buffer.toString('utf8'),
            bytes: [...buffer],
            contentType: response.headers.get('content-type') || '',
        };
    } catch (error) {
        return { status: 0, responseText: '', bytes: [], contentType: '', error: String(error) };
    }
}

async function preparePage(context) {
    const page = await context.newPage();
    await installUserscriptFixtureBridge(page, {
        requestBridgeName: 'yomuLiveBridge',
        requestHandler: passthroughRequest,
        settings: SETTINGS,
        css: CSS,
    });
    await page.addInitScript(USERSCRIPT);
    return page;
}

function measureChrome() {
    const out = { labels: [], floatingFuri: [], stamps: 0, mirrors: 0 };
    out.stamps = document.querySelectorAll('[data-yomu-clip-constrained]').length;
    out.mirrors = document.querySelectorAll('.jpdb-reader-text-mirror').length;
    const allFuri = [...document.querySelectorAll('.jpdb-reader-detached-furi')];
    out.furi = {
        total: allFuri.length,
        hidden: allFuri.filter(f => getComputedStyle(f).display === 'none').length,
        withText: allFuri.filter(f => (f.textContent ?? '').trim().length > 0).length,
        rt: document.querySelectorAll('rt.jpdb-reader-furi').length,
        sample: allFuri.slice(0, 5).map(f => ({ t: f.textContent?.slice(0, 6), display: getComputedStyle(f).display, inStamp: Boolean(f.closest('[data-yomu-clip-constrained]')) })),
    };
    const seen = new Set();
    for (const el of document.querySelectorAll('span, div, yt-formatted-string, button')) {
        const text = (el.childElementCount <= 3 ? el.textContent : '')?.trim() ?? '';
        if (!/^(共有|高く評価|チャンネル登録|コメント|リミックス|保存)/.test(text) || text.length > 12) continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || seen.has(el)) continue;
        seen.add(el);
        const style = getComputedStyle(el);
        out.labels.push({
            text: text.slice(0, 10),
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth,
            overflowing: el.scrollWidth > el.clientWidth + 1,
            ellipsis: style.textOverflow.includes('ellipsis'),
            overflowX: style.overflowX,
            stamp: el.closest('[data-yomu-clip-constrained]')?.getAttribute('data-yomu-clip-constrained') ?? null,
            words: el.querySelectorAll('.jpdb-reader-word').length,
            visibleFuri: [...el.querySelectorAll('.jpdb-reader-detached-furi')].filter(f => getComputedStyle(f).display !== 'none').length,
            totalFuri: el.querySelectorAll('.jpdb-reader-detached-furi').length,
            rtFuri: el.querySelectorAll('rt').length,
            inMirror: Boolean(el.closest('.jpdb-reader-text-mirror') || el.querySelector('.jpdb-reader-text-mirror')),
            mirrorHtml: (el.querySelector('.jpdb-reader-text-mirror') ?? el.closest('.jpdb-reader-text-mirror'))?.outerHTML?.slice(0, 600) ?? null,
        });
    }
    for (const furi of document.querySelectorAll('.jpdb-reader-detached-furi')) {
        if (getComputedStyle(furi).display === 'none') continue;
        const word = furi.closest('.jpdb-reader-word') ?? furi.parentElement;
        if (!word) continue;
        const fr = furi.getBoundingClientRect();
        const wr = word.getBoundingClientRect();
        const dx = Math.abs((fr.left + fr.width / 2) - (wr.left + wr.width / 2));
        const dy = wr.top - fr.bottom;
        if (dx > 24 || dy < -6 || dy > 24) {
            out.floatingFuri.push({ reading: furi.textContent?.slice(0, 8), dx: Math.round(dx), dy: Math.round(dy), word: word.textContent?.slice(0, 8) });
        }
    }
    return out;
}

const engineName = process.env.ENGINE ?? 'chromium';
const { chromium: _c, webkit } = await import('playwright');
const browser = await (engineName === 'webkit' ? webkit : chromium).launch();
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    locale: 'ja-JP',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});

for (const [label, url] of [
    ['watch', 'https://m.youtube.com/watch?v=jNQXAC9IVRw'],
    ['shorts', process.env.SHORT_URL ?? 'https://m.youtube.com/shorts'],
]) {
    const page = await preparePage(context);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await dismissConsent(page).catch(() => {});
        await page.waitForTimeout(Number(process.env.WAIT_MS ?? 30000));
        const result = await page.evaluate(measureChrome);
        console.log(`== ${label}`, JSON.stringify(result, null, 1));
        console.log(`== ${label} requests`, JSON.stringify(requestLog.slice(-25)));
        requestLog.length = 0;
    } catch (error) {
        console.log(`== ${label} ERROR`, String(error).slice(0, 200));
    }
    await page.close();
}
await browser.close();
