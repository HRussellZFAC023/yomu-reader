import { describe, expect, it, vi } from 'vitest';
import { captureShortcutLabel, DEFAULT_CAPTURE_SHORTCUT, normalizeCaptureShortcut } from '../../src/gaming/capture-shortcut';
import {
    createGamingTray,
    GAMING_OVERLAY_CAPTURE_REQUIRED,
    gamingTrayMenuTemplate,
    gamingTrayTooltip,
    gamingWindowParkingHint,
    runOverlayCapture,
    windowCloseIntent,
    type GamingTrayActions,
    type GamingTrayHost,
    type GamingTrayImage,
    type GamingTrayItem,
    type GamingTrayMenuItem,
} from '../../src/gaming/lifecycle';
import { overlayDocumentUrl, singleFlight } from "../../src/gaming/lifecycle";
import { dismissDesktopLookup } from "../../src/gaming/renderer/layer-key-events";
import { allowSyntheticReaderInteractionsForTests, trustedReaderEventHandler } from "../../src/reader/ui/trusted-interaction";
import { LayerShortcuts } from "../../src/gaming/layer-shortcuts";
import { afterEach } from "vitest";
import { removeLegacyGamingReaderSettingsCopy } from "../../src/gaming/renderer/legacy-reader-settings-cleanup";

describe('gaming overlay capture boundary', () => {
    it('lets the live overlay capture with no target choice first', async () => {
        const capture = vi.fn(async () => 'frame');

        await expect(runOverlayCapture({
            senderId: 7,
            overlayRendererId: 7,
            capture,
        })).resolves.toBe('frame');
        expect(capture).toHaveBeenCalledOnce();
    });

    it('rejects capture from the settings renderer and from a missing overlay', async () => {
        const capture = vi.fn(async () => 'frame');
        const request = { senderId: 3, capture };

        await expect(runOverlayCapture({ ...request, overlayRendererId: 7 }))
            .rejects.toThrow(GAMING_OVERLAY_CAPTURE_REQUIRED);
        await expect(runOverlayCapture({ ...request, overlayRendererId: null }))
            .rejects.toThrow(GAMING_OVERLAY_CAPTURE_REQUIRED);
        expect(capture).not.toHaveBeenCalled();
    });

    it('preserves an overlay capture failure for the renderer error contract', async () => {
        const failure = new Error('Screen capture failed.');

        await expect(runOverlayCapture({
            senderId: 7,
            overlayRendererId: 7,
            capture: async () => { throw failure; },
        })).rejects.toBe(failure);
    });
});

function trayActions(): GamingTrayActions & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        readScreen: () => calls.push('readScreen'),
        openSettings: () => calls.push('openSettings'),
        quit: () => calls.push('quit'),
    };
}

function fakeImage(empty = false): GamingTrayImage {
    const image: GamingTrayImage = {
        isEmpty: () => empty,
        resize: () => image,
    };
    return image;
}

function fakeHost(overrides: Partial<GamingTrayHost> = {}) {
    const listeners: string[] = [];
    const state = { tooltip: '', menu: [] as GamingTrayMenuItem[], destroyed: 0 };
    const item: GamingTrayItem = {
        setToolTip: tooltip => { state.tooltip = tooltip; },
        setContextMenu: menu => { state.menu = menu as GamingTrayMenuItem[]; },
        on: event => { listeners.push(event); },
        destroy: () => { state.destroyed += 1; },
    };
    const host: GamingTrayHost = {
        platform: 'win32',
        iconPath: '/icons/yomu.png',
        createImage: () => fakeImage(),
        createTray: () => item,
        buildMenu: template => template,
        ...overrides,
    };
    return { host, item, state, listeners };
}

describe('gaming window close policy', () => {
    it('parks the window instead of destroying it while a tray is live', () => {
        expect(windowCloseIntent({ quitting: false, hasTray: true, platform: 'win32' })).toBe('hide');
        expect(windowCloseIntent({ quitting: false, hasTray: true, platform: 'linux' })).toBe('hide');
    });

    it('keeps the macOS window around even with no tray, so the dock icon still works', () => {
        expect(windowCloseIntent({ quitting: false, hasTray: false, platform: 'darwin' })).toBe('hide');
    });

    // The P1: a hidden overlay suppresses window-all-closed, so a trayless desktop must end
    // the session on close rather than linger with no window, no taskbar entry, and no tray.
    it('ends the session when there is nothing left to reopen from', () => {
        expect(windowCloseIntent({ quitting: false, hasTray: false, platform: 'win32' })).toBe('quit');
        expect(windowCloseIntent({ quitting: false, hasTray: false, platform: 'linux' })).toBe('quit');
    });

    // Hiding on close would otherwise cancel Quit and Cmd+Q outright.
    it('lets windows go once a quit is under way', () => {
        expect(windowCloseIntent({ quitting: true, hasTray: true, platform: 'darwin' })).toBe('close');
        expect(windowCloseIntent({ quitting: true, hasTray: false, platform: 'win32' })).toBe('close');
    });

    it('names where the app waits, and stays quiet when closing ends the session', () => {
        expect(gamingWindowParkingHint({ hasTray: true, platform: 'darwin' }))
            .toBe('Close this window and Yomu waits in the menu bar.');
        expect(gamingWindowParkingHint({ hasTray: true, platform: 'win32' }))
            .toBe('Close this window and Yomu waits in the system tray.');
        expect(gamingWindowParkingHint({ hasTray: false, platform: 'win32' })).toBe('');
    });
});

describe('gaming tray menu', () => {
    it('offers read screen, settings, and quit', () => {
        const actions = trayActions();
        const template = gamingTrayMenuTemplate(actions, { shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: true });
        expect(template.map(entry => entry.label ?? entry.type)).toEqual([
            'Read screen (Ctrl+Shift+Y)',
            'Settings',
            'separator',
            'Quit Yomu Gaming',
        ]);
        for (const entry of template) entry.click?.();
        expect(actions.calls).toEqual(['readScreen', 'openSettings', 'quit']);
    });

    it('drops the shortcut from the label when it is not registered', () => {
        const template = gamingTrayMenuTemplate(trayActions(), { shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: false });
        expect(template[0].label).toBe('Read screen');
        expect(gamingTrayTooltip({ shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: false }))
            .toBe('Yomu Gaming — pick a capture shortcut in Settings');
        expect(gamingTrayTooltip({ shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: true }))
            .toBe('Yomu Gaming — Ctrl+Shift+Y reads the screen');
    });
});

describe('gaming tray controller', () => {
    it('publishes the menu and tooltip, and reopens settings on click', () => {
        const { host, state, listeners } = fakeHost();
        const controller = createGamingTray(host, trayActions(), { shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: true });
        expect(controller).not.toBeNull();
        expect(state.tooltip).toBe('Yomu Gaming — Ctrl+Shift+Y reads the screen');
        expect(state.menu.map(entry => entry.label ?? entry.type)).toContain('Quit Yomu Gaming');
        expect(listeners).toEqual(['click', 'double-click']);
    });

    it('leaves the click to the macOS menu bar', () => {
        const { host, listeners } = fakeHost({ platform: 'darwin' });
        expect(createGamingTray(host, trayActions(), { shortcutLabel: 'Cmd+Shift+Y', shortcutRegistered: true })).not.toBeNull();
        expect(listeners).toEqual([]);
    });

    it('relabels when the capture shortcut changes', () => {
        const { host, state } = fakeHost();
        const controller = createGamingTray(host, trayActions(), { shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: true });
        controller?.refresh({ shortcutLabel: 'Ctrl+Shift+U', shortcutRegistered: true });
        expect(state.menu[0].label).toBe('Read screen (Ctrl+Shift+U)');
        expect(state.tooltip).toBe('Yomu Gaming — Ctrl+Shift+U reads the screen');
    });

    // A null controller is what tells main.ts to keep the quit-on-close fallback, so a
    // desktop with no status area can never become an unreachable process.
    it('reports no tray when the icon is missing', () => {
        const { host } = fakeHost({ createImage: () => fakeImage(true) });
        expect(createGamingTray(host, trayActions(), { shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: true })).toBeNull();
    });

    it('reports no tray when the desktop refuses one', () => {
        const reportError = vi.fn();
        const { host } = fakeHost({
            reportError,
            createTray: () => { throw new Error('no status notifier host'); },
        });
        expect(createGamingTray(host, trayActions(), { shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: true })).toBeNull();
        expect(reportError).toHaveBeenCalledOnce();
    });

    it('tears the tray down on quit', () => {
        const { host, state } = fakeHost();
        createGamingTray(host, trayActions(), { shortcutLabel: 'Ctrl+Shift+Y', shortcutRegistered: true })?.destroy();
        expect(state.destroyed).toBe(1);
    });
});

describe('capture shortcut vocabulary', () => {
    it('labels accelerators per platform', () => {
        expect(captureShortcutLabel('CommandOrControl+Shift+Y', 'darwin')).toBe('Cmd+Shift+Y');
        expect(captureShortcutLabel('CommandOrControl+Shift+Y', 'win32')).toBe('Ctrl+Shift+Y');
        expect(captureShortcutLabel('Control+Shift+U', 'darwin')).toBe('Ctrl+Shift+U');
        expect(captureShortcutLabel('Super+Alt+F5', 'linux')).toBe('Meta+Alt+F5');
        expect(captureShortcutLabel('', 'win32')).toBe(captureShortcutLabel(DEFAULT_CAPTURE_SHORTCUT, 'win32'));
    });

    it('normalizes and orders user-pressed shortcuts', () => {
        expect(normalizeCaptureShortcut('ctrl+shift+u', 'win32')).toEqual({ ok: true, shortcut: 'Control+Shift+U' });
        expect(normalizeCaptureShortcut('Shift+Alt+cmdorctrl+y', 'win32')).toEqual({ ok: true, shortcut: 'CommandOrControl+Alt+Shift+Y' });
        expect(normalizeCaptureShortcut('Meta+Y', 'darwin')).toEqual({ ok: true, shortcut: 'Command+Y' });
        expect(normalizeCaptureShortcut('Meta+Y', 'linux')).toEqual({ ok: true, shortcut: 'Super+Y' });
    });

    it('rejects shortcuts that cannot be registered', () => {
        expect(normalizeCaptureShortcut('Y', 'win32').ok).toBe(false);
        expect(normalizeCaptureShortcut('Ctrl+Shift', 'win32').ok).toBe(false);
        expect(normalizeCaptureShortcut(7, 'win32').ok).toBe(false);
    });
});

describe("gaming capture press", () => {
    function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
        });
        return { promise, resolve, reject };
    }

    describe('gaming capture shortcut presses', () => {
        it('joins a press made while a capture is still running instead of starting a second one', async () => {
            const pending = deferred();
            const capture = vi.fn(() => pending.promise);
            const press = singleFlight(capture);

            const first = press();
            const second = press();
            expect(capture).toHaveBeenCalledOnce();
            expect(second).toBe(first);

            pending.resolve();
            await first;
        });

        it('takes a fresh capture on the next press once the previous one finished', async () => {
            const capture = vi.fn(async () => undefined);
            const press = singleFlight(capture);

            await press();
            await press();

            expect(capture).toHaveBeenCalledTimes(2);
        });

        it('lets the next press capture again after a failed capture', async () => {
            const failing = deferred();
            const capture = vi.fn()
                .mockImplementationOnce(() => failing.promise)
                .mockImplementationOnce(async () => undefined);
            const press = singleFlight(capture);

            const first = press();
            failing.reject(new Error('No capture source is available.'));
            await expect(first).rejects.toThrow('No capture source');
            await press();

            expect(capture).toHaveBeenCalledTimes(2);
        });
    });

    describe('gaming overlay documents', () => {
        const renderer = new URL('file:///Applications/Yomu%20Gaming.app/Contents/Resources/app.asar/renderer/index.html');

        // Loading the URL a window already shows is a same-document fragment navigation, which
        // kept the first capture's document — and its frame and words — on every later press.
        it('gives every capture of the same mode a URL that loads a new document', () => {
            const first = new URL(overlayDocumentUrl(renderer, 1));
            const second = new URL(overlayDocumentUrl(renderer, 2));

            expect(second.toString()).not.toBe(first.toString());
            expect(second.search).not.toBe(first.search);
            expect(second.pathname).toBe(first.pathname);
        });

        it('keeps the capture mode where the renderer reads it', () => {
            const area = new URL(overlayDocumentUrl(renderer, 3));
            expect(area.searchParams.get('captureMode')).toBe('instant');
            expect(area.hash).toBe('#overlay-instant');
            expect(new URL(overlayDocumentUrl(renderer, 4)).hash).toBe('#overlay-instant');
        });

        it('keeps a development server URL and its own query', () => {
            const dev = new URL('http://127.0.0.1:5187/?debug=1');
            const url = new URL(overlayDocumentUrl(dev, 5));
            expect(url.origin).toBe('http://127.0.0.1:5187');
            expect(url.searchParams.get('debug')).toBe('1');
            expect(dev.toString()).toBe('http://127.0.0.1:5187/?debug=1');
        });
    });
});

describe('native keys belong only to a visible desktop lookup', () => {
    it('releases Escape and grade keys when hidden and never unregisters a key another app owns', () => {
        const callbacks = new Map<string, () => void>();
        const host = { register: vi.fn((key: string, callback: () => void) => {
            if (key === '2') return false;
            callbacks.set(key, callback); return true;
        }), unregister: vi.fn() };
        const pressed = vi.fn(), shortcuts = new LayerShortcuts(host, pressed);
        expect(shortcuts.update(true, ['1', '2'])).toEqual(['Escape', '1']);
        callbacks.get('Escape')!();
        expect(pressed).toHaveBeenCalledWith('Escape');
        shortcuts.update(true, []);
        expect(host.unregister).toHaveBeenCalledWith('1');
        expect(host.unregister).not.toHaveBeenCalledWith('2');
        shortcuts.clear();
        expect(host.unregister).toHaveBeenCalledWith('Escape');
    });
    it('does not capture keys while hidden even when stale renderer state arrives', () => {
        const host = { register: vi.fn(() => true), unregister: vi.fn() };
        const shortcuts = new LayerShortcuts(host, () => {});
        expect(shortcuts.update(false, ['1', '2'])).toEqual([]);
        expect(host.register).not.toHaveBeenCalled();
    });



    it('preserves native Escape authority across IPC without enabling arbitrary synthetic events', () => {
        allowSyntheticReaderInteractionsForTests(false);
        const popup = document.createElement('div'); popup.className = 'jpdb-reader-popover'; document.body.append(popup);
        const dismiss = vi.fn(() => popup.remove());
        const listener = trustedReaderEventHandler((event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); });
        const hide = vi.fn(async () => {});
        document.addEventListener('keydown', listener);
        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(dismiss).not.toHaveBeenCalled();
            dismissDesktopLookup(document, hide);
            expect(dismiss).toHaveBeenCalledOnce();
            expect(hide).not.toHaveBeenCalled();
            dismissDesktopLookup(document, hide);
            expect(hide).toHaveBeenCalledOnce();
        } finally {
            document.removeEventListener('keydown', listener); popup.remove();
            allowSyntheticReaderInteractionsForTests(true);
        }
    });
});

describe('Gaming legacy Reader settings cleanup', () => {
    const LEGACY_READER_SETTINGS_COPY_KEY = 'jpdb-popup-reader-settings';
    const GAMING_SETTINGS_KEY = 'yomu-gaming-reader-settings-v1';


    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('removes only the obsolete Reader copy from a packaged file renderer', () => {
        const values = new Map<string, string>([
            [LEGACY_READER_SETTINGS_COPY_KEY, JSON.stringify({ apiKey: 'stale-secret' })],
            [GAMING_SETTINGS_KEY, JSON.stringify({ learningTargetChosen: true, apiKey: 'current-secret' })],
        ]);
        vi.stubGlobal('location', { protocol: 'file:' });
        vi.stubGlobal('localStorage', { removeItem: (key: string) => values.delete(key) });

        removeLegacyGamingReaderSettingsCopy();

        expect(values.has(LEGACY_READER_SETTINGS_COPY_KEY)).toBe(false);
        expect(JSON.parse(values.get(GAMING_SETTINGS_KEY) ?? '{}')).toMatchObject({
            learningTargetChosen: true,
            apiKey: 'current-secret',
        });
    });

    it('does not delete the Reader key from the HTTP development renderer', () => {
        const removeItem = vi.fn();
        vi.stubGlobal('location', { protocol: 'http:' });
        vi.stubGlobal('localStorage', { removeItem });

        removeLegacyGamingReaderSettingsCopy();

        expect(removeItem).not.toHaveBeenCalled();
    });

    it('leaves launch available when file storage is locked', () => {
        vi.stubGlobal('location', { protocol: 'file:' });
        vi.stubGlobal('localStorage', {
            removeItem: () => { throw new Error('storage locked'); },
        });

        expect(() => removeLegacyGamingReaderSettingsCopy()).not.toThrow();
    });
});
