import { describe, expect, it } from 'vitest';
import {
    CUSTOM_FONT_FAMILY_VALUE,
    DEFAULT_SETTINGS,
    KANJI_SIMILAR_WORDS_SOURCE_ID,
    SETTINGS_CSS,
    expectFontFamilyOptions,
    installShortcutCapture,
    labelForControl,
    localizeSettingsForm,
    normalizeReaderSettings,
    optionText,
    orderedKanjiSourceIds,
    readFormSettings,
    registerSettingsFormCleanup,
    renderSettingsForm,
    renderSettingsTestForm,
    settingsText,
    settingsTone,
    syncSubtitlePreview,
    topLevelLegendForControl,
    topLevelLegendsForControl,
} from './fixtures';

describe('settings form localization', () => {
    registerSettingsFormCleanup();

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

});
