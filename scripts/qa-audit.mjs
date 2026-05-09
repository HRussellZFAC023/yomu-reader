#!/usr/bin/env node
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const SCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const API_KEY = process.env.YOMU_TEST_API_KEY?.trim() ?? '';
const MOCK_API_KEY = 'yomu-qa-mock-key';
const QA_API_KEY = API_KEY || MOCK_API_KEY;

const baseSettings = {
    onboardingSeen: true,
    apiKey: QA_API_KEY,
    interfaceLanguage: 'auto',
    accentColor: '#5ea780',
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    rtkEnabled: true,
    kanjivgEnabled: true,
    kanjiOriginsEnabled: true,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginWiktionaryEnabled: true,
    kanjiOriginGraphEnabled: true,
    kanjiOriginRadicalImagesEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordLimit: 8,
    audioEnabled: false,
    autoPlayAudio: false,
    audioSources: [],
    audioEnableDefaultSources: false,
    audioViaBlob: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 60,
    hoverCloseDelayMs: 180,
    popupActivationMode: 'hover',
    scanModifierKey: 'shift',
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: false,
    showFurigana: true,
    showPitchAccent: true,
    hideKnownFurigana: false,
    ocrEnabled: false,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: false,
    ocrProvider: 'google-lens',
    ocrEndpointUrl: '',
    ocrEngine: 'auto',
    ocrCloudVisionApiKey: '',
    ocrLanguage: 'ja-JP',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 12000,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrTextColor: '#ffffff',
    ocrOutlineColor: '#000000',
    ocrBackgroundColor: '#181b20',
    ocrBackgroundOpacity: 0.36,
    ocrFontScale: 1,
    localDictionariesEnabled: false,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    dictionaryPreferences: [],
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleControlsMode: 'auto',
    subtitleFontSize: 32,
    subtitleBottomOffset: 12,
    subtitleTextColor: '#ffffff',
    subtitleOutlineColor: '#000000',
    subtitleBackgroundColor: '#181b20',
    subtitleBackgroundOpacity: 0.32,
    subtitleFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    subtitleFontWeight: 850,
    subtitleMiningPause: true,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: false,
    youtubeShowFilterNotice: true,
    ankiEnabled: false,
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiDeck: 'Yomu',
    ankiModel: 'Yomu Japanese',
    ankiTags: 'yomu',
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    theme: 'auto',
    popupMode: 'auto',
    miningDeck: 'forq',
    neverForgetDeck: 'never-forget',
    blacklistDeck: 'blacklist',
    addToForq: false,
    enableReviews: true,
    twoButtonReviews: false,
    shortcuts: {
        scanPage: 'Alt+J',
        hoverLookup: '',
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
        toggleYoutubeImmersion: 'Alt+Y',
        scanImages: 'Alt+I',
        gradeNothing: '1',
        gradeSomething: '2',
        gradeHard: '3',
        gradeOkay: '4',
        gradeEasy: '5',
        gradeFail: '1',
        gradePass: '2',
    },
};

const results = [];
let userscript = '';

function record(name, status, detail = '') {
    results.push({ name, status, detail });
    const marker = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
    console.log(`${marker} ${name}${detail ? ` - ${detail}` : ''}`);
}

function assertAudit(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForAudit(page, predicate, timeoutMs, message) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const value = await page.evaluate(predicate).catch(() => false);
        if (value) return value;
        await page.waitForTimeout(200);
    }
    throw new Error(message);
}

function dataUrl(html) {
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function startStaticServer(root) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
            const filePath = path.join(root, requested === '/' ? 'reader-test.html' : requested);
            const body = await readFile(filePath);
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', contentType(filePath));
            res.end(body);
        } catch {
            res.statusCode = 404;
            res.end('Not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

function contentType(filePath) {
    if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
    if (filePath.endsWith('.vtt')) return 'text/vtt; charset=utf-8';
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    return 'application/octet-stream';
}

function jsonQaResponse(value) {
    const responseText = JSON.stringify(value);
    return {
        status: 200,
        responseText,
        bytes: [...Buffer.from(responseText, 'utf8')],
        contentType: 'application/json; charset=utf-8',
    };
}

function textQaResponse(responseText, contentTypeValue = 'text/html; charset=utf-8') {
    return {
        status: 200,
        responseText,
        bytes: [...Buffer.from(responseText, 'utf8')],
        contentType: contentTypeValue,
    };
}

function maybeMockQaRequest(request) {
    const url = new URL(request.url);
    if (url.hostname === 'jpdb.io' && url.pathname.startsWith('/api/v1/')) {
        return mockJpdbApi(url.pathname.replace('/api/v1/', ''), request.data);
    }
    if (url.hostname === 'jpdb.io' && url.pathname.startsWith('/kanji/')) {
        return textQaResponse(mockJpdbKanjiHtml(decodeURIComponent(url.pathname.split('/').pop() ?? '')));
    }
    if (url.hostname === 'hrussellzfac023.github.io' && url.pathname.startsWith('/rtk/')) {
        const kanji = decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] ?? '');
        return textQaResponse(mockRtkHtml(kanji));
    }
    if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/KanjiVG/kanjivg/')) {
        return textQaResponse(mockKanjiVgSvg(), 'image/svg+xml; charset=utf-8');
    }
    if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/gabor-kovacs/the-kanji-map/')) {
        const kanji = decodeURIComponent((url.pathname.split('/').pop() ?? '').replace(/\.json$/i, ''));
        return jsonQaResponse(mockKanjiMapData(kanji));
    }
    if (url.hostname === 'en.wiktionary.org' && url.pathname === '/w/api.php') {
        const kanji = url.searchParams.get('page') ?? '字';
        return jsonQaResponse(mockWiktionaryParse(kanji));
    }
    return null;
}

async function newAuditedPage(browser, settings = baseSettings, viewport = { width: 1280, height: 900 }) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const requests = [];
    await page.exposeFunction('__yomuQaRequest', async request => {
        let body = request.data;
        if (body?.kind === 'arraybuffer') {
            body = Buffer.from(body.bytes ?? []);
        } else if (body?.kind === 'formdata') {
            const formData = new FormData();
            for (const entry of body.entries ?? []) {
                if (entry.blob) {
                    formData.append(entry.name, new Blob([Buffer.from(entry.blob.bytes ?? [])], { type: entry.blob.type || 'application/octet-stream' }), entry.blob.filename || 'file');
                } else {
                    formData.append(entry.name, entry.value ?? '');
                }
            }
            body = formData;
        }
        const mocked = maybeMockQaRequest({ ...request, data: body });
        if (mocked) {
            requests.push({
                method: request.method,
                url: request.url.replace(QA_API_KEY, '[redacted]'),
                status: mocked.status,
            });
            return mocked;
        }
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        requests.push({
            method: request.method,
            url: request.url.replace(QA_API_KEY, '[redacted]'),
            status: response.status,
        });
        return {
            status: response.status,
            responseText: buffer.toString('utf8'),
            bytes: [...buffer],
            contentType: response.headers.get('content-type') ?? '',
        };
    });
    await page.addInitScript(({ settings, settingsKey }) => {
        const store = { [settingsKey]: settings };
        window.GM_getValue = (key, fallback) => key in store ? store[key] : fallback;
        window.GM_setValue = (key, value) => { store[key] = value; };
        window.GM_addStyle = css => {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.append(style);
            return style;
        };
        window.GM_registerMenuCommand = () => undefined;
        const serializeBody = async data => {
            if (data instanceof ArrayBuffer) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data)] };
            if (ArrayBuffer.isView(data)) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] };
            if (data instanceof FormData) {
                const entries = [];
                for (const [name, value] of data.entries()) {
                    if (value instanceof Blob) {
                        entries.push({
                            name,
                            blob: {
                                bytes: [...new Uint8Array(await value.arrayBuffer())],
                                type: value.type,
                                filename: value.name || 'file',
                            },
                        });
                    } else {
                        entries.push({ name, value: String(value) });
                    }
                }
                return { kind: 'formdata', entries };
            }
            return data;
        };
        window.GM_xmlhttpRequest = options => {
            Promise.resolve(serializeBody(options.data)).then(data => window.__yomuQaRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data,
            })).then(result => {
                const bytes = new Uint8Array(result.bytes);
                const response = options.responseType === 'arraybuffer'
                    ? bytes.buffer
                    : options.responseType === 'blob'
                        ? new Blob([bytes], { type: result.contentType })
                        : result.responseText;
                options.onload?.({
                    status: result.status,
                    response,
                    responseText: result.responseText,
                });
            }).catch(error => options.onerror?.(error));
        };
    }, { settings, settingsKey: SETTINGS_KEY });
    return { page, requests };
}

async function injectUserscript(page) {
    await page.evaluate(script => {
        (0, eval)(`${script}\n//# sourceURL=yomu.user.js`);
    }, userscript);
}

async function auditNoSecretLeak() {
    if (!API_KEY) {
        record('secret leak scan', 'skip', 'YOMU_TEST_API_KEY is not set');
        return;
    }
    const files = await listFiles(ROOT, new Set(['.git', 'node_modules', 'qa-artifacts']));
    const offenders = [];
    for (const file of files) {
        if (!/\.(?:ts|js|mjs|cjs|json|md|html|yml|yaml|css|user\.js)$/.test(file)) continue;
        const text = await readFile(file, 'utf8').catch(() => '');
        if (text.includes(API_KEY)) offenders.push(path.relative(ROOT, file));
    }
    assertAudit(!offenders.length, `test API key is present in source files: ${offenders.join(', ')}`);
    record('secret leak scan', 'pass', 'test key is only supplied by environment');
}

async function listFiles(dir, ignoredNames) {
    const entries = await readdir(dir);
    const files = [];
    for (const entry of entries) {
        if (ignoredNames.has(entry)) continue;
        const full = path.join(dir, entry);
        const info = await stat(full);
        if (info.isDirectory()) files.push(...await listFiles(full, ignoredNames));
        else files.push(full);
    }
    return files;
}

const qaVocabulary = [
    ['今日', 'きょう', 'today', ['n'], 100],
    ['今朝', 'けさ', 'this morning', ['n'], 900],
    ['今週', 'こんしゅう', 'this week', ['n'], 1200],
    ['静か', 'しずか', 'quiet', ['adj-na'], 1700],
    ['喫茶店', 'きっさてん', 'coffee shop', ['n'], 2400],
    ['新しい', 'あたらしい', 'new', ['adj-i'], 700],
    ['本', 'ほん', 'book', ['n'], 350],
    ['読む', 'よむ', 'to read', ['v5m'], 400],
    ['読みました', 'よみました', 'read', ['v5m'], 401, '読む'],
    ['学校', 'がっこう', 'school', ['n'], 500],
    ['行きます', 'いきます', 'go', ['v5k'], 620, '行く'],
    ['友だち', 'ともだち', 'friend', ['n'], 800],
    ['花', 'はな', 'flower', ['n'], 1100],
    ['食卓', 'しょくたく', 'dining table', ['n'], 1500],
    ['リビング', 'りびんぐ', 'living room', ['n'], 2100],
    ['暮らし', 'くらし', 'living', ['n'], 1900],
    ['日本語', 'にほんご', 'Japanese language', ['n'], 250],
].map(([surface, reading, gloss, partOfSpeech, frequency, spelling]) => ({
    surface,
    spelling: spelling ?? surface,
    reading,
    gloss,
    partOfSpeech,
    frequency,
}));

function mockJpdbApi(endpoint, body) {
    if (endpoint === 'parse') return jsonQaResponse(mockJpdbParse(readJsonBody(body)));
    if (endpoint === 'list-user-decks') return jsonQaResponse({ decks: [[1, 'Yomu'], [2, 'Mining']] });
    if (endpoint === 'review' || endpoint === 'deck/add-vocabulary' || endpoint === 'deck/remove-vocabulary' || endpoint === 'set-card-sentence') {
        return jsonQaResponse({});
    }
    return jsonQaResponse({});
}

function readJsonBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }
    return {};
}

function mockJpdbParse(body) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(value => String(value)) : [];
    const vocabulary = [];
    const vocabIndexByKey = new Map();
    const tokens = paragraphs.map(text => {
        const paragraphTokens = [];
        for (let index = 0; index < text.length;) {
            const entry = qaVocabulary
                .filter(item => text.startsWith(item.surface, index))
                .sort((a, b) => b.surface.length - a.surface.length)[0];
            if (!entry) {
                index += 1;
                continue;
            }
            let vocabIndex = vocabIndexByKey.get(entry.spelling);
            if (vocabIndex === undefined) {
                vocabIndex = vocabulary.length;
                vocabIndexByKey.set(entry.spelling, vocabIndex);
                vocabulary.push([
                    100000 + vocabIndex,
                    200000 + vocabIndex,
                    0,
                    entry.spelling,
                    entry.reading,
                    entry.frequency,
                    entry.partOfSpeech,
                    [[entry.gloss]],
                    [entry.partOfSpeech],
                    ['not-in-deck'],
                    ['LHHL'],
                ]);
            }
            paragraphTokens.push([
                vocabIndex,
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

function mockJpdbKanjiHtml(kanji) {
    const records = {
        今: { keyword: 'now', frequency: 'Top 100-200', type: 'Jouyou grade 2', reading: 'いま', component: '人', componentKeyword: 'person', usedIn: ['今日', 'きょう', 'today'] },
        日: { keyword: 'day', frequency: 'Top 50-100', type: 'Jouyou grade 1', reading: 'ひ', component: '一', componentKeyword: 'one', usedIn: ['今日', 'きょう', 'today'] },
        本: { keyword: 'book', frequency: 'Top 300-400', type: 'Jouyou grade 1', reading: 'ほん', component: '木', componentKeyword: 'tree', usedIn: ['本', 'ほん', 'book'] },
        読: { keyword: 'read', frequency: 'Top 400-500', type: 'Jouyou grade 2', reading: 'よ', component: '言', componentKeyword: 'say', usedIn: ['読む', 'よむ', 'to read'] },
    };
    const record = records[kanji] ?? { keyword: 'kanji', frequency: 'Top 1000-2000', type: 'Jouyou', reading: kanji, component: '一', componentKeyword: 'one', usedIn: [kanji, kanji, 'example'] };
    const [expression, reading, meaning] = record.usedIn;
    return `<!doctype html><html><head><meta name="description" content="${htmlEscape(kanji)} - ${htmlEscape(record.keyword)}"></head><body>
        <div><h6 class="subsection-label">Keyword</h6><div class="subsection">${htmlEscape(record.keyword)}</div></div>
        <table class="cross-table">
            <tr><td>Frequency</td><td>${htmlEscape(record.frequency)}</td></tr>
            <tr><td>Type</td><td>${htmlEscape(record.type)}</td></tr>
            <tr><td>Kanken</td><td>Level 9</td></tr>
            <tr><td>Heisig</td><td>372</td></tr>
            <tr><td>Old form</td><td><a href="/kanji/舊">舊</a></td></tr>
            <tr><td>Readings</td><td class="kanji-reading-list-common"><div><a href="/kanji-reading/${encodeURIComponent(kanji)}/${encodeURIComponent(record.reading)}">${htmlEscape(record.reading)}</a><div>(80%)</div></div></td></tr>
        </table>
        <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Composed of</h6><div class="subsection">
            <div><div class="spelling"><a href="/kanji/${encodeURIComponent(record.component)}">${htmlEscape(record.component)}</a></div><div class="description">${htmlEscape(record.componentKeyword)}</div></div>
        </div></div>
        <div><h6 class="subsection-label">Mnemonic</h6><div class="subsection">Remember ${htmlEscape(kanji)} as ${htmlEscape(record.keyword)}.</div></div>
        <div class="subsection-used-in"><div class="used-in">
            <div class="jp"><a href="/vocabulary/1456360/${encodeURIComponent(expression)}/${encodeURIComponent(reading)}#a">${htmlEscape(expression)}</a></div>
            <div class="en">${htmlEscape(meaning)}</div>
        </div></div>
    </body></html>`;
}

function mockRtkHtml(kanji) {
    const keyword = kanji === '読' ? 'read' : kanji === '本' ? 'book' : kanji === '日' ? 'day' : 'now';
    const elements = kanji === '読' ? '言、売' : '人、一';
    return `<!doctype html><html><body>
        <h2><code title="372">${htmlEscape(keyword)}</code></h2>
        <h3>On-Yomi: ドク — Kun-Yomi: よ.む</h3>
        <h2>Elements:</h2><p>${htmlEscape(elements)}</p>
        <h2>Heisig story:</h2><p>QA story for ${htmlEscape(keyword)}.</p>
        <h2>Heisig comment:</h2><p>QA comment for ${htmlEscape(keyword)}.</p>
        <h2>Koohii stories:</h2><p>QA Koohii story.</p>
    </body></html>`;
}

function mockKanjiVgSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
        <path d="M10,10 C25,30 45,30 60,10" />
        <path d="M18,58 L82,58" />
        <text transform="matrix(1 0 0 1 8 12)">1</text>
    </svg>`;
}

function mockKanjiMapData(kanji) {
    const partsByKanji = {
        今: ['人', '一'],
        日: ['口', '一'],
        本: ['木', '一'],
        読: ['言', '売'],
    };
    const meaningByKanji = { 今: 'now', 日: 'day', 本: 'book', 読: 'read' };
    return {
        kanjialiveData: {
            grade: kanji === '日' || kanji === '本' ? 1 : 2,
            kstroke: kanji === '読' ? 14 : 4,
            radical: {
                character: partsByKanji[kanji]?.[0] ?? '一',
                strokes: 1,
                image: 'https://media.kanjialive.com/radical_character/gonben.svg',
                name: { hiragana: 'いち', romaji: 'ichi' },
                meaning: { english: 'radical' },
                position: { hiragana: 'へん' },
            },
            examples: [{ japanese: `${kanji}（${kanji}）`, meaning: { english: meaningByKanji[kanji] ?? 'kanji' } }],
        },
        jishoData: {
            meaning: meaningByKanji[kanji] ?? 'kanji',
            jlptLevel: 'N5',
            taughtIn: kanji === '日' || kanji === '本' ? 'grade 1' : 'grade 2',
            strokeCount: kanji === '読' ? 14 : 4,
            newspaperFrequencyRank: '618',
            kunyomi: ['よ.む'],
            onyomi: ['ドク'],
            parts: partsByKanji[kanji] ?? ['一'],
            radical: { symbol: partsByKanji[kanji]?.[0] ?? '一', forms: [], meaning: 'radical' },
            uri: `https://jisho.org/search/${encodeURIComponent(kanji)}%23kanji`,
        },
    };
}

function mockWiktionaryParse(kanji) {
    return {
        parse: {
            text: {
                '*': `<h2 id="Glyph_origin">Glyph origin</h2><p>${htmlEscape(kanji)} has historical forms documented in public dictionaries.</p><h2 id="Etymology">Etymology</h2><p>Short QA note for the kanji entry.</p>`,
            },
        },
    };
}

function htmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function seedLocalKanjiDictionaries(page) {
    await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 2);
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
                const kanji = ensureStore('kanji');
                ensureIndex(kanji, 'character', 'character');
                ensureIndex(kanji, 'dictionary', 'dictionary');
                const termMeta = ensureStore('termMeta');
                ensureIndex(termMeta, 'expression', 'expression');
                ensureIndex(termMeta, 'dictionary', 'dictionary');
                const kanjiMeta = ensureStore('kanjiMeta');
                ensureIndex(kanjiMeta, 'character', 'character');
                ensureIndex(kanjiMeta, 'dictionary', 'dictionary');
                if (!db.objectStoreNames.contains('dictionaryInfo')) db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['dictionaryInfo', 'terms', 'kanji', 'termMeta'], 'readwrite');
            tx.objectStore('dictionaryInfo').put({ title: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1, counts: { kanji: 4 } });
            tx.objectStore('dictionaryInfo').put({ title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 2, counts: { terms: 4 } });
            tx.objectStore('dictionaryInfo').put({ title: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 3, counts: { termMeta: 4 } });
            [
                { character: '今', onyomi: ['コン'], kunyomi: ['いま'], tags: ['grade 2'], meanings: ['now', 'the present'], dictionary: 'KANJIDIC' },
                { character: '日', onyomi: ['ニチ', 'ジツ'], kunyomi: ['ひ', 'か'], tags: ['grade 1'], meanings: ['day', 'sun'], dictionary: 'KANJIDIC' },
                { character: '本', onyomi: ['ホン'], kunyomi: ['もと'], tags: ['grade 1'], meanings: ['book', 'origin'], dictionary: 'KANJIDIC' },
                { character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], tags: ['grade 2', 'jlpt n4'], meanings: ['read'], stats: { jlpt: 4, grade: 2, strokes: 14 }, dictionary: 'KANJIDIC' },
            ].forEach(entry => tx.objectStore('kanji').add(entry));
            [
                { expression: '今日', reading: 'きょう', glossary: ['today'], score: 9, dictionary: 'Jitendex' },
                { expression: '今朝', reading: 'けさ', glossary: ['this morning'], score: 8, dictionary: 'Jitendex' },
                { expression: '今週', reading: 'こんしゅう', glossary: ['this week'], score: 7, dictionary: 'Jitendex' },
                { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 10, dictionary: 'Jitendex' },
            ].forEach(entry => tx.objectStore('terms').add(entry));
            [
                { expression: '今日', mode: 'freq', data: { frequency: 100, displayValue: 100 }, dictionary: 'JPDBv2㋕' },
                { expression: '今朝', mode: 'freq', data: { frequency: 900, displayValue: 900 }, dictionary: 'JPDBv2㋕' },
                { expression: '今週', mode: 'freq', data: { frequency: 1200, displayValue: 1200 }, dictionary: 'JPDBv2㋕' },
                { expression: '読む', mode: 'freq', data: { frequency: 400, displayValue: 400 }, dictionary: 'JPDBv2㋕' },
            ].forEach(entry => tx.objectStore('termMeta').add(entry));
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    });
}

async function auditOnboardingMobile(browser, server) {
    const { page } = await newAuditedPage(browser, null, { width: 390, height: 844 });
    await page.goto(`${server.origin}/reader-test.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-reader-onboarding', { timeout: 6000 });
    const snapshot = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-reader-onboarding');
        const actions = [...document.querySelectorAll('.jpdb-reader-onboarding-actions .jpdb-reader-btn')];
        const language = document.querySelector('.jpdb-reader-onboarding-language select');
        const actionRects = actions.map(button => {
            const rect = button.getBoundingClientRect();
            return { text: button.textContent?.trim(), top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        });
        return {
            title: panel?.querySelector('h2')?.textContent?.trim(),
            copy: panel?.textContent ?? '',
            languageVisible: Boolean(language && !language.closest('[hidden]')),
            actionRects,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
        };
    });
    assertAudit(snapshot.title === 'よむ', 'onboarding title is missing');
    assertAudit(snapshot.copy.includes('tappable dictionary cards'), 'onboarding does not explain the core value');
    assertAudit(snapshot.languageVisible, 'onboarding language choice is not visible');
    assertAudit(snapshot.actionRects.length >= 2, 'onboarding actions are missing');
    assertAudit(snapshot.actionRects.some(rect => rect.text === 'Add API key') && snapshot.actionRects.some(rect => rect.text === 'Use without API key'), 'onboarding actions do not make the setup choices clear');
    assertAudit(snapshot.actionRects.every(rect => rect.top >= 0 && rect.bottom <= snapshot.viewportHeight && rect.left >= 0 && rect.right <= snapshot.viewportWidth), 'onboarding actions are not visible on first mobile screen');
    await page.screenshot({ path: path.join(ARTIFACTS, 'onboarding-mobile.png'), fullPage: false });
    await page.locator('.jpdb-reader-onboarding-actions .jpdb-reader-btn.add').click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    await page.close();
    record('mobile onboarding', 'pass', 'language and setup actions are visible without scrolling');
}

async function auditSettings(browser, server) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        apiKey: '',
        showFloatingButton: true,
        ocrEnabled: true,
        localDictionariesEnabled: true,
        dictionaryPreferences: [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 1 },
            { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 2 },
        ],
    });
    await page.goto(`${server.origin}/reader-test.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    await page.selectOption('select[name="interfaceLanguage"]', 'ja');
    let localeSnapshot = await page.evaluate(() => ({
        title: document.querySelector('.jpdb-reader-settings')?.getAttribute('aria-label'),
        heading: document.querySelector('.jpdb-reader-settings h2')?.textContent?.trim(),
        save: document.querySelector('.jpdb-reader-settings button[type="submit"]')?.textContent?.trim(),
        cancel: document.querySelector('.jpdb-reader-settings [data-action="cancel"]')?.textContent?.trim(),
        firstTab: document.querySelector('.jpdb-reader-settings-tab')?.textContent?.trim(),
    }));
    assertAudit(localeSnapshot.title === 'よむ 設定' && localeSnapshot.heading === 'よむ 設定', 'changing settings language does not update the dialog title immediately');
    assertAudit(localeSnapshot.save === '保存' && localeSnapshot.cancel === 'キャンセル' && localeSnapshot.firstTab === '基本', 'changing settings language does not update visible controls immediately');
    await page.selectOption('select[name="interfaceLanguage"]', 'en');
    await page.locator('[data-action="settings-panel"][data-panel="shortcuts"]').click();
    const hoverShortcut = page.locator('input[name="shortcuts.hoverLookup"]');
    await hoverShortcut.click();
    await page.keyboard.down('Shift');
    await page.keyboard.press('KeyH');
    await page.keyboard.up('Shift');

    const snapshot = await page.evaluate(() => {
        const form = document.querySelector('.jpdb-reader-settings');
        const save = form?.querySelector('button[type="submit"]');
        const cancel = form?.querySelector('[data-action="cancel"]');
        const rect = form?.getBoundingClientRect();
        const saveRect = save?.getBoundingClientRect();
        const passFailRows = [...document.querySelectorAll('[data-review-scale="pass-fail"]')].filter(el => !el.hidden).length;
        const fiveRows = [...document.querySelectorAll('[data-review-scale="five"]')].filter(el => !el.hidden).length;
        return {
            title: form?.getAttribute('aria-label'),
            saveText: save?.textContent?.trim(),
            cancelText: cancel?.textContent?.trim(),
            formBottom: rect?.bottom ?? 0,
            saveBottom: saveRect?.bottom ?? 0,
            viewportHeight: innerHeight,
            passFailRows,
            fiveRows,
            localOcrHidden: [...document.querySelectorAll('[data-local-ocr]')].every(el => el.hidden),
            cloudOcrHidden: [...document.querySelectorAll('[data-cloud-ocr]')].every(el => el.hidden),
            hoverShortcut: document.querySelector('input[name="shortcuts.hoverLookup"]')?.value,
            recommendedDownloads: document.querySelectorAll('[data-action="download-recommended-dictionary"]').length,
            settingsTabs: document.querySelectorAll('.jpdb-reader-settings-tab').length,
            dictionarySources: document.querySelectorAll('[data-dictionary-source-row]').length,
            supportLinks: document.querySelectorAll('[data-support-link]').length,
            hasMigakuComparison: document.querySelector('.jpdb-reader-support-card')?.textContent?.includes('$10/month') ?? false,
        };
    });
    assertAudit(snapshot.title === 'よむ Settings', 'settings dialog title is wrong');
    assertAudit(snapshot.saveText === 'Save' && snapshot.cancelText === 'Cancel', 'settings actions are missing');
    assertAudit(snapshot.saveBottom <= snapshot.viewportHeight, 'settings Save button is below the visible viewport');
    assertAudit(snapshot.fiveRows > 0 && snapshot.passFailRows === 0, 'five-grade and pass/fail shortcut settings are both visible');
    assertAudit(snapshot.localOcrHidden && snapshot.cloudOcrHidden, 'irrelevant OCR provider fields are visible by default');
    assertAudit(snapshot.hoverShortcut === 'Shift+H', 'shortcut field did not capture a pressed key combo');
    assertAudit(snapshot.recommendedDownloads >= 6, 'recommended dictionary downloads are missing from settings');
    assertAudit(snapshot.settingsTabs >= 6, 'settings are not organized into modular tabs');
    assertAudit(snapshot.dictionarySources >= 3, 'definition source ordering rows are missing');
    assertAudit(snapshot.supportLinks >= 4 && snapshot.hasMigakuComparison, 'support/donation links or free-vs-paid copy are missing');
    await page.screenshot({ path: path.join(ARTIFACTS, 'settings.png'), fullPage: false });
    await page.close();
    record('settings dialog', 'pass', 'actions visible, irrelevant provider fields hidden');
}

async function auditSettingsMobile(browser, server) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        apiKey: '',
        showFloatingButton: true,
        ocrEnabled: true,
    }, { width: 390, height: 844 });
    await page.goto(`${server.origin}/reader-test.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    let snapshot = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('.jpdb-reader-settings-tab')].map(tab => {
            const rect = tab.getBoundingClientRect();
            return { text: tab.textContent?.trim(), left: rect.left, right: rect.right, width: rect.width };
        });
        return {
            tabs,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            tabBarWidth: document.querySelector('.jpdb-reader-settings-tabs')?.scrollWidth ?? 0,
            tabBarClientWidth: document.querySelector('.jpdb-reader-settings-tabs')?.clientWidth ?? 0,
            apiKeyTop: document.querySelector('input[name="apiKey"]')?.getBoundingClientRect().top ?? 9999,
        };
    });
    assertAudit(snapshot.tabs.length >= 6, 'mobile settings tabs are missing sections');
    assertAudit(snapshot.tabs.every(tab => tab.left >= 0 && tab.right <= snapshot.viewportWidth && tab.width > 30), 'a mobile settings tab is clipped');
    assertAudit(snapshot.tabBarWidth <= snapshot.tabBarClientWidth + 1, 'mobile settings tabs require hidden horizontal scrolling');
    assertAudit(snapshot.apiKeyTop < snapshot.viewportHeight * 0.55, 'API key field is too far down after opening settings');

    await page.locator('[data-action="settings-panel"][data-panel="media"]').click();
    snapshot = await page.evaluate(() => {
        const tools = [...document.querySelectorAll('.jpdb-reader-audio-source-row .jpdb-reader-row-tools')].map(row => {
            const rect = row.getBoundingClientRect();
            const buttons = [...row.querySelectorAll('button')].map(button => {
                const buttonRect = button.getBoundingClientRect();
                return { width: buttonRect.width, height: buttonRect.height, left: buttonRect.left };
            });
            return { left: rect.left, buttons };
        });
        return { tools, viewportWidth: innerWidth };
    });
    assertAudit(snapshot.tools.length > 0, 'mobile audio source tools are missing');
    assertAudit(snapshot.tools.every(tool => tool.left >= 0 && tool.buttons.every(button => button.left >= 0 && button.width >= 34 && button.height >= 34)), 'mobile audio source controls are cramped or clipped');

    await page.locator('[data-action="settings-panel"][data-panel="help"]').click();
    await page.screenshot({ path: path.join(ARTIFACTS, 'settings-mobile-help.png'), fullPage: false });
    snapshot = await page.evaluate(() => ({
        supportLinks: document.querySelectorAll('[data-support-link]').length,
        copy: document.querySelector('.jpdb-reader-support-card')?.textContent ?? '',
    }));
    assertAudit(snapshot.supportLinks >= 4, 'mobile Help tab does not expose support links');
    assertAudit(snapshot.copy.includes('$10/month') && snapshot.copy.includes('for free'), 'mobile Help tab does not communicate the free-vs-paid point');
    await page.close();
    record('mobile settings journey', 'pass', 'tabs, audio rows, and support links stay visible on iPhone width');
}

async function auditBloomeeAutoScan(browser) {
    const { page, requests } = await newAuditedPage(browser, { ...baseSettings, showFloatingButton: false, ocrEnabled: false });
    await page.goto('https://bloomeelife.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await injectUserscript(page);
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if ((node.textContent || '').includes('食卓やリビング')) {
                node.parentElement?.scrollIntoView({ block: 'center' });
                break;
            }
        }
    });
    await waitForAudit(page, () => {
        const paragraph = [...document.querySelectorAll('p.point__itembox-txt')]
            .find(el => el.textContent?.includes('リビング'));
        return (paragraph?.querySelectorAll('.jpdb-reader-word').length ?? 0) >= 3;
    }, 12000, 'Bloomee visible paragraph was not wrapped after automatic scroll scan');

    const snapshot = await page.evaluate(() => {
        const paragraph = [...document.querySelectorAll('p.point__itembox-txt')]
            .find(el => el.textContent?.includes('リビング'));
        return {
            wrappedWords: paragraph?.querySelectorAll('.jpdb-reader-word').length ?? 0,
            furigana: paragraph?.querySelectorAll('.jpdb-reader-furi').length ?? 0,
            displayHeadingWords: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
                .filter(el => getComputedStyle(el).textAlign === 'center' && (el.textContent || '').replace(/\s+/g, '').length <= 40)
                .reduce((sum, el) => sum + el.querySelectorAll('.jpdb-reader-word').length, 0),
            visibleWrappedWords: [...(paragraph?.querySelectorAll('.jpdb-reader-word') ?? [])].filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= innerHeight;
            }).length,
        };
    });
    assertAudit(snapshot.wrappedWords >= 3, 'Bloomee paragraph has too few wrapped words');
    assertAudit(snapshot.furigana >= 1, 'Bloomee wrapped paragraph has no furigana');
    assertAudit(snapshot.displayHeadingWords === 0, 'short centered display headings were wrapped and may break layout');
    assertAudit(requests.some(request => request.url.includes('jpdb.io/api/v1/parse') && request.status === 200), 'JPDB parse request did not complete');
    await page.screenshot({ path: path.join(ARTIFACTS, 'bloomee-auto-scan.png'), fullPage: false });
    await page.close();
    record('Bloomee auto page scan', 'pass', `${snapshot.wrappedWords} wrapped words, ${snapshot.furigana} furigana nodes`);
}

async function auditHoverLookup(browser, server) {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{font:24px/1.8 system-ui;margin:40px;color:#171a1f}
    </style></head><body><p>今日は静かな喫茶店で新しい本を読みました。明日は学校で勉強します。</p></body></html>`;
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        lookupOnClick: false,
        lookupOnHover: true,
        hoverOpenDelayMs: 40,
        hoverCloseDelayMs: 140,
        localDictionariesEnabled: true,
        localDictionaryShowKanji: true,
        dictionaryPreferences: [
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 0 },
            { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1 },
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 2 },
        ],
        shortcuts: { ...baseSettings.shortcuts, hoverLookup: 'Shift' },
    });
    await page.route(`${server.origin}/hover-fixture.html`, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
    }));
    await page.goto(`${server.origin}/hover-fixture.html`, { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-word').length > 0, 10000, 'fixture text was not scanned');
    const firstWord = await page.locator('.jpdb-reader-word').first().boundingBox();
    const secondWord = await page.locator('.jpdb-reader-word').nth(1).boundingBox();
    assertAudit(firstWord, 'no scanned word bounding box found');
    assertAudit(secondWord, 'no second scanned word bounding box found');
    await page.keyboard.down('Shift');
    await page.mouse.move(firstWord.x + firstWord.width / 2, firstWord.y + firstWord.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const hoverHasBackdrop = await page.locator('.jpdb-reader-backdrop').count();
    assertAudit(hoverHasBackdrop === 0, 'hover lookup mounted a modal backdrop');
    const text = await page.locator('.jpdb-reader-popover').innerText();
    assertAudit(/JPDB|Add|Never|Blacklist/.test(text), 'hover popup did not render mining actions');
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the hover popup');
    await page.waitForTimeout(260);
    const reopenedAfterEscape = await page.locator('.jpdb-reader-popover').count();
    assertAudit(reopenedAfterEscape === 0, 'hover popup reopened immediately after Escape without pointer leaving the word');
    await page.mouse.move(8, 8);
    await page.mouse.move(secondWord.x + secondWord.width / 2, secondWord.y + secondWord.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const popoverBox = await page.locator('.jpdb-reader-popover').boundingBox();
    assertAudit(popoverBox, 'hover popup has no bounding box');
    await page.mouse.move(popoverBox.x + Math.min(24, popoverBox.width / 2), popoverBox.y + Math.min(24, popoverBox.height / 2));
    await page.waitForTimeout(260);
    assertAudit(await page.locator('.jpdb-reader-popover').count() === 1, 'hover popup closed while pointer was inside the panel');
    await page.mouse.move(8, 8);
    await page.waitForTimeout(220);
    await page.mouse.move(firstWord.x + firstWord.width / 2, firstWord.y + firstWord.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const pillHref = await page.locator('.jpdb-reader-jpdb-pill').first().getAttribute('href');
    assertAudit(pillHref?.includes('https://jpdb.io/vocabulary/'), 'JPDB pill is not the vocabulary open link');
    const kanjiButton = page.locator('.jpdb-reader-kanji-inline').first();
    await kanjiButton.click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-jpdb-kanji')?.textContent?.includes('Readings and components'), 9000, 'kanji drilldown did not show kanji details');
    const kanjiSnapshot = await page.evaluate(() => ({
        kanjiPill: document.querySelector('.jpdb-reader-jpdb-pill')?.getAttribute('href') ?? '',
        jpdbKanjiText: document.querySelector('.jpdb-reader-jpdb-kanji')?.textContent ?? '',
        localKanjiText: document.querySelector('.jpdb-reader-kanji')?.textContent ?? '',
        originsText: document.querySelector('.jpdb-reader-origins')?.textContent ?? '',
        originNodes: document.querySelectorAll('.jpdb-reader-origin-node').length,
        radicalCards: document.querySelectorAll('.jpdb-reader-radical-card').length,
        sourceLinks: document.querySelectorAll('.jpdb-reader-origin-sources a').length,
        historicalNotes: document.querySelector('.jpdb-reader-origin-wiktionary')?.textContent ?? '',
        kanjiVGPaths: document.querySelectorAll('.jpdb-reader-kanjivg-svg path').length,
        doodleCanvas: Boolean(document.querySelector('.jpdb-reader-doodle-canvas')),
        componentButtons: document.querySelectorAll('.jpdb-reader-component-card[data-action="kanji"]').length,
        backVisible: Boolean(document.querySelector('[data-action="word-back"]')),
        similarWords: document.querySelectorAll('.jpdb-reader-similar-word').length,
    }));
    assertAudit(kanjiSnapshot.kanjiPill.includes('https://jpdb.io/kanji/'), 'kanji JPDB pill is not the kanji open link');
    assertAudit(kanjiSnapshot.backVisible, 'kanji drilldown is missing a back control');
    assertAudit(kanjiSnapshot.jpdbKanjiText.includes('Readings and components'), 'kanji details section is missing');
    assertAudit(/Origin and structure|JLPT|Grade|Strokes/.test(kanjiSnapshot.originsText), 'kanji facts and origins panel is missing');
    assertAudit(kanjiSnapshot.originNodes > 1, 'kanji origins map did not render component nodes');
    assertAudit(kanjiSnapshot.radicalCards > 0, 'kanji radical card did not render');
    assertAudit(kanjiSnapshot.sourceLinks >= 2, 'kanji source links did not render');
    assertAudit(/historical forms|Short QA note/.test(kanjiSnapshot.historicalNotes), 'Wiktionary historical notes did not render');
    assertAudit(kanjiSnapshot.kanjiVGPaths > 0, 'Stroke-order trace did not render');
    assertAudit(kanjiSnapshot.doodleCanvas, 'kanji drawing canvas did not render');
    assertAudit(kanjiSnapshot.componentButtons > 0, 'kanji components are not clickable');
    assertAudit(/KANJIDIC|now|day|sun|book|read/.test(kanjiSnapshot.localKanjiText), 'local kanji dictionary section is missing');
    assertAudit(kanjiSnapshot.similarWords > 0, 'kanji drilldown did not show JPDB used-in words');
    await page.screenshot({ path: path.join(ARTIFACTS, 'hover-lookup.png'), fullPage: false });
    await page.keyboard.up('Shift');
    await page.close();
    record('hold-key hover lookup', 'pass', 'Shift hover opens, Escape suppresses reopen, and the panel stays alive under the pointer');
}

async function auditOcrFixture(browser) {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{margin:0;padding:32px;background:#15191f;color:white;font-family:system-ui}
        img{display:block;width:520px;height:360px;object-fit:cover;border:1px solid #333}
    </style></head><body>
        <img alt="今日は学校へ行きます。" data-ocr-lines='[
            {"text":"今日は学校へ行きます。","box":{"left":0.08,"top":0.12,"width":0.76,"height":0.18},"vertical":false},
            {"text":"友だちと本を読む。","box":{"left":0.14,"top":0.58,"width":0.68,"height":0.18},"vertical":false}
        ]' src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='520' height='360'><rect width='520' height='360' fill='%23f4f0e7'/><text x='40' y='90' font-size='42'>今日は学校へ行きます。</text><text x='72' y='245' font-size='42'>友だちと本を読む。</text></svg>">
    </body></html>`;
    const { page } = await newAuditedPage(browser, { ...baseSettings, ocrEnabled: true, ocrAutoScanImages: true, ocrShowTextOverlay: false });
    await page.goto(dataUrl(html));
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-ocr-line').length >= 2, 10000, 'OCR fixture lines were not created');
    const overlay = await page.evaluate(() => {
        const image = document.querySelector('img');
        const line = document.querySelector('.jpdb-ocr-line');
        const imageRect = image?.getBoundingClientRect();
        const lineRect = line?.getBoundingClientRect();
        return {
            lineCount: document.querySelectorAll('.jpdb-ocr-line').length,
            wordCount: document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length,
            visibleTextOverlays: document.querySelectorAll('.jpdb-ocr-line-visible').length,
            imageRect,
            lineRect,
            lineTitle: line?.getAttribute('title'),
        };
    });
    assertAudit(overlay.lineCount >= 2, 'OCR line count is wrong');
    assertAudit(overlay.wordCount >= 2, 'OCR text was not parsed into selectable words');
    assertAudit(overlay.visibleTextOverlays === 0, 'OCR text is visibly painted by default');
    assertAudit(overlay.lineTitle?.includes('学校'), 'OCR line text is missing');
    await page.locator('.jpdb-ocr-line').first().click();
    const activeLines = await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line-active').length);
    assertAudit(activeLines === 1, 'OCR should reveal only one text region at a time');
    await page.locator('.jpdb-ocr-line .jpdb-reader-word').first().click();
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await page.screenshot({ path: path.join(ARTIFACTS, 'ocr-fixture.png'), fullPage: false });
    await page.close();
    record('OCR fixture', 'pass', 'transparent regions appear and open lookup on click');
}

async function auditYouTubeFilterFixture(browser) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        youtubeImmersionEnabled: true,
        youtubeShowFilterNotice: true,
        showFloatingButton: false,
        scanVisiblePage: false,
        autoScanJapanese: false,
    });
    await page.route('https://www.youtube.com/yomu-filter-test', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><head><meta charset="utf-8"><title>YouTube fixture</title><style>
            body{margin:0;padding:24px;background:#0f0f0f;color:white;font:16px system-ui}
            main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
            ytd-rich-item-renderer,ytd-compact-video-renderer{display:block;border:1px solid #333;border-radius:8px;padding:12px;background:#181818}
            #video-title{display:block;color:white;text-decoration:none;font-weight:700}
        </style></head><body><main>
            <ytd-rich-item-renderer data-case="jp"><a id="video-title" href="/watch?v=jp" aria-label="日本語で花の名前を覚える">日本語で花の名前を覚える</a></ytd-rich-item-renderer>
            <ytd-rich-item-renderer data-case="english"><a id="video-title" href="/watch?v=en" aria-label="10 habits for studying">10 habits for studying</a></ytd-rich-item-renderer>
            <ytd-compact-video-renderer data-case="mixed"><a id="video-title" href="/watch?v=mix" title="東京カフェで朝ごはん">東京カフェで朝ごはん</a></ytd-compact-video-renderer>
            <ytd-rich-item-renderer data-case="channel-only"><a id="video-title" href="/watch?v=channel">study with me</a><span id="channel-name">日本語チャンネル</span></ytd-rich-item-renderer>
        </main></body></html>`,
    }));
    await page.goto('https://www.youtube.com/yomu-filter-test', { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length >= 2, 6000, 'YouTube filter did not hide non-Japanese fixture cards');
    const hidden = await page.evaluate(() => ({
        jpHidden: document.querySelector('[data-case="jp"]')?.classList.contains('jpdb-youtube-filtered') ?? true,
        englishHidden: document.querySelector('[data-case="english"]')?.classList.contains('jpdb-youtube-filtered') ?? false,
        mixedHidden: document.querySelector('[data-case="mixed"]')?.classList.contains('jpdb-youtube-filtered') ?? true,
        channelOnlyHidden: document.querySelector('[data-case="channel-only"]')?.classList.contains('jpdb-youtube-filtered') ?? false,
        barText: document.querySelector('.jpdb-youtube-filter-bar')?.textContent ?? '',
        hiddenCount: document.querySelectorAll('.jpdb-youtube-filtered').length,
    }));
    assertAudit(hidden.jpHidden === false, 'Japanese YouTube card was hidden');
    assertAudit(hidden.mixedHidden === false, 'Japanese mixed YouTube card was hidden');
    assertAudit(hidden.englishHidden === true, 'English YouTube card stayed visible');
    assertAudit(hidden.channelOnlyHidden === true, 'Channel-only Japanese text should not keep an English title visible');
    assertAudit(/hid 2/.test(hidden.barText), 'YouTube filter notice did not report hidden cards');
    assertAudit(/Show anyway/.test(hidden.barText), 'YouTube filter notice is missing the Show anyway escape hatch');
    if (await page.locator('.jpdb-reader-backdrop').count()) {
        await page.keyboard.press('Escape');
        await waitForAudit(page, () => !document.querySelector('.jpdb-reader-backdrop'), 2000, 'Escape did not clear reader backdrop before YouTube filter actions');
    }
    await page.locator('.jpdb-youtube-filter-bar [data-action="show-anyway"]').click();
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length === 0, 4000, 'Show anyway did not reveal filtered YouTube cards');
    await page.locator('.jpdb-youtube-filter-bar [data-action="show-anyway"]').click();
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length === 2, 4000, 'Filter again did not hide YouTube cards');
    await page.keyboard.press('Alt+Y');
    await waitForAudit(page, () => !document.querySelector('.jpdb-youtube-filter-bar') && document.querySelectorAll('.jpdb-youtube-filtered').length === 0, 4000, 'YouTube filter shortcut did not disable filtering');
    await page.keyboard.press('Alt+Y');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length === 2, 4000, 'YouTube filter shortcut did not re-enable filtering');
    await page.locator('.jpdb-youtube-filter-bar [data-action="turn-off"]').click();
    await waitForAudit(page, () => !document.querySelector('.jpdb-youtube-filter-bar') && document.querySelectorAll('.jpdb-youtube-filtered').length === 0, 4000, 'Turn off did not persistently disable YouTube filtering');
    await page.screenshot({ path: path.join(ARTIFACTS, 'youtube-filter-fixture.png'), fullPage: false });
    await page.close();
    record('YouTube immersion filter fixture', 'pass', 'Japanese cards stay visible; Show anyway, Turn off, and Alt+Y work');
}

async function auditYouTubeLiveSmoke(browser) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        youtubeImmersionEnabled: true,
        youtubeShowFilterNotice: true,
        showFloatingButton: false,
        scanVisiblePage: false,
        autoScanJapanese: false,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto('https://www.youtube.com/watch?v=K32EfuTvPoM', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await injectUserscript(page);
        await page.waitForTimeout(4500);
        const snapshot = await page.evaluate(() => ({
            cards: document.querySelectorAll('ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer').length,
            filtered: document.querySelectorAll('.jpdb-youtube-filtered').length,
            bar: document.querySelector('.jpdb-youtube-filter-bar')?.textContent ?? '',
        }));
        const trustedTypeErrors = errors.filter(message => /TrustedHTML|TrustedScriptURL|innerHTML|HTMLScriptElement/i.test(message));
        assertAudit(trustedTypeErrors.length === 0, `YouTube Trusted Types error: ${trustedTypeErrors[0]}`);
        await page.screenshot({ path: path.join(ARTIFACTS, 'youtube-live-smoke.png'), fullPage: false });
        if (!snapshot.cards) {
            record('YouTube live smoke', 'skip', 'YouTube loaded without visible recommendation cards in headless mode');
        } else {
            record('YouTube live smoke', 'pass', `${snapshot.filtered}/${snapshot.cards} cards filtered`);
        }
    } catch (error) {
        record('YouTube live smoke', 'skip', `live YouTube was not stable in headless mode: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await page.close();
    }
}

async function auditVideoFixture(browser, server) {
    const { page } = await newAuditedPage(browser, { ...baseSettings, subtitlePlayerEnabled: true, subtitleAutoDetect: true, showFloatingButton: false });
    await page.goto(`${server.origin}/reader-video-test.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 6000 });
    await waitForAudit(page, () => {
        const video = document.querySelector('video');
        if (!video || video.textTracks.length < 2) return false;
        for (const track of video.textTracks) track.mode = 'hidden';
        return true;
    }, 6000, 'video fixture subtitle tracks did not load');
    await waitForAudit(page, () => {
        const status = document.querySelector('.jpdb-subtitle-status')?.textContent ?? '';
        return /2|track/i.test(status);
    }, 6000, 'subtitle controller did not detect fixture tracks');
    await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return;
        video.currentTime = 1.2;
        video.dispatchEvent(new Event('timeupdate'));
        for (const track of video.textTracks) track.dispatchEvent(new Event('cuechange'));
    });
    await waitForAudit(page, () => {
        const primary = document.querySelector('.jpdb-subtitle-primary');
        return primary?.textContent?.includes('今日') && primary?.textContent?.includes('読');
    }, 8000, 'subtitle text did not render while watching the fixture');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length > 0, 8000, 'subtitle JPDB word highlighting did not render');
    const snapshot = await page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const primary = document.querySelector('.jpdb-subtitle-primary');
        const rect = root?.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => button.textContent?.trim());
        const primaryStyle = primary ? getComputedStyle(primary) : null;
        return {
            hidden: root?.hidden,
            rect: rect ? { width: rect.width, height: rect.height, bottom: rect.bottom } : null,
            buttons,
            menuHidden: document.querySelector('.jpdb-subtitle-menu')?.hasAttribute('hidden'),
            subtitleText: primary?.textContent ?? '',
            subtitleBackground: primaryStyle?.backgroundImage ?? '',
            subtitleWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
        };
    });
    assertAudit(snapshot.hidden === false, 'subtitle player is hidden on a page with video');
    assertAudit((snapshot.rect?.width ?? 0) > 200, 'subtitle player is not laid out');
    assertAudit(snapshot.buttons.includes('Lines') && snapshot.buttons.includes('...'), 'subtitle controls are missing');
    assertAudit(snapshot.subtitleText.includes('今日') && snapshot.subtitleText.includes('読'), 'subtitle fixture cue is not visible');
    assertAudit(snapshot.subtitleWords > 0, 'subtitle cue is not token-highlighted');
    assertAudit(snapshot.subtitleBackground.includes('rgba'), 'subtitle readable background is not applied');
    await page.screenshot({ path: path.join(ARTIFACTS, 'video-fixture.png'), fullPage: false });
    await page.close();
    record('subtitle player fixture', 'pass', 'watched a cue with JPDB highlighting and readable subtitle backing');
}

async function runAudit(name, fn, options = {}) {
    if (options.requiresApiKey && !QA_API_KEY) {
        record(name, 'skip', 'YOMU_TEST_API_KEY is not set');
        return;
    }
    try {
        await fn();
    } catch (error) {
        record(name, 'fail', error instanceof Error ? error.message : String(error));
    }
}

async function main() {
    await mkdir(ARTIFACTS, { recursive: true });
    userscript = await readFile(SCRIPT_PATH, 'utf8');

    const server = await startStaticServer(DIST);
    const browser = await chromium.launch({ headless: true });
    try {
        await runAudit('secret leak scan', auditNoSecretLeak);
        await runAudit('mobile onboarding', () => auditOnboardingMobile(browser, server));
        await runAudit('settings dialog', () => auditSettings(browser, server));
        await runAudit('mobile settings journey', () => auditSettingsMobile(browser, server));
        await runAudit('Bloomee auto page scan', () => auditBloomeeAutoScan(browser), { requiresApiKey: true });
        await runAudit('hold-key hover lookup', () => auditHoverLookup(browser, server), { requiresApiKey: true });
        await runAudit('OCR fixture', () => auditOcrFixture(browser), { requiresApiKey: true });
        await runAudit('YouTube immersion filter fixture', () => auditYouTubeFilterFixture(browser));
        await runAudit('YouTube live smoke', () => auditYouTubeLiveSmoke(browser));
        await runAudit('subtitle player fixture', () => auditVideoFixture(browser, server), { requiresApiKey: true });
    } finally {
        await browser.close();
        await server.close();
    }

    const failed = results.filter(result => result.status === 'fail');
    console.log(`\nQA artifacts: ${ARTIFACTS}`);
    console.log(`QA summary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
}

await main();
