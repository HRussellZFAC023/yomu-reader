#!/usr/bin/env node
// Regression guard: an underline is drawn only for information the learner has
// a colour for. 1.6.98 settled that for unknown pitch; two paths still drew a
// grey the learner never picked:
//   * a compound with no whole-word accent but one resolved part (申し訳ありません)
//     painted the unresolved part in the "Unknown" pitch swatch, and the
//     "hide this group", "Only new" and "Hide JPDB-redundant styling" options
//     left that gradient in place;
//   * under a deck-status underline (JPDB/Jiten status or Status), every word in
//     none of the learner's decks got a derived grey with no picker. Not-in-deck
//     now ranks last on that underline: alone it draws nothing, and beside a
//     state the learner has a colour for (JPDB New that Anki lacks, a Study
//     word Anki tracks) that state's colour shows.
//
// Page lane: the built userscript and yomu.css on a fixture page, with JPDB
// parse, public Jiten and AnkiConnect mocked, so the runtime's gradient and
// readability pass are the real ones. Static lane: FIXTURE markup under the
// built yomu.css for the pure cascade contracts (the subtitle channel, additive
// mirrors, the "Only new" and redundant opt-outs), and under the built Study
// CSS for the prompt headword, which keeps its pitch underline in every
// word-underline mode, and for Study words Anki tracks. Chromium by default;
// YOMU_UNDERLINE_SOURCES_ENGINE=webkit checks the !important custom-property
// override in WebKit.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const STUDY_CSS_PATH = path.join(NEWTAB_DIR, 'styles.css');
const ENGINE = process.env.YOMU_UNDERLINE_SOURCES_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const OUT = path.join(ARTIFACTS, 'underline-colour-sources', ENGINE);
const HEIBAN = 'rgb(53, 158, 255)';
const LEARNING = 'rgb(255, 209, 102)';
const UNKNOWN_SWATCH = 'rgb(148, 163, 184)';
// White New on a white page: the readability pass darkens the underline to
// #858585 so it stays visible. That grey is by design and must survive.
const NEW_ON_WHITE = 'rgb(133, 133, 133)';

// [surface, spelling, reading, gloss, pos, frequency, state, pitch]
const DECK_ROWS = [
    ['英会話', '英会話', 'えいかいわ', 'English conversation', ['n'], 3000, ['not-in-deck'], []],
    ['練習', '練習', 'れんしゅう', 'practice', ['n'], 900, ['not-in-deck'], ['LHHH']],
    ['新しい', '新しい', 'あたらしい', 'new', ['adj-i'], 200, ['new'], ['LHHLL']],
    ['言葉', '言葉', 'ことば', 'word', ['n'], 300, ['known'], ['LHH']],
    ['毎日', '毎日', 'まいにち', 'every day', ['n'], 400, ['due'], ['HLLL']],
    ['勉強', '勉強', 'べんきょう', 'study', ['n'], 500, ['failed'], ['LHHH']],
    ['上手', '上手', 'じょうず', 'skilful', ['adj-na'], 600, ['blacklisted'], ['LHH']],
    ['を', 'を', 'を', 'object marker', ['prt'], 1, ['not-in-deck'], []],
];
const DECK_TEXT = '英会話を練習。新しい言葉を毎日勉強。上手。';
const COMPOUND = '申し訳ありません';
const COMPOUND_ROWS = [[COMPOUND, COMPOUND, 'もうしわけありません', 'I am sorry', ['exp'], 1500, ['not-in-deck'], []]];
const COMPOUND_FURIGANA = { [COMPOUND]: [['申', 'もう'], 'し', ['訳', 'わけ'], 'ありません'] };
// Public Jiten decomposes the expression: 申し訳 has a heiban accent and the
// inflected tail ありません has none, so only the first part resolves.
const COMPOUND_WORD_ID = 501;
const COMPOUND_INFO = {
    wordId: COMPOUND_WORD_ID,
    mainReading: { text: '申[もう]し訳[わけ]ありません', frequencyRank: 1500 },
    partsOfSpeech: ['exp'],
    pitchAccents: [],
    definitions: [{ meanings: ['I am sorry'] }],
    composedOf: [
        { matchSurface: '申し訳', readingFurigana: '申[もう]し訳[わけ]', reading: 'もうしわけ', pitchAccents: [0] },
        { matchSurface: 'ありません', reading: 'ありません', pitchAccents: [] },
    ],
};

const BASE_SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
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
    corsProxyUrl: '',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

const IN_DECK = ['jpdb-new', 'jpdb-known', 'jpdb-due', 'jpdb-failed', 'jpdb-blacklisted'];
const DECK_SCENARIOS = [
    { id: 'underline-jpdb-light', theme: 'light', settings: { wordUnderlineColorSource: 'jpdb' }, rootClass: 'jpdb-reader-word-underline-jpdb' },
    { id: 'underline-jpdb-dark', theme: 'dark', settings: { wordUnderlineColorSource: 'jpdb' }, rootClass: 'jpdb-reader-word-underline-jpdb' },
    // With Anki on, an ordinary page projects Anki's verdict as a second state
    // class, so every word the mock collection lacks also carries
    // jpdb-not-in-deck. Each channel's colour cascade ranks some states below
    // not-in-deck (New, and Ignored under Status); those painted the
    // not-in-deck grey and must now show their own colour, the same as on the
    // page without Anki.
    { id: 'underline-jpdb-anki-light', theme: 'light', settings: { wordUnderlineColorSource: 'jpdb', ankiEnabled: true }, rootClass: 'jpdb-reader-word-underline-jpdb', sameAs: 'underline-jpdb-light' },
    // Status needs a review source beside the deck state, or it resolves to
    // the JPDB channel.
    { id: 'underline-status-light', theme: 'light', settings: { wordUnderlineColorSource: 'status', ankiEnabled: true }, rootClass: 'jpdb-reader-word-underline-status', sameAs: 'underline-jpdb-light' },
];

// [matches(url), respond(request, rows, url)], first match wins.
const ROUTES = [
    [url => url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse', (request, rows) => mockJpdbParseFromVocabulary(readJsonBody(request.data), rows, {
        tokenReading: entry => COMPOUND_FURIGANA[entry.surface] ?? [[entry.surface, entry.reading]],
    })],
    // The reader batches deinflection candidates as one 。-joined text.
    [url => url.hostname === 'api.jiten.moe' && url.pathname.endsWith('/vocabulary/parse'), (request, rows, url) => (url.searchParams.get('text') ?? '')
        .split('。').filter(Boolean).flatMap(term => [
            { wordId: term === COMPOUND ? COMPOUND_WORD_ID : 0, readingIndex: 0, originalText: term },
            { wordId: 0, readingIndex: 0, originalText: '。' },
        ])],
    [url => url.hostname === 'api.jiten.moe' && url.pathname.endsWith(`/vocabulary/${COMPOUND_WORD_ID}/0/info`), () => COMPOUND_INFO],
    [url => url.port === '8765', request => mockAnkiConnectResponse(readJsonBody(request.data), action => (action === 'version' ? 6 : []))],
];

assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, STUDY_CSS_PATH], ROOT, 'Run npm run build first.');
mkdirSync(OUT, { recursive: true });
const READER_CSS = readFileSync(CSS_PATH, 'utf8');
const STUDY_CSS = readFileSync(STUDY_CSS_PATH, 'utf8');

let currentPage = '';
const server = await startLoopbackServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(currentPage);
}, 'Could not bind underline colour sources smoke server');
const browser = await launchSmokeBrowser(ENGINE === 'webkit' ? webkit : chromium, ENGINE, { headless: true });
const report = { engine: ENGINE, page: {}, subtitles: {}, study: {}, failures: [] };

try {
    await checkCompoundPitch();
    await checkDeckStatusUnderline();
    await checkSubtitleUnderline();
    await checkMirrorUnderline();
    await checkStudyHeadword();
} finally {
    writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await closeSmokeBrowserAndServer(browser, server.server);
}
// Every behaviour check runs before failing, so one run shows the whole gap.
assert(!report.failures.length, `${report.failures.length} underline colour source check(s) failed (details: ${path.join(OUT, 'report.json')}):\n- ${report.failures.map(failure => failure.message).join('\n- ')}`);
console.log(`underline colour sources smoke passed (${ENGINE}); report: ${path.join(OUT, 'report.json')}`);

async function checkCompoundPitch() {
    const defaults = await compoundScenario('compound-defaults', {});
    const colours = gradientColours(defaults.gradient);
    expect(colours.includes(HEIBAN), 'The resolved part of a compound should keep its pitch colour.', defaults);
    expect(!colours.includes(UNKNOWN_SWATCH), 'A compound part with unknown pitch must not paint the grey "Unknown" swatch.', defaults);
    expect(colours.filter(colour => colour !== HEIBAN).every(isTransparent),
        'Every unresolved compound part should leave its underline segment bare.', defaults);

    const hidden = await compoundScenario('compound-hide-new', { wordColorHiddenStateGroups: ['new'] });
    expect(hidden.gradient === 'none', 'Hiding a word group\'s colours should also hide its compound pitch underline.', hidden);

    // "Only new / not-in-deck words" keeps this not-in-deck compound by design,
    // so its opt-out is checked on fixture markup: a known compound loses the
    // inline gradient, a New one keeps it.
    const gradients = (rootClass, states) => readStaticFixture(compoundFixture(rootClass, states), Object.keys(states),
        word => getComputedStyle(word, '::after').backgroundImage);
    const newOnly = await gradients('yomu-word-color-new-only', { known: 'known', fresh: 'new' });
    report.page['compound-new-only-fixture'] = newOnly;
    expect(newOnly.known === 'none', '"Only new / not-in-deck words" should drop a known compound\'s pitch underline.', newOnly);
    expect(newOnly.fresh !== 'none', '"Only new / not-in-deck words" should keep a New compound\'s pitch underline.', newOnly);

    const redundant = await gradients('jpdb-reader-suppress-redundant', { redundant: 'redundant', known: 'known' });
    report.page['compound-suppress-redundant-fixture'] = redundant;
    expect(redundant.redundant === 'none', '"Hide JPDB-redundant styling" should drop a redundant compound\'s pitch underline.', redundant);
    expect(redundant.known !== 'none', '"Hide JPDB-redundant styling" should keep a known compound\'s pitch underline.', redundant);
}

async function compoundScenario(id, settings) {
    const result = await runPageScenario({
        id,
        theme: 'light',
        text: `${COMPOUND}。`,
        rows: COMPOUND_ROWS,
        settings,
        ready: () => document.querySelector('#probe .jpdb-reader-word[data-pitch-components="true"]'),
    });
    const word = result.words.find(entry => entry.text.startsWith('申'));
    assert(word, 'The compound was not annotated.', result);
    const summary = { root: result.root, classes: word.classes.join(' '), gradient: word.gradient };
    report.page[id] = summary;
    return summary;
}

async function checkDeckStatusUnderline() {
    const defaults = await deckScenario('deck-defaults', 'light', {});
    // Pitch underlines describe the word, not the deck, so they stay.
    expect(!isTransparent(defaults.words.find(word => word.text === '練習')?.underline),
        'A not-in-deck word with known pitch keeps its pitch underline by default.', defaults);
    for (const scenario of DECK_SCENARIOS) {
        expectNoNotInDeckUnderline(scenario, await deckScenario(scenario.id, scenario.theme, scenario.settings));
    }
    // Exact, because the not-in-deck grey it used to get with Anki on
    // (rgb(120, 125, 134)) is close.
    for (const id of ['underline-jpdb-light', 'underline-jpdb-anki-light', 'underline-status-light']) {
        const result = report.page[id];
        expect(result.words.find(word => word.classes.includes('jpdb-new'))?.underline === NEW_ON_WHITE,
            `${id}: a white New underline on a white page should still darken to #858585, Anki card or not.`, result);
    }
}

function expectNoNotInDeckUnderline({ id, rootClass, sameAs }, result) {
    assert(result.root.split(' ').includes(rootClass), `Expected the page to use ${rootClass}.`, result);
    const untracked = result.words.filter(word => word.classes.includes('jpdb-not-in-deck') && !word.classes.some(isOtherDeckState));
    assert(untracked.length >= 3, 'Expected the words in no deck to be annotated.', result);
    expect(untracked.every(word => isTransparent(word.underline)),
        `${id}: words in none of the learner's decks should get no deck-status underline.`, result);
    expect(untracked.every(word => !isTransparent(word.highlight)),
        `${id}: words in no deck should keep their quiet highlight wash.`, result);
    for (const state of IN_DECK) {
        expect(!isTransparent(result.words.find(word => word.classes.includes(state))?.underline),
            `${id}: a ${state} word should keep its state underline.`, result);
    }
    if (sameAs) expectSameStateUnderlines(id, result, report.page[sameAs]);
}

// The same words without Anki's not-in-deck beside them: same state, same
// colour, not the not-in-deck grey. The readability pass may move a colour a
// shade, because the not-in-deck wash behind it is lighter.
function expectSameStateUnderlines(id, result, reference) {
    for (const word of result.words.filter(entry => entry.classes.some(isOtherDeckState))) {
        const without = reference.words.find(entry => entry.text === word.text);
        expect(colourDistance(word.underline, without?.underline) <= 24,
            `${id}: ${word.text}, which Anki lacks, should keep the underline it has without Anki.`, { word, without });
    }
}

async function deckScenario(id, theme, settings) {
    const result = await runPageScenario({
        id,
        theme,
        text: DECK_TEXT,
        rows: DECK_ROWS,
        settings,
        // The readability pass writes the accessible underline on the New
        // word; wait for it so the darkening is measured, not raced.
        ready: () => {
            const words = document.querySelectorAll('#probe .jpdb-reader-word[class*="jpdb-"]');
            const fresh = document.querySelector('#probe .jpdb-reader-word.jpdb-new');
            return words.length >= 8 && fresh?.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        },
    });
    report.page[id] = { root: result.root, words: result.words };
    return result;
}

async function runPageScenario({ id, theme, text, rows, settings, ready }) {
    currentPage = fixturePage(theme, text);
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 900, height: 480 }, deviceScaleFactor: 1, colorScheme: theme });
    try {
        const page = await context.newPage();
        if (process.env.SMOKE_DEBUG) page.on('console', message => console.error('[console]', message.text().slice(0, 240)));
        const bridge = `__yomuUnderlineSourcesSmoke_${id.replace(/\W/g, '_')}`;
        await page.exposeFunction(bridge, request => handleRequest(request, rows));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: { ...BASE_SETTINGS, ...settings },
            requestBridgeName: bridge,
        });
        await page.goto(`${server.origin}/underline-colour-sources.html`, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(ready, null, { timeout: 20_000 });
        // Let enrichment and the contrast pass settle before reading paint.
        await page.waitForTimeout(400);
        await page.locator('#probe').screenshot({ path: path.join(OUT, `${id}.png`) });
        return await page.evaluate(readWords);
    } finally {
        await context.close();
    }
}

function readWords() {
    const words = Array.from(document.querySelectorAll('#probe .jpdb-reader-word')).map(word => {
        const after = getComputedStyle(word, '::after');
        return {
            text: word.dataset.expression || word.textContent.trim(),
            classes: Array.from(word.classList).filter(name => /^(jpdb|jiten|anki)-/.test(name)),
            underline: after.borderBottomWidth === '0px' ? 'none' : after.borderBottomColor,
            gradient: after.backgroundImage,
            highlight: getComputedStyle(word).backgroundImage,
        };
    });
    const root = Array.from(document.documentElement.classList).filter(name => /underline|word-color/.test(name)).join(' ');
    return { root, words };
}

async function checkSubtitleUnderline() {
    const results = {};
    for (const underline of ['pitch', 'off', 'jpdb', 'status']) {
        results[underline] = await readStaticFixture(subtitleFixture(underline), ['not-in-deck', 'new', 'known', 'projected', 'projected-new', 'projected-ignored', 'study'], word => ({
            underline: getComputedStyle(word, '::after').borderBottomColor,
            highlight: getComputedStyle(word).backgroundImage,
            subtitleHighlight: getComputedStyle(word).getPropertyValue('--jpdb-reader-subtitle-highlight').trim(),
        }));
    }
    report.subtitles = results;
    // Defaults are subtitle highlight JPDB + subtitle underline pitch: the
    // not-in-deck wash is painted and no underline rule may touch it.
    const wash = results.pitch['not-in-deck'].highlight;
    expect(!isTransparent(wash), 'A not-in-deck subtitle word should keep its highlight wash under defaults.', results);
    expect(['off', 'jpdb', 'status'].every(mode => results[mode]['not-in-deck'].highlight === wash
        && results[mode]['not-in-deck'].subtitleHighlight === results.pitch['not-in-deck'].subtitleHighlight),
    'The subtitle underline mode must not change the not-in-deck highlight wash.', results);

    for (const mode of ['jpdb', 'status']) {
        expect(isTransparent(results[mode]['not-in-deck'].underline),
            `A not-in-deck subtitle word should get no ${mode} underline.`, results);
        expect(['new', 'known', 'projected'].every(id => !isTransparent(results[mode][id].underline)),
            `In-deck subtitle words, including one Anki holds no card for, should keep their ${mode} underline.`, results);
        expect(results[mode]['projected-new'].underline === results[mode].new.underline,
            `A JPDB New subtitle word Anki lacks should keep the New ${mode} underline.`, results);
    }
    expect(results.status['projected-ignored'].underline === results.jpdb['projected-ignored'].underline
        && !isTransparent(results.status['projected-ignored'].underline),
    'An Ignored subtitle word Anki lacks should keep the Ignored Status underline.', results);
    // Study marks a word Anki holds with its Anki state; Status still
    // shows that state for a keyless Jiten word no JPDB/Jiten deck has.
    expect(results.status.study.underline === LEARNING, 'A not-in-deck Study word with an Anki state keeps its Status underline.', results);
}

// Additive mirrors (YouTube buttons, menus, comments) cannot repaint the host's
// glyphs, so every colour mode, highlight included, lands on their underline.
// They follow the page: not-in-deck alone draws nothing there either.
async function checkMirrorUnderline() {
    const results = {};
    for (const roots of ['jpdb-reader-word-highlight-jpdb', 'jpdb-reader-word-underline-status']) {
        results[roots] = await readStaticFixture(mirrorFixture(roots), ['not-in-deck', 'projected-new', 'known'],
            word => getComputedStyle(word, '::after').borderBottomColor);
    }
    report.mirrors = results;
    for (const result of Object.values(results)) {
        expect(isTransparent(result['not-in-deck']), 'A not-in-deck word on an additive mirror should get no underline.', results);
        expect(['projected-new', 'known'].every(id => !isTransparent(result[id])),
            'Words with a state, including a New one Anki lacks, keep their underline on an additive mirror.', results);
    }
}

// Study draws the prompt and recall headword on its pitch underline whatever
// the word-underline mode, so the not-in-deck reset must not outrank that rule.
// A not-in-deck word elsewhere in Study still gets no deck-status underline.
async function checkStudyHeadword() {
    const results = {};
    for (const underline of ['pitch', 'jpdb', 'status']) {
        results[underline] = await readStaticFixture(studyFixture(underline), ['headword', 'jiten-headword', 'sentence-word', 'anki-word'],
            word => getComputedStyle(word, '::after').borderBottomColor);
    }
    report.study = results;
    expect(Object.values(results).every(result => result.headword === HEIBAN && result['jiten-headword'] === HEIBAN),
        'A not-in-deck Study headword should keep its pitch underline in every word-underline mode.', results);
    expect(['jpdb', 'status'].every(mode => isTransparent(results[mode]['sentence-word'])),
        'A not-in-deck word outside the Study headword should get no deck-status underline.', results);
    // Keyless public Jiten makes every Study word jpdb- and jiten-not-in-deck;
    // Status still shows the state Anki has for it, and the JPDB/Jiten
    // underline, which never reads Anki, stays bare.
    expect(results.status['anki-word'] === LEARNING, 'A Study word Anki tracks should keep its Anki state on the Status underline.', results);
    expect(isTransparent(results.jpdb['anki-word']), 'The JPDB/Jiten underline should stay bare on a Study word only Anki tracks.', results);
}

// Static fixtures run the built CSS only; `read` runs in the page.
async function readStaticFixture(html, ids, read) {
    const page = await browser.newPage({ viewport: { width: 900, height: 300 } });
    try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const results = {};
        for (const id of ids) results[id] = await page.locator(`#${id}`).evaluate(read);
        return results;
    } finally {
        await page.close();
    }
}

// FIXTURE markup: inline compound gradients as rendered-word-state writes them,
// one word per { id: state } entry.
function compoundFixture(rootClass, states) {
    const gradient = 'linear-gradient(to right, var(--jpdb-reader-pitch-heiban) 0%, var(--jpdb-reader-pitch-heiban) 50%, transparent 50%, transparent 100%)';
    const word = (id, state) => `<span id="${id}" class="jpdb-reader-word jpdb-${state} jpdb-pitch-unknown" data-pitch-components="true" style="--jpdb-reader-inline-pitch-gradient:${gradient}">申し訳ない</span>`;
    return `<!doctype html>
<html class="jpdb-reader-word-underline-pitch ${rootClass}"><head><meta charset="utf-8"><style>${READER_CSS}
  body { margin: 0; padding: 24px; background: #fff; color: #1f2328; font: 32px/1.9 sans-serif; }
</style></head><body><p>${Object.entries(states).map(([id, state]) => word(id, state)).join(' ')}</p></body></html>`;
}

// FIXTURE markup: the class shape the subtitle renderer emits on the on-video
// cue, under the root classes applyReaderTheme sets for each underline mode.
function subtitleFixture(underline) {
    return `<!doctype html>
<html class="jpdb-reader-subtitle-highlight-jpdb jpdb-reader-subtitle-underline-${underline}"><head><meta charset="utf-8"><style>${READER_CSS}
  body { margin: 0; background: #101010; color: #fff; font: 40px/1.6 sans-serif; }
</style></head><body>
<div class="jpdb-subtitle-player"><div class="jpdb-subtitle-text"><div class="jpdb-subtitle-primary">
  <span id="not-in-deck" class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">練習</span><span id="new" class="jpdb-reader-word jpdb-new jpdb-pitch-nakadaka" data-pitch-class="nakadaka">新しい</span><span id="known" class="jpdb-reader-word jpdb-known jpdb-pitch-heiban" data-pitch-class="heiban">言葉</span><span id="projected" class="jpdb-reader-word jpdb-known jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">毎日</span><span id="projected-new" class="jpdb-reader-word jpdb-new jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">新しい</span><span id="projected-ignored" class="jpdb-reader-word jpdb-blacklisted jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">上手</span><span id="study" class="jpdb-reader-word jpdb-not-in-deck jiten-not-in-deck anki-learning jpdb-pitch-heiban" data-pitch-class="heiban">勉強</span>
</div></div></div>
</body></html>`;
}

// FIXTURE markup: the Study prompt headword as renderPromptReaderWord emits it,
// beside sentence words with the classes a keyless Jiten parse and Anki give
// them, under the root classes applyReaderTheme sets.
function studyFixture(underline) {
    const headword = (id, classes) => `<span class="jpdb-reader-newtab-term"><span id="${id}" class="jpdb-reader-word jpdb-reader-parseable ${classes} jpdb-pitch-heiban" data-pitch-class="heiban">練習</span></span>`;
    return `<!doctype html>
<html class="jpdb-reader-word-highlight-jpdb jpdb-reader-word-underline-${underline}"><head><meta charset="utf-8"><style>${STUDY_CSS}
  body { margin: 0; padding: 24px; background: #fff; color: #1f2328; font: 32px/1.9 sans-serif; }
</style></head><body>
${headword('headword', 'jpdb-not-in-deck')} ${headword('jiten-headword', 'jpdb-not-in-deck jiten-not-in-deck')}
<p><span id="sentence-word" class="jpdb-reader-word jpdb-not-in-deck jiten-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">練習</span><span id="anki-word" class="jpdb-reader-word jpdb-not-in-deck jiten-not-in-deck anki-learning jpdb-pitch-heiban" data-pitch-class="heiban">勉強</span></p>
</body></html>`;
}

// FIXTURE markup: an additive text mirror over a host label, as
// text-mirror rendering emits it, under the given root classes.
function mirrorFixture(roots) {
    const word = (id, classes) => `<span id="${id}" class="jpdb-reader-word ${classes}">語</span>`;
    return `<!doctype html>
<html class="${roots}"><head><meta charset="utf-8"><style>${READER_CSS}
  body { margin: 0; padding: 24px; background: #fff; color: #1f2328; font: 32px/1.9 sans-serif; }
</style></head><body><button><span class="jpdb-reader-text-mirror jpdb-reader-additive-text-mirror">${word('not-in-deck', 'jpdb-not-in-deck')}${word('projected-new', 'jpdb-new jpdb-not-in-deck')}${word('known', 'jpdb-known jpdb-not-in-deck')}</span></button></body></html>`;
}

function fixturePage(theme, text) {
    const [background, color] = theme === 'light' ? ['#ffffff', '#1f2328'] : ['#18151b', '#eeeeee'];
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Yomu underline colour sources smoke</title>
<style>body{margin:0;padding:32px;background:${background};color:${color};font:28px/1.9 "Hiragino Sans","Noto Sans JP",sans-serif}</style>
</head><body><main><p id="probe">${text}</p></main></body></html>`;
}

function handleRequest(request, rows) {
    const url = new URL(request.url);
    if (process.env.SMOKE_DEBUG) console.error('[request]', decodeURIComponent(request.url));
    const route = ROUTES.find(([matches]) => matches(url));
    return route ? jsonHttpResponse(route[1](request, rows, url)) : { status: 404, responseText: '' };
}

function expect(condition, message, details) {
    if (!condition) report.failures.push({ message, details });
}

function gradientColours(value) {
    return (String(value).match(/(?:rgba?|color)\([^)]*\)/g) ?? []).map(normaliseColour);
}

// Engines serialise colour-mix results as color(srgb …); compare in rgb().
function normaliseColour(value) {
    const srgb = String(value).match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
    if (!srgb) return String(value);
    const [r, g, b] = srgb.slice(1, 4).map(channel => Math.round(Number(channel) * 255));
    const alpha = srgb[4] === undefined ? 1 : Number(srgb[4]);
    return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isOtherDeckState(className) {
    return /^(jpdb|anki)-(new|in-deck|learning|young|known|mature|mastered|never-forget|redundant|due|failed|suspended|blacklisted|locked)$/.test(className);
}

// Largest per-channel gap between two colours; Infinity if either is missing
// or transparent.
function colourDistance(left, right) {
    if (isTransparent(left) || isTransparent(right)) return Infinity;
    const [a, b] = [left, right].map(value => gradientColours(value)[0].match(/[\d.]+/g).map(Number));
    return Math.max(...[0, 1, 2].map(index => Math.abs(a[index] - b[index])));
}

// 'none', a transparent colour, or a gradient whose every stop is transparent.
function isTransparent(value) {
    return gradientColours(value).every(colour => /^rgba\([^)]*, 0\)$/.test(colour));
}
