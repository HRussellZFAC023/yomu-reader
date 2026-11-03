#!/usr/bin/env node
// Deterministic provider-response fixtures against the built Study UI. Native
// fetch, media decoding, play(), and user activation remain real browser code.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const paths = createSmokePaths(import.meta.dirname);
const artifactDir = path.join(paths.artifacts, 'study-audio-cors', 'latest');
mkdirSync(artifactDir, { recursive: true });
const app = readFileSync(path.join(paths.newTabDir, 'app.js'));
const publicRoot = path.join(paths.root, 'docs', 'public');
const studyOrigin = 'https://yomureader.com';
const audioBytes = toneWav();
const hostedClip = 'https://audio.yomureader.com/audio/fixture.wav';
const blockedClip = 'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/pronunciation/fixture.wav';
const proxyHosts = new Set([
    'edge.yomureader.com',
    'yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev',
]);
const settings = {
    onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: 'en',
    apiKey: '', jitenApiKey: '', ankiEnabled: false, ankiSectionEnabled: false,
    jpdbDefinitionsEnabled: false, jitenDefinitionsEnabled: false,
    localDictionariesEnabled: false, immersionKitEnabled: false,
    newTabSource: 'dictionary', newTabParsingEnabled: false,
    studyTranslationEnabled: false, studyGrammarEnabled: false,
    audioEnabled: true, autoPlayAudio: false, audioViaBlob: true,
    audioFallbackChimeEnabled: false, audioTimeoutMs: 1500,
    audioSelectionMode: 'first', audioTtsMode: 'fallback',
    corsProxyUrl: '',
};
const server = await startLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Audio CORS negative control</title>');
}, 'Study audio fixture origin');
const mediaServer = await startLoopbackServer((_request, response) => {
    // A separate origin deliberately omits Access-Control-Allow-Origin.
    response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': audioBytes.length });
    response.end(audioBytes);
}, 'Study audio fixture media');
const managerClip = `${mediaServer.origin.replace('127.0.0.1', 'audio.localhost')}/fixture.wav`;
const cors = { 'access-control-allow-origin': '*' };
const scenarioAssertions = {
    'hosted-default': ({ requests, completed }) => {
            assert(requests.some(request => new URL(request.url).origin === 'https://audio.yomureader.com' && new URL(request.url).searchParams.get('term')), 'Default hosted JSON was not requested for a Study headword.', { requests });
            assert(requests.some(request => request.url === hostedClip), 'The hosted clip was not requested.', { requests });
            assert(completed.every(event => event.src.startsWith('blob:')), 'The hosted media did not use the decoded Blob.', { completed });
    },
    'hosted-optional-cors-provider': ({ requests }) => {
            assert(requests.some(request => proxyHosts.has(new URL(request.url).hostname) && new URL(request.url).searchParams.get('url') === blockedClip), 'The known blocked optional provider did not use public transport.', { requests });
            assert(!requests.some(request => request.url === blockedClip), 'The optional provider made a doomed direct CORS request.', { requests });
    },
    'hosted-loopback-without-cors': ({ audio, completed }) => {
            assert(!audio.fetches.some(url => url.startsWith(mediaServer.origin)), 'Loopback media was fetched instead of played directly.', audio);
            assert(completed.every(event => event.src === `${mediaServer.origin}/fixture.wav`), 'The no-CORS loopback clip did not play directly.', { completed });
    },
    'installed-manager-fallback': ({ audio, bridgeRequests, expectedCorsErrors }) => {
            assert(audio.fetches.includes(managerClip), 'Installed Study did not try the real browser fetch path.', audio);
            assert(bridgeRequests.some(request => request.url === managerClip && request.responseType === 'blob'), 'Failed browser fetch did not fall back to the installed manager.', { bridgeRequests });
            assert(expectedCorsErrors.some(error => error.includes(managerClip) && error.includes('Access-Control-Allow-Origin')), 'Installed fallback fixture did not encounter its missing-CORS-header rejection.');
    },
};


const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const scenarios = [];
try {
    scenarios.push(await checkCorsAndCodec());
    scenarios.push(await checkStudy('hosted-default', {
        audioEnableDefaultSources: true, audioSources: [],
    }));
    scenarios.push(await checkStudy('hosted-optional-cors-provider', {
        audioEnableDefaultSources: false,
        audioSources: [{ type: 'custom', url: blockedClip, voice: '', enabled: true }],
    }));
    scenarios.push(await checkStudy('hosted-loopback-without-cors', {
        audioEnableDefaultSources: false,
        audioSources: [{ type: 'custom', url: `${mediaServer.origin}/fixture.wav`, voice: '', enabled: true }],
    }));
    scenarios.push(await checkStudy('installed-manager-fallback', {
        audioEnableDefaultSources: false,
        audioSources: [{ type: 'custom', url: managerClip, voice: '', enabled: true }],
    }, true));
} finally {
    await browser.close();
    await Promise.all([server.close(), mediaServer.close()]);
}
const summary = { fixture: true, generatedAt: new Date().toISOString(), scenarios };
writeFileSync(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (scenarios.some(result => result.status !== 'pass')) process.exitCode = 1;

async function checkCorsAndCodec() {
    const page = await browser.newPage();
    try {
        await page.goto(server.origin);
        const result = await page.evaluate(async ({ mediaUrl, bytes }) => {
            let corsBlocked = false;
            try { await fetch(mediaUrl); } catch { corsBlocked = true; }
            const context = new AudioContext();
            try {
                const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer);
                return { corsBlocked, decodedFrames: decoded.length, duration: decoded.duration };
            } finally { await context.close(); }
        }, { mediaUrl: `${mediaServer.origin}/fixture.wav`, bytes: [...audioBytes] });
        assert(result.corsBlocked, 'The negative control did not enforce the CORS boundary.', result);
        assert(result.decodedFrames > 0 && result.duration > 0.3, 'The browser cannot decode the WAV fixture.', result);
        return { name: 'cors-and-codec-preconditions', status: 'pass', ...result };
    } catch (error) {
        return { name: 'cors-and-codec-preconditions', status: 'fail', error: error.message };
    } finally { await page.close(); }
}

async function checkStudy(name, audioSettings, installed = false) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1100, height: 760 } });
    // Chromium separately asks a hosted page for local-network permission.
    // This guard tests CORS after that user-controlled prerequisite is granted.
    await context.grantPermissions(['local-network-access'], { origin: studyOrigin });
    const page = await context.newPage();
    const requests = [];
    const bridgeRequests = [];
    const pageErrors = [];
    const expectedCorsErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && /cors|access-control|ERR_FAILED/i.test(message.text())) expectedCorsErrors.push(message.text());
    });
    await page.route('https://**/*', route => routeStudyFixture(route, requests));
    const commit = `study-audio-${name}`;
    const value = { ...settings, ...audioSettings, __yomuSettingsPersistenceCommitV1: commit };
    const ledger = {
        __yomuSettingsPersistenceCommitV1: commit,
        revision: 1,
        records: Object.fromEntries(Object.entries(value).map(([key, value]) => [key, { seq: 1, value }])),
    };
    if (installed) {
        await page.exposeFunction('__studyAudioManager', async request => {
            if (request.url !== managerClip) return { status: 404, responseText: '' };
            bridgeRequests.push({ url: request.url, responseType: request.responseType });
            // The fixture manager fetches a real no-CORS media response outside
            // the page origin, then the actual GM adapter constructs its Blob.
            const response = await fetch(`${mediaServer.origin}/fixture.wav`);
            return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())], contentType: 'audio/wav' };
        });
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY, value, requestBridgeName: '__studyAudioManager',
            intentLedger: { key: 'yomu:settings-intent:v2', value: ledger },
        });
    }
    await page.addInitScript(({ value, ledger, installed }) => {
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify(value));
        localStorage.setItem('yomu:settings-intent:v2', JSON.stringify(ledger));
        if (!installed) {
            delete window.GM; delete window.GM_xmlhttpRequest;
            delete window.GM_getValue; delete window.GM_setValue;
            delete window.GM_deleteValue; delete window.GM_listValues;
        }
        const state = { calls: [], playing: [], ended: [], rejected: [], fetches: [], speech: 0 };
        window.__studyAudio = state;
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {
            const url = typeof input === 'string' ? input : input.url || String(input);
            if (/audio|fixture\.wav/.test(url)) state.fetches.push(url);
            return originalFetch.apply(this, arguments);
        };
        const originalPlay = HTMLMediaElement.prototype.play;
        const observed = new WeakSet();
        HTMLMediaElement.prototype.play = function() {
            if (this instanceof HTMLAudioElement) {
                const snapshot = () => ({ src: this.currentSrc || this.src, duration: this.duration, time: this.currentTime, muted: this.muted, readyState: this.readyState });
                state.calls.push(snapshot());
                if (!observed.has(this)) {
                    observed.add(this);
                    this.addEventListener('playing', () => state.playing.push(snapshot()));
                    this.addEventListener('ended', () => state.ended.push(snapshot()));
                }
                const result = originalPlay.apply(this, arguments);
                result.catch(error => state.rejected.push({ ...snapshot(), name: error.name, message: error.message }));
                return result;
            }
            return originalPlay.apply(this, arguments);
        };
        if (window.speechSynthesis) {
            const originalSpeak = speechSynthesis.speak;
            speechSynthesis.speak = function() { state.speech += 1; return originalSpeak.apply(this, arguments); };
        }
    }, { value, ledger, installed });
    let result;
    try {
        await page.goto(`${studyOrigin}/study/?audio-fixture=${name}`, { waitUntil: 'domcontentloaded' });
        assert(await page.evaluate(() => typeof window.GM_xmlhttpRequest === 'function') === installed, 'The scenario has the wrong manager transport.');
        await page.waitForSelector('[data-newtab-prompt]', { timeout: 15_000 });
        await revealStudyCard(page);
        const speaker = page.locator('[data-action="study-word-audio"]');
        await speaker.waitFor();
        const prompt = await page.locator('[data-newtab-prompt]').textContent();
        assert(prompt.trim().length > 0, 'Study did not render a card.');
        assert(await speaker.isEnabled(), 'The Study speaker is disabled.');
        assert(await page.evaluate(() => window.__studyAudio.playing.filter(event => event.duration > 0.3).length === 0), 'Manual audio played before clicking the speaker.');
        for (let clicks = 1; clicks <= 2; clicks += 1) {
            await speaker.click();
            await page.waitForFunction(expected => window.__studyAudio.ended.filter(event => event.duration > 0.3 && event.time > 0.3).length >= expected, clicks, { timeout: 10_000 });
        }
        const audio = await page.evaluate(() => window.__studyAudio);
        const completed = audio.ended.filter(event => event.duration > 0.3 && event.time > 0.3);
        assert(completed.every(event => !event.muted && event.readyState >= 2), 'Media was muted or did not decode.', { completed });
        assert(audio.speech === 0, 'Recorded audio unexpectedly fell through to speech synthesis.', audio);
        assert(pageErrors.length === 0, 'Study raised an uncaught exception.', { pageErrors });
        scenarioAssertions[name]({ requests, completed, audio, bridgeRequests, expectedCorsErrors });
        await page.screenshot({ path: path.join(artifactDir, `${name}.png`) });
        result = { name, status: 'pass', installed, prompt: prompt.trim(), completed, requests, bridgeRequests, audio, expectedCorsErrors };
    } catch (error) {
        result = { name, status: 'fail', installed, error: error.message, requests, bridgeRequests, pageErrors, expectedCorsErrors, audio: await page.evaluate(() => window.__studyAudio).catch(() => null) };
        await page.screenshot({ path: path.join(artifactDir, `${name}-failure.png`) }).catch(() => undefined);
    } finally { await context.close(); }
    return result;
}

async function revealStudyCard(page) {
    const finalReveal = page.locator('[data-newtab-action="study-step"][data-study-step-kind="final-reveal"]');
    if (await finalReveal.count()) await finalReveal.first().click();
    else await page.locator('[data-newtab-action="reveal"]').click();
}

async function routeStudyFixture(route, requests) {
    const request = route.request();
    const url = new URL(request.url());
    const tracked = [url.origin === 'https://audio.yomureader.com', url.href === blockedClip, url.searchParams.get('url') === blockedClip].some(Boolean);
    if (tracked) requests.push({ url: url.href, type: request.resourceType() });
    const handlers = { [studyOrigin]: routeHostedStudy, 'https://audio.yomureader.com': routeHostedAudio };
    const handler = handlers[url.origin];
    if (handler) return handler(route, url);
    return routeProviderAudio(route, url);
}

function routeHostedStudy(route, url) {
    if (url.pathname.endsWith('/app.js')) return route.fulfill({ contentType: 'text/javascript', body: app });
    const filename = studyFile(url.pathname);
    return filename ? route.fulfill({ contentType: contentType(filename), body: readFileSync(filename) }) : route.fulfill({ status: 404, body: '' });
}

function routeHostedAudio(route, url) {
    if (url.pathname === '/') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ audioSources: [{ name: 'fixture', url: hostedClip }] }) });
    return route.fulfill({ status: 200, headers: cors, contentType: 'audio/wav', body: audioBytes });
}

function routeProviderAudio(route, url) {
    if (proxyHosts.has(url.hostname) && url.searchParams.get('url') === blockedClip) return route.fulfill({ status: 200, headers: cors, contentType: 'audio/wav', body: audioBytes });
    if (url.href === blockedClip) return route.fulfill({ status: 200, contentType: 'audio/wav', body: audioBytes });
    return route.fulfill({ status: 503, headers: cors, contentType: 'text/plain', body: 'Provider intentionally unavailable in this fixture.' });
}

function studyFile(pathname) {
    const route = pathname === '/' ? '/study/' : pathname;
    const filename = path.resolve(publicRoot, `.${route}${route.endsWith('/') ? 'index.html' : ''}`);
    return safePublicFile(filename);
}

function safePublicFile(filename) {
    if (!filename.startsWith(`${publicRoot}${path.sep}`) || !existsSync(filename)) return null;
    return statSync(filename).isDirectory() ? null : filename;
}

function contentType(filename) {
    return filename.endsWith('.html') ? 'text/html' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
}

function toneWav() {
    const rate = 8000;
    const frames = Math.round(rate * 0.45);
    const bytes = Buffer.alloc(44 + frames * 2);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
    for (let index = 0; index < frames; index += 1) bytes.writeInt16LE(Math.round(Math.sin(index / rate * Math.PI * 2 * 440) * 8000), 44 + index * 2);
    return bytes;
}
