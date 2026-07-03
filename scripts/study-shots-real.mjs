#!/usr/bin/env node
// Docs screenshots of the REAL new-tab study flow. Serves the built newtab,
// seeds a full-featured card (kanji + sentence + pitch) through the same
// GM-bridge + card-cache + jpdb-mock path the recall smoke uses, walks the
// session stepper in the live page, and captures each step at desktop (docs)
// and mobile (QA evidence) viewports. Replaces the old jsdom skeleton
// renderer, whose captures misrepresented the shipped layout (missing shell
// constraints made the study card look broken). All four steps must render —
// a missing step or missing step UI fails the run rather than skipping.
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
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

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const OUT_DOCS = path.join(ROOT, 'docs', 'public', 'screenshots');
const OUT_QA = path.join(ARTIFACTS, 'study-shots-real', 'latest');
mkdirSync(OUT_QA, { recursive: true });

const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_KEY = 'mock-study-shots-key';
const REQUEST_BRIDGE_NAME = '__yomuStudyShotsRequest';

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

const SETTINGS = {
    onboardingSeen: true,
    newTabEnabled: true,
    interfaceLanguage: 'en',
    apiKey: JPDB_API_KEY,
    jitenApiKey: '',
    jpdbMiningEnabled: true,
    enableReviews: true,
    newTabSource: 'jpdb',
    newTabStudyTourSeen: true,
    newTabStudyDisabledSteps: [],
    newTabFrontSentenceEnabled: true,
    showPitchAccent: true,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    localDictionariesEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

const STATIC_ROUTES = new Map([
    ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
    ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/version.json', [path.join(NEWTAB_DIR, 'version.json'), 'application/json; charset=utf-8']],
    ['/newtab/manifest.webmanifest', [path.join(NEWTAB_DIR, 'manifest.webmanifest'), 'application/manifest+json']],
    ['/yomu-icon.svg', [path.join(DIST, 'yomu-icon.svg'), 'image/svg+xml']],
    ['/favicon-32x32.png', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
]);

const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
];

// Only recall + pitch are referenced by docs/features.md and
// docs/tools/study-page.md; kanji + reveal captures stay QA-only evidence.
// The kanji step is already active on load (first step of the session) and is
// captured WITHOUT clicking its chip — the chip click navigates into the
// synthetic per-kanji study card (jpdb kanji parity), a different surface.
const STEP_SHOTS = [
    { id: 'kanji-doodle', file: 'real-newtab-kanji.png', docs: false, hint: true, click: false, requires: '.jpdb-reader-doodle-canvas' },
    { id: 'recall-cloze', file: 'real-newtab.png', docs: true, hint: false, click: true, requires: '[data-newtab-recall-input]' },
    { id: 'listen-pitch', file: 'study-pitch-select.png', docs: true, hint: false, click: true, requires: '[data-newtab-action="listen-pick"]' },
    { id: 'final-reveal', file: 'real-newtab-reveal.png', docs: false, hint: false, click: true, requires: '[data-newtab-action="grade"]' },
];

// Playwright's visibility ignores opacity, which let an opacity-0 recall input
// pass the recall smoke — assert the element is actually opaque on screen.
async function isOpaquelyRendered(page, selector) {
    return page.evaluate(target => {
        const element = document.querySelector(target);
        if (!element) return false;
        const box = element.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) return false;
        for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.9) return false;
        }
        return true;
    }, selector);
}

assertBuiltArtifacts([
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
], ROOT);

const server = await startLoopbackServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = STATIC_ROUTES.get(url.pathname.replace(/\/+$/, '') || '/');
    if (!route || !existsSync(route[0])) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    serveFile(response, route[0], route[1], request.method ?? 'GET');
}, 'Could not bind study-shots server');

// The card loader validates the seeded queue against jpdb before rendering it;
// blanket 503s here made it fall back to starter practice words (the old
// harness bug), so serve the same fixtures the recall smoke uses. Only the
// authenticated /api/v1 endpoints are strict — the page also fires public
// scrape GETs (/kanji/…, /search) that just get empty bodies.
function mockedRequest(request) {
    const url = new URL(request.url);
    if (url.origin !== JPDB_API_ORIGIN) return null;
    if (!url.pathname.startsWith('/api/v1/')) return jsonHttpResponse({});
    const auth = request.headers?.authorization ?? request.headers?.Authorization ?? '';
    if (auth !== `Bearer ${JPDB_API_KEY}`) throw new Error(`study-shots used the wrong JPDB key: ${auth}`);
    const endpoint = url.pathname.replace(/^\/api\/v1\/?/, '');
    if (endpoint === 'review') return jsonHttpResponse({});
    if (endpoint === 'list-user-decks') return jsonHttpResponse({ decks: [[7, 'Docs shots', 1, 0]] });
    if (endpoint === 'deck/list-vocabulary') return jsonHttpResponse({ vocabulary: [[CARD.vid, CARD.sid]] });
    if (endpoint === 'lookup-vocabulary') {
        return jsonHttpResponse({
            vocabulary_info: [[
                CARD.vid, CARD.sid, 0, CARD.spelling, CARD.reading, CARD.frequencyRank,
                CARD.partOfSpeech,
                CARD.meanings.map(meaning => meaning.glosses),
                CARD.meanings.map(meaning => meaning.partOfSpeech),
                CARD.cardState, CARD.pitchAccent, null, CARD.sentence,
            ]],
        });
    }
    return jsonHttpResponse({});
}

async function handleMockedRoute(route) {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (request.method() === 'OPTIONS' && url.origin === JPDB_API_ORIGIN) {
        return route.fulfill({ status: 204, headers: corsHeaders() });
    }
    const mocked = mockedRequest({
        method: request.method(),
        url: request.url(),
        headers: Object.fromEntries(Object.entries(request.headers()).map(([key, value]) => [key.toLowerCase(), value])),
    });
    if (!mocked) return route.abort('internetdisconnected');
    return route.fulfill({
        status: mocked.status ?? 200,
        headers: { ...corsHeaders(), ...(mocked.headers ?? {}) },
        contentType: mocked.contentType,
        body: mocked.responseText ?? mocked.body ?? '',
    });
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, accept',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

function seedCache({ cacheKey, uiKey, cache, uiState }) {
    localStorage.setItem(cacheKey, JSON.stringify(cache));
    localStorage.setItem(uiKey, JSON.stringify(uiState));
}

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const failures = [];

try {
    for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
            bypassCSP: true,
            serviceWorkers: 'block',
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        await page.exposeFunction(REQUEST_BRIDGE_NAME, request => mockedRequest(request) ?? jsonHttpResponse({}));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: SETTINGS,
            requestBridgeName: REQUEST_BRIDGE_NAME,
        });
        await page.addInitScript(seedCache, {
            cacheKey: 'jpdb-reader-newtab-card-cache',
            uiKey: 'jpdb-reader-newtab-ui',
            cache: { at: Date.now(), sourceLabel: 'JPDB', cards: [CARD] },
            uiState: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        await page.route('**/*', handleMockedRoute);
        await page.goto(`${server.baseUrl}/newtab/index.html?shots=${viewport.name}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root][data-newtab-bound="true"]', { timeout: 20_000 });
        await page.waitForSelector('[data-study-step-id]', { timeout: 20_000 });
        // The seeded card must survive the jpdb refresh — a starter-word
        // fallback (no pitch, so no listen step) would silently screenshot the
        // wrong session. The answer kanji itself stays hidden pre-reveal, so
        // the listen chip + a due count of 1 are the seeded-card markers. The
        // queue briefly flaps to an empty fallback while the refresh is in
        // flight, so wait for the settled state, not the first render.
        await page.waitForFunction(() => {
            const due = /Due\s*1/.test(document.querySelector('[data-newtab-count]')?.textContent ?? '');
            return due && Boolean(document.querySelector('[data-study-step-id="listen-pitch"]'));
        }, null, { timeout: 20_000 });
        await page.waitForTimeout(800);

        for (const shot of STEP_SHOTS) {
            await page.waitForSelector('[data-study-step-id="listen-pitch"]', { timeout: 10_000 }).catch(() => {});
            const chip = page.locator(`[data-study-step-id^="${shot.id}"]`).first();
            if (await chip.count() === 0) {
                failures.push(`${shot.id} (${viewport.name}): step chip missing from session`);
                continue;
            }
            if (shot.click) await chip.click();
            else if (await chip.getAttribute('aria-current') !== 'step') {
                failures.push(`${shot.id} (${viewport.name}): expected the step active on load`);
                continue;
            }
            await page.waitForTimeout(700);
            if (shot.hint) await page.locator('[data-newtab-action="study-hint"]').first().click({ timeout: 3_000 }).catch(() => {});
            await page.waitForTimeout(300);
            if (!await isOpaquelyRendered(page, shot.requires)) {
                failures.push(`${shot.id} (${viewport.name}): step UI missing or invisible (${shot.requires})`);
                continue;
            }
            if (await page.locator('[data-study-step-id="listen-pitch"]').count() === 0) {
                failures.push(`${shot.id} (${viewport.name}): session flapped to a fallback card before capture`);
                continue;
            }
            // Transient toasts (e.g. audio-disabled notice) are not part of the
            // step UI being documented.
            await page.evaluate(() => document.querySelectorAll('.jpdb-reader-toast').forEach(toast => toast.remove()));
            const qaPath = path.join(OUT_QA, `${viewport.name}-${shot.file}`);
            await page.screenshot({ path: qaPath, fullPage: false });
            if (shot.docs && viewport.name === 'desktop') {
                await page.screenshot({ path: path.join(OUT_DOCS, shot.file), fullPage: false });
            }
            console.log(`SHOT ${shot.id} (${viewport.name}) -> ${qaPath}`);
        }
        await context.close();
    }
} finally {
    await browser.close();
    await server.close();
}

if (failures.length) {
    console.error(`study-shots-real FAILED:\n${failures.map(item => `  - ${item}`).join('\n')}`);
    process.exit(1);
}
console.log('study-shots-real complete');
