#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, artifacts: ARTIFACTS_ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

loadDotEnv(path.join(ROOT, '.env'));

const EXACT_WIKIPEDIA_URL = 'https://ja.wikipedia.org/wiki/%E5%8E%9F%E5%AD%90%E9%87%8F';
const WIKIPEDIA_MAIN_PAGE_URL = 'https://ja.wikipedia.org/wiki/%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%9A%E3%83%BC%E3%82%B8';
const YOUTUBE_URL = process.env.YOMU_AUDIO_YOUTUBE_URL || 'https://www.youtube.com/watch?v=f2Q5tPfiSAE';
const ARTIFACT_DIR = path.join(ARTIFACTS_ROOT, 'audio-real-page', 'latest');
const VIDEO_TMP_DIR = path.join(ARTIFACT_DIR, 'raw-video');
const SILENT_WAV_BYTES = Buffer.from('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==', 'base64');
const FIXTURE_TARGET_TEXT = '原子量 日本語 音声 辞書 再生 練習';

const baseSettings = {
    onboardingSeen: true,
    apiKey: process.env.YOMU_JPDB_API_KEY || process.env.YOMU_TEST_API_KEY || '',
    jitenApiKey: process.env.YOMU_JITEN_API_KEY || '',
    interfaceLanguage: 'en',
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 500,
    popupActivationMode: 'click',
    showFloatingButton: false,
    enableLogging: true,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    localDictionariesEnabled: false,
    jpdbDefinitionsEnabled: true,
    showPitchAccent: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    audioEnabled: true,
    autoPlayAudio: true,
    suppressAutoAudioOnVideo: false,
    audioAutoPlayMode: 'all',
    audioViaBlob: true,
    audioFallbackChimeEnabled: false,
    audioTimeoutMs: 8000,
    audioSelectionMode: 'random',
    audioTtsMode: 'fallback',
};

const scenarios = [];
resetArtifactDir();
const browser = await launchSmokeBrowser(chromium, 'chromium', {
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
    scenarios.push(await runScenario(browser, wikipediaMainPageDefaultReplayScenario()));
    scenarios.push(await runScenario(browser, wikipediaMainPageHoverControlledPoolScenario()));
    scenarios.push(await runScenario(browser, wikipediaHoverDefaultScenario()));
    scenarios.push(await runScenario(browser, wikipediaClickRandomDefaultScenario()));
    scenarios.push(await runScenario(browser, wikipediaHoverControlledPoolScenario()));
    scenarios.push(await runScenario(browser, wikipediaClickControlledPoolScenario()));
    scenarios.push(await runScenario(browser, wikipediaClickInterleavedTtsScenario()));
    scenarios.push(await runScenario(browser, ipadWikipediaTapControlledPoolScenario()));
    scenarios.push(await runScenario(browser, youtubeHoverControlledPoolScenario()));
} finally {
    await browser.close().catch(() => undefined);
}

function wikipediaMainPageDefaultReplayScenario() {
    return {
        name: 'wikipedia-main-page-click-replay-default',
        url: WIKIPEDIA_MAIN_PAGE_URL,
        settings: {
            ...baseSettings,
            audioEnableDefaultSources: true,
            audioSources: [],
        },
        action: async page => {
            await clickFirstReaderWord(page);
            await waitForAudioOrSpeechCount(page, 1, 'Wikipedia main page default click-open produced no audio');
            for (let index = 0; index < 5; index++) {
                await clickPopoverAudioButton(page);
                await waitForAudioOrSpeechCount(page, index + 2, `Wikipedia main page replay ${index + 1} produced no audio`);
            }
        },
        assertResult: result => {
            const played = playbackIdentities(result);
            const unique = new Set(played);
            assert(played.length >= 6, 'Wikipedia main page default replay did not record six playback attempts', result);
            assertNoImmediateRepeats(played, 'Wikipedia main page default replay repeated the previous audio identity', result);
            assert(unique.size >= 3, 'Wikipedia main page default replay did not enter the wider randomized audio pool', result);
        },
    };
}

function wikipediaMainPageHoverControlledPoolScenario() {
    return {
        name: 'wikipedia-main-page-hover-controlled-pool',
        url: WIKIPEDIA_MAIN_PAGE_URL,
        settings: controlledPoolSettings(),
        action: async page => {
            await hoverReaderWordsAndWaitForPlayback(page, 5, 'Wikipedia main page controlled hover');
        },
        assertResult: result => {
            const controlledPlays = result.audiblePlays.filter(play => (play.sourceUrl || play.src).includes('real-audio.test'));
            assert(controlledPlays.length >= 5, 'Wikipedia main page controlled hover did not play audio for each hovered word', result);
        },
    };
}

const summaryPath = path.join(ARTIFACT_DIR, 'summary.json');
writeFileSync(summaryPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), scenarios }, null, 2)}\n`);
console.log(JSON.stringify({ summaryPath, scenarios }, null, 2));

function wikipediaHoverDefaultScenario() {
    return {
        name: 'wikipedia-atomic-weight-hover-default',
        url: EXACT_WIKIPEDIA_URL,
        settings: {
            ...baseSettings,
            audioEnableDefaultSources: true,
            audioSources: [],
        },
        action: async page => {
            await hoverSeveralReaderWords(page, 4);
            await waitForAudibleAudioCount(page, 1, 'Wikipedia default hover produced no audio');
        },
        assertResult: result => {
            assert(result.audiblePlays.length >= 1 || result.speech.length >= 1, 'Wikipedia default hover did not play audio', result);
        },
    };
}

function wikipediaClickRandomDefaultScenario() {
    return {
        name: 'wikipedia-atomic-weight-click-random-default',
        url: EXACT_WIKIPEDIA_URL,
        settings: {
            ...baseSettings,
            audioEnableDefaultSources: true,
            audioSources: [],
        },
        action: async page => {
            await clickFirstReaderWord(page);
            await waitForAudioOrSpeechCount(page, 1, 'Wikipedia default click-open produced no audio');
            await clickPopoverAudioButton(page);
            await waitForAudioOrSpeechCount(page, 2, 'Wikipedia default manual replay produced no second audio');
        },
        assertResult: result => {
            const played = playbackIdentities(result);
            assert(played.length >= 2, 'Wikipedia default click scenario did not record two playback attempts', result);
            assert(new Set(played).size >= 2, 'Wikipedia default click scenario repeated one playback identity', result);
        },
    };
}

function wikipediaHoverControlledPoolScenario() {
    return {
        name: 'wikipedia-atomic-weight-hover-controlled-pool',
        url: EXACT_WIKIPEDIA_URL,
        settings: controlledPoolSettings(),
        action: async page => {
            await hoverSeveralReaderWords(page, 4);
            await waitForAudibleAudioCount(page, 1, 'Wikipedia controlled hover produced no audio');
        },
        assertResult: result => {
            assert(result.audiblePlays.some(play => play.src.includes('real-audio.test') || play.sourceUrl?.includes('real-audio.test')), 'Wikipedia controlled hover did not use controlled audio', result);
        },
    };
}

function wikipediaClickControlledPoolScenario() {
    return {
        name: 'wikipedia-atomic-weight-click-controlled-pool',
        url: EXACT_WIKIPEDIA_URL,
        settings: controlledPoolSettings(),
        action: async page => {
            await clickFirstReaderWord(page);
            await waitForAudibleAudioCount(page, 1, 'Wikipedia controlled click-open produced no audio');
            await clickPopoverAudioButton(page);
            await waitForAudibleAudioCount(page, 2, 'Wikipedia controlled replay produced no second audio');
            await clickPopoverAudioButton(page);
            await waitForAudibleAudioCount(page, 3, 'Wikipedia controlled replay produced no third audio');
        },
        assertResult: result => {
            const urls = result.audiblePlays.map(play => play.sourceUrl || play.src).filter(value => value.includes('real-audio.test'));
            assert(urls.length >= 3, 'controlled click scenario did not record three controlled clips', result);
            assert(urls[0] !== urls[1], 'controlled click scenario repeated the previous clip immediately', result);
        },
    };
}

function wikipediaClickInterleavedTtsScenario() {
    return {
        name: 'wikipedia-atomic-weight-click-interleaved-tts',
        url: EXACT_WIKIPEDIA_URL,
        settings: {
            ...baseSettings,
            audioEnableDefaultSources: false,
            audioSources: [
                { type: 'text-to-speech', url: '', voice: '', enabled: true },
                { type: 'custom', url: 'https://real-audio.test/interleaved.mp3', voice: '', enabled: true },
            ],
        },
        action: async page => {
            await clickFirstReaderWord(page);
            await waitForAudibleAudioCount(page, 1, 'Wikipedia interleaved click-open produced no recorded audio');
            await clickPopoverAudioButton(page);
            await waitForAudioOrSpeechCount(page, 2, 'Wikipedia interleaved replay did not enter text-to-speech');
        },
        assertResult: result => {
            const played = playbackIdentities(result);
            assert(result.audiblePlays.some(play => (play.sourceUrl || play.src).includes('real-audio.test/interleaved.mp3')), 'interleaved scenario did not play controlled recorded audio', result);
            assert(result.speech.length >= 1, 'interleaved scenario did not enter browser text-to-speech on replay', result);
            assertNoImmediateRepeats(played, 'interleaved scenario repeated the recorded source before text-to-speech', result);
        },
    };
}

function ipadWikipediaTapControlledPoolScenario() {
    return {
        name: 'ipad-wikipedia-atomic-weight-tap-replay-controlled-pool',
        url: EXACT_WIKIPEDIA_URL,
        contextOptions: {
            ...devices['iPad Pro 11'],
            bypassCSP: true,
        },
        settings: controlledPoolSettings(),
        action: async page => {
            await tapFirstReaderWord(page);
            await waitForAudibleAudioCount(page, 1, 'iPad controlled tap produced no audio');
            await clickPopoverAudioButton(page);
            await waitForAudibleAudioCount(page, 2, 'iPad controlled replay produced no second audio');
            await clickPopoverAudioButton(page);
            await waitForAudibleAudioCount(page, 3, 'iPad controlled replay produced no third audio');
        },
        assertResult: result => {
            const urls = result.audiblePlays.map(play => play.sourceUrl || play.src).filter(value => value.includes('real-audio.test'));
            assert(result.audiblePlays.length >= 3, 'iPad tap and replay did not record three audio plays', result);
            assert(result.audiblePlays.every(play => play.src.startsWith('blob:')), 'iPad tap/replay did not play every clip through a blob URL', result);
            assert(urls.length >= 3, 'iPad tap/replay did not record three controlled source clips', result);
            assertNoImmediateRepeats(urls, 'iPad tap/replay repeated the previous source clip immediately', result);
        },
    };
}

function youtubeHoverControlledPoolScenario() {
    return {
        name: 'youtube-hover-controlled-pool',
        url: YOUTUBE_URL,
        settings: {
            ...controlledPoolSettings(),
            suppressAutoAudioOnVideo: false,
        },
        injectTargetText: true,
        action: async page => {
            await hoverSeveralReaderWords(page, 3);
            await waitForAudibleAudioCount(page, 1, 'YouTube controlled hover produced no audio');
        },
        assertResult: result => {
            assert(result.hasVideo, 'YouTube scenario did not detect a page video', result);
            assert(result.audiblePlays.length >= 1, 'YouTube hover did not play audio', result);
        },
    };
}

function controlledPoolSettings() {
    return {
        ...baseSettings,
        audioEnableDefaultSources: false,
        audioSources: [
            {
                type: 'custom-json',
                url: 'https://real-audio.test/pool?term={term}&reading={reading}',
                voice: '',
                enabled: true,
            },
        ],
    };
}

async function runScenario(browser, options) {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1200, height: 820 },
        recordVideo: { dir: VIDEO_TMP_DIR, size: { width: 1200, height: 820 } },
        ...(options.contextOptions ?? {}),
    });
    const page = await context.newPage();
    const requests = [];
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb|audio/i.test(message.text())) browserErrors.push(message.text());
    });
    await page.exposeFunction('__yomuRealAudioRequest', createBridgeHandler(requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: options.settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuRealAudioRequest',
    });
    await installAudioInstrumentation(page);
    await page.addInitScript({ path: SCRIPT_PATH });

    let result;
    const video = page.video();
    try {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 70_000 });
        if (options.injectTargetText) await injectTargetText(page);
        await waitForReaderWords(page);
        await options.action(page);
        result = await scenarioSnapshot(page, options.name, requests, browserErrors);
        options.assertResult(result);
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
        return result;
    } finally {
        const videoPath = path.join(ARTIFACT_DIR, `${options.name}.webm`);
        await context.close().catch(() => undefined);
        await video?.saveAs(videoPath).catch(() => undefined);
        if (result) result.video = videoPath;
    }
}

function createBridgeHandler(requests) {
    return async request => {
        const response = await bridgeResponse(request);
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

async function bridgeResponse(request) {
    if (request.url.startsWith('https://real-audio.test/pool')) {
        return textResponse(JSON.stringify({
            results: [
                { audioSources: [{ source: { url: 'https://real-audio.test/clip-a.mp3' } }] },
                { nested: { sources: [{ src: 'https://real-audio.test/clip-b.mp3' }] } },
                { audio: 'https://real-audio.test/clip-c.mp3' },
            ],
        }), 'application/json; charset=utf-8');
    }
    if (request.url.startsWith('https://real-audio.test/')) return bytesResponse(SILENT_WAV_BYTES, 'audio/mpeg');

    try {
        const response = await fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: request.method && request.method !== 'GET' ? request.data : undefined,
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
            status: response.status,
            responseText: textLikeResponse(response.headers.get('content-type')) ? bytes.toString('utf8') : '',
            bytes: [...bytes],
            contentType: response.headers.get('content-type') || '',
        };
    } catch (error) {
        return textResponse(String(error?.message ?? error), 'text/plain; charset=utf-8', 599);
    }
}

function textLikeResponse(contentType = '') {
    return /(?:text|json|xml|html|javascript)/i.test(contentType);
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

async function installAudioInstrumentation(page) {
    await page.addInitScript(() => {
        window.__yomuRealAudio = { plays: [], speech: [], sourceByBlob: {}, events: [] };
        const originalPlay = HTMLMediaElement.prototype.play;
        const originalLoad = HTMLMediaElement.prototype.load;
        const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
        const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);

        URL.createObjectURL = object => {
            const url = originalCreateObjectUrl(object);
            if (object instanceof Blob) {
                window.__yomuRealAudio.sourceByBlob[url] = object.__yomuSourceUrl || '';
            }
            return url;
        };
        HTMLMediaElement.prototype.play = function play() {
            if (this.tagName === 'AUDIO') window.__yomuRealAudio.plays.push(audioEvent(this));
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.load = function load() {};
        if ('speechSynthesis' in window) {
            window.speechSynthesis.speak = utterance => {
                window.__yomuRealAudio.speech.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name ?? '', time: Date.now() });
                utterance.onend?.(new Event('end'));
            };
        }
        wrapUserscriptBlobRequests();
        window.__yomuRealAudioAudible = () => {
            const plays = window.__yomuRealAudio?.plays ?? [];
            return plays.filter(play => play.src && !play.src.includes('UklGRiYAAABX'));
        };
        window.__yomuRealAudioRestore = () => {
            HTMLMediaElement.prototype.play = originalPlay;
            HTMLMediaElement.prototype.load = originalLoad;
            URL.createObjectURL = originalCreateObjectUrl;
            if (originalSpeak && window.speechSynthesis) window.speechSynthesis.speak = originalSpeak;
        };

        function audioEvent(element) {
            const src = element.src || element.currentSrc || '';
            return {
                src,
                sourceUrl: window.__yomuRealAudio.sourceByBlob[src] || '',
                loop: Boolean(element.loop),
                time: Date.now(),
                popover: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
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
            return options => original({
                ...options,
                onload: response => {
                    annotateResponseBlob(response?.response, options.url);
                    options.onload?.(response);
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
    });
}

async function waitForReaderWords(page) {
    await page.waitForFunction(() => {
        return [...document.querySelectorAll('.jpdb-reader-word')]
            .some(word => word.dataset.jpdbReaderPassive !== 'true' && word.getBoundingClientRect().width > 0);
    }, { timeout: 30_000 });
}

async function hoverSeveralReaderWords(page, count) {
    const targets = await readerWordTargets(page, count);
    assert(targets.length > 0, 'no reader word points found for hover');
    for (const target of targets) {
        const point = await readerWordPoint(page, target.index);
        assert(point, `reader word disappeared before hover: ${target.text}`);
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(350);
    }
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 10_000 });
}

async function hoverReaderWordsAndWaitForPlayback(page, count, label) {
    const targets = await readerWordTargets(page, count);
    assert(targets.length >= count, `${label} found only ${targets.length} hover targets`);
    let expectedCount = await audioOrSpeechCount(page);
    for (const target of targets) {
        const point = await readerWordPoint(page, target.index);
        assert(point, `${label} target disappeared before hover: ${target.text}`);
        await page.mouse.move(point.x, point.y);
        await page.waitForSelector('.jpdb-reader-popover', { timeout: 10_000 });
        expectedCount += 1;
        await waitForAudioOrSpeechCount(page, expectedCount, `${label} did not play audio after hovering ${target.text}`);
    }
}

async function clickFirstReaderWord(page) {
    const [point] = await readerWordPoints(page, 1);
    assert(point, 'no reader word point found for click');
    await page.mouse.click(point.x, point.y);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 10_000 });
}

async function tapFirstReaderWord(page) {
    const [point] = await readerWordPoints(page, 1);
    assert(point, 'no reader word point found for tap');
    await page.tap('.jpdb-reader-word', { timeout: 10_000 }).catch(async () => {
        await page.touchscreen.tap(point.x, point.y);
    });
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 10_000 });
}

async function readerWordPoints(page, count) {
    const targets = await readerWordTargets(page, count);
    const points = [];
    for (const target of targets) {
        const point = await readerWordPoint(page, target.index);
        if (point) points.push({ ...point, text: target.text });
    }
    return points;
}

async function readerWordTargets(page, count) {
    return await page.evaluate(limit => {
        const words = pageReaderWords();
        const points = [];
        const seen = new Set();
        for (const [index, word] of words.entries()) {
            const text = (word.textContent || '').trim();
            if (!text || seen.has(text)) continue;
            const rect = word.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            seen.add(text);
            points.push({ index, text });
            if (points.length >= limit) break;
        }
        return points;

        function pageReaderWords() {
            return [...document.querySelectorAll('.jpdb-reader-word')]
                .filter(word => !word.closest('.jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-sheet'))
                .filter(word => word.dataset.jpdbReaderPassive !== 'true')
                .filter(word => /[\u3040-\u30ff\u3400-\u9fff]/u.test(word.textContent || ''));
        }
    }, count);
}

async function readerWordPoint(page, index) {
    return await page.evaluate(targetIndex => {
        const words = [...document.querySelectorAll('.jpdb-reader-word')]
            .filter(word => !word.closest('.jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-sheet'))
            .filter(word => word.dataset.jpdbReaderPassive !== 'true')
            .filter(word => /[\u3040-\u30ff\u3400-\u9fff]/u.test(word.textContent || ''));
        const word = words[targetIndex];
        if (!word) return null;
        word.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = word.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, index);
}

async function audioOrSpeechCount(page) {
    return await page.evaluate(() => {
        return (window.__yomuRealAudioAudible?.().length ?? 0) + (window.__yomuRealAudio?.speech?.length ?? 0);
    });
}

async function clickPopoverAudioButton(page) {
    await page.locator('.jpdb-reader-popover [data-action="audio"]').click({ timeout: 10_000 });
}

async function waitForAudibleAudioCount(page, count, message) {
    await page.waitForFunction(expectedCount => window.__yomuRealAudioAudible?.().length >= expectedCount, count, { timeout: 14_000 })
        .catch(async error => {
            throw new Error(`${message}: ${JSON.stringify(await safeEvidence(page))}: ${error.message}`);
        });
}

async function waitForAudioOrSpeechCount(page, count, message) {
    await page.waitForFunction(expectedCount => {
        return (window.__yomuRealAudioAudible?.().length ?? 0) + (window.__yomuRealAudio?.speech?.length ?? 0) >= expectedCount;
    }, count, { timeout: 14_000 }).catch(async error => {
        throw new Error(`${message}: ${JSON.stringify(await safeEvidence(page))}: ${error.message}`);
    });
}

async function scenarioSnapshot(page, name, requests, browserErrors) {
    const evidence = await safeEvidence(page);
    const screenshot = path.join(ARTIFACT_DIR, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => undefined);
    return {
        name,
        url: page.url(),
        ...evidence,
        requests,
        browserErrors,
        screenshot,
    };
}

async function safeEvidence(page) {
    return await page.evaluate(() => ({
        hasVideo: Boolean(document.querySelector('video')),
        runtimeMarker: { ...document.getElementById('jpdb-reader-runtime-owner')?.dataset },
        readerRootCount: document.querySelectorAll('[data-jpdb-reader-root]').length,
        readerWordCount: document.querySelectorAll('.jpdb-reader-word').length,
        popoverCount: document.querySelectorAll('.jpdb-reader-popover').length,
        popoverText: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 260) ?? '',
        plays: window.__yomuRealAudio?.plays ?? [],
        audiblePlays: window.__yomuRealAudioAudible?.() ?? [],
        speech: window.__yomuRealAudio?.speech ?? [],
        targetWords: [...document.querySelectorAll('.jpdb-reader-word')].slice(0, 16).map(word => ({
            text: word.textContent,
            expression: word.dataset.expression,
            reading: word.dataset.reading,
            passive: word.dataset.jpdbReaderPassive,
        })),
    })).catch(error => ({ error: String(error) }));
}

function playbackIdentities(result) {
    return playbackTimeline(result).map(item => item.identity);
}

function playbackTimeline(result) {
    return [
        ...result.audiblePlays.map(play => ({
            identity: play.sourceUrl || play.src,
            time: play.time ?? 0,
        })),
        ...result.speech.map(item => ({
            identity: `speech:${item.voice}:${item.text}`,
            time: item.time ?? 0,
        })),
    ]
        .filter(item => item.identity)
        .sort((a, b) => a.time - b.time);
}

function assertNoImmediateRepeats(values, message, context) {
    for (let index = 1; index < values.length; index++) {
        assert(values[index] !== values[index - 1], message, { ...context, repeated: values[index], index });
    }
}

async function injectTargetText(page) {
    await page.evaluate(text => {
        const host = document.createElement('section');
        host.id = 'yomu-real-audio-target';
        host.lang = 'ja';
        host.style.cssText = [
            'position:fixed',
            'z-index:2147483646',
            'left:24px',
            'top:84px',
            'max-width:640px',
            'padding:14px 18px',
            'background:white',
            'color:#111',
            'font:28px/1.8 system-ui,sans-serif',
            'box-shadow:0 8px 28px rgba(0,0,0,.22)',
        ].join(';');
        host.textContent = text;
        document.body.prepend(host);
    }, FIXTURE_TARGET_TEXT);
    await page.waitForTimeout(1500);
}

function resetArtifactDir() {
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(VIDEO_TMP_DIR, { recursive: true });
}

function loadDotEnv(file) {
    try {
        const text = readFileSync(file, 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
            if (!match) continue;
            const [, key, raw] = match;
            if (process.env[key] !== undefined) continue;
            process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
        }
    } catch {
        // Credentials are optional for controlled-source coverage.
    }
}
