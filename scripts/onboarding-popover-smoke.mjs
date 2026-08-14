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
    createReaderSmokeSettings,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';
import { assertPopoverHeadwordMatchesLookup } from './lib/smoke-wait-helpers.mjs';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SETTINGS_COMPANION_PATH = path.join(DIST, 'greasyfork', 'yomu-settings-surface.user.js');
const UI_COPY_COMPANION_PATH = path.join(DIST, 'greasyfork', 'yomu-ui-copy.user.js');
const STUDY_APP_PATH = path.join(DIST, 'newtab', 'app.js');
const OFFHOST_PAGE_URL = 'https://onboarding-popover.example/article';
const STUDY_PAGE_URL = 'https://yomureader.com/study/';
const TARGETS = [
    { surface: '日本語', text: '日本[にほん]語[ご]', wordId: 1101, readingIndex: 0, pitchAccents: [0] },
    { surface: '使う', text: '使[つか]う', wordId: 1102, readingIndex: 0, pitchAccents: [0] },
];
const settings = createReaderSmokeSettings({
    onboardingSeen: false,
    learningTargetChosen: false,
    interfaceLanguage: 'ja',
    apiKey: '',
    // Exercise the empty-local-store path from the reported iPad lookup. A
    // working Jiten definition must not be interrupted by setup chrome.
    localDictionariesEnabled: true,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    subtitlePlayerEnabled: false,
    ocrEnabled: false,
    showPitchAccent: true,
    wordTextColorSource: 'pitch',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
});

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, SETTINGS_COMPANION_PATH, UI_COPY_COMPANION_PATH, STUDY_APP_PATH], ROOT, 'Run npm run build first.');

const requests = [];
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1200, height: 860 },
        deviceScaleFactor: 1,
    });
    const offhostState = await assertOffhostLauncher(context, requests);
    const page = await context.newPage();
    await prepareSmokePage(page, requests, 'study');
    await page.goto(STUDY_PAGE_URL, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, STUDY_APP_PATH);

    await page.waitForSelector('.jpdb-reader-onboarding', { state: 'visible', timeout: 10_000 });
    const targetLanguage = page.locator('.jpdb-reader-onboarding select[name="targetLanguage"]');
    assert(await targetLanguage.inputValue() === '', 'Fresh onboarding silently selected a learning target');
    await targetLanguage.selectOption('ja');
    await page.locator('input[name="onboardingInstallOfflineDictionaries"]').uncheck();
    await page.waitForSelector('.jpdb-reader-onboarding .jpdb-reader-word', { timeout: 15_000 });
    const welcomeWords = await page.locator('.jpdb-reader-onboarding .jpdb-reader-word').count();
    const word = page.locator('.jpdb-reader-onboarding .jpdb-reader-word', { hasText: '日本語' }).first();
    assert(await word.count() === 1, 'Welcome panel did not render 日本語 as a reader word', { welcomeWords });
    const onboardingState = await page.evaluate(() => {
        // :scope keeps the queries on the li's own title/body pair — the panel's
        // interactive-word parse nests word spans inside <strong>, so a bare
        // 'span' query would return the scanned title instead of the body copy.
        const features = Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li')).map(item => ({
            title: item.querySelector(':scope > strong')?.textContent?.trim() ?? '',
            copy: item.querySelector(':scope > span')?.textContent?.trim() ?? '',
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

    // Visual QA artifacts: the welcome panel at desktop and narrow widths.
    await page.locator('.jpdb-reader-onboarding').screenshot({ path: path.join(ARTIFACTS, 'onboarding-welcome-panel.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(ARTIFACTS, 'onboarding-welcome-panel-narrow.png') });
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(250);

    await word.click();
    await page.waitForFunction(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        return popover && getComputedStyle(popover).display !== 'none' && /日本語/.test(popover.textContent ?? '');
    }, null, { timeout: 8_000 });

    await assertPopoverHeadwordMatchesLookup(page, word, { label: 'welcome word' });
    const popoverText = (await page.locator('.jpdb-reader-popover').innerText()).trim();
    assert(popoverText.includes('日本語'), 'Welcome word click opened a popover without the clicked word', { popoverText });
    assert(popoverText.includes('JITEN') && popoverText.includes('smoke definition'), 'Welcome word click did not render the working Jiten definition', { popoverText });
    assert(!await page.locator('[data-yomu-finish-setup]').count(), 'Working remote definition was interrupted by repeated dictionary setup chrome', { popoverText });
    const lookupScreenshot = path.join(ARTIFACTS, 'onboarding-popover-empty-local-store-ipad.png');
    await page.screenshot({ path: lookupScreenshot, fullPage: false });

    await page.locator('.jpdb-reader-backdrop').last().click({ position: { x: 1, y: 1 } });
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
        offhostState,
        welcomeWords,
        popoverPreview: popoverText.slice(0, 160),
        actionState,
        jitenParseRequests: requests.filter(request => request.kind === 'jiten-parse').length,
        jitenDetailRequests: requests.filter(request => request.kind === 'jiten-detail').length,
        lookupScreenshot,
        screenshot: path.join(ARTIFACTS, 'onboarding-popover-smoke.png'),
    };
    await page.screenshot({ path: report.screenshot, fullPage: false });
    writeFileSync(path.join(ARTIFACTS, 'onboarding-popover-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    await context.close();
} finally {
    await browser.close().catch(() => undefined);
}

async function assertOffhostLauncher(context, requestsLog) {
    const page = await context.newPage();
    await prepareSmokePage(page, requestsLog, 'offhost');
    await page.goto(OFFHOST_PAGE_URL, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SETTINGS_COMPANION_PATH);
    await addScriptTagWithCspFallback(page, UI_COPY_COMPANION_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);

    const launcher = page.locator('.jpdb-reader-onboarding-trusted-launcher');
    await launcher.waitFor({ state: 'visible', timeout: 10_000 });
    const state = await launcher.evaluate(panel => ({
        sensitiveControlCount: panel.querySelectorAll('form, input, select, textarea, output').length,
        hasOpenStudyAction: Boolean(panel.querySelector('[data-onboarding-action="open-trusted-setup"]')),
        hasFullChooser: Boolean(panel.querySelector('select[name="targetLanguage"]')),
    }));
    assert(state.sensitiveControlCount === 0, 'Off-host onboarding exposed sensitive controls', state);
    assert(state.hasOpenStudyAction && !state.hasFullChooser, 'Off-host onboarding did not remain a Study-only launcher', state);
    await launcher.screenshot({ path: path.join(ARTIFACTS, 'onboarding-offhost-study-launcher.png') });
    await page.close();
    return state;
}

async function prepareSmokePage(page, requestsLog, label) {
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error(`[onboarding-popover:${label}]`, message.type(), message.text().slice(0, 300)));
        page.on('pageerror', error => console.error(`[onboarding-popover:${label} pageerror]`, error.message.slice(0, 300)));
    }
    await page.exposeFunction('__yomuOnboardingSmokeRequest', request => handleYomuRequest(request, requestsLog));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuOnboardingSmokeRequest',
    });
    await installRoutes(page, requestsLog);
}

async function installRoutes(page, requestsLog) {
    await page.route('https://**/*', route => {
        requestsLog.push({ kind: 'blocked', url: route.request().url() });
        return route.abort();
    });
    await page.route('https://api.jiten.moe/api/**', route => {
        const response = respondToJitenRequest(route.request().url(), requestsLog);
        return route.fulfill({
            status: response.status,
            body: response.responseText,
            contentType: response.contentType,
            headers: { 'access-control-allow-origin': '*' },
        });
    });
    await page.route(OFFHOST_PAGE_URL, route => route.fulfill({
        status: 200,
        body: readerFixtureHtml(),
        contentType: 'text/html; charset=utf-8',
    }));
    await page.route(STUDY_PAGE_URL, route => route.fulfill({
        status: 200,
        body: readerFixtureHtml(),
        contentType: 'text/html; charset=utf-8',
    }));
}

function handleYomuRequest(request, requestsLog) {
    if (request.url.startsWith('https://api.jiten.moe/api/')) return respondToJitenRequest(request.url, requestsLog);
    requestsLog.push({ kind: 'blocked-gm', url: request.url });
    return { status: 404, responseText: '', contentType: 'text/plain' };
}

function respondToJitenRequest(urlString, requestsLog) {
    const url = new URL(urlString);
    if (url.pathname.endsWith('/vocabulary/parse')) return fixtureParseResponse(url, requestsLog);
    const detail = url.pathname.match(/\/vocabulary\/(\d+)\/(\d+)\/info$/u);
    if (detail) return fixtureDetailResponse(Number(detail[1]), Number(detail[2]), requestsLog);
    requestsLog.push({ kind: 'unexpected-jiten', url: urlString });
    return { status: 404, responseText: '{}', contentType: 'application/json; charset=utf-8' };
}

function fixtureParseResponse(url, requestsLog) {
    const text = url.searchParams.get('text') || '';
    const words = parsedFixtureWords(text);
    requestsLog.push({ kind: 'jiten-parse', text, surfaces: words.map(word => word.originalText) });
    return jsonHttpResponse(words);
}

function fixtureDetailResponse(wordId, readingIndex, requestsLog) {
    const target = TARGETS.find(candidate => candidate.wordId === wordId);
    requestsLog.push({ kind: 'jiten-detail', wordId, readingIndex });
    return jsonHttpResponse(jitenDetail(target));
}

function parsedFixtureWords(text) {
    return TARGETS.flatMap(target => [...text.matchAll(new RegExp(target.surface, 'gu'))].map(match => ({
        offset: match.index,
        wordId: target.wordId,
        readingIndex: target.readingIndex,
        originalText: target.surface,
    })))
        .sort((left, right) => left.offset - right.offset)
        .map(({ offset: _offset, ...word }) => word);
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
