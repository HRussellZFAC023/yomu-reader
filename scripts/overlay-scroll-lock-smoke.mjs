#!/usr/bin/env node
// Browser proof that a Yomu overlay (the settings dialog) can be scrolled on mobile
// even on a host that LOCKS page scrolling. Fullscreen readers — BookWalker/NFBR and
// friends — register a non-passive touchmove/wheel listener that preventDefault()s
// every scroll so the page can't move under their viewer. When Yomu's settings panel
// opens on top, scrolling INSIDE it fires touchmove/wheel that the host also
// preventDefault()s → the panel can't scroll at all (the reported bug). Yomu now
// guards on window-capture: for a gesture whose point is over its overlay it
// stopImmediatePropagation()s (so the host's lock never runs) WITHOUT preventDefault
// (so the browser still scrolls the overlay's own container). Asserts on WebKit +
// Chromium: (1) a real wheel over the panel scrolls it; (2) a touchmove over the panel
// never reaches the host's preventDefault; (3) with no overlay open the host lock is
// untouched (Yomu only guards its own overlays). Requires `npm run build` first.
import { chromium, webkit } from 'playwright';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';
import path from 'node:path';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuScrollLockRequest';

// A fullscreen reader that LOCKS scrolling exactly like NFBR: a non-passive
// touchmove on document-capture + wheel on window both preventDefault, and the body
// is fixed/clipped. Flags record whether the host's lock actually ran for a gesture.
function fixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#111;position:fixed;inset:0;width:100%}#viewer{height:100%}</style></head>
<body><div id="viewer">reader</div>
<script>
  window.__hostTouchLock = 0; window.__hostWheelLock = 0;
  // NFBR-style: preventDefault every scroll so the page can't move under the viewer.
  document.addEventListener('touchmove', e => { window.__hostTouchLock++; e.preventDefault(); }, { capture: true, passive: false });
  window.addEventListener('wheel', e => { window.__hostWheelLock++; e.preventDefault(); }, { passive: false });
</script></body></html>`;
}

const SETTINGS = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrProvider: 'off', shortcuts: { openSettings: 'Alt+Shift+J' } };
const failures = [];
const rows = [];

async function runCase(engineName) {
    const engine = engineName === 'webkit' ? webkit : chromium;
    const label = engineName;
    const browser = await engine.launch({ headless: true });
    // A phone-sized viewport so the settings panel overflows and must scroll.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 680 }, hasTouch: true, isMobile: false, locale: 'en-US', bypassCSP: true });
    const page = await ctx.newPage();
    await page.exposeFunction(BRIDGE, async () => ({ status: 503, responseText: '' }));
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: BRIDGE });
    await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'viewer.bookwalker.jp') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml() }); return r.fulfill({ status: 404, body: '' }); });
    await page.goto('https://viewer.bookwalker.jp/de_scroll/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }).catch(() => {}));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(700);

    // Open the settings panel (Alt+Shift+J).
    await page.keyboard.press('Alt+Shift+J');
    const opened = await page.waitForSelector('.jpdb-reader-settings .jpdb-reader-settings-scroll', { timeout: 8000 }).then(() => true).catch(() => false);
    if (!opened) { console.log(`FAIL: ${label} — settings panel never opened`); failures.push(label); rows.push({ label, ok: false }); await ctx.close(); await browser.close(); return; }
    await page.waitForTimeout(200);

    const scrollSel = '.jpdb-reader-settings .jpdb-reader-settings-scroll';
    const overflows = await page.evaluate(s => { const el = document.querySelector(s); return el ? el.scrollHeight - el.clientHeight > 40 : false; }, scrollSel);
    const center = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, scrollSel);

    // (1) Real wheel over the panel must scroll it despite the host's wheel lock.
    await page.mouse.move(center.x, center.y);
    const beforeTop = await page.evaluate(s => document.querySelector(s).scrollTop, scrollSel);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
    const afterTop = await page.evaluate(s => document.querySelector(s).scrollTop, scrollSel);
    const wheelScrolled = afterTop > beforeTop + 5;

    // (2) A touchmove over the panel must NOT reach the host's touchmove preventDefault.
    // Use a generic Event with faked touch coords (WebKit has no `new Touch()`), the
    // same shape Yomu's pointOverReaderRoot reads (changedTouches/touches[0].clientX/Y).
    await page.evaluate(() => { window.__hostTouchLock = 0; });
    const touchBlocked = await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y) || document.body;
        const ev = new Event('touchmove', { bubbles: true, cancelable: true });
        const touchList = [{ clientX: x, clientY: y }];
        Object.defineProperties(ev, { touches: { value: touchList }, changedTouches: { value: touchList }, targetTouches: { value: touchList } });
        target.dispatchEvent(ev);
        return { hostRan: window.__hostTouchLock, defaultPrevented: ev.defaultPrevented };
    }, center);
    const touchOk = touchBlocked.hostRan === 0 && touchBlocked.defaultPrevented === false;

    // (3) Scoping: a touchmove over the panel HEAD/drag-handle (outside the scroll
    // body) must NOT be guarded — the guard is scoped to scroll bodies so it never
    // starves Yomu's own drag gestures (sheet-drag listens on touchmove). Host runs.
    await page.evaluate(() => { window.__hostTouchLock = 0; });
    const headPt = await page.evaluate(() => { const h = document.querySelector('.jpdb-reader-settings-head, .jpdb-reader-settings-drag-handle'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
    const headNotGuarded = headPt ? await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y) || document.body;
        const ev = new Event('touchmove', { bubbles: true, cancelable: true });
        const touchList = [{ clientX: x, clientY: y }];
        Object.defineProperties(ev, { touches: { value: touchList }, changedTouches: { value: touchList }, targetTouches: { value: touchList } });
        target.dispatchEvent(ev);
        return window.__hostTouchLock > 0; // host saw it ⇒ guard did NOT fire over the head
    }, headPt) : false;

    // (4) Regression: with NO Yomu overlay open, the host lock must still work (Yomu
    // only guards its own overlay bodies — it must not neuter the host everywhere).
    await page.keyboard.press('Escape');
    await page.waitForSelector('.jpdb-reader-settings', { state: 'detached', timeout: 4000 }).catch(() => {});
    await page.evaluate(() => { window.__hostTouchLock = 0; });
    const hostStillLocks = await page.evaluate(() => {
        const target = document.elementFromPoint(195, 340) || document.body;
        const ev = new Event('touchmove', { bubbles: true, cancelable: true });
        const touchList = [{ clientX: 195, clientY: 340 }];
        Object.defineProperties(ev, { touches: { value: touchList }, changedTouches: { value: touchList }, targetTouches: { value: touchList } });
        target.dispatchEvent(ev);
        return window.__hostTouchLock > 0 && ev.defaultPrevented === true;
    });

    // (5) A host that locks on window-CAPTURE but loads AFTER Yomu (the realistic case:
    // NFBR-style viewers boot their engine late) must still be beaten — Yomu registered
    // its window-capture guard first, so stopImmediatePropagation runs before the host.
    await page.keyboard.press('Alt+Shift+J');
    await page.waitForSelector('.jpdb-reader-settings .jpdb-reader-settings-scroll', { timeout: 8000 }).catch(() => {});
    const lateHostBeaten = await page.evaluate(({ x, y }) => {
        window.__lateHostLock = 0;
        const lateLock = e => { window.__lateHostLock++; if (e.cancelable) e.preventDefault(); };
        window.addEventListener('touchmove', lateLock, { capture: true, passive: false }); // registered AFTER Yomu's guard
        const target = document.elementFromPoint(x, y) || document.body;
        const ev = new Event('touchmove', { bubbles: true, cancelable: true });
        const touchList = [{ clientX: x, clientY: y }];
        Object.defineProperties(ev, { touches: { value: touchList }, changedTouches: { value: touchList }, targetTouches: { value: touchList } });
        target.dispatchEvent(ev);
        window.removeEventListener('touchmove', lateLock, { capture: true });
        return window.__lateHostLock === 0; // Yomu (registered first) stopped it before the late window-capture host ran
    }, center);

    const ok = overflows && wheelScrolled && touchOk && headNotGuarded && hostStillLocks && lateHostBeaten;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} — overflow=${overflows} wheelScroll=${wheelScrolled}(${beforeTop}→${afterTop}) bodyGuarded=${touchOk}(hostRan=${touchBlocked.hostRan},dp=${touchBlocked.defaultPrevented}) headNotGuarded=${headNotGuarded} hostLockIntact=${hostStillLocks} lateWindowCaptureHostBeaten=${lateHostBeaten}`);
    if (!ok) failures.push(label);
    rows.push({ label, ok });
    await ctx.close();
    await browser.close();
}

for (const engineName of ['webkit', 'chromium']) {
    try { await runCase(engineName); }
    catch (e) { console.log(`ERROR ${engineName}: ${String(e).slice(0, 200)}`); failures.push(`${engineName} crashed`); }
}
console.log('\n================ SUMMARY ================');
for (const r of rows) console.log(`${r.label.padEnd(10)} ${r.ok ? 'scroll OK' : 'SCROLL BROKEN'}`);
console.log(failures.length ? `\nFAILURES (${failures.length}): ${[...new Set(failures)].join('; ')}` : '\nALL PASS — Yomu overlays scroll on a scroll-locking host; host lock intact elsewhere');
process.exit(failures.length ? 1 : 0);
