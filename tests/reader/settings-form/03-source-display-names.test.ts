import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SETTINGS,
    localizeSettingsForm,
    readFormSettings,
    registerSettingsFormCleanup,
    renderJapaneseSettingsTestForm,
    renderSettingsTestForm,
    settingsText,
} from './fixtures';

describe('source display names', () => {
    registerSettingsFormCleanup();

    it('uses a single name column and offers no renaming controls for built-in sources', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        for (const row of form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]')) {
            expect(row.classList.contains('compact')).toBe(true);
            expect(row.querySelector('input[name$=".alias"]')).toBeNull();
        }
        expect(settingsText(form, '.jpdb-reader-kanji-priorities .jpdb-reader-dictionary-head span:nth-child(3)')).toBe('Order');
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS)).not.toHaveProperty('jpdbDefinitionsAlias');
    });

    it('localizes source names directly, including after switching the interface language', () => {
        const form = renderJapaneseSettingsTestForm();
        const name = (id: string) => settingsText(form, `[data-source-id="${id}"] .jpdb-reader-field-display`);
        expect(name('__study_translation__')).toBe('翻訳');
        expect(name('__study_grammar__')).toBe('文法');
        localizeSettingsForm(form, 'en');
        expect(name('__study_translation__')).toBe('Translation');
        expect(name('__study_grammar__')).toBe('Grammar');
    });

    it('keeps imported dictionary identity and a shorter display name in the same cell', () => {
        const settings = { ...DEFAULT_SETTINGS, dictionaryPreferences: [{ name: 'A dictionary with a long release title', alias: 'My dictionary', enabled: true, priority: 4, type: 'terms' as const, allowSecondarySearches: false }] };
        const form = renderSettingsTestForm(settings);
        const input = form.querySelector<HTMLInputElement>('[name="dictionaryPreferences.0.alias"]')!;
        expect(input.value).toBe('My dictionary');
        expect(input.closest('[data-source-row]')?.classList.contains('compact')).toBe(true);
        input.value = 'Reference';
        expect(readFormSettings(new FormData(form), settings).dictionaryPreferences).toEqual([{ ...settings.dictionaryPreferences[0], alias: 'Reference' }]);
    });
});
