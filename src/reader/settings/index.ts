import { Logger } from '../app/logger';
import { ACADEMY_SRS_LABEL, FURIGANA_HIDE_STATE_GROUPS, WORD_COLOR_HIDE_STATE_GROUPS } from '../app/constants';
import { publishSettingsChange } from './settings-change-bus';
import { DEFAULT_PITCH_COLOR_TOKENS, DEFAULT_WORD_COLOR_TOKENS, OVERLAY_COLOR_TOKENS } from '../theme/color-tokens';
import { normalizeAnkiFieldMappings } from './anki-field-mappings';
import { combinedApiCredentialLabel, hasBunproFrontendCredential, hasJitenApiCredential, hasJpdbApiCredential, isBunproFrontendCredentialExpired } from './api-credential';
import { accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, DEFAULT_ACCENT_COLOR, DEFAULT_OCR_BACKGROUND_COLOR, DEFAULT_OCR_BACKGROUND_OPACITY, DEFAULT_OCR_OUTLINE_COLOR, DEFAULT_OCR_TEXT_COLOR, sanitizeAccentColor } from './color-settings';
import { DEFAULT_DICTIONARY_LOOKUP_LINKS, normalizeDictionaryLookupLinkSettings, normalizeDictionaryPreferences } from './dictionary';
import {
    applySettingsIntent,
    clearSettingsIntent,
    coupledIntentKeys,
    NO_EXPLICIT_USER_CHOICE,
    recordSettingsIntent,
    SETTINGS_INTENT_LEDGER_STORAGE_KEY,
} from './intent-ledger';
import { createDefaultSubtitleSettings } from './subtitle-defaults';
import { hasOwn, stringValue, trimmedText } from './values';
import { normalizeLanguageProfileSettings } from './language-profile-settings-normalization';
import { normalizeLearningTargetChosen } from './learning-target-choice';
import { EXPLICIT_USER_SETTINGS_STORAGE_KEY, persistSettingsStorageTransaction, readSettingsIntentLedgerForWrite, readSettingsPersistenceViewStrictFrom, SETTINGS_PERSISTENCE_STORAGE_LEASE, SETTINGS_STORAGE_KEY } from './settings-persistence-transaction';
import { RETIRED_SETTINGS_STORAGE_KEYS } from './settings-authority-storage-keys';
import { gmStorageDelete, gmStorageGetSharedStrict, gmStorageGetStrict, isHostedYomuOrigin, storedValueExists, subscribeToStoredValueChanges, withGmStorageLease } from '../app/storage';
import { authoritativePreferredJapaneseSiteLanguage, persistPreferredJapaneseSiteLanguageWithSettings, PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY } from './site-language-intent';
export { changedSettingsKeys } from './store-reconciliation';
import { beginManagedStateReset, endManagedStateReset } from '../app/managed-state-registry';
import { audioSubSourceNameKey } from '../audio/source-resolution';
import {
    DEFAULT_AUDIO_SOURCES,
    DEFAULT_AUDIO_URL,
    isAudioSourceType,
} from './audio-source-defaults';
import {
    activeLanguageProfile,
    createDefaultLanguageProfile,
    DEFAULT_LANGUAGE_PROFILE_ID,
} from '../languages/profiles';
import { learningTargetRosterIdForTag, SLICE1_TARGET_LANGUAGE } from '../languages/roster';
import { isTargetDefaultOcrLanguageTag } from '../languages/resolve';
import type { AnkiTemplateMode, AudioAutoPlayMode, AudioSourceSetting, AudioSubSourceSetting, AudioTtsMode, FuriganaMode, ImmersionExampleSource, ImmersionKitCategory, ImmersionKitSort, InterfaceLanguage, OcrOverlayTheme, OcrProvider, ReaderColorSource, ReaderSettings } from '../app/types';
export { formatShortcutEvent, matchesShortcut, shortcutIsPressed } from './shortcuts';
export { accentToRgba, accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, sanitizeAccentColor } from './color-settings';
export { COPY_LOOKUP_LINK, MAX_EXTRA_LOOKUP_LINKS, MAX_LOOKUP_LINK_ROWS, defaultDictionaryLookupLinks, defaultLookupLinkMode, dictionaryLookupLinksForTarget, mergeDictionaryPreferences, normalizeDictionaryLookupLinks, normalizeDictionaryPreferences, retireStaleDictionaryPreferences } from './dictionary';
export { NO_EXPLICIT_USER_CHOICE } from './intent-ledger';
export { AUDIO_SOURCE_UI_TYPE_VALUES, DEFAULT_AUDIO_SOURCES } from './audio-source-defaults';
export { EXPLICIT_USER_SETTINGS_STORAGE_KEY, SETTINGS_STORAGE_KEY };
export { PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY };
/** The canonical key is the only settings source. Retired keys are purge-only. */
export const SETTINGS_STORAGE_KEYS = [SETTINGS_STORAGE_KEY] as const;
const log = Logger.scope('Settings');
let settingsResetInProgress = false;

export const DEFAULT_OVERLAY_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
export const DEFAULT_OVERLAY_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;
export const DEFAULT_OVERLAY_BACKGROUND_COLOR = OVERLAY_COLOR_TOKENS.background;
export const DEFAULT_READER_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DEFAULT_POPUP_FONT_FAMILY = '"Nunito Sans", "Extra Sans JP", "Noto Sans Symbols2", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans GB", "Meiryo", sans-serif';

const DEFAULT_WORD_COLORS = DEFAULT_WORD_COLOR_TOKENS;

const DEFAULT_PITCH_COLORS = DEFAULT_PITCH_COLOR_TOKENS;

export const AUDIO_GUIDE_URL = 'https://yomitan.wiki/advanced/#audio';

export function isPopupLookupEnabled(settings: Pick<
    ReaderSettings,
    'popupActivationMode' | 'lookupOnClick' | 'lookupOnHover' | 'lookupOnMiddleMouse'
>): boolean {
    return settings.popupActivationMode !== 'off'
        && (settings.lookupOnClick || settings.lookupOnHover || settings.lookupOnMiddleMouse);
}

const READER_COLOR_SOURCES = new Set<ReaderColorSource>(['auto', 'status', 'jpdb', 'anki', 'pitch', 'off']);
const EXPLICIT_FURIGANA_MODES = new Set<FuriganaMode>(['all', 'difficult-kanji', 'known-status', 'hover']);
type ReaderColorChannelKey =
    | 'wordHighlightColorSource'
    | 'wordUnderlineColorSource'
    | 'wordTextColorSource'
    | 'subtitleHighlightColorSource'
    | 'subtitleUnderlineColorSource'
    | 'subtitleTextColorSource';
type NumberSettingRange = { min: number; max: number };
type ConcreteReaderColorSource = Exclude<ReaderColorSource, 'auto'>;
type AccentColorSettingKey = Extract<keyof ReaderSettings, string>;

const DEFAULT_COLOR_CHANNELS: Record<ReaderColorChannelKey, ConcreteReaderColorSource> = {
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'anki',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'anki',
};
const KANJI_BOOLEAN_SETTING_KEYS = [
    'jpdbKanjiEnabled',
    'kanjiImmersionKitEnabled',
    'wanikaniKanjiEnabled',
] as const;
const LOOKUP_PAGE_ENHANCEMENT_KEYS = [
    'jpdbPageEnhancementsEnabled',
    'jpdbPageWordEnhancementsEnabled',
    'jpdbPageKanjiEnhancementsEnabled',
] as const;
const API_DEFINITION_BOOLEAN_SETTING_KEYS = [
    'jpdbDefinitionsEnabled',
    'jitenDefinitionsEnabled',
    'bunproDefinitionsEnabled',
    'wanikaniDefinitionsEnabled',
] as const;
const API_DEFINITION_NUMBER_SETTING_RANGES = {
    jpdbDefinitionsPriority: { min: 0, max: 999 },
    jitenDefinitionsPriority: { min: 0, max: 999 },
    bunproDefinitionsPriority: { min: 0, max: 999 },
    wanikaniDefinitionsPriority: { min: 0, max: 999 },
} as const;
const SOURCE_ALIAS_SETTING_KEYS = [
    'jpdbDefinitionsAlias',
    'jitenDefinitionsAlias',
    'bunproDefinitionsAlias',
    'wanikaniDefinitionsAlias',
    'jpdbKanjiAlias',
    'kanjiImmersionKitAlias',
    'wanikaniKanjiAlias',
    'rtkAlias',
    'kanjivgAlias',
    'kanjiOriginsAlias',
    'kanjiDictionariesAlias',
    'immersionKitAlias',
    'ankiSectionAlias',
    'studyTranslationAlias',
    'studyGrammarAlias',
] as const satisfies readonly (keyof ReaderSettings)[];
const MINING_BOOLEAN_SETTING_KEYS = [
    'jpdbMiningEnabled',
    'bunproMiningEnabled',
    'wanikaniReviewEnabled',
    'yomuLocalSrsEnabled',
    'dictionarySourcesInitiallyExpanded',
] as const;
const SUBTITLE_BOOLEAN_SETTING_KEYS = [
    'subtitleOverlayVisibleChosen',
    'subtitleSecondaryVisibleChosen',
    'subtitleNativeBlurred',
    'subtitleKaraokeMode',
    'subtitlePausePanel',
    'subtitleShadowAutoPause',
    'subtitleAutoCopyLine',
    'subtitleCopyIncludeTranslation',
    'subtitleMiningPause',
    'subtitleHoverPause',
] as const;
const ANKI_STUDY_BOOLEAN_SETTING_KEYS = [
    'ankiFrontReading',
    'ankiFrontSentence',
    'ankiFrontImage',
    'ankiMobileHandoff',
    'studyTranslationEnabled',
    'studyGrammarEnabled',
    'enableLogging',
] as const;
const ANKI_STUDY_NUMBER_SETTING_RANGES = {
    ankiSectionPriority: { min: 0, max: 999 },
    studyTranslationPriority: { min: 0, max: 999 },
    studyGrammarPriority: { min: 0, max: 999 },
} as const;
const KANJI_NUMBER_SETTING_RANGES = {
    jpdbKanjiPriority: { min: 0, max: 999 },
    kanjiImmersionKitPriority: { min: 0, max: 999 },
    wanikaniKanjiPriority: { min: 0, max: 999 },
    rtkPriority: { min: 0, max: 999 },
    kanjivgPriority: { min: 0, max: 999 },
    kanjiOriginsPriority: { min: 0, max: 999 },
    kanjiDictionariesPriority: { min: 0, max: 999 },
    similarKanjiWordsPriority: { min: 0, max: 999 },
    similarKanjiWordLimit: { min: 2, max: 24 },
} as const;
const READER_ACCENT_COLOR_SETTING_KEYS = [
    'wordColorNew',
    'wordColorLearning',
    'wordColorKnown',
    'wordColorDue',
    'wordColorFailed',
    'wordColorIgnored',
    'pitchColorHeiban',
    'pitchColorAtamadaka',
    'pitchColorNakadaka',
    'pitchColorOdaka',
    'pitchColorUnknown',
] as const satisfies readonly AccentColorSettingKey[];
const ANKI_TEMPLATE_MODES = ['context', 'recognition'] as const satisfies readonly AnkiTemplateMode[];
const INTERFACE_LANGUAGES = ['en', 'ja', 'auto'] as const satisfies readonly InterfaceLanguage[];
const THEMES = ['dark', 'light', 'auto'] as const satisfies readonly ReaderSettings['theme'][];
const POPUP_MODES = ['sheet', 'popover', 'auto'] as const satisfies readonly ReaderSettings['popupMode'][];
const HOVER_POPUP_MODES = ['sheet', 'popover', 'auto'] as const satisfies readonly ReaderSettings['hoverPopupMode'][];
const POPOVER_HEIGHT_MODES = ['fixed', 'available'] as const satisfies readonly ReaderSettings['popoverHeightMode'][];
const AUDIO_AUTO_PLAY_MODES = ['off', 'all', 'hover', 'tap'] as const satisfies readonly AudioAutoPlayMode[];
const AUDIO_TTS_MODES = ['source-order', 'fallback'] as const satisfies readonly AudioTtsMode[];
const IMMERSION_KIT_CATEGORIES = ['anime', 'drama', 'games', 'all'] as const satisfies readonly ImmersionKitCategory[];
const IMMERSION_KIT_SORTS = ['sentence_length:desc', 'sentence_length:asc'] as const satisfies readonly ImmersionKitSort[];
const IMMERSION_EXAMPLE_SOURCES = ['nadeshiko', 'combined', 'immersion-kit'] as const satisfies readonly ImmersionExampleSource[];
const OCR_OVERLAY_THEMES = ['auto', 'dark', 'light'] as const satisfies readonly OcrOverlayTheme[];
const SUBTITLE_CONTROL_MODES = ['always', 'hidden', 'auto'] as const satisfies readonly ReaderSettings['subtitleControlsMode'][];
const SUBTITLE_TRANSCRIPT_PLACEMENTS = ['left', 'bottom', 'right'] as const satisfies readonly ReaderSettings['subtitleTranscriptPlacement'][];
const NEW_TAB_SOURCES = ['jpdb', 'bunpro', 'wanikani', 'yomu-local', 'anki', 'auto', 'dictionary'] as const satisfies readonly ReaderSettings['newTabSource'][];
const NEW_TAB_JPDB_REVIEW_MODES = ['auto', 'api-vocabulary', 'live-review'] as const satisfies readonly ReaderSettings['newTabJpdbReviewMode'][];
const NEW_TAB_KANJI_KEYWORD_SOURCES = ['auto', 'rtk', 'jpdb', 'local'] as const satisfies readonly ReaderSettings['newTabKanjiKeywordSource'][];
const NEW_TAB_TYPE_WORD_INPUT_MODES = ['keyboard', 'handwriting'] as const satisfies readonly ReaderSettings['newTabTypeWordInputMode'][];

export const DEFAULT_SETTINGS: ReaderSettings = {
    apiKey: '',
    jitenApiKey: '',
    bunproApiKey: '',
    bunproFrontendApiToken: '',
    bunproFrontendApiTokenExpiresAt: '',
    wanikaniApiToken: '',
    onboardingSeen: false,
    learningTargetChosen: false,
    interfaceLanguage: 'en',
    languageProfiles: [createDefaultLanguageProfile()],
    activeLanguageProfileId: DEFAULT_LANGUAGE_PROFILE_ID,
    accentColor: DEFAULT_ACCENT_COLOR,
    wordColorNew: DEFAULT_WORD_COLORS.new,
    wordColorLearning: DEFAULT_WORD_COLORS.learning,
    wordColorKnown: DEFAULT_WORD_COLORS.known,
    wordColorDue: DEFAULT_WORD_COLORS.due,
    wordColorFailed: DEFAULT_WORD_COLORS.failed,
    wordColorIgnored: DEFAULT_WORD_COLORS.ignored,
    pitchColorHeiban: DEFAULT_PITCH_COLORS.heiban,
    pitchColorAtamadaka: DEFAULT_PITCH_COLORS.atamadaka,
    pitchColorNakadaka: DEFAULT_PITCH_COLORS.nakadaka,
    pitchColorOdaka: DEFAULT_PITCH_COLORS.odaka,
    pitchColorUnknown: DEFAULT_PITCH_COLORS.unknown,
    ...DEFAULT_COLOR_CHANNELS,
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsAlias: '',
    jpdbDefinitionsPriority: 1,
    jitenDefinitionsEnabled: true,
    jitenDefinitionsAlias: '',
    jitenDefinitionsPriority: 0,
    bunproDefinitionsEnabled: true,
    bunproDefinitionsAlias: '',
    bunproDefinitionsPriority: 2,
    wanikaniDefinitionsEnabled: true,
    wanikaniDefinitionsAlias: '',
    wanikaniDefinitionsPriority: 3,
    jpdbPageEnhancementsEnabled: true,
    jpdbPageWordEnhancementsEnabled: true,
    jpdbPageKanjiEnhancementsEnabled: true,
    jpdbKanjiEnabled: true,
    jpdbKanjiAlias: '',
    jpdbKanjiPriority: 10,
    kanjiImmersionKitEnabled: true,
    kanjiImmersionKitAlias: '',
    kanjiImmersionKitPriority: 60,
    wanikaniKanjiEnabled: true,
    wanikaniKanjiAlias: '',
    wanikaniKanjiPriority: 55,
    rtkEnabled: true,
    rtkAlias: '',
    rtkPriority: 20,
    kanjivgEnabled: true,
    kanjivgAlias: '',
    kanjivgPriority: 0,
    kanjiOriginsEnabled: true,
    kanjiOriginsAlias: '',
    kanjiOriginsPriority: 30,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginGraphEnabled: true,
    kanjiOriginRadicalImagesEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordsPriority: 40,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: true,
    suppressAutoAudioOnVideo: true,
    audioAutoPlayMode: 'all',
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioFallbackChimeEnabled: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    audioTtsMode: 'fallback',
    immersionKitEnabled: true,
    immersionKitAlias: '',
    immersionKitExampleSource: 'immersion-kit',
    nadeshikoApiKey: '',
    immersionKitPriority: 80,
    immersionKitLimitEnabled: false,
    immersionKitLimit: 12,
    immersionKitMinLength: 8,
    immersionKitMaxLength: 80,
    immersionKitCategory: 'all',
    immersionKitSort: 'sentence_length:asc',
    immersionKitExactMatch: false,
    immersionKitShowTranslation: true,
    immersionKitRevealTranslationOnClick: true,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlayOnHover: true,
    immersionKitPlayOnImageClick: true,
    immersionKitPlaybackRate: 1,
    lookupOnClick: true,
    lookupOnHover: true,
    lookupOnMiddleMouse: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 80,
    popupActivationMode: 'hover',
    scanModifierKey: 'shift',
    showFloatingButton: true,
    newTabAnkiEnabled: false,
    newTabAnkiDisabledDecks: [],
    newTabSource: 'auto',
    newTabJpdbDeck: 'all',
    newTabJpdbReviewMode: 'auto',
    corsProxyUrl: '',
    newTabKanjiKeywordSource: 'auto',
    newTabParsingEnabled: true,
    newTabFrontSentenceEnabled: true,
    newTabOfflineEnabled: true,
    newTabOfflineLimit: 50,
    newTabDailyGoalMinutes: 60,
    newTabKanjiUnlockEnabled: true,
    newTabStopAtBatchEnd: false,
    newTabSwipeReviews: true,
    newTabShortcutHintsEnabled: true,
    newTabKanjiAutogradeEnabled: true,
    newTabTypeWordInputMode: 'keyboard',
    puckPositionX: undefined,
    puckPositionY: undefined,
    manualScanEnabled: false,
    annotationsPaused: false,
    showFurigana: true,
    // A11: 'difficult-kanji' hides readings by a fixed easy-kanji list
    // (EASY_FURIGANA_KANJI), so a bare kanji told the learner nothing about
    // their own knowledge and the page read as half-annotated. Every parsed
    // word gets its reading until someone chooses otherwise.
    furiganaMode: 'all',
    clampedRowReadings: 'show',
    puckFuriganaModeBeforeHide: '',
    furiganaHiddenStateGroups: ['known', 'due', 'failed'],
    wordColorStates: 'all',
    wordColorHiddenStateGroups: [],
    showPitchAccent: true,
    showLookupPillFrequency: true,
    suppressRedundantWordUi: false,
    sheetCloseButtonOnLeft: false,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrVideoPauseFrames: false,
    ocrShowTextOverlay: false,
    ocrOverlayTheme: 'auto',
    ocrProvider: 'google-lens',
    ocrEndpointUrl: '',
    ocrEngine: 'auto',
    ocrCloudVisionApiKey: '',
    // Empty means "follow the language being studied": every OCR provider
    // resolves this through `targetOcrLanguageTag`, which falls back to the
    // active learning target's own default. A literal here would pin a fresh
    // install to one language no matter which target it selected.
    ocrLanguage: '',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 45000,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrPrefetchPages: 2,
    ocrConcurrency: 3,
    ocrInvertDarkPanels: true,
    ocrTextColor: DEFAULT_OCR_TEXT_COLOR,
    ocrOutlineColor: DEFAULT_OCR_OUTLINE_COLOR,
    ocrBackgroundColor: DEFAULT_OCR_BACKGROUND_COLOR,
    ocrBackgroundOpacity: DEFAULT_OCR_BACKGROUND_OPACITY,
    ocrFontScale: 1,
    localDictionariesEnabled: true,
    parserProvider: 'local',
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    kanjiDictionariesAlias: '',
    kanjiDictionariesPriority: 30,
    dictionarySourcesInitiallyExpanded: true,
    dictionaryPreferences: [],
    // Numbered as normalization numbers them, so the defaults are already
    // normal and an untouched Save writes them back unchanged.
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link, priority) => ({ ...link, priority })),
    ...createDefaultSubtitleSettings(DEFAULT_READER_FONT_FAMILY),
    youtubeImmersionEnabled: true,
    youtubeImmersionEnabledChosen: false,
    youtubeShowFilterNotice: true,
    youtubeShowChannelRecommendations: true,
    youtubeShowChannelRecommendationsChosen: false,
    preferJapaneseSiteLanguage: false,
    // Keep Anki opt-in: fresh installs/factory resets cannot assume Anki exists, and the send button costs real space on mobile popups.
    ankiEnabled: false,
    ankiSectionEnabled: false,
    ankiSectionAlias: '',
    ankiSectionPriority: 90,
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiDeck: 'よむ',
    ankiModel: 'よむ Japanese',
    ankiTemplateMode: 'recognition',
    ankiFrontReading: true,
    ankiFrontSentence: true,
    ankiFrontImage: true,
    ankiMobileHandoff: false,
    studyTranslationEnabled: true,
    studyTranslationAlias: '',
    studyGrammarEnabled: true,
    studyGrammarAlias: '',
    enableLogging: false,
    ankiTags: 'yomu',
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    ankiFieldMappings: {},
    // Default TRUE: only stored records that PREDATE this key had a single
    // audio role and can hold a sentence-audio field in the word-audio slot.
    // 'auto' so the operating system's own light/dark choice wins until the
    // learner picks one. It was 'light', and because the hosted appearance boot
    // reads settings.theme BEFORE falling back to 'auto', that default made the
    // fallback unreachable: yomureader.com rendered its cream paper theme to
    // every first-time visitor whose OS asked for dark. Measured on the live
    // site with prefers-color-scheme: dark — colorScheme resolved to 'light'
    // and the body stayed white while the dark rules sat unused in the sheet.
    theme: 'auto',
    popupMode: 'auto',
    hoverPopupMode: 'popover',
    stickyBottomSheet: false,
    popoverBackdropEnabled: true,
    popoverWidth: 520,
    popoverHeight: 540,
    popoverHeightMode: 'fixed',
    readerFontFamily: DEFAULT_READER_FONT_FAMILY,
    popupFontFamily: DEFAULT_POPUP_FONT_FAMILY,
    popupFontWeight: 450,
    jpdbMiningEnabled: true,
    // JPDB parity: the credential is the real gate, so importing a Bunpro
    // token makes grading work without hunting for a second checkbox.
    bunproMiningEnabled: true,
    wanikaniReviewEnabled: true,
    yomuLocalSrsEnabled: true,
    apiGradingProvider: 'jiten',
    miningDeck: 'forq',
    autoMineOnReview: false,
    neverForgetDeck: 'never-forget',
    blacklistDeck: 'blacklist',
    addToForq: false,
    enableReviews: true,
    twoButtonReviews: false,
    studyTranslationPriority: 10,
    studyGrammarPriority: 20,
    shortcuts: {
        scanPage: 'Shift+J',
        hoverLookup: '',
        openSettings: 'Ctrl+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousLookupWord: 'Shift+ArrowLeft',
        nextLookupWord: 'Shift+ArrowRight',
        previousSubtitle: 'A',
        nextSubtitle: 'D',
        copySubtitle: 'Shift+C',
        toggleOcr: 'Shift+O',
        toggleSubtitleOverlay: 'Shift+H',
        toggleYoutubeImmersion: 'Shift+Y',
        scanImages: 'Shift+I',
        massReviewVisible: 'Shift+M',
        studyReveal: 'Space',
        studyRevealAlternate: 'Enter',
        studyUndo: 'U',
        studyPrevious: 'ArrowLeft',
        studyPreviousAlternate: 'P',
        studyNext: 'ArrowRight',
        studyNextAlternate: 'N',
        gradeNothing: '1',
        gradeSomething: '2',
        gradeHard: '3',
        gradeOkay: '4',
        gradeEasy: '5',
        gradeFail: '1',
        gradePass: '2',
    },
};

function mergeSettings(value: Partial<ReaderSettings> | null): ReaderSettings {
    const settingsValue = value;
    const audio = normalizeAudioSettings(settingsValue);
    const supportedSettings = stripUnsupportedSettings(settingsValue);
    const apiCredentials = normalizeApiCredentialSettings(settingsValue);
    const parserProvider = normalizeParserProvider(settingsValue);
    const dictionaryPreferences = normalizeDictionaryPreferences(settingsValue?.dictionaryPreferences);
    const languageProfileSettings = normalizeLanguageProfileSettings(
        settingsValue,
        parserProvider,
        dictionaryPreferences,
        {
            interfaceLanguage: DEFAULT_SETTINGS.interfaceLanguage,
            parserProvider: DEFAULT_SETTINGS.parserProvider,
        },
    );
    return {
        ...DEFAULT_SETTINGS,
        ...(supportedSettings ?? {}),
        ...apiCredentials,
        ...normalizeLookupSettings(settingsValue),
        ...normalizeNewTabSettings(settingsValue),
        ...normalizeReaderDisplaySettings(settingsValue),
        ...audio,
        ...normalizeMediaSettings(settingsValue),
        ...normalizeSubtitleSettings(settingsValue),
        ...normalizeKanjiSettings(settingsValue),
        ...normalizeAnkiAndStudySettings(settingsValue),
        ...normalizePresentationSettings(settingsValue),
        ...normalizeMiningSettings(settingsValue),
        ...normalizeSourceAliasSettings(settingsValue),
        ...normalizeRemovedDictionarySettings(settingsValue),
        // The pill row belongs to the TARGET, so it is normalized against the
        // profile's target rather than against Japanese. A fresh Spanish install
        // boots with the Spanish hotlink set; a Japanese one is untouched.
        dictionaryLookupLinks: normalizeDictionaryLookupLinkSettings(
            settingsValue,
            activeTargetRosterId(languageProfileSettings),
        ),
        ...languageProfileSettings,
        // v1.9.3 contract: a record that predates the field keeps the choice
        // its own Reader state implies (learning-target-choice.ts).
        learningTargetChosen: normalizeLearningTargetChosen(value),
        ...unpinnedOcrLanguage(settingsValue),
        preferJapaneseSiteLanguage: normalizePreferredJapaneseSiteLanguage(settingsValue),
        shortcuts: normalizeShortcutSettings(settingsValue),
    };
}

// The hidden OCR field was once pinned to the target's default tag on every
// save; v1.9.3 still read such a tag as "follow the study target".
function unpinnedOcrLanguage(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return isTargetDefaultOcrLanguageTag(value?.ocrLanguage) ? { ocrLanguage: '' } : {};
}

function normalizePreferredJapaneseSiteLanguage(value: Partial<ReaderSettings> | null): boolean {
    if (!value || !hasOwn(value, 'preferJapaneseSiteLanguage')) {
        return DEFAULT_SETTINGS.preferJapaneseSiteLanguage;
    }
    return typeof value.preferJapaneseSiteLanguage === 'boolean'
        ? value.preferJapaneseSiteLanguage
        : false;
}

function normalizeParserProvider(value: Partial<ReaderSettings> | null): ReaderSettings['parserProvider'] {
    const provider = value?.parserProvider;
    if (provider === 'local' || provider === 'jiten' || provider === 'jpdb' || provider === 'auto') return provider;
    return DEFAULT_SETTINGS.parserProvider;
}

export function normalizeReaderSettings(value: Partial<ReaderSettings> | null | undefined): ReaderSettings {
    return mergeSettings(value as Partial<ReaderSettings> | null);
}

/**
 * The roster ID of the target the normalized profiles point at.
 *
 * Reads the profiles this same normalization pass just produced rather than the
 * raw stored value, so a profile that was repaired or created here answers for
 * itself. Japanese is the fallback, which is what every install predating the
 * target picker is.
 */
function activeTargetRosterId(
    profileSettings: Pick<ReaderSettings, 'languageProfiles' | 'activeLanguageProfileId'>,
): string {
    const active = activeLanguageProfile(profileSettings.languageProfiles, profileSettings.activeLanguageProfileId);
    return learningTargetRosterIdForTag(active?.targetLanguage) ?? SLICE1_TARGET_LANGUAGE;
}

function normalizeApiCredentialSettings(value: Partial<ReaderSettings> | null | undefined): Pick<ReaderSettings, 'apiKey' | 'jitenApiKey' | 'bunproApiKey' | 'bunproFrontendApiToken' | 'bunproFrontendApiTokenExpiresAt' | 'wanikaniApiToken'> {
    const apiKey = trimmedStringSetting(value, 'apiKey', DEFAULT_SETTINGS.apiKey);
    const jitenApiKey = trimmedStringSetting(value, 'jitenApiKey', DEFAULT_SETTINGS.jitenApiKey);
    const bunproApiKey = trimmedStringSetting(value, 'bunproApiKey', DEFAULT_SETTINGS.bunproApiKey);
    const bunproFrontendApiToken = trimmedStringSetting(value, 'bunproFrontendApiToken', DEFAULT_SETTINGS.bunproFrontendApiToken);
    const bunproFrontendApiTokenExpiresAt = normalizeOptionalIsoDateString(value?.bunproFrontendApiTokenExpiresAt);
    const wanikaniApiToken = trimmedStringSetting(value, 'wanikaniApiToken', DEFAULT_SETTINGS.wanikaniApiToken);
    return { apiKey, jitenApiKey, bunproApiKey, bunproFrontendApiToken, bunproFrontendApiTokenExpiresAt, wanikaniApiToken };
}

function stripUnsupportedSettings(value: Partial<ReaderSettings> | null | undefined): Partial<ReaderSettings> | null {
    if (!value) return null;
    const supportedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => supportedKeys.has(key)),
    ) as Partial<ReaderSettings>;
}

function normalizeAudioSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    const settings = value ?? {};
    const hasSavedAudioSources = hasOwn(settings, 'audioSources');
    const audioSources = hasSavedAudioSources
        ? normalizeAudioSources(settings.audioSources)
        : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
    const audioAutoPlayMode = normalizeAudioAutoPlayMode(settings.audioAutoPlayMode);
    return {
        autoPlayAudio: audioAutoPlayMode === 'off' ? false : booleanSetting(value, 'autoPlayAudio'),
        suppressAutoAudioOnVideo: booleanSetting(value, 'suppressAutoAudioOnVideo'),
        audioAutoPlayMode,
        audioSources,
        audioSourceUrl: preferredAudioSourceUrl(audioSources),
        audioTtsMode: normalizeAudioTtsMode(settings.audioTtsMode),
    };
}

function preferredAudioSourceUrl(audioSources: AudioSourceSetting[]): string {
    return audioSources.find(source => source.url)?.url ?? DEFAULT_AUDIO_URL;
}

function normalizeShortcutSettings(value: Partial<ReaderSettings> | null): ReaderSettings['shortcuts'] {
    const shortcuts = { ...DEFAULT_SETTINGS.shortcuts };
    for (const key of Object.keys(shortcuts) as Array<keyof ReaderSettings['shortcuts']>) {
        const saved = value?.shortcuts?.[key];
        if (typeof saved === 'string') shortcuts[key] = saved;
    }
    return shortcuts;
}

function normalizeLookupSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        interfaceLanguage: normalizeInterfaceLanguage(value?.interfaceLanguage),
        ...normalizeBooleanSettingGroup(value, API_DEFINITION_BOOLEAN_SETTING_KEYS),
        ...normalizeDefinitionSourcePrioritySettings(value),
        ...normalizeBooleanSettingGroup(value, LOOKUP_PAGE_ENHANCEMENT_KEYS),
        lookupOnClick: booleanSettingWithFallback(value, 'lookupOnClick', true),
        lookupOnHover: booleanSettingWithFallback(value, 'lookupOnHover', value?.popupActivationMode !== 'click'),
        lookupOnMiddleMouse: booleanSettingWithFallback(value, 'lookupOnMiddleMouse', true),
        hoverOpenDelayMs: clampNumber(value?.hoverOpenDelayMs, 0, 1500, DEFAULT_SETTINGS.hoverOpenDelayMs),
        hoverCloseDelayMs: clampNumber(value?.hoverCloseDelayMs, 0, 3000, DEFAULT_SETTINGS.hoverCloseDelayMs),
    };
}

function normalizeDefinitionSourcePrioritySettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, 'jpdbDefinitionsPriority' | 'jitenDefinitionsPriority' | 'bunproDefinitionsPriority' | 'wanikaniDefinitionsPriority'> {
    return normalizeNumberSettingGroup(value, API_DEFINITION_NUMBER_SETTING_RANGES);
}

function normalizeSourceAliasSettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, typeof SOURCE_ALIAS_SETTING_KEYS[number]> {
    const aliases = {} as Pick<ReaderSettings, typeof SOURCE_ALIAS_SETTING_KEYS[number]>;
    for (const key of SOURCE_ALIAS_SETTING_KEYS) {
        aliases[key] = trimmedStringSetting(value, key, DEFAULT_SETTINGS[key]);
    }
    return aliases;
}

function normalizeRemovedDictionarySettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, 'jpdbDefinitionsEnabled' | 'localDictionariesEnabled' | 'dictionarySourcesInitiallyExpanded' | 'localDictionaryMaxResults' | 'localDictionaryShowKanji'> {
    return {
        jpdbDefinitionsEnabled: booleanSetting(value, 'jpdbDefinitionsEnabled'),
        localDictionariesEnabled: booleanSetting(value, 'localDictionariesEnabled'),
        dictionarySourcesInitiallyExpanded: booleanSetting(value, 'dictionarySourcesInitiallyExpanded'),
        localDictionaryMaxResults: DEFAULT_SETTINGS.localDictionaryMaxResults,
        localDictionaryShowKanji: booleanSetting(value, 'localDictionaryShowKanji'),
    };
}

function normalizeNewTabSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        newTabAnkiEnabled: booleanSetting(value, 'newTabAnkiEnabled'),
        newTabAnkiDisabledDecks: normalizeStringList(value?.newTabAnkiDisabledDecks),
        newTabSource: normalizeNewTabSource(value?.newTabSource),
        newTabJpdbDeck: normalizeDeckIdSetting(value?.newTabJpdbDeck, DEFAULT_SETTINGS.newTabJpdbDeck),
        newTabJpdbReviewMode: normalizeNewTabJpdbReviewMode(value?.newTabJpdbReviewMode),
        corsProxyUrl: normalizeCorsProxyUrl(value?.corsProxyUrl),
        newTabKanjiKeywordSource: normalizeNewTabKanjiKeywordSource(value?.newTabKanjiKeywordSource),
        newTabParsingEnabled: booleanSetting(value, 'newTabParsingEnabled'),
        newTabFrontSentenceEnabled: booleanSetting(value, 'newTabFrontSentenceEnabled'),
        newTabOfflineEnabled: booleanSetting(value, 'newTabOfflineEnabled'),
        newTabOfflineLimit: clampNumber(value?.newTabOfflineLimit, 0, 500, DEFAULT_SETTINGS.newTabOfflineLimit),
        newTabDailyGoalMinutes: clampNumber(value?.newTabDailyGoalMinutes, 0, 1440, DEFAULT_SETTINGS.newTabDailyGoalMinutes),
        newTabKanjiUnlockEnabled: booleanSetting(value, 'newTabKanjiUnlockEnabled'),
        newTabStopAtBatchEnd: booleanSetting(value, 'newTabStopAtBatchEnd'),
        newTabSwipeReviews: booleanSetting(value, 'newTabSwipeReviews'),
        newTabShortcutHintsEnabled: booleanSetting(value, 'newTabShortcutHintsEnabled'),
        newTabKanjiAutogradeEnabled: booleanSetting(value, 'newTabKanjiAutogradeEnabled'),
        newTabTypeWordInputMode: normalizeOption(value?.newTabTypeWordInputMode, NEW_TAB_TYPE_WORD_INPUT_MODES, DEFAULT_SETTINGS.newTabTypeWordInputMode),
    };
}


function normalizeReaderDisplaySettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    const settings = value ?? {};
    return {
        accentColor: sanitizeAccentColor(settings.accentColor),
        ...normalizeAccentColorSettings(settings, READER_ACCENT_COLOR_SETTING_KEYS),
        ...normalizeReaderColorChannelSettings(value),
        puckPositionX: normalizeOptionalCoordinate(settings.puckPositionX),
        puckPositionY: normalizeOptionalCoordinate(settings.puckPositionY),
        showFurigana: booleanSetting(value, 'showFurigana'),
        furiganaMode: normalizeFuriganaMode(settings.furiganaMode),
        clampedRowReadings: settings.clampedRowReadings === 'hover' ? 'hover' : 'show',
        puckFuriganaModeBeforeHide: isFuriganaMode(settings.puckFuriganaModeBeforeHide) && settings.puckFuriganaModeBeforeHide !== 'off'
            ? settings.puckFuriganaModeBeforeHide
            : '',
        furiganaHiddenStateGroups: normalizeFuriganaHiddenStateGroups(settings.furiganaHiddenStateGroups),
        wordColorStates: settings.wordColorStates === 'new-only' ? 'new-only' : 'all',
        wordColorHiddenStateGroups: normalizeWordColorHiddenStateGroups(settings.wordColorHiddenStateGroups),
        hideKnownFurigana: booleanSetting(value, 'hideKnownFurigana'),
    };
}

function normalizeAccentColorSettings<Key extends keyof ReaderSettings>(
    settings: Partial<ReaderSettings>,
    keys: readonly Key[],
): Pick<ReaderSettings, Key> {
    const normalized = {} as Pick<ReaderSettings, Key>;
    for (const key of keys) {
        normalized[key] = sanitizeAccentColor(settings[key], String(DEFAULT_SETTINGS[key])) as ReaderSettings[Key];
    }
    return normalized;
}

function normalizeKanjiSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        ...normalizeBooleanSettingGroup(value, KANJI_BOOLEAN_SETTING_KEYS),
        ...normalizeNumberSettingGroup(value, KANJI_NUMBER_SETTING_RANGES),
    };
}

function normalizeAnkiAndStudySettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    const settings = value ?? {};
    return {
        ankiSectionEnabled: normalizeAnkiSectionEnabled(value),
        ...normalizeNumberSettingGroup(value, ANKI_STUDY_NUMBER_SETTING_RANGES),
        ankiConnectUrl: normalizeUrl(settings.ankiConnectUrl, DEFAULT_SETTINGS.ankiConnectUrl),
        ankiDeck: normalizeAnkiName(settings.ankiDeck, DEFAULT_SETTINGS.ankiDeck),
        ankiModel: normalizeAnkiName(settings.ankiModel, DEFAULT_SETTINGS.ankiModel),
        ankiTemplateMode: normalizeAnkiTemplateMode(settings.ankiTemplateMode),
        ankiFieldMappings: normalizeAnkiFieldMappings(settings.ankiFieldMappings),
        ...normalizeBooleanSettingGroup(value, ANKI_STUDY_BOOLEAN_SETTING_KEYS),
    };
}

function normalizeAnkiSectionEnabled(value: Partial<ReaderSettings> | null): boolean {
    return booleanSetting(value, 'ankiSectionEnabled');
}

function normalizePresentationSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        theme: normalizeTheme(value?.theme),
        popupMode: normalizePopupMode(value?.popupMode),
        hoverPopupMode: normalizeHoverPopupMode(value?.hoverPopupMode),
        stickyBottomSheet: booleanSetting(value, 'stickyBottomSheet'),
        popoverBackdropEnabled: booleanSetting(value, 'popoverBackdropEnabled'),
        popoverWidth: clampNumber(value?.popoverWidth, 280, 900, DEFAULT_SETTINGS.popoverWidth),
        popoverHeight: clampNumber(value?.popoverHeight, 220, 900, DEFAULT_SETTINGS.popoverHeight),
        popoverHeightMode: normalizePopoverHeightMode(value?.popoverHeightMode),
        readerFontFamily: normalizeFontFamily(value?.readerFontFamily, DEFAULT_SETTINGS.readerFontFamily),
        popupFontFamily: normalizeFontFamily(value?.popupFontFamily, DEFAULT_SETTINGS.popupFontFamily),
        popupFontWeight: clampNumber(value?.popupFontWeight, 300, 900, DEFAULT_SETTINGS.popupFontWeight),
    };
}

function normalizeMiningSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        ankiTags: trimmedStringSetting(value, 'ankiTags', DEFAULT_SETTINGS.ankiTags),
        miningDeck: normalizeDeckIdSetting(value?.miningDeck, DEFAULT_SETTINGS.miningDeck),
        autoMineOnReview: typeof value?.autoMineOnReview === 'boolean' ? value.autoMineOnReview : DEFAULT_SETTINGS.autoMineOnReview,
        neverForgetDeck: normalizeDeckIdSetting(value?.neverForgetDeck, DEFAULT_SETTINGS.neverForgetDeck),
        blacklistDeck: normalizeDeckIdSetting(value?.blacklistDeck, DEFAULT_SETTINGS.blacklistDeck),
        apiGradingProvider: normalizeApiGradingProvider(value?.apiGradingProvider),
        ...normalizeBooleanSettingGroup(value, MINING_BOOLEAN_SETTING_KEYS),
    };
}

function normalizeApiGradingProvider(value: unknown): ReaderSettings['apiGradingProvider'] {
    if (value === 'jpdb') return 'jpdb';
    if (value === 'jiten') return 'jiten';
    if (value === 'bunpro') return 'bunpro';
    return DEFAULT_SETTINGS.apiGradingProvider;
}

function normalizeOptionalIsoDateString(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    const time = Date.parse(value.trim());
    return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function normalizeMediaSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    const settings = value ?? {};
    const ocrBackgroundOpacity = accessibleOcrBackgroundOpacity(settings.ocrBackgroundOpacity);
    const immersionExampleLimit = normalizeImmersionExampleLimitSettings(value);
    return {
        audioViaBlob: booleanSetting(value, 'audioViaBlob'),
        audioFallbackChimeEnabled: booleanSetting(value, 'audioFallbackChimeEnabled'),
        youtubeImmersionEnabled: booleanSetting(value, 'youtubeImmersionEnabled'),
        youtubeImmersionEnabledChosen: booleanSetting(value, 'youtubeImmersionEnabledChosen'),
        youtubeShowFilterNotice: booleanSetting(value, 'youtubeShowFilterNotice'),
        youtubeShowChannelRecommendations: booleanSetting(value, 'youtubeShowChannelRecommendations'),
        youtubeShowChannelRecommendationsChosen: booleanSetting(value, 'youtubeShowChannelRecommendationsChosen'),
        immersionKitExampleSource: normalizeImmersionExampleSource(settings.immersionKitExampleSource),
        nadeshikoApiKey: trimmedStringSetting(value, 'nadeshikoApiKey', DEFAULT_SETTINGS.nadeshikoApiKey),
        immersionKitPriority: clampNumber(settings.immersionKitPriority, 0, 999, DEFAULT_SETTINGS.immersionKitPriority),
        ...immersionExampleLimit,
        immersionKitMinLength: clampNumber(settings.immersionKitMinLength, 0, 120, DEFAULT_SETTINGS.immersionKitMinLength),
        immersionKitMaxLength: clampNumber(settings.immersionKitMaxLength, 0, 240, DEFAULT_SETTINGS.immersionKitMaxLength),
        immersionKitCategory: normalizeImmersionKitCategory(settings.immersionKitCategory),
        immersionKitSort: normalizeImmersionKitSort(settings.immersionKitSort),
        immersionKitPlaybackRate: clampNumber(settings.immersionKitPlaybackRate, 0.5, 2, DEFAULT_SETTINGS.immersionKitPlaybackRate),
        immersionKitRevealTranslationOnClick: booleanSetting(value, 'immersionKitRevealTranslationOnClick'),
        immersionKitPlayOnHover: booleanSetting(value, 'immersionKitPlayOnHover'),
        immersionKitPlayOnImageClick: booleanSetting(value, 'immersionKitPlayOnImageClick'),
        ocrProvider: normalizeOcrProvider(settings.ocrProvider),
        ocrOverlayTheme: normalizeOcrOverlayTheme(settings.ocrOverlayTheme),
        ocrEngine: normalizeOcrEngine(settings.ocrEngine),
        ocrCloudVisionApiKey: normalizeCloudVisionApiKey(settings.ocrCloudVisionApiKey),
        ocrTextColor: normalizeOcrTextColor(settings),
        ocrOutlineColor: normalizeOcrOutlineColor(settings),
        ocrBackgroundColor: accessibleOcrBackgroundColor(settings.accentColor, ocrBackgroundOpacity),
        ocrBackgroundOpacity,
        ocrFontScale: clampNumber(settings.ocrFontScale, 0.7, 1.8, DEFAULT_SETTINGS.ocrFontScale),
    };
}

function normalizeImmersionExampleLimitSettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, 'immersionKitLimitEnabled' | 'immersionKitLimit'> {
    return {
        immersionKitLimitEnabled: booleanSetting(value, 'immersionKitLimitEnabled'),
        immersionKitLimit: clampNumber(value?.immersionKitLimit, 1, 12, DEFAULT_SETTINGS.immersionKitLimit),
    };
}

function normalizeOcrTextColor(settings: Partial<ReaderSettings>): string {
    const color = sanitizeAccentColor(settings.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor);
    return color;
}

function normalizeOcrOutlineColor(settings: Partial<ReaderSettings>): string {
    const color = sanitizeAccentColor(settings.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor);
    return color;
}

function normalizeSubtitleSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        ...normalizeBooleanSettingGroup(value, SUBTITLE_BOOLEAN_SETTING_KEYS),
        subtitleControlsMode: normalizeSubtitleControlsMode(value?.subtitleControlsMode),
        subtitleTranscriptPlacement: normalizeSubtitleTranscriptPlacement(value?.subtitleTranscriptPlacement),
        subtitleTextColor: sanitizeAccentColor(value?.subtitleTextColor, DEFAULT_SETTINGS.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(value?.subtitleOutlineColor, DEFAULT_SETTINGS.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(value?.subtitleBackgroundColor, DEFAULT_SETTINGS.subtitleBackgroundColor),
        subtitleBackgroundOpacity: clampNumber(value?.subtitleBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.subtitleBackgroundOpacity),
        subtitleNativeBlurStrength: clampNumber(value?.subtitleNativeBlurStrength, 4, 20, DEFAULT_SETTINGS.subtitleNativeBlurStrength),
        subtitleFontFamily: normalizeFontFamily(value?.subtitleFontFamily, DEFAULT_SETTINGS.subtitleFontFamily),
        subtitleFontWeight: clampNumber(value?.subtitleFontWeight, 100, 900, DEFAULT_SETTINGS.subtitleFontWeight),
    };
}

function normalizeFontFamily(value: unknown, fallback: string): string {
    return trimmedText(value) || fallback;
}

function normalizeOptionalCoordinate(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .map(item => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean))];
}

function normalizeAnkiName(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed;
}

function normalizeAnkiTemplateMode(value: unknown): AnkiTemplateMode {
    return normalizeOption(value, ANKI_TEMPLATE_MODES, DEFAULT_SETTINGS.ankiTemplateMode);
}

export function normalizeInterfaceLanguage(value: unknown, fallback: InterfaceLanguage = DEFAULT_SETTINGS.interfaceLanguage): InterfaceLanguage {
    return normalizeOption(value, INTERFACE_LANGUAGES, fallback);
}

function normalizeTheme(value: unknown): ReaderSettings['theme'] {
    return normalizeOption(value, THEMES, DEFAULT_SETTINGS.theme);
}

function normalizePopupMode(value: unknown): ReaderSettings['popupMode'] {
    return normalizeOption(value, POPUP_MODES, DEFAULT_SETTINGS.popupMode);
}

function normalizeHoverPopupMode(value: unknown): ReaderSettings['hoverPopupMode'] {
    return normalizeOption(value, HOVER_POPUP_MODES, DEFAULT_SETTINGS.hoverPopupMode);
}

function normalizePopoverHeightMode(value: unknown): ReaderSettings['popoverHeightMode'] {
    return normalizeOption(value, POPOVER_HEIGHT_MODES, DEFAULT_SETTINGS.popoverHeightMode);
}

function normalizeAudioAutoPlayMode(value: unknown): AudioAutoPlayMode {
    return normalizeOption(value, AUDIO_AUTO_PLAY_MODES, DEFAULT_SETTINGS.audioAutoPlayMode);
}

function normalizeAudioTtsMode(value: unknown): AudioTtsMode {
    return normalizeOption(value, AUDIO_TTS_MODES, DEFAULT_SETTINGS.audioTtsMode);
}

function normalizeImmersionKitCategory(value: unknown): ImmersionKitCategory {
    return normalizeOption(value, IMMERSION_KIT_CATEGORIES, DEFAULT_SETTINGS.immersionKitCategory);
}

function normalizeImmersionKitSort(value: unknown): ImmersionKitSort {
    return normalizeOption(value, IMMERSION_KIT_SORTS, DEFAULT_SETTINGS.immersionKitSort);
}

function normalizeImmersionExampleSource(value: unknown): ImmersionExampleSource {
    return normalizeOption(value, IMMERSION_EXAMPLE_SOURCES, DEFAULT_SETTINGS.immersionKitExampleSource);
}

function normalizeOption<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? value as T : fallback;
}

function normalizeUrl(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
        return new URL(value.trim()).toString().replace(/\/$/, '');
    } catch {
        return fallback;
    }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeBooleanSettingGroup<Key extends keyof ReaderSettings>(
    value: Partial<ReaderSettings> | null | undefined,
    keys: readonly Key[],
): Pick<ReaderSettings, Key> {
    const normalized = {} as Pick<ReaderSettings, Key>;
    for (const key of keys) {
        normalized[key] = booleanSetting(value, key) as ReaderSettings[Key];
    }
    return normalized;
}

function normalizeNumberSettingGroup<Key extends keyof ReaderSettings>(
    value: Partial<ReaderSettings> | null | undefined,
    ranges: Record<Key, NumberSettingRange>,
): Pick<ReaderSettings, Key> {
    const normalized = {} as Pick<ReaderSettings, Key>;
    for (const key of Object.keys(ranges) as Key[]) {
        const { min, max } = ranges[key];
        const fallback = DEFAULT_SETTINGS[key];
        normalized[key] = clampNumber(value?.[key], min, max, typeof fallback === 'number' ? fallback : 0) as ReaderSettings[Key];
    }
    return normalized;
}

function booleanSetting(value: Partial<ReaderSettings> | null | undefined, key: keyof ReaderSettings): boolean {
    const rawValue = value?.[key];
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof rawValue === 'boolean') return rawValue;
    return typeof fallback === 'boolean' ? fallback : false;
}

function booleanSettingWithFallback(value: Partial<ReaderSettings> | null | undefined, key: keyof ReaderSettings, fallback: boolean): boolean {
    const rawValue = value?.[key];
    return typeof rawValue === 'boolean' ? rawValue : fallback;
}

function trimmedStringSetting(value: Partial<ReaderSettings> | null | undefined, key: keyof ReaderSettings, fallback: string): string {
    const rawValue = value?.[key];
    return typeof rawValue === 'string' ? rawValue.trim() : fallback;
}

function normalizeSubtitleControlsMode(value: unknown): ReaderSettings['subtitleControlsMode'] {
    return normalizeOption(value, SUBTITLE_CONTROL_MODES, DEFAULT_SETTINGS.subtitleControlsMode);
}

function normalizeOcrOverlayTheme(value: unknown): OcrOverlayTheme {
    return normalizeOption(value, OCR_OVERLAY_THEMES, DEFAULT_SETTINGS.ocrOverlayTheme);
}

function normalizeSubtitleTranscriptPlacement(value: unknown): ReaderSettings['subtitleTranscriptPlacement'] {
    return normalizeOption(value, SUBTITLE_TRANSCRIPT_PLACEMENTS, DEFAULT_SETTINGS.subtitleTranscriptPlacement);
}

function normalizeNewTabSource(value: unknown): ReaderSettings['newTabSource'] {
    return normalizeOption(value, NEW_TAB_SOURCES, DEFAULT_SETTINGS.newTabSource);
}

function normalizeNewTabJpdbReviewMode(value: unknown): ReaderSettings['newTabJpdbReviewMode'] {
    return normalizeOption(value, NEW_TAB_JPDB_REVIEW_MODES, DEFAULT_SETTINGS.newTabJpdbReviewMode);
}

function normalizeCorsProxyUrl(value: unknown): string {
    if (value == null) return DEFAULT_SETTINGS.corsProxyUrl;
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' ? url.href.replace(/\/+$/, '') : '';
    } catch {
        return '';
    }
}

function normalizeNewTabKanjiKeywordSource(value: unknown): ReaderSettings['newTabKanjiKeywordSource'] {
    return normalizeOption(value, NEW_TAB_KANJI_KEYWORD_SOURCES, DEFAULT_SETTINGS.newTabKanjiKeywordSource);
}

function normalizeReaderColorChannelSettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, ReaderColorChannelKey> {
    return Object.fromEntries(Object.entries(DEFAULT_COLOR_CHANNELS).map(([key, fallback]) => [
        key, normalizeReaderColorSource(value?.[key as ReaderColorChannelKey], fallback),
    ])) as Pick<ReaderSettings, ReaderColorChannelKey>;
}

function normalizeReaderColorSource(value: unknown, fallback: ReaderColorSource): ReaderColorSource {
    return READER_COLOR_SOURCES.has(value as ReaderColorSource) ? value as ReaderColorSource : fallback;
}

function normalizeFuriganaMode(value: unknown): FuriganaMode {
    return isFuriganaMode(value) ? value : DEFAULT_SETTINGS.furiganaMode;
}

function isFuriganaMode(value: unknown): value is FuriganaMode {
    return value === 'auto' || value === 'all' || value === 'difficult-kanji' || value === 'known-status' || value === 'hover' || value === 'off';
}

const FURIGANA_STATE_GROUPS: ReadonlySet<string> = new Set<string>(FURIGANA_HIDE_STATE_GROUPS);

function normalizeFuriganaHiddenStateGroups(value: unknown): ReaderSettings['furiganaHiddenStateGroups'] {
    if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.furiganaHiddenStateGroups];
    const groups = value.filter((item): item is ReaderSettings['furiganaHiddenStateGroups'][number] =>
        typeof item === 'string' && FURIGANA_STATE_GROUPS.has(item));
    return [...new Set(groups)];
}

function normalizeWordColorHiddenStateGroups(value: unknown): ReaderSettings['wordColorHiddenStateGroups'] {
    // Furigana groups PLUS the ignored family (own colour, own picker): validating
    // against the furigana set dropped it on load (#37). Default EMPTY = colour all.
    if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.wordColorHiddenStateGroups];
    const groups = value.filter((item): item is ReaderSettings['wordColorHiddenStateGroups'][number] =>
        typeof item === 'string' && (WORD_COLOR_HIDE_STATE_GROUPS as readonly string[]).includes(item));
    return [...new Set(groups)];
}

function normalizeDeckIdSetting(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function shouldLookupAnkiStatus(settings: Partial<ReaderSettings>): boolean {
    return settings.ankiEnabled === true;
}

export function shouldLookupBunproWordStates(settings: Partial<ReaderSettings>, now = Date.now()): boolean {
    // Colouring words with the user's Bunpro SRS state is a READ, like jpdb/
    // jiten state colouring, so it follows the credential alone. Gating it on
    // the review/mining permission left token-configured users with no state
    // colours at all whenever mining was off (2026-07-17 report).
    return hasBunproFrontendCredential(settings)
        && !isBunproFrontendCredentialExpired(settings, now);
}

export function effectiveReaderColorSource(
    settings: Partial<ReaderSettings>,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.wordHighlightColorSource,
): ConcreteReaderColorSource {
    const concrete = source === 'auto' ? fallback : source;
    return effectiveAvailableColorSource(settings, concrete, fallback);
}

export function effectiveReaderTextColorSource(
    settings: Partial<ReaderSettings>,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.wordTextColorSource,
): ConcreteReaderColorSource {
    return effectiveTextColorSource(settings, effectiveReaderColorSource(settings, source, fallback));
}

export function effectiveSubtitleColorSource(
    settings: Partial<ReaderSettings>,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource,
): ConcreteReaderColorSource {
    const concrete = source === 'auto' ? fallback : source;
    if (concrete === 'status') return 'status';
    return effectiveAvailableColorSource(settings, concrete);
}

export function effectiveSubtitleTextColorSource(
    settings: Partial<ReaderSettings>,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.subtitleTextColorSource,
): ConcreteReaderColorSource {
    return effectiveTextColorSource(settings, effectiveSubtitleColorSource(settings, source, fallback));
}

function effectiveTextColorSource(settings: Partial<ReaderSettings>, source: ConcreteReaderColorSource): ConcreteReaderColorSource {
    return effectiveAvailableColorSource(settings, source);
}

function effectiveAvailableColorSource(
    settings: Partial<ReaderSettings>,
    source: ConcreteReaderColorSource,
    fallback: ConcreteReaderColorSource = 'off',
): ConcreteReaderColorSource {
    if (source === 'jpdb' && !hasSrsStateColorSource(settings)) {
        if (hasAnkiStatusSource(settings)) return 'anki';
        return fallback === 'jpdb' ? 'off' : effectiveAvailableColorSource(settings, fallback, 'off');
    }
    if (source === 'anki' && !hasAnkiStatusSource(settings)) {
        return fallback === 'anki' ? 'off' : effectiveAvailableColorSource(settings, fallback, 'off');
    }
    if (source === 'anki') return 'anki';
    if (source === 'status') return effectiveAvailableStatusSource(settings, true);
    return source;
}

function effectiveAvailableStatusSource(settings: Partial<ReaderSettings>, includeRequestedAnki = false): ConcreteReaderColorSource {
    const hasStates = hasSrsStateColorSource(settings);
    const hasAnki = hasAnkiStatusSource(settings) || Boolean(includeRequestedAnki && settings.ankiEnabled && hasRequestedAnkiColorSource(settings));
    if (hasStates && hasAnki) return 'status';
    if (hasStates) return 'jpdb';
    if (hasAnki) return 'anki';
    return 'off';
}

/**
 * A20: the state colour channel used to follow a jpdb/jiten key alone, so a
 * learner reviewing in Yomu's own deck saw flat text with nothing to explain
 * it. The local deck writes the same five-state `cardState` taxonomy through
 * hydrateYomuLocalSrsCardStates, so it drives the channel the same way.
 */
function hasLocalSrsStatusSource(settings: Partial<ReaderSettings>): boolean {
    return settings.yomuLocalSrsEnabled === true;
}

function hasSrsStateColorSource(settings: Partial<ReaderSettings>): boolean {
    return hasJpdbStatusSource(settings) || hasLocalSrsStatusSource(settings);
}

/**
 * True when some deck can answer "do I know this word?". The settings form
 * shows the no-source line when this is false, so an empty colour channel
 * always comes with a reason.
 */
export function hasStatusColorSource(settings: Partial<ReaderSettings>): boolean {
    return effectiveAvailableStatusSource(settings, true) !== 'off';
}

/** Names whichever deck feeds the state colour channel, for the picker labels. */
export function statusColorSourceLabel(settings: Partial<ReaderSettings>): string {
    if (hasJpdbStatusSource(settings)) return combinedApiCredentialLabel(apiCredentials(settings));
    if (hasLocalSrsStatusSource(settings)) return ACADEMY_SRS_LABEL;
    if (hasAnkiStatusSource(settings)) return 'Anki';
    return '';
}

function apiCredentials(settings: Partial<ReaderSettings>): { apiKey: string; jitenApiKey: string } {
    return { apiKey: settings.apiKey ?? '', jitenApiKey: settings.jitenApiKey ?? '' };
}

function hasJpdbStatusSource(settings: Partial<ReaderSettings>): boolean {
    const credentials = {
        apiKey: settings.apiKey ?? '',
        jitenApiKey: settings.jitenApiKey ?? '',
    };
    return Boolean(hasJpdbApiCredential(credentials) || hasJitenApiCredential(credentials));
}

function hasAnkiStatusSource(settings: Partial<ReaderSettings>): boolean {
    return Boolean(settings.ankiEnabled);
}

function hasRequestedAnkiColorSource(settings: Partial<ReaderSettings>): boolean {
    return COLOR_STATUS_CHANNEL_KEYS.some(key => {
        const source = settings[key];
        return source === 'anki' || source === 'status';
    });
}

const COLOR_STATUS_CHANNEL_KEYS: ReaderColorChannelKey[] = [
    'wordHighlightColorSource',
    'wordUnderlineColorSource',
    'wordTextColorSource',
    'subtitleHighlightColorSource',
    'subtitleUnderlineColorSource',
    'subtitleTextColorSource',
];

export function effectiveFuriganaMode(settings: ReaderSettings): Exclude<FuriganaMode, 'auto'> {
    if (!settings.showFurigana || settings.furiganaMode === 'off') return 'off';
    if (isExplicitFuriganaMode(settings.furiganaMode)) return settings.furiganaMode;
    return 'all';
}

/**
 * A11: difficulty hiding drops readings by a fixed easy-kanji list, which the
 * learner has no way to read off the page. The settings form shows the
 * explanation whenever this is the chosen mode.
 */
export function furiganaModeNeedsDifficultyExplanation(settings: ReaderSettings): boolean {
    return effectiveFuriganaMode(settings) === 'difficult-kanji';
}

function isExplicitFuriganaMode(value: FuriganaMode): value is Exclude<FuriganaMode, 'auto' | 'off'> {
    return EXPLICIT_FURIGANA_MODES.has(value);
}

export function applyUrlBootstrapSettings(settings: ReaderSettings, search = location.search): ReaderSettings {
    const params = new URLSearchParams(search);
    const bootstrap = urlBootstrapSettings(params);
    if (!hasUrlBootstrapSettings(bootstrap)) return settings;
    log.info('Applying URL bootstrap settings', {
        hasApiKey: Boolean(bootstrap.apiKey),
        hasAudio: Boolean(bootstrap.audio),
        hasOcr: Boolean(bootstrap.ocr),
    });

    return {
        ...settings,
        apiKey: bootstrapValue(bootstrap.apiKey, settings.apiKey),
        audioSources: bootstrapAudioSources(settings, bootstrap.audio),
        audioSourceUrl: bootstrapValue(bootstrap.audio, settings.audioSourceUrl),
        ocrEndpointUrl: bootstrapValue(bootstrap.ocr, settings.ocrEndpointUrl),
    };
}

function hasUrlBootstrapSettings(bootstrap: { apiKey: string; audio: string; ocr: string }): boolean {
    return Boolean(bootstrap.apiKey || bootstrap.audio || bootstrap.ocr);
}

function bootstrapValue<T extends string | undefined>(value: string, fallback: T): string | T {
    return value || fallback;
}

function urlBootstrapSettings(params: URLSearchParams): { apiKey: string; audio: string; ocr: string } {
    return {
        apiKey: params.get('apiKey')?.trim() ?? '',
        audio: params.get('audio')?.trim() ?? '',
        ocr: params.get('ocr')?.trim() ?? '',
    };
}

function bootstrapAudioSources(settings: ReaderSettings, audio: string): AudioSourceSetting[] {
    return audio
        ? [{ type: 'custom-json', url: audio, voice: '', enabled: true }, ...settings.audioSources.filter(source => source.url !== audio)]
        : settings.audioSources;
}

export function normalizeOcrProvider(value: unknown): OcrProvider {
    return OCR_PROVIDERS.has(value as OcrProvider) ? value as OcrProvider : DEFAULT_SETTINGS.ocrProvider;
}

const OCR_PROVIDERS = new Set<OcrProvider>(['google-lens', 'cloud-vision', 'local-service', 'off']);

function normalizeCloudVisionApiKey(value: unknown): string {
    return typeof value === 'string' ? value.trim() : DEFAULT_SETTINGS.ocrCloudVisionApiKey;
}

function normalizeOcrEngine(value: unknown): string {
    const normalized = normalizedOcrEngineInput(value);
    return normalized || DEFAULT_SETTINGS.ocrEngine;
}

function normalizedOcrEngineInput(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** Startup/remote adoption that refuses unavailable or unattested settings authority. */
export async function loadSettings(): Promise<ReaderSettings> {
    if (settingsResetInProgress) return mergeSettings(null);
    return loadSettingsFromStorage();
}

async function loadSettingsFromStorage(): Promise<ReaderSettings> {
    // This scalar is the durable user-intent boundary for a preference that
    // changes page startup behavior at document-start. Read it before the
    // larger settings blob so a stale whole-object writer can never become
    // authoritative merely because it finishes later.
    const storedSitePreference = await readSettingsOwnedValueStrict<unknown>(
        PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
        undefined,
    );
    const view = await readSettingsPersistenceViewStrictFrom(readSettingsOwnedValueStrict);
    const current = mergeSettings(settingsRecord(view.settings));
    const withSitePreference = applyStoredSitePreference(current, storedSitePreference);
    const settings = mergeSettings(applySettingsIntent(withSitePreference, view.intentLedger) as Partial<ReaderSettings>);
    return settings;
}

function applyStoredSitePreference(
    settings: ReaderSettings,
    storedSitePreference: unknown,
): ReaderSettings {
    return {
        ...settings,
        preferJapaneseSiteLanguage: authoritativePreferredJapaneseSiteLanguage(
            storedSitePreference,
            settings.preferJapaneseSiteLanguage,
        ),
    };
}

function readSettingsOwnedValueStrict<T>(key: string, fallback: T): Promise<T> {
    return isHostedYomuOrigin()
        ? gmStorageGetStrict(key, fallback)
        : gmStorageGetSharedStrict(key, fallback);
}

function settingsRecord(value: unknown): Partial<ReaderSettings> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Partial<ReaderSettings>
        : null;
}

export function subscribeToSettingsStorageChanges(onSettings: (settings: ReaderSettings) => void): () => void {
    let active = true;
    let refreshRevision = 0;
    const refresh = (): void => {
        const revision = ++refreshRevision;
        void loadSettings().then(settings => {
            if (active && revision === refreshRevision) onSettings(settings);
        }).catch(error => log.warn('Settings change reconciliation failed', { error }));
    };
    const unsubscribers = [
        subscribeToStoredValueChanges(SETTINGS_STORAGE_KEY, refresh),
        subscribeToStoredValueChanges(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, refresh),
        subscribeToStoredValueChanges(SETTINGS_INTENT_LEDGER_STORAGE_KEY, refresh),
    ];
    return () => {
        active = false;
        refreshRevision += 1;
        for (const unsubscribe of unsubscribers) unsubscribe();
    };
}

export interface SaveSettingsOptions {
    /**
     * Set only for a user action that explicitly changed this preference.
     * Background and stale whole-settings saves must leave the scalar alone.
     */
    readonly persistPreferredJapaneseSiteLanguage?: boolean;
    /**
     * Fields this write changed because a human moved the control that owns
     * them. Recorded in the intent ledger, so a later stale whole-settings save
     * cannot replace them.
     *
     * REQUIRED, and `NO_EXPLICIT_USER_CHOICE` for a machine write. Optional, it
     * was skipped by surface after surface — a rail toggle that declared
     * nothing while the keyboard shortcut for the same action declared
     * correctly is how "the show-native-subtitles toggle turns itself back on"
     * shipped. A required field makes a new surface state which kind of write
     * it is instead of defaulting into the silent one.
     */
    readonly explicitUserChoiceKeys: readonly (keyof ReaderSettings)[];
    /**
     * Fields whose recorded intent this write WITHDRAWS: a Reset control puts
     * defaults back, which is the opposite of choosing them.
     */
    readonly clearExplicitUserChoiceKeys?: readonly (keyof ReaderSettings)[];
}

export async function saveSettings(
    settings: ReaderSettings,
    // Required at the type level, which is where "a new surface cannot silently
    // skip intent" is enforced. Read defensively because a bundled or older
    // untyped caller reaching this at runtime must still SAVE -- degrading to a
    // machine write is the safe outcome; throwing would lose the write.
    options: SaveSettingsOptions,
): Promise<void> {
    const intent = options ?? { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE };
    if (settingsResetInProgress) {
        log.warn('Rejected save during reset');
        // Resolving here told every caller that a write which never happened
        // had succeeded. Keep the error message empty so UI callers use their
        // localized settings-save fallback while still getting a rejection
        // they can use to revert staged state.
        throw new Error();
    }
    try {
        const normalizedSettings = mergeSettings(settings as Partial<ReaderSettings>);
        await persistSettingsWithIntent(normalizedSettings, intent);
    } catch (error) {
        log.warn('Settings save failed', { error });
        throw error;
    }
}

async function persistSettingsWithIntent(
    settings: ReaderSettings,
    intent: SaveSettingsOptions,
): Promise<void> {
    const persist = (): Promise<void> => persistSettings(
        settings,
        intent.explicitUserChoiceKeys ?? NO_EXPLICIT_USER_CHOICE,
        intent.clearExplicitUserChoiceKeys,
    );
    if (!intent.persistPreferredJapaneseSiteLanguage) return persist();
    return persistPreferredJapaneseSiteLanguageWithSettings(
        settings.preferJapaneseSiteLanguage,
        persist,
    );
}

/**
 * The keys a declaration really covers: a `*Chosen` flag and the value it
 * qualifies are one preference, derived from the key name rather than listed.
 */
export function coupledSettingsIntentKeys(
    keys: readonly (keyof ReaderSettings)[],
): Array<keyof ReaderSettings> {
    return coupledIntentKeys(keys, key => hasOwn(DEFAULT_SETTINGS, key));
}

async function persistSettings(
    settings: ReaderSettings,
    explicitUserChoiceKeys: readonly (keyof ReaderSettings)[],
    clearExplicitUserChoiceKeys: readonly (keyof ReaderSettings)[] = [],
): Promise<void> {
    const normalizedSettings = mergeSettings(settings as Partial<ReaderSettings>);
    let storedSettings: Partial<ReaderSettings> = normalizedSettings;
    await withGmStorageLease(SETTINGS_PERSISTENCE_STORAGE_LEASE, async () => {
        // Only the CALLER can say what the learner touched. A save may carry a stale
        // whole-object snapshot, so differences against the stored record are not
        // intent -- inferring them here clobbers another context's explicit choice.
        const ledger = await readSettingsIntentLedgerForWrite();
        const withdrawn = clearSettingsIntent(ledger, coupledSettingsIntentKeys(clearExplicitUserChoiceKeys));
        const nextLedger = recordSettingsIntent(
            withdrawn,
            coupledSettingsIntentKeys(explicitUserChoiceKeys),
            normalizedSettings,
        );
        storedSettings = mergeSettings(
            applySettingsIntent(normalizedSettings, nextLedger) as Partial<ReaderSettings>,
        );
        const supportedSettings = stripUnsupportedSettings(storedSettings) ?? storedSettings;
        await persistSettingsStorageTransaction(nextLedger, supportedSettings);
        storedSettings = supportedSettings;
    });
    dispatchSettingsChange(storedSettings);
}

function dispatchSettingsChange(settings: Partial<ReaderSettings>): void {
    publishSettingsChange({ settings });
}

export function beginSettingsResetGuard(): void {
    settingsResetInProgress = true;
    // Every debounced/deferred persister consults the shared registry flag, so the
    // settings guard drives it too: entering the reset window suppresses all
    // managed writes (not just settings) until the reload/end.
    beginManagedStateReset();
}

export function endSettingsResetGuard(): void {
    settingsResetInProgress = false;
    endManagedStateReset();
}

export async function deleteSettingsStorage(): Promise<void> {
    for (const key of [...SETTINGS_STORAGE_KEYS, ...RETIRED_SETTINGS_STORAGE_KEYS]) await gmStorageDelete(key);
    await gmStorageDelete(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY);
    await gmStorageDelete(SETTINGS_INTENT_LEDGER_STORAGE_KEY);
}

export async function settingsStorageKeysStillPresent(): Promise<string[]> {
    const keys: string[] = [];
    for (const key of [
        ...SETTINGS_STORAGE_KEYS,
        ...RETIRED_SETTINGS_STORAGE_KEYS,
        PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
        SETTINGS_INTENT_LEDGER_STORAGE_KEY,
    ]) {
        if (await storedValueExists(key)) keys.push(key);
    }
    return keys;
}

export function normalizeAudioSource(value: unknown): AudioSourceSetting | null {
    const record = audioSourceRecord(value);
    if (!record) return null;
    if (!isAudioSourceType(record.type)) return null;
    const subSources = normalizeAudioSubSources(record.subSources);
    return {
        type: record.type,
        url: stringValue(record.url),
        voice: stringValue(record.voice),
        enabled: audioSourceEnabled(record.enabled),
        ...(subSources.length ? { subSources } : {}),
    };
}

export function normalizeAudioSubSources(value: unknown): AudioSubSourceSetting[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const subSources: AudioSubSourceSetting[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as { name?: unknown; enabled?: unknown };
        const name = stringValue(record.name).trim();
        if (!name) continue;
        const key = audioSubSourceNameKey(name);
        if (seen.has(key)) continue;
        seen.add(key);
        subSources.push({ name, enabled: audioSourceEnabled(record.enabled) });
    }
    return subSources;
}

function audioSourceRecord(value: unknown): Partial<AudioSourceSetting> & { type?: unknown; url?: unknown; voice?: unknown; enabled?: unknown; subSources?: unknown } | null {
    return value && typeof value === 'object'
        ? value as Partial<AudioSourceSetting> & { type?: unknown; url?: unknown; voice?: unknown; enabled?: unknown; subSources?: unknown }
        : null;
}

function audioSourceEnabled(value: unknown): boolean {
    return typeof value === 'boolean' ? value : true;
}

export function normalizeAudioSources(value: unknown): AudioSourceSetting[] {
    return Array.isArray(value)
        ? value.map(normalizeAudioSource).filter((source): source is AudioSourceSetting => source !== null)
        : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}
