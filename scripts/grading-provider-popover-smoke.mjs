#!/usr/bin/env node
// E2E smoke for the dual SRS grading provider: with BOTH a jpdb and a jiten key,
// a word present in both services shows a provider toggle in the popover header.
// Toggling flips the deck/grade buttons between JPDB and Jiten, and grading
// dispatches to the chosen service. Produces before/after screenshots.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'grading-provider-popover');
const PAGE_PATH = '/grading-provider.html';
const TERM = '復習';
const SENTENCE = `毎日${TERM}するのが大切です。`;
const REQUEST_BRIDGE_NAME = '__yomuGradingProviderSmokeRequest';
const JITEN_WORD_ID = 1500800;
const JITEN_READING_INDEX = 0;

// [surface, spelling, reading, gloss, partOfSpeech, frequency, state, pitch]
const JPDB_VOCAB = [
    [TERM, TERM, 'ふくしゅう', 'review', ['n', 'vs'], 1200, ['new'], ['LHHH']],
    ['毎日', '毎日', 'まいにち', 'every day', ['n'], 300, ['known'], ['LHHH']],
    ['大切', '大切', 'たいせつ', 'important', ['adj-na'], 400, ['known'], ['LHHH']],
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'jpdb-smoke-key',
    jitenApiKey: 'jiten-smoke-key',
    jpdbMiningEnabled: true,
    enableReviews: true,
    apiGradingProvider: 'jpdb',
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: true,
    localDictionariesEnabled: false,
    showPitchAccent: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    showFloatingButton: false,
    enableLogging: false,
};

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        return response.end('Not found');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>grading provider smoke</title></head>
<body><main><p data-smoke-sentence style="font-size:22px;line-height:2">${SENTENCE}</p></main></body></html>`);
}, 'Could not bind grading provider smoke server');

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const requests = [];

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 820 } });
    const page = await context.newPage();
    page.on('pageerror', error => requests.push({ pageerror: String(error) }));
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => handleRequest(request));
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings, requestBridgeName: REQUEST_BRIDGE_NAME });
    await page.route(/https?:\/\/(?:[^/]*jpdb\.io|[^/]*api\.jiten\.moe|[^/]*workers\.dev)\//, route => {
        const response = handleRequest({ method: route.request().method(), url: route.request().url(), headers: route.request().headers(), data: route.request().postData() ?? '' });
        return route.fulfill({ status: response.status, contentType: response.contentType ?? 'application/json; charset=utf-8', body: response.responseText ?? '' });
    });

    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });

    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 20_000 });
    const word = page.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: TERM }).first();
    assert(await word.count() === 1, 'jpdb parse did not render the 復習 reader word');
    await word.click();
    await page.waitForSelector('.jpdb-reader-popover', { state: 'visible', timeout: 8_000 });

    // The toggle only appears once the Jiten identity is enriched onto the card.
    await page.waitForSelector('[data-action="grade-provider-toggle"]', { state: 'visible', timeout: 10_000 });
    const jpdbState = await readPopoverState(page);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'jpdb-grading.png'), fullPage: false });
    assert(jpdbState.providerLabel.includes('JPDB'), 'Default provider label is not JPDB', jpdbState);
    assert(jpdbState.gradeTargets.every(target => target === 'jpdb'), 'Default grade buttons are not targeting JPDB', jpdbState);
    assert(jpdbState.gradeCount >= 4, 'JPDB grade buttons missing', jpdbState);

    // Grade with JPDB.
    await page.locator('.jpdb-reader-actions [data-action="grade"][data-grade="okay"]').first().click();
    await page.waitForTimeout(600);
    assert(requestCount('jpdb.io', '/review') >= 1, 'JPDB review request was not sent on grade', summarizeRequests());

    // Flip to Jiten via the header toggle and re-open if needed.
    await ensurePopover(page, word);
    await page.locator('[data-action="grade-provider-toggle"]').first().click();
    await page.waitForFunction(() => (document.querySelector('.jpdb-reader-meta')?.textContent ?? '').includes('Jiten'), null, { timeout: 6_000 });
    const jitenState = await readPopoverState(page);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'jiten-grading.png'), fullPage: false });
    assert(jitenState.providerLabel.includes('Jiten'), 'Toggled provider label is not Jiten', jitenState);
    assert(jitenState.gradeTargets.every(target => target === 'jiten'), 'After toggle, grade buttons are not targeting Jiten', jitenState);
    // No second provider switcher on the grade row — the header toggle is the only one.
    assert(!jitenState.hasReviewTargetSelect, 'Unexpected second provider selector on the grade row', jitenState);
    // The jiten popover follows the JPDB pattern: no Mining/Suspended/Forget row.
    assert(!/data-action="jiten-(mining|suspend|forget)"/.test(jitenState.actionsHtml), 'Jiten popover still renders the Mining/Suspended/Forget row', { actionsHtml: jitenState.actionsHtml.slice(0, 400) });
    assert(/data-action="deck-picker"/.test(jitenState.actionsHtml) && /data-action="neverforget"/.test(jitenState.actionsHtml), 'Jiten popover is missing the JPDB-style deck actions', { actionsHtml: jitenState.actionsHtml.slice(0, 400) });

    // Grade with Jiten.
    await page.locator('.jpdb-reader-actions [data-action="grade"][data-grade="okay"]').first().click();
    await page.waitForTimeout(600);
    assert(requestCount('api.jiten.moe', '/srs/review') >= 1, 'Jiten review request was not sent on grade', summarizeRequests());

    // Kanji facts: navigate to a kanji and confirm the source is branded "Jiten"
    // (not the old "Jiten kanji facts" / "Kanji facts" label). The jpdb kanji
    // card needs the kanji-study companion + a scraped jpdb page, so this smoke
    // verifies the Jiten side of the relabel via the core render path.
    await ensurePopover(page, word);
    await page.locator('.jpdb-reader-popover [data-action="kanji"][data-kanji="復"]').first().click();
    await page.waitForSelector('.jpdb-reader-jiten-kanji', { state: 'attached', timeout: 8_000 });
    const kanjiSourceTitle = await page.evaluate(() => document.querySelector('.jpdb-reader-jiten-kanji > summary')?.textContent?.trim() ?? '');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'kanji-facts.png'), fullPage: false });
    assert(kanjiSourceTitle === 'Jiten', `Jiten kanji-fact section is not branded "Jiten"`, { kanjiSourceTitle });

    const report = {
        ok: true,
        term: TERM,
        jpdbState,
        jitenState,
        jpdbReviewRequests: requestCount('jpdb.io', '/review'),
        jitenReviewRequests: requestCount('api.jiten.moe', '/srs/review'),
        readerParseRequests: requestCount('api.jiten.moe', '/reader/parse'),
        requests: summarizeRequests(),
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, jpdbState, jitenState, jpdbReviewRequests: report.jpdbReviewRequests, jitenReviewRequests: report.jitenReviewRequests }, null, 2));
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function ensurePopover(page, word) {
    if (await page.locator('.jpdb-reader-popover').count() && await page.locator('.jpdb-reader-popover').first().isVisible()) return;
    await word.click();
    await page.waitForSelector('.jpdb-reader-popover', { state: 'visible', timeout: 8_000 });
    await page.waitForSelector('[data-action="grade-provider-toggle"]', { state: 'visible', timeout: 10_000 });
}

async function readPopoverState(page) {
    return page.evaluate(() => {
        const grades = [...document.querySelectorAll('.jpdb-reader-actions [data-action="grade"][data-grade]')];
        return {
            providerLabel: document.querySelector('.jpdb-reader-provider-status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            hasToggle: Boolean(document.querySelector('[data-action="grade-provider-toggle"]')),
            gradeCount: grades.length,
            gradeTargets: grades.map(button => button.dataset.reviewTarget ?? ''),
            hasReviewTargetSelect: Boolean(document.querySelector('[data-review-target-select]')),
            actionsHtml: document.querySelector('.jpdb-reader-actions')?.innerHTML ?? '',
        };
    });
}

function handleRequest(request) {
    const url = new URL(request.url);
    const summary = { host: url.host, path: `${url.pathname}${url.search}`, method: request.method ?? 'GET' };
    requests.push(summary);
    let body = {};
    try { body = request.data ? JSON.parse(request.data) : {}; } catch { body = {}; }
    if (url.host.includes('jpdb.io')) return mockJpdb(url.pathname, body);
    if (url.host.includes('api.jiten.moe')) return mockJiten(url.pathname);
    return { status: 503, responseText: '', contentType: 'text/plain; charset=utf-8' };
}

function mockJpdb(pathname, body) {
    if (pathname.endsWith('/parse')) return jsonHttpResponse(mockJpdbParseFromVocabulary(body, JPDB_VOCAB));
    if (pathname.endsWith('/list-user-decks')) return jsonHttpResponse({ decks: [] });
    if (pathname.endsWith('/ping')) return jsonHttpResponse({});
    // review / deck add+remove / set-card-sentence / lookup-vocabulary etc.
    return jsonHttpResponse({});
}

function mockJiten(pathname) {
    if (pathname.endsWith('/reader/parse')) {
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
    if (pathname === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/info`) {
        return jsonHttpResponse({
            wordId: JITEN_WORD_ID,
            mainReading: { text: TERM, readingIndex: JITEN_READING_INDEX, frequencyRank: 12435 },
            alternativeReadings: [],
            partsOfSpeech: ['noun', 'suru verb'],
            definitions: [{ senseIndex: 0, englishMeanings: ['review; revision'], pos: ['noun'] }],
            pitchAccents: [0],
            knownStates: [],
            composedOf: [],
            usedIn: [],
            usedInTotal: 0,
        });
    }
    if (pathname.includes('/random-example-sentences')) return jsonHttpResponse([]);
    if (pathname.endsWith('/srs/reader-study-decks') || pathname.endsWith('/srs/study-decks')) return jsonHttpResponse([]);
    if (/^\/api\/kanji\/[^/]+$/.test(pathname)) {
        return jsonHttpResponse({
            character: decodeURIComponent(pathname.split('/').pop() ?? ''),
            onReadings: ['フク'],
            kunReadings: [],
            meanings: ['restore; return'],
            strokeCount: 12,
            jlptLevel: 2,
            grade: 5,
            topWords: [],
            wordsByReading: [],
        });
    }
    // srs/review, srs/set-vocabulary-state, kanji words, etc.
    return jsonHttpResponse({});
}

function requestCount(host, pathFragment) {
    return requests.filter(request => request.host?.includes(host) && request.path?.includes(pathFragment)).length;
}

function summarizeRequests() {
    return requests.filter(request => request.host).map(request => `${request.method} ${request.host}${request.path}`);
}
