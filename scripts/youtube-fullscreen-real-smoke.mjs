#!/usr/bin/env node
// Real-fullscreen YouTube subtitle smoke. Unlike youtube-fullscreen-smoke.mjs
// (which only fakes fullscreen via CSS classes and never exercises the
// top-layer occlusion that hides the overlay), this harness clicks into the
// REAL Fullscreen API with a trusted user gesture and verifies the Yomu
// subtitle overlay still shows. Focus: mobile (m.youtube.com) where the user
// reported subtitles not showing in fullscreen.
//
// Usage:
//   node scripts/youtube-fullscreen-real-smoke.mjs [watchUrl]
// Env:
//   YOMU_FS_REAL_EXPLORE=1   dump diagnostics, do not assert (discovery mode)
//   YOMU_FS_REAL_HEADED=1    run headed
//   YOMU_FS_REAL_VIEWPORTS=phone,ipad,desktop   subset of viewports
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
const ARTIFACT_DIR = process.env.YOMU_FS_REAL_ARTIFACTS ?? '/tmp/yomu-youtube-fullscreen-real';
const REQUEST_BRIDGE_NAME = '__yomuFsRealRequest';
const SMOKE_VTT_URL = 'https://yomu.invalid/yomu-fullscreen-real-smoke.vtt';
const EXPLORE = process.env.YOMU_FS_REAL_EXPLORE === '1';
const HEADED = process.env.YOMU_FS_REAL_HEADED === '1';
const SMOKE_VTT = `WEBVTT

00:00:00.000 --> 00:30:00.000
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
    subtitleBottomOffset: 2,
    subtitleTextColorSource: 'off',
    subtitleUnderlineColorSource: 'off',
    subtitleHighlightColorSource: 'off',
};

const ALL_VIEWPORTS = {
    phone: { name: 'phone', context: { ...devices['iPhone 13'] } },
    ipad: { name: 'ipad', context: { ...devices['iPad Pro 11'], viewport: { width: 1024, height: 768 } } },
    desktop: { name: 'desktop', context: { viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
};
const VIEWPORT_NAMES = (process.env.YOMU_FS_REAL_VIEWPORTS?.split(',').map(s => s.trim()).filter(Boolean)) ?? ['phone'];
const viewports = VIEWPORT_NAMES.map(name => ALL_VIEWPORTS[name]).filter(Boolean);

const ATTEMPTS = Number(process.env.YOMU_FS_REAL_ATTEMPTS ?? '3');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: !HEADED });
const results = [];
try {
    for (const viewport of viewports) results.push(await runViewportWithRetry(viewport));
} finally {
    await browser.close();
}

// Live YouTube occasionally fails to load captions / mount the controller on a
// given page load (autoplay/bot-check timing). Retry the whole viewport so a
// transient miss does not mask the real signal.
async function runViewportWithRetry(viewport) {
    let lastError;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
            return await runViewport(viewport);
        } catch (error) {
            lastError = error;
            console.error(`[retry] ${viewport.name} attempt ${attempt}/${ATTEMPTS} failed: ${String(error).split('\n')[0]}`);
        }
    }
    throw lastError;
}

console.log(JSON.stringify({ url: WATCH_URL, explore: EXPLORE, results }, null, 2));
if (!EXPLORE) console.log('PASS: real fullscreen subtitles visible on', VIEWPORT_NAMES.join(', '));

// Assertions live inside runViewport so a transient live-YouTube miss is caught
// by runViewportWithRetry instead of failing the whole run on attempt 1.
function assertViewport(result) {
    assert(result.normal.hasRoot, `${result.name}: missing Yomu subtitle root in normal mode`, result.normal);
    assert(result.normal.lineText, `${result.name}: missing Yomu subtitle text in normal mode`, result.normal);
    assert(result.fullscreen.realFullscreen, `${result.name}: did not enter real fullscreen`, result.fullscreen);
    assert(result.fullscreen.hasRoot, `${result.name}: missing Yomu subtitle root in real fullscreen`, result.fullscreen);
    assert(result.fullscreen.subsVisible, `${result.name}: Yomu subtitles not visible in real fullscreen`, result.fullscreen);
    assert(result.fullscreen.lineText, `${result.name}: missing Yomu subtitle text in real fullscreen`, result.fullscreen);
    const drawer = result.fullscreen.drawer;
    assert(drawer?.opened, `${result.name}: transcript drawer did not open in real fullscreen`, drawer);
    assert(drawer?.visible, `${result.name}: transcript drawer hidden (display:none) in real fullscreen`, drawer);
    assert(drawer?.hostedInTopLayer, `${result.name}: transcript drawer not re-parented into the fullscreen top-layer host`, drawer);
    // The decisive top-layer check: hit-test the drawer's own center. Before the
    // fix the drawer stayed under <body>, below the top-layer player, so the
    // player/video answered the hit-test instead of the drawer.
    assert(drawer?.paintsOnTop, `${result.name}: transcript drawer is occluded by the video in real fullscreen (not in the top layer)`, drawer);
}

async function runViewport(viewport) {
    const context = await browser.newContext({ ...viewport.context, bypassCSP: true, locale: 'ja-JP' });
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
        await page.waitForSelector('video, #movie_player, .html5-video-player, ytm-player', { timeout: 45000 });
        await installUserscriptCssResource(page, CSS_PATH);
        await installDiagnosticTrack(page);
        await installDiagnosticCaption(page);
        await waitForYomuSubtitle(page, errors);

        const normalPath = join(ARTIFACT_DIR, `${viewport.name}-normal.png`);
        await page.screenshot({ path: normalPath, fullPage: false }).catch(() => undefined);
        const normal = await collectEvidence(page, 'normal');

        const fsEntry = await enterRealFullscreen(page);
        await page.waitForTimeout(600);
        await installDiagnosticCaption(page);
        await page.waitForTimeout(400);
        const fullscreenPath = join(ARTIFACT_DIR, `${viewport.name}-fullscreen.png`);
        await page.screenshot({ path: fullscreenPath, fullPage: false }).catch(() => undefined);
        const fullscreenEvidence = await collectEvidence(page, 'fullscreen');
        // Open the transcript drawer while still in real fullscreen — the user's
        // report — and verify it overlays the video instead of hiding under it.
        const drawer = await openAndInspectTranscriptDrawer(page);
        await page.screenshot({ path: join(ARTIFACT_DIR, `${viewport.name}-fullscreen-drawer.png`), fullPage: false }).catch(() => undefined);
        const fullscreen = { ...fullscreenEvidence, ...fsEntry, drawer };

        const result = { name: viewport.name, host: new URL(page.url()).host, normalScreenshot: normalPath, fullscreenScreenshot: fullscreenPath, normal, fullscreen, errors: errors.slice(0, 8) };
        if (!EXPLORE) assertViewport(result);
        return result;
    } finally {
        await context.close().catch(() => undefined);
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
        const player = document.querySelector('#movie_player, .html5-video-player, ytm-player') ?? document.querySelector('video')?.parentElement;
        if (!player) return;
        let container = player.querySelector('[data-yomu-fs-real-caption]');
        if (!container) {
            container = document.createElement('div');
            container.className = 'ytp-caption-window-container';
            container.dataset.yomuFsRealCaption = 'true';
            container.innerHTML = '<span class="ytp-caption-segment">先生いつもありがとうございました。</span>';
            Object.assign(container.style, { position: 'absolute', left: '0', right: '0', bottom: '72px', textAlign: 'center', zIndex: '20' });
            player.append(container);
        }
    });
}

async function installDiagnosticTrack(page) {
    await page.evaluate(url => {
        const video = document.querySelector('video');
        if (!video || video.querySelector('track[data-yomu-fs-real-track]')) return;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.srclang = 'ja';
        track.label = 'Japanese smoke';
        track.src = url;
        track.dataset.yomuFsRealTrack = 'true';
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
            hasBridge: typeof window.GM_getValue === 'function',
            settings: typeof window.GM_getValue === 'function' ? window.GM_getValue(settingsKey, null) : null,
            rootClasses: document.querySelector('.jpdb-subtitle-player')?.className?.toString() ?? '',
            lineText: document.querySelector('.jpdb-subtitle-lines')?.textContent?.trim() ?? '',
            videoCount: document.querySelectorAll('video').length,
            trackCount: document.querySelectorAll('track').length,
            playerFound: Boolean(document.querySelector('#movie_player, .html5-video-player, ytm-player')),
            errors: capturedErrors,
        }), { settingsKey: YOMU_SETTINGS_KEY, capturedErrors: errors });
        throw new Error(`Timed out waiting for Yomu subtitle text\n${JSON.stringify(debug, null, 2)}`, { cause: error });
    }
}

// Enter REAL fullscreen with a trusted user gesture. First try YouTube's own
// fullscreen control (most authentic — runs YouTube's own JS that toggles
// classes/attrs AND calls the Fullscreen API). Fall back to a gesture-wrapped
// requestFullscreen on the detected player host so the run still exercises real
// top-layer occlusion even when YouTube's controls are unavailable (e.g. an
// unauthenticated headless session where the bot-check blocks playback).
async function enterRealFullscreen(page) {
    // YouTube's own fullscreen control. Mobile (m.youtube.com) uses
    // button.fullscreen-icon (aria-label "全画面表示に変更" under ja-JP); desktop
    // uses .ytp-fullscreen-button. Clicking it runs YouTube's real handler,
    // which calls the Fullscreen API under a trusted user gesture.
    const buttonSelectors = [
        'button.fullscreen-icon',
        'button[aria-label*="全画面" i]',
        '.ytp-fullscreen-button',
        'button.ytp-fullscreen-button',
        'button[aria-label*="full screen" i]',
        'button[title*="full screen" i]',
    ];
    let nativeClicked = false;
    for (let attempt = 0; attempt < 3 && !nativeClicked; attempt += 1) {
        // Reveal controls right before each click attempt — they auto-hide.
        await page.locator('#player, #movie_player, ytm-player').first().click({ position: { x: 30, y: 30 }, timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(450);
        for (const selector of buttonSelectors) {
            const button = page.locator(selector).first();
            if (!(await button.count())) continue;
            await button.click({ force: true, timeout: 3000 }).catch(() => undefined);
            await page.waitForTimeout(500);
            if (await page.evaluate(() => Boolean(document.fullscreenElement))) { nativeClicked = true; break; }
        }
    }
    if (!nativeClicked) {
        // Deterministic fallback: inject a guaranteed-clickable button that calls
        // requestFullscreen on the bare <video> — the exact call YouTube makes.
        // The click is a trusted user gesture, so it satisfies the Fullscreen
        // permission check, and Yomu's redirect patch intercepts it just as it
        // would YouTube's own call. This exercises the fix even when YouTube's
        // own controls are unreachable headless.
        await page.evaluate(() => {
            const video = document.querySelector('video');
            if (!video) return;
            const trigger = document.createElement('button');
            trigger.id = '__yomuFsRealTrigger';
            Object.assign(trigger.style, { position: 'fixed', left: '0', top: '0', width: '90px', height: '90px', zIndex: '2147483647', opacity: '0.01' });
            trigger.addEventListener('click', () => { (video.requestFullscreen?.() ?? Promise.resolve()).catch(() => undefined); });
            document.body.appendChild(trigger);
        });
        await page.locator('#__yomuFsRealTrigger').click({ force: true, timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(600);
        await page.evaluate(() => document.getElementById('__yomuFsRealTrigger')?.remove());
    }
    const state = await page.evaluate(() => ({
        realFullscreen: Boolean(document.fullscreenElement),
        fullscreenElement: document.fullscreenElement ? `${document.fullscreenElement.tagName.toLowerCase()}${document.fullscreenElement.id ? '#' + document.fullscreenElement.id : ''}` : null,
    }));
    return { ...state, enteredVia: nativeClicked ? 'native-button' : 'gesture-requestFullscreen' };
}

// Open the transcript drawer via its rail toggle while in fullscreen, then
// report whether it actually overlays the player. The drawer lives as a
// body-level sibling of the overlay, so unless it is re-parented into the
// top-layer fullscreen host it renders below the video and is invisible.
async function openAndInspectTranscriptDrawer(page) {
    await page.evaluate(() => {
        const toggle = document.querySelector('.jpdb-subtitle-rail [data-action="panel"]');
        if (toggle instanceof HTMLElement) toggle.click();
    });
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return Boolean(panel && !panel.hidden);
    }, { timeout: 8000 }).catch(() => undefined);
    return await page.evaluate(() => {
        const round = rect => rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null;
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!panel) return { opened: false };
        const player = document.querySelector('#movie_player, .html5-video-player, ytm-player');
        const topLayerHost = document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : null;
        const cs = getComputedStyle(panel);
        const rect = panel.getBoundingClientRect();
        const opened = !panel.hidden;
        const visible = opened && cs.display !== 'none' && cs.visibility !== 'hidden' && Number.parseFloat(cs.opacity || '1') > 0.01;
        const parent = panel.parentElement;
        // The drawer is "in the top layer" when it sits inside the fullscreen
        // element itself (desktop <html> fullscreen keeps it under <body>, which
        // is still inside the top-layer <html>, so accept that case too).
        const hostedInTopLayer = Boolean(parent && topLayerHost
            && (parent === topLayerHost || topLayerHost.contains(panel)));
        // Hit-test the drawer's own centre: if the drawer paints in the top layer
        // it answers; if it is occluded by the video the player/video answers.
        const cx = Math.round(rect.left + rect.width / 2);
        const cy = Math.round(rect.top + rect.height / 2);
        const hit = (cx > 0 && cy > 0 && cx < innerWidth && cy < innerHeight) ? document.elementFromPoint(cx, cy) : null;
        const paintsOnTop = Boolean(hit && (hit === panel || panel.contains(hit)));
        return {
            opened,
            visible,
            hidden: panel.hidden,
            display: cs.display,
            visibility: cs.visibility,
            opacity: Number.parseFloat(cs.opacity || '1'),
            zIndex: cs.zIndex,
            parent: parent ? parent.tagName.toLowerCase() + (parent.id ? '#' + parent.id : '') : null,
            fullscreenElement: topLayerHost ? topLayerHost.tagName.toLowerCase() + (topLayerHost.id ? '#' + topLayerHost.id : '') : null,
            hostedInTopLayer,
            paintsOnTop,
            rect: round(rect),
            hitElement: hit instanceof Element ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') : null,
        };
    });
}

async function collectEvidence(page, mode) {
    return await page.evaluate(currentMode => {
        const round = rect => rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null;
        const root = document.querySelector('.jpdb-subtitle-player');
        const rail = root?.querySelector('.jpdb-subtitle-rail');
        const line = root?.querySelector('.jpdb-subtitle-lines');
        const player = document.querySelector('#movie_player, .html5-video-player, ytm-player');
        const rootRect = root?.getBoundingClientRect();
        const lineRect = line?.getBoundingClientRect();
        const cs = root ? getComputedStyle(root) : null;
        const lineCs = line ? getComputedStyle(line) : null;
        // "subsVisible": the subtitle line element is actually rendered on screen
        // (in viewport, sized, not display:none / hidden / out-of-view-latched).
        const inViewport = Boolean(lineRect && lineRect.width > 4 && lineRect.height > 4
            && lineRect.bottom > 0 && lineRect.top < innerHeight
            && lineRect.right > 0 && lineRect.left < innerWidth);
        const notHidden = Boolean(root && !root.hidden
            && cs && cs.display !== 'none' && cs.visibility !== 'hidden' && Number.parseFloat(cs.opacity || '1') > 0.01
            && lineCs && lineCs.display !== 'none' && lineCs.visibility !== 'hidden');
        const outOfView = Boolean(root?.classList.contains('jpdb-subtitle-video-out-of-view'));
        return {
            mode: currentMode,
            href: location.href,
            host: location.host,
            fullscreenElement: document.fullscreenElement ? document.fullscreenElement.tagName.toLowerCase() + (document.fullscreenElement.id ? '#' + document.fullscreenElement.id : '') : null,
            ytmPlayerFullscreen: Boolean(document.querySelector('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen')),
            moviePlayerFullscreen: Boolean(document.querySelector('#movie_player.ytp-fullscreen, .html5-video-player.ytp-fullscreen')),
            htmlIsFullscreen: document.fullscreenElement === document.documentElement,
            hasRoot: Boolean(root),
            rootParent: root?.parentElement ? root.parentElement.tagName.toLowerCase() + (root.parentElement.id ? '#' + root.parentElement.id : '') : null,
            rootClasses: root?.className.toString() ?? '',
            rootHidden: Boolean(root?.hidden),
            outOfView,
            lineText: line?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            subsVisible: Boolean(notHidden && inViewport && !outOfView),
            inViewport,
            notHidden,
            rootRect: round(rootRect),
            lineRect: round(lineRect),
            playerRect: round(player?.getBoundingClientRect()),
            viewport: { w: innerWidth, h: innerHeight },
        };
    }, mode);
}

async function bridgeRequest(request) {
    if (request.url === SMOKE_VTT_URL) {
        return { status: 200, responseText: SMOKE_VTT, bytes: [...Buffer.from(SMOKE_VTT)], contentType: 'text/vtt; charset=utf-8' };
    }
    const init = { method: request.method, headers: request.headers };
    if (request.data) init.body = request.data;
    const response = await fetch(request.url, init);
    const buffer = Buffer.from(await response.arrayBuffer());
    return { status: response.status, responseText: buffer.toString('utf8'), bytes: [...buffer], contentType: response.headers.get('content-type') ?? '' };
}
