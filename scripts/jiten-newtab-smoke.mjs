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
const MOCK_JITEN_API_KEY = 'ak_mock-jiten-key';
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
    ['GET srs/reader-study-decks', handleJitenReaderStudyDecks],
    ['POST srs/reader-study-decks', handleJitenReaderStudyDecks],
    ['GET srs/study-decks', handleJitenReaderStudyDecks],
    ['GET srs/study-batch', handleJitenStudyBatch],
    ['POST srs/review', handleJitenReview],
]);
const JPDB_REQUEST_HANDLERS = new Map([
    ['list-user-decks', handleJpdbListUserDecks],
    ['deck/list-vocabulary', handleJpdbListVocabulary],
    ['lookup-vocabulary', handleJpdbLookupVocabulary],
    ['review', handleJpdbReview],
]);
const PUBLIC_SEARCH_FIXTURES = new Map([
    ['よむ', { vid: 101000, expression: '読む', reading: 'よむ', meaning: 'to read', rank: 250 }],
    ['読み取る', { vid: 101001, expression: '読み取る', reading: 'よみとる', meaning: 'to read; to understand', rank: 5200 }],
    ['学習能力', { vid: 101002, expression: '学習能力', reading: 'がくしゅうのうりょく', meaning: 'learning ability', rank: 32900 }],
]);
const JITEN_SEARCH_FIXTURES = new Map([
    ['たっぷり', { wordId: 42, readingIndex: 2, expression: 'たっぷり', reading: 'たっぷり', annotated: 'たっぷり', meaning: 'plenty; full', example: 'たっぷり時間がある。' }],
    ['読む', { wordId: 201000, readingIndex: 0, expression: '読む', reading: 'よむ', annotated: '読[よ]む', meaning: 'to read', example: '本を読む。' }],
    ['読み取る', { wordId: 201001, readingIndex: 0, expression: '読み取る', reading: 'よみとる', annotated: '読[よ]み取[と]る', meaning: 'to read; to understand', example: '意図を読み取る。' }],
    ['学習能力', { wordId: 201002, readingIndex: 0, expression: '学習能力', reading: 'がくしゅうのうりょく', annotated: '学習能力[がくしゅうのうりょく]', meaning: 'learning ability', example: '学習能力が高い。' }],
]);
const JITEN_SEARCH_FIXTURES_BY_ID = new Map(Array.from(JITEN_SEARCH_FIXTURES.values()).map(item => [`${item.wordId}:${item.readingIndex}`, item]));

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
    const publicJpdb = publicJpdbResponse(url, request.method());
    if (publicJpdb) {
        await route.fulfill(mockedRouteResponse(publicJpdb));
        return;
    }
    const publicJiten = publicJitenResponse(url, request.method(), request.headers());
    if (publicJiten) {
        await route.fulfill(mockedRouteResponse(publicJiten));
        return;
    }
    const immersionKit = immersionKitResponse(url, request.method(), requests);
    if (immersionKit) {
        await route.fulfill(mockedRouteResponse(immersionKit));
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

function publicJpdbResponse(url, method) {
    if (method !== 'GET' || url.origin !== JPDB_API_ORIGIN) return null;
    if (url.pathname === '/search') return jpdbPublicSearchResponse(url.searchParams.get('q') ?? '');
    if (url.pathname.startsWith('/vocabulary/')) return jpdbPublicVocabularyResponse(url);
    return null;
}

function publicJitenResponse(url, method, headers = {}) {
    if (method !== 'GET' || url.origin !== JITEN_API_ORIGIN) return null;
    const pathname = url.pathname.replace(/^\/api\/?/, '');
    if (pathname === 'vocabulary/parse') return jitenPublicParseResponse(url.searchParams.get('text') ?? '');
    if (/^vocabulary\/\d+\/\d+\/info$/.test(pathname)) {
        if (hasAuthorizationHeader(headers)) return null;
        const fixture = jitenFixtureFromVocabularyUrl(url);
        return fixture ? jitenPublicVocabularyInfoResponse(fixture) : null;
    }
    return null;
}

function hasAuthorizationHeader(headers) {
    return Boolean(headers?.authorization ?? headers?.Authorization);
}

function jitenPublicParseResponse(text) {
    const words = [];
    for (const fixture of JITEN_SEARCH_FIXTURES.values()) {
        if (!text.includes(fixture.expression)) continue;
        words.push({
            wordId: fixture.wordId,
            readingIndex: fixture.readingIndex,
            originalText: fixture.expression,
        });
    }
    return jsonHttpResponse(words);
}

function jitenPublicVocabularyInfoResponse(fixture) {
    return jsonHttpResponse({
        wordId: fixture.wordId,
        mainReading: {
            text: fixture.annotated,
            readingIndex: fixture.readingIndex,
            frequencyRank: 250,
        },
        partsOfSpeech: ['noun'],
        definitions: [{ englishMeanings: [fixture.meaning], pos: ['noun'] }],
        pitchAccents: [0],
    });
}

function jpdbPublicSearchResponse(query) {
    const fixture = PUBLIC_SEARCH_FIXTURES.get(query) ?? PUBLIC_SEARCH_FIXTURES.get(normalizedKanaQuery(query));
    return {
        status: 200,
        contentType: 'text/html; charset=utf-8',
        responseText: publicJpdbSearchHtml(fixture ? [fixture] : []),
    };
}

function jpdbPublicVocabularyResponse(url) {
    const fixture = Array.from(PUBLIC_SEARCH_FIXTURES.values()).find(item => url.pathname.includes(`/${item.vid}/`));
    return {
        status: 200,
        contentType: 'text/html; charset=utf-8',
        responseText: publicJpdbSearchHtml(fixture ? [fixture] : []),
    };
}

function normalizedKanaQuery(value) {
    return value.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function publicJpdbSearchHtml(fixtures) {
    return `<!doctype html>
        <html lang="en">
            <head><meta charset="utf-8"><title>JPDB fixture</title></head>
            <body>
                <main class="results search">
                    ${fixtures.map(publicJpdbVocabularyResultHtml).join('')}
                </main>
            </body>
        </html>`;
}

function publicJpdbVocabularyResultHtml(fixture) {
    const href = `/vocabulary/${fixture.vid}/${encodeURIComponent(fixture.expression)}/${encodeURIComponent(fixture.reading)}`;
    return `
        <article class="result vocabulary">
            <section class="subsection-headword">
                <a href="${href}" class="primary-spelling">
                    <span class="spelling">${fixture.expression}</span>
                    <span class="reading">${fixture.reading}</span>
                </a>
                <a href="${href}">More details</a>
            </section>
            <section class="subsection-meanings">
                <div class="part-of-speech"><div>noun</div></div>
                <div class="meanings"><div>${fixture.meaning}</div></div>
            </section>
            <div class="tags"><span class="tag">#${fixture.rank}</span></div>
        </article>
    `;
}

function immersionKitResponse(url, method, requests) {
    if (method !== 'GET' || !/^https:\/\/apiv2(?:express)?\.immersionkit\.com$/.test(url.origin)) return null;
    if (url.pathname !== '/search') return null;
    requests.push({ kind: 'immersion-kit-search', query: url.searchParams.get('q') ?? '' });
    return jsonHttpResponse({
        examples: [{
            id: 'ik-smoke-tappuri',
            sentence: 'たっぷり食べたので満足です。',
            sentence_with_furigana: 'たっぷり 食[た]べたので 満足[まんぞく]です。',
            translation: 'I ate plenty, so I am satisfied.',
            title: 'Immersion Smoke',
            sourceTitle: 'Immersion Smoke',
            source: 'Immersion Smoke',
            category: 'anime',
            sound_url: 'https://media.example.test/immersion-tappuri.mp3',
        }],
    });
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
    const publicJpdb = publicJpdbResponse(url, request.method);
    if (publicJpdb) return publicJpdb;
    const publicJiten = publicJitenResponse(url, request.method, request.headers);
    if (publicJiten) return publicJiten;
    const immersionKit = immersionKitResponse(url, request.method, requests);
    if (immersionKit) return immersionKit;
    if (url.origin === JITEN_API_ORIGIN) return mockedJitenRequest(url, request, requests);
    if (url.origin === JPDB_API_ORIGIN) return mockedJpdbRequest(url, request, requests);
    return null;
}

function mockedJitenRequest(url, request, requests) {
    const pathname = url.pathname.replace(/^\/api\/?/, '');
    if (jitenEndpointRequiresAuth(pathname)) assertApiAuth(request, 'ApiKey ', MOCK_JITEN_API_KEY, 'Jiten');
    const handler = JITEN_REQUEST_HANDLERS.get(`${request.method} ${pathname}`) ?? jitenDynamicHandler(request.method, pathname) ?? jitenPingHandler(pathname);
    if (handler) return handler(url, request, requests);
    throw new Error(`Unexpected Jiten request: ${request.method} ${url.href}`);
}

function jitenEndpointRequiresAuth(pathname) {
    return pathname.startsWith('reader/') || pathname.startsWith('srs/');
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

function handleJitenReaderStudyDecks(_url, _request, requests) {
    requests.push({ kind: 'jiten-reader-study-decks' });
    return jsonHttpResponse([{ userStudyDeckId: 2864, name: 'Smoke deck' }]);
}

function handleJitenPing(_url, _request, requests) {
    requests.push({ kind: 'jiten-ping' });
    return jsonHttpResponse({});
}

function handleJitenParse(_url, request, requests) {
    const body = readRequestJson(request.data);
    const texts = Array.isArray(body.text) ? body.text.map(String) : [];
    requests.push({ kind: 'jiten-parse', body });
    const vocabularyByKey = new Map();
    const tokens = texts.map(text => {
        const fixture = JITEN_SEARCH_FIXTURES.get(text);
        if (!fixture) return [];
        const key = `${fixture.wordId}:${fixture.readingIndex}`;
        vocabularyByKey.set(key, jitenSearchVocabulary(fixture));
        return [{ wordId: fixture.wordId, readingIndex: fixture.readingIndex, start: 0, end: fixture.expression.length, length: fixture.expression.length }];
    });
    return jsonHttpResponse({ vocabulary: Array.from(vocabularyByKey.values()), tokens });
}

function handleJitenVocabularyInfo(url, _request, requests) {
    const fixture = jitenFixtureFromVocabularyUrl(url);
    requests.push({ kind: 'jiten-vocabulary-info', wordId: fixture?.wordId, readingIndex: fixture?.readingIndex });
    assert(fixture, 'Jiten vocabulary info smoke requested an unknown word', { url: url.href });
    return jsonHttpResponse({
        wordId: fixture.wordId,
        mainReading: { text: fixture.annotated, readingIndex: fixture.readingIndex, frequencyRank: 250, usedInMediaAmount: 12 },
        alternativeReadings: [],
        partsOfSpeech: ['noun'],
        definitions: [{ senseIndex: 0, englishMeanings: [fixture.meaning], pos: ['noun'] }],
        pitchAccents: [0],
        knownStates: [],
        composedOf: [{
            wordId: fixture.wordId + 500,
            readingIndex: 0,
            reading: fixture.expression,
            readingFurigana: fixture.annotated,
            mainDefinition: fixture.meaning,
            frequencyRank: 1800,
            matchSurface: fixture.expression,
            knownStates: [],
            pitchAccents: [0],
            audioUrls: ['https://media.example.test/jiten-word.mp3'],
        }],
        usedIn: [{
            wordId: fixture.wordId + 1000,
            readingIndex: 0,
            reading: `${fixture.expression}力`,
            readingFurigana: `${fixture.expression}力[${fixture.reading}りょく]`,
            mainDefinition: `${fixture.meaning} ability`,
            frequencyRank: 9999,
            matchSurface: `${fixture.expression}力`,
            knownStates: [],
            pitchAccents: [1],
            audioUrls: ['https://media.example.test/jiten-related.mp3'],
        }],
        usedInTotal: 1,
    });
}

function handleJitenVocabularyExamples(url, _request, requests) {
    const fixture = jitenFixtureFromVocabularyUrl(url);
    requests.push({ kind: 'jiten-vocabulary-examples', wordId: fixture?.wordId, readingIndex: fixture?.readingIndex });
    assert(fixture, 'Jiten example smoke requested an unknown word', { url: url.href });
    return jsonHttpResponse([{
        sentenceId: fixture.wordId + 2000,
        text: fixture.example,
        wordPosition: fixture.example.indexOf(fixture.expression),
        wordLength: fixture.expression.length,
        difficulty: null,
        sourceTitle: 'Smoke fixture',
        audioUrls: ['https://media.example.test/jiten-sentence.mp3'],
    }]);
}

function jitenPingHandler(pathname) {
    return pathname === 'reader/ping' ? handleJitenPing : undefined;
}

function jitenDynamicHandler(method, pathname) {
    if (method === 'GET' && pathname === 'vocabulary/parse') return handleJitenVocabularyParse;
    if (method === 'POST' && pathname === 'reader/parse') return handleJitenParse;
    if (method === 'GET' && /^vocabulary\/\d+\/\d+\/info$/.test(pathname)) return handleJitenVocabularyInfo;
    if (method === 'POST' && /^vocabulary\/\d+\/\d+\/random-example-sentences$/.test(pathname)) return handleJitenVocabularyExamples;
    return undefined;
}

function handleJitenVocabularyParse(url, _request, requests) {
    const text = url.searchParams.get('text') ?? '';
    requests.push({ kind: 'jiten-public-parse', length: text.length });
    const matches = Array.from(JITEN_SEARCH_FIXTURES.values())
        .filter(fixture => text.includes(fixture.expression) || text.includes(fixture.reading))
        .map(fixture => ({
            wordId: fixture.wordId,
            readingIndex: fixture.readingIndex,
            originalText: fixture.expression,
        }));
    return jsonHttpResponse(matches);
}

function jitenFixtureFromVocabularyUrl(url) {
    const match = /\/vocabulary\/(\d+)\/(\d+)\//.exec(url.pathname);
    return match ? JITEN_SEARCH_FIXTURES_BY_ID.get(`${match[1]}:${match[2]}`) : undefined;
}

function jitenSearchVocabulary(fixture) {
    return {
        wordId: fixture.wordId,
        readingIndex: fixture.readingIndex,
        spelling: fixture.expression,
        reading: fixture.annotated,
        frequencyRank: 250,
        partsOfSpeech: ['noun'],
        meaningsChunks: [[fixture.meaning]],
        meaningsPartOfSpeech: [['noun']],
        knownState: [],
        pitchAccents: [0],
    };
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
            wordText: 'たっぷり',
            wordTextPlain: 'たっぷり',
            readings: [{ text: 'たっぷり', rubyText: 'たっぷり', readingIndex: 2, formType: 0 }],
            definitions: [{ index: 0, meanings: ['plenty; full'], partsOfSpeech: ['adv'] }],
            partsOfSpeech: ['adv'],
            pitchAccents: [0],
            frequencyRank: 1800,
            exampleSentence: { text: 'たっぷり時間がある。' },
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
    const { context, page } = await installNewTabPage(browser, fixture, createSettings({
        newTabFrontSentenceEnabled: true,
        newTabParsingEnabled: true,
        immersionKitEnabled: true,
        immersionKitShowImages: false,
        immersionKitShowTranslation: true,
        immersionKitAutoPlayAudio: false,
        immersionKitPlayOnHover: false,
        audioEnabled: true,
        }), requests);
    try {
        await expectText(page, '[data-newtab-prompt]', 'たっぷり');
        await expectText(page, '.jpdb-reader-newtab-sentence', 'たっぷり');
        await expectText(page, '[data-newtab-status]', 'Jiten');
        await expectText(page, '[data-newtab-count]', 'Left 1');
        await assertStatusLight(page, 'jiten');
        assertRequestCount(requests, 'jiten-study-batch', 1);
        assertAllRequests(requests, 'jiten-study-batch', request => request.limit === '180', 'Jiten-only smoke used an unexpected study-batch limit');
        assertNoRequests(requests, request => String(request.kind).startsWith('jpdb-'), 'Jiten-only smoke unexpectedly called JPDB');
        await openFinalReveal(page);
        await expectText(page, '[data-newtab-grade-target-text]', 'Grades Jiten');
        await page.waitForSelector('[data-newtab-study-tools]', { timeout: 12_000 });
        await expectText(page, '[data-newtab-prompt] .jpdb-reader-newtab-term', 'たっぷり');
        const toolText = await textContent(page, '[data-newtab-study-tools]');
        assert(!toolText.includes('#1800'), 'Jiten frequency should not render in the front-side study tools row', { toolText });
        // Source pills (Jiten/JPDB/Jisho/…) are intentionally hidden on the card
        // front now; they stay in the lookup/detail view.
        const frontPills = await page.locator('[data-newtab-prompt] .jpdb-reader-word-pills, [data-newtab-prompt] .jpdb-reader-pill').count();
        assert(frontPills === 0, 'Source pills should not render on the study card front', { frontPills });
        // The audio button now sits inline next to the headword (term row), not in
        // the meta tools row.
        await page.waitForSelector('.jpdb-reader-newtab-term-row [data-action="study-word-audio"]:not([disabled])', { timeout: 12_000 });
        await page.waitForSelector('[data-newtab-study-tools] .jpdb-reader-pitch svg', { timeout: 12_000 });
        const answerHeaders = await page.locator('[data-newtab-answer-header]').count();
        assert(answerHeaders === 0, 'Study rendered the retired answer header card', { answerHeaders });
        const promptSentences = await page.locator('[data-newtab-prompt] .jpdb-reader-newtab-sentence').count();
        assert(promptSentences === 0, 'Study reveal repeated the prompt sentence above Immersion Kit', { promptSentences });
        const studySourceCards = await page.locator('[data-newtab-answer] .jpdb-reader-source-card').count();
        assert(studySourceCards >= 1, 'Final reveal should include dictionary/source entries for the reviewed word', { studySourceCards });
        const oldStudyDetails = await page.locator('[data-newtab-study-details]').count();
        assert(oldStudyDetails === 0, 'Jiten answer rendered the old giant study-details card', { oldStudyDetails });
        await page.waitForSelector('.jpdb-reader-newtab-immersion .jpdb-reader-example-card', { timeout: 12_000 });
        await expectText(page, '.jpdb-reader-newtab-immersion', 'Immersion Smoke');
        assertRequestCountAtLeast(requests, 'jiten-vocabulary-examples', 1);
        assertRequestCountAtLeast(requests, 'jiten-reader-study-decks', 1);
        assertRequestCountAtLeast(requests, 'immersion-kit-search', 1);
        assertRequestCount(requests, 'jiten-review', 0);
        await screenshot(page, 'jiten-newtab-jiten-only.png');
        // Failed-card loop: a failing grade submits a review but requeues the
        // card client-side, so the same prompt comes straight back.
        await page.click('[data-newtab-action="grade"][data-grade="nothing"]');
        const failedReview = await waitForRequest(requests, item => item.kind === 'jiten-review', 8_000);
        assert(failedReview, 'Failed Jiten review request was not submitted', { requests });
        assert(failedReview.body.rating === 1, 'Failed Jiten review should submit rating 1', failedReview.body);
        await expectText(page, '[data-newtab-prompt]', 'たっぷり');
        // Undo stays on Previous after a grade; the separate undo button was
        // retired to keep mobile controls compact.
        await page.waitForSelector('[data-newtab-action="previous"]', { timeout: 8_000 });
        const separateUndoButtons = await page.locator('[data-newtab-action="undo-review"]').count();
        assert(separateUndoButtons === 0, 'Study rendered the retired separate undo button', { separateUndoButtons });
        await openFinalReveal(page);
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
        await openWordStep(page);
        await expectText(page, '[data-newtab-prompt]', '復習');
        await expectText(page, '[data-newtab-status]', 'JPDB');
        await expectText(page, '[data-newtab-count]', 'Left 1');
        await assertStatusLight(page, 'jpdb');
        assertRequestCountAtLeast(requests, 'jpdb-list-user-decks', 1);
        assertRequestCountAtLeast(requests, 'jpdb-list-vocabulary', 1);
        assertRequestCountAtLeast(requests, 'jpdb-lookup-vocabulary', 1);
        assertNoRequests(requests, request => String(request.kind).startsWith('jiten-'), 'JPDB-only smoke unexpectedly called Jiten');
        await openFinalReveal(page);
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
            await openFinalReveal(page);
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

async function runSearchJitenSourcePanelSmoke(browser, fixture) {
    const requests = [];
    const settings = createSettings({
        apiKey: '',
        jitenApiKey: MOCK_JITEN_API_KEY,
        newTabSource: 'jpdb',
        jpdbDefinitionsEnabled: true,
        jitenDefinitionsEnabled: true,
        ankiEnabled: false,
        ankiSectionEnabled: false,
        localDictionariesEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        immersionKitEnabled: false,
    });
    const { context, page } = await installNewTabPage(browser, fixture, settings, requests);
    const terms = ['よむ', '読み取る', '学習能力'];
    try {
        const results = [];
        for (const term of terms) {
            const url = `${fixture.baseUrl}/newtab/index.html?q=${encodeURIComponent(term)}&smoke=jiten-source-${encodeURIComponent(term)}`;
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.locator('[data-newtab-action="mode"][data-mode="search"]').click({ timeout: 20_000 });
            await page.locator('[data-newtab-search-input]').fill(term);
            await page.locator('[data-newtab-search]').evaluate(form => form.requestSubmit());
            await page.waitForSelector('[data-newtab-search-results]', { timeout: 20_000 });
            const wordButton = page.locator('[data-newtab-action="search-result-word"]').first();
            await wordButton.waitFor({ state: 'visible', timeout: 20_000 });
            const expression = await wordButton.getAttribute('data-expression');
            await wordButton.click();
            const detail = page.locator('[data-newtab-search-detail]:not([hidden])').first();
            await detail.locator('[data-source="jiten"]').waitFor({ state: 'attached', timeout: 12_000 });
            const sourceTitles = await detail.locator('.jpdb-reader-source-card > summary, .jpdb-reader-local-title').evaluateAll(nodes =>
                nodes.map(node => node.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean),
            );
            const jitenText = await detail.locator('[data-source="jiten"]').textContent();
            assert(sourceTitles.includes('Jiten'), `Expanded search detail did not list Jiten for ${term}`, { term, expression, sourceTitles });
            assert(jitenText && /Jiten/.test(jitenText) && /to read|learning ability/.test(jitenText), `Jiten panel was empty or missing definitions for ${term}`, { term, expression, jitenText });
            const passiveTargets = await detail.locator('[data-source="jiten"] .jpdb-reader-passive-word').count();
            assert(passiveTargets > 0, `Jiten panel did not render passive ruby/lookup targets for ${term}`, { term, expression });
            results.push({ term, expression, sourceTitles });
        }
        assertNoRequests(requests, request => String(request.kind).startsWith('jpdb-'), 'Search Jiten source smoke unexpectedly called JPDB API');
        return results;
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

async function openFinalReveal(page) {
    const revealStep = page.locator('[data-study-step-kind="final-reveal"]').first();
    await revealStep.waitFor({ state: 'visible', timeout: 12_000 });
    await revealStep.click();
    await page.waitForSelector('[data-study-step-kind="final-reveal"][aria-current="step"]', { timeout: 12_000 });
    await page.waitForSelector('[data-newtab-grade-target-text]', { timeout: 12_000 });
}

async function openWordStep(page) {
    const wordStep = page.locator('[data-study-step-kind="word"]').first();
    await wordStep.waitFor({ state: 'visible', timeout: 12_000 });
    if (await wordStep.getAttribute('aria-current') !== 'step') {
        await wordStep.click();
        await page.waitForSelector('[data-study-step-kind="word"][aria-current="step"]', { timeout: 12_000 });
    }
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
        const [jitenOnly, jpdbOnly, dual, searchJitenSources, liveJiten] = [
            await runJitenOnlySmoke(browser, fixture),
            await runJpdbOnlySmoke(browser, fixture),
            await runDualCredentialSmoke(browser, fixture),
            await runSearchJitenSourcePanelSmoke(browser, fixture),
            await runLiveJitenHealthCheck(),
        ];
        console.log(JSON.stringify({ ok: true, jitenOnly, jpdbOnly, dual, searchJitenSources, liveJiten }, null, 2));
    } finally {
        await browser.close();
        await closeServer(fixture.server);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
});
