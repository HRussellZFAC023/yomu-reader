#!/usr/bin/env node
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const SCRIPT_PATH = path.join(ROOT, 'dist', 'yomu.user.js');
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const PUBLIC_DIR = path.join(ROOT, 'docs', 'public');
const VIDEO_PLAYER_PATH = path.join(ROOT, 'docs', 'public', 'video-player', 'index.html');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const OPEN_SETTINGS_EVENT = 'yomu-open-settings';
const JPDB_FONT_STACK = '"Nunito Sans", "Extra Sans JP", "Noto Sans Symbols2", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans GB", "Meiryo", sans-serif';

mkdirSync(ARTIFACTS, { recursive: true });

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
    subtitlePausePanel: false,
    subtitleTranscriptPlacement: 'right',
    subtitleTranscriptAutoScroll: true,
    showFloatingButton: false,
    enableLogging: false,
    shortcuts: {
        scanPage: 'Alt+J',
        hoverLookup: '',
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousLookupWord: 'Alt+Shift+ArrowLeft',
        nextLookupWord: 'Alt+Shift+ArrowRight',
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
  </main>
</body>
</html>`;

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

function createFixtureServer() {
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/' || url.pathname === '/reader-fixture.html') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(readerFixtureHtml);
            return;
        }
        if (url.pathname === '/video-player/index.html') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(readFileSync(VIDEO_PLAYER_PATH, 'utf8'));
            return;
        }
        if (url.pathname === '/yomu.user.js' || url.pathname === '/video-player/yomu.user.js' || url.pathname === '/yomu-reader/yomu.user.js') {
            serveFile(response, SCRIPT_PATH, 'application/javascript; charset=utf-8', request.method);
            return;
        }
        if (url.pathname === '/yomu.css' || url.pathname === '/video-player/yomu.css' || url.pathname === '/yomu-reader/yomu.css') {
            serveFile(response, CSS_PATH, 'text/css; charset=utf-8', request.method);
            return;
        }
        if (url.pathname === '/yomu-icon.svg' || url.pathname === '/video-player/yomu-icon.svg' || url.pathname === '/yomu-reader/yomu-icon.svg') {
            serveFile(response, path.join(PUBLIC_DIR, 'yomu-icon.svg'), 'image/svg+xml; charset=utf-8', request.method);
            return;
        }
        if (url.pathname === '/favicon-32x32.png' || url.pathname === '/favicon-16x16.png' || url.pathname === '/apple-touch-icon.png') {
            serveFile(response, path.join(PUBLIC_DIR, url.pathname.slice(1)), 'image/png', request.method);
            return;
        }
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') reject(new Error('Could not bind feedback smoke server'));
            else resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
    });
}

function serveFile(response, filePath, contentType, method = 'GET') {
    response.writeHead(200, { 'content-type': contentType });
    response.end(method === 'HEAD' ? undefined : readFileSync(filePath));
}

async function newPage(browser, settings = baseSettings, viewport = { width: 1360, height: 900 }) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, { key: SETTINGS_KEY, value: settings });
    return page;
}

async function injectUserscript(page) {
    const css = readFileSync(CSS_PATH, 'utf8');
    await page.addStyleTag({ content: css });
    await page.evaluate(readerCss => {
        window.GM_getResourceText = name => name === 'yomuCss' ? readerCss : '';
    }, css);
    await page.addScriptTag({ path: SCRIPT_PATH });
    await page.waitForTimeout(300);
}

async function openSettings(page, panel = 'basics') {
    await page.evaluate(({ eventName, panelName }) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail: { panel: panelName } }));
    }, { eventName: OPEN_SETTINGS_EVENT, panelName: panel });
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
}

async function verifySettingsDiscoverability(page, baseUrl) {
    await page.goto(`${baseUrl}/reader-fixture.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await openSettings(page, 'basics');
    await page.locator('select[name="popupFontFamily"], input[name="popupFontFamily"]').first().scrollIntoViewIfNeeded();
    await page.locator('.jpdb-reader-settings').screenshot({ path: path.join(ARTIFACTS, 'feedback-settings-font.png') });

    const basics = await page.evaluate(() => {
        const font = document.querySelector('select[name="popupFontFamily"], input[name="popupFontFamily"]');
        const weight = document.querySelector('input[name="popupFontWeight"]');
        const fontRect = font?.getBoundingClientRect();
        const weightRect = weight?.getBoundingClientRect();
        return {
            title: document.querySelector('.jpdb-reader-settings h2')?.textContent?.trim(),
            fontValue: font?.value,
            weightValue: weight?.value,
            fontVisible: Boolean(fontRect && fontRect.width > 100 && fontRect.height >= 24),
            weightVisible: Boolean(weightRect && weightRect.width > 60 && weightRect.height >= 24),
        };
    });
    assert(basics.title === 'よむ Settings', 'Settings dialog did not open');
    assert(basics.fontValue?.includes('Nunito Sans') && basics.fontValue?.includes('Noto Sans JP'), 'JPDB-like popup font setting was not visible or correct', basics);
    assert(basics.weightValue === '400', 'Popup Japanese weight did not default to readable regular weight', basics);
    assert(basics.fontVisible && basics.weightVisible, 'Popup font controls were clipped or hidden', basics);

    await page.locator('[data-action="settings-panel"][data-panel="shortcuts"]').click();
    const shortcuts = await page.evaluate(() => ({
        previous: document.querySelector('input[name="shortcuts.previousLookupWord"]')?.value,
        next: document.querySelector('input[name="shortcuts.nextLookupWord"]')?.value,
        visibleText: document.querySelector('.jpdb-reader-settings')?.textContent ?? '',
    }));
    assert(shortcuts.previous === 'Alt+Shift+ArrowLeft', 'Previous word shortcut missing from settings', shortcuts);
    assert(shortcuts.next === 'Alt+Shift+ArrowRight', 'Next word shortcut missing from settings', shortcuts);
    assert(shortcuts.visibleText.includes('Previous word') && shortcuts.visibleText.includes('Next word'), 'Word navigation shortcut labels were not discoverable', shortcuts);

    await page.locator('[data-action="settings-panel"][data-panel="media"]').click();
    const media = await page.evaluate(() => ({
        pausePanel: document.querySelector('input[name="subtitlePausePanel"]') instanceof HTMLInputElement,
        text: document.querySelector('.jpdb-reader-settings')?.textContent ?? '',
    }));
    assert(media.pausePanel && media.text.includes('Open side panel when paused'), 'Pause-only subtitle panel setting was not discoverable', media);
}

async function verifyKeyboardWordNavigation(page, baseUrl) {
    await page.goto(`${baseUrl}/reader-fixture.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);

    await pressWordNavigationShortcut(page, 'ArrowRight');
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-keyboard-active')?.textContent?.trim() === '猫');

    await pressWordNavigationShortcut(page, 'ArrowRight');
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-keyboard-active')?.textContent?.trim() === '犬');
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-popover')?.textContent?.includes('犬'));

    const popupStyle = await page.evaluate(() => {
        const spelling = document.querySelector('.jpdb-reader-spelling');
        const style = spelling ? getComputedStyle(spelling) : null;
        return {
            active: document.querySelector('.jpdb-reader-keyboard-active')?.textContent?.trim(),
            popoverText: document.querySelector('.jpdb-reader-popover')?.textContent ?? '',
            popupFontVar: getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-popup-font'),
            fontFamily: style?.fontFamily ?? '',
            fontWeight: style?.fontWeight ?? '',
        };
    });
    assert(popupStyle.active === '犬', 'Keyboard next shortcut did not move to the next word', popupStyle);
    assert(popupStyle.popoverText.includes('犬'), 'Keyboard lookup did not open the expected word popup', popupStyle);
    assert(popupStyle.popupFontVar.includes('Nunito Sans') && popupStyle.popupFontVar.includes('Noto Sans JP'), 'Popup JPDB font variable was not applied', popupStyle);
    assert(popupStyle.fontFamily.includes('Nunito Sans') || popupStyle.fontFamily.includes('Noto Sans JP'), 'Popup Japanese text did not use the configured font stack', popupStyle);
    assert(Number(popupStyle.fontWeight) <= 450, 'Popup Japanese text rendered too bold by default', popupStyle);

    await page.evaluate(() => {
        const words = [...document.querySelectorAll('.jpdb-reader-word')];
        const range = document.createRange();
        range.setStartBefore(words[1]);
        range.setEndAfter(words[2]);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    });
    await pressWordNavigationShortcut(page, 'ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-keyboard-active')?.textContent?.trim() === '犬');
    await pressWordNavigationShortcut(page, 'ArrowLeft');
    await page.waitForTimeout(150);
    const selectedScope = await page.evaluate(() => document.querySelector('.jpdb-reader-keyboard-active')?.textContent?.trim());
    assert(selectedScope === '犬', 'Keyboard navigation escaped the selected text range at the boundary', { selectedScope });
    await pressWordNavigationShortcut(page, 'ArrowRight');
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-keyboard-active')?.textContent?.trim() === '鳥');

    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-keyboard-word-nav.png'), fullPage: false });
}

async function pressWordNavigationShortcut(page, key) {
    await page.keyboard.down('Alt');
    await page.keyboard.down('Shift');
    await page.keyboard.press(key);
    await page.keyboard.up('Shift');
    await page.keyboard.up('Alt');
}

async function verifyHostedSubtitleFlow(page, baseUrl) {
    await page.goto(`${baseUrl}/video-player/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized && document.querySelector('.jpdb-subtitle-player')), { timeout: 6000 });

    const brandIcon = await page.evaluate(() => {
        const image = document.querySelector('[data-yomu-brand-icon]');
        const rect = image?.getBoundingClientRect();
        return {
            complete: image instanceof HTMLImageElement && image.complete,
            naturalWidth: image instanceof HTMLImageElement ? image.naturalWidth : 0,
            naturalHeight: image instanceof HTMLImageElement ? image.naturalHeight : 0,
            rect: rect ? { width: rect.width, height: rect.height } : null,
        };
    });
    assert(brandIcon.complete && brandIcon.naturalWidth > 0 && brandIcon.naturalHeight > 0 && brandIcon.rect?.width === 36, 'Hosted video brand icon did not render', brandIcon);

    await page.locator('[data-overflow-summary]').click();
    await page.locator('[data-settings-trigger]').click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });
    const hostedSettings = await page.evaluate(() => ({
        title: document.querySelector('.jpdb-reader-settings h2')?.textContent?.trim(),
        visible: Boolean(document.querySelector('.jpdb-reader-settings')),
        hasFontControl: Boolean(document.querySelector('select[name="popupFontFamily"], input[name="popupFontFamily"]')),
    }));
    assert(hostedSettings.title === 'よむ Settings' && hostedSettings.visible && hostedSettings.hasFontControl, 'Hosted Settings menu item did not open the Yomu settings dialog', hostedSettings);
    await page.locator('.jpdb-reader-settings [data-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'));

    await page.locator('[data-subtitle-open]').click();
    await page.waitForFunction(() => /Open a video first/.test(document.querySelector('[data-status]')?.textContent ?? ''));

    await page.setInputFiles('[data-video-input]', fakeVideoPath);
    await page.waitForFunction(() => /local-video\.mp4/.test(document.querySelector('[data-status]')?.textContent ?? ''));
    await page.locator('[data-subtitle-open]').click();
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-tracks-panel:not([hidden])', { timeout: 6000 });

    const tracksPanel = await page.evaluate(() => ({
        title: document.querySelector('.jpdb-subtitle-drawer-title')?.textContent?.trim(),
        text: document.querySelector('.jpdb-subtitle-list')?.textContent ?? '',
        hidden: document.querySelector('.jpdb-subtitle-list')?.hidden,
        autoHideText: document.querySelector('[data-action="toggle-pause-panel"]')?.textContent?.trim(),
        autoHidePressed: document.querySelector('[data-action="toggle-pause-panel"]')?.getAttribute('aria-pressed'),
        closeButton: Boolean(document.querySelector('[data-action="close-panel"]')),
    }));
    assert(tracksPanel.title === 'Subtitles', 'Subtitles button did not open the Yomu tracks panel', tracksPanel);
    assert(tracksPanel.text.includes('Load Japanese subtitles') && tracksPanel.text.includes('Load native subtitles'), 'Track loading actions were not intuitive after clicking Subtitles', tracksPanel);
    assert(tracksPanel.autoHideText === 'Auto' && tracksPanel.autoHidePressed === 'false' && tracksPanel.closeButton, 'Subtitle drawer controls did not expose auto-hide and close actions', tracksPanel);

    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('.jpdb-subtitle-track-tools [data-action="load"]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles(primaryVttPath);
    await page.waitForSelector('.jpdb-subtitle-track-row.active', { timeout: 6000 });

    await page.locator('[data-action="toggle-pause-panel"]').click();
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row', { timeout: 6000 });
    const autoHideEnabled = await page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') || '{}');
        return {
            saved: settings.subtitlePausePanel,
            pressed: document.querySelector('[data-action="toggle-pause-panel"]')?.getAttribute('aria-pressed'),
        };
    });
    assert(autoHideEnabled.saved === true && autoHideEnabled.pressed === 'true', 'Auto-hide toggle did not save the pause panel mode', autoHideEnabled);

    await page.evaluate(() => {
        const video = document.querySelector('video');
        video?.dispatchEvent(new Event('play'));
    });
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden === true);
    await page.evaluate(() => {
        const video = document.querySelector('video');
        video?.dispatchEvent(new Event('pause'));
    });
    await page.waitForSelector('.jpdb-subtitle-list.jpdb-subtitle-lines-panel:not([hidden]) .jpdb-subtitle-list-row', { timeout: 6000 });

    const pausePanel = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const rect = panel?.getBoundingClientRect();
        return {
            rows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
            text: panel?.textContent ?? '',
            hidden: panel?.hidden,
            rect: rect ? { width: rect.width, height: rect.height, left: rect.left, right: rect.right } : null,
            viewport: { width: window.innerWidth, height: window.innerHeight },
        };
    });
    assert(pausePanel.rows >= 2, 'Pause-only side panel did not show loaded subtitle lines', pausePanel);
    const pausePanelText = pausePanel.text.replace(/[（(][ぁ-んァ-ンー]+[）)]/g, '');
    assert(pausePanelText.includes('猫を見る') && pausePanelText.includes('犬と鳥を見る'), 'Pause-only side panel did not show the expected subtitle text', pausePanel);
    assert(pausePanel.rect && pausePanel.rect.width >= 260 && pausePanel.rect.right <= pausePanel.viewport.width + 1, 'Pause-only side panel was not laid out cleanly', pausePanel);

    await page.screenshot({ path: path.join(ARTIFACTS, 'feedback-video-pause-panel.png'), fullPage: false });
}

const { server, baseUrl } = await createFixtureServer();
const browser = await chromium.launch({ headless: true });

try {
    const settingsPage = await newPage(browser);
    await verifySettingsDiscoverability(settingsPage, baseUrl);
    await settingsPage.close();

    const keyboardPage = await newPage(browser);
    await verifyKeyboardWordNavigation(keyboardPage, baseUrl);
    await keyboardPage.close();

    const videoPage = await newPage(browser, baseSettings, { width: 1440, height: 900 });
    await verifyHostedSubtitleFlow(videoPage, baseUrl);
    await videoPage.close();

    console.log(JSON.stringify({
        ok: true,
        artifacts: [
            path.join(ARTIFACTS, 'feedback-settings-font.png'),
            path.join(ARTIFACTS, 'feedback-keyboard-word-nav.png'),
            path.join(ARTIFACTS, 'feedback-video-pause-panel.png'),
        ],
    }, null, 2));
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
