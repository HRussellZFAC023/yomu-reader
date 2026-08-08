#!/usr/bin/env node
import { chromium } from 'playwright';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    addGmStorageBridgeInitScript,
    gmRequestFetchBody,
    mockJpdbParseFromVocabulary,
} from './lib/smoke-harness.mjs';

const ORIGIN = process.env.YOMU_PROFILE_ORIGIN || 'http://127.0.0.1:5175';
const SLOW_MS = Number(process.env.YOMU_PROFILE_SLOW_MS || 4500);
const LIVE = process.env.YOMU_PROFILE_LIVE === '1';
const API_KEY = process.env.YOMU_PROFILE_API_KEY || process.env.YOMU_TEST_API_KEY || '';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const USERSCRIPT_PATH = resolve(SCRIPT_DIR, '..', 'dist', 'yomu.user.js');
// The local dictionary store (YomitanDictionaryStore) ships in the
// settings-surface companion, not core — createLocalDictionaryStore() returns an
// inert store whose lookup() resolves [] when the companion is absent. Injecting
// only yomu.user.js therefore leaves every local-dictionary lookup empty no matter
// how the IndexedDB is seeded, so the local-enrichment metrics stay null. Load the
// companion first so the real store reads the seeded terms.
const SETTINGS_COMPANION_PATH = resolve(SCRIPT_DIR, '..', 'dist', 'greasyfork', 'yomu-settings-surface.user.js');
// The seed builds the local dictionary IndexedDB the userscript will later open,
// so it MUST match the real schema in src/reader/dictionaries/yomitan/index.ts.
// Read the live DB_NAME/DB_VERSION from that source at startup instead of
// hardcoding them here — a hardcoded copy is exactly what went stale before
// (seed stuck at v2 while the store moved to v4 + derived stores), which made
// the userscript silently reopen at a newer version with empty term indexes
// and left the profiler measuring the network fallback instead of the local path.
const YOMITAN_STORE_SOURCE_PATH = resolve(SCRIPT_DIR, '..', 'src', 'reader', 'dictionaries', 'yomitan', 'index.ts');
const YOMITAN_DB = await readYomitanDbSchemaConstants(YOMITAN_STORE_SOURCE_PATH);
const IMMERSION_API_HOSTS = new Set(['apiv2express.immersionkit.com', 'apiv2.immersionkit.com']);
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const PROFILE_FIXTURE_PATH = '/__yomu-profile-fixture/';
const HOVER_WORD = '読みました';
const CLICK_WORD = '今日';
const EXPANDED_HOVER_WORD = '日本語';
const NON_EMPTY_TEXT_PATTERN = String.raw`\S`;
const KANJI_MOUNT_CHECKS = [
    { name: 'keyword', selector: '[data-kanji-keyword-mount]', completePattern: NON_EMPTY_TEXT_PATTERN, rejectPattern: 'Loading kanji details' },
    { name: 'jpdb', selector: '[data-kanji-jpdb-mount]', completePattern: NON_EMPTY_TEXT_PATTERN },
    { name: 'rtk', selector: '[data-kanji-rtk-mount]', completePattern: NON_EMPTY_TEXT_PATTERN },
    { name: 'localKanjiDictionary', selector: '[data-kanji-definitions-mount]', completePattern: 'Profile Kanji|now|read' },
    { name: 'kanjiVg', selector: '.jpdb-reader-kanjivg', completePattern: 'Stroke order|Clear|Trace', completeSelector: '.jpdb-reader-kanjivg-svg' },
    { name: 'origin', selector: '[data-kanji-origin-mount]', completePattern: NON_EMPTY_TEXT_PATTERN },
    { name: 'similarWords', selector: '[data-kanji-similar-mount]', completePattern: NON_EMPTY_TEXT_PATTERN },
];

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
        scanPage: 'Shift+J',
        hoverLookup: '',
        openSettings: 'Ctrl+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'A',
        nextSubtitle: 'D',
        copySubtitle: 'Shift+C',
        toggleOcr: 'Shift+O',
        scanImages: 'Shift+I',
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
    ['今日', '今日', 'きょう', 'today', ['n'], 100],
    ['静か', '静か', 'しずか', 'quiet', ['adj-na'], 1700],
    ['喫茶店', '喫茶店', 'きっさてん', 'coffee shop', ['n'], 2400],
    ['新しい', '新しい', 'あたらしい', 'new', ['adj-i'], 700],
    ['本', '本', 'ほん', 'book', ['n'], 350],
    ['読みました', '読む', 'よみました', 'read', ['v5m'], 401],
    ['読む', '読む', 'よむ', 'to read', ['v5m'], 400],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250],
];

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
    const mocked = !LIVE
        ? await profileRouteResponse(bridgeProfileRoute(request), new URL(request.url))
        : null;
    if (mocked) {
        const result = bridgeResultFromProfileResponse(mocked);
        requests.push({
            method: request.method,
            url: request.url,
            status: mocked.status ?? 200,
            start: started,
            end: performance.now(),
            viaUserscriptBridge: true,
            mocked: true,
        });
        return result;
    }
    const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: gmRequestFetchBody(request),
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

function bridgeProfileRoute(request) {
    return {
        request: () => ({
            method: () => request.method,
            url: () => request.url,
            postData: () => bridgeRequestPostData(request),
        }),
    };
}

function bridgeRequestPostData(request) {
    const body = gmRequestFetchBody(request);
    if (body == null) return '';
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('utf8');
    return String(body);
}

function bridgeResultFromProfileResponse(response) {
    const body = response.body ?? response.responseText ?? '';
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    return {
        status: response.status ?? 200,
        responseText: buffer.toString('utf8'),
        bytes: [...buffer],
        contentType: response.contentType ?? response.headers?.['content-type'] ?? '',
    };
}

await page.addInitScript(({ settings, settingsKey }) => {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
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
}, { settings, settingsKey: SETTINGS_KEY });

await addGmStorageBridgeInitScript(page, {
    key: SETTINGS_KEY,
    value: settings,
    css: '',
    requestBridgeName: '__yomuProfileRequest',
});

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
    const skippedReport = {
        skipped: true,
        reason: profileTarget.reason,
        origin: ORIGIN,
        live: LIVE,
        attempts: profileTarget.attempts,
        pageDebug: profileTarget.pageDebug,
        actionable: LIVE
            ? 'Start the configured YOMU_PROFILE_ORIGIN newtab page or run without YOMU_PROFILE_LIVE=1 so the harness can use its deterministic fixture.'
            : 'Run npm run build first so dist/yomu.user.js exists, then rerun the profiler. The mock fixture is available at /__yomu-profile-fixture/.',
    };
    console.log(JSON.stringify(skippedReport, null, 2));
    await browser.close();
    if (!LIVE) {
        throw new Error(`Deterministic performance fixture was not profiled: ${profileTarget.reason}`);
    }
    process.exit(0);
}

const hoverProfile = await profileHoverPopover(page);
const expandedHoverProfile = await profileExpandedSectionsHover(page, EXPANDED_HOVER_WORD, CLICK_WORD);
await closeAnyPopover(page);

const clickWord = await profileWordLocator(page, CLICK_WORD);
await page.evaluate(() => { window.__yomuProfileEvents = []; });
const clickAt = await page.evaluate(() => performance.now());
await clickWord.click();
await page.waitForSelector('.jpdb-reader-popover', { timeout: 10000 });
const popoverAt = await page.evaluate(() => performance.now());
const dictionaryShellDebug = await popoverDebugSnapshot(page);
const dictionaryDetails = await waitForDictionaryDetails(page, clickAt, popoverAt);
// Match the seeded local gloss the way the learner-glossary summarizer renders
// it (verbatim, function words preserved). The clicked word 今日 shows
// "profile local for today"; the other seeded terms are reachable via the
// nested/expanded surfaces.
const localDictionaryLoaded = await page.waitForFunction(() => /profile local (?:for today|to read|as read politely|for japanese)/.test(document.querySelector('.jpdb-reader-popover')?.textContent || ''), null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
const localDictionaryAt = localDictionaryLoaded ? await page.evaluate(() => performance.now()) : null;
const localDictionaryDebug = localDictionaryLoaded ? null : await page.evaluate(() => ({
    text: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
    localSectionCount: document.querySelectorAll('.jpdb-reader-popover [data-source="local-dictionary"]').length,
    dictionaries: [...document.querySelectorAll('.jpdb-reader-popover [data-source="local-dictionary"] .jpdb-reader-local-glossary')].map(node => ({
        dictionary: node.closest('[data-source="local-dictionary"]')?.getAttribute('data-dictionary'),
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
const invariantFailures = [];
if (!LIVE && !localDictionaryLoaded) {
    invariantFailures.push('The deterministic fixture did not render its seeded local dictionary; the local latency metric is invalid.');
}

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
        expandedSectionsHoverToShell: expandedHoverProfile.shellAt ? Math.round(expandedHoverProfile.shellAt - expandedHoverProfile.startedAt) : null,
        expandedSectionsHoverToContent: expandedHoverProfile.contentAt ? Math.round(expandedHoverProfile.contentAt - expandedHoverProfile.startedAt) : null,
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
    expandedHoverProfile,
    dictionaryShellDebug,
    hoverCloseDebug: hoverProfile.closeDebug,
    localDictionaryDebug,
    invariantFailures,
}, null, 2));

await browser.close();
if (invariantFailures.length) throw new Error(invariantFailures.join(' '));

async function profileHoverPopover(page) {
    const startedAt = await page.evaluate(() => performance.now());
    const profile = createHoverProfile(startedAt);
    if (!await tryHoverProfileWord(page, profile)) return profile;
    if (!await waitForHoverPopover(page, profile)) return profile;
    await recordHoverAudioTiming(page, profile);
    await recordHoverCloseTiming(page, profile);
    return profile;
}

function createHoverProfile(startedAt) {
    return {
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
}

async function tryHoverProfileWord(page, profile) {
    const firstWord = await profileWordLocator(page, HOVER_WORD);
    try {
        await firstWord.hover({ timeout: 5000 });
        return true;
    } catch (error) {
        await skipHoverProfile(page, profile, `Could not hover the profile word: ${String(error?.message || error)}`);
        return false;
    }
}

async function waitForHoverPopover(page, profile) {
    const opened = await page.waitForSelector('.jpdb-reader-popover', { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    if (opened) return true;
    await skipHoverProfile(page, profile, 'Hover did not open a popover before the profiler timeout.');
    return false;
}

async function recordHoverAudioTiming(page, profile) {
    profile.popoverAt = await page.evaluate(() => performance.now());
    await page.waitForFunction(playedAudioSince, profile.startedAt, { timeout: 12000 }).catch(() => {});
    profile.audioAt = await page.evaluate(audioEventTimeSince, profile.startedAt);
}

function playedAudioSince(start) {
    return window.__yomuProfileEvents.some(event => event.t >= start && (event.name === 'audio.play' || event.name === 'audio.play.failed'));
}

function audioEventTimeSince(start) {
    return window.__yomuProfileEvents.find(event => event.t >= start && event.name.startsWith('audio.play'))?.t ?? null;
}

async function recordHoverCloseTiming(page, profile) {
    profile.awayAt = await page.evaluate(() => performance.now());
    await page.mouse.move(1272, 892);
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 3000 }).catch(() => {});
    const hoverClosed = await page.locator('.jpdb-reader-popover').count().then(count => count === 0);
    profile.closeAt = hoverClosed ? await page.evaluate(() => performance.now()) : null;
    profile.closeDebug = hoverClosed ? null : await hoverCloseDebugSnapshot(page);
    if (!hoverClosed) await page.keyboard.press('Escape');
}

async function skipHoverProfile(page, profile, reason) {
    profile.skipped = true;
    profile.reason = reason;
    profile.debug = await collectPageDebug(page).catch(error => ({ error: String(error?.message || error) }));
}

async function profileExpandedSectionsHover(page, sourceWord, targetWord) {
    const profile = createExpandedSectionsHoverProfile(sourceWord, targetWord);
    try {
        await (await profileWordLocator(page, sourceWord)).hover({ timeout: 5000 });
    } catch (error) {
        await skipHoverProfile(page, profile, `Could not hover the expanded-section source word: ${String(error?.message || error)}`);
        return profile;
    }
    const sourceReady = await page.waitForFunction(expandedHoverSourceReadyInPage, sourceWord, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    if (!sourceReady) {
        await skipHoverProfile(page, profile, 'Expanded-section source popover did not open before profiling.');
        return profile;
    }
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover [data-card-details-loading]'), null, { timeout: SLOW_MS + 6000 })
        .catch(() => {});
    profile.expansion = await expandCurrentPopoverSections(page);
    if (!profile.expansion.popoverPresent) {
        await skipHoverProfile(page, profile, 'No popover was open before expanded-section hover profiling.');
        return profile;
    }
    await page.waitForTimeout(50);
    await page.evaluate(target => {
        window.__yomuProfileEvents = [];
        window.__yomuExpandedHoverProfile = {
            target,
            startedAt: performance.now(),
            shellAt: null,
            contentAt: null,
        };
    }, targetWord);
    profile.startedAt = await page.evaluate(() => window.__yomuExpandedHoverProfile?.startedAt ?? performance.now());
    try {
        await (await profileWordLocator(page, targetWord)).hover({ timeout: 5000 });
    } catch (error) {
        await skipHoverProfile(page, profile, `Could not hover the expanded-section target word: ${String(error?.message || error)}`);
        return profile;
    }
    const completed = await page.waitForFunction(expandedHoverCompleteInPage, targetWord, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    const result = await page.evaluate(() => window.__yomuExpandedHoverProfile ?? null);
    profile.shellAt = result?.shellAt ?? null;
    profile.contentAt = result?.contentAt ?? null;
    profile.completed = completed;
    profile.debug = completed ? null : await popoverDebugSnapshot(page);
    return profile;
}

function createExpandedSectionsHoverProfile(sourceWord, targetWord) {
    return {
        sourceWord,
        word: targetWord,
        startedAt: null,
        shellAt: null,
        contentAt: null,
        completed: false,
        expansion: null,
        debug: null,
        skipped: false,
        reason: '',
    };
}

function expandedHoverSourceReadyInPage(sourceWord) {
    const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling')?.textContent?.replace(/\s+/g, '').trim() ?? '';
    return spelling.startsWith(sourceWord);
}

async function expandCurrentPopoverSections(page) {
    return await page.evaluate(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        if (!popover) return { popoverPresent: false, details: 0, opened: 0, textLength: 0 };
        const details = Array.from(popover.querySelectorAll('details'));
        let opened = 0;
        for (const detail of details) {
            if (detail.open) continue;
            detail.open = true;
            opened += 1;
            detail.dispatchEvent(new Event('toggle', { bubbles: true }));
        }
        return {
            popoverPresent: true,
            details: details.length,
            opened,
            textLength: popover.textContent?.length ?? 0,
        };
    });
}

function expandedHoverCompleteInPage(targetWord) {
    const profile = window.__yomuExpandedHoverProfile;
    const popover = document.querySelector('.jpdb-reader-popover');
    if (!profile) return false;
    if (!popover) return false;
    const spelling = popover.querySelector('.jpdb-reader-spelling')?.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (!spelling.startsWith(targetWord)) return false;
    profile.shellAt = profile.shellAt ?? performance.now();
    profile.contentAt = profile.contentAt ?? performance.now();
    return true;
}

async function closeAnyPopover(page) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 1500 }).catch(() => {});
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
    if (!LIVE) {
        const fixtureUrl = new URL(PROFILE_FIXTURE_PATH, ORIGIN);
        const fixture = await tryOpenAndPrepareProfilePage(page, fixtureUrl.toString(), 'fixture', attempts);
        if (fixture.ready) return { source: 'fixture', url: fixtureUrl.toString(), attempts };
    }

    const primary = await tryOpenAndPrepareProfilePage(page, url.toString(), 'newtab', attempts);
    if (primary.ready) return { source: 'newtab', url: url.toString(), attempts };

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
    await updateProfileAttempt(page, url, attempt);
    return attempt;
}

async function updateProfileAttempt(page, url, attempt) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await prepareProfilePage(page);
        await markProfileAttemptReadiness(page, attempt);
    } catch (error) {
        attempt.ready = false;
        attempt.error = String(error?.message || error);
    }
}

async function markProfileAttemptReadiness(page, attempt) {
    attempt.ready = await waitForProfileWords(page, 5000);
    if (!attempt.ready) attempt.debug = await collectPageDebug(page);
}

async function prepareProfilePage(page) {
    await page.evaluate(({ settings, settingsKey }) => {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }, { settings, settingsKey: SETTINGS_KEY });
    await seedProfileDictionaries(page);
    await page.waitForTimeout(100);
    await installReaderRuntimeIfNeeded(page);
}

async function installReaderRuntimeIfNeeded(page) {
    const initialized = await page.evaluate(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')));
    if (initialized) return;
    // Register the local-dictionary store companion before core boots so
    // createLocalDictionaryStore() picks up the real YomitanDictionaryStore.
    await page.addScriptTag({ content: await readFile(SETTINGS_COMPANION_PATH, 'utf8') });
    await page.addScriptTag({ content: await readFile(USERSCRIPT_PATH, 'utf8') });
}

async function waitForProfileWords(page, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await profileWordsPresent(page, [HOVER_WORD, CLICK_WORD])) return true;
        await page.waitForTimeout(150);
    }
    return false;
}

async function profileWordLocator(page, target) {
    const index = await profileWordIndex(page, target);
    return index >= 0
        ? page.locator('.jpdb-reader-word').nth(index)
        : page.locator('.jpdb-reader-word').filter({ hasText: target }).first();
}

async function profileWordsPresent(page, targets) {
    return await page.evaluate(profileWordQueryInPage, { targets, requireAll: true });
}

async function profileWordIndex(page, target) {
    return await page.evaluate(profileWordQueryInPage, { targets: [target], requireAll: false });
}

function profileWordQueryInPage({ targets, requireAll }) {
    const words = Array.from(document.querySelectorAll('.jpdb-reader-word'));
    const indexes = targets.map(target => words.findIndex(word => profileWordMatchesInPage(word, target)));
    return requireAll ? indexes.every(index => index >= 0) : indexes[0] ?? -1;

    function profileWordMatchesInPage(word, target) {
        return profileWordValuesInPage(word).some(value => value.includes(target));
    }

    function profileWordValuesInPage(word) {
        const text = word.textContent?.trim() || '';
        const withoutRuby = text.replace(/\([^)]*\)/g, '');
        return [
            word.getAttribute('data-expression') || '',
            word.getAttribute('data-reading') || '',
            text,
            withoutRuby,
        ];
    }
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
    const mounts = {};
    await Promise.all(KANJI_MOUNT_CHECKS.map(check => recordKanjiMountStatus(page, startAt, mounts, check)));
    return {
        mounts,
        completeAt: kanjiDetailsCompleteAt(mounts, startAt),
        debug: needsKanjiDetailsDebug(mounts) ? await popoverDebugSnapshot(page) : null,
    };
}

async function recordKanjiMountStatus(page, startAt, mounts, check) {
    const present = await elementPresent(page, check.selector);
    mounts[check.name] = present
        ? await kanjiMountStatus(page, startAt, check)
        : missingKanjiMount(check);
}

async function elementPresent(page, selector) {
    return await page.locator(selector).count().then(count => count > 0).catch(() => false);
}

function missingKanjiMount(check) {
    return { selector: check.selector, present: false, ms: null, complete: false };
}

async function kanjiMountStatus(page, startAt, check) {
    const complete = await waitForKanjiMountComplete(page, check);
    const at = complete ? await page.evaluate(() => performance.now()) : null;
    return {
        selector: check.selector,
        present: true,
        complete,
        ms: at ? Math.round(at - startAt) : null,
        text: complete ? undefined : await kanjiMountTextExcerpt(page, check.selector),
    };
}

async function waitForKanjiMountComplete(page, check) {
    return await page.waitForFunction(kanjiMountCompleteInPage, check, { timeout: SLOW_MS + 7000 })
        .then(() => true)
        .catch(() => false);
}

function kanjiMountCompleteInPage(check) {
    const node = document.querySelector(check.selector);
    return node ? kanjiMountNodeCompleteInPage(node, check) : false;
}

function kanjiMountNodeCompleteInPage(node, check) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (patternMatchesInPage(text, check.rejectPattern)) return false;
    if (selectorMatchesInPage(node, check.completeSelector)) return true;
    return patternMatchesInPage(text, check.completePattern);
}

function patternMatchesInPage(text, pattern) {
    if (!pattern) return false;
    return new RegExp(pattern, 'i').test(text);
}

function selectorMatchesInPage(node, selector) {
    if (!selector) return false;
    return Boolean(node.querySelector(selector));
}

async function kanjiMountTextExcerpt(page, selector) {
    return await page.locator(selector).first().textContent()
        .then(text => text?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '')
        .catch(() => '');
}

function kanjiDetailsCompleteAt(mounts, startAt) {
    const completeTimes = Object.values(mounts)
        .filter(mount => mount.present && mount.complete && mount.ms !== null)
        .map(mount => startAt + mount.ms);
    return completeTimes.length ? Math.max(...completeTimes) : null;
}

function needsKanjiDetailsDebug(mounts) {
    return Object.values(mounts).some(mount => mount.present && !mount.complete);
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

// Read the real IndexedDB name/version the userscript uses from its source of
// truth (src/reader/dictionaries/yomitan/index.ts). The seed opens the DB at
// this exact version and mirrors the same store/index schema, so the userscript
// finds the DB it expects instead of triggering a surprise upgrade that leaves
// the derived term indexes empty. Fails loudly if the constants ever move or
// rename so the seed can never silently drift out of the real schema again.
async function readYomitanDbSchemaConstants(sourcePath) {
    const source = await readFile(sourcePath, 'utf8').catch(error => {
        throw new Error(`Could not read Yomitan store source at ${sourcePath} to sync the profiler seed schema: ${error?.message || error}`);
    });
    const name = source.match(/^const DB_NAME = '([^']+)';/m)?.[1];
    const version = Number(source.match(/^const DB_VERSION = (\d+);/m)?.[1]);
    if (!name || !Number.isInteger(version)) {
        throw new Error(`Could not parse DB_NAME/DB_VERSION from ${sourcePath}. The profiler seed mirrors that schema; update readYomitanDbSchemaConstants() to match the current constants before profiling.`);
    }
    return { name, version };
}

async function seedProfileDictionaries(page) {
    await page.evaluate(async ({ dbName, dbVersion }) => {
        // Mirror of the real onupgradeneeded in
        // src/reader/dictionaries/yomitan/index.ts (~line 1704): every store the
        // store creates, in the same shape, INCLUDING the derived term indexes
        // (termSearch token index + termKanji character index) that were missing
        // from the old v2 seed. Keeping these here means the seeded DB is byte-for
        // -shape identical to a DB the userscript builds after a real import.
        const STORE_SPECS = [
            { name: 'terms', options: { keyPath: 'id', autoIncrement: true }, indexes: [['expression', 'expression'], ['reading', 'reading'], ['dictionary', 'dictionary']] },
            { name: 'kanji', options: { keyPath: 'id', autoIncrement: true }, indexes: [['character', 'character'], ['dictionary', 'dictionary']] },
            { name: 'termMeta', options: { keyPath: 'id', autoIncrement: true }, indexes: [['expression', 'expression'], ['dictionary', 'dictionary']] },
            { name: 'kanjiMeta', options: { keyPath: 'id', autoIncrement: true }, indexes: [['character', 'character'], ['dictionary', 'dictionary']] },
            { name: 'dictionaryInfo', options: { keyPath: 'title' }, indexes: [] },
            { name: 'termSearch', options: { keyPath: 'id', autoIncrement: true }, indexes: [['token', 'token'], ['dictionary', 'dictionary']] },
            { name: 'termKanji', options: { keyPath: 'id', autoIncrement: true }, indexes: [['character', 'character'], ['dictionary', 'dictionary']] },
            // v7 fences dictionary data against factory-reset epochs. Omitting
            // this store makes reconcileYomitanManagedStateEpoch() reject the
            // seeded database, which silently turns this profiler's local
            // lookup metric into a remote-fallback measurement.
            { name: 'managedState', options: { keyPath: 'key' }, indexes: [] },
        ];
        await new Promise(resolve => {
            const deleteRequest = indexedDB.deleteDatabase(dbName);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => resolve();
            deleteRequest.onblocked = () => resolve();
        });
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, dbVersion);
            request.onupgradeneeded = () => installProfileStores(request, STORE_SPECS);
            request.addEventListener('success', () => resolve(request.result), { once: true });
            request.addEventListener('error', () => reject(request.error), { once: true });
        });

        // Each gloss keeps a function word ("for"/"to"/"as") and stays lowercase so
        // the learner-glossary summarizer renders it VERBATIM. A terse all-lowercase
        // 2-4 word gloss (e.g. "profile local today") is otherwise humanized into a
        // comma list ("profile, local, today") and a capitalized word triggers the
        // example-sentence cut — either way the contiguous phrase the local metric
        // matches on would never appear in the rendered section.
        const seededTerms = [
            { expression: '今日', reading: 'きょう', glossary: ['profile local for today'], score: 100, dictionary: 'Profile Local' },
            { expression: '読む', reading: 'よむ', glossary: ['profile local to read'], rules: 'v5m', score: 90, dictionary: 'Profile Local' },
            { expression: '読みました', reading: 'よみました', glossary: ['profile local as read politely'], rules: 'v5m', score: 80, dictionary: 'Profile Local' },
            { expression: '日本語', reading: 'にほんご', glossary: ['profile local for japanese'], score: 70, dictionary: 'Profile Local' },
        ];

        await new Promise((resolve, reject) => {
            const tx = db.transaction(['dictionaryInfo', 'terms', 'kanji', 'termMeta', 'termSearch', 'termKanji'], 'readwrite');
            tx.objectStore('dictionaryInfo').put({ title: 'Profile Local', alias: 'Profile Local', enabled: true, priority: 0, type: 'terms', counts: { terms: 8 } });
            tx.objectStore('dictionaryInfo').put({ title: 'Profile Pitch', alias: 'Profile Pitch', enabled: true, priority: 1, type: 'metadata', counts: { termMeta: 2 } });
            tx.objectStore('dictionaryInfo').put({ title: 'Profile Kanji', alias: 'Profile Kanji', enabled: true, priority: 2, type: 'kanji', counts: { kanji: 2 } });
            const terms = tx.objectStore('terms');
            seededTerms.forEach(entry => terms.add(entry));
            const kanji = tx.objectStore('kanji');
            kanji.add({ character: '今', onyomi: ['コン'], kunyomi: ['いま'], tags: [], meanings: ['now'], dictionary: 'Profile Kanji' });
            kanji.add({ character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], tags: [], meanings: ['read'], dictionary: 'Profile Kanji' });
            const termMeta = tx.objectStore('termMeta');
            termMeta.add({ expression: '今日', mode: 'freq', data: { frequency: 100 }, dictionary: 'Profile Pitch' });
            termMeta.add({ expression: '今日', mode: 'pitch', data: { reading: 'きょう', pitches: [{ position: 1 }] }, dictionary: 'Profile Pitch' });
            // Populate the derived indexes the same way the store's rebuild does:
            // termSearch = one row per glossary search token, termKanji = one row
            // per unique kanji in the expression. Without this the userscript would
            // still see the terms via the expression index, but English glossary
            // search and kanji-similar-word lookups would resolve nothing until a
            // background rebuild finished — a different DB state than the profiler
            // wants to measure.
            const termSearch = tx.objectStore('termSearch');
            const termKanji = tx.objectStore('termKanji');
            for (const entry of seededTerms) {
                for (const token of glossarySearchTokens(entry.glossary)) {
                    termSearch.add({ ...entry, token });
                }
                for (const character of uniqueExpressionKanji(entry.expression)) {
                    termKanji.add({ ...entry, character });
                }
            }
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });

        function installProfileStores(request, specs) {
            for (const spec of specs) installProfileStore(request, spec);
        }

        function installProfileStore(request, spec) {
            const store = profileStoreForSpec(request, spec);
            for (const [name, keyPath] of spec.indexes) ensureProfileIndex(store, name, keyPath);
        }

        function profileStoreForSpec(request, spec) {
            const store = request.result;
            return store.objectStoreNames.contains(spec.name)
                ? request.transaction.objectStore(spec.name)
                : store.createObjectStore(spec.name, spec.options);
        }

        function ensureProfileIndex(store, name, keyPath) {
            if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
        }

        // Faithful mirror of the term-search tokenizer in the Yomitan store
        // (glossarySearchTokens / normalizeGlossarySearchText, index.ts ~1988):
        // lowercase-normalize glossary text, split into words, and index each word
        // plus its suffixes (>= 3 chars) and simple plural/possessive stems, keeping
        // tokens >= 2 chars. Kept in lockstep with those source functions; the
        // constants below match TERM_SEARCH_INDEX_* in that file.
        function glossarySearchTokens(glossary) {
            const MIN_TOKEN_LENGTH = 2;
            const MIN_SUFFIX_LENGTH = 3;
            const MAX_TOKENS_PER_TERM = 40;
            const text = normalizeGlossarySearchText(glossary.join(' '));
            const seen = new Set();
            const tokens = [];
            const push = token => {
                if (token.length < MIN_TOKEN_LENGTH || seen.has(token)) return;
                seen.add(token);
                tokens.push(token);
            };
            for (const word of text.split(' ').filter(Boolean)) {
                const variantSeen = new Set();
                for (const variant of [word, word.endsWith("'s") ? word.slice(0, -2) : '', word.endsWith('s') ? word.slice(0, -1) : '']) {
                    if (variant.length < MIN_TOKEN_LENGTH || variantSeen.has(variant)) continue;
                    variantSeen.add(variant);
                    push(variant);
                    for (let start = 1; start <= variant.length - MIN_SUFFIX_LENGTH; start++) push(variant.slice(start));
                }
            }
            return tokens.slice(0, MAX_TOKENS_PER_TERM);
        }

        function normalizeGlossarySearchText(value) {
            return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/\s+/g, ' ').trim();
        }

        // Mirror of uniqueExpressionKanji (index.ts ~1979): unique CJK ideographs
        // (U+3400..U+9FFF) in expression order.
        function uniqueExpressionKanji(expression) {
            const seen = new Set();
            return Array.from(expression).filter(character => {
                const code = character.codePointAt(0) ?? 0;
                if (code < 0x3400 || code > 0x9fff || seen.has(character)) return false;
                seen.add(character);
                return true;
            });
        }
    }, { dbName: YOMITAN_DB.name, dbVersion: YOMITAN_DB.version });
}

function mockParse(body) {
    return mockJpdbParseFromVocabulary(body, vocabulary, {
        defaultPitch: ['LHHL'],
        spellingIdBase: 200000,
        tokenReading: profileTokenReading,
        vocabularyIdBase: 100000,
    });
}

function profileTokenReading(entry) {
    return /[\u3400-\u9fff]/u.test(entry.surface) ? [[entry.surface, entry.reading]] : null;
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
