// Probe: load the SHIPPED chrome extension package into real Chrome and
// verify the extension-specific machinery the userscript smokes never touch:
// service worker boot, content-script injection at document_start, popup
// page, storage, and a real lookup popover on a Japanese page.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

// Branded Chrome 137+ ignores --load-extension; this probe uses Playwright's
// bundled Chromium (chromium.launchPersistentContext), which still honors it.
// Override EXT_DIR to point at a freshly built package.
const EXT_DIR = process.env.EXT_DIR || '/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/5d668c75-5935-4335-b84e-1da58246ba3f/scratchpad/ext/chrome-ext';
const ART = '/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/5d668c75-5935-4335-b84e-1da58246ba3f/scratchpad/ext';

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>probe</title></head>
<body><main><p id="target">日本語を読む練習です。図書館で勉強します。</p></main></body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(resolve => server.listen(8977, '127.0.0.1', resolve));

const userDataDir = mkdtempSync(path.join(tmpdir(), 'yomu-ext-probe-'));
const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
        '--no-first-run',
        '--window-size=1280,900',
    ],
});

const report = { steps: [], consoleErrors: [], swErrors: [] };
const step = (name, ok, detail = '') => { report.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
    // 1. Service worker boots
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null);
    step('service worker boots', Boolean(sw), sw ? sw.url() : 'no service worker within 15s');
    const extensionId = sw ? new URL(sw.url()).host : null;

    // 2. Content script injects on a real page
    const page = await context.newPage();
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 300)); });
    // Serve from a non-root path so the synthetic Japanese page is treated as a
    // third-party site, not a local Yomu dev app (root "/" on 127.0.0.1 is
    // recognized as the hosted reader, which suppresses first-run onboarding).
    await page.goto('http://127.0.0.1:8977/article/read.html', { waitUntil: 'domcontentloaded' });
    page.on('console', message => console.log('[page-console]', message.type(), message.text().slice(0, 200)));
    const injected = await page.waitForFunction(
        () => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')),
        null, { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    step('content script initializes runtime (cold SW)', injected);
    if (!injected) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        const afterReload = await page.waitForFunction(
            () => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')),
            null, { timeout: 20_000 },
        ).then(() => true).catch(() => false);
        step('content script initializes runtime (warm SW after reload)', afterReload);
    }

    // 3. First-run onboarding state (fresh profile should surface onboarding).
    // Onboarding renders during app.init() which awaits settings, so wait for it
    // rather than sampling instantaneously.
    const onboarding = await page.waitForFunction(
        () => Boolean(document.querySelector('.jpdb-reader-onboarding, [data-onboarding], .jpdb-reader-welcome, .jpdb-reader-onboarding-backdrop')),
        null, { timeout: 15_000 },
    ).then(() => true).catch(() => false);
    step('first-run onboarding visible on fresh profile', onboarding, onboarding ? '' : 'no onboarding element found (check first-run UX)');
    await page.screenshot({ path: path.join(ART, 'ext-first-run.png') });

    // 4. Close onboarding (its backdrop intercepts pointer events) then confirm
    // Japanese text gets scanned (reader words appear).
    if (onboarding) {
        await page.evaluate(() => {
            const close = document.querySelector('[data-onboarding-action="close"]');
            if (close instanceof HTMLElement) { close.click(); return; }
            const skip = [...document.querySelectorAll('button')].find(b => /skip|close|later|×|始める|閉じる/i.test(b.textContent || ''));
            skip?.click();
        });
        await page.waitForFunction(
            () => !document.querySelector('.jpdb-reader-onboarding-backdrop, .jpdb-reader-onboarding'),
            null, { timeout: 8_000 },
        ).catch(() => {});
    }
    const scanned = await page.waitForFunction(
        () => document.querySelectorAll('#target .jpdb-reader-word, #target [data-surface]').length > 0,
        null, { timeout: 25_000 },
    ).then(() => true).catch(() => false);
    step('Japanese text scanned into reader words', scanned);
    await page.screenshot({ path: path.join(ART, 'ext-scanned.png') });

    // 5. Lookup popover on click
    if (scanned) {
        await page.click('#target .jpdb-reader-word, #target [data-surface]');
        const popover = await page.waitForFunction(
            () => Boolean(document.querySelector('.jpdb-reader-popover-body, .jpdb-reader-popover')),
            null, { timeout: 15_000 },
        ).then(() => true).catch(() => false);
        step('lookup popover opens on word click', popover);
        await page.screenshot({ path: path.join(ART, 'ext-popover.png') });
    }

    // 6. Action popup page renders
    if (extensionId) {
        const popup = await context.newPage();
        popup.on('console', message => { if (message.type() === 'error') report.consoleErrors.push('[popup] ' + message.text().slice(0, 300)); });
        const popupOk = await popup.goto(`chrome-extension://${extensionId}/popup.html`, { timeout: 15_000 })
            .then(async () => {
                await popup.waitForTimeout(2500);
                const text = (await popup.evaluate(() => document.body.innerText)).trim();
                const visible = await popup.evaluate(() => document.body.childElementCount > 0);
                return { ok: visible && text.length > 0, text: text.slice(0, 120) };
            })
            .catch(error => ({ ok: false, text: String(error).slice(0, 150) }));
        step('action popup renders content', popupOk.ok, popupOk.text);
        await popup.screenshot({ path: path.join(ART, 'ext-popup.png') });

        // 7. New tab override / newtab page if shipped
        const newtab = await popup.goto(`chrome-extension://${extensionId}/newtab/index.html`, { timeout: 15_000 })
            .then(async () => {
                await popup.waitForTimeout(3000);
                return await popup.evaluate(() => document.body.childElementCount > 0 && !document.body.innerText.includes('ERR'));
            })
            .catch(() => false);
        step('bundled newtab page renders', newtab);
        await popup.screenshot({ path: path.join(ART, 'ext-newtab.png') });
    }
} finally {
    writeFileSync(path.join(ART, 'ext-probe-report.json'), JSON.stringify(report, null, 2));
    await context.close();
    server.close();
}
const failed = report.steps.filter(item => !item.ok);
console.log(JSON.stringify({ failed: failed.length, consoleErrors: report.consoleErrors.slice(0, 8) }, null, 1));
process.exit(failed.length ? 1 : 0);
