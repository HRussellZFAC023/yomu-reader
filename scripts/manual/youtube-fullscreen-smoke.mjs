#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';
import {
    addScriptTagWithCspFallback,
    addUserscriptGraphInitScripts,
    installUserscriptCssResource,
} from '../lib/smoke-test-helpers.mjs';

const WATCH_URL = process.argv[2] ?? 'https://www.youtube.com/watch?v=f2Q5tPfiSAE';
const ARTIFACT_DIR = process.env.YOMU_YOUTUBE_FULLSCREEN_ARTIFACTS ?? '/tmp/yomu-youtube-fullscreen-smoke';
const REQUEST_BRIDGE_NAME = '__yomuYoutubeFullscreenRequest';
const SMOKE_VTT_PATH = '/yomu-fullscreen-smoke.vtt';
const PERSISTENT_PROFILE_DIR = process.env.YOMU_YOUTUBE_FULLSCREEN_USER_DATA_DIR?.trim()
    || process.env.YOMU_HOME_PROFILE_USER_DATA_DIR?.trim()
    || process.env.YOMU_CAPTURE_PROFILE?.trim()
    || '';
const PERSISTENT_CHANNEL = process.env.YOMU_YOUTUBE_FULLSCREEN_CHANNEL
    || process.env.YOMU_HOME_PROFILE_CHANNEL
    || process.env.YOMU_PLAYWRIGHT_CHANNEL
    || 'chrome';
const HEADED = process.env.YOMU_YOUTUBE_FULLSCREEN_HEADED === '1';
const NATURAL_PLAYBACK = process.env.YOMU_YOUTUBE_FULLSCREEN_NATURAL_PLAYBACK === '1';
const ENGINE_NAME = process.env.YOMU_YOUTUBE_FULLSCREEN_ENGINE?.trim() || 'chromium';
const FULLSCREEN_MODE = process.env.YOMU_YOUTUBE_FULLSCREEN_MODE?.trim() || 'css';
const ENGINE = ENGINE_NAME === 'webkit' ? webkit : chromium;
if (!['chromium', 'webkit'].includes(ENGINE_NAME)) {
    throw new Error(`Unknown YOMU_YOUTUBE_FULLSCREEN_ENGINE: ${ENGINE_NAME}`);
}
if (!['css', 'real'].includes(FULLSCREEN_MODE)) {
    throw new Error(`Unknown YOMU_YOUTUBE_FULLSCREEN_MODE: ${FULLSCREEN_MODE}`);
}
if (PERSISTENT_PROFILE_DIR && ENGINE_NAME !== 'chromium') {
    throw new Error('Persistent YouTube fullscreen profiles are supported only with Chromium');
}
const DIAGNOSTIC_CUES = [
    {
        id: 'warmup',
        at: 1,
        text: '先生は東京大学で日本語を勉強します。',
    },
    {
        id: 'compound',
        at: 5,
        text: '申し訳ありませんが、仕事をしなければなりません。',
    },
    {
        id: 'next-compound',
        at: 9,
        text: '高速道路から国際空港へ向かいます。',
    },
];
const RECORDED_DIAGNOSTIC_CUES = DIAGNOSTIC_CUES.slice(0, 2);
const SMOKE_VTT = `WEBVTT

00:00:00.000 --> 00:00:04.000
${DIAGNOSTIC_CUES[0].text}

00:00:04.000 --> 00:00:08.000
${DIAGNOSTIC_CUES[1].text}

00:00:08.000 --> 00:00:30.000
${DIAGNOSTIC_CUES[2].text}
`;
const NATURAL_PLAYBACK_VTT = `WEBVTT

00:00:00.000 --> 00:00:08.000
${DIAGNOSTIC_CUES[0].text}

00:00:08.000 --> 00:00:30.000
${DIAGNOSTIC_CUES[1].text}
`;
const ACTIVE_SMOKE_VTT = NATURAL_PLAYBACK ? NATURAL_PLAYBACK_VTT : SMOKE_VTT;

const {
    root: ROOT,
    scriptPath: DEFAULT_SCRIPT_PATH,
    cssPath: DEFAULT_CSS_PATH,
} = createSmokePaths(import.meta.dirname);
const SCRIPT_PATH = resolve(process.env.YOMU_YOUTUBE_FULLSCREEN_USERSCRIPT ?? DEFAULT_SCRIPT_PATH);
const CSS_PATH = resolve(process.env.YOMU_YOUTUBE_FULLSCREEN_CSS ?? DEFAULT_CSS_PATH);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);
mkdirSync(ARTIFACT_DIR, { recursive: true });

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: false,
    localDictionariesEnabled: false,
    showFloatingButton: false,
    youtubeImmersionEnabled: true,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptVisible: false,
    subtitleControlsMode: 'always',
    subtitleBottomOffset: 2,
    showFurigana: true,
    furiganaMode: 'all',
    // Crossed-channel regression: page words are not pitch-underlined while
    // subtitle words are. Component paint must follow the subtitle setting.
    wordUnderlineColorSource: 'off',
    subtitleTextColorSource: 'off',
    subtitleUnderlineColorSource: 'pitch',
    subtitleHighlightColorSource: 'off',
};

const requestedViewport = process.env.YOMU_YOUTUBE_FULLSCREEN_VIEWPORT?.trim();
const viewports = [
    {
        name: 'desktop',
        context: { viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    },
    {
        name: 'ipad',
        context: { ...devices['iPad Pro 11'], viewport: { width: 1024, height: 768 } },
    },
    {
        name: 'phone',
        context: { ...devices['iPhone 13'] },
    },
].filter(viewport => !requestedViewport || viewport.name === requestedViewport);
if (!viewports.length) throw new Error(`Unknown YOMU_YOUTUBE_FULLSCREEN_VIEWPORT: ${requestedViewport}`);

const browser = PERSISTENT_PROFILE_DIR
    ? undefined
    : await launchSmokeBrowser(ENGINE, ENGINE_NAME, {
        headless: true,
        ...(ENGINE_NAME === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {}),
    });
const results = [];

try {
    for (const viewport of viewports) {
        results.push(await runViewport(viewport));
    }
} finally {
    await browser?.close();
}

for (const result of results) {
    assert(result.normal.hasRoot, `${result.name}: missing Yomu subtitle root in normal mode`, result.normal);
    assert(result.normal.hasRail, `${result.name}: missing Yomu control rail in normal mode`, result.normal);
    assert(result.normal.lineText, `${result.name}: missing Yomu subtitle text in normal mode`, result.normal);
    assertYoutubeControlsNotBlocked(result, 'normal');
    assert(result.fullscreen.hasRoot, `${result.name}: missing Yomu subtitle root in fullscreen mode`, result.fullscreen);
    assert(result.fullscreen.hostedInPlayer
        || result.fullscreen.hostedInFullscreenElement
        || result.fullscreen.mobileBodyOverlayVisible,
    `${result.name}: Yomu root was not visible in a fullscreen host`, result.fullscreen);
    assert(result.fullscreen.hasRail, `${result.name}: missing Yomu control rail in fullscreen mode`, result.fullscreen);
    assert(result.fullscreen.lineText, `${result.name}: missing Yomu subtitle text in fullscreen mode`, result.fullscreen);
    assertYoutubeControlsNotBlocked(result, 'fullscreen');
    assert(result.returned.hasRoot, `${result.name}: missing Yomu subtitle root after leaving fullscreen`, result.returned);
    assert(result.returned.hasRail, `${result.name}: missing Yomu control rail after leaving fullscreen`, result.returned);
    assert(result.returned.lineText, `${result.name}: missing Yomu subtitle text after leaving fullscreen`, result.returned);
    assertYoutubeControlsNotBlocked(result, 'returned');
    if (FULLSCREEN_MODE === 'real') {
        assert(result.fullscreen.fullscreenElement, `${result.name}: real fullscreen never entered the browser top layer`, result.fullscreen);
        assert(result.fullscreen.hostedInFullscreenElement, `${result.name}: Yomu root was outside the browser fullscreen element`, result.fullscreen);
        assert(!result.returned.fullscreenElement, `${result.name}: browser fullscreen remained active after return`, result.returned);
    }
    assertMastheadHiddenInFullscreen(result);
    assertAnnotationStability(result);
}

function assertMastheadHiddenInFullscreen(result) {
    if (FULLSCREEN_MODE === 'real') {
        assert(!result.fullscreen.fullscreenElementContainsMasthead,
            `${result.name}: page masthead entered the browser fullscreen top layer`,
            result.fullscreen);
        return;
    }
    const normalMasthead = result.normal.masthead ?? {};
    const fullscreenMasthead = result.fullscreen.masthead ?? {};
    if (result.name !== 'desktop' && (!normalMasthead.found || normalMasthead.hidden)) return;
    assert(fullscreenMasthead.found, `${result.name}: no YouTube masthead/topbar element found to check`, { normal: normalMasthead, fullscreen: fullscreenMasthead });
    // Normal browsing must be untouched — the masthead stays visible.
    assert(!normalMasthead.hidden, `${result.name}: masthead was hidden in normal (non-fullscreen) mode`, normalMasthead);
    // Regression 2: Yomu inline CSS-fullscreen hides YouTube's native top chrome.
    assert(fullscreenMasthead.hidden, `${result.name}: YouTube masthead/topbar was still visible in Yomu inline fullscreen`, fullscreenMasthead);
    assert(!result.returned.masthead?.hidden, `${result.name}: masthead stayed hidden after leaving Yomu inline fullscreen`, result.returned.masthead);
}

console.log(JSON.stringify({
    url: WATCH_URL,
    engine: ENGINE_NAME,
    fullscreenMode: FULLSCREEN_MODE,
    naturalPlayback: NATURAL_PLAYBACK,
    persistentProfileDir: PERSISTENT_PROFILE_DIR || null,
    settings: {
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
        subtitleOverlayVisible: settings.subtitleOverlayVisible,
        subtitleControlsMode: settings.subtitleControlsMode,
        subtitleTranscriptVisible: settings.subtitleTranscriptVisible,
        subtitleBottomOffset: settings.subtitleBottomOffset,
    },
    artifacts: ARTIFACT_DIR,
    results,
}, null, 2));

async function runViewport(viewport) {
    const { context, close } = await openViewportContext(viewport);
    await context.exposeFunction(REQUEST_BRIDGE_NAME, bridgeRequest);
    await context.addCookies([
        { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
        { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb/i.test(message.text())) errors.push(message.text());
    });
    await page.route(`**${SMOKE_VTT_PATH}`, route => route.fulfill({
        status: 200,
        body: ACTIVE_SMOKE_VTT,
        contentType: 'text/vtt; charset=utf-8',
        headers: { 'access-control-allow-origin': '*' },
    }));

    try {
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: settings,
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: REQUEST_BRIDGE_NAME,
        });
        if (ENGINE_NAME === 'webkit') await addUserscriptGraphInitScripts(page, SCRIPT_PATH);
        await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await dismissConsent(page);
        await page.waitForSelector('video, #movie_player, .html5-video-player', { timeout: 45000 });
        await installUserscriptCssResource(page, CSS_PATH);
        if (NATURAL_PLAYBACK) {
            // Start before the diagnostic track is selected (and, on
            // Chromium, before the userscript graph boots) so the first
            // visible subtitle DOM is part of the proof. Empty pre-commit
            // frames are allowed; a visible plain/loading row is not.
            await installAnnotationStabilityRecorder(page, 'cold-start');
            await markAnnotationPhase(page, 'cold-start');
        }
        // Load the exact dependency graph declared by the built artifact. This
        // deliberately follows hashed @require entries in docs/public instead
        // of guessing stale split-bundle names under dist/greasyfork.
        if (ENGINE_NAME === 'webkit') {
            await installDiagnosticTrack(page);
            await installDiagnosticCaption(page, DIAGNOSTIC_CUES[0].text);
            await seekDiagnosticCue(page, DIAGNOSTIC_CUES[0], {
                installPauseGuard: !NATURAL_PLAYBACK,
            });
            await page.waitForSelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]', {
                state: 'attached',
                timeout: 10000,
            });
            await selectDiagnosticTrack(page);
        } else {
            await installCurrentUserscriptGraph(page, DIAGNOSTIC_CUES[0], {
                installPauseGuard: !NATURAL_PLAYBACK,
            });
        }
        // Mobile/tablet YouTube may replace its app shell while the userscript
        // graph boots, so install the deterministic masthead only after that
        // navigation-sensitive phase.
        await installDiagnosticMasthead(page);
        if (NATURAL_PLAYBACK) {
            await waitForYomuSubtitle(page, errors, DIAGNOSTIC_CUES[0].text);
            await waitForAnnotationReady(page, DIAGNOSTIC_CUES[0].text);
            await markAnnotationPhase(page, 'normal-cue-transition');
            await startNaturalDiagnosticPlayback(page);
            await waitForYomuSubtitle(page, errors, DIAGNOSTIC_CUES[1].text);
            await waitForAnnotationReady(page, DIAGNOSTIC_CUES[1].text);
            await markAnnotationPhase(page, 'normal-ready');
        } else {
            await waitForYomuSubtitle(page, errors, DIAGNOSTIC_CUES[0].text);
            await waitForAnnotationReady(page, DIAGNOSTIC_CUES[0].text);
            await installAnnotationStabilityRecorder(page);
            // The first cue is sampled at t=1 and the compound begins at t=4,
            // so preserve the same three-second preparation window real
            // playback provides before forcing the deterministic boundary.
            await page.waitForTimeout(3200);
            await markAnnotationPhase(page, 'normal-cue-transition');
            await seekDiagnosticCue(page, DIAGNOSTIC_CUES[1]);
            await waitForYomuSubtitle(page, errors, DIAGNOSTIC_CUES[1].text);
            await waitForAnnotationReady(page, DIAGNOSTIC_CUES[1].text);
            await markAnnotationPhase(page, 'normal-ready');
        }

        await forceYoutubeControlsVisible(page);
        const normalPath = join(ARTIFACT_DIR, `${viewport.name}-normal.png`);
        await page.screenshot({ path: normalPath, fullPage: false });
        const normal = await collectEvidence(page, 'normal');

        await markAnnotationPhase(page, 'enter-fullscreen');
        if (FULLSCREEN_MODE === 'real') await enterRealVideoFullscreen(page);
        else await enterYoutubeCssFullscreen(page);
        await waitForYomuFullscreenHost(page);
        await waitForAnnotationReady(page, DIAGNOSTIC_CUES[1].text);
        await markAnnotationPhase(page, 'fullscreen');
        await forceYoutubeControlsVisible(page);
        const fullscreenPath = join(ARTIFACT_DIR, `${viewport.name}-fullscreen.png`);
        await page.screenshot({ path: fullscreenPath, fullPage: false });
        const fullscreen = await collectEvidence(page, 'fullscreen');

        await markAnnotationPhase(page, 'exit-fullscreen');
        if (FULLSCREEN_MODE === 'real') await exitRealVideoFullscreen(page);
        else await exitYoutubeCssFullscreen(page);
        await waitForYomuNormalHost(page);
        await waitForAnnotationReady(page, DIAGNOSTIC_CUES[1].text);
        await markAnnotationPhase(page, 'returned');
        await forceYoutubeControlsVisible(page);
        // Stay beyond the transient video-loss grace. A stale held cue would
        // clear here; a real same-source replacement remains annotated.
        await page.waitForTimeout(2200);
        await waitForAnnotationReady(page, DIAGNOSTIC_CUES[1].text);
        const returnedPath = join(ARTIFACT_DIR, `${viewport.name}-returned.png`);
        await page.screenshot({ path: returnedPath, fullPage: false });
        const returned = await collectEvidence(page, 'returned');

        const annotationTimeline = await finishAnnotationStabilityRecorder(page);
        if (NATURAL_PLAYBACK) await pauseDiagnosticPlayback(page);

        return {
            name: viewport.name,
            viewport: await page.viewportSize(),
            normalScreenshot: normalPath,
            fullscreenScreenshot: fullscreenPath,
            returnedScreenshot: returnedPath,
            normal,
            fullscreen,
            returned,
            annotationTimeline,
            errors: errors.slice(0, 5),
        };
    } finally {
        await close();
    }
}

async function openViewportContext(viewport) {
    const options = {
        ...viewport.context,
        bypassCSP: true,
        locale: 'ja-JP',
    };
    if (!PERSISTENT_PROFILE_DIR) {
        const context = await browser.newContext(options);
        return { context, close: () => context.close().catch(() => undefined) };
    }
    const context = await launchPersistentContextWithFallback(resolve(PERSISTENT_PROFILE_DIR), options);
    for (const page of context.pages()) await page.close().catch(() => undefined);
    return { context, close: () => context.close().catch(() => undefined) };
}

async function launchPersistentContextWithFallback(profileDir, options) {
    try {
        return await chromium.launchPersistentContext(profileDir, {
            ...options,
            channel: PERSISTENT_CHANNEL,
            headless: !HEADED,
        });
    } catch (error) {
        if (PERSISTENT_CHANNEL === 'chrome' && isMissingBrowserExecutable(error)) {
            return await chromium.launchPersistentContext(profileDir, { ...options, headless: !HEADED });
        }
        throw error;
    }
}

function isMissingBrowserExecutable(error) {
    const message = String(error?.message ?? '');
    return message.includes("Executable doesn't exist") || /playwright install/i.test(message);
}

async function installCurrentUserscriptGraph(page, initialCue, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(750);
        try {
            await installDiagnosticTrack(page);
            await installDiagnosticCaption(page, initialCue.text);
            await seekDiagnosticCue(page, initialCue, options);
            await addScriptTagWithCspFallback(page, SCRIPT_PATH);
            await page.waitForSelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]', {
                state: 'attached',
                timeout: 10000,
            });
            return;
        } catch (error) {
            lastError = error;
            if (attempt < 2) await page.waitForTimeout(750);
        }
    }
    throw new Error('Built userscript did not boot after loading its exact @require graph', { cause: lastError });
}

async function dismissConsent(page) {
    for (const selector of ['button:has-text("すべてに同意")', 'button:has-text("Accept all")', 'form[action*="consent"] button']) {
        const button = page.locator(selector).first();
        if (await button.count() && await button.isVisible().catch(() => false)) {
            await button.click().catch(() => undefined);
            await page.waitForTimeout(1500);
        }
    }
}

async function forceYoutubeControlsVisible(page) {
    await page.evaluate(() => {
        const players = document.querySelectorAll('#movie_player, .html5-video-player, ytm-player');
        for (const player of players) {
            player.classList.remove('ytp-autohide', 'ytp-hide-controls', 'ytp-player-minimized');
            player.classList.add('ytp-show-cards-title');
        }
        for (const chrome of document.querySelectorAll('.ytp-chrome-bottom, .ytp-chrome-controls, #player-control-overlay')) {
            if (!(chrome instanceof HTMLElement)) continue;
            chrome.style.setProperty('display', 'block', 'important');
            chrome.style.setProperty('visibility', 'visible', 'important');
            chrome.style.setProperty('opacity', '1', 'important');
            chrome.style.setProperty('pointer-events', 'auto', 'important');
        }
    });
    await page.mouse.move(24, 24).catch(() => undefined);
    await page.waitForTimeout(250);
}

async function installDiagnosticMasthead(page) {
    // Real youtube.com renders ytd-masthead#masthead inside #masthead-container;
    // when we cannot reach the live page (offline sandbox), inject the same
    // structure so the masthead-hide assertion still exercises Yomu's stylesheet.
    await evaluateWithNavigationRetry(page, () => {
        if (document.querySelector('ytd-masthead, #masthead, #masthead-container')) return;
        const container = document.createElement('div');
        container.id = 'masthead-container';
        const masthead = document.createElement('ytd-masthead');
        masthead.id = 'masthead';
        masthead.dataset.yomuFullscreenSmokeMasthead = 'true';
        const searchbox = document.createElement('div');
        searchbox.id = 'searchbox';
        searchbox.textContent = '検索';
        masthead.append(searchbox);
        for (const [property, value] of [
            ['display', 'block'],
            ['position', 'fixed'],
            ['top', '0'],
            ['left', '0'],
            ['right', '0'],
            ['width', '100vw'],
            ['height', '56px'],
            ['min-height', '56px'],
            ['background', '#0f0f0f'],
            ['z-index', '2200'],
        ]) masthead.style.setProperty(property, value, 'important');
        container.append(masthead);
        (document.body ?? document.documentElement).prepend(container);
    });
}

async function installDiagnosticCaption(page, text) {
    await evaluateWithNavigationRetry(page, captionText => {
        const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
            ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
            ?? document.querySelector('video');
        const player = video?.closest('#movie_player, .html5-video-player, ytm-player') ?? video?.parentElement;
        if (!player) return;
        const existing = player.querySelector('[data-yomu-fullscreen-smoke-caption] .ytp-caption-segment');
        if (existing) {
            existing.textContent = captionText;
            return;
        }
        const container = document.createElement('div');
        container.className = 'ytp-caption-window-container';
        container.dataset.yomuFullscreenSmokeCaption = 'true';
        const segment = document.createElement('span');
        segment.className = 'ytp-caption-segment';
        segment.textContent = captionText;
        container.append(segment);
        Object.assign(container.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '72px',
            textAlign: 'center',
            zIndex: '20',
        });
        player.append(container);
    }, text);
}

async function installDiagnosticTrack(page) {
    await evaluateWithNavigationRetry(page, path => {
        const existing = document.querySelector('track[data-yomu-fullscreen-smoke-track]');
        const video = existing?.closest('video')
            ?? document.querySelector('#movie_player video.html5-main-video')
            ?? document.querySelector('ytm-player video')
            ?? [...document.querySelectorAll('video')].find(candidate => candidate.clientWidth > 0 && candidate.clientHeight > 0)
            ?? document.querySelector('video');
        if (!(video instanceof HTMLVideoElement)) return;
        video.dataset.yomuFullscreenSmokeVideo = 'true';
        if (existing) return;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.srclang = 'ja';
        track.label = 'Japanese smoke';
        track.src = new URL(path, location.origin).href;
        track.default = true;
        track.dataset.yomuFullscreenSmokeTrack = 'true';
        video.append(track);
    }, SMOKE_VTT_PATH);
}

async function selectDiagnosticTrack(page) {
    // WebKit has to install the userscript graph as document-start init scripts,
    // so the deterministic <track> arrives after Yomu's first discovery pass.
    // Exercise the real navigation + track-picker path instead of silently
    // falling back to the current-only YouTube caption DOM, which cannot prewarm
    // the next cue by definition.
    await evaluateWithNavigationRetry(page, () => {
        window.dispatchEvent(new Event('yt-navigate-finish'));
        window.dispatchEvent(new Event('yomu-open-subtitle-tracks'));
    });

    const row = page.locator('.jpdb-subtitle-track-row').filter({ hasText: 'Japanese smoke' }).first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    const primaryButton = row.locator('[data-action="primary-track"]');
    if (await primaryButton.getAttribute('aria-pressed') !== 'true') await primaryButton.click();
    await page.waitForFunction(label => {
        const trackRow = [...document.querySelectorAll('.jpdb-subtitle-track-row')]
            .find(candidate => candidate.textContent?.includes(label));
        const button = trackRow?.querySelector('[data-action="primary-track"]');
        const status = trackRow?.textContent ?? '';
        return button?.getAttribute('aria-pressed') === 'true'
            && !/\b(?:Loading|Waiting|Failed)\b/iu.test(status);
    }, 'Japanese smoke', { timeout: 30000 });

    const closeButton = page.locator('.jpdb-subtitle-list [data-action="close-panel"]').first();
    if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
        await page.locator('.jpdb-subtitle-list').waitFor({ state: 'hidden', timeout: 5000 });
    }
}

async function seekDiagnosticCue(page, cue, options = {}) {
    const installPauseGuard = options.installPauseGuard !== false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await evaluateWithNavigationRetry(page, ({ at, text, shouldInstallPauseGuard }) => {
            const caption = document.querySelector('[data-yomu-fullscreen-smoke-caption] .ytp-caption-segment');
            if (caption) caption.textContent = text;
            const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
                ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
                ?? document.querySelector('video');
            if (!(video instanceof HTMLVideoElement)) return;
            if (shouldInstallPauseGuard && !video.dataset.yomuFullscreenSmokePauseGuard) {
                video.dataset.yomuFullscreenSmokePauseGuard = 'true';
                video.addEventListener('play', () => video.pause(), true);
            }
            video.pause();
            const trackElement = video.querySelector('track[data-yomu-fullscreen-smoke-track]');
            if (trackElement?.track) trackElement.track.mode = 'hidden';
            const player = video.closest('#movie_player, .html5-video-player, ytm-player')
                ?? document.querySelector('#movie_player, .html5-video-player, ytm-player');
            if (typeof player?.seekTo === 'function') {
                try {
                    player.seekTo(at, true);
                } catch {
                    // Fall through to the media-element seek below.
                }
            }
            try {
                video.currentTime = at;
            } catch {
                // The next retry handles metadata/player races.
            }
            video.dispatchEvent(new Event('seeking'));
            video.dispatchEvent(new Event('timeupdate'));
            video.dispatchEvent(new Event('seeked'));
            video.pause();
        }, { ...cue, shouldInstallPauseGuard: installPauseGuard });
        const rendered = await page.waitForFunction(expected => {
            const primary = document.querySelector('.jpdb-subtitle-primary')
                ?? document.querySelector('.jpdb-subtitle-lines');
            const clone = primary?.cloneNode(true);
            clone?.querySelectorAll?.('rt, rp, .jpdb-reader-detached-furi').forEach(node => node.remove());
            const compact = value => value?.replace(/\s+/gu, '') ?? '';
            return compact(clone?.textContent).includes(compact(expected));
        }, cue.text, { timeout: 1500 }).then(() => true).catch(() => false);
        if (rendered) return;
    }
    await page.waitForTimeout(50);
}

async function startNaturalDiagnosticPlayback(page) {
    await page.evaluate(async () => {
        const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
            ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
            ?? document.querySelector('video');
        if (!(video instanceof HTMLVideoElement)) throw new Error('Natural playback video is missing');
        video.muted = true;
        video.playbackRate = 1;
        const player = video.closest('#movie_player, .html5-video-player, ytm-player')
            ?? document.querySelector('#movie_player, .html5-video-player, ytm-player');
        if (typeof player?.playVideo === 'function') player.playVideo();
        await video.play();
    });
}

async function pauseDiagnosticPlayback(page) {
    await page.evaluate(() => {
        const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
            ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
            ?? document.querySelector('video');
        if (!(video instanceof HTMLVideoElement)) return;
        const player = video.closest('#movie_player, .html5-video-player, ytm-player')
            ?? document.querySelector('#movie_player, .html5-video-player, ytm-player');
        if (typeof player?.pauseVideo === 'function') player.pauseVideo();
        video.pause();
    });
}

async function evaluateWithNavigationRetry(page, pageFunction, arg) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await page.evaluate(pageFunction, arg);
        } catch (error) {
            lastError = error;
            if (!isNavigationRace(error) || attempt === 2) break;
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => undefined);
            await page.waitForTimeout(500).catch(() => undefined);
        }
    }
    throw lastError;
}

function isNavigationRace(error) {
    return /Execution context was destroyed|Cannot find context with specified id|navigation/i.test(String(error?.message ?? error));
}

async function waitForYomuSubtitle(page, errors = [], expectedText = '') {
    try {
        await page.waitForFunction(expected => {
            const root = document.querySelector('.jpdb-subtitle-player');
            const primary = document.querySelector('.jpdb-subtitle-primary')
                ?? document.querySelector('.jpdb-subtitle-lines');
            const clone = primary?.cloneNode(true);
            clone?.querySelectorAll?.('rt, rp, .jpdb-reader-detached-furi').forEach(node => node.remove());
            const lineText = clone?.textContent?.trim();
            const compact = value => value?.replace(/\s+/gu, '') ?? '';
            return Boolean(root && lineText && (!expected || compact(lineText).includes(compact(expected))));
        }, expectedText, { timeout: 30000 });
    } catch (error) {
        const debug = await page.evaluate(({ settingsKey, capturedErrors }) => ({
            href: location.href,
            readyState: document.readyState,
            hasBridge: typeof window.GM_getValue === 'function',
            settings: typeof window.GM_getValue === 'function' ? window.GM_getValue(settingsKey, null) : null,
            root: document.querySelector('.jpdb-subtitle-player')?.outerHTML?.slice(0, 500) ?? null,
            rootClasses: document.querySelector('.jpdb-subtitle-player')?.className?.toString() ?? '',
            lineText: document.querySelector('.jpdb-subtitle-lines')?.textContent?.trim() ?? '',
            appInitialized: window.__yomuReaderAppInitialized ?? null,
            runtimeKind: window.__yomuRuntimeKind ?? null,
            hasRealApp: Boolean(window.__yomuRealApp),
            marker: document.querySelector('#jpdb-reader-runtime-owner')?.outerHTML ?? null,
            companionKeys: Object.keys(window.__yomuCompanions ?? {}),
            videoCount: document.querySelectorAll('video').length,
            trackCount: document.querySelectorAll('track').length,
            playerFound: Boolean(document.querySelector('#movie_player, .html5-video-player, ytm-player')),
            yomuGlobals: Object.keys(window).filter(key => /^Yomu|^__yomu|yomu/i.test(key)).slice(0, 40),
            errors: capturedErrors,
        }), { settingsKey: YOMU_SETTINGS_KEY, capturedErrors: errors });
        throw new Error(`Timed out waiting for Yomu subtitle text\n${JSON.stringify(debug, null, 2)}`, { cause: error });
    }
}

async function waitForAnnotationReady(page, expectedText) {
    try {
        await page.waitForFunction(expected => {
            const primary = document.querySelector('.jpdb-subtitle-primary');
            if (!(primary instanceof HTMLElement)) return false;
            const compact = value => value?.replace(/\s+/gu, '') ?? '';
            const clone = primary.cloneNode(true);
            clone.querySelectorAll('rt, rp, .jpdb-reader-detached-furi').forEach(node => node.remove());
            if (!compact(clone.textContent).includes(compact(expected))) return false;
            const words = [...primary.querySelectorAll('.jpdb-reader-word')];
            const pitchKnown = words.filter(word => (
                word.classList.contains('jpdb-pitch-heiban')
                || word.classList.contains('jpdb-pitch-atamadaka')
                || word.classList.contains('jpdb-pitch-nakadaka')
                || word.classList.contains('jpdb-pitch-odaka')
                || word.dataset.pitchComponents === 'true'
            ));
            return !primary.querySelector('.jpdb-subtitle-primary-loading')
                && words.length > 0
                && primary.querySelectorAll('rt.jpdb-reader-furi, .jpdb-reader-furi').length > 0
                && pitchKnown.length > 0;
        }, expectedText, { timeout: 30000 });
    } catch (error) {
        const evidence = await collectEvidence(page, 'annotation-timeout');
        throw new Error(`Timed out waiting for fully annotated subtitle: ${expectedText}\n${JSON.stringify(evidence, null, 2)}`, { cause: error });
    }
}

async function installAnnotationStabilityRecorder(page, initialPhase = 'warm-ready') {
    const options = { initialPhase };
    // YouTube can replace its document while the exact graph boots. Register
    // the recorder as an init script as well as in the current document so the
    // first subtitle paint remains observed across that navigation.
    await page.addInitScript(annotationStabilityRecorderInstaller, options);
    await page.evaluate(annotationStabilityRecorderInstaller, options);
}

function annotationStabilityRecorderInstaller({ initialPhase }) {
    const existing = window.__yomuFullscreenAnnotationRecorder;
    if (existing?.raf) cancelAnimationFrame(existing.raf);
    const recorder = {
            active: true,
            phase: initialPhase,
            frames: [],
            raf: 0,
            nextRootId: 1,
            rootIds: new WeakMap(),
        };

        const surfaceText = element => {
            if (!(element instanceof Element)) return '';
            const clone = element.cloneNode(true);
            clone.querySelectorAll('rt, rp, .jpdb-reader-detached-furi').forEach(node => node.remove());
            return clone.textContent?.replace(/\s+/gu, '') ?? '';
        };
        const pitchClass = word => (
            ['heiban', 'atamadaka', 'nakadaka', 'odaka']
                .find(kind => word.classList.contains(`jpdb-pitch-${kind}`)) ?? ''
        );
        const paintedElement = element => {
            if (!(element instanceof HTMLElement) || !element.isConnected || element.hidden) return false;
            const style = getComputedStyle(element);
            if (style.display === 'none'
                || style.visibility === 'hidden'
                || style.visibility === 'collapse'
                || Number.parseFloat(style.opacity || '1') <= 0) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0
                && rect.height > 0
                && rect.right > 0
                && rect.bottom > 0
                && rect.left < window.innerWidth
                && rect.top < window.innerHeight;
        };
        const snapshot = timestamp => {
            const root = document.querySelector('.jpdb-subtitle-player');
            const primary = root?.querySelector('.jpdb-subtitle-primary');
            const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
                ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
                ?? document.querySelector('video');
            const rootRect = root?.getBoundingClientRect();
            const primaryRect = primary?.getBoundingClientRect();
            let rootId = null;
            if (root) {
                rootId = recorder.rootIds.get(root);
                if (!rootId) {
                    rootId = recorder.nextRootId;
                    recorder.nextRootId += 1;
                    recorder.rootIds.set(root, rootId);
                }
            }
            const words = primary
                ? [...primary.querySelectorAll('.jpdb-reader-word')].map(word => {
                    const componentGradient = getComputedStyle(word)
                        .getPropertyValue('--jpdb-reader-inline-pitch-gradient')
                        .trim();
                    return {
                        surface: surfaceText(word),
                        furi: [...word.querySelectorAll('rt.jpdb-reader-furi, .jpdb-reader-furi')]
                            .map(node => node.textContent?.trim() ?? '')
                            .filter(Boolean),
                        pitch: pitchClass(word),
                        pitchComponents: word.dataset.pitchComponents === 'true',
                        componentGradient,
                        componentPaint: getComputedStyle(word, '::after').backgroundImage,
                    };
                })
                : [];
            const furiCount = words.reduce((sum, word) => sum + word.furi.length, 0);
            const pitchKnownCount = words.filter(word => (
                word.pitch || (word.pitchComponents && word.componentPaint && word.componentPaint !== 'none')
            )).length;
            const unpaintedComponentCount = words.filter(word => (
                word.pitchComponents && (!word.componentPaint || word.componentPaint === 'none')
            )).length;
            return {
                frame: recorder.frames.length,
                timestamp: Math.round(timestamp),
                phase: recorder.phase,
                rootId,
                rootPresent: Boolean(root),
                primaryPresent: Boolean(primary),
                rootHidden: Boolean(root?.hidden),
                rootOutOfView: Boolean(root?.classList.contains('jpdb-subtitle-video-out-of-view')),
                rootPainted: paintedElement(root),
                primaryPainted: paintedElement(primary),
                rootRect: rootRect ? {
                    left: Math.round(rootRect.left),
                    top: Math.round(rootRect.top),
                    width: Math.round(rootRect.width),
                    height: Math.round(rootRect.height),
                } : null,
                primaryRect: primaryRect ? {
                    left: Math.round(primaryRect.left),
                    top: Math.round(primaryRect.top),
                    width: Math.round(primaryRect.width),
                    height: Math.round(primaryRect.height),
                } : null,
                rootHost: root?.parentElement
                    ? `${root.parentElement.tagName.toLowerCase()}#${root.parentElement.id}.${[...root.parentElement.classList].join('.')}`
                    : '',
                videoPaused: video instanceof HTMLVideoElement ? video.paused : null,
                videoCurrentTime: video instanceof HTMLVideoElement ? video.currentTime : null,
                surface: surfaceText(primary),
                loadingCount: primary?.querySelectorAll('.jpdb-subtitle-primary-loading').length ?? 0,
                wordCount: words.length,
                furiCount,
                pitchKnownCount,
                componentCount: words.filter(word => word.pitchComponents).length,
                unpaintedComponentCount,
                signature: JSON.stringify(words.map(word => [
                    word.surface,
                    word.furi,
                    word.pitch,
                    word.pitchComponents,
                    word.componentGradient,
                    word.componentPaint,
                ])),
                words,
            };
        };
        const sample = timestamp => {
            if (!recorder.active) return;
            recorder.frames.push(snapshot(timestamp));
            recorder.raf = requestAnimationFrame(sample);
        };
        recorder.raf = requestAnimationFrame(sample);
        window.__yomuFullscreenAnnotationRecorder = recorder;
}

async function markAnnotationPhase(page, phase) {
    await page.evaluate(nextPhase => {
        const recorder = window.__yomuFullscreenAnnotationRecorder;
        if (recorder) recorder.phase = nextPhase;
    }, phase);
}

async function finishAnnotationStabilityRecorder(page) {
    return await page.evaluate(({ cues }) => {
        const recorder = window.__yomuFullscreenAnnotationRecorder;
        if (!recorder) return { frameCount: 0, error: 'recorder-missing' };
        recorder.active = false;
        if (recorder.raf) cancelAnimationFrame(recorder.raf);
        const frames = recorder.frames;
        // Before the first cue is committed, no Yomu row is expected. Once any
        // cold-start subtitle text is visible, however, it is held to the same
        // fully annotated/painted contract as every playback transition.
        const stableFrames = frames.filter(frame => frame.phase !== 'cold-start' || frame.surface);
        const compact = value => value?.replace(/\s+/gu, '') ?? '';
        const expected = new Set(cues.map(cue => compact(cue.text)));
        const annotationDowngrades = stableFrames.filter(frame => (
            !frame.rootPresent
            || !frame.primaryPresent
            || frame.rootHidden
            || frame.rootOutOfView
            || !frame.rootPainted
            || !frame.primaryPainted
            || !frame.surface
            || frame.loadingCount > 0
            || frame.wordCount === 0
            || frame.furiCount === 0
            || frame.pitchKnownCount === 0
            || frame.unpaintedComponentCount > 0
        ));
        const unexpectedTextFrames = stableFrames.filter(frame => frame.surface && !expected.has(compact(frame.surface)));
        const rootIds = [...new Set(frames.map(frame => frame.rootId).filter(Boolean))];
        const phaseCounts = Object.fromEntries([...new Set(frames.map(frame => frame.phase))]
            .map(phase => [phase, frames.filter(frame => frame.phase === phase).length]));
        const playbackByPhase = Object.fromEntries([...new Set(frames.map(frame => frame.phase))]
            .map(phase => {
                const phaseFrames = frames.filter(frame => frame.phase === phase);
                const times = phaseFrames
                    .map(frame => frame.videoCurrentTime)
                    .filter(value => Number.isFinite(value));
                return [phase, {
                    frameCount: phaseFrames.length,
                    pausedFrames: phaseFrames.filter(frame => frame.videoPaused === true).length,
                    firstTime: times[0] ?? null,
                    lastTime: times.at(-1) ?? null,
                }];
            }));
        const cueSummaries = cues.map(cue => {
            const cueFrames = stableFrames.filter(frame => compact(frame.surface) === compact(cue.text));
            return {
                id: cue.id,
                text: cue.text,
                frameCount: cueFrames.length,
                loadingFrames: cueFrames.filter(frame => frame.loadingCount > 0).length,
                plainFrames: cueFrames.filter(frame => frame.wordCount === 0).length,
                hiddenFrames: cueFrames.filter(frame => !frame.rootPainted || !frame.primaryPainted || frame.rootHidden || frame.rootOutOfView).length,
                minWordCount: cueFrames.length ? Math.min(...cueFrames.map(frame => frame.wordCount)) : 0,
                minFuriCount: cueFrames.length ? Math.min(...cueFrames.map(frame => frame.furiCount)) : 0,
                minPitchKnownCount: cueFrames.length ? Math.min(...cueFrames.map(frame => frame.pitchKnownCount)) : 0,
                maxComponentCount: cueFrames.length ? Math.max(...cueFrames.map(frame => frame.componentCount)) : 0,
                unpaintedComponentFrames: cueFrames.filter(frame => frame.unpaintedComponentCount > 0).length,
                signatures: [...new Set(cueFrames.map(frame => frame.signature))],
                lastWords: cueFrames.at(-1)?.words ?? [],
            };
        });
        const changes = frames.filter((frame, index) => {
            const previous = frames[index - 1];
            return !previous
                || frame.phase !== previous.phase
                || frame.rootId !== previous.rootId
                || frame.rootHidden !== previous.rootHidden
                || frame.rootOutOfView !== previous.rootOutOfView
                || frame.rootPainted !== previous.rootPainted
                || frame.primaryPainted !== previous.primaryPainted
                || frame.rootHost !== previous.rootHost
                || frame.surface !== previous.surface
                || frame.loadingCount !== previous.loadingCount
                || frame.unpaintedComponentCount !== previous.unpaintedComponentCount
                || frame.signature !== previous.signature;
        }).slice(0, 80);
        delete window.__yomuFullscreenAnnotationRecorder;
        return {
            frameCount: frames.length,
            phaseCounts,
            playbackByPhase,
            rootIds,
            annotationDowngradeCount: annotationDowngrades.length,
            annotationDowngrades: annotationDowngrades.slice(0, 20),
            unexpectedTextFrameCount: unexpectedTextFrames.length,
            unexpectedTextFrames: unexpectedTextFrames.slice(0, 10),
            coldStart: {
                frameCount: frames.filter(frame => frame.phase === 'cold-start').length,
                visibleFrameCount: frames.filter(frame => frame.phase === 'cold-start' && frame.surface).length,
                loadingFrames: frames.filter(frame => frame.phase === 'cold-start' && frame.surface && frame.loadingCount > 0).length,
                plainFrames: frames.filter(frame => frame.phase === 'cold-start' && frame.surface && frame.wordCount === 0).length,
                hiddenFrames: frames.filter(frame => frame.phase === 'cold-start'
                    && frame.surface
                    && (!frame.rootPainted || !frame.primaryPainted || frame.rootHidden || frame.rootOutOfView)).length,
            },
            cueSummaries,
            changes,
        };
    }, {
        cues: RECORDED_DIAGNOSTIC_CUES,
    });
}

async function enterRealVideoFullscreen(page) {
    await page.evaluate(() => {
        const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
            ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
            ?? document.querySelector('video');
        const player = video?.closest('#movie_player, .html5-video-player, ytm-player') ?? video?.parentElement;
        if (!(video instanceof HTMLVideoElement) || !(player instanceof HTMLElement)) {
            throw new Error('Real fullscreen trigger could not find the active video/player');
        }
        let trigger = document.querySelector('[data-yomu-real-fullscreen-trigger]');
        if (!(trigger instanceof HTMLButtonElement)) {
            trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.dataset.yomuRealFullscreenTrigger = 'true';
            trigger.setAttribute('aria-label', 'Yomu real fullscreen smoke trigger');
            Object.assign(trigger.style, {
                position: 'fixed',
                top: '8px',
                left: '8px',
                width: '24px',
                height: '24px',
                opacity: '0.02',
                pointerEvents: 'auto',
                zIndex: '2147483647',
            });
            trigger.addEventListener('click', async () => {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await video.requestFullscreen();
            });
            document.documentElement.append(trigger);
        }
    });
    await page.locator('[data-yomu-real-fullscreen-trigger]').click({ timeout: 10000 });
    await page.waitForFunction(() => Boolean(document.fullscreenElement), { timeout: 10000 });
    await page.waitForTimeout(750);
}

async function exitRealVideoFullscreen(page) {
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement, { timeout: 10000 });
    await page.evaluate(() => document.querySelector('[data-yomu-real-fullscreen-trigger]')?.remove());
    await page.waitForTimeout(750);
}

async function enterYoutubeCssFullscreen(page) {
    await page.addStyleTag({ content: `
        html.yomu-fullscreen-smoke,
        html.yomu-fullscreen-smoke body {
            margin: 0 !important;
            overflow: hidden !important;
            width: 100vw !important;
            height: 100vh !important;
        }
        html.yomu-fullscreen-smoke #movie_player.ytp-fullscreen,
        html.yomu-fullscreen-smoke #movie_player.fullscreen,
        html.yomu-fullscreen-smoke .html5-video-player.ytp-fullscreen,
        html.yomu-fullscreen-smoke .html5-video-player.fullscreen,
        html.yomu-fullscreen-smoke ytm-player.fullscreen {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            min-height: 100vh !important;
            z-index: 2147483640 !important;
            background: #000 !important;
        }
        html.yomu-fullscreen-smoke #secondary,
        html.yomu-fullscreen-smoke #comments,
        html.yomu-fullscreen-smoke ytd-watch-metadata {
            display: none !important;
        }
    ` });
    await page.evaluate(() => {
        const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
            ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
            ?? document.querySelector('video');
        const players = [...new Set([
            video?.closest('#movie_player, .html5-video-player, ytm-player'),
            document.querySelector('#movie_player, .html5-video-player, ytm-player'),
            document.querySelector('ytm-player'),
        ].filter(Boolean))];
        const player = players.find(candidate => video && candidate.contains(video)) ?? players[0];
        const saveElement = element => element instanceof HTMLElement
            ? {
                element,
                style: element.getAttribute('style'),
                ownRect: Object.prototype.hasOwnProperty.call(element, 'getBoundingClientRect')
                    ? element.getBoundingClientRect
                    : null,
                classes: {
                    ytpFullscreen: element.classList.contains('ytp-fullscreen'),
                    fullscreen: element.classList.contains('fullscreen'),
                    ytpAutohide: element.classList.contains('ytp-autohide'),
                    ytpHideControls: element.classList.contains('ytp-hide-controls'),
                    ytpPlayerMinimized: element.classList.contains('ytp-player-minimized'),
                },
                fullscreenAttribute: element.hasAttribute('fullscreen'),
                inlineFullscreenAttribute: element.getAttribute('data-yomu-inline-fullscreen'),
            }
            : null;
        window.__yomuFullscreenSmokeRestore = {
            players: players.map(saveElement).filter(Boolean),
            video: saveElement(video),
        };
        document.documentElement.classList.add('yomu-fullscreen-smoke');
        // Mirror Yomu's real inline CSS-fullscreen state so the masthead-hide
        // stylesheet (scoped to html.jpdb-subtitle-inline-fullscreen) is exercised.
        document.documentElement.classList.add('jpdb-subtitle-inline-fullscreen');
        if (player instanceof HTMLElement) player.setAttribute('data-yomu-inline-fullscreen', 'true');
        for (const candidate of players) {
            candidate.classList.add('ytp-fullscreen', 'fullscreen');
            if (candidate.matches('ytm-player')) candidate.setAttribute('fullscreen', '');
            candidate.classList.remove('ytp-autohide', 'ytp-hide-controls', 'ytp-player-minimized');
            for (const [property, value] of [
                ['position', 'fixed'],
                ['inset', '0'],
                ['left', '0'],
                ['top', '0'],
                ['width', '100vw'],
                ['height', '100vh'],
                ['min-height', '100vh'],
                ['z-index', '2147483640'],
                ['display', 'block'],
            ]) {
                candidate.style.setProperty(property, value, 'important');
            }
        }
        if (video instanceof HTMLElement) {
            video.style.setProperty('display', 'block', 'important');
            video.style.setProperty('width', '100%', 'important');
            video.style.setProperty('height', '100%', 'important');
        }
        const fullscreenRect = () => new DOMRect(0, 0, window.innerWidth, window.innerHeight);
        for (const candidate of players) candidate.getBoundingClientRect = fullscreenRect;
        if (video instanceof HTMLElement) video.getBoundingClientRect = fullscreenRect;
        window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(750);
}

async function exitYoutubeCssFullscreen(page) {
    await page.evaluate(() => {
        const restore = window.__yomuFullscreenSmokeRestore;
        const restoreElement = record => {
            const element = record?.element;
            if (!(element instanceof HTMLElement)) return;
            if (record.style === null) element.removeAttribute('style');
            else element.setAttribute('style', record.style);
            for (const [className, present] of [
                ['ytp-fullscreen', record.classes.ytpFullscreen],
                ['fullscreen', record.classes.fullscreen],
                ['ytp-autohide', record.classes.ytpAutohide],
                ['ytp-hide-controls', record.classes.ytpHideControls],
                ['ytp-player-minimized', record.classes.ytpPlayerMinimized],
            ]) {
                element.classList.toggle(className, present);
            }
            element.toggleAttribute('fullscreen', record.fullscreenAttribute);
            if (record.inlineFullscreenAttribute === null) element.removeAttribute('data-yomu-inline-fullscreen');
            else element.setAttribute('data-yomu-inline-fullscreen', record.inlineFullscreenAttribute);
            if (record.ownRect) element.getBoundingClientRect = record.ownRect;
            else delete element.getBoundingClientRect;
        };
        for (const record of restore?.players ?? []) restoreElement(record);
        restoreElement(restore?.video);
        document.documentElement.classList.remove('yomu-fullscreen-smoke', 'jpdb-subtitle-inline-fullscreen');
        delete window.__yomuFullscreenSmokeRestore;
        window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(750);
}

async function waitForYomuFullscreenHost(page) {
    try {
        await page.waitForFunction(() => {
            const root = document.querySelector('.jpdb-subtitle-player');
            const player = document.querySelector('#movie_player.ytp-fullscreen, #movie_player.fullscreen, .html5-video-player.ytp-fullscreen, .html5-video-player.fullscreen, ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen');
            const rail = root?.querySelector('.jpdb-subtitle-rail');
            const railStyle = rail ? getComputedStyle(rail) : null;
            const topLayerHost = document.fullscreenElement;
            const mobileBodyOverlayVisible = location.hostname === 'm.youtube.com'
                && root?.parentElement === document.body
                && root.getBoundingClientRect().width > 100
                && root.getBoundingClientRect().height > 100;
            const realFullscreenHosted = Boolean(root && topLayerHost?.contains(root));
            return Boolean((root && player && root.parentElement === player || mobileBodyOverlayVisible || realFullscreenHosted)
                && rail && railStyle?.pointerEvents !== 'none'
                && !root.classList.contains('jpdb-subtitle-video-out-of-view'));
        }, { timeout: 15000 });
    } catch (error) {
        const debug = await collectEvidence(page, 'fullscreen-timeout');
        throw new Error(`Timed out waiting for Yomu fullscreen host\n${JSON.stringify(debug, null, 2)}`, { cause: error });
    }
}

async function waitForYomuNormalHost(page) {
    try {
        await page.waitForFunction(() => {
            const root = document.querySelector('.jpdb-subtitle-player');
            const line = root?.querySelector('.jpdb-subtitle-primary');
            const rect = root?.getBoundingClientRect();
            return Boolean(
                root
                && line?.textContent?.trim()
                && rect && rect.width > 100 && rect.height > 20
                && !document.documentElement.classList.contains('jpdb-subtitle-inline-fullscreen')
                && !root.classList.contains('jpdb-subtitle-video-out-of-view')
            );
        }, { timeout: 15000 });
    } catch (error) {
        const debug = await collectEvidence(page, 'return-timeout');
        throw new Error(`Timed out waiting for Yomu normal host after fullscreen\n${JSON.stringify(debug, null, 2)}`, { cause: error });
    }
}

async function collectEvidence(page, mode) {
    return await page.evaluate(currentMode => {
        const roundedRect = rect => ({
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
        });
        const root = document.querySelector('.jpdb-subtitle-player');
        const rail = root?.querySelector('.jpdb-subtitle-rail');
        const line = root?.querySelector('.jpdb-subtitle-lines');
        const player = document.querySelector('#movie_player, .html5-video-player, ytm-player');
        const video = document.querySelector('video[data-yomu-fullscreen-smoke-video]')
            ?? document.querySelector('track[data-yomu-fullscreen-smoke-track]')?.closest('video')
            ?? document.querySelector('video');
        const fullscreenHost = document.fullscreenElement;
        const rootRect = root?.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        const playerRect = player?.getBoundingClientRect();
        const style = rail ? getComputedStyle(rail) : null;
        return {
            mode: currentMode,
            href: location.href,
            signedIn: Boolean(document.querySelector('#avatar-btn, button#avatar-btn, ytd-masthead #buttons img, ytm-topbar-menu-button-renderer img')),
            fullscreenElement: fullscreenHost?.tagName ?? null,
            fullscreenElementContainsMasthead: Boolean(fullscreenHost
                && [...document.querySelectorAll('ytd-masthead, #masthead, #masthead-container')]
                    .some(element => fullscreenHost.contains(element))),
            ytdFullscreen: Boolean(document.querySelector('ytd-watch-flexy[fullscreen]')),
            playerFullscreenClass: Boolean(document.querySelector('#movie_player.ytp-fullscreen, #movie_player.fullscreen, .html5-video-player.ytp-fullscreen, .html5-video-player.fullscreen, ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen')),
            videoPaused: video instanceof HTMLVideoElement ? video.paused : null,
            videoCurrentTime: video instanceof HTMLVideoElement ? video.currentTime : null,
            hasRoot: Boolean(root),
            hostedInPlayer: Boolean(root && player && root.parentElement === player),
            hostedInFullscreenElement: Boolean(root && fullscreenHost?.contains(root)),
            mobileBodyOverlayVisible: Boolean(location.hostname === 'm.youtube.com'
                && root?.parentElement === document.body
                && rootRect && rootRect.width > 100 && rootRect.height > 100
                && !root.classList.contains('jpdb-subtitle-video-out-of-view')),
            rootParent: root?.parentElement?.tagName.toLowerCase() ?? '',
            rootClasses: root?.className.toString() ?? '',
            lineText: line?.textContent?.trim() ?? '',
            hasRail: Boolean(rail && style && style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0),
            railPointerEvents: style?.pointerEvents ?? '',
            rootRect: rootRect ? roundedRect(rootRect) : null,
            railRect: railRect ? roundedRect(railRect) : null,
            playerRect: playerRect ? roundedRect(playerRect) : null,
            annotation: annotationEvidence(),
            youtubeControlHits: youtubeControlHits(),
            masthead: mastheadVisibility(),
        };

        function annotationEvidence() {
            const primary = root?.querySelector('.jpdb-subtitle-primary');
            const words = primary
                ? [...primary.querySelectorAll('.jpdb-reader-word')].map(word => {
                    const pitch = ['heiban', 'atamadaka', 'nakadaka', 'odaka']
                        .find(kind => word.classList.contains(`jpdb-pitch-${kind}`)) ?? '';
                    const componentGradient = getComputedStyle(word)
                        .getPropertyValue('--jpdb-reader-inline-pitch-gradient')
                        .trim();
                    return {
                        surface: surfaceText(word),
                        furi: [...word.querySelectorAll('rt.jpdb-reader-furi, .jpdb-reader-furi')]
                            .map(node => node.textContent?.trim() ?? '')
                            .filter(Boolean),
                        pitch,
                        pitchComponents: word.dataset.pitchComponents === 'true',
                        componentGradient,
                        componentPaint: getComputedStyle(word, '::after').backgroundImage,
                    };
                })
                : [];
            return {
                surface: surfaceText(primary),
                loadingCount: primary?.querySelectorAll('.jpdb-subtitle-primary-loading').length ?? 0,
                wordCount: words.length,
                furiCount: words.reduce((sum, word) => sum + word.furi.length, 0),
                pitchKnownCount: words.filter(word => (
                    word.pitch || (word.pitchComponents && word.componentPaint && word.componentPaint !== 'none')
                )).length,
                componentCount: words.filter(word => word.pitchComponents).length,
                words,
            };
        }

        function surfaceText(element) {
            if (!(element instanceof Element)) return '';
            const clone = element.cloneNode(true);
            clone.querySelectorAll('rt, rp, .jpdb-reader-detached-furi').forEach(node => node.remove());
            return clone.textContent?.replace(/\s+/gu, '') ?? '';
        }

        function mastheadVisibility() {
            const masthead = document.querySelector('ytd-masthead, #masthead, #masthead-container');
            if (!(masthead instanceof HTMLElement)) return { found: false };
            const style = getComputedStyle(masthead);
            const rect = masthead.getBoundingClientRect();
            const hidden = style.display === 'none'
                || style.visibility === 'hidden'
                || Number.parseFloat(style.opacity || '1') === 0
                || rect.width < 1 || rect.height < 1;
            return { found: true, hidden, display: style.display, rect: roundedRect(rect) };
        }

        function youtubeControlHits() {
            return {
                play: controlHit('.ytp-play-button, button.ytp-play-button, button[aria-label*="Play"], button[aria-label*="Pause"]'),
                fullscreen: controlHit('.ytp-fullscreen-button, button.ytp-fullscreen-button, button[title*="full screen" i], button[aria-label*="full screen" i]'),
            };
        }

        function controlHit(selector) {
            const control = document.querySelector(selector);
            if (!(control instanceof HTMLElement)) return { found: false };
            const rect = control.getBoundingClientRect();
            if (rect.width <= 1 || rect.height <= 1) return { found: false, rect: roundedRect(rect) };
            const point = {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
            };
            const top = document.elementFromPoint(point.x, point.y);
            const blocker = top instanceof Element ? top.closest('.jpdb-subtitle-player, .jpdb-subtitle-list') : null;
            const topInsideControl = top instanceof Node && control.contains(top);
            return {
                found: true,
                rect: roundedRect(rect),
                point,
                top: describeElement(top),
                yomuBlocker: describeElement(blocker),
                blockedByYomu: Boolean(blocker && !topInsideControl),
            };
        }

        function describeElement(element) {
            if (!(element instanceof Element)) return null;
            const classes = typeof element.className === 'string'
                ? element.className
                : element.getAttribute('class') ?? '';
            return {
                tag: element.tagName.toLowerCase(),
                id: element.id || '',
                classes: classes.split(/\s+/).filter(Boolean).slice(0, 8),
                text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
            };
        }
    }, mode);
}

function assertYoutubeControlsNotBlocked(result, mode) {
    const hits = result[mode].youtubeControlHits ?? {};
    for (const name of ['play', 'fullscreen']) {
        const hit = hits[name];
        if (!hit?.found) {
            if (result.name === 'desktop' && mode === 'normal') {
                assert(false, `${result.name}: missing YouTube ${name} control hit target in ${mode} mode`, result[mode]);
            }
            continue;
        }
        assert(!hit.blockedByYomu, `${result.name}: Yomu subtitle overlay blocks YouTube ${name} control in ${mode} mode`, {
            mode,
            control: name,
            hit,
            rootRect: result[mode].rootRect,
            playerRect: result[mode].playerRect,
        });
    }
}

function assertAnnotationStability(result) {
    const timeline = result.annotationTimeline ?? {};
    assert(timeline.frameCount > 0, `${result.name}: annotation frame recorder produced no samples`, timeline);
    assert(timeline.annotationDowngradeCount === 0, `${result.name}: subtitle annotations downgraded or disappeared after warmup`, {
        downgradeCount: timeline.annotationDowngradeCount,
        downgrades: timeline.annotationDowngrades,
        changes: timeline.changes,
    });
    assert(timeline.unexpectedTextFrameCount === 0, `${result.name}: unexpected subtitle text flashed during deterministic cue transitions`, {
        unexpectedTextFrameCount: timeline.unexpectedTextFrameCount,
        unexpectedTextFrames: timeline.unexpectedTextFrames,
    });
    assert(timeline.rootIds?.length === 1, `${result.name}: fullscreen rebuilt the subtitle root instead of preserving it`, {
        rootIds: timeline.rootIds,
        changes: timeline.changes,
    });
    if (NATURAL_PLAYBACK) {
        assert(timeline.coldStart?.visibleFrameCount > 0, `${result.name}: recorder missed the first visible subtitle paint`, timeline.coldStart ?? {});
        assert(timeline.coldStart?.loadingFrames === 0
            && timeline.coldStart?.plainFrames === 0
            && timeline.coldStart?.hiddenFrames === 0,
        `${result.name}: first visible subtitle paint was partial or hidden`, timeline.coldStart ?? {});
    }
    for (const phase of ['normal-cue-transition', 'normal-ready', 'enter-fullscreen', 'fullscreen', 'exit-fullscreen', 'returned']) {
        assert((timeline.phaseCounts?.[phase] ?? 0) > 0, `${result.name}: annotation recorder missed ${phase}`, timeline.phaseCounts ?? {});
    }
    if (NATURAL_PLAYBACK) {
        for (const phase of ['normal-ready', 'enter-fullscreen', 'fullscreen', 'exit-fullscreen', 'returned']) {
            assert(timeline.playbackByPhase?.[phase]?.pausedFrames === 0,
                `${result.name}: video paused during active-playback phase ${phase}`,
                timeline.playbackByPhase?.[phase] ?? {});
        }
    }
    for (const cue of timeline.cueSummaries ?? []) {
        assert(cue.frameCount > 0, `${result.name}: no rendered frames captured for ${cue.id}`, cue);
        assert(cue.loadingFrames === 0, `${result.name}: ${cue.id} flashed a loading/plain subtitle`, cue);
        assert(cue.plainFrames === 0, `${result.name}: ${cue.id} appeared without reader-word annotation`, cue);
        assert(cue.hiddenFrames === 0, `${result.name}: ${cue.id} stayed in the DOM but was not visibly painted`, cue);
        assert(cue.unpaintedComponentFrames === 0, `${result.name}: ${cue.id} kept component metadata but lost its pitch paint`, cue);
        assert(cue.minWordCount > 0 && cue.minFuriCount > 0 && cue.minPitchKnownCount > 0, `${result.name}: ${cue.id} lost furigana or pitch annotation`, cue);
        assert(cue.signatures.length === 1, `${result.name}: ${cue.id} annotations changed after first paint`, {
            cue: cue.id,
            signatures: cue.signatures,
            changes: timeline.changes,
        });
    }

    const stableModes = [result.normal, result.fullscreen, result.returned];
    const expectedCompoundText = DIAGNOSTIC_CUES[1].text.replace(/\s+/gu, '');
    for (const evidence of stableModes) {
        if (NATURAL_PLAYBACK) {
            assert(evidence.videoPaused === false, `${result.name}: video was paused in ${evidence.mode} evidence`, evidence);
        }
        assert(evidence.annotation?.surface === expectedCompoundText, `${result.name}: ${evidence.mode} did not preserve the compound cue`, evidence.annotation ?? {});
        assert(evidence.annotation?.loadingCount === 0, `${result.name}: ${evidence.mode} regressed to a loading subtitle`, evidence.annotation ?? {});
        assert(evidence.annotation?.wordCount > 0 && evidence.annotation?.furiCount > 0, `${result.name}: ${evidence.mode} lost word or furigana markup`, evidence.annotation ?? {});
        const compound = evidence.annotation?.words?.find(word => word.surface.includes('申し訳'));
        assert(compound?.pitchComponents, `${result.name}: ${evidence.mode} lost inferred compound metadata`, compound ?? {});
        assert(compound?.componentGradient, `${result.name}: ${evidence.mode} lost the component gradient`, compound ?? {});
        assert(compound?.componentPaint && compound.componentPaint !== 'none', `${result.name}: ${evidence.mode} did not paint the component gradient`, compound ?? {});
    }
    if (NATURAL_PLAYBACK) {
        assert(Number.isFinite(result.normal.videoCurrentTime)
            && Number.isFinite(result.returned.videoCurrentTime)
            && result.returned.videoCurrentTime > result.normal.videoCurrentTime,
        `${result.name}: playback time did not advance through fullscreen and return`, {
            normal: result.normal.videoCurrentTime,
            fullscreen: result.fullscreen.videoCurrentTime,
            returned: result.returned.videoCurrentTime,
        });
    }
    const normalWords = result.normal.annotation?.words ?? [];
    const compound = normalWords.find(word => word.surface.includes('申し訳'));
    assert(compound, `${result.name}: the diagnostic compound was not represented by a reader word`, { words: normalWords });
    assert(compound.pitch || compound.pitchComponents, `${result.name}: 申し訳ありません had no pitch annotation`, compound);
    assert(compound.pitchComponents, `${result.name}: 申し訳ありません did not expose component pitch evidence`, compound);
    assert(compound.componentGradient, `${result.name}: component pitch had no inline gradient`, compound);
    assert(compound.componentPaint && compound.componentPaint !== 'none', `${result.name}: component pitch gradient was not painted in subtitles`, compound);
}

async function bridgeRequest(request) {
    if (new URL(request.url).pathname === SMOKE_VTT_PATH) {
        return {
            status: 200,
            responseText: ACTIVE_SMOKE_VTT,
            bytes: [...Buffer.from(ACTIVE_SMOKE_VTT)],
            contentType: 'text/vtt; charset=utf-8',
        };
    }
    const init = { method: request.method, headers: request.headers };
    if (request.data) init.body = request.data;
    const response = await fetch(request.url, init);
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
        status: response.status,
        responseText: buffer.toString('utf8'),
        bytes: [...buffer],
        contentType: response.headers.get('content-type') ?? '',
    };
}
