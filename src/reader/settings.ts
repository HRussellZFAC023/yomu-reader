import { Logger } from './logger';
import { SETTINGS_CHANGE_EVENT } from './constants';
import { BRAND_COLOR_TOKENS, DEFAULT_PITCH_COLOR_TOKENS, DEFAULT_WORD_COLOR_TOKENS, OVERLAY_COLOR_TOKENS } from './color-tokens';
import { gmStorageDelete, gmStorageGet, gmStorageSet, storedValueExists } from './storage';
import type { AnkiFieldMapping, AnkiFieldMappingRole, AnkiFieldMappings, AnkiTemplateMode, AudioAutoPlayMode, AudioSourceSetting, AudioSourceType, AudioTtsMode, DictionaryLookupLink, DictionaryPreference, FuriganaMode, ImmersionExampleSource, ImmersionKitCategory, ImmersionKitSort, InterfaceLanguage, OcrProvider, ReaderColorSource, ReaderSettings } from './types';

export const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
export const LEGACY_SETTINGS_STORAGE_KEYS = [
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

export const DEFAULT_AUDIO_URL =
    'http://localhost:9090/?term={term}&reading={reading}';

export const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
export const DEFAULT_OVERLAY_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
export const DEFAULT_OVERLAY_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;
export const DEFAULT_OVERLAY_BACKGROUND_COLOR = OVERLAY_COLOR_TOKENS.background;
export const DEFAULT_READER_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DEFAULT_POPUP_FONT_FAMILY = '"Nunito Sans", "Extra Sans JP", "Noto Sans Symbols2", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans GB", "Meiryo", sans-serif';
export const DEFAULT_SUBTITLE_FONT_FAMILY = DEFAULT_READER_FONT_FAMILY;

export const DEFAULT_WORD_COLORS = DEFAULT_WORD_COLOR_TOKENS;

export const DEFAULT_PITCH_COLORS = DEFAULT_PITCH_COLOR_TOKENS;

export const AUDIO_GUIDE_URL = 'https://yomitan.wiki/advanced/#audio';

export const AUDIO_SOURCE_TYPE_VALUES: AudioSourceType[] = [
    'jpod101',
    'language-pod-101',
    'jisho',
    'lingua-libre',
    'wiktionary',
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
    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
    { type: 'text-to-speech', url: '', voice: '', enabled: true },
];

export const MAX_DICTIONARY_LOOKUP_LINKS = 8;

export const JPDB_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jpdb',
    label: 'JPDB',
    urlTemplate: 'https://jpdb.io/search?q={query}',
    enabled: true,
};

export const JISHO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jisho',
    label: 'Jisho',
    urlTemplate: 'https://jisho.org/search/{query}',
    enabled: true,
};

export const COPY_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'copy',
    label: 'Copy',
    urlTemplate: '',
    enabled: true,
    action: 'copy',
};

export const DEFAULT_DICTIONARY_LOOKUP_LINKS: DictionaryLookupLink[] = [
    JPDB_LOOKUP_LINK,
    JISHO_LOOKUP_LINK,
    COPY_LOOKUP_LINK,
];
type LegacyLookupLinkSpec = Pick<DictionaryLookupLink, 'id' | 'label' | 'urlTemplate' | 'enabled'> & {
    action?: DictionaryLookupLink['action'];
};
const LEGACY_DEFAULT_LOOKUP_LINK_SET: LegacyLookupLinkSpec[] = [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    JISHO_LOOKUP_LINK,
    COPY_LOOKUP_LINK,
];

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_TYPE_VALUES);
const LEGACY_DEFAULT_AUDIO_SOURCE_TYPES: AudioSourceType[] = ['jpod101', 'language-pod-101', 'jisho', 'text-to-speech'];
const READER_COLOR_SOURCES = new Set<ReaderColorSource>(['auto', 'status', 'jpdb', 'anki', 'pitch', 'off']);
const EXPLICIT_FURIGANA_MODES = new Set<FuriganaMode>(['all', 'difficult-kanji', 'known-status']);
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
type ConcreteReaderColorSource = Exclude<ReaderColorSource, 'auto'>;
type LegacyWordHighlightMode = 'auto' | 'status' | 'pitch' | 'off';

const DEFAULT_COLOR_CHANNELS: Record<ReaderColorChannelKey, ConcreteReaderColorSource> = {
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'anki',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'anki',
};

const LEGACY_COLOR_CHANNEL_DEFAULTS: Record<ReaderColorChannelKey, ReaderColorSource> = {
    wordHighlightColorSource: 'auto',
    wordUnderlineColorSource: 'auto',
    wordTextColorSource: 'off',
    subtitleHighlightColorSource: 'off',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'auto',
};

type LegacyReaderSettings = Partial<ReaderSettings> & { wordHighlightMode?: LegacyWordHighlightMode };

export const DEFAULT_SETTINGS: ReaderSettings = {
    apiKey: '',
    onboardingSeen: false,
    interfaceLanguage: 'auto',
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
    immersionKitLimitEnabled: false,
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
    newTabAnkiEnabled: true,
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
    newTabKanjiAutogradeEnabled: true,
    newTabKanjiAutoSubmit: false,
    puckPositionX: undefined,
    puckPositionY: undefined,
    showFurigana: true,
    furiganaMode: 'auto',
    showPitchAccent: true,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
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
    preferJapaneseSiteLanguage: true,
    ankiEnabled: true,
    ankiSectionEnabled: true,
    ankiSectionPriority: 90,
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiDeck: 'よむ',
    ankiModel: 'よむ Japanese',
    ankiTemplateMode: 'recognition',
    ankiFrontReading: true,
    ankiFrontSentence: true,
    ankiFrontImage: true,
    ankiMobileHandoff: true,
    studyTranslationEnabled: true,
    studyGrammarEnabled: true,
    enableLogging: false,
    ankiTags: 'yomu',
    ankiMineWithJpdb: true,
    ankiCaptureScreenshot: true,
    ankiFieldMappings: {},
    theme: 'auto',
    popupMode: 'popover',
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
        gradeNothing: '1',
        gradeSomething: '2',
        gradeHard: '3',
        gradeOkay: '4',
        gradeEasy: '5',
        gradeFail: '1',
        gradePass: '2',
    },
};

function mergeSettings(value: LegacyReaderSettings | null): ReaderSettings {
    const audio = normalizeAudioSettings(value);
    const supportedSettings = stripUnsupportedSettings(value);
    return {
        ...DEFAULT_SETTINGS,
        ...(supportedSettings ?? {}),
        ...normalizeLookupSettings(value),
        ...normalizeNewTabSettings(value),
        ...normalizeReaderDisplaySettings(value),
        ...audio,
        ...normalizeMediaSettings(value),
        ...normalizeSubtitleSettings(value),
        ...normalizeKanjiSettings(value),
        ...normalizeAnkiAndStudySettings(value),
        ...normalizePresentationSettings(value),
        ...normalizeMiningSettings(value),
        dictionaryPreferences: normalizeDictionaryPreferences(value?.dictionaryPreferences),
        dictionaryLookupLinks: normalizeDictionaryLookupLinkSettings(value),
        shortcuts: normalizeShortcutSettings(value),
    };
}

export function normalizeReaderSettings(value: Partial<ReaderSettings> | null | undefined): ReaderSettings {
    return mergeSettings(value as LegacyReaderSettings | null);
}

function stripUnsupportedSettings(value: LegacyReaderSettings | null | undefined): Partial<ReaderSettings> | null {
    if (!value) return null;
    const supportedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => supportedKeys.has(key)),
    ) as Partial<ReaderSettings>;
}

function normalizeAudioSettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, 'autoPlayAudio' | 'suppressAutoAudioOnVideo' | 'audioAutoPlayMode' | 'audioSources' | 'audioSourceUrl' | 'audioTtsMode'> {
    const hasSavedAudioSources = hasOwn(value, 'audioSources');
    const audioSources = hasSavedAudioSources || value?.audioSourceUrl
        ? normalizeAudioSources(value?.audioSources, value?.audioSourceUrl)
        : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
    const audioAutoPlayMode = normalizeAudioAutoPlayMode(value?.audioAutoPlayMode);
    return {
        autoPlayAudio: audioAutoPlayMode === 'off' ? false : booleanSetting(value, 'autoPlayAudio'),
        suppressAutoAudioOnVideo: booleanSetting(value, 'suppressAutoAudioOnVideo'),
        audioAutoPlayMode,
        audioSources,
        audioSourceUrl: audioSources.find(source => source.url)?.url ?? value?.audioSourceUrl ?? DEFAULT_AUDIO_URL,
        audioTtsMode: normalizeAudioTtsMode(value?.audioTtsMode),
    };
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

function normalizeDictionaryLookupLinkSettings(value: Partial<ReaderSettings> | null): ReaderSettings['dictionaryLookupLinks'] {
    const links = normalizeDictionaryLookupLinks(
        value?.dictionaryLookupLinks,
        !hasOwn(value, 'dictionaryLookupLinks') && Boolean(value?.apiKey?.trim()),
    );
    return isLegacyDefaultLookupLinkSet(value?.dictionaryLookupLinks)
        ? links.map(link => link.id === JPDB_LOOKUP_LINK.id ? { ...link, enabled: true } : link)
        : links;
}

function normalizeLookupSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        interfaceLanguage: normalizeInterfaceLanguage(value?.interfaceLanguage),
        jpdbDefinitionsPriority: clampNumber(value?.jpdbDefinitionsPriority, 0, 999, DEFAULT_SETTINGS.jpdbDefinitionsPriority),
        jpdbPageEnhancementsEnabled: booleanSetting(value, 'jpdbPageEnhancementsEnabled'),
        jpdbPageWordEnhancementsEnabled: booleanSetting(value, 'jpdbPageWordEnhancementsEnabled'),
        jpdbPageKanjiEnhancementsEnabled: booleanSetting(value, 'jpdbPageKanjiEnhancementsEnabled'),
        lookupOnClick: typeof value?.lookupOnClick === 'boolean' ? value.lookupOnClick : true,
        lookupOnHover: typeof value?.lookupOnHover === 'boolean' ? value.lookupOnHover : value?.popupActivationMode !== 'click',
        lookupOnMiddleMouse: typeof value?.lookupOnMiddleMouse === 'boolean' ? value.lookupOnMiddleMouse : true,
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
        newTabKanjiAutogradeEnabled: booleanSetting(value, 'newTabKanjiAutogradeEnabled'),
        newTabKanjiAutoSubmit: booleanSetting(value, 'newTabKanjiAutoSubmit'),
    };
}

function normalizeReaderDisplaySettings(value: LegacyReaderSettings | null): Partial<ReaderSettings> {
    const colorChannels = normalizeReaderColorChannelSettings(value);
    return {
        accentColor: sanitizeAccentColor(value?.accentColor),
        wordColorNew: sanitizeAccentColor(value?.wordColorNew, DEFAULT_SETTINGS.wordColorNew),
        wordColorLearning: sanitizeAccentColor(value?.wordColorLearning, DEFAULT_SETTINGS.wordColorLearning),
        wordColorKnown: sanitizeAccentColor(value?.wordColorKnown, DEFAULT_SETTINGS.wordColorKnown),
        wordColorDue: sanitizeAccentColor(value?.wordColorDue, DEFAULT_SETTINGS.wordColorDue),
        wordColorFailed: sanitizeAccentColor(value?.wordColorFailed, DEFAULT_SETTINGS.wordColorFailed),
        wordColorIgnored: sanitizeAccentColor(value?.wordColorIgnored, DEFAULT_SETTINGS.wordColorIgnored),
        pitchColorHeiban: sanitizeAccentColor(value?.pitchColorHeiban, DEFAULT_SETTINGS.pitchColorHeiban),
        pitchColorAtamadaka: sanitizeAccentColor(value?.pitchColorAtamadaka, DEFAULT_SETTINGS.pitchColorAtamadaka),
        pitchColorNakadaka: sanitizeAccentColor(value?.pitchColorNakadaka, DEFAULT_SETTINGS.pitchColorNakadaka),
        pitchColorOdaka: sanitizeAccentColor(value?.pitchColorOdaka, DEFAULT_SETTINGS.pitchColorOdaka),
        pitchColorKifuku: sanitizeAccentColor(value?.pitchColorKifuku, DEFAULT_SETTINGS.pitchColorKifuku),
        pitchColorUnknown: sanitizeAccentColor(value?.pitchColorUnknown, DEFAULT_SETTINGS.pitchColorUnknown),
        ...colorChannels,
        puckPositionX: normalizeOptionalCoordinate(value?.puckPositionX),
        puckPositionY: normalizeOptionalCoordinate(value?.puckPositionY),
        showFurigana: typeof value?.showFurigana === 'boolean' ? value.showFurigana : DEFAULT_SETTINGS.showFurigana,
        furiganaMode: normalizeFuriganaMode(value?.furiganaMode, value),
        hideKnownFurigana: typeof value?.hideKnownFurigana === 'boolean' ? value.hideKnownFurigana : DEFAULT_SETTINGS.hideKnownFurigana,
    };
}

function normalizeKanjiSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        jpdbKanjiEnabled: typeof value?.jpdbKanjiEnabled === 'boolean' ? value.jpdbKanjiEnabled : DEFAULT_SETTINGS.jpdbKanjiEnabled,
        jpdbKanjiPriority: clampNumber(value?.jpdbKanjiPriority, 0, 999, DEFAULT_SETTINGS.jpdbKanjiPriority),
        kanjiImmersionKitEnabled: typeof value?.kanjiImmersionKitEnabled === 'boolean' ? value.kanjiImmersionKitEnabled : DEFAULT_SETTINGS.kanjiImmersionKitEnabled,
        kanjiImmersionKitPriority: clampNumber(value?.kanjiImmersionKitPriority, 0, 999, DEFAULT_SETTINGS.kanjiImmersionKitPriority),
        uchisenEnabled: typeof value?.uchisenEnabled === 'boolean' ? value.uchisenEnabled : DEFAULT_SETTINGS.uchisenEnabled,
        uchisenPriority: clampNumber(value?.uchisenPriority, 0, 999, DEFAULT_SETTINGS.uchisenPriority),
        rtkPriority: clampNumber(value?.rtkPriority, 0, 999, DEFAULT_SETTINGS.rtkPriority),
        kanjivgPriority: clampNumber(value?.kanjivgPriority, 0, 999, DEFAULT_SETTINGS.kanjivgPriority),
        kanjiOriginsPriority: clampNumber(value?.kanjiOriginsPriority, 0, 999, DEFAULT_SETTINGS.kanjiOriginsPriority),
        kanjiDictionariesPriority: clampNumber(value?.kanjiDictionariesPriority, 0, 999, DEFAULT_SETTINGS.kanjiDictionariesPriority),
        similarKanjiWordsPriority: clampNumber(value?.similarKanjiWordsPriority, 0, 999, DEFAULT_SETTINGS.similarKanjiWordsPriority),
        similarKanjiWordLimit: clampNumber(value?.similarKanjiWordLimit, 2, 24, DEFAULT_SETTINGS.similarKanjiWordLimit),
    };
}

function normalizeAnkiAndStudySettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        ankiSectionEnabled: typeof value?.ankiSectionEnabled === 'boolean' ? value.ankiSectionEnabled : DEFAULT_SETTINGS.ankiSectionEnabled,
        ankiSectionPriority: clampNumber(value?.ankiSectionPriority, 0, 999, DEFAULT_SETTINGS.ankiSectionPriority),
        ankiConnectUrl: normalizeUrl(value?.ankiConnectUrl, DEFAULT_SETTINGS.ankiConnectUrl),
        ankiDeck: normalizeAnkiName(value?.ankiDeck, DEFAULT_SETTINGS.ankiDeck, 'Yomu'),
        ankiModel: normalizeAnkiName(value?.ankiModel, DEFAULT_SETTINGS.ankiModel, 'Yomu Japanese'),
        ankiTemplateMode: normalizeAnkiTemplateMode(value?.ankiTemplateMode),
        ankiFrontReading: typeof value?.ankiFrontReading === 'boolean' ? value.ankiFrontReading : DEFAULT_SETTINGS.ankiFrontReading,
        ankiFrontSentence: typeof value?.ankiFrontSentence === 'boolean' ? value.ankiFrontSentence : DEFAULT_SETTINGS.ankiFrontSentence,
        ankiFrontImage: typeof value?.ankiFrontImage === 'boolean' ? value.ankiFrontImage : DEFAULT_SETTINGS.ankiFrontImage,
        ankiFieldMappings: normalizeAnkiFieldMappings(value?.ankiFieldMappings),
        ankiMobileHandoff: typeof value?.ankiMobileHandoff === 'boolean' ? value.ankiMobileHandoff : DEFAULT_SETTINGS.ankiMobileHandoff,
        studyTranslationEnabled: typeof value?.studyTranslationEnabled === 'boolean' ? value.studyTranslationEnabled : DEFAULT_SETTINGS.studyTranslationEnabled,
        studyTranslationPriority: clampNumber(value?.studyTranslationPriority, 0, 999, DEFAULT_SETTINGS.studyTranslationPriority),
        studyGrammarEnabled: typeof value?.studyGrammarEnabled === 'boolean' ? value.studyGrammarEnabled : DEFAULT_SETTINGS.studyGrammarEnabled,
        studyGrammarPriority: clampNumber(value?.studyGrammarPriority, 0, 999, DEFAULT_SETTINGS.studyGrammarPriority),
        enableLogging: typeof value?.enableLogging === 'boolean' ? value.enableLogging : DEFAULT_SETTINGS.enableLogging,
    };
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
        ankiTags: typeof value?.ankiTags === 'string' ? value.ankiTags.trim() : DEFAULT_SETTINGS.ankiTags,
        jpdbMiningEnabled: typeof value?.jpdbMiningEnabled === 'boolean' ? value.jpdbMiningEnabled : DEFAULT_SETTINGS.jpdbMiningEnabled,
        miningDeck: normalizeDeckIdSetting(value?.miningDeck, DEFAULT_SETTINGS.miningDeck),
        neverForgetDeck: normalizeDeckIdSetting(value?.neverForgetDeck, DEFAULT_SETTINGS.neverForgetDeck),
        blacklistDeck: normalizeDeckIdSetting(value?.blacklistDeck, DEFAULT_SETTINGS.blacklistDeck),
        dictionarySourcesInitiallyExpanded: typeof value?.dictionarySourcesInitiallyExpanded === 'boolean'
            ? value.dictionarySourcesInitiallyExpanded
            : DEFAULT_SETTINGS.dictionarySourcesInitiallyExpanded,
    };
}

function normalizeMediaSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        audioViaBlob: booleanSetting(value, 'audioViaBlob'),
        audioFallbackChimeEnabled: booleanSetting(value, 'audioFallbackChimeEnabled'),
        immersionKitExampleSource: normalizeImmersionExampleSource(value?.immersionKitExampleSource),
        nadeshikoApiKey: typeof value?.nadeshikoApiKey === 'string' ? value.nadeshikoApiKey.trim() : DEFAULT_SETTINGS.nadeshikoApiKey,
        immersionKitPriority: clampNumber(value?.immersionKitPriority, 0, 999, DEFAULT_SETTINGS.immersionKitPriority),
        immersionKitLimitEnabled: typeof value?.immersionKitLimitEnabled === 'boolean'
            ? value.immersionKitLimitEnabled
            : DEFAULT_SETTINGS.immersionKitLimitEnabled,
        immersionKitLimit: clampNumber(value?.immersionKitLimit, 1, 12, DEFAULT_SETTINGS.immersionKitLimit),
        immersionKitMinLength: clampNumber(value?.immersionKitMinLength, 0, 120, DEFAULT_SETTINGS.immersionKitMinLength),
        immersionKitMaxLength: clampNumber(value?.immersionKitMaxLength, 0, 240, DEFAULT_SETTINGS.immersionKitMaxLength),
        immersionKitCategory: normalizeImmersionKitCategory(value?.immersionKitCategory),
        immersionKitSort: normalizeImmersionKitSort(value?.immersionKitSort),
        immersionKitPlaybackRate: clampNumber(value?.immersionKitPlaybackRate, 0.5, 2, DEFAULT_SETTINGS.immersionKitPlaybackRate),
        immersionKitRevealTranslationOnClick: booleanSetting(value, 'immersionKitRevealTranslationOnClick'),
        immersionKitPlayOnHover: booleanSetting(value, 'immersionKitPlayOnHover'),
        immersionKitPlayOnImageClick: booleanSetting(value, 'immersionKitPlayOnImageClick'),
        ocrProvider: normalizeOcrProvider(value?.ocrProvider, value),
        ocrEngine: normalizeOcrEngine(value?.ocrEngine),
        ocrCloudVisionApiKey: normalizeCloudVisionApiKey(value?.ocrCloudVisionApiKey),
        ocrTextColor: sanitizeAccentColor(value?.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(value?.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor),
        ocrBackgroundColor: sanitizeAccentColor(value?.ocrBackgroundColor, DEFAULT_SETTINGS.ocrBackgroundColor),
        ocrBackgroundOpacity: clampNumber(value?.ocrBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.ocrBackgroundOpacity),
        ocrFontScale: clampNumber(value?.ocrFontScale, 0.7, 1.8, DEFAULT_SETTINGS.ocrFontScale),
    };
}

function normalizeSubtitleSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        subtitleNativeBlurred: booleanSetting(value, 'subtitleNativeBlurred'),
        subtitleKaraokeMode: booleanSetting(value, 'subtitleKaraokeMode'),
        subtitlePausePanel: booleanSetting(value, 'subtitlePausePanel'),
        subtitleAutoCopyLine: booleanSetting(value, 'subtitleAutoCopyLine'),
        subtitleControlsMode: normalizeSubtitleControlsMode(value?.subtitleControlsMode),
        subtitleTranscriptPlacement: normalizeSubtitleTranscriptPlacement(value?.subtitleTranscriptPlacement),
        subtitleTextColor: sanitizeAccentColor(value?.subtitleTextColor, DEFAULT_SETTINGS.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(value?.subtitleOutlineColor, DEFAULT_SETTINGS.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(value?.subtitleBackgroundColor, DEFAULT_SETTINGS.subtitleBackgroundColor),
        subtitleBackgroundOpacity: clampNumber(value?.subtitleBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.subtitleBackgroundOpacity),
        subtitleFontFamily: typeof value?.subtitleFontFamily === 'string' && value.subtitleFontFamily.trim() ? value.subtitleFontFamily.trim() : DEFAULT_SETTINGS.subtitleFontFamily,
        subtitleFontWeight: clampNumber(value?.subtitleFontWeight, 100, 900, DEFAULT_SETTINGS.subtitleFontWeight),
    };
}

function normalizeFontFamily(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalCoordinate(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function hasOwn(value: unknown, key: PropertyKey): boolean {
    return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .map(item => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean))];
}

const ANKI_FIELD_MAPPING_ROLES: readonly AnkiFieldMappingRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'image'];

function normalizeAnkiFieldMappings(value: unknown): AnkiFieldMappings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: AnkiFieldMappings = {};
    Object.entries(value as Record<string, unknown>).forEach(([modelName, mapping]) => {
        const normalizedModelName = modelName.trim();
        if (!normalizedModelName || !mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return;
        const normalizedMapping: AnkiFieldMapping = {};
        for (const role of ANKI_FIELD_MAPPING_ROLES) {
            const fieldName = (mapping as Record<string, unknown>)[role];
            if (typeof fieldName !== 'string') continue;
            const normalizedFieldName = fieldName.trim();
            if (normalizedFieldName) normalizedMapping[role] = normalizedFieldName;
        }
        if (Object.keys(normalizedMapping).length) out[normalizedModelName] = normalizedMapping;
    });
    return out;
}

function normalizeAnkiName(value: unknown, fallback: string, oldDefault: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed === oldDefault) return fallback;
    return trimmed;
}

function normalizeAnkiTemplateMode(value: unknown): AnkiTemplateMode {
    return value === 'context' || value === 'recognition' ? value : DEFAULT_SETTINGS.ankiTemplateMode;
}

function normalizeInterfaceLanguage(value: unknown): InterfaceLanguage {
    return value === 'en' || value === 'ja' || value === 'auto' ? value : DEFAULT_SETTINGS.interfaceLanguage;
}

function normalizeTheme(value: unknown): ReaderSettings['theme'] {
    return value === 'dark' || value === 'light' || value === 'auto' ? value : DEFAULT_SETTINGS.theme;
}

function normalizePopupMode(value: unknown): ReaderSettings['popupMode'] {
    return value === 'sheet' || value === 'popover' || value === 'auto' ? value : DEFAULT_SETTINGS.popupMode;
}

function normalizePopoverHeightMode(value: unknown): ReaderSettings['popoverHeightMode'] {
    return value === 'fixed' || value === 'available' ? value : DEFAULT_SETTINGS.popoverHeightMode;
}

function normalizeAudioAutoPlayMode(value: unknown): AudioAutoPlayMode {
    return value === 'off' || value === 'all' || value === 'hover' || value === 'tap' ? value : DEFAULT_SETTINGS.audioAutoPlayMode;
}

function normalizeAudioTtsMode(value: unknown): AudioTtsMode {
    return value === 'source-order' || value === 'fallback' ? value : DEFAULT_SETTINGS.audioTtsMode;
}

function normalizeImmersionKitCategory(value: unknown): ImmersionKitCategory {
    return value === 'anime' || value === 'drama' || value === 'games' || value === 'all'
        ? value
        : DEFAULT_SETTINGS.immersionKitCategory;
}

function normalizeImmersionKitSort(value: unknown): ImmersionKitSort {
    return value === 'sentence_length:desc' || value === 'sentence_length:asc'
        ? value
        : DEFAULT_SETTINGS.immersionKitSort;
}

function normalizeImmersionExampleSource(value: unknown): ImmersionExampleSource {
    return value === 'nadeshiko' || value === 'combined' || value === 'immersion-kit'
        ? value
        : DEFAULT_SETTINGS.immersionKitExampleSource;
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

function booleanSetting(value: Partial<ReaderSettings> | null | undefined, key: keyof ReaderSettings): boolean {
    const rawValue = value?.[key];
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof rawValue === 'boolean') return rawValue;
    return typeof fallback === 'boolean' ? fallback : false;
}

function normalizeSubtitleControlsMode(value: unknown): ReaderSettings['subtitleControlsMode'] {
    return value === 'always' || value === 'hidden' || value === 'auto' ? value : DEFAULT_SETTINGS.subtitleControlsMode;
}

function normalizeSubtitleTranscriptPlacement(value: unknown): ReaderSettings['subtitleTranscriptPlacement'] {
    return value === 'left' || value === 'bottom' || value === 'right' ? value : DEFAULT_SETTINGS.subtitleTranscriptPlacement;
}

function normalizeNewTabSource(value: unknown): ReaderSettings['newTabSource'] {
    return value === 'jpdb' || value === 'anki' || value === 'auto' || value === 'dictionary' ? value : DEFAULT_SETTINGS.newTabSource;
}

function normalizeNewTabJpdbReviewMode(value: unknown): ReaderSettings['newTabJpdbReviewMode'] {
    return value === 'auto' || value === 'api-vocabulary' || value === 'live-review'
        ? value
        : DEFAULT_SETTINGS.newTabJpdbReviewMode;
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
    return value === 'auto' || value === 'rtk' || value === 'jpdb' || value === 'local'
        ? value
        : DEFAULT_SETTINGS.newTabKanjiKeywordSource;
}

function normalizeReaderColorChannelSettings(value: LegacyReaderSettings | null): Pick<ReaderSettings, ReaderColorChannelKey> {
    if (isLegacyDefaultColorChannelSettings(value)) return { ...DEFAULT_COLOR_CHANNELS };
    return {
        wordHighlightColorSource: normalizeReaderColorSource(value?.wordHighlightColorSource, DEFAULT_COLOR_CHANNELS.wordHighlightColorSource, legacyReaderColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordHighlightColorSource)),
        wordUnderlineColorSource: normalizeReaderColorSource(value?.wordUnderlineColorSource, DEFAULT_COLOR_CHANNELS.wordUnderlineColorSource, legacyReaderColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordUnderlineColorSource)),
        wordTextColorSource: normalizeReaderColorSource(value?.wordTextColorSource, DEFAULT_COLOR_CHANNELS.wordTextColorSource, legacyReaderColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordTextColorSource)),
        subtitleHighlightColorSource: normalizeReaderColorSource(value?.subtitleHighlightColorSource, DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource, legacySubtitleColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource)),
        subtitleUnderlineColorSource: normalizeReaderColorSource(value?.subtitleUnderlineColorSource, DEFAULT_COLOR_CHANNELS.subtitleUnderlineColorSource, legacySubtitleColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleUnderlineColorSource)),
        subtitleTextColorSource: normalizeReaderColorSource(value?.subtitleTextColorSource, DEFAULT_COLOR_CHANNELS.subtitleTextColorSource, legacySubtitleColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleTextColorSource)),
    };
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

function legacyReaderColorSourceForAuto(settings: LegacyReaderSettings | null | undefined, fallback: Exclude<ReaderColorSource, 'auto'>): Exclude<ReaderColorSource, 'auto'> {
    const mode = legacyEffectiveWordHighlightMode(settings);
    return mode === 'status' ? fallback : mode ?? fallback;
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
    return value === 'auto' || value === 'all' || value === 'difficult-kanji' || value === 'known-status' || value === 'off';
}

function legacyBooleanSettingIs(settings: Partial<ReaderSettings> | null | undefined, key: keyof ReaderSettings, expected: boolean): boolean {
    return Boolean(settings && Object.prototype.hasOwnProperty.call(settings, key) && settings[key] === expected);
}

function normalizeDeckIdSetting(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function hasPersonalizedFuriganaSource(settings: ReaderSettings): boolean {
    return Boolean(settings.apiKey.trim() || settings.ankiEnabled);
}

export function shouldLookupAnkiStatus(settings: Partial<ReaderSettings>): boolean {
    return Boolean(
        settings.ankiEnabled
        || settings.ankiSectionEnabled
        || settings.furiganaMode === 'known-status'
        || hasRequestedAnkiColorSource(settings)
    );
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
    if (source === 'anki') return 'anki';
    if (source === 'status') return effectiveAvailableStatusSource(settings, true);
    return source;
}

function effectiveAvailableStatusSource(settings: LegacyReaderSettings, includeRequestedAnki = false): ConcreteReaderColorSource {
    const hasJpdb = hasJpdbStatusSource(settings);
    const hasAnki = includeRequestedAnki || hasAnkiStatusSource(settings);
    if (hasJpdb && hasAnki) return 'status';
    if (hasJpdb) return 'jpdb';
    if (hasAnki) return 'anki';
    return 'off';
}

function hasJpdbStatusSource(settings: LegacyReaderSettings): boolean {
    return Boolean(settings.apiKey?.trim());
}

function hasAnkiStatusSource(settings: LegacyReaderSettings): boolean {
    return Boolean(settings.ankiEnabled || (!hasJpdbStatusSource(settings) && hasRequestedAnkiColorSource(settings)));
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

export function normalizeOcrEngine(value: unknown): string {
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
        log.warn('Settings load failed, using defaults', { error });
        return mergeSettings(null);
    }
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
    if (settingsResetInProgress) {
        log.warn('Skipped settings save while factory reset is in progress');
        return;
    }
    try {
        const storedSettings = stripUnsupportedSettings(settings) ?? settings;
        await gmStorageSet(SETTINGS_STORAGE_KEY, storedSettings);
        dispatchSettingsChange(storedSettings);
    } catch (error) {
        log.warn('Settings save failed', { error });
        throw error;
    }
}

function dispatchSettingsChange(settings: Partial<ReaderSettings>): void {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    try {
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings } }));
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

export function matchesShortcut(event: KeyboardEvent, shortcut = ''): boolean {
    if (!shortcut) return false;

    const parts = parseShortcut(shortcut);
    const key = parts.key?.toLowerCase();
    if (!key) return false;

    const eventKey = normalizeEventKey(event.key).toLowerCase();

    return eventKey === key
        && shortcutModifiersMatch(event, parts.modifiers);
}

function shortcutModifiersMatch(event: KeyboardEvent, modifiers: Set<string>): boolean {
    return event.altKey === modifiers.has('alt')
        && event.ctrlKey === modifiers.has('ctrl')
        && event.metaKey === modifiers.has('meta')
        && event.shiftKey === modifiers.has('shift');
}

export function formatShortcutEvent(event: KeyboardEvent): string {
    const parts: string[] = [];
    addShortcutModifierParts(parts, event);
    addShortcutKeyPart(parts, normalizeEventKey(event.key));
    return dedupeShortcutParts(parts).join('+');
}

function addShortcutModifierParts(parts: string[], event: KeyboardEvent): void {
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
}

function addShortcutKeyPart(parts: string[], key: string): void {
    if (!isModifierKey(key)) parts.push(key);
}

export function shortcutIsPressed(shortcut = '', event: MouseEvent | KeyboardEvent, pressedKeys = new Set<string>()): boolean {
    if (!shortcut.trim()) return true;
    const parts = parseShortcut(shortcut);
    if (!shortcutModifiersArePressed(parts.modifiers, event)) return false;
    if (!parts.key) return parts.modifiers.size > 0;
    return shortcutKeyIsPressed(parts.key, event, pressedKeys);
}

function shortcutModifiersArePressed(modifiers: Set<string>, event: MouseEvent | KeyboardEvent): boolean {
    return modifiers.has('alt') === event.altKey
        && modifiers.has('ctrl') === event.ctrlKey
        && modifiers.has('meta') === event.metaKey
        && modifiers.has('shift') === event.shiftKey;
}

function shortcutKeyIsPressed(key: string, event: MouseEvent | KeyboardEvent, pressedKeys: Set<string>): boolean {
    const normalized = key.toLowerCase();
    return pressedKeys.has(normalized)
        || ('key' in event && normalizeEventKey(event.key).toLowerCase() === normalized);
}

function parseShortcut(shortcut: string): { key: string; modifiers: Set<string> } {
    const parts = shortcut.split('+').map(part => normalizeShortcutPart(part)).filter(Boolean);
    const modifiers = new Set(parts.filter(isModifierKey).map(part => part.toLowerCase()));
    const key = [...parts].reverse().find(part => !isModifierKey(part)) ?? '';
    return { key: key.toLowerCase(), modifiers };
}

function normalizeShortcutPart(part: string): string {
    const value = part.trim();
    if (!value) return '';
    const lower = value.toLowerCase();
    const alias = shortcutPartAlias(lower);
    if (alias) return alias;
    if (value.length === 1) return value.toUpperCase();
    return value[0]?.toUpperCase() + value.slice(1);
}

function shortcutPartAlias(lower: string): string {
    return SHORTCUT_PART_ALIASES.get(lower) ?? '';
}

const SHORTCUT_PART_ALIASES = new Map<string, string>([
    ['control', 'Ctrl'],
    ['cmd', 'Meta'],
    ['command', 'Meta'],
    ['win', 'Meta'],
    ['windows', 'Meta'],
    ['option', 'Alt'],
    ['esc', 'Escape'],
    ['spacebar', 'Space'],
    [' ', 'Space'],
]);

function normalizeEventKey(key: string): string {
    if (key === ' ') return 'Space';
    return normalizeShortcutPart(key);
}

function isModifierKey(key: string): boolean {
    return key === 'Alt' || key === 'Ctrl' || key === 'Meta' || key === 'Shift';
}

function dedupeShortcutParts(parts: string[]): string[] {
    return parts.filter((part, index) => parts.indexOf(part) === index);
}

export function isAudioSourceType(value: unknown): value is AudioSourceType {
    return typeof value === 'string' && AUDIO_SOURCE_TYPES.has(value as AudioSourceType);
}

export function normalizeAudioSource(value: unknown): AudioSourceSetting | null {
    const record = audioSourceRecord(value);
    if (!record) return null;
    if (!isAudioSourceType(record.type)) return null;
    return {
        type: record.type,
        url: audioSourceText(record.url),
        voice: audioSourceText(record.voice),
        enabled: audioSourceEnabled(record.enabled),
    };
}

function audioSourceRecord(value: unknown): Partial<AudioSourceSetting> & { type?: unknown; url?: unknown; voice?: unknown; enabled?: unknown } | null {
    return value && typeof value === 'object'
        ? value as Partial<AudioSourceSetting> & { type?: unknown; url?: unknown; voice?: unknown; enabled?: unknown }
        : null;
}

function audioSourceText(value: unknown): string {
    return typeof value === 'string' ? value : '';
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
    if (types.has('jpdb-tts')) return sources;
    if (!LEGACY_DEFAULT_AUDIO_SOURCE_TYPES.every(type => types.has(type))) return sources;

    const migrated = sources.map(source => ({ ...source }));
    const insertIndex = migrated.findIndex(source => source.type === 'text-to-speech');
    const jpdbSource: AudioSourceSetting = { type: 'jpdb-tts', url: '', voice: '', enabled: true };
    if (insertIndex < 0) migrated.push(jpdbSource);
    else migrated.splice(insertIndex, 0, jpdbSource);
    return migrated;
}

export function normalizeDictionaryPreferences(value: unknown): DictionaryPreference[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item, index): DictionaryPreference | null => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Partial<DictionaryPreference> & { name?: unknown; alias?: unknown; enabled?: unknown; priority?: unknown; type?: unknown };
            if (typeof record.name !== 'string' || !record.name.trim()) return null;
            return {
                name: record.name,
                alias: typeof record.alias === 'string' && record.alias.trim() ? record.alias : record.name,
                enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
                priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : index,
                allowSecondarySearches: typeof record.allowSecondarySearches === 'boolean' ? record.allowSecondarySearches : false,
                type: normalizeDictionaryType(record.type, record.name),
            };
        })
        .filter((item): item is DictionaryPreference => item !== null)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export function defaultDictionaryLookupLinks(mode: 'jpdb' | 'local' = 'local'): DictionaryLookupLink[] {
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => ({
        ...link,
        enabled: mode === 'jpdb' ? link.id === 'jpdb' || link.id === 'jisho' : link.enabled,
    }));
}

function isLegacyDefaultLookupLinkSet(value: unknown): boolean {
    const links = normalizeLegacyLookupLinkSet(value);
    return Boolean(links && LEGACY_DEFAULT_LOOKUP_LINK_SET.every((expected, index) => (
        matchesLegacyLookupLink(links[index], expected)
    )));
}

function normalizeLegacyLookupLinkSet(value: unknown): DictionaryLookupLink[] | null {
    if (!Array.isArray(value) || value.length !== LEGACY_DEFAULT_LOOKUP_LINK_SET.length) return null;
    const links = value.map(normalizeDictionaryLookupLink);
    return links.every(isDictionaryLookupLink) ? links : null;
}

function isDictionaryLookupLink(link: DictionaryLookupLink | null): link is DictionaryLookupLink {
    return link !== null;
}

function matchesLegacyLookupLink(link: DictionaryLookupLink | undefined, expected: LegacyLookupLinkSpec): boolean {
    return Boolean(link
        && link.id === expected.id
        && link.label === expected.label
        && link.urlTemplate === expected.urlTemplate
        && link.enabled === expected.enabled
        && (expected.action === undefined || link.action === expected.action));
}

export function normalizeDictionaryLookupLinks(value: unknown, preferJpdb = false): DictionaryLookupLink[] {
    const builtIns = defaultDictionaryLookupLinks(defaultLookupLinkMode(preferJpdb));
    if (!Array.isArray(value)) return builtIns;

    const normalized: DictionaryLookupLink[] = [];
    const seen = new Set<string>();
    const add = (link: DictionaryLookupLink) => {
        const id = link.id.trim();
        if (!id || seen.has(id) || normalized.length >= MAX_DICTIONARY_LOOKUP_LINKS) return;
        seen.add(id);
        normalized.push({ ...link, id });
    };

    for (const item of value) {
        const link = normalizeDictionaryLookupLink(item);
        if (link) add(link);
    }

    appendMissingBuiltInLookupLinks(builtIns, seen, add);

    return normalized.slice(0, MAX_DICTIONARY_LOOKUP_LINKS);
}

function defaultLookupLinkMode(preferJpdb: boolean): 'jpdb' | 'local' {
    return preferJpdb ? 'jpdb' : 'local';
}

function appendMissingBuiltInLookupLinks(builtIns: DictionaryLookupLink[], seen: Set<string>, add: (link: DictionaryLookupLink) => void): void {
    for (const builtIn of builtIns) {
        if (!seen.has(builtIn.id)) add(builtIn);
    }
}

export function normalizeDictionaryLookupLink(value: unknown): DictionaryLookupLink | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<DictionaryLookupLink> & { id?: unknown; label?: unknown; urlTemplate?: unknown; enabled?: unknown; action?: unknown };
    const id = normalizedLookupLinkId(record);
    const label = normalizedLookupLinkLabel(record, id);
    const urlTemplate = normalizedLookupLinkUrlTemplate(record);
    const action = normalizedLookupLinkAction(record, id);
    if (!isUsableDictionaryLookupLink(id, label, urlTemplate, action)) return null;
    return {
        id,
        label,
        urlTemplate,
        enabled: normalizedLookupLinkEnabled(record),
        action,
    };
}

function normalizedLookupLinkUrlTemplate(record: { urlTemplate?: unknown }): string {
    return typeof record.urlTemplate === 'string' ? record.urlTemplate.trim() : '';
}

function normalizedLookupLinkEnabled(record: { enabled?: unknown }): boolean {
    return typeof record.enabled === 'boolean' ? record.enabled : true;
}

function isUsableDictionaryLookupLink(
    id: string,
    label: string,
    urlTemplate: string,
    action: DictionaryLookupLink['action'],
): boolean {
    if (!id || !label) return false;
    return action === 'copy' || Boolean(urlTemplate && isSafeLookupUrlTemplate(urlTemplate));
}

function normalizedLookupLinkId(record: { id?: unknown; label?: unknown }): string {
    if (typeof record.id === 'string' && record.id.trim()) return record.id.trim();
    return typeof record.label === 'string' ? `custom-${stableLookupLinkId(record.label)}` : '';
}

function normalizedLookupLinkLabel(record: { label?: unknown }, id: string): string {
    return typeof record.label === 'string' && record.label.trim()
        ? record.label.trim().slice(0, 24)
        : id;
}

function normalizedLookupLinkAction(record: { action?: unknown }, id: string): DictionaryLookupLink['action'] {
    return record.action === 'copy' || id === 'copy' ? 'copy' : 'open';
}

function stableLookupLinkId(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return slug || 'lookup';
}

function isSafeLookupUrlTemplate(value: string): boolean {
    try {
        const url = new URL(value.replace(/\{[^}]+\}/g, 'x'));
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export function mergeDictionaryPreferences(current: DictionaryPreference[], names: string[], types: Record<string, DictionaryPreference['type']> = {}): DictionaryPreference[] {
    const merged = new Map(current.map(item => [item.name, item]));
    for (const name of names) {
        mergeDictionaryPreference(merged, name, types[name] ?? inferDictionaryTypeFromName(name));
    }
    return normalizeDictionaryPreferences([...merged.values()]);
}

function mergeDictionaryPreference(merged: Map<string, DictionaryPreference>, name: string, type: DictionaryPreference['type']): void {
    const existing = merged.get(name);
    if (!existing) {
        merged.set(name, defaultDictionaryPreference(name, type, merged.size));
        return;
    }
    if (!existing.type) merged.set(name, { ...existing, type });
}

function defaultDictionaryPreference(name: string, type: DictionaryPreference['type'], priority: number): DictionaryPreference {
    return {
        name,
        alias: name,
        enabled: true,
        priority,
        allowSecondarySearches: false,
        type,
    };
}

function normalizeDictionaryType(value: unknown, name = ''): DictionaryPreference['type'] {
    if (value === 'terms' || value === 'kanji' || value === 'frequency' || value === 'metadata') return value;
    return inferDictionaryTypeFromName(name);
}

function inferDictionaryTypeFromName(name: string): DictionaryPreference['type'] {
    const normalized = name.toLowerCase();
    if (/\b(?:frequency|freq|jpdbv?\d*|bccwj|jiten|cc100|kwdlc|aozora|netflix|novel|anime|vn)\b/.test(normalized)) return 'frequency';
    if (/\b(?:kanjidic|kanji)\b/.test(normalized)) return 'kanji';
    return 'terms';
}
