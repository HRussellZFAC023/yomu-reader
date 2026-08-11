import { describe, expect, it, vi } from 'vitest';
import { captureShortcutLabel, DEFAULT_CAPTURE_SHORTCUT, normalizeCaptureShortcut } from '../../src/gaming/capture-shortcut';
import {
    applyMainRendererTargetChoice,
    createGamingTray,
    GAMING_OVERLAY_CAPTURE_REQUIRED,
    GAMING_TARGET_CHOICE_REQUIRED,
    GAMING_TARGET_CHOICE_SENDER_REQUIRED,
    gamingTrayMenuTemplate,
    gamingTrayTooltip,
    gamingWindowParkingHint,
    runOverlayCapture,
    runTargetGatedCapture,
    windowCloseIntent,
    type GamingTrayActions,
    type GamingTrayHost,
    type GamingTrayImage,
    type GamingTrayItem,
    type GamingTrayMenuItem,
} from '../../src/gaming/lifecycle';

describe('gaming capture target gate', () => {
    it('routes an unchosen hotkey without sampling the display', async () => {
        const capture = vi.fn(async () => undefined);
        const chooseTarget = vi.fn(async () => undefined);

        await expect(runTargetGatedCapture({ learningTargetChosen: false, capture, chooseTarget }))
            .resolves.toBe('target-required');
        expect(chooseTarget).toHaveBeenCalledOnce();
        expect(capture).not.toHaveBeenCalled();
    });

    it('samples the display only after a positive target choice', async () => {
        const capture = vi.fn(async () => undefined);
        const chooseTarget = vi.fn(async () => undefined);

        await expect(runTargetGatedCapture({ learningTargetChosen: true, capture, chooseTarget }))
            .resolves.toBe('captured');
        expect(capture).toHaveBeenCalledOnce();
        expect(chooseTarget).not.toHaveBeenCalled();
    });

    it('rejects an unchosen direct capture before it can sample the display', async () => {
        const capture = vi.fn(async () => 'frame');

        await expect(runOverlayCapture({
            learningTargetChosen: false,
            senderId: 7,
            overlayRendererId: 7,
            capture,
        })).rejects.toThrow(GAMING_TARGET_CHOICE_REQUIRED);
        expect(capture).not.toHaveBeenCalled();
    });

    it('accepts the main renderer choice and lets the live overlay capture', async () => {
        let learningTargetChosen = false;
        const capture = vi.fn(async () => 'frame');

        applyMainRendererTargetChoice({
            chosen: true,
            senderId: 3,
            mainRendererId: 3,
            apply: chosen => { learningTargetChosen = chosen; },
        });

        await expect(runOverlayCapture({
            learningTargetChosen,
            senderId: 7,
            overlayRendererId: 7,
            capture,
        })).resolves.toBe('frame');
        expect(capture).toHaveBeenCalledOnce();
    });

    it('does not let the overlay grant itself capture access', async () => {
        let learningTargetChosen = false;
        const apply = vi.fn((chosen: boolean) => { learningTargetChosen = chosen; });
        const capture = vi.fn(async () => 'frame');

        expect(() => applyMainRendererTargetChoice({
            chosen: true,
            senderId: 7,
            mainRendererId: 3,
            apply,
        })).toThrow(GAMING_TARGET_CHOICE_SENDER_REQUIRED);
        expect(apply).not.toHaveBeenCalled();
        await expect(runOverlayCapture({
            learningTargetChosen,
            senderId: 7,
            overlayRendererId: 7,
            capture,
        })).rejects.toThrow(GAMING_TARGET_CHOICE_REQUIRED);
        expect(capture).not.toHaveBeenCalled();
    });

    it('rejects target updates when the settings renderer is unavailable', () => {
        const apply = vi.fn();

        expect(() => applyMainRendererTargetChoice({
            chosen: true,
            senderId: 3,
            mainRendererId: null,
            apply,
        })).toThrow(GAMING_TARGET_CHOICE_SENDER_REQUIRED);
        expect(apply).not.toHaveBeenCalled();
    });

    it('rejects capture from the settings renderer and from a missing overlay', async () => {
        const capture = vi.fn(async () => 'frame');
        const request = { learningTargetChosen: true, senderId: 3, capture };

        await expect(runOverlayCapture({ ...request, overlayRendererId: 7 }))
            .rejects.toThrow(GAMING_OVERLAY_CAPTURE_REQUIRED);
        await expect(runOverlayCapture({ ...request, overlayRendererId: null }))
            .rejects.toThrow(GAMING_OVERLAY_CAPTURE_REQUIRED);
        expect(capture).not.toHaveBeenCalled();
    });

    it('preserves a chosen overlay capture failure for the renderer error contract', async () => {
        const failure = new Error('Screen capture failed.');

        await expect(runOverlayCapture({
            learningTargetChosen: true,
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
