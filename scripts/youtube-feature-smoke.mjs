import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const USERSCRIPT_PATH = resolve(process.env.YOMU_YOUTUBE_FEATURE_USERSCRIPT ?? 'dist/yomu.user.js');
const CSS_PATH = resolve(process.env.YOMU_YOUTUBE_FEATURE_CSS ?? 'dist/yomu.css');
const HEADED = process.env.YOMU_YOUTUBE_FEATURE_HEADED === '1';

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const WATCH_URL = 'https://www.youtube.com/watch?v=feature123';
const HOME_URL = 'https://www.youtube.com/';

const baseSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: false,
    showFloatingButton: false,
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptVisible: true,
    subtitleTranscriptAutoScroll: false,
    subtitleControlsMode: 'auto',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'jpdb',
};

const youtubeTimedText = `<timedtext><body>
<p t="0" d="1800"><s t="0">先生いつもありがとうございました。</s></p>
<p t="2200" d="1800"><s t="0">日本語の字幕を確認します。</s></p>
<p t="4500" d="1800"><s t="0">梅干しをセロハンテープで貼る話。</s></p>
</body></timedtext>`;

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

function youtubeHomeHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    header { height: 64px; display: flex; align-items: center; gap: 24px; padding: 0 24px; background: #0f0f0f; position: sticky; top: 0; z-index: 2; }
    #chips { display: flex; gap: 12px; padding: 12px 24px; }
    #chips button { border: 0; border-radius: 8px; padding: 8px 14px; color: white; background: #333; }
    ytd-rich-grid-renderer { display: grid; grid-template-columns: repeat(3, minmax(260px, 1fr)); gap: 28px 20px; padding: 0 24px 64px; }
    ytd-rich-item-renderer { display: block; min-height: 260px; }
    .thumb { display: block; width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; background: #3b3b3b; }
    #video-title-link { display: block; margin-top: 12px; color: #f1f1f1; text-decoration: none; font-size: 18px; line-height: 1.35; font-weight: 600; }
    .meta { color: #aaa; margin-top: 6px; }
    .jpdb-youtube-filtered { display: none !important; }
  </style>
</head>
<body>
  <ytd-app>
    <header><strong>YouTube Premium</strong><input aria-label="Search" placeholder="Search"></header>
    <div id="chips"><button>All</button><button>Podcasts</button><button>Japanese</button></div>
    <ytd-rich-grid-renderer>
      <ytd-rich-item-renderer data-case="jp">
        <a class="thumb" href="/watch?v=jp"></a>
        <a id="video-title-link" href="/watch?v=jp" aria-label="服代が月1万から20万円！？東京の春コーデ">服代が月1万から20万円！？東京の春コーデ</a>
        <div class="meta">JAPAN STREET STYLE</div>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer data-case="english">
        <a class="thumb" href="/watch?v=en"></a>
        <a id="video-title-link" href="/watch?v=en" aria-label="Minimal desk setup tour">Minimal desk setup tour</a>
        <div class="meta">Desk Channel</div>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer data-case="mixed">
        <a class="thumb" href="/watch?v=mix"></a>
        <a id="video-title-link" href="/watch?v=mix" aria-label="弱いままの自分で大丈夫 Japanese Podcast">弱いままの自分で大丈夫。Japanese Podcast</a>
        <div class="meta">Emma Japanese</div>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer data-case="grammar">
        <a class="thumb" href="/watch?v=grammar"></a>
        <a id="video-title-link" href="/watch?v=grammar" aria-label="JLPT N4 course しかない">JLPT N4 course「しかない」</a>
        <div class="meta">Nihongo Mori</div>
      </ytd-rich-item-renderer>
    </ytd-rich-grid-renderer>
  </ytd-app>
</body>
</html>`;
}

function youtubeWatchHtml() {
    const playerResponse = {
        videoDetails: { videoId: 'feature123' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=feature123&lang=ja',
                    languageCode: 'ja',
                    vssId: '.ja',
                    name: { simpleText: 'Japanese' },
                }],
            },
        },
    };
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Feature YouTube Watch</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytd-watch-flexy { display: block; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 24px; padding: 68px 24px 48px; box-sizing: border-box; }
    #movie_player { position: relative; min-height: 480px; aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    .ytp-caption-window-container { position: absolute; left: 0; right: 0; bottom: 72px; text-align: center; }
    .ytp-caption-segment { padding: 4px 10px; background: rgba(0,0,0,.76); color: white; font-size: 32px; text-shadow: 0 2px 4px black; }
    ytd-watch-metadata { display: block; margin-top: 20px; }
    ytd-watch-metadata h1 { font-size: 24px; margin: 0 0 16px; }
    #description-inline-expander { margin: 16px 0; padding: 14px 16px; border-radius: 10px; background: #272727; line-height: 1.5; }
    ytd-comment-view-model { display: block; margin-top: 18px; padding: 16px 0; border-top: 1px solid #333; }
    #content-text { display: block; line-height: 1.6; }
    aside { display: grid; gap: 16px; align-content: start; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; min-height: 84px; }
    ytd-compact-video-renderer .thumb { border-radius: 8px; background: #333; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; font-weight: 600; }
    .jpdb-youtube-filtered { display: none !important; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="feature123">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted></video>
            <div class="ytp-caption-window-container"><span class="ytp-caption-segment">先生いつもありがとうございました。</span></div>
          </div>
        </div></div></div>
        <ytd-watch-metadata>
          <h1><yt-formatted-string title="日本の習慣｜おばあちゃんが今も大切にしていること">日本の習慣｜おばあちゃんが今も大切にしていること</yt-formatted-string></h1>
          <div id="description-inline-expander">
            <yt-attributed-string id="attributed-snippet-text">復習用のPodcastでは、日本語で説明しています。</yt-attributed-string>
          </div>
        </ytd-watch-metadata>
        <section id="comments">
          <ytd-comment-view-model>
            <yt-attributed-string id="content-text">先生いつもありがとうございました。✨</yt-attributed-string>
            <span class="more-button" slot="more-button"><span>続きを読む</span></span>
          </ytd-comment-view-model>
        </section>
      </section>
      <aside id="secondary">
        <ytd-compact-video-renderer data-case="side-jp">
          <div class="thumb"></div><a id="video-title" href="/watch?v=side-jp">梅干しを貼る話、インパクト強すぎる</a>
        </ytd-compact-video-renderer>
        <ytd-compact-video-renderer data-case="side-en">
          <div class="thumb"></div><a id="video-title" href="/watch?v=side-en">Desk setup tour for focus</a>
        </ytd-compact-video-renderer>
      </aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    player.getVideoData = () => ({ video_id: 'feature123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
  </script>
</body>
</html>`;
}

async function installUserscriptContext(context) {
    const css = readFileSync(CSS_PATH, 'utf8');
    const settings = { ...baseSettings };
    await context.addInitScript(({ css, settings, settingsKey }) => {
        const storage = new Map([[settingsKey, settings]]);
        const storageKey = key => `__yomu_feature_${key}`;
        const readStoredValue = (key, fallback) => {
            if (storage.has(key)) return storage.get(key);
            try {
                const stored = localStorage.getItem(storageKey(key)) ?? localStorage.getItem(key);
                return stored == null ? fallback : JSON.parse(stored);
            } catch {
                return fallback;
            }
        };
        const writeStoredValue = (key, value) => {
            storage.set(key, value);
            try {
                localStorage.setItem(storageKey(key), JSON.stringify(value));
                localStorage.setItem(key, JSON.stringify(value));
            } catch {
                // Storage can be unavailable on synthetic pages; in-memory is enough.
            }
        };
        writeStoredValue(settingsKey, settings);
        window.GM_getResourceText = name => name === 'yomuCss' ? css : '';
        window.GM_addStyle = stylesheet => {
            const style = document.createElement('style');
            style.textContent = stylesheet;
            (document.head || document.documentElement).append(style);
            return style;
        };
        window.GM_getValue = (key, fallback) => readStoredValue(key, fallback);
        window.GM_setValue = (key, value) => { writeStoredValue(key, value); };
        window.GM_deleteValue = key => {
            storage.delete(key);
            try {
                localStorage.removeItem(storageKey(key));
                localStorage.removeItem(key);
            } catch {
                // Ignore.
            }
        };
        window.GM_listValues = () => [...storage.keys()];
        window.GM_addValueChangeListener = () => 0;
        window.GM_removeValueChangeListener = () => undefined;
        window.GM_registerMenuCommand = () => undefined;
        window.GM_xmlhttpRequest = options => {
            fetch(options.url, { method: options.method || 'GET', headers: options.headers || {}, body: options.data })
                .then(async response => {
                    const responseText = await response.text();
                    options.onload?.({
                        status: response.status,
                        responseText,
                        response,
                    });
                })
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
        };
        window.__yomuFeatureReadHomepageState = () => {
            const element = selector => document.querySelector(selector);
            const computed = selector => {
                const target = element(selector);
                return target ? getComputedStyle(target) : null;
            };
            const englishStyle = computed('ytd-rich-item-renderer[data-case="english"]');
            const jpStyle = computed('ytd-rich-item-renderer[data-case="jp"]');
            return {
                cards: document.querySelectorAll('ytd-rich-item-renderer').length,
                readerWordsInGrid: document.querySelectorAll('ytd-rich-grid-renderer .jpdb-reader-word').length,
                filteredEnglish: element('ytd-rich-item-renderer[data-case="english"]')?.classList.contains('jpdb-youtube-filtered') ?? false,
                englishVisible: Boolean(englishStyle && englishStyle.display !== 'none' && englishStyle.visibility !== 'hidden'),
                visibleJapanese: Boolean(jpStyle && jpStyle.display !== 'none' && jpStyle.visibility !== 'hidden'),
                noticeText: document.querySelector('.jpdb-youtube-filter-bar')?.textContent ?? '',
            };
        };
        window.__yomuFeatureReadWatchState = () => {
            const panel = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
            const video = (document.querySelector('#movie_player') || document.querySelector('video'))?.getBoundingClientRect();
            const row = document.querySelector('.jpdb-subtitle-row-text');
            const rowStyle = row ? getComputedStyle(row) : null;
            return {
                rows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
                parsedRowWords: document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length,
                parsedPlayerWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
                descriptionWords: document.querySelectorAll('ytd-watch-metadata #description-inline-expander .jpdb-reader-word').length,
                commentWords: document.querySelectorAll('ytd-comment-view-model #content-text .jpdb-reader-word').length,
                titleWords: document.querySelectorAll('ytd-watch-metadata h1 .jpdb-reader-word, ytd-watch-metadata #title .jpdb-reader-word').length,
                sidebarReaderWords: document.querySelectorAll('#secondary .jpdb-reader-word, ytd-compact-video-renderer .jpdb-reader-word').length,
                rowCopyButtons: document.querySelectorAll('.jpdb-subtitle-row-copy').length,
                rowFont: rowStyle ? {
                    family: rowStyle.fontFamily,
                    size: rowStyle.fontSize,
                    weight: rowStyle.fontWeight,
                    lineHeight: rowStyle.lineHeight,
                    textShadow: rowStyle.textShadow,
                } : null,
                layout: {
                    placement: document.querySelector('.jpdb-subtitle-player')?.dataset.transcriptPlacement ?? '',
                    panel: panel?.toJSON(),
                    video: video?.toJSON(),
                    viewport: { width: window.innerWidth, height: window.innerHeight },
                },
            };
        };
    }, { css, settings, settingsKey: SETTINGS_KEY });
    await context.addInitScript({ path: USERSCRIPT_PATH });
}

async function installRoutes(page) {
    await page.route('https://www.youtube.com/', route => route.fulfill({ body: youtubeHomeHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({ body: youtubeWatchHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedText, contentType: 'text/xml' }));
    await page.route('https://www.youtube.com/youtubei/v1/player**', route => route.fulfill({
        body: JSON.stringify({
            videoDetails: { videoId: 'feature123' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [{
                        baseUrl: 'https://www.youtube.com/api/timedtext?v=feature123&lang=ja',
                        languageCode: 'ja',
                        vssId: '.ja',
                        name: { simpleText: 'Japanese' },
                    }],
                },
            },
        }),
        contentType: 'application/json',
    }));
}

async function runHomepageCheck(page) {
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('ytd-rich-item-renderer[data-case="jp"]', { timeout: 10000 });
    await page.waitForTimeout(1200);

    const beforeReveal = await page.evaluate(() => window.__yomuFeatureReadHomepageState());
    assert(beforeReveal.cards >= 4, 'YouTube homepage recommendations did not render', beforeReveal);
    assert(beforeReveal.readerWordsInGrid === 0, 'Yomu scanned/wrapped YouTube homepage recommendation titles', beforeReveal);
    assert(beforeReveal.filteredEnglish === true, 'YouTube immersion filter did not hide the non-Japanese recommendation', beforeReveal);
    assert(beforeReveal.visibleJapanese === true, 'YouTube immersion filter hid a Japanese recommendation', beforeReveal);
    assert(beforeReveal.noticeText.includes('hid'), 'YouTube filter notice did not summarize hidden videos', beforeReveal);

    await page.locator('.jpdb-youtube-filter-bar [data-action="toggle-hidden"]').click();
    await page.waitForTimeout(800);
    const afterReveal = await page.evaluate(() => window.__yomuFeatureReadHomepageState());
    assert(afterReveal.englishVisible === true, 'YouTube filter reveal did not show hidden recommendations', afterReveal);
    assert(afterReveal.readerWordsInGrid === 0, 'Yomu wrapped homepage titles after reveal', afterReveal);

    return { beforeReveal, afterReveal };
}

async function runWatchCheck(page) {
    await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 12000 });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length >= 3, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length > 0, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('ytd-watch-metadata #description-inline-expander .jpdb-reader-word').length > 0
        && document.querySelectorAll('ytd-comment-view-model #content-text .jpdb-reader-word').length > 0, null, { timeout: 30000 });

    const initial = await page.evaluate(() => window.__yomuFeatureReadWatchState());
    assert(initial.rows >= 3, 'YouTube transcript rows did not render', initial);
    assert(initial.parsedRowWords > 0, 'YouTube transcript rows were not parsed into reader words', initial);
    assert(initial.parsedPlayerWords > 0, 'YouTube player subtitle was not parsed into reader words', initial);
    assert(initial.descriptionWords > 0, 'YouTube watch description was not parsed', initial);
    assert(initial.commentWords > 0, 'YouTube comment text was not parsed', initial);
    assert(initial.titleWords === 0, 'Yomu wrapped the YouTube watch title', initial);
    assert(initial.sidebarReaderWords === 0, 'Yomu wrapped YouTube sidebar recommendation text', initial);
    assert(initial.rowCopyButtons >= 1, 'YouTube transcript copy buttons are missing', initial);
    assert(initial.rowFont?.size === '16px', 'YouTube sidebar subtitle font size does not match dictionary scale', initial);
    assert(Number(initial.rowFont?.weight ?? 999) <= 500, 'YouTube sidebar subtitle font is still too bold', initial);
    assert(initial.rowFont?.textShadow === 'none', 'YouTube sidebar subtitle text still has player-style shadow', initial);
    assertNonOverlappingLayout(initial.layout, 'initial');

    await page.locator('.jpdb-subtitle-list [data-action="close-panel"]').click();
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 6000 });
    await page.mouse.move(4, 4);
    await page.waitForTimeout(350);
    const idleControls = await page.evaluate(() => {
        const rail = document.querySelector('.jpdb-subtitle-rail');
        const style = rail ? getComputedStyle(rail) : null;
        return {
            rootClasses: document.querySelector('.jpdb-subtitle-player')?.className ?? '',
            railOpacity: style?.opacity ?? '',
            railPointerEvents: style?.pointerEvents ?? '',
            railTransform: style?.transform ?? '',
        };
    });
    assert(idleControls.rootClasses.includes('jpdb-subtitle-controls-idle'), 'YouTube subtitle controls did not enter idle mode', idleControls);
    assert(Number(idleControls.railOpacity) < 0.05, 'YouTube idle mode did not hide the whole control rail', idleControls);
    assert(idleControls.railPointerEvents === 'none', 'Hidden YouTube control rail still receives pointer events', idleControls);

    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click({ force: true });
    await page.waitForFunction(() => !document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 6000 });
    const beforeResize = await page.evaluate(() => window.__yomuFeatureReadWatchState());
    await resizePanel(page, beforeResize.layout.placement || 'right');
    const afterResize = await page.evaluate(() => window.__yomuFeatureReadWatchState());
    assertNonOverlappingLayout(afterResize.layout, 'resized');
    assert(Math.abs((afterResize.layout.panel?.width ?? 0) - (beforeResize.layout.panel?.width ?? 0)) >= 20,
        'YouTube transcript panel did not resize', { beforeResize: beforeResize.layout, afterResize: afterResize.layout });

    await clickTeacherCommentWord(page);
    const dictionary = await page.evaluate(() => {
        const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling')?.textContent?.trim() ?? '';
        const copyPill = Boolean(document.querySelector('.jpdb-reader-popover .jpdb-reader-copy-pill'));
        return { spelling, copyPill };
    });
    assert(dictionary.spelling === '先生', 'Clicking a single YouTube comment word opened the wrong dictionary entry', dictionary);
    assert(dictionary.copyPill, 'Dictionary copy pill is missing for YouTube comment lookup', dictionary);

    return { initial, idleControls, beforeResize: beforeResize.layout, afterResize: afterResize.layout, dictionary };
}

async function clickTeacherCommentWord(page) {
    const word = page.locator('ytd-comment-view-model #content-text .jpdb-reader-word').filter({ hasText: '先生' }).first();
    await word.waitFor({ state: 'visible', timeout: 10000 });
    await word.click();
    await page.waitForSelector('.jpdb-reader-popover .jpdb-reader-spelling', { timeout: 10000 });
}

async function resizePanel(page, placement) {
    const handle = await page.locator('[data-resize-transcript]').boundingBox();
    assert(handle, 'Transcript resize handle is missing');
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (placement === 'left') await page.mouse.move(x + 120, y, { steps: 6 });
    else if (placement === 'bottom') await page.mouse.move(x, y - 100, { steps: 6 });
    else await page.mouse.move(x - 120, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
}

function assertNonOverlappingLayout(layout, label) {
    assert(layout.panel && layout.video, `Missing YouTube layout boxes during ${label}`, layout);
    assert(layout.panel.width >= 260 && layout.panel.height >= 100, `Transcript panel is unusably small during ${label}`, layout);
    assert(layout.video.width >= 240 && layout.video.height >= 120, `Video is unusably small during ${label}`, layout);
    const overlap = !(layout.panel.right <= layout.video.left + 2
        || layout.video.right <= layout.panel.left + 2
        || layout.panel.bottom <= layout.video.top + 2
        || layout.video.bottom <= layout.panel.top + 2);
    assert(!overlap, `Transcript panel overlaps/crops the YouTube video during ${label}`, layout);
}

const browser = await chromium.launch({ headless: !HEADED });
try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'en-GB' });
    await installUserscriptContext(context);
    const page = await context.newPage();
    await installRoutes(page);
    const homepage = await runHomepageCheck(page);
    const watch = await runWatchCheck(page);
    console.log(JSON.stringify({ homepage, watch }, null, 2));
} finally {
    await browser.close();
}
