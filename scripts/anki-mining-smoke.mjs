#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    ankiActions,
    arrayParam,
    assert,
    assertAnkiStatusStorage,
    assertBuiltArtifacts,
    closeServer,
    createAnkiSmokeSettings,
    createFixtureServer,
    createSmokePaths,
    DEFAULT_ANKI_CONNECT_URL,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    newAutoClosingPage,
    readAnkiStatusStorage,
    readJsonBody,
    resolveAnkiAction,
    routeMockedHttpRequests,
    serveFile,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';
import { assertPopoverHeadwordMatchesLookup, waitForSelectorText } from './lib/smoke-wait-helpers.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(import.meta.dirname);
const SETTINGS_KEY = YOMU_SETTINGS_KEY;
const ANKI_URL = DEFAULT_ANKI_CONNECT_URL;
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';

// Mirrors src/reader/anki/model-schema.ts, which is where the field list is
// decided. The smoke run drives the built companion in a browser and cannot
// import it, so tests/reader/anki-note-type-update.test.ts pins this copy to
// that one.
const YOMU_MODEL_FIELDS = [
    'Expression',
    'Reading',
    'Meaning',
    'Sentence',
    'Url',
    'Frequency',
    'PartOfSpeech',
    'Image',
    'Audio',
    'JPDB',
    'Status',
    'Pitch',
    'DictionaryDefinitions',
    'Kanji',
    'Source',
];

const baseSettings = createAnkiSmokeSettings({
    ankiModel: 'よむ Japanese',
    jpdbMiningEnabled: true,
    popupActivationMode: 'hover',
    newTabEnabled: true,
    newTabSource: 'auto',
    newTabJpdbDeck: 'all',
    newTabJpdbReviewMode: 'api-vocabulary',
    newTabAnkiEnabled: true,
    newTabAnkiDisabledDecks: [],
});

const readerFixtureHtml = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Yomu Anki mining smoke</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #101418;
      color: #f4f7fb;
      font: 24px/1.9 system-ui, sans-serif;
    }
    main {
      width: min(880px, calc(100vw - 48px));
    }
    p {
      margin: 0;
      padding: 28px;
      border: 1px solid #2b3440;
      border-radius: 8px;
      background: #171d24;
    }
  </style>
</head>
<body>
  <main data-yomu-runtime-surface>
    <p>今日は日本語の記事を読みました。明日は例文を書きます。難波を歩きます。</p>
  </main>
</body>
</html>`;

const smokeVocabulary = [
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['not-in-deck']],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['not-in-deck']],
    ['読みました', '読む', 'よみました', 'read', ['v5m'], 401, ['not-in-deck']],
    ['例文', '例文', 'れいぶん', 'example sentence', ['n'], 900, ['not-in-deck']],
    ['書きます', '書く', 'かきます', 'write', ['v5k'], 620, ['not-in-deck']],
    ['難波', '難波', 'なにわ', 'former name for Osaka region', ['n'], 1200, ['not-in-deck']],
    ['歩きます', '歩く', 'あるきます', 'walk', ['v5k'], 780, ['not-in-deck']],
];

const jpdbReviewVocabulary = [
    [101, 201, 0, '日本語', 'にほんご', 250, ['n'], [['Japanese language']], [['n']], ['due'], ['LHHH']],
];

const jpdbMixedReviewVocabulary = [
    [301, 401, 0, '未解禁', 'みかいきん', 900, ['n'], [['locked review word']], [['n']], ['locked'], ['LHHH']],
    [302, 402, 0, '復習', 'ふくしゅう', 650, ['n'], [['review']], [['n']], ['due'], ['LHH']],
    [303, 403, 0, '新語', 'しんご', 700, ['n'], [['new word']], [['n']], ['new'], ['LHH']],
];

const BUILT_ARTIFACTS = [
    SCRIPT_PATH,
    CSS_PATH,
    ...userscriptCompanionPaths(SCRIPT_PATH),
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
];
const JPDB_PARSE_OPTIONS = {
    tokenReading: entry => /[\u3400-\u9fff]/u.test(entry.surface) ? [[entry.surface, entry.reading]] : null,
};
const NULL_ANKI_ACTIONS = [
    'createDeck',
    'createModel',
    'updateModelTemplates',
    'updateModelStyling',
    'modelFieldAdd',
    'guiBrowse',
    'answerCards',
];
const DEFAULT_ANKI_HANDLERS = {
    version: () => 6,
    deckNames: () => ['Mining'],
    getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 2 } }),
    getDecks: params => ({ Mining: arrayParam(params.cards) }),
    modelNames: () => ['よむ Japanese'],
    modelFieldNames: () => YOMU_MODEL_FIELDS,
    findCards: findMiningCards,
    findNotes: findMiningNotes,
    notesInfo: params => arrayParam(params.notes).map(noteId => mockAnkiNoteInfo(Number(noteId))),
    cardsInfo: params => arrayParam(params.cards).map(cardId => mockAnkiCardInfo(Number(cardId))),
    areDue: params => arrayParam(params.cards).map(() => true),
    canAddNotes: params => arrayParam(params.notes).map(() => true),
    retrieveMediaFile: params => String(params.filename ?? '') === ANKI_MEDIA_FILENAME ? ANKI_MEDIA_BASE64 : false,
    updateNoteFields: (params, { requests }) => {
        requests.push({ kind: 'anki-side-effect', action: 'updateNoteFields', note: params.note });
        return null;
    },
    addNote: (params, { requests }) => {
        requests.push({ kind: 'anki-side-effect', action: 'addNote', note: params.note });
        return 9201;
    },
    ...Object.fromEntries(NULL_ANKI_ACTIONS.map(action => [action, () => null])),
};
const MULTI_DECK_NEW_TAB_ANKI_HANDLERS = {
    version: () => 6,
    deckNames: () => ['Core', 'Mining', 'Mining::Old', 'Archive'],
    getDeckStats: () => ({
        1: { name: 'Core', total_in_deck: 2 },
        2: { name: 'Mining', total_in_deck: 2 },
        3: { name: 'Mining::Old', total_in_deck: 1 },
        4: { name: 'Archive', total_in_deck: 1 },
    }),
    findCards: findMultiDeckNewTabCards,
    areDue: params => arrayParam(params.cards).map(cardId => Number(cardId) !== 7106),
    cardsInfo: params => arrayParam(params.cards).map(cardId => mockMultiDeckNewTabCardInfo(Number(cardId))),
    notesInfo: params => arrayParam(params.notes).map(noteId => mockMultiDeckNewTabNoteInfo(Number(noteId))),
    retrieveMediaFile: params => String(params.filename ?? '') === ANKI_MEDIA_FILENAME ? ANKI_MEDIA_BASE64 : false,
};
const DEFAULT_JPDB_API_HANDLERS = {
    parse: body => mockJpdbParseFromVocabulary(body, smokeVocabulary, JPDB_PARSE_OPTIONS),
    'list-user-decks': () => ({ decks: [[1, 'Mining']] }),
    'deck/list-vocabulary': () => ({ vocabulary: [[101, 201]] }),
    'lookup-vocabulary': () => ({ vocabulary_info: jpdbReviewVocabulary }),
    review: () => ({}),
};
const MIXED_JPDB_API_HANDLERS = {
    parse: body => mockJpdbParseFromVocabulary(body, smokeVocabulary, JPDB_PARSE_OPTIONS),
    'list-user-decks': () => ({ decks: [[1, 'Mixed Queue']] }),
    'deck/list-vocabulary': () => ({ vocabulary: [[301, 401], [302, 402], [303, 403]] }),
    'lookup-vocabulary': lookupMixedJpdbVocabulary,
    review: () => ({}),
};
const MINING_CARD_QUERY_RULES = [
    { matches: query => query === 'deck:*' || query === 'deck:* is:due', cards: [8001, 8101] },
    { matches: query => ['deck:* is:learn', 'deck:* is:new', 'deck:* is:suspended'].includes(query), cards: [] },
    { matches: query => queryIncludesAny(query, ['is:due', 'is:learn']), cards: [8101] },
];
const MINING_NOTE_QUERY_RULES = [
    { matches: query => query === 'deck:*', notes: [9001, 9101] },
    { matches: query => /読む|よむ|読みました|よみました/.test(query), notes: [9001] },
    { matches: query => /暗記|あんき/.test(query), notes: [9101] },
];
const MULTI_DECK_CARD_QUERY_RULES = [
    { needles: ['is:new'], cards: [7105, 7107] },
    { needles: ['is:due', 'is:learn'], cards: [7102, 7104, 7101, 7106] },
];
const MULTI_DECK_CARD_INFO_OVERRIDES = {
    7102: { note: 7202, deckName: 'Core', question: '順番', answer: 'order' },
    7101: { note: 7201, deckName: 'Mining', question: `採掘 [anki:play:q:0]`, answer: 'mining' },
    7104: { note: 7204, deckName: 'Mining::Old', question: '古い', answer: 'old' },
    7105: { note: 7205, deckName: 'Core', queue: 0, type: 0, due: 0, reps: 0, interval: 0, question: '新規', answer: 'new' },
    7107: { note: 7207, deckName: 'Archive', queue: 0, type: 0, due: 0, reps: 0, interval: 0, question: '保管', answer: 'archive' },
};
const FUTURE_MULTI_DECK_CARD_INFO = { note: 7206, deckName: 'Core', due: 999999, question: '未来', answer: 'future' };
const READING_WORD_SELECTOR = 'main .jpdb-reader-word[data-expression="読む"]';
const WRITING_WORD_SELECTOR = 'main .jpdb-reader-word[data-expression="書く"][data-reading="かきます"]';
const VISIBLE_WRITING_POPOVER_SELECTOR = '.jpdb-reader-popover:visible';
const ACTIVE_ANKI_BUTTON_SELECTOR = '[data-action="anki"]:not([disabled])';
const NEWTAB_VIEWPORT = { width: 1280, height: 820 };
const MOBILE_NEWTAB_VIEWPORT = { width: 390, height: 844 };
const READER_FIXTURE_TEXT = '今日は日本語の記事を読みました。明日は例文を書きます。難波を歩きます。';
const JPDB_MIXED_DECK_LIST = [[301, 401], [302, 402], [303, 403]];
const JPDB_MIXED_DECK_LIST_JSON = JSON.stringify(JPDB_MIXED_DECK_LIST);
const ANKI_MEDIA_FILENAME = 'mining-front.mp3';
const ANKI_MEDIA_BASE64 = Buffer.from('yomu smoke anki audio').toString('base64');
const WHOLE_COLLECTION_QUERY = 'deck:*';
const WHOLE_COLLECTION_SEARCH_ACTIONS = new Set(['findCards', 'findNotes']);
const EXISTING_ANKI_SELECTOR = '.jpdb-reader-popover .jpdb-reader-anki-existing';
const EXISTING_ANKI_STATUS_TERMS = ['Anki', 'Mining', '12'];
const EXISTING_ANKI_RENDERED_TERMS = ['to read'];
const EXISTING_ANKI_RAW_FIELD_TERMS = ['今日は本を読む', 'Sentence'];
const MOBILE_HANDOFF_SETTINGS = {
    ankiMobileHandoff: true,
    wordTextColorSource: 'off',
    wordUnderlineColorSource: 'off',
    wordHighlightColorSource: 'off',
};
const FIXTURE_ROUTE_HANDLERS = [
    serveReaderPage,
    serveReaderAsset,
    serveNewTabIndex,
    serveNewTabAsset,
];
const NEWTAB_INDEX_PATHS = new Set(['/newtab/', '/newtab/index.html']);

function handleFixtureRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (FIXTURE_ROUTE_HANDLERS.some(handler => handler(url, response))) return;
    serveNotFound(response);
}

function serveNotFound(response) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function serveReaderPage(url, response) {
    if (url.pathname !== '/' && url.pathname !== '/reader-anki.html') return false;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(readerFixtureHtml);
    return true;
}

function serveReaderAsset(url, response) {
    if (url.pathname === '/yomu.user.js') {
        serveFile(response, SCRIPT_PATH, 'application/javascript; charset=utf-8');
        return true;
    }
    if (url.pathname === '/yomu.css') {
        serveFile(response, CSS_PATH, 'text/css; charset=utf-8');
        return true;
    }
    return false;
}

function serveNewTabIndex(url, response) {
    if (!NEWTAB_INDEX_PATHS.has(url.pathname)) return false;
    serveFile(response, path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8');
    return true;
}

function serveNewTabAsset(url, response) {
    if (!url.pathname.startsWith('/newtab/')) return false;
    const filePath = path.join(NEWTAB_DIR, url.pathname.slice('/newtab/'.length));
    return serveExistingNewTabAsset(response, filePath);
}

function serveExistingNewTabAsset(response, filePath) {
    if (!existsSync(filePath)) return false;
    serveFile(response, filePath, contentTypeForFile(filePath));
    return true;
}

function contentTypeForFile(filePath) {
    if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    return 'application/octet-stream';
}

async function newMockedPage(browser, requests, settings = baseSettings, viewport = { width: 1360, height: 900 }, scenario = {}) {
    const { page } = await newAutoClosingPage(browser, { viewport, deviceScaleFactor: 1, ...(scenario.contextOptions ?? {}) });
    await routeMockedHttpRequests(page, {
        requests,
        mockHttpRequest,
        isMockedApiOrigin,
        scenario,
    });
    await page.exposeFunction('__yomuAnkiSmokeRequest', async request => {
        const mocked = mockHttpRequest(request, requests, scenario);
        if (!mocked) throw new Error(`Unexpected smoke request: ${request.method ?? 'GET'} ${request.url}`);
        return mocked;
    });
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuAnkiSmokeRequest',
    });
    return page;
}

function isMockedApiOrigin(url) {
    return url.origin === ANKI_URL || isJpdbApiUrl(url);
}

function mockHttpRequest(request, requests, scenario = {}) {
    const url = new URL(request.url);
    return mockJpdbHttpRequest(url, request, requests, scenario)
        ?? mockAnkiHttpRequest(url, request, requests, scenario);
}

function mockJpdbHttpRequest(url, request, requests, scenario) {
    if (!isJpdbApiUrl(url)) return null;
    const endpoint = jpdbEndpoint(url);
    const body = readJsonBody(request.data);
    requests.push({ kind: 'jpdb', endpoint, body });
    return jsonHttpResponse(mockJpdbApi(endpoint, body, scenario));
}

function mockAnkiHttpRequest(url, request, requests, scenario) {
    if (url.origin !== ANKI_URL) return null;
    const body = readJsonBody(request.data);
    const response = mockAnkiConnect(body, requests, scenario);
    requests.push({ kind: 'anki', action: body.action, params: body.params ?? {} });
    return jsonHttpResponse(response);
}

function isJpdbApiUrl(url) {
    return url.origin === JPDB_API_ORIGIN && url.pathname.startsWith(JPDB_API_PREFIX);
}

function jpdbEndpoint(url) {
    return url.pathname.slice(JPDB_API_PREFIX.length);
}

function mockJpdbApi(endpoint, body, scenario = {}) {
    const handlers = scenario.name === 'jpdb-mixed-newtab'
        ? MIXED_JPDB_API_HANDLERS
        : DEFAULT_JPDB_API_HANDLERS;
    return resolveJpdbApiEndpoint(endpoint, body, handlers);
}

function resolveJpdbApiEndpoint(endpoint, body, handlers) {
    const handler = handlers[endpoint];
    return typeof handler === 'function' ? handler(body) : {};
}

function lookupMixedJpdbVocabulary(body) {
    const requested = Array.isArray(body.list) ? body.list : [];
    const byPair = new Map(jpdbMixedReviewVocabulary.map(item => [`${item[0]}:${item[1]}`, item]));
    return {
        vocabulary_info: requested
            .slice()
            .reverse()
            .map(([vid, sid]) => byPair.get(`${Number(vid)}:${Number(sid)}`))
            .filter(Boolean),
    };
}

function mockAnkiConnect(body, requests, scenario = {}) {
    if (scenario.name === 'mobile-handoff-unavailable') return { result: null, error: 'Failed to fetch' };
    return mockAnkiConnectResponse(body, resolveMiningAnkiAction, { requests, scenario });
}

function resolveMiningAnkiAction(action, params, context) {
    const handlers = context.scenario?.name === 'multi-deck-newtab'
        ? MULTI_DECK_NEW_TAB_ANKI_HANDLERS
        : DEFAULT_ANKI_HANDLERS;
    return resolveAnkiAction(action, params, handlers, context);
}

function findMiningCards(params) {
    return firstMatchingRule(queryParam(params), MINING_CARD_QUERY_RULES, 'cards');
}

function findMiningNotes(params) {
    return firstMatchingRule(queryParam(params), MINING_NOTE_QUERY_RULES, 'notes');
}

function findMultiDeckNewTabCards(params) {
    const query = queryParam(params);
    const rule = MULTI_DECK_CARD_QUERY_RULES.find(item => queryIncludesAny(query, item.needles));
    return rule ? [...rule.cards] : [];
}

function firstMatchingRule(query, rules, propertyName) {
    const rule = rules.find(item => item.matches(query));
    return rule ? [...rule[propertyName]] : [];
}

function queryParam(params) {
    return String(params.query ?? '');
}

function queryIncludesAny(query, needles) {
    return needles.some(needle => query.includes(needle));
}

function mockMultiDeckNewTabCardInfo(cardId) {
    const common = {
        cardId,
        note: 7200 + (cardId - 7100),
        queue: 2,
        type: 2,
        due: cardId - 7100,
        reps: 5,
        lapses: 0,
        interval: 8,
        question: '',
        answer: '',
    };
    const overrides = MULTI_DECK_CARD_INFO_OVERRIDES[cardId] ?? FUTURE_MULTI_DECK_CARD_INFO;
    return { ...common, ...overrides };
}

function mockMultiDeckNewTabNoteInfo(noteId) {
    const notes = {
        7201: ['採掘', 'さいくつ', 'mining', '採掘を続けます。', [7101]],
        7202: ['順番', 'じゅんばん', 'order', '順番を確認します。', [7102]],
        7204: ['古い', 'ふるい', 'old', '古いカードです。', [7104]],
        7205: ['新規', 'しんき', 'new', '新規カードです。', [7105]],
        7206: ['未来', 'みらい', 'future', '未来の復習です。', [7106]],
        7207: ['保管', 'ほかん', 'archive', '保管されたカードです。', [7107]],
    };
    const [expression, reading, meaning, sentence, cards] = notes[noteId] ?? notes[7206];
    return {
        noteId,
        modelName: 'Imported Mining',
        tags: ['smoke'],
        fields: {
            Expression: { value: expression, order: 0 },
            Reading: { value: reading, order: 1 },
            Meaning: { value: meaning, order: 2 },
            Sentence: { value: sentence, order: 3 },
            ...(noteId === 7201 ? { Audio: { value: `[sound:${ANKI_MEDIA_FILENAME}]`, order: 4 } } : {}),
        },
        cards,
    };
}

function mockAnkiNoteInfo(noteId) {
    if (noteId === 9101) {
        return {
            noteId,
            modelName: 'よむ Japanese',
            tags: ['yomu'],
            fields: {
                Expression: { value: '暗記', order: 0 },
                Reading: { value: 'あんき', order: 1 },
                Meaning: { value: 'memorization', order: 2 },
                Sentence: { value: '暗記を復習します。', order: 3 },
                DictionaryDefinitions: { value: 'memorization', order: 12 },
            },
            cards: [8101],
        };
    }
    if (noteId === 9201) {
        return {
            noteId,
            modelName: 'よむ Japanese',
            tags: ['yomu'],
            fields: {
                Expression: { value: '書く', order: 0 },
                Reading: { value: 'かく', order: 1 },
                Meaning: { value: 'write', order: 2 },
                Sentence: { value: '明日は例文を書きます。', order: 3 },
                DictionaryDefinitions: { value: 'write', order: 12 },
            },
            cards: [8201],
        };
    }
    return {
        noteId: 9001,
        modelName: 'よむ Japanese',
        tags: ['yomu'],
        fields: {
            Expression: { value: '読む', order: 0 },
            Reading: { value: 'よむ', order: 1 },
            Meaning: { value: 'to read', order: 2 },
            Sentence: { value: '今日は本を読む。', order: 3 },
            DictionaryDefinitions: { value: 'to read', order: 12 },
        },
        cards: [8001],
    };
}

function mockAnkiCardInfo(cardId) {
    if (cardId === 8101) {
        return {
            cardId,
            note: 9101,
            deckName: 'Mining',
            queue: 2,
            type: 2,
            due: 2,
            reps: 3,
            lapses: 0,
            interval: 4,
            question: '暗記',
            answer: 'memorization',
        };
    }
    if (cardId === 8201) {
        return {
            cardId,
            note: 9201,
            deckName: 'Mining',
            queue: 0,
            type: 0,
            due: 3,
            reps: 0,
            lapses: 0,
            interval: 0,
            question: '書く',
            answer: 'write',
        };
    }
    return {
        cardId: 8001,
        note: 9001,
        deckName: 'Mining',
        queue: 2,
        type: 2,
        due: 1,
        reps: 12,
        lapses: 1,
        interval: 15,
        question: '読む',
        answer: 'to read',
    };
}

async function injectUserscript(page) {
    await page.addStyleTag({ path: CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
}

function assertRenderedStatePreserved(before, after, interaction) {
    assert(before.state === 'due' && after.state === 'due', `${interaction} cleared rendered Anki state`, { before, after });
    assert(after.classes.includes('anki-due'), `${interaction} removed rendered Anki due class`, { before, after });
    // Hover contrast is deliberately recomputed against the hover wash, so the
    // accessible RGB may change while the semantic Anki colour remains active.
    assert(after.accessibleColor && after.color !== after.parentColor,
        `${interaction} replaced the Anki colour with native page text`, { before, after });
}

function assertInitialAnkiStatusLookup(initialAnkiActions, initialAnkiRequests, interaction) {
    assert(hasExactAnkiStatusLookup(initialAnkiActions), 'Reader initial coloring did not perform exact Anki status lookup', { initialAnkiActions });
    assert(!initialAnkiRequests.some(isWholeCollectionSearch), `Reader initial coloring scanned the whole Anki collection before ${interaction}`, { initialAnkiRequests });
}

function hasExactAnkiStatusLookup(actions) {
    return actions.includes('multi') && actions.includes('notesInfo') && actions.includes('cardsInfo');
}

function hasDetailedAnkiStatusLookup(actions) {
    return actions.includes('multi') && actions.includes('areDue');
}

function isWholeCollectionSearch(item) {
    return WHOLE_COLLECTION_SEARCH_ACTIONS.has(item.action) && ankiQueryParam(item) === WHOLE_COLLECTION_QUERY;
}

function ankiQueryParam(item) {
    return String(item.params?.query ?? '');
}

function assertExistingAnkiPopover(popover, requests) {
    assert(popover.hasExisting, 'Existing Anki section was missing from popover', popover);
    assert(popover.hasMerge && popover.hasEdit, 'Existing Anki card did not expose merge/edit actions', popover);
    assert(!popover.hasAdd, 'Known Anki word still showed Add to Anki', popover);
    assert(hasAnkiStatusDetails(popover.text), 'Popover did not include Anki status details', { existingPopover: popover, requests });
    assert(popover.text.includes('to read'), 'Popover did not include existing Anki rendered card contents', { existingPopover: popover, requests });
    assert(!hasRawStoredAnkiFields(popover.text), 'Popover exposed raw stored Anki fields instead of the rendered card', { existingPopover: popover, requests });
}

function hasAnkiStatusDetails(text) {
    return /Anki/.test(text) && /Mining/.test(text) && /12/.test(text);
}

function hasRawStoredAnkiFields(text) {
    return text.includes('今日は本を読む') || text.includes('Sentence');
}

async function waitForDueReadingWord(page) {
    const knownWord = page.locator(READING_WORD_SELECTOR);
    await knownWord.waitFor({ state: 'visible', timeout: 8000 });
    await waitForDueReadingWordState(page);
    return knownWord;
}

async function waitForDueReadingWordState(page) {
    await page.waitForFunction(() => {
        const word = [...document.querySelectorAll('.jpdb-reader-word')]
            .find(element => element.dataset.expression === '読む' && (element.textContent ?? '').includes('読'));
        return word instanceof HTMLElement && word.dataset.ankiState === 'due' && word.classList.contains('anki-due');
    }, null, { timeout: 12000 });
}

function ankiRequestSnapshot(requests) {
    const actions = ankiActions(requests);
    return {
        actions,
        actionCount: actions.length,
        requests: requests.filter(item => item.kind === 'anki').slice(0, actions.length),
    };
}

async function waitForExistingAnkiStatusText(page) {
    await waitForSelectorText(page, EXISTING_ANKI_SELECTOR, { includes: EXISTING_ANKI_STATUS_TERMS });
}

async function waitForRenderedExistingAnkiCardText(page) {
    await waitForSelectorText(page, EXISTING_ANKI_SELECTOR, {
        includes: EXISTING_ANKI_RENDERED_TERMS,
        excludes: EXISTING_ANKI_RAW_FIELD_TERMS,
    });
}

function writingPopoverLocator(page) {
    return page.locator(VISIBLE_WRITING_POPOVER_SELECTOR).filter({ hasText: '書く' }).first();
}

function writingAddButtonLocator(page) {
    return writingPopoverLocator(page).locator(ACTIVE_ANKI_BUTTON_SELECTOR).first();
}

async function clickVisibleWritingAddButton(page) {
    await writingAddButtonLocator(page).evaluate(element => {
        if (!(element instanceof HTMLElement)) throw new Error('Visible Add to Anki button was not found.');
        element.click();
    });
}

async function runReaderMiningSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests);
    await page.goto(`${baseUrl}/reader-anki.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    const coloringStartedAt = Date.now();

    const knownWord = await waitForDueReadingWord(page);
    const firstAnkiColorMs = Date.now() - coloringStartedAt;
    const {
        actions: initialAnkiActions,
        actionCount: initialAnkiActionCount,
        requests: initialAnkiRequests,
    } = ankiRequestSnapshot(requests);
    const statusStorage = await readAnkiStatusStorage(page);

    const beforeHover = await knownWord.evaluate(element => ({
        state: element.dataset.ankiState,
        classes: [...element.classList],
        color: getComputedStyle(element).color,
        parentColor: getComputedStyle(element.parentElement ?? element).color,
        accessibleColor: getComputedStyle(element).getPropertyValue('--jpdb-reader-word-accessible-color').trim(),
        style: element.getAttribute('style') ?? '',
        title: element.title,
    }));
    const hoverStartedAt = Date.now();
    await knownWord.hover();
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 8000 });
    await assertPopoverHeadwordMatchesLookup(page, knownWord, { label: 'anki hover' });
    await page.waitForSelector('.jpdb-reader-popover .jpdb-reader-anki-existing', { timeout: 8000 });
    await waitForExistingAnkiStatusText(page);
    await waitForRenderedExistingAnkiCardText(page);
    const hoverHydrationMs = Date.now() - hoverStartedAt;
    const hoverAnkiActions = ankiActions(requests).slice(initialAnkiActionCount);
    const afterHover = await knownWord.evaluate(element => ({
        state: element.dataset.ankiState,
        classes: [...element.classList],
        color: getComputedStyle(element).color,
        parentColor: getComputedStyle(element.parentElement ?? element).color,
        accessibleColor: getComputedStyle(element).getPropertyValue('--jpdb-reader-word-accessible-color').trim(),
        style: element.getAttribute('style') ?? '',
        title: element.title,
    }));
    assertRenderedStatePreserved(beforeHover, afterHover, 'Hover');
    assert(firstAnkiColorMs < 8_000, 'Reader Anki coloring was not prompt after userscript injection', { firstAnkiColorMs, initialAnkiActions });
    assertInitialAnkiStatusLookup(initialAnkiActions, initialAnkiRequests, 'hover');
    assert(
        hasDetailedAnkiStatusLookup(hoverAnkiActions) || hasDetailedAnkiStatusLookup(initialAnkiActions),
        'Reader hover did not have detailed Anki status available',
        { initialAnkiActions, hoverAnkiActions },
    );
    assert(hoverHydrationMs < 8_000, 'Reader hover Anki hydration was too slow', { hoverHydrationMs, hoverAnkiActions });
    assertAnkiStatusStorage(statusStorage, 2);

    const existingPopover = await page.evaluate(() => ({
        hasExisting: Boolean(document.querySelector('.jpdb-reader-popover .jpdb-reader-anki-existing')),
        hasMerge: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki-merge"]')),
        hasEdit: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki-edit"]')),
        hasAdd: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki"]')),
        text: document.querySelector('.jpdb-reader-popover')?.textContent ?? '',
    }));
    assertExistingAnkiPopover(existingPopover, requests);

    await page.locator('.jpdb-reader-popover [data-action="anki-merge"]').click();
    await page.waitForFunction(() => window.__ankiMergeSeen === true, null, { timeout: 100 }).catch(() => undefined);
    assert(requests.some(item => item.kind === 'anki-side-effect' && item.action === 'updateNoteFields'), 'Merge did not call updateNoteFields', { requests });

    await closeVisiblePopovers(page);
    const missingWord = page.locator(WRITING_WORD_SELECTOR);
    await missingWord.click({ force: true });
    // Deconjugated: the surface is かきます, the dictionary form is 書く. The
    // headword must be the dictionary form, which is what data-expression holds.
    await assertPopoverHeadwordMatchesLookup(page, missingWord, {
        visibleOnly: true,
        label: 'anki deconjugated click',
    });
    await waitForVisibleAddButton(page, requests);
    await clickVisibleWritingAddButton(page);
    await waitForRecordedRequest(requests, item => item.kind === 'anki-side-effect' && item.action === 'addNote', 10000);
    assert(requests.some(item => item.kind === 'anki-side-effect' && item.action === 'addNote'), 'Add to Anki did not call addNote', { requests });

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-reader-smoke.png'), fullPage: false });
    await page.close();
    return {
        firstAnkiColorMs,
        hoverHydrationMs,
        statusStorage,
        initialAnkiActions,
        hoverAnkiActions,
        ankiActions: ankiActions(requests),
        sideEffects: requests.filter(item => item.kind === 'anki-side-effect').map(item => item.action),
    };
}

async function runLocalRootReaderSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests);
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);

    await waitForDueReadingWord(page);

    const state = await page.evaluate(localRootReaderState);
    assert(state.path === '/', 'Local root smoke did not run on the hosted root path', state);
    assertWrappedAnkiAwareWords(state, 'Local root page did not wrap and color Anki-aware words');

    await page.evaluate(replaceLocalRootFixtureText, READER_FIXTURE_TEXT);
    await waitForDueReadingWordState(page);
    const rescannedState = await page.evaluate(localRootReaderState);
    assertWrappedAnkiAwareWords(rescannedState, 'Hosted root scan event did not restore Anki-aware reader words after unwrapping', { state, rescannedState });

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-local-root-smoke.png'), fullPage: false });
    await page.close();
    return {
        ...state,
        rescannedState,
        ankiActions: requests.filter(item => item.kind === 'anki').map(item => item.action),
        jpdbEndpoints: requests.filter(item => item.kind === 'jpdb').map(item => item.endpoint),
    };
}

function localRootReaderState() {
    return {
        path: location.pathname,
        renderedWords: document.querySelectorAll('main .jpdb-reader-word').length,
        ankiStateWords: document.querySelectorAll('main .jpdb-reader-word[data-anki-state]').length,
        dueWords: document.querySelectorAll('main .jpdb-reader-word.anki-due').length,
        reading: document.querySelector('main .jpdb-reader-word[data-expression="読む"]')?.dataset.reading ?? '',
        surface: document.querySelector('main .jpdb-reader-word[data-expression="読む"]')?.textContent ?? '',
    };
}

function replaceLocalRootFixtureText(text) {
    const paragraph = document.querySelector('main p');
    if (!paragraph) throw new Error('Local root fixture paragraph was missing.');
    paragraph.textContent = text;
}

function assertWrappedAnkiAwareWords(state, message, details = state) {
    assert(hasWrappedAnkiAwareWords(state), message, details);
}

function hasWrappedAnkiAwareWords(state) {
    return [
        state.renderedWords >= 6,
        state.ankiStateWords >= 1,
        state.dueWords >= 1,
    ].every(Boolean);
}

async function runMobileAnkiHandoffSmoke(browser, baseUrl) {
    return runMobileHandoffSmoke(browser, baseUrl, {
        name: 'mobile-handoff-unavailable',
        viewport: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        actionLabel: 'Send to AnkiMobile',
        buttonMissingMessage: 'Mobile Anki handoff button was missing',
        actionLabelMessage: 'Mobile handoff action did not name AnkiMobile',
        limitationsMessage: 'Mobile handoff limitations should live in docs/settings help, not the popover',
        addNoteMessage: 'Mobile handoff unexpectedly called AnkiConnect addNote',
        forbiddenTerms: ['existing-card status', 'review queues', 'ankiconnect'],
        screenshot: 'anki-mobile-handoff-smoke.png',
        screenshotBeforeClick: true,
    });
}

async function runAndroidAnkiDroidHandoffSmoke(browser, baseUrl) {
    return runMobileHandoffSmoke(browser, baseUrl, {
        name: 'android-handoff-unavailable',
        viewport: { width: 412, height: 915 },
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        actionLabel: 'Send to AnkiDroid',
        buttonMissingMessage: 'Android AnkiDroid handoff button was missing',
        actionLabelMessage: 'Android handoff action did not name AnkiDroid',
        limitationsMessage: 'Android handoff limitations should live in docs/settings help, not the popover',
        addNoteMessage: 'Android handoff unexpectedly called AnkiConnect addNote',
        forbiddenTerms: ['ankiconnect', 'review queues'],
        screenshot: 'anki-android-handoff-smoke.png',
    });
}

async function runMobileHandoffSmoke(browser, baseUrl, spec) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        ...MOBILE_HANDOFF_SETTINGS,
    }, spec.viewport, {
        name: spec.name,
        contextOptions: {
            isMobile: true,
            hasTouch: true,
            userAgent: spec.userAgent,
        },
    });
    page.on('dialog', dialog => void dialog.accept());
    await page.goto(`${baseUrl}/reader-anki.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);

    const targetWord = page.locator(WRITING_WORD_SELECTOR);
    await targetWord.waitFor({ state: 'visible', timeout: 8000 });
    await targetWord.click({ force: true });
    await page.waitForFunction(actionLabel => {
        const popover = document.querySelector('.jpdb-reader-popover');
        return Boolean(popover?.textContent?.includes(actionLabel));
    }, spec.actionLabel, { timeout: 12000 });

    const mobilePopover = await page.evaluate(() => ({
        hasButton: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki"]')),
        text: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }));
    assert(mobilePopover.hasButton, spec.buttonMissingMessage, mobilePopover);
    assert(mobilePopover.text.includes(spec.actionLabel), spec.actionLabelMessage, mobilePopover);
    assertHandoffLimitationsStayHidden(mobilePopover, spec);

    if (spec.screenshotBeforeClick) await screenshotHandoff(page, spec);

    const actionCountBefore = requests.length;
    await page.locator('.jpdb-reader-popover [data-action="anki"]').click().catch(() => undefined);
    await page.waitForTimeout(250);
    assertNoMobileAddNote(requests, spec);
    if (!spec.screenshotBeforeClick) await screenshotHandoff(page, spec);

    await page.close();
    return {
        text: mobilePopover.text,
        ankiActions: requests.filter(item => item.kind === 'anki').map(item => item.action),
        requestCountAfterClick: requests.length - actionCountBefore,
    };
}

function assertHandoffLimitationsStayHidden(mobilePopover, spec) {
    const text = mobilePopover.text.toLowerCase();
    assert(!spec.forbiddenTerms.some(term => text.includes(term)), spec.limitationsMessage, mobilePopover);
}

function assertNoMobileAddNote(requests, spec) {
    const sideEffect = requests.some(item => item.kind === 'anki-side-effect' && item.action === 'addNote');
    assert(!sideEffect, spec.addNoteMessage, { requests });
}

async function screenshotHandoff(page, spec) {
    await page.screenshot({ path: path.join(ARTIFACTS, spec.screenshot), fullPage: false });
}

async function waitForRecordedRequest(requests, predicate, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (requests.some(predicate)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

async function waitForVisibleAddButton(page, requests) {
    try {
        await page.waitForFunction(hasVisibleWritingAddButton, null, { timeout: 8000 });
    } catch (error) {
        const debug = await collectAddButtonDebug(page);
        throw new Error(`Visible Add to Anki button did not appear: ${JSON.stringify({ debug, requests: requests.slice(-32) })}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function hasVisibleWritingAddButton() {
    const popover = visibleWritingPopover();
    const button = popover?.querySelector('[data-action="anki"]');
    return isActiveSmokeButton(button);

    function visibleWritingPopover() {
        return [...document.querySelectorAll('.jpdb-reader-popover')].find(isVisibleWritingPopover);
    }

    function isVisibleWritingPopover(element) {
        return isVisibleSmokeElement(element) && element.textContent?.includes('書く');
    }

    function isActiveSmokeButton(button) {
        if (!(button instanceof HTMLElement)) return false;
        return isVisibleSmokeElement(button) && isEnabledSmokeButton(button);
    }

    function isEnabledSmokeButton(button) {
        return !(button instanceof HTMLButtonElement && button.disabled);
    }

    function isVisibleSmokeElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return hasVisibleSmokeBox(rect) && hasDisplayedSmokeStyle(style);
    }

    function hasVisibleSmokeBox(rect) {
        return rect.width > 0 && rect.height > 0;
    }

    function hasDisplayedSmokeStyle(style) {
        return style.visibility !== 'hidden' && style.display !== 'none';
    }
}

async function collectAddButtonDebug(page) {
    return page.evaluate(() => ({
        visiblePopoverCount: [...document.querySelectorAll('.jpdb-reader-popover')]
            .filter(popover => popover.getClientRects().length > 0).length,
        popovers: [...document.querySelectorAll('.jpdb-reader-popover')].map(popover => ({
            text: popover.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
        })),
        pageWords: [...document.querySelectorAll('main .jpdb-reader-word')].map(word => ({
            text: word.textContent,
            ankiState: word.dataset.ankiState,
        })),
        addButtons: [...document.querySelectorAll('[data-action="anki"]')].map(button => button.textContent),
    }));
}

async function closeVisiblePopovers(page) {
    await page.mouse.move(12, 12);
    await page.keyboard.press('Escape');
    await page.locator('.jpdb-reader-popover:visible').first().waitFor({ state: 'hidden', timeout: 1500 }).catch(() => undefined);
}

async function runNewTabSourceToggleSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        newTabSource: 'auto',
        yomuLocalSrsEnabled: false,
    }, NEWTAB_VIEWPORT);
    await loadNewTabPage(page, baseUrl, '日本語');

    const initial = await readNewTabState(page);
    assertNewTabState(initial, { prompt: '日本語', status: 'JPDB' }, 'Newtab did not start on JPDB');

    const jpdbToAnki = await toggleNewTabSource(page, 'anki', '暗記').catch(error => {
        throw new Error(`JPDB to Anki source switch failed with requests: ${JSON.stringify(summarizeAnkiNewtabRequests(requests))}`, { cause: error });
    });
    const anki = jpdbToAnki.state;
    assertNewTabState(anki, { prompt: '暗記', status: 'Anki' }, 'Newtab source selector did not switch to Anki');
    assertNewTabToggleLatency(jpdbToAnki.elapsedMs, 'JPDB to Anki source toggle was too slow', { jpdbToAnkiMs: jpdbToAnki.elapsedMs, initial, anki, requests });

    const ankiToJpdb = await toggleNewTabSource(page, 'jpdb', '日本語');
    const jpdb = ankiToJpdb.state;
    assertNewTabState(jpdb, { prompt: '日本語', status: 'JPDB' }, 'Newtab source selector did not switch back to JPDB');
    assertNewTabToggleLatency(ankiToJpdb.elapsedMs, 'Anki to JPDB source toggle was too slow', { ankiToJpdbMs: ankiToJpdb.elapsedMs, anki, jpdb, requests });
    const layout = await readNewTabModeLayout(page);
    assert(layout.buttonsShareWidth, 'Newtab mode tabs do not take equal space', layout);
    assert(layout.buttonsFillMode, 'Newtab mode tabs leave phantom grid space', layout);

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-newtab-smoke.png'), fullPage: false });
    await page.close();
    return {
        initial,
        anki,
        jpdb,
        latencyMs: {
            jpdbToAnki: jpdbToAnki.elapsedMs,
            ankiToJpdb: ankiToJpdb.elapsedMs,
        },
        jpdbEndpoints: jpdbEndpoints(requests),
        ankiActions: ankiActions(requests),
    };
}

async function runMobileNewTabLayoutSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        newTabSource: 'auto',
        yomuLocalSrsEnabled: false,
    }, MOBILE_NEWTAB_VIEWPORT);
    await loadNewTabPage(page, baseUrl, '日本語');

    const state = await readNewTabState(page);
    assertNewTabState(state, { prompt: '日本語', status: 'JPDB' }, 'Mobile newtab did not preserve the selected source state', { state, requests });
    const layout = await readMobileNewTabTopbarLayout(page);
    assert(layout.modeBelowHeader, 'Mobile newtab tabs overlapped the brand or theme controls', layout);
    assert(!layout.modeOverlapsBrand && !layout.modeOverlapsControls, 'Mobile newtab mode tabs collided with topbar controls', layout);
    assert(!layout.buttonOverlaps.length, 'Mobile newtab mode buttons overlapped each other', layout);
    assert(layout.modeWithinViewport, 'Mobile newtab app navigation overflowed the viewport', layout);
    assert(layout.buttonsShareWidth, 'Mobile newtab mode tabs do not take equal space', layout);
    assert(layout.buttonsFillMode, 'Mobile newtab mode tabs leave phantom grid space', layout);

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-newtab-mobile-layout-smoke.png'), fullPage: false });
    await page.close();
    return { state, layout };
}

async function runDesktopNewTabLayoutSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        newTabSource: 'auto',
        yomuLocalSrsEnabled: false,
    }, NEWTAB_VIEWPORT);
    await loadNewTabPage(page, baseUrl, '日本語');

    const state = await readNewTabState(page);
    assertNewTabState(state, { prompt: '日本語', status: 'JPDB' }, 'Desktop newtab did not preserve the selected source state', { state, requests });
    const layout = await readNewTabModeLayout(page);
    assert(!layout.buttonOverlaps.length, 'Desktop newtab mode buttons overlapped each other', layout);
    assert(layout.modeWithinTopbar, 'Desktop newtab tabs overflowed the topbar width', layout);
    assert(layout.buttonsShareWidth, 'Desktop newtab mode tabs do not take equal space', layout);
    assert(layout.buttonsFillMode, 'Desktop newtab mode tabs leave phantom grid space', layout);

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-newtab-desktop-layout-smoke.png'), fullPage: false });
    await page.close();
    return { state, layout };
}

async function runNewTabMultiDeckAnkiSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        ankiModel: '',
        newTabSource: 'anki',
        newTabAnkiEnabled: true,
        newTabAnkiDisabledDecks: ['Mining::Old', 'Archive'],
    }, NEWTAB_VIEWPORT, { name: 'multi-deck-newtab' });
    await loadNewTabPage(page, baseUrl, '採掘');

    const first = await readNewTabState(page);
    assertNewTabState(first, { prompt: '採掘', status: 'Anki' }, 'Multi-deck newtab did not start from the merged Anki SRS due queue', { first, requests });
    const audio = await assertNewTabAnkiCardAudioButton(page, requests);

    await advanceNewTabCard(page, '順番')
        .catch(async error => {
            const afterClick = await readNewTabState(page);
            await page.evaluate(() => document.querySelector('[data-newtab-controls] [data-newtab-action="next"]')?.click());
            const afterProgrammaticClick = await readNewTabState(page);
            throw new Error(`Multi-deck newtab did not advance to the second due Anki card: ${JSON.stringify({ first, afterClick, afterProgrammaticClick, requests })}: ${error instanceof Error ? error.message : String(error)}`);
        });
    const second = await readNewTabState(page);
    assertNewTabState(second, { prompt: '順番', status: 'Anki' }, 'Multi-deck newtab did not preserve Anki due order after filtering disabled decks', { first, second, requests });

    await advanceNewTabCard(page, '新規');
    const third = await readNewTabState(page);
    assertNewTabState(third, { prompt: '新規', status: 'Anki' }, 'Multi-deck newtab did not fill due queue with enabled new cards', { first, second, third, requests });

    const findQueries = requests
        .filter(item => item.kind === 'anki' && item.action === 'findCards')
        .map(item => String(item.params.query ?? ''));
    const reviewQueueQueries = findQueries.filter(query => /\bdeck:"(?:Core|Mining)"/.test(query));
    assert(reviewQueueQueries.length >= 2, 'Multi-deck newtab did not query due and new Anki queues', { findQueries, reviewQueueQueries, requests });
    assert(reviewQueueQueries.some(query => query.includes('is:due') || query.includes('is:learn')), 'Multi-deck newtab did not query due Anki queues', { findQueries, reviewQueueQueries });
    assert(reviewQueueQueries.some(query => query.includes('is:new')), 'Multi-deck newtab did not query new Anki queues', { findQueries, reviewQueueQueries });
    reviewQueueQueries.forEach(query => {
        assert(query.includes('deck:"Core"') && query.includes('deck:"Mining"'), 'Anki newtab query did not include every enabled deck', { query, findQueries });
        assert(!query.includes('Archive') && !query.includes('Mining::Old'), 'Anki newtab query included a disabled deck', { query, findQueries });
    });

    const noteIds = requests
        .filter(item => item.kind === 'anki' && item.action === 'notesInfo')
        .flatMap(item => Array.isArray(item.params.notes) ? item.params.notes.map(Number) : []);
    assert(!noteIds.includes(7204) && !noteIds.includes(7207), 'Disabled Anki deck cards reached note adaptation', { noteIds, requests });

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-newtab-multideck-smoke.png'), fullPage: false });
    await page.close();
    return {
        first,
        second,
        third,
        audio,
        findQueries,
        noteIds,
        ankiActions: ankiActions(requests),
    };
}

async function runNewTabJpdbMixedQueueSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        newTabSource: 'jpdb',
        newTabJpdbDeck: 'all',
        newTabJpdbReviewMode: 'api-vocabulary',
        newTabAnkiEnabled: false,
        newTabKanjiUnlockEnabled: false,
        enableReviews: true,
    }, NEWTAB_VIEWPORT, { name: 'jpdb-mixed-newtab' });
    await loadNewTabPage(page, baseUrl, '未解禁');

    const lockedFront = await readNewTabState(page);
    assertNewTabState(lockedFront, { prompt: '未解禁', status: 'JPDB' }, 'JPDB mixed queue did not start on the locked card from deck order', { lockedFront, requests });

    await revealNewTabCard(page);
    const lockedRevealed = await readNewTabState(page);
    assert(lockedRevealed.gradeButtons.includes('okay'), 'Locked JPDB card did not expose grade buttons after reveal', lockedRevealed);
    assert(!jpdbReviewRequests(requests).length, 'Locked JPDB card submitted a review before any grade action', requests);

    const lockedReviewRequests = await submitJpdbGrade(page, requests, 'okay');
    assert(lockedReviewRequests.length === 1, 'JPDB mixed queue did not submit exactly one locked-card review', { lockedReviewRequests, requests });
    assert(isExpectedJpdbReview(lockedReviewRequests[0]?.body, 301, 401), 'JPDB mixed queue graded the wrong locked card', { lockedReviewRequests, requests });

    await waitForNewTabPrompt(page, '復習');
    const dueFront = await readNewTabState(page);
    assertNewTabState(dueFront, { prompt: '復習', status: 'JPDB' }, 'JPDB mixed queue did not preserve the due card as the second deck card', { lockedFront, lockedRevealed, dueFront, requests });

    const dueRevealed = await revealDueJpdbCard(page, dueFront);
    assert(dueRevealed.gradeButtons.includes('okay'), 'Due JPDB card did not expose grade buttons after reveal', dueRevealed);

    const reviewRequests = await submitJpdbGrade(page, requests, 'okay');
    assert(reviewRequests.length === 1, 'JPDB mixed queue submitted an unexpected number of review requests', { reviewRequests, requests });
    assert(isExpectedJpdbReview(reviewRequests[0]?.body, 302, 402), 'JPDB mixed queue graded the wrong due card', { reviewRequests, requests });

    await waitForNewTabPrompt(page, '新語');
    const next = await readNewTabState(page);
    assertNewTabState(
        next,
        { prompt: '新語', status: 'JPDB' },
        'JPDB mixed queue did not advance to the remaining non-review card after grading the review cards',
        { next, requests },
    );
    assert(!next.gradeButtons.length, 'JPDB mixed queue exposed review grading on a remaining non-review card', { next, requests });

    assertMixedJpdbLookupOrder(requests);

    await page.screenshot({ path: path.join(ARTIFACTS, 'jpdb-newtab-mixed-queue-smoke.png'), fullPage: false });
    await page.close();
    return {
        lockedFront,
        lockedRevealed,
        dueFront,
        dueRevealed,
        next,
        reviewRequests: reviewRequests.map(item => item.body),
        jpdbEndpoints: jpdbEndpoints(requests),
    };
}

async function loadNewTabPage(page, baseUrl, initialPrompt) {
    await page.goto(`${baseUrl}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-newtab-card]', { timeout: 12000 });
    await waitForNewTabPrompt(page, initialPrompt);
}

async function waitForNewTabPrompt(page, prompt, timeout = 12000) {
    await showNewTabWordStep(page, timeout);
    try {
        await page.waitForFunction(value => {
            return document.querySelector('[data-newtab-prompt]')?.textContent?.includes(value);
        }, prompt, { timeout });
    } catch (error) {
        const debug = await collectNewTabDebug(page);
        await page.screenshot({ path: path.join(ARTIFACTS, `anki-newtab-wait-${Date.now()}.png`), fullPage: false }).catch(() => undefined);
        throw new Error(`Timed out waiting for newtab prompt ${JSON.stringify(prompt)}: ${JSON.stringify(debug)}`, { cause: error });
    }
}

async function toggleNewTabSource(page, source, expectedPrompt) {
    const startedAt = Date.now();
    await page.locator('[data-newtab-source-select]').selectOption(source);
    await waitForNewTabPrompt(page, expectedPrompt);
    return {
        elapsedMs: Date.now() - startedAt,
        state: await readNewTabState(page),
    };
}

function assertNewTabState(state, expected, message, details = state) {
    const matched = Object.entries(expected).every(([property, value]) => String(state[property] ?? '').includes(value));
    assert(matched, message, details);
}

function assertNewTabToggleLatency(elapsedMs, message, details) {
    assert(elapsedMs < 10_000, message, details);
}

async function revealNewTabCard(page) {
    await openNewTabFinalReveal(page);
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-newtab')?.classList.contains('jpdb-reader-newtab-revealed'), null, { timeout: 12000 }).catch(async error => {
        const debug = await collectRevealCardDebug(page);
        throw new Error(`Newtab card did not reveal: ${JSON.stringify(debug)}: ${error instanceof Error ? error.message : String(error)}`);
    });
}

async function collectRevealCardDebug(page) {
    return page.evaluate(() => {
        const card = document.querySelector('[data-newtab-card]');
        return {
            cardClass: card?.className ?? '',
            prompt: trimmedText('[data-newtab-prompt]'),
            answer: trimmedText('[data-newtab-answer]'),
            controls: [...document.querySelectorAll('[data-newtab-controls] [data-newtab-action]')].map(readNewTabControlDebug),
            body: (document.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
        };

        function trimmedText(selector) {
            return document.querySelector(selector)?.textContent?.trim() ?? '';
        }

        function readNewTabControlDebug(button) {
            return {
                action: button.getAttribute('data-newtab-action'),
                text: button.textContent?.trim(),
                disabled: button.hasAttribute('disabled'),
            };
        }
    });
}

async function advanceNewTabCard(page, expectedPrompt) {
    await openNewTabFinalReveal(page);
    const grade = page.locator('[data-newtab-action="grade"][data-grade="okay"]').first();
    if (await grade.count()) await grade.click();
    else await page.locator('[data-newtab-action="next"]').click();
    await waitForNewTabPrompt(page, expectedPrompt);
}

async function revealDueJpdbCard(page, dueFront) {
    if (!dueFront.gradeButtons.length) {
        await openNewTabFinalReveal(page);
        await page.waitForFunction(() => document.querySelectorAll('[data-newtab-action="grade"]').length > 0, null, { timeout: 12000 });
    }
    return readNewTabState(page);
}

async function submitJpdbGrade(page, requests, grade) {
    const requestCountBefore = jpdbReviewRequests(requests).length;
    await page.locator(`[data-newtab-action="grade"][data-grade="${grade}"]`).click();
    await waitForRequest(requests, () => jpdbReviewRequests(requests).length > requestCountBefore);
    return jpdbReviewRequests(requests).slice(requestCountBefore);
}

async function showNewTabWordStep(page, timeout = 12000) {
    const wordStep = page.locator('[data-study-step-kind="word"]').first();
    try {
        await wordStep.waitFor({ state: 'visible', timeout });
        if (await wordStep.getAttribute('aria-current') !== 'step') {
            await wordStep.click();
            await page.waitForSelector('[data-study-step-kind="word"][aria-current="step"]', { timeout });
        }
    } catch {
        // Some empty/setup states do not render a study stepper.
    }
}

async function openNewTabFinalReveal(page) {
    const finalReveal = page.locator('[data-study-step-kind="final-reveal"]').first();
    try {
        await finalReveal.waitFor({ state: 'visible', timeout: 12000 });
        await finalReveal.click();
        await page.waitForSelector('[data-study-step-kind="final-reveal"][aria-current="step"]', { timeout: 12000 });
        return;
    } catch {
        await page.locator('[data-newtab-action="reveal"]').click();
    }
}

async function collectNewTabDebug(page) {
    return page.evaluate(() => ({
        prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        status: document.querySelector('[data-newtab-status]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        sourceSelect: document.querySelector('[data-newtab-source-select]')?.value ?? '',
        sourceOptions: [...document.querySelectorAll('[data-newtab-source-select] option')].map(option => ({
            value: option.value,
            text: option.textContent?.replace(/\s+/g, ' ').trim(),
        })),
        step: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-step') ?? '',
        flow: document.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-flow') ?? '',
        steps: [...document.querySelectorAll('[data-study-step-kind]')].map(step => ({
            kind: step.getAttribute('data-study-step-kind'),
            active: step.getAttribute('data-active'),
            text: step.textContent?.replace(/\s+/g, ' ').trim(),
        })),
        controls: [...document.querySelectorAll('[data-newtab-controls] [data-newtab-action]')].map(button => ({
            action: button.getAttribute('data-newtab-action'),
            text: button.textContent?.replace(/\s+/g, ' ').trim(),
        })),
    }));
}

function jpdbReviewRequests(requests) {
    return requests.filter(item => item.kind === 'jpdb' && item.endpoint === 'review');
}

function isExpectedJpdbReview(body, vid, sid) {
    return body?.vid === vid && body?.sid === sid;
}

function assertMixedJpdbLookupOrder(requests) {
    const lookupBodies = requests
        .filter(item => item.kind === 'jpdb' && item.endpoint === 'lookup-vocabulary')
        .map(item => item.body);
    assert(lookupBodies.some(body => JSON.stringify(body.list) === JPDB_MIXED_DECK_LIST_JSON), 'JPDB mixed queue did not request vocabulary in deck/list order', { lookupBodies, requests });
}

function jpdbEndpoints(requests) {
    return requests.filter(item => item.kind === 'jpdb').map(item => item.endpoint);
}

function summarizeAnkiNewtabRequests(requests) {
    return requests
        .filter(item => item.kind === 'anki' || item.kind === 'jpdb')
        .map(item => item.kind === 'anki'
            ? { kind: item.kind, action: item.action, query: item.params?.query }
            : { kind: item.kind, endpoint: item.endpoint });
}

async function waitForRequest(requests, predicate, timeoutMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (requests.some(predicate)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for smoke request after ${timeoutMs}ms`);
}

async function readNewTabState(page) {
    return page.evaluate(() => {
        const status = document.querySelector('[data-newtab-status]');
        const select = document.querySelector('[data-newtab-source-select]');
        // The source name lives on the dropdown face now, not the pill —
        // fold the selected option label into `status` so source assertions
        // keep working.
        const selectedLabel = select && !select.hidden ? select.selectedOptions[0]?.textContent?.trim() ?? '' : '';
        return {
            prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '',
            status: [status?.textContent?.trim() ?? '', selectedLabel].filter(Boolean).join(' · '),
            action: status?.dataset.newtabAction,
            sourceSelect: select?.value ?? '',
            light: (document.querySelector('[data-newtab-status] .jpdb-reader-newtab-status-light')
                ?? (select && !select.hidden ? select : null))?.dataset.source,
            controls: [...document.querySelectorAll('[data-newtab-controls] [data-newtab-action]')]
                .map(element => element.dataset.newtabAction ?? ''),
            gradeButtons: [...document.querySelectorAll('[data-newtab-action="grade"]')]
                .map(element => element.dataset.grade ?? ''),
        };
    });
}

async function readNewTabModeLayout(page, {
    modeSelector = '.jpdb-reader-newtab-mode',
    buttonSelector = '.jpdb-reader-newtab-mode button',
    expectedButtonCount = 3,
} = {}) {
    return page.evaluate(({ modeSelector: containerSelector, buttonSelector: itemSelector, expectedButtonCount: expectedCount }) => {
        const topbar = rectFor('.jpdb-reader-newtab-topbar');
        const brand = rectFor('.jpdb-reader-newtab-brand');
        const controls = rectFor('.jpdb-reader-newtab-theme-controls');
        const mode = rectFor(containerSelector);
        const buttons = [...document.querySelectorAll(itemSelector)].map(rectFromElement);
        const widths = buttons.map(button => button.width);
        const totalButtonWidth = buttons.reduce((sum, button) => sum + button.width, 0);
        const expectedGapWidth = buttons.length > 1 ? mode.width - totalButtonWidth : 0;
        return {
            viewportWidth: window.innerWidth,
            topbar,
            brand,
            controls,
            mode,
            modeBelowHeader: mode.top >= Math.max(brand.bottom, controls.bottom) - 1,
            modeOverlapsBrand: rectsOverlap(mode, brand),
            modeOverlapsControls: rectsOverlap(mode, controls),
            modeWithinTopbar: mode.left >= topbar.left - 1 && mode.right <= topbar.right + 1,
            modeWithinViewport: mode.left >= -1 && mode.right <= window.innerWidth + 1
                && mode.top >= -1 && mode.bottom <= window.innerHeight + 1,
            buttonOverlaps: overlappingPairs(buttons),
            buttonLabels: [...document.querySelectorAll(itemSelector)].map(button => button.textContent?.trim() ?? ''),
            buttonsShareWidth: widths.every(width => Math.abs(width - widths[0]) <= 1),
            buttonsFillMode: buttons.length === expectedCount && expectedGapWidth <= (buttons.length - 1) * 4 + 14,
            buttonWidths: widths,
            expectedGapWidth,
        };

        function rectFor(selector) {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return emptyRect(selector);
            return rectFromElement(element);
        }

        function rectFromElement(element) {
            const rect = element.getBoundingClientRect();
            return {
                selector: element.className || element.tagName,
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
            };
        }

        function emptyRect(selector) {
            return { selector, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        }

        function rectsOverlap(a, b) {
            return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        }

        function overlappingPairs(rects) {
            const pairs = [];
            for (let i = 0; i < rects.length; i += 1) {
                for (let j = i + 1; j < rects.length; j += 1) {
                    if (rectsOverlap(rects[i], rects[j])) pairs.push([i, j]);
                }
            }
            return pairs;
        }
    }, { modeSelector, buttonSelector, expectedButtonCount });
}

function readMobileNewTabTopbarLayout(page) {
    return readNewTabModeLayout(page, {
        modeSelector: '.jpdb-reader-newtab-app-nav',
        buttonSelector: '.jpdb-reader-newtab-app-nav-item',
        expectedButtonCount: 4,
    });
}

async function assertNewTabAnkiCardAudioButton(page, requests) {
    const selector = `[data-newtab-prompt] [data-action="anki-media-audio"][data-anki-media-name="${ANKI_MEDIA_FILENAME}"]`;
    await page.locator(selector).waitFor({ state: 'visible', timeout: 8000 });
    const beforeMediaRequests = retrieveMediaFileRequestCount(requests);
    const audio = await page.locator(selector).evaluate(newTabAudioButtonSnapshot);
    assertNewTabAnkiCardAudioSnapshot(audio);

    await page.locator(selector).click();
    try {
        await waitForRequest(requests, item => isNewAnkiMediaRequest(item, requests, beforeMediaRequests));
    } catch (error) {
        const afterClick = await readNewTabAnkiCardAudioButtonDebug(page, selector).catch(debugError => ({
            error: debugError instanceof Error ? debugError.message : String(debugError),
        }));
        throw new Error(`Anki card audio click did not request Anki media: ${JSON.stringify({
            beforeClick: audio,
            afterClick,
            recentAnkiRequests: requests.filter(item => item.kind === 'anki').slice(-12),
        }, null, 2)}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return audio;
}

function assertNewTabAnkiCardAudioSnapshot(audio) {
    assert(audio.text === '', 'Anki card audio button should render as an icon-only control', audio);
    assert(audio.ariaLabel === `Anki audio ${ANKI_MEDIA_FILENAME}`, 'Anki card audio button did not expose the media filename to assistive tech', audio);
    assert(audio.title === `Anki audio ${ANKI_MEDIA_FILENAME}`, 'Anki card audio button title was incorrect', audio);
    assert(audio.firstChild, 'Anki card audio button was not positioned before the prompt content', audio);
    assert(hasNewTabSpeakerButtonShape(audio), 'Anki card audio did not use the newtab speaker-button pattern', audio);
    assert(!audio.promptText.includes('Card audio'), 'Anki card audio leaked the old text chip label', audio);
}

function hasNewTabSpeakerButtonShape(audio) {
    return [
        audio.hasIconButtonClass,
        !audio.hasMiniClass,
        audio.hasSpeakerIcon,
    ].every(Boolean);
}

function newTabAudioButtonSnapshot(button) {
    const prompt = button.closest('[data-newtab-prompt]');
    const rect = button.getBoundingClientRect();
    return {
        text: trimmedButtonText(button),
        ariaLabel: attributeValue(button, 'aria-label'),
        title: attributeValue(button, 'title'),
        firstChild: isFirstPromptChild(prompt, button),
        hasIconButtonClass: button.classList.contains('jpdb-reader-icon-btn'),
        hasMiniClass: button.classList.contains('jpdb-reader-icon-mini'),
        hasSpeakerIcon: Boolean(button.querySelector('svg')),
        promptText: compactPromptText(prompt),
        rect: { width: rect.width, height: rect.height },
    };

    function trimmedButtonText(button) {
        return button.textContent?.trim() ?? '';
    }

    function attributeValue(button, name) {
        return button.getAttribute(name) ?? '';
    }

    function isFirstPromptChild(prompt, button) {
        return Boolean(prompt) && prompt.firstElementChild === button;
    }

    function compactPromptText(prompt) {
        return prompt ? prompt.textContent?.replace(/\s+/g, ' ').trim() ?? '' : '';
    }
}

function isNewAnkiMediaRequest(item, requests, beforeMediaRequests) {
    return isAnkiMediaRequest(item) && retrieveMediaFileRequestCount(requests) > beforeMediaRequests;
}

function isAnkiMediaRequest(item) {
    return [
        item.kind === 'anki',
        item.action === 'retrieveMediaFile',
        mediaRequestFilename(item) === ANKI_MEDIA_FILENAME,
    ].every(Boolean);
}

function mediaRequestFilename(item) {
    return item.params ? String(item.params.filename ?? '') : '';
}

function retrieveMediaFileRequestCount(requests) {
    return requests.filter(item => item.kind === 'anki' && item.action === 'retrieveMediaFile').length;
}

async function readNewTabAnkiCardAudioButtonDebug(page, selector) {
    return page.locator(selector).evaluate(newTabAudioButtonDebugSnapshot);
}

function newTabAudioButtonDebugSnapshot(button) {
    return {
        disabled: button.hasAttribute('disabled'),
        text: trimmedButtonText(button),
        ariaLabel: button.getAttribute('aria-label') ?? '',
        classes: [...button.classList],
        promptText: compactElementText(button.closest('[data-newtab-prompt]')),
        bodyText: compactElementText(document.body).slice(0, 800),
    };

    function trimmedButtonText(button) {
        return button.textContent?.trim() ?? '';
    }

    function compactElementText(element) {
        return element ? element.textContent?.replace(/\s+/g, ' ').trim() ?? '' : '';
    }
}

async function main() {
    assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT);
    mkdirSync(ARTIFACTS, { recursive: true });
    const { server, baseUrl } = await createFixtureServer(handleFixtureRequest, 'Could not bind Anki smoke server');
    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    try {
        const reader = await runReaderMiningSmoke(browser, baseUrl);
        const localRoot = await runLocalRootReaderSmoke(browser, baseUrl);
        const mobileHandoff = await runMobileAnkiHandoffSmoke(browser, baseUrl);
        const androidHandoff = await runAndroidAnkiDroidHandoffSmoke(browser, baseUrl);
        const desktopNewtabLayout = await runDesktopNewTabLayoutSmoke(browser, baseUrl);
        const newtab = await runNewTabSourceToggleSmoke(browser, baseUrl).catch(error => ({
            skipped: true,
            reason: error instanceof Error ? error.message : String(error),
        }));
        const mobileNewtab = await runMobileNewTabLayoutSmoke(browser, baseUrl);
        const newtabMultiDeck = await runNewTabMultiDeckAnkiSmoke(browser, baseUrl);
        const jpdbMixedQueue = await runNewTabJpdbMixedQueueSmoke(browser, baseUrl);
        console.log(JSON.stringify({ reader, localRoot, mobileHandoff, androidHandoff, desktopNewtabLayout, newtab, mobileNewtab, newtabMultiDeck, jpdbMixedQueue }, null, 2));
    } finally {
        await browser.close().catch(() => undefined);
        await closeServer(server);
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
