import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialogController } from '../../src/reader/settings-dialog-controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

type SettingsDialogControllerConstructor = new (dependencies: Record<string, unknown>) => SettingsDialogController;

function createSettingsDialog(): { dismiss: ReturnType<typeof vi.fn>; form: HTMLFormElement } {
    let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '' };
    const dismiss = vi.fn();
    const dependencies = {
        getSettings: () => settings,
        setSettings: (next: ReaderSettings) => { settings = next; },
        jpdb: {
            clear: vi.fn(),
            listDecks: vi.fn().mockResolvedValue([]),
        },
        dictionaries: {
            summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
        },
        anki: {},
        audio: { play: vi.fn(), stop: vi.fn() },
        subtitles: { refresh: vi.fn() },
        ocr: { refresh: vi.fn() },
        createBackdrop: () => document.createElement('div'),
        mountDialog: (backdrop: HTMLElement, form: HTMLFormElement) => document.body.append(backdrop, form),
        dismiss,
        toast: vi.fn(),
        applyTheme: vi.fn(),
        applyAccentColor: vi.fn(),
        applyWordColors: vi.fn(),
        installFab: vi.fn(),
        refreshDictionaryStyles: vi.fn().mockResolvedValue(undefined),
        scheduleDictionaryRescan: vi.fn(),
        refreshNewTabIfCurrent: vi.fn(),
        clearDictionarySourceOpenOverrides: vi.fn(),
        resetAllData: vi.fn(),
        beginSettingsPreview: vi.fn(),
        clearSettingsPreview: vi.fn(),
    };
    const controller = new (SettingsDialogController as unknown as SettingsDialogControllerConstructor)(dependencies);

    controller.open();

    return {
        dismiss,
        form: document.querySelector<HTMLFormElement>('.jpdb-reader-settings')!,
    };
}

describe('settings dialog keyboard dismissal', () => {
    afterEach(() => {
        document.body.replaceChildren();
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('closes when Escape is pressed from a settings text field', () => {
        const { dismiss, form } = createSettingsDialog();
        const input = form.querySelector<HTMLInputElement>('input[name="apiKey"]')!;
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

        input.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(dismiss).toHaveBeenCalledOnce();
    });

    it('lets shortcut fields record Escape without closing the dialog', () => {
        const { dismiss, form } = createSettingsDialog();
        const shortcut = form.querySelector<HTMLInputElement>('input[name="shortcuts.closePopup"]')!;
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

        shortcut.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(shortcut.value).toBe('Escape');
        expect(dismiss).not.toHaveBeenCalled();
    });
});
