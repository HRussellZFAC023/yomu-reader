#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import pkg from '../../package.json' with { type: 'json' };
import { createYomuPaths } from '../lib/paths.mjs';
import {
    addGmStorageBridgeInitScript,
    addGmXmlHttpRequestBridgeInitScript,
    arrayParam,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    firstErrorLine,
    gmRequestFetchBody,
    launchOptionalBrowser,
    launchSmokeBrowser,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    resolveAnkiAction,
    startLoopbackServer,
} from '../lib/smoke-harness.mjs';
import { waitForSelectorText } from '../lib/smoke-wait-helpers.mjs';

const require = createRequire(import.meta.url);
const { greasyForkLibraryPath, userscriptRequireLibraries } = require('../lib/greasyfork-libraries.cjs');
const {
    isLiveStudyAppUrl,
    liveHostedAnkiBridgeUrl,
    liveStudyAliasUrl,
    liveStudyUrl,
    userscriptDistributionMetadataViolations,
} = require('../lib/public-release-policy.cjs');
const { assertNoRemoteExecutableMetadata, userscriptMetadataValues } = require('../lib/userscript-build-utils.cjs');
const { appRoot: ROOT, qaArtifactsRoot: ARTIFACTS } = createYomuPaths(import.meta.dirname);
const DIST = path.join(ROOT, 'dist');
const LIVE_ORIGIN = (process.env.YOMU_LIVE_ORIGIN || pkg.homepage || 'https://hrussellzfac023.github.io/yomu-reader/').replace(/\/+$/, '');
const EXPECTED_LIVE_VERSION = process.env.YOMU_LIVE_EXPECT_VERSION
    || (process.env.YOMU_LIVE_EXPECT_PACKAGE_VERSION === '1' ? pkg.version : '');
const USERSCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const COMPANION_SCRIPT_PATHS = userscriptRequireLibraries().map(library => path.join(DIST, greasyForkLibraryPath(library.fileName)));
const CSS_PATH = path.join(DIST, 'yomu.css');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const ANKI_URL = process.env.YOMU_ANKI_CONNECT_URL || 'http://127.0.0.1:8765';
const DEFAULT_YOMU_PUBLIC_PROXY_URL = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';
const JISHO_AUDIO_URL = 'https://d1vjc5dkcd3yh2.cloudfront.net/audio/yomu-live-smoke-shita.mp3';
const SILENT_WAV_BYTES = Buffer.from('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==', 'base64');
const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = 'yomu-userscript-http-bridge-ready';
const BRIDGE_REQUEST_EVENT = 'yomu-userscript-http-request';
const BRIDGE_RESPONSE_EVENT = 'yomu-userscript-http-response';

const jishoSettings = {
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'en',
    audioEnabled: true,
    autoPlayAudio: true,
    audioAutoPlayMode: 'all',
    audioSources: [{ type: 'jisho', url: '', voice: '', enabled: true }],
    audioEnableDefaultSources: false,
    audioViaBlob: true,
    audioFallbackChimeEnabled: false,
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    enableLogging: false,
};

const ankiStatusSettings = {
    ...jishoSettings,
    audioEnabled: false,
    autoPlayAudio: false,
    ankiEnabled: true,
    ankiSectionEnabled: true,
    ankiConnectUrl: ANKI_URL,
    ankiDeck: 'Mining',
    ankiModel: 'よむ Japanese',
    wordTextColorSource: 'anki',
    wordUnderlineColorSource: 'off',
    wordHighlightColorSource: 'off',
};

const hostedAnkiStatusFixtureHtml = `
<main class="vp-doc yomu-live-anki-status-fixture" style="font: 28px/1.8 system-ui; margin: 48px;">
  <article>
    <p>今日は本を読みます。読む練習を続けます。</p>
  </article>
</main>`;
const HOSTED_ANKI_STATUS_WORD_SELECTOR = '.yomu-live-anki-status-fixture .jpdb-reader-word[data-expression="読む"]';
const HOSTED_ANKI_EXISTING_SELECTOR = '.jpdb-reader-popover .jpdb-reader-anki-existing';
const HOSTED_ANKI_STATUS_TERMS = ['Anki', 'Mining', '12'];
const HOSTED_ANKI_RENDERED_TERMS = ['to read'];
const HOSTED_ANKI_RAW_FIELD_TERMS = ['今日は本を読む', 'Sentence'];

const BUILT_ARTIFACTS = [USERSCRIPT_PATH, CSS_PATH, ...COMPANION_SCRIPT_PATHS];

function createFixtureServer() {
    const html = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<title>Yomu live browser smoke</title>
<main style="font: 28px/1.8 system-ui; margin: 48px;">下を見ます。</main>`;
    return startLoopbackServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/' || url.pathname === '/jisho.html') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(html);
            return;
        }
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }, 'Could not bind live smoke server');
}

async function runLiveAssetSmoke(browser) {
    const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'allow' });
    const page = await context.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    try {
        const navigation = await openLiveStudyViaAlias(page);
        const version = await fetchLiveVersion(page);
        const deployedVersion = assertLiveVersion(version);
        const appRequest = assertVersionedAppRequest(requests, version);
        const assets = await fetchLiveAssets(page);
        assertLiveAssets(assets, version, deployedVersion);
        return liveAssetReport(version, deployedVersion, appRequest, assets, navigation);
    } finally {
        await context.close();
    }
}

async function openLiveStudyViaAlias(page) {
    const smokeId = Date.now();
    const aliasUrl = liveStudyAliasUrl(LIVE_ORIGIN, smokeId);
    const expectedUrl = liveStudyUrl(LIVE_ORIGIN);
    await page.goto(aliasUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForURL(expectedUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return { aliasUrl, studyUrl: page.url() };
}

async function fetchLiveVersion(page) {
    return await page.evaluate(async () => {
        const response = await fetch(`./version.json?smoke=${Date.now()}`, { cache: 'no-store' });
        return { status: response.status, json: await response.json() };
    });
}

function assertLiveVersion(version) {
    assert(version.status === 200, 'Live Study version.json did not load', version);
    assert(/^[a-f0-9]{12}$/i.test(version.json.appHash ?? ''), 'Live Study version.json has no 12-char app hash', version.json);
    const deployedVersion = versionFromBuildId(version.json.buildId, version.json.appHash);
    assert(deployedVersion, 'Live Study build id does not contain a deploy version and the current app hash', version.json);
    assertExpectedLiveVersion(version, deployedVersion);
    return deployedVersion;
}

function assertExpectedLiveVersion(version, deployedVersion) {
    if (!EXPECTED_LIVE_VERSION) return;
    assert(deployedVersion === EXPECTED_LIVE_VERSION, 'Live Study deployed version does not match the expected live version', {
        expected: EXPECTED_LIVE_VERSION,
        deployedVersion,
        version: version.json,
    });
}

function assertVersionedAppRequest(requests, version) {
    const appRequest = requests.find(isLiveAppRequest);
    assert(appRequest?.includes(`v=${version.json.appHash}`), 'Live Study did not request app.js with the version hash', { appRequest, version: version.json });
    return appRequest;
}

function isLiveAppRequest(url) {
    return isLiveStudyAppUrl(url);
}

async function fetchLiveAssets(page) {
    return await page.evaluate(async () => {
        const [index, serviceWorker, userscript, app] = await Promise.all([
            fetchTextAsset('./index.html'),
            fetchTextAsset('./sw.js'),
            fetchTextAsset('../yomu.user.js'),
            fetchTextAsset('./app.js'),
        ]);
        return { index, serviceWorker, userscript, app };

        async function fetchTextAsset(assetPath) {
            const response = await fetch(`${assetPath}?smoke=${Date.now()}`, { cache: 'no-store' });
            return { status: response.status, text: await response.text() };
        }
    });
}

function assertLiveAssets(assets, version, deployedVersion) {
    assertLiveIndexAsset(assets.index, version);
    assertLiveServiceWorkerAsset(assets.serviceWorker, version);
    assertLiveUserscriptAsset(assets.userscript, deployedVersion);
    assertLiveAppAsset(assets.app);
}

function assertLiveIndexAsset(index, version) {
    assert(index.status === 200, 'Live Study index did not load', { status: index.status });
    assert(index.text.includes(`./app.js?v=${version.json.appHash}`), 'Live Study index is not cache-busting app.js with the current hash', { status: index.status, appHash: version.json.appHash });
    assert(index.text.includes(version.json.buildId), 'Live Study index does not expose the current build id', { buildId: version.json.buildId });
}

function assertLiveServiceWorkerAsset(serviceWorker, version) {
    assert(serviceWorker.status === 200, 'Live Study service worker did not load', { status: serviceWorker.status });
    assert(serviceWorker.text.includes(`const APP_HASH = '${version.json.appHash}';`), 'Live Study service worker app hash does not match version.json', { appHash: version.json.appHash });
    assert(serviceWorker.text.includes('yomu-newtab-${APP_HASH}'), 'Live Study service worker cache name does not use APP_HASH');
    assert(serviceWorker.text.includes("cache: 'no-store'"), 'Live Study service worker does not network-first navigations with no-store');
}

function assertLiveUserscriptAsset(userscript, deployedVersion) {
    assert(userscript.status === 200, 'Live userscript did not load', { status: userscript.status });
    assert(userscript.text.startsWith('// ==UserScript=='), 'Live userscript did not load as a raw userscript', { status: userscript.status });
    assert(userscriptMetadataValues(userscript.text, 'version').includes(deployedVersion), 'Live userscript version does not match the live Study build version', { deployedVersion });
    assertNoRemoteExecutableMetadata(userscript.text);
    const violations = userscriptDistributionMetadataViolations(userscript.text, userscriptMetadataValues);
    assert(violations.length === 0, 'Live userscript advertises alternate or duplicate update/download URLs', { violations });
}

function assertLiveAppAsset(app) {
    assert(app.status === 200, 'Live Study app.js did not load', { status: app.status });
    assert(app.text.includes('__YOMU_READER_RUNTIME__'), 'Live Study app.js did not load expected runtime code', { status: app.status });
}

function liveAssetReport(version, deployedVersion, appRequest, assets, navigation) {
    return {
        origin: LIVE_ORIGIN,
        navigation,
        version: version.json,
        deployedVersion,
        localPackageVersion: pkg.version,
        appRequest,
        userscriptBytes: Buffer.byteLength(assets.userscript.text, 'utf8'),
        appBytes: Buffer.byteLength(assets.app.text, 'utf8'),
    };
}

function versionFromBuildId(buildId, appHash) {
    const suffix = `-${appHash}`;
    const value = String(buildId ?? '');
    if (!value.endsWith(suffix)) return '';
    return value.slice(0, -suffix.length);
}

async function runJishoAudioSmoke(browser, fixture) {
    const bridgeRequests = [];
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 900, height: 620 } });
    const page = await context.newPage();
    await page.exposeFunction('__yomuLiveSmokeHttpRequest', createLiveSmokeHttpRequestHandler(bridgeRequests));
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: jishoSettings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuLiveSmokeHttpRequest',
    });
    await page.addInitScript(() => {
        window.__yomuLiveSmokeAudioPlays = [];
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function play() {
            window.__yomuLiveSmokeAudioPlays.push(audioPlaybackSnapshot(this));
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.load = function load() {};
        window.__yomuLiveSmokeRestorePlay = () => { HTMLMediaElement.prototype.play = originalPlay; };

        function audioPlaybackSnapshot(element) {
            return {
                currentSrc: audioText(element.currentSrc),
                src: audioText(element.src),
                attrSrc: audioAttributeSrc(element),
                loop: Boolean(element.loop),
            };
        }

        function audioText(value) {
            return value || '';
        }

        function audioAttributeSrc(element) {
            if (!element.getAttribute) return '';
            return audioText(element.getAttribute('src'));
        }
    });

    try {
        await page.goto(`${fixture.baseUrl}/jisho.html`, { waitUntil: 'domcontentloaded' });
        await injectLocalUserscriptRuntime(page);
        await page.waitForSelector('.jpdb-reader-word[data-expression="下"][data-reading="した"]', { timeout: 12_000 });
        await page.locator('.jpdb-reader-word[data-expression="下"][data-reading="した"]').first().click();
        await waitFor(() => bridgeRequests.some(request => request.url === 'https://jisho.org/search/%E4%B8%8B'), 15_000, 'Jisho search request did not go through the userscript bridge');
        await waitFor(() => bridgeRequests.some(request => /audio|mp3|cloudfront/i.test(request.url) && request.url !== 'https://jisho.org/search/%E4%B8%8B'), 15_000, 'Jisho audio asset request did not go through the userscript bridge');
        await waitFor(async () => {
            const plays = await page.evaluate(() => window.__yomuLiveSmokeAudioPlays ?? []);
            return plays.some(play => [play.currentSrc, play.src, play.attrSrc].some(isAudiblePlaybackUrl));
        }, 8_000, async () => ({
            message: 'Jisho audio did not reach playback',
            bridgeRequests,
            plays: await page.evaluate(() => window.__yomuLiveSmokeAudioPlays ?? []),
            popoverText: await documentTextSnapshot(page),
        }));

        const plays = await page.evaluate(() => window.__yomuLiveSmokeAudioPlays ?? []);
        const searchRequests = bridgeRequests.filter(request => request.url.includes('jisho.org/search/'));
        const audioRequests = bridgeRequests.filter(request => isJishoAudioAssetRequest(request));
        assert(!bridgeRequests.some(request => request.url.startsWith(DEFAULT_YOMU_PUBLIC_PROXY_URL)), 'Jisho audio smoke used the default public proxy instead of the userscript bridge', { bridgeRequests });
        await page.screenshot({ path: path.join(ARTIFACTS, 'live-jisho-audio-smoke.png'), fullPage: false });
        return { searchRequests, audioRequests, plays };
    } finally {
        await page.evaluate(() => window.__yomuLiveSmokeRestorePlay?.()).catch(() => undefined);
        await context.close();
    }
}

function liveSmokeBridgeMock(request) {
    for (const respond of LIVE_SMOKE_BRIDGE_RESPONDERS) {
        const mocked = respond(request.url, request);
        if (mocked) return mocked;
    }
    return null;
}

const LIVE_SMOKE_BRIDGE_RESPONDERS = [
    liveSmokeJpdbApiResponse,
    liveSmokeExactTextResponse,
    liveSmokeAudioResponse,
    liveSmokePrefixTextResponse,
];

const LIVE_SMOKE_JPDB_VOCABULARY = [
    ['下', '下', 'した', 'below', ['n'], 400, ['not-in-deck'], ['LH']],
    ['読みます', '読む', 'よみます', 'to read', ['v5m'], 401, ['not-in-deck'], ['LHH']],
    ['読む', '読む', 'よむ', 'to read', ['v5m'], 401, ['not-in-deck'], ['LHH']],
];

const LIVE_SMOKE_JPDB_JSON = new Map([
    ['https://jpdb.io/api/v1/deck/list-vocabulary', { vocabulary: [] }],
    ['https://jpdb.io/api/v1/list-user-decks', { decks: [] }],
]);

const LIVE_SMOKE_EXACT_TEXT = new Map([
    ['https://jisho.org/search/%E4%B8%8B', {
        contentType: 'text/html; charset=utf-8',
        body: `
            <audio id="audio_下:した" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu-live-smoke-shita.mp3" type="audio/mpeg">
            </audio>
        `,
    }],
]);

const LIVE_SMOKE_PREFIX_TEXT = [
    { prefix: 'https://jpdb.io/search?', body: '<main></main>', contentType: 'text/html; charset=utf-8' },
    { prefix: 'https://jisho.org/search/', body: '<main></main>', contentType: 'text/html; charset=utf-8' },
];

function liveSmokeJpdbApiResponse(url, request) {
    const body = liveSmokeJpdbJsonBody(url, request);
    return body ? textBridgeResponse(url, request, JSON.stringify(body), 'application/json; charset=utf-8') : null;
}

function liveSmokeJpdbJsonBody(url, request) {
    if (url === 'https://jpdb.io/api/v1/parse') {
        return mockJpdbParseFromVocabulary(readJsonBody(request.data), LIVE_SMOKE_JPDB_VOCABULARY);
    }
    if (LIVE_SMOKE_JPDB_JSON.has(url)) return LIVE_SMOKE_JPDB_JSON.get(url);
    return url.startsWith('https://jpdb.io/api/v1/') ? {} : null;
}

function liveSmokeExactTextResponse(url, request) {
    const match = LIVE_SMOKE_EXACT_TEXT.get(url);
    return match ? textBridgeResponse(url, request, match.body, match.contentType) : null;
}

function liveSmokeAudioResponse(url, request) {
    return url === JISHO_AUDIO_URL ? bytesBridgeResponse(url, request, SILENT_WAV_BYTES, 'audio/mpeg') : null;
}

function liveSmokePrefixTextResponse(url, request) {
    const match = LIVE_SMOKE_PREFIX_TEXT.find(item => url.startsWith(item.prefix));
    return match ? textBridgeResponse(url, request, match.body, match.contentType) : null;
}

function createLiveSmokeHttpRequestHandler(bridgeRequests) {
    return async function handleLiveSmokeHttpRequest(request) {
        const mocked = liveSmokeBridgeMock(request);
        if (mocked) return recordMockedBridgeResponse(bridgeRequests, mocked);
        return await fetchLiveSmokeBridgeRequest(bridgeRequests, request);
    };
}

function recordMockedBridgeResponse(bridgeRequests, mocked) {
    bridgeRequests.push(mocked.summary);
    return mocked.response;
}

async function fetchLiveSmokeBridgeRequest(bridgeRequests, request) {
    const response = await fetch(request.url, liveSmokeBridgeFetchOptions(request));
    const bytes = [...new Uint8Array(await response.arrayBuffer())];
    const contentType = response.headers.get('content-type') ?? '';
    bridgeRequests.push(fetchedBridgeSummary(request, response, contentType));
    return fetchedBridgeResponse(response, bytes, contentType);
}

function liveSmokeBridgeFetchOptions(request) {
    return {
        method: bridgeRequestMethod(request),
        headers: request.headers || {},
        body: gmRequestFetchBody(request),
    };
}

function bridgeRequestMethod(request) {
    return request.method || 'GET';
}

function fetchedBridgeSummary(request, response, contentType) {
    return {
        url: request.url,
        status: response.status,
        contentType,
        responseType: request.responseType || '',
    };
}

function fetchedBridgeResponse(response, bytes, contentType) {
    return {
        status: response.status,
        bytes,
        contentType,
        responseText: Buffer.from(bytes).toString('utf8'),
    };
}

function textBridgeResponse(url, request, responseText, contentType = 'text/plain; charset=utf-8') {
    const bytes = [...Buffer.from(responseText, 'utf8')];
    return {
        summary: bridgeSummary(url, request, 200, contentType),
        response: { status: 200, bytes, contentType, responseText },
    };
}

function bytesBridgeResponse(url, request, bytesBuffer, contentType) {
    const bytes = [...bytesBuffer];
    return {
        summary: bridgeSummary(url, request, 200, contentType),
        response: { status: 200, bytes, contentType, responseText: bytesBuffer.toString('binary') },
    };
}

function bridgeSummary(url, request, status, contentType) {
    return { url, status, contentType, responseType: request.responseType || '', mocked: true };
}

function isAudiblePlaybackUrl(value) {
    return Boolean(value) && (value.startsWith('blob:')
        || (/^data:audio\//.test(value) && !value.includes('UklGRiYAAABX')));
}

function isJishoAudioAssetRequest(request) {
    return request.url !== 'https://jisho.org/search/%E4%B8%8B'
        && (/audio|mp3|cloudfront/i.test(request.url) || /^audio\//i.test(request.contentType));
}

async function runAnkiConnectSmoke() {
    const version = await ankiConnect({ action: 'version', version: 6 });
    const deckNames = await ankiConnect({ action: 'deckNames', version: 6 });
    assert(version.result === 6 && version.error === null, 'AnkiConnect version check failed', version);
    assert(Array.isArray(deckNames.result), 'AnkiConnect deckNames did not return an array', deckNames);
    return { url: ANKI_URL, version: version.result, deckCount: deckNames.result.length };
}

async function runHostedAnkiBridgeSmoke(browser, browserName) {
    const bridgeRequests = [];
    const { context, page, pageMessages } = await newHostedAnkiSmokePage(browser, { bypassCSP: true });
    await page.exposeFunction('__yomuLiveSmokeAnkiRequest', createHostedAnkiRequestHandler(bridgeRequests));
    await addGmXmlHttpRequestBridgeInitScript(page, { requestBridgeName: '__yomuLiveSmokeAnkiRequest' });
    try {
        await page.goto(liveHostedAnkiBridgeUrl(LIVE_ORIGIN, Date.now()), { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await injectLocalUserscriptRuntime(page);
        await page.waitForFunction(() => document.documentElement.dataset.yomuUserscriptHttpBridge === 'true', { timeout: 10_000 });
        const result = await page.evaluate(async ({ ankiUrl, requestEvent, responseEvent }) => {
            const id = `live-anki-${Date.now()}`;
            return await new Promise((resolve, reject) => {
                const timeout = window.setTimeout(() => {
                    cleanup();
                    reject(new Error('Timed out waiting for hosted Anki bridge response.'));
                }, 8_000);
                const cleanup = () => {
                    window.clearTimeout(timeout);
                    window.removeEventListener(responseEvent, onResponse);
                    document.documentElement.removeEventListener(responseEvent, onResponse);
                };
                const onResponse = event => {
                    const detail = typeof event.detail === 'string'
                        ? JSON.parse(event.detail)
                        : event.detail;
                    if (!detail || detail.id !== id) return;
                    cleanup();
                    resolve(detail);
                };
                window.addEventListener(responseEvent, onResponse);
                document.documentElement.addEventListener(responseEvent, onResponse);
                const options = {
                    method: 'POST',
                    url: ankiUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ action: 'version', version: 6 }),
                    responseType: 'json',
                    timeout: 5_000,
                };
                const eventDetail = { id, options };
                document.documentElement.dispatchEvent(new CustomEvent(requestEvent, { detail: eventDetail }));
            });
        }, { ankiUrl: ANKI_URL, requestEvent: BRIDGE_REQUEST_EVENT, responseEvent: BRIDGE_RESPONSE_EVENT });

        assert(result.kind === 'load', 'Hosted Anki bridge did not return a load response', { browserName, result, pageMessages });
        assert(result.response?.status === 200, 'Hosted Anki bridge response was not HTTP 200', { browserName, result, pageMessages });
        assert(result.response?.response?.result === 6, 'Hosted Anki bridge did not reach local AnkiConnect API version 6', { browserName, result, bridgeRequests, pageMessages });
        assert(bridgeRequests.some(request => request.url === ANKI_URL && request.method === 'POST'), 'Hosted Anki bridge did not use GM_xmlhttpRequest for local AnkiConnect', { browserName, bridgeRequests, pageMessages });

        return {
            browser: browserName,
            readyEvent: USERSCRIPT_HTTP_BRIDGE_READY_EVENT,
            requestTarget: 'documentElement',
            requestCount: bridgeRequests.length,
            ankiVersion: result.response.response.result,
        };
    } finally {
        await context.close();
    }
}

async function runHostedClickedWordAnkiStatusSmoke(browser, browserName) {
    const bridgeRequests = [];
    const { context, page, pageMessages } = await newHostedAnkiSmokePage(browser, { bypassCSP: true, viewport: { width: 980, height: 680 } });
    await page.exposeFunction('__yomuLiveSmokeAnkiStatusRequest', createHostedAnkiStatusRequestHandler(bridgeRequests));
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: ankiStatusSettings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuLiveSmokeAnkiStatusRequest',
    });

    try {
        await page.goto(`${LIVE_ORIGIN}/?yomu-anki-status-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.evaluate(html => {
            document.body.innerHTML = html;
            document.title = 'Yomu hosted Anki status smoke';
        }, hostedAnkiStatusFixtureHtml);
        await injectLocalUserscriptRuntime(page);
        await page.waitForFunction(() => document.documentElement.dataset.yomuUserscriptHttpBridge === 'true', { timeout: 10_000 });
        await page.waitForSelector(HOSTED_ANKI_STATUS_WORD_SELECTOR, { timeout: 12_000 });
        await page.waitForFunction(selector => {
            const word = document.querySelector(selector);
            return word instanceof HTMLElement
                && word.dataset.ankiState === 'due'
                && word.classList.contains('anki-due');
        }, HOSTED_ANKI_STATUS_WORD_SELECTOR, { timeout: 12_000 });

        await page.locator(HOSTED_ANKI_STATUS_WORD_SELECTOR).first().click({ force: true });
        await page.waitForSelector(HOSTED_ANKI_EXISTING_SELECTOR, { timeout: 8_000 });
        await waitForSelectorText(page, HOSTED_ANKI_EXISTING_SELECTOR, {
            includes: HOSTED_ANKI_STATUS_TERMS,
        });
        await waitForSelectorText(page, HOSTED_ANKI_EXISTING_SELECTOR, {
            includes: HOSTED_ANKI_RENDERED_TERMS,
            excludes: HOSTED_ANKI_RAW_FIELD_TERMS,
        });

        const snapshot = await page.evaluate(hostedAnkiStatusSnapshotFromDom);

        assert(snapshot.word?.ankiState === 'due', 'Hosted clicked word did not keep Anki due status', { browserName, snapshot, bridgeRequests, pageMessages });
        assert(snapshot.hasExisting, 'Hosted clicked word popover did not render existing Anki details', { browserName, snapshot, bridgeRequests, pageMessages });
        assert(!snapshot.hasAdd && snapshot.hasMerge && snapshot.hasEdit, 'Hosted clicked word did not expose existing-card Anki actions', { browserName, snapshot, bridgeRequests, pageMessages });
        assert(hostedAnkiActions(bridgeRequests).includes('multi'), 'Hosted clicked word status did not use Anki lookup through the userscript bridge', { browserName, bridgeRequests, pageMessages });
        assert(hostedAnkiActions(bridgeRequests).includes('areDue'), 'Hosted clicked word status did not hydrate detailed Anki due status', { browserName, bridgeRequests, pageMessages });

        await page.screenshot({ path: path.join(ARTIFACTS, `live-hosted-anki-status-${browserName}.png`), fullPage: false });
        return {
            browser: browserName,
            href: snapshot.href,
            word: snapshot.word,
            hasExisting: snapshot.hasExisting,
            actions: hostedAnkiActions(bridgeRequests),
            requestCount: bridgeRequests.length,
        };
    } finally {
        await context.close();
    }
}

async function injectLocalUserscriptRuntime(page) {
    for (const scriptPath of COMPANION_SCRIPT_PATHS) await page.addScriptTag({ path: scriptPath });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
}

async function newHostedAnkiSmokePage(browser, contextOptions) {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const pageMessages = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') pageMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', error => pageMessages.push(`pageerror: ${firstErrorLine(error)}`));
    return { context, page, pageMessages };
}

// Browser-serialized DOM snapshot must stay self-contained for page.evaluate.
// fallow-ignore-next-line complexity
function hostedAnkiStatusSnapshotFromDom() {
    const word = document.querySelector('.yomu-live-anki-status-fixture .jpdb-reader-word[data-expression="読む"]');
    const popover = document.querySelector('.jpdb-reader-popover');
    const existing = popover?.querySelector('.jpdb-reader-anki-existing');
    const add = popover?.querySelector('[data-action="anki"]');
    const merge = popover?.querySelector('[data-action="anki-merge"]');
    const edit = popover?.querySelector('[data-action="anki-edit"]');
    const wordSnapshot = word instanceof HTMLElement
        ? {
            text: word.textContent ?? '',
            expression: word.dataset.expression ?? '',
            reading: word.dataset.reading ?? '',
            ankiState: word.dataset.ankiState ?? '',
            classes: [...word.classList],
            title: word.title,
        }
        : null;
    return {
        href: location.href,
        bridgeReady: document.documentElement.dataset.yomuUserscriptHttpBridge === 'true',
        word: wordSnapshot,
        popoverText: popover?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        hasExisting: Boolean(existing),
        hasAdd: Boolean(add),
        hasMerge: Boolean(merge),
        hasEdit: Boolean(edit),
    };
}

function createHostedAnkiRequestHandler(bridgeRequests) {
    return async function handleHostedAnkiRequest(request) {
        bridgeRequests.push(hostedAnkiRequestSummary(request));
        const response = await fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: gmRequestFetchBody(request),
        });
        const responseText = await response.text();
        return hostedAnkiResponse(request, response, responseText);
    };
}

function createHostedAnkiStatusRequestHandler(bridgeRequests) {
    return async function handleHostedAnkiStatusRequest(request) {
        if (isAnkiConnectRequest(request)) return recordMockedBridgeResponse(bridgeRequests, hostedAnkiStatusResponse(request));
        const mocked = liveSmokeBridgeMock(request);
        if (mocked) return recordMockedBridgeResponse(bridgeRequests, mocked);
        return await fetchLiveSmokeBridgeRequest(bridgeRequests, request);
    };
}

function isAnkiConnectRequest(request) {
    try {
        return new URL(request.url).origin === new URL(ANKI_URL).origin;
    } catch {
        return false;
    }
}

function hostedAnkiStatusResponse(request) {
    const body = readJsonBody(request.data);
    const response = mockAnkiConnectResponse(body, resolveHostedAnkiStatusAction);
    const responseText = JSON.stringify(response);
    return {
        summary: hostedAnkiStatusRequestSummary(request, body),
        response: {
            status: 200,
            contentType: 'application/json; charset=utf-8',
            responseText,
            response,
            bytes: [...Buffer.from(responseText, 'utf8')],
        },
    };
}

function hostedAnkiStatusRequestSummary(request, body) {
    const action = String(body.action ?? '');
    const params = body.params ?? {};
    return {
        kind: 'anki',
        mocked: true,
        method: requestMethod(request),
        url: request.url,
        responseType: requestResponseType(request),
        action,
        actions: hostedAnkiStatusActions(action, params),
        params,
    };
}

function requestMethod(request) {
    return request.method || 'GET';
}

function requestResponseType(request) {
    return request.responseType || '';
}

function hostedAnkiStatusActions(action, params) {
    if (action !== 'multi') return [action].filter(Boolean);
    return arrayParam(params?.actions)
        .map(item => String(item?.action ?? ''))
        .filter(Boolean);
}

function resolveHostedAnkiStatusAction(action, params, context) {
    return resolveAnkiAction(action, params, HOSTED_ANKI_STATUS_HANDLERS, context);
}

const HOSTED_ANKI_STATUS_HANDLERS = {
    version: () => 6,
    deckNames: () => ['Mining'],
    getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 1 } }),
    findCards: params => hostedAnkiFindCards(String(params.query ?? '')),
    findNotes: params => hostedAnkiFindNotes(String(params.query ?? '')),
    notesInfo: params => arrayParam(params.notes).map(() => hostedAnkiNoteInfo()),
    cardsInfo: params => arrayParam(params.cards).map(cardId => hostedAnkiCardInfo(Number(cardId))),
    areDue: params => arrayParam(params.cards).map(cardId => Number(cardId) === 8801),
    canAddNotes: params => arrayParam(params.notes).map(() => false),
};

function hostedAnkiFindCards(query) {
    if (query === 'deck:*' || query.includes('is:due') || query.includes('is:learn')) return [8801];
    return [];
}

function hostedAnkiFindNotes(query) {
    return /読む|よむ|読みます|よみます/.test(query) ? [9901] : [];
}

function hostedAnkiNoteInfo() {
    return {
        noteId: 9901,
        modelName: 'よむ Japanese',
        tags: ['yomu-live-smoke'],
        fields: {
            Expression: { value: '読む', order: 0 },
            Reading: { value: 'よむ', order: 1 },
            Meaning: { value: 'to read', order: 2 },
            Sentence: { value: '今日は本を読む。', order: 3 },
            DictionaryDefinitions: { value: 'to read', order: 12 },
        },
        cards: [8801],
    };
}

function hostedAnkiCardInfo(cardId) {
    return {
        cardId: cardId || 8801,
        note: 9901,
        deckName: 'Mining',
        cardName: 'Recognition',
        queue: 2,
        type: 2,
        due: 1,
        reps: 12,
        lapses: 1,
        interval: 15,
        question: '<div>読む</div>',
        answer: '<div>to read</div>',
    };
}

function hostedAnkiActions(bridgeRequests) {
    return bridgeRequests
        .flatMap(request => request.kind === 'anki' ? hostedAnkiRequestActions(request) : [])
        .filter(Boolean);
}

function hostedAnkiRequestActions(request) {
    return request.action === 'multi' ? [request.action, ...(request.actions ?? [])] : [request.action];
}

function hostedAnkiRequestSummary(request) {
    return {
        method: request.method || 'GET',
        url: request.url,
        responseType: request.responseType || '',
    };
}

function hostedAnkiResponse(request, response, responseText) {
    return {
        status: response.status,
        finalUrl: response.url,
        responseText,
        response: request.responseType === 'json' ? JSON.parse(responseText) : responseText,
    };
}

async function ankiConnect(body) {
    const response = await fetch(ANKI_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    assert(response.ok, 'AnkiConnect HTTP request failed', { status: response.status });
    return await response.json();
}

async function waitFor(predicate, timeoutMs, messageOrDetails) {
    if (await waitUntil(predicate, timeoutMs)) return;
    const details = await waitForDetails(messageOrDetails);
    throw new Error(`${waitForMessage(details)}\n${JSON.stringify(details, null, 2)}`);
}

async function waitUntil(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (await predicate()) return true;
        await waitForPollInterval();
    }
    return false;
}

function waitForPollInterval() {
    return new Promise(resolve => setTimeout(resolve, 100));
}

async function waitForDetails(messageOrDetails) {
    return typeof messageOrDetails === 'function' ? await messageOrDetails() : { message: messageOrDetails };
}

function waitForMessage(details) {
    return details?.message ?? 'Timed out waiting for condition';
}

async function documentTextSnapshot(page) {
    return await page.evaluate(() => (document.querySelector('.jpdb-reader-popover')?.textContent ?? document.body.textContent ?? '').slice(0, 1200));
}

async function main() {
    assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT);
    mkdirSync(ARTIFACTS, { recursive: true });
    const fixture = await createFixtureServer();
    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    try {
        const liveAssets = await runLiveAssetSmoke(browser);
        const jishoAudio = await runJishoAudioSmoke(browser, fixture);
        const ankiConnect = await runAnkiConnectSmoke();
        const hostedAnkiBridge = [await runHostedAnkiBridgeSmoke(browser, 'chromium')];
        const hostedClickedWordAnkiStatus = [await runHostedClickedWordAnkiStatusSmoke(browser, 'chromium')];
        const firefoxLaunch = await launchOptionalBrowser(firefox, 'firefox', { headless: true });
        if (firefoxLaunch.browser) {
            try {
                hostedAnkiBridge.push(await runHostedAnkiBridgeSmoke(firefoxLaunch.browser, 'firefox'));
                hostedClickedWordAnkiStatus.push(await runHostedClickedWordAnkiStatusSmoke(firefoxLaunch.browser, 'firefox'));
            } finally {
                await firefoxLaunch.browser.close().catch(() => undefined);
            }
        } else {
            hostedAnkiBridge.push({ browser: 'firefox', skipped: true, reason: firefoxLaunch.reason });
            hostedClickedWordAnkiStatus.push({ browser: 'firefox', skipped: true, reason: firefoxLaunch.reason });
        }
        const report = { liveAssets, jishoAudio, ankiConnect, hostedAnkiBridge, hostedClickedWordAnkiStatus };
        writeFileSync(path.join(ARTIFACTS, 'live-browser-smoke.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await closeSmokeBrowserAndServer(browser, fixture.server);
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
