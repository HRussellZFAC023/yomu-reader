#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
} = createSmokePaths(import.meta.dirname);
const COMPANION_SCRIPT_PATHS = userscriptCompanionPaths(SCRIPT_PATH);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...COMPANION_SCRIPT_PATHS], ROOT, 'Run npm run build first.');
mkdirSync(ARTIFACTS, { recursive: true });

// Keep each fixture term inside the parser's maximum lexeme length. The old
// 90-character pseudo-words could never be an authoritative span after the
// span resolver was introduced, so the smoke timed out while testing an
// impossible dictionary entry instead of testing request concurrency.
const CAT_SURFACE = '猫'.repeat(12);
const DOG_SURFACE = '犬'.repeat(12);
const BIRD_SURFACE = '鳥'.repeat(12);
const FIRST_PARAGRAPH = Array.from({ length: 200 }, () => CAT_SURFACE).join(' ');
const SECOND_PARAGRAPH = Array.from({ length: 200 }, () => DOG_SURFACE).join(' ');
const THIRD_PARAGRAPH = Array.from({ length: 200 }, () => BIRD_SURFACE).join(' ');
const VOCABULARY = [
    [CAT_SURFACE, CAT_SURFACE, 'ねこ', 'cat', ['n'], 800, ['not-in-deck'], ['LH']],
    [DOG_SURFACE, DOG_SURFACE, 'いぬ', 'dog', ['n'], 900, ['not-in-deck'], ['LH']],
    [BIRD_SURFACE, BIRD_SURFACE, 'とり', 'bird', ['n'], 1000, ['not-in-deck'], ['LH']],
];
const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    parserProvider: 'jpdb',
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'pitch',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};
const REQUEST_HANDLERS = new Map([
    ['https://jpdb.io/api/v1/parse', handleJpdbParseRequest],
    ['https://jpdb.io/search', handlePublicPitchRequest],
    ['https://api.jiten.moe/api/vocabulary/parse', handleJitenReadingFallbackRequest],
]);

const server = await startLoopbackServer(serveFixture, 'Could not bind enrichment concurrency smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const requests = [];
const parseState = {
    active: 0,
    maxActive: 0,
    firstReleasedAfterRequestCount: 0,
    firstRequestHeld: false,
    releaseFirst: undefined,
};

try {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('console', message => {
        if (process.env.SMOKE_DEBUG) console.error('[enrichment-concurrency]', message.type(), message.text());
    });
    await page.exposeFunction('__yomuEnrichmentConcurrencyRequest', request => handleYomuRequest(request, requests, parseState));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: SETTINGS,
        requestBridgeName: '__yomuEnrichmentConcurrencyRequest',
    });

    await page.goto(`${server.origin}/concurrency/`, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-reader-word').length >= 2, null, { timeout: 20_000 });
    await page.waitForFunction(bird => [...document.querySelectorAll('.jpdb-reader-word')]
        .some(word => word.getAttribute('data-expression') === bird), BIRD_SURFACE, { timeout: 20_000 });

    const state = await page.evaluate(({ cat, dog, bird }) => {
        const words = [...document.querySelectorAll('.jpdb-reader-word')].filter(word => word instanceof HTMLElement);
        return {
            wordCount: words.length,
            surfaces: words.slice(0, 10).map(word => word.dataset.expression || word.textContent?.trim() || ''),
            hasCat: words.some(word => word.dataset.expression === cat),
            hasDog: words.some(word => word.dataset.expression === dog),
            hasBird: words.some(word => word.dataset.expression === bird),
            pitchCount: words.filter(word => /\bjpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka)\b/u.test(word.className)).length,
        };
    }, { cat: CAT_SURFACE, dog: DOG_SURFACE, bird: BIRD_SURFACE });
    const report = {
        ...state,
        parseRequestCount: requests.filter(request => request.kind === 'jpdb-parse').length,
        maxConcurrentParseRequests: parseState.maxActive,
        firstReleasedAfterRequestCount: parseState.firstReleasedAfterRequestCount,
        requests,
    };
    assert(report.parseRequestCount >= 2, 'Large visible page did not split parse work into multiple JPDB batches', report);
    assert(report.maxConcurrentParseRequests >= 2, 'JPDB parse batches were fetched strictly one-by-one', report);
    assert(report.firstReleasedAfterRequestCount >= 2, 'Second JPDB parse request did not start before the first response was released', report);
    assert(report.hasCat && report.hasDog && report.hasBird, 'Concurrent parse results did not map back to every visible paragraph', report);
    assert(!requests.some(request => request.kind === 'unexpected'), 'Concurrency fixture received an unhandled request', report);

    const reportPath = path.join(ARTIFACTS, 'enrichment-concurrency.json');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    console.log(`Enrichment concurrency smoke passed: ${reportPath}`);
    await context.close();
} finally {
    await browser.close().catch(() => undefined);
    server.server.closeAllConnections?.();
    server.server.closeIdleConnections?.();
    await closeServer(server.server);
}

async function handleYomuRequest(request, requestsLog, state) {
    return requestHandlerFor(request)(request, requestsLog, state);
}

async function handleJpdbParseRequest(request, requestsLog, state) {
    const body = readJsonBody(request.data);
    const text = Array.isArray(body.text) ? body.text.map(value => String(value)) : [];
    const entry = { kind: 'jpdb-parse', textLengths: text.map(value => value.length), firstCharacter: text[0]?.slice(0, 1) ?? '' };
    requestsLog.push(entry);
    return withActiveParse(state, () => parseResponseForEntry(body, requestsLog, state));
}

function requestHandlerFor(request) {
    return REQUEST_HANDLERS.get(requestRouteKey(request.url)) ?? handleUnexpectedRequest;
}

function requestRouteKey(urlString) {
    const url = new URL(urlString);
    return `${url.origin}${url.pathname}`;
}

async function withActiveParse(state, task) {
    state.active += 1;
    state.maxActive = Math.max(state.maxActive, state.active);
    try {
        return await task();
    } finally {
        state.active -= 1;
    }
}

function parseResponseForEntry(body, requestsLog, state) {
    if (!state.firstRequestHeld) {
        state.firstRequestHeld = true;
        return holdFirstParseResponse(body, requestsLog, state);
    }
    return releaseHeldParseAndRespond(body, state);
}

function releaseHeldParseAndRespond(body, state) {
    state.releaseFirst?.();
    return jpdbParseResponse(body);
}

function holdFirstParseResponse(body, requestsLog, state) {
    return new Promise(resolve => {
        const timeout = setTimeout(() => resolveHeldParseResponse(body, requestsLog, state, resolve), 4000);
        state.releaseFirst = () => {
            clearTimeout(timeout);
            resolveHeldParseResponse(body, requestsLog, state, resolve);
        };
    });
}

function resolveHeldParseResponse(body, requestsLog, state, resolve) {
    state.firstReleasedAfterRequestCount = requestsLog.filter(item => item.kind === 'jpdb-parse').length;
    resolve(jpdbParseResponse(body));
}

function jpdbParseResponse(body) {
    return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
}

function handlePublicPitchRequest(request, requestsLog) {
    requestsLog.push({ kind: 'jpdb-public-pitch', url: request.url });
    return { status: 200, responseText: '<!doctype html><html><body></body></html>', contentType: 'text/html; charset=utf-8' };
}

function handleJitenReadingFallbackRequest(request, requestsLog) {
    const textLength = new URL(request.url).searchParams.get('text')?.length ?? 0;
    requestsLog.push({ kind: 'jiten-reading-fallback', textLength });
    return { status: 404, responseText: '' };
}

function handleUnexpectedRequest(request, requestsLog) {
    requestsLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}

function serveFixture(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/concurrency/' || url.pathname === '/concurrency/index.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>よむ enrichment concurrency</title>
<style>
body { margin: 0; font: 18px/1.5 system-ui, sans-serif; color: #172033; }
main { padding: 32px; --jpdb-reader-source-pitch-decoration: #0f766e; --jpdb-reader-source-pitch-color: #172033; }
p { max-width: 920px; height: 22px; margin: 0 0 10px; overflow: hidden; white-space: nowrap; }
</style></head><body><main class="jpdb-reader-word-underline-pitch jpdb-reader-word-text-pitch">
<p>${FIRST_PARAGRAPH}</p>
<p>${SECOND_PARAGRAPH}</p>
<p>${THIRD_PARAGRAPH}</p>
</main></body></html>`);
        return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}
