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
import { CUSTOM_FONT_FAMILY_VALUE, expectFontFamilyOptions, installShortcutCapture, normalizeReaderSettings as normalizeReaderSettings2, optionText, renderSettingsForm } from "./fixtures";
import { IMPORTED_ANKI_FIELD_MAPPINGS, ankiFieldRoleValue, parsedAnkiFieldMappingsValue, renderImportedAnkiFieldMappingsForm, savedAnkiFieldMappings } from "./fixtures";

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

    // YQ-11: Save stays enabled while a dictionary installs, so the form can be
    // submitted before it has drawn the new dictionary's row. That Save must
    // keep the stored preference rather than drop the dictionary it never saw.
    it('keeps a dictionary installed after the form was drawn', () => {
        const settings = usedSettings();
        const form = renderSettingsTestForm(settings);
        const installed = { name: 'JMdict', alias: 'JMdict', enabled: true, priority: 1003, type: 'terms' as const };
        const current = { ...settings, dictionaryPreferences: [...settings.dictionaryPreferences, installed] };

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.dictionaryPreferences.map(preference => preference.name))
            .toEqual([...settings.dictionaryPreferences.map(preference => preference.name), 'JMdict']);
        expect(saved.dictionaryPreferences.find(preference => preference.name === 'JMdict')).toMatchObject(installed);
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

// A browser leaves an unticked checkbox out of FormData, so "absent" can never
// mean "this control was not rendered". Reading it that way kept Show
// pronunciation switched on after every Save.
describe('a settings checkbox flipped before Save', () => {
    registerSettingsFormCleanup();

    it('saves Show pronunciation turned off', () => {
        const current = { ...DEFAULT_SETTINGS, showPitchAccent: true };
        const form = renderSettingsTestForm(current);
        (form.elements.namedItem('showPitchAccent') as HTMLInputElement).checked = false;

        expect(readFormSettings(new FormData(form), current).showPitchAccent).toBe(false);
    });

    it('saves every boolean setting checkbox in both directions', () => {
        const defaults = renderSettingsTestForm(DEFAULT_SETTINGS);
        const keys = [...new Set(Array.from(defaults.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]'), box => box.name))]
            .filter((name): name is BooleanSettingKey => typeof DEFAULT_SETTINGS[name as keyof ReaderSettings] === 'boolean');
        expect(keys.length).toBeGreaterThan(60);

        const lost = keys.flatMap(key => [DEFAULT_SETTINGS[key], !DEFAULT_SETTINGS[key]].flatMap(stored => {
            const current = { ...DEFAULT_SETTINGS, [key]: stored };
            const form = stored === DEFAULT_SETTINGS[key] ? defaults : renderSettingsTestForm(current);
            const box = form.querySelector<HTMLInputElement>(`input[type="checkbox"][name="${key}"]`)!;
            box.checked = !stored;
            const saved = readFormSettings(new FormData(form), current)[key];
            box.checked = stored;
            return saved === !stored ? [] : [`${key}: ${stored} -> ${!stored} saved ${saved}`];
        }));

        expect(lost).toEqual([]);
    });
});

type BooleanSettingKey = { [K in keyof ReaderSettings]-?: ReaderSettings[K] extends boolean ? K : never }[keyof ReaderSettings];

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

describe('subtitle overlay visibility choices', () => {
    registerSettingsFormCleanup();

    it('shows the preferred reveal mode before an automatic native track is available', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            subtitleSecondaryVisible: false,
            subtitleSecondaryVisibleChosen: false,
            subtitleNativeBlurred: true,
        });

        expect(form.querySelector<HTMLSelectElement>('select[name="subtitleNativeDisplay"]')?.value).toBe('blurred');
    });

    it('remembers that the user chose "Hide completely" so an automatic track cannot re-enable it', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleSecondaryVisible: true, subtitleSecondaryVisibleChosen: false };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLSelectElement>('select[name="subtitleNativeDisplay"]')!.value = 'hidden';

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleSecondaryVisible).toBe(false);
        expect(saved.subtitleSecondaryVisibleChosen).toBe(true);
    });

    it('stores the three native-translation choices without adding a duplicate mode key', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleSecondaryVisible: true, subtitleNativeBlurred: true };
        const form = renderSettingsTestForm(current);
        const mode = form.querySelector<HTMLSelectElement>('select[name="subtitleNativeDisplay"]')!;

        mode.value = 'shown';
        let saved = readFormSettings(new FormData(form), current);
        expect(saved.subtitleSecondaryVisible).toBe(true);
        expect(saved.subtitleNativeBlurred).toBe(false);

        mode.value = 'blurred';
        saved = readFormSettings(new FormData(form), current);
        expect(saved.subtitleSecondaryVisible).toBe(true);
        expect(saved.subtitleNativeBlurred).toBe(true);
    });

    it('clamps the persisted native subtitle concealment strength', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleNativeBlurStrength: 12 };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLInputElement>('input[name="subtitleNativeBlurStrength"]')!.value = '99';

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleNativeBlurStrength).toBe(20);
    });

    it('remembers an unchecked subtitle overlay the same way', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleOverlayVisible: true, subtitleOverlayVisibleChosen: false };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLInputElement>('input[name="subtitleOverlayVisible"]')!.checked = false;

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleOverlayVisible).toBe(false);
        expect(saved.subtitleOverlayVisibleChosen).toBe(true);
    });

    it('leaves untouched overlay visibilities open to the automatic reveal', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleOverlayVisible: false, subtitleSecondaryVisible: false };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLInputElement>('input[name="subtitleKaraokeMode"]')!.checked = false;

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleKaraokeMode).toBe(false);
        expect(saved.subtitleOverlayVisibleChosen).toBe(false);
        expect(saved.subtitleSecondaryVisibleChosen).toBe(false);
    });

    it('keeps an earlier choice recorded when a later save does not touch the checkbox', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleSecondaryVisible: false, subtitleSecondaryVisibleChosen: true };
        const form = renderSettingsTestForm(current);

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleSecondaryVisible).toBe(false);
        expect(saved.subtitleSecondaryVisibleChosen).toBe(true);
    });
});

describe('settings form localization', () => {
    const STATUS_COLOR_SOURCE_VALUES = ['status', 'jpdb', 'anki'] as const;

    function statusColorSourceLabels(form: HTMLFormElement, name: string): string[] {
        return STATUS_COLOR_SOURCE_VALUES.map(value => optionText(form, name, value));
    }

    function expectDistinctStatusColorSourceLabels(form: HTMLFormElement): void {
        form.querySelectorAll<HTMLSelectElement>('select[name$="ColorSource"]').forEach(select => {
            const labels = statusColorSourceLabels(form, select.name);
            expect(new Set(labels).size, `${select.name} repeats a study-status label`).toBe(labels.length);
        });
    }


    registerSettingsFormCleanup();

    it('mirrors the hover lookup shortcut between Reader and Shortcuts', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        installShortcutCapture(form);

        const hoverInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="shortcuts.hoverLookup"]'));
        expect(hoverInputs).toHaveLength(2);

        hoverInputs[1]!.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'H',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        }));

        expect(hoverInputs.map(input => input.value)).toEqual(['Shift+H', 'Shift+H']);
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).shortcuts.hoverLookup).toBe('Shift+H');

        hoverInputs[0]!.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Backspace',
            bubbles: true,
            cancelable: true,
        }));

        expect(hoverInputs.map(input => input.value)).toEqual(['', '']);
        expect(readFormSettings(new FormData(form), {
            ...DEFAULT_SETTINGS,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: 'Shift+H' },
        }).shortcuts.hoverLookup).toBe('');
    });

    it('uses one autoplay selector while preserving an old silent profile on Save', () => {
        const current = { ...DEFAULT_SETTINGS, autoPlayAudio: false, audioAutoPlayMode: 'hover' as const };
        const form = renderSettingsTestForm(current);
        const select = form.querySelector<HTMLSelectElement>('select[name="audioAutoPlayMode"]')!;

        expect(form.querySelector('input[name="autoPlayAudio"]')).toBeNull();
        expect(form.querySelector('input[name="audioTimeoutMs"]')).toBeNull();
        expect(form.querySelector('select[name="audioSelectionMode"]')).toBeNull();
        expect(optionText(form, 'audioAutoPlayMode', 'off')).toBe('Off');
        expect(select.disabled).toBe(false);
        expect(select.value).toBe('off');
        expect(readFormSettings(new FormData(form), current)).toMatchObject({ autoPlayAudio: false, audioAutoPlayMode: 'hover' });

        for (const mode of ['all', 'hover', 'tap'] as const) {
            select.value = mode;
            expect(readFormSettings(new FormData(form), current)).toMatchObject({ autoPlayAudio: true, audioAutoPlayMode: mode });
        }
        select.value = 'off';
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).autoPlayAudio).toBe(false);
    });

    it('uses zero to disable the example cap and keeps old capped backups editable', () => {
        const current = { ...DEFAULT_SETTINGS, immersionKitLimitEnabled: true, immersionKitLimit: 3 };
        const form = renderSettingsTestForm(current);
        const count = form.querySelector<HTMLInputElement>('input[name="immersionKitLimit"]')!;
        expect(form.querySelector('input[name="immersionKitLimitEnabled"]')).toBeNull();
        expect(count.value).toBe('3');
        expect(readFormSettings(new FormData(form), current)).toMatchObject({ immersionKitLimitEnabled: true, immersionKitLimit: 3 });
        count.value = '0';
        expect(readFormSettings(new FormData(form), current)).toMatchObject({ immersionKitLimitEnabled: false, immersionKitLimit: 3 });
        count.value = '5';
        expect(readFormSettings(new FormData(form), current)).toMatchObject({ immersionKitLimitEnabled: true, immersionKitLimit: 5 });
        const uncapped = renderSettingsTestForm(DEFAULT_SETTINGS);
        expect(uncapped.querySelector<HTMLInputElement>('input[name="immersionKitLimit"]')?.value).toBe('0');
    });

    it('removes redundant Kanji detail controls while preserving saved detail settings', () => {
        const current = {
            ...DEFAULT_SETTINGS,
            kanjiOriginKanjiMapEnabled: false,
            kanjiOriginGraphEnabled: false,
            kanjiOriginRadicalImagesEnabled: false,
        };
        const form = renderSettingsTestForm(current);
        const kanjiPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-kanji')!;

        expect(kanjiPanel.dataset.settingsPanel).toBe('dictionaries');
        expect(kanjiPanel.textContent).not.toContain('Show kanji facts and component graph');
        expect(kanjiPanel.textContent).not.toContain('Show component graph');
        expect(kanjiPanel.textContent).not.toContain('Show radical images');
        expect(kanjiPanel.textContent).not.toContain('Similar word limit');
        expect(kanjiPanel.querySelector('input[name="similarKanjiWordLimit"]')).toBeNull();
        expect(readFormSettings(new FormData(form), current)).toMatchObject({
            kanjiOriginKanjiMapEnabled: false,
            kanjiOriginGraphEnabled: false,
            kanjiOriginRadicalImagesEnabled: false,
        });
    });

    it('persists font presets, custom font stacks, pause panel, and navigation shortcuts', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const readerFontFamily = form.querySelector<HTMLSelectElement>('select[name="readerFontFamily"]')!;
        const customReaderFontFamily = form.querySelector<HTMLInputElement>('input[name="readerFontFamilyCustom"]')!;
        const fontFamily = form.querySelector<HTMLSelectElement>('select[name="popupFontFamily"]')!;
        const customFontFamily = form.querySelector<HTMLInputElement>('input[name="popupFontFamilyCustom"]')!;
        const subtitleFontFamily = form.querySelector<HTMLSelectElement>('select[name="subtitleFontFamily"]')!;
        const customSubtitleFontFamily = form.querySelector<HTMLInputElement>('input[name="subtitleFontFamilyCustom"]')!;
        const fontWeight = form.querySelector<HTMLInputElement>('input[name="popupFontWeight"]')!;
        const pausePanel = form.querySelector<HTMLInputElement>('input[name="subtitlePausePanel"]')!;
        const shadowAutoPause = form.querySelector<HTMLInputElement>('input[name="subtitleShadowAutoPause"]')!;
        const previousWord = form.querySelector<HTMLInputElement>('input[name="shortcuts.previousLookupWord"]')!;
        const nextWord = form.querySelector<HTMLInputElement>('input[name="shortcuts.nextLookupWord"]')!;
        const previousSubtitle = form.querySelector<HTMLInputElement>('input[name="shortcuts.previousSubtitle"]')!;
        const nextSubtitle = form.querySelector<HTMLInputElement>('input[name="shortcuts.nextSubtitle"]')!;
        const toggleSubtitles = form.querySelector<HTMLInputElement>('input[name="shortcuts.toggleSubtitleOverlay"]')!;

        expect(readerFontFamily.value).toBe(DEFAULT_SETTINGS.readerFontFamily);
        expect(fontFamily.value).toBe(DEFAULT_SETTINGS.popupFontFamily);
        expectFontFamilyOptions(form, 'readerFontFamily', {
            defaultLabel: 'Built-in font',
            systemLabel: 'System UI',
            customLabel: 'Custom...',
            historicalLabel: 'Hiragino / Yu Gothic',
            roundedLabel: 'Japanese rounded',
        });
        expectFontFamilyOptions(form, 'popupFontFamily', {
            defaultLabel: 'Built-in font',
            systemLabel: 'System UI',
            customLabel: 'Custom...',
            historicalLabel: 'Hiragino / Yu Gothic',
            roundedLabel: 'Japanese rounded',
        });
        expectFontFamilyOptions(form, 'subtitleFontFamily', {
            defaultLabel: 'Built-in font',
            systemLabel: 'System UI',
            customLabel: 'Custom...',
            historicalLabel: 'Hiragino / Yu Gothic',
            roundedLabel: 'Japanese rounded',
        });
        expect(subtitleFontFamily.value).toBe(DEFAULT_SETTINGS.subtitleFontFamily);
        expect(fontWeight.value).toBe('450');
        expect(pausePanel.checked).toBe(false);
        expect(shadowAutoPause.checked).toBe(false);
        expect(form.querySelector('select[name="subtitleTranscriptPlacement"]')).toBeNull();
        expect(previousWord.value).toBe('Shift+ArrowLeft');
        expect(nextWord.value).toBe('Shift+ArrowRight');
        expect(previousSubtitle.value).toBe('A');
        expect(nextSubtitle.value).toBe('D');
        expect(DEFAULT_SETTINGS.shortcuts.toggleSubtitleOverlay).toBe('Shift+H');
        expect(toggleSubtitles.value).toBe('Shift+H');

        readerFontFamily.value = CUSTOM_FONT_FAMILY_VALUE;
        customReaderFontFamily.value = '"Inter", system-ui, sans-serif';
        fontFamily.value = CUSTOM_FONT_FAMILY_VALUE;
        customFontFamily.value = '"Noto Sans JP", sans-serif';
        subtitleFontFamily.value = CUSTOM_FONT_FAMILY_VALUE;
        customSubtitleFontFamily.value = '"Yu Mincho", serif';
        fontWeight.value = '420';
        pausePanel.checked = true;
        shadowAutoPause.checked = true;
        previousWord.value = 'Alt+H';
        nextWord.value = 'Alt+L';
        previousSubtitle.value = 'Shift+A';
        nextSubtitle.value = 'Shift+D';
        toggleSubtitles.value = 'Ctrl+H';

        const saved = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, subtitleTranscriptPlacement: 'bottom' });

        expect(saved.readerFontFamily).toBe('"Inter", system-ui, sans-serif');
        expect(saved.popupFontFamily).toBe('"Noto Sans JP", sans-serif');
        expect(saved.subtitleFontFamily).toBe('"Yu Mincho", serif');
        expect(saved.popupFontWeight).toBe(420);
        expect(saved.subtitlePausePanel).toBe(true);
        expect(saved.subtitleShadowAutoPause).toBe(true);
        expect(saved.subtitleTranscriptPlacement).toBe('bottom');
        expect(saved.shortcuts.previousLookupWord).toBe('Alt+H');
        expect(saved.shortcuts.nextLookupWord).toBe('Alt+L');
        expect(saved.shortcuts.previousSubtitle).toBe('Shift+A');
        expect(saved.shortcuts.nextSubtitle).toBe('Shift+D');
        expect(saved.shortcuts.toggleSubtitleOverlay).toBe('Ctrl+H');
    });

    // Alt+Arrow was the default before 0.7.36; every record written since holds
    // A/D or the learner's own keys, so a saved pair is never rewritten (ADR-0012).
    it('keeps saved subtitle line shortcuts as chosen', () => {
        const altArrows = normalizeReaderSettings2({
            ...DEFAULT_SETTINGS,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                previousSubtitle: 'Alt+ArrowLeft',
                nextSubtitle: 'Alt+ArrowRight',
            },
        });

        expect(altArrows.shortcuts.previousSubtitle).toBe('Alt+ArrowLeft');
        expect(altArrows.shortcuts.nextSubtitle).toBe('Alt+ArrowRight');

        const customized = normalizeReaderSettings2({
            ...DEFAULT_SETTINGS,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                previousSubtitle: 'Shift+A',
                nextSubtitle: 'Shift+D',
            },
        });

        expect(customized.shortcuts.previousSubtitle).toBe('Shift+A');
        expect(customized.shortcuts.nextSubtitle).toBe('Shift+D');
    });
});

describe('settings form localization', () => {
    registerSettingsFormCleanup();

    it('shows new-tab word-front sentences by default and persists the toggle', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const toggle = form.querySelector<HTMLInputElement>('input[name="newTabFrontSentenceEnabled"]');

        expect(DEFAULT_SETTINGS.newTabFrontSentenceEnabled).toBe(true);
        expect(toggle?.checked).toBe(true);

        toggle!.checked = false;

        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).newTabFrontSentenceEnabled).toBe(false);
    });

    it('keeps Anki new-tab sourcing separate from Anki mining', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, ankiEnabled: false }, 'https://jpdb.io/settings');
        const newTabAnkiToggle = form.querySelector<HTMLInputElement>('input[name="newTabAnkiEnabled"]');
        const ankiMiningToggle = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]');

        expect(DEFAULT_SETTINGS.newTabAnkiEnabled).toBe(false);
        expect(newTabAnkiToggle?.checked).toBe(false);
        expect(ankiMiningToggle?.checked).toBe(false);

        newTabAnkiToggle!.checked = true;

        const saved = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, ankiEnabled: false });
        expect(saved.newTabAnkiEnabled).toBe(true);
        expect(saved.ankiEnabled).toBe(false);
    });

    it('turns on the Anki popover source when Anki mining is enabled for the first time', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const miningToggle = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')!;
        const sourceToggle = form.querySelector<HTMLInputElement>('input[name="ankiSection.enabled"]')!;

        expect(sourceToggle.checked).toBe(false);
        miningToggle.checked = true;

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.ankiEnabled).toBe(true);
        expect(saved.ankiSectionEnabled).toBe(true);
    });

    it('shows saved Anki new-tab deck skips without adding a second scan action', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            newTabAnkiDisabledDecks: ['Archive', 'Old Mining'],
        }, 'https://jpdb.io/settings');
        const hidden = form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]');
        const newTabPanel = form.querySelector<HTMLElement>('[data-settings-panel="newTab"]')!;
        const deckControls = Array.from(newTabPanel.querySelectorAll<HTMLInputElement>('[data-newtab-anki-deck-toggle]'));

        expect(hidden?.type).toBe('hidden');
        expect(hidden?.value).toBe('Archive, Old Mining');
        expect(newTabPanel.textContent).toContain('Anki review decks');
        expect(newTabPanel.textContent).not.toContain('Scan Anki to load deck toggles');
        expect(newTabPanel.querySelector<HTMLElement>('[data-newtab-anki-decks]')?.hidden).toBe(false);
        expect(deckControls.map(input => input.dataset.newtabAnkiDeck)).toEqual(['Archive', 'Old Mining']);
        expect(deckControls.map(input => input.checked)).toEqual([false, false]);
        expect(newTabPanel.querySelector('[data-action="scan-anki"]')).toBeNull();

        hidden!.value = 'Archive';
        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.newTabAnkiDisabledDecks).toEqual(['Archive']);
    });

    it('stores parent Anki deck skips without duplicating skipped subdecks', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            newTabAnkiDisabledDecks: ['Japanese::Old', 'Japanese', 'Archive'],
        }, 'https://jpdb.io/settings');
        const hidden = form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]');
        const deckControls = Array.from(form.querySelectorAll<HTMLInputElement>('[data-newtab-anki-deck-toggle]'));

        expect(hidden?.value).toBe('Japanese, Archive');
        expect(deckControls.map(input => input.dataset.newtabAnkiDeck)).toEqual(['Japanese', 'Archive']);
        expect(deckControls.map(input => input.checked)).toEqual([false, false]);

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.newTabAnkiDisabledDecks).toEqual(['Japanese', 'Archive']);
    });

    it('round-trips scanned Anki field mappings through the settings form', () => {
        const form = renderImportedAnkiFieldMappingsForm();

        expect(parsedAnkiFieldMappingsValue(form)).toEqual(IMPORTED_ANKI_FIELD_MAPPINGS);
        expect(form.querySelector<HTMLElement>('[data-anki-library-adapter]')?.textContent).toContain('Existing library adapter');
        expect(form.querySelector<HTMLElement>('[data-anki-library-choices-title]')?.textContent).toBe('Deck and note type');
        expect(form.querySelector<HTMLElement>('[data-anki-template-settings-title]')?.textContent).toBe('Yomu card template');
        expect(ankiFieldRoleValue(form, 'expression')).toBe('Headword');
        expect(ankiFieldRoleValue(form, 'reading')).toBe('Kana');
        expect(ankiFieldRoleValue(form, 'meaning')).toBe('Glossary');

        expect(savedAnkiFieldMappings(form)).toEqual(IMPORTED_ANKI_FIELD_MAPPINGS);
    });
});
