// Settings is the only ordinary desktop window. Native shortcuts and overlay requests share it.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { YomuGamingBridge, YomuGamingEnvironment } from '../../src/gaming/ipc';

const SETTINGS_KEY = 'yomu-gaming-reader-settings-v1';

let appRoot: HTMLElement;
let currentEnvironment: YomuGamingEnvironment = registeredEnvironment('CommandOrControl+Shift+Y');
let installOverlayEscapeHandler: typeof import('../../src/gaming/renderer/app').installOverlayEscapeHandler;
let createGamingReaderSettingsSurface: typeof import('../../src/gaming/renderer/app').createGamingReaderSettingsSurface;
// When set, the next shortcut save answers with this environment instead of registering.
let nextSaveEnvironment: YomuGamingEnvironment | null = null;

function registeredEnvironment(hotkey: string): YomuGamingEnvironment {
    return {
        platform: 'win32',
        displayServer: 'windows',
        desktop: 'windows',
        isSteamDeckSession: false,
        isPackaged: true,
        displayCount: 1,
        hotkey,
        hotkeyRegistered: true,
        trayActive: true,
        screenAccess: 'granted',
    };
}

function testBridge(): YomuGamingBridge {
    return {
        getEnvironment: async () => currentEnvironment,
        getFrozenCapture: async () => {
            throw new Error('capture unavailable in tests');
        },
        recaptureFrozenFrame: async () => {
            throw new Error('capture unavailable in tests');
        },
        openScreenSettings: async () => undefined,
        requestOcr: async () => ({ ok: false, status: 0, body: null, error: 'ocr unavailable in tests' }),
        showOverlay: async () => undefined,
        hideOverlay: async () => undefined,
        showApp: async () => undefined,
        hideApp: async () => undefined,
        openExternal: async () => undefined,
        updateCaptureShortcut: async (shortcut: string) => {
            currentEnvironment = nextSaveEnvironment ?? registeredEnvironment(shortcut);
            nextSaveEnvironment = null;
            return currentEnvironment;
        },
    };
}

function settingsSurfaceFixture(
    showApp: YomuGamingBridge['showApp'] = vi.fn(async () => undefined),
) {
    const hideOverlay = vi.fn(async () => undefined);
    return {
        showApp,
        hideOverlay,
        surface: createGamingReaderSettingsSurface({ showApp, hideOverlay }),
    };
}

beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.yomuGaming = testBridge();
    ({
        installOverlayEscapeHandler,
        createGamingReaderSettingsSurface,
    } = await import('../../src/gaming/renderer/app'));
    await vi.waitFor(() => {
        expect(document.querySelector('[data-yomu-gaming-settings]')).not.toBeNull();
    });
    appRoot = document.querySelector<HTMLElement>('#app')!;
}, 120_000);

function shellView(): string {
    return appRoot.querySelector<HTMLElement>('.yomu-gaming-shell')?.dataset.shellView ?? '';
}

function settingsForm(): HTMLFormElement {
    return appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]')!;
}

function homeStatus(): HTMLElement {
    return settingsForm().querySelector<HTMLElement>('[data-gaming-shell-status]')!;
}

function activePanel(): string {
    return appRoot.querySelector<HTMLElement>('[data-action="settings-panel"][aria-selected="true"]')?.dataset.panel ?? '';
}

function click(scope: HTMLElement, selector: string): void {
    scope.querySelector<HTMLButtonElement>(selector)!.click();
}

// The real path a user takes: open Settings, put a shortcut in the capture field, wait
// for the app to finish answering.
async function saveShortcut(value: string): Promise<void> {
    const input = settingsForm().querySelector<HTMLInputElement>('[data-native-capture-shortcut] [data-capture-shortcut-input]')!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
        expect(input.disabled).toBe(false);
        expect(homeStatus().textContent ?? '').not.toContain('Saving');
    });
}

describe('Desktop settings without a home screen', () => {
    it('opens only settings and never requires a target choice', () => {
        expect(document.querySelector('[data-gaming-home]')).toBeNull();
        expect(settingsForm().querySelector('select[name="targetLanguage"]')).toBeNull();
        expect(shellView()).toBe('settings');
    });

    it('keeps a Reader shortcut recorded on the Shortcuts tab', async () => {
        const scanPage = settingsForm().querySelector<HTMLInputElement>('[data-shortcut-input][name="shortcuts.scanPage"]')!;
        const key = scanPage.value === 'Alt+K' ? 'L' : 'K';

        scanPage.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));

        await vi.waitFor(() => {
            expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').shortcuts?.scanPage).toBe(`Alt+${key}`);
        });
    });

    it('routes the inline Reader settings surface to the native settings window', async () => {
        const { showApp, hideOverlay, surface } = settingsSurfaceFixture();

        const opening = surface.open('appearance');
        expect(surface.open('api')).toBe(opening);
        window.dispatchEvent(new Event('focus'));
        await opening;

        await vi.waitFor(() => expect(shellView()).toBe('settings'));
        expect(activePanel()).toBe('appearance');
        expect(showApp).toHaveBeenCalledOnce();
        expect(hideOverlay).toHaveBeenCalledOnce();
    });

    it('does not hide the overlay when the native settings request cannot be retained', async () => {
        const { showApp, hideOverlay, surface } = settingsSurfaceFixture();
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage locked');
        });

        try {
            await expect(surface.open()).rejects.toThrow('Could not request よむ Desktop Settings.');
            expect(showApp).not.toHaveBeenCalled();
            expect(hideOverlay).not.toHaveBeenCalled();
        } finally {
            setItem.mockRestore();
        }
    });

    it('withdraws a retained settings request when the native window cannot open', async () => {
        const showApp = vi.fn(async () => { throw new Error('window unavailable'); });
        const { hideOverlay, surface } = settingsSurfaceFixture(showApp);

        await expect(surface.open('api')).rejects.toThrow('window unavailable');

        expect(localStorage.getItem('yomu-gaming-pending-view-v1')).toBeNull();
        expect(hideOverlay).not.toHaveBeenCalled();
    });

    it('uses one Escape for the reader popover and the next for the overlay', () => {
        const hideOverlay = vi.fn(async () => undefined);
        const dispose = installOverlayEscapeHandler(hideOverlay);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const dismissReaderPopover = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') popover.remove();
        };
        document.addEventListener('keydown', dismissReaderPopover);

        try {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(popover.isConnected).toBe(false);
            expect(hideOverlay).not.toHaveBeenCalled();

            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(hideOverlay).toHaveBeenCalledTimes(1);
        } finally {
            document.removeEventListener('keydown', dismissReaderPopover);
            popover.remove();
            dispose();
        }
    });

    it('offers portable export and import instead of duplicate local snapshots', () => {
        click(settingsForm(), '[data-action="settings-panel"][data-panel="backup"]');
        expect(settingsForm().querySelector('[data-native-settings-sync]')).toBeNull();
        expect(settingsForm().querySelector<HTMLButtonElement>('[data-action="export-reader-settings"]')?.hidden).toBe(false);
        expect(settingsForm().querySelector<HTMLButtonElement>('[data-action="import-reader-settings"]')?.hidden).toBe(false);
    });

    it('reports a new shortcut once the keyboard has it', async () => {
        await saveShortcut('Ctrl+Shift+K');

        expect(homeStatus().textContent).toBe('Capture shortcut saved: Ctrl+Shift+K.');
        expect(homeStatus().dataset.statusTone).toBe('success');
        expect(settingsForm().querySelector<HTMLInputElement>('[data-capture-shortcut-input]')?.value).toBe('Ctrl+Shift+K');
    });

    it('leads its title row with the title and leaves the way out to the window close', () => {
        const head = settingsForm().querySelector<HTMLElement>('.jpdb-reader-settings-head')!;
        const visible = Array.from(head.children).filter(child => !child.classList.contains('jpdb-reader-settings-drag-handle'));
        expect(visible.map(child => child.tagName === 'H2' ? 'title' : child.hasAttribute('data-settings-close') ? 'shared-close' : (child as HTMLElement).className))
            .toEqual(['title', 'shared-close', 'yomu-gaming-shell-status']);
        // No second, desktop-only Close beside the native window close.
        expect(head.querySelector('[data-action="close-settings"]')).toBeNull();
        expect(readFileSync('src/gaming/renderer/styles.css', 'utf8')).toMatch(/\.yomu-gaming-settings \.jpdb-reader-settings-close \{\s*display: none !important;/u);
    });

    it('contains settings only, with no intro, capture choice or status prose', () => {
        expect(appRoot.querySelector('[data-gaming-home]')).toBeNull();
        expect(appRoot.querySelector('[data-action="area-capture"]')).toBeNull();
        expect(appRoot.querySelector('[data-gaming-session-note]')).toBeNull();
        expect(settingsForm().hidden).toBe(false);
    });
});
