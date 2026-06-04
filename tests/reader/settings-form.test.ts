import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANKI_SOURCE_ID } from '../../src/reader/constants';
import { applyNestedParsePlan, nestedSettingsTextParsePlan } from '../../src/reader/nested-text-parse';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { activateSettingsPanel, applySettingsSearch, localizeSettingsForm, readFormSettings, renderHelpLinksPanel, renderSettingsForm } from '../../src/reader/settings-form';
import { CUSTOM_FONT_FAMILY_VALUE } from '../../src/reader/settings-form-read';
import { orderedDefinitionSourceIds } from '../../src/reader/source-sections';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');
const HISTORICAL_HIRAGINO_YU_GOTHIC_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';

function topLevelLegendForControl(form: HTMLFormElement, controlName: string): string {
    const control = form.querySelector<HTMLElement>(`[name="${controlName}"]`);
    const fieldset = control?.closest<HTMLFieldSetElement>('fieldset[data-settings-panel]');
    const legend = Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.tagName === 'LEGEND',
    );

    return legend?.textContent ?? '';
}

function labelForControl(form: HTMLFormElement, controlName: string): string {
    return form.querySelector<HTMLElement>(`[name="${controlName}"]`)?.closest('label')?.textContent ?? '';
}

function optionText(form: HTMLFormElement, controlName: string, value: string): string {
    const option = Array.from(form.querySelector<HTMLSelectElement>(`[name="${controlName}"]`)?.options ?? [])
        .find(item => item.value === value);
    return option?.textContent ?? '';
}

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

        for (const key of ['video-player', 'new-tab', 'docs', 'donate', 'issues', 'discord']) {
            expect(form.querySelector(`[data-help-link="${key}"] svg`)).not.toBeNull();
        }
        expect(form.querySelector('[data-help-link="factory-reset"] svg')).toBeNull();

        localizeSettingsForm(form, 'ja');

        expect(form.querySelector('[data-help-link="video-player"]')?.textContent).toContain('動画プレイヤー');
        expect(form.querySelector('[data-help-link="video-player"] svg')).not.toBeNull();
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

        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="jpdb"]')?.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="jpdb"]')?.hidden).toBe(false);
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="audio"]')?.hidden).toBe(true);
    });

    it('uses roving tabs for settings sections', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const tablist = form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs')!;
        const buttons = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]'));

        expect(tablist.getAttribute('role')).toBe('tablist');
        expect(buttons.every(button => button.getAttribute('role') === 'tab')).toBe(true);
        expect(buttons.map(button => button.dataset.panel)).toContain('jpdb');
        expect(buttons.map(button => button.dataset.panel)).toContain('newTab');
        expect(buttons.map(button => button.dataset.panel)).toContain('appearance');
        expect(buttons.map(button => button.dataset.panel)).toContain('reading');
        expect(buttons.find(button => button.dataset.panel === 'media')?.getAttribute('aria-controls')).toContain('jpdb-reader-settings-panel-audio');
        expect(buttons[0]?.getAttribute('aria-selected')).toBe('true');
        expect(buttons[0]?.tabIndex).toBe(0);
        expect(buttons.slice(1).every(button => button.getAttribute('aria-selected') === 'false' && button.tabIndex === -1)).toBe(true);
    });

    it('gives New tab settings their own top-level section', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(topLevelLegendForControl(form, 'newTabEnabled')).toBe('New tab');
        expect(topLevelLegendForControl(form, 'newTabJpdbReviewMode')).toBe('New tab');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="newTab"]')?.hidden).toBe(true);
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="newTab"]')).not.toBeNull();
    });

    it('splits the old Basics bucket into JPDB, Appearance, and Reading sections', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(topLevelLegendForControl(form, 'apiKey')).toBe('JPDB');
        expect(topLevelLegendForControl(form, 'accentColor')).toBe('Appearance');
        expect(topLevelLegendForControl(form, 'lookupOnHover')).toBe('Reader');
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="basics"]')).toBeNull();

        activateSettingsPanel(form, 'basics');

        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="jpdb"]')?.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-settings-panel="jpdb"]')?.hidden).toBe(false);
    });

    it('keeps hover lookup timing with Reader settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');

        expect(topLevelLegendForControl(form, 'shortcuts.hoverLookup')).toBe('リーダー');
        expect(topLevelLegendForControl(form, 'hoverOpenDelayMs')).toBe('リーダー');
        expect(form.querySelector<HTMLElement>('[data-hover-lookup-title]')?.textContent).toBe('ホバー検索');
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="shortcuts"]')?.textContent).not.toContain('Hover open delay');
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
        expect(form.querySelector<HTMLElement>('[data-diagnostics-help]')?.textContent).toContain('トラブルシューティング');
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
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="jpdb"] legend')?.textContent).toBe('JPDB');
        expect(form.querySelector<HTMLElement>('[data-help-key="readerHelp"]')?.textContent).toContain('このパネル');
    });

    it('links major help text to the fieldsets it describes', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        for (const key of ['audio', 'immersionKit', 'reader', 'kanji', 'images', 'youTube', 'anki']) {
            const fieldset = form.querySelector<HTMLFieldSetElement>(`fieldset[data-legend-key="${key}"]`)!;
            const describedby = fieldset.getAttribute('aria-describedby');
            expect(describedby).toBeTruthy();
            expect(form.querySelector(`#${describedby}`)).not.toBeNull();
        }
    });

    it('keeps checked checkbox and radio marks visible on hover', () => {
        const normalizedCss = SETTINGS_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:enabled:hover, .jpdb-reader-settings input[type="radio"]:enabled:hover { border-color: var(--jpdb-reader-accent);');
        expect(normalizedCss).toContain('box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft);');
        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:checked, .jpdb-reader-settings input[type="radio"]:checked { border-color: var(--jpdb-reader-accent); background: var(--jpdb-reader-accent); box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft); }');
        expect(normalizedCss).toContain('.jpdb-reader-settings input[type="checkbox"]:checked:enabled:hover, .jpdb-reader-settings input[type="radio"]:checked:enabled:hover { background: var(--jpdb-reader-accent); }');
        expect(normalizedCss).toContain('border-left: 2.5px solid var(--jpdb-reader-accent-text); border-bottom: 2.5px solid var(--jpdb-reader-accent-text);');
        expect(normalizedCss).toContain('background: var(--jpdb-reader-accent-text);');
        expect(normalizedCss).toContain('@media (pointer: coarse) and (min-width: 700px) and (max-width: 900px)');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
        expect(normalizedCss).toContain('.jpdb-reader-settings-tabs { flex-wrap: wrap; overflow-x: visible; }');
        expect(normalizedCss).toContain('.jpdb-reader-settings .grid > .jpdb-reader-settings-field-number, .jpdb-reader-settings .grid > .jpdb-reader-settings-field-color { display: grid; grid-template-columns: minmax(0, 1fr) auto;');
        expect(normalizedCss).toContain('.jpdb-reader-settings .jpdb-reader-word { display: inline !important;');
        expect(normalizedCss).toContain('.jpdb-reader-audio-source-choice .jpdb-reader-icon-mini { grid-column: 2; grid-row: 1; }');
        expect(normalizedCss).toContain('.jpdb-reader-audio-source-choice .jpdb-reader-select-options-meta { grid-column: 1 / -1; }');
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

    it('renders JPDB and Anki connection status lights in settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', ankiEnabled: false }, 'https://jpdb.io/settings');

        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.dataset.statusTone).toBe('success');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Ready:');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('JPDB API key available');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Review buttons: enabled');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Deck changes: enabled');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.dataset.statusTone).toBe('pending');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('Anki mining disabled');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('AnkiMobile/AnkiDroid handoff is on for creating new notes only');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('review queues require desktop Anki with AnkiConnect');

        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', enableReviews: false, jpdbMiningEnabled: false }, 'https://jpdb.io/settings');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.dataset.statusTone).toBe('pending');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Needs setup:');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Review buttons: disabled');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Deck changes: disabled');

        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, apiKey: '' }, 'https://jpdb.io/settings');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.dataset.statusTone).toBe('pending');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Needs setup:');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('JPDB API key missing');
        expect(form.querySelector<HTMLElement>('[data-jpdb-status]')?.textContent).toContain('Public lookup still works');
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
        expect(description?.textContent).toContain('currently unavailable because another setting controls it');
    });

    it('shows AnkiConnect and mobile handoff availability in the Anki settings panel', () => {
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
        expect(status.textContent).toContain('Checking AnkiConnect at http://192.168.1.8:8765');
        expect(status.textContent).toContain('AnkiMobile/AnkiDroid handoff is off');
        expect(status.textContent).toContain('review queues require desktop Anki with AnkiConnect');
        expect(adapter.textContent).toContain('Use Scan after AnkiConnect is reachable');
        expect(adapter.textContent).toContain('RTK/Core-style decks');
        const helpLink = form.querySelector<HTMLAnchorElement>('[data-anki-setup-help] a[href="https://ankiweb.net/shared/info/2055492159"]');
        expect(helpLink?.textContent).toContain('Open AnkiConnect add-on');
        expect(form.querySelector<HTMLElement>('[data-anki-setup-help]')?.textContent).toContain('keep the よむ userscript enabled');
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

    it('persists font presets, custom font stacks, pause panel, and word navigation shortcuts', () => {
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

        expect(readerFontFamily.value).toBe(DEFAULT_SETTINGS.readerFontFamily);
        expect(fontFamily.value).toBe(DEFAULT_SETTINGS.popupFontFamily);
        expectFontFamilyOptions(form, 'readerFontFamily', {
            defaultLabel: 'Yomu default',
            systemLabel: 'System UI',
            customLabel: 'Custom...',
            historicalLabel: 'Hiragino / Yu Gothic',
        });
        expectFontFamilyOptions(form, 'popupFontFamily', {
            defaultLabel: 'Yomu default',
            systemLabel: 'System UI',
            customLabel: 'Custom...',
            historicalLabel: 'Hiragino / Yu Gothic',
        });
        expectFontFamilyOptions(form, 'subtitleFontFamily', {
            defaultLabel: 'Yomu default',
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

        const saved = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, subtitleTranscriptPlacement: 'bottom' });

        expect(saved.readerFontFamily).toBe('"Inter", system-ui, sans-serif');
        expect(saved.popupFontFamily).toBe('"Noto Sans JP", sans-serif');
        expect(saved.subtitleFontFamily).toBe('"Yu Mincho", serif');
        expect(saved.popupFontWeight).toBe(420);
        expect(saved.subtitlePausePanel).toBe(true);
        expect(saved.subtitleTranscriptPlacement).toBe('bottom');
        expect(saved.shortcuts.previousLookupWord).toBe('Alt+H');
        expect(saved.shortcuts.nextLookupWord).toBe('Alt+L');
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

        expect(DEFAULT_SETTINGS.newTabAnkiEnabled).toBe(true);
        expect(newTabAnkiToggle?.checked).toBe(true);
        expect(ankiMiningToggle?.checked).toBe(false);

        newTabAnkiToggle!.checked = false;

        const saved = readFormSettings(new FormData(form), { ...DEFAULT_SETTINGS, ankiEnabled: false });
        expect(saved.newTabAnkiEnabled).toBe(false);
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

        expect(DEFAULT_SETTINGS.ankiSectionEnabled).toBe(true);
        expect(orderedDefinitionSourceIds({ ...DEFAULT_SETTINGS, ankiEnabled: false }, [])).toContain(ANKI_SOURCE_ID);
        expect(ankiRow.textContent).toContain('Anki');
        expect(ankiRow.textContent).toContain('Existing Anki card contents and status');
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

    it('stores Anki new-tab deck skips through the hidden toggle value', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            newTabAnkiDisabledDecks: ['Archive', 'Old Mining'],
        }, 'https://jpdb.io/settings');
        const hidden = form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]');
        const newTabPanel = form.querySelector<HTMLElement>('[data-settings-panel="newTab"]')!;

        expect(hidden?.type).toBe('hidden');
        expect(hidden?.value).toBe('Archive, Old Mining');
        expect(newTabPanel.textContent).not.toContain('Anki review decks');
        expect(newTabPanel.textContent).not.toContain('Scan Anki to load deck toggles');
        expect(newTabPanel.querySelector('[data-newtab-anki-decks]')).toBeNull();
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

        expect(hidden?.value).toBe('Japanese, Archive');
        expect(form.querySelector('[data-newtab-anki-decks]')).toBeNull();

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.newTabAnkiDisabledDecks).toEqual(['Japanese', 'Archive']);
    });

    it('round-trips scanned Anki field mappings through the settings form', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            ankiModel: 'Imported',
            ankiFieldMappings: {
                Imported: {
                    expression: 'Headword',
                    reading: 'Kana',
                    meaning: 'Glossary',
                },
            },
        }, 'https://jpdb.io/settings');
        const hidden = form.querySelector<HTMLInputElement>('input[name="ankiFieldMappings"]');

        expect(hidden?.type).toBe('hidden');
        expect(JSON.parse(hidden?.value ?? '{}')).toEqual({
            Imported: {
                expression: 'Headword',
                reading: 'Kana',
                meaning: 'Glossary',
            },
        });
        expect(form.querySelector<HTMLElement>('[data-anki-library-adapter]')?.textContent).toContain('Existing library adapter');
        expect(form.querySelector<HTMLElement>('[data-anki-library-choices-title]')?.textContent).toBe('Deck and note type');
        expect(form.querySelector<HTMLElement>('[data-anki-template-settings-title]')?.textContent).toBe('Yomu card template');
        expect(form.querySelector<HTMLSelectElement>('select[data-anki-field-role="expression"]')?.value).toBe('Headword');
        expect(form.querySelector<HTMLSelectElement>('select[data-anki-field-role="reading"]')?.value).toBe('Kana');
        expect(form.querySelector<HTMLSelectElement>('select[data-anki-field-role="meaning"]')?.value).toBe('Glossary');

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.ankiFieldMappings).toEqual({
            Imported: {
                expression: 'Headword',
                reading: 'Kana',
                meaning: 'Glossary',
            },
        });
    });

    it('labels mobile Anki handoff as a fallback and keeps new-note-only details in help', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'en');

        expect(labelForControl(form, 'ankiMobileHandoff')).toContain('mobile Anki handoff fallback');
        expect(labelForControl(form, 'ankiMobileHandoff')).not.toContain('AnkiConnect is unavailable');
        expect(form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.textContent).toBe('Check AnkiConnect');
        expect(form.querySelector<HTMLButtonElement>('[data-action="prepare-anki"]')?.textContent).toBe('Create Yomu note type');
        expect(form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')?.textContent).toBe('Scan existing decks');
        expect(form.querySelector<HTMLElement>('[data-anki-setup-help]')?.textContent).toContain('Core/RTK-style or other nonstandard decks');
        expect(form.querySelector<HTMLElement>('[data-anki-setup-help]')?.textContent).toContain('Mobile handoff only creates new notes');
    });

    it('keeps top-level section legends attached to their panels', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'en');

        expect(topLevelLegendForControl(form, 'subtitlePlayerEnabled')).toBe('Video');
        expect(topLevelLegendForControl(form, 'youtubeImmersionEnabled')).toBe('YouTube');
        expect(topLevelLegendForControl(form, 'preferJapaneseSiteLanguage')).toBe('YouTube');
        expect(topLevelLegendForControl(form, 'ankiEnabled')).toBe('Anki');
        expect(topLevelLegendForControl(form, 'jpdbDefinitionsEnabled')).toBe('Dictionaries');
        expect(topLevelLegendForControl(form, 'shortcuts.openSettings')).toBe('Shortcuts');
        expect(form.querySelector('.jpdb-reader-radio-group > legend')?.textContent).toBe('Examples per word limit');
    });

    it('restores YouTube filter controls and the Alt+Y shortcut', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const filter = form.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]')!;
        const siteLanguage = form.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]')!;
        const notice = form.querySelector<HTMLInputElement>('input[name="youtubeShowFilterNotice"]')!;
        const shortcut = form.querySelector<HTMLInputElement>('input[name="shortcuts.toggleYoutubeImmersion"]')!;

        expect(DEFAULT_SETTINGS.youtubeImmersionEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.preferJapaneseSiteLanguage).toBe(true);
        expect(DEFAULT_SETTINGS.youtubeShowFilterNotice).toBe(true);
        expect(DEFAULT_SETTINGS.shortcuts.toggleYoutubeImmersion).toBe('Alt+Y');
        expect(filter.checked).toBe(true);
        expect(siteLanguage.checked).toBe(true);
        expect(notice.checked).toBe(true);
        expect(shortcut.value).toBe('Alt+Y');

        filter.checked = false;
        siteLanguage.checked = false;
        notice.checked = false;
        shortcut.value = 'Ctrl+Y';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.youtubeImmersionEnabled).toBe(false);
        expect(saved.preferJapaneseSiteLanguage).toBe(false);
        expect(saved.youtubeShowFilterNotice).toBe(false);
        expect(saved.shortcuts.toggleYoutubeImmersion).toBe('Ctrl+Y');
    });

    it('localizes Japanese settings copy added outside the original labels', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        localizeSettingsForm(form, 'ja');

        expect(form.lang).toBe('ja');
        expect(form.querySelector('h2')?.textContent).toBe('よむ 設定');
        expect(labelForControl(form, 'newTabJpdbReviewMode')).toContain('JPDB復習モード');
        expect(optionText(form, 'newTabJpdbReviewMode', 'api-vocabulary')).toBe('API語彙のみ');
        expect(labelForControl(form, 'newTabKanjiKeywordSource')).toContain('漢字キーワードのソース');
        expect(labelForControl(form, 'newTabParsingEnabled')).toContain('新規タブの文解析を有効にする');
        expect(labelForControl(form, 'preferJapaneseSiteLanguage')).toContain('サイトの言語と地域を日本優先にする');
        expect(optionText(form, 'audioAutoPlayMode', 'all')).toBe('ホバーとタップ/クリック');
        expect(labelForControl(form, 'readerFontFamily')).toContain('リーダーUIフォント');
        expect(labelForControl(form, 'popupFontFamily')).toContain('ポップアップの日本語フォント');
        expect(labelForControl(form, 'subtitleFontFamily')).toContain('字幕フォントファミリー');
        expectFontFamilyOptions(form, 'readerFontFamily', {
            defaultLabel: 'よむ既定',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
        });
        expectFontFamilyOptions(form, 'popupFontFamily', {
            defaultLabel: 'よむ既定',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
        });
        expectFontFamilyOptions(form, 'subtitleFontFamily', {
            defaultLabel: 'よむ既定',
            systemLabel: 'システムUI',
            customLabel: 'カスタム...',
            historicalLabel: 'ヒラギノ / 游ゴシック',
        });
        expect(labelForControl(form, 'subtitlePausePanel')).toContain('一時停止時にサイドパネルを開く');
        expect(labelForControl(form, 'shortcuts.nextLookupWord')).toContain('次の単語');
        expect(form.querySelector('.jpdb-reader-radio-group > legend')?.textContent).toBe('単語ごとの例文数制限');
        expect(form.querySelector('.jpdb-reader-lookup-link-head span:nth-child(3)')?.textContent).toBe('検索URLテンプレート');
        expect(form.querySelector('.jpdb-reader-template-preview-title')?.textContent).toBe('単語を先に表示するプリセット');
        expect(form.querySelector('.jpdb-reader-template-meaning')?.textContent).toBe('読む');
        expect(form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.textContent).toBe('AnkiConnectを確認');
        expect(form.querySelector<HTMLButtonElement>('[data-action="prepare-anki"]')?.textContent).toBe('よむノートタイプを作成');
        expect(form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')?.textContent).toBe('既存デッキをスキャン');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('AnkiMobile/AnkiDroidへの受け渡しはオン');
        expect(form.querySelector<HTMLElement>('[data-anki-library-availability]')?.textContent).toContain('RTK/Core系');
        expect(form.querySelector<HTMLElement>('[data-anki-library-choices-title]')?.textContent).toBe('デッキとノートタイプ');
        expect(form.querySelector<HTMLElement>('[data-anki-template-settings-title]')?.textContent).toBe('よむカードテンプレート');
        expect(form.querySelector<HTMLElement>('[data-theme-switch]')?.title).toBe('ダークテーマに切り替え');
        expect(form.querySelector<HTMLElement>('[data-theme-switch]')?.getAttribute('aria-labelledby')).toBe('jpdb-reader-theme-label');
        expect(form.querySelector<HTMLElement>('[data-theme-switch]')?.getAttribute('aria-describedby')).toBe('jpdb-reader-theme-label');
        expect(form.querySelector('[data-proxy-guide-show]')?.textContent).toBe('表示');
        expect(form.querySelector('[data-proxy-guide-hide]')?.textContent).toBe('隠す');
        expect(form.querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')?.getAttribute('aria-label')).toContain('検索ピル');
        expect(form.querySelector('[data-help-links-title]')?.textContent).toBe('便利なページ');
        expect(form.querySelector('[data-help-support-title]')?.textContent).toBe('よむをサポート');
        expect(form.querySelector('[data-help-link="factory-reset"]')?.textContent).toBe('初期状態に戻す');
        expect(form.querySelector('[data-help-glossary-title]')).toBeNull();

        const text = form.textContent ?? '';
        [
            'New tab review source',
            'JPDB review mode',
            'Kanji keyword source',
            'Parse sentences on new tab',
            'Examples per word limit',
            'Lookup pills',
            'Term dictionaries',
            'Factory Reset',
            'Useful pages',
            'Support よむ',
            'Glossary',
            'Word first preset',
            'to read',
        ].forEach(phrase => expect(text).not.toContain(phrase));
        expect(text).not.toContain('未翻訳');
    });

    it('adds Japanese select option metadata for lookup without duplicating it on relocalize', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const languageSelect = form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;

        localizeSettingsForm(form, 'ja');
        localizeSettingsForm(form, 'ja');

        const metadata = languageSelect.parentElement?.querySelectorAll('[data-settings-select-options-meta]') ?? [];
        expect(metadata).toHaveLength(1);
        expect(metadata[0]?.textContent).toBe('選択肢: 自動 / 英語 / 日本語');

        localizeSettingsForm(form, 'en');

        expect(languageSelect.parentElement?.querySelector('[data-settings-select-options-meta]')).toBeNull();
    });

    it('keeps parsed audio source metadata out of the preview button column', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');
        activateSettingsPanel(form, 'media');
        const sourceChoice = form.querySelector<HTMLElement>('[data-audio-source-row] .jpdb-reader-audio-source-choice')!;
        const meta = sourceChoice.querySelector<HTMLElement>('[data-settings-select-options-meta]')!;

        expect(meta.textContent).toContain('ブラウザ読み上げ');

        const plan = nestedSettingsTextParsePlan(form, 640)!;
        const targetIndex = plan.targets.findIndex(target => target.text === meta.textContent);
        expect(targetIndex).toBeGreaterThanOrEqual(0);
        const parsed = plan.targets.map(() => [] as JPDBToken[]);
        const browserStart = meta.textContent!.indexOf('ブラウザ読み上げ');
        parsed[targetIndex] = [
            settingsToken('選択肢', 0, 'せんたくし'),
            settingsToken('ブラウザ', browserStart),
            settingsToken('読み上げ', browserStart + 'ブラウザ'.length, 'よみあげ'),
        ];

        applyNestedParsePlan(plan, parsed, DEFAULT_SETTINGS);

        expect(sourceChoice.querySelector<HTMLElement>('.jpdb-reader-icon-mini')?.nextElementSibling).toBeNull();
        expect(meta.querySelectorAll('.jpdb-reader-word')).toHaveLength(3);
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
        expect(label.textContent).toBe('閉じるまで下部シートを開いたままにする');
    });

    it('keeps parsed Japanese inline labels inside one grid item', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');
        const label = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')!.closest('label')!;
        const labelText = label.querySelector<HTMLElement>(':scope > .jpdb-reader-settings-label-text');

        expect(labelText?.textContent).toBe('JPDBの復習・デッキ変更を許可');

        const plan = nestedSettingsTextParsePlan(form, 640)!;
        const targetIndex = plan.targets.findIndex(target => target.text === 'JPDBの復習・デッキ変更を許可');
        expect(targetIndex).toBeGreaterThanOrEqual(0);
        const parsed = plan.targets.map(() => [] as JPDBToken[]);
        parsed[targetIndex] = [settingsToken('JPDB', 0)];

        applyNestedParsePlan(plan, parsed, DEFAULT_SETTINGS);

        expect(Array.from(label.children).filter(child => child.classList.contains('jpdb-reader-word'))).toHaveLength(0);
        expect(label.querySelector(':scope > .jpdb-reader-settings-label-text .jpdb-reader-word')?.textContent).toBe('JPDB');
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
