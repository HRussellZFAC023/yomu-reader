#!/usr/bin/env node
/**
 * Live YouTube watch-page profiler.
 *
 * Unlike youtube-performance-profile.mjs, this driver does not replace the
 * YouTube document, player, media, captions, or network. It injects the exact
 * built userscript @require graph into a clean browser context, mocks only the
 * third-party services Yomu itself calls, and records behavior on a real public
 * watch page. Chromium replays use CDP CPU sampling / precise coverage; WebKit
 * replays retain the same DOM interaction evidence without claiming CDP data.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    dismissConsent,
    gmRequestFetchBody,
    jsonHttpResponse,
    mockJpdbParseFromVocabulary,
    textResponse,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';
import { addUserscriptGraphInitScripts, userscriptCompanionPaths } from '../lib/smoke-test-helpers.mjs';
import { cdpMetrics, metricDelta } from '../lib/cdp-performance-metrics.mjs';
import { configureFunctionProfiler, startFunctionProfiler, stopFunctionProfiler } from '../lib/youtube-performance-cdp.mjs';
import { summarizeCpuProfile, summarizePreciseCoverage } from '../lib/youtube-performance-evidence.mjs';
import { profileDriverProvenance } from '../lib/youtube-performance-provenance.mjs';
import { createYomuPaths } from '../lib/paths.mjs';

const { appRoot, qaArtifactsRoot } = createYomuPaths(import.meta.dirname);
const userscriptPath = resolve(process.env.YOMU_LIVE_YOUTUBE_USERSCRIPT ?? join(appRoot, 'dist/yomu.user.js'));
const cssPath = resolve(process.env.YOMU_LIVE_YOUTUBE_CSS ?? join(appRoot, 'dist/yomu.css'));
const outputRoot = resolve(process.env.YOMU_LIVE_YOUTUBE_OUTPUT_DIR
    ?? join(qaArtifactsRoot, 'youtube-live-watch-performance', process.env.YOMU_LIVE_YOUTUBE_LABEL ?? 'latest'));
const watchUrl = process.env.YOMU_LIVE_YOUTUBE_URL
    ?? 'https://www.youtube.com/watch?v=TAorfFcb8_g&t=5050s&hl=ja&gl=JP';
const cpuThrottleRate = positiveNumber(process.env.YOMU_LIVE_YOUTUBE_CPU_THROTTLE ?? '4', 'CPU throttle');
const idleWaitMs = positiveNumber(process.env.YOMU_LIVE_YOUTUBE_IDLE_WAIT_MS ?? '4500', 'native-controls idle wait');
const headed = process.env.YOMU_LIVE_YOUTUBE_HEADED === '1';
const requestBridgeName = '__yomuLiveYoutubeProfileRequest';
const allowedRuns = new Map([
    ['chromium:none', { engine: 'chromium', mode: 'none' }],
    ['chromium:cpu', { engine: 'chromium', mode: 'cpu' }],
    ['chromium:coverage', { engine: 'chromium', mode: 'coverage' }],
    ['webkit:none', { engine: 'webkit', mode: 'none' }],
]);
const artifactGraph = artifactGraphSnapshot(userscriptPath);
const harnessRevision = gitRevision(appRoot);
const productRevision = gitLastChangeRevision(appRoot, userscriptPath);
const runs = requestedRuns();

// Each live driver owns the smallest vocabulary needed by its actual target
// page; sharing this with the synthetic homepage fixture would couple their
// independently evolving network contracts.
// fallow-ignore-next-line code-duplication
const vocabulary = [
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['known'], ['LHHH']],
    ['字幕', '字幕', 'じまく', 'subtitles', ['n'], 1500, ['known'], ['LHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['n', 'vs'], 900, ['known'], ['LHHH']],
    ['読む', '読む', 'よむ', 'read', ['v5m'], 400, ['known'], ['LH']],
    ['新卒', '新卒', 'しんそつ', 'new graduate', ['n'], 2100, ['not-in-deck'], ['LHHH']],
    ['エンジニア', 'エンジニア', 'エンジニア', 'engineer', ['n'], 1400, ['known'], ['LHHHHH']],
    ['ライブ', 'ライブ', 'ライブ', 'live stream', ['n'], 1700, ['known'], ['LHH']],
    ['今回', '今回', 'こんかい', 'this time', ['n'], 900, ['known'], ['LHHH']],
    ['説明', '説明', 'せつめい', 'explanation', ['n', 'vs'], 600, ['known'], ['LHHH']],
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']],
];

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const report = {
    generatedAt: new Date().toISOString(),
    harnessRevision,
    productRevision,
    watchUrl,
    device: {
        name: 'iPad-like landscape Chrome/WebKit',
        viewport: { width: 1194, height: 834 },
        screen: { width: 1194, height: 834 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: false,
        cpuThrottleRate,
    },
    thermalSensor: {
        available: false,
        limitation: 'Playwright/CDP exposes renderer work, long tasks, frame gaps, and heap; it does not expose physical iPad temperature or power draw.',
    },
    artifacts: artifactGraph.descriptor,
    profilerDriver: profileDriverProvenance(import.meta.filename, appRoot),
    runs: [],
};

for (const run of runs) {
    console.error(`[youtube-live-watch] ${run.engine}/${run.mode}`);
    report.runs.push(await runReplay(run));
}

report.acceptance = acceptanceSummary(report.runs);
writeFileSync(join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.acceptance.actualYoutubeDom || !report.acceptance.runtimeHealthy) {
    throw new Error('Live YouTube or the exact Yomu runtime graph did not become ready.');
}

// Browser lifecycle, failure evidence, and profiler teardown belong in one
// transaction so a partial run can never masquerade as release evidence.
// fallow-ignore-next-line complexity
async function runReplay(run) {
    const runDir = join(outputRoot, `${run.engine}-${run.mode}`);
    mkdirSync(runDir, { recursive: true });
    const browserType = run.engine === 'webkit' ? webkit : chromium;
    const launchOptions = run.engine === 'chromium'
        ? { channel: process.env.YOMU_LIVE_YOUTUBE_CHROMIUM_CHANNEL || 'chrome', headless: !headed, args: ['--autoplay-policy=no-user-gesture-required'] }
        : { headless: !headed };
    const browser = await browserType.launch(launchOptions);
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1194, height: 834 },
        screen: { width: 1194, height: 834 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: false,
    });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(70_000);
    const network = { requests: 0, failed: [], byHost: {}, byType: {} };
    const bridgeRequests = [];
    let page;
    let client;
    let profilerStarted = false;
    try {
        await installConsentCookies(context);
        await context.exposeFunction(requestBridgeName, request => bridgeResponse(request, bridgeRequests));
        await addGmStorageBridgeInitScript(context, {
            key: YOMU_SETTINGS_KEY,
            value: liveProfileSettings(),
            css: readFileSync(cssPath, 'utf8'),
            requestBridgeName,
        });
        await installNonInvasivePageInstrumentation(context);
        await addUserscriptGraphInitScripts(context, userscriptPath, {
            sourceUrl: artifactGraph.descriptor.sourceUrl,
            content: artifactGraph.content,
        });

        page = await context.newPage();
        installNetworkJournal(page, network);
        client = run.engine === 'chromium' ? await context.newCDPSession(page) : null;
        if (client) {
            await client.send('Performance.enable');
            await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottleRate });
            await configureFunctionProfiler(client, run.mode);
        }

        const navigationStartedAt = Date.now();
        await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 70_000 });
        await dismissConsent(page);
        await Promise.all([
            page.waitForSelector('#movie_player, .html5-video-player, ytd-player', { state: 'attached', timeout: 35_000 }),
            page.waitForSelector('video.html5-main-video, #movie_player video, ytd-player video', { state: 'attached', timeout: 35_000 }),
            waitForRuntimeReady(page, 40_000),
        ]);
        await page.waitForTimeout(1500);
        const initial = await readLiveState(page, client);
        await page.evaluate(() => window.__yomuLiveWatchPerf?.reset());
        const beforeMetrics = client ? await cdpMetrics(client) : null;
        if (client) {
            await startFunctionProfiler(client, run.mode);
            profilerStarted = run.mode === 'cpu' || run.mode === 'coverage';
        }

        const interaction = await exerciseLiveWatchPage(page, runDir);
        const functionEvidence = client ? await stopAndSummarizeProfiler(client, run.mode, runDir) : null;
        profilerStarted = false;
        const afterMetrics = client ? await cdpMetrics(client) : null;
        const final = await readLiveState(page, client);
        await page.screenshot({ path: join(runDir, 'live-watch.png'), fullPage: false });
        const result = {
            engine: run.engine,
            mode: run.mode,
            browserVersion: browser.version(),
            navigationMs: Date.now() - navigationStartedAt,
            finalUrl: page.url(),
            initial,
            interaction,
            workload: {
                cdpDelta: beforeMetrics && afterMetrics ? metricDelta(beforeMetrics, afterMetrics) : null,
                page: await page.evaluate(() => window.__yomuLiveWatchPerf?.snapshot() ?? null),
            },
            functionEvidence,
            network: networkSummary(network),
            yomuBridgeRequests: summarizeBridgeRequests(bridgeRequests),
            artifacts: { directory: runDir, screenshot: join(runDir, 'live-watch.png') },
            final,
        };
        writeFileSync(join(runDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
        return result;
    } catch (error) {
        if (profilerStarted && client) await stopFunctionProfiler(client, run.mode).catch(() => undefined);
        await page?.screenshot({ path: join(runDir, 'failure.png'), fullPage: false }).catch(() => undefined);
        const failure = {
            engine: run.engine,
            mode: run.mode,
            browserVersion: browser.version(),
            error: { name: error?.name ?? 'Error', message: String(error?.message ?? error), stack: String(error?.stack ?? '') },
            finalUrl: page?.url() ?? '',
            state: page ? await readLiveState(page, client).catch(() => null) : null,
            network: networkSummary(network),
            yomuBridgeRequests: summarizeBridgeRequests(bridgeRequests),
            artifacts: { directory: runDir, screenshot: join(runDir, 'failure.png') },
        };
        writeFileSync(join(runDir, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
        return failure;
    } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
}

function requestedRuns() {
    const raw = process.env.YOMU_LIVE_YOUTUBE_RUNS ?? 'chromium:cpu,chromium:coverage,webkit:none';
    return raw.split(',').map(parseRequestedRun);
}

function parseRequestedRun(value) {
    const key = value.trim();
    const run = allowedRuns.get(key);
    if (!run) throw new Error(`Unsupported live YouTube replay: ${key}.`);
    return run;
}

function liveProfileSettings() {
    return {
        onboardingSeen: true,
        interfaceLanguage: 'en',
        apiKey: 'live-youtube-profile-key',
        jitenApiKey: '',
        parserProvider: 'jpdb',
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
        youtubeShowFilterNotice: false,
        youtubeShowChannelRecommendations: false,
        preferJapaneseSiteLanguage: false,
        subtitlePlayerEnabled: true,
        subtitleAutoDetect: true,
        subtitleOverlayVisible: true,
        subtitleOverlayVisibleChosen: true,
        subtitleSecondaryVisible: false,
        subtitleControlsMode: 'auto',
        subtitleHoverPause: false,
        subtitlePausePanel: false,
        ocrEnabled: true,
        ocrAutoScanImages: false,
        ocrShowTextOverlay: true,
        ocrProvider: 'local-service',
        ocrEndpointUrl: 'http://127.0.0.1:7331/ocr',
        ocrMinImageArea: 1,
        ocrMaxImagesPerPage: 2,
        ocrPrefetchMargin: 0,
        ocrVideoPauseFrames: true,
    };
}

async function exerciseLiveWatchPage(page, runDir) {
    const playback = await startPlayback(page);
    const nativeControls = await exerciseNativeControls(page);
    const subtitles = await exerciseSubtitleHover(page);
    const ocr = await exercisePausedFrameOcrHover(page);
    await page.screenshot({ path: join(runDir, 'interaction-final.png'), fullPage: false }).catch(() => undefined);
    return { playback, nativeControls, subtitles, ocr };
}

async function startPlayback(page) {
    const result = await page.evaluate(startLiveVideoPlayback);
    await page.waitForTimeout(800);
    return result;
}

// Serialized into the real YouTube page; defensive branches describe third-
// party media readiness and are clearer kept beside the values they record.
// fallow-ignore-next-line complexity
async function startLiveVideoPlayback() {
    const video = document.querySelector('video.html5-main-video, #movie_player video, ytd-player video');
    if (!(video instanceof HTMLVideoElement)) return { found: false };
    video.muted = true;
    let playError = '';
    try {
        await video.play();
    } catch (error) {
        playError = String(error?.message ?? error);
    }
    return {
        found: true,
        paused: video.paused,
        currentTime: Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 10) / 10 : null,
        duration: Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : null,
        readyState: video.readyState,
        playError,
    };
}

async function exerciseNativeControls(page) {
    const player = page.locator('#movie_player, .html5-video-player').first();
    const box = await player.boundingBox();
    if (!box) return { found: false };
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.82);
    await page.waitForTimeout(350);
    const awake = await page.evaluate(readNativeControlState);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(idleWaitMs);
    const idle = await page.evaluate(readNativeControlState);
    return {
        found: true,
        idleWaitMs,
        awake,
        idle,
        autoHideObserved: Boolean(idle.playerAutohide || idle.chromeOpacity <= 0.1),
        yomuDidNotRetainFocus: !idle.activeInsideYomu && idle.yomuFocused === 0,
    };
}

// Serialized third-party DOM snapshot: missing/variant YouTube controls must be
// evidence, not a profiler crash.
// fallow-ignore-next-line complexity
function readNativeControlState() {
    const player = document.querySelector('#movie_player, .html5-video-player');
    const chrome = document.querySelector('.ytp-chrome-bottom');
    const active = document.activeElement;
    const opacity = chrome instanceof Element ? Number.parseFloat(getComputedStyle(chrome).opacity || '1') : 1;
    return {
        playerClass: player?.className ?? '',
        playerAutohide: Boolean(player?.classList.contains('ytp-autohide')),
        chromeOpacity: Number.isFinite(opacity) ? opacity : 1,
        chromePointerEvents: chrome instanceof Element ? getComputedStyle(chrome).pointerEvents : '',
        activeTag: active?.tagName ?? '',
        activeClass: active instanceof HTMLElement ? active.className : '',
        activeInsideYomu: Boolean(active?.closest?.('[data-jpdb-reader-root], .jpdb-reader-popover, .jpdb-ocr-layer')),
        activeInsidePlayer: Boolean(active?.closest?.('#movie_player, .html5-video-player')),
        yomuFocused: document.querySelectorAll('[data-jpdb-reader-root] :focus, .jpdb-reader-popover :focus, .jpdb-ocr-layer :focus').length,
        yomuHovered: document.querySelectorAll('[data-jpdb-reader-root] :hover, .jpdb-reader-popover:hover, .jpdb-ocr-layer :hover').length,
    };
}

async function exerciseSubtitleHover(page) {
    const root = page.locator('.jpdb-subtitle-player').first();
    const rootPresent = await root.waitFor({ state: 'attached', timeout: 12_000 }).then(() => true).catch(() => false);
    if (!rootPresent) return { rootPresent: false };
    await enableNativeCaptions(page);
    await selectDetectedJapaneseTrack(page);
    const word = page.locator('.jpdb-subtitle-primary .jpdb-reader-word:visible, .ytp-caption-segment .jpdb-reader-word:visible').first();
    const wordPresent = await word.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);
    const hover = wordPresent ? await hoverLookupSurface(page, word) : null;
    return {
        rootPresent,
        wordPresent,
        hover,
        state: await page.evaluate(() => ({
            primaryText: (document.querySelector('.jpdb-subtitle-primary')?.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 180),
            primaryWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
            nativeCaptionSegments: document.querySelectorAll('.ytp-caption-segment').length,
            detectedTracks: document.querySelectorAll('.jpdb-subtitle-track-row').length,
        })),
    };
}

async function enableNativeCaptions(page) {
    const button = page.locator('.ytp-subtitles-button').first();
    if (!await button.isVisible().catch(() => false)) return;
    if (await button.getAttribute('aria-pressed') !== 'true') await button.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(700);
}

// YouTube can expose zero, virtualized, or already-selected rows depending on
// account/rollout state; the tolerant branches are the actual live contract.
// fallow-ignore-next-line complexity
async function selectDetectedJapaneseTrack(page) {
    const toggle = page.locator('.jpdb-subtitle-panel-toggle').first();
    if (await toggle.isVisible().catch(() => false)) await toggle.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1200);
    const rows = page.locator('.jpdb-subtitle-track-row');
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
        const row = rows.nth(index);
        if (!/(?:\bJA\b|Japanese|日本語)/u.test(await row.innerText().catch(() => ''))) continue;
        const primary = row.locator('[data-action="primary-track"]');
        if (await primary.getAttribute('aria-pressed') !== 'true') await primary.click({ force: true }).catch(() => undefined);
        break;
    }
    const load = page.locator('.jpdb-subtitle-list [data-action="load"]').first();
    if (count === 0 && await load.isVisible().catch(() => false)) await load.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1300);
}

async function exercisePausedFrameOcrHover(page) {
    const videoState = await page.evaluate(async () => {
        const video = document.querySelector('video.html5-main-video, #movie_player video, ytd-player video');
        if (!(video instanceof HTMLVideoElement)) return { found: false };
        if (video.paused) {
            video.muted = true;
            await video.play().catch(() => undefined);
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        video.pause();
        return {
            found: true,
            paused: video.paused,
            readyState: video.readyState,
            currentTime: Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 10) / 10 : null,
        };
    });
    const frame = page.locator('.jpdb-ocr-video-frame').first();
    const framePresent = await frame.waitFor({ state: 'attached', timeout: 12_000 }).then(() => true).catch(() => false);
    const line = page.locator('.jpdb-ocr-layer .jpdb-ocr-line').first();
    const linePresent = framePresent && await line.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);
    const word = page.locator('.jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word:visible').first();
    const wordPresent = linePresent && await word.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    const hover = wordPresent ? await hoverLookupSurface(page, word) : null;
    return {
        videoState,
        framePresent,
        linePresent,
        wordPresent,
        hover,
        state: await page.evaluate(() => ({
            frames: document.querySelectorAll('.jpdb-ocr-video-frame').length,
            lines: document.querySelectorAll('.jpdb-ocr-layer .jpdb-ocr-line').length,
            words: document.querySelectorAll('.jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word').length,
            status: document.querySelector('.jpdb-ocr-video-frame-status')?.textContent?.trim() ?? '',
        })),
    };
}

async function hoverLookupSurface(page, locator) {
    const started = await page.evaluate(() => performance.now());
    await locator.hover({ force: true });
    const opened = await page.locator('.jpdb-reader-popover:visible').first().waitFor({ state: 'visible', timeout: 3500 })
        .then(() => true).catch(() => false);
    const openedAt = await page.evaluate(() => performance.now());
    const text = opened ? await page.locator('.jpdb-reader-popover:visible').first().innerText().catch(() => '') : '';
    await page.mouse.move(4, 4);
    const closeStarted = await page.evaluate(() => performance.now());
    const closed = await page.locator('.jpdb-reader-popover:visible').first().waitFor({ state: 'hidden', timeout: 2000 })
        .then(() => true).catch(() => false);
    const closedAt = await page.evaluate(() => performance.now());
    return {
        opened,
        openMs: opened ? round(openedAt - started) : null,
        closed,
        closeMs: closed ? round(closedAt - closeStarted) : null,
        text: text.replace(/\s+/gu, ' ').trim().slice(0, 180),
    };
}

async function stopAndSummarizeProfiler(client, mode, runDir) {
    const raw = await stopFunctionProfiler(client, mode);
    if (mode === 'cpu') {
        writeFileSync(join(runDir, 'cpu-profile.raw.json'), `${JSON.stringify(raw.profile)}\n`);
        return { mode, sampled: summarizeCpuProfile(raw.profile, artifactGraph.descriptor) };
    }
    if (mode === 'coverage') {
        const scopedScripts = raw.scripts.filter(script => script.url === artifactGraph.descriptor.sourceUrl);
        writeFileSync(join(runDir, 'coverage.raw.json'), `${JSON.stringify(scopedScripts)}\n`);
        return { mode, calls: summarizePreciseCoverage(scopedScripts, artifactGraph.descriptor) };
    }
    return { mode };
}

async function readLiveState(page, client) {
    const [pageState, cdp] = await Promise.all([
        page.evaluate(readLivePageState),
        client ? cdpMetrics(client).catch(() => null) : null,
    ]);
    return { ...pageState, cdp };
}

// Serialized third-party page snapshot; optional fields distinguish YouTube
// rollout variants instead of treating their absence as Yomu failures.
// fallow-ignore-next-line complexity
function readLivePageState() {
    const rounded = value => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
    const video = document.querySelector('video.html5-main-video, #movie_player video, ytd-player video');
    const owner = document.querySelector('#jpdb-reader-runtime-owner');
    const captionTracks = globalThis.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const resources = performance.getEntriesByType('resource');
    return {
        href: location.href,
        title: document.title,
        youtube: {
            app: Boolean(document.querySelector('ytd-app, ytm-app')),
            player: Boolean(document.querySelector('#movie_player, .html5-video-player, ytd-player')),
            video: video instanceof HTMLVideoElement ? {
                paused: video.paused,
                readyState: video.readyState,
                currentTime: rounded(video.currentTime),
                duration: rounded(video.duration),
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
            } : null,
            captionTracks: captionTracks.map(track => ({ languageCode: track.languageCode, kind: track.kind ?? '', name: track.name?.simpleText ?? '' })).slice(0, 12),
            googleVideoResources: resources.filter(entry => /googlevideo\.com$/u.test(new URL(entry.name).hostname)).length,
            youtubeResources: resources.filter(entry => /(?:^|\.)youtube\.com$/u.test(new URL(entry.name).hostname)).length,
        },
        yomu: {
            installed: Boolean(document.querySelector('#jpdb-reader-installed-runtime')),
            runtimeKind: owner?.getAttribute('data-yomu-runtime-kind') ?? '',
            runtimeHealth: owner?.getAttribute('data-yomu-runtime-health') ?? '',
            runtimeServices: owner?.getAttribute('data-yomu-runtime-services') ?? '',
            subtitleRoot: Boolean(document.querySelector('.jpdb-subtitle-player')),
            ocrFrames: document.querySelectorAll('.jpdb-ocr-video-frame').length,
            popovers: document.querySelectorAll('.jpdb-reader-popover').length,
        },
        pagePerf: window.__yomuLiveWatchPerf?.snapshot() ?? null,
    };
}

async function waitForRuntimeReady(page, timeout) {
    await page.waitForFunction(() => {
        const owner = document.querySelector('#jpdb-reader-runtime-owner');
        return owner?.getAttribute('data-yomu-runtime-health') === 'ready';
    }, null, { timeout });
}

async function installConsentCookies(context) {
    await context.addCookies([
        { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
        { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpZnlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
    ]).catch(() => undefined);
}

async function installNonInvasivePageInstrumentation(context) {
    await context.addInitScript(() => {
        const state = {
            startedAt: performance.now(),
            longTasks: 0,
            longTaskMs: 0,
            maxLongTaskMs: 0,
            animationFrames: 0,
            over50MsFrameGaps: 0,
            maxFrameGapMs: 0,
        };
        const reset = () => {
            state.startedAt = performance.now();
            state.longTasks = 0;
            state.longTaskMs = 0;
            state.maxLongTaskMs = 0;
            state.animationFrames = 0;
            state.over50MsFrameGaps = 0;
            state.maxFrameGapMs = 0;
        };
        const snapshot = () => ({ ...state, elapsedMs: Math.round((performance.now() - state.startedAt) * 10) / 10 });
        Object.defineProperty(window, '__yomuLiveWatchPerf', { value: { reset, snapshot }, configurable: true });
        try {
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    state.longTasks += 1;
                    state.longTaskMs += entry.duration;
                    state.maxLongTaskMs = Math.max(state.maxLongTaskMs, entry.duration);
                }
            }).observe({ entryTypes: ['longtask'] });
        } catch {
            // WebKit does not currently expose Long Tasks here.
        }
        let lastFrame = performance.now();
        const frame = now => {
            const gap = now - lastFrame;
            state.animationFrames += 1;
            state.maxFrameGapMs = Math.max(state.maxFrameGapMs, gap);
            if (gap > 50) state.over50MsFrameGaps += 1;
            lastFrame = now;
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    });
}

// Only Yomu-owned outbound services are mocked. These branches are deliberately
// explicit so a future endpoint cannot silently turn into real test traffic.
// fallow-ignore-next-line complexity
async function bridgeResponse(request, journal) {
    const body = gmRequestFetchBody(request);
    const url = new URL(request.url);
    const journalEntry = {
        url: `${url.origin}${url.pathname}`,
        method: request.method ?? 'GET',
        bytes: requestBodyBytes(body),
        caption: captionRequestDescriptor(url),
    };
    journal.push(journalEntry);
    if (url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext') {
        return liveTextResponse(request, journalEntry);
    }
    if (url.href.startsWith('https://jpdb.io/api/v1/parse')) {
        const parsed = parseJsonBody(body);
        return jsonHttpResponse(mockJpdbParseFromVocabulary(parsed, vocabulary, { defaultState: ['known'] }));
    }
    if (url.hostname === '127.0.0.1' && url.port === '7331' && url.pathname === '/ocr') {
        return jsonHttpResponse({
            width: 1194,
            height: 672,
            lines: [{ text: '日本語字幕を読む', box: { left: 300, top: 520, width: 590, height: 78 }, vertical: false }],
        });
    }
    if (url.hostname === 'jpdb.io' && url.pathname === '/search') {
        return textResponse('<!doctype html><html><body><div class="results search"></div></body></html>', 'text/html; charset=utf-8');
    }
    return textResponse('', 'text/plain', 204);
}

async function liveTextResponse(request, journalEntry) {
    const response = await fetch(request.url, { method: request.method ?? 'GET', redirect: 'follow' });
    const responseText = await response.text();
    journalEntry.response = {
        status: response.status,
        bytes: Buffer.byteLength(responseText),
        format: timedTextBodyFormat(responseText),
    };
    return textResponse(responseText, response.headers.get('content-type') ?? 'text/plain', response.status);
}

function captionRequestDescriptor(url) {
    if (url.hostname !== 'www.youtube.com' || url.pathname !== '/api/timedtext') return null;
    return Object.fromEntries(['lang', 'tlang', 'kind', 'fmt'].map(key => [key, url.searchParams.get(key) ?? '']));
}

function timedTextBodyFormat(value) {
    const body = value.trimStart();
    if (!body) return 'empty';
    if (body.startsWith('{')) return 'json';
    if (body.startsWith('<')) return 'xml';
    return 'text';
}

function installNetworkJournal(page, network) {
    page.on('request', request => {
        network.requests += 1;
        const host = safeHost(request.url());
        network.byHost[host] = (network.byHost[host] ?? 0) + 1;
        network.byType[request.resourceType()] = (network.byType[request.resourceType()] ?? 0) + 1;
    });
    page.on('requestfailed', request => {
        network.failed.push({ url: redactUrl(request.url()), error: request.failure()?.errorText ?? '' });
    });
}

function networkSummary(network) {
    return {
        requests: network.requests,
        byHost: Object.fromEntries(Object.entries(network.byHost).sort((left, right) => right[1] - left[1]).slice(0, 20)),
        byType: network.byType,
        failedCount: network.failed.length,
        failed: network.failed.slice(0, 20),
        actualYoutubeRequests: Object.entries(network.byHost)
            .filter(([host]) => /(?:^|\.)youtube\.com$/u.test(host) || /googlevideo\.com$/u.test(host))
            .reduce((sum, [, count]) => sum + count, 0),
    };
}

function summarizeBridgeRequests(requests) {
    const timedText = requests
        .filter(request => request.caption)
        .map(request => ({ ...request.caption, response: request.response ?? null }));
    return {
        count: requests.length,
        byEndpoint: Object.fromEntries(requests.reduce((counts, request) => {
            counts.set(request.url, (counts.get(request.url) ?? 0) + 1);
            return counts;
        }, new Map())),
        requestBytes: requests.reduce((sum, request) => sum + request.bytes, 0),
        timedText,
    };
}

function artifactGraphSnapshot(corePath) {
    const paths = [...userscriptCompanionPaths(corePath), corePath];
    const files = paths.map(path => {
        const content = readFileSync(path, 'utf8');
        return { path, content, sha256: sha256(content), bytes: Buffer.byteLength(content) };
    });
    const content = files.map(file => file.content).join('\n;\n');
    const graphSha256 = sha256(content);
    return {
        content,
        descriptor: {
            sourceUrl: `yomu-profile://artifact-graph/${graphSha256}.js`,
            sha256: graphSha256,
            version: userscriptVersion(files.at(-1).content),
            files: files.map(file => ({ path: file.path, name: basename(file.path), sha256: file.sha256, bytes: file.bytes })),
        },
    };
}

function acceptanceSummary(results) {
    const successful = results.filter(result => !result.error);
    const chromiumCpu = successful.find(result => result.engine === 'chromium' && result.mode === 'cpu');
    const chromiumCoverage = successful.find(result => result.engine === 'chromium' && result.mode === 'coverage');
    const webkitRun = successful.find(result => result.engine === 'webkit');
    return {
        actualYoutubeDom: successful.some(hasActualYoutubeEvidence),
        runtimeHealthy: successful.some(hasHealthyRuntime),
        chromiumNativeControlsAutoHide: nestedValue(chromiumCpu, 'interaction.nativeControls.autoHideObserved'),
        chromiumYomuReleasedFocus: nestedValue(chromiumCpu, 'interaction.nativeControls.yomuDidNotRetainFocus'),
        chromiumSubtitleHover: nestedValue(chromiumCpu, 'interaction.subtitles.hover.opened'),
        chromiumOcrHover: nestedValue(chromiumCpu, 'interaction.ocr.hover.opened'),
        chromiumCpuSamples: nestedValue(chromiumCpu, 'functionEvidence.sampled.sampleCount'),
        chromiumCoverageFunctionsCalled: nestedValue(chromiumCoverage, 'functionEvidence.calls.functionsCalled'),
        webkitRuntimeHealthy: nestedValue(webkitRun, 'final.yomu.runtimeHealth') === 'ready',
        webkitNativeControlsAutoHide: nestedValue(webkitRun, 'interaction.nativeControls.autoHideObserved'),
        webkitSubtitleHover: nestedValue(webkitRun, 'interaction.subtitles.hover.opened'),
        webkitOcrHover: nestedValue(webkitRun, 'interaction.ocr.hover.opened'),
    };
}

function hasActualYoutubeEvidence(result) {
    return nestedValue(result, 'final.youtube.app') === true
        && nestedValue(result, 'final.youtube.player') === true
        && Number(nestedValue(result, 'network.actualYoutubeRequests')) > 0;
}

function hasHealthyRuntime(result) {
    return nestedValue(result, 'final.yomu.runtimeHealth') === 'ready';
}

function nestedValue(root, path) {
    const value = path.split('.').reduce((current, key) => Object(current)[key], root);
    return value === undefined ? null : value;
}

function userscriptVersion(source) {
    return source.match(/^\/\/ @version\s+([^\s]+)$/mu)?.[1] ?? '';
}

function gitRevision(root) {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function gitLastChangeRevision(root, file) {
    const pathspec = relative(root, file);
    return execFileSync('git', ['log', '-1', '--format=%H', '--', pathspec], {
        cwd: root,
        encoding: 'utf8',
    }).trim();
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function parseJsonBody(value) {
    if (!value) return {};
    try {
        return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
    } catch {
        return {};
    }
}

function requestBodyBytes(value) {
    if (!value) return 0;
    if (Buffer.isBuffer(value)) return value.byteLength;
    return Buffer.byteLength(String(value));
}

function safeHost(rawUrl) {
    try {
        return new URL(rawUrl).hostname;
    } catch {
        return 'invalid';
    }
}

function redactUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        return `${url.origin}${url.pathname}`;
    } catch {
        return rawUrl.slice(0, 160);
    }
}

function positiveNumber(value, label) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be positive; received ${value}.`);
    return parsed;
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}
