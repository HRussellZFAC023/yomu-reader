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
import { newTabModeButton } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, dist: DIST, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const NEW_TAB_UI_KEY = 'jpdb-reader-newtab-ui';
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

async function runQueryStudyMode(browser, baseUrl, query, mode) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 980, height: 760 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(String(error).slice(0, 200)));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
    });
    await page.route('**/api.jiten.moe/**', route => route.abort('connectionrefused'));
    await page.route('**/jpdb.io/**', route => route.abort('connectionrefused'));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: baseSettings({
            newTabSource: 'dictionary',
            localDictionariesEnabled: false,
            newTabAnkiEnabled: false,
            ankiEnabled: false,
        }),
    });
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/newtab/index.html?q=${encodeURIComponent(query)}&query-study=${mode}`, { waitUntil: 'domcontentloaded' });
    await newTabModeButton(page, 'word').click();
    await selectStudyStep(page, mode === 'kanji' ? 'kanji-doodle' : 'word');
    try {
        await page.waitForFunction(() => {
            const study = document.querySelector('[data-newtab-study]');
            const answer = document.querySelector('[data-newtab-answer]')?.textContent?.trim() ?? '';
            const status = document.querySelector('[data-newtab-status]')?.textContent?.trim() ?? '';
            const stuck = /Looking for more (?:words|kanji)|さらに(?:単語|漢字)を探しています/u.test(`${answer} ${status}`);
            return Boolean(study?.getAttribute('data-newtab-card')) && !stuck;
        }, null, { timeout: 6_000 });
    } catch (error) {
        const snapshot = await page.evaluate(() => ({
            prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '',
            answer: document.querySelector('[data-newtab-answer]')?.textContent?.trim() ?? '',
            status: document.querySelector('[data-newtab-status]')?.textContent?.trim() ?? '',
            count: document.querySelector('[data-newtab-count]')?.textContent?.trim() ?? '',
            card: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-card') ?? '',
            rootClass: document.querySelector('.jpdb-reader-newtab')?.className ?? '',
        }));
        throw new Error(`Query ${mode} study for ${query} stayed empty/loading: ${JSON.stringify(snapshot)}`);
    } finally {
        await context.close();
    }
    return { query, mode, timeToCardMs: Date.now() - startedAt, consoleErrors: consoleErrors.slice(0, 5) };
}

async function selectStudyStep(page, kind) {
    const step = page.locator(`[data-study-step-kind="${kind}"]`).first();
    if (await step.count()) await step.click();
}

async function revealVisibleCard(page) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (await page.locator('[data-newtab-action="grade"]').count()) return;
        const finalRevealStep = page.locator('[data-study-step-kind="final-reveal"]').first();
        if (await finalRevealStep.count()) {
            await finalRevealStep.click().catch(() => {});
        } else {
            await page.click('[data-newtab-action="reveal"]').catch(() => {});
        }
        await page.waitForTimeout(650);
    }
}

async function runMobilePassFailLayout(browser, baseUrl) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route('**/jpdb.io/**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>empty jpdb fixture</title>',
    }));
    await page.route('**/api.jiten.moe/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ cards: [], vocabulary: [], tokens: [] }),
    }));
    const card = {
        vid: 2626,
        sid: 1,
        rid: 1,
        spelling: '前方',
        reading: 'ぜんぽう',
        frequencyRank: 1200,
        partOfSpeech: ['noun'],
        meanings: [{ glosses: ['front; ahead'], partOfSpeech: ['noun'] }],
        cardState: ['due'],
        pitchAccent: ['0'],
        wordWithReading: '前方[ぜんぽう]',
        source: 'jpdb',
        reviewSource: 'jpdb-api',
    };
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: baseSettings({
            apiKey: 'mock-jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            twoButtonReviews: true,
            newTabSource: 'jpdb',
            jpdbDefinitionsEnabled: false,
            showPitchAccent: true,
        }),
    });
    await page.addInitScript(({ cacheKey, uiKey, cache, uiState }) => {
        localStorage.setItem(cacheKey, JSON.stringify(cache));
        localStorage.setItem(uiKey, JSON.stringify(uiState));
    }, {
        cacheKey: NEW_TAB_CACHE_KEY,
        uiKey: NEW_TAB_UI_KEY,
        cache: { at: Date.now(), sourceLabel: 'JPDB', cards: [card] },
        uiState: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
    });
    try {
        await page.goto(`${baseUrl}/newtab/index.html?persona=mobile-pass-fail-layout`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-newtab-prompt]', { timeout: 15_000 });
        await revealVisibleCard(page);
        try {
            await page.waitForSelector('[data-newtab-controls][data-newtab-grade-scale="pass-fail"]', { timeout: 8_000 });
        } catch (error) {
            const snapshot = await page.evaluate(() => ({
                prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '',
                answer: document.querySelector('[data-newtab-answer]')?.textContent?.trim() ?? '',
                controls: document.querySelector('[data-newtab-controls]')?.outerHTML ?? '',
                studyStep: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-step') ?? '',
                source: document.querySelector('[data-newtab-status]')?.textContent?.trim() ?? '',
                rootClass: document.querySelector('[data-jpdb-reader-root]')?.className ?? '',
                steps: Array.from(document.querySelectorAll('[data-study-step-kind]')).map(step => ({
                    kind: step.getAttribute('data-study-step-kind'),
                    active: step.getAttribute('data-active'),
                    text: step.textContent?.trim(),
                })),
            }));
            throw new Error(`Mobile pass/fail did not reach grade controls: ${JSON.stringify(snapshot)}`);
        }
        const layout = await page.evaluate(() => {
            const controls = document.querySelector('[data-newtab-controls]');
            const buttons = Array.from(document.querySelectorAll('[data-newtab-action="grade"]'));
            const rect = controls?.getBoundingClientRect();
            const buttonRects = buttons.map(button => {
                const box = button.getBoundingClientRect();
                return {
                    grade: button.getAttribute('data-grade') ?? '',
                    text: button.textContent?.trim() ?? '',
                    left: box.left,
                    right: box.right,
                    top: box.top,
                    bottom: box.bottom,
                    width: box.width,
                    height: box.height,
                };
            });
            return {
                scale: controls?.getAttribute('data-newtab-grade-scale') ?? '',
                count: controls?.getAttribute('data-newtab-grade-count') ?? '',
                controls: rect ? { left: rect.left, right: rect.right, width: rect.width, bottom: rect.bottom } : null,
                viewportWidth: window.innerWidth,
                buttons: buttonRects,
            };
        });
        assert(layout.scale === 'pass-fail', 'Mobile pass/fail controls did not use the pass-fail layout', layout);
        assert(layout.count === '2', 'Mobile pass/fail controls did not expose exactly two grade buttons', layout);
        assert(layout.buttons.map(button => button.grade).join(',') === 'fail,pass', 'Mobile pass/fail buttons were not Fail/Pass', layout);
        assert(layout.controls && layout.controls.left >= -0.5 && layout.controls.right <= layout.viewportWidth + 0.5, 'Mobile pass/fail controls overflowed the viewport', layout);
        assert(layout.buttons.every(button => button.width >= 120 && button.height >= 44), 'Mobile pass/fail buttons were too small to tap comfortably', layout);
        assert(layout.buttons[0].right <= layout.buttons[1].left, 'Mobile pass/fail buttons overlapped', layout);
        return layout;
    } finally {
        await context.close();
    }
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

// Keyless starter cards are labeled "Yomu" and must actually GRADE into the
// local SRS (create-on-first-review) — before 1.6.43 the carousel branded
// itself Yomu while rendering only Previous/Reveal/Next, so the default local
// deck could never start from the study page.
async function runKeylessLocalGrading(browser, baseUrl) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 980, height: 760 } });
    const page = await context.newPage();
    await page.route('**/api.jiten.moe/**', route => route.abort('connectionrefused'));
    await page.route('**/jpdb.io/**', route => route.abort('connectionrefused'));
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: baseSettings({ enableReviews: true, yomuLocalSrsEnabled: true }) });
    try {
        await page.goto(`${baseUrl}/newtab/index.html?persona=keyless-grading`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-newtab-prompt]', { timeout: 20_000 });
        await revealVisibleCard(page);
        const gradeButtons = await page.locator('[data-newtab-action="grade"]').count();
        assert(gradeButtons > 0, 'keyless starter card revealed but rendered no grade buttons (local SRS target missing)');
        const gradedSpelling = await page.evaluate(() => document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-card') ?? '');
        await page.locator('[data-newtab-action="grade"][data-grade="okay"], [data-newtab-action="grade"][data-grade="pass"]').first().click();
        await page.waitForFunction(() => {
            const index = window.GM_getValue('yomu:srs-local:v2:index', {});
            return Array.isArray(index.cardIds) && index.cardIds.length > 0;
        }, null, { timeout: 10_000 });
        const localDeck = await page.evaluate(() => {
            const index = window.GM_getValue('yomu:srs-local:v2:index', {});
            const cardIds = Array.isArray(index.cardIds) ? index.cardIds : [];
            return {
                version: index.version,
                cards: cardIds
                    .map(id => window.GM_getValue(`yomu:srs-local:v2:card:${encodeURIComponent(id)}`, null))
                    .filter(Boolean),
            };
        });
        assert(localDeck.version === 2, 'grade click wrote an invalid local Yomu deck index', localDeck);
        const { cards } = localDeck;
        assert(cards.length > 0, 'grade click did not create a card in the local Yomu deck');
        assert(cards.some(card => (card.reviews ?? 0) > 0), 'local deck card was created but its review was not recorded');
        return { ok: true, gradedSpelling, localDeckCards: cards.length };
    } finally {
        await context.close();
    }
}

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
        const queryStudy = [];
        for (const query of ['読み取る', 'よむ']) {
            queryStudy.push(await runQueryStudyMode(browser, fixture.origin, query, 'word'));
            queryStudy.push(await runQueryStudyMode(browser, fixture.origin, query, 'kanji'));
        }
        const mobilePassFail = await runMobilePassFailLayout(browser, fixture.origin);
        const keylessGrading = await runKeylessLocalGrading(browser, fixture.origin);
        const blockers = results.flatMap(result => result.feedback.filter(item => item.startsWith('BUG')));
        console.log(JSON.stringify({ ok: !blockers.length, results, queryStudy, mobilePassFail, keylessGrading }, null, 2));
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
