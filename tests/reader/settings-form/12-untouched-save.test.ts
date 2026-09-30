import { describe, expect, it } from 'vitest';
import { captureActiveLanguageProfileDictionaries } from '../../../src/reader/settings/dictionary';
import { updateSourceRowEditor } from '../../../src/reader/settings/form-order';
import { mergeDictionaryPreferences, normalizeReaderSettings } from '../../../src/reader/settings/index';
import type { ReaderSettings } from '../../../src/reader/app/types';
import {
    DEFAULT_SETTINGS,
    readFormSettings,
    registerSettingsFormCleanup,
    renderSettingsTestForm,
} from './fixtures';

function changedKeys(before: ReaderSettings, after: ReaderSettings): string[] {
    return Object.keys(before).filter(key =>
        JSON.stringify(after[key as keyof ReaderSettings]) !== JSON.stringify(before[key as keyof ReaderSettings]));
}

function untouchedSave(settings: ReaderSettings): ReaderSettings {
    return readFormSettings(new FormData(renderSettingsTestForm(settings)), settings);
}

/**
 * An install that has been used: dictionaries imported into the active
 * profile (a terms, a kanji and a frequency one, still on the import numbers
 * 1000+ beside the built-ins' 0-90), JPDB moved above Jiten, RTK first among
 * kanji sources, a lookup pill moved to the front, furigana on known cards
 * only, and the native subtitle track hidden by choice.
 */
function usedSettings(): ReaderSettings {
    const imported = mergeDictionaryPreferences([], ['Jitendex', 'KANJIDIC', 'BCCWJ'], {
        Jitendex: 'terms',
        KANJIDIC: 'kanji',
        BCCWJ: 'frequency',
    });
    const [yomu, ...links] = DEFAULT_SETTINGS.dictionaryLookupLinks;
    const jisho = links.find(link => link.id === 'jisho')!;
    return normalizeReaderSettings(captureActiveLanguageProfileDictionaries({
        ...DEFAULT_SETTINGS,
        jpdbDefinitionsPriority: 0,
        jitenDefinitionsPriority: 1,
        rtkPriority: 0,
        kanjivgPriority: 20,
        ankiEnabled: true,
        ankiSectionEnabled: true,
        furiganaMode: 'known-status',
        hideKnownFurigana: true,
        subtitleSecondaryVisible: false,
        subtitleSecondaryVisibleChosen: true,
        dictionaryLookupLinks: [{ ...jisho, enabled: true }, yomu!, ...links.filter(link => link !== jisho)]
            .map((link, priority) => ({ ...link, priority })),
    }, imported));
}

// Saving the dialog without touching anything is not a choice: it must write
// back exactly what was stored, or it quietly changes settings (and records
// them as the learner's intent) on every first Save.
describe('an untouched settings Save', () => {
    registerSettingsFormCleanup();

    it('reads back every default setting unchanged', () => {
        expect(changedKeys(DEFAULT_SETTINGS, untouchedSave(DEFAULT_SETTINGS))).toEqual([]);
    });

    it('reads back a used install unchanged', () => {
        const settings = usedSettings();
        expect(settings.dictionaryPreferences.map(preference => preference.priority)).toEqual([1000, 1001, 1002]);
        expect(settings.languageProfiles[0]?.dictionaries.order).toEqual(['Jitendex', 'KANJIDIC', 'BCCWJ']);

        expect(changedKeys(settings, untouchedSave(settings))).toEqual([]);
    });

    it('still writes a moved row as the new order', () => {
        const settings = usedSettings();
        const form = renderSettingsTestForm(settings);
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-kanji-priorities')!;
        const rowIds = () => Array.from(editor.querySelectorAll<HTMLElement>('[data-source-row]')).map(row => row.dataset.sourceId);
        const before = rowIds();
        updateSourceRowEditor('dictionary-source-down', editor.querySelector<HTMLElement>('[data-source-row]'));

        const saved = readFormSettings(new FormData(form), settings);

        expect(rowIds()).toEqual([before[1], before[0], ...before.slice(2)]);
        expect(renderedKanjiRowIds(saved)).toEqual(rowIds());
        expect(changedKeys(settings, saved)).toContain('rtkPriority');
    });
});

function renderedKanjiRowIds(settings: ReaderSettings): (string | undefined)[] {
    return Array.from(renderSettingsTestForm(settings).querySelectorAll<HTMLElement>('.jpdb-reader-kanji-priorities [data-source-row]'))
        .map(row => row.dataset.sourceId);
}
