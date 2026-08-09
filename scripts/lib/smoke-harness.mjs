import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { createYomuPaths } from './paths.mjs';

export const DEFAULT_ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
export const YOMU_SETTINGS_KEY = 'jpdb-popup-reader-settings';
export const YOMU_STUDY_SEARCH_URL = 'https://yomureader.com/study/index.html?q=';

const JAPANESE_SMOKE_LOOKUP_LINKS = Object.freeze([
    { id: 'yomu-search', label: 'Yomu', urlTemplate: `${YOMU_STUDY_SEARCH_URL}{query}`, enabled: true },
    { id: 'jiten', label: 'Jiten', urlTemplate: 'https://jiten.moe/parse?text={query}', enabled: true },
    { id: 'jpdb', label: 'JPDB', urlTemplate: 'https://jpdb.io/search?q={query}', enabled: true },
    { id: 'bunpro', label: 'Bunpro', urlTemplate: 'https://bunpro.jp/search?query={query}', enabled: true },
    { id: 'jisho', label: 'Jisho', urlTemplate: 'https://jisho.org/search/{query}', enabled: true },
    { id: 'copy', label: 'Copy', urlTemplate: '', enabled: true, action: 'copy' },
]);

const DEFAULT_ANKI_STATUS_STORAGE = {
    storageKey: 'yomu:anki-status-index:v1',
    dbName: 'yomu-anki-status-index',
    entryStore: 'entries',
};

const DEFAULT_ANKI_SMOKE_SETTINGS = Object.freeze({
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'en',
    ankiEnabled: true,
    ankiConnectUrl: DEFAULT_ANKI_CONNECT_URL,
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
});

const DEFAULT_READER_SMOKE_SETTINGS = Object.freeze({
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-key',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'off',
    enableLogging: false,
});

export function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

export function createSmokePaths(scriptDir) {
    const { appRoot: root, qaArtifactsRoot } = createYomuPaths(scriptDir);
    const dist = path.join(root, 'dist');
    const newTabDir = path.join(dist, 'newtab');
    return {
        root,
        dist,
        artifacts: qaArtifactsRoot,
        scriptPath: path.join(dist, 'yomu.user.js'),
        cssPath: path.join(dist, 'yomu.css'),
        newTabDir,
    };
}

export function createAnkiSmokeSettings(overrides = {}) {
    return { ...DEFAULT_ANKI_SMOKE_SETTINGS, ...overrides };
}

export function createReaderSmokeSettings(overrides = {}) {
    return { ...DEFAULT_READER_SMOKE_SETTINGS, ...overrides };
}

export function japaneseSmokeLookupLinks({ includeBunpro = false } = {}) {
    return JAPANESE_SMOKE_LOOKUP_LINKS
        .filter(link => includeBunpro || link.id !== 'bunpro')
        .map(link => ({ ...link }));
}

export function assertBuiltArtifacts(filePaths, root, hint = 'Run npm run build first.') {
    for (const filePath of filePaths) {
        assert(existsSync(filePath), `Missing built artifact: ${path.relative(root, filePath)}. ${hint}`);
    }
}

export function serveFile(response, filePath, contentType, method = 'GET') {
    response.writeHead(200, { 'content-type': contentType });
    response.end(method === 'HEAD' ? undefined : readFileSync(filePath));
}

export async function startLoopbackServer(handler, bindErrorMessage = 'Could not bind fixture server') {
    const server = createServer(handler);
    const origin = await listenOnLoopback(server, bindErrorMessage);
    return {
        server,
        origin,
        baseUrl: origin,
        close: () => closeServer(server),
    };
}

export function createFixtureServer(handler, bindErrorMessage = 'Could not bind fixture server') {
    return startLoopbackServer(handler, bindErrorMessage);
}

export function startHtmlFixtureServer(pagePath, html, bindErrorMessage = 'Could not bind HTML fixture server') {
    return startLoopbackServer((request, response) => {
        if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== pagePath) {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('Not found');
            return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html);
    }, bindErrorMessage);
}

async function listenOnLoopback(server, bindErrorMessage = 'Could not bind fixture server') {
    return await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error(bindErrorMessage));
                return;
            }
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}

export function closeServer(server) {
    // Accept either a raw http.Server or the { server, origin } wrapper returned
    // by startLoopbackServer, so a wrapper passed by mistake cannot hang the run.
    const target = server?.server ?? server;
    return new Promise(resolve => target.close(resolve));
}

export async function closeSmokeBrowserAndServer(browser, server) {
    await browser.close().catch(() => undefined);
    await closeServer(server);
}

export async function newAutoClosingPage(browser, contextOptions) {
    const context = await browser.newContext(contextOptions);
    await maskAutomationSignals(context);
    const page = await context.newPage();
    closeContextAfterLastPage(page, context);
    return { context, page };
}

export async function dismissConsent(page) {
    for (const selector of ['button:has-text("Accept all")', 'button:has-text("すべてに同意")', 'form[action*="consent"] button']) {
        const control = page.locator(selector).first();
        if (await control.count().catch(() => 0)) {
            await control.click({ timeout: 1500 }).catch(() => undefined);
            await page.waitForTimeout(1000);
        }
    }
}

function closeContextAfterLastPage(page, context) {
    page.once('close', () => {
        if (context.pages().length === 0) void context.close().catch(() => undefined);
    });
}

export async function routeMockedHttpRequests(page, { requests, mockHttpRequest, isMockedApiOrigin, scenario = {} }) {
    await page.route('**/*', route => handleMockedHttpRoute(route, {
        requests,
        mockHttpRequest,
        isMockedApiOrigin,
        scenario,
    }));
}

async function handleMockedHttpRoute(route, config) {
    const request = route.request();
    const routeUrl = new URL(request.url());
    if (isCorsPreflightForMockedApi(request, routeUrl, config.isMockedApiOrigin)) {
        await route.fulfill({ status: 204, headers: corsHeaders() });
        return;
    }
    const mocked = config.mockHttpRequest(mockRequestPayload(request), config.requests, config.scenario);
    if (!mocked) {
        await route.continue();
        return;
    }
    await fulfillMockedHttpResponse(route, mocked);
}

function isCorsPreflightForMockedApi(request, routeUrl, isMockedApiOrigin) {
    return request.method() === 'OPTIONS' && isMockedApiOrigin(routeUrl);
}

function mockRequestPayload(request) {
    return {
        method: request.method(),
        url: request.url(),
        data: request.postData() ?? '',
    };
}

async function fulfillMockedHttpResponse(route, mocked) {
    const options = mockedFulfillOptions(mocked);
    await route.fulfill(options);
}

function mockedFulfillOptions(mocked) {
    const options = mockedFulfillBaseOptions(mocked);
    if (mocked.contentType) options.contentType = mocked.contentType;
    options.body = mockedFulfillBody(mocked);
    return options;
}

function mockedFulfillBaseOptions(mocked) {
    return {
        status: mocked.status ?? 200,
        headers: { ...corsHeaders(), ...(mocked.headers ?? {}) },
    };
}

function mockedFulfillBody(mocked) {
    if (mocked.body !== undefined) return mocked.body;
    return mocked.responseText ?? '';
}

export function corsHeaders(
    allowHeaders = 'content-type, authorization',
    allowMethods = 'GET, POST, OPTIONS',
) {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': allowHeaders,
        'access-control-allow-methods': allowMethods,
    };
}

export function textResponse(responseText, contentType, status = 200) {
    return {
        status,
        responseText,
        bytes: [...Buffer.from(responseText, 'utf8')],
        contentType,
    };
}

export function jsonHttpResponse(value) {
    const responseText = JSON.stringify(value);
    return {
        status: 200,
        responseText,
        bytes: [...Buffer.from(responseText)],
        contentType: 'application/json; charset=utf-8',
    };
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

let pngCrcTable;

function getPngCrcTable() {
    if (pngCrcTable) return pngCrcTable;
    const table = new Int32Array(256);
    for (let index = 0; index < table.length; index += 1) {
        let checksum = index;
        for (let bit = 0; bit < 8; bit += 1) {
            checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
        }
        table[index] = checksum;
    }
    pngCrcTable = table;
    return pngCrcTable;
}

function pngCrc32(buffer) {
    const table = getPngCrcTable();
    let checksum = ~0;
    for (const byte of buffer) checksum = table[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
    return ~checksum >>> 0;
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typedData = Buffer.concat([Buffer.from(type), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(pngCrc32(typedData));
    return Buffer.concat([length, typedData, checksum]);
}

export function makePng(width = 200, height = 280, invert = false) {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    let offset = 0;
    for (let y = 0; y < height; y += 1) {
        raw[offset++] = 0;
        for (let x = 0; x < width; x += 1) {
            let value = x % 40 < 22 && y % 50 < 30 ? 0 : (x + y) % 3 === 0 ? 96 : 255;
            if (invert) value = 255 - value;
            raw[offset++] = value;
            raw[offset++] = value;
            raw[offset++] = value;
            raw[offset++] = 255;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw)),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

export function mockJpdbApiRequest(request, requestLog, vocabulary, options = {}) {
    const url = new URL(request.url);
    if (!jpdbApiUrl(url)) return unmatchedJpdbRequest(request, requestLog, options);
    const endpoint = url.pathname.slice('/api/v1/'.length);
    const body = readJsonBody(request.data);
    requestLog.push({ kind: 'jpdb', endpoint, text: body.text });
    return jpdbEndpointResponse(endpoint, body, vocabulary);
}

function jpdbApiUrl(url) {
    return [url.origin === 'https://jpdb.io', url.pathname.startsWith('/api/v1/')].every(Boolean);
}

function unmatchedJpdbRequest(request, requestLog, options) {
    if (options.logUnexpected) requestLog.push({ kind: 'unexpected', url: request.url });
    return options.unmatchedResponse ?? null;
}

function jpdbEndpointResponse(endpoint, body, vocabulary) {
    if (endpoint === 'parse') return jsonHttpResponse(mockJpdbParseFromVocabulary(body, vocabulary));
    const fixed = new Map([
        ['deck/list-vocabulary', { vocabulary: [] }],
        ['list-user-decks', { decks: [] }],
    ]);
    return jsonHttpResponse(fixed.get(endpoint) ?? {});
}

export function readJsonBody(data) {
    const decoded = decodeGmRequestBody(data);
    if (!decoded) return {};
    if (Buffer.isBuffer(decoded)) return JSON.parse(decoded.toString('utf8'));
    if (typeof decoded === 'string') return JSON.parse(decoded);
    return decoded;
}

const GM_REQUEST_BODY_DECODERS = {
    arraybuffer: data => Buffer.from(data.bytes ?? []),
    formdata: data => gmRequestFormData(data.entries ?? []),
};

export function decodeGmRequestBody(data) {
    if (!isGmSerializedBody(data)) return data;
    const decoder = GM_REQUEST_BODY_DECODERS[data.kind];
    return decoder ? decoder(data) : data;
}

function isGmSerializedBody(data) {
    if (!data) return false;
    return typeof data === 'object';
}

export function gmRequestFetchBody(request) {
    const body = decodeGmRequestBody(request.data);
    if (body == null || body === '' || isBodylessFetchMethod(request.method)) return undefined;
    return body;
}

function isBodylessFetchMethod(method) {
    return /^(GET|HEAD)$/i.test(method || 'GET');
}

function gmRequestFormData(entries) {
    const formData = new FormData();
    for (const entry of entries) appendGmRequestFormDataEntry(formData, entry);
    return formData;
}

function appendGmRequestFormDataEntry(formData, entry) {
    if (!entry.blob) return appendGmRequestTextEntry(formData, entry);
    appendGmRequestBlobEntry(formData, entry);
}

function appendGmRequestTextEntry(formData, entry) {
    formData.append(entry.name, entry.value ?? '');
}

function appendGmRequestBlobEntry(formData, entry) {
    formData.append(
        entry.name,
        new Blob([Buffer.from(entry.blob.bytes ?? [])], { type: entry.blob.type || 'application/octet-stream' }),
        entry.blob.filename || 'file',
    );
}

export function mockJpdbParseFromVocabulary(body, rows, options = {}) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(value => String(value)) : body.text ? [String(body.text)] : [];
    const fixtureVocabulary = rows.map(normalizeJpdbVocabularyRow).sort((a, b) => b.surface.length - a.surface.length);
    const vocabulary = [];
    const vocabIndexBySpelling = new Map();
    const tokens = paragraphs.map(text => parseJpdbParagraph(text, fixtureVocabulary, vocabulary, vocabIndexBySpelling, options));
    return { vocabulary, tokens };
}

function normalizeJpdbVocabularyRow(row, rowIndex) {
    const [surface, spelling, reading, gloss, partOfSpeech, frequency, state, pitch] = row;
    return { surface, spelling, reading, gloss, partOfSpeech, frequency, state, pitch, rowIndex };
}

function parseJpdbParagraph(text, fixtureVocabulary, vocabulary, vocabIndexBySpelling, options) {
    const paragraphTokens = [];
    for (let index = 0; index < text.length;) {
        const entry = fixtureVocabulary.find(item => text.startsWith(item.surface, index));
        if (!entry) {
            index += 1;
            continue;
        }
        paragraphTokens.push(jpdbToken(entry, index, vocabulary, vocabIndexBySpelling, options));
        index += entry.surface.length;
    }
    return paragraphTokens;
}

function jpdbToken(entry, index, vocabulary, vocabIndexBySpelling, options) {
    return [
        jpdbVocabularyIndex(entry, vocabulary, vocabIndexBySpelling, options),
        index,
        entry.surface.length,
        jpdbTokenReading(entry, options),
    ];
}

function jpdbVocabularyIndex(entry, vocabulary, vocabIndexBySpelling, options) {
    const existingIndex = vocabIndexBySpelling.get(entry.spelling);
    if (existingIndex !== undefined) return existingIndex;
    const vocabularyIndex = vocabulary.length;
    vocabIndexBySpelling.set(entry.spelling, vocabularyIndex);
    vocabulary.push(jpdbVocabularyRecord(entry, options));
    return vocabularyIndex;
}

// Card identity comes from the FIXTURE ROW, never from this response's ordering.
// JPDB vids/sids are properties of a vocabulary entry, so the reader is entitled
// to treat (vid, sid) as the same card across requests. Numbering by
// first-seen-in-this-response made every request re-issue the same low ids to
// whichever word it happened to see first: a later single-word parse (state
// repaint after a grade) handed word A's identity to word B, and the reader
// faithfully re-stamped B's span with A's expression.
function jpdbVocabularyRecord(entry, options) {
    return [
        jpdbVocabularyId(options, entry.rowIndex),
        jpdbSpellingId(options, entry.rowIndex),
        0,
        entry.spelling,
        entry.reading,
        entry.frequency,
        entry.partOfSpeech,
        [[entry.gloss]],
        [entry.partOfSpeech],
        jpdbVocabularyState(entry, options),
        jpdbVocabularyPitch(entry, options),
    ];
}

function jpdbVocabularyId(options, rowIndex) {
    return withDefault(options.vocabularyIdBase, 1000) + rowIndex;
}

function jpdbSpellingId(options, rowIndex) {
    return withDefault(options.spellingIdBase, 2000) + rowIndex;
}

function jpdbVocabularyState(entry, options) {
    return withDefault(entry.state, withDefault(options.defaultState, ['not-in-deck']));
}

function jpdbVocabularyPitch(entry, options) {
    return withDefault(entry.pitch, withDefault(options.defaultPitch, ['LHH']));
}

function withDefault(value, fallback) {
    return value == null ? fallback : value;
}

function jpdbTokenReading(entry, options) {
    return options.tokenReading ? options.tokenReading(entry) : [[entry.surface, entry.reading]];
}

export function mockAnkiConnectResponse(body, resolveAction, context = {}) {
    const action = body.action;
    const params = body.params ?? {};
    if (action === 'multi') {
        const actions = Array.isArray(params.actions) ? params.actions : [];
        return {
            result: actions.map(item => mockAnkiConnectResponse({
                action: item.action,
                params: item.params ?? {},
            }, resolveAction, context)),
            error: null,
        };
    }
    return { result: resolveAction(action, params, context), error: null };
}

export function resolveAnkiAction(action, params, handlers, context = {}) {
    const handler = handlers[action];
    return typeof handler === 'function' ? handler(params, context) : handler ?? null;
}

export function arrayParam(value) {
    return Array.isArray(value) ? value : [];
}

export function ankiActions(requests) {
    return requests.filter(item => item.kind === 'anki').map(item => item.action);
}

export function assertAnkiStatusStorage(storage, expectedCardCount) {
    assert(storage.cardCount === expectedCardCount, 'Anki status index card count did not match mocked collection total', storage);
    assert(storage.entryCount >= expectedCardCount, 'Anki status index did not store lookup entries for mocked cards', storage);
    if (storage.entryStore === 'indexeddb') {
        assert(storage.indexedDbEntryCount >= expectedCardCount, 'Anki status IndexedDB entry count did not match stored metadata', storage);
    }
}

export async function readAnkiStatusStorage(page, storage = DEFAULT_ANKI_STATUS_STORAGE) {
    const { raw, meta } = await readStoredJson(page, storage.storageKey);
    const indexedDbEntryCount = await indexedDbEntryCountForStatusStorage(page, storage, meta);
    return ankiStatusStorageSnapshot(raw, meta, indexedDbEntryCount);
}

async function indexedDbEntryCountForStatusStorage(page, storage, meta) {
    if (metaEntryStore(meta) !== 'indexeddb') return null;
    return countIndexedDbEntries(page, storage.dbName, storage.entryStore);
}

function ankiStatusStorageSnapshot(raw, meta, indexedDbEntryCount) {
    const valueEntryCount = recordKeyCount(metaEntries(meta));
    return {
        cardCount: Number(metaValue(meta, 'cardCount', 0)),
        entryCount: Number(metaValue(meta, 'entryCount', valueEntryCount)),
        entryStore: metaEntryStore(meta),
        indexedDbEntryCount,
        localStorageBytes: textLength(raw),
    };
}

function metaValue(meta, key, fallback) {
    return meta && meta[key] != null ? meta[key] : fallback;
}

function metaEntryStore(meta) {
    return String(metaValue(meta, 'entryStore', 'value'));
}

function metaEntries(meta) {
    return metaValue(meta, 'entries', null);
}

function recordKeyCount(value) {
    if (!value || typeof value !== 'object') return 0;
    return Object.keys(value).length;
}

function textLength(value) {
    return typeof value === 'string' ? value.length : 0;
}

async function readStoredJson(page, storageKey) {
    return page.evaluate(key => {
        const raw = localStorage.getItem(key);
        try {
            return { raw, meta: raw ? JSON.parse(raw) : null };
        } catch {
            return { raw, meta: null };
        }
    }, storageKey);
}

async function countIndexedDbEntries(page, dbName, entryStore) {
    return page.evaluate(({ name, storeName }) => {
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
            request.onsuccess = () => readIndexedDbEntryCount(request.result, storeName, done);

            function readIndexedDbEntryCount(db, objectStoreName, callback) {
                if (!db.objectStoreNames.contains(objectStoreName)) {
                    db.close();
                    callback(null);
                    return;
                }
                const tx = db.transaction(objectStoreName, 'readonly');
                const count = tx.objectStore(objectStoreName).count();
                count.onsuccess = () => callback(Number(count.result));
                count.onerror = () => callback(null);
                tx.oncomplete = () => db.close();
                tx.onabort = () => {
                    db.close();
                    callback(null);
                };
            }
        });
    }, { name: dbName, storeName: entryStore });
}

export async function addGmStorageBridgeInitScript(page, options) {
    await page.addInitScript(initGmBridge, { ...options, storageEnabled: true });
}

export async function installGmStorageBridgeOnCurrentPage(page, options) {
    await page.evaluate(initGmBridge, { ...options, storageEnabled: true });
}

export async function installUserscriptFixtureBridge(page, {
    requestBridgeName,
    requestHandler,
    settings,
    css,
}) {
    await page.exposeFunction(requestBridgeName, requestHandler);
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css,
        requestBridgeName,
    });
}

export async function addGmXmlHttpRequestBridgeInitScript(page, options) {
    await page.addInitScript(initGmBridge, { ...options, storageEnabled: false });
}

function initGmBridge({
    key,
    value,
    css = '',
    requestBridgeName,
    resourceName = 'yomuCss',
    storagePrefix = '',
    initialize = 'always',
    storageEnabled = true,
}) {
    const memoryStore = new Map();
    const responseBuilders = {
        json: jsonResultResponse,
        blob: blobResultResponse,
        arraybuffer: arrayBufferResultResponse,
    };
    const bodySerializers = [
        { matches: data => data instanceof ArrayBuffer, serialize: arrayBufferRequestBody },
        { matches: data => ArrayBuffer.isView(data), serialize: typedArrayRequestBody },
        { matches: data => data instanceof Blob, serialize: blobRequestBody },
        { matches: data => data instanceof FormData, serialize: formDataRequestBody },
    ];
    const storageKey = storeKey => storagePrefix ? `${storagePrefix}${storeKey}` : storeKey;
    const storedValueName = storedKey => {
        if (!storagePrefix) return storedKey;
        return storedKey.startsWith(storagePrefix) ? storedKey.slice(storagePrefix.length) : null;
    };
    const readStoredValue = (storeKey, fallback) => {
        if (memoryStore.has(storeKey)) return memoryStore.get(storeKey);
        try {
            const raw = localStorage.getItem(storageKey(storeKey));
            return raw == null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    };
    const writeStoredValue = (storeKey, storedValue) => {
        memoryStore.set(storeKey, storedValue);
        try {
            localStorage.setItem(storageKey(storeKey), JSON.stringify(storedValue));
        } catch {
            // Some smoke fixtures have no persistent origin storage.
        }
    };
    if (storageEnabled) initializeStorage();
    window.GM_getValue = (storeKey, fallback) => readStoredValue(storeKey, fallback);
    window.GM_setValue = (storeKey, storedValue) => { writeStoredValue(storeKey, storedValue); };
    window.GM_deleteValue = storeKey => {
        memoryStore.delete(storeKey);
        try {
            localStorage.removeItem(storageKey(storeKey));
        } catch {
            // Some smoke fixtures have no persistent origin storage.
        }
    };
    window.GM_listValues = () => [...gmValueNames()];

    function gmValueNames() {
        const keys = new Set(memoryStore.keys());
        addLocalStorageValueNames(keys);
        return keys;
    }

    function addLocalStorageValueNames(keys) {
        try {
            for (let index = 0; index < localStorage.length; index += 1) {
                addStoredValueName(keys, localStorage.key(index));
            }
        } catch {
            // Some smoke fixtures have no persistent origin storage.
        }
    }

    function addStoredValueName(keys, rawKey) {
        const valueName = storedValueName(rawKey ?? '');
        if (valueName) keys.add(valueName);
    }
    window.GM_addStyle = styleText => {
        const style = document.createElement('style');
        style.textContent = styleText;
        (document.head || document.documentElement || document.body).append(style);
        return style;
    };
    window.GM_getResourceText = name => name === resourceName ? css : '';
    window.GM_registerMenuCommand = () => undefined;
    installXmlHttpRequestBridge();
    window.GM = storageEnabled ? storageGmApi() : requestOnlyGmApi();

    function initializeStorage() {
        if (initialize === 'ifMissing') {
            if (readStoredValue(key, undefined) === undefined) writeStoredValue(key, value);
            return;
        }
        writeStoredValue(key, value);
    }

    function storageGmApi() {
        return {
            getValue: window.GM_getValue,
            setValue: window.GM_setValue,
            deleteValue: window.GM_deleteValue,
            listValues: window.GM_listValues,
            addStyle: window.GM_addStyle,
            registerMenuCommand: window.GM_registerMenuCommand,
            xmlHttpRequest: window.GM_xmlhttpRequest,
            xmlhttpRequest: window.GM_xmlhttpRequest,
        };
    }

    function requestOnlyGmApi() {
        return {
            registerMenuCommand: window.GM_registerMenuCommand,
            xmlHttpRequest: window.GM_xmlhttpRequest,
            xmlhttpRequest: window.GM_xmlhttpRequest,
        };
    }

    function installXmlHttpRequestBridge() {
        window.GM_xmlhttpRequest = options => {
            const request = createBridgeRequest(options);
            const settle = oneShotRequestSettler(options);
            Promise.resolve(request.data)
                .then(data => window[requestBridgeName]({ ...request, data }))
                .then(result => settle(options.onload)(bridgeLoadResponse(result, options.responseType)))
                .catch(error => settle(options.onerror)(error));
        };
    }

    function createBridgeRequest(options) {
        return {
            method: options.method || 'GET',
            url: options.url,
            headers: options.headers || {},
            data: serializeGmRequestBody(options.data),
            responseType: options.responseType || '',
        };
    }

    function oneShotRequestSettler(options) {
        let settled = false;
        const timeoutMs = Number(options.timeout) || 0;
        const timer = timeoutMs > 0 ? window.setTimeout(() => {
            if (settled) return;
            settled = true;
            options.ontimeout?.({ status: 0, response: null, responseText: '' });
        }, timeoutMs) : 0;
        return callback => response => {
            if (settled) return;
            settled = true;
            if (timer) window.clearTimeout(timer);
            callback?.(response);
        };
    }

    function bridgeLoadResponse(result, responseType) {
        const bytes = resultBytes(result);
        const responseText = resultResponseText(result, bytes);
        return {
            status: result.status,
            response: resultResponse(result, responseType, responseText, bytes),
            responseText,
        };
    }

    async function serializeGmRequestBody(data) {
        const serializer = bodySerializers.find(item => item.matches(data));
        return serializer ? await serializer.serialize(data) : data ?? '';
    }

    function arrayBufferRequestBody(data) {
        return { kind: 'arraybuffer', bytes: [...new Uint8Array(data)] };
    }

    function typedArrayRequestBody(data) {
        return { kind: 'arraybuffer', bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] };
    }

    async function blobRequestBody(data) {
        return { kind: 'arraybuffer', bytes: [...new Uint8Array(await data.arrayBuffer())] };
    }

    async function formDataRequestBody(data) {
        const entries = [];
        for (const [name, fieldValue] of data.entries()) entries.push(await formDataRequestEntry(name, fieldValue));
        return { kind: 'formdata', entries };
    }

    async function formDataRequestEntry(name, fieldValue) {
        if (!(fieldValue instanceof Blob)) return { name, value: String(fieldValue) };
        return { name, blob: await serializedFormDataBlob(fieldValue) };
    }

    async function serializedFormDataBlob(fieldValue) {
        return {
            bytes: [...new Uint8Array(await fieldValue.arrayBuffer())],
            type: fieldValue.type,
            filename: fieldValue.name || 'file',
        };
    }

    function resultBytes(result) {
        return Array.isArray(result.bytes) ? new Uint8Array(result.bytes) : null;
    }

    function resultResponseText(result, bytes) {
        return result.responseText ?? (bytes ? new TextDecoder().decode(bytes) : '');
    }

    function resultResponse(result, responseType, responseText, bytes) {
        const buildResponse = responseBuilders[responseType] || textResultResponse;
        return buildResponse(result, responseText, bytes);
    }

    function jsonResultResponse(result, responseText) {
        return result.response !== undefined ? result.response : JSON.parse(responseText || 'null');
    }

    function blobResultResponse(result, responseText, bytes) {
        return new Blob([bytes ?? responseText], { type: result.contentType || 'application/octet-stream' });
    }

    function arrayBufferResultResponse(_result, responseText, bytes) {
        return (bytes ?? new TextEncoder().encode(responseText)).buffer;
    }

    function textResultResponse(_result, responseText) {
        return responseText;
    }
}

// Real reader sites degrade or refuse to run under an automated browser. BookWalker's
// NFBR viewer is the worst case: with navigator.webdriver set it never composites a
// page and stops answering on the main thread, so a harness that does not mask it
// measures a dead viewer and passes. Mask it for every browser we launch — a smoke
// run is only worth anything if the site behaves as it does for the reader.
const AUTOMATION_MASK_PREFS = Object.freeze({
    'dom.webdriver.enabled': false,
    useAutomationExtension: false,
});

export async function launchSmokeBrowser(browserType = chromium, browserName = 'chromium', options = {}) {
    const configuredChannel = smokeBrowserChannel(browserName);
    if (configuredChannel) {
        try {
            return await chromium.launch({ ...withAutomationMask(options, 'chromium'), channel: configuredChannel });
        } catch (error) {
            if (!isMissingBrowserExecutable(error)) throw error;
        }
    }
    return await launchSmokeBrowserWithFallback(browserType, browserName, withAutomationMask(options, browserName));
}

// Firefox takes the pref; Chromium takes the flag. Passing either to the other
// browser is at best ignored and at worst a launch failure, so keep them apart.
function withAutomationMask(options, browserName) {
    if (browserName === 'firefox') {
        return { ...options, firefoxUserPrefs: { ...AUTOMATION_MASK_PREFS, ...(options.firefoxUserPrefs ?? {}) } };
    }
    if (browserName === 'chromium') {
        return { ...options, args: [...(options.args ?? []), '--disable-blink-features=AutomationControlled'] };
    }
    return options;
}

// The page-side half of the mask: firefoxUserPrefs alone does not clear
// navigator.webdriver on every channel, and Chromium needs it outright.
async function maskAutomationSignals(contextOrPage) {
    await contextOrPage.addInitScript(() => {
        try {
            Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true });
        } catch { /* already masked or locked down */ }
    });
}

function smokeBrowserChannel(browserName) {
    if (browserName !== 'chromium') return '';
    return process.env.YOMU_PLAYWRIGHT_CHANNEL || '';
}

async function launchSmokeBrowserWithFallback(browserType, browserName, options) {
    try {
        return await browserType.launch(options);
    } catch (error) {
        if (browserName !== 'chromium' || !isMissingBrowserExecutable(error)) throw error;
        return chromium.launch({ ...options, channel: 'chrome' });
    }
}

export async function launchOptionalBrowser(browserType, browserName, options) {
    try {
        return { browser: await launchSmokeBrowser(browserType, browserName, options) };
    } catch (error) {
        if (!isMissingBrowserExecutable(error)) throw error;
        return { skipped: true, browserName, reason: firstErrorLine(error) };
    }
}

export function isMissingBrowserExecutable(error) {
    const message = String(error?.message ?? '');
    return message.includes("Executable doesn't exist");
}

export function requestedBrowserCoverageFailures(requestedEngines, summaries) {
    const summaryByEngine = new Map(summaries.map(summary => [summary.engine, summary]));
    return [...requestedEngines].flatMap(engine => {
        const summary = summaryByEngine.get(engine);
        if (!summary) return [`${engine}: requested engine produced no summary`];
        if (!summary.skipped) return [];
        return [`${engine}: requested engine was skipped (${summary.reason ?? 'no reason reported'})`];
    });
}

export function firstErrorLine(error) {
    return String(error?.message ?? error).split('\n').find(Boolean) ?? 'Browser executable is unavailable.';
}
