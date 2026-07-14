import { readFileSync } from 'node:fs';
import { diagnoseAnkiConnectFailure } from '../../src/reader/anki/transport';
import { uiText } from '../../src/reader/app/i18n';
import { describe, expect, it } from 'vitest';
import { ANKI_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../../src/reader/app/constants';
import { INSTALL_GUIDE_URL } from '../../src/reader/app/userscript-update';
import { CURRENT_YOMU_VERSION } from '../../src/reader/app/version';
import { applyNestedParsePlan, nestedSettingsTextParsePlan } from '../../src/reader/lookup/nested-text-parse';
import { findRecommendedDictionary } from '../../src/reader/dictionaries/recommended';
import { accentToRgba, accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS, effectiveFuriganaMode, effectiveReaderTextColorSource, normalizeReaderSettings, shouldLookupAnkiStatus } from '../../src/reader/settings/index';
import { blendRgba, contrastRatio, cssColorToRgba, rgbaToHex } from '../../src/reader/theme/color-utils';
import { activateSettingsPanel, applySettingsSearch, installShortcutCapture, localizeSettingsForm, readFormSettings, renderHelpLinksPanel, renderSettingsForm, syncSubtitlePreview } from '../../src/reader/settings/form';
import { JAPANESE_ROUNDED_FONT_FAMILY } from '../../src/reader/settings/font-presets';
import { CUSTOM_FONT_FAMILY_VALUE } from '../../src/reader/settings/form-read';
import { reconcileApiCredentialInputs } from '../../src/reader/settings/dialog-controller';
import { KANJI_SIMILAR_WORDS_SOURCE_ID, orderedDefinitionSourceIds, orderedKanjiSourceIds } from '../../src/reader/sources/sections';
import type { AnkiFieldMappingRole, AnkiFieldMappings, JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' as const };

function compositeOverWhiteHex(color: string): string {
    const foreground = cssColorToRgba(color);
    const white = cssColorToRgba('#ffffff');
    if (!foreground || !white) throw new Error(`Unable to parse color ${color}`);
    return rgbaToHex(blendRgba(foreground, white));
}

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
const AMBIGUOUS_SCAN_COPY = ['Manual scan', 'only'].join(' ');
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

function radioValue(form: HTMLFormElement, controlName: string): string | undefined {
    return form.querySelector<HTMLInputElement>(`input[name="${controlName}"]:checked`)?.value;
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

function recommendedDictionaryGuideOrNull(form: HTMLFormElement, id: string): HTMLAnchorElement | null {
    return form.querySelector<HTMLAnchorElement>(`[data-recommended-dictionary-guide][data-dictionary-id="${id}"]`);
}

function recommendedDictionaryHelp(form: HTMLFormElement, id: string): string {
    return form.querySelector<HTMLElement>(`[data-dictionary-id="${id}"]`)
        ?.closest<HTMLElement>('.jpdb-reader-recommended-item')
        ?.querySelector<HTMLElement>('.jpdb-reader-help')
        ?.textContent ?? '';
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
    // Model a genuine pre-current stored payload. newTabEnabled shipped as false
    // in the legacy default (it only became true once the extension opt-out fix
    // moved the first-install default into DEFAULT_SETTINGS), and the Anki-mobile
    // migration heuristic keys off that historical false, so the fixture pins it.
    const settings: Partial<typeof DEFAULT_SETTINGS> = { ...DEFAULT_SETTINGS, newTabEnabled: false, ...overrides };
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

        for (const key of ['update-userscript', 'anki-connect-addon', 'anki-mobile-docs', 'video-player', 'pdf-reader', 'new-tab', 'docs', 'donate', 'issues', 'discord']) {
            expect(form.querySelector(`[data-help-link="${key}"] svg`)).not.toBeNull();
        }
        expect(form.querySelector('[data-help-link="factory-reset"] svg')).toBeNull();

        localizeSettingsForm(form, 'ja');

        expect(form.querySelector('[data-help-link="video-player"]')?.textContent).toContain('動画プレイヤー');
        expect(form.querySelector('[data-help-link="video-player"] svg')).not.toBeNull();
        expect(form.querySelector('[data-help-link="pdf-reader"]')?.textContent).toContain('PDFリーダー');
        expect(form.querySelector('[data-help-link="pdf-reader"] svg')).not.toBeNull();
        expect(form.querySelector('[data-help-link="update-userscript"]')?.textContent).toContain('更新');
        expect(form.querySelector('[data-help-link="anki-connect-addon"]')?.textContent).toContain('AnkiConnect');
    });

    it('shows a compact version and update strip at the top of Help', () => {
        const marker = document.createElement('meta');
        marker.id = 'jpdb-reader-runtime-owner';
        marker.dataset.yomuRuntimeKind = 'userscript';
        document.head.append(marker);
        const form = document.createElement('form');
        try {
            form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

            const helpPanel = form.querySelector<HTMLElement>('[data-settings-panel="help"]')!;
            const firstHelpBlock = Array.from(helpPanel.children)
                .find((child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== 'LEGEND');
            expect(firstHelpBlock?.matches('.jpdb-reader-help-links-card')).toBe(true);

            const strip = helpPanel.querySelector<HTMLElement>('[data-help-update-strip]')!;
            expect(strip).not.toBeNull();
            expect(strip.parentElement?.firstElementChild).toBe(strip);

            expect(form.querySelector<HTMLElement>('[data-yomu-current-version]')?.textContent).toBe(CURRENT_YOMU_VERSION);
            expect(form.querySelector<HTMLElement>('[data-yomu-update-status]')?.textContent).toContain(CURRENT_YOMU_VERSION);
            expect(form.querySelector<HTMLElement>('[data-yomu-duplicate-status]')?.textContent).toContain('userscript');
            // jsdom has no GM_info, so the update flow resolves to the install
            // guide (a raw .user.js navigation would hit the browser's
            // blocked-install banner in exactly this manager-less situation).
            expect(form.querySelector<HTMLAnchorElement>('[data-help-link="update-userscript"]')?.href).toBe(INSTALL_GUIDE_URL);
            expect(form.querySelector<HTMLAnchorElement>('[data-help-link="update-userscript"]')?.dataset.action).toBe('open-yomu-update');
            expect(form.querySelector<HTMLElement>('[data-help-update-notes]')?.textContent).toContain('install guide');
            expect(form.querySelector<HTMLElement>('[data-diagnostics-title]')?.compareDocumentPosition(strip) ?? 0)
                .toBe(Node.DOCUMENT_POSITION_PRECEDING);

            localizeSettingsForm(form, 'ja');

            expect(form.querySelector<HTMLElement>('[data-help-update-title]')?.textContent).toBe('バージョン');
            expect(form.querySelector<HTMLElement>('[data-yomu-update-status]')?.textContent).toContain(CURRENT_YOMU_VERSION);
            expect(form.querySelector<HTMLElement>('[data-yomu-duplicate-status]')?.textContent).toContain('userscript');
            expect(form.querySelector<HTMLElement>('[data-help-update-notes]')?.textContent).toContain('インストールガイド');
        } finally {
            marker.remove();
        }
    });

    it('shows AnkiConnect CORS, mobile, and Brave setup help in Help', () => {
        const form = document.createElement('form');
        form.innerHTML = renderHelpLinksPanel();

        const ankiDisclosure = form.querySelector<HTMLDetailsElement>('[data-help-anki-disclosure]');
        expect(ankiDisclosure).not.toBeNull();
        expect(ankiDisclosure?.open).toBe(false);
        expect(form.querySelector<HTMLElement>('[data-help-anki-title]')?.textContent).toBe('AnkiConnect setup');
        expect(form.querySelector<HTMLElement>('.jpdb-reader-help-code')?.textContent).toContain('https://yomureader.com');
        expect(form.querySelector<HTMLElement>('.jpdb-reader-help-code')?.textContent).toContain('http://localhost');
        expect(form.querySelector<HTMLElement>('[data-help-anki-brave]')?.textContent).toContain('Brave');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="anki-connect-addon"]')?.href).toContain('ankiweb.net/shared/info/2055492159');
        expect(form.querySelector<HTMLAnchorElement>('[data-help-link="anki-mobile-docs"]')?.href).toContain('getting-started#use-desktop-anki');

        localizeSettingsForm(form, 'ja');

        expect(form.querySelector<HTMLElement>('[data-help-anki-title]')?.textContent).toBe('AnkiConnect設定');
        expect(form.querySelector<HTMLElement>('.jpdb-reader-help-code')?.textContent).toContain('https://yomureader.com');
        expect(form.querySelector<HTMLElement>('[data-help-anki-mobile]')?.textContent).toContain('Tailscale');
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
                { name: 'Kanjium Pitch Accents', alias: 'Pitch', enabled: true, priority: 1, type: 'metadata' },
                { name: 'JPDB v2.2 Frequency Kana', alias: 'JPDB Frequency', enabled: true, priority: 1, type: 'frequency' },
            ],
        });

        expect(recommendedDictionaryButton(form, 'jitendex').textContent?.trim()).toBe('Update');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').textContent?.trim()).toBe('Update');
        expect(recommendedDictionaryGuideOrNull(form, 'kanjium-pitch')).toBeNull();
        expect(recommendedDictionaryButton(form, 'jpdbv2-kana').textContent?.trim()).toBe('Update');
    });

    it('shows pitch dictionaries as their own recommended group before frequency dictionaries', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const groupTitles = Array.from(form.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-group-title'), title => title.textContent);

        expect(groupTitles).toEqual(['Term dictionaries', 'Kanji dictionaries', 'Pitch dictionaries', 'Frequency dictionaries']);
        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('Install a term dictionary first');
        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('not normal definition text');
        expect(recommendedDictionaryHelp(form, 'kanjium-pitch')).toContain('Pitch accents only');
        expect(recommendedDictionaryHelp(form, 'jpdbv2-kana')).toContain('frequency badges');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').textContent?.trim()).toBe('Install');
        expect(findRecommendedDictionary('kanjium-pitch')?.downloadUrl).toBe('https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip');
        expect(recommendedDictionaryButton(form, 'jpdbv2-kana').compareDocumentPosition(recommendedDictionaryButton(form, 'jiten')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('localizes guide-only pitch help and clarifies frequency dictionaries are badges', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        localizeSettingsForm(form, 'ja');

        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('通常の定義文は追加しません');
        expect(recommendedDictionaryHelp(form, 'kanjium-pitch')).toContain('ピッチアクセント専用');
        expect(recommendedDictionaryHelp(form, 'jpdbv2-kana')).toContain('頻度バッジ');
        expect(settingsText(form, '#jpdb-reader-settings-panel-backup [data-import-status]')).toContain('語句/ピッチ/頻度辞書');
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

describe('source display names', () => {
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

describe('frequency dictionary preferences', () => {
    it('renders frequency badges and external links in one lookup pill editor', () => {
        const form = renderSettingsTestForm(frequencySettings);
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;

        const rows = Array.from(editor.querySelectorAll<HTMLElement>('[data-lookup-link-row]'));
        const ids = rows.map(row => row.querySelector<HTMLInputElement>('input[name$=".id"]')?.value);
        expect(ids).toContain('jiten-frequency');
        expect(ids).toContain('jpdb-frequency');
        expect(ids).toContain('frequency-local:BCCWJ');
        expect(ids).toContain('frequency-local:Jiten');
        expect(ids).toContain('frequency-local:JPDB Freq');
        expect(form.querySelector<HTMLElement>('[data-frequency-dictionaries]')).toBeNull();
        expect(form.querySelector<HTMLElement>('[data-frequency-lookup-pills]')).toBeNull();
        expect(editor.closest('.jpdb-reader-settings-subsection')?.querySelector('.jpdb-reader-local-title')?.textContent).toBe('Lookup pills');
        expect(editor.closest('.jpdb-reader-settings-subsection')?.querySelector('.jpdb-reader-help')?.textContent).toContain('frequency badges');
        expect(editor.textContent).toContain('Live Jiten frequency from site lookup');
        expect(editor.textContent).toContain('Installed local frequency dictionary badge');
        for (const row of rows.slice(0, 4)) {
            expect(row.querySelector('[data-lookup-link-enable-toggle]')).not.toBeNull();
            expect(row.querySelector('[data-source-drag-handle]')).not.toBeNull();
            expect(row.querySelector('[data-action="lookup-link-up"]')).not.toBeNull();
        }
        expect(editor.querySelector<HTMLInputElement>('input[name$=".id"][value="jiten-frequency"]')?.closest('[data-lookup-link-row]')?.querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')?.checked).toBe(true);
        expect(editor.querySelector<HTMLInputElement>('input[name$=".id"][value="jpdb-frequency"]')?.closest('[data-lookup-link-row]')?.querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')?.checked).toBe(true);
        // Frequency dictionaries are preserved as hidden dictionary preferences, not a second visible table.
        expect(form.querySelectorAll('input[name="dictionaryPreferences.1.name"]').length).toBe(1);
    });

    it('round-trips local frequency pill toggles and order through form read', () => {
        const form = renderSettingsTestForm(frequencySettings);
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;
        const disabledToggle = editor.querySelector<HTMLInputElement>('input[name$=".id"][value="frequency-local:JPDB Freq"]')!
            .closest<HTMLElement>('[data-lookup-link-row]')!
            .querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')!;
        disabledToggle.checked = true;

        const saved = readFormSettings(new FormData(form), frequencySettings);
        const frequency = saved.dictionaryPreferences.filter(preference => preference.type === 'frequency');
        const frequencyPills = saved.dictionaryLookupLinks.filter(link => link.action === 'frequency-live' || link.action === 'frequency-local');

        expect(frequency.map(preference => preference.name)).toEqual(['BCCWJ', 'Jiten', 'JPDB Freq']);
        expect(frequencyPills.find(link => link.id === 'frequency-local:JPDB Freq')?.enabled).toBe(true);
        expect(frequencyPills.find(link => link.id === 'jiten-frequency')?.enabled).toBe(true);
        expect(frequencyPills.find(link => link.id === 'jpdb-frequency')?.enabled).toBe(true);
    });

    it('localizes combined lookup pill settings', () => {
        const form = renderSettingsTestForm(frequencySettings);
        localizeSettingsForm(form, 'ja');
        const editor = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links')!;
        const subsection = editor.closest<HTMLElement>('.jpdb-reader-settings-subsection')!;

        expect(settingsText(form, '.jpdb-reader-lookup-link-head span:nth-child(2)')).toBe('ラベル');
        expect(subsection.querySelector<HTMLElement>('.jpdb-reader-help')?.textContent).toContain('ライブバッジ');
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
            'backup',
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
        const backupPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup')!;
        const settingsImport = backupPanel.querySelector<HTMLElement>('[data-action="import-yomitan-settings"]')!;

        expect(backupPanel.querySelector('[data-cloud-settings-sync]')).toBeNull();
        expect(backupPanel.textContent).not.toContain('Google Drive settings sync');
        expect(backupPanel.textContent).not.toContain('cloud backup');
        expect(settingsImport).not.toBeNull();
        expect(backupPanel.querySelector('[data-action="export-reader-settings"]')).not.toBeNull();

        localizeSettingsForm(form, 'ja');
        expect(backupPanel.querySelector('[data-cloud-settings-sync]')).toBeNull();
    });

    it('gives backup and sync its own top-level section next to Appearance', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const backupPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup')!;
        const sourcesPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-dictionaries')!;

        expect(backupPanel.dataset.settingsPanel).toBe('backup');
        for (const action of ['import-yomitan-settings', 'export-reader-settings', 'import-yomitan-dictionary', 'export-yomitan-dictionary']) {
            expect(backupPanel.querySelector(`[data-action="${action}"]`), action).not.toBeNull();
            expect(sourcesPanel.querySelector(`[data-action="${action}"]`), action).toBeNull();
        }
        expect(backupPanel.querySelector('input[data-file="settings"]')).not.toBeNull();
        expect(backupPanel.querySelector('input[data-file="dictionary"]')).not.toBeNull();
        expect(backupPanel.querySelector<HTMLElement>('[data-import-status]')?.textContent).toContain('Import Yomitan');
        // Sources keeps a hidden status line so dictionary row actions still
        // surface feedback on the panel where they were clicked.
        const sourcesStatus = sourcesPanel.querySelector<HTMLElement>('[data-import-status]');
        expect(sourcesStatus?.hidden).toBe(true);
        expect(sourcesStatus?.textContent).toBe('');
        expect(sourcesPanel.querySelector('[data-help-key="backupMovedHelp"]')).not.toBeNull();

        const tabs = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]')).map(button => button.dataset.panel);
        expect(tabs.indexOf('backup')).toBe(tabs.indexOf('appearance') + 1);
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="backup"]')?.textContent).toBe('Backup & sync');

        localizeSettingsForm(form, 'ja');
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="backup"]')?.textContent).toBe('バックアップと同期');
        expect(backupPanel.querySelector('legend')?.textContent).toBe('バックアップと同期');
    });

    it('shows the running version in the settings footer', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const version = form.querySelector<HTMLElement>('.footer [data-yomu-settings-version]');
        expect(version?.textContent).toBe(`Yomu ${CURRENT_YOMU_VERSION}`);
    });

    it('gives Study settings their own top-level section', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        // UT-74: the newTabEnabled checkbox was removed (no runtime consumer;
        // a userscript cannot override the browser new tab).
        expect(form.querySelector('[name="newTabEnabled"]')).toBeNull();
        expect(topLevelLegendForControl(form, 'newTabAnkiEnabled')).toBe('Study');
        expect(topLevelLegendForControl(form, 'newTabJpdbReviewMode')).toBe('Study');
        expect(topLevelLegendsForControl(form, 'twoButtonReviews')).toEqual(['Study']);
        expect(labelForControl(form, 'twoButtonReviews')).toContain('Review rating scale');
        expect(labelForControl(form, 'newTabJpdbReviewMode')).toContain('API review mode');
        expect(optionText(form, 'newTabSource', 'auto')).toBe('Auto: Academy, accounts, then study words');
        expect(optionText(form, 'newTabSource', 'jpdb')).toBe('API SRS (Jiten / JPDB)');
        expect(optionText(form, 'twoButtonReviews', 'true')).toBe('Two point: FAIL / PASS');
        expect(optionText(form, 'newTabKanjiKeywordSource', 'auto')).toBe('Auto: RTK, then JPDB kanji facts, then local');
        expect(optionText(form, 'newTabKanjiKeywordSource', 'jpdb')).toBe('JPDB kanji facts (Jiten / JPDB)');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="newTab"]')?.hidden).toBe(true);
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="newTab"]')).not.toBeNull();

        form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')!.value = 'true';
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).twoButtonReviews).toBe(true);
    });

    it('reads per-state colour opt-out (colorHide-*) checkboxes into wordColorHiddenStateGroups', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        // The colour subsection renders a "Hide color for" fieldset of state checkboxes.
        expect(form.querySelector('fieldset[data-word-color-hide-groups]')).not.toBeNull();
        const knownBox = form.querySelector<HTMLInputElement>('input[name="colorHide-known"]')!;
        const dueBox = form.querySelector<HTMLInputElement>('input[name="colorHide-due"]')!;
        expect(knownBox).not.toBeNull();
        knownBox.checked = true;
        dueBox.checked = true;
        // form-read filters in fixed state order (new,learning,known,due,failed) → known before due.
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).wordColorHiddenStateGroups).toEqual(['known', 'due']);
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
        expect(settingsText(form, '[data-help-key="popupLookupHelp"]')).toContain('another reader');

        form.querySelector<HTMLInputElement>('input[name="popupLookupEnabled"]')!.checked = false;
        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.popupActivationMode).toBe('off');
        expect(saved.lookupOnClick).toBe(true);
        expect(saved.lookupOnHover).toBe(true);

        localizeSettingsForm(form, 'ja');
        expect(labelForControl(form, 'popupLookupEnabled')).toContain('よむの検索ポップアップを表示');
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
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('Add each service credential here');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('import it from Bunpro settings');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('treat it like a password');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('saved before it is verified');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('Academy reviews work locally without an account');

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
        expect(normalizeReaderSettings({
            bunproApiKey: ' legacy-bunpro ',
            bunproFrontendApiToken: ' frontend-bunpro ',
            bunproFrontendApiTokenExpiresAt: '2026-07-06T16:05:56.552Z',
        })).toMatchObject({
            bunproApiKey: 'legacy-bunpro',
            bunproFrontendApiToken: 'frontend-bunpro',
            bunproFrontendApiTokenExpiresAt: '2026-07-06T16:05:56.552Z',
        });
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
        expect(DEFAULT_SETTINGS.furiganaMode).toBe('difficult-kanji');
        expect(DEFAULT_SETTINGS.furiganaHiddenStateGroups).toEqual(['known', 'due', 'failed']);
        expect(DEFAULT_SETTINGS.wordColorStates).toBe('all');
        // Per-state colour opt-out defaults to empty (colour every state) so existing
        // installs keep their colouring; normalize drops invalid/duplicate groups.
        expect(DEFAULT_SETTINGS.wordColorHiddenStateGroups).toEqual([]);
        expect(normalizeReaderSettings({}).wordColorHiddenStateGroups).toEqual([]);
        expect(normalizeReaderSettings({ wordColorHiddenStateGroups: ['known', 'known', 'bogus', 'due'] as never }).wordColorHiddenStateGroups).toEqual(['known', 'due']);
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
        expect(form.querySelector<HTMLInputElement>('input[name="ankiTags"]')?.value).toBe('yomu');
        expect(form.querySelector<HTMLElement>('[data-anki-tag-chips] .jpdb-reader-tag-chip')?.textContent).toContain('yomu');
        expect(form.querySelector<HTMLElement>(`[data-source-id="${ANKI_SOURCE_ID}"]`)).not.toBeNull();
        expect(form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')).toBeNull();
        expect(form.textContent).not.toContain('Scan Anki');

        const saved = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, ankiEnabled: false, popupMode: 'popover' });
        expect(saved.ankiEnabled).toBe(false);
        expect(saved.popupMode).toBe('auto');
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
            newTabShortcutHintsEnabled: defaults.newTabShortcutHintsEnabled,
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
            newTabShortcutHintsEnabled: true,
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
            newTabShortcutHintsEnabled: checkboxValue(form, 'newTabShortcutHintsEnabled'),
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
            newTabShortcutHintsEnabled: true,
            showFloatingButton: true,
            audioEnabled: true,
            autoPlayAudio: true,
            audioEnableDefaultSources: true,
            audioAutoPlayMode: 'all',
            popupMode: 'auto',
        });

        form.querySelector<HTMLInputElement>('input[name="newTabShortcutHintsEnabled"]')!.checked = false;
        expect(readFormSettings(new FormData(form), defaults).newTabShortcutHintsEnabled).toBe(false);
    });

    it('normalizes saved lookup links so Jiten stays before JPDB', () => {
        const defaultIds = normalizeReaderSettings({}).dictionaryLookupLinks.map(link => link.id);
        expect(defaultIds.slice(0, 5)).toEqual(['yomu-search', 'jiten', 'jiten-frequency', 'jpdb', 'jpdb-frequency']);

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
        expect(migrated.dictionaryLookupLinks.slice(0, 5).map(link => link.id)).toEqual(['yomu-search', 'jiten', 'jiten-frequency', 'jpdb', 'jpdb-frequency']);
        expect(migrated.dictionaryLookupLinks.map(link => link.id)).not.toContain('goo');

        // Users still on the previous jiten-first default (with the merged
        // frequency pills) are re-ordered to the new Yomu-first default.
        const priorDefaultOrder = ['jiten', 'jiten-frequency', 'jpdb', 'jpdb-frequency', 'yomu-search', 'bunpro', 'jisho', 'weblio', 'kotobank', 'takoboto', 'wiktionary-ja', 'immersion-kit', 'uchisen', 'copy'];
        const migratedFromPriorDefault = normalizeReaderSettings({
            dictionaryLookupLinks: priorDefaultOrder.map(id => ({ ...defaultLinks.get(id)! })),
        });
        expect(migratedFromPriorDefault.dictionaryLookupLinks.slice(0, 5).map(link => link.id)).toEqual(['yomu-search', 'jiten', 'jiten-frequency', 'jpdb', 'jpdb-frequency']);

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
            manualScanEnabled: true,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                scanPage: 'Ctrl+J',
                scanImages: 'Ctrl+I',
            },
        };
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');

        expect(form.querySelector<HTMLInputElement>('input[name="ocrAutoScanImages"]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="ocrEnabled"]')).toBeNull();
        expect(radioValue(form, 'pageScanMode')).toBe('manual');
        expect(radioValue(form, 'ocrInteractionMode')).toBe('manual');
        expect(Array.from(form.querySelectorAll<HTMLInputElement>('input[name="shortcuts.scanPage"]')).map(input => input.value)).toEqual(['Ctrl+J', 'Ctrl+J']);
        expect(form.textContent).not.toContain('Read images automatically');
        expect(form.textContent).not.toContain(AMBIGUOUS_SCAN_COPY);
        expect(topLevelLegendsForControl(form, 'shortcuts.scanPage')).toEqual(['Reader', 'Shortcuts']);

        const saved = readFormSettings(new FormData(form), current);
        expect(saved.ocrAutoScanImages).toBe(false);
        expect(saved.ocrEnabled).toBe(true);
        expect(saved.manualScanEnabled).toBe(true);
        expect(saved.annotationsPaused).toBe(false);
        expect(saved.shortcuts.scanPage).toBe('Ctrl+J');
        expect(saved.shortcuts.scanImages).toBe('Ctrl+I');
    });

    it('round-trips explicit page scanning modes', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(radioValue(form, 'pageScanMode')).toBe('auto');
        expect(labelForControl(form, 'pageScanMode')).toContain('Off');
        expect(form.querySelector<HTMLElement>('[data-page-scan-manual-shortcut]')?.hidden).toBe(true);

        form.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="manual"]')!.checked = true;
        const manual = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(manual.annotationsPaused).toBe(false);
        expect(manual.manualScanEnabled).toBe(true);

        form.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="off"]')!.checked = true;
        const off = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(off.annotationsPaused).toBe(true);
        expect(off.manualScanEnabled).toBe(false);
    });

    it('round-trips explicit OCR scanning modes', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(radioValue(form, 'ocrInteractionMode')).toBe('auto');
        expect(labelForControl(form, 'ocrInteractionMode')).toContain('Auto');

        form.querySelector<HTMLInputElement>('input[name="ocrInteractionMode"][value="manual"]')!.checked = true;
        const manual = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(manual.ocrEnabled).toBe(true);
        expect(manual.ocrAutoScanImages).toBe(false);

        form.querySelector<HTMLInputElement>('input[name="ocrInteractionMode"][value="off"]')!.checked = true;
        const off = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(off.ocrEnabled).toBe(false);
        expect(off.ocrAutoScanImages).toBe(false);
    });

    it('round-trips the OCR overlay theme setting', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, ocrOverlayTheme: 'light' }, 'https://jpdb.io/settings');
        const select = form.querySelector<HTMLSelectElement>('select[name="ocrOverlayTheme"]')!;

        expect(labelForControl(form, 'ocrOverlayTheme')).toContain('OCR overlay theme');
        expect(optionText(form, 'ocrOverlayTheme', 'auto')).toBe('Match app theme');
        expect(optionText(form, 'ocrOverlayTheme', 'light')).toBe('Light overlay');
        expect(optionText(form, 'ocrOverlayTheme', 'dark')).toBe('Dark overlay');
        expect(selectValue(form, 'ocrOverlayTheme')).toBe('light');

        select.value = 'dark';
        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.ocrOverlayTheme).toBe('dark');
    });

    it('defaults OCR text to white on an accessible accent-derived highlight', () => {
        expect(BASE_DEFAULT_SETTINGS.ocrTextColor).toBe('#ffffff');
        expect(BASE_DEFAULT_SETTINGS.ocrOutlineColor).toBe('#000000');
        expect(BASE_DEFAULT_SETTINGS.ocrBackgroundOpacity).toBe(0.68);
        expect(BASE_DEFAULT_SETTINGS.ocrBackgroundColor).toBe(accessibleOcrBackgroundColor(
            BASE_DEFAULT_SETTINGS.accentColor,
            BASE_DEFAULT_SETTINGS.ocrBackgroundOpacity,
        ));
        expect(contrastRatio(
            compositeOverWhiteHex(accentToRgba(BASE_DEFAULT_SETTINGS.ocrBackgroundColor, BASE_DEFAULT_SETTINGS.ocrBackgroundOpacity)),
            BASE_DEFAULT_SETTINGS.ocrTextColor,
        ))
            .toBeGreaterThanOrEqual(4.5);
    });

    it('normalizes the OCR background from the current accent color', () => {
        const settings = normalizeReaderSettings({
            accentColor: '#ffcc00',
            ocrTextColor: '#17202a',
            ocrOutlineColor: '#ffffff',
            ocrBackgroundColor: '#f4f7fa',
            ocrBackgroundOpacity: 0.2,
        });
        const opacity = accessibleOcrBackgroundOpacity(0.2);

        expect(settings.ocrTextColor).toBe('#ffffff');
        expect(settings.ocrOutlineColor).toBe('#000000');
        expect(settings.ocrBackgroundOpacity).toBe(opacity);
        expect(settings.ocrBackgroundColor).toBe(accessibleOcrBackgroundColor('#ffcc00', opacity));
        expect(contrastRatio(
            compositeOverWhiteHex(accentToRgba(settings.ocrBackgroundColor, settings.ocrBackgroundOpacity)),
            settings.ocrTextColor,
        )).toBeGreaterThanOrEqual(4.5);
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

    it('keeps hosted settings companions lazy while preserving settings warmup', () => {
        const normalizedTheme = DOCS_THEME_SOURCE.replace(/\s+/g, ' ');

        expect(normalizedTheme).toContain('function warmHostedSettingsRuntime(): HTMLScriptElement[] { const forceLocalRuntime = isLocalHostedRuntime(); const settings = appendHostedSettingsCompanionScript(forceLocalRuntime); const core = loadHostedYomuRuntime(); return [settings, core].filter(isHostedRuntimeScriptElement); }');
        expect(normalizedTheme).toContain('function prepareHostedYomuRuntime(): void { const forceLocalRuntime = isLocalHostedRuntime(); prepareHostedMangaOcrDemo(); if (shouldLoadHostedRuntimeCompanionsBeforeCore()) appendHostedRuntimeCompanionScripts(forceLocalRuntime); if (isHostedYomuRuntimeLoadingOrReady(forceLocalRuntime)) {');
        expect(normalizedTheme).toContain('function shouldLoadHostedRuntimeCompanionsBeforeCore(): boolean { return location.pathname.includes(\'/video-player/\') || Boolean(document.querySelector(\'[data-yomu-video-frame]\')); }');
        expect(normalizedTheme).toContain('if (!companionFirst) appendHostedSettingsCompanionAfterCoreLoad(script, forceLocalRuntime);');
        expect(normalizedTheme).toContain('ocrEnabled: true');
        expect(normalizedTheme).toContain('ocrVideoPauseFrames: true');
        expect(normalizedTheme).toContain('ocrProvider: \'google-lens\'');
        expect(normalizedTheme).toContain('ocrOverlayTheme: \'auto\'');
    });

    it('renders the support banner with localized currency, a progress bar, and provider buttons', () => {
        // Localized display: the banner prefers the Worker-provided display text
        // and falls back to Intl.NumberFormat with the visitor's locale.
        expect(DOCS_THEME_SOURCE).toContain('function formatHostedLocalCurrency(value: number, currency: string): string');
        expect(DOCS_THEME_SOURCE).toContain('new Intl.NumberFormat(locale, {');
        expect(DOCS_THEME_SOURCE).toContain('if (display?.goalText) return display.goalText;');
        // Progress bar toward the localized monthly goal.
        expect(DOCS_THEME_SOURCE).toContain('function renderHostedSupportProgress(status: HostedSupportStatus): HTMLElement | null');
        expect(DOCS_THEME_SOURCE).toContain("track.setAttribute('role', 'progressbar');");
        expect(DOCS_THEME_SOURCE).toContain("fill.className = 'yomu-support-banner-progress-fill';");
        // Manual providers render only when the Worker reports an enabled https URL.
        expect(DOCS_THEME_SOURCE).toContain('function renderHostedSupportProviderButtons(status: HostedSupportStatus): HTMLElement[]');
        expect(DOCS_THEME_SOURCE).toContain("if (!provider?.enabled || provider.id === 'stripe') continue;");
        expect(DOCS_THEME_SOURCE).toContain('const url = safeHostedHttpsUrl(provider.url);');
        // Docs and newtab share the same quieter support-banner policy.
        expect(DOCS_THEME_SOURCE).toContain('shouldShowSupportBannerImpression');
        expect(DOCS_THEME_SOURCE).toContain('rememberSupportBannerDismissal');
        expect(DOCS_THEME_SOURCE).toContain('function shouldShowHostedSupportBannerImpression(version: string): boolean');
        expect(DOCS_THEME_SOURCE).toContain('function rememberHostedSupportDismissal(version: string): void');
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
        expect(help.textContent).toContain('Install AnkiConnect and keep desktop Anki open');
        expect(help.textContent).toContain('webCorsOriginList');
        expect(help.textContent).toContain('Mobile handoff creates notes only.');
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

        expect(DEFAULT_SETTINGS.suppressAutoAudioOnVideo).toBe(true);
        expect(DEFAULT_SETTINGS.popoverBackdropEnabled).toBe(true);
        expect(videoAudio.checked).toBe(true);
        expect(backdrop.checked).toBe(true);

        videoAudio.checked = false;
        backdrop.checked = false;

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.suppressAutoAudioOnVideo).toBe(false);
        expect(saved.popoverBackdropEnabled).toBe(false);
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
        expect(fontWeight.value).toBe('400');
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
        expect(help.textContent).toContain('Install AnkiConnect and keep desktop Anki open');
        expect(help.textContent).toContain('webCorsOriginList');
        expect(help.textContent).toContain('Mobile handoff creates notes only.');
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

    it('restores YouTube filter controls and the default YouTube shortcut', () => {
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
        expect(DEFAULT_SETTINGS.shortcuts.toggleYoutubeImmersion).toBe('Shift+Y');
        expect(filter.checked).toBe(true);
        expect(siteLanguage.checked).toBe(true);
        expect(channelSuggestions.checked).toBe(true);
        expect(notice.checked).toBe(true);
        expect(shortcut.value).toBe('Shift+Y');

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
        expect(optionText(form, 'newTabSource', 'auto')).toBe('自動: Academy・アカウント後に学習語');
        expect(optionText(form, 'newTabSource', 'jpdb')).toBe('API SRS（Jiten / JPDB）');
        expect(optionText(form, 'newTabJpdbReviewMode', 'api-vocabulary')).toBe('API語彙のみ（デッキ順）');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('Bunproに必要なのはフロントエンドトークンだけです');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('Academyの復習はアカウントなしでも使えます');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('Bunpro設定から取り込み');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('パスワードと同様に扱ってください');
        expect(settingsText(form, '[data-jpdb-api-key-help]')).toContain('保存時点では未確認');
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
        expect(labelForControl(form, 'subtitleShadowAutoPause')).toContain('シャドー中は各行の後で一時停止');
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
            roundedLabel: '日本語丸ゴシック',
        });
        expectFontFamilyOptions(form, 'popupFontFamily', {
            defaultLabel: '内蔵フォント',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
            roundedLabel: '日本語丸ゴシック',
        });
        expectFontFamilyOptions(form, 'subtitleFontFamily', {
            defaultLabel: '内蔵フォント',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
            roundedLabel: '日本語丸ゴシック',
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
