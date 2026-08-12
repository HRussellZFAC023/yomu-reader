import { describe, expect, it } from 'vitest';
import {
    AMBIGUOUS_SCAN_COPY,
    ANKI_SOURCE_ID,
    BASE_DEFAULT_SETTINGS,
    CURRENT_YOMU_VERSION,
    DEFAULT_SETTINGS,
    accentToRgba,
    accessibleOcrBackgroundColor,
    accessibleOcrBackgroundOpacity,
    activateSettingsPanel,
    applySettingsSearch,
    checkboxValue,
    compositeOverWhiteHex,
    contrastRatio,
    effectiveFuriganaMode,
    effectiveReaderTextColorSource,
    labelForControl,
    legacyStoredSettings,
    localizeSettingsForm,
    normalizeReaderSettings,
    optionText,
    radioValue,
    readFormSettings,
    reconcileApiCredentialInputs,
    registerSettingsFormCleanup,
    renderSettingsForm,
    renderSettingsTestForm,
    selectValue,
    settingsText,
    shouldLookupAnkiStatus,
    topLevelLegendForControl,
    topLevelLegendsForControl,
} from './fixtures';
import type {
    LegacyPitchSettings,
} from './fixtures';

describe('settings form localization', () => {
    registerSettingsFormCleanup();

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
        // The form renders and the reader filters in ONE declared order now
        // (WORD_COLOR_HIDE_STATE_GROUPS: known,due,failed,learning,new,ignored). It
        // used to render in that order and read back in a different one — two copies
        // of the same list, which is how the ignored family came to be missing from
        // one of them. Order is not load-bearing (both consumers build a Set) but it
        // is now consistent with what the user sees.
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).wordColorHiddenStateGroups).toEqual(['known', 'due']);
    });

    // GitHub #37 (mirrormc): every word state had a "hide color for" checkbox except
    // the ignored/suspended/blacklisted family, which has its own colour and its own
    // picker. `wordColorHiddenStateGroups` was typed with the FURIGANA taxonomy, a
    // five-member union with no ignored member, so the control could not exist — and
    // the normalizer would have dropped the value on load even if it had.
    it('offers one hide-color switch for the ignored, suspended and blacklisted family', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const ignoredBox = form.querySelector<HTMLInputElement>('input[name="colorHide-ignored"]');
        expect(ignoredBox).not.toBeNull();
        // One switch, not three: the three states share one colour and one picker, so
        // three checkboxes would promise control the colour layer cannot express.
        expect(form.querySelector('input[name="colorHide-suspended"]')).toBeNull();
        expect(form.querySelector('input[name="colorHide-blacklisted"]')).toBeNull();

        ignoredBox!.checked = true;
        expect(readFormSettings(new FormData(form), DEFAULT_SETTINGS).wordColorHiddenStateGroups)
            .toEqual(['ignored']);
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
        const configured = { ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten-key' };
        const form = renderSettingsTestForm(configured);
        const jpdbInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;
        const jitenInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJiten"]')!;

        expect(labelForControl(form, 'apiCredentialJpdb')).toContain('JPDB API key');
        expect(labelForControl(form, 'apiCredentialJiten')).toContain('Jiten API key');
        expect(jpdbInput.value).toBe('');
        expect(jitenInput.value).toBe('');
        expect(jpdbInput.placeholder).toContain('Saved');
        expect(form.innerHTML).not.toContain('jpdb-key');
        expect(form.innerHTML).not.toContain('ak_jiten-key');
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

        let saved = readFormSettings(new FormData(form), configured);
        expect(saved.apiKey).toBe('jpdb-key');
        expect(saved.jitenApiKey).toBe('ak_jiten-key');

        jpdbInput.value = '  next-jpdb  ';
        jitenInput.value = '';
        saved = readFormSettings(new FormData(form), configured);
        expect(saved.apiKey).toBe('next-jpdb');
        expect(saved.jitenApiKey).toBe('ak_jiten-key');

        form.querySelector<HTMLInputElement>('input[name="apiCredentialJiten.clearStoredCredential"]')!.checked = true;
        saved = readFormSettings(new FormData(form), configured);
        expect(saved.apiKey).toBe('next-jpdb');
        expect(saved.jitenApiKey).toBe('');

        // Both at once stay both; a jiten-prefixed key in the JPDB slot routes.
        jpdbInput.value = 'next-jpdb';
        jitenInput.value = ' ak_next-jiten ';
        saved = readFormSettings(new FormData(form), configured);
        expect(saved.apiKey).toBe('next-jpdb');
        expect(saved.jitenApiKey).toBe('ak_next-jiten');

        jpdbInput.value = 'ak_misplaced';
        jitenInput.value = '';
        saved = readFormSettings(new FormData(form), configured);
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

    it('never renders stored provider or OCR credentials into the host-page DOM', () => {
        const configured = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-private',
            jitenApiKey: 'ak_jiten-private',
            bunproFrontendApiToken: 'bunpro-private',
            wanikaniApiToken: 'wanikani-private',
            nadeshikoApiKey: 'nadeshiko-private',
            ocrCloudVisionApiKey: 'cloud-private',
            immersionKitExampleSource: 'nadeshiko' as const,
            ocrProvider: 'cloud-vision' as const,
        };
        const form = renderSettingsTestForm(configured);
        const secretFields = [
            'apiCredentialJpdb',
            'apiCredentialJiten',
            'apiCredentialBunpro',
            'apiCredentialWanikani',
            'nadeshikoApiKey',
            'ocrCloudVisionApiKey',
        ];

        for (const secret of [
            configured.apiKey,
            configured.jitenApiKey,
            configured.bunproFrontendApiToken,
            configured.wanikaniApiToken,
            configured.nadeshikoApiKey,
            configured.ocrCloudVisionApiKey,
        ]) expect(form.innerHTML).not.toContain(secret);
        for (const name of secretFields) {
            expect(form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value).toBe('');
        }

        const saved = readFormSettings(new FormData(form), configured);
        expect(saved).toMatchObject({
            apiKey: configured.apiKey,
            jitenApiKey: configured.jitenApiKey,
            bunproFrontendApiToken: configured.bunproFrontendApiToken,
            wanikaniApiToken: configured.wanikaniApiToken,
            nadeshikoApiKey: configured.nadeshikoApiKey,
            ocrCloudVisionApiKey: configured.ocrCloudVisionApiKey,
        });

        localizeSettingsForm(form, 'en');
        expect(optionText(form, 'newTabKanjiKeywordSource', 'auto')).toContain('Jiten + JPDB');
        expect(settingsText(form, '[data-jpdb-status]')).toContain('Jiten and JPDB');
        expect(settingsText(form, '[data-bunpro-status]')).toContain('saved');
        expect(settingsText(form, '[data-wanikani-status]')).toContain('saved');
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
        expect(DEFAULT_SETTINGS.furiganaMode).toBe('all');
        expect(DEFAULT_SETTINGS.furiganaHiddenStateGroups).toEqual(['known', 'due', 'failed']);
        expect(DEFAULT_SETTINGS.wordColorStates).toBe('all');
        // Per-state colour opt-out defaults to empty (colour every state) so existing
        // installs keep their colouring; normalize drops invalid/duplicate groups.
        expect(DEFAULT_SETTINGS.wordColorHiddenStateGroups).toEqual([]);
        expect(normalizeReaderSettings({}).wordColorHiddenStateGroups).toEqual([]);
        expect(normalizeReaderSettings({ wordColorHiddenStateGroups: ['known', 'known', 'bogus', 'due'] as never }).wordColorHiddenStateGroups).toEqual(['known', 'due']);
        expect(effectiveFuriganaMode(DEFAULT_SETTINGS)).toBe('all');
        expect(normalizeReaderSettings({ apiKey: '', jitenApiKey: 'ak_jiten-key', ankiEnabled: false, furiganaMode: 'auto' }).furiganaMode).toBe('all');
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

    it('migrates a stale default lookup-link row without re-sorting an arranged one', () => {
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
        expect(migratedFromPriorDefault.dictionaryLookupLinks.map(link => link.id).slice(-4)).toEqual(['immersion-kit', 'nadeshiko', 'uchisen', 'copy']);

        // A row that is nobody's default is a row somebody arranged. Until
        // v1.8.78 normalization spliced Jiten back above JPDB on EVERY load, so
        // dragging the JPDB pill to the front was undone by the same save that
        // stored it -- the pill half of "it still jams jiten to the top".
        const custom = normalizeReaderSettings({
            dictionaryLookupLinks: [
                { ...defaultLinks.get('jpdb')! },
                { id: 'custom-search', label: 'Custom', urlTemplate: 'https://example.com/?q={query}', enabled: true },
                { ...defaultLinks.get('jiten')! },
            ],
        });
        const customIds = custom.dictionaryLookupLinks.map(link => link.id);
        expect(customIds.indexOf('jpdb')).toBeLessThan(customIds.indexOf('jiten'));
        expect(customIds.slice(0, 3)).toEqual(['jpdb', 'custom-search', 'jiten']);
    });

    it('expands the old untouched three-example Immersion Kit default while preserving deliberate limits', () => {
        expect(DEFAULT_SETTINGS).toMatchObject({
            immersionKitExpandedLimitMigrated20260721: true,
            immersionKitLimitEnabled: false,
            immersionKitLimit: 12,
        });

        expect(normalizeReaderSettings({
            immersionKitLimitEnabled: true,
            immersionKitLimit: 3,
        })).toMatchObject({
            immersionKitExpandedLimitMigrated20260721: true,
            immersionKitLimitEnabled: false,
            immersionKitLimit: 12,
        });

        expect(normalizeReaderSettings({
            immersionKitExpandedLimitMigrated20260721: true,
            immersionKitLimitEnabled: true,
            immersionKitLimit: 3,
        })).toMatchObject({
            immersionKitLimitEnabled: true,
            immersionKitLimit: 3,
        });

        expect(normalizeReaderSettings({
            immersionKitLimitEnabled: true,
            immersionKitLimit: 5,
        })).toMatchObject({
            immersionKitLimitEnabled: true,
            immersionKitLimit: 5,
        });
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
        expect(labelForControl(form, 'pageScanMode')).toContain('Leave pages unchanged');
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

});
