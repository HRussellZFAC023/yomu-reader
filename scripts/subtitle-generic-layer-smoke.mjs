import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, webkit, devices } from 'playwright';
import { userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

// Generic stacking contexts cannot be reached through the YouTube recording's
// site Adapter. This labelled mechanism fixture runs the BUILT video companion
// and shipped CSS; only settings data is exported from source.
const productRoot = path.resolve(process.argv.find(arg => arg.startsWith('--product-root='))?.split('=')[1] ?? '.');
const defaults = await build({
    stdin: { contents: "export { DEFAULT_SETTINGS } from './src/reader/settings';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'CaptionSettingsFixture', logLevel: 'silent',
    define: { 'import.meta.env': '{}', '__YOMU_VERSION__': '"fixture"', '__YOMU_NEWTAB_BUILD__': 'false', '__YOMU_EXTENSION_BUILD__': 'false' },
});
const out = 'artifacts/subtitle-generic-layer';
mkdirSync(out, { recursive: true });
const results = [];
for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch();
    try {
        const page = await browser.newPage({ ...devices['iPad Pro 11'], viewport: { width: 834, height: 1194 } });
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <section style="position:relative;width:700px;height:400px">
            <video style="position:absolute;inset:0;width:100%;height:100%;z-index:1"></video></section>` }));
        await page.goto('https://example.com/generic-caption-layer-mechanism-fixture');
        await page.addStyleTag({ content: readFileSync(path.join(productRoot, 'dist/yomu.css'), 'utf8') });
        for (const file of userscriptCompanionPaths(path.join(productRoot, 'dist/yomu.user.js'))) {
            await page.addScriptTag({ content: readFileSync(file, 'utf8') });
        }
        await page.addScriptTag({ content: defaults.outputFiles[0].text });
        await page.evaluate(() => {
            const settings = { ...window.CaptionSettingsFixture.DEFAULT_SETTINGS, subtitlePlayerEnabled: true,
                subtitleOverlayVisible: true, subtitleControlsMode: 'off', subtitleSecondaryVisible: false };
            const card = { vid:1, sid:1, rid:0, spelling:'日本語', reading:'にほんご',
                meanings:[{glosses:['Japanese'],partOfSpeech:['n']}], frequencyRank:null,
                partOfSpeech:['n'], cardState:['not-in-deck'], pitchAccent:[], wordWithReading:null };
            const controller = new window.__yomuCompanions.video.SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async text => [{card,start:0,end:3,length:3,rubies:[],pitchClass:'unknown',sentence:text}],
                onSettingsChange: () => {},
            });
            controller.install();
            controller.video = document.querySelector('video');
            controller.cues = [{ start: 0, end: 100, text: '日本語です。', transcriptEligible: true }];
            controller.currentCue = controller.cues[0];
            controller.refresh();
            window.captionLayerFixture = controller;
        });
        await page.waitForSelector('.jpdb-subtitle-primary .jpdb-reader-word');
        const tiers = [];
        for (const videoTier of [1, 7, 'auto']) {
            await page.evaluate(tier => {
                document.querySelector('video').style.zIndex = String(tier);
                window.captionLayerFixture.refresh();
            }, videoTier);
            const state = await page.locator('.jpdb-subtitle-primary .jpdb-reader-word').evaluate(element => {
                const range = document.createRange(); range.selectNodeContents(element);
                const rect = range.getBoundingClientRect();
                const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
                const root = element.closest('.jpdb-subtitle-player');
                const captionHit = Boolean(document.elementFromPoint(x, y)?.closest('.jpdb-subtitle-primary'));
                const captionTier = Number(getComputedStyle(root).zIndex);
                const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
                dialog.style.cssText = `position:absolute;inset:0;background:white;z-index:${captionTier + 1}`;
                root.parentElement.append(dialog);
                const dialogHit = document.elementFromPoint(x, y) === dialog;
                dialog.remove();
                return { captionTier, captionHit, dialogHit,
                    restored: Boolean(document.elementFromPoint(x, y)?.closest('.jpdb-subtitle-primary')) };
            });
            assert(state.captionHit && state.restored, `${name}: video tier ${videoTier} covers captions: ${JSON.stringify(state)}`);
            assert(state.dialogHit, `${name}: caption covers a player dialog`);
            assert.equal(state.captionTier, (Number(videoTier) || 0) + 1, `${name}: caption tier does not follow the video`);
            tiers.push({ videoTier, ...state });
        }
        await page.screenshot({ path: `${out}/${name}-mechanism-fixture.png` });
        results.push({ engine: name, tiers });
    } finally { await browser.close(); }
}
writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
