#!/usr/bin/env node

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { _electron as electron } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const mainPath = path.join(appRoot, 'dist-gaming', 'electron', 'main.cjs');
const screenshotPath = path.join(appRoot, 'qa-artifacts', 'gaming-app-smoke.png');
const settingsActionsScreenshotPath = path.join(appRoot, 'qa-artifacts', 'gaming-app-settings-actions-smoke.png');
const settingsAccountScreenshotPath = path.join(appRoot, 'qa-artifacts', 'gaming-app-settings-account-smoke.png');
const overlayScreenshotPath = path.join(appRoot, 'qa-artifacts', 'gaming-app-overlay-smoke.png');
const instantResultScreenshotPath = path.join(appRoot, 'qa-artifacts', 'gaming-app-instant-result-smoke.png');
const areaResultScreenshotPath = path.join(appRoot, 'qa-artifacts', 'gaming-app-area-result-smoke.png');
const fixturePath = path.join(appRoot, 'tests', 'reader', 'fixtures', 'gaming-japanese-page.html');
const fixtureCapturePath = path.join(appRoot, 'qa-artifacts', 'gaming-browser-fixture.png');
const hardwareGapPath = path.join(appRoot, 'qa-artifacts', 'gaming-hardware-gap.txt');
const userDataDir = path.join(appRoot, 'qa-artifacts', 'gaming-electron-user-data');
const captureShortcutPath = path.join(userDataDir, 'capture-shortcut-v1.json');
const ambiguousScanCopyPattern = new RegExp(['Manual scan', 'only'].join(' '), 'i');
const SMOKE_TIMEOUT_MS = Number(process.env.YOMU_GAMING_SMOKE_TIMEOUT_MS || 90_000);

// The simulated screen: a dark scene with a dialogue box, and a line of "text" painted in
// it. The line is drawn as one ink block per character on an em pitch, NOT as a stripe.
// That matters, because the fixture OCR endpoint hands the overlay this line's own ink box
// and the screenshot is then read as evidence that recognized text lands on the text it
// came from. A 20-character sentence under a 31:1 stripe could not be in register with
// anything, and an earlier version of this file went further still: it put the OCR box at
// capture y 184..314 — over the SKY, 76px above the dialogue box — so the screenshot showed
// the recognized sentence floating above the scene while the painted lines sat untouched
// below it, and the only assertion was that the line was wider than 40px.
const FIXTURE_CAPTURE = { width: 960, height: 540 };
const FIXTURE_LINE_TEXT = '冒険を始めよう。夜明けまでに港へ行くよ。';
const FIXTURE_GLYPH_PITCH = 20;
const FIXTURE_GLYPH_INK = { width: 16, height: 20 };
const FIXTURE_LINE_ORIGIN = { left: 142, top: 390 };
const FIXTURE_SECOND_LINE_TOP = 423;
const FIXTURE_LINE_GLYPHS = [...FIXTURE_LINE_TEXT].length;
// The ink box of that line, as a provider would draw it, in fixture pixels.
const FIXTURE_TEXT_BAR = {
    left: FIXTURE_LINE_ORIGIN.left,
    top: FIXTURE_LINE_ORIGIN.top,
    width: (FIXTURE_LINE_GLYPHS - 1) * FIXTURE_GLYPH_PITCH + FIXTURE_GLYPH_INK.width,
    height: FIXTURE_GLYPH_INK.height,
};
// Which part of the capture an OCR request's image covers, as fractions of the capture.
// Instant capture sends the whole screen; the area drag sends the dialogue box.
const FULL_CAPTURE_REGION = { left: 0, top: 0, right: 1, bottom: 1 };
const AREA_CAPTURE_REGION = { left: 0.1, top: 0.55, right: 0.92, bottom: 0.9 };

if (!existsSync(mainPath)) {
    throw new Error('Missing dist-gaming/electron/main.cjs. Run npm run build:gaming first.');
}

mkdirSync(path.dirname(screenshotPath), { recursive: true });
rmSync(userDataDir, { recursive: true, force: true });
let app;
let smokePassed = false;
let fixtureOcr = { requests: [], url: '', setCaptureRegion: () => undefined, close: async () => undefined };
const watchdog = setTimeout(() => {
    console.error(`[gaming-smoke] Timed out after ${SMOKE_TIMEOUT_MS}ms.`);
    try {
        app?.process?.()?.kill('SIGKILL');
    } catch {
        // Best effort cleanup before the process exits.
    }
    process.exit(124);
}, SMOKE_TIMEOUT_MS);

try {
    writeHardwareGapNote();
    step('create deterministic Japanese capture fixture');
    await renderBrowserFixture();
    step('start fixture OCR server');
    fixtureOcr = await startFixtureOcrServer();
    step('launch Electron app');
    let page = await launchGamingApp();
    step('wait for Yomu home screen');
    await assertGamingWindowIdentity(page);
    await page.waitForSelector('.yomu-gaming-shell[data-yomu-gaming-ready="true"]', { timeout: 45_000 });
    await page.waitForSelector('.yomu-gaming-home', { timeout: 45_000 });
    await page.waitForSelector('.jpdb-reader-settings[data-yomu-gaming-settings]', { state: 'attached', timeout: 45_000 });
    await assertNativeWindowSize(page);
    step('verify the first run says what this is and what to press');
    await assertFirstRunClarity(page);
    await assertDefaultOcrPath(page);
    step('configure and persist capture shortcut');
    await configureCaptureShortcut(page, 'Ctrl+Shift+U');
    const savedShortcut = JSON.parse(readFileSync(captureShortcutPath, 'utf8'));
    if (savedShortcut.shortcut !== 'Control+Shift+U') {
        throw new Error(`Capture shortcut was not persisted: ${JSON.stringify(savedShortcut)}`);
    }
    step('relaunch and verify the app still lands on home');
    await closeElectronApp(app);
    app = undefined;
    page = await launchGamingApp();
    await page.waitForSelector('.yomu-gaming-shell[data-yomu-gaming-ready="true"]', { timeout: 45_000 });
    await assertFirstRunClarity(page);
    await openSettingsPanel(page, 'shortcuts');
    const restoredShortcut = await page.locator('[data-native-capture-shortcut] [data-capture-shortcut-input]').first().inputValue();
    if (restoredShortcut !== 'Ctrl+Shift+U') {
        throw new Error(`Capture shortcut did not restore after relaunch: ${restoredShortcut}`);
    }
    step('verify full-screen Settings actions remain compact');
    await assertCompactSettingsActions(page);
    step('configure local OCR endpoint');
    await openSettingsPanel(page, 'media');
    await page.locator('text=Image text (OCR)').first().waitFor({ timeout: 10_000 });
    await page.locator('select[name="ocrProvider"]').selectOption('local-service');
    await page.locator('input[name="ocrEndpointUrl"]').fill(fixtureOcr.url);
    step('save and restore native settings snapshot');
    await openSettingsPanel(page, 'backup');
    await page.locator('[data-native-settings-sync]').waitFor({ timeout: 10_000 });
    await page.locator('[data-native-settings-sync] [data-action="sync-cloud-settings"]').click();
    await page.locator('[data-gaming-shell-status]:visible').filter({ hasText: 'Settings snapshot saved' }).first().waitFor({ timeout: 10_000 });
    await page.locator('[data-native-settings-sync] [data-action="restore-cloud-settings"]').click();
    await page.locator('[data-gaming-shell-status]:visible').filter({ hasText: 'Settings snapshot restored' }).first().waitFor({ timeout: 10_000 });
    await openSettingsPanel(page, 'media');
    const restoredEndpoint = await page.locator('input[name="ocrEndpointUrl"]').inputValue();
    if (restoredEndpoint !== fixtureOcr.url) {
        throw new Error(`Native settings snapshot did not restore the OCR endpoint: ${restoredEndpoint}`);
    }
    await returnToHome(page);
    await page.screenshot({ path: screenshotPath });
    step('run instant full-screen capture');
    fixtureOcr.setCaptureRegion(FULL_CAPTURE_REGION);
    await page.locator('.yomu-gaming-home [data-action="instant-capture"]').click();
    const overlay = await waitForOverlayWindow(app, 'instant');
    await overlay.waitForSelector('[data-yomu-gaming-overlay-ready="true"][data-capture-mode="instant"][data-overlay-mode="result"]', { timeout: 10_000 });
    await assertInlineOcrResult(overlay, 'instant capture', instantResultScreenshotPath);
    const fullScreenRequest = fixtureOcr.requests.at(-1);
    if (!fullScreenRequest) throw new Error('Fixture OCR endpoint did not receive an instant full-screen capture.');
    if (fullScreenRequest.png.width < 900 || fullScreenRequest.png.height < 500) {
        throw new Error(`Instant capture did not send the full simulated screen: ${JSON.stringify(fullScreenRequest.png)}`);
    }
    step('open settings from the overlay');
    await assertOverlaySettingsLandsOnSettings(page, overlay);
    await returnToHome(page);
    step('open area capture overlay');
    await homeCaptureButton(page).scrollIntoViewIfNeeded();
    await homeCaptureButton(page).click();
    const areaOverlay = await waitForOverlayWindow(app, 'area');
    await areaOverlay.waitForSelector('[data-yomu-gaming-overlay-ready="true"][data-capture-mode="area"][data-overlay-mode="idle"]', { state: 'attached', timeout: 10_000 });
    const overlayState = await areaOverlay.evaluate(() => {
        const shell = document.querySelector('[data-yomu-gaming-overlay-ready="true"]');
        const style = shell instanceof HTMLElement ? getComputedStyle(shell) : null;
        return {
            mode: shell?.getAttribute('data-overlay-mode') ?? '',
            visibleChrome: document.querySelectorAll('.overlay-status,.overlay-result,.overlay-selection').length,
            background: style?.backgroundColor ?? '',
        };
    });
    if (overlayState.mode !== 'idle' || overlayState.visibleChrome !== 0) {
        throw new Error(`Yomu Gaming overlay did not render as an idle minimal overlay: ${JSON.stringify(overlayState)}`);
    }
    await areaOverlay.screenshot({ path: overlayScreenshotPath });
    step('drag OCR crop over the simulated screen’s dialogue box');
    fixtureOcr.setCaptureRegion(AREA_CAPTURE_REGION);
    await dragFixtureDialogueSelection(areaOverlay, AREA_CAPTURE_REGION);
    await areaOverlay.waitForSelector('[data-yomu-gaming-overlay-ready="true"][data-capture-mode="area"][data-overlay-mode="result"]', { timeout: 10_000 });
    await assertInlineOcrResult(areaOverlay, 'area capture', areaResultScreenshotPath);
    const areaRequest = fixtureOcr.requests.at(-1);
    if (!areaRequest) throw new Error('Fixture OCR endpoint did not receive an overlay crop.');
    // The crop has to be the region that was dragged, or the box the fixture hands back for
    // it is anchored to ink that is not in the picture and the register check below is
    // measuring a coincidence.
    const expectedCrop = {
        width: Math.round((AREA_CAPTURE_REGION.right - AREA_CAPTURE_REGION.left) * fullScreenRequest.png.width),
        height: Math.round((AREA_CAPTURE_REGION.bottom - AREA_CAPTURE_REGION.top) * fullScreenRequest.png.height),
    };
    if (Math.abs(areaRequest.png.width - expectedCrop.width) > 6 || Math.abs(areaRequest.png.height - expectedCrop.height) > 6) {
        throw new Error(`Area capture cropped ${JSON.stringify(areaRequest.png)} of the capture, not the dragged ${JSON.stringify(expectedCrop)}.`);
    }
    console.log(`Yomu Gaming smoke screenshots: ${path.relative(appRoot, screenshotPath)}, ${path.relative(appRoot, settingsActionsScreenshotPath)}, ${path.relative(appRoot, settingsAccountScreenshotPath)}, ${path.relative(appRoot, instantResultScreenshotPath)}, ${path.relative(appRoot, overlayScreenshotPath)}, ${path.relative(appRoot, areaResultScreenshotPath)}`);
    console.log(`Yomu Gaming fixture OCR captures: instant ${fullScreenRequest.png.width}x${fullScreenRequest.png.height}, area ${areaRequest.png.width}x${areaRequest.png.height}; hardware gap note: ${path.relative(appRoot, hardwareGapPath)}`);
    smokePassed = true;
} finally {
    await closeElectronApp(app);
    await fixtureOcr.close().catch(error => {
        console.warn(`[gaming-smoke] Fixture OCR server cleanup failed: ${error instanceof Error ? error.message : error}`);
    });
    clearTimeout(watchdog);
    if (smokePassed) process.exit(0);
}

async function launchGamingApp() {
    app = await electron.launch({
        args: electronLaunchArgs(),
        env: {
            ...electronLaunchEnv(),
            YOMU_GAMING_TEST_MODE: '1',
            YOMU_GAMING_SIMULATED_CAPTURE_PATH: fixtureCapturePath,
            YOMU_GAMING_USER_DATA_DIR: userDataDir,
            YOMU_GAMING_SETTINGS_SYNC_PATH: path.join(userDataDir, 'settings-sync-v1.json'),
            YOMU_GAMING_CAPTURE_SHORTCUT_PATH: captureShortcutPath,
        },
    });
    const page = await withTimeout(app.firstWindow(), 20_000, 'settings window');
    app.on('window', attachPageDiagnostics);
    attachPageDiagnostics(page);
    return page;
}

function electronLaunchArgs() {
    if (process.platform !== 'linux') return [mainPath];
    return ['--no-sandbox', '--disable-dev-shm-usage', mainPath];
}

function electronLaunchEnv() {
    if (process.platform !== 'linux') return process.env;
    return {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: '1',
    };
}

function homeCaptureButton(page) {
    return page.locator('.yomu-gaming-home [data-action="area-capture"]').first();
}

async function openSettingsPanel(page, panel) {
    if (!await page.locator('.jpdb-reader-settings[data-yomu-gaming-settings]:visible').count()) {
        await page.locator('.yomu-gaming-home [data-action="open-settings"]').click();
    }
    await page.locator('[data-action="settings-panel"][data-panel="' + panel + '"]').click();
    await page.waitForFunction(expected => {
        const tab = document.querySelector('[data-action="settings-panel"][aria-selected="true"]');
        return tab instanceof HTMLElement && tab.dataset.panel === expected;
    }, panel, { timeout: 10_000 });
}

async function returnToHome(page) {
    if (await page.locator('[data-action="close-settings"]:visible').count()) {
        await page.locator('[data-action="close-settings"]').first().click();
    }
    await page.locator('.yomu-gaming-home').waitFor({ timeout: 10_000 });
}

async function assertCompactSettingsActions(page) {
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    const actionSelector = [
        '.jpdb-reader-settings-actions > .jpdb-reader-btn',
        '.jpdb-reader-help-actions > .jpdb-reader-btn',
        '.jpdb-reader-audio-sources > .jpdb-reader-btn',
        '.jpdb-reader-academy-account-link',
    ].join(',');

    await openSettingsPanel(page, 'media');
    const addAudio = await actionGeometry(page.locator('[data-action="audio-source-add"]'));
    assertLabelSizedAction('Add audio source', addAudio, viewportWidth);

    await openSettingsPanel(page, 'newTab');
    const copyAddress = await actionGeometry(page.locator('[data-action="copy-newtab-url"]'));
    assertLabelSizedAction('Copy address', copyAddress, viewportWidth);
    await page.locator('[data-action="copy-newtab-url"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: settingsActionsScreenshotPath });

    await openSettingsPanel(page, 'backup');
    const accountLink = page.locator('.jpdb-reader-academy-account-link');
    assertActionGeometryCap('Yomu Gaming Academy action', await actionGeometry(accountLink), 280.5, 50);
    await assertExternalIconGeometry(accountLink);
    await accountLink.scrollIntoViewIfNeeded();
    await page.screenshot({ path: settingsAccountScreenshotPath });

    const panels = await page.locator('[data-action="settings-panel"]').evaluateAll(elements =>
        elements.map(element => element instanceof HTMLElement ? element.dataset.panel ?? '' : '').filter(Boolean),
    );
    await assertSettingsActionGeometryCap(page, panels, actionSelector);
}

async function assertSettingsActionGeometryCap(page, panels, actionSelector) {
    for (const panel of panels) {
        await openSettingsPanel(page, panel);
        const panelActions = await page.locator(actionSelector).evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect();
            return {
                text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
                width: rect.width,
                height: rect.height,
            };
        }));
        const oversized = panelActions.find(action => action.width > 280.5 || action.height > 50);
        if (oversized) {
            throw new Error(`Yomu Gaming Settings still contains an oversized action: ${JSON.stringify({ panel, ...oversized })}`);
        }
    }
}

async function assertExternalIconGeometry(action) {
    const externalIcon = await action.locator('svg').boundingBox();
    if (!externalIcon) throw new Error('Yomu Gaming external-link action has no rendered icon.');
    assertActionGeometryCap('Yomu Gaming external-link icon', externalIcon, 13, 13);
}

function assertActionGeometryCap(label, geometry, maxWidth, maxHeight) {
    if (geometry.width > maxWidth) throw new Error(`${label} is too wide: ${JSON.stringify(geometry)}`);
    if (geometry.height > maxHeight) throw new Error(`${label} is too tall: ${JSON.stringify(geometry)}`);
}

async function actionGeometry(locator) {
    await locator.waitFor({ state: 'attached', timeout: 10_000 });
    const rect = await locator.boundingBox();
    if (!rect) throw new Error('Yomu Gaming settings action has no rendered geometry.');
    return { width: rect.width, height: rect.height };
}

function assertLabelSizedAction(label, geometry, viewportWidth) {
    const widthRatio = geometry.width / viewportWidth;
    if (geometry.width > 280.5 || widthRatio > 0.25) {
        throw new Error(`${label} still stretches across Yomu Gaming Settings: ${JSON.stringify({ ...geometry, viewportWidth, widthRatio })}`);
    }
}

async function renderBrowserFixture() {
    const fixtureHtml = readFileSync(fixturePath, 'utf8');
    if (!fixtureHtml.includes('冒険を始めよう')) {
        throw new Error('Gaming Japanese fixture no longer contains the expected dialogue.');
    }
    writeGeneratedGameFixturePng(fixtureCapturePath);
}

function writeGeneratedGameFixturePng(filePath) {
    const width = FIXTURE_CAPTURE.width;
    const height = FIXTURE_CAPTURE.height;
    const data = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (width * 4 + 1);
        data[row] = 0;
        for (let x = 0; x < width; x++) {
            const index = row + 1 + x * 4;
            const sky = y < 330;
            data[index] = sky ? 18 + Math.round(x / width * 18) : 18;
            data[index + 1] = sky ? 42 + Math.round(y / height * 36) : 30;
            data[index + 2] = sky ? 52 + Math.round(x / width * 42) : 24;
            data[index + 3] = 255;
            if (x > 108 && x < 852 && y > 314 && y < 459) {
                const border = x < 114 || x > 846 || y < 320 || y > 453;
                data[index] = border ? 238 : 12;
                data[index + 1] = border ? 246 : 18;
                data[index + 2] = border ? 255 : 26;
                data[index + 3] = 255;
            }
            if (x > 142 && x < 232 && y > 346 && y < 370) {
                data[index] = 99;
                data[index + 1] = 224;
                data[index + 2] = 214;
            }
            if (isFixtureGlyphInk(x, y)) {
                data[index] = 245;
                data[index + 1] = 250;
                data[index + 2] = 255;
            }
        }
    }
    writeFileSync(filePath, pngEncodeRgba(width, height, data));
}

function pngEncodeRgba(width, height, rawRgbaScanlines) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;
    return Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(rawRgbaScanlines)),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function pngChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBuffer.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
    return chunk;
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// The first thing on screen must answer two questions and no more: what this is, and what
// to press. One hero, one primary action, the shortcut once, and Settings behind a click.
async function assertFirstRunClarity(page) {
    const home = page.locator('.yomu-gaming-home');
    await home.waitFor({ timeout: 10_000 });
    if (await page.locator('.jpdb-reader-settings[data-yomu-gaming-settings]:visible').count()) {
        throw new Error('Yomu Gaming opened on the settings form instead of its home screen.');
    }
    const shape = await page.evaluate(() => {
        const surface = document.querySelector('.yomu-gaming-home');
        const actions = Array.from(surface?.querySelectorAll('button[data-action]') ?? []);
        return {
            headings: document.querySelectorAll('.yomu-gaming-shell h1:not([hidden])').length,
            actions: actions.map(button => `${button.dataset.action}:${(button.textContent || '').trim()}`),
            primaries: actions.filter(button => button.classList.contains('add')).length,
            shortcuts: surface?.querySelectorAll('kbd[data-hotkey]').length ?? 0,
        };
    });
    if (shape.headings !== 1) {
        throw new Error(`Yomu Gaming first run shows ${shape.headings} heroes; it must show exactly one.`);
    }
    if (shape.actions.length !== 3 || shape.primaries !== 1) {
        throw new Error(`Yomu Gaming first run must offer three actions with one primary: ${JSON.stringify(shape.actions)}`);
    }
    if (shape.shortcuts !== 1) {
        throw new Error(`Yomu Gaming first run shows the capture shortcut ${shape.shortcuts} times; it must show it once.`);
    }
    const copy = await home.innerText();
    // The wordmark is styled uppercase, so match it the way it reads, not the way it is cased.
    if (!/yomu gaming/i.test(copy)) throw new Error(`Yomu Gaming first run does not name the app: ${copy}`);
    for (const expected of ['Read Japanese anywhere on your screen', 'Read my screen', 'Read part of the screen', 'Settings']) {
        if (!copy.includes(expected)) throw new Error(`Yomu Gaming first run is missing "${expected}": ${copy}`);
    }
    for (const forbidden of ['Google Lens', 'OCR', 'proxy', 'Try now', 'Choose area', 'Done', 'Japanese anywhere on your PC', 'Page scanning', 'Manual scan shortcut', 'Scan modifier key']) {
        if (copy.includes(forbidden)) throw new Error(`Yomu Gaming first run still exposes "${forbidden}": ${copy}`);
    }
    if (/endpoint|127\.0\.0\.1/i.test(copy)) throw new Error(`Yomu Gaming first run still exposes advanced OCR setup: ${copy}`);
    if (ambiguousScanCopyPattern.test(copy)) throw new Error(`Yomu Gaming first run still uses ambiguous scan copy: ${copy}`);
}

// The overlay is a second window with its own web preferences, so "Settings" there
// reaching the app window is a cross-window fact that only the packaged app can prove.
async function assertOverlaySettingsLandsOnSettings(page, overlay) {
    // The word popover from the OCR check is still open, and it owns the click
    // layer. The first Escape must close only that popover and leave the overlay
    // visible; the next Escape is the one that closes the overlay itself.
    if (await overlay.locator('.jpdb-reader-popover').count()) {
        await overlay.keyboard.press('Escape');
        await overlay.locator('.jpdb-reader-popover').first().waitFor({ state: 'detached', timeout: 10_000 });
    }
    await overlay.locator('[data-yomu-gaming-overlay-ready="true"]:visible').waitFor({ timeout: 10_000 });
    const settingsButton = overlay.locator('.overlay-toolbar [data-action="overlay-settings"]').first();
    await settingsButton.waitFor({ state: 'visible', timeout: 10_000 });
    const settingsButtonState = await settingsButton.evaluate(button => {
        const rect = button.getBoundingClientRect();
        return {
            disabled: button instanceof HTMLButtonElement && button.disabled,
            width: rect.width,
            height: rect.height,
            hitTarget: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button,
        };
    });
    assertOverlaySettingsButtonActionable(settingsButtonState);
    await settingsButton.click();
    await page.bringToFront();
    await page.waitForFunction(
        () => document.querySelector('.yomu-gaming-shell')?.dataset.shellView === 'settings',
        undefined,
        { timeout: 10_000 },
    );
    await page.locator('.jpdb-reader-settings[data-yomu-gaming-settings]:visible').waitFor({ timeout: 10_000 });
    if (await page.locator('.yomu-gaming-home:visible').count()) {
        throw new Error('Yomu Gaming showed home and settings at once after the overlay asked for settings.');
    }
}

function assertOverlaySettingsButtonActionable(state) {
    const report = JSON.stringify(state);
    if (state.disabled) throw new Error(`Yomu Gaming overlay Settings control was disabled: ${report}`);
    if (Math.min(state.width, state.height) < 20) throw new Error(`Yomu Gaming overlay Settings control was too small: ${report}`);
    if (!state.hitTarget) throw new Error(`Yomu Gaming overlay Settings control did not own its hit target: ${report}`);
}

// Media is the reader's deepest tab (audio sources, text-to-speech, proxy URL). Landing
// there was the old bug, so the default panel is asserted, not assumed.
async function assertSettingsOpenOnCapture(page) {
    await page.locator('.yomu-gaming-home [data-action="open-settings"]').click();
    await page.locator('.jpdb-reader-settings[data-yomu-gaming-settings]').waitFor({ timeout: 10_000 });
    const panel = await page.evaluate(() => document.querySelector('[data-action="settings-panel"][aria-selected="true"]')?.dataset.panel ?? '');
    if (panel === 'media' || panel !== 'shortcuts') {
        throw new Error(`Yomu Gaming settings opened on the "${panel}" tab instead of the capture shortcut.`);
    }
    await page.locator('[data-native-capture-shortcut]').waitFor({ timeout: 10_000 });
}

async function assertGamingWindowIdentity(page) {
    const title = await page.title();
    if (title !== 'Yomu Gaming') {
        throw new Error(`Yomu Gaming window title was not branded correctly: ${title}`);
    }
    await assertAppIconLoads();
}

// The icon ships next to the bundled main process, and every consumer of it — the
// Dock, the about panel, the Windows and Linux window icon — falls back to a
// default without a word when the file is absent. Ask the live main process.
async function assertAppIconLoads() {
    const icon = await app.evaluate(({ nativeImage }, iconPath) => {
        const image = nativeImage.createFromPath(iconPath);
        return { empty: image.isEmpty(), size: image.getSize() };
    }, path.join(appRoot, 'dist-gaming', 'electron', 'yomu-icon-512.png'));
    if (icon.empty || icon.size.width !== 512) {
        throw new Error(`Yomu Gaming app icon did not load in the main process: ${JSON.stringify(icon)}`);
    }
}

async function assertNativeWindowSize(page) {
    const size = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        shellWidth: document.querySelector('.yomu-gaming-shell')?.getBoundingClientRect().width ?? 0,
    }));
    if (size.innerWidth < 900 || size.innerHeight < 600) {
        throw new Error(`Yomu Gaming did not open as a full-size native window: ${JSON.stringify(size)}`);
    }
    if (size.shellWidth < size.innerWidth - 2) {
        throw new Error(`Yomu Gaming shell did not fill the native window: ${JSON.stringify(size)}`);
    }
}

async function assertDefaultOcrPath(page) {
    const state = await page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('yomu-gaming-reader-settings-v1') || '{}');
        return {
            providerSelect: document.querySelector('select[name="ocrProvider"]')?.value ?? '',
            endpointInput: document.querySelector('input[name="ocrEndpointUrl"]')?.value ?? '',
            storedProvider: settings.ocrProvider ?? '',
            storedEndpoint: settings.ocrEndpointUrl ?? '',
        };
    });
    if (state.providerSelect !== 'google-lens' || state.endpointInput || state.storedProvider || state.storedEndpoint) {
        throw new Error(`Yomu Gaming did not inherit the default OCR path on first launch: ${JSON.stringify(state)}`);
    }
}

async function configureCaptureShortcut(page, shortcut) {
    await assertSettingsOpenOnCapture(page);
    const shortcutInput = page.locator('[data-native-capture-shortcut] [data-capture-shortcut-input]').first();
    if (await shortcutInput.getAttribute('readonly') !== null) {
        throw new Error('Yomu Gaming capture shortcut input is still readonly.');
    }
    await shortcutInput.fill(shortcut);
    await shortcutInput.blur();
    await page.locator('[data-gaming-shell-status]:visible').filter({ hasText: `Capture shortcut saved: ${shortcut}` }).first().waitFor({ timeout: 10_000 });
    const settingsShortcut = await shortcutInput.inputValue();
    if (settingsShortcut !== shortcut) {
        throw new Error(`Capture shortcut settings input did not sync: ${settingsShortcut}`);
    }
    // The home hero must show the shortcut the user just chose.
    await returnToHome(page);
    const heroShortcut = (await page.locator('.yomu-gaming-home kbd[data-hotkey]').innerText()).trim();
    if (heroShortcut !== shortcut) {
        throw new Error(`Yomu Gaming home still shows "${heroShortcut}" after the shortcut changed to ${shortcut}.`);
    }
}

function step(message) {
    console.log(`[gaming-smoke] ${message}`);
}

function attachPageDiagnostics(page) {
    page.on('pageerror', error => {
        console.error(`[gaming-smoke] page error: ${error instanceof Error ? error.message : error}`);
    });
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type())) return;
        console.warn(`[gaming-smoke] renderer ${message.type()}: ${message.text()}`);
    });
}

function isTransparentPaint(value) {
    return !value || value === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(value);
}

async function assertInlineOcrResult(overlay, label, paintScreenshotPath) {
    await overlay.locator('[data-overlay-inline]').waitFor({ timeout: 10_000 });
    // The frozen capture is shown as a backdrop and a persistent toolbar offers re-capture.
    await overlay.locator('img.overlay-backdrop').waitFor({ state: 'attached', timeout: 10_000 });
    await overlay.locator('.overlay-toolbar [data-action="overlay-recapture"]').waitFor({ timeout: 10_000 });
    // The recognized line is anchored in place and readable in full (no ellipsis truncation).
    const horizontalLine = overlay.locator('[data-ocr-line]:not([data-vertical="true"])').first();
    await horizontalLine.waitFor({ state: 'attached', timeout: 10_000 });
    const horizontalText = horizontalLine.locator('.jpdb-ocr-line-text');
    const fullText = await horizontalText.evaluate(node => {
        const surface = node.cloneNode(true);
        surface.querySelectorAll('rt, rp, .jpdb-reader-detached-furi, .jpdb-ocr-furi').forEach(reading => reading.remove());
        surface.querySelectorAll('[data-yomu-ocr-visual-text]').forEach(glyphs => {
            glyphs.replaceWith(glyphs.getAttribute('data-yomu-ocr-visual-text') || '');
        });
        return surface.textContent || '';
    });
    if (!fullText.includes('港へ行くよ')) {
        throw new Error(`Yomu Gaming ${label} truncated the recognized line in place: ${fullText}`);
    }
    // The detached term-pill breakdown stays removed: the bundled Yomu reader scans the
    // OCR'd text in place and gives each word the standard lookup behavior.
    if (await overlay.locator('.overlay-inline-terms').count()) {
        throw new Error(`Yomu Gaming ${label} reintroduced the detached term breakdown.`);
    }
    // The real reader wraps the OCR'd line into scanner-isolated words. Their
    // identity and visible glyphs live in data attributes rather than Text
    // nodes, so external caret scanners cannot claim the same tap.
    const annotatedTerm = overlay.locator(
        '[data-ocr-line] .jpdb-reader-word[data-expression="冒険"][data-surface="冒険"]',
    ).first();
    await annotatedTerm.waitFor({ state: 'attached', timeout: 15_000 });
    const termPaint = await annotatedTerm.evaluate(node => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const lineText = node.closest('.jpdb-ocr-line-text');
        const visualText = [...node.querySelectorAll('[data-yomu-ocr-visual-text]')]
            .filter(element => !element.closest('.jpdb-ocr-furi'))
            .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
            .join('');
        const textWalker = document.createTreeWalker(lineText || node, NodeFilter.SHOW_TEXT);
        let textNodeCount = 0;
        while (textWalker.nextNode()) textNodeCount += 1;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
            expression: node.getAttribute('data-expression') || '',
            surface: node.getAttribute('data-surface') || '',
            visualText,
            textNodeCount,
            scannerIsolated: Boolean(lineText?.classList.contains('jpdb-ocr-page-scanner-isolated')),
            hitTargetsWord: Boolean(hit && (hit === node || node.contains(hit))),
            color: style.color,
            textFill: style.getPropertyValue('-webkit-text-fill-color'),
            background: style.backgroundColor,
            opacity: style.opacity,
            width: rect.width,
            height: rect.height,
        };
    });
    if (
        termPaint.expression !== '冒険'
        || termPaint.surface !== '冒険'
        || !termPaint.visualText.includes(termPaint.surface)
    ) {
        throw new Error(`Yomu Gaming ${label} lost scanner-isolated OCR word identity: ${JSON.stringify(termPaint)}`);
    }
    if (!termPaint.scannerIsolated || termPaint.textNodeCount !== 0) {
        throw new Error(`Yomu Gaming ${label} exposed OCR Text nodes to page scanners: ${JSON.stringify(termPaint)}`);
    }
    if (isTransparentPaint(termPaint.color) || isTransparentPaint(termPaint.textFill) || Number(termPaint.opacity) <= 0.05) {
        throw new Error(`Yomu Gaming ${label} rendered inline OCR words invisibly: ${JSON.stringify(termPaint)}`);
    }
    if (termPaint.width < 8 || termPaint.height < 8) {
        throw new Error(`Yomu Gaming ${label} inline OCR word paint box is too small: ${JSON.stringify(termPaint)}`);
    }
    if (!termPaint.hitTargetsWord) {
        throw new Error(`Yomu Gaming ${label} inline OCR word is not tappable at its painted center: ${JSON.stringify(termPaint)}`);
    }
    console.log(`[gaming-smoke] ${label} OCR word paint: ${JSON.stringify(termPaint)}`);
    // Scanner isolation is a first-paint invariant, while public Jiten detail
    // hydration is intentionally deferred. Keep an explicit packaged check for
    // the later reading repaint so moving isolation earlier cannot hide a
    // stalled or lost furigana round-trip.
    await annotatedTerm.locator('.jpdb-ocr-furi [data-yomu-ocr-visual-text]').first()
        .waitFor({ state: 'attached', timeout: 15_000 });
    await overlay.locator(
        '[data-ocr-line] .jpdb-reader-word[data-expression="冒険"][data-surface="冒険"]'
        + '[data-pitch-class]:not([data-pitch-class="unknown"])',
    ).first().waitFor({ state: 'attached', timeout: 15_000 });
    const readingPaint = await readOcrReadingPaint(annotatedTerm);
    assertOcrReadingPaint(readingPaint, label, 'before activation');
    console.log(`[gaming-smoke] ${label} OCR reading paint: ${JSON.stringify(readingPaint)}`);
    await annotatedTerm.hover();
    await waitForPaintFrames(overlay);
    const hoveredReadingPaint = await readOcrReadingPaint(annotatedTerm);
    if (hoveredReadingPaint.visiblePopovers !== 0) {
        throw new Error(`Yomu Gaming ${label} unexpectedly opened lookup-on-hover during paint proof: ${JSON.stringify(hoveredReadingPaint)}`);
    }
    assertOcrReadingVisualPaint(hoveredReadingPaint, label, 'while hovered');
    console.log(`[gaming-smoke] ${label} OCR visible reading/pitch paint: ${JSON.stringify(hoveredReadingPaint)}`);
    // Capture the proof while the in-place annotation is visible and before a
    // lookup popover can cover it.
    await overlay.screenshot({ path: paintScreenshotPath });
    await annotatedTerm.click({ force: true });
    let popoverOpened = false;
    try {
        await overlay.locator('.jpdb-reader-popover').first().waitFor({ state: 'visible', timeout: 8_000 });
        popoverOpened = true;
    } catch {
        await annotatedTerm.click({ force: true });
        await overlay.locator('.jpdb-reader-popover').first().waitFor({ state: 'visible', timeout: 8_000 });
        popoverOpened = true;
    }
    if (!popoverOpened) {
        throw new Error(`Yomu Gaming ${label} did not open the real Yomu popover from inline OCR text.`);
    }
    // Remove incidental :hover. The lookup lease must keep the OCR line active
    // and its reading/pitch visibly painted on its own.
    await overlay.mouse.move(2, 2);
    await overlay.waitForFunction(() => Boolean(document.querySelector('.jpdb-ocr-line-active')), undefined, { timeout: 4_000 })
        .catch(() => undefined);
    await waitForPaintFrames(overlay);
    const activatedReadingPaint = await readOcrReadingPaint(annotatedTerm);
    assertOcrReadingPaint(activatedReadingPaint, label, 'after click activation');
    assertOcrReadingVisualPaint(activatedReadingPaint, label, 'after click activation');
    console.log(`[gaming-smoke] ${label} OCR retained reading/pitch paint: ${JSON.stringify(activatedReadingPaint)}`);
    if (activatedReadingPaint.reading !== readingPaint.reading
        || activatedReadingPaint.pitchClass !== readingPaint.pitchClass) {
        throw new Error(`Yomu Gaming ${label} changed OCR reading/pitch during click activation: ${JSON.stringify({
            before: readingPaint,
            after: activatedReadingPaint,
        })}`);
    }
    // Vertical line renders as an upright vertical column (writing-mode), not a clipped pill.
    const verticalLine = overlay.locator('[data-ocr-line][data-vertical="true"]').first();
    await verticalLine.waitFor({ state: 'attached', timeout: 10_000 });
    const writingMode = await verticalLine.locator('.jpdb-ocr-line-text').first().evaluate(node => getComputedStyle(node).writingMode);
    if (!/vertical/.test(writingMode)) {
        throw new Error(`Yomu Gaming ${label} did not render the vertical line with a vertical writing-mode: ${writingMode}`);
    }
    if (await overlay.locator('.overlay-result').count()) {
        throw new Error(`Yomu Gaming ${label} used the detached result panel even though OCR geometry was available.`);
    }
    if (await overlay.locator('.overlay-selection').count()) {
        throw new Error(`Yomu Gaming ${label} left the crop rectangle visible over inline OCR results.`);
    }
    const lineBox = await horizontalLine.boundingBox();
    if (!lineBox || lineBox.width < 40 || lineBox.height < 12) {
        throw new Error(`Yomu Gaming ${label} inline OCR geometry was not visible: ${JSON.stringify(lineBox)}`);
    }
    await assertOcrLineRegister(overlay, label);
}

async function readOcrReadingPaint(annotatedTerm) {
    return await annotatedTerm.evaluate(node => {
        const line = node.closest('.jpdb-ocr-line');
        const furi = node.querySelector('.jpdb-ocr-furi');
        const furiStyle = furi ? getComputedStyle(furi) : null;
        const furiRect = furi?.getBoundingClientRect();
        const pitchStyle = getComputedStyle(node, '::after');
        const glyphs = [...node.querySelectorAll('.jpdb-ocr-furi [data-yomu-ocr-visual-text]')];
        return {
            hasFuriganaClass: node.classList.contains('jpdb-reader-has-furi'),
            reading: glyphs.map(element => element.getAttribute('data-yomu-ocr-visual-text') || '').join(''),
            lineHasFurigana: line?.getAttribute('data-has-furi') || '',
            lineActive: Boolean(line?.classList.contains('jpdb-ocr-line-active')),
            lineHovered: Boolean(line?.matches(':hover')),
            lineFocusVisible: Boolean(line?.matches(':focus-visible')),
            linePinned: line?.getAttribute('data-pinned') || '',
            linePressed: line?.getAttribute('aria-pressed') || '',
            visiblePopovers: [...document.querySelectorAll('.jpdb-reader-popover')]
                .filter(element => getComputedStyle(element).display !== 'none').length,
            pitchClass: node.getAttribute('data-pitch-class') || '',
            pitchAccent: node.getAttribute('data-pitch-accent') || '',
            furiOpacity: furiStyle?.opacity || '',
            furiColor: furiStyle?.color || '',
            furiTextFill: furiStyle?.getPropertyValue('-webkit-text-fill-color') || '',
            furiWidth: furiRect?.width || 0,
            furiHeight: furiRect?.height || 0,
            furiGlyphContents: glyphs.map(element => getComputedStyle(element, '::before').content),
            pitchUnderlineColor: pitchStyle.borderBlockEndColor || pitchStyle.borderBottomColor,
            pitchUnderlineWidth: pitchStyle.borderBlockEndWidth || pitchStyle.borderBottomWidth,
            pitchUnderlineStyle: pitchStyle.borderBlockEndStyle || pitchStyle.borderBottomStyle,
            pitchUnderlineOpacity: pitchStyle.opacity,
        };
    });
}

function assertOcrReadingPaint(readingPaint, label, phase) {
    if (
        readingPaint.hasFuriganaClass
        && readingPaint.reading.trim()
        && readingPaint.lineHasFurigana === 'true'
        && readingPaint.pitchClass
        && readingPaint.pitchClass !== 'unknown'
    ) return;
    throw new Error(`Yomu Gaming ${label} did not retain its deferred OCR reading/pitch ${phase}: ${JSON.stringify(readingPaint)}`);
}

function assertOcrReadingVisualPaint(readingPaint, label, phase) {
    const glyphsPaint = readingPaint.furiGlyphContents.length > 0
        && readingPaint.furiGlyphContents.every(content => content && !['none', 'normal', '""', "''"].includes(content));
    const activePaint = readingPaint.lineActive || readingPaint.lineHovered || readingPaint.lineFocusVisible;
    const furiganaPaint = Number(readingPaint.furiOpacity) > 0.05
        && readingPaint.furiWidth > 0
        && readingPaint.furiHeight > 0
        && glyphsPaint
        && !isTransparentPaint(readingPaint.furiColor)
        && !isTransparentPaint(readingPaint.furiTextFill);
    const pitchPaint = Number.parseFloat(readingPaint.pitchUnderlineWidth) > 0
        && readingPaint.pitchUnderlineStyle !== 'none'
        && Number(readingPaint.pitchUnderlineOpacity || '1') > 0.05
        && !isTransparentPaint(readingPaint.pitchUnderlineColor);
    if (activePaint && furiganaPaint && pitchPaint) return;
    throw new Error(`Yomu Gaming ${label} did not visibly paint its OCR reading/pitch ${phase}: ${JSON.stringify(readingPaint)}`);
}

async function waitForPaintFrames(page) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

// The point of the whole exercise: the recognized line has to sit ON the text it was read
// from, at that text's size. The fixture paints its dialogue line at a known place, the
// fixture endpoint hands back that line's own ink box, and this compares the two on screen.
// Existence checks passed all the way through a build that typeset the line at 0.53x and
// left it 22% of the line's width inside its left edge.
async function assertOcrLineRegister(overlay, label) {
    const measured = await overlay.evaluate(bar => {
        const backdrop = document.querySelector('img.overlay-backdrop');
        const rect = backdrop.getBoundingClientRect();
        const scale = Math.min(rect.width / backdrop.naturalWidth, rect.height / backdrop.naturalHeight);
        const width = backdrop.naturalWidth * scale;
        const height = backdrop.naturalHeight * scale;
        const pictureLeft = rect.left + (rect.width - width) / 2;
        const pictureTop = rect.top + (rect.height - height) / 2;
        const line = document.querySelector('[data-ocr-line]:not([data-vertical="true"])');
        const text = line.querySelector('.jpdb-ocr-line-text');
        const rendered = text.getBoundingClientRect();
        return {
            source: {
                left: pictureLeft + bar.left * width,
                bottom: pictureTop + (bar.top + bar.height) * height,
                width: bar.width * width,
                height: bar.height * height,
            },
            rendered: { left: rendered.left, bottom: rendered.bottom, width: rendered.width, height: rendered.height },
            line: {
                fontPx: Number.parseFloat(getComputedStyle(line).fontSize),
                boxLeft: Number(line.dataset.boxLeft),
                boxTop: Number(line.dataset.boxTop),
                boxWidth: Number(line.dataset.boxWidth),
                boxHeight: Number(line.dataset.boxHeight),
                picture: { left: pictureLeft, top: pictureTop, width, height },
            },
        };
    }, {
        left: FIXTURE_TEXT_BAR.left / FIXTURE_CAPTURE.width,
        top: FIXTURE_TEXT_BAR.top / FIXTURE_CAPTURE.height,
        width: FIXTURE_TEXT_BAR.width / FIXTURE_CAPTURE.width,
        height: FIXTURE_TEXT_BAR.height / FIXTURE_CAPTURE.height,
    });
    const { source, rendered } = measured;
    const report = JSON.stringify(measured);
    if (Math.abs(rendered.width - source.width) > source.width * 0.08) {
        throw new Error(`Yomu Gaming ${label} rendered the recognized line at ${(rendered.width / source.width).toFixed(3)}x the width of the text it was read from: ${report}`);
    }
    if (Math.abs(rendered.left - source.left) > source.width * 0.05) {
        throw new Error(`Yomu Gaming ${label} started the recognized line ${Math.round(rendered.left - source.left)}px away from the text it was read from: ${report}`);
    }
    // The line rests on its source's baseline; the rendered box is a full em tall against an
    // ink box, so it may hang a little below.
    if (rendered.bottom - source.bottom > source.height * 0.5 || source.bottom - rendered.bottom > source.height * 0.25) {
        throw new Error(`Yomu Gaming ${label} left the recognized line off the baseline of the text it was read from: ${report}`);
    }
}

function withTimeout(promise, timeoutMs, label) {
    let timeout;
    return Promise.race([
        promise,
        new Promise((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), timeoutMs);
        }),
    ]).finally(() => clearTimeout(timeout));
}

async function closeElectronApp(app) {
    if (!app) return;
    try {
        await Promise.race([
            app.close(),
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Timed out closing Electron app.')), 2_000)),
        ]);
    } catch {
        try {
            app.process?.()?.kill('SIGKILL');
        } catch {
            // The child process may already be gone.
        }
    } finally {
        try {
            const child = app.process?.();
            if (child && !child.killed) child.kill('SIGKILL');
        } catch {
            // Best effort teardown.
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// Drag out the given region OF THE CAPTURE, not of the window. The overlay letterboxes the
// frozen capture inside the overlay window (object-fit: contain) and maps the selection
// back through that same painted rect, so on any window whose shape differs from the
// capture's — which is the normal case, and is what this run gets — window fractions and
// capture fractions are different regions. Dragging window fractions is how the crop ended
// up covering a part of the screen nobody had chosen.
async function dragFixtureDialogueSelection(overlay, region) {
    const picture = await overlay.evaluate(() => {
        const backdrop = document.querySelector('img.overlay-backdrop');
        const rect = backdrop.getBoundingClientRect();
        const scale = Math.min(rect.width / backdrop.naturalWidth, rect.height / backdrop.naturalHeight);
        const width = backdrop.naturalWidth * scale;
        const height = backdrop.naturalHeight * scale;
        return {
            left: rect.left + (rect.width - width) / 2,
            top: rect.top + (rect.height - height) / 2,
            width,
            height,
        };
    });
    const start = {
        x: Math.round(picture.left + region.left * picture.width),
        y: Math.round(picture.top + region.top * picture.height),
    };
    const end = {
        x: Math.round(picture.left + region.right * picture.width),
        y: Math.round(picture.top + region.bottom * picture.height),
    };
    await overlay.mouse.move(start.x, start.y);
    await overlay.mouse.down();
    await overlay.mouse.move(end.x, end.y, { steps: 8 });
    await overlay.mouse.up();
}

function writeHardwareGapNote() {
    writeFileSync(hardwareGapPath, [
        'Yomu Gaming automated smoke uses a deterministic Japanese fixture image as a simulated primary-screen capture.',
        'Covered: Electron settings shell, native settings snapshot save/restore, instant full-screen capture, secondary area capture, crop submission to OCR, and Japanese lookup rendering.',
        'Remaining hardware gap: true global desktop capture over an exclusive-fullscreen game and Steam Deck gamescope/Wayland capture must be validated on target hardware.',
    ].join('\n') + '\n');
}

function startFixtureOcrServer() {
    const requests = [];
    // A real provider knows where the ink is because it can see it. This one is told:
    // the smoke declares which part of the capture the next request's image covers, so
    // the box it hands back is the painted line's own ink box in that image's pixels.
    let captureRegion = FULL_CAPTURE_REGION;
    const server = createServer(async (request, response) => {
        if (request.method !== 'POST' || request.url !== '/ocr') {
            response.writeHead(404).end();
            return;
        }
        try {
            const payload = JSON.parse(await readRequestBody(request));
            const base64 = String(payload.base64_image || payload.image || payload.image_bytes || '');
            const image = Buffer.from(base64, 'base64');
            const png = pngDimensions(image);
            requests.push({ png, context: payload.context_resolution ?? null });
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({
                width: png.width,
                height: png.height,
                lines: [
                    {
                        text: FIXTURE_LINE_TEXT,
                        box: fixtureOcrLineBox(png, captureRegion),
                    },
                    {
                        // Tall, narrow box -> vertical writing (the manga/VN/JRPG common case the
                        // synthetic fixture image cannot itself produce). Exercises the
                        // vertical-rl rendering + no-truncation path.
                        text: '読書の時間だ',
                        box: fixtureVerticalLineBox(png),
                    },
                ],
            }));
        } catch (error) {
            response.writeHead(422, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid OCR fixture request.' }));
        }
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Fixture OCR server did not expose a TCP port.'));
                return;
            }
            resolve({
                requests,
                setCaptureRegion: region => { captureRegion = region; },
                url: `http://127.0.0.1:${address.port}/ocr`,
                close: () => new Promise((closeResolve, closeReject) => {
                    server.close(error => error ? closeReject(error) : closeResolve());
                }),
            });
        });
    });
}

// A narrow column at the far right of whatever was sent. This one is honestly synthetic:
// the fixture image paints no vertical text, and a bitmap generator has no business
// pretending to. It exercises the vertical-rl rendering path, and it is kept clear of the
// dialogue box in both the full screen and the area crop so it never sits on the
// horizontal line the register check below measures.
function fixtureVerticalLineBox(png) {
    const width = Math.max(24, Math.round(png.width * 0.045));
    const left = Math.min(Math.max(8, Math.round(png.width * 0.93)), Math.max(8, png.width - width - 4));
    const top = Math.max(8, Math.round(png.height * 0.05));
    return {
        left,
        top,
        width,
        height: Math.max(48, Math.min(Math.round(png.height * 0.4), png.height - top - 4)),
    };
}

// The painted line's own ink box, expressed in the pixels of the image that was actually
// sent — the whole screen for an instant capture, the dragged crop for an area capture.
function fixtureOcrLineBox(png, region) {
    return mapFixtureRect(FIXTURE_TEXT_BAR, region, png);
}

function mapFixtureRect(rect, region, png) {
    const spanX = Math.max(1e-6, region.right - region.left);
    const spanY = Math.max(1e-6, region.bottom - region.top);
    const left = ((rect.left / FIXTURE_CAPTURE.width) - region.left) / spanX * png.width;
    const top = ((rect.top / FIXTURE_CAPTURE.height) - region.top) / spanY * png.height;
    const width = (rect.width / FIXTURE_CAPTURE.width) / spanX * png.width;
    const height = (rect.height / FIXTURE_CAPTURE.height) / spanY * png.height;
    return {
        left: Math.round(Math.max(0, Math.min(left, png.width - 1))),
        top: Math.round(Math.max(0, Math.min(top, png.height - 1))),
        width: Math.round(Math.max(1, Math.min(width, png.width - Math.max(0, left)))),
        height: Math.round(Math.max(1, Math.min(height, png.height - Math.max(0, top)))),
    };
}

// One ink block per character, on an em pitch, plus a shorter second row so the dialogue
// box reads as a dialogue box rather than as one floating line.
function isFixtureGlyphInk(x, y) {
    const rows = [
        { top: FIXTURE_LINE_ORIGIN.top, glyphs: FIXTURE_LINE_GLYPHS },
        { top: FIXTURE_SECOND_LINE_TOP, glyphs: Math.round(FIXTURE_LINE_GLYPHS * 0.6) },
    ];
    return rows.some(row => {
        if (y < row.top || y >= row.top + FIXTURE_GLYPH_INK.height) return false;
        const offset = x - FIXTURE_LINE_ORIGIN.left;
        if (offset < 0 || offset >= row.glyphs * FIXTURE_GLYPH_PITCH) return false;
        return offset % FIXTURE_GLYPH_PITCH < FIXTURE_GLYPH_INK.width;
    });
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', chunk => {
            body += chunk;
            if (body.length > 8_000_000) {
                reject(new Error('OCR fixture request is too large.'));
                request.destroy();
            }
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

function pngDimensions(buffer) {
    const signature = '89504e470d0a1a0a';
    if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) {
        throw new Error('Overlay OCR image was not a PNG data URL.');
    }
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
    };
}

async function waitForOverlayWindow(app, mode = 'instant') {
    const hash = mode === 'area' ? '#overlay-area' : '#overlay-instant';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const overlay = app.windows().find(window => window.url().includes(hash));
        if (overlay && !overlay.isClosed()) return overlay;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Yomu Gaming ${mode} overlay window did not open.`);
}
