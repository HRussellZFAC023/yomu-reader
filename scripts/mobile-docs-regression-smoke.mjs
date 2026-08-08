#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createFixtureServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    routeMockedHttpRequests,
    serveFile,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(import.meta.dirname);

const SETTINGS_KEY = YOMU_SETTINGS_KEY;
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const DOCS_PATH = '/docs-try-me.html';
const MOBILE_CONTEXT_OPTIONS = { ...devices['iPhone 13'] };
const MOBILE_VIEWPORT = MOBILE_CONTEXT_OPTIONS.viewport;
const TRY_ME_LABEL = 'Try me';
const TRY_ME_SENTENCE = '今日は静かな喫茶店で新しい本を読みました。音声や色も見えます。';
const TRY_ME_TARGET_EXPRESSION = '喫茶店';
const BUILT_ARTIFACTS = [
    SCRIPT_PATH,
    CSS_PATH,
    ...userscriptCompanionPaths(SCRIPT_PATH),
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
];
const STATIC_CONTENT_TYPES = new Map([
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
]);

const docsSettings = {
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'en',
    jpdbDefinitionsEnabled: true,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 120,
    popupActivationMode: 'click',
    showFloatingButton: true,
    showFurigana: true,
    showPitchAccent: true,
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'jpdb',
    popupMode: 'auto',
    enableLogging: false,
};

const noApiNewTabSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabEnabled: true,
    newTabAnkiEnabled: false,
    newTabSource: 'auto',
    jpdbMiningEnabled: false,
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    showFloatingButton: false,
    enableLogging: false,
};

const docsVocabulary = [
    ['青空', '青空', 'あおぞら', 'blue sky', ['n'], 4500, ['known'], ['LHHH']],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['learning'], ['LHHH']],
    ['読む', '読む', 'よむ', 'read', ['v5m'], 500, ['known'], ['LH']],
    ['今日は', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']],
    ['静かな', '静か', 'しずか', 'quiet', ['na-adj'], 700, ['new'], ['LHH']],
    ['喫茶店', '喫茶店', 'きっさてん', 'coffee shop', ['n'], 1800, ['due'], ['LHHH']],
    ['新しい', '新しい', 'あたらしい', 'new', ['adj-i'], 650, ['learning'], ['LHHHH']],
    ['本', '本', 'ほん', 'book', ['n'], 200, ['known'], ['LH']],
    ['読みました', '読む', 'よみました', 'read', ['v5m'], 500, ['known'], ['LH']],
    ['音声', '音声', 'おんせい', 'audio', ['n'], 1200, ['new'], ['LHHH']],
    ['色', '色', 'いろ', 'color', ['n'], 900, ['learning'], ['LH']],
    ['見えます', '見える', 'みえます', 'be visible', ['v1'], 1100, ['due'], ['LHH']],
];

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT, 'Run npm run build first.');

const fixture = await createFixtureServer(handleFixtureRequest, 'Could not bind mobile/docs smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const docs = await runDocsTryMeSmoke(browser, fixture);
    const mobileSettings = await runMobileSettingsSmoke(browser, fixture);
    const newtab = await runMobileNewTabFallbackSmoke(browser, fixture);
    const report = { ok: true, docs, mobileSettings, newtab };
    writeFileSync(path.join(ARTIFACTS, 'mobile-docs-regression-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, fixture.server);
}

function handleFixtureRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = fixtureRoute(url.pathname);
    if (route) return route(url, response);
    serveNotFound(response);
}

function fixtureRoute(pathname) {
    const exactRoute = exactFixtureRoute(pathname);
    if (exactRoute) return exactRoute;
    if (pathname.startsWith('/newtab/')) return serveNewTabAsset;
    return null;
}

function exactFixtureRoute(pathname) {
    return new Map([
        [DOCS_PATH, (_url, response) => serveDocsFixture(response)],
        ['/newtab', (_url, response) => serveNewTabIndex(response)],
        ['/newtab/', (_url, response) => serveNewTabIndex(response)],
        ['/newtab/index.html', (_url, response) => serveNewTabIndex(response)],
        ['/yomu-icon.svg', (_url, response) => serveOptionalFile(response, path.join(ROOT, 'dist', 'yomu-icon.svg'), 'image/svg+xml')],
    ]).get(pathname) ?? null;
}

function serveDocsFixture(response) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="ja" data-yomu-annotation-scope="surface">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>よむ docs regression smoke</title>
  <style>
    :root { --vp-c-text-1: #f4f7fb; --vp-c-text-2: #b7c0cc; --jpdb-reader-hover: rgba(255,255,255,.12); }
    body { margin: 0; min-height: 100vh; background: #2f3a40; color: var(--vp-c-text-1); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 960px; margin: 0 auto; padding: 42px 20px 120px; }
    .vp-doc { display: grid; gap: 18px; }
    .vp-doc p { margin: 0; color: var(--vp-c-text-2); font-size: 17px; line-height: 1.75; }
    .yomu-demo { display: grid; gap: 18px; margin-top: 32px; }
    .yomu-demo-copy { display: grid; gap: 14px; }
    .yomu-demo-copy h2 { margin: 0; color: var(--vp-c-text-1); font-size: 24px; }
    .yomu-try-me-text { display: grid; gap: 12px; border-radius: 8px; background: #181b20; padding: 24px; }
    .yomu-try-me-text h3 { min-width: 0; max-width: 100%; margin: 0; color: var(--vp-c-text-2); font-size: 22px; line-height: 1.35; overflow-wrap: anywhere; }
    .yomu-try-me-text p { min-width: 0; max-width: 100%; margin: 0; color: var(--vp-c-text-2); font-size: 17px; line-height: 1.7; overflow-wrap: anywhere; }
    .yomu-demo .jpdb-reader-word { display: inline; min-width: 0; min-height: 0; padding: 0; line-height: inherit; vertical-align: baseline; white-space: nowrap !important; word-break: keep-all !important; overflow-wrap: normal !important; }
  </style>
</head>
<body>
  <main>
    <article class="vp-doc">
      <p data-smoke-docs-text>日本語の文章を読むと音声と色が見えます。</p>
      <section class="yomu-demo" aria-labelledby="yomu-demo-title">
        <div class="yomu-demo-copy">
          <h2 id="yomu-demo-title">Look up words without leaving the sentence</h2>
          <div class="yomu-try-me-text" data-yomu-furigana-mode="all" data-yomu-runtime-surface>
            <p class="yomu-try-me-label">${TRY_ME_LABEL}</p>
            <p data-smoke-try-me-sentence>${TRY_ME_SENTENCE}</p>
          </div>
          <p>今日は静かな喫茶店で新しい本を読みました。</p>
        </div>
      </section>
    </article>
  </main>
</body>
</html>`);
}

function serveNewTabIndex(response) {
    serveFile(response, path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8');
}

function serveNewTabAsset(url, response) {
    const filePath = path.join(NEWTAB_DIR, url.pathname.slice('/newtab/'.length));
    if (serveOptionalFile(response, filePath, contentTypeForFile(filePath))) return;
    serveNotFound(response);
}

function serveOptionalFile(response, filePath, contentType) {
    if (!existsSync(filePath)) return false;
    serveFile(response, filePath, contentType);
    return true;
}

function serveNotFound(response) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function contentTypeForFile(filePath) {
    return [...STATIC_CONTENT_TYPES].find(([extension]) => filePath.endsWith(extension))?.[1]
        ?? 'application/octet-stream';
}

async function runDocsTryMeSmoke(browser, fixtureServer) {
    const requests = [];
    const { context, page } = await newSmokeContextPage(browser, docsSettings, MOBILE_VIEWPORT, requests, MOBILE_CONTEXT_OPTIONS);
    try {
        await loadDocsPageWithYomu(page, fixtureServer);
        await page.waitForFunction(targetExpression => {
            const words = [...document.querySelectorAll('.yomu-demo .yomu-try-me-text [data-smoke-try-me-sentence] .jpdb-reader-word')];
            return words.length >= 5 && words.some(word => word.getAttribute('data-expression') === targetExpression);
        }, TRY_ME_TARGET_EXPRESSION, { timeout: 12_000 });

        const snapshot = await page.evaluate(docsTryMeSnapshotFromDom, TRY_ME_TARGET_EXPRESSION);
        assertMobileTouchEnvironment(snapshot.environment);
        assert(snapshot.docs.summary.count === 0, 'Docs prose was annotated outside the declared Reader Surface', snapshot.docs);
        assertParsedSurface(snapshot.tryMe, 'Try me text');
        assertTryMeFixtureSnapshot(snapshot);

        await page.screenshot({ path: path.join(ARTIFACTS, 'mobile-docs-try-me-smoke.png'), fullPage: false });
        return {
            docs: snapshot.docs.summary,
            tryMe: snapshot.tryMe.summary,
            jpdbEndpoints: requests.filter(request => request.kind === 'jpdb').map(request => request.endpoint),
        };
    } finally {
        await context.close();
    }
}

async function runMobileSettingsSmoke(browser, fixtureServer) {
    const requests = [];
    const { context, page } = await newSmokeContextPage(browser, docsSettings, MOBILE_VIEWPORT, requests, MOBILE_CONTEXT_OPTIONS);
    try {
        await loadDocsPageWithYomu(page, fixtureServer, '?mobile-settings=1');
        await page.waitForSelector('.jpdb-reader-fab', { timeout: 8_000 });
        const puck = await page.evaluate(visiblePuckSnapshotFromDom);
        assert(puck.visible, 'Mobile settings puck was not visible on first install settings', puck);

        await page.locator('.jpdb-reader-fab').tap();
        await page.waitForSelector('.jpdb-reader-fab-radial [data-radial-id="settings"]', { timeout: 8_000 });
        await page.locator('.jpdb-reader-fab-radial [data-radial-id="settings"]').tap();
        await page.waitForSelector('.jpdb-reader-settings', { timeout: 8_000 });
        assert(await page.locator('.jpdb-reader-quick').count() === 0, 'Mobile puck settings action opened removed quick controls instead of settings');

        const form = await page.evaluate(mobileSettingsSnapshotFromDom);
        assert(form.riskyControls.length === 0, 'Mobile settings have controls below 16px and may trigger iOS zoom', form);
        assert(form.parsedSettingsWords >= 1, 'Settings dialog no longer exposes parseable reader-word content for AJATT-style ruby', form);
        assert(form.visualViewportScaleStable, 'Focusing a settings input changed visual viewport scale in mobile smoke', form);

        await page.screenshot({ path: path.join(ARTIFACTS, 'mobile-settings-puck-smoke.png'), fullPage: false });
        return { puck, controlCount: form.controlCount, parsedSettingsWords: form.parsedSettingsWords };
    } finally {
        await context.close();
    }
}

async function loadDocsPageWithYomu(page, fixtureServer, search = '') {
    await page.goto(`${fixtureServer.origin}${DOCS_PATH}${search}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
}

async function runMobileNewTabFallbackSmoke(browser, fixtureServer) {
    const context = await browser.newContext({
        bypassCSP: true,
        ...MOBILE_CONTEXT_OPTIONS,
    });
    const page = await context.newPage();
    const requests = [];
    await page.exposeFunction('__yomuMobileNewTabSmokeRequest', request => mockedNewTabRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: noApiNewTabSettings,
        requestBridgeName: '__yomuMobileNewTabSmokeRequest',
    });
    await page.route('https://jpdb.io/**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body><main></main></body></html>',
    }));
    try {
        await page.goto(`${fixtureServer.origin}/newtab/index.html?mobile-fallback=${Date.now()}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { timeout: 12_000 });
        await page.waitForFunction(newTabFallbackReadyFromDom, null, { timeout: 12_000 });

        const snapshot = await page.evaluate(newTabMobileSnapshotFromDom);
        assert(snapshot.hasCard, 'No-API/no-Anki newtab did not render a fallback card', snapshot);
        assert(/[一-龯ぁ-んァ-ン]/u.test(snapshot.prompt), 'No-API/no-Anki fallback prompt is not a Japanese study word', snapshot);
        assert(!/No review cards ready|No cards|Add dictionary|Start with a dictionary|Loading words/i.test(snapshot.body), 'No-API/no-Anki fallback regressed to setup/empty/loading copy', snapshot);
        assert(!snapshot.layout.overlaps.length, 'Newtab mobile tabs overlap brand or controls', snapshot.layout);
        assert(snapshot.layout.modeButtons.every(button => button.visible && button.width >= 44 && button.height >= 44), 'Study app navigation targets are cramped or hidden', snapshot.layout);
        assert(snapshot.layout.modeButtons.some(button => /学習|単語帳|統計|連携/u.test(button.text)), 'Study app navigation did not localize in Japanese mode', snapshot.layout);

        await page.screenshot({ path: path.join(ARTIFACTS, 'mobile-newtab-fallback-smoke.png'), fullPage: false });
        return {
            prompt: snapshot.prompt,
            status: snapshot.status,
            layout: snapshot.layout,
            requests,
        };
    } finally {
        await context.close();
    }
}

async function newSmokeContextPage(browser, settings, viewport, requests, contextOptions = {}) {
    const context = await browser.newContext({
        bypassCSP: true,
        viewport,
        deviceScaleFactor: contextOptions.isMobile ? 2 : 1,
        ...contextOptions,
    });
    const page = await context.newPage();
    await routeMockedHttpRequests(page, {
        requests,
        mockHttpRequest: mockedDocsRequest,
        isMockedApiOrigin: url => url.origin === JPDB_API_ORIGIN && url.pathname.startsWith(JPDB_API_PREFIX),
    });
    await page.exposeFunction('__yomuMobileDocsSmokeRequest', request => mockedDocsRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuMobileDocsSmokeRequest',
    });
    return { context, page };
}

function mockedDocsRequest(request, requests) {
    const url = new URL(request.url);
    if (url.origin !== JPDB_API_ORIGIN || !url.pathname.startsWith(JPDB_API_PREFIX)) return null;
    const endpoint = url.pathname.slice(JPDB_API_PREFIX.length);
    const body = readRequestJson(request.data);
    const handler = mockedDocsResponseHandlers(body)[endpoint];
    requests.push({ kind: 'jpdb', endpoint, body });
    return jsonHttpResponse(handler ? handler() : {});
}

function mockedDocsResponseHandlers(body) {
    return {
        parse: () => mockJpdbParseFromVocabulary(body, docsVocabulary),
        'deck/list-vocabulary': () => ({ vocabulary: [] }),
        'list-user-decks': () => ({ decks: [] }),
    };
}

function mockedNewTabRequest(request, requests) {
    const url = new URL(request.url);
    requests.push({ method: request.method ?? 'GET', url: request.url });
    if (url.origin === JPDB_API_ORIGIN) return {
        status: 200,
        responseText: '<!doctype html><html><body><main></main></body></html>',
        bytes: [...Buffer.from('<!doctype html><html><body><main></main></body></html>')],
        contentType: 'text/html; charset=utf-8',
    };
    throw new Error(`Unexpected mobile newtab smoke request: ${request.method ?? 'GET'} ${request.url}`);
}

function readRequestJson(data) {
    if (!data) return {};
    if (typeof data === 'string') return JSON.parse(data);
    if (isArrayBufferRequestBody(data)) return readArrayBufferRequestJson(data);
    return data;
}

function isArrayBufferRequestBody(data) {
    return data.kind === 'arraybuffer';
}

function readArrayBufferRequestJson(data) {
    return JSON.parse(Buffer.from(data.bytes ?? []).toString('utf8'));
}

function docsTryMeSnapshotFromDom(targetExpression) {
    const tryMeRoot = document.querySelector('.yomu-demo .yomu-try-me-text');
    const tryMeSentence = tryMeRoot?.querySelector('[data-smoke-try-me-sentence]');
    return {
        rootClasses: document.documentElement.className,
        environment: mobileEnvironmentSnapshot(),
        docs: surfaceSnapshot(document.querySelector('[data-smoke-docs-text]')),
        tryMe: {
            label: normalizedText(tryMeRoot?.querySelector('.yomu-try-me-label')),
            sentence: textWithoutAnnotations(tryMeSentence),
            ...surfaceSnapshot(tryMeRoot),
            fixtureWord: fixtureWordSnapshot(targetExpression),
        },
    };

    function surfaceSnapshot(root) {
        const words = [...(root?.querySelectorAll('.jpdb-reader-word') ?? [])];
        return {
            summary: {
                count: words.length,
                rubyCount: root?.querySelectorAll('ruby,rt,.jpdb-reader-furi,.jpdb-reader-ruby').length ?? 0,
                pitchCount: words.filter(word => wordClass(word, /^jpdb-pitch-/)).length,
                statusCount: words.filter(word => wordClass(word, /^(?:jpdb-(?:known|learning|due|new|never-forget|failed|locked|not-in-deck)|anki-)/)).length,
                sourceMode: sourceModeClasses(),
                rubyClearance: rubyClearanceSnapshot(words),
                highlightBlock: highlightBlockSnapshot(words),
            },
            words: words.map(word => ({
                text: compactText(word),
                expression: word.getAttribute('data-expression') ?? '',
                reading: word.getAttribute('data-reading') ?? '',
                classes: [...word.classList],
                color: getComputedStyle(word).color,
                display: getComputedStyle(word).display,
                whiteSpace: getComputedStyle(word).whiteSpace,
            })).slice(0, 12),
        };
    }

    function rubyClearanceSnapshot(words) {
        const measures = words
            .filter(word => word.classList.contains('jpdb-reader-has-furi'))
            .map(word => {
                const style = getComputedStyle(word);
                const fontSize = Number.parseFloat(style.fontSize) || 0;
                const lineHeight = Number.parseFloat(style.lineHeight) || 0;
                return {
                    text: compactText(word),
                    fontSize: rounded(fontSize),
                    lineHeight: rounded(lineHeight),
                    ratio: fontSize > 0 ? rounded(lineHeight / fontSize) : 0,
                };
            });
        const ratios = measures.map(measure => measure.ratio).filter(Boolean);
        return {
            minRatio: ratios.length ? Math.min(...ratios) : 0,
            measures: measures.slice(0, 8),
        };
    }

    function highlightBlockSnapshot(words) {
        const measures = words
            .map(word => {
                const style = getComputedStyle(word);
                const fontSize = Number.parseFloat(style.fontSize) || 0;
                const lineHeight = Number.parseFloat(style.lineHeight) || 0;
                const blockSize = cssLengthPx(style.getPropertyValue('--jpdb-reader-word-highlight-block-size'), fontSize);
                return {
                    text: compactText(word),
                    fontSize: rounded(fontSize),
                    lineHeight: rounded(lineHeight),
                    blockSize: rounded(blockSize),
                    blockToFontRatio: fontSize > 0 ? rounded(blockSize / fontSize) : 0,
                    blockToLineRatio: lineHeight > 0 ? rounded(blockSize / lineHeight) : 0,
                    backgroundSize: style.backgroundSize,
                };
            })
            .filter(measure => measure.blockSize > 0);
        const blockToFontRatios = measures.map(measure => measure.blockToFontRatio).filter(Boolean);
        return {
            maxBlockToFontRatio: blockToFontRatios.length ? Math.max(...blockToFontRatios) : 0,
            measures: measures.slice(0, 8),
        };
    }

    function fixtureWordSnapshot(expression) {
        const word = [...document.querySelectorAll('.yomu-demo .yomu-try-me-text [data-smoke-try-me-sentence] .jpdb-reader-word')]
            .find(item => item.getAttribute('data-expression') === expression);
        if (!word) return null;
        const rect = word.getBoundingClientRect();
        const hit = readerWordAtCenter(word);
        return {
            text: compactText(word),
            expression: word.getAttribute('data-expression') ?? '',
            pointExpression: hit?.getAttribute('data-expression') ?? '',
            display: getComputedStyle(word).display,
            whiteSpace: getComputedStyle(word).whiteSpace,
            rect: rectSnapshot(rect),
        };
    }

    function readerWordAtCenter(word) {
        const rect = word.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        return document.elementFromPoint(x, y)?.closest?.('.jpdb-reader-word');
    }

    function rectSnapshot(rect) {
        return {
            x: Math.round(rect.x * 100) / 100,
            y: Math.round(rect.y * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            top: Math.round(rect.top * 100) / 100,
            bottom: Math.round(rect.bottom * 100) / 100,
        };
    }

    function sourceModeClasses() {
        return [...document.documentElement.classList].filter(className => /^jpdb-reader-word-(?:text|highlight|underline)-/.test(className));
    }

    function cssLengthPx(value, fontSize) {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        if (trimmed.endsWith('em')) return (Number.parseFloat(trimmed) || 0) * fontSize;
        return Number.parseFloat(trimmed) || 0;
    }

    function wordClass(word, pattern) {
        return [...word.classList].some(className => pattern.test(className));
    }

    function compactText(node) {
        return node.textContent?.replace(/\s+/g, '').trim() ?? '';
    }

    function normalizedText(node) {
        return node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function textWithoutAnnotations(node) {
        if (!node) return '';
        const parts = [];
        collectText(node);
        return parts.join('').replace(/\s+/g, '').trim();

        function collectText(current) {
            if (current.nodeType === Node.TEXT_NODE) {
                parts.push(current.textContent ?? '');
                return;
            }
            if (current.nodeType !== Node.ELEMENT_NODE) return;
            if (current.matches('rt,rp,.jpdb-reader-furi,.jpdb-ocr-furi')) return;
            current.childNodes.forEach(collectText);
        }
    }

    function mobileEnvironmentSnapshot() {
        return {
            maxTouchPoints: navigator.maxTouchPoints,
            coarsePointer: matchMedia('(pointer: coarse)').matches,
            viewport: {
                width: innerWidth,
                height: innerHeight,
            },
            userAgent: navigator.userAgent,
        };
    }

    function rounded(value) {
        return Math.round(value * 100) / 100;
    }
}

function assertParsedSurface(surface, label) {
    assert(surface.summary.count >= 3, `${label} did not render enough reader words`, surface);
    assert(surface.summary.rubyCount >= 1, `${label} did not render ruby/furigana`, surface);
    assert(surface.summary.pitchCount >= 1, `${label} did not render pitch classes`, surface);
    assert(surface.summary.statusCount >= 1, `${label} did not render status classes`, surface);
    assert(surface.summary.sourceMode.length >= 2, `${label} did not enable color/source mode classes`, surface);
    assert(surface.summary.rubyClearance.minRatio >= 2, `${label} furigana line-height is too tight and can clip on mobile Safari`, surface.summary.rubyClearance);
    assert(surface.summary.highlightBlock.maxBlockToFontRatio <= 1.2, `${label} reader-word highlight block grew with ruby line-height`, surface.summary.highlightBlock);
}

function assertMobileTouchEnvironment(environment) {
    assert(environment.maxTouchPoints >= 1, 'Docs Try me smoke did not run with touch input enabled', environment);
    assert(environment.coarsePointer, 'Docs Try me smoke did not expose a coarse pointer', environment);
    assert(environment.viewport.width === MOBILE_VIEWPORT.width, 'Docs Try me smoke did not use the expected mobile viewport width', environment);
}

function assertTryMeFixtureSnapshot(snapshot) {
    const tryMe = snapshot.tryMe;
    assert(compactLabel(tryMe.label) === compactLabel(TRY_ME_LABEL), `Try me label changed from ${JSON.stringify(TRY_ME_LABEL)}`, tryMe);
    assert(tryMe.sentence === TRY_ME_SENTENCE, 'Try me sentence no longer matches the homepage fixture', tryMe);
    assert(tryMe.sentence.includes(TRY_ME_TARGET_EXPRESSION), `Try me sentence is missing ${TRY_ME_TARGET_EXPRESSION}`, tryMe);

    const fixtureWord = snapshot.tryMe.fixtureWord;
    assert(fixtureWord, `Try me ${TRY_ME_TARGET_EXPRESSION} was not a normal reader-word lookup target`, snapshot);
    assert(fixtureWord.expression === TRY_ME_TARGET_EXPRESSION, `Try me ${TRY_ME_TARGET_EXPRESSION} lost its expression metadata`, fixtureWord);
    assert(fixtureWord.pointExpression === TRY_ME_TARGET_EXPRESSION, `Try me hit target is missing the ${TRY_ME_TARGET_EXPRESSION} reader word`, fixtureWord);
    assert(fixtureWord.display === 'inline', 'Try me reader word did not keep inline docs layout', fixtureWord);
    assert(fixtureWord.whiteSpace === 'nowrap', 'Try me reader word inherited wrapping that can move the hitbox', fixtureWord);
    assert(fixtureWord.rect.width < 112, `Try me ${TRY_ME_TARGET_EXPRESSION} highlight is visually bloated`, fixtureWord);
}

function compactLabel(value) {
    return String(value ?? '').replace(/\s+/g, '');
}

function visiblePuckSnapshotFromDom() {
    const puck = document.querySelector('.jpdb-reader-fab');
    const rect = puck?.getBoundingClientRect() ?? null;
    const style = puck ? getComputedStyle(puck) : null;
    return {
        exists: hasPuck(puck),
        visible: isVisibleSnapshot(rect, style),
        text: puckText(puck),
        rect: rectSnapshotOrNull(rect),
        position: stylePosition(style),
    };

    function hasPuck(puck) {
        return Boolean(puck);
    }

    // fallow-ignore-next-line complexity
    function isVisibleSnapshot(rect, style) {
        return Boolean(rect && style)
            && rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';
    }

    function puckText(puck) {
        return puck ? puck.textContent ?? '' : '';
    }

    function rectSnapshotOrNull(rect) {
        return rect ? rectSnapshot(rect) : null;
    }

    function stylePosition(style) {
        return style ? style.position : '';
    }

    function rectSnapshot(rect) {
        return ['x', 'y', 'width', 'height', 'left', 'right', 'top', 'bottom'].reduce((snapshot, key) => {
            snapshot[key] = roundRectValue(rect[key]);
            return snapshot;
        }, {});
    }

    function roundRectValue(value) {
        return Math.round(value * 100) / 100;
    }
}

// Browser-serialized DOM snapshot must stay self-contained for page.evaluate.
// fallow-ignore-next-line complexity
async function mobileSettingsSnapshotFromDom() {
    const controls = [...document.querySelectorAll('.jpdb-reader-settings input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="hidden"]):not([type="file"]), .jpdb-reader-settings select, .jpdb-reader-settings textarea')];
    const riskyControls = controls
        .map(control => ({
            tag: control.tagName,
            name: control.getAttribute('name') ?? '',
            type: control.getAttribute('type') ?? '',
            fontSize: Number.parseFloat(getComputedStyle(control).fontSize),
            visible: isVisible(control),
        }))
        .filter(control => control.visible && control.fontSize < 16);
    const scaleBefore = window.visualViewport?.scale ?? 1;
    const first = controls.find(isVisible);
    first?.focus();
    await new Promise(resolve => window.setTimeout(resolve, 80));
    const scaleAfter = window.visualViewport?.scale ?? scaleBefore;
    return {
        controlCount: controls.filter(isVisible).length,
        riskyControls,
        visualViewportScaleBefore: scaleBefore,
        visualViewportScaleAfter: scaleAfter,
        visualViewportScaleStable: Math.abs(scaleAfter - scaleBefore) < 0.01,
        parsedSettingsWords: document.querySelectorAll('.jpdb-reader-settings .jpdb-reader-word').length,
    };

    // fallow-ignore-next-line complexity
    function isVisible(element) {
        if (!(element instanceof Element)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';
    }
}

function newTabFallbackReadyFromDom() {
    const prompt = document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '';
    const body = document.body.textContent ?? '';
    return [
        hasNewTabCard(),
        hasJapaneseText(prompt),
        !hasNewTabEmptyStateText(body),
    ].every(Boolean);

    function hasNewTabCard() {
        return Boolean(document.querySelector('[data-newtab-card]'));
    }

    function hasJapaneseText(text) {
        return /[一-龯ぁ-んァ-ン]/u.test(text);
    }

    function hasNewTabEmptyStateText(text) {
        return /Loading words|Loading\.\.\.|No review cards ready|Start with a dictionary|Add dictionary/i.test(text);
    }
}

function newTabMobileSnapshotFromDom() {
    const roundRectValue = value => Math.round(value * 100) / 100;
    const rectSnapshot = rect => ({
        x: roundRectValue(rect.x),
        y: roundRectValue(rect.y),
        width: roundRectValue(rect.width),
        height: roundRectValue(rect.height),
        left: roundRectValue(rect.left),
        right: roundRectValue(rect.right),
        top: roundRectValue(rect.top),
        bottom: roundRectValue(rect.bottom),
    });
    const elementRect = element => element ? rectSnapshot(element.getBoundingClientRect()) : null;
    const rectsOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const isVisibleRect = (rect, style) => hasVisibleBox(rect) && hasVisibleStyle(style);
    const newTabModeButtonSnapshot = button => {
        const rect = button.getBoundingClientRect();
        return {
            text: button.textContent?.trim() ?? '',
            visible: isVisibleRect(rect, getComputedStyle(button)),
            ...rectSnapshot(rect),
        };
    };
    const newTabMobileLayoutSnapshot = () => {
        const brandRect = elementRect(document.querySelector('.jpdb-reader-newtab-brand'));
        const modeRect = elementRect(document.querySelector('.jpdb-reader-newtab-app-nav'));
        const controlsRect = elementRect(document.querySelector('.jpdb-reader-newtab-theme-controls'));
        return {
            viewportWidth: innerWidth,
            brand: brandRect,
            mode: modeRect,
            controls: controlsRect,
            overlaps: [
                ['mode-brand', modeRect, brandRect],
                ['mode-controls', modeRect, controlsRect],
            ]
                .filter(([, first, second]) => first && second && rectsOverlap(first, second))
                .map(([label]) => label),
            modeButtons: [...document.querySelectorAll('.jpdb-reader-newtab-app-nav [data-newtab-action]')]
                .map(newTabModeButtonSnapshot),
        };
    };
    const hasVisibleBox = rect => rect.width > 0 && rect.height > 0;
    const hasVisibleStyle = style => style.display !== 'none' && style.visibility !== 'hidden';
    return {
        hasCard: Boolean(document.querySelector('[data-newtab-card]')),
        prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.trim() ?? '',
        status: document.querySelector('[data-newtab-status]')?.textContent?.trim() ?? '',
        body: document.body.textContent ?? '',
        layout: newTabMobileLayoutSnapshot(),
    };
}
