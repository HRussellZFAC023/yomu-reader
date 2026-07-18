import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { diagnoseAnkiConnectFailure } from '../../../src/reader/anki/transport';
import { uiText } from '../../../src/reader/app/i18n';
import { ANKI_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../../../src/reader/app/constants';
import { INSTALL_GUIDE_URL } from '../../../src/reader/app/userscript-update';
import { CURRENT_YOMU_VERSION } from '../../../src/reader/app/version';
import { applyNestedParsePlan, nestedSettingsTextParsePlan } from '../../../src/reader/lookup/nested-text-parse';
import { findRecommendedDictionary } from '../../../src/reader/dictionaries/recommended';
import { accentToRgba, accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS, effectiveFuriganaMode, effectiveReaderTextColorSource, normalizeReaderSettings, shouldLookupAnkiStatus } from '../../../src/reader/settings/index';
import { blendRgba, contrastRatio, cssColorToRgba, rgbaToHex } from '../../../src/reader/theme/color-utils';
import { activateSettingsPanel, applySettingsSearch, installShortcutCapture, localizeSettingsForm, readFormSettings, renderHelpLinksPanel, renderSettingsForm, syncSubtitlePreview } from '../../../src/reader/settings/form';
import { JAPANESE_ROUNDED_FONT_FAMILY } from '../../../src/reader/settings/font-presets';
import { CUSTOM_FONT_FAMILY_VALUE } from '../../../src/reader/settings/form-read';
import { reconcileApiCredentialInputs } from '../../../src/reader/settings/dialog-controller';
import { KANJI_SIMILAR_WORDS_SOURCE_ID, orderedDefinitionSourceIds, orderedKanjiSourceIds } from '../../../src/reader/sources/sections';
import type { AnkiFieldMappingRole, AnkiFieldMappings, JPDBCard, JPDBToken, ReaderSettings } from '../../../src/reader/app/types';
import { testEnSettings } from '../helpers/settings-fixture';

// These tests assert English UI copy; pin the interface language for
// deterministic string assertions regardless of the runtime default.
export const DEFAULT_SETTINGS = testEnSettings();

export function compositeOverWhiteHex(color: string): string {
    const foreground = cssColorToRgba(color);
    const white = cssColorToRgba('#ffffff');
    if (!foreground || !white) throw new Error(`Unable to parse color ${color}`);
    return rgbaToHex(blendRgba(foreground, white));
}

export const frequencySettings = {
    ...DEFAULT_SETTINGS,
    dictionaryPreferences: [
        { name: 'JMdict', alias: 'JMdict', enabled: true, priority: 0, type: 'terms' as const },
        { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 1, type: 'frequency' as const },
        { name: 'Jiten', alias: 'Jiten', enabled: true, priority: 2, type: 'frequency' as const },
        { name: 'JPDB Freq', alias: 'JPDB Freq', enabled: false, priority: 3, type: 'frequency' as const },
    ],
};

export const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');
export const GETTING_STARTED_DOCS = readFileSync('docs/getting-started.md', 'utf8');
export const FEATURES_DOCS = readFileSync('docs/features.md', 'utf8');
export const HISTORICAL_HIRAGINO_YU_GOTHIC_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
export const AMBIGUOUS_SCAN_COPY = ['Manual scan', 'only'].join(' ');
export const IMPORTED_ANKI_FIELD_MAPPINGS: AnkiFieldMappings = {
    Imported: {
        expression: 'Headword',
        reading: 'Kana',
        meaning: 'Glossary',
    },
};

export function topLevelLegendForControl(form: HTMLFormElement, controlName: string): string {
    const control = form.querySelector<HTMLElement>(`[name="${controlName}"]`);
    const fieldset = control?.closest<HTMLFieldSetElement>('fieldset[data-settings-panel]');
    const legend = Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.tagName === 'LEGEND',
    );

    return legend?.textContent ?? '';
}

export function topLevelLegendsForControl(form: HTMLFormElement, controlName: string): string[] {
    return Array.from(form.querySelectorAll<HTMLElement>(`[name="${controlName}"]`)).map(control => {
        const fieldset = control.closest<HTMLFieldSetElement>('fieldset[data-settings-panel]');
        const legend = Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
            child instanceof HTMLElement && child.tagName === 'LEGEND',
        );
        return legend?.textContent ?? '';
    });
}

export function labelForControl(form: HTMLFormElement, controlName: string): string {
    return form.querySelector<HTMLElement>(`[name="${controlName}"]`)?.closest('label')?.textContent ?? '';
}

export function optionText(form: HTMLFormElement, controlName: string, value: string): string {
    const option = Array.from(form.querySelector<HTMLSelectElement>(`[name="${controlName}"]`)?.options ?? [])
        .find(item => item.value === value);
    return option?.textContent ?? '';
}

export function checkboxValue(form: HTMLFormElement, controlName: string): boolean | undefined {
    return form.querySelector<HTMLInputElement>(`input[name="${controlName}"]`)?.checked;
}

export function radioValue(form: HTMLFormElement, controlName: string): string | undefined {
    return form.querySelector<HTMLInputElement>(`input[name="${controlName}"]:checked`)?.value;
}

export function selectValue(form: HTMLFormElement, controlName: string): string | undefined {
    return form.querySelector<HTMLSelectElement>(`select[name="${controlName}"]`)?.value;
}

export function renderSettingsTestForm(settings: typeof DEFAULT_SETTINGS): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
    return form;
}

export function renderJapaneseSettingsTestForm(): HTMLFormElement {
    const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, ankiEnabled: true });
    localizeSettingsForm(form, 'ja');
    return form;
}

let sharedJapaneseSettingsForm: HTMLFormElement | undefined;
export function sharedJapaneseSettingsTestForm(): HTMLFormElement {
    sharedJapaneseSettingsForm ??= renderJapaneseSettingsTestForm();
    return sharedJapaneseSettingsForm;
}

export function renderImportedAnkiFieldMappingsForm(): HTMLFormElement {
    return renderSettingsTestForm({
        ...DEFAULT_SETTINGS,
        ankiModel: 'Imported',
        ankiFieldMappings: IMPORTED_ANKI_FIELD_MAPPINGS,
    });
}

export function settingsText(form: HTMLFormElement, selector: string): string {
    return form.querySelector<HTMLElement>(selector)?.textContent ?? '';
}

export function settingsTone(form: HTMLFormElement, selector: string): string | undefined {
    return form.querySelector<HTMLElement>(selector)?.dataset.statusTone;
}

export function recommendedDictionaryButton(form: HTMLFormElement, id: string): HTMLButtonElement {
    const button = form.querySelector<HTMLButtonElement>(`[data-action="download-recommended-dictionary"][data-dictionary-id="${id}"]`);
    if (!button) throw new Error(`Missing recommended dictionary button: ${id}`);
    return button;
}

export function recommendedDictionaryGuideOrNull(form: HTMLFormElement, id: string): HTMLAnchorElement | null {
    return form.querySelector<HTMLAnchorElement>(`[data-recommended-dictionary-guide][data-dictionary-id="${id}"]`);
}

export function recommendedDictionaryHelp(form: HTMLFormElement, id: string): string {
    return form.querySelector<HTMLElement>(`[data-dictionary-id="${id}"]`)
        ?.closest<HTMLElement>('.jpdb-reader-recommended-item')
        ?.querySelector<HTMLElement>('.jpdb-reader-help')
        ?.textContent ?? '';
}

export function parsedAnkiFieldMappingsValue(form: HTMLFormElement): AnkiFieldMappings {
    const hidden = form.querySelector<HTMLInputElement>('input[name="ankiFieldMappings"]')!;
    expect(hidden.type).toBe('hidden');
    return JSON.parse(hidden.value) as AnkiFieldMappings;
}

export function ankiFieldRoleValue(form: HTMLFormElement, role: AnkiFieldMappingRole): string {
    return form.querySelector<HTMLSelectElement>(`select[data-anki-field-role="${role}"]`)!.value;
}

export function savedAnkiFieldMappings(form: HTMLFormElement): AnkiFieldMappings {
    return readFormSettings(new FormData(form), DEFAULT_SETTINGS).ankiFieldMappings;
}

export function legacyStoredSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): Partial<typeof DEFAULT_SETTINGS> {
    // Model a genuine pre-current stored payload. newTabEnabled shipped as false
    // in the legacy default (it only became true once the extension opt-out fix
    // moved the first-install default into DEFAULT_SETTINGS), and the Anki-mobile
    // migration heuristic keys off that historical false, so the fixture pins it.
    const settings: Partial<typeof DEFAULT_SETTINGS> = { ...DEFAULT_SETTINGS, newTabEnabled: false, ...overrides };
    delete settings.jitenApiKey;
    return settings;
}

export type LegacyPitchSettings = Partial<ReaderSettings> & {
    wordHighlightMode?: 'auto' | 'status' | 'pitch' | 'off';
};

export function expectFontFamilyOptions(form: HTMLFormElement, controlName: 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily', labels: {
    defaultLabel: string;
    systemLabel: string;
    customLabel: string;
    historicalLabel: string;
    roundedLabel: string;
}): void {
    expect(form.querySelector<HTMLSelectElement>(`select[name="${controlName}"]`)).not.toBeNull();
    expect(form.querySelector<HTMLInputElement>(`input[name="${controlName}Custom"]`)).not.toBeNull();
    expect(optionText(form, controlName, DEFAULT_SETTINGS.popupFontFamily)).toBe(labels.defaultLabel);
    expect(optionText(form, controlName, DEFAULT_SETTINGS.subtitleFontFamily)).toBe(labels.systemLabel);
    expect(optionText(form, controlName, HISTORICAL_HIRAGINO_YU_GOTHIC_FONT)).toBe(labels.historicalLabel);
    expect(optionText(form, controlName, JAPANESE_ROUNDED_FONT_FAMILY)).toBe(labels.roundedLabel);
    expect(optionText(form, controlName, CUSTOM_FONT_FAMILY_VALUE)).toBe(labels.customLabel);
}

export function settingsToken(surface: string, start: number, reading = surface): JPDBToken {
    return {
        card: settingsCard(surface, reading),
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: reading === surface ? [] : [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass: '',
    };
}

export function settingsCard(spelling: string, reading = spelling): JPDBCard {
    return {
        vid: 1464530,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}

// The original settings-form.test.ts declared no module-level lifecycle hooks.
// This registration mirrors the sibling split layout (subtitles-controller/) so
// each topic file calls it once; it is intentionally a no-op.
export function registerSettingsFormCleanup(): void {
    // Intentionally empty: no shared teardown existed in the source file.
}

// Re-export the source symbols referenced directly inside the topic test bodies
// so every split file imports from this single fixtures module.
export {
    diagnoseAnkiConnectFailure,
    uiText,
    ANKI_SOURCE_ID,
    JITEN_DEFINITION_SOURCE_ID,
    JPDB_DEFINITION_SOURCE_ID,
    INSTALL_GUIDE_URL,
    CURRENT_YOMU_VERSION,
    applyNestedParsePlan,
    nestedSettingsTextParsePlan,
    findRecommendedDictionary,
    accentToRgba,
    accessibleOcrBackgroundColor,
    accessibleOcrBackgroundOpacity,
    BASE_DEFAULT_SETTINGS,
    effectiveFuriganaMode,
    effectiveReaderTextColorSource,
    normalizeReaderSettings,
    shouldLookupAnkiStatus,
    blendRgba,
    contrastRatio,
    cssColorToRgba,
    rgbaToHex,
    activateSettingsPanel,
    applySettingsSearch,
    installShortcutCapture,
    localizeSettingsForm,
    readFormSettings,
    renderHelpLinksPanel,
    renderSettingsForm,
    syncSubtitlePreview,
    JAPANESE_ROUNDED_FONT_FAMILY,
    CUSTOM_FONT_FAMILY_VALUE,
    reconcileApiCredentialInputs,
    KANJI_SIMILAR_WORDS_SOURCE_ID,
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
    testEnSettings,
};
export type {
    AnkiFieldMappingRole,
    AnkiFieldMappings,
    JPDBCard,
    JPDBToken,
    ReaderSettings,
};
