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

if (!existsSync(mainPath)) {
    throw new Error('Missing dist-gaming/electron/main.cjs. Run npm run build:gaming first.');
}

mkdirSync(path.dirname(screenshotPath), { recursive: true });
rmSync(userDataDir, { recursive: true, force: true });
let app;
let smokePassed = false;
let fixtureOcr = { requests: [], url: '', close: async () => undefined };
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
    step('wait for Yomu settings shell');
    await assertGamingWindowIdentity(page);
    await page.waitForSelector('.yomu-gaming-shell[data-yomu-gaming-ready="true"]', { timeout: 45_000 });
    await page.waitForSelector('.yomu-gaming-controlbar', { timeout: 45_000 });
    await page.waitForSelector('.jpdb-reader-settings[data-yomu-gaming-settings]', { timeout: 45_000 });
    await assertNativeWindowSize(page);
    step('verify capture onboarding');
    await notePendingCaptureOnboarding(page);
    await assertDefaultOcrPath(page);
    step('configure and persist page scanning onboarding');
    await configurePageScanOnboarding(page);
    step('configure and persist capture shortcut');
    await configureCaptureShortcut(page, 'Ctrl+Alt+U');
    const savedShortcut = JSON.parse(readFileSync(captureShortcutPath, 'utf8'));
    if (savedShortcut.shortcut !== 'Control+Alt+U') {
        throw new Error(`Capture shortcut was not persisted: ${JSON.stringify(savedShortcut)}`);
    }
    step('dismiss first-run and verify clean relaunch');
    await page.locator('[data-yomu-gaming-first-run] [data-action="dismiss-gaming-first-run"]').click();
    await page.locator('[data-yomu-gaming-first-run]').waitFor({ state: 'detached', timeout: 10_000 });
    await closeElectronApp(app);
    app = undefined;
    page = await launchGamingApp();
    await page.waitForSelector('.yomu-gaming-shell[data-yomu-gaming-ready="true"]', { timeout: 45_000 });
    await page.waitForSelector('.yomu-gaming-controlbar', { timeout: 45_000 });
    if (await page.locator('[data-yomu-gaming-first-run]').count()) {
        throw new Error('Yomu Gaming first-run onboarding returned after dismissal.');
    }
    const restoredShortcut = await page.locator('[data-native-capture-shortcut] [data-capture-shortcut-input]').first().inputValue();
    if (restoredShortcut !== 'Ctrl+Alt+U') {
        throw new Error(`Capture shortcut did not restore after relaunch: ${restoredShortcut}`);
    }
    await assertRestoredPageScanSettings(page);
    step('configure local OCR endpoint');
    await page.locator('text=Image text (OCR)').first().waitFor({ timeout: 10_000 });
    await page.locator('select[name="ocrProvider"]').selectOption('local-service');
    await page.locator('input[name="ocrEndpointUrl"]').fill(fixtureOcr.url);
    await settingsCaptureButton(page).waitFor({ timeout: 10_000 });
    step('save and restore native settings snapshot');
    await page.locator('[data-action="settings-panel"][data-panel="dictionaries"]').click();
    await page.locator('[data-native-settings-sync]').waitFor({ timeout: 10_000 });
    await page.locator('[data-native-settings-sync] [data-action="sync-cloud-settings"]').click();
    await page.locator('[data-settings-save-status]').filter({ hasText: 'Settings snapshot saved' }).waitFor({ timeout: 10_000 });
    await page.locator('[data-native-settings-sync] [data-action="restore-cloud-settings"]').click();
    await page.locator('[data-settings-save-status]').filter({ hasText: 'Settings snapshot restored' }).waitFor({ timeout: 10_000 });
    await page.locator('input[name="ocrEndpointUrl"]').waitFor({ timeout: 10_000 });
    const restoredEndpoint = await page.locator('input[name="ocrEndpointUrl"]').inputValue();
    if (restoredEndpoint !== fixtureOcr.url) {
        throw new Error(`Native settings snapshot did not restore the OCR endpoint: ${restoredEndpoint}`);
    }
    await page.screenshot({ path: screenshotPath });
    step('run instant full-screen capture');
    await page.locator('.yomu-gaming-controlbar [data-action="instant-capture"]').click();
    const overlay = await waitForOverlayWindow(app, 'instant');
    await overlay.waitForSelector('[data-yomu-gaming-overlay-ready="true"][data-capture-mode="instant"][data-overlay-mode="result"]', { timeout: 10_000 });
    await assertInlineOcrResult(overlay, 'instant capture');
    const fullScreenRequest = fixtureOcr.requests.at(-1);
    if (!fullScreenRequest) throw new Error('Fixture OCR endpoint did not receive an instant full-screen capture.');
    if (fullScreenRequest.png.width < 900 || fullScreenRequest.png.height < 500) {
        throw new Error(`Instant capture did not send the full simulated screen: ${JSON.stringify(fullScreenRequest.png)}`);
    }
    await overlay.screenshot({ path: instantResultScreenshotPath });
    await overlay.evaluate(async () => {
        await window.yomuGaming?.showApp();
        await window.yomuGaming?.hideOverlay();
    });
    await page.bringToFront();
    await page.waitForSelector('[data-yomu-gaming-ready="true"]', { timeout: 10_000 });
    step('open area capture overlay');
    await settingsCaptureButton(page).scrollIntoViewIfNeeded();
    await settingsCaptureButton(page).click();
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
    step('drag OCR crop over simulated Japanese screen');
    await dragFixtureDialogueSelection(areaOverlay);
    await areaOverlay.waitForSelector('[data-yomu-gaming-overlay-ready="true"][data-capture-mode="area"][data-overlay-mode="result"]', { timeout: 10_000 });
    await assertInlineOcrResult(areaOverlay, 'area capture');
    const areaRequest = fixtureOcr.requests.at(-1);
    if (!areaRequest) throw new Error('Fixture OCR endpoint did not receive an overlay crop.');
    if (areaRequest.png.width < 200 || areaRequest.png.height < 80 || areaRequest.png.width >= fullScreenRequest.png.width) {
        throw new Error(`Area capture crop dimensions were unexpected: ${JSON.stringify(areaRequest.png)}`);
    }
    await areaOverlay.screenshot({ path: areaResultScreenshotPath });
    console.log(`Yomu Gaming smoke screenshots: ${path.relative(appRoot, screenshotPath)}, ${path.relative(appRoot, instantResultScreenshotPath)}, ${path.relative(appRoot, overlayScreenshotPath)}, ${path.relative(appRoot, areaResultScreenshotPath)}`);
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

function settingsCaptureButton(page) {
    return page.locator('[data-action="area-capture"].yomu-gaming-capture-button').first();
}

async function renderBrowserFixture() {
    const fixtureHtml = readFileSync(fixturePath, 'utf8');
    if (!fixtureHtml.includes('冒険を始めよう')) {
        throw new Error('Gaming Japanese fixture no longer contains the expected dialogue.');
    }
    writeGeneratedGameFixturePng(fixtureCapturePath);
}

function writeGeneratedGameFixturePng(filePath) {
    const width = 960;
    const height = 540;
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
            if (x > 142 && x < 770 && ((y > 390 && y < 410) || (y > 423 && y < 443))) {
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

async function notePendingCaptureOnboarding(page) {
    const onboarding = page.locator('[data-yomu-gaming-first-run]');
    await onboarding.first().waitFor({ timeout: 10_000 });
    const onboardingBox = await onboarding.first().boundingBox();
    if (!onboardingBox || onboardingBox.height > 330) {
        throw new Error(`Yomu Gaming first-run is too large for a clean native setup surface: ${JSON.stringify(onboardingBox)}`);
    }
    const shortcutInput = onboarding.first().locator('[data-capture-shortcut-input]');
    await shortcutInput.waitFor({ timeout: 10_000 });
    if (await shortcutInput.getAttribute('readonly') !== null) {
        throw new Error('Yomu Gaming capture shortcut input is still readonly.');
    }
    await onboarding.first().locator('[data-action="test-capture-overlay"]').waitFor({ timeout: 10_000 });
    await onboarding.first().locator('[data-action="start-overlay"]').waitFor({ timeout: 10_000 });
    const copy = await onboarding.first().innerText();
    for (const expected of ['Capture shortcut', 'Page scanning', 'Off', 'Auto', 'Manual', 'Scan modifier key', 'Image OCR', 'Google Lens OCR default', 'Page text', 'Read game text with Yomu', 'Text', 'Images', 'Video', 'Control', 'Study', 'Game', 'Install the Yomu app to use in games or anywhere on the PC']) {
        if (!copy.includes(expected)) throw new Error(`Yomu Gaming onboarding is missing "${expected}": ${copy}`);
    }
    if (/Local OCR|endpoint|127\.0\.0\.1/i.test(copy)) throw new Error(`Yomu Gaming first-run still exposes advanced OCR setup: ${copy}`);
    if (ambiguousScanCopyPattern.test(copy)) throw new Error(`Yomu Gaming onboarding still uses ambiguous scan copy: ${copy}`);
}

async function assertGamingWindowIdentity(page) {
    const title = await page.title();
    if (title !== 'Yomu Gaming') {
        throw new Error(`Yomu Gaming window title was not branded correctly: ${title}`);
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

async function configurePageScanOnboarding(page) {
    const onboarding = page.locator('[data-yomu-gaming-first-run]');
    await onboarding.locator('[data-gaming-page-scan-setup]').waitFor({ timeout: 10_000 });
    await page.evaluate(() => {
        const manual = document.querySelector('input[name="gamingPageScanMode"][value="manual"]');
        if (!(manual instanceof HTMLInputElement)) throw new Error('Missing manual page scan radio');
        manual.checked = true;
        manual.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const manualShortcut = onboarding.locator('[data-gaming-manual-scan-shortcut] input[name="shortcuts.scanPage"]');
    await manualShortcut.waitFor({ timeout: 10_000 });
    const copyAfterManual = await onboarding.first().innerText();
    if (!copyAfterManual.includes('Manual scan shortcut')) {
        throw new Error(`Yomu Gaming onboarding did not reveal the manual scan shortcut copy: ${copyAfterManual}`);
    }
    await manualShortcut.fill('Alt+J');
    const hoverHold = onboarding.locator('input[name="shortcuts.hoverLookup"]');
    await hoverHold.fill('Shift');
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('yomu-gaming-reader-settings-v1') || '{}');
        return {
            manualScanCheckbox: document.querySelector('input[name="manualScanEnabled"]')?.checked ?? false,
            pageScanModeManual: document.querySelector('input[name="pageScanMode"][value="manual"]')?.checked ?? false,
            onboardingManualShortcutHidden: document.querySelector('[data-gaming-manual-scan-shortcut]')?.hidden ?? true,
            manualScanEnabled: settings.manualScanEnabled,
            annotationsPaused: settings.annotationsPaused,
            scanPage: settings.shortcuts?.scanPage,
            hoverLookup: settings.shortcuts?.hoverLookup,
            summary: document.querySelector('[data-gaming-page-scan-mode]')?.textContent ?? '',
        };
    });
    if (!(state.manualScanCheckbox || state.pageScanModeManual) || state.onboardingManualShortcutHidden) {
        throw new Error(`Page scan onboarding did not sync with shared settings controls: ${JSON.stringify(state)}`);
    }
    if (state.manualScanEnabled !== true || state.annotationsPaused !== false || state.scanPage !== 'Alt+J' || state.hoverLookup !== 'Shift') {
        throw new Error(`Page scan onboarding did not persist expected settings: ${JSON.stringify(state)}`);
    }
    if (!state.summary.includes('Alt+J')) {
        throw new Error(`Page scan onboarding summary did not update after Manual selection: ${JSON.stringify(state)}`);
    }
}

async function assertRestoredPageScanSettings(page) {
    const state = await page.evaluate(() => {
        const manualShortcut = document.querySelector('input[name="shortcuts.scanPage"]');
        const hoverHold = document.querySelector('input[name="shortcuts.hoverLookup"]');
        const settings = JSON.parse(localStorage.getItem('yomu-gaming-reader-settings-v1') || '{}');
        return {
            manualShortcut: manualShortcut?.value ?? '',
            hoverHold: hoverHold?.value ?? '',
            manualScanEnabled: settings.manualScanEnabled,
            annotationsPaused: settings.annotationsPaused,
        };
    });
    if (state.manualShortcut !== 'Alt+J' || state.hoverHold !== 'Shift' || state.manualScanEnabled !== true || state.annotationsPaused !== false) {
        throw new Error(`Page scan settings did not restore after clean relaunch: ${JSON.stringify(state)}`);
    }
}

async function configureCaptureShortcut(page, shortcut) {
    const shortcutInput = page.locator('[data-yomu-gaming-first-run] [data-capture-shortcut-input]').first();
    await shortcutInput.fill(shortcut);
    await shortcutInput.blur();
    await page.locator('[data-settings-save-status]').filter({ hasText: `Capture shortcut saved: ${shortcut}` }).waitFor({ timeout: 10_000 });
    await page.locator('[data-action="settings-panel"][data-panel="shortcuts"]').click();
    await page.waitForFunction(expected => {
        const input = document.querySelector('[data-native-capture-shortcut] [data-capture-shortcut-input]');
        return input instanceof HTMLInputElement && input.value === expected;
    }, shortcut);
    const settingsShortcut = await page.locator('[data-native-capture-shortcut] [data-capture-shortcut-input]').inputValue();
    if (settingsShortcut !== shortcut) {
        throw new Error(`Capture shortcut settings input did not sync: ${settingsShortcut}`);
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

async function assertInlineOcrResult(overlay, label) {
    await overlay.locator('[data-overlay-inline]').waitFor({ timeout: 10_000 });
    // The frozen capture is shown as a backdrop and a persistent toolbar offers re-capture.
    await overlay.locator('img.overlay-backdrop').waitFor({ state: 'attached', timeout: 10_000 });
    await overlay.locator('.overlay-toolbar [data-action="overlay-recapture"]').waitFor({ timeout: 10_000 });
    // The recognized line text is shown in place, in full, with no ellipsis truncation.
    const horizontalText = overlay.locator('[data-ocr-line] .overlay-inline-text', { hasText: '冒険を始めよう' }).first();
    await horizontalText.waitFor({ state: 'visible', timeout: 10_000 });
    const fullText = await horizontalText.innerText();
    if (!fullText.includes('港へ行くよ')) {
        throw new Error(`Yomu Gaming ${label} truncated the recognized line in place: ${fullText}`);
    }
    // The old custom term-pill breakdown stays removed. The inline OCR text should
    // instead be scanned by the real Yomu reader, giving each word the standard
    // lookup behavior without adding another panel over the game.
    const staleTermPills = await overlay.locator('.overlay-inline-terms').count();
    if (staleTermPills) {
        throw new Error(`Yomu Gaming ${label} reintroduced the detached term breakdown.`);
    }
    const annotatedTerm = horizontalText.locator('.jpdb-reader-word', { hasText: '冒険' }).first();
    await annotatedTerm.waitFor({ state: 'visible', timeout: 10_000 });
    await annotatedTerm.hover();
    let popoverOpened = false;
    try {
        await overlay.locator('.jpdb-reader-popover .jpdb-reader-popover-body').first().waitFor({ state: 'visible', timeout: 3_000 });
        popoverOpened = true;
    } catch {
        await annotatedTerm.click();
        await overlay.locator('.jpdb-reader-popover .jpdb-reader-popover-body').first().waitFor({ state: 'visible', timeout: 7_000 });
        popoverOpened = true;
    }
    if (!popoverOpened) {
        throw new Error(`Yomu Gaming ${label} did not open the real Yomu popover from inline OCR text.`);
    }
    // Vertical line renders as an upright vertical column (writing-mode), not a clipped pill.
    const verticalLine = overlay.locator('[data-ocr-line][data-vertical="true"]').first();
    await verticalLine.waitFor({ state: 'attached', timeout: 10_000 });
    const writingMode = await verticalLine.locator('.overlay-inline-text').first().evaluate(node => getComputedStyle(node).writingMode);
    if (!/vertical/.test(writingMode)) {
        throw new Error(`Yomu Gaming ${label} did not render the vertical line with a vertical writing-mode: ${writingMode}`);
    }
    const panelCount = await overlay.locator('.overlay-result').count();
    if (panelCount) {
        throw new Error(`Yomu Gaming ${label} used the detached result panel even though OCR geometry was available.`);
    }
    const selectionCount = await overlay.locator('.overlay-selection').count();
    if (selectionCount) {
        throw new Error(`Yomu Gaming ${label} left the crop rectangle visible over inline OCR results.`);
    }
    const lineBox = await overlay.locator('[data-ocr-line]').first().boundingBox();
    if (!lineBox || lineBox.width < 40 || lineBox.height < 20) {
        throw new Error(`Yomu Gaming ${label} inline OCR geometry was not visible: ${JSON.stringify(lineBox)}`);
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

async function dragFixtureDialogueSelection(overlay) {
    const viewport = await overlay.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const start = { x: Math.round(viewport.width * 0.1), y: Math.round(viewport.height * 0.55) };
    const end = { x: Math.round(viewport.width * 0.9), y: Math.round(viewport.height * 0.9) };
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
                        text: '冒険を始めよう。夜明けまでに港へ行くよ。',
                        box: fixtureOcrLineBox(png),
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
                url: `http://127.0.0.1:${address.port}/ocr`,
                close: () => new Promise((closeResolve, closeReject) => {
                    server.close(error => error ? closeReject(error) : closeResolve());
                }),
            });
        });
    });
}

function fixtureVerticalLineBox(png) {
    const width = Math.max(24, Math.round(png.width * 0.05));
    const height = Math.max(96, Math.round(png.height * 0.5));
    return {
        left: Math.max(8, Math.round(png.width * 0.86)),
        top: Math.max(8, Math.round(png.height * 0.08)),
        width,
        height: Math.min(height, Math.max(96, png.height - 16)),
    };
}

function fixtureOcrLineBox(png) {
    const left = Math.max(8, Math.round(png.width * 0.12));
    const top = Math.max(8, Math.round(png.height * 0.34));
    const width = Math.max(80, Math.round(png.width * 0.68));
    const height = Math.max(30, Math.round(png.height * 0.24));
    return {
        left,
        top: Math.min(top, Math.max(4, png.height - height - 4)),
        width: Math.min(width, Math.max(40, png.width - left - 8)),
        height: Math.min(height, Math.max(24, png.height - top - 4)),
    };
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
