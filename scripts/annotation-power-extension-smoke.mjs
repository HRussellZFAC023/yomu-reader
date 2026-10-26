#!/usr/bin/env node
// W1-65: the compiled Chrome package, actual toolbar UI and extension storage.
// Recorded Wikipedia and mocked parsing only; the profile is disposable.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createChromiumExtensionSmokeScope, waitForChromiumExtensionWorker } from './lib/chromium-extension-smoke.mjs';
import { loadRecording } from './lib/recorded-page.mjs';
import { assert, mockJpdbParseFromVocabulary, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const extensionPackage = path.join(root, 'dist/extension/release/chrome/yomureader.com-chrome.zip');
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
let context;
try {
    const directory = scope.extensionDirectory(extensionPackage);
    const background = readFileSync(path.join(directory, 'background.js'), 'utf8');
    const prefix = /const storagePrefix = ("[^"]+");/u.exec(background);
    assert(prefix, 'Compiler storage namespace missing');
    const settingsKey = JSON.parse(prefix[1]) + YOMU_SETTINGS_KEY;
    context = await chromium.launchPersistentContext(scope.createDirectory('yomu-power-extension-'), {
        channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
    });
    // Routing can interrupt extension initialization. Wait for its APIs and seed
    // storage before intercepting page traffic or opening the recorded page.
    const worker = await waitForChromiumExtensionWorker(context);
    await worker.evaluate(({ key, settings }) => chrome.storage.local.set({ [key]: settings }), { key: settingsKey, settings });
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.protocol === 'chrome-extension:') return route.continue();
        if (request.isNavigationRequest() && request.url() === recording.manifest.url) {
            return route.fulfill({ status: 200, contentType: 'text/html', body: recording.documentHtml() });
        }
        if (url.hostname === 'jpdb.io' && url.pathname === '/api/v1/parse') {
            const body = mockJpdbParseFromVocabulary(request.postDataJSON(), [
                ['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 100, ['not-in-deck'], []],
            ]);
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
        const hit = har.lookup(request.method(), request.url(), request.postData());
        if (hit) return route.fulfill({ status: hit.status, contentType: hit.contentType, body: hit.body });
        return route.abort();
    });
    const page = await context.newPage();
    await page.goto(recording.manifest.url, { waitUntil: 'domcontentloaded' });
    const word = page.locator('#mw-content-text .jpdb-reader-word[data-expression="日本語"]').first();
    await word.waitFor({ timeout: 60000 });
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
    await action('furigana').waitFor();
    assert((await popup.locator('body').innerText()).includes('ふりがなオン'), 'Japanese toolbar labels missing');
    await action('furigana').click();
    await saved({ annotationsPaused: false, furiganaMode: 'off' });
    await popup.waitForFunction(() => document.querySelector('[data-yomu-action="furigana"]')?.getAttribute('aria-pressed') === 'false');
    await action('power').click();
    await saved({ annotationsPaused: true, furiganaMode: 'off' });
    await page.locator('.jpdb-reader-fab--paused[aria-label="よむ オフ・オンにする"]').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.jpdb-reader-fab--paused').click();
    await saved({ annotationsPaused: false, furiganaMode: 'off' });
    await word.waitFor();
    assert(await page.locator('.jpdb-reader-fab').count() === 0, 'Resuming lost the hidden-puck preference');
    await action('power').click();
    await saved({ annotationsPaused: true, furiganaMode: 'off' });
    await action('power').click();
    await saved({ annotationsPaused: false, furiganaMode: 'off' });
    assert(!(await popup.locator('body').innerText()).includes('未翻訳'), 'Untranslated toolbar copy');
    writeFileSync(path.join(out, 'results.json'), JSON.stringify({
        package: extensionPackage, page: recording.manifest.url,
        toolbarFurigana: 'pass', toolbarPower: 'pass', hiddenPuckRecoveryAndReload: 'pass', japanese: 'pass',
    }, null, 2));
    console.log('Compiled extension: toolbar switches, hidden-puck recovery, reload and Japanese labels passed');

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
} finally {
    await context?.close();
    scope.cleanup();
}
