// Capture REAL product surfaces with the current build, on a cloned signed-in
// Chrome profile. Automated companion to capture-real-screenshots.mjs, which is
// operator-driven; the launch + GM-shim + companions-before-core injection is
// the recipe from scripts/yt-live-harness.mjs.
//
//   node scripts/manual/capture-product-surfaces.mjs <youtube|video-player|pdf-reader|study>
//
// Prerequisites: `npm run build` (the injected dist) and, for the hosted
// surfaces, `npm run docs:build` served on http://127.0.0.1:5199.
//
// Env: YT_PROFILE (required — a CLONE of a signed-in Chrome profile; delete its
// Singleton* files first), YT_DIST (defaults <root>/dist), SHOT_OUT (output dir),
// CAP_HEADLESS=1, CAP_SEEK / CAP_SEEK_V (seconds to hold), CAP_PDF (PDF to open),
// CAP_PDF_ZOOM=fit|out, CAP_STUDY_STEP / CAP_STUDY_TYPE / CAP_STUDY_ANSWER,
// CAP_UI_JA=1 (Japanese hosted UI).
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const APP = path.resolve(import.meta.dirname, '..', '..');
const { chromium } = require(path.join(APP, 'node_modules/playwright/index.js'));
const { loadLocalEnv } = await import(path.join(APP, 'scripts/lib/qa-env.mjs'));
loadLocalEnv(APP);

const PROFILE = process.env.YT_PROFILE?.trim();
if (!PROFILE) throw new Error('Set YT_PROFILE');
const DIST = process.env.YT_DIST || path.join(APP, 'dist');
const OUT = process.env.SHOT_OUT || path.join(APP, 'qa-artifacts/product-surfaces');
mkdirSync(OUT, { recursive: true });
const headless = process.env.CAP_HEADLESS === '1';
const shotName = process.argv[2] || 'youtube';

function readDist(rel) {
    const p = path.join(DIST, rel);
    if (!existsSync(p)) throw new Error('missing dist file: ' + p);
    return readFileSync(p, 'utf8');
}
const CORE_SCRIPT = readDist('yomu.user.js');
const COMPANION_SCRIPTS = [...CORE_SCRIPT.matchAll(
    /^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/gmu,
)].map(m => `greasyfork/${m[1].replace(/\.[0-9a-f]{12}(?=\.user\.js$)/u, '')}`);
const SCRIPTS = [
    ...COMPANION_SCRIPTS.map(rel => ({ rel, code: readDist(rel) })),
    { rel: 'yomu.user.js', code: CORE_SCRIPT },
];
const READER_CSS = readDist('yomu.css');

const jitenKey = (process.env.YOMU_JITEN_API_KEY || '').trim();
const jpdbKey = (process.env.YOMU_JPDB_API_KEY || process.env.JPDB_API_KEY || '').trim();

const SETTINGS = {
    onboardingSeen: true,
    apiKey: jpdbKey,
    jitenApiKey: jitenKey,
    parserProvider: jitenKey ? 'jiten' : 'auto',
    jpdbMiningEnabled: true,
    interfaceLanguage: 'en',
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
};

const SHOTS = {
    // Real, signed-in YouTube. q89xqLs-eNY carries a MANUAL ja caption track
    // (verified via ytInitialPlayerResponse.captions), so the subtitle rail has
    // real lines rather than ASR guesses.
    youtube: {
        url: 'https://www.youtube.com/watch?v=q89xqLs-eNY&hl=en&persist_hl=1',
        width: 1280, height: 900,
    },
    'youtube-wide': {
        url: 'https://www.youtube.com/watch?v=q89xqLs-eNY&hl=en&persist_hl=1',
        width: 1600, height: 1000,
    },
    'video-player': {
        url: 'http://127.0.0.1:5199/video-player/',
        width: 1440, height: 900,
    },
    'pdf-reader': {
        url: 'http://127.0.0.1:5199/pdf-reader/',
        width: 1440, height: 900,
    },
    study: {
        url: 'http://127.0.0.1:5199/study/',
        width: 1440, height: 900,
    },
};
const shot = SHOTS[shotName];
if (!shot) throw new Error('unknown shot ' + shotName);

const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless,
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    locale: 'en-GB',
    bypassCSP: true,
    args: ['--disable-blink-features=AutomationControlled', '--autoplay-policy=no-user-gesture-required'],
});

// Ask YouTube for English chrome in this cloned profile. The account's own
// language would otherwise win and the shot would be all-Japanese UI, which
// reads as noise on an English docs page. Cookie only — no account setting.
if (process.env.CAP_YT_EN === '1') {
    await ctx.addCookies([{
        name: 'PREF', value: 'hl=en&gl=GB&tz=Europe.London&f6=40000000',
        domain: '.youtube.com', path: '/', secure: true, sameSite: 'None',
        expires: Math.floor(Date.now() / 1000) + 86400,
    }]);
}

await ctx.exposeFunction('__yomuReq', async (opts) => {
    try {
        const res = await ctx.request.fetch(opts.url, {
            method: opts.method || 'GET',
            headers: opts.headers || {},
            data: opts.data,
            timeout: 20000,
        });
        const body = await res.text();
        const headers = res.headers();
        return {
            status: res.status(), statusText: '', responseText: body,
            responseHeaders: Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n'),
        };
    } catch (e) { return { status: 0, error: String(e) }; }
});

const initScript = `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ 'jpdb-popup-reader-settings': SETTINGS })}));
  const listeners = new Map();
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = (k) => store.delete(k);
  window.GM_listValues = () => Array.from(store.keys());
  window.GM_addValueChangeListener = (k, f) => { const a=listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = (u) => window.open(u, '_blank');
  const yomuCss = ${JSON.stringify(READER_CSS)};
  window.GM_getResourceText = name => name === 'yomuCss' ? yomuCss : '';
  window.GM_info = { script: { version: '1.2.0', name: 'yomu' }, scriptHandler: 'HarnessGM' };
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: u=>window.open(u,'_blank'),
    xmlHttpRequest: (o)=>window.GM_xmlhttpRequest(o),
  };
  window.GM_xmlhttpRequest = (o) => {
    Promise.resolve(window.__yomuReq({ method:o.method, url:o.url, headers:o.headers, data:o.data }))
      .then(r => { if (r && r.status && o.onload) o.onload({ status:r.status, statusText:r.statusText||'', responseText:r.responseText||'', response:r.responseText||'', responseHeaders:r.responseHeaders||'', finalUrl:o.url }); else if (o.onerror) o.onerror(r||{status:0}); })
      .catch(e => { if (o.onerror) o.onerror({ status:0, error:String(e) }); });
    return { abort(){} };
  };
})();
`;
await ctx.addInitScript({ content: initScript });
// The hosted shells (Study, PDF reader, video player, docs) read their settings
// from localStorage on their own origin, not from GM storage.
await ctx.addInitScript({
    content: `try { localStorage.setItem('jpdb-popup-reader-settings', ${JSON.stringify(JSON.stringify({ ...SETTINGS, interfaceLanguage: process.env.CAP_UI_JA === '1' ? 'ja' : 'en' }))}); } catch {}`,
});
for (const s of SCRIPTS) await ctx.addInitScript({ content: s.code });

const page = ctx.pages()[0] || await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 180)); });
page.on('pageerror', e => consoleErrors.push('PAGEERR ' + String(e).slice(0, 180)));

await page.goto(shot.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000);

let detail = {};
if (shotName.startsWith('youtube')) detail = await prepareYouTube();
else if (shotName === 'video-player') detail = await prepareVideoPlayer();
else if (shotName === 'pdf-reader') detail = await preparePdfReader();
else if (shotName === 'study') detail = await prepareStudy();

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
const target = path.join(OUT, `${shotName}.png`);
await page.screenshot({ path: target, fullPage: false });

const probe = await page.evaluate(() => ({
    href: location.href,
    words: document.querySelectorAll('.jpdb-reader-word').length,
    furi: document.querySelectorAll('.jpdb-reader-furi,[data-yomu-projected-reading="true"]').length,
    pitchClassed: document.querySelectorAll('[data-pitch-class]').length,
    subtitleSurface: document.querySelectorAll('.jpdb-subtitle-surface,.jpdb-subtitle-text').length,
    railLines: document.querySelectorAll('[class*="subtitle"][class*="line"],.jpdb-subtitle-list-line').length,
    signedIn: !document.body.textContent.includes('Sign in') || Boolean(document.querySelector('#avatar-btn,ytd-topbar-menu-button-renderer img')),
}));

console.log(JSON.stringify({ shot: shotName, url: shot.url, target, probe, detail, consoleErrors: consoleErrors.slice(0, 6) }, null, 2));
await Promise.race([ctx.close(), new Promise(r => setTimeout(r, 4000))]).catch(() => undefined);

async function prepareVideoPlayer() {
    const media = path.join(APP, 'docs/public/media');
    await page.setInputFiles('[data-video-input]', [
        path.join(media, 'yomu-peppa-shopping.mp4'),
        path.join(media, 'yomu-peppa-shopping-ja.vtt'),
    ]);
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return;
        v.muted = true;
        void v.play().catch(() => undefined);
    });
    await page.waitForTimeout(4000);
    // Hold a cue with a full sentence in it, THEN open the transcript rail.
    await page.evaluate(t => {
        const v = document.querySelector('video');
        if (!v) return;
        v.pause();
        v.currentTime = t;
    }, Number(process.env.CAP_SEEK_V || 33));
    await page.waitForTimeout(4000);
    // The hosted player opens the rail itself once a subtitle file loads, so
    // only press the toggle when it is actually closed.
    const openedRail = await page.evaluate(() => {
        const toggle = document.querySelector('.jpdb-subtitle-panel-toggle,[data-action="panel"]');
        if (!(toggle instanceof HTMLElement)) return null;
        const label = toggle.getAttribute('aria-label') || toggle.className;
        if (/open/i.test(label)) { toggle.click(); return `clicked:${label}`; }
        return `already-open:${label}`;
    });
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
        const lines = document.querySelector('[data-action="panel-lines"]');
        if (lines instanceof HTMLElement && lines.getAttribute('aria-pressed') !== 'true') lines.click();
    });
    await page.waitForTimeout(3000);
    return {
        openedRail,
        onPicture: await page.evaluate(() => (document.querySelector('.jpdb-subtitle-text,.jpdb-subtitle-surface')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)),
        panelOpen: await page.evaluate(() => Boolean(document.querySelector('.jpdb-subtitle-panel-open,.jpdb-subtitle-panel'))),
        panelMode: await page.evaluate(() => Array.from(document.querySelectorAll('[data-action^="panel-"]')).map(el => `${el.dataset.action}:${el.getAttribute('aria-pressed')}`)),
        puckCollision: await page.evaluate(() => {
            const puck = document.querySelector('.jpdb-reader-fab,[data-jpdb-reader-fab],[class*="jpdb"][class*="fab"]');
            if (!(puck instanceof HTMLElement)) return null;
            const p = puck.getBoundingClientRect();
            const hits = Array.from(document.querySelectorAll('header button, header a, [data-open-pdf-label], button'))
                .filter(el => el !== puck && !puck.contains(el))
                .map(el => ({ el, r: el.getBoundingClientRect() }))
                .filter(({ r }) => r.width > 0 && r.right > p.left && r.left < p.right && r.bottom > p.top && r.top < p.bottom)
                .map(({ el, r }) => ({
                    label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
                    overlapPx: Math.round(Math.min(r.right, p.right) - Math.max(r.left, p.left)),
                }));
            return { puck: { top: Math.round(p.top), right: Math.round(innerWidth - p.right) }, hits };
        }),
    };
}

async function preparePdfReader() {
    const pdf = process.env.CAP_PDF;
    if (!pdf) throw new Error('Set CAP_PDF to the PDF to open');
    await page.setInputFiles('[data-pdf-input]', [pdf]);
    await page.waitForTimeout(12000);
    const zoom = process.env.CAP_PDF_ZOOM;
    if (zoom === 'fit') {
        await page.getByRole('button', { name: /Fit width/i }).first().click().catch(() => {});
        await page.waitForTimeout(4000);
    } else if (zoom === 'out') {
        for (let i = 0; i < 2; i += 1) {
            await page.locator('button', { hasText: /^−$|^-$/ }).first().click().catch(() => {});
            await page.waitForTimeout(2500);
        }
    }
    // Measure how far each reader underline sits from the PDF glyph run it is
    // supposed to mark. A product shot must not ship visible drift.
    const drift = await page.evaluate(() => {
        const layerSpans = Array.from(document.querySelectorAll('.textLayer span,[class*="textLayer"] span'));
        const samples = [];
        for (const word of Array.from(document.querySelectorAll('.jpdb-reader-word')).slice(0, 60)) {
            const host = layerSpans.find(s => s.contains(word));
            if (!host || host === word) continue;
            const a = word.getBoundingClientRect();
            const b = host.getBoundingClientRect();
            samples.push({
                text: (word.textContent || '').slice(0, 8),
                dx: Math.round((a.left - b.left) * 10) / 10,
                dy: Math.round((a.top - b.top) * 10) / 10,
                wordH: Math.round(a.height * 10) / 10,
                hostH: Math.round(b.height * 10) / 10,
            });
        }
        return {
            sampled: samples.length,
            layerSpans: layerSpans.length,
            maxAbsDy: samples.length ? Math.max(...samples.map(s => Math.abs(s.dy))) : null,
            heightRatio: samples.length ? Math.round((samples[0].wordH / samples[0].hostH) * 1000) / 1000 : null,
            first: samples.slice(0, 6),
        };
    });
    return {
        pdf, zoom: zoom || 'default', drift,
        zoomLabel: await page.evaluate(() => Array.from(document.querySelectorAll('button,span')).map(e => e.textContent?.trim()).find(t => /^\d+%$/.test(t || '')) || null),
        pages: await page.evaluate(() => document.querySelectorAll('canvas').length),
        words: await page.evaluate(() => document.querySelectorAll('.jpdb-reader-word').length),
    };
}

async function prepareStudy() {
    await page.waitForTimeout(6000);
    const steps = [];
    // Leave the explainer card and get into the review itself.
    const start = page.getByRole('button', { name: /^Start$/ }).first();
    if (await start.isVisible().catch(() => false)) { await start.click(); steps.push('start'); }
    await page.waitForTimeout(2500);
    // Jump to the step the shot is meant to show by pressing its own chip.
    const want = process.env.CAP_STUDY_STEP || 'Reveal';
    const chip = page.locator('button', { hasText: new RegExp(`^\\s*\\d?\\s*${want}\\s*$`, 'i') }).first();
    if (await chip.isVisible().catch(() => false)) { await chip.click(); steps.push(`chip:${want}`); }
    await page.waitForTimeout(4000);
    if ((process.env.CAP_STUDY_TYPE || '') === '1') {
        const box = page.locator('input[type="text"], input:not([type]), textarea').first();
        if (await box.isVisible().catch(() => false)) {
            await box.click();
            await box.fill(process.env.CAP_STUDY_ANSWER || 'おなまえは');
            const check = page.getByRole('button', { name: /^Check/i }).first();
            if (await check.isVisible().catch(() => false)) { await check.click(); steps.push('check'); }
            await page.waitForTimeout(3000);
        }
    }
    await page.waitForTimeout(2000);
    return {
        steps,
        heading: await page.evaluate(() => (document.querySelector('h1,h2,[class*="prompt"]')?.textContent || '').trim().slice(0, 80)),
        text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 400)),
    };
}

async function prepareYouTube() {
    // Dismiss any consent / dialog, start playback, seek to a line with kanji,
    // then open the Yomu subtitle rail via its own control.
    for (const label of [/Accept all/i, /Reject all/i, /No thanks/i, /Dismiss/i]) {
        const b = page.getByRole('button', { name: label }).first();
        if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(1200); }
    }
    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return;
        v.muted = true;
        void v.play().catch(() => undefined);
    });
    await page.waitForTimeout(2500);
    // Turn on the Japanese track through YouTube's own subtitle button if needed.
    const before = await page.evaluate(() => document.querySelectorAll('.jpdb-subtitle-text,.jpdb-subtitle-surface').length);
    // The transcript rail is the subtitle surface's own [data-action="panel"]
    // toggle (src/reader/subtitles/controller.ts:1448). Press that, not the puck.
    const openedRail = await page.evaluate(() => {
        const toggle = document.querySelector('.jpdb-subtitle-panel-toggle,[data-action="panel"]');
        if (!(toggle instanceof HTMLElement)) return null;
        toggle.click();
        return toggle.getAttribute('aria-label') || toggle.className;
    });
    await page.waitForTimeout(2000);
    // Show the whole transcript list, not the compact single line.
    await page.evaluate(() => {
        const lines = document.querySelector('[data-action="panel-lines"]');
        if (lines instanceof HTMLElement && lines.getAttribute('aria-pressed') !== 'true') lines.click();
    });
    await page.waitForTimeout(1200);
    // Make sure the radial fan is shut so it is not dimming the still.
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => document.querySelector('.jpdb-reader-fab-radial')?.remove());
    await page.waitForTimeout(500);
    // Pause FIRST, then land inside a cue. Seeking while playing drifts past the
    // cue and the on-picture subtitle disappears from the still.
    const seek = Number(process.env.CAP_SEEK || 32);
    await page.evaluate(t => {
        const v = document.querySelector('video');
        if (!v) return;
        v.pause();
        if (Number.isFinite(v.duration) && v.duration > t) v.currentTime = t;
    }, seek);
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.querySelector('video')?.pause());
    await page.waitForTimeout(1200);
    const onPicture = await page.evaluate(() => {
        const line = document.querySelector('.jpdb-subtitle-text,.jpdb-subtitle-surface');
        return line ? (line.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : null;
    });
    return {
        before,
        onPicture,
        openedRail,
        panelOpen: await page.evaluate(() => Boolean(document.querySelector('.jpdb-subtitle-panel-open,.jpdb-subtitle-panel'))),
        panelMode: await page.evaluate(() => Array.from(document.querySelectorAll('[data-action^="panel-"]')).map(el => `${el.dataset.action}:${el.getAttribute('aria-pressed')}`)),
        puck: await page.evaluate(() => Boolean(document.querySelector('[class*="jpdb"][class*="puck"],.jpdb-reader-fab,[data-jpdb-reader-fab]'))),
    };
}
