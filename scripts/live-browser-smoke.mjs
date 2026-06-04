#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import pkg from '../package.json' with { type: 'json' };

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const LIVE_ORIGIN = (process.env.YOMU_LIVE_ORIGIN || pkg.homepage || 'https://hrussellzfac023.github.io/yomu-reader/').replace(/\/+$/, '');
const EXPECTED_LIVE_VERSION = process.env.YOMU_LIVE_EXPECT_VERSION
    || (process.env.YOMU_LIVE_EXPECT_PACKAGE_VERSION === '1' ? pkg.version : '');
const USERSCRIPT_PATH = path.join(DIST, 'yomu.user.js');
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

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

function assertBuiltArtifacts() {
    for (const filePath of [USERSCRIPT_PATH, CSS_PATH]) {
        assert(existsSync(filePath), `Missing built artifact: ${path.relative(ROOT, filePath)}. Run npm run build first.`);
    }
}

function createFixtureServer() {
    const html = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<title>Yomu live browser smoke</title>
<main style="font: 28px/1.8 system-ui; margin: 48px;">下を見ます。</main>`;
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/' || url.pathname === '/jisho.html') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(html);
            return;
        }
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') reject(new Error('Could not bind live smoke server'));
            else resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
    });
}

async function runLiveAssetSmoke(browser) {
    const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'allow' });
    const page = await context.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const cacheBust = Date.now();
    try {
        await page.goto(`${LIVE_ORIGIN}/newtab/index.html?yomu-smoke=${cacheBust}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        const version = await page.evaluate(async () => {
            const response = await fetch(`./version.json?smoke=${Date.now()}`, { cache: 'no-store' });
            return { status: response.status, json: await response.json() };
        });
        assert(version.status === 200, 'Live newtab version.json did not load', version);
        assert(/^[a-f0-9]{12}$/i.test(version.json.appHash ?? ''), 'Live newtab version.json has no 12-char app hash', version.json);
        const deployedVersion = versionFromBuildId(version.json.buildId, version.json.appHash);
        assert(deployedVersion, 'Live newtab build id does not contain a deploy version and the current app hash', version.json);
        if (EXPECTED_LIVE_VERSION) {
            assert(deployedVersion === EXPECTED_LIVE_VERSION, 'Live newtab deployed version does not match the expected live version', {
                expected: EXPECTED_LIVE_VERSION,
                deployedVersion,
                version: version.json,
            });
        }

        const appRequest = requests.find(url => url.includes('/newtab/app.js'));
        assert(appRequest?.includes(`v=${version.json.appHash}`), 'Live newtab did not request app.js with the version hash', { appRequest, version: version.json });

        const assets = await page.evaluate(async () => {
            const [index, serviceWorker, userscript, app] = await Promise.all([
                fetch(`./index.html?smoke=${Date.now()}`, { cache: 'no-store' }).then(async response => ({ status: response.status, text: await response.text() })),
                fetch(`./sw.js?smoke=${Date.now()}`, { cache: 'no-store' }).then(async response => ({ status: response.status, text: await response.text() })),
                fetch(`../yomu.user.js?smoke=${Date.now()}`, { cache: 'no-store' }).then(async response => ({ status: response.status, text: await response.text() })),
                fetch(`./app.js?smoke=${Date.now()}`, { cache: 'no-store' }).then(async response => ({ status: response.status, text: await response.text() })),
            ]);
            return { index, serviceWorker, userscript, app };
        });

        assert(assets.index.status === 200 && assets.index.text.includes(`./app.js?v=${version.json.appHash}`), 'Live newtab index is not cache-busting app.js with the current hash', { status: assets.index.status, appHash: version.json.appHash });
        assert(assets.index.text.includes(version.json.buildId), 'Live newtab index does not expose the current build id', { buildId: version.json.buildId });
        assert(
            assets.serviceWorker.status === 200
                && assets.serviceWorker.text.includes(`const APP_HASH = '${version.json.appHash}';`)
                && assets.serviceWorker.text.includes('yomu-newtab-${APP_HASH}'),
            'Live newtab service worker cache name does not match the current app hash',
            { status: assets.serviceWorker.status, appHash: version.json.appHash },
        );
        assert(assets.serviceWorker.text.includes("cache: 'no-store'"), 'Live newtab service worker does not network-first navigations with no-store');
        assert(assets.userscript.status === 200 && assets.userscript.text.startsWith('// ==UserScript=='), 'Live userscript did not load as a raw userscript', { status: assets.userscript.status });
        assert(assets.userscript.text.includes(`// @version      ${deployedVersion}`), 'Live userscript version does not match the live newtab build version', { deployedVersion });
        assert(!/^\/\/ @require\s+/m.test(assets.userscript.text), 'Live userscript unexpectedly contains remote executed @require code');
        assert(!assets.userscript.text.includes('// @downloadURL') && !assets.userscript.text.includes('// @updateURL'), 'Live userscript should not advertise alternate update/download URLs');
        assert(assets.app.status === 200 && assets.app.text.includes('__YOMU_READER_RUNTIME__'), 'Live newtab app.js did not load expected runtime code', { status: assets.app.status });

        return {
            origin: LIVE_ORIGIN,
            version: version.json,
            deployedVersion,
            localPackageVersion: pkg.version,
            appRequest,
            userscriptBytes: Buffer.byteLength(assets.userscript.text, 'utf8'),
            appBytes: Buffer.byteLength(assets.app.text, 'utf8'),
        };
    } finally {
        await context.close();
    }
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
    await page.exposeFunction('__yomuLiveSmokeHttpRequest', async request => {
        const mocked = liveSmokeBridgeMock(request);
        if (mocked) {
            bridgeRequests.push(mocked.summary);
            return mocked.response;
        }
        const response = await fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: request.data || undefined,
        });
        const bytes = [...new Uint8Array(await response.arrayBuffer())];
        const contentType = response.headers.get('content-type') ?? '';
        bridgeRequests.push({ url: request.url, status: response.status, contentType, responseType: request.responseType || '' });
        return {
            status: response.status,
            bytes,
            contentType,
            responseText: Buffer.from(bytes).toString('utf8'),
        };
    });
    await page.addInitScript(({ settings, css, key }) => {
        const memoryStore = new Map([[key, settings]]);
        const readStoredValue = (storeKey, fallback) => memoryStore.has(storeKey) ? memoryStore.get(storeKey) : fallback;
        window.GM_getValue = (storeKey, fallback) => readStoredValue(storeKey, fallback);
        window.GM_setValue = (storeKey, value) => { memoryStore.set(storeKey, value); };
        window.GM_deleteValue = storeKey => { memoryStore.delete(storeKey); };
        window.GM_listValues = () => [...memoryStore.keys()];
        window.GM_registerMenuCommand = () => undefined;
        window.GM_addStyle = styleText => {
            const style = document.createElement('style');
            style.textContent = styleText;
            document.documentElement.append(style);
            return style;
        };
        window.GM_getResourceText = name => name === 'yomuCss' ? css : '';
        window.__yomuLiveSmokeAudioPlays = [];
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function play() {
            window.__yomuLiveSmokeAudioPlays.push({
                currentSrc: this.currentSrc || '',
                src: this.src || '',
                attrSrc: this.getAttribute?.('src') || '',
                loop: Boolean(this.loop),
            });
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.load = function load() {};
        window.__yomuLiveSmokeRestorePlay = () => { HTMLMediaElement.prototype.play = originalPlay; };
        window.GM_xmlhttpRequest = options => {
            Promise.resolve(window.__yomuLiveSmokeHttpRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data: options.data ?? '',
                responseType: options.responseType || '',
            })).then(result => {
                const bytes = new Uint8Array(result.bytes ?? []);
                const response = options.responseType === 'blob'
                    ? new Blob([bytes], { type: result.contentType || 'application/octet-stream' })
                    : options.responseType === 'arraybuffer'
                        ? bytes.buffer
                        : result.responseText;
                options.onload?.({
                    status: result.status,
                    response,
                    responseText: result.responseText,
                });
            }).catch(error => options.onerror?.(error));
        };
        window.GM = { xmlHttpRequest: window.GM_xmlhttpRequest, xmlhttpRequest: window.GM_xmlhttpRequest };
    }, { settings: jishoSettings, css: readFileSync(CSS_PATH, 'utf8'), key: SETTINGS_KEY });

    try {
        await page.goto(`${fixture.baseUrl}/jisho.html`, { waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
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
    const url = request.url;
    if (url === 'https://jpdb.io/api/v1/parse') {
        return textBridgeResponse(url, request, JSON.stringify({
            vocabulary: [[101, 201, 0, '下', 'した', 400, ['n'], [['below']], [['n']], ['not-in-deck'], ['LH']]],
            tokens: [[[0, 0, 1, [['下', 'した']]]]],
        }), 'application/json; charset=utf-8');
    }
    if (url === 'https://jpdb.io/api/v1/deck/list-vocabulary') {
        return textBridgeResponse(url, request, JSON.stringify({ vocabulary: [] }), 'application/json; charset=utf-8');
    }
    if (url === 'https://jpdb.io/api/v1/list-user-decks') {
        return textBridgeResponse(url, request, JSON.stringify({ decks: [] }), 'application/json; charset=utf-8');
    }
    if (url.startsWith('https://jpdb.io/api/v1/')) {
        return textBridgeResponse(url, request, JSON.stringify({}), 'application/json; charset=utf-8');
    }
    if (url === 'https://jisho.org/search/%E4%B8%8B') {
        return textBridgeResponse(url, request, `
            <audio id="audio_下:した" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu-live-smoke-shita.mp3" type="audio/mpeg">
            </audio>
        `, 'text/html; charset=utf-8');
    }
    if (url === JISHO_AUDIO_URL) {
        return bytesBridgeResponse(url, request, SILENT_WAV_BYTES, 'audio/mpeg');
    }
    if (url.startsWith('https://jpdb.io/search?')) {
        return textBridgeResponse(url, request, '<main></main>', 'text/html; charset=utf-8');
    }
    if (url.startsWith('https://jisho.org/search/')) {
        return textBridgeResponse(url, request, '<main></main>', 'text/html; charset=utf-8');
    }
    return null;
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
    const context = await browser.newContext({ bypassCSP: true });
    const page = await context.newPage();
    const pageMessages = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') pageMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', error => pageMessages.push(`pageerror: ${firstErrorLine(error)}`));
    await page.exposeFunction('__yomuLiveSmokeAnkiRequest', async request => {
        bridgeRequests.push({
            method: request.method || 'GET',
            url: request.url,
            responseType: request.responseType || '',
        });
        const response = await fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: request.data || undefined,
        });
        const responseText = await response.text();
        return {
            status: response.status,
            finalUrl: response.url,
            responseText,
            response: request.responseType === 'json' ? JSON.parse(responseText) : responseText,
        };
    });
    await page.addInitScript(() => {
        window.GM_registerMenuCommand = () => undefined;
        window.GM_xmlhttpRequest = options => {
            Promise.resolve(window.__yomuLiveSmokeAnkiRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data: options.data ?? '',
                responseType: options.responseType || '',
            })).then(response => options.onload?.(response))
                .catch(error => options.onerror?.(error));
        };
        window.GM = { xmlHttpRequest: window.GM_xmlhttpRequest, xmlhttpRequest: window.GM_xmlhttpRequest };
    });
    try {
        await page.goto(`${LIVE_ORIGIN}/newtab/index.html?yomu-anki-bridge-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
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
                window.dispatchEvent(new CustomEvent(requestEvent, { detail: eventDetail }));
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
            requestCount: bridgeRequests.length,
            ankiVersion: result.response.response.result,
        };
    } finally {
        await context.close();
    }
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

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

async function waitFor(predicate, timeoutMs, messageOrDetails) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (await predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const details = typeof messageOrDetails === 'function' ? await messageOrDetails() : { message: messageOrDetails };
    const message = details?.message ?? 'Timed out waiting for condition';
    throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
}

async function documentTextSnapshot(page) {
    return await page.evaluate(() => (document.querySelector('.jpdb-reader-popover')?.textContent ?? document.body.textContent ?? '').slice(0, 1200));
}

async function launchSmokeBrowser(browserType, browserName, options) {
    const configuredChannel = process.env.YOMU_PLAYWRIGHT_CHANNEL;
    if (configuredChannel && browserName === 'chromium') return chromium.launch({ ...options, channel: configuredChannel });
    try {
        return await browserType.launch(options);
    } catch (error) {
        if (browserName !== 'chromium' || !isMissingBrowserExecutable(error)) throw error;
        return chromium.launch({ ...options, channel: 'chrome' });
    }
}

async function launchOptionalBrowser(browserType, browserName, options) {
    try {
        return { browser: await launchSmokeBrowser(browserType, browserName, options) };
    } catch (error) {
        if (!isMissingBrowserExecutable(error)) throw error;
        return { skipped: true, browserName, reason: firstErrorLine(error) };
    }
}

function isMissingBrowserExecutable(error) {
    const message = String(error?.message ?? '');
    return message.includes("Executable doesn't exist") || /playwright install/i.test(message);
}

function firstErrorLine(error) {
    return String(error?.message ?? error).split('\n').find(Boolean) ?? 'Browser executable is unavailable.';
}

async function main() {
    assertBuiltArtifacts();
    mkdirSync(ARTIFACTS, { recursive: true });
    const fixture = await createFixtureServer();
    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    try {
        const liveAssets = await runLiveAssetSmoke(browser);
        const jishoAudio = await runJishoAudioSmoke(browser, fixture);
        const ankiConnect = await runAnkiConnectSmoke();
        const hostedAnkiBridge = [await runHostedAnkiBridgeSmoke(browser, 'chromium')];
        const firefoxLaunch = await launchOptionalBrowser(firefox, 'firefox', { headless: true });
        if (firefoxLaunch.browser) {
            try {
                hostedAnkiBridge.push(await runHostedAnkiBridgeSmoke(firefoxLaunch.browser, 'firefox'));
            } finally {
                await firefoxLaunch.browser.close().catch(() => undefined);
            }
        } else {
            hostedAnkiBridge.push({ browser: 'firefox', skipped: true, reason: firefoxLaunch.reason });
        }
        const report = { liveAssets, jishoAudio, ankiConnect, hostedAnkiBridge };
        writeFileSync(path.join(ARTIFACTS, 'live-browser-smoke.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await browser.close().catch(() => undefined);
        await new Promise(resolve => fixture.server.close(resolve));
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
