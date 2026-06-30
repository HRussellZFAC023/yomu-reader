#!/usr/bin/env node
// Browser proof that a Yomu overlay (settings dialog) scrolls on mobile even on a host
// that LOCKS page scrolling as aggressively as possible. Fullscreen readers
// (BookWalker/NFBR et al.) register non-passive touch/wheel listeners that
// preventDefault() every scroll to freeze the page under their viewer; that also kills
// scrolling INSIDE Yomu's panel. Rather than out-race the host (fragile: a
// window-CAPTURE or touchstart lock registered before us, or a cross-realm lock, all
// defeat a capture-phase stop), Yomu now DRIVES the scroll itself — a document-level
// touch-drag / wheel handler sets the overlay body's scrollTop directly, which works
// regardless of the host's preventDefault. This fixture locks with the worst case:
// window-CAPTURE touchstart+touchmove preventDefault AND window wheel preventDefault,
// all registered at HTML parse (before Yomu). Asserts on WebKit + Chromium: a touch
// drag scrolls the body; a wheel scrolls the body; a drag that starts OUTSIDE the
// scroll body (the head/handle) does NOT move it (scoping → sheet-drag safe). Requires
// `npm run build` first.
import { chromium, webkit } from 'playwright';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';
import path from 'node:path';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuScrollLockRequest';

function fixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#111;position:fixed;inset:0;width:100%}#viewer{height:100%}</style></head>
<body><div id="viewer">reader</div>
<script>
  window.__hostTouchLock = 0;
  // Worst-case NFBR-style lock, registered at parse (before Yomu): window-CAPTURE
  // touchstart + touchmove preventDefault (the shape that defeats an out-race guard),
  // plus window wheel preventDefault.
  const lock = e => { window.__hostTouchLock++; if (e.cancelable) e.preventDefault(); };
  window.addEventListener('touchstart', lock, { capture: true, passive: false });
  window.addEventListener('touchmove', lock, { capture: true, passive: false });
  window.addEventListener('wheel', e => { if (e.cancelable) e.preventDefault(); }, { capture: true, passive: false });
</script></body></html>`;
}

const SETTINGS = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrProvider: 'off', shortcuts: { openSettings: 'Ctrl+Shift+J' } };
const failures = [];
const rows = [];

// Cross-engine synthetic touch (WebKit has no `new Touch()`): a generic Event with
// faked touch coords, the shape Yomu's handlers read (touches[0].clientY).
function touchDragScript() {
    return (kind, x, y) => {
        const target = document.elementFromPoint(x, y) || document.body;
        const ev = new Event(kind, { bubbles: true, cancelable: true });
        const list = [{ clientX: x, clientY: y }];
        const moving = kind !== 'touchend' && kind !== 'touchcancel';
        Object.defineProperties(ev, { touches: { value: moving ? list : [] }, changedTouches: { value: list }, targetTouches: { value: moving ? list : [] } });
        target.dispatchEvent(ev);
    };
}

async function runCase(engineName) {
    const engine = engineName === 'webkit' ? webkit : chromium;
    const label = engineName;
    const browser = await engine.launch({ headless: true });
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

    await page.keyboard.press('Control+Shift+J');
    const opened = await page.waitForSelector('.jpdb-reader-settings .jpdb-reader-settings-scroll', { timeout: 8000 }).then(() => true).catch(() => false);
    if (!opened) { console.log(`FAIL: ${label} — settings panel never opened`); failures.push(label); rows.push({ label, ok: false }); await ctx.close(); await browser.close(); return; }
    await page.waitForTimeout(200);

    const scrollSel = '.jpdb-reader-settings .jpdb-reader-settings-scroll';
    const overflows = await page.evaluate(s => { const el = document.querySelector(s); return el ? el.scrollHeight - el.clientHeight > 40 : false; }, scrollSel);
    const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { cx: Math.round(r.left + r.width / 2), top: Math.round(r.top), bottom: Math.round(r.top + r.height) }; }, scrollSel);
    const reset = () => page.evaluate(s => { document.querySelector(s).scrollTop = 0; window.__hostTouchLock = 0; }, scrollSel);

    // (1) A touch DRAG over the body must scroll it despite the host's touch lock.
    await reset();
    const dragY0 = box.bottom - 60, dragY1 = box.top + 60;
    await page.evaluate(([fn, x, y0, y1]) => {
        const drag = eval('(' + fn + ')');
        drag('touchstart', x, y0); drag('touchmove', x, y0 - 30); drag('touchmove', x, y1); drag('touchend', x, y1);
    }, [touchDragScript().toString(), box.cx, dragY0, dragY1]);
    const afterDrag = await page.evaluate(s => ({ top: document.querySelector(s).scrollTop, hostRan: window.__hostTouchLock }), scrollSel);
    const dragScrolled = afterDrag.top > 50;

    // (2) A real wheel over the body must scroll it despite the host's wheel lock.
    await reset();
    await page.mouse.move(box.cx, Math.round((box.top + box.bottom) / 2));
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    const afterWheel = await page.evaluate(s => document.querySelector(s).scrollTop, scrollSel);
    const wheelScrolled = afterWheel > 50;

    // (3) Scoping: a drag that STARTS on the panel head/drag-handle (outside the scroll
    // body) must NOT move the body — proves sheet-drag / handle gestures are untouched.
    await reset();
    const headPt = await page.evaluate(() => { const h = document.querySelector('.jpdb-reader-settings-head, .jpdb-reader-settings-drag-handle'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
    const headDidNotScroll = headPt ? await page.evaluate(([fn, x, y, s]) => {
        const drag = eval('(' + fn + ')');
        drag('touchstart', x, y); drag('touchmove', x, y - 120); drag('touchend', x, y - 120);
        return document.querySelector(s).scrollTop === 0; // body untouched by a head-anchored drag
    }, [touchDragScript().toString(), headPt.x, headPt.y, scrollSel]) : false;

    const ok = overflows && dragScrolled && wheelScrolled && headDidNotScroll;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} — overflow=${overflows} touchDrag=${dragScrolled}(top=${afterDrag.top},hostLockRan=${afterDrag.hostRan}) wheel=${wheelScrolled}(top=${afterWheel}) headScopedOut=${headDidNotScroll}`);
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
console.log(failures.length ? `\nFAILURES (${failures.length}): ${[...new Set(failures)].join('; ')}` : '\nALL PASS — Yomu overlay scrolls via manual drive even under a window-capture touch+wheel lock');
process.exit(failures.length ? 1 : 0);
