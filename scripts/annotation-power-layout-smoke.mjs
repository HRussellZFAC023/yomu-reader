#!/usr/bin/env node
// Built product on recorded YouTube: all nine actions and lookup at awkward sizes.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';
import { openRecordedPage, worktreeProduct } from './lib/recorded-page.mjs';
import { assert, mockJpdbParseFromVocabulary } from './lib/smoke-harness.mjs';

const out = path.resolve(import.meta.dirname, '../artifacts/annotation-power-layout');
mkdirSync(out, { recursive: true });
const sizes = [[320, 568], [360, 640], [390, 844], [844, 390], [320, 1180], [590, 820], [500, 700], [1280, 600], [640, 300]];
const results = [];
const product = process.env.YOMU_SMOKE_PRODUCT_ROOT ? worktreeProduct(process.env.YOMU_SMOKE_PRODUCT_ROOT) : worktreeProduct();
const settings = {
    onboardingSeen: true, interfaceLanguage: 'en', apiKey: 'mock-jpdb-key', parserProvider: 'jpdb',
    showFloatingButton: true, furiganaMode: 'off', showFurigana: false, annotationsPaused: false,
    audioEnabled: false, autoPlayAudio: false, studyTranslationEnabled: false, ocrEnabled: false,
    jpdbDefinitionsEnabled: false, jitenDefinitionsEnabled: false, immersionKitEnabled: false,
};
const answer = request => {
    if (new URL(request.url).hostname !== 'jpdb.io') return undefined;
    const body = typeof request.data === 'string' ? JSON.parse(request.data || '{}') : request.data;
    return { status: 200, contentType: 'application/json', body: JSON.stringify(mockJpdbParseFromVocabulary(body ?? {}, [
        ['生私', '生私', 'せいし', 'redacted caption', ['n'], 100, ['not-in-deck'], []],
        ['人常先', '人常先', 'ひとつねさき', 'redacted caption', ['n'], 100, ['not-in-deck'], []],
    ])) };
};

for (const [engine, type] of Object.entries({ chromium, webkit })) {
    if (process.env.YOMU_SMOKE_BROWSER && process.env.YOMU_SMOKE_BROWSER !== engine) continue;
    const browser = await type.launch();
    try {
        for (const { width, height, largeText } of sizes.flatMap(([width, height]) => [false, true].map(largeText => ({ width, height, largeText })))) {
            const run = await openRecordedPage({ browser, product, slug: 'youtube-watch', gmNetwork: 'offline', settings: { ...settings, interfaceLanguage: largeText ? 'ja' : 'en' },
                hostOptions: { autoplay: false, startSeconds: 0.5 }, onGmRequest: answer,
                contextOptions: { ...(engine === 'webkit' ? devices['iPad Air'] : {}), viewport: { width, height }, hasTouch: true } });
            try {
                const { page } = run;
                await page.locator('.jpdb-reader-fab').waitFor();
                // Large-text rendering is independent of full-page browser zoom,
                // which the compiled-extension gate verifies with tabs.setZoom.
                if (largeText) await page.addStyleTag({ content: ':root { font-size: 200% !important; } .jpdb-reader-fab-radial-label { font-size: 24px !important; }' });
                await page.waitForTimeout(300); // Let the host settle its large-text reflow before opening the transient menu.
                await page.locator('.jpdb-reader-fab').tap();
                const menu = page.locator('.jpdb-reader-fab-radial.is-open');
                await menu.waitFor();
                await menu.evaluate(async node => {
                    await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
                });
                assert(await page.locator('.jpdb-reader-popover').count() === 0, 'A lookup opened through the puck menu');
                const state = await page.evaluate(() => {
                    const items = [...document.querySelectorAll('[data-radial-id]')].map(node => ({
                        id: node.dataset.radialId, ...node.getBoundingClientRect().toJSON(),
                        name: node.getAttribute('aria-label'),
                    }));
                    const label = document.querySelector('[data-radial-id="power"] .jpdb-reader-fab-radial-label');
                    return { width: innerWidth, height: innerHeight, items, label: label?.getBoundingClientRect().toJSON() };
                });
                assert(state.items.length === 9, 'Expected the complete video menu', state);
                let minGap = Infinity;
                for (const [index, item] of state.items.entries()) {
                    assert(item.name && !item.name.includes('未翻訳'), 'Missing action name', item);
                    assert(item.left >= -1 && item.top >= -1 && item.right <= state.width + 1 && item.bottom <= state.height + 1, 'Clipped action', { engine, width, height, item });
                    for (const other of state.items.slice(index + 1)) {
                        minGap = Math.min(minGap, Math.hypot(item.x + item.width / 2 - other.x - other.width / 2,
                            item.y + item.height / 2 - other.y - other.height / 2) - (item.width + other.width) / 2);
                    }
                }
                assert(minGap >= 5, 'Puck actions overlap or lose their touch gap', { engine, width, height, minGap });
                const label = state.label;
                assert(label && label.left >= -1 && label.top >= -1 && label.right <= state.width + 1 && label.bottom <= state.height + 1, 'Clipped power label', state);
                for (const item of state.items) assert(label.right <= item.left || label.left >= item.right || label.bottom <= item.top || label.top >= item.bottom, 'Power label covers another control', state);
                await page.screenshot({ path: path.join(out, `${engine}-${width}x${height}${largeText ? '-large-text' : ''}.png`) });
                await page.locator('[data-radial-id="furigana"]').tap();
                await page.waitForFunction(() => window.GM_getValue('jpdb-popup-reader-settings', {}).annotationsPaused === false);
                await page.keyboard.press('Escape');
                await page.locator('.jpdb-reader-fab-radial').waitFor({ state: 'hidden' });
                await page.mouse.move(0, 0);
                await page.keyboard.press('Escape');
                await page.locator('.jpdb-reader-popover').waitFor({ state: 'hidden' });
                const word = page.locator('.jpdb-subtitle-player .jpdb-reader-word[data-reading]').first();
                await word.waitFor({ timeout: 30000 });
                for (const popupMode of ['sheet', 'popover']) {
                    // Set a saved presentation through the real manager storage;
                    // opening and dismissal still use the product's visible UI.
                    await page.evaluate(mode => {
                        const key = 'jpdb-popup-reader-settings';
                        window.GM_setValue(key, { ...window.GM_getValue(key, {}), popupMode: mode, stickyBottomSheet: mode === 'sheet' });
                    }, popupMode);
                    await word.tap();
                    const popup = page.locator('.jpdb-reader-popover');
                    await popup.waitFor();
                    await page.waitForFunction(() => {
                        const rect = document.querySelector('.jpdb-reader-popover')?.getBoundingClientRect();
                        return rect && rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
                    });
                    await page.mouse.move(0, 0);
                    await page.keyboard.press('Escape');
                    await popup.waitFor({ state: 'hidden' });
                }
                results.push({ engine, width, height, largeText, minGap, menuAndLookup: 'pass' });
                writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
                console.log(`${engine}: ${width}×${height}${largeText ? ' large JA' : ' EN'} passed`);
            } catch (error) {
                await run.page.screenshot({ path: path.join(out, `${engine}-${width}x${height}-failure.png`) });
                writeFileSync(path.join(out, 'failure.json'), JSON.stringify(await run.page.evaluate(() => ({
                    viewport: { width: innerWidth, height: innerHeight },
                    active: document.activeElement?.outerHTML,
                    popup: document.querySelector('.jpdb-reader-popover')?.outerHTML,
                })), null, 2));
                throw error;
            } finally { await run.close(); }
        }
    } finally { await browser.close(); }
}
writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Puck and lookup: ${results.length} viewport/text cases passed`);
