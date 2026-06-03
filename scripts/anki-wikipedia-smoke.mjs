#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const SCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const CSS_PATH = path.join(DIST, 'yomu.css');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const ANKI_URL = 'http://127.0.0.1:8765';
const ANKI_STATUS_INDEX_STORAGE_KEY = 'yomu:anki-status-index:v1';
const ANKI_STATUS_INDEX_DB_NAME = 'yomu-anki-status-index';
const ANKI_STATUS_INDEX_ENTRY_STORE = 'entries';
const TARGET_URL = process.env.YOMU_WIKIPEDIA_URL || 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E';

const settings = {
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'en',
    ankiEnabled: true,
    ankiConnectUrl: ANKI_URL,
    ankiDeck: 'Mining',
    ankiModel: 'Imported Japanese',
    ankiMobileHandoff: false,
    jpdbMiningEnabled: false,
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
    popupActivationMode: 'click',
    showFloatingButton: false,
    wordTextColorSource: 'anki',
    wordUnderlineColorSource: 'off',
    wordHighlightColorSource: 'off',
    enableLogging: false,
};

const vocabulary = [
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250],
    ['日本', '日本', 'にほん', 'Japan', ['n'], 120],
    ['言語', '言語', 'げんご', 'language', ['n'], 620],
    ['漢字', '漢字', 'かんじ', 'kanji', ['n'], 900],
    ['文字', '文字', 'もじ', 'character', ['n'], 780],
    ['文法', '文法', 'ぶんぽう', 'grammar', ['n'], 1800],
];

function assert(condition, message, details = {}) {
    if (!condition) {
        throw new Error(`${message}: ${JSON.stringify(details, null, 2)}`);
    }
}

mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    bypassCSP: true,
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
});
const page = await context.newPage();
const requests = [];

await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS' && isMockedApiOrigin(url)) {
        await route.fulfill({ status: 204, headers: corsHeaders() });
        return;
    }
    const mocked = mockHttpRequest({
        method: request.method(),
        url: request.url(),
        data: request.postData() ?? '',
    }, requests);
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

await page.exposeFunction('__yomuAnkiWikipediaRequest', async request => {
    const mocked = mockHttpRequest(request, requests);
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
    window.unwrappedVisibleKnownWikipediaSamples = () => {
        const root = document.querySelector('#mw-content-text');
        if (!root) return [];
        const knownTerms = ['日本語', '日本', '言語', '漢字', '文字', '文法'];
        const samples = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.jpdb-reader-word,[data-jpdb-reader-root],script,style,noscript,a[href],button,input,textarea,select,sup.reference,.mw-editsection,.vector-page-toolbar,.vector-toc,.toc,.navbox,.metadata,.legend,.noprint')) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (!isVisibleForSmoke(parent)) return NodeFilter.FILTER_REJECT;
                const text = node.nodeValue ?? '';
                return knownTerms.some(term => text.includes(term)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
        });
        for (let node = walker.nextNode(); node && samples.length < 8; node = walker.nextNode()) {
            const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
            const term = knownTerms.find(value => text.includes(value));
            if (!term) continue;
            const parent = node.parentElement;
            const ancestor = parent?.closest('p,li,td,th,figcaption,section,div');
            samples.push({
                term,
                text: text.slice(0, 160),
                parentTag: parent?.tagName ?? '',
                parentClass: String(parent?.className ?? ''),
                ancestor: ancestor?.tagName ?? '',
                ancestorClass: String(ancestor?.className ?? ''),
            });
        }
        return samples;
    };
    function isVisibleForSmoke(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
    }
    window.GM_xmlhttpRequest = options => {
        let settled = false;
        const settle = callback => value => {
            if (settled) return;
            settled = true;
            callback?.(value);
        };
        Promise.resolve(window.__yomuAnkiWikipediaRequest({
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

const startedAt = Date.now();
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
await page.addStyleTag({ path: CSS_PATH });
const coloringStartedAt = Date.now();
await page.addScriptTag({ path: SCRIPT_PATH });

await page.waitForSelector('.jpdb-reader-word', { timeout: 45_000 });
await page.waitForFunction(() => {
    const words = [...document.querySelectorAll('.jpdb-reader-word')]
        .filter(element => element.textContent?.includes('日本語'));
    return words.some(element => element instanceof HTMLElement && element.dataset.ankiState === 'due');
}, null, { timeout: 45_000 });
const firstAnkiColorMs = Date.now() - coloringStartedAt;
await page.waitForFunction(() => {
    return unwrappedVisibleKnownWikipediaSamples().length === 0;
}, null, { timeout: 45_000 }).catch(() => undefined);
const initialAnkiActions = ankiActions(requests);
const initialAnkiActionCount = initialAnkiActions.length;
const statusStorage = await readAnkiStatusStorage(page);

const firstKnownWord = page.locator('.jpdb-reader-word.anki-due').filter({ hasText: '日本語' }).first();
const beforeClick = await firstKnownWord.evaluate(element => ({
    state: element.dataset.ankiState,
    classes: [...element.classList],
    color: getComputedStyle(element).color,
    title: element.title,
}));
await firstKnownWord.click();
await page.waitForSelector('.jpdb-reader-popover .jpdb-reader-anki-existing', { timeout: 12_000 });
await page.waitForFunction(() => {
    const text = document.querySelector('.jpdb-reader-popover .jpdb-reader-anki-existing')?.textContent ?? '';
    return text.includes('Japanese language') || text.includes('Mining') || text.includes('14');
}, null, { timeout: 12_000 });
const afterClick = await firstKnownWord.evaluate(element => ({
    state: element.dataset.ankiState,
    classes: [...element.classList],
    color: getComputedStyle(element).color,
    title: element.title,
}));
const popover = await page.evaluate(() => ({
    hasExisting: Boolean(document.querySelector('.jpdb-reader-popover .jpdb-reader-anki-existing')),
    hasAdd: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki"]')),
    hasMerge: Boolean(document.querySelector('.jpdb-reader-popover [data-action="anki-merge"]')),
    text: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1000) ?? '',
}));
const pageState = await page.evaluate(() => {
    return {
        url: location.href,
        title: document.title,
        renderedWords: document.querySelectorAll('.jpdb-reader-word').length,
        ankiColoredWords: document.querySelectorAll('.jpdb-reader-word[class*="anki-"]').length,
        japaneseAnkiWords: [...document.querySelectorAll('.jpdb-reader-word')]
            .filter(element => element.textContent?.includes('日本語') && element instanceof HTMLElement && element.dataset.ankiState).length,
        unwrappedVisibleKnownSamples: unwrappedVisibleKnownWikipediaSamples(),
    };
});
const elapsedMs = Date.now() - startedAt;
const clickAnkiActions = ankiActions(requests).slice(initialAnkiActionCount);

const viewportSamples = [];
for (const scrollY of [0, 650, 1200, 1800, 2600]) {
    await page.evaluate(y => window.scrollTo({ top: y, left: 0, behavior: 'instant' }), scrollY);
    await page.waitForTimeout(120);
    await page.waitForFunction(() => unwrappedVisibleKnownWikipediaSamples().length === 0, null, { timeout: 12_000 }).catch(() => undefined);
    viewportSamples.push({
        scrollY,
        samples: await page.evaluate(() => unwrappedVisibleKnownWikipediaSamples()),
    });
}

assert(beforeClick.state === 'due' && afterClick.state === 'due', 'Click cleared rendered Anki state', { beforeClick, afterClick });
assert(afterClick.classes.includes('anki-due'), 'Click removed rendered Anki due class', { beforeClick, afterClick });
assert(afterClick.color === beforeClick.color, 'Click changed Anki word color', { beforeClick, afterClick });
assert(popover.hasExisting, 'Existing Anki section was missing from Wikipedia popover', popover);
assert(popover.hasMerge, 'Existing Anki popover did not expose merge', popover);
assert(!popover.hasAdd, 'Known Anki word showed Add to Anki on Wikipedia', popover);
assert(pageState.renderedWords > 0 && pageState.ankiColoredWords > 0, 'Wikipedia page did not render Anki-colored words', pageState);
assert(pageState.unwrappedVisibleKnownSamples.length === 0, 'Wikipedia left visible mocked vocabulary unwrapped on initial scan', pageState);
assert(viewportSamples.every(item => item.samples.length === 0), 'Wikipedia left mocked vocabulary unwrapped after scrolling into view', { viewportSamples });
assert(firstAnkiColorMs < 15_000, 'Wikipedia Anki coloring was not prompt after userscript injection', { firstAnkiColorMs, initialAnkiActions });
assert(!initialAnkiActions.includes('multi') && !initialAnkiActions.includes('areDue'), 'Wikipedia initial coloring performed detailed Anki hydration before interaction', { initialAnkiActions });
assert(clickAnkiActions.includes('multi') && clickAnkiActions.includes('areDue'), 'Wikipedia click did not lazily hydrate detailed Anki status', { initialAnkiActions, clickAnkiActions });
assertAnkiStatusStorage(statusStorage, 1);

await page.screenshot({ path: path.join(ARTIFACTS, 'anki-wikipedia-smoke.png'), fullPage: false });
const report = {
    target: TARGET_URL,
    elapsedMs,
    firstAnkiColorMs,
    pageState,
    viewportSamples,
    popover,
    statusStorage,
    initialAnkiActions,
    clickAnkiActions,
    ankiActions: ankiActions(requests),
    jpdbEndpoints: requests.filter(item => item.kind === 'jpdb').map(item => item.endpoint),
};
writeFileSync(path.join(ARTIFACTS, 'anki-wikipedia-smoke.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await context.close();
await browser.close();

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

function mockHttpRequest(request, requests) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname.startsWith('/api/v1/')) {
        const endpoint = url.pathname.slice('/api/v1/'.length);
        const body = readJsonBody(request.data);
        const response = endpoint === 'parse' ? mockJpdbParse(body) : {};
        requests.push({ kind: 'jpdb', endpoint, body });
        return jsonHttpResponse(response);
    }
    if (url.origin === ANKI_URL) {
        const body = readJsonBody(request.data);
        const response = mockAnkiConnect(body);
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
        contentType: 'application/json; charset=utf-8',
    };
}

function readJsonBody(data) {
    if (!data) return {};
    if (typeof data === 'string') return JSON.parse(data);
    return data;
}

function mockJpdbParse(body) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(value => String(value)) : [];
    const parsedVocabulary = [];
    const vocabIndexBySpelling = new Map();
    const tokens = paragraphs.map(text => {
        const paragraphTokens = [];
        for (let index = 0; index < text.length;) {
            const entry = vocabulary
                .map(([surface, spelling, reading, gloss, partOfSpeech, frequency]) => ({
                    surface,
                    spelling,
                    reading,
                    gloss,
                    partOfSpeech,
                    frequency,
                }))
                .filter(item => text.startsWith(item.surface, index))
                .sort((a, b) => b.surface.length - a.surface.length)[0];
            if (!entry) {
                index += 1;
                continue;
            }
            let vocabularyIndex = vocabIndexBySpelling.get(entry.spelling);
            if (vocabularyIndex === undefined) {
                vocabularyIndex = parsedVocabulary.length;
                vocabIndexBySpelling.set(entry.spelling, vocabularyIndex);
                parsedVocabulary.push([
                    1000 + vocabularyIndex,
                    2000 + vocabularyIndex,
                    0,
                    entry.spelling,
                    entry.reading,
                    entry.frequency,
                    entry.partOfSpeech,
                    [[entry.gloss]],
                    [entry.partOfSpeech],
                    ['not-in-deck'],
                    ['LHH'],
                ]);
            }
            paragraphTokens.push([
                vocabularyIndex,
                index,
                entry.surface.length,
                [[entry.surface, entry.reading]],
            ]);
            index += entry.surface.length;
        }
        return paragraphTokens;
    });
    return { vocabulary: parsedVocabulary, tokens };
}

function mockAnkiConnect(body) {
    const action = body.action;
    const params = body.params ?? {};
    if (action === 'multi') {
        const actions = Array.isArray(params.actions) ? params.actions : [];
        return {
            result: actions.map(item => mockAnkiConnect({ action: item.action, params: item.params ?? {} })),
            error: null,
        };
    }
    return { result: mockAnkiResult(action, params), error: null };
}

function mockAnkiResult(action, params) {
    const query = String(params.query ?? '');
    switch (action) {
        case 'version':
            return 6;
        case 'deckNames':
            return ['Mining'];
        case 'getDeckStats':
            return { 1: { name: 'Mining', total_in_deck: 1 } };
        case 'findCards':
            if (query === 'deck:*' || query.includes('is:due')) return [8001];
            return [];
        case 'findNotes':
            if (query === 'deck:*' || /日本語|にほんご/.test(query)) return [9001];
            return [];
        case 'notesInfo':
            return (Array.isArray(params.notes) ? params.notes : []).map(() => ({
                noteId: 9001,
                modelName: 'Imported Japanese',
                tags: ['existing'],
                fields: {
                    Word: { value: '日本語' },
                    Reading: { value: 'にほんご' },
                    Meaning: { value: 'Japanese language' },
                    Sentence: { value: '日本語の記事を読む。' },
                },
                cards: [8001],
            }));
        case 'cardsInfo':
            return (Array.isArray(params.cards) ? params.cards : []).map(() => ({
                cardId: 8001,
                note: 9001,
                deckName: 'Mining',
                queue: 2,
                type: 2,
                reps: 14,
                lapses: 1,
                question: '<div>日本語</div>',
                answer: '<div>Japanese language</div>',
            }));
        case 'areDue':
            return (Array.isArray(params.cards) ? params.cards : []).map(() => true);
        case 'modelNames':
            return ['Imported Japanese'];
        case 'modelFieldNames':
            return ['Word', 'Reading', 'Meaning', 'Sentence'];
        case 'updateNoteFields':
        case 'guiBrowse':
        case 'answerCards':
            return null;
        default:
            return null;
    }
}

function ankiActions(requests) {
    return requests.filter(item => item.kind === 'anki').map(item => item.action);
}

function assertAnkiStatusStorage(storage, expectedCardCount) {
    assert(storage.cardCount === expectedCardCount, 'Anki status index card count did not match mocked collection total', storage);
    assert(storage.entryCount >= expectedCardCount, 'Anki status index did not store a lookup entry for mocked cards', storage);
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
