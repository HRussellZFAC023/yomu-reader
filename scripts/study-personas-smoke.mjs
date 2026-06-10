#!/usr/bin/env node
// Simulated user testing on the study (new tab) page across environments the
// existing smokes do not cover:
//   1. keyless beginner  — no API keys, no Anki: practice words must load with
//      clear labels and WITHOUT the review-fallback notice.
//   2. degraded reviewer — Jiten key configured but the API is down: practice
//      words must load WITH the "No reviews ready" notice (trust fix).
// Reports friction feedback (timings, label text, console errors) as JSON.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { root: ROOT, dist: DIST, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const BUILT_ARTIFACTS = [
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
];
const STATIC_ROUTES = new Map([
    ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
    ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
    ['/yomu-icon.svg', [path.join(DIST, 'yomu-icon.svg'), 'image/svg+xml']],
    ['/favicon-32x32.png', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
    ['/favicon.ico', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
]);

function baseSettings(overrides = {}) {
    return {
        onboardingSeen: true,
        newTabEnabled: true,
        interfaceLanguage: 'en',
        apiKey: '',
        jitenApiKey: '',
        newTabAnkiEnabled: false,
        ankiEnabled: false,
        newTabParsingEnabled: false,
        immersionKitEnabled: false,
        localDictionariesEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        audioEnabled: false,
        enableLogging: false,
        ...overrides,
    };
}

async function runPersona(browser, baseUrl, persona) {
    const context = await browser.newContext({ bypassCSP: true, viewport: persona.viewport ?? { width: 980, height: 760 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(String(error).slice(0, 200)));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
    });
    if (persona.blockApis) {
        await page.route('**/api.jiten.moe/**', route => route.abort('connectionrefused'));
        await page.route('**/jpdb.io/**', route => route.abort('connectionrefused'));
    }
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: persona.settings });
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/newtab/index.html?persona=${persona.name}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-newtab-prompt]', { timeout: 20_000 });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-newtab-prompt]')?.textContent?.trim()), null, { timeout: 20_000 });
    const timeToFirstCardMs = Date.now() - startedAt;
    // Allow the async status/count line to settle before sampling labels.
    await page.waitForTimeout(2500);
    const observed = await page.evaluate(() => ({
        prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '',
        status: document.querySelector('[data-newtab-status]')?.textContent?.trim() ?? '',
        count: document.querySelector('[data-newtab-count]')?.textContent?.trim() ?? '',
        hasReveal: Boolean(document.querySelector('[data-newtab-action="reveal"]')),
    }));
    await context.close();
    const feedback = persona.review({ ...observed, timeToFirstCardMs, consoleErrors });
    return { persona: persona.name, ...observed, timeToFirstCardMs, consoleErrors: consoleErrors.slice(0, 5), feedback };
}

const PERSONAS = [
    {
        name: 'keyless-beginner',
        settings: baseSettings(),
        review(observed) {
            const feedback = [];
            assert(observed.prompt, 'keyless beginner saw no study card');
            if (/no reviews ready/i.test(`${observed.status} ${observed.count}`)) {
                feedback.push('BUG: fallback notice shown to a keyless user who never configured review sources');
            }
            if (observed.timeToFirstCardMs > 6000) feedback.push(`SLOW: first card took ${observed.timeToFirstCardMs}ms`);
            if (observed.consoleErrors.length) feedback.push(`ERRORS: ${observed.consoleErrors[0]}`);
            return feedback;
        },
    },
    {
        name: 'degraded-jiten-reviewer',
        settings: baseSettings({ jitenApiKey: 'ak_persona-degraded' }),
        blockApis: true,
        review(observed) {
            const feedback = [];
            assert(observed.prompt, 'degraded reviewer saw no card at all (blank study page)');
            if (!/no reviews ready/i.test(`${observed.status} ${observed.count}`)) {
                feedback.push('BUG: practice words substituted for the review queue without the fallback notice');
            }
            if (observed.consoleErrors.length > 3) feedback.push(`NOISY: ${observed.consoleErrors.length} console errors while degraded`);
            return feedback;
        },
    },
    {
        name: 'keyless-mobile',
        settings: baseSettings(),
        viewport: { width: 390, height: 844 },
        review(observed) {
            const feedback = [];
            assert(observed.prompt, 'mobile keyless user saw no study card');
            if (observed.timeToFirstCardMs > 8000) feedback.push(`SLOW(mobile): first card took ${observed.timeToFirstCardMs}ms`);
            return feedback;
        },
    },
];

async function main() {
    assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT, 'Run npm run build first.');
    const fixture = await startLoopbackServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const route = STATIC_ROUTES.get(url.pathname.replace(/\/+$/, '') || '/');
        if (!route || !existsSync(route[0])) {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('Not found');
            return;
        }
        serveFile(response, route[0], route[1], request.method ?? 'GET');
    }, 'Could not bind study personas smoke server');
    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    try {
        const results = [];
        for (const persona of PERSONAS) results.push(await runPersona(browser, fixture.origin, persona));
        const blockers = results.flatMap(result => result.feedback.filter(item => item.startsWith('BUG')));
        console.log(JSON.stringify({ ok: !blockers.length, results }, null, 2));
        if (blockers.length) process.exitCode = 1;
    } finally {
        await browser.close();
        await closeServer(fixture.server);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
});
