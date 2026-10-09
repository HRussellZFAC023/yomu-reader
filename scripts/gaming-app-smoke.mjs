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
const instantResultScreenshotPath = path.join(appRoot, 'qa-artifacts', 'gaming-app-instant-result-smoke.png');
const fixturePath = path.join(appRoot, 'tests', 'reader', 'fixtures', 'gaming-japanese-page.html');
const fixtureCapturePath = path.join(appRoot, 'qa-artifacts', 'gaming-browser-fixture.png');
const hardwareGapPath = path.join(appRoot, 'qa-artifacts', 'gaming-hardware-gap.txt');
const userDataDir = path.join(appRoot, 'qa-artifacts', 'gaming-electron-user-data');
const captureShortcutPath = path.join(userDataDir, 'capture-shortcut-v1.json');
const ambiguousScanCopyPattern = new RegExp(['Manual scan', 'only'].join(' '), 'i');
const SMOKE_TIMEOUT_MS = Number(process.env.YOMU_GAMING_SMOKE_TIMEOUT_MS || 90_000);
const PUBLIC_OCR_WORD_ATTRIBUTES = [
    'data-expression',
    'data-jpdb-reader-prose',
    'data-mining-insight',
    'data-pitch-accent',
    'data-pitch-class',
    'data-pitch-components',
    'data-reading',
    'data-sentence',
    'data-surface',
    'data-token-end',
    'data-token-start',
    'data-yomu-word',
];

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
    step('wait for Desktop settings');
    await assertGamingWindowIdentity(page);
    await page.waitForSelector('.yomu-gaming-shell[data-yomu-gaming-ready="true"]', { timeout: 45_000 });
    await page.waitForSelector('.jpdb-reader-settings[data-yomu-gaming-settings]', { state: 'attached', timeout: 45_000 });
    await assertNativeWindowSize(page);
    assertSmoke(await page.locator('[data-gaming-home]').count() === 0, 'Desktop still opens an unnecessary home screen.');
    await assertDefaultOcrPath(page);
    assertSmoke(await page.locator('select[name="targetLanguage"]').count() === 0, 'Desktop still requires a language choice.');
    assertSmoke(fixtureOcr.requests.length === 0, 'Desktop captured before a user requested it.');
    step('configure and persist capture shortcut');
    await configureCaptureShortcut(page, 'Ctrl+Shift+U');
    const savedShortcut = JSON.parse(readFileSync(captureShortcutPath, 'utf8'));
    if (savedShortcut.shortcut !== 'Control+Shift+U') {
        throw new Error(`Capture shortcut was not persisted: ${JSON.stringify(savedShortcut)}`);
    }
    await page.evaluate(() => localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ apiKey: 'obsolete-reader-copy' })));
    step('relaunch and verify persisted settings');
    await closeElectronApp(app);
    app = undefined;
    page = await launchGamingApp();
    await page.waitForSelector('.yomu-gaming-shell[data-yomu-gaming-ready="true"]', { timeout: 45_000 });
    await assertLegacyReaderSettingsCopyAbsent(page, 'packaged relaunch cleanup');
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
    await openSettingsPanel(page, 'backup');
    assertSmoke(await page.locator('[data-native-settings-sync]').count() === 0, 'Desktop still offers duplicate local snapshots.');
    await page.locator('[data-action="export-reader-settings"]:visible').waitFor();
    step('import the browser settings export: its Pass/Fail grading reaches Gaming');
    await importBrowserSettingsExport(page, { twoButtonReviews: true });
    await assertDesktopBackupRoundTrip(page);
    await showSettingsWindow(page);
    await page.screenshot({ path: screenshotPath });
    step('run instant full-screen capture');
    fixtureOcr.setCaptureRegion(FULL_CAPTURE_REGION);
    await page.evaluate(() => window.yomuGaming.showOverlay());
    const overlay = await waitForOverlayWindow(app, 'instant');
    await overlay.waitForSelector('[data-yomu-gaming-overlay-ready="true"][data-capture-mode="instant"][data-overlay-mode="result"]', { timeout: 10_000 });
    await assertNonActivatingLayer(overlay);
    await assertInlineOcrResult(overlay, 'instant capture', instantResultScreenshotPath);
    await assertLegacyReaderSettingsCopyAbsent(overlay, 'inline reader boot');
    const fullScreenRequest = fixtureOcr.requests.at(-1);
    if (!fullScreenRequest) throw new Error('Fixture OCR endpoint did not receive an instant full-screen capture.');
    if (fullScreenRequest.png.width < 900 || fullScreenRequest.png.height < 500) {
        throw new Error(`Instant capture did not send the full simulated screen: ${JSON.stringify(fullScreenRequest.png)}`);
    }
    step('press the capture shortcut with the overlay up: it reads the screen again');
    await assertShortcutRecapturesOverOverlay(overlay);
    step('choose a deck in "Add to deck…" while the popup is still enriching: the dropdown survives and saves');
    await assertDeckDropdownSurvivesEnrichment(overlay);
    step('open native settings from the inline Reader shortcut');
    await assertInlineReaderSettingsLandsOnSettings(page, overlay);
    await showSettingsWindow(page);
    assertSmoke(await page.locator('[data-action="area-capture"]').count() === 0, 'Removed region selector is still offered.');
    console.log(`Desktop fixture OCR: ${fullScreenRequest.png.width}x${fullScreenRequest.png.height}; fresh recapture passed. Native hardware gaps: ${path.relative(appRoot, hardwareGapPath)}`);
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
            YOMU_GAMING_CAPTURE_SHORTCUT_PATH: captureShortcutPath,
        },
    });
    const page = await withTimeout(app.firstWindow(), 20_000, 'settings window');
    await page.evaluate(() => window.yomuGaming.showApp());
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

async function openSettingsPanel(page, panel) {
    if (!await page.locator('.jpdb-reader-settings[data-yomu-gaming-settings]:visible').count()) {
        await page.evaluate(() => window.yomuGaming.showApp());
    }
    await page.locator('[data-action="settings-panel"][data-panel="' + panel + '"]').click();
    await page.waitForFunction(expected => {
        const tab = document.querySelector('[data-action="settings-panel"][aria-selected="true"]');
        return tab instanceof HTMLElement && tab.dataset.panel === expected;
    }, panel, { timeout: 10_000 });
}

async function showSettingsWindow(page) {
    // Settings is the only ordinary window; capture is invoked through the native bridge.
    await page.evaluate(() => window.yomuGaming.showApp());
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

    assertSmoke(await page.locator('[data-action="copy-newtab-url"]').count() === 0,
        'Desktop still exposes the removed Copy Study URL control.');
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

// The scene the shortcut re-reads: the same frame with a hover tooltip open over the sky,
// which is what a player presses the shortcut again for.
async function assertNonActivatingLayer(overlay) {
    const policy = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('#overlay-instant'));
        return { focused: window.isFocused(), focusable: window.isFocusable(), top: window.isAlwaysOnTop(), protected: window.isContentProtected() };
    });
    assertSmoke(!policy.focused && !policy.focusable && policy.top, `Desktop layer stole focus or lost its window policy: ${JSON.stringify(policy)}`);
    const backdropOpacity = await overlay.locator('.overlay-backdrop').evaluate(node => getComputedStyle(node).opacity);
    assertSmoke(backdropOpacity === '0', 'Instant lookup still obscures the live app with a frozen screenshot.');
}

async function assertShortcutRecapturesOverOverlay(overlay) {
    const before = await overlay.evaluate(() => document.querySelector('img.overlay-backdrop')?.getAttribute('src') ?? '');
    const requestCount = fixtureOcr.requests.length;
    writeGeneratedGameFixturePng(fixtureCapturePath, { tooltip: true });
    try {
        await pressCaptureShortcutForFreshOverlayDocument(overlay);
    } finally {
        writeGeneratedGameFixturePng(fixtureCapturePath);
    }
    const after = await overlay.evaluate(() => document.querySelector('img.overlay-backdrop')?.getAttribute('src') ?? '');
    const overlayVisible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
        .some(window => window.webContents.getURL().includes('#overlay-') && window.isVisible()));
    assertSmoke(overlayVisible, 'The capture shortcut closed the overlay instead of reading the screen again.');
    assertSmoke(Boolean(after) && after !== before, 'The capture shortcut kept the previous frame instead of the screen as it is now.');
    assertSmoke(
        fixtureOcr.requests.length === requestCount + 1,
        `The capture shortcut sent ${fixtureOcr.requests.length - requestCount} OCR requests for one press.`,
    );
    // The reader boots again on the new frame; later steps drive it.
    await ocrWordForVisualText(overlay, '冒険');
}

function writeGeneratedGameFixturePng(filePath, { tooltip = false } = {}) {
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
            if (tooltip && x > 600 && x < 820 && y > 120 && y < 210) {
                data[index] = 250;
                data[index + 1] = 236;
                data[index + 2] = 180;
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

function assertSmoke(condition, message) {
    if (!condition) throw new Error(message);
}


async function assertInlineReaderSettingsLandsOnSettings(page, overlay) {
    const settingsBefore = await overlay.evaluate(() => localStorage.getItem('yomu-gaming-reader-settings-v1'));
    await overlay.bringToFront();
    await overlay.keyboard.press('Control+Shift+J');
    await waitForNativeSettings(page);
    await assertInlineReaderSettingsPanel(page);
    const settingsAfter = await page.evaluate(() => localStorage.getItem('yomu-gaming-reader-settings-v1'));
    assertInlineReaderSettingsUnchanged(settingsBefore, settingsAfter);
    await assertLegacyReaderSettingsCopyAbsent(overlay, 'inline Reader Settings handoff');
    await waitForOverlayWindowHidden(overlay);
    await assertNoInlineReaderSettingsSurface(overlay);
}

async function assertInlineReaderSettingsPanel(page) {
    const activePanel = await page.locator('[data-action="settings-panel"][aria-selected="true"]').getAttribute('data-panel');
    if (activePanel !== 'shortcuts') {
        throw new Error(`Yomu Gaming Reader shortcut opened the ${activePanel || 'unknown'} panel instead of shortcuts.`);
    }
}

function assertInlineReaderSettingsUnchanged(before, after) {
    if (after !== before) {
        throw new Error('Opening native Settings from the inline Reader changed the durable Gaming settings authority.');
    }
}

async function assertNoInlineReaderSettingsSurface(overlay) {
    if (await overlay.locator('.jpdb-reader-settings,[data-sensitive-settings-launcher]').count()) {
        throw new Error('Yomu Gaming inline Reader mounted a Reader-owned settings surface instead of native Settings.');
    }
}

async function waitForNativeSettings(page) {
    await page.bringToFront();
    await page.waitForFunction(
        () => document.querySelector('.yomu-gaming-shell')?.dataset.shellView === 'settings',
        undefined,
        { timeout: 10_000 },
    );
    await page.locator('.jpdb-reader-settings[data-yomu-gaming-settings]:visible').waitFor({ timeout: 10_000 });
}

async function waitForOverlayWindowHidden(overlay) {
    const overlayUrl = overlay.url();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const visible = await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows()
            .some(window => window.webContents.getURL() === url && window.isVisible()), overlayUrl);
        if (!visible) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Yomu Gaming left the capture overlay visible after opening native Settings.');
}

// Media is the reader's deepest tab (audio sources, text-to-speech, proxy URL). Landing
// there was the old bug, so the default panel is asserted, not assumed.
async function assertSettingsOpenOnCapture(page) {
    await page.evaluate(() => window.yomuGaming.showApp());
    await page.locator('.jpdb-reader-settings[data-yomu-gaming-settings]').waitFor({ timeout: 10_000 });
    const panel = await page.evaluate(() => document.querySelector('[data-action="settings-panel"][aria-selected="true"]')?.dataset.panel ?? '');
    if (panel === 'media' || panel !== 'shortcuts') {
        throw new Error(`Yomu Gaming settings opened on the "${panel}" tab instead of the capture shortcut.`);
    }
    await page.locator('[data-native-capture-shortcut]').waitFor({ timeout: 10_000 });
}

async function assertGamingWindowIdentity(page) {
    const title = await page.title();
    if (title !== 'よむ Desktop') {
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
    if (size.innerWidth < 640 || size.innerHeight < 500 || size.innerWidth > 920) {
        throw new Error(`Yomu Gaming did not open bounded Settings: ${JSON.stringify(size)}`);
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
    await openSettingsPanel(page, 'shortcuts');
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

async function assertInlineOcrResult(overlay, label, paintScreenshotPath) {
    await assertInlineOcrSurface(overlay, label);
    const word = await ocrWordForVisualText(overlay, '冒険');
    // Annotation schedules desktop projection in rAF; inspect the rendered frame, not its pre-layout DOM.
    await overlay.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertInvisibleProviderTargets(overlay, label);
    await word.hover();
    await overlay.locator('.jpdb-reader-popover').first().waitFor({ state: 'visible', timeout: 15000 });
    await overlay.screenshot({ path: paintScreenshotPath });
    const popupBounds = await overlay.locator('.jpdb-reader-popover').first().evaluate(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight };
    });
    assertSmoke(popupBounds.left >= 0 && popupBounds.top >= 0 && popupBounds.right <= popupBounds.width + 1 && popupBounds.bottom <= popupBounds.height + 1,
        `Desktop popup exceeds viewport: ${JSON.stringify(popupBounds)}`);
    await assertInvisibleProviderTargets(overlay, `${label} while hovered`);
    await overlay.screenshot({ path: paintScreenshotPath });
    await assertLocalPopupActions(overlay, label);
}

async function assertInvisibleProviderTargets(overlay, label) {
    const measured = await overlay.evaluate(() => {
        const line = document.querySelector('[data-ocr-line]:not([data-vertical="true"])');
        const source = line.dataset.ocrText;
        const provider = JSON.parse(line.dataset.providerWords);
        const backdrop = document.querySelector('.overlay-backdrop');
        const rect = backdrop.getBoundingClientRect();
        const scale = Math.min(rect.width / backdrop.naturalWidth, rect.height / backdrop.naturalHeight);
        const imageWidth = backdrop.naturalWidth * scale, imageHeight = backdrop.naturalHeight * scale;
        const originX = rect.left + (rect.width - imageWidth) / 2, originY = rect.top + (rect.height - imageHeight) / 2;
        let providerCursor = 0;
        const providerSpans = provider.map(item => {
            const start = source.indexOf(item.text, providerCursor);
            providerCursor = start + item.text.length;
            return { ...item, start, end: providerCursor };
        });
        let offset = 0;
        const boxes = [...line.querySelectorAll('.jpdb-reader-word')].map(word => {
            const text = [...word.querySelectorAll('[data-yomu-ocr-visual-text]')].filter(node => !node.closest('.jpdb-ocr-furi')).map(node => node.dataset.yomuOcrVisualText).join('');
            const start = source.indexOf(text, offset); offset = start + text.length;
            // Fixture provider supplies one character per box, so no font metrics enter expected geometry.
            const members = providerSpans.filter(item => item.start < offset && item.end > start);
            const actual = word.getBoundingClientRect();
            const left = Math.min(...members.map(item => item.box.left));
            const top = Math.min(...members.map(item => item.box.top));
            const right = Math.max(...members.map(item => item.box.left + item.box.width));
            const bottom = Math.max(...members.map(item => item.box.top + item.box.height));
            const misses = [0.15, 0.5, 0.85].flatMap(x => [0.15, 0.5, 0.85].map(y => {
                const hit = document.elementFromPoint(originX + (left + (right - left) * x) * imageWidth,
                    originY + (top + (bottom - top) * y) * imageHeight);
                return hit && (word === hit || word.contains(hit) || hit.closest('.jpdb-reader-popover')) ? 0 : 1;
            })).reduce((a, b) => a + b, 0);
            return { text, misses, error: Math.max(Math.abs(actual.left - (originX + left * imageWidth)),
                Math.abs(actual.top - (originY + top * imageHeight)), Math.abs(actual.width - (right - left) * imageWidth),
                Math.abs(actual.height - (bottom - top) * imageHeight)) };
        });
        const clear = value => value === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(value);
        const paints = style => {
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            return !clear(style.webkitTextFillColor) || style.textShadow !== 'none'
                || !clear(style.backgroundColor) || style.backgroundImage !== 'none' || style.boxShadow !== 'none'
                || (Number.parseFloat(style.webkitTextStrokeWidth) > 0 && !clear(style.webkitTextStrokeColor))
                || ['Top', 'Right', 'Bottom', 'Left'].some(side => Number.parseFloat(style[`border${side}Width`]) > 0
                    && style[`border${side}Style`] !== 'none' && !clear(style[`border${side}Color`]));
        };
        const leaks = [...document.querySelectorAll('.overlay-inline-layer, .overlay-inline-layer *')].flatMap(node => {
            const failures = [];
            for (const pseudo of [null, '::before', '::after']) {
                const style = getComputedStyle(node, pseudo);
                if (pseudo && ['none', 'normal'].includes(style.content)) continue;
                if (paints(style)) failures.push({className: node.className, pseudo, fill:style.webkitTextFillColor,
                    background:style.background, shadow:style.textShadow, stroke:style.webkitTextStroke, content:style.content});
            }
            return failures;
        });
        return { boxes, leaks };
    });
    assertSmoke(measured.boxes.length > 0 && measured.boxes.every(box => box.error <= 2 && box.misses === 0), `Desktop ${label} provider geometry drift: ${JSON.stringify(measured.boxes)}`);
    assertSmoke(measured.leaks.length === 0, `Desktop ${label} painted reconstructed OCR glyphs: ${JSON.stringify(measured.leaks)}`);
    console.log(`[desktop-layer] ${label}: ${measured.boxes.length} provider-aligned targets, no reconstructed glyph paint.`);
}

async function assertLegacyReaderSettingsCopyAbsent(page, label) {
    const copy = await page.evaluate(() => localStorage.getItem('jpdb-popup-reader-settings'));
    if (copy !== null) throw new Error(`Yomu Gaming ${label} recreated the obsolete page-readable Reader settings copy.`);
}

async function assertInlineOcrSurface(overlay, label) {
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
    return horizontalLine;
}

async function assertLocalPopupActions(overlay, label) {
    const popup = overlay.locator('.jpdb-reader-popover').first();
    assertSmoke(await popup.getByRole('button', { name: /^(Fail|Pass|Again|Hard|Good|Easy)(?:\s|$)/ }).count() === 0,
        `Desktop ${label} offered review grading without a connected service.`);
    // "Add to deck…" is one dropdown, with no button in front of it, and its decks stay private.
    // With no service connected it is the popup's only action, so it sits in the row itself:
    // a drawer that folds away one action costs more than the action.
    const dropdown = popup.locator('.jpdb-reader-deck-select');
    await dropdown.waitFor({ state: 'visible', timeout: 5000 });
    assertSmoke(await popup.getByRole('button', { name: 'More actions', exact: true }).count() === 0,
        'Desktop popup folds its lone "Add to deck…" away behind "More actions".');
    assertSmoke(await popup.getByRole('button', { name: 'Add to deck…', exact: true }).count() === 0,
        'Desktop popup still puts an "Add to deck…" button in front of the deck dropdown.');
    assertSmoke(await dropdown.evaluate(node => node.shadowRoot === null && node.textContent === ''),
        'Deck dropdown leaked its private deck list into the page.');
    await overlay.screenshot({ path: path.join(appRoot, 'qa-artifacts/desktop-deck-dropdown.png') });
    // Restore a fresh visible capture for the shortcut recapture assertion. The capture is
    // restored from the main process, as the OS shortcut does: asking the overlay's own
    // renderer to show the overlay reloads the document making that call.
    await overlay.evaluate(() => window.yomuGaming.hideOverlay());
    await pressCaptureShortcutForFreshOverlayDocument(overlay);
    await ocrWordForVisualText(overlay, '冒険');
}

// Presses the capture shortcut through the main-process hook the OS shortcut calls, and
// waits until the overlay has loaded a NEW document on the new frame (every capture
// reloads the overlay, so a marker on the old document tells the two apart).
async function pressCaptureShortcutForFreshOverlayDocument(overlay) {
    await overlay.evaluate(() => { window.__yomuSmokePreviousOverlayDocument = true; });
    await app.evaluate(() => globalThis.__yomuGamingPressCaptureShortcut());
    await overlay.waitForFunction(
        () => !window.__yomuSmokePreviousOverlayDocument
            && Boolean(document.querySelector('[data-yomu-gaming-overlay-ready="true"][data-overlay-mode="result"]')),
        undefined,
        { timeout: 15_000 },
    );
}

// A provider landing re-renders the whole popup. A learner who was already in
// "Add to deck…" lost it, and a choice meant for the deck list hit a detached
// control. The overlay's own fetches are held so enrichment lands, deterministically,
// while the learner is in the dropdown. (Held in the renderer: a main-process webRequest
// hold also stalls while macOS tracks a select's native menu.) Electron's native select
// menu is outside CDP input, so the learner reaches the dropdown with Tab, types a deck's
// name and presses Enter, as a keyboard user does. Enrichment has a short fallback, so the
// learner must reach the dropdown within it: the race assertion below fails loudly if not.
// The waiting render lands once the learner leaves the dropdown, so it is left both ways:
// Tab first, which saves nothing, then Shift+Tab, which goes on to save the word. With no
// service connected the dropdown is the popup's lone action, alone in its row with no ⋯.
async function assertDeckDropdownSurvivesEnrichment(overlay) {
    const tab = await inDeckDropdownWhileEnrichmentLands(overlay, assertTabOutOfDeckDropdownKeepsFocus);
    const shiftTab = await inDeckDropdownWhileEnrichmentLands(overlay, assertShiftTabOutOfDeckDropdownThenSave);
    console.log(`[desktop-popup] deck dropdown kept through enrichment and saved the word: ${JSON.stringify({ tab, shiftTab })}`);
}

// Opens the word's popup, goes into the dropdown while its enrichment is held, lets the
// enrichment land, then hands over to `leave`.
async function inDeckDropdownWhileEnrichmentLands(overlay, leave) {
    await overlay.mouse.move(0, 0);
    await overlay.locator('.jpdb-reader-popover').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
    await overlay.evaluate(() => {
        const fetchNow = window.fetch;
        const held = [];
        window.__yomuSmokeHeldFetches = { pending: 0 };
        window.__yomuSmokeReleaseFetch = () => {
            window.fetch = fetchNow;
            for (const send of held.splice(0)) send();
        };
        window.fetch = (input, init) => new Promise((resolve, reject) => {
            window.__yomuSmokeHeldFetches.pending++;
            held.push(() => fetchNow(input, init).then(resolve, reject).finally(() => { window.__yomuSmokeHeldFetches.pending--; }));
        });
    });
    const release = () => overlay.evaluate(() => window.__yomuSmokeReleaseFetch?.());
    let result;
    try {
        const word = await ocrWordForVisualText(overlay, '冒険');
        const popup = overlay.locator('.jpdb-reader-popover').first();
        const shellDeadline = Date.now() + 20_000;
        // The OCR word already carries its card, so the shell needs no network; a busy
        // machine can still drop a hover, so it is repeated rather than the hold loosened.
        while (!await popup.isVisible()) {
            assertSmoke(Date.now() < shellDeadline, 'Desktop popup shell never opened over the held enrichment.');
            await overlay.mouse.move(0, 0);
            await word.hover();
            await popup.waitFor({ state: 'visible', timeout: 4000 }).catch(() => undefined);
        }
        const dropdown = popup.locator('.jpdb-reader-deck-select');
        await dropdown.waitFor({ state: 'visible', timeout: 5000 });
        // The pointer rests on the dropdown, inside the popup, so the hover popup stays.
        await dropdown.hover();
        // Focus is put on the control just before the dropdown, as a keyboard learner's
        // would be: one Tab from there must land on the dropdown, not wrap past it.
        const before = await markControlBeforeDeckDropdown(popup);
        assertSmoke(before, 'Desktop popup has no control ahead of the "Add to deck…" dropdown to Tab from.');
        await popup.locator('[data-smoke-before-dropdown="true"]').focus();
        await overlay.keyboard.press('Tab');
        const opened = await dropdown.evaluate(host => {
            host.dataset.smokeOpenedDropdown = 'true';
            return document.activeElement === host;
        });
        assertSmoke(opened, `Tab from ${before} did not reach the "Add to deck…" dropdown: ${await overlay.evaluate(() => document.activeElement?.outerHTML.slice(0, 160))}`);
        assertSmoke(await popup.locator('[data-card-details-loading]').count() === 1,
            'Desktop popup finished enriching with its fetches held; the re-render race was not exercised.');

        await release();
        await overlay.waitForFunction(() => window.__yomuSmokeHeldFetches.pending === 0, undefined, { timeout: 15_000 });
        await overlay.waitForTimeout(400);
        const during = await popup.evaluate(root => ({
            sameDropdown: root.querySelector('.jpdb-reader-deck-select')?.dataset.smokeOpenedDropdown === 'true',
            focused: document.activeElement?.matches('.jpdb-reader-deck-select') ?? false,
            loneInRow: root.querySelector('.jpdb-reader-deck-select')?.parentElement?.matches('.jpdb-reader-actions-quiet') === true,
        }));
        assertSmoke(during.sameDropdown && during.focused && during.loneInRow,
            `Desktop popup rebuilt under the open deck dropdown when enrichment landed: ${JSON.stringify(during)}`);

        // Typing a deck's name browses to it and saves nothing.
        await overlay.keyboard.type('Academy');
        await overlay.waitForTimeout(600);
        assertSmoke(await savedToDeckToast(overlay).count() === 0 && (await wordsSavedToLocalDeck(overlay)).length === 0,
            'Typing in the closed deck dropdown saved the word before the learner pressed Enter.');
        result = { during, ...await leave(overlay, popup) };
    } finally {
        await release().catch(() => undefined);
    }
    await overlay.evaluate(() => window.yomuGaming.hideOverlay());
    await pressCaptureShortcutForFreshOverlayDocument(overlay);
    await ocrWordForVisualText(overlay, '冒険');
    return result;
}

// (Function declarations: the smoke runs at module top level, before a module const here exists.)
// Marks the last visible control ahead of "Add to deck…" in the popup's Tab order and names it.
function markControlBeforeDeckDropdown(popup) {
    return popup.evaluate(root => {
        root.querySelectorAll('[data-smoke-before-dropdown]').forEach(node => node.removeAttribute('data-smoke-before-dropdown'));
        const host = root.querySelector('.jpdb-reader-deck-select');
        const control = [...root.querySelectorAll('button, input, select, textarea, a[href], summary, [contenteditable], [tabindex]:not([tabindex^="-"])')]
            .filter(node => node.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING && node.getClientRects().length > 0)
            .at(-1);
        if (!control) return null;
        control.dataset.smokeBeforeDropdown = 'true';
        return `${control.localName}[${control.dataset.action ?? ''}]`;
    });
}

function wordsSavedToLocalDeck(overlay) {
    return overlay.evaluate(() => Object.keys(localStorage)
        .filter(key => /srs|deck/i.test(key) && (localStorage.getItem(key) || '').includes('冒険')));
}

function savedToDeckToast(overlay) {
    return overlay.locator('.jpdb-reader-toast').filter({ hasText: /^Added to (deck|Academy)\.$/ });
}

// Tab from the dropdown, the popup's last control, moves on past it (a dialog wraps it to
// its first control). The waiting render lands once focus is there: focus stays on the
// control Tab reached, rebuilt if the popup's own, and is never dropped onto the page.
async function assertTabOutOfDeckDropdownKeepsFocus(overlay, popup) {
    await overlay.evaluate(() => document.addEventListener('focusin', event => {
        event.target.dataset.smokeTabReached = 'true';
        window.__yomuSmokeTabReached = {
            control: `${event.target.localName}[${event.target.dataset.action ?? ''}]`,
            inPopup: Boolean(event.target.closest('.jpdb-reader-popover')),
        };
    }, { once: true }));
    await overlay.keyboard.press('Tab');
    await popup.locator('[data-card-details-loading]').waitFor({ state: 'detached', timeout: 5000 });
    const left = await popup.evaluate(root => {
        const active = document.activeElement;
        return {
            reached: window.__yomuSmokeTabReached ?? null,
            focused: { control: `${active?.localName}[${active?.dataset?.action ?? ''}]`, inPopup: root.contains(active) },
            rebuilt: active?.dataset?.smokeTabReached !== 'true',
            dialog: root.getAttribute('aria-modal') === 'true',
            dropdownRebuilt: root.querySelector('.jpdb-reader-deck-select')?.dataset.smokeOpenedDropdown !== 'true',
            loneInRow: root.querySelector('.jpdb-reader-deck-select')?.parentElement?.matches('.jpdb-reader-actions-quiet') === true,
        };
    });
    assertSmoke(JSON.stringify(left.focused) === JSON.stringify(left.reached) && left.dropdownRebuilt && left.loneInRow,
        `Tabbing out of the deck dropdown as enrichment landed dropped the learner's focus: ${JSON.stringify(left)}`);
    await overlay.screenshot({ path: path.join(appRoot, 'qa-artifacts/desktop-deck-dropdown-tab-forward.png') });
    return { tabbedTo: left };
}

// Shift+Tab to the control before the dropdown lands the waiting render with the learner
// on that control, rebuilt, not dropped onto the page. Tab returns to the dropdown, where
// Enter saves the deck typed.
async function assertShiftTabOutOfDeckDropdownThenSave(overlay, popup) {
    const before = await markControlBeforeDeckDropdown(popup);
    await overlay.keyboard.press('Shift+Tab');
    await popup.locator('[data-card-details-loading]').waitFor({ state: 'detached', timeout: 5000 });
    const left = await popup.evaluate(root => {
        const active = document.activeElement;
        return {
            focused: root.contains(active) ? `${active.localName}[${active.dataset?.action ?? ''}]` : null,
            rebuilt: root.querySelector('.jpdb-reader-deck-select')?.dataset.smokeOpenedDropdown !== 'true'
                && active?.dataset?.smokeBeforeDropdown !== 'true',
            loneInRow: root.querySelector('.jpdb-reader-deck-select')?.parentElement?.matches('.jpdb-reader-actions-quiet') === true,
        };
    });
    assertSmoke(left.focused === before && left.rebuilt && left.loneInRow,
        `Leaving the deck dropdown as enrichment landed dropped the learner's focus: ${JSON.stringify({ before, ...left })}`);
    // Back to the dropdown with Tab from the control now just before it: the completed
    // render may have added sections between the two.
    const beforeNow = await markControlBeforeDeckDropdown(popup);
    await popup.locator('[data-smoke-before-dropdown="true"]').focus();
    await overlay.keyboard.press('Tab');
    assertSmoke(await popup.evaluate(root => document.activeElement?.matches('.jpdb-reader-deck-select') === true && root.contains(document.activeElement)),
        `Tab from ${beforeNow} did not return to the rebuilt deck dropdown.`);
    await overlay.keyboard.type('Academy');
    await overlay.keyboard.press('Enter');
    await savedToDeckToast(overlay).first().waitFor({ state: 'attached', timeout: 15_000 });
    const saved = await wordsSavedToLocalDeck(overlay);
    assertSmoke(saved.length > 0, 'Choosing a deck in the dropdown did not save the word to the local deck.');
    // The refresh after the save shows the enriched card, with the dropdown back under focus.
    await popup.locator('[data-card-details-loading]').waitFor({ state: 'detached', timeout: 15_000 });
    // The refreshed popup's dropdown, alone in its row, is the learner's place (⋯ when a
    // popup folds several actions away).
    const after = await popup.evaluate(root => ({
        focused: root.getRootNode().activeElement?.matches('.jpdb-reader-deck-select, [data-action="mining-collapse"]') === true
            && root.contains(root.getRootNode().activeElement),
        toasts: [...document.querySelectorAll('.jpdb-reader-toast')].map(node => node.textContent),
    }));
    assertSmoke(after.focused, `A keyboard save left the learner off the deck dropdown: ${JSON.stringify(after)}`);
    await overlay.screenshot({ path: path.join(appRoot, 'qa-artifacts/desktop-deck-dropdown-after-save.png') });
    return { left, after, saved };
}

async function assertDesktopBackupRoundTrip(page) {
    step('round-trip portable Desktop backup including the native capture shortcut');
    const before = JSON.parse(readFileSync(captureShortcutPath, 'utf8')).shortcut;
    assertSmoke(before === 'Control+Shift+U', 'Browser import changed the native shortcut.');
    await openSettingsPanel(page, 'backup');
    const exportedPath = path.join(userDataDir, 'desktop-backup-export.json');
    await app.evaluate(({ session }, destination) => {
        globalThis.__desktopSmokeDownload = new Promise(resolve => session.defaultSession.once('will-download', (_event, item) => {
            item.setSavePath(destination); item.once('done', (_event, state) => resolve(state));
        }));
    }, exportedPath);
    await page.locator('[data-action="export-reader-settings"]:visible').click();
    const downloadState = await app.evaluate(() => globalThis.__desktopSmokeDownload);
    assertSmoke(downloadState === 'completed', `Desktop export did not finish: ${downloadState}`);
    const exported = JSON.parse(readFileSync(exportedPath, 'utf8'));
    assertSmoke(exported.formatName === 'yomu-reader-settings' && exported.formatVersion === 3,
        'Desktop export did not use the shared portable format.');
    assertSmoke(exported.desktop?.captureShortcut === before, 'Desktop backup omitted the native shortcut.');
    await configureCaptureShortcut(page, 'Ctrl+Shift+I');
    await openSettingsPanel(page, 'backup');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-action="import-reader-settings"]:visible').click();
    await (await chooser).setFiles(exportedPath);
    await page.locator('[data-gaming-shell-status]:visible').filter({hasText:'Settings imported.'}).waitFor();
    const restored = JSON.parse(readFileSync(captureShortcutPath, 'utf8')).shortcut;
    assertSmoke(restored === before, `Desktop backup did not restore its native shortcut: ${restored}`);
}

// What a learner's browser hands over: its own "Export settings JSON" file. Built from
// Gaming's current settings so the capture under test keeps working, with the browser's
// choice layered on top.
async function importBrowserSettingsExport(page, browserChoices) {
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('yomu-gaming-reader-settings-v1') || '{}'));
    const exportPath = path.join(userDataDir, 'yomu-settings-browser-export.json');
    writeFileSync(exportPath, JSON.stringify({
        formatName: 'yomu-reader-settings',
        formatVersion: 3,
        exportedAt: new Date().toISOString(),
        settings: { ...current, ...browserChoices },
        storage: {},
    }));
    await openSettingsPanel(page, 'backup');
    const importButton = page.locator('[data-action="import-reader-settings"]:visible').first();
    await importButton.waitFor({ timeout: 10_000 });
    const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
    await importButton.click();
    await (await chooser).setFiles(exportPath);
    await page.locator('[data-gaming-shell-status]:visible').filter({ hasText: 'Settings imported.' }).first().waitFor({ timeout: 10_000 });
    // Let the file-input debounce expire: a detached pre-import form must not overwrite the new choice.
    await page.waitForTimeout(250);
    const imported = await page.evaluate(() => JSON.parse(localStorage.getItem('yomu-gaming-reader-settings-v1') || '{}'));
    assertSmoke(imported.twoButtonReviews === true, 'Yomu Gaming did not adopt Pass/Fail grading from the browser settings export.');
    assertSmoke(imported.ocrEndpointUrl === current.ocrEndpointUrl, 'Importing browser settings replaced how Gaming reads the screen.');
}

async function ocrWordForVisualText(overlay, expectedText) {
    const words = overlay.locator('[data-ocr-line] .jpdb-reader-word[data-yomu-word="true"]');
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const visualTexts = await words.evaluateAll(readOcrWordVisualTexts);
        const index = visualTexts.indexOf(expectedText);
        if (index >= 0) return words.nth(index);
        await overlay.waitForTimeout(50);
    }
    const visibleWords = await words.evaluateAll(readOcrWordVisualTexts);
    throw new Error(`Yomu Gaming did not paint OCR word ${expectedText}: ${JSON.stringify(visibleWords)}`);
}

function readOcrWordVisualTexts(nodes) {
    return nodes.map(node => (
        [...node.querySelectorAll('[data-yomu-ocr-visual-text]')]
            .filter(element => !element.closest('.jpdb-ocr-furi'))
            .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
            .join('')
    ));
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

// A graceful quit flushes the renderer's localStorage. The relaunch step reads
// what the first launch saved, so a slow runner's quit must not be cut short
// into a kill: v2.0.7's macOS x64 build lost the just-chosen target that way.
// (A function-local constant: the smoke runs at module top level, before any
// module-level const declared down here would be initialized.)
async function closeElectronApp(app) {
    if (!app) return;
    const gracefulCloseMs = 15_000;
    try {
        await Promise.race([
            app.close(),
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Timed out closing Electron app.')), gracefulCloseMs)),
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

function writeHardwareGapNote() {
    writeFileSync(hardwareGapPath, [
        'Yomu Gaming automated smoke uses a deterministic Japanese fixture image as a simulated primary-screen capture.',
        'Covered: Electron settings shell, portable settings import/export, instant full-screen capture, fresh shortcut recapture, nonactivating transparent layer, and Japanese lookup rendering.',
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
                        words: [...FIXTURE_LINE_TEXT].map((text, index) => ({ text, box: mapFixtureRect({
                            left: FIXTURE_LINE_ORIGIN.left + index * FIXTURE_GLYPH_PITCH,
                            top: FIXTURE_LINE_ORIGIN.top, width: FIXTURE_GLYPH_INK.width,
                            height: FIXTURE_GLYPH_INK.height,
                        }, captureRegion, png) })),
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
    const hash = '#overlay-instant';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const overlay = app.windows().find(window => window.url().includes(hash));
        if (overlay && !overlay.isClosed()) return overlay;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Yomu Gaming ${mode} overlay window did not open.`);
}
