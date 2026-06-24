import { readFileSync } from 'node:fs';
import { diagnoseAnkiConnectFailure } from '../../src/reader/anki/transport';
import { uiText } from '../../src/reader/app/i18n';
import { describe, expect, it } from 'vitest';
import { ANKI_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../../src/reader/app/constants';
import { applyNestedParsePlan, nestedSettingsTextParsePlan } from '../../src/reader/lookup/nested-text-parse';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS, effectiveFuriganaMode, effectiveReaderTextColorSource, normalizeReaderSettings, shouldLookupAnkiStatus } from '../../src/reader/settings/index';
import { activateSettingsPanel, applySettingsSearch, installShortcutCapture, localizeSettingsForm, readFormSettings, renderHelpLinksPanel, renderSettingsForm, syncSubtitlePreview } from '../../src/reader/settings/form';
import { CUSTOM_FONT_FAMILY_VALUE } from '../../src/reader/settings/form-read';
import { reconcileApiCredentialInputs } from '../../src/reader/settings/dialog-controller';
import { KANJI_SIMILAR_WORDS_SOURCE_ID, orderedDefinitionSourceIds, orderedKanjiSourceIds } from '../../src/reader/sources/sections';
import type { AnkiFieldMappingRole, AnkiFieldMappings, JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' as const };

const frequencySettings = {
    ...DEFAULT_SETTINGS,
    dictionaryPreferences: [
        { name: 'JMdict', alias: 'JMdict', enabled: true, priority: 0, type: 'terms' as const },
        { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 1, type: 'frequency' as const },
        { name: 'Jiten', alias: 'Jiten', enabled: true, priority: 2, type: 'frequency' as const },
        { name: 'JPDB Freq', alias: 'JPDB Freq', enabled: false, priority: 3, type: 'frequency' as const },
    ],
};

const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');
const DOCS_THEME_SOURCE = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
const GETTING_STARTED_DOCS = readFileSync('docs/getting-started.md', 'utf8');
const FEATURES_DOCS = readFileSync('docs/features.md', 'utf8');
const HISTORICAL_HIRAGINO_YU_GOTHIC_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
const IMPORTED_ANKI_FIELD_MAPPINGS: AnkiFieldMappings = {
    Imported: {
        expression: 'Headword',
        reading: 'Kana',
        meaning: 'Glossary',
    },
};

function topLevelLegendForControl(form: HTMLFormElement, controlName: string): string {
    const control = form.querySelector<HTMLElement>(`[name="${controlName}"]`);
    const fieldset = control?.closest<HTMLFieldSetElement>('fieldset[data-settings-panel]');
    const legend = Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.tagName === 'LEGEND',
    );

    return legend?.textContent ?? '';
}

function topLevelLegendsForControl(form: HTMLFormElement, controlName: string): string[] {
    return Array.from(form.querySelectorAll<HTMLElement>(`[name="${controlName}"]`)).map(control => {
        const fieldset = control.closest<HTMLFieldSetElement>('fieldset[data-settings-panel]');
        const legend = Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
            child instanceof HTMLElement && child.tagName === 'LEGEND',
        );
        return legend?.textContent ?? '';
    });
}

function labelForControl(form: HTMLFormElement, controlName: string): string {
    return form.querySelector<HTMLElement>(`[name="${controlName}"]`)?.closest('label')?.textContent ?? '';
}

function optionText(form: HTMLFormElement, controlName: string, value: string): string {
    const option = Array.from(form.querySelector<HTMLSelectElement>(`[name="${controlName}"]`)?.options ?? [])
        .find(item => item.value === value);
    return option?.textContent ?? '';
}

function checkboxValue(form: HTMLFormElement, controlName: string): boolean | undefined {
    return form.querySelector<HTMLInputElement>(`input[name="${controlName}"]`)?.checked;
}

function selectValue(form: HTMLFormElement, controlName: string): string | undefined {
    return form.querySelector<HTMLSelectElement>(`select[name="${controlName}"]`)?.value;
}

function renderSettingsTestForm(settings: typeof DEFAULT_SETTINGS): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
    return form;
}

function renderJapaneseSettingsTestForm(): HTMLFormElement {
    const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, ankiEnabled: true });
    localizeSettingsForm(form, 'ja');
    return form;
}

let sharedJapaneseSettingsForm: HTMLFormElement | undefined;
function sharedJapaneseSettingsTestForm(): HTMLFormElement {
    sharedJapaneseSettingsForm ??= renderJapaneseSettingsTestForm();
    return sharedJapaneseSettingsForm;
}

function renderImportedAnkiFieldMappingsForm(): HTMLFormElement {
    return renderSettingsTestForm({
        ...DEFAULT_SETTINGS,
        ankiModel: 'Imported',
        ankiFieldMappings: IMPORTED_ANKI_FIELD_MAPPINGS,
    });
}

function settingsText(form: HTMLFormElement, selector: string): string {
    return form.querySelector<HTMLElement>(selector)?.textContent ?? '';
}

function settingsTone(form: HTMLFormElement, selector: string): string | undefined {
    return form.querySelector<HTMLElement>(selector)?.dataset.statusTone;
}

function recommendedDictionaryButton(form: HTMLFormElement, id: string): HTMLButtonElement {
    const button = form.querySelector<HTMLButtonElement>(`[data-action="download-recommended-dictionary"][data-dictionary-id="${id}"]`);
    if (!button) throw new Error(`Missing recommended dictionary button: ${id}`);
    return button;
}

function parsedAnkiFieldMappingsValue(form: HTMLFormElement): AnkiFieldMappings {
    const hidden = form.querySelector<HTMLInputElement>('input[name="ankiFieldMappings"]')!;
    expect(hidden.type).toBe('hidden');
    return JSON.parse(hidden.value) as AnkiFieldMappings;
}

function ankiFieldRoleValue(form: HTMLFormElement, role: AnkiFieldMappingRole): string {
    return form.querySelector<HTMLSelectElement>(`select[data-anki-field-role="${role}"]`)!.value;
}

function savedAnkiFieldMappings(form: HTMLFormElement): AnkiFieldMappings {
    return readFormSettings(new FormData(form), DEFAULT_SETTINGS).ankiFieldMappings;
}

function legacyStoredSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): Partial<typeof DEFAULT_SETTINGS> {
    const settings: Partial<typeof DEFAULT_SETTINGS> = { ...DEFAULT_SETTINGS, ...overrides };
    delete settings.jitenApiKey;
    return settings;
}

type LegacyPitchSettings = Partial<ReaderSettings> & {
    wordHighlightMode?: 'auto' | 'status' | 'pitch' | 'off';
};

function expectFontFamilyOptions(form: HTMLFormElement, controlName: 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily', labels: {
    defaultLabel: string;
    systemLabel: string;
    customLabel: string;
    historicalLabel: string;
}): void {
    expect(form.querySelector<HTMLSelectElement>(`select[name="${controlName}"]`)).not.toBeNull();
    expect(form.querySelector<HTMLInputElement>(`input[name="${controlName}Custom"]`)).not.toBeNull();
    expect(optionText(form, controlName, DEFAULT_SETTINGS.popupFontFamily)).toBe(labels.defaultLabel);
    expect(optionText(form, controlName, DEFAULT_SETTINGS.subtitleFontFamily)).toBe(labels.systemLabel);
    expect(optionText(form, controlName, HISTORICAL_HIRAGINO_YU_GOTHIC_FONT)).toBe(labels.historicalLabel);
    expect(optionText(form, controlName, CUSTOM_FONT_FAMILY_VALUE)).toBe(labels.customLabel);
}

describe('settings help panel', () => {
    it('replaces the hosted Help link with the factory reset action', () => {
        const html = renderHelpLinksPanel();

        expect(html).toContain('data-action="factory-reset"');
        expect(html).toContain('data-help-link="factory-reset"');
        expect(html).not.toContain('data-help-link="support"');
    });

    it('marks hosted and support links with external-link icons', () => {
        const form = document.createElement('form');
        form.innerHTML = renderHelpLinksPanel();

        for (const key of ['video-player', 'pdf-reader', 'new-tab', 'docs', 'donate', 'issues', 'discord']) {
            expect(form.querySelector(`[data-help-link="${key}"] svg`)).not.toBeNull();
        }
        expect(form.querySelector('[data-help-link="factory-reset"] svg')).toBeNull();

        localizeSettingsForm(form, 'ja');

        expect(form.querySelector('[data-help-link="video-player"]')?.textContent).toContain('動画プレイヤー');
        expect(form.querySelector('[data-help-link="video-player"] svg')).not.toBeNull();
        expect(form.querySelector('[data-help-link="pdf-reader"]')?.textContent).toContain('PDFリーダー');
        expect(form.querySelector('[data-help-link="pdf-reader"] svg')).not.toBeNull();
    });

    it('does not render the removed Help glossary', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(form.querySelector('[data-settings-panel="help"] .jpdb-reader-help-glossary-card')).toBeNull();
        expect(form.querySelector('[data-help-glossary-title]')).toBeNull();
        const helpPanelText = form.querySelector('[data-settings-panel="help"]')?.textContent ?? '';
        expect(helpPanelText).not.toContain('Online Japanese vocabulary review and mining service used for lookup');
        expect(helpPanelText).not.toContain('Reading text from images');
    });
});

describe('recommended dictionary settings buttons', () => {
    it('shows Update for recommended dictionaries already present in saved settings', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
                { name: 'JPDB v2.2 Frequency Kana', alias: 'JPDB Frequency', enabled: true, priority: 1, type: 'frequency' },
            ],
        });

        expect(recommendedDictionaryButton(form, 'jitendex').textContent?.trim()).toBe('Update');
        expect(recommendedDictionaryButton(form, 'jpdbv2-kana').textContent?.trim()).toBe('Update');
    });

    it('does not treat Jitendex as the Jiten frequency dictionary', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
            ],
        });

        expect(recommendedDictionaryButton(form, 'jitendex').textContent?.trim()).toBe('Update');
        expect(recommendedDictionaryButton(form, 'jiten').textContent?.trim()).toBe('Install');
    });
});

describe('frequency dictionary preferences', () => {
    it('renders frequency dictionaries under lookup pills with toggle, reorder, and remove controls', () => {
        const form = renderSettingsTestForm(frequencySettings);
        const editor = form.querySelector<HTMLElement>('[data-frequency-lookup-pills]')!;

        const rows = Array.from(editor.querySelectorAll<HTMLElement>('[data-source-row]'));
        expect(rows.map(row => row.dataset.sourceId)).toEqual(['BCCWJ', 'Jiten', 'JPDB Freq']);
        expect(form.querySelector<HTMLElement>('[data-frequency-dictionaries]')).toBeNull();
        expect(editor.closest('.jpdb-reader-settings-subsection')?.querySelector('.jpdb-reader-local-title')?.textContent).toBe('Lookup pills');
        for (const row of rows) {
            expect(row.querySelector('[data-source-enable-toggle]')).not.toBeNull();
            expect(row.querySelector('[data-source-drag-handle]')).not.toBeNull();
            expect(row.querySelector('[data-action="dictionary-source-up"]')).not.toBeNull();
            expect(row.querySelector('[data-action="delete-yomitan-dictionary"]')).not.toBeNull();
        }
        // Frequency dictionaries are no longer duplicated as hidden inputs.
        expect(form.querySelectorAll('input[name="dictionaryPreferences.1.name"]').length).toBe(1);
    });

    it('round-trips frequency dictionary toggles and order through form read', () => {
        const form = renderSettingsTestForm(frequencySettings);
        const editor = form.querySelector<HTMLElement>('[data-frequency-lookup-pills]')!;
        const disabledToggle = editor.querySelector<HTMLInputElement>('[data-source-row][data-source-id="JPDB Freq"] [data-source-enable-toggle]')!;
        disabledToggle.checked = true;

        const saved = readFormSettings(new FormData(form), frequencySettings);
        const frequency = saved.dictionaryPreferences.filter(preference => preference.type === 'frequency');

        expect(frequency.map(preference => preference.name)).toEqual(['BCCWJ', 'Jiten', 'JPDB Freq']);
        expect(frequency.every(preference => preference.enabled)).toBe(true);
    });

    it('localizes frequency rows as lookup pills', () => {
        const form = renderSettingsTestForm(frequencySettings);
        localizeSettingsForm(form, 'ja');

        expect(settingsText(form, '[data-frequency-lookup-pills] .jpdb-reader-dictionary-head span:nth-child(2)')).toBe('検索ピル');
        expect(settingsText(form, '[data-help-key="frequencyLookupPillsHelp"]')).toContain('検索バッジ');
    });
});

describe('settings form localization', () => {
    it('searches localized settings across panels and clears back to the active tab', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja' }, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');

        applySettingsSearch(form, '音声');

        const visibleLegends = Array.from(form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-settings-panel]'))
            .filter(fieldset => !fieldset.hidden)
            .map(fieldset => fieldset.querySelector('legend')?.textContent);
        expect(visibleLegends).toContain('音声');
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-search-clear"]')).toBeNull();
        expect(form.querySelector<HTMLElement>('[data-settings-search-empty]')?.hidden).toBe(true);

        applySettingsSearch(form, 'definitely-not-a-setting');

        expect(Array.from(form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-settings-panel]')).every(fieldset => fieldset.hidden)).toBe(true);
        expect(form.querySelector<HTMLElement>('[data-settings-search-empty]')?.hidden).toBe(false);

        applySettingsSearch(form, '');

        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="appearance"]')?.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="appearance"]')?.hidden).toBe(false);
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="api"]')?.hidden).toBe(true);
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="audio"]')?.hidden).toBe(true);
    });

    it('uses roving tabs for settings sections', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const tablist = form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs')!;
        const buttons = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]'));

        expect(tablist.getAttribute('role')).toBe('tablist');
        expect(buttons.every(button => button.getAttribute('role') === 'tab')).toBe(true);
        expect(buttons.map(button => button.dataset.panel)).toEqual([
            'appearance',
            'api',
            'dictionaries',
            'media',
            'mining',
            'newTab',
            'shortcuts',
            'help',
        ]);
        expect(buttons.map(button => button.dataset.panel)).not.toContain('reading');
        expect(buttons.find(button => button.dataset.panel === 'dictionaries')?.textContent).toBe('Sources');
        expect(buttons.find(button => button.dataset.panel === 'appearance')?.getAttribute('aria-controls')).toContain('jpdb-reader-settings-panel-reader');
        expect(buttons.find(button => button.dataset.panel === 'dictionaries')?.getAttribute('aria-controls')).toContain('jpdb-reader-settings-panel-kanji');
        expect(buttons.find(button => button.dataset.panel === 'media')?.getAttribute('aria-controls')).toContain('jpdb-reader-settings-panel-audio');
        expect(buttons[0]?.getAttribute('aria-selected')).toBe('true');
        expect(buttons[0]?.tabIndex).toBe(0);
        expect(buttons.slice(1).every(button => button.getAttribute('aria-selected') === 'false' && button.tabIndex === -1)).toBe(true);
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="appearance"]')?.hidden).toBe(false);
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="api"]')?.hidden).toBe(true);
    });

    it('keeps local settings import and export separate from extension cloud sync', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const sourcesPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-dictionaries')!;
        const settingsImport = sourcesPanel.querySelector<HTMLElement>('[data-action="import-yomitan-settings"]')!;

        expect(sourcesPanel.querySelector('[data-cloud-settings-sync]')).toBeNull();
        expect(sourcesPanel.textContent).not.toContain('Google Drive settings sync');
        expect(sourcesPanel.textContent).not.toContain('cloud backup');
        expect(settingsImport).not.toBeNull();
        expect(sourcesPanel.querySelector('[data-action="export-reader-settings"]')).not.toBeNull();

        localizeSettingsForm(form, 'ja');
        expect(sourcesPanel.querySelector('[data-cloud-settings-sync]')).toBeNull();
    });

    it('gives Study settings their own top-level section', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        // UT-74: the newTabEnabled checkbox was removed (no runtime consumer;
        // a userscript cannot override the browser new tab).
        expect(form.querySelector('[name="newTabEnabled"]')).toBeNull();
        expect(topLevelLegendForControl(form, 'newTabAnkiEnabled')).toBe('Study');
        expect(topLevelLegendForControl(form, 'newTabJpdbReviewMode')).toBe('Study');
        expect(labelForControl(form, 'newTabJpdbReviewMode')).toContain('API review mode');
        expect(optionText(form, 'newTabSource', 'auto')).toBe('Auto: API/Anki, then study words');
        expect(optionText(form, 'newTabSource', 'jpdb')).toBe('API SRS (Jiten / JPDB)');
        expect(optionText(form, 'newTabKanjiKeywordSource', 'auto')).toBe('Auto: RTK, then JPDB kanji facts, then local');
        expect(optionText(form, 'newTabKanjiKeywordSource', 'jpdb')).toBe('JPDB kanji facts (Jiten / JPDB)');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="newTab"]')?.hidden).toBe(true);
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="newTab"]')).not.toBeNull();
    });

    it('splits the old Basics bucket into API, Appearance, and Sources sections', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(topLevelLegendForControl(form, 'apiCredentialJpdb')).toBe('API');
        expect(topLevelLegendForControl(form, 'accentColor')).toBe('Appearance');
        expect(topLevelLegendForControl(form, 'popupLookupEnabled')).toBe('Reader');
        expect(topLevelLegendForControl(form, 'lookupOnHover')).toBe('Reader');
        expect(form.querySelector<HTMLElement>('[name="lookupOnHover"]')?.closest<HTMLFieldSetElement>('fieldset[data-settings-panel]')?.dataset.settingsPanel).toBe('appearance');
        expect(form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-kanji')?.dataset.settingsPanel).toBe('dictionaries');
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="basics"]')).toBeNull();
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="reading"]')).toBeNull();

        activateSettingsPanel(form, 'basics');

        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="api"]')?.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="api"]')?.hidden).toBe(false);

        activateSettingsPanel(form, 'jpdb');

        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="api"]')?.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="api"]')?.hidden).toBe(false);

        activateSettingsPanel(form, 'reading');

        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="appearance"]')?.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLFieldSetElement>('#jpdb-reader-settings-panel-reader')?.hidden).toBe(false);

        activateSettingsPanel(form, 'kanji');

        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="dictionaries"]')?.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLFieldSetElement>('#jpdb-reader-settings-panel-kanji')?.hidden).toBe(false);
    });

    it('offers a single Yomu popup switch for companion-reader setups', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(checkboxValue(form, 'popupLookupEnabled')).toBe(true);
        expect(checkboxValue(form, 'parseSelection')).toBe(true);
        expect(labelForControl(form, 'parseSelection')).toContain('Selection popups');
        expect(settingsText(form, '[data-help-key="popupLookupHelp"]')).toContain('another reader');

        form.querySelector<HTMLInputElement>('input[name="parseSelection"]')!.checked = false;
        form.querySelector<HTMLInputElement>('input[name="popupLookupEnabled"]')!.checked = false;
        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.popupActivationMode).toBe('off');
        expect(saved.parseSelection).toBe(false);
        expect(saved.lookupOnClick).toBe(true);
        expect(saved.lookupOnHover).toBe(true);

        localizeSettingsForm(form, 'ja');
        expect(labelForControl(form, 'popupLookupEnabled')).toContain('よむの検索ポップアップを表示');
        expect(labelForControl(form, 'parseSelection')).toContain('選択ポップアップを表示');
        expect(settingsText(form, '[data-popup-lookup-title]')).toBe('ポップアップ検索');
    });

    it('renders and saves coexisting Jiten and JPDB API keys (UT-56)', () => {
        const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten-key' });
        const jpdbInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;
        const jitenInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJiten"]')!;

        expect(labelForControl(form, 'apiCredentialJpdb')).toContain('JPDB API key');
        expect(labelForControl(form, 'apiCredentialJiten')).toContain('Jiten API key');
        expect(jpdbInput.value).toBe('jpdb-key');
        expect(jitenInput.value).toBe('ak_jiten-key');
        expect(form.querySelector<HTMLInputElement>('input[name="apiKey"]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="jitenApiKey"]')).toBeNull();
        expect(jpdbInput.getAttribute('autocapitalize')).toBe('off');
        expect(jpdbInput.getAttribute('spellcheck')).toBe('false');
        expect(form.querySelector<HTMLAnchorElement>('a[href="https://jiten.moe/settings"]')?.textContent).toBe('Jiten settings');

        jpdbInput.value = '  next-jpdb  ';
        jitenInput.value = '';
        let saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.apiKey).toBe('next-jpdb');
        expect(saved.jitenApiKey).toBe('');

        // Both at once stay both; a jiten-prefixed key in the JPDB slot routes.
        jpdbInput.value = 'next-jpdb';
        jitenInput.value = ' ak_next-jiten ';
        saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.apiKey).toBe('next-jpdb');
        expect(saved.jitenApiKey).toBe('ak_next-jiten');

        jpdbInput.value = 'ak_misplaced';
        jitenInput.value = '';
        saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.apiKey).toBe('');
        expect(saved.jitenApiKey).toBe('ak_misplaced');

        expect(normalizeReaderSettings({ jitenApiKey: '  stored-jiten  ' }).jitenApiKey).toBe('stored-jiten');
        expect(normalizeReaderSettings({ apiKey: '  ak_legacy-jiten  ' })).toMatchObject({ apiKey: '', jitenApiKey: 'ak_legacy-jiten' });
        expect(normalizeReaderSettings({ apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten-key' })).toMatchObject({
            apiKey: 'jpdb-key',
            jitenApiKey: 'ak_jiten-key',
        });
    });

    it('moves a Jiten key (ak_) pasted into the JPDB box over to the Jiten box', () => {
        const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '' });
        const jpdbInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;
        const jitenInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJiten"]')!;

        // User pastes a Jiten key into the JPDB box.
        jpdbInput.value = 'ak_pasted-into-wrong-box';
        jitenInput.value = '';
        reconcileApiCredentialInputs(form);
        expect(jpdbInput.value).toBe('');
        expect(jitenInput.value).toBe('ak_pasted-into-wrong-box');

        // A genuine JPDB key stays in the JPDB box; reconcile is idempotent.
        jpdbInput.value = 'plain-jpdb-key';
        jitenInput.value = 'ak_pasted-into-wrong-box';
        reconcileApiCredentialInputs(form);
        expect(jpdbInput.value).toBe('plain-jpdb-key');
        expect(jitenInput.value).toBe('ak_pasted-into-wrong-box');
    });

    it('renders first-run Anki as opt-in with popover controls and no legacy scan affordances', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(DEFAULT_SETTINGS.ankiEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.ankiSectionEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.ankiMobileHandoff).toBe(false);
        expect(DEFAULT_SETTINGS.ankiMineWithJpdb).toBe(false);
        expect(DEFAULT_SETTINGS.popupMode).toBe('auto');
        expect(DEFAULT_SETTINGS.selectionPopoverShowTranslation).toBe(true);
        expect(DEFAULT_SETTINGS.furiganaMode).toBe('difficult-kanji');
        expect(DEFAULT_SETTINGS.furiganaHiddenStateGroups).toEqual(['known', 'due', 'failed']);
        expect(DEFAULT_SETTINGS.wordColorStates).toBe('all');
        expect(effectiveFuriganaMode(DEFAULT_SETTINGS)).toBe('difficult-kanji');
        expect(normalizeReaderSettings({ apiKey: '', jitenApiKey: 'ak_jiten-key', ankiEnabled: false, furiganaMode: 'auto' }).furiganaMode).toBe('known-status');
        expect(normalizeReaderSettings({}).ankiEnabled).toBe(false);
        expect(normalizeReaderSettings({}).ankiSectionEnabled).toBe(false);
        expect(normalizeReaderSettings({ ankiEnabled: true }).ankiSectionEnabled).toBe(true);
        expect(normalizeReaderSettings({ ankiEnabled: true, ankiSectionEnabled: false }).ankiSectionEnabled).toBe(false);
        expect(normalizeReaderSettings({}).ankiMobileHandoff).toBe(false);
        expect(normalizeReaderSettings({}).ankiMineWithJpdb).toBe(false);
        expect(normalizeReaderSettings({}).popupMode).toBe('auto');
        expect(normalizeReaderSettings({
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: false,
            localDictionariesEnabled: false,
            dictionarySourcesInitiallyExpanded: false,
        })).toMatchObject({
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: false,
            localDictionariesEnabled: false,
            dictionarySourcesInitiallyExpanded: false,
        });
        expect(shouldLookupAnkiStatus(DEFAULT_SETTINGS)).toBe(false);
        expect(shouldLookupAnkiStatus({ ...DEFAULT_SETTINGS, ankiSectionEnabled: true })).toBe(false);
        expect(shouldLookupAnkiStatus({ ...DEFAULT_SETTINGS, ankiEnabled: true })).toBe(true);
        expect(effectiveReaderTextColorSource(DEFAULT_SETTINGS, DEFAULT_SETTINGS.wordTextColorSource)).toBe('off');
        expect(effectiveReaderTextColorSource({ ...DEFAULT_SETTINGS, ankiSectionEnabled: true }, 'anki')).toBe('off');
        expect(effectiveReaderTextColorSource({ ...DEFAULT_SETTINGS, ankiEnabled: true }, DEFAULT_SETTINGS.wordTextColorSource)).toBe('anki');
        expect(form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')?.checked).toBe(false);
        const appearancePreset = form.querySelector<HTMLSelectElement>('select[name="appearancePreset"]')!;
        expect(Array.from(appearancePreset.options).map(option => [option.value, option.textContent])).toEqual([
            ['', 'Keep current custom settings'],
            ['balanced', 'Balanced reading'],
            ['new-only', 'Focus on new words'],
            ['underline-new', 'Minimal highlights'],
            ['no-colors', 'Plain text'],
        ]);
        expect(appearancePreset.textContent).not.toContain('Yomu default');
        expect(appearancePreset.textContent).not.toContain('Show all furigana');
        expect(appearancePreset.textContent).not.toContain('No furigana');
        expect(form.querySelector<HTMLSelectElement>('select[name="popupMode"]')?.value).toBe('auto');
        expect(form.querySelector<HTMLInputElement>('input[name="selectionPopoverShowTranslation"]')?.checked).toBe(true);
        expect(form.querySelector<HTMLInputElement>('input[name="ankiTags"]')?.value).toBe('yomu');
        expect(form.querySelector<HTMLElement>('[data-anki-tag-chips] .jpdb-reader-tag-chip')?.textContent).toContain('yomu');
        expect(form.querySelector<HTMLElement>(`[data-source-id="${ANKI_SOURCE_ID}"]`)).not.toBeNull();
        expect(form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')).toBeNull();
        expect(form.textContent).not.toContain('Scan Anki');

        const saved = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, ankiEnabled: false, popupMode: 'popover' });
        expect(saved.ankiEnabled).toBe(false);
        expect(saved.popupMode).toBe('auto');
        expect(saved.selectionPopoverShowTranslation).toBe(true);
        expect(saved.ankiTags).toBe('yomu');
    });

    it('uses a reading-friendly transcript auto-scroll resume default', () => {
        expect(DEFAULT_SETTINGS.subtitleTranscriptAutoScrollResumeSeconds).toBe(30);
        expect(normalizeReaderSettings({}).subtitleTranscriptAutoScrollResumeSeconds).toBe(30);
        expect(normalizeReaderSettings({ subtitleTranscriptAutoScrollResumeSeconds: 10 }).subtitleTranscriptAutoScrollResumeSeconds).toBe(10);
    });

    it('keeps fresh-install and factory-reset defaults mobile-safe', () => {
        const defaults = normalizeReaderSettings({});
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(defaults, 'https://jpdb.io/settings');

        expect({
            ankiEnabled: defaults.ankiEnabled,
            newTabAnkiEnabled: defaults.newTabAnkiEnabled,
            ankiMobileHandoff: defaults.ankiMobileHandoff,
            showFloatingButton: defaults.showFloatingButton,
            puckPositionX: defaults.puckPositionX,
            puckPositionY: defaults.puckPositionY,
            audioEnabled: defaults.audioEnabled,
            autoPlayAudio: defaults.autoPlayAudio,
            audioAutoPlayMode: defaults.audioAutoPlayMode,
            audioEnableDefaultSources: defaults.audioEnableDefaultSources,
            popupMode: defaults.popupMode,
        }).toEqual({
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            ankiMobileHandoff: false,
            showFloatingButton: true,
            puckPositionX: undefined,
            puckPositionY: undefined,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'all',
            audioEnableDefaultSources: true,
            popupMode: 'auto',
        });

        expect({
            ankiEnabled: checkboxValue(form, 'ankiEnabled'),
            newTabAnkiEnabled: checkboxValue(form, 'newTabAnkiEnabled'),
            ankiMobileHandoff: checkboxValue(form, 'ankiMobileHandoff'),
            showFloatingButton: checkboxValue(form, 'showFloatingButton'),
            audioEnabled: checkboxValue(form, 'audioEnabled'),
            autoPlayAudio: checkboxValue(form, 'autoPlayAudio'),
            audioEnableDefaultSources: checkboxValue(form, 'audioEnableDefaultSources'),
            audioAutoPlayMode: selectValue(form, 'audioAutoPlayMode'),
            popupMode: selectValue(form, 'popupMode'),
        }).toEqual({
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            ankiMobileHandoff: false,
            showFloatingButton: true,
            audioEnabled: true,
            autoPlayAudio: true,
            audioEnableDefaultSources: true,
            audioAutoPlayMode: 'all',
            popupMode: 'auto',
        });
    });

    it('normalizes saved lookup links so Jiten stays before JPDB', () => {
        const defaultIds = normalizeReaderSettings({}).dictionaryLookupLinks.map(link => link.id);
        expect(defaultIds.slice(0, 3)).toEqual(['jiten', 'jpdb', 'yomu-search']);

        const defaultLinks = new Map(DEFAULT_SETTINGS.dictionaryLookupLinks.map(link => [link.id, link]));
        const staleJpdbFirstOrder = [
            'jpdb',
            'jisho',
            'copy',
            'yomu-search',
            'jiten',
            'weblio',
            'goo',
            'kotobank',
            'takoboto',
            'wiktionary-ja',
            'immersion-kit',
            'uchisen',
        ];
        const migrated = normalizeReaderSettings({
            dictionaryLookupLinks: staleJpdbFirstOrder.map(id => id === 'goo'
                ? { id: 'goo', label: 'goo', urlTemplate: 'https://dictionary.goo.ne.jp/srch/all/{query}/m0u/', enabled: false }
                : { ...defaultLinks.get(id)! }),
        });
        expect(migrated.dictionaryLookupLinks.slice(0, 3).map(link => link.id)).toEqual(['jiten', 'jpdb', 'yomu-search']);
        expect(migrated.dictionaryLookupLinks.map(link => link.id)).not.toContain('goo');

        const custom = normalizeReaderSettings({
            dictionaryLookupLinks: [
                { ...defaultLinks.get('jpdb')! },
                { id: 'custom-search', label: 'Custom', urlTemplate: 'https://example.com/?q={query}', enabled: true },
                { ...defaultLinks.get('jiten')! },
            ],
        });
        expect(custom.dictionaryLookupLinks.map(link => link.id).indexOf('jiten')).toBeLessThan(
            custom.dictionaryLookupLinks.map(link => link.id).indexOf('jpdb'),
        );
    });

    it('keeps scan shortcuts configurable while preserving stored scan behavior', () => {
        const current = {
            ...DEFAULT_SETTINGS,
            ocrAutoScanImages: false,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                scanPage: 'Ctrl+J',
                scanImages: 'Ctrl+I',
            },
        };
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');

        expect(form.querySelector<HTMLInputElement>('input[name="ocrAutoScanImages"]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="shortcuts.scanPage"]')?.value).toBe('Ctrl+J');
        expect(form.textContent).not.toContain('Read images automatically');
        expect(topLevelLegendForControl(form, 'shortcuts.scanPage')).toBe('Shortcuts');

        const saved = readFormSettings(new FormData(form), current);
        expect(saved.ocrAutoScanImages).toBe(false);
        expect(saved.shortcuts.scanPage).toBe('Ctrl+J');
        expect(saved.shortcuts.scanImages).toBe('Ctrl+I');
    });

    it('omits the old paused-frame OCR status card setting', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(form.querySelector<HTMLInputElement>('input[name="ocrVideoFrameStatusCard"]')).toBeNull();
        expect(form.textContent).not.toContain('Show paused-frame status card');

        const data = new FormData(form);
        data.set('ocrVideoFrameStatusCard', 'on');
        const saved = readFormSettings(data, DEFAULT_SETTINGS);
        expect(saved).not.toHaveProperty('ocrVideoFrameStatusCard');
    });

    it('migrates only legacy-default-looking Anki settings away from noisy mobile defaults', () => {
        const migrated = normalizeReaderSettings(legacyStoredSettings({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiMobileHandoff: true,
            ankiMineWithJpdb: true,
            newTabAnkiEnabled: true,
        }));

        expect(migrated.ankiEnabled).toBe(false);
        expect(migrated.ankiSectionEnabled).toBe(false);
        expect(migrated.ankiMobileHandoff).toBe(false);
        expect(migrated.ankiMineWithJpdb).toBe(false);
        expect(migrated.newTabAnkiEnabled).toBe(false);

        const currentDeliberate = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiMobileHandoff: true,
            ankiMineWithJpdb: true,
            newTabAnkiEnabled: true,
        });
        expect(currentDeliberate.ankiEnabled).toBe(true);
        expect(currentDeliberate.ankiSectionEnabled).toBe(true);
        expect(currentDeliberate.ankiMobileHandoff).toBe(true);
        expect(currentDeliberate.ankiMineWithJpdb).toBe(true);
        expect(currentDeliberate.newTabAnkiEnabled).toBe(true);

        const customLegacyAnki = normalizeReaderSettings(legacyStoredSettings({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiMobileHandoff: true,
            ankiMineWithJpdb: true,
            ankiDeck: 'Mining',
            newTabAnkiEnabled: true,
        }));
        expect(customLegacyAnki.ankiEnabled).toBe(true);
        expect(customLegacyAnki.ankiSectionEnabled).toBe(true);
        expect(customLegacyAnki.ankiMobileHandoff).toBe(true);
        expect(customLegacyAnki.ankiMineWithJpdb).toBe(true);
        expect(customLegacyAnki.newTabAnkiEnabled).toBe(false);

        const customLegacyUrl = normalizeReaderSettings(legacyStoredSettings({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiMobileHandoff: true,
            ankiMineWithJpdb: true,
            ankiConnectUrl: 'http://100.64.1.2:8765',
        }));
        expect(customLegacyUrl.ankiEnabled).toBe(true);
        expect(customLegacyUrl.ankiMobileHandoff).toBe(true);

        const customLegacyMappings = normalizeReaderSettings(legacyStoredSettings({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiMobileHandoff: true,
            ankiMineWithJpdb: true,
            ankiFieldMappings: {
                Custom: { expression: 'Word' },
            },
        }));
        expect(customLegacyMappings.ankiEnabled).toBe(true);
        expect(customLegacyMappings.ankiMobileHandoff).toBe(true);

        const customLegacyNewTab = normalizeReaderSettings(legacyStoredSettings({
            newTabEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
        }));
        expect(customLegacyNewTab.newTabAnkiEnabled).toBe(true);
    });

    it('migrates legacy double-pitch highlights without clobbering explicit current choices', () => {
        const legacyWordHighlightMode = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            wordHighlightMode: 'pitch',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        } as LegacyPitchSettings);

        expect(legacyWordHighlightMode.wordHighlightColorSource).toBe(DEFAULT_SETTINGS.wordHighlightColorSource);
        expect(legacyWordHighlightMode.wordUnderlineColorSource).toBe('pitch');
        expect(legacyWordHighlightMode.subtitleHighlightColorSource).toBe(DEFAULT_SETTINGS.subtitleHighlightColorSource);
        expect(legacyWordHighlightMode.subtitleUnderlineColorSource).toBe('pitch');
        expect(Object.prototype.hasOwnProperty.call(legacyWordHighlightMode, 'wordHighlightMode')).toBe(false);

        const legacyDoublePitchPair = normalizeReaderSettings(legacyStoredSettings({
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        }));

        expect(legacyDoublePitchPair.wordHighlightColorSource).toBe(DEFAULT_SETTINGS.wordHighlightColorSource);
        expect(legacyDoublePitchPair.wordUnderlineColorSource).toBe('pitch');
        expect(legacyDoublePitchPair.subtitleHighlightColorSource).toBe(DEFAULT_SETTINGS.subtitleHighlightColorSource);
        expect(legacyDoublePitchPair.subtitleUnderlineColorSource).toBe('pitch');

        const currentPitchChoice = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        });

        expect(currentPitchChoice.wordHighlightColorSource).toBe('pitch');
        expect(currentPitchChoice.wordUnderlineColorSource).toBe('pitch');
        expect(currentPitchChoice.subtitleHighlightColorSource).toBe('pitch');
        expect(currentPitchChoice.subtitleUnderlineColorSource).toBe('pitch');
    });

    it('keeps hover lookup timing with Reader settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');

        expect(topLevelLegendsForControl(form, 'shortcuts.hoverLookup')).toEqual(['リーダー', 'ショートカット']);
        expect(Array.from(form.querySelectorAll<HTMLInputElement>('input[name="shortcuts.hoverLookup"]')).map(input =>
            input.closest('label')?.textContent?.trim(),
        )).toEqual(['ホバー中に押すキー', 'ホバー中に押すキー']);
        expect(topLevelLegendForControl(form, 'hoverOpenDelayMs')).toBe('リーダー');
        expect(form.querySelector<HTMLElement>('[data-hover-lookup-title]')?.textContent).toBe('ホバー検索');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="shortcuts"]')?.textContent).not.toContain('Hover open delay');
    });

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

    it('keeps pitch accent color controls with Reader pitch settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(topLevelLegendForControl(form, 'showPitchAccent')).toBe('Reader');
        expect(topLevelLegendForControl(form, 'pitchColorHeiban')).toBe('Reader');
    });

    it('keeps diagnostic logging out of the Interface panel', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');

        expect(topLevelLegendForControl(form, 'enableLogging')).toBe('ヘルプ');
        expect(labelForControl(form, 'enableLogging')).toContain('診断ログ');
        expect(form.querySelector<HTMLElement>('[data-diagnostics-title]')?.textContent).toBe('診断');
        expect(form.querySelector<HTMLElement>('[data-diagnostics-help]')?.textContent).toContain('コンソール');
    });

    it('localizes keyed legends and help without relying on fieldset order', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const scroll = form.querySelector<HTMLElement>('.jpdb-reader-settings-scroll')!;
        const audio = form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="audio"]')!;
        scroll.insertBefore(audio, scroll.firstElementChild);

        localizeSettingsForm(form, 'ja');

        expect(audio.querySelector('legend')?.textContent).toBe('音声');
        expect(audio.querySelector<HTMLElement>('[data-help-key="audioHelp"]')?.textContent).toContain('{term}');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="api"] legend')?.textContent).toBe('API');
        expect(form.querySelector<HTMLElement>('[data-help-key="readerHelp"]')?.textContent).toContain('通常ホバー');
    });

    it('links major help text to the fieldsets it describes', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        for (const key of ['audio', 'immersionKit', 'reader', 'images', 'youTube', 'anki']) {
            const fieldset = form.querySelector<HTMLFieldSetElement>(`fieldset[data-legend-key="${key}"]`)!;
            const describedby = fieldset.getAttribute('aria-describedby');
            expect(describedby).toBeTruthy();
            expect(form.querySelector(`#${describedby}`)).not.toBeNull();
        }
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="kanji"]')?.getAttribute('aria-describedby')).toBeNull();
    });

    it('keeps checked checkbox and radio marks visible on hover', () => {
        const normalizedCss = SETTINGS_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:enabled:hover, .jpdb-reader-settings input[type="radio"]:enabled:hover { border-color: var(--jpdb-reader-accent) !important;');
        expect(normalizedCss).toContain('box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft);');
        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:checked, .jpdb-reader-settings input[type="radio"]:checked { border-color: var(--jpdb-reader-accent) !important; background-color: var(--jpdb-reader-accent) !important; box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft); }');
        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:checked:enabled:hover, .jpdb-reader-settings input[type="radio"]:checked:enabled:hover { background-color: var(--jpdb-reader-accent) !important; }');
        expect(normalizedCss).toContain('border-left: 2.5px solid var(--jpdb-reader-accent-text); border-bottom: 2.5px solid var(--jpdb-reader-accent-text);');
        expect(normalizedCss).toContain('background: var(--jpdb-reader-accent-text);');
        expect(normalizedCss).toContain('@media (pointer: coarse) and (min-width: 700px) and (max-width: 900px)');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
        expect(normalizedCss).toContain('.jpdb-reader-settings-tabs { flex-wrap: wrap; overflow-x: visible; }');
        expect(normalizedCss).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); align-items: stretch;');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-settings-tgrid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr)); gap: 8px 14px; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-settings-cgrid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 225px), 1fr)); gap: 12px 14px; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid > label:not(.inline) { display: flex; flex-direction: column;');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid > label:not(.inline) > .jpdb-reader-settings-label-text:has(.jpdb-reader-has-furi) { min-height: 0; display: block; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-settings-cgrid > label:not(.inline) > .jpdb-reader-settings-label-text, .jpdb-reader-settings .jpdb-reader-settings-cgrid > * > label:not(.inline) > .jpdb-reader-settings-label-text { min-height: 0; display: block; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid > label.inline { align-self: end; margin: 0; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid:has(> label:not(.inline)) > label.inline { align-self: start; margin-top: 28px; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-settings-tgrid > label.inline { align-self: start; align-items: center; min-height: 38px; margin-top: 0; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-settings-cgrid > label.inline { align-self: start; align-items: center; min-height: 38px; margin-top: 28px; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-color-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid > [data-sticky-bottom-sheet-field] { display: flex; align-items: flex-start; padding-top: 36px; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid > .jpdb-reader-settings-field-color > input[type="color"] { width: 100%; min-width: 0; height: 40px;');
        expect(normalizedCss).toContain('.jpdb-reader-settings :is(ruby, rt, .jpdb-reader-furi) { color: var(--jpdb-reader-text) !important; line-height: 1; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-help-actions .jpdb-reader-help-donate { border-color: var(--jpdb-reader-accent) !important; background: var(--jpdb-reader-accent) !important;');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-status-checklist { display: flex; flex-wrap: wrap;');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-status-checklist a { color: var(--jpdb-reader-accent-readable);');
        expect(normalizedCss).toContain('.jpdb-reader-settings-appearance-preview .jpdb-reader-word {');
        expect(normalizedCss).toContain('color: var( --jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, currentColor) ) !important;');
        expect(normalizedCss).toContain('.jpdb-reader-settings-appearance-preview { min-height: 170px;');
        expect(normalizedCss).toContain('display: flex; flex-wrap: wrap; align-items: center; justify-content: center; align-content: center; min-width: 0; overflow-wrap: anywhere; word-break: normal; text-align: center; font-size: 28px; line-height: 1.48;');
        expect(normalizedCss).toContain('.jpdb-reader-settings-appearance-preview-line { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; width: 100%; max-width: min(100%, 36em); min-width: 0; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings-appearance-preview-line .jpdb-reader-word { display: inline-block !important; width: auto !important; max-width: none !important; vertical-align: baseline; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings-appearance-preview .jpdb-reader-word.jpdb-reader-has-furi { line-height: 1.28; }');
        expect(normalizedCss).toContain('.jpdb-reader-audio-source-choice .jpdb-reader-icon-mini { grid-column: 2; grid-row: 1; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings select + .jpdb-reader-control-text-mirror { display: block; max-width: 100%; margin-inline-start: 0;');
        expect(normalizedCss).toContain('.jpdb-reader-audio-source-choice > .jpdb-reader-control-text-mirror { grid-column: 1 / -1; }');
    });

    it('groups media settings into compact toggle and control grids', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);

        const audioPanel = form.querySelector<HTMLElement>('[data-legend-key="audio"]')!;
        const audioToggleGrid = audioPanel.querySelector<HTMLElement>('.jpdb-reader-settings-tgrid')!;
        const audioControlGrid = audioPanel.querySelector<HTMLElement>('.jpdb-reader-settings-cgrid')!;

        expect(audioToggleGrid.querySelector('input[name="audioEnabled"]')).not.toBeNull();
        expect(audioToggleGrid.querySelector('select[name="audioAutoPlayMode"]')).toBeNull();
        expect(audioControlGrid.querySelector('select[name="audioAutoPlayMode"]')).not.toBeNull();
        expect(audioControlGrid.querySelector('input[name="corsProxyUrl"]')).not.toBeNull();

        const immersionPanel = form.querySelector<HTMLElement>('[data-legend-key="immersionKit"]')!;
        const immersionGrids = Array.from(immersionPanel.querySelectorAll<HTMLElement>('.jpdb-reader-settings-tgrid, .jpdb-reader-settings-cgrid'));

        expect(immersionGrids[0]?.classList.contains('jpdb-reader-settings-tgrid')).toBe(true);
        expect(immersionGrids[0]?.querySelector('input[name="immersionKitEnabled"]')).not.toBeNull();
        expect(immersionGrids[1]?.classList.contains('jpdb-reader-settings-cgrid')).toBe(true);
        expect(immersionGrids[1]?.querySelector('select[name="immersionKitExampleSource"]')).not.toBeNull();
        expect(immersionGrids[1]?.querySelector('select[name="immersionKitSort"]')).not.toBeNull();
        expect(immersionGrids[2]?.querySelector('input[name="immersionKitPlayOnImageClick"]')).not.toBeNull();
    });

    it('keeps inline settings link icons from expanding into content', () => {
        const normalizedCss = SETTINGS_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-reader-settings a:not(.jpdb-reader-btn) svg { display: inline-block; width: 0.95em; height: 0.95em;');
        expect(normalizedCss).toContain('fill: none; stroke: currentColor; stroke-width: 2.2;');
        expect(normalizedCss).toContain('stroke-linecap: round; stroke-linejoin: round; vertical-align: -0.12em;');
    });

    it('keeps mobile settings text controls at iOS no-zoom size after base input styling', () => {
        const normalizedCss = SETTINGS_CSS.replace(/\s+/g, ' ');
        const baseControlFontIndex = normalizedCss.indexOf('.jpdb-reader-settings input, .jpdb-reader-settings select, .jpdb-reader-settings textarea, .jpdb-reader-field-display');
        const noZoomFontIndex = normalizedCss.indexOf('@media (hover: none), (pointer: coarse) { .jpdb-reader-settings input:not([type="checkbox"]):not([type="radio"]):not([type="color"]), .jpdb-reader-settings select, .jpdb-reader-settings textarea { font-size: max(16px, 1em) !important; } }');

        expect(baseControlFontIndex).toBeGreaterThanOrEqual(0);
        expect(noZoomFontIndex).toBeGreaterThan(baseControlFontIndex);
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-tag-chip-list, .jpdb-reader-settings .jpdb-reader-tag-add-row { display: flex; flex-wrap: wrap;');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-tag-chip:hover, .jpdb-reader-settings .jpdb-reader-tag-chip:focus-visible { border-color: var(--jpdb-reader-accent);');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-tag-add-row input, .jpdb-reader-settings .jpdb-reader-tag-add-row .jpdb-reader-btn { flex-basis: 100%; }');
    });

    it('keeps mobile source editor row controls in a side rail', () => {
        const normalizedCss = SETTINGS_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-reader-dictionary-row { grid-template-columns: 44px minmax(0, 1fr) 73px; align-items: start; }');
        expect(normalizedCss).toContain('.jpdb-reader-dictionary-row > .jpdb-reader-row-order-tools { grid-column: 3; grid-row: 1 / span 2; align-self: start; align-content: flex-start; justify-content: flex-end; width: 73px; min-width: 73px; max-width: 73px; }');
        expect(normalizedCss).toContain('.jpdb-reader-audio-source-row, .jpdb-reader-lookup-link-row { grid-template-columns: 44px minmax(0, 1fr) 73px; align-items: start; }');
        expect(normalizedCss).toContain('.jpdb-reader-audio-source-row .jpdb-reader-row-order-tools, .jpdb-reader-lookup-link-row .jpdb-reader-row-order-tools { grid-column: 3; grid-row: 1 / span 2; align-self: start; align-content: flex-start; justify-content: flex-end; width: 73px; min-width: 73px; max-width: 73px; }');
        expect(normalizedCss).toContain('.jpdb-reader-audio-source-row .jpdb-reader-row-remove-tools, .jpdb-reader-lookup-link-row .jpdb-reader-row-remove-tools { grid-column: 3; grid-row: 1; align-self: start; justify-content: flex-end; width: 73px; min-width: 73px; max-width: 73px; }');
        expect(normalizedCss).toContain('.jpdb-reader-order-row .jpdb-reader-row-order-tools { display: grid; grid-template-columns: 34px 34px; grid-template-rows: 34px 34px; gap: 5px; }');
        expect(normalizedCss).toContain('.jpdb-reader-order-row .jpdb-reader-row-order-tools [data-action$="-up"] { grid-column: 1; grid-row: 1; }');
        expect(normalizedCss).toContain('.jpdb-reader-order-row .jpdb-reader-row-order-tools [data-action$="-down"] { grid-column: 1; grid-row: 2; }');
        expect(normalizedCss).toContain('.jpdb-reader-order-row .jpdb-reader-row-order-tools [data-source-drag-handle] { grid-column: 2; grid-row: 2; }');
        expect(normalizedCss).toContain('@media (max-width: 380px) { .jpdb-reader-order-row { grid-template-columns: 44px minmax(0, 1fr) 73px; gap: 5px;');
        expect(normalizedCss).toContain('.jpdb-reader-order-row .jpdb-reader-row-tools { gap: 5px; width: 73px; min-width: 73px; max-width: 73px; }');
        expect(normalizedCss).toContain('.jpdb-reader-order-row .jpdb-reader-row-remove-tools { grid-column: 3; grid-row: 1; align-self: start; justify-content: flex-end; }');
    });

    it('keeps lookup link editor columns aligned on wider settings layouts', () => {
        const normalizedCss = SETTINGS_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-reader-lookup-link-head, .jpdb-reader-lookup-link-row { grid-template-columns: 56px minmax(110px, 0.8fr) minmax(220px, 1.2fr) 73px 42px; }');
        expect(normalizedCss).toContain('.jpdb-reader-lookup-link-head, .jpdb-reader-lookup-link-row { grid-template-columns: 52px minmax(110px, 0.8fr) minmax(220px, 1.2fr) 73px 42px; }');
    });

    it('keeps hosted settings companions lazy while preserving settings warmup', () => {
        const normalizedTheme = DOCS_THEME_SOURCE.replace(/\s+/g, ' ');

        expect(normalizedTheme).toContain('function warmHostedSettingsRuntime(): HTMLScriptElement[] { const forceLocalRuntime = isLocalHostedRuntime(); const settings = appendHostedSettingsCompanionScript(forceLocalRuntime); const core = loadHostedYomuRuntime(); return [settings, core].filter(isHostedRuntimeScriptElement); }');
        expect(normalizedTheme).toContain('function prepareHostedYomuRuntime(): void { const forceLocalRuntime = isLocalHostedRuntime(); prepareHostedMangaOcrDemo(); if (shouldLoadHostedRuntimeCompanionsBeforeCore()) appendHostedRuntimeCompanionScripts(forceLocalRuntime); if (isHostedYomuRuntimeLoadingOrReady(forceLocalRuntime)) return;');
        expect(normalizedTheme).toContain('function shouldLoadHostedRuntimeCompanionsBeforeCore(): boolean { return location.pathname.includes(\'/video-player/\') || Boolean(document.querySelector(\'[data-yomu-video-frame]\')); }');
        expect(normalizedTheme).toContain('if (!companionFirst) appendHostedSettingsCompanionAfterCoreLoad(script, forceLocalRuntime);');
    });

    it('shows Immersion Kit reveal audio autoplay enabled by default', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const toggle = form.querySelector<HTMLInputElement>('input[name="immersionKitAutoPlayAudio"]');

        expect(DEFAULT_SETTINGS.immersionKitAutoPlayAudio).toBe(true);
        expect(toggle?.checked).toBe(true);
        expect(toggle?.closest('label')?.textContent).toContain('reveal');
    });

    it('places auto-play trigger under the auto-play toggle and disables it when off', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, autoPlayAudio: false, audioAutoPlayMode: 'hover' }, 'https://jpdb.io/settings');
        const toggle = form.querySelector<HTMLInputElement>('input[name="autoPlayAudio"]')!;
        const select = form.querySelector<HTMLSelectElement>('select[name="audioAutoPlayMode"]')!;
        const timeout = form.querySelector<HTMLInputElement>('input[name="audioTimeoutMs"]')!;
        const proxyUrl = form.querySelector<HTMLInputElement>('input[name="corsProxyUrl"]')!;

        expect(toggle.checked).toBe(false);
        expect(toggle.closest('label')?.nextElementSibling).toBe(select.closest('label'));
        expect(optionText(form, 'audioAutoPlayMode', 'off')).toBe('');
        expect(select.disabled).toBe(true);
        expect(select.value).toBe('hover');
        expect(timeout.min).toBe('1000');
        expect(timeout.max).toBe('30000');
        expect(timeout.step).toBe('500');
        expect(proxyUrl.placeholder).toBe('https://your-worker.workers.dev');

        let saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.autoPlayAudio).toBe(false);
        expect(saved.audioAutoPlayMode).toBe('hover');

        toggle.checked = true;
        select.disabled = false;
        select.value = 'tap';
        timeout.value = '99999';
        saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.autoPlayAudio).toBe(true);
        expect(saved.audioAutoPlayMode).toBe('tap');
        expect(saved.audioTimeoutMs).toBe(30000);
    });

    it('renders ready JPDB and disabled Anki status lights in settings', () => {
        const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', ankiEnabled: false });
        const jpdbStatus = settingsText(form, '[data-jpdb-status]');
        const ankiStatus = settingsText(form, '[data-anki-status]');

        expect(settingsTone(form, '[data-jpdb-status]')).toBe('success');
        expect(jpdbStatus).toContain('Ready:');
        expect(jpdbStatus).toContain('JPDB key set');
        expect(jpdbStatus).not.toContain('Reviews:');
        expect(jpdbStatus).not.toContain('Deck changes:');
        expect(settingsTone(form, '[data-anki-status]')).toBe('pending');
        expect(ankiStatus).toContain('Anki mining disabled');
        expect(ankiStatus).not.toContain('Mobile Anki handoff');
        expect(ankiStatus).not.toContain('Full Anki features use desktop AnkiConnect');
    });

    it('keeps the JPDB status focused on the key when review actions are disabled', () => {
        const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', enableReviews: false, jpdbMiningEnabled: false });
        const jpdbStatus = settingsText(form, '[data-jpdb-status]');

        expect(settingsTone(form, '[data-jpdb-status]')).toBe('success');
        expect(jpdbStatus).toContain('Ready:');
        expect(jpdbStatus).toContain('JPDB key set');
        expect(jpdbStatus).not.toContain('Reviews:');
        expect(jpdbStatus).not.toContain('Deck changes:');
    });

    it('renders ready API status when only the Jiten key is set', () => {
        const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'ak_jiten-key' });
        const apiStatus = settingsText(form, '[data-jpdb-status]');

        expect(settingsTone(form, '[data-jpdb-status]')).toBe('success');
        expect(apiStatus).toContain('Ready:');
        expect(apiStatus).toContain('Jiten key set');
        expect(apiStatus).not.toContain('JPDB-backed cards need a JPDB key');
        expect(form.querySelector<HTMLElement>('[data-jiten-status]')).toBeNull();
    });

    it('keeps Jiten kanji source help distinct after localization', () => {
        const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'ak_jiten-key' });
        const bothKeysForm = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten-key' });

        localizeSettingsForm(form, 'en');
        localizeSettingsForm(bothKeysForm, 'en');

        expect(settingsText(form, '[data-source-id="__kanji_stroke__"] .jpdb-reader-dictionary-row-help')).toBe('Stroke order preview and drawing pad.');
        expect(settingsText(form, '[data-source-id="__kanji_jpdb__"] .jpdb-reader-dictionary-row-help')).toBe('Jiten kanji facts, frequency, readings, words.');
        expect(settingsText(bothKeysForm, '[data-source-id="__kanji_jpdb__"] .jpdb-reader-dictionary-row-help')).toBe('Jiten kanji facts, frequency, readings, words.');
        expect(form.querySelector('[data-source-id="__kanji_similar_words__"]')).toBeNull();
        expect(form.textContent).not.toContain('Related vocabulary');
        expect(form.textContent).not.toContain('Words using this kanji');
        expect(orderedKanjiSourceIds({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'ak_jiten-key', similarKanjiWords: true })).not.toContain(KANJI_SIMILAR_WORDS_SOURCE_ID);
    });

    it('removes redundant Kanji detail controls while preserving saved detail settings', () => {
        const current = {
            ...DEFAULT_SETTINGS,
            kanjiOriginKanjiMapEnabled: false,
            kanjiOriginGraphEnabled: false,
            kanjiOriginRadicalImagesEnabled: false,
            similarKanjiWordLimit: 11,
        };
        const form = renderSettingsTestForm(current);
        const kanjiPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-kanji')!;

        expect(kanjiPanel.dataset.settingsPanel).toBe('dictionaries');
        expect(kanjiPanel.textContent).not.toContain('Show kanji facts and component graph');
        expect(kanjiPanel.textContent).not.toContain('Show component graph');
        expect(kanjiPanel.textContent).not.toContain('Show radical images');
        expect(kanjiPanel.textContent).not.toContain('Similar word limit');
        expect(kanjiPanel.querySelector('input[name="similarKanjiWordLimit"]')?.getAttribute('type')).toBe('hidden');
        expect(readFormSettings(new FormData(form), current)).toMatchObject({
            kanjiOriginKanjiMapEnabled: false,
            kanjiOriginGraphEnabled: false,
            kanjiOriginRadicalImagesEnabled: false,
            similarKanjiWordLimit: 11,
        });
    });

    it('renders pending JPDB status when the API key is missing', () => {
        const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, apiKey: '' });
        const jpdbStatus = settingsText(form, '[data-jpdb-status]');

        expect(settingsTone(form, '[data-jpdb-status]')).toBe('pending');
        expect(jpdbStatus).toContain('Needs setup:');
        expect(jpdbStatus).toContain('No Jiten or JPDB key');
        expect(jpdbStatus).not.toContain('Public lookup works');
        expect(form.querySelector<HTMLElement>('[data-jiten-status]')).toBeNull();
    });

    it('programmatically describes disabled dependent controls', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, jpdbMiningEnabled: false }, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'en');

        const dependent = form.querySelector<HTMLInputElement>('input[name="addToForq"]')!;
        const descriptionId = dependent.getAttribute('aria-describedby') ?? '';
        const description = form.querySelector<HTMLElement>('#jpdb-reader-disabled-control-description');

        expect(dependent.disabled).toBe(true);
        expect(descriptionId.split(/\s+/)).toContain('jpdb-reader-disabled-control-description');
        expect(description?.textContent).toContain('Controlled by another setting');
    });

    it('shows AnkiConnect and library availability in the Anki settings panel', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiConnectUrl: 'http://192.168.1.8:8765',
            ankiMobileHandoff: false,
        }, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'en');
        const status = form.querySelector<HTMLElement>('[data-anki-status]')!;
        const adapter = form.querySelector<HTMLElement>('[data-anki-library-availability]')!;

        expect(status.closest('.jpdb-reader-settings-wide')).not.toBeNull();
        expect(status.querySelector<HTMLElement>('.jpdb-reader-status-main')?.textContent).toContain('Checking AnkiConnect at http://192.168.1.8:8765');
        expect(status.querySelector('.jpdb-reader-status-checklist')).toBeNull();
        expect(status.textContent).toContain('Checking AnkiConnect at http://192.168.1.8:8765');
        expect(status.textContent).not.toContain('Mobile Anki handoff');
        expect(status.textContent).not.toContain('Full Anki features use desktop AnkiConnect');
        expect(adapter.textContent).toContain('Scans decks/types and suggests mappings.');
        const help = form.querySelector<HTMLElement>('[data-anki-setup-help]')!;
        const helpLink = help.querySelector<HTMLAnchorElement>('a[href="https://ankiweb.net/shared/info/2055492159"]');
        const docsLink = help.querySelector<HTMLAnchorElement>('a[href$="getting-started#use-desktop-anki-from-a-phone-ipad-or-android"]');
        expect(helpLink?.textContent).toContain('Open AnkiConnect add-on');
        expect(docsLink?.textContent).toContain('Mobile Anki setup docs');
        expect(help.textContent).toContain('Full Anki uses AnkiConnect. Handoff creates notes.');
        expect(help.textContent).not.toContain('webCorsOriginList');
        expect(form.textContent).not.toContain('Scan Anki to choose from your decks and note types');
    });

    it('exposes combined JPDB and Anki status as a word color source', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            wordTextColorSource: 'status',
        }, 'https://jpdb.io/settings');

        const textColor = form.querySelector<HTMLSelectElement>('select[name="wordTextColorSource"]')!;
        expect(optionText(form, 'wordTextColorSource', 'status')).toBe('JPDB + Anki status');
        expect(textColor.value).toBe('status');
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).wordTextColorSource).toBe('status');

        localizeSettingsForm(form, 'ja');
        expect(optionText(form, 'wordTextColorSource', 'status')).toContain('Anki');

        const jitenForm = document.createElement('form');
        jitenForm.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'ak_jiten-key',
            wordHighlightColorSource: 'jpdb',
            wordTextColorSource: 'status',
        }, 'https://jpdb.io/settings');

        expect(optionText(jitenForm, 'wordTextColorSource', 'status')).toBe('Jiten + Anki status');
        expect(optionText(jitenForm, 'wordHighlightColorSource', 'jpdb')).toBe('Jiten status');
        expect(optionText(jitenForm, 'newTabKanjiKeywordSource', 'auto')).toBe('Auto: RTK, then Jiten kanji facts, then local');
        expect(optionText(jitenForm, 'newTabKanjiKeywordSource', 'jpdb')).toBe('Jiten kanji facts (Jiten / JPDB)');
        expect(labelForControl(jitenForm, 'jpdbDefinitionsEnabled')).toBe('');
        expect(labelForControl(jitenForm, 'localDictionariesEnabled')).toBe('');
        expect(labelForControl(jitenForm, 'dictionarySourcesInitiallyExpanded')).toBe('');
        expect(labelForControl(jitenForm, 'localDictionaryMaxResults')).toBe('');
    });

    it('keeps subtitle preview color classes and status regions accessible', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'pitch',
            subtitleTextColorSource: 'anki',
        }, 'https://jpdb.io/settings');

        syncSubtitlePreview(form);

        const preview = form.querySelector<HTMLElement>('[data-subtitle-preview]')!;
        const previewWords = Array.from(preview.querySelectorAll<HTMLElement>('[data-settings-preview-lookup]'));
        const dictionaryStatus = form.querySelector<HTMLElement>('[data-dictionary-status]')!;
        expect(preview.classList.contains('jpdb-reader-subtitle-highlight-status')).toBe(true);
        expect(preview.classList.contains('jpdb-reader-subtitle-underline-pitch')).toBe(true);
        expect(preview.classList.contains('jpdb-reader-subtitle-text-anki')).toBe(true);
        expect(previewWords.length).toBeGreaterThan(0);
        expect(previewWords.every(word => word.tabIndex === -1)).toBe(true);
        expect(dictionaryStatus.getAttribute('role')).toBe('status');
        expect(dictionaryStatus.getAttribute('aria-live')).toBe('polite');
    });

    it('exposes video-safe autoplay and popover dimming settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const videoAudio = form.querySelector<HTMLInputElement>('input[name="suppressAutoAudioOnVideo"]')!;
        const backdrop = form.querySelector<HTMLInputElement>('input[name="popoverBackdropEnabled"]')!;
        const selectionTranslation = form.querySelector<HTMLInputElement>('input[name="selectionPopoverShowTranslation"]')!;

        expect(DEFAULT_SETTINGS.suppressAutoAudioOnVideo).toBe(true);
        expect(DEFAULT_SETTINGS.popoverBackdropEnabled).toBe(true);
        expect(videoAudio.checked).toBe(true);
        expect(backdrop.checked).toBe(true);
        expect(selectionTranslation.checked).toBe(true);

        videoAudio.checked = false;
        backdrop.checked = false;
        selectionTranslation.checked = false;

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.suppressAutoAudioOnVideo).toBe(false);
        expect(saved.popoverBackdropEnabled).toBe(false);
        expect(saved.selectionPopoverShowTranslation).toBe(false);
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
        });
        expectFontFamilyOptions(form, 'popupFontFamily', {
            defaultLabel: 'Built-in font',
            systemLabel: 'System UI',
            customLabel: 'Custom...',
            historicalLabel: 'Hiragino / Yu Gothic',
        });
        expectFontFamilyOptions(form, 'subtitleFontFamily', {
            defaultLabel: 'Built-in font',
            systemLabel: 'System UI',
            customLabel: 'Custom...',
            historicalLabel: 'Hiragino / Yu Gothic',
        });
        expect(subtitleFontFamily.value).toBe(DEFAULT_SETTINGS.subtitleFontFamily);
        expect(fontWeight.value).toBe('400');
        expect(pausePanel.checked).toBe(false);
        expect(form.querySelector('select[name="subtitleTranscriptPlacement"]')).toBeNull();
        expect(previousWord.value).toBe('Alt+Shift+ArrowLeft');
        expect(nextWord.value).toBe('Alt+Shift+ArrowRight');
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
        expect(saved.subtitleTranscriptPlacement).toBe('bottom');
        expect(saved.shortcuts.previousLookupWord).toBe('Alt+H');
        expect(saved.shortcuts.nextLookupWord).toBe('Alt+L');
        expect(saved.shortcuts.previousSubtitle).toBe('Shift+A');
        expect(saved.shortcuts.nextSubtitle).toBe('Shift+D');
        expect(saved.shortcuts.toggleSubtitleOverlay).toBe('Ctrl+H');
    });

    it('migrates the old default subtitle line shortcuts to A and D only when still default-looking', () => {
        const migrated = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                previousSubtitle: 'Alt+ArrowLeft',
                nextSubtitle: 'Alt+ArrowRight',
            },
        });

        expect(migrated.shortcuts.previousSubtitle).toBe('A');
        expect(migrated.shortcuts.nextSubtitle).toBe('D');

        const customized = normalizeReaderSettings({
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

    it('renders Study shortcuts as configurable shortcut inputs', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const reveal = form.querySelector<HTMLInputElement>('input[name="shortcuts.studyReveal"]')!;
        const revealAlternate = form.querySelector<HTMLInputElement>('input[name="shortcuts.studyRevealAlternate"]')!;
        const undo = form.querySelector<HTMLInputElement>('input[name="shortcuts.studyUndo"]')!;
        const previous = form.querySelector<HTMLInputElement>('input[name="shortcuts.studyPrevious"]')!;
        const next = form.querySelector<HTMLInputElement>('input[name="shortcuts.studyNext"]')!;

        expect(form.textContent).not.toContain('Study page keys');
        expect(form.textContent).not.toContain('Fixed keys');
        expect(topLevelLegendForControl(form, 'shortcuts.studyReveal')).toBe('Shortcuts');
        expect(reveal.value).toBe('Space');
        expect(revealAlternate.value).toBe('Enter');
        expect(undo.value).toBe('U');
        expect(previous.value).toBe('ArrowLeft');
        expect(next.value).toBe('ArrowRight');

        reveal.value = 'R';
        revealAlternate.value = '';
        undo.value = 'Z';
        previous.value = 'H';
        next.value = 'L';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.shortcuts.studyReveal).toBe('R');
        expect(saved.shortcuts.studyRevealAlternate).toBe('');
        expect(saved.shortcuts.studyUndo).toBe('Z');
        expect(saved.shortcuts.studyPrevious).toBe('H');
        expect(saved.shortcuts.studyNext).toBe('L');
    });

    it('links proxy setup to the maintained Worker source instead of embedding stale code', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const guide = form.querySelector<HTMLElement>('.jpdb-reader-proxy-guide')!;

        expect(guide.textContent).toContain('Make your own Cloudflare proxy');
        expect(guide.querySelector('[data-proxy-guide-show]')?.textContent).toBe('Show');
        expect(guide.querySelector('[data-proxy-guide-hide]')?.textContent).toBe('Hide');
        expect(guide.textContent).toContain('Worker source');
        expect(guide.textContent).toContain('Deploy guide');
        expect(guide.querySelector('.jpdb-reader-proxy-guide-code')).toBeNull();
        expect(guide.textContent).not.toContain('const JPDB_AUDIO_ACCESS_HEADER');
        expect(guide.querySelector('a[href$="/workers/jpdb-public-proxy/src/index.ts"]')).toBeTruthy();
        expect(guide.querySelector('a[href$="/workers/jpdb-public-proxy"]')).toBeTruthy();
    });

    it('shows the Nadeshiko key field only for Nadeshiko-backed example modes', () => {
        const defaultForm = document.createElement('form');
        defaultForm.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const nadeshikoOnlyForm = document.createElement('form');
        nadeshikoOnlyForm.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            immersionKitExampleSource: 'nadeshiko',
            nadeshikoApiKey: 'nad-key',
        }, 'https://jpdb.io/settings');
        const saved = readFormSettings(new FormData(nadeshikoOnlyForm), DEFAULT_SETTINGS);

        expect(defaultForm.querySelector<HTMLElement>('[data-nadeshiko-api-key-field]')?.hidden).toBe(true);
        expect(nadeshikoOnlyForm.querySelector<HTMLElement>('[data-nadeshiko-api-key-field]')?.hidden).toBe(false);
        expect(nadeshikoOnlyForm.querySelector<HTMLAnchorElement>('a[href="https://nadeshiko.co/user/developer"]')).toBeTruthy();
        expect(saved.immersionKitExampleSource).toBe('nadeshiko');
        expect(saved.nadeshikoApiKey).toBe('nad-key');
    });

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

    it('renders Anki as a reorderable and toggleable dictionary popover source', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            ankiSectionEnabled: true,
        }, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'en');
        const dictionariesPanel = form.querySelector<HTMLElement>('[data-settings-panel="dictionaries"]')!;
        const ankiRow = dictionariesPanel.querySelector<HTMLElement>(`[data-source-id="${ANKI_SOURCE_ID}"]`)!;
        const sourceToggle = ankiRow.querySelector<HTMLInputElement>('input[name="ankiSection.enabled"]')!;
        const sourcePriority = ankiRow.querySelector<HTMLInputElement>('input[name="ankiSection.priority"]')!;
        const miningToggle = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')!;

        expect(DEFAULT_SETTINGS.ankiSectionEnabled).toBe(false);
        expect(orderedDefinitionSourceIds({ ...DEFAULT_SETTINGS, ankiEnabled: false }, [])).not.toContain(ANKI_SOURCE_ID);
        expect(DEFAULT_SETTINGS.jitenDefinitionsPriority).toBeLessThan(DEFAULT_SETTINGS.jpdbDefinitionsPriority);
        expect(orderedDefinitionSourceIds({ ...DEFAULT_SETTINGS, ankiEnabled: false }, []).slice(0, 2)).toEqual([
            JITEN_DEFINITION_SOURCE_ID,
            JPDB_DEFINITION_SOURCE_ID,
        ]);
        expect(orderedDefinitionSourceIds(normalizeReaderSettings({
            jpdbDefinitionsPriority: 0,
            jitenDefinitionsPriority: 1,
        }), []).slice(0, 2)).toEqual([
            JITEN_DEFINITION_SOURCE_ID,
            JPDB_DEFINITION_SOURCE_ID,
        ]);
        expect(orderedDefinitionSourceIds(normalizeReaderSettings({
            jpdbDefinitionsPriority: 0,
            jitenDefinitionsPriority: 2,
        }), []).slice(0, 2)).toEqual([
            JPDB_DEFINITION_SOURCE_ID,
            JITEN_DEFINITION_SOURCE_ID,
        ]);
        expect(ankiRow.textContent).toContain('Anki');
        expect(ankiRow.textContent).toContain('Matching Anki card content and status');
        expect(ankiRow.textContent).not.toContain('mining');
        expect(ankiRow.querySelector<HTMLInputElement>('input[name="ankiSection.name"]')?.value).toBe('Anki');
        expect(ankiRow.querySelector<HTMLElement>('[data-source-drag-handle]')?.tabIndex).toBe(-1);
        expect(ankiRow.querySelector<HTMLButtonElement>('[data-action="dictionary-source-up"]')).not.toBeNull();
        expect(ankiRow.querySelector<HTMLButtonElement>('[data-action="dictionary-source-down"]')).not.toBeNull();
        expect(sourceToggle.checked).toBe(true);
        expect(sourceToggle.getAttribute('aria-label')).toBe('Enable source: Anki');
        expect(miningToggle.checked).toBe(false);

        sourceToggle.checked = false;
        sourcePriority.value = '0';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.ankiSectionEnabled).toBe(false);
        expect(saved.ankiSectionPriority).toBe(0);
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

    it('keeps mobile Anki handoff compact in Mining and points full setup to desktop AnkiConnect', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'en');

        expect(labelForControl(form, 'ankiMobileHandoff')).toContain('Mobile Anki add-note fallback');
        expect(labelForControl(form, 'ankiMobileHandoff')).not.toContain('AnkiConnect is unavailable');
        const connectionGrid = form.querySelector('.jpdb-reader-anki-connection-grid');
        const mobileHandoffLabel = form.querySelector('input[name="ankiMobileHandoff"]')?.closest('label');
        expect(mobileHandoffLabel?.parentElement).toBe(connectionGrid);
        expect(mobileHandoffLabel?.parentElement?.classList.contains('jpdb-reader-settings-wide')).toBe(false);
        expect(optionText(form, 'ankiDeck', 'Default')).toBe('Default');
        expect(form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.textContent).toBe('Check AnkiConnect');
        expect(form.querySelector<HTMLButtonElement>('[data-action="prepare-anki"]')?.textContent).toBe('Create Yomu note type');
        expect(form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')).toBeNull();
        const help = form.querySelector<HTMLElement>('[data-anki-setup-help]')!;
        const docsLink = help.querySelector<HTMLAnchorElement>('a[href$="getting-started#use-desktop-anki-from-a-phone-ipad-or-android"]');
        expect(docsLink?.textContent).toContain('Mobile Anki setup docs');
        expect(help.textContent).toContain('Full Anki uses AnkiConnect. Handoff creates notes.');
        expect(help.textContent).not.toContain('webCorsOriginList');
        expect(form.textContent).not.toContain('Handoff does not read your existing collection');
        expect(form.textContent).not.toContain('review queues require desktop Anki');
    });

    it('keeps settings puck copy concise and defaults mobile-safe', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'en');

        expect(DEFAULT_SETTINGS.showFloatingButton).toBe(true);
        expect(DEFAULT_SETTINGS.puckPositionX).toBeUndefined();
        expect(DEFAULT_SETTINGS.puckPositionY).toBeUndefined();
        expect(labelForControl(form, 'showFloatingButton')).toBe('Show settings puck');
        expect(form.querySelector<HTMLElement>('[data-settings-puck-help]')).toBeNull();
        expect(form.textContent).not.toContain('Keeps Settings reachable on phones and tablets.');
        expect(form.textContent).not.toContain('iOS zoom');
    });

    it('keeps mobile Anki limitations in docs instead of cramped settings copy', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'en');
        const settingsCopy = form.textContent ?? '';

        expect(settingsCopy).not.toContain('Handoff alone cannot scan existing decks');
        expect(settingsCopy).not.toContain('AnkiMobile add-note links can carry');
        expect(settingsCopy).not.toContain('AnkiDroid handoff uses Android');
        expect(GETTING_STARTED_DOCS).toContain('Mobile Anki handoff is one-way');
        expect(GETTING_STARTED_DOCS).toContain('cannot scan existing decks');
        expect(GETTING_STARTED_DOCS).toContain('review queues');
        expect(GETTING_STARTED_DOCS).toContain('replace every `100.x.y.z`');
        expect(GETTING_STARTED_DOCS).toContain('allowed-origins list');
        expect(GETTING_STARTED_DOCS).not.toContain('"webCorsOriginList"');
        expect(FEATURES_DOCS).toContain('[Getting Started](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android)');
        expect(FEATURES_DOCS).not.toContain('webCorsOriginList');
    });

    it('keeps top-level section legends attached to their panels', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'en');

        expect(topLevelLegendForControl(form, 'subtitlePlayerEnabled')).toBe('Video');
        expect(topLevelLegendForControl(form, 'youtubeImmersionEnabled')).toBe('YouTube');
        expect(topLevelLegendForControl(form, 'preferJapaneseSiteLanguage')).toBe('YouTube');
        expect(topLevelLegendForControl(form, 'ankiEnabled')).toBe('Anki');
        expect(topLevelLegendForControl(form, 'jpdbDefinitionsEnabled')).toBe('');
        expect(topLevelLegendForControl(form, 'shortcuts.openSettings')).toBe('Shortcuts');
        expect(form.querySelector('.jpdb-reader-radio-group > legend')?.textContent).toBe('Examples per word limit');
    });

    it('restores YouTube filter controls and the Alt+Y shortcut', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const filter = form.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]')!;
        const siteLanguage = form.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]')!;
        const channelSuggestions = form.querySelector<HTMLInputElement>('input[name="youtubeShowChannelRecommendations"]')!;
        const notice = form.querySelector<HTMLInputElement>('input[name="youtubeShowFilterNotice"]')!;
        const shortcut = form.querySelector<HTMLInputElement>('input[name="shortcuts.toggleYoutubeImmersion"]')!;

        expect(DEFAULT_SETTINGS.youtubeImmersionEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.preferJapaneseSiteLanguage).toBe(true);
        expect(DEFAULT_SETTINGS.youtubeShowChannelRecommendations).toBe(true);
        expect(DEFAULT_SETTINGS.youtubeShowFilterNotice).toBe(true);
        expect(DEFAULT_SETTINGS.shortcuts.toggleYoutubeImmersion).toBe('Alt+Y');
        expect(filter.checked).toBe(true);
        expect(siteLanguage.checked).toBe(true);
        expect(channelSuggestions.checked).toBe(true);
        expect(notice.checked).toBe(true);
        expect(shortcut.value).toBe('Alt+Y');

        filter.checked = false;
        siteLanguage.checked = false;
        channelSuggestions.checked = false;
        notice.checked = false;
        shortcut.value = 'Ctrl+Y';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.youtubeImmersionEnabled).toBe(false);
        expect(saved.preferJapaneseSiteLanguage).toBe(false);
        expect(saved.youtubeShowChannelRecommendations).toBe(false);
        expect(saved.youtubeShowFilterNotice).toBe(false);
        expect(saved.shortcuts.toggleYoutubeImmersion).toBe('Ctrl+Y');
    });

    it('localizes Japanese settings labels and select options added outside the original labels', () => {
        const form = sharedJapaneseSettingsTestForm();

        expect(form.lang).toBe('ja');
        expect(settingsText(form, 'h2')).toBe('よむ 設定');
        expect(labelForControl(form, 'newTabJpdbReviewMode')).toContain('API復習モード');
        expect(optionText(form, 'newTabSource', 'auto')).toBe('自動: API/Anki後に学習語');
        expect(optionText(form, 'newTabSource', 'jpdb')).toBe('API SRS（Jiten / JPDB）');
        expect(optionText(form, 'newTabJpdbReviewMode', 'api-vocabulary')).toBe('API語彙のみ（デッキ順）');
        expect(labelForControl(form, 'newTabKanjiKeywordSource')).toContain('漢字キーワードのソース');
        expect(optionText(form, 'newTabKanjiKeywordSource', 'auto')).toBe('自動: RTK、JPDB、ローカル');
        expect(optionText(form, 'newTabKanjiKeywordSource', 'jpdb')).toBe('JPDB漢字情報（Jiten / JPDB）');
        expect(labelForControl(form, 'newTabParsingEnabled')).toContain('学習の文解析を有効');
        expect(labelForControl(form, 'preferJapaneseSiteLanguage')).toContain('サイトの言語と地域を日本優先にする');
        expect(optionText(form, 'audioAutoPlayMode', 'all')).toBe('ホバーとタップ/クリック');
        expect(labelForControl(form, 'readerFontFamily')).toContain('リーダーUIフォント');
        expect(labelForControl(form, 'popupFontFamily')).toContain('ポップアップの日本語フォント');
        expect(labelForControl(form, 'subtitleFontFamily')).toContain('字幕フォントファミリー');
        expect(labelForControl(form, 'subtitlePausePanel')).toContain('一時停止時にサイドパネルを開く');
        expect(labelForControl(form, 'shortcuts.nextLookupWord')).toContain('次の単語');
        expect(labelForControl(form, 'shortcuts.studyReveal')).toContain('学習: カードを表示');
        expect(labelForControl(form, 'shortcuts.studyNext')).toContain('学習: 次のカード');
        expect(settingsText(form, '.jpdb-reader-radio-group > legend')).toBe('単語ごとの例文数制限');
        expect(settingsText(form, '.jpdb-reader-lookup-link-head span:nth-child(3)')).toBe('検索URLテンプレート');
    });

    it('localizes Japanese font family option metadata', () => {
        const form = sharedJapaneseSettingsTestForm();

        expectFontFamilyOptions(form, 'readerFontFamily', {
            defaultLabel: '内蔵フォント',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
        });
        expectFontFamilyOptions(form, 'popupFontFamily', {
            defaultLabel: '内蔵フォント',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
        });
        expectFontFamilyOptions(form, 'subtitleFontFamily', {
            defaultLabel: '内蔵フォント',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
        });
    });

    it('localizes Japanese Anki, theme, and template controls', () => {
        const form = sharedJapaneseSettingsTestForm();

        expect(settingsText(form, '.jpdb-reader-template-preview-title')).toBe('単語を先に表示するプリセット');
        expect(settingsText(form, '.jpdb-reader-template-meaning')).toBe('読む');
        expect(settingsText(form, '[data-action="test-anki"]')).toBe('AnkiConnectを確認');
        expect(settingsText(form, '[data-action="prepare-anki"]')).toBe('よむノートタイプを作成');
        expect(form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')).toBeNull();
        expect(settingsText(form, '[data-anki-status]')).toContain('AnkiConnectを確認中');
        expect(settingsText(form, '[data-anki-status]')).not.toContain('モバイルAnki受け渡し');
        expect(settingsText(form, '[data-anki-library-availability]')).toContain('既存デッキから対応付けを提案します。');
        expect(settingsText(form, '[data-anki-library-choices-title]')).toBe('デッキとノートタイプ');
        expect(settingsText(form, '[data-anki-template-settings-title]')).toBe('よむカードテンプレート');
        expect(form.querySelector<HTMLElement>('[data-theme-switch]')?.title).toBe('ダークテーマに切り替え');
        expect(form.querySelector<HTMLElement>('[data-theme-switch]')?.getAttribute('aria-labelledby')).toBe('jpdb-reader-theme-label');
        expect(form.querySelector<HTMLElement>('[data-theme-switch]')?.getAttribute('aria-describedby')).toBe('jpdb-reader-theme-label');
    });

    it('localizes Japanese proxy and help controls added outside the original labels', () => {
        const form = sharedJapaneseSettingsTestForm();

        expect(settingsText(form, '[data-proxy-guide-show]')).toBe('表示');
        expect(settingsText(form, '[data-proxy-guide-hide]')).toBe('隠す');
        expect(form.querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')?.getAttribute('aria-label')).toContain('検索ピル');
        expect(settingsText(form, '[data-help-links-title]')).toBe('便利なページ');
        expect(settingsText(form, '[data-help-support-title]')).toBe('よむをサポート');
        expect(settingsText(form, '[data-help-link="factory-reset"]')).toBe('初期状態に戻す');
        expect(form.querySelector('[data-help-glossary-title]')).toBeNull();
    });

    it('does not leave stale English or fallback copy in Japanese settings', () => {
        const form = sharedJapaneseSettingsTestForm();
        const text = form.textContent ?? '';

        expect(text).not.toContain('New tab review source');
        expect(text).not.toContain('JPDB review mode');
        expect(text).not.toContain('Kanji keyword source');
        expect(text).not.toContain('Parse sentences on new tab');
        expect(text).not.toContain('Examples per word limit');
        expect(text).not.toContain('Lookup pills');
        expect(text).not.toContain('Term dictionaries');
        expect(text).not.toContain('Factory Reset');
        expect(text).not.toContain('Useful pages');
        expect(text).not.toContain('Support よむ');
        expect(text).not.toContain('Glossary');
        expect(text).not.toContain('Word first preset');
        expect(text).not.toContain('to read');
        expect(text).not.toContain('未翻訳');
    });

    it('removes stale Japanese select option metadata instead of repeating every option', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const languageSelect = form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;
        languageSelect.insertAdjacentHTML('afterend', '<div data-settings-select-options-meta>選択肢: 自動 / 英語 / 日本語</div>');

        localizeSettingsForm(form, 'ja');
        localizeSettingsForm(form, 'ja');

        expect(languageSelect.parentElement?.querySelector('[data-settings-select-options-meta]')).toBeNull();

        localizeSettingsForm(form, 'en');

        expect(languageSelect.parentElement?.querySelector('[data-settings-select-options-meta]')).toBeNull();
    });

    it('does not add truncating option metadata for long selects', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <label>
                Test Select
                <select name="testSelect">
                    <option value="1">自動</option>
                    <option value="2">英語</option>
                    <option value="3">日本語</option>
                    <option value="4">ドイツ語</option>
                    <option value="5">フランス語</option>
                    <option value="6">中国語</option>
                    <option value="7">韓国語</option>
                </select>
            </label>
        `;
        const select = form.querySelector('select')!;

        localizeSettingsForm(form, 'ja');

        expect(select.nextElementSibling?.matches('[data-settings-select-options-meta]') ?? false).toBe(false);
        expect(form.querySelector('[data-settings-select-options-meta]')).toBeNull();
    });

    it('keeps removed audio source option metadata out of the preview button column', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        document.body.append(form);
        localizeSettingsForm(form, 'ja');
        activateSettingsPanel(form, 'media');
        const sourceChoice = form.querySelector<HTMLElement>('[data-audio-source-row] .jpdb-reader-audio-source-choice')!;
        const select = sourceChoice.querySelector<HTMLSelectElement>('select')!;
        const japaneseOption = Array.from(select.options).find(option => /[\u3040-\u30ff\u3400-\u9fff]/u.test(option.textContent ?? ''));
        expect(japaneseOption).toBeTruthy();
        select.value = japaneseOption!.value;
        const selectedText = select.selectedOptions[0]?.textContent?.trim() ?? '';

        expect(selectedText).toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
        expect(sourceChoice.querySelector('[data-settings-select-options-meta]')).toBeNull();

        const plan = nestedSettingsTextParsePlan(form, 640)!;
        expect(plan.targets.some(target => target.parent === select && target.text === selectedText)).toBe(false);
        expect(sourceChoice.querySelector<HTMLElement>('.jpdb-reader-control-text-mirror')).toBeNull();
        expect(sourceChoice.querySelector<HTMLElement>('.jpdb-reader-icon-mini')?.nextElementSibling).toBeNull();
    });

    it('renders fixed voice selectors for Jiten and JPDB text-to-speech sources', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        document.body.append(form);
        activateSettingsPanel(form, 'media');

        const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'));
        const rowFor = (type: string) => rows.find(row =>
            row.querySelector<HTMLSelectElement>('select[name$=".type"]')?.value === type,
        );
        const jitenVoice = rowFor('jiten-tts')?.querySelector<HTMLSelectElement>('[data-audio-voice-field]');
        const jpdbVoice = rowFor('jpdb-tts')?.querySelector<HTMLSelectElement>('[data-audio-voice-field]');

        expect(jitenVoice?.hidden).toBe(false);
        expect(jitenVoice?.dataset.audioVoiceKind).toBe('jiten');
        expect(Array.from(jitenVoice?.options ?? []).map(option => [option.value, option.text])).toEqual([
            ['', 'Random Jiten voice'],
            ['female', 'Female'],
            ['female2', 'Female 2'],
            ['male', 'Male'],
            ['male2', 'Male 2'],
            ['asmr', 'ASMR'],
        ]);

        expect(jpdbVoice?.hidden).toBe(false);
        expect(jpdbVoice?.dataset.audioVoiceKind).toBe('jpdb');
        expect(Array.from(jpdbVoice?.options ?? []).map(option => [option.value, option.text])).toEqual([
            ['', 'Random JPDB voice'],
            ['f1', 'Female 1'],
            ['f2', 'Female 2'],
            ['m1', 'Male 1'],
            ['m2', 'Male 2'],
        ]);
    });

    it('unwraps stale parsed settings labels before relocalizing', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');
        const label = form.querySelector<HTMLInputElement>('input[name="stickyBottomSheet"]')!.closest('label')!;
        const input = label.querySelector('input')!;
        const firstWord = document.createElement('span');
        firstWord.className = 'jpdb-reader-word';
        firstWord.textContent = '閉じる';
        const secondWord = document.createElement('span');
        secondWord.className = 'jpdb-reader-word';
        secondWord.textContent = '下部';
        label.replaceChildren(input, firstWord, document.createTextNode(' まで '), secondWord, document.createTextNode(' シート'));

        localizeSettingsForm(form, 'ja');

        expect(label.querySelector('.jpdb-reader-word')).toBeNull();
        expect(label.textContent).toBe('検索後も開く');
    });

    it('keeps parsed Japanese inline labels inside one grid item', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        document.body.append(form);
        localizeSettingsForm(form, 'ja');
        activateSettingsPanel(form, 'api');
        const label = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')!.closest('label')!;
        const labelText = label.querySelector<HTMLElement>(':scope > .jpdb-reader-settings-label-text');

        expect(labelText?.textContent).toBe('APIの復習・デッキ変更を許可');

        const plan = nestedSettingsTextParsePlan(form, 640)!;
        const targetIndex = plan.targets.findIndex(target => target.text === 'APIの復習・デッキ変更を許可');
        expect(targetIndex).toBeGreaterThanOrEqual(0);
        const parsed = plan.targets.map(() => [] as JPDBToken[]);
        parsed[targetIndex] = [settingsToken('APIの', 0)];

        applyNestedParsePlan(plan, parsed, DEFAULT_SETTINGS);

        expect(Array.from(label.children).filter(child => child.classList.contains('jpdb-reader-word'))).toHaveLength(0);
        expect(label.querySelector(':scope > .jpdb-reader-settings-label-text .jpdb-reader-word')?.textContent).toBe('APIの');
    });
});

function settingsToken(surface: string, start: number, reading = surface): JPDBToken {
    return {
        card: settingsCard(surface, reading),
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: reading === surface ? [] : [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass: '',
    };
}

function settingsCard(spelling: string, reading = spelling): JPDBCard {
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

describe('AnkiConnect failure diagnosis (diagnostic-UX ticket)', () => {
    it('classifies an opaque no-cors success as cors-blocked and a network error as unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ type: 'opaque' })));
        await expect(diagnoseAnkiConnectFailure('http://127.0.0.1:8765')).resolves.toBe('cors-blocked');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('NetworkError'); }));
        await expect(diagnoseAnkiConnectFailure('http://127.0.0.1:8765')).resolves.toBe('unreachable');
        vi.unstubAllGlobals();
    });

    it('names the exact origin to allow in the cors-blocked settings message', () => {
        const en = uiText('en', 'ankiCorsBlocked');
        expect(en).toContain('webCorsOriginList');
        expect(en).toContain('{origin}');
        const ja = uiText('ja', 'ankiCorsBlocked');
        expect(ja).toContain('webCorsOriginList');
        expect(ja).toContain('{origin}');
    });
});
