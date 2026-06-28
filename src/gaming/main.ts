import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    YOMU_GAMING_CHANNELS,
    type YomuGamingCaptureMode,
    type YomuGamingCaptureRequest,
    type YomuGamingCaptureSource,
    type YomuGamingEnvironment,
    type YomuGamingOcrRequest,
    type YomuGamingOcrResponse,
    type YomuGamingSettingsSnapshot,
    type YomuGamingSettingsSyncMetadata,
} from './ipc';

const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Y';
const APP_NAME = 'Yomu Gaming';
const DEFAULT_CAPTURE_WIDTH = 1920;
const DEFAULT_CAPTURE_HEIGHT = 1080;
const OCR_TIMEOUT_MS = 18_000;
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

const nativeConsoleError = console.error.bind(console);

function isBenignPipeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const code = error && typeof error === 'object' && 'code' in error
        ? String((error as NodeJS.ErrnoException).code ?? '')
        : '';
    return code === 'EPIPE' || /write EPIPE/i.test(message);
}

console.error = (...args: unknown[]) => {
    try {
        nativeConsoleError(...args);
    } catch (error) {
        if (!isBenignPipeError(error)) throw error;
    }
};

process.on('uncaughtException', error => {
    if (isBenignPipeError(error)) return;
    nativeConsoleError(error);
    process.exitCode = 1;
});

process.on('unhandledRejection', reason => {
    if (isBenignPipeError(reason)) return;
    nativeConsoleError(reason);
});

if (process.env.YOMU_GAMING_USER_DATA_DIR) {
    app.setPath('userData', path.resolve(process.env.YOMU_GAMING_USER_DATA_DIR));
}

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let hotkeyRegistered = false;
let hotkey = DEFAULT_HOTKEY;
let hotkeyError = '';
let registeredHotkey: string | null = null;

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
    const iconPath = resolveAppIconPath();
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 900,
        minHeight: 640,
        title: APP_NAME,
        backgroundColor: '#f8fafc',
        alwaysOnTop: false,
        ...(iconPath ? { icon: iconPath } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    await mainWindow.loadURL(rendererUrl());
}

async function ensureOverlayWindow(mode: YomuGamingCaptureMode): Promise<BrowserWindow> {
    const hash = overlayHash(mode);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        if (new URL(overlayWindow.webContents.getURL()).hash !== `#${hash}`) {
            await overlayWindow.loadURL(rendererUrl(hash));
        }
        return overlayWindow;
    }
    const display = screen.getPrimaryDisplay();
    const iconPath = resolveAppIconPath();
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
        ...(iconPath ? { icon: iconPath } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
    await overlayWindow.loadURL(rendererUrl(hash));
    return overlayWindow;
}

function resolveAppIconPath(): string {
    const candidates = [
        process.env.YOMU_GAMING_ICON_PATH,
        path.join(__dirname, '..', 'icon.png'),
        path.join(app.getAppPath(), 'icon.png'),
        path.join(process.cwd(), 'public', 'app-icons', 'yomu-gaming-512.png'),
    ].filter(Boolean) as string[];
    return candidates.find(candidate => existsSync(candidate)) ?? '';
}

async function showOverlay(mode: YomuGamingCaptureMode = 'instant'): Promise<void> {
    mainWindow?.hide();
    const window = await ensureOverlayWindow(mode);
    const display = screen.getPrimaryDisplay();
    window.setBounds(display.bounds);
    window.show();
    window.focus();
}

function hideOverlay(): void {
    overlayWindow?.hide();
}

async function showApp(): Promise<void> {
    if (!mainWindow || mainWindow.isDestroyed()) await createMainWindow();
    mainWindow?.show();
    mainWindow?.focus();
}

function registerIpcHandlers(): void {
    ipcMain.handle(YOMU_GAMING_CHANNELS.getEnvironment, () => environmentStatus());
    ipcMain.handle(YOMU_GAMING_CHANNELS.listCaptureSources, () => captureSources(DEFAULT_CAPTURE_WIDTH, DEFAULT_CAPTURE_HEIGHT));
    ipcMain.handle(YOMU_GAMING_CHANNELS.captureSource, (_event, request: YomuGamingCaptureRequest) =>
        captureSource(request.sourceId, request.width ?? DEFAULT_CAPTURE_WIDTH, request.height ?? DEFAULT_CAPTURE_HEIGHT));
    ipcMain.handle(YOMU_GAMING_CHANNELS.capturePrimaryScreen, () => capturePrimaryScreen());
    ipcMain.handle(YOMU_GAMING_CHANNELS.requestOcr, (_event, request: YomuGamingOcrRequest) => requestOcr(request));
    ipcMain.handle(YOMU_GAMING_CHANNELS.showOverlay, (_event, mode: unknown) => showOverlay(normalizeCaptureMode(mode)));
    ipcMain.handle(YOMU_GAMING_CHANNELS.hideOverlay, () => hideOverlay());
    ipcMain.handle(YOMU_GAMING_CHANNELS.completeOverlayCapture, (_event, capture: YomuGamingCaptureSource) => {
        mainWindow?.webContents.send(YOMU_GAMING_CHANNELS.overlayCaptureCompleted, capture);
        mainWindow?.show();
        mainWindow?.focus();
        hideOverlay();
    });
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
    };
}

async function captureSources(width: number, height: number): Promise<YomuGamingCaptureSource[]> {
    const simulated = simulatedCaptureSource();
    if (simulated) return [simulated];
    const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width, height },
        fetchWindowIcons: false,
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

async function captureSource(sourceId: string, width: number, height: number): Promise<YomuGamingCaptureSource> {
    const source = (await captureSources(width, height)).find(candidate => candidate.id === sourceId);
    if (!source) throw new Error('Capture source is no longer available.');
    return source;
}

async function capturePrimaryScreen(): Promise<YomuGamingCaptureSource> {
    const primaryDisplayId = String(screen.getPrimaryDisplay().id);
    const sources = await captureSources(DEFAULT_CAPTURE_WIDTH, DEFAULT_CAPTURE_HEIGHT);
    const source = sources.find(candidate => candidate.kind === 'screen' && candidate.displayId === primaryDisplayId)
        ?? sources.find(candidate => candidate.kind === 'screen')
        ?? sources[0];
    if (!source) throw new Error('No capture source is available.');
    return source;
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

async function requestOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse> {
    const endpointUrl = request.endpointUrl.trim();
    if (!endpointUrl) return { ok: false, status: 0, body: null, error: 'OCR endpoint URL is empty.' };
    try {
        const url = new URL(endpointUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('OCR endpoint must be HTTP or HTTPS.');
        const base64 = request.imageDataUrl.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                id: `yomu-gaming-${Date.now()}`,
                language_code: request.language || 'ja-JP',
                language: {
                    bcp47_tag: request.language || 'ja-JP',
                    two_letter_code: (request.language || 'ja').slice(0, 2),
                },
                base64_image: base64,
                image: base64,
                image_bytes: base64,
                ocr_engine: request.engine === 'auto' ? '' : request.engine,
                ocr_adapter_name: request.engine === 'auto' ? '' : request.engine,
                detection_only: false,
                context_resolution: { width: request.width, height: request.height },
            }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
        const text = await response.text();
        const body = text ? parseJsonOrText(text) : null;
        return response.ok
            ? { ok: true, status: response.status, body }
            : { ok: false, status: response.status, body, error: `OCR endpoint returned ${response.status}.` };
    } catch (error) {
        return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : 'OCR request failed.' };
    }
}

function parseJsonOrText(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return { text };
    }
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
        else void showOverlay('instant');
    });
    if (hotkeyRegistered) registeredHotkey = hotkey;
}

app.whenReady().then(async () => {
    const iconPath = resolveAppIconPath();
    if (process.platform === 'darwin' && iconPath) app.dock?.setIcon(nativeImage.createFromPath(iconPath));
    registerIpcHandlers();
    await loadCaptureShortcut();
    registerGlobalShortcuts();
    await createMainWindow();
});

app.on('activate', () => {
    if (!mainWindow) void createMainWindow();
});

app.on('before-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
