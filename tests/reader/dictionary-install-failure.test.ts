import { afterEach, describe, expect, it, vi } from 'vitest';
import { userFacingError } from '../../src/reader/app/user-facing-errors';
import { dictionaryInstallFailureText } from '../../src/reader/dictionaries/install-failure';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    DEFAULT_SETTINGS,
    createSettingsDialog,
    resetSettingsDialogTestEnvironment,
    waitForCondition,
} from './helpers/settings-dialog-controller-fixture';

// Discord (Magyk, 2026-10-03): every Install said only "Dictionary download
// failed." and the card forgot it as soon as the toast faded.
describe('a failed dictionary install says why', () => {
    it('keeps the diagnostic the error carries', () => {
        expect(dictionaryInstallFailureText('en', userFacingError('dictionaryDownloadTimedOut', {
            diagnostic: 'The dictionary download exceeded its 120s budget.',
        }))).toBe('Dictionary download timed out. The dictionary download exceeded its 120s budget.');
        expect(dictionaryInstallFailureText('en', new Error('Integrity check failed: sha256 mismatch.')))
            .toBe('Dictionary download failed. Integrity check failed: sha256 mismatch.');
    });

    it('does not repeat copy the diagnostic already states, in either language', () => {
        expect(dictionaryInstallFailureText('en', userFacingError('dictionaryDownloadFailed', {
            diagnostic: 'Dictionary download failed (404).',
        }))).toBe('Dictionary download failed (404).');
        expect(dictionaryInstallFailureText('ja', userFacingError('dictionaryDownloadFailed', {
            diagnostic: '辞書のダウンロードに失敗しました。（404）',
        }))).toBe('辞書のダウンロードに失敗しました。（404）');
        expect(dictionaryInstallFailureText('ja', userFacingError('storageRuntimeUnavailable')))
            .not.toMatch(/[A-Za-z]{4}/u);
    });

    it('names a full disk, also behind a wrapped error', () => {
        const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        expect(dictionaryInstallFailureText('en', quota))
            .toBe('Not enough storage space for this dictionary. Free up space or remove a dictionary, then try again.');
        const japanese = dictionaryInstallFailureText('ja', new Error('Import failed.', { cause: quota }));
        expect(japanese).toContain('空き容量');
        expect(japanese).not.toContain('未翻訳');
    });
});

describe('a recommended dictionary card after a failed install', () => {
    afterEach(() => { resetSettingsDialogTestEnvironment(); });

    function dialogInstalling(importFromUrl: ReturnType<typeof vi.fn>, interfaceLanguage: ReaderSettings['interfaceLanguage'] = 'en') {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', interfaceLanguage };
        const dialog = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: { summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }), importFromUrl },
        });
        const button = dialog.form.querySelector<HTMLButtonElement>('[data-action="download-recommended-dictionary"][data-dictionary-id="jitendex"]')!;
        const status = button.closest<HTMLElement>('.jpdb-reader-recommended-item')!
            .querySelector<HTMLElement>('[data-recommended-dictionary-status]')!;
        button.click();
        return { ...dialog, button, status, toasted: () => waitForCondition(() => dialog.dependencies.toast.mock.calls.length > 0) };
    }

    it('keeps the reason on the card until the next click', async () => {
        const importFromUrl = vi.fn()
            .mockRejectedValueOnce(userFacingError('dictionaryDownloadFailed', { diagnostic: 'Dictionary download failed (404).' }))
            .mockReturnValueOnce(new Promise(() => undefined));
        const { button, dependencies, form, status, toasted } = dialogInstalling(importFromUrl);
        await toasted();
        await waitForCondition(() => !form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled);

        expect(dependencies.toast).toHaveBeenCalledWith('Dictionary download failed (404).');
        expect(status.hidden).toBe(false);
        expect(status.textContent).toBe('Dictionary download failed (404).');
        expect(status.dataset.importState).toBe('failed');
        expect(button.disabled).toBe(false);
        expect(button.textContent?.trim()).toBe('Install');

        button.click();
        await waitForCondition(() => importFromUrl.mock.calls.length === 2);

        expect(status.dataset.importState).toBe('installing');
        expect(status.textContent).not.toContain('404');
    });

    it('says the disk is full, in Japanese', async () => {
        const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        const { dependencies, status, toasted } = dialogInstalling(vi.fn().mockRejectedValue(quota), 'ja');
        await toasted();

        const message = 'この辞書を保存する空き容量が足りません。空き容量を増やすか辞書を削除してから、もう一度お試しください。';
        expect(dependencies.toast).toHaveBeenCalledWith(message);
        expect(status.textContent).toBe(message);
    });
});
