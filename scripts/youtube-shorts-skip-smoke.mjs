#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

const COMPANION_DIR = process.env.YOMU_SHORTS_SKIP_COMPANION_DIR
    ? resolve(process.env.YOMU_SHORTS_SKIP_COMPANION_DIR)
    : (existsSync(resolve('dist/greasyfork')) ? resolve('dist/greasyfork') : resolve('docs/public/greasyfork'));
const COMPANION_PATHS = [
    'yomu-anki.user.js',
    'yomu-kanji-study.user.js',
    'yomu-settings-surface.user.js',
    'yomu-video.user.js',
].map(name => resolve(COMPANION_DIR, name)).filter(existsSync);

const START_URL = 'https://m.youtube.com/shorts/deskShort';
const CHAIN = [
    { id: 'deskShort', title: 'Desk setup Short' },
    { id: 'gymShort', title: 'Gym routine Short' },
    { id: 'japaneseShort', title: '大阪で食べ歩きラーメン' },
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    localDictionariesEnabled: false,
    showFloatingButton: false,
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    subtitlePlayerEnabled: false,
    enableLogging: false,
};

function shortsHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Yomu Shorts skip smoke</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; color: #fff; font-family: Roboto, Arial, sans-serif; }
    shorts-page, shorts-carousel, shorts-video { display: block; min-height: 100vh; }
    .ytShortsCarouselShortsA11yNav { position: fixed; top: 16px; right: 16px; z-index: 2; }
    .ytShortsCarouselShortsA11yNavButton { min-width: 88px; min-height: 44px; }
    yt-shorts-video-title-view-model { display: block; padding: 72vh 24px 0; font-size: 24px; line-height: 1.3; }
  </style>
</head>
<body>
  <shorts-page>
    <shorts-carousel class="ytShortsCarouselHost">
      <div class="hidden-a11y-nav ytShortsCarouselShortsA11yNav">
        <button class="ytShortsCarouselShortsA11yNavButton" disabled aria-label="Previous video"></button>
        <button id="next-short" class="ytShortsCarouselShortsA11yNavButton" aria-label="Next video">Next</button>
      </div>
      <div id="carousel-scrollable-wrapper"><shorts-video></shorts-video></div>
    </shorts-carousel>
    <ytm-reel-player-overlay-renderer>
      <yt-shorts-video-title-view-model>${CHAIN[0].title}</yt-shorts-video-title-view-model>
    </ytm-reel-player-overlay-renderer>
  </shorts-page>
  <script>
    window.__yomuShortsClicks = 0;
    window.__yomuShortsChain = ${JSON.stringify(CHAIN)};
    document.getElementById('next-short').addEventListener('click', () => {
      const chain = window.__yomuShortsChain;
      window.__yomuShortsClicks += 1;
      const active = chain[Math.min(window.__yomuShortsClicks, chain.length - 1)];
      history.pushState({}, '', '/shorts/' + active.id);
      document.querySelector('yt-shorts-video-title-view-model').textContent = active.title;
      window.dispatchEvent(new Event('yt-navigate-finish'));
    });
  </script>
</body>
</html>`;
}

function titleForOEmbed(url) {
    const requestUrl = new URL(url);
    const watchUrl = new URL(requestUrl.searchParams.get('url') ?? 'https://www.youtube.com/watch');
    const videoId = watchUrl.searchParams.get('v') ?? '';
    return CHAIN.find(item => item.id === videoId)?.title ?? '';
}

function installGmInit(context, css) {
    return context.addInitScript(({ cssText, settingsValue, chain }) => {
        const store = new Map([[settingsValue.key, settingsValue.value]]);
        function readStoredValue(key, fallback) {
            if (store.has(key)) return store.get(key);
            try {
                const raw = localStorage.getItem(key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        }
        function writeStoredValue(key, value) {
            store.set(key, value);
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch {
                // Smoke fixture storage can be transient.
            }
        }
        for (const item of chain) {
            try {
                sessionStorage.setItem(`yomu:youtube-oembed-title:v1:${item.id}`, JSON.stringify({
                    title: item.title,
                    cachedAt: Date.now(),
                }));
            } catch {
                // Session storage is best-effort in the smoke page.
            }
        }

        window.GM_info = { script: { version: '0.0.0-shorts-smoke' }, scriptHandler: 'yomu-smoke' };
        window.GM_getValue = (key, fallback) => readStoredValue(key, fallback);
        window.GM_setValue = (key, value) => { writeStoredValue(key, value); };
        window.GM_deleteValue = key => { store.delete(key); };
        window.GM_listValues = () => [...store.keys()];
        window.GM_addStyle = styleText => {
            const style = document.createElement('style');
            style.textContent = styleText;
            (document.head || document.documentElement).append(style);
            return style;
        };
        window.GM_getResourceText = name => name === 'yomuCss' ? cssText : '';
        window.GM_registerMenuCommand = () => undefined;
        window.GM_addValueChangeListener = () => 0;
        window.GM_removeValueChangeListener = () => undefined;
        window.GM_xmlhttpRequest = options => {
            fetch(options.url, { method: options.method || 'GET', headers: options.headers || {}, body: options.data })
                .then(async response => options.onload?.({ status: response.status, responseText: await response.text(), response }))
                .catch(error => options.onerror?.(error));
        };
        window.GM = {
            getValue: window.GM_getValue,
            setValue: window.GM_setValue,
            deleteValue: window.GM_deleteValue,
            listValues: window.GM_listValues,
            addStyle: window.GM_addStyle,
            addValueChangeListener: window.GM_addValueChangeListener,
            removeValueChangeListener: window.GM_removeValueChangeListener,
            registerMenuCommand: window.GM_registerMenuCommand,
            xmlHttpRequest: window.GM_xmlhttpRequest,
            xmlhttpRequest: window.GM_xmlhttpRequest,
        };
    }, { cssText: css, settingsValue: { key: YOMU_SETTINGS_KEY, value: settings }, chain: CHAIN });
}

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: process.env.YOMU_SHORTS_SKIP_HEADED !== '1' });
const context = await browser.newContext({
    bypassCSP: true,
    locale: 'ja-JP',
    viewport: { width: 390, height: 844 },
});
await installGmInit(context, readFileSync(CSS_PATH, 'utf8'));
for (const companionPath of COMPANION_PATHS) {
    await context.addInitScript({ path: companionPath });
}
await context.addInitScript({ path: SCRIPT_PATH });

const page = await context.newPage();
page.on('pageerror', error => {
    throw error;
});
await page.route(START_URL, route => route.fulfill({ body: shortsHtml(), contentType: 'text/html' }));
await page.route('https://www.youtube.com/oembed**', route => route.fulfill({
    body: JSON.stringify({ title: titleForOEmbed(route.request().url()) }),
    contentType: 'application/json',
}));

try {
    await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__yomuShortsClicks >= 2 && location.pathname.endsWith('/japaneseShort'), null, { timeout: 6000 });
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => ({
        clicks: window.__yomuShortsClicks ?? 0,
        path: location.pathname,
        title: document.querySelector('yt-shorts-video-title-view-model')?.textContent?.trim() ?? '',
        filterActive: document.documentElement.classList.contains('jpdb-youtube-filter-active'),
    }));
    assert(state.filterActive, 'YouTube immersion filter did not activate on mobile Shorts', state);
    assert(state.clicks === 2, 'Yomu did not advance through both non-Japanese Shorts', state);
    assert(state.path === '/shorts/japaneseShort', 'Yomu did not stop on the Japanese Short', state);
    assert(/[\u3040-\u30ff\u3400-\u9fff]/u.test(state.title), 'Final active Short title was not Japanese', state);
    console.log(JSON.stringify(state, null, 2));
} finally {
    await context.close();
    await browser.close();
}
