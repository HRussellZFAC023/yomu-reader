#!/usr/bin/env node
// Regression smoke: words rendered inside the first-run welcome panel must open
// the lookup popover, while onboarding action buttons keep their own behavior.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SETTINGS_COMPANION_PATH = path.join(DIST, 'greasyfork', 'yomu-settings-surface.user.js');
const UI_COPY_COMPANION_PATH = path.join(DIST, 'greasyfork', 'yomu-ui-copy.user.js');
const PAGE_PATH = '/onboarding-popover.html';
const TARGETS = [
    { surface: '日本語', text: '日本[にほん]語[ご]', wordId: 1101, readingIndex: 0, pitchAccents: [0] },
    { surface: '使う', text: '使[つか]う', wordId: 1102, readingIndex: 0, pitchAccents: [0] },
];
const TARGET_BY_WORD_ID = new Map(TARGETS.map(target => [target.wordId, target]));

const settings = {
    onboardingSeen: false,
    interfaceLanguage: 'ja',
    apiKey: '',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    subtitlePlayerEnabled: false,
    ocrEnabled: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'pitch',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, SETTINGS_COMPANION_PATH, UI_COPY_COMPANION_PATH], ROOT, 'Run npm run build first.');

const requests = [];
const server = await startLoopbackServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(readerFixtureHtml());
}, 'Could not bind onboarding popover smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1200, height: 860 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error('[onboarding-popover]', message.type(), message.text().slice(0, 300)));
        page.on('pageerror', error => console.error('[onboarding-popover pageerror]', error.message.slice(0, 300)));
    }
    await page.exposeFunction('__yomuOnboardingSmokeRequest', request => handleYomuRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuOnboardingSmokeRequest',
    });
    await installRoutes(page, requests);
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SETTINGS_COMPANION_PATH);
    // Onboarding copy lives in the ui-copy companion since the 1.6.10 split;
    // without it the panel renders raw i18n keys and the demo word never exists.
    await addScriptTagWithCspFallback(page, UI_COPY_COMPANION_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);

    await page.waitForSelector('.jpdb-reader-onboarding', { state: 'visible', timeout: 10_000 });
    await page.waitForSelector('.jpdb-reader-onboarding .jpdb-reader-word', { timeout: 15_000 });
    const welcomeWords = await page.locator('.jpdb-reader-onboarding .jpdb-reader-word').count();
    const word = page.locator('.jpdb-reader-onboarding .jpdb-reader-word', { hasText: '日本語' }).first();
    assert(await word.count() === 1, 'Welcome panel did not render 日本語 as a reader word', { welcomeWords });
    const onboardingState = await page.evaluate(() => {
        const features = Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li')).map(item => ({
            title: item.querySelector('strong')?.textContent?.trim() ?? '',
            copy: item.querySelector('span')?.textContent?.trim() ?? '',
        }));
        const hoverShortcut = document.querySelector('input[name="shortcuts.hoverLookup"]');
        return {
            features,
            hoverShortcutType: hoverShortcut?.getAttribute('type') ?? '',
            hoverShortcutPlaceholder: hoverShortcut?.getAttribute('placeholder') ?? '',
            hasImmersionGrid: Boolean(document.querySelector('.jpdb-reader-onboarding-immersion-grid')),
            hasCaptureShortcut: Boolean(document.querySelector('[name="shortcuts.captureScreen"], [data-onboarding-capture-shortcut]')),
        };
    });
    assert(onboardingState.features.length === 6, 'Welcome panel did not show the expected feature count', onboardingState);
    const hasGameFeature = onboardingState.features.some(feature => feature.title === 'Game'
        && feature.copy === 'Install the Yomu app to use in games or anywhere on the PC.')
        || onboardingState.features.some(feature => feature.title === 'ゲーム'
            && feature.copy === 'Yomuアプリをインストールすると、ゲームやPC上のどこでも使えます。');
    assert(hasGameFeature, 'Welcome panel did not show the Game feature', onboardingState);
    assert(onboardingState.hoverShortcutType === 'text'
        && /hover without a key|キーなしホバー/i.test(onboardingState.hoverShortcutPlaceholder)
        && onboardingState.hasImmersionGrid, 'Welcome panel did not show the hover modifier shortcut input', onboardingState);
    assert(!onboardingState.hasCaptureShortcut, 'Browser onboarding exposed a capture-screen shortcut that cannot work here', onboardingState);

    await word.click();
    await page.waitForFunction(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        return popover && getComputedStyle(popover).display !== 'none' && /日本語/.test(popover.textContent ?? '');
    }, null, { timeout: 8_000 });

    const popoverText = (await page.locator('.jpdb-reader-popover').innerText()).trim();
    assert(popoverText.includes('日本語'), 'Welcome word click opened a popover without the clicked word', { popoverText });

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 3_000 });

    const actionWord = page.locator('[data-onboarding-action="without-api"] .jpdb-reader-word').first();
    if (await actionWord.count()) {
        await actionWord.click();
    } else {
        await page.locator('[data-onboarding-action="without-api"]').click();
    }
    await page.waitForSelector('.jpdb-reader-settings', { state: 'visible', timeout: 8_000 });
    const actionState = await page.evaluate(key => {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            onboardingSeen: parsed.onboardingSeen === true,
            settingsVisible: Boolean(document.querySelector('.jpdb-reader-settings')),
            popoverVisible: Boolean(document.querySelector('.jpdb-reader-popover')),
        };
    }, YOMU_SETTINGS_KEY);
    assert(actionState.onboardingSeen && actionState.settingsVisible && !actionState.popoverVisible, 'Onboarding action word click did not open settings cleanly', actionState);

    const report = {
        ok: true,
        welcomeWords,
        popoverPreview: popoverText.slice(0, 160),
        actionState,
        jitenParseRequests: requests.filter(request => request.kind === 'jiten-parse').length,
        jitenDetailRequests: requests.filter(request => request.kind === 'jiten-detail').length,
        screenshot: path.join(ARTIFACTS, 'onboarding-popover-smoke.png'),
    };
    await page.screenshot({ path: report.screenshot, fullPage: false });
    writeFileSync(path.join(ARTIFACTS, 'onboarding-popover-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function installRoutes(page, requestsLog) {
    await page.route('https://**/*', route => {
        requestsLog.push({ kind: 'blocked', url: route.request().url() });
        return route.abort();
    });
    await page.route('https://api.jiten.moe/api/**', route => {
        const response = handleJitenUrl(route.request().url(), requestsLog);
        return route.fulfill({
            status: response.status,
            body: response.responseText,
            contentType: response.contentType,
            headers: { 'access-control-allow-origin': '*' },
        });
    });
}

function handleYomuRequest(request, requestsLog) {
    if (request.url.startsWith('https://api.jiten.moe/api/')) return handleJitenUrl(request.url, requestsLog);
    requestsLog.push({ kind: 'blocked-gm', url: request.url });
    return { status: 404, responseText: '', contentType: 'text/plain' };
}

function handleJitenUrl(urlString, requestsLog) {
    const url = new URL(urlString);
    if (url.pathname.endsWith('/vocabulary/parse')) {
        const text = url.searchParams.get('text') ?? '';
        const words = parseWordsForText(text);
        requestsLog.push({ kind: 'jiten-parse', text, surfaces: words.map(word => word.originalText) });
        return jsonHttpResponse(words);
    }
    const detail = url.pathname.match(/\/vocabulary\/(\d+)\/(\d+)\/info$/u);
    if (detail) {
        const wordId = Number(detail[1]);
        const target = TARGET_BY_WORD_ID.get(wordId);
        requestsLog.push({ kind: 'jiten-detail', wordId, readingIndex: Number(detail[2]) });
        return jsonHttpResponse(jitenDetail(target));
    }
    requestsLog.push({ kind: 'unexpected-jiten', url: urlString });
    return { status: 404, responseText: '{}', contentType: 'application/json; charset=utf-8' };
}

function parseWordsForText(text) {
    const words = [];
    for (let index = 0; index < text.length;) {
        const target = TARGETS.find(candidate => text.startsWith(candidate.surface, index));
        if (!target) {
            index += 1;
            continue;
        }
        words.push({
            wordId: target.wordId,
            readingIndex: target.readingIndex,
            originalText: target.surface,
        });
        index += target.surface.length;
    }
    return words;
}

function jitenDetail(target) {
    if (!target) return {};
    return {
        wordId: target.wordId,
        mainReading: { text: target.text, frequencyRank: 1000 + target.wordId },
        partsOfSpeech: ['n'],
        definitions: [{ meanings: [`${target.surface} smoke definition`], partsOfSpeech: ['noun'] }],
        pitchAccents: target.pitchAccents,
    };
}

function readerFixtureHtml() {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Onboarding popover smoke</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #f4f7fb; color: #213044; font: 18px/1.6 system-ui, sans-serif; }
    main { width: min(900px, calc(100vw - 48px)); margin: 72px auto; display: grid; gap: 18px; }
    h1 { margin: 0; font-size: 32px; }
    p { margin: 0; padding: 18px 20px; background: #fff; border: 1px solid #d9e1ec; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>日本語のページ</h1>
    <p>これは初回歓迎パネルのクリック回帰を確認するための日本語本文です。</p>
  </main>
</body>
</html>`;
}
