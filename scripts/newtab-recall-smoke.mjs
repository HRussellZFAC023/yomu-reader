#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    arrayParam,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    DEFAULT_ANKI_CONNECT_URL,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockAnkiConnectResponse,
    resolveAnkiAction,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const {
    root: ROOT,
    dist: DIST,
    artifacts: ARTIFACTS,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'newtab-recall', 'latest');
const SETTINGS_KEY = YOMU_SETTINGS_KEY;
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const NEW_TAB_UI_KEY = 'jpdb-reader-newtab-ui';
const REQUEST_BRIDGE_NAME = '__yomuNewtabRecallSmokeRequest';
const JITEN_API_ORIGIN = 'https://api.jiten.moe';
const BUNPRO_API_ORIGIN = 'https://api.bunpro.jp';
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_KEY = 'mock-jpdb-recall-key';
const JITEN_API_KEY = 'ak_mock-jiten-recall-key';
const BUNPRO_TOKEN = 'mock-bunpro-recall-token';
const ANKI_CARD_ID = 4404;
const ANKI_NOTE_ID = 9904;

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

const JPDB_CARD = card({
    vid: 101,
    sid: 1,
    rid: 0,
    spelling: '復習',
    reading: 'ふくしゅう',
    meanings: [{ glosses: ['review; revision'], partOfSpeech: ['vn'] }],
    partOfSpeech: ['vn'],
    sentence: '今日は復習をします。',
    source: 'jpdb',
    reviewSource: 'jpdb-api',
});
const JITEN_CARD = card({
    vid: 2402,
    sid: 0,
    rid: 0,
    spelling: '弁護士',
    reading: 'べんごし',
    meanings: [{ glosses: ['lawyer'], partOfSpeech: ['n'] }],
    partOfSpeech: ['n'],
    sentence: '弁護士に相談する。',
    source: 'jiten',
    reviewSource: 'jiten-api',
    jitenWordId: 2402,
    jitenReadingIndex: 0,
});
const ANKI_CARD = card({
    vid: -ANKI_NOTE_ID,
    sid: -ANKI_CARD_ID,
    rid: ANKI_CARD_ID,
    spelling: '学習能力',
    reading: 'がくしゅうのうりょく',
    meanings: [{ glosses: ['learning ability'], partOfSpeech: ['n'] }],
    partOfSpeech: ['n'],
    sentence: '学習能力を高める。',
    source: 'anki',
    reviewSource: 'anki',
    ankiCardId: ANKI_CARD_ID,
    ankiNoteId: ANKI_NOTE_ID,
    ankiDeckNames: ['Mining'],
    ankiModelName: 'Imported Japanese',
});
const BUNPRO_CARD = card({
    vid: -7701,
    sid: -7701,
    rid: 7701,
    spelling: '予習',
    reading: 'よしゅう',
    meanings: [{ glosses: ['preparation for a lesson'], partOfSpeech: ['n', 'vs'] }],
    partOfSpeech: ['n', 'vs'],
    sentence: '授業の前に予習する。',
    source: 'bunpro',
    reviewSource: 'bunpro-api',
    bunproReviewId: '7701',
    bunproReviewableId: 8801,
    bunproReviewableType: 'vocabulary',
});
const JITEN_FIXTURES = new Map([
    [JITEN_CARD.spelling, {
        wordId: JITEN_CARD.jitenWordId,
        readingIndex: JITEN_CARD.jitenReadingIndex,
        spelling: JITEN_CARD.spelling,
        reading: JITEN_CARD.reading,
        meaning: 'lawyer',
        knownState: ['known'],
    }],
]);

assertBuiltArtifacts([
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
], ROOT);
mkdirSync(ARTIFACT_DIR, { recursive: true });

const fixture = await startLoopbackServer(serveNewTabRequest, 'Could not bind Recall smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const scenarios = [
        {
            name: 'jpdb-correct-spelling',
            card: JPDB_CARD,
            settings: settings({ apiKey: JPDB_API_KEY, jpdbMiningEnabled: true }),
            answer: ' 復 習 ',
            grade: 'easy',
            expectedOutcome: 'Correct',
            reviewPredicate: request => request.kind === 'jpdb-review',
            assertReview: request => {
                assert(request.body.vid === JPDB_CARD.vid && request.body.sid === JPDB_CARD.sid && request.body.grade === 'easy',
                    'JPDB Recall review payload was incorrect',
                    request.body);
            },
        },
        {
            name: 'bunpro-hard-good',
            card: BUNPRO_CARD,
            settings: settings({
                newTabSource: 'bunpro',
                bunproFrontendApiToken: BUNPRO_TOKEN,
                bunproMiningEnabled: true,
                bunproDefinitionsEnabled: true,
                dictionaryLookupLinks: [{ id: 'bunpro', label: 'Bunpro', urlTemplate: 'https://bunpro.jp/search?query={query}', enabled: true }],
                newTabShortcutHintsEnabled: true,
            }),
            answer: '予習',
            grade: 'pass',
            gradeKey: '2',
            expectedOutcome: 'Correct',
            skipRecall: true,
            reviewTarget: 'bunpro',
            reviewPredicate: request => request.kind === 'bunpro-review',
            assertGradeControls: controls => {
                assert(controls.count === 2, 'Bunpro Study rendered more than Hard/Good', controls);
                assert(controls.labels.join(',') === 'Hard,Good', 'Bunpro Study labels were not Hard/Good', controls);
            },
            assertReview: request => {
                assert(request.body.grade === 'pass' && request.body.correct === true,
                    'Bunpro Good review payload was incorrect', request.body);
            },
        },
    ];
    const requestedScenario = process.env.YOMU_RECALL_SCENARIO?.trim() ?? '';
    const results = [];
    for (const scenario of scenarios.filter(item => !requestedScenario || item.name === requestedScenario)) {
        results.push(await runRecallScenario(browser, fixture.baseUrl, scenario));
    }
    const report = {
        ok: true,
        url: `${fixture.baseUrl}/newtab/index.html`,
        results,
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
} finally {
    await browser.close().catch(() => undefined);
    await fixture.close();
}

async function runRecallScenario(browser, baseUrl, scenario) {
    const uiSource = scenario.card.source === 'anki' ? 'anki' : scenario.card.source === 'bunpro' ? 'bunpro' : 'jpdb';
    const context = await browser.newContext({
        bypassCSP: true,
        serviceWorkers: 'block',
        locale: 'ja-JP',
        viewport: { width: 980, height: 760 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const requests = [];
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(String(error).slice(0, 240)));
    page.on('console', message => {
        if (message.type() === 'error' && !/^Failed to load resource:/u.test(message.text())) {
            consoleErrors.push(message.text().slice(0, 240));
        }
    });
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => mockedRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: scenario.settings,
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    await page.addInitScript(seedRecallCache, {
        cacheKey: NEW_TAB_CACHE_KEY,
        uiKey: NEW_TAB_UI_KEY,
        cache: {
            at: Date.now(),
            sourceLabel: scenario.card.source === 'anki' ? 'Anki' : scenario.card.source === 'jiten' ? 'Jiten' : scenario.card.source === 'bunpro' ? 'Bunpro' : 'JPDB',
            cards: [scenario.card],
        },
        uiState: {
            mode: 'recall',
            sort: 'frequency',
            filter: 'study',
            source: uiSource,
            revealAnswer: false,
        },
    });
    await page.route('**/*', route => handleMockedRoute(route, requests));
    try {
        await page.goto(`${baseUrl}/newtab/index.html?smoke=recall-${encodeURIComponent(scenario.name)}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab-recall-mode[data-newtab-bound="true"]', { timeout: 15_000 });
        if (!scenario.skipRecall) {
            const recallStep = page.locator('[data-study-step-kind="recall-cloze"]').first();
            await waitForVisibleWithSnapshot(page, recallStep, `${scenario.name}-recall-step`);
            if (await recallStep.getAttribute('aria-current') !== 'step') await recallStep.click();
            const input = page.locator('[data-newtab-recall-input]').first();
            await input.waitFor({ state: 'visible', timeout: 15_000 });
            await waitForVisibleWithSnapshot(page, page.locator('.jpdb-reader-newtab-recall-gap').first(), `${scenario.name}-recall-gap`);
            assert(!(await isRevealed(page)), `${scenario.name} started revealed`);

            if (scenario.precheckEmpty) {
                await page.locator('[data-newtab-recall-form] [data-newtab-action="recall-submit"]').click();
                await expectText(page, '[data-newtab-recall-result]', 'Enter an answer');
                assert(!(await isRevealed(page)), `${scenario.name} empty answer revealed the card`);
            }

            const submitted = await page.evaluate(answer => {
                const input = document.querySelector('[data-newtab-recall-input]');
                const button = document.querySelector('[data-newtab-recall-form] [data-newtab-action="recall-submit"]');
                if (!input || !button) return false;
                input.value = answer;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                button.click();
                return true;
            }, scenario.answer);
            if (!submitted) {
                await snapshotPage(page, `${scenario.name}-recall-submit-missing`);
                writeFileSync(path.join(ARTIFACT_DIR, `${scenario.name}-recall-submit-missing.requests.json`), `${JSON.stringify(requests, null, 2)}\n`);
            }
            assert(submitted, `${scenario.name} could not submit the recall input`, { requests });
        }
        await page.waitForSelector(scenario.skipRecall
            ? '[data-newtab-study][data-newtab-study-step="final-reveal"]'
            : '[data-study-step-kind="final-reveal"][aria-current="step"]', { timeout: 10_000 });
        if (scenario.skipRecall && !(await isRevealed(page))) {
            await page.locator('[data-newtab-action="reveal"]').first().click();
            await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab-revealed', { timeout: 8_000 });
        }
        assert(await isRevealed(page), `${scenario.name} did not reveal after a non-empty answer`);
        const prompt = await textContent(page, '[data-newtab-prompt]');
        const outcome = scenario.expectedOutcome;
        const expectedGradeTarget = scenario.card.source === 'anki' ? 'Grades Anki' : scenario.card.source === 'jiten' ? 'Grades Jiten' : scenario.card.source === 'bunpro' ? 'Grades Bunpro' : 'Grades JPDB';
        await ensureGradeTarget(page, expectedGradeTarget);
        const gradeControls = await page.evaluate(() => ({
            count: document.querySelectorAll('[data-newtab-action="grade"]').length,
            labels: [...document.querySelectorAll('[data-newtab-action="grade"] .jpdb-reader-newtab-grade-label')].map(node => node.textContent?.trim() ?? ''),
        }));
        scenario.assertGradeControls?.(gradeControls);
        let bunproSurface;
        if (scenario.card.source === 'bunpro') {
            await page.waitForSelector('[data-source="bunpro"]', { state: 'attached', timeout: 10_000 });
            await page.waitForSelector('[data-source="bunpro"] a.jpdb-reader-action-pill[href^="https://bunpro.jp/vocabs/"]', { state: 'attached', timeout: 10_000 });
            bunproSurface = await page.evaluate(() => {
                const source = document.querySelector('[data-source="bunpro"]');
                const pill = document.querySelector('[data-source="bunpro"] a.jpdb-reader-action-pill[href^="https://bunpro.jp/vocabs/"]');
                return {
                    definition: source?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                    lookupHref: pill?.getAttribute('href') ?? '',
                };
            });
            assert(bunproSurface.definition.includes('preparation for a lesson'), 'Bunpro Study reveal omitted its definition source', bunproSurface);
            assert(bunproSurface.lookupHref.includes('bunpro.jp'), 'Bunpro Study reveal omitted its source link', bunproSurface);
        }
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.name}.png`), fullPage: false });
        const reviewTarget = scenario.reviewTarget ?? (scenario.card.source === 'anki' ? 'anki' : scenario.card.source === 'jiten' ? 'jiten' : scenario.card.source === 'bunpro' ? 'bunpro' : 'jpdb');
        let shortcutDebug;
        if (scenario.gradeKey) {
            await page.evaluate(() => {
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            });
            await page.keyboard.press(scenario.gradeKey);
            shortcutDebug = await page.evaluate(() => {
                const root = document.querySelector('[data-jpdb-reader-root]');
                const study = document.querySelector('[data-newtab-study]');
                return {
                    rootClass: root?.className ?? '',
                    studyStep: study?.getAttribute('data-newtab-study-step') ?? '',
                    grades: [...document.querySelectorAll('[data-newtab-action="grade"]')].map(button => ({
                        grade: button.getAttribute('data-grade') ?? '',
                        disabled: button.hasAttribute('disabled'),
                        target: button.getAttribute('data-newtab-review-target') ?? '',
                        hint: button.querySelector('kbd')?.textContent ?? '',
                    })),
                    activeElement: document.activeElement?.tagName ?? '',
                };
            });
        } else {
            const gradeButton = page.locator(`[data-newtab-action="grade"][data-grade="${scenario.grade}"][data-newtab-review-target="${reviewTarget}"]`).first();
            if (await gradeButton.count()) await gradeButton.click();
            else await page.locator(`[data-newtab-action="grade"][data-grade="${scenario.grade}"]`).click();
        }
        const review = await waitForRequest(requests, scenario.reviewPredicate, 8_000);
        assert(review, `${scenario.name} did not submit a provider review`, { requests, shortcutDebug });
        scenario.assertReview(review);
        assert(consoleErrors.length === 0, `${scenario.name} logged browser errors`, { consoleErrors });
        return {
            name: scenario.name,
            prompt,
            outcome,
            gradeControls,
            gradeInput: scenario.gradeKey ? `keyboard:${scenario.gradeKey}` : 'button',
            shortcutDebug,
            bunproSurface,
            review,
            requests: summarizeRequests(requests),
        };
    } finally {
        await context.close().catch(() => undefined);
    }
}

async function waitForVisibleWithSnapshot(page, locator, label) {
    try {
        await locator.waitFor({ state: 'visible', timeout: 15_000 });
    } catch (error) {
        const debug = await page.evaluate(() => ({
            rootClass: document.querySelector('[data-jpdb-reader-root]')?.className ?? '',
            prompt: document.querySelector('[data-newtab-prompt]')?.textContent ?? '',
            study: {
                text: document.querySelector('[data-newtab-study]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                step: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-step') ?? '',
                flow: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-flow') ?? '',
            },
            steps: Array.from(document.querySelectorAll('[data-study-step-kind]')).map(step => ({
                kind: step.getAttribute('data-study-step-kind'),
                active: step.getAttribute('data-active'),
                text: step.textContent?.replace(/\s+/g, ' ').trim(),
            })),
            status: document.querySelector('[data-newtab-status]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        }));
        writeFileSync(path.join(ARTIFACT_DIR, `${label}.debug.json`), `${JSON.stringify(debug, null, 2)}\n`);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${label}.png`), fullPage: true }).catch(() => undefined);
        throw error;
    }
}

async function snapshotPage(page, label) {
    const debug = await page.evaluate(() => ({
        rootClass: document.querySelector('[data-jpdb-reader-root]')?.className ?? '',
        prompt: document.querySelector('[data-newtab-prompt]')?.textContent ?? '',
        answer: document.querySelector('[data-newtab-answer]')?.textContent ?? '',
        study: {
            text: document.querySelector('[data-newtab-study]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            step: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-step') ?? '',
            flow: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-flow') ?? '',
        },
        inputs: document.querySelectorAll('[data-newtab-recall-input]').length,
        forms: document.querySelectorAll('[data-newtab-recall-form]').length,
        steps: Array.from(document.querySelectorAll('[data-study-step-kind]')).map(step => ({
            kind: step.getAttribute('data-study-step-kind'),
            active: step.getAttribute('data-active'),
            text: step.textContent?.replace(/\s+/g, ' ').trim(),
        })),
        status: document.querySelector('[data-newtab-status]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }));
    writeFileSync(path.join(ARTIFACT_DIR, `${label}.debug.json`), `${JSON.stringify(debug, null, 2)}\n`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${label}.png`), fullPage: true }).catch(() => undefined);
}

async function ensureGradeTarget(page, expectedLabel) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const label = await textContent(page, '[data-newtab-grade-target-text]').catch(() => '');
        if (label.includes(expectedLabel)) return;
        const toggle = page.locator('[data-action="grade-provider-toggle"]').first();
        if (await toggle.count() === 0) break;
        await toggle.click();
        await page.waitForTimeout(150);
    }
    await expectText(page, '[data-newtab-grade-target-text]', expectedLabel);
}

function serveNewTabRequest(request, response) {
    const route = staticRoute(request.url);
    if (!route || !existsSync(route[0])) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    serveFile(response, route[0], route[1], request.method ?? 'GET');
}

function staticRoute(requestUrl) {
    const url = new URL(requestUrl ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return STATIC_ROUTES.get(pathname);
}

async function handleMockedRoute(route, requests) {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS' && isMockedOrigin(url)) {
        await route.fulfill({ status: 204, headers: corsHeaders() });
        return;
    }
    const mocked = mockedRequest({
        method: request.method(),
        url: request.url(),
        headers: Object.fromEntries(Object.entries(request.headers()).map(([key, value]) => [key.toLowerCase(), value])),
        data: request.postData() ?? '',
    }, requests);
    if (!mocked) {
        await route.continue();
        return;
    }
    await route.fulfill({
        status: mocked.status ?? 200,
        headers: { ...corsHeaders(), ...(mocked.headers ?? {}) },
        contentType: mocked.contentType,
        body: mocked.responseText ?? mocked.body ?? '',
    });
}

function mockedRequest(request, requests) {
    const url = new URL(request.url);
    if (url.origin === JPDB_API_ORIGIN) return mockedJpdbRequest(url, request, requests);
    if (url.origin === JITEN_API_ORIGIN) return mockedJitenRequest(url, request, requests);
    if (url.origin === BUNPRO_API_ORIGIN) return mockedBunproRequest(url, request, requests);
    if (url.href === DEFAULT_ANKI_CONNECT_URL || url.origin === new URL(DEFAULT_ANKI_CONNECT_URL).origin) {
        return mockedAnkiRequest(request, requests);
    }
    return null;
}

function mockedBunproRequest(url, request, requests) {
    assertApiAuth(request, 'Bearer ', BUNPRO_TOKEN, 'Bunpro');
    const pathname = url.pathname.replace(/^\/api\/frontend\/?/, '');
    if (pathname === 'reviews/quiz_index') {
        requests.push({ kind: 'bunpro-queue' });
        return jsonHttpResponse({
            review_session_id: 55,
            total_pending_attempt_count: 1,
            total_pending_wrapup_count: 0,
            pending_wrapup: [],
            pending_attempt: [{
                data: { id: BUNPRO_CARD.bunproReviewId, type: 'review', attributes: { id: Number(BUNPRO_CARD.bunproReviewId), reviewable_id: BUNPRO_CARD.bunproReviewableId, reviewable_type: 'Vocab', next_review: new Date().toISOString() } },
                included: [{ id: String(BUNPRO_CARD.bunproReviewableId), type: 'vocab', attributes: { id: BUNPRO_CARD.bunproReviewableId, title: BUNPRO_CARD.spelling, kana: BUNPRO_CARD.reading, furigana: BUNPRO_CARD.reading, slug: BUNPRO_CARD.spelling, meaning: BUNPRO_CARD.meanings[0].glosses[0] } }],
            }],
        });
    }
    if (/^reviews\/\d+\/update$/u.test(pathname)) {
        const body = readRequestJson(request.data);
        requests.push({ kind: 'bunpro-review', body });
        return jsonHttpResponse({});
    }
    if (pathname === 'search/reviewables_v1_1') {
        requests.push({ kind: 'bunpro-search' });
        return jsonHttpResponse({ grammar_points: { data: [] }, vocabs: { data: [{ id: String(BUNPRO_CARD.bunproReviewableId), attributes: { id: BUNPRO_CARD.bunproReviewableId, title: BUNPRO_CARD.spelling, kana: BUNPRO_CARD.reading, slug: BUNPRO_CARD.spelling, meaning: BUNPRO_CARD.meanings[0].glosses[0] } }] } });
    }
    if (pathname === 'user/due') return jsonHttpResponse({ total_due_grammar: 0, total_due_vocab: 1 });
    if (pathname === 'user_stats/base_stats') return jsonHttpResponse({ facts: {} });
    throw new Error(`Unexpected Bunpro Recall request: ${request.method} ${url.href}`);
}

function mockedJpdbRequest(url, request, requests) {
    assertApiAuth(request, 'Bearer ', JPDB_API_KEY, 'JPDB');
    const endpoint = url.pathname.replace(/^\/api\/v1\/?/, '');
    const body = readRequestJson(request.data);
    if (endpoint === 'review') {
        requests.push({ kind: 'jpdb-review', body });
        return jsonHttpResponse({});
    }
    if (endpoint === 'list-user-decks') {
        requests.push({ kind: 'jpdb-list-user-decks', body });
        return jsonHttpResponse({ decks: [[7, 'Recall smoke', 1, 0]] });
    }
    if (endpoint === 'deck/list-vocabulary') {
        const reviewed = requests.some(item => item.kind === 'jpdb-review');
        requests.push({ kind: 'jpdb-list-vocabulary', body });
        return jsonHttpResponse({ vocabulary: reviewed ? [] : [[JPDB_CARD.vid, JPDB_CARD.sid]] });
    }
    if (endpoint === 'lookup-vocabulary') {
        requests.push({ kind: 'jpdb-lookup-vocabulary', body });
        return jsonHttpResponse({ vocabulary_info: [jpdbVocabularyTuple()] });
    }
    throw new Error(`Unexpected JPDB Recall request: ${request.method} ${url.href}`);
}

function mockedJitenRequest(url, request, requests) {
    assertApiAuth(request, 'ApiKey ', JITEN_API_KEY, 'Jiten');
    const pathname = url.pathname.replace(/^\/api\/?/, '');
    if (pathname === 'srs/review') {
        const body = readRequestJson(request.data);
        requests.push({ kind: 'jiten-review', body });
        return jsonHttpResponse({});
    }
    if (pathname === 'reader/parse') {
        const body = readRequestJson(request.data);
        requests.push({ kind: 'jiten-parse', body });
        return jsonHttpResponse(jitenParseResponse(body));
    }
    if (pathname === 'reader/ping') {
        requests.push({ kind: 'jiten-ping' });
        return jsonHttpResponse({});
    }
    throw new Error(`Unexpected Jiten Recall request: ${request.method} ${url.href}`);
}

function mockedAnkiRequest(request, requests) {
    const body = readRequestJson(request.data);
    requests.push({ kind: 'anki', action: body.action, params: body.params ?? {} });
    return jsonHttpResponse(mockAnkiConnectResponse(body, (action, params) => resolveAnkiAction(action, params, ANKI_HANDLERS)));
}

const ANKI_HANDLERS = {
    version: () => 6,
    deckNames: () => ['Mining'],
    getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 1 } }),
    getDecks: params => ({ Mining: arrayParam(params.cards) }),
    findCards: () => [ANKI_CARD_ID],
    findNotes: () => [],
    notesInfo: () => [],
    cardsInfo: params => arrayParam(params.cards).map(cardId => mockAnkiCardInfo(Number(cardId))),
    areDue: params => arrayParam(params.cards).map(() => true),
    getDeckConfig: () => ({ new: { delays: [1, 10], ints: [1, 4] } }),
    answerCards: () => null,
};

function seedRecallCache({ cacheKey, uiKey, cache, uiState }) {
    localStorage.setItem(cacheKey, JSON.stringify(cache));
    localStorage.setItem(uiKey, JSON.stringify(uiState));
}

function settings(overrides = {}) {
    return {
        onboardingSeen: true,
        newTabEnabled: true,
        newTabOfflineEnabled: true,
        newTabOfflineLimit: 10,
        interfaceLanguage: 'en',
        apiKey: '',
        jitenApiKey: '',
        bunproFrontendApiToken: '',
        bunproFrontendApiTokenExpiresAt: '',
        bunproMiningEnabled: false,
        jpdbMiningEnabled: false,
        enableReviews: true,
        newTabSource: 'jpdb',
        newTabAnkiEnabled: false,
        ankiEnabled: false,
        ankiConnectUrl: DEFAULT_ANKI_CONNECT_URL,
        ankiDeck: 'Mining',
        ankiModel: 'Imported Japanese',
        yomuLocalSrsEnabled: false,
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: true,
        newTabStudyDisabledSteps: ['kanji-doodle', 'word', 'listen-pitch', 'speaking'],
        newTabStudyTourSeen: true,
        immersionKitEnabled: false,
        localDictionariesEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        audioEnabled: false,
        autoPlayAudio: false,
        showPitchAccent: false,
        enableLogging: Boolean(process.env.SMOKE_DEBUG),
        ...overrides,
    };
}

function card(overrides = {}) {
    return {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: 1000,
        partOfSpeech: ['v5m'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        ...overrides,
    };
}

function jpdbVocabularyTuple() {
    return [
        JPDB_CARD.vid,
        JPDB_CARD.sid,
        0,
        JPDB_CARD.spelling,
        JPDB_CARD.reading,
        JPDB_CARD.frequencyRank,
        JPDB_CARD.partOfSpeech,
        JPDB_CARD.meanings.map(meaning => meaning.glosses),
        JPDB_CARD.meanings.map(meaning => meaning.partOfSpeech),
        JPDB_CARD.cardState,
        [],
        null,
        JPDB_CARD.sentence,
    ];
}

function jitenParseResponse(body) {
    const texts = Array.isArray(body.text) ? body.text.map(String) : [];
    const vocabularyByKey = new Map();
    const tokens = texts.map(text => {
        const fixture = JITEN_FIXTURES.get(text);
        if (!fixture) return [];
        const key = `${fixture.wordId}:${fixture.readingIndex}`;
        vocabularyByKey.set(key, {
            wordId: fixture.wordId,
            readingIndex: fixture.readingIndex,
            spelling: fixture.spelling,
            reading: fixture.reading,
            frequencyRank: 250,
            partsOfSpeech: ['n'],
            meaningsChunks: [[fixture.meaning]],
            meaningsPartOfSpeech: [['n']],
            knownState: fixture.knownState,
            pitchAccents: [],
            sentence: JITEN_CARD.sentence,
        });
        return [{ wordId: fixture.wordId, readingIndex: fixture.readingIndex, start: 0, end: fixture.spelling.length, length: fixture.spelling.length }];
    });
    return { vocabulary: Array.from(vocabularyByKey.values()), tokens };
}

function mockAnkiCardInfo(cardId) {
    return {
        cardId,
        note: ANKI_NOTE_ID,
        deckName: 'Mining',
        queue: 2,
        type: 2,
        due: 1,
        reps: 3,
        lapses: 0,
        interval: 7,
        factor: 2500,
        fields: {},
        question: ANKI_CARD.spelling,
        answer: firstGloss(ANKI_CARD),
    };
}

function firstGloss(targetCard) {
    return targetCard.meanings?.[0]?.glosses?.[0] ?? '';
}

function isMockedOrigin(url) {
    return url.origin === JPDB_API_ORIGIN
        || url.origin === JITEN_API_ORIGIN
        || url.origin === BUNPRO_API_ORIGIN
        || url.origin === new URL(DEFAULT_ANKI_CONNECT_URL).origin;
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, accept',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

function assertApiAuth(request, prefix, expectedKey, label) {
    const headers = request.headers ?? {};
    const auth = headers.authorization ?? headers.Authorization ?? '';
    assert(auth === `${prefix}${expectedKey}`, `${label} Recall smoke used the wrong API key`, { auth });
}

function readRequestJson(data) {
    if (!data) return {};
    if (typeof data === 'string') return JSON.parse(data);
    if (data.kind === 'arraybuffer') return JSON.parse(Buffer.from(data.bytes ?? []).toString('utf8'));
    return data;
}

async function expectText(page, selector, expected) {
    try {
        await page.waitForFunction(({ selector: targetSelector, expected: targetText }) => {
            return document.querySelector(targetSelector)?.textContent?.includes(targetText);
        }, { selector, expected }, { timeout: 10_000 });
    } catch (error) {
        const actual = await textContent(page, selector).catch(() => '<unavailable>');
        throw new Error(`Expected ${selector} to contain ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, { cause: error });
    }
}

async function isRevealed(page) {
    return page.locator('[data-jpdb-reader-root].jpdb-reader-newtab-revealed').count().then(count => count > 0);
}

async function waitForRequest(requests, predicate, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const match = requests.find(predicate);
        if (match) return match;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
}

function textContent(page, selector) {
    return page.locator(selector).first().textContent().then(value => value?.replace(/\s+/g, ' ').trim() ?? '');
}

function summarizeRequests(requests) {
    return requests.map(request => request.kind === 'anki'
        ? { kind: request.kind, action: request.action }
        : { kind: request.kind });
}
