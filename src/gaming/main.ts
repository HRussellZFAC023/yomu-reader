import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, systemPreferences, Tray, type BrowserWindowConstructorOptions } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    captureTargetForDisplay,
    selectCaptureSourceForDisplay,
    type GamingCaptureTarget,
    type GamingDisplayGeometry,
} from './display';
import { normalizeOcrRequest, requestGamingOcr } from './ocr';
import { captureShortcutLabel, DEFAULT_CAPTURE_SHORTCUT, normalizeCaptureShortcut } from './capture-shortcut';
import {
    applyMainRendererTargetChoice,
    createGamingTray,
    runOverlayCapture,
    runTargetGatedCapture,
    windowCloseIntent,
    type GamingTrayController,
    type GamingTrayHost,
    type GamingTrayItem,
    type GamingTrayStatus,
} from './lifecycle';
import {
    YOMU_GAMING_CHANNELS,
    type YomuGamingCaptureMode,
    type YomuGamingCaptureSource,
    type YomuGamingEnvironment,
    type YomuGamingScreenAccess,
    type YomuGamingSettingsSnapshot,
    type YomuGamingSettingsSyncMetadata,
} from './ipc';

const APP_NAME = 'Yomu Gaming';
// macOS hands back an EMPTY screen thumbnail on the first desktopCapturer call after
// launch — ScreenCaptureKit has not warmed up yet. Measured on 5/5 cold starts, and
// twice in a row on one of them. Without a retry the first hotkey press of every
// session fails, so retry until a screen actually arrives.
const CAPTURE_ATTEMPTS = 6;
const CAPTURE_RETRY_DELAY_MS = 120;
// Copied next to the bundled main.cjs by scripts/build-gaming-electron.mjs, so the
// same __dirname lookup works from dist-gaming/electron and from inside app.asar.
const APP_ICON_FILE = 'yomu-icon-512.png';
const SCREEN_PERMISSION_MESSAGE = process.platform === 'darwin'
    ? 'Yomu Gaming needs Screen Recording permission. Open System Settings › Privacy & Security › Screen Recording, enable Yomu Gaming, then quit and reopen the app.'
    : 'Yomu Gaming could not read the screen. Check this device’s screen-capture permissions and try again.';
const ALLOWED_EXTERNAL_HOSTS = new Set(['yomureader.com', 'jpdb.io', 'jiten.moe']);
const SETTINGS_SYNC_FILE_NAME = 'settings-sync-v1.json';
const CAPTURE_SHORTCUT_FILE_NAME = 'capture-shortcut-v1.json';

installBrokenPipeGuard();

if (process.env.YOMU_GAMING_USER_DATA_DIR) {
    app.setPath('userData', path.resolve(process.env.YOMU_GAMING_USER_DATA_DIR));
}
configureNativeAppMetadata();
// Exactly one copy owns the tray item and the capture shortcut. Claimed after the userData
// path is settled, because that is what the lock is scoped to.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: GamingTrayController | null = null;
// Set the moment a real quit starts, so the close handler stops parking windows and lets
// them go. Without it, hiding on close would silently cancel Cmd+Q and the tray's Quit.
let quitting = false;
let hotkeyRegistered = false;
let hotkey = DEFAULT_CAPTURE_SHORTCUT;
let hotkeyError = '';
let registeredHotkey: string | null = null;
// Main owns the screen sampler, so it needs an explicit positive choice of its own.
// It starts closed and is synchronized by the main renderer after local settings load.
let learningTargetChosen = false;
let targetChoiceRequested = false;
// Freeze-frame: the screen is grabbed once while none of our windows are visible,
// then the overlay reads/crops from this frozen frame. This is what keeps the
// overlay's own selection chrome out of the OCR'd image.
let frozenCapture: YomuGamingCaptureSource | null = null;
// The display this overlay session belongs to. Held for as long as the overlay is up
// so a re-capture re-reads the same screen the player is looking at.
let activeCaptureTarget: GamingCaptureTarget | null = null;

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
    window.on('close', event => {
        const intent = windowCloseIntent(lifecycleState());
        // Park the window instead of destroying it: the capture shortcut and the tray keep
        // working, and reopening Settings is instant.
        if (intent === 'hide') {
            event.preventDefault();
            window.hide();
            return;
        }
        // No tray to come back from, so let this window go and end the session with it —
        // never leave a hidden overlay holding the process open.
        if (intent === 'quit') quitApp();
    });
    window.on('closed', () => {
        mainWindow = null;
    });
    await window.loadURL(rendererUrl());
    notifyTargetChoiceRequired();
    if (!window.isDestroyed() && !window.isVisible()) window.show();
}

function mainWindowOptions(): Pick<BrowserWindowConstructorOptions, 'x' | 'y' | 'width' | 'height'> {
    const workArea = activeDisplay().workArea;
    return {
        x: workArea.x,
        y: workArea.y,
        width: Math.max(640, workArea.width),
        height: Math.max(520, workArea.height),
    };
}

// The display the player is looking at: the one under the pointer. Everything that
// used to assume the primary display — the window, the overlay, the screen grab —
// goes through here, so a game on the second monitor is read on the second monitor.
function activeDisplay(): Electron.Display {
    try {
        return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    } catch {
        return screen.getPrimaryDisplay();
    }
}

// Resolved once per capture and threaded through the overlay bounds AND the grab, so
// the two can never disagree about which screen the frozen frame came from.
function resolveCaptureTarget(): GamingCaptureTarget {
    const display = activeDisplay();
    let displays: Electron.Display[] = [];
    try {
        displays = screen.getAllDisplays();
    } catch {
        displays = [display];
    }
    return captureTargetForDisplay(displays.map(displayGeometry), displayGeometry(display));
}

function displayCount(): number {
    try {
        return screen.getAllDisplays().length;
    } catch {
        return 1;
    }
}

function displayGeometry(display: Electron.Display): GamingDisplayGeometry {
    return {
        id: String(display.id),
        bounds: display.bounds,
        workArea: display.workArea,
        size: display.size,
        scaleFactor: display.scaleFactor,
    };
}

async function ensureOverlayWindow(mode: YomuGamingCaptureMode, target: GamingCaptureTarget): Promise<BrowserWindow> {
    const hash = overlayHash(mode);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        // Always reload, even when the mode is unchanged. The renderer reads the frozen
        // frame exactly once per document (its controller is guarded by a `started`
        // flag), so reusing the document replayed the FIRST capture on every later
        // press — the scene had moved on but the overlay still showed the old one.
        await overlayWindow.loadURL(rendererUrl(hash));
        return overlayWindow;
    }
    overlayWindow = new BrowserWindow({
        x: target.bounds.x,
        y: target.bounds.y,
        width: target.bounds.width,
        height: target.bounds.height,
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
    return path.join(__dirname, APP_ICON_FILE);
}

function applyAppIcon(): void {
    const icon = nativeImage.createFromPath(appIconPath());
    // nativeImage hands back an *empty* image for a path it cannot read, and every
    // consumer of the icon — the Dock, the about panel, the Windows and Linux window
    // icon — then keeps its default without a word. Say it out loud instead.
    if (icon.isEmpty()) {
        console.error(`[yomu-gaming] App icon did not load from ${appIconPath()}.`);
        return;
    }
    // BrowserWindow `icon` only reaches Windows and Linux. macOS draws the Dock and
    // app-switcher entry from the running bundle, so an unpackaged run wears stock
    // Electron's logo until the Dock is handed our image; a packaged build already
    // carries the multi-resolution .icns, sharper at small sizes than this PNG.
    if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(icon);
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

async function requestOverlay(mode: YomuGamingCaptureMode = 'instant'): Promise<void> {
    await runTargetGatedCapture({
        learningTargetChosen,
        chooseTarget: requestLearningTargetChoice,
        capture: () => showOverlay(mode),
    });
}

async function showOverlay(mode: YomuGamingCaptureMode): Promise<void> {
    const hidMainWindow = await hideMainWindowForCapture();
    try {
        await openOverlayFromFrozenCapture(mode);
    } catch (error) {
        restoreAfterOverlayFailure(hidMainWindow);
        reportOverlayFailure(error);
    }
}

async function hideMainWindowForCapture(): Promise<boolean> {
    // Grab the frame while neither of our windows is on screen, so the overlay's
    // own selection box / dim / toolbar can never be composited into the OCR image.
    const window = visibleMainWindow();
    if (!window) return false;
    window.hide();
    await waitForCompositorFrame();
    return true;
}

function visibleMainWindow(): BrowserWindow | null {
    const window = mainWindow;
    if (!window) return null;
    if (window.isDestroyed()) return null;
    if (!window.isVisible()) return null;
    return window;
}

async function openOverlayFromFrozenCapture(mode: YomuGamingCaptureMode): Promise<void> {
    const target = resolveCaptureTarget();
    activeCaptureTarget = target;
    frozenCapture = await captureFrozenFrame(target);
    const window = await ensureOverlayWindow(mode, target);
    window.setBounds(target.bounds);
    window.show();
    window.focus();
}

function restoreAfterOverlayFailure(hidMainWindow: boolean): void {
    // We hid the app to take a clean frame. If anything after that fails we must
    // put it back, or the shortcut just makes Yomu disappear with nothing to show.
    frozenCapture = null;
    activeCaptureTarget = null;
    const window = restorableMainWindow(hidMainWindow);
    if (!window) return;
    window.show();
    window.focus();
}

function restorableMainWindow(wasHidden: boolean): BrowserWindow | null {
    if (!wasHidden) return null;
    const window = mainWindow;
    if (!window) return null;
    if (window.isDestroyed()) return null;
    return window;
}

function reportOverlayFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Yomu could not read the screen.';
    dialog.showErrorBox(APP_NAME, message);
}

function hideOverlay(): void {
    overlayWindow?.hide();
    frozenCapture = null;
    activeCaptureTarget = null;
}

async function captureFrozenFrame(target: GamingCaptureTarget): Promise<YomuGamingCaptureSource> {
    const wasOverlayVisible = Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
    if (wasOverlayVisible) {
        overlayWindow?.hide();
        await waitForCompositorFrame();
    }
    try {
        return await captureTargetScreen(target);
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
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
}

async function requestLearningTargetChoice(): Promise<void> {
    targetChoiceRequested = true;
    await showApp();
    notifyTargetChoiceRequired();
}

function notifyTargetChoiceRequired(): void {
    if (!targetChoiceRequested) return;
    const window = mainWindow;
    if (!window) return;
    if ([window.isDestroyed(), window.webContents.isLoading()].includes(true)) return;
    window.webContents.send(YOMU_GAMING_CHANNELS.targetChoiceRequired);
}

function setLearningTargetChosen(event: Electron.IpcMainInvokeEvent, value: unknown): void {
    const window = mainWindow;
    applyMainRendererTargetChoice({
        chosen: value === true,
        senderId: event.sender.id,
        mainRendererId: window && !window.isDestroyed() ? window.webContents.id : null,
        apply: chosen => {
            learningTargetChosen = chosen;
            if (learningTargetChosen) targetChoiceRequested = false;
        },
    });
}

function lifecycleState() {
    return { quitting, hasTray: Boolean(tray), platform: process.platform };
}

// The tray is the app's home while every window is away: it keeps Yomu reachable, and it
// owns the only Quit. Built after the shortcut is registered so the labels are accurate.
function createTray(): void {
    if (tray) return;
    tray = createGamingTray(electronTrayHost(), {
        readScreen: () => void requestOverlay('instant').catch(reportOverlayFailure),
        openSettings: () => void showApp(),
        quit: () => quitApp(),
    }, trayStatus());
}

function electronTrayHost(): GamingTrayHost {
    return {
        platform: process.platform,
        iconPath: appIconPath(),
        createImage: iconPath => nativeImage.createFromPath(iconPath),
        createTray: image => wrapTray(new Tray(image as Electron.NativeImage)),
        buildMenu: template => Menu.buildFromTemplate(template as Electron.MenuItemConstructorOptions[]),
        reportError: error => {
            console.warn(`[yomu-gaming] tray unavailable: ${error instanceof Error ? error.message : error}`);
        },
    };
}

function wrapTray(instance: Tray): GamingTrayItem {
    return {
        setToolTip: tooltip => instance.setToolTip(tooltip),
        setContextMenu: menu => instance.setContextMenu(menu as Electron.Menu),
        on: (event, listener) => {
            instance.on(event as 'click', () => listener());
        },
        destroy: () => instance.destroy(),
    };
}

function trayStatus(): GamingTrayStatus {
    return {
        shortcutLabel: captureShortcutLabel(hotkey, process.platform),
        shortcutRegistered: hotkeyRegistered,
    };
}

function refreshTray(): void {
    tray?.refresh(trayStatus());
}

function quitApp(): void {
    quitting = true;
    app.quit();
}

function registerIpcHandlers(): void {
    ipcMain.handle(YOMU_GAMING_CHANNELS.getEnvironment, () => environmentStatus());
    ipcMain.handle(YOMU_GAMING_CHANNELS.requestOcr, (_event, request) => requestGamingOcr(normalizeOcrRequest(request)));
    ipcMain.handle(YOMU_GAMING_CHANNELS.getFrozenCapture, event => captureForOverlay(event, getFrozenCapture));
    ipcMain.handle(YOMU_GAMING_CHANNELS.recaptureFrozenFrame, event => captureForOverlay(event, recaptureFrozenFrame));
    ipcMain.handle(YOMU_GAMING_CHANNELS.openScreenSettings, () => openScreenRecordingSettings());
    ipcMain.handle(YOMU_GAMING_CHANNELS.showOverlay, (_event, mode: unknown) => requestOverlay(normalizeCaptureMode(mode)));
    ipcMain.handle(YOMU_GAMING_CHANNELS.hideOverlay, () => hideOverlay());
    ipcMain.handle(YOMU_GAMING_CHANNELS.showApp, () => showApp());
    ipcMain.handle(YOMU_GAMING_CHANNELS.hideApp, () => {
        mainWindow?.hide();
    });
    ipcMain.handle(YOMU_GAMING_CHANNELS.openExternal, (_event, url: string) => openAllowedExternalUrl(url));
    ipcMain.handle(YOMU_GAMING_CHANNELS.updateCaptureShortcut, (_event, shortcut: string) => updateCaptureShortcut(shortcut));
    ipcMain.handle(YOMU_GAMING_CHANNELS.syncSettingsSnapshot, (_event, settings: unknown) => syncSettingsSnapshot(settings));
    ipcMain.handle(YOMU_GAMING_CHANNELS.restoreSettingsSnapshot, () => restoreSettingsSnapshot());
    ipcMain.handle(YOMU_GAMING_CHANNELS.setLearningTargetChosen, (event, chosen: unknown) => setLearningTargetChosen(event, chosen));
}

function captureForOverlay(
    event: Electron.IpcMainInvokeEvent,
    capture: () => Promise<YomuGamingCaptureSource>,
): Promise<YomuGamingCaptureSource> {
    const overlay = overlayWindow;
    return runOverlayCapture({
        learningTargetChosen,
        senderId: event.sender.id,
        overlayRendererId: overlay && !overlay.isDestroyed() ? overlay.webContents.id : null,
        capture,
    });
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
        displayCount: displayCount(),
        hotkey,
        hotkeyRegistered,
        hotkeyError: hotkeyError || undefined,
        trayActive: Boolean(tray),
        screenAccess: screenAccessStatus(),
    };
}

interface ScreenCaptureCandidate {
    id: string;
    name: string;
    kind: YomuGamingCaptureSource['kind'];
    displayId: string;
    thumbnail: Electron.NativeImage;
}

// Cheap listing only — the native images stay unencoded here so we can pick first
// and pay for exactly one PNG.
async function captureCandidates(size: { width: number; height: number }): Promise<ScreenCaptureCandidate[]> {
    assertScreenAccess();
    // Only ever the screen: we grab the whole display and crop from the frozen frame.
    // Asking for window thumbnails too made every capture render 14 extra native-size
    // images for nothing (measured 550ms vs 351ms).
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: size,
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
            thumbnail: source.thumbnail,
        }));
}

// Base64-encoding a native-size screenshot is the expensive step, so it happens once,
// on the screen we actually chose. Encoding every returned source first charged the
// user a full 4K PNG per extra monitor on every single press.
function encodeCaptureSource(candidate: ScreenCaptureCandidate): YomuGamingCaptureSource {
    return {
        id: candidate.id,
        name: candidate.name,
        kind: candidate.kind,
        displayId: candidate.displayId,
        thumbnailDataUrl: candidate.thumbnail.toDataURL(),
        size: candidate.thumbnail.getSize(),
    };
}

async function captureTargetScreen(target: GamingCaptureTarget): Promise<YomuGamingCaptureSource> {
    const simulated = simulatedCaptureSource();
    if (simulated) return simulated;
    for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await wait(CAPTURE_RETRY_DELAY_MS);
        // An empty thumbnail is dropped by captureCandidates, so a cold screen simply
        // yields no sources — that is the case worth retrying.
        const candidates = await captureCandidates(target.captureSize);
        const chosen = selectCaptureSourceForDisplay(candidates, target);
        if (chosen) return encodeCaptureSource(chosen);
    }
    throw new Error('No capture source is available.');
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getFrozenCapture(): Promise<YomuGamingCaptureSource> {
    if (frozenCapture) return frozenCapture;
    frozenCapture = await captureFrozenFrame(sessionCaptureTarget());
    return frozenCapture;
}

async function recaptureFrozenFrame(): Promise<YomuGamingCaptureSource> {
    frozenCapture = await captureFrozenFrame(sessionCaptureTarget());
    return frozenCapture;
}

// Re-capture stays on the screen this overlay session opened on. Re-resolving from the
// cursor mid-session would let a stray pointer swap the frame under the selection.
function sessionCaptureTarget(): GamingCaptureTarget {
    if (activeCaptureTarget) return activeCaptureTarget;
    activeCaptureTarget = resolveCaptureTarget();
    return activeCaptureTarget;
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
    const normalized = normalizeCaptureShortcut(shortcut, process.platform);
    if (normalized.ok) hotkey = normalized.shortcut;
}

async function updateCaptureShortcut(value: string): Promise<YomuGamingEnvironment> {
    const previousHotkey = hotkey;
    const normalized = normalizeCaptureShortcut(value, process.platform);
    if (!normalized.ok) {
        hotkeyError = normalized.error;
        return environmentStatus();
    }
    hotkey = normalized.shortcut;
    registerGlobalShortcuts();
    if (!hotkeyRegistered) {
        hotkey = previousHotkey;
        registerGlobalShortcuts();
        // The renderer shows this verbatim, so it is written as advice, not as a report:
        // the previous shortcut is already back in place by the time it is read.
        hotkeyError = `${normalized.shortcut} is taken here. Try another key.`;
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

function registerGlobalShortcuts(): void {
    if (registeredHotkey) {
        globalShortcut.unregister(registeredHotkey);
        registeredHotkey = null;
    }
    hotkeyRegistered = process.env.YOMU_GAMING_TEST_MODE === '1' || globalShortcut.register(hotkey, () => {
        if (overlayWindow?.isVisible()) hideOverlay();
        else void requestOverlay('instant').catch(reportOverlayFailure);
    });
    if (hotkeyRegistered) registeredHotkey = hotkey;
    // Single place the shortcut changes, so it is the single place the tray relabels.
    refreshTray();
}

app.whenReady().then(async () => {
    if (!hasSingleInstanceLock) return;
    applyAppIcon();
    registerIpcHandlers();
    await loadCaptureShortcut();
    registerGlobalShortcuts();
    createTray();
    await createMainWindow();
});

app.on('second-instance', () => {
    // Closing the window now parks Yomu in the tray, so relaunching is the obvious way
    // back in. Show the running copy instead of starting a rival tray icon and hotkey.
    void showApp();
});

app.on('activate', () => {
    // The window is hidden, not closed, whenever the overlay is up — so clicking the
    // dock icon has to bring it back, otherwise a hidden window looks like a dead app.
    void showApp();
});

app.on('before-quit', () => {
    quitting = true;
    globalShortcut.unregisterAll();
    registeredHotkey = null;
    tray?.destroy();
    tray = null;
});

app.on('window-all-closed', () => {
    // With a tray item Yomu Gaming stays live on purpose — that is what keeps the capture
    // shortcut working after the settings window is closed.
    if (!tray && process.platform !== 'darwin') quitApp();
});
