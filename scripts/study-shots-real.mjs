#!/usr/bin/env node
// Screenshots of the REAL new-tab study flow for the docs. Serves the built
// newtab, seeds a full-featured card (kanji + sentence + pitch) through the
// same GM-bridge + card-cache path the recall smoke uses, walks the session
// stepper in the live page, and captures each step. Replaces the old jsdom
// skeleton renderer, whose captures misrepresented the shipped layout
// (missing shell constraints made the study card look broken).
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
    addGmStorageBridgeInitScript,
    assertBuiltArtifacts,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { chromium } from 'playwright';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const OUT_DOCS = path.join(ROOT, 'docs', 'public', 'screenshots');
const OUT_QA = path.join(ARTIFACTS, 'study-shots-real');
mkdirSync(OUT_QA, { recursive: true });

const CARD = {
    vid: 501, sid: 1, rid: 0,
    spelling: '飲み物', reading: 'のみもの', frequencyRank: 1500,
    partOfSpeech: ['n'],
    meanings: [{ glosses: ['drink', 'beverage'], partOfSpeech: ['n'] }],
    cardState: ['due'],
    pitchAccent: ['LHHLL'],
    wordWithReading: null,
    kanjiKeyword: 'drink',
    source: 'jpdb', reviewSource: 'jpdb-api',
    sentence: '冷たい飲み物が欲しい。',
};

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-key',
    jpdbMiningEnabled: true,
    enableReviews: true,
    audioEnabled: false,
    newTabStudyTourSeen: true,
    newTabStudyDisabledSteps: [],
    showPitchAccent: true,
};

function seedCache({ cacheKey, uiKey, cache, uiState }) {
    try {
        localStorage.setItem(cacheKey, JSON.stringify(cache));
        localStorage.setItem(uiKey, JSON.stringify(uiState));
    } catch { /* first paint can retry */ }
}

const server = await startLoopbackServer(async (req, res) => {
    if (req.url.startsWith('/newtab')) return serveFile(res, path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8');
    if (req.url.startsWith('/app.js')) return serveFile(res, path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8');
    if (req.url.startsWith('/styles.css')) return serveFile(res, path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8');
    const asset = path.join(NEWTAB_DIR, req.url.replace(/^\//, '').split('?')[0]);
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    if (!existsSync(asset) || statSync(asset).isDirectory()) { res.writeHead(404); res.end(); return; }
    return serveFile(res, asset, types[path.extname(asset)] ?? 'application/octet-stream');
});

assertBuiltArtifacts([path.join(NEWTAB_DIR, 'index.html'), path.join(NEWTAB_DIR, 'app.js')], ROOT);

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
];
const STEP_SHOTS = [
    { id: 'kanji-doodle', file: 'real-newtab-kanji.png', hint: true },
    { id: 'recall-cloze', file: 'real-newtab.png', hint: false },
    { id: 'listen-pitch', file: 'study-pitch-select.png', hint: false },
    { id: 'final-reveal', file: 'real-newtab-reveal.png', hint: false },
];

try {
    for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();
        await page.exposeFunction('__yomuStudyShotsRequest', () => ({ status: 503, responseText: '' }));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: settings,
            requestBridgeName: '__yomuStudyShotsRequest',
        });
        await page.addInitScript(seedCache, {
            cacheKey: 'jpdb-reader-newtab-card-cache',
            uiKey: 'jpdb-reader-newtab-ui',
            cache: { at: Date.now(), sourceLabel: 'JPDB', cards: [CARD] },
            uiState: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        await page.goto(`${server.origin}/newtab`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-study-step-id]', { timeout: 20_000 });

        for (const shot of STEP_SHOTS) {
            const chip = page.locator(`[data-study-step-id^="${shot.id}"]`).first();
            if (await chip.count() === 0) {
                console.log(`SKIP ${shot.id} (${viewport.name}): step not in session`);
                continue;
            }
            await chip.click();
            await page.waitForTimeout(700);
            if (shot.hint) await page.locator('[data-newtab-action="study-hint"]').first().click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(300);
            const qaPath = path.join(OUT_QA, `${viewport.name}-${shot.file}`);
            await page.screenshot({ path: qaPath, fullPage: false });
            if (viewport.name === 'desktop') {
                await page.screenshot({ path: path.join(OUT_DOCS, shot.file), fullPage: false });
            }
            console.log(`SHOT ${shot.id} (${viewport.name}) -> ${qaPath}`);
        }
        await context.close();
    }
    console.log('study-shots-real complete');
} finally {
    await browser.close();
    server.server.close();
}
