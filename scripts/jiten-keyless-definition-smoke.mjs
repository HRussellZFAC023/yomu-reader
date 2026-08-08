#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    corsHeaders,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { newTabModeButton } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const ARTIFACT_SUFFIX = (process.env.YOMU_JITEN_KEYLESS_ARTIFACT_SUFFIX || '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '');
const ARTIFACT_DIR = path.join(ARTIFACTS, ['jiten-full-definition', ARTIFACT_SUFFIX].filter(Boolean).join('-'));
const TERM = '復習';
const READING = 'ふくしゅう';
const REQUEST_BRIDGE_NAME = '__yomuJitenFullDefinitionSmokeRequest';
const JITEN_WORD_ID = 1500800;
const JITEN_READING_INDEX = 0;
const BUILT_ARTIFACTS = [
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
    path.join(NEWTAB_DIR, 'sw.js'),
];
const STATIC_ROUTES = new Map([
    ['/seed', [null, 'text/html; charset=utf-8']],
    ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
    ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
    ['/yomu-icon.svg', [path.join(DIST, 'yomu-icon.svg'), 'image/svg+xml']],
    ['/favicon-32x32.png', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
]);

const baseSettings = {
    onboardingSeen: true,
    newTabEnabled: true,
    newTabSource: 'dictionary',
    interfaceLanguage: 'ja',
    apiKey: '',
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: true,
    localDictionariesEnabled: true,
    dictionaryPreferences: [
        { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
    ],
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    immersionKitEnabled: false,
    audioEnabled: false,
    showFloatingButton: false,
    enableLogging: false,
};

const scenarios = [
    {
        id: 'no-key',
        label: 'No Jiten API key',
        settings: { ...baseSettings, jitenApiKey: '' },
        expectAuthorization: false,
        expectReaderParse: false,
    },
    {
        id: 'with-key',
        label: 'With Jiten API key',
        settings: { ...baseSettings, jitenApiKey: 'jiten-smoke-key' },
        expectAuthorization: true,
        expectReaderParse: true,
    },
];

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT, 'Run npm run build first.');

const server = await startLoopbackServer(serveRequest, 'Could not bind Jiten full definition smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const scenarioReports = [];

try {
    for (const scenario of scenarios) {
        scenarioReports.push(await runScenario(scenario));
    }
    const report = {
        ok: true,
        term: TERM,
        reading: READING,
        scenarios: scenarioReports,
        artifactDir: ARTIFACT_DIR,
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function runScenario(scenario) {
    const requests = [];
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 920 } });
    const page = await context.newPage();
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => handleSmokeRequest(request, scenario, requests, 'gm'));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: scenario.settings,
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    await page.route(/https?:\/\/(?:[^/]*api\.jiten\.moe|[^/]*jpdb\.io|[^/]*workers\.dev)\//, route => handleSmokeRoute(route, scenario, requests));

    await page.goto(`${server.origin}/seed`, { waitUntil: 'domcontentloaded' });
    await seedJitendexDictionary(page);
    await page.goto(`${server.origin}/newtab/index.html?smoke=jiten-full-${scenario.id}-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await newTabModeButton(page, 'search').click({ timeout: 90_000 });
    await page.locator('[data-newtab-search-input]').fill(TERM);
    await page.locator('[data-newtab-search]').evaluate(form => form.requestSubmit());
    await page.waitForSelector('[data-newtab-search-results]', { timeout: 90_000 });
    const wordButton = page.locator('[data-newtab-action="search-result-word"]', { hasText: TERM }).first();
    await wordButton.waitFor({ state: 'visible', timeout: 90_000 });
    await wordButton.click();

    const detail = page.locator('[data-newtab-search-detail]:not([hidden])').first();
    await detail.waitFor({ state: 'visible', timeout: 40_000 });
    await page.screenshot({ path: artifactPath(scenario.id, 'before-jiten-detail.png'), fullPage: true });
    const beforeDom = await detail.evaluate(summarizeDetailDom);
    writeFileSync(artifactPath(scenario.id, 'before-jiten-detail.json'), JSON.stringify(beforeDom, null, 2));

    await detail.locator('[data-source="jiten"]').waitFor({ state: 'attached', timeout: 60_000 });
    await detail.locator('[data-source="jiten"]').evaluate(node => node.setAttribute('open', ''));
    await page.screenshot({ path: artifactPath(scenario.id, 'after-jiten-detail.png'), fullPage: true });
    const afterDom = await detail.evaluate(summarizeDetailDom);
    writeFileSync(artifactPath(scenario.id, 'after-jiten-detail.json'), JSON.stringify(afterDom, null, 2));

    const jitenRequests = requests.filter(request => request.host === 'api.jiten.moe');
    assert(afterDom.hasJiten, `${scenario.label}: search detail did not render a Jiten source`, afterDom);
    assert(afterDom.jitenText.includes('review; revision'), `${scenario.label}: Jiten source did not render meanings`, afterDom);
    assert(afterDom.jitenText.includes('復習会'), `${scenario.label}: Jiten source did not render used-in words`, afterDom);
    assert(/毎日.*復習.*する/u.test(afterDom.jitenText), `${scenario.label}: Jiten source did not render example sentences`, afterDom);
    assert(afterDom.jitenText.includes(READING), `${scenario.label}: Jiten source did not render the reading`, afterDom);
    assert(afterDom.audioButtonCount >= 3, `${scenario.label}: Jiten source did not render TTS/audio buttons`, afterDom);
    assert(!afterDom.hasLocalFallbackCard, `${scenario.label}: Jiten source still rendered the inner local fallback card`, afterDom);
    assert(!afterDom.hasExternalOpenButton, `${scenario.label}: Jiten source still rendered the external open button`, afterDom);
    assert(!afterDom.jitenText.includes('Jitenで開く'), `${scenario.label}: Jiten source still contained the external open label`, afterDom);
    assert(jitenRequests.some(request => request.path.includes('/vocabulary/search') || request.path.includes('/reader/parse')), `${scenario.label}: no Jiten lookup request was recorded`, jitenRequests);
    assert(jitenRequests.some(request => request.path.includes(`/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/info`)), `${scenario.label}: no Jiten info request was recorded`, jitenRequests);
    assert(jitenRequests.some(request => request.path.includes('/random-example-sentences')), `${scenario.label}: no Jiten examples request was recorded`, jitenRequests);
    assert(jitenRequests.some(request => request.path.includes('/reader/parse')) === scenario.expectReaderParse, `${scenario.label}: unexpected reader/parse request state`, jitenRequests);
    assert(jitenRequests.every(request => request.hasAuthorization === expectedAuthorizationForRequest(request, scenario)), `${scenario.label}: Authorization header state was wrong`, jitenRequests);

    await context.close();
    return {
        id: scenario.id,
        label: scenario.label,
        settings: scenario.settings,
        sourceState: {
            newTabSource: scenario.settings.newTabSource,
            jpdbDefinitionsEnabled: scenario.settings.jpdbDefinitionsEnabled,
            jitenDefinitionsEnabled: scenario.settings.jitenDefinitionsEnabled,
            localDictionariesEnabled: scenario.settings.localDictionariesEnabled,
            dictionaryPreferences: scenario.settings.dictionaryPreferences,
        },
        expectedAuthorization: scenario.expectAuthorization,
        beforeDom,
        afterDom,
        jitenRequests,
        artifacts: {
            beforeScreenshot: artifactPath(scenario.id, 'before-jiten-detail.png'),
            beforeDom: artifactPath(scenario.id, 'before-jiten-detail.json'),
            afterScreenshot: artifactPath(scenario.id, 'after-jiten-detail.png'),
            afterDom: artifactPath(scenario.id, 'after-jiten-detail.json'),
        },
    };
}

function expectedAuthorizationForRequest(request, scenario) {
    if (!scenario.expectAuthorization) return false;
    // Public vocabulary parse is intentionally unauthenticated even when a
    // Jiten API key is configured; it powers keyless pitch/reading enrichment
    // without spending private SRS quota. Private detail/review endpoints must
    // still carry the key.
    if (request.path.startsWith('/api/vocabulary/parse')) return false;
    return true;
}

function artifactPath(scenarioId, filename) {
    return path.join(ARTIFACT_DIR, `${scenarioId}-${filename}`);
}

function summarizeDetailDom(node) {
    const jiten = node.querySelector('[data-source="jiten"]');
    return {
        detailText: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        jitenText: jiten?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        sourceTitles: Array.from(node.querySelectorAll('.jpdb-reader-source-card > summary, .jpdb-reader-local-title'))
            .map(summary => summary.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter(Boolean),
        hasJiten: Boolean(jiten),
        hasLocalFallbackCard: Boolean(jiten?.querySelector('.jpdb-reader-jiten-local-definitions, .jpdb-reader-jiten-local-entry')),
        hasExternalOpenButton: Boolean(jiten?.querySelector('.jpdb-reader-jiten-external-lookup')) || /Jitenで開く|Open in Jiten/.test(jiten?.textContent ?? ''),
        reading: jiten?.querySelector('.jpdb-reader-jiten-headword rt')?.textContent ?? '',
        meaningText: jiten?.querySelector('.jpdb-reader-jiten-meaning')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        relatedGroupCount: jiten?.querySelectorAll('.jpdb-reader-jiten-related-group').length ?? 0,
        hasComposedOf: Boolean(jiten?.textContent?.includes('復')),
        hasUsedIn: Boolean(jiten?.textContent?.includes('復習会')),
        hasExampleSentence: /毎日.*復習.*する/u.test(jiten?.textContent ?? ''),
        audioButtonCount: jiten?.querySelectorAll('.jpdb-reader-jiten-audio').length ?? 0,
        exampleAudioButton: Boolean(jiten?.querySelector('.jpdb-reader-jiten-example-row .jpdb-reader-jiten-audio')),
    };
}

function handleSmokeRoute(route, scenario, requests) {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
        return route.fulfill({
            status: 204,
            headers: corsHeaders(),
        });
    }
    const response = handleSmokeRequest({
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        data: request.postData() ?? '',
        responseType: 'json',
    }, scenario, requests, 'fetch');
    return route.fulfill({
        status: response.status,
        headers: corsHeaders(),
        contentType: response.contentType ?? 'application/json; charset=utf-8',
        body: response.responseText ?? '',
    });
}

function handleSmokeRequest(request, scenario, requests, transport) {
    const summary = requestSummary(request, transport);
    requests.push(summary);
    if (summary.host === 'api.jiten.moe') return mockJitenResponse(summary, scenario);
    return { status: 503, responseText: '', contentType: 'text/plain; charset=utf-8' };
}

function requestSummary(request, transport) {
    const url = new URL(request.url);
    const authorization = authorizationHeader(request.headers);
    return {
        transport,
        method: request.method ?? 'GET',
        url: request.url,
        host: url.host,
        path: `${url.pathname}${url.search}`,
        hasAuthorization: Boolean(authorization),
        authorizationScheme: authorization ? authorization.split(/\s+/)[0] : '',
    };
}

function authorizationHeader(headers = {}) {
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization');
    return entry ? String(entry[1]) : '';
}

function mockJitenResponse(request, scenario) {
    if (request.path.startsWith('/api/reader/parse')) {
        if (!scenario.expectAuthorization) return textResponse(403, 'unexpected keyless reader parse');
        return jsonHttpResponse({
            tokens: [[{ wordId: JITEN_WORD_ID, readingIndex: JITEN_READING_INDEX, start: 0, end: TERM.length, length: TERM.length }]],
            vocabulary: [{
                wordId: JITEN_WORD_ID,
                readingIndex: JITEN_READING_INDEX,
                spelling: TERM,
                reading: '復[ふく]習[しゅう]',
                frequencyRank: 12435,
                partsOfSpeech: ['n', 'vs'],
                meaningsChunks: [['review; revision']],
                meaningsPartOfSpeech: [['n']],
                knownState: [0],
                pitchAccents: [0],
            }],
        });
    }
    if (request.path.startsWith('/api/vocabulary/search')) {
        return jsonHttpResponse({
            results: [{
                wordId: JITEN_WORD_ID,
                readingIndex: JITEN_READING_INDEX,
                text: TERM,
                rubyText: '復[ふく]習[しゅう]',
                frequencyRank: 12435,
                partsOfSpeech: ['n', 'vs'],
                meanings: ['review; revision'],
            }],
        });
    }
    if (request.path === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/info`) {
        return jsonHttpResponse(jitenVocabularyInfoPayload());
    }
    if (request.path === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/random-example-sentences`) {
        return jsonHttpResponse(jitenExamplePayload());
    }
    return textResponse(404, 'unknown Jiten smoke endpoint');
}

function jitenVocabularyInfoPayload() {
    return {
        wordId: JITEN_WORD_ID,
        mainReading: { text: TERM, readingIndex: JITEN_READING_INDEX, frequencyRank: 12435, usedInMediaAmount: 123 },
        alternativeReadings: [],
        partsOfSpeech: ['noun', 'suru verb'],
        definitions: [{
            senseIndex: 0,
            englishMeanings: ['review; revision'],
            pos: ['noun'],
        }],
        pitchAccents: [0],
        knownStates: [],
        composedOf: [{
            wordId: 101,
            readingIndex: 0,
            reading: '復',
            readingFurigana: '復[ふく]',
            mainDefinition: 'again; restore',
            frequencyRank: null,
            matchSurface: '復',
            audioUrls: ['https://audio.example.test/fuku.mp3'],
        }, {
            wordId: 102,
            readingIndex: 0,
            reading: '習',
            readingFurigana: '習[しゅう]',
            mainDefinition: 'learn',
            frequencyRank: null,
            matchSurface: '習',
        }],
        usedIn: [{
            wordId: 103,
            readingIndex: 0,
            reading: '復習会',
            readingFurigana: '復習会[ふくしゅうかい]',
            mainDefinition: 'review session',
            frequencyRank: 32000,
            matchSurface: '復習会',
            audioUrls: ['https://audio.example.test/fukushukai.mp3'],
        }],
        usedInTotal: 1,
    };
}

function jitenExamplePayload() {
    return [{
        sentenceId: 99,
        text: '毎日復習する。',
        wordPosition: 2,
        wordLength: 2,
        difficulty: null,
        sourceTitle: 'Jiten examples',
        audioUrls: ['https://audio.example.test/review-sentence.mp3'],
    }];
}

function textResponse(status, responseText) {
    return { status, responseText, contentType: 'text/plain; charset=utf-8' };
}

function serveRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = STATIC_ROUTES.get(url.pathname.replace(/\/+$/, '') || '/');
    if (!route) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    if (route[0] === null) {
        response.writeHead(200, { 'content-type': route[1] });
        response.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body>seed</body></html>');
        return;
    }
    if (!existsSync(route[0])) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Missing built artifact');
        return;
    }
    serveFile(response, route[0], route[1], request.method ?? 'GET');
}

async function seedJitendexDictionary(page) {
    await page.evaluate(async ({ term, reading }) => {
        const deleteRequest = indexedDB.deleteDatabase('jpdb-popup-reader-yomitan');
        await new Promise((resolve, reject) => {
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
            deleteRequest.onblocked = () => resolve();
        });
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onupgradeneeded = () => {
                const db = request.result;
                const tx = request.transaction;
                const ensureStore = name => db.objectStoreNames.contains(name)
                    ? tx.objectStore(name)
                    : db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
                const ensureIndex = (store, name, keyPath) => {
                    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
                };
                const terms = ensureStore('terms');
                ensureIndex(terms, 'expression', 'expression');
                ensureIndex(terms, 'reading', 'reading');
                ensureIndex(terms, 'dictionary', 'dictionary');
                const termSearch = ensureStore('termSearch');
                ensureIndex(termSearch, 'token', 'token');
                ensureIndex(termSearch, 'dictionary', 'dictionary');
                const termKanji = ensureStore('termKanji');
                ensureIndex(termKanji, 'character', 'character');
                ensureIndex(termKanji, 'dictionary', 'dictionary');
                const termMeta = ensureStore('termMeta');
                ensureIndex(termMeta, 'expression', 'expression');
                ensureIndex(termMeta, 'dictionary', 'dictionary');
                const kanji = ensureStore('kanji');
                ensureIndex(kanji, 'character', 'character');
                ensureIndex(kanji, 'dictionary', 'dictionary');
                if (!db.objectStoreNames.contains('dictionaryInfo')) db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['dictionaryInfo', 'terms', 'termSearch', 'termKanji'], 'readwrite');
            const entry = {
                expression: term,
                reading,
                glossary: [
                    'local Jitendex fixture; should not appear inside the Jiten source',
                    { type: 'structured-content', content: { tag: 'div', content: 'ローカル辞書の例。' } },
                ],
                score: 10,
                dictionary: 'Jitendex',
            };
            tx.objectStore('dictionaryInfo').put({ title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms', counts: { terms: 1 } });
            tx.objectStore('terms').add(entry);
            for (const token of [term, reading, 'review', 'revision']) tx.objectStore('termSearch').add({ ...entry, token });
            for (const character of Array.from(term)) tx.objectStore('termKanji').add({ ...entry, character });
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }, { term: TERM, reading: READING });
}
