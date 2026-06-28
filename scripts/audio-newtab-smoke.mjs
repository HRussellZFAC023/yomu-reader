#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { createYomuPaths } from './lib/paths.mjs';

const {
    appRoot: ROOT,
    docsPublicRoot: DOCS_PUBLIC_ROOT,
    qaArtifactsRoot: ARTIFACTS_ROOT,
} = createYomuPaths(import.meta.dirname);

const NEWTAB_DIR = path.join(DOCS_PUBLIC_ROOT, 'newtab');
const ARTIFACT_DIR = path.join(ARTIFACTS_ROOT, 'audio-newtab', 'latest');
const VIDEO_TMP_DIR = path.join(ARTIFACT_DIR, 'raw-video');
const DEFAULT_PROXY_ORIGIN = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const SILENT_WAV_BYTES = Buffer.from('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==', 'base64');
const HOSTED_READING_CARD = {
    vid: 1456360,
    sid: 0,
    rid: 0,
    spelling: '読む',
    reading: 'よむ',
    frequencyRank: 900,
    partOfSpeech: ['verb'],
    meanings: [{ glosses: ['to read'], partOfSpeech: ['verb'] }],
    cardState: ['not-in-deck'],
    pitchAccent: ['LHH'],
    wordWithReading: '読[よ]む',
    source: 'local',
    reviewSource: 'dictionary',
    sentence: '読む',
};
const HOSTED_MIXED_BATHING_CARD = {
    vid: 1290550,
    sid: 0,
    rid: 0,
    spelling: '混浴',
    reading: 'こんよく',
    frequencyRank: 25918,
    partOfSpeech: ['noun'],
    meanings: [{ glosses: ['mixed bathing'], partOfSpeech: ['noun'] }],
    cardState: ['learning'],
    pitchAccent: [],
    wordWithReading: '混[こん]浴[よく]',
    source: 'local',
    reviewSource: 'dictionary',
    sentence: 'あ… そ そうね 混浴風呂だものね',
};

assertBuiltArtifacts([
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
], ROOT, 'Run npm run build and node scripts/sync-docs-userscript.cjs first.');

const baseSettings = {
    onboardingSeen: true,
    apiKey: '',
    jitenApiKey: '',
    interfaceLanguage: 'en',
    enableLogging: true,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    jpdbDefinitionsEnabled: true,
    jitenDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    showPitchAccent: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    newTabSource: 'dictionary',
    audioEnabled: true,
    autoPlayAudio: true,
    suppressAutoAudioOnVideo: false,
    audioAutoPlayMode: 'all',
    audioEnableDefaultSources: false,
    audioViaBlob: true,
    audioFallbackChimeEnabled: false,
    audioTimeoutMs: 8000,
    audioSelectionMode: 'random',
    audioTtsMode: 'fallback',
};

const scenarios = [];
resetArtifactDir();
const server = await startHostedDocsServer();
const browser = await launchSmokeBrowser(chromium, 'chromium', {
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
    scenarios.push(await runScenario(browser, hostedStudyAnswerAudioScenario(server.origin)));
    scenarios.push(await runScenario(browser, hostedStudyLocalAudioCorsScenario(server.origin)));
    scenarios.push(await runScenario(browser, hostedSearchAudioScenario(server.origin)));
} finally {
    await browser.close().catch(() => undefined);
    await server.close();
}

const summary = {
    generatedAt: new Date().toISOString(),
    source: 'docs/public/newtab without userscript injection',
    scenarios,
};
writeFileSync(path.join(ARTIFACT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

if (scenarios.some(scenario => scenario.status !== 'pass')) {
    process.exitCode = 1;
}

function hostedStudyAnswerAudioScenario(origin) {
    return {
        name: 'hosted-newtab-study-answer-audio-furigana-pitch-frequency',
        url: `${origin}/newtab/index.html?smoke=audio-newtab-study`,
        settings: {
            ...baseSettings,
            autoPlayAudio: false,
            showFurigana: false,
            showPitchAccent: true,
            audioSources: [
                { type: 'text-to-speech', url: '', voice: '', enabled: true },
                { type: 'custom-json', url: 'https://audio.test/nested-json?term={term}&reading={reading}', voice: '', enabled: true },
            ],
        },
        action: async page => {
            await page.waitForSelector('[data-newtab-prompt]', { timeout: 15_000 });
            await page.locator('[data-newtab-action="reveal"]').click();
            await page.waitForSelector('[data-newtab-prompt] .jpdb-reader-newtab-term ruby', { timeout: 10_000 });
            await page.waitForSelector('[data-newtab-study-tools] .jpdb-reader-pitch svg', { timeout: 10_000 });
            await page.waitForSelector('[data-newtab-study-tools] .jpdb-reader-frequency-pill', { timeout: 10_000 });
            await page.waitForSelector('[data-newtab-study-tools] [data-action="study-word-audio"]:not([disabled])', { timeout: 10_000 });
            await page.locator('[data-newtab-study-tools] [data-action="study-word-audio"]').click();
            await waitForPlaybackSignalCount(page, 1, 'Hosted Study answer audio button produced no audio or speech signal');
        },
        assertResult: result => {
            assert(result.noUserscriptBridge, 'Hosted Study smoke unexpectedly had a userscript HTTP bridge installed', result);
            assert(result.requests.some(request => targetUrl(request).startsWith('https://audio.test/nested-json')), 'Hosted Study audio did not request the nested custom JSON source', result);
            assert(result.requests.some(request => targetUrl(request).includes('/clip-')), 'Hosted Study audio did not request a recorded clip', result);
            assert(result.speech.length === 0, 'Hosted Study fallback mode used browser text-to-speech while recorded clips were playable', result);
            assert(result.audiblePlays.length >= 1, 'Hosted Study did not record an audio play attempt', result);
            assert(/読.*む/.test(result.evidence.promptText), 'Hosted Study prompt evidence did not include the headword', result);
            assert(result.evidence.studyToolsText.includes('#900'), 'Hosted Study answer evidence did not include the frequency pill', result);
        },
    };
}

function hostedStudyLocalAudioCorsScenario(origin) {
    const localClipUrl = 'http://localhost:9090/audio/jpod/media/kon-yoku.mp3';
    return {
        name: 'hosted-newtab-study-local-audio-cors-fallback',
        url: `${origin}/newtab/index.html?smoke=audio-newtab-study-local`,
        cacheCards: [HOSTED_MIXED_BATHING_CARD],
        settings: {
            ...baseSettings,
            autoPlayAudio: false,
            showFurigana: false,
            showPitchAccent: true,
            audioViaBlob: false,
            audioSources: [
                { type: 'custom-json', url: 'https://audio.test/local-json?term={term}&reading={reading}', voice: '', enabled: true },
            ],
        },
        action: async page => {
            await page.waitForSelector('[data-newtab-prompt]', { timeout: 15_000 });
            await page.locator('[data-newtab-action="reveal"]').click();
            await page.waitForSelector('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word ruby', { timeout: 10_000 });
            const speaker = page.locator('[data-action="study-word-audio"]');
            await speaker.waitFor({ timeout: 10_000 });
            assert(await speaker.isEnabled(), 'Hosted Study local-audio speaker was disabled before playback');
            await speaker.click();
            await waitForPlaybackSignalCount(page, 1, 'Hosted Study local audio speaker produced no audio signal');
            await speaker.click();
            await waitForPlaybackSignalCount(page, 2, 'Hosted Study local audio speaker did not restart on the second click');
            assert(await speaker.isVisible(), 'Hosted Study local-audio speaker disappeared after playback');
            assert(await speaker.isEnabled(), 'Hosted Study local-audio speaker became disabled after playback');
        },
        assertResult: result => {
            assert(result.noUserscriptBridge, 'Hosted Study local-audio smoke unexpectedly had a userscript HTTP bridge installed', result);
            assert(result.requests.some(request => targetUrl(request).startsWith('https://audio.test/local-json')), 'Hosted Study local audio did not request the custom JSON source', result);
            assert(result.requests.some(request => targetUrl(request) === localClipUrl), 'Hosted Study local audio did not request the loopback clip', { localClipUrl, result });
            assert(!result.fetches.some(request => targetUrl(request) === localClipUrl), 'Hosted Study local audio tried to fetch the loopback clip and would surface a CORS console error', { localClipUrl, result });
            assert(result.audiblePlays.some(play => play.src === localClipUrl || play.sourceUrl === localClipUrl), 'Hosted Study local audio did not play the loopback clip after direct media setup', { localClipUrl, result });
            assert(result.evidence.compactTermHtml.includes('<ruby'), 'Hosted Study compact revealed term did not include furigana ruby', result);
            assert(result.evidence.compactTermHtml.includes('混') && result.evidence.compactTermHtml.includes('浴'), 'Hosted Study compact revealed term did not include the 混浴 base text', result);
            assert(result.evidence.compactTermHtml.includes('こん') && result.evidence.compactTermHtml.includes('よく'), 'Hosted Study compact revealed term did not include 混浴 furigana', result);
            assert(result.evidence.studySpeakerVisible === true && result.evidence.studySpeakerDisabled === false, 'Hosted Study local-audio speaker was not visible and enabled in final evidence', result);
        },
    };
}

function hostedSearchAudioScenario(origin) {
    return {
        name: 'hosted-newtab-search-audio-tts-deprioritized',
        url: `${origin}/newtab/index.html?smoke=audio-newtab`,
        settings: {
            ...baseSettings,
            audioSources: [
                { type: 'text-to-speech', url: '', voice: '', enabled: true },
                { type: 'custom-json', url: 'https://audio.test/nested-json?term={term}&reading={reading}', voice: '', enabled: true },
            ],
        },
        action: async page => {
            await page.locator('[data-newtab-action="mode"][data-mode="search"]').click({ timeout: 10_000 });
            await page.locator('[data-newtab-search-input]').fill('読む');
            await page.locator('[data-newtab-search]').evaluate(form => form.requestSubmit());
            await page.waitForSelector('[data-newtab-action="search-result-word"][data-expression="読む"]', { timeout: 15_000 });
            await page.locator('[data-newtab-action="search-result-word"][data-expression="読む"]').click();
            await page.waitForSelector('[data-action="search-word-audio"]:not([disabled])', { timeout: 15_000 });
            for (let index = 0; index < 3; index += 1) {
                await page.locator('[data-action="search-word-audio"]').click();
                await waitForPlaybackSignalCount(page, index + 1, `Hosted newtab audio click ${index + 1} produced no audio or speech signal`);
            }
        },
        assertResult: result => {
            assert(result.noUserscriptBridge, 'Hosted newtab smoke unexpectedly had a userscript HTTP bridge installed', result);
            assert(result.evidence.searchText.includes('読む') || result.evidence.detailText.includes('読む'), 'Hosted newtab search did not keep a usable result after public lookup was unavailable', result);
            assert(result.requests.some(request => targetUrl(request).startsWith('https://audio.test/nested-json')), 'Hosted newtab audio did not request the nested custom JSON source', result);
            assert(result.requests.some(request => targetUrl(request).includes('/clip-a.mp3')), 'Hosted newtab audio did not request clip-a', result);
            assert(result.requests.some(request => targetUrl(request).includes('/clip-b.mp3')), 'Hosted newtab audio did not request clip-b', result);
            assert(result.speech.length === 0, 'Hosted newtab fallback mode used browser text-to-speech while recorded clips were playable', result);
            assert(result.audiblePlays.length >= 3, 'Hosted newtab did not record three audio play attempts', result);
            const urls = result.audiblePlays.map(play => play.sourceUrl || play.src).filter(url => url.includes('/clip-'));
            assert(urls.length >= 3, 'Hosted newtab did not play source-backed clips for each click', result);
            assertNoImmediateRepeats(urls, 'Hosted newtab random replay repeated the previous recorded clip immediately', result);
        },
    };
}

async function runScenario(browser, options) {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        serviceWorkers: 'block',
        viewport: { width: 1100, height: 760 },
        recordVideo: { dir: VIDEO_TMP_DIR, size: { width: 1100, height: 760 } },
    });
    const page = await context.newPage();
    const requests = [];
    const browserErrors = [];
    const yomuLogs = [];
    page.on('pageerror', error => browserErrors.push(String(error)));
    page.on('console', message => {
        const text = message.text();
        if (/yomu|jpdb|audio/i.test(text)) yomuLogs.push({ type: message.type(), text });
        if (message.type() === 'error' && /yomu|jpdb|audio/i.test(text)) browserErrors.push(text);
    });
    await seedHostedSettings(page, options.settings, options.cacheCards);
    await installAudioInstrumentation(page);
    await routeHostedSmokeRequests(page, requests);

    let result;
    const video = page.video();
    try {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab[data-newtab-bound="true"]', { timeout: 15_000 });
        await options.action(page);
        result = await scenarioSnapshot(page, options.name, requests, browserErrors, yomuLogs);
        options.assertResult(result);
        assert(browserErrors.length === 0, `${options.name} saw browser errors`, { browserErrors });
        result.status = 'pass';
        return result;
    } catch (error) {
        result = {
            ...await scenarioSnapshot(page, options.name, requests, browserErrors, yomuLogs).catch(() => ({
                name: options.name,
                url: page.url(),
                requests,
                browserErrors,
                yomuLogs,
                evidence: {},
            })),
            error: String(error?.message ?? error),
            status: 'fail',
        };
        return result;
    } finally {
        const videoPath = path.join(ARTIFACT_DIR, `${options.name}.webm`);
        await context.close().catch(() => undefined);
        await video?.saveAs(videoPath).catch(() => undefined);
        if (result) result.video = videoPath;
    }
}

async function seedHostedSettings(page, settings, cacheCards = [HOSTED_READING_CARD]) {
    await page.addInitScript(({ key, value, cacheKey, cache }) => {
        localStorage.setItem(key, JSON.stringify(value));
        localStorage.setItem(cacheKey, JSON.stringify(cache));
        delete window.GM;
        delete window.GM_getValue;
        delete window.GM_setValue;
        delete window.GM_deleteValue;
        delete window.GM_listValues;
        delete window.GM_xmlhttpRequest;
    }, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        cacheKey: NEW_TAB_CACHE_KEY,
        cache: { sourceLabel: 'Dictionaries', cards: cacheCards },
    });
}

async function installAudioInstrumentation(page) {
    await page.addInitScript(() => {
        window.__yomuNewtabAudio = { plays: [], speech: [], sourceByBlob: {}, fetches: [] };
        const originalFetch = window.fetch.bind(window);
        const originalPlay = HTMLMediaElement.prototype.play;
        const originalLoad = HTMLMediaElement.prototype.load;
        const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
        const originalSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);

        window.fetch = async (input, init) => {
            const sourceUrl = fetchInputUrl(input);
            const response = await originalFetch(input, init);
            const contentType = response.headers.get('content-type') || '';
            const fetchRecord = { url: sourceUrl, status: response.status, contentType, time: Date.now() };
            window.__yomuNewtabAudio.fetches.push(fetchRecord);
            if (/json/i.test(contentType) && /audio\.test\/nested-json/.test(sourceUrl)) {
                response.clone().text()
                    .then(body => { fetchRecord.body = body.slice(0, 500); })
                    .catch(error => { fetchRecord.bodyError = String(error?.message ?? error); });
            }
            return responseWithAnnotatedBlob(response, sourceUrl);
        };

        URL.createObjectURL = object => {
            const url = originalCreateObjectUrl(object);
            if (object instanceof Blob) {
                window.__yomuNewtabAudio.sourceByBlob[url] = object.__yomuSourceUrl || '';
            }
            return url;
        };

        HTMLMediaElement.prototype.play = function play() {
            if (this.tagName === 'AUDIO') window.__yomuNewtabAudio.plays.push(audioEvent(this));
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.load = function load() {};

        if ('speechSynthesis' in window) {
            window.speechSynthesis.speak = utterance => {
                window.__yomuNewtabAudio.speech.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name ?? '', time: Date.now() });
                utterance.onend?.(new Event('end'));
            };
        }

        window.__yomuNewtabAudioAudible = () => {
            const plays = window.__yomuNewtabAudio?.plays ?? [];
            return plays.filter(play => play.src && !play.src.includes('UklGRiYAAABX'));
        };

        window.__yomuNewtabAudioRestore = () => {
            window.fetch = originalFetch;
            HTMLMediaElement.prototype.play = originalPlay;
            HTMLMediaElement.prototype.load = originalLoad;
            URL.createObjectURL = originalCreateObjectUrl;
            if (originalSpeak && window.speechSynthesis) window.speechSynthesis.speak = originalSpeak;
        };

        function fetchInputUrl(input) {
            if (typeof input === 'string') return input;
            if (input instanceof URL) return input.href;
            return input?.url || '';
        }

        function responseWithAnnotatedBlob(response, sourceUrl) {
            return new Proxy(response, {
                get(target, prop, receiver) {
                    if (prop === 'blob') {
                        return async () => annotateBlob(await target.blob(), sourceUrl);
                    }
                    const value = Reflect.get(target, prop, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        }

        function annotateBlob(blob, sourceUrl) {
            if (!sourceUrl) return blob;
            try {
                Object.defineProperty(blob, '__yomuSourceUrl', {
                    value: originalTargetUrl(sourceUrl),
                    configurable: true,
                });
            } catch {
                // Some browser engines can make Blob instances non-extensible.
            }
            return blob;
        }

        function originalTargetUrl(value) {
            try {
                const url = new URL(value, location.href);
                return url.searchParams.get('url') || url.href;
            } catch {
                return value;
            }
        }

        function audioEvent(element) {
            const src = element.src || element.currentSrc || '';
            return {
                src,
                sourceUrl: window.__yomuNewtabAudio.sourceByBlob[src] || '',
                loop: Boolean(element.loop),
                time: Date.now(),
                detail: document.querySelector('[data-newtab-search-detail]:not([hidden])')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
            };
        }
    });
}

async function routeHostedSmokeRequests(page, requests) {
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const target = originalTargetUrl(url);
        const mocked = mockedExternalResponse(target);
        if (!mocked) {
            await route.continue();
            return;
        }
        requests.push({
            method: request.method(),
            url: request.url(),
            targetUrl: target.href,
            status: mocked.status ?? 200,
            contentType: mocked.contentType,
            noCors: Boolean(mocked.noCors),
        });
        await route.fulfill({
            status: mocked.status ?? 200,
            headers: mocked.noCors ? {} : corsHeaders(),
            contentType: mocked.contentType,
            body: mocked.body,
        });
    });
}

function mockedExternalResponse(target) {
    if (target.hostname === 'jpdb.io' && target.pathname === '/search') {
        return textResponse(jpdbSearchHtml(target.searchParams.get('q') ?? ''), 'text/html; charset=utf-8');
    }
    if (target.hostname === 'jpdb.io' && target.pathname.startsWith('/vocabulary/')) {
        return textResponse(jpdbVocabularyHtml(), 'text/html; charset=utf-8');
    }
    if (target.hostname === 'audio.test' && target.pathname === '/nested-json') {
        return textResponse(JSON.stringify({
            result: {
                audioSources: [
                    { source: { url: 'https://audio.test/clip-a.mp3' } },
                    { sources: [{ src: 'https://audio.test/clip-b.mp3' }] },
                ],
            },
        }), 'application/json; charset=utf-8');
    }
    if (target.hostname === 'audio.test' && target.pathname === '/local-json') {
        return textResponse(JSON.stringify({
            type: 'audioSourceList',
            audioSources: [{ name: 'jpod 混浴', url: 'http://localhost:9090/audio/jpod/media/kon-yoku.mp3' }],
        }), 'application/json; charset=utf-8');
    }
    if (target.hostname === 'audio.test' && target.pathname.startsWith('/clip-')) {
        return { body: SILENT_WAV_BYTES, contentType: 'audio/mpeg' };
    }
    if ((target.hostname === 'localhost' || target.hostname === '127.0.0.1') && target.port === '9090' && target.pathname === '/audio/jpod/media/kon-yoku.mp3') {
        return { body: SILENT_WAV_BYTES, contentType: 'audio/mpeg', noCors: true };
    }
    return null;
}

function originalTargetUrl(url) {
    if (url.origin !== DEFAULT_PROXY_ORIGIN) return url;
    const wrapped = url.searchParams.get('url');
    if (!wrapped) return url;
    try {
        return new URL(wrapped);
    } catch {
        return url;
    }
}

function jpdbSearchHtml(query) {
    const result = query === '読む'
        ? `<div class="result vocabulary">
            <div class="subsection-headword">
                <div class="primary-spelling">
                    <div class="spelling">
                        <ruby>読<rt>よ</rt>む<rt></rt></ruby>
                    </div>
                </div>
            </div>
            <div class="tags"><span class="tag">Top 900</span></div>
            <div class="subsection-meanings">
                <div class="part-of-speech"><div>verb</div></div>
                <div class="description">to read</div>
            </div>
            <a class="view-conjugations-link" href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a">More details...</a>
        </div>`
        : '';
    return `<!doctype html>
<html>
<head>
    <link rel="canonical" href="https://jpdb.io/search?q=%E8%AA%AD%E3%82%80">
    <meta name="description" content="読む (よむ) - to read">
</head>
<body>
    <div class="results search">
        ${result}
    </div>
</body>
</html>`;
}

function jpdbVocabularyHtml() {
    return `<!doctype html>
<html>
<head>
    <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80">
    <meta name="description" content="読む (よむ) - to read">
</head>
<body>
    <div class="result vocabulary">
        <div class="subsection-headword">
            <span class="primary-spelling"><span class="spelling"><ruby>読<rt>よ</rt></ruby>む</span></span>
        </div>
        <div class="subsection-meanings">
            <div class="part-of-speech"><div>verb</div></div>
            <div class="description">to read</div>
        </div>
    </div>
</body>
</html>`;
}

function textResponse(body, contentType, status = 200) {
    return { body, contentType, status };
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    };
}

async function waitForPlaybackSignalCount(page, count, message) {
    await page.waitForFunction(expected => {
        const audio = window.__yomuNewtabAudio ?? { plays: [], speech: [] };
        return (window.__yomuNewtabAudioAudible?.().length ?? 0) + (audio.speech?.length ?? 0) >= expected;
    }, count, { timeout: 10_000 }).catch(error => {
        throw new Error(`${message}: ${error.message}`);
    });
}

async function scenarioSnapshot(page, name, requests, browserErrors, yomuLogs = []) {
    const audio = await page.evaluate(() => window.__yomuNewtabAudio ?? { plays: [], speech: [], fetches: [] });
    const noUserscriptBridge = await page.evaluate(() => typeof window.GM_xmlhttpRequest !== 'function' && typeof window.GM === 'undefined');
    return {
        name,
        status: 'pending',
        url: page.url(),
        noUserscriptBridge,
        requests,
        browserErrors,
        yomuLogs,
        plays: audio.plays ?? [],
        audiblePlays: (audio.plays ?? []).filter(play => play.src && !play.src.includes('UklGRiYAAABX')),
        speech: audio.speech ?? [],
        fetches: audio.fetches ?? [],
        evidence: await safeEvidence(page),
    };
}

async function safeEvidence(page) {
    try {
        return await page.evaluate(() => ({
            title: document.title,
            runtime: window.__YOMU_READER_RUNTIME__ || '',
            rootBound: document.querySelector('[data-jpdb-reader-root].jpdb-reader-newtab')?.dataset.newtabBound ?? '',
            answerHeaderCount: document.querySelectorAll('[data-newtab-answer-header]').length,
            compactTermHtml: document.querySelector('.jpdb-reader-newtab-term .jpdb-reader-word')?.innerHTML ?? '',
            studySpeakerVisible: (() => {
                const button = document.querySelector('[data-action="study-word-audio"]');
                return button instanceof HTMLElement ? Boolean(button.offsetParent || button.getClientRects().length) : false;
            })(),
            studySpeakerDisabled: document.querySelector('[data-action="study-word-audio"]')?.disabled ?? null,
            promptText: document.querySelector('[data-newtab-prompt]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) ?? '',
            studyToolsText: document.querySelector('[data-newtab-study-tools]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) ?? '',
            searchText: document.querySelector('[data-newtab-search-results]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) ?? '',
            detailText: document.querySelector('[data-newtab-search-detail]:not([hidden])')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) ?? '',
        }));
    } catch (error) {
        return { error: String(error?.message ?? error) };
    }
}

function targetUrl(request) {
    return request.targetUrl || request.url;
}

function assertNoImmediateRepeats(values, message, details) {
    for (let index = 1; index < values.length; index += 1) {
        assert(values[index] !== values[index - 1], message, { ...details, values });
    }
}

function resetArtifactDir() {
    rmSync(ARTIFACT_DIR, { recursive: true, force: true });
    mkdirSync(VIDEO_TMP_DIR, { recursive: true });
}

async function startHostedDocsServer() {
    return await startLoopbackServer((request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { allow: 'GET, HEAD' });
            response.end();
            return;
        }
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
        const filePath = publicFilePath(requestUrl.pathname);
        if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }
        serveFile(response, filePath, contentType(filePath), request.method);
    }, 'Could not bind hosted newtab smoke server');
}

function publicFilePath(rawPathname) {
    let pathname = decodeURIComponent(rawPathname || '/');
    if (pathname === '/') pathname = '/newtab/';
    if (pathname === '/newtab') pathname = '/newtab/';
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.resolve(DOCS_PUBLIC_ROOT, `.${pathname}`);
    const publicRoot = path.resolve(DOCS_PUBLIC_ROOT);
    return filePath === publicRoot || filePath.startsWith(`${publicRoot}${path.sep}`) ? filePath : '';
}

function contentType(filePath) {
    switch (path.extname(filePath)) {
        case '.html':
            return 'text/html; charset=utf-8';
        case '.js':
            return 'application/javascript; charset=utf-8';
        case '.css':
            return 'text/css; charset=utf-8';
        case '.json':
            return 'application/json; charset=utf-8';
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        default:
            return 'application/octet-stream';
    }
}
