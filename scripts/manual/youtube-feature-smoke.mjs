import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { assert, japaneseSmokeLookupLinks, YOMU_STUDY_SEARCH_URL } from '../lib/smoke-harness.mjs';
import { addUserscriptGraphInitScripts } from '../lib/smoke-test-helpers.mjs';
import { waitForYoutubeTranscriptRows } from '../lib/smoke-wait-helpers.mjs';
import { dragTranscriptResizeHandle } from '../lib/subtitle-layout-test-utils.mjs';
import { youtubePlayerResponse, youtubeTimedText, youtubeWatchHtml } from '../fixtures/youtube-fixtures.mjs';

const USERSCRIPT_PATH = resolve(process.env.YOMU_YOUTUBE_FEATURE_USERSCRIPT ?? 'dist/yomu.user.js');
const CSS_PATH = resolve(process.env.YOMU_YOUTUBE_FEATURE_CSS ?? 'dist/yomu.css');
const HEADED = process.env.YOMU_YOUTUBE_FEATURE_HEADED === '1';

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const WATCH_URL = 'https://www.youtube.com/watch?v=feature123';
const HOME_URL = 'https://www.youtube.com/';
const MOBILE_HOME_URL = 'https://m.youtube.com/';
const SHORTS_GALLERY_URL = 'https://www.youtube.com/feed/shorts';
const SHORTS_WATCH_URL = 'https://www.youtube.com/shorts/watch-en';
const LONG_CHANNEL_PREVIEW_DESCRIPTION = 'This actual YouTube channel description is intentionally long enough to mimic a hydrated channel profile bio and must not replace the compact Yomu recommendation summary.';
const THUMBNAIL_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const THUMBNAIL_OCR_LINES = '[{"text":"日本語サムネ","box":{"left":0.1,"top":0.2,"width":0.45,"height":0.18}}]';

const baseSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: false,
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordUnderlineColorSource: 'pitch',
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    youtubeShowChannelRecommendations: true,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptVisible: true,
    subtitleTranscriptAutoScroll: false,
    subtitleControlsMode: 'auto',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'jpdb',
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrVideoPauseFrames: true,
    ocrShowTextOverlay: true,
    ocrProvider: 'google-lens',
    ocrMinImageArea: 1,
    ocrMaxImagesPerPage: 5,
    ocrPrefetchMargin: 0,
    dictionaryLookupLinks: japaneseSmokeLookupLinks(),
};

const youtubeTimedTextFixture = youtubeTimedText([
    { start: 0, duration: 1800, text: '先生いつもありがとうございました。' },
    { start: 2200, duration: 1800, text: '日本語の字幕を確認します。' },
    { start: 4500, duration: 1800, text: '梅干しをセロハンテープで貼る話。' },
]);

const youtubePublicPitchHtml = `
<div class="results search">
  ${publicPitchResult(32022, '会話', 'かいわ', ['か', 'いわ'])}
  ${publicPitchResult(27492, 'チャット', 'チャット', ['チャ', 'ット'])}
</div>`;

function publicPitchResult(id, spelling, reading, [low, high]) {
    const encodedSpelling = encodeURIComponent(spelling);
    const encodedReading = encodeURIComponent(reading);
    return `<div class="result vocabulary">
      <a href="/vocabulary/${id}/${encodedSpelling}/${encodedReading}#a">${spelling}</a>
      <div class="subsection-headword"><div class="primary-spelling"><div class="spelling"><ruby>${spelling}<rt>${reading}</rt></ruby></div></div></div>
      <div class="subsection-pitch-accent"><div class="subsection"><div><div>
        <div style="background-image:linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e))"><div>${low}</div></div>
        <div style="background-image:linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e))"><div>${high}</div></div>
      </div></div></div></div>
    </div>`;
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
    .thumb { display: block; width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; background: #3b3b3b; overflow: hidden; }
    .thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
    #video-title-link { display: block; margin-top: 12px; color: #f1f1f1; text-decoration: none; font-size: 18px; line-height: 1.35; font-weight: 600; }
    .meta { color: #aaa; margin-top: 6px; }
  </style>
  <script>
    window.ytcfg = {
      get: key => ({
        INNERTUBE_API_KEY: 'test-key',
        INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
        INNERTUBE_CLIENT_NAME: '1',
        INNERTUBE_CLIENT_VERSION: 'test-version',
        VISITOR_DATA: 'visitor',
      })[key],
    };
  </script>
</head>
<body>
  <ytd-app>
    <header><strong>YouTube Premium</strong><input aria-label="Search" placeholder="Search"></header>
    <div id="chips"><button>All</button><button>Podcasts</button><button>Japanese</button></div>
    <ytd-rich-grid-renderer>
      <ytd-rich-item-renderer data-case="jp">
        ${desktopThumbnail('jp')}
        <a id="video-title-link" href="/watch?v=jp" aria-label="服代が月1万から20万円！？東京の春コーデ">服代が月1万から20万円！？東京の春コーデ</a>
        <div class="meta">JAPAN STREET STYLE</div>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer data-case="english">
        ${desktopThumbnail('en')}
        <a id="video-title-link" href="/watch?v=en" aria-label="Minimal desk setup tour">Minimal desk setup tour</a>
        <div class="meta">Desk Channel</div>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer data-case="mixed">
        ${desktopThumbnail('mix')}
        <a id="video-title-link" href="/watch?v=mix" aria-label="弱いままの自分で大丈夫 Japanese Podcast">弱いままの自分で大丈夫。Japanese Podcast</a>
        <div class="meta">Emma Japanese</div>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer data-case="grammar">
        ${desktopThumbnail('grammar')}
        <a id="video-title-link" href="/watch?v=grammar" aria-label="JLPT N4 course しかない">JLPT N4 course「しかない」</a>
        <div class="meta">Nihongo Mori</div>
      </ytd-rich-item-renderer>
    </ytd-rich-grid-renderer>
  </ytd-app>
</body>
</html>`;
}

function desktopThumbnail(videoId) {
    return `<ytd-thumbnail><a class="thumb" href="/watch?v=${videoId}"><img src="${THUMBNAIL_DATA_URL}" alt="" data-ocr-lines='${THUMBNAIL_OCR_LINES}'></a></ytd-thumbnail>`;
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
    // Native YouTube loads the next page when its own IntersectionObserver sees
    // the continuation loader scroll into view. Yomu deliberately no longer
    // force-scrolls the loader (that jumped the mobile feed to Shorts and stuck
    // desktop on skeleton placeholders), so the smoke drives the next batch the
    // same way the browser does: observe the loader and refill once the user's
    // scroll brings it into the viewport.
    const loadMobileBatch = () => {
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
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMobileBatch();
      });
      observer.observe(continuation);
    } else {
      window.addEventListener('scroll', () => {
        if (continuation.getBoundingClientRect().top <= window.innerHeight) loadMobileBatch();
      }, { passive: true });
    }
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
    const playerResponse = youtubePlayerResponse('watch-en');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Shorts Watch</title>
  <style>
    html, body { margin: 0; background: #000; color: #fff; font-family: Roboto, Arial, sans-serif; }
    ytd-shorts { display: block; height: 100vh; overflow-y: scroll; scroll-snap-type: y mandatory; }
    ytd-reel-video-renderer { position: relative; display: block; height: 100vh; scroll-snap-align: start; }
    #movie_player { position: absolute; inset: 16px 15px; overflow: hidden; border-radius: 18px; background: #151515; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #151515; }
    .shorts-native-action { position: absolute; right: 12px; z-index: 5; width: 48px; height: 48px; border: 0; border-radius: 50%; color: white; background: #333; font-size: 20px; }
    .shorts-native-action-label { display: block; max-width: 28px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; font-size: 12px; }
    #shorts-share { bottom: 104px; }
    #shorts-fullscreen { bottom: 42px; }
    #video-title { position: absolute; left: 18px; right: 76px; bottom: 24px; z-index: 4; display: block; color: white; }
  </style>
  <script>window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>
</head>
<body>
  <ytd-shorts>
    <ytd-reel-video-renderer data-case="shorts-watch-current" class="jpdb-youtube-filtered" data-yomu-youtube-filtered="true">
      <div id="movie_player" class="html5-video-player ytp-autohide">
        <video class="html5-main-video" controls muted></video>
        <ytd-reel-player-overlay-renderer>
          <button id="shorts-share" class="shorts-native-action" type="button" aria-label="共有"><span id="shorts-share-label" class="shorts-native-action-label">共有</span></button>
          <button id="shorts-fullscreen" class="shorts-native-action" type="button" aria-label="Fullscreen">⛶</button>
        </ytd-reel-player-overlay-renderer>
      </div>
      <a id="video-title" href="/shorts/watch-en">English short in snap feed</a>
    </ytd-reel-video-renderer>
    <ytd-reel-video-renderer data-case="shorts-watch-next-en" data-expected-language="en">
      <a id="video-title" href="/shorts/watch-next-en">Desk setup Short</a>
    </ytd-reel-video-renderer>
    <ytd-reel-video-renderer data-case="shorts-watch-next-jp" data-expected-language="jp">
      <a id="video-title" href="/shorts/watch-next-jp">大阪で食べ歩き</a>
    </ytd-reel-video-renderer>
  </ytd-shorts>
  <script>
    window.__shortsNativeClicks = { share: 0, fullscreen: 0 };
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 720 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1280 });
    player.getVideoData = () => ({ video_id: 'watch-en' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    document.querySelector('#shorts-share').addEventListener('click', () => { window.__shortsNativeClicks.share += 1; });
    document.querySelector('#shorts-fullscreen').addEventListener('click', () => { window.__shortsNativeClicks.fullscreen += 1; });
  </script>
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

function youtubeFeatureBootstrap({ css, settings, settingsKey }) {
    const storage = new Map([[settingsKey, settings]]);
    const valueChangeListeners = new Map();
    let nextValueChangeListenerId = 1;
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

    function notifyStoredValueChange(key, oldValue, newValue) {
        for (const subscription of valueChangeListeners.values()) {
            if (subscription.key === key) subscription.listener(key, oldValue, newValue, false);
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

    function readerWordsInSurface(selector) {
        return readerWordsForSurface(selector).size;
    }

    function readerWordsForSurface(selector) {
        const surfaces = Array.from(document.querySelectorAll(selector));
        const words = new Set(inlineReaderWords(surfaces));
        portalReaderWords(decoratedSources(surfaces)).forEach(word => words.add(word));
        return words;
    }

    function inlineReaderWords(surfaces) {
        return surfaces
            .flatMap(surface => Array.from(surface.querySelectorAll('.jpdb-reader-word')))
            .filter(effectivelyVisible);
    }

    function decoratedSources(surfaces) {
        return surfaces
            .flatMap(decoratedSourcesWithin)
            .filter(source => source.isConnected && effectivelyVisible(source));
    }

    function decoratedSourcesWithin(surface) {
        const sources = Array.from(surface.querySelectorAll('[data-yomu-decoration]'));
        if (surface.matches('[data-yomu-decoration]')) sources.unshift(surface);
        return sources;
    }

    function portalReaderWords(sources) {
        return Array.from(document.querySelectorAll('.jpdb-reader-document-annotation-portal'))
            .filter(effectivelyVisible)
            .flatMap(mirror => portalReaderWordsForSources(mirror, sources));
    }

    function portalReaderWordsForSources(mirror, sources) {
        const mirrorSourceText = normalizedSourceIdentity(
            mirror.getAttribute('data-yomu-host-source-text') ?? mirror.getAttribute('data-source-text'),
        );
        const matchingSources = sources.filter(source => nativeSourceIdentity(source) === mirrorSourceText);
        return Array.from(mirror.querySelectorAll('.jpdb-reader-word'))
            .filter(word => matchingSources.some(source => projectedWordMatchesSource(word, source)));
    }

    function projectedWordMatchesSource(word, source) {
        if (!effectivelyVisible(word)) return false;
        const sourceRects = sourceRangeRects(source);
        if (!sourceRects.length) return false;
        const fragments = Array.from(word.querySelectorAll('.jpdb-reader-source-fragment'));
        const projectedRects = (fragments.length ? fragments : [word])
            .filter(effectivelyVisible)
            .map(element => element.getBoundingClientRect())
            .filter(nonEmptyRect);
        return sourceRects.some(sourceRect => projectedRects.some(projectedRect => rectsOverlap(sourceRect, projectedRect)));
    }

    function sourceRangeRects(source) {
        const nodes = nativeSourceTextNodes(source);
        const first = nodes[0];
        const last = nodes.at(-1);
        if (!first || !last) return [];
        const range = document.createRange();
        range.setStart(first, 0);
        range.setEnd(last, last.data.length);
        return Array.from(range.getClientRects()).filter(nonEmptyRect);
    }

    function nativeSourceTextNodes(source) {
        const nodes = [];
        const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const owner = node.parentElement;
            if (owner?.closest('[data-jpdb-reader-root="true"], [data-jpdb-reader-text-mirror="true"]')) continue;
            nodes.push(node);
        }
        return nodes;
    }

    function nativeSourceIdentity(source) {
        return normalizedSourceIdentity(nativeSourceTextNodes(source).map(node => node.data).join(''));
    }

    function normalizedSourceIdentity(text) {
        return String(text || '').replace(/\s+/gu, ' ').trim();
    }

    function effectivelyVisible(element) {
        const styles = [];
        for (let current = element; current; current = current.parentElement) {
            styles.push(getComputedStyle(current));
        }
        return !styles.some(styleConcealsElement);
    }

    function styleConcealsElement(style) {
        return style.display === 'none'
            || style.visibility !== 'visible'
            || Number(style.opacity || 1) <= 0.01;
    }

    function nonEmptyRect(rect) {
        return rect.width > 0 && rect.height > 0;
    }

    function rectsOverlap(left, right) {
        const tolerance = 1;
        return left.right >= right.left - tolerance
            && right.right >= left.left - tolerance
            && left.bottom >= right.top - tolerance
            && right.bottom >= left.top - tolerance;
    }

    window.__yomuFeatureReaderWordsInSurface = readerWordsInSurface;

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
    function wordStyleSnapshot(selector) {
        const target = element(selector);
        return wordStyleSnapshotForTarget(target);
    }
    function surfaceWordStyleSnapshot(selector) {
        const target = readerWordsForSurface(selector).values().next().value || null;
        return wordStyleSnapshotForTarget(target);
    }
    function wordStyleSnapshotForTarget(target) {
        if (!target) return null;
        const style = getComputedStyle(target);
        return {
            className: target.className,
            pitchClass: target.getAttribute('data-pitch-class') || '',
            decorationColor: style.textDecorationColor,
            afterBorderColor: getComputedStyle(target, '::after').borderBlockEndColor,
            text: target.textContent?.replace(/\s+/g, '').trim() || '',
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
    window.GM_setValue = (key, value) => {
        const oldValue = readStoredValue(key);
        writeStoredValue(key, value);
        notifyStoredValueChange(key, oldValue, value);
    };
    window.GM_deleteValue = key => {
        const oldValue = readStoredValue(key);
        storage.delete(key);
        try {
            localStorage.removeItem(storageKey(key));
            localStorage.removeItem(key);
        } catch {
            // Ignore.
        }
        notifyStoredValueChange(key, oldValue, undefined);
    };
    window.GM_listValues = () => [...storage.keys()];
    window.GM_addValueChangeListener = (key, listener) => {
        const id = nextValueChangeListenerId++;
        valueChangeListeners.set(id, { key, listener });
        return id;
    };
    window.GM_removeValueChangeListener = id => { valueChangeListeners.delete(id); };
    window.GM_registerMenuCommand = () => undefined;
    window.__yomuFeatureOpenedTabs = [];
    window.GM_openInTab = (url, options) => {
        window.__yomuFeatureOpenedTabs.push({ url: String(url), options });
        return { close: () => undefined };
    };
    window.open = (url, target, features) => {
        window.__yomuFeatureOpenedTabs.push({ url: String(url), options: { target, features, via: 'window.open' } });
        return { opener: null, close: () => undefined };
    };
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
        openInTab: window.GM_openInTab,
        xmlHttpRequest: window.GM_xmlhttpRequest,
    };
    // One browser snapshot owns the complete desktop-home acceptance surface.
    // fallow-ignore-next-line complexity
    window.__yomuFeatureReadHomepageState = function yomuFeatureReadHomepageState() {
        const channelDescriptions = Array.from(document.querySelectorAll('.jpdb-youtube-channel-description'))
            .map(element => element.textContent?.trim() || '');
        const notice = document.querySelector('.jpdb-youtube-filter-bar');
        const noticeSummary = notice?.querySelector('[data-role="summary"]') ?? null;
        const noticeSummaryStyle = noticeSummary ? getComputedStyle(noticeSummary) : null;
        return {
            cards: queryCount('ytd-rich-item-renderer'),
            // Source-preserving titles paint through a body-mounted portal,
            // so DOM ancestry is not the rendered-surface contract. Count
            // both inline words and portals aligned to the source's live Range.
            readerWordsInGrid: readerWordsInSurface('ytd-rich-grid-renderer'),
            readerWordsByJapaneseCase: Object.fromEntries(['jp', 'mixed', 'grammar'].map(caseName => [
                caseName,
                readerWordsInSurface(`ytd-rich-item-renderer[data-case="${caseName}"]`),
            ])),
            ocrLines: queryCount('.jpdb-ocr-line'),
            ocrLayers: queryCount('.jpdb-ocr-layer'),
            filteredEnglish: elementHasClass('ytd-rich-item-renderer[data-case="english"]', 'jpdb-youtube-filtered'),
            englishVisible: elementVisible('ytd-rich-item-renderer[data-case="english"]'),
            visibleJapanese: elementVisible('ytd-rich-item-renderer[data-case="jp"]'),
            noticeText: elementText('.jpdb-youtube-filter-bar'),
            noticeAriaLabel: notice?.getAttribute('aria-label') ?? '',
            noticeButtons: Array.from(notice?.querySelectorAll('button') ?? [])
                .map(button => button.textContent?.trim() || ''),
            noticeSummaryScreenReaderOnly: Boolean(noticeSummary?.classList.contains('jpdb-reader-sr-only')),
            noticeSummaryVisuallyHidden: Boolean(noticeSummaryStyle
                && noticeSummaryStyle.position === 'absolute'
                && noticeSummaryStyle.width === '1px'
                && noticeSummaryStyle.height === '1px'
                && noticeSummaryStyle.overflow === 'hidden'),
            channelNames: Array.from(document.querySelectorAll('.jpdb-youtube-channel-name'))
                .map(element => element.textContent?.trim() || ''),
            channelDescriptions,
            longChannelPreviewDescriptions: channelDescriptions
                .filter(text => text.includes('actual YouTube channel description')),
        };
    };
    window.__yomuFeatureReadMobileHomeState = function yomuFeatureReadMobileHomeState() {
        return {
            ...cardState('ytm-video-with-context-renderer, ytm-shorts-lockup-view-model'),
            readerWordsInGrid: readerWordsInSurface('ytm-rich-grid-renderer'),
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
            readerWordsInGrid: readerWordsInSurface('ytd-rich-grid-renderer'),
            visibleJapanese: visibleExpectedLanguages('ytd-reel-item-renderer, ytm-shorts-lockup-view-model')
                .filter(language => language === 'jp').length,
            visibleNonJapanese: visibleExpectedLanguages('ytd-reel-item-renderer, ytm-shorts-lockup-view-model')
                .filter(language => language && language !== 'jp').length,
        };
    };
    // One browser snapshot owns the whole Shorts watch acceptance surface.
    // fallow-ignore-next-line complexity
    window.__yomuFeatureReadShortsWatchState = function yomuFeatureReadShortsWatchState() {
        const subtitleRoot = element('.jpdb-subtitle-player');
        const rail = element('.jpdb-subtitle-rail');
        const grip = element('.jpdb-subtitle-rail [data-action="rail-expand"]');
        return {
            cards: queryCount('ytd-reel-video-renderer, ytm-shorts-lockup-view-model'),
            filtered: queryCount('.jpdb-youtube-filtered'),
            visible: visibleCardCases('ytd-reel-video-renderer, ytm-shorts-lockup-view-model').length,
            hiddenCases: hiddenCardCases('ytd-reel-video-renderer, ytm-shorts-lockup-view-model'),
            visibleCases: visibleCardCases('ytd-reel-video-renderer, ytm-shorts-lockup-view-model'),
            visibleJapanese: visibleExpectedLanguages('ytd-reel-video-renderer, ytm-shorts-lockup-view-model')
                .filter(language => language === 'jp').length,
            visibleNonCurrentEnglish: visibleCardCases('ytd-reel-video-renderer, ytm-shorts-lockup-view-model')
                .filter(caseName => caseName !== 'shorts-watch-current')
                .map(caseName => document.querySelector(`[data-case="${caseName}"]`)?.dataset.expectedLanguage)
                .filter(language => language === 'en').length,
            documentClasses: document.documentElement.className,
            parsedPlayerWords: queryCount('.jpdb-subtitle-primary .jpdb-reader-word'),
            nativeSafeZoneWords: queryCount('.jpdb-subtitle-player .jpdb-reader-word[data-jpdb-subtitle-native-control-safe-zone="true"]'),
            nativeClicks: { ...(window.__shortsNativeClicks || {}) },
            shareLabelSourceText: document.querySelector('#shorts-share-label')?.firstChild?.textContent || '',
            shareLabelAnnotationWords: queryCount('#shorts-share-label .jpdb-reader-text-mirror .jpdb-reader-word'),
            shareLabelMirrors: queryCount('#shorts-share-label .jpdb-reader-text-mirror'),
            shareLabelOverflows: (() => {
                const label = document.querySelector('#shorts-share-label');
                return label instanceof HTMLElement && label.scrollWidth > label.clientWidth + 1;
            })(),
            nativeControlRects: {
                share: elementRectJson('#shorts-share'),
                fullscreen: elementRectJson('#shorts-fullscreen'),
            },
            storedRailPosition: window.GM_getValue?.('jpdb-reader-subtitle-control-rail-position', null) ?? null,
            rail: {
                rootClasses: subtitleRoot?.className || '',
                rect: rail?.getBoundingClientRect().toJSON() || null,
                left: rail?.style.left || '',
                top: rail?.style.top || '',
                gripVisible: Boolean(grip && elementVisibleFromElement(grip)),
                gripExpanded: grip?.getAttribute('aria-expanded') || '',
            },
            items: [...document.querySelectorAll('ytd-reel-video-renderer, ytm-shorts-lockup-view-model')].map(card => ({
                caseName: card.dataset.case,
                className: card.className,
                text: card.textContent?.trim(),
                href: card.querySelector('a[href]')?.getAttribute('href'),
                rect: card.getBoundingClientRect().toJSON(),
            })),
        };
    };
    window.__yomuFeatureReadWatchState = function yomuFeatureReadWatchState() {
        return {
            rows: queryCount('.jpdb-subtitle-list-row'),
            parsedRowWords: queryCount('.jpdb-subtitle-row-text .jpdb-reader-word'),
            parsedPlayerWords: queryCount('.jpdb-subtitle-primary .jpdb-reader-word'),
            descriptionWords: readerWordsInSurface('ytd-watch-metadata #description-inline-expander'),
            commentWords: readerWordsInSurface('ytd-comment-view-model #content-text'),
            commentMorePassive: element('ytd-comment-view-model .more-button .jpdb-reader-word')?.dataset.jpdbReaderPassive === 'true',
            commentTranslatePassive: element('ytd-comment-view-model ytd-tri-state-button-view-model .jpdb-reader-word')?.dataset.jpdbReaderPassive === 'true',
            liveChatWords: readerWordsInSurface('yt-live-chat-text-message-renderer'),
            liveChatButtonPassive: element('yt-live-chat-text-message-renderer button .jpdb-reader-word')?.dataset.jpdbReaderPassive === 'true',
            liveChatFrame: {
                headerWords: readerWordsInSurface('ytd-live-chat-frame #header'),
                messageWords: readerWordsInSurface('ytd-live-chat-frame #message.live-chat-card-copy'),
                actionWords: readerWordsInSurface('ytd-live-chat-frame #show-hide-button'),
                panelPageDirectMirrors: queryCount('ytd-live-chat-frame #panel-pages > .jpdb-reader-text-mirror'),
                messageText: elementText('ytd-live-chat-frame #message.live-chat-card-copy').replace(/\s+/g, ' ').trim(),
                actionText: elementText('ytd-live-chat-frame #show-hide-button').replace(/\s+/g, ' ').trim(),
                card: elementRectJson('ytd-live-chat-frame'),
                message: elementRectJson('ytd-live-chat-frame #message.live-chat-card-copy'),
                action: elementRectJson('ytd-live-chat-frame #show-hide-button'),
                messageWordStyle: surfaceWordStyleSnapshot('ytd-live-chat-frame #message.live-chat-card-copy'),
                actionWordStyle: surfaceWordStyleSnapshot('ytd-live-chat-frame #show-hide-button'),
            },
            titleWords: readerWordsInSurface('ytd-watch-metadata h1, ytd-watch-metadata #title'),
            watchTitleText: element('ytd-watch-metadata h1')?.textContent?.trim() ?? '',
            sidebarReaderWords: readerWordsInSurface('#secondary, ytd-compact-video-renderer'),
            sidebarText: element('#secondary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            sidebarCards: [...document.querySelectorAll('#secondary ytd-compact-video-renderer')].map(card => ({
                caseName: card.dataset.case ?? '',
                className: card.className,
                text: card.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                rect: card.getBoundingClientRect().toJSON(),
            })),
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
    window.__yomuFeatureReadOcrArtifactState = function yomuFeatureReadOcrArtifactState() {
        return {
            frames: queryCount('.jpdb-ocr-video-frame'),
            resumeButtons: queryCount('.jpdb-ocr-video-frame-resume'),
            statuses: queryCount('.jpdb-ocr-video-frame-status'),
            railResumeButtons: queryCount('.jpdb-subtitle-rail .jpdb-ocr-video-frame-resume'),
            railResumeActive: Boolean(element('.jpdb-subtitle-player.jpdb-ocr-video-frame-resume-active')),
        };
    };
}

async function installUserscriptContext(context) {
    const bootstrapArguments = {
        css: readFileSync(CSS_PATH, 'utf8'),
        settings: { ...baseSettings },
        settingsKey: SETTINGS_KEY,
    };
    const prefixContent = `(${youtubeFeatureBootstrap.toString()})(${JSON.stringify(bootstrapArguments)});`;
    await addUserscriptGraphInitScripts(context, USERSCRIPT_PATH, { prefixContent });
}

async function installRoutes(page) {
    await page.route('https://jpdb.io/search**', route => route.fulfill({
        body: youtubePublicPitchHtml,
        contentType: 'text/html',
        headers: { 'access-control-allow-origin': '*' },
    }));
    await page.route(url => isYouTubeRootUrl(url, 'www.youtube.com'), route => route.fulfill({ body: youtubeHomeHtml(), contentType: 'text/html' }));
    await page.route(url => isYouTubeRootUrl(url, 'm.youtube.com'), route => route.fulfill({ body: youtubeMobileHomeHtml(), contentType: 'text/html' }));
    await page.route(url => isYouTubePathUrl(url, 'www.youtube.com', '/feed/shorts'), route => route.fulfill({ body: youtubeShortsGalleryHtml(), contentType: 'text/html' }));
    await page.route(url => isYouTubePathUrl(url, 'm.youtube.com', '/feed/shorts'), route => route.fulfill({ body: youtubeShortsGalleryHtml(), contentType: 'text/html' }));
    await page.route(url => isYouTubePathUrl(url, 'www.youtube.com', '/shorts/watch-en'), route => route.fulfill({ body: youtubeShortsWatchHtml(), contentType: 'text/html' }));
    await page.route(url => isYouTubePathUrl(url, 'm.youtube.com', '/shorts/watch-en'), route => route.fulfill({ body: youtubeShortsWatchHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/oembed**', route => route.fulfill({
        body: JSON.stringify({ title: youtubeOEmbedTitleForRequest(route.request().url()) }),
        contentType: 'application/json',
    }));
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({
        body: youtubeWatchHtml({
            fixture: 'feature',
            playerResponse: youtubePlayerResponse('feature123'),
        }),
        contentType: 'text/html',
    }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedTextFixture, contentType: 'text/xml' }));
    await page.route('https://www.youtube.com/youtubei/v1/player**', route => route.fulfill({
        body: JSON.stringify(youtubePlayerResponse('feature123')),
        contentType: 'application/json',
    }));
    await page.route('https://www.youtube.com/youtubei/v1/navigation/resolve_url**', route => route.fulfill({
        body: JSON.stringify({ endpoint: { browseEndpoint: { browseId: 'UC12345678901234567890' } } }),
        contentType: 'application/json',
    }));
    await page.route('https://www.youtube.com/youtubei/v1/browse**', route => route.fulfill({
        body: JSON.stringify({
            metadata: {
                channelMetadataRenderer: {
                    title: 'Hydrated Preview Channel',
                    description: LONG_CHANNEL_PREVIEW_DESCRIPTION,
                    avatar: { thumbnails: [{ url: 'https://yt.example/avatar.jpg', width: 88 }] },
                },
            },
        }),
        contentType: 'application/json',
    }));
    await page.route('https://lensfrontend-pa.googleapis.com/**', route => route.fulfill({
        body: '{}',
        contentType: 'application/json',
    }));
}

function isYouTubeRootUrl(url, hostname) {
    return isYouTubePathUrl(url, hostname, '/');
}

function isYouTubePathUrl(url, hostname, pathname) {
    return url.hostname === hostname && url.pathname === pathname;
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
    assert(beforeReveal.readerWordsInGrid > 0, 'Yomu did not enhance YouTube homepage Japanese recommendation titles', beforeReveal);
    assert(Object.values(beforeReveal.readerWordsByJapaneseCase).every(count => count > 0), 'Yomu missed a Japanese homepage recommendation title', beforeReveal);
    assert(beforeReveal.ocrLines === 0 && beforeReveal.ocrLayers === 0, 'YouTube homepage thumbnails triggered OCR overlays', beforeReveal);
    assert(beforeReveal.filteredEnglish === true, 'YouTube immersion filter did not hide the non-Japanese recommendation', beforeReveal);
    assert(beforeReveal.visibleJapanese === true, 'YouTube immersion filter hid a Japanese recommendation', beforeReveal);
    assert(beforeReveal.noticeAriaLabel.includes('hid'), 'YouTube filter notice did not summarize hidden videos for assistive tech', beforeReveal);
    assert(beforeReveal.noticeSummaryScreenReaderOnly, 'YouTube filter notice summary was visible instead of screen-reader-only', beforeReveal);
    assert(beforeReveal.noticeSummaryVisuallyHidden, 'YouTube filter notice summary was not visually clipped in the browser', beforeReveal);
    assert(beforeReveal.noticeButtons.join('|') === 'Show hidden videos|Hide notice', 'YouTube filter notice should only show the two action buttons', beforeReveal);
    const crossSurfacePortalLeaks = await crossSurfacePortalAssociationCounts(page);
    assert(Object.values(crossSurfacePortalLeaks).every(count => count === 0), 'A portal from another YouTube surface satisfied the target annotation check', crossSurfacePortalLeaks);

    await page.waitForFunction(() => Boolean(document.querySelector('.jpdb-youtube-filter-bar [data-action="toggle-hidden"]')), null, { timeout: 10000 });
    await page.evaluate(() => {
        document.querySelector('.jpdb-youtube-filter-bar [data-action="toggle-hidden"]')?.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
        }));
    });
    await page.waitForTimeout(800);
    const afterReveal = await page.evaluate(() => window.__yomuFeatureReadHomepageState());
    assert(afterReveal.englishVisible === true, 'YouTube filter reveal did not show hidden recommendations', afterReveal);
    assert(afterReveal.noticeButtons.join('|') === 'Hide hidden videos|Hide notice', 'YouTube reveal notice should still only show the two action buttons', afterReveal);
    assert(Object.values(afterReveal.readerWordsByJapaneseCase).every(count => count > 0), 'Yomu lost a Japanese homepage recommendation title after reveal', afterReveal);
    assert(afterReveal.ocrLines === 0 && afterReveal.ocrLayers === 0, 'YouTube homepage thumbnails triggered OCR overlays after reveal', afterReveal);

    return { beforeReveal, afterReveal, crossSurfacePortalLeaks };
}

async function crossSurfacePortalAssociationCounts(page) {
    return await page.evaluate(() => {
        const associationCount = (targetText, portalText, targetLeft, portalLeft, portalVisibility = 'visible') => {
            const target = document.createElement('div');
            target.id = 'yomu-portal-association-target';
            target.dataset.yomuDecoration = 'content-ruby';
            target.textContent = targetText;
            target.style.cssText = `position:fixed;left:${targetLeft}px;top:20px;font-size:20px;line-height:24px;z-index:-1`;

            const nonTarget = document.createElement('div');
            nonTarget.dataset.yomuDecoration = 'content-ruby';
            nonTarget.textContent = portalText;
            nonTarget.style.cssText = `position:fixed;left:${portalLeft}px;top:20px;font-size:20px;line-height:24px;z-index:-1`;

            const portal = document.createElement('span');
            portal.className = 'jpdb-reader-document-annotation-portal';
            portal.dataset.sourceText = portalText;
            portal.style.cssText = `position:fixed;left:${portalLeft}px;top:20px;font-size:20px;line-height:24px;visibility:${portalVisibility};z-index:-1`;
            portal.innerHTML = `<span class="jpdb-reader-word" data-yomu-source-start="0" data-yomu-source-end="${portalText.length}">${portalText}</span>`;

            document.body.append(target, nonTarget, portal);
            const count = window.__yomuFeatureReaderWordsInSurface('#yomu-portal-association-target');
            target.remove();
            nonTarget.remove();
            portal.remove();
            return count;
        };
        return {
            sameTextDifferentGeometry: associationCount('重複語', '重複語', 20, 800),
            differentTextSameGeometry: associationCount('目標', '別物', 300, 300),
            hiddenSameTextSameGeometry: associationCount('非表示', '非表示', 500, 500, 'hidden'),
        };
    });
}

async function runSpaWatchNavigationCheck(page) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('ytd-rich-item-renderer[data-case="jp"]', { timeout: 10000 });
    const seededPreview = await seedPausedVideoOcrFrame(page);
    const afterNavigationStart = await page.evaluate(() => {
        window.dispatchEvent(new Event('yt-navigate-start'));
        return window.__yomuFeatureReadOcrArtifactState();
    });
    assertNoOcrArtifacts(afterNavigationStart, 'YouTube navigation start left the homepage preview OCR overlay behind');
    await page.evaluate(({ playerResponse }) => {
        history.pushState({}, '', '/watch?v=feature123');
        window.ytInitialPlayerResponse = playerResponse;
        Array.from(document.body.children)
            .filter(element => !(element instanceof HTMLElement && element.dataset.jpdbReaderRoot === 'true'))
            .forEach(element => element.remove());
        document.body.insertAdjacentHTML('afterbegin', `
          <ytd-watch-flexy video-id="feature123">
            <main id="page">
              <section id="primary">
                <div id="player"><div id="movie_player">
                  <video controls muted style="width:960px;height:540px;background:#000"></video>
                  <div class="ytp-caption-window-container"><span class="ytp-caption-segment">先生いつもありがとうございました。</span></div>
                </div></div>
                <ytd-watch-metadata>
                  <h1><yt-formatted-string title="日本語タイトル">日本語タイトル</yt-formatted-string></h1>
                  <div id="description-inline-expander">
                    <yt-attributed-string id="attributed-snippet-text">復習用のPodcastでは、日本語で説明しています。</yt-attributed-string>
                  </div>
                </ytd-watch-metadata>
                <ytd-comment-view-model>
                  <yt-attributed-string id="content-text">先生いつもありがとうございました。</yt-attributed-string>
                </ytd-comment-view-model>
              </section>
            </main>
          </ytd-watch-flexy>
        `);
        const player = document.querySelector('#movie_player');
        const video = document.querySelector('video');
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
        player.getVideoData = () => ({ video_id: 'feature123' });
        player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
        player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        player.setOption = () => {};
        player.loadModule = () => {};
        window.dispatchEvent(new Event('yt-navigate-finish'));
    }, { playerResponse: youtubePlayerResponse('feature123') });
    await waitForYoutubeTranscriptRows(page);
    await page.waitForFunction(() => window.__yomuFeatureReaderWordsInSurface('ytd-watch-metadata #description-inline-expander') > 0
        && window.__yomuFeatureReaderWordsInSurface('ytd-comment-view-model #content-text') > 0, null, { timeout: 30000 });
    const afterWatchNavigation = await readOcrArtifactState(page);
    assertNoOcrArtifacts(afterWatchNavigation, 'YouTube watch navigation left stale preview OCR controls over the player');
    const spaWatch = await readWatchState(page);
    assert(spaWatch.rows >= 3, 'YouTube SPA navigation did not render transcript rows', spaWatch);
    assert(spaWatch.parsedRowWords > 0, 'YouTube SPA navigation transcript rows were not parsed', spaWatch);
    assert(spaWatch.descriptionWords > 0, 'YouTube SPA navigation watch text was not parsed', spaWatch);
    return {
        seededPreview,
        afterNavigationStart,
        afterWatchNavigation,
        rows: spaWatch.rows,
        parsedRowWords: spaWatch.parsedRowWords,
        descriptionWords: spaWatch.descriptionWords,
    };
}

async function seedPausedVideoOcrFrame(page) {
    await page.evaluate(() => {
        if (!window.__yomuFeatureCanvasStubsInstalled) {
            window.__yomuFeatureCanvasStubsInstalled = true;
            const canvas = HTMLCanvasElement.prototype;
            const context = CanvasRenderingContext2D?.prototype;
            if (context) {
                Object.defineProperty(context, 'drawImage', { configurable: true, value: () => undefined });
            }
            Object.defineProperty(canvas, 'toDataURL', {
                configurable: true,
                value: () => 'data:image/jpeg;base64,ZmVhdHVyZS1wcmV2aWV3',
            });
        }
        const video = document.createElement('video');
        video.dataset.case = 'homepage-preview-video';
        video.style.cssText = 'position:fixed;left:80px;top:96px;width:640px;height:360px;background:#111;z-index:1;';
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
        document.body.append(video);
        video.dispatchEvent(new Event('pause'));
    });
    await page.waitForSelector('.jpdb-ocr-video-frame', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('.jpdb-ocr-video-frame-resume', { state: 'attached', timeout: 10000 });
    const state = await readOcrArtifactState(page);
    assert(state.frames === 1, 'Paused homepage preview did not create an OCR frame for the navigation cleanup regression', state);
    assert(state.resumeButtons === 1, 'Paused homepage preview did not create the OCR resume control', state);
    return state;
}

async function readOcrArtifactState(page) {
    return page.evaluate(() => window.__yomuFeatureReadOcrArtifactState());
}

function assertNoOcrArtifacts(state, message) {
    assert(state.frames === 0, message, state);
    assert(state.resumeButtons === 0, message, state);
    assert(state.statuses === 0, message, state);
    assert(state.railResumeButtons === 0, message, state);
    assert(!state.railResumeActive, message, state);
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
    assert(mobileHome.readerWordsInGrid > 0, 'Yomu did not enhance mobile YouTube recommendation titles', mobileHome);
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
    assert(shortsGallery.readerWordsInGrid > 0, 'Yomu did not enhance Shorts gallery titles', shortsGallery);
    assert(shortsGallery.visibleJapanese >= 3, 'Shorts gallery did not keep Japanese-looking Shorts visible', shortsGallery);
    assert(shortsGallery.visibleNonJapanese === 0, 'Shorts gallery still shows non-Japanese-looking Shorts', shortsGallery);
    assert(includesText(shortsGallery.hiddenCases.join(','), 'gallery-en'), 'Desktop English Short was not hidden', shortsGallery);
    assert(includesText(shortsGallery.hiddenCases.join(','), 'gallery-mobile-en'), 'Mobile English Short card was not hidden', shortsGallery);
    return shortsGallery;
}

// One end-to-end interaction deliberately owns the Shorts filter, subtitle
// rail drag, native-control hit testing, and clipped-label assertions.
// fallow-ignore-next-line complexity
async function runShortsWatchCheck(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SHORTS_WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('ytd-reel-video-renderer[data-case="shorts-watch-current"]', { timeout: 10000 });
    await page.waitForFunction(() => {
        const state = window.__yomuFeatureReadShortsWatchState();
        return state.hiddenCases.includes('shorts-watch-next-en')
            && state.visibleCases.includes('shorts-watch-current')
            && state.visibleCases.includes('shorts-watch-next-jp');
    }, null, { timeout: 12000 }).catch(() => undefined);

    await page.waitForFunction(() => {
        const state = window.__yomuFeatureReadShortsWatchState();
        return state.parsedPlayerWords > 0 && state.rail.gripVisible;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(3300);

    const idleRail = await page.evaluate(() => window.__yomuFeatureReadShortsWatchState());
    assert(includesText(idleRail.rail.rootClasses, 'jpdb-subtitle-controls-idle'), 'Shorts subtitle rail did not collapse to its grip after idle', idleRail);
    assert(!includesText(idleRail.rail.rootClasses, 'jpdb-subtitle-controls-away'), 'Persistent Shorts ytp-autohide incorrectly removed the subtitle rail grip', idleRail);
    assert(idleRail.rail.gripVisible === true, 'Shorts subtitle rail grip is not available', idleRail);

    const grip = page.locator('.jpdb-subtitle-rail [data-action="rail-expand"]');
    await grip.click();
    await page.waitForFunction(() => {
        const state = window.__yomuFeatureReadShortsWatchState();
        return state.rail.gripExpanded === 'true'
            && state.rail.rootClasses.includes('jpdb-subtitle-controls-always');
    }, null, { timeout: 5000 });
    const expandedRail = await page.evaluate(() => window.__yomuFeatureReadShortsWatchState());

    const gripBox = await grip.boundingBox();
    const shareBox = await page.locator('#shorts-share').boundingBox();
    assert(gripBox && shareBox, 'Shorts rail/native Share geometry was unavailable');
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
        gripBox.x + gripBox.width / 2 + shareBox.x - expandedRail.rail.rect.left,
        gripBox.y + gripBox.height / 2 + shareBox.y - expandedRail.rail.rect.top,
        { steps: 6 },
    );
    await page.mouse.up();
    await page.waitForTimeout(150);
    const draggedRail = await page.evaluate(() => window.__yomuFeatureReadShortsWatchState());
    assert(draggedRail.rail.left !== expandedRail.rail.left || draggedRail.rail.top !== expandedRail.rail.top, 'Shorts subtitle rail did not move when its grip was dragged', { expandedRail, draggedRail });
    assert(Number.isFinite(draggedRail.storedRailPosition?.x) && Number.isFinite(draggedRail.storedRailPosition?.y), 'Shorts rail drag position was not persisted', draggedRail);
    assert(!layoutBoxesOverlap(draggedRail.rail.rect, draggedRail.nativeControlRects.share), 'Moved Shorts subtitle rail covered the native Share action', draggedRail);
    assert(!layoutBoxesOverlap(draggedRail.rail.rect, draggedRail.nativeControlRects.fullscreen), 'Moved Shorts subtitle rail covered the native fullscreen action', draggedRail);

    // The transcript drawer is a deliberate interactive panel rather than a
    // transparent player overlay. Close it for the native-control hit test so
    // the assertion isolates the on-video subtitle surface reported here.
    const transcriptPanel = page.locator('.jpdb-subtitle-list');
    if (await transcriptPanel.isVisible()) {
        await page.evaluate(() => document.querySelector('.jpdb-subtitle-rail [data-action="panel"]')?.click());
        await transcriptPanel.waitFor({ state: 'hidden', timeout: 5000 });
    }

    // Put each native action directly beneath a parsed subtitle word. The word
    // remains visually annotated, but its small overlap is returned to the
    // player for hit testing, so a real Playwright click reaches the action.
    await page.evaluate(() => {
        const word = document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word');
        const share = document.querySelector('#shorts-share');
        if (!(word instanceof HTMLElement) || !(share instanceof HTMLElement)) return;
        const rect = word.getBoundingClientRect();
        share.style.cssText += `;position:fixed;left:${rect.left}px;top:${rect.top}px;right:auto;bottom:auto;z-index:1`;
    });
    await page.waitForFunction(() => document.querySelector('#shorts-share')?.getBoundingClientRect().width > 0
        && document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word[data-jpdb-subtitle-native-control-safe-zone="true"]'), null, { timeout: 5000 });
    await page.locator('#shorts-share').click();

    await page.evaluate(() => {
        const word = document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word');
        const share = document.querySelector('#shorts-share');
        const fullscreen = document.querySelector('#shorts-fullscreen');
        if (!(word instanceof HTMLElement) || !(share instanceof HTMLElement) || !(fullscreen instanceof HTMLElement)) return;
        const rect = word.getBoundingClientRect();
        share.style.cssText += ';position:absolute;left:auto;top:auto;right:12px;bottom:104px';
        fullscreen.style.cssText += `;position:fixed;left:${rect.left}px;top:${rect.top}px;right:auto;bottom:auto;z-index:1`;
    });
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word[data-jpdb-subtitle-native-control-safe-zone="true"]'), null, { timeout: 5000 });
    await page.locator('#shorts-fullscreen').click();

    const shortsWatch = await page.evaluate(() => window.__yomuFeatureReadShortsWatchState());
    assert(shortsWatch.cards === 3, 'Shorts watch feed did not render the snap sequence', shortsWatch);
    assert(includesText(shortsWatch.visibleCases.join(','), 'shorts-watch-current'), 'Shorts watch current snap item was hidden', shortsWatch);
    assert(includesText(shortsWatch.hiddenCases.join(','), 'shorts-watch-next-en'), 'Shorts watch next English item was not hidden', shortsWatch);
    assert(includesText(shortsWatch.visibleCases.join(','), 'shorts-watch-next-jp'), 'Shorts watch next Japanese item was not left available', shortsWatch);
    assert(shortsWatch.visibleJapanese >= 1, 'Shorts watch feed did not leave a Japanese next item visible', shortsWatch);
    assert(shortsWatch.visibleNonCurrentEnglish === 0, 'Shorts watch feed still shows a non-current English item', shortsWatch);
    assert(shortsWatch.shareLabelSourceText === '共有', 'Shorts Share native label changed', shortsWatch);
    assert(shortsShareIsPageOwned(shortsWatch), 'Ellipsis-constrained Shorts Share received an annotation mirror', shortsWatch);
    assert(shortsWatch.shareLabelOverflows === false, 'Shorts Share still overflows into an ellipsis', shortsWatch);
    assert(shortsWatch.nativeClicks.share === 1, 'Subtitle overlay prevented a native Shorts Share click', shortsWatch);
    assert(shortsWatch.nativeClicks.fullscreen === 1, 'Subtitle overlay prevented a native Shorts fullscreen click', shortsWatch);
    return shortsWatch;
}

function shortsShareIsPageOwned(state) {
    return [state.shareLabelAnnotationWords, state.shareLabelMirrors].every(count => count === 0);
}

async function runWatchCheck(page) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await waitForWatchFeatureReady(page);

    // R5 check: The auto-mode rail may have idled down to its grip while the
    // parser readiness checks ran. Hover the same visible affordance a pointer
    // user has, without persisting always-open mode, then verify the panel.
    const grip = page.locator('.jpdb-subtitle-rail [data-action="rail-expand"]');
    assert(await grip.isVisible(), 'Collapsed subtitle rail grip is not visible');
    assert(await grip.isEnabled(), 'Collapsed subtitle rail grip is not enabled');
    await grip.hover();
    const railBtn = page.locator('.jpdb-subtitle-rail [data-action="panel"]');
    assert(await railBtn.isVisible(), 'Side panel rail toggle button is not visible');
    assert(await railBtn.isEnabled(), 'Side panel rail toggle button is not enabled');

    // R5 check: Subtitle tracks load automatically and render overlay/sidebar lines instantly on playback.
    const subtitleRow = page.locator('.jpdb-subtitle-list-row');
    assert(await subtitleRow.count() >= 3, 'Subtitle tracks did not load automatically');
    const overlaySegment = page.locator('.jpdb-subtitle-primary');
    assert(await overlaySegment.count() > 0, 'Subtitle overlay lines did not render');

    // R5 check: No description panel flashing or rendering loop occurs during video playback.
    await page.evaluate(() => {
        window.__yomuMutationCount = 0;
        const observer = new MutationObserver(() => {
            window.__yomuMutationCount++;
        });
        const target = document.querySelector('ytd-watch-metadata');
        if (target) observer.observe(target, { childList: true, subtree: true, attributes: true });
    });
    await page.waitForTimeout(600);
    const mutations = await page.evaluate(() => window.__yomuMutationCount);
    assert(mutations === 0, 'Detected unexpected DOM mutations in ytd-watch-metadata (rendering loop)', mutations);

    const initial = await revealAndWaitForWatchLiveCard(page);
    assertInitialWatchState(initial);
    const annotationsToggle = await verifyWatchAnnotationsToggle(page);

    const idleControls = await closePanelAndReadIdleControls(page);
    assertIdleControls(idleControls);
    const visibleSidebar = await waitForVisibleWatchSidebarParsing(page);
    assertVisibleSidebarParsing(visibleSidebar);

    const resize = await exerciseWatchPanelResize(page);
    const dictionary = await verifyTeacherCommentLookup(page);

    return {
        initial,
        annotationsToggle,
        idleControls,
        visibleSidebar,
        beforeResize: resize.beforeResize,
        afterResize: resize.afterResize,
        dictionary,
    };
}

async function verifyWatchAnnotationsToggle(page) {
    await page.evaluate(settingsKey => {
        const current = window.GM_getValue(settingsKey, {});
        const paused = { ...current, annotationsPaused: true };
        window.GM_setValue(settingsKey, paused);
    }, SETTINGS_KEY);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word, .jpdb-subtitle-row-text .jpdb-reader-word').length === 0
        && !document.querySelector('.jpdb-subtitle-primary-loading'), null, { timeout: 5000 });
    const paused = await page.evaluate(() => ({
        playerText: document.querySelector('.jpdb-subtitle-primary')?.textContent?.trim() || '',
        rowText: document.querySelector('.jpdb-subtitle-row-text')?.textContent?.trim() || '',
        parsedPlayerWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
        parsedRowWords: document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length,
        loadingCaptions: document.querySelectorAll('.jpdb-subtitle-primary-loading').length,
    }));
    assert(paused.playerText.length > 0, 'Annotations-off removed the displayed video caption text', paused);
    assert(paused.rowText.length > 0, 'Annotations-off removed transcript text', paused);
    assert(paused.parsedPlayerWords === 0 && paused.parsedRowWords === 0, 'Annotations-off left parsed caption words in the DOM', paused);
    assert(paused.loadingCaptions === 0, 'Annotations-off left captions waiting on parser work', paused);

    await page.evaluate(settingsKey => {
        const current = window.GM_getValue(settingsKey, {});
        const resumed = { ...current, annotationsPaused: false };
        window.GM_setValue(settingsKey, resumed);
    }, SETTINGS_KEY);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length > 0
        && document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length > 0, null, { timeout: 10000 });
    return paused;
}

async function runWatchLiveCardCheck(page) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await waitForWatchFeatureReady(page);
    const initial = await revealAndWaitForWatchLiveCard(page);
    assertYouTubeLiveChatFrameCard(initial.liveChatFrame);
    return { liveChatFrame: initial.liveChatFrame };
}

async function runIpadWatchCheck(page) {
    await waitForWatchFeatureReady(page);
    const railButton = page.locator('.jpdb-subtitle-rail [data-action="panel"]');
    await page.locator('#movie_player').tap({ force: true }).catch(() => undefined);
    await page.waitForFunction(() => {
        const rail = document.querySelector('.jpdb-subtitle-rail');
        const button = document.querySelector('.jpdb-subtitle-rail [data-action="panel"]');
        if (!rail || !button) return false;
        const railStyle = getComputedStyle(rail);
        const buttonRect = button.getBoundingClientRect();
        return railStyle.opacity !== '0'
            && railStyle.pointerEvents !== 'none'
            && buttonRect.width > 0
            && buttonRect.height > 0;
    }, null, { timeout: 8000 });
    assert(await railButton.isVisible(), 'iPad touch layout did not expose the side-panel rail toggle');
    assert(await railButton.isEnabled(), 'iPad touch layout exposed a disabled side-panel rail toggle');

    const beforeToggle = await readWatchState(page);
    if (!beforeToggle.layout.panel || beforeToggle.layout.panel.width <= 0) {
        await railButton.tap();
        await page.waitForFunction(() => !document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 6000 });
    }
    const state = await revealAndWaitForWatchLiveCard(page);
    assertWatchTranscriptState(state);
    assertWatchPageParsing(state);
    assertWatchTextExclusions(state);
    assertNonOverlappingLayout(state.layout, 'iPad touch watch');
    return {
        rows: state.rows,
        parsedRowWords: state.parsedRowWords,
        parsedPlayerWords: state.parsedPlayerWords,
        titleWords: state.titleWords,
        layout: state.layout,
    };
}

async function waitForWatchFeatureReady(page) {
    await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForYoutubeTranscriptRows(page);
    await page.waitForFunction(() => window.__yomuFeatureReaderWordsInSurface('ytd-watch-metadata #description-inline-expander') > 0
        && window.__yomuFeatureReaderWordsInSurface('ytd-comment-view-model #content-text') > 0
        && window.__yomuFeatureReaderWordsInSurface('yt-live-chat-text-message-renderer') > 0, null, { timeout: 30000 });
}

async function revealAndWaitForWatchLiveCard(page) {
    await page.evaluate(() => document.querySelector('ytd-live-chat-frame')?.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => window.__yomuFeatureReaderWordsInSurface('ytd-live-chat-frame #message.live-chat-card-copy') > 0
        && window.__yomuFeatureReaderWordsInSurface('ytd-live-chat-frame #show-hide-button') > 0, null, { timeout: 8000 });
    await page.waitForFunction(() => {
        const frame = window.__yomuFeatureReadWatchState().liveChatFrame;
        return [frame.messageWordStyle, frame.actionWordStyle]
            .every(style => style && !style.className.includes('jpdb-pitch-unknown'));
    }, null, { timeout: 15000 });
    const state = await readWatchState(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    return state;
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
    assert(initial.commentMorePassive === true, 'Yomu did not passively annotate the YouTube comment more control', initial);
    assert(initial.commentTranslatePassive === true, 'Yomu did not passively annotate the YouTube comment translate control', initial);
    assert(initial.liveChatWords > 0, 'YouTube live chat text was not parsed', initial);
    assert(initial.liveChatButtonPassive === true, 'Yomu did not passively annotate the YouTube live chat button', initial);
    assertYouTubeLiveChatFrameCard(initial.liveChatFrame);
}

function assertYouTubeLiveChatFrameCard(card) {
    assert(card.headerWords > 0, 'YouTube watch live-chat frame header was not parsed', card);
    assert(card.messageWords > 0, 'YouTube watch live-chat frame message was not parsed', card);
    assert(card.actionWords > 0, 'YouTube watch live-chat frame action was not parsed', card);
    assert(card.panelPageDirectMirrors === 0, 'YouTube watch live-chat frame parsed the whole panel as one mirror', card);
    assert(card.messageText.includes('会話に参加して'), 'YouTube live-chat frame message text was lost', card);
    assert(card.actionText.includes('チャットを開く'), 'YouTube live-chat frame action text was lost', card);
    assertLayoutBox(card.card, 'Missing YouTube live-chat frame card box', card);
    assertLayoutBox(card.message, 'Missing YouTube live-chat frame message box', card);
    assertLayoutBox(card.action, 'Missing YouTube live-chat frame action box', card);
    assert(!layoutBoxesOverlap(card.message, card.action), 'YouTube live-chat frame message overlaps the action button', card);
    assertVisibleWordUnderline(card.messageWordStyle, 'YouTube live-chat frame message lost its underline channel');
    assertVisibleWordUnderline(card.actionWordStyle, 'YouTube live-chat frame action lost its underline channel');
}

function assertVisibleWordUnderline(style, message) {
    assert(style, message, style);
    assert(style.className.includes('jpdb-pitch-'), message, style);
    assert(!isTransparentCssColor(style.decorationColor) || !isTransparentCssColor(style.afterBorderColor), message, style);
}

function isTransparentCssColor(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '' || normalized === 'transparent' || normalized === '#0000' || normalized === 'rgba(0, 0, 0, 0)';
}

function assertWatchTextExclusions(initial) {
    assert(initial.titleWords > 0, 'Yomu did not parse the YouTube watch title', initial);
    assert(initial.watchTitleText.includes('日本の習慣'), 'YouTube watch title text is missing or incorrect', initial);
    if (hasVisibleSidebarCard(initial)) {
        assert(initial.sidebarReaderWords > 0, 'Yomu did not enhance visible YouTube sidebar recommendation text', initial);
    }
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
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click();
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
    assert(Number(idleControls.railOpacity) > 0 && Number(idleControls.railOpacity) <= 0.6, 'YouTube idle mode did not collapse to its quiet move/expand grip', idleControls);
    assert(idleControls.railPointerEvents === 'auto', 'YouTube idle subtitle grip is not interactive', idleControls);
}

async function waitForVisibleWatchSidebarParsing(page) {
    await page.waitForFunction(() => {
        const visibleCards = [...document.querySelectorAll('#secondary ytd-compact-video-renderer')]
            .filter(card => {
                const rect = card.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
        if (!visibleCards.length) return false;
        return window.__yomuFeatureReaderWordsInSurface('#secondary ytd-compact-video-renderer') > 0;
    }, null, { timeout: 8000 });
    return readWatchState(page);
}

function assertVisibleSidebarParsing(state) {
    assert(hasVisibleSidebarCard(state), 'YouTube native sidebar recommendation rail did not become visible after closing Yomu sidebar', state);
    assert(state.sidebarReaderWords > 0, 'Yomu did not enhance visible YouTube sidebar recommendation text', state);
}

function hasVisibleSidebarCard(state) {
    return Array.isArray(state.sidebarCards)
        && state.sidebarCards.some(card => card.rect?.width > 0 && card.rect?.height > 0);
}

async function exerciseWatchPanelResize(page) {
    await page.locator('.jpdb-subtitle-rail [data-action="rail-expand"]').hover();
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click();
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
    dictionary.actions = await verifyDictionaryActionPills(page, '先生');
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

async function verifyDictionaryActionPills(page, query) {
    const expected = [
        ['Jiten', `https://jiten.moe/parse?text=${encodeURIComponent(query)}`],
        ['JPDB', 'https://jpdb.io/search'],
        ['Jisho', `https://jisho.org/search/${encodeURIComponent(query)}`],
        ['Yomu', `${YOMU_STUDY_SEARCH_URL}${encodeURIComponent(query)}`],
    ];
    for (const [label, urlPrefix] of expected) {
        await clickDictionaryActionPillAndAssertOpen(page, query, label, urlPrefix);
    }
    await page.locator('.jpdb-reader-popover .jpdb-reader-copy-pill').first().click();
    await page.waitForSelector('.jpdb-reader-toast', { state: 'visible', timeout: 5_000 });
    const toastText = (await page.locator('.jpdb-reader-toast').last().innerText()).trim();
    assert(/Copied word/i.test(toastText), 'YouTube popover copy pill did not show visible feedback', { toastText });
    return page.evaluate(() => window.__yomuFeatureOpenedTabs ?? []);
}

async function openedFeatureTabCount(page) {
    return page.evaluate(() => (window.__yomuFeatureOpenedTabs ?? []).length);
}

async function clickDictionaryActionPillAndAssertOpen(page, query, label, urlPrefix) {
    const before = await openedFeatureTabCount(page);
    const popover = page.locator('.jpdb-reader-popover')
        .filter({ has: page.locator('.jpdb-reader-spelling', { hasText: query }) })
        .last();
    const link = popover.locator('a.jpdb-reader-action-pill', { hasText: label }).first();
    const href = await link.getAttribute('href');
    assert(String(href ?? '').startsWith(urlPrefix), `${label} pill href does not target the expected URL`, { href, urlPrefix });
    const popupPromise = page.waitForEvent('popup', { timeout: 2_000 }).catch(() => null);
    await link.click();
    const recorded = await page.waitForFunction(
        ({ count, prefix }) => (window.__yomuFeatureOpenedTabs ?? []).length > count
            && (window.__yomuFeatureOpenedTabs ?? []).some(item => String(item.url).startsWith(prefix)),
        { count: before, prefix: urlPrefix },
        { timeout: 1_500 },
    ).then(() => true).catch(() => false);
    if (recorded) return;
    const popup = await popupPromise;
    assert(Boolean(popup), `${label} pill did not dispatch a userscript/tab/window open`, {
        openedTabs: await page.evaluate(() => window.__yomuFeatureOpenedTabs ?? []),
        href,
        urlPrefix,
    });
    await popup?.close().catch(() => undefined);
}

async function clickTeacherCommentWord(page) {
    const source = page.locator('ytd-comment-view-model #content-text');
    await source.scrollIntoViewIfNeeded();
    const box = await source.evaluate((element, expected) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const start = node.data.indexOf(expected);
            if (start < 0) continue;
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + expected.length);
            return range.getBoundingClientRect().toJSON();
        }
        return null;
    }, '先生');
    assert(box, 'Teacher comment word has no clickable geometry');
    // Source-preserving mirrors deliberately do not intercept input. Click the
    // painted coordinate so the page-owned host receives the pointer and Yomu
    // resolves the exact source Text range beneath it, as a real user tap does.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('.jpdb-reader-popover .jpdb-reader-spelling', { timeout: 10000 });
}

async function resizePanel(page, placement) {
    await dragTranscriptResizeHandle(page, placement, {
        assert,
        bottomDelta: -100,
        leftDelta: 120,
        missingMessage: 'Transcript resize handle is missing',
        rightDelta: -120,
    });
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
    if (process.env.YOMU_YOUTUBE_FEATURE_ONLY === 'watch-live-card') {
        const watchLiveCard = await runWatchLiveCardCheck(page);
        console.log(JSON.stringify({ watchLiveCard }, null, 2));
        process.exitCode = 0;
    } else if (process.env.YOMU_YOUTUBE_FEATURE_ONLY === 'watch') {
        const watch = await runWatchCheck(page);
        console.log(JSON.stringify({ watch }, null, 2));
        process.exitCode = 0;
    } else if (process.env.YOMU_YOUTUBE_FEATURE_ONLY === 'shorts-watch') {
        const shortsWatch = await runShortsWatchCheck(page);
        console.log(JSON.stringify({ shortsWatch }, null, 2));
        process.exitCode = 0;
    } else {
        const homepage = await runHomepageCheck(page);
        const spaWatch = await runSpaWatchNavigationCheck(page);
        const watch = await runWatchCheck(page);
        const mobileHome = await runMobileHomeLoadingCheck(page);
        const shortsGallery = await runShortsGalleryCheck(page);
        const shortsWatch = await runShortsWatchCheck(page);
        const ipadContext = await browser.newContext({
            viewport: { width: 1024, height: 1366 },
            deviceScaleFactor: 2,
            hasTouch: true,
            isMobile: false,
            locale: 'en-GB',
            userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        });
        await installUserscriptContext(ipadContext);
        const ipadPage = await ipadContext.newPage();
        await installRoutes(ipadPage);
        const ipadWatch = await runIpadWatchCheck(ipadPage);
        await ipadContext.close();
        console.log(JSON.stringify({ homepage, spaWatch, watch, mobileHome, shortsGallery, shortsWatch, ipadWatch }, null, 2));
    }
} finally {
    await browser.close();
}
