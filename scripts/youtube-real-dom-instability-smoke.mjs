#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert as smokeAssert,
    assertBuiltArtifacts,
    createSmokePaths,
    gmRequestFetchBody,
    mockJpdbParseFromVocabulary,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { scriptPath, cssPath, root, artifacts } = createSmokePaths(import.meta.dirname);
const companionPaths = [
    'yomu-anki.user.js',
    'yomu-kanji-study.user.js',
    'yomu-settings-surface.user.js',
    'yomu-video.user.js',
].map(name => join(root, 'dist', 'greasyfork', name)).filter(existsSync);
assertBuiltArtifacts([scriptPath, cssPath, ...companionPaths], root);

const targetWatchUrl = process.env.YOMU_REAL_YOUTUBE_TARGET_URL ?? 'https://www.youtube.com/watch?v=eWHIWDHkYW8';
const normalWatchUrl = process.env.YOMU_REAL_YOUTUBE_NORMAL_URL ?? 'https://www.youtube.com/watch?v=TAorfFcb8_g';
const liveChatWatchUrl = process.env.YOMU_REAL_YOUTUBE_LIVE_URL ?? 'https://www.youtube.com/watch?v=OqwA-w3mMx0';
const profileDir = resolve(process.env.YOMU_REAL_YOUTUBE_USER_DATA_DIR ?? '/tmp/yomu-signed-profile-home');
const redactSignedInReport = process.env.YOMU_REAL_YOUTUBE_REDACT_REPORT !== '0';
const outputDir = resolve(process.env.YOMU_REAL_YOUTUBE_OUTPUT_DIR ?? join(artifacts, 'youtube-real-dom-instability', process.env.YOMU_REAL_YOUTUBE_LABEL ?? 'latest'));
const headed = process.env.YOMU_REAL_YOUTUBE_HEADED === '1';
const channel = process.env.YOMU_REAL_YOUTUBE_CHANNEL || 'chrome';
const sustainedMs = Number(process.env.YOMU_REAL_YOUTUBE_SUSTAINED_MS ?? 15_000);
const requestBridgeName = '__yomuRealYoutubeDomRequest';
const jpdbParseUrl = 'https://jpdb.io/api/v1/parse';

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'real-youtube-smoke-key',
    jitenApiKey: '',
    ankiEnabled: false,
    ankiSectionEnabled: false,
    audioEnabled: false,
    localDictionariesEnabled: false,
    jpdbDefinitionsEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 120,
    popupActivationMode: 'click',
    showFloatingButton: false,
    enableLogging: false,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordTextColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordHighlightColorSource: 'off',
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    youtubeShowChannelRecommendations: false,
    ocrEnabled: false,
};

const vocabularyRows = [
    row('日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['known'], ['LHHH']),
    row('森', '森', 'もり', 'forest', ['n'], 900, ['known'], ['LH']),
    row('語彙', '語彙', 'ごい', 'vocabulary', ['n'], 1200, ['known'], ['LH']),
    row('文法', '文法', 'ぶんぽう', 'grammar', ['n'], 800, ['known'], ['LHHH']),
    row('問題', '問題', 'もんだい', 'problem', ['n'], 500, ['known'], ['LHHH']),
    row('配信', '配信', 'はいしん', 'stream', ['n', 'vs'], 1700, ['known'], ['LHHH']),
    row('視聴', '視聴', 'しちょう', 'watching', ['n', 'vs'], 1200, ['known'], ['LHHH']),
    row('会話', '会話', 'かいわ', 'conversation', ['n', 'vs'], 900, ['known'], ['LHH']),
    row('参加', '参加', 'さんか', 'participation', ['n', 'vs'], 1100, ['known'], ['LHH']),
    row('交流', '交流', 'こうりゅう', 'exchange', ['n', 'vs'], 1400, ['known'], ['LHHH']),
    row('チャット', 'チャット', 'チャット', 'chat', ['n'], 1800, ['known'], ['LHHH']),
    row('先生', '先生', 'せんせい', 'teacher', ['n'], 450, ['known'], ['LHHH']),
    row('字幕', '字幕', 'じまく', 'subtitles', ['n'], 1500, ['known'], ['LHH']),
    row('説明', '説明', 'せつめい', 'explanation', ['n', 'vs'], 600, ['known'], ['LHHH']),
    row('勉強', '勉強', 'べんきょう', 'study', ['n', 'vs'], 700, ['known'], ['LHHH']),
    row('開発', '開発', 'かいはつ', 'development', ['n', 'vs'], 900, ['known'], ['LHHH']),
    row('目指して', '目指す', 'めざして', 'aiming for', ['v5s'], 1100, ['known'], ['LHHH']),
    row('基礎', '基礎', 'きそ', 'basics', ['n'], 850, ['known'], ['LH']),
    row('主に', '主に', 'おもに', 'mainly', ['adv'], 1200, ['known'], ['LHH']),
    row('毎日', '毎日', 'まいにち', 'every day', ['n', 'adv'], 500, ['known'], ['LHHH']),
    row('夜', '夜', 'よる', 'night', ['n'], 350, ['known'], ['LH']),
    row('読む', '読む', 'よむ', 'read', ['v5m'], 400, ['known'], ['LH']),
    row('今日', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']),
    row('東京', '東京', 'とうきょう', 'Tokyo', ['n'], 500, ['known'], ['LHHH']),
    row('動画', '動画', 'どうが', 'video', ['n'], 650, ['known'], ['LHH']),
    row('質問', '質問', 'しつもん', 'question', ['n', 'vs'], 1300, ['known'], ['LHHH']),
    row('ライブ', 'ライブ', 'ライブ', 'live', ['n'], 1700, ['known'], ['LHH']),
    row('クリエイター', 'クリエイター', 'クリエイター', 'creator', ['n'], 2000, ['known'], ['LHHHHH']),
    row('人', '人', 'ひと', 'person', ['n'], 90, ['known'], ['LH']),
];

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const requests = [];
const errors = [];

console.error('[youtube-real-dom] using signed-in profile directory');
assert(existsSync(profileDir), 'Signed-in profile directory is missing.');

const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: !headed,
    bypassCSP: true,
    locale: 'ja-JP',
    viewport: { width: 1440, height: 950 },
});
context.setDefaultTimeout(30_000);
context.setDefaultNavigationTimeout(70_000);

try {
    await installConsentCookies(context);
    const before = await captureBeforeScreenshot(context, targetWatchUrl);
    await installInstrumentation(context);
    await installYomu(context);
    await routeYomuRequests(context);

    const target = await runWatchScenario(context, {
        name: 'target-watch',
        url: targetWatchUrl,
        artifactPrefix: 'target',
        requireLiveChat: false,
    });
    const normal = await runWatchScenario(context, {
        name: 'normal-watch',
        url: normalWatchUrl,
        artifactPrefix: 'normal',
        requireLiveChat: false,
    });
    const liveChat = await runWatchScenario(context, {
        name: 'live-chat-watch',
        url: liveChatWatchUrl,
        artifactPrefix: 'live-chat',
        requireLiveChat: true,
    });
    const home = await runHomeScenario(context);

    const report = {
        generatedAt: new Date().toISOString(),
        profile: { signedInProfileProvided: Boolean(process.env.YOMU_REAL_YOUTUBE_USER_DATA_DIR), pathRedacted: true },
        signedIn: target.signedIn || normal.signedIn || liveChat.signedIn || home.signedIn,
        urls: { targetWatchUrl, normalWatchUrl, liveChatWatchUrl, home: 'https://www.youtube.com/' },
        artifacts: { before, outputDir },
        target,
        normal,
        liveChat,
        home,
        requests: summarizeRequests(requests),
        errors: errors.slice(0, 20),
    };
    writeFileSync(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

    assert(report.signedIn, 'Signed-in YouTube profile was not active; live verification is unresolved.', report);
    assertTargetWatch(report.target);
    assertNormalWatch(report.normal);
    assertLiveChatWatch(report.liveChat);
    assertHome(report.home);

    console.log(JSON.stringify(redactSignedInReport ? summarizeConsoleReport(report) : report, null, 2));
} finally {
    await context.close().catch(() => undefined);
}

function assert(condition, message, details = {}) {
    smokeAssert(condition, message, redactSignedInReport ? redactAssertionDetails(details) : details);
}

function summarizeConsoleReport(report) {
    return {
        generatedAt: report.generatedAt,
        profile: report.profile,
        signedIn: report.signedIn,
        urls: report.urls,
        artifacts: { outputDir: report.artifacts?.outputDir },
        scenarios: {
            target: summarizeScenario(report.target),
            normal: summarizeScenario(report.normal),
            liveChat: summarizeScenario(report.liveChat),
            home: summarizeScenario(report.home),
        },
        requests: summarizeRequestSummary(report.requests),
        errors: report.errors,
    };
}

function summarizeScenario(scenario) {
    if (!scenario) return null;
    const final = Array.isArray(scenario.final) ? mergedFrames(scenario.final) : null;
    return {
        name: scenario.name,
        url: scenario.url,
        signedIn: scenario.signedIn,
        totals: final ? summarizeTotals(final) : undefined,
        missingParsing: scenario.final?.flatMap(frame => frame.missingParsing ?? []).slice(0, 10) ?? [],
        sustainedSamples: scenario.sustained?.samples?.length ?? 0,
        requestSummary: summarizeRequestSummary(scenario.requestSummary),
    };
}

function summarizeTotals(frameState) {
    const areas = Object.fromEntries(Object.entries(frameState.areas ?? {}).map(([name, area]) => [name, summarizeAreaCounts(area)]));
    return { areas };
}

function summarizeRequestSummary(summary) {
    if (!summary) return undefined;
    return {
        total: summary.total,
        byKind: summary.byKind,
        parseChars: summary.parseChars,
    };
}

function summarizeAreaCounts(area) {
    if (!area || typeof area !== 'object') return {};
    return {
        present: Boolean(area.present),
        hasJapanese: Boolean(area.hasJapanese),
        visible: Boolean(area.visible),
        words: area.words ?? 0,
        mirrors: area.mirrors ?? 0,
        ruby: area.ruby ?? 0,
        pitch: area.pitch ?? 0,
        inlineWords: area.inlineWords ?? 0,
        nestedWords: area.nestedWords ?? 0,
        nestedRuby: area.nestedRuby ?? 0,
    };
}

function redactAssertionDetails(details) {
    if (!details || typeof details !== 'object') return {};
    if (Array.isArray(details)) return { count: details.length };
    if ('target' in details && 'normal' in details && 'liveChat' in details) return summarizeConsoleReport(details);
    if ('areas' in details) {
        return {
            frames: Array.isArray(details.frames) ? details.frames.length : undefined,
            areas: Object.fromEntries(Object.entries(details.areas ?? {}).map(([name, area]) => [name, redactArea(area)])),
        };
    }
    if ('roots' in details || ('present' in details && 'words' in details)) return redactArea(details);
    const redacted = {};
    for (const [key, value] of Object.entries(details)) {
        if (key === 'nativeText' || key === 'visibleText' || key === 'title' || key === 'href') continue;
        if (key === 'area') redacted[key] = redactArea(value);
        else if (key === 'samples' && Array.isArray(value)) redacted[key] = value.length;
        else if (Array.isArray(value)) redacted[key] = { count: value.length };
        else if (value && typeof value === 'object') redacted[key] = redactAssertionDetails(value);
        else redacted[key] = value;
    }
    return redacted;
}

function redactArea(area) {
    if (!area || typeof area !== 'object') return {};
    return {
        present: Boolean(area.present),
        hasJapanese: Boolean(area.hasJapanese),
        visible: Boolean(area.visible),
        words: area.words ?? 0,
        mirrors: area.mirrors ?? 0,
        ruby: area.ruby ?? 0,
        pitch: area.pitch ?? 0,
        inlineWords: area.inlineWords ?? 0,
        nestedWords: area.nestedWords ?? 0,
        nestedRuby: area.nestedRuby ?? 0,
        roots: Array.isArray(area.roots) ? area.roots.map(redactAreaRoot).slice(0, 8) : undefined,
    };
}

function redactAreaRoot(root) {
    return {
        selector: root?.selector,
        visible: Boolean(root?.visible),
        mirrorVisible: Boolean(root?.mirrorVisible),
        hasJapanese: Boolean(root?.hasJapanese),
        words: root?.words ?? 0,
        mirrors: root?.mirrors ?? 0,
        ruby: root?.ruby ?? 0,
        pitch: root?.pitch ?? 0,
        inlineWords: root?.inlineWords ?? 0,
        nestedWords: root?.nestedWords ?? 0,
        nestedRuby: root?.nestedRuby ?? 0,
        duplicateMirrorHosts: root?.duplicateMirrorHosts ?? 0,
    };
}

function row(surface, spelling, reading, gloss, partOfSpeech, frequency, state, pitch) {
    return [surface, spelling, reading, gloss, partOfSpeech, frequency, state, pitch];
}

async function installConsentCookies(context) {
    await context.addCookies([
        { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
        { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
    ]).catch(() => undefined);
}

async function captureBeforeScreenshot(context, url) {
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 70_000 });
        await dismissConsent(page);
        await page.waitForSelector('ytd-watch-metadata, ytd-app, ytm-app', { timeout: 35_000 }).catch(() => undefined);
        await page.waitForTimeout(2500);
        const path = join(outputDir, 'target-before.png');
        await page.screenshot({ path, fullPage: false }).catch(() => undefined);
        return path;
    } finally {
        await page.close().catch(() => undefined);
    }
}

async function installInstrumentation(context) {
    await context.addInitScript(() => {
        const japaneseText = /[\u3040-\u30ff\u3400-\u9fff]/u;
        const perf = {
            initAt: performance.now(),
            longTasks: 0,
            longTaskMs: 0,
            maxLongTaskMs: 0,
            mutationCallbacks: 0,
            mutationRecords: 0,
            addedReaderWords: 0,
            removedReaderWords: 0,
            addedMirrors: 0,
            removedMirrors: 0,
            addedJapaneseMutations: 0,
            maxFrameGapMs: 0,
            over50MsFrames: 0,
            rafSamples: 0,
        };
        window.__yomuRealYoutubePerf = perf;
        try {
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    perf.longTasks += 1;
                    perf.longTaskMs += entry.duration;
                    perf.maxLongTaskMs = Math.max(perf.maxLongTaskMs, entry.duration);
                }
            }).observe({ entryTypes: ['longtask'] });
        } catch {
            // Long task observation is best-effort on browser channels.
        }
        let lastFrame = performance.now();
        const raf = now => {
            const gap = now - lastFrame;
            if (gap > 50) perf.over50MsFrames += 1;
            perf.maxFrameGapMs = Math.max(perf.maxFrameGapMs, gap);
            perf.rafSamples += 1;
            lastFrame = now;
            requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
        observeMutationsWhenReady();

        function observeMutationsWhenReady() {
            if (!document.documentElement) {
                document.addEventListener('DOMContentLoaded', observeMutationsWhenReady, { once: true });
                return;
            }
            new MutationObserver(records => {
                perf.mutationCallbacks += 1;
                perf.mutationRecords += records.length;
                for (const record of records) {
                    for (const node of record.addedNodes) addNodeStats(node, 'added');
                    for (const node of record.removedNodes) addNodeStats(node, 'removed');
                }
            }).observe(document.documentElement, { childList: true, subtree: true });
        }

        function addNodeStats(node, direction) {
            if (!(node instanceof Element)) {
                if (direction === 'added' && japaneseText.test(node.textContent || '')) perf.addedJapaneseMutations += 1;
                return;
            }
            const words = (node.matches?.('.jpdb-reader-word') ? 1 : 0) + node.querySelectorAll?.('.jpdb-reader-word').length;
            const mirrors = (node.matches?.('.jpdb-reader-text-mirror') ? 1 : 0) + node.querySelectorAll?.('.jpdb-reader-text-mirror').length;
            if (direction === 'added') {
                perf.addedReaderWords += words;
                perf.addedMirrors += mirrors;
                if (japaneseText.test(node.textContent || '')) perf.addedJapaneseMutations += 1;
            } else {
                perf.removedReaderWords += words;
                perf.removedMirrors += mirrors;
            }
        }
    });
}

async function installYomu(context) {
    await addGmStorageBridgeInitScript(context, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(cssPath, 'utf8'),
        requestBridgeName,
    });
    await context.exposeFunction(requestBridgeName, request => bridgeResponse(request));
    for (const companionPath of companionPaths) await context.addInitScript({ path: companionPath });
    await context.addInitScript({ path: scriptPath });
}

async function routeYomuRequests(context) {
    await context.route('**/*', async route => {
        const request = route.request();
        const response = mockedResponse(request.url(), request.postData() ?? '', request.method());
        if (!response) {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: response.status,
            headers: response.headers,
            contentType: response.contentType,
            body: response.responseText,
        });
    });
}

function bridgeResponse(request) {
    const response = mockedResponse(request.url, gmRequestFetchBody(request), request.method || 'GET');
    if (response) return response;
    requests.push({ kind: 'passthrough-bridge', method: request.method || 'GET', url: request.url });
    return textResponse('', 'text/plain', 204);
}

function mockedResponse(rawUrl, rawBody, method = 'GET') {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }
    const target = proxiedTargetUrl(url) ?? url;
    if (method === 'OPTIONS') return textResponse('', 'text/plain', 204);
    if (target.href.startsWith(jpdbParseUrl)) return jpdbParseResponse(rawBody);
    if (target.hostname === 'jpdb.io' && target.pathname === '/search') return jpdbSearchResponse(target);
    return null;
}

function proxiedTargetUrl(url) {
    const target = url.searchParams.get('url');
    if (!target) return null;
    try {
        return new URL(target);
    } catch {
        return null;
    }
}

function jpdbParseResponse(rawBody) {
    const body = parseJsonBody(rawBody);
    const text = Array.isArray(body.text) ? body.text.map(String) : [];
    requests.push({ kind: 'jpdb-parse', paragraphs: text.length, chars: text.join('').length, sample: text.join(' ').slice(0, 120) });
    return jsonResponse(mockJpdbParseFromVocabulary({ text }, vocabularyRows, { defaultState: ['known'] }));
}

function jpdbSearchResponse(url) {
    const query = url.searchParams.get('q') ?? '';
    requests.push({ kind: 'jpdb-search', query });
    const candidates = vocabularyRows
        .filter(([, spelling, reading]) => spelling.includes(query) || reading.includes(query) || query.includes(spelling))
        .slice(0, 4);
    return textResponse(`<!doctype html><html><body><div class="results search">${candidates.map(jpdbSearchResultHtml).join('')}</div></body></html>`, 'text/html; charset=utf-8');
}

function jpdbSearchResultHtml(item, index) {
    const [, spelling, reading, gloss, partOfSpeech, rank, , pitch] = item;
    const vid = 800_000 + index;
    return `<div class="result vocabulary">
      <div class="subsection-headword"><div class="primary-spelling"><div class="spelling"><a href="/vocabulary/${vid}/${escapeURIComponent(spelling)}/${escapeURIComponent(reading)}"><ruby>${escapeHtml(spelling)}<rt>${escapeHtml(reading)}</rt></ruby></a></div></div></div>
      <div class="tags"><div class="tag">Top ${rank}</div></div>
      <div class="subsection-meanings"><div class="part-of-speech">${partOfSpeech.map(pos => `<div>${escapeHtml(pos)}</div>`).join('')}</div><div class="description">${escapeHtml(gloss)}</div></div>
      <div class="subsection-pitch-accent"><div class="subsection"><div><div>${jpdbPitchRowsHtml(reading, pitch[0] ?? '')}</div></div></div></div>
    </div>`;
}

function jpdbPitchRowsHtml(reading, pattern) {
    return Array.from(reading).map((character, index) => `<div style="${pattern[index] === 'H' ? '--pitch-high' : '--pitch-low'}: 1">${escapeHtml(character)}</div>`).join('');
}

function parseJsonBody(rawBody) {
    try {
        return typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : JSON.parse(String(rawBody || '{}'));
    } catch {
        return {};
    }
}

function jsonResponse(body, status = 200) {
    return {
        status,
        response: body,
        responseText: JSON.stringify(body),
        contentType: 'application/json',
        headers: corsHeaders(),
    };
}

function textResponse(responseText, contentType = 'text/plain', status = 200) {
    return { status, responseText, contentType, headers: corsHeaders() };
}

function corsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': '*',
    };
}

async function runWatchScenario(context, spec) {
    console.error(`[youtube-real-dom] ${spec.name} ${spec.url}`);
    const page = await context.newPage();
    capturePageDiagnostics(page, spec.name);
    const requestStart = requests.length;
    try {
        await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: 70_000 });
        await dismissConsent(page);
        await page.waitForSelector('ytd-watch-metadata, ytd-app, ytm-app', { timeout: 35_000 }).catch(() => undefined);
        await waitForYomu(page, 35_000);
        await revealWatchContent(page, spec.requireLiveChat);
        await page.waitForTimeout(2500);
        const initial = await readAllFramesState(page);
        await page.screenshot({ path: join(outputDir, `${spec.artifactPrefix}-after-initial.png`), fullPage: false }).catch(() => undefined);
        const sustained = await sustainedProbe(page, spec.artifactPrefix);
        const final = await readAllFramesState(page);
        await page.screenshot({ path: join(outputDir, `${spec.artifactPrefix}-after-sustained.png`), fullPage: false }).catch(() => undefined);
        return {
            name: spec.name,
            url: spec.url,
            signedIn: final.some(frame => frame.signedIn),
            initial,
            sustained,
            final,
            requestSummary: summarizeRequests(requests.slice(requestStart)),
        };
    } finally {
        await page.close().catch(() => undefined);
    }
}

async function runHomeScenario(context) {
    console.error('[youtube-real-dom] home https://www.youtube.com/');
    const page = await context.newPage();
    capturePageDiagnostics(page, 'home');
    const requestStart = requests.length;
    try {
        await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 70_000 });
        await dismissConsent(page);
        await page.waitForSelector('ytd-rich-grid-renderer, ytd-browse, ytm-rich-grid-renderer, ytm-browse, ytm-app', { timeout: 35_000 }).catch(() => undefined);
        await waitForYomu(page, 35_000);
        await page.waitForTimeout(2500);
        const initial = await readAllFramesState(page);
        await page.screenshot({ path: join(outputDir, 'home-after-initial.png'), fullPage: false }).catch(() => undefined);
        await homeStress(page);
        const final = await readAllFramesState(page);
        await page.screenshot({ path: join(outputDir, 'home-after-scroll.png'), fullPage: false }).catch(() => undefined);
        return {
            name: 'home',
            url: 'https://www.youtube.com/',
            signedIn: final.some(frame => frame.signedIn),
            initial,
            final,
            requestSummary: summarizeRequests(requests.slice(requestStart)),
        };
    } finally {
        await page.close().catch(() => undefined);
    }
}

function capturePageDiagnostics(page, label) {
    page.on('pageerror', error => {
        const stack = String(error?.stack || error?.message || error)
            .split('\n')
            .slice(0, 5)
            .map(line => line.trim())
            .join(' | ');
        errors.push(`[${label}:pageerror] ${stack}`);
    });
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb|jiten|reader|userscript/i.test(message.text())) {
            errors.push(`[${label}:console:${message.type()}] ${message.text()}`);
        }
    });
}

async function dismissConsent(page) {
    for (const selector of ['button:has-text("Accept all")', 'button:has-text("すべてに同意")', 'form[action*="consent"] button']) {
        const control = page.locator(selector).first();
        if (await control.count().catch(() => 0)) {
            await control.click({ timeout: 1500 }).catch(() => undefined);
            await page.waitForTimeout(1000);
        }
    }
}

async function waitForYomu(page, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const hasWords = await countFrameWords(page);
        if (hasWords > 0) return;
        await page.waitForTimeout(500);
    }
}

async function countFrameWords(page) {
    const counts = await Promise.all(page.frames().map(frame => frame.evaluate(() => document.querySelectorAll('.jpdb-reader-word, .jpdb-reader-text-mirror').length).catch(() => 0)));
    return counts.reduce((sum, count) => sum + count, 0);
}

async function revealWatchContent(page, requireLiveChat) {
    await page.mouse.move(20, 20).catch(() => undefined);
    await clickFirstVisible(page, [
        'tp-yt-paper-button:has-text("もっと見る")',
        'button:has-text("もっと見る")',
        'yt-button-shape button:has-text("もっと見る")',
        'button:has-text("Show more")',
    ]);
    await page.evaluate(() => window.scrollBy({ top: Math.max(500, window.innerHeight * 0.8), behavior: 'instant' })).catch(() => undefined);
    await page.waitForTimeout(1800);
    await clickFirstVisible(page, [
        'button:has-text("コメント")',
        'button:has-text("Comments")',
    ]);
    if (requireLiveChat) {
        await clickFirstVisible(page, [
            'button:has-text("チャットを表示")',
            'button:has-text("チャット")',
            'button:has-text("パネルを開く")',
            'button[aria-label*="チャットを表示"]',
            'button:has-text("Live chat")',
            'button:has-text("Show chat")',
        ]);
        await page.waitForTimeout(1500);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => undefined);
}

async function clickFirstVisible(page, selectors) {
    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        if (!await locator.count().catch(() => 0)) continue;
        if (!await locator.isVisible().catch(() => false)) continue;
        await locator.click({ timeout: 1500 }).catch(() => undefined);
        await page.waitForTimeout(700);
        return true;
    }
    return false;
}

async function sustainedProbe(page, artifactPrefix) {
    const requestStart = requests.length;
    const samples = [];
    const started = Date.now();
    await hoverFirstTitleWord(page);
    await page.waitForTimeout(500);
    while (Date.now() - started < sustainedMs) {
        const elapsed = Date.now() - started;
        if (elapsed > sustainedMs * 0.25 && elapsed < sustainedMs * 0.35) {
            await page.evaluate(() => window.scrollBy({ top: Math.max(360, window.innerHeight * 0.45), behavior: 'instant' })).catch(() => undefined);
        }
        if (elapsed > sustainedMs * 0.55 && elapsed < sustainedMs * 0.65) {
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => undefined);
            await hoverFirstTitleWord(page);
        }
        samples.push({ t: Date.now() - started, frames: await readAllFramesState(page) });
        await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: join(outputDir, `${artifactPrefix}-sustained-sample.png`), fullPage: false }).catch(() => undefined);
    return {
        durationMs: Date.now() - started,
        samples,
        requestSummary: summarizeRequests(requests.slice(requestStart)),
    };
}

async function hoverFirstTitleWord(page) {
    const target = await firstFrameValue(page, () => {
        const word = document.querySelector('ytd-watch-metadata h1 .jpdb-reader-word, #title .jpdb-reader-word, h1 .jpdb-reader-word');
        if (!word) return null;
        const rect = word.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return null;
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    });
    if (target) await page.mouse.move(target.x, target.y).catch(() => undefined);
}

async function homeStress(page) {
    const started = Date.now();
    while (Date.now() - started < Math.min(8000, sustainedMs)) {
        await page.evaluate(() => window.scrollBy({ top: Math.max(500, window.innerHeight * 0.7), behavior: 'instant' })).catch(() => undefined);
        await page.waitForTimeout(700);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => undefined);
    await page.waitForTimeout(1500);
}

async function firstFrameValue(page, fn) {
    for (const frame of page.frames()) {
        const result = await frame.evaluate(fn).catch(() => null);
        if (result) return result;
    }
    return null;
}

async function readAllFramesState(page) {
    const frames = [];
    for (const frame of page.frames()) {
        const state = await frame.evaluate(readFrameState).catch(error => ({ error: String(error) }));
        frames.push({ url: frame.url(), ...state });
    }
    return frames;
}

function readFrameState() {
    const areaSelectors = {
        title: ['ytd-watch-metadata h1', 'ytd-watch-metadata #title', 'h1.ytd-watch-metadata'],
        channel: ['ytd-watch-metadata #owner ytd-channel-name', 'ytd-watch-metadata #owner #channel-name', '#upload-info ytd-channel-name'],
        viewer: ['ytd-watch-info-text', 'ytd-watch-metadata #info', 'ytd-watch-metadata #info-strings', 'ytd-watch-metadata #info-container'],
        description: ['ytd-watch-metadata #description-inline-expander', 'ytd-watch-metadata #description', '#description'],
        comments: ['ytd-comment-view-model #content-text', 'ytd-comment-renderer #content-text', '#comments #content-text'],
        chatHeader: [
            'yt-live-chat-header-renderer #primary-content',
            'yt-live-chat-header-renderer #title',
            'yt-live-chat-renderer #chat',
            'ytd-live-chat-frame #header',
            'ytd-live-chat-frame #show-hide-button',
            'ytd-watch-metadata #teaser-carousel yt-carousel-title-view-model',
            'ytd-watch-metadata #teaser-carousel h2',
        ],
        chatEngagement: [
            'yt-live-chat-viewer-engagement-message-renderer',
            'yt-live-chat-banner-renderer',
            'yt-live-chat-restricted-participation-renderer',
            'ytd-live-chat-frame #panel-pages',
            'ytd-live-chat-frame yt-formatted-string',
            'ytd-live-chat-frame button',
            'ytd-watch-metadata #teaser-carousel yt-text-carousel-item-view-model',
            'ytd-watch-metadata #teaser-carousel .ytAttributedStringHost',
            'ytd-watch-metadata #teaser-carousel button',
        ],
        chatMessages: ['yt-live-chat-text-message-renderer #message', 'yt-live-chat-paid-message-renderer #message', 'yt-live-chat-membership-item-renderer #message'],
        feedTitles: ['ytd-rich-item-renderer #video-title', 'ytd-rich-item-renderer #video-title-link', 'ytd-video-renderer #video-title', 'yt-lockup-view-model .ytLockupMetadataViewModelTitle'],
    };
    const areas = Object.fromEntries(Object.entries(areaSelectors).map(([name, selectors]) => [name, areaState(selectors)]));
    if (location.pathname === '/live_chat') {
        areas.chatEngagement = mergeAreaState(areas.chatEngagement, areaState(['body']));
    }
    const allWords = [...document.querySelectorAll('.jpdb-reader-word')];
    const allMirrors = [...document.querySelectorAll('.jpdb-reader-text-mirror')];
    return {
        href: location.href,
        title: document.title,
        signedIn: Boolean(document.querySelector('button#avatar-btn, ytd-topbar-menu-button-renderer button#avatar-btn')),
        perf: window.__yomuRealYoutubePerf ?? null,
        totals: {
            words: allWords.length,
            mirrors: allMirrors.length,
            ruby: allWords.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length,
            pitch: allWords.filter(word => /jpdb-pitch-(heiban|atamadaka|nakadaka|odaka)/u.test(word.className)).length,
            inlineWords: allWords.filter(word => !word.closest('.jpdb-reader-text-mirror,[data-jpdb-reader-root]')).length,
            nestedWords: document.querySelectorAll('.jpdb-reader-word .jpdb-reader-word').length,
            nestedRuby: document.querySelectorAll('ruby ruby').length,
        },
        areas,
        missingParsing: Object.entries(areas)
            .filter(([, area]) => area.present && area.visible && area.hasJapanese && area.words === 0)
            .map(([name, area]) => ({ name, text: area.nativeText.slice(0, 160) })),
    };

    function areaState(selectors) {
        const roots = selectors.flatMap(selector => [...document.querySelectorAll(selector)]).filter(uniqueElement);
        const states = roots.slice(0, 12).map(rootState);
        return {
            present: states.length > 0,
            roots: states,
            nativeText: states.map(state => state.nativeText).filter(Boolean).join(' | '),
            visibleText: states.map(state => state.visibleText).filter(Boolean).join(' | '),
            hasJapanese: states.some(state => state.hasJapanese),
            visible: states.some(state => state.visible || state.mirrorVisible),
            words: states.reduce((sum, state) => sum + state.words, 0),
            mirrors: states.reduce((sum, state) => sum + state.mirrors, 0),
            ruby: states.reduce((sum, state) => sum + state.ruby, 0),
            pitch: states.reduce((sum, state) => sum + state.pitch, 0),
            inlineWords: states.reduce((sum, state) => sum + state.inlineWords, 0),
            nestedWords: states.reduce((sum, state) => sum + state.nestedWords, 0),
            nestedRuby: states.reduce((sum, state) => sum + state.nestedRuby, 0),
        };
    }

    function rootState(root) {
        const words = [...root.querySelectorAll('.jpdb-reader-word')];
        const mirrors = [...root.querySelectorAll('.jpdb-reader-text-mirror')];
        return {
            selector: cssPath(root),
            nativeText: nativeTextExcludingMirrors(root),
            visibleText: (root.innerText || root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            hasJapanese: /[\u3040-\u30ff\u3400-\u9fff]/u.test(nativeTextExcludingMirrors(root)),
            visible: visible(root),
            mirrorVisible: mirrors.some(visible),
            words: words.length,
            mirrors: mirrors.length,
            ruby: words.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length,
            pitch: words.filter(word => /jpdb-pitch-(heiban|atamadaka|nakadaka|odaka)/u.test(word.className)).length,
            inlineWords: words.filter(word => !word.closest('.jpdb-reader-text-mirror,[data-jpdb-reader-root]')).length,
            nestedWords: root.querySelectorAll('.jpdb-reader-word .jpdb-reader-word').length,
            nestedRuby: root.querySelectorAll('ruby ruby').length,
            duplicateMirrorHosts: duplicateMirrorHosts(root),
        };
    }

    function mergeAreaState(a, b) {
        return {
            present: a.present || b.present,
            roots: [...a.roots, ...b.roots],
            nativeText: [a.nativeText, b.nativeText].filter(Boolean).join(' | '),
            visibleText: [a.visibleText, b.visibleText].filter(Boolean).join(' | '),
            hasJapanese: a.hasJapanese || b.hasJapanese,
            visible: a.visible || b.visible,
            words: a.words + b.words,
            mirrors: a.mirrors + b.mirrors,
            ruby: a.ruby + b.ruby,
            pitch: a.pitch + b.pitch,
            inlineWords: a.inlineWords + b.inlineWords,
            nestedWords: a.nestedWords + b.nestedWords,
            nestedRuby: a.nestedRuby + b.nestedRuby,
        };
    }

    function duplicateMirrorHosts(root) {
        const counts = new Map();
        for (const mirror of root.querySelectorAll('.jpdb-reader-text-mirror')) {
            const host = mirror.parentElement;
            if (!host) continue;
            counts.set(host, (counts.get(host) || 0) + 1);
        }
        return [...counts.values()].filter(count => count > 1).length;
    }

    function nativeTextExcludingMirrors(root) {
        let text = '';
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                return node.parentElement?.closest('.jpdb-reader-text-mirror')
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            },
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent || '';
        return text.replace(/\s+/g, ' ').trim();
    }

    function visible(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1
            && rect.height > 1
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth
            && style.visibility !== 'hidden'
            && style.opacity !== '0';
    }

    function uniqueElement(element, index, elements) {
        return elements.indexOf(element) === index;
    }

    function cssPath(element) {
        if (!(element instanceof Element)) return '';
        const id = element.id ? `#${element.id}` : '';
        const cls = Array.from(element.classList || []).slice(0, 2).map(name => `.${name}`).join('');
        return `${element.localName}${id}${cls}`;
    }
}

function assertTargetWatch(target) {
    const final = mergedFrames(target.final);
    assertAreaParsed(final, 'title', 'Target title did not stay parsed/visible');
    assertAreaParsed(final, 'channel', 'Target channel did not stay parsed/visible', { allowMissing: true });
    assertAreaParsed(final, 'viewer', 'Target viewer/live info did not stay parsed/visible', { allowMissing: true });
    assertStableSamples(target.sustained.samples, ['title']);
    assertNoAreaDuplication(final, ['title', 'channel', 'viewer']);
    assertNoIdleLoop(target.sustained.requestSummary, 'target watch');
}

function assertLiveChatWatch(liveChat) {
    const final = mergedFrames(liveChat.final);
    const chatAreas = ['chatHeader', 'chatEngagement', 'chatMessages'];
    const presentChatAreas = chatAreas.map(area => [area, bestArea(final, area)]).filter(([, state]) => state.present);
    assert(presentChatAreas.length > 0, 'Live chat panel/frame was not present; live-chat verification is unresolved.', liveChat);
    const japaneseChatAreas = presentChatAreas.filter(([, state]) => state.hasJapanese);
    assert(japaneseChatAreas.length > 0, 'Live chat panel was present but no Japanese chat chrome/messages were visible.', liveChat);
    for (const [area] of japaneseChatAreas) {
        assertAreaParsed(final, area, `Live chat ${area} did not stay parsed/visible`);
    }
    const viewer = bestArea(final, 'viewer');
    if (viewer.present && viewer.hasJapanese) assertAreaParsed(final, 'viewer', 'Live watch viewer/live info did not stay parsed/visible');
    assertStableAnyJapaneseArea(liveChat.sustained.samples, chatAreas, 'live chat');
    assertNoAreaDuplication(final, ['viewer', ...chatAreas]);
    assertNoIdleLoop(liveChat.sustained.requestSummary, 'live chat watch');
}

function assertNormalWatch(normal) {
    const final = mergedFrames(normal.final);
    assertAreaParsed(final, 'title', 'Normal watch title did not parse');
    assertAreaParsed(final, 'description', 'Normal watch description did not parse', { allowMissing: true });
    const comments = bestArea(final, 'comments');
    if (comments.present && comments.hasJapanese) assertAreaParsed(final, 'comments', 'Normal watch comments did not parse', { allowOffscreen: true, allowNoRubyPitch: true });
    assertNoAreaDuplication(final, ['title', 'description', 'comments']);
}

function assertHome(home) {
    const final = mergedFrames(home.final);
    const feed = bestArea(final, 'feedTitles');
    // A signed-in home feed is frequently English-dominant or has its Japanese
    // items below the fold, where the visible-only scan correctly leaves them
    // alone. Only require annotation when a Japanese feed title is actually
    // on-screen (matching the comments/viewer gating); duplication checks always
    // run. Annotation on guaranteed-Japanese surfaces is covered by the
    // watch/live-chat probes.
    const visibleJapaneseFeedTitle = (feed.roots ?? []).some(root => root.visible && root.hasJapanese);
    if (visibleJapaneseFeedTitle) {
        assertAreaParsed(final, 'feedTitles', 'YouTube home/feed titles did not parse', { allowNoRubyPitch: true });
    } else {
        console.error('[youtube-real-dom] home: no visible Japanese feed title on screen; skipping feed-title annotation assert (English-dominant/off-screen feed)');
    }
    assertNoAreaDuplication(final, ['feedTitles']);
}

function assertAreaParsed(frameState, areaName, message, options = {}) {
    const area = bestArea(frameState, areaName);
    if (options.allowMissing && !area.present) return;
    assert(area.present, `${message}: area missing`, frameState);
    if (!options.allowOffscreen) assert(area.visible, `${message}: area not visible`, area);
    assert(area.words > 0, `${message}: no reader words`, area);
    assert(area.mirrors > 0, `${message}: no non-destructive mirrors`, area);
    if (!options.allowNoRubyPitch) assert(area.ruby > 0 || area.pitch > 0, `${message}: no ruby or pitch`, area);
}

function assertNoAreaDuplication(frameState, areaNames) {
    for (const areaName of areaNames) {
        const area = bestArea(frameState, areaName);
        if (!area.present) continue;
        assert(area.inlineWords === 0, `${areaName} has inline reader words outside mirrors`, area);
        assert(area.nestedWords === 0, `${areaName} has nested reader words`, area);
        assert(area.nestedRuby === 0, `${areaName} has nested ruby`, area);
        assert(area.roots.every(root => !root.duplicateMirrorHosts), `${areaName} has duplicate mirrors on one text host`, area);
    }
}

function assertStableSamples(samples, areaNames) {
    assert(samples.length >= 5, 'Sustained probe did not collect enough samples', { samples: samples.length });
    for (const sample of samples) {
        const frameState = mergedFrames(sample.frames);
        for (const areaName of areaNames) {
            const area = bestArea(frameState, areaName);
            assert(area.visible && area.words > 0, `${areaName} disappeared during sustained probe`, { t: sample.t, area });
            assert(area.inlineWords === 0 && area.nestedWords === 0 && area.nestedRuby === 0, `${areaName} duplicated during sustained probe`, { t: sample.t, area });
        }
    }
}

function assertStableAnyJapaneseArea(samples, areaNames, label) {
    assert(samples.length >= 5, `Sustained probe did not collect enough ${label} samples`, { samples: samples.length });
    for (const sample of samples) {
        const frameState = mergedFrames(sample.frames);
        const areas = areaNames.map(areaName => bestArea(frameState, areaName)).filter(area => area.present && area.hasJapanese);
        assert(areas.length > 0, `${label} disappeared during sustained probe`, { t: sample.t, areaNames });
        for (const area of areas) {
            assert(area.visible && area.words > 0, `${label} lost parsed words during sustained probe`, { t: sample.t, area });
            assert(area.inlineWords === 0 && area.nestedWords === 0 && area.nestedRuby === 0, `${label} duplicated during sustained probe`, { t: sample.t, area });
        }
    }
}

function assertNoIdleLoop(summary, label) {
    const parseCount = summary.byKind['jpdb-parse'] ?? 0;
    assert(parseCount <= 20, `Possible repeated reparse loop while idle on ${label}`, summary);
}

function mergedFrames(frames) {
    const areas = {};
    for (const frame of frames.filter(frame => !frame.error)) {
        for (const [name, area] of Object.entries(frame.areas ?? {})) {
            const current = areas[name] ?? emptyArea();
            areas[name] = mergeArea(current, area);
        }
    }
    return { frames, areas };
}

function bestArea(frameState, name) {
    return frameState.areas[name] ?? emptyArea();
}

function emptyArea() {
    return {
        present: false,
        roots: [],
        nativeText: '',
        visibleText: '',
        hasJapanese: false,
        visible: false,
        words: 0,
        mirrors: 0,
        ruby: 0,
        pitch: 0,
        inlineWords: 0,
        nestedWords: 0,
        nestedRuby: 0,
        duplicateMirrorHosts: 0,
    };
}

function mergeArea(a, b) {
    return {
        present: a.present || b.present,
        roots: [...a.roots, ...b.roots],
        nativeText: [a.nativeText, b.nativeText].filter(Boolean).join(' | '),
        visibleText: [a.visibleText, b.visibleText].filter(Boolean).join(' | '),
        hasJapanese: a.hasJapanese || b.hasJapanese,
        visible: a.visible || b.visible,
        words: a.words + b.words,
        mirrors: a.mirrors + b.mirrors,
        ruby: a.ruby + b.ruby,
        pitch: a.pitch + b.pitch,
        inlineWords: a.inlineWords + b.inlineWords,
        nestedWords: a.nestedWords + b.nestedWords,
        nestedRuby: a.nestedRuby + b.nestedRuby,
        duplicateMirrorHosts: (a.duplicateMirrorHosts || 0) + (b.duplicateMirrorHosts || 0),
    };
}

function summarizeRequests(entries) {
    const byKind = {};
    let parseChars = 0;
    for (const entry of entries) {
        byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
        if (entry.kind === 'jpdb-parse') parseChars += entry.chars ?? 0;
    }
    return { total: entries.length, byKind, parseChars, samples: entries.slice(0, 20) };
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
