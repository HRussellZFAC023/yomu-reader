#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, artifacts: ARTIFACTS_ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

const ARTIFACT_DIR = path.join(ARTIFACTS_ROOT, 'audio-popover', 'latest');
const VIDEO_TMP_DIR = path.join(ARTIFACT_DIR, 'raw-video');
const SILENT_WAV_BYTES = Buffer.from('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==', 'base64');
const FIXTURE_TEXT = '今日は日本語を読む練習をします。明日も読む予定です。';
const TARGET_SELECTOR = '.jpdb-reader-word[data-expression="読む"]';

const VOCABULARY = [
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 200, ['not-in-deck'], ['LHHH']],
    ['読む', '読む', 'よむ', 'to read', ['v5m'], 401, ['not-in-deck'], ['LH']],
    ['練習', '練習', 'れんしゅう', 'practice', ['n', 'vs'], 900, ['not-in-deck'], ['HLLL']],
];

const baseSettings = {
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'en',
    ankiEnabled: false,
    ankiSectionEnabled: false,
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    showPitchAccent: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    audioEnabled: true,
    autoPlayAudio: true,
    suppressAutoAudioOnVideo: true,
    audioAutoPlayMode: 'all',
    audioEnableDefaultSources: false,
    audioFallbackChimeEnabled: false,
    audioTimeoutMs: 4000,
    audioSelectionMode: 'first',
    audioTtsMode: 'fallback',
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 500,
    popupActivationMode: 'click',
    showFloatingButton: false,
    enableLogging: false,
};

const scenarios = [];

resetArtifactDir();
const fixture = await createFixtureServer();
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    scenarios.push(await runFixtureClickBlobScenario(browser, fixture.baseUrl));
    scenarios.push(await runFixtureHoverScenario(browser, fixture.baseUrl));
    scenarios.push(await runFixtureBlockedFallbackScenario(browser, fixture.baseUrl));
    scenarios.push(await runFixtureRandomCandidateScenario(browser, fixture.baseUrl));
    scenarios.push(await runFixtureIpadBlobScenario(browser, fixture.baseUrl));
    scenarios.push(await runWikipediaScenario(browser));
    scenarios.push(await runYouTubeScenario(browser));
} finally {
    await browser.close().catch(() => undefined);
    await closeServer(fixture.server);
}

const summaryPath = path.join(ARTIFACT_DIR, 'summary.json');
writeFileSync(summaryPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), scenarios }, null, 2)}\n`);
console.log(JSON.stringify({ summaryPath, scenarios }, null, 2));

async function runFixtureClickBlobScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-click-open-blob',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: true,
            audioSources: [{ type: 'custom-json', url: 'https://audio.test/nested-json?term={term}&reading={reading}', voice: '', enabled: true }],
        },
        action: async page => {
            await clickTargetWord(page);
            await waitForAudibleAudio(page, 'fixture click-open blob audio did not play');
        },
        assertResult: result => {
            assert(result.audiblePlays.some(play => play.src.startsWith('blob:')), 'fixture click-open did not play through a blob URL', result);
            assert(result.requests.some(request => request.url.includes('/nested-json')), 'fixture click-open did not request the nested JSON source', result);
            assert(result.requests.some(request => request.url.includes('/clip-a.mp3')), 'fixture click-open did not request the nested audio clip', result);
        },
    });
}

async function runFixtureHoverScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-hover-direct',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: false,
            audioSources: [{ type: 'custom', url: 'https://audio.test/hover-{term}.mp3', voice: '', enabled: true }],
        },
        action: async page => {
            await page.mouse.click(12, 12);
            const box = await targetWordBox(page);
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForSelector('.jpdb-reader-popover', { timeout: 8000 });
            await waitForAudibleAudio(page, 'fixture hover audio did not play');
        },
        assertResult: result => {
            assert(result.audiblePlays.some(play => play.src.includes('/hover-')), 'fixture hover did not play the hover source', result);
        },
    });
}

async function runFixtureBlockedFallbackScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-blocked-source-fallback',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: false,
            audioSources: [
                { type: 'custom', url: 'https://audio.test/blocked-{term}.mp3', voice: '', enabled: true },
                { type: 'custom', url: 'https://audio.test/fallback-{term}.mp3', voice: '', enabled: true },
            ],
        },
        blockedPlayPattern: 'blocked-',
        action: async page => {
            await clickTargetWord(page);
            await waitForAudibleAudio(page, 'fallback audio did not play after blocked source');
        },
        assertResult: result => {
            assert(result.rejectedPlays.some(play => play.src.includes('/blocked-')), 'blocked source was not exercised', result);
            assert(result.audiblePlays.some(play => play.src.includes('/fallback-')), 'fallback source did not play after blocked source', result);
        },
    });
}

async function runFixtureRandomCandidateScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-random-candidate-no-repeat',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: false,
            audioSelectionMode: 'random',
            audioSources: [{ type: 'custom-json', url: 'https://audio.test/nested-json?term={term}', voice: '', enabled: true }],
        },
        initRandomValue: 0,
        action: async page => {
            await clickTargetWord(page);
            await waitForAudibleAudio(page, 'random candidate first audio did not play');
            await page.locator('.jpdb-reader-popover [data-action="audio"]').click();
            await waitForAudibleAudioCount(page, 2, 'random candidate second audio did not play');
        },
        assertResult: result => {
            const urls = result.audiblePlays.map(play => play.src).filter(src => src.includes('/clip-'));
            assert(urls.length >= 2, 'random candidate smoke did not play two clips', result);
            assert(urls[0] !== urls[1], 'random candidate mode repeated the previous clip immediately', result);
        },
    });
}

async function runFixtureIpadBlobScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-ipad-tap-blob',
        url: `${baseUrl}/fixture.html`,
        contextOptions: {
            ...devices['iPad Pro 11'],
            bypassCSP: true,
        },
        settings: {
            ...baseSettings,
            audioViaBlob: true,
            audioSources: [{ type: 'custom-json', url: 'https://audio.test/nested-json?term={term}', voice: '', enabled: true }],
        },
        action: async page => {
            await page.tap(TARGET_SELECTOR);
            await waitForAudibleAudio(page, 'iPad tap blob audio did not play');
        },
        assertResult: result => {
            assert(result.audiblePlays.some(play => play.src.startsWith('blob:')), 'iPad scenario did not use blob audio playback', result);
        },
    });
}

async function runWikipediaScenario(browser) {
    return await runReaderScenario(browser, {
        name: 'wikipedia-click-open',
        url: 'https://ja.wikipedia.org/wiki/日本語',
        injectTargetText: true,
        settings: {
            ...baseSettings,
            audioViaBlob: true,
            audioSources: [{ type: 'custom-json', url: 'https://audio.test/nested-json?term={term}', voice: '', enabled: true }],
        },
        targetSelector: '.jpdb-reader-word',
        action: async page => {
            await clickFirstInteractiveWord(page);
            await waitForAudibleAudio(page, 'Wikipedia click-open audio did not play');
        },
        assertResult: result => {
            assert(result.url.includes('wikipedia.org'), 'Wikipedia scenario did not run on Wikipedia', result);
            assert(result.audiblePlays.length >= 1, 'Wikipedia did not produce audio playback', result);
        },
    });
}

async function runYouTubeScenario(browser) {
    return await runReaderScenario(browser, {
        name: 'youtube-click-open-video-page',
        url: 'https://www.youtube.com/watch?v=f2Q5tPfiSAE',
        injectTargetText: true,
        settings: {
            ...baseSettings,
            suppressAutoAudioOnVideo: true,
            audioViaBlob: true,
            audioSources: [{ type: 'custom-json', url: 'https://audio.test/nested-json?term={term}', voice: '', enabled: true }],
        },
        targetSelector: '.jpdb-reader-word',
        action: async page => {
            await clickFirstInteractiveWord(page);
            await waitForAudibleAudio(page, 'YouTube click-open audio did not play');
            await page.locator('.jpdb-reader-popover [data-action="audio"]').click();
            await waitForAudibleAudioCount(page, 2, 'YouTube manual audio button did not play');
        },
        assertResult: result => {
            assert(result.hasVideo, 'YouTube scenario did not detect a page video', result);
            assert(result.audiblePlays.length >= 2, 'YouTube click-open plus manual button did not both play audio', result);
        },
    });
}

async function runReaderScenario(browser, options) {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1100, height: 760 },
        recordVideo: { dir: VIDEO_TMP_DIR, size: { width: 1100, height: 760 } },
        ...(options.contextOptions ?? {}),
    });
    const page = await context.newPage();
    const requests = [];
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb|audio/i.test(message.text())) browserErrors.push(message.text());
    });
    await page.exposeFunction('__yomuAudioSmokeRequest', createBridgeHandler(requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: options.settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuAudioSmokeRequest',
    });
    await installAudioInstrumentation(page, options);

    let result;
    const video = page.video();
    try {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        if (options.injectTargetText) await injectTargetText(page);
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForSelector(options.targetSelector ?? TARGET_SELECTOR, { timeout: 20_000 });
        await options.action(page);
        result = await scenarioSnapshot(page, options.name, requests, browserErrors);
        options.assertResult?.(result);
        assert(browserErrors.length === 0, `${options.name} saw browser errors`, { browserErrors });
        result.status = 'pass';
        return result;
    } catch (error) {
        result = {
            name: options.name,
            status: 'fail',
            url: page.url(),
            error: String(error?.message ?? error),
            requests,
            browserErrors,
            evidence: await safeEvidence(page),
        };
        throw new Error(`${options.name} failed: ${result.error}\n${JSON.stringify(result, null, 2)}`);
    } finally {
        const videoPath = path.join(ARTIFACT_DIR, `${options.name}.webm`);
        await context.close().catch(() => undefined);
        await video?.saveAs(videoPath).catch(() => undefined);
        if (result) result.video = videoPath;
    }
}

function createBridgeHandler(requests) {
    return async request => {
        const response = bridgeResponse(request);
        requests.push({
            method: request.method,
            url: request.url,
            responseType: request.responseType || '',
            contentType: response.contentType || '',
            status: response.status,
        });
        return response;
    };
}

function bridgeResponse(request) {
    if (request.url === 'https://jpdb.io/api/v1/parse') {
        return jsonResponse(mockJpdbParseFromVocabulary(readJsonBody(request.data), VOCABULARY));
    }
    if (request.url.startsWith('https://jpdb.io/api/v1/')) return jsonResponse({});
    if (request.url.startsWith('https://audio.test/nested-json')) {
        return textResponse(JSON.stringify({
            result: {
                audioSources: [
                    { source: { url: 'https://audio.test/clip-a.mp3' } },
                    { sources: [{ src: 'https://audio.test/clip-b.mp3' }] },
                ],
            },
        }), 'application/json; charset=utf-8');
    }
    if (request.url.startsWith('https://audio.test/')) return bytesResponse(SILENT_WAV_BYTES, 'audio/mpeg');
    return textResponse('', 'text/plain; charset=utf-8', 404);
}

function jsonResponse(value) {
    return textResponse(JSON.stringify(value), 'application/json; charset=utf-8');
}

function textResponse(responseText, contentType, status = 200) {
    return {
        status,
        responseText,
        bytes: [...Buffer.from(responseText, 'utf8')],
        contentType,
    };
}

function bytesResponse(buffer, contentType, status = 200) {
    return {
        status,
        responseText: '',
        bytes: [...buffer],
        contentType,
    };
}

async function installAudioInstrumentation(page, options) {
    await page.addInitScript(({ blockedPlayPattern, initRandomValue }) => {
        if (typeof initRandomValue === 'number') Math.random = () => initRandomValue;
        window.__yomuAudioSmoke = { plays: [], rejected: [], speech: [] };
        const originalPlay = HTMLMediaElement.prototype.play;
        const originalLoad = HTMLMediaElement.prototype.load;
        const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
        HTMLMediaElement.prototype.play = function play() {
            if (this.tagName === 'AUDIO') {
                const event = audioEvent(this);
                if (blockedPlayPattern && event.src.includes(blockedPlayPattern)) {
                    window.__yomuAudioSmoke.rejected.push(event);
                    return Promise.reject(new Error('blocked by audio smoke'));
                }
                window.__yomuAudioSmoke.plays.push(event);
            }
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.load = function load() {};
        if ('speechSynthesis' in window) {
            window.speechSynthesis.speak = utterance => {
                window.__yomuAudioSmoke.speech.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name ?? '' });
                utterance.onend?.(new Event('end'));
            };
        }
        window.__yomuAudioSmokeRestore = () => {
            HTMLMediaElement.prototype.play = originalPlay;
            HTMLMediaElement.prototype.load = originalLoad;
            if (originalSpeak && window.speechSynthesis) window.speechSynthesis.speak = originalSpeak;
        };

        function audioEvent(element) {
            return {
                src: element.src || element.currentSrc || '',
                attrSrc: element.getAttribute?.('src') || '',
                loop: Boolean(element.loop),
                time: Date.now(),
                popover: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
            };
        }
    }, { blockedPlayPattern: options.blockedPlayPattern ?? '', initRandomValue: options.initRandomValue });
}

async function clickTargetWord(page, selector = TARGET_SELECTOR) {
    await page.locator(selector).first().click({ timeout: 10_000 });
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 10_000 });
}

async function clickFirstInteractiveWord(page) {
    await page.waitForFunction(() => {
        return [...document.querySelectorAll('.jpdb-reader-word')]
            .some(word => word.dataset.jpdbReaderPassive !== 'true' && word.getBoundingClientRect().width > 0);
    }, { timeout: 10_000 });
    const point = await page.evaluate(() => {
        const words = [...document.querySelectorAll('.jpdb-reader-word')];
        const word = words.find(candidate => candidate.dataset.jpdbReaderPassive !== 'true' && candidate.getBoundingClientRect().width > 0);
        if (!word) return null;
        word.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = word.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: word.textContent ?? '' };
    });
    assert(point, 'no interactive reader word found');
    await page.mouse.click(point.x, point.y);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 10_000 });
}

async function targetWordBox(page) {
    await page.waitForSelector(TARGET_SELECTOR, { timeout: 10_000 });
    const box = await page.locator(TARGET_SELECTOR).first().boundingBox();
    assert(box, 'target word has no bounding box');
    return box;
}

async function waitForAudibleAudio(page, message) {
    await waitForAudibleAudioCount(page, 1, message);
}

async function waitForAudibleAudioCount(page, count, message) {
    await page.waitForFunction(expectedCount => {
        return audiblePlays().length >= expectedCount;

        function audiblePlays() {
            const plays = window.__yomuAudioSmoke?.plays ?? [];
            return plays.filter(play => play.src && !play.src.includes('UklGRiYAAABX'));
        }
    }, count, { timeout: 10_000 }).catch(async error => {
        throw new Error(`${message}: ${JSON.stringify(await safeEvidence(page))}: ${error.message}`);
    });
}

async function scenarioSnapshot(page, name, requests, browserErrors) {
    const evidence = await safeEvidence(page);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: false }).catch(() => undefined);
    return {
        name,
        url: page.url(),
        hasVideo: evidence.hasVideo,
        popoverText: evidence.popoverText,
        readerRootCount: evidence.readerRootCount,
        popoverCount: evidence.popoverCount,
        runtimeMarker: evidence.runtimeMarker,
        audiblePlays: evidence.audiblePlays,
        rejectedPlays: evidence.rejectedPlays,
        speech: evidence.speech,
        requests,
        browserErrors,
        screenshot: path.join(ARTIFACT_DIR, `${name}.png`),
    };
}

async function safeEvidence(page) {
    return await page.evaluate(() => {
        const plays = window.__yomuAudioSmoke?.plays ?? [];
        return {
            hasVideo: Boolean(document.querySelector('video')),
            popoverText: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 260) ?? '',
            readerRootCount: document.querySelectorAll('[data-jpdb-reader-root]').length,
            popoverCount: document.querySelectorAll('.jpdb-reader-popover').length,
            runtimeMarker: { ...document.getElementById('jpdb-reader-runtime-owner')?.dataset },
            plays,
            audiblePlays: plays.filter(play => play.src && !play.src.includes('UklGRiYAAABX')),
            rejectedPlays: window.__yomuAudioSmoke?.rejected ?? [],
            speech: window.__yomuAudioSmoke?.speech ?? [],
            targetWords: [...document.querySelectorAll('.jpdb-reader-word')].slice(0, 12).map(word => ({
                text: word.textContent,
                expression: word.dataset.expression,
                reading: word.dataset.reading,
            })),
        };
    }).catch(error => ({ error: String(error) }));
}

async function injectTargetText(page) {
    await page.evaluate(text => {
        const host = document.createElement('section');
        host.id = 'yomu-audio-smoke-target';
        host.lang = 'ja';
        host.style.cssText = [
            'position:fixed',
            'z-index:2147483646',
            'left:24px',
            'top:84px',
            'max-width:520px',
            'padding:14px 18px',
            'background:white',
            'color:#111',
            'font:28px/1.8 system-ui,sans-serif',
            'box-shadow:0 8px 28px rgba(0,0,0,.22)',
        ].join(';');
        host.textContent = text;
        document.body.prepend(host);
    }, FIXTURE_TEXT);
}

function createFixtureServer() {
    const html = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<title>Yomu audio popover fixture</title>
<style>
body{font:28px/1.8 system-ui,sans-serif;margin:48px;color:#171a1f}
main{max-width:780px}
</style>
<main><p>${FIXTURE_TEXT}</p></main>`;
    return startLoopbackServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/' || url.pathname === '/fixture.html') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(html);
            return;
        }
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }, 'Could not bind audio popover fixture server');
}

function resetArtifactDir() {
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(VIDEO_TMP_DIR, { recursive: true });
}
