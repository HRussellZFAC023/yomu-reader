#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const WATCH_URL = process.argv[2] ?? 'https://www.youtube.com/watch?v=f2Q5tPfiSAE';
const ARTIFACT_DIR = process.env.YOMU_YOUTUBE_FULLSCREEN_ARTIFACTS ?? '/tmp/yomu-youtube-fullscreen-smoke';
const REQUEST_BRIDGE_NAME = '__yomuYoutubeFullscreenRequest';
const SMOKE_VTT_URL = 'https://yomu.invalid/yomu-fullscreen-smoke.vtt';
const SMOKE_VTT = `WEBVTT

00:00:00.000 --> 00:00:30.000
先生いつもありがとうございました。
`;

const { root: ROOT, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const COMPANION_PATHS = ['yomu-anki.user.js', 'yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => join(ROOT, 'dist', 'greasyfork', name))
    .filter(existsSync);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...COMPANION_PATHS], ROOT);
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
    subtitleTextColorSource: 'off',
    subtitleUnderlineColorSource: 'off',
    subtitleHighlightColorSource: 'off',
};

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
];

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const results = [];

try {
    for (const viewport of viewports) {
        results.push(await runViewport(viewport));
    }
} finally {
    await browser.close();
}

for (const result of results) {
    assert(result.normal.hasRoot, `${result.name}: missing Yomu subtitle root in normal mode`, result.normal);
    assert(result.normal.hasRail, `${result.name}: missing Yomu control rail in normal mode`, result.normal);
    assert(result.normal.lineText, `${result.name}: missing Yomu subtitle text in normal mode`, result.normal);
    assert(result.fullscreen.hasRoot, `${result.name}: missing Yomu subtitle root in fullscreen mode`, result.fullscreen);
    assert(result.fullscreen.hostedInPlayer || result.fullscreen.mobileBodyOverlayVisible, `${result.name}: Yomu root was not visible in a fullscreen host`, result.fullscreen);
    assert(result.fullscreen.hasRail, `${result.name}: missing Yomu control rail in fullscreen mode`, result.fullscreen);
    assert(result.fullscreen.lineText, `${result.name}: missing Yomu subtitle text in fullscreen mode`, result.fullscreen);
}

console.log(JSON.stringify({
    url: WATCH_URL,
    settings: {
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
        subtitleOverlayVisible: settings.subtitleOverlayVisible,
        subtitleControlsMode: settings.subtitleControlsMode,
        subtitleTranscriptVisible: settings.subtitleTranscriptVisible,
    },
    artifacts: ARTIFACT_DIR,
    results,
}, null, 2));

async function runViewport(viewport) {
    const context = await browser.newContext({
        ...viewport.context,
        bypassCSP: true,
        locale: 'ja-JP',
    });
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

    try {
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: settings,
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: REQUEST_BRIDGE_NAME,
        });
        await context.addInitScript({
            content: [...COMPANION_PATHS, SCRIPT_PATH].map(path => readFileSync(path, 'utf8')).join('\n;\n'),
        });
        await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await dismissConsent(page);
        await page.waitForSelector('video, #movie_player, .html5-video-player', { timeout: 45000 });
        await installUserscriptCssResource(page, CSS_PATH);
        await installDiagnosticTrack(page);
        await installDiagnosticCaption(page);
        await waitForYomuSubtitle(page, errors);

        const normalPath = join(ARTIFACT_DIR, `${viewport.name}-normal.png`);
        await page.screenshot({ path: normalPath, fullPage: false });
        const normal = await collectEvidence(page, 'normal');

        await enterYoutubeCssFullscreen(page);
        await waitForYomuFullscreenHost(page);
        const fullscreenPath = join(ARTIFACT_DIR, `${viewport.name}-fullscreen.png`);
        await page.screenshot({ path: fullscreenPath, fullPage: false });
        const fullscreen = await collectEvidence(page, 'fullscreen');

        return {
            name: viewport.name,
            viewport: await page.viewportSize(),
            normalScreenshot: normalPath,
            fullscreenScreenshot: fullscreenPath,
            normal,
            fullscreen,
            errors: errors.slice(0, 5),
        };
    } finally {
        await context.close();
    }
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

async function installDiagnosticCaption(page) {
    await page.evaluate(() => {
        const player = document.querySelector('#movie_player, .html5-video-player') ?? document.querySelector('video')?.parentElement;
        if (!player || player.querySelector('[data-yomu-fullscreen-smoke-caption]')) return;
        const container = document.createElement('div');
        container.className = 'ytp-caption-window-container';
        container.dataset.yomuFullscreenSmokeCaption = 'true';
        container.innerHTML = '<span class="ytp-caption-segment">先生いつもありがとうございました。</span>';
        Object.assign(container.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '72px',
            textAlign: 'center',
            zIndex: '20',
        });
        player.append(container);
    });
}

async function installDiagnosticTrack(page) {
    await page.evaluate(url => {
        const video = document.querySelector('video');
        if (!video || video.querySelector('track[data-yomu-fullscreen-smoke-track]')) return;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.srclang = 'ja';
        track.label = 'Japanese smoke';
        track.src = url;
        track.dataset.yomuFullscreenSmokeTrack = 'true';
        video.append(track);
    }, SMOKE_VTT_URL);
}

async function waitForYomuSubtitle(page, errors = []) {
    try {
        await page.waitForFunction(() => {
            const root = document.querySelector('.jpdb-subtitle-player');
            const lineText = document.querySelector('.jpdb-subtitle-lines')?.textContent?.trim();
            return Boolean(root && lineText);
        }, { timeout: 30000 });
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

async function enterYoutubeCssFullscreen(page) {
    await page.addStyleTag({ content: `
        html.yomu-fullscreen-smoke,
        html.yomu-fullscreen-smoke body {
            margin: 0 !important;
            overflow: hidden !important;
            width: 100vw !important;
            height: 100vh !important;
        }
        html.yomu-fullscreen-smoke ytd-watch-flexy[fullscreen] #movie_player.ytp-fullscreen,
        html.yomu-fullscreen-smoke ytd-watch-flexy[fullscreen] .html5-video-player.ytp-fullscreen,
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
        const video = document.querySelector('video');
        const players = [...new Set([
            video?.closest('#movie_player, .html5-video-player, ytm-player'),
            document.querySelector('#movie_player, .html5-video-player, ytm-player'),
            document.querySelector('ytm-player'),
        ].filter(Boolean))];
        const player = players.find(candidate => video && candidate.contains(video)) ?? players[0];
        const flexy = document.querySelector('ytd-watch-flexy') ?? player?.closest('ytd-watch-flexy');
        document.documentElement.classList.add('yomu-fullscreen-smoke');
        flexy?.setAttribute('fullscreen', '');
        for (const candidate of players) {
            candidate.classList.add('ytp-fullscreen', 'fullscreen');
            candidate.setAttribute('fullscreen', '');
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

async function waitForYomuFullscreenHost(page) {
    try {
        await page.waitForFunction(() => {
            const root = document.querySelector('.jpdb-subtitle-player');
            const player = document.querySelector('#movie_player.ytp-fullscreen, .html5-video-player.ytp-fullscreen, ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen');
            const rail = root?.querySelector('.jpdb-subtitle-rail');
            const railStyle = rail ? getComputedStyle(rail) : null;
            const mobileBodyOverlayVisible = location.hostname === 'm.youtube.com'
                && root?.parentElement === document.body
                && root.getBoundingClientRect().width > 100
                && root.getBoundingClientRect().height > 100;
            return Boolean((root && player && root.parentElement === player || mobileBodyOverlayVisible)
                && rail && railStyle?.pointerEvents !== 'none'
                && !root.classList.contains('jpdb-subtitle-video-out-of-view'));
        }, { timeout: 15000 });
    } catch (error) {
        const debug = await collectEvidence(page, 'fullscreen-timeout');
        throw new Error(`Timed out waiting for Yomu fullscreen host\n${JSON.stringify(debug, null, 2)}`, { cause: error });
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
        const rootRect = root?.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        const playerRect = player?.getBoundingClientRect();
        const style = rail ? getComputedStyle(rail) : null;
        return {
            mode: currentMode,
            href: location.href,
            fullscreenElement: document.fullscreenElement?.tagName ?? null,
            ytdFullscreen: Boolean(document.querySelector('ytd-watch-flexy[fullscreen]')),
            playerFullscreenClass: Boolean(document.querySelector('#movie_player.ytp-fullscreen, .html5-video-player.ytp-fullscreen, ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen')),
            hasRoot: Boolean(root),
            hostedInPlayer: Boolean(root && player && root.parentElement === player),
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
        };
    }, mode);
}

async function bridgeRequest(request) {
    if (request.url === SMOKE_VTT_URL) {
        return {
            status: 200,
            responseText: SMOKE_VTT,
            bytes: [...Buffer.from(SMOKE_VTT)],
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
