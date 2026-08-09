import {
    HIDE_STATE_GROUP_CONTROL_LABELS,
    renderWordColorHiddenStateGroupControls,
} from './hide-state-groups';
import { ANKI_CONNECT_ADDON_URL, BUNPRO_DEFINITION_SOURCE_ID, DISCORD_INVITE_URL, DOCS_BASE_URL, DONATE_URL, GITHUB_REPOSITORY_URL, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, NADESHIKO_DEVELOPER_URL, NEW_TAB_PAGE_URL, PDF_READER_PAGE_URL, SUPPORT_COPY, SUPPORT_COPY_EXTRA, VIDEO_PLAYER_PAGE_URL, WANIKANI_DEFINITION_SOURCE_ID } from '../app/constants';
import { escapeHtml, setInnerHtml, unwrapReaderWords } from '../dom/index';
import { audioSourceLabel, formatUiText, resolveUiLanguage, uiText } from '../app/i18n';
import { CURRENT_YOMU_VERSION } from '../app/version';
import { detectYomuUpdateFlow, updateFlowNoteKey } from '../app/userscript-update';
import { externalLinkIcon } from '../ui/icons';
import { AUDIO_GUIDE_URL, formatShortcutEvent, hasStatusColorSource, isPopupLookupEnabled, sanitizeAccentColor } from './index';
import { SETTINGS_LABEL_TEXT_CLASS, checkbox, input, radioGroup, select, settingsTabButton, shortcutInput } from './form-controls';
import { audioUrlPlaceholderKey, isAudioSourceTypeValue, renderAudioSourceEditor, renderDictionaryLookupLinkEditor } from './form-editors';
import { combinedApiCredentialLabel, effectiveJitenApiKey, effectiveJpdbApiKey, hasJpdbApiCredential, mergeApiCredentialValues } from './api-credential';
import { CUSTOM_FONT_FAMILY_VALUE, settingsColorSourceValue } from './form-read';
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
    renderWanikaniStatusLine,
} from './status-lines';
import { uniqueStrings } from '../core/string-utils';
import type { DictionaryPreference, ImmersionExampleSource, InterfaceLanguage, NewTabStudyChallengeStep, ReaderSettings } from '../app/types';
import { WANIKANI_TOKEN_SETTINGS_URL } from '../wanikani/wanikani';
import { RECOMMENDED_JAPANESE_DICTIONARIES, catalogBrowseLanguageSectionsForLearnerLanguage, findRecommendedDictionary, recommendedDictionariesForLanguageProfile, type RecommendedDictionary, type RecommendedDictionaryCategory } from '../dictionaries/recommended';
import { catalogBrowseDescription, catalogBrowseSectionGroups, catalogBrowseTotalBytes, formatDictionaryBytes, headwordLanguageEndonym, headwordLanguageName, type CatalogBrowseLanguageSection } from '../dictionaries/catalog-browse';
import { catalogBrowseCopy, catalogBrowseLanguageNote, type CatalogBrowseCopy } from '../dictionaries/catalog-browse-copy';
import { applyCatalogBrowseFilter, normalizeSearchQuery } from './catalog-browse-filter';
import { FROZEN_DICTIONARY_CATALOG, type DictionaryCategory } from '../dictionaries/catalog';
import { definitionSourceRows, kanjiSourceRows } from '../sources/sections';
import type { YomitanDictionaryInfo } from '../dictionaries/yomitan';
import { settingsText, type SettingsText } from './settings-text';
import { renderYoutubeSettingsPanel } from './youtube-panel';
import {
    activeLanguageProfile,
    learningTargetRosterIdForTag,
    slice1LanguageIdForTag,
    type LearningTargetRosterId,
} from '../languages';
import {
    INTERFACE_LOCALES,
    LEARNER_LANGUAGES,
    LOCALE_CATALOGS,
    isolate,
    learnerLanguageById,
    resolveMessage,
    setupMessageIdFor,
    setupPackFor,
    type InterfaceLocale,
    type LearnerLanguageId,
} from '../locales';
import { dictionaryDefinitionLanguage } from '../dictionaries/definition-language';
import { googleTranslationLanguageCapability } from '../translation/google';
import { STUDY_TARGET_READINESS_ATTRIBUTE, studyTargetOptions } from '../app/study-target-picker';
import { nativeSubtitleDisplayMode, type NativeSubtitleDisplayMode } from '../subtitles/native-subtitle-display';
import { renderLocalDictionaryStorageControls } from './local-dictionary-storage-form';
import { renderReadingAnnotationControls, syncReadingAnnotationControls } from './reading-annotation-controls';

export { lookupLinkRows, readDictionaryLookupLinks, readFormSettings } from './form-read';
export { syncSubtitlePreview } from './subtitle-preview';
export { lookupPillEditorRows, mergeAudioSubSources, renderAudioSourceEditor, renderAudioSubSourceList, renderDictionaryLookupLinkEditor, syncAudioSourceRow, syncBrowserTtsVoiceOptions, updateAudioSourceEditor, updateDictionaryLookupLinkEditor } from './form-editors';
export { installSourceRowDrag, updateSourceRowEditor } from './form-order';
export { renderAnkiDeckLibraryOptions, renderAnkiFieldMappingEditor, renderAnkiLibraryOptions, renderAnkiTemplatePreview, renderDeckControls } from './anki-mining-panel';
export { ankiStatusLineForSettings, bunproStatusLineForSettings, formatSettingsStatusLine, jpdbStatusLineForSettings, renderAnkiStatusHtml, wanikaniStatusLineForSettings } from './status-lines';
export type { AnkiAdapterState, SettingsStatusAction, SettingsStatusDetail, SettingsStatusLine } from './status-lines';

const DEFAULT_JITEN_SETTINGS_URL = 'https://jiten.moe/settings';
const DEFAULT_BUNPRO_SETTINGS_URL = 'https://bunpro.jp/settings/api';
const ACADEMY_ACCOUNT_SYNC_URL = 'https://yomureader.com/academy/?view=profile-sync';
const PROXY_WORKER_SOURCE_URL = `${GITHUB_REPOSITORY_URL}/blob/main/workers/jpdb-public-proxy/src/index.ts`;
const PROXY_WORKER_README_URL = `${GITHUB_REPOSITORY_URL}/tree/main/workers/jpdb-public-proxy`;
type FontFamilySettingName = 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily';
type StringReaderSettingName = {
    [K in keyof ReaderSettings & string]: ReaderSettings[K] extends string ? K : never;
}[keyof ReaderSettings & string];
type ColorInputField = readonly [StringReaderSettingName, SettingsTextKey];
type PageScanMode = 'off' | 'auto' | 'manual';
type SettingsOptionTable<V extends string = string> = readonly (readonly [V, SettingsTextKey])[];

// Turn a value→i18n-key option table into localized [value, label] pairs. Shared
// by renderSettingsForm (first paint) and localizeSettingsForm (language switch).
function localizedOptions<V extends string>(text: SettingsText, table: SettingsOptionTable<V>): [V, string][] {
    return table.map(([value, key]) => [value, text(key)]);
}

type MultilingualSettingsCopy = {
    languageProfileTitle: string;
    learnerLanguage: string;
    targetLanguage: string;
    languageProfileHelp: string;
    translationTitle: string;
    translationHelp: string;
    translationEmpty: string;
    translationUnavailable: string;
    translateAutomatically: (language: string) => string;
};

const DEFINITION_TRANSLATION_API_SOURCE_IDS = new Set<string>([JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, BUNPRO_DEFINITION_SOURCE_ID, WANIKANI_DEFINITION_SOURCE_ID]);

const CATALOG_DEFINITION_LANGUAGES = new Map<string, readonly string[]>(FROZEN_DICTIONARY_CATALOG.entries.flatMap((entry) => [[normalizeDictionaryIdentity(entry.id), entry.definitionLanguages] as const, [normalizeDictionaryIdentity(entry.title), entry.definitionLanguages] as const]));

function multilingualSettingsCopy(language: InterfaceLanguage): MultilingualSettingsCopy {
    return language === 'ja'
        ? {
              languageProfileTitle: '言語プロフィール',
              learnerLanguage: '定義・翻訳の言語（出力）',
              targetLanguage: '学習する言語（対象）',
              languageProfileHelp: '対象はページで読む言語、出力は辞書の定義と翻訳の言語です。画面の表示言語は別に選べます。',
              translationTitle: '定義の自動翻訳',
              translationHelp: '有効にすると、選んだ情報源の定義テキストだけが Google 翻訳に送信されます。元の定義も保持されます。',
              translationEmpty: '現在の情報源はすでにあなたの言語で定義されています。',
              translationUnavailable: 'Google 翻訳は古代ギリシャ語への自動翻訳に対応していません。元の定義と古代ギリシャ語の辞書は引き続き利用できます。',
              translateAutomatically: (learnerLanguage) => `${learnerLanguage}へ自動翻訳`,
          }
        : {
              languageProfileTitle: 'Language profile',
              learnerLanguage: 'Definition and translation language (output)',
              targetLanguage: 'Language you are reading (target)',
              languageProfileHelp: 'Target controls page text and lookup. Output controls definitions and translations. Interface controls Yomu labels.',
              translationTitle: 'Automatic definition translation',
              translationHelp: 'When enabled, only definition text from the sources you select is sent to Google Translate. The original definition remains available.',
              translationEmpty: 'Your current definition sources already use your language.',
              translationUnavailable: 'Google Translate does not support automatic translation into Ancient Greek. Original definitions and Ancient Greek dictionaries remain available.',
              translateAutomatically: (learnerLanguage) => `Translate automatically into ${learnerLanguage}`,
          };
}

export function activeLearnerLanguageId(settings: ReaderSettings): LearnerLanguageId {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    return slice1LanguageIdForTag(profile?.outputLanguage) ?? 'en';
}

export function activeTargetLanguageId(settings: ReaderSettings): LearningTargetRosterId {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    return learningTargetRosterIdForTag(profile?.targetLanguage) ?? 'ja';
}

function languageOptionLabel(language: { nativeName: string; englishName: string }): string {
    return language.nativeName === language.englishName ? language.nativeName : `${language.nativeName} — ${language.englishName}`;
}

function renderLanguageOptions(
    languages: readonly { id: string; runtimeLocale: string; direction: string; nativeName: string; englishName: string }[],
    selected: string,
): string {
    return languages.map(item => `
        <option value="${escapeHtml(item.id)}" lang="${escapeHtml(item.runtimeLocale)}" dir="${item.direction}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(languageOptionLabel(item))}</option>
    `).join('');
}

function renderStudyTargetOptions(
    language: InterfaceLanguage,
    selected: LearningTargetRosterId,
): string {
    return studyTargetOptions(language).map(item => `
        <option value="${escapeHtml(item.id)}" lang="${escapeHtml(item.runtimeLocale)}" dir="${item.direction}" title="${escapeHtml(item.reason)}" ${STUDY_TARGET_READINESS_ATTRIBUTE}="${item.readiness}" ${item.disabled ? 'disabled aria-disabled="true"' : ''} ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>
    `).join('');
}

const INTERFACE_LOCALE_BLOCKED_ATTRIBUTE = 'data-interface-locale-blocked';

/**
 * D43 — the interface-language picker over the full 33-locale manifest.
 *
 * The rule this control exists to enforce: a locale Yomu is not ready to speak
 * is shown, named, and DISABLED with the reason. It is never selectable and then
 * silently answered in English, which is the failure the ticket forbids and the
 * one a learner cannot distinguish from a bug.
 *
 * Three localisations meet here, on purpose:
 *
 *  - the option label is the locale's own `nativeName — englishName`, so it is
 *    findable by someone who does not read the current interface language;
 *  - the reason on the option is in the CURRENT interface language, because that
 *    is the language the person operating the dialog is reading;
 *  - the `title` carries the same reason in the BLOCKED locale's own language,
 *    from its `setup.*` catalogue, for the person who came looking for it.
 */
function renderInterfaceLocaleSelect(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const label = uiText(language, 'settingsLanguage');
    const ready = INTERFACE_LOCALES.filter(locale => locale.available);
    const blocked = INTERFACE_LOCALES.filter(locale => !locale.available);
    const automatic = `<option value="auto" ${settings.interfaceLanguage === 'auto' ? 'selected' : ''}>${escapeHtml(uiText(language, 'automatic'))}</option>`;
    const readyOptions = ready.map(locale => `
                            <option value="${escapeHtml(locale.tag)}" lang="${escapeHtml(locale.tag)}" dir="${locale.direction}" ${settings.interfaceLanguage === locale.tag ? 'selected' : ''}>${escapeHtml(interfaceLocaleOptionLabel(locale))}</option>`).join('');
    const blockedOptions = blocked.map(locale => renderBlockedInterfaceLocaleOption(locale, language)).join('');
    return `<label>${escapeHtml(label)}<select name="interfaceLanguage">
                            <optgroup label="${escapeHtml(uiText(language, 'interfaceLocalesReady'))}" data-interface-locale-group="ready">${automatic}${readyOptions}
                            </optgroup>
                            <optgroup label="${escapeHtml(uiText(language, 'interfaceLocalesInProgress'))}" data-interface-locale-group="in-progress">${blockedOptions}
                            </optgroup>
                        </select></label>`;
}

function interfaceLocaleOptionLabel(locale: InterfaceLocale): string {
    // Each side is bidi-isolated. The option carries dir="rtl" for Arabic and
    // Farsi, so an unisolated "العربية — Arabic" reorders: the Latin half moves
    // and the whole label detaches to the right. FSI/PDI is the only isolation
    // available inside an <option>, which is the case direction.ts's isolate()
    // was written for.
    return locale.nativeName === locale.englishName
        ? isolate(locale.nativeName)
        : `${isolate(locale.nativeName)} — ${isolate(locale.englishName)}`;
}

function renderBlockedInterfaceLocaleOption(locale: InterfaceLocale, language: InterfaceLanguage): string {
    const reason = uiText(language, interfaceLocaleBlockerCopyKey(locale));
    const nativeReason = blockedReasonInLocale(locale);
    return `
                            <option value="${escapeHtml(locale.tag)}" lang="${escapeHtml(locale.tag)}" dir="${locale.direction}" disabled aria-disabled="true" title="${escapeHtml(nativeReason)}" ${INTERFACE_LOCALE_BLOCKED_ATTRIBUTE}="${escapeHtml(locale.blockers[0] ?? 'translation-incomplete')}">${escapeHtml(`${interfaceLocaleOptionLabel(locale)} · ${isolate(reason)}`)}</option>`;
}

function interfaceLocaleBlockerCopyKey(locale: InterfaceLocale): 'interfaceLocaleRtlPending' | 'interfaceLocaleTranslationPending' {
    // The ledger orders blockers most-specific-first, so Arabic and Farsi report
    // the RTL gate rather than the translation backlog they also have: the RTL
    // gate is the one that has to pass before the locale can be offered at all.
    return locale.blockers[0] === 'rtl-verification-pending'
        ? 'interfaceLocaleRtlPending'
        : 'interfaceLocaleTranslationPending';
}

/**
 * The blocker reason in the blocked locale's own words, resolved through the
 * unified fallback chain so a locale with no catalogue entry reads as English
 * instead of as a missing-key placeholder.
 */
function blockedReasonInLocale(locale: InterfaceLocale): string {
    const key = locale.blockers[0] === 'rtl-verification-pending'
        ? 'interfaceRtlVerificationPending'
        : 'interfaceTranslationPending';
    const packs: Record<string, ReturnType<typeof setupPackFor>> = { en: setupPackFor('en') };
    for (const tag of [locale.tag, ...locale.fallbacks]) packs[tag] ??= setupPackFor(tag);
    return resolveMessage(setupMessageIdFor(key), locale, packs).value;
}

function renderInterfaceLocaleAvailabilityNote(language: InterfaceLanguage): string {
    const ready = INTERFACE_LOCALES.filter(locale => locale.available).length;
    const count = formatUiText(language, 'interfaceLocaleReadyCount', {
        ready,
        total: INTERFACE_LOCALES.length,
    });
    return `<div class="jpdb-reader-help" data-interface-locale-note>${escapeHtml(count)} ${escapeHtml(uiText(language, 'interfaceLocaleBlockedNote'))}</div>`;
}

function renderLanguageProfileControls(settings: ReaderSettings): string {
    const copy = multilingualSettingsCopy(settings.interfaceLanguage);
    const learnerLanguage = activeLearnerLanguageId(settings);
    const targetLanguage = activeTargetLanguageId(settings);
    return `
                <div class="jpdb-reader-settings-subsection jpdb-reader-language-profile" data-language-profile-controls>
                    <div class="jpdb-reader-local-title" data-multilingual-copy="languageProfileTitle">${escapeHtml(copy.languageProfileTitle)}</div>
                    <div class="grid">
                        <label>
                            <span class="${SETTINGS_LABEL_TEXT_CLASS}" data-multilingual-copy="learnerLanguage">${escapeHtml(copy.learnerLanguage)}</span>
                            <select name="learnerLanguage" autocomplete="language">
                                ${renderLanguageOptions(LEARNER_LANGUAGES, learnerLanguage)}
                            </select>
                        </label>
                        <label>
                            <span class="${SETTINGS_LABEL_TEXT_CLASS}" data-multilingual-copy="targetLanguage">${escapeHtml(copy.targetLanguage)}</span>
                            <select name="targetLanguage" autocomplete="language">
                                ${renderStudyTargetOptions(settings.interfaceLanguage, targetLanguage)}
                            </select>
                        </label>
                        ${renderInterfaceLocaleSelect(settings)}
                    </div>
                    <div class="jpdb-reader-help" data-multilingual-copy="languageProfileHelp">${escapeHtml(copy.languageProfileHelp)}</div>
                    ${renderInterfaceLocaleAvailabilityNote(settings.interfaceLanguage)}
                    <div class="jpdb-reader-help jpdb-reader-target-dictionary-state" data-target-dictionary-state role="status" aria-live="polite" hidden></div>
                </div>
    `;
}

// Option lists whose labels mix i18n keys with brand literals or runtime values;
// kept as functions (not tables) so both render and localize build them alike.
function newTabSourceOptions(text: SettingsText): [ReaderSettings['newTabSource'], string][] {
    return [
        ['auto', text('newTabAuto')],
        ['yomu-local', text('newTabYomuLocal')],
        ['jpdb', text('newTabApiSrs')],
        ['bunpro', text('newTabBunpro')],
        ['wanikani', text('newTabWanikani')],
        ['anki', 'Anki'],
        ['dictionary', text('dictionaryFallback')],
    ];
}

function immersionKitExampleSourceOptions(text: SettingsText): [ImmersionExampleSource, string][] {
    return [
        ['immersion-kit', text('immersionKit')],
        ['nadeshiko', 'Nadeshiko'],
        ['combined', text('immersionKitAndNadeshiko')],
    ];
}

function ocrEngineOptions(text: SettingsText): [ReaderSettings['ocrEngine'], string][] {
    return [
        ['auto', text('automatic')],
        ['MangaOCR', text('ocrEngineMangaOcr')],
        ['PaddleOCR', 'PaddleOCR'],
        ['AppleVision', text('ocrEngineAppleVision')],
    ];
}

function colorSourceSelectOptions(text: SettingsText): Array<[string, string, string?]> {
    // These are saved policies, not a snapshot of the providers connected
    // today: `status` follows every study source, `jpdb` the primary deck
    // lane, and `anki` only Anki. Stable names stay truthful when a learner
    // connects another provider later and prevent duplicate labels (#40).
    return [
        ['status', text('colorSourceStatus')],
        ['jpdb', text('colorSourceJpdb')],
        ['anki', text('colorSourceAnki')],
        ['pitch', text('colorSourcePitch'), 'jp-only'],
        ['off', text('colorSourceNone')],
    ];
}
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
const NEW_TAB_STUDY_STEP_LABEL_KEYS: Record<NewTabStudyChallengeStep, SettingsTextKey> = {
    'kanji-doodle': 'newTabStudyStepKanji',
    word: 'newTabStudyStepWord',
    'recall-cloze': 'newTabStudyStepRecall',
    'listen-pitch': 'newTabStudyStepListen',
    speaking: 'newTabStudyStepSpeaking',
    'type-word': 'newTabStudyStepType',
};
const NEW_TAB_STUDY_STEP_HELP_KEYS: Record<NewTabStudyChallengeStep, SettingsTextKey> = {
    'kanji-doodle': 'newTabStudyStepKanjiHelp',
    word: 'newTabStudyStepWordHelp',
    'recall-cloze': 'newTabStudyStepRecallHelp',
    'listen-pitch': 'newTabStudyStepListenHelp',
    speaking: 'newTabStudyStepSpeakingHelp',
    'type-word': 'newTabStudyStepTypeHelp',
};
const DEFAULT_SETTINGS_PANEL = 'appearance';
const SETTINGS_TABS: readonly {
    panel: string;
    labelKey?: SettingsTextKey;
    active?: boolean;
}[] = [{ panel: 'appearance', active: true }, { panel: 'backup', labelKey: 'backupSync' }, { panel: 'api' }, { panel: 'dictionaries', labelKey: 'sources' }, { panel: 'media' }, { panel: 'mining' }, { panel: 'newTab' }, { panel: 'shortcuts' }, { panel: 'help' }];
// Each colour field's i18n key equals its control name, so a localize pass can
// re-label it from SETTINGS_CONTROL_LABELS while render sources the same key.
const WORD_COLOR_FIELDS = [
    ['wordColorNew', 'wordColorNew'],
    ['wordColorLearning', 'wordColorLearning'],
    ['wordColorKnown', 'wordColorKnown'],
    ['wordColorDue', 'wordColorDue'],
    ['wordColorFailed', 'wordColorFailed'],
    ['wordColorIgnored', 'wordColorIgnored'],
] as const satisfies readonly ColorInputField[];
const PITCH_COLOR_FIELDS = [
    ['pitchColorHeiban', 'pitchColorHeiban'],
    ['pitchColorAtamadaka', 'pitchColorAtamadaka'],
    ['pitchColorNakadaka', 'pitchColorNakadaka'],
    ['pitchColorOdaka', 'pitchColorOdaka'],
    ['pitchColorUnknown', 'pitchColorUnknown'],
] as const satisfies readonly ColorInputField[];
// No ocrBackgroundColor field: the highlight background is derived from the
// accent color on every normalize (accessibleOcrBackgroundColor), so a picker
// for it was a dead control whose pick was silently discarded.
const OCR_COLOR_FIELDS = [
    ['ocrTextColor', 'ocrTextColor'],
    ['ocrOutlineColor', 'ocrOutlineColor'],
] as const satisfies readonly ColorInputField[];
const SUBTITLE_COLOR_FIELDS = [
    ['subtitleTextColor', 'subtitleTextColor'],
    ['subtitleOutlineColor', 'subtitleOutlineColor'],
    ['subtitleBackgroundColor', 'subtitleBackgroundColor'],
] as const satisfies readonly ColorInputField[];
const COLOR_CHANNEL_FIELDS = [
    ['wordHighlightColorSource', 'wordHighlightColorSource'],
    ['wordUnderlineColorSource', 'wordUnderlineColorSource'],
    ['wordTextColorSource', 'wordTextColorSource'],
    ['subtitleHighlightColorSource', 'subtitleHighlightColorSource'],
    ['subtitleUnderlineColorSource', 'subtitleUnderlineColorSource'],
    ['subtitleTextColorSource', 'subtitleTextColorSource'],
] as const satisfies readonly [ColorSourceSettingName, SettingsTextKey][];

function escapedUiText(language: InterfaceLanguage, key: Parameters<typeof uiText>[1]): string {
    return escapeHtml(uiText(language, key));
}

export function renderHelpLinksPanel(language: InterfaceLanguage = 'en'): string {
    return `
        <div class="jpdb-reader-help-links-card">
            <div class="jpdb-reader-settings-subsection jpdb-reader-help-update-strip" data-help-update-strip>
                <div class="jpdb-reader-help-version-row">
                    <div class="jpdb-reader-help-version-copy">
                        <div class="jpdb-reader-local-title" data-help-update-title>Version</div>
                        <div class="jpdb-reader-help-version-current" data-help-update-current>Yomu <span data-yomu-current-version>${escapeHtml(CURRENT_YOMU_VERSION)}</span></div>
                    </div>
                    <a class="jpdb-reader-btn jpdb-reader-help-update-link" href="${escapeHtml(detectYomuUpdateFlow().url)}" target="_blank" rel="noopener" data-action="open-yomu-update" data-help-link="update-userscript">${externalButtonLabel('Update')}</a>
                </div>
                <div class="jpdb-reader-help-update-meta">
                    <div class="jpdb-reader-help jpdb-reader-help-update-status" data-yomu-update-status data-status-tone="pending" role="status" aria-live="polite" data-help-update-status>${escapeHtml(formatUiText('en', 'updateStatusIdle', { current: CURRENT_YOMU_VERSION }))}</div>
                    <div class="jpdb-reader-help jpdb-reader-help-update-status" data-yomu-duplicate-status data-status-tone="success" role="status" data-help-duplicate-status>${escapeHtml(duplicateRuntimeStatusText('en'))}</div>
                </div>
                <div class="jpdb-reader-help jpdb-reader-help-update-note" data-help-update-notes>${escapeHtml(uiText(language, updateFlowNoteKey(detectYomuUpdateFlow().kind)))}</div>
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

export function renderSettingsForm(
    settings: ReaderSettings,
    jpdbSettingsUrl: string,
    jitenSettingsUrl = DEFAULT_JITEN_SETTINGS_URL,
    options: Readonly<{ includeCatalogBrowse?: boolean }> = {},
): string {
    return `
            ${renderAutofillTrap()}
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>${escapedUiText(settings.interfaceLanguage, 'settingsTitle')}</h2>
            </div>
            ${renderSettingsTabs(settings.interfaceLanguage)}
            ${renderSettingsSearch(settings.interfaceLanguage)}
            <div class="jpdb-reader-settings-scroll">
            ${renderApiSettingsPanel(settings, jpdbSettingsUrl, jitenSettingsUrl)}
            ${renderInterfaceSettingsPanel(settings)}
            ${renderNewTabSettingsPanel(settings)}
            ${renderAudioSettingsPanel(settings)}
            ${renderImmersionKitSettingsPanel(settings)}
            ${renderReaderSettingsPanel(settings)}
            ${renderDictionariesSettingsPanel(settings, options.includeCatalogBrowse !== false)}
            ${renderBackupSettingsPanel(settings)}
            ${renderKanjiSettingsPanel(settings)}
            ${renderImageSettingsPanel(settings)}
            ${renderVideoSettingsPanel(settings)}
            ${renderYoutubeSettingsPanel(settings)}
            ${renderMiningSettingsPanel(settings)}
            ${renderShortcutSettingsPanel(settings)}
            ${renderHelpSettingsPanel(settings)}
            </div>
            ${renderSettingsFooter(settings.interfaceLanguage)}
        `;
}

function renderSettingsTabs(language: InterfaceLanguage): string {
    return `
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="${escapedUiText(language, 'settingsSections')}">
                ${SETTINGS_TABS.map(tab => settingsTabButton(tab.panel, uiText(language, tab.labelKey ?? (tab.panel as SettingsTextKey)), Boolean(tab.active))).join('')}
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
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const jpdbStatus = renderJpdbStatusLine(settings);
    const bunproStatus = renderBunproStatusLine(settings);
    const wanikaniStatus = renderWanikaniStatusLine(settings);
    return `
            <fieldset id="jpdb-reader-settings-panel-api" role="tabpanel" data-settings-panel="api" data-legend-key="api" hidden>
                <legend>${escapedUiText(language, 'api')}</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, 'apiAccess')}</div>
                    <div class="grid">
                        ${input('apiCredentialJiten', `${escapedUiText(language, 'apiCredentialJiten')} <a href="${jitenSettingsUrl}" target="_blank" rel="noopener">${escapedUiText(language, 'jitenSettings')}</a>`, effectiveJitenApiKey(settings), 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input' })}
                        ${input('apiCredentialJpdb', `${escapedUiText(language, 'apiCredentialJpdb')} <a href="${jpdbSettingsUrl}" target="_blank" rel="noopener">${escapedUiText(language, 'jpdbSettings')}</a>`, effectiveJpdbApiKey(settings), 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input' })}
                        ${input('apiCredentialBunpro', `${escapedUiText(language, 'apiCredentialBunpro')} <a href="${DEFAULT_BUNPRO_SETTINGS_URL}" target="_blank" rel="noopener">${escapedUiText(language, 'bunproSettings')}</a>`, settings.bunproFrontendApiToken, 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input', placeholder: 'frontend_api_token' })}
                        <input type="hidden" name="bunproFrontendApiTokenExpiresAt" value="${escapeHtml(settings.bunproFrontendApiTokenExpiresAt)}">
                        ${input('apiCredentialWanikani', `${escapedUiText(language, 'apiCredentialWanikani')} <a href="${WANIKANI_TOKEN_SETTINGS_URL}" target="_blank" rel="noopener">${escapedUiText(language, 'wanikaniSettings')}</a>`, settings.wanikaniApiToken, 'text', { ...API_KEY_INPUT_ATTRIBUTES, class: 'jpdb-reader-masked-input', placeholder: 'wanikani personal access token' })}
                    </div>
                    <div class="jpdb-reader-help" data-jpdb-api-key-help>${escapedUiText(language, 'apiAccessHelp')}</div>
                    <div class="jpdb-reader-help" data-wanikani-api-key-help>${escapedUiText(language, 'wanikaniTokenHelp')}</div>
                </div>
                ${jpdbStatus}
                ${bunproStatus}
                ${wanikaniStatus}
                <div data-jpdb-decks>
                    ${renderJpdbDeckControls(settings, [], hasJpdbApiCredential(settings), settings.interfaceLanguage)}
                </div>
                ${checkbox('jpdbMiningEnabled', text('jpdbMiningEnabled'), settings.jpdbMiningEnabled)}
                ${checkbox('bunproMiningEnabled', text('bunproMiningEnabled'), settings.bunproMiningEnabled)}
                ${checkbox('wanikaniReviewEnabled', text('wanikaniReviewEnabled'), settings.wanikaniReviewEnabled)}
                <div class="jpdb-reader-help" data-wanikani-grade-mapping-help>${escapedUiText(language, 'wanikaniGradeMappingHelp')}</div>
                ${checkbox('addToForq', text('addToForq'), settings.jpdbMiningEnabled && settings.addToForq, { disabled: !settings.jpdbMiningEnabled })}
                ${checkbox('enableReviews', text('enableReviews'), settings.enableReviews)}
                ${select('apiGradingProvider', text('apiGradingProvider'), settings.apiGradingProvider === 'bunpro' ? 'jiten' : settings.apiGradingProvider, [['jiten', 'Jiten'], ['jpdb', 'JPDB']])}
                <div class="jpdb-reader-help" data-grading-provider-help>${escapedUiText(language, 'apiGradingProviderHelp')}</div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, 'jpdbPageEnhancements')}</div>
                    <div class="grid">
                        ${checkbox('jpdbPageEnhancementsEnabled', text('jpdbPageEnhancementsEnabled'), settings.jpdbPageEnhancementsEnabled)}
                        ${checkbox('jpdbPageWordEnhancementsEnabled', text('jpdbPageWordEnhancementsEnabled'), settings.jpdbPageEnhancementsEnabled && settings.jpdbPageWordEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                        ${checkbox('jpdbPageKanjiEnhancementsEnabled', text('jpdbPageKanjiEnhancementsEnabled'), settings.jpdbPageEnhancementsEnabled && settings.jpdbPageKanjiEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                    </div>
                    <div class="jpdb-reader-help">Adds your dictionaries, Immersion Kit, kanji practice, and other sources to jpdb.io and jiten.moe vocabulary, kanji, and parse pages. Toggle individual sources under Dictionaries and Reading.</div>
                </div>
            </fieldset>
    `;
}

function renderInterfaceSettingsPanel(settings: ReaderSettings): string {
    const text = settingsText(settings.interfaceLanguage);
    return `
            <fieldset id="jpdb-reader-settings-panel-appearance" role="tabpanel" data-settings-panel="appearance" data-legend-key="appearance">
                <legend>${escapedUiText(settings.interfaceLanguage, 'appearance')}</legend>
                ${renderLanguageProfileControls(settings)}
                <div class="grid">
                    ${themeSegmentedControl(settings.theme, text)}
                    ${select('popupMode', text('popupMode'), settings.popupMode, localizedOptions(text, POPUP_MODE_OPTIONS))}
                    ${select('hoverPopupMode', text('hoverPopupMode'), settings.hoverPopupMode, localizedOptions(text, POPUP_MODE_OPTIONS))}
                    ${renderStickyBottomSheetControl(settings)}
                    ${checkbox('popoverBackdropEnabled', text('popoverBackdropEnabled'), settings.popoverBackdropEnabled)}
                    ${input('popoverWidth', text('popoverWidth'), String(settings.popoverWidth), 'number', { min: 280, max: 900, step: 10 })}
                    ${input('popoverHeight', text('popoverHeight'), String(settings.popoverHeight), 'number', { min: 220, max: 900, step: 10 })}
                    ${select('popoverHeightMode', text('popoverHeightMode'), settings.popoverHeightMode, localizedOptions(text, POPOVER_HEIGHT_MODE_OPTIONS))}
                    ${fontFamilyControl('readerFontFamily', text('readerFontFamily'), settings.readerFontFamily, text)}
                    ${fontFamilyControl('popupFontFamily', text('popupFontFamily'), settings.popupFontFamily, text)}
                    ${input('popupFontWeight', text('popupFontWeight'), String(settings.popupFontWeight), 'number', { min: 300, max: 900, step: 10 })}
                    ${input('accentColor', text('accentColor'), sanitizeAccentColor(settings.accentColor), 'color')}
                </div>
                ${renderWordColorSettingsSubsection(settings)}
                ${renderColorChannelSettingsSubsection(settings)}
                ${renderAppearancePreview(settings.interfaceLanguage)}
            </fieldset>
    `;
}

function renderStickyBottomSheetControl(settings: ReaderSettings): string {
    const unavailable = settings.popupMode === 'popover';
    return `
                    <div data-sticky-bottom-sheet-field ${unavailable ? 'hidden' : ''}>
                        ${checkbox('stickyBottomSheet', uiText(settings.interfaceLanguage, 'stickyBottomSheet'), settings.stickyBottomSheet && !unavailable, { disabled: unavailable })}
                    </div>`;
}

function renderNewTabSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-newtab" role="tabpanel" data-settings-panel="newTab" data-legend-key="newTab" hidden>
                <legend>${escapedUiText(settings.interfaceLanguage, 'newTab')}</legend>
                ${renderNewTabSettingsSubsection(settings)}
            </fieldset>
    `;
}

function renderNewTabSettingsSubsection(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, 'newTab')}</div>
                    <div class="grid jpdb-reader-settings-cgrid">
                        ${checkbox('newTabAnkiEnabled', text('newTabAnkiEnabled'), settings.newTabAnkiEnabled)}
                        ${renderNewTabAnkiDeckControls(settings)}
                        ${select('newTabSource', text('newTabSource'), settings.newTabSource, newTabSourceOptions(text))}
                        ${checkbox('yomuLocalSrsEnabled', text('yomuLocalSrsEnabled'), settings.yomuLocalSrsEnabled)}
                        ${select('newTabJpdbReviewMode', text('newTabJpdbReviewMode'), settings.newTabJpdbReviewMode, localizedOptions(text, NEW_TAB_JPDB_REVIEW_MODE_OPTIONS))}
                        <div data-review-config ${settings.enableReviews ? '' : 'hidden'}>
                            ${select('twoButtonReviews', text('reviewRatingScale'), settings.twoButtonReviews ? 'true' : 'false', localizedOptions(text, TWO_BUTTON_REVIEW_OPTIONS))}
                        </div>
                        ${select('newTabKanjiKeywordSource', text('newTabKanjiKeywordSource'), settings.newTabKanjiKeywordSource, kanjiKeywordSourceOptions(settings, text))}
                    </div>
                    ${renderNewTabStudyStepOrderEditor(settings)}
                    <div class="grid jpdb-reader-settings-tgrid jpdb-reader-settings-study-options">
                        ${checkbox('newTabParsingEnabled', text('newTabParsingEnabled'), settings.newTabParsingEnabled)}
                        ${checkbox('newTabKanjiUnlockEnabled', text('newTabKanjiUnlockEnabled'), settings.newTabKanjiUnlockEnabled)}
                        ${checkbox('newTabStopAtBatchEnd', text('newTabStopAtBatchEnd'), settings.newTabStopAtBatchEnd)}
                        ${checkbox('newTabSwipeReviews', text('newTabSwipeReviews'), settings.newTabSwipeReviews)}
                        ${checkbox('newTabShortcutHintsEnabled', text('newTabShortcutHintsEnabled'), settings.newTabShortcutHintsEnabled)}
                        ${checkbox('newTabFrontSentenceEnabled', text('newTabFrontSentenceEnabled'), settings.newTabFrontSentenceEnabled)}
                        ${checkbox('newTabKanjiAutogradeEnabled', text('newTabKanjiAutogradeEnabled'), settings.newTabKanjiAutogradeEnabled)}
                        ${checkbox('newTabKanjiAutoSubmit', text('newTabKanjiAutoSubmit'), settings.newTabKanjiAutoSubmit)}
                        ${checkbox('newTabOfflineEnabled', text('newTabOfflineEnabled'), settings.newTabOfflineEnabled)}
                    </div>
                    <div class="grid jpdb-reader-settings-cgrid jpdb-reader-settings-study-options">
                        ${input('newTabOfflineLimit', text('newTabOfflineLimit'), String(settings.newTabOfflineLimit), 'number', { min: 0, max: 500, step: 10 })}
                        ${input('newTabDailyGoalMinutes', text('newTabDailyGoalMinutes'), String(settings.newTabDailyGoalMinutes), 'number', { min: 0, max: 1440, step: 5 })}
                        <label>${escapedUiText(language, 'newTabUrl')}<input name="newTabUrl" type="text" value="${escapeHtml(NEW_TAB_PAGE_URL)}" readonly autocomplete="off"></label>
                    </div>
                    <div class="jpdb-reader-settings-actions">
                        <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-newtab-url-link>${escapedUiText(language, 'openNewTabPage')}</a>
                        <button class="jpdb-reader-btn" type="button" data-action="copy-newtab-url">${escapedUiText(language, 'copyAddress')}</button>
                    </div>
                    <div class="jpdb-reader-help" data-newtab-address-help>${escapedUiText(language, 'newTabAddressHelp')}</div>
                    <div class="jpdb-reader-help" data-newtab-offline-help>${escapedUiText(language, 'newTabOfflineHelp')}</div>
                </div>
    `;
}

function renderNewTabStudyStepOrderEditor(settings: ReaderSettings): string {
    const disabled = new Set(settings.newTabStudyDisabledSteps);
    const language = settings.interfaceLanguage;
    return `
                        <div class="jpdb-reader-settings-study-steps" data-source-editor data-study-step-editor>
                            <div class="jpdb-reader-settings-label-text" data-study-step-editor-title>${escapedUiText(language, 'newTabStudySteps')}</div>
                            <div class="jpdb-reader-help" data-study-step-editor-help>${escapedUiText(language, 'newTabStudyStepsHelp')}</div>
                            <div class="jpdb-reader-order-head jpdb-reader-study-step-head">
                                <span data-study-step-head="enabled">${escapedUiText(language, 'enabledHeader')}</span>
                                <span data-study-step-head="step">${escapedUiText(language, 'newTabStudyStepHeader')}</span>
                                <span data-study-step-head="details">${escapedUiText(language, 'detailsHeader')}</span>
                                <span data-study-step-head="order">${escapedUiText(language, 'orderHeader')}</span>
                            </div>
                            ${settings.newTabStudyStepOrder.map((step, index) => renderNewTabStudyStepRow(step, index, !disabled.has(step), language)).join('')}
                            <input name="newTabStudyTourSeen" type="hidden" value="${settings.newTabStudyTourSeen ? 'true' : 'false'}">
                        </div>
    `;
}

function renderNewTabStudyStepRow(step: NewTabStudyChallengeStep, index: number, enabled: boolean, language: InterfaceLanguage): string {
    return `
                            <div class="jpdb-reader-order-row jpdb-reader-study-step-row" data-source-row data-study-step-row data-source-id="study-step-${escapeHtml(step)}">
                                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                                    <input name="newTabStudyEnabledStep" type="checkbox" value="${escapeHtml(step)}" ${enabled ? 'checked' : ''}>
                                    <span>${index + 1}</span>
                                </label>
                                <span class="jpdb-reader-field-display" data-study-step-label-key="${escapeHtml(NEW_TAB_STUDY_STEP_LABEL_KEYS[step])}">${escapedUiText(language, NEW_TAB_STUDY_STEP_LABEL_KEYS[step])}</span>
                                <div class="jpdb-reader-dictionary-row-help" data-study-step-help-key="${escapeHtml(NEW_TAB_STUDY_STEP_HELP_KEYS[step])}">${escapeHtml(settingsText(language)(NEW_TAB_STUDY_STEP_HELP_KEYS[step]))}</div>
                                ${renderRowOrderTools({
                                    upAction: 'dictionary-source-up',
                                    downAction: 'dictionary-source-down',
                                    labels: {
                                        drag: uiText(language, 'dragToReorder'),
                                        up: uiText(language, 'moveUp'),
                                        down: uiText(language, 'moveDown'),
                                    },
                                    leading: `<input name="newTabStudyStepOrder" type="hidden" value="${escapeHtml(step)}">`,
                                })}
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
    return renderColorSettingsSubsection('wordColors', WORD_COLOR_FIELDS, settings);
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


// Single-source option taxonomies: each entry maps an option value to its i18n
// key. renderSettingsForm localizes them on first paint (no English flash before
// localizeSettingsForm runs) and localizeSettingsForm re-applies the same table
// on live language switches — one source, two consumers.
//
// The interface language is no longer one of them: D43 renders it from the
// 33-locale manifest, grouped into what is ready and what is on the way, so a
// blocked locale is visible and disabled rather than absent. See
// renderInterfaceLocaleSelect / localizeInterfaceLocaleSelect.

const POPUP_MODE_OPTIONS = [
    ['auto', 'auto'],
    ['sheet', 'bottomSheet'],
    ['popover', 'popover'],
] as const satisfies SettingsOptionTable;

const POPOVER_HEIGHT_MODE_OPTIONS = [
    ['available', 'popoverHeightAvailable'],
    ['fixed', 'popoverHeightFixed'],
] as const satisfies SettingsOptionTable;

const PARSER_PROVIDER_OPTIONS = [
    ['local', 'parserProviderLocal'],
    ['jiten', 'parserProviderJiten'],
    ['jpdb', 'parserProviderJpdb'],
    ['auto', 'parserProviderAuto'],
] as const satisfies SettingsOptionTable;

const NEW_TAB_JPDB_REVIEW_MODE_OPTIONS = [
    ['auto', 'newTabJpdbReviewAuto'],
    ['live-review', 'newTabLiveReview'],
    ['api-vocabulary', 'newTabApiVocabulary'],
] as const satisfies SettingsOptionTable;

const TWO_BUTTON_REVIEW_OPTIONS = [
    ['false', 'fivePoint'],
    ['true', 'twoPoint'],
] as const satisfies SettingsOptionTable;

const APPEARANCE_PRESET_OPTIONS = [
    ['', 'appearancePresetCustom'],
    ['balanced', 'appearancePresetBalanced'],
    ['new-only', 'appearancePresetNewOnly'],
    ['underline-new', 'appearancePresetUnderlineNew'],
    ['no-colors', 'appearancePresetNoColors'],
] as const satisfies SettingsOptionTable;

const WORD_COLOR_STATE_OPTIONS = [
    ['all', 'wordColorStatesAll'],
    ['new-only', 'wordColorStatesNewOnly'],
] as const satisfies readonly (readonly [ReaderSettings['wordColorStates'], SettingsTextKey])[];

const AUDIO_AUTO_PLAY_MODE_OPTIONS = [
    ['all', 'audioAutoPlayAll'],
    ['hover', 'audioAutoPlayHover'],
    ['tap', 'audioAutoPlayTap'],
] as const satisfies SettingsOptionTable;

const AUDIO_SELECTION_MODE_OPTIONS = [
    ['first', 'firstAudio'],
    ['random', 'randomAudio'],
] as const satisfies SettingsOptionTable;

const AUDIO_TTS_MODE_OPTIONS = [
    ['fallback', 'audioTtsFallback'],
    ['source-order', 'audioTtsSourceOrder'],
] as const satisfies SettingsOptionTable;

const IMMERSION_KIT_CATEGORY_OPTIONS = [
    ['all', 'allCategories'],
    ['anime', 'anime'],
    ['drama', 'drama'],
    ['games', 'games'],
] as const satisfies SettingsOptionTable;

const IMMERSION_KIT_SORT_OPTIONS = [
    ['sentence_length:asc', 'shortestFirst'],
    ['sentence_length:desc', 'longestFirst'],
] as const satisfies SettingsOptionTable;

const SUBTITLE_CONTROLS_MODE_OPTIONS = [
    ['auto', 'showWhenNeeded'],
    ['hidden', 'hideControls'],
    ['always', 'alwaysVisible'],
] as const satisfies SettingsOptionTable;

const NATIVE_SUBTITLE_DISPLAY_OPTIONS = [
    ['blurred', 'subtitleNativeDisplayBlurred'],
    ['shown', 'subtitleNativeDisplayShown'],
    ['hidden', 'subtitleNativeDisplayHidden'],
] as const satisfies SettingsOptionTable<NativeSubtitleDisplayMode>;

const OCR_PROVIDER_OPTIONS = [
    ['google-lens', 'googleLens'],
    ['cloud-vision', 'cloudVision'],
    ['local-service', 'localOcr'],
    ['off', 'off'],
] as const satisfies SettingsOptionTable;

const OCR_OVERLAY_THEME_OPTIONS = [
    ['auto', 'ocrOverlayThemeAuto'],
    ['light', 'ocrOverlayThemeLight'],
    ['dark', 'ocrOverlayThemeDark'],
] as const satisfies SettingsOptionTable;

const OCR_MAX_IMAGES_PER_PAGE_OPTIONS = [
    ['3', 'lightWork'],
    ['8', 'normal'],
    ['16', 'more'],
] as const satisfies SettingsOptionTable;

const OCR_MIN_IMAGE_AREA_OPTIONS = [
    ['80000', 'largeOnly'],
    ['45000', 'normal'],
    ['15000', 'includeSmall'],
] as const satisfies SettingsOptionTable;

const OCR_MAX_IMAGE_PIXELS_OPTIONS = [
    ['640000', 'faster'],
    ['1200000', 'balanced'],
    ['2000000', 'sharper'],
] as const satisfies SettingsOptionTable;

// UT-47: a live sample sentence that mirrors the furigana/colour options.
// data-settings-preview-lookup keeps localizeSettingsForm's
// unwrapReaderWords pass from stripping the sample word spans.
function renderAppearancePreview(language: InterfaceLanguage): string {
    return `
                <div class="jpdb-reader-settings-subsection jpdb-reader-settings-preview-section jp-only" data-language-family="pitch-legend">
                    <div class="jpdb-reader-local-title" data-settings-preview-title>${escapedUiText(language, 'preview')}</div>
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
    return `${word('jpdb-new anki-new jpdb-pitch-heiban', '新', 'あたら', 'しい')}${word('jpdb-learning anki-learning jpdb-pitch-atamadaka', '言葉', 'ことば')}を${word('jpdb-due anki-due jpdb-pitch-nakadaka', '毎日', 'まいにち')}${word('jpdb-failed anki-failed jpdb-pitch-odaka', '勉強', 'べんきょう')}して、${word('jpdb-known anki-known jpdb-pitch-unknown', '日本語', 'にほんご')}が${word('jpdb-never-forget anki-known jpdb-pitch-heiban', '上手', 'じょうず')}になる。`;
}

function renderPitchColorSettingsSubsection(settings: ReaderSettings): string {
    return `<div class="jp-only" data-language-family="pitch-colouring">${renderColorSettingsSubsection('pitchAccentColors', PITCH_COLOR_FIELDS, settings)}</div>`;
}

function renderColorChannelSettingsSubsection(settings: ReaderSettings): string {
    const text = settingsText(settings.interfaceLanguage);
    // A20/#40: describe the saved colour policies, not whichever provider is
    // connected today, so choices stay distinct as sources come and go.
    const options = colorSourceSelectOptions(text);
    const noSourceHidden = hasStatusColorSource(settings) ? ' hidden' : '';
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapeHtml(text('colorChannels'))}</div>
                    <div class="grid">
                        ${COLOR_CHANNEL_FIELDS.map(([name, key]) => select(name, text(key), settingsColorSourceValue(settings, name), options)).join('')}
                    </div>
                    <div class="jpdb-reader-help" data-status-color-no-source data-help-key="statusColorNoSourceHelp"${noSourceHidden}>${escapeHtml(text('statusColorNoSourceHelp'))}</div>
                </div>
    `;
}

function renderColorSettingsSubsection(titleKey: SettingsTextKey, fields: readonly ColorInputField[], settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(settings.interfaceLanguage, titleKey)}</div>
                    <div class="grid jpdb-reader-color-grid">
                        ${renderColorInputs(fields, settings)}
                    </div>
                </div>
    `;
}

function renderColorInputs(fields: readonly ColorInputField[], settings: ReaderSettings): string {
    const text = settingsText(settings.interfaceLanguage);
    return fields.map(([name, key]) => input(name, text(key), settings[name], 'color')).join('');
}

function renderAudioSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
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
                    ${select('audioSelectionMode', uiText(language, 'audioSelectionMode'), settings.audioSelectionMode, localizedOptions(text, AUDIO_SELECTION_MODE_OPTIONS))}
                    ${select('audioTtsMode', uiText(language, 'audioTtsMode'), settings.audioTtsMode, localizedOptions(text, AUDIO_TTS_MODE_OPTIONS))}
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
    const options = localizedOptions(settingsText(language), AUDIO_AUTO_PLAY_MODE_OPTIONS);
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
    const text = settingsText(language);
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
                    ${select('immersionKitExampleSource', uiText(language, 'immersionKitExampleSource'), settings.immersionKitExampleSource, immersionKitExampleSourceOptions(text))}
                    ${renderNadeshikoApiKeyField(settings)}
                    ${select('immersionKitCategory', uiText(language, 'immersionKitCategory'), settings.immersionKitCategory, localizedOptions(text, IMMERSION_KIT_CATEGORY_OPTIONS))}
                    ${select('immersionKitSort', uiText(language, 'immersionKitSort'), settings.immersionKitSort, localizedOptions(text, IMMERSION_KIT_SORT_OPTIONS))}
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

function renderReaderSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const pageScanMode = pageScanModeFromSettings(settings);
    const targetLanguage = activeTargetLanguageId(settings);
    return `
            <fieldset id="jpdb-reader-settings-panel-reader" role="tabpanel" data-settings-panel="appearance" data-legend-key="reader" aria-describedby="settings-help-reader" hidden>
                <legend>${escapedUiText(language, 'reader')}</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-popup-lookup-title>${escapedUiText(language, 'popupLookup')}</div>
                    <div class="grid">
                        ${checkbox('popupLookupEnabled', text('popupLookupEnabled'), isPopupLookupEnabled(settings))}
                    </div>
                    <div class="jpdb-reader-help" data-help-key="popupLookupHelp">${escapedUiText(language, 'popupLookupHelp')}</div>
                </div>
                <div class="grid">
                    ${checkbox('lookupOnClick', text('lookupOnClick'), settings.lookupOnClick)}
                    ${checkbox('lookupOnHover', text('lookupOnHover'), settings.lookupOnHover)}
                    ${checkbox('lookupOnMiddleMouse', text('lookupOnMiddleMouse'), settings.lookupOnMiddleMouse)}
                    ${checkbox('showFloatingButton', text('showFloatingButton'), settings.showFloatingButton)}
                    ${radioGroup('pageScanMode', text('pageScanMode'), pageScanMode, [
                        ['off', text('pageScanModeOff')],
                        ['auto', text('pageScanModeAuto')],
                        ['manual', text('pageScanModeManual')],
                    ])}
                    <div class="jpdb-reader-shortcut-group" data-page-scan-manual-shortcut ${pageScanMode === 'manual' ? '' : 'hidden'}>
                        <div data-manual-page-scan-shortcut-label>${shortcutInput('shortcuts.scanPage', text('manualPageScanShortcut'), settings.shortcuts.scanPage)}</div>
                    </div>
                    ${select('appearancePreset', text('appearancePreset'), '', localizedOptions(text, APPEARANCE_PRESET_OPTIONS))}
                    ${renderReadingAnnotationControls(settings, targetLanguage)}
                    ${select('wordColorStates', text('wordColorStates'), settings.wordColorStates, localizedOptions(text, WORD_COLOR_STATE_OPTIONS))}
                    ${renderWordColorHiddenStateGroupControls(settings)}
                    <div data-language-family="pronunciation">
                        ${checkbox('showPitchAccent', text('showPitchAccent'), settings.showPitchAccent)}
                    </div>
                    ${checkbox('suppressRedundantWordUi', text('suppressRedundantWordUi'), settings.suppressRedundantWordUi)}
                    ${checkbox('sheetCloseButtonOnLeft', text('sheetCloseButtonOnLeft'), settings.sheetCloseButtonOnLeft)}
                </div>
                ${renderPitchColorSettingsSubsection(settings)}
                ${renderHoverLookupSettingsSubsection(settings)}
                <div id="settings-help-reader" class="jpdb-reader-help" data-help-key="readerHelp">${escapedUiText(language, 'readerHelp')}</div>
            </fieldset>
    `;
}

function pageScanModeFromSettings(settings: ReaderSettings): PageScanMode {
    if (settings.annotationsPaused) return 'off';
    return settings.manualScanEnabled ? 'manual' : 'auto';
}

function renderHoverLookupSettingsSubsection(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-hover-lookup-title>${escapedUiText(language, 'hoverLookupSettings')}</div>
                    <div class="grid">
                        ${shortcutInput('shortcuts.hoverLookup', text('holdWhileHovering'), settings.shortcuts.hoverLookup, uiText(language, 'blankPlainHover'))}
                        ${input('hoverOpenDelayMs', text('hoverOpenDelayMs'), String(settings.hoverOpenDelayMs), 'number')}
                        ${input('hoverCloseDelayMs', text('hoverCloseDelayMs'), String(settings.hoverCloseDelayMs), 'number')}
                    </div>
                </div>
    `;
}

function renderKanjiSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-kanji" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="kanji" hidden>
                <legend>${escapedUiText(settings.interfaceLanguage, 'kanji')}</legend>
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
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-ocr" role="tabpanel" data-settings-panel="media" data-legend-key="images" aria-describedby="settings-help-ocr" hidden>
                <legend>${escapedUiText(language, 'images')}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${radioGroup('ocrInteractionMode', text('ocrInteractionMode'), ocrInteractionModeFromSettings(settings), [
                        ['auto', text('ocrInteractionModeAuto')],
                        ['manual', text('ocrInteractionModeManual')],
                        ['off', text('ocrInteractionModeOff')],
                    ])}
                    ${checkbox('ocrShowTextOverlay', text('ocrShowTextOverlay'), settings.ocrShowTextOverlay)}
                    ${checkbox('ocrVideoPauseFrames', text('ocrVideoPauseFrames'), settings.ocrVideoPauseFrames)}
                    ${checkbox('ocrInvertDarkPanels', text('ocrInvertDarkPanels'), settings.ocrInvertDarkPanels)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${select('ocrProvider', text('ocrProvider'), settings.ocrProvider, localizedOptions(text, OCR_PROVIDER_OPTIONS))}
                    ${select('ocrOverlayTheme', text('ocrOverlayTheme'), settings.ocrOverlayTheme, localizedOptions(text, OCR_OVERLAY_THEME_OPTIONS))}
                    ${select('ocrMaxImagesPerPage', text('ocrMaxImagesPerPage'), String(settings.ocrMaxImagesPerPage), localizedOptions(text, OCR_MAX_IMAGES_PER_PAGE_OPTIONS))}
                    ${select('ocrMinImageArea', text('ocrMinImageArea'), String(settings.ocrMinImageArea), localizedOptions(text, OCR_MIN_IMAGE_AREA_OPTIONS))}
                    ${select('ocrMaxImagePixels', text('ocrMaxImagePixels'), String(settings.ocrMaxImagePixels), localizedOptions(text, OCR_MAX_IMAGE_PIXELS_OPTIONS))}
                    ${renderColorInputs(OCR_COLOR_FIELDS, settings)}
                    ${input('ocrBackgroundOpacity', text('ocrBackgroundOpacity'), String(settings.ocrBackgroundOpacity), 'number')}
                    ${input('ocrFontScale', text('ocrFontScale'), String(settings.ocrFontScale), 'number')}
                    <div class="jpdb-reader-help" data-local-ocr ${localOcrHidden} data-help-key="ocrLocalHelp">${escapedUiText(language, 'ocrLocalHelp')}</div>
                    <div data-local-ocr ${localOcrHidden}>${select('ocrEngine', text('ocrEngine'), settings.ocrEngine, ocrEngineOptions(text))}</div>
                    <label data-local-ocr ${localOcrHidden}>${escapedUiText(language, 'ocrEndpointUrl')}<input name="ocrEndpointUrl" type="url" value="${escapeHtml(settings.ocrEndpointUrl)}" placeholder="http://127.0.0.1:7331/ocr" autocomplete="off"></label>
                    <div class="jpdb-reader-help" data-cloud-ocr ${cloudOcrHidden} data-help-key="ocrCloudHelp">${escapedUiText(language, 'ocrCloudHelp')}</div>
                    <label data-cloud-ocr ${cloudOcrHidden}>${escapedUiText(language, 'cloudVisionApiKey')}<input name="ocrCloudVisionApiKey" type="text" class="jpdb-reader-masked-input" value="${escapeHtml(settings.ocrCloudVisionApiKey)}" autocomplete="off"${API_KEY_INPUT_ATTRIBUTE_HTML}></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml(settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${settings.ocrPrefetchMargin}">
                    <input type="hidden" name="ocrPrefetchPages" value="${settings.ocrPrefetchPages}">
                    <input type="hidden" name="ocrConcurrency" value="${settings.ocrConcurrency}">
                </div>
                <div id="settings-help-ocr" class="jpdb-reader-help" data-help-key="ocrHelp">${escapedUiText(language, 'ocrHelp')}</div>
            </fieldset>
    `;
}

function renderVideoSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-video" role="tabpanel" data-settings-panel="media" data-legend-key="video" hidden>
                <legend>${escapedUiText(language, 'video')}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox('subtitlePlayerEnabled', text('subtitlePlayerEnabled'), settings.subtitlePlayerEnabled)}
                    ${checkbox('subtitleAutoDetect', text('subtitleAutoDetect'), settings.subtitleAutoDetect)}
                    ${checkbox('subtitleOverlayVisible', text('subtitleOverlayVisible'), settings.subtitleOverlayVisible)}
                    ${checkbox('subtitleKaraokeMode', text('subtitleKaraokeMode'), settings.subtitleKaraokeMode)}
                    ${checkbox('subtitleTranscriptVisible', text('subtitleTranscriptVisible'), settings.subtitleTranscriptVisible)}
                    ${checkbox('subtitlePausePanel', text('subtitlePausePanel'), settings.subtitlePausePanel)}
                    ${checkbox('subtitleShadowAutoPause', text('subtitleShadowAutoPause'), settings.subtitleShadowAutoPause)}
                    ${checkbox('subtitleTranscriptAutoScroll', text('subtitleTranscriptAutoScroll'), settings.subtitleTranscriptAutoScroll)}
                    ${checkbox('subtitleAutoCopyLine', text('subtitleAutoCopyLine'), settings.subtitleAutoCopyLine)}
                    ${checkbox('subtitleCopyIncludeTranslation', text('subtitleCopyIncludeTranslation'), settings.subtitleCopyIncludeTranslation)}
                    ${checkbox('subtitleMiningPause', text('subtitleMiningPause'), settings.subtitleMiningPause)}
                    ${checkbox('subtitleHoverPause', text('subtitleHoverPause'), settings.subtitleHoverPause)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${select('subtitleNativeDisplay', text('subtitleNativeDisplay'), nativeSubtitleDisplayMode(settings), localizedOptions(text, NATIVE_SUBTITLE_DISPLAY_OPTIONS))}
                    ${input('subtitleNativeBlurStrength', text('subtitleNativeBlurStrength'), String(settings.subtitleNativeBlurStrength), 'number')}
                    ${input('subtitleTranscriptAutoScrollResumeSeconds', text('subtitleTranscriptAutoScrollResumeSeconds'), String(settings.subtitleTranscriptAutoScrollResumeSeconds), 'number')}
                    ${select('subtitleControlsMode', text('subtitleControlsMode'), settings.subtitleControlsMode, localizedOptions(text, SUBTITLE_CONTROLS_MODE_OPTIONS))}
                    ${input('subtitleFontSize', text('subtitleFontSize'), String(settings.subtitleFontSize), 'number')}
                    ${input('subtitleBottomOffset', text('subtitleBottomOffset'), String(settings.subtitleBottomOffset), 'number')}
                    ${renderColorInputs(SUBTITLE_COLOR_FIELDS, settings)}
                    ${input('subtitleBackgroundOpacity', text('subtitleBackgroundOpacity'), String(settings.subtitleBackgroundOpacity), 'number')}
                    ${fontFamilyControl('subtitleFontFamily', text('subtitleFontFamily'), settings.subtitleFontFamily, text)}
                    ${input('subtitleFontWeight', text('subtitleFontWeight'), String(settings.subtitleFontWeight), 'number')}
                    ${input('subtitleSeekPadding', text('subtitleSeekPadding'), String(settings.subtitleSeekPadding), 'number')}
                </div>
                ${renderSubtitlePreview(language)}
            </fieldset>
    `;
}

function renderSubtitlePreview(language: InterfaceLanguage): string {
    return `
                <div class="jpdb-reader-subtitle-preview" data-subtitle-preview>
                    <div class="jpdb-subtitle-primary">
                        <span class="jpdb-reader-word jpdb-new jpdb-pitch-heiban" data-settings-preview-lookup="新しい" data-sentence="新しい言葉を読む" tabindex="-1">新しい</span>
                        <span class="jpdb-reader-word jpdb-learning jpdb-pitch-atamadaka" data-settings-preview-lookup="言葉" data-sentence="新しい言葉を読む" tabindex="-1">言葉</span>
                        <span class="jpdb-reader-word jpdb-known jpdb-pitch-nakadaka" data-settings-preview-lookup="を" data-sentence="新しい言葉を読む" tabindex="-1">を</span>
                        <span class="jpdb-reader-word jpdb-due jpdb-pitch-odaka" data-settings-preview-lookup="読む" data-sentence="新しい言葉を読む" tabindex="-1">読む</span>
                    </div>
                    <div class="jpdb-subtitle-secondary">${escapedUiText(language, 'subtitlePreview')}</div>
                </div>
    `;
}

function renderMiningSettingsPanel(settings: ReaderSettings): string {
    const ankiStatus = ankiStatusLineForSettings(settings, settings.interfaceLanguage);
    return renderAnkiMiningSettingsPanel(settings, {
        tone: ankiStatus.tone,
        html: renderAnkiStatusHtml(ankiStatus, settings.interfaceLanguage),
    });
}

function renderDictionariesSettingsPanel(settings: ReaderSettings, includeCatalogBrowse: boolean): string {
    const language = settings.interfaceLanguage; const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-dictionaries" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="sources" hidden>
                <legend>${escapedUiText(language, 'sources')}</legend>
                <div data-target-dictionary-content hidden>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status role="status" aria-live="polite">${escapedUiText(language, 'checkingDictionaries')}</div>
                ${renderLocalDictionaryStorageControls(settings)}
                <div class="jpdb-reader-settings-subsection jp-only" data-language-family="provider-pills">
                    <div class="jpdb-reader-help" data-help-key="parserProviderHelp">${escapedUiText(language, 'parserProviderHelp')}</div>
                    ${select('parserProvider', text('parserProvider'), settings.parserProvider, localizedOptions(text, PARSER_PROVIDER_OPTIONS))}
                </div>
                <div class="jpdb-reader-dictionary-priorities" data-source-editor data-definition-source-editor>
                    ${renderDictionarySourceRows(settings)}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, 'lookupPills')}</div>
                    <div class="jpdb-reader-help">${escapedUiText(language, 'lookupPillsHelp')}</div>
                    ${checkbox('showLookupPillFrequency', text('showLookupPillFrequency'), settings.showLookupPillFrequency)}
                    <div class="jpdb-reader-lookup-links" data-source-editor>
                        ${renderDictionaryLookupLinkEditor(settings.dictionaryLookupLinks, [], activeTargetLanguageId(settings))}
                    </div>
                </div>
                <div class="jpdb-reader-recommended-dictionaries" data-recommended-dictionaries>
                    ${renderRecommendedDictionaries([], activeLearnerLanguageId(settings), includeCatalogBrowse, activeTargetLanguageId(settings))}
                </div>
                <div class="jpdb-reader-help" data-import-status hidden></div>
                <div class="jpdb-reader-help" data-help-key="backupMovedHelp">${escapedUiText(language, 'backupMovedHelp')}</div>
                </div>
            </fieldset>
    `;
}

function renderBackupSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    return `
            <fieldset id="jpdb-reader-settings-panel-backup" role="tabpanel" data-settings-panel="backup" data-legend-key="backupSync" hidden>
                <legend>${escapedUiText(language, 'backupSync')}</legend>
                <div class="jpdb-reader-help" data-help-key="backupSyncHelp">${escapedUiText(language, 'backupSyncHelp')}</div>
                ${renderAcademyAccountSyncSection(settings)}
                ${CLOUD_SETTINGS_SYNC_ENABLED ? renderCloudSettingsSyncSection(settings) : ''}
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">${escapedUiText(language, 'importSettings')}</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">${escapedUiText(language, 'exportSettings')}</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">${escapedUiText(language, 'importDictionaries')}</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">${escapedUiText(language, 'exportDictionaries')}</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip" multiple>
                <div class="jpdb-reader-help" data-import-status>Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.</div>
            </fieldset>
    `;
}

function renderAcademyAccountSyncSection(settings: ReaderSettings): string {
    const language = resolveUiLanguage(settings.interfaceLanguage);
    return `
                <div class="jpdb-reader-settings-subsection jpdb-reader-academy-account" data-academy-reader-account data-connected="false">
                    <div class="jpdb-reader-local-title" data-academy-account-title>${escapedUiText(language, 'academyAccountSync')}</div>
                    <div class="jpdb-reader-help" data-help-key="academyAccountSyncHelp">${escapedUiText(language, 'academyAccountSyncHelp')}</div>
                    <div class="jpdb-reader-settings-actions jpdb-reader-settings-actions-single">
                        <a class="jpdb-reader-btn jpdb-reader-academy-account-link" href="${ACADEMY_ACCOUNT_SYNC_URL}" target="_blank" rel="noopener" data-academy-account-link>${externalButtonLabel(uiText(language, 'academyAccountManage'))}</a>
                    </div>
                    <div class="jpdb-reader-help jpdb-reader-academy-account-status" data-academy-reader-status data-status-tone="pending" role="status" aria-live="polite">${escapedUiText(language, 'academyAccountChecking')}</div>
                    <div class="jpdb-reader-academy-account-connect" data-academy-reader-connect-controls>
                        <label for="jpdb-reader-academy-pairing-code">
                            <span class="${SETTINGS_LABEL_TEXT_CLASS}" data-academy-pairing-code-label>${escapedUiText(language, 'academyPairingCode')}</span>
                        </label>
                        <div class="jpdb-reader-academy-account-code-row">
                            <input id="jpdb-reader-academy-pairing-code" data-academy-pairing-code type="text" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="24" placeholder="${escapedUiText(language, 'academyPairingCodePlaceholder')}" aria-describedby="jpdb-reader-academy-account-help">
                            <button class="jpdb-reader-btn" type="button" data-action="connect-academy-account">${escapedUiText(language, 'academyAccountConnect')}</button>
                        </div>
                        <span id="jpdb-reader-academy-account-help" class="jpdb-reader-sr-only">${escapedUiText(language, 'academyAccountSyncHelp')}</span>
                    </div>
                    <div class="jpdb-reader-settings-actions" data-academy-reader-connected-controls hidden>
                        <button class="jpdb-reader-btn" type="button" data-action="sync-academy-account">${escapedUiText(language, 'academyAccountSyncNow')}</button>
                        <button class="jpdb-reader-btn" type="button" data-action="create-academy-recovery-code">${escapedUiText(language, 'academyRecoveryCodeCreate')}</button>
                        <button class="jpdb-reader-btn" type="button" data-action="disconnect-academy-account">${escapedUiText(language, 'academyAccountDisconnect')}</button>
                    </div>
                    <output class="jpdb-reader-help jpdb-reader-academy-recovery-code" data-academy-recovery-code hidden></output>
                </div>
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
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const pressKeys = uiText(language, 'pressKeys');
    return `
            <fieldset id="jpdb-reader-settings-panel-shortcuts" role="tabpanel" data-settings-panel="shortcuts" data-legend-key="shortcuts" hidden>
                <legend>${escapedUiText(language, 'shortcuts')}</legend>
                <div class="grid">
                    ${shortcutInput('shortcuts.scanPage', text('scanPage'), settings.shortcuts.scanPage, pressKeys)}
                    ${shortcutInput('shortcuts.hoverLookup', text('holdWhileHovering'), settings.shortcuts.hoverLookup, uiText(language, 'blankPlainHover'))}
                    ${shortcutInput('shortcuts.openSettings', text('openSettings'), settings.shortcuts.openSettings, pressKeys)}
                    ${shortcutInput('shortcuts.playAudio', text('playAudio'), settings.shortcuts.playAudio, pressKeys)}
                    ${shortcutInput('shortcuts.closePopup', text('closePopup'), settings.shortcuts.closePopup, pressKeys)}
                    ${shortcutInput('shortcuts.previousLookupWord', text('previousLookupWord'), settings.shortcuts.previousLookupWord, pressKeys)}
                    ${shortcutInput('shortcuts.nextLookupWord', text('nextLookupWord'), settings.shortcuts.nextLookupWord, pressKeys)}
                    ${shortcutInput('shortcuts.previousSubtitle', text('previousSubtitle'), settings.shortcuts.previousSubtitle, pressKeys)}
                    ${shortcutInput('shortcuts.nextSubtitle', text('nextSubtitle'), settings.shortcuts.nextSubtitle, pressKeys)}
                    ${shortcutInput('shortcuts.copySubtitle', text('copySubtitle'), settings.shortcuts.copySubtitle, pressKeys)}
                    ${shortcutInput('shortcuts.toggleOcr', text('toggleImageReading'), settings.shortcuts.toggleOcr, pressKeys)}
                    ${shortcutInput('shortcuts.toggleSubtitleOverlay', text('toggleSubtitleOverlay'), settings.shortcuts.toggleSubtitleOverlay, pressKeys)}
                    ${shortcutInput('shortcuts.toggleYoutubeImmersion', text('toggleYoutubeImmersion'), settings.shortcuts.toggleYoutubeImmersion, pressKeys)}
                    ${shortcutInput('shortcuts.scanImages', text('readImagesNow'), settings.shortcuts.scanImages, pressKeys)}
                    ${shortcutInput('shortcuts.massReviewVisible', text('massReviewVisible'), settings.shortcuts.massReviewVisible, pressKeys)}
                    ${shortcutInput('shortcuts.studyReveal', text('studyReveal'), settings.shortcuts.studyReveal, pressKeys)}
                    ${shortcutInput('shortcuts.studyRevealAlternate', text('studyRevealAlternate'), settings.shortcuts.studyRevealAlternate, pressKeys)}
                    ${shortcutInput('shortcuts.studyUndo', text('studyUndo'), settings.shortcuts.studyUndo, pressKeys)}
                    ${shortcutInput('shortcuts.studyPrevious', text('studyPrevious'), settings.shortcuts.studyPrevious, pressKeys)}
                    ${shortcutInput('shortcuts.studyPreviousAlternate', text('studyPreviousAlternate'), settings.shortcuts.studyPreviousAlternate, pressKeys)}
                    ${shortcutInput('shortcuts.studyNext', text('studyNext'), settings.shortcuts.studyNext, pressKeys)}
                    ${shortcutInput('shortcuts.studyNextAlternate', text('studyNextAlternate'), settings.shortcuts.studyNextAlternate, pressKeys)}
                    ${renderReviewShortcutInputs(settings)}
                </div>
            </fieldset>
    `;
}

function renderHelpSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    return `
            <fieldset id="jpdb-reader-settings-panel-help" role="tabpanel" data-settings-panel="help" data-legend-key="help" hidden>
                <legend>${escapedUiText(language, 'help')}</legend>
                ${renderHelpLinksPanel(settings.interfaceLanguage)}
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-diagnostics-title>${escapedUiText(language, 'diagnostics')}</div>
                    <div class="grid">
                        ${checkbox('enableLogging', uiText(language, 'enableLogging'), settings.enableLogging)}
                    </div>
                    <div class="jpdb-reader-help" data-diagnostics-help>${escapedUiText(language, 'diagnosticsHelp')}</div>
                </div>
            </fieldset>
    `;
}

function renderSettingsFooter(language: InterfaceLanguage): string {
    return `
            <div class="footer">
                <div class="jpdb-reader-settings-save-status" data-settings-save-status role="status" aria-live="polite" hidden></div>
                <div class="jpdb-reader-settings-footer-version" data-yomu-settings-version>Yomu ${escapeHtml(CURRENT_YOMU_VERSION)}</div>
                <button class="jpdb-reader-btn" type="button" data-action="cancel">${escapedUiText(language, 'cancel')}</button>
                <button class="jpdb-reader-btn add" type="submit">${escapedUiText(language, 'save')}</button>
            </div>
    `;
}

function fontFamilyControl(name: FontFamilySettingName, label: string, value: string, text?: SettingsText): string {
    const selectedValue = fontFamilyPresetValue(value);
    return `
        <div class="jpdb-reader-font-family-control" data-font-family-control="${name}">
            ${select(name, label, selectedValue, fontFamilyOptions(text))}
            <label class="jpdb-reader-font-family-custom" data-font-family-custom ${selectedValue === CUSTOM_FONT_FAMILY_VALUE ? '' : 'hidden'}>
                ${escapeHtml(text ? text('customFontFamily') : 'Custom font stack')}
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

function themeSegmentedControl(value: ReaderSettings['theme'], text: SettingsText): string {
    const isDark = value === 'dark';
    const switchLabel = escapeHtml(isDark ? text('switchToLightTheme') : text('switchToDarkTheme'));
    return `
        <div class="jpdb-reader-theme-field" data-theme-field>
            <span class="jpdb-reader-theme-title" id="jpdb-reader-theme-label" data-theme-title>${escapeHtml(text('theme'))}</span>
            <input type="hidden" name="theme" value="${escapeHtml(value)}" data-theme-value>
            <div class="VPNavBarAppearance appearance jpdb-reader-theme-appearance">
                <button class="VPSwitch VPSwitchAppearance jpdb-reader-theme-switch" type="button" role="switch" data-theme-switch data-newtab-action="theme" aria-label="${switchLabel}" aria-labelledby="jpdb-reader-theme-label" aria-describedby="jpdb-reader-theme-label" aria-checked="${isDark}" title="${switchLabel}">
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
    unwrapReaderWords(form, {
        includeReaderRoot: true,
        excludeSelector: '[data-settings-preview-lookup], [data-settings-preview-lookup] .jpdb-reader-word',
    });
    // settingsText, not a bare uiText lambda: a `{language}` label would otherwise
    // relabel into its raw token on a live interface-language switch. Every
    // hand-rolled `key => uiText(language, key)` is a leak site for that (b20).
    const text = settingsText(language);
    withNamedControlIndex(form, () => {
        localizeSettingsShell(form, language, text);
        localizeSettingsLabels(form, text);
        localizeSettingsSectionTitles(form, text);
        localizeSettingsSelects(form, language, text);
        localizeSettingsShortcuts(form, text);
        localizeSettingsHelpText(form, text);
        localizeSettingsActions(form, text);
        localizeSettingsEditorChrome(form, text);
        localizeHelpLinksPanel(form, language);
        removeSettingsSelectOptionMeta(form);
        normalizeSettingsLabelTextContainers(form);
        syncDisabledSettingsControlDescriptions(form, language);
    });
    syncLanguageProfileControls(form, language);
    installLanguageProfileControlSync(form);
}

function syncLanguageProfileControls(form: HTMLFormElement, language: InterfaceLanguage): void {
    const copy = multilingualSettingsCopy(language);
    const copyValues: Record<string, string> = {
        languageProfileTitle: copy.languageProfileTitle,
        learnerLanguage: copy.learnerLanguage,
        targetLanguage: copy.targetLanguage,
        languageProfileHelp: copy.languageProfileHelp,
        translationTitle: copy.translationTitle,
        translationHelp: copy.translationHelp,
    };
    form.querySelectorAll<HTMLElement>('[data-multilingual-copy]').forEach((element) => {
        const key = element.dataset.multilingualCopy;
        const value = key ? copyValues[key] : undefined;
        if (value !== undefined) element.replaceChildren(value);
    });

    const targetSelect = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]');
    const selectedTarget = targetSelect && learningTargetRosterIdForTag(targetSelect.value);
    if (targetSelect && selectedTarget) {
        setInnerHtml(targetSelect, renderStudyTargetOptions(language, selectedTarget));
    }

    const learnerSelect = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]');
    const learnerLanguageId = learnerSelect && learnerLanguageByIdOrNull(learnerSelect.value) ? (learnerSelect.value as LearnerLanguageId) : 'en';
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const translationAvailable = googleTranslationLanguageCapability(learnerLanguage.runtimeLocale).supported;
    if (learnerSelect) {
        learnerSelect.lang = learnerLanguage.runtimeLocale;
        learnerSelect.dir = learnerLanguage.direction;
    }

    let visibleCount = 0;
    form.querySelectorAll<HTMLLabelElement>('[data-definition-translation-row]').forEach((row) => {
        const definitionLanguages = new Set((row.dataset.definitionLanguages ?? '').split(/\s+/u).filter(Boolean));
        const native = definitionLanguages.has(learnerLanguageId);
        row.hidden = native || !translationAvailable;
        const input = row.querySelector<HTMLInputElement>('input[name="definitionTranslationProviderIds"]');
        if (input) input.disabled = native || !translationAvailable;
        row.querySelector<HTMLElement>('[data-definition-translation-label]')?.replaceChildren(copy.translateAutomatically(learnerLanguage.nativeName));
        if (!native && translationAvailable) visibleCount += 1;
    });
    const empty = form.querySelector<HTMLElement>('[data-definition-translation-empty]');
    if (empty) {
        empty.replaceChildren(copy.translationEmpty);
        empty.hidden = !translationAvailable || visibleCount > 0;
    }
    const unavailable = form.querySelector<HTMLElement>('[data-definition-translation-unavailable]');
    if (unavailable) {
        unavailable.replaceChildren(copy.translationUnavailable);
        unavailable.hidden = translationAvailable;
    }
}

function installLanguageProfileControlSync(form: HTMLFormElement): void {
    if (form.dataset.languageProfileControlSync === 'true') return;
    form.dataset.languageProfileControlSync = 'true';
    form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')?.addEventListener('change', () => {
        syncLanguageProfileControls(form, getFormInterfaceLanguage(form, 'en'));
    });
}

function learnerLanguageByIdOrNull(value: string): ReturnType<typeof learnerLanguageById> | null {
    try {
        return learnerLanguageById(value as LearnerLanguageId);
    } catch {
        return null;
    }
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
    ['[data-grading-provider-help]', 'apiGradingProviderHelp'],
    ['[data-subtitle-preview] .jpdb-subtitle-secondary', 'subtitlePreview'],
    ['[data-settings-preview-title]', 'preview'],
    ['[data-proxy-guide-summary]', 'audioProxyGuideSummary'],
    ['[data-proxy-guide-show]', 'show'],
    ['[data-proxy-guide-hide]', 'hide'],
    ['[data-cloud-settings-sync-title]', 'cloudSettingsSync'],
    ['[data-academy-account-title]', 'academyAccountSync'],
    ['[data-academy-pairing-code-label]', 'academyPairingCode'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];
const HIDE_GROUP_LEGEND_TEXT_KEYS = [
    ['[data-word-color-hide-groups]', 'hideColorFor'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];
const SETTINGS_ACTION_TEXT_KEYS = [
    ['[data-action="test-anki"]', 'testAnki'],
    ['[data-action="prepare-anki"]', 'prepareAnki'],
    ['[data-action="update-anki-model"]', 'updateAnkiModel'],
    ['[data-action="copy-newtab-url"]', 'copyAddress'],
    ['[data-newtab-url-link]', 'openNewTabPage'],
    ['[data-action="import-yomitan-settings"]', 'importSettings'],
    ['[data-action="export-reader-settings"]', 'exportSettings'],
    ['[data-action="import-yomitan-dictionary"]', 'importDictionaries'],
    ['[data-action="export-yomitan-dictionary"]', 'exportDictionaries'],
    ['[data-action="clear-local-dictionary-site-storage"]', 'clearLocalDictionarySiteStorage'],
    ['[data-action="connect-academy-account"]', 'academyAccountConnect'],
    ['[data-action="sync-academy-account"]', 'academyAccountSyncNow'],
    ['[data-action="create-academy-recovery-code"]', 'academyRecoveryCodeCreate'],
    ['[data-action="disconnect-academy-account"]', 'academyAccountDisconnect'],
    ['[data-action="audio-source-add"]', 'addAudioSource'],
    ['[data-action="cancel"]', 'cancel'],
] as const satisfies readonly (readonly [string, SettingsTextKey])[];
const HELP_LINK_PANEL_TEXT_KEYS = [
    ['[data-help-update-title]', 'versionAndUpdates'],
    ['[data-help-update-current]', 'currentYomuVersion'],
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
    HIDE_GROUP_LEGEND_TEXT_KEYS.forEach(([selector, key]) => {
        form.querySelector<HTMLElement>(`${selector} > legend`)?.replaceChildren(text(key));
    });
}

function replaceLocalTitle(form: HTMLFormElement, pattern: RegExp, value: string): void {
    const title = Array.from(form.querySelectorAll<HTMLElement>('.jpdb-reader-local-title'))
        .find(element => pattern.test(element.textContent ?? ''));
    title?.replaceChildren(value);
}

function localizeSettingsSelects(form: HTMLFormElement, language: InterfaceLanguage, text: SettingsText): void {
    localizeBasicSettingsSelects(form, language, text);
    localizeColorAndReaderSelects(form, text);
    localizeMediaSettingsSelects(form, text);
    localizeMiningSettingsSelects(form, text);
}

/**
 * Re-localize the interface-locale picker on a live language switch.
 *
 * `setSelectOptionLabels` cannot do this: the labels are not a fixed table any
 * more, the option list is grouped, and a blocked option's label is a locale
 * name plus a reason that has to move to the new interface language while the
 * `title` keeps the reason in the blocked locale's own language.
 */
function localizeInterfaceLocaleSelect(form: HTMLFormElement, language: InterfaceLanguage, text: SettingsText): void {
    const selectElement = namedFormControls(form, 'interfaceLanguage').find(
        (element): element is HTMLSelectElement => element instanceof HTMLSelectElement,
    );
    if (!selectElement) return;
    form.querySelectorAll<HTMLElement>('[data-interface-locale-group="ready"]')
        .forEach(group => group.setAttribute('label', text('interfaceLocalesReady')));
    form.querySelectorAll<HTMLElement>('[data-interface-locale-group="in-progress"]')
        .forEach(group => group.setAttribute('label', text('interfaceLocalesInProgress')));
    for (const option of Array.from(selectElement.options)) {
        if (option.value === 'auto') {
            option.textContent = text('automatic');
            continue;
        }
        const locale = INTERFACE_LOCALES.find(candidate => candidate.tag === option.value);
        if (!locale) continue;
        option.textContent = locale.available
            ? interfaceLocaleOptionLabel(locale)
            : `${interfaceLocaleOptionLabel(locale)} · ${text(interfaceLocaleBlockerCopyKey(locale))}`;
    }
    const note = form.querySelector<HTMLElement>('[data-interface-locale-note]');
    if (note) {
        const ready = INTERFACE_LOCALES.filter(locale => locale.available).length;
        note.textContent = `${formatUiText(language, 'interfaceLocaleReadyCount', { ready, total: INTERFACE_LOCALES.length })} ${text('interfaceLocaleBlockedNote')}`;
    }
}

function localizeBasicSettingsSelects(form: HTMLFormElement, language: InterfaceLanguage, text: SettingsText): void {
    localizeInterfaceLocaleSelect(form, language, text);
    form.querySelector<HTMLElement>('[data-theme-title]')?.replaceChildren(text('theme'));
    setSelectOptionLabels(form, 'popupMode', localizedOptions(text, POPUP_MODE_OPTIONS));
    setSelectOptionLabels(form, 'hoverPopupMode', localizedOptions(text, POPUP_MODE_OPTIONS));
    setSelectOptionLabels(form, 'popoverHeightMode', localizedOptions(text, POPOVER_HEIGHT_MODE_OPTIONS));
    setSelectOptionLabels(form, 'readerFontFamily', fontFamilyOptions(text));
    setSelectOptionLabels(form, 'popupFontFamily', fontFamilyOptions(text));
    setSelectOptionLabels(form, 'parserProvider', localizedOptions(text, PARSER_PROVIDER_OPTIONS));
    setSelectOptionLabels(form, 'newTabSource', newTabSourceOptions(text));
    setSelectOptionLabels(form, 'newTabJpdbReviewMode', localizedOptions(text, NEW_TAB_JPDB_REVIEW_MODE_OPTIONS));
    setSelectOptionLabels(form, 'newTabKanjiKeywordSource', kanjiKeywordSourceOptions(apiCredentialSettingsFromForm(form), text));
    setSelectOptionLabels(form, 'twoButtonReviews', localizedOptions(text, TWO_BUTTON_REVIEW_OPTIONS));
}

function localizeColorAndReaderSelects(form: HTMLFormElement, text: SettingsText): void {
    localizeColorSourceSelects(form, text);
    setSelectOptionLabels(form, 'appearancePreset', localizedOptions(text, APPEARANCE_PRESET_OPTIONS));
    setSelectOptionLabels(form, 'wordColorStates', localizedOptions(text, WORD_COLOR_STATE_OPTIONS));
    syncReadingAnnotationControls(form, text);
}

function localizeColorSourceSelects(form: HTMLFormElement, text: SettingsText): void {
    const options = colorSourceSelectOptions(text);
    COLOR_CHANNEL_FIELDS.forEach(([name]) => setSelectOptionLabels(form, name, options));
}

function localizeMediaSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'audioAutoPlayMode', localizedOptions(text, AUDIO_AUTO_PLAY_MODE_OPTIONS));
    setSelectOptionLabels(form, 'audioSelectionMode', localizedOptions(text, AUDIO_SELECTION_MODE_OPTIONS));
    setSelectOptionLabels(form, 'audioTtsMode', localizedOptions(text, AUDIO_TTS_MODE_OPTIONS));
    setSelectOptionLabels(form, 'immersionKitCategory', localizedOptions(text, IMMERSION_KIT_CATEGORY_OPTIONS));
    setSelectOptionLabels(form, 'immersionKitExampleSource', immersionKitExampleSourceOptions(text));
    setSelectOptionLabels(form, 'immersionKitSort', localizedOptions(text, IMMERSION_KIT_SORT_OPTIONS));
    localizeOcrSettingsSelects(form, text);
    setSelectOptionLabels(form, 'subtitleControlsMode', localizedOptions(text, SUBTITLE_CONTROLS_MODE_OPTIONS));
    setSelectOptionLabels(form, 'subtitleNativeDisplay', localizedOptions(text, NATIVE_SUBTITLE_DISPLAY_OPTIONS));
    setSelectOptionLabels(form, 'subtitleTranscriptPlacement', [
        ['right', text('right')],
        ['left', text('left')],
        ['bottom', text('bottom')],
    ]);
    setSelectOptionLabels(form, 'subtitleFontFamily', fontFamilyOptions(text));
}

function localizeOcrSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'ocrProvider', localizedOptions(text, OCR_PROVIDER_OPTIONS));
    setSelectOptionLabels(form, 'ocrOverlayTheme', localizedOptions(text, OCR_OVERLAY_THEME_OPTIONS));
    setSelectOptionLabels(form, 'ocrMaxImagesPerPage', localizedOptions(text, OCR_MAX_IMAGES_PER_PAGE_OPTIONS));
    setSelectOptionLabels(form, 'ocrMinImageArea', localizedOptions(text, OCR_MIN_IMAGE_AREA_OPTIONS));
    setSelectOptionLabels(form, 'ocrMaxImagePixels', localizedOptions(text, OCR_MAX_IMAGE_PIXELS_OPTIONS));
    setSelectOptionLabels(form, 'ocrEngine', ocrEngineOptions(text));
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
    form.querySelectorAll<HTMLElement>('[data-import-status]').forEach(importStatus => {
        if (/Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? '')) importStatus.textContent = text('dictionaryImportHelp');
    });
}

function localizeSettingsActions(form: HTMLFormElement, text: SettingsText): void {
    SETTINGS_ACTION_TEXT_KEYS.forEach(([selector, key]) => {
        form.querySelectorAll<HTMLElement>(selector).forEach(button => button.replaceChildren(text(key)));
    });
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.replaceChildren(text('save'));
    setExternalButtonLabel(form.querySelector<HTMLElement>('[data-academy-account-link]'), text('academyAccountManage'));
    const pairingCode = form.querySelector<HTMLInputElement>('[data-academy-pairing-code]');
    if (pairingCode) pairingCode.placeholder = text('academyPairingCodePlaceholder');
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
    localizeStudyStepEditor(form, text);
    localizeRecommendedDictionaryGroups(form, text);
    localizeRecommendedDictionaryDescriptions(form, text);
    localizeCatalogBrowseSection(form, text);
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
    form.querySelectorAll<HTMLElement>('[data-lookup-link-transport]').forEach(note => note.replaceChildren(text('plaintextHttpLink')));
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

function localizeStudyStepEditor(form: HTMLFormElement, text: SettingsText): void {
    form.querySelector<HTMLElement>('[data-study-step-editor-title]')?.replaceChildren(text('newTabStudySteps'));
    form.querySelector<HTMLElement>('[data-study-step-editor-help]')?.replaceChildren(text('newTabStudyStepsHelp'));
    form.querySelector<HTMLElement>('[data-study-step-head="enabled"]')?.replaceChildren(text('enabledHeader'));
    form.querySelector<HTMLElement>('[data-study-step-head="step"]')?.replaceChildren(text('newTabStudyStepHeader'));
    form.querySelector<HTMLElement>('[data-study-step-head="details"]')?.replaceChildren(text('detailsHeader'));
    form.querySelector<HTMLElement>('[data-study-step-head="order"]')?.replaceChildren(text('orderHeader'));
    form.querySelectorAll<HTMLElement>('[data-study-step-label-key]').forEach(element => {
        const key = element.dataset.studyStepLabelKey;
        if (isSettingsTextKey(key)) element.replaceChildren(text(key));
    });
    form.querySelectorAll<HTMLElement>('[data-study-step-help-key]').forEach(element => {
        const key = element.dataset.studyStepHelpKey;
        if (isSettingsTextKey(key)) element.replaceChildren(text(key));
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
    const labels: Record<RecommendedDictionaryCategory, string> = {
        terms: text('termDictionaries'),
        kanji: text('kanjiDictionaries'),
        pitch: text('pitchDictionaries'),
        pronunciation: text('pronunciationDictionaries'),
        frequency: text('frequencyDictionaries'),
    };
    form.querySelectorAll<HTMLElement>('[data-recommended-category]').forEach((title) => {
        const category = title.dataset.recommendedCategory as RecommendedDictionaryCategory | undefined;
        if (category && labels[category]) title.replaceChildren(labels[category]);
    });
}

/**
 * An explicit Japanese interface owns the whole dialog, so it wins here too.
 * Otherwise the panel keeps the learner's language: 'en' is also what 'auto'
 * falls back to, and letting that fall-back overwrite a Vietnamese reader's
 * chrome with English is exactly the regression this panel had.
 */
function localizeCatalogBrowseSection(form: HTMLFormElement, text: SettingsText): void {
    const section = form.querySelector<HTMLElement>('[data-catalog-browse]');
    if (!section) return;
    const interfaceLanguage = resolveUiLanguageFromText(text);
    const learnerLanguageId = learnerLanguageByIdOrNull(section.dataset.catalogBrowseLearnerLanguage ?? '')?.id ?? 'en';
    const japaneseInterface = interfaceLanguage === 'ja';
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const locale = japaneseInterface ? interfaceLanguage : learnerLanguage.runtimeLocale;
    const copy: CatalogBrowseCopy | undefined = japaneseInterface ? undefined : catalogBrowseCopy(learnerLanguageId);
    // The wrapper's lang/dir must describe the text actually rendered, or a
    // right-to-left learner keeps an RTL box around Japanese chrome.
    section.lang = locale;
    section.dir = japaneseInterface ? 'ltr' : learnerLanguage.direction;

    section.querySelector<HTMLElement>('[data-catalog-browse-title]')
        ?.replaceChildren(copy?.title ?? text('mirroredDictionaries'));
    section.querySelector<HTMLElement>('[data-catalog-browse-search-label]')
        ?.replaceChildren(copy?.searchLabel ?? text('mirroredDictionarySearch'));
    section.querySelector<HTMLElement>('[data-catalog-browse-empty]')
        ?.replaceChildren(copy?.noResults ?? text('mirroredDictionarySearchNoResults'));
    section.querySelectorAll<HTMLElement>('[data-catalog-browse-category]').forEach((title) => {
        const category = title.dataset.catalogBrowseCategory as DictionaryCategory | undefined;
        if (!category) return;
        const label = copy
            ? copy.categories[category]
            : text(CATALOG_BROWSE_CATEGORY_TEXT_KEYS[category]);
        if (label) title.replaceChildren(label);
    });
    // The shelf headings name languages, so they follow the panel's locale like
    // every other string here — a Vietnamese reader must not meet "Cantonese".
    section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]').forEach((shelf) => {
        const language = shelf.dataset.catalogBrowseLanguage;
        if (!language) return;
        const languageName = headwordLanguageName(language, locale);
        shelf.querySelector<HTMLElement>('[data-catalog-browse-language-title]')
            ?.replaceChildren(languageName);
        shelf.querySelector<HTMLElement>('[data-catalog-browse-language-note]')
            ?.replaceChildren(
                copy
                    ? catalogBrowseLanguageNote(copy, languageName)
                    : formatUiText(interfaceLanguage, 'mirroredDictionaryLanguageNote', { language: languageName }),
            );
    });
    let count = 0;
    let bytes = 0;
    section.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-item').forEach((item) => {
        const dictionary = findRecommendedDictionary(item.querySelector<HTMLElement>('[data-dictionary-id]')?.dataset.dictionaryId ?? '');
        if (!dictionary) return;
        count += 1;
        bytes += dictionary.bytes ?? 0;
        item.querySelector<HTMLElement>('.jpdb-reader-help')?.replaceChildren(catalogBrowseDescription(dictionary, locale));
    });
    const summaryTemplate = copy?.summary ?? uiText('ja', 'mirroredDictionariesSummary');
    section.querySelector<HTMLElement>('[data-catalog-browse-summary]')
        ?.replaceChildren(catalogBrowseSummaryText(summaryTemplate, locale, count, bytes));
    applyCatalogBrowseFilter(section, section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]')?.value ?? '');
}

function localizeRecommendedDictionaryDescriptions(form: HTMLFormElement, text: SettingsText): void {
    RECOMMENDED_JAPANESE_DICTIONARIES.forEach((dictionary) => {
        if (!dictionary.descriptionKey) return;
        const control = form.querySelector<HTMLElement>(`[data-dictionary-id="${dictionary.id}"]`);
        control?.closest<HTMLElement>('.jpdb-reader-recommended-item')?.querySelector<HTMLElement>('.jpdb-reader-help')?.replaceChildren(text(dictionary.descriptionKey));
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
    'apiCredential', 'apiCredentialJpdb', 'apiCredentialJiten', 'apiCredentialBunproLegacy', 'apiCredentialBunpro', 'apiCredentialWanikani', 'miningDeck', 'newTabJpdbDeck', 'neverForgetDeck', 'blacklistDeck',
    'jpdbMiningEnabled', 'bunproMiningEnabled', 'wanikaniReviewEnabled', 'yomuLocalSrsEnabled', 'addToForq', 'enableReviews', 'apiGradingProvider', 'jpdbPageEnhancementsEnabled', 'jpdbPageWordEnhancementsEnabled',
    'jpdbPageKanjiEnhancementsEnabled', 'popupMode', 'hoverPopupMode', 'stickyBottomSheet', 'popoverBackdropEnabled', 'popoverWidth',
    'popoverHeight', 'popoverHeightMode', 'readerFontFamily', 'popupFontFamily', 'popupFontWeight',
    'enableLogging', 'accentColor', 'newTabAnkiEnabled', 'newTabSource',
    'newTabJpdbReviewMode', 'corsProxyUrl', 'newTabKanjiKeywordSource', 'newTabParsingEnabled', 'newTabFrontSentenceEnabled',
    'newTabKanjiAutogradeEnabled', 'newTabKanjiAutoSubmit', 'newTabOfflineEnabled', 'newTabOfflineLimit', 'newTabDailyGoalMinutes', 'newTabKanjiUnlockEnabled', 'newTabStopAtBatchEnd', 'newTabSwipeReviews', 'newTabShortcutHintsEnabled', 'newTabUrl',
    'wordColorNew', 'wordColorLearning', 'wordColorKnown', 'wordColorDue', 'wordColorFailed',
    'wordColorIgnored', 'localDictionariesEnabled', 'parserProvider', 'pitchColorHeiban', 'pitchColorAtamadaka', 'pitchColorNakadaka', 'pitchColorOdaka',
    'pitchColorUnknown', 'wordHighlightColorSource', 'wordUnderlineColorSource', 'wordTextColorSource',
    'subtitleHighlightColorSource', 'subtitleUnderlineColorSource', 'subtitleTextColorSource', 'lookupOnClick',
    'popupLookupEnabled', 'lookupOnHover', 'lookupOnMiddleMouse', 'showFloatingButton', 'pageScanMode', 'appearancePreset', 'clampedRowReadings', 'wordColorStates', 'showPitchAccent', 'showLookupPillFrequency', 'suppressRedundantWordUi', 'sheetCloseButtonOnLeft',
    'audioEnabled', 'autoPlayAudio', 'suppressAutoAudioOnVideo', 'audioAutoPlayMode', 'audioEnableDefaultSources', 'audioFallbackChimeEnabled',
    'audioSelectionMode', 'audioTtsMode', 'audioTimeoutMs', 'immersionKitEnabled', 'immersionKitExampleSource',
    'nadeshikoApiKey', 'immersionKitShowTranslation', 'immersionKitRevealTranslationOnClick', 'immersionKitShowImages', 'immersionKitAutoPlayAudio',
    'immersionKitPlayOnHover', 'immersionKitPlayOnImageClick', 'immersionKitCategory', 'immersionKitSort', 'immersionKitLimit',
    'immersionKitMinLength', 'immersionKitMaxLength', 'immersionKitPlaybackRate', 'immersionKitExactMatch', 'ocrInteractionMode',
    'ocrShowTextOverlay', 'ocrVideoPauseFrames', 'ocrInvertDarkPanels', 'ocrProvider', 'ocrOverlayTheme', 'ocrMaxImagesPerPage', 'ocrMinImageArea',
    'ocrMaxImagePixels', 'ocrTextColor', 'ocrOutlineColor', 'ocrBackgroundOpacity',
    'ocrFontScale', 'ocrEndpointUrl', 'ocrEngine', 'subtitlePlayerEnabled', 'subtitleAutoDetect',
    'subtitleOverlayVisible', 'subtitleNativeDisplay', 'subtitleNativeBlurStrength', 'subtitleKaraokeMode', 'subtitleTranscriptVisible',
    'subtitlePausePanel', 'subtitleShadowAutoPause', 'subtitleTranscriptPlacement', 'subtitleTranscriptAutoScroll', 'subtitleTranscriptAutoScrollResumeSeconds', 'subtitleAutoCopyLine', 'subtitleCopyIncludeTranslation', 'subtitleMiningPause',
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
    ...HIDE_STATE_GROUP_CONTROL_LABELS,
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
let activeNamedControls: {
    form: HTMLFormElement;
    byName: Map<string, NamedFormControl[]>;
} | null = null;

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
    resetAnnotatedLabelText(label);
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
    resetAnnotatedLabelText(label);
    const container = directSettingsLabelTextContainer(label);
    if (container) {
        container.replaceChildren(text);
        return;
    }
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
}

// A label whose text was already wrapped into reader-word spans has no direct
// text node left; writing a new text node NEXT TO the still-annotated spans
// renders the label twice (ポップアップ表示ポップアップ表示). Restore plain
// text first — the next settings self-annotation pass re-annotates it.
function resetAnnotatedLabelText(label: Element): void {
    if (!(label instanceof HTMLElement) || !label.querySelector('.jpdb-reader-word')) return;
    unwrapReaderWords(label, {
        includeReaderRoot: true,
        excludeSelector: '.jpdb-reader-control-text-mirror .jpdb-reader-word, [data-settings-preview-lookup] .jpdb-reader-word',
    });
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

function setSelectOptionLabels(
    form: HTMLFormElement,
    name: string,
    options: Array<[string, string, string?]>,
): void {
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
    const text = settingsText(language);
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
        status.textContent = formatUiText(language, 'updateStatusIdle', {
            current: CURRENT_YOMU_VERSION,
        });
    }
    const duplicateStatus = panel.querySelector<HTMLElement>('[data-yomu-duplicate-status]');
    if (duplicateStatus) duplicateStatus.textContent = duplicateRuntimeStatusText(language);
    const updateFlow = detectYomuUpdateFlow();
    const updateNotes = panel.querySelector<HTMLElement>('[data-help-update-notes]');
    if (updateNotes) updateNotes.textContent = uiText(language, updateFlowNoteKey(updateFlow.kind));
    const updateLink = panel.querySelector<HTMLAnchorElement>('[data-help-link="update-userscript"]');
    if (updateLink) updateLink.href = updateFlow.url;
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
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const pressKeys = uiText(language, 'pressKeys');
    return `
        <div class="jpdb-reader-shortcut-group" data-review-scale="five" ${fivePointHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeNothing', text('gradeNothing'), settings.shortcuts.gradeNothing, pressKeys)}
            ${shortcutInput('shortcuts.gradeSomething', text('gradeSomething'), settings.shortcuts.gradeSomething, pressKeys)}
            ${shortcutInput('shortcuts.gradeHard', text('gradeHard'), settings.shortcuts.gradeHard, pressKeys)}
            ${shortcutInput('shortcuts.gradeOkay', text('gradeOkay'), settings.shortcuts.gradeOkay, pressKeys)}
            ${shortcutInput('shortcuts.gradeEasy', text('gradeEasy'), settings.shortcuts.gradeEasy, pressKeys)}
        </div>
        <div class="jpdb-reader-shortcut-group" data-review-scale="pass-fail" ${passFailHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeFail', text('gradeFail'), settings.shortcuts.gradeFail, pressKeys)}
            ${shortcutInput('shortcuts.gradePass', text('gradePass'), settings.shortcuts.gradePass, pressKeys)}
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
    const normalizedQuery = normalizeSearchQuery(query);
    if (searchInput && searchInput.value !== query) searchInput.value = query;
    form.dataset.settingsSearching = normalizedQuery ? 'true' : 'false';

    if (!normalizedQuery) {
        if (empty) empty.hidden = true;
        activateSettingsPanelWithoutClearingSearch(form, activeSettingsPanel(form));
        return;
    }

    let visibleCount = 0;
    getSettingsPanelFieldsets(form).forEach(fieldset => {
        const matches = normalizeSearchQuery(fieldset.textContent ?? '').includes(normalizedQuery);
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

/**
 * The definition-source editor is the SINGLE writer of one contiguous order.
 *
 * Every visible row (built-in source or imported terms/kanji dictionary) is
 * numbered by its index in the one sorted list `renderSourceRowsList` renders,
 * and the dictionaries with no row of their own -- frequency, pronunciation,
 * metadata -- continue that same numbering after the last visible row. They
 * used to submit their PERSISTED priority instead, which lived in a different
 * space (0, 1, 2 ...) and collided with the front of the visible list, so a
 * no-op open-and-save re-sorted `dictionaryPreferences` and teleported an
 * imported dictionary to the end. One space, so re-rendering the saved settings
 * reproduces the same numbers.
 */
export function renderDictionarySourceRows(settings: ReaderSettings): string {
    const rows = definitionSourceRows(settings);
    const showAlias = true;
    const visibleNames = new Set([
        ...rows.filter(row => row.removable).map(row => row.name),
    ]);
    const hiddenPreferences = settings.dictionaryPreferences.filter(preference => !visibleNames.has(preference.name));
    const hidden = hiddenPreferences.map((preference, hiddenIndex) => {
        const index = settings.dictionaryPreferences.indexOf(preference);
        const priority = rows.length + hiddenIndex;
        return `
            <input type="hidden" name="dictionaryPreferences.${index}.name" value="${escapeHtml(preference.name)}">
            <input type="hidden" name="dictionaryPreferences.${index}.alias" value="${escapeHtml(preference.alias)}">
            ${preference.enabled ? `<input type="hidden" name="dictionaryPreferences.${index}.enabled" value="on">` : ''}
            <input type="hidden" name="dictionaryPreferences.${index}.priority" value="${priority}">
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
        ${renderDefinitionTranslationControls(settings)}
    `;
    return `${renderSourceRowsList(rows, { sourceLabel: 'Definition source', countName: 'dictionaryPreferenceCount', countValue: settings.dictionaryPreferences.length, showAlias })}${metadataHelp}${hidden}${renderDefinitionTranslationControls(settings)}`;
}

function renderDefinitionTranslationControls(settings: ReaderSettings): string {
    const copy = multilingualSettingsCopy(settings.interfaceLanguage);
    const learnerLanguageId = activeLearnerLanguageId(settings);
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const translationAvailable = googleTranslationLanguageCapability(learnerLanguage.runtimeLocale).supported;
    const activeProfile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const enabled = new Set(activeProfile?.definitionTranslationProviderIds ?? []);
    const sources = definitionTranslationSources(settings);
    const visibleCount = translationAvailable
        ? sources.filter((source) => !source.definitionLanguages.includes(learnerLanguageId)).length
        : 0;
    return `
        <div class="jpdb-reader-settings-subsection jpdb-reader-definition-translation" data-definition-translation-controls>
            <div class="jpdb-reader-local-title" data-multilingual-copy="translationTitle">${escapeHtml(copy.translationTitle)}</div>
            <div class="jpdb-reader-help" data-multilingual-copy="translationHelp">${escapeHtml(copy.translationHelp)}</div>
            <input type="hidden" name="definitionTranslationControlsPresent" value="1">
            <div class="jpdb-reader-definition-translation-list">
                ${sources
                    .map((source) => {
                        const isNative = source.definitionLanguages.includes(learnerLanguageId);
                        const disabled = isNative || !translationAvailable;
                        return `
                        <label class="inline" data-definition-translation-row data-definition-languages="${escapeHtml(source.definitionLanguages.join(' '))}" ${disabled ? 'hidden' : ''}>
                            <input name="definitionTranslationProviderIds" type="checkbox" value="${escapeHtml(source.id)}" ${enabled.has(source.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                            <span>
                                <strong>${escapeHtml(source.name)}</strong>
                                <span aria-hidden="true"> — </span>
                                <span data-definition-translation-label>${escapeHtml(copy.translateAutomatically(learnerLanguage.nativeName))}</span>
                            </span>
                        </label>
                    `;
                    })
                    .join('')}
            </div>
            <div class="jpdb-reader-help" data-definition-translation-empty ${!translationAvailable || visibleCount ? 'hidden' : ''}>${escapeHtml(copy.translationEmpty)}</div>
            <div class="jpdb-reader-help" data-definition-translation-unavailable ${translationAvailable ? 'hidden' : ''}>${escapeHtml(copy.translationUnavailable)}</div>
        </div>
    `;
}

function definitionTranslationSources(settings: ReaderSettings): Array<{
    id: string;
    name: string;
    definitionLanguages: readonly string[];
}> {
    const seen = new Set<string>();
    return definitionSourceRows(settings)
        .filter((row) => DEFINITION_TRANSLATION_API_SOURCE_IDS.has(row.id) || row.removable)
        .filter((row) => {
            if (seen.has(row.id)) return false;
            seen.add(row.id);
            return true;
        })
        .map((row) => ({
            id: row.id,
            name: row.alias || row.name,
            definitionLanguages: definitionLanguagesForSource(row.id, row.name),
        }));
}

function definitionLanguagesForSource(id: string, name: string): readonly string[] {
    if (DEFINITION_TRANSLATION_API_SOURCE_IDS.has(id)) return ['en'];
    return CATALOG_DEFINITION_LANGUAGES.get(normalizeDictionaryIdentity(id))
        ?? CATALOG_DEFINITION_LANGUAGES.get(normalizeDictionaryIdentity(name))
        ?? [dictionaryDefinitionLanguage(name)];
}

function normalizeDictionaryIdentity(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase('en-US')
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}

export function renderKanjiSourceRows(settings: ReaderSettings): string {
    return renderSourceRowsList(kanjiSourceRows(settings), {
        sourceLabel: 'Kanji section',
        showAlias: true,
    });
}

export function renderLookupPillsEditor(
    settings: ReaderSettings,
    installed: YomitanDictionaryInfo[] = installedDictionariesFromPreferences(settings.dictionaryPreferences),
    targetLanguage = activeTargetLanguageId(settings),
): string {
    return renderDictionaryLookupLinkEditor(
        settings.dictionaryLookupLinks,
        installedFrequencyDictionaryPreferences(settings, installed),
        targetLanguage,
    );
}

function installedFrequencyDictionaryPreferences(settings: ReaderSettings, installed: YomitanDictionaryInfo[]): DictionaryPreference[] {
    const installedFrequencyNames = new Set(installed.filter(dictionary => dictionary.type === 'frequency').map(dictionary => dictionary.title));
    return settings.dictionaryPreferences.filter(preference => preference.type === 'frequency' && installedFrequencyNames.has(preference.name));
}

export function renderRecommendedDictionaries(
    installed: YomitanDictionaryInfo[],
    learnerLanguage: LearnerLanguageId = 'en',
    includeCatalogBrowse = true,
    targetLanguage: LearningTargetRosterId = 'ja',
): string {
    const groups: Array<[RecommendedDictionary['category'], string]> = [
        ['terms', 'Term dictionaries'],
        ['kanji', 'Kanji dictionaries'],
        ['pitch', 'Pitch dictionaries'],
        ['pronunciation', 'Pronunciation dictionaries'],
        ['frequency', 'Frequency dictionaries'],
    ];
    const catalogRecommendations = recommendedDictionariesForLanguageProfile(learnerLanguage, targetLanguage);

    return `
        ${renderCatalogRecommendationSeed(catalogRecommendations, installed, learnerLanguage, targetLanguage)}
        ${targetLanguage === 'ja' ? `
        <div class="jpdb-reader-recommended-title">Recommended Japanese dictionaries</div>
        <div class="jpdb-reader-help jpdb-reader-recommended-note" data-recommended-dictionary-help>${escapedUiText('en', 'dictionaryInstallQueueHelp')}</div>
        ${groups
            .map(([category, label]) => {
                const dictionaries = RECOMMENDED_JAPANESE_DICTIONARIES.filter((dictionary) => dictionary.category === category);
                if (!dictionaries.length) return '';
                return `
                <div class="jpdb-reader-recommended-group">
                    <div class="jpdb-reader-recommended-group-title" data-recommended-category="${category}">${escapeHtml(label)}</div>
                    ${dictionaries.map((dictionary) => renderRecommendedDictionary(dictionary, installed)).join('')}
                </div>
            `;
            })
            .join('')}` : ''}
        ${includeCatalogBrowse
            ? renderCatalogBrowseSection(
                catalogBrowseLanguageSectionsForLearnerLanguage(learnerLanguage, targetLanguage),
                installed,
                learnerLanguage,
            )
            : ''}
    `;
}

// Recommendations are the preselected starting point; the mirror holds far more.
// Everything else Yomu hosts is listed here so no dictionary is reachable only
// by knowing its URL. Over a hundred cards is a list nobody scrolls, so the
// panel carries its own filter — grouping alone does not make it searchable.
function renderCatalogBrowseSection(
    sections: readonly CatalogBrowseLanguageSection[],
    installed: YomitanDictionaryInfo[],
    learnerLanguageId: LearnerLanguageId,
): string {
    const groups = catalogBrowseSectionGroups(sections);
    const count = groups.reduce((total, group) => total + group.dictionaries.length, 0);
    if (!count) return '';
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const copy = catalogBrowseCopy(learnerLanguageId);
    const locale = learnerLanguage.runtimeLocale;
    return `
        <section class="jpdb-reader-catalog-browse" data-catalog-browse data-catalog-browse-learner-language="${escapeHtml(learnerLanguageId)}" lang="${escapeHtml(locale)}" dir="${learnerLanguage.direction}">
            <div class="jpdb-reader-recommended-title" data-catalog-browse-title>${escapeHtml(copy.title)}</div>
            <div class="jpdb-reader-help jpdb-reader-catalog-browse-summary" data-catalog-browse-summary>${escapeHtml(catalogBrowseSummaryText(copy.summary, locale, count, catalogBrowseTotalBytes(groups)))}</div>
            <div class="jpdb-reader-catalog-browse-search">
                <label>
                    <span class="jpdb-reader-settings-label-text" data-catalog-browse-search-label>${escapeHtml(copy.searchLabel)}</span>
                    <input type="search" data-catalog-browse-filter autocomplete="off" aria-controls="jpdb-reader-catalog-browse-results"${AUTOFILL_IGNORE_ATTRIBUTE_HTML}>
                </label>
            </div>
            <div id="jpdb-reader-catalog-browse-results" data-catalog-browse-results>
                ${sections.map(section => renderCatalogBrowseLanguage(section, copy, locale, installed)).join('')}
            </div>
            <div class="jpdb-reader-help" data-catalog-browse-empty role="status" aria-live="polite" hidden>${escapeHtml(copy.noResults)}</div>
        </section>
    `;
}

// A dictionary for a language the reader is not studying stays one scroll away
// instead of one URL away, but it is never mixed into the studied language's
// groups: it sits under its own language heading, with a line saying so.
function renderCatalogBrowseLanguage(
    section: CatalogBrowseLanguageSection,
    copy: CatalogBrowseCopy,
    locale: string,
    installed: YomitanDictionaryInfo[],
): string {
    const language = section.headwordLanguage;
    return `
        <div class="jpdb-reader-recommended-group jpdb-reader-catalog-browse-language" data-catalog-browse-language="${escapeHtml(language)}" data-catalog-browse-language-endonym="${escapeHtml(headwordLanguageEndonym(language))}"${section.isTargetLanguage ? ' data-catalog-browse-language-target' : ''}>
            <div class="jpdb-reader-recommended-title" data-catalog-browse-language-title>${escapeHtml(headwordLanguageName(language, locale))}</div>
            <div class="jpdb-reader-help" data-catalog-browse-language-note>${escapeHtml(catalogBrowseLanguageNote(copy, headwordLanguageName(language, locale)))}</div>
            ${section.groups
                .map(group => `
                    <div class="jpdb-reader-recommended-group" data-catalog-browse-group="${escapeHtml(group.category)}">
                        <div class="jpdb-reader-recommended-group-title" data-catalog-browse-category="${escapeHtml(group.category)}">${escapeHtml(copy.categories[group.category])}</div>
                        ${group.dictionaries.map(dictionary => renderRecommendedDictionary(dictionary, installed)).join('')}
                    </div>
                `)
                .join('')}
        </div>
    `;
}

const CATALOG_BROWSE_CATEGORY_TEXT_KEYS: Readonly<Record<DictionaryCategory, SettingsTextKey>> = {
    terms: 'termDictionaries',
    names: 'nameDictionaries',
    grammar: 'grammarDictionaries',
    kanji: 'kanjiDictionaries',
    frequency: 'frequencyDictionaries',
    pronunciation: 'pronunciationDictionaries',
    examples: 'exampleDictionaries',
    thesaurus: 'thesaurusDictionaries',
    encyclopedia: 'encyclopediaDictionaries',
    utility: 'utilityDictionaries',
};

function catalogBrowseSummaryText(template: string, locale: string, count: number, bytes: number): string {
    return template
        .replaceAll('{count}', localizedNumber(count, locale))
        .replaceAll('{size}', formatDictionaryBytes(bytes, locale));
}

function renderCatalogRecommendationSeed(
    dictionaries: readonly RecommendedDictionary[],
    installed: YomitanDictionaryInfo[],
    learnerLanguageId: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
): string {
    if (!dictionaries.length) return '';
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const messages = LOCALE_CATALOGS[learnerLanguageId].messages;
    const title = targetLanguage === 'ja'
        ? messages.recommendedDictionariesTitle
        : headwordLanguageName(targetLanguage, learnerLanguage.runtimeLocale);
    const size = completeDictionarySeedSize(dictionaries, learnerLanguage.runtimeLocale);
    const countAndSize = formatDictionaryCountAndSize(messages.dictionaryCountAndSize, dictionaries.length, size, learnerLanguage.runtimeLocale);
    return `
        <section class="jpdb-reader-recommended-group jpdb-reader-catalog-seed" data-catalog-recommendation-seed="${learnerLanguageId}" data-catalog-recommendation-target="${escapeHtml(targetLanguage)}" lang="${escapeHtml(learnerLanguage.runtimeLocale)}" dir="${learnerLanguage.direction}">
            <div class="jpdb-reader-catalog-seed-title">${escapeHtml(title)}</div>
            <div class="jpdb-reader-help jpdb-reader-catalog-seed-summary">${escapeHtml(countAndSize)}</div>
            ${dictionaries.map((dictionary) => renderRecommendedDictionary(dictionary, installed)).join('')}
        </section>
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
    const description = dictionary.description ?? (dictionary.descriptionKey ? uiText('en', dictionary.descriptionKey) : '');
    const catalogAttributes = dictionary.origin === 'catalog' ? ` data-catalog-recommendation="${escapeHtml(dictionary.catalogDictionaryId ?? '')}" data-learner-language="${escapeHtml(dictionary.learnerLanguage ?? '')}" data-target-language="${escapeHtml(dictionary.targetLanguage ?? '')}" data-headword-language="${escapeHtml(dictionary.headwordLanguage ?? '')}" data-definition-language="${escapeHtml(dictionary.definitionLanguage ?? '')}" data-translation-mode="${escapeHtml(dictionary.translationMode ?? '')}"${dictionary.sha256 ? ` data-sha256="${dictionary.sha256}"` : ''}` : '';
    return `
        <div class="jpdb-reader-recommended-item"${catalogAttributes}>
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml(dictionary.name)}</span>
                </div>
                <div class="jpdb-reader-help">${escapeHtml(description)}</div>
                <div class="jpdb-reader-recommended-status" data-recommended-dictionary-status role="status" aria-live="polite" hidden></div>
            </div>
            ${action}
        </div>
    `;
}

function completeDictionarySeedSize(dictionaries: readonly RecommendedDictionary[], locale: string): string | undefined {
    if (dictionaries.some((dictionary) => dictionary.bytes === undefined)) return undefined;
    const bytes = dictionaries.reduce((total, dictionary) => total + (dictionary.bytes ?? 0), 0);
    if (!bytes) return undefined;
    const megabytes = bytes / (1024 * 1024);
    const value = megabytes >= 1 ? megabytes : bytes / 1024;
    const unit = megabytes >= 1 ? 'MB' : 'KB';
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

function formatDictionaryCountAndSize(template: string, count: number, size: string | undefined, locale: string): string {
    const pluralStart = template.indexOf('{count, plural,');
    if (pluralStart < 0) {
        return size ? template.replace('{count}', localizedNumber(count, locale)).replace('{size}', size) : localizedNumber(count, locale);
    }
    const pluralEnd = matchingBraceIndex(template, pluralStart);
    if (pluralEnd < 0) return localizedNumber(count, locale);
    const branchSource = template.slice(pluralStart + '{count, plural,'.length, pluralEnd);
    const branches = new Map(Array.from(branchSource.matchAll(/(=?[a-z0-9]+)\s*\{([^{}]*)\}/giu), (match) => [match[1], match[2]]));
    const exact = branches.get(`=${count}`);
    const pluralCategory = pluralCategoryForCount(count, locale);
    const branch = exact ?? branches.get(pluralCategory) ?? branches.get('other') ?? String(count);
    const countText = branch.replaceAll('#', localizedNumber(count, locale));
    if (!size) return `${template.slice(0, pluralStart)}${countText}`.trim();
    return `${template.slice(0, pluralStart)}${countText}${template.slice(pluralEnd + 1)}`.replace('{size}', size).trim();
}

function matchingBraceIndex(value: string, start: number): number {
    let depth = 0;
    for (let index = start; index < value.length; index += 1) {
        if (value[index] === '{') depth += 1;
        if (value[index] !== '}') continue;
        depth -= 1;
        if (depth === 0) return index;
    }
    return -1;
}

function pluralCategoryForCount(count: number, locale: string): Intl.LDMLPluralRule {
    try {
        return new Intl.PluralRules(locale).select(count);
    } catch {
        return new Intl.PluralRules('en').select(count);
    }
}

function localizedNumber(value: number, locale: string): string {
    try {
        return new Intl.NumberFormat(locale).format(value);
    } catch {
        return new Intl.NumberFormat('en').format(value);
    }
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
