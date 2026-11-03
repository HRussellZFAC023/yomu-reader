import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YOMU_GAMING_CHANNELS as channels, type YomuGamingSelectedText } from '../../src/gaming/ipc';

interface Sender { id: number; getURL(): string }
interface WindowFixture { webContents: Sender; url: string; visible: boolean; destroyed: boolean; focus: ReturnType<typeof vi.fn>; destroy(): void }
type Handler = (event: { sender: Sender }, argument?: unknown) => unknown;
const native = vi.hoisted(() => ({
    windows: [] as WindowFixture[], handlers: new Map<string, Handler>(), shortcuts: new Map<string, () => Promise<void>>(),
    events: new Map<string, () => void>(), read: vi.fn<[], Promise<YomuGamingSelectedText>>(),
    clipboard: vi.fn(() => { throw new Error('No clipboard access allowed'); }),
    screenshot: vi.fn(() => { throw new Error('No screenshot allowed'); }),
    registrationAllowed: true, profile: '',
}));

vi.mock('electron', () => {
    class FakeWindow {
        static getAllWindows() { return native.windows; }
        readonly webContents = { id: native.windows.length + 1, getURL: () => this.url,
            setWindowOpenHandler: vi.fn(), on: vi.fn(), send: vi.fn() };
        readonly focus = vi.fn();
        url = '';
        visible = false;
        destroyed = false;
        private events = new Map<string, () => void>();
        constructor() { native.windows.push(this); }
        on(event: string, handler: () => void) { this.events.set(event, handler); }
        async loadURL(url: string) { this.url = url; }
        isDestroyed() { return this.destroyed; }
        isVisible() { return this.visible; }
        isMinimized() { return false; }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        destroy() { this.destroyed = true; this.events.get('closed')?.(); }
    }
    const image = { isEmpty: () => false, resize: () => image };
    class FakeTray { setToolTip() {} setContextMenu() {} on() {} destroy() {} }
    const display = { id: 1, workArea: { x: 0, y: 0, width: 1200, height: 900 }, bounds: { x: 0, y: 0, width: 1200, height: 900 } };
    return {
        app: { setName: vi.fn(), setPath: vi.fn(), getPath: () => native.profile, isPackaged: true, requestSingleInstanceLock: () => true,
            setAppUserModelId: vi.fn(), whenReady: () => Promise.resolve(), on: (event: string, handler: () => void) => native.events.set(event, handler), quit: vi.fn() },
        BrowserWindow: FakeWindow, clipboard: { readText: native.clipboard, writeText: native.clipboard },
        desktopCapturer: { getSources: native.screenshot },
        globalShortcut: {
            register(key: string, handler: () => Promise<void>) { if (!native.registrationAllowed) return false; native.shortcuts.set(key, handler); return true; },
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

beforeEach(async () => {
    vi.resetModules();
    native.profile = mkdtempSync(path.join(tmpdir(), 'yomu-selected-text-main-'));
    native.windows.length = 0; native.handlers.clear(); native.shortcuts.clear(); native.events.clear();
    native.registrationAllowed = true;
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

async function invoke(channel: string, argument?: unknown, sender: Sender = native.windows[0].webContents): Promise<unknown> {
    const handler = native.handlers.get(channel);
    if (!handler) throw new Error(`Missing IPC handler ${channel}`);
    return handler({ sender }, argument);
}
const environment = () => invoke(channels.getEnvironment);

describe('main-process selection ingress (native API fixture, real IPC handlers)', () => {
    it('leaves the existing OCR registration alone until selection is explicitly enabled', async () => {
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: false, registered: false } });
        expect([...native.shortcuts.keys()]).toEqual(['CommandOrControl+Shift+Y']);
        await invoke(channels.updateTextLookupShortcut, { enabled: true, shortcut: 'Ctrl+Alt+L', language: 'ja' });
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: true, registered: true, shortcut: 'Control+Alt+L', language: 'ja' } });
        expect(native.shortcuts.has('CommandOrControl+Shift+Y')).toBe(true);
        expect(JSON.parse(readFileSync(path.join(native.profile, 'selected-text-shortcut-v1.json'), 'utf8')))
            .toMatchObject({ enabled: true, shortcut: 'Control+Alt+L', language: 'ja' });
        await invoke(channels.updateTextLookupShortcut, { enabled: false, shortcut: 'Ctrl+Alt+L', language: 'ja' });
        expect(await environment()).toMatchObject({ textLookupShortcut: { enabled: false, registered: false } });
        expect(native.shortcuts.has('Control+Alt+L')).toBe(false);
        // Native preferences live outside ReaderSettings and are reloaded by
        // the main process, independently of browser/managed-surface settings.
        native.events.get('before-quit')?.();
        native.windows.length = 0; native.shortcuts.clear(); native.handlers.clear();
        vi.resetModules();
        await import('../../src/gaming/main');
        await vi.waitFor(() => expect(native.windows).toHaveLength(1));
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
        expect(readFileSync(path.join(native.profile, 'selected-text-shortcut-v1.json'), 'utf8')).not.toContain('冒険');
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
