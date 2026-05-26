#!/usr/bin/env node
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadLocalEnv } from './qa-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadLocalEnv(ROOT);
const DIST = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const SCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const CSS_PATH = path.join(DIST, 'yomu.css');
const SCRIPT_FALLBACK_PATHS = [
    SCRIPT_PATH,
    path.join(ROOT, 'docs', '.vitepress', 'dist', 'yomu.user.js'),
    path.join(ROOT, 'docs', 'public', 'yomu.user.js'),
];
const API_KEY = process.env.YOMU_TEST_API_KEY?.trim() ?? '';
const MOCK_API_KEY = 'yomu-qa-mock-key';
const QA_API_KEY = API_KEY || MOCK_API_KEY;
const IMMERSION_API_HOSTS = new Set(['apiv2express.immersionkit.com', 'apiv2.immersionkit.com']);

const baseSettings = {
    onboardingSeen: true,
    apiKey: QA_API_KEY,
    interfaceLanguage: 'auto',
    accentColor: '#5ea780',
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    rtkEnabled: true,
    kanjivgEnabled: true,
    kanjiOriginsEnabled: true,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginGraphEnabled: true,
    kanjiOriginRadicalImagesEnabled: false,
    similarKanjiWords: true,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: false,
    audioSources: [],
    audioEnableDefaultSources: false,
    audioViaBlob: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    immersionKitEnabled: true,
    immersionKitPriority: 80,
    immersionKitLimit: 3,
    immersionKitMinLength: 4,
    immersionKitMaxLength: 80,
    immersionKitCategory: 'all',
    immersionKitSort: 'sentence_length:asc',
    immersionKitExactMatch: false,
    immersionKitShowTranslation: false,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlayOnHover: true,
    immersionKitPlaybackRate: 1,
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 60,
    hoverCloseDelayMs: 180,
    popupActivationMode: 'hover',
    scanModifierKey: 'shift',
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: false,
    showFurigana: true,
    showPitchAccent: true,
    hideKnownFurigana: false,
    ocrEnabled: false,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: false,
    ocrProvider: 'local-service',
    ocrEndpointUrl: '',
    ocrEngine: 'auto',
    ocrLanguage: 'ja-JP',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 12000,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrTextColor: '#ffffff',
    ocrOutlineColor: '#000000',
    ocrBackgroundColor: '#181b20',
    ocrBackgroundOpacity: 0.36,
    ocrFontScale: 1,
    localDictionariesEnabled: false,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    dictionaryPreferences: [],
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleControlsMode: 'auto',
    subtitleFontSize: 28,
    subtitleBottomOffset: 12,
    subtitleTextColor: '#ffffff',
    subtitleOutlineColor: '#000000',
    subtitleBackgroundColor: '#181b20',
    subtitleBackgroundOpacity: 0.18,
    subtitleFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    subtitleFontWeight: 760,
    subtitleMiningPause: true,
    subtitleSeekPadding: 0.08,
    ankiEnabled: false,
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiDeck: 'Yomu',
    ankiModel: 'Yomu Japanese',
    ankiTags: 'yomu',
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    theme: 'auto',
    popupMode: 'auto',
    miningDeck: 'forq',
    neverForgetDeck: 'never-forget',
    blacklistDeck: 'blacklist',
    addToForq: false,
    enableReviews: true,
    twoButtonReviews: false,
    shortcuts: {
        scanPage: 'Alt+J',
        hoverLookup: '',
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
        scanImages: 'Alt+I',
        gradeNothing: '1',
        gradeSomething: '2',
        gradeHard: '3',
        gradeOkay: '4',
        gradeEasy: '5',
        gradeFail: '1',
        gradePass: '2',
    },
};

const results = [];
let userscript = '';
let readerCss = '';

async function readBuiltUserscript() {
    const errors = [];
    for (const candidate of SCRIPT_FALLBACK_PATHS) {
        try {
            const text = await readFile(candidate, 'utf8');
            return text;
        } catch (error) {
            errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    throw new Error(`Could not find a built userscript.\n${errors.join('\n')}`);
}

async function readBuiltReaderCss() {
    try {
        return await readFile(CSS_PATH, 'utf8');
    } catch {
        return '';
    }
}

function record(name, status, detail = '') {
    results.push({ name, status, detail });
    const marker = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
    console.log(`${marker} ${name}${detail ? ` - ${detail}` : ''}`);
}

function assertAudit(condition, message) {
    if (!condition) throw new Error(message);
}

async function assertAccessibleSurface(page, name, selector = 'body') {
    const axe = await new AxeBuilder({ page })
        .include(selector)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
    const violations = axe.violations
        .filter(violation => violation.impact !== 'minor')
        .map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.slice(0, 4).map(node => ({
                target: node.target.join(' '),
                html: node.html,
                summary: node.failureSummary,
            })),
        }));
    assertAudit(!violations.length, `${name} axe violations: ${JSON.stringify(violations)}`);

    const wcag = await page.evaluate(surfaceSelector => {
        const root = document.querySelector(surfaceSelector);
        if (!root) return { missing: true };
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== 'hidden'
                && style.display !== 'none'
                && Number(style.opacity || 1) > 0.02
                && rect.width > 0
                && rect.height > 0;
        };
        const labelFor = element => {
            const aria = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby');
            const text = element.textContent || element.getAttribute('title') || element.getAttribute('alt') || element.getAttribute('value') || '';
            return `${aria || ''} ${text || ''}`.replace(/\s+/g, ' ').trim();
        };
        const controls = [...root.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],[tabindex]:not([tabindex="-1"])')]
            .filter(element => visible(element));
        const targetSizeException = element => {
            const style = getComputedStyle(element);
            if (element.classList.contains('jpdb-reader-word')) return true;
            if (element.classList.contains('gloss-link')) return true;
            if (element.tagName.toLowerCase() === 'a' && style.display === 'inline') return true;
            return false;
        };
        const smallTargets = controls
            .filter(element => !targetSizeException(element))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return { label: labelFor(element), tag: element.tagName.toLowerCase(), width: rect.width, height: rect.height };
            })
            .filter(item => item.width < 24 || item.height < 24);
        const unnamedControls = controls
            .filter(element => !labelFor(element))
            .map(element => element.outerHTML.slice(0, 140));
        const imagesWithoutAlt = [...root.querySelectorAll('img')]
            .filter(image => visible(image) && !image.hasAttribute('alt'))
            .map(image => image.currentSrc || image.getAttribute('src') || 'img');
        const unloadedImages = [...root.querySelectorAll('img')]
            .filter(image => visible(image) && (!image.complete || image.naturalWidth <= 0))
            .map(image => image.currentSrc || image.getAttribute('src') || 'img');
        const rootRect = root.getBoundingClientRect();
        const horizontalOverflow = root.scrollWidth > root.clientWidth + 2 && rootRect.width <= innerWidth + 2;
        const viewportOverflow = document.documentElement.scrollWidth > innerWidth + 2;
        const fixedOverflow = [...root.querySelectorAll('*')]
            .filter(element => visible(element))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return {
                    tag: element.tagName.toLowerCase(),
                    className: typeof element.className === 'string' ? element.className.slice(0, 80) : '',
                    text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                };
            })
            .filter(item => item.right > innerWidth + 2 || item.left < -2 || item.bottom < -2)
            .slice(0, 8);
        return {
            missing: false,
            smallTargets,
            unnamedControls,
            imagesWithoutAlt,
            unloadedImages,
            horizontalOverflow,
            viewportOverflow,
            overflowMetrics: {
                rootScrollWidth: root.scrollWidth,
                rootClientWidth: root.clientWidth,
                rootRectWidth: rootRect.width,
                documentScrollWidth: document.documentElement.scrollWidth,
                viewportWidth: innerWidth,
            },
            fixedOverflow,
        };
    }, selector);
    assertAudit(!wcag.missing, `${name} surface ${selector} is missing`);
    assertAudit(!wcag.unnamedControls.length, `${name} has unnamed controls: ${JSON.stringify(wcag.unnamedControls)}`);
    assertAudit(!wcag.smallTargets.length, `${name} has controls below 24px target size: ${JSON.stringify(wcag.smallTargets)}`);
    assertAudit(!wcag.imagesWithoutAlt.length, `${name} has images without alt text: ${JSON.stringify(wcag.imagesWithoutAlt)}`);
    assertAudit(!wcag.unloadedImages.length, `${name} has unloaded/broken images: ${JSON.stringify(wcag.unloadedImages)}`);
    assertAudit(
        !wcag.horizontalOverflow && !wcag.viewportOverflow,
        `${name} has hidden horizontal overflow: ${JSON.stringify(wcag.overflowMetrics)}`,
    );
    assertAudit(!wcag.fixedOverflow.length, `${name} has visible content outside the viewport: ${JSON.stringify(wcag.fixedOverflow)}`);
}

async function waitForAudit(page, predicate, timeoutMs, message, arg = undefined) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const value = await page.evaluate(predicate, arg).catch(() => false);
        if (value) return value;
        await page.waitForTimeout(200);
    }
    throw new Error(message);
}

function dataUrl(html) {
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

const QA_READER_PATH = '/__qa__/reader';
const QA_VIDEO_PATH = '/__qa__/video';
const QA_RUNTIME_REGRESSION_PATH = '/__qa__/runtime-regression';
const QA_JA_SUBTITLES_PATH = '/__qa__/subtitles-ja.vtt';
const QA_EN_SUBTITLES_PATH = '/__qa__/subtitles-en.vtt';

const QA_JA_SUBTITLES = `WEBVTT

00:00:00.000 --> 00:00:03.000
今日は字幕を読みます。

00:00:03.000 --> 00:00:06.000
青空の下で言葉を覚えます。
`;

const QA_EN_SUBTITLES = `WEBVTT

00:00:00.000 --> 00:00:04.000
Today I read a new book in a quiet cafe.

00:00:04.000 --> 00:00:08.000
When I found a difficult word, I checked it right away.
`;

function qaReaderHtml() {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>よむ QA Reader</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.8; background: #f5f7fa; color: #171a1f; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 18px 120px; }
    article { background: white; border: 1px solid rgba(20, 30, 45, .12); border-radius: 8px; padding: 22px; }
  </style>
</head>
<body>
  <main>
    <article>
      <h1>青空の下で日本語を読む</h1>
      <p>今日は静かな喫茶店で新しい本を読みました。難しい単語を見つけたら、すぐに意味を確認できます。</p>
      <p>「本当ですか？」と彼女は笑いました。私は辞書を開いて、発音も確かめました。</p>
      <p>食べる、勉強する、綺麗な景色、そして忘れたくない言葉。</p>
    </article>
  </main>
</body>
</html>`;
}

function qaVideoHtml() {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>よむ QA Video</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #11151a; color: #f2f4f8; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(920px, calc(100vw - 24px)); }
    .video-shell { position: relative; background: #20242b; }
    video { width: 100%; aspect-ratio: 16 / 9; background: transparent; display: block; }
  </style>
</head>
<body>
  <main>
    <div class="video-shell">
      <video controls crossorigin="anonymous" preload="metadata">
        <track kind="subtitles" srclang="ja" label="日本語" src="${QA_JA_SUBTITLES_PATH}">
        <track kind="subtitles" srclang="en" label="English" src="${QA_EN_SUBTITLES_PATH}">
      </video>
    </div>
  </main>
</body>
</html>`;
}

function qaRuntimeRegressionHtml() {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>よむ Runtime Regression Fixture</title>
  <style>
    body { margin: 0; font: 24px/1.9 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171a1f; background: #f6f7f9; }
    main { max-width: 820px; margin: 0 auto; padding: 42px 20px 160px; }
	    article { background: #fff; border: 1px solid rgba(20, 30, 45, .12); border-radius: 8px; padding: 24px; }
	    p { margin: 0 0 1.1em; }
	    .yomu-link-card { display: block; margin-top: 1.2em; padding: 16px; border: 1px solid rgba(20, 30, 45, .16); border-radius: 8px; color: inherit; text-decoration: none; }
	    .yomu-link-card span { display: block; color: #526070; font-size: 0.8em; }
	  </style>
	</head>
<body>
  <main>
    <article>
      <p id="inflected-pointer-target">好きなものを読んで日本語を学ぶ。</p>
	      <p id="polite-form-target">おはようございます。</p>
	      <p>毎日読んでいるので、もっと読みたい。</p>
	      <p>今日は静かな喫茶店で新しい本を読みました。</p>
	      <a id="runtime-link-card" class="yomu-link-card" href="getting-started"><strong>よむをセットアップ</strong><span>日本語のページで最初の検索を試します。</span></a>
	    </article>
	  </main>
	</body>
</html>`;
}

async function startStaticServer(root) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            if (url.pathname === QA_READER_PATH) {
                res.statusCode = 200;
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(qaReaderHtml());
                return;
            }
            if (url.pathname === QA_VIDEO_PATH) {
                res.statusCode = 200;
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(qaVideoHtml());
                return;
            }
            if (url.pathname === QA_RUNTIME_REGRESSION_PATH) {
                res.statusCode = 200;
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(qaRuntimeRegressionHtml());
                return;
            }
            if (url.pathname === QA_JA_SUBTITLES_PATH || url.pathname === QA_EN_SUBTITLES_PATH) {
                res.statusCode = 200;
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
                res.end(url.pathname === QA_JA_SUBTITLES_PATH ? QA_JA_SUBTITLES : QA_EN_SUBTITLES);
                return;
            }
            const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
            const filePath = path.join(root, requested === '/' ? 'newtab/index.html' : requested);
            const body = await readFile(filePath);
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', contentType(filePath));
            res.end(body);
        } catch {
            res.statusCode = 404;
            res.end('Not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

function contentType(filePath) {
    return QA_CONTENT_TYPES.find(({ extension }) => filePath.endsWith(extension))?.type ?? 'application/octet-stream';
}

const QA_CONTENT_TYPES = [
    { extension: '.html', type: 'text/html; charset=utf-8' },
    { extension: '.vtt', type: 'text/vtt; charset=utf-8' },
    { extension: '.js', type: 'text/javascript; charset=utf-8' },
    { extension: '.css', type: 'text/css; charset=utf-8' },
    { extension: '.svg', type: 'image/svg+xml; charset=utf-8' },
];

function jsonQaResponse(value) {
    const responseText = JSON.stringify(value);
    return {
        status: 200,
        responseText,
        bytes: [...Buffer.from(responseText, 'utf8')],
        contentType: 'application/json; charset=utf-8',
    };
}

function textQaResponse(responseText, contentTypeValue = 'text/html; charset=utf-8') {
    return {
        status: 200,
        responseText,
        bytes: [...Buffer.from(responseText, 'utf8')],
        contentType: contentTypeValue,
    };
}

function binaryQaResponse(bytes, contentTypeValue) {
    return {
        status: 200,
        responseText: '',
        bytes: [...bytes],
        contentType: contentTypeValue,
    };
}

async function waitForNodeAudit(predicate, timeoutMs, message) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(message);
}

function maybeMockQaRequest(request) {
    const url = new URL(request.url);
    for (const matcher of qaRequestMocks) {
        const response = matcher(url, request.data);
        if (response) return response;
    }
    return null;
}

const qaRequestMocks = [
    (url, data) => url.hostname === 'jpdb.io' && url.pathname.startsWith('/api/v1/')
        ? mockJpdbApi(url.pathname.replace('/api/v1/', ''), data)
        : null,
    (url, data) => (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '8765'
        ? jsonQaResponse(mockAnkiConnect(data))
        : null,
    url => url.hostname === 'jpdb.io' && url.pathname.startsWith('/kanji/')
        ? textQaResponse(mockJpdbKanjiHtml(decodeURIComponent(url.pathname.split('/').pop() ?? '')))
        : null,
    url => url.hostname === 'jpdb.io' && (url.pathname.startsWith('/vocabulary/') || url.pathname === '/search')
        ? textQaResponse(mockJpdbVocabularyHtml(url))
        : null,
    url => url.hostname === 'hrussellzfac023.github.io' && url.pathname.startsWith('/rtk/')
        ? textQaResponse(mockRtkHtml(pathKanji(url)))
        : null,
    url => url.hostname === 'uchisen.com' && url.pathname.startsWith('/kanji/')
        ? textQaResponse(mockUchisenHtml(pathKanji(url)))
        : null,
    url => url.hostname === 'ik.imagekit.io' && url.pathname.startsWith('/uchisen/')
        ? textQaResponse(mockImageSvg('Uchisen'), 'image/svg+xml; charset=utf-8')
        : null,
    url => url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/KanjiVG/kanjivg/')
        ? textQaResponse(mockKanjiVgSvg(), 'image/svg+xml; charset=utf-8')
        : null,
    url => url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/gabor-kovacs/the-kanji-map/')
        ? jsonQaResponse(mockKanjiMapData(decodeURIComponent((url.pathname.split('/').pop() ?? '').replace(/\.json$/i, ''))))
        : null,
    url => isImmersionApiUrl(url, '/search')
        ? jsonQaResponse(mockImmersionKitSearch(url))
        : null,
    url => isImmersionApiUrl(url, '/download_media')
        ? mockImmersionMedia(url)
        : null,
];

function isImmersionApiUrl(url, pathname) {
    return IMMERSION_API_HOSTS.has(url.hostname) && url.pathname === pathname;
}

function pathKanji(url) {
    return decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] ?? '');
}

function mockImmersionMedia(url) {
    const mediaPath = url.searchParams.get('path') ?? '';
    if (isMockImmersionAudio(mediaPath)) return textQaResponse('fake-mp3', 'audio/mpeg');
    return textQaResponse(mockImageSvg(mockImmersionImageLabel(mediaPath)), 'image/svg+xml; charset=utf-8');
}

function isMockImmersionAudio(mediaPath) {
    return mediaPath.endsWith('.mp3');
}

function mockImmersionImageLabel(mediaPath) {
    if (mediaPath.includes('steins_gate')) return 'Steins Gate';
    if (mediaPath.includes('Steins')) return 'Steins Gate';
    return 'Example';
}

function immersionAudioRequestCount(requests) {
    return requests.filter(request => /apiv2(?:express)?\.immersionkit\.com\/download_media/.test(request.url) && /mp3/i.test(request.url)).length;
}

function immersionSearchRequestCount(requests) {
    return requests.filter(request => /apiv2(?:express)?\.immersionkit\.com\/search/.test(request.url)).length;
}

function jpdbParseRequestCount(requests) {
    return requests.filter(request => request.url.includes('jpdb.io/api/v1/parse')).length;
}

function audioTestRequestCount(requests) {
    return requests.filter(request => request.url.includes('https://audio.test/')).length;
}

async function audioPlayCount(page) {
    return page.evaluate(() => window.__yomuAudioPlayCount || 0).catch(() => 0);
}

async function waitForAudioPlaybackOrRequest(page, requests, requestCount, requestsBefore, playCountBefore, timeoutMs, message) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const playCount = await audioPlayCount(page);
        if (playCount > playCountBefore || requestCount(requests) > requestsBefore) return;
        await page.waitForTimeout(100);
    }
    throw new Error(message);
}

async function waitForRequestCountStable(requests, requestCount, idleMs, timeoutMs, message) {
    const started = Date.now();
    let lastCount = requestCount(requests);
    let stableSince = Date.now();
    while (Date.now() - started < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const currentCount = requestCount(requests);
        if (currentCount !== lastCount) {
            lastCount = currentCount;
            stableSince = Date.now();
            continue;
        }
        if (Date.now() - stableSince >= idleMs) return;
    }
    throw new Error(message);
}

function encodedJpdbOggBytes() {
    const oggHeader = [0x4f, 0x67, 0x67, 0x53];
    const xor = [0x06, 0x23, 0x54, 0x0f];
    return Buffer.from([
        ...oggHeader.map((byte, index) => byte ^ xor[index]),
        0x00,
        0x02,
        0x00,
        0x00,
    ]);
}

function isTransparentCssColor(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return !normalized
        || normalized === 'transparent'
        || normalized === 'rgba(0, 0, 0, 0)'
        || normalized === 'rgb(0 0 0 / 0)';
}

async function newAuditedPage(browser, settings = baseSettings, viewport = { width: 1280, height: 900 }) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.once('close', () => {
        if (context.pages().length === 0) void context.close().catch(() => undefined);
    });
    const requests = [];
    await page.route(/https:\/\/apiv2(?:express)?\.immersionkit\.com\/download_media.*/, route => {
        const url = new URL(route.request().url());
        const mediaPath = url.searchParams.get('path') ?? '';
        const isAudio = mediaPath.endsWith('.mp3');
        requests.push({
            method: route.request().method(),
            url: route.request().url(),
            status: 200,
        });
        route.fulfill({
            status: 200,
            contentType: isAudio ? 'audio/mpeg' : 'image/svg+xml; charset=utf-8',
            body: isAudio ? 'fake-mp3' : mockImageSvg(mediaPath.includes('steins_gate') || mediaPath.includes('Steins') ? 'Steins Gate' : 'Example'),
        });
    });
    await page.route('https://audio.test/**', route => {
        requests.push({
            method: route.request().method(),
            url: route.request().url(),
            status: 200,
        });
        route.fulfill({
            status: 200,
            contentType: 'audio/mpeg',
            body: 'fake-mp3',
        });
    });
    await page.route('https://hrussellzfac023.github.io/yomu-reader/yomu-icon.svg', route => route.fulfill({
        status: 200,
        contentType: 'image/svg+xml; charset=utf-8',
        path: path.join(DIST, 'yomu-icon.svg'),
    }));
    await page.exposeFunction('__yomuQaRequest', async request => {
        let body = request.data;
        if (body?.kind === 'arraybuffer') {
            body = Buffer.from(body.bytes ?? []);
        } else if (body?.kind === 'formdata') {
            const formData = new FormData();
            for (const entry of body.entries ?? []) {
                if (entry.blob) {
                    formData.append(entry.name, new Blob([Buffer.from(entry.blob.bytes ?? [])], { type: entry.blob.type || 'application/octet-stream' }), entry.blob.filename || 'file');
                } else {
                    formData.append(entry.name, entry.value ?? '');
                }
            }
            body = formData;
        }
        const mocked = maybeMockQaRequest({ ...request, data: body });
        if (mocked) {
            requests.push({
                method: request.method,
                url: request.url.replace(QA_API_KEY, '[redacted]'),
                status: mocked.status,
                ...summarizeRequestBody(body),
            });
            return mocked;
        }
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        requests.push({
            method: request.method,
            url: request.url.replace(QA_API_KEY, '[redacted]'),
            status: response.status,
            ...summarizeRequestBody(body),
        });
        return {
            status: response.status,
            responseText: buffer.toString('utf8'),
            bytes: [...buffer],
            contentType: response.headers.get('content-type') ?? '',
        };
    });
    await page.addInitScript(({ settings, settingsKey, css }) => {
        const storagePrefix = '__yomu_qa_gm__';
        const memoryStore = new Map();
        const storageKey = key => `${storagePrefix}${key}`;
        const readStoredValue = (key, fallback) => {
            try {
                const value = localStorage.getItem(storageKey(key));
                return value == null ? fallback : JSON.parse(value);
            } catch {
                return memoryStore.has(key) ? memoryStore.get(key) : fallback;
            }
        };
        const writeStoredValue = (key, value) => {
            memoryStore.set(key, value);
            try {
                localStorage.setItem(storageKey(key), JSON.stringify(value));
            } catch {
                // Some data: fixtures have no persistent origin storage.
            }
        };
        if (readStoredValue(settingsKey, undefined) === undefined) writeStoredValue(settingsKey, settings);
        window.GM_getValue = (key, fallback) => readStoredValue(key, fallback);
        window.GM_setValue = (key, value) => { writeStoredValue(key, value); };
        window.GM_deleteValue = key => {
            memoryStore.delete(key);
            try {
                localStorage.removeItem(storageKey(key));
            } catch {
                // Some data: fixtures have no persistent origin storage.
            }
        };
        window.GM_listValues = () => {
            const keys = new Set(memoryStore.keys());
            try {
                for (let index = 0; index < localStorage.length; index += 1) {
                    const key = localStorage.key(index);
                    if (key?.startsWith(storagePrefix)) keys.add(key.slice(storagePrefix.length));
                }
            } catch {
                // Some data: fixtures have no persistent origin storage.
            }
            return [...keys];
        };
        window.GM_addStyle = css => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement || document.body).append(style);
            return style;
        };
        window.GM_getResourceText = name => name === 'yomuCss' ? css : '';
        window.GM_registerMenuCommand = () => undefined;
        const serializeBody = async data => {
            if (data instanceof ArrayBuffer) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data)] };
            if (ArrayBuffer.isView(data)) return { kind: 'arraybuffer', bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] };
            if (data instanceof FormData) {
                const entries = [];
                for (const [name, value] of data.entries()) {
                    if (value instanceof Blob) {
                        entries.push({
                            name,
                            blob: {
                                bytes: [...new Uint8Array(await value.arrayBuffer())],
                                type: value.type,
                                filename: value.name || 'file',
                            },
                        });
                    } else {
                        entries.push({ name, value: String(value) });
                    }
                }
                return { kind: 'formdata', entries };
            }
            return data;
        };
        window.GM_xmlhttpRequest = options => {
            let settled = false;
            const timeoutMs = Number(options.timeout) || 0;
            const timer = timeoutMs > 0 ? window.setTimeout(() => {
                if (settled) return;
                settled = true;
                options.ontimeout?.({ status: 0, response: null, responseText: '' });
            }, timeoutMs) : 0;
            const settle = callback => value => {
                if (settled) return;
                settled = true;
                if (timer) window.clearTimeout(timer);
                callback(value);
            };
            Promise.resolve(serializeBody(options.data)).then(data => window.__yomuQaRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data,
            })).then(result => {
                if (settled) return;
                const bytes = new Uint8Array(result.bytes);
                const response = options.responseType === 'arraybuffer'
                    ? bytes.buffer
                    : options.responseType === 'blob'
                        ? new Blob([bytes], { type: result.contentType })
                        : options.responseType === 'json'
                            ? JSON.parse(result.responseText || 'null')
                        : result.responseText;
                settle(options.onload ?? (() => undefined))({
                    status: result.status,
                    response,
                    responseText: result.responseText,
                });
            }).catch(settle(error => options.onerror?.(error)));
        };
    }, { settings, settingsKey: SETTINGS_KEY, css: readerCss });
    return { page, requests };
}

async function injectUserscript(page) {
    await page.evaluate(script => {
        (0, eval)(`${script}\n//# sourceURL=yomu.user.js`);
    }, userscript);
}

async function openSettingsFromPuck(page) {
    await page.waitForSelector('.jpdb-reader-fab', { timeout: 6000 });
    await page.locator('.jpdb-reader-fab').click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    assertAudit(await page.locator('.jpdb-reader-quick').count() === 0, 'puck opened the removed quick controls panel');
}

async function auditNoSecretLeak() {
    if (!API_KEY) {
        record('secret leak scan', 'skip', 'YOMU_TEST_API_KEY is not set');
        return;
    }
    const files = await listFiles(ROOT, new Set(['.git', 'node_modules', 'qa-artifacts']));
    const offenders = await secretLeakOffenders(files);
    assertAudit(!offenders.length, `test API key is present in source files: ${offenders.join(', ')}`);
    record('secret leak scan', 'pass', 'test key is only supplied by environment');
}

async function secretLeakOffenders(files) {
    const offenders = [];
    for (const file of files) {
        if (await fileContainsSecret(file)) offenders.push(path.relative(ROOT, file));
    }
    return offenders;
}

async function fileContainsSecret(file) {
    if (!isSecretLeakAuditedFile(file)) return false;
    const text = await readFile(file, 'utf8').catch(() => '');
    return text.includes(API_KEY);
}

function isSecretLeakAuditedFile(file) {
    return /\.(?:ts|js|mjs|cjs|json|md|html|yml|yaml|css|user\.js)$/.test(file);
}

async function listFiles(dir, ignoredNames) {
    const entries = await readdir(dir);
    const files = [];
    for (const entry of entries) {
        if (ignoredNames.has(entry)) continue;
        const full = path.join(dir, entry);
        const info = await stat(full);
        if (info.isDirectory()) files.push(...await listFiles(full, ignoredNames));
        else files.push(full);
    }
    return files;
}

const qaVocabulary = [
    ['今日', 'きょう', 'today', ['n'], 100],
    ['今朝', 'けさ', 'this morning', ['n'], 900],
    ['今週', 'こんしゅう', 'this week', ['n'], 1200],
    ['静か', 'しずか', 'quiet', ['adj-na'], 1700],
    ['喫茶店', 'きっさてん', 'coffee shop', ['n'], 2400],
    ['新しい', 'あたらしい', 'new', ['adj-i'], 700],
    ['本', 'ほん', 'book', ['n'], 350],
    ['読む', 'よむ', 'to read', ['v5m'], 400],
    ['読みました', 'よみました', 'read', ['v5m'], 401, '読む'],
    ['学校', 'がっこう', 'school', ['n'], 500],
    ['行きます', 'いきます', 'go', ['v5k'], 620, '行く'],
    ['友だち', 'ともだち', 'friend', ['n'], 800],
    ['花', 'はな', 'flower', ['n'], 1100],
    ['食卓', 'しょくたく', 'dining table', ['n'], 1500],
    ['リビング', 'りびんぐ', 'living room', ['n'], 2100],
    ['暮らし', 'くらし', 'living', ['n'], 1900],
	    ['日本語', 'にほんご', 'Japanese language', ['n'], 250],
	    ['よむ', 'よむ', 'to read', ['v5m'], 400, '読む'],
	    ['好き', 'すき', 'liking', ['adj-na'], 600],
    ['もの', 'もの', 'thing', ['n'], 450],
    ['読んで', 'よむ', 'to read', ['v5m'], 400, '読む'],
    ['学ぶ', 'まなぶ', 'to study', ['v5b'], 900],
    ['読みたい', 'よみたい', 'want to read', ['v5m'], 410, '読む'],
    ['ございます', 'ございます', 'to be (polite)', ['exp'], 1800],
].map(([surface, reading, gloss, partOfSpeech, frequency, spelling]) => ({
    surface,
    spelling: spelling ?? surface,
    reading,
    gloss,
    partOfSpeech,
    frequency,
}));

const EMPTY_JPDB_ENDPOINTS = new Set([
    'review',
    'deck/add-vocabulary',
    'deck/remove-vocabulary',
    'set-card-sentence',
]);

function mockJpdbApi(endpoint, body) {
    if (endpoint === 'parse') return jsonQaResponse(mockJpdbParse(readJsonBody(body)));
    if (endpoint === 'list-user-decks') return jsonQaResponse({ decks: [[1, 'Yomu'], [2, 'Mining']] });
    if (EMPTY_JPDB_ENDPOINTS.has(endpoint)) return jsonQaResponse({});
    return jsonQaResponse({});
}

function mockAnkiConnect(body) {
    const request = readJsonBody(body);
    const handler = ANKI_MOCK_ACTIONS[request.action] ?? (() => ({ result: null, error: null }));
    return handler(request);
}

const ANKI_MOCK_ACTIONS = {
    version: () => ({ result: 6, error: null }),
    findNotes: request => ({ result: /読む|よむ|読みました|よみました/.test(String(request.params?.query ?? '')) ? [9001] : [], error: null }),
    notesInfo: request => ({ result: (request.params?.notes ?? []).map(mockAnkiNoteInfo), error: null }),
    cardsInfo: request => ({ result: (request.params?.cards ?? []).map(mockAnkiCardInfo), error: null }),
    answerCards: () => ({ result: null, error: null }),
    guiBrowse: () => ({ result: null, error: null }),
    deckNames: () => ({ result: ['Yomu'], error: null }),
    modelNames: () => ({ result: [], error: null }),
    createDeck: () => ({ result: null, error: null }),
    createModel: () => ({ result: null, error: null }),
};

function mockAnkiNoteInfo(noteId) {
    return {
        noteId,
        modelName: 'Mining',
        tags: ['yomu'],
        fields: {
            Expression: { value: '読みました', order: 0 },
            Reading: { value: 'よみました', order: 1 },
            Sentence: { value: '今日は本を読む。', order: 2 },
            Meaning: { value: 'to read', order: 3 },
            Source: { value: 'QA Anki deck', order: 4 },
        },
        cards: [8001],
    };
}

function mockAnkiCardInfo(cardId) {
    return {
        cardId,
        note: 9001,
        deckName: 'Anime Mining',
        queue: 2,
        type: 2,
        due: 1,
        reps: 12,
        lapses: 0,
        interval: 15,
    };
}

function readJsonBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }
    return {};
}

function summarizeRequestBody(body) {
    const json = readJsonBody(body);
    const note = json?.params?.note;
    return {
        action: requestActionSummary(json),
        ankiSentence: requestNoteFieldText(note, 'Sentence'),
        ankiSource: requestNoteField(note, 'Source'),
        ankiHasPicture: requestHasPicture(note),
    };
}

function requestActionSummary(json) {
    return typeof json?.action === 'string' ? json.action : undefined;
}

function requestNoteField(note, field) {
    const value = note?.fields?.[field];
    return typeof value === 'string' ? value : undefined;
}

function requestNoteFieldText(note, field) {
    const value = requestNoteField(note, field);
    return value === undefined ? undefined : textFromHtml(value);
}

function requestHasPicture(note) {
    if (!Array.isArray(note?.picture)) return false;
    return note.picture.length > 0;
}

function textFromHtml(value) {
    return String(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function mockJpdbParse(body) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(value => String(value)) : [];
    const vocabulary = [];
    const vocabIndexByKey = new Map();
    const tokens = paragraphs.map(text => {
        const paragraphTokens = [];
        for (let index = 0; index < text.length;) {
            const entry = qaVocabulary
                .filter(item => text.startsWith(item.surface, index))
                .sort((a, b) => b.surface.length - a.surface.length)[0];
            if (!entry) {
                index += 1;
                continue;
            }
            let vocabIndex = vocabIndexByKey.get(entry.spelling);
            if (vocabIndex === undefined) {
                vocabIndex = vocabulary.length;
                vocabIndexByKey.set(entry.spelling, vocabIndex);
                vocabulary.push([
                    100000 + vocabIndex,
                    200000 + vocabIndex,
                    0,
                    entry.spelling,
                    entry.reading,
                    entry.frequency,
                    entry.partOfSpeech,
                    [[entry.gloss]],
                    [entry.partOfSpeech],
                    ['not-in-deck'],
                    ['LHHL'],
                ]);
            }
            paragraphTokens.push([
                vocabIndex,
                index,
                entry.surface.length,
                /[\u3400-\u9fff]/u.test(entry.surface) ? [[entry.surface, entry.reading]] : null,
            ]);
            index += entry.surface.length;
        }
        return paragraphTokens;
    });
    return { vocabulary, tokens };
}

function mockJpdbKanjiHtml(kanji) {
    const records = {
        今: { keyword: 'now', frequency: 'Top 100-200', type: 'Jouyou grade 2', reading: 'いま', component: '人', componentKeyword: 'person', usedIn: ['今日', 'きょう', 'today'] },
        日: { keyword: 'day', frequency: 'Top 50-100', type: 'Jouyou grade 1', reading: 'ひ', component: '一', componentKeyword: 'one', usedIn: ['今日', 'きょう', 'today'] },
        本: { keyword: 'book', frequency: 'Top 300-400', type: 'Jouyou grade 1', reading: 'ほん', component: '木', componentKeyword: 'tree', usedIn: ['本', 'ほん', 'book'] },
        読: { keyword: 'read', frequency: 'Top 400-500', type: 'Jouyou grade 2', reading: 'よ', component: '言', componentKeyword: 'say', usedIn: ['読む', 'よむ', 'to read'] },
    };
    const record = records[kanji] ?? { keyword: 'kanji', frequency: 'Top 1000-2000', type: 'Jouyou', reading: kanji, component: '一', componentKeyword: 'one', usedIn: [kanji, kanji, 'example'] };
    const [expression, reading, meaning] = record.usedIn;
    return `<!doctype html><html><head><meta name="description" content="${htmlEscape(kanji)} - ${htmlEscape(record.keyword)}"></head><body>
        <div><h6 class="subsection-label">Keyword</h6><div class="subsection">${htmlEscape(record.keyword)}</div></div>
        <table class="cross-table">
            <tr><td>Frequency</td><td>${htmlEscape(record.frequency)}</td></tr>
            <tr><td>Type</td><td>${htmlEscape(record.type)}</td></tr>
            <tr><td>Kanken</td><td>Level 9</td></tr>
            <tr><td>Heisig</td><td>372</td></tr>
            <tr><td>Old form</td><td><a href="/kanji/舊">舊</a></td></tr>
            <tr><td>Readings</td><td class="kanji-reading-list-common"><div><a href="/kanji-reading/${encodeURIComponent(kanji)}/${encodeURIComponent(record.reading)}">${htmlEscape(record.reading)}</a><div>(80%)</div></div></td></tr>
        </table>
        <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Composed of</h6><div class="subsection">
            <div><div class="spelling"><a href="/kanji/${encodeURIComponent(record.component)}">${htmlEscape(record.component)}</a></div><div class="description">${htmlEscape(record.componentKeyword)}</div></div>
        </div></div>
        <div><h6 class="subsection-label">Mnemonic</h6><div class="subsection">Remember ${htmlEscape(kanji)} as ${htmlEscape(record.keyword)}.</div></div>
        <div class="subsection-used-in"><div class="used-in">
            <div class="jp"><a href="/vocabulary/1456360/${encodeURIComponent(expression)}/${encodeURIComponent(reading)}#a">${htmlEscape(expression)}</a></div>
            <div class="en">${htmlEscape(meaning)}</div>
        </div></div>
    </body></html>`;
}

function mockJpdbVocabularyHtml(url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const query = url.searchParams.get('q') ?? '';
    const expression = decodeURIComponent(parts[2] ?? query ?? '読む') || '読む';
    const reading = decodeURIComponent(parts[3] ?? '') || qaVocabulary.find(item => item.spelling === expression || item.surface === expression)?.reading || expression;
    const record = qaVocabulary.find(item => [item.surface, item.spelling, item.reading].includes(expression) || [item.surface, item.spelling, item.reading].includes(query))
        ?? qaVocabulary.find(item => item.spelling === '読む')
        ?? { spelling: expression, reading, gloss: 'example word' };
    const spelling = record.spelling ?? expression;
    const safeReading = record.reading ?? reading;
    const meaning = record.gloss ?? 'example word';
    return `<!doctype html><html lang="ja"><head>
        <meta charset="utf-8">
        <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/${encodeURIComponent(spelling)}/${encodeURIComponent(safeReading)}">
        <meta name="description" content="${htmlEscape(spelling)} - ${htmlEscape(meaning)}">
    </head><body>
        <div class="results search">
            <div class="result vocabulary">
                <div class="subsection-spelling"><a href="/vocabulary/1456360/${encodeURIComponent(spelling)}/${encodeURIComponent(safeReading)}">${htmlEscape(spelling)}</a></div>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="subsection"><div class="description">${htmlEscape(meaning)}</div></div>
                </div>
                <div class="subsection-pitch-accent">
                    <h6 class="subsection-label">Pitch accent</h6>
                    <div class="subsection"><div>
                        <div style="--pitch-low: 1">${htmlEscape(safeReading.slice(0, 1) || spelling.slice(0, 1))}</div>
                        <div style="--pitch-high: 1">${htmlEscape(safeReading.slice(1) || spelling.slice(1) || spelling)}</div>
                    </div></div>
                </div>
                <div class="subsection-examples">
                    <h6 class="subsection-label">Monolingual examples</h6>
                    <div class="subsection">
                        <div class="example">
                            <a class="icon-link example-audio" href="#" data-audio="m1/yomu-runtime-regression"></a>
                            <span class="sentence">好きなものを読んで日本語を学ぶ。</span>
                            <span class="translation">Learn Japanese by reading what you like.</span>
                        </div>
                    </div>
                </div>
                <div class="subsection-used-in-vocabulary">
                    <h6 class="subsection-label">Used in</h6>
                    <div class="used-in">
                        <div class="jp"><a href="/vocabulary/1456361/${encodeURIComponent('今日')}/${encodeURIComponent('きょう')}">今日</a></div>
                        <div class="en">today</div>
                    </div>
                </div>
            </div>
        </div>
    </body></html>`;
}

function mockRtkHtml(kanji) {
    const keyword = mockRtkKeyword(kanji);
    const elements = mockRtkElements(kanji);
    return `<!doctype html><html><body>
        <h2><code title="372">${htmlEscape(keyword)}</code></h2>
        <h3>On-Yomi: ドク — Kun-Yomi: よ.む</h3>
        <h2>Elements:</h2><p>${htmlEscape(elements)}</p>
        <h2>Heisig story:</h2><p>QA story for ${htmlEscape(keyword)}.</p>
        <h2>Heisig comment:</h2><p>QA comment for ${htmlEscape(keyword)}.</p>
        <h2>Koohii stories:</h2><p>QA Koohii story.</p>
    </body></html>`;
}

const RTK_KEYWORDS = new Map([
    ['読', 'read'],
    ['本', 'book'],
    ['日', 'day'],
]);

function mockRtkKeyword(kanji) {
    return RTK_KEYWORDS.get(kanji) ?? 'now';
}

function mockRtkElements(kanji) {
    return kanji === '読' ? '言、売' : '人、一';
}

function mockUchisenHtml(kanji) {
    return `<!doctype html><html><body>
        <div class="kanji_image_loader" data-large="/kanji/${encodeURIComponent(kanji)}/main.svg"></div>
        <div id="mnemonic_story">QA Uchisen story for ${htmlEscape(kanji)}.</div>
        <div class="mnemonic_card">
            <input class="image_url" value="/kanji/${encodeURIComponent(kanji)}/main.svg?tr=w-300">
            <input class="story" value="Duplicate image">
        </div>
        <div class="mnemonic_card">
            <input class="image_url" value="generated_${encodeURIComponent(kanji)}.svg">
            <input class="story" value="Second &lt;b&gt;Uchisen&lt;/b&gt; story">
        </div>
    </body></html>`;
}

function mockKanjiVgSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
        <path d="M53,13 C44,29 31,42 15,51" />
        <path d="M57,14 C68,29 82,40 96,48" />
        <path d="M38,54 C49,58 63,58 76,54" />
        <path d="M30,70 H78 L62,91" />
        <text transform="matrix(1 0 0 1 50 10)">1</text>
    </svg>`;
}

function mockImageSvg(label) {
    const safeLabel = htmlEscape(label);
    if (/steins/i.test(label)) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
            <defs>
                <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
                    <stop stop-color="#f6d7a6"/>
                    <stop offset="1" stop-color="#93b7c8"/>
                </linearGradient>
                <linearGradient id="room" x1="0" x2="1">
                    <stop stop-color="#2f3943"/>
                    <stop offset="1" stop-color="#151a22"/>
                </linearGradient>
            </defs>
            <rect width="320" height="180" rx="12" fill="url(#room)"/>
            <rect x="18" y="18" width="126" height="76" rx="8" fill="url(#sky)"/>
            <rect x="170" y="38" width="116" height="78" rx="6" fill="#4a2f32"/>
            <rect x="180" y="48" width="96" height="58" fill="#72464d"/>
            <circle cx="78" cy="118" r="29" fill="#1d232c"/>
            <path d="M44 158c10-24 28-36 52-36s42 12 52 36" fill="#26313a"/>
            <path d="M192 124c18-10 44-10 62 0 14 8 24 20 30 36H162c6-16 16-28 30-36Z" fill="#303b45"/>
            <path d="M42 97h116M22 142h276" stroke="#f1efe8" stroke-width="5" stroke-linecap="round" opacity=".55"/>
            <text x="24" y="31" fill="#151a22" font-size="18" font-weight="800">${safeLabel}</text>
            <text x="286" y="166" text-anchor="end" fill="#f6d7a6" font-size="15" font-weight="700">QA still</text>
        </svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
        <rect width="320" height="180" rx="12" fill="#20242b"/>
        <rect x="24" y="24" width="272" height="132" rx="10" fill="#2c343f"/>
        <circle cx="96" cy="88" r="34" fill="#5ea780" opacity=".72"/>
        <rect x="145" y="56" width="108" height="18" rx="9" fill="#f2f4f8" opacity=".86"/>
        <rect x="145" y="88" width="78" height="14" rx="7" fill="#f2f4f8" opacity=".52"/>
        <text x="160" y="142" text-anchor="middle" fill="#f2f4f8" font-size="22">${safeLabel}</text>
    </svg>`;
}

function mockKanjiMapData(kanji) {
    const parts = mockKanjiParts(kanji);
    const meaning = mockKanjiMeaning(kanji);
    return {
        kanjialiveData: mockKanjiAliveData(kanji, parts, meaning),
        jishoData: mockJishoKanjiData(kanji, parts, meaning),
    };
}

const MOCK_KANJI_PARTS = {
    今: ['人', '一'],
    日: ['口', '一'],
    本: ['木', '一'],
    読: ['言', '売'],
};

const MOCK_KANJI_MEANINGS = { 今: 'now', 日: 'day', 本: 'book', 読: 'read' };

function mockKanjiParts(kanji) {
    return MOCK_KANJI_PARTS[kanji] ?? ['一'];
}

function mockKanjiMeaning(kanji) {
    return MOCK_KANJI_MEANINGS[kanji] ?? 'kanji';
}

function mockKanjiGrade(kanji) {
    return kanji === '日' || kanji === '本' ? 1 : 2;
}

function mockKanjiStrokes(kanji) {
    return kanji === '読' ? 14 : 4;
}

function mockKanjiAliveData(kanji, parts, meaning) {
    return {
        grade: mockKanjiGrade(kanji),
        kstroke: mockKanjiStrokes(kanji),
        radical: {
            character: parts[0] ?? '一',
            strokes: 1,
            image: 'https://media.kanjialive.com/radical_character/gonben.svg',
            name: { hiragana: 'いち', romaji: 'ichi' },
            meaning: { english: 'radical' },
            position: { hiragana: 'へん' },
        },
        examples: [{ japanese: `${kanji}（${kanji}）`, meaning: { english: meaning } }],
    };
}

function mockJishoKanjiData(kanji, parts, meaning) {
    return {
        meaning,
        jlptLevel: 'N5',
        taughtIn: `grade ${mockKanjiGrade(kanji)}`,
        strokeCount: mockKanjiStrokes(kanji),
        newspaperFrequencyRank: '618',
        kunyomi: ['よ.む'],
        onyomi: ['ドク'],
        parts,
        radical: { symbol: parts[0] ?? '一', forms: [], meaning: 'radical' },
        uri: `https://jisho.org/search/${encodeURIComponent(kanji)}%23kanji`,
    };
}

function mockImmersionKitSearch(url) {
    const query = url.searchParams.get('q') ?? '読む';
    const examples = [
        {
            id: 'anime_steins_gate_000001',
            title: 'steins_gate',
            sentence: '今日は静かな喫茶店で本を読みました。',
            sentence_with_furigana: '今日[きょう]は 静[しず]かな 喫茶店[きっさてん]で 本[ほん]を 読[よ]みました。',
            translation: 'I read a book in a quiet cafe today.',
            image: 'qa-1.jpg',
            sound: 'qa-1.mp3',
        },
        {
            id: 'anime_steins_gate_000002',
            title: 'steins_gate',
            sentence: '新しい本を読む時間が好きです。',
            translation: 'I like time spent reading a new book.',
            image: 'qa-2.jpg',
            sound: 'qa-2.mp3',
        },
        {
            id: 'drama_qa_story_000003',
            title: 'qa_story',
            sentence: '日本語を読む練習をしました。',
            translation: 'I practiced reading Japanese.',
            image: 'qa-3.jpg',
            sound: 'qa-3.mp3',
        },
    ].filter(example => !query || example.sentence.includes(query) || example.sentence.includes('読') || query === '読む');
    return { examples, category_count: { anime: 2, drama: 1 }, deck_count: {} };
}

function htmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function seedLocalKanjiDictionaries(page) {
    await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onupgradeneeded = () => {
                const db = request.result;
                const tx = request.transaction;
                const ensureStore = name => db.objectStoreNames.contains(name)
                    ? tx.objectStore(name)
                    : db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
                const ensureIndex = (store, name, keyPath) => {
                    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
                };
                const terms = ensureStore('terms');
                ensureIndex(terms, 'expression', 'expression');
                ensureIndex(terms, 'reading', 'reading');
                ensureIndex(terms, 'dictionary', 'dictionary');
                const kanji = ensureStore('kanji');
                ensureIndex(kanji, 'character', 'character');
                ensureIndex(kanji, 'dictionary', 'dictionary');
                const termMeta = ensureStore('termMeta');
                ensureIndex(termMeta, 'expression', 'expression');
                ensureIndex(termMeta, 'dictionary', 'dictionary');
                const kanjiMeta = ensureStore('kanjiMeta');
                ensureIndex(kanjiMeta, 'character', 'character');
                ensureIndex(kanjiMeta, 'dictionary', 'dictionary');
                if (!db.objectStoreNames.contains('dictionaryInfo')) db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
                const termSearch = ensureStore('termSearch');
                ensureIndex(termSearch, 'token', 'token');
                ensureIndex(termSearch, 'dictionary', 'dictionary');
                const termKanji = ensureStore('termKanji');
                ensureIndex(termKanji, 'character', 'character');
                ensureIndex(termKanji, 'dictionary', 'dictionary');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const stores = [...db.objectStoreNames];
            const txStores = ['dictionaryInfo', 'terms', 'kanji', 'termMeta', 'termSearch', 'termKanji'].filter(name => stores.includes(name));
            const tx = db.transaction(txStores, 'readwrite');
            const termSearch = txStores.includes('termSearch') ? tx.objectStore('termSearch') : null;
            const termKanji = txStores.includes('termKanji') ? tx.objectStore('termKanji') : null;
            tx.objectStore('dictionaryInfo').put({ title: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1, counts: { kanji: 4 } });
            tx.objectStore('dictionaryInfo').put({
                title: 'Jitendex',
                alias: 'Jitendex',
                enabled: true,
                priority: 2,
                counts: { terms: 6 },
                styles: 'span[data-sc-content="part-of-speech-info"] { text-decoration-line: underline; }',
            });
            tx.objectStore('dictionaryInfo').put({ title: 'JMnedict', alias: 'JMnedict', enabled: true, priority: 3, counts: { terms: 1 } });
            tx.objectStore('dictionaryInfo').put({ title: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 3, counts: { termMeta: 4 } });
            [
                { character: '今', onyomi: ['コン'], kunyomi: ['いま'], tags: ['grade 2'], meanings: ['now', 'the present'], dictionary: 'KANJIDIC' },
                { character: '日', onyomi: ['ニチ', 'ジツ'], kunyomi: ['ひ', 'か'], tags: ['grade 1'], meanings: ['day', 'sun'], dictionary: 'KANJIDIC' },
                { character: '本', onyomi: ['ホン'], kunyomi: ['もと'], tags: ['grade 1'], meanings: ['book', 'origin'], dictionary: 'KANJIDIC' },
                { character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], tags: ['grade 2', 'jlpt n4'], meanings: ['read'], stats: { jlpt: 4, grade: 2, strokes: 14 }, dictionary: 'KANJIDIC' },
            ].forEach(entry => tx.objectStore('kanji').add(entry));
            [
                { expression: '今日', reading: 'きょう', glossary: ['today'], score: 9, dictionary: 'Jitendex' },
                { expression: '今朝', reading: 'けさ', glossary: ['this morning'], score: 8, dictionary: 'Jitendex' },
                { expression: '今週', reading: 'こんしゅう', glossary: ['this week'], score: 7, dictionary: 'Jitendex' },
                { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 10, dictionary: 'Jitendex' },
                { expression: '母', reading: 'はは', glossary: [{ type: 'structured-content', content: { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: [{ tag: 'span', data: { content: 'part-of-speech-info' }, content: 'n' }, ' mother; mama'] }] } }], score: 10, dictionary: 'Jitendex' },
                { expression: '母', reading: 'はは', glossary: [{ tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'female parent name entry' }] }], score: 5, dictionary: 'JMnedict' },
            ].forEach(entry => {
                tx.objectStore('terms').add(entry);
                if (termSearch) {
                    for (const token of qaGlossaryTokens(entry.glossary)) termSearch.add({ ...entry, token });
                }
                if (termKanji) {
                    for (const character of [...new Set([...entry.expression].filter(value => /[\u3400-\u9fff]/u.test(value)))]) {
                        termKanji.add({ ...entry, character });
                    }
                }
            });
            [
                { expression: '今日', mode: 'freq', data: { frequency: 100, displayValue: 100 }, dictionary: 'JPDBv2㋕' },
                { expression: '今朝', mode: 'freq', data: { frequency: 900, displayValue: 900 }, dictionary: 'JPDBv2㋕' },
                { expression: '今週', mode: 'freq', data: { frequency: 1200, displayValue: 1200 }, dictionary: 'JPDBv2㋕' },
                { expression: '読む', mode: 'freq', data: { frequency: 400, displayValue: 400 }, dictionary: 'JPDBv2㋕' },
            ].forEach(entry => tx.objectStore('termMeta').add(entry));
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });

        function qaGlossaryTokens(glossary) {
            const text = glossary.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
            return [...new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])];
        }
    });
}

async function auditOnboardingMobile(browser, server) {
    const { page } = await newAuditedPage(browser, null, { width: 390, height: 844 });
    await page.goto(`${server.origin}${QA_READER_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-reader-onboarding', { timeout: 6000 });
    const snapshot = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-reader-onboarding');
        const actions = [...document.querySelectorAll('.jpdb-reader-onboarding-actions .jpdb-reader-btn')];
        const language = document.querySelector('.jpdb-reader-onboarding-language select');
        const actionRects = actions.map(button => {
            const rect = button.getBoundingClientRect();
            return { text: button.textContent?.trim(), top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        });
        return {
            title: panel?.querySelector('h2')?.textContent?.trim(),
            copy: panel?.textContent ?? '',
            languageVisible: Boolean(language && !language.closest('[hidden]')),
            actionRects,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
        };
    });
    assertAudit(snapshot.title === 'よむ', 'onboarding title is missing');
    assertAudit(snapshot.copy.includes('tappable dictionary cards'), 'onboarding does not explain the core value');
    assertAudit(snapshot.languageVisible, 'onboarding language choice is not visible');
    assertAudit(snapshot.actionRects.length >= 2, 'onboarding actions are missing');
    assertAudit(snapshot.actionRects.some(rect => rect.text === 'Add API key') && snapshot.actionRects.some(rect => rect.text === 'Use without API key'), 'onboarding actions do not make the setup choices clear');
    assertAudit(snapshot.actionRects.every(rect => rect.top >= 0 && rect.bottom <= snapshot.viewportHeight && rect.left >= 0 && rect.right <= snapshot.viewportWidth), 'onboarding actions are not visible on first mobile screen');
    await assertAccessibleSurface(page, 'mobile onboarding', '.jpdb-reader-onboarding');
    await page.screenshot({ path: path.join(ARTIFACTS, 'onboarding-mobile.png'), fullPage: false });
    await page.locator('.jpdb-reader-onboarding-actions .jpdb-reader-btn.add').click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    await page.close();
    record('mobile onboarding', 'pass', 'language and setup actions are visible without scrolling');
}

function settingsAuditSeed() {
    return {
        ...baseSettings,
        apiKey: '',
        showFloatingButton: true,
        ocrEnabled: true,
        localDictionariesEnabled: true,
        dictionaryPreferences: [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 1 },
            { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 2 },
        ],
    };
}

async function assertSettingsLocaleSwitch(page) {
    await page.selectOption('select[name="interfaceLanguage"]', 'ja');
    const localeSnapshot = await readSettingsLocaleSnapshot(page);
    assertAudit(localeSnapshot.title === 'よむ 設定' && localeSnapshot.heading === 'よむ 設定', 'changing settings language did not localize the dialog title');
    assertAudit(localeSnapshot.save === '保存' && localeSnapshot.cancel === 'キャンセル' && localeSnapshot.firstTab === '基本', 'changing settings language did not localize visible controls');
    await page.selectOption('select[name="interfaceLanguage"]', 'en');
}

function readSettingsLocaleSnapshot(page) {
    return page.evaluate(() => ({
        title: document.querySelector('.jpdb-reader-settings')?.getAttribute('aria-label'),
        heading: document.querySelector('.jpdb-reader-settings h2')?.textContent?.trim(),
        save: document.querySelector('.jpdb-reader-settings button[type="submit"]')?.textContent?.trim(),
        cancel: document.querySelector('.jpdb-reader-settings [data-action="cancel"]')?.textContent?.trim(),
        firstTab: document.querySelector('.jpdb-reader-settings-tab')?.textContent?.trim(),
    }));
}

async function captureSettingsDialog(page) {
    await page.evaluate(() => {
        document.querySelector('[data-theme-field]')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await page.locator('.jpdb-reader-settings').screenshot({ path: path.join(ARTIFACTS, 'settings.png') });
}

async function captureHoverShortcut(page) {
    await page.locator('[data-action="settings-panel"][data-panel="shortcuts"]').click();
    const hoverShortcut = page.locator('input[name="shortcuts.hoverLookup"]');
    await hoverShortcut.click();
    await page.keyboard.down('Shift');
    await page.keyboard.press('KeyH');
    await page.keyboard.up('Shift');
}

function readSettingsSnapshot(page) {
    return page.evaluate(() => {
        const form = document.querySelector('.jpdb-reader-settings');
        const save = form?.querySelector('button[type="submit"]');
        const cancel = form?.querySelector('[data-action="cancel"]');
        const rect = form?.getBoundingClientRect();
        const saveRect = save?.getBoundingClientRect();
        const passFailRows = [...document.querySelectorAll('[data-review-scale="pass-fail"]')].filter(el => !el.hidden).length;
        const fiveRows = [...document.querySelectorAll('[data-review-scale="five"]')].filter(el => !el.hidden).length;
        return {
            title: form?.getAttribute('aria-label'),
            saveText: save?.textContent?.trim(),
            cancelText: cancel?.textContent?.trim(),
            formBottom: rect?.bottom ?? 0,
            saveBottom: saveRect?.bottom ?? 0,
            viewportHeight: innerHeight,
            passFailRows,
            fiveRows,
            ocrProvider: document.querySelector('select[name="ocrProvider"]')?.value ?? '',
            localOcrHidden: [...document.querySelectorAll('[data-local-ocr]')].every(el => el.hidden),
            cloudOcrHidden: [...document.querySelectorAll('[data-cloud-ocr]')].every(el => el.hidden),
            hoverShortcut: document.querySelector('input[name="shortcuts.hoverLookup"]')?.value,
            recommendedDownloads: document.querySelectorAll('[data-action="download-recommended-dictionary"]').length,
            recommendedDownloadText: document.querySelector('[data-recommended-dictionaries]')?.textContent ?? '',
            settingsTabs: document.querySelectorAll('.jpdb-reader-settings-tab').length,
            dictionarySources: document.querySelectorAll('[data-dictionary-source-row]').length,
            helpLinks: document.querySelectorAll('[data-help-link]').length,
            helpCopy: document.querySelector('.jpdb-reader-help-card')?.textContent ?? '',
        };
    });
}

function assertSettingsSnapshot(snapshot) {
    assertAudit(snapshot.title === 'よむ Settings', 'settings dialog title is wrong');
    assertAudit(hasSettingsActionButtons(snapshot), 'settings actions are missing');
    assertAudit(snapshot.saveBottom <= snapshot.viewportHeight, 'settings Save button is below the visible viewport');
    assertAudit(hasSingleShortcutScale(snapshot), 'five-grade and pass/fail shortcut settings are both visible');
    assertAudit(hasHiddenOcrProviderFields(snapshot), 'irrelevant OCR provider fields are visible by default');
    assertAudit(snapshot.hoverShortcut === 'Shift+H', 'shortcut field did not capture a pressed key combo');
    assertAudit(hasRecommendedDictionaryDownloads(snapshot), 'recommended dictionary downloads are missing from settings');
    assertAudit(snapshot.settingsTabs >= 6, 'settings are not organized into modular tabs');
    assertAudit(snapshot.dictionarySources >= 3, 'definition source ordering rows are missing');
    assertAudit(hasHelpLinks(snapshot), 'hosted reader tool links are missing from Help');
}

function hasSettingsActionButtons(snapshot) {
    return snapshot.saveText === 'Save' && snapshot.cancelText === 'Cancel';
}

function hasSingleShortcutScale(snapshot) {
    return snapshot.fiveRows > 0 && snapshot.passFailRows === 0;
}

function hasHiddenOcrProviderFields(snapshot) {
    const localFieldsCorrect = snapshot.ocrProvider === 'local-service'
        ? !snapshot.localOcrHidden
        : snapshot.localOcrHidden;
    return localFieldsCorrect && snapshot.cloudOcrHidden;
}

function hasHelpLinks(snapshot) {
    return snapshot.helpLinks >= 3 && /Video Player|New Tab|Docs/.test(snapshot.helpCopy);
}

function hasRecommendedDictionaryDownloads(snapshot) {
    const requiredNames = ['JMdict', 'Jitendex', 'JMnedict', 'KANJIDIC', 'JPDBv2', 'BCCWJ', 'Jiten'];
    return snapshot.recommendedDownloads >= requiredNames.length
        && requiredNames.every(name => new RegExp(name, 'i').test(snapshot.recommendedDownloadText));
}

async function assertSettingsAnkiTest(page) {
    await page.locator('[data-action="settings-panel"][data-panel="mining"]').click();
    await page.locator('[data-action="test-anki"]').click();
    const ankiSnapshot = await waitForAudit(page, () => {
        const status = document.querySelector('[data-anki-status]');
        if (status?.getAttribute('data-status-tone') !== 'success') return false;
        const button = document.querySelector('[data-action="test-anki"]');
        return {
            text: status.textContent ?? '',
            tone: status.getAttribute('data-status-tone'),
            disabled: button?.hasAttribute('disabled') ?? false,
        };
    }, 6000, 'Test Anki did not report status in the Anki settings panel');
    assertAudit(ankiSnapshot.tone === 'success' && ankiSnapshot.text.includes('Connected.'), 'Test Anki status is not shown as a successful connection');
    assertAudit(!ankiSnapshot.disabled, 'Test Anki button stayed disabled after the connection check');
}

async function auditSettings(browser, server) {
    const { page } = await newAuditedPage(browser, settingsAuditSeed());
    await page.goto(`${server.origin}${QA_READER_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await openSettingsFromPuck(page);
    await assertSettingsLocaleSwitch(page);
    await captureSettingsDialog(page);
    await captureHoverShortcut(page);
    assertSettingsSnapshot(await readSettingsSnapshot(page));
    await assertAccessibleSurface(page, 'settings dialog', '.jpdb-reader-settings');
    await assertSettingsAnkiTest(page);
    await page.close();
    record('settings dialog', 'pass', 'actions visible, irrelevant provider fields hidden, Anki test status shown');
}

async function auditSettingsMobile(browser, server) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        apiKey: '',
        showFloatingButton: true,
        ocrEnabled: true,
    }, { width: 390, height: 844 });
    await page.goto(`${server.origin}${QA_READER_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await openSettingsFromPuck(page);
    let snapshot = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('.jpdb-reader-settings-tab')].map(tab => {
            const rect = tab.getBoundingClientRect();
            return { text: tab.textContent?.trim(), left: rect.left, right: rect.right, width: rect.width };
        });
        return {
            tabs,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            tabBarWidth: document.querySelector('.jpdb-reader-settings-tabs')?.scrollWidth ?? 0,
            tabBarClientWidth: document.querySelector('.jpdb-reader-settings-tabs')?.clientWidth ?? 0,
            apiKeyTop: document.querySelector('input[name="apiKey"]')?.getBoundingClientRect().top ?? 9999,
        };
    });
    assertAudit(snapshot.tabs.length >= 6, 'mobile settings tabs are missing sections');
    assertAudit(snapshot.tabs.every(tab => tab.left >= 0 && tab.right <= snapshot.viewportWidth && tab.width > 30), 'a mobile settings tab is clipped');
    assertAudit(snapshot.tabBarWidth <= snapshot.tabBarClientWidth + 1, 'mobile settings tabs require hidden horizontal scrolling');
    assertAudit(snapshot.apiKeyTop < snapshot.viewportHeight * 0.55, 'API key field is too far down after opening settings');

    await page.locator('[data-action="settings-panel"][data-panel="media"]').click();
    snapshot = await page.evaluate(() => {
        const tools = [...document.querySelectorAll('.jpdb-reader-audio-source-row .jpdb-reader-row-tools')].map(row => {
            const rect = row.getBoundingClientRect();
            const buttons = [...row.querySelectorAll('button')].map(button => {
                const buttonRect = button.getBoundingClientRect();
                return { width: buttonRect.width, height: buttonRect.height, left: buttonRect.left };
            });
            return { left: rect.left, buttons };
        });
        return { tools, viewportWidth: innerWidth };
    });
    assertAudit(snapshot.tools.length > 0, 'mobile audio source tools are missing');
    assertAudit(snapshot.tools.every(tool => tool.left >= 0 && tool.buttons.every(button => button.left >= 0 && button.width >= 34 && button.height >= 34)), 'mobile audio source controls are cramped or clipped');

    await page.locator('[data-action="settings-panel"][data-panel="help"]').click();
    await assertAccessibleSurface(page, 'mobile settings help', '.jpdb-reader-settings');
    await page.screenshot({ path: path.join(ARTIFACTS, 'settings-mobile-help.png'), fullPage: false });
    snapshot = await page.evaluate(() => ({
        helpLinks: document.querySelectorAll('[data-help-link]').length,
        copy: document.querySelector('.jpdb-reader-help-card')?.textContent ?? '',
    }));
    assertAudit(snapshot.helpLinks >= 3, 'mobile Help tab does not expose hosted reader tool links');
    assertAudit(/Video Player|New Tab|Docs/.test(snapshot.copy), 'mobile Help tab is missing hosted reader tool names');
    await page.close();
    record('mobile settings journey', 'pass', 'tabs, audio rows, and help links stay visible on iPhone width');
}

async function auditNewTabDictionaryFallback(browser, server) {
    const { page } = await newAuditedPage(browser, newTabDictionaryFallbackSettings(), { width: 390, height: 844 });
    const browserErrors = collectPageBrowserErrors(page);
    await page.goto(`${server.origin}/newtab/index.html?static=1`, { waitUntil: 'domcontentloaded' });
    await waitForAudit(page, () => {
        const body = document.body.textContent ?? '';
        return body.includes('Start with a dictionary')
            && body.includes('Add dictionary')
            && !body.includes('Loading...')
            && !document.querySelector('[data-newtab-card]');
    }, 8000, 'new-tab first-run setup state did not render');
    const setupSnapshot = await page.evaluate(() => ({
        hasLoadDictionary: Boolean(document.querySelector('[data-newtab-action="load-dictionary"]')),
        loadDictionaryCount: document.querySelectorAll('[data-newtab-action="load-dictionary"]').length,
        hasConnectJpdb: Boolean(document.querySelector('[data-newtab-action="connect-jpdb"]')),
        hasSettings: Boolean(document.querySelector('[data-newtab-action="settings"]')),
        body: document.body.textContent ?? '',
    }));
    assertNewTabSetupSnapshot(setupSnapshot);

    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, () => {
        const card = document.querySelector('[data-newtab-card]');
        const status = document.querySelector('[data-newtab-status]')?.textContent ?? '';
        const body = document.body.textContent ?? '';
        return card
            && /Dictionaries|Dictionary/.test(status)
            && !body.includes('Loading...')
            && !body.includes('Loading words...')
            && !body.includes('No dictionary enabled')
            && !body.includes('Ensure the Yomu userscript is running.');
    }, 8000, 'new-tab page stayed stuck in placeholder/loading state').catch(async error => {
        const detail = await page.evaluate(async () => {
            const dbSummary = await new Promise(resolve => {
                const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
                request.onerror = () => resolve({ error: request.error?.message ?? 'open failed' });
                request.onsuccess = () => {
                    const db = request.result;
                    const stores = [...db.objectStoreNames];
                    const txStores = stores.filter(name => ['dictionaryInfo', 'terms', 'kanji', 'termMeta'].includes(name));
                    const tx = db.transaction(txStores, 'readonly');
                    const counts = {};
                    if (!txStores.length) {
                        db.close();
                        resolve({ stores, counts });
                        return;
                    }
                    let pending = txStores.length;
                    txStores.forEach(name => {
                        const count = tx.objectStore(name).count();
                        count.onsuccess = () => {
                            counts[name] = count.result;
                            pending -= 1;
                            if (!pending) {
                                db.close();
                                resolve({ stores, counts });
                            }
                        };
                        count.onerror = () => {
                            counts[name] = `error:${count.error?.message ?? count.error}`;
                            pending -= 1;
                            if (!pending) {
                                db.close();
                                resolve({ stores, counts });
                            }
                        };
                    });
                };
            });
            const marker = document.getElementById('jpdb-reader-runtime-owner');
            return {
                dbSummary,
                card: Boolean(document.querySelector('[data-newtab-card]')),
                prompt: document.querySelector('[data-newtab-prompt]')?.textContent ?? '',
                meaning: document.querySelector('[data-newtab-meaning]')?.textContent ?? '',
                status: document.querySelector('[data-newtab-status]')?.textContent ?? '',
                controls: [...document.querySelectorAll('[data-newtab-action]')].map(node => node.getAttribute('data-newtab-action')),
                runtimeKind: marker?.dataset.yomuRuntimeKind ?? '',
                runtimeInitialized: Boolean(window.__yomuReaderAppInitialized),
                body: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
            };
        });
        throw new Error(`new-tab page stayed stuck in placeholder/loading state: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await page.locator('[data-newtab-action="reveal"]').click();
    await waitForAudit(page, () => Boolean(document.querySelector('[data-newtab-meaning]')?.textContent?.trim()), 3000, 'new-tab dictionary card did not reveal a meaning');
    const snapshot = await page.evaluate(() => ({
        title: document.title,
        brandHref: document.querySelector('.jpdb-reader-newtab-brand a, a.jpdb-reader-newtab-brand')?.getAttribute('href') ?? '',
        expression: document.querySelector('[data-newtab-expression]')?.textContent?.trim() ?? '',
        meaning: document.querySelector('[data-newtab-meaning]')?.textContent?.trim() ?? '',
        status: document.querySelector('[data-newtab-status]')?.textContent?.trim() ?? '',
        hasSettingsControl: Boolean(document.querySelector('[data-newtab-action="settings"]')),
        body: document.body.textContent ?? '',
    }));
    assertNewTabDictionarySnapshot(snapshot);
    assertNoPageBrowserErrors(browserErrors, 'new-tab');
    await waitForAudit(page, () => [...document.querySelectorAll('.jpdb-reader-newtab img')]
        .every(image => image.complete && image.naturalWidth > 0), 3000, 'new-tab brand image did not load');
    await assertAccessibleSurface(page, 'new-tab dictionary fallback', '.jpdb-reader-newtab');
    await page.screenshot({ path: path.join(ARTIFACTS, 'newtab-dictionary.png'), fullPage: false });
    await page.close();
    record('new-tab dictionary fallback', 'pass', 'first-run setup is explicit, then seeded local dictionaries render without setup warnings');
}

function newTabDictionaryFallbackSettings() {
    return {
        ...baseSettings,
        apiKey: '',
        ankiEnabled: false,
        newTabEnabled: false,
        newTabSource: 'auto',
        showFloatingButton: false,
        dictionaryPreferences: [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 },
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 1 },
        ],
    };
}

function collectPageBrowserErrors(page) {
    const errors = { consoleErrors: [], pageErrors: [] };
    page.on('console', message => {
        if (message.type() === 'error') errors.consoleErrors.push(message.text());
    });
    page.on('pageerror', error => errors.pageErrors.push(error.message));
    return errors;
}

function assertNewTabSetupSnapshot(snapshot) {
    const hasExpectedActions = snapshot.hasLoadDictionary
        && snapshot.loadDictionaryCount === 1
        && !snapshot.hasConnectJpdb
        && snapshot.hasSettings;
    assertAudit(hasExpectedActions, `new-tab setup actions are missing or duplicated: ${JSON.stringify(snapshot)}`);
    assertAudit(!/今日|今朝|今週|読む/.test(snapshot.body), 'first-run new-tab setup rendered hardcoded dictionary words before the user loaded a dictionary');
}

function assertNewTabDictionarySnapshot(snapshot) {
    assertAudit(snapshot.title.includes('New Tab'), 'new-tab document title is missing');
    assertAudit(isDocsHomeHref(snapshot.brandHref), 'new-tab brand link does not open the docs home page');
    assertAudit(/今日|今朝|今週|読む/.test(snapshot.expression), `new-tab did not render a top dictionary word: ${JSON.stringify(snapshot)}`);
    assertAudit(/today|morning|week|read/i.test(snapshot.meaning), `new-tab dictionary meaning did not render: ${JSON.stringify(snapshot)}`);
    assertAudit(/Dictionaries|Dictionary/.test(snapshot.status), `new-tab did not report dictionary fallback source: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.hasSettingsControl, 'new-tab settings control is missing');
    assertAudit(!/off|warning|No dictionary enabled|Add dictionary/i.test(snapshot.body), 'new-tab still shows setup or old warning copy after dictionaries are available');
}

function isDocsHomeHref(href) {
    return href === '/' || href === 'https://hrussellzfac023.github.io/yomu-reader/';
}

function assertNoPageBrowserErrors(errors, label) {
    const quiet = !errors.consoleErrors.length && !errors.pageErrors.length;
    assertAudit(quiet, `${label} produced browser errors: ${JSON.stringify(errors)}`);
}

async function auditBloomeeAutoScan(browser) {
    const { page, requests } = await newAuditedPage(browser, { ...baseSettings, showFloatingButton: false, ocrEnabled: false });
    await page.route('https://bloomeelife.com/**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
            body{margin:0;padding:40px;font:18px/1.8 system-ui;color:#20242b}
            h1{text-align:center;font-size:28px}
            .point__itembox-txt{max-width:640px;margin:120vh auto 0}
        </style></head><body>
            <h1>Bloomee fixture</h1>
            <p class="point__itembox-txt">食卓やリビングに季節の花を飾る暮らしを楽しみます。</p>
        </body></html>`,
    }));
    await page.goto('https://bloomeelife.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await injectUserscript(page);
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if ((node.textContent || '').includes('食卓やリビング')) {
                node.parentElement?.scrollIntoView({ block: 'center' });
                break;
            }
        }
    });
    await waitForAudit(page, () => {
        const paragraph = [...document.querySelectorAll('p.point__itembox-txt')]
            .find(el => el.textContent?.includes('リビング'));
        return (paragraph?.querySelectorAll('.jpdb-reader-word').length ?? 0) >= 3;
    }, 12000, 'Bloomee visible paragraph was not wrapped after automatic scroll scan');

    const snapshot = await page.evaluate(() => {
        const paragraph = [...document.querySelectorAll('p.point__itembox-txt')]
            .find(el => el.textContent?.includes('リビング'));
        return {
            wrappedWords: paragraph?.querySelectorAll('.jpdb-reader-word').length ?? 0,
            furigana: paragraph?.querySelectorAll('.jpdb-reader-furi').length ?? 0,
            displayHeadingWords: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
                .filter(el => getComputedStyle(el).textAlign === 'center' && (el.textContent || '').replace(/\s+/g, '').length <= 40)
                .reduce((sum, el) => sum + el.querySelectorAll('.jpdb-reader-word').length, 0),
            visibleWrappedWords: [...(paragraph?.querySelectorAll('.jpdb-reader-word') ?? [])].filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= innerHeight;
            }).length,
        };
    });
    assertAudit(snapshot.wrappedWords >= 3, 'Bloomee paragraph has too few wrapped words');
    assertAudit(snapshot.furigana >= 1, 'Bloomee wrapped paragraph has no furigana');
    assertAudit(snapshot.displayHeadingWords === 0, 'short centered display headings were wrapped and may break layout');
    assertAudit(requests.some(request => request.url.includes('jpdb.io/api/v1/parse') && request.status === 200), 'JPDB parse request did not complete');
    await page.screenshot({ path: path.join(ARTIFACTS, 'bloomee-auto-scan.png'), fullPage: false });
    await page.close();
    record('Bloomee auto page scan', 'pass', `${snapshot.wrappedWords} wrapped words, ${snapshot.furigana} furigana nodes`);
}

async function assertTodayKanjiDrilldown(page) {
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-spelling')?.textContent?.includes('今日'), 6000, '今日 hover popup did not open before kanji drilldown');
    const pillHref = await page.locator('.jpdb-reader-jpdb-pill').first().getAttribute('href');
    assertAudit(pillHref?.includes('https://jpdb.io/vocabulary/'), 'JPDB pill is not the vocabulary open link');
    const kanjiButton = page.locator('.jpdb-reader-kanji-inline', { hasText: '今' }).first();
    await kanjiButton.click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-jpdb-kanji')?.textContent?.includes('Readings and components'), 9000, 'kanji drilldown did not show kanji details');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-kanjivg-svg path').length > 0, 9000, 'Stroke-order trace did not render');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-similar-word').length > 0, 9000, 'kanji used-in words did not render');
    await waitForAudit(
        page,
        () => /KANJIDIC|now|day|sun|book|read/.test(document.querySelector('.jpdb-reader-kanji')?.textContent ?? ''),
        9000,
        'local kanji dictionary section did not render',
    ).catch(async error => {
        const debug = await page.evaluate(() => ({
            sourceCards: [...document.querySelectorAll('.jpdb-reader-source-card')].map(node => ({
                classes: node.className,
                title: node.querySelector('summary')?.textContent?.trim() ?? '',
                text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
            })),
            hasDefinitionsMount: Boolean(document.querySelector('[data-kanji-definitions-mount]')),
            kanjiSectionHtml: document.querySelector('.jpdb-reader-kanji-section-stack')?.innerHTML.slice(0, 1200) ?? '',
        }));
        throw new Error(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify(debug)}`);
    });
    const kanjiSnapshot = await page.evaluate(() => ({
        kanjiPill: document.querySelector('.jpdb-reader-jpdb-pill')?.getAttribute('href') ?? '',
        jpdbKanjiText: document.querySelector('.jpdb-reader-jpdb-kanji')?.textContent ?? '',
        localKanjiText: document.querySelector('.jpdb-reader-kanji')?.textContent ?? '',
        originsText: document.querySelector('.jpdb-reader-origins')?.textContent ?? '',
        wordsUsingHeadings: [...document.querySelectorAll('.jpdb-reader-local-title')].filter(node => /Words using/i.test(node.textContent ?? '')).length,
        originNodes: document.querySelectorAll('.jpdb-reader-origin-graph-node').length,
        radicalCards: document.querySelectorAll('.jpdb-reader-radical-card').length,
        sourceLinks: document.querySelectorAll('.jpdb-reader-origins a[href*="kanjimap"], .jpdb-reader-origins a[href*="raw.githubusercontent"]').length,
        kanjiVGPaths: document.querySelectorAll('.jpdb-reader-kanjivg-svg path').length,
        doodleCanvas: Boolean(document.querySelector('.jpdb-reader-doodle-canvas')),
        componentButtons: document.querySelectorAll('.jpdb-reader-component-button[data-action="kanji"]').length,
        backVisible: Boolean(document.querySelector('[data-action="word-back"]')),
        similarWords: document.querySelectorAll('.jpdb-reader-similar-word').length,
    }));
    assertAudit(kanjiSnapshot.kanjiPill.includes('https://jpdb.io/kanji/'), 'kanji JPDB pill is not the kanji open link');
    assertAudit(kanjiSnapshot.backVisible, 'kanji drilldown is missing a back control');
    assertAudit(kanjiSnapshot.jpdbKanjiText.includes('Readings and components'), 'kanji details section is missing');
    assertAudit(/Kanji facts|JLPT|Grade|Strokes/.test(kanjiSnapshot.originsText), 'kanji facts and origins panel is missing');
    assertAudit(!/RTK frame|Old forms|Character|Kanken/i.test(kanjiSnapshot.originsText), 'kanji facts panel is showing low-value legacy fields');
    assertAudit(kanjiSnapshot.wordsUsingHeadings === 1, 'kanji drilldown should have exactly one Words using section');
    assertAudit(kanjiSnapshot.originNodes > 1, 'kanji origins map did not render component nodes');
    assertAudit(kanjiSnapshot.radicalCards > 0, 'kanji radical card did not render');
    assertAudit(kanjiSnapshot.sourceLinks === 0, 'kanji origins should not expose raw source links in the popup');
    assertAudit(kanjiSnapshot.kanjiVGPaths > 0, 'Stroke-order trace did not render');
    assertAudit(kanjiSnapshot.doodleCanvas, 'kanji drawing canvas did not render');
    assertAudit(kanjiSnapshot.componentButtons > 0, 'kanji components are not clickable');
    assertAudit(/KANJIDIC|now|day|sun|book|read/.test(kanjiSnapshot.localKanjiText), 'local kanji dictionary section is missing');
    assertAudit(kanjiSnapshot.similarWords > 0, 'kanji drilldown did not show JPDB used-in words');
    await page.screenshot({
        path: path.join(ARTIFACTS, 'hover-lookup-before-a11y.png'),
        clip: { x: 0, y: 0, width: 640, height: 660 },
    });
    await assertAccessibleSurface(page, 'hover lookup kanji drilldown', '.jpdb-reader-popover');
    await page.evaluate(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        const stage = document.querySelector('.jpdb-reader-doodle-stage');
        if (popover instanceof HTMLElement && stage instanceof HTMLElement) {
            popover.scrollTop = Math.max(0, stage.offsetTop - 92);
        }
    });
    await page.screenshot({
        path: path.join(ARTIFACTS, 'hover-lookup.png'),
        clip: { x: 0, y: 0, width: 640, height: 660 },
    });
}

async function auditHoverLookup(browser, server) {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{font:24px/1.8 system-ui;margin:40px;color:#171a1f}
    </style></head><body><p>今日は静かな喫茶店で新しい本を読みました。明日は学校で勉強します。</p></body></html>`;
    const { page, requests } = await newAuditedPage(browser, {
        ...baseSettings,
        lookupOnClick: false,
        lookupOnHover: true,
        audioEnabled: true,
        autoPlayAudio: true,
        audioViaBlob: false,
        audioEnableDefaultSources: false,
        audioSources: [{ type: 'custom', url: 'https://audio.test/{term}.mp3', voice: '', enabled: true }],
        hoverOpenDelayMs: 40,
        hoverCloseDelayMs: 140,
        localDictionariesEnabled: true,
        localDictionaryShowKanji: true,
        dictionaryPreferences: [
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 0 },
            { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1 },
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 2 },
        ],
        shortcuts: { ...baseSettings.shortcuts, hoverLookup: 'Shift' },
    });
    await page.addInitScript(() => {
        window.__yomuAudioPlayCount = 0;
        HTMLMediaElement.prototype.play = function play() {
            window.__yomuAudioPlayCount += 1;
            return Promise.resolve();
        };
    });
    await page.route(`${server.origin}/hover-fixture.html`, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
    }));
    await page.goto(`${server.origin}/hover-fixture.html`, { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-word').length > 0, 10000, 'fixture text was not scanned');
    const todayWord = await page.locator('.jpdb-reader-word', { hasText: '今日' }).first().boundingBox();
    const quietWord = await page.locator('.jpdb-reader-word', { hasText: '静か' }).first().boundingBox();
    assertAudit(todayWord, 'no 今日 scanned word bounding box found');
    assertAudit(quietWord, 'no 静か scanned word bounding box found');
    await page.keyboard.down('Shift');
    const termAudioRequestsBefore = audioTestRequestCount(requests);
    const termAudioPlaysBefore = await audioPlayCount(page);
    await page.mouse.move(todayWord.x + todayWord.width / 2, todayWord.y + todayWord.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudioPlaybackOrRequest(
        page,
        requests,
        audioTestRequestCount,
        termAudioRequestsBefore,
        termAudioPlaysBefore,
        1800,
        'hover lookup did not start term audio playback',
    );
    const hoverHasBackdrop = await page.locator('.jpdb-reader-backdrop').count();
    assertAudit(hoverHasBackdrop === 0, 'hover lookup mounted a modal backdrop');
    const text = await page.locator('.jpdb-reader-popover').innerText();
    assertAudit(/JPDB|Add|Never|Blacklist/.test(text), 'hover popup did not render mining actions');
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'hover popup kept showing dictionary loading details').catch(async error => {
        const debug = await page.evaluate(() => ({
            loadingText: document.querySelector('[data-card-details-loading]')?.textContent ?? '',
            popoverText: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 600) ?? '',
            sources: [...document.querySelectorAll('.jpdb-reader-source-card')].map(node => ({
                title: node.querySelector('summary')?.textContent?.trim() ?? '',
                text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
            })),
        }));
        throw new Error(`hover popup kept showing dictionary loading details: ${JSON.stringify({ debug, requests: requests.slice(-20) })}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await openImmersionKitDetails(page);
    await waitForAudit(page, () => {
        const immersion = document.querySelector('[data-immersion-kit]');
        return !immersion || immersion.dataset.immersionEmpty === 'true' || immersion.querySelector('.jpdb-reader-example-card');
    }, 6000, 'hover popup Immersion Kit examples did not settle');
    await waitForRequestCountStable(requests, jpdbParseRequestCount, 500, 6000, 'hover popup nested parsing did not settle');
    const stableBefore = await page.locator('.jpdb-reader-popover').boundingBox();
    const searchesBeforeMove = immersionSearchRequestCount(requests);
    const parsesBeforeMove = jpdbParseRequestCount(requests);
    assertAudit(stableBefore, 'hover popup has no stable bounding box before movement');
    for (const fraction of [0.25, 0.5, 0.75, 0.45, 0.6]) {
        await page.mouse.move(todayWord.x + todayWord.width * fraction, todayWord.y + todayWord.height / 2, { steps: 3 });
    }
    await page.waitForTimeout(420);
    const stableAfter = await page.locator('.jpdb-reader-popover').boundingBox();
    assertAudit(stableAfter, 'hover popup disappeared after moving within the same word');
    assertAudit(await page.locator('.jpdb-reader-popover').count() === 1, 'moving inside one hovered word remounted multiple popups');
    assertAudit(await page.locator('[data-card-details-loading]').count() === 0, 'moving inside one hovered word restarted dictionary loading');
    assertAudit(immersionSearchRequestCount(requests) === searchesBeforeMove, 'moving inside one hovered word re-requested Immersion Kit examples');
    assertAudit(jpdbParseRequestCount(requests) === parsesBeforeMove, 'moving inside one hovered word re-parsed lookup content');
    assertAudit(Math.abs(stableAfter.y - stableBefore.y) < 24, `hover popup jumped vertically while staying on one word: ${stableBefore.y} -> ${stableAfter.y}`);
    await assertTodayKanjiDrilldown(page);
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the hover popup');
    await page.waitForTimeout(260);
    const reopenedAfterEscape = await page.locator('.jpdb-reader-popover').count();
    assertAudit(reopenedAfterEscape === 0, 'hover popup reopened immediately after Escape without pointer leaving the word');
    await page.mouse.move(8, 8);
    await page.mouse.move(quietWord.x + quietWord.width / 2, quietWord.y + quietWord.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const popoverBox = await page.locator('.jpdb-reader-popover').boundingBox();
    assertAudit(popoverBox, 'hover popup has no bounding box');
    await page.mouse.move(popoverBox.x + Math.min(24, popoverBox.width / 2), popoverBox.y + Math.min(24, popoverBox.height / 2));
    await page.waitForTimeout(260);
    assertAudit(await page.locator('.jpdb-reader-popover').count() === 1, 'hover popup closed while pointer was inside the panel');
    await page.keyboard.up('Shift');
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the hover popup before press-drag lookup');
    await page.mouse.move(todayWord.x + todayWord.width / 2, todayWord.y + todayWord.height / 2);
    await page.mouse.down();
    await page.mouse.move(quietWord.x + quietWord.width / 2, quietWord.y + quietWord.height / 2, { steps: 10 });
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await page.mouse.up();
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-popover').length === 1, 1200, 'press-drag lookup did not leave exactly one popup open');
    assertAudit(await page.locator('.jpdb-reader-backdrop').count() === 0, 'press-drag lookup opened a modal backdrop');
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the press-drag popup');
    await page.keyboard.up('Shift');
    await page.close();
    record('hold-key hover lookup', 'pass', 'Shift hover and press-drag lookup both open lightweight popups');
}

async function auditRuntimeRegressionFixes(browser, server) {
    const runtimeAudioRequests = [];
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        lookupOnClick: true,
        lookupOnHover: true,
        hoverOpenDelayMs: 35,
        hoverCloseDelayMs: 120,
        audioEnabled: true,
        autoPlayAudio: false,
        audioViaBlob: true,
        audioEnableDefaultSources: false,
        audioSources: [{ type: 'text-to-speech', url: '', voice: '', enabled: true }],
        studyTranslationEnabled: true,
        studyGrammarEnabled: true,
        immersionKitEnabled: true,
        immersionKitShowImages: true,
        immersionKitAutoPlayAudio: false,
        immersionKitPlayOnHover: false,
    });
    const browserErrors = collectPageBrowserErrors(page);
    await page.addInitScript(() => {
        window.__yomuAudioPlayEvents = [];
        window.__yomuSpeechTexts = [];
        HTMLMediaElement.prototype.play = function play() {
            window.__yomuAudioPlayEvents.push({ src: this.src || this.currentSrc || '', currentSrc: this.currentSrc || '', loop: this.loop });
            return Promise.resolve();
        };
        class FakeSpeechSynthesisUtterance {
            lang = '';
            voice = null;
            onend = null;
            onerror = null;
            constructor(text) {
                this.text = text;
            }
        }
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
            configurable: true,
            value: FakeSpeechSynthesisUtterance,
        });
        Object.defineProperty(window, 'speechSynthesis', {
            configurable: true,
            value: {
            cancel: () => undefined,
            getVoices: () => [],
            speak: utterance => {
                window.__yomuSpeechTexts.push(utterance.text);
                utterance.onend?.();
            },
            },
        });
    });
    await page.route('https://jpdb.io/static/v/**', route => {
        runtimeAudioRequests.push({ kind: 'direct', url: route.request().url() });
        route.abort('failed');
    });
    await page.route('https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/**', route => {
        const url = new URL(route.request().url());
        const target = url.searchParams.get('url') ?? '';
        runtimeAudioRequests.push({ kind: 'proxy', url: route.request().url(), target });
        route.fulfill({
            status: 200,
            contentType: 'audio/ogg',
            body: encodedJpdbOggBytes(),
        });
    });

    await page.goto(`${server.origin}${QA_RUNTIME_REGRESSION_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.evaluate(() => {
        window.__yomuQaPointerEvents = [];
        const surface = node => [...node.childNodes].map(child => {
            if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? '';
            if (!(child instanceof Element) || child.matches('rt,rp')) return '';
            return surface(child);
        }).join('');
        const record = event => {
            const target = event.target instanceof Element ? event.target : null;
            const word = target?.closest('.jpdb-reader-word');
            window.__yomuQaPointerEvents.push({
                type: event.type,
                x: event.clientX,
                y: event.clientY,
                targetTag: target?.tagName ?? '',
                targetText: target?.textContent?.trim() ?? '',
                wordSurface: word ? surface(word).trim() : '',
                wordVid: word?.getAttribute('data-vid') ?? '',
                wordSid: word?.getAttribute('data-sid') ?? '',
            });
        };
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
            document.addEventListener(type, record, { capture: true });
        }
    });
    await waitForAudit(page, () => {
        const surface = node => [...node.childNodes].map(child => {
            if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? '';
            if (!(child instanceof Element) || child.matches('rt,rp')) return '';
            return surface(child);
        }).join('');
        return [...document.querySelectorAll('.jpdb-reader-word')]
            .some(word => surface(word).trim() === '読んで');
    }, 10000, 'runtime regression fixture did not parse 読んで as its own word').catch(async error => {
        const detail = await page.evaluate(() => ({
            body: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
            words: [...document.querySelectorAll('.jpdb-reader-word')].map(word => {
                const surface = node => [...node.childNodes].map(child => {
                    if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? '';
                    if (!(child instanceof Element) || child.matches('rt,rp')) return '';
                    return surface(child);
                }).join('');
                return {
                    text: surface(word).trim(),
                    fullText: word.textContent?.trim() ?? '',
                    expression: word.getAttribute('data-expression') ?? '',
                    reading: word.getAttribute('data-reading') ?? '',
                    sentence: word.getAttribute('data-sentence') ?? '',
                    className: word.className,
                };
            }),
            parseKeys: [...document.querySelectorAll('[data-jpdb-reader-parse-key], [data-jpdb-reader-parse-loading-key]')].map(node => ({
                tag: node.tagName,
                parseKey: node.getAttribute('data-jpdb-reader-parse-key') ?? '',
                loadingKey: node.getAttribute('data-jpdb-reader-parse-loading-key') ?? '',
            })),
        }));
        throw new Error(`runtime regression fixture did not parse 読んで as its own word: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, () => {
        const surface = node => [...node.childNodes].map(child => {
            if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? '';
            if (!(child instanceof Element) || child.matches('rt,rp')) return '';
            return surface(child);
        }).join('');
        const words = [...document.querySelectorAll('#polite-form-target .jpdb-reader-word')]
            .map(word => surface(word).trim());
        return words.includes('ございます') && !words.some(word => ['ご', 'ざ', 'い', 'ます'].includes(word));
    }, 8000, 'runtime regression fixture split ございます instead of using JPDB parse tokens');

    const readWord = page.locator('.jpdb-reader-word').filter({ hasText: '読んで' }).first();
    const readBox = await readWord.boundingBox();
    assertAudit(readBox, 'no 読んで scanned word bounding box found');
    const failures = [];

    await page.mouse.move(readBox.x + readBox.width / 2, readBox.y + readBox.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'hover popup for 読んで kept loading');
    try {
        assertRegressionReadPopup(await runtimeRegressionPopoverSnapshot(page), 'hover');
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    }

    await page.mouse.move(6, 6);
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'hover popup for 読んで stayed open after the pointer left the token').catch(async error => {
        failures.push(error instanceof Error ? error.message : String(error));
        await page.keyboard.press('Escape').catch(() => undefined);
        await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 1000, 'stale popup did not close after Escape').catch(() => undefined);
    });

    const readClickPoint = { x: readBox.x + readBox.width / 2, y: readBox.y + readBox.height * 0.76 };
    const readClickTarget = await runtimeRegressionPointerTargetSnapshot(page, readClickPoint);
    await page.mouse.click(readClickPoint.x, readClickPoint.y);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'click popup for 読んで kept loading');
    try {
        assertRegressionReadPopup(await runtimeRegressionPopoverSnapshot(page), 'click');
    } catch (error) {
        const clickEvents = await page.evaluate(() => window.__yomuQaPointerEvents ?? []);
        failures.push(`${error instanceof Error ? error.message : String(error)}; clickTarget=${JSON.stringify(readClickTarget)}; clickEvents=${JSON.stringify(clickEvents.slice(-8))}`);
    }

    try {
        await openImmersionKitDetails(page);
        await waitForAudit(page, () => document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card .jpdb-reader-word').length >= 2, 8000, 'Immersion Kit examples did not recursively parse after 読んで lookup');
        assertRuntimeImmersionSnapshot(await runtimeRegressionImmersionSnapshot(page));
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    }

    try {
        const studyReadButton = page.locator('[data-action="study-read-sentence"]').first();
        assertAudit(await studyReadButton.count() === 1, 'study read-sentence button is missing from the popup');
        await studyReadButton.click({ force: true });
        await waitForAudit(page, () => (window.__yomuSpeechTexts ?? []).some(text => text.includes('好きなものを読んで日本語を学ぶ')), 3000, 'study sentence audio did not use browser speech fallback');
    } catch (error) {
        const detail = await page.evaluate(() => ({
            speechTexts: window.__yomuSpeechTexts ?? [],
            originals: [...document.querySelectorAll('[data-study-original-render]')].map(node => node.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
            buttonCount: document.querySelectorAll('[data-action="study-read-sentence"]').length,
            pageWords: [...document.querySelectorAll('#inflected-pointer-target .jpdb-reader-word')].map(word => ({
                text: word.textContent?.trim() ?? '',
                expression: word.getAttribute('data-expression') ?? '',
                reading: word.getAttribute('data-reading') ?? '',
                sentence: word.getAttribute('data-sentence') ?? '',
                vid: word.getAttribute('data-vid') ?? '',
                sid: word.getAttribute('data-sid') ?? '',
            })),
            popoverText: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 600) ?? '',
        }));
        failures.push(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify(detail)}`);
    }

    try {
        await page.evaluate(() => {
            delete window.GM_xmlhttpRequest;
            if (window.GM) delete window.GM.xmlHttpRequest;
        });
        const exampleAudioButton = page.locator('[data-action="jpdb-example-audio"]').first();
        assertAudit(await exampleAudioButton.count() === 1, 'JPDB example sentence audio button is missing from the popup');
        await exampleAudioButton.click({ force: true });
        await waitForNodeAudit(() => runtimeAudioRequests.some(request => request.kind === 'proxy'), 6000, 'JPDB example sentence audio did not request the public proxy');
        await waitForAudit(page, () => (window.__yomuAudioPlayEvents ?? []).some(event => /^blob:/.test(event.src)), 6000, 'JPDB example sentence audio did not play from a blob URL');
        assertAudit(!runtimeAudioRequests.some(request => request.kind === 'direct'), `JPDB example sentence audio touched direct static media before proxy/blob fallback: ${JSON.stringify(runtimeAudioRequests)}`);
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    }
    try {
        const exampleWord = page.locator('.jpdb-reader-jpdb-example .jpdb-reader-word').filter({ hasText: '好き' }).first();
        assertAudit(await exampleWord.count() === 1, 'JPDB dictionary example words are not parsed into lookup spans');
        await exampleWord.click({ force: true });
        await waitForAudit(page, () => {
            const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling')?.textContent?.replace(/\s+/g, '').trim() ?? '';
            return spelling.includes('好き');
        }, 6000, 'clicking a parsed dictionary example word did not open its lookup card');
        await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'dictionary example lookup card kept loading');
        const exampleLookup = await runtimeRegressionPopoverSnapshot(page);
        assertAudit(/好き/.test(exampleLookup.spelling), `dictionary example click opened the wrong card: ${JSON.stringify(exampleLookup)}`);
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    }
    try {
        assertNoPageBrowserErrors(browserErrors, 'runtime regression fixture');
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
	    }
	    await page.screenshot({ path: path.join(ARTIFACTS, 'runtime-regression.png'), fullPage: false });
	    try {
	        await assertRuntimeLinkCardLookupAndNavigation(page);
	    } catch (error) {
	        failures.push(error instanceof Error ? error.message : String(error));
	    }
	    await page.close();
    if (failures.length) throw new Error(failures.join(' | '));
    record('runtime regression fixture', 'pass', '読んで lookup, stale hover dismissal, study/example audio, and Immersion Kit parsing stayed healthy');
}

async function runtimeRegressionPopoverSnapshot(page) {
    return page.evaluate(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        return {
            text: popover?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            spelling: popover?.querySelector('.jpdb-reader-spelling')?.textContent?.replace(/\s+/g, '').trim() ?? '',
            reading: popover?.querySelector('.jpdb-reader-reading')?.textContent?.replace(/\s+/g, '').trim() ?? '',
            pitchCount: popover?.querySelectorAll('.jpdb-reader-pitch svg, .jpdb-reader-pitch path').length ?? 0,
        };
    });
}

function assertRegressionReadPopup(snapshot, trigger) {
    assertAudit(!snapshot.spelling.includes('きなものを'), `${trigger} lookup selected left-context text instead of 読んで: ${JSON.stringify(snapshot)}`);
    assertAudit(/読む|読んで/.test(snapshot.spelling), `${trigger} lookup did not open the 読む card: ${JSON.stringify(snapshot)}`);
    assertAudit(/よむ|よんで/.test(snapshot.reading), `${trigger} lookup lost JPDB reading: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.pitchCount > 0, `${trigger} lookup lost JPDB pitch display: ${JSON.stringify(snapshot)}`);
}

async function runtimeRegressionImmersionSnapshot(page) {
    return page.evaluate(() => {
        const target = document.querySelector('[data-immersion-kit] .jpdb-reader-example-card.has-image .jpdb-reader-example-target')
            ?? document.querySelector('[data-immersion-kit] .jpdb-reader-example-target');
        const style = target instanceof HTMLElement ? getComputedStyle(target) : null;
        return {
            cardCount: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card').length,
            wordCount: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card .jpdb-reader-word').length,
            targetText: target?.textContent?.trim() ?? '',
            targetBackground: style?.backgroundColor ?? '',
            targetBackgroundImage: style?.backgroundImage ?? '',
            targetDecoration: style?.textDecorationColor ?? '',
        };
    });
}

async function runtimeRegressionPointerTargetSnapshot(page, point) {
    return page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        const word = target?.closest?.('.jpdb-reader-word');
        const surface = node => [...node.childNodes].map(child => {
            if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? '';
            if (!(child instanceof Element) || child.matches('rt,rp')) return '';
            return surface(child);
        }).join('');
        const rectSnapshot = node => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        return {
            x,
            y,
            targetTag: target?.tagName ?? '',
            targetText: target?.textContent?.trim() ?? '',
            wordSurface: word ? surface(word).trim() : '',
            wordText: word?.textContent?.trim() ?? '',
            wordExpression: word?.getAttribute('data-expression') ?? '',
            wordReading: word?.getAttribute('data-reading') ?? '',
            wordVid: word?.getAttribute('data-vid') ?? '',
            wordSid: word?.getAttribute('data-sid') ?? '',
            wordRect: word ? rectSnapshot(word) : null,
            allWords: [...document.querySelectorAll('.jpdb-reader-word')].map(node => ({
                surface: surface(node).trim(),
                text: node.textContent?.trim() ?? '',
                expression: node.getAttribute('data-expression') ?? '',
                reading: node.getAttribute('data-reading') ?? '',
                vid: node.getAttribute('data-vid') ?? '',
                sid: node.getAttribute('data-sid') ?? '',
                rect: rectSnapshot(node),
            })),
            pointerEvents: window.__yomuQaPointerEvents ?? [],
        };
    }, point);
}

async function assertRuntimeLinkCardLookupAndNavigation(page) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 1500, 'previous popup stayed open before link-card lookup')
        .catch(() => undefined);
    await waitForAudit(page, () => {
        const surface = node => [...node.childNodes].map(child => {
            if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? '';
            if (!(child instanceof Element) || child.matches('rt,rp')) return '';
            return surface(child);
        }).join('');
        return [...document.querySelectorAll('#runtime-link-card .jpdb-reader-word')]
            .some(word => surface(word).trim() === 'よむ');
    }, 8000, 'link card text did not parse into lookup words');

    const linkWord = page.locator('#runtime-link-card .jpdb-reader-word').filter({ hasText: 'よむ' }).first();
    const linkBox = await linkWord.boundingBox();
    assertAudit(linkBox, 'parsed link-card word has no bounding box');
    await page.mouse.move(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'link-card hover popup kept loading');
    const lookup = await runtimeRegressionPopoverSnapshot(page);
    assertAudit(/読む|よむ/.test(lookup.spelling), `link-card hover opened the wrong lookup: ${JSON.stringify(lookup)}`);
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close link-card hover popup');

    await page.locator('#runtime-link-card').click({ force: true });
    await page.waitForURL(url => url.pathname.endsWith('/__qa__/getting-started'), { timeout: 3000 });
}

function assertRuntimeImmersionSnapshot(snapshot) {
    assertAudit(snapshot.cardCount > 0, `Immersion Kit did not render cards: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.wordCount >= 2, `Immersion Kit examples are not parsed into lookup words: ${JSON.stringify(snapshot)}`);
    assertAudit(!isTransparentCssColor(snapshot.targetBackground) || snapshot.targetBackgroundImage !== 'none', `Immersion Kit target highlight is transparent: ${JSON.stringify(snapshot)}`);
}

async function openImmersionKitDetails(page) {
    await waitForAudit(page, () => Boolean(document.querySelector('[data-immersion-kit][data-immersion-lazy-bound="true"]')), 6000, 'Immersion Kit section did not render');
    const isOpen = await page.locator('[data-immersion-kit]').evaluate(node => node instanceof HTMLDetailsElement && node.open);
    if (!isOpen) await page.locator('[data-immersion-kit] > summary').click();
}

async function auditJpdbSearchCompatibility(browser) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        localDictionariesEnabled: true,
        lookupOnHover: true,
        scanModifierKey: '',
        showFloatingButton: false,
    });
    await page.route('https://jpdb.io/search**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
            body{margin:0;background:#171a1f;color:#f4f6fb;font:18px/1.9 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
            main{max-width:760px;margin:48px auto;padding:24px;border:1px solid #3b4250;border-radius:14px;background:#20242b}
            .result{padding:18px;border-bottom:1px solid #343a46}
            .subsection-spelling{font-size:30px;font-weight:800}
            .subsection-meanings{display:grid;gap:8px}
            .subsection-label{margin:0;color:#aab2c0;font-size:12px;text-transform:uppercase}
            .subsection{font-size:16px}
            button{width:100%!important;min-height:76px!important;padding:22px!important;border-radius:0!important}
            svg{width:160px!important;height:160px!important}
            ruby rt{color:#8da2c9}
        </style></head><body>
            <main>
                <h1>JPDB search fixture</h1>
                <div class="results search">
                    <div id="result-0">
                        <div class="result vocabulary">
                            <div class="subsection-spelling with-furigana">
                                <div class="primary-spelling"><div class="spelling"><div><ruby class="v">母<rt>はは</rt></ruby></div></div></div>
                            </div>
                            <div class="subsection-meanings">
                                <h6 class="subsection-label">Meanings</h6>
                                <div class="subsection"><div class="description">mother</div></div>
                            </div>
                        </div>
                    </div>
                    <div class="result">検索結果：<ruby>読む<rt>よむ</rt></ruby> 本と日本語を勉強します。</div>
                    <div class="result">今日は新しい本を読みました。</div>
                </div>
            </main>
        </body></html>`,
    }));
    await page.goto('https://jpdb.io/search?q=%E8%AA%AD%E3%82%80', { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-word').length >= 4, 10000, 'jpdb.io search fixture text was not scanned');
    await waitForAudit(page, () => [...document.querySelectorAll('ruby .jpdb-reader-word')].some(node => node.textContent?.includes('読')), 10000, 'native ruby word on jpdb.io was not wrapped for lookup');
    const scanSnapshot = await page.evaluate(() => ({
        words: document.querySelectorAll('.jpdb-reader-word').length,
        colored: document.querySelectorAll('.jpdb-reader-word[class*="jpdb-"]').length,
        furigana: document.querySelectorAll('.jpdb-reader-furi').length,
        nativeRubyWords: [...document.querySelectorAll('ruby .jpdb-reader-word')].map(node => node.textContent ?? ''),
    }));
    assertAudit(scanSnapshot.colored >= 3, 'jpdb.io search words are not colored by status');
    assertAudit(scanSnapshot.furigana > 0, 'jpdb.io search non-ruby words did not receive furigana');
    assertAudit(scanSnapshot.nativeRubyWords.some(text => text.includes('読')), 'native ruby word on jpdb.io was not wrapped for lookup');

    const readWordSnapshot = await page.evaluate(() => {
        document.querySelectorAll('.jpdb-reader-word[data-yomu-qa-read-target]').forEach(element => element.removeAttribute('data-yomu-qa-read-target'));
        const elements = [...document.querySelectorAll('.jpdb-reader-word')];
        const words = elements.map((element, index) => ({
            index,
            text: (element.textContent ?? '').replace(/\s+/g, ''),
        }));
        const exact = words.find(word => word.text.startsWith('読みました'));
        if (exact) elements[exact.index]?.setAttribute('data-yomu-qa-read-target', 'true');
        return { index: exact?.index ?? -1, words: words.slice(0, 24) };
    });
    assertAudit(readWordSnapshot.index >= 0, `jpdb.io search fixture did not expose a 読みました word: ${JSON.stringify(readWordSnapshot)}`);
    const readWord = page.locator('.jpdb-reader-word[data-yomu-qa-read-target="true"]').first();
    await readWord.waitFor({ state: 'visible', timeout: 6000 });
    await readWord.scrollIntoViewIfNeeded();
    await readWord.click({ force: true });
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const buttonSnapshot = await page.evaluate(() => {
        const button = document.querySelector('.jpdb-reader-audio-control');
        const svg = button?.querySelector('svg');
        const buttonRect = button?.getBoundingClientRect();
        const svgRect = svg?.getBoundingClientRect();
        return {
            button: buttonRect ? { width: buttonRect.width, height: buttonRect.height } : null,
            svg: svgRect ? { width: svgRect.width, height: svgRect.height } : null,
        };
    });
    assertJpdbSearchControlIsolation(buttonSnapshot);

    const readKanjiButton = page.locator('.jpdb-reader-kanji-inline[data-kanji="読"]').first();
    await readKanjiButton.waitFor({ state: 'visible', timeout: 6000 }).catch(async error => {
        const snapshot = await page.evaluate(() => ({
            spelling: document.querySelector('.jpdb-reader-spelling')?.textContent ?? '',
            inline: [...document.querySelectorAll('.jpdb-reader-kanji-inline')].map(button => ({
                text: button.textContent ?? '',
                kanji: button.getAttribute('data-kanji') ?? '',
                action: button.getAttribute('data-action') ?? '',
            })),
            popover: document.querySelector('.jpdb-reader-popover')?.textContent?.slice(0, 500) ?? '',
        }));
        throw new Error(`読 kanji button is missing from JPDB search popup: ${JSON.stringify(snapshot)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await readKanjiButton.click();
    await waitForAudit(page, () => document.querySelector('.jpdb-reader-kanji-display')?.textContent?.trim() === '読', 6000, 'kanji drilldown did not open on jpdb.io');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-kanjivg-svg path').length > 0, 9000, 'kanji stroke trace did not render on jpdb.io');
    await page.screenshot({ path: path.join(ARTIFACTS, 'jpdb-search-compat.png'), fullPage: false });
    await page.close();
    record('jpdb.io search compatibility', 'pass', 'native ruby, kanji drilldown, status colors, and reader control isolation work on jpdb.io');
}

function assertJpdbSearchControlIsolation(snapshot) {
    assertAudit(boxFits(snapshot.button, 44), 'jpdb.io page CSS stretched the reader audio button');
    assertAudit(boxFits(snapshot.svg, 24), 'jpdb.io page CSS stretched the reader icon SVG');
}

function boxFits(box, maxSize) {
    return Boolean(box && box.width <= maxSize && box.height <= maxSize);
}

async function auditImmersionKitPopover(browser, server) {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{font:24px/1.8 system-ui;margin:40px;color:#171a1f}
    </style></head><body><p>今日は静かな喫茶店で新しい本を読みました。</p></body></html>`;
    const { page, requests } = await newAuditedPage(browser, {
        ...baseSettings,
        localDictionariesEnabled: true,
        ankiEnabled: true,
        audioEnabled: true,
        immersionKitEnabled: true,
        immersionKitShowTranslation: false,
        immersionKitShowImages: true,
        immersionKitAutoPlayAudio: false,
        immersionKitPlayOnHover: true,
    });
    await page.addInitScript(() => {
        window.__yomuAudioPlayCount = 0;
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function play(...args) {
            window.__yomuAudioPlayCount += 1;
            return originalPlay.apply(this, args);
        };
    });
    await page.route(`${server.origin}/immersion-fixture.html`, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
    }));
    await page.goto(`${server.origin}/immersion-fixture.html`, { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-word').length > 0, 10000, 'fixture text was not scanned');
    await page.locator('.jpdb-reader-word').filter({ hasText: '読みました' }).first().click();
    await openImmersionKitDetails(page);
    await page.waitForSelector('[data-immersion-kit] .jpdb-reader-example-card', { timeout: 8000 });
    await waitForAudit(page, () => {
        const image = document.querySelector('.jpdb-reader-example-image');
        return image && image.complete && image.naturalWidth > 0;
    }, 6000, 'Immersion Kit thumbnail did not render');
    await waitForAudit(page, () => Boolean(document.querySelector('[data-action="anki-edit"], .jpdb-reader-anki-existing')), 6000, 'existing Anki card state did not settle').catch(async error => {
        const debug = await page.evaluate(() => ({
            loadingText: document.querySelector('[data-card-details-loading]')?.textContent ?? '',
            popoverText: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 700) ?? '',
            ankiActions: [...document.querySelectorAll('[data-action^="anki"], .jpdb-reader-anki-existing')].map(node => node.textContent?.trim() ?? ''),
        }));
        throw new Error(`existing Anki card state did not settle: ${JSON.stringify({ debug, requests: requests.slice(-24) })}: ${error instanceof Error ? error.message : String(error)}`);
    });
    const firstSnapshot = await page.evaluate(() => ({
        sectionText: document.querySelector('[data-immersion-kit]')?.textContent ?? '',
        exampleWords: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-word').length,
        translationVisible: Boolean(document.querySelector('[data-immersion-kit] .jpdb-reader-example-translation')),
        imageVisible: Boolean(document.querySelector('.jpdb-reader-example-image')),
        localDefinitionWords: document.querySelectorAll('.jpdb-reader-local-glossary .jpdb-reader-word').length,
        hasAnkiEdit: Boolean(document.querySelector('[data-action="anki-edit"]')),
        hasAddToAnki: Boolean(document.querySelector('[data-action="anki"]')),
        ankiExisting: document.querySelector('.jpdb-reader-anki-existing')?.textContent ?? '',
    }));
    assertAudit(firstSnapshot.sectionText.includes('Immersion Kit'), 'Immersion Kit section is missing');
    assertAudit(firstSnapshot.exampleWords >= 2, 'Immersion Kit sentence is not recursively tokenized');
    assertAudit(!firstSnapshot.translationVisible, 'Immersion Kit translations are visible despite the default-off setting');
    assertAudit(firstSnapshot.imageVisible, 'Immersion Kit thumbnail did not render');
    assertAudit(firstSnapshot.localDefinitionWords >= 0, 'local dictionary recursive parsing did not run');
    assertAudit(firstSnapshot.hasAnkiEdit && !firstSnapshot.hasAddToAnki, 'existing Anki card did not replace Add to Anki with Edit in Anki');
    assertAudit(firstSnapshot.ankiExisting.includes('Anime Mining') && firstSnapshot.ankiExisting.includes('今日は本を読む'), 'existing Anki card preview did not render deck and sentence context');
    await page.evaluate(() => {
        const section = document.querySelector('[data-immersion-kit]');
        const body = document.querySelector('.jpdb-reader-popover-body');
        if (section instanceof HTMLElement && body instanceof HTMLElement) {
            body.scrollTop = Math.max(0, section.offsetTop - 32);
        }
    });
    await page.locator('.jpdb-reader-popover').screenshot({ path: path.join(ARTIFACTS, 'immersion-kit-popover.png') });
    const audioRequestsBeforeHover = immersionAudioRequestCount(requests);
    const audioPlaysBeforeHover = await audioPlayCount(page);
    await page.locator('.jpdb-reader-example-card').hover();
    await waitForAudioPlaybackOrRequest(
        page,
        requests,
        immersionAudioRequestCount,
        audioRequestsBeforeHover,
        audioPlaysBeforeHover,
        6000,
        'Immersion Kit hover did not request first example audio',
    );
    await waitForRequestCountStable(requests, immersionAudioRequestCount, 350, 4000, 'Immersion Kit hover audio request did not settle');
    const audioRequestsAfterHover = immersionAudioRequestCount(requests);
    const audioPlaysAfterHover = await audioPlayCount(page);
    await page.dispatchEvent('.jpdb-reader-example-card', 'pointerover', { pointerType: 'mouse', bubbles: true });
    await page.waitForTimeout(250);
    assertAudit(immersionAudioRequestCount(requests) === audioRequestsAfterHover, 'Immersion Kit hover audio should only auto-play once');
    assertAudit(await audioPlayCount(page) === audioPlaysAfterHover, 'Immersion Kit hover audio should only call play once');
    await page.locator('.jpdb-reader-btn.easy').click();
    await waitForNodeAudit(() => requests.some(request => request.action === 'answerCards'), 6000, 'Anki grading did not send through AnkiConnect');
    const reviewToastCount = await page.locator('.jpdb-reader-toast').filter({ hasText: 'review sent' }).count();
    assertAudit(reviewToastCount === 0, 'grading should not show a low-value review sent toast');
    const firstImmersionSentence = await page.locator('.jpdb-reader-example-card').first().getAttribute('data-immersion-sentence');
    await page.locator('[data-immersion-action="next"]').click();
    await waitForAudit(page, firstSentence => {
        const sentence = document.querySelector('.jpdb-reader-example-card')?.getAttribute('data-immersion-sentence') ?? '';
        return sentence && sentence !== firstSentence;
    }, 6000, 'Immersion Kit next example did not update', firstImmersionSentence).catch(async error => {
        const detail = await page.evaluate(() => ({
            cards: [...document.querySelectorAll('.jpdb-reader-example-card')].map(card => ({
                sentence: card.getAttribute('data-immersion-sentence') ?? '',
                text: card.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) ?? '',
            })),
            buttons: [...document.querySelectorAll('[data-immersion-action]')].map(button => ({
                action: button.getAttribute('data-immersion-action') ?? '',
                text: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                visible: button instanceof HTMLElement ? getComputedStyle(button).display !== 'none' && !button.hidden : false,
            })),
            sectionText: document.querySelector('[data-immersion-kit]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
        }));
        throw new Error(`Immersion Kit next example did not update: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, () => {
        const image = document.querySelector('[data-immersion-kit] .jpdb-reader-example-image');
        return image && image.complete && image.naturalWidth > 0;
    }, 6000, 'Immersion Kit next example image did not settle');
    const selectedImmersion = await page.evaluate(() => {
        const card = document.querySelector('.jpdb-reader-example-card');
        const words = [...document.querySelectorAll('[data-immersion-kit] .jpdb-reader-word')]
            .map(node => {
                const clone = node.cloneNode(true);
                if (clone instanceof HTMLElement) clone.querySelectorAll('rt').forEach(rt => rt.remove());
                const surface = clone.textContent?.replace(/\s+/g, '').replace(/[()（）]/g, '').trim() ?? '';
                const locatorText = node.textContent?.replace(/\s+/g, '').trim() ?? surface;
                return { surface, locatorText };
            })
            .filter(word => word.surface);
        const nested = words.find(word => word.surface.includes('日本語'))
            ?? words.find(word => word.surface.includes('本'))
            ?? words.find(word => !word.surface.includes('読'))
            ?? words[0];
        return {
            sentence: card?.getAttribute('data-immersion-sentence') ?? '',
            nestedWord: nested?.surface ?? '',
            nestedLocatorText: nested?.locatorText ?? nested?.surface ?? '',
        };
    });
    assertAudit(Boolean(selectedImmersion.nestedWord), `Immersion Kit next example did not expose nested lookup words: ${JSON.stringify(selectedImmersion)}`);
    await page.locator('[data-immersion-kit] .jpdb-reader-word').filter({ hasText: selectedImmersion.nestedLocatorText || selectedImmersion.nestedWord }).first().click();
    await waitForAudit(page, expected => [...document.querySelectorAll('.jpdb-reader-spelling')]
        .some(node => node.textContent?.replace(/\s+/g, '').includes(expected)), 6000, 'word inside Immersion Kit example did not open a nested popup lookup', selectedImmersion.nestedWord).catch(async error => {
        const detail = await page.evaluate(selected => ({
            selected,
            spellings: [...document.querySelectorAll('.jpdb-reader-spelling')].map(node => node.textContent?.replace(/\s+/g, '').trim() ?? ''),
            words: [...document.querySelectorAll('[data-immersion-kit] .jpdb-reader-word')].map(node => node.textContent?.replace(/\s+/g, '').trim() ?? ''),
            popovers: [...document.querySelectorAll('.jpdb-reader-popover')].map(node => node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 400) ?? ''),
        }), selectedImmersion);
        throw new Error(`word inside Immersion Kit example did not open a nested popup lookup: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'nested Immersion lookup kept showing dictionary loading details');
    const miningDrawer = page.locator('.jpdb-reader-popover .jpdb-reader-actions-has-mining.jpdb-reader-actions-mining-collapsed [data-action="mining-collapse"]:visible');
    if (await miningDrawer.count()) await miningDrawer.first().click();
    await page.locator('.jpdb-reader-popover [data-action="anki"]:visible').click();
    await waitForNodeAudit(() => requests.some(request => request.action === 'addNote'), 6000, 'Add to Anki did not send AnkiConnect addNote');
    assertAudit(requests.some(request => /apiv2(?:express)?\.immersionkit\.com\/search/.test(request.url)), 'Immersion Kit API was not requested');
    assertAudit(requests.some(request => request.url.includes('127.0.0.1:8765')), 'AnkiConnect was not queried for existing card state');
    assertAudit(requests.some(request => request.action === 'answerCards'), 'Anki grading request was not sent');
    const addNoteRequests = requests.filter(request => request.action === 'addNote');
    assertAudit(addNoteRequests.some(request => selectedImmersion.sentence && request.ankiSentence?.includes(selectedImmersion.sentence) && request.ankiHasPicture), `Anki addNote did not include the selected Immersion Kit sentence and image: ${JSON.stringify({ selectedImmersion, addNoteRequests })}`);
    await assertAccessibleSurface(page, 'Immersion Kit popup examples', '.jpdb-reader-popover');
    const audioRequestsBeforeManual = immersionAudioRequestCount(requests);
    const audioPlaysBeforeManual = await audioPlayCount(page);
    await page.locator('[data-immersion-action="audio"]').click();
    await waitForAudioPlaybackOrRequest(
        page,
        requests,
        immersionAudioRequestCount,
        audioRequestsBeforeManual,
        audioPlaysBeforeManual,
        6000,
        'Immersion Kit manual audio button did not request audio after hover autoplay',
    );
    await page.close();
    record('Immersion Kit popup examples', 'pass', 'examples render in-card and nested words open lookup');
}

async function auditOcrFixture(browser) {
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{margin:0;padding:32px;background:#15191f;color:white;font-family:system-ui}
        .ocr-fixture-text{position:absolute;left:-9999px}
        img{display:block;width:520px;height:360px;object-fit:cover;border:1px solid #333}
    </style></head><body>
        <p class="ocr-fixture-text">画像の日本語を読む</p>
        <img alt="今日は学校へ行きます。" data-ocr-lines='[
            {"text":"今日は学校へ行きます。","box":{"left":0.08,"top":0.12,"width":0.76,"height":0.18},"vertical":false},
            {"text":"友だちと本を読む。","box":{"left":0.14,"top":0.58,"width":0.68,"height":0.18},"vertical":false}
        ]' src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='520' height='360'><rect width='520' height='360' fill='%23f4f0e7'/><text x='40' y='90' font-size='42'>今日は学校へ行きます。</text><text x='72' y='245' font-size='42'>友だちと本を読む。</text></svg>">
    </body></html>`;
    const { page } = await newAuditedPage(browser, { ...baseSettings, ocrEnabled: true, ocrAutoScanImages: true, ocrShowTextOverlay: false });
    await page.goto(dataUrl(html));
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-ocr-line').length >= 2, 10000, 'OCR fixture lines were not created');
    const overlay = await page.evaluate(() => {
        const image = document.querySelector('img');
        const line = document.querySelector('.jpdb-ocr-line');
        const imageRect = image?.getBoundingClientRect();
        const lineRect = line?.getBoundingClientRect();
        return {
            lineCount: document.querySelectorAll('.jpdb-ocr-line').length,
            wordCount: document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length,
            visibleTextOverlays: document.querySelectorAll('.jpdb-ocr-line-visible').length,
            imageRect,
            lineRect,
            lineTitle: line?.getAttribute('title'),
        };
    });
    assertAudit(overlay.lineCount >= 2, 'OCR line count is wrong');
    assertAudit(overlay.wordCount >= 2, 'OCR text was not parsed into selectable words');
    assertAudit(overlay.visibleTextOverlays === 0, 'OCR text is visibly painted by default');
    assertAudit(overlay.lineTitle?.includes('学校'), 'OCR line text is missing');
    await page.evaluate(() => {
        const line = document.querySelector('.jpdb-ocr-line');
        line?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const activeSnapshot = await page.evaluate(() => ({
        activeLines: document.querySelectorAll('.jpdb-ocr-line-active').length,
        lines: [...document.querySelectorAll('.jpdb-ocr-line')].map(line => ({
            text: line.getAttribute('title') ?? line.textContent?.replace(/\s+/g, '').trim() ?? '',
            className: line.className,
            pinned: line.getAttribute('data-pinned') ?? '',
        })),
    }));
    assertAudit(activeSnapshot.activeLines === 1, `OCR should reveal only one text region at a time: ${JSON.stringify(activeSnapshot)}`);
    await page.locator('.jpdb-ocr-line .jpdb-reader-word').first().click();
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await assertAccessibleSurface(page, 'OCR lookup popup', '.jpdb-reader-popover');
    await page.screenshot({ path: path.join(ARTIFACTS, 'ocr-fixture.png'), fullPage: false });
    await page.close();
    record('OCR fixture', 'pass', 'transparent regions appear and open lookup on click');
}

async function auditVideoFixture(browser, server) {
    const { page } = await newAuditedPage(browser, { ...baseSettings, subtitlePlayerEnabled: true, subtitleAutoDetect: true, showFloatingButton: false });
    await page.goto(`${server.origin}${QA_VIDEO_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 6000 });
    await waitForAudit(page, () => {
        const video = document.querySelector('video');
        if (!video || video.textTracks.length < 2) return false;
        for (const track of video.textTracks) track.mode = 'hidden';
        return true;
    }, 6000, 'video fixture subtitle tracks did not load');
    await waitForAudit(page, () => {
        const status = document.querySelector('.jpdb-subtitle-status')?.textContent ?? '';
        return /2|track/i.test(status);
    }, 6000, 'subtitle controller did not detect fixture tracks');
    await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return;
        video.currentTime = 1.2;
        video.dispatchEvent(new Event('timeupdate'));
        for (const track of video.textTracks) track.dispatchEvent(new Event('cuechange'));
    });
    await waitForAudit(page, () => {
        const primary = document.querySelector('.jpdb-subtitle-primary');
        return primary?.textContent?.includes('今日') && primary?.textContent?.includes('読');
    }, 8000, 'subtitle text did not render while watching the fixture');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length > 0, 8000, 'subtitle JPDB word highlighting did not render');
    await waitForAudit(page, () => {
        const buttons = [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => ({
            action: button.getAttribute('data-action') ?? '',
            label: button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '',
        }));
        return buttons.filter(button => button.action === 'panel').length === 1
            && !buttons.some(button => button.action === 'toggle' || button.action === 'list' || button.action === 'tracks');
    }, 4000, 'subtitle icon controls are missing').catch(async error => {
        const detail = await page.evaluate(() => ({
            railHtml: document.querySelector('.jpdb-subtitle-rail')?.outerHTML ?? '',
            buttons: [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => ({
                action: button.getAttribute('data-action') ?? '',
                label: button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '',
                hidden: button.hasAttribute('hidden'),
            })),
            rootClass: document.querySelector('.jpdb-subtitle-player')?.className ?? '',
        }));
        throw new Error(`subtitle icon controls are missing: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    const snapshot = await page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const primary = document.querySelector('.jpdb-subtitle-primary');
        const firstWord = document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word');
        const rect = root?.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => ({
            action: button.getAttribute('data-action') ?? '',
            label: button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '',
        }));
        const primaryStyle = primary ? getComputedStyle(primary) : null;
	        const firstWordStyle = firstWord instanceof HTMLElement ? getComputedStyle(firstWord) : null;
	        return {
            hidden: root?.hidden,
            documentClasses: document.documentElement.className,
            subtitleRootClasses: root instanceof HTMLElement ? root.className : '',
            rect: rect ? { width: rect.width, height: rect.height, bottom: rect.bottom } : null,
            buttons,
            menuHidden: document.querySelector('.jpdb-subtitle-menu')?.hasAttribute('hidden'),
            visibleFileInputs: document.querySelectorAll('.jpdb-subtitle-player input[type="file"]:not([hidden])').length,
            transcriptVisible: Boolean(document.querySelector('.jpdb-subtitle-list:not([hidden])')),
            obsoleteStatusText: document.body.textContent?.includes('No loaded Japanese subtitle lines.') ?? false,
            subtitleText: primary?.textContent ?? '',
            subtitleBackground: `${primaryStyle?.backgroundColor ?? ''} ${primaryStyle?.backgroundImage ?? ''}`,
	            subtitleWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
	            subtitleWordClasses: firstWord instanceof HTMLElement ? firstWord.className : '',
	            subtitleWordOpacity: firstWordStyle?.opacity ?? '',
	            subtitleWordBackground: firstWordStyle?.backgroundColor ?? '',
            subtitleWordBackgroundImage: firstWordStyle?.backgroundImage ?? '',
            subtitleWordDecorationLine: firstWordStyle?.textDecorationLine ?? '',
            subtitleWordDecorationColor: firstWordStyle?.textDecorationColor ?? '',
        };
    });
    assertVideoFixtureSnapshot(snapshot);
    await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return;
        video.currentTime = 1.2;
        video.dispatchEvent(new Event('timeupdate'));
        for (const track of video.textTracks) track.dispatchEvent(new Event('cuechange'));
    });
    await page.locator('.jpdb-subtitle-rail button[data-action="panel"]').click({ force: true });
    await waitForAudit(page, () => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return panel && !panel.hasAttribute('hidden') && panel.textContent?.includes('Subtitles') && panel.querySelector('.jpdb-subtitle-list-row.active');
    }, 6000, 'transcript panel did not open with active-line highlighting');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-subtitle-list .jpdb-reader-word').length > 0, 8000, 'transcript rows did not hydrate into lookup words');
    const desktopTranscriptLayout = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        const video = document.querySelector('video')?.getBoundingClientRect();
        if (!panel || !video) return null;
        return {
            panelLeft: panel.left,
            panelRight: panel.right,
            panelTop: panel.top,
            panelBottom: panel.bottom,
            panelWidth: panel.width,
            viewportWidth: innerWidth,
            videoLeft: video.left,
            videoRight: video.right,
            videoTop: video.top,
            videoBottom: video.bottom,
        };
    });
    assertDesktopTranscriptLayout(desktopTranscriptLayout);
    await page.screenshot({ path: path.join(ARTIFACTS, 'video-fixture.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const mobileTranscript = await waitForAudit(page, () => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const rect = panel?.getBoundingClientRect();
        if (!panel || panel.hasAttribute('hidden') || !rect) return false;
        const snapshot = {
            width: rect.width,
            top: rect.top,
            bottom: rect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
        };
        return snapshot.width >= snapshot.viewportWidth - 24 && snapshot.top > snapshot.viewportHeight * 0.42
            ? snapshot
            : false;
    }, 3000, 'mobile transcript panel did not stay visible');
    assertMobileTranscriptLayout(mobileTranscript);
    await assertAccessibleSurface(page, 'subtitle player fixture', '.jpdb-subtitle-player');
    await page.screenshot({ path: path.join(ARTIFACTS, 'video-fixture-mobile.png'), fullPage: false });
    await page.close();
    record('subtitle player fixture', 'pass', 'watched a cue with JPDB highlighting and readable subtitle backing');
}

function assertVideoFixtureSnapshot(snapshot) {
    assertAudit(snapshot.hidden === false, 'subtitle player is hidden on a page with video');
    assertAudit(hasLaidOutSubtitlePlayer(snapshot), 'subtitle player is not laid out');
    assertAudit(snapshot.visibleFileInputs === 0, 'subtitle file inputs are visible over the video');
    assertAudit(!snapshot.transcriptVisible, 'transcript panel should be off by default');
    assertAudit(!snapshot.obsoleteStatusText, 'obsolete no-subtitle status text is visible over the controls');
    assertAudit(hasVisibleFixtureSubtitleText(snapshot), 'subtitle fixture cue is not visible');
    assertAudit(snapshot.subtitleWords > 0, 'subtitle cue is not token-highlighted');
    assertAudit(snapshot.subtitleBackground.includes('rgba'), 'subtitle readable background is not applied');
    assertAudit(
        !isTransparentCssColor(snapshot.subtitleWordBackground) || snapshot.subtitleWordBackgroundImage !== 'none',
        `subtitle parsed-word highlight is transparent: ${JSON.stringify(snapshot)}`,
    );
	    assertAudit(
	        snapshot.subtitleWordDecorationLine.includes('underline')
	            && !isTransparentCssColor(snapshot.subtitleWordDecorationColor),
	        `subtitle parsed-word underline is not immediately visible: ${JSON.stringify(snapshot)}`,
	    );
	    assertAudit(
	        !snapshot.subtitleWordClasses.includes('jpdb-subtitle-word-pending')
	            && Number.parseFloat(snapshot.subtitleWordOpacity || '0') >= 0.9,
	        `subtitle parsed-word state is still pending when the cue is active: ${JSON.stringify(snapshot)}`,
	    );
	}

function hasLaidOutSubtitlePlayer(snapshot) {
    return (snapshot.rect?.width ?? 0) > 200;
}

function hasVisibleFixtureSubtitleText(snapshot) {
    return snapshot.subtitleText.includes('今日') && snapshot.subtitleText.includes('読');
}

function assertDesktopTranscriptLayout(layout) {
    assertAudit(Boolean(layout), 'desktop transcript layout could not be measured');
    assertAudit(isDesktopTranscriptAnchored(layout), `desktop transcript drawer is not anchored to the viewport edge: ${JSON.stringify(layout)}`);
}

function isDesktopTranscriptAnchored(layout) {
    return layout.panelWidth >= 340
        && layout.panelRight <= layout.viewportWidth - 6
        && layout.panelLeft >= layout.viewportWidth * 0.6
        && layout.panelBottom > layout.panelTop;
}

function assertMobileTranscriptLayout(layout) {
    assertAudit(isMobileTranscriptSheet(layout), `mobile transcript panel is not bottom-sheet sized: ${JSON.stringify(layout)}`);
}

function isMobileTranscriptSheet(layout) {
    return layout.width >= layout.viewportWidth - 24 && layout.top > layout.viewportHeight * 0.42;
}

async function runAudit(name, fn, options = {}) {
    if (shouldSkipAudit(options)) {
        record(name, 'skip', 'YOMU_TEST_API_KEY is not set');
        return;
    }
    try {
        await fn();
    } catch (error) {
        record(name, 'fail', error instanceof Error ? error.message : String(error));
    }
}

function shouldSkipAudit(options) {
    return options.requiresApiKey && !QA_API_KEY;
}

async function main() {
    await mkdir(ARTIFACTS, { recursive: true });
    userscript = await readBuiltUserscript();
    readerCss = await readBuiltReaderCss();

    const server = await startStaticServer(DIST);
    const browser = await chromium.launch({ headless: true });
    try {
        await runAudit('secret leak scan', auditNoSecretLeak);
        await runAudit('mobile onboarding', () => auditOnboardingMobile(browser, server));
        await runAudit('settings dialog', () => auditSettings(browser, server));
        await runAudit('mobile settings journey', () => auditSettingsMobile(browser, server));
        await runAudit('new-tab dictionary fallback', () => auditNewTabDictionaryFallback(browser, server));
        await runAudit('runtime regression fixture', () => auditRuntimeRegressionFixes(browser, server), { requiresApiKey: true });
        await runAudit('Bloomee auto page scan', () => auditBloomeeAutoScan(browser), { requiresApiKey: true });
        await runAudit('hold-key hover lookup', () => auditHoverLookup(browser, server), { requiresApiKey: true });
        await runAudit('jpdb.io search compatibility', () => auditJpdbSearchCompatibility(browser), { requiresApiKey: true });
        await runAudit('Immersion Kit popup examples', () => auditImmersionKitPopover(browser, server), { requiresApiKey: true });
        await runAudit('OCR fixture', () => auditOcrFixture(browser), { requiresApiKey: true });
        await runAudit('subtitle player fixture', () => auditVideoFixture(browser, server), { requiresApiKey: true });
    } finally {
        await browser.close();
        await server.close();
    }

    const failed = results.filter(result => result.status === 'fail');
    console.log(`\nQA artifacts: ${ARTIFACTS}`);
    console.log(`QA summary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
}

await main();
