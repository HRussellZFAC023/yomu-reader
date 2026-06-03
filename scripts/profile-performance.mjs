#!/usr/bin/env node
import { chromium } from 'playwright';
import process from 'node:process';
import { readFile } from 'node:fs/promises';

const ORIGIN = process.env.YOMU_PROFILE_ORIGIN || 'http://127.0.0.1:5175';
const SLOW_MS = Number(process.env.YOMU_PROFILE_SLOW_MS || 4500);
const LIVE = process.env.YOMU_PROFILE_LIVE === '1';
const API_KEY = process.env.YOMU_PROFILE_API_KEY || process.env.YOMU_TEST_API_KEY || '';
const USERSCRIPT_PATH = new URL('../dist/yomu.user.js', import.meta.url);
const IMMERSION_API_HOSTS = new Set(['apiv2express.immersionkit.com', 'apiv2.immersionkit.com']);
const PROFILE_FIXTURE_PATH = '/__yomu-profile-fixture/';
const HOVER_WORD = '読みました';
const CLICK_WORD = '今日';

if (LIVE && !API_KEY) {
    console.error('Live profiling needs YOMU_PROFILE_API_KEY or YOMU_TEST_API_KEY so JPDB parse can run against the real API.');
    process.exit(2);
}

const settings = {
    apiKey: API_KEY || 'profile-key',
    onboardingSeen: true,
    enableLogging: true,
    jpdbDefinitionsEnabled: true,
    rtkEnabled: true,
    kanjivgEnabled: true,
    kanjiOriginsEnabled: true,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginGraphEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: true,
    audioViaBlob: true,
    audioTimeoutMs: 8000,
    audioSelectionMode: 'first',
    audioSources: LIVE
        ? [
            { type: 'jpod101', url: '', voice: '', enabled: true },
            { type: 'language-pod-101', url: '', voice: '', enabled: true },
            { type: 'jisho', url: '', voice: '', enabled: true },
        ]
        : [{ type: 'custom-json', url: 'https://audio.profile.test/source?term={term}&reading={reading}', voice: '', enabled: true }],
    audioEnableDefaultSources: LIVE,
    immersionKitEnabled: true,
    immersionKitLimit: 3,
    immersionKitMinLength: 4,
    immersionKitMaxLength: 80,
    immersionKitCategory: 'all',
    immersionKitSort: 'sentence_length:asc',
    immersionKitExactMatch: false,
    immersionKitShowTranslation: false,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlaybackRate: 1,
    localDictionariesEnabled: true,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    dictionaryPreferences: [
        { name: 'Profile Local', alias: 'Profile Local', enabled: true, priority: 0 },
        { name: 'Profile Pitch', alias: 'Profile Pitch', enabled: true, priority: 1 },
        { name: 'Profile Kanji', alias: 'Profile Kanji', enabled: true, priority: 2 },
    ],
    lookupOnClick: true,
    lookupOnHover: true,
    popupActivationMode: 'click',
    showFloatingButton: false,
    interfaceLanguage: 'auto',
    accentColor: '#5ea780',
    theme: 'auto',
    popupMode: 'auto',
    ankiEnabled: false,
    enableReviews: true,
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

const vocabulary = [
    ['今日', 'きょう', 'today', ['n'], 100],
    ['静か', 'しずか', 'quiet', ['adj-na'], 1700],
    ['喫茶店', 'きっさてん', 'coffee shop', ['n'], 2400],
    ['新しい', 'あたらしい', 'new', ['adj-i'], 700],
    ['本', 'ほん', 'book', ['n'], 350],
    ['読みました', 'よみました', 'read', ['v5m'], 401, '読む'],
    ['読む', 'よむ', 'to read', ['v5m'], 400],
    ['日本語', 'にほんご', 'Japanese language', ['n'], 250],
].map(([surface, reading, gloss, partOfSpeech, frequency, spelling]) => ({ surface, spelling: spelling ?? surface, reading, gloss, partOfSpeech, frequency }));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const requests = [];
const logs = [];

page.on('console', message => logs.push({ type: message.type(), text: message.text() }));
page.on('request', request => requests.push({ url: request.url(), method: request.method(), start: performance.now() }));
page.on('response', response => {
    const entry = requests.find(item => item.url === response.url() && item.status === undefined);
    if (entry) {
        entry.status = response.status();
        entry.end = performance.now();
    }
});
page.on('requestfailed', request => {
    const entry = requests.find(item => item.url === request.url() && item.status === undefined);
    if (entry) {
        entry.status = 'failed';
        entry.failure = request.failure()?.errorText ?? 'failed';
        entry.end = performance.now();
    }
});

await page.exposeFunction('__yomuProfileRequest', profileBridgeRequest);

async function profileBridgeRequest(request) {
    const started = performance.now();
    const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: profileRequestBody(request.data),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    requests.push({
        method: request.method,
        url: request.url,
        status: response.status,
        start: started,
        end: performance.now(),
        viaUserscriptBridge: true,
    });
    return {
        status: response.status,
        responseText: buffer.toString('utf8'),
        bytes: [...buffer],
        contentType: response.headers.get('content-type') ?? '',
    };
}

function profileRequestBody(body) {
    if (body?.kind === 'arraybuffer') return profileArrayBuffer(body);
    if (body?.kind === 'formdata') return profileFormDataBody(body);
    return body;
}

function profileArrayBuffer(body) {
    return Buffer.from(body.bytes ?? []);
}

function profileFormDataBody(body) {
    return profileFormData(body.entries ?? []);
}

function profileFormData(entries) {
    const formData = new FormData();
    for (const entry of entries) appendProfileFormDataEntry(formData, entry);
    return formData;
}

function appendProfileFormDataEntry(formData, entry) {
    if (entry.blob) {
        formData.append(entry.name, profileBlob(entry.blob), profileBlobFilename(entry.blob));
        return;
    }
    formData.append(entry.name, entry.value ?? '');
}

function profileBlob(blob) {
    return new Blob([Buffer.from(blob.bytes ?? [])], { type: blob.type || 'application/octet-stream' });
}

function profileBlobFilename(blob) {
    return blob.filename || 'file';
}

await page.addInitScript(({ settings, live }) => {
    localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify(settings));
    window.__yomuProfileEvents = [];
    const push = (name, detail = {}) => window.__yomuProfileEvents.push({ name, t: performance.now(), detail });
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
        push('audio.play', { src: this.currentSrc || this.src || '' });
        return originalPlay.call(this).catch(error => {
            push('audio.play.failed', { message: String(error?.message || error) });
            throw error;
        });
    };
    if (!live) return;

    const serializeBody = async data => {
        if (data instanceof ArrayBuffer) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data)] };
        if (data instanceof Blob) return { kind: 'arraybuffer', bytes: [...new Uint8Array(await data.arrayBuffer())] };
        if (data instanceof FormData) {
            const entries = [];
            for (const [name, value] of data.entries()) {
                if (value instanceof Blob) {
                    entries.push({ name, blob: { bytes: [...new Uint8Array(await value.arrayBuffer())], type: value.type, filename: value.name || 'blob' } });
                } else {
                    entries.push({ name, value: String(value) });
                }
            }
            return { kind: 'formdata', entries };
        }
        return data;
    };
    window.GM_xmlhttpRequest = options => {
        Promise.resolve(serializeBody(options.data)).then(data => window.__yomuProfileRequest({
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
            options.onload?.({ status: result.status, response, responseText: result.responseText });
        }).catch(error => options.onerror?.(error));
    };
}, { settings, live: LIVE });

if (!LIVE) await page.route('**/*', mockProfileRoute);

async function mockProfileRoute(route) {
    const url = new URL(route.request().url());
    const response = await profileRouteResponse(route, url);
    if (response) return route.fulfill(response);
    return route.continue();
}

async function profileRouteResponse(route, url) {
    for (const handler of PROFILE_ROUTE_HANDLERS) {
        const response = await handler(route, url);
        if (response) return response;
    }
    return null;
}

const PROFILE_ROUTE_HANDLERS = [
    profileFixtureResponse,
    jpdbParseProfileResponse,
    jpdbKanjiProfileResponse,
    githubRawProfileResponseAdapter,
    uchisenProfileResponse,
    immersionSearchProfileResponse,
    immersionMediaProfileResponse,
    audioProfileResponseAdapter,
];

function profileFixtureResponse(_route, url) {
    if (url.origin === new URL(ORIGIN).origin && url.pathname === PROFILE_FIXTURE_PATH) {
        return {
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: profileFixtureHtml(),
        };
    }
    return null;
}

async function jpdbParseProfileResponse(route, url) {
    if (url.hostname === 'jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = JSON.parse(route.request().postData() || '{}');
        return { status: 200, contentType: 'application/json', body: JSON.stringify(mockParse(body)) };
    }
    return null;
}

async function jpdbKanjiProfileResponse(_route, url) {
    if (url.hostname === 'jpdb.io' && url.pathname.startsWith('/kanji/')) {
        await delay(SLOW_MS);
        const kanji = decodeURIComponent(url.pathname.split('/').pop() || '読');
        return { status: 200, contentType: 'text/html; charset=utf-8', body: mockKanjiHtml(kanji) };
    }
    return null;
}

function githubRawProfileResponseAdapter(_route, url) {
    if (url.hostname === 'raw.githubusercontent.com') {
        return githubRawProfileResponse(url);
    }
    return null;
}

function uchisenProfileResponse(_route, url) {
    if (url.hostname === 'hrussellzfac023.github.io') {
        return { status: 200, contentType: 'text/html; charset=utf-8', body: '<html><body><div class="entry"><h2>read</h2><p>Elements: 言, 売</p></div></body></html>' };
    }
    return null;
}

async function immersionSearchProfileResponse(_route, url) {
    if (isImmersionApiUrl(url, '/search')) {
        await delay(SLOW_MS);
        return { status: 200, contentType: 'application/json', body: JSON.stringify({ examples: [{ id: 'anime_profile_1', title: 'profile', sentence: '今日は本を読みました。', image: 'profile.jpg', sound: 'profile.mp3' }] }) };
    }
    return null;
}

function immersionMediaProfileResponse(_route, url) {
    if (isImmersionApiUrl(url, '/download_media')) {
        return { status: 200, contentType: url.search.includes('.mp3') ? 'audio/mpeg' : 'image/png', body: 'media' };
    }
    return null;
}

function audioProfileResponseAdapter(_route, url) {
    if (url.hostname === 'audio.profile.test') {
        return audioProfileResponse(url);
    }
    return null;
}

function githubRawProfileResponse(url) {
    const svg = url.pathname.endsWith('.svg');
    return { status: 200, contentType: svg ? 'image/svg+xml' : 'application/json', body: svg ? mockKanjiVgSvg() : JSON.stringify(mockKanjiMap()) };
}

async function audioProfileResponse(url) {
    await delay(SLOW_MS);
    if (url.pathname === '/source') {
        return { status: 200, contentType: 'application/json', body: JSON.stringify({ audioSources: [{ url: 'https://audio.profile.test/file.mp3' }] }) };
    }
    return { status: 200, contentType: 'audio/mpeg', body: 'audio' };
}

const profileUrl = new URL(`${ORIGIN.replace(/\/$/, '')}/newtab/index.html`);
profileUrl.searchParams.set('apiKey', API_KEY || 'profile-key');
if (!LIVE) profileUrl.searchParams.set('audio', 'https://audio.profile.test/source?term={term}&reading={reading}');
const profileTarget = await openProfileTarget(page, profileUrl);
if (profileTarget.skipped) {
    console.log(JSON.stringify({
        skipped: true,
        reason: profileTarget.reason,
        origin: ORIGIN,
        live: LIVE,
        attempts: profileTarget.attempts,
        pageDebug: profileTarget.pageDebug,
        actionable: LIVE
            ? 'Start the configured YOMU_PROFILE_ORIGIN newtab page or run without YOMU_PROFILE_LIVE=1 so the harness can use its deterministic fixture.'
            : 'Run npm run build first so dist/yomu.user.js exists, then rerun the profiler. The mock fixture is available at /__yomu-profile-fixture/.',
    }, null, 2));
    await browser.close();
    process.exit(0);
}

const hoverProfile = await profileHoverPopover(page);

const clickWord = await profileWordLocator(page, CLICK_WORD);
await page.evaluate(() => { window.__yomuProfileEvents = []; });
const clickAt = await page.evaluate(() => performance.now());
await clickWord.click();
await page.waitForSelector('.jpdb-reader-popover', { timeout: 10000 });
const popoverAt = await page.evaluate(() => performance.now());
const dictionaryShellDebug = await popoverDebugSnapshot(page);
const dictionaryDetails = await waitForDictionaryDetails(page, clickAt, popoverAt);
const localDictionaryLoaded = await page.waitForFunction(() => /profile local (?:today|to read|read politely)/.test(document.querySelector('.jpdb-reader-popover')?.textContent || ''), null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
const localDictionaryAt = localDictionaryLoaded ? await page.evaluate(() => performance.now()) : null;
const localDictionaryDebug = localDictionaryLoaded ? null : await page.evaluate(() => ({
    text: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
    dictionaries: [...document.querySelectorAll('.jpdb-reader-local-glossary')].map(node => ({
        dictionary: node.getAttribute('data-dictionary'),
        text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
    })),
}));
await page.waitForFunction(() => window.__yomuProfileEvents.some(event => event.name === 'audio.play' || event.name === 'audio.play.failed'), null, { timeout: 12000 }).catch(() => {});
const audioAt = await page.evaluate(() => window.__yomuProfileEvents.find(event => event.name.startsWith('audio.play'))?.t ?? null);

const kanjiClickAt = await page.evaluate(() => performance.now());
await page.locator('.jpdb-reader-kanji-inline').first().click();
await page.waitForSelector('.jpdb-reader-kanji-display', { timeout: 5000 });
const kanjiShellAt = await page.evaluate(() => performance.now());
const kanjiDetails = await waitForKanjiDetails(page, kanjiClickAt);

const yomuLogs = logs.filter(log => log.text.includes('[Yomu]'));
const logCounts = yomuLogs.reduce((counts, log) => {
    const key = log.text.replace(/^.*?\[Yomu\]\s*/, '').slice(0, 90);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
}, {});

const slowRequests = requests
    .filter(request => request.end && request.end - request.start > 500)
    .map(request => ({ url: request.url.replace(/profile-key/g, '[redacted]'), ms: Math.round(request.end - request.start), status: request.status }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12);
const pendingSlowRequests = requests
    .filter(request => !request.end && performance.now() - request.start > 500)
    .map(request => ({ url: request.url.replace(/profile-key/g, '[redacted]'), pendingMs: Math.round(performance.now() - request.start) }))
    .sort((a, b) => b.pendingMs - a.pendingMs)
    .slice(0, 12);

console.log(JSON.stringify({
    origin: ORIGIN,
    target: profileTarget,
    injectedDelayMs: SLOW_MS,
    timingsMs: {
        hoverToPopover: hoverProfile.popoverAt ? Math.round(hoverProfile.popoverAt - hoverProfile.startedAt) : null,
        hoverToAudioPlayAttempt: hoverProfile.audioAt ? Math.round(hoverProfile.audioAt - hoverProfile.startedAt) : null,
        hoverAwayToClose: hoverProfile.closeAt && hoverProfile.awayAt ? Math.round(hoverProfile.closeAt - hoverProfile.awayAt) : null,
        dictionaryClickToShellMounted: Math.round(popoverAt - clickAt),
        dictionaryClickToDetailsComplete: dictionaryDetails.at ? Math.round(dictionaryDetails.at - clickAt) : null,
        clickToLocalDictionary: localDictionaryAt ? Math.round(localDictionaryAt - clickAt) : null,
        clickToAudioPlayAttempt: audioAt ? Math.round(audioAt - clickAt) : null,
        kanjiClickToShell: Math.round(kanjiShellAt - kanjiClickAt),
        kanjiClickToDetailsComplete: kanjiDetails.completeAt ? Math.round(kanjiDetails.completeAt - kanjiClickAt) : null,
        kanjiMounts: kanjiDetails.mounts,
    },
    dictionaryDetails,
    console: {
        total: logs.length,
        yomu: yomuLogs.length,
        topYomuMessages: Object.entries(logCounts).sort(([, a], [, b]) => b - a).slice(0, 10),
    },
    slowRequests,
    pendingSlowRequests,
    hoverProfile,
    dictionaryShellDebug,
    hoverCloseDebug: hoverProfile.closeDebug,
    localDictionaryDebug,
}, null, 2));

await browser.close();

async function profileHoverPopover(page) {
    const startedAt = await page.evaluate(() => performance.now());
    const profile = {
        word: HOVER_WORD,
        startedAt,
        popoverAt: null,
        audioAt: null,
        awayAt: null,
        closeAt: null,
        closeDebug: null,
        debug: null,
        skipped: false,
        reason: '',
    };
    const firstWord = await profileWordLocator(page, HOVER_WORD);
    try {
        await firstWord.hover({ timeout: 5000 });
    } catch (error) {
        profile.skipped = true;
        profile.reason = `Could not hover the profile word: ${String(error?.message || error)}`;
        profile.debug = await collectPageDebug(page).catch(debugError => ({ error: String(debugError?.message || debugError) }));
        return profile;
    }

    const opened = await page.waitForSelector('.jpdb-reader-popover', { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    if (!opened) {
        profile.skipped = true;
        profile.reason = 'Hover did not open a popover before the profiler timeout.';
        profile.debug = await collectPageDebug(page).catch(error => ({ error: String(error?.message || error) }));
        return profile;
    }

    profile.popoverAt = await page.evaluate(() => performance.now());
    await page.waitForFunction(start => window.__yomuProfileEvents.some(event => event.t >= start && (event.name === 'audio.play' || event.name === 'audio.play.failed')), startedAt, { timeout: 12000 }).catch(() => {});
    profile.audioAt = await page.evaluate(start => window.__yomuProfileEvents.find(event => event.t >= start && event.name.startsWith('audio.play'))?.t ?? null, startedAt);
    profile.awayAt = await page.evaluate(() => performance.now());
    await page.mouse.move(1272, 892);
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 3000 }).catch(() => {});
    const hoverClosed = await page.locator('.jpdb-reader-popover').count().then(count => count === 0);
    profile.closeAt = hoverClosed ? await page.evaluate(() => performance.now()) : null;
    profile.closeDebug = hoverClosed ? null : await hoverCloseDebugSnapshot(page);
    if (!hoverClosed) await page.keyboard.press('Escape');
    return profile;
}

async function hoverCloseDebugSnapshot(page) {
    return page.evaluate(() => {
        const describe = element => element ? {
            tag: element.tagName,
            className: element.className,
            text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
        } : null;
        const popover = document.querySelector('.jpdb-reader-popover');
        const word = document.querySelector('.jpdb-reader-word:hover');
        return {
            elementAtAwayPoint: describe(document.elementFromPoint(1272, 892)),
            hovered: Array.from(document.querySelectorAll(':hover')).slice(-6).map(describe),
            ariaModal: popover?.getAttribute('aria-modal') ?? null,
            backdropCount: document.querySelectorAll('.jpdb-reader-backdrop').length,
            popoverBox: popover?.getBoundingClientRect().toJSON?.() ?? null,
            wordHover: describe(word),
        };
    });
}

async function openProfileTarget(page, url) {
    const attempts = [];
    const primary = await tryOpenAndPrepareProfilePage(page, url.toString(), 'newtab', attempts);
    if (primary.ready) return { source: 'newtab', url: url.toString(), attempts };

    if (!LIVE) {
        const fixtureUrl = new URL(PROFILE_FIXTURE_PATH, ORIGIN);
        const fixture = await tryOpenAndPrepareProfilePage(page, fixtureUrl.toString(), 'fixture', attempts);
        if (fixture.ready) return { source: 'fixture', url: fixtureUrl.toString(), attempts };
    }

    return {
        skipped: true,
        reason: `Expected mock words "${HOVER_WORD}" and "${CLICK_WORD}" were not rendered before profiling could start.`,
        attempts,
        pageDebug: await collectPageDebug(page).catch(error => ({ error: String(error?.message || error) })),
    };
}

async function tryOpenAndPrepareProfilePage(page, url, label, attempts) {
    const attempt = { label, url };
    attempts.push(attempt);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await prepareProfilePage(page);
        attempt.ready = await waitForProfileWords(page, 5000);
        if (!attempt.ready) attempt.debug = await collectPageDebug(page);
    } catch (error) {
        attempt.ready = false;
        attempt.error = String(error?.message || error);
    }
    return attempt;
}

async function prepareProfilePage(page) {
    await page.evaluate(settings => {
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify(settings));
    }, settings);
    await seedProfileDictionaries(page);
    await page.waitForTimeout(100);
    await installReaderRuntimeIfNeeded(page);
}

async function installReaderRuntimeIfNeeded(page) {
    const initialized = await page.evaluate(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')));
    if (!initialized) await page.addScriptTag({ content: await readFile(USERSCRIPT_PATH, 'utf8') });
}

async function waitForProfileWords(page, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const found = await page.evaluate(({ hoverWord, clickWord }) => {
            const words = Array.from(document.querySelectorAll('.jpdb-reader-word'));
            return words.some(word => profileWordMatches(word, hoverWord)) && words.some(word => profileWordMatches(word, clickWord));

            function profileWordMatches(word, target) {
                const text = word.textContent?.trim() || '';
                const withoutRuby = text.replace(/\([^)]*\)/g, '');
                return [
                    word.getAttribute('data-expression') || '',
                    word.getAttribute('data-reading') || '',
                    text,
                    withoutRuby,
                ].some(value => value.includes(target));
            }
        }, { hoverWord: HOVER_WORD, clickWord: CLICK_WORD });
        if (found) return true;
        await page.waitForTimeout(150);
    }
    return false;
}

async function profileWordLocator(page, target) {
    const index = await page.evaluate(target => {
        const words = Array.from(document.querySelectorAll('.jpdb-reader-word'));
        return words.findIndex(word => {
            const text = word.textContent?.trim() || '';
            const withoutRuby = text.replace(/\([^)]*\)/g, '');
            return [
                word.getAttribute('data-expression') || '',
                word.getAttribute('data-reading') || '',
                text,
                withoutRuby,
            ].some(value => value.includes(target));
        });
    }, target);
    return index >= 0
        ? page.locator('.jpdb-reader-word').nth(index)
        : page.locator('.jpdb-reader-word').filter({ hasText: target }).first();
}

async function collectPageDebug(page) {
    return await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        bodyText: document.body?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
        wordCount: document.querySelectorAll('.jpdb-reader-word').length,
        words: Array.from(document.querySelectorAll('.jpdb-reader-word')).slice(0, 12).map(word => word.textContent?.trim() || ''),
        initialized: Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')),
        runtime: window.__YOMU_READER_RUNTIME__ ?? null,
    }));
}

async function waitForDictionaryDetails(page, clickAt, popoverAt) {
    const loadingSelector = '.jpdb-reader-popover [data-card-details-loading]';
    const observedLoading = await page.locator(loadingSelector).count().then(count => count > 0).catch(() => false);
    const complete = await page.waitForFunction(selector => !document.querySelector(selector), loadingSelector, { timeout: SLOW_MS + 6000 })
        .then(() => true)
        .catch(() => false);
    return {
        shellMountedAt: popoverAt,
        at: complete ? await page.evaluate(() => performance.now()) : null,
        complete,
        observedLoadingSelector: observedLoading,
        loadingSelector,
        debug: complete ? null : await popoverDebugSnapshot(page),
    };
}

async function waitForKanjiDetails(page, startAt) {
    const mountChecks = [
        ['keyword', '[data-kanji-keyword-mount]', text => text && !/Loading kanji details/i.test(text)],
        ['jpdb', '[data-kanji-jpdb-mount]', text => Boolean(text)],
        ['rtk', '[data-kanji-rtk-mount]', text => Boolean(text)],
        ['localKanjiDictionary', '[data-kanji-definitions-mount]', text => /Profile Kanji|now|read/i.test(text)],
        ['kanjiVg', '.jpdb-reader-kanjivg', text => /Stroke order|Clear|Trace/i.test(text)],
        ['origin', '[data-kanji-origin-mount]', text => Boolean(text)],
        ['similarWords', '[data-kanji-similar-mount]', text => Boolean(text)],
    ];
    const mounts = {};
    await Promise.all(mountChecks.map(async ([name, selector]) => {
        const present = await page.locator(selector).count().then(count => count > 0).catch(() => false);
        if (!present) {
            mounts[name] = { selector, present: false, ms: null, complete: false };
            return;
        }
        const complete = await page.waitForFunction(({ selector }) => {
            const node = document.querySelector(selector);
            const text = node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            if (!node) return false;
            if (selector === '[data-kanji-keyword-mount]') return text && !/Loading kanji details/i.test(text);
            if (selector === '[data-kanji-definitions-mount]') return /Profile Kanji|now|read/i.test(text);
            if (selector === '.jpdb-reader-kanjivg') return Boolean(node.querySelector('.jpdb-reader-kanjivg-svg')) || /Stroke order|Clear|Trace/i.test(text);
            return Boolean(text);
        }, { selector }, { timeout: SLOW_MS + 7000 }).then(() => true).catch(() => false);
        const at = complete ? await page.evaluate(() => performance.now()) : null;
        mounts[name] = {
            selector,
            present,
            complete,
            ms: at ? Math.round(at - startAt) : null,
            text: complete ? undefined : await page.locator(selector).first().textContent().then(text => text?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '').catch(() => ''),
        };
    }));
    const completeTimes = Object.values(mounts)
        .filter(mount => mount.present && mount.complete && mount.ms !== null)
        .map(mount => startAt + mount.ms);
    return {
        mounts,
        completeAt: completeTimes.length ? Math.max(...completeTimes) : null,
        debug: Object.values(mounts).some(mount => mount.present && !mount.complete) ? await popoverDebugSnapshot(page) : null,
    };
}

async function popoverDebugSnapshot(page) {
    return await page.evaluate(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        return {
            text: popover?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
            loading: Array.from(popover?.querySelectorAll('[data-card-details-loading], [data-kanji-keyword-mount], [data-kanji-definitions-mount]') ?? []).map(node => ({
                selector: node.matches('[data-card-details-loading]') ? '[data-card-details-loading]' : node.matches('[data-kanji-keyword-mount]') ? '[data-kanji-keyword-mount]' : '[data-kanji-definitions-mount]',
                text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
            })),
        };
    });
}

function profileFixtureHtml() {
    return `<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <title>Yomu profile fixture</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 48px; line-height: 2; }
        main { max-width: 720px; }
    </style>
</head>
<body>
    <main>
        <h1>Yomu profile fixture</h1>
        <p>今日は静かな喫茶店で新しい本を読みました。日本語を読む。</p>
    </main>
</body>
</html>`;
}

async function seedProfileDictionaries(page) {
    await page.evaluate(async () => {
        const DB_NAME = 'jpdb-popup-reader-yomitan';
        const DB_VERSION = 2;
        await new Promise(resolve => {
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => resolve();
            deleteRequest.onblocked = () => resolve();
        });
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                const ensureStore = (name, options) => db.objectStoreNames.contains(name)
                    ? request.transaction.objectStore(name)
                    : db.createObjectStore(name, options);
                const ensureIndex = (store, name, keyPath) => {
                    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
                };
                const terms = ensureStore('terms', { keyPath: 'id', autoIncrement: true });
                ensureIndex(terms, 'expression', 'expression');
                ensureIndex(terms, 'reading', 'reading');
                ensureIndex(terms, 'dictionary', 'dictionary');
                const kanji = ensureStore('kanji', { keyPath: 'id', autoIncrement: true });
                ensureIndex(kanji, 'character', 'character');
                ensureIndex(kanji, 'dictionary', 'dictionary');
                const termMeta = ensureStore('termMeta', { keyPath: 'id', autoIncrement: true });
                ensureIndex(termMeta, 'expression', 'expression');
                ensureIndex(termMeta, 'dictionary', 'dictionary');
                const kanjiMeta = ensureStore('kanjiMeta', { keyPath: 'id', autoIncrement: true });
                ensureIndex(kanjiMeta, 'character', 'character');
                ensureIndex(kanjiMeta, 'dictionary', 'dictionary');
                if (!db.objectStoreNames.contains('dictionaryInfo')) db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['dictionaryInfo', 'terms', 'kanji', 'termMeta'], 'readwrite');
            tx.objectStore('dictionaryInfo').put({ title: 'Profile Local', alias: 'Profile Local', enabled: true, priority: 0, type: 'terms', counts: { terms: 8 } });
            tx.objectStore('dictionaryInfo').put({ title: 'Profile Pitch', alias: 'Profile Pitch', enabled: true, priority: 1, type: 'metadata', counts: { termMeta: 2 } });
            tx.objectStore('dictionaryInfo').put({ title: 'Profile Kanji', alias: 'Profile Kanji', enabled: true, priority: 2, type: 'kanji', counts: { kanji: 2 } });
            const terms = tx.objectStore('terms');
            [
                { expression: '今日', reading: 'きょう', glossary: ['profile local today'], score: 100, dictionary: 'Profile Local' },
                { expression: '読む', reading: 'よむ', glossary: ['profile local to read'], rules: 'v5m', score: 90, dictionary: 'Profile Local' },
                { expression: '読みました', reading: 'よみました', glossary: ['profile local read politely'], rules: 'v5m', score: 80, dictionary: 'Profile Local' },
                { expression: '日本語', reading: 'にほんご', glossary: ['profile local Japanese language'], score: 70, dictionary: 'Profile Local' },
            ].forEach(entry => terms.add(entry));
            const kanji = tx.objectStore('kanji');
            kanji.add({ character: '今', onyomi: ['コン'], kunyomi: ['いま'], tags: [], meanings: ['now'], dictionary: 'Profile Kanji' });
            kanji.add({ character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], tags: [], meanings: ['read'], dictionary: 'Profile Kanji' });
            const termMeta = tx.objectStore('termMeta');
            termMeta.add({ expression: '今日', mode: 'freq', data: { frequency: 100 }, dictionary: 'Profile Pitch' });
            termMeta.add({ expression: '今日', mode: 'pitch', data: { reading: 'きょう', pitches: [{ position: 1 }] }, dictionary: 'Profile Pitch' });
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    });
}

function mockParse(body) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(String) : [];
    const vocab = [];
    const byKey = new Map();
    const tokens = paragraphs.map(text => {
        const paragraph = [];
        for (let index = 0; index < text.length;) {
            const entry = vocabulary.filter(item => text.startsWith(item.surface, index)).sort((a, b) => b.surface.length - a.surface.length)[0];
            if (!entry) {
                index += 1;
                continue;
            }
            let vocabIndex = byKey.get(entry.spelling);
            if (vocabIndex === undefined) {
                vocabIndex = vocab.length;
                byKey.set(entry.spelling, vocabIndex);
                vocab.push([100000 + vocabIndex, 200000 + vocabIndex, 0, entry.spelling, entry.reading, entry.frequency, entry.partOfSpeech, [[entry.gloss]], [entry.partOfSpeech], ['not-in-deck'], ['LHHL']]);
            }
            paragraph.push([vocabIndex, index, entry.surface.length, /[\u3400-\u9fff]/u.test(entry.surface) ? [[entry.surface, entry.reading]] : null]);
            index += entry.surface.length;
        }
        return paragraph;
    });
    return { vocabulary: vocab, tokens };
}

function mockKanjiHtml(kanji) {
    return `<!doctype html><html><head><meta name="description" content="${kanji} - read"></head><body>
        <div><h6 class="subsection-label">Keyword</h6><div class="subsection">read</div></div>
        <table class="cross-table"><tr><td>Frequency</td><td>Top 400-500</td></tr><tr><td>Type</td><td>Jouyou grade 2</td></tr><tr><td>Kanken</td><td>Level 9</td></tr><tr><td>Heisig</td><td>372</td></tr></table>
        <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Composed of</h6><div class="subsection"><div><div class="spelling"><a href="/kanji/言">言</a></div><div class="description">say</div></div></div></div>
        <div class="subsection-used-in"><div class="used-in"><div class="jp"><a href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a">読む</a></div><div class="en">to read</div></div></div>
    </body></html>`;
}

function mockKanjiVgSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
        <g id="kvg:StrokePaths_profile">
            <path d="M53,13 C44,29 31,42 15,51" />
            <path d="M57,14 C68,29 82,40 96,48" />
            <path d="M38,54 C49,58 63,58 76,54" />
            <path d="M30,70 H78 L62,91" />
        </g>
    </svg>`;
}

function mockKanjiMap() {
    return { kanjialiveData: { grade: 2, kstroke: 14, radical: { character: '言', meaning: { english: 'speech' } } }, jishoData: { jlpt: 'N4', taughtIn: 'grade 2', strokeCount: 14, parts: ['言', '売'], radical: { symbol: '言', meaning: 'speech' } }, source: 'profile' };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isImmersionApiUrl(url, pathname) {
    return IMMERSION_API_HOSTS.has(url.hostname) && url.pathname === pathname;
}
