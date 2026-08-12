import { describe, expect, it } from 'vitest';
import {
    ANKI_SOURCE_ID,
    DEFAULT_SETTINGS,
    IMPORTED_ANKI_FIELD_MAPPINGS,
    JITEN_DEFINITION_SOURCE_ID,
    JPDB_DEFINITION_SOURCE_ID,
    activateSettingsPanel,
    ankiFieldRoleValue,
    applyNestedParsePlan,
    expectFontFamilyOptions,
    labelForControl,
    localizeSettingsForm,
    nestedSettingsTextParsePlan,
    normalizeReaderSettings,
    optionText,
    orderedDefinitionSourceIds,
    parsedAnkiFieldMappingsValue,
    readFormSettings,
    registerSettingsFormCleanup,
    renderImportedAnkiFieldMappingsForm,
    renderSettingsForm,
    savedAnkiFieldMappings,
    settingsText,
    settingsToken,
    sharedJapaneseSettingsTestForm,
    topLevelLegendForControl,
    YOUR_OWN_SETUP_DOCS,
} from './fixtures';
import type {
    JPDBToken,
} from './fixtures';

describe('settings form localization', () => {
    registerSettingsFormCleanup();

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
        const nadeshikoSettings = {
            ...DEFAULT_SETTINGS,
            immersionKitExampleSource: 'nadeshiko' as const,
            nadeshikoApiKey: 'nad-key',
        };
        nadeshikoOnlyForm.innerHTML = renderSettingsForm(nadeshikoSettings, 'https://jpdb.io/settings');
        const saved = readFormSettings(new FormData(nadeshikoOnlyForm), nadeshikoSettings);

        expect(defaultForm.querySelector<HTMLElement>('[data-nadeshiko-api-key-field]')?.hidden).toBe(true);
        expect(nadeshikoOnlyForm.querySelector<HTMLElement>('[data-nadeshiko-api-key-field]')?.hidden).toBe(false);
        expect(nadeshikoOnlyForm.querySelector<HTMLAnchorElement>('a[href="https://nadeshiko.co/user/developer"]')).toBeTruthy();
        expect(nadeshikoOnlyForm.querySelector<HTMLInputElement>('input[name="nadeshikoApiKey"]')?.value).toBe('');
        expect(nadeshikoOnlyForm.innerHTML).not.toContain('nad-key');
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
        // {jpdb: 0, jiten: 1} in a record that PREDATES bunproDefinitionsPriority
        // is the pre-1.4.215 shipped default, and the one-shot migration that put
        // Jiten in front still applies to it.
        expect(orderedDefinitionSourceIds(normalizeReaderSettings({
            jpdbDefinitionsPriority: 0,
            jitenDefinitionsPriority: 1,
        }), []).slice(0, 2)).toEqual([
            JITEN_DEFINITION_SOURCE_ID,
            JPDB_DEFINITION_SOURCE_ID,
        ]);
        // The same two numbers in a CURRENT record are what dragging JPDB to the
        // top of the definition-source editor produces, and this test asserted
        // that they were reverted -- the drag was undone by the very save that
        // stored it (GitHub #43: "it still jams jiten to the top of the
        // dictionary array even though claiming otherwise in the changelog").
        // Every record written since bunproDefinitionsPriority shipped carries
        // it, because the whole settings object is persisted on every save.
        expect(orderedDefinitionSourceIds(normalizeReaderSettings({
            jpdbDefinitionsPriority: 0,
            jitenDefinitionsPriority: 1,
            bunproDefinitionsPriority: 2,
        }), []).slice(0, 2)).toEqual([
            JPDB_DEFINITION_SOURCE_ID,
            JITEN_DEFINITION_SOURCE_ID,
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
        expect(form.querySelector<HTMLButtonElement>('[data-action="prepare-anki"]')?.textContent).toBe('Set up Yomu note type');
        expect(form.querySelector<HTMLButtonElement>('[data-action="update-anki-model"]')?.textContent).toBe('Update note type');
        expect(form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')).toBeNull();
        const help = form.querySelector<HTMLElement>('[data-anki-setup-help]')!;
        const docsLink = help.querySelector<HTMLAnchorElement>('a[href$="learn/your-own-setup#use-desktop-anki-from-a-phone-ipad-or-android"]');
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
        expect(YOUR_OWN_SETUP_DOCS).toContain('Mobile Anki handoff is one-way');
        expect(YOUR_OWN_SETUP_DOCS).toContain('cannot scan existing decks');
        expect(YOUR_OWN_SETUP_DOCS).toContain('review queues');
        expect(YOUR_OWN_SETUP_DOCS).toContain('replace every `100.x.y.z`');
        expect(YOUR_OWN_SETUP_DOCS).toContain('allowed-origins list');
        expect(YOUR_OWN_SETUP_DOCS).not.toContain('"webCorsOriginList"');
        // The heading text is the current settings deep link. The old
        // /getting-started anchor remains a redirect for installed builds.
        expect(YOUR_OWN_SETUP_DOCS).toContain('## Use desktop Anki from a phone, iPad, or Android');
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

    it('keeps YouTube controls while site-language navigation stays opt-in', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings');
        const filter = form.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]')!;
        const siteLanguage = form.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]')!;
        const channelSuggestions = form.querySelector<HTMLInputElement>('input[name="youtubeShowChannelRecommendations"]')!;
        const notice = form.querySelector<HTMLInputElement>('input[name="youtubeShowFilterNotice"]')!;
        const shortcut = form.querySelector<HTMLInputElement>('input[name="shortcuts.toggleYoutubeImmersion"]')!;

        expect(DEFAULT_SETTINGS.youtubeImmersionEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.preferJapaneseSiteLanguage).toBe(false);
        expect(DEFAULT_SETTINGS.youtubeShowChannelRecommendations).toBe(true);
        expect(DEFAULT_SETTINGS.youtubeShowFilterNotice).toBe(true);
        expect(DEFAULT_SETTINGS.shortcuts.toggleYoutubeImmersion).toBe('Shift+Y');
        expect(filter.checked).toBe(true);
        expect(siteLanguage.checked).toBe(false);
        expect(channelSuggestions.checked).toBe(true);
        expect(notice.checked).toBe(true);
        expect(shortcut.value).toBe('Shift+Y');

        filter.checked = false;
        siteLanguage.checked = true;
        channelSuggestions.checked = false;
        notice.checked = false;
        shortcut.value = 'Ctrl+Y';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.youtubeImmersionEnabled).toBe(false);
        expect(saved.youtubeImmersionEnabledChosen).toBe(true);
        expect(saved.preferJapaneseSiteLanguage).toBe(true);
        expect(saved.youtubeShowChannelRecommendations).toBe(false);
        expect(saved.youtubeShowChannelRecommendationsChosen).toBe(true);
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
        expect(labelForControl(form, 'preferJapaneseSiteLanguage')).toContain('日本語版のサイトを開く');
        expect(optionText(form, 'audioAutoPlayMode', 'all')).toBe('ホバーとタップ/クリック');
        expect(labelForControl(form, 'readerFontFamily')).toContain('リーダーUIフォント');
        // Not "日本語フォント": the setting styles the WHOLE popover typeface, so it
        // was mislabelled for Japanese learners as well as lying to everyone else (b20).
        expect(labelForControl(form, 'popupFontFamily')).toContain('ポップアップのフォント');
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
        expect(settingsText(form, '[data-action="prepare-anki"]')).toBe('よむノートタイプを準備');
        expect(settingsText(form, '[data-action="update-anki-model"]')).toBe('ノートタイプを更新');
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

    it('includes Help headings and prose in the active Japanese settings annotation plan', () => {
        const form = sharedJapaneseSettingsTestForm();
        activateSettingsPanel(form, 'help');

        const texts = nestedSettingsTextParsePlan(form, 640)?.targets.map(target => target.text) ?? [];

        expect(texts).toContain('便利なページ');
        expect(texts).toContain('リーダーツールとドキュメントをここから開けます。');
        expect(texts).toContain('よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料ユーザースクリプトです。');
        expect(form.querySelector('.jpdb-reader-help-links-card')?.hasAttribute('data-jpdb-reader-surface-ignore')).toBe(false);
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
