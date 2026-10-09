import { dictionaryStatusElements, renderDictionaryStatusElements } from '../../../src/reader/settings/dictionary-status-view';
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

    it('localizes built-in recommendation chrome and empty state without translating dictionary names', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        renderDictionaryStatusElements(dictionaryStatusElements(form), {
            dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0,
        }, DEFAULT_SETTINGS, 'en', 'ja', false);
        const seed = form.querySelector<HTMLElement>('[data-catalog-recommendation-seed]')!;
        const names = [...seed.querySelectorAll('.jpdb-reader-recommended-name')].map(node => node.textContent);
        localizeSettingsForm(form, 'ja');
        expect(seed.lang).toBe('ja');
        expect(seed.dataset.catalogRecommendationSeed).toBe('en');
        expect(seed.querySelector('.jpdb-reader-catalog-seed-title')?.textContent).toContain('日本語');
        expect(seed.querySelector('.jpdb-reader-catalog-seed-summary')?.textContent).not.toContain('dictionaries');
        expect(seed.textContent).not.toContain('Original Japanese');
        expect(seed.textContent).not.toContain('Translate automatically into English');
        expect(form.querySelector('[data-dictionary-status]')?.textContent).not.toContain('No dictionaries imported');
        expect([...seed.querySelectorAll('.jpdb-reader-recommended-name')].map(node => node.textContent)).toEqual(names);
        expect(form.querySelector('[data-help-key="localDictionarySiteStorageHelp"]')?.textContent).toBe('インポートした辞書は端末内に保存されます。');
        localizeSettingsForm(form, 'en');
        expect(seed.lang).toBe('en');
        expect(seed.querySelector('.jpdb-reader-catalog-seed-title')?.textContent).toBe('Recommended Japanese dictionaries');
        expect(form.querySelector('[data-dictionary-status]')?.textContent).toContain('No dictionaries imported');
    });

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
