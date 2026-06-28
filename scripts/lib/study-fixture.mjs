// Reusable fixture for booting the new-tab study PWA in Playwright: a static
// server for dist/newtab, settings seeding via the GM bridge, and a mock for the
// Jiten study-batch/review + public parse/info + Immersion Kit + audio endpoints.
// Used by the offline-review smoke and by ad-hoc UI screenshot scripts.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createJitenStudyBatchCard } from '../fixtures/jiten-fixtures.mjs';
import {
    addGmStorageBridgeInitScript,
    createSmokePaths,
    jsonHttpResponse,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './smoke-harness.mjs';

const { dist: DIST, newTabDir: NEWTAB_DIR } = createSmokePaths(path.join(import.meta.dirname, '..'));
const JITEN_API_ORIGIN = 'https://api.jiten.moe';
const JPDB_API_ORIGIN = 'https://jpdb.io';
const MOCK_JITEN_API_KEY = 'ak_mock-jiten-key';
const REQUEST_BRIDGE_NAME = '__yomuStudyFixtureRequest';

const STATIC_ROUTES = new Map([
    ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
    ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/manifest.webmanifest', [path.join(NEWTAB_DIR, 'manifest.webmanifest'), 'application/manifest+json']],
    ['/newtab/version.json', [path.join(NEWTAB_DIR, 'version.json'), 'application/json; charset=utf-8']],
    ['/yomu-icon.svg', [path.join(DIST, 'yomu-icon.svg'), 'image/svg+xml']],
    ['/favicon-32x32.png', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
    ['/apple-touch-icon.png', [path.join(DIST, 'apple-touch-icon.png'), 'image/png']],
]);

// Multi-card batch so a session can grade N cards. Each entry leaves the due
// batch once reviewed (stateful, like the real API).
const STUDY_CARDS = [
    { cardId: 9001, wordId: 42, readingIndex: 2, wordText: '日本語[にほんご]', wordTextPlain: '日本語', reading: 'にほんご', meaning: 'Japanese language', example: '日本語を読む。', rank: 123 },
    { cardId: 9002, wordId: 43, readingIndex: 0, wordText: '図鑑[ずかん]', wordTextPlain: '図鑑', reading: 'ずかん', meaning: 'pictorial book; field guide', example: '図鑑で調べる。', rank: 18447 },
    { cardId: 9003, wordId: 44, readingIndex: 0, wordText: '勉強[べんきょう]', wordTextPlain: '勉強', reading: 'べんきょう', meaning: 'study', example: '毎日勉強する。', rank: 900 },
    { cardId: 9004, wordId: 45, readingIndex: 0, wordText: '辞書[じしょ]', wordTextPlain: '辞書', reading: 'じしょ', meaning: 'dictionary', example: '辞書を引く。', rank: 1500 },
    { cardId: 9005, wordId: 46, readingIndex: 0, wordText: '物語[ものがたり]', wordTextPlain: '物語', reading: 'ものがたり', meaning: 'tale; story', example: '物語を語る。', rank: 2200 },
];

function studyCardPayload(card) {
    return createJitenStudyBatchCard({
        cardId: card.cardId,
        wordId: card.wordId,
        readingIndex: card.readingIndex,
        wordText: card.wordText,
        wordTextPlain: card.wordTextPlain,
        readings: [{ text: card.reading, rubyText: card.wordText, readingIndex: card.readingIndex, formType: 0 }],
        definitions: [{ index: 0, meanings: [card.meaning], partsOfSpeech: ['n'] }],
        partsOfSpeech: ['n'],
        pitchAccents: [0],
        frequencyRank: card.rank,
        exampleSentence: { text: card.example },
        sourceDeckName: 'Offline deck',
    });
}

export function createStudySettings(overrides = {}) {
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
        immersionKitEnabled: true,
        localDictionariesEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        showPitchAccent: true,
        audioEnabled: true,
        enableLogging: Boolean(process.env.SMOKE_DEBUG),
        ...overrides,
    };
}

export function createStudyServer() {
    return startLoopbackServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const route = STATIC_ROUTES.get(url.pathname.replace(/\/+$/, '') || '/');
        if (!route || !existsSync(route[0])) {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }
        serveFile(response, route[0], route[1], request.method ?? 'GET');
    }, 'Could not bind study fixture server');
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, accept',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

function tinyMp3Bytes() {
    // Minimal silent MP3 frame so audio fetch + decode does not error.
    return Buffer.from('SUQzAwAAAAAAA1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQxAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'base64');
}

// Returns a Playwright route handler. `requests` collects every intercepted call;
// `state.reviewed` tracks graded cards. When `offline` is true, NO network is mocked
// and any non-cached request fails (simulating a dead network).
function studyRouteHandler({ requests, state, offline = () => false }) {
    return async route => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        requests.push({ kind: classify(url, method), url: url.href, method, offline: offline() });
        if (offline()) {
            // No network when offline: anything not served from SW/IDB/localStorage fails.
            if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
            return route.abort('internetdisconnected');
        }
        if (method === 'OPTIONS' && isApiOrigin(url)) return route.fulfill({ status: 204, headers: corsHeaders() });
        const mocked = mockResponse(url, method, request, state);
        if (mocked) return route.fulfill({ status: mocked.status ?? 200, headers: { ...corsHeaders(), ...(mocked.headers ?? {}) }, contentType: mocked.contentType, body: mocked.body ?? mocked.responseText ?? '' });
        return route.continue();
    };
}

function classify(url, method) {
    if (url.origin === JITEN_API_ORIGIN) {
        const p = url.pathname.replace(/^\/api\/?/, '');
        if (p.startsWith('srs/review')) return 'jiten-review';
        if (p.startsWith('srs/study-batch')) return 'jiten-study-batch';
        return `jiten:${p}`;
    }
    if (url.origin === JPDB_API_ORIGIN) return `jpdb:${url.pathname}`;
    if (/immersionkit/.test(url.hostname)) return 'immersion-kit';
    if (/\.mp3($|\?)/.test(url.href) || /audio|media/.test(url.hostname)) return 'audio-media';
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return 'static';
    return `other:${url.hostname}`;
}

function isApiOrigin(url) {
    return url.origin === JITEN_API_ORIGIN || url.origin === JPDB_API_ORIGIN || /immersionkit/.test(url.hostname);
}

function mockResponse(url, method, request, state) {
    if (url.origin === JITEN_API_ORIGIN) return mockJiten(url, method, request, state);
    if (/immersionkit/.test(url.hostname) && url.pathname === '/search') {
        return jsonHttpResponse({ examples: [{
            id: `ik-${url.searchParams.get('q')}`,
            sentence: '図鑑で調べると楽しい。',
            sentence_with_furigana: '図鑑[ずかん]で 調[しら]べると 楽[たの]しい。',
            translation: 'Looking it up in the field guide is fun.',
            title: 'Offline Immersion', sourceTitle: 'Offline Immersion', source: 'Offline Immersion', category: 'anime',
            image_url: 'https://media.example.test/offline-image.jpg',
            sound_url: 'https://media.example.test/offline-audio.mp3',
        }] });
    }
    if (/media\.example\.test/.test(url.hostname)) {
        if (/\.mp3$/.test(url.pathname)) return { status: 200, contentType: 'audio/mpeg', body: tinyMp3Bytes() };
        return { status: 200, contentType: 'image/jpeg', body: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AfwD/2Q==', 'base64') };
    }
    return null;
}

function mockJiten(url, method, request, state) {
    const p = url.pathname.replace(/^\/api\/?/, '');
    if (method === 'GET' && /^vocabulary\/\d+\/\d+\/info$/.test(p)) return jitenInfo(url);
    if (method === 'GET' && p === 'vocabulary/parse') return jsonHttpResponse([]);
    if (p.startsWith('srs/reader-study-decks') || p.startsWith('srs/study-decks')) return jsonHttpResponse([{ userStudyDeckId: 2864, name: 'Offline deck' }]);
    if (p.startsWith('srs/study-batch')) return jsonHttpResponse(studyBatch(state));
    if (p.startsWith('srs/review')) {
        const body = readJson(request);
        if (body && body.cardId != null) state.reviewed.add(body.cardId);
        return jsonHttpResponse({});
    }
    if (p === 'ping' || p === '') return jsonHttpResponse({});
    return jsonHttpResponse({});
}

function studyBatch(state) {
    const cards = STUDY_CARDS.filter(card => !state.reviewed.has(card.cardId)).map(studyCardPayload);
    if (process.env.SMOKE_DEBUG) console.error('[study-batch] returning cards:', cards.length, JSON.stringify(cards[0])?.slice(0, 260));
    return { sessionId: 'offline-session', cards, newCardsRemaining: 0, reviewsRemaining: cards.length, newCardsToday: 0, reviewsToday: STUDY_CARDS.length - cards.length };
}

function jitenInfo(url) {
    const card = STUDY_CARDS.find(item => url.pathname.includes(`/${item.wordId}/${item.readingIndex}/`));
    if (!card) return jsonHttpResponse({});
    return jsonHttpResponse({
        wordId: card.wordId,
        mainReading: { text: card.wordText, readingIndex: card.readingIndex, frequencyRank: card.rank },
        partsOfSpeech: ['noun'],
        definitions: [{ englishMeanings: [card.meaning], pos: ['noun'] }],
        pitchAccents: [0],
    });
}

function readJson(request) {
    try { return JSON.parse(request.postData() ?? '{}'); } catch { return null; }
}

export async function bootStudySession(browser, { server, settings, viewport = { width: 980, height: 760 }, requests = [], state, offline = () => false, serviceWorkers = 'block', hasTouch = false, isMobile = false }) {
    const context = await browser.newContext({ bypassCSP: true, viewport, serviceWorkers, hasTouch, isMobile });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', m => console.error('[console]', m.type(), m.text().slice(0, 200)));
        page.on('pageerror', e => console.error('[pageerror]', e.message.slice(0, 200)));
    }
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => {
        const url = new URL(request.url);
        requests.push({ kind: classify(url, request.method), url: url.href, method: request.method, offline: offline(), viaBridge: true });
        if (offline()) {
            // Simulate a dead network: reject so the GM polyfill's onerror fires
            // (the app then falls back to cache / queues the write).
            throw new Error('offline');
        }
        // The GM bridge consumer reads result.responseText + result.status, so hand
        // back the jsonHttpResponse shape directly (NOT a {body} wrapper).
        const reqLike = { url: request.url, method: request.method, data: request.data, postData: () => request.data };
        const mocked = mockResponse(url, request.method, reqLike, state);
        return mocked ?? jsonHttpResponse({});
    });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings, requestBridgeName: REQUEST_BRIDGE_NAME });
    await page.route('**/*', studyRouteHandler({ requests, state, offline }));
    await page.goto(`${server.baseUrl}/newtab/index.html?study=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-newtab-prompt]', { timeout: 20_000 });
    return { context, page };
}
