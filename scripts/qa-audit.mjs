#!/usr/bin/env node
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadLocalEnv } from './qa-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadLocalEnv(ROOT);
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
    jpdbExtensionsEnabled: true,
    jpdbUchisenEnabled: true,
    jpdbRtkEnabled: true,
    jpdbImmersionKitEnabled: true,
    jpdbLocalDictionariesEnabled: true,
    jpdbReviewUiEnabled: true,
    jpdbAutoRevealSentenceEnabled: true,
    jpdbKanjiDoodleEnabled: true,
    rtkEnabled: true,
    kanjivgEnabled: true,
    kanjiOriginsEnabled: true,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginWiktionaryEnabled: false,
    kanjiOriginGraphEnabled: true,
    kanjiOriginRadicalImagesEnabled: false,
    similarKanjiWords: true,
    similarKanjiWordLimit: 8,
    audioEnabled: false,
    autoPlayAudio: false,
    audioSources: [],
    audioEnableDefaultSources: false,
    audioViaBlob: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    immersionKitEnabled: true,
    immersionKitPriority: 80,
    immersionKitLimit: 3,
    immersionKitMinLength: 4,
    immersionKitMaxLength: 80,
    immersionKitCategory: 'all',
    immersionKitSort: 'sentence_length:asc',
    immersionKitExactMatch: false,
    immersionKitShowTranslation: false,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlayOnHover: true,
    immersionKitPlaybackRate: 1,
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
    subtitleFontSize: 28,
    subtitleBottomOffset: 12,
    subtitleTextColor: '#ffffff',
    subtitleOutlineColor: '#000000',
    subtitleBackgroundColor: '#181b20',
    subtitleBackgroundOpacity: 0.18,
    subtitleFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    subtitleFontWeight: 760,
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

async function assertAccessibleSurface(page, name, selector = 'body') {
    const axe = await new AxeBuilder({ page })
        .include(selector)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
    const violations = axe.violations
        .filter(violation => violation.impact !== 'minor')
        .map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.slice(0, 4).map(node => node.target.join(' ')),
        }));
    assertAudit(!violations.length, `${name} axe violations: ${JSON.stringify(violations)}`);

    const wcag = await page.evaluate(surfaceSelector => {
        const root = document.querySelector(surfaceSelector);
        if (!root) return { missing: true };
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== 'hidden'
                && style.display !== 'none'
                && Number(style.opacity || 1) > 0.02
                && rect.width > 0
                && rect.height > 0;
        };
        const labelFor = element => {
            const aria = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby');
            const text = element.textContent || element.getAttribute('title') || element.getAttribute('alt') || element.getAttribute('value') || '';
            return `${aria || ''} ${text || ''}`.replace(/\s+/g, ' ').trim();
        };
        const controls = [...root.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],[tabindex]:not([tabindex="-1"])')]
            .filter(element => visible(element));
        const targetSizeException = element => {
            const style = getComputedStyle(element);
            if (element.classList.contains('jpdb-reader-word')) return true;
            if (element.tagName.toLowerCase() === 'a' && style.display === 'inline') return true;
            return false;
        };
        const smallTargets = controls
            .filter(element => !targetSizeException(element))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return { label: labelFor(element), tag: element.tagName.toLowerCase(), width: rect.width, height: rect.height };
            })
            .filter(item => item.width < 24 || item.height < 24);
        const unnamedControls = controls
            .filter(element => !labelFor(element))
            .map(element => element.outerHTML.slice(0, 140));
        const imagesWithoutAlt = [...root.querySelectorAll('img')]
            .filter(image => visible(image) && !image.hasAttribute('alt'))
            .map(image => image.currentSrc || image.getAttribute('src') || 'img');
        const unloadedImages = [...root.querySelectorAll('img')]
            .filter(image => visible(image) && (!image.complete || image.naturalWidth <= 0))
            .map(image => image.currentSrc || image.getAttribute('src') || 'img');
        const rootRect = root.getBoundingClientRect();
        const horizontalOverflow = root.scrollWidth > root.clientWidth + 2 && rootRect.width <= innerWidth + 2;
        const viewportOverflow = document.documentElement.scrollWidth > innerWidth + 2;
        const fixedOverflow = [...root.querySelectorAll('*')]
            .filter(element => visible(element))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return {
                    tag: element.tagName.toLowerCase(),
                    className: typeof element.className === 'string' ? element.className.slice(0, 80) : '',
                    text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                };
            })
            .filter(item => item.right > innerWidth + 2 || item.left < -2 || item.bottom < -2)
            .slice(0, 8);
        return {
            missing: false,
            smallTargets,
            unnamedControls,
            imagesWithoutAlt,
            unloadedImages,
            horizontalOverflow,
            viewportOverflow,
            fixedOverflow,
        };
    }, selector);
    assertAudit(!wcag.missing, `${name} surface ${selector} is missing`);
    assertAudit(!wcag.unnamedControls.length, `${name} has unnamed controls: ${JSON.stringify(wcag.unnamedControls)}`);
    assertAudit(!wcag.smallTargets.length, `${name} has controls below 24px target size: ${JSON.stringify(wcag.smallTargets)}`);
    assertAudit(!wcag.imagesWithoutAlt.length, `${name} has images without alt text: ${JSON.stringify(wcag.imagesWithoutAlt)}`);
    assertAudit(!wcag.unloadedImages.length, `${name} has unloaded/broken images: ${JSON.stringify(wcag.unloadedImages)}`);
    assertAudit(!wcag.horizontalOverflow && !wcag.viewportOverflow, `${name} has hidden horizontal overflow`);
    assertAudit(!wcag.fixedOverflow.length, `${name} has visible content outside the viewport: ${JSON.stringify(wcag.fixedOverflow)}`);
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

function binaryQaResponse(bytes, contentTypeValue) {
    return {
        status: 200,
        responseText: '',
        bytes: [...bytes],
        contentType: contentTypeValue,
    };
}

async function waitForNodeAudit(predicate, timeoutMs, message) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(message);
}

function maybeMockQaRequest(request) {
    const url = new URL(request.url);
    for (const matcher of qaRequestMocks) {
        const response = matcher(url, request.data);
        if (response) return response;
    }
    return null;
}

const qaRequestMocks = [
    (url, data) => url.hostname === 'jpdb.io' && url.pathname.startsWith('/api/v1/')
        ? mockJpdbApi(url.pathname.replace('/api/v1/', ''), data)
        : null,
    (url, data) => (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '8765'
        ? jsonQaResponse(mockAnkiConnect(data))
        : null,
    url => url.hostname === 'jpdb.io' && url.pathname.startsWith('/kanji/')
        ? textQaResponse(mockJpdbKanjiHtml(decodeURIComponent(url.pathname.split('/').pop() ?? '')))
        : null,
    url => url.hostname === 'hrussellzfac023.github.io' && url.pathname.startsWith('/rtk/')
        ? textQaResponse(mockRtkHtml(pathKanji(url)))
        : null,
    url => url.hostname === 'uchisen.com' && url.pathname.startsWith('/kanji/')
        ? textQaResponse(mockUchisenHtml(pathKanji(url)))
        : null,
    url => url.hostname === 'ik.imagekit.io' && url.pathname.startsWith('/uchisen/')
        ? textQaResponse(mockImageSvg('Uchisen'), 'image/svg+xml; charset=utf-8')
        : null,
    url => url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/KanjiVG/kanjivg/')
        ? textQaResponse(mockKanjiVgSvg(), 'image/svg+xml; charset=utf-8')
        : null,
    url => url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/gabor-kovacs/the-kanji-map/')
        ? jsonQaResponse(mockKanjiMapData(decodeURIComponent((url.pathname.split('/').pop() ?? '').replace(/\.json$/i, ''))))
        : null,
    url => url.hostname === 'en.wiktionary.org' && url.pathname === '/w/api.php'
        ? jsonQaResponse(mockWiktionaryParse(url.searchParams.get('page') ?? '字'))
        : null,
    url => url.hostname === 'apiv2.immersionkit.com' && url.pathname === '/search'
        ? jsonQaResponse(mockImmersionKitSearch(url))
        : null,
    url => url.hostname === 'apiv2.immersionkit.com' && url.pathname === '/download_media'
        ? mockImmersionMedia(url)
        : null,
];

function pathKanji(url) {
    return decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] ?? '');
}

function mockImmersionMedia(url) {
    const mediaPath = url.searchParams.get('path') ?? '';
    if (mediaPath.endsWith('.mp3')) return textQaResponse('fake-mp3', 'audio/mpeg');
    const label = mediaPath.includes('steins_gate') || mediaPath.includes('Steins') ? 'Steins Gate' : 'Example';
    return textQaResponse(mockImageSvg(label), 'image/svg+xml; charset=utf-8');
}

function immersionAudioRequestCount(requests) {
    return requests.filter(request => request.url.includes('apiv2.immersionkit.com/download_media') && /mp3/i.test(request.url)).length;
}

function immersionSearchRequestCount(requests) {
    return requests.filter(request => request.url.includes('apiv2.immersionkit.com/search')).length;
}

function jpdbParseRequestCount(requests) {
    return requests.filter(request => request.url.includes('jpdb.io/api/v1/parse')).length;
}

function audioTestRequestCount(requests) {
    return requests.filter(request => request.url.includes('https://audio.test/')).length;
}

async function audioPlayCount(page) {
    return page.evaluate(() => window.__yomuAudioPlayCount || 0).catch(() => 0);
}

async function waitForAudioPlaybackOrRequest(page, requests, requestCount, requestsBefore, playCountBefore, timeoutMs, message) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const playCount = await audioPlayCount(page);
        if (playCount > playCountBefore || requestCount(requests) > requestsBefore) return;
        await page.waitForTimeout(100);
    }
    throw new Error(message);
}

async function newAuditedPage(browser, settings = baseSettings, viewport = { width: 1280, height: 900 }) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.once('close', () => {
        if (context.pages().length === 0) void context.close().catch(() => undefined);
    });
    const requests = [];
    await page.route('https://apiv2.immersionkit.com/download_media**', route => {
        const url = new URL(route.request().url());
        const mediaPath = url.searchParams.get('path') ?? '';
        const isAudio = mediaPath.endsWith('.mp3');
        requests.push({
            method: route.request().method(),
            url: route.request().url(),
            status: 200,
        });
        route.fulfill({
            status: 200,
            contentType: isAudio ? 'audio/mpeg' : 'image/svg+xml; charset=utf-8',
            body: isAudio ? 'fake-mp3' : mockImageSvg(mediaPath.includes('steins_gate') || mediaPath.includes('Steins') ? 'Steins Gate' : 'Example'),
        });
    });
    await page.route('https://audio.test/**', route => {
        requests.push({
            method: route.request().method(),
            url: route.request().url(),
            status: 200,
        });
        route.fulfill({
            status: 200,
            contentType: 'audio/mpeg',
            body: 'fake-mp3',
        });
    });
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
                ...summarizeRequestBody(body),
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
            ...summarizeRequestBody(body),
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
            (document.head || document.documentElement || document.body).append(style);
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
                        : options.responseType === 'json'
                            ? JSON.parse(result.responseText || 'null')
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

async function openSettingsFromPuck(page) {
    await page.waitForSelector('.jpdb-reader-fab', { timeout: 6000 });
    await page.locator('.jpdb-reader-fab').click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    assertAudit(await page.locator('.jpdb-reader-quick').count() === 0, 'puck opened the removed quick controls panel');
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

function mockAnkiConnect(body) {
    const request = readJsonBody(body);
    switch (request.action) {
        case 'version':
            return { result: 6, error: null };
        case 'findNotes':
            return { result: /読む|よむ|読みました|よみました/.test(String(request.params?.query ?? '')) ? [9001] : [], error: null };
        case 'notesInfo':
            return {
                result: (request.params?.notes ?? []).map(noteId => ({
                    noteId,
                    modelName: 'Mining',
                    tags: ['yomu'],
                    fields: {
                        Expression: { value: '読みました', order: 0 },
                        Reading: { value: 'よみました', order: 1 },
                        Sentence: { value: '今日は本を読む。', order: 2 },
                        Meaning: { value: 'to read', order: 3 },
                        Source: { value: 'QA Anki deck', order: 4 },
                    },
                    cards: [8001],
                })),
                error: null,
            };
        case 'cardsInfo':
            return {
                result: (request.params?.cards ?? []).map(cardId => ({
                    cardId,
                    note: 9001,
                    deckName: 'Anime Mining',
                    queue: 2,
                    type: 2,
                    due: 1,
                    reps: 12,
                    lapses: 0,
                    interval: 15,
                })),
                error: null,
            };
        case 'answerCards':
        case 'guiBrowse':
            return { result: null, error: null };
        case 'deckNames':
            return { result: ['Yomu'], error: null };
        case 'modelNames':
            return { result: [], error: null };
        case 'createDeck':
        case 'createModel':
            return { result: null, error: null };
        default:
            return { result: null, error: null };
    }
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

function summarizeRequestBody(body) {
    const json = readJsonBody(body);
    const note = json?.params?.note;
    return {
        action: typeof json?.action === 'string' ? json.action : undefined,
        ankiSentence: typeof note?.fields?.Sentence === 'string' ? textFromHtml(note.fields.Sentence) : undefined,
        ankiSource: typeof note?.fields?.Source === 'string' ? note.fields.Source : undefined,
        ankiHasPicture: Array.isArray(note?.picture) && note.picture.length > 0,
    };
}

function textFromHtml(value) {
    return String(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
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

function mockUchisenHtml(kanji) {
    return `<!doctype html><html><body>
        <div class="kanji_image_loader" data-large="/kanji/${encodeURIComponent(kanji)}/main.svg"></div>
        <div id="mnemonic_story">QA Uchisen story for ${htmlEscape(kanji)}.</div>
        <div class="mnemonic_card">
            <input class="image_url" value="/kanji/${encodeURIComponent(kanji)}/main.svg?tr=w-300">
            <input class="story" value="Duplicate image">
        </div>
        <div class="mnemonic_card">
            <input class="image_url" value="generated_${encodeURIComponent(kanji)}.svg">
            <input class="story" value="Second &lt;b&gt;Uchisen&lt;/b&gt; story">
        </div>
    </body></html>`;
}

function mockKanjiVgSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
        <path d="M53,13 C44,29 31,42 15,51" />
        <path d="M57,14 C68,29 82,40 96,48" />
        <path d="M38,54 C49,58 63,58 76,54" />
        <path d="M30,70 H78 L62,91" />
        <text transform="matrix(1 0 0 1 50 10)">1</text>
    </svg>`;
}

function mockImageSvg(label) {
    const safeLabel = htmlEscape(label);
    if (/steins/i.test(label)) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
            <defs>
                <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
                    <stop stop-color="#f6d7a6"/>
                    <stop offset="1" stop-color="#93b7c8"/>
                </linearGradient>
                <linearGradient id="room" x1="0" x2="1">
                    <stop stop-color="#2f3943"/>
                    <stop offset="1" stop-color="#151a22"/>
                </linearGradient>
            </defs>
            <rect width="320" height="180" rx="12" fill="url(#room)"/>
            <rect x="18" y="18" width="126" height="76" rx="8" fill="url(#sky)"/>
            <rect x="170" y="38" width="116" height="78" rx="6" fill="#4a2f32"/>
            <rect x="180" y="48" width="96" height="58" fill="#72464d"/>
            <circle cx="78" cy="118" r="29" fill="#1d232c"/>
            <path d="M44 158c10-24 28-36 52-36s42 12 52 36" fill="#26313a"/>
            <path d="M192 124c18-10 44-10 62 0 14 8 24 20 30 36H162c6-16 16-28 30-36Z" fill="#303b45"/>
            <path d="M42 97h116M22 142h276" stroke="#f1efe8" stroke-width="5" stroke-linecap="round" opacity=".55"/>
            <text x="24" y="31" fill="#151a22" font-size="18" font-weight="800">${safeLabel}</text>
            <text x="286" y="166" text-anchor="end" fill="#f6d7a6" font-size="15" font-weight="700">QA still</text>
        </svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
        <rect width="320" height="180" rx="12" fill="#20242b"/>
        <rect x="24" y="24" width="272" height="132" rx="10" fill="#2c343f"/>
        <circle cx="96" cy="88" r="34" fill="#5ea780" opacity=".72"/>
        <rect x="145" y="56" width="108" height="18" rx="9" fill="#f2f4f8" opacity=".86"/>
        <rect x="145" y="88" width="78" height="14" rx="7" fill="#f2f4f8" opacity=".52"/>
        <text x="160" y="142" text-anchor="middle" fill="#f2f4f8" font-size="22">${safeLabel}</text>
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

function mockImmersionKitSearch(url) {
    const query = url.searchParams.get('q') ?? '読む';
    const examples = [
        {
            id: 'anime_steins_gate_000001',
            title: 'steins_gate',
            sentence: '今日は静かな喫茶店で本を読みました。',
            sentence_with_furigana: '今日[きょう]は 静[しず]かな 喫茶店[きっさてん]で 本[ほん]を 読[よ]みました。',
            translation: 'I read a book in a quiet cafe today.',
            image: 'qa-1.jpg',
            sound: 'qa-1.mp3',
        },
        {
            id: 'anime_steins_gate_000002',
            title: 'steins_gate',
            sentence: '新しい本を読む時間が好きです。',
            translation: 'I like time spent reading a new book.',
            image: 'qa-2.jpg',
            sound: 'qa-2.mp3',
        },
        {
            id: 'drama_qa_story_000003',
            title: 'qa_story',
            sentence: '日本語を読む練習をしました。',
            translation: 'I practiced reading Japanese.',
            image: 'qa-3.jpg',
            sound: 'qa-3.mp3',
        },
    ].filter(example => !query || example.sentence.includes(query) || example.sentence.includes('読') || query === '読む');
    return { examples, category_count: { anime: 2, drama: 1 }, deck_count: {} };
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
            tx.objectStore('dictionaryInfo').put({
                title: 'Jitendex',
                alias: 'Jitendex',
                enabled: true,
                priority: 2,
                counts: { terms: 6 },
                styles: 'span[data-sc-content="part-of-speech-info"] { text-decoration-line: underline; }',
            });
            tx.objectStore('dictionaryInfo').put({ title: 'JMnedict', alias: 'JMnedict', enabled: true, priority: 3, counts: { terms: 1 } });
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
                { expression: '母', reading: 'はは', glossary: [{ type: 'structured-content', content: { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: [{ tag: 'span', data: { content: 'part-of-speech-info' }, content: 'n' }, ' mother; mama'] }] } }], score: 10, dictionary: 'Jitendex' },
                { expression: '母', reading: 'はは', glossary: [{ tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'female parent name entry' }] }], score: 5, dictionary: 'JMnedict' },
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

async function jpdbLocalDictionaryDebug(page) {
    return page.evaluate(async () => {
        const dbSummary = await new Promise(resolve => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 2);
            request.onerror = () => resolve({ error: String(request.error?.message ?? request.error ?? 'open failed') });
            request.onsuccess = () => {
                const db = request.result;
                const stores = [...db.objectStoreNames];
                const txStores = stores.filter(name => ['dictionaryInfo', 'terms', 'kanji', 'termMeta'].includes(name));
                const tx = db.transaction(txStores, 'readonly');
                const counts = {};
                let pending = txStores.length;
                if (!pending) {
                    db.close();
                    resolve({ stores, counts });
                    return;
                }
                txStores.forEach(name => {
                    const count = tx.objectStore(name).count();
                    count.onsuccess = () => {
                        counts[name] = count.result;
                        pending -= 1;
                        if (!pending) {
                            db.close();
                            resolve({ stores, counts });
                        }
                    };
                    count.onerror = () => {
                        counts[name] = `error:${count.error?.message ?? count.error}`;
                        pending -= 1;
                        if (!pending) {
                            db.close();
                            resolve({ stores, counts });
                        }
                    };
                });
            };
        });
        const vocabulary = [...document.querySelectorAll('.result.vocabulary, .entry')].map(section => ({
            text: section.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
            meanings: section.querySelector('.subsection-meanings')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '',
        }));
        const settingsRaw = window.GM_getValue?.('jpdb-popup-reader-settings', null);
        const settings = settingsRaw && typeof settingsRaw === 'object'
            ? {
                localDictionariesEnabled: settingsRaw.localDictionariesEnabled,
                jpdbLocalDictionariesEnabled: settingsRaw.jpdbLocalDictionariesEnabled,
                dictionaryPreferences: settingsRaw.dictionaryPreferences,
                hasApiKey: Boolean(settingsRaw.apiKey),
            }
            : settingsRaw;
        return {
            href: location.href,
            settings,
            dbSummary,
            vocabulary,
            localPanels: [...document.querySelectorAll('.yomu-jpdb-local-dictionaries')].map(node => node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? ''),
            addonCards: [...document.querySelectorAll('.yomu-jpdb-addon-card')].map(node => node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 140) ?? ''),
        };
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
    await assertAccessibleSurface(page, 'mobile onboarding', '.jpdb-reader-onboarding');
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
    await openSettingsFromPuck(page);
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
            recommendedDownloadText: document.querySelector('[data-recommended-dictionaries]')?.textContent ?? '',
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
    assertAudit(
        snapshot.recommendedDownloads >= 7
            && /JMdict/i.test(snapshot.recommendedDownloadText)
            && /Jitendex/i.test(snapshot.recommendedDownloadText)
            && /JMnedict/i.test(snapshot.recommendedDownloadText)
            && /KANJIDIC/i.test(snapshot.recommendedDownloadText)
            && /JPDBv2/i.test(snapshot.recommendedDownloadText)
            && /BCCWJ/i.test(snapshot.recommendedDownloadText)
            && /Jiten/i.test(snapshot.recommendedDownloadText),
        'recommended dictionary downloads are missing from settings',
    );
    assertAudit(snapshot.settingsTabs >= 6, 'settings are not organized into modular tabs');
    assertAudit(snapshot.dictionarySources >= 3, 'definition source ordering rows are missing');
    assertAudit(snapshot.supportLinks >= 4 && snapshot.hasMigakuComparison, 'support/donation links or free-vs-paid copy are missing');
    await assertAccessibleSurface(page, 'settings dialog', '.jpdb-reader-settings');
    await page.screenshot({ path: path.join(ARTIFACTS, 'settings.png'), fullPage: false });

    await page.locator('[data-action="settings-panel"][data-panel="mining"]').click();
    await page.locator('[data-action="test-anki"]').click();
    const ankiSnapshot = await waitForAudit(page, () => {
        const status = document.querySelector('[data-anki-status]');
        if (status?.getAttribute('data-status-tone') !== 'success') return false;
        const button = document.querySelector('[data-action="test-anki"]');
        return {
            text: status.textContent ?? '',
            tone: status.getAttribute('data-status-tone'),
            disabled: button?.hasAttribute('disabled') ?? false,
        };
    }, 6000, 'Test Anki did not report status in the Anki settings panel');
    assertAudit(ankiSnapshot.tone === 'success' && ankiSnapshot.text.includes('Connected.'), 'Test Anki status is not shown as a successful connection');
    assertAudit(!ankiSnapshot.disabled, 'Test Anki button stayed disabled after the connection check');
    await page.close();
    record('settings dialog', 'pass', 'actions visible, irrelevant provider fields hidden, Anki test status shown');
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
    await openSettingsFromPuck(page);
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
    await assertAccessibleSurface(page, 'mobile settings help', '.jpdb-reader-settings');
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

async function auditNewTabDictionaryFallback(browser, server) {
    const consoleErrors = [];
    const pageErrors = [];
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        apiKey: '',
        ankiEnabled: false,
        newTabEnabled: false,
        newTabSource: 'auto',
        showFloatingButton: false,
        dictionaryPreferences: [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 },
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 1 },
        ],
    }, { width: 390, height: 844 });
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${server.origin}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, () => {
        const card = document.querySelector('[data-newtab-card]');
        const status = document.querySelector('[data-newtab-status]')?.textContent ?? '';
        const meaning = document.querySelector('[data-newtab-meaning]')?.textContent ?? '';
        const body = document.body.textContent ?? '';
        return card
            && status.includes('Dictionaries')
            && Boolean(meaning.trim())
            && !body.includes('Loading...')
            && !body.includes('Loading words...')
            && !body.includes('No dictionary enabled')
            && !body.includes('Ensure the Yomu userscript is running.');
    }, 8000, 'new-tab page stayed stuck in placeholder/loading state');
    const snapshot = await page.evaluate(() => ({
        title: document.title,
        brandHref: document.querySelector('.jpdb-reader-newtab-brand')?.getAttribute('href') ?? '',
        expression: document.querySelector('[data-newtab-expression]')?.textContent?.trim() ?? '',
        meaning: document.querySelector('[data-newtab-meaning]')?.textContent?.trim() ?? '',
        status: document.querySelector('[data-newtab-status]')?.textContent?.trim() ?? '',
        settingsButton: document.querySelector('[data-newtab-action="settings"]')?.textContent?.trim() ?? '',
        body: document.body.textContent ?? '',
    }));
    assertAudit(snapshot.title.includes('New Tab'), 'new-tab document title is missing');
    assertAudit(snapshot.brandHref === 'https://hrussellzfac023.github.io/yomu-reader/', 'new-tab brand link does not open the docs home page');
    assertAudit(/今日|今朝|今週|読む/.test(snapshot.expression), `new-tab did not render a top dictionary word: ${JSON.stringify(snapshot)}`);
    assertAudit(/today|morning|week|read/i.test(snapshot.meaning), `new-tab dictionary meaning did not render: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.status.includes('Dictionaries'), `new-tab did not report dictionary fallback source: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.settingsButton === 'Settings', 'new-tab settings button is missing');
    assertAudit(!/off|warning|No dictionary enabled/i.test(snapshot.body), 'new-tab still shows old warning/off copy');
    assertAudit(!consoleErrors.length && !pageErrors.length, `new-tab produced browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    await assertAccessibleSurface(page, 'new-tab dictionary fallback', '.jpdb-reader-newtab');
    await page.screenshot({ path: path.join(ARTIFACTS, 'newtab-dictionary.png'), fullPage: false });
    await page.close();
    record('new-tab dictionary fallback', 'pass', 'auto-enables and renders top local dictionary words without setup warnings');
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

async function assertTodayKanjiDrilldown(page) {
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-spelling')?.textContent?.includes('今日'), 6000, '今日 hover popup did not open before kanji drilldown');
    const pillHref = await page.locator('.jpdb-reader-jpdb-pill').first().getAttribute('href');
    assertAudit(pillHref?.includes('https://jpdb.io/vocabulary/'), 'JPDB pill is not the vocabulary open link');
    const kanjiButton = page.locator('.jpdb-reader-kanji-inline', { hasText: '今' }).first();
    await kanjiButton.click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-jpdb-kanji')?.textContent?.includes('Readings and components'), 9000, 'kanji drilldown did not show kanji details');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-kanjivg-svg path').length > 0, 9000, 'Stroke-order trace did not render');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-similar-word').length > 0, 9000, 'kanji used-in words did not render');
    await waitForAudit(
        page,
        () => /KANJIDIC|now|day|sun|book|read/.test(document.querySelector('.jpdb-reader-kanji')?.textContent ?? ''),
        9000,
        'local kanji dictionary section did not render',
    ).catch(async error => {
        const debug = await page.evaluate(() => ({
            sourceCards: [...document.querySelectorAll('.jpdb-reader-source-card')].map(node => ({
                classes: node.className,
                title: node.querySelector('summary')?.textContent?.trim() ?? '',
                text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
            })),
            hasDefinitionsMount: Boolean(document.querySelector('[data-kanji-definitions-mount]')),
            kanjiSectionHtml: document.querySelector('.jpdb-reader-kanji-section-stack')?.innerHTML.slice(0, 1200) ?? '',
        }));
        throw new Error(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify(debug)}`);
    });
    const kanjiSnapshot = await page.evaluate(() => ({
        kanjiPill: document.querySelector('.jpdb-reader-jpdb-pill')?.getAttribute('href') ?? '',
        jpdbKanjiText: document.querySelector('.jpdb-reader-jpdb-kanji')?.textContent ?? '',
        localKanjiText: document.querySelector('.jpdb-reader-kanji')?.textContent ?? '',
        originsText: document.querySelector('.jpdb-reader-origins')?.textContent ?? '',
        wordsUsingHeadings: [...document.querySelectorAll('.jpdb-reader-local-title')].filter(node => /Words using/i.test(node.textContent ?? '')).length,
        originNodes: document.querySelectorAll('.jpdb-reader-origin-graph-node').length,
        radicalCards: document.querySelectorAll('.jpdb-reader-radical-card').length,
        sourceLinks: document.querySelectorAll('.jpdb-reader-origin-sources a, .jpdb-reader-origins a[href*="kanjimap"], .jpdb-reader-origins a[href*="raw.githubusercontent"]').length,
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
    assertAudit(/Kanji facts|JLPT|Grade|Strokes/.test(kanjiSnapshot.originsText), 'kanji facts and origins panel is missing');
    assertAudit(!/RTK frame|Old forms|Character|Kanken/i.test(kanjiSnapshot.originsText), 'kanji facts panel is showing low-value legacy fields');
    assertAudit(kanjiSnapshot.wordsUsingHeadings === 1, 'kanji drilldown should have exactly one Words using section');
    assertAudit(kanjiSnapshot.originNodes > 1, 'kanji origins map did not render component nodes');
    assertAudit(kanjiSnapshot.radicalCards > 0, 'kanji radical card did not render');
    assertAudit(kanjiSnapshot.sourceLinks === 0, 'kanji origins should not expose raw source links in the popup');
    assertAudit(!kanjiSnapshot.historicalNotes, 'Wiktionary historical notes should stay hidden by default');
    assertAudit(kanjiSnapshot.kanjiVGPaths > 0, 'Stroke-order trace did not render');
    assertAudit(kanjiSnapshot.doodleCanvas, 'kanji drawing canvas did not render');
    assertAudit(kanjiSnapshot.componentButtons > 0, 'kanji components are not clickable');
    assertAudit(/KANJIDIC|now|day|sun|book|read/.test(kanjiSnapshot.localKanjiText), 'local kanji dictionary section is missing');
    assertAudit(kanjiSnapshot.similarWords > 0, 'kanji drilldown did not show JPDB used-in words');
    await assertAccessibleSurface(page, 'hover lookup kanji drilldown', '.jpdb-reader-popover');
    await page.screenshot({ path: path.join(ARTIFACTS, 'hover-lookup.png'), fullPage: false });
}

async function auditHoverLookup(browser, server) {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{font:24px/1.8 system-ui;margin:40px;color:#171a1f}
    </style></head><body><p>今日は静かな喫茶店で新しい本を読みました。明日は学校で勉強します。</p></body></html>`;
    const { page, requests } = await newAuditedPage(browser, {
        ...baseSettings,
        lookupOnClick: false,
        lookupOnHover: true,
        audioEnabled: true,
        autoPlayAudio: true,
        audioViaBlob: false,
        audioEnableDefaultSources: false,
        audioSources: [{ type: 'custom', url: 'https://audio.test/{term}.mp3', voice: '', enabled: true }],
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
    await page.addInitScript(() => {
        window.__yomuAudioPlayCount = 0;
        HTMLMediaElement.prototype.play = function play() {
            window.__yomuAudioPlayCount += 1;
            return Promise.resolve();
        };
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
    const todayWord = await page.locator('.jpdb-reader-word', { hasText: '今日' }).first().boundingBox();
    const quietWord = await page.locator('.jpdb-reader-word', { hasText: '静か' }).first().boundingBox();
    assertAudit(todayWord, 'no 今日 scanned word bounding box found');
    assertAudit(quietWord, 'no 静か scanned word bounding box found');
    await page.keyboard.down('Shift');
    const termAudioRequestsBefore = audioTestRequestCount(requests);
    const termAudioPlaysBefore = await audioPlayCount(page);
    await page.mouse.move(todayWord.x + todayWord.width / 2, todayWord.y + todayWord.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudioPlaybackOrRequest(
        page,
        requests,
        audioTestRequestCount,
        termAudioRequestsBefore,
        termAudioPlaysBefore,
        1800,
        'hover lookup did not start term audio playback',
    );
    const hoverHasBackdrop = await page.locator('.jpdb-reader-backdrop').count();
    assertAudit(hoverHasBackdrop === 0, 'hover lookup mounted a modal backdrop');
    const text = await page.locator('.jpdb-reader-popover').innerText();
    assertAudit(/JPDB|Add|Never|Blacklist/.test(text), 'hover popup did not render mining actions');
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'hover popup kept showing dictionary loading details');
    await waitForAudit(page, () => {
        const immersion = document.querySelector('[data-immersion-kit]');
        return !immersion || immersion.dataset.immersionEmpty === 'true' || immersion.querySelector('.jpdb-reader-example-card');
    }, 6000, 'hover popup Immersion Kit examples did not settle');
    const stableBefore = await page.locator('.jpdb-reader-popover').boundingBox();
    const searchesBeforeMove = immersionSearchRequestCount(requests);
    const parsesBeforeMove = jpdbParseRequestCount(requests);
    assertAudit(stableBefore, 'hover popup has no stable bounding box before movement');
    for (const fraction of [0.25, 0.5, 0.75, 0.45, 0.6]) {
        await page.mouse.move(todayWord.x + todayWord.width * fraction, todayWord.y + todayWord.height / 2, { steps: 3 });
    }
    await page.waitForTimeout(420);
    const stableAfter = await page.locator('.jpdb-reader-popover').boundingBox();
    assertAudit(stableAfter, 'hover popup disappeared after moving within the same word');
    assertAudit(await page.locator('.jpdb-reader-popover').count() === 1, 'moving inside one hovered word remounted multiple popups');
    assertAudit(await page.locator('[data-card-details-loading]').count() === 0, 'moving inside one hovered word restarted dictionary loading');
    assertAudit(immersionSearchRequestCount(requests) === searchesBeforeMove, 'moving inside one hovered word re-requested Immersion Kit examples');
    assertAudit(jpdbParseRequestCount(requests) === parsesBeforeMove, 'moving inside one hovered word re-parsed lookup content');
    assertAudit(Math.abs(stableAfter.y - stableBefore.y) < 24, `hover popup jumped vertically while staying on one word: ${stableBefore.y} -> ${stableAfter.y}`);
    await assertTodayKanjiDrilldown(page);
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the hover popup');
    await page.waitForTimeout(260);
    const reopenedAfterEscape = await page.locator('.jpdb-reader-popover').count();
    assertAudit(reopenedAfterEscape === 0, 'hover popup reopened immediately after Escape without pointer leaving the word');
    await page.mouse.move(8, 8);
    await page.mouse.move(quietWord.x + quietWord.width / 2, quietWord.y + quietWord.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const popoverBox = await page.locator('.jpdb-reader-popover').boundingBox();
    assertAudit(popoverBox, 'hover popup has no bounding box');
    await page.mouse.move(popoverBox.x + Math.min(24, popoverBox.width / 2), popoverBox.y + Math.min(24, popoverBox.height / 2));
    await page.waitForTimeout(260);
    assertAudit(await page.locator('.jpdb-reader-popover').count() === 1, 'hover popup closed while pointer was inside the panel');
    await page.keyboard.up('Shift');
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the hover popup before press-drag lookup');
    await page.mouse.move(todayWord.x + todayWord.width / 2, todayWord.y + todayWord.height / 2);
    await page.mouse.down();
    await page.mouse.move(quietWord.x + quietWord.width / 2, quietWord.y + quietWord.height / 2, { steps: 10 });
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await page.mouse.up();
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-popover').length === 1, 1200, 'press-drag lookup did not leave exactly one popup open');
    assertAudit(await page.locator('.jpdb-reader-backdrop').count() === 0, 'press-drag lookup opened a modal backdrop');
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the press-drag popup');
    await page.keyboard.up('Shift');
    await page.close();
    record('hold-key hover lookup', 'pass', 'Shift hover and press-drag lookup both open lightweight popups');
}

async function auditJpdbSearchCompatibility(browser) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        localDictionariesEnabled: true,
        lookupOnHover: true,
        scanModifierKey: '',
        showFloatingButton: false,
    });
    await page.route('https://jpdb.io/search**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
            body{margin:0;background:#171a1f;color:#f4f6fb;font:18px/1.9 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
            main{max-width:760px;margin:48px auto;padding:24px;border:1px solid #3b4250;border-radius:14px;background:#20242b}
            .result{padding:18px;border-bottom:1px solid #343a46}
            .subsection-spelling{font-size:30px;font-weight:800}
            .subsection-meanings{display:grid;gap:8px}
            .subsection-label{margin:0;color:#aab2c0;font-size:12px;text-transform:uppercase}
            .subsection{font-size:16px}
            button{width:100%!important;min-height:76px!important;padding:22px!important;border-radius:0!important}
            svg{width:160px!important;height:160px!important}
            ruby rt{color:#8da2c9}
        </style></head><body>
            <main>
                <h1>JPDB search fixture</h1>
                <div class="results search">
                    <div id="result-0">
                        <div class="result vocabulary">
                            <div class="subsection-spelling with-furigana">
                                <div class="primary-spelling"><div class="spelling"><div><ruby class="v">母<rt>はは</rt></ruby></div></div></div>
                            </div>
                            <div class="subsection-meanings">
                                <h6 class="subsection-label">Meanings</h6>
                                <div class="subsection"><div class="description">mother</div></div>
                            </div>
                        </div>
                    </div>
                    <div class="result">検索結果：<ruby>読む<rt>よむ</rt></ruby> 本と日本語を勉強します。</div>
                    <div class="result">今日は新しい本を読みました。</div>
                </div>
            </main>
        </body></html>`,
    }));
    await page.goto('https://jpdb.io/search?q=%E8%AA%AD%E3%82%80', { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await page.waitForSelector('.yomu-jpdb-local-dictionaries .structured-content', { timeout: 8000 }).catch(async error => {
        throw new Error(`local dictionaries did not render on JPDB search results: ${JSON.stringify(await jpdbLocalDictionaryDebug(page))}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-word').length >= 4, 10000, 'jpdb.io search fixture text was not scanned');
    await waitForAudit(page, () => [...document.querySelectorAll('ruby .jpdb-reader-word')].some(node => node.textContent?.includes('読')), 10000, 'native ruby word on jpdb.io was not wrapped for lookup');
    const scanSnapshot = await page.evaluate(() => {
        const decoratedTag = document.querySelector('.yomu-jpdb-local-dictionaries [data-sc-content="part-of-speech-info"]');
        return {
            words: document.querySelectorAll('.jpdb-reader-word').length,
            colored: document.querySelectorAll('.jpdb-reader-word[class*="jpdb-"]').length,
            furigana: document.querySelectorAll('.jpdb-reader-furi').length,
            nativeRubyWords: [...document.querySelectorAll('ruby .jpdb-reader-word')].map(node => node.textContent ?? ''),
            localText: document.querySelector('.yomu-jpdb-local-dictionaries')?.textContent ?? '',
            localGroups: document.querySelectorAll('.yomu-jpdb-local-dictionaries .jpdb-reader-dictionary-group').length,
            structuredLists: document.querySelectorAll('.yomu-jpdb-local-dictionaries .gloss-sc-ul[data-sc-content="glossary"]').length,
            decoratedTag: decoratedTag ? getComputedStyle(decoratedTag).textDecorationLine : '',
        };
    });
    assertAudit(scanSnapshot.colored >= 3, 'jpdb.io search words are not colored by status');
    assertAudit(scanSnapshot.furigana > 0, 'jpdb.io search non-ruby words did not receive furigana');
    assertAudit(scanSnapshot.nativeRubyWords.some(text => text.includes('読')), 'native ruby word on jpdb.io was not wrapped for lookup');
    assertAudit(scanSnapshot.localText.includes('Imported dictionaries') && scanSnapshot.localText.includes('mother; mama'), `local dictionaries did not render on JPDB search results: ${JSON.stringify(scanSnapshot)}`);
    assertAudit(scanSnapshot.localGroups >= 2, 'multiple local dictionaries were not grouped on JPDB search results');
    assertAudit(scanSnapshot.structuredLists >= 2, 'Yomitan structured glossary markup did not render on JPDB search results');
    assertAudit(scanSnapshot.decoratedTag.includes('underline'), 'imported Yomitan dictionary CSS did not apply to JPDB search entries');

    const readWord = page.locator('.jpdb-reader-word').filter({ hasText: '読む' }).first();
    await readWord.waitFor({ state: 'visible', timeout: 6000 });
    await readWord.scrollIntoViewIfNeeded();
    await readWord.click({ force: true });
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const buttonSnapshot = await page.evaluate(() => {
        const button = document.querySelector('.jpdb-reader-audio-control');
        const svg = button?.querySelector('svg');
        const buttonRect = button?.getBoundingClientRect();
        const svgRect = svg?.getBoundingClientRect();
        return {
            button: buttonRect ? { width: buttonRect.width, height: buttonRect.height } : null,
            svg: svgRect ? { width: svgRect.width, height: svgRect.height } : null,
        };
    });
    assertAudit((buttonSnapshot.button?.width ?? 999) <= 44 && (buttonSnapshot.button?.height ?? 999) <= 44, 'jpdb.io page CSS stretched the reader audio button');
    assertAudit((buttonSnapshot.svg?.width ?? 999) <= 24 && (buttonSnapshot.svg?.height ?? 999) <= 24, 'jpdb.io page CSS stretched the reader icon SVG');

    await page.locator('.jpdb-reader-kanji-inline').first().click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-kanji-display')?.textContent?.trim() === '読', 6000, 'kanji drilldown did not open on jpdb.io');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-kanjivg-svg path').length > 0, 9000, 'kanji stroke trace did not render on jpdb.io');
    await page.screenshot({ path: path.join(ARTIFACTS, 'jpdb-search-compat.png'), fullPage: false });
    await page.close();
    record('jpdb.io search compatibility', 'pass', 'native ruby, kanji drilldown, status colors, and reader control isolation work on jpdb.io');
}

async function auditJpdbPageAddons(browser) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        autoScanJapanese: false,
        scanVisiblePage: false,
        showFloatingButton: false,
        localDictionariesEnabled: true,
        ankiEnabled: true,
        immersionKitEnabled: true,
        immersionKitShowImages: true,
        immersionKitAutoPlayAudio: false,
        dictionaryPreferences: [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 },
            { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1 },
        ],
    });
    await page.route('https://jpdb.io/kanji/**', route => {
        const kanji = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '読');
        route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mockJpdbKanjiHtml(kanji) });
    });
    await page.route('https://jpdb.io/vocabulary/**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
            <main>
                <div class="result vocabulary">
                    <div class="vocabulary-spelling"><a href="/vocabulary/1/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a"><ruby>読<rt>よ</rt></ruby>む</a></div>
                    <div class="subsection-meanings">
                        <h6 class="subsection-label">Meanings</h6>
                        <div class="subsection">to read</div>
                    </div>
                </div>
            </main>
        </body></html>`,
    }));
    await page.route('https://jpdb.io/review**', route => {
        const url = new URL(route.request().url());
        const back = url.searchParams.has('r');
        route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: back
                ? `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
                    <nav class="menu"><div class="nav-item"><a>Learn (12)</a></div><div class="nav-item"><a>Decks</a></div></nav>
                    <div class="answer-box">
                        <input name="c" value="kb,読">
                        <div class="sentence blur">今日は本を読む。</div>
                        <div class="hbox"><div class="kanji">読</div></div>
                        <div><h6 class="subsection-label">Mnemonic</h6><div class="subsection"><div class="mnemonic">Remember read.</div></div></div>
                        <label id="show-checkbox-examples-label" for="show-checkbox-examples"><div>Click to toggle examples...</div></label>
                        <input class="show-hide-checkbox" type="checkbox" id="show-checkbox-examples" hidden>
                        <div class="hidden-body" hidden><p class="sentence">自分が面白いと思える本を読んでごらん。</p></div>
                    </div>
                </body></html>`
                : `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
                    <nav class="menu"><div class="nav-item"><a>Learn (12)</a></div><div class="nav-item"><a>Decks</a></div><div class="nav-item"><a>Settings</a></div></nav>
                    <button class="menu-icon">menu</button>
                    <div class="answer-box">
                        <input name="c" value="kb,読">
                        <div class="bugfix"><div class="kanji-keyword">read</div></div>
                    </div>
                </body></html>`,
        });
    });

    await page.goto('https://jpdb.io/kanji/%E8%AA%AD', { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await page.waitForSelector('#yomu-jpdb-uchisen img', { timeout: 8000 });
    await page.waitForSelector('#yomu-jpdb-rtk', { timeout: 8000 });
    await page.waitForSelector('#yomu-jpdb-immersion .jpdb-reader-example-card', { timeout: 8000 });
    let snapshot = await page.evaluate(() => ({
        uchisen: document.querySelector('#yomu-jpdb-uchisen')?.textContent ?? '',
        rtk: document.querySelector('#yomu-jpdb-rtk')?.textContent ?? '',
        immersion: document.querySelector('#yomu-jpdb-immersion')?.textContent ?? '',
        cards: document.querySelectorAll('.yomu-jpdb-addon-card').length,
    }));
    assertAudit(snapshot.uchisen.includes('QA Uchisen story') && snapshot.uchisen.includes('1/2'), 'Uchisen carousel did not render on kanji page');
    assertAudit(snapshot.rtk.includes('Heisig story') && snapshot.rtk.includes('QA story'), 'RTK panel did not render on kanji page');
    assertAudit(snapshot.immersion.includes('Immersion Kit') && snapshot.immersion.includes('Steins Gate'), 'Immersion Kit panel did not render on kanji page');
    assertAudit(snapshot.cards >= 3, 'JPDB kanji add-on cards are missing');
    await page.locator('#yomu-jpdb-uchisen [data-uchisen-action="next"]').click();
    await waitForAudit(page, () => document.querySelector('#yomu-jpdb-uchisen')?.textContent?.includes('2/2'), 3000, 'Uchisen next button did not update the carousel');
    await page.locator('#yomu-jpdb-uchisen [data-uchisen-action="star"]').click();
    await waitForAudit(page, () => document.querySelector('#yomu-jpdb-uchisen [data-uchisen-action="star"]')?.textContent?.includes('★'), 3000, 'Uchisen star button did not persist favorite state');
    await page.screenshot({ path: path.join(ARTIFACTS, 'jpdb-addons-kanji.png'), fullPage: false });

    await page.goto('https://jpdb.io/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a', { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await page.waitForSelector('.yomu-jpdb-local-dictionaries', { timeout: 8000 }).catch(async error => {
        throw new Error(`local dictionaries did not render on JPDB vocabulary page: ${JSON.stringify(await jpdbLocalDictionaryDebug(page))}: ${error instanceof Error ? error.message : String(error)}`);
    });
    snapshot = await page.evaluate(() => ({
        local: document.querySelector('.yomu-jpdb-local-dictionaries')?.textContent ?? '',
        immersion: document.querySelector('#yomu-jpdb-immersion')?.textContent ?? '',
    }));
    assertAudit(snapshot.local.includes('Imported dictionaries') && snapshot.local.includes('to read'), `local imported dictionary entries did not render on JPDB vocabulary page: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.immersion.includes('Immersion Kit'), 'Immersion Kit did not render on JPDB vocabulary page');

    await page.goto('https://jpdb.io/review?c=kb,%E8%AA%AD', { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('#yomu-jpdb-doodle-root canvas', { timeout: 8000 });
    snapshot = await page.evaluate(() => ({
        nav: document.querySelector('.menu .nav-item:first-child')?.textContent ?? '',
        hiddenItems: [...document.querySelectorAll('.menu .nav-item:not(:first-child), .menu-icon')].every(el => getComputedStyle(el).display === 'none'),
        canvas: Boolean(document.querySelector('#yomu-jpdb-doodle-root canvas')),
    }));
    assertAudit(snapshot.nav.includes('Items left') && snapshot.hiddenItems, 'review navigation tweak did not apply');
    assertAudit(snapshot.canvas, 'kanji doodle canvas did not render on review front');
    const box = await page.locator('#yomu-jpdb-doodle-root canvas').boundingBox();
    assertAudit(box, 'doodle canvas has no bounding box');
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 120, { steps: 8 });
    await page.mouse.up();

    await page.goto('https://jpdb.io/review?c=kb,%E8%AA%AD&r=1', { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await waitForAudit(page, () => !document.querySelector('.sentence.blur'), 4000, 'answer sentence stayed blurred');
    await page.waitForSelector('#yomu-jpdb-doodle-preview img', { timeout: 8000 });
    snapshot = await page.evaluate(() => ({
        sentenceBlurred: Boolean(document.querySelector('.sentence.blur')),
        preview: Boolean(document.querySelector('#yomu-jpdb-doodle-preview img')),
        uchisen: Boolean(document.querySelector('#yomu-jpdb-uchisen')),
        rtk: Boolean(document.querySelector('#yomu-jpdb-rtk')),
        examplesVisible: !document.querySelector('.hidden-body')?.hasAttribute('hidden') && document.querySelector('.hidden-body')?.textContent?.includes('読んでごらん'),
    }));
    assertAudit(!snapshot.sentenceBlurred, 'auto reveal did not unblur the review answer sentence');
    assertAudit(snapshot.preview, 'kanji doodle preview did not carry to review back');
    assertAudit(snapshot.uchisen && snapshot.rtk, 'kanji review back did not render Uchisen and RTK panels');
    assertAudit(snapshot.examplesVisible, 'JPDB review examples were not opened by default');
    await page.screenshot({ path: path.join(ARTIFACTS, 'jpdb-addons-review.png'), fullPage: false });

    await page.close();
    record('jpdb.io page add-ons', 'pass', 'Uchisen, RTK, Immersion Kit, dictionaries, review UI, auto reveal, and doodle all work on JPDB fixtures');
}

async function auditImmersionKitPopover(browser, server) {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{font:24px/1.8 system-ui;margin:40px;color:#171a1f}
    </style></head><body><p>今日は静かな喫茶店で新しい本を読みました。</p></body></html>`;
    const { page, requests } = await newAuditedPage(browser, {
        ...baseSettings,
        localDictionariesEnabled: true,
        ankiEnabled: true,
        immersionKitEnabled: true,
        immersionKitShowTranslation: false,
        immersionKitShowImages: true,
        immersionKitAutoPlayAudio: false,
        immersionKitPlayOnHover: true,
    });
    await page.addInitScript(() => {
        window.__yomuAudioPlayCount = 0;
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function play(...args) {
            window.__yomuAudioPlayCount += 1;
            return originalPlay.apply(this, args);
        };
    });
    await page.route(`${server.origin}/immersion-fixture.html`, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
    }));
    await page.goto(`${server.origin}/immersion-fixture.html`, { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-word').length > 0, 10000, 'fixture text was not scanned');
    await page.locator('.jpdb-reader-word').filter({ hasText: '読みました' }).first().click();
    await page.waitForSelector('[data-immersion-kit] .jpdb-reader-example-card', { timeout: 8000 });
    await waitForAudit(page, () => {
        const image = document.querySelector('.jpdb-reader-example-image');
        return image && image.complete && image.naturalWidth > 0;
    }, 6000, 'Immersion Kit thumbnail did not render');
    const firstSnapshot = await page.evaluate(() => ({
        sectionText: document.querySelector('[data-immersion-kit]')?.textContent ?? '',
        exampleWords: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-word').length,
        translationVisible: Boolean(document.querySelector('.jpdb-reader-example-translation')),
        imageVisible: Boolean(document.querySelector('.jpdb-reader-example-image')),
        localDefinitionWords: document.querySelectorAll('.jpdb-reader-local-glossary .jpdb-reader-word').length,
        hasAnkiEdit: Boolean(document.querySelector('[data-action="anki-edit"]')),
        hasAddToAnki: Boolean(document.querySelector('[data-action="anki"]')),
        ankiExisting: document.querySelector('.jpdb-reader-anki-existing')?.textContent ?? '',
    }));
    assertAudit(firstSnapshot.sectionText.includes('Immersion Kit'), 'Immersion Kit section is missing');
    assertAudit(firstSnapshot.exampleWords >= 2, 'Immersion Kit sentence is not recursively tokenized');
    assertAudit(!firstSnapshot.translationVisible, 'Immersion Kit translations are visible despite the default-off setting');
    assertAudit(firstSnapshot.imageVisible, 'Immersion Kit thumbnail did not render');
    assertAudit(firstSnapshot.localDefinitionWords >= 0, 'local dictionary recursive parsing did not run');
    assertAudit(firstSnapshot.hasAnkiEdit && !firstSnapshot.hasAddToAnki, 'existing Anki card did not replace Add to Anki with Edit in Anki');
    assertAudit(firstSnapshot.ankiExisting.includes('Anime Mining') && firstSnapshot.ankiExisting.includes('今日は本を読む'), 'existing Anki card preview did not render deck and sentence context');
    const audioRequestsBeforeHover = immersionAudioRequestCount(requests);
    const audioPlaysBeforeHover = await audioPlayCount(page);
    await page.locator('.jpdb-reader-example-card').hover();
    await waitForAudioPlaybackOrRequest(
        page,
        requests,
        immersionAudioRequestCount,
        audioRequestsBeforeHover,
        audioPlaysBeforeHover,
        6000,
        'Immersion Kit hover did not request first example audio',
    );
    const audioRequestsAfterHover = immersionAudioRequestCount(requests);
    const audioPlaysAfterHover = await audioPlayCount(page);
    await page.dispatchEvent('.jpdb-reader-example-card', 'pointerover', { pointerType: 'mouse', bubbles: true });
    await page.waitForTimeout(250);
    assertAudit(immersionAudioRequestCount(requests) === audioRequestsAfterHover, 'Immersion Kit hover audio should only auto-play once');
    assertAudit(await audioPlayCount(page) === audioPlaysAfterHover, 'Immersion Kit hover audio should only call play once');
    await page.locator('.jpdb-reader-btn.easy').click();
    await waitForNodeAudit(() => requests.some(request => request.action === 'answerCards'), 6000, 'Anki grading did not send through AnkiConnect');
    const reviewToastCount = await page.locator('.jpdb-reader-toast').filter({ hasText: 'review sent' }).count();
    assertAudit(reviewToastCount === 0, 'grading should not show a low-value review sent toast');
    await page.locator('[data-immersion-action="next"]').click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-example-card')?.getAttribute('data-immersion-sentence')?.includes('新しい本'), 6000, 'Immersion Kit next example did not update');
    await page.locator('[data-immersion-kit] .jpdb-reader-word').filter({ hasText: '本' }).first().click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-spelling')?.textContent?.includes('本'), 6000, 'word inside Immersion Kit example did not open a nested popup lookup');
    await page.locator('[data-action="anki"]').click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-toast')?.textContent?.includes('context image'), 6000, 'Add to Anki did not use the active Immersion Kit context');
    assertAudit(requests.some(request => request.url.includes('apiv2.immersionkit.com/search')), 'Immersion Kit API was not requested');
    assertAudit(requests.some(request => request.url.includes('127.0.0.1:8765')), 'AnkiConnect was not queried for existing card state');
    assertAudit(requests.some(request => request.action === 'answerCards'), 'Anki grading request was not sent');
    const addNoteRequests = requests.filter(request => request.action === 'addNote');
    assertAudit(addNoteRequests.some(request => request.ankiSentence?.includes('新しい本') && request.ankiHasPicture), `Anki addNote did not include the selected Immersion Kit sentence and image: ${JSON.stringify(addNoteRequests)}`);
    await assertAccessibleSurface(page, 'Immersion Kit popup examples', '.jpdb-reader-popover');
    await page.screenshot({ path: path.join(ARTIFACTS, 'immersion-kit-popover.png'), fullPage: false });
    const audioRequestsBeforeManual = immersionAudioRequestCount(requests);
    const audioPlaysBeforeManual = await audioPlayCount(page);
    await page.locator('[data-immersion-action="audio"]').click();
    await waitForAudioPlaybackOrRequest(
        page,
        requests,
        immersionAudioRequestCount,
        audioRequestsBeforeManual,
        audioPlaysBeforeManual,
        6000,
        'Immersion Kit manual audio button did not request audio after hover autoplay',
    );
    await page.close();
    record('Immersion Kit popup examples', 'pass', 'examples render in-card and nested words open lookup');
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
    await assertAccessibleSurface(page, 'OCR lookup popup', '.jpdb-reader-popover');
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
            main{display:grid;grid-template-columns:2fr 1fr;gap:18px}
            section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
            aside{display:grid;gap:12px}
            ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model{display:block;border:1px solid #333;border-radius:8px;padding:12px;background:#181818}
            #video-title{display:block;color:white;text-decoration:none;font-weight:700}
        </style></head><body><main>
            <section aria-label="home feed">
                <ytd-rich-item-renderer data-case="jp"><a id="video-title" href="/watch?v=jp" aria-label="日本語で花の名前を覚える">日本語で花の名前を覚える</a></ytd-rich-item-renderer>
                <ytd-rich-item-renderer data-case="english"><a id="video-title" href="/watch?v=en" aria-label="10 habits for studying">10 habits for studying</a></ytd-rich-item-renderer>
                <ytd-video-renderer data-case="search-english"><h3><a href="/watch?v=search">How to arrange flowers</a></h3></ytd-video-renderer>
                <yt-lockup-view-model data-case="lockup-jp"><a class="yt-lockup-metadata-view-model-wiz__title" href="/watch?v=lockup">東京カフェで朝ごはん</a></yt-lockup-view-model>
            </section>
            <aside aria-label="recommendations">
                <ytd-compact-video-renderer data-case="mixed"><a id="video-title" href="/watch?v=mix" title="東京カフェで朝ごはん">東京カフェで朝ごはん</a></ytd-compact-video-renderer>
                <ytd-compact-video-renderer data-case="sidebar-english"><a id="video-title" href="/watch?v=side">latest tech news</a></ytd-compact-video-renderer>
                <ytd-rich-item-renderer data-case="channel-only"><a id="video-title" href="/watch?v=channel">study with me</a><span id="channel-name">日本語チャンネル</span></ytd-rich-item-renderer>
            </aside>
        </main></body></html>`,
    }));
    await page.goto('https://www.youtube.com/yomu-filter-test', { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length >= 2, 6000, 'YouTube filter did not hide non-Japanese fixture cards');
    const hidden = await page.evaluate(() => ({
        jpHidden: document.querySelector('[data-case="jp"]')?.classList.contains('jpdb-youtube-filtered') ?? true,
        englishHidden: document.querySelector('[data-case="english"]')?.classList.contains('jpdb-youtube-filtered') ?? false,
        mixedHidden: document.querySelector('[data-case="mixed"]')?.classList.contains('jpdb-youtube-filtered') ?? true,
        lockupHidden: document.querySelector('[data-case="lockup-jp"]')?.classList.contains('jpdb-youtube-filtered') ?? true,
        searchEnglishHidden: document.querySelector('[data-case="search-english"]')?.classList.contains('jpdb-youtube-filtered') ?? false,
        sidebarEnglishHidden: document.querySelector('[data-case="sidebar-english"]')?.classList.contains('jpdb-youtube-filtered') ?? false,
        channelOnlyHidden: document.querySelector('[data-case="channel-only"]')?.classList.contains('jpdb-youtube-filtered') ?? false,
        barText: document.querySelector('.jpdb-youtube-filter-bar')?.textContent ?? '',
        hiddenCount: document.querySelectorAll('.jpdb-youtube-filtered').length,
    }));
    assertAudit(hidden.jpHidden === false, 'Japanese YouTube card was hidden');
    assertAudit(hidden.mixedHidden === false, 'Japanese mixed YouTube card was hidden');
    assertAudit(hidden.lockupHidden === false, 'Japanese lockup card was hidden');
    assertAudit(hidden.englishHidden === true, 'English YouTube card stayed visible');
    assertAudit(hidden.searchEnglishHidden === true, 'English search card stayed visible');
    assertAudit(hidden.sidebarEnglishHidden === true, 'English sidebar recommendation stayed visible');
    assertAudit(hidden.channelOnlyHidden === true, 'Channel-only Japanese text should not keep an English title visible');
    assertAudit(/hid 4/.test(hidden.barText), 'YouTube filter notice did not report hidden cards');
    assertAudit(/Show anyway/.test(hidden.barText), 'YouTube filter notice is missing the Show anyway escape hatch');
    if (await page.locator('.jpdb-reader-backdrop').count()) {
        await page.keyboard.press('Escape');
        await waitForAudit(page, () => !document.querySelector('.jpdb-reader-backdrop'), 2000, 'Escape did not clear reader backdrop before YouTube filter actions');
    }
    await page.locator('.jpdb-youtube-filter-bar [data-action="show-anyway"]').click();
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length === 0, 4000, 'Show anyway did not reveal filtered YouTube cards');
    await page.locator('.jpdb-youtube-filter-bar [data-action="show-anyway"]').click();
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length === 4, 4000, 'Filter again did not hide YouTube cards');
    await page.keyboard.press('Alt+Y');
    await waitForAudit(page, () => !document.querySelector('.jpdb-youtube-filter-bar') && document.querySelectorAll('.jpdb-youtube-filtered').length === 0, 4000, 'YouTube filter shortcut did not disable filtering');
    await page.keyboard.press('Alt+Y');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-youtube-filtered').length === 4, 4000, 'YouTube filter shortcut did not re-enable filtering');
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
        const buttons = [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => ({
            action: button.getAttribute('data-action') ?? '',
            label: button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '',
        }));
        const primaryStyle = primary ? getComputedStyle(primary) : null;
        return {
            hidden: root?.hidden,
            rect: rect ? { width: rect.width, height: rect.height, bottom: rect.bottom } : null,
            buttons,
            menuHidden: document.querySelector('.jpdb-subtitle-menu')?.hasAttribute('hidden'),
            visibleFileInputs: document.querySelectorAll('.jpdb-subtitle-player input[type="file"]:not([hidden])').length,
            transcriptVisible: Boolean(document.querySelector('.jpdb-subtitle-list:not([hidden])')),
            obsoleteStatusText: document.body.textContent?.includes('No loaded Japanese subtitle lines.') ?? false,
            subtitleText: primary?.textContent ?? '',
            subtitleBackground: `${primaryStyle?.backgroundColor ?? ''} ${primaryStyle?.backgroundImage ?? ''}`,
            subtitleWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
        };
    });
    assertAudit(snapshot.hidden === false, 'subtitle player is hidden on a page with video');
    assertAudit((snapshot.rect?.width ?? 0) > 200, 'subtitle player is not laid out');
    assertAudit(snapshot.buttons.some(button => button.action === 'list' && /transcript/i.test(button.label)) && snapshot.buttons.some(button => button.action === 'menu') && snapshot.buttons.some(button => button.action === 'tracks'), 'subtitle icon controls are missing');
    assertAudit(snapshot.visibleFileInputs === 0, 'subtitle file inputs are visible over the video');
    assertAudit(!snapshot.transcriptVisible, 'transcript panel should be off by default');
    assertAudit(!snapshot.obsoleteStatusText, 'obsolete no-subtitle status text is visible over the controls');
    assertAudit(snapshot.subtitleText.includes('今日') && snapshot.subtitleText.includes('読'), 'subtitle fixture cue is not visible');
    assertAudit(snapshot.subtitleWords > 0, 'subtitle cue is not token-highlighted');
    assertAudit(snapshot.subtitleBackground.includes('rgba'), 'subtitle readable background is not applied');
    await page.locator('.jpdb-subtitle-rail button[data-action="menu"]').click();
    await waitForAudit(page, () => {
        const menu = document.querySelector('.jpdb-subtitle-menu');
        return menu && !menu.hasAttribute('hidden') && menu.textContent?.includes('Open transcript panel');
    }, 3000, 'subtitle overflow menu did not offer transcript toggle');
    await page.locator('.jpdb-subtitle-menu button[data-action="list"]').click();
    await waitForAudit(page, () => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return panel && !panel.hasAttribute('hidden') && panel.textContent?.includes('Transcript') && panel.querySelector('.jpdb-subtitle-list-row.active');
    }, 3000, 'transcript panel did not open with active-line highlighting');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-subtitle-list .jpdb-reader-word').length > 0, 8000, 'transcript rows did not hydrate into lookup words');
    const desktopTranscriptLayout = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        const video = document.querySelector('video')?.getBoundingClientRect();
        if (!panel || !video) return null;
        return {
            panelLeft: panel.left,
            panelRight: panel.right,
            panelTop: panel.top,
            panelBottom: panel.bottom,
            videoLeft: video.left,
            videoRight: video.right,
            videoTop: video.top,
            videoBottom: video.bottom,
        };
    });
    assertAudit(Boolean(desktopTranscriptLayout), 'desktop transcript layout could not be measured');
    assertAudit(
        desktopTranscriptLayout.panelTop >= desktopTranscriptLayout.videoBottom - 4
            || desktopTranscriptLayout.panelRight <= desktopTranscriptLayout.videoLeft + 4
            || desktopTranscriptLayout.panelLeft >= desktopTranscriptLayout.videoRight - 4,
        `desktop transcript panel overlaps the video instead of sitting beside or below it: ${JSON.stringify(desktopTranscriptLayout)}`,
    );
    await page.screenshot({ path: path.join(ARTIFACTS, 'video-fixture.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const mobileTranscript = await waitForAudit(page, () => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const rect = panel?.getBoundingClientRect();
        if (!panel || panel.hasAttribute('hidden') || !rect) return false;
        return {
            width: rect.width,
            top: rect.top,
            bottom: rect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
        };
    }, 3000, 'mobile transcript panel did not stay visible');
    assertAudit(mobileTranscript.width >= mobileTranscript.viewportWidth - 24 && mobileTranscript.top > mobileTranscript.viewportHeight * 0.42, `mobile transcript panel is not bottom-sheet sized: ${JSON.stringify(mobileTranscript)}`);
    await assertAccessibleSurface(page, 'subtitle player fixture', '.jpdb-subtitle-player');
    await page.screenshot({ path: path.join(ARTIFACTS, 'video-fixture-mobile.png'), fullPage: false });
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
        await runAudit('new-tab dictionary fallback', () => auditNewTabDictionaryFallback(browser, server));
        await runAudit('Bloomee auto page scan', () => auditBloomeeAutoScan(browser), { requiresApiKey: true });
        await runAudit('hold-key hover lookup', () => auditHoverLookup(browser, server), { requiresApiKey: true });
        await runAudit('jpdb.io search compatibility', () => auditJpdbSearchCompatibility(browser), { requiresApiKey: true });
        await runAudit('jpdb.io page add-ons', () => auditJpdbPageAddons(browser), { requiresApiKey: true });
        await runAudit('Immersion Kit popup examples', () => auditImmersionKitPopover(browser, server), { requiresApiKey: true });
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
