import { ANKI_CONNECT_ADDON_URL, DISCORD_INVITE_URL, DOCS_BASE_URL, DONATE_URL, GITHUB_REPOSITORY_URL, NADESHIKO_DEVELOPER_URL, NEW_TAB_PAGE_URL, PDF_READER_PAGE_URL, SETTINGS_TITLE, SUPPORT_COPY, SUPPORT_COPY_EXTRA, USERSCRIPT_INSTALL_URL, VIDEO_PLAYER_PAGE_URL } from '../app/constants';
import { escapeHtml, setInnerHtml, unwrapReaderWords } from '../dom/index';
import { audioSourceLabel, formatUiText, resolveUiLanguage, uiText } from '../app/i18n';
import { CURRENT_YOMU_VERSION } from '../app/version';
import { runningAsBrowserExtension } from '../app/runtime-env';
import { externalLinkIcon } from '../ui/icons';
import { AUDIO_GUIDE_URL, DEFAULT_OVERLAY_BACKGROUND_COLOR, DEFAULT_OVERLAY_OUTLINE_COLOR, DEFAULT_OVERLAY_TEXT_COLOR, accentToRgba, effectiveFuriganaMode, formatShortcutEvent, sanitizeAccentColor } from './index';
import { SETTINGS_LABEL_TEXT_CLASS, checkbox, input, radioGroup, select, settingsTabButton, shortcutInput } from './form-controls';
import { audioUrlPlaceholderKey, isAudioSourceTypeValue, renderAudioSourceEditor, renderDictionaryLookupLinkEditor } from './form-editors';
import { combinedApiCredentialLabel, effectiveJitenApiKey, effectiveJpdbApiKey, hasJpdbApiCredential, mergeApiCredentialValues } from './api-credential';
import { COLOR_SOURCE_VALUES, CUSTOM_FONT_FAMILY_VALUE, colorSourceOptions, readOption, settingsColorSourceValue } from './form-read';
import type { ColorSourceSettingName } from './form-read';
import { FONT_FAMILY_PRESETS } from './font-presets';
import { renderRowOrderTools, renderSourceRowsList } from './form-source-rows';
import { CLOUD_SETTINGS_SYNC_ENABLED } from './cloud-sync';
import { renderAnkiMiningSettingsPanel, renderDeckControls as renderJpdbDeckControls } from './anki-mining-panel';
import { ocrInteractionModeFromSettings } from '../ocr/mode';
import {
    MOBILE_ANKI_SETUP_DOCS_URL,
    ankiStatusLineForSettings,
    localizeBunproStatus,
    localizeInitialAnkiStatus,
    localizeJpdbStatus,
    renderAnkiStatusHtml,
    renderBunproStatusLine,
    renderJpdbStatusLine,
} from './status-lines';
import { uniqueStrings } from '../core/string-utils';
import type { DictionaryPreference, ImmersionExampleSource, InterfaceLanguage, NewTabStudyChallengeStep, ReaderColorSource, ReaderSettings } from '../app/types';
import type { RecommendedDictionary } from '../dictionaries/recommended';
import { RECOMMENDED_JAPANESE_DICTIONARIES } from '../dictionaries/recommended';
import { definitionSourceRows, kanjiSourceRows } from '../sources/sections';
import type { YomitanDictionaryInfo } from '../dictionaries/yomitan';

export { readDictionaryLookupLinks, readFormSettings } from './form-read';
export { renderAudioSourceEditor, renderDictionaryLookupLinkEditor, syncAudioSourceRow, syncBrowserTtsVoiceOptions, updateAudioSourceEditor, updateDictionaryLookupLinkEditor } from './form-editors';
export { installSourceRowDrag, updateSourceRowEditor } from './form-order';
export { renderAnkiDeckLibraryOptions, renderAnkiFieldMappingEditor, renderAnkiLibraryOptions, renderAnkiTemplatePreview, renderDeckControls } from './anki-mining-panel';
export { ankiStatusLineForSettings, bunproStatusLineForSettings, formatSettingsStatusLine, jpdbStatusLineForSettings, renderAnkiStatusHtml } from './status-lines';
export type { AnkiAdapterState, SettingsStatusAction, SettingsStatusDetail, SettingsStatusLine } from './status-lines';

const COLOR_SOURCE_CLASS_VALUES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];
const DEFAULT_JITEN_SETTINGS_URL = 'https://jiten.moe/settings';
const DEFAULT_BUNPRO_SETTINGS_URL = 'https://bunpro.jp/settings/api';
const PROXY_WORKER_SOURCE_URL = `${GITHUB_REPOSITORY_URL}/blob/main/workers/jpdb-public-proxy/src/index.ts`;
const PROXY_WORKER_README_URL = `${GITHUB_REPOSITORY_URL}/tree/main/workers/jpdb-public-proxy`;
type FontFamilySettingName = 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily';
type StringReaderSettingName = { [K in keyof ReaderSettings & string]: ReaderSettings[K] extends string ? K : never }[keyof ReaderSettings & string];
type ColorInputField = readonly [StringReaderSettingName, string];
type PageScanMode = 'off' | 'auto' | 'manual';
const DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID = 'jpdb-reader-disabled-control-description';
const API_KEY_INPUT_ATTRIBUTES = {
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-bwignore': 'true',
    'data-protonpass-ignore': 'true',
    'data-form-type': 'other',
} as const;
const API_KEY_INPUT_ATTRIBUTE_HTML = ' autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other"';
const AUTOFILL_IGNORE_ATTRIBUTE_HTML = ' data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other"';
const NEW_TAB_STUDY_STEP_LABELS: Record<NewTabStudyChallengeStep, string> = {
    'kanji-doodle': 'Kanji drawing',
    word: 'Word meaning',
    'recall-cloze': 'Write in sentence',
    'listen-pitch': 'Pitch listening',
    speaking: 'Speaking',
};
const NEW_TAB_STUDY_STEP_HELP: Record<NewTabStudyChallengeStep, string> = {
    'kanji-doodle': 'Draw each kanji before the word answer is shown.',
    word: 'Japanese front, meaning and reading on reveal.',
    'recall-cloze': 'Type the missing word in the example sentence.',
    'listen-pitch': 'Hear the word and choose the pitch pattern.',
    speaking: 'Repeat the word aloud when microphone feedback is available.',
};
const DEFAULT_SETTINGS_PANEL = 'appearance';
const SETTINGS_TABS: readonly { panel: string; label: string; labelKey?: SettingsTextKey; active?: boolean }[] = [
    { panel: 'appearance', label: 'Appearance', active: true },
    { panel: 'api', label: 'API' },
    { panel: 'dictionaries', label: 'Sources', labelKey: 'sources' },
    { panel: 'media', label: 'Media' },
    { panel: 'mining', label: 'Mining' },
    { panel: 'newTab', label: 'Study' },
    { panel: 'shortcuts', label: 'Shortcuts' },
    { panel: 'help', label: 'Help' },
];
const WORD_COLOR_FIELDS = [
    ['wordColorNew', 'New and in deck'],
    ['wordColorLearning', 'Learning'],
    ['wordColorKnown', 'Known and never forget'],
    ['wordColorDue', 'Due'],
    ['wordColorFailed', 'Failed'],
    ['wordColorIgnored', 'Ignored, suspended, and blacklisted'],
] as const satisfies readonly ColorInputField[];
const PITCH_COLOR_FIELDS = [
    ['pitchColorHeiban', 'Heiban (flat)'],
    ['pitchColorAtamadaka', 'Atamadaka (head-high)'],
    ['pitchColorNakadaka', 'Nakadaka (middle-high)'],
    ['pitchColorOdaka', 'Odaka (tail-high)'],
    ['pitchColorKifuku', 'Kifuku (variable)'],
    ['pitchColorUnknown', 'Unknown / inherited'],
] as const satisfies readonly ColorInputField[];
const OCR_COLOR_FIELDS = [
    ['ocrTextColor', 'Image text color'],
    ['ocrOutlineColor', 'Image text outline'],
    ['ocrBackgroundColor', 'Image highlight background'],
] as const satisfies readonly ColorInputField[];
const SUBTITLE_COLOR_FIELDS = [
    ['subtitleTextColor', 'Subtitle color'],
    ['subtitleOutlineColor', 'Subtitle outline'],
    ['subtitleBackgroundColor', 'Subtitle background'],
] as const satisfies readonly ColorInputField[];
const COLOR_CHANNEL_FIELDS = [
    ['wordHighlightColorSource', 'Word highlight color'],
    ['wordUnderlineColorSource', 'Word underline color'],
    ['wordTextColorSource', 'Word text color'],
    ['subtitleHighlightColorSource', 'Subtitle highlight color'],
    ['subtitleUnderlineColorSource', 'Subtitle underline color'],
    ['subtitleTextColorSource', 'Subtitle text color'],
] as const satisfies readonly [ColorSourceSettingName, string][];

function escapedUiText(language: InterfaceLanguage, key: Parameters<typeof uiText>[1]): string {
    return escapeHtml(uiText(language, key));
}

export function renderHelpLinksPanel(language: InterfaceLanguage = 'en'): string {
    return `
        <div class="jpdb-reader-help-links-card" data-jpdb-reader-surface-ignore>
            <div class="jpdb-reader-settings-subsection jpdb-reader-help-update-strip" data-help-update-strip>
                <div class="jpdb-reader-help-version-row">
                    <div class="jpdb-reader-help-version-copy">
                        <div class="jpdb-reader-local-title" data-help-update-title>Version</div>
                        <div class="jpdb-reader-help-version-current" data-help-update-current>Yomu <span data-yomu-current-version>${escapeHtml(CURRENT_YOMU_VERSION)}</span></div>
                    </div>
                    <a class="jpdb-reader-btn jpdb-reader-help-update-link" href="${USERSCRIPT_INSTALL_URL}" target="_blank" rel="noopener" data-help-link="update-userscript">${externalButtonLabel('Update')}</a>
                </div>
                <div class="jpdb-reader-help-update-meta">
                    <div class="jpdb-reader-help jpdb-reader-help-update-status" data-yomu-update-status data-status-tone="pending" role="status" aria-live="polite" data-help-update-status>${escapeHtml(formatUiText('en', 'updateStatusIdle', { current: CURRENT_YOMU_VERSION }))}</div>
                    <div class="jpdb-reader-help jpdb-reader-help-update-status" data-yomu-duplicate-status data-status-tone="success" role="status" data-help-duplicate-status>${escapeHtml(duplicateRuntimeStatusText('en'))}</div>
                </div>
                <div class="jpdb-reader-help jpdb-reader-help-update-note" data-help-update-notes>Keep one Yomu script enabled. If updates stall on iPhone/iPad, open this link in Safari.</div>
            </div>
            <details class="jpdb-reader-settings-subsection jpdb-reader-help-disclosure" data-help-anki-disclosure>
                <summary class="jpdb-reader-local-title" data-help-anki-title>AnkiConnect setup</summary>
                <div class="jpdb-reader-help" data-help-anki-copy>Keep desktop Anki open with AnkiConnect enabled. Hosted Study needs AnkiConnect to allow the Yomu origin.</div>
                <div class="jpdb-reader-help" data-help-anki-config-copy>Add these origins to AnkiConnect's webCorsOriginList, keeping any existing entries:</div>
                <pre class="jpdb-reader-help-code"><code>{
  "webCorsOriginList": [
    "https://yomureader.com",
    "http://localhost",
    "http://127.0.0.1"
  ]
}</code></pre>
                <div class="jpdb-reader-help" data-help-anki-mobile>For phone or iPad, use the desktop computer's LAN or Tailscale URL; localhost on a phone means the phone itself.</div>
                <div class="jpdb-reader-help" data-help-anki-brave>In Brave, disable Shields for the Study page if local Anki checks are blocked.</div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn" href="${ANKI_CONNECT_ADDON_URL}" target="_blank" rel="noopener" data-help-link="anki-connect-addon">${externalButtonLabel('Open AnkiConnect add-on')}</a>
                    <a class="jpdb-reader-btn" href="${MOBILE_ANKI_SETUP_DOCS_URL}" target="_blank" rel="noopener" data-help-link="anki-mobile-docs">${externalButtonLabel('Mobile Anki setup docs')}</a>
                </div>
            </details>
            <div class="jpdb-reader-settings-subsection">
                <div class="jpdb-reader-local-title" data-help-links-title>Useful pages</div>
                <div class="jpdb-reader-help" data-help-links-copy>Open the hosted reader tools and docs from here.</div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn" href="${VIDEO_PLAYER_PAGE_URL}" target="_blank" rel="noopener" data-help-link="video-player">${externalButtonLabel('Video Player')}</a>
                    <a class="jpdb-reader-btn" href="${PDF_READER_PAGE_URL}" target="_blank" rel="noopener" data-help-link="pdf-reader">${externalButtonLabel('PDF Reader')}</a>
                    <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-help-link="new-tab">${externalButtonLabel(uiText(language, 'newTabPage'))}</a>
                    <a class="jpdb-reader-btn" href="${DOCS_BASE_URL}" target="_blank" rel="noopener" data-help-link="docs">${externalButtonLabel('Docs')}</a>
                    <button class="jpdb-reader-btn jpdb-reader-help-reset" type="button" data-action="factory-reset" data-help-link="factory-reset">Factory Reset</button>
                </div>
            </div>
            <div class="jpdb-reader-settings-subsection">
                <div class="jpdb-reader-local-title" data-help-support-title>Support よむ</div>
                <div class="jpdb-reader-help" data-help-support-copy>${escapeHtml(SUPPORT_COPY)}</div>
                <div class="jpdb-reader-help" data-help-support-copy-extra>${escapeHtml(SUPPORT_COPY_EXTRA)}</div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn jpdb-reader-help-donate" href="${DONATE_URL}" target="_blank" rel="noopener" data-help-link="donate">${externalButtonLabel('Donate')}</a>
                    <a class="jpdb-reader-btn" href="${GITHUB_REPOSITORY_URL}/issues" target="_blank" rel="noopener" data-help-link="issues">${externalButtonLabel('Issues')}</a>
                    <a class="jpdb-reader-btn" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener" data-help-link="discord">${externalButtonLabel('Discord')}</a>
                </div>
            </div>
        </div>
    `;
}

export function renderSettingsForm(settings: ReaderSettings, jpdbSettingsUrl: string, jitenSettingsUrl = DEFAULT_JITEN_SETTINGS_URL): string {
    return `
            ${renderAutofillTrap()}
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            ${renderSettingsTabs()}
            ${renderSettingsSearch(settings.interfaceLanguage)}
            <div class="jpdb-reader-settings-scroll">
            ${renderApiSettingsPanel(settings, jpdbSettingsUrl, jitenSettingsUrl)}
            ${renderInterfaceSettingsPanel(settings)}
            ${renderNewTabSettingsPanel(settings)}
            ${renderAudioSettingsPanel(settings)}
            ${renderImmersionKitSettingsPanel(settings)}
            ${renderReaderSettingsPanel(settings)}
            ${renderDictionariesSettingsPanel(settings)}
            ${renderKanjiSettingsPanel(settings)}
            ${renderImageSettingsPanel(settings)}
            ${renderVideoSettingsPanel(settings)}
            ${renderYoutubeSettingsPanel(settings)}
            ${renderMiningSettingsPanel(settings)}
            ${renderShortcutSettingsPanel(settings)}
            ${renderHelpSettingsPanel(settings)}
            </div>
            ${renderSettingsFooter()}
        `;
}

function renderSettingsTabs(): string {
    return `
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="Settings sections">
                ${SETTINGS_TABS.map(tab => settingsTabButton(tab.panel, tab.label, Boolean(tab.active))).join('')}
            </div>
    `;
}

function renderAutofillTrap(): string {
    return `
            <div class="jpdb-reader-autofill-trap" aria-hidden="true">
                <input type="text" name="yomu-autofill-trap-user" tabindex="-1" autocomplete="username" aria-hidden="true">
                <input type="password" name="yomu-autofill-trap-pass" tabindex="-1" autocomplete="current-password" aria-hidden="true">
            </div>
    `;
}

function renderSettingsSearch(language: InterfaceLanguage): string {
    return `
            <div class="jpdb-reader-settings-search">
                <label>
                    <span class="jpdb-reader-settings-label-text">${escapedUiText(language, 'settingsSearch')}</span>
                    <input type="search" name="yomu-settings-search" data-settings-search placeholder="${escapedUiText(language, 'settingsSearchPlaceholder')}" autocomplete="off"${AUTOFILL_IGNORE_ATTRIBUTE_HTML}>
                </label>
            </div>
            <div class="jpdb-reader-settings-search-empty" data-settings-search-empty hidden>${escapedUiText(language, 'settingsSearchNoResults')}</div>
    `;
}

function renderApiSettingsPanel(settings: ReaderSettings, jpdbSettingsUrl: string, jitenSettingsUrl: string): string {
    const jpdbStatus = renderJpdbStatusLine(settings);
    const bunproStatus = renderBunproStatusLine(settings);
    return `
            <fieldset id="jpdb-reader-settings-panel-api" role="tabpanel" data-settings-panel="api" data-legend-key="api" hidden>
                <legend>API</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">API access</div>
                    <div class="grid">
                        ${input('apiCredentialJiten', `Jiten API key <a href="${jitenSettingsUrl}" target="_blank" rel="noopener">Jiten settings</a>`, effectiveJitenApiKey(settings), 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input' })}
                        ${input('apiCredentialJpdb', `JPDB API key <a href="${jpdbSettingsUrl}" target="_blank" rel="noopener">JPDB settings</a>`, effectiveJpdbApiKey(settings), 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input' })}
                        ${input('apiCredentialBunproLegacy', `Bunpro API key <a href="${DEFAULT_BUNPRO_SETTINGS_URL}" target="_blank" rel="noopener">Bunpro settings</a>`, settings.bunproApiKey, 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input' })}
                        ${input('apiCredentialBunpro', `Bunpro frontend API token <a href="${DEFAULT_BUNPRO_SETTINGS_URL}" target="_blank" rel="noopener">Bunpro settings</a>`, settings.bunproFrontendApiToken, 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input', placeholder: 'frontend_api_token' })}
                        <input type="hidden" name="bunproFrontendApiTokenExpiresAt" value="${escapeHtml(settings.bunproFrontendApiTokenExpiresAt)}">
                    </div>
                    <div class="jpdb-reader-help" data-jpdb-api-key-help>Paste separate API keys here. For Bunpro, open Bunpro settings while signed in and press the Yomu import button. Local Yomu SRS works without an account.</div>
                </div>
                ${jpdbStatus}
                ${bunproStatus}
                <div data-jpdb-decks>
                    ${renderJpdbDeckControls(settings, [], hasJpdbApiCredential(settings), settings.interfaceLanguage)}
                </div>
                ${checkbox('jpdbMiningEnabled', 'Allow API review/deck changes', settings.jpdbMiningEnabled)}
                ${checkbox('bunproMiningEnabled', 'Allow Bunpro review/mining', settings.bunproMiningEnabled)}
                ${checkbox('addToForq', 'Also copy JPDB adds to forq', settings.jpdbMiningEnabled && settings.addToForq, { disabled: !settings.jpdbMiningEnabled })}
                ${checkbox('enableReviews', 'Show review buttons', settings.enableReviews)}
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Dictionary site enhancements</div>
                    <div class="grid">
                        ${checkbox('jpdbPageEnhancementsEnabled', 'Enhance dictionary pages', settings.jpdbPageEnhancementsEnabled)}
                        ${checkbox('jpdbPageWordEnhancementsEnabled', 'Add sources to word/search pages', settings.jpdbPageEnhancementsEnabled && settings.jpdbPageWordEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                        ${checkbox('jpdbPageKanjiEnhancementsEnabled', 'Add sources to kanji pages', settings.jpdbPageEnhancementsEnabled && settings.jpdbPageKanjiEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                    </div>
                    <div class="jpdb-reader-help">Adds your dictionaries, Immersion Kit, kanji practice, and other sources to jpdb.io and jiten.moe vocabulary, kanji, and parse pages. Toggle individual sources under Dictionaries and Reading.</div>
                </div>
            </fieldset>
    `;
}

function renderInterfaceSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-appearance" role="tabpanel" data-settings-panel="appearance" data-legend-key="appearance">
                <legend>Appearance</legend>
                <div class="grid">
                    ${select('interfaceLanguage', 'Settings language', settings.interfaceLanguage, [['auto', 'Automatic'], ['en', 'English'], ['ja', '日本語']])}
                    ${themeSegmentedControl(settings.theme)}
                    ${select('popupMode', 'Popup mode', settings.popupMode, [['auto', 'Auto'], ['sheet', 'Bottom sheet'], ['popover', 'Popover']])}
                    ${renderStickyBottomSheetControl(settings)}
                    ${checkbox('popoverBackdropEnabled', 'Dim page behind popover', settings.popoverBackdropEnabled)}
                    ${input('popoverWidth', 'Popover width (px)', String(settings.popoverWidth), 'number', { min: 280, max: 900, step: 10 })}
                    ${input('popoverHeight', 'Popover height (px)', String(settings.popoverHeight), 'number', { min: 220, max: 900, step: 10 })}
                    ${select('popoverHeightMode', 'Popover height behavior', settings.popoverHeightMode, [['available', 'Grow to available space'], ['fixed', 'Use height setting']])}
                    ${checkbox('selectionPopoverShowTranslation', 'Show translation in selection popovers', settings.selectionPopoverShowTranslation)}
                    ${fontFamilyControl('readerFontFamily', 'Reader interface font', settings.readerFontFamily)}
                    ${fontFamilyControl('popupFontFamily', 'Popup Japanese font', settings.popupFontFamily)}
                    ${input('popupFontWeight', 'Popup Japanese weight', String(settings.popupFontWeight), 'number', { min: 300, max: 900, step: 10 })}
                    ${input('accentColor', 'Accent color', sanitizeAccentColor(settings.accentColor), 'color')}
                </div>
                ${renderWordColorSettingsSubsection(settings)}
                ${renderColorChannelSettingsSubsection(settings)}
                ${renderAppearancePreview()}
            </fieldset>
    `;
}

function renderStickyBottomSheetControl(settings: ReaderSettings): string {
    const unavailable = settings.popupMode === 'popover';
    return `
                    <div data-sticky-bottom-sheet-field ${unavailable ? 'hidden' : ''}>
                        ${checkbox('stickyBottomSheet', 'Keep sheet open after lookup', settings.stickyBottomSheet && !unavailable, { disabled: unavailable })}
                    </div>`;
}

function renderNewTabSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-newtab" role="tabpanel" data-settings-panel="newTab" data-legend-key="newTab" hidden>
                <legend>Study</legend>
                ${renderNewTabSettingsSubsection(settings)}
            </fieldset>
    `;
}

function renderNewTabSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Study</div>
                    <div class="grid">
                        ${runningAsBrowserExtension() ? checkbox('newTabEnabled', 'Set Study as the new tab', settings.newTabEnabled) : ''}
                        ${checkbox('newTabAnkiEnabled', 'Use Anki cards in Study', settings.newTabAnkiEnabled)}
                        ${renderNewTabAnkiDeckControls(settings)}
                        ${select('newTabSource', 'Study review source', settings.newTabSource, [['auto', 'Auto: Yomu, accounts, then study words'], ['yomu-local', 'Yomu local SRS'], ['jpdb', 'API SRS (Jiten / JPDB)'], ['bunpro', 'Bunpro'], ['anki', 'Anki'], ['dictionary', 'Dictionary fallback']])}
                        ${checkbox('yomuLocalSrsEnabled', 'Enable local Yomu SRS', settings.yomuLocalSrsEnabled)}
                        ${select('newTabJpdbReviewMode', 'API review mode', settings.newTabJpdbReviewMode, [['auto', 'Auto: live kanji + API vocabulary'], ['live-review', 'Live JPDB review session'], ['api-vocabulary', 'API vocabulary only']])}
                        <div data-review-config ${settings.enableReviews ? '' : 'hidden'}>
                            ${select('twoButtonReviews', 'Review rating scale', settings.twoButtonReviews ? 'true' : 'false', [['false', 'Five point: NOTHING to EASY'], ['true', 'Two point: FAIL / PASS']])}
                        </div>
                        ${select('newTabKanjiKeywordSource', 'Kanji keyword source', settings.newTabKanjiKeywordSource, kanjiKeywordSourceOptions(settings))}
                        ${renderNewTabStudyStepOrderEditor(settings)}
                        ${checkbox('newTabParsingEnabled', 'Parse sentences on Study', settings.newTabParsingEnabled)}
                        ${checkbox('newTabKanjiUnlockEnabled', 'Study kanji before unlocking words', settings.newTabKanjiUnlockEnabled)}
                        ${checkbox('newTabStopAtBatchEnd', 'Stop at the end of each batch', settings.newTabStopAtBatchEnd)}
                        ${checkbox('newTabSwipeReviews', 'Swipe cards to grade (left = fail, right = pass)', settings.newTabSwipeReviews)}
                        ${checkbox('newTabShortcutHintsEnabled', 'Show Study keyboard shortcut hints', settings.newTabShortcutHintsEnabled)}
                        ${checkbox('newTabFrontSentenceEnabled', 'Show sentence on word fronts', settings.newTabFrontSentenceEnabled)}
                        ${checkbox('newTabKanjiAutogradeEnabled', 'Autograde kanji drawing', settings.newTabKanjiAutogradeEnabled)}
                        ${checkbox('newTabKanjiAutoSubmit', 'Submit kanji grade after autograde', settings.newTabKanjiAutoSubmit)}
                        ${checkbox('newTabOfflineEnabled', 'Cache Study for offline use', settings.newTabOfflineEnabled)}
                        ${input('newTabOfflineLimit', 'Offline review cache limit', String(settings.newTabOfflineLimit), 'number', { min: 0, max: 500, step: 10 })}
                        ${input('newTabDailyGoalMinutes', 'Daily study goal (minutes, 0 = off)', String(settings.newTabDailyGoalMinutes), 'number', { min: 0, max: 1440, step: 5 })}
                        <label>Study address<input name="newTabUrl" type="text" value="${escapeHtml(NEW_TAB_PAGE_URL)}" readonly autocomplete="off"></label>
                    </div>
                    <div class="jpdb-reader-settings-actions">
                        <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-newtab-url-link>Open Study</a>
                        <button class="jpdb-reader-btn" type="button" data-action="copy-newtab-url">Copy address</button>
                    </div>
                    <div class="jpdb-reader-help" data-newtab-address-help>Set this as your browser's start or new-tab page (desktop browsers need a new-tab redirect extension), or add it to your iPad Home Screen.</div>
                    <div class="jpdb-reader-help" data-newtab-offline-help>Offline cache keeps your next due cards and queued grades in this browser; grades made offline sync when you reconnect.</div>
                </div>
    `;
}

function renderNewTabStudyStepOrderEditor(settings: ReaderSettings): string {
    const disabled = new Set(settings.newTabStudyDisabledSteps);
    return `
                        <div class="jpdb-reader-settings-field-wide jpdb-reader-settings-study-steps" data-source-editor data-study-step-editor>
                            <div class="jpdb-reader-settings-label-text">Study steps</div>
                            <div class="jpdb-reader-help">Drag to reorder. Turn off steps for faster reviews; Reveal and grading always stay at the end.</div>
                            <div class="jpdb-reader-dictionary-head jpdb-reader-order-head compact no-remove">
                                <span>On</span>
                                <span>Step</span>
                                <span>Order</span>
                            </div>
                            ${settings.newTabStudyStepOrder.map((step, index) => renderNewTabStudyStepRow(step, index, !disabled.has(step))).join('')}
                            <input name="newTabStudyTourSeen" type="hidden" value="${settings.newTabStudyTourSeen ? 'true' : 'false'}">
                        </div>
    `;
}

function renderNewTabStudyStepRow(step: NewTabStudyChallengeStep, index: number, enabled: boolean): string {
    return `
                            <div class="jpdb-reader-dictionary-row jpdb-reader-order-row compact no-remove" data-source-row data-study-step-row data-source-id="study-step-${escapeHtml(step)}">
                                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                                    <input name="newTabStudyEnabledStep" type="checkbox" value="${escapeHtml(step)}" ${enabled ? 'checked' : ''}>
                                    <span>${index + 1}</span>
                                </label>
                                <span class="jpdb-reader-field-display">${escapeHtml(NEW_TAB_STUDY_STEP_LABELS[step])}</span>
                                ${renderRowOrderTools({
                                    upAction: 'dictionary-source-up',
                                    downAction: 'dictionary-source-down',
                                    labels: { drag: 'Drag to reorder', up: 'Move up', down: 'Move down' },
                                    leading: `<input name="newTabStudyStepOrder" type="hidden" value="${escapeHtml(step)}">`,
                                })}
                                <div class="jpdb-reader-dictionary-row-help">${escapeHtml(NEW_TAB_STUDY_STEP_HELP[step])}</div>
                            </div>
    `;
}

function kanjiKeywordSourceOptions(settings: Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'>, text?: SettingsText): [ReaderSettings['newTabKanjiKeywordSource'], string][] {
    const apiLabel = combinedApiCredentialLabel(settings);
    const auto = text
        ? text('newTabKanjiKeywordAuto').replace('{service}', apiLabel)
        : `Auto: RTK, then ${apiLabel} kanji facts, then local`;
    const apiFacts = text
        ? text('newTabKanjiKeywordApiFacts').replace('{service}', apiLabel)
        : `${apiLabel} kanji facts (Jiten / JPDB)`;
    return [
        ['auto', auto],
        ['rtk', text ? text('newTabKanjiKeywordRtk') : 'RTK / Heisig'],
        ['jpdb', apiFacts],
        ['local', text ? text('newTabKanjiKeywordLocal') : 'Local card meaning'],
    ];
}

function renderNewTabAnkiDeckControls(settings: ReaderSettings): string {
    const disabled = canonicalNewTabAnkiDisabledDecks(settings.newTabAnkiDisabledDecks);
    const selector = renderNewTabAnkiDeckSelector(disabled, disabled, settings.interfaceLanguage);
    return `
                        ${renderNewTabAnkiDisabledDecksInput(disabled)}
                        <div class="jpdb-reader-newtab-anki-decks jpdb-reader-settings-wide" data-newtab-anki-decks ${selector ? '' : 'hidden'}>
                            ${selector}
                        </div>`;
}

function renderNewTabAnkiDisabledDecksInput(disabled: string[]): string {
    return `<input type="hidden" name="newTabAnkiDisabledDecks" value="${escapeHtml(disabled.join(', '))}">`;
}

export function renderNewTabAnkiDeckSelector(
    disabledDecks: string[],
    deckNames: string[],
    language: InterfaceLanguage,
): string {
    const disabled = canonicalNewTabAnkiDisabledDecks(disabledDecks);
    const decks = uniqueStrings([...deckNames, ...disabled]).map(deck => deck.trim()).filter(Boolean);
    if (!decks.length) return '';
    return `
                            <div class="jpdb-reader-newtab-anki-decks-head">
                                <div class="jpdb-reader-newtab-anki-decks-title" data-newtab-anki-decks-title>${escapedUiText(language, 'newTabAnkiReviewDecks')}</div>
                                <div class="jpdb-reader-help" data-newtab-anki-decks-help>${escapedUiText(language, 'newTabAnkiReviewDecksHelp')}</div>
                            </div>
                            <div class="jpdb-reader-newtab-anki-deck-list" data-newtab-anki-deck-list>
                                ${decks.map(deck => renderNewTabAnkiDeckToggle(deck, !isNewTabAnkiDeckDisabled(deck, disabled))).join('')}
                            </div>`;
}

function renderNewTabAnkiDeckToggle(deck: string, checked: boolean): string {
    return `
                                <label class="jpdb-reader-newtab-anki-deck-toggle" data-newtab-anki-deck-row data-active="${checked ? 'true' : 'false'}">
                                    <input type="checkbox" data-newtab-anki-deck-toggle data-newtab-anki-deck="${escapeHtml(deck)}" ${checked ? 'checked' : ''}>
                                    <span>${escapeHtml(deck)}</span>
                                </label>`;
}

function isNewTabAnkiDeckDisabled(deck: string, disabledDecks: string[]): boolean {
    return disabledDecks.some(disabled => disabled === deck || isAnkiSubdeckOf(deck, disabled));
}

function renderWordColorSettingsSubsection(settings: ReaderSettings): string {
    return renderColorSettingsSubsection('Word colors', WORD_COLOR_FIELDS, settings);
}

export function canonicalNewTabAnkiDisabledDecks(deckNames: string[]): string[] {
    const unique: string[] = [];
    deckNames
        .map(deck => deck.trim())
        .filter(Boolean)
        .forEach(deck => {
            if (!unique.includes(deck)) unique.push(deck);
        });
    return unique.filter(deck => !unique.some(parent => parent !== deck && isAnkiSubdeckOf(deck, parent)));
}

function isAnkiSubdeckOf(deck: string, parent: string): boolean {
    return Boolean(parent && deck.startsWith(`${parent}::`));
}

const FURIGANA_HIDE_GROUPS: Array<[ReaderSettings['furiganaHiddenStateGroups'][number], string]> = [
    ['known', 'Known'],
    ['due', 'Due'],
    ['failed', 'Failed'],
    ['learning', 'Learning'],
    ['new', 'New'],
];

const APPEARANCE_PRESET_OPTIONS: Array<[string, string]> = [
    ['', 'Keep current custom settings'],
    ['balanced', 'Balanced reading'],
    ['new-only', 'Focus on new words'],
    ['underline-new', 'Minimal highlights'],
    ['no-colors', 'Plain text'],
];

const FURIGANA_MODE_OPTIONS: Array<[ReaderSettings['furiganaMode'], string]> = [
    ['known-status', 'Hide familiar words'],
    ['difficult-kanji', 'Hard kanji only'],
    ['hover', 'Show on hover'],
    ['all', 'Show on every parsed word'],
    ['off', 'Off'],
];

const WORD_COLOR_STATE_OPTIONS: Array<[ReaderSettings['wordColorStates'], string]> = [
    ['all', 'Use all learning states'],
    ['new-only', 'Only new / not-in-deck words'],
];

function renderFuriganaHiddenStateGroupControls(settings: ReaderSettings): string {
    const selected = new Set(settings.furiganaHiddenStateGroups);
    const boxes = FURIGANA_HIDE_GROUPS
        .map(([group, label]) => checkbox(`furiganaHide-${group}`, label, selected.has(group)))
        .join('');
    return `<fieldset class="jpdb-reader-radio-group" data-furigana-hide-groups${effectiveFuriganaMode(settings) === 'known-status' ? '' : ' hidden'}><legend>Hide furigana for</legend>${boxes}</fieldset>`;
}

// UT-47: a live sample sentence that mirrors the furigana/colour options.
// data-settings-preview-lookup keeps localizeSettingsForm's
// unwrapReaderWords pass from stripping the sample word spans.
function renderAppearancePreview(): string {
    return `
                <div class="jpdb-reader-settings-subsection jpdb-reader-settings-preview-section">
                    <div class="jpdb-reader-local-title" data-settings-preview-title>Preview</div>
                    <div class="jpdb-reader-settings-appearance-preview" data-yomu-appearance-preview data-settings-preview-lookup lang="ja" aria-hidden="true">${appearancePreviewContentHtml()}</div>
                </div>`;
}

// The preview words carry the same state classes real annotations get, so
// the root-level yomu-furi-*/yomu-word-color-* classes restyle them live.
export function appearancePreviewContentHtml(): string {
    return `<span class="jpdb-reader-settings-appearance-preview-line">${appearancePreviewHtml()}</span>`;
}

export function appearancePreviewHtml(): string {
    const word = (classes: string, base: string, furi: string, tail = ''): string =>
        `<span class="jpdb-reader-word jpdb-reader-has-furi ${classes}"><ruby><span class="jpdb-reader-ruby-base">${base}</span><rt class="jpdb-reader-furi">${furi}</rt></ruby>${tail}</span>`;
    return `${word('jpdb-new anki-new jpdb-pitch-heiban', '新', 'あたら', 'しい')}${word('jpdb-learning anki-learning jpdb-pitch-atamadaka', '言葉', 'ことば')}を${word('jpdb-due anki-due jpdb-pitch-nakadaka', '毎日', 'まいにち')}${word('jpdb-failed anki-failed jpdb-pitch-odaka', '勉強', 'べんきょう')}して、${word('jpdb-known anki-known jpdb-pitch-kifuku', '日本語', 'にほんご')}が${word('jpdb-never-forget anki-known jpdb-pitch-heiban', '上手', 'じょうず')}になる。`;
}

function renderPitchColorSettingsSubsection(settings: ReaderSettings): string {
    return renderColorSettingsSubsection('Pitch accent colors', PITCH_COLOR_FIELDS, settings);
}

function renderColorChannelSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Color channels</div>
                    <div class="grid">
                        ${COLOR_CHANNEL_FIELDS.map(([name, label]) => select(name, label, settingsColorSourceValue(settings, name), colorSourceOptions(settings))).join('')}
                    </div>
                </div>
    `;
}

function renderColorSettingsSubsection(title: string, fields: readonly ColorInputField[], settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapeHtml(title)}</div>
                    <div class="grid jpdb-reader-color-grid">
                        ${renderColorInputs(fields, settings)}
                    </div>
                </div>
    `;
}

function renderColorInputs(fields: readonly ColorInputField[], settings: ReaderSettings): string {
    return fields.map(([name, label]) => input(name, label, settings[name], 'color')).join('');
}

function renderAudioSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const autoPlayMode = settings.audioAutoPlayMode === 'off' ? 'all' : settings.audioAutoPlayMode;
    return `
            <fieldset id="jpdb-reader-settings-panel-audio" role="tabpanel" data-settings-panel="media" data-legend-key="audio" aria-describedby="settings-help-audio" hidden>
                <legend>${escapedUiText(language, 'audio')}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox('audioEnabled', uiText(language, 'audioEnabled'), settings.audioEnabled)}
                    ${checkbox('suppressAutoAudioOnVideo', uiText(language, 'suppressAutoAudioOnVideo'), settings.suppressAutoAudioOnVideo)}
                    ${checkbox('audioEnableDefaultSources', uiText(language, 'audioEnableDefaultSources'), settings.audioEnableDefaultSources)}
                    ${checkbox('audioFallbackChimeEnabled', uiText(language, 'audioFallbackChimeEnabled'), settings.audioFallbackChimeEnabled)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${checkbox('autoPlayAudio', uiText(language, 'autoPlayAudio'), settings.autoPlayAudio)}
                    ${audioAutoPlayModeSelect(language, autoPlayMode, !settings.autoPlayAudio)}
                    ${select('audioSelectionMode', uiText(language, 'audioSelectionMode'), settings.audioSelectionMode, [['first', uiText(language, 'firstAudio')], ['random', uiText(language, 'randomAudio')]])}
                    ${select('audioTtsMode', uiText(language, 'audioTtsMode'), settings.audioTtsMode, [['fallback', uiText(language, 'audioTtsFallback')], ['source-order', uiText(language, 'audioTtsSourceOrder')]])}
                    ${input('audioTimeoutMs', uiText(language, 'audioTimeoutMs'), String(settings.audioTimeoutMs), 'number', { min: 1000, max: 30000, step: 500 })}
                    ${input('corsProxyUrl', uiText(language, 'corsProxyUrl'), settings.corsProxyUrl, 'url', { placeholder: 'https://your-worker.workers.dev' })}
                </div>
                ${renderProxySetupGuide(language)}
                <div class="jpdb-reader-audio-sources" data-source-editor data-audio-source-editor>
                    ${renderAudioSourceEditor(settings.audioSources, language)}
                </div>
                <div id="settings-help-audio" class="jpdb-reader-help" data-help-key="audioHelp">${audioHelpHtml(language)}</div>
            </fieldset>
    `;
}

function audioAutoPlayModeSelect(language: InterfaceLanguage, value: Exclude<ReaderSettings['audioAutoPlayMode'], 'off'>, disabled: boolean): string {
    const options: [Exclude<ReaderSettings['audioAutoPlayMode'], 'off'>, string][] = [
        ['all', uiText(language, 'audioAutoPlayAll')],
        ['hover', uiText(language, 'audioAutoPlayHover')],
        ['tap', uiText(language, 'audioAutoPlayTap')],
    ];
    return `<label>${escapedUiText(language, 'audioAutoPlayMode')}<select name="audioAutoPlayMode" ${disabled ? 'disabled' : ''}>${options.map(([optionValue, text]) =>
        `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`,
    ).join('')}</select>${disabled ? `<input type="hidden" name="audioAutoPlayMode" value="${escapeHtml(value)}">` : ''}</label>`;
}

function renderProxySetupGuide(language: InterfaceLanguage): string {
    return `
                <details class="jpdb-reader-proxy-guide">
                    <summary>
                        <span data-proxy-guide-summary>${escapedUiText(language, 'audioProxyGuideSummary')}</span>
                        <span class="jpdb-reader-proxy-guide-toggle" aria-hidden="true">
                            <span data-proxy-guide-show>${escapedUiText(language, 'show')}</span>
                            <span data-proxy-guide-hide>${escapedUiText(language, 'hide')}</span>
                        </span>
                    </summary>
                    <div class="jpdb-reader-proxy-guide-body">
                        <p>${escapedUiText(language, 'audioProxyGuideIntro')}</p>
                        <ol>
                            <li>${escapedUiText(language, 'audioProxyGuideCloudflare')}</li>
                            <li>${escapedUiText(language, 'audioProxyGuideWorkers')}</li>
                            <li>${escapedUiText(language, 'audioProxyGuideCreateWorker')}</li>
                            <li>${escapedUiText(language, 'audioProxyGuideEditCode')}</li>
                            <li>${escapedUiText(language, 'audioProxyGuideDeploy')}</li>
                            <li>${escapedUiText(language, 'audioProxyGuideCopyUrl')}</li>
                            <li>${escapedUiText(language, 'audioProxyGuidePasteUrl')}</li>
                            <li>${escapedUiText(language, 'audioProxyGuideTest')}</li>
                        </ol>
                        <p>${escapedUiText(language, 'audioProxyGuideNote')}</p>
                        <div class="jpdb-reader-help-actions">
                            <a class="jpdb-reader-btn" href="${PROXY_WORKER_SOURCE_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, 'audioProxyWorkerSource'))}</a>
                            <a class="jpdb-reader-btn" href="${PROXY_WORKER_README_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, 'audioProxyDeployGuide'))}</a>
                        </div>
                    </div>
                </details>
    `;
}

function renderImmersionKitSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    return `
            <fieldset id="jpdb-reader-settings-panel-immersion-kit" role="tabpanel" data-settings-panel="media" data-legend-key="immersionKit" aria-describedby="settings-help-immersion-kit" hidden>
                <legend>${escapedUiText(language, 'immersionKit')}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox('immersionKitEnabled', uiText(language, 'immersionKitEnabled'), settings.immersionKitEnabled)}
                    ${checkbox('immersionKitShowTranslation', uiText(language, 'immersionKitShowTranslation'), settings.immersionKitShowTranslation)}
                    ${checkbox('immersionKitRevealTranslationOnClick', uiText(language, 'immersionKitRevealTranslationOnClick'), settings.immersionKitRevealTranslationOnClick, { disabled: !settings.immersionKitShowTranslation })}
                    ${checkbox('immersionKitShowImages', uiText(language, 'immersionKitShowImages'), settings.immersionKitShowImages)}
                    ${checkbox('immersionKitExactMatch', uiText(language, 'immersionKitExactMatch'), settings.immersionKitExactMatch)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${select('immersionKitExampleSource', uiText(language, 'immersionKitExampleSource'), settings.immersionKitExampleSource, [['immersion-kit', uiText(language, 'immersionKit')], ['nadeshiko', 'Nadeshiko'], ['combined', uiText(language, 'immersionKitAndNadeshiko')]])}
                    ${renderNadeshikoApiKeyField(settings)}
                    ${select('immersionKitCategory', uiText(language, 'immersionKitCategory'), settings.immersionKitCategory, [['all', uiText(language, 'allCategories')], ['anime', uiText(language, 'anime')], ['drama', uiText(language, 'drama')], ['games', uiText(language, 'games')]])}
                    ${select('immersionKitSort', uiText(language, 'immersionKitSort'), settings.immersionKitSort, [['sentence_length:asc', uiText(language, 'shortestFirst')], ['sentence_length:desc', uiText(language, 'longestFirst')]])}
                    ${radioGroup('immersionKitLimitEnabled', uiText(language, 'immersionKitLimitEnabled'), settings.immersionKitLimitEnabled ? 'on' : 'off', [['off', uiText(language, 'allExamples')], ['on', uiText(language, 'limitExamples')]])}
                    ${input('immersionKitLimit', uiText(language, 'immersionKitLimit'), String(settings.immersionKitLimit), 'number', { min: 1, max: 12, step: 1 })}
                    ${input('immersionKitMinLength', uiText(language, 'immersionKitMinLength'), String(settings.immersionKitMinLength), 'number', { min: 0, max: 120, step: 1 })}
                    ${input('immersionKitMaxLength', uiText(language, 'immersionKitMaxLength'), String(settings.immersionKitMaxLength), 'number', { min: 0, max: 240, step: 1 })}
                    ${input('immersionKitPlaybackRate', uiText(language, 'immersionKitPlaybackRate'), String(settings.immersionKitPlaybackRate), 'number', { min: 0.5, max: 2, step: 0.05 })}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, 'audioPlayback')}</div>
                    <div class="grid jpdb-reader-settings-tgrid">
                        ${checkbox('immersionKitAutoPlayAudio', uiText(language, 'immersionKitAutoPlayAudio'), settings.immersionKitAutoPlayAudio)}
                        ${checkbox('immersionKitPlayOnHover', uiText(language, 'immersionKitPlayOnHover'), settings.immersionKitPlayOnHover)}
                        ${checkbox('immersionKitPlayOnImageClick', uiText(language, 'immersionKitPlayOnImageClick'), settings.immersionKitPlayOnImageClick)}
                    </div>
                </div>
                <div id="settings-help-immersion-kit" class="jpdb-reader-help" data-help-key="immersionKitHelp">${escapedUiText(language, 'immersionKitHelp')}</div>
            </fieldset>
    `;
}

function renderNadeshikoApiKeyField(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    return `
                    <div data-nadeshiko-api-key-field ${usesNadeshikoExamples(settings.immersionKitExampleSource) ? '' : 'hidden'}>
                        ${input('nadeshikoApiKey', `${escapedUiText(language, 'nadeshikoApiKey')} <a href="${NADESHIKO_DEVELOPER_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, 'getNadeshikoKey'))}</a>`, settings.nadeshikoApiKey, 'text', { class: 'jpdb-reader-masked-input' })}
                    </div>`;
}

function usesNadeshikoExamples(source: ImmersionExampleSource): boolean {
    return source === 'nadeshiko' || source === 'combined';
}

function popupLookupEnabledSetting(settings: ReaderSettings): boolean {
    return settings.popupActivationMode !== 'off'
        && (settings.parseSelection || settings.lookupOnClick || settings.lookupOnHover || settings.lookupOnMiddleMouse);
}

function renderReaderSettingsPanel(settings: ReaderSettings): string {
    const pageScanMode = pageScanModeFromSettings(settings);
    return `
            <fieldset id="jpdb-reader-settings-panel-reader" role="tabpanel" data-settings-panel="appearance" data-legend-key="reader" aria-describedby="settings-help-reader" hidden>
                <legend>Reader</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-popup-lookup-title>Popup lookup</div>
                    <div class="grid">
                        ${checkbox('popupLookupEnabled', 'Show Yomu lookup popup', popupLookupEnabledSetting(settings))}
                    </div>
                    <div class="jpdb-reader-help" data-help-key="popupLookupHelp">Off for another reader's popups. Yomu tools stay on.</div>
                </div>
                <div class="grid">
                    ${checkbox('parseSelection', 'Selection popups', settings.parseSelection)}
                    ${checkbox('lookupOnClick', 'Look up on tap or click', settings.lookupOnClick)}
                    ${checkbox('lookupOnHover', 'Look up on hover', settings.lookupOnHover)}
                    ${checkbox('lookupOnMiddleMouse', 'Look up with middle-mouse hold', settings.lookupOnMiddleMouse)}
                    ${checkbox('showFloatingButton', uiText(settings.interfaceLanguage, 'showFloatingButton'), settings.showFloatingButton)}
                    ${radioGroup('pageScanMode', uiText(settings.interfaceLanguage, 'pageScanMode'), pageScanMode, [
                        ['off', uiText(settings.interfaceLanguage, 'pageScanModeOff')],
                        ['auto', uiText(settings.interfaceLanguage, 'pageScanModeAuto')],
                        ['manual', uiText(settings.interfaceLanguage, 'pageScanModeManual')],
                    ])}
                    <div class="jpdb-reader-shortcut-group" data-page-scan-manual-shortcut ${pageScanMode === 'manual' ? '' : 'hidden'}>
                        <div data-manual-page-scan-shortcut-label>${shortcutInput('shortcuts.scanPage', uiText(settings.interfaceLanguage, 'manualPageScanShortcut'), settings.shortcuts.scanPage)}</div>
                    </div>
                    ${select('appearancePreset', 'Quick setup', '', APPEARANCE_PRESET_OPTIONS)}
                    ${select('furiganaMode', 'Furigana', effectiveFuriganaMode(settings), FURIGANA_MODE_OPTIONS)}
                    ${renderFuriganaHiddenStateGroupControls(settings)}
                    ${select('wordColorStates', 'Color words', settings.wordColorStates, WORD_COLOR_STATE_OPTIONS)}
                    ${checkbox('showPitchAccent', 'Show pitch accent', settings.showPitchAccent)}
                    ${checkbox('suppressRedundantWordUi', 'Hide JPDB-redundant styling', settings.suppressRedundantWordUi)}
                    ${checkbox('sheetCloseButtonOnLeft', 'Sheet close button on left', settings.sheetCloseButtonOnLeft)}
                </div>
                ${renderPitchColorSettingsSubsection(settings)}
                ${renderHoverLookupSettingsSubsection(settings)}
                <div id="settings-help-reader" class="jpdb-reader-help" data-help-key="readerHelp">Set a hover key. Blank means plain hover.</div>
            </fieldset>
    `;
}

function pageScanModeFromSettings(settings: ReaderSettings): PageScanMode {
    if (settings.annotationsPaused) return 'off';
    return settings.manualScanEnabled ? 'manual' : 'auto';
}

function renderHoverLookupSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-hover-lookup-title>Hover lookup</div>
                    <div class="grid">
                        ${shortcutInput('shortcuts.hoverLookup', 'Hold while hovering', settings.shortcuts.hoverLookup, 'Blank means hover without a key')}
                        ${input('hoverOpenDelayMs', 'Hover open delay (ms)', String(settings.hoverOpenDelayMs), 'number')}
                        ${input('hoverCloseDelayMs', 'Hover close delay (ms)', String(settings.hoverCloseDelayMs), 'number')}
                    </div>
                </div>
    `;
}

function renderKanjiSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-kanji" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="kanji" hidden>
                <legend>Kanji</legend>
                <div class="jpdb-reader-kanji-priorities" data-source-editor>
                    ${renderKanjiSourceRows(settings)}
                </div>
                ${renderHiddenKanjiDetailSettings(settings)}
            </fieldset>
    `;
}

function renderHiddenKanjiDetailSettings(settings: ReaderSettings): string {
    return `
                ${hiddenBooleanSetting('kanjiOriginKanjiMapEnabled', settings.kanjiOriginKanjiMapEnabled)}
                ${hiddenBooleanSetting('kanjiOriginGraphEnabled', settings.kanjiOriginGraphEnabled)}
                ${hiddenBooleanSetting('kanjiOriginRadicalImagesEnabled', settings.kanjiOriginRadicalImagesEnabled)}
                <input type="hidden" name="similarKanjiWordLimit" value="${settings.similarKanjiWordLimit}">
    `;
}

function hiddenBooleanSetting(name: string, enabled: boolean): string {
    return enabled ? `<input type="hidden" name="${name}" value="on">` : '';
}

function renderImageSettingsPanel(settings: ReaderSettings): string {
    const localOcrHidden = settings.ocrProvider === 'local-service' ? '' : 'hidden';
    const cloudOcrHidden = settings.ocrProvider === 'cloud-vision' ? '' : 'hidden';
    return `
            <fieldset id="jpdb-reader-settings-panel-ocr" role="tabpanel" data-settings-panel="media" data-legend-key="images" aria-describedby="settings-help-ocr" hidden>
                <legend>Image text (OCR)</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${radioGroup('ocrInteractionMode', uiText(settings.interfaceLanguage, 'ocrInteractionMode'), ocrInteractionModeFromSettings(settings), [
                        ['auto', uiText(settings.interfaceLanguage, 'ocrInteractionModeAuto')],
                        ['manual', uiText(settings.interfaceLanguage, 'ocrInteractionModeManual')],
                        ['off', uiText(settings.interfaceLanguage, 'ocrInteractionModeOff')],
                    ])}
                    ${checkbox('ocrShowTextOverlay', 'Show recognized text on images', settings.ocrShowTextOverlay)}
                    ${checkbox('ocrVideoPauseFrames', 'Read paused video frames', settings.ocrVideoPauseFrames)}
                    ${checkbox('ocrInvertDarkPanels', 'Read light text on dark panels', settings.ocrInvertDarkPanels)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${select('ocrProvider', 'Image reading', settings.ocrProvider, [['google-lens', 'Google Lens — free, no setup (recommended)'], ['cloud-vision', 'Google Cloud Vision — needs API key'], ['local-service', 'Local OCR server — advanced'], ['off', 'Off']])}
                    ${select('ocrOverlayTheme', 'OCR overlay theme', settings.ocrOverlayTheme, [['auto', 'Match app theme'], ['light', 'Light overlay'], ['dark', 'Dark overlay']])}
                    ${select('ocrMaxImagesPerPage', 'Images to read per page', String(settings.ocrMaxImagesPerPage), [['3', 'Light'], ['8', 'Normal'], ['16', 'More']])}
                    ${select('ocrMinImageArea', 'Smallest image to read', String(settings.ocrMinImageArea), [['80000', 'Large images only'], ['45000', 'Normal'], ['15000', 'Include small images']])}
                    ${select('ocrMaxImagePixels', 'Image detail', String(settings.ocrMaxImagePixels), [['640000', 'Faster'], ['1200000', 'Balanced'], ['2000000', 'Sharper']])}
                    ${renderColorInputs(OCR_COLOR_FIELDS, settings)}
                    ${input('ocrBackgroundOpacity', 'Image highlight opacity', String(settings.ocrBackgroundOpacity), 'number')}
                    ${input('ocrFontScale', 'Image text scale', String(settings.ocrFontScale), 'number')}
                    <div class="jpdb-reader-help" data-local-ocr ${localOcrHidden} data-help-key="ocrLocalHelp">Advanced: run OCR locally. Start a MangaOCR/Apple Vision HTTP server, then enter its URL. Most users should keep Google Lens.</div>
                    <div data-local-ocr ${localOcrHidden}>${select('ocrEngine', 'Local OCR engine', settings.ocrEngine, [['auto', 'Automatic'], ['MangaOCR', 'MangaOCR (best for manga)'], ['PaddleOCR', 'PaddleOCR'], ['AppleVision', 'Apple Vision (macOS)']])}</div>
                    <label data-local-ocr ${localOcrHidden}>Local OCR server URL<input name="ocrEndpointUrl" type="url" value="${escapeHtml(settings.ocrEndpointUrl)}" placeholder="http://127.0.0.1:7331/ocr" autocomplete="off"></label>
                    <div class="jpdb-reader-help" data-cloud-ocr ${cloudOcrHidden} data-help-key="ocrCloudHelp">Needs a Google Cloud Vision API key (a Google Cloud project with billing enabled).</div>
                    <label data-cloud-ocr ${cloudOcrHidden}>Google Cloud Vision API key<input name="ocrCloudVisionApiKey" type="text" class="jpdb-reader-masked-input" value="${escapeHtml(settings.ocrCloudVisionApiKey)}" autocomplete="off"${API_KEY_INPUT_ATTRIBUTE_HTML}></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml(settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${settings.ocrPrefetchMargin}">
                    <input type="hidden" name="ocrPrefetchPages" value="${settings.ocrPrefetchPages}">
                    <input type="hidden" name="ocrConcurrency" value="${settings.ocrConcurrency}">
                </div>
                <div id="settings-help-ocr" class="jpdb-reader-help" data-help-key="ocrHelp">Reads images near the viewport.</div>
            </fieldset>
    `;
}

function renderVideoSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-video" role="tabpanel" data-settings-panel="media" data-legend-key="video" hidden>
                <legend>Video</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox('subtitlePlayerEnabled', 'Enable video subtitle player', settings.subtitlePlayerEnabled)}
                    ${checkbox('subtitleAutoDetect', 'Auto-detect page subtitles', settings.subtitleAutoDetect)}
                    ${checkbox('subtitleOverlayVisible', 'Show subtitle overlay', settings.subtitleOverlayVisible)}
                    ${checkbox('subtitleSecondaryVisible', 'Show native subtitles when available', settings.subtitleSecondaryVisible)}
                    ${checkbox('subtitleNativeBlurred', 'Blur native subtitles until hover', settings.subtitleNativeBlurred)}
                    ${checkbox('subtitleKaraokeMode', 'Karaoke word timing', settings.subtitleKaraokeMode)}
                    ${checkbox('subtitleTranscriptVisible', 'Open transcript panel by default', settings.subtitleTranscriptVisible)}
                    ${checkbox('subtitlePausePanel', 'Open side panel when paused', settings.subtitlePausePanel)}
                    ${checkbox('subtitleTranscriptAutoScroll', 'Scroll transcript with playback', settings.subtitleTranscriptAutoScroll)}
                    ${checkbox('subtitleAutoCopyLine', 'Auto-copy each subtitle line as it plays', settings.subtitleAutoCopyLine)}
                    ${checkbox('subtitleCopyIncludeTranslation', 'Include the translation when copying a line', settings.subtitleCopyIncludeTranslation)}
                    ${checkbox('subtitleMiningPause', 'Pause video on subtitle click', settings.subtitleMiningPause)}
                    ${checkbox('subtitleHoverPause', 'Pause video on subtitle hover lookup', settings.subtitleHoverPause)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${input('subtitleTranscriptAutoScrollResumeSeconds', 'Resume transcript auto-scroll after manual scroll (s)', String(settings.subtitleTranscriptAutoScrollResumeSeconds), 'number')}
                    ${select('subtitleControlsMode', 'Subtitle controls', settings.subtitleControlsMode, [['auto', 'Compact controls'], ['hidden', 'Hide controls'], ['always', 'Always visible']])}
                    ${input('subtitleFontSize', 'Subtitle font size (px)', String(settings.subtitleFontSize), 'number')}
                    ${input('subtitleBottomOffset', 'Subtitle bottom offset (%)', String(settings.subtitleBottomOffset), 'number')}
                    ${renderColorInputs(SUBTITLE_COLOR_FIELDS, settings)}
                    ${input('subtitleBackgroundOpacity', 'Subtitle background opacity', String(settings.subtitleBackgroundOpacity), 'number')}
                    ${fontFamilyControl('subtitleFontFamily', 'Subtitle font family', settings.subtitleFontFamily)}
                    ${input('subtitleFontWeight', 'Subtitle font weight', String(settings.subtitleFontWeight), 'number')}
                    ${input('subtitleSeekPadding', 'Subtitle seek padding (s)', String(settings.subtitleSeekPadding), 'number')}
                </div>
                ${renderSubtitlePreview()}
            </fieldset>
    `;
}

function renderSubtitlePreview(): string {
    return `
                <div class="jpdb-reader-subtitle-preview" data-subtitle-preview>
                    <div class="jpdb-subtitle-primary">
                        <span class="jpdb-reader-word jpdb-new jpdb-pitch-heiban" data-settings-preview-lookup="新しい" data-sentence="新しい言葉を読む" tabindex="-1">新しい</span>
                        <span class="jpdb-reader-word jpdb-learning jpdb-pitch-atamadaka" data-settings-preview-lookup="言葉" data-sentence="新しい言葉を読む" tabindex="-1">言葉</span>
                        <span class="jpdb-reader-word jpdb-known jpdb-pitch-nakadaka" data-settings-preview-lookup="を" data-sentence="新しい言葉を読む" tabindex="-1">を</span>
                        <span class="jpdb-reader-word jpdb-due jpdb-pitch-odaka" data-settings-preview-lookup="読む" data-sentence="新しい言葉を読む" tabindex="-1">読む</span>
                    </div>
                    <div class="jpdb-subtitle-secondary">Live subtitle preview</div>
                </div>
    `;
}

function renderYoutubeSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-youtube" role="tabpanel" data-settings-panel="media" data-legend-key="youTube" aria-describedby="settings-help-youtube" hidden>
                <legend>YouTube</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox('youtubeImmersionEnabled', 'Japanese YouTube only', settings.youtubeImmersionEnabled)}
                    ${checkbox('preferJapaneseSiteLanguage', 'Prefer Japanese site language and location', settings.preferJapaneseSiteLanguage)}
                    ${checkbox('youtubeShowChannelRecommendations', 'Show Japanese channel suggestions', settings.youtubeShowChannelRecommendations)}
                    ${checkbox('youtubeShowFilterNotice', 'Show hidden-video notice', settings.youtubeShowFilterNotice)}
                </div>
                <div id="settings-help-youtube" class="jpdb-reader-help" data-youtube-help>Prefer Japanese UI and Japan-local content.</div>
            </fieldset>
    `;
}

function renderMiningSettingsPanel(settings: ReaderSettings): string {
    const ankiStatus = ankiStatusLineForSettings(settings, settings.interfaceLanguage);
    return renderAnkiMiningSettingsPanel(settings, {
        tone: ankiStatus.tone,
        html: renderAnkiStatusHtml(ankiStatus, settings.interfaceLanguage),
    });
}

function renderDictionariesSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-dictionaries" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="sources" hidden>
                <legend>Sources</legend>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status role="status" aria-live="polite">Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities" data-source-editor data-definition-source-editor>
                    ${renderDictionarySourceRows(settings)}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Lookup pills</div>
                    <div class="jpdb-reader-help">External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.</div>
                    ${checkbox('showLookupPillFrequency', 'Show site frequency in pills', settings.showLookupPillFrequency)}
                    <div class="jpdb-reader-lookup-links" data-source-editor>
                        ${renderDictionaryLookupLinkEditor(settings.dictionaryLookupLinks, installedFrequencyDictionaryPreferences(settings, installedDictionariesFromPreferences(settings.dictionaryPreferences)))}
                    </div>
                </div>
                <div class="jpdb-reader-recommended-dictionaries" data-recommended-dictionaries>
                    ${renderRecommendedDictionaries(installedDictionariesFromPreferences(settings.dictionaryPreferences))}
                </div>
                ${CLOUD_SETTINGS_SYNC_ENABLED ? renderCloudSettingsSyncSection(settings) : ''}
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">Import settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">Export settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">Import dictionaries</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">Export dictionaries</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip">
                <div class="jpdb-reader-help" data-import-status>Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.</div>
            </fieldset>
    `;
}

function renderCloudSettingsSyncSection(settings: ReaderSettings): string {
    const language = resolveUiLanguage(settings.interfaceLanguage);
    const uploadLabel = language === 'ja' ? 'Google Driveに同期' : 'Sync to Google Drive';
    const restoreLabel = language === 'ja' ? 'Google Driveから復元' : 'Restore from Google Drive';
    return `
                <div class="jpdb-reader-settings-subsection" data-cloud-settings-sync>
                    <div class="jpdb-reader-local-title" data-cloud-settings-sync-title>Google Drive settings sync</div>
                    <div class="jpdb-reader-help" data-help-key="cloudSettingsSyncHelp">Stores your Yomu settings and local SRS progress in Google Drive app data. Dictionaries stay local.</div>
                    <div class="jpdb-reader-settings-actions jpdb-reader-settings-actions-single">
                        <button class="jpdb-reader-btn" type="button" data-action="sync-cloud-settings">${uploadLabel}</button>
                        <button class="jpdb-reader-btn" type="button" data-action="restore-cloud-settings">${restoreLabel}</button>
                    </div>
                </div>
    `;
}

function renderShortcutSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-shortcuts" role="tabpanel" data-settings-panel="shortcuts" data-legend-key="shortcuts" hidden>
                <legend>Shortcuts</legend>
                <div class="grid">
                    ${shortcutInput('shortcuts.scanPage', 'Scan page', settings.shortcuts.scanPage)}
                    ${shortcutInput('shortcuts.hoverLookup', 'Hold while hovering', settings.shortcuts.hoverLookup, 'Blank means hover without a key')}
                    ${shortcutInput('shortcuts.openSettings', 'Open settings', settings.shortcuts.openSettings)}
                    ${shortcutInput('shortcuts.playAudio', 'Play audio', settings.shortcuts.playAudio)}
                    ${shortcutInput('shortcuts.closePopup', 'Close popup', settings.shortcuts.closePopup)}
                    ${shortcutInput('shortcuts.previousLookupWord', 'Previous word', settings.shortcuts.previousLookupWord)}
                    ${shortcutInput('shortcuts.nextLookupWord', 'Next word', settings.shortcuts.nextLookupWord)}
                    ${shortcutInput('shortcuts.previousSubtitle', 'Previous subtitle', settings.shortcuts.previousSubtitle)}
                    ${shortcutInput('shortcuts.nextSubtitle', 'Next subtitle', settings.shortcuts.nextSubtitle)}
                    ${shortcutInput('shortcuts.copySubtitle', 'Copy subtitle', settings.shortcuts.copySubtitle)}
                    ${shortcutInput('shortcuts.toggleOcr', 'Toggle image reading', settings.shortcuts.toggleOcr)}
                    ${shortcutInput('shortcuts.toggleSubtitleOverlay', 'Toggle subtitle overlay', settings.shortcuts.toggleSubtitleOverlay)}
                    ${shortcutInput('shortcuts.toggleYoutubeImmersion', 'Toggle YouTube filter', settings.shortcuts.toggleYoutubeImmersion)}
                    ${shortcutInput('shortcuts.scanImages', 'Read images now', settings.shortcuts.scanImages)}
                    ${shortcutInput('shortcuts.massReviewVisible', 'Mass review visible words (Jiten)', settings.shortcuts.massReviewVisible)}
                    ${shortcutInput('shortcuts.studyReveal', 'Study: reveal card', settings.shortcuts.studyReveal)}
                    ${shortcutInput('shortcuts.studyRevealAlternate', 'Study: reveal card (alternate)', settings.shortcuts.studyRevealAlternate)}
                    ${shortcutInput('shortcuts.studyUndo', 'Study: undo last review', settings.shortcuts.studyUndo)}
                    ${shortcutInput('shortcuts.studyPrevious', 'Study: previous card', settings.shortcuts.studyPrevious)}
                    ${shortcutInput('shortcuts.studyPreviousAlternate', 'Study: previous card (alternate)', settings.shortcuts.studyPreviousAlternate)}
                    ${shortcutInput('shortcuts.studyNext', 'Study: next card', settings.shortcuts.studyNext)}
                    ${shortcutInput('shortcuts.studyNextAlternate', 'Study: next card (alternate)', settings.shortcuts.studyNextAlternate)}
                    ${renderReviewShortcutInputs(settings)}
                </div>
            </fieldset>
    `;
}

function renderHelpSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-help" role="tabpanel" data-settings-panel="help" data-legend-key="help" hidden>
                <legend>Help</legend>
                ${renderHelpLinksPanel(settings.interfaceLanguage)}
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-diagnostics-title>Diagnostics</div>
                    <div class="grid">
                        ${checkbox('enableLogging', 'Enable console logging', settings.enableLogging)}
                    </div>
                    <div class="jpdb-reader-help" data-diagnostics-help>Print diagnostics to the console.</div>
                </div>
            </fieldset>
    `;
}

function renderSettingsFooter(): string {
    return `
            <div class="footer">
                <div class="jpdb-reader-settings-save-status" data-settings-save-status role="status" aria-live="polite" hidden></div>
                <button class="jpdb-reader-btn" type="button" data-action="cancel">Cancel</button>
                <button class="jpdb-reader-btn add" type="submit">Save</button>
            </div>
    `;
}

function fontFamilyControl(name: FontFamilySettingName, label: string, value: string, text?: SettingsText): string {
    const selectedValue = fontFamilyPresetValue(value);
    return `
        <div class="jpdb-reader-font-family-control" data-font-family-control="${name}">
            ${select(name, label, selectedValue, fontFamilyOptions(text))}
            <label class="jpdb-reader-font-family-custom" data-font-family-custom ${selectedValue === CUSTOM_FONT_FAMILY_VALUE ? '' : 'hidden'}>
                Custom font stack
                <input name="${name}Custom" type="text" value="${escapeHtml(value)}" placeholder="&quot;Noto Sans JP&quot;, sans-serif" autocomplete="off">
            </label>
        </div>
    `;
}

function fontFamilyPresetValue(value: string): string {
    return FONT_FAMILY_PRESETS.some(preset => preset.value === value) ? value : CUSTOM_FONT_FAMILY_VALUE;
}

function fontFamilyOptions(text?: SettingsText): [string, string][] {
    return [
        ...FONT_FAMILY_PRESETS.map(preset => [
            preset.value,
            text ? text(preset.labelKey) : preset.fallbackLabel,
        ] as [string, string]),
        [CUSTOM_FONT_FAMILY_VALUE, text ? text('fontPresetCustom') : 'Custom...'],
    ];
}

function themeSegmentedControl(value: ReaderSettings['theme']): string {
    const isDark = value === 'dark';
    return `
        <div class="jpdb-reader-theme-field" data-theme-field>
            <span class="jpdb-reader-theme-title" id="jpdb-reader-theme-label" data-theme-title>Theme</span>
            <input type="hidden" name="theme" value="${escapeHtml(value)}" data-theme-value>
            <div class="VPNavBarAppearance appearance jpdb-reader-theme-appearance">
                <button class="VPSwitch VPSwitchAppearance jpdb-reader-theme-switch" type="button" role="switch" data-theme-switch data-newtab-action="theme" aria-label="${isDark ? 'Switch to light theme' : 'Switch to dark theme'}" aria-labelledby="jpdb-reader-theme-label" aria-describedby="jpdb-reader-theme-label" aria-checked="${isDark}" title="${isDark ? 'Switch to light theme' : 'Switch to dark theme'}">
                    <span class="check">
                        <span class="icon">
                            <span class="vpi-sun sun" aria-hidden="true"></span>
                            <span class="vpi-moon moon" aria-hidden="true"></span>
                        </span>
                    </span>
                </button>
            </div>
        </div>
    `;
}

export function getFormInterfaceLanguage(form: HTMLFormElement, fallback: InterfaceLanguage): InterfaceLanguage {
    const value = getNamedControl<HTMLSelectElement>(form, 'interfaceLanguage')?.value;
    return value === 'auto' || value === 'en' || value === 'ja' ? value : fallback;
}

export function localizeSettingsForm(form: HTMLFormElement, language: InterfaceLanguage): void {
    unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: '[data-settings-preview-lookup], [data-settings-preview-lookup] .jpdb-reader-word' });
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    withNamedControlIndex(form, () => {
        localizeSettingsShell(form, language, text);
        localizeSettingsLabels(form, text);
        localizeSettingsSectionTitles(form, text);
        localizeSettingsSelects(form, text);
        localizeSettingsShortcuts(form, text);
        localizeSettingsHelpText(form, text);
        localizeSettingsActions(form, text);
        localizeSettingsEditorChrome(form, text);
        localizeHelpLinksPanel(form, language);
        removeSettingsSelectOptionMeta(form);
        normalizeSettingsLabelTextContainers(form);
        syncDisabledSettingsControlDescriptions(form, language);
    });
}

export function syncDisabledSettingsControlDescriptions(form: HTMLFormElement, language: InterfaceLanguage): void {
    const description = ensureDisabledControlDescription(form);
    description.textContent = uiText(language, 'disabledControlDescription');
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:disabled, select:disabled, textarea:disabled').forEach(control => {
        appendDescribedBy(control, DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID);
    });
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)').forEach(control => {
        removeDescribedBy(control, DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID);
    });
}

function ensureDisabledControlDescription(form: HTMLFormElement): HTMLElement {
    let description = form.querySelector<HTMLElement>(`#${DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID}`);
    if (description) return description;
    description = document.createElement('div');
    description.id = DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID;
    description.className = 'jpdb-reader-sr-only';
    form.prepend(description);
    return description;
}

function appendDescribedBy(control: HTMLElement, id: string): void {
    const ids = new Set((control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    ids.add(id);
    control.setAttribute('aria-describedby', Array.from(ids).join(' '));
}

function removeDescribedBy(control: HTMLElement, id: string): void {
    const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).filter(value => value !== id);
    if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
    else control.removeAttribute('aria-describedby');
}

type SettingsText = (key: Parameters<typeof uiText>[1]) => string;
type SettingsTextKey = Parameters<typeof uiText>[1];
const LOCAL_TITLE_TEXT_KEYS = [
    [/API access|APIアクセス/, 'apiAccess'],
    [/Version and updates|Version|バージョンと更新|バージョン/, 'versionAndUpdates'],
    [/Word colors|単語の色/, 'wordColors'],
    [/Pitch accent colors|ピッチアクセント/, 'pitchAccentColors'],
    [/Color channels|色チャンネル/, 'colorChannels'],
    [/Study|学習|New tab|新規タブ/, 'newTab'],
    [/Dictionary site enhancements|辞書サイト拡張|JPDB page enhancements|JPDBページ拡張/, 'jpdbPageEnhancements'],
    [/Lookup pills|検索ピル/, 'lookupPills'],
] as const satisfies readonly (readonly [RegExp, SettingsTextKey])[];
const SELECTOR_TEXT_KEYS = [
    ['[data-popup-lookup-title]', 'popupLookup'],
    ['[data-hover-lookup-title]', 'hoverLookupSettings'],
    ['[data-diagnostics-title]', 'diagnostics'],
    ['[data-anki-library-adapter-title]', 'ankiLibraryAdapter'],
    ['[data-jpdb-api-key-help]', 'apiAccessHelp'],
    ['[data-subtitle-preview] .jpdb-subtitle-secondary', 'subtitlePreview'],
    ['[data-settings-preview-title]', 'preview'],
    ['[data-proxy-guide-summary]', 'audioProxyGuideSummary'],
    ['[data-proxy-guide-show]', 'show'],
    ['[data-proxy-guide-hide]', 'hide'],
    ['[data-cloud-settings-sync-title]', 'cloudSettingsSync'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];
const SETTINGS_ACTION_TEXT_KEYS = [
    ['[data-action="test-anki"]', 'testAnki'],
    ['[data-action="prepare-anki"]', 'prepareAnki'],
    ['[data-action="copy-newtab-url"]', 'copyAddress'],
    ['[data-newtab-url-link]', 'openNewTabPage'],
    ['[data-action="import-yomitan-settings"]', 'importSettings'],
    ['[data-action="export-reader-settings"]', 'exportSettings'],
    ['[data-action="import-yomitan-dictionary"]', 'importDictionaries'],
    ['[data-action="export-yomitan-dictionary"]', 'exportDictionaries'],
    ['[data-action="audio-source-add"]', 'addAudioSource'],
    ['[data-action="cancel"]', 'cancel'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];
const HELP_LINK_PANEL_TEXT_KEYS = [
    ['[data-help-update-title]', 'versionAndUpdates'],
    ['[data-help-update-current]', 'currentYomuVersion'],
    ['[data-help-update-notes]', 'updateHelpNotes'],
    ['[data-help-anki-title]', 'ankiConnectSetupTitle'],
    ['[data-help-anki-copy]', 'ankiConnectSetupCopy'],
    ['[data-help-anki-config-copy]', 'ankiConnectSetupConfig'],
    ['[data-help-anki-mobile]', 'ankiConnectSetupMobile'],
    ['[data-help-anki-brave]', 'ankiConnectSetupBrave'],
    ['[data-help-links-title]', 'helpLinksTitle'],
    ['[data-help-links-copy]', 'helpLinksCopy'],
    ['[data-help-support-title]', 'helpSupportTitle'],
    ['[data-help-support-copy]', 'helpSupportCopy'],
    ['[data-help-support-copy-extra]', 'helpSupportCopyExtra'],
    ['[data-help-link="factory-reset"]', 'factoryReset'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];
const HELP_LINK_BUTTON_TEXT_KEYS = [
    ['update-userscript', 'updateUserscript'],
    ['anki-connect-addon', 'ankiStatusInstallAddon'],
    ['anki-mobile-docs', 'ankiStatusMobileDocs'],
    ['video-player', 'videoPlayer'],
    ['pdf-reader', 'pdfReader'],
    ['new-tab', 'newTabPage'],
    ['docs', 'docs'],
    ['issues', 'issues'],
    ['donate', 'donate'],
    ['discord', 'discord'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];
const ANKI_TEMPLATE_PREVIEW_SMALL_TEXT_KEYS = [
    [/above the prompt/, 'imageAbovePrompt'],
    [/highlighted word/, 'recallHighlightedWord'],
    [/front when available/, 'imageOnFront'],
    [/meaning first/, 'recallMeaning'],
    [/Includes dictionary/, 'ankiBackIncludes'],
] as const satisfies readonly (readonly [RegExp, SettingsTextKey])[];
const DECK_HELP_TEXT_KEYS = [
    [/Decks are loaded|JPDBアカウント/, 'decksLoaded'],
    [/Could not load decks|まだデッキ/, 'decksUnavailable'],
    [/Add your JPDB API key|JPDB APIキー/, 'addApiKeyChooseDecks'],
] as const satisfies readonly (readonly [RegExp, SettingsTextKey])[];

function localizeSettingsShell(form: HTMLFormElement, language: InterfaceLanguage, text: SettingsText): void {
    form.lang = resolveUiLanguage(language);
    form.setAttribute('aria-label', text('settingsTitle'));
    form.querySelector('h2')?.replaceChildren(text('settingsTitle'));
    form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs')?.setAttribute('aria-label', text('settingsSections'));
    form.querySelector<HTMLElement>('.jpdb-reader-settings-drag-handle')?.setAttribute('aria-label', text('resizeSettings'));
    localizeThemeSwitch(form, text);
    localizeSettingsTabs(form, text);
    localizeSettingsSearch(form, text);
    localizeSettingsLegends(form, text);
}

function localizeThemeSwitch(form: HTMLFormElement, text: SettingsText): void {
    const switchButton = form.querySelector<HTMLButtonElement>('[data-theme-switch]');
    if (!switchButton) return;
    const isDark = switchButton.getAttribute('aria-checked') === 'true';
    const label = isDark ? text('switchToLightTheme') : text('switchToDarkTheme');
    switchButton.setAttribute('aria-label', label);
    switchButton.title = label;
}

function localizeSettingsTabs(form: HTMLFormElement, text: SettingsText): void {
    SETTINGS_TABS.forEach(({ panel, labelKey }) => {
        const key = labelKey ?? (panel as SettingsTextKey);
        form.querySelector<HTMLButtonElement>(`[data-action="settings-panel"][data-panel="${panel}"]`)?.replaceChildren(text(key));
    });
}

function localizeSettingsSearch(form: HTMLFormElement, text: SettingsText): void {
    const input = form.querySelector<HTMLInputElement>('[data-settings-search]');
    input?.closest('label')?.querySelector<HTMLElement>(':scope > .jpdb-reader-settings-label-text')?.replaceChildren(text('settingsSearch'));
    if (input) {
        input.placeholder = text('settingsSearchPlaceholder');
        input.setAttribute('aria-label', text('settingsSearch'));
    }
    form.querySelector<HTMLElement>('[data-settings-search-empty]')?.replaceChildren(text('settingsSearchNoResults'));
    applySettingsSearch(form, input?.value ?? '');
}

function localizeSettingsLegends(form: HTMLFormElement, text: SettingsText): void {
    getSettingsPanelFieldsets(form).forEach(fieldset => {
        const key = fieldset.dataset.legendKey;
        if (!isSettingsTextKey(key)) return;
        directFieldsetLegend(fieldset)?.replaceChildren(text(key));
    });
}

function apiCredentialSettingsFromForm(form: HTMLFormElement): Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'> {
    const jpdbField = getNamedControl<HTMLInputElement>(form, 'apiCredentialJpdb');
    const jitenField = getNamedControl<HTMLInputElement>(form, 'apiCredentialJiten');
    if (jpdbField || jitenField) return mergeApiCredentialValues(jpdbField?.value ?? '', jitenField?.value ?? '');
    const combined = getNamedControl<HTMLInputElement>(form, 'apiCredential')?.value ?? '';
    if (combined.trim()) return { apiKey: combined, jitenApiKey: '' };
    return {
        apiKey: getNamedControl<HTMLInputElement>(form, 'apiKey')?.value ?? '',
        jitenApiKey: getNamedControl<HTMLInputElement>(form, 'jitenApiKey')?.value ?? '',
    };
}

function apiCredentialLabelFromForm(form: HTMLFormElement): string {
    return combinedApiCredentialLabel(apiCredentialSettingsFromForm(form));
}

function localizeSettingsLabels(form: HTMLFormElement, text: SettingsText): void {
    SETTINGS_CONTROL_LABELS.forEach(([name, key]) => setControlLabel(form, name, text(key)));
    const jpdbSettings = form.querySelector<HTMLAnchorElement>('label a[href*="jpdb.io/settings"]');
    if (jpdbSettings) jpdbSettings.textContent = text('jpdbSettings');
    const jitenSettings = form.querySelector<HTMLAnchorElement>('label a[href*="jiten.moe/settings"]');
    if (jitenSettings) jitenSettings.textContent = text('jitenSettings');
    const bunproSettings = form.querySelector<HTMLAnchorElement>('label a[href*="bunpro.jp/settings"]');
    if (bunproSettings) bunproSettings.textContent = text('bunproSettings');
    const nadeshikoKeyLink = form.querySelector<HTMLAnchorElement>('label a[href*="nadeshiko.co/user/developer"]');
    if (nadeshikoKeyLink) nadeshikoKeyLink.textContent = text('getNadeshikoKey');
    localizeBlockControlLabel(form, 'ocrEndpointUrl', text('ocrEndpointUrl'));
    localizeBlockControlLabel(form, 'ocrCloudVisionApiKey', text('cloudVisionApiKey'));
    localizeFontFamilyCustomLabels(form, text);
}

function localizeBlockControlLabel(form: HTMLFormElement, name: string, label: string): void {
    const labelElement = getNamedControl<HTMLInputElement>(form, name)?.closest('label');
    if (labelElement) setBlockLabelText(labelElement, label);
}

function localizeFontFamilyCustomLabels(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLLabelElement>('.jpdb-reader-font-family-custom').forEach(label => {
        setBlockLabelText(label, text('customFontFamily'));
    });
}

function localizeSettingsSectionTitles(form: HTMLFormElement, text: SettingsText): void {
    LOCAL_TITLE_TEXT_KEYS.forEach(([pattern, key]) => replaceLocalTitle(form, pattern, text(key)));
    SELECTOR_TEXT_KEYS.forEach(([selector, key]) => {
        form.querySelector<HTMLElement>(selector)?.replaceChildren(text(key));
    });
}

function replaceLocalTitle(form: HTMLFormElement, pattern: RegExp, value: string): void {
    const title = Array.from(form.querySelectorAll<HTMLElement>('.jpdb-reader-local-title'))
        .find(element => pattern.test(element.textContent ?? ''));
    title?.replaceChildren(value);
}

function localizeSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    localizeBasicSettingsSelects(form, text);
    localizeColorAndReaderSelects(form, text);
    localizeMediaSettingsSelects(form, text);
    localizeMiningSettingsSelects(form, text);
}

function localizeBasicSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'interfaceLanguage', [
        ['auto', text('automatic')],
        ['en', text('english')],
        ['ja', text('japanese')],
    ]);
    form.querySelector<HTMLElement>('[data-theme-title]')?.replaceChildren(text('theme'));
    setSelectOptionLabels(form, 'popupMode', [
        ['auto', text('auto')],
        ['sheet', text('bottomSheet')],
        ['popover', text('popover')],
    ]);
    setSelectOptionLabels(form, 'popoverHeightMode', [
        ['available', text('popoverHeightAvailable')],
        ['fixed', text('popoverHeightFixed')],
    ]);
    setSelectOptionLabels(form, 'readerFontFamily', fontFamilyOptions(text));
    setSelectOptionLabels(form, 'popupFontFamily', fontFamilyOptions(text));
    setSelectOptionLabels(form, 'newTabSource', [
        ['auto', text('newTabAuto')],
        ['jpdb', text('newTabApiSrs')],
        ['bunpro', text('newTabBunpro')],
        ['yomu-local', text('newTabYomuLocal')],
        ['anki', 'Anki'],
        ['dictionary', text('dictionaryFallback')],
    ]);
    setSelectOptionLabels(form, 'newTabJpdbReviewMode', [
        ['auto', text('newTabJpdbReviewAuto')],
        ['live-review', text('newTabLiveReview')],
        ['api-vocabulary', text('newTabApiVocabulary')],
    ]);
    setSelectOptionLabels(form, 'newTabKanjiKeywordSource', kanjiKeywordSourceOptions(apiCredentialSettingsFromForm(form), text));
    setSelectOptionLabels(form, 'twoButtonReviews', [
        ['false', text('fivePoint')],
        ['true', text('twoPoint')],
    ]);
}

function localizeColorAndReaderSelects(form: HTMLFormElement, text: SettingsText): void {
    localizeColorSourceSelects(form, text);
    setSelectOptionLabels(form, 'appearancePreset', [
        ['', text('appearancePresetCustom')],
        ['balanced', text('appearancePresetBalanced')],
        ['new-only', text('appearancePresetNewOnly')],
        ['underline-new', text('appearancePresetUnderlineNew')],
        ['no-colors', text('appearancePresetNoColors')],
    ]);
    setSelectOptionLabels(form, 'wordColorStates', [
        ['all', text('wordColorStatesAll')],
        ['new-only', text('wordColorStatesNewOnly')],
    ]);
    setSelectOptionLabels(form, 'furiganaMode', [
        ['auto', text('automatic')],
        ['known-status', text('furiganaHideKnown')],
        ['difficult-kanji', text('furiganaDifficultKanji')],
        ['hover', text('furiganaHoverOnly')],
        ['all', text('furiganaAllParsed')],
        ['off', text('off')],
    ]);
}

function localizeColorSourceSelects(form: HTMLFormElement, text: SettingsText): void {
    const apiLabel = apiCredentialLabelFromForm(form);
    [
        'wordHighlightColorSource',
        'wordUnderlineColorSource',
        'wordTextColorSource',
        'subtitleHighlightColorSource',
        'subtitleUnderlineColorSource',
        'subtitleTextColorSource',
    ].forEach(name => setSelectOptionLabels(form, name, [
        ['status', text('colorSourceStatus').replace('JPDB', apiLabel)],
        ['jpdb', text('colorSourceJpdb').replace('JPDB', apiLabel)],
        ['anki', text('colorSourceAnki')],
        ['pitch', text('colorSourcePitch')],
        ['off', text('off')],
    ]));
}

function localizeMediaSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'audioAutoPlayMode', [
        ['all', text('audioAutoPlayAll')],
        ['hover', text('audioAutoPlayHover')],
        ['tap', text('audioAutoPlayTap')],
    ]);
    setSelectOptionLabels(form, 'audioSelectionMode', [
        ['first', text('firstAudio')],
        ['random', text('randomAudio')],
    ]);
    setSelectOptionLabels(form, 'audioTtsMode', [
        ['fallback', text('audioTtsFallback')],
        ['source-order', text('audioTtsSourceOrder')],
    ]);
    setSelectOptionLabels(form, 'immersionKitCategory', [
        ['all', text('allCategories')],
        ['anime', text('anime')],
        ['drama', text('drama')],
        ['games', text('games')],
    ]);
    setSelectOptionLabels(form, 'immersionKitExampleSource', [
        ['immersion-kit', text('immersionKit')],
        ['nadeshiko', 'Nadeshiko'],
        ['combined', text('immersionKitAndNadeshiko')],
    ]);
    setSelectOptionLabels(form, 'immersionKitSort', [
        ['sentence_length:asc', text('shortestFirst')],
        ['sentence_length:desc', text('longestFirst')],
    ]);
    localizeOcrSettingsSelects(form, text);
    setSelectOptionLabels(form, 'subtitleControlsMode', [
        ['auto', text('showWhenNeeded')],
        ['hidden', text('hideControls')],
        ['always', text('alwaysVisible')],
    ]);
    setSelectOptionLabels(form, 'subtitleTranscriptPlacement', [
        ['right', text('right')],
        ['left', text('left')],
        ['bottom', text('bottom')],
    ]);
    setSelectOptionLabels(form, 'subtitleFontFamily', fontFamilyOptions(text));
}

function localizeOcrSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'ocrProvider', [
        ['google-lens', text('googleLens')],
        ['cloud-vision', text('cloudVision')],
        ['local-service', text('localOcr')],
        ['off', text('off')],
    ]);
    setSelectOptionLabels(form, 'ocrOverlayTheme', [
        ['auto', text('ocrOverlayThemeAuto')],
        ['light', text('ocrOverlayThemeLight')],
        ['dark', text('ocrOverlayThemeDark')],
    ]);
    setSelectOptionLabels(form, 'ocrMaxImagesPerPage', [
        ['3', text('lightWork')],
        ['8', text('normal')],
        ['16', text('more')],
    ]);
    setSelectOptionLabels(form, 'ocrMinImageArea', [
        ['80000', text('largeOnly')],
        ['45000', text('normal')],
        ['15000', text('includeSmall')],
    ]);
    setSelectOptionLabels(form, 'ocrMaxImagePixels', [
        ['640000', text('faster')],
        ['1200000', text('balanced')],
        ['2000000', text('sharper')],
    ]);
    setSelectOptionLabels(form, 'ocrEngine', [
        ['auto', text('automatic')],
        ['MangaOCR', text('ocrEngineMangaOcr')],
        ['PaddleOCR', 'PaddleOCR'],
        ['AppleVision', text('ocrEngineAppleVision')],
    ]);
}

function localizeMiningSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'ankiTemplateMode', [
        ['recognition', text('wordFirst')],
        ['context', text('sentenceFirst')],
    ]);
    form.querySelector<HTMLElement>('[data-anki-library-choices-title]')?.replaceChildren(text('ankiLibraryChoices'));
    form.querySelector<HTMLElement>('[data-anki-library-choices-help]')?.replaceChildren(text('ankiLibraryChoicesHelp'));
    form.querySelector<HTMLElement>('[data-anki-template-settings-title]')?.replaceChildren(text('ankiTemplateSettings'));
    form.querySelector<HTMLElement>('[data-anki-template-settings-help]')?.replaceChildren(text('ankiTemplateSettingsHelp'));
    form.querySelectorAll<HTMLElement>('[data-confidence]').forEach(chip => {
        const confidence = chip.dataset.confidence;
        if (confidence === 'high') chip.replaceChildren(text('ankiMappingHighConfidence'));
        else if (confidence === 'medium') chip.replaceChildren(text('ankiMappingMediumConfidence'));
        else if (confidence === 'low') chip.replaceChildren(text('ankiMappingLowConfidence'));
    });
}

function localizeSettingsShortcuts(form: HTMLFormElement, text: SettingsText): void {
    setShortcutPlaceholder(form, 'shortcuts.hoverLookup', text('blankPlainHover'));
    form.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        if (inputEl.name !== 'shortcuts.hoverLookup') inputEl.placeholder = text('pressKeys');
    });
    const pageScanLegend = getNamedControl<HTMLInputElement>(form, 'pageScanMode')
        ?.closest<HTMLFieldSetElement>('.jpdb-reader-radio-group')
        ?.querySelector('legend');
    pageScanLegend?.replaceChildren(text('pageScanMode'));
    setRadioLabel(form, 'pageScanMode', 'off', text('pageScanModeOff'));
    setRadioLabel(form, 'pageScanMode', 'auto', text('pageScanModeAuto'));
    setRadioLabel(form, 'pageScanMode', 'manual', text('pageScanModeManual'));
    const manualPageScanShortcutLabel = form.querySelector<HTMLLabelElement>('[data-manual-page-scan-shortcut-label] label');
    if (manualPageScanShortcutLabel) setBlockLabelText(manualPageScanShortcutLabel, text('manualPageScanShortcut'));
    const ocrModeLegend = getNamedControl<HTMLInputElement>(form, 'ocrInteractionMode')
        ?.closest<HTMLFieldSetElement>('.jpdb-reader-radio-group')
        ?.querySelector('legend');
    ocrModeLegend?.replaceChildren(text('ocrInteractionMode'));
    setRadioLabel(form, 'ocrInteractionMode', 'auto', text('ocrInteractionModeAuto'));
    setRadioLabel(form, 'ocrInteractionMode', 'manual', text('ocrInteractionModeManual'));
    setRadioLabel(form, 'ocrInteractionMode', 'off', text('ocrInteractionModeOff'));
    const immersionLimitLegend = getNamedControl<HTMLInputElement>(form, 'immersionKitLimitEnabled')
        ?.closest<HTMLFieldSetElement>('.jpdb-reader-radio-group')
        ?.querySelector('legend');
    immersionLimitLegend?.replaceChildren(text('immersionKitLimitEnabled'));
    setRadioLabel(form, 'immersionKitLimitEnabled', 'off', text('allExamples'));
    setRadioLabel(form, 'immersionKitLimitEnabled', 'on', text('limitExamples'));
}

function localizeSettingsHelpText(form: HTMLFormElement, text: SettingsText): void {
    localizeKeyedHelpText(form, text);
    form.querySelector<HTMLElement>('[data-youtube-help]')?.replaceChildren(text('youtubeHelp'));
    localizeNewTabHelp(form, text);
    localizeDictionaryImportHelp(form, text);
    localizeLookupPillsHelp(form, text);
    const ankiHelp = form.querySelector<HTMLElement>('[data-anki-setup-help]');
    if (ankiHelp) setInnerHtml(ankiHelp, ankiSetupHelpHtml(resolveUiLanguageFromText(text)));
    form.querySelector<HTMLElement>('[data-anki-library-availability]')?.replaceChildren(text('ankiLibraryAdapterStatus'));
    form.querySelector<HTMLElement>('[data-diagnostics-help]')?.replaceChildren(text('diagnosticsHelp'));
}

function localizeNewTabHelp(form: HTMLFormElement, text: SettingsText): void {
    form.querySelector<HTMLElement>('[data-newtab-address-help]')?.replaceChildren(text('newTabAddressHelp'));
    form.querySelector<HTMLElement>('[data-newtab-offline-help]')?.replaceChildren(text('newTabOfflineHelp'));
    form.querySelector<HTMLElement>('[data-newtab-anki-decks-title]')?.replaceChildren(text('newTabAnkiReviewDecks'));
    form.querySelector<HTMLElement>('[data-newtab-anki-decks-help]')?.replaceChildren(text('newTabAnkiReviewDecksHelp'));
}

function resolveUiLanguageFromText(text: SettingsText): 'en' | 'ja' {
    return text('save') === '保存' ? 'ja' : 'en';
}

function localizeKeyedHelpText(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLElement>('[data-help-key]').forEach(help => {
        const key = help.dataset.helpKey;
        if (!isSettingsTextKey(key)) return;
        if (key === 'audioHelp') {
            setInnerHtml(help, audioHelpHtml(resolveUiLanguageFromText(text)));
            return;
        }
        help.replaceChildren(text(key));
    });
}

function isSettingsTextKey(value: string | undefined): value is SettingsTextKey {
    return Boolean(value);
}

function localizeLookupPillsHelp(form: HTMLFormElement, text: SettingsText): void {
    const lookupLinks = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links');
    lookupLinks?.closest<HTMLElement>('.jpdb-reader-settings-subsection')
        ?.querySelector<HTMLElement>(':scope > .jpdb-reader-help')
        ?.replaceChildren(text('lookupPillsHelp'));
}

function localizeDictionaryImportHelp(form: HTMLFormElement, text: SettingsText): void {
    const importStatus = form.querySelector<HTMLElement>('[data-import-status]');
    if (importStatus && /Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? '')) importStatus.textContent = text('dictionaryImportHelp');
}

function localizeSettingsActions(form: HTMLFormElement, text: SettingsText): void {
    SETTINGS_ACTION_TEXT_KEYS.forEach(([selector, key]) => {
        form.querySelectorAll<HTMLElement>(selector).forEach(button => button.replaceChildren(text(key)));
    });
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.replaceChildren(text('save'));
    localizePreviewAudioButtons(form, text);
}

function localizePreviewAudioButtons(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLButtonElement>('[data-action="preview-audio"]').forEach(button => {
        button.title = text('previewAudio');
        button.setAttribute('aria-label', text('previewAudio'));
    });
}

function localizeSettingsEditorChrome(form: HTMLFormElement, text: SettingsText): void {
    const audioHead = form.querySelectorAll('.jpdb-reader-audio-source-head span');
    audioHead[0]?.replaceChildren(text('enabledHeader'));
    audioHead[1]?.replaceChildren(text('audioSource'));
    audioHead[2]?.replaceChildren(text('urlVoice'));
    audioHead[3]?.replaceChildren(text('orderHeader'));
    audioHead[4]?.replaceChildren(text('removeHeader'));
    form.querySelector<HTMLButtonElement>('[data-action="lookup-link-add"]')?.replaceChildren(text('add'));
    form.querySelector('.jpdb-reader-recommended-title')?.replaceChildren(text('recommendedDownloads'));
    form.querySelector('[data-recommended-dictionary-help]')?.replaceChildren(text('dictionaryInstallQueueHelp'));
    localizeOrderButtons(form, text);
    localizeLookupLinkEditor(form, text);
    localizeDeckControls(form, text);
    const statusLanguage = resolveUiLanguageFromText(text);
    localizeJpdbStatus(form, statusLanguage);
    localizeBunproStatus(form, statusLanguage);
    localizeInitialAnkiStatus(form, statusLanguage);
    localizeSourceRows(form, text);
    localizeRecommendedDictionaryGroups(form, text);
    localizeRecommendedDictionaryDescriptions(form, text);
    localizeAnkiTemplatePreview(form, text);
    localizeAudioSourceFields(form, text);
    localizeRecommendedDictionaryButtons(form, text);
    localizeDictionaryStatus(form, text);
}

function localizeOrderButtons(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLButtonElement>('[data-source-drag-handle]').forEach(button => setButtonTitle(button, text('dragToReorder')));
    form.querySelectorAll<HTMLButtonElement>('[data-action$="-up"]').forEach(button => setButtonTitle(button, text('moveUp')));
    form.querySelectorAll<HTMLButtonElement>('[data-action$="-down"]').forEach(button => setButtonTitle(button, text('moveDown')));
    form.querySelectorAll<HTMLButtonElement>('[data-action$="-remove"]').forEach(button => setButtonTitle(button, text('remove')));
    form.querySelectorAll<HTMLButtonElement>('[data-action="delete-yomitan-dictionary"]').forEach(button => setButtonTitle(button, text('removeImportedDictionary')));
}

function setButtonTitle(button: HTMLButtonElement, label: string): void {
    button.title = label;
    button.setAttribute('aria-label', label);
}

function localizeLookupLinkEditor(form: HTMLFormElement, text: SettingsText): void {
    const lookupHead = form.querySelectorAll('.jpdb-reader-lookup-link-head span');
    lookupHead[0]?.replaceChildren(text('enabledHeader'));
    lookupHead[1]?.replaceChildren(text('labelHeader'));
    lookupHead[2]?.replaceChildren(text('lookupUrlTemplate'));
    lookupHead[3]?.replaceChildren(text('orderHeader'));
    lookupHead[4]?.replaceChildren(text('removeHeader'));
    form.querySelectorAll<HTMLElement>('.jpdb-reader-lookup-link-note[data-lookup-link-note="copy"]').forEach(note => note.replaceChildren(text('copiesCurrentWord')));
    form.querySelectorAll<HTMLElement>('.jpdb-reader-lookup-link-fixed').forEach(note => note.setAttribute('aria-label', text('builtInAction')));
    form.querySelectorAll<HTMLInputElement>('input[name^="dictionaryLookupLinks."][name$=".label"]').forEach((input, index) => {
        input.setAttribute('aria-label', text('lookupPillLabelNumber').replace('{number}', String(index + 1)));
    });
    form.querySelectorAll<HTMLInputElement>('input[name^="dictionaryLookupLinks."][name$=".urlTemplate"]').forEach((input, index) => {
        input.setAttribute('aria-label', text('lookupUrlTemplateNumber').replace('{number}', String(index + 1)));
    });
    form.querySelectorAll<HTMLInputElement>('[data-lookup-link-enable-toggle]').forEach(input => {
        const row = input.closest<HTMLElement>('[data-lookup-link-row]');
        const name = row?.querySelector<HTMLInputElement>('input[name$=".label"]')?.value.trim()
            || row?.querySelector<HTMLElement>('.jpdb-reader-lookup-link-note')?.textContent?.trim()
            || input.closest('label')?.textContent?.trim()
            || '';
        input.setAttribute('aria-label', text('enableLookupPillName').replace('{name}', name));
    });
    form.querySelectorAll<HTMLElement>('.jpdb-reader-lookup-link-row .jpdb-reader-row-order-tools').forEach(row => {
        row.setAttribute('aria-label', text('lookupPillOrder'));
    });
}

function localizeDeckControls(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'newTabJpdbDeck', [
        ['all', text('allStudyDecks')],
        ['never-forget', text('never')],
    ]);
    const deckHelp = form.querySelector<HTMLElement>('[data-jpdb-decks] .jpdb-reader-help');
    if (!deckHelp) return;
    const key = textKeyForPattern(deckHelp.textContent ?? '', DECK_HELP_TEXT_KEYS);
    if (key) deckHelp.replaceChildren(text(key));
}

function localizeSourceRows(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll('.jpdb-reader-dictionary-head').forEach(head => localizeSourceHead(head, text));
    form.querySelectorAll<HTMLElement>('[data-source-name-key]').forEach(element => {
        const key = element.dataset.sourceNameKey;
        if (isSettingsTextKey(key)) element.replaceChildren(text(key));
    });
    form.querySelectorAll<HTMLInputElement>('[data-source-placeholder-key]').forEach(input => {
        const key = input.dataset.sourcePlaceholderKey;
        if (isSettingsTextKey(key)) input.placeholder = text(key);
    });
    form.querySelectorAll<HTMLElement>('[data-source-help-key]').forEach(element => {
        const key = element.dataset.sourceHelpKey;
        if (isSettingsTextKey(key)) element.replaceChildren(text(key));
    });
    replaceSourceHelp(form, /Import Yomitan dictionaries|Yomitan辞書をインポート/, text('importLocalDefinitionsHelp'));
    replaceSourceHelp(form, /Frequency, pitch, and kanji metadata|頻度、ピッチ、漢字メタデータ/, text('frequencyMetadataHelp'));
    // Keep these fallback English names paired with the sourceName*/sourceHelp* i18n keys.
    const rows: Array<[string, SettingsTextKey, SettingsTextKey]> = [
        ['Translation', 'sourceNameTranslation', 'sourceHelpTranslation'],
        ['Grammar', 'sourceNameGrammar', 'sourceHelpGrammar'],
        ['Immersion Kit', 'sourceNameImmersionKit', 'sourceHelpImmersionKit'],
        ['Stroke practice', 'sourceNameStrokePractice', 'sourceHelpStrokePractice'],
        ['Readings and components', 'readingsComponents', 'sourceHelpReadingsComponents'],
        ['Imported kanji dictionaries', 'sourceNameImportedKanjiDictionaries', 'sourceHelpImportedKanjiDictionaries'],
        ['Component graph', 'originStructure', 'sourceHelpComponentGraph'],
    ];
    rows.forEach(([sourceName, nameKey, helpKey]) => {
        form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]').forEach(row => {
            const display = row.querySelector<HTMLElement>('.jpdb-reader-field-display');
            if (display?.textContent === sourceName) display.replaceChildren(text(nameKey));
            const help = row.querySelector<HTMLElement>('.jpdb-reader-dictionary-row-help');
            if (help && !help.dataset.sourceHelpKey && sourceRowHelpMatches(help.textContent ?? '', sourceName)) help.replaceChildren(text(helpKey));
        });
    });
    replaceSourceHelp(form, /JPDB meanings shown/, text('sourceHelpJpdb'));
    replaceSourceHelp(form, /Example sentences, images, and audio/, text('sourceHelpImmersionKit'));
    replaceSourceHelp(form, /Remembering the Kanji/, text('sourceHelpRtk'));
    replaceSourceHelp(form, /Uchisen mnemonic/, text('sourceHelpUchisen'));
    replaceSourceHelp(form, /Imported Yomitan kanji dictionary/, text('sourceHelpImportedKanjiDictionary'));
    form.querySelectorAll<HTMLInputElement>('[data-source-enable-toggle]').forEach(input => {
        const row = input.closest<HTMLElement>('[data-dictionary-source-row]');
        const name = row?.querySelector<HTMLInputElement>('input[name$=".alias"]')?.value.trim()
            || row?.querySelector<HTMLElement>('.jpdb-reader-field-display')?.textContent?.trim()
            || input.closest('label')?.textContent?.trim()
            || '';
        input.setAttribute('aria-label', text('enableSourceName').replace('{name}', name));
    });
}

function localizeSourceHead(head: Element, text: SettingsText): void {
    const spans = head.querySelectorAll('span');
    const hasDisplayName = !head.classList.contains('compact');
    spans[0]?.replaceChildren(text('enabledHeader'));
    const sourceLabel = sourceHeadLabel(spans[1]?.textContent ?? '', text);
    spans[1]?.replaceChildren(sourceLabel);
    if (hasDisplayName) {
        spans[2]?.replaceChildren(text('displayName'));
        spans[3]?.replaceChildren(text('orderHeader'));
        spans[4]?.replaceChildren(text('removeHeader'));
    } else {
        spans[2]?.replaceChildren(text('orderHeader'));
        spans[3]?.replaceChildren(text('removeHeader'));
    }
}

function sourceHeadLabel(value: string, text: SettingsText): string {
    if (value === 'Kanji section') return text('kanjiSection');
    return text('definitionSource');
}

function replaceSourceHelp(form: HTMLFormElement, pattern: RegExp, value: string): void {
    form.querySelectorAll<HTMLElement>('.jpdb-reader-help, .jpdb-reader-dictionary-row-help').forEach(help => {
        if (pattern.test(help.textContent ?? '')) help.replaceChildren(value);
    });
}

function sourceRowHelpMatches(value: string, sourceName: string): boolean {
    return value.includes(sourceName);
}

function localizeRecommendedDictionaryGroups(form: HTMLFormElement, text: SettingsText): void {
    const labels = [text('termDictionaries'), text('kanjiDictionaries'), text('pitchDictionaries'), text('frequencyDictionaries')];
    form.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-group-title').forEach((title, index) => {
        if (labels[index]) title.replaceChildren(labels[index]);
    });
}

function localizeRecommendedDictionaryDescriptions(form: HTMLFormElement, text: SettingsText): void {
    RECOMMENDED_JAPANESE_DICTIONARIES.forEach(dictionary => {
        const control = form.querySelector<HTMLElement>(`[data-dictionary-id="${dictionary.id}"]`);
        control?.closest<HTMLElement>('.jpdb-reader-recommended-item')
            ?.querySelector<HTMLElement>('.jpdb-reader-help')
            ?.replaceChildren(text(dictionary.descriptionKey));
    });
}

function localizeAnkiTemplatePreview(form: HTMLFormElement, text: SettingsText): void {
    const preview = form.querySelector<HTMLElement>('.jpdb-reader-template-preview');
    if (!preview) return;
    const contextMode = getNamedControl<HTMLSelectElement>(form, 'ankiTemplateMode')?.value === 'context';
    preview.querySelector<HTMLElement>('.jpdb-reader-template-preview-title')?.replaceChildren(text(contextMode ? 'sentenceFirstPreset' : 'wordFirstPreset'));
    const headings = preview.querySelectorAll('strong');
    headings[0]?.replaceChildren(text('front'));
    headings[1]?.replaceChildren(text('back'));
    preview.querySelector<HTMLElement>('.jpdb-reader-template-meaning')?.replaceChildren(text('exampleMeaning'));
    preview.querySelectorAll('small').forEach(small => {
        const key = textKeyForPattern(small.textContent ?? '', ANKI_TEMPLATE_PREVIEW_SMALL_TEXT_KEYS);
        if (key) small.replaceChildren(text(key));
    });
}

function textKeyForPattern(value: string, options: readonly (readonly [RegExp, SettingsTextKey])[]): SettingsTextKey | undefined {
    return options.find(([pattern]) => pattern.test(value))?.[1];
}

function localizeAudioSourceFields(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLInputElement>('input[name^="audioSources."][name$=".enabled"]').forEach((input, index) => {
        input.setAttribute('aria-label', text('enableAudioSourceNumber').replace('{number}', String(index + 1)));
    });
    form.querySelectorAll<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]').forEach((select, index) => {
        select.setAttribute('aria-label', text('audioSourceNumber').replace('{number}', String(index + 1)));
        localizeAudioSourceTypeOptions(select, text);
    });
    form.querySelectorAll<HTMLSelectElement>('select[data-audio-voice-field]').forEach((select, index) => {
        select.setAttribute('aria-label', text('textToSpeechVoiceNumber').replace('{number}', String(index + 1)));
    });
    form.querySelectorAll<HTMLInputElement>('[data-audio-url-field]').forEach(input => {
        input.placeholder = localizedAudioUrlPlaceholder(input, text);
    });
}

function localizeAudioSourceTypeOptions(select: HTMLSelectElement, text: SettingsText): void {
    const language = resolveUiLanguageFromText(text);
    Array.from(select.options).forEach(option => {
        if (!isAudioSourceTypeValue(option.value)) return;
        const label = audioSourceLabel(language, option.value);
        option.textContent = option.value === 'custom'
            ? text('customAdvanced').replace('{label}', label)
            : label;
    });
}

function localizedAudioUrlPlaceholder(input: HTMLInputElement, text: SettingsText): string {
    const type = input.closest<HTMLElement>('[data-audio-source-row]')?.querySelector<HTMLSelectElement>('select[name$=".type"]')?.value;
    return text(audioUrlPlaceholderKey(type));
}

function localizeRecommendedDictionaryButtons(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLButtonElement>('[data-action="download-recommended-dictionary"]').forEach(button => {
        const installed = button.dataset.installed === 'true';
        const state = button.dataset.importState;
        const label = state === 'installing'
            ? text('installing')
            : state === 'queued'
                ? text('queued')
                : installed ? text('update') : text('install');
        button.textContent = label;
        button.title = button.dataset.importMessage || label;
        button.setAttribute('aria-label', button.title);
    });
    form.querySelectorAll<HTMLElement>('[data-recommended-dictionary-guide]').forEach(link => {
        setExternalButtonLabel(link, text('dictionaryGuide'));
    });
}

function localizeDictionaryStatus(form: HTMLFormElement, text: SettingsText): void {
    const dictionaryStatus = form.querySelector<HTMLElement>('[data-dictionary-status]');
    if (dictionaryStatus && /Checking imported|インポート済み辞書を確認/.test(dictionaryStatus.textContent ?? '')) {
        dictionaryStatus.textContent = text('checkingDictionaries');
    }
}

const DIRECT_SETTINGS_CONTROL_LABEL_KEYS = [
    'apiCredential', 'apiCredentialJpdb', 'apiCredentialJiten', 'apiCredentialBunproLegacy', 'apiCredentialBunpro', 'miningDeck', 'newTabJpdbDeck', 'neverForgetDeck', 'blacklistDeck',
    'jpdbMiningEnabled', 'bunproMiningEnabled', 'yomuLocalSrsEnabled', 'addToForq', 'enableReviews', 'jpdbPageEnhancementsEnabled', 'jpdbPageWordEnhancementsEnabled',
    'jpdbPageKanjiEnhancementsEnabled', 'popupMode', 'stickyBottomSheet', 'popoverBackdropEnabled', 'popoverWidth',
    'popoverHeight', 'popoverHeightMode', 'selectionPopoverShowTranslation', 'readerFontFamily', 'popupFontFamily', 'popupFontWeight',
    'enableLogging', 'accentColor', 'newTabAnkiEnabled', 'newTabSource',
    'newTabJpdbReviewMode', 'corsProxyUrl', 'newTabKanjiKeywordSource', 'newTabParsingEnabled', 'newTabFrontSentenceEnabled',
    'newTabKanjiAutogradeEnabled', 'newTabKanjiAutoSubmit', 'newTabOfflineEnabled', 'newTabOfflineLimit', 'newTabDailyGoalMinutes', 'newTabKanjiUnlockEnabled', 'newTabStopAtBatchEnd', 'newTabSwipeReviews', 'newTabShortcutHintsEnabled', 'newTabUrl',
    'wordColorNew', 'wordColorLearning', 'wordColorKnown', 'wordColorDue', 'wordColorFailed',
    'wordColorIgnored', 'pitchColorHeiban', 'pitchColorAtamadaka', 'pitchColorNakadaka', 'pitchColorOdaka',
    'pitchColorKifuku', 'pitchColorUnknown', 'wordHighlightColorSource', 'wordUnderlineColorSource', 'wordTextColorSource',
    'subtitleHighlightColorSource', 'subtitleUnderlineColorSource', 'subtitleTextColorSource', 'parseSelection', 'lookupOnClick',
    'popupLookupEnabled', 'lookupOnHover', 'lookupOnMiddleMouse', 'showFloatingButton', 'pageScanMode', 'furiganaMode', 'wordColorStates', 'showPitchAccent', 'showLookupPillFrequency', 'suppressRedundantWordUi', 'sheetCloseButtonOnLeft',
    'audioEnabled', 'autoPlayAudio', 'suppressAutoAudioOnVideo', 'audioAutoPlayMode', 'audioEnableDefaultSources', 'audioFallbackChimeEnabled',
    'audioSelectionMode', 'audioTtsMode', 'audioTimeoutMs', 'immersionKitEnabled', 'immersionKitExampleSource',
    'nadeshikoApiKey', 'immersionKitShowTranslation', 'immersionKitRevealTranslationOnClick', 'immersionKitShowImages', 'immersionKitAutoPlayAudio',
    'immersionKitPlayOnHover', 'immersionKitPlayOnImageClick', 'immersionKitCategory', 'immersionKitSort', 'immersionKitLimit',
    'immersionKitMinLength', 'immersionKitMaxLength', 'immersionKitPlaybackRate', 'immersionKitExactMatch', 'ocrInteractionMode',
    'ocrShowTextOverlay', 'ocrVideoPauseFrames', 'ocrInvertDarkPanels', 'ocrProvider', 'ocrOverlayTheme', 'ocrMaxImagesPerPage', 'ocrMinImageArea',
    'ocrMaxImagePixels', 'ocrTextColor', 'ocrOutlineColor', 'ocrBackgroundColor', 'ocrBackgroundOpacity',
    'ocrFontScale', 'ocrEndpointUrl', 'ocrEngine', 'subtitlePlayerEnabled', 'subtitleAutoDetect',
    'subtitleOverlayVisible', 'subtitleSecondaryVisible', 'subtitleNativeBlurred', 'subtitleKaraokeMode', 'subtitleTranscriptVisible',
    'subtitlePausePanel', 'subtitleTranscriptPlacement', 'subtitleTranscriptAutoScroll', 'subtitleTranscriptAutoScrollResumeSeconds', 'subtitleAutoCopyLine', 'subtitleCopyIncludeTranslation', 'subtitleMiningPause',
    'subtitleHoverPause', 'subtitleControlsMode', 'subtitleFontSize', 'subtitleBottomOffset', 'subtitleTextColor', 'subtitleOutlineColor',
    'subtitleBackgroundColor', 'subtitleBackgroundOpacity', 'subtitleFontFamily', 'subtitleFontWeight', 'subtitleSeekPadding',
    'ankiEnabled', 'ankiMineWithJpdb', 'ankiCaptureScreenshot', 'ankiConnectUrl', 'ankiDeck',
    'ankiModel', 'ankiTemplateMode', 'ankiFrontReading', 'ankiFrontSentence', 'ankiFrontImage',
    'ankiTags', 'youtubeImmersionEnabled', 'preferJapaneseSiteLanguage', 'youtubeShowChannelRecommendations', 'youtubeShowFilterNotice',
    'hoverOpenDelayMs', 'hoverCloseDelayMs',
] as const satisfies readonly SettingsTextKey[];

const SETTINGS_CONTROL_LABEL_ALIASES = [
    ['twoButtonReviews', 'reviewRatingScale'],
    ['interfaceLanguage', 'settingsLanguage'],
    ['ocrCloudVisionApiKey', 'cloudVisionApiKey'],
    ['ankiMobileHandoff', 'mobileAnkiHandoff'],
    ['shortcuts.hoverLookup', 'holdWhileHovering'],
    ['shortcuts.scanPage', 'scanPage'],
    ['shortcuts.openSettings', 'openSettings'],
    ['shortcuts.playAudio', 'playAudio'],
    ['shortcuts.closePopup', 'closePopup'],
    ['shortcuts.previousLookupWord', 'previousLookupWord'],
    ['shortcuts.nextLookupWord', 'nextLookupWord'],
    ['shortcuts.previousSubtitle', 'previousSubtitle'],
    ['shortcuts.nextSubtitle', 'nextSubtitle'],
    ['shortcuts.copySubtitle', 'copySubtitle'],
    ['shortcuts.toggleOcr', 'toggleImageReading'],
    ['shortcuts.toggleSubtitleOverlay', 'toggleSubtitleOverlay'],
    ['shortcuts.toggleYoutubeImmersion', 'toggleYoutubeImmersion'],
    ['shortcuts.scanImages', 'readImagesNow'],
    ['shortcuts.massReviewVisible', 'massReviewVisible'],
    ['shortcuts.studyReveal', 'studyReveal'],
    ['shortcuts.studyRevealAlternate', 'studyRevealAlternate'],
    ['shortcuts.studyUndo', 'studyUndo'],
    ['shortcuts.studyPrevious', 'studyPrevious'],
    ['shortcuts.studyPreviousAlternate', 'studyPreviousAlternate'],
    ['shortcuts.studyNext', 'studyNext'],
    ['shortcuts.studyNextAlternate', 'studyNextAlternate'],
    ['shortcuts.gradeNothing', 'gradeNothing'],
    ['shortcuts.gradeSomething', 'gradeSomething'],
    ['shortcuts.gradeHard', 'gradeHard'],
    ['shortcuts.gradeOkay', 'gradeOkay'],
    ['shortcuts.gradeEasy', 'gradeEasy'],
    ['shortcuts.gradeFail', 'gradeFail'],
    ['shortcuts.gradePass', 'gradePass'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];

const SETTINGS_CONTROL_LABELS: readonly (readonly [string, SettingsTextKey])[] = [
    ...DIRECT_SETTINGS_CONTROL_LABEL_KEYS.map(key => [key, key] as const),
    ...SETTINGS_CONTROL_LABEL_ALIASES,
];

type NamedFormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// A localize pass re-labels ~200 named controls across a ~500-control form.
// Reading `form.elements` per lookup is O(n) in jsdom (and re-resolves the live
// collection in browsers), making the whole pass quadratic. Snapshot the
// controls by name once for the duration of the synchronous pass; localization
// only re-texts existing labels and never adds or removes named controls, so the
// snapshot stays valid. Outside an active pass, callers fall back to a single
// query, which is still far cheaper than repeatedly walking `form.elements`.
// Both paths enumerate form descendants only, which matches renderSettingsForm
// (every control lives inside the form). If the form ever gains a control bound
// via a `form=""` attribute outside its subtree, revisit this: `form.elements`
// would include it but `querySelectorAll` will not.
let activeNamedControls: { form: HTMLFormElement; byName: Map<string, NamedFormControl[]> } | null = null;

function withNamedControlIndex<T>(form: HTMLFormElement, run: () => T): T {
    const previous = activeNamedControls;
    activeNamedControls = { form, byName: indexNamedControls(form) };
    try {
        return run();
    } finally {
        activeNamedControls = previous;
    }
}

function indexNamedControls(form: HTMLFormElement): Map<string, NamedFormControl[]> {
    const byName = new Map<string, NamedFormControl[]>();
    form.querySelectorAll<NamedFormControl>('input, select, textarea').forEach(control => {
        const existing = byName.get(control.name);
        if (existing) existing.push(control);
        else byName.set(control.name, [control]);
    });
    return byName;
}

function namedFormControls(form: HTMLFormElement, name: string): NamedFormControl[] {
    if (activeNamedControls?.form === form) return activeNamedControls.byName.get(name) ?? [];
    return Array.from(form.querySelectorAll<NamedFormControl>('input, select, textarea')).filter(control => control.name === name);
}

function getNamedControl<T extends NamedFormControl>(form: HTMLFormElement, name: string): T | null {
    const item = form.elements.namedItem(name);
    if (item instanceof HTMLInputElement || item instanceof HTMLSelectElement || item instanceof HTMLTextAreaElement) {
        return item as T;
    }
    if (item instanceof RadioNodeList) {
        return namedFormControls(form, name).find((element): element is T => element instanceof HTMLInputElement) ?? null;
    }
    return null;
}

function setControlLabel(form: HTMLFormElement, name: string, label: string): void {
    const controls = namedFormControls(form, name);
    controls.forEach(control => {
        const labelElement = control.closest('label');
        if (!labelElement) return;
        if (labelElement.classList.contains('inline')) setInlineLabelText(labelElement, label);
        else setBlockLabelText(labelElement, label);
    });
}

function setBlockLabelText(label: Element, text: string): void {
    const container = directSettingsLabelTextContainer(label);
    if (container) {
        setLeadingText(container, text);
        return;
    }
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.insertBefore(document.createTextNode(text), label.firstChild);
}

function setInlineLabelText(label: Element, text: string): void {
    const container = directSettingsLabelTextContainer(label);
    if (container) {
        container.replaceChildren(text);
        return;
    }
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
}

function directSettingsLabelTextContainer(label: Element): HTMLElement | null {
    return Array.from(label.children).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains(SETTINGS_LABEL_TEXT_CLASS),
    ) ?? null;
}

function setLeadingText(container: HTMLElement, text: string): void {
    const textNode = Array.from(container.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else container.insertBefore(document.createTextNode(text), container.firstChild);
}

function normalizeSettingsLabelTextContainers(form: HTMLFormElement): void {
    form.querySelectorAll<HTMLLabelElement>('label').forEach(normalizeSettingsLabelTextContainer);
}

function normalizeSettingsLabelTextContainer(label: HTMLLabelElement): void {
    let pending: ChildNode[] = [];
    const flush = () => {
        if (!pending.length) return;
        const wrapper = document.createElement('span');
        wrapper.className = SETTINGS_LABEL_TEXT_CLASS;
        label.insertBefore(wrapper, pending[0]);
        pending.forEach(node => wrapper.append(node));
        pending = [];
    };

    for (const node of Array.from(label.childNodes)) {
        if (isWrappableSettingsLabelNode(node)) {
            pending.push(node);
            continue;
        }
        flush();
    }
    flush();
}

function isWrappableSettingsLabelNode(node: ChildNode): boolean {
    if (node.nodeType === Node.TEXT_NODE) return Boolean((node.textContent ?? '').trim());
    return node instanceof HTMLAnchorElement;
}

function setRadioLabel(form: HTMLFormElement, name: string, value: string, label: string): void {
    const radio = namedFormControls(form, name).find((element): element is HTMLInputElement =>
        element instanceof HTMLInputElement && element.type === 'radio' && element.value === value,
    );
    const labelElement = radio?.closest('label');
    if (labelElement) setInlineLabelText(labelElement, label);
}

function setSelectOptionLabels(form: HTMLFormElement, name: string, options: Array<[string, string]>): void {
    const selectElement = namedFormControls(form, name).find((element): element is HTMLSelectElement =>
        element instanceof HTMLSelectElement,
    ) ?? null;
    if (!selectElement) return;
    options.forEach(([value, label]) => {
        const option = Array.from(selectElement.options).find(item => item.value === value);
        if (option) option.textContent = label;
    });
}

function removeSettingsSelectOptionMeta(form: HTMLFormElement): void {
    form.querySelectorAll('[data-settings-select-options-meta]').forEach(meta => meta.remove());
}

function setShortcutPlaceholder(form: HTMLFormElement, name: string, placeholder: string): void {
    form.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputElement => {
        if (inputElement.name === name) inputElement.placeholder = placeholder;
    });
}

function getSettingsPanelFieldsets(form: HTMLFormElement): HTMLFieldSetElement[] {
    return Array.from(form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-settings-panel]'));
}

function directFieldsetLegend(fieldset: HTMLFieldSetElement | undefined): HTMLLegendElement | null {
    return Array.from(fieldset?.children ?? []).find((child): child is HTMLLegendElement =>
        child instanceof HTMLLegendElement,
    ) ?? null;
}

function localizeHelpLinksPanel(form: HTMLFormElement, language: InterfaceLanguage): void {
    const panel = form.querySelector<HTMLElement>('.jpdb-reader-help-links-card');
    if (!panel) return;
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    HELP_LINK_PANEL_TEXT_KEYS.forEach(([selector, key]) => {
        const element = panel.querySelector<HTMLElement>(selector);
        if (!element) return;
        if (key === 'currentYomuVersion') {
            element.replaceChildren(text(key), ' ', renderCurrentVersionElement());
            return;
        }
        element.replaceChildren(text(key));
    });
    HELP_LINK_BUTTON_TEXT_KEYS.forEach(([link, key]) => {
        setExternalButtonLabel(panel.querySelector<HTMLElement>(`[data-help-link="${link}"]`), text(key));
    });
    const status = panel.querySelector<HTMLElement>('[data-yomu-update-status]');
    if (status && !status.dataset.updateChecked) {
        status.textContent = formatUiText(language, 'updateStatusIdle', { current: CURRENT_YOMU_VERSION });
    }
    const duplicateStatus = panel.querySelector<HTMLElement>('[data-yomu-duplicate-status]');
    if (duplicateStatus) duplicateStatus.textContent = duplicateRuntimeStatusText(language);
}

function renderCurrentVersionElement(): HTMLElement {
    const element = document.createElement('span');
    element.dataset.yomuCurrentVersion = '';
    element.textContent = CURRENT_YOMU_VERSION;
    return element;
}

function duplicateRuntimeStatusText(language: InterfaceLanguage): string {
    const kind = currentYomuRuntimeKind();
    return kind
        ? formatUiText(language, 'duplicateStatusSingle', { kind })
        : uiText(language, 'duplicateStatusUnknown');
}

function currentYomuRuntimeKind(): string {
    if (typeof document === 'undefined') return '';
    const marker = document.getElementById('jpdb-reader-runtime-owner') as HTMLElement | null;
    return marker?.dataset.yomuRuntimeKind || '';
}

function externalButtonLabel(label: string): string {
    return `<span>${escapeHtml(label)}</span>${externalLinkIcon()}`;
}

function setExternalButtonLabel(element: HTMLElement | null | undefined, label: string): void {
    if (!element) return;
    setInnerHtml(element, externalButtonLabel(label));
}

function renderReviewShortcutInputs(settings: ReaderSettings): string {
    const fivePointHidden = !settings.enableReviews || settings.twoButtonReviews;
    const passFailHidden = !settings.enableReviews || !settings.twoButtonReviews;
    return `
        <div class="jpdb-reader-shortcut-group" data-review-scale="five" ${fivePointHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeNothing', 'Grade NOTHING', settings.shortcuts.gradeNothing)}
            ${shortcutInput('shortcuts.gradeSomething', 'Grade SOMETHING', settings.shortcuts.gradeSomething)}
            ${shortcutInput('shortcuts.gradeHard', 'Grade HARD', settings.shortcuts.gradeHard)}
            ${shortcutInput('shortcuts.gradeOkay', 'Grade OKAY', settings.shortcuts.gradeOkay)}
            ${shortcutInput('shortcuts.gradeEasy', 'Grade EASY', settings.shortcuts.gradeEasy)}
        </div>
        <div class="jpdb-reader-shortcut-group" data-review-scale="pass-fail" ${passFailHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeFail', 'Pass/fail: FAIL', settings.shortcuts.gradeFail)}
            ${shortcutInput('shortcuts.gradePass', 'Pass/fail: PASS', settings.shortcuts.gradePass)}
        </div>
    `;
}

export function activateSettingsPanel(form: HTMLFormElement, panel: string): void {
    const normalizedPanel = normalizeSettingsPanel(panel);
    const search = form.querySelector<HTMLInputElement>('[data-settings-search]');
    if (search?.value.trim()) {
        search.value = '';
        applySettingsSearch(form, '');
    }
    applySettingsPanelState(form, normalizedPanel);
}

export function applySettingsSearch(form: HTMLFormElement, query: string): void {
    const searchInput = form.querySelector<HTMLInputElement>('[data-settings-search]');
    const empty = form.querySelector<HTMLElement>('[data-settings-search-empty]');
    const normalizedQuery = normalizeSettingsSearchText(query);
    if (searchInput && searchInput.value !== query) searchInput.value = query;
    form.dataset.settingsSearching = normalizedQuery ? 'true' : 'false';

    if (!normalizedQuery) {
        if (empty) empty.hidden = true;
        activateSettingsPanelWithoutClearingSearch(form, activeSettingsPanel(form));
        return;
    }

    let visibleCount = 0;
    getSettingsPanelFieldsets(form).forEach(fieldset => {
        const matches = normalizeSettingsSearchText(fieldset.textContent ?? '').includes(normalizedQuery);
        fieldset.hidden = !matches;
        if (matches) visibleCount += 1;
    });
    if (empty) empty.hidden = visibleCount > 0;
}

function activateSettingsPanelWithoutClearingSearch(form: HTMLFormElement, panel: string): void {
    applySettingsPanelState(form, normalizeSettingsPanel(panel));
}

function applySettingsPanelState(form: HTMLFormElement, normalizedPanel: string): void {
    form.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(section => {
        section.hidden = section.dataset.settingsPanel !== normalizedPanel;
    });
    form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]').forEach(button => {
        const active = button.dataset.panel === normalizedPanel;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
}

function activeSettingsPanel(form: HTMLFormElement): string {
    return form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][aria-selected="true"]')?.dataset.panel ?? DEFAULT_SETTINGS_PANEL;
}

function normalizeSettingsPanel(panel: string): string {
    if (panel === 'basics' || panel === 'jpdb') return 'api';
    if (panel === 'reading' || panel === 'reader') return 'appearance';
    if (panel === 'kanji') return 'dictionaries';
    return panel;
}

function normalizeSettingsSearchText(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function audioHelpHtml(language: InterfaceLanguage): string {
    const copy = uiText(language, 'audioHelp');
    const linkLabel = uiText(language, 'audioGuideLinkLabel');
    const [before, after = ''] = copy.split(linkLabel);
    return `${escapeHtml(before)}<a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">${escapeHtml(linkLabel)}</a>${escapeHtml(after)}`;
}

function ankiSetupHelpHtml(language: InterfaceLanguage): string {
    const copy = uiText(language, 'ankiHelp');
    const addOnLabel = language === 'ja' ? 'AnkiConnectアドオンを開く' : 'Open AnkiConnect add-on';
    const docsLabel = language === 'ja' ? 'モバイルAnki設定ドキュメント' : 'Mobile Anki setup docs';
    return `${escapeHtml(copy)} <a href="${ANKI_CONNECT_ADDON_URL}" target="_blank" rel="noopener">${externalButtonLabel(addOnLabel)}</a> <a href="${MOBILE_ANKI_SETUP_DOCS_URL}" target="_blank" rel="noopener">${externalButtonLabel(docsLabel)}</a>`;
}

export function installShortcutCapture(root: HTMLElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        inputEl.addEventListener('keydown', event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Backspace' || event.key === 'Delete') {
                inputEl.value = '';
                syncDuplicateShortcutInputs(root, inputEl);
                return;
            }
            inputEl.value = formatShortcutEvent(event);
            syncDuplicateShortcutInputs(root, inputEl);
        });
        inputEl.addEventListener('input', () => syncDuplicateShortcutInputs(root, inputEl));
        inputEl.addEventListener('paste', event => event.preventDefault());
    });
}

function syncDuplicateShortcutInputs(root: HTMLElement, source: HTMLInputElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        if (inputEl !== source && inputEl.name === source.name) inputEl.value = source.value;
    });
}

export function syncReviewSettingsVisibility(form: HTMLFormElement): void {
    const reviewsEnabled = form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.checked ?? true;
    const passFail = form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')?.value === 'true';
    form.querySelectorAll<HTMLElement>('[data-review-config]').forEach(node => { node.hidden = !reviewsEnabled; });
    form.querySelectorAll<HTMLElement>('[data-review-scale="five"]').forEach(node => { node.hidden = !reviewsEnabled || passFail; });
    form.querySelectorAll<HTMLElement>('[data-review-scale="pass-fail"]').forEach(node => { node.hidden = !reviewsEnabled || !passFail; });
}

export function syncJpdbMiningDependentSettings(form: HTMLFormElement): void {
    const jpdbDeckActionsEnabled = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')?.checked ?? true;
    for (const name of ['addToForq', 'ankiMineWithJpdb']) {
        const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
        if (!input) continue;
        input.disabled = !jpdbDeckActionsEnabled;
        if (!jpdbDeckActionsEnabled) input.checked = false;
    }
}

export function syncStickyBottomSheetAvailability(form: HTMLFormElement): void {
    const popupMode = form.querySelector<HTMLSelectElement>('select[name="popupMode"]')?.value;
    const unavailable = popupMode === 'popover';
    const input = form.querySelector<HTMLInputElement>('input[name="stickyBottomSheet"]');
    const field = input?.closest<HTMLElement>('[data-sticky-bottom-sheet-field]') ?? input?.closest<HTMLElement>('label');
    if (field) field.hidden = unavailable;
    if (!input) return;
    input.disabled = unavailable;
    if (unavailable) input.checked = false;
}

export function syncPageScanModeControls(form: HTMLFormElement): void {
    const mode = form.querySelector<HTMLInputElement>('input[name="pageScanMode"]:checked')?.value ?? 'auto';
    form.querySelectorAll<HTMLElement>('[data-page-scan-manual-shortcut]').forEach(node => {
        node.hidden = mode !== 'manual';
    });
}

export function syncFontFamilyControls(form: HTMLFormElement): void {
    form.querySelectorAll<HTMLElement>('[data-font-family-control]').forEach(control => {
        const selectElement = control.querySelector<HTMLSelectElement>('select');
        const customField = control.querySelector<HTMLElement>('[data-font-family-custom]');
        if (customField) customField.hidden = selectElement?.value !== CUSTOM_FONT_FAMILY_VALUE;
    });
}

export function syncSubtitlePreview(form: HTMLFormElement): void {
    const preview = form.querySelector<HTMLElement>('[data-subtitle-preview]');
    if (!preview) return;
    const value = (name: string, fallback: string) => getNamedControl<HTMLInputElement>(form, name)?.value || fallback;
    const numberValue = (name: string, fallback: number) => {
        const number = Number(value(name, String(fallback)));
        return Number.isFinite(number) ? number : fallback;
    };
    preview.style.setProperty('--subtitle-font-size', `${Math.max(16, Math.min(64, numberValue('subtitleFontSize', 28)))}px`);
    preview.style.setProperty('--subtitle-color', sanitizeAccentColor(value('subtitleTextColor', DEFAULT_OVERLAY_TEXT_COLOR), DEFAULT_OVERLAY_TEXT_COLOR));
    preview.style.setProperty('--subtitle-outline', sanitizeAccentColor(value('subtitleOutlineColor', DEFAULT_OVERLAY_OUTLINE_COLOR), DEFAULT_OVERLAY_OUTLINE_COLOR));
    preview.style.setProperty(
        '--subtitle-background-rgba',
        accentToRgba(
            sanitizeAccentColor(value('subtitleBackgroundColor', DEFAULT_OVERLAY_BACKGROUND_COLOR), DEFAULT_OVERLAY_BACKGROUND_COLOR),
            Math.max(0, Math.min(1, numberValue('subtitleBackgroundOpacity', 0))),
        ),
    );
    preview.style.setProperty('--subtitle-family', formFontFamilyValue(form, 'subtitleFontFamily', 'system-ui'));
    preview.style.setProperty('--subtitle-weight', String(Math.max(100, Math.min(900, numberValue('subtitleFontWeight', 760)))));
    syncSubtitlePreviewColorClasses(form, preview);
}

function formFontFamilyValue(form: HTMLFormElement, name: FontFamilySettingName, fallback: string): string {
    const value = getNamedControl<HTMLInputElement | HTMLSelectElement>(form, name)?.value.trim() ?? '';
    if (value === CUSTOM_FONT_FAMILY_VALUE) return getNamedControl<HTMLInputElement>(form, `${name}Custom`)?.value.trim() || fallback;
    return value || fallback;
}

function syncSubtitlePreviewColorClasses(form: HTMLFormElement, preview: HTMLElement): void {
    const value = (name: string, fallback: string) => getNamedControl<HTMLInputElement | HTMLSelectElement>(form, name)?.value || fallback;
    const classes = {
        highlight: readOption(value('subtitleHighlightColorSource', 'jpdb'), COLOR_SOURCE_VALUES, 'jpdb'),
        underline: readOption(value('subtitleUnderlineColorSource', 'pitch'), COLOR_SOURCE_VALUES, 'pitch'),
        text: readOption(value('subtitleTextColorSource', 'jpdb'), COLOR_SOURCE_VALUES, 'jpdb'),
    };
    (Object.keys(classes) as Array<keyof typeof classes>).forEach(channel => {
        COLOR_SOURCE_CLASS_VALUES.forEach(source => {
            preview.classList.toggle(`jpdb-reader-subtitle-${channel}-${source}`, classes[channel] === source);
        });
    });
}

export function renderDictionarySourceRows(settings: ReaderSettings): string {
    const rows = definitionSourceRows(settings);
    const showAlias = true;
    const visibleNames = new Set([
        ...rows.filter(row => row.removable).map(row => row.name),
    ]);
    const hiddenPreferences = settings.dictionaryPreferences.filter(preference => !visibleNames.has(preference.name));
    const hidden = hiddenPreferences.map(preference => {
        const index = settings.dictionaryPreferences.indexOf(preference);
        return `
            <input type="hidden" name="dictionaryPreferences.${index}.name" value="${escapeHtml(preference.name)}">
            <input type="hidden" name="dictionaryPreferences.${index}.alias" value="${escapeHtml(preference.alias)}">
            ${preference.enabled ? `<input type="hidden" name="dictionaryPreferences.${index}.enabled" value="on">` : ''}
            <input type="hidden" name="dictionaryPreferences.${index}.priority" value="${escapeHtml(String(preference.priority))}">
            <input type="hidden" name="dictionaryPreferences.${index}.type" value="${escapeHtml(preference.type ?? 'terms')}">
        `;
    }).join('');
    const metadataHelp = hiddenPreferences.length
        ? '<div class="jpdb-reader-help">Metadata dictionaries appear as badges or kanji data.</div>'
        : '';
    if (!rows.some(row => row.removable)) return `
        <div class="jpdb-reader-help">Import Yomitan dictionaries for local definitions.</div>
        ${renderSourceRowsList(rows, { sourceLabel: 'Definition source', countName: 'dictionaryPreferenceCount', countValue: settings.dictionaryPreferences.length, showAlias })}
        ${metadataHelp}
        ${hidden}
    `;
    return `${renderSourceRowsList(rows, { sourceLabel: 'Definition source', countName: 'dictionaryPreferenceCount', countValue: settings.dictionaryPreferences.length, showAlias })}${metadataHelp}${hidden}`;
}

export function renderKanjiSourceRows(settings: ReaderSettings): string {
    return renderSourceRowsList(kanjiSourceRows(settings), { sourceLabel: 'Kanji section', showAlias: true });
}

export function renderLookupPillsEditor(settings: ReaderSettings, installed: YomitanDictionaryInfo[] = installedDictionariesFromPreferences(settings.dictionaryPreferences)): string {
    return renderDictionaryLookupLinkEditor(settings.dictionaryLookupLinks, installedFrequencyDictionaryPreferences(settings, installed));
}

function installedFrequencyDictionaryPreferences(settings: ReaderSettings, installed: YomitanDictionaryInfo[]): DictionaryPreference[] {
    const installedFrequencyNames = new Set(installed.filter(dictionary => dictionary.type === 'frequency').map(dictionary => dictionary.title));
    return settings.dictionaryPreferences.filter(preference => preference.type === 'frequency' && installedFrequencyNames.has(preference.name));
}

export function renderRecommendedDictionaries(installed: YomitanDictionaryInfo[]): string {
    const groups: Array<[RecommendedDictionary['category'], string]> = [
        ['terms', 'Term dictionaries'],
        ['kanji', 'Kanji dictionaries'],
        ['pitch', 'Pitch dictionaries'],
        ['frequency', 'Frequency dictionaries'],
    ];

    return `
        <div class="jpdb-reader-recommended-title">Recommended dictionaries</div>
        <div class="jpdb-reader-help jpdb-reader-recommended-note" data-recommended-dictionary-help>${escapedUiText('en', 'dictionaryInstallQueueHelp')}</div>
        ${groups.map(([category, label]) => {
            const dictionaries = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => dictionary.category === category);
            if (!dictionaries.length) return '';
            return `
                <div class="jpdb-reader-recommended-group">
                    <div class="jpdb-reader-recommended-group-title">${escapeHtml(label)}</div>
                    ${dictionaries.map(dictionary => renderRecommendedDictionary(dictionary, installed)).join('')}
                </div>
            `;
        }).join('')}
    `;
}

function renderRecommendedDictionary(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): string {
    const alreadyInstalled = isRecommendedDictionaryInstalled(dictionary, installed);
    const action = dictionary.downloadUrl
        ? `<button class="jpdb-reader-btn" type="button" data-action="download-recommended-dictionary" data-dictionary-id="${escapeHtml(dictionary.id)}" data-installed="${alreadyInstalled}">
                ${alreadyInstalled ? 'Update' : 'Install'}
            </button>`
        : dictionary.helpUrl
            ? `<a class="jpdb-reader-btn" href="${escapeHtml(dictionary.helpUrl)}" target="_blank" rel="noopener" data-dictionary-id="${escapeHtml(dictionary.id)}" data-recommended-dictionary-guide>${externalButtonLabel('Guide')}</a>`
            : '';
    return `
        <div class="jpdb-reader-recommended-item">
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml(dictionary.name)}</span>
                </div>
                <div class="jpdb-reader-help">${escapedUiText('en', dictionary.descriptionKey)}</div>
                <div class="jpdb-reader-recommended-status" data-recommended-dictionary-status role="status" aria-live="polite" hidden></div>
            </div>
            ${action}
        </div>
    `;
}

function installedDictionariesFromPreferences(preferences: DictionaryPreference[]): YomitanDictionaryInfo[] {
    return preferences.map(preference => ({
        title: preference.name,
        alias: preference.alias,
        enabled: preference.enabled,
        priority: preference.priority,
        type: preference.type,
    }));
}

function isRecommendedDictionaryInstalled(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): boolean {
    return installed.some(item => recommendedDictionaryMatchesInstalled(dictionary, item));
}

function recommendedDictionaryMatchesInstalled(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo): boolean {
    if (dictionary.downloadUrl && installed.downloadUrl === dictionary.downloadUrl) return true;
    const tokenSets = recommendedDictionaryMatchTokenSets(dictionary);
    return [installed.title, installed.alias]
        .map(dictionaryTitleTokens)
        .some(tokens => tokenSets.some(required => required.every(token => tokens.has(token))));
}

const RECOMMENDED_DICTIONARY_MATCH_TOKENS: Record<string, string[][]> = {
    jitendex: [['jitendex']],
    jmdict: [['jmdict']],
    jmnedict: [['jmnedict']],
    'wty-ja-ja': [['wty', 'ja']],
    'pixiv-light': [['pixiv', 'light']],
    kanjidic: [['kanjidic']],
    'jpdb-kanji': [['jpdb', 'kanji']],
    'kanjium-pitch': [['kanjium', 'pitch'], ['kanjium'], ['pitch', 'accents']],
    jiten: [['jiten']],
    'jpdbv2-kana': [['jpdb', 'v2'], ['jpdbv2']],
    bccwj: [['bccwj']],
};

function recommendedDictionaryMatchTokenSets(dictionary: RecommendedDictionary): string[][] {
    return RECOMMENDED_DICTIONARY_MATCH_TOKENS[dictionary.id] ?? [Array.from(dictionaryTitleTokens(dictionary.name))];
}

function dictionaryTitleTokens(value: string): Set<string> {
    return new Set(value.toLowerCase().match(/[a-z0-9]+|[ぁ-んァ-ン一-龯]+/g) ?? []);
}
