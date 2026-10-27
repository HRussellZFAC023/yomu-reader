
import { expect } from 'vitest';
import { diagnoseAnkiConnectFailure } from '../../../src/reader/anki/transport';
import { uiText } from '../../../src/reader/app/i18n';
import { JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../../../src/reader/app/constants';


import { findRecommendedDictionary } from '../../../src/reader/dictionaries/recommended';
import { normalizeReaderSettings } from '../../../src/reader/settings/index';

import { applySettingsSearch, installShortcutCapture, localizeSettingsForm, readFormSettings, renderSettingsForm as renderFullSettingsForm } from '../../../src/reader/settings/form';
import { JAPANESE_ROUNDED_FONT_FAMILY } from '../../../src/reader/settings/font-presets';
import { CUSTOM_FONT_FAMILY_VALUE } from '../../../src/reader/settings/form-read';
import { reconcileApiCredentialInputs } from '../../../src/reader/settings/dialog-controller';
import { orderedDefinitionSourceIds } from '../../../src/reader/sources/sections';
import type { AnkiFieldMappingRole, AnkiFieldMappings, ReaderSettings } from '../../../src/reader/app/types';
import { testEnSettings } from '../helpers/settings-fixture';

// These tests assert English UI copy; pin the interface language for
// deterministic string assertions regardless of the runtime default.
export const DEFAULT_SETTINGS = testEnSettings();

export const frequencySettings = {
    ...DEFAULT_SETTINGS,
    dictionaryPreferences: [
        { name: 'JMdict', alias: 'JMdict', enabled: true, priority: 0, type: 'terms' as const },
        { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 1, type: 'frequency' as const },
        { name: 'Jiten', alias: 'Jiten', enabled: true, priority: 2, type: 'frequency' as const },
        { name: 'JPDB Freq', alias: 'JPDB Freq', enabled: false, priority: 3, type: 'frequency' as const },
    ],
};
const HISTORICAL_HIRAGINO_YU_GOTHIC_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
export const AMBIGUOUS_SCAN_COPY = ['Manual scan', 'only'].join(' ');
export const IMPORTED_ANKI_FIELD_MAPPINGS: AnkiFieldMappings = {
    Imported: {
        expression: 'Headword',
        reading: 'Kana',
        meaning: 'Glossary',
    },
};

// Catalogue browse has dedicated full-DOM suites. The settings-form suites focus
// on the surrounding controls and compact recommendation shelf, so avoid
// rebuilding more than 1,600 unrelated cards in every fixture.
export function renderSettingsForm(
    settings: ReaderSettings,
    jpdbSettingsUrl: string,
    jitenSettingsUrl?: string,
): string {
    return renderFullSettingsForm(settings, jpdbSettingsUrl, jitenSettingsUrl, {
        includeCatalogBrowse: false,
    });
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

type LegacyStoredSettings = Partial<ReaderSettings> & { newTabEnabled?: boolean };

export function legacyStoredSettings(overrides: LegacyStoredSettings = {}): LegacyStoredSettings {
    const settings: LegacyStoredSettings = { ...DEFAULT_SETTINGS, newTabEnabled: false, ...overrides };
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

// The original settings-form.test.ts declared no module-level lifecycle hooks.
// This registration mirrors the sibling split layout (subtitles-controller/) so
// each topic file calls it once; it is intentionally a no-op.
export function registerSettingsFormCleanup(): void {
    // Intentionally empty: no shared teardown existed in the source file.
}

// Re-export the source symbols referenced directly inside the topic test bodies
// so every split file imports from this single fixtures module.
export { diagnoseAnkiConnectFailure, uiText, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, findRecommendedDictionary, normalizeReaderSettings, applySettingsSearch, installShortcutCapture, localizeSettingsForm, readFormSettings, CUSTOM_FONT_FAMILY_VALUE, reconcileApiCredentialInputs, orderedDefinitionSourceIds };
export type {
    AnkiFieldMappingRole,
    AnkiFieldMappings,
    ReaderSettings,
};
