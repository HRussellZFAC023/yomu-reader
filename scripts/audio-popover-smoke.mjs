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
const SELECTED_SCENARIOS = selectedScenarioNames();

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
    await pushScenario('fixture-click-open-blob', () => runFixtureClickBlobScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-hover-direct', () => runFixtureHoverScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-hover-return-retries-pending-audio', () => runFixtureHoverReturnAfterPendingScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-blocked-source-fallback', () => runFixtureBlockedFallbackScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-random-candidate-no-repeat', () => runFixtureRandomCandidateScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-random-nested-duplicate-no-repeat', () => runFixtureDuplicateNestedCandidateScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-fallback-tts-deprioritized-random-replay', () => runFixtureFallbackTtsDeprioritizedScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-source-order-tts-random-no-repeat', () => runFixtureSourceOrderTtsScenario(browser, fixture.baseUrl));
    await pushScenario('fixture-ipad-tap-blob', () => runFixtureIpadBlobScenario(browser, fixture.baseUrl));
    await pushScenario('wikipedia-click-open', () => runWikipediaScenario(browser));
    await pushScenario('youtube-click-open-video-page', () => runYouTubeScenario(browser));
} finally {
    await browser.close().catch(() => undefined);
    await closeServer(fixture.server);
}

const summaryPath = path.join(ARTIFACT_DIR, 'summary.json');
writeFileSync(summaryPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), scenarios }, null, 2)}\n`);
console.log(JSON.stringify({ summaryPath, scenarios }, null, 2));

async function pushScenario(name, run) {
    if (SELECTED_SCENARIOS.size && !SELECTED_SCENARIOS.has(name)) return;
    scenarios.push(await run());
}

function selectedScenarioNames() {
    return new Set((process.env.YOMU_AUDIO_POPOVER_SCENARIOS ?? '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean));
}

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

async function runFixtureHoverReturnAfterPendingScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-hover-return-retries-pending-audio',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: false,
            audioSources: [{ type: 'custom', url: 'https://audio.test/pending-{term}.mp3', voice: '', enabled: true }],
        },
        pendingPlayPattern: 'pending-',
        action: async page => {
            await page.mouse.click(12, 12);
            const box = await targetWordBox(page);
            const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            await page.mouse.move(point.x, point.y);
            await page.waitForSelector('.jpdb-reader-popover', { timeout: 8000 });
            await waitForPendingPlayCount(page, 1, 'initial hover did not attempt pending audio');
            await page.mouse.move(10, 10);
            await page.waitForTimeout(80);
            await page.mouse.move(point.x, point.y);
            await waitForPendingPlayCount(page, 2, 'returning to the same hover word did not retry pending audio');
            await page.waitForTimeout(2000);
            await page.waitForFunction(() => document.querySelector('.jpdb-reader-popover')?.dataset.audioLoading !== 'true', { timeout: 3000 });
        },
        assertResult: result => {
            assert(result.pendingPlays.length >= 2, 'hover return did not produce a second pending audio attempt', result);
            assert(result.audioLoading !== 'true', 'hover return left the popover in audio loading state', result);
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

async function runFixtureDuplicateNestedCandidateScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-random-nested-duplicate-no-repeat',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: true,
            audioSelectionMode: 'random',
            audioSources: [{ type: 'custom-json', url: 'https://audio.test/duplicate-json?term={term}', voice: '', enabled: true }],
        },
        initRandomValue: 0.99,
        action: async page => {
            await clickTargetWord(page);
            await waitForAudibleAudio(page, 'duplicate nested first audio did not play');
            await page.locator('.jpdb-reader-popover [data-action="audio"]').click();
            await waitForAudibleAudioCount(page, 2, 'duplicate nested replay audio did not play');
        },
        assertResult: result => {
            const urls = result.audiblePlays.map(play => play.sourceUrl || play.src).filter(url => url.includes('/clip-'));
            assert(urls.length >= 2, 'duplicate nested scenario did not play two source-backed clips', result);
            assert(urls[0] === 'https://audio.test/clip-a.mp3', 'duplicate nested scenario did not start with the expected duplicated clip', result);
            assert(urls[1] === 'https://audio.test/clip-b.mp3', 'duplicate nested replay did not skip the duplicate clip-a candidate', result);
        },
    });
}

async function runFixtureFallbackTtsDeprioritizedScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-fallback-tts-deprioritized-random-replay',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: true,
            audioSelectionMode: 'random',
            audioTtsMode: 'fallback',
            audioSources: [
                { type: 'text-to-speech', url: '', voice: '', enabled: true },
                { type: 'custom-json', url: 'https://audio.test/nested-json?term={term}', voice: '', enabled: true },
            ],
        },
        initRandomValue: 0.99,
        action: async page => {
            await clickTargetWord(page);
            await waitForAudibleAudio(page, 'fallback-priority first recorded audio did not play');
            await page.locator('.jpdb-reader-popover [data-action="audio"]').click();
            await waitForAudibleAudioCount(page, 2, 'fallback-priority replay used TTS or produced no recorded audio');
        },
        assertResult: result => {
            const urls = result.audiblePlays.map(play => play.sourceUrl || play.src).filter(url => url.includes('/clip-'));
            assert(urls.length >= 2, 'fallback-priority scenario did not play two recorded clips', result);
            assert(result.speech.length === 0, 'fallback mode used browser TTS while recorded clips were playable', result);
        },
    });
}

async function runFixtureSourceOrderTtsScenario(browser, baseUrl) {
    return await runReaderScenario(browser, {
        name: 'fixture-source-order-tts-random-no-repeat',
        url: `${baseUrl}/fixture.html`,
        settings: {
            ...baseSettings,
            audioViaBlob: true,
            audioSelectionMode: 'random',
            audioTtsMode: 'source-order',
            audioSources: [
                { type: 'text-to-speech', url: '', voice: '', enabled: true },
                { type: 'custom-json', url: 'https://audio.test/nested-json?term={term}', voice: '', enabled: true },
            ],
        },
        initRandomValue: 0.99,
        action: async page => {
            await clickTargetWord(page);
            await waitForAudioOrSpeechCount(page, 1, 'source-order TTS did not play first');
            await page.locator('.jpdb-reader-popover [data-action="audio"]').click();
            await waitForAudioOrSpeechCount(page, 2, 'source-order replay did not move to the recorded source');
        },
        assertResult: result => {
            assert(result.speech.length >= 1, 'source-order scenario did not honor the prioritized browser TTS source', result);
            assert(result.audiblePlays.some(play => (play.sourceUrl || play.src).includes('/clip-')), 'source-order replay did not play a recorded source after TTS', result);
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
            audioSelectionMode: 'random',
            audioViaBlob: true,
            audioSources: [{ type: 'custom-json', url: 'https://audio.test/nested-json?term={term}', voice: '', enabled: true }],
        },
        initRandomValue: 0,
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
            const urls = result.audiblePlays.map(play => play.sourceUrl || play.src).filter(url => url.includes('/clip-'));
            assert(urls.length >= 2, 'YouTube scenario did not record two source-backed clips', result);
            assert(urls[0] !== urls[1], 'YouTube manual replay repeated the click-open clip immediately', result);
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
    if (request.url.startsWith('https://audio.test/duplicate-json')) {
        return textResponse(JSON.stringify({
            results: [
                { source: { url: 'https://audio.test/clip-a.mp3' } },
                { nested: { sources: [{ src: 'https://audio.test/clip-a.mp3' }] } },
                { audio: 'https://audio.test/clip-b.mp3' },
            ],
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
    await page.addInitScript(({ blockedPlayPattern, initRandomValue, pendingPlayPattern }) => {
        if (typeof initRandomValue === 'number') Math.random = () => initRandomValue;
        window.__yomuAudioSmoke = { plays: [], rejected: [], pending: [], speech: [], sourceByBlob: {} };
        const originalPlay = HTMLMediaElement.prototype.play;
        const originalLoad = HTMLMediaElement.prototype.load;
        const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
        const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
        URL.createObjectURL = object => {
            const url = originalCreateObjectUrl(object);
            if (object instanceof Blob) {
                window.__yomuAudioSmoke.sourceByBlob[url] = object.__yomuSourceUrl || '';
            }
            return url;
        };
        HTMLMediaElement.prototype.play = function play() {
            if (this.tagName === 'AUDIO') {
                const event = audioEvent(this);
                if (blockedPlayPattern && event.src.includes(blockedPlayPattern)) {
                    window.__yomuAudioSmoke.rejected.push(event);
                    return Promise.reject(new Error('blocked by audio smoke'));
                }
                if (pendingPlayPattern && event.src.includes(pendingPlayPattern)) {
                    window.__yomuAudioSmoke.pending.push(event);
                    return new Promise(() => undefined);
                }
                window.__yomuAudioSmoke.plays.push(event);
            }
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.load = function load() {};
        if ('speechSynthesis' in window) {
            window.speechSynthesis.speak = utterance => {
                window.__yomuAudioSmoke.speech.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name ?? '', time: Date.now() });
                utterance.onend?.(new Event('end'));
            };
        }
        window.__yomuAudioSmokeRestore = () => {
            HTMLMediaElement.prototype.play = originalPlay;
            HTMLMediaElement.prototype.load = originalLoad;
            URL.createObjectURL = originalCreateObjectUrl;
            if (originalSpeak && window.speechSynthesis) window.speechSynthesis.speak = originalSpeak;
        };
        wrapUserscriptBlobRequests();

        function audioEvent(element) {
            const src = element.src || element.currentSrc || '';
            return {
                src,
                attrSrc: element.getAttribute?.('src') || '',
                sourceUrl: window.__yomuAudioSmoke.sourceByBlob[src] || '',
                loop: Boolean(element.loop),
                time: Date.now(),
                popover: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
            };
        }

        function wrapUserscriptBlobRequests() {
            const direct = window.GM_xmlhttpRequest;
            if (typeof direct === 'function') window.GM_xmlhttpRequest = wrapRequest(direct);
            if (window.GM) {
                if (typeof window.GM.xmlHttpRequest === 'function') window.GM.xmlHttpRequest = wrapRequest(window.GM.xmlHttpRequest);
                if (typeof window.GM.xmlhttpRequest === 'function') window.GM.xmlhttpRequest = wrapRequest(window.GM.xmlhttpRequest);
            }
        }

        function wrapRequest(original) {
            return request => original({
                ...request,
                onload: response => {
                    annotateResponseBlob(response?.response, request.url);
                    request.onload?.(response);
                },
            });
        }

        function annotateResponseBlob(value, sourceUrl) {
            if (!(value instanceof Blob) || !sourceUrl) return;
            try {
                Object.defineProperty(value, '__yomuSourceUrl', {
                    value: sourceUrl,
                    configurable: true,
                });
            } catch {
                // Blob instances can be non-extensible in some browser engines.
            }
        }
    }, { blockedPlayPattern: options.blockedPlayPattern ?? '', initRandomValue: options.initRandomValue, pendingPlayPattern: options.pendingPlayPattern ?? '' });
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

async function waitForAudioOrSpeechCount(page, count, message) {
    await page.waitForFunction(expectedCount => {
        return audiblePlays().length + (window.__yomuAudioSmoke?.speech?.length ?? 0) >= expectedCount;

        function audiblePlays() {
            const plays = window.__yomuAudioSmoke?.plays ?? [];
            return plays.filter(play => play.src && !play.src.includes('UklGRiYAAABX'));
        }
    }, count, { timeout: 10_000 }).catch(async error => {
        throw new Error(`${message}: ${JSON.stringify(await safeEvidence(page))}: ${error.message}`);
    });
}

async function waitForPendingPlayCount(page, count, message) {
    await page.waitForFunction(expectedCount => {
        return (window.__yomuAudioSmoke?.pending?.length ?? 0) >= expectedCount;
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
        audioLoading: evidence.audioLoading,
        audiblePlays: evidence.audiblePlays,
        rejectedPlays: evidence.rejectedPlays,
        pendingPlays: evidence.pendingPlays,
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
            audioLoading: document.querySelector('.jpdb-reader-popover')?.dataset.audioLoading ?? '',
            plays,
            audiblePlays: plays.filter(play => play.src && !play.src.includes('UklGRiYAAABX')),
            rejectedPlays: window.__yomuAudioSmoke?.rejected ?? [],
            pendingPlays: window.__yomuAudioSmoke?.pending ?? [],
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
