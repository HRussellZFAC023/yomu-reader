import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YOMU_GAMING_CHANNELS as channels, type YomuGamingSelectedText, type YomuGamingShortcutUpdate } from '../../src/gaming/ipc';
import { desktopSettingsExport, importGamingSettingsBackup } from '../../src/gaming/renderer/settings-import';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

interface Frame { url: string; parent: Frame | null }
interface Sender { id: number; getURL(): string; mainFrame: Frame }
interface WindowFixture { webContents: Sender; url: string; visible: boolean; destroyed: boolean; focus: ReturnType<typeof vi.fn>; destroy(): void }
type Handler = (event: { sender: Sender; senderFrame?: Frame | null }, argument?: unknown) => unknown;
const native = vi.hoisted(() => {
    const barrier: { value: Promise<void> | null } = { value: null };
    const writes: string[] = [];
    const trayMenus: unknown[] = [];
    return {
    windows: [] as WindowFixture[], handlers: new Map<string, Handler>(), shortcuts: new Map<string, () => Promise<void>>(),
    events: new Map<string, () => void>(), read: vi.fn<[], Promise<YomuGamingSelectedText>>(),
    clipboard: vi.fn(() => { throw new Error('No clipboard access allowed'); }),
    screenshot: vi.fn(() => { throw new Error('No screenshot allowed'); }),
    registrationAllowed: true, profile: '', blockedKeys: new Set<string>(), throwingKeys: new Set<string>(), barrier, writes, trayMenus,
    };
});

vi.mock('electron', () => {
    class FakeWindow {
        static getAllWindows() { return native.windows; }
        readonly webContents = { id: native.windows.length + 1, getURL: () => this.url,
            mainFrame: { url: '', parent: null },
            setWindowOpenHandler: vi.fn(), on: vi.fn(), send: vi.fn() };
        readonly focus = vi.fn();
        url = '';
        visible = false;
        destroyed = false;
        private events = new Map<string, () => void>();
        constructor() { native.windows.push(this); }
        on(event: string, handler: () => void) { this.events.set(event, handler); }
        async loadURL(url: string) { this.url = url; this.webContents.mainFrame.url = url; }
        isDestroyed() { return this.destroyed; }
        isVisible() { return this.visible; }
        isMinimized() { return false; }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        destroy() { this.destroyed = true; this.events.get('closed')?.(); }
    }
    const image = { isEmpty: () => false, resize: () => image };
    class FakeTray { setToolTip() {} setContextMenu(menu: unknown) { native.trayMenus.push(menu); } on() {} destroy() {} }
    const display = { id: 1, workArea: { x: 0, y: 0, width: 1200, height: 900 }, bounds: { x: 0, y: 0, width: 1200, height: 900 } };
    return {
        app: { setName: vi.fn(), setPath: vi.fn(), getPath: () => native.profile, isPackaged: true, requestSingleInstanceLock: () => true,
            setAppUserModelId: vi.fn(), whenReady: () => Promise.resolve(), on: (event: string, handler: () => void) => native.events.set(event, handler), quit: vi.fn() },
        BrowserWindow: FakeWindow, clipboard: { readText: native.clipboard, writeText: native.clipboard },
        desktopCapturer: { getSources: native.screenshot },
        globalShortcut: {
            register(key: string, handler: () => Promise<void>) {
                if (native.throwingKeys.has(key)) throw new Error('Platform rejected this accelerator');
                if (!native.registrationAllowed || native.blockedKeys.has(key)) return false;
                native.shortcuts.set(key, handler); return true;
            },
            unregister(key: string) { native.shortcuts.delete(key); }, unregisterAll() { native.shortcuts.clear(); },
        },
        ipcMain: { handle: (name: string, handler: Handler) => native.handlers.set(name, handler) },
        nativeImage: { createFromPath: () => image }, Tray: FakeTray, Menu: { buildFromTemplate: (template: unknown) => template },
        screen: { getDisplayNearestPoint: () => display, getCursorScreenPoint: () => ({ x: 0, y: 0 }), getPrimaryDisplay: () => display, getAllDisplays: () => [display] },
        dialog: { showErrorBox: vi.fn() }, shell: { openExternal: vi.fn() }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
    };
});
vi.mock('../../src/gaming/selected-text', async original => ({
    ...await original<typeof import('../../src/gaming/selected-text')>(), readSelectedText: native.read,
}));
vi.mock('../../src/gaming/settings-file', async original => {
    const actual = await original<typeof import('../../src/gaming/settings-file')>();
    return { settingsFileWriter: () => {
        const write = actual.settingsFileWriter();
        return async (file: string, text: string) => { native.writes.push(text); await native.barrier.value; return write(file, text); };
    } };
});

beforeEach(async () => {
    vi.resetModules();
    native.profile = mkdtempSync(path.join(tmpdir(), 'yomu-selected-text-main-'));
    native.windows.length = 0; native.handlers.clear(); native.shortcuts.clear(); native.events.clear();
    native.registrationAllowed = true;
    native.blockedKeys.clear(); native.throwingKeys.clear(); native.writes.length = 0; native.trayMenus.length = 0; native.barrier.value = null;
    native.read.mockReset().mockResolvedValue({ kind: 'text', text: '冒険' });
    native.clipboard.mockClear(); native.screenshot.mockClear();
    vi.stubEnv('YOMU_GAMING_USER_DATA_DIR', native.profile);
    vi.stubEnv('YOMU_GAMING_TEST_MODE', '0');
    vi.stubGlobal('__dirname', native.profile);
    await import('../../src/gaming/main');
    await vi.waitFor(() => expect(native.windows).toHaveLength(1));
});
afterEach(() => {
    native.events.get('before-quit')?.();
    if (!path.resolve(native.profile).startsWith(path.join(tmpdir(), 'yomu-selected-text-main-'))) throw new Error('Unexpected fixture cleanup path');
    rmSync(native.profile, { recursive: true, force: true });
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

async function invoke(channel: typeof channels.updateDesktopShortcuts, argument?: unknown, sender?: Sender, frame?: Frame | null): Promise<YomuGamingShortcutUpdate>;
async function invoke(channel: string, argument?: unknown, sender?: Sender, frame?: Frame | null): Promise<unknown>;
async function invoke(channel: string, argument?: unknown, sender: Sender = native.windows[0].webContents, frame: Frame | null = sender.mainFrame): Promise<unknown> {
    const handler = native.handlers.get(channel);
    if (!handler) throw new Error(`Missing IPC handler ${channel}`);
    return handler({ sender, senderFrame: frame }, argument);
}
const environment = () => invoke(channels.getEnvironment);
async function restartMain(): Promise<void> {
    native.events.get('before-quit')?.();
    native.windows.length = 0; native.shortcuts.clear(); native.handlers.clear();
    vi.resetModules();
    await import('../../src/gaming/main');
    await vi.waitFor(() => expect(native.windows).toHaveLength(1));
}

describe('main-process selection ingress (native API fixture, real IPC handlers)', () => {
    it('rolls back native registration and preferences when persistence fails', async () => {
        const previousMenu = JSON.stringify(native.trayMenus.at(-1));
        mkdirSync(path.join(native.profile, 'capture-shortcut-v1.json.saving'));
        await expect(invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' })).rejects.toThrow();
        const observed = { environment: await environment(), registered: [...native.shortcuts.keys()] };
        mkdirSync('artifacts', { recursive: true });
        writeFileSync('artifacts/selected-text-save-failure-reproduction.json', JSON.stringify(observed, null, 2));
        expect(observed.environment).toMatchObject({ textLookupShortcut: { enabled: false, registered: false } });
        expect(observed.registered).toEqual(['CommandOrControl+Shift+Y']);
        expect(JSON.stringify(native.trayMenus.at(-1))).toEqual(previousMenu);
    });

    it('imports a valid capture/text shortcut pair without the old capture key blocking the new text key', async () => {
        const imported = await importGamingSettingsBackup(desktopSettingsExport(DEFAULT_SETTINGS, 'Ctrl+Alt+K',
            { enabled: true, shortcut: 'Ctrl+Shift+Y', language: 'en' }), DEFAULT_SETTINGS, 'win32', {
            updateDesktopShortcuts: shortcuts => invoke(channels.updateDesktopShortcuts, shortcuts),
        });
        expect(imported.kind).toBe('imported');
        const observed = { environment: await environment(), registered: [...native.shortcuts.keys()] };
        mkdirSync('artifacts', { recursive: true });
        writeFileSync('artifacts/selected-text-pair-import-reproduction.json', JSON.stringify(observed, null, 2));
        expect(observed.environment).toMatchObject({ hotkey: 'Control+Alt+K', textLookupShortcut: { enabled: true, shortcut: 'Control+Shift+Y', registered: true } });
    });

    it('swaps both existing keys in one committed native pair', async () => {
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' });
        const result = await invoke(channels.updateDesktopShortcuts, { captureShortcut: 'Ctrl+Alt+L',
            textLookupShortcut: { enabled: true, shortcut: 'Ctrl+Shift+Y', language: 'ja' } });
        expect(result).toMatchObject({ kind: 'saved', environment: { hotkey: 'Control+Alt+L', textLookupShortcut: { shortcut: 'Control+Shift+Y', registered: true } } });
        expect([...native.shortcuts.keys()].sort()).toEqual(['CommandOrControl+Shift+Y', 'Control+Alt+L']);
        await native.shortcuts.get('CommandOrControl+Shift+Y')?.();
        expect(native.read).toHaveBeenCalledOnce();
        expect(native.screenshot).not.toHaveBeenCalled();
        await restartMain();
        expect(await environment()).toMatchObject({ hotkey: 'Control+Alt+L', textLookupShortcut: { shortcut: 'Control+Shift+Y', language: 'ja', registered: true } });
    });

    it('restores a prior enabled key, committed JSON and tray after a failed pair save', async () => {
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'ja' });
        const file = path.join(native.profile, 'capture-shortcut-v1.json');
        const previousFile = readFileSync(file, 'utf8');
        const previousMenu = JSON.stringify(native.trayMenus.at(-1));
        mkdirSync(`${file}.saving`);
        expect(await invoke(channels.updateDesktopShortcuts, { captureShortcut: 'Ctrl+Alt+K',
            textLookupShortcut: { enabled: false, shortcut: 'Ctrl+Alt+U', language: 'en' } })).toMatchObject({ kind: 'save-failed' });
        expect(await environment()).toMatchObject({ hotkey: 'CommandOrControl+Shift+Y', textLookupShortcut: { enabled: true, registered: true, shortcut: 'Control+Alt+L', language: 'ja' } });
        expect([...native.shortcuts.keys()]).toEqual(['CommandOrControl+Shift+Y', 'Control+Alt+L']);
        expect(readFileSync(file, 'utf8')).toBe(previousFile);
        expect(JSON.stringify(native.trayMenus.at(-1))).toBe(previousMenu);
    });

    it('serializes overlapping editor updates and suppresses an uncommitted candidate callback', async () => {
        let release: () => void = () => undefined;
        native.barrier.value = new Promise(resolve => { release = resolve; });
        const first = invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' });
        await vi.waitFor(() => expect(native.writes).toHaveLength(1));
        const second = invoke(channels.updateCaptureShortcut, 'Ctrl+Alt+K');
        await native.shortcuts.get('Control+Alt+L')?.();
        expect(native.read).not.toHaveBeenCalled();
        expect(native.shortcuts.has('Control+Alt+K')).toBe(false);
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: false } });
        expect(native.shortcuts.has('CommandOrControl+Shift+Y')).toBe(true);
        release();
        await Promise.all([first, second]);
        expect(native.writes).toHaveLength(2);
        expect(await environment()).toMatchObject({ hotkey: 'Control+Alt+K', textLookupShortcut: { enabled: true, shortcut: 'Control+Alt+L', registered: true } });
        expect(JSON.parse(readFileSync(path.join(native.profile, 'capture-shortcut-v1.json'), 'utf8')))
            .toMatchObject({ version: 1, shortcut: 'Control+Alt+K', textLookupShortcut: { enabled: true, shortcut: 'Control+Alt+L' } });
    });

    it('rejects pair collisions and external registration conflicts without persisting either preference', async () => {
        expect(await invoke(channels.updateDesktopShortcuts, { captureShortcut: 'Ctrl+Shift+Y',
            textLookupShortcut: { enabled: true, shortcut: 'CommandOrControl+Shift+Y', language: 'en' } })).toMatchObject({ kind: 'taken' });
        native.blockedKeys.add('Control+Alt+K');
        expect(await invoke(channels.updateDesktopShortcuts, { captureShortcut: 'Ctrl+Alt+U',
            textLookupShortcut: { enabled: true, shortcut: 'Ctrl+Alt+K', language: 'en' } })).toMatchObject({ kind: 'taken' });
        expect(native.writes).toHaveLength(0);
        expect([...native.shortcuts.keys()]).toEqual(['CommandOrControl+Shift+Y']);
        expect(await environment()).toMatchObject({ hotkey: 'CommandOrControl+Shift+Y', textLookupShortcut: { enabled: false } });
        native.blockedKeys.clear();
        native.throwingKeys.add('Control+Alt+K');
        expect(await invoke(channels.updateDesktopShortcuts, { captureShortcut: 'Ctrl+Alt+K' })).toMatchObject({ kind: 'invalid' });
        expect(native.writes).toHaveLength(0);
        expect([...native.shortcuts.keys()]).toEqual(['CommandOrControl+Shift+Y']);
    });

    it('imports old capture-only backups without resetting the current selected-text preference', async () => {
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'ja' });
        const imported = await importGamingSettingsBackup(desktopSettingsExport(DEFAULT_SETTINGS, 'Ctrl+Alt+K'), DEFAULT_SETTINGS, 'win32', {
            updateDesktopShortcuts: shortcuts => invoke(channels.updateDesktopShortcuts, shortcuts),
        });
        expect(imported.kind).toBe('imported');
        expect(await environment()).toMatchObject({ hotkey: 'Control+Alt+K', textLookupShortcut: { enabled: true, shortcut: 'Control+Alt+L', language: 'ja' } });
    });

    it('reads old capture JSON and only uses preview text preferences when the paired field is absent', async () => {
        writeFileSync(path.join(native.profile, 'capture-shortcut-v1.json'), JSON.stringify({ version: 1, shortcut: 'Control+Alt+O' }));
        writeFileSync(path.join(native.profile, 'selected-text-shortcut-v1.json'), JSON.stringify({ enabled: true, shortcut: 'Control+Alt+L', language: 'ja' }));
        await restartMain();
        expect(await environment()).toMatchObject({ hotkey: 'Control+Alt+O', textLookupShortcut: { enabled: true, shortcut: 'Control+Alt+L', language: 'ja' } });
        await invoke(channels.updateTextLookupShortcut, { enabled: false, shortcut: 'Control+Alt+L', language: 'ja' });
        expect(JSON.parse(readFileSync(path.join(native.profile, 'capture-shortcut-v1.json'), 'utf8')).shortcut).toBe('Control+Alt+O');
        await restartMain();
        expect(await environment()).toMatchObject({ hotkey: 'Control+Alt+O', textLookupShortcut: { enabled: false } });
    });

    it('rejects missing and sibling frames even when their WebContents and URL match', async () => {
        const settings = native.windows[0].webContents;
        const child = { url: settings.getURL(), parent: settings.mainFrame };
        await expect(invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' }, settings, child)).rejects.toThrow('Settings window');
        await expect(invoke(channels.updateDesktopShortcuts, { captureShortcut: 'Ctrl+Alt+K' }, settings, null)).rejects.toThrow('Settings window');
        expect(() => native.handlers.get(channels.updateTextLookupShortcut)?.({ sender: settings }, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' })).toThrow('Settings window');
        expect(native.writes).toHaveLength(0);
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' });
        await native.shortcuts.get('Control+Alt+L')?.();
        const lookup = native.windows[1];
        const session = Number(new URL(lookup.url).searchParams.get('textSession'));
        const otherFrame = { url: lookup.url, parent: lookup.webContents.mainFrame };
        expect(await invoke(channels.getSelectedText, session, lookup.webContents, otherFrame)).toEqual({ kind: 'expired' });
        expect(await invoke(channels.getSelectedText, session, lookup.webContents, null)).toEqual({ kind: 'expired' });
        await invoke(channels.closeTextLookup, undefined, lookup.webContents, otherFrame);
        await invoke(channels.retryTextLookup, undefined, lookup.webContents, otherFrame);
        expect(lookup.destroyed).toBe(false);
        expect(await invoke(channels.getSelectedText, session, lookup.webContents)).toEqual({ kind: 'text', text: '冒険' });
    });

    it('leaves the existing OCR registration alone until selection is explicitly enabled', async () => {
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: false, registered: false } });
        expect([...native.shortcuts.keys()]).toEqual(['CommandOrControl+Shift+Y']);
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'ja' });
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: true, registered: true, shortcut: 'Control+Alt+L', language: 'ja' } });
        expect(native.shortcuts.has('CommandOrControl+Shift+Y')).toBe(true);
        expect(JSON.parse(readFileSync(path.join(native.profile, 'capture-shortcut-v1.json'), 'utf8')))
            .toMatchObject({ shortcut: 'CommandOrControl+Shift+Y', textLookupShortcut: { enabled: true, shortcut: 'Control+Alt+L', language: 'ja' } });
        await invoke(channels.updateTextLookupShortcut, { enabled: false, shortcut: 'Ctrl+Alt+L', language: 'ja' });
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: false, registered: false } });
        expect(native.shortcuts.has('Control+Alt+L')).toBe(false);
        // Native preferences live outside ReaderSettings and are reloaded by
        // the main process, independently of browser/managed-surface settings.
        await restartMain();
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: false, registered: false, shortcut: 'Control+Alt+L', language: 'ja' } });
        expect(native.shortcuts.has('CommandOrControl+Shift+Y')).toBe(true);
    });

    it('rejects shortcut conflicts/invalid input and preserves both previous settings and OCR registration', async () => {
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' });
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Shift+Y', language: 'en' });
        expect(await environment()).toMatchObject({ textLookupShortcut: { shortcut: 'Control+Alt+L', registered: true, error: 'taken' } });
        await invoke(channels.updateCaptureShortcut, 'Ctrl+Alt+L');
        expect(await environment()).toMatchObject({ hotkey: 'CommandOrControl+Shift+Y' });
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'L' });
        expect(await environment()).toMatchObject({ textLookupShortcut: { error: 'invalid' } });
        native.registrationAllowed = false;
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+K', language: 'en' });
        expect(await environment()).toMatchObject({ textLookupShortcut: { shortcut: 'Control+Alt+L', error: 'taken' } });
    });

    it('samples before creating/focusing the lookup window and permits only one intended renderer to consume its text', async () => {
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' });
        native.read.mockImplementationOnce(async () => {
            expect(native.windows).toHaveLength(1);
            return { kind: 'text', text: '  冒険\r\n' };
        });
        await native.shortcuts.get('Control+Alt+L')?.();
        expect(native.read).toHaveBeenCalledOnce();
        const lookup = native.windows[1];
        const session = Number(new URL(lookup.url).searchParams.get('textSession'));
        expect(lookup.focus).toHaveBeenCalledOnce();
        expect(await invoke(channels.getSelectedText, session)).toEqual({ kind: 'expired' });
        expect(await invoke(channels.getSelectedText, session + 1, lookup.webContents)).toEqual({ kind: 'expired' });
        expect(await invoke(channels.getSelectedText, session, lookup.webContents)).toEqual({ kind: 'text', text: '  冒険\r\n' });
        expect(await invoke(channels.getSelectedText, session, lookup.webContents)).toEqual({ kind: 'expired' });
        expect(native.clipboard).not.toHaveBeenCalled(); expect(native.screenshot).not.toHaveBeenCalled();
        expect(readFileSync(path.join(native.profile, 'capture-shortcut-v1.json'), 'utf8')).not.toContain('冒険');
        await invoke(channels.closeTextLookup, undefined, lookup.webContents);
        expect(lookup.destroyed).toBe(true);
    });

    it('discards native results when Settings cancels an invocation before it finishes', async () => {
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'en' });
        let finish: (result: YomuGamingSelectedText) => void = () => undefined;
        native.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = native.shortcuts.get('Control+Alt+L')?.();
        await invoke(channels.showApp);
        finish({ kind: 'text', text: 'secret discarded selection' });
        await pending;
        expect(native.windows).toHaveLength(1);
    });
});
