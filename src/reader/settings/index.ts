import { Logger } from '../app/logger';
import { SETTINGS_CHANGE_EVENT } from '../app/constants';
import { dispatchWindowEvent, createWindowCustomEvent } from '../platform/window-events';
import { BRAND_COLOR_TOKENS, DEFAULT_PITCH_COLOR_TOKENS, DEFAULT_WORD_COLOR_TOKENS, OVERLAY_COLOR_TOKENS } from '../theme/color-tokens';
import { normalizeAnkiFieldMappings } from './anki-field-mappings';
import { hasJitenApiCredential, hasJpdbApiCredential, isJitenApiCredential } from './api-credential';
import { DEFAULT_DICTIONARY_LOOKUP_LINKS, normalizeDictionaryLookupLinkSettings, normalizeDictionaryPreferences } from './dictionary';
import { hasOwn, stringValue, trimmedText } from './values';
import { gmStorageDelete, gmStorageGet, gmStorageSet, storedValueExists } from '../app/storage';
import type { AnkiTemplateMode, AudioAutoPlayMode, AudioSourceSetting, AudioSourceType, AudioTtsMode, FuriganaMode, ImmersionExampleSource, ImmersionKitCategory, ImmersionKitSort, InterfaceLanguage, OcrProvider, ReaderColorSource, ReaderSettings } from '../app/types';
export { formatShortcutEvent, matchesShortcut, shortcutIsPressed } from './shortcuts';
export { COPY_LOOKUP_LINK, JISHO_LOOKUP_LINK, JITEN_LOOKUP_LINK, JPDB_LOOKUP_LINK, MAX_DICTIONARY_LOOKUP_LINKS, defaultDictionaryLookupLinks, mergeDictionaryPreferences, normalizeDictionaryLookupLinks, normalizeDictionaryPreferences } from './dictionary';

export const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const LEGACY_SETTINGS_STORAGE_KEYS = [
    'jpdb-reader-settings',
    'yomu-reader-settings',
    'yomu-settings',
] as const;
export const SETTINGS_STORAGE_KEYS = [
    SETTINGS_STORAGE_KEY,
    ...LEGACY_SETTINGS_STORAGE_KEYS,
] as const;

const log = Logger.scope('Settings');
let settingsResetInProgress = false;

const DEFAULT_AUDIO_URL =
    'http://localhost:9090/?term={term}&reading={reading}';

const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
export const DEFAULT_OVERLAY_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
export const DEFAULT_OVERLAY_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;
export const DEFAULT_OVERLAY_BACKGROUND_COLOR = OVERLAY_COLOR_TOKENS.background;
export const DEFAULT_READER_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DEFAULT_POPUP_FONT_FAMILY = '"Nunito Sans", "Extra Sans JP", "Noto Sans Symbols2", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans GB", "Meiryo", sans-serif';
const DEFAULT_SUBTITLE_FONT_FAMILY = DEFAULT_READER_FONT_FAMILY;

const DEFAULT_WORD_COLORS = DEFAULT_WORD_COLOR_TOKENS;

const DEFAULT_PITCH_COLORS = DEFAULT_PITCH_COLOR_TOKENS;

export const AUDIO_GUIDE_URL = 'https://yomitan.wiki/advanced/#audio';

const AUDIO_SOURCE_TYPE_VALUES: AudioSourceType[] = [
    'jpod101',
    'language-pod-101',
    'jisho',
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
    { type: 'jpod101', url: '', voice: '', enabled: true },
    { type: 'language-pod-101', url: '', voice: '', enabled: true },
    { type: 'jisho', url: '', voice: '', enabled: true },
    { type: 'jiten-tts', url: '', voice: '', enabled: true },
    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
    { type: 'text-to-speech', url: '', voice: '', enabled: true },
];

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_TYPE_VALUES);
const LEGACY_DEFAULT_AUDIO_SOURCE_TYPES: AudioSourceType[] = ['jpod101', 'language-pod-101', 'jisho', 'text-to-speech'];
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
] as const;
const LOOKUP_PAGE_ENHANCEMENT_KEYS = [
    'jpdbPageEnhancementsEnabled',
    'jpdbPageWordEnhancementsEnabled',
    'jpdbPageKanjiEnhancementsEnabled',
] as const;
const MINING_BOOLEAN_SETTING_KEYS = [
    'jpdbMiningEnabled',
    'dictionarySourcesInitiallyExpanded',
] as const;
const SUBTITLE_BOOLEAN_SETTING_KEYS = [
    'subtitleNativeBlurred',
    'subtitleKaraokeMode',
    'subtitlePausePanel',
    'subtitleAutoCopyLine',
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
    'pitchColorKifuku',
    'pitchColorUnknown',
] as const satisfies readonly AccentColorSettingKey[];
const ANKI_TEMPLATE_MODES = ['context', 'recognition'] as const satisfies readonly AnkiTemplateMode[];
const INTERFACE_LANGUAGES = ['en', 'ja', 'auto'] as const satisfies readonly InterfaceLanguage[];
const THEMES = ['dark', 'light', 'auto'] as const satisfies readonly ReaderSettings['theme'][];
const POPUP_MODES = ['sheet', 'popover', 'auto'] as const satisfies readonly ReaderSettings['popupMode'][];
const POPOVER_HEIGHT_MODES = ['fixed', 'available'] as const satisfies readonly ReaderSettings['popoverHeightMode'][];
const AUDIO_AUTO_PLAY_MODES = ['off', 'all', 'hover', 'tap'] as const satisfies readonly AudioAutoPlayMode[];
const AUDIO_TTS_MODES = ['source-order', 'fallback'] as const satisfies readonly AudioTtsMode[];
const IMMERSION_KIT_CATEGORIES = ['anime', 'drama', 'games', 'all'] as const satisfies readonly ImmersionKitCategory[];
const IMMERSION_KIT_SORTS = ['sentence_length:desc', 'sentence_length:asc'] as const satisfies readonly ImmersionKitSort[];
const IMMERSION_EXAMPLE_SOURCES = ['nadeshiko', 'combined', 'immersion-kit'] as const satisfies readonly ImmersionExampleSource[];
const SUBTITLE_CONTROL_MODES = ['always', 'hidden', 'auto'] as const satisfies readonly ReaderSettings['subtitleControlsMode'][];
const SUBTITLE_TRANSCRIPT_PLACEMENTS = ['left', 'bottom', 'right'] as const satisfies readonly ReaderSettings['subtitleTranscriptPlacement'][];
const NEW_TAB_SOURCES = ['jpdb', 'anki', 'auto', 'dictionary'] as const satisfies readonly ReaderSettings['newTabSource'][];
const NEW_TAB_JPDB_REVIEW_MODES = ['auto', 'api-vocabulary', 'live-review'] as const satisfies readonly ReaderSettings['newTabJpdbReviewMode'][];
const NEW_TAB_KANJI_KEYWORD_SOURCES = ['auto', 'rtk', 'jpdb', 'local'] as const satisfies readonly ReaderSettings['newTabKanjiKeywordSource'][];

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

type LegacyReaderSettings = Partial<ReaderSettings> & { wordHighlightMode?: LegacyWordHighlightMode };

export const DEFAULT_SETTINGS: ReaderSettings = {
    apiKey: '',
    jitenApiKey: '',
    onboardingSeen: false,
    interfaceLanguage: 'ja',
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
    pitchColorKifuku: DEFAULT_PITCH_COLORS.kifuku,
    pitchColorUnknown: DEFAULT_PITCH_COLORS.unknown,
    ...DEFAULT_COLOR_CHANNELS,
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    jpdbPageEnhancementsEnabled: true,
    jpdbPageWordEnhancementsEnabled: true,
    jpdbPageKanjiEnhancementsEnabled: true,
    jpdbKanjiEnabled: true,
    jpdbKanjiPriority: 10,
    kanjiImmersionKitEnabled: true,
    kanjiImmersionKitPriority: 60,
    uchisenEnabled: true,
    uchisenPriority: 50,
    rtkEnabled: true,
    rtkPriority: 20,
    kanjivgEnabled: true,
    kanjivgPriority: 0,
    kanjiOriginsEnabled: true,
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
    immersionKitExampleSource: 'immersion-kit',
    nadeshikoApiKey: '',
    immersionKitPriority: 80,
    immersionKitLimitEnabled: true,
    immersionKitLimit: 3,
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
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    lookupOnMiddleMouse: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 80,
    popupActivationMode: 'hover',
    scanModifierKey: 'shift',
    showFloatingButton: true,
    newTabEnabled: false,
    newTabAnkiEnabled: false,
    newTabAnkiDisabledDecks: [],
    newTabSource: 'auto',
    newTabJpdbDeck: 'all',
    newTabJpdbReviewMode: 'auto',
    corsProxyUrl: 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev',
    newTabKanjiKeywordSource: 'auto',
    newTabParsingEnabled: true,
    newTabFrontSentenceEnabled: true,
    newTabOfflineEnabled: true,
    newTabOfflineLimit: 50,
    newTabDailyGoalMinutes: 60,
    newTabKanjiUnlockEnabled: true,
    newTabStopAtBatchEnd: false,
    newTabSwipeReviews: true,
    newTabKanjiAutogradeEnabled: true,
    newTabKanjiAutoSubmit: false,
    puckPositionX: undefined,
    puckPositionY: undefined,
    showFurigana: true,
    // UT-47: auto resolves to known-status hiding once an SRS source exists
    // (the user-requested default), difficult-kanji otherwise.
    furiganaMode: 'auto',
    furiganaHiddenStateGroups: ['known', 'due', 'failed'],
    wordColorStates: 'all',
    showPitchAccent: true,
    suppressRedundantWordUi: false,
    sheetCloseButtonOnLeft: false,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrVideoPauseFrames: true,
    ocrShowTextOverlay: false,
    ocrProvider: 'google-lens',
    ocrEndpointUrl: '',
    ocrEngine: 'auto',
    ocrCloudVisionApiKey: '',
    ocrLanguage: 'ja-JP',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 45000,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrTextColor: DEFAULT_OVERLAY_TEXT_COLOR,
    ocrOutlineColor: DEFAULT_OVERLAY_OUTLINE_COLOR,
    ocrBackgroundColor: DEFAULT_OVERLAY_BACKGROUND_COLOR,
    ocrBackgroundOpacity: 0.36,
    ocrFontScale: 1,
    localDictionariesEnabled: true,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    kanjiDictionariesPriority: 30,
    dictionarySourcesInitiallyExpanded: true,
    dictionaryPreferences: [],
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => ({ ...link })),
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: false,
    subtitleSecondaryVisible: false,
    subtitleNativeBlurred: true,
    subtitleKaraokeMode: true,
    subtitleTranscriptVisible: false,
    subtitlePausePanel: false,
    subtitleTranscriptPlacement: 'right',
    subtitleTranscriptAutoScroll: true,
    subtitleAutoCopyLine: false,
    subtitleControlsMode: 'auto',
    subtitleFontSize: 28,
    subtitleBottomOffset: 12,
    subtitleTextColor: DEFAULT_OVERLAY_TEXT_COLOR,
    subtitleOutlineColor: DEFAULT_OVERLAY_OUTLINE_COLOR,
    subtitleBackgroundColor: DEFAULT_OVERLAY_BACKGROUND_COLOR,
    subtitleBackgroundOpacity: 0,
    subtitleFontFamily: DEFAULT_SUBTITLE_FONT_FAMILY,
    subtitleFontWeight: 760,
    subtitleMiningPause: false,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    youtubeShowChannelRecommendations: true,
    preferJapaneseSiteLanguage: true,
    // Keep Anki opt-in: fresh installs/factory resets cannot assume Anki exists, and the send button costs real space on mobile popups.
    ankiEnabled: false,
    ankiSectionEnabled: false,
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
    studyGrammarEnabled: true,
    enableLogging: false,
    ankiTags: 'yomu',
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    ankiFieldMappings: {},
    theme: 'light',
    popupMode: 'auto',
    stickyBottomSheet: false,
    popoverBackdropEnabled: true,
    popoverWidth: 520,
    popoverHeight: 540,
    popoverHeightMode: 'fixed',
    readerFontFamily: DEFAULT_READER_FONT_FAMILY,
    popupFontFamily: DEFAULT_POPUP_FONT_FAMILY,
    popupFontWeight: 400,
    jpdbMiningEnabled: true,
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
        scanPage: 'Alt+J',
        hoverLookup: '',
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousLookupWord: 'Alt+Shift+ArrowLeft',
        nextLookupWord: 'Alt+Shift+ArrowRight',
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
        toggleYoutubeImmersion: 'Alt+Y',
        scanImages: 'Alt+I',
        massReviewVisible: 'Alt+M',
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
    const settingsValue = migrateLegacyDefaultMobileSettings(value);
    const audio = normalizeAudioSettings(settingsValue);
    const supportedSettings = stripUnsupportedSettings(settingsValue);
    const apiCredentials = normalizeApiCredentialSettings(settingsValue);
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
        dictionaryPreferences: normalizeDictionaryPreferences(settingsValue?.dictionaryPreferences),
        dictionaryLookupLinks: normalizeDictionaryLookupLinkSettings(settingsValue),
        shortcuts: normalizeShortcutSettings(settingsValue),
    };
}

export function normalizeReaderSettings(value: Partial<ReaderSettings> | null | undefined): ReaderSettings {
    return mergeSettings(value as LegacyReaderSettings | null);
}

function normalizeApiCredentialSettings(value: LegacyReaderSettings | null | undefined): Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'> {
    const apiKey = trimmedStringSetting(value, 'apiKey', DEFAULT_SETTINGS.apiKey);
    const jitenApiKey = trimmedStringSetting(value, 'jitenApiKey', DEFAULT_SETTINGS.jitenApiKey);
    // UT-56: JPDB and Jiten credentials COEXIST — the study queue loads both
    // providers in parallel, so a Jiten key must not wipe the JPDB key (that
    // wipe made the study page silently diverge from jpdb Learn). A
    // jiten-prefixed value in the JPDB slot still routes to the Jiten slot.
    if (isJitenApiCredential(apiKey)) return { apiKey: '', jitenApiKey: jitenApiKey || apiKey };
    return { apiKey, jitenApiKey };
}

function stripUnsupportedSettings(value: LegacyReaderSettings | null | undefined): Partial<ReaderSettings> | null {
    if (!value) return null;
    const supportedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => supportedKeys.has(key)),
    ) as Partial<ReaderSettings>;
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
    return shortcuts;
}

function normalizeLookupSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        interfaceLanguage: normalizeInterfaceLanguage(value?.interfaceLanguage),
        jpdbDefinitionsPriority: clampNumber(value?.jpdbDefinitionsPriority, 0, 999, DEFAULT_SETTINGS.jpdbDefinitionsPriority),
        ...normalizeBooleanSettingGroup(value, LOOKUP_PAGE_ENHANCEMENT_KEYS),
        lookupOnClick: booleanSettingWithFallback(value, 'lookupOnClick', true),
        lookupOnHover: booleanSettingWithFallback(value, 'lookupOnHover', value?.popupActivationMode !== 'click'),
        lookupOnMiddleMouse: booleanSettingWithFallback(value, 'lookupOnMiddleMouse', true),
        hoverOpenDelayMs: clampNumber(value?.hoverOpenDelayMs, 0, 1500, DEFAULT_SETTINGS.hoverOpenDelayMs),
        hoverCloseDelayMs: clampNumber(value?.hoverCloseDelayMs, 0, 3000, DEFAULT_SETTINGS.hoverCloseDelayMs),
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
        newTabKanjiAutogradeEnabled: booleanSetting(value, 'newTabKanjiAutogradeEnabled'),
        newTabKanjiAutoSubmit: booleanSetting(value, 'newTabKanjiAutoSubmit'),
    };
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
        furiganaHiddenStateGroups: normalizeFuriganaHiddenStateGroups(settings.furiganaHiddenStateGroups),
        wordColorStates: settings.wordColorStates === 'new-only' ? 'new-only' : 'all',
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
        ...normalizeBooleanSettingGroup(value, MINING_BOOLEAN_SETTING_KEYS),
    };
}

function normalizeMediaSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    const settings = value ?? {};
    return {
        audioViaBlob: booleanSetting(value, 'audioViaBlob'),
        audioFallbackChimeEnabled: booleanSetting(value, 'audioFallbackChimeEnabled'),
        immersionKitExampleSource: normalizeImmersionExampleSource(settings.immersionKitExampleSource),
        nadeshikoApiKey: trimmedStringSetting(value, 'nadeshikoApiKey', DEFAULT_SETTINGS.nadeshikoApiKey),
        immersionKitPriority: clampNumber(settings.immersionKitPriority, 0, 999, DEFAULT_SETTINGS.immersionKitPriority),
        immersionKitLimitEnabled: booleanSetting(value, 'immersionKitLimitEnabled'),
        immersionKitLimit: clampNumber(settings.immersionKitLimit, 1, 12, DEFAULT_SETTINGS.immersionKitLimit),
        immersionKitMinLength: clampNumber(settings.immersionKitMinLength, 0, 120, DEFAULT_SETTINGS.immersionKitMinLength),
        immersionKitMaxLength: clampNumber(settings.immersionKitMaxLength, 0, 240, DEFAULT_SETTINGS.immersionKitMaxLength),
        immersionKitCategory: normalizeImmersionKitCategory(settings.immersionKitCategory),
        immersionKitSort: normalizeImmersionKitSort(settings.immersionKitSort),
        immersionKitPlaybackRate: clampNumber(settings.immersionKitPlaybackRate, 0.5, 2, DEFAULT_SETTINGS.immersionKitPlaybackRate),
        immersionKitRevealTranslationOnClick: booleanSetting(value, 'immersionKitRevealTranslationOnClick'),
        immersionKitPlayOnHover: booleanSetting(value, 'immersionKitPlayOnHover'),
        immersionKitPlayOnImageClick: booleanSetting(value, 'immersionKitPlayOnImageClick'),
        ocrProvider: normalizeOcrProvider(settings.ocrProvider, value),
        ocrEngine: normalizeOcrEngine(settings.ocrEngine),
        ocrCloudVisionApiKey: normalizeCloudVisionApiKey(settings.ocrCloudVisionApiKey),
        ocrTextColor: sanitizeAccentColor(settings.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(settings.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor),
        ocrBackgroundColor: sanitizeAccentColor(settings.ocrBackgroundColor, DEFAULT_SETTINGS.ocrBackgroundColor),
        ocrBackgroundOpacity: clampNumber(settings.ocrBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.ocrBackgroundOpacity),
        ocrFontScale: clampNumber(settings.ocrFontScale, 0.7, 1.8, DEFAULT_SETTINGS.ocrFontScale),
    };
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

function normalizeInterfaceLanguage(value: unknown): InterfaceLanguage {
    return normalizeOption(value, INTERFACE_LANGUAGES, DEFAULT_SETTINGS.interfaceLanguage);
}

function normalizeTheme(value: unknown): ReaderSettings['theme'] {
    return normalizeOption(value, THEMES, DEFAULT_SETTINGS.theme);
}

function normalizePopupMode(value: unknown): ReaderSettings['popupMode'] {
    return normalizeOption(value, POPUP_MODES, DEFAULT_SETTINGS.popupMode);
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
    if (isFuriganaMode(value)) return value;
    if (legacyBooleanSettingIs(settings, 'showFurigana', false)) return 'off';
    if (legacyBooleanSettingIs(settings, 'hideKnownFurigana', false)) return 'all';
    return DEFAULT_SETTINGS.furiganaMode;
}

function isFuriganaMode(value: unknown): value is FuriganaMode {
    return value === 'auto' || value === 'all' || value === 'difficult-kanji' || value === 'known-status' || value === 'hover' || value === 'off';
}

const FURIGANA_STATE_GROUPS: ReadonlySet<string> = new Set(['new', 'learning', 'known', 'due', 'failed']);

function normalizeFuriganaHiddenStateGroups(value: unknown): ReaderSettings['furiganaHiddenStateGroups'] {
    if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.furiganaHiddenStateGroups];
    const groups = value.filter((item): item is ReaderSettings['furiganaHiddenStateGroups'][number] =>
        typeof item === 'string' && FURIGANA_STATE_GROUPS.has(item));
    return [...new Set(groups)];
}

function legacyBooleanSettingIs(settings: Partial<ReaderSettings> | null | undefined, key: keyof ReaderSettings, expected: boolean): boolean {
    return Boolean(settings && Object.prototype.hasOwnProperty.call(settings, key) && settings[key] === expected);
}

function normalizeDeckIdSetting(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function hasPersonalizedFuriganaSource(settings: ReaderSettings): boolean {
    return Boolean(hasJpdbApiCredential(settings) || hasJitenApiCredential(settings) || settings.ankiEnabled);
}

export function shouldLookupAnkiStatus(settings: Partial<ReaderSettings>): boolean {
    return settings.ankiEnabled === true;
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
    if (source === 'jpdb' && !hasJpdbStatusSource(settings)) {
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
    const hasJpdb = hasJpdbStatusSource(settings);
    const hasAnki = hasAnkiStatusSource(settings) || Boolean(includeRequestedAnki && settings.ankiEnabled && hasRequestedAnkiColorSource(settings));
    if (hasJpdb && hasAnki) return 'status';
    if (hasJpdb) return 'jpdb';
    if (hasAnki) return 'anki';
    return 'off';
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
    return hasPersonalizedFuriganaSource(settings) ? 'known-status' : 'difficult-kanji';
}

function isExplicitFuriganaMode(value: FuriganaMode): value is Exclude<FuriganaMode, 'auto' | 'off'> {
    return EXPLICIT_FURIGANA_MODES.has(value);
}

export function sanitizeAccentColor(value: unknown, fallback: string = DEFAULT_ACCENT_COLOR): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
}

export function accentToRgba(color: string, alpha: number): string {
    const safe = sanitizeAccentColor(color);
    const red = parseInt(safe.slice(1, 3), 16);
    const green = parseInt(safe.slice(3, 5), 16);
    const blue = parseInt(safe.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
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
        const settings = mergeSettings(await gmStorageGet<Partial<ReaderSettings> | null>(SETTINGS_STORAGE_KEY, null));
        return settings;
    } catch (error) {
        log.warn('Settings load failed', { error });
        return mergeSettings(null);
    }
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
    if (settingsResetInProgress) {
        log.warn('Skipped save during reset');
        return;
    }
    try {
        const normalizedSettings = mergeSettings(settings as LegacyReaderSettings);
        const storedSettings = stripUnsupportedSettings(normalizedSettings) ?? normalizedSettings;
        await gmStorageSet(SETTINGS_STORAGE_KEY, storedSettings);
        dispatchSettingsChange(storedSettings);
    } catch (error) {
        log.warn('Settings save failed', { error });
        throw error;
    }
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
}

export function endSettingsResetGuard(): void {
    settingsResetInProgress = false;
}

export async function deleteSettingsStorage(): Promise<void> {
    for (const key of SETTINGS_STORAGE_KEYS) await gmStorageDelete(key);
}

export async function settingsStorageKeysStillPresent(): Promise<string[]> {
    const keys: string[] = [];
    for (const key of SETTINGS_STORAGE_KEYS) {
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
    return {
        type: record.type,
        url: stringValue(record.url),
        voice: stringValue(record.voice),
        enabled: audioSourceEnabled(record.enabled),
    };
}

function audioSourceRecord(value: unknown): Partial<AudioSourceSetting> & { type?: unknown; url?: unknown; voice?: unknown; enabled?: unknown } | null {
    return value && typeof value === 'object'
        ? value as Partial<AudioSourceSetting> & { type?: unknown; url?: unknown; voice?: unknown; enabled?: unknown }
        : null;
}

function audioSourceEnabled(value: unknown): boolean {
    return typeof value === 'boolean' ? value : true;
}

export function normalizeAudioSources(value: unknown, legacyUrl?: string): AudioSourceSetting[] {
    const sources = Array.isArray(value)
        ? value.map(normalizeAudioSource).filter((source): source is AudioSourceSetting => source !== null)
        : [];
    if (Array.isArray(value)) return migrateLegacyDefaultAudioSources(sources);

    if (typeof legacyUrl === 'string' && legacyUrl.trim()) {
        return [{ type: 'custom-json', url: legacyUrl.trim(), voice: '', enabled: true }];
    }
    return DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

function migrateLegacyDefaultAudioSources(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const types = new Set(sources.map(source => source.type));
    if (!LEGACY_DEFAULT_AUDIO_SOURCE_TYPES.every(type => types.has(type))) return sources;

    const migrated = sources.map(source => ({ ...source }));
    ensureBuiltInAudioSource(migrated, { type: 'jpdb-tts', url: '', voice: '', enabled: true }, 'text-to-speech');
    ensureBuiltInAudioSource(migrated, { type: 'jiten-tts', url: '', voice: '', enabled: true }, 'jpdb-tts');
    return migrated;
}

function ensureBuiltInAudioSource(sources: AudioSourceSetting[], source: AudioSourceSetting, beforeType: AudioSourceType): void {
    if (sources.some(candidate => candidate.type === source.type)) return;
    const insertIndex = sources.findIndex(candidate => candidate.type === beforeType);
    if (insertIndex < 0) sources.push(source);
    else sources.splice(insertIndex, 0, source);
}
