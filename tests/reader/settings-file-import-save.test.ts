import {
    DEFAULT_SETTINGS, createSettingsDialog, deferred, flushPromises, importSummary,
    resetSettingsDialogTestEnvironment, settingsElement, waitForCondition,
} from './helpers/settings-dialog-controller-fixture';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { ImportSummary } from '../../src/reader/dictionaries/yomitan';

// Exercise the actual click router, not enqueueDictionaryOperation in isolation:
// the outer action used to hold Save even though the inner import did not.
afterEach(resetSettingsDialogTestEnvironment);

async function chooseDictionary(form: HTMLFormElement): Promise<void> {
    const input = settingsElement<HTMLInputElement>(form, 'input[data-file="dictionary"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['zip'], 'words.zip')] });
    settingsElement<HTMLButtonElement>(form, '[data-action="import-yomitan-dictionary"]').click();
    await waitForCondition(() => typeof input.onchange === 'function');
    input.dispatchEvent(new Event('change'));
}

it('lets Save finish during file import, then merges its settings before publishing the dictionary', async () => {
    const imported = deferred<ImportSummary>();
    const saving = deferred<void>();
    const publishingDictionary = deferred<void>();
    let settings: ReaderSettings = { ...DEFAULT_SETTINGS, audioEnabled: true };
    const importFile = vi.fn(() => imported.promise);
    const saveSettings = vi.fn()
        .mockImplementationOnce(() => saving.promise)
        .mockImplementationOnce(() => publishingDictionary.promise);
    const { form } = createSettingsDialog({
        getSettings: () => settings,
        setSettings: (next: ReaderSettings) => { settings = next; },
        saveSettings,
        dictionaries: {
            summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
            importFile,
        },
    });
    await chooseDictionary(form);
    await waitForCondition(() => importFile.mock.calls.length === 1);
    const save = settingsElement<HTMLButtonElement>(form, 'button[type="submit"]');
    expect(save.disabled).toBe(false);
    settingsElement<HTMLInputElement>(form, 'input[name="audioEnabled"]').checked = false;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForCondition(() => saveSettings.mock.calls.length === 1);
    expect(saveSettings.mock.calls[0]?.[0]).toMatchObject({ audioEnabled: false });

    imported.resolve(importSummary('Imported words'));
    await flushPromises();
    expect(saveSettings).toHaveBeenCalledOnce();
    saving.resolve();
    await waitForCondition(() => saveSettings.mock.calls.length === 2);
    expect(saveSettings.mock.calls[1]?.[0]).toMatchObject({
        audioEnabled: false,
        dictionaryPreferences: expect.arrayContaining([expect.objectContaining({ name: 'Imported words' })]),
    });
    expect(save.disabled).toBe(true);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(saveSettings).toHaveBeenCalledTimes(2);
    publishingDictionary.resolve();
    await waitForCondition(() => !save.disabled);
    expect(settings.audioEnabled).toBe(false);
});

it('keeps an open dictionary picker inside the restore barrier and cancels its stale selection', async () => {
    const importFile = vi.fn();
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const { form } = createSettingsDialog({ saveSettings, dictionaries: {
        summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }), importFile,
    } }, 'backup');
    const dictionary = settingsElement<HTMLInputElement>(form, 'input[data-file="dictionary"]');
    settingsElement<HTMLButtonElement>(form, '[data-action="import-yomitan-dictionary"]').click();
    await waitForCondition(() => typeof dictionary.onchange === 'function');
    expect(settingsElement<HTMLButtonElement>(form, 'button[type="submit"]').disabled).toBe(false);

    const backup = new File(['backup'], 'settings.json');
    Object.defineProperty(backup, 'text', { value: async () => JSON.stringify({
        formatName: 'yomu-reader-settings', formatVersion: 3, settings: { ...DEFAULT_SETTINGS, accentColor: '#123456' },
    }) });
    const settingsInput = settingsElement<HTMLInputElement>(form, 'input[data-file="settings"]');
    Object.defineProperty(settingsInput, 'files', { configurable: true, value: [backup] });
    settingsElement<HTMLButtonElement>(form, '[data-action="import-reader-settings"]').click();
    await waitForCondition(() => typeof settingsInput.onchange === 'function');
    settingsInput.dispatchEvent(new Event('change'));
    await waitForCondition(() => settingsElement<HTMLButtonElement>(form, 'button[type="submit"]').dataset.saveBlocked === 'settings-import');
    expect(saveSettings).not.toHaveBeenCalled();
    Object.defineProperty(dictionary, 'files', { configurable: true, value: [new File(['zip'], 'stale.zip')] });
    dictionary.dispatchEvent(new Event('change'));
    await waitForCondition(() => saveSettings.mock.calls.length === 1);
    expect(importFile).not.toHaveBeenCalled();
    expect(saveSettings.mock.calls[0]?.[0]).toMatchObject({ accentColor: '#123456' });
});
