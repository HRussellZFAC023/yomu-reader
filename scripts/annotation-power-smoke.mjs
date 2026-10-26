#!/usr/bin/env node
// W1-65: built @require graph on recorded Wikipedia/YouTube, plus the built Study settings UI.
// Network answers are mocked; this gate never writes to a learner's accounts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { openRecordedPage } from './lib/recorded-page.mjs';
import { hostedFile, hostedAnswer, worktreeProduct } from './lib/recorded-products.mjs';
import { assert, mockJpdbParseFromVocabulary, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'artifacts', 'annotation-power');
mkdirSync(out, { recursive: true });
const settings = {
    onboardingSeen: true, interfaceLanguage: 'en', apiKey: 'mock-jpdb-key',
    parserProvider: 'jpdb', showFloatingButton: true, showFurigana: true, furiganaMode: 'all',
    annotationsPaused: false, lookupOnHover: true, lookupOnClick: true, popupActivationMode: 'hover',
    localDictionariesEnabled: false, jpdbDefinitionsEnabled: false, jitenDefinitionsEnabled: false,
    audioEnabled: false, autoPlayAudio: false, studyTranslationEnabled: false,
    immersionKitEnabled: false, ankiEnabled: false, ocrEnabled: false,
};
const vocabulary = [
    ['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 100, ['not-in-deck'], []],
    ['注意', '注意', 'ちゅうい', 'attention', ['n'], 100, ['not-in-deck'], []],
    ['先生', '先生', 'せんせい', 'teacher', ['n'], 330, ['not-in-deck'], []],
    ['日本', '日本', 'にほん', 'Japan', ['n'], 100, ['not-in-deck'], []],
    ['生私', '生私', 'せいし', 'redacted caption', ['n'], 100, ['not-in-deck'], []],
    ['人常先', '人常先', 'ひとつねさき', 'redacted caption', ['n'], 100, ['not-in-deck'], []],
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['not-in-deck'], []],
];
const answer = request => {
    if (new URL(request.url).hostname !== 'jpdb.io') return undefined;
    const body = typeof request.data === 'string' ? JSON.parse(request.data || '{}') : request.data;
    return { status: 200, contentType: 'application/json', body: JSON.stringify(mockJpdbParseFromVocabulary(body ?? {}, vocabulary)) };
};
const reports = [];
for (const [engine, type] of Object.entries({ chromium, webkit }).filter(([engine]) => !process.env.YOMU_SMOKE_BROWSER || engine === process.env.YOMU_SMOKE_BROWSER)) {
    const browser = await type.launch();
    const contextOptions = engine === 'webkit' ? { viewport: { width: 820, height: 1180 }, hasTouch: true, bypassCSP: true } : { viewport: { width: 1280, height: 900 }, bypassCSP: true };
    try {
        if (process.argv.includes('--ocr-only')) { await ocrReadings(browser, contextOptions, engine); continue; }
        if (process.argv.includes('--subtitles-only')) { await subtitleReadings(browser, contextOptions, engine); continue; }
        console.log(`${engine}: Settings`);
        const chosen = await settingsUi(browser, contextOptions, engine);
        const run = await openRecordedPage({ browser, gmNetwork: 'offline', slug: 'ja-wikipedia-nihongo', settings: { ...settings, ...chosen, showFurigana: true, furiganaMode: 'all' }, contextOptions, onGmRequest: answer, storageInitialize: 'ifMissing' });
        try {
            const { page } = run;
            const tap = locator => engine === 'webkit' ? locator.tap() : locator.click();
            const word = () => page.locator('#mw-content-text p .jpdb-reader-word[data-expression="日本語"]:not(a *)').first();
            await word().waitFor({ timeout: 30000 });
            assert(await page.locator('#mw-content-text rt').count() > 0, 'No initial page readings');
            await tap(page.locator('.jpdb-reader-fab'));
            // Power must preserve visible readings too, not only an Off preference.
            await tap(page.locator('[data-radial-id="power"]'));
            await stored(page, { furiganaMode: 'all', annotationsPaused: true });
            await page.keyboard.press('Escape');
            await tap(page.locator('.jpdb-reader-fab--paused'));
            await stored(page, { furiganaMode: 'all', annotationsPaused: false });
            await word().waitFor();
            await page.locator('#mw-content-text rt.jpdb-reader-furi').first().waitFor();
            await tap(page.locator('.jpdb-reader-fab'));
            await tap(page.locator('[data-radial-id="furigana"]'));
            await stored(page, { furiganaMode: 'off', annotationsPaused: false });
            await word().waitFor();
            await noReadings(page, '#mw-content-text');
            // Repeat toggles never walk through the old power-off state.
            for (let i = 0; i < 2; i++) {
                await tap(page.locator('[data-radial-id="furigana"]'));
                await stored(page, { furiganaMode: i === 0 ? 'all' : 'off', annotationsPaused: false });
            }
            await page.keyboard.press('Escape');
            if (engine === 'chromium') await word().hover();
            else await tap(word());
            await page.locator('.jpdb-reader-popover .jpdb-reader-spelling rt').first().waitFor({ timeout: 15000 });
            await page.keyboard.press('Escape');
            await tap(page.locator('.jpdb-reader-fab'));
            await tap(page.locator('[data-radial-id="power"]'));
            await stored(page, { annotationsPaused: true, furiganaMode: 'off' });
            await page.keyboard.press('Escape');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.locator('.jpdb-reader-fab--paused').waitFor();
            await page.screenshot({ path: path.join(out, `${engine}-power-off.png`) });
            assert((await page.locator('.jpdb-reader-fab').getAttribute('aria-label')).includes('turn on'), 'Off puck has no resume name');
            await tap(page.locator('.jpdb-reader-fab'));
            await stored(page, { annotationsPaused: false, furiganaMode: 'off' });
            await word().waitFor();
            await noReadings(page, '#mw-content-text');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await word().waitFor();
            await noReadings(page, '#mw-content-text');
            await page.evaluate(() => window.__yomuSmokeMenuCommands.get('よむ annotations')());
            await stored(page, { annotationsPaused: true, furiganaMode: 'off' });
            await page.evaluate(() => window.__yomuSmokeMenuCommands.get('よむ annotations')());
            await stored(page, { annotationsPaused: false, furiganaMode: 'off' });
            await page.screenshot({ path: path.join(out, `${engine}-page.png`) });
            reports.push({ engine, page: 'pass', power: 'pass', reload: 'pass', lookup: 'pass' });
        } finally { await run.close(); }
        console.log(`${engine}: page power and lookup passed`);
        await subtitleReadings(browser, contextOptions, engine);
        await ocrReadings(browser, contextOptions, engine);
        for (const surface of ['ja-wikipedia-nihongo', 'youtube-watch']) {
            for (const [kind, preference] of Object.entries({
                settingsOff: chosen,
                legacyMiddleState: { showFurigana: true, furiganaMode: 'off', puckFuriganaModeBeforeHide: 'all' },
            })) {
                console.log(`${engine}: ${surface} ${kind}`);
                const run = await openRecordedPage({ browser, gmNetwork: 'offline', slug: surface,
                    settings: { ...settings, ...preference }, contextOptions, onGmRequest: answer });
                try {
                    const { page } = run;
                    await page.locator('.jpdb-reader-fab--on').waitFor({ timeout: 30000 });
                    const selector = surface === 'youtube-watch' ? '.jpdb-subtitle-player' : '#mw-content-text';
                    await page.locator(`${selector} .jpdb-reader-word`).first().waitFor({ timeout: 30000 });
                    await noReadings(page, selector);
                    await page.screenshot({ path: path.join(out, `${engine}-${surface}-${kind}.png`) });
                    reports.push({ engine, surface, [kind]: 'pass' });
                } finally { await run.close(); }
            }
        }
    } finally { await browser.close(); }
}
writeFileSync(path.join(out, 'results.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));

async function stored(page, expected) {
    await page.waitForFunction(({ key, expected }) => {
        const state = window.GM_getValue(key, {});
        return Object.entries(expected).every(([name, value]) => state[name] === value);
    }, { key: YOMU_SETTINGS_KEY, expected }, { timeout: 15000 });
}
async function noReadings(page, selector) {
    await page.waitForFunction(selector => [...document.querySelectorAll(`${selector} rt.jpdb-reader-furi, ${selector} .jpdb-reader-detached-furi, ${selector} .jpdb-ocr-furi, [data-yomu-projected-reading]`)].every(node => {
        const style = getComputedStyle(node);
        return !node.getClientRects().length || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
    }), selector);
}
async function settingsUi(browser, contextOptions, engine) {
    const context = await browser.newContext(contextOptions);
    try {
        await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: YOMU_SETTINGS_KEY, value: settings });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'yomureader.com' && url.pathname.startsWith('/study/')) {
                const name = url.pathname.slice('/study/'.length) || 'index.html';
                const file = path.join(root, 'dist', 'newtab', name);
                try {
                    const contentType = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html';
                    return route.fulfill({ status: 200, contentType, body: readFileSync(file) });
                } catch { /* unrelated optional hosted resources stay offline */ }
            }
            const hosted = hostedFile(worktreeProduct(), url.href);
            if (hosted) return route.fulfill(hostedAnswer(hosted));
            return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', e => console.error('Study page:', e.message));
        await page.goto('https://yomureader.com/study/#settings=appearance', { waitUntil: 'domcontentloaded' });
        const select = page.locator('select[name="furiganaMode"]');
        await select.waitFor({ state: 'attached', timeout: 30000 });
        assert(await select.locator('option[value="off"]').count() === 1, 'Settings → Furigana has no Off choice');
        await select.selectOption('off');
        await page.locator('button[type="submit"]').filter({ hasText: 'Save' }).click();
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').furiganaMode === 'off', YOMU_SETTINGS_KEY);
        const chosen = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), YOMU_SETTINGS_KEY);
        // Relabel the actual Settings UI, then verify the Japanese choice.
        await page.goto('https://yomureader.com/study/#settings=appearance', { waitUntil: 'domcontentloaded' });
        assert(await select.inputValue() === 'off', 'Study lost Furigana Off across reload');
        // Keep the general dropdown-persistence coverage of the former manual gate.
        await page.locator('select[name="popupMode"]').selectOption('sheet');
        await page.locator('button[type="submit"]').filter({ hasText: 'Save' }).click();
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').popupMode === 'sheet', YOMU_SETTINGS_KEY);
        await page.goto('https://yomureader.com/study/#settings=appearance', { waitUntil: 'domcontentloaded' });
        assert(await page.locator('select[name="popupMode"]').inputValue() === 'sheet', 'Study lost another saved preference');
        assert(await select.inputValue() === 'off', 'Saving another setting restored readings');
        await page.locator('select[name="interfaceLanguage"]').selectOption('ja');
        assert(await select.locator('option[value="off"]').textContent() === 'オフ', 'Missing Japanese Off');
        assert(!(await page.locator('body').innerText()).includes('未翻訳'), 'Untranslated Japanese Settings');
        return { showFurigana: chosen.showFurigana, furiganaMode: chosen.furiganaMode };
    } finally { await context.close(); }
}

async function subtitleReadings(browser, contextOptions, engine) {
    console.log(`${engine}: subtitle reading controls`);
    const run = await openRecordedPage({ browser, gmNetwork: 'offline', slug: 'youtube-watch', settings,
        // Hold a recorded cue containing a mocked dictionary word while the
        // learner uses the puck; later redacted cues have no dictionary reading.
        hostOptions: { autoplay: false, startSeconds: 0.5 }, contextOptions, onGmRequest: answer });
    try {
        const { page } = run;
        const tap = locator => engine === 'webkit' ? locator.tap() : locator.click();
        const word = () => page.locator('.jpdb-subtitle-player .jpdb-reader-word[data-reading]').first();
        await word().waitFor({ timeout: 30000 });
        await page.locator('.jpdb-subtitle-player rt.jpdb-reader-furi').first().waitFor();
        console.log(`${engine}: subtitle readings visible`);
        await tap(page.locator('.jpdb-reader-fab'));
        await tap(page.locator('[data-radial-id="furigana"]'));
        await stored(page, { annotationsPaused: false, furiganaMode: 'off' });
        await noReadings(page, '.jpdb-subtitle-player');
        console.log(`${engine}: subtitle readings off`);
        await page.keyboard.press('Escape');
        await tap(word());
        await page.locator('.jpdb-reader-popover .jpdb-reader-spelling rt').first().waitFor();
        console.log(`${engine}: subtitle lookup retained`);
        await page.keyboard.press('Escape');
        await tap(page.locator('.jpdb-reader-fab'));
        await tap(page.locator('[data-radial-id="furigana"]'));
        await stored(page, { annotationsPaused: false, furiganaMode: 'all' });
        await page.locator('.jpdb-subtitle-player rt.jpdb-reader-furi').first().waitFor();
        reports.push({ engine, surface: 'youtube-watch', subtitleOffLookupRestore: 'pass' });
    } catch (error) {
        const diagnosis = await run.page.evaluate(() => ({
            words: [...document.querySelectorAll('.jpdb-subtitle-player .jpdb-reader-word')].map(node => node.outerHTML),
            subtitles: document.querySelector('.jpdb-subtitle-player')?.outerHTML,
            popover: document.querySelector('.jpdb-reader-popover')?.outerHTML,
        }));
        writeFileSync(path.join(out, `${engine}-subtitle-failure.json`), JSON.stringify({ diagnosis, errors: run.pageErrors }, null, 2));
        throw error;
    } finally { await run.close(); }
}

async function ocrReadings(browser, contextOptions, engine) {
    console.log(`${engine}: OCR reading controls`);
    let uploads = 0;
    const requests = [];
    const run = await openRecordedPage({ browser, slug: 'commons-sign-photo', contextOptions,
        settings: { ...settings, ocrEnabled: true, ocrAutoScanImages: false, ocrShowTextOverlay: true,
            ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr', ocrMinImageArea: 100000 },
        onGmRequest: request => {
            requests.push({url: request.url, responseType: request.responseType});
            if (request.url.startsWith('http://127.0.0.1:7331/ocr')) {
                uploads++;
                return { status: 200, contentType: 'application/json', body: JSON.stringify({ width: 800, height: 600,
                    lines: [{ text: '注意', box: { x: 220, y: 180, w: 160, h: 80 }, vertical: false }] }) };
            }
            return answer(request);
        } });
    try {
        const { page } = run;
        const tap = locator => engine === 'webkit' ? locator.tap() : locator.click();
        // Reuse the recorded photo bytes with CORS enabled. This gate tests the
        // recognized-text display, independently of the manager's binary download path.
        await page.locator('#file img').evaluate(async image => {
            image.crossOrigin = 'anonymous';
            image.src = image.currentSrc || image.src;
            await image.decode();
        });
        await page.locator('#file img').scrollIntoViewIfNeeded();
        await page.locator('.jpdb-reader-fab').waitFor();
        await page.keyboard.press('Shift+I');
        const word = () => page.locator('.jpdb-ocr-layer .jpdb-reader-word[data-expression="注意"]').first();
        await word().waitFor({ timeout: 30000 });
        await page.locator('.jpdb-ocr-layer .jpdb-ocr-furi').first().waitFor();
        const before = uploads;
        await tap(page.locator('.jpdb-reader-fab'));
        await tap(page.locator('[data-radial-id="furigana"]'));
        await stored(page, { annotationsPaused: false, furiganaMode: 'off' });
        await noReadings(page, '.jpdb-ocr-layer');
        await page.keyboard.press('Escape');
        await tap(word());
        await page.locator('.jpdb-reader-popover .jpdb-reader-spelling rt').first().waitFor();
        await page.keyboard.press('Escape');
        await tap(page.locator('.jpdb-reader-fab'));
        await tap(page.locator('[data-radial-id="furigana"]'));
        await stored(page, { annotationsPaused: false, furiganaMode: 'all' });
        await page.locator('.jpdb-ocr-layer .jpdb-ocr-furi').first().waitFor();
        assert(uploads === before, 'Changing furigana uploaded the image again', { before, uploads });
        reports.push({ engine, surface: 'commons-sign-photo', ocrOffLookupRestore: 'pass', extraUploads: uploads - before });
    } catch (error) {
        const diagnosis = await run.page.evaluate(() => ({ settings: (() => { const s = window.GM_getValue('jpdb-popup-reader-settings', {}); return {provider:s.ocrProvider, endpoint:s.ocrEndpointUrl, enabled:s.ocrEnabled, paused:s.annotationsPaused, shortcuts:s.shortcuts?.scanImages}; })(), toasts: [...document.querySelectorAll('.jpdb-reader-toast')].map(n=>n.textContent), images: [...document.querySelectorAll('#file img')].map(img => ({ src: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight, complete: img.complete, box: img.getBoundingClientRect().toJSON() })), layers: [...document.querySelectorAll('.jpdb-ocr-layer')].map(node => node.outerHTML.slice(0, 2500)) }));
        writeFileSync(path.join(out, `${engine}-ocr-failure.json`), JSON.stringify({ uploads, requests, errors: run.pageErrors, diagnosis }, null, 2));
        throw error;
    } finally { await run.close(); }
}
