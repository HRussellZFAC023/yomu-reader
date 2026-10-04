import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import { createPointerEvent } from './helpers/browser-fixtures';
import {
    createSettingsDialog,
    DEFAULT_SETTINGS,
    resetSettingsDialogTestEnvironment,
    settingsElement,
    waitForCondition,
} from './helpers/settings-dialog-controller-fixture';

// Discord (Leia, 2026-10-01): tweaking settings is save, look, tweak again, so
// Save must not close the dialog. Cancel, Escape and the backdrop still close.
function saveStatus(form: HTMLFormElement): HTMLElement {
    return settingsElement<HTMLElement>(form, '[data-settings-save-status]');
}

async function submitAndSettle(form: HTMLFormElement, saveSettings: { mock: { calls: unknown[][] } }, calls: number): Promise<void> {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForCondition(() => saveSettings.mock.calls.length === calls
        && !settingsElement<HTMLButtonElement>(form, 'button[type="submit"]').disabled);
}

describe('Settings Save keeps the dialog open', () => {
    afterEach(() => { resetSettingsDialogTestEnvironment(); });

    it('stays open and confirms the save in the footer instead of a toast', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });

        await submitAndSettle(form, saveSettings, 1);

        expect(dismiss).not.toHaveBeenCalled();
        expect(form.isConnected).toBe(true);
        expect(saveStatus(form).hidden).toBe(false);
        expect(saveStatus(form).textContent).toBe('Settings saved.');
        expect(dependencies.toast).not.toHaveBeenCalledWith('Settings saved.');
        expect(dependencies.clearSettingsPreview).not.toHaveBeenCalled();
        expect(settingsElement<HTMLButtonElement>(form, 'button[type="submit"]').getAttribute('aria-label')).toBe('Save');
    });

    it('says so in Japanese', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'ja' };
        const { form } = createSettingsDialog({
            saveSettings,
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
        });

        await submitAndSettle(form, saveSettings, 1);

        expect(saveStatus(form).textContent).toBe('設定を保存しました。');
    });

    it('clears the confirmation on the next edit but not on a settings search', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({ saveSettings });
        await submitAndSettle(form, saveSettings, 1);

        const search = settingsElement<HTMLInputElement>(form, '[data-settings-search]');
        search.value = 'theme';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(saveStatus(form).textContent).toBe('Settings saved.');

        const accent = settingsElement<HTMLInputElement>(form, 'input[name="accentColor"]');
        accent.value = '#123456';
        accent.dispatchEvent(new Event('change', { bubbles: true }));
        expect(saveStatus(form).hidden).toBe(true);
        expect(saveStatus(form).textContent).toBe('');
    });

    it('makes the saved settings the baseline for the next Save and for Cancel', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });
        const accent = settingsElement<HTMLInputElement>(form, 'input[name="accentColor"]');
        accent.value = '#123456';
        await submitAndSettle(form, saveSettings, 1);
        expect(dependencies.beginSettingsPreview).toHaveBeenLastCalledWith('#123456', expect.anything(), expect.anything());

        const furigana = settingsElement<HTMLInputElement>(form, 'input[name="stickyBottomSheet"]');
        furigana.checked = !furigana.checked;
        await submitAndSettle(form, saveSettings, 2);
        const secondIntent = saveSettings.mock.calls[1]![1] as { explicitUserChoiceKeys: string[] };
        expect(secondIntent.explicitUserChoiceKeys).toContain('stickyBottomSheet');
        expect(secondIntent.explicitUserChoiceKeys).not.toContain('accentColor');

        settingsElement<HTMLButtonElement>(form, '[data-action="cancel"]').click();
        expect(dismiss).toHaveBeenCalledOnce();
    });

    it('leaves no interface-language preview for Cancel to undo once it is saved', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });
        const language = settingsElement<HTMLSelectElement>(form, 'select[name="interfaceLanguage"]');
        language.value = 'ja';
        language.dispatchEvent(new Event('change', { bubbles: true }));
        await submitAndSettle(form, saveSettings, 1);
        const reinstalls = dependencies.installFab.mock.calls.length;

        settingsElement<HTMLButtonElement>(form, '[data-action="cancel"]').click();

        expect(dismiss).toHaveBeenCalledOnce();
        expect(dependencies.installFab).toHaveBeenCalledTimes(reinstalls);
    });

    it('gives focus back to Save only when the page took it during the save', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({ saveSettings });
        const save = settingsElement<HTMLButtonElement>(form, 'button[type="submit"]');
        save.focus();
        (document.activeElement as HTMLElement | null)?.blur();
        expect(document.activeElement).toBe(document.body);
        await submitAndSettle(form, saveSettings, 1);
        expect(document.activeElement).toBe(save);

        const accent = settingsElement<HTMLInputElement>(form, 'input[name="accentColor"]');
        accent.focus();
        await submitAndSettle(form, saveSettings, 2);
        expect(document.activeElement).toBe(accent);
    });

    // Popup order's own help says "reorder it with the arrows or by dragging,
    // then press Save": none of those fire input or change, and Cancel would
    // silently drop the move while the footer still said "Settings saved."
    it.each([
        ['a Popup order arrow', '[data-definition-source-editor] [data-action="dictionary-source-down"]'],
        ['a lookup link arrow', '[data-action="lookup-link-down"]'],
        ['adding an audio source', '[data-action="audio-source-add"]'],
        ['the theme switch', '[data-theme-switch]'],
    ])('clears the confirmation after %s', async (_label, selector) => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({ saveSettings });
        await submitAndSettle(form, saveSettings, 1);
        expect(saveStatus(form).textContent).toBe('Settings saved.');

        settingsElement<HTMLButtonElement>(form, selector).click();

        expect(saveStatus(form).hidden).toBe(true);
        expect(saveStatus(form).textContent).toBe('');
    });

    it('clears the confirmation after a drag in the Popup order', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({ saveSettings });
        await submitAndSettle(form, saveSettings, 1);
        const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-definition-source-editor] [data-source-row]'));
        rows.forEach((row, index) => {
            row.getBoundingClientRect = () => new DOMRect(0, index * 48, 300, 40);
        });
        const order = () => Array.from(
            form.querySelectorAll<HTMLElement>('[data-definition-source-editor] [data-source-row]'),
            row => row.dataset.sourceId,
        );
        const before = order();

        rows[0]!.querySelector('[data-source-drag-handle]')!.dispatchEvent(createPointerEvent('pointerdown', { clientY: 4 }));
        form.dispatchEvent(createPointerEvent('pointermove', { clientY: 100 }));
        form.dispatchEvent(createPointerEvent('pointerup', { clientY: 100 }));

        expect(order()).not.toEqual(before);
        expect(saveStatus(form).hidden).toBe(true);
    });

    it('keeps the confirmation when the learner only switches tabs', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({ saveSettings });
        await submitAndSettle(form, saveSettings, 1);

        settingsElement<HTMLButtonElement>(form, '[data-action="settings-panel"][data-panel="dictionaries"]').click();

        expect(saveStatus(form).textContent).toBe('Settings saved.');
    });

    it('does not confirm a save the form changed under while it ran', async () => {
        let finishSave!: () => void;
        const saveSettings = vi.fn()
            .mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }))
            .mockResolvedValue(undefined);
        const { form } = createSettingsDialog({ saveSettings });
        const save = settingsElement<HTMLButtonElement>(form, 'button[type="submit"]');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        const sticky = settingsElement<HTMLInputElement>(form, 'input[name="stickyBottomSheet"]');
        sticky.checked = !sticky.checked;
        sticky.dispatchEvent(new Event('change', { bubbles: true }));
        finishSave();
        await waitForCondition(() => !save.disabled);

        expect(saveStatus(form).hidden).toBe(true);

        await submitAndSettle(form, saveSettings, 2);
        expect(saveStatus(form).textContent).toBe('Settings saved.');
    });

    it('drops an earlier confirmation when a later Save fails', async () => {
        const saveSettings = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('disk full'));
        const { form } = createSettingsDialog({ saveSettings });
        await submitAndSettle(form, saveSettings, 1);
        expect(saveStatus(form).textContent).toBe('Settings saved.');

        await submitAndSettle(form, saveSettings, 2);

        expect(saveStatus(form).hidden).toBe(true);
        expect(saveStatus(form).textContent).toBe('');
    });

    it('keeps the dialog open without a confirmation when the save fails', async () => {
        const saveSettings = vi.fn().mockRejectedValue(new Error('disk full'));
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });

        await submitAndSettle(form, saveSettings, 1);

        expect(dismiss).not.toHaveBeenCalled();
        expect(saveStatus(form).hidden).toBe(true);
        expect(dependencies.toast).toHaveBeenCalledWith(expect.stringContaining('Settings save failed'));
    });
});
