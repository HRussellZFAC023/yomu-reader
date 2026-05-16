import { Logger } from './logger';
import { gmStorageGet, gmStorageSet } from './storage';
import type { AnkiTemplateMode, AudioSourceSetting, AudioSourceType, DictionaryLookupLink, DictionaryPreference, FuriganaMode, ImmersionKitCategory, ImmersionKitSort, InterfaceLanguage, OcrProvider, ReaderColorSource, ReaderSettings, WordHighlightMode } from './types';

const STORAGE_KEY = 'jpdb-popup-reader-settings';
const log = Logger.scope('Settings');

export const DEFAULT_AUDIO_URL =
    'http://localhost:9090/?term={term}&reading={reading}';

export const DEFAULT_ACCENT_COLOR = '#5ea780';

export const DEFAULT_WORD_COLORS = {
    new: '#58a6ff',
    learning: '#ffd166',
    known: '#7bd88f',
    due: '#5fb3b3',
    failed: '#ff6b6b',
    ignored: '#b8a7ff',
} as const;

export const DEFAULT_PITCH_COLORS = {
    heiban: '#359eff',
    atamadaka: '#fe4b74',
    nakadaka: '#fba840',
    odaka: '#57ccb7',
    kifuku: '#9050f6',
    unknown: '#94a3b8',
} as const;

export const AUDIO_GUIDE_URL = 'https://yomitan.wiki/advanced/#audio';

export const AUDIO_SOURCE_LABELS: Record<AudioSourceType, string> = {
    jpod101: 'JapanesePod101',
    'language-pod-101': 'LanguagePod101',
    jisho: 'Jisho.org',
    'lingua-libre': '(Commons) Lingua Libre',
    wiktionary: '(Commons) Wiktionary',
    'text-to-speech': 'Text-to-speech',
    'text-to-speech-reading': 'Text-to-speech (Kana reading)',
    custom: 'Custom direct audio file URL',
    'custom-json': 'Custom URL',
};

export const AUDIO_SOURCE_OPTIONS = Object.entries(AUDIO_SOURCE_LABELS) as [AudioSourceType, string][];
export const AUDIO_SOURCE_UI_OPTIONS = AUDIO_SOURCE_OPTIONS.filter(([type]) => type !== 'custom');

export const DEFAULT_AUDIO_SOURCES: AudioSourceSetting[] = [
    { type: 'jpod101', url: '', voice: '', enabled: true },
    { type: 'language-pod-101', url: '', voice: '', enabled: true },
    { type: 'jisho', url: '', voice: '', enabled: true },
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

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_OPTIONS.map(([value]) => value));
const READER_COLOR_SOURCES = new Set<ReaderColorSource>(['auto', 'status', 'jpdb', 'anki', 'pitch', 'off']);
const EXPLICIT_FURIGANA_MODES = new Set<FuriganaMode>(['all', 'difficult-kanji', 'known-status']);
const OCR_ENGINE_ALIASES = new Map<string, string>([
    ['MangaOcrAdapter', 'MangaOCR'],
    ['PpOcrAdapter', 'PaddleOCR'],
    ['AppleVisionAdapter', 'AppleVision'],
]);

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
    wordHighlightColorSource: 'auto',
    wordUnderlineColorSource: 'auto',
    wordTextColorSource: 'off',
    subtitleHighlightColorSource: 'off',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'auto',
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    jpdbKanjiEnabled: true,
    jpdbKanjiPriority: 10,
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
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioFallbackChimeEnabled: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    immersionKitEnabled: true,
    immersionKitPriority: 80,
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
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: true,
    newTabEnabled: false,
    newTabSource: 'auto',
    newTabJpdbDeck: 'all',
    newTabJpdbReviewMode: 'auto',
    corsProxyUrl: 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev',
    newTabKanjiKeywordSource: 'auto',
    newTabParsingEnabled: true,
    newTabOfflineEnabled: true,
    newTabOfflineLimit: 50,
    newTabKanjiAutogradeEnabled: true,
    newTabKanjiAutoSubmit: false,
    puckPositionX: undefined,
    puckPositionY: undefined,
    showFurigana: true,
    furiganaMode: 'auto',
    showPitchAccent: true,
    wordHighlightMode: 'auto',
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: false,
    ocrProvider: 'local-service',
    ocrEndpointUrl: '',
    ocrEngine: 'auto',
    ocrLanguage: 'ja-JP',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 45000,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrTextColor: '#ffffff',
    ocrOutlineColor: '#000000',
    ocrBackgroundColor: '#181b20',
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
    subtitleTranscriptPlacement: 'right',
    subtitleTranscriptAutoScroll: true,
    subtitleAutoCopyLine: false,
    subtitleControlsMode: 'auto',
    subtitleFontSize: 28,
    subtitleBottomOffset: 12,
    subtitleTextColor: '#ffffff',
    subtitleOutlineColor: '#000000',
    subtitleBackgroundColor: '#181b20',
    subtitleBackgroundOpacity: 0,
    subtitleFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    subtitleFontWeight: 760,
    subtitleMiningPause: false,
    subtitleSeekPadding: 0.08,
    ankiEnabled: false,
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiDeck: 'よむ',
    ankiModel: 'よむ Japanese',
    ankiTemplateMode: 'recognition',
    ankiMobileHandoff: true,
    studyTranslationEnabled: true,
    studyGrammarEnabled: true,
    enableLogging: false,
    ankiTags: 'yomu',
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    theme: 'auto',
    popupMode: 'auto',
    popoverWidth: 520,
    popoverHeight: 540,
    popoverHeightMode: 'fixed',
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
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
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

function mergeSettings(value: Partial<ReaderSettings> | null): ReaderSettings {
    const audio = normalizeAudioSettings(value);
    return {
        ...DEFAULT_SETTINGS,
        ...(value ?? {}),
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

function normalizeAudioSettings(value: Partial<ReaderSettings> | null): Pick<ReaderSettings, 'audioSources' | 'audioSourceUrl'> {
    const hasSavedAudioSources = hasOwn(value, 'audioSources');
    const audioSources = hasSavedAudioSources || value?.audioSourceUrl
        ? normalizeAudioSources(value?.audioSources, value?.audioSourceUrl)
        : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
    return {
        audioSources,
        audioSourceUrl: audioSources.find(source => source.url)?.url ?? value?.audioSourceUrl ?? DEFAULT_AUDIO_URL,
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
        newTabSource: normalizeNewTabSource(value?.newTabSource),
        newTabJpdbDeck: normalizeDeckIdSetting(value?.newTabJpdbDeck, DEFAULT_SETTINGS.newTabJpdbDeck),
        newTabJpdbReviewMode: normalizeNewTabJpdbReviewMode(value?.newTabJpdbReviewMode),
        corsProxyUrl: normalizeCorsProxyUrl(value?.corsProxyUrl),
        newTabKanjiKeywordSource: normalizeNewTabKanjiKeywordSource(value?.newTabKanjiKeywordSource),
        newTabParsingEnabled: booleanSetting(value, 'newTabParsingEnabled'),
        newTabOfflineEnabled: booleanSetting(value, 'newTabOfflineEnabled'),
        newTabOfflineLimit: clampNumber(value?.newTabOfflineLimit, 0, 500, DEFAULT_SETTINGS.newTabOfflineLimit),
        newTabKanjiAutogradeEnabled: booleanSetting(value, 'newTabKanjiAutogradeEnabled'),
        newTabKanjiAutoSubmit: booleanSetting(value, 'newTabKanjiAutoSubmit'),
    };
}

function normalizeReaderDisplaySettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
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
        wordHighlightColorSource: normalizeReaderColorSource(value?.wordHighlightColorSource, DEFAULT_SETTINGS.wordHighlightColorSource),
        wordUnderlineColorSource: normalizeReaderColorSource(value?.wordUnderlineColorSource, DEFAULT_SETTINGS.wordUnderlineColorSource),
        wordTextColorSource: normalizeReaderColorSource(value?.wordTextColorSource, DEFAULT_SETTINGS.wordTextColorSource),
        subtitleHighlightColorSource: normalizeReaderColorSource(value?.subtitleHighlightColorSource, DEFAULT_SETTINGS.subtitleHighlightColorSource),
        subtitleUnderlineColorSource: normalizeReaderColorSource(value?.subtitleUnderlineColorSource, DEFAULT_SETTINGS.subtitleUnderlineColorSource),
        subtitleTextColorSource: normalizeReaderColorSource(value?.subtitleTextColorSource, DEFAULT_SETTINGS.subtitleTextColorSource),
        puckPositionX: normalizeOptionalCoordinate(value?.puckPositionX),
        puckPositionY: normalizeOptionalCoordinate(value?.puckPositionY),
        showFurigana: typeof value?.showFurigana === 'boolean' ? value.showFurigana : DEFAULT_SETTINGS.showFurigana,
        furiganaMode: normalizeFuriganaMode(value?.furiganaMode, value),
        hideKnownFurigana: typeof value?.hideKnownFurigana === 'boolean' ? value.hideKnownFurigana : DEFAULT_SETTINGS.hideKnownFurigana,
        wordHighlightMode: normalizeWordHighlightMode(value?.wordHighlightMode),
    };
}

function normalizeKanjiSettings(value: Partial<ReaderSettings> | null): Partial<ReaderSettings> {
    return {
        jpdbKanjiEnabled: typeof value?.jpdbKanjiEnabled === 'boolean' ? value.jpdbKanjiEnabled : DEFAULT_SETTINGS.jpdbKanjiEnabled,
        jpdbKanjiPriority: clampNumber(value?.jpdbKanjiPriority, 0, 999, DEFAULT_SETTINGS.jpdbKanjiPriority),
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
        ankiConnectUrl: normalizeUrl(value?.ankiConnectUrl, DEFAULT_SETTINGS.ankiConnectUrl),
        ankiDeck: normalizeAnkiName(value?.ankiDeck, DEFAULT_SETTINGS.ankiDeck, 'Yomu'),
        ankiModel: normalizeAnkiName(value?.ankiModel, DEFAULT_SETTINGS.ankiModel, 'Yomu Japanese'),
        ankiTemplateMode: normalizeAnkiTemplateMode(value?.ankiTemplateMode),
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
        popoverWidth: clampNumber(value?.popoverWidth, 280, 900, DEFAULT_SETTINGS.popoverWidth),
        popoverHeight: clampNumber(value?.popoverHeight, 220, 900, DEFAULT_SETTINGS.popoverHeight),
        popoverHeightMode: normalizePopoverHeightMode(value?.popoverHeightMode),
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
        immersionKitPriority: clampNumber(value?.immersionKitPriority, 0, 999, DEFAULT_SETTINGS.immersionKitPriority),
        immersionKitLimit: clampNumber(value?.immersionKitLimit, 1, 12, DEFAULT_SETTINGS.immersionKitLimit),
        immersionKitMinLength: clampNumber(value?.immersionKitMinLength, 0, 120, DEFAULT_SETTINGS.immersionKitMinLength),
        immersionKitMaxLength: clampNumber(value?.immersionKitMaxLength, 0, 240, DEFAULT_SETTINGS.immersionKitMaxLength),
        immersionKitCategory: normalizeImmersionKitCategory(value?.immersionKitCategory),
        immersionKitSort: normalizeImmersionKitSort(value?.immersionKitSort),
        immersionKitPlaybackRate: clampNumber(value?.immersionKitPlaybackRate, 0.5, 2, DEFAULT_SETTINGS.immersionKitPlaybackRate),
        immersionKitRevealTranslationOnClick: booleanSetting(value, 'immersionKitRevealTranslationOnClick'),
        immersionKitPlayOnHover: booleanSetting(value, 'immersionKitPlayOnHover'),
        immersionKitPlayOnImageClick: booleanSetting(value, 'immersionKitPlayOnImageClick'),
        ocrProvider: normalizeOcrProvider(value?.ocrProvider),
        ocrEngine: normalizeOcrEngine(value?.ocrEngine),
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

function normalizeOptionalCoordinate(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function hasOwn(value: unknown, key: PropertyKey): boolean {
    return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
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

function normalizeWordHighlightMode(value: unknown): WordHighlightMode {
    return value === 'status' || value === 'pitch' || value === 'auto' || value === 'off'
        ? value
        : DEFAULT_SETTINGS.wordHighlightMode;
}

function normalizeReaderColorSource(value: unknown, fallback: ReaderColorSource): ReaderColorSource {
    return READER_COLOR_SOURCES.has(value as ReaderColorSource) ? value as ReaderColorSource : fallback;
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

export function hasMiningStatusSource(settings: ReaderSettings): boolean {
    return settings.ankiEnabled || (settings.jpdbMiningEnabled && Boolean(settings.apiKey.trim()));
}

export function hasPersonalizedFuriganaSource(settings: ReaderSettings): boolean {
    return settings.ankiEnabled || Boolean(settings.apiKey.trim());
}

export function effectiveWordHighlightMode(settings: ReaderSettings): Exclude<WordHighlightMode, 'auto'> {
    if (settings.wordHighlightMode === 'status' || settings.wordHighlightMode === 'pitch' || settings.wordHighlightMode === 'off') return settings.wordHighlightMode;
    return hasMiningStatusSource(settings) ? 'status' : 'pitch';
}

export function effectiveReaderColorSource(settings: ReaderSettings, source: ReaderColorSource): Exclude<ReaderColorSource, 'auto'> {
    if (source !== 'auto') return source;
    return effectiveWordHighlightMode(settings);
}

export function effectiveSubtitleColorSource(settings: ReaderSettings, source: ReaderColorSource): Exclude<ReaderColorSource, 'auto'> {
    if (source !== 'auto') return source;
    const mode = effectiveWordHighlightMode(settings);
    return mode === 'status' ? 'jpdb' : mode;
}

export function effectiveFuriganaMode(settings: ReaderSettings): Exclude<FuriganaMode, 'auto'> {
    if (!settings.showFurigana || settings.furiganaMode === 'off') return 'off';
    if (isExplicitFuriganaMode(settings.furiganaMode)) return settings.furiganaMode;
    return hasPersonalizedFuriganaSource(settings) ? 'known-status' : 'difficult-kanji';
}

function isExplicitFuriganaMode(value: FuriganaMode): value is Exclude<FuriganaMode, 'auto' | 'off'> {
    return EXPLICIT_FURIGANA_MODES.has(value);
}

export function sanitizeAccentColor(value: unknown, fallback = DEFAULT_ACCENT_COLOR): string {
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

export function normalizeOcrProvider(value: unknown): OcrProvider {
    if (typeof value !== 'string') return DEFAULT_SETTINGS.ocrProvider;
    return OCR_PROVIDERS.has(value as OcrProvider) ? value as OcrProvider : DEFAULT_SETTINGS.ocrProvider;
}

const OCR_PROVIDERS = new Set<OcrProvider>(['local-service', 'off']);

export function normalizeOcrEngine(value: unknown): string {
    const normalized = normalizedOcrEngineInput(value);
    return normalized ? OCR_ENGINE_ALIASES.get(normalized) ?? normalized : DEFAULT_SETTINGS.ocrEngine;
}

function normalizedOcrEngineInput(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export async function loadSettings(): Promise<ReaderSettings> {
    try {
        const settings = mergeSettings(await gmStorageGet<Partial<ReaderSettings> | null>(STORAGE_KEY, null));
        return settings;
    } catch (error) {
        log.warn('Settings load failed, using defaults', { error });
        return mergeSettings(null);
    }
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
    try {
        await gmStorageSet(STORAGE_KEY, settings);
    } catch (error) {
        log.warn('Settings save failed', { error });
        throw error;
    }
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
    if (Array.isArray(value)) return sources;

    if (typeof legacyUrl === 'string' && legacyUrl.trim()) {
        return [{ type: 'custom-json', url: legacyUrl.trim(), voice: '', enabled: true }];
    }
    return DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
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
        enabled: mode === 'jpdb' ? link.id === 'jpdb' : link.enabled,
    }));
}

function isLegacyDefaultLookupLinkSet(value: unknown): boolean {
    if (!Array.isArray(value) || value.length !== 3) return false;
    const normalized = value.map(normalizeDictionaryLookupLink);
    if (normalized.some(link => !link)) return false;
    const links = normalized as DictionaryLookupLink[];
    return links[0]?.id === 'jpdb'
        && links[0].label === 'JPDB'
        && links[0].urlTemplate === JPDB_LOOKUP_LINK.urlTemplate
        && links[0].enabled === false
        && links[1]?.id === 'jisho'
        && links[1].label === 'Jisho'
        && links[1].urlTemplate === JISHO_LOOKUP_LINK.urlTemplate
        && links[1].enabled === true
        && links[2]?.id === 'copy'
        && links[2].label === 'Copy'
        && links[2].action === 'copy'
        && links[2].enabled === true;
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
