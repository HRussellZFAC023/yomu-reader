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

    it('renders built-in source display names as editable settings and saves them', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            jitenDefinitionsAlias: 'Jiten Custom',
            jpdbKanjiAlias: 'Kanji Facts Custom',
        });

        expect(form.querySelector<HTMLInputElement>('input[name="jitenDefinitions.alias"]')?.value).toBe('Jiten Custom');
        expect(form.querySelector<HTMLInputElement>('input[name="jpdbDefinitions.alias"]')).not.toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="studyTranslation.alias"]')).not.toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="ankiSection.alias"]')).not.toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="jpdbKanji.alias"]')?.value).toBe('Kanji Facts Custom');
        expect(form.querySelector<HTMLInputElement>('input[name="rtk.alias"]')).not.toBeNull();
        expect(settingsText(form, '.jpdb-reader-kanji-priorities .jpdb-reader-dictionary-head span:nth-child(3)')).toBe('Display name');

        form.querySelector<HTMLInputElement>('input[name="jpdbDefinitions.alias"]')!.value = 'Cards API';
        form.querySelector<HTMLInputElement>('input[name="studyGrammar.alias"]')!.value = 'Grammar Notes';
        form.querySelector<HTMLInputElement>('input[name="kanjivg.alias"]')!.value = 'Draw';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.jitenDefinitionsAlias).toBe('Jiten Custom');
        expect(saved.jpdbDefinitionsAlias).toBe('Cards API');
        expect(saved.studyGrammarAlias).toBe('Grammar Notes');
        expect(saved.jpdbKanjiAlias).toBe('Kanji Facts Custom');
        expect(saved.kanjivgAlias).toBe('Draw');
    });

    it('keeps default built-in source names localized until a custom alias is entered', () => {
        const form = renderJapaneseSettingsTestForm();

        expect(form.querySelector<HTMLInputElement>('input[name="studyTranslation.alias"]')?.placeholder).toBe('翻訳');
        expect(form.querySelector<HTMLInputElement>('input[name="studyGrammar.alias"]')?.placeholder).toBe('文法');

        form.querySelector<HTMLInputElement>('input[name="studyTranslation.alias"]')!.value = 'My Translation';
        localizeSettingsForm(form, 'ja');

        expect(form.querySelector<HTMLInputElement>('input[name="studyTranslation.alias"]')?.value).toBe('My Translation');
    });
});
