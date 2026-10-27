import { beforeAll, describe, expect, it } from 'vitest';
import { AMBIGUOUS_SCAN_COPY, DEFAULT_SETTINGS, applySettingsSearch, labelForControl, legacyStoredSettings, localizeSettingsForm, normalizeReaderSettings, optionText, radioValue, readFormSettings, reconcileApiCredentialInputs, registerSettingsFormCleanup, renderSettingsForm, renderSettingsTestForm, selectValue, settingsText, topLevelLegendsForControl } from './fixtures';
import type {
    LegacyPitchSettings,
} from './fixtures';

describe('settings form localization', () => {
    const localizedForms = new Map<'en' | 'ja', HTMLFormElement>();
    beforeAll(() => {
        for (const language of ['en', 'ja'] as const) {
            const form = renderSettingsTestForm({ ...DEFAULT_SETTINGS, interfaceLanguage: language });
            localizeSettingsForm(form, language);
            localizedForms.set(language, form);
        }
    });
    registerSettingsFormCleanup();

    it('searches localized settings across panels and clears back to the active tab', () => {
        const form = localizedForms.get('ja')!;

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
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="reviews"]')?.hidden).toBe(true);
        expect(form.querySelector<HTMLFieldSetElement>('fieldset[data-legend-key="audio"]')?.hidden).toBe(true);
    });

    it.each(['en', 'ja'] as const)('keeps every Settings control independently operable in %s', language => {
        const form = localizedForms.get(language)!;
        const controls = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], summary';
        for (const outer of form.querySelectorAll('a[href], button, [role="button"], summary')) {
            expect(outer.querySelector(controls), outer.outerHTML).toBeNull();
        }
        for (const label of form.querySelectorAll('label')) {
            expect(label.querySelector('a[href], button, summary, label'), label.outerHTML).toBeNull();
            expect(label.querySelectorAll('input:not([type="hidden"]), select, textarea').length, label.outerHTML).toBeLessThanOrEqual(1);
        }
        const credential = form.querySelector<HTMLInputElement>('[name="apiCredentialJiten"]')!;
        expect(credential.labels?.[0]?.textContent).toContain('Jiten');
        // Reviews: each service's Connect link opens its key page, outside the field's label.
        const link = credential.closest('[data-review-service="jiten"]')!.querySelector('a[data-review-service-connect]')!;
        expect(link.getAttribute('href')).toBe('https://jiten.moe/settings');
        expect(link.closest('label')).toBeNull();
    });

    it('reads per-state colour opt-out (colorHide-*) checkboxes into wordColorHiddenStateGroups', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, wordColorHiddenStateGroups: [] }, 'https://jpdb.io/settings');
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
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, wordColorHiddenStateGroups: [] }, 'https://jpdb.io/settings');
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

    it('renders and saves coexisting Jiten and JPDB API keys (UT-56)', () => {
        const configured = { ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten-key' };
        const form = renderSettingsTestForm(configured);
        const jpdbInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;
        const jitenInput = form.querySelector<HTMLInputElement>('input[name="apiCredentialJiten"]')!;

        expect(labelForControl(form, 'apiCredentialJpdb')).toContain('JPDB key');
        expect(labelForControl(form, 'apiCredentialJiten')).toContain('Jiten key');
        expect(jpdbInput.value).toBe('');
        expect(jitenInput.value).toBe('');
        expect(jpdbInput.placeholder).toContain('Saved');
        expect(form.innerHTML).not.toContain('jpdb-key');
        expect(form.innerHTML).not.toContain('ak_jiten-key');
        expect(form.querySelector<HTMLInputElement>('input[name="apiKey"]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="jitenApiKey"]')).toBeNull();
        expect(jpdbInput.getAttribute('autocapitalize')).toBe('off');
        expect(jpdbInput.getAttribute('spellcheck')).toBe('false');
        // A service with a key offers no Connect link; its row's dot says a key
        // is there, not that it is verified (the status line says that).
        const jitenConnect = form.querySelector<HTMLAnchorElement>('a[href="https://jiten.moe/settings"]');
        expect(jitenConnect?.textContent?.trim()).toBe('Connect');
        expect(jitenConnect?.getAttribute('aria-label')).toBe('Connect Jiten');
        expect(jitenConnect?.hidden).toBe(true);
        expect(form.querySelector('[data-review-service="jiten"] [data-review-service-dot]')?.getAttribute('aria-label')).toBe('Key added');
        expect(settingsText(form, '[data-review-service-text="bunproTokenHelp"]')).toContain('treat it like a password');
        expect(settingsText(form, '[data-review-service-text="bunproTokenHelp"]')).toContain('saved before it is verified');

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
        expect(normalizeReaderSettings({ apiKey: '  ak_legacy-jiten  ' })).toMatchObject({ apiKey: 'ak_legacy-jiten', jitenApiKey: '' });
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
        expect(optionText(form, 'newTabKanjiKeywordSource', 'jpdb')).toContain('Jiten + JPDB');
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

    it('preserves an explicit three-example limit without migration markers', () => {
        expect(DEFAULT_SETTINGS).toMatchObject({
            immersionKitLimitEnabled: false,
            immersionKitLimit: 12,
        });

        expect(normalizeReaderSettings({
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

    it('round-trips explicit page scanning modes and leaves Yomu off to the puck and toolbar', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');

        expect(radioValue(form, 'pageScanMode')).toBe('auto');
        expect([...form.querySelectorAll<HTMLInputElement>('input[name="pageScanMode"]')].map(input => input.value)).toEqual(['auto', 'manual']);
        expect(form.querySelector<HTMLElement>('[data-page-scan-manual-shortcut]')?.hidden).toBe(true);

        form.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="manual"]')!.checked = true;
        const manual = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(manual.annotationsPaused).toBe(false);
        expect(manual.manualScanEnabled).toBe(true);

        const off = { ...DEFAULT_SETTINGS, annotationsPaused: true, manualScanEnabled: true };
        const offForm = document.createElement('form');
        offForm.innerHTML = renderSettingsForm(off, 'https://jpdb.io/settings');
        expect(radioValue(offForm, 'pageScanMode')).toBe('manual');
        offForm.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="auto"]')!.checked = true;
        const stillOff = readFormSettings(new FormData(offForm), off);
        expect(stillOff.annotationsPaused).toBe(true);
        expect(stillOff.manualScanEnabled).toBe(false);
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

    it('preserves current Anki choices even when they match historical defaults', () => {
        const migrated = normalizeReaderSettings(legacyStoredSettings({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiMobileHandoff: true,
            ankiMineWithJpdb: true,
            newTabAnkiEnabled: true,
        }));

        expect(migrated.ankiEnabled).toBe(true);
        expect(migrated.ankiSectionEnabled).toBe(true);
        expect(migrated.ankiMobileHandoff).toBe(true);
        expect(migrated.ankiMineWithJpdb).toBe(true);
        expect(migrated.newTabAnkiEnabled).toBe(true);

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
        expect(customLegacyAnki.newTabAnkiEnabled).toBe(true);

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

    it('ignores retired highlight modes while preserving current channel choices', () => {
        const legacyWordHighlightMode = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            wordHighlightMode: 'pitch',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        } as LegacyPitchSettings);

        expect(legacyWordHighlightMode.wordHighlightColorSource).toBe('pitch');
        expect(legacyWordHighlightMode.wordUnderlineColorSource).toBe('pitch');
        expect(legacyWordHighlightMode.subtitleHighlightColorSource).toBe('pitch');
        expect(legacyWordHighlightMode.subtitleUnderlineColorSource).toBe('pitch');
        expect(Object.prototype.hasOwnProperty.call(legacyWordHighlightMode, 'wordHighlightMode')).toBe(false);

        const legacyDoublePitchPair = normalizeReaderSettings(legacyStoredSettings({
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'pitch',
            subtitleHighlightColorSource: 'pitch',
            subtitleUnderlineColorSource: 'pitch',
        }));

        expect(legacyDoublePitchPair.wordHighlightColorSource).toBe('pitch');
        expect(legacyDoublePitchPair.wordUnderlineColorSource).toBe('pitch');
        expect(legacyDoublePitchPair.subtitleHighlightColorSource).toBe('pitch');
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
