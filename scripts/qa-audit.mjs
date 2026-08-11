#!/usr/bin/env node
import { chromium, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { summarizeAxeViolations, WCAG_AUDIT_TAGS } from './lib/a11y-audit-helpers.mjs';
import { loadLocalEnv } from './lib/qa-env.mjs';
import { createYomuPaths } from './lib/paths.mjs';
import {
    addGmStorageBridgeInitScript,
    decodeGmRequestBody,
    newAutoClosingPage,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';

const { appRoot: ROOT, qaArtifactsRoot: ARTIFACTS } = createYomuPaths(import.meta.dirname);
loadLocalEnv(ROOT);
const DIST = path.join(ROOT, 'dist');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const SCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const CSS_PATH = path.join(DIST, 'yomu.css');
const COMPANION_SCRIPT_PATHS = [
    path.join(DIST, 'greasyfork', 'yomu-settings-surface.user.js'),
    path.join(DIST, 'greasyfork', 'yomu-kanji-study.user.js'),
    path.join(DIST, 'greasyfork', 'yomu-ocr-manga.user.js'),
    path.join(DIST, 'greasyfork', 'yomu-ui-copy.user.js'),
    path.join(DIST, 'greasyfork', 'yomu-video.user.js'),
    path.join(DIST, 'greasyfork', 'yomu-anki.user.js'),
];
const SCRIPT_FALLBACK_PATHS = [
    SCRIPT_PATH,
    path.join(ROOT, 'docs', '.vitepress', 'dist', 'yomu.user.js'),
    path.join(ROOT, 'docs', 'public', 'yomu.user.js'),
];
const API_KEY = process.env.YOMU_TEST_API_KEY?.trim() ?? '';
const MOCK_API_KEY = 'yomu-qa-mock-key';
const QA_API_KEY = API_KEY || MOCK_API_KEY;
const QA_ONLY = process.env.YOMU_QA_ONLY?.trim().toLowerCase() ?? '';
const IMMERSION_API_HOSTS = new Set(['apiv2express.immersionkit.com', 'apiv2.immersionkit.com']);
const QA_PUBLIC_PROXY_URL = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/';
const TRANSPARENT_CSS_COLORS = new Set(['transparent', 'rgba(0, 0, 0, 0)', 'rgb(0 0 0 / 0)']);

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
    ocrTextColor: '#17202a',
    ocrOutlineColor: '#ffffff',
    ocrBackgroundColor: '#f4f7fa',
    ocrBackgroundOpacity: 0.68,
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
        scanPage: 'Shift+J',
        hoverLookup: '',
        openSettings: 'Ctrl+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'A',
        nextSubtitle: 'D',
        copySubtitle: 'Shift+C',
        toggleOcr: 'Shift+O',
        scanImages: 'Shift+I',
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
let companionScripts = [];
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

async function readBuiltCompanionScripts() {
    return Promise.all(COMPANION_SCRIPT_PATHS.map(async filePath => ({
        name: path.basename(filePath),
        script: await readFile(filePath, 'utf8'),
    })));
}

function record(name, status, detail = '') {
    results.push({ name, status, detail });
    const marker = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
    console.log(`${marker} ${name}${detail ? ` - ${detail}` : ''}`);
}

function assertAudit(condition, message) {
    if (!condition) throw new Error(message);
}

function firstDefined(value, fallback) {
    return value ?? fallback;
}

async function assertAccessibleSurface(page, name, selector = 'body') {
    const axe = await new AxeBuilder({ page })
        .include(selector)
        .withTags(WCAG_AUDIT_TAGS)
        .analyze();
    const violations = summarizeAxeViolations(axe.violations, {
        nodeLimit: 4,
        summarizeNode: node => ({
            target: node.target.join(' '),
            html: node.html,
            summary: node.failureSummary,
        }),
    });
    assertAudit(!violations.length, `${name} axe violations: ${JSON.stringify(violations)}`);

    const wcag = await page.evaluate(surfaceSelector => {
        const root = document.querySelector(surfaceSelector);
        if (!root) return { missing: true };
        const visible = element => {
            if (element.closest('[aria-hidden="true"]')) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return [
                style.visibility !== 'hidden',
                style.display !== 'none',
                Number(style.opacity || 1) > 0.02,
                rect.width > 0,
                rect.height > 0,
            ].every(Boolean);
        };
        const labelFor = element => {
            return normalizeLabel(`${ariaLabel(element)} ${fallbackLabelText(element)}`);
        };
        const ariaLabel = element => firstPresent([
            element.getAttribute('aria-label'),
            element.getAttribute('aria-labelledby'),
        ]);
        const fallbackLabelText = element => firstPresent([
            element.textContent,
            element.closest('label')?.textContent,
            element.getAttribute('title'),
            element.getAttribute('alt'),
            element.getAttribute('value'),
        ]);
        const firstPresent = values => values.find(Boolean) || '';
        const normalizeLabel = value => {
            return value.replace(/\s+/g, ' ').trim();
        };
        const controls = [...root.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],[tabindex]:not([tabindex="-1"])')]
            .filter(element => visible(element));
        const targetSizeException = element => {
            const style = getComputedStyle(element);
            return [
                element.classList.contains('jpdb-reader-word'),
                element.classList.contains('gloss-link'),
                [element.tagName.toLowerCase() === 'a', style.display === 'inline'].every(Boolean),
            ].some(Boolean);
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
const QA_HOSTED_TRY_ME_PATH = '/yomu-reader/';
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

function qaHostedTryMeHtml() {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>よむ hosted Try Me QA</title>
  <style>
    :root { --vp-c-text-1: #f4f7fb; --vp-c-text-2: #b7c0cc; --jpdb-reader-hover: rgba(255,255,255,.12); }
    body { margin: 0; min-height: 100vh; background: #2f3a40; color: var(--vp-c-text-1); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 960px; margin: 0 auto; padding: 42px 20px; }
    .yomu-try-me { display: grid; gap: 18px; }
    .yomu-try-me > strong { font-size: 24px; }
    .yomu-try-me-text { display: grid; gap: 12px; border-radius: 8px; background: #181b20; padding: 24px; }
    .yomu-try-me-text h3 { min-width: 0; max-width: 100%; margin: 0; color: var(--vp-c-text-2); font-size: 22px; line-height: 1.35; overflow-wrap: anywhere; }
    .yomu-try-me-text p { min-width: 0; max-width: 100%; margin: 0; color: var(--vp-c-text-2); font-size: 17px; line-height: 1.7; overflow-wrap: anywhere; }
    .yomu-try-me .jpdb-reader-word { display: inline; min-width: 0; min-height: 0; padding: 0; line-height: inherit; vertical-align: baseline; white-space: nowrap !important; word-break: keep-all !important; overflow-wrap: normal !important; }
    .yomu-try-me .jpdb-reader-word ruby,
    .yomu-try-me .jpdb-reader-word rt { max-width: none; white-space: nowrap !important; word-break: keep-all !important; overflow-wrap: normal !important; }
  </style>
</head>
<body>
  <main>
    <div class="yomu-try-me">
      <strong>Try me</strong>
      <div class="yomu-try-me-text">
        <h3>青空の下で日本語を読む</h3>
        <p>今日は静かな喫茶店で新しい本を読みました。</p>
      </div>
    </div>
  </main>
</body>
</html>`;
}

async function startStaticServer(root) {
    const { origin, close } = await startLoopbackServer(
        qaAuditRequestHandler(root),
        'Could not bind QA audit server',
    );
    return { origin, close };
}

function qaAuditRequestHandler(root) {
    return function handleQaAuditRequest(req, res) {
        return serveQaAuditRequest(root, req, res);
    };
}

async function serveQaAuditRequest(root, req, res) {
    try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (serveInlineQaRoute(url, res)) return;
        await serveStaticQaFile(root, url, res);
    } catch {
        serveQaNotFound(res);
    }
}

function serveInlineQaRoute(url, res) {
    const html = QA_HTML_ROUTES.get(url.pathname);
    if (html) {
        writeQaServerResponse(res, 'text/html; charset=utf-8', html());
        return true;
    }
    if (isQaSubtitleRoute(url.pathname)) {
        writeQaServerResponse(res, 'text/vtt; charset=utf-8', qaSubtitleBody(url.pathname));
        return true;
    }
    return false;
}

async function serveStaticQaFile(root, url, res) {
    const filePath = qaStaticFilePath(root, url.pathname);
    const body = await readFile(filePath);
    writeQaServerResponse(res, contentType(filePath), body);
}

function qaStaticFilePath(root, pathname) {
    const requested = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    return path.join(root, requested === '/' ? 'newtab/index.html' : requested);
}

function writeQaServerResponse(res, contentTypeValue, body) {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentTypeValue);
    res.end(body);
}

function serveQaNotFound(res) {
    res.statusCode = 404;
    res.end('Not found');
}

function isQaSubtitleRoute(pathname) {
    return pathname === QA_JA_SUBTITLES_PATH || pathname === QA_EN_SUBTITLES_PATH;
}

function qaSubtitleBody(pathname) {
    return pathname === QA_JA_SUBTITLES_PATH ? QA_JA_SUBTITLES : QA_EN_SUBTITLES;
}

const QA_HTML_ROUTES = new Map([
    [QA_READER_PATH, qaReaderHtml],
    [QA_VIDEO_PATH, qaVideoHtml],
    [QA_RUNTIME_REGRESSION_PATH, qaRuntimeRegressionHtml],
    [QA_HOSTED_TRY_ME_PATH, qaHostedTryMeHtml],
]);

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
    (url, data) => url.hostname === 'api.jiten.moe'
        ? jsonQaResponse(mockJitenBrowserPayload(url, data))
        : null,
    url => url.hostname === 'assets.languagepod101.com'
        ? textQaResponse('fake-mp3', 'audio/mpeg')
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
    url => url.hostname === 'us-southeast-1.linodeobjects.com' && url.pathname.startsWith('/immersionkit/')
        ? mockDirectImmersionMedia(url)
        : null,
];

function isImmersionApiUrl(url, pathname) {
    return IMMERSION_API_HOSTS.has(url.hostname) && url.pathname === pathname;
}

function pathKanji(url) {
    return decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] ?? '');
}

function mockImmersionMedia(url) {
    return immersionMediaQaResponse(url.searchParams.get('path') ?? '');
}

function mockDirectImmersionMedia(url) {
    return immersionMediaQaResponse(decodeURIComponent(url.pathname.replace(/^\/immersionkit\//, '')));
}

function immersionMediaQaResponse(mediaPath) {
    const media = immersionMediaResponse(mediaPath);
    return textQaResponse(media.body, media.contentType);
}

function immersionAudioRequestCount(requests) {
    return requests.filter(request => /apiv2(?:express)?\.immersionkit\.com\/download_media/.test(request.url) && /mp3/i.test(request.url)).length;
}

function immersionSearchRequestCount(requests) {
    return requests.filter(request => /apiv2(?:express)?\.immersionkit\.com\/search/.test(request.url)).length;
}

function immersionImageRequestUrls(requests) {
    return requests
        .map(request => request.url)
        .filter(url => /(?:\.jpg|\.jpeg|\.png|\.webp|\.gif|\.avif)(?:$|[?&#])/i.test(decodeURIComponent(url)));
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
    return !normalized || TRANSPARENT_CSS_COLORS.has(normalized);
}

function installQaReaderWordDomHelpersInPage() {
    window.__yomuQaReaderWordDomHelpers = {
        dataAttribute,
        rectSnapshot,
        surface,
    };

    function dataAttribute(node, name) {
        return node?.getAttribute(name) ?? '';
    }

    function rectSnapshot(node) {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }

    function surface(node) {
        return [...node.childNodes].map(childSurface).join('');
    }

    function childSurface(child) {
        if (child.nodeType === Node.TEXT_NODE) return textContent(child);
        if (child instanceof Element && !child.matches('rt,rp')) return surface(child);
        return '';
    }

    function textContent(node) {
        return node.textContent ?? '';
    }
}

function immersionMediaResponse(mediaPath) {
    const isAudio = mediaPath.endsWith('.mp3');
    return {
        contentType: isAudio ? 'audio/mpeg' : 'image/svg+xml; charset=utf-8',
        body: isAudio ? 'fake-mp3' : mockImageSvg(immersionMediaLabel(mediaPath)),
    };
}

function immersionMediaLabel(mediaPath) {
    return ['steins_gate', 'Steins'].some(fragment => mediaPath.includes(fragment))
        ? 'Steins Gate'
        : 'Example';
}

async function newAuditedPage(browser, settings = baseSettings, viewport = { width: 1280, height: 900 }, contextOptions = {}) {
    const { page } = await newAutoClosingPage(browser, { viewport, deviceScaleFactor: 1, ...contextOptions });
    page.on('console', message => {
        if (message.type() === 'error') {
            console.error(`[Browser Console Error]: ${browserConsoleMessageText(message)}`);
        }
    });
    page.on('pageerror', error => {
        console.error(`[Browser Page Error]:`, error);
    });
    const requests = [];
    await page.addInitScript(installQaReaderWordDomHelpersInPage);
    await page.route(/https:\/\/apiv2(?:express)?\.immersionkit\.com\/download_media.*/, route => {
        const url = new URL(route.request().url());
        const mediaPath = url.searchParams.get('path') ?? '';
        const media = immersionMediaResponse(mediaPath);
        requests.push({
            method: route.request().method(),
            url: route.request().url(),
            status: 200,
        });
        route.fulfill({
            status: 200,
            contentType: media.contentType,
            body: media.body,
        });
    });
    await page.route('https://us-southeast-1.linodeobjects.com/immersionkit/**', route => {
        const url = new URL(route.request().url());
        const mediaPath = decodeURIComponent(url.pathname.replace(/^\/immersionkit\//, ''));
        const media = immersionMediaResponse(mediaPath);
        requests.push({
            method: route.request().method(),
            url: route.request().url(),
            status: 200,
        });
        route.fulfill({
            status: 200,
            contentType: media.contentType,
            body: media.body,
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
    await page.route('https://api.jiten.moe/**', route => fulfillJitenBrowserRoute(route));
    await page.route('https://assets.languagepod101.com/**', route => route.fulfill({
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '',
    }));
    await page.route('https://hrussellzfac023.github.io/yomu-reader/yomu-icon.svg', route => route.fulfill({
        status: 200,
        contentType: 'image/svg+xml; charset=utf-8',
        path: path.join(DIST, 'yomu-icon.svg'),
    }));
    await page.exposeFunction('__yomuQaRequest', request => handleQaBridgeRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: settings,
        css: readerCss,
        requestBridgeName: '__yomuQaRequest',
        storagePrefix: '__yomu_qa_gm__',
        initialize: 'ifMissing',
    });
    return { page, requests };
}

async function fulfillJitenBrowserRoute(route) {
    const request = route.request();
    const url = new URL(request.url());
    const payload = mockJitenBrowserPayload(url, request.postData() ?? '');
    await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(payload),
    });
}

function mockJitenBrowserPayload(url, body) {
    const endpoint = url.pathname.replace(/^\/api\//, '');
    const handler = MOCK_JITEN_BROWSER_ENDPOINTS[endpoint];
    if (handler) return handler(url, body);
    return {};
}

const MOCK_JITEN_BROWSER_ENDPOINTS = {
    'reader/parse': (_url, body) => mockJitenParse(readJsonBody(body)),
    'vocabulary/search': url => mockJitenVocabularySearch(url),
};

function mockJitenParse(body) {
    const parsed = mockJpdbParse(body);
    const vocabulary = parsed.vocabulary.map(mockJitenVocabularyFromJpdbEntry);
    const tokens = parsed.tokens.map(group => group.map(token => mockJitenTokenFromJpdbToken(token, vocabulary)).filter(Boolean));
    return { vocabulary, tokens };
}

function mockJitenVocabularyFromJpdbEntry(entry) {
    return {
        wordId: entry[0],
        readingIndex: entry[1],
        spelling: entry[3],
        reading: mockJitenAnnotatedReading(entry[3], entry[4]),
        frequencyRank: entry[5],
        partsOfSpeech: entry[6],
        meaningsChunks: entry[7],
        meaningsPartOfSpeech: entry[8],
        knownState: [0],
        pitchAccents: [1],
    };
}

function mockJitenAnnotatedReading(spelling, reading) {
    return /[\u3400-\u9fff]/u.test(spelling) ? `${spelling}[${reading}]` : reading;
}

function mockJitenTokenFromJpdbToken(token, vocabulary) {
    const [vocabIndex, start, length] = token;
    const entry = vocabulary[vocabIndex];
    if (!entry) return null;
    return {
        wordId: entry.wordId,
        readingIndex: entry.readingIndex,
        start,
        end: start + length,
        length,
    };
}

function mockJitenVocabularySearch(url) {
    const query = url.searchParams.get('query') ?? url.searchParams.get('q') ?? '';
    const results = qaVocabulary
        .filter(item => !query || qaVocabularyMatches(item, query))
        .slice(0, 8)
        .map((item, index) => ({
            wordId: 100000 + index,
            readingIndex: 200000 + index,
            text: item.spelling,
            rubyText: mockJitenAnnotatedReading(item.spelling, item.reading),
            frequencyRank: item.frequency,
            partsOfSpeech: item.partOfSpeech,
            meanings: [item.gloss],
        }));
    return { results };
}

async function handleQaBridgeRequest(request, requests) {
    const body = decodeGmRequestBody(request.data);
    const mocked = maybeMockQaRequest({ ...request, data: body });
    if (mocked) {
        recordQaBridgeRequest(requests, request, body, mocked.status);
        return mocked;
    }
    const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    recordQaBridgeRequest(requests, request, body, response.status);
    return {
        status: response.status,
        responseText: buffer.toString('utf8'),
        bytes: [...buffer],
        contentType: response.headers.get('content-type') ?? '',
    };
}

function recordQaBridgeRequest(requests, request, body, status) {
    requests.push({
        method: request.method,
        url: request.url.replace(QA_API_KEY, '[redacted]'),
        status,
        ...summarizeRequestBody(body),
    });
}

async function injectUserscript(page) {
    await page.evaluate(({ companions, script }) => {
        for (const companion of companions) {
            (0, eval)(`${companion.script}\n//# sourceURL=${companion.name}`);
        }
        (0, eval)(`${script}\n//# sourceURL=yomu.user.js`);
    }, { companions: companionScripts, script: userscript });
}

async function openSeededReaderFixture(browser, server, {
    path: fixturePath,
    html,
    settings,
    scanMessage = 'fixture text was not scanned',
    waitForWords = readerFixtureHasScannedWords,
}) {
    const { page, requests } = await newAuditedPage(browser, settings);
    await installMockAudioPlayback(page);
    await page.route(`${server.origin}${fixturePath}`, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
    }));
    await page.goto(`${server.origin}${fixturePath}`, { waitUntil: 'domcontentloaded' });
    await seedLocalKanjiDictionaries(page);
    await injectUserscript(page);
    await waitForAudit(page, waitForWords, 10000, scanMessage);
    return { page, requests };
}

async function installMockAudioPlayback(page) {
    await page.addInitScript(() => {
        window.__yomuAudioPlayCount = 0;
        HTMLMediaElement.prototype.play = function play() {
            window.__yomuAudioPlayCount += 1;
            return Promise.resolve();
        };
    });
}

function readerFixtureHasScannedWords() {
    return document.querySelectorAll('.jpdb-reader-word').length > 0;
}

async function openSettingsFromPuck(page) {
    await page.waitForSelector('.jpdb-reader-fab', { timeout: 6000 });
    await page.locator('.jpdb-reader-fab').click();
    const radialSettings = page.locator('.jpdb-reader-fab-radial [data-radial-id="settings"]').first();
    if (await radialSettings.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        await radialSettings.click();
    }
    if (!await page.locator('.jpdb-reader-settings').isVisible().catch(() => false)) {
        await page.keyboard.press('Control+Shift+J');
    }
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    assertAudit(await page.locator('.jpdb-reader-quick').count() === 0, 'puck opened the removed quick controls panel');
}

async function auditNoSecretLeak() {
    if (!API_KEY) {
        record('secret leak scan', 'skip', 'YOMU_TEST_API_KEY is not set');
        return;
    }
    const files = await listFiles(ROOT, new Set(['.git', 'node_modules', 'artifacts', 'qa-artifacts']));
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
    areDue: request => ({ result: (request.params?.cards ?? []).map(() => true), error: null }),
    answerCards: () => ({ result: null, error: null }),
    guiBrowse: () => ({ result: null, error: null }),
    deckNames: () => ({ result: ['Yomu'], error: null }),
    modelNames: () => ({ result: [], error: null }),
    createDeck: () => ({ result: null, error: null }),
    createModel: () => ({ result: null, error: null }),
    canAddNotes: request => ({ result: (request.params?.notes ?? []).map(() => true), error: null }),
    addNote: () => ({ result: 12345, error: null }),
};

function mockAnkiNoteInfo(noteId) {
    return {
        noteId,
        modelName: 'Mining',
        tags: ['yomu'],
        fields: {
            Expression: { value: '読む', order: 0 },
            Reading: { value: 'よむ', order: 1 },
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
    const tokens = paragraphs.map(text => mockJpdbParseParagraph(text, vocabulary, vocabIndexByKey));
    return { vocabulary, tokens };
}

function mockJpdbParseParagraph(text, vocabulary, vocabIndexByKey) {
    const paragraphTokens = [];
    for (let index = 0; index < text.length;) {
        const entry = mockJpdbEntryAt(text, index);
        if (!entry) {
            index += 1;
            continue;
        }
        const vocabIndex = ensureMockVocabularyIndex(entry, vocabulary, vocabIndexByKey);
        paragraphTokens.push(mockJpdbToken(entry, index, vocabIndex));
        index += entry.surface.length;
    }
    return paragraphTokens;
}

function mockJpdbEntryAt(text, index) {
    return qaVocabulary
        .filter(item => text.startsWith(item.surface, index))
        .sort((a, b) => b.surface.length - a.surface.length)[0];
}

function ensureMockVocabularyIndex(entry, vocabulary, vocabIndexByKey) {
    const existingIndex = vocabIndexByKey.get(entry.spelling);
    if (existingIndex !== undefined) return existingIndex;
    const vocabIndex = vocabulary.length;
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
    return vocabIndex;
}

function mockJpdbToken(entry, index, vocabIndex) {
    return [
        vocabIndex,
        index,
        entry.surface.length,
        mockJpdbTokenFurigana(entry),
    ];
}

function mockJpdbTokenFurigana(entry) {
    return /[\u3400-\u9fff]/u.test(entry.surface) ? [[entry.surface, entry.reading]] : null;
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
    const { spelling, reading, meaning, pitchLow, pitchHigh } = mockJpdbVocabularyFixture(url);
    return `<!doctype html><html lang="ja"><head>
        <meta charset="utf-8">
        <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/${encodeURIComponent(spelling)}/${encodeURIComponent(reading)}">
        <meta name="description" content="${htmlEscape(spelling)} - ${htmlEscape(meaning)}">
    </head><body>
        <div class="results search">
            <div class="result vocabulary">
                <div class="subsection-spelling"><a href="/vocabulary/1456360/${encodeURIComponent(spelling)}/${encodeURIComponent(reading)}">${htmlEscape(spelling)}</a></div>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="subsection"><div class="description">${htmlEscape(meaning)}</div></div>
                </div>
                <div class="subsection-pitch-accent">
                    <h6 class="subsection-label">Pitch accent</h6>
                    <div class="subsection"><div>
                        <div style="--pitch-low: 1">${htmlEscape(pitchLow)}</div>
                        <div style="--pitch-high: 1">${htmlEscape(pitchHigh)}</div>
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

function mockJpdbVocabularyFixture(url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const query = url.searchParams.get('q') ?? '';
    const expression = mockJpdbVocabularyExpression(parts, query);
    const reading = mockJpdbVocabularyReading(parts, expression);
    const record = firstDefined(findQaVocabularyRecord(expression, query), fallbackQaVocabularyRecord(expression, reading));
    const spelling = firstDefined(record.spelling, expression);
    const safeReading = firstDefined(record.reading, reading);
    const meaning = firstDefined(record.gloss, 'example word');
    return {
        spelling,
        reading: safeReading,
        meaning,
        ...mockJpdbVocabularyPitch(spelling, safeReading),
    };
}

function mockJpdbVocabularyExpression(parts, query) {
    const expression = decodeURIComponent(parts[2] ?? query ?? '読む');
    return expression || '読む';
}

function mockJpdbVocabularyReading(parts, expression) {
    const reading = decodeURIComponent(parts[3] ?? '');
    if (reading) return reading;
    const record = qaVocabulary.find(item => [item.spelling, item.surface].includes(expression));
    return firstDefined(record?.reading, expression);
}

function findQaVocabularyRecord(expression, query) {
    return qaVocabulary.find(item => qaVocabularyMatches(item, expression) || qaVocabularyMatches(item, query));
}

function qaVocabularyMatches(item, value) {
    if (!value) return false;
    return item.surface === value || item.spelling === value || item.reading === value;
}

function fallbackQaVocabularyRecord(expression, reading) {
    return qaVocabulary.find(item => item.spelling === '読む') ?? { spelling: expression, reading, gloss: 'example word' };
}

function mockJpdbVocabularyPitch(spelling, reading) {
    return {
        pitchLow: reading.slice(0, 1) || spelling.slice(0, 1),
        pitchHigh: reading.slice(1) || spelling.slice(1) || spelling,
    };
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
            sentence: '静かな喫茶店で新しい本を読む時間が好きです。',
            sentence_with_furigana: '静[しず]かな 喫茶店[きっさてん]で 新[あたら]しい 本[ほん]を 読[よ]む 時間[じかん]が 好[す]きです。',
            translation: 'I like spending time reading a new book in a quiet cafe.',
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
            sentence: '日本語の本を読む練習をしました。',
            translation: 'I practiced reading a Japanese book.',
            image: 'qa-3.jpg',
            sound: 'qa-3.mp3',
        },
        {
            id: 'anime_qa_story_000004',
            title: 'qa_story',
            sentence: '朝に新聞を読む習慣を続けています。',
            translation: 'I keep up the habit of reading the newspaper in the morning.',
            image: 'qa-4.jpg',
            sound: 'qa-4.mp3',
        },
        {
            id: 'anime_qa_story_000005',
            title: 'qa_story',
            sentence: '声に出して読むと発音を確認できます。',
            translation: 'Reading aloud lets you check your pronunciation.',
            image: 'qa-5.jpg',
            sound: 'qa-5.mp3',
        },
        {
            id: 'drama_qa_story_000006',
            title: 'qa_story',
            sentence: '寝る前に短い物語を読むことにしました。',
            translation: 'I decided to read a short story before bed.',
            image: 'qa-6.jpg',
            sound: 'qa-6.mp3',
        },
        {
            id: 'drama_qa_story_000007',
            title: 'qa_story',
            sentence: '分からない漢字があっても最後まで読むつもりです。',
            translation: 'I plan to read to the end even if there are kanji I do not know.',
            image: 'qa-7.jpg',
            sound: 'qa-7.mp3',
        },
        {
            id: 'drama_qa_story_000008',
            title: 'qa_story',
            sentence: 'この手紙をもう一度ゆっくり読む必要があります。',
            translation: 'I need to read this letter slowly one more time.',
            image: 'qa-8.jpg',
            sound: 'qa-8.mp3',
        },
    ].map(example => !query || example.sentence.includes(query) ? example : {
        ...example,
        sentence: `${query}について、${example.sentence}`,
        sentence_with_furigana: '',
    });
    return { examples, category_count: { anime: 5, drama: 3 }, deck_count: {} };
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
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
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
                { expression: '読む', reading: 'よむ', glossary: ['to read', '日本語を読む'], score: 10, dictionary: 'Jitendex' },
                { expression: '母', reading: 'はは', glossary: [{ type: 'structured-content', content: { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: [{ tag: 'span', data: { content: 'part-of-speech-info' }, content: 'n' }, ' mother; mama'] }] } }], score: 10, dictionary: 'Jitendex' },
                { expression: '母', reading: 'はは', glossary: [{ tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'female parent name entry' }] }], score: 5, dictionary: 'JMnedict' },
            ].forEach(entry => seedTermEntry(tx, termSearch, termKanji, entry));
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

        function seedTermEntry(tx, termSearch, termKanji, entry) {
            tx.objectStore('terms').add(entry);
            addTermSearchTokens(termSearch, entry);
            addTermKanjiCharacters(termKanji, entry);
        }

        function addTermSearchTokens(termSearch, entry) {
            if (!termSearch) return;
            for (const token of qaGlossaryTokens(entry.glossary)) termSearch.add({ ...entry, token });
        }

        function addTermKanjiCharacters(termKanji, entry) {
            if (!termKanji) return;
            for (const character of termKanjiCharacters(entry.expression)) termKanji.add({ ...entry, character });
        }

        function termKanjiCharacters(expression) {
            return [...new Set([...entryCharacters(expression)].filter(isKanjiCharacter))];
        }

        function entryCharacters(value) {
            return [...value];
        }

        function isKanjiCharacter(value) {
            return /[\u3400-\u9fff]/u.test(value);
        }
    });
}

async function auditOnboardingMobile(browser, server) {
    const { page } = await newAuditedPage(browser, { ...baseSettings, onboardingSeen: false, apiKey: '' }, { width: 390, height: 844 });
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
            visibleCopy: visibleText(panel),
            languageVisible: Boolean(language && !language.closest('[hidden]')),
            actionRects,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
        };

        function visibleText(node) {
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
            if (!(node instanceof Element)) return '';
            if (node.matches('rt,rp,[aria-hidden="true"]')) return '';
            return [...node.childNodes].map(visibleText).join('');
        }
    });
    assertAudit(snapshot.title === 'よむ', 'onboarding title is missing');
    const onboardingCopy = snapshot.visibleCopy.replace(/\s+/g, ' ').trim();
    assertAudit(
        /Japanese\s*text.*subtitles.*images/i.test(onboardingCopy)
            || ((/本文|日本語|テキスト/.test(onboardingCopy)) && /字幕|動画/.test(onboardingCopy) && /画像/.test(onboardingCopy)),
        `onboarding does not explain the core value: ${JSON.stringify({ copy: onboardingCopy.slice(0, 500) })}`,
    );
    assertAudit(snapshot.languageVisible, 'onboarding language choice is not visible');
    assertAudit(snapshot.actionRects.length >= 2, 'onboarding actions are missing');
    assertAudit(
        snapshot.actionRects.some(rect => /Add API key|APIキー/.test(rect.text ?? ''))
            && snapshot.actionRects.some(rect => /Use without API key|APIキーなし/.test(rect.text ?? '')),
        'onboarding actions do not make the setup choices clear',
    );
    assertAudit(snapshot.actionRects.every(rect => rect.top >= 0 && rect.bottom <= snapshot.viewportHeight && rect.left >= 0 && rect.right <= snapshot.viewportWidth), 'onboarding actions are not visible on first mobile screen');
    await assertAccessibleSurface(page, 'mobile onboarding', '.jpdb-reader-onboarding');
    await page.screenshot({ path: path.join(ARTIFACTS, 'onboarding-mobile.png'), fullPage: false });
    await page.locator('[data-onboarding-action="api-key"]').click();
    if (!await page.locator('.jpdb-reader-settings').isVisible().catch(() => false)) {
        await page.keyboard.press('Control+Shift+J');
    }
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
    assertAudit(localeSnapshot.save === '保存' && localeSnapshot.cancel === 'キャンセル' && localeSnapshot.firstTab === '外観', `changing settings language did not localize visible controls: ${JSON.stringify(localeSnapshot)}`);
    await page.selectOption('select[name="interfaceLanguage"]', 'en');
}

function readSettingsLocaleSnapshot(page) {
    return page.evaluate(() => {
        const surfaceText = node => {
            if (!(node instanceof HTMLElement)) return undefined;
            const copy = node.cloneNode(true);
            if (!(copy instanceof HTMLElement)) return undefined;
            copy.querySelectorAll('.jpdb-reader-word').forEach(word => {
                word.replaceWith(word.getAttribute('data-expression') ?? word.textContent ?? '');
            });
            return copy.textContent?.trim();
        };
        return {
            title: document.querySelector('.jpdb-reader-settings')?.getAttribute('aria-label'),
            heading: surfaceText(document.querySelector('.jpdb-reader-settings h2')),
            save: surfaceText(document.querySelector('.jpdb-reader-settings button[type="submit"]')),
            cancel: surfaceText(document.querySelector('.jpdb-reader-settings [data-action="cancel"]')),
            firstTab: surfaceText(document.querySelector('.jpdb-reader-settings-tab')),
        };
    });
}

async function captureSettingsDialog(page) {
    await page.evaluate(() => {
        document.querySelector('[data-theme-field]')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await page.locator('.jpdb-reader-settings').screenshot({ path: path.join(ARTIFACTS, 'settings.png') });
}

async function captureHoverShortcut(page) {
    await page.locator('[data-action="settings-panel"][data-panel="shortcuts"]').click();
    const hoverShortcut = page.locator('#jpdb-reader-settings-panel-shortcuts input[name="shortcuts.hoverLookup"]');
    await hoverShortcut.click();
    await page.keyboard.down('Shift');
    await page.keyboard.press('KeyH');
    await page.keyboard.up('Shift');
}

function readSettingsSnapshot(page) {
    return page.evaluate(readSettingsSnapshotFromDom);
}

function readSettingsSnapshotFromDom() {
    const form = document.querySelector('.jpdb-reader-settings');
    return {
        ...settingsActionSnapshot(form),
        ...settingsLayoutSnapshot(form),
        ...settingsOcrSnapshot(),
        ...settingsShortcutSnapshot(),
        ...settingsDictionarySnapshot(),
        ...settingsStructureSnapshot(),
        ...settingsHelpSnapshot(),
    };

    function settingsActionSnapshot(root) {
        const save = root?.querySelector('button[type="submit"]');
        const cancel = root?.querySelector('[data-action="cancel"]');
        return {
            title: root?.getAttribute('aria-label'),
            saveText: text(save),
            cancelText: text(cancel),
        };
    }

    function settingsLayoutSnapshot(root) {
        const save = root?.querySelector('button[type="submit"]');
        return {
            formBottom: bottom(root),
            saveBottom: bottom(save),
            viewportHeight: innerHeight,
            passFailRows: visibleCount('[data-review-scale="pass-fail"]'),
            fiveRows: visibleCount('[data-review-scale="five"]'),
        };
    }

    function settingsOcrSnapshot() {
        return {
            ocrProvider: fieldValue('select[name="ocrProvider"]') ?? '',
            localOcrHidden: allHidden('[data-local-ocr]'),
            cloudOcrHidden: allHidden('[data-cloud-ocr]'),
        };
    }

    function settingsShortcutSnapshot() {
        return {
            hoverShortcut: fieldValue('input[name="shortcuts.hoverLookup"]'),
        };
    }

    function settingsDictionarySnapshot() {
        return {
            recommendedDownloads: count('[data-action="download-recommended-dictionary"]'),
            recommendedDownloadText: text(document.querySelector('[data-recommended-dictionaries]')) ?? '',
            dictionarySources: count('[data-dictionary-source-row]'),
        };
    }

    function settingsStructureSnapshot() {
        return {
            settingsTabs: count('.jpdb-reader-settings-tab'),
        };
    }

    function settingsHelpSnapshot() {
        return {
            helpLinks: count('[data-help-link]'),
            helpCopy: text(document.querySelector('.jpdb-reader-help-links-card')) ?? '',
        };
    }

    function text(node) {
        if (!(node instanceof HTMLElement)) return undefined;
        const copy = node.cloneNode(true);
        if (!(copy instanceof HTMLElement)) return undefined;
        copy.querySelectorAll('.jpdb-reader-word').forEach(word => {
            word.replaceWith(word.getAttribute('data-expression') ?? word.textContent ?? '');
        });
        return copy.textContent?.trim();
    }

    function bottom(node) {
        return node?.getBoundingClientRect().bottom ?? 0;
    }

    function visibleCount(selector) {
        return [...document.querySelectorAll(selector)].filter(element => !element.hidden).length;
    }

    function allHidden(selector) {
        return [...document.querySelectorAll(selector)].every(element => element.hidden);
    }

    function fieldValue(selector) {
        return document.querySelector(selector)?.value;
    }

    function count(selector) {
        return document.querySelectorAll(selector).length;
    }
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
    return snapshot.helpLinks >= 3
        && /Video Player|動画プレイヤー/.test(snapshot.helpCopy)
        && /New Tab|Study|新しいタブ|学習/.test(snapshot.helpCopy)
        && /Docs|ドキュメント/.test(snapshot.helpCopy);
}

function hasRecommendedDictionaryDownloads(snapshot) {
    const requiredNames = ['JMdict', 'Jitendex', 'JMnedict', 'KANJIDIC', 'Jiten', 'JPDBv2', 'BCCWJ'];
    return snapshot.recommendedDownloads >= requiredNames.length
        && requiredNames.every(name => new RegExp(name, 'i').test(snapshot.recommendedDownloadText))
        && textAppearsBefore(snapshot.recommendedDownloadText, 'Jiten', 'JPDBv2');
}

function textAppearsBefore(text, first, second) {
    const firstIndex = text.indexOf(first);
    const secondIndex = text.indexOf(second);
    return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
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
    await page.locator('[data-action="settings-panel"][data-panel="help"]').click();
    assertSettingsSnapshot(await readSettingsSnapshot(page));
    await assertAccessibleSurface(page, 'settings dialog', '.jpdb-reader-settings');
    await assertSettingsAnkiTest(page);
    await page.close();
    record('settings dialog', 'pass', 'actions visible, irrelevant provider fields hidden, Anki test status shown');
}

async function auditSettingsMobile(browser, server) {
    const { page, requests } = await newAuditedPage(browser, {
        ...baseSettings,
        apiKey: '',
        showFloatingButton: true,
        ocrEnabled: true,
    }, { width: 390, height: 844 });
    await page.goto(`${server.origin}${QA_READER_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await openSettingsFromPuck(page);
    let snapshot = await page.evaluate(mobileSettingsTabsSnapshotFromDom);
    assertAudit(snapshot.tabs.length >= 6, 'mobile settings tabs are missing sections');
    assertAudit(snapshot.tabs.every(tab => tab.left >= 0 && tab.right <= snapshot.viewportWidth && tab.width > 30), 'a mobile settings tab is clipped');
    assertAudit(snapshot.tabBarWidth <= snapshot.tabBarClientWidth + 1, 'mobile settings tabs require hidden horizontal scrolling');
    await page.locator('[data-action="settings-panel"][data-panel="api"]').click();
    await page.waitForSelector('#jpdb-reader-settings-panel-api:not([hidden])', { timeout: 3000 });
    snapshot = await page.evaluate(mobileSettingsTabsSnapshotFromDom);
    assertAudit(snapshot.apiKeyTop < snapshot.viewportHeight * 0.55, 'API key field is too far down after opening settings');

    await page.locator('[data-action="settings-panel"][data-panel="media"]').click();
    snapshot = await page.evaluate(mobileAudioSourceToolsSnapshotFromDom);
    assertAudit(snapshot.tools.length > 0, 'mobile audio source tools are missing');
    assertAudit(snapshot.tools.every(tool => tool.left >= 0 && tool.buttons.every(button => button.left >= 0 && button.width >= 34 && button.height >= 34)), 'mobile audio source controls are cramped or clipped');

    await page.locator('[data-action="settings-panel"][data-panel="help"]').click();
    await assertAccessibleSurface(page, 'mobile settings help', '.jpdb-reader-settings');
    await page.screenshot({ path: path.join(ARTIFACTS, 'settings-mobile-help.png'), fullPage: false });
    snapshot = await page.evaluate(() => ({
        helpLinks: document.querySelectorAll('[data-help-link]').length,
        linkCopy: Array.from(document.querySelectorAll('[data-help-link]'), link => {
            const visibleCopy = link.cloneNode(true);
            if (visibleCopy instanceof HTMLElement) {
                visibleCopy.querySelectorAll('.jpdb-reader-word').forEach(word => {
                    word.replaceWith(word.getAttribute('data-expression') ?? word.textContent ?? '');
                });
            }
            return visibleCopy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        }).join(' '),
    }));
    assertAudit(snapshot.helpLinks >= 3, 'mobile Help tab does not expose hosted reader tool links');
    assertAudit(/Video Player|動画プレイヤー/.test(snapshot.linkCopy)
        && /New Tab|Study|新しいタブ|学習/.test(snapshot.linkCopy)
        && /Docs|ドキュメント/.test(snapshot.linkCopy), `mobile Help tab is missing hosted reader tool names: ${JSON.stringify(snapshot)}`);
    await page.close();
    record('mobile settings journey', 'pass', 'tabs, audio rows, and help links stay visible on iPhone width');
}

function mobileSettingsTabsSnapshotFromDom() {
    const tabBar = document.querySelector('.jpdb-reader-settings-tabs');
    const apiKey = document.querySelector('input[name="apiCredentialJiten"], input[name="apiCredentialJpdb"], input[name="apiKey"]');
    return {
        tabs: [...document.querySelectorAll('.jpdb-reader-settings-tab')].map(settingsTabSnapshot),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        tabBarWidth: numericProperty(tabBar, 'scrollWidth'),
        tabBarClientWidth: numericProperty(tabBar, 'clientWidth'),
        apiKeyTop: elementTop(apiKey, 9999),
    };

    function settingsTabSnapshot(tab) {
        const rect = tab.getBoundingClientRect();
        return { text: text(tab), left: rect.left, right: rect.right, width: rect.width };
    }

    function numericProperty(node, property) {
        return node?.[property] ?? 0;
    }

    function elementTop(node, fallback) {
        return node?.getBoundingClientRect().top ?? fallback;
    }

    function text(node) {
        return node.textContent?.trim() ?? '';
    }
}

function mobileAudioSourceToolsSnapshotFromDom() {
    return {
        tools: [...document.querySelectorAll('.jpdb-reader-audio-source-row .jpdb-reader-row-tools')].map(rowToolsSnapshot),
        viewportWidth: innerWidth,
    };

    function rowToolsSnapshot(row) {
        const rect = row.getBoundingClientRect();
        return {
            left: rect.left,
            buttons: [...row.querySelectorAll('button')].map(buttonRectSnapshot),
        };
    }

    function buttonRectSnapshot(button) {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left };
    }
}

async function auditNewTabDictionaryFallback(browser, server) {
    const settings = newTabDictionaryFallbackSettings();
    const { page } = await newAuditedPage(browser, settings, { width: 390, height: 844 });
    const browserErrors = collectPageBrowserErrors(page);
    await page.goto(`${server.origin}/newtab/index.html?static=1`, { waitUntil: 'domcontentloaded' });
    await waitForAudit(page, newTabFirstRunAdvancedFromDom, 8000, 'new-tab first-run did not advance past loading without the dictionary setup screen');
    const firstRunSnapshot = await page.evaluate(() => ({
        hasLoadDictionary: Boolean(document.querySelector('[data-newtab-action="load-dictionary"]')),
        hasSettings: Boolean(document.querySelector('[data-newtab-action="settings"]')),
        body: document.body.textContent ?? '',
    }));
    assertNewTabFirstRunFallbackSnapshot(firstRunSnapshot);

    await page.evaluate(({ cacheKey, key, prefix, stateKey, value }) => {
        const state = {
            mode: 'word',
            listenSubMode: 'perceive',
            sort: 'random',
            filter: 'all',
            source: 'dictionary',
            revealAnswer: false,
            jpdbDeck: '',
            ankiDeck: '',
            keyHintsDismissed: false,
        };
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(`${prefix}${cacheKey}`);
        localStorage.setItem(key, JSON.stringify(value));
        localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
        localStorage.setItem(stateKey, JSON.stringify(state));
        localStorage.setItem(`${prefix}${stateKey}`, JSON.stringify(state));
    }, {
        cacheKey: 'jpdb-reader-newtab-card-cache',
        key: SETTINGS_KEY,
        prefix: '__yomu_qa_gm__',
        stateKey: 'jpdb-reader-newtab-ui',
        value: settings,
    });
    await seedLocalKanjiDictionaries(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await waitForAudit(page, newTabDictionaryFallbackReadyFromDom, 8000, 'new-tab page stayed stuck in placeholder/loading state').catch(async error => {
        const detail = await page.evaluate(newTabDictionaryFallbackDebugSnapshot);
        throw new Error(`new-tab page stayed stuck in placeholder/loading state: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await revealNewTabDictionaryCard(page);
    await waitForAudit(page, () => Boolean(document.querySelector('[data-newtab-meaning]')?.textContent?.trim()), 3000, 'new-tab dictionary card did not reveal a meaning');
    const snapshot = await page.evaluate(newTabDictionarySnapshotFromDom);
    assertNewTabDictionarySnapshot(snapshot);
    assertNoPageBrowserErrors(browserErrors, 'new-tab');
    await waitForAudit(page, () => [...document.querySelectorAll('.jpdb-reader-newtab img')]
        .every(image => image.complete && image.naturalWidth > 0), 3000, 'new-tab brand image did not load');
    await assertAccessibleSurface(page, 'new-tab dictionary fallback', '.jpdb-reader-newtab');
    await page.screenshot({ path: path.join(ARTIFACTS, 'newtab-dictionary.png'), fullPage: false });
    await page.close();
    record('new-tab dictionary fallback', 'pass', 'first-run skips the dictionary setup screen, then seeded local dictionaries render without setup warnings');
}

function newTabFirstRunAdvancedFromDom() {
    const body = document.body.textContent ?? '';
    return !['Start with a dictionary', 'Add dictionary', 'Loading...', 'Loading words...']
        .some(text => body.includes(text));
}

function newTabDictionarySnapshotFromDom() {
    return {
        title: document.title,
        brandHref: attribute('.jpdb-reader-newtab-brand a, a.jpdb-reader-newtab-brand', 'href'),
        expression: text('[data-newtab-expression]'),
        meaning: text('[data-newtab-meaning]'),
        status: text('[data-newtab-status]'),
        hasSettingsControl: Boolean(document.querySelector('[data-newtab-action="settings"]')),
        body: document.body.textContent ?? '',
    };

    function attribute(selector, name) {
        return document.querySelector(selector)?.getAttribute(name) ?? '';
    }

    function text(selector) {
        return document.querySelector(selector)?.textContent?.trim() ?? '';
    }
}

async function revealNewTabDictionaryCard(page) {
    const revealButton = page.locator('[data-newtab-action="reveal"]').first();
    if (await revealButton.count()) {
        await revealButton.click();
        return;
    }
    await page.locator('[data-newtab-action="study-step"][data-study-step-kind="final-reveal"]').last().click();
}

function newTabDictionaryFallbackReadyFromDom() {
    const body = document.body.textContent ?? '';
    const prompt = document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '';
    return [
        Boolean(document.querySelector('[data-newtab-card]')),
        Boolean(prompt),
        Boolean(document.querySelector('[data-newtab-action="reveal"], [data-newtab-action="study-step"][data-study-step-kind="final-reveal"]')),
        !hasNewTabBlockingStatus(body),
    ].every(Boolean);

    function hasNewTabBlockingStatus(text) {
        return ['Loading...', 'Loading words...', 'No dictionary enabled', 'Ensure the Yomu userscript is running.']
            .some(phrase => text.includes(phrase));
    }
}

async function newTabDictionaryFallbackDebugSnapshot() {
    const dbSummary = await newTabDictionaryDbSummary();
    return {
        dbSummary,
        card: exists('[data-newtab-card]'),
        prompt: text('[data-newtab-prompt]'),
        meaning: text('[data-newtab-meaning]'),
        status: text('[data-newtab-status]'),
        controls: [...document.querySelectorAll('[data-newtab-action]')].map(node => node.getAttribute('data-newtab-action')),
        runtimeKind: runtimeOwnerKind(),
        runtimeInitialized: Boolean(window.__yomuReaderAppInitialized),
        body: normalizedBodyText().slice(0, 500),
    };

    function runtimeOwnerKind() {
        return document.getElementById('jpdb-reader-runtime-owner')?.dataset.yomuRuntimeKind ?? '';
    }

    function normalizedBodyText() {
        return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    function text(selector) {
        return document.querySelector(selector)?.textContent ?? '';
    }

    function exists(selector) {
        return Boolean(document.querySelector(selector));
    }

    function newTabDictionaryDbSummary() {
        return new Promise(resolve => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onerror = () => resolve({ error: request.error?.message ?? 'open failed' });
            request.onsuccess = () => resolveNewTabDictionaryDb(request.result, resolve);
        });
    }

    function resolveNewTabDictionaryDb(db, resolve) {
        const stores = [...db.objectStoreNames];
        const txStores = stores.filter(isNewTabDictionaryStore);
        if (!txStores.length) {
            db.close();
            resolve({ stores, counts: {} });
            return;
        }
        countNewTabDictionaryStores(db, stores, txStores, resolve);
    }

    function countNewTabDictionaryStores(db, stores, txStores, resolve) {
        const tx = db.transaction(txStores, 'readonly');
        const counts = {};
        let pending = txStores.length;
        const finish = () => {
            pending -= 1;
            if (!pending) {
                db.close();
                resolve({ stores, counts });
            }
        };
        txStores.forEach(name => countNewTabDictionaryStore(tx, name, counts, finish));
    }

    function countNewTabDictionaryStore(tx, name, counts, finish) {
        const count = tx.objectStore(name).count();
        count.onsuccess = () => {
            counts[name] = count.result;
            finish();
        };
        count.onerror = () => {
            counts[name] = `error:${count.error?.message ?? count.error}`;
            finish();
        };
    }

    function isNewTabDictionaryStore(name) {
        return ['dictionaryInfo', 'terms', 'kanji', 'termMeta'].includes(name);
    }
}

function newTabDictionaryFallbackSettings() {
    return {
        ...baseSettings,
        apiKey: '',
        ankiEnabled: false,
        localDictionariesEnabled: true,
        newTabEnabled: false,
        newTabOfflineEnabled: false,
        newTabSource: 'dictionary',
        showFloatingButton: false,
        dictionaryPreferences: [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 },
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 1 },
        ],
    };
}

async function auditHostedTryMeDemo(browser, server) {
    await assertHostedTryMeFreshProfile(browser, server);
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        wordHighlightColorSource: 'jpdb',
        wordUnderlineColorSource: 'jpdb',
        wordTextColorSource: 'jpdb',
        hoverOpenDelayMs: 35,
        hoverCloseDelayMs: 120,
    });
    const browserErrors = collectPageBrowserErrors(page);
    await page.goto(`${server.origin}${QA_HOSTED_TRY_ME_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await waitForAudit(page, hostedTryMeDownWrappedFromDom, 10000, 'hosted Try Me did not wrap 下 as a lookup word');

    const snapshot = await hostedTryMeVisualSnapshot(page);
    assertHostedTryMeAuthenticatedSnapshot(snapshot);

    const downBox = snapshot.down.rect;
    await page.mouse.move(downBox.x + downBox.width / 2, downBox.y + downBox.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, hostedTryMeDownLookupOpenFromDom, 6000, 'hovering hosted Try Me 下 did not open the 下 lookup');
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close hosted Try Me hover popup');
    await page.mouse.click(downBox.x + downBox.width / 2, downBox.y + downBox.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, hostedTryMeDownLookupOpenFromDom, 6000, 'clicking hosted Try Me 下 did not open the 下 lookup');
    assertNoPageBrowserErrors(browserErrors, 'hosted Try Me demo');
    await page.screenshot({ path: path.join(ARTIFACTS, 'hosted-try-me.png'), fullPage: false });
    await page.close();
    record('hosted Try Me demo', 'pass', 'partial JPDB parses keep 下 clickable and JPDB-backed words keep color/underline styling');
}

function hostedTryMeDownWrappedFromDom() {
    return [...document.querySelectorAll('.yomu-try-me .jpdb-reader-word')]
        .some(word => compactText(word).includes('下'));

    function compactText(node) {
        return node.textContent?.replace(/\s+/g, '') ?? '';
    }
}

function hostedTryMeDownLookupOpenFromDom() {
    return compactText(document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling')).includes('下');

    function compactText(node) {
        return node?.textContent?.replace(/\s+/g, '').trim() ?? '';
    }
}

function assertHostedTryMeAuthenticatedSnapshot(snapshot) {
    assertAudit(snapshot.wordData.length >= 8, `hosted Try Me parsed too few words: ${JSON.stringify(snapshot)}`);
    assertAudit(hostedTryMeDownExpression(snapshot) === '下', `hosted Try Me 下 word has wrong expression: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.down.cursor === 'pointer', `hosted Try Me 下 word is not pointer-clickable: ${JSON.stringify(snapshot.down)}`);
    assertAudit(snapshot.down.display === 'inline', `hosted Try Me 下 should use inline reader word layout: ${JSON.stringify(snapshot.down)}`);
    assertAudit(snapshot.down.minWidth === '0px', `hosted Try Me 下 should not force a flex tap target: ${JSON.stringify(snapshot.down)}`);
    assertAudit(snapshot.down.whiteSpace === 'nowrap', `hosted Try Me 下 should not inherit scan-word wrapping: ${JSON.stringify(snapshot.down)}`);
    assertAudit(snapshot.down.wordBreak === 'keep-all', `hosted Try Me 下 should keep its glyph hitbox intact: ${JSON.stringify(snapshot.down)}`);
    assertAudit(hostedTryMeDownPaddingIsZero(snapshot.down), `hosted Try Me 下 should not offset the glyph hitbox with padding: ${JSON.stringify(snapshot.down)}`);
    assertAudit(hostedTryMePointHitsDown(snapshot), `hosted Try Me center point misses 下: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.rootClasses.includes('jpdb-reader-word-highlight-jpdb'), `word JPDB highlight source class missing: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.rootClasses.includes('jpdb-reader-word-text-jpdb'), `word JPDB text color source class missing: ${JSON.stringify(snapshot)}`);
    assertAudit(hostedTryMeHasPersonalizedTextColor(snapshot), `personalized Try Me text should use JPDB styling after login: ${JSON.stringify(snapshot)}`);
}

function hostedTryMeDownExpression(snapshot) {
    return snapshot.down?.expression ?? '';
}

function hostedTryMeDownPaddingIsZero(down) {
    return [
        down.paddingInlineStart === '0px',
        down.paddingInlineEnd === '0px',
    ].every(Boolean);
}

function hostedTryMePointHitsDown(snapshot) {
    return [
        snapshot.pointSurface === '下',
        snapshot.pointExpression === '下',
    ].every(Boolean);
}

function hostedTryMeHasPersonalizedTextColor(snapshot) {
    return snapshot.jpdbWord?.color !== snapshot.hostTextColor;
}

async function assertHostedTryMeFreshProfile(browser, server) {
    const { page } = await newAuditedPage(browser, {
        ...baseSettings,
        apiKey: '',
        ankiEnabled: false,
        wordHighlightColorSource: 'jpdb',
        wordUnderlineColorSource: 'jpdb',
        wordTextColorSource: 'jpdb',
        hoverOpenDelayMs: 35,
        hoverCloseDelayMs: 120,
    });
    try {
        await page.goto(`${server.origin}${QA_HOSTED_TRY_ME_PATH}`, { waitUntil: 'domcontentloaded' });
        await injectUserscript(page);
        await waitForAudit(page, () => [...document.querySelectorAll('.yomu-try-me .jpdb-reader-word')]
            .some(word => word.textContent?.replace(/\s+/g, '').includes('下')), 10000, 'fresh hosted Try Me did not wrap 下 as a lookup word');
        const snapshot = await hostedTryMeVisualSnapshot(page);
        assertAudit(snapshot.down?.expression === '下', `fresh hosted Try Me 下 word has wrong expression: ${JSON.stringify(snapshot)}`);
        assertAudit(snapshot.pointSurface === '下' && snapshot.pointExpression === '下', `fresh hosted Try Me center point misses 下: ${JSON.stringify(snapshot)}`);
        assertAudit(snapshot.rootClasses.includes('jpdb-reader-word-underline-pitch'), `fresh hosted Try Me should keep pitch styling without login: ${JSON.stringify(snapshot)}`);
        assertAudit(snapshot.rootClasses.includes('jpdb-reader-word-text-off'), `fresh hosted Try Me text color should stay off without login: ${JSON.stringify(snapshot)}`);
        assertAudit(snapshot.jpdbWord?.color === snapshot.hostTextColor, `fresh hosted Try Me text should inherit host copy color without login: ${JSON.stringify(snapshot)}`);
    } finally {
        await page.close();
    }
}

async function hostedTryMeVisualSnapshot(page) {
    return await page.evaluate(hostedTryMeVisualSnapshotFromDom);
}

function hostedTryMeVisualSnapshotFromDom() {
    const { dataAttribute, rectSnapshot, surface } = window.__yomuQaReaderWordDomHelpers;
    const wordData = [...document.querySelectorAll('.yomu-try-me .jpdb-reader-word')]
        .map(hostedTryMeWordSnapshot);
    const down = wordData.find(word => word.surface === '下');
    return {
        rootClasses: document.documentElement.className,
        wordData,
        down,
        jpdbWord: wordData.find(word => word.surface === '日本語'),
        hostTextColor: hostedTryMeTextColor(),
        ...hostedTryMePointSnapshot(down),
    };

    function hostedTryMeWordSnapshot(word) {
        return {
            surface: surface(word).trim(),
            expression: dataAttribute(word, 'data-expression'),
            className: word.className,
            ...styleSnapshot(word),
            rect: rectSnapshot(word),
        };
    }

    function hostedTryMePointSnapshot(word) {
        if (!word) return { point: null, pointSurface: '', pointExpression: '' };
        const point = centerPoint(word.rect);
        const targetWord = document.elementFromPoint(point.x, point.y)?.closest?.('.jpdb-reader-word');
        return {
            point,
            pointSurface: targetWord ? surface(targetWord).trim() : '',
            pointExpression: dataAttribute(targetWord, 'data-expression'),
        };
    }

    function hostedTryMeTextColor() {
        return getComputedStyle(document.querySelector('.yomu-try-me p') ?? document.body).color;
    }

    function centerPoint(rect) {
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }

    function styleSnapshot(word) {
        const style = getComputedStyle(word);
        return {
            cursor: style.cursor,
            color: style.color,
            textDecorationColor: style.textDecorationColor,
            textDecorationLine: style.textDecorationLine,
            display: style.display,
            minWidth: style.minWidth,
            whiteSpace: style.whiteSpace,
            wordBreak: style.wordBreak,
            paddingInlineStart: style.paddingInlineStart,
            paddingInlineEnd: style.paddingInlineEnd,
        };
    }
}

function collectPageBrowserErrors(page) {
    const errors = { consoleErrors: [], pageErrors: [] };
    page.on('console', message => {
        if (message.type() === 'error') errors.consoleErrors.push(browserConsoleMessageText(message));
    });
    page.on('pageerror', error => errors.pageErrors.push(error.message));
    return errors;
}

function browserConsoleMessageText(message) {
    const location = message.location?.();
    const url = location?.url ? ` @ ${location.url}` : '';
    return `${message.text()}${url}`;
}

function assertNewTabFirstRunFallbackSnapshot(snapshot) {
    assertAudit(!snapshot.hasLoadDictionary, `first-run new-tab still shows the removed "Add dictionary" setup button: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.hasSettings, `first-run new-tab is missing the settings control: ${JSON.stringify(snapshot)}`);
    assertAudit(!/Start with a dictionary/.test(snapshot.body), `first-run new-tab still shows the removed dictionary setup screen: ${JSON.stringify(snapshot)}`);
}

function assertNewTabDictionarySnapshot(snapshot) {
    assertAudit(/New Tab|Study|学習/.test(snapshot.title), 'new-tab document title is missing');
    assertAudit(isDocsHomeHref(snapshot.brandHref), 'new-tab brand link does not open the docs home page');
    assertAudit(/[一-龯ぁ-んァ-ン]/u.test(snapshot.expression), `new-tab did not render a Japanese dictionary word: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.meaning.trim().length > 0, `new-tab dictionary meaning did not render: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.hasSettingsControl, 'new-tab settings control is missing');
    // Do not treat the app's positive "Offline ready" status as the old
    // dictionary-disabled warning. Match the retired setup copy precisely.
    assertAudit(!/warning|No dictionary enabled|Add dictionary|dictionar(?:y|ies) (?:is |are )?off/i.test(snapshot.body), 'new-tab still shows setup or old warning copy after dictionaries are available');
}

function isDocsHomeHref(href) {
    return href === '/' || href === 'https://hrussellzfac023.github.io/yomu-reader/';
}

function assertNoPageBrowserErrors(errors, label) {
    const quiet = !errors.consoleErrors.length && !errors.pageErrors.length;
    assertAudit(quiet, `${label} produced browser errors: ${JSON.stringify(errors)}`);
}

async function assertNoVisibleReaderErrorToasts(page, label, detail = undefined) {
    const toasts = await page.evaluate(() => [...document.querySelectorAll('.jpdb-reader-toast')]
        .filter(toast => toast instanceof HTMLElement
            && !toast.hidden
            && getComputedStyle(toast).display !== 'none'
            && getComputedStyle(toast).visibility !== 'hidden')
        .map(toast => toast.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean));
    const errors = toasts.filter(toastLooksLikeReaderError);
    assertAudit(!errors.length, `${label} showed visible error toasts: ${JSON.stringify({ errors, detail })}`);
}

function toastLooksLikeReaderError(text) {
    return /error|failed|could not|unable|unexpected|syntaxerror|json|id3|no audio|returned no audio/i.test(text);
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
    await waitForAudit(page, kanjiDrilldownDetailsVisible, 9000, 'kanji drilldown did not show kanji details');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-kanjivg-svg path').length > 0, 9000, 'Stroke-order trace did not render');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-similar-word').length > 0, 9000, 'kanji used-in words did not render');
    await waitForAudit(
        page,
        localKanjiDictionarySectionRendered,
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
    const kanjiSnapshot = await page.evaluate(kanjiDrilldownSnapshotFromDom);
    assertAudit(kanjiSnapshot.kanjiPill.includes('https://jpdb.io/kanji/'), 'kanji JPDB pill is not the kanji open link');
    assertAudit(kanjiSnapshot.backVisible, 'kanji drilldown is missing a back control');
    assertAudit(kanjiSnapshot.jpdbKanjiSection && /now|いま|Top 100-200|Jouyou/i.test(kanjiSnapshot.jpdbKanjiText), 'kanji details section is missing');
    assertAudit(/Kanji facts|JLPT|Grade|Strokes/.test(kanjiSnapshot.originsText), 'kanji facts and origins panel is missing');
    assertAudit(!/RTK frame|Old forms|Kanken/i.test(kanjiSnapshot.originsText), 'kanji facts panel is showing low-value legacy fields');
    assertAudit(kanjiSnapshot.wordsUsingSections === 1, 'kanji drilldown should have exactly one Words using section');
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

function localKanjiDictionarySectionRendered() {
    return /KANJIDIC|now|day|sun|book|read/.test(document.querySelector('.jpdb-reader-kanji')?.textContent ?? '');
}

function kanjiDrilldownDetailsVisible() {
    if (hasJpdbKanjiDetailsText()) return true;
    return hasKanjiPillLink() && kanjiDisplayText().includes('今');

    function hasJpdbKanjiDetailsText() {
        return /Readings and components|読み|components/i.test(text('.jpdb-reader-jpdb-kanji'));
    }

    function hasKanjiPillLink() {
        return Boolean(document.querySelector('.jpdb-reader-jpdb-pill[href*="/kanji/"]'));
    }

    function kanjiDisplayText() {
        return text('.jpdb-reader-kanji-display, .jpdb-reader-kanji');
    }

    function text(selector) {
        return document.querySelector(selector)?.textContent ?? '';
    }
}

function kanjiDrilldownSnapshotFromDom() {
    return {
        kanjiPill: attribute('.jpdb-reader-jpdb-pill', 'href'),
        jpdbKanjiSection: exists('.jpdb-reader-jpdb-kanji'),
        jpdbKanjiText: text('.jpdb-reader-jpdb-kanji'),
        localKanjiText: text('.jpdb-reader-kanji'),
        originsText: text('.jpdb-reader-origins'),
        wordsUsingSections: count('[data-kanji-similar-words]'),
        originNodes: count('.jpdb-reader-origin-graph-node'),
        radicalCards: count('.jpdb-reader-radical-card'),
        sourceLinks: count('.jpdb-reader-origins a[href*="kanjimap"], .jpdb-reader-origins a[href*="raw.githubusercontent"]'),
        kanjiVGPaths: count('.jpdb-reader-kanjivg-svg path'),
        doodleCanvas: exists('.jpdb-reader-doodle-canvas'),
        componentButtons: count('.jpdb-reader-component-button[data-action="kanji"]'),
        backVisible: exists('[data-action="word-back"]'),
        similarWords: count('.jpdb-reader-similar-word'),
    };

    function attribute(selector, name) {
        return document.querySelector(selector)?.getAttribute(name) ?? '';
    }

    function text(selector) {
        return document.querySelector(selector)?.textContent ?? '';
    }

    function count(selector) {
        return document.querySelectorAll(selector).length;
    }

    function exists(selector) {
        return Boolean(document.querySelector(selector));
    }
}

async function auditHoverLookup(browser, server) {
    const hoverOpenDelayMs = 180;
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{font:24px/1.8 system-ui;margin:40px;color:#171a1f}
    </style></head><body><p>今日は静かな喫茶店で新しい本を読みました。明日は学校で勉強します。</p></body></html>`;
    const { page, requests } = await openSeededReaderFixture(browser, server, {
        path: '/hover-fixture.html',
        html,
        settings: {
            ...baseSettings,
            lookupOnClick: false,
            lookupOnHover: true,
            audioEnabled: true,
            autoPlayAudio: true,
            audioViaBlob: false,
            audioEnableDefaultSources: false,
            audioSources: [{ type: 'custom', url: 'https://audio.test/{term}.mp3', voice: '', enabled: true }],
            hoverOpenDelayMs,
            hoverCloseDelayMs: 140,
            localDictionariesEnabled: true,
            localDictionaryShowKanji: true,
            dictionaryPreferences: [
                { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 0 },
                { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1 },
                { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 2 },
            ],
            shortcuts: { ...baseSettings.shortcuts, hoverLookup: 'Shift' },
        },
    });
    const todayWord = await page.locator('.jpdb-reader-word', { hasText: '今日' }).first().boundingBox();
    const quietWord = await page.locator('.jpdb-reader-word', { hasText: '静' }).first().boundingBox();
    assertAudit(todayWord, 'no 今日 scanned word bounding box found');
    assertAudit(quietWord, 'no 静か scanned word bounding box found');
    await page.keyboard.down('Shift');
    await page.mouse.move(8, 8);
    await page.mouse.move(todayWord.x + todayWord.width / 2, todayWord.y + todayWord.height / 2);
    await page.waitForTimeout(110);
    await page.mouse.move(quietWord.x + quietWord.width / 2, quietWord.y + quietWord.height / 2, { steps: 4 });
    await page.waitForTimeout(110);
    assertAudit(await page.locator('.jpdb-reader-popover').count() === 1, 'moving pointer across parsed words did not open a hover popup without stopping');
    const movingHoverSpelling = await page.locator('.jpdb-reader-popover .jpdb-reader-spelling').first().innerText();
    assertAudit(movingHoverSpelling.includes('静'), `moving pointer hover opened the wrong word: ${movingHoverSpelling}`);
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close the moving-pointer hover popup');
    await page.mouse.move(8, 8);
    await page.waitForTimeout(260);
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
    const { page, requests } = await newRuntimeRegressionPage(browser);
    const browserErrors = collectPageBrowserErrors(page);
    await installRuntimeRegressionBrowserMocks(page);
    await routeRuntimeRegressionAudio(page, runtimeAudioRequests);
    await openRuntimeRegressionFixture(page, server);

    const readBox = await openRuntimeRegressionReadHover(page);
    const failures = [];
    await collectRuntimeRegressionFailure(failures, async () => {
        assertRegressionReadPopup(await runtimeRegressionPopoverSnapshot(page), 'hover');
    });
    await dismissRuntimeRegressionHoverPopup(page, failures);
    await auditRuntimeRegressionClickLookup(page, readBox, failures);
    await auditRuntimeRegressionImmersionParsing(page, failures);
    await auditRuntimeRegressionStudySpeech(page, failures);
    await auditRuntimeRegressionExampleAudioPlayback(page, runtimeAudioRequests, failures);
    await auditRuntimeRegressionExampleLookup(page, failures);
    await collectRuntimeRegressionFailure(failures, () => {
        assertNoPageBrowserErrors(browserErrors, 'runtime regression fixture');
    });
    await collectRuntimeRegressionFailure(failures, async () => {
        await assertNoVisibleReaderErrorToasts(page, 'runtime regression fixture', { runtimeAudioRequests, requests: requests.slice(-24) });
    });
    await page.screenshot({ path: path.join(ARTIFACTS, 'runtime-regression.png'), fullPage: false });
    await collectRuntimeRegressionFailure(failures, async () => {
        await assertRuntimeLinkCardLookupAndNavigation(page);
    });
    await page.close();
    if (failures.length) throw new Error(failures.join(' | '));
    record('runtime regression fixture', 'pass', '読んで lookup, stale hover dismissal, study/example audio, and Immersion Kit parsing stayed healthy');
}

function newRuntimeRegressionPage(browser) {
    return newAuditedPage(browser, {
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
        corsProxyUrl: QA_PUBLIC_PROXY_URL,
        studyTranslationEnabled: true,
        studyGrammarEnabled: true,
        immersionKitEnabled: true,
        immersionKitShowImages: true,
        immersionKitAutoPlayAudio: false,
        immersionKitPlayOnHover: false,
    });
}

async function installRuntimeRegressionBrowserMocks(page) {
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
}

async function routeRuntimeRegressionAudio(page, runtimeAudioRequests) {
    await page.route('https://jpdb.io/static/v/**', route => abortDirectRuntimeAudio(route, runtimeAudioRequests));
    await page.route(`${QA_PUBLIC_PROXY_URL}**`, route => fulfillRuntimeProxyRoute(route, runtimeAudioRequests));
}

function abortDirectRuntimeAudio(route, runtimeAudioRequests) {
    runtimeAudioRequests.push({ kind: 'direct', url: route.request().url() });
    return route.abort('failed');
}

async function fulfillRuntimeProxyRoute(route, runtimeAudioRequests) {
    const request = route.request();
    const target = runtimeProxyTarget(request.url());
    runtimeAudioRequests.push({ kind: 'proxy', url: request.url(), target });
    if (await fulfillRuntimeJpdbAudio(route, target)) return;
    if (await fulfillRuntimeMockedRoute(route, mockRuntimeProxyTarget(request, target))) return;
    await route.abort('failed');
}

function runtimeProxyTarget(requestUrl) {
    return new URL(requestUrl).searchParams.get('url') ?? '';
}

async function fulfillRuntimeJpdbAudio(route, target) {
    if (!/^https:\/\/jpdb\.io\/static\/v\//i.test(target)) return false;
    await route.fulfill({
        status: 200,
        contentType: 'audio/ogg',
        body: encodedJpdbOggBytes(),
    });
    return true;
}

function mockRuntimeProxyTarget(request, target) {
    if (!target) return null;
    return maybeMockQaRequest({
        method: request.method(),
        url: target,
        headers: request.headers(),
        data: request.postData() ?? undefined,
    });
}

async function fulfillRuntimeMockedRoute(route, mocked) {
    if (!mocked) return false;
    await route.fulfill({
        status: mocked.status,
        contentType: mocked.contentType,
        body: Buffer.from(mocked.bytes),
    });
    return true;
}

async function openRuntimeRegressionFixture(page, server) {
    await page.goto(`${server.origin}${QA_RUNTIME_REGRESSION_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.evaluate(installRuntimePointerRecorderInPage);
    await waitForRuntimeRegressionFixtureWords(page);
}

function installRuntimePointerRecorderInPage() {
    const { dataAttribute, surface } = window.__yomuQaReaderWordDomHelpers;
    window.__yomuQaPointerEvents = [];
    const record = event => {
        window.__yomuQaPointerEvents.push(pointerEventSnapshot(event));
    };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, record, { capture: true });
    }

    function pointerEventSnapshot(event) {
        const target = eventTarget(event);
        return {
            type: event.type,
            x: event.clientX,
            y: event.clientY,
            ...pointerTargetSnapshot(target),
            ...pointerWordSnapshot(target?.closest('.jpdb-reader-word')),
        };
    }

    function eventTarget(event) {
        return event.target instanceof Element ? event.target : null;
    }

    function pointerTargetSnapshot(target) {
        if (!target) return { targetTag: '', targetText: '' };
        return {
            targetTag: target.tagName,
            targetText: target.textContent?.trim() ?? '',
        };
    }

    function pointerWordSnapshot(word) {
        if (!word) return { wordSurface: '', wordVid: '', wordSid: '' };
        return {
            wordSurface: surface(word).trim(),
            wordVid: dataAttribute(word, 'data-vid'),
            wordSid: dataAttribute(word, 'data-sid'),
        };
    }
}

async function waitForRuntimeRegressionFixtureWords(page) {
    await waitForAudit(page, runtimeFixtureHasReadWord, 10000, 'runtime regression fixture did not parse 読んで as its own word').catch(async error => {
        const detail = await page.evaluate(runtimeRegressionParseDebugSnapshot);
        throw new Error(`runtime regression fixture did not parse 読んで as its own word: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, runtimeFixtureHasPoliteFormToken, 8000, 'runtime regression fixture split ございます instead of using JPDB parse tokens');
}

function runtimeFixtureHasReadWord() {
    const { surface } = window.__yomuQaReaderWordDomHelpers;
    return [...document.querySelectorAll('.jpdb-reader-word')]
        .some(word => surface(word).trim() === '読んで');
}

function runtimeFixtureHasPoliteFormToken() {
    const { surface } = window.__yomuQaReaderWordDomHelpers;
    const words = [...document.querySelectorAll('#polite-form-target .jpdb-reader-word')]
        .map(word => surface(word).trim());
    return words.includes('ございます') && !words.some(word => ['ご', 'ざ', 'い', 'ます'].includes(word));
}

function runtimeRegressionParseDebugSnapshot() {
    const { dataAttribute, surface } = window.__yomuQaReaderWordDomHelpers;
    return {
        body: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
        words: [...document.querySelectorAll('.jpdb-reader-word')].map(runtimeRegressionWordDebugSnapshot),
        parseKeys: [...document.querySelectorAll('[data-jpdb-reader-parse-key], [data-jpdb-reader-parse-loading-key]')].map(node => ({
            tag: node.tagName,
            parseKey: node.getAttribute('data-jpdb-reader-parse-key') ?? '',
            loadingKey: node.getAttribute('data-jpdb-reader-parse-loading-key') ?? '',
        })),
    };

    function runtimeRegressionWordDebugSnapshot(word) {
        return {
            text: surface(word).trim(),
            fullText: text(word),
            expression: dataAttribute(word, 'data-expression'),
            reading: dataAttribute(word, 'data-reading'),
            sentence: dataAttribute(word, 'data-sentence'),
            className: word.className,
        };
    }

    function text(node) {
        return node.textContent?.trim() ?? '';
    }
}

async function openRuntimeRegressionReadHover(page) {
    const readBox = await runtimeRegressionReadWordBox(page);
    assertAudit(readBox, 'no 読んで scanned word bounding box found');
    await page.mouse.move(readBox.x + readBox.width / 2, readBox.y + readBox.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'hover popup for 読んで kept loading');
    return readBox;
}

async function runtimeRegressionReadWordBox(page) {
    return page.evaluate(() => {
        const { surface } = window.__yomuQaReaderWordDomHelpers;
        const word = [...document.querySelectorAll('.jpdb-reader-word')]
            .find(candidate => surface(candidate).trim() === '読んで');
        if (!word) return null;
        const rect = word.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
}

async function dismissRuntimeRegressionHoverPopup(page, failures) {
    await page.mouse.move(6, 6);
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'hover popup for 読んで stayed open after the pointer left the token').catch(async error => {
        failures.push(error instanceof Error ? error.message : String(error));
        await page.keyboard.press('Escape').catch(() => undefined);
        await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 1000, 'stale popup did not close after Escape').catch(() => undefined);
    });
}

async function auditRuntimeRegressionClickLookup(page, readBox, failures) {
    const readClickPoint = { x: readBox.x + readBox.width / 2, y: readBox.y + readBox.height * 0.76 };
    const readClickTarget = await runtimeRegressionPointerTargetSnapshot(page, readClickPoint);
    await page.mouse.click(readClickPoint.x, readClickPoint.y);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'click popup for 読んで kept loading');
    await collectRuntimeRegressionFailure(failures, async () => {
        assertRegressionReadPopup(await runtimeRegressionPopoverSnapshot(page), 'click');
    }, error => runtimeClickFailureMessage(page, readClickTarget, error));
}

async function auditRuntimeRegressionImmersionParsing(page, failures) {
    await collectRuntimeRegressionFailure(failures, async () => {
        await openImmersionKitDetails(page);
        await waitForAudit(page, () => document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card .jpdb-reader-word').length >= 2, 8000, 'Immersion Kit examples did not recursively parse after 読んで lookup');
        assertRuntimeImmersionSnapshot(await runtimeRegressionImmersionSnapshot(page));
    });
}

async function auditRuntimeRegressionStudySpeech(page, failures) {
    await collectRuntimeRegressionFailure(failures, async () => {
        const studyReadButton = page.locator('[data-action="study-read-sentence"]').first();
        assertAudit(await studyReadButton.count() === 1, 'study read-sentence button is missing from the popup');
        await studyReadButton.click({ force: true });
        await waitForAudit(page, () => (window.__yomuSpeechTexts ?? []).some(text => [
            '好きなものを読んで日本語を学ぶ',
            '毎日読んでいるので、もっと読みたい',
        ].some(expected => text.includes(expected))), 3000, 'study sentence audio did not use browser speech fallback');
    }, error => runtimeStudySpeechFailureMessage(page, error));
}

async function auditRuntimeRegressionExampleAudioPlayback(page, runtimeAudioRequests, failures) {
    await collectRuntimeRegressionFailure(failures, async () => {
        await page.evaluate(() => {
            delete window.GM_xmlhttpRequest;
            if (window.GM) {
                delete window.GM.xmlHttpRequest;
                delete window.GM.xmlhttpRequest;
            }
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        });
        const exampleAudioButton = page.locator('[data-action="jpdb-example-audio"]').first();
        assertAudit(await exampleAudioButton.count() === 1, 'JPDB example sentence audio button is missing from the popup');
        await exampleAudioButton.click({ force: true });
        await waitForAudit(page, () => (window.__yomuAudioPlayEvents ?? []).some(event => /^blob:/.test(event.src)), 6000, 'JPDB example sentence audio did not play from a blob URL');
        assertAudit(!runtimeAudioRequests.some(request => request.kind === 'direct'), `JPDB example sentence audio touched direct static media before proxy/blob fallback: ${JSON.stringify(runtimeAudioRequests)}`);
    }, error => runtimeExampleAudioFailureMessage(page, runtimeAudioRequests, error));
}

async function auditRuntimeRegressionExampleLookup(page, failures) {
    await collectRuntimeRegressionFailure(failures, async () => {
        await page.evaluate(() => {
            document.querySelectorAll('[data-yomu-qa-example-word]').forEach(node => node.removeAttribute('data-yomu-qa-example-word'));
            const target = [...document.querySelectorAll('.jpdb-reader-jpdb-example .jpdb-reader-word')]
                .find(word => word.getAttribute('data-expression') === '好き');
            target?.setAttribute('data-yomu-qa-example-word', 'true');
        });
        const exampleWord = page.locator('[data-yomu-qa-example-word="true"]').first();
        assertAudit(await exampleWord.count() === 1, 'JPDB dictionary example words are not parsed into lookup spans');
        await exampleWord.click({ force: true });
        await waitForAudit(page, () => {
            const lookupSurface = value => (value ?? '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();
            const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling')?.textContent?.replace(/\s+/g, '').trim() ?? '';
            return lookupSurface(spelling).includes('好き');
        }, 6000, 'clicking a parsed dictionary example word did not open its lookup card');
        await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'dictionary example lookup card kept loading');
        const exampleLookup = await runtimeRegressionPopoverSnapshot(page);
        assertAudit(/好き/.test(lookupSurfaceText(exampleLookup.spelling)), `dictionary example click opened the wrong card: ${JSON.stringify(exampleLookup)}`);
    }, error => runtimeExampleLookupFailureMessage(page, error));
}

async function runtimeExampleAudioFailureMessage(page, runtimeAudioRequests, error) {
    const detail = await page.evaluate(runtimeExampleAudioDebugSnapshotFromDom);
    return `${runtimeRegressionErrorMessage(error)}: ${JSON.stringify({ detail, runtimeAudioRequests })}`;
}

async function runtimeExampleLookupFailureMessage(page, error) {
    const detail = await page.evaluate(runtimeExampleLookupDebugSnapshotFromDom);
    return `${runtimeRegressionErrorMessage(error)}: ${JSON.stringify(detail)}`;
}

function runtimeExampleAudioDebugSnapshotFromDom() {
    const button = document.querySelector('[data-action="jpdb-example-audio"]');
    return {
        audioEvents: window.__yomuAudioPlayEvents ?? [],
        speechTexts: window.__yomuSpeechTexts ?? [],
        bridge: document.documentElement.dataset.yomuUserscriptHttpBridge ?? '',
        button: exampleAudioButtonSnapshot(button),
        toasts: [...document.querySelectorAll('.jpdb-reader-toast')].map(node => node.textContent?.trim() ?? ''),
    };
}

function exampleAudioButtonSnapshot(button) {
    return {
        count: document.querySelectorAll('[data-action="jpdb-example-audio"]').length,
        audio: button?.getAttribute('data-jpdb-audio') ?? '',
        sentence: button?.getAttribute('data-jpdb-example-sentence') ?? '',
    };
}

function runtimeExampleLookupDebugSnapshotFromDom() {
    return {
        currentSpelling: compactText(document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling')),
        exampleWords: [...document.querySelectorAll('.jpdb-reader-jpdb-example .jpdb-reader-word')].map(exampleWordDebugSnapshot),
        popoverText: spacedText(document.querySelector('.jpdb-reader-popover')).slice(0, 700),
    };

    // Playwright serializes this function into the page realm without its
    // module scope, so every DOM snapshot helper must travel with it.
    function exampleWordDebugSnapshot(word) {
        const helpers = window.__yomuQaReaderWordDomHelpers;
        return {
            surface: helpers?.surface?.(word)?.trim() ?? compactText(word),
            text: compactText(word),
            expression: word.getAttribute('data-expression') ?? '',
            reading: word.getAttribute('data-reading') ?? '',
            tagged: word.getAttribute('data-yomu-qa-example-word') === 'true',
        };
    }

    function compactText(node) {
        return node?.textContent?.replace(/\s+/g, '').trim() ?? '';
    }

    function spacedText(node) {
        return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }
}

async function collectRuntimeRegressionFailure(failures, task, formatError = runtimeRegressionErrorMessage) {
    try {
        await task();
    } catch (error) {
        failures.push(await formatError(error));
    }
}

function runtimeRegressionErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

async function runtimeClickFailureMessage(page, readClickTarget, error) {
    const clickEvents = await page.evaluate(() => window.__yomuQaPointerEvents ?? []);
    return `${runtimeRegressionErrorMessage(error)}; clickTarget=${JSON.stringify(readClickTarget)}; clickEvents=${JSON.stringify(clickEvents.slice(-8))}`;
}

async function runtimeStudySpeechFailureMessage(page, error) {
    const detail = await page.evaluate(runtimeStudySpeechDebugSnapshot);
    return `${runtimeRegressionErrorMessage(error)}: ${JSON.stringify(detail)}`;
}

function runtimeStudySpeechDebugSnapshot() {
    return {
        speechTexts: window.__yomuSpeechTexts ?? [],
        originals: [...document.querySelectorAll('[data-study-original-render]')].map(normalizedText),
        buttonCount: document.querySelectorAll('[data-action="study-read-sentence"]').length,
        pageWords: [...document.querySelectorAll('#inflected-pointer-target .jpdb-reader-word')].map(studySpeechWordSnapshot),
        popoverText: clippedText(document.querySelector('.jpdb-reader-popover'), 600),
    };

    function studySpeechWordSnapshot(word) {
        return {
            text: text(word),
            expression: dataAttribute(word, 'data-expression'),
            reading: dataAttribute(word, 'data-reading'),
            sentence: dataAttribute(word, 'data-sentence'),
            vid: dataAttribute(word, 'data-vid'),
            sid: dataAttribute(word, 'data-sid'),
        };
    }

    function clippedText(node, length) {
        return normalizedText(node).slice(0, length);
    }

    function normalizedText(node) {
        return text(node).replace(/\s+/g, ' ').trim();
    }

    function text(node) {
        return node?.textContent?.trim() ?? '';
    }

    function dataAttribute(node, name) {
        return node.getAttribute(name) ?? '';
    }
}

async function runtimeRegressionPopoverSnapshot(page) {
    return page.evaluate(runtimeRegressionPopoverSnapshotFromDom);
}

function runtimeRegressionPopoverSnapshotFromDom() {
    const popover = document.querySelector('.jpdb-reader-popover');
    return {
        text: normalizedText(popover),
        spelling: compactText(popover?.querySelector('.jpdb-reader-spelling')),
        reading: compactText(popover?.querySelector('.jpdb-reader-meta-reading')),
        pitchCount: popover?.querySelectorAll('.jpdb-reader-pitch svg, .jpdb-reader-pitch path').length ?? 0,
        pitchClassCount: popover?.querySelectorAll('[class*="jpdb-pitch-"]:not(.jpdb-pitch-unknown)').length ?? 0,
    };

    function normalizedText(node) {
        return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function compactText(node) {
        return node?.textContent?.replace(/\s+/g, '').trim() ?? '';
    }
}

function assertRegressionReadPopup(snapshot, trigger) {
    const spelling = lookupSurfaceText(snapshot.spelling);
    const readingEvidence = `${snapshot.reading || ''} ${snapshot.text || ''} ${snapshot.spelling || ''}`.replace(/[()\s（）]/g, '');
    assertAudit(!spelling.includes('きなものを'), `${trigger} lookup selected left-context text instead of 読んで: ${JSON.stringify(snapshot)}`);
    assertAudit(/読む|読んで/.test(spelling), `${trigger} lookup did not open the 読む card: ${JSON.stringify(snapshot)}`);
    assertAudit(/よむ|よんで/.test(readingEvidence), `${trigger} lookup lost JPDB reading: ${JSON.stringify(snapshot)}`);
    assertAudit(hasVisiblePitchEvidence(snapshot), `${trigger} lookup lost JPDB pitch display: ${JSON.stringify(snapshot)}`);
}

function lookupSurfaceText(value) {
    return (value ?? '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();
}

function hasVisiblePitchEvidence(snapshot) {
    return (snapshot.pitchCount ?? 0) > 0 || (snapshot.pitchClassCount ?? 0) > 0;
}

async function runtimeRegressionImmersionSnapshot(page) {
    return page.evaluate(runtimeRegressionImmersionSnapshotFromDom);
}

function runtimeRegressionImmersionSnapshotFromDom() {
    const target = runtimeRegressionImmersionTarget();
    return {
        cardCount: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card').length,
        wordCount: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card .jpdb-reader-word').length,
        ...runtimeRegressionImmersionTargetSnapshot(target),
    };

    function runtimeRegressionImmersionTarget() {
        return document.querySelector('[data-immersion-kit] .jpdb-reader-example-card.has-image .jpdb-reader-example-target')
            ?? document.querySelector('[data-immersion-kit] .jpdb-reader-example-target');
    }

    function runtimeRegressionImmersionTargetSnapshot(node) {
        const style = node instanceof HTMLElement ? getComputedStyle(node) : null;
        return {
            targetText: text(node),
            targetBackground: styleValue(style, 'backgroundColor'),
            targetBackgroundImage: styleValue(style, 'backgroundImage'),
            targetDecoration: styleValue(style, 'textDecorationColor'),
        };
    }

    function text(node) {
        return node?.textContent?.trim() ?? '';
    }

    function styleValue(style, property) {
        return style?.[property] ?? '';
    }
}

async function runtimeRegressionPointerTargetSnapshot(page, point) {
    return page.evaluate(runtimeRegressionPointerTargetSnapshotFromDom, point);
}

function runtimeRegressionPointerTargetSnapshotFromDom({ x, y }) {
    const { dataAttribute, rectSnapshot, surface } = window.__yomuQaReaderWordDomHelpers;
    const target = document.elementFromPoint(x, y);
    const word = target?.closest?.('.jpdb-reader-word');
    return {
        x,
        y,
        ...targetElementSnapshot(target),
        ...focusedWordSnapshot(word),
        allWords: [...document.querySelectorAll('.jpdb-reader-word')].map(readerWordSnapshot),
        pointerEvents: window.__yomuQaPointerEvents ?? [],
    };

    function targetElementSnapshot(node) {
        if (!node) return { targetTag: '', targetText: '' };
        return {
            targetTag: node.tagName,
            targetText: text(node),
        };
    }

    function focusedWordSnapshot(node) {
        if (!node) return emptyFocusedWordSnapshot();
        return {
            wordSurface: surface(node).trim(),
            wordText: text(node),
            ...focusedWordDataSnapshot(node),
            wordRect: rectSnapshot(node),
        };
    }

    function readerWordSnapshot(node) {
        return {
            surface: surface(node).trim(),
            text: text(node),
            ...readerWordDataSnapshot(node),
            rect: rectSnapshot(node),
        };
    }

    function emptyFocusedWordSnapshot() {
        return {
            wordSurface: '',
            wordText: '',
            wordExpression: '',
            wordReading: '',
            wordVid: '',
            wordSid: '',
            wordRect: null,
        };
    }

    function focusedWordDataSnapshot(node) {
        return {
            wordExpression: dataAttribute(node, 'data-expression'),
            wordReading: dataAttribute(node, 'data-reading'),
            wordVid: dataAttribute(node, 'data-vid'),
            wordSid: dataAttribute(node, 'data-sid'),
        };
    }

    function readerWordDataSnapshot(node) {
        return {
            expression: dataAttribute(node, 'data-expression'),
            reading: dataAttribute(node, 'data-reading'),
            vid: dataAttribute(node, 'data-vid'),
            sid: dataAttribute(node, 'data-sid'),
        };
    }

    function text(node) {
        return node.textContent?.trim() ?? '';
    }
}

async function assertRuntimeLinkCardLookupAndNavigation(page) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 1500, 'previous popup stayed open before link-card lookup')
        .catch(() => undefined);
    await waitForAudit(page, runtimeLinkCardWordReadyFromDom, 8000, 'link card text did not parse into lookup words');

    const linkWord = page.locator('#runtime-link-card .jpdb-reader-word').filter({ hasText: 'よむ' }).first();
    const linkBox = await linkWord.boundingBox();
    assertAudit(linkBox, 'parsed link-card word has no bounding box');
    await page.mouse.move(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'link-card hover popup kept loading');
    const lookup = await runtimeRegressionPopoverSnapshot(page);
    assertAudit(/読む|よむ/.test(lookupSurfaceText(lookup.spelling)), `link-card hover opened the wrong lookup: ${JSON.stringify(lookup)}`);
    await page.keyboard.press('Escape');
    await waitForAudit(page, () => !document.querySelector('.jpdb-reader-popover'), 3000, 'Escape did not close link-card hover popup');

    await page.locator('#runtime-link-card').click({ force: true });
    await page.waitForURL(url => url.pathname.endsWith('/__qa__/getting-started'), { timeout: 3000 });
}

function runtimeLinkCardWordReadyFromDom() {
    const { surface } = window.__yomuQaReaderWordDomHelpers;
    return [...document.querySelectorAll('#runtime-link-card .jpdb-reader-word')]
        .some(word => surface(word).trim() === 'よむ');
}

function assertRuntimeImmersionSnapshot(snapshot) {
    assertAudit(snapshot.cardCount > 0, `Immersion Kit did not render cards: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.wordCount >= 2, `Immersion Kit examples are not parsed into lookup words: ${JSON.stringify(snapshot)}`);
    assertAudit(!isTransparentCssColor(snapshot.targetBackground) || snapshot.targetBackgroundImage !== 'none', `Immersion Kit target highlight is transparent: ${JSON.stringify(snapshot)}`);
}

async function openImmersionKitDetails(page) {
    await waitForAudit(page, () => Boolean(document.querySelector('[data-immersion-kit][data-immersion-lazy-bound="true"]')), 6000, 'Immersion Kit section did not render');
    const needsOpen = await page.locator('[data-immersion-kit]').evaluate(node => node instanceof HTMLDetailsElement && !node.open);
    if (needsOpen) await page.locator('[data-immersion-kit] > summary').click();
}

async function ensureImmersionExampleCardHoverable(page) {
    await page.evaluate(() => {
        const section = document.querySelector('[data-immersion-kit]');
        if (section instanceof HTMLDetailsElement) section.open = true;
        const card = document.querySelector('.jpdb-reader-example-card');
        card?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await waitForAudit(page, visibleImmersionExampleHoverSnapshotFromDom, 3000, 'Immersion Kit example card is not hoverable').catch(async error => {
        const snapshot = await page.evaluate(immersionExampleHoverSnapshotFromDom);
        throw new Error(`Immersion Kit example card is not hoverable: ${JSON.stringify(snapshot)}: ${error instanceof Error ? error.message : String(error)}`);
    });
}

function visibleImmersionExampleHoverSnapshotFromDom() {
    const card = document.querySelector('.jpdb-reader-example-card');
    if (!(card instanceof HTMLElement)) return false;
    const style = getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    return [
        style.display !== 'none',
        style.visibility !== 'hidden',
        Number(style.opacity || '1') > 0.02,
        rect.width > 0,
        rect.height > 0,
    ].every(Boolean);
}

function immersionExampleHoverSnapshotFromDom() {
    const card = document.querySelector('.jpdb-reader-example-card');
    if (!(card instanceof HTMLElement)) return { visible: false, missing: true };
    const style = getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    const visible = [
        style.display !== 'none',
        style.visibility !== 'hidden',
        Number(style.opacity || '1') > 0.02,
        rect.width > 0,
        rect.height > 0,
    ].every(Boolean);
    return {
        visible,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        rect: { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom },
        parentHidden: Boolean(card.closest('[hidden]')),
    };
}

function immersionAnkiDebugSnapshotFromDom() {
    return {
        buttons: [...document.querySelectorAll('.jpdb-reader-popover [data-action="anki"], .jpdb-reader-popover [data-action^="anki"]')].map(actionButtonSnapshot),
        popoverText: spacedText(document.querySelector('.jpdb-reader-popover')).slice(0, 700),
    };
}

function actionButtonSnapshot(button) {
    return {
        text: spacedText(button),
        action: button.getAttribute('data-action') ?? '',
        disabled: button.hasAttribute('disabled'),
        classes: button.getAttribute('class') ?? '',
        visible: button instanceof HTMLElement && visibleElementStyle(button),
    };
}

function visibleElementStyle(element) {
    const style = getComputedStyle(element);
    return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
}

function compactText(node) {
    return node?.textContent?.replace(/\s+/g, '').trim() ?? '';
}

function spacedText(node) {
    return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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
        const exact = words.find(word => /読(\([^)]+\))?み?ました/.test(word.text));
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

async function auditJitenReviewTransitionPerformance(browser) {
    const { page, requests } = await newAuditedPage(browser, {
        ...baseSettings,
        jpdbPageEnhancementsEnabled: true,
        jpdbPageWordEnhancementsEnabled: true,
        jpdbPageKanjiEnhancementsEnabled: true,
        jpdbDefinitionsEnabled: false,
        jitenDefinitionsEnabled: false,
        bunproDefinitionsEnabled: false,
        localDictionariesEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        immersionKitEnabled: true,
        immersionKitLimit: 3,
        immersionKitLimitEnabled: false,
        immersionKitShowTranslation: true,
        immersionKitRevealTranslationOnClick: true,
        immersionKitAutoPlayAudio: false,
        showFloatingButton: false,
    }, { width: 1440, height: 900 }, { hasTouch: true });
    await installMockAudioPlayback(page);
    await page.route('https://jiten.moe/srs/study', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: jitenReviewPerformanceFixtureHtml(),
    }));
    await page.goto('https://jiten.moe/srs/study', { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);

    assertAudit(await page.locator('[data-yomu-jpdb-addon]').count() === 0, 'Jiten front mounted answer-side enhancements before reveal');
    await waitForNodeAudit(() => immersionSearchRequestCount(requests) > 0, 3000, 'Jiten hidden-front Immersion prefetch did not start');
    await waitForNodeAudit(() => immersionImageRequestUrls(requests).length > 0, 3000, 'Jiten hidden-front first-image prefetch did not start');
    assertAudit(immersionImageRequestUrls(requests).length === 1, `Jiten hidden-front prefetch fetched more than the current image: ${JSON.stringify(immersionImageRequestUrls(requests))}`);
    const firstPrefetchSearches = immersionSearchRequestCount(requests);

    const first = await measureJitenFixtureReveal(page);
    await page.waitForSelector('[data-yomu-jpdb-addon] [data-immersion-kit] .jpdb-reader-example-card', { state: 'attached', timeout: 4000 });
    await page.locator('[data-yomu-jpdb-addon] [data-immersion-kit]').evaluate(details => { details.open = true; });
    await waitForJitenReviewMediaPaint(page);
    const firstMediaMs = await page.evaluate(start => performance.now() - start, first.startedAt);
    assertFastJitenReviewPaint('first reveal', first.shellMs, firstMediaMs);
    await assertVisibleJitenReviewExampleActions(page, 'desktop');
    const firstNextMediaMs = await measureJitenImmersionNextMedia(page);
    assertFastJitenCarouselPaint('first reveal', firstNextMediaMs);
    assertUniqueJitenImmersionImageRequests(requests, 'first carousel Next');
    assertAudit(immersionSearchRequestCount(requests) === firstPrefetchSearches, 'Jiten reveal duplicated its current-card Immersion prefetch');
    await assertJitenReviewSourceSettings(page, requests);

    const desktopLayout = await jitenReviewLayoutSnapshot(page, { width: 1440, height: 900 });
    assertJitenReviewLayout(desktopLayout, { maxImmersionWidth: 544, minControlSize: 0 });
    await page.screenshot({ path: path.join(ARTIFACTS, 'jiten-review-immersion-desktop.png'), fullPage: true });

    const searchesAfterFirst = immersionSearchRequestCount(requests);
    const hidden = await measureJitenFixtureNextFront(page, '読書');
    assertAudit(hidden < 100, `Jiten stale answer addon remained for ${Math.round(hidden)}ms after Next`);
    assertAudit(await page.locator('[data-yomu-jpdb-addon]').count() === 0, 'Jiten next-card front retained the previous answer addon');
    await waitForNodeAudit(
        () => immersionSearchRequestCount(requests) > searchesAfterFirst,
        3000,
        'Jiten next-card hidden-front Immersion prefetch did not start',
    ).catch(async error => {
        const debug = await page.evaluate(() => ({
            title: document.title,
            headword: document.querySelector('[data-case="headword"]')?.textContent ?? '',
            extractedHeadwordCandidates: [...document.querySelectorAll('.text-3xl[lang="ja"],.text-4xl[lang="ja"],.text-5xl[lang="ja"],.text-6xl[lang="ja"]')].map(node => node.textContent ?? ''),
            hasShowAnswer: Boolean(document.querySelector('[data-case="show-answer"]')),
            addonCount: document.querySelectorAll('[data-yomu-jpdb-addon]').length,
        }));
        throw new Error(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify({ debug, requests: requests.filter(request => /immersionkit\.com\/search/.test(request.url)) })}`);
    });
    const secondPrefetchSearches = immersionSearchRequestCount(requests);

    const second = await measureJitenFixtureReveal(page);
    await page.waitForSelector('[data-yomu-jpdb-addon] [data-immersion-kit] .jpdb-reader-example-card', { state: 'attached', timeout: 4000 });
    await page.locator('[data-yomu-jpdb-addon] [data-immersion-kit]').evaluate(details => { details.open = true; });
    await waitForJitenReviewMediaPaint(page);
    const secondMediaMs = await page.evaluate(start => performance.now() - start, second.startedAt);
    assertFastJitenReviewPaint('second reveal', second.shellMs, secondMediaMs);
    const secondNextMediaMs = await measureJitenImmersionNextMedia(page);
    assertFastJitenCarouselPaint('second reveal', secondNextMediaMs);
    assertUniqueJitenImmersionImageRequests(requests, 'second carousel Next');
    assertAudit(immersionSearchRequestCount(requests) === secondPrefetchSearches, 'Jiten second reveal duplicated its current-card Immersion prefetch');

    const tabletLayout = await jitenReviewLayoutSnapshot(page, { width: 768, height: 1024 });
    assertJitenReviewLayout(tabletLayout, { maxImmersionWidth: 480, minControlSize: 0 });
    const mobileLayout = await jitenReviewLayoutSnapshot(page, { width: 390, height: 844 });
    assertJitenReviewLayout(mobileLayout, { maxImmersionWidth: 390, minControlSize: 44 });
    await assertVisibleJitenReviewExampleActions(page, 'mobile');
    await assertOneTapImmersionTranslationReveal(page);
    await page.screenshot({ path: path.join(ARTIFACTS, 'jiten-review-immersion-mobile.png'), fullPage: true });

    const regularWidth = await page.evaluate(() => {
        const root = document.querySelector('[data-yomu-jpdb-addon]');
        if (!(root instanceof HTMLElement)) return 0;
        root.dataset.yomuPageContext = 'entry';
        const width = document.querySelector('[data-immersion-kit]')?.getBoundingClientRect().width ?? 0;
        root.dataset.yomuPageContext = 'review';
        return width;
    });
    assertAudit(regularWidth >= mobileLayout.immersion.width - 1, 'regular entry-page Immersion geometry was narrowed by review-only rules');

    await assertAccessibleSurface(page, 'Jiten review Immersion Kit', '[data-yomu-jpdb-addon]');
    await page.close();
    record(
        'Jiten review transition performance',
        'pass',
        `shell ${Math.round(first.shellMs)}/${Math.round(second.shellMs)}ms, media ${Math.round(firstMediaMs)}/${Math.round(secondMediaMs)}ms, carousel ${Math.round(firstNextMediaMs)}/${Math.round(secondNextMediaMs)}ms, stale removal ${Math.round(hidden)}ms`,
    );
}

async function auditJitenReviewMobileWebKit(browser) {
    const { page, requests } = await newAuditedPage(browser, {
        ...baseSettings,
        jpdbPageEnhancementsEnabled: true,
        jpdbPageWordEnhancementsEnabled: true,
        jpdbPageKanjiEnhancementsEnabled: true,
        jpdbDefinitionsEnabled: false,
        jitenDefinitionsEnabled: false,
        bunproDefinitionsEnabled: false,
        localDictionariesEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        immersionKitEnabled: true,
        immersionKitLimit: 3,
        immersionKitLimitEnabled: false,
        immersionKitShowTranslation: true,
        immersionKitRevealTranslationOnClick: true,
        immersionKitAutoPlayAudio: false,
        showFloatingButton: false,
    }, { width: 390, height: 844 }, { hasTouch: true });
    await installMockAudioPlayback(page);
    await page.route('https://jiten.moe/srs/study', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: jitenReviewPerformanceFixtureHtml(),
    }));
    await page.goto('https://jiten.moe/srs/study', { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);

    await waitForNodeAudit(() => immersionSearchRequestCount(requests) > 0, 3000, 'WebKit hidden-front Immersion prefetch did not start');
    await waitForNodeAudit(() => immersionImageRequestUrls(requests).length > 0, 3000, 'WebKit hidden-front first-image prefetch did not start');
    assertAudit(immersionImageRequestUrls(requests).length === 1, `WebKit hidden-front prefetch fetched more than the current image: ${JSON.stringify(immersionImageRequestUrls(requests))}`);
    const prefetchedSearches = immersionSearchRequestCount(requests);
    const reveal = await measureJitenFixtureReveal(page);
    await page.waitForSelector('[data-yomu-jpdb-addon] [data-immersion-kit] .jpdb-reader-example-card', { state: 'attached', timeout: 4000 });
    await page.locator('[data-yomu-jpdb-addon] [data-immersion-kit]').evaluate(details => { details.open = true; });
    await waitForJitenReviewMediaPaint(page);
    const mediaMs = await page.evaluate(start => performance.now() - start, reveal.startedAt);
    assertFastJitenReviewPaint('WebKit mobile reveal', reveal.shellMs, mediaMs);
    const nextMediaMs = await measureJitenImmersionNextMedia(page);
    assertFastJitenCarouselPaint('WebKit mobile reveal', nextMediaMs);
    assertUniqueJitenImmersionImageRequests(requests, 'WebKit carousel Next');
    assertAudit(immersionSearchRequestCount(requests) === prefetchedSearches, 'WebKit reveal duplicated its current-card Immersion prefetch');

    const layout = await jitenReviewLayoutSnapshot(page, { width: 390, height: 844 });
    assertJitenReviewLayout(layout, { maxImmersionWidth: 390, minControlSize: 44 });
    await assertVisibleJitenReviewExampleActions(page, 'WebKit mobile');
    await assertOneTapImmersionTranslationReveal(page);
    await assertAccessibleSurface(page, 'Jiten review Immersion Kit on WebKit', '[data-yomu-jpdb-addon]');
    await page.screenshot({ path: path.join(ARTIFACTS, 'jiten-review-immersion-mobile-webkit.png'), fullPage: true });
    await page.close();
    record(
        'Jiten review mobile WebKit',
        'pass',
        `one-tap reveal, 44px controls, shell ${Math.round(reveal.shellMs)}ms, media ${Math.round(mediaMs)}ms, carousel ${Math.round(nextMediaMs)}ms`,
    );
}

function jitenReviewPerformanceFixtureHtml() {
    return `<!doctype html><html lang="ja" class="dark-mode"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
        :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#11151a;color:#eef2f5;font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        main{max-width:940px;margin:0 auto;padding:28px 18px 120px}.flex-grow{display:flex;flex-direction:column;gap:16px}.relative.touch-pan-y{position:relative}.pointer-events-none{pointer-events:none}.w-full{width:100%}.mx-auto{margin-inline:auto}
        [data-case="card"]{display:grid;gap:16px;padding:clamp(16px,3vw,30px);border:1px solid #33404c;border-radius:20px;background:#182027}.text-5xl{font-size:clamp(36px,7vw,64px);font-weight:750;text-align:center}
        [data-case="native-answer"]{padding-top:14px;border-top:1px solid #34434f}button[data-case="show-answer"]{min-height:48px;border:0;border-radius:12px;background:#5ea780;color:#08120d;font-weight:800}
    </style><title>読む - Jiten</title></head><body><main><div class="flex-grow flex flex-col"><button type="button" data-case="show-answer">Show Answer</button><div class="relative touch-pan-y"><div class="absolute inset-0 rounded-2xl pointer-events-none z-10"></div><div class="w-full mx-auto"><div class="relative bg-surface-0 rounded-2xl shadow-lg" data-case="card"><div class="text-5xl" lang="ja" data-case="headword">読む</div></div></div></div></div></main></body></html>`;
}

function measureJitenFixtureReveal(page) {
    return page.evaluate(() => new Promise(resolve => {
        const startedAt = performance.now();
        const finish = () => {
            const shell = document.querySelector('[data-yomu-jpdb-addon] [data-immersion-kit]');
            if (!shell) return false;
            observer.disconnect();
            resolve({ startedAt, shellMs: performance.now() - startedAt });
            return true;
        };
        const observer = new MutationObserver(finish);
        observer.observe(document.body, { childList: true, subtree: true });
        document.querySelector('[data-case="show-answer"]')?.remove();
        const answer = document.createElement('div');
        answer.dataset.case = 'native-answer';
        answer.innerHTML = '<strong>Meaning</strong><p>to read</p><div>Kanji breakdown</div><div>Composed of</div>';
        document.querySelector('[data-case="card"]')?.append(answer);
        if (finish()) return;
        window.setTimeout(() => {
            observer.disconnect();
            resolve({ startedAt, shellMs: performance.now() - startedAt });
        }, 2000);
    }));
}

function measureJitenFixtureNextFront(page, term) {
    return page.evaluate(nextTerm => new Promise(resolve => {
        const startedAt = performance.now();
        const finish = () => {
            if (document.querySelector('[data-yomu-jpdb-addon]')) return false;
            observer.disconnect();
            resolve(performance.now() - startedAt);
            return true;
        };
        const observer = new MutationObserver(finish);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        const headword = document.querySelector('[data-case="headword"]');
        if (headword) headword.textContent = nextTerm;
        document.title = `${nextTerm} - Jiten`;
        document.querySelector('[data-case="native-answer"]')?.remove();
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.case = 'show-answer';
        button.textContent = 'Show Answer';
        document.querySelector('.flex-grow')?.prepend(button);
        if (finish()) return;
        window.setTimeout(() => {
            observer.disconnect();
            resolve(performance.now() - startedAt);
        }, 2000);
    }), term);
}

async function jitenReviewLayoutSnapshot(page, viewport) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return page.evaluate(() => {
        const addon = document.querySelector('[data-yomu-jpdb-addon]');
        const immersion = document.querySelector('[data-immersion-kit]');
        const media = document.querySelector('.jpdb-reader-example-media');
        const image = document.querySelector('.jpdb-reader-example-image');
        const control = document.querySelector('[data-immersion-action="next"]');
        const rect = node => {
            const box = node?.getBoundingClientRect();
            return box ? { width: box.width, height: box.height, left: box.left, right: box.right } : { width: 0, height: 0, left: 0, right: 0 };
        };
        return {
            viewport: { width: innerWidth, height: innerHeight },
            addon: rect(addon),
            immersion: rect(immersion),
            media: rect(media),
            image: rect(image),
            control: rect(control),
            context: addon instanceof HTMLElement ? addon.dataset.yomuPageContext : '',
        };
    });
}

function assertJitenReviewLayout(layout, { maxImmersionWidth, minControlSize }) {
    assertAudit(layout.context === 'review', `review context metadata missing: ${JSON.stringify(layout)}`);
    assertAudit(layout.immersion.width > 0 && layout.immersion.width <= maxImmersionWidth + 1, `review Immersion rail is not bounded: ${JSON.stringify(layout)}`);
    assertAudit(layout.media.width > 0 && Math.abs(layout.media.width / layout.media.height - 16 / 9) < 0.04, `review media stage is not stable 16:9: ${JSON.stringify(layout)}`);
    assertAudit(layout.immersion.left >= layout.addon.left - 1 && layout.immersion.right <= layout.addon.right + 1, `review Immersion rail escapes the host card: ${JSON.stringify(layout)}`);
    if (minControlSize) assertAudit(layout.control.width >= minControlSize && layout.control.height >= minControlSize, `mobile review controls are too small: ${JSON.stringify(layout)}`);
}

async function assertVisibleJitenReviewExampleActions(page, viewportLabel) {
    const snapshot = await page.evaluate(() => {
        const details = document.querySelector('[data-yomu-jpdb-addon] [data-immersion-kit]');
        const summary = details?.querySelector(':scope > .jpdb-reader-example-summary');
        const meta = details?.querySelector('.jpdb-reader-example-meta');
        const title = meta?.querySelector('.jpdb-reader-example-title');
        const count = meta?.querySelector('.jpdb-reader-example-count');
        const links = [...(details?.querySelectorAll('.jpdb-reader-immersion-search-link') ?? [])];
        const hostBackgroundColor = getComputedStyle(document.querySelector('[data-case="card"]') ?? document.body).backgroundColor;
        const parseRgb = value => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = value => {
            const [red = 0, green = 0, blue = 0] = parseRgb(value).map(component => {
                const normalized = component / 255;
                return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const contrast = color => {
            const foreground = luminance(color);
            const background = luminance(hostBackgroundColor);
            return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        };
        const describe = node => {
            if (!(node instanceof HTMLElement)) return null;
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
                text: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                display: style.display,
                visibility: style.visibility,
                opacity: Number(style.opacity),
                color: style.color,
                contrast: contrast(style.color),
                backgroundColor: style.backgroundColor,
                overflow: style.overflow,
            };
        };
        return {
            hostBackgroundColor,
            details: describe(details),
            summary: describe(summary),
            meta: describe(meta),
            title: describe(title),
            count: describe(count),
            links: links.map(describe),
        };
    });
    const visible = item => Boolean(item
        && item.rect.width > 0
        && item.rect.height > 0
        && item.display !== 'none'
        && item.visibility !== 'hidden'
        && item.opacity > 0);
    const readable = item => visible(item) && item.contrast >= 4.5;
    assertAudit(visible(snapshot.summary), `${viewportLabel} review Immersion provider summary is not visibly laid out: ${JSON.stringify(snapshot)}`);
    assertAudit(visible(snapshot.meta), `${viewportLabel} review Immersion provider/count metadata is not visibly laid out: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.links.length === 2 && snapshot.links.every(visible), `${viewportLabel} review external example links are missing or not visibly laid out: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.links.some(link => /Immersion Kit/i.test(link?.text ?? ''))
        && snapshot.links.some(link => /Nadeshiko/i.test(link?.text ?? '')),
    `${viewportLabel} review external example links have incorrect labels: ${JSON.stringify(snapshot)}`);
    assertAudit(readable(snapshot.summary)
        && readable(snapshot.title)
        && readable(snapshot.count)
        && snapshot.links.every(readable),
    `${viewportLabel} review Immersion provider metadata or external links do not meet 4.5:1 text contrast: ${JSON.stringify(snapshot)}`);
}

function assertFastJitenReviewPaint(label, shellMs, mediaMs) {
    assertAudit(shellMs < 100, `${label} shell took ${Math.round(shellMs)}ms`);
    assertAudit(mediaMs < 250, `${label} cached media took ${Math.round(mediaMs)}ms`);
}

function assertFastJitenCarouselPaint(label, mediaMs) {
    assertAudit(mediaMs < 150, `${label} prefetched carousel image took ${Math.round(mediaMs)}ms`);
}

function assertUniqueJitenImmersionImageRequests(requests, label) {
    const urls = immersionImageRequestUrls(requests);
    assertAudit(new Set(urls).size === urls.length, `${label} duplicated a prefetched image request: ${JSON.stringify(urls)}`);
}

async function waitForJitenReviewMediaPaint(page) {
    await page.waitForFunction(() => {
        const image = document.querySelector('.jpdb-reader-example-image');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    }, null, { timeout: 4000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measureJitenImmersionNextMedia(page) {
    const before = await page.locator('.jpdb-reader-example-card').first().getAttribute('data-immersion-sentence');
    const startedAt = await page.evaluate(() => performance.now());
    await page.locator('[data-immersion-action="next"]').click();
    await page.waitForFunction(previous => {
        const card = document.querySelector('.jpdb-reader-example-card');
        const image = card?.querySelector('.jpdb-reader-example-image');
        return card?.getAttribute('data-immersion-sentence') !== previous
            && image instanceof HTMLImageElement
            && image.complete
            && image.naturalWidth > 0
            && image.naturalHeight > 0;
    }, before, { timeout: 4000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return page.evaluate(start => performance.now() - start, startedAt);
}

async function assertJitenReviewSourceSettings(page, requests) {
    const snapshot = await page.evaluate(() => ({
        exampleTotal: Number(document.querySelector('[data-immersion-total]')?.getAttribute('data-immersion-total') ?? 0),
        sourceIds: [...document.querySelectorAll('[data-yomu-jpdb-addon] [data-source]')]
            .map(node => node.getAttribute('data-source') ?? '')
            .filter(Boolean),
        searchLinks: [...document.querySelectorAll('.jpdb-reader-immersion-search-link')].map(node => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
                text: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                href: node instanceof HTMLAnchorElement ? node.href : '',
                width: box.width,
                height: box.height,
                display: style.display,
                visibility: style.visibility,
                opacity: Number(style.opacity),
                color: style.color,
                pointerEvents: style.pointerEvents,
            };
        }),
    }));
    assertAudit(snapshot.exampleTotal > 3, `Jiten review Immersion Kit is still truncated to two or three examples: ${JSON.stringify(snapshot)}`);
    const disabledSources = snapshot.sourceIds.filter(source => ['jpdb', 'jiten', 'bunpro', 'local-dictionary'].includes(source));
    assertAudit(disabledSources.length === 0, `disabled definition sources still rendered on Jiten review: ${JSON.stringify(disabledSources)}`);
    assertAudit(snapshot.searchLinks.length === 2, `Jiten review did not render both public example links: ${JSON.stringify(snapshot.searchLinks)}`);
    assertAudit(snapshot.searchLinks.some(link => /Immersion Kit/.test(link.text) && /immersionkit\.com/.test(link.href)), `Immersion Kit public link is missing or wrong: ${JSON.stringify(snapshot.searchLinks)}`);
    assertAudit(snapshot.searchLinks.some(link => /Nadeshiko/.test(link.text) && /nadeshiko\.co/.test(link.href)), `Nadeshiko public link is missing or wrong: ${JSON.stringify(snapshot.searchLinks)}`);
    assertAudit(snapshot.searchLinks.every(link => link.width > 44
        && link.height >= 28
        && link.display !== 'none'
        && link.visibility === 'visible'
        && link.opacity > 0
        && link.color !== 'rgba(0, 0, 0, 0)'
        && link.pointerEvents !== 'none'), `public example links are not visibly actionable: ${JSON.stringify(snapshot.searchLinks)}`);
    // JPDB's public search can still tokenize words inside the selected
    // Immersion sentence. That parser work is not a JPDB definition panel;
    // the loader unit suite separately proves the disabled JPDB definition
    // client is never called.
    const definitionRequests = requests.filter(request => [
        /api\.jiten\.moe\/api\/vocabulary(?:\/|\?)/,
        /bunpro\.jp\/api\//,
    ].some(pattern => pattern.test(request.url)));
    assertAudit(definitionRequests.length === 0, `disabled definition sources still made provider requests: ${JSON.stringify(definitionRequests)}`);
}

async function assertOneTapImmersionTranslationReveal(page) {
    const translation = page.locator('.jpdb-reader-example-translation').first();
    await translation.waitFor({ state: 'visible', timeout: 3000 });
    assertAudit(await translation.getAttribute('data-immersion-translation-blurred') === 'true', 'Immersion translation did not start blurred on mobile');
    const box = await translation.boundingBox();
    assertAudit(Boolean(box), 'blurred Immersion translation has no mobile tap target');
    const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerId: 51, pointerType: 'touch', isPrimary: true, button: 0 };
    await translation.dispatchEvent('pointerdown', point);
    await translation.dispatchEvent('pointerup', point);
    assertAudit(await translation.getAttribute('data-immersion-translation-blurred') === null, 'one mobile tap did not reveal the blurred Immersion translation');
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
    const { page, requests } = await openSeededReaderFixture(browser, server, {
        path: '/immersion-fixture.html',
        html,
        settings: {
            ...baseSettings,
            localDictionariesEnabled: true,
            ankiEnabled: true,
            audioEnabled: true,
            immersionKitEnabled: true,
            immersionKitShowTranslation: false,
            immersionKitShowImages: true,
            immersionKitAutoPlayAudio: false,
            immersionKitPlayOnHover: true,
        },
    });
    await page.locator('.jpdb-reader-word').filter({ hasText: '読' }).first().click();
    await openImmersionKitDetails(page);
    await page.waitForSelector('[data-immersion-kit] .jpdb-reader-example-card', { state: 'attached', timeout: 8000 });
    await waitForAudit(page, () => {
        const image = document.querySelector('.jpdb-reader-example-image');
        return image && image.complete && image.naturalWidth > 0;
    }, 6000, 'Immersion Kit thumbnail did not render');
    await waitForAudit(page, () => Boolean(document.querySelector('[data-action="anki-edit"]')), 6000, 'existing Anki card state did not settle').catch(async error => {
        const debug = await page.evaluate(() => ({
            loadingText: document.querySelector('[data-card-details-loading]')?.textContent ?? '',
            popoverText: document.querySelector('.jpdb-reader-popover')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 700) ?? '',
            ankiActions: [...document.querySelectorAll('[data-action^="anki"], .jpdb-reader-anki-existing')].map(node => node.textContent?.trim() ?? ''),
        }));
        throw new Error(`existing Anki card state did not settle: ${JSON.stringify({ debug, requests: requests.slice(-24) })}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, hasExistingAnkiPreviewContextFromDom, 6000, 'existing Anki card preview did not settle').catch(async error => {
        const debug = await page.evaluate(immersionKitFirstSnapshotFromDom);
        throw new Error(`existing Anki card preview did not settle: ${JSON.stringify({ debug, requests: requests.slice(-24) })}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, currentImmersionExampleTextSettledFromDom, 9000, 'first Immersion Kit example text did not settle').catch(async error => {
        const debug = await page.evaluate(immersionKitFirstSnapshotFromDom);
        throw new Error(`first Immersion Kit example text did not settle: ${JSON.stringify({ debug, requests: requests.slice(-24) })}: ${error instanceof Error ? error.message : String(error)}`);
    });
    const firstSnapshot = await page.evaluate(immersionKitFirstSnapshotFromDom);
    assertImmersionKitFirstSnapshot(firstSnapshot);
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
    await ensureImmersionExampleCardHoverable(page);
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
    const firstImmersionSentence = await page.locator('.jpdb-reader-example-card').first().getAttribute('data-immersion-sentence');
    await page.locator('[data-immersion-action="next"]').click();
    await waitForAudit(page, firstSentence => {
        const sentence = document.querySelector('.jpdb-reader-example-card')?.getAttribute('data-immersion-sentence') ?? '';
        return sentence && sentence !== firstSentence;
    }, 6000, 'Immersion Kit next example did not update', firstImmersionSentence).catch(async error => {
        const detail = await page.evaluate(immersionKitNextExampleDebugSnapshotFromDom);
        throw new Error(`Immersion Kit next example did not update: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForAudit(page, currentImmersionExampleTextSettledFromDom, 6000, 'Immersion Kit next example text did not settle').catch(async error => {
        const detail = await page.evaluate(immersionKitNextExampleDebugSnapshotFromDom);
        throw new Error(`Immersion Kit next example text did not settle: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    let selectedImmersion = await selectedImmersionSnapshot(page);
    assertAudit(Boolean(selectedImmersion.nestedWord), `Immersion Kit next example did not expose nested lookup words: ${JSON.stringify(selectedImmersion)}`);
    selectedImmersion = { ...selectedImmersion, ...await clickNestedImmersionWord(page, selectedImmersion) };
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
    const nestedBack = await page.evaluate(nestedImmersionBackSnapshotFromDom);
    assertAudit(nestedBack.visible && /読/.test(nestedBack.title), `nested Immersion lookup did not expose a back arrow to the source word: ${JSON.stringify(nestedBack)}`);
    await expandMiningDrawerIfCollapsed(page);
    await page.locator('.jpdb-reader-popover .jpdb-reader-btn.anki[data-action="anki"]:visible').click();
    await waitForNodeAudit(() => requests.some(request => request.action === 'addNote'), 6000, 'Add to Anki did not send AnkiConnect addNote').catch(async error => {
        const debug = await page.evaluate(immersionAnkiDebugSnapshotFromDom);
        const ankiRequests = requests.filter(request => request.url?.includes('127.0.0.1:8765')).slice(-20);
        throw new Error(`Add to Anki did not send AnkiConnect addNote: ${JSON.stringify({ debug, selectedImmersion, ankiRequests })}: ${error instanceof Error ? error.message : String(error)}`);
    });
    assertImmersionKitRequests(requests, selectedImmersion);
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
    await page.locator('.jpdb-reader-popover [data-action="word-history-back"]').click();
    await waitForAudit(page, () => {
        const spellings = [...document.querySelectorAll('.jpdb-reader-popover .jpdb-reader-spelling')]
            .map(node => node.textContent?.replace(/\s+/g, '').trim() ?? '');
        return document.querySelectorAll('.jpdb-reader-popover').length === 1
            && spellings.some(spelling => spelling.includes('読'));
    }, 6000, 'nested Immersion lookup back arrow did not return to the source popup');
    await waitForAudit(page, () => !document.querySelector('[data-card-details-loading]'), 6000, 'source Immersion lookup kept showing dictionary loading details after back navigation');
    await page.locator('.jpdb-reader-btn.easy').click();
    await waitForNodeAudit(() => requests.some(request => request.action === 'answerCards'), 6000, 'Anki grading did not send through AnkiConnect');
    const reviewToastCount = await page.locator('.jpdb-reader-toast').filter({ hasText: 'review sent' }).count();
    assertAudit(reviewToastCount === 0, 'grading should not show a low-value review sent toast');
    await assertNoVisibleReaderErrorToasts(page, 'Immersion Kit popup examples');
    await page.close();
    record('Immersion Kit popup examples', 'pass', 'examples render in-card and nested words open lookup');
}

function immersionKitFirstSnapshotFromDom() {
    const helpers = window.__yomuQaReaderWordDomHelpers;
    const popover = document.querySelector('.jpdb-reader-popover');
    return {
        sectionPresent: Boolean(document.querySelector('[data-immersion-kit]')),
        sectionText: text('[data-immersion-kit]'),
        exampleCards: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card').length,
        exampleTotal: Number(document.querySelector('[data-immersion-total]')?.getAttribute('data-immersion-total') ?? 0),
        exampleWords: document.querySelectorAll('[data-immersion-kit] .jpdb-reader-word').length,
        translationVisible: Boolean(document.querySelector('[data-immersion-kit] .jpdb-reader-example-translation')),
        imageVisible: Boolean(document.querySelector('.jpdb-reader-example-image')),
        localDefinitionWords: document.querySelectorAll('.jpdb-reader-local-glossary .jpdb-reader-word').length,
        localDefinitionTexts: [...document.querySelectorAll('.jpdb-reader-local-glossary')].map(normalizedText),
        localDefinitionSurfaces: [...document.querySelectorAll('.jpdb-reader-local-glossary .jpdb-reader-word')]
            .map(word => helpers?.surface?.(word)?.trim() ?? word.textContent?.replace(/\s+/g, '').trim() ?? ''),
        hasAnkiEdit: Boolean(document.querySelector('[data-action="anki-edit"]')),
        hasAddToAnki: Boolean(document.querySelector('[data-action="anki"]')),
        ankiExisting: text('.jpdb-reader-anki-existing'),
        parseState: popover instanceof HTMLElement ? {
            key: popover.dataset.jpdbReaderParseKey ?? '',
            loadingKey: popover.dataset.jpdbReaderParseLoadingKey ?? '',
            loadingId: popover.dataset.jpdbReaderParseLoadingId ?? '',
        } : null,
        parseRoots: [...document.querySelectorAll('.jpdb-reader-popover .jpdb-reader-parseable')].map(root => ({
            className: root.className,
            provider: root.hasAttribute('data-provider-example-sentence'),
            text: normalizedText(root),
            wordCount: root.querySelectorAll('.jpdb-reader-word').length,
        })),
    };

    function text(selector) {
        return document.querySelector(selector)?.textContent ?? '';
    }

    function normalizedText(node) {
        return node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }
}

function currentImmersionExampleTextSettledFromDom() {
    const card = document.querySelector('[data-immersion-kit] .jpdb-reader-example-card');
    return Boolean(card?.getAttribute('data-immersion-sentence'))
        && card.querySelectorAll('.jpdb-reader-example-sentence .jpdb-reader-word').length >= 2;
}

function hasExistingAnkiPreviewContextFromDom() {
    const existing = document.querySelector('.jpdb-reader-anki-existing')?.textContent ?? '';
    return existing.includes('Anime Mining') && existing.includes('今日は本を読む');
}

function immersionKitNextExampleDebugSnapshotFromDom() {
    return {
        cards: [...document.querySelectorAll('.jpdb-reader-example-card')].map(immersionCardSnapshot),
        buttons: [...document.querySelectorAll('[data-immersion-action]')].map(immersionActionButtonSnapshot),
        sectionText: clippedNormalizedText(document.querySelector('[data-immersion-kit]'), 500),
    };

    function immersionCardSnapshot(card) {
        return {
            sentence: attribute(card, 'data-immersion-sentence'),
            text: clippedNormalizedText(card, 240),
        };
    }

    function immersionActionButtonSnapshot(button) {
        return {
            action: attribute(button, 'data-immersion-action'),
            text: normalizedText(button),
            visible: visibleElement(button),
        };
    }

    function visibleElement(node) {
        return [
            node instanceof HTMLElement,
            node instanceof HTMLElement ? getComputedStyle(node).display !== 'none' : false,
            node instanceof HTMLElement ? !node.hidden : false,
        ].every(Boolean);
    }

    function clippedNormalizedText(node, length) {
        return normalizedText(node).slice(0, length);
    }

    function normalizedText(node) {
        return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function attribute(node, name) {
        return node.getAttribute(name) ?? '';
    }
}

function nestedImmersionBackSnapshotFromDom() {
    const button = document.querySelector('.jpdb-reader-popover [data-action="word-history-back"]');
    return {
        visible: visibleElement(button),
        title: button?.getAttribute('title') ?? '',
        label: button?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };

    function visibleElement(node) {
        return [
            node instanceof HTMLElement,
            node instanceof HTMLElement ? getComputedStyle(node).display !== 'none' : false,
            node instanceof HTMLElement ? !node.hidden : false,
        ].every(Boolean);
    }
}

function assertImmersionKitFirstSnapshot(snapshot) {
    assertAudit(snapshot.sectionPresent, 'Immersion Kit section is missing');
    assertAudit(snapshot.exampleCards > 0, `Immersion Kit examples are missing: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.exampleTotal > 3, `Immersion Kit carousel is still truncated to two or three examples: ${JSON.stringify(snapshot)}`);
    assertAudit(snapshot.exampleWords >= 2, `Immersion Kit sentence is not recursively tokenized: ${JSON.stringify(snapshot)}`);
    assertAudit(!snapshot.translationVisible, 'Immersion Kit translations are visible despite the default-off setting');
    assertAudit(snapshot.imageVisible, 'Immersion Kit thumbnail did not render');
    assertAudit(hasRecursivelyParsedLocalDefinitions(snapshot), `local dictionary recursive parsing did not run: ${JSON.stringify(snapshot)}`);
    assertAudit(hasExistingAnkiEditState(snapshot), `existing Anki card did not replace Add to Anki with Edit in Anki: ${JSON.stringify(snapshot)}`);
    assertAudit(hasExistingAnkiPreviewContext(snapshot), 'existing Anki card preview did not render deck and sentence context');
}

function hasRecursivelyParsedLocalDefinitions(snapshot) {
    return snapshot.localDefinitionWords > 0
        && ['日本語', '読む'].every(term => snapshot.localDefinitionSurfaces?.includes(term));
}

function hasExistingAnkiEditState(snapshot) {
    return snapshot.hasAnkiEdit && !snapshot.hasAddToAnki;
}

function hasExistingAnkiPreviewContext(snapshot) {
    return snapshot.ankiExisting.includes('Anime Mining') && snapshot.ankiExisting.includes('今日は本を読む');
}

async function expandMiningDrawerIfCollapsed(page) {
    const miningDrawer = page.locator('.jpdb-reader-popover .jpdb-reader-actions-has-mining.jpdb-reader-actions-mining-collapsed [data-action="mining-collapse"]:visible');
    if (await miningDrawer.count()) await miningDrawer.first().click();
}

function assertImmersionKitRequests(requests, selectedImmersion) {
    const addNoteRequests = requests.filter(request => request.action === 'addNote');
    assertAudit(requests.some(request => /apiv2(?:express)?\.immersionkit\.com\/search/.test(request.url)), 'Immersion Kit API was not requested');
    assertAudit(requests.some(request => request.url.includes('127.0.0.1:8765')), 'AnkiConnect was not queried for existing card state');
    assertAudit(
        addNoteRequests.some(request => immersionAddNoteMatchesSelection(request, selectedImmersion)),
        `Anki addNote did not include the selected Immersion Kit sentence and image: ${JSON.stringify({ selectedImmersion, addNoteRequests })}`,
    );
}

function immersionAddNoteMatchesSelection(request, selectedImmersion) {
    return selectedImmersion.sentence
        && request.ankiSentence?.includes(selectedImmersion.sentence)
        && request.ankiHasPicture;
}

function selectedImmersionSnapshot(page) {
    return page.evaluate(selectedImmersionSnapshotFromDom);
}

async function clickNestedImmersionWord(page, selectedImmersion) {
    const target = await page.evaluate(selected => {
        const words = [...document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card .jpdb-reader-example-sentence .jpdb-reader-word')]
            .filter(wordIsVisible);
        const selectedWords = words.filter(candidate => {
            const plain = candidate.textContent?.replace(/\s+/g, '').trim() ?? '';
            const expression = candidate.getAttribute('data-expression') ?? '';
            return plain === selected.nestedLocatorText
                || plain.includes(selected.nestedWord)
                || expression === selected.nestedWord;
        });
        const fallbackWords = words.filter(word => !selectedWords.includes(word) && !word.classList.contains('jpdb-reader-example-target'));
        const candidateWords = [...selectedWords, ...fallbackWords];
        for (const word of candidateWords) {
            const target = hittableTarget(word);
            if (target) return target;
        }
        return {
            error: 'no hittable point',
            selected,
            candidates: candidateWords.slice(0, 8).map(wordDebugSnapshot),
        };

        function hittableTarget(word) {
            const body = word.closest('.jpdb-reader-popover-body') ?? document.querySelector('.jpdb-reader-popover-body');
            const offsets = [0, -40, 40, -90, 90, -140, 140];
            for (const offset of offsets) {
                if (body instanceof HTMLElement) centerWordInScrollBody(word, body, offset);
                else word.scrollIntoView({ block: 'center', inline: 'nearest' });
                const point = hittablePoint(word);
                if (point) {
                    return {
                        point,
                        text: word.textContent,
                        className: word.className,
                        nestedWord: immersionWordSurface(word),
                        nestedLocatorText: word.textContent?.replace(/\s+/g, '').trim() ?? immersionWordSurface(word),
                    };
                }
            }
            return null;
        }

        function centerWordInScrollBody(word, body, visualOffset) {
            const wordRect = word.getBoundingClientRect();
            const bodyRect = body.getBoundingClientRect();
            const targetY = bodyRect.top + (bodyRect.height / 2) + visualOffset;
            const nextScrollTop = body.scrollTop + wordRect.top - targetY;
            body.scrollTop = Math.max(0, Math.min(body.scrollHeight - body.clientHeight, nextScrollTop));
        }

        function hittablePoint(word) {
            for (const point of wordHitTestPoints(word)) {
                const hit = document.elementFromPoint(point.x, point.y);
                if (hit?.closest('.jpdb-reader-word') === word) return point;
            }
            return null;
        }

        function wordHitTestPoints(element) {
            const rects = [...element.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
            return rects.flatMap(rect => [
                { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
                { x: rect.left + rect.width / 2, y: rect.bottom - Math.min(3, rect.height / 3) },
                { x: rect.left + Math.min(rect.width - 1, Math.max(1, rect.width * 0.35)), y: rect.top + rect.height / 2 },
                { x: rect.left + Math.min(rect.width - 1, Math.max(1, rect.width * 0.65)), y: rect.top + rect.height / 2 },
            ]).filter(point => point.x >= 0 && point.x < innerWidth && point.y >= 0 && point.y < innerHeight);
        }

        function wordIsVisible(word) {
            if (!(word instanceof HTMLElement)) return false;
            const style = getComputedStyle(word);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && word.getClientRects().length > 0;
        }

        function wordDebugSnapshot(word) {
            const points = wordHitTestPoints(word);
            const card = word.closest('.jpdb-reader-example-card');
            const sentence = word.closest('.jpdb-reader-example-sentence');
            const section = word.closest('[data-immersion-kit]');
            const body = word.closest('.jpdb-reader-popover-body');
            return {
                text: word.textContent,
                surface: immersionWordSurface(word),
                className: word.className,
                rects: [...word.getClientRects()].map(rectSnapshot),
                sentenceRect: sentence instanceof HTMLElement ? rectSnapshot(sentence.getBoundingClientRect()) : null,
                card: card instanceof HTMLElement ? {
                    className: card.className,
                    sentence: card.getAttribute('data-immersion-sentence') ?? '',
                    rect: rectSnapshot(card.getBoundingClientRect()),
                    html: card.outerHTML.slice(0, 360),
                } : null,
                sectionRect: section instanceof HTMLElement ? rectSnapshot(section.getBoundingClientRect()) : null,
                bodyRect: body instanceof HTMLElement ? rectSnapshot(body.getBoundingClientRect()) : null,
                bodyScrollTop: body instanceof HTMLElement ? body.scrollTop : null,
                ancestors: ancestorChain(word),
                hits: points.map(point => document.elementFromPoint(point.x, point.y)?.outerHTML.slice(0, 160) ?? ''),
            };
        }

        function ancestorChain(node) {
            const chain = [];
            let current = node.parentElement;
            while (current && chain.length < 8) {
                chain.push({
                    tag: current.tagName.toLowerCase(),
                    className: current.className,
                    dataImmersionKit: current.hasAttribute('data-immersion-kit'),
                    dataSentence: current.getAttribute('data-immersion-sentence') ?? '',
                    rect: rectSnapshot(current.getBoundingClientRect()),
                });
                current = current.parentElement;
            }
            return chain;
        }

        function rectSnapshot(rect) {
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            };
        }

        function immersionWordSurface(node) {
            const clone = node.cloneNode(true);
            if (clone instanceof HTMLElement) clone.querySelectorAll('rt').forEach(rt => rt.remove());
            return clone.textContent?.replace(/\s+/g, '').replace(/[()（）]/g, '').trim() ?? '';
        }
    }, selectedImmersion);
    assertAudit(!target.error && target.point, `Immersion Kit nested word is not hittable: ${JSON.stringify({ selectedImmersion, target })}`);
    await page.mouse.click(target.point.x, target.point.y);
    return {
        nestedWord: target.nestedWord,
        nestedLocatorText: target.nestedLocatorText,
    };
}

function selectedImmersionSnapshotFromDom() {
    const card = document.querySelector('.jpdb-reader-example-card');
    const nested = preferredNestedImmersionWord(immersionWords());
    return {
        sentence: dataAttribute(card, 'data-immersion-sentence'),
        ...nestedImmersionSnapshot(nested),
    };

    function immersionWords() {
        return [...document.querySelectorAll('[data-immersion-kit] .jpdb-reader-example-card .jpdb-reader-example-sentence .jpdb-reader-word')]
            .map(immersionWordSnapshot)
            .filter(hasSurface);
    }

    function immersionWordSnapshot(node) {
        const surface = immersionWordSurface(node);
        const locatorText = node.textContent?.replace(/\s+/g, '').trim() ?? surface;
        return { surface, locatorText };
    }

    function immersionWordSurface(node) {
        const clone = node.cloneNode(true);
        if (clone instanceof HTMLElement) clone.querySelectorAll('rt').forEach(rt => rt.remove());
        return clone.textContent?.replace(/\s+/g, '').replace(/[()（）]/g, '').trim() ?? '';
    }

    function preferredNestedImmersionWord(words) {
        for (const predicate of nestedWordPredicates()) {
            const word = words.find(predicate);
            if (word) return word;
        }
        return words[0];
    }

    function nestedWordPredicates() {
        return [
            word => word.surface.includes('日本語'),
            word => word.surface.includes('本'),
            word => !word.surface.includes('読'),
        ];
    }

    function nestedImmersionSnapshot(word) {
        if (!word) return { nestedWord: '', nestedLocatorText: '' };
        return {
            nestedWord: word.surface,
            nestedLocatorText: word.locatorText || word.surface,
        };
    }

    function hasSurface(word) {
        return Boolean(word.surface);
    }

    function dataAttribute(node, name) {
        return node?.getAttribute(name) ?? '';
    }
}

async function auditOcrFixture(browser, server) {
    const svg = encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='520' height='360'><rect width='520' height='360' fill='#f4f0e7'/><text x='40' y='90' font-size='42'>今日は学校へ行きます。</text><text x='72' y='245' font-size='42'>友だちと本を読む。</text></svg>");
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{margin:0;padding:32px;background:#15191f;color:white;font-family:system-ui}
        .ocr-fixture-text{position:absolute;left:-9999px}
        img{display:block;width:520px;height:360px;object-fit:cover;border:1px solid #333}
    </style></head><body>
        <p class="ocr-fixture-text">画像の日本語を読む</p>
        <img alt="今日は学校へ行きます。" data-ocr-lines='[
            {"text":"今日は学校へ行きます。","box":{"left":0.08,"top":0.12,"width":0.76,"height":0.18},"vertical":false},
            {"text":"友だちと本を読む。","box":{"left":0.14,"top":0.58,"width":0.68,"height":0.18},"vertical":false}
        ]' src="data:image/svg+xml;charset=utf-8,${svg}">
    </body></html>`;
    const { page } = await newAuditedPage(browser, { ...baseSettings, ocrEnabled: true, ocrAutoScanImages: true, ocrShowTextOverlay: false });
    await page.route(`${server.origin}/ocr-fixture.html`, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
    }));
    await page.goto(`${server.origin}/ocr-fixture.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.images[0]?.complete && document.images[0]?.naturalWidth > 0, null, { timeout: 6000 });
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-ocr-line').length >= 2, 10000, 'OCR fixture lines were not created').catch(async error => {
        const detail = await page.evaluate(ocrFixtureDebugSnapshotFromDom);
        throw new Error(`OCR fixture lines were not created: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
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
            lineSentence: line?.querySelector('.jpdb-reader-word')?.getAttribute('data-sentence') ?? '',
        };
    });
    assertAudit(overlay.lineCount >= 2, 'OCR line count is wrong');
    assertAudit(overlay.wordCount >= 2, 'OCR text was not parsed into selectable words');
    assertAudit(overlay.visibleTextOverlays === 0, 'OCR text is visibly painted by default');
    assertAudit(!overlay.lineTitle && overlay.lineSentence.includes('学校'), 'OCR line text metadata is missing');
    await page.evaluate(() => {
        const line = document.querySelector('.jpdb-ocr-line');
        if (!(line instanceof HTMLElement)) return;
        line.focus({ preventScroll: true });
        line.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Enter',
        }));
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

function ocrFixtureDebugSnapshotFromDom() {
    return {
        settings: JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') || '{}'),
        body: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? '',
        images: [...document.images].map(image => {
            const rect = image.getBoundingClientRect();
            return {
                complete: image.complete,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
                ocrLinesLength: image.dataset.ocrLines?.length ?? 0,
                ocrLinesPrefix: image.dataset.ocrLines?.slice(0, 80) ?? '',
            };
        }),
        layers: [...document.querySelectorAll('.jpdb-ocr-layer')].map(layer => ({
            hidden: layer.hidden,
            text: layer.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '',
            lines: layer.querySelectorAll('.jpdb-ocr-line').length,
        })),
        statuses: [...document.querySelectorAll('.jpdb-ocr-status')].map(status => status.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
        readerRoots: document.querySelectorAll('[data-jpdb-reader-root]').length,
    };
}

async function auditVideoFixture(browser, server) {
    const { page } = await newAuditedPage(browser, { ...baseSettings, subtitlePlayerEnabled: true, subtitleAutoDetect: true, showFloatingButton: false });
    await page.goto(`${server.origin}${QA_VIDEO_PATH}`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 6000 });
    await waitForAudit(page, videoTracksReadyFromDom, 6000, 'video fixture subtitle tracks did not load');
    await waitForAudit(page, subtitleTracksDetectedFromDom, 6000, 'subtitle controller did not detect fixture tracks');
    await page.evaluate(advanceFixtureVideoCue);
    await waitForAudit(page, subtitlePrimaryCueVisibleFromDom, 8000, 'subtitle text did not render while watching the fixture');
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length > 0, 8000, 'subtitle JPDB word highlighting did not render');
    await waitForAudit(page, subtitleRailHasPanelOnlyControls, 4000, 'subtitle icon controls are missing').catch(async error => {
        const detail = await page.evaluate(subtitleRailControlDebugSnapshot);
        throw new Error(`subtitle icon controls are missing: ${JSON.stringify(detail)}: ${error instanceof Error ? error.message : String(error)}`);
    });
    const snapshot = await videoFixtureSnapshot(page);
    assertVideoFixtureSnapshot(snapshot);
    const idleRailSnapshot = await subtitleRailControlSnapshot(page, {
        addClasses: ['jpdb-subtitle-controls-auto', 'jpdb-subtitle-controls-idle', 'jpdb-subtitle-compact-video'],
        removeClasses: ['jpdb-subtitle-panel-open'],
        settleMs: 500,
    });
    assertCompactIdleRailSnapshot(idleRailSnapshot);
    const hiddenControlsRailSnapshot = await subtitleRailControlSnapshot(page, {
        addClasses: ['jpdb-subtitle-controls-hidden', 'jpdb-subtitle-compact-video'],
        removeClasses: ['jpdb-subtitle-controls-auto', 'jpdb-subtitle-controls-idle', 'jpdb-subtitle-panel-open'],
    });
    assertHiddenControlsRailSnapshot(hiddenControlsRailSnapshot);
    await subtitleRailControlSnapshot(page, {
        addClasses: ['jpdb-subtitle-controls-auto'],
        removeClasses: ['jpdb-subtitle-controls-hidden', 'jpdb-subtitle-controls-idle'],
        settleMs: 50,
    });
    await page.evaluate(advanceFixtureVideoCue);
    await page.locator('.jpdb-subtitle-rail button[data-action="panel"]').click();
    await waitForAudit(page, transcriptPanelOpenWithActiveLine, 6000, 'transcript panel did not open with active-line highlighting');
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
    const mobileTranscript = await waitForAudit(page, mobileTranscriptSnapshotFromDom, 3000, 'mobile transcript panel did not stay visible');
    assertMobileTranscriptLayout(mobileTranscript);
    await assertAccessibleSurface(page, 'subtitle player fixture', '.jpdb-subtitle-player');
    await page.screenshot({ path: path.join(ARTIFACTS, 'video-fixture-mobile.png'), fullPage: false });
    await page.close();
    record('subtitle player fixture', 'pass', 'watched a cue with JPDB highlighting and readable subtitle backing');
}

function videoTracksReadyFromDom() {
    const video = document.querySelector('video');
    if (!video || video.textTracks.length < 2) return false;
    for (const track of video.textTracks) track.mode = 'hidden';
    return true;
}

function subtitleTracksDetectedFromDom() {
    const status = document.querySelector('.jpdb-subtitle-status')?.textContent ?? '';
    return hasDetectedSubtitleStatus(status);

    function hasDetectedSubtitleStatus(statusText) {
        const detectedCount = Number(statusText.match(/\d+/)?.[0] ?? 0);
        const noTracksDetected = /No subtitle tracks detected|まだ検出されていません/i.test(statusText);
        const detectedText = /subtitle tracks? detected|字幕トラック.*検出/i.test(statusText);
        return [
            !noTracksDetected,
            [detectedCount >= 2, detectedText].some(Boolean),
        ].every(Boolean);
    }
}

function mobileTranscriptSnapshotFromDom() {
    const panel = document.querySelector('.jpdb-subtitle-list');
    if (!(panel instanceof HTMLElement)) return false;
    if (panel.hasAttribute('hidden')) return false;
    const rect = panel.getBoundingClientRect();
    const snapshot = {
        width: rect.width,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
    };
    return isMobileTranscriptSheetFromDom(snapshot) ? snapshot : false;

    function isMobileTranscriptSheetFromDom(snapshot) {
        return snapshot.width >= snapshot.viewportWidth - 24 && snapshot.top > snapshot.viewportHeight * 0.42;
    }
}

function advanceFixtureVideoCue() {
    const video = document.querySelector('video');
    if (!video) return;
    video.currentTime = 1.2;
    video.dispatchEvent(new Event('timeupdate'));
    for (const track of video.textTracks) track.dispatchEvent(new Event('cuechange'));
}

function subtitlePrimaryCueVisibleFromDom() {
    const text = document.querySelector('.jpdb-subtitle-primary')?.textContent ?? '';
    return text.includes('今日') && text.includes('読');
}

function subtitleRailHasPanelOnlyControls() {
    const buttons = [...document.querySelectorAll('.jpdb-subtitle-rail button')]
        .map(buttonSnapshot);
    return buttons.filter(button => button.action === 'panel').length === 1
        && !buttons.some(hasObsoleteSubtitleRailAction);

    function buttonSnapshot(button) {
        return {
            action: button.getAttribute('data-action') ?? '',
            label: firstPresent([
                button.getAttribute('aria-label'),
                button.getAttribute('title'),
                button.textContent?.trim(),
            ]),
        };
    }

    function hasObsoleteSubtitleRailAction(button) {
        return ['toggle', 'list', 'tracks'].includes(button.action);
    }

    function firstPresent(values) {
        return values.find(Boolean) ?? '';
    }
}

function subtitleRailControlDebugSnapshot() {
    return {
        railHtml: html('.jpdb-subtitle-rail'),
        buttons: [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(buttonSnapshot),
        rootClass: className('.jpdb-subtitle-player'),
    };

    function buttonSnapshot(button) {
        return {
            action: button.getAttribute('data-action') ?? '',
            label: firstPresent([
                button.getAttribute('aria-label'),
                button.getAttribute('title'),
                button.textContent?.trim(),
            ]),
            hidden: button.hasAttribute('hidden'),
        };
    }

    function html(selector) {
        return document.querySelector(selector)?.outerHTML ?? '';
    }

    function className(selector) {
        return document.querySelector(selector)?.className ?? '';
    }

    function firstPresent(values) {
        return values.find(Boolean) ?? '';
    }
}

function transcriptPanelOpenWithActiveLine() {
    const panel = document.querySelector('.jpdb-subtitle-list');
    if (!panel || panel.hasAttribute('hidden')) return false;
    return hasTranscriptPanelIdentity(panel)
        && Boolean(panel.querySelector('.jpdb-subtitle-list-row.active'));

    function hasTranscriptPanelIdentity(panelNode) {
        const text = panelNode.textContent ?? '';
        return /Subtitles|字幕/.test(text) || panelNode.classList.contains('jpdb-subtitle-lines-panel');
    }
}

async function subtitleRailControlSnapshot(page, { addClasses, removeClasses, settleMs = 0 }) {
    await page.evaluate(({ addClasses: classesToAdd, removeClasses: classesToRemove }) => {
        const root = document.querySelector('.jpdb-subtitle-player');
        if (root instanceof HTMLElement) {
            root.classList.add(...classesToAdd);
            root.classList.remove(...classesToRemove);
        }
    }, { addClasses, removeClasses });
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    return page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const rail = document.querySelector('.jpdb-subtitle-rail');
        const panel = document.querySelector('.jpdb-subtitle-rail [data-action="panel"]');
        const styleFor = element => {
            if (!(element instanceof HTMLElement)) return null;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
                opacity: style.opacity,
                pointerEvents: style.pointerEvents,
                visibility: style.visibility,
                display: style.display,
                width: rect.width,
                height: rect.height,
            };
        };
        return {
            rootClass: root instanceof HTMLElement ? root.className : '',
            rail: styleFor(rail),
            panel: styleFor(panel),
            buttons: [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => ({
                action: button.getAttribute('data-action') ?? '',
                style: styleFor(button),
            })),
        };
    });
}

function videoFixtureSnapshot(page) {
    return page.evaluate(videoFixtureSnapshotFromDom);
}

function videoFixtureSnapshotFromDom() {
    const root = document.querySelector('.jpdb-subtitle-player');
    const primary = document.querySelector('.jpdb-subtitle-primary');
    const firstWord = document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word');
    const primaryStyle = computedStyle(primary);
    const firstWordStyle = computedStyle(firstWord);
    const firstWordAfterStyle = pseudoStyle(firstWord, '::after');
    return {
        hidden: hiddenProperty(root),
        documentClasses: document.documentElement.className,
        subtitleRootClasses: className(root),
        rect: rectSnapshot(root),
        buttons: subtitleRailButtons(),
        visibleFileInputs: document.querySelectorAll('.jpdb-subtitle-player input[type="file"]:not([hidden])').length,
        transcriptVisible: Boolean(document.querySelector('.jpdb-subtitle-list:not([hidden])')),
        obsoleteStatusText: bodyTextIncludes('No loaded Japanese subtitle lines.'),
        subtitleText: text(primary),
        subtitleBackground: `${styleValue(primaryStyle, 'backgroundColor')} ${styleValue(primaryStyle, 'backgroundImage')}`,
        subtitleWords: document.querySelectorAll('.jpdb-subtitle-primary .jpdb-reader-word').length,
        subtitleWordClasses: className(firstWord),
        subtitleWordOpacity: styleValue(firstWordStyle, 'opacity'),
        subtitleWordBackground: styleValue(firstWordStyle, 'backgroundColor'),
        subtitleWordBackgroundImage: styleValue(firstWordStyle, 'backgroundImage'),
        subtitleWordDecorationLine: styleValue(firstWordStyle, 'textDecorationLine'),
        subtitleWordDecorationColor: styleValue(firstWordStyle, 'textDecorationColor'),
        subtitleWordUnderlineBorderColor: styleValue(firstWordAfterStyle, 'borderBlockEndColor'),
        subtitleWordUnderlineBorderStyle: styleValue(firstWordAfterStyle, 'borderBlockEndStyle'),
        subtitleWordUnderlineBorderWidth: styleValue(firstWordAfterStyle, 'borderBlockEndWidth'),
    };

    function computedStyle(node) {
        return node instanceof HTMLElement ? getComputedStyle(node) : null;
    }

    function pseudoStyle(node, pseudo) {
        return node instanceof HTMLElement ? getComputedStyle(node, pseudo) : null;
    }

    function className(node) {
        return node instanceof HTMLElement ? node.className : '';
    }

    function hiddenProperty(node) {
        return node instanceof HTMLElement ? node.hidden : undefined;
    }

    function rectSnapshot(node) {
        const rect = node?.getBoundingClientRect();
        return rect ? { width: rect.width, height: rect.height, bottom: rect.bottom } : null;
    }

    function subtitleRailButtons() {
        return [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(subtitleRailButtonSnapshot);
    }

    function subtitleRailButtonSnapshot(button) {
        return {
            action: button.getAttribute('data-action') ?? '',
            label: firstPresent([
                button.getAttribute('aria-label'),
                button.getAttribute('title'),
                button.textContent?.trim(),
            ]),
        };
    }

    function styleValue(style, property) {
        return style?.[property] ?? '';
    }

    function bodyTextIncludes(text) {
        return document.body.textContent?.includes(text) ?? false;
    }

    function text(node) {
        return node?.textContent ?? '';
    }

    function firstPresent(values) {
        return values.find(Boolean) ?? '';
    }
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
        hasVisibleSubtitleWordHighlight(snapshot),
        `subtitle parsed-word highlight is transparent: ${JSON.stringify(snapshot)}`,
    );
    assertAudit(
        hasVisibleSubtitleWordUnderline(snapshot),
        `subtitle parsed-word underline is not immediately visible: ${JSON.stringify(snapshot)}`,
    );
    assertAudit(
        hasSettledSubtitleWordState(snapshot),
        `subtitle parsed-word state is still pending when the cue is active: ${JSON.stringify(snapshot)}`,
    );
}

function hasLaidOutSubtitlePlayer(snapshot) {
    return (snapshot.rect?.width ?? 0) > 200;
}

function hasVisibleFixtureSubtitleText(snapshot) {
    return snapshot.subtitleText.includes('今日') && snapshot.subtitleText.includes('読');
}

function hasVisibleSubtitleWordHighlight(snapshot) {
    return [
        !isTransparentCssColor(snapshot.subtitleWordBackground),
        snapshot.subtitleWordBackgroundImage !== 'none',
    ].some(Boolean);
}

function hasVisibleSubtitleWordUnderline(snapshot) {
    const nativeUnderline = [
        snapshot.subtitleWordDecorationLine.includes('underline'),
        !isTransparentCssColor(snapshot.subtitleWordDecorationColor),
    ].every(Boolean);
    const pseudoUnderline = [
        snapshot.subtitleWordUnderlineBorderStyle !== 'none',
        Number.parseFloat(snapshot.subtitleWordUnderlineBorderWidth || '0') > 0,
        !isTransparentCssColor(snapshot.subtitleWordUnderlineBorderColor),
    ].every(Boolean);
    return nativeUnderline || pseudoUnderline;
}

function hasSettledSubtitleWordState(snapshot) {
    return [
        !snapshot.subtitleWordClasses.includes('jpdb-subtitle-word-pending'),
        Number.parseFloat(snapshot.subtitleWordOpacity || '0') >= 0.9,
    ].every(Boolean);
}

function assertCompactIdleRailSnapshot(snapshot) {
    assertAudit(
        isSubtitleRailVisuallyAvailable(snapshot),
        `idle compact subtitle rail should keep its move grip visible: ${JSON.stringify(snapshot)}`,
    );
    assertAudit(
        (snapshot.rail?.width ?? Number.POSITIVE_INFINITY) <= 120,
        `idle compact subtitle rail should collapse to a small chip: ${JSON.stringify(snapshot)}`,
    );
    for (const action of ['rail-expand']) {
        const button = snapshot.buttons?.find(candidate => candidate.action === action);
        assertAudit(
            isAtLeast(button?.style?.width, 28) && isAtLeast(button?.style?.height, 28),
            `idle compact subtitle rail is missing its visible ${action} control: ${JSON.stringify(snapshot)}`,
        );
    }
    const expandedControls = snapshot.buttons?.filter(candidate => candidate.action !== 'rail-expand') ?? [];
    assertAudit(
        expandedControls.every(button => button.style?.display === 'none' || !isAtLeast(button.style?.width, 1)),
        `idle compact subtitle rail left expanded controls visible: ${JSON.stringify(snapshot)}`,
    );
}

function assertHiddenControlsRailSnapshot(snapshot) {
    assertHiddenSubtitleRailSnapshot(snapshot, 'hidden-controls');
}

function assertHiddenSubtitleRailSnapshot(snapshot, label) {
    assertAudit(
        isSubtitleRailVisuallyHidden(snapshot),
        `${label} subtitle rail should hide as a whole: ${JSON.stringify(snapshot)}`,
    );
    assertAudit(isSubtitleRailLaidOut(snapshot), `${label} subtitle rail should remain laid out for transitions: ${JSON.stringify(snapshot)}`);
    assertAudit(isSubtitlePanelToggleLaidOut(snapshot), `${label} subtitle panel toggle is not laid out: ${JSON.stringify(snapshot)}`);
}

function isSubtitleRailVisuallyHidden(snapshot) {
    const visuallyConcealed = snapshot.rail?.visibility === 'hidden'
        || Number.parseFloat(snapshot.rail?.opacity ?? '1') <= 0.2;
    return visuallyConcealed && snapshot.rail?.pointerEvents === 'none';
}

function isSubtitleRailVisuallyAvailable(snapshot) {
    // Compact idle intentionally rests at .55 opacity: visible enough to find
    // the move/expand grip, quieter than active controls, and well above the
    // <= .2 hidden-state floor audited separately.
    return Number.parseFloat(snapshot.rail?.opacity ?? '0') >= 0.5
        && snapshot.rail?.pointerEvents !== 'none'
        && isSubtitleRailLaidOut(snapshot);
}

function isSubtitleRailLaidOut(snapshot) {
    return [
        snapshot.rail?.display !== 'none',
        isAtLeast(snapshot.rail?.width, 1),
        isAtLeast(snapshot.rail?.height, 1),
    ].every(Boolean);
}

function isSubtitlePanelToggleLaidOut(snapshot) {
    return isAtLeast(snapshot.panel?.width, 28) && isAtLeast(snapshot.panel?.height, 28);
}

function isAtLeast(value, minimum) {
    return (value ?? 0) >= minimum;
}

function assertDesktopTranscriptLayout(layout) {
    assertAudit(Boolean(layout), 'desktop transcript layout could not be measured');
    assertAudit(isDesktopTranscriptAnchored(layout), `desktop transcript drawer is not anchored to the viewport edge: ${JSON.stringify(layout)}`);
}

function isDesktopTranscriptAnchored(layout) {
    return [
        layout.panelWidth >= 340,
        layout.panelRight <= layout.viewportWidth + 1,
        layout.panelRight >= layout.viewportWidth - 24,
        layout.panelLeft >= layout.viewportWidth * 0.6,
        layout.panelBottom > layout.panelTop,
    ].every(Boolean);
}

function assertMobileTranscriptLayout(layout) {
    assertAudit(isMobileTranscriptSheet(layout), `mobile transcript panel is not bottom-sheet sized: ${JSON.stringify(layout)}`);
}

function isMobileTranscriptSheet(layout) {
    return layout.width >= layout.viewportWidth - 24 && layout.top > layout.viewportHeight * 0.42;
}

async function runAudit(name, fn, options = {}) {
    if (QA_ONLY && !name.toLowerCase().includes(QA_ONLY)) return;
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
    companionScripts = await readBuiltCompanionScripts();
    readerCss = await readBuiltReaderCss();

    const server = await startStaticServer(DIST);
    const browser = await chromium.launch({ headless: true });
    let webkitBrowser;
    try {
        await runAudit('secret leak scan', auditNoSecretLeak);
        await runAudit('mobile onboarding', () => auditOnboardingMobile(browser, server));
        await runAudit('settings dialog', () => auditSettings(browser, server));
        await runAudit('mobile settings journey', () => auditSettingsMobile(browser, server));
        await runAudit('new-tab dictionary fallback', () => auditNewTabDictionaryFallback(browser, server));
        await runAudit('hosted Try Me demo', () => auditHostedTryMeDemo(browser, server), { requiresApiKey: true });
        await runAudit('runtime regression fixture', () => auditRuntimeRegressionFixes(browser, server), { requiresApiKey: true });
        await runAudit('Bloomee auto page scan', () => auditBloomeeAutoScan(browser), { requiresApiKey: true });
        await runAudit('hold-key hover lookup', () => auditHoverLookup(browser, server), { requiresApiKey: true });
        await runAudit('jpdb.io search compatibility', () => auditJpdbSearchCompatibility(browser), { requiresApiKey: true });
        await runAudit('Jiten review transition performance', () => auditJitenReviewTransitionPerformance(browser));
        if (!QA_ONLY || 'jiten review mobile webkit'.includes(QA_ONLY)) {
            webkitBrowser = await webkit.launch({ headless: true });
        }
        await runAudit('Jiten review mobile WebKit', () => auditJitenReviewMobileWebKit(webkitBrowser));
        await runAudit('Immersion Kit popup examples', () => auditImmersionKitPopover(browser, server), { requiresApiKey: true });
        await runAudit('OCR fixture', () => auditOcrFixture(browser, server), { requiresApiKey: true });
        await runAudit('subtitle player fixture', () => auditVideoFixture(browser, server), { requiresApiKey: true });
    } finally {
        await webkitBrowser?.close();
        await browser.close();
        await server.close();
    }

    const failed = results.filter(result => result.status === 'fail');
    console.log(`\nQA artifacts: ${ARTIFACTS}`);
    console.log(`QA summary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
}

await main();
