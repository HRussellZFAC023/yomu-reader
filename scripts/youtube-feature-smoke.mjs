import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { assert } from './smoke-harness.mjs';

const USERSCRIPT_PATH = resolve(process.env.YOMU_YOUTUBE_FEATURE_USERSCRIPT ?? 'dist/yomu.user.js');
const CSS_PATH = resolve(process.env.YOMU_YOUTUBE_FEATURE_CSS ?? 'dist/yomu.css');
const HEADED = process.env.YOMU_YOUTUBE_FEATURE_HEADED === '1';

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const WATCH_URL = 'https://www.youtube.com/watch?v=feature123';
const HOME_URL = 'https://www.youtube.com/';
const MOBILE_HOME_URL = 'https://m.youtube.com/';
const SHORTS_GALLERY_URL = 'https://www.youtube.com/feed/shorts';
const SHORTS_WATCH_URL = 'https://www.youtube.com/shorts/watch-en';

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

function youtubeMobileHomeHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Mobile</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytm-app { display: block; min-height: 1800px; }
    header { height: 56px; display: flex; align-items: center; padding: 0 16px; position: sticky; top: 0; background: #0f0f0f; z-index: 3; }
    ytm-rich-grid-renderer { display: grid; gap: 18px; padding: 8px 12px 80px; }
    ytm-video-with-context-renderer, ytm-shorts-lockup-view-model { display: block; min-height: 216px; }
    ytm-media-item, .short-card { display: block; }
    .media-item-thumbnail-container, .short-thumb { display: block; aspect-ratio: 16 / 9; border-radius: 10px; background: #333; }
    .short-thumb { aspect-ratio: 9 / 16; width: min(42vw, 170px); }
    .media-item-headline, .shortsLockupViewModelHostMetadataTitle { margin: 10px 0 0; font-size: 16px; line-height: 1.35; color: #f1f1f1; }
    a { color: inherit; text-decoration: none; }
    ytm-continuation-item-renderer { display: block; height: 160px; color: #aaa; text-align: center; padding-top: 32px; }
  </style>
</head>
<body>
  <ytm-app>
    <header><strong>YouTube</strong></header>
    <ytm-browse>
      <ytm-rich-grid-renderer id="mobile-grid">
        ${mobileVideoCard('mobile-jp', 'mweb-jp', '東京散歩', 'jp')}
        ${mobileVideoCard('mobile-english', 'mweb-en', 'Desk setup tour', 'en')}
        ${mobileVideoCard('mobile-original-jp', 'mweb-original-jp', 'Morning routine', 'jp')}
        ${mobileShortCard('mobile-short-jp', 'short-jp', '京都で朝ごはん', 'jp')}
        ${mobileShortCard('mobile-short-en', 'short-en', 'Gym routine Short', 'en')}
      </ytm-rich-grid-renderer>
      <ytm-continuation-item-renderer id="continuation">Loading more</ytm-continuation-item-renderer>
    </ytm-browse>
  </ytm-app>
  <script>
    window.__yomuContinuationNudges = 0;
    window.__yomuLoadedMobileBatch = false;
    const grid = document.querySelector('#mobile-grid');
    const continuation = document.querySelector('#continuation');
    continuation.scrollIntoView = () => {
      window.__yomuContinuationNudges += 1;
      if (window.__yomuLoadedMobileBatch) return;
      window.__yomuLoadedMobileBatch = true;
      grid.insertAdjacentHTML('beforeend', [
        ${JSON.stringify(mobileShortCard('loaded-short-jp-1', 'loaded-short-jp-1', '札幌の雪まつり', 'jp'))},
        ${JSON.stringify(mobileShortCard('loaded-short-jp-2', 'loaded-short-jp-2', '高校生の一日', 'jp'))},
        ${JSON.stringify(mobileVideoCard('loaded-video-jp', 'loaded-video-jp', '日本語でニュースを読む', 'jp'))},
        ${JSON.stringify(mobileVideoCard('loaded-video-en', 'loaded-video-en', 'Productivity desk tour', 'en'))}
      ].join(''));
    };
  </script>
</body>
</html>`;
}

function youtubeShortsGalleryHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Shorts Gallery</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytd-rich-grid-renderer,
    ytd-rich-shelf-renderer #contents { display: grid; grid-template-columns: repeat(3, minmax(120px, 1fr)); gap: 16px; padding: 24px; }
    ytd-rich-shelf-renderer { display: block; }
    ytd-reel-item-renderer, ytm-shorts-lockup-view-model { display: block; min-height: 280px; }
    .short-thumb { display: block; aspect-ratio: 9 / 16; border-radius: 12px; background: #333; }
    a { color: inherit; text-decoration: none; }
    #video-title, .shortsLockupViewModelHostMetadataTitle { display: block; margin-top: 10px; line-height: 1.3; font-weight: 600; }
  </style>
</head>
<body>
  <ytd-rich-grid-renderer>
    <ytd-rich-shelf-renderer data-case="gallery-shorts-shelf">
      <div id="contents">
        ${desktopShortCard('gallery-jp-1', 'gallery-jp-1', '大阪で食べ歩き')}
        ${desktopShortCard('gallery-en', 'gallery-en', 'Morning gym routine')}
        ${desktopShortCard('gallery-jp-2', 'gallery-jp-2', '京都の朝カフェ')}
        ${mobileShortCard('gallery-mobile-jp', 'gallery-mobile-jp', '東京駅で迷子になる', 'jp')}
        ${mobileShortCard('gallery-mobile-en', 'gallery-mobile-en', 'Desk accessories short', 'en')}
      </div>
    </ytd-rich-shelf-renderer>
  </ytd-rich-grid-renderer>
</body>
</html>`;
}

function youtubeShortsWatchHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Shorts Watch</title>
  <style>
    html, body { margin: 0; background: #000; color: #fff; font-family: Roboto, Arial, sans-serif; }
    ytd-shorts { display: block; height: 100vh; overflow-y: scroll; scroll-snap-type: y mandatory; }
    ytd-reel-video-renderer { display: block; height: 100vh; scroll-snap-align: start; }
    #video-title { display: block; padding: 80vh 20px 0; color: white; }
  </style>
</head>
<body>
  <ytd-shorts>
    <ytd-reel-video-renderer data-case="shorts-watch-current" class="jpdb-youtube-filtered" data-yomu-youtube-filtered="true">
      <a id="video-title" href="/shorts/watch-en">English short in snap feed</a>
    </ytd-reel-video-renderer>
  </ytd-shorts>
</body>
</html>`;
}

function mobileVideoCard(caseName, videoId, title, expectedLanguage) {
    return `<ytm-video-with-context-renderer data-case="${caseName}" data-expected-language="${expectedLanguage}">
      <ytm-media-item>
        <a class="media-item-thumbnail-container" href="/watch?v=${videoId}"></a>
        <h3 class="media-item-headline"><a href="/watch?v=${videoId}" aria-label="${title}">${title}</a></h3>
      </ytm-media-item>
    </ytm-video-with-context-renderer>`;
}

function mobileShortCard(caseName, videoId, title, expectedLanguage) {
    return `<ytm-shorts-lockup-view-model data-case="${caseName}" data-expected-language="${expectedLanguage}">
      <a class="shortsLockupViewModelHostEndpoint reel-item-endpoint" href="/shorts/${videoId}">
        <span class="short-thumb"></span>
        <h3 class="shortsLockupViewModelHostMetadataTitle" aria-label="${title}, 10K views, Example Channel, 1 day ago - play Short">
          <span>${title}</span>
        </h3>
      </a>
    </ytm-shorts-lockup-view-model>`;
}

function desktopShortCard(caseName, videoId, title) {
    return `<ytd-reel-item-renderer data-case="${caseName}" data-expected-language="${/[\u3040-\u30ff\u3400-\u9fff]/u.test(title) ? 'jp' : 'en'}">
      <a class="short-thumb" href="/shorts/${videoId}"></a>
      <a id="video-title" href="/shorts/${videoId}" aria-label="${title}">${title}</a>
    </ytd-reel-item-renderer>`;
}

async function installUserscriptContext(context) {
    const css = readFileSync(CSS_PATH, 'utf8');
    const settings = { ...baseSettings };
    await context.addInitScript(({ css, settings, settingsKey }) => {
        const storage = new Map([[settingsKey, settings]]);
        const storageKey = key => `__yomu_feature_${key}`;
        function readStoredValue(key, fallback) {
            if (storage.has(key)) return storage.get(key);
            return readLocalStorageValue(key, fallback);
        }

        function readLocalStorageValue(key, fallback) {
            try {
                return parseStoredJson(storedJsonForKey(key), fallback);
            } catch {
                return fallback;
            }
        }

        function storedJsonForKey(key) {
            const stored = localStorage.getItem(storageKey(key));
            if (stored !== null) return stored;
            return localStorage.getItem(key);
        }

        function parseStoredJson(stored, fallback) {
            if (stored == null) return fallback;
            return JSON.parse(stored);
        }

        function writeStoredValue(key, value) {
            storage.set(key, value);
            try {
                localStorage.setItem(storageKey(key), JSON.stringify(value));
                localStorage.setItem(key, JSON.stringify(value));
            } catch {
                // Storage can be unavailable on synthetic pages; in-memory is enough.
            }
        }

        function element(selector) {
            return document.querySelector(selector);
        }

        function elementText(selector) {
            const target = element(selector);
            if (!target) return '';
            return target.textContent || '';
        }

        function elementHasClass(selector, className) {
            const target = element(selector);
            if (!target) return false;
            return target.classList.contains(className);
        }

        function elementStyle(selector) {
            const target = element(selector);
            if (!target) return null;
            return getComputedStyle(target);
        }

        function elementVisible(selector) {
            return styleVisible(elementStyle(selector));
        }

        function styleVisible(style) {
            if (!style) return false;
            return styleDisplayVisible(style) && styleOpacityVisible(style);
        }

        function styleDisplayVisible(style) {
            return style.display !== 'none' && style.visibility !== 'hidden';
        }

        function styleOpacityVisible(style) {
            return Number(style.opacity || 1) > 0.01;
        }

        function visibleCardCases(selector) {
            return Array.from(document.querySelectorAll(selector))
                .filter(card => elementVisibleFromElement(card))
                .map(card => card.getAttribute('data-case') || '');
        }

        function hiddenCardCases(selector) {
            return Array.from(document.querySelectorAll(selector))
                .filter(card => !elementVisibleFromElement(card) || card.classList.contains('jpdb-youtube-filtered'))
                .map(card => card.getAttribute('data-case') || '');
        }

        function elementVisibleFromElement(target) {
            if (!target) return false;
            const style = getComputedStyle(target);
            if (!styleVisible(style)) return false;
            const rect = target.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        function visibleExpectedLanguages(selector) {
            return Array.from(document.querySelectorAll(selector))
                .filter(card => elementVisibleFromElement(card))
                .map(card => card.getAttribute('data-expected-language') || '');
        }

        function cardState(selector) {
            const cards = Array.from(document.querySelectorAll(selector));
            const visibleCards = cards.filter(card => elementVisibleFromElement(card));
            const hiddenCards = cards.filter(card => !elementVisibleFromElement(card) || card.classList.contains('jpdb-youtube-filtered'));
            return {
                cards: cards.length,
                visible: visibleCards.length,
                hidden: hiddenCards.length,
                visibleCases: visibleCards.map(card => card.getAttribute('data-case') || ''),
                hiddenCases: hiddenCards.map(card => card.getAttribute('data-case') || ''),
                visibleExpectedLanguages: visibleCards.map(card => card.getAttribute('data-expected-language') || ''),
                pending: cards.filter(card => card.classList.contains('jpdb-youtube-filter-pending')).length,
                filtered: cards.filter(card => card.classList.contains('jpdb-youtube-filtered')).length,
                collapsed: cards.filter(card => card.classList.contains('jpdb-youtube-filter-collapsed')).length,
            };
        }

        function queryCount(selector) {
            return document.querySelectorAll(selector).length;
        }

        function elementRectJson(selector) {
            const target = element(selector);
            if (!target) return null;
            return target.getBoundingClientRect().toJSON();
        }

        function videoRectJson() {
            return elementRectJson('#movie_player') || elementRectJson('video');
        }

        function rowFontSnapshot() {
            const row = element('.jpdb-subtitle-row-text');
            if (!row) return null;
            return styleSnapshot(getComputedStyle(row));
        }

        function styleSnapshot(style) {
            return {
                family: style.fontFamily,
                size: style.fontSize,
                weight: style.fontWeight,
                lineHeight: style.lineHeight,
                textShadow: style.textShadow,
            };
        }
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
        window.__yomuFeatureReadHomepageState = function yomuFeatureReadHomepageState() {
            return {
                cards: queryCount('ytd-rich-item-renderer'),
                readerWordsInGrid: queryCount('ytd-rich-grid-renderer .jpdb-reader-word'),
                filteredEnglish: elementHasClass('ytd-rich-item-renderer[data-case="english"]', 'jpdb-youtube-filtered'),
                englishVisible: elementVisible('ytd-rich-item-renderer[data-case="english"]'),
                visibleJapanese: elementVisible('ytd-rich-item-renderer[data-case="jp"]'),
                noticeText: elementText('.jpdb-youtube-filter-bar'),
            };
        };
        window.__yomuFeatureReadMobileHomeState = function yomuFeatureReadMobileHomeState() {
            return {
                ...cardState('ytm-video-with-context-renderer, ytm-shorts-lockup-view-model'),
                readerWordsInGrid: queryCount('ytm-rich-grid-renderer .jpdb-reader-word'),
                continuationNudges: window.__yomuContinuationNudges || 0,
                visibleJapanese: visibleExpectedLanguages('ytm-video-with-context-renderer, ytm-shorts-lockup-view-model')
                    .filter(language => language === 'jp').length,
                visibleNonJapanese: visibleExpectedLanguages('ytm-video-with-context-renderer, ytm-shorts-lockup-view-model')
                    .filter(language => language && language !== 'jp').length,
            };
        };
        window.__yomuFeatureReadShortsGalleryState = function yomuFeatureReadShortsGalleryState() {
            return {
                ...cardState('ytd-reel-item-renderer, ytm-shorts-lockup-view-model'),
                shelfFiltered: elementHasClass('ytd-rich-shelf-renderer[data-case="gallery-shorts-shelf"]', 'jpdb-youtube-filtered'),
                shelfVisible: elementVisible('ytd-rich-shelf-renderer[data-case="gallery-shorts-shelf"]'),
                readerWordsInGrid: queryCount('ytd-rich-grid-renderer .jpdb-reader-word'),
                visibleJapanese: visibleExpectedLanguages('ytd-reel-item-renderer, ytm-shorts-lockup-view-model')
                    .filter(language => language === 'jp').length,
                visibleNonJapanese: visibleExpectedLanguages('ytd-reel-item-renderer, ytm-shorts-lockup-view-model')
                    .filter(language => language && language !== 'jp').length,
            };
        };
        window.__yomuFeatureReadShortsWatchState = function yomuFeatureReadShortsWatchState() {
            return {
                cards: queryCount('ytd-reel-video-renderer, ytm-shorts-lockup-view-model'),
                filtered: queryCount('.jpdb-youtube-filtered'),
                visible: visibleCardCases('ytd-reel-video-renderer, ytm-shorts-lockup-view-model').length,
                hiddenCases: hiddenCardCases('ytd-reel-video-renderer, ytm-shorts-lockup-view-model'),
            };
        };
        window.__yomuFeatureReadWatchState = function yomuFeatureReadWatchState() {
            return {
                rows: queryCount('.jpdb-subtitle-list-row'),
                parsedRowWords: queryCount('.jpdb-subtitle-row-text .jpdb-reader-word'),
                parsedPlayerWords: queryCount('.jpdb-subtitle-primary .jpdb-reader-word'),
                descriptionWords: queryCount('ytd-watch-metadata #description-inline-expander .jpdb-reader-word'),
                commentWords: queryCount('ytd-comment-view-model #content-text .jpdb-reader-word'),
                titleWords: queryCount('ytd-watch-metadata h1 .jpdb-reader-word, ytd-watch-metadata #title .jpdb-reader-word'),
                sidebarReaderWords: queryCount('#secondary .jpdb-reader-word, ytd-compact-video-renderer .jpdb-reader-word'),
                rowCopyButtons: queryCount('.jpdb-subtitle-row-copy'),
                rowFont: rowFontSnapshot(),
                layout: {
                    placement: element('.jpdb-subtitle-player')?.dataset.transcriptPlacement ?? '',
                    panel: elementRectJson('.jpdb-subtitle-list'),
                    video: videoRectJson(),
                    viewport: { width: window.innerWidth, height: window.innerHeight },
                },
            };
        };
    }, { css, settings, settingsKey: SETTINGS_KEY });
    await context.addInitScript({ path: USERSCRIPT_PATH });
}

async function installRoutes(page) {
    await page.route('https://www.youtube.com/', route => route.fulfill({ body: youtubeHomeHtml(), contentType: 'text/html' }));
    await page.route('https://m.youtube.com/', route => route.fulfill({ body: youtubeMobileHomeHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/feed/shorts', route => route.fulfill({ body: youtubeShortsGalleryHtml(), contentType: 'text/html' }));
    await page.route('https://m.youtube.com/feed/shorts', route => route.fulfill({ body: youtubeShortsGalleryHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/shorts/watch-en', route => route.fulfill({ body: youtubeShortsWatchHtml(), contentType: 'text/html' }));
    await page.route('https://m.youtube.com/shorts/watch-en', route => route.fulfill({ body: youtubeShortsWatchHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/oembed**', route => route.fulfill({
        body: JSON.stringify({ title: youtubeOEmbedTitleForRequest(route.request().url()) }),
        contentType: 'application/json',
    }));
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

const YOUTUBE_OEMBED_TITLES = {
    'mweb-original-jp': '朝のルーティン',
    'mweb-en': 'Desk setup tour',
    'short-en': 'Gym routine Short',
    'gallery-en': 'Morning gym routine',
    'gallery-mobile-en': 'Desk accessories short',
    'loaded-video-en': 'Productivity desk tour',
};

function youtubeOEmbedTitleForRequest(url) {
    const requestUrl = new URL(url);
    const watchUrl = new URL(youtubeOEmbedWatchUrl(requestUrl));
    return YOUTUBE_OEMBED_TITLES[youtubeVideoIdFromUrl(watchUrl)] ?? '';
}

function youtubeOEmbedWatchUrl(requestUrl) {
    return requestUrl.searchParams.get('url') ?? 'https://www.youtube.com/watch';
}

function youtubeVideoIdFromUrl(watchUrl) {
    return watchUrl.searchParams.get('v') || watchUrl.pathname.split('/').filter(Boolean).pop() || '';
}

async function runHomepageCheck(page) {
    await page.setViewportSize({ width: 1600, height: 1000 });
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

async function runMobileHomeLoadingCheck(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(MOBILE_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('ytm-video-with-context-renderer[data-case="mobile-jp"]', { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight));
    await page.waitForFunction(() => window.__yomuContinuationNudges >= 1, null, { timeout: 10000 });
    await page.waitForFunction(() => {
        const state = window.__yomuFeatureReadMobileHomeState();
        return state.pending === 0 && state.visibleJapanese >= 5;
    }, null, { timeout: 12000 });
    await page.waitForTimeout(350);

    const mobileHome = await page.evaluate(() => window.__yomuFeatureReadMobileHomeState());
    assert(mobileHome.readerWordsInGrid === 0, 'Yomu wrapped mobile YouTube recommendation titles', mobileHome);
    assert(mobileHome.continuationNudges >= 1, 'YouTube mobile feed did not request more cards after filtering', mobileHome);
    assert(mobileHome.visibleJapanese >= 5, 'YouTube mobile feed did not refill with enough Japanese-looking cards', mobileHome);
    assert(mobileHome.visibleNonJapanese === 0, 'YouTube mobile feed still shows non-Japanese-looking cards', mobileHome);
    assert(includesText(mobileHome.visibleCases.join(','), 'mobile-original-jp'), 'Original Japanese oEmbed title did not restore a translated mobile card', mobileHome);
    assert(includesText(mobileHome.hiddenCases.join(','), 'mobile-english'), 'Mobile English video was not hidden', mobileHome);
    assert(includesText(mobileHome.hiddenCases.join(','), 'mobile-short-en'), 'Mobile English Short was not hidden', mobileHome);
    assert(includesText(mobileHome.hiddenCases.join(','), 'loaded-video-en'), 'Continuation English video was not hidden', mobileHome);
    return mobileHome;
}

async function runShortsGalleryCheck(page) {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(SHORTS_GALLERY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('ytd-reel-item-renderer[data-case="gallery-jp-1"]', { timeout: 10000 });
    await page.waitForFunction(() => {
        const state = window.__yomuFeatureReadShortsGalleryState();
        return state.pending === 0 && state.visibleJapanese >= 3;
    }, null, { timeout: 12000 });
    await page.waitForTimeout(350);

    const shortsGallery = await page.evaluate(() => window.__yomuFeatureReadShortsGalleryState());
    assert(shortsGallery.shelfVisible === true && shortsGallery.shelfFiltered === false, 'Shorts gallery shelf was hidden instead of filtering child Shorts', shortsGallery);
    assert(shortsGallery.readerWordsInGrid === 0, 'Yomu wrapped Shorts gallery titles', shortsGallery);
    assert(shortsGallery.visibleJapanese >= 3, 'Shorts gallery did not keep Japanese-looking Shorts visible', shortsGallery);
    assert(shortsGallery.visibleNonJapanese === 0, 'Shorts gallery still shows non-Japanese-looking Shorts', shortsGallery);
    assert(includesText(shortsGallery.hiddenCases.join(','), 'gallery-en'), 'Desktop English Short was not hidden', shortsGallery);
    assert(includesText(shortsGallery.hiddenCases.join(','), 'gallery-mobile-en'), 'Mobile English Short card was not hidden', shortsGallery);
    return shortsGallery;
}

async function runShortsWatchCheck(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SHORTS_WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('ytd-reel-video-renderer[data-case="shorts-watch-current"]', { timeout: 10000 });
    await page.waitForTimeout(700);

    const shortsWatch = await page.evaluate(() => window.__yomuFeatureReadShortsWatchState());
    assert(shortsWatch.cards === 1, 'Shorts watch feed did not render the snap item', shortsWatch);
    assert(shortsWatch.filtered === 0, 'Shorts watch feed was filtered, which would break snap scrolling', shortsWatch);
    assert(shortsWatch.visible === 1, 'Shorts watch feed item is not visible', shortsWatch);
    return shortsWatch;
}

async function runWatchCheck(page) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await waitForWatchFeatureReady(page);
    const initial = await readWatchState(page);
    assertInitialWatchState(initial);

    const idleControls = await closePanelAndReadIdleControls(page);
    assertIdleControls(idleControls);

    const resize = await exerciseWatchPanelResize(page);
    const dictionary = await verifyTeacherCommentLookup(page);

    return {
        initial,
        idleControls,
        beforeResize: resize.beforeResize,
        afterResize: resize.afterResize,
        dictionary,
    };
}

async function waitForWatchFeatureReady(page) {
    await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 12000 });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length >= 3, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length > 0, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('ytd-watch-metadata #description-inline-expander .jpdb-reader-word').length > 0
        && document.querySelectorAll('ytd-comment-view-model #content-text .jpdb-reader-word').length > 0, null, { timeout: 30000 });
}

async function readWatchState(page) {
    return page.evaluate(() => window.__yomuFeatureReadWatchState());
}

function assertInitialWatchState(initial) {
    assertWatchTranscriptState(initial);
    assertWatchPageParsing(initial);
    assertWatchTextExclusions(initial);
    assertWatchRowPresentation(initial);
    assertNonOverlappingLayout(initial.layout, 'initial');
}

function assertWatchTranscriptState(initial) {
    assert(initial.rows >= 3, 'YouTube transcript rows did not render', initial);
    assert(initial.parsedRowWords > 0, 'YouTube transcript rows were not parsed into reader words', initial);
    assert(initial.parsedPlayerWords > 0, 'YouTube player subtitle was not parsed into reader words', initial);
    assert(initial.rowCopyButtons >= 1, 'YouTube transcript copy buttons are missing', initial);
}

function assertWatchPageParsing(initial) {
    assert(initial.descriptionWords > 0, 'YouTube watch description was not parsed', initial);
    assert(initial.commentWords > 0, 'YouTube comment text was not parsed', initial);
}

function assertWatchTextExclusions(initial) {
    assert(initial.titleWords === 0, 'Yomu wrapped the YouTube watch title', initial);
    assert(initial.sidebarReaderWords === 0, 'Yomu wrapped YouTube sidebar recommendation text', initial);
}

function assertWatchRowPresentation(initial) {
    assert(rowFontSize(initial.rowFont) === '16px', 'YouTube sidebar subtitle font size does not match dictionary scale', initial);
    assert(rowFontWeight(initial.rowFont) <= 500, 'YouTube sidebar subtitle font is still too bold', initial);
    assert(rowFontShadow(initial.rowFont) === 'none', 'YouTube sidebar subtitle text still has player-style shadow', initial);
}

function rowFontSize(rowFont) {
    return rowFont ? rowFont.size : '';
}

function rowFontWeight(rowFont) {
    if (!rowFont) return 999;
    return Number(rowFont.weight);
}

function rowFontShadow(rowFont) {
    return rowFont ? rowFont.textShadow : '';
}

async function closePanelAndReadIdleControls(page) {
    await page.locator('.jpdb-subtitle-list [data-action="close-panel"]').click();
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 6000 });
    await page.mouse.move(4, 4);
    await page.waitForTimeout(350);
    return readIdleControls(page);
}

async function readIdleControls(page) {
    const rootClasses = await page.locator('.jpdb-subtitle-player').evaluate(element => element.className).catch(() => '');
    const rail = await page.locator('.jpdb-subtitle-rail').evaluate(element => {
        const style = getComputedStyle(element);
        return {
            railOpacity: style.opacity,
            railPointerEvents: style.pointerEvents,
            railTransform: style.transform,
        };
    }).catch(() => ({ railOpacity: '', railPointerEvents: '', railTransform: '' }));
    return { rootClasses, ...rail };
}

function assertIdleControls(idleControls) {
    assert(includesText(idleControls.rootClasses, 'jpdb-subtitle-controls-idle'), 'YouTube subtitle controls did not enter idle mode', idleControls);
    assert(Number(idleControls.railOpacity) < 0.05, 'YouTube idle mode did not hide the whole control rail', idleControls);
    assert(idleControls.railPointerEvents === 'none', 'Hidden YouTube control rail still receives pointer events', idleControls);
}

async function exerciseWatchPanelResize(page) {
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click({ force: true });
    await page.waitForFunction(() => !document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 6000 });
    const beforeResize = await readWatchState(page);
    await resizePanel(page, resizePlacement(beforeResize.layout));
    const afterResize = await readWatchState(page);
    assertResizedPanelLayout(beforeResize.layout, afterResize.layout);
    return { beforeResize: beforeResize.layout, afterResize: afterResize.layout };
}

function resizePlacement(layout) {
    return layout.placement || 'right';
}

function assertResizedPanelLayout(beforeResize, afterResize) {
    assertNonOverlappingLayout(afterResize, 'resized');
    assert(panelWidthChanged(beforeResize, afterResize), 'YouTube transcript panel did not resize', { beforeResize, afterResize });
}

function panelWidthChanged(beforeResize, afterResize) {
    return Math.abs(panelWidth(afterResize) - panelWidth(beforeResize)) >= 20;
}

function panelWidth(layout) {
    return layout.panel ? layout.panel.width : 0;
}

async function verifyTeacherCommentLookup(page) {
    await clickTeacherCommentWord(page);
    const dictionary = await readDictionaryState(page);
    assert(dictionary.spelling === '先生', 'Clicking a single YouTube comment word opened the wrong dictionary entry', dictionary);
    assert(dictionary.copyPill, 'Dictionary copy pill is missing for YouTube comment lookup', dictionary);
    return dictionary;
}

async function readDictionaryState(page) {
    const [spelling, copyPillCount] = await Promise.all([
        page.locator('.jpdb-reader-popover .jpdb-reader-spelling').first().textContent(),
        page.locator('.jpdb-reader-popover .jpdb-reader-copy-pill').count(),
    ]);
    return { spelling: trimText(spelling), copyPill: copyPillCount > 0 };
}

function trimText(value) {
    return String(value ?? '').trim();
}

function includesText(value, fragment) {
    return String(value).includes(fragment);
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
    assertLayoutBox(layout.panel, `Missing YouTube layout boxes during ${label}`, layout);
    assertLayoutBox(layout.video, `Missing YouTube layout boxes during ${label}`, layout);
    assertUsableBox(layout.panel, 260, 100, `Transcript panel is unusably small during ${label}`, layout);
    assertUsableBox(layout.video, 240, 120, `Video is unusably small during ${label}`, layout);
    assert(!layoutBoxesOverlap(layout.panel, layout.video), `Transcript panel overlaps/crops the YouTube video during ${label}`, layout);
}

function assertLayoutBox(box, message, layout) {
    assert(box, message, layout);
}

function assertUsableBox(box, minWidth, minHeight, message, layout) {
    assert(box.width >= minWidth, message, layout);
    assert(box.height >= minHeight, message, layout);
}

function layoutBoxesOverlap(first, second) {
    return boxesOverlapHorizontally(first, second) && boxesOverlapVertically(first, second);
}

function boxesOverlapHorizontally(first, second) {
    return first.right > second.left + 2 && second.right > first.left + 2;
}

function boxesOverlapVertically(first, second) {
    return first.bottom > second.top + 2 && second.bottom > first.top + 2;
}

const browser = await chromium.launch({ headless: !HEADED });
try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'en-GB' });
    await installUserscriptContext(context);
    const page = await context.newPage();
    await installRoutes(page);
    const homepage = await runHomepageCheck(page);
    const watch = await runWatchCheck(page);
    const mobileHome = await runMobileHomeLoadingCheck(page);
    const shortsGallery = await runShortsGalleryCheck(page);
    const shortsWatch = await runShortsWatchCheck(page);
    console.log(JSON.stringify({ homepage, watch, mobileHome, shortsGallery, shortsWatch }, null, 2));
} finally {
    await browser.close();
}
