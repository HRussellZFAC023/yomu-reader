#!/usr/bin/env node
// Live-site subtitle/player discovery smoke. This intentionally stays outside
// npm run check because public demo pages can change, rate-limit, or reject
// automation; use it when validating player geometry against current sites.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';
import { createYomuPaths } from './lib/paths.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, dist: DIST } = createSmokePaths(import.meta.dirname);
const { qaArtifactsRoot } = createYomuPaths(import.meta.dirname);
const VIDEO_COMPANION_PATH = join(DIST, 'greasyfork/yomu-video.user.js');
const headed = process.env.YOMU_LIVE_VIDEO_HEADED === '1';
const siteSet = process.env.YOMU_LIVE_VIDEO_SITE_SET ?? 'generic';
const artifactsDir = join(qaArtifactsRoot, 'subtitle-live-video-sites', siteSet === 'generic' ? 'latest' : `${siteSet}-latest`);
const minPlayerSuccesses = Number(process.env.YOMU_LIVE_VIDEO_MIN_PLAYER_SUCCESSES ?? (siteSet === 'compat' ? '1' : '4'));
const minSubtitleSuccesses = Number(process.env.YOMU_LIVE_VIDEO_MIN_SUBTITLE_SUCCESSES ?? (siteSet === 'compat' ? '0' : '2'));

assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, VIDEO_COMPANION_PATH], ROOT);
rmSync(artifactsDir, { recursive: true, force: true });
mkdirSync(artifactsDir, { recursive: true });

const playerSelectors = [
    'video',
    'iframe[src*="player"]',
    'iframe[src*="embed"]',
    '.video-js',
    '.plyr',
    '.able-wrapper',
    '.bmpui-ui-player',
    '[data-media-player]',
    '[data-player]',
    '[class*="player" i]',
    '[id*="player" i]',
];

const genericLiveSites = [
    { name: 'plyr', url: 'https://plyr.io/', selectors: ['.plyr', 'video'] },
    { name: 'videojs-home', url: 'https://videojs.org/', selectors: ['.video-js', 'video'] },
    { name: 'videojs-hls', url: 'https://videojs-http-streaming.netlify.app/', selectors: ['.video-js', 'video'] },
    { name: 'ableplayer-html5', url: 'https://ableplayer.github.io/ableplayer/demos/video3.html', selectors: ['.able-wrapper', 'video'] },
    { name: 'ableplayer-vimeo', url: 'https://ableplayer.github.io/ableplayer/demos/vimeo2.html', selectors: ['.able-wrapper', 'iframe', 'video'] },
    { name: 'nuevo-videojs-captions', url: 'https://www.nuevodevel.com/nuevo/showcase/captions', selectors: ['.video-js', 'video'] },
    { name: 'bitmovin-captions', url: 'https://bitmovin.com/demos/caption-styling/', selectors: ['.bmpui-ui-player', 'video'] },
    { name: 'kaltura-example', url: 'https://carleton.ca/kaltura/mediaspace/the-kaltura-media-player/', selectors: ['iframe[src*="kaltura"]', 'video'] },
];

const compatLiveSites = [
    { name: 'yomuyomu-lessons', url: 'https://yomuyomu.app/lessons', selectors: ['main', '[data-v-app]', '.lesson-card', 'article'], kind: 'reader' },
    { name: 'reanime', url: 'https://reanime.to/', selectors: playerSelectors, kind: 'anime' },
    { name: 'kaa', url: 'https://kaa.lt/', selectors: playerSelectors, kind: 'anime' },
    { name: 'miruro-watch', url: 'https://www.miruro.to/watch/21/one-piece?ep=1', selectors: playerSelectors, kind: 'anime' },
    { name: 'anime-uniquestream', url: 'https://anime.uniquestream.net/jp', selectors: playerSelectors, kind: 'anime' },
    { name: 'animeverse', url: 'https://animeverse.to/', selectors: playerSelectors, kind: 'anime' },
    { name: 'anizone', url: 'https://anizone.to/anime', selectors: playerSelectors, kind: 'anime' },
];

const siteSets = {
    generic: genericLiveSites,
    compat: compatLiveSites,
};
const liveSites = siteSets[siteSet];
if (!liveSites) throw new Error(`Unknown YOMU_LIVE_VIDEO_SITE_SET "${siteSet}". Use one of: ${Object.keys(siteSets).join(', ')}.`);

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: false,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptPlacement: 'right',
};

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: !headed });
const results = [];
try {
    for (const site of liveSites) results.push(await runLiveSite(browser, site));
} finally {
    await browser.close();
}

const playerSuccesses = results.filter(result => result.kind !== 'reader' && result.hasVisiblePlayer).length;
const subtitleSuccesses = results.filter(result => result.yomuTrackRows > 0 || result.textTrackCount > 0 || result.trackElementCount > 0).length;
const report = {
    siteSet,
    artifactsDir,
    playerSuccesses,
    subtitleSuccesses,
    results,
};
writeFileSync(join(artifactsDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (playerSuccesses < minPlayerSuccesses || subtitleSuccesses < minSubtitleSuccesses) {
    console.error(`Live video smoke threshold missed: players ${playerSuccesses}/${minPlayerSuccesses}, subtitles ${subtitleSuccesses}/${minSubtitleSuccesses}`);
    process.exit(1);
}

async function runLiveSite(browser, site) {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'en-GB',
        viewport: { width: 1440, height: 920 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb|video|caption|subtitle/i.test(message.text())) errors.push(message.text());
    });
    try {
        await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings });
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await dismissCommonOverlays(page);
        await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, VIDEO_COMPANION_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForTimeout(4500);
        await openYomuSubtitleTracksPanel(page);
        await page.screenshot({ path: join(artifactsDir, `${site.name}.png`), fullPage: false }).catch(() => undefined);
        return {
            site: site.name,
            siteSet,
            kind: site.kind ?? 'video',
            url: site.url,
            ...await page.evaluate(liveVideoSiteState, { selectors: site.selectors, kind: site.kind ?? 'video' }),
            errors: errors.slice(0, 5),
        };
    } catch (error) {
        return {
            site: site.name,
            siteSet,
            kind: site.kind ?? 'video',
            url: site.url,
            failed: String(error).slice(0, 220),
            hasVisiblePlayer: false,
            yomuInstalled: false,
            yomuTrackRows: 0,
            yomuStatusMentionsTracks: false,
            textTrackCount: 0,
            errors: errors.slice(0, 5),
        };
    } finally {
        await context.close();
    }
}

async function dismissCommonOverlays(page) {
    for (const label of [/Reject all/i, /Accept all/i, /Accept/i, /I agree/i, /Got it/i, /Close/i]) {
        const button = page.getByRole('button', { name: label }).first();
        if (!await button.count()) continue;
        try {
            await button.click({ timeout: 1800 });
            await page.waitForTimeout(800);
            return;
        } catch {
            // Try the next common consent/control button.
        }
    }
}

async function openYomuSubtitleTracksPanel(page) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('yomu-open-subtitle-tracks'))).catch(() => undefined);
    await page.waitForTimeout(1800);
}

function liveVideoSiteState(spec) {
    const { selectors, kind } = spec;
    const players = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
    const visiblePlayers = players.map(elementState).filter(Boolean);
    const isReaderTarget = kind === 'reader';
    const videos = Array.from(document.querySelectorAll('video'));
    const textTrackCount = videos.reduce((total, video) => total + video.textTracks.length, 0);
    const trackElementCount = document.querySelectorAll('video track').length;
    const panel = document.querySelector('.jpdb-subtitle-list');
    const statusText = document.querySelector('.jpdb-subtitle-status')?.textContent ?? '';
    const rail = document.querySelector('.jpdb-subtitle-rail');
    return {
        hasVisiblePlayer: !isReaderTarget && visiblePlayers.length > 0,
        hasVisibleTargetSurface: visiblePlayers.length > 0,
        visiblePlayerCount: visiblePlayers.length,
        visiblePlayers: visiblePlayers.slice(0, 4),
        videoCount: videos.length,
        textTrackCount,
        trackElementCount,
        yomuInstalled: Boolean(document.querySelector('.jpdb-subtitle-player')),
        yomuReaderRoots: document.querySelectorAll('[data-jpdb-reader-root]').length,
        yomuFloatingButtonVisible: isVisibleElement(document.querySelector('.jpdb-reader-fab'), { minWidth: 16, minHeight: 16 }),
        yomuReaderWords: document.querySelectorAll('.jpdb-reader-word').length,
        yomuPanelOpen: Boolean(panel && !panel.hidden),
        yomuTrackRows: document.querySelectorAll('.jpdb-subtitle-track-row').length,
        yomuLineRows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
        yomuStatusMentionsTracks: /subtitle|track|caption|字幕|トラック/i.test(statusText),
        railVisible: Boolean(rail && getComputedStyle(rail).display !== 'none'),
        title: document.title,
        textSample: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 260),
        appShellMarkers: {
            root: Boolean(document.querySelector('#root')),
            app: Boolean(document.querySelector('#app, [data-v-app]')),
            sveltekit: Boolean(document.querySelector('[data-sveltekit-hydrate]')),
            astro: Boolean(document.querySelector('astro-island')),
            moduleScripts: document.querySelectorAll('script[type="module"]').length,
        },
    };

    function elementState(element) {
        if (!element || element.matches('[data-jpdb-reader-root], [data-jpdb-reader-root] *, .jpdb-subtitle-player, .jpdb-subtitle-player *')) return null;
        if (!isVisibleElement(element, { minWidth: 120, minHeight: 80 })) return null;
        const rect = element.getBoundingClientRect();
        return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: String(element.className).slice(0, 140),
            rect: rect.toJSON(),
        };
    }

    function isVisibleElement(element, { minWidth, minHeight }) {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width >= minWidth
            && rect.height >= minHeight
            && rect.right > 0
            && rect.bottom > 0
            && rect.left < window.innerWidth
            && rect.top < window.innerHeight
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || '1') > 0;
    }
}
