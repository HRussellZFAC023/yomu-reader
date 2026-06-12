#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import { createJitenStudyBatchCard } from './fixtures/jiten-fixtures.mjs';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
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
const SETTINGS_KEY = YOMU_SETTINGS_KEY;
const BUILT_ARTIFACTS = [
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
    path.join(NEWTAB_DIR, 'sw.js'),
];

const JITEN_API_ORIGIN = 'https://api.jiten.moe';
const JPDB_API_ORIGIN = 'https://jpdb.io';
const MOCK_JITEN_API_KEY = 'mock-jiten-key';
const MOCK_JPDB_API_KEY = 'mock-jpdb-key';
const REQUEST_BRIDGE_NAME = '__yomuJitenNewtabSmokeRequest';
const STATIC_NEW_TAB_ROUTES = new Map([
    ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
    ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
    ['/yomu-icon.svg', [path.join(DIST, 'yomu-icon.svg'), 'image/svg+xml']],
    ['/favicon-32x32.png', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
]);
const JITEN_REQUEST_HANDLERS = new Map([
    ['GET srs/study-batch', handleJitenStudyBatch],
    ['POST srs/review', handleJitenReview],
]);
const JPDB_REQUEST_HANDLERS = new Map([
    ['list-user-decks', handleJpdbListUserDecks],
    ['deck/list-vocabulary', handleJpdbListVocabulary],
    ['lookup-vocabulary', handleJpdbLookupVocabulary],
    ['review', handleJpdbReview],
]);

function createNewTabFixtureServer() {
    return startLoopbackServer(serveNewTabFixtureRequest, 'Could not bind Jiten new-tab smoke server');
}

function serveNewTabFixtureRequest(request, response) {
    const route = staticNewTabRoute(request.url);
    if (!route || !existsSync(route[0])) return serveNotFound(response);
    serveFile(response, route[0], route[1], request.method ?? 'GET');
}

function staticNewTabRoute(requestUrl) {
    const url = new URL(requestUrl ?? '/', 'http://127.0.0.1');
    return STATIC_NEW_TAB_ROUTES.get(normalizedStaticRoutePath(url));
}

function normalizedStaticRoutePath(url) {
    return url.pathname.replace(/\/+$/, '') || '/';
}

function serveNotFound(response) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function createSettings(overrides = {}) {
    return {
        onboardingSeen: true,
        newTabEnabled: true,
        interfaceLanguage: 'en',
        apiKey: '',
        jitenApiKey: MOCK_JITEN_API_KEY,
        jpdbMiningEnabled: true,
        enableReviews: true,
        newTabSource: 'jpdb',
        newTabJpdbDeck: 'all',
        newTabJpdbReviewMode: 'api-vocabulary',
        newTabAnkiEnabled: false,
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: false,
        immersionKitEnabled: false,
        localDictionariesEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        audioEnabled: false,
        enableLogging: Boolean(process.env.SMOKE_DEBUG),
        ...overrides,
    };
}

async function installNewTabPage(browser, fixture, settings, requests) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 980, height: 760 } });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', m => console.error('[console]', m.type(), m.text().slice(0, 240)));
        page.on('pageerror', e => console.error('[pageerror]', e.message.slice(0, 240)));
    }
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => mockedApiRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: settings,
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    await routeMockedApiRequests(page, requests);
    await page.goto(`${fixture.baseUrl}/newtab/index.html?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-newtab-prompt]', { timeout: 15_000 });
    return { context, page };
}

async function routeMockedApiRequests(page, requests) {
    await page.route('**/*', route => handleMockedApiRoute(route, requests));
}

async function handleMockedApiRoute(route, requests) {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS' && isMockedApiUrl(url)) {
        await route.fulfill({ status: 204, headers: corsHeaders() });
        return;
    }
    const mocked = mockedApiRequest(routeRequestSnapshot(request), requests);
    if (!mocked) {
        await route.continue();
        return;
    }
    await fulfillMockedRoute(route, mocked);
}

function routeRequestSnapshot(request) {
    return {
        method: request.method(),
        url: request.url(),
        headers: Object.fromEntries(Object.entries(request.headers()).map(([key, value]) => [key.toLowerCase(), value])),
        data: request.postData() ?? '',
    };
}

async function fulfillMockedRoute(route, mocked) {
    await route.fulfill(mockedRouteResponse(mocked));
}

function mockedRouteResponse(mocked) {
    return {
        status: mocked.status ?? 200,
        headers: mockedRouteHeaders(mocked),
        contentType: mocked.contentType,
        body: mockedRouteBody(mocked),
    };
}

function mockedRouteHeaders(mocked) {
    return { ...corsHeaders(), ...(mocked.headers ?? {}) };
}

function mockedRouteBody(mocked) {
    return mocked.responseText ?? mocked.body ?? '';
}

function isMockedApiUrl(url) {
    return url.origin === JITEN_API_ORIGIN || url.origin === JPDB_API_ORIGIN;
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, accept',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

function mockedApiRequest(request, requests) {
    try {
        return mockedApiRequestInner(request, requests);
    } catch (error) {
        if (process.env.SMOKE_DEBUG) console.error('[mock-error]', request.method, request.url, String(error).slice(0, 200));
        throw error;
    }
}

function mockedApiRequestInner(request, requests) {
    const url = new URL(request.url);
    if (url.origin === JITEN_API_ORIGIN) return mockedJitenRequest(url, request, requests);
    if (url.origin === JPDB_API_ORIGIN) return mockedJpdbRequest(url, request, requests);
    return null;
}

function mockedJitenRequest(url, request, requests) {
    assertApiAuth(request, 'ApiKey ', MOCK_JITEN_API_KEY, 'Jiten');
    const pathname = url.pathname.replace(/^\/api\/?/, '');
    const handler = JITEN_REQUEST_HANDLERS.get(`${request.method} ${pathname}`) ?? jitenPingHandler(pathname);
    if (handler) return handler(url, request, requests);
    throw new Error(`Unexpected Jiten request: ${request.method} ${url.href}`);
}

function mockedJpdbRequest(url, request, requests) {
    assertApiAuth(request, 'Bearer ', MOCK_JPDB_API_KEY, 'JPDB');
    if (request.method !== 'POST') throw new Error(`Unexpected JPDB method: ${request.method} ${url.href}`);
    const endpoint = url.pathname.replace(/^\/api\/v1\/?/, '');
    const handler = JPDB_REQUEST_HANDLERS.get(endpoint);
    if (handler) return handler(readRequestJson(request.data), requests);
    throw new Error(`Unexpected JPDB request: ${request.method} ${url.href}`);
}

function handleJitenStudyBatch(url, _request, requests) {
    // Stateful like the real API: a card that has been reviewed leaves the
    // due batch, so post-grade queue refreshes do not resurrect it.
    const reviewed = requests.some(item => item.kind === 'jiten-review');
    requests.push({ kind: 'jiten-study-batch', limit: url.searchParams.get('limit') });
    return jsonHttpResponse(reviewed ? { ...jitenStudyBatchResponse(), cards: [] } : jitenStudyBatchResponse());
}

function handleJitenReview(_url, request, requests) {
    const body = readRequestJson(request.data);
    requests.push({ kind: 'jiten-review', body });
    return jsonHttpResponse({});
}

function handleJitenPing(_url, _request, requests) {
    requests.push({ kind: 'jiten-ping' });
    return jsonHttpResponse({});
}

function jitenPingHandler(pathname) {
    return pathname === 'reader/ping' ? handleJitenPing : undefined;
}

function handleJpdbListUserDecks(body, requests) {
    // The 'all' deck selection unions the listed user decks ('all' is not a
    // real JPDB API deck id), so the smoke account exposes one deck.
    requests.push({ kind: 'jpdb-list-user-decks', body });
    return jsonHttpResponse({ decks: [[7, 'Smoke deck', 1, 0]] });
}

function handleJpdbListVocabulary(body, requests) {
    const reviewed = requests.some(item => item.kind === 'jpdb-review');
    requests.push({ kind: 'jpdb-list-vocabulary', body });
    return jsonHttpResponse({ vocabulary: reviewed ? [] : [[101, 1]] });
}

function handleJpdbLookupVocabulary(body, requests) {
    requests.push({ kind: 'jpdb-lookup-vocabulary', body });
    return jsonHttpResponse({ vocabulary_info: [jpdbVocabularyTuple()] });
}

function handleJpdbReview(body, requests) {
    requests.push({ kind: 'jpdb-review', body });
    return jsonHttpResponse({});
}

function assertApiAuth(request, prefix, expectedKey, label) {
    const headers = request.headers ?? {};
    const auth = headers.authorization ?? headers.Authorization ?? '';
    assert(String(auth).startsWith(prefix), `${label} smoke request did not include the expected auth scheme`);
    assert(auth === `${prefix}${expectedKey}`, `${label} smoke request used the wrong API key`, { auth });
}

function readRequestJson(data) {
    if (!data) return {};
    if (typeof data === 'string') return JSON.parse(data);
    if (data.kind === 'arraybuffer') return readArrayBufferRequestJson(data);
    return data;
}

function readArrayBufferRequestJson(data) {
    return JSON.parse(Buffer.from(data.bytes ?? []).toString('utf8'));
}

function jitenStudyBatchResponse() {
    return {
        sessionId: 'smoke-session',
        cards: [createJitenStudyBatchCard({
            sourceDeckName: 'Smoke deck',
        })],
        newCardsRemaining: 1,
        reviewsRemaining: 1,
        newCardsToday: 0,
        reviewsToday: 1,
    };
}

function jpdbVocabularyTuple() {
    return [
        101,
        1,
        0,
        '復習',
        'ふくしゅう',
        1500,
        ['vn'],
        [['review; revision']],
        [['vn']],
        ['due'],
        ['LHH'],
        1700000000,
    ];
}

async function runJitenOnlySmoke(browser, fixture) {
    const requests = [];
    const { context, page } = await installNewTabPage(browser, fixture, createSettings(), requests);
    try {
        await expectText(page, '[data-newtab-prompt]', '日本語');
        await expectText(page, '[data-newtab-status]', 'Jiten');
        await expectText(page, '[data-newtab-count]', 'Left 1');
        await assertStatusLight(page, 'jiten');
        assertRequestCount(requests, 'jiten-study-batch', 1);
        assertAllRequests(requests, 'jiten-study-batch', request => request.limit === '180', 'Jiten-only smoke used an unexpected study-batch limit');
        assertNoRequests(requests, request => String(request.kind).startsWith('jpdb-'), 'Jiten-only smoke unexpectedly called JPDB');
        await page.click('[data-newtab-action="reveal"]');
        await expectText(page, '[data-newtab-grade-target-text]', 'Grades Jiten');
        assertRequestCount(requests, 'jiten-review', 0);
        await screenshot(page, 'jiten-newtab-jiten-only.png');
        // Failed-card loop: a failing grade submits a review but requeues the
        // card client-side, so the same prompt comes straight back.
        await page.click('[data-newtab-action="grade"][data-grade="nothing"]');
        const failedReview = await waitForRequest(requests, item => item.kind === 'jiten-review', 8_000);
        assert(failedReview, 'Failed Jiten review request was not submitted', { requests });
        assert(failedReview.body.rating === 1, 'Failed Jiten review should submit rating 1', failedReview.body);
        await expectText(page, '[data-newtab-prompt]', '日本語');
        // Undo affordance appears once a Jiten review has been graded.
        await page.waitForSelector('[data-newtab-action="undo-review"]', { timeout: 8_000 });
        await page.click('[data-newtab-action="reveal"]');
        await page.click('[data-newtab-action="grade"][data-grade="okay"]');
        const review = await waitForRequest(requests, item => item.kind === 'jiten-review' && item.body.rating === 3, 8_000);
        assert(review, 'Passing Jiten review request was not submitted', { requests });
        assert(review.body.wordId === 42 && review.body.readingIndex === 2 && review.body.rating === 3, 'Jiten review request body was incorrect', review.body);
        assertRequestCount(requests, 'jiten-review', 2);
        return { prompt: await textContent(page, '[data-newtab-prompt]'), review: review.body };
    } finally {
        await context.close();
    }
}

async function runJpdbOnlySmoke(browser, fixture) {
    const requests = [];
    // Single-credential design: setting jitenApiKey wipes apiKey during
    // settings normalization, so JPDB must be exercised with the Jiten key
    // cleared. newTabStopAtBatchEnd pins the batch-complete breather.
    const settings = createSettings({ apiKey: MOCK_JPDB_API_KEY, jitenApiKey: '', newTabStopAtBatchEnd: true });
    const { context, page } = await installNewTabPage(browser, fixture, settings, requests);
    try {
        await expectText(page, '[data-newtab-prompt]', '復習');
        await expectText(page, '[data-newtab-status]', 'JPDB');
        await expectText(page, '[data-newtab-count]', 'Left 1');
        await assertStatusLight(page, 'jpdb');
        assertRequestCountAtLeast(requests, 'jpdb-list-user-decks', 1);
        assertRequestCountAtLeast(requests, 'jpdb-list-vocabulary', 1);
        assertRequestCountAtLeast(requests, 'jpdb-lookup-vocabulary', 1);
        assertNoRequests(requests, request => String(request.kind).startsWith('jiten-'), 'JPDB-only smoke unexpectedly called Jiten');
        await page.click('[data-newtab-action="reveal"]');
        await expectText(page, '[data-newtab-grade-target-text]', 'Grades JPDB');
        await page.click('[data-newtab-action="grade"][data-grade="easy"]');
        const review = await waitForRequest(requests, item => item.kind === 'jpdb-review', 8_000);
        assert(review, 'JPDB review request was not submitted', { requests });
        assert(review.body.vid === 101 && review.body.sid === 1 && review.body.grade === 'easy', 'JPDB review request body was incorrect', review.body);
        // Stop-at-batch: the queue is exhausted, so the breather renders with
        // a continue control instead of silently fetching the next batch.
        await expectText(page, '[data-newtab-prompt]', 'Batch complete');
        await screenshot(page, 'jiten-newtab-jpdb-only.png');
        await page.click('[data-newtab-action="continue-batch"]');
        await expectText(page, '[data-newtab-count]', 'No reviews ready');
        return { prompt: '復習', review: review.body, sources: requests.map(item => item.kind) };
    } finally {
        await context.close();
    }
}

// UT-56: both credentials at once — the study queue merges the JPDB deck
// pool and the Jiten study batch instead of one key silently replacing the
// other (the old single-credential normalization caused the user's study
// page to diverge from jpdb Learn).
async function runDualCredentialSmoke(browser, fixture) {
    const requests = [];
    const settings = createSettings({ apiKey: MOCK_JPDB_API_KEY });
    const { context, page } = await installNewTabPage(browser, fixture, settings, requests);
    try {
        await expectText(page, '[data-newtab-count]', 'Left 2');
        assertRequestCountAtLeast(requests, 'jiten-study-batch', 1);
        assertRequestCountAtLeast(requests, 'jpdb-list-user-decks', 1);
        assertRequestCountAtLeast(requests, 'jpdb-lookup-vocabulary', 1);
        const gradeCurrent = async () => {
            await page.click('[data-newtab-action="reveal"]');
            await page.waitForTimeout(250);
            await page.click('[data-newtab-action="grade"][data-grade="okay"]');
            await page.waitForTimeout(900);
        };
        await gradeCurrent();
        await gradeCurrent();
        const jpdbReview = await waitForRequest(requests, item => item.kind === 'jpdb-review', 8_000);
        const jitenReview = await waitForRequest(requests, item => item.kind === 'jiten-review', 8_000);
        assert(jpdbReview, 'Dual-credential smoke did not submit a JPDB review', { requests });
        assert(jitenReview, 'Dual-credential smoke did not submit a Jiten review', { requests });
        await screenshot(page, 'jiten-newtab-dual-credential.png');
        return { reviews: { jpdb: jpdbReview.body, jiten: jitenReview.body } };
    } finally {
        await context.close();
    }
}

async function runLiveJitenHealthCheck() {
    const apiKey = process.env.YOMU_JITEN_API_KEY?.trim();
    if (!apiKey) return { skipped: true, reason: 'YOMU_JITEN_API_KEY is not set' };
    const response = await fetch(`${JITEN_API_ORIGIN}/api/srs/study-batch?limit=1`, {
        method: 'GET',
        headers: {
            Authorization: `ApiKey ${apiKey}`,
            Accept: 'application/json',
        },
    });
    const text = await response.text();
    assert(response.ok, 'Live Jiten study-batch check failed', { status: response.status, bodyPrefix: text.slice(0, 120) });
    const json = JSON.parse(text || '{}');
    assert(Array.isArray(json.cards), 'Live Jiten study-batch response did not include cards[]', { status: response.status });
    return { skipped: false, status: response.status, cards: json.cards.length };
}

async function expectText(page, selector, expected) {
    try {
        await page.waitForFunction(({ selector: targetSelector, expected: targetText }) => {
            return document.querySelector(targetSelector)?.textContent?.includes(targetText);
        }, { selector, expected }, { timeout: 10_000 });
    } catch (error) {
        const actual = await page.evaluate(targetSelector => {
            const element = document.querySelector(targetSelector);
            return element ? { text: element.textContent, hidden: element.hidden } : null;
        }, selector).catch(() => 'unavailable');
        throw new Error(`Expected ${selector} to contain ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, { cause: error });
    }
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

function assertRequestCount(requests, kind, expected) {
    const actual = requests.filter(item => item.kind === kind).length;
    assert(actual === expected, `Expected ${expected} ${kind} request(s), saw ${actual}`, { requests });
}

function assertRequestCountAtLeast(requests, kind, expected) {
    const actual = requests.filter(item => item.kind === kind).length;
    assert(actual >= expected, `Expected at least ${expected} ${kind} request(s), saw ${actual}`, { requests });
}

function assertAllRequests(requests, kind, predicate, message) {
    const matching = requests.filter(item => item.kind === kind);
    const unexpected = matching.filter(item => !predicate(item));
    assert(matching.length > 0, `Expected ${kind} request(s)`, { requests });
    assert(unexpected.length === 0, message, { unexpected, requests });
}

function assertNoRequests(requests, predicate, message) {
    const unexpected = requests.filter(predicate);
    assert(unexpected.length === 0, message, { unexpected, requests });
}

async function assertStatusLight(page, source) {
    const actual = await page.locator('[data-newtab-status] .jpdb-reader-newtab-status-light').first().getAttribute('data-source');
    assert(actual === source, `Expected ${source} status light`, { actual });
}

function textContent(page, selector) {
    return page.locator(selector).first().textContent().then(value => value?.trim() ?? '');
}

async function screenshot(page, filename) {
    mkdirSync(ARTIFACTS, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACTS, filename), fullPage: true });
}

async function main() {
    assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT, 'Run npm run build first.');
    const fixture = await createNewTabFixtureServer();
    const browserName = process.env.YOMU_SMOKE_BROWSER === 'firefox' ? 'firefox' : 'chromium';
    const browser = await launchSmokeBrowser(browserName === 'firefox' ? firefox : chromium, browserName, { headless: true });
    try {
        const [jitenOnly, jpdbOnly, dual, liveJiten] = [
            await runJitenOnlySmoke(browser, fixture),
            await runJpdbOnlySmoke(browser, fixture),
            await runDualCredentialSmoke(browser, fixture),
            await runLiveJitenHealthCheck(),
        ];
        console.log(JSON.stringify({ ok: true, jitenOnly, jpdbOnly, dual, liveJiten }, null, 2));
    } finally {
        await browser.close();
        await closeServer(fixture.server);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
});
