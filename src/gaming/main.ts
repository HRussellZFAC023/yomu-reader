import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, nativeImage, screen, shell, systemPreferences, type BrowserWindowConstructorOptions } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeOcrRequest, requestGamingOcr } from './ocr';
import {
    YOMU_GAMING_CHANNELS,
    type YomuGamingCaptureMode,
    type YomuGamingCaptureSource,
    type YomuGamingEnvironment,
    type YomuGamingScreenAccess,
    type YomuGamingSettingsSnapshot,
    type YomuGamingSettingsSyncMetadata,
} from './ipc';

const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Y';
const APP_NAME = 'Yomu Gaming';
// OCR runs on the full-screen grab, so capture at the display's native framebuffer
// (logical size x scaleFactor) instead of a 1080p thumbnail. Retina/4K text is lost
// otherwise. Cap the long edge so a 5K/8K panel can't blow up the OCR payload.
const MAX_CAPTURE_EDGE = 3840;
// macOS hands back an EMPTY screen thumbnail on the first desktopCapturer call after
// launch — ScreenCaptureKit has not warmed up yet. Measured on 5/5 cold starts, and
// twice in a row on one of them. Without a retry the first hotkey press of every
// session fails, so retry until a screen actually arrives.
const CAPTURE_ATTEMPTS = 6;
const CAPTURE_RETRY_DELAY_MS = 120;
const SCREEN_PERMISSION_MESSAGE = process.platform === 'darwin'
    ? 'Yomu Gaming needs Screen Recording permission. Open System Settings › Privacy & Security › Screen Recording, enable Yomu Gaming, then quit and reopen the app.'
    : 'Yomu Gaming could not read the screen. Check this device’s screen-capture permissions and try again.';
const ALLOWED_EXTERNAL_HOSTS = new Set(['yomureader.com', 'jpdb.io', 'jiten.moe']);
const SETTINGS_SYNC_FILE_NAME = 'settings-sync-v1.json';
const CAPTURE_SHORTCUT_FILE_NAME = 'capture-shortcut-v1.json';
const MODIFIER_KEYS = new Set(['CommandOrControl', 'Control', 'Ctrl', 'Command', 'Cmd', 'Alt', 'Option', 'Shift', 'Super', 'Meta']);
const SHORTCUT_PART_ALIASES = new Map<string, string>([
    ['control', 'Control'],
    ['ctrl', 'Control'],
    ['commandorcontrol', 'CommandOrControl'],
    ['cmdorctrl', 'CommandOrControl'],
    ['command', 'Command'],
    ['cmd', 'Command'],
    ['meta', process.platform === 'darwin' ? 'Command' : 'Super'],
    ['win', 'Super'],
    ['windows', 'Super'],
    ['super', 'Super'],
    ['alt', 'Alt'],
    ['option', 'Alt'],
    ['shift', 'Shift'],
    ['escape', 'Escape'],
    ['esc', 'Escape'],
    ['space', 'Space'],
    ['spacebar', 'Space'],
    [' ', 'Space'],
    ['arrowup', 'Up'],
    ['up', 'Up'],
    ['arrowdown', 'Down'],
    ['down', 'Down'],
    ['arrowleft', 'Left'],
    ['left', 'Left'],
    ['arrowright', 'Right'],
    ['right', 'Right'],
    ['plus', 'Plus'],
]);

installBrokenPipeGuard();

if (process.env.YOMU_GAMING_USER_DATA_DIR) {
    app.setPath('userData', path.resolve(process.env.YOMU_GAMING_USER_DATA_DIR));
}
configureNativeAppMetadata();

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let hotkeyRegistered = false;
let hotkey = DEFAULT_HOTKEY;
let hotkeyError = '';
let registeredHotkey: string | null = null;
// Freeze-frame: the screen is grabbed once while none of our windows are visible,
// then the overlay reads/crops from this frozen frame. This is what keeps the
// overlay's own selection chrome out of the OCR'd image.
let frozenCapture: YomuGamingCaptureSource | null = null;

function rendererUrl(hash = ''): string {
    const devUrl = process.env.YOMU_GAMING_RENDERER_URL;
    const overlayMode = overlayModeFromHash(hash);
    if (devUrl) {
        const url = new URL(devUrl);
        if (overlayMode) url.searchParams.set('captureMode', overlayMode);
        url.hash = hash;
        return url.toString();
    }
    const url = pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html'));
    if (overlayMode) url.searchParams.set('captureMode', overlayMode);
    url.hash = hash;
    return url.toString();
}

function overlayModeFromHash(hash: string): YomuGamingCaptureMode | '' {
    if (hash === 'overlay-area') return 'area';
    if (hash === 'overlay-instant') return 'instant';
    return '';
}

async function createMainWindow(): Promise<void> {
    const options = mainWindowOptions();
    mainWindow = new BrowserWindow({
        ...options,
        minWidth: 640,
        minHeight: 520,
        title: APP_NAME,
        icon: appIconPath(),
        backgroundColor: '#fbfcfe',
        autoHideMenuBar: true,
        show: false,
        alwaysOnTop: false,
        webPreferences: gamingWebPreferences('main'),
    });
    const window = mainWindow;
    hardenWebContents(window);
    window.once('ready-to-show', () => {
        if (!window.isDestroyed()) window.show();
    });
    window.on('closed', () => {
        mainWindow = null;
    });
    await window.loadURL(rendererUrl());
    if (!window.isDestroyed() && !window.isVisible()) window.show();
}

function mainWindowOptions(): Pick<BrowserWindowConstructorOptions, 'x' | 'y' | 'width' | 'height'> {
    const workArea = screen.getPrimaryDisplay().workArea;
    return {
        x: workArea.x,
        y: workArea.y,
        width: Math.max(640, workArea.width),
        height: Math.max(520, workArea.height),
    };
}

async function ensureOverlayWindow(mode: YomuGamingCaptureMode): Promise<BrowserWindow> {
    const hash = overlayHash(mode);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        // Always reload, even when the mode is unchanged. The renderer reads the frozen
        // frame exactly once per document (its controller is guarded by a `started`
        // flag), so reusing the document replayed the FIRST capture on every later
        // press — the scene had moved on but the overlay still showed the old one.
        await overlayWindow.loadURL(rendererUrl(hash));
        return overlayWindow;
    }
    const display = screen.getPrimaryDisplay();
    overlayWindow = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        fullscreenable: true,
        resizable: false,
        skipTaskbar: true,
        show: false,
        alwaysOnTop: true,
        title: `${APP_NAME} Overlay`,
        icon: appIconPath(),
        webPreferences: gamingWebPreferences('overlay'),
    });
    hardenWebContents(overlayWindow);
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
    await overlayWindow.loadURL(rendererUrl(hash));
    return overlayWindow;
}

function appIconPath(): string {
    return path.join(__dirname, 'yomu-icon-512.png');
}

function gamingWebPreferences(role: 'main' | 'overlay'): BrowserWindowConstructorOptions['webPreferences'] {
    return {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        // The preload only uses contextBridge + ipcRenderer, both available under the
        // sandbox, so a renderer compromise cannot reach Node primitives.
        sandbox: true,
        // The overlay hosts the real Yomu reader, whose dictionary/pitch lookups are
        // cross-origin (jpdb/jiten/jisho) and send no CORS headers — the same privileged
        // network access the reader gets as a userscript/extension. Scoped to the overlay
        // window (it only ever loads our own bundled file:// renderer); the settings window
        // keeps web security on. The connect-src CSP still bounds reachable hosts.
        webSecurity: role === 'main',
    };
}

// The renderer composes DOM with innerHTML; a missed escape must never become a
// navigation or popup foothold. Deny window.open and pin navigation to our own bundle.
function hardenWebContents(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const guard = (event: Electron.Event, url: string) => {
        if (!isOwnRendererUrl(url)) event.preventDefault();
    };
    window.webContents.on('will-navigate', guard);
    window.webContents.on('will-redirect', guard);
}

function isOwnRendererUrl(url: string): boolean {
    const devUrl = process.env.YOMU_GAMING_RENDERER_URL;
    if (devUrl && url.startsWith(devUrl)) return true;
    return url.startsWith('file://');
}

function configureNativeAppMetadata(): void {
    app.setName(APP_NAME);
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.yomureader.gaming');
    }
    if (process.platform === 'darwin') {
        app.setAboutPanelOptions({
            applicationName: APP_NAME,
            applicationVersion: app.getVersion(),
            iconPath: appIconPath(),
        });
    }
}

function installBrokenPipeGuard(): void {
    for (const stream of [process.stdout, process.stderr]) {
        stream.on('error', error => {
            if ((error as NodeJS.ErrnoException).code === 'EPIPE') return;
            process.nextTick(() => { throw error; });
        });
    }
}

async function showOverlay(mode: YomuGamingCaptureMode = 'instant'): Promise<void> {
    // Grab the frame while neither of our windows is on screen, so the overlay's
    // own selection box / dim / toolbar can never be composited into the OCR image.
    const hidMainWindow = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
    if (hidMainWindow) {
        mainWindow?.hide();
        await waitForCompositorFrame();
    }
    try {
        frozenCapture = await captureFrozenFrame();
        const window = await ensureOverlayWindow(mode);
        const display = screen.getPrimaryDisplay();
        window.setBounds(display.bounds);
        window.show();
        window.focus();
    } catch (error) {
        // We hid the app to take a clean frame. If anything after that fails we must
        // put it back, or the shortcut just makes Yomu disappear with nothing to show.
        frozenCapture = null;
        if (hidMainWindow && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
        reportOverlayFailure(error);
    }
}

function reportOverlayFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Yomu could not read the screen.';
    dialog.showErrorBox(APP_NAME, message);
}

function hideOverlay(): void {
    overlayWindow?.hide();
    frozenCapture = null;
}

async function captureFrozenFrame(): Promise<YomuGamingCaptureSource> {
    const wasOverlayVisible = Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
    if (wasOverlayVisible) {
        overlayWindow?.hide();
        await waitForCompositorFrame();
    }
    try {
        return await capturePrimaryScreen();
    } finally {
        if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.show();
            overlayWindow.focus();
        }
    }
}

// Two animation frames is enough for the compositor to drop a just-hidden window
// before desktopCapturer samples the display.
function waitForCompositorFrame(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 90));
}

async function showApp(): Promise<void> {
    if (!mainWindow || mainWindow.isDestroyed()) await createMainWindow();
    mainWindow?.show();
    mainWindow?.focus();
}

function registerIpcHandlers(): void {
    ipcMain.handle(YOMU_GAMING_CHANNELS.getEnvironment, () => environmentStatus());
    ipcMain.handle(YOMU_GAMING_CHANNELS.requestOcr, (_event, request) => requestGamingOcr(normalizeOcrRequest(request)));
    ipcMain.handle(YOMU_GAMING_CHANNELS.getFrozenCapture, () => getFrozenCapture());
    ipcMain.handle(YOMU_GAMING_CHANNELS.recaptureFrozenFrame, () => recaptureFrozenFrame());
    ipcMain.handle(YOMU_GAMING_CHANNELS.openScreenSettings, () => openScreenRecordingSettings());
    ipcMain.handle(YOMU_GAMING_CHANNELS.showOverlay, (_event, mode: unknown) => showOverlay(normalizeCaptureMode(mode)));
    ipcMain.handle(YOMU_GAMING_CHANNELS.hideOverlay, () => hideOverlay());
    ipcMain.handle(YOMU_GAMING_CHANNELS.showApp, () => showApp());
    ipcMain.handle(YOMU_GAMING_CHANNELS.hideApp, () => {
        mainWindow?.hide();
    });
    ipcMain.handle(YOMU_GAMING_CHANNELS.openExternal, (_event, url: string) => openAllowedExternalUrl(url));
    ipcMain.handle(YOMU_GAMING_CHANNELS.updateCaptureShortcut, (_event, shortcut: string) => updateCaptureShortcut(shortcut));
    ipcMain.handle(YOMU_GAMING_CHANNELS.syncSettingsSnapshot, (_event, settings: unknown) => syncSettingsSnapshot(settings));
    ipcMain.handle(YOMU_GAMING_CHANNELS.restoreSettingsSnapshot, () => restoreSettingsSnapshot());
}

function environmentStatus(): YomuGamingEnvironment {
    const displayServer = process.env.XDG_SESSION_TYPE || process.env.WAYLAND_DISPLAY && 'wayland' || process.env.DISPLAY && 'x11' || 'unknown';
    const desktop = process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || 'unknown';
    return {
        platform: process.platform,
        displayServer,
        desktop,
        isSteamDeckSession: /gamescope|steamdeck|steam/i.test(`${desktop} ${process.env.SESSION_DESKTOP ?? ''}`),
        isPackaged: app.isPackaged,
        hotkey,
        hotkeyRegistered,
        hotkeyError: hotkeyError || undefined,
        screenAccess: screenAccessStatus(),
    };
}

async function captureSources(width: number, height: number): Promise<YomuGamingCaptureSource[]> {
    const simulated = simulatedCaptureSource();
    if (simulated) return [simulated];
    assertScreenAccess();
    // Only ever the screen: we grab the whole display and crop from the frozen frame.
    // Asking for window thumbnails too made every capture render 14 extra native-size
    // images for nothing (measured 550ms vs 351ms).
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
        fetchWindowIcons: false,
    }).catch(error => {
        throw new Error(screenCaptureErrorMessage(error));
    });
    return sources
        .filter(source => !source.thumbnail.isEmpty())
        .map(source => ({
            id: source.id,
            name: source.name,
            kind: captureSourceKind(source.id),
            displayId: source.display_id || '',
            thumbnailDataUrl: source.thumbnail.toDataURL(),
            size: source.thumbnail.getSize(),
        }));
}

async function capturePrimaryScreen(): Promise<YomuGamingCaptureSource> {
    const primaryDisplay = screen.getPrimaryDisplay();
    const primaryDisplayId = String(primaryDisplay.id);
    const { width, height } = nativeCaptureSize(primaryDisplay);
    for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await wait(CAPTURE_RETRY_DELAY_MS);
        // An empty thumbnail is dropped by captureSources, so a cold screen simply
        // yields no sources — that is the case worth retrying.
        const sources = await captureSources(width, height);
        const source = sources.find(candidate => candidate.kind === 'screen' && candidate.displayId === primaryDisplayId)
            ?? sources.find(candidate => candidate.kind === 'screen');
        if (source) return source;
    }
    throw new Error('No capture source is available.');
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getFrozenCapture(): Promise<YomuGamingCaptureSource> {
    if (frozenCapture) return frozenCapture;
    frozenCapture = await captureFrozenFrame();
    return frozenCapture;
}

async function recaptureFrozenFrame(): Promise<YomuGamingCaptureSource> {
    frozenCapture = await captureFrozenFrame();
    return frozenCapture;
}

// Native framebuffer size (logical x scaleFactor), long-edge-capped, so OCR sees
// full Retina/4K detail instead of a downscaled 1080p thumbnail.
function nativeCaptureSize(display: Electron.Display): { width: number; height: number } {
    const scale = display.scaleFactor || 1;
    const rawWidth = Math.round(display.size.width * scale);
    const rawHeight = Math.round(display.size.height * scale);
    const longEdge = Math.max(rawWidth, rawHeight, 1);
    const factor = longEdge > MAX_CAPTURE_EDGE ? MAX_CAPTURE_EDGE / longEdge : 1;
    return {
        width: Math.max(1, Math.round(rawWidth * factor)),
        height: Math.max(1, Math.round(rawHeight * factor)),
    };
}

function screenAccessStatus(): YomuGamingScreenAccess {
    if (process.platform !== 'darwin') return 'unsupported';
    const status = systemPreferences.getMediaAccessStatus('screen');
    return status === 'unknown' ? 'not-determined' : status;
}

function assertScreenAccess(): void {
    const status = screenAccessStatus();
    if (status === 'denied' || status === 'restricted') {
        throw new Error(SCREEN_PERMISSION_MESSAGE);
    }
}

function screenCaptureErrorMessage(error: unknown): string {
    if (process.platform === 'darwin' && screenAccessStatus() !== 'granted') {
        return SCREEN_PERMISSION_MESSAGE;
    }
    return error instanceof Error ? error.message : 'Screen capture failed.';
}

function openScreenRecordingSettings(): Promise<void> {
    if (process.platform === 'darwin') {
        return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
    return Promise.resolve();
}

function captureSourceKind(id: string): YomuGamingCaptureSource['kind'] {
    if (id.startsWith('screen:')) return 'screen';
    if (id.startsWith('window:')) return 'window';
    return 'unknown';
}

function simulatedCaptureSource(): YomuGamingCaptureSource | null {
    const capturePath = process.env.YOMU_GAMING_SIMULATED_CAPTURE_PATH;
    if (!capturePath) return null;
    const resolvedPath = path.resolve(capturePath);
    const image = nativeImage.createFromPath(resolvedPath);
    if (image.isEmpty()) throw new Error(`Simulated capture image is empty: ${resolvedPath}`);
    return {
        id: 'screen:simulated-primary',
        name: 'Yomu Gaming simulated primary screen',
        kind: 'screen',
        displayId: 'simulated',
        thumbnailDataUrl: image.toDataURL(),
        size: image.getSize(),
    };
}

function overlayHash(mode: YomuGamingCaptureMode): string {
    return mode === 'area' ? 'overlay-area' : 'overlay-instant';
}

function normalizeCaptureMode(value: unknown): YomuGamingCaptureMode {
    return value === 'area' ? 'area' : 'instant';
}

async function openAllowedExternalUrl(value: string): Promise<void> {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has(url.hostname)) {
        throw new Error('External URL is not allowed.');
    }
    await shell.openExternal(url.toString());
}

async function syncSettingsSnapshot(settings: unknown): Promise<YomuGamingSettingsSyncMetadata> {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('Settings snapshot must be an object.');
    }
    const storagePath = settingsSyncPath();
    const syncedAt = new Date().toISOString();
    const snapshot: YomuGamingSettingsSnapshot = { version: 1, syncedAt, settings };
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    return { syncedAt, storagePath };
}

async function restoreSettingsSnapshot(): Promise<YomuGamingSettingsSnapshot | null> {
    let raw = '';
    try {
        raw = await readFile(settingsSyncPath(), 'utf8');
    } catch (error) {
        if (isNodeErrorCode(error, 'ENOENT')) return null;
        throw error;
    }
    const parsed = JSON.parse(raw) as unknown;
    const snapshot = normalizeSettingsSnapshot(parsed);
    if (!snapshot) throw new Error('Saved settings snapshot is invalid.');
    return snapshot;
}

async function loadCaptureShortcut(): Promise<void> {
    let raw = '';
    try {
        raw = await readFile(captureShortcutPath(), 'utf8');
    } catch (error) {
        if (isNodeErrorCode(error, 'ENOENT')) return;
        throw error;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const shortcut = (parsed as Record<string, unknown>).shortcut;
    const normalized = normalizeCaptureShortcut(shortcut);
    if (normalized.ok) hotkey = normalized.shortcut;
}

async function updateCaptureShortcut(value: string): Promise<YomuGamingEnvironment> {
    const previousHotkey = hotkey;
    const normalized = normalizeCaptureShortcut(value);
    if (!normalized.ok) {
        hotkeyError = normalized.error;
        return environmentStatus();
    }
    hotkey = normalized.shortcut;
    registerGlobalShortcuts();
    if (!hotkeyRegistered) {
        hotkey = previousHotkey;
        registerGlobalShortcuts();
        hotkeyError = `${normalized.shortcut} could not be registered. Another app may already be using it.`;
        return environmentStatus();
    }
    hotkeyError = '';
    await persistCaptureShortcut(hotkey);
    return environmentStatus();
}

async function persistCaptureShortcut(shortcut: string): Promise<void> {
    const storagePath = captureShortcutPath();
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, `${JSON.stringify({ version: 1, shortcut }, null, 2)}\n`, 'utf8');
}

function settingsSyncPath(): string {
    return process.env.YOMU_GAMING_SETTINGS_SYNC_PATH
        ? path.resolve(process.env.YOMU_GAMING_SETTINGS_SYNC_PATH)
        : path.join(app.getPath('userData'), SETTINGS_SYNC_FILE_NAME);
}

function captureShortcutPath(): string {
    return process.env.YOMU_GAMING_CAPTURE_SHORTCUT_PATH
        ? path.resolve(process.env.YOMU_GAMING_CAPTURE_SHORTCUT_PATH)
        : path.join(app.getPath('userData'), CAPTURE_SHORTCUT_FILE_NAME);
}

function normalizeSettingsSnapshot(value: unknown): YomuGamingSettingsSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1) return null;
    if (typeof record.syncedAt !== 'string' || !record.syncedAt.trim()) return null;
    if (!record.settings || typeof record.settings !== 'object' || Array.isArray(record.settings)) return null;
    return {
        version: 1,
        syncedAt: record.syncedAt,
        settings: record.settings,
    };
}

function isNodeErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

function normalizeCaptureShortcut(value: unknown): { ok: true; shortcut: string } | { ok: false; error: string } {
    if (typeof value !== 'string') return { ok: false, error: 'Capture shortcut must be text.' };
    const parts = value.split('+').map(part => normalizeShortcutPart(part)).filter(Boolean);
    const deduped = parts.filter((part, index) => parts.indexOf(part) === index);
    const key = [...deduped].reverse().find(part => !MODIFIER_KEYS.has(part)) ?? '';
    const hasModifier = deduped.some(part => MODIFIER_KEYS.has(part));
    if (!key) return { ok: false, error: 'Press a shortcut with a letter, number, function key, or named key.' };
    if (!hasModifier) return { ok: false, error: 'Use at least one modifier, such as Ctrl, Alt, Shift, or Command.' };
    return { ok: true, shortcut: orderShortcutParts(deduped).join('+') };
}

function normalizeShortcutPart(part: string): string {
    const value = part.trim();
    if (!value) return '';
    const lower = value.toLowerCase().replace(/\s+/g, '');
    const alias = SHORTCUT_PART_ALIASES.get(lower);
    if (alias) return alias;
    if (/^f([1-9]|1\d|2[0-4])$/i.test(value)) return value.toUpperCase();
    if (/^[a-z0-9]$/i.test(value)) return value.toUpperCase();
    if (/^[a-z][a-z0-9]*$/i.test(value)) return value[0].toUpperCase() + value.slice(1);
    return '';
}

function orderShortcutParts(parts: string[]): string[] {
    const key = [...parts].reverse().find(part => !MODIFIER_KEYS.has(part)) ?? '';
    return ['CommandOrControl', 'Control', 'Command', 'Alt', 'Shift', 'Super']
        .filter(part => parts.includes(part))
        .concat(key ? [key] : []);
}

function registerGlobalShortcuts(): void {
    if (registeredHotkey) {
        globalShortcut.unregister(registeredHotkey);
        registeredHotkey = null;
    }
    hotkeyRegistered = process.env.YOMU_GAMING_TEST_MODE === '1' || globalShortcut.register(hotkey, () => {
        if (overlayWindow?.isVisible()) hideOverlay();
        else void showOverlay('instant').catch(reportOverlayFailure);
    });
    if (hotkeyRegistered) registeredHotkey = hotkey;
}

app.whenReady().then(async () => {
    registerIpcHandlers();
    await loadCaptureShortcut();
    registerGlobalShortcuts();
    await createMainWindow();
});

app.on('activate', () => {
    // The window is hidden, not closed, whenever the overlay is up — so clicking the
    // dock icon has to bring it back, otherwise a hidden window looks like a dead app.
    if (!mainWindow || mainWindow.isDestroyed()) void createMainWindow();
    else {
        mainWindow.show();
        mainWindow.focus();
    }
});

app.on('before-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
