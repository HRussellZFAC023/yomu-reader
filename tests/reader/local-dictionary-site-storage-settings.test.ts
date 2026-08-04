import { describe, expect, it } from 'vitest';

import { localizeSettingsForm, readFormSettings, renderSettingsForm } from '../../src/reader/settings/form';
import { testEnSettings } from './helpers/settings-fixture';

describe('local dictionary site storage settings', () => {
    it('renders and reads the global dictionary toggle without deleting site data', () => {
        const settings = { ...testEnSettings(), localDictionariesEnabled: true };
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');

        const toggle = form.querySelector<HTMLInputElement>('input[name="localDictionariesEnabled"]')!;
        const clearButton = form.querySelector<HTMLButtonElement>('[data-action="clear-local-dictionary-site-storage"]')!;
        const help = form.querySelector<HTMLElement>('[data-local-dictionary-storage] [data-help-key]')!;
        expect(toggle.checked).toBe(true);
        expect(toggle.closest('label')?.textContent).toContain('Show imported dictionary definitions');
        expect(help.textContent).toContain('stored by the site where you import them');
        expect(help.textContent).toContain('online sources');
        expect(clearButton.textContent).toBe('Disable and remove stored dictionaries');

        toggle.checked = false;
        expect(readFormSettings(new FormData(form), settings).localDictionariesEnabled).toBe(false);
        expect(clearButton.getAttribute('type')).toBe('button');
    });

    it('localizes the global toggle and current-site cleanup scope in Japanese', () => {
        const settings = { ...testEnSettings(), localDictionariesEnabled: false };
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');

        const toggle = form.querySelector<HTMLInputElement>('input[name="localDictionariesEnabled"]')!;
        const section = form.querySelector<HTMLElement>('[data-local-dictionary-storage]')!;
        expect(toggle.checked).toBe(false);
        expect(toggle.closest('label')?.textContent).toContain('インポート済み辞書の定義を表示');
        expect(section.textContent).toContain('インポートしたサイトに保存されます');
        expect(section.textContent).toContain('保存済み辞書を削除');
        expect(readFormSettings(new FormData(form), settings).localDictionariesEnabled).toBe(false);
    });
});
