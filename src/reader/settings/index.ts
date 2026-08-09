import { Logger } from '../app/logger';
import { ACADEMY_SRS_LABEL, FURIGANA_HIDE_STATE_GROUPS, SETTINGS_CHANGE_EVENT, WORD_COLOR_HIDE_STATE_GROUPS, YOMU_HOSTED_AUDIO_URL } from '../app/constants';
import { dispatchWindowEvent, createWindowCustomEvent } from '../platform/window-events';
import { DEFAULT_PITCH_COLOR_TOKENS, DEFAULT_WORD_COLOR_TOKENS, OCR_OVERLAY_COLOR_TOKENS, OVERLAY_COLOR_TOKENS } from '../theme/color-tokens';
import { migrateAnkiSentenceAudioMappings, normalizeAnkiFieldMappings } from './anki-field-mappings';
import { combinedApiCredentialLabel, hasBunproFrontendCredential, hasJitenApiCredential, hasJpdbApiCredential, isBunproFrontendCredentialExpired, isJitenApiCredential } from './api-credential';
import { accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, DEFAULT_ACCENT_COLOR, DEFAULT_OCR_BACKGROUND_COLOR, DEFAULT_OCR_BACKGROUND_OPACITY, DEFAULT_OCR_OUTLINE_COLOR, DEFAULT_OCR_TEXT_COLOR, sanitizeAccentColor } from './color-settings';
import { DEFAULT_DICTIONARY_LOOKUP_LINKS, normalizeDictionaryLookupLinkSettings, normalizeDictionaryPreferences } from './dictionary';
import {
    applySettingsIntent,
    clearSettingsIntent,
    coupledIntentKeys,
    NO_EXPLICIT_USER_CHOICE,
    recordSettingsIntent,
    SETTINGS_INTENT_LEDGER_STORAGE_KEY,
    settingsIntentKeys,
    settingsIntentLedgerFromStorage,
    type SettingsIntentLedger,
} from './intent-ledger';
import { createDefaultSubtitleSettings } from './subtitle-defaults';
import { hasOwn, stringValue, trimmedText } from './values';
import { cacheManagedValueForHostedStartup, gmStorageDelete, gmStorageGet, gmStorageSet, hasAsyncGmStorageBackend, isHostedYomuOrigin, localFallbackStoredValue, storedValueExists, subscribeToStoredValueChanges, withGmStorageLease } from '../app/storage';
import { authoritativePreferredJapaneseSiteLanguage, persistPreferredJapaneseSiteLanguage, PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY } from './site-language-intent';
export { changedSettingsKeys } from './store-reconciliation';
import { recoverLegacySettings, recoverStrandedHostedSettings } from './store-reconciliation';
import { beginManagedStateReset, endManagedStateReset } from '../app/managed-state-registry';
import { audioSubSourceNameKey } from '../audio/source-resolution';
import {
    activeLanguageProfile,
    createDefaultLanguageProfile,
    DEFAULT_LANGUAGE_PROFILE_ID,
    normalizeLanguageProfiles,
} from '../languages/profiles';
import { learningTargetRosterIdForTag, SLICE1_TARGET_LANGUAGE } from '../languages/roster';
import { isTargetDefaultOcrLanguageTag } from '../languages/resolve';
import { isSupportedLanguageProfileSchemaVersion } from '../languages/types';
import type { AnkiTemplateMode, AudioAutoPlayMode, AudioSourceSetting, AudioSourceType, AudioSubSourceSetting, AudioTtsMode, FuriganaMode, ImmersionExampleSource, ImmersionKitCategory, ImmersionKitSort, InterfaceLanguage, NewTabStudyChallengeStep, OcrOverlayTheme, OcrProvider, ReaderColorSource, ReaderSettings } from '../app/types';
export { formatShortcutEvent, matchesShortcut, shortcutIsPressed } from './shortcuts';
export { accentToRgba, accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, sanitizeAccentColor } from './color-settings';
export { COPY_LOOKUP_LINK, MAX_EXTRA_LOOKUP_LINKS, MAX_LOOKUP_LINK_ROWS, defaultDictionaryLookupLinks, defaultLookupLinkMode, dictionaryLookupLinksForTarget, mergeDictionaryPreferences, normalizeDictionaryLookupLinks, normalizeDictionaryPreferences, retireStaleDictionaryPreferences } from './dictionary';
export { NO_EXPLICIT_USER_CHOICE } from './intent-ledger';

export const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
export { PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY };
/** Superseded by the intent ledger; still read once so upgrades keep their pins. */
export const EXPLICIT_USER_SETTINGS_STORAGE_KEY = 'yomu:explicit-user-settings:v1';
const LEGACY_SETTINGS_STORAGE_KEYS = [
    'jpdb-reader-settings',
    'yomu-reader-settings',
    'yomu-settings',
] as const;
export const SETTINGS_STORAGE_KEYS = [
    SETTINGS_STORAGE_KEY,
    ...LEGACY_SETTINGS_STORAGE_KEYS,
] as const;
const SETTINGS_PERSISTENCE_STORAGE_LEASE = 'reader-settings-persistence';

const log = Logger.scope('Settings');
let settingsResetInProgress = false;

const DEFAULT_AUDIO_URL =
    YOMU_HOSTED_AUDIO_URL;

export const DEFAULT_OVERLAY_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
export const DEFAULT_OVERLAY_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;
export const DEFAULT_OVERLAY_BACKGROUND_COLOR = OVERLAY_COLOR_TOKENS.background;
const LEGACY_DEFAULT_OCR_TEXT_COLOR = OCR_OVERLAY_COLOR_TOKENS.text;
const LEGACY_DEFAULT_OCR_OUTLINE_COLOR = OCR_OVERLAY_COLOR_TOKENS.outline;
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

const AUDIO_SOURCE_TYPE_VALUES: AudioSourceType[] = [
    'jpod101',
    'language-pod-101',
    'jisho',
    'bunpro',
    'lingua-libre',
    'wiktionary',
    'jiten-tts',
    'jpdb-tts',
    'text-to-speech',
    'text-to-speech-reading',
    'custom',
    'custom-json',
];

export const AUDIO_SOURCE_UI_TYPE_VALUES = AUDIO_SOURCE_TYPE_VALUES.filter(type => type !== 'custom');

export const DEFAULT_AUDIO_SOURCES: AudioSourceSetting[] = [
    { type: 'custom-json', url: YOMU_HOSTED_AUDIO_URL, voice: '', enabled: true },
    { type: 'jpod101', url: '', voice: '', enabled: false },
    { type: 'language-pod-101', url: '', voice: '', enabled: false },
    { type: 'jisho', url: '', voice: '', enabled: false },
    { type: 'bunpro', url: '', voice: '', enabled: false },
    { type: 'jiten-tts', url: '', voice: '', enabled: false },
    { type: 'jpdb-tts', url: '', voice: '', enabled: false },
    { type: 'text-to-speech', url: '', voice: '', enabled: false },
];

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_TYPE_VALUES);
const LEGACY_DEFAULT_AUDIO_SOURCES_WITHOUT_API_TTS: AudioSourceSetting[] = [
    { type: 'custom-json', url: YOMU_HOSTED_AUDIO_URL, voice: '', enabled: true },
    { type: 'jpod101', url: '', voice: '', enabled: true },
    { type: 'language-pod-101', url: '', voice: '', enabled: true },
    { type: 'jisho', url: '', voice: '', enabled: true },
    { type: 'text-to-speech', url: '', voice: '', enabled: true },
];
const LEGACY_DEFAULT_AUDIO_SOURCES_WITH_API_TTS: AudioSourceSetting[] = [
    { type: 'custom-json', url: YOMU_HOSTED_AUDIO_URL, voice: '', enabled: true },
    { type: 'jpod101', url: '', voice: '', enabled: true },
    { type: 'language-pod-101', url: '', voice: '', enabled: true },
    { type: 'jisho', url: '', voice: '', enabled: true },
    { type: 'jiten-tts', url: '', voice: '', enabled: true },
    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
    { type: 'text-to-speech', url: '', voice: '', enabled: true },
];
const DEFAULT_OFF_AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(
    DEFAULT_AUDIO_SOURCES
        .filter(source => source.type !== 'custom-json' || source.url !== YOMU_HOSTED_AUDIO_URL)
        .map(source => source.type),
);
const READER_COLOR_SOURCES = new Set<ReaderColorSource>(['auto', 'status', 'jpdb', 'anki', 'pitch', 'off']);
const EXPLICIT_FURIGANA_MODES = new Set<FuriganaMode>(['all', 'difficult-kanji', 'known-status', 'hover']);
const OCR_ENGINE_ALIASES = new Map<string, string>([
    ['MangaOcrAdapter', 'MangaOCR'],
    ['PpOcrAdapter', 'PaddleOCR'],
    ['AppleVisionAdapter', 'AppleVision'],
]);

type ReaderColorChannelKey =
    | 'wordHighlightColorSource'
    | 'wordUnderlineColorSource'
    | 'wordTextColorSource'
    | 'subtitleHighlightColorSource'
    | 'subtitleUnderlineColorSource'
    | 'subtitleTextColorSource';
type NumberSettingRange = { min: number; max: number };
type ConcreteReaderColorSource = Exclude<ReaderColorSource, 'auto'>;
type LegacyWordHighlightMode = 'auto' | 'status' | 'pitch' | 'off';
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
    'uchisenEnabled',
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
    'uchisenAlias',
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
    uchisenPriority: { min: 0, max: 999 },
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
export const DEFAULT_NEW_TAB_STUDY_STEP_ORDER: NewTabStudyChallengeStep[] = [
    'kanji-doodle',
    'word',
    'type-word',
    'recall-cloze',
    'listen-pitch',
    'speaking',
];
const NEW_TAB_STUDY_CHALLENGE_STEPS = new Set<NewTabStudyChallengeStep>(DEFAULT_NEW_TAB_STUDY_STEP_ORDER);
const NEW_TAB_TYPE_WORD_INPUT_MODES = ['keyboard', 'handwriting'] as const satisfies readonly ReaderSettings['newTabTypeWordInputMode'][];

const LEGACY_COLOR_CHANNEL_DEFAULTS: Record<ReaderColorChannelKey, ReaderColorSource> = {
    wordHighlightColorSource: 'auto',
    wordUnderlineColorSource: 'auto',
    wordTextColorSource: 'off',
    subtitleHighlightColorSource: 'off',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'auto',
};
const LEGACY_DEFAULT_ANKI_DECK_NAMES = new Set(['よむ', 'Yomu', 'yomu']);
const LEGACY_DEFAULT_ANKI_MODEL_NAMES = new Set(['よむ Japanese', 'Yomu Japanese']);
const LEGACY_PREVIOUS_SUBTITLE_SHORTCUT = 'Alt+ArrowLeft';
const LEGACY_NEXT_SUBTITLE_SHORTCUT = 'Alt+ArrowRight';

type LegacyReaderSettings = Partial<ReaderSettings> & {
    wordHighlightMode?: LegacyWordHighlightMode;
    pitchColorKifuku?: unknown;
};

export const DEFAULT_SETTINGS: ReaderSettings = {
    apiKey: '',
    jitenApiKey: '',
    bunproApiKey: '',
    bunproFrontendApiToken: '',
    bunproFrontendApiTokenExpiresAt: '',
    wanikaniApiToken: '',
    onboardingSeen: false,
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
    uchisenEnabled: true,
    uchisenAlias: '',
    uchisenPriority: 50,
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
    immersionKitExpandedLimitMigrated20260721: true,
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
    // Historical browser-extension preference retained for settings migration. The
    // main extension no longer overrides the browser new-tab page.
    newTabEnabled: false,
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
    newTabKanjiAutoSubmit: false,
    newTabStudyStepOrder: [...DEFAULT_NEW_TAB_STUDY_STEP_ORDER],
    newTabStudyDisabledSteps: [],
    newTabTypeWordInputMode: 'keyboard',
    newTabStudyTourSeen: false,
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
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => ({ ...link })),
    ...createDefaultSubtitleSettings(DEFAULT_READER_FONT_FAMILY),
    youtubeImmersionEnabled: true,
    youtubeImmersionEnabledChosen: false,
    youtubeShowFilterNotice: true,
    // Default TRUE: only stored records that PREDATE this key (the era when
    // the notice's hide button persisted the setting off) migrate below.
    youtubeFilterNoticeRestored20260711: true,
    // TRUE by default so a fresh install never runs the theme migration below;
    // only a record stored before 1.8.39 lacks it and needs moving to 'auto'.
    themeAutoRestored20260730: true,
    youtubeShowChannelRecommendations: true,
    youtubeShowChannelRecommendationsChosen: false,
    preferJapaneseSiteLanguage: true,
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
    ankiSentenceAudioMappingMigrated: true,
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

const LEGACY_DEFAULT_TRUE_ANKI_SETTINGS = [
    'ankiMobileHandoff',
    'ankiMineWithJpdb',
    'ankiSectionEnabled',
    'ankiFrontReading',
    'ankiFrontSentence',
    'ankiFrontImage',
    'ankiCaptureScreenshot',
] as const satisfies readonly (keyof ReaderSettings)[];
const LEGACY_DEFAULT_ANKI_STRING_SETTINGS = [
    ['ankiConnectUrl', DEFAULT_SETTINGS.ankiConnectUrl],
    ['ankiTemplateMode', DEFAULT_SETTINGS.ankiTemplateMode],
    ['ankiTags', DEFAULT_SETTINGS.ankiTags],
] as const satisfies readonly (readonly [keyof ReaderSettings, string])[];

function mergeSettings(value: LegacyReaderSettings | null): ReaderSettings {
    const settingsValue = migrateSentenceAudioFieldMappings(
        migrateDefaultLightTheme(
            migratePinnedOcrLanguage(
                migrateHiddenFilterNotice(migrateLegacyDefaultMobileSettings(value)),
            ),
        ),
    );
    const audio = normalizeAudioSettings(settingsValue);
    const supportedSettings = stripUnsupportedSettings(settingsValue);
    const apiCredentials = normalizeApiCredentialSettings(settingsValue);
    const parserProvider = normalizeParserProvider(settingsValue);
    const dictionaryPreferences = normalizeDictionaryPreferences(settingsValue?.dictionaryPreferences);
    const languageProfileSettings = normalizeLanguageProfileSettings(
        settingsValue,
        parserProvider,
        dictionaryPreferences,
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
        preferJapaneseSiteLanguage: normalizePreferredJapaneseSiteLanguage(settingsValue),
        shortcuts: normalizeShortcutSettings(settingsValue),
    };
}

function normalizePreferredJapaneseSiteLanguage(value: LegacyReaderSettings | null): boolean {
    if (!value || !hasOwn(value, 'preferJapaneseSiteLanguage')) {
        return DEFAULT_SETTINGS.preferJapaneseSiteLanguage;
    }
    return typeof value.preferJapaneseSiteLanguage === 'boolean'
        ? value.preferJapaneseSiteLanguage
        : false;
}

// New installs parse with local dictionaries by default. Saved payloads that
// predate the setting keep API-first parsing so provider-backed word colors
// and known states do not change under existing users.
function normalizeParserProvider(value: LegacyReaderSettings | null): ReaderSettings['parserProvider'] {
    const provider = value?.parserProvider;
    if (provider === 'local' || provider === 'jiten' || provider === 'jpdb' || provider === 'auto') return provider;
    return value ? 'auto' : DEFAULT_SETTINGS.parserProvider;
}

export function normalizeReaderSettings(value: Partial<ReaderSettings> | null | undefined): ReaderSettings {
    return mergeSettings(value as LegacyReaderSettings | null);
}

function normalizeLanguageProfileSettings(
    value: LegacyReaderSettings | null,
    parserProvider: ReaderSettings['parserProvider'],
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
): Pick<
    ReaderSettings,
    'languageProfiles' | 'activeLanguageProfileId' | 'parserProvider' | 'interfaceLanguage' | 'dictionaryPreferences'
> {
    const hasPersistedProfiles = Array.isArray(value?.languageProfiles)
        && value.languageProfiles.some(profile => (
            profile
            && typeof profile === 'object'
            && 'schemaVersion' in profile
            && isSupportedLanguageProfileSchemaVersion(profile.schemaVersion)
        ));
    const normalized = normalizeLanguageProfiles(
        value?.languageProfiles,
        value?.activeLanguageProfileId,
        {
            // INTERFACE is not OUTPUT: existing Japanese-UI users are not
            // necessarily native Japanese speakers. Preserve their UI choice
            // and default the OUTPUT axis independently to English until
            // onboarding asks.
            outputLanguage: 'en',
            uiLocale: value?.interfaceLanguage ?? DEFAULT_SETTINGS.interfaceLanguage,
            parserProvider,
        },
    );
    const active = activeLanguageProfile(normalized.profiles, normalized.activeProfileId);
    if (!active) {
        return {
            languageProfiles: normalized.profiles,
            activeLanguageProfileId: normalized.activeProfileId,
            parserProvider,
            interfaceLanguage: value?.interfaceLanguage ?? DEFAULT_SETTINGS.interfaceLanguage,
            dictionaryPreferences,
        };
    }
    const profilesAreAuthoritative = hasPersistedProfiles
        && normalized.profiles.some(languageProfileHasIndependentState);
    if (!profilesAreAuthoritative) {
        active.parserProvider = parserProvider;
        active.uiLocale = normalizeInterfaceLanguage(value?.interfaceLanguage);
        active.dictionaries = languageProfileDictionariesFromPreferences(dictionaryPreferences);
    }
    return {
        languageProfiles: normalized.profiles,
        activeLanguageProfileId: normalized.activeProfileId,
        parserProvider: active.parserProvider,
        interfaceLanguage: profileInterfaceLanguage(active.uiLocale, value?.interfaceLanguage),
        dictionaryPreferences: profilesAreAuthoritative
            ? dictionaryPreferencesForLanguageProfile(dictionaryPreferences, active.dictionaries)
            : dictionaryPreferences,
    };
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

// Independence means "differs from the profile Yomu would create", so every
// clause compares against that profile's own defaults. The target clause is
// live: normalizeLanguageProfile preserves any target a registered module can
// serve, so a stored profile that says Korean reaches here and is judged
// independent, exactly as a changed parser or an installed dictionary is.
function languageProfileHasIndependentState(
    profile: ReaderSettings['languageProfiles'][number],
): boolean {
    return profile.id !== DEFAULT_LANGUAGE_PROFILE_ID
        || profile.outputLanguage !== 'en'
        || profile.targetLanguage !== SLICE1_TARGET_LANGUAGE
        || profile.uiLocale !== DEFAULT_SETTINGS.interfaceLanguage
        || profile.parserProvider !== DEFAULT_SETTINGS.parserProvider
        || profile.dictionaries.installed.length > 0
        || profile.definitionTranslationProviderIds.length > 0;
}

function languageProfileDictionariesFromPreferences(
    preferences: ReaderSettings['dictionaryPreferences'],
): ReaderSettings['languageProfiles'][number]['dictionaries'] {
    const ordered = [...preferences].sort((left, right) => left.priority - right.priority);
    return {
        installed: ordered.map(preference => preference.name),
        enabled: ordered.filter(preference => preference.enabled).map(preference => preference.name),
        order: ordered.map(preference => preference.name),
    };
}

function dictionaryPreferencesForLanguageProfile(
    preferences: ReaderSettings['dictionaryPreferences'],
    dictionaries: ReaderSettings['languageProfiles'][number]['dictionaries'],
): ReaderSettings['dictionaryPreferences'] {
    // Empty is the migration/uninitialized state. A profile becomes
    // authoritative as soon as it has captured at least one installed
    // dictionary; this avoids disabling a dictionary imported by an older
    // client before profile-aware persistence existed.
    if (!dictionaries.installed.length) return preferences;
    const installed = new Set(dictionaries.installed.map(normalizedProfileDictionaryId));
    const enabled = new Set(dictionaries.enabled.map(normalizedProfileDictionaryId));
    const order = new Map(
        dictionaries.order.map((id, index) => [normalizedProfileDictionaryId(id), index]),
    );
    return preferences
        .map((preference, index) => {
            const key = normalizedProfileDictionaryId(preference.name);
            return {
                ...preference,
                enabled: installed.has(key) && enabled.has(key),
                priority: order.get(key) ?? dictionaries.order.length + index,
            };
        })
        .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
}

function normalizedProfileDictionaryId(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function profileInterfaceLanguage(
    value: ReaderSettings['languageProfiles'][number]['uiLocale'],
    fallback: ReaderSettings['interfaceLanguage'] | undefined,
): ReaderSettings['interfaceLanguage'] {
    return value === 'auto' || value === 'en' || value === 'ja'
        ? value
        : fallback === 'auto' || fallback === 'en' || fallback === 'ja'
            ? fallback
            : DEFAULT_SETTINGS.interfaceLanguage;
}

function normalizeApiCredentialSettings(value: LegacyReaderSettings | null | undefined): Pick<ReaderSettings, 'apiKey' | 'jitenApiKey' | 'bunproApiKey' | 'bunproFrontendApiToken' | 'bunproFrontendApiTokenExpiresAt' | 'wanikaniApiToken'> {
    const apiKey = trimmedStringSetting(value, 'apiKey', DEFAULT_SETTINGS.apiKey);
    const jitenApiKey = trimmedStringSetting(value, 'jitenApiKey', DEFAULT_SETTINGS.jitenApiKey);
    const bunproApiKey = trimmedStringSetting(value, 'bunproApiKey', DEFAULT_SETTINGS.bunproApiKey);
    const bunproFrontendApiToken = trimmedStringSetting(value, 'bunproFrontendApiToken', DEFAULT_SETTINGS.bunproFrontendApiToken);
    const bunproFrontendApiTokenExpiresAt = normalizeOptionalIsoDateString(value?.bunproFrontendApiTokenExpiresAt);
    const wanikaniApiToken = trimmedStringSetting(value, 'wanikaniApiToken', DEFAULT_SETTINGS.wanikaniApiToken);
    // UT-56: Jiten and JPDB credentials COEXIST — the study queue loads both
    // providers in parallel, so a Jiten key must not wipe the JPDB key (that
    // wipe made the study page silently diverge from jpdb Learn). A
    // jiten-prefixed value in the JPDB slot still routes to the Jiten slot.
    if (isJitenApiCredential(apiKey)) return { apiKey: '', jitenApiKey: jitenApiKey || apiKey, bunproApiKey, bunproFrontendApiToken, bunproFrontendApiTokenExpiresAt, wanikaniApiToken };
    return { apiKey, jitenApiKey, bunproApiKey, bunproFrontendApiToken, bunproFrontendApiTokenExpiresAt, wanikaniApiToken };
}

function stripUnsupportedSettings(value: LegacyReaderSettings | null | undefined): Partial<ReaderSettings> | null {
    if (!value) return null;
    const supportedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => supportedKeys.has(key)),
    ) as Partial<ReaderSettings>;
}

// Until 1.6.139 the YouTube filter notice's "hide" button silently persisted
// youtubeShowFilterNotice=false forever — the only in-page path that wrote
// this key. Restore it ONCE (marker-gated); the settings dialog remains the
// deliberate permanent switch and its later choices stick.
function migrateHiddenFilterNotice(value: LegacyReaderSettings | null): LegacyReaderSettings | null {
    if (!value) return value;
    if (value.youtubeFilterNoticeRestored20260711) return value;
    const migrated = { ...value, youtubeFilterNoticeRestored20260711: true };
    if (migrated.youtubeShowFilterNotice === false) migrated.youtubeShowFilterNotice = true;
    return migrated;
}

// Until 1.8.39 the default theme was 'light', and every save persisted it, so a
// stored 'light' is indistinguishable from a real choice — yet almost nobody
// chose it. The hosted appearance boot reads settings.theme before its own
// 'auto' fallback, so those installs can never follow the operating system and
// stay bright on a dark screen forever. Move a stored 'light' to 'auto' ONCE
// (marker-gated). Someone whose system is light sees no change; someone whose
// system is dark finally gets dark, and if they truly want light the settings
// dialog still wins and the marker stops this ever running again.
function migrateDefaultLightTheme(value: LegacyReaderSettings | null): LegacyReaderSettings | null {
    if (!value) return value;
    if (value.themeAutoRestored20260730) return value;
    const migrated = { ...value, themeAutoRestored20260730: true };
    if (migrated.theme === 'light') migrated.theme = 'auto';
    return migrated;
}

// `ocrLanguage: ''` means "follow the language being studied". Until now the
// settings form resolved that blank to a concrete tag on every save, so an
// install that ever opened Settings holds a language it never chose — and the
// field is hidden, so there was no way to choose otherwise. Clear a stored
// value that is only ever a target's own default and OCR follows the study
// target again; a tag no target claims was set deliberately and stays.
function migratePinnedOcrLanguage(value: LegacyReaderSettings | null): LegacyReaderSettings | null {
    if (!value || !isTargetDefaultOcrLanguageTag(stringValue(value.ocrLanguage))) return value;
    return { ...value, ocrLanguage: '' };
}

// Word audio and sentence audio shared one field role until the sentenceAudio
// role landed, so saved mappings can point the word-audio role at a
// sentence-audio field. Move it ONCE (marker-gated) — the mapping editor now
// offers both rows, and a later deliberate choice there must not be undone.
function migrateSentenceAudioFieldMappings(value: LegacyReaderSettings | null): LegacyReaderSettings | null {
    if (!value) return value;
    if (value.ankiSentenceAudioMappingMigrated) return value;
    const migrated: LegacyReaderSettings = { ...value, ankiSentenceAudioMappingMigrated: true };
    if (!value.ankiFieldMappings) return migrated;
    const { mappings, movedModels } = migrateAnkiSentenceAudioMappings(value.ankiFieldMappings);
    if (!movedModels.length) return migrated;
    log.info('Moved Anki sentence-audio field mappings off the word-audio role', { models: movedModels });
    return { ...migrated, ankiFieldMappings: mappings };
}

function migrateLegacyDefaultMobileSettings(value: LegacyReaderSettings | null): LegacyReaderSettings | null {
    if (!value) return value;
    const migrateAnki = isLegacyDefaultAnkiSettings(value);
    const migrateNewTabAnki = isLegacyDefaultNewTabAnkiSettings(value);
    if (!migrateAnki && !migrateNewTabAnki) return value;

    const migrated = { ...value };
    if (migrateAnki) {
        migrated.ankiEnabled = false;
        migrated.ankiSectionEnabled = false;
        migrated.ankiMobileHandoff = false;
        migrated.ankiMineWithJpdb = false;
    }
    if (migrateNewTabAnki) migrated.newTabAnkiEnabled = false;
    return migrated;
}

function isLegacyDefaultAnkiSettings(value: LegacyReaderSettings): boolean {
    if (!isPreCurrentSavedSettingsPayload(value)) return false;
    return legacyAnkiBooleanSettingsAreDefault(value)
        && legacyAnkiStringSettingsAreDefault(value)
        && legacyStringSettingIn(value, 'ankiDeck', LEGACY_DEFAULT_ANKI_DECK_NAMES)
        && legacyStringSettingIn(value, 'ankiModel', LEGACY_DEFAULT_ANKI_MODEL_NAMES)
        && legacyAnkiFieldMappingsAreDefault(value);
}

function legacyAnkiBooleanSettingsAreDefault(value: LegacyReaderSettings): boolean {
    return LEGACY_DEFAULT_TRUE_ANKI_SETTINGS.every(key => legacyBooleanSettingMatches(value, key, true));
}

function legacyAnkiStringSettingsAreDefault(value: LegacyReaderSettings): boolean {
    return LEGACY_DEFAULT_ANKI_STRING_SETTINGS.every(([key, expected]) => legacyStringSettingMatches(value, key, expected));
}

function isLegacyDefaultNewTabAnkiSettings(value: LegacyReaderSettings): boolean {
    if (!isPreCurrentSavedSettingsPayload(value)) return false;
    return legacyBooleanSettingMatches(value, 'newTabAnkiEnabled', true)
        && legacyBooleanSettingMatches(value, 'newTabEnabled', false)
        && legacyStringListSettingIsEmpty(value, 'newTabAnkiDisabledDecks')
        && legacyStringSettingMatches(value, 'newTabSource', DEFAULT_SETTINGS.newTabSource)
        && legacyStringSettingMatches(value, 'newTabJpdbDeck', DEFAULT_SETTINGS.newTabJpdbDeck)
        && legacyStringSettingMatches(value, 'newTabJpdbReviewMode', DEFAULT_SETTINGS.newTabJpdbReviewMode);
}

function isPreCurrentSavedSettingsPayload(value: LegacyReaderSettings): boolean {
    return !hasOwn(value, 'jitenApiKey');
}

function legacyBooleanSettingMatches<Key extends keyof ReaderSettings>(value: LegacyReaderSettings, key: Key, expected: boolean): boolean {
    return hasOwn(value, key) && value[key] === expected;
}

function legacyStringSettingMatches<Key extends keyof ReaderSettings>(value: LegacyReaderSettings, key: Key, expected: string): boolean {
    const raw = value[key];
    return hasOwn(value, key) && typeof raw === 'string' && raw.trim() === expected;
}

function legacyStringSettingIn<Key extends keyof ReaderSettings>(value: LegacyReaderSettings, key: Key, expected: ReadonlySet<string>): boolean {
    const raw = value[key];
    return hasOwn(value, key) && typeof raw === 'string' && expected.has(raw.trim());
}

function legacyStringListSettingIsEmpty<Key extends keyof ReaderSettings>(value: LegacyReaderSettings, key: Key): boolean {
    const raw = value[key];
    return hasOwn(value, key) && Array.isArray(raw) && raw.length === 0;
}

function legacyAnkiFieldMappingsAreDefault(value: LegacyReaderSettings): boolean {
    const raw = value.ankiFieldMappings;
    return hasOwn(value, 'ankiFieldMappings')
        && Boolean(raw)
        && typeof raw === 'object'
        && !Array.isArray(raw)
        && Object.keys(raw).length === 0;
}

function normalizeAudioSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    const settings = value ?? {};
    const hasSavedAudioSources = hasOwn(settings, 'audioSources') || Boolean(settings.audioSourceUrl);
    const audioSources = hasSavedAudioSources
        ? normalizeAudioSources(settings.audioSources, settings.audioSourceUrl)
        : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
    const audioAutoPlayMode = normalizeAudioAutoPlayMode(settings.audioAutoPlayMode);
    return {
        autoPlayAudio: audioAutoPlayMode === 'off' ? false : booleanSetting(value, 'autoPlayAudio'),
        suppressAutoAudioOnVideo: booleanSetting(value, 'suppressAutoAudioOnVideo'),
        audioAutoPlayMode,
        audioSources,
        audioSourceUrl: preferredAudioSourceUrl(audioSources, settings.audioSourceUrl),
        audioTtsMode: normalizeAudioTtsMode(settings.audioTtsMode),
    };
}

function preferredAudioSourceUrl(audioSources: AudioSourceSetting[], fallback: string | undefined): string {
    return audioSources.find(source => source.url)?.url ?? fallback ?? DEFAULT_AUDIO_URL;
}

function normalizeShortcutSettings(value: Partial<ReaderSettings> | null): ReaderSettings['shortcuts'] {
    const shortcuts = {
        ...DEFAULT_SETTINGS.shortcuts,
        ...(value?.shortcuts ?? {}),
    };
    if (value?.shortcuts && !hasOwn(value.shortcuts, 'hoverLookup')) {
        shortcuts.hoverLookup = value.popupActivationMode === 'modifier' ? shortcutFromLegacyModifier(value.scanModifierKey) : '';
    }
    // A blank shortcut matches every event, which would silently turn 'modifier'
    // mode into plain hover mode, so a legacy modifier profile must resolve to a
    // key -- but only when the learner has not stored a hover shortcut of their
    // own. This tested the emptiness of the RESULT rather than the absence of a
    // stored choice, so someone who deliberately cleared the shortcut had 'Shift'
    // re-minted inside every save and every load, which is why it came back
    // seconds later and again after an update (GitHub #36). The clause above
    // already uses this guard; this one has to agree with it.
    if (
        value?.popupActivationMode === 'modifier'
        && !shortcuts.hoverLookup.trim()
        && !hasOwn(value?.shortcuts ?? {}, 'hoverLookup')
    ) {
        shortcuts.hoverLookup = shortcutFromLegacyModifier(value.scanModifierKey) || 'Shift';
    }
    migrateLegacySubtitleLineShortcuts(shortcuts, value?.shortcuts);
    return shortcuts;
}

function migrateLegacySubtitleLineShortcuts(
    shortcuts: ReaderSettings['shortcuts'],
    savedShortcuts: Partial<ReaderSettings['shortcuts']> | undefined,
): void {
    if (!savedShortcuts) return;
    if (savedShortcuts.previousSubtitle === LEGACY_PREVIOUS_SUBTITLE_SHORTCUT) {
        shortcuts.previousSubtitle = DEFAULT_SETTINGS.shortcuts.previousSubtitle;
    }
    if (savedShortcuts.nextSubtitle === LEGACY_NEXT_SUBTITLE_SHORTCUT) {
        shortcuts.nextSubtitle = DEFAULT_SETTINGS.shortcuts.nextSubtitle;
    }
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
    const normalized = normalizeNumberSettingGroup(value, API_DEFINITION_NUMBER_SETTING_RANGES);
    const ordered = isLegacyDefaultDefinitionSourceOrder(value)
        ? {
            ...normalized,
            jpdbDefinitionsPriority: DEFAULT_SETTINGS.jpdbDefinitionsPriority,
            jitenDefinitionsPriority: DEFAULT_SETTINGS.jitenDefinitionsPriority,
        }
        : normalized;
    if (!hasOwn(value, 'bunproDefinitionsPriority')) {
        ordered.bunproDefinitionsPriority = Math.min(999, Math.max(ordered.jpdbDefinitionsPriority, ordered.jitenDefinitionsPriority) + 1);
    }
    return ordered;
}

function normalizeSourceAliasSettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, typeof SOURCE_ALIAS_SETTING_KEYS[number]> {
    const aliases = {} as Pick<ReaderSettings, typeof SOURCE_ALIAS_SETTING_KEYS[number]>;
    for (const key of SOURCE_ALIAS_SETTING_KEYS) {
        aliases[key] = trimmedStringSetting(value, key, DEFAULT_SETTINGS[key]);
    }
    return aliases;
}

/**
 * The one-shot 1.4.215 migration that moved Jiten in front of JPDB.
 *
 * {jpdb: 0, jiten: 1} is also EXACTLY what dragging JPDB to the top of the
 * definition-source editor produces, so applying this on every normalize
 * force-reverted that drag inside the same save -- "it still jams jiten to the
 * top of the dictionary array" (GitHub #43). The migration is therefore gated on
 * the record predating it: `bunproDefinitionsPriority` arrived after the
 * migration shipped, so a record without it was written before the migration
 * could have run, and every record written since carries it (the whole settings
 * object is persisted on every save).
 */
function isLegacyDefaultDefinitionSourceOrder(value: Partial<ReaderSettings> | null | undefined): boolean {
    return hasOwn(value, 'jpdbDefinitionsPriority')
        && hasOwn(value, 'jitenDefinitionsPriority')
        && !hasOwn(value, 'bunproDefinitionsPriority')
        && value?.jpdbDefinitionsPriority === 0
        && value?.jitenDefinitionsPriority === 1;
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
        newTabEnabled: booleanSetting(value, 'newTabEnabled'),
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
        newTabKanjiAutoSubmit: booleanSetting(value, 'newTabKanjiAutoSubmit'),
        newTabStudyStepOrder: normalizeNewTabStudyStepOrder(value?.newTabStudyStepOrder),
        newTabStudyDisabledSteps: normalizeNewTabStudyDisabledSteps(value?.newTabStudyDisabledSteps),
        newTabTypeWordInputMode: normalizeOption(value?.newTabTypeWordInputMode, NEW_TAB_TYPE_WORD_INPUT_MODES, DEFAULT_SETTINGS.newTabTypeWordInputMode),
        newTabStudyTourSeen: booleanSetting(value, 'newTabStudyTourSeen'),
    };
}

function normalizeNewTabStudyStepOrder(value: unknown): NewTabStudyChallengeStep[] {
    const ordered = normalizeStudyStepList(value);
    // Installs that never customised the order carry the previous default
    // verbatim; keep them on the product default (writing follows word).
    const legacyDefault: NewTabStudyChallengeStep[] = ['kanji-doodle', 'word', 'recall-cloze', 'listen-pitch', 'speaking', 'type-word'];
    if (ordered.join(',') === legacyDefault.join(',')) return [...DEFAULT_NEW_TAB_STUDY_STEP_ORDER];
    return [
        ...ordered,
        ...DEFAULT_NEW_TAB_STUDY_STEP_ORDER.filter(step => !ordered.includes(step)),
    ];
}

function normalizeNewTabStudyDisabledSteps(value: unknown): NewTabStudyChallengeStep[] {
    return normalizeStudyStepList(value);
}

function normalizeStudyStepList(value: unknown): NewTabStudyChallengeStep[] {
    if (!Array.isArray(value)) return [];
    const out: NewTabStudyChallengeStep[] = [];
    for (const item of value) {
        if (!isNewTabStudyChallengeStep(item) || out.includes(item)) continue;
        out.push(item);
    }
    return out;
}

function isNewTabStudyChallengeStep(value: unknown): value is NewTabStudyChallengeStep {
    return typeof value === 'string' && NEW_TAB_STUDY_CHALLENGE_STEPS.has(value as NewTabStudyChallengeStep);
}

function normalizeReaderDisplaySettings(value: LegacyReaderSettings | null): Partial<ReaderSettings> {
    const settings = value ?? {};
    return {
        accentColor: sanitizeAccentColor(settings.accentColor),
        ...normalizeAccentColorSettings(settings, READER_ACCENT_COLOR_SETTING_KEYS),
        ...normalizeReaderColorChannelSettings(value),
        puckPositionX: normalizeOptionalCoordinate(settings.puckPositionX),
        puckPositionY: normalizeOptionalCoordinate(settings.puckPositionY),
        showFurigana: booleanSetting(value, 'showFurigana'),
        furiganaMode: normalizeFuriganaMode(settings.furiganaMode, value),
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
        ankiDeck: normalizeAnkiName(settings.ankiDeck, DEFAULT_SETTINGS.ankiDeck, 'Yomu'),
        ankiModel: normalizeAnkiName(settings.ankiModel, DEFAULT_SETTINGS.ankiModel, 'Yomu Japanese'),
        ankiTemplateMode: normalizeAnkiTemplateMode(settings.ankiTemplateMode),
        ankiFieldMappings: normalizeAnkiFieldMappings(settings.ankiFieldMappings),
        ...normalizeBooleanSettingGroup(value, ANKI_STUDY_BOOLEAN_SETTING_KEYS),
    };
}

function normalizeAnkiSectionEnabled(value: Partial<ReaderSettings> | null): boolean {
    const ankiEnabled = booleanSetting(value, 'ankiEnabled');
    return hasOwn(value, 'ankiSectionEnabled')
        ? booleanSetting(value, 'ankiSectionEnabled')
        : ankiEnabled;
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
        ocrProvider: normalizeOcrProvider(settings.ocrProvider, value),
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

function normalizeImmersionExampleLimitSettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, 'immersionKitExpandedLimitMigrated20260721' | 'immersionKitLimitEnabled' | 'immersionKitLimit'> {
    const legacyDefault = value?.immersionKitExpandedLimitMigrated20260721 !== true
        && value?.immersionKitLimitEnabled === true
        && value?.immersionKitLimit === 3;
    return {
        immersionKitExpandedLimitMigrated20260721: true,
        immersionKitLimitEnabled: legacyDefault ? false : booleanSetting(value, 'immersionKitLimitEnabled'),
        immersionKitLimit: legacyDefault
            ? DEFAULT_SETTINGS.immersionKitLimit
            : clampNumber(value?.immersionKitLimit, 1, 12, DEFAULT_SETTINGS.immersionKitLimit),
    };
}

function normalizeOcrTextColor(settings: Partial<ReaderSettings>): string {
    const color = sanitizeAccentColor(settings.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor);
    return color === LEGACY_DEFAULT_OCR_TEXT_COLOR ? DEFAULT_SETTINGS.ocrTextColor : color;
}

function normalizeOcrOutlineColor(settings: Partial<ReaderSettings>): string {
    const color = sanitizeAccentColor(settings.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor);
    return color === LEGACY_DEFAULT_OCR_OUTLINE_COLOR ? DEFAULT_SETTINGS.ocrOutlineColor : color;
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

function normalizeAnkiName(value: unknown, fallback: string, oldDefault: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed === oldDefault) return fallback;
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

function shortcutFromLegacyModifier(value: unknown): string {
    if (value === 'alt') return 'Alt';
    if (value === 'ctrl') return 'Ctrl';
    if (value === 'meta') return 'Meta';
    return value === 'shift' ? 'Shift' : '';
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

function normalizeReaderColorChannelSettings(value: LegacyReaderSettings | null): Pick<ReaderSettings, ReaderColorChannelKey> {
    if (isLegacyDefaultColorChannelSettings(value)) return { ...DEFAULT_COLOR_CHANNELS };
    const channels: Pick<ReaderSettings, ReaderColorChannelKey> = {
        wordHighlightColorSource: normalizeReaderColorSource(value?.wordHighlightColorSource, DEFAULT_COLOR_CHANNELS.wordHighlightColorSource, legacyHighlightColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordHighlightColorSource)),
        wordUnderlineColorSource: normalizeReaderColorSource(value?.wordUnderlineColorSource, DEFAULT_COLOR_CHANNELS.wordUnderlineColorSource, legacyReaderColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordUnderlineColorSource)),
        wordTextColorSource: normalizeReaderColorSource(value?.wordTextColorSource, DEFAULT_COLOR_CHANNELS.wordTextColorSource, legacyReaderColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordTextColorSource)),
        subtitleHighlightColorSource: normalizeReaderColorSource(value?.subtitleHighlightColorSource, DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource, legacySubtitleHighlightColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource)),
        subtitleUnderlineColorSource: normalizeReaderColorSource(value?.subtitleUnderlineColorSource, DEFAULT_COLOR_CHANNELS.subtitleUnderlineColorSource, legacySubtitleColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleUnderlineColorSource)),
        subtitleTextColorSource: normalizeReaderColorSource(value?.subtitleTextColorSource, DEFAULT_COLOR_CHANNELS.subtitleTextColorSource, legacySubtitleColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleTextColorSource)),
    };
    return normalizeStaleDoublePitchHighlightChannels(value, channels);
}

function isLegacyDefaultColorChannelSettings(value: LegacyReaderSettings | null | undefined): boolean {
    if (!value) return false;
    return (Object.keys(LEGACY_COLOR_CHANNEL_DEFAULTS) as ReaderColorChannelKey[])
        .every(key => hasOwn(value, key) && value[key] === LEGACY_COLOR_CHANNEL_DEFAULTS[key]);
}

function normalizeReaderColorSource(value: unknown, fallback: ReaderColorSource, autoFallback = fallback): ReaderColorSource {
    const source = value === 'auto' ? autoFallback : value;
    return READER_COLOR_SOURCES.has(source as ReaderColorSource) ? source as ReaderColorSource : fallback;
}

function normalizeStaleDoublePitchHighlightChannels(
    settings: LegacyReaderSettings | null | undefined,
    channels: Pick<ReaderSettings, ReaderColorChannelKey>,
): Pick<ReaderSettings, ReaderColorChannelKey> {
    const staleWordHighlight = hasStaleWordPitchHighlight(settings, channels);
    const staleSubtitleHighlight = hasStaleSubtitlePitchHighlight(settings, channels);
    if (!staleWordHighlight && !staleSubtitleHighlight) return channels;
    return {
        ...channels,
        wordHighlightColorSource: staleWordHighlight
            ? DEFAULT_COLOR_CHANNELS.wordHighlightColorSource
            : channels.wordHighlightColorSource,
        subtitleHighlightColorSource: staleSubtitleHighlight
            ? DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource
            : channels.subtitleHighlightColorSource,
    };
}

function hasStaleWordPitchHighlight(
    settings: LegacyReaderSettings | null | undefined,
    channels: Pick<ReaderSettings, ReaderColorChannelKey>,
): boolean {
    if (!settings) return false;
    if (settings.wordHighlightMode === 'pitch') return true;
    return hasStalePitchHighlightPair(settings, channels, 'wordHighlightColorSource', 'wordUnderlineColorSource');
}

function hasStaleSubtitlePitchHighlight(
    settings: LegacyReaderSettings | null | undefined,
    channels: Pick<ReaderSettings, ReaderColorChannelKey>,
): boolean {
    if (!settings) return false;
    if (settings.wordHighlightMode === 'pitch') return true;
    return hasStalePitchHighlightPair(settings, channels, 'subtitleHighlightColorSource', 'subtitleUnderlineColorSource');
}

function hasStalePitchHighlightPair(
    settings: LegacyReaderSettings,
    channels: Pick<ReaderSettings, ReaderColorChannelKey>,
    highlight: ReaderColorChannelKey,
    underline: ReaderColorChannelKey,
): boolean {
    return (isPreCurrentSavedSettingsPayload(settings) || hasOwn(settings, 'wordHighlightMode'))
        && isRawPitchPair(settings, highlight, underline)
        && channels[highlight] === 'pitch'
        && channels[underline] === 'pitch';
}

function isRawPitchPair(settings: LegacyReaderSettings, highlight: ReaderColorChannelKey, underline: ReaderColorChannelKey): boolean {
    return settings[highlight] === 'pitch' && settings[underline] === 'pitch';
}

function legacyHighlightColorSourceForAuto(settings: LegacyReaderSettings | null | undefined, fallback: Exclude<ReaderColorSource, 'auto'>): Exclude<ReaderColorSource, 'auto'> {
    const mode = legacyEffectiveWordHighlightMode(settings);
    if (mode === 'pitch') return fallback;
    return legacyReaderColorSourceForAuto(settings, fallback);
}

function legacyReaderColorSourceForAuto(settings: LegacyReaderSettings | null | undefined, fallback: Exclude<ReaderColorSource, 'auto'>): Exclude<ReaderColorSource, 'auto'> {
    const mode = legacyEffectiveWordHighlightMode(settings);
    return mode === 'status' ? fallback : mode ?? fallback;
}

function legacySubtitleHighlightColorSourceForAuto(settings: LegacyReaderSettings | null | undefined, fallback: Exclude<ReaderColorSource, 'auto'>): Exclude<ReaderColorSource, 'auto'> {
    const mode = legacyEffectiveWordHighlightMode(settings);
    if (mode === 'pitch') return fallback;
    return legacySubtitleColorSourceForAuto(settings, fallback);
}

function legacySubtitleColorSourceForAuto(settings: LegacyReaderSettings | null | undefined, fallback: Exclude<ReaderColorSource, 'auto'>): Exclude<ReaderColorSource, 'auto'> {
    const mode = legacyEffectiveWordHighlightMode(settings);
    if (!mode) return fallback;
    return mode === 'status' ? 'jpdb' : mode;
}

function legacyEffectiveWordHighlightMode(settings: LegacyReaderSettings | null | undefined): Exclude<LegacyWordHighlightMode, 'auto'> | null {
    if (!settings || !hasOwn(settings, 'wordHighlightMode')) return null;
    if (settings.wordHighlightMode === 'status' || settings.wordHighlightMode === 'pitch' || settings.wordHighlightMode === 'off') return settings.wordHighlightMode;
    return hasLegacyMiningStatusSource(settings) ? 'status' : 'pitch';
}

function hasLegacyMiningStatusSource(settings: LegacyReaderSettings): boolean {
    return Boolean(settings.ankiEnabled || (settings.jpdbMiningEnabled && settings.apiKey?.trim()));
}

function normalizeFuriganaMode(value: unknown, settings: Partial<ReaderSettings> | null | undefined): FuriganaMode {
    if (value === 'auto') return effectiveLegacyAutoFuriganaMode();
    if (isFuriganaMode(value)) return value;
    if (legacyBooleanSettingIs(settings, 'showFurigana', false)) return 'off';
    if (legacyBooleanSettingIs(settings, 'hideKnownFurigana', false)) return 'all';
    return DEFAULT_SETTINGS.furiganaMode;
}

// Legacy stored 'auto' also lands on the transparent default. Status- and
// difficulty-based hiding require an explicit current choice.
function effectiveLegacyAutoFuriganaMode(): Exclude<FuriganaMode, 'auto'> {
    return 'all';
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

function legacyBooleanSettingIs(settings: Partial<ReaderSettings> | null | undefined, key: keyof ReaderSettings, expected: boolean): boolean {
    return Boolean(settings && Object.prototype.hasOwnProperty.call(settings, key) && settings[key] === expected);
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
    settings: LegacyReaderSettings,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.wordHighlightColorSource,
): ConcreteReaderColorSource {
    const concrete = source === 'auto' ? legacyReaderColorSourceForAuto(settings, fallback) : source;
    return effectiveAvailableColorSource(settings, concrete, fallback);
}

export function effectiveReaderTextColorSource(
    settings: LegacyReaderSettings,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.wordTextColorSource,
): ConcreteReaderColorSource {
    return effectiveTextColorSource(settings, effectiveReaderColorSource(settings, source, fallback));
}

export function effectiveSubtitleColorSource(
    settings: LegacyReaderSettings,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource,
): ConcreteReaderColorSource {
    const concrete = source === 'auto' ? legacySubtitleColorSourceForAuto(settings, fallback) : source;
    if (concrete === 'status') return 'status';
    return effectiveAvailableColorSource(settings, concrete);
}

export function effectiveSubtitleTextColorSource(
    settings: LegacyReaderSettings,
    source: ReaderColorSource,
    fallback: ConcreteReaderColorSource = DEFAULT_COLOR_CHANNELS.subtitleTextColorSource,
): ConcreteReaderColorSource {
    return effectiveTextColorSource(settings, effectiveSubtitleColorSource(settings, source, fallback));
}

function effectiveTextColorSource(settings: LegacyReaderSettings, source: ConcreteReaderColorSource): ConcreteReaderColorSource {
    return effectiveAvailableColorSource(settings, source);
}

function effectiveAvailableColorSource(
    settings: LegacyReaderSettings,
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

function effectiveAvailableStatusSource(settings: LegacyReaderSettings, includeRequestedAnki = false): ConcreteReaderColorSource {
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
function hasLocalSrsStatusSource(settings: LegacyReaderSettings): boolean {
    return settings.yomuLocalSrsEnabled === true;
}

function hasSrsStateColorSource(settings: LegacyReaderSettings): boolean {
    return hasJpdbStatusSource(settings) || hasLocalSrsStatusSource(settings);
}

/**
 * True when some deck can answer "do I know this word?". The settings form
 * shows the no-source line when this is false, so an empty colour channel
 * always comes with a reason.
 */
export function hasStatusColorSource(settings: LegacyReaderSettings): boolean {
    return effectiveAvailableStatusSource(settings, true) !== 'off';
}

/** Names whichever deck feeds the state colour channel, for the picker labels. */
export function statusColorSourceLabel(settings: LegacyReaderSettings): string {
    if (hasJpdbStatusSource(settings)) return combinedApiCredentialLabel(apiCredentials(settings));
    if (hasLocalSrsStatusSource(settings)) return ACADEMY_SRS_LABEL;
    if (hasAnkiStatusSource(settings)) return 'Anki';
    return '';
}

function apiCredentials(settings: LegacyReaderSettings): { apiKey: string; jitenApiKey: string } {
    return { apiKey: settings.apiKey ?? '', jitenApiKey: settings.jitenApiKey ?? '' };
}

function hasJpdbStatusSource(settings: LegacyReaderSettings): boolean {
    const credentials = {
        apiKey: settings.apiKey ?? '',
        jitenApiKey: settings.jitenApiKey ?? '',
    };
    return Boolean(hasJpdbApiCredential(credentials) || hasJitenApiCredential(credentials));
}

function hasAnkiStatusSource(settings: LegacyReaderSettings): boolean {
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
    return effectiveLegacyAutoFuriganaMode();
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

export function normalizeOcrProvider(value: unknown, settings?: Partial<ReaderSettings> | null): OcrProvider {
    if (isBlankLegacyLocalOcrSetting(value, settings)) return DEFAULT_SETTINGS.ocrProvider;
    if (typeof value !== 'string') return DEFAULT_SETTINGS.ocrProvider;
    return OCR_PROVIDER_ALIASES[value] ?? (OCR_PROVIDERS.has(value as OcrProvider) ? value as OcrProvider : DEFAULT_SETTINGS.ocrProvider);
}

const OCR_PROVIDER_ALIASES: Record<string, OcrProvider> = {
    auto: 'google-lens',
    fast: 'google-lens',
    'page-text': 'google-lens',
    'custom-json': 'local-service',
};

const OCR_PROVIDERS = new Set<OcrProvider>(['google-lens', 'cloud-vision', 'local-service', 'off']);

function normalizeCloudVisionApiKey(value: unknown): string {
    return typeof value === 'string' ? value.trim() : DEFAULT_SETTINGS.ocrCloudVisionApiKey;
}

function isBlankLegacyLocalOcrSetting(value: unknown, settings: Partial<ReaderSettings> | null | undefined): boolean {
    if (value !== 'local-service' || !settings) return false;
    if (hasOwn(settings, 'ocrCloudVisionApiKey')) return false;
    return !(typeof settings.ocrEndpointUrl === 'string' && settings.ocrEndpointUrl.trim());
}

function normalizeOcrEngine(value: unknown): string {
    const normalized = normalizedOcrEngineInput(value);
    return normalized ? OCR_ENGINE_ALIASES.get(normalized) ?? normalized : DEFAULT_SETTINGS.ocrEngine;
}

function normalizedOcrEngineInput(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export async function loadSettings(): Promise<ReaderSettings> {
    if (settingsResetInProgress) return mergeSettings(null);
    try {
        // This scalar is the durable user-intent boundary for a preference that
        // changes page startup behavior at document-start. Read it before the
        // larger settings blob so a stale whole-object writer can never become
        // authoritative merely because it finishes later.
        const storedPreferredJapaneseSiteLanguage = await gmStorageGet<unknown>(
            PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
            undefined,
        );
        const intentLedger = await readSettingsIntentLedger();
        const cacheStandaloneBaseline = isHostedYomuOrigin()
            && !hasAsyncGmStorageBackend()
            && localFallbackStoredValue<Partial<ReaderSettings> | null>(SETTINGS_STORAGE_KEY, null) === null;
        const currentRecord = settingsRecord(await gmStorageGet<Partial<ReaderSettings> | null>(SETTINGS_STORAGE_KEY, null));
        let settings = mergeSettings(currentRecord);
        let recoveredLegacySettings = false;

        // Keys the learner has expressed a deliberate choice about. Recovery below
        // still uses "equals the default" to spot a gap -- it has to, because Yomu
        // persists the WHOLE settings object, so presence in the stored record tells
        // you nothing -- but a key in this set is never treated as a gap. That is what
        // makes clearing a field stick: an explicit '' equals the default, so without
        // this a donor store replayed the old value and re-persisted it (GitHub #36).
        // Keys recovered from an earlier donor join the set too, so the first donor
        // still wins, exactly as the bare equality test used to arrange.
        const settledKeys = new Set<string>(settingsIntentKeys(intentLedger));

        for (const key of LEGACY_SETTINGS_STORAGE_KEYS) {
            const legacyRecord = settingsRecord(await gmStorageGet<Partial<ReaderSettings> | null>(key, null));
            if (!legacyRecord) continue;

            const recovery = recoverLegacySettings(settings, mergeSettings(legacyRecord), settledKeys, DEFAULT_SETTINGS);
            settings = recovery.settings;
            recoveredLegacySettings = recoveredLegacySettings || recovery.changed;
        }

        const strandedRecord = strandedHostedLocalSettingsRecord();
        if (strandedRecord) {
            const recovery = recoverStrandedHostedSettings(settings, mergeSettings(strandedRecord), settledKeys, DEFAULT_SETTINGS);
            settings = recovery.settings;
            recoveredLegacySettings = recoveredLegacySettings || recovery.changed;
        }

        settings = {
            ...settings,
            preferJapaneseSiteLanguage: await authoritativePreferredJapaneseSiteLanguage(
                storedPreferredJapaneseSiteLanguage,
                settings.preferJapaneseSiteLanguage,
            ),
        };
        settings = mergeSettings(applySettingsIntent(settings, intentLedger) as LegacyReaderSettings);

        if (recoveredLegacySettings) await persistSettings(settings, NO_EXPLICIT_USER_CHOICE);
        else if (isHostedYomuOrigin() && (hasAsyncGmStorageBackend() || cacheStandaloneBaseline)) {
            cacheManagedValueForHostedStartup(SETTINGS_STORAGE_KEY, stripUnsupportedSettings(settings) ?? settings);
        }
        return settings;
    } catch (error) {
        log.warn('Settings load failed', { error });
        return mergeSettings(null);
    }
}


// Hosted pages (yomureader.com and friends) historically had no GM backend, so
// settings edited there fell back to that origin's localStorage and never
// reached the shared GM store the userscript reads on every other site. Once a
// GM backend (usually the userscript storage bridge) is available, fold those
// stranded values back in — but only where the shared settings still sit at
// their defaults, so the installed copy's explicit choices always win.
function strandedHostedLocalSettingsRecord(): Partial<ReaderSettings> | null {
    if (!isHostedYomuOrigin() || !hasAsyncGmStorageBackend()) return null;
    return settingsRecord(localFallbackStoredValue<Partial<ReaderSettings> | null>(SETTINGS_STORAGE_KEY, null));
}

// Called from the userscript entry at document-start on trusted hosted origins
// (yomureader.com). Root cause it addresses (iPad Safari): a user's API key and
// theme entered through the hosted-app Settings land in THIS origin's
// localStorage, but every other site's userscript reads the shared GM store —
// so the token/theme never leave yomureader.com and youtube.com falls back to
// defaults (light theme, no key). The lazy loadSettings recovery only fires
// when the hosted PAGE re-loads after its bridge is ready, which can miss.
// The userscript SANDBOX, by contrast, has DIRECT GM_setValue and shares this
// origin's localStorage, so it can promote the stranded values into GM
// immediately and unconditionally. Reuses recoverStrandedHostedSettings, so it
// only fills GM fields still at their default — a stale hosted default can
// never clobber an explicit choice already in GM.
export async function promoteStrandedHostedSettingsToGmStorage(): Promise<boolean> {
    if (!isHostedYomuOrigin() || !hasAsyncGmStorageBackend()) return false;
    try {
        const gmRecord = settingsRecord(await gmStorageGet<Partial<ReaderSettings> | null>(SETTINGS_STORAGE_KEY, null));
        const strandedRecord = settingsRecord(localFallbackStoredValue<Partial<ReaderSettings> | null>(SETTINGS_STORAGE_KEY, null));
        if (!strandedRecord) return false;
        // gmStorageGet already migrates a whole stranded blob into an EMPTY GM
        // store as a side effect; running it first fills that case. Then
        // reconcile field-by-field for a partially-populated GM, filling only
        // fields the GM store does not HAVE so an explicit GM choice is never
        // clobbered. Either path leaves the shared store holding the hosted
        // key/theme, so youtube.com stops falling back to defaults.
        //
        // "does not have", not "is still at its default": a GM field the learner
        // deliberately cleared equals the default, and treating that as unset let
        // the hosted mirror replay the old value on every visit (GitHub #36).
        const current = mergeSettings(gmRecord);
        const recovery = recoverStrandedHostedSettings(
            current,
            mergeSettings(strandedRecord),
            new Set<string>(gmRecord ? Object.keys(gmRecord) : []),
            DEFAULT_SETTINGS,
        );
        if (recovery.changed) await persistSettings(recovery.settings, NO_EXPLICIT_USER_CHOICE);
        return true;
    } catch (error) {
        log.warn('Stranded hosted settings promotion failed', { error });
        return false;
    }
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
        });
    };
    const unsubscribers = [
        subscribeToStoredValueChanges(SETTINGS_STORAGE_KEY, refresh),
        subscribeToStoredValueChanges(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, refresh),
        subscribeToStoredValueChanges(EXPLICIT_USER_SETTINGS_STORAGE_KEY, refresh),
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
        const normalizedSettings = mergeSettings(settings as LegacyReaderSettings);
        if (intent.persistPreferredJapaneseSiteLanguage) {
            await persistPreferredJapaneseSiteLanguage(normalizedSettings.preferJapaneseSiteLanguage);
        }
        await persistSettings(
            normalizedSettings,
            intent.explicitUserChoiceKeys ?? NO_EXPLICIT_USER_CHOICE,
            intent.clearExplicitUserChoiceKeys,
        );
    } catch (error) {
        log.warn('Settings save failed', { error });
        throw error;
    }
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

async function readSettingsIntentLedger(): Promise<SettingsIntentLedger> {
    return settingsIntentLedgerFromStorage(
        await gmStorageGet<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null),
        await gmStorageGet<unknown>(EXPLICIT_USER_SETTINGS_STORAGE_KEY, null),
    );
}

async function persistSettings(
    settings: ReaderSettings,
    explicitUserChoiceKeys: readonly (keyof ReaderSettings)[],
    clearExplicitUserChoiceKeys: readonly (keyof ReaderSettings)[] = [],
): Promise<void> {
    const normalizedSettings = mergeSettings(settings as LegacyReaderSettings);
    let storedSettings: Partial<ReaderSettings> = normalizedSettings;
    await withGmStorageLease(SETTINGS_PERSISTENCE_STORAGE_LEASE, async () => {
        // Only the CALLER can say what the learner touched. A save may carry a stale
        // whole-object snapshot, so differences against the stored record are not
        // intent -- inferring them here clobbers another context's explicit choice.
        const ledger = await readSettingsIntentLedger();
        const withdrawn = clearSettingsIntent(ledger, coupledSettingsIntentKeys(clearExplicitUserChoiceKeys));
        const nextLedger = recordSettingsIntent(
            withdrawn,
            coupledSettingsIntentKeys(explicitUserChoiceKeys),
            normalizedSettings,
        );
        if (nextLedger !== ledger) await gmStorageSet(SETTINGS_INTENT_LEDGER_STORAGE_KEY, nextLedger);
        storedSettings = mergeSettings(
            applySettingsIntent(normalizedSettings, nextLedger) as LegacyReaderSettings,
        );
        const supportedSettings = stripUnsupportedSettings(storedSettings) ?? storedSettings;
        await gmStorageSet(SETTINGS_STORAGE_KEY, supportedSettings);
        storedSettings = supportedSettings;
    });
    dispatchSettingsChange(storedSettings);
}

function dispatchSettingsChange(settings: Partial<ReaderSettings>): void {
    try {
        dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, { settings }));
    } catch {
        // Some test shims do not expose CustomEvent; saving settings should still succeed.
    }
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
    for (const key of SETTINGS_STORAGE_KEYS) await gmStorageDelete(key);
    await gmStorageDelete(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY);
    await gmStorageDelete(EXPLICIT_USER_SETTINGS_STORAGE_KEY);
    await gmStorageDelete(SETTINGS_INTENT_LEDGER_STORAGE_KEY);
}

export async function settingsStorageKeysStillPresent(): Promise<string[]> {
    const keys: string[] = [];
    for (const key of [
        ...SETTINGS_STORAGE_KEYS,
        PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
        EXPLICIT_USER_SETTINGS_STORAGE_KEY,
        SETTINGS_INTENT_LEDGER_STORAGE_KEY,
    ]) {
        if (await storedValueExists(key)) keys.push(key);
    }
    return keys;
}

function isAudioSourceType(value: unknown): value is AudioSourceType {
    return typeof value === 'string' && AUDIO_SOURCE_TYPES.has(value as AudioSourceType);
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

export function normalizeAudioSources(value: unknown, legacyUrl?: string): AudioSourceSetting[] {
    const sources = Array.isArray(value)
        ? value.map(normalizeAudioSource).filter((source): source is AudioSourceSetting => source !== null)
        : [];
    if (Array.isArray(value)) return sources.length ? ensureHostedAudioSourceFirst(withBunproAudioSource(migrateLegacyDefaultAudioSources(sources))) : sources;

    if (typeof legacyUrl === 'string' && legacyUrl.trim()) {
        return ensureHostedAudioSourceFirst([{ type: 'custom-json', url: legacyUrl.trim(), voice: '', enabled: true }]);
    }
    return DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

function ensureHostedAudioSourceFirst(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const hosted = sources.find(isHostedAudioSource) ?? DEFAULT_AUDIO_SOURCES[0]!;
    return [
        { ...hosted },
        ...sources.filter(source => !isHostedAudioSource(source)).map(source => ({ ...source })),
    ];
}

function isHostedAudioSource(source: AudioSourceSetting): boolean {
    return source.type === 'custom-json' && source.url.trim() === YOMU_HOSTED_AUDIO_URL;
}

function migrateLegacyDefaultAudioSources(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    if (!isUntouchedLegacyDefaultAudioSources(sources)) return sources;

    const migrated = sources.map(source => ({ ...source }));
    ensureBuiltInAudioSource(migrated, { type: 'jpdb-tts', url: '', voice: '', enabled: false }, 'text-to-speech');
    ensureBuiltInAudioSource(migrated, { type: 'jiten-tts', url: '', voice: '', enabled: false }, 'jpdb-tts');
    for (const source of migrated) {
        if (isDefaultOffAudioSource(source)) source.enabled = false;
    }
    return migrated;
}

function isUntouchedLegacyDefaultAudioSources(sources: AudioSourceSetting[]): boolean {
    return audioSourceListMatches(sources, LEGACY_DEFAULT_AUDIO_SOURCES_WITHOUT_API_TTS)
        || audioSourceListMatches(sources, LEGACY_DEFAULT_AUDIO_SOURCES_WITH_API_TTS);
}

function audioSourceListMatches(sources: AudioSourceSetting[], expected: AudioSourceSetting[]): boolean {
    return sources.length === expected.length
        && expected.every((source, index) => audioSourceMatches(sources[index], source));
}

function audioSourceMatches(source: AudioSourceSetting | undefined, expected: AudioSourceSetting): boolean {
    return Boolean(source
        && source.type === expected.type
        && source.url === expected.url
        && source.voice === expected.voice
        && source.enabled === expected.enabled);
}

function isDefaultOffAudioSource(source: AudioSourceSetting): boolean {
    return DEFAULT_OFF_AUDIO_SOURCE_TYPES.has(source.type) && !source.url.trim() && !source.voice.trim();
}

// Bunpro pronunciation audio is a later addition: seed it (OPT-IN, disabled)
// into every saved source list, not just untouched legacy defaults.
function withBunproAudioSource(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const result = sources.map(source => ({ ...source }));
    ensureBuiltInAudioSource(result, { type: 'bunpro', url: '', voice: '', enabled: false }, 'jiten-tts');
    return result;
}

function ensureBuiltInAudioSource(sources: AudioSourceSetting[], source: AudioSourceSetting, beforeType: AudioSourceType): void {
    if (sources.some(candidate => candidate.type === source.type)) return;
    const insertIndex = sources.findIndex(candidate => candidate.type === beforeType);
    if (insertIndex < 0) sources.push(source);
    else sources.splice(insertIndex, 0, source);
}
