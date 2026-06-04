#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const SCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const CSS_PATH = path.join(DIST, 'yomu.css');
const NEWTAB_DIR = path.join(DIST, 'newtab');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const ANKI_URL = 'http://127.0.0.1:8765';
const ANKI_STATUS_INDEX_STORAGE_KEY = 'yomu:anki-status-index:v1';
const ANKI_STATUS_INDEX_DB_NAME = 'yomu-anki-status-index';
const ANKI_STATUS_INDEX_ENTRY_STORE = 'entries';

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

const baseSettings = {
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'en',
    ankiEnabled: true,
    ankiConnectUrl: ANKI_URL,
    ankiDeck: 'Mining',
    ankiModel: 'よむ Japanese',
    ankiMobileHandoff: false,
    jpdbMiningEnabled: true,
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 120,
    popupActivationMode: 'hover',
    showFloatingButton: false,
    wordTextColorSource: 'anki',
    wordUnderlineColorSource: 'off',
    wordHighlightColorSource: 'off',
    newTabEnabled: true,
    newTabSource: 'auto',
    newTabJpdbDeck: 'all',
    newTabJpdbReviewMode: 'api-vocabulary',
    newTabAnkiEnabled: true,
    newTabAnkiDisabledDecks: [],
    enableLogging: false,
};

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
  <main>
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

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

function assertBuiltArtifacts() {
    for (const filePath of [SCRIPT_PATH, CSS_PATH, path.join(NEWTAB_DIR, 'index.html'), path.join(NEWTAB_DIR, 'app.js')]) {
        assert(existsSync(filePath), `Missing built artifact: ${path.relative(ROOT, filePath)}. Run npm run build first.`);
    }
}

function createFixtureServer() {
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/' || url.pathname === '/reader-anki.html') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(readerFixtureHtml);
            return;
        }
        if (url.pathname === '/yomu.user.js') {
            serveFile(response, SCRIPT_PATH, 'application/javascript; charset=utf-8');
            return;
        }
        if (url.pathname === '/yomu.css') {
            serveFile(response, CSS_PATH, 'text/css; charset=utf-8');
            return;
        }
        if (url.pathname === '/newtab/' || url.pathname === '/newtab/index.html') {
            serveFile(response, path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8');
            return;
        }
        if (url.pathname.startsWith('/newtab/')) {
            const filePath = path.join(NEWTAB_DIR, url.pathname.slice('/newtab/'.length));
            if (existsSync(filePath)) {
                const type = filePath.endsWith('.js')
                    ? 'application/javascript; charset=utf-8'
                    : filePath.endsWith('.css')
                        ? 'text/css; charset=utf-8'
                        : 'application/octet-stream';
                serveFile(response, filePath, type);
                return;
            }
        }
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') reject(new Error('Could not bind Anki smoke server'));
            else resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
    });
}

function serveFile(response, filePath, contentType) {
    response.writeHead(200, { 'content-type': contentType });
    response.end(readFileSync(filePath));
}

async function newMockedPage(browser, requests, settings = baseSettings, viewport = { width: 1360, height: 900 }, scenario = {}) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(scenario.contextOptions ?? {}) });
    const page = await context.newPage();
    page.once('close', () => {
        if (context.pages().length === 0) void context.close().catch(() => undefined);
    });
    await page.route('**/*', async route => {
        const routeUrl = new URL(route.request().url());
        if (route.request().method() === 'OPTIONS' && isMockedApiOrigin(routeUrl)) {
            await route.fulfill({ status: 204, headers: corsHeaders() });
            return;
        }
        const mocked = mockHttpRequest({
            method: route.request().method(),
            url: route.request().url(),
            data: route.request().postData() ?? '',
        }, requests, scenario);
        if (!mocked) {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: mocked.status,
            contentType: mocked.contentType,
            body: mocked.responseText,
            headers: corsHeaders(),
        });
    });
    await page.exposeFunction('__yomuAnkiSmokeRequest', async request => {
        const mocked = mockHttpRequest(request, requests, scenario);
        if (!mocked) throw new Error(`Unexpected smoke request: ${request.method ?? 'GET'} ${request.url}`);
        return mocked;
    });
    await page.addInitScript(({ key, value, css }) => {
        const memoryStore = new Map();
        const readStoredValue = (storeKey, fallback) => {
            if (memoryStore.has(storeKey)) return memoryStore.get(storeKey);
            try {
                const raw = localStorage.getItem(storeKey);
                return raw == null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        };
        const writeStoredValue = (storeKey, storedValue) => {
            memoryStore.set(storeKey, storedValue);
            try {
                localStorage.setItem(storeKey, JSON.stringify(storedValue));
            } catch {
                // Ignore fixture storage failures.
            }
        };
        writeStoredValue(key, value);
        window.GM_getValue = (storeKey, fallback) => readStoredValue(storeKey, fallback);
        window.GM_setValue = (storeKey, storedValue) => { writeStoredValue(storeKey, storedValue); };
        window.GM_deleteValue = storeKey => {
            memoryStore.delete(storeKey);
            try {
                localStorage.removeItem(storeKey);
            } catch {
                // Ignore fixture storage failures.
            }
        };
        window.GM_listValues = () => {
            const keys = new Set(memoryStore.keys());
            try {
                for (let index = 0; index < localStorage.length; index += 1) {
                    const storageKey = localStorage.key(index);
                    if (storageKey) keys.add(storageKey);
                }
            } catch {
                // Ignore fixture storage failures.
            }
            return [...keys];
        };
        window.GM_addStyle = styleText => {
            const style = document.createElement('style');
            style.textContent = styleText;
            (document.head || document.documentElement || document.body).append(style);
            return style;
        };
        window.GM_getResourceText = name => name === 'yomuCss' ? css : '';
        window.GM_registerMenuCommand = () => undefined;
        window.GM_xmlhttpRequest = options => {
            let settled = false;
            const settle = callback => value => {
                if (settled) return;
                settled = true;
                callback?.(value);
            };
            Promise.resolve(window.__yomuAnkiSmokeRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data: options.data ?? '',
            })).then(result => {
                const response = options.responseType === 'json'
                    ? JSON.parse(result.responseText || 'null')
                    : result.responseText;
                settle(options.onload)({
                    status: result.status,
                    response,
                    responseText: result.responseText,
                });
            }).catch(error => {
                settle(options.onerror)(error);
            });
        };
        window.GM = { xmlHttpRequest: window.GM_xmlhttpRequest, xmlhttpRequest: window.GM_xmlhttpRequest };
    }, { key: SETTINGS_KEY, value: settings, css: readFileSync(CSS_PATH, 'utf8') });
    return page;
}

function isMockedApiOrigin(url) {
    return url.origin === ANKI_URL || url.origin === 'https://jpdb.io';
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

function mockHttpRequest(request, requests, scenario = {}) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname.startsWith('/api/v1/')) {
        const endpoint = url.pathname.slice('/api/v1/'.length);
        const body = readJsonBody(request.data);
        const response = mockJpdbApi(endpoint, body, scenario);
        requests.push({ kind: 'jpdb', endpoint, body });
        return jsonHttpResponse(response);
    }
    if (url.origin === ANKI_URL) {
        const body = readJsonBody(request.data);
        const response = mockAnkiConnect(body, requests, scenario);
        requests.push({ kind: 'anki', action: body.action, params: body.params ?? {} });
        return jsonHttpResponse(response);
    }
    return null;
}

function jsonHttpResponse(value) {
    const responseText = JSON.stringify(value);
    return {
        status: 200,
        responseText,
        bytes: [...Buffer.from(responseText)],
        contentType: 'application/json; charset=utf-8',
    };
}

function readJsonBody(data) {
    if (!data) return {};
    if (typeof data === 'string') return JSON.parse(data);
    if (typeof data === 'object' && data.kind === 'arraybuffer') {
        return JSON.parse(Buffer.from(data.bytes ?? []).toString('utf8'));
    }
    return data;
}

function mockJpdbApi(endpoint, body, scenario = {}) {
    if (scenario.name === 'jpdb-mixed-newtab') return mockMixedNewTabJpdbApi(endpoint, body);
    if (endpoint === 'parse') return mockJpdbParse(body);
    if (endpoint === 'list-user-decks') return { decks: [[1, 'Mining']] };
    if (endpoint === 'deck/list-vocabulary') return { vocabulary: [[101, 201]] };
    if (endpoint === 'lookup-vocabulary') return { vocabulary_info: jpdbReviewVocabulary };
    if (endpoint === 'review') return {};
    return {};
}

function mockMixedNewTabJpdbApi(endpoint, body) {
    if (endpoint === 'parse') return mockJpdbParse(body);
    if (endpoint === 'list-user-decks') return { decks: [[1, 'Mixed Queue']] };
    if (endpoint === 'deck/list-vocabulary') return { vocabulary: [[301, 401], [302, 402], [303, 403]] };
    if (endpoint === 'lookup-vocabulary') {
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
    if (endpoint === 'review') return {};
    return {};
}

function mockJpdbParse(body) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(value => String(value)) : [];
    const vocabulary = [];
    const vocabIndexBySpelling = new Map();
    const tokens = paragraphs.map(text => {
        const paragraphTokens = [];
        for (let index = 0; index < text.length;) {
            const entry = smokeVocabulary
                .map(([surface, spelling, reading, gloss, partOfSpeech, frequency, state]) => ({
                    surface,
                    spelling,
                    reading,
                    gloss,
                    partOfSpeech,
                    frequency,
                    state,
                }))
                .filter(item => text.startsWith(item.surface, index))
                .sort((a, b) => b.surface.length - a.surface.length)[0];
            if (!entry) {
                index += 1;
                continue;
            }
            let vocabularyIndex = vocabIndexBySpelling.get(entry.spelling);
            if (vocabularyIndex === undefined) {
                vocabularyIndex = vocabulary.length;
                vocabIndexBySpelling.set(entry.spelling, vocabularyIndex);
                vocabulary.push([
                    1000 + vocabularyIndex,
                    2000 + vocabularyIndex,
                    0,
                    entry.spelling,
                    entry.reading,
                    entry.frequency,
                    entry.partOfSpeech,
                    [[entry.gloss]],
                    [entry.partOfSpeech],
                    entry.state,
                    ['LHH'],
                ]);
            }
            paragraphTokens.push([
                vocabularyIndex,
                index,
                entry.surface.length,
                /[\u3400-\u9fff]/u.test(entry.surface) ? [[entry.surface, entry.reading]] : null,
            ]);
            index += entry.surface.length;
        }
        return paragraphTokens;
    });
    return { vocabulary, tokens };
}

function mockAnkiConnect(body, requests, scenario = {}) {
    if (scenario.name === 'mobile-handoff-unavailable') return { result: null, error: 'Failed to fetch' };
    const action = body.action;
    const params = body.params ?? {};
    if (action === 'multi') {
        const actions = Array.isArray(params.actions) ? params.actions : [];
        return {
            result: actions.map(item => mockAnkiConnect({
                action: item.action,
                params: item.params ?? {},
            }, requests, scenario)),
            error: null,
        };
    }
    return { result: mockAnkiResult(action, params, requests, scenario), error: null };
}

function mockAnkiResult(action, params, requests, scenario = {}) {
    if (scenario.name === 'multi-deck-newtab') return mockMultiDeckNewTabAnkiResult(action, params);
    const query = String(params.query ?? '');
    switch (action) {
        case 'version':
            return 6;
        case 'deckNames':
            return ['Mining'];
        case 'getDeckStats':
            return { 1: { name: 'Mining', total_in_deck: 2 } };
        case 'modelNames':
            return ['よむ Japanese'];
        case 'modelFieldNames':
            return YOMU_MODEL_FIELDS;
        case 'findCards':
            if (query === 'deck:*') return [8001, 8101];
            if (query === 'deck:* is:due') return [8001, 8101];
            if (query === 'deck:* is:learn' || query === 'deck:* is:new' || query === 'deck:* is:suspended') return [];
            if (query.includes('is:due') || query.includes('is:learn')) return [8101];
            if (query.includes('is:new')) return [];
            return [];
        case 'findNotes':
            if (query === 'deck:*') return [9001, 9101];
            if (/読む|よむ|読みました|よみました/.test(query)) return [9001];
            if (/暗記|あんき/.test(query)) return [9101];
            return [];
        case 'notesInfo':
            return (Array.isArray(params.notes) ? params.notes : []).map(noteId => mockAnkiNoteInfo(Number(noteId)));
        case 'cardsInfo':
            return (Array.isArray(params.cards) ? params.cards : []).map(cardId => mockAnkiCardInfo(Number(cardId)));
        case 'areDue':
            return (Array.isArray(params.cards) ? params.cards : []).map(() => true);
        case 'updateNoteFields':
            requests.push({ kind: 'anki-side-effect', action, note: params.note });
            return null;
        case 'addNote':
            requests.push({ kind: 'anki-side-effect', action, note: params.note });
            return 9201;
        case 'createDeck':
        case 'createModel':
        case 'updateModelTemplates':
        case 'updateModelStyling':
        case 'modelFieldAdd':
        case 'guiBrowse':
        case 'answerCards':
            return null;
        default:
            return null;
    }
}

function mockMultiDeckNewTabAnkiResult(action, params) {
    const query = String(params.query ?? '');
    switch (action) {
        case 'version':
            return 6;
        case 'deckNames':
            return ['Core', 'Mining', 'Mining::Old', 'Archive'];
        case 'getDeckStats':
            return {
                1: { name: 'Core', total_in_deck: 2 },
                2: { name: 'Mining', total_in_deck: 2 },
                3: { name: 'Mining::Old', total_in_deck: 1 },
                4: { name: 'Archive', total_in_deck: 1 },
            };
        case 'findCards':
            if (query.includes('is:new')) return [7105, 7107];
            if (query.includes('is:due') || query.includes('is:learn')) return [7102, 7104, 7101, 7106];
            return [];
        case 'areDue':
            return (Array.isArray(params.cards) ? params.cards : []).map(cardId => Number(cardId) !== 7106);
        case 'cardsInfo':
            return (Array.isArray(params.cards) ? params.cards : []).map(cardId => mockMultiDeckNewTabCardInfo(Number(cardId)));
        case 'notesInfo':
            return (Array.isArray(params.notes) ? params.notes : []).map(noteId => mockMultiDeckNewTabNoteInfo(Number(noteId)));
        default:
            return null;
    }
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
    if (cardId === 7102) return { ...common, note: 7202, deckName: 'Core', question: '順番', answer: 'order' };
    if (cardId === 7101) return { ...common, note: 7201, deckName: 'Mining', question: '採掘', answer: 'mining' };
    if (cardId === 7104) return { ...common, note: 7204, deckName: 'Mining::Old', question: '古い', answer: 'old' };
    if (cardId === 7105) {
        return {
            ...common,
            note: 7205,
            deckName: 'Core',
            queue: 0,
            type: 0,
            due: 0,
            reps: 0,
            interval: 0,
            question: '新規',
            answer: 'new',
        };
    }
    if (cardId === 7107) {
        return {
            ...common,
            note: 7207,
            deckName: 'Archive',
            queue: 0,
            type: 0,
            due: 0,
            reps: 0,
            interval: 0,
            question: '保管',
            answer: 'archive',
        };
    }
    return { ...common, note: 7206, deckName: 'Core', due: 999999, question: '未来', answer: 'future' };
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
    await page.addScriptTag({ path: SCRIPT_PATH });
}

async function runReaderMiningSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests);
    await page.goto(`${baseUrl}/reader-anki.html`, { waitUntil: 'domcontentloaded' });
    const coloringStartedAt = Date.now();
    await injectUserscript(page);

    const knownWord = page.locator('main .jpdb-reader-word[data-expression="読む"]');
    await knownWord.waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForFunction(() => {
        const word = [...document.querySelectorAll('.jpdb-reader-word')]
            .find(element => element.dataset.expression === '読む' && (element.textContent ?? '').includes('読'));
        return word instanceof HTMLElement && word.dataset.ankiState === 'due' && word.classList.contains('anki-due');
    }, null, { timeout: 12000 });
    const firstAnkiColorMs = Date.now() - coloringStartedAt;
    const initialAnkiActions = ankiActions(requests);
    const initialAnkiActionCount = initialAnkiActions.length;
    const statusStorage = await readAnkiStatusStorage(page);

    const beforeHover = await knownWord.evaluate(element => ({
        state: element.dataset.ankiState,
        classes: [...element.classList],
        color: getComputedStyle(element).color,
        title: element.title,
    }));
    const hoverStartedAt = Date.now();
    await knownWord.hover();
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 8000 });
    await page.waitForSelector('.jpdb-reader-popover .jpdb-reader-anki-existing', { timeout: 8000 });
    await page.waitForFunction(() => {
        const text = document.querySelector('.jpdb-reader-popover .jpdb-reader-anki-existing')?.textContent ?? '';
        return /Anki/.test(text) && /Mining/.test(text) && /12/.test(text);
    }, null, { timeout: 12000 });
    await page.waitForFunction(() => {
        const text = document.querySelector('.jpdb-reader-popover .jpdb-reader-anki-existing')?.textContent ?? '';
        return text.includes('to read') && !text.includes('今日は本を読む') && !text.includes('Sentence');
    }, null, { timeout: 12000 });
    const hoverHydrationMs = Date.now() - hoverStartedAt;
    const hoverAnkiActions = ankiActions(requests).slice(initialAnkiActionCount);
    const afterHover = await knownWord.evaluate(element => ({
        state: element.dataset.ankiState,
        classes: [...element.classList],
        color: getComputedStyle(element).color,
        title: element.title,
    }));
    assert(beforeHover.state === 'due' && afterHover.state === 'due', 'Hover cleared rendered Anki state', { beforeHover, afterHover });
    assert(afterHover.classes.includes('anki-due'), 'Hover removed rendered Anki due class', { beforeHover, afterHover });
    assert(afterHover.color === beforeHover.color, 'Hover changed Anki word color', { beforeHover, afterHover });
    assert(firstAnkiColorMs < 8_000, 'Reader Anki coloring was not prompt after userscript injection', { firstAnkiColorMs, initialAnkiActions });
    assert(!initialAnkiActions.includes('multi') && !initialAnkiActions.includes('areDue'), 'Reader initial coloring performed detailed Anki hydration before hover', { initialAnkiActions });
    assert(hoverAnkiActions.includes('multi') && hoverAnkiActions.includes('areDue'), 'Reader hover did not lazily hydrate detailed Anki status', { initialAnkiActions, hoverAnkiActions });
    assert(hoverHydrationMs < 8_000, 'Reader hover Anki hydration was too slow', { hoverHydrationMs, hoverAnkiActions });
    assertAnkiStatusStorage(statusStorage, 2);

    const existingPopover = await page.evaluate(() => ({
        hasExisting: Boolean(document.querySelector('.jpdb-reader-popover .jpdb-reader-anki-existing')),
        hasMerge: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki-merge"]')),
        hasEdit: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki-edit"]')),
        hasAdd: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki"]')),
        text: document.querySelector('.jpdb-reader-popover')?.textContent ?? '',
    }));
    assert(existingPopover.hasExisting, 'Existing Anki section was missing from popover', existingPopover);
    assert(existingPopover.hasMerge && existingPopover.hasEdit, 'Existing Anki card did not expose merge/edit actions', existingPopover);
    assert(!existingPopover.hasAdd, 'Known Anki word still showed Add to Anki', existingPopover);
    assert(/Anki/.test(existingPopover.text) && /Mining/.test(existingPopover.text) && /12/.test(existingPopover.text), 'Popover did not include Anki status details', { existingPopover, requests });
    assert(existingPopover.text.includes('to read'), 'Popover did not include existing Anki rendered card contents', { existingPopover, requests });
    assert(!existingPopover.text.includes('今日は本を読む') && !existingPopover.text.includes('Sentence'), 'Popover exposed raw stored Anki fields instead of the rendered card', { existingPopover, requests });

    await page.locator('.jpdb-reader-popover [data-action="anki-merge"]').click();
    await page.waitForFunction(() => window.__ankiMergeSeen === true, null, { timeout: 100 }).catch(() => undefined);
    assert(requests.some(item => item.kind === 'anki-side-effect' && item.action === 'updateNoteFields'), 'Merge did not call updateNoteFields', { requests });

    await closeVisiblePopovers(page);
    const missingWord = page.locator('main .jpdb-reader-word[data-expression="書く"][data-reading="かきます"]');
    await missingWord.click({ force: true });
    await waitForVisibleAddButton(page, requests);
    await page.evaluate(() => {
        const visibleElements = (selector, root = document) => [...root.querySelectorAll(selector)].filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        });
        const enabledActionButtons = (selector, root = document) => [...root.querySelectorAll(selector)].filter(element => {
            const style = getComputedStyle(element);
            return style.visibility !== 'hidden' && style.display !== 'none' && !(element instanceof HTMLButtonElement && element.disabled);
        });
        const popover = visibleElements('.jpdb-reader-popover').find(element => element.textContent?.includes('書く'));
        const button = popover ? enabledActionButtons('[data-action="anki"]', popover)[0] : null;
        if (!(button instanceof HTMLElement)) throw new Error('Visible Add to Anki button was not found.');
        button.click();
    });
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

    const knownWord = page.locator('main .jpdb-reader-word[data-expression="読む"]');
    await knownWord.waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForFunction(() => {
        const word = [...document.querySelectorAll('.jpdb-reader-word')]
            .find(element => element.dataset.expression === '読む' && (element.textContent ?? '').includes('読'));
        return word instanceof HTMLElement && word.dataset.ankiState === 'due' && word.classList.contains('anki-due');
    }, null, { timeout: 12000 });

    const state = await page.evaluate(() => ({
        path: location.pathname,
        renderedWords: document.querySelectorAll('main .jpdb-reader-word').length,
        ankiStateWords: document.querySelectorAll('main .jpdb-reader-word[data-anki-state]').length,
        dueWords: document.querySelectorAll('main .jpdb-reader-word.anki-due').length,
        reading: document.querySelector('main .jpdb-reader-word[data-expression="読む"]')?.dataset.reading ?? '',
        surface: document.querySelector('main .jpdb-reader-word[data-expression="読む"]')?.textContent ?? '',
    }));
    assert(state.path === '/', 'Local root smoke did not run on the hosted root path', state);
    assert(state.renderedWords >= 6 && state.ankiStateWords >= 1 && state.dueWords >= 1, 'Local root page did not wrap and color Anki-aware words', state);

    await page.evaluate(text => {
        const paragraph = document.querySelector('main p');
        if (!paragraph) throw new Error('Local root fixture paragraph was missing.');
        paragraph.textContent = text;
    }, '今日は日本語の記事を読みました。明日は例文を書きます。難波を歩きます。');
    await page.waitForFunction(() => {
        const word = [...document.querySelectorAll('.jpdb-reader-word')]
            .find(element => element.dataset.expression === '読む' && (element.textContent ?? '').includes('読'));
        return word instanceof HTMLElement && word.dataset.ankiState === 'due' && word.classList.contains('anki-due');
    }, null, { timeout: 12000 });
    const rescannedState = await page.evaluate(() => ({
        renderedWords: document.querySelectorAll('main .jpdb-reader-word').length,
        ankiStateWords: document.querySelectorAll('main .jpdb-reader-word[data-anki-state]').length,
        dueWords: document.querySelectorAll('main .jpdb-reader-word.anki-due').length,
    }));
    assert(rescannedState.renderedWords >= 6 && rescannedState.ankiStateWords >= 1 && rescannedState.dueWords >= 1, 'Hosted root scan event did not restore Anki-aware reader words after unwrapping', { state, rescannedState });

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-local-root-smoke.png'), fullPage: false });
    await page.close();
    return {
        ...state,
        rescannedState,
        ankiActions: requests.filter(item => item.kind === 'anki').map(item => item.action),
        jpdbEndpoints: requests.filter(item => item.kind === 'jpdb').map(item => item.endpoint),
    };
}

async function runMobileAnkiHandoffSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        ankiMobileHandoff: true,
        wordTextColorSource: 'off',
        wordUnderlineColorSource: 'off',
        wordHighlightColorSource: 'off',
    }, { width: 390, height: 844 }, {
        name: 'mobile-handoff-unavailable',
        contextOptions: {
            isMobile: true,
            hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        },
    });
    page.on('dialog', dialog => void dialog.accept());
    await page.goto(`${baseUrl}/reader-anki.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);

    const targetWord = page.locator('main .jpdb-reader-word[data-expression="書く"][data-reading="かきます"]');
    await targetWord.waitFor({ state: 'visible', timeout: 8000 });
    await targetWord.click({ force: true });
    await page.waitForFunction(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        return Boolean(popover?.textContent?.includes('Send to AnkiMobile') && popover.textContent.includes('creates new notes only'));
    }, null, { timeout: 12000 });

    const mobilePopover = await page.evaluate(() => ({
        hasButton: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki"]')),
        text: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }));
    assert(mobilePopover.hasButton, 'Mobile Anki handoff button was missing', mobilePopover);
    assert(mobilePopover.text.includes('Send to AnkiMobile'), 'Mobile handoff action did not name AnkiMobile', mobilePopover);
    const mobileHandoffText = mobilePopover.text.toLowerCase();
    assert(mobileHandoffText.includes('creates new notes only')
        && mobileHandoffText.includes('existing-card status')
        && mobileHandoffText.includes('review queues')
        && mobileHandoffText.includes('ankiconnect'), 'Mobile handoff limitations were missing from the popover', mobilePopover);

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mobile-handoff-smoke.png'), fullPage: false });
    const actionCountBefore = requests.length;
    await page.locator('.jpdb-reader-popover [data-action="anki"]').click().catch(() => undefined);
    await page.waitForTimeout(250);
    assert(!requests.some(item => item.kind === 'anki-side-effect' && item.action === 'addNote'), 'Mobile handoff unexpectedly called AnkiConnect addNote', { requests });

    await page.close();
    return {
        text: mobilePopover.text,
        ankiActions: requests.filter(item => item.kind === 'anki').map(item => item.action),
        requestCountAfterClick: requests.length - actionCountBefore,
    };
}

async function runAndroidAnkiDroidHandoffSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        ankiMobileHandoff: true,
        wordTextColorSource: 'off',
        wordUnderlineColorSource: 'off',
        wordHighlightColorSource: 'off',
    }, { width: 412, height: 915 }, {
        name: 'android-handoff-unavailable',
        contextOptions: {
            isMobile: true,
            hasTouch: true,
            userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        },
    });
    page.on('dialog', dialog => void dialog.accept());
    await page.goto(`${baseUrl}/reader-anki.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);

    const targetWord = page.locator('main .jpdb-reader-word[data-expression="書く"][data-reading="かきます"]');
    await targetWord.waitFor({ state: 'visible', timeout: 8000 });
    await targetWord.click({ force: true });
    await page.waitForFunction(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        return Boolean(popover?.textContent?.includes('Send to AnkiDroid') && popover.textContent.includes('creates new notes only'));
    }, null, { timeout: 12000 });

    const mobilePopover = await page.evaluate(() => ({
        hasButton: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki"]')),
        text: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }));
    assert(mobilePopover.hasButton, 'Android AnkiDroid handoff button was missing', mobilePopover);
    assert(mobilePopover.text.includes('Send to AnkiDroid'), 'Android handoff action did not name AnkiDroid', mobilePopover);
    const androidHandoffText = mobilePopover.text.toLowerCase();
    assert(
        androidHandoffText.includes('creates new notes only')
            && androidHandoffText.includes('ankiconnect')
            && androidHandoffText.includes('review queues'),
        'Android handoff limitations were missing from the popover',
        mobilePopover,
    );

    const actionCountBefore = requests.length;
    await page.locator('.jpdb-reader-popover [data-action="anki"]').click().catch(() => undefined);
    await page.waitForTimeout(250);
    assert(!requests.some(item => item.kind === 'anki-side-effect' && item.action === 'addNote'), 'Android handoff unexpectedly called AnkiConnect addNote', { requests });
    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-android-handoff-smoke.png'), fullPage: false });
    await page.close();
    return {
        text: mobilePopover.text,
        ankiActions: requests.filter(item => item.kind === 'anki').map(item => item.action),
        requestCountAfterClick: requests.length - actionCountBefore,
    };
}

function ankiActions(requests) {
    return requests.filter(item => item.kind === 'anki').map(item => item.action);
}

function assertAnkiStatusStorage(storage, expectedCardCount) {
    assert(storage.cardCount === expectedCardCount, 'Anki status index card count did not match mocked collection total', storage);
    assert(storage.entryCount >= expectedCardCount, 'Anki status index did not store lookup entries for mocked cards', storage);
    if (storage.entryStore === 'indexeddb') {
        assert(storage.indexedDbEntryCount >= expectedCardCount, 'Anki status IndexedDB entry count did not match stored metadata', storage);
    }
}

async function readAnkiStatusStorage(page) {
    return page.evaluate(async ({ storageKey, dbName, entryStore }) => {
        const raw = localStorage.getItem(storageKey);
        let meta = null;
        try {
            meta = raw ? JSON.parse(raw) : null;
        } catch {
            meta = null;
        }
        const indexedDbEntryCount = meta?.entryStore === 'indexeddb'
            ? await countIndexedDbEntries(dbName, entryStore)
            : null;
        const valueEntryCount = meta?.entries && typeof meta.entries === 'object'
            ? Object.keys(meta.entries).length
            : 0;
        return {
            cardCount: Number(meta?.cardCount ?? 0),
            entryCount: Number(meta?.entryCount ?? valueEntryCount),
            entryStore: meta?.entryStore ?? 'value',
            indexedDbEntryCount,
            localStorageBytes: raw?.length ?? 0,
        };

        function countIndexedDbEntries(name, storeName) {
            if (typeof indexedDB === 'undefined') return Promise.resolve(null);
            return new Promise(resolve => {
                let settled = false;
                const done = value => {
                    if (settled) return;
                    settled = true;
                    resolve(value);
                };
                const request = indexedDB.open(name);
                request.onupgradeneeded = () => {
                    request.transaction?.abort();
                    done(null);
                };
                request.onerror = () => done(null);
                request.onsuccess = () => {
                    if (settled) {
                        request.result.close();
                        return;
                    }
                    const db = request.result;
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.close();
                        done(null);
                        return;
                    }
                    const tx = db.transaction(storeName, 'readonly');
                    const count = tx.objectStore(storeName).count();
                    count.onsuccess = () => done(Number(count.result));
                    count.onerror = () => done(null);
                    tx.oncomplete = () => db.close();
                    tx.onabort = () => {
                        db.close();
                        done(null);
                    };
                };
            });
        }
    }, {
        storageKey: ANKI_STATUS_INDEX_STORAGE_KEY,
        dbName: ANKI_STATUS_INDEX_DB_NAME,
        entryStore: ANKI_STATUS_INDEX_ENTRY_STORE,
    });
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
        await page.waitForFunction(() => {
            const visibleElements = (selector, root = document) => [...root.querySelectorAll(selector)].filter(element => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            });
            const enabledActionButtons = (selector, root = document) => [...root.querySelectorAll(selector)].filter(element => {
                const style = getComputedStyle(element);
                return style.visibility !== 'hidden' && style.display !== 'none' && !(element instanceof HTMLButtonElement && element.disabled);
            });
            const popover = visibleElements('.jpdb-reader-popover').find(element => element.textContent?.includes('書く'));
            return Boolean(popover && enabledActionButtons('[data-action="anki"]', popover).length);
        }, null, { timeout: 8000 });
    } catch (error) {
        const debug = await page.evaluate(() => {
            const visibleElements = (selector, root = document) => [...root.querySelectorAll(selector)].filter(element => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            });
            return {
                visiblePopoverCount: visibleElements('.jpdb-reader-popover').length,
                popovers: [...document.querySelectorAll('.jpdb-reader-popover')].map(popover => ({
                    visible: visibleElements('.jpdb-reader-popover').includes(popover),
                    text: popover.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
                })),
                pageWords: [...document.querySelectorAll('main .jpdb-reader-word')].map(word => ({
                    text: word.textContent,
                    ankiState: word.dataset.ankiState,
                })),
                addButtons: [...document.querySelectorAll('[data-action="anki"]')].map(button => {
                    const rect = button.getBoundingClientRect();
                    const style = getComputedStyle(button);
                    return {
                        text: button.textContent,
                        display: style.display,
                        visibility: style.visibility,
                        rect: { width: rect.width, height: rect.height },
                    };
                }),
            };
        });
        throw new Error(`Visible Add to Anki button did not appear: ${JSON.stringify({ debug, requests: requests.slice(-32) })}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function closeVisiblePopovers(page) {
    await page.mouse.move(12, 12);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
        const visibleElements = selector => [...document.querySelectorAll(selector)].filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        });
        return visibleElements('.jpdb-reader-popover').length === 0;
    }, null, { timeout: 1500 }).catch(() => undefined);
}

async function runNewTabSourceToggleSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        newTabSource: 'auto',
    }, { width: 1280, height: 820 });
    await page.goto(`${baseUrl}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-newtab-card]', { timeout: 12000 });
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('日本語'), null, { timeout: 12000 });

    const initial = await readNewTabState(page);
    assert(initial.prompt.includes('日本語') && initial.status.includes('JPDB') && initial.target === 'anki', 'Newtab did not start on JPDB with an Anki toggle target', initial);

    const jpdbToAnkiStartedAt = Date.now();
    await page.locator('[data-newtab-status]').click();
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('暗記'), null, { timeout: 12000 });
    const jpdbToAnkiMs = Date.now() - jpdbToAnkiStartedAt;
    const anki = await readNewTabState(page);
    assert(anki.prompt.includes('暗記') && anki.status.includes('Anki') && anki.target === 'jpdb', 'Newtab source toggle did not switch to Anki', anki);
    assert(jpdbToAnkiMs < 5_000, 'JPDB to Anki source toggle was too slow', { jpdbToAnkiMs, initial, anki, requests });

    const ankiToJpdbStartedAt = Date.now();
    await page.locator('[data-newtab-status]').click();
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('日本語'), null, { timeout: 12000 });
    const ankiToJpdbMs = Date.now() - ankiToJpdbStartedAt;
    const jpdb = await readNewTabState(page);
    assert(jpdb.prompt.includes('日本語') && jpdb.status.includes('JPDB') && jpdb.target === 'anki', 'Newtab source toggle did not switch back to JPDB', jpdb);
    assert(ankiToJpdbMs < 5_000, 'Anki to JPDB source toggle was too slow', { ankiToJpdbMs, anki, jpdb, requests });

    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-mining-newtab-smoke.png'), fullPage: false });
    await page.close();
    return {
        initial,
        anki,
        jpdb,
        latencyMs: {
            jpdbToAnki: jpdbToAnkiMs,
            ankiToJpdb: ankiToJpdbMs,
        },
        jpdbEndpoints: requests.filter(item => item.kind === 'jpdb').map(item => item.endpoint),
        ankiActions: ankiActions(requests),
    };
}

async function runNewTabMultiDeckAnkiSmoke(browser, baseUrl) {
    const requests = [];
    const page = await newMockedPage(browser, requests, {
        ...baseSettings,
        ankiModel: '',
        newTabSource: 'anki',
        newTabAnkiEnabled: true,
        newTabAnkiDisabledDecks: ['Mining::Old', 'Archive'],
    }, { width: 1280, height: 820 }, { name: 'multi-deck-newtab' });
    await page.goto(`${baseUrl}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-newtab-card]', { timeout: 12000 });
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('採掘'), null, { timeout: 12000 });

    const first = await readNewTabState(page);
    assert(first.prompt.includes('採掘') && first.status.includes('Anki'), 'Multi-deck newtab did not start from the merged Anki SRS due queue', { first, requests });

    await page.locator('[data-newtab-action="next"]').click();
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('順番'), null, { timeout: 12000 });
    const second = await readNewTabState(page);
    assert(second.prompt.includes('順番') && second.status.includes('Anki'), 'Multi-deck newtab did not preserve Anki due order after filtering disabled decks', { first, second, requests });

    await page.waitForTimeout(650);
    await page.locator('[data-newtab-action="next"]').click();
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('新規'), null, { timeout: 12000 });
    const third = await readNewTabState(page);
    assert(third.prompt.includes('新規') && third.status.includes('Anki'), 'Multi-deck newtab did not fill due queue with enabled new cards', { first, second, third, requests });

    const findQueries = requests
        .filter(item => item.kind === 'anki' && item.action === 'findCards')
        .map(item => String(item.params.query ?? ''));
    assert(findQueries.length >= 2, 'Multi-deck newtab did not query due and new Anki queues', { findQueries, requests });
    findQueries.forEach(query => {
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
        findQueries,
        noteIds,
        ankiActions: requests.filter(item => item.kind === 'anki').map(item => item.action),
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
        enableReviews: true,
    }, { width: 1280, height: 820 }, { name: 'jpdb-mixed-newtab' });
    await page.goto(`${baseUrl}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-newtab-card]', { timeout: 12000 });
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('未解禁'), null, { timeout: 12000 });

    const lockedFront = await readNewTabState(page);
    assert(lockedFront.prompt.includes('未解禁') && lockedFront.status.includes('JPDB'), 'JPDB mixed queue did not start on the locked card from deck order', { lockedFront, requests });

    await page.locator('[data-newtab-action="reveal"]').click();
    await page.waitForFunction(() => document.querySelector('[data-newtab-controls]')?.textContent?.includes('Hide'), null, { timeout: 12000 });
    const lockedRevealed = await readNewTabState(page);
    assert(lockedRevealed.gradeButtons.length === 0, 'Locked JPDB card exposed grade buttons in built newtab', lockedRevealed);
    assert(lockedRevealed.controls.join(',') === 'previous,reveal,next', 'Locked JPDB card did not fall back to navigation controls', lockedRevealed);
    assert(!requests.some(item => item.kind === 'jpdb' && item.endpoint === 'review'), 'Locked JPDB card submitted a review before any grade action', requests);

    await page.waitForTimeout(650);
    await page.locator('[data-newtab-action="next"]').click();
    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('復習'), null, { timeout: 12000 });
    const dueFront = await readNewTabState(page);
    assert(dueFront.prompt.includes('復習') && dueFront.status.includes('2 / 3'), 'JPDB mixed queue did not preserve the due card as the second deck card', { lockedFront, lockedRevealed, dueFront, requests });

    if (!dueFront.gradeButtons.length) {
        await page.locator('[data-newtab-action="reveal"]').click();
        await page.waitForFunction(() => document.querySelectorAll('[data-newtab-action="grade"]').length > 0, null, { timeout: 12000 });
    }
    const dueRevealed = await readNewTabState(page);
    assert(dueRevealed.gradeButtons.includes('okay'), 'Due JPDB card did not expose grade buttons after reveal', dueRevealed);

    await page.locator('[data-newtab-action="grade"][data-grade="okay"]').click();
    await waitForRequest(requests, item => item.kind === 'jpdb' && item.endpoint === 'review');
    const reviewRequests = requests.filter(item => item.kind === 'jpdb' && item.endpoint === 'review');
    assert(reviewRequests.length === 1, 'JPDB mixed queue submitted an unexpected number of review requests', { reviewRequests, requests });
    assert(reviewRequests[0]?.body?.vid === 302 && reviewRequests[0]?.body?.sid === 402, 'JPDB mixed queue graded the wrong card', { reviewRequests, requests });

    await page.waitForFunction(() => document.querySelector('[data-newtab-prompt]')?.textContent?.includes('新語'), null, { timeout: 12000 });
    const next = await readNewTabState(page);
    assert(next.prompt.includes('新語') && next.status.includes('2 / 2'), 'JPDB mixed queue did not advance to the remaining new card after grading the due card', { next, requests });

    const lookupBodies = requests
        .filter(item => item.kind === 'jpdb' && item.endpoint === 'lookup-vocabulary')
        .map(item => item.body);
    assert(lookupBodies.some(body => JSON.stringify(body.list) === JSON.stringify([[301, 401], [302, 402], [303, 403]])), 'JPDB mixed queue did not request vocabulary in deck/list order', { lookupBodies, requests });

    await page.screenshot({ path: path.join(ARTIFACTS, 'jpdb-newtab-mixed-queue-smoke.png'), fullPage: false });
    await page.close();
    return {
        lockedFront,
        lockedRevealed,
        dueFront,
        dueRevealed,
        next,
        reviewRequests: reviewRequests.map(item => item.body),
        jpdbEndpoints: requests.filter(item => item.kind === 'jpdb').map(item => item.endpoint),
    };
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
        return {
            prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '',
            status: status?.textContent?.trim() ?? '',
            action: status?.dataset.newtabAction,
            target: status?.dataset.sourceToggleTarget,
            light: document.querySelector('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source,
            controls: [...document.querySelectorAll('[data-newtab-controls] [data-newtab-action]')]
                .map(element => element.dataset.newtabAction ?? ''),
            gradeButtons: [...document.querySelectorAll('[data-newtab-action="grade"]')]
                .map(element => element.dataset.grade ?? ''),
        };
    });
}

async function main() {
    assertBuiltArtifacts();
    mkdirSync(ARTIFACTS, { recursive: true });
    const { server, baseUrl } = await createFixtureServer();
    const browser = await chromium.launch({ headless: true });
    try {
        const reader = await runReaderMiningSmoke(browser, baseUrl);
        const localRoot = await runLocalRootReaderSmoke(browser, baseUrl);
        const mobileHandoff = await runMobileAnkiHandoffSmoke(browser, baseUrl);
        const androidHandoff = await runAndroidAnkiDroidHandoffSmoke(browser, baseUrl);
        const newtab = await runNewTabSourceToggleSmoke(browser, baseUrl);
        const newtabMultiDeck = await runNewTabMultiDeckAnkiSmoke(browser, baseUrl);
        const jpdbMixedQueue = await runNewTabJpdbMixedQueueSmoke(browser, baseUrl);
        console.log(JSON.stringify({ reader, localRoot, mobileHandoff, androidHandoff, newtab, newtabMultiDeck, jpdbMixedQueue }, null, 2));
    } finally {
        await browser.close().catch(() => undefined);
        await new Promise(resolve => server.close(resolve));
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
