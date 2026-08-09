#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createYomuPaths } from './lib/paths.mjs';
import { assert, closeServer, createFixtureServer, launchSmokeBrowser, serveFile } from './lib/smoke-harness.mjs';
import {
    addScriptTagWithCspFallback,
    installUserscriptCssResource,
    userscriptCompanionPaths,
} from './lib/smoke-test-helpers.mjs';

const { appRoot: ROOT, qaArtifactsRoot: ARTIFACTS } = createYomuPaths(import.meta.dirname);
const SCRIPT_PATH = path.join(ROOT, 'dist', 'yomu.user.js');
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const COMPANION_SCRIPT_PATHS = userscriptCompanionPaths(SCRIPT_PATH);
const PUBLIC_DIR = path.join(ROOT, 'docs', 'public');
const VIDEO_PLAYER_PATH = path.join(ROOT, 'docs', 'public', 'video-player', 'index.html');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const OPEN_SETTINGS_EVENT = 'yomu-open-settings';
const JPDB_FONT_STACK = '"Nunito Sans", "Extra Sans JP", "Noto Sans Symbols2", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans GB", "Meiryo", sans-serif';
const SETTINGS_FONT_SELECTOR = 'select[name="popupFontFamily"], input[name="popupFontFamily"]';
const SETTINGS_WEIGHT_SELECTOR = 'input[name="popupFontWeight"]';

mkdirSync(ARTIFACTS, { recursive: true });

// Fixture intentionally separate from tests/reader/hover-lookup.test.ts:
// this is a hosted-browser smoke (real files on disk, real video element)
// while the unit test builds a jsdom selection — different harnesses, no
// shared setup worth extracting.
const fixtureDir = mkdtempSync(path.join(tmpdir(), 'yomu-feedback-smoke-'));
const fakeVideoPath = path.join(fixtureDir, 'local-video.mp4');
const primaryVttPath = path.join(fixtureDir, 'japanese.vtt');

writeFileSync(fakeVideoPath, 'not a real video, but enough for hosted UI file selection\n');
writeFileSync(primaryVttPath, `WEBVTT

00:00:00.000 --> 00:00:04.000
猫を見る

00:00:04.000 --> 00:00:08.000
犬と鳥を見る
`);

const baseSettings = {
    onboardingSeen: true,
    apiKey: '',
    interfaceLanguage: 'en',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 120,
    popupFontFamily: JPDB_FONT_STACK,
    popupFontWeight: 400,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleTranscriptVisible: false,
    subtitleMiningPause: true,
    subtitleHoverPause: true,
    subtitlePausePanel: false,
    subtitleTranscriptPlacement: 'right',
    subtitleTranscriptAutoScroll: true,
    showFloatingButton: false,
    enableLogging: false,
    shortcuts: {
        scanPage: 'Shift+J',
        hoverLookup: '',
        openSettings: 'Ctrl+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousLookupWord: 'Shift+ArrowLeft',
        nextLookupWord: 'Shift+ArrowRight',
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

const readerFixtureHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Yomu feedback smoke</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f7f4ee;
      color: #192026;
      font: 18px/1.7 system-ui, sans-serif;
    }
    main {
      width: min(760px, calc(100vw - 40px));
      display: grid;
      gap: 18px;
    }
    p {
      margin: 0;
      padding: 22px;
      border: 1px solid #d8d0c2;
      border-radius: 8px;
      background: #fffdfa;
    }
    .chat-style-conflict {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 10px;
      padding: 16px;
      border-radius: 8px;
      background: #1e1f22;
      color: #dbdee1;
    }
    .chat-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #313338;
    }
    .messageHeader {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
      margin: 0 0 4px;
      font-size: 16px;
      line-height: 1.25;
    }
    .username {
      color: rgb(242, 243, 245);
      font-weight: 700;
      white-space: nowrap;
    }
    .messageTime {
      color: #949ba4;
      font-size: 12px;
      white-space: nowrap;
    }
    .messageContent {
      color: #dbdee1;
      line-height: 1.45;
    }
    .jpdb-reader-word {
      border-radius: 4px;
      padding: 2px 4px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main>
    <h1>Feedback smoke fixture</h1>
    <p data-fixture-text>
      <span class="jpdb-reader-word" data-expression="猫" data-vid="-1001" data-sid="-1001" data-sentence="猫と犬と鳥を見る">猫</span>
      <span class="jpdb-reader-word" data-expression="犬" data-vid="-1002" data-sid="-1002" data-sentence="猫と犬と鳥を見る">犬</span>
      <span class="jpdb-reader-word" data-expression="鳥" data-vid="-1003" data-sid="-1003" data-sentence="猫と犬と鳥を見る">鳥</span>
      を見る。
    </p>
    <section class="chat-style-conflict" data-style-conflict>
      <span class="chat-avatar" aria-hidden="true"></span>
      <div>
        <h3 class="messageHeader">
          <span class="username">Canna<span class="jpdb-reader-word jpdb-known jpdb-reader-scan-word jpdb-reader-passive-word" data-jpdb-reader-passive="true" data-expression="波蘭" data-vid="-2001" data-sid="-2001" data-sentence="Canna波蘭">波蘭</span></span>
          <time class="messageTime">10:50</time>
        </h3>
        <div class="messageContent">
          今日は<span class="jpdb-reader-word jpdb-known jpdb-reader-scan-word" data-expression="故郷" data-vid="-2002" data-sid="-2002" data-sentence="今日は故郷を守るために戦います。"><ruby><span class="jpdb-reader-ruby-base">故郷</span><rp>(</rp><rt class="jpdb-reader-furi">こきょう</rt><rp>)</rp></ruby></span>を守るために戦います。
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;

const FEEDBACK_TEXT_ROUTES = new Map([
    ['/', { body: readerFixtureHtml, contentType: 'text/html; charset=utf-8' }],
    ['/reader-fixture.html', { body: readerFixtureHtml, contentType: 'text/html; charset=utf-8' }],
    // Both shapes, because the hosted site serves both and the site nav links
    // the directory form.
    ['/video-player/', { bodyPath: VIDEO_PLAYER_PATH, contentType: 'text/html; charset=utf-8' }],
    ['/video-player/index.html', { bodyPath: VIDEO_PLAYER_PATH, contentType: 'text/html; charset=utf-8' }],
]);

const FEEDBACK_FILE_ROUTES = new Map([
    ...routeEntries(['/yomu.user.js', '/video-player/yomu.user.js', '/yomu-reader/yomu.user.js'], { filePath: SCRIPT_PATH, contentType: 'application/javascript; charset=utf-8' }),
    ...routeEntries(['/yomu.css', '/video-player/yomu.css', '/yomu-reader/yomu.css'], { filePath: CSS_PATH, contentType: 'text/css; charset=utf-8' }),
    ['/hosted-reader-worker.js', { filePath: path.join(PUBLIC_DIR, 'hosted-reader-worker.js'), contentType: 'application/javascript; charset=utf-8' }],
    ['/video-player/sw.js', { filePath: path.join(PUBLIC_DIR, 'video-player', 'sw.js'), contentType: 'application/javascript; charset=utf-8' }],
    ['/video-player/manifest.webmanifest', { filePath: path.join(PUBLIC_DIR, 'video-player', 'manifest.webmanifest'), contentType: 'application/manifest+json; charset=utf-8' }],
    ...COMPANION_SCRIPT_PATHS.flatMap(filePath => {
        const fileName = path.basename(filePath);
        return routeEntries([
            `/greasyfork/${fileName}`,
            `/video-player/greasyfork/${fileName}`,
            `/yomu-reader/greasyfork/${fileName}`,
        ], { filePath, contentType: 'application/javascript; charset=utf-8' });
    }),
    ...routeEntries(['/yomu-icon.svg', '/video-player/yomu-icon.svg', '/yomu-reader/yomu-icon.svg'], { filePath: path.join(PUBLIC_DIR, 'yomu-icon.svg'), contentType: 'image/svg+xml; charset=utf-8' }),
    ...['/favicon-32x32.png', '/favicon-16x16.png', '/apple-touch-icon.png']
        .map(pathname => [pathname, { filePath: path.join(PUBLIC_DIR, pathname.slice(1)), contentType: 'image/png' }]),
]);

function routeEntries(pathnames, route) {
    return pathnames.map(pathname => [pathname, route]);
}

function serveFeedbackFixtureRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const textRoute = FEEDBACK_TEXT_ROUTES.get(url.pathname);
    if (textRoute) {
        serveFeedbackTextRoute(response, textRoute);
        return;
    }

    const fileRoute = FEEDBACK_FILE_ROUTES.get(url.pathname);
    if (fileRoute) {
        serveFile(response, fileRoute.filePath, fileRoute.contentType, request.method);
        return;
    }

    serveFeedbackNotFound(response);
}

function serveFeedbackTextRoute(response, route) {
    response.writeHead(200, { 'content-type': route.contentType });
    response.end(route.body ?? readFileSync(route.bodyPath, 'utf8'));
}

function serveFeedbackNotFound(response) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

async function newPage(browser, settings = baseSettings, viewport = { width: 1360, height: 900 }) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, { key: SETTINGS_KEY, value: settings });
    return page;
}

async function injectUserscript(page) {
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')), null, { timeout: 6000 });
}

async function openSettings(page, panel = 'basics') {
    const logs = [];
    const onConsole = message => {
        const type = message.type();
        if (type === 'error' || type === 'warning') logs.push(`[${type}] ${message.text()}`);
    };
    const onPageError = error => logs.push(`[pageerror] ${error.stack || error.message}`);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    await page.evaluate(({ eventName, panelName }) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail: { panel: panelName } }));
    }, { eventName: OPEN_SETTINGS_EVENT, panelName: panel });
    try {
        await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    } catch (error) {
        const active = await page.evaluate(() => ({
            hasRoot: Boolean(document.querySelector('[data-jpdb-reader-root]')),
            bodyClasses: document.body.className,
            yomuReady: Boolean(document.querySelector('.jpdb-reader-float')),
        }));
        throw new Error(`Settings did not open for panel ${panel}: ${error.message}\n${logs.join('\n')}\n${JSON.stringify(active)}`);
    } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
    }
}

async function verifySettingsDiscoverability(page, baseUrl) {
    await page.goto(`${baseUrl}/reader-fixture.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    // The popup font controls live on the appearance panel since the 0.5.0
    // settings polish; 'basics' aliases to the JPDB panel and hides them.
    await openSettings(page, 'appearance');
    await verifyAppearanceSettings(page);
    await verifyShortcutSettings(page);
    await verifyMediaSettings(page);
}

async function verifyAppearanceSettings(page) {
    await page.locator('select[name="popupFontFamily"], input[name="popupFontFamily"]').first().scrollIntoViewIfNeeded();
    await page.locator('.jpdb-reader-settings').screenshot({ path: path.join(ARTIFACTS, 'feedback-settings-font.png') });

    const appearance = await readAppearanceSettings(page);
    assertAppearanceSettings(appearance);
}

async function readAppearanceSettings(page) {
    const font = page.locator(SETTINGS_FONT_SELECTOR).first();
    const weight = page.locator(SETTINGS_WEIGHT_SELECTOR).first();
    const [title, fontValue, weightValue, fontBox, weightBox] = await Promise.all([
        settingsTitle(page),
        font.inputValue(),
        weight.inputValue(),
        font.boundingBox(),
        weight.boundingBox(),
    ]);
    return {
        title,
        fontValue,
        weightValue,
        fontVisible: boxAtLeast(fontBox, 100, 24),
        weightVisible: boxAtLeast(weightBox, 60, 24),
    };
}

async function settingsTitle(page) {
    return trimText(await page.locator('.jpdb-reader-settings h2').textContent());
}

function assertAppearanceSettings(appearance) {
    assert(appearance.title === 'よむ Settings', 'Settings dialog did not open');
    assert(includesText(appearance.fontValue, 'Nunito Sans'), 'JPDB-like popup font setting was not visible or correct', appearance);
    assert(includesText(appearance.fontValue, 'Noto Sans JP'), 'JPDB-like popup font setting was not visible or correct', appearance);
    assert(appearance.weightValue === '400', 'Popup Japanese weight did not default to readable regular weight', appearance);
    assert(appearance.fontVisible, 'Popup font controls were clipped or hidden', appearance);
    assert(appearance.weightVisible, 'Popup font controls were clipped or hidden', appearance);
}

function boxAtLeast(box, minWidth, minHeight) {
    if (!box) return false;
    if (box.width <= minWidth) return false;
    return box.height >= minHeight;
}

async function verifyShortcutSettings(page) {
    await page.locator('[data-action="settings-panel"][data-panel="shortcuts"]').click();
    const shortcuts = await readShortcutSettings(page);
    assert(shortcuts.previous === 'Shift+ArrowLeft', 'Previous word shortcut missing from settings', shortcuts);
    assert(shortcuts.next === 'Shift+ArrowRight', 'Next word shortcut missing from settings', shortcuts);
    assert(includesText(shortcuts.visibleText, 'Previous word'), 'Word navigation shortcut labels were not discoverable', shortcuts);
    assert(includesText(shortcuts.visibleText, 'Next word'), 'Word navigation shortcut labels were not discoverable', shortcuts);
}

async function readShortcutSettings(page) {
    const [previous, next, visibleText] = await Promise.all([
        page.locator('input[name="shortcuts.previousLookupWord"]').inputValue(),
        page.locator('input[name="shortcuts.nextLookupWord"]').inputValue(),
        settingsDialogText(page),
    ]);
    return { previous, next, visibleText };
}

async function verifyMediaSettings(page) {
    await page.locator('[data-action="settings-panel"][data-panel="media"]').click();
    const media = await readMediaSettings(page);
    assert(media.pausePanel, 'Pause-only subtitle panel setting was not discoverable', media);
    assert(media.clickPause, 'Subtitle click-pause setting was not discoverable', media);
    assert(media.hoverPause, 'Subtitle hover-pause setting was not discoverable', media);
    assert(includesText(media.text, 'Open side panel when paused'), 'Pause-only subtitle panel setting was not discoverable', media);
    assert(includesText(media.text, 'Pause video on subtitle click'), 'Subtitle click-pause setting was not discoverable', media);
    assert(includesText(media.text, 'Pause video on subtitle hover'), 'Subtitle hover-pause setting was not discoverable', media);
}

async function readMediaSettings(page) {
    const [pausePanelCount, clickPauseCount, hoverPauseCount, text] = await Promise.all([
        page.locator('input[name="subtitlePausePanel"]').count(),
        page.locator('input[name="subtitleMiningPause"]').count(),
        page.locator('input[name="subtitleHoverPause"]').count(),
        settingsDialogText(page),
    ]);
    return { pausePanel: pausePanelCount > 0, clickPause: clickPauseCount > 0, hoverPause: hoverPauseCount > 0, text };
}

async function settingsDialogText(page) {
    return trimText(await page.locator('.jpdb-reader-settings').textContent());
}

function trimText(value) {
    return String(value ?? '').trim();
}

function includesText(value, fragment) {
    return String(value).includes(fragment);
}

async function verifyKeyboardWordNavigation(page, baseUrl) {
    await page.goto(`${baseUrl}/reader-fixture.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await installKeyboardNavigationProbe(page);

    await pressWordNavigationShortcut(page, 'ArrowRight');
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await waitForKeyboardActiveWord(page, '猫', 'Keyboard navigation did not activate the first word');

    await pressWordNavigationShortcut(page, 'ArrowRight');
    await waitForKeyboardActiveWord(page, '犬', 'Keyboard navigation did not advance to the next word');
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-popover')?.textContent?.includes('犬'));
    // The popup font stack arrives via the --jpdb-reader-popup-font custom
    // property a frame or two after the popover text renders (and detail
    // hydration can re-render the spelling node), so a one-shot computed-style
    // read races font application on a loaded runner. Wait for the font to be
    // applied before snapshotting styles.
    await page.waitForFunction(() => {
        const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling') ?? document.querySelector('.jpdb-reader-spelling');
        if (!spelling) return false;
        const fontFamily = getComputedStyle(spelling).fontFamily;
        return fontFamily.includes('Nunito Sans') || fontFamily.includes('Noto Sans JP');
    }, { timeout: 6000 });

    const popupStyle = await readKeyboardPopupStyle(page);
    assertKeyboardPopupStyle(popupStyle);

    await selectKeyboardWordRange(page, 1, 2);
    await pressWordNavigationShortcut(page, 'ArrowLeft');
    await waitForKeyboardActiveWord(page, '犬', 'Keyboard navigation did not enter the selected word range');
    await pressWordNavigationShortcut(page, 'ArrowLeft');
    await page.waitForTimeout(150);
    const selectedScope = await page.evaluate(activeKeyboardWordIdentity);
    assert(selectedScope === '犬', 'Keyboard navigation escaped the selected text range at the boundary', { selectedScope });
    await pressWordNavigationShortcut(page, 'ArrowRight');
    await waitForKeyboardActiveWord(page, '鳥', 'Keyboard navigation did not advance inside the selected text range');

    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-keyboard-word-nav.png'), fullPage: false });
}

async function verifyGenericPassiveStyleContainment(page, baseUrl) {
    await page.goto(`${baseUrl}/reader-fixture.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('[data-style-conflict] .username .jpdb-reader-word', { timeout: 6000 });
    await page.waitForFunction(() => document
        .querySelector('[data-style-conflict] .messageContent .jpdb-reader-word rt.jpdb-reader-furi')
        ?.textContent?.trim() === 'こきょう', null, { timeout: 6000 });

    const state = await readGenericPassiveStyleState(page);
    assert(state.passive === 'true', 'Compact author/name word was not marked passive', state);
    assert(state.authorTextFill === state.authorColor, 'Compact author/name word text fill drifted from computed text color', state);
    assert(readableCssContrastOnPaint(state.authorColor, state.authorPaint, state.authorBackdrop), 'Compact author/name word is not readable on its highlight or host backdrop', state);
    const authorHasHighlight = !isTransparentCssValue(state.authorHighlight);
    if (authorHasHighlight) {
        assert(state.authorBackgroundImage.includes('linear-gradient'), 'Compact author/name word lost its stable highlight backing', state);
    }
    assert(state.messagePassive !== 'true', 'Chat message prose was incorrectly treated as passive chrome', state);
    assert(state.messageFuri === 'こきょう', 'Chat message prose lost furigana while fixing compact author chrome', state);
    assert(readableCssContrast(state.messageFuriColor, state.messageBackdrop), 'Chat message furigana is not readable on the host surface', state);
    await page.locator('[data-style-conflict] .username .jpdb-reader-word').hover();
    await page.waitForTimeout(150);
    const hoverState = await readGenericPassiveStyleState(page);
    if (authorHasHighlight) {
        assert(hoverState.authorBackgroundImage.includes('linear-gradient'), 'Compact author/name hover removed the highlight backing', hoverState);
    }
    assert(hoverState.authorHighlight === state.authorHighlight, 'Compact author/name hover changed highlight source unexpectedly', { before: state, after: hoverState });
    assert(readableCssContrastOnPaint(hoverState.authorColor, hoverState.authorPaint, hoverState.authorBackdrop), 'Compact author/name hover text is not readable', hoverState);
    await page.locator('[data-style-conflict]').screenshot({ path: path.join(ARTIFACTS, 'feedback-generic-style-containment.png') });
}

async function readGenericPassiveStyleState(page) {
    return page.evaluate(() => {
        const username = document.querySelector('[data-style-conflict] .username');
        const authorWord = document.querySelector('[data-style-conflict] .username .jpdb-reader-word');
        const messageWords = Array.from(document.querySelectorAll('[data-style-conflict] .messageContent .jpdb-reader-word'));
        const messageWord = messageWords.find(word => word.dataset.expression === '故郷' || word.querySelector('rt.jpdb-reader-furi')) ?? messageWords[0];
        const usernameStyle = username ? getComputedStyle(username) : null;
        const authorStyle = authorWord ? getComputedStyle(authorWord) : null;
        const messageStyle = messageWord ? getComputedStyle(messageWord) : null;
        const messageFuri = messageWord?.querySelector('rt.jpdb-reader-furi');
        const messageFuriStyle = messageFuri ? getComputedStyle(messageFuri) : null;
        const firstPaint = (value) => String(value).match(/rgba?\([^)]+\)/)?.[0] ?? '';
        return {
            passive: authorWord?.getAttribute('data-jpdb-reader-passive') ?? '',
            authorColor: authorStyle?.color ?? '',
            authorTextFill: authorStyle?.webkitTextFillColor ?? '',
            authorHighlight: authorStyle?.getPropertyValue('--jpdb-reader-word-highlight-source').trim() ?? '',
            authorBackdrop: authorStyle?.getPropertyValue('--jpdb-reader-highlight-backdrop').trim() ?? '',
            authorBackgroundImage: authorStyle?.backgroundImage ?? '',
            authorPaint: firstPaint(authorStyle?.backgroundImage ?? ''),
            usernameColor: usernameStyle?.color ?? '',
            messagePassive: messageWord?.getAttribute('data-jpdb-reader-passive') ?? '',
            messageFuri: messageWord?.querySelector('rt.jpdb-reader-furi')?.textContent?.trim() ?? '',
            messageBackdrop: messageStyle?.getPropertyValue('--jpdb-reader-highlight-backdrop').trim() ?? '',
            messageFuriColor: messageFuriStyle?.color ?? '',
        };
    });
}

async function installKeyboardNavigationProbe(page) {
    await page.evaluate(() => {
        const activeWordIdentity = () => {
            const word = document.querySelector('.jpdb-reader-keyboard-active');
            return word?.getAttribute('data-expression')
                || word?.getAttribute('data-surface')
                || word?.textContent?.trim()
                || '';
        };
        window.__yomuKeyboardSmokeEvents = [];
        document.addEventListener('keydown', event => {
            window.__yomuKeyboardSmokeEvents.push({
                key: event.key,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                defaultPrevented: event.defaultPrevented,
                target: event.target instanceof Element ? event.target.tagName : '',
                active: activeWordIdentity(),
                selection: window.getSelection()?.toString() ?? '',
            });
            window.__yomuKeyboardSmokeEvents = window.__yomuKeyboardSmokeEvents.slice(-12);
        });
    });
}

async function waitForKeyboardActiveWord(page, expected, message) {
    try {
        await page.waitForFunction(
            value => {
                const word = document.querySelector('.jpdb-reader-keyboard-active');
                const identity = word?.getAttribute('data-expression')
                    || word?.getAttribute('data-surface')
                    || word?.textContent?.trim()
                    || '';
                return identity === value;
            },
            expected,
            { timeout: 6000 },
        );
    } catch (error) {
        const state = await page.evaluate(() => {
            const word = document.querySelector('.jpdb-reader-keyboard-active');
            return {
                active: word?.getAttribute('data-expression')
                    || word?.getAttribute('data-surface')
                    || word?.textContent?.trim()
                    || '',
                selection: window.getSelection()?.toString() ?? '',
                popoverText: document.querySelector('.jpdb-reader-popover')?.textContent?.trim() ?? '',
                focused: document.activeElement instanceof Element ? document.activeElement.tagName : '',
                events: window.__yomuKeyboardSmokeEvents ?? [],
            };
        });
        assert(false, message, state);
    }
}

async function readKeyboardPopupStyle(page) {
    const [active, popoverText, popupFontVar, fontStyle] = await Promise.all([
        activeKeyboardWordText(page),
        popoverTextContent(page),
        popupFontVariable(page),
        popupSpellingFontStyle(page),
    ]);
    return { active, popoverText, popupFontVar, ...fontStyle };
}

async function activeKeyboardWordText(page) {
    return page.evaluate(activeKeyboardWordIdentity);
}

function activeKeyboardWordIdentity() {
    const word = document.querySelector('.jpdb-reader-keyboard-active');
    return word?.getAttribute('data-expression')
        || word?.getAttribute('data-surface')
        || word?.textContent?.trim()
        || '';
}

async function popoverTextContent(page) {
    return trimText(await page.locator('.jpdb-reader-popover').first().textContent());
}

async function popupFontVariable(page) {
    return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-popup-font'));
}

async function popupSpellingFontStyle(page) {
    // Detail hydration can replace the spelling node between the earlier
    // readiness wait and a locator evaluation. Capture the style in the SAME
    // browser predicate that proves the currently connected popup node has
    // inherited its font stack, so a transient detached replacement cannot
    // yield empty computed-style fields.
    const styleHandle = await page.waitForFunction(() => {
        const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling');
        if (!spelling?.isConnected) return false;
        const style = getComputedStyle(spelling);
        if (!style.fontFamily.includes('Nunito Sans') && !style.fontFamily.includes('Noto Sans JP')) return false;
        return { fontFamily: style.fontFamily, fontWeight: style.fontWeight };
    }, undefined, { timeout: 6000 });
    try {
        return await styleHandle.jsonValue();
    } finally {
        await styleHandle.dispose();
    }
}

function assertKeyboardPopupStyle(popupStyle) {
    assert(popupStyle.active === '犬', 'Keyboard next shortcut did not move to the next word', popupStyle);
    assert(includesText(popupStyle.popoverText, '犬'), 'Keyboard lookup did not open the expected word popup', popupStyle);
    assert(includesText(popupStyle.popupFontVar, 'Nunito Sans'), 'Popup JPDB font variable was not applied', popupStyle);
    assert(includesText(popupStyle.popupFontVar, 'Noto Sans JP'), 'Popup JPDB font variable was not applied', popupStyle);
    assert(fontFamilyMatchesPopupStack(popupStyle.fontFamily), 'Popup Japanese text did not use the configured font stack', popupStyle);
    assert(Number(popupStyle.fontWeight) <= 450, 'Popup Japanese text rendered too bold by default', popupStyle);
}

function fontFamilyMatchesPopupStack(fontFamily) {
    return includesText(fontFamily, 'Nunito Sans') || includesText(fontFamily, 'Noto Sans JP');
}

async function pressWordNavigationShortcut(page, key) {
    await page.keyboard.down('Shift');
    await page.keyboard.press(key);
    await page.keyboard.up('Shift');
}

async function selectKeyboardWordRange(page, startIndex, endIndex) {
    await page.evaluate(({ selector, start, end }) => {
        const selectedWords = Array.from(document.querySelectorAll(selector)).slice(start, end + 1);
        const firstWord = selectedWords[0];
        const lastWord = selectedWords.at(-1);
        const selection = window.getSelection();
        if (!firstWord || !lastWord || !selection) return;

        const range = document.createRange();
        range.setStartBefore(firstWord);
        range.setEndAfter(lastWord);
        selection.removeAllRanges();
        selection.addRange(range);
    }, { selector: '.jpdb-reader-word', start: startIndex, end: endIndex });
}

async function verifyHostedSubtitleFlow(page, baseUrl) {
    await openHostedVideoPlayer(page, baseUrl);
    await assertHostedBrandIcon(page);
    await assertHostedEmptyState(page, 'desktop');
    await openHostedSettingsFromOverflow(page);
    await assertSubtitleOpenRequiresVideo(page);
    await loadHostedVideoAndSubtitleTogether(page);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-open-with-subtitles.png'), fullPage: false });
    const subtitleBottomOffset = await assertHostedSubtitleStyleControls(page);
    await assertHostedSubtitleSettingsSyncedFromCompactControls(page, subtitleBottomOffset);
    await assertHostedFullscreenSubtitleOverlay(page);
    await assertHostedManualPanelCloseRestoresPlayer(page);
    await assertHostedThemeToggleResponsiveWithLoadedSubtitles(page);
    await assertHostedPausedVideoOcrDoesNotCoverPlayback(page);
    await openHostedVideoPlayer(page, baseUrl);
    await loadHostedVideoAndOpenTracks(page);
    await assertHostedTracksPanel(page);
    await loadPrimarySubtitleTrack(page);
    await assertHostedTracksPanelControls(page);
    await enableHostedPausePanel(page);
    await assertHostedPausePanelOnPause(page);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-pause-panel.png'), fullPage: false });
}

async function verifyHostedFullscreenPausedOcrTapabilityMobile(page, baseUrl) {
    await openHostedVideoPlayer(page, baseUrl);
    await loadHostedVideoAndSubtitleTogether(page);
    await closeHostedTranscriptPanel(page);
    await enterHostedInlineFullscreenFallback(page);
    await installHostedPausedVideoCaptureStub(page);
    await requestHostedPausedVideoFrameOcr(page);
    await injectHostedPausedFrameOcrLines(page);
    await page.waitForSelector('[data-yomu-video-frame] .jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word', { timeout: 6000 });
    const ready = await readHostedFullscreenPausedOcrTapState(page);
    assert(hostedFullscreenPausedOcrReady(ready), 'Fullscreen paused-frame OCR did not render tappable words in the active fullscreen host', ready);

    const lineBox = await page.locator('[data-yomu-video-frame] .jpdb-ocr-layer .jpdb-ocr-line').first().boundingBox();
    assert(lineBox && lineBox.width > 0 && lineBox.height > 0, 'Fullscreen paused-frame OCR line had no clickable browser box', { lineBox });
    await page.evaluate(({ x, y }) => {
        const line = document.querySelector('[data-yomu-video-frame] .jpdb-ocr-layer .jpdb-ocr-line');
        if (!(line instanceof HTMLElement)) throw new Error('Fullscreen OCR line missing');
        line.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: x,
            clientY: y,
        }));
        line.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: x,
            clientY: y,
        }));
    }, { x: lineBox.x + lineBox.width / 2, y: lineBox.y + lineBox.height / 2 });
    await page.waitForFunction(() => {
        const line = document.querySelector('[data-yomu-video-frame] .jpdb-ocr-layer .jpdb-ocr-line');
        return line?.classList.contains('jpdb-ocr-line-active') && line?.getAttribute('data-pinned') === 'true';
    }, null, { timeout: 3000 });
    const tapped = await readHostedFullscreenPausedOcrTapState(page);
    assert(hostedFullscreenPausedOcrTapped(tapped), 'Fullscreen paused-frame OCR word tap did not activate the OCR line', tapped);
    await captureAndExitHostedInlineFullscreen(page, 'feedback-video-fullscreen-paused-ocr.png');
}

async function openHostedVideoPlayer(page, baseUrl) {
    await page.goto(`${baseUrl}/video-player/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => Boolean(window.__yomuReaderAppInitialized && document.querySelector('.jpdb-subtitle-player')),
        null,
        { timeout: 6000 },
    );
}

async function assertHostedEmptyState(page, variant) {
    const state = await readHostedEmptyState(page);
    assert(hostedEmptyStateReady(state), `Hosted Yomu Video empty state did not fit the drop-video-plus-subtitles workflow on ${variant}`, state);
    await page.screenshot({ path: path.join(ARTIFACTS, `feedback-video-empty-${variant}.png`), fullPage: false });
}

async function readHostedEmptyState(page) {
    return page.evaluate(() => {
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? {
                width: box.width,
                height: box.height,
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
            } : null;
        };
        const empty = document.querySelector('[data-empty-open]');
        const status = document.querySelector('[data-status]');
        const chips = [...document.querySelectorAll('.empty-file-chip')];
        const stage = document.querySelector('[data-yomu-video-frame]');
        const emptyStyle = empty ? getComputedStyle(empty) : null;
        return {
            title: document.querySelector('[data-empty-open] strong')?.textContent?.trim() ?? '',
            status: status?.textContent?.trim() ?? '',
            chips: chips.map(chip => chip.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
            emptyRect: rect(empty),
            statusRect: rect(status),
            chipRects: chips.map(rect),
            stageRect: rect(stage),
            hidden: empty?.hidden === true || emptyStyle?.display === 'none' || emptyStyle?.visibility === 'hidden',
        };
    });
}

function hostedEmptyStateReady(state) {
    const stage = state.stageRect;
    const empty = state.emptyRect;
    if (!stage || !empty) return false;
    const rects = [state.statusRect, ...state.chipRects];
    return state.hidden === false
        && includesText(state.title, 'Drop anime and subtitles')
        && includesText(state.status, 'Open a video')
        && state.chips.some(chip => includesText(chip, 'MP4') && includesText(chip, 'MKV'))
        && state.chips.some(chip => includesText(chip, 'SRT') && includesText(chip, 'ASS'))
        && empty.width > 180
        && empty.height > 150
        && empty.left >= stage.left - 1
        && empty.top >= stage.top - 1
        && empty.right <= stage.right + 1
        && empty.bottom <= stage.bottom + 1
        && rects.every(rect => rect && rect.width > 0 && rect.height > 0 && rect.left >= empty.left - 1 && rect.right <= empty.right + 1);
}

async function assertHostedBrandIcon(page) {
    const brandIcon = await readHostedBrandIcon(page);
    assertHostedBrandIconState(brandIcon);
}

async function readHostedBrandIcon(page) {
    const icon = page.locator('[data-yomu-brand-icon]').first();
    const [complete, naturalWidth, naturalHeight, rect] = await Promise.all([
        icon.evaluate(image => image.complete === true),
        icon.evaluate(image => image.naturalWidth),
        icon.evaluate(image => image.naturalHeight),
        icon.boundingBox(),
    ]);
    return { complete, naturalWidth, naturalHeight, rect: sizeRect(rect) };
}

function assertHostedBrandIconState(brandIcon) {
    assert(brandIcon.complete, 'Hosted video brand icon did not render', brandIcon);
    assert(brandIcon.naturalWidth > 0, 'Hosted video brand icon did not render', brandIcon);
    assert(brandIcon.naturalHeight > 0, 'Hosted video brand icon did not render', brandIcon);
    assert(rectWidth(brandIcon.rect) === 36, 'Hosted video brand icon did not render', brandIcon);
}

function sizeRect(rect) {
    if (!rect) return null;
    return { width: rect.width, height: rect.height };
}

function rectWidth(rect) {
    return rect ? rect.width : 0;
}

async function openHostedSettingsFromOverflow(page) {
    await page.locator('[data-overflow-summary]').click();
    await page.locator('[data-settings-trigger]').click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    const hostedSettings = await readHostedSettingsState(page);
    assert(hostedSettingsReady(hostedSettings), 'Hosted Settings menu item did not open the Yomu settings dialog', hostedSettings);
    await page.locator('.jpdb-reader-settings [data-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'));
    const closeState = await page.evaluate(() => {
        let clicked = false;
        const probe = document.createElement('button');
        probe.type = 'button';
        probe.textContent = 'probe';
        probe.addEventListener('click', () => { clicked = true; });
        document.body.append(probe);
        probe.click();
        probe.remove();
        return {
            clicked,
            settingsVisible: Boolean(document.querySelector('.jpdb-reader-settings')),
            inertRoots: Array.from(document.body.children)
                .filter(element => element instanceof HTMLElement && (element.inert || element.getAttribute('aria-hidden') === 'true'))
                .map(element => element.tagName.toLowerCase()),
        };
    });
    assert(closeState.clicked === true && closeState.inertRoots.length === 0, 'Closing Settings left the page unresponsive', closeState);
}

async function readHostedSettingsState(page) {
    return page.evaluate(() => ({
        title: document.querySelector('.jpdb-reader-settings h2')?.textContent?.trim(),
        visible: Boolean(document.querySelector('.jpdb-reader-settings')),
        hasFontControl: Boolean(document.querySelector('select[name="popupFontFamily"], input[name="popupFontFamily"]')),
    }));
}

function hostedSettingsReady(hostedSettings) {
    return hostedSettings.title === 'よむ Settings' && hostedSettings.visible && hostedSettings.hasFontControl;
}

async function assertSubtitleOpenRequiresVideo(page) {
    await page.locator('[data-subtitle-open]').click();
    await page.waitForFunction(() => /Open a video first/.test(document.querySelector('[data-status]')?.textContent ?? ''));
}

async function loadHostedVideoAndOpenTracks(page) {
    await page.setInputFiles('[data-video-input]', fakeVideoPath);
    await page.waitForFunction(() => /local-video\.mp4/.test(document.querySelector('[data-status]')?.textContent ?? ''));
    await page.locator('[data-subtitle-open]').click();
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-tracks-panel:not([hidden])', { timeout: 6000 });
}

async function loadHostedVideoAndSubtitleTogether(page) {
    await page.setInputFiles('[data-video-input]', [fakeVideoPath, primaryVttPath]);
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row', { timeout: 8000 });
    const loaded = await readHostedVideoAndSubtitleTogetherState(page);
    assert(loaded.inputMultiple === true, 'Hosted video picker should allow video and subtitle files together', loaded);
    assert(loaded.status.includes('loaded 1 subtitle file'), 'Hosted video status did not acknowledge the loaded subtitle file', loaded);
    assert(loaded.rows >= 2, 'Opening video and subtitle together did not render transcript rows', loaded);
    assert(hostedPausePanelHasExpectedText(loaded), 'Opening video and subtitle together did not load the expected subtitle text', loaded);
}

async function assertHostedManualPanelCloseRestoresPlayer(page) {
    await pinHostedSubtitleControlRail(page);
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click();
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden === true, null, { timeout: 6000 });
    const hiddenLayout = await readHostedPlayerLayoutState(page);
    assert(hostedPlayerLayoutRestored(hiddenLayout), 'Hosted video player did not restore full-width controls after manually closing the subtitle panel', hiddenLayout);
    const subtitleState = await readHostedOnVideoSubtitleState(page);
    assert(hostedOnVideoSubtitleVisible(subtitleState), 'Hosted video subtitles disappeared after manually closing the subtitle panel', subtitleState);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-panel-hidden-subtitles.png'), fullPage: false });
}

async function assertHostedThemeToggleResponsiveWithLoadedSubtitles(page) {
    const before = await readHostedThemeState(page);
    await page.locator('[data-theme-toggle]').click({ timeout: 6000 });
    await page.waitForFunction(previous => {
        const root = document.documentElement;
        const changed = root.classList.contains('yomu-page-theme-light') !== previous.light
            || root.classList.contains('yomu-page-theme-dark') !== previous.dark;
        const line = document.querySelector('.jpdb-subtitle-lines');
        if (!line) return false;
        const clone = line.cloneNode(true);
        clone.querySelectorAll('rt,rp').forEach(node => node.remove());
        return changed && (clone.textContent ?? '').includes('猫を見る');
    }, before, { timeout: 2000 });
    const state = await readHostedThemeResponsivenessState(page);
    assert(hostedThemeToggleResponsive(state), 'Hosted dark-mode toggle became slow or hid subtitles after loading a video/subtitle file', state);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-theme-toggle.png'), fullPage: false });
}

async function readHostedThemeState(page) {
    return page.evaluate(() => ({
        light: document.documentElement.classList.contains('yomu-page-theme-light'),
        dark: document.documentElement.classList.contains('yomu-page-theme-dark'),
    }));
}

async function readHostedThemeResponsivenessState(page) {
    return page.evaluate(async () => {
        const start = performance.now();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const frameDelayMs = performance.now() - start;
        const root = document.documentElement;
        const line = document.querySelector('.jpdb-subtitle-lines');
        const themeToggle = document.querySelector('[data-theme-toggle]');
        const overlay = document.querySelector('.jpdb-subtitle-player');
        const panel = document.querySelector('.jpdb-subtitle-list');
        return {
            frameDelayMs,
            light: root.classList.contains('yomu-page-theme-light'),
            dark: root.classList.contains('yomu-page-theme-dark'),
            toggleLabel: themeToggle?.getAttribute('aria-label') ?? '',
            subtitleOverlay: readHostedSubtitleVisibilityInPage(overlay, line, panel),
        };

        function readHostedSubtitleVisibilityInPage(rootElement, lineElement, panelElement) {
            const rect = element => {
                const box = element?.getBoundingClientRect();
                return box ? { width: box.width, height: box.height } : null;
            };
            const rootStyle = rootElement ? getComputedStyle(rootElement) : null;
            const lineStyle = lineElement ? getComputedStyle(lineElement) : null;
            return {
                panelHidden: panelElement?.hidden ?? null,
                rootHidden: rootElement?.hidden ?? null,
                rootHiddenClass: rootElement?.classList.contains('jpdb-subtitle-hidden') ?? null,
                rootOutOfView: rootElement?.classList.contains('jpdb-subtitle-video-out-of-view') ?? null,
                rootDisplay: rootStyle?.display ?? null,
                rootVisibility: rootStyle?.visibility ?? null,
                lineDisplay: lineStyle?.display ?? null,
                lineVisibility: lineStyle?.visibility ?? null,
                lineText: (() => {
                if (!lineElement) return '';
                const clone = lineElement.cloneNode(true);
                clone.querySelectorAll('rt,rp').forEach(node => node.remove());
                return clone.textContent ?? '';
            })(),
                rootRect: rect(rootElement),
                lineRect: rect(lineElement),
            };
        }
    });
}

function hostedThemeToggleResponsive(state) {
    return state.frameDelayMs < 1000
        && state.light !== state.dark
        && includesText(state.toggleLabel, state.light ? 'Switch to dark theme' : 'Switch to light theme')
        && hostedSubtitleOverlayVisible(state.subtitleOverlay);
}

async function assertHostedPausedVideoOcrDoesNotCoverPlayback(page) {
    await installHostedPausedVideoCaptureStub(page);
    await pinHostedSubtitleControlRail(page);
    await page.waitForSelector('.jpdb-subtitle-rail [data-action="ocr"]', { state: 'visible', timeout: 5000 });
    await page.locator('.jpdb-subtitle-rail [data-action="ocr"]').click();
    await page.waitForSelector('.jpdb-ocr-video-frame', { state: 'attached', timeout: 5000 });
    await page.waitForSelector('.jpdb-ocr-video-frame-status', { state: 'attached', timeout: 5000 });
    const state = await readHostedPausedVideoOcrState(page);
    assert(hostedPausedVideoOcrSafe(state), 'Paused-frame OCR covered Yomu Video playback/subtitles or changed the video timeline', state);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-paused-ocr.png'), fullPage: false });
    const resume = page.locator('.jpdb-ocr-video-frame-resume').first();
    await resume.click();
    await dispatchHostedVideoEvent(page, 'play');
    await page.waitForFunction(() => !document.querySelector('.jpdb-ocr-video-frame'), null, { timeout: 5000 });
}

async function installHostedPausedVideoCaptureStub(page) {
    await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) throw new Error('Hosted video element missing');
        if (!window.__yomuHostedPausedOcrCanvasStubsInstalled) {
            window.__yomuHostedPausedOcrCanvasStubsInstalled = true;
            const canvas = HTMLCanvasElement.prototype;
            const context = CanvasRenderingContext2D?.prototype;
            if (context) Object.defineProperty(context, 'drawImage', { configurable: true, value: () => undefined });
            Object.defineProperty(canvas, 'toDataURL', {
                configurable: true,
                value: () => 'data:image/jpeg;base64,ZmVhdHVyZS1wcmV2aWV3',
            });
        }
        const originalCurrentTime = 1.25;
        let currentTime = originalCurrentTime;
        window.__yomuHostedPausedOcrTimeline = { originalCurrentTime, writes: [] };
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTime,
            set: value => {
                currentTime = Number(value);
                window.__yomuHostedPausedOcrTimeline.writes.push(currentTime);
            },
        });
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
    });
}

async function readHostedPausedVideoOcrState(page) {
    return page.evaluate(() => {
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? {
                width: box.width,
                height: box.height,
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
            } : null;
        };
        const style = element => {
            const computed = element ? getComputedStyle(element) : null;
            return computed ? {
                opacity: Number.parseFloat(computed.opacity) || 0,
                pointerEvents: computed.pointerEvents,
                visibility: computed.visibility,
                display: computed.display,
            } : null;
        };
        const frame = document.querySelector('.jpdb-ocr-video-frame');
        const status = document.querySelector('.jpdb-ocr-video-frame-status');
        const resume = document.querySelector('.jpdb-ocr-video-frame-resume');
        const root = document.querySelector('.jpdb-subtitle-player');
        const line = document.querySelector('.jpdb-subtitle-lines');
        const panel = document.querySelector('.jpdb-subtitle-list');
        const video = document.querySelector('video');
        const timeline = window.__yomuHostedPausedOcrTimeline ?? { originalCurrentTime: null, writes: [] };
        return {
            frames: document.querySelectorAll('.jpdb-ocr-video-frame').length,
            statuses: document.querySelectorAll('.jpdb-ocr-video-frame-status').length,
            resumeButtons: document.querySelectorAll('.jpdb-ocr-video-frame-resume').length,
            railResumeButtons: document.querySelectorAll('.jpdb-subtitle-rail .jpdb-ocr-video-frame-resume').length,
            fallbackResumeButtons: document.querySelectorAll('.jpdb-ocr-video-frame-resume-fallback').length,
            railResumeActive: root?.classList.contains('jpdb-ocr-video-frame-resume-active') ?? false,
            framePending: frame?.classList.contains('jpdb-ocr-video-frame-pending') ?? false,
            statusPending: status?.classList.contains('jpdb-ocr-video-frame-pending') ?? false,
            currentTime: video?.currentTime ?? null,
            originalCurrentTime: timeline.originalCurrentTime,
            currentTimeWrites: timeline.writes,
            frameStyle: style(frame),
            statusStyle: style(status),
            resumeStyle: style(resume),
            frameRect: rect(frame),
            statusRect: rect(status),
            resumeRect: rect(resume),
            videoRect: rect(video),
            subtitleOverlay: readHostedSubtitleVisibilityInPage(root, line, panel),
        };

        function readHostedSubtitleVisibilityInPage(rootElement, lineElement, panelElement) {
            const rootStyle = rootElement ? getComputedStyle(rootElement) : null;
            const lineStyle = lineElement ? getComputedStyle(lineElement) : null;
            return {
                panelHidden: panelElement?.hidden ?? null,
                rootHidden: rootElement?.hidden ?? null,
                rootHiddenClass: rootElement?.classList.contains('jpdb-subtitle-hidden') ?? null,
                rootOutOfView: rootElement?.classList.contains('jpdb-subtitle-video-out-of-view') ?? null,
                rootDisplay: rootStyle?.display ?? null,
                rootVisibility: rootStyle?.visibility ?? null,
                lineDisplay: lineStyle?.display ?? null,
                lineVisibility: lineStyle?.visibility ?? null,
                lineText: (() => {
                if (!lineElement) return '';
                const clone = lineElement.cloneNode(true);
                clone.querySelectorAll('rt,rp').forEach(node => node.remove());
                return clone.textContent ?? '';
            })(),
                rootRect: rect(rootElement),
                lineRect: rect(lineElement),
            };
        }
    });
}

function hostedPausedVideoOcrSafe(state) {
    // The rail carries no persistent playback toggle, so the frame's own
    // resume control must always join the rail while the overlay is up.
    const dedicatedResumeControl = state.resumeButtons === 1
        && state.railResumeButtons === 1
        && state.fallbackResumeButtons === 0
        && state.railResumeActive === true
        && state.resumeStyle?.pointerEvents === 'auto';
    return state.frames === 1
        && state.statuses === 1
        && dedicatedResumeControl
        && state.framePending === true
        && state.statusPending === true
        && state.frameStyle?.opacity <= 0.01
        && state.frameStyle?.pointerEvents === 'none'
        && state.statusStyle?.opacity <= 0.01
        && state.statusStyle?.pointerEvents === 'none'
        && state.currentTime === state.originalCurrentTime
        && state.currentTimeWrites.length === 0
        && hostedSubtitleOverlayVisible(state.subtitleOverlay);
}

async function pinHostedSubtitleControlRail(page) {
    const grip = page.locator('.jpdb-subtitle-rail [data-action="rail-expand"]');
    // Auto-mode now fully hides the rail after its idle timeout. Wake it the
    // same way a real pointer user does before pinning it for the style-control
    // assertions; clicking a hidden, pointer-inert grip is no longer valid.
    const videoBox = await page.locator('video').first().boundingBox();
    if (videoBox) {
        await page.mouse.move(videoBox.x + videoBox.width / 2, videoBox.y + videoBox.height / 2);
        await grip.waitFor({ state: 'visible', timeout: 6000 });
    }
    if (await grip.getAttribute('aria-expanded') !== 'true') await grip.click();
    await page.waitForFunction(() => (
        document.querySelector('.jpdb-subtitle-rail [data-action="rail-expand"]')?.getAttribute('aria-expanded') === 'true'
    ), null, { timeout: 6000 });
    await page.locator('.jpdb-subtitle-rail [data-action="style"]').waitFor({ state: 'visible', timeout: 6000 });
}

async function assertHostedSubtitleStyleControls(page) {
    await pinHostedSubtitleControlRail(page);
    await page.locator('.jpdb-subtitle-rail [data-action="style"]').click();
    await page.waitForSelector('[data-subtitle-style-popover]:not([hidden])', { timeout: 6000 });
    await setHostedSubtitleStyleControl(page, 'subtitleFontSize', '34');
    const bottomOffset = await setHostedSubtitleBottomOffsetByDrag(page, 24);
    await setHostedSubtitleStyleControl(page, 'subtitleBackgroundOpacity', '0.35');
    await setHostedSubtitleStyleFont(page);
    await page.locator('[data-subtitle-style-setting="subtitleMiningPause"]').setChecked(false);
    await page.locator('[data-subtitle-style-setting="subtitleHoverPause"]').setChecked(false);
    await page.waitForFunction(({ key, expectedBottomOffset }) => {
        const settings = JSON.parse(localStorage.getItem(key) || '{}');
        return settings.subtitleFontSize === 34
            && settings.subtitleBottomOffset === expectedBottomOffset
            && settings.subtitleBackgroundOpacity === 0.35
            && settings.subtitleMiningPause === false
            && settings.subtitleHoverPause === false;
    }, { key: SETTINGS_KEY, expectedBottomOffset: bottomOffset }, { timeout: 6000 });
    const styleState = await readHostedSubtitleStyleState(page);
    assert(hostedSubtitleStyleControlsReady(styleState, bottomOffset), 'Hosted compact subtitle style controls did not update subtitle settings/style', styleState);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-style-controls.png'), fullPage: false });
    await page.locator('.jpdb-subtitle-rail [data-action="style"]').click();
    await page.waitForFunction(() => document.querySelector('[data-subtitle-style-popover]')?.hasAttribute('hidden') === true, null, { timeout: 6000 });
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click();
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row', { timeout: 6000 });
    return bottomOffset;
}

async function assertHostedSubtitleSettingsSyncedFromCompactControls(page, expectedBottomOffset) {
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('yomu-open-settings', { detail: { panel: 'media' } }));
    });
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    await page.locator('[data-action="settings-panel"][data-panel="media"]').click();
    const state = await readHostedSubtitleSettingsSyncState(page);
    assert(hostedSubtitleSettingsSynced(state, expectedBottomOffset), 'Compact subtitle controls did not stay in sync with the Settings dialog', state);
    await page.locator('.jpdb-reader-settings [data-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'));
}

async function readHostedSubtitleSettingsSyncState(page) {
    return page.evaluate(() => {
        const value = selector => document.querySelector(selector)?.value ?? '';
        const checked = selector => document.querySelector(selector)?.checked ?? null;
        const settings = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') || '{}');
        return {
            text: document.querySelector('.jpdb-reader-settings')?.textContent ?? '',
            fontSize: value('input[name="subtitleFontSize"]'),
            bottomOffset: value('input[name="subtitleBottomOffset"]'),
            backgroundOpacity: value('input[name="subtitleBackgroundOpacity"]'),
            fontFamily: value('select[name="subtitleFontFamily"]'),
            miningPause: checked('input[name="subtitleMiningPause"]'),
            hoverPause: checked('input[name="subtitleHoverPause"]'),
            saved: {
                fontSize: settings.subtitleFontSize,
                bottomOffset: settings.subtitleBottomOffset,
                backgroundOpacity: settings.subtitleBackgroundOpacity,
                fontFamily: settings.subtitleFontFamily,
                miningPause: settings.subtitleMiningPause,
                hoverPause: settings.subtitleHoverPause,
            },
        };
    });
}

function hostedSubtitleSettingsSynced(state, expectedBottomOffset) {
    return includesText(state.text, 'Pause video on subtitle click')
        && includesText(state.fontFamily, 'Noto Serif JP')
        && state.fontSize === '34'
        && state.bottomOffset === String(expectedBottomOffset)
        && Number(state.backgroundOpacity) === 0.35
        && state.miningPause === false
        && state.hoverPause === false
        && state.saved.fontSize === 34
        && state.saved.bottomOffset === expectedBottomOffset
        && state.saved.backgroundOpacity === 0.35
        && includesText(state.saved.fontFamily, 'Noto Serif JP')
        && state.saved.miningPause === false
        && state.saved.hoverPause === false;
}

async function setHostedSubtitleStyleControl(page, name, value) {
    await page.locator(`[data-subtitle-style-setting="${name}"]`).evaluate((control, nextValue) => {
        control.value = nextValue;
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

async function setHostedSubtitleBottomOffsetByDrag(page, targetBottomOffset) {
    const handle = page.locator('.jpdb-subtitle-text > [data-subtitle-drag-handle]').first();
    await handle.waitFor({ timeout: 6000 });
    const geometry = await page.evaluate(({ key, requested }) => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const settings = JSON.parse(localStorage.getItem(key) || '{}');
        const current = Number.isFinite(settings.subtitleBottomOffset)
            ? settings.subtitleBottomOffset
            : Number.parseFloat(root.style.getPropertyValue('--subtitle-bottom')) || 16;
        const rootRect = root.getBoundingClientRect();
        const referenceHeight = Math.max(1, rootRect.height || document.documentElement.clientHeight || window.innerHeight || 1);
        const next = Math.round(requested);
        return {
            current,
            target: next,
            deltaY: -((next - current) / 100) * referenceHeight,
        };
    }, { key: SETTINGS_KEY, requested: targetBottomOffset });
    const box = await handle.boundingBox();
    if (!box) throw new Error('subtitle drag handle did not expose a drag box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + geometry.deltaY, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(({ key, expected }) => {
        const settings = JSON.parse(localStorage.getItem(key) || '{}');
        return settings.subtitleBottomOffset === expected;
    }, { key: SETTINGS_KEY, expected: geometry.target }, { timeout: 6000 });
    return geometry.target;
}

async function setHostedSubtitleStyleFont(page) {
    await page.locator('[data-subtitle-style-setting="subtitleFontFamily"]').evaluate(select => {
        const option = Array.from(select.options).find(item => item.value.includes('Noto Serif JP'));
        if (!option) throw new Error('Japanese serif subtitle font preset not found');
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function readHostedSubtitleStyleState(page) {
    return page.evaluate(key => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const popover = document.querySelector('[data-subtitle-style-popover]');
        const settings = JSON.parse(localStorage.getItem(key) || '{}');
        const normalizeColor = value => {
            if (!value) return '';
            const probe = document.createElement('span');
            probe.style.color = value;
            document.body.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
        };
        const rootVars = root instanceof HTMLElement ? {
            surface2: getComputedStyle(root).getPropertyValue('--jpdb-reader-surface-2').trim(),
            text: getComputedStyle(root).getPropertyValue('--jpdb-reader-text').trim(),
            border: getComputedStyle(root).getPropertyValue('--jpdb-reader-border').trim(),
        } : null;
        return {
            expanded: document.querySelector('[data-action="style"]')?.getAttribute('aria-expanded'),
            popoverOpen: popover instanceof HTMLElement && !popover.hidden,
            text: popover?.textContent ?? '',
            controlCount: document.querySelectorAll('[data-subtitle-style-setting]').length,
            fontOptions: [...document.querySelectorAll('[data-subtitle-style-setting="subtitleFontFamily"] option')]
                .map(option => option.textContent?.trim() ?? ''),
            popoverStyle: popover instanceof HTMLElement ? {
                background: getComputedStyle(popover).backgroundColor,
                color: getComputedStyle(popover).color,
                borderColor: getComputedStyle(popover).borderColor,
            } : null,
            rootThemeVars: rootVars,
            rootThemeColors: rootVars ? {
                surface2: normalizeColor(rootVars.surface2),
                text: normalizeColor(rootVars.text),
                border: normalizeColor(rootVars.border),
            } : null,
            fontTarget: root?.style.getPropertyValue('--subtitle-font-size-target') ?? '',
            bottom: root?.style.getPropertyValue('--subtitle-bottom') ?? '',
            background: root?.style.getPropertyValue('--subtitle-background-rgba') ?? '',
            family: root?.style.getPropertyValue('--subtitle-family') ?? '',
            opacityOutput: document.querySelector('[data-subtitle-style-output="subtitleBackgroundOpacity"]')?.textContent ?? '',
            saved: {
                fontSize: settings.subtitleFontSize,
                bottomOffset: settings.subtitleBottomOffset,
                backgroundOpacity: settings.subtitleBackgroundOpacity,
                miningPause: settings.subtitleMiningPause,
                hoverPause: settings.subtitleHoverPause,
                fontFamily: settings.subtitleFontFamily,
            },
        };
    }, SETTINGS_KEY);
}

function hostedSubtitleStyleControlsReady(state, expectedBottomOffset) {
    return state.expanded === 'true'
        && state.popoverOpen
        && state.controlCount >= 6
        && includesText(state.text, 'Subtitle font size')
        && includesText(state.text, 'Pause video on subtitle click')
        && includesText(state.text, 'Pause video on subtitle hover')
        && ['Built-in font', 'Japanese sans', 'Hiragino / Yu Gothic', 'Japanese serif', 'System UI'].every(label => state.fontOptions.includes(label))
        && state.popoverStyle?.background === state.rootThemeColors?.surface2
        && state.popoverStyle?.color === state.rootThemeColors?.text
        && numericPx(state.fontTarget) >= 34
        && state.bottom === `${expectedBottomOffset}%`
        && includesText(state.background, ',0.35)')
        && includesText(state.family, 'Noto Serif JP')
        && state.opacityOutput === '35%'
        && state.saved.fontSize === 34
        && state.saved.bottomOffset === expectedBottomOffset
        && state.saved.backgroundOpacity === 0.35
        && state.saved.miningPause === false
        && state.saved.hoverPause === false
        && includesText(state.saved.fontFamily, 'Noto Serif JP');
}

function numericPx(value) {
    return Number.parseFloat(String(value).replace('px', '')) || 0;
}

async function verifyHostedSubtitleStyleControlsMobile(page, baseUrl) {
    await openHostedVideoPlayer(page, baseUrl);
    await assertHostedEmptyState(page, 'mobile');
    await loadHostedVideoAndSubtitleTogether(page);
    await pinHostedSubtitleControlRail(page);
    await page.locator('.jpdb-subtitle-rail [data-action="style"]').click();
    await page.waitForSelector('[data-subtitle-style-popover]:not([hidden])', { timeout: 6000 });
    const mobileState = await readHostedSubtitleStyleMobileState(page);
    assert(hostedSubtitleStyleMobileReady(mobileState), 'Hosted compact subtitle style controls did not fit/read well on mobile', mobileState);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-style-controls-mobile.png'), fullPage: false });
}

async function assertHostedFullscreenSubtitleOverlay(page) {
    await closeHostedTranscriptPanel(page);
    await page.locator('[data-fullscreen-toggle]').click();
    await page.waitForFunction(() => {
        const stage = document.querySelector('[data-yomu-video-frame]');
        const root = document.querySelector('.jpdb-subtitle-player');
        return document.fullscreenElement === stage
            && root?.parentElement === stage
            && root?.classList.contains('jpdb-subtitle-fullscreen')
            && !root?.classList.contains('jpdb-subtitle-video-out-of-view');
    }, null, { timeout: 6000 });
    const state = await readHostedFullscreenSubtitleState(page);
    assert(hostedFullscreenSubtitleReady(state), 'Hosted fullscreen did not keep Yomu subtitles inside the video frame', state);
    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-fullscreen-subtitles.png'), fullPage: false });
    await page.evaluate(() => document.exitFullscreen?.());
    await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 6000 });
    await openHostedLinesPanel(page);
}

async function verifyHostedFullscreenInlineFallbackMobile(page, baseUrl) {
    await openHostedVideoPlayer(page, baseUrl);
    await loadHostedVideoAndSubtitleTogether(page);
    await closeHostedTranscriptPanel(page);
    await enterHostedInlineFullscreenFallback(page);
    const state = await readHostedFullscreenSubtitleState(page);
    assert(hostedInlineFullscreenSubtitleReady(state), 'Hosted mobile inline fullscreen fallback did not keep Yomu subtitles inside the video frame', state);
    await captureAndExitHostedInlineFullscreen(page, 'feedback-video-fullscreen-mobile.png');
}

async function captureAndExitHostedInlineFullscreen(page, artifactName) {
    await page.screenshot({ path: path.join(ARTIFACTS, artifactName), fullPage: false });
    await page.locator('[data-fullscreen-toggle]').click();
    await page.waitForFunction(() => document.querySelector('[data-yomu-video-frame]')?.getAttribute('data-yomu-inline-fullscreen') !== 'true', null, { timeout: 6000 });
}

async function enterHostedInlineFullscreenFallback(page) {
    await page.evaluate(() => {
        const stage = document.querySelector('[data-yomu-video-frame]');
        if (!stage) return;
        for (const name of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen']) {
            Object.defineProperty(stage, name, { configurable: true, value: undefined });
        }
    });
    await page.locator('[data-fullscreen-toggle]').click();
    await page.waitForFunction(() => {
        const stage = document.querySelector('[data-yomu-video-frame]');
        const root = document.querySelector('.jpdb-subtitle-player');
        return stage?.getAttribute('data-yomu-inline-fullscreen') === 'true'
            && root?.parentElement === document.body
            && !stage.contains(root)
            && root?.classList.contains('jpdb-subtitle-fullscreen')
            && !root?.classList.contains('jpdb-subtitle-video-out-of-view');
    }, null, { timeout: 6000 });
}

async function injectHostedPausedFrameOcrLines(page) {
    await page.waitForSelector('[data-yomu-video-frame] .jpdb-ocr-video-frame', { state: 'attached', timeout: 5000 });
    await page.evaluate(() => {
        const frame = document.querySelector('[data-yomu-video-frame] .jpdb-ocr-video-frame');
        if (!(frame instanceof HTMLImageElement)) throw new Error('Paused OCR frame missing');
        Object.defineProperty(frame, 'naturalWidth', { configurable: true, value: 640 });
        Object.defineProperty(frame, 'naturalHeight', { configurable: true, value: 360 });
        frame.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 64, top: 72, width: 192, height: 54 } },
        ]);
        frame.dispatchEvent(new Event('load'));
    });
}

async function closeHostedTranscriptPanel(page) {
    const hidden = await page.evaluate(() => document.querySelector('.jpdb-subtitle-list')?.hidden === true);
    if (hidden) return;
    await pinHostedSubtitleControlRail(page);
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click();
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden === true, null, { timeout: 6000 });
}

async function readHostedFullscreenPausedOcrTapState(page) {
    return page.evaluate(() => {
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? {
                width: box.width,
                height: box.height,
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
            } : null;
        };
        const stage = document.querySelector('[data-yomu-video-frame]');
        const root = document.querySelector('.jpdb-subtitle-player');
        const rail = document.querySelector('.jpdb-subtitle-rail');
        const frame = document.querySelector('.jpdb-ocr-video-frame');
        const overlay = document.querySelector('.jpdb-ocr-layer');
        const line = document.querySelector('.jpdb-ocr-layer .jpdb-ocr-line');
        const word = document.querySelector('.jpdb-ocr-layer .jpdb-reader-word');
        const lineStyle = line ? getComputedStyle(line) : null;
        const visualGlyphs = line
            ? [...line.querySelectorAll('[data-yomu-ocr-visual-text]')]
            : [];
        const visualGlyphState = visualGlyphs.map(glyph => {
            const style = getComputedStyle(glyph);
            return {
                text: glyph.getAttribute('data-yomu-ocr-visual-text') ?? '',
                ariaHidden: glyph.getAttribute('aria-hidden'),
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                rect: rect(glyph),
            };
        });
        const underlyingTextNodes = (() => {
            if (!line) return -1;
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            let count = 0;
            while (walker.nextNode()) count += 1;
            return count;
        })();
        return {
            stageInline: stage?.getAttribute('data-yomu-inline-fullscreen') ?? null,
            stageActive: stage?.hasAttribute('data-fullscreen-active') ?? false,
            rootParentIsBody: root?.parentElement === document.body,
            stageContainsRoot: Boolean(stage && root && stage.contains(root)),
            rootFullscreenClass: root?.classList.contains('jpdb-subtitle-fullscreen') ?? false,
            rootOutOfView: root?.classList.contains('jpdb-subtitle-video-out-of-view') ?? true,
            railActions: [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => button.getAttribute('data-action')),
            railRect: rect(rail),
            frameParentIsStage: Boolean(stage && frame?.parentElement === stage),
            overlayParentIsStage: Boolean(stage && overlay?.parentElement === stage),
            frameHosted: frame?.getAttribute('data-yomu-ocr-fullscreen-hosted') ?? null,
            overlayHosted: overlay?.getAttribute('data-yomu-ocr-fullscreen-hosted') ?? null,
            ocrWords: document.querySelectorAll('.jpdb-ocr-layer .jpdb-reader-word').length,
            scannerIsolated: line?.querySelector('.jpdb-ocr-line-text')
                ?.classList.contains('jpdb-ocr-page-scanner-isolated') ?? false,
            visualGlyphText: visualGlyphState.map(glyph => glyph.text).join(''),
            visualGlyphState,
            underlyingTextNodes,
            lineAriaLabel: line?.getAttribute('aria-label') ?? '',
            lineOcrText: line?.getAttribute('data-ocr-text') ?? '',
            lineSentence: line?.getAttribute('data-sentence') ?? '',
            wordSurfaces: [...document.querySelectorAll('.jpdb-ocr-layer .jpdb-reader-word')]
                .map(element => element.getAttribute('data-surface') ?? ''),
            linePointerEvents: lineStyle?.pointerEvents ?? '',
            lineActive: line?.classList.contains('jpdb-ocr-line-active') ?? false,
            linePinned: line?.getAttribute('data-pinned') ?? '',
            lineRect: rect(line),
            wordRect: rect(word),
        };
    });
}

function hostedFullscreenPausedOcrReady(state) {
    return state.stageInline === 'true'
        && state.stageActive === true
        && state.rootParentIsBody
        && !state.stageContainsRoot
        && state.rootFullscreenClass
        && !state.rootOutOfView
        // The rail is transport-free (no fullscreen/playback buttons); the
        // panel toggle proves it re-rendered inside the fullscreen host.
        && state.railActions.includes('panel')
        && !state.railActions.includes('fullscreen')
        && (state.railRect?.width ?? 0) > 0
        && state.frameParentIsStage
        && state.overlayParentIsStage
        && state.frameHosted === 'true'
        && state.overlayHosted === 'true'
        && state.ocrWords > 0
        && state.scannerIsolated === true
        && state.visualGlyphText.endsWith('日本語')
        && state.visualGlyphState.length > 0
        && state.visualGlyphState.every(glyph => glyph.text.length > 0
            && glyph.ariaHidden === 'true'
            && glyph.display !== 'none'
            && glyph.visibility !== 'hidden'
            && Number(glyph.opacity) > 0
            && (glyph.rect?.width ?? 0) > 0
            && (glyph.rect?.height ?? 0) > 0)
        && state.underlyingTextNodes === 0
        && state.lineAriaLabel === '日本語'
        && state.lineOcrText === '日本語'
        && state.lineSentence === '日本語'
        && state.wordSurfaces.join('') === '日本語'
        && state.linePointerEvents !== 'none'
        && (state.lineRect?.width ?? 0) > 0
        && (state.wordRect?.width ?? 0) > 0;
}

function hostedFullscreenPausedOcrTapped(state) {
    return hostedFullscreenPausedOcrReady(state)
        && state.lineActive === true
        && state.linePinned === 'true';
}

async function openHostedLinesPanel(page) {
    const open = await page.evaluate(() => Boolean(document.querySelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row')));
    if (open) return;
    await pinHostedSubtitleControlRail(page);
    await page.locator('.jpdb-subtitle-rail [data-action="panel"]').click();
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row', { timeout: 6000 });
}

async function readHostedFullscreenSubtitleState(page) {
    return page.evaluate(() => {
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? {
                width: box.width,
                height: box.height,
                left: box.left,
                top: box.top,
                right: box.right,
                bottom: box.bottom,
            } : null;
        };
        const stage = document.querySelector('[data-yomu-video-frame]');
        const root = document.querySelector('.jpdb-subtitle-player');
        const line = document.querySelector('.jpdb-subtitle-lines');
        const panel = document.querySelector('.jpdb-subtitle-list');
        const toggle = document.querySelector('[data-fullscreen-toggle]');
        return {
            fullscreenTag: document.fullscreenElement?.tagName ?? null,
            documentInlineClass: document.documentElement.classList.contains('jpdb-subtitle-inline-fullscreen'),
            stageInline: stage?.getAttribute('data-yomu-inline-fullscreen') ?? null,
            stageActive: stage?.hasAttribute('data-fullscreen-active') ?? false,
            rootParentIsStage: Boolean(stage && root?.parentElement === stage),
            rootParentIsBody: root?.parentElement === document.body,
            stageContainsRoot: Boolean(stage && root && stage.contains(root)),
            rootFullscreenClass: root?.classList.contains('jpdb-subtitle-fullscreen') ?? false,
            rootOutOfView: root?.classList.contains('jpdb-subtitle-video-out-of-view') ?? true,
            rootRect: rect(root),
            stageRect: rect(stage),
            panelHidden: panel?.hidden ?? null,
            // Base text only: furigana annotations (rt readings and their rp
            // parens) are legitimate in the cue line — the contract is that
            // the cue's BASE text survives fullscreen, decorated or not.
            lineText: (() => {
                if (!line) return '';
                const clone = line.cloneNode(true);
                clone.querySelectorAll('rt,rp').forEach(node => node.remove());
                return clone.textContent ?? '';
            })(),
            toggleLabel: toggle?.getAttribute('aria-label') ?? '',
            toggleVisible: toggle ? getComputedStyle(toggle).display !== 'none' : false,
            viewport: { width: window.innerWidth, height: window.innerHeight },
        };
    });
}

function hostedFullscreenSubtitleReady(state) {
    return state.fullscreenTag === 'SECTION'
        && state.stageActive === true
        && state.rootParentIsStage
        && state.rootFullscreenClass
        && !state.rootOutOfView
        && state.panelHidden === true
        && state.toggleVisible
        && includesText(state.toggleLabel, 'Exit fullscreen')
        && includesText(state.lineText, '猫を見る')
        && fullscreenRectFillsViewport(state);
}

function hostedInlineFullscreenSubtitleReady(state) {
    return state.fullscreenTag === null
        && state.documentInlineClass
        && state.stageInline === 'true'
        && state.stageActive === true
        && state.rootParentIsBody
        && !state.stageContainsRoot
        && state.rootFullscreenClass
        && !state.rootOutOfView
        && state.panelHidden === true
        && state.toggleVisible
        && includesText(state.toggleLabel, 'Exit fullscreen')
        && includesText(state.lineText, '猫を見る')
        && fullscreenStageFillsViewport(state)
        && fullscreenRootFitsInsideStage(state);
}

function fullscreenRectFillsViewport(state) {
    const rect = state.rootRect;
    if (!rect) return false;
    return rect.left <= 1
        && rect.top <= 1
        && rect.width >= state.viewport.width - 2
        && rect.height >= state.viewport.height - 2;
}

function fullscreenStageFillsViewport(state) {
    const rect = state.stageRect;
    if (!rect) return false;
    return rect.left <= 1
        && rect.top <= 1
        && rect.width >= state.viewport.width - 2
        && rect.height >= state.viewport.height - 2;
}

function fullscreenRootFitsInsideStage(state) {
    const root = state.rootRect;
    const stage = state.stageRect;
    if (!root || !stage) return false;
    return root.width >= Math.min(260, state.viewport.width * 0.65)
        && root.height >= 120
        && root.left >= stage.left - 1
        && root.top >= stage.top - 1
        && root.right <= stage.right + 1
        && root.bottom <= stage.bottom + 1;
}

async function readHostedSubtitleStyleMobileState(page) {
    return page.evaluate(() => {
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? { width: box.width, height: box.height, left: box.left, right: box.right } : null;
        };
        const normalizeColor = value => {
            if (!value) return '';
            const probe = document.createElement('span');
            probe.style.color = value;
            document.body.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
        };
        const popover = document.querySelector('[data-subtitle-style-popover]');
        const root = document.querySelector('.jpdb-subtitle-player');
        const rootVars = root instanceof HTMLElement ? {
            surface2: getComputedStyle(root).getPropertyValue('--jpdb-reader-surface-2').trim(),
            text: getComputedStyle(root).getPropertyValue('--jpdb-reader-text').trim(),
        } : null;
        const label = document.querySelector('.jpdb-subtitle-style-field > span');
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            rail: rect(document.querySelector('.jpdb-subtitle-rail')),
            popover: rect(popover),
            popoverBackground: popover ? getComputedStyle(popover).backgroundColor : '',
            labelColor: label ? getComputedStyle(label).color : '',
            rootThemeColors: rootVars ? {
                surface2: normalizeColor(rootVars.surface2),
                text: normalizeColor(rootVars.text),
            } : null,
            controlCount: document.querySelectorAll('[data-subtitle-style-setting]').length,
        };
    });
}

function hostedSubtitleStyleMobileReady(state) {
    return Boolean(state.popover)
        && state.controlCount >= 6
        && state.popover.left >= 0
        && state.popover.right <= state.viewport.width + 1
        && state.popover.width >= 260
        && state.rail?.right <= state.viewport.width + 1
        && rgbAlpha(state.popoverBackground) >= 0.98
        && state.popoverBackground === state.rootThemeColors?.surface2
        && state.labelColor === state.rootThemeColors?.text;
}

function rgbParts(value) {
    return String(value).match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
}

function rgbBrightness(value) {
    const parts = rgbParts(value).slice(0, 3);
    if (parts.length < 3) return 0;
    return (parts[0] + parts[1] + parts[2]) / 3;
}

function rgbAlpha(value) {
    const parts = rgbParts(value);
    return parts.length >= 4 ? parts[3] : parts.length >= 3 ? 1 : 0;
}

function isTransparentCssValue(value) {
    const normalized = String(value).trim().toLowerCase();
    return normalized === '' || normalized === 'transparent' || normalized === '#0000' || normalized === 'rgba(0, 0, 0, 0)';
}

function readableCssContrast(foreground, background, target = 4.5) {
    const fg = rgbParts(foreground).slice(0, 3);
    const bg = rgbParts(background).slice(0, 3);
    if (fg.length < 3 || bg.length < 3) return false;
    return contrastRatioFromRgb(fg, bg) >= target;
}

function readableCssContrastOnPaint(foreground, paint, backdrop, target = 4.5) {
    return readableCssContrast(foreground, effectivePaintCss(paint, backdrop), target);
}

function effectivePaintCss(paint, backdrop) {
    const paintParts = rgbParts(paint);
    const backdropParts = rgbParts(backdrop);
    if (paintParts.length < 3) return backdrop;
    if (paintParts.length < 4 || paintParts[3] >= 1 || backdropParts.length < 3) return paint;
    const alpha = paintParts[3];
    const blended = paintParts.slice(0, 3).map((channel, index) => Math.round(channel * alpha + backdropParts[index] * (1 - alpha)));
    return `rgb(${blended[0]}, ${blended[1]}, ${blended[2]})`;
}

function contrastRatioFromRgb(a, b) {
    const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
    const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
    return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(parts) {
    const [r, g, b] = parts.map(channel => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function readHostedVideoAndSubtitleTogetherState(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return {
            inputMultiple: document.querySelector('[data-video-input]')?.hasAttribute('multiple') === true,
            status: document.querySelector('[data-status]')?.textContent ?? '',
            rows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
            text: panel?.textContent ?? '',
        };
    });
}

async function assertHostedTracksPanel(page) {
    const tracksPanel = await readHostedTracksPanelState(page);
    assert(tracksPanel.jimakuText === 'Find subtitles', 'Jimaku subtitle search link was missing from the hosted video toolbar', tracksPanel);
    assert(tracksPanel.jimakuHref === 'https://jimaku.cc/', 'Jimaku subtitle search link points to the wrong URL', tracksPanel);
    assert(tracksPanel.jimakuTarget === '_blank' && tracksPanel.jimakuRel.includes('noopener'), 'Jimaku subtitle search link should open safely in a new tab', tracksPanel);
    assert(tracksPanel.jimakuAnimeText === 'Search anime subtitles', 'Jimaku anime search link was missing from the subtitle tracks panel', tracksPanel);
    assert(tracksPanel.jimakuAnimeHref === 'https://jimaku.cc/opensearch/redirect?anime=true&query=local-video', 'Jimaku anime search link points to the wrong URL', tracksPanel);
    assert(tracksPanel.jimakuAnimeTarget === '_blank' && tracksPanel.jimakuAnimeRel.includes('noopener'), 'Jimaku anime search link should open safely in a new tab', tracksPanel);
    assert(tracksPanel.title === 'Subtitles', 'Subtitles button did not open the Yomu tracks panel', tracksPanel);
    assert(tracksPanelHasLoadActions(tracksPanel), 'Track loading actions were not intuitive after clicking Subtitles', tracksPanel);
}

async function assertHostedTracksPanelControls(page) {
    const tracksPanel = await readHostedTracksPanelState(page);
    assert(tracksPanelControlsReady(tracksPanel), 'Subtitle drawer controls did not expose auto-hide and docking actions', tracksPanel);
}

async function readHostedTracksPanelState(page) {
    return page.evaluate(() => {
        const text = selector => document.querySelector(selector)?.textContent?.trim() ?? '';
        const attribute = (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? '';
        const link = selector => {
            const anchor = document.querySelector(selector);
            if (!(anchor instanceof HTMLAnchorElement)) return { text: '', href: '', target: '', rel: '' };
            return {
                text: anchor.textContent?.trim() ?? '',
                href: anchor.href,
                target: anchor.target,
                rel: anchor.rel,
            };
        };
        const subtitleList = document.querySelector('.jpdb-subtitle-list');
        const jimaku = link('[data-jimaku-link]');
        const jimakuAnime = link('[data-jimaku-anime-search]');
        return {
            title: text('.jpdb-subtitle-drawer-title'),
            text: subtitleList?.textContent ?? '',
            hidden: subtitleList?.hidden,
            jimakuText: jimaku.text,
            jimakuHref: jimaku.href,
            jimakuTarget: jimaku.target,
            jimakuRel: jimaku.rel,
            jimakuAnimeText: jimakuAnime.text,
            jimakuAnimeHref: jimakuAnime.href,
            jimakuAnimeTarget: jimakuAnime.target,
            jimakuAnimeRel: jimakuAnime.rel,
            primaryLoadText: text('.jpdb-subtitle-track-tools [data-action="load"]'),
            secondaryLoadText: text('.jpdb-subtitle-track-tools [data-action="load-secondary"]'),
            autoHideText: text('[data-action="toggle-pause-panel"]'),
            autoHidePressed: attribute('[data-action="toggle-pause-panel"]', 'aria-pressed'),
            placementButtons: document.querySelectorAll('[data-action="transcript-placement"][data-placement]').length,
        };
    });
}

function tracksPanelHasLoadActions(tracksPanel) {
    return tracksPanel.primaryLoadText === 'Load Japanese subtitles'
        && tracksPanel.secondaryLoadText === 'Load English subtitles';
}

function tracksPanelControlsReady(tracksPanel) {
    return tracksPanel.autoHideText.startsWith('Auto') && tracksPanel.autoHidePressed === 'false' && tracksPanel.placementButtons === 3;
}

async function loadPrimarySubtitleTrack(page) {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('.jpdb-subtitle-track-tools [data-action="load"]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles(primaryVttPath);
    await page.waitForSelector('.jpdb-subtitle-track-row.active', { timeout: 6000 });
}

async function enableHostedPausePanel(page) {
    // The auto toggle sits inside the collapsed panel-options popover.
    await page.locator('[data-action="toggle-pause-panel"]').evaluate(button => button.click());
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row', { timeout: 6000 });
    const autoHideEnabled = await readHostedAutoHideState(page);
    assert(autoHideEnabled.saved === true && autoHideEnabled.pressed === 'true', 'Auto-hide toggle did not save the pause panel mode', autoHideEnabled);
}

async function readHostedAutoHideState(page) {
    return page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') || '{}');
        return {
            saved: settings.subtitlePausePanel,
            pressed: document.querySelector('[data-action="toggle-pause-panel"]')?.getAttribute('aria-pressed'),
        };
    });
}

async function assertHostedPausePanelOnPause(page) {
    await dispatchHostedVideoEvent(page, 'play');
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden === true);
    const hiddenLayout = await readHostedPlayerLayoutState(page);
    assert(hostedPlayerLayoutRestored(hiddenLayout), 'Hosted video player did not restore full-width controls after hiding the subtitle panel', hiddenLayout);

    await dispatchHostedVideoEvent(page, 'pause');
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row', { timeout: 6000 });

    const pausePanel = await readHostedPausePanelState(page);
    assert(pausePanel.rows >= 2, 'Pause-only side panel did not show loaded subtitle lines', pausePanel);
    assert(hostedPausePanelHasExpectedText(pausePanel), 'Pause-only side panel did not show the expected subtitle text', pausePanel);
    assert(hostedPausePanelFitsViewport(pausePanel), 'Pause-only side panel was not laid out cleanly', pausePanel);
}

async function dispatchHostedVideoEvent(page, eventName) {
    await page.evaluate(name => {
        const video = document.querySelector('video');
        const shouldUpdatePlaybackState = video ? new Set(['play', 'playing', 'pause']).has(name) : false;
        if (shouldUpdatePlaybackState) {
            Object.defineProperty(video, 'paused', { configurable: true, value: name === 'pause' });
            Object.defineProperty(video, 'ended', { configurable: true, value: false });
        }
        video?.dispatchEvent(new Event(name));
    }, eventName);
}

async function requestHostedPausedVideoFrameOcr(page) {
    await page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) throw new Error('Hosted video element missing');
        document.dispatchEvent(new CustomEvent('yomu-ocr-video-frame-request', { detail: { video } }));
    });
}

async function readHostedPlayerLayoutState(page) {
    return page.evaluate(() => {
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? {
                width: box.width,
                height: box.height,
                left: box.left,
                right: box.right,
            } : null;
        };
        const root = document.documentElement;
        const stageArea = document.querySelector('.stage-area');
        const stage = document.querySelector('[data-yomu-video-frame]');
        const video = document.querySelector('video');
        const panel = document.querySelector('.jpdb-subtitle-list');
        return {
            rootClasses: root.className,
            insetVar: root.style.getPropertyValue('--jpdb-subtitle-video-inset'),
            panelHidden: panel?.hidden ?? null,
            stageArea: rect(stageArea),
            stage: rect(stage),
            video: rect(video),
            stageStyle: stage instanceof HTMLElement ? {
                width: stage.style.width,
                maxWidth: stage.style.maxWidth,
                height: stage.style.height,
                maxHeight: stage.style.maxHeight,
                marginLeft: stage.style.marginLeft,
                marginRight: stage.style.marginRight,
                justifySelf: stage.style.justifySelf,
            } : null,
            videoStyle: video instanceof HTMLElement ? {
                width: video.style.width,
                maxWidth: video.style.maxWidth,
                height: video.style.height,
                maxHeight: video.style.maxHeight,
                minHeight: video.style.minHeight,
                objectFit: video.style.objectFit,
            } : null,
        };
    });
}

function hostedPlayerLayoutRestored(layout) {
    const widthTolerance = 6;
    const stageWidth = layout.stage?.width ?? 0;
    const videoWidth = layout.video?.width ?? 0;
    const stageAreaWidth = layout.stageArea?.width ?? 0;
    const staleInset = /jpdb-subtitle-video-inset-(left|right|bottom)/.test(layout.rootClasses)
        || Boolean(layout.insetVar);
    return layout.panelHidden === true
        && !staleInset
        && stageAreaWidth > 0
        && stageWidth >= stageAreaWidth - widthTolerance
        && Math.abs(videoWidth - stageWidth) <= widthTolerance;
}

async function readHostedOnVideoSubtitleState(page) {
    return page.evaluate(() => {
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? {
                width: box.width,
                height: box.height,
                left: box.left,
                right: box.right,
            } : null;
        };
        const root = document.querySelector('.jpdb-subtitle-player');
        const text = document.querySelector('.jpdb-subtitle-text');
        const line = document.querySelector('.jpdb-subtitle-lines');
        const panel = document.querySelector('.jpdb-subtitle-list');
        const rootStyle = root ? getComputedStyle(root) : null;
        const textStyle = text ? getComputedStyle(text) : null;
        const lineStyle = line ? getComputedStyle(line) : null;
        return {
            panelHidden: panel?.hidden ?? null,
            rootHidden: root?.hidden ?? null,
            rootHiddenClass: root?.classList.contains('jpdb-subtitle-hidden') ?? null,
            rootOutOfView: root?.classList.contains('jpdb-subtitle-video-out-of-view') ?? null,
            rootDisplay: rootStyle?.display ?? null,
            rootVisibility: rootStyle?.visibility ?? null,
            textDisplay: textStyle?.display ?? null,
            textVisibility: textStyle?.visibility ?? null,
            lineDisplay: lineStyle?.display ?? null,
            lineVisibility: lineStyle?.visibility ?? null,
            lineText: (() => {
                if (!line) return '';
                const clone = line.cloneNode(true);
                clone.querySelectorAll('rt,rp').forEach(node => node.remove());
                return clone.textContent ?? '';
            })(),
            textRect: rect(text),
            lineRect: rect(line),
        };
    });
}

function hostedOnVideoSubtitleVisible(state) {
    const lineRect = state.lineRect;
    const textRect = state.textRect;
    return state.panelHidden === true
        && state.rootHidden === false
        && state.rootHiddenClass === false
        && state.rootOutOfView === false
        && state.rootDisplay !== 'none'
        && state.rootVisibility !== 'hidden'
        && state.textDisplay !== 'none'
        && state.textVisibility !== 'hidden'
        && state.lineDisplay !== 'none'
        && state.lineVisibility !== 'hidden'
        && includesText(state.lineText, '猫を見る')
        && Boolean(lineRect)
        && Boolean(textRect)
        && lineRect.width > 0
        && lineRect.height > 0
        && textRect.width > 0
        && textRect.height > 0;
}

function hostedSubtitleOverlayVisible(state) {
    const rootRect = state.rootRect;
    const lineRect = state.lineRect;
    return state.panelHidden === true
        && state.rootHidden === false
        && state.rootHiddenClass === false
        && state.rootOutOfView === false
        && state.rootDisplay !== 'none'
        && state.rootVisibility !== 'hidden'
        && state.lineDisplay !== 'none'
        && state.lineVisibility !== 'hidden'
        && includesText(state.lineText, '猫を見る')
        && Boolean(rootRect)
        && Boolean(lineRect)
        && rootRect.width > 0
        && rootRect.height > 0
        && lineRect.width > 0
        && lineRect.height > 0;
}

async function readHostedPausePanelState(page) {
    const panel = page.locator('.jpdb-subtitle-list').first();
    const [rows, text, hidden, rect, viewport] = await Promise.all([
        page.locator('.jpdb-subtitle-list-row').count(),
        panel.textContent(),
        panel.evaluate(element => element.hidden),
        panel.boundingBox(),
        readViewportSize(page),
    ]);
    return {
        rows,
        text: text ?? '',
        hidden,
        rect: positionRect(rect),
        viewport,
    };
}

async function readViewportSize(page) {
    return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

function positionRect(rect) {
    if (!rect) return null;
    return { width: rect.width, height: rect.height, left: rect.x, right: rect.x + rect.width };
}

function hostedPausePanelHasExpectedText(pausePanel) {
    const text = pausePanel.text.replace(/[（(][ぁ-んァ-ンー]+[）)]/g, '');
    return text.includes('猫を見る') && text.includes('犬と鳥を見る');
}

function hostedPausePanelFitsViewport(pausePanel) {
    return Boolean(pausePanel.rect && pausePanel.rect.width >= 260 && pausePanel.rect.right <= pausePanel.viewport.width + 1);
}

const { server, baseUrl } = await createFixtureServer(serveFeedbackFixtureRequest, 'Could not bind feedback smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const settingsPage = await newPage(browser);
    await verifySettingsDiscoverability(settingsPage, baseUrl);
    await settingsPage.close();

    const keyboardPage = await newPage(browser);
    await verifyKeyboardWordNavigation(keyboardPage, baseUrl);
    await keyboardPage.close();

    const styleContainmentPage = await newPage(browser, {
        ...baseSettings,
        theme: 'dark',
        wordHighlightColorSource: 'jpdb',
        wordTextColorSource: 'status',
    });
    await verifyGenericPassiveStyleContainment(styleContainmentPage, baseUrl);
    await styleContainmentPage.close();

    const videoPage = await newPage(browser, baseSettings, { width: 1440, height: 900 });
    await verifyHostedSubtitleFlow(videoPage, baseUrl);
    await videoPage.close();

    const mobileVideoPage = await newPage(browser, baseSettings, { width: 390, height: 844 });
    await verifyHostedSubtitleStyleControlsMobile(mobileVideoPage, baseUrl);
    await mobileVideoPage.close();

    const mobileFullscreenPage = await newPage(browser, baseSettings, { width: 390, height: 844 });
    await verifyHostedFullscreenInlineFallbackMobile(mobileFullscreenPage, baseUrl);
    await mobileFullscreenPage.close();

    const mobileFullscreenOcrPage = await newPage(browser, baseSettings, { width: 390, height: 844 });
    await verifyHostedFullscreenPausedOcrTapabilityMobile(mobileFullscreenOcrPage, baseUrl);
    await mobileFullscreenOcrPage.close();

    console.log(JSON.stringify({
        ok: true,
        artifacts: [
            path.join(ARTIFACTS, 'feedback-settings-font.png'),
            path.join(ARTIFACTS, 'feedback-keyboard-word-nav.png'),
            path.join(ARTIFACTS, 'feedback-generic-style-containment.png'),
            path.join(ARTIFACTS, 'feedback-video-empty-desktop.png'),
            path.join(ARTIFACTS, 'feedback-video-empty-mobile.png'),
            path.join(ARTIFACTS, 'feedback-video-open-with-subtitles.png'),
            path.join(ARTIFACTS, 'feedback-video-panel-hidden-subtitles.png'),
            path.join(ARTIFACTS, 'feedback-video-theme-toggle.png'),
            path.join(ARTIFACTS, 'feedback-video-paused-ocr.png'),
            path.join(ARTIFACTS, 'feedback-video-style-controls.png'),
            path.join(ARTIFACTS, 'feedback-video-style-controls-mobile.png'),
            path.join(ARTIFACTS, 'feedback-video-fullscreen-subtitles.png'),
            path.join(ARTIFACTS, 'feedback-video-fullscreen-mobile.png'),
            path.join(ARTIFACTS, 'feedback-video-fullscreen-paused-ocr.png'),
            path.join(ARTIFACTS, 'feedback-video-pause-panel.png'),
        ],
    }, null, 2));
} finally {
    await browser.close();
    await closeServer(server);
}
