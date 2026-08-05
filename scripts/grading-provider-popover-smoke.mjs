#!/usr/bin/env node
// E2E smoke for the dual SRS grading provider: with BOTH a jpdb and a jiten key,
// a word present in both services shows a provider toggle beside the grade target.
// Toggling flips the deck/grade buttons between Jiten and JPDB, and grading
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
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';
import { assertPopoverHeadwordMatchesLookup } from './lib/smoke-wait-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SMOKE_VIEWPORT = smokeViewportName(process.env.YOMU_GRADING_PROVIDER_SMOKE_VIEWPORT);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'grading-provider-popover', SMOKE_VIEWPORT);
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
    furiganaMode: 'known-status',
    furiganaHiddenStateGroups: ['known'],
    audioEnabled: false,
    autoPlayAudio: false,
    audioAutoPlayMode: 'off',
    audioSources: [],
    audioEnableDefaultSources: false,
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
assertBuiltArtifacts(userscriptCompanionPaths(SCRIPT_PATH), ROOT, 'Run npm run build first.');

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
const browserEvents = [];
let jitenKnownState = [0];
let jitenParseCalls = 0;

try {
    const context = await browser.newContext({ bypassCSP: true, ...smokeContextOptions(SMOKE_VIEWPORT) });
    const page = await context.newPage();
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            browserEvents.push({ type: message.type(), text: message.text() });
        }
    });
    page.on('pageerror', error => browserEvents.push({ type: 'pageerror', text: String(error) }));
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => handleRequest(request));
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings, requestBridgeName: REQUEST_BRIDGE_NAME });
    await page.route(/https?:\/\/(?:[^/]*jpdb\.io|[^/]*api\.jiten\.moe|[^/]*workers\.dev)\//, route => {
        const response = handleRequest({ method: route.request().method(), url: route.request().url(), headers: route.request().headers(), data: route.request().postData() ?? '' });
        return route.fulfill({ status: response.status, contentType: response.contentType ?? 'application/json; charset=utf-8', body: response.responseText ?? '' });
    });

    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);

    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 20_000 });
    const word = page.locator(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${TERM}"]`).first();
    assert(await word.count() === 1, 'jpdb parse did not render the 復習 reader word');
    await word.click();
    await page.waitForSelector('.jpdb-reader-popover', { state: 'visible', timeout: 8_000 });
    // Before any kanji navigation: renderKanjiCardShell replaces the title row,
    // so .jpdb-reader-spelling stops existing once kanji details are open.
    await assertPopoverHeadwordMatchesLookup(page, word, { label: 'grading-provider first open' });

    // The toggle only appears once the Jiten identity is enriched onto the card.
    await waitForProviderToggle(page);
    const initialState = await readPopoverState(page);
    assert(initialState.toggleInTargetGutter, 'Provider toggle is not in the review target gutter', initialState);
    assert(initialState.labelInsideProviderToggle, 'Provider label is not part of the provider-toggle touch surface', initialState);

    const jpdbState = await ensureProvider(page, word, 'JPDB');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'jpdb-grading.png'), fullPage: false });
    assert(jpdbState.providerLabel.includes('JPDB'), 'Provider label did not switch to JPDB', jpdbState);
    assert(jpdbState.gradeTargets.every(target => target === 'jpdb'), 'Default grade buttons are not targeting JPDB', jpdbState);
    assert(jpdbState.gradeCount >= 4, 'JPDB grade buttons missing', jpdbState);

    // Grade with JPDB.
    await page.locator('.jpdb-reader-actions [data-action="grade"][data-grade="okay"]').first().click();
    await page.waitForTimeout(600);
    assert(requestCount('jpdb.io', '/review') >= 1, 'JPDB review request was not sent on grade', summarizeRequests());

    await ensurePopover(page, word);
    const jitenState = await ensureProvider(page, word, 'Jiten');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'jiten-grading.png'), fullPage: false });
    assert(jitenState.providerLabel.includes('Jiten'), 'Toggled provider label is not Jiten', jitenState);
    assert(jitenState.gradeTargets.every(target => target === 'jiten'), 'After toggle, grade buttons are not targeting Jiten', jitenState);
    assert(jitenState.toggleInTargetGutter, 'Provider toggle left the review target gutter after switching', jitenState);
    assert(jitenState.labelInsideProviderToggle, 'Jiten label is not part of the provider-toggle touch surface', jitenState);
    // No second provider switcher on the grade row — the review target gutter toggle is the only one.
    assert(!jitenState.hasReviewTargetSelect, 'Unexpected second provider selector on the grade row', jitenState);
    // The jiten popover follows the JPDB pattern: no Mining/Suspended/Forget row.
    assert(!/data-action="jiten-(mining|suspend|forget)"/.test(jitenState.actionsHtml), 'Jiten popover still renders the Mining/Suspended/Forget row', { actionsHtml: jitenState.actionsHtml.slice(0, 400) });
    assert(/data-action="deck-picker"/.test(jitenState.actionsHtml) && /data-action="neverforget"/.test(jitenState.actionsHtml), 'Jiten popover is missing the JPDB-style deck actions', { actionsHtml: jitenState.actionsHtml.slice(0, 400) });

    // Grade with Jiten.
    await page.locator('.jpdb-reader-actions [data-action="grade"][data-grade="okay"]').first().click();
    const repaintState = await waitForReviewedWordRepaint(page);
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
    assert(browserEvents.length === 0, 'Browser console/page errors occurred during grading-provider smoke', { browserEvents });

    const report = {
        ok: true,
        viewport: SMOKE_VIEWPORT,
        term: TERM,
        jpdbState,
        jitenState,
        repaintState,
        jpdbReviewRequests: requestCount('jpdb.io', '/review'),
        jitenReviewRequests: requestCount('api.jiten.moe', '/srs/review'),
        readerParseRequests: requestCount('api.jiten.moe', '/reader/parse'),
        browserEvents,
        requests: summarizeRequests(),
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, viewport: SMOKE_VIEWPORT, jpdbState, jitenState, repaintState, jpdbReviewRequests: report.jpdbReviewRequests, jitenReviewRequests: report.jitenReviewRequests }, null, 2));
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

async function waitForProviderToggle(page) {
    await withPopoverTimeoutReport(page, 'provider-toggle-timeout', () =>
        page.waitForSelector('[data-action="grade-provider-toggle"]', { state: 'visible', timeout: 10_000 }));
}

// Every wait in this smoke fails the same way -- a popover that never reached the
// state being waited for -- so the snapshot that explains it is written once here
// instead of being hand-rolled per wait (only the toggle wait ever had one).
async function withPopoverTimeoutReport(page, reportName, operation) {
    try {
        return await operation();
    } catch (error) {
        writeFileSync(
            path.join(ARTIFACT_DIR, `${reportName}.json`),
            JSON.stringify(await popoverTimeoutSnapshot(page), null, 2),
        );
        throw error;
    }
}

async function popoverTimeoutSnapshot(page) {
    return {
        state: await readPopoverState(page),
        requests: summarizeRequests(),
        browserEvents,
        words: await page.evaluate(() => [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')].map(word => word instanceof HTMLElement ? {
            text: word.textContent?.replace(/\s+/g, '') ?? '',
            expression: word.dataset.expression ?? '',
            source: word.dataset.cardSource ?? '',
            state: word.dataset.cardState ?? '',
            className: word.className,
        } : null)),
        popover: await page.evaluate(() => {
            const popover = document.querySelector('.jpdb-reader-popover');
            if (!(popover instanceof HTMLElement)) return null;
            return {
                loading: Boolean(popover.querySelector('[data-card-details-loading]')),
                blocked: popover.querySelector('.jpdb-reader-review-blocked')?.textContent?.trim() ?? '',
                text: popover.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1000) ?? '',
                html: popover.innerHTML.slice(0, 3000),
            };
        }),
    };
}

async function ensureProvider(page, word, providerLabel) {
    await ensurePopover(page, word);
    let state = await readPopoverState(page);
    if (state.providerLabel.includes(providerLabel)) {
        await waitForProviderReady(page, providerLabel);
        return await readPopoverState(page);
    }
    await page.locator('[data-action="grade-provider-toggle"]').first().click();
    await waitForProviderReady(page, providerLabel);
    state = await readPopoverState(page);
    assert(state.providerLabel.includes(providerLabel), `Provider label did not switch to ${providerLabel}`, state);
    return state;
}

async function waitForProviderReady(page, providerLabel) {
    await withPopoverTimeoutReport(page, `provider-ready-timeout-${providerLabel.toLowerCase()}`, () => page.waitForFunction(
        label => {
            const providerReady = (document.querySelector('.jpdb-reader-provider-status')?.textContent ?? '').includes(label);
            const hasGrades = document.querySelectorAll('.jpdb-reader-actions [data-action="grade"][data-grade]').length >= 4;
            const toggle = document.querySelector('[data-review-target-gutter] [data-action="grade-provider-toggle"]');
            const current = document.querySelector('[data-review-target-current]');
            return providerReady && hasGrades && Boolean(toggle && current && toggle.contains(current));
        },
        providerLabel,
        { timeout: 8_000 },
    ));
}

async function readPopoverState(page) {
    return page.evaluate(() => {
        const grades = [...document.querySelectorAll('.jpdb-reader-actions [data-action="grade"][data-grade]')];
        const toggle = document.querySelector('[data-review-target-gutter] [data-action="grade-provider-toggle"]');
        const current = document.querySelector('[data-review-target-current]');
        return {
            providerLabel: document.querySelector('.jpdb-reader-provider-status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            hasToggle: Boolean(document.querySelector('[data-action="grade-provider-toggle"]')),
            toggleInTargetGutter: Boolean(document.querySelector('[data-review-target-gutter] [data-action="grade-provider-toggle"]')),
            labelInsideProviderToggle: Boolean(toggle && current && toggle.contains(current)),
            gradeCount: grades.length,
            gradeTargets: grades.map(button => button.dataset.reviewTarget ?? ''),
            hasReviewTargetSelect: Boolean(document.querySelector('[data-review-target-select]')),
            actionsHtml: document.querySelector('.jpdb-reader-actions')?.innerHTML ?? '',
        };
    });
}

async function waitForReviewedWordRepaint(page) {
    try {
        await page.waitForFunction(
            term => {
                const word = [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')]
                    .find(element => element instanceof HTMLElement && element.dataset.expression === term);
                return Boolean(word
                    && word instanceof HTMLElement
                    && word.dataset.cardState === 'mature'
                    && (word.classList.contains('jpdb-mature') || word.classList.contains('jiten-mature'))
                    && !word.classList.contains('jpdb-reader-has-furi')
                    && !word.querySelector('rt,.jpdb-reader-furi'));
            },
            TERM,
            { timeout: 8_000 },
        );
    } catch (error) {
        const debug = {
            reviewedWord: await readReviewedWordState(page),
            popover: await readPopoverState(page),
            requests: summarizeRequests(),
            browserEvents,
        };
        writeFileSync(path.join(ARTIFACT_DIR, 'reviewed-word-repaint-timeout.json'), JSON.stringify(debug, null, 2));
        throw error;
    }
    const state = await readReviewedWordState(page);
    assert(state.cardState === 'mature', 'Reviewed Jiten word did not repaint to the refreshed mature state', state);
    assert(state.hasKnownHighlight, 'Reviewed Jiten word did not gain a known-family highlight class', state);
    assert(!state.hasFuriganaClass && !state.hasRuby, 'Reviewed Jiten word kept stale furigana after entering the hidden known group', state);
    return state;
}

async function readReviewedWordState(page) {
    return page.evaluate(term => {
        const word = [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')]
            .find(element => element instanceof HTMLElement && element.dataset.expression === term);
        if (!(word instanceof HTMLElement)) return { found: false };
        const style = getComputedStyle(word);
        return {
            found: true,
            cardState: word.dataset.cardState ?? '',
            className: word.className,
            hasJpdbMature: word.classList.contains('jpdb-mature'),
            hasJitenMature: word.classList.contains('jiten-mature'),
            hasKnownHighlight: word.classList.contains('jpdb-mature') || word.classList.contains('jiten-mature'),
            hasFuriganaClass: word.classList.contains('jpdb-reader-has-furi'),
            hasRuby: Boolean(word.querySelector('rt,.jpdb-reader-furi')),
            expression: word.dataset.expression ?? '',
            text: word.textContent?.replace(/\s+/g, '') ?? '',
            backgroundImage: style.backgroundImage,
        };
    }, TERM);
}

function handleRequest(request) {
    const url = new URL(request.url);
    const summary = { host: url.host, path: `${url.pathname}${url.search}`, method: request.method ?? 'GET' };
    requests.push(summary);
    let body = {};
    try { body = request.data ? JSON.parse(request.data) : {}; } catch { body = {}; }
    if (url.host.includes('jpdb.io')) return mockJpdb(url.pathname, body);
    if (url.host.includes('api.jiten.moe')) return mockJiten(url.pathname, body);
    return { status: 503, responseText: '', contentType: 'text/plain; charset=utf-8' };
}

function mockJpdb(pathname, body) {
    if (pathname.endsWith('/parse')) return jsonHttpResponse(mockJpdbParseFromVocabulary(body, JPDB_VOCAB));
    if (pathname.endsWith('/list-user-decks')) return jsonHttpResponse({ decks: [] });
    if (pathname.endsWith('/ping')) return jsonHttpResponse({});
    // review / deck add+remove / set-card-sentence / lookup-vocabulary etc.
    return jsonHttpResponse({});
}

function mockJiten(pathname, body = {}) {
    if (pathname.endsWith('/reader/parse')) {
        jitenParseCalls += 1;
        if (jitenParseCalls === 1) {
            return { status: 503, responseText: 'temporary Jiten parse miss', contentType: 'text/plain; charset=utf-8' };
        }
        if (!Array.isArray(body.text) || typeof body.text[0] !== 'string') {
            return { status: 400, responseText: 'missing Jiten reader text', contentType: 'text/plain; charset=utf-8' };
        }
        const text = body.text[0];
        const start = text.indexOf(TERM);
        if (start < 0) {
            return { status: 422, responseText: 'Jiten reader text did not contain smoke term', contentType: 'text/plain; charset=utf-8' };
        }
        return jsonHttpResponse({
            tokens: [[{ wordId: JITEN_WORD_ID, readingIndex: JITEN_READING_INDEX, start, end: start + TERM.length, length: TERM.length }]],
            vocabulary: [{
                wordId: JITEN_WORD_ID,
                readingIndex: JITEN_READING_INDEX,
                spelling: TERM,
                reading: '復[ふく]習[しゅう]',
                frequencyRank: 12435,
                partsOfSpeech: ['n', 'vs'],
                meaningsChunks: [['review; revision']],
                meaningsPartOfSpeech: [['n']],
                knownState: jitenKnownState,
                pitchAccents: [0],
            }],
        });
    }
    if (pathname.endsWith('/srs/review')) {
        jitenKnownState = [2];
        return jsonHttpResponse({});
    }
    if (pathname === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/info`) {
        return jsonHttpResponse({
            wordId: JITEN_WORD_ID,
            mainReading: { text: TERM, readingIndex: JITEN_READING_INDEX, frequencyRank: 12435 },
            alternativeReadings: [],
            partsOfSpeech: ['noun', 'suru verb'],
            definitions: [{ senseIndex: 0, englishMeanings: ['review; revision'], pos: ['noun'] }],
            pitchAccents: [0],
            knownStates: jitenKnownState,
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

function smokeViewportName(value) {
    return value === 'ipad' ? 'ipad' : 'desktop';
}

function smokeContextOptions(viewport) {
    if (viewport === 'ipad') {
        return {
            viewport: { width: 820, height: 1180 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        };
    }
    return { viewport: { width: 1100, height: 820 } };
}
