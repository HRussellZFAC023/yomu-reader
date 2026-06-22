#!/usr/bin/env node
// Live-site smoke: inject the built userscript into Ttsu Reader, Yatsu Reader,
// and a YouTube watch page; assert it installs without console errors, the
// FAB appears, and the subtitle rail only shows next to a real player.
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

const SITES = [
    { name: 'ttsu', url: 'https://reader.ttsu.app/', expectRail: false },
    { name: 'yatsu', url: 'https://yatsu-reader.web.app/', optional: true, expectRail: false },
    { name: 'youtube', url: 'https://www.youtube.com/watch?v=f2Q5tPfiSAE&hl=ja&gl=JP', expectRail: true },
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    preferJapaneseSiteLanguage: false,
    showFloatingButton: true,
    enableLogging: false,
};

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const failures = [];
for (const site of SITES) {
    const context = await browser.newContext({ bypassCSP: true, locale: 'ja-JP' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb/i.test(message.text())) errors.push(message.text());
    });
    try {
        await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings });
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (site.name === 'youtube') {
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
            await page.waitForTimeout(1500);
        }
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForTimeout(6000);
        const state = await page.evaluate(() => ({
            fab: Boolean(document.querySelector('.jpdb-reader-fab')),
            railVisible: (() => {
                const rail = document.querySelector('.jpdb-subtitle-rail');
                if (!rail) return false;
                const root = rail.closest('.jpdb-subtitle-player');
                if (!root || root.classList.contains('jpdb-subtitle-video-out-of-view')) return false;
                return getComputedStyle(rail).display !== 'none';
            })(),
            hasVideo: Boolean(document.querySelector('video')),
        }));
        const problems = [];
        if (!state.fab) problems.push('FAB missing');
        if (site.expectRail === false && state.railVisible) problems.push('subtitle rail visible without a player');
        if (errors.length) problems.push(`console errors: ${errors.slice(0, 3).join(' | ')}`);
        console.log(JSON.stringify({ site: site.name, url: site.url, ...state, problems }, null, 2));
        if (problems.length) failures.push(`${site.name}: ${problems.join('; ')}`);
    } catch (error) {
        if (site.optional) console.log(JSON.stringify({ site: site.name, skipped: String(error).slice(0, 160) }));
        else failures.push(`${site.name}: ${String(error).slice(0, 200)}`);
    } finally {
        await context.close();
    }
}
await browser.close();
if (failures.length) {
    console.error(`FAILURES:\n${failures.join('\n')}`);
    process.exit(1);
}
console.log('reader-sites smoke passed');
