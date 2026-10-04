#!/usr/bin/env node
// E2E smoke for dual SRS grading on an ordinary page: with BOTH a jpdb and a
// jiten key, a word present in both services is graded by the learner's chosen
// grading provider (apiGradingProvider). Since 1.9.1 the provider toggle, the
// provider status and per-service grade targets are account details that only
// render on Yomu-owned Study surfaces (tests/reader/offhost-account-data-privacy
// .test.ts; tests/reader/jpdb/02-sources-mining-drawer-pitch.test.ts pins the
// trusted-surface toggle). So this smoke grades the same word once per
// preference: the page never sees a provider control, and each grade reaches
// only the chosen service. Produces a screenshot per phase.
//
// Decision 2 phases: with the DEFAULT parser the page is parsed by the chosen
// grading service itself, and with an explicit Jiten parser a JPDB grade first
// resolves the word on JPDB; either way exactly one review reaches only the
// chosen service. When JPDB does not have the word, the grade reaches neither
// service and the page says so without naming one.
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
const JITEN_FREQUENCY_RANK = 12435;
// Only the Jiten mocks report this rank (JPDB's mock rank is 1200), so
// its pill proves the Jiten identity was enriched onto the JPDB-parsed card.
const JITEN_RANK_LABEL = `#${JITEN_FREQUENCY_RANK}`;
const NOT_GRADED = 'Not graded: this word was not found in your preferred grading service.';
const NATIVE_GRADES = {
    jpdb: ['nothing', 'something', 'hard', 'okay', 'easy'],
    jiten: ['nothing', 'hard', 'okay', 'easy'],
};

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
    // The first two phases pin JPDB: it parses the page and Jiten's reader
    // parse only enriches the word, so 復習 keeps both identities.
    parserProvider: 'jpdb',
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
// A transient Jiten miss on the first reader parse (the enrichment request
// when JPDB parses the page); phases where Jiten may parse the page skip it.
let jitenTransientMiss = true;
// The unmatched phase: JPDB has no exact match for the graded word.
let jpdbLacksTerm = false;
// srs/reader-study-decks. Jiten takes a single word only into a word list
// (deckType 2); its media decks (deckType 0) answer 400.
const MEDIA_DECK = { userStudyDeckId: 3, name: 'Frieren', deckType: 0 };
const WORD_LIST = { userStudyDeckId: 9, name: 'Mined words', deckType: 2 };
let jitenStudyDecks = [MEDIA_DECK, WORD_LIST];
const parsedTexts = { jpdb: [], jiten: [] };

try {
    const jpdbRun = await runGradingProviderPhase({ name: 'jpdb', grading: 'jpdb', parser: 'jpdb' });
    const jitenRun = await runGradingProviderPhase({ name: 'jiten', grading: 'jiten', parser: 'jpdb' });
    // The default parser (no local dictionary) parses with the grading service.
    const defaultParserJpdbRun = await runGradingProviderPhase({ name: 'default-parser-jpdb', grading: 'jpdb', parser: 'default', pageParsedBy: 'jpdb' });
    const defaultParserJitenRun = await runGradingProviderPhase({ name: 'default-parser-jiten', grading: 'jiten', parser: 'default', pageParsedBy: 'jiten' });
    // An explicit Jiten parser stays Jiten; the JPDB grade resolves the word on JPDB.
    const resolvedRun = await runGradingProviderPhase({ name: 'jiten-parser-jpdb', grading: 'jpdb', parser: 'jiten', pageParsedBy: 'jiten', resolvesOn: 'jpdb' });
    // ...and when JPDB does not have it, nothing is graded anywhere.
    const unmatchedRun = await runGradingProviderPhase({ name: 'jiten-parser-jpdb-unmatched', grading: 'jpdb', parser: 'jiten', pageParsedBy: 'jiten', resolvesOn: 'jpdb', unmatched: true });
    // "Add to deck +" with Jiten grading: the first word list, past a media deck;
    // with no word list, the next destination (the Yomu deck) and no Jiten write.
    const wordListSave = await runJitenSavePhase({ name: 'jiten-save-word-list', decks: [MEDIA_DECK, WORD_LIST], savedTo: WORD_LIST });
    const noWordListSave = await runJitenSavePhase({ name: 'jiten-save-no-word-list', decks: [MEDIA_DECK], savedTo: null });
    const report = { ok: true, viewport: SMOKE_VIEWPORT, term: TERM, jpdbRun, jitenRun, defaultParserJpdbRun, defaultParserJitenRun, resolvedRun, unmatchedRun, wordListSave, noWordListSave, browserEvents };
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        ok: true,
        viewport: SMOKE_VIEWPORT,
        jpdbState: jpdbRun.state,
        jitenState: jitenRun.state,
        repaintState: jitenRun.repaintState,
        kanjiSourceTitle: jitenRun.kanjiSourceTitle,
        jpdbReviewRequests: jpdbRun.reviewRequests,
        jitenReviewRequests: jitenRun.reviewRequests,
        defaultParser: {
            jpdbGrading: { pageParsedBy: defaultParserJpdbRun.pageParsedBy, reviewRequests: defaultParserJpdbRun.reviewRequests },
            jitenGrading: { pageParsedBy: defaultParserJitenRun.pageParsedBy, reviewRequests: defaultParserJitenRun.reviewRequests },
        },
        jitenParserJpdbGrading: { pageParsedBy: resolvedRun.pageParsedBy, resolvedWith: resolvedRun.resolvedWith, reviewRequests: resolvedRun.reviewRequests },
        unmatchedJpdbGrading: { toast: unmatchedRun.toast, reviewRequests: unmatchedRun.reviewRequests },
        jitenSaves: { wordList: wordListSave, noWordList: noWordListSave },
    }, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

// One fresh page per phase: the ordinary-page popover has no switcher, so the
// chosen service comes from settings, exactly as a learner sets it in Study.
async function runGradingProviderPhase(phase) {
    const provider = phase.grading;
    const label = provider === 'jpdb' ? 'JPDB' : 'Jiten';
    const otherProvider = provider === 'jpdb' ? 'jiten' : 'jpdb';
    const { context, page, word } = await openPhasePage(phase);
    // Before any kanji navigation: renderKanjiCardShell replaces the title row,
    // so .jpdb-reader-spelling stops existing once kanji details are open.
    await assertPopoverHeadwordMatchesLookup(page, word, { label: `grading-provider ${provider} first open` });
    const state = await readPopoverState(page);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${phase.name}-grading.png`), fullPage: false });
    assertOrdinaryPageGradingControls(state, label);
    // The grade row carries no provider attribute, but it must still offer the
    // chosen service's own scale (JPDB five grades, Jiten four).
    assert(state.gradeValues.join() === NATIVE_GRADES[provider].join(), `Grade buttons are not ${label}'s own scale`, state);

    await page.locator('.jpdb-reader-actions [data-action="grade"][data-grade="okay"]').first().click();
    const toast = phase.unmatched ? await assertNothingGraded(page) : await assertGradedOnceOn(page, provider, label, otherProvider);
    const pageParsedBy = phase.pageParsedBy ? assertPageParsedBy(phase.pageParsedBy) : null;
    const resolvedWith = phase.resolvesOn ? assertGradeResolvedOn(phase.resolvesOn) : null;

    const repaintState = provider === 'jiten' ? await waitForReviewedWordRepaint(page) : null;
    const kanjiSourceTitle = phase.name === 'jiten' ? await readJitenKanjiSourceTitle(page, word) : null;
    assert(browserEvents.length === 0, 'Browser console/page errors occurred during grading-provider smoke', { browserEvents });
    const { actionsHtml: _actionsHtml, ...reportedState } = state;
    const result = {
        state: reportedState,
        pageParsedBy,
        resolvedWith,
        toast,
        repaintState,
        kanjiSourceTitle,
        reviewRequests: reviewRequestCount(provider),
        readerParseRequests: requestCount('api.jiten.moe', '/reader/parse'),
        requests: summarizeRequests(),
    };
    await context.close();
    return result;
}

async function openPhasePage(phase) {
    const provider = phase.grading;
    requests.length = 0;
    jitenKnownState = [0];
    jitenParseCalls = 0;
    jitenTransientMiss = phase.parser === 'jpdb';
    jpdbLacksTerm = phase.unmatched === true;
    jitenStudyDecks = phase.decks ?? [MEDIA_DECK, WORD_LIST];
    parsedTexts.jpdb.length = 0;
    parsedTexts.jiten.length = 0;
    const context = await browser.newContext({ bypassCSP: true, ...smokeContextOptions(SMOKE_VIEWPORT) });
    const page = await context.newPage();
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            browserEvents.push({ provider, type: message.type(), text: message.text() });
        }
    });
    page.on('pageerror', error => browserEvents.push({ provider, type: 'pageerror', text: String(error) }));
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => routeRequest(request));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: phaseSettings(phase),
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    await page.route(/https?:\/\/(?:[^/]*jpdb\.io|[^/]*api\.jiten\.moe|[^/]*workers\.dev)\//, route => {
        const response = routeRequest({ method: route.request().method(), url: route.request().url(), headers: route.request().headers(), data: route.request().postData() ?? '' });
        return route.fulfill({ status: response.status, contentType: response.contentType ?? 'application/json; charset=utf-8', body: response.responseText ?? '' });
    });

    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);

    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 20_000 });
    const word = page.locator(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${TERM}"]`).first();
    assert(await word.count() === 1, 'jpdb parse did not render the 復習 reader word');
    await ensurePopover(page, word);
    return { context, page, word };
}

// The ordinary page's provider-neutral "Add to deck +": a Jiten save reaches
// only the learner's first word list, and without one the word goes to the
// next destination with no Jiten write. Either way the page hears "Added to deck."
async function runJitenSavePhase(phase) {
    const { context, page } = await openPhasePage({ ...phase, grading: 'jiten', parser: 'default' });
    await page.locator('.jpdb-reader-actions [data-action="add-default"]').first().click();
    await page.waitForFunction(() => [...document.querySelectorAll('.jpdb-reader-toast')].some(toast => (toast.textContent ?? '').includes('Added to deck.')), null, { timeout: 8_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${phase.name}.png`), fullPage: false });
    const writes = requests.filter(request => request.method === 'POST' && /\/srs\/study-decks\/\d+\/words$/.test(request.path)).map(request => request.path);
    const expected = phase.savedTo ? [`/api/srs/study-decks/${phase.savedTo.userStudyDeckId}/words`] : [];
    assert(JSON.stringify(writes) === JSON.stringify(expected), 'Jiten saved the word to the wrong study deck', { writes, expected, requests: summarizeRequests() });
    assert(browserEvents.length === 0, 'Browser console/page errors occurred during the Jiten save', { browserEvents });
    await context.close();
    return { jitenWrites: writes, toast: 'Added to deck.' };
}

async function assertGradedOnceOn(page, provider, label, otherProvider) {
    await withPopoverTimeoutReport(page, `${provider}-review-timeout`, () => waitForReviewRequest(provider));
    // Both services would be called from the same grade click, so a stray
    // second review is already recorded once the chosen one has landed.
    await page.waitForTimeout(600);
    assert(reviewRequestCount(otherProvider) === 0, `A ${label} grade was also sent to the other connected service`, { requests: summarizeRequests() });
    assert(reviewRequestCount(provider) === 1, `The ${label} grade was not sent exactly once`, { requests: summarizeRequests() });
    return null;
}

// The learner is told, in words that name no service, and no review is sent.
async function assertNothingGraded(page) {
    await withPopoverTimeoutReport(page, 'not-graded-timeout', () => page.waitForFunction(
        text => [...document.querySelectorAll('.jpdb-reader-toast')].some(toast => toast.textContent?.includes(text)),
        NOT_GRADED,
        { timeout: 8_000 },
    ));
    await page.waitForTimeout(600);
    assert(reviewRequestCount('jpdb') === 0 && reviewRequestCount('jiten') === 0, 'A word the grading service lacks was graded somewhere', { requests: summarizeRequests() });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'jiten-parser-jpdb-unmatched-toast.png'), fullPage: false });
    return NOT_GRADED;
}

// 'default' drops parserProvider, so normalization applies the real default.
function phaseSettings(phase) {
    const { parserProvider: _pinned, ...unpinned } = settings;
    const parser = phase.parser === 'default' ? {} : { parserProvider: phase.parser };
    return { ...unpinned, ...parser, apiGradingProvider: phase.grading };
}

// The page sentence itself (not a single term) reached exactly one service.
function assertPageParsedBy(service) {
    const other = service === 'jpdb' ? 'jiten' : 'jpdb';
    const sentPage = name => parsedTexts[name].some(texts => texts.some(text => text.includes(SENTENCE.slice(0, -1))));
    assert(sentPage(service) && !sentPage(other), `The page was not parsed by ${service} alone`, { parsedTexts, requests: summarizeRequests() });
    return service;
}

// The graded word was looked up on the grading service by its spelling alone.
function assertGradeResolvedOn(service) {
    assert(parsedTexts[service].some(texts => texts.length === 1 && texts[0] === TERM), `The grade did not resolve ${TERM} on ${service}`, { parsedTexts });
    return { service, texts: parsedTexts[service].filter(texts => texts.includes(TERM)) };
}

// Grade buttons stay on the page, but nothing that names or switches the
// account-backed service may: the page owns this DOM and can read it.
function assertOrdinaryPageGradingControls(state, label) {
    const actions = { actionsHtml: state.actionsHtml.slice(0, 600) };
    assert(state.jitenIdentityShown, 'Jiten identity was not enriched onto the dual-key card before grading', state);
    assert(!state.hasToggle, 'The grading-provider toggle rendered on an ordinary page', state);
    assert(!state.providerLabel, 'The account provider status rendered on an ordinary page', state);
    assert(state.gradeTargets.every(target => target === ''), 'Grade buttons exposed their review target to the page', state);
    assert(!state.hasReviewTargetSelect, 'A review-target selector rendered on an ordinary page', state);
    assert(!state.hasAddDeckSelect, 'The account deck selector rendered on an ordinary page', state);
    assert(!/data-action="(?:deck-picker|neverforget|blacklist|jiten-(?:mining|suspend|forget))"/.test(state.actionsHtml), 'Account deck-state actions rendered on an ordinary page', actions);
    assert(/data-action="add-default"/.test(state.actionsHtml), 'The provider-neutral Add to deck action is missing', actions);
}

async function waitForReviewRequest(provider) {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
        if (reviewRequestCount(provider) >= 1) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`${provider} review request was not sent on grade: ${JSON.stringify(summarizeRequests())}`);
}

function reviewRequestCount(provider) {
    return provider === 'jpdb'
        ? requestCount('jpdb.io', '/api/v1/review')
        : requestCount('api.jiten.moe', '/srs/review');
}

// Kanji facts: navigate to a kanji and confirm the source is branded "Jiten"
// (not the old "Jiten kanji facts" / "Kanji facts" label). The jpdb kanji
// card needs the kanji-study companion + a scraped jpdb page, so this smoke
// verifies the Jiten side of the relabel via the core render path.
async function readJitenKanjiSourceTitle(page, word) {
    await ensurePopover(page, word);
    await page.locator('.jpdb-reader-popover [data-action="kanji"][data-kanji="復"]').first().click();
    await withPopoverTimeoutReport(page, 'kanji-facts-timeout', () =>
        page.waitForSelector('.jpdb-reader-jiten-kanji', { state: 'attached', timeout: 8_000 }));
    const kanjiSourceTitle = await page.evaluate(() => document.querySelector('.jpdb-reader-jiten-kanji > summary')?.textContent?.trim() ?? '');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'kanji-facts.png'), fullPage: false });
    assert(kanjiSourceTitle === 'Jiten', `Jiten kanji-fact section is not branded "Jiten"`, { kanjiSourceTitle });
    return kanjiSourceTitle;
}

async function ensurePopover(page, word) {
    if (!(await page.locator('.jpdb-reader-popover').count() && await page.locator('.jpdb-reader-popover').first().isVisible())) {
        await word.click();
        await page.waitForSelector('.jpdb-reader-popover', { state: 'visible', timeout: 8_000 });
    }
    await waitForGradesReady(page);
}

// Grades are ready once they render and the Jiten identity (its #rank pill,
// which only Jiten's reader parse supplies) is on the card: before that the
// card is JPDB-only and a Jiten preference could not apply to it.
async function waitForGradesReady(page) {
    await withPopoverTimeoutReport(page, 'grades-ready-timeout', () => page.waitForFunction(
        rank => document.querySelectorAll('.jpdb-reader-actions [data-action="grade"][data-grade]').length >= 4
            && [...document.querySelectorAll('.jpdb-reader-popover .jpdb-reader-pill')].some(pill => (pill.textContent ?? '').includes(rank)),
        JITEN_RANK_LABEL,
        { timeout: 10_000 },
    ));
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

async function readPopoverState(page) {
    return page.evaluate(rank => {
        const grades = [...document.querySelectorAll('.jpdb-reader-actions [data-action="grade"][data-grade]')];
        return {
            providerLabel: document.querySelector('.jpdb-reader-provider-status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            hasToggle: Boolean(document.querySelector('[data-action="grade-provider-toggle"]')),
            jitenIdentityShown: [...document.querySelectorAll('.jpdb-reader-popover .jpdb-reader-pill')].some(pill => (pill.textContent ?? '').includes(rank)),
            gradeCount: grades.length,
            gradeLabels: grades.map(button => button.textContent?.trim() ?? ''),
            gradeValues: grades.map(button => button.dataset.grade ?? ''),
            gradeTargets: grades.map(button => button.dataset.reviewTarget ?? ''),
            hasReviewTargetSelect: Boolean(document.querySelector('[data-review-target-select]')),
            hasAddDeckSelect: Boolean(document.querySelector('.jpdb-reader-popover [data-add-deck-select]')),
            actionsHtml: document.querySelector('.jpdb-reader-actions')?.innerHTML ?? '',
        };
    }, JITEN_RANK_LABEL);
}

// On an ordinary page the refreshed Jiten state paints through the
// provider-neutral jpdb-* state family; the jiten-* family and the card's
// state/source attributes stay off the page.
async function waitForReviewedWordRepaint(page) {
    try {
        await page.waitForFunction(
            term => {
                const word = [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')]
                    .find(element => element instanceof HTMLElement && element.dataset.expression === term);
                return Boolean(word
                    && word instanceof HTMLElement
                    && word.classList.contains('jpdb-mature')
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
    assert(state.hasJpdbMature, 'Reviewed Jiten word did not repaint to the refreshed mature state', state);
    assert(!state.hasJitenStateClass && !state.cardState && !state.cardSource, 'Reviewed Jiten word exposed its provider state to the ordinary page', state);
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
            cardSource: word.dataset.cardSource ?? '',
            className: word.className,
            hasJpdbMature: word.classList.contains('jpdb-mature'),
            hasJitenStateClass: [...word.classList].some(className => className.startsWith('jiten-')),
            hasFuriganaClass: word.classList.contains('jpdb-reader-has-furi'),
            hasRuby: Boolean(word.querySelector('rt,.jpdb-reader-furi')),
            expression: word.dataset.expression ?? '',
            text: word.textContent?.replace(/\s+/g, '') ?? '',
            backgroundImage: style.backgroundImage,
        };
    }, TERM);
}

// The phase's Jiten study decks answer before the shared mocks.
function routeRequest(request) {
    const url = new URL(request.url);
    const decks = url.host.includes('api.jiten.moe') ? mockJitenStudyDecks(url.pathname) : null;
    if (!decks) return handleRequest(request);
    requests.push({ host: url.host, path: `${url.pathname}${url.search}`, method: request.method ?? 'GET' });
    return decks;
}

function handleRequest(request) {
    const url = new URL(request.url);
    const summary = { host: url.host, path: `${url.pathname}${url.search}`, method: request.method ?? 'GET' };
    requests.push(summary);
    let body = {};
    try { body = request.data ? JSON.parse(request.data) : {}; } catch { body = {}; }
    if (url.pathname.endsWith('/parse') && Array.isArray(body.text)) {
        parsedTexts[url.host.includes('jpdb.io') ? 'jpdb' : 'jiten'].push(body.text.map(String));
    }
    if (url.host.includes('jpdb.io')) return mockJpdb(url.pathname, body);
    if (url.host.includes('api.jiten.moe')) return mockJiten(url.pathname, body);
    return { status: 503, responseText: '', contentType: 'text/plain; charset=utf-8' };
}

function mockJpdb(pathname, body) {
    if (pathname.endsWith('/parse')) {
        const lacksTerm = jpdbLacksTerm && body.text?.length === 1 && body.text[0] === TERM;
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, lacksTerm ? JPDB_VOCAB.filter(([surface]) => surface !== TERM) : JPDB_VOCAB));
    }
    if (pathname.endsWith('/list-user-decks')) return jsonHttpResponse({ decks: [] });
    if (pathname.endsWith('/ping')) return jsonHttpResponse({});
    // review / deck add+remove / set-card-sentence / lookup-vocabulary etc.
    return jsonHttpResponse({});
}

function mockJiten(pathname, body = {}) {
    if (pathname.endsWith('/reader/parse')) {
        jitenParseCalls += 1;
        if (jitenTransientMiss && jitenParseCalls === 1) {
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
                frequencyRank: JITEN_FREQUENCY_RANK,
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
    // Since 2.0 a graded Jiten word refreshes by its exact word and reading
    // instead of re-parsing its spelling.
    if (pathname.endsWith('/reader/lookup-vocabulary')) {
        const words = Array.isArray(body.words) ? body.words : [];
        return jsonHttpResponse({
            result: words.map(([wordId, readingIndex]) => wordId === JITEN_WORD_ID && readingIndex === JITEN_READING_INDEX ? jitenKnownState : []),
        });
    }
    if (pathname === `/api/vocabulary/${JITEN_WORD_ID}/${JITEN_READING_INDEX}/info`) {
        return jsonHttpResponse({
            wordId: JITEN_WORD_ID,
            mainReading: { text: TERM, readingIndex: JITEN_READING_INDEX, frequencyRank: JITEN_FREQUENCY_RANK },
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

function mockJitenStudyDecks(pathname) {
    if (pathname.endsWith('/srs/reader-study-decks')) return jsonHttpResponse(jitenStudyDecks);
    const deckId = /\/srs\/study-decks\/(\d+)\/words$/.exec(pathname)?.[1];
    return deckId ? jitenDeckWordWrite(Number(deckId)) : null;
}

// Jiten takes a single word only into a word list, as its API does.
function jitenDeckWordWrite(deckId) {
    const deck = jitenStudyDecks.find(candidate => candidate.userStudyDeckId === deckId);
    return deck?.deckType === 2 ? jsonHttpResponse({}) : { status: 400, responseText: 'Words can only be added in static word list decks.', contentType: 'text/plain; charset=utf-8' };
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
