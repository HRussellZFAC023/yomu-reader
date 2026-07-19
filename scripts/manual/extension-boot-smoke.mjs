// Probe: load the SHIPPED chrome extension package into real Chrome and
// verify the extension-specific machinery the userscript smokes never touch:
// service worker boot, content-script injection at document_start, popup
// page, storage, and a real lookup popover on a Japanese page.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Branded Chrome 137+ ignores --load-extension; this probe uses Playwright's
// bundled Chromium (chromium.launchPersistentContext), which still honors it.
// Override EXT_DIR to point at a freshly built package.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT_DIR = process.env.EXT_DIR || path.join(ROOT, 'dist', 'extension', 'chrome');
const ART = process.env.ART_DIR || path.join(ROOT, 'artifacts', 'manual-extension-boot');
mkdirSync(ART, { recursive: true });

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

    // 3. Browser-extension onboarding belongs only on the packaged Study page,
    // never over arbitrary content sites.
    const onboarding = await page.waitForFunction(
        () => Boolean(document.querySelector('.jpdb-reader-onboarding, [data-onboarding], .jpdb-reader-welcome, .jpdb-reader-onboarding-backdrop')),
        null, { timeout: 2_000 },
    ).then(() => true).catch(() => false);
    step('first-run onboarding suppressed on content pages', !onboarding);

    // 4. Confirm Japanese text gets scanned (reader words appear).
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

        // 7. The shipped new-tab page starts disabled and presents the real
        // welcome opt-in. Enabling its checkbox must switch to Study.
        const newtab = await popup.goto(`chrome-extension://${extensionId}/newtab/index.html`, { timeout: 15_000 })
            .then(async () => {
                await popup.waitForSelector('.jpdb-reader-onboarding', { timeout: 15_000 });
                return await popup.evaluate(() => ({
                    rendered: document.body.childElementCount > 0 && !document.body.innerText.includes('ERR'),
                    disabled: Boolean(document.querySelector('[data-newtab-optout]')),
                    optInUnchecked: document.querySelector('input[name="newTabEnabled"]') instanceof HTMLInputElement
                        && !document.querySelector('input[name="newTabEnabled"]').checked,
                }));
            })
            .catch(() => ({ rendered: false, disabled: false, optInUnchecked: false }));
        step('bundled newtab page renders', newtab.rendered);
        step('fresh extension keeps Study off', newtab.disabled);
        step('welcome Study opt-in starts unchecked', newtab.optInUnchecked);
        await popup.screenshot({ path: path.join(ART, 'ext-newtab-welcome-off.png') });
        if (newtab.optInUnchecked) {
            await popup.check('input[name="newTabEnabled"]');
            const offline = popup.locator('input[name="onboardingInstallOfflineDictionaries"]');
            if (await offline.count()) await offline.uncheck();
            await popup.click('[data-onboarding-action="without-api"]');
            const enabled = await popup.waitForSelector('[data-newtab-study]', { timeout: 15_000 })
                .then(() => true)
                .catch(() => false);
            step('welcome opt-in enables Study', enabled);
            await popup.screenshot({ path: path.join(ART, 'ext-newtab-study-enabled.png') });
        }
    }
} finally {
    writeFileSync(path.join(ART, 'ext-probe-report.json'), JSON.stringify(report, null, 2));
    await context.close();
    server.close();
}
const failed = report.steps.filter(item => !item.ok);
console.log(JSON.stringify({ failed: failed.length, consoleErrors: report.consoleErrors.slice(0, 8) }, null, 1));
process.exit(failed.length ? 1 : 0);
