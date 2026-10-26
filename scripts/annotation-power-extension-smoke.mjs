#!/usr/bin/env node
// W1-65: the compiled Chrome package, actual toolbar UI and extension storage.
// Recorded Wikipedia and mocked parsing only; the profile is disposable.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createChromiumExtensionSmokeScope, waitForChromiumExtensionWorker } from './lib/chromium-extension-smoke.mjs';
import { loadRecording } from './lib/recorded-page.mjs';
import { assert, mockJpdbParseFromVocabulary, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const extensionPackage = process.env.EXT_DIR || path.join(root, 'dist/extension/release/chrome/yomureader.com-chrome.zip');
const scope = createChromiumExtensionSmokeScope();
const out = path.join(root, 'artifacts/annotation-power-extension');
mkdirSync(out, { recursive: true });
const recording = loadRecording('ja-wikipedia-nihongo');
const har = recording.har();
const settings = {
    onboardingSeen: true, interfaceLanguage: 'ja', parserProvider: 'jpdb', apiKey: 'mock-jpdb-key',
    showFloatingButton: false, annotationsPaused: false, showFurigana: true, furiganaMode: 'all',
    audioEnabled: false, autoPlayAudio: false, ocrEnabled: false, studyTranslationEnabled: false,
    jpdbDefinitionsEnabled: false, jitenDefinitionsEnabled: false, localDictionariesEnabled: false,
    immersionKitEnabled: false, ankiEnabled: false,
};
const vocabulary = [['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 100, ['not-in-deck'], []]];
let mockParseRequests = 0;
const mockServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    mockParseRequests++;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(mockJpdbParseFromVocabulary(JSON.parse(body || '{}'), vocabulary)));
});
const headed = process.argv.includes('--headed');
// The shared QA Mac can be saturated by other lanes. Wait for extension boot;
// this gate checks state and controls rather than startup performance.
const bootTimeout = 180000;
let context;
let worker;
let page;
const pageErrors = [];
const requests = [];
let settingsKey;
try {
    const directory = scope.extensionDirectory(extensionPackage);
    const background = readFileSync(path.join(directory, 'background.js'), 'utf8');
    const prefix = /const storagePrefix = ("[^"]+");/u.exec(background);
    assert(prefix, 'Compiler storage namespace missing');
    settingsKey = JSON.parse(prefix[1]) + YOMU_SETTINGS_KEY;
    context = await chromium.launchPersistentContext(scope.createDirectory('yomu-power-extension-'), {
        channel: 'chromium', headless: !headed, viewport: null,
        ignoreDefaultArgs: ['--disable-extensions'],
        args: ['--window-size=1280,740', `--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
    });
    console.log('Extension profile launched');
    // Routing can interrupt extension initialization. Wait for its APIs and seed
    // storage before intercepting page traffic or opening the recorded page.
    worker = await waitForChromiumExtensionWorker(context, bootTimeout);
    console.log(`Extension worker ready: ${await worker.evaluate(() => chrome.runtime.getManifest().name)}`);
    await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
    // BrowserContext routing does not reliably reach MV3 worker fetches. Mock
    // only the network transport, keeping the compiled GM and toolbar APIs real.
    await worker.evaluate(origin => {
        const networkFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (input, options) => {
            const request = new Request(input, options);
            const url = new URL(request.url);
            if (url.hostname === 'jpdb.io' && url.pathname === '/api/v1/parse') {
                return networkFetch(`${origin}/parse`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: await request.text() });
            }
            if (url.protocol === 'chrome-extension:' || !['http:', 'https:'].includes(url.protocol)
                || (url.hostname !== 'jpdb.io' && ['GET', 'HEAD'].includes(request.method))) return networkFetch(request);
            return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
        };
    }, `http://127.0.0.1:${mockServer.address().port}`);
    await worker.evaluate(({ key, settings }) => chrome.storage.local.set({ [key]: settings }), { key: settingsKey, settings });
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === 'jpdb.io') requests.push({ method: request.method(), url: request.url() });
        if (url.protocol === 'chrome-extension:') return route.continue();
        if (request.isNavigationRequest() && request.url() === recording.manifest.url) {
            return route.fulfill({ status: 200, contentType: 'text/html', body: recording.documentHtml() });
        }
        if (url.hostname === 'jpdb.io' && url.pathname === '/api/v1/parse') {
            const body = mockJpdbParseFromVocabulary(request.postDataJSON(), vocabulary);
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
        const hit = har.lookup(request.method(), request.url(), request.postData());
        if (hit) return route.fulfill({ status: hit.status, contentType: hit.contentType, body: hit.body });
        return route.abort();
    });
    page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(recording.manifest.url, { waitUntil: 'domcontentloaded' });
    console.log('Recorded page opened');
    await page.locator('#mw-content-text p').filter({ hasText: '日本語' }).first().scrollIntoViewIfNeeded();
    const word = page.locator('#mw-content-text p .jpdb-reader-word[data-expression="日本語"]:not(a *)').first();
    await word.waitFor({ timeout: bootTimeout });
    console.log('Extension annotated the recorded page');
    assert(await page.locator('.jpdb-reader-fab').count() === 0, 'Puck should follow the saved hidden preference while on');
    const popup = await context.newPage();
    // Open the packaged popup as a test tab, keeping Wikipedia the active tab
    // that a real toolbar popup would address. No messaging API is replaced.
    await worker.evaluate(async url => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        await chrome.tabs.update(tab.id, { active: true });
    }, recording.manifest.url);
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const action = id => popup.locator(`[data-yomu-action="${id}"]`);
    const pressAction = async id => {
        await action(id).click();
        await popup.waitForFunction(() => !document.querySelector('[data-yomu-action]:disabled'));
        // The toolbar relists after its 900ms persistence echo. Let that
        // render settle in the popup's event loop before the next gesture.
        await popup.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
    };
    await action('furigana').waitFor();
    assert((await popup.locator('body').innerText()).includes('ふりがなオン'), 'Japanese toolbar labels missing');
    await pressAction('furigana');
    await saved({ annotationsPaused: false, furiganaMode: 'off' });
    await popup.waitForFunction(() => document.querySelector('[data-yomu-action="furigana"]')?.getAttribute('aria-pressed') === 'false');
    await pressAction('power');
    await saved({ annotationsPaused: true, furiganaMode: 'off' });
    await page.locator('.jpdb-reader-fab--paused[aria-label="よむ オフ・オンにする"]').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.jpdb-reader-fab--paused').waitFor({ timeout: bootTimeout });
    await page.bringToFront();
    await page.locator('.jpdb-reader-fab--paused').click();
    await saved({ annotationsPaused: false, furiganaMode: 'off' });
    await word.waitFor({ timeout: bootTimeout });
    assert(await page.locator('.jpdb-reader-fab').count() === 0, 'Resuming lost the hidden-puck preference');
    await pressAction('power');
    await saved({ annotationsPaused: true, furiganaMode: 'off' });
    await pressAction('power');
    await saved({ annotationsPaused: false, furiganaMode: 'off' });
    assert(!(await popup.locator('body').innerText()).includes('未翻訳'), 'Untranslated toolbar copy');
    console.log('Toolbar, power recovery and reload passed');
    // Start the layout phase from a saved, visible puck and a fresh page parse.
    // The earlier phase proved that a hidden puck still recovers power.
    await worker.evaluate(async key => {
        const current = (await chrome.storage.local.get(key))[key];
        await chrome.storage.local.set({ [key]: { ...current, showFloatingButton: true } });
    }, settingsKey);
    await page.bringToFront();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.jpdb-reader-fab').waitFor({ timeout: bootTimeout });
    // Real full-page browser zoom, rather than CSS zoom or deviceScaleFactor.
    await worker.evaluate(async url => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        await chrome.tabs.setZoom(tab.id, 2);
    }, recording.manifest.url);
    await page.waitForFunction(() => innerWidth <= 641);
    await page.locator('#mw-content-text p').filter({ hasText: '日本語' }).first().scrollIntoViewIfNeeded();
    await word.waitFor({ timeout: bootTimeout });
    await page.locator('.jpdb-reader-fab').click();
    const menu = page.locator('.jpdb-reader-fab-radial.is-open');
    await menu.waitFor();
    await menu.evaluate(async node => {
        await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
    });
    const zoomLayout = await page.evaluate(() => ({
        width: innerWidth, height: innerHeight,
        items: [...document.querySelectorAll('[data-radial-id]')].map(node => node.getBoundingClientRect().toJSON()),
    }));
    assert(zoomLayout.items.length >= 7, 'Zoomed menu did not open', zoomLayout);
    for (const item of zoomLayout.items) assert(item.left >= -1 && item.top >= -1 && item.right <= zoomLayout.width + 1 && item.bottom <= zoomLayout.height + 1, 'Actual 200% zoom clipped a puck action', zoomLayout);
    await captureViewport('actual-200-percent-zoom.png');
    await page.keyboard.press('Escape');
    await page.bringToFront();
    await word.click();
    await page.locator('.jpdb-reader-popover .jpdb-reader-spelling rt').first().waitFor();
    await page.waitForFunction(() => {
        const rect = document.querySelector('.jpdb-reader-popover')?.getBoundingClientRect();
        return rect && rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    });
    await captureViewport('actual-200-percent-lookup.png');
    await worker.evaluate(async url => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        if (await chrome.tabs.getZoom(tab.id) !== 2) throw new Error('Browser zoom was not 200%');
    }, recording.manifest.url);
    assert(mockParseRequests > 0, 'The extension did not reach the mocked parser');
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({
        package: extensionPackage, page: recording.manifest.url,
        toolbarFurigana: 'pass', toolbarPower: 'pass', hiddenPuckRecoveryAndReload: 'pass', japanese: 'pass',
        actualBrowserZoom: '200%', zoomLayout, headed,
        mockParseRequests,
    }, null, 2));
    console.log('Compiled extension: toolbar switches, hidden-puck recovery, reload, Japanese labels and actual 200% browser zoom passed');

    async function captureViewport(name) {
        // Capture the compositor viewport directly. Playwright's CSS clip can
        // double the scroll offset when Chrome's real tab zoom is above 100%.
        const session = await context.newCDPSession(page);
        try {
            const { data } = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
            const png = Buffer.from(data, 'base64');
            const frame = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
            const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
            assert(Math.abs(frame.height - viewport.height * frame.width / viewport.width) <= 2,
                'Captured compositor frame differs from the real layout viewport', { frame, viewport });
            writeFileSync(path.join(out, name), png);
        } finally { await session.detach(); }
    }

    async function saved(expected) {
        // Read via the real background, outside the content script's isolated world.
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            const value = await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], settingsKey);
            if (Object.entries(expected).every(([key, item]) => value?.[key] === item)) return;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Extension storage did not settle: ${JSON.stringify(expected)}`);
    }
} catch (error) {
    if (page) {
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => undefined);
        const state = await page.evaluate(() => ({
            url: location.href, words: document.querySelectorAll('.jpdb-reader-word').length,
            roots: document.querySelectorAll('[data-jpdb-reader-root]').length,
            installed: document.getElementById('jpdb-reader-installed-runtime')?.outerHTML,
            puck: document.querySelector('.jpdb-reader-fab')?.outerHTML,
            popover: document.querySelector('.jpdb-reader-popover')?.outerHTML,
            toasts: [...document.querySelectorAll('.jpdb-reader-toast')].map(node => node.textContent),
        })).catch(() => null);
        const saved = await worker?.evaluate(async key => {
            const state = (await chrome.storage.local.get(key))[key];
            return { parserProvider: state?.parserProvider, paused: state?.annotationsPaused, furiganaMode: state?.furiganaMode };
        }, settingsKey).catch(() => null);
        writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ message: error.message, pageErrors, state, saved, requests, mockParseRequests }, null, 2));
    }
    throw error;
} finally {
    await context?.close();
    if (mockServer.listening) await new Promise(resolve => mockServer.close(resolve));
    scope.cleanup();
}
