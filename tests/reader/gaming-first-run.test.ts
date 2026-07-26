// The Yomu Gaming window opens on ONE surface that answers two questions: what this app
// is, and what to press. Regression guard for the first run that said the same thing
// twice in two styles, offered six buttons for three actions, and used the reader's Media
// settings tab (audio sources, text-to-speech, proxy URL) as its landing surface.
//
// The gaming renderer boots itself on import and pulls in the whole reader, so the shell
// is booted once for the file and each test leaves it back on Home.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let appRoot: HTMLElement;

beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/gaming/renderer/app');
    await vi.waitFor(() => {
        expect(document.querySelector('[data-gaming-home] h1')).not.toBeNull();
    });
    appRoot = document.querySelector<HTMLElement>('#app')!;
}, 120_000);

afterEach(() => {
    const back = appRoot.querySelector<HTMLButtonElement>('[data-action="close-settings"]');
    if (shellView() === 'settings' && back) back.click();
});

function shellView(): string {
    return appRoot.querySelector<HTMLElement>('.yomu-gaming-shell')?.dataset.shellView ?? '';
}

function home(): HTMLElement {
    return appRoot.querySelector<HTMLElement>('[data-gaming-home]')!;
}

function settingsForm(): HTMLFormElement {
    return appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]')!;
}

function activePanel(): string {
    return appRoot.querySelector<HTMLElement>('[data-action="settings-panel"][aria-selected="true"]')?.dataset.panel ?? '';
}

function click(scope: HTMLElement, selector: string): void {
    scope.querySelector<HTMLButtonElement>(selector)!.click();
}

describe('Yomu Gaming first run', () => {
    it('lands on one hero with one primary action and the shortcut shown once', () => {
        expect(shellView()).toBe('home');
        expect(home().hidden).toBe(false);
        expect(settingsForm().hidden).toBe(true);

        const headings = appRoot.querySelectorAll('h1');
        expect(headings).toHaveLength(1);
        expect(headings[0]?.textContent).toBe('Read Japanese anywhere on your screen');

        const actions = Array.from(home().querySelectorAll<HTMLButtonElement>('button[data-action]'));
        expect(actions.map(button => button.dataset.action)).toEqual(['instant-capture', 'area-capture', 'open-settings']);
        expect(actions.filter(button => button.classList.contains('add'))).toHaveLength(1);
        expect(appRoot.querySelectorAll('[data-hotkey]')).toHaveLength(1);
        expect(home().querySelector('[data-hotkey]')?.textContent).toBe('Ctrl+Shift+Y');
    });

    it('says what it does without leaking mechanism or narrowing to games', () => {
        const copy = home().textContent ?? '';
        expect(copy).toContain('Read Japanese anywhere on your screen');
        expect(copy).toContain('Read my screen');
        expect(copy).not.toMatch(/OCR|Google Lens|proxy/i);
        expect(copy).not.toMatch(/game text|in games/i);
    });

    it('offers a fix on the hero when the shortcut is unavailable', () => {
        // The browser fallback bridge never registers a global shortcut, so the one line
        // the hero adds must be the actionable one.
        const status = home().querySelector<HTMLElement>('[data-gaming-shell-status]')!;
        expect(status.hidden).toBe(false);
        expect(status.textContent).toBe('Pick a different shortcut in Settings to use the keyboard.');
        expect(status.dataset.statusTone).toBe('warning');
    });

    it('opens settings on the capture shortcut, never on the media tab', () => {
        click(home(), '[data-action="open-settings"]');

        expect(shellView()).toBe('settings');
        expect(home().hidden).toBe(true);
        expect(settingsForm().hidden).toBe(false);
        expect(activePanel()).not.toBe('media');
        expect(activePanel()).toBe('shortcuts');
        expect(settingsForm().querySelector('[data-native-capture-shortcut]')).not.toBeNull();
    });

    it('returns home from settings', () => {
        click(home(), '[data-action="open-settings"]');
        click(settingsForm(), '[data-action="close-settings"]');

        expect(shellView()).toBe('home');
        expect(home().hidden).toBe(false);
        expect(settingsForm().hidden).toBe(true);
    });

    it('keeps the settings tab you were on when a snapshot restore re-renders', async () => {
        click(home(), '[data-action="open-settings"]');
        click(settingsForm(), '[data-action="settings-panel"][data-panel="backup"]');
        expect(activePanel()).toBe('backup');

        click(settingsForm(), '[data-action="sync-cloud-settings"]');
        await vi.waitFor(() => {
            expect(localStorage.getItem('yomu-gaming-settings-snapshot-v1')).not.toBeNull();
        });
        click(settingsForm(), '[data-action="restore-cloud-settings"]');
        await vi.waitFor(() => {
            expect(appRoot.querySelector('[data-gaming-shell-status]')?.textContent).toContain('Settings snapshot restored');
        });

        expect(shellView()).toBe('settings');
        expect(activePanel()).toBe('backup');
    });
});
