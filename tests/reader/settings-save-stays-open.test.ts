import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
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

    it('keeps the dialog open without a confirmation when the save fails', async () => {
        const saveSettings = vi.fn().mockRejectedValue(new Error('disk full'));
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });

        await submitAndSettle(form, saveSettings, 1);

        expect(dismiss).not.toHaveBeenCalled();
        expect(saveStatus(form).hidden).toBe(true);
        expect(dependencies.toast).toHaveBeenCalledWith(expect.stringContaining('Settings save failed'));
    });
});
