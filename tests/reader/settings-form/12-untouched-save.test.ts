import { describe, expect, it } from 'vitest';
import { captureDictionaryPanelView } from '../../../src/reader/settings/catalog-browse-disclosure';
import { captureActiveLanguageProfileDictionaries } from '../../../src/reader/settings/dictionary';
import type { DictionaryStatusSummary } from '../../../src/reader/settings/dictionary-status-view';
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

    // An imported kanji dictionary orders the kanji section, so the Kanji
    // editor owns it. It used to be a row in the Sources editor as well, under
    // the same field names; FormData read the Sources copy first, so moving it
    // in the Kanji editor saved nothing.
    it('submits every imported dictionary from exactly one editor', () => {
        expect(repeatedDictionaryFields(renderSettingsTestForm(usedSettings()))).toEqual([]);
    });

    it('writes a kanji dictionary moved in the Kanji editor as the new order', () => {
        const settings = usedSettings();
        const form = renderSettingsTestForm(settings);
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-kanji-priorities')!;
        const rowIds = () => Array.from(editor.querySelectorAll<HTMLElement>('[data-source-row]')).map(row => row.dataset.sourceId);
        const sources = renderedSourceRowIds(settings);
        const before = rowIds();
        expect(before.at(-1)).toBe(KANJIDIC_ROW);

        updateSourceRowEditor('dictionary-source-up', editor.querySelector<HTMLElement>(`[data-source-id="${KANJIDIC_ROW}"]`));
        const saved = readFormSettings(new FormData(form), settings);

        expect(rowIds()).toEqual([...before.slice(0, -2), KANJIDIC_ROW, before.at(-2)]);
        expect(renderedKanjiRowIds(saved)).toEqual(rowIds());
        expect(changedKeys(saved, untouchedSave(saved))).toEqual([]);
        expect(renderedSourceRowIds(saved)).toEqual(sources);
        expect(sources).not.toContain('KANJIDIC');
    });

    // Both editors number their fields by the shelf they were rendered from, so
    // a refresh after an import or removal must re-render the Kanji editor too.
    it.each(['Jitendex', 'KANJIDIC'])('re-renders both editors when %s leaves the shelf', name => {
        const settings = usedSettings();
        const form = renderSettingsTestForm(settings);
        const removed = normalizeReaderSettings(captureActiveLanguageProfileDictionaries(
            settings,
            settings.dictionaryPreferences.filter(preference => preference.name !== name),
        ));

        captureDictionaryPanelView(form).render(shelfSummary(removed), removed, 'en', 'ja');

        expect(Array.from(form.querySelectorAll<HTMLElement>('.jpdb-reader-kanji-priorities [data-source-row]'))
            .map(row => row.dataset.sourceId)).toEqual(renderedKanjiRowIds(removed));
        expect(repeatedDictionaryFields(form)).toEqual([]);
        expect(readFormSettings(new FormData(form), removed).dictionaryPreferences).toEqual(removed.dictionaryPreferences);
    });
});

const KANJIDIC_ROW = '__kanji_dictionary__:KANJIDIC';

function repeatedDictionaryFields(form: HTMLFormElement): string[] {
    const data = new FormData(form);
    return [...new Set(data.keys())]
        .filter(key => key.startsWith('dictionaryPreferences.') && data.getAll(key).length > 1);
}

function shelfSummary(settings: ReaderSettings): DictionaryStatusSummary {
    return {
        dictionaries: settings.dictionaryPreferences.map(preference => ({ ...preference, title: preference.name })),
        terms: 1,
        kanji: 0,
        termMeta: 0,
        kanjiMeta: 0,
    };
}

function renderedKanjiRowIds(settings: ReaderSettings): (string | undefined)[] {
    return Array.from(renderSettingsTestForm(settings).querySelectorAll<HTMLElement>('.jpdb-reader-kanji-priorities [data-source-row]'))
        .map(row => row.dataset.sourceId);
}

function renderedSourceRowIds(settings: ReaderSettings): (string | undefined)[] {
    return Array.from(renderSettingsTestForm(settings).querySelectorAll<HTMLElement>('[data-definition-source-editor] [data-source-row]'))
        .map(row => row.dataset.sourceId);
}
