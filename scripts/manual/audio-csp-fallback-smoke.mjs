#!/usr/bin/env node
// Reproduces the strict-CSP audio failure seen on chatgpt.com / claude.ai.
//
// Unlike audio-real-page-smoke.mjs this harness deliberately does NOT bypass CSP
// and does NOT mock HTMLMediaElement.play(): the page enforces a real strict
// policy (media-src 'self'; connect-src 'self') so blob:/data: media playback is
// refused by the browser, forcing the Web Audio fallback — and fetching a blob:
// URL is refused too, which is exactly what silently breaks the fallback today.
//
// Audio bytes are delivered through the GM bridge (exposeFunction), like a real
// userscript manager, so the *fetch* bypasses CSP — only playback is under test.
//
// BUG  (pre-fix): play() rejected -> Web Audio fallback fetch(blob:) blocked ->
//                 no real playback, the soft chime (oscillator) fires.
// FIXED(post-fix): play() rejected -> Web Audio decodes the in-memory blob bytes
//                 -> a real BufferSource plays, no chime.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, artifacts: ARTIFACTS_ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

const ARTIFACT_DIR = process.env.YOMU_AUDIO_CSP_ARTIFACT_DIR || path.join(ARTIFACTS_ROOT, 'audio-csp-fallback', 'latest');
const SILENT_WAV_BYTES = Buffer.from('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==', 'base64');
const PAGE_TEXT = '日本語の音声を辞書で再生して練習する。読む。';

// chatgpt.com / claude.ai style: media + network locked to same-origin, so blob:
// and data: URLs are refused both as media sources and as fetch targets.
const STRICT_CSP = [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
    "media-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
].join('; ');

const settings = {
    onboardingSeen: true,
    apiKey: '',
    jitenApiKey: '',
    interfaceLanguage: 'en',
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    enableLogging: true,
    ankiEnabled: false,
    localDictionariesEnabled: false,
    jpdbDefinitionsEnabled: false,
    showPitchAccent: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    audioEnabled: true,
    autoPlayAudio: false,
    audioAutoPlayMode: 'all',
    audioViaBlob: true,
    audioFallbackChimeEnabled: true,
    audioTimeoutMs: 8000,
    audioSelectionMode: 'first',
    audioTtsMode: 'fallback',
    audioEnableDefaultSources: false,
    audioSources: [
        { type: 'custom', url: 'https://real-audio.test/clip.mp3', voice: '', enabled: true },
    ],
};

resetArtifactDir();
const server = await startLoopbackServer(handleRequest);
const browser = await launchSmokeBrowser(chromium, 'chromium', {
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

let result;
try {
    result = await runScenario();
} finally {
    await browser.close().catch(() => undefined);
    await closeServer(server);
}

const summaryPath = path.join(ARTIFACT_DIR, 'summary.json');
writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'pass') process.exitCode = 1;

async function runScenario() {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1100, height: 800 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => {
        const text = message.text();
        if (/no playable audio|yomu|audio/i.test(text)) consoleErrors.push(`${message.type()}:${text}`);
    });
    await page.exposeFunction('__yomuAudioBridge', bridgeResponse);
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuAudioBridge',
    });
    await installPlaybackInstrumentation(page);
    await page.addInitScript({ path: SCRIPT_PATH });

    try {
        await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForFunction(() => [...document.querySelectorAll('.jpdb-reader-word')]
            .some(word => word.dataset.jpdbReaderPassive !== 'true' && word.getBoundingClientRect().width > 0), { timeout: 20_000 });
        await openPopoverAndPlay(page);
        await page.waitForTimeout(2500);
        const audio = await page.evaluate(() => window.__cspAudio);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'scenario.png') }).catch(() => undefined);

        const realPlayback = audio.bufferStarts > 0 && audio.decodeFrames > 0;
        const chimeOnly = audio.oscillators > 0 && audio.bufferStarts === 0;
        const blockedMedia = audio.violations.some(v => v.directive.includes('media-src'));
        assert(blockedMedia, 'CSP did not block blob/data media playback — repro is not faithful', audio);
        assert(realPlayback, 'no real Web Audio playback (decode + BufferSource) occurred', { audio, consoleErrors });
        assert(!chimeOnly, 'audio fell back to the failure chime instead of playing', { audio, consoleErrors });
        return { status: 'pass', audio, consoleErrors };
    } catch (error) {
        const audio = await page.evaluate(() => window.__cspAudio).catch(() => null);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'failure.png') }).catch(() => undefined);
        return { status: 'fail', error: String(error?.message ?? error), audio, consoleErrors };
    } finally {
        await context.close().catch(() => undefined);
    }
}

async function openPopoverAndPlay(page) {
    const point = await page.evaluate(() => {
        const word = [...document.querySelectorAll('.jpdb-reader-word')]
            .find(w => w.dataset.jpdbReaderPassive !== 'true' && w.getBoundingClientRect().width > 0);
        if (!word) return null;
        const rect = word.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    assert(point, 'no reader word available to click');
    await page.mouse.click(point.x, point.y);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 10_000 });
    await page.locator('.jpdb-reader-popover [data-action="audio"]').click({ timeout: 10_000 });
}

async function installPlaybackInstrumentation(page) {
    await page.addInitScript(() => {
        const state = { plays: 0, playRejected: 0, decode: 0, decodeFrames: 0, bufferStarts: 0, oscillators: 0, violations: [] };
        window.__cspAudio = state;
        document.addEventListener('securitypolicyviolation', event => {
            if (state.violations.length < 40) state.violations.push({ directive: event.violatedDirective, blocked: (event.blockedURI || '').slice(0, 24) });
        });
        const origPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function play() {
            const promise = origPlay.apply(this, arguments);
            if (this.tagName === 'AUDIO') {
                state.plays += 1;
                if (promise && promise.then) promise.then(undefined, () => { state.playRejected += 1; });
            }
            return promise;
        };
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const origDecode = Ctx.prototype.decodeAudioData;
        Ctx.prototype.decodeAudioData = function decodeAudioData(buffer, ...rest) {
            state.decode += 1;
            const result = origDecode.call(this, buffer, ...rest);
            if (result && result.then) result.then(decoded => { if (decoded) state.decodeFrames += decoded.length; }, () => undefined);
            return result;
        };
        const origBufferSource = Ctx.prototype.createBufferSource;
        Ctx.prototype.createBufferSource = function createBufferSource() {
            const node = origBufferSource.apply(this, arguments);
            const origStart = node.start;
            node.start = function start() { state.bufferStarts += 1; return origStart.apply(this, arguments); };
            return node;
        };
        const origOscillator = Ctx.prototype.createOscillator;
        Ctx.prototype.createOscillator = function createOscillator() {
            state.oscillators += 1;
            return origOscillator.apply(this, arguments);
        };
    });
}

async function bridgeResponse(request) {
    if (request.url.startsWith('https://real-audio.test/')) {
        return { status: 200, responseText: '', bytes: [...SILENT_WAV_BYTES], contentType: 'audio/mpeg' };
    }
    return { status: 404, responseText: 'not found', bytes: [...Buffer.from('not found')], contentType: 'text/plain' };
}

function handleRequest(request, response) {
    if (request.url === '/' || request.url.startsWith('/?')) {
        const body = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>CSP audio repro</title></head>`
            + `<body><main lang="ja"><p style="font-size:30px;line-height:2">${PAGE_TEXT}</p></main></body></html>`;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': STRICT_CSP });
        response.end(body);
        return;
    }
    response.writeHead(404, { 'content-type': 'text/plain', 'content-security-policy': STRICT_CSP });
    response.end('not found');
}

function resetArtifactDir() {
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(ARTIFACT_DIR, { recursive: true });
}
