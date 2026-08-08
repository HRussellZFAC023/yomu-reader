// Probe: load the SHIPPED chrome extension package into real Chrome and
// verify the extension-specific machinery the userscript smokes never touch:
// service worker boot, content-script injection at document_start, popup
// page, storage, and a real lookup popover on a Japanese page.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import {
    chromiumExtensionSmokeConfig,
    createChromiumExtensionSmokeScope,
} from '../lib/chromium-extension-smoke.mjs';

// Branded Chrome 137+ ignores --load-extension; this probe uses Playwright's
// bundled Chromium (chromium.launchPersistentContext), which still honors it.
// Override EXT_DIR to point at a freshly built package.
const smokeConfig = chromiumExtensionSmokeConfig(import.meta.url, 'manual-extension-boot');
const EXT_PACKAGE = smokeConfig.extensionPackage;
const temporaryDirectories = createChromiumExtensionSmokeScope();
const EXT_DIR = temporaryDirectories.extensionDirectory(EXT_PACKAGE);
const ART = smokeConfig.artifactDirectory;
const CONTENT_WAIT_MS = Number(process.env.CONTENT_WAIT_MS || 5_000);
const SCAN_WAIT_MS = Number(process.env.SCAN_WAIT_MS || 25_000);
const VIEWPORT_WIDTH = Number(process.env.SCREENSHOT_WIDTH || 1_280);
const VIEWPORT_HEIGHT = Number(process.env.SCREENSHOT_HEIGHT || 800);
mkdirSync(ART, { recursive: true });

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>probe</title></head>
<body><main><p id="target">日本語を読む練習です。図書館で勉強します。</p></main></body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(resolve => server.listen(8977, '127.0.0.1', resolve));

const userDataDir = temporaryDirectories.createDirectory('yomu-ext-probe-');
const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    // Playwright's default --disable-extensions flag can leave the service
    // worker visible while suppressing manifest content-script injection.
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
        '--no-first-run',
        '--window-size=1280,900',
    ],
});

const report = { steps: [], consoleErrors: [], swErrors: [], diagnostics: {} };
const step = (name, ok, detail = '') => { report.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
    // 1. Service worker boots
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null);
    sw?.on('console', message => { if (message.type() === 'error') report.swErrors.push(message.text().slice(0, 300)); });
    step('service worker boots', Boolean(sw), sw ? sw.url() : 'no service worker within 15s');
    const extensionId = sw ? new URL(sw.url()).host : null;

    // 2. Content script injects on a real page
    const page = await context.newPage();
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 300)); });
    page.on('pageerror', error => report.consoleErrors.push(`[pageerror] ${error.message.slice(0, 300)}`));
    // Serve from a non-root path so the synthetic Japanese page is treated as a
    // third-party site, not a local Yomu dev app (root "/" on 127.0.0.1 is
    // recognized as the hosted reader, which suppresses first-run onboarding).
    await page.goto('http://127.0.0.1:8977/article/read.html', { waitUntil: 'domcontentloaded' });
    page.on('console', message => console.log('[page-console]', message.type(), message.text().slice(0, 200)));
    const injected = await page.waitForFunction(
        () => Boolean(
            window.__yomuReaderAppInitialized
            || document.getElementById('jpdb-reader-runtime-owner')
            || document.getElementById('jpdb-reader-installed-runtime')
            || document.querySelector('#target .jpdb-reader-word'),
        ),
        null, { timeout: CONTENT_WAIT_MS },
    ).then(() => true).catch(() => false);
    let injectionPhase = injected ? 'cold service worker' : '';
    let afterReload = injected;
    if (!injected) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        afterReload = await page.waitForFunction(
            () => Boolean(
                window.__yomuReaderAppInitialized
                || document.getElementById('jpdb-reader-runtime-owner')
                || document.getElementById('jpdb-reader-installed-runtime')
                || document.querySelector('#target .jpdb-reader-word'),
            ),
            null, { timeout: CONTENT_WAIT_MS },
        ).then(() => true).catch(() => false);
        if (afterReload) injectionPhase = 'warm service worker after reload';
    }
    if (!afterReload && sw) {
        report.diagnostics = await sw.evaluate(() => ({
            runtimeId: chrome.runtime.id,
            manifest: chrome.runtime.getManifest(),
        })).catch(error => ({ diagnosticError: String(error) }));
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
        null, { timeout: SCAN_WAIT_MS },
    ).then(() => true).catch(() => false);
    step('content script initializes and scans Japanese', scanned, injectionPhase || (scanned ? 'verified by rendered reader words' : 'no reader words found'));
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
        const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
        step('manifest leaves the browser new-tab page unchanged', !manifest.chrome_url_overrides?.newtab);

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

        // 7. Study is a normal packaged page opened from Yomu. It must render
        // without presenting a misleading new-tab takeover option, and the
        // first card should land on the recognition-first Word step.
        const studyPage = await popup.goto(`chrome-extension://${extensionId}/newtab/index.html`, { timeout: 15_000 })
            .then(async () => {
                await popup.waitForSelector('.jpdb-reader-onboarding', { timeout: 15_000 });
                await popup.waitForFunction(
                    () => document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-step') === 'word',
                    null, { timeout: 30_000 },
                ).catch(() => undefined);
                return await popup.evaluate(() => ({
                    rendered: document.body.childElementCount > 0 && !document.body.innerText.includes('ERR'),
                    hasStudy: Boolean(document.querySelector('[data-newtab-study]')),
                    firstStep: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-step') ?? '',
                    hasTakeoverOption: Boolean(document.querySelector('input[name="newTabEnabled"]')),
                }));
            })
            .catch(() => ({ rendered: false, hasStudy: false, firstStep: '', hasTakeoverOption: true }));
        step('bundled Study page renders', studyPage.rendered && studyPage.hasStudy);
        step('Study opens on the Word step', studyPage.firstStep === 'word', studyPage.firstStep || 'no active step');
        step('welcome has no new-tab takeover option', !studyPage.hasTakeoverOption);
        await popup.screenshot({ path: path.join(ART, 'ext-study-welcome.png') });

        const offline = popup.locator('input[name="onboardingInstallOfflineDictionaries"]');
        if (await offline.count()) await offline.uncheck();
        await popup.click('[data-onboarding-action="without-api"]');
        const studyVisible = await popup.waitForSelector('[data-newtab-study]', { state: 'visible', timeout: 15_000 })
            .then(() => true)
            .catch(() => false);
        step('Study remains available after welcome', studyVisible);
        await popup.screenshot({ path: path.join(ART, 'ext-study.png') });
    }
} finally {
    writeFileSync(path.join(ART, 'ext-probe-report.json'), JSON.stringify(report, null, 2));
    await Promise.race([
        context.close(),
        new Promise(resolve => setTimeout(resolve, 5_000)),
    ]);
    server.close();
    temporaryDirectories.cleanup();
}
const failed = report.steps.filter(item => !item.ok);
console.log(JSON.stringify({ failed: failed.length, consoleErrors: report.consoleErrors.slice(0, 8) }, null, 1));
process.exit(failed.length ? 1 : 0);
