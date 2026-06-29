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
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_KEY = 'mock-jpdb-recall-key';
const JITEN_API_KEY = 'ak_mock-jiten-recall-key';
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
    source: 'anki',
    reviewSource: 'anki',
    ankiCardId: ANKI_CARD_ID,
    ankiNoteId: ANKI_NOTE_ID,
    ankiDeckNames: ['Mining'],
    ankiModelName: 'Imported Japanese',
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
    const results = [
        await runRecallScenario(browser, fixture.baseUrl, {
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
        }),
        await runRecallScenario(browser, fixture.baseUrl, {
            name: 'jiten-reading-accepted',
            card: JITEN_CARD,
            settings: settings({ apiKey: '', jitenApiKey: JITEN_API_KEY, jpdbMiningEnabled: true }),
            answer: 'べんごし',
            grade: 'okay',
            expectedOutcome: 'Reading accepted',
            reviewPredicate: request => request.kind === 'jiten-review',
            assertReview: request => {
                assert(request.body.wordId === JITEN_CARD.jitenWordId
                    && request.body.readingIndex === JITEN_CARD.jitenReadingIndex
                    && request.body.rating === 3,
                    'Jiten Recall review payload was incorrect',
                    request.body);
            },
        }),
        await runRecallScenario(browser, fixture.baseUrl, {
            name: 'anki-empty-then-wrong',
            card: ANKI_CARD,
            settings: settings({
                apiKey: '',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                ankiConnectUrl: DEFAULT_ANKI_CONNECT_URL,
                ankiDeck: 'Mining',
                ankiModel: 'Imported Japanese',
            }),
            precheckEmpty: true,
            answer: '能力',
            grade: 'nothing',
            expectedOutcome: 'Not quite',
            reviewPredicate: request => request.kind === 'anki' && request.action === 'answerCards',
            assertReview: request => {
                const answer = request.params?.answers?.[0];
                assert(answer?.cardId === ANKI_CARD_ID && answer?.ease === 1, 'Anki Recall answerCards payload was incorrect', request);
            },
        }),
    ];
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
            sourceLabel: scenario.card.source === 'anki' ? 'Anki' : scenario.card.source === 'jiten' ? 'Jiten' : 'JPDB',
            cards: [scenario.card],
        },
        uiState: {
            mode: 'recall',
            sort: 'frequency',
            filter: 'study',
            source: scenario.card.source === 'anki' ? 'anki' : 'dictionary',
            revealAnswer: false,
        },
    });
    await page.route('**/*', route => handleMockedRoute(route, requests));
    try {
        await page.goto(`${baseUrl}/newtab/index.html?smoke=recall-${encodeURIComponent(scenario.name)}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab-recall-mode[data-newtab-bound="true"]', { timeout: 15_000 });
        const input = page.locator('[data-newtab-recall-input]').first();
        await input.waitFor({ state: 'visible', timeout: 15_000 });
        await expectText(page, '[data-newtab-prompt]', firstGloss(scenario.card));
        assert(!(await isRevealed(page)), `${scenario.name} started revealed`);

        if (scenario.precheckEmpty) {
            await page.locator('[data-newtab-recall-form] [data-newtab-action="recall-submit"]').click();
            await expectText(page, '[data-newtab-recall-result]', 'Enter an answer');
            assert(!(await isRevealed(page)), `${scenario.name} empty answer revealed the card`);
        }

        await input.fill(scenario.answer);
        await input.press('Enter');
        await expectText(page, '[data-newtab-recall-result]', scenario.expectedOutcome);
        await expectText(page, '.jpdb-reader-newtab-recall-solution', scenario.card.spelling);
        assert(await isRevealed(page), `${scenario.name} did not reveal after a non-empty answer`);
        const prompt = await textContent(page, '[data-newtab-prompt]');
        const outcome = await textContent(page, '[data-newtab-recall-result]');
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.name}.png`), fullPage: false });
        await page.locator(`[data-newtab-action="grade"][data-grade="${scenario.grade}"]`).click();
        const review = await waitForRequest(requests, scenario.reviewPredicate, 8_000);
        assert(review, `${scenario.name} did not submit a provider review`, { requests });
        scenario.assertReview(review);
        assert(consoleErrors.length === 0, `${scenario.name} logged browser errors`, { consoleErrors });
        return {
            name: scenario.name,
            prompt,
            outcome,
            review,
            requests: summarizeRequests(requests),
        };
    } finally {
        await context.close().catch(() => undefined);
    }
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
    if (url.href === DEFAULT_ANKI_CONNECT_URL || url.origin === new URL(DEFAULT_ANKI_CONNECT_URL).origin) {
        return mockedAnkiRequest(request, requests);
    }
    return null;
}

function mockedJpdbRequest(url, request, requests) {
    assertApiAuth(request, 'Bearer ', JPDB_API_KEY, 'JPDB');
    const endpoint = url.pathname.replace(/^\/api\/v1\/?/, '');
    const body = readRequestJson(request.data);
    if (endpoint === 'review') {
        requests.push({ kind: 'jpdb-review', body });
        return jsonHttpResponse({});
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
        jpdbMiningEnabled: false,
        enableReviews: true,
        newTabSource: 'dictionary',
        newTabAnkiEnabled: false,
        ankiEnabled: false,
        ankiConnectUrl: DEFAULT_ANKI_CONNECT_URL,
        ankiDeck: 'Mining',
        ankiModel: 'Imported Japanese',
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: false,
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
        ['known'],
        [],
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
