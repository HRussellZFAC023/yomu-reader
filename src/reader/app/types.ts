export type CardState =
    | 'new'
    | 'learning'
    | 'young'
    | 'mature'
    | 'known'
    | 'mastered'
    | 'due'
    | 'failed'
    | 'locked'
    | 'never-forget'
    | 'blacklisted'
    | 'suspended'
    | 'in-deck'
    | 'not-in-deck'
    | 'redundant'
    | 'frequent'
    | 'unparsed';

export type JPDBGrade = 'nothing' | 'something' | 'hard' | 'okay' | 'easy' | 'fail' | 'pass';

export type ReviewGradeIntervalSource = 'anki-next-reviews' | 'jiten-study-batch';

export interface ReviewGradeInterval {
    buttonLabel: string;
    intervalLabel: string;
    label: string;
    source: ReviewGradeIntervalSource;
}

export type ReviewGradeIntervals = Partial<Record<JPDBGrade, ReviewGradeInterval>>;

export type AudioSourceType =
    | 'jpod101'
    | 'language-pod-101'
    | 'jisho'
    | 'lingua-libre'
    | 'wiktionary'
    | 'jiten-tts'
    | 'jpdb-tts'
    | 'text-to-speech'
    | 'text-to-speech-reading'
    | 'custom'
    | 'custom-json';

export type AudioSelectionMode = 'first' | 'random';

export type AudioTtsMode = 'fallback' | 'source-order';

export type AudioAutoPlayMode = 'off' | 'all' | 'hover' | 'tap';

export type OcrProvider = 'google-lens' | 'cloud-vision' | 'local-service' | 'page-text' | 'off';

export type OcrOverlayTheme = 'auto' | 'dark' | 'light';

export type PopupActivationMode = 'click' | 'hover' | 'modifier' | 'off';

export type ScanModifierKey = 'shift' | 'alt' | 'ctrl' | 'meta';

export type SubtitleControlsMode = 'auto' | 'always' | 'hidden';

export type SubtitleTranscriptPlacement = 'right' | 'left' | 'bottom';

export type InterfaceLanguage = 'auto' | 'en' | 'ja';

export type ImmersionKitCategory = 'all' | 'anime' | 'drama' | 'games';

export type ImmersionKitSort = 'sentence_length:asc' | 'sentence_length:desc' | 'random';

export type ImmersionExampleSource = 'immersion-kit' | 'nadeshiko' | 'combined';

export type AnkiTemplateMode = 'recognition' | 'context';
export type AnkiFieldMappingRole = 'expression' | 'reading' | 'meaning' | 'sentence' | 'audio' | 'image';
export type AnkiFieldMapping = Partial<Record<AnkiFieldMappingRole, string>>;
export type AnkiFieldMappings = Record<string, AnkiFieldMapping>;

export type NewTabWordSource = 'auto' | 'jpdb' | 'bunpro' | 'yomu-local' | 'anki' | 'dictionary';

export type NewTabJpdbReviewMode = 'auto' | 'api-vocabulary' | 'live-review';

export type NewTabKanjiKeywordSource = 'auto' | 'rtk' | 'jpdb' | 'local';

export type NewTabStudyChallengeStep =
    | 'kanji-doodle'
    | 'word'
    | 'recall-cloze'
    | 'listen-pitch'
    | 'speaking';

export type ReaderColorSource = 'auto' | 'status' | 'jpdb' | 'anki' | 'pitch' | 'off';

export type FuriganaMode = 'auto' | 'all' | 'difficult-kanji' | 'known-status' | 'hover' | 'off';

export type FuriganaStateGroup = 'new' | 'learning' | 'known' | 'due' | 'failed';

export type WordColorStates = 'all' | 'new-only';

export interface AudioSourceSetting {
    type: AudioSourceType;
    url: string;
    voice: string;
    enabled: boolean;
}

export interface DictionaryPreference {
    name: string;
    alias: string;
    enabled: boolean;
    priority: number;
    allowSecondarySearches?: boolean;
    type?: 'terms' | 'kanji' | 'frequency' | 'metadata';
}

export interface DictionaryLookupLink {
    id: string;
    label: string;
    urlTemplate: string;
    enabled: boolean;
    action?: 'open' | 'copy' | 'frequency-live' | 'frequency-local';
    priority?: number;
}

export interface JPDBMeaning {
    glosses: string[];
    partOfSpeech: string[];
}

export type AnkiCardKind = 'word' | 'kanji' | 'kana' | 'sentence' | 'other';

export interface JPDBCard {
    vid: number;
    sid: number;
    rid: number;
    spelling: string;
    reading: string;
    frequencyRank: number | null;
    partOfSpeech: string[];
    meanings: JPDBMeaning[];
    cardState: CardState[];
    pitchAccent: string[];
    // jpdb API due_at (unix seconds): the card's next scheduled review.
    // Sorting due cards ascending reproduces jpdb's exact Learn queue order.
    dueAt?: number | null;
    // Provider review timestamp (unix milliseconds), used by the My Cards history sort.
    lastReviewAt?: number | null;
    wordWithReading: string | null;
    source?: 'jpdb' | 'jiten' | 'bunpro' | 'yomu-local' | 'local' | 'anki' | 'fallback';
    sentence?: string;
    reviewSource?: 'jpdb-api' | 'jpdb-live' | 'jiten-api' | 'bunpro-api' | 'yomu-local' | 'anki' | 'dictionary';
    jitenWordId?: number;
    jitenReadingIndex?: number;
    // Provider-neutral deck/list membership names for rendered-word styling.
    deckNames?: string[];
    ankiCardId?: number;
    ankiNoteId?: number;
    ankiDeckNames?: string[];
    jpdbDeckMembership?: string;
    // Raw owning-deck name from the provider (Jiten study-batch
    // sourceDeckName today); rendered as the "Part of the X deck" line.
    sourceDeckName?: string;
    ankiModelName?: string;
    ankiCardKind?: AnkiCardKind;
    ankiReps?: number;
    ankiLapses?: number;
    reviewGradeIntervals?: ReviewGradeIntervals;
    ankiRenderedCards?: Array<{
        cardId: number;
        deckName: string;
        cardName?: string;
        question: string;
        answer: string;
        mediaDataUrls?: Record<string, string>;
    }>;
    ankiAudioFilenames?: string[];
    jpdbReviewId?: string;
    bunproReviewId?: string;
    bunproReviewableId?: number;
    bunproReviewableType?: 'grammar' | 'vocabulary' | 'sentence' | 'unknown';
    bunproSrsLevel?: string;
    kanjiKeyword?: string;
    sourceCardKey?: string;
    fallbackLookupTerms?: string[];
}

export interface ApiDeck {
    id: string;
    name: string;
}

export interface JPDBDeck extends ApiDeck {
    vocabularyCount?: number;
    knownCoverage?: number;
}

export interface JPDBRuby {
    text: string;
    start: number;
    end: number;
    length: number;
}

export interface JPDBToken {
    card: JPDBCard;
    start: number;
    end: number;
    length: number;
    rubies: JPDBRuby[];
    pitchClass: string;
    sentence?: string;
}

export type JPDBRawVocabulary = [
    number,
    number,
    number,
    string,
    string,
    number | null,
    string[],
    string[][],
    string[][],
    string[] | null,
    string[] | null,
    (number | null)?,
    string?,
];

export type JPDBRawToken = [
    number,
    number,
    number,
    null | Array<string | [string, string]>,
];

export interface JPDBParseResult {
    vocabulary: JPDBRawVocabulary[];
    tokens: JPDBRawToken[][];
}

export interface ReaderSettings {
    apiKey: string;
    jitenApiKey: string;
    bunproApiKey: string;
    bunproFrontendApiToken: string;
    bunproFrontendApiTokenExpiresAt: string;
    onboardingSeen: boolean;
    interfaceLanguage: InterfaceLanguage;
    accentColor: string;
    wordColorNew: string;
    wordColorLearning: string;
    wordColorKnown: string;
    wordColorDue: string;
    wordColorFailed: string;
    wordColorIgnored: string;
    pitchColorHeiban: string;
    pitchColorAtamadaka: string;
    pitchColorNakadaka: string;
    pitchColorOdaka: string;
    pitchColorKifuku: string;
    pitchColorUnknown: string;
    wordHighlightColorSource: ReaderColorSource;
    wordUnderlineColorSource: ReaderColorSource;
    wordTextColorSource: ReaderColorSource;
    subtitleHighlightColorSource: ReaderColorSource;
    subtitleUnderlineColorSource: ReaderColorSource;
    subtitleTextColorSource: ReaderColorSource;
    jpdbDefinitionsEnabled: boolean;
    jpdbDefinitionsAlias: string;
    jpdbDefinitionsPriority: number;
    jitenDefinitionsEnabled: boolean;
    jitenDefinitionsAlias: string;
    jitenDefinitionsPriority: number;
    jpdbPageEnhancementsEnabled: boolean;
    jpdbPageWordEnhancementsEnabled: boolean;
    jpdbPageKanjiEnhancementsEnabled: boolean;
    jpdbKanjiEnabled: boolean;
    jpdbKanjiAlias: string;
    jpdbKanjiPriority: number;
    kanjiImmersionKitEnabled: boolean;
    kanjiImmersionKitAlias: string;
    kanjiImmersionKitPriority: number;
    uchisenEnabled: boolean;
    uchisenAlias: string;
    uchisenPriority: number;
    rtkEnabled: boolean;
    rtkAlias: string;
    rtkPriority: number;
    kanjivgEnabled: boolean;
    kanjivgAlias: string;
    kanjivgPriority: number;
    kanjiOriginsEnabled: boolean;
    kanjiOriginsAlias: string;
    kanjiOriginsPriority: number;
    kanjiOriginKanjiMapEnabled: boolean;
    kanjiOriginGraphEnabled: boolean;
    kanjiOriginRadicalImagesEnabled: boolean;
    similarKanjiWords: boolean;
    similarKanjiWordsPriority: number;
    similarKanjiWordLimit: number;
    audioEnabled: boolean;
    autoPlayAudio: boolean;
    suppressAutoAudioOnVideo: boolean;
    audioAutoPlayMode: AudioAutoPlayMode;
    audioSources: AudioSourceSetting[];
    audioEnableDefaultSources: boolean;
    audioSourceUrl?: string;
    audioViaBlob: boolean;
    audioFallbackChimeEnabled: boolean;
    audioTimeoutMs: number;
    audioSelectionMode: AudioSelectionMode;
    audioTtsMode: AudioTtsMode;
    immersionKitEnabled: boolean;
    immersionKitAlias: string;
    immersionKitExampleSource: ImmersionExampleSource;
    nadeshikoApiKey: string;
    immersionKitPriority: number;
    immersionKitLimitEnabled: boolean;
    immersionKitLimit: number;
    immersionKitMinLength: number;
    immersionKitMaxLength: number;
    immersionKitCategory: ImmersionKitCategory;
    immersionKitSort: ImmersionKitSort;
    immersionKitExactMatch: boolean;
    immersionKitShowTranslation: boolean;
    immersionKitRevealTranslationOnClick: boolean;
    immersionKitShowImages: boolean;
    immersionKitAutoPlayAudio: boolean;
    immersionKitPlayOnHover: boolean;
    immersionKitPlayOnImageClick: boolean;
    immersionKitPlaybackRate: number;
    selectionPopoverShowTranslation: boolean;
    parseSelection: boolean;
    lookupOnClick: boolean;
    lookupOnHover: boolean;
    lookupOnMiddleMouse: boolean;
    hoverOpenDelayMs: number;
    hoverCloseDelayMs: number;
    popupActivationMode: PopupActivationMode;
    scanModifierKey: ScanModifierKey;
    showFloatingButton: boolean;
    // When true, the page is only scanned by shortcut instead of automatically
    // as content streams in.
    manualScanEnabled: boolean;
    newTabEnabled: boolean;
    newTabAnkiEnabled: boolean;
    newTabAnkiDisabledDecks: string[];
    newTabSource: NewTabWordSource;
    newTabJpdbDeck: string;
    newTabJpdbReviewMode: NewTabJpdbReviewMode;
    corsProxyUrl: string;
    newTabKanjiKeywordSource: NewTabKanjiKeywordSource;
    newTabParsingEnabled: boolean;
    newTabFrontSentenceEnabled: boolean;
    newTabOfflineEnabled: boolean;
    newTabOfflineLimit: number;
    newTabDailyGoalMinutes: number;
    newTabKanjiUnlockEnabled: boolean;
    newTabStopAtBatchEnd: boolean;
    newTabSwipeReviews: boolean;
    newTabShortcutHintsEnabled: boolean;
    newTabKanjiAutogradeEnabled: boolean;
    newTabKanjiAutoSubmit: boolean;
    newTabStudyStepOrder: NewTabStudyChallengeStep[];
    newTabStudyDisabledSteps: NewTabStudyChallengeStep[];
    newTabStudyTourSeen: boolean;
    puckPositionX?: number;
    puckPositionY?: number;
    // Master pause toggled from the puck radial. While paused, Yomu adds no new
    // annotations, removes existing ones, and suppresses hover lookups until
    // resumed. The puck colour reflects this state.
    annotationsPaused: boolean;
    showFurigana: boolean;
    furiganaMode: FuriganaMode;
    furiganaHiddenStateGroups: FuriganaStateGroup[];
    wordColorStates: WordColorStates;
    showPitchAccent: boolean;
    // When on, the live Jiten/JPDB frequency rank is shown inline inside that
    // site's lookup pill (e.g. "Jiten #18447") instead of as a separate pill.
    showLookupPillFrequency: boolean;
    suppressRedundantWordUi: boolean;
    sheetCloseButtonOnLeft: boolean;
    hideKnownFurigana: boolean;
    ocrEnabled: boolean;
    ocrAutoScanImages: boolean;
    ocrVideoPauseFrames: boolean;
    ocrShowTextOverlay: boolean;
    ocrOverlayTheme: OcrOverlayTheme;
    ocrProvider: OcrProvider;
    ocrEndpointUrl: string;
    ocrEngine: string;
    ocrCloudVisionApiKey: string;
    ocrLanguage: string;
    ocrMaxImagePixels: number;
    ocrMinImageArea: number;
    ocrMaxImagesPerPage: number;
    ocrPrefetchMargin: number;
    // Read this many viewport-heights / spreads ahead of the viewport so the next
    // pages of a manga reader are OCR'd in the background before you reach them.
    ocrPrefetchPages: number;
    // How many OCR requests may run at once. Manga readers expose many page
    // images/canvases; processing them in parallel removes the slow serial wait.
    ocrConcurrency: number;
    // When a page contains dark regions, run a second, inverted OCR pass and
    // merge the text found over those dark areas — so white text on a black panel
    // is read alongside the normal black-on-white bubbles on the same page
    // (recognizers are tuned for dark-on-light).
    ocrInvertDarkPanels: boolean;
    ocrTextColor: string;
    ocrOutlineColor: string;
    ocrBackgroundColor: string;
    ocrBackgroundOpacity: number;
    ocrFontScale: number;
    localDictionariesEnabled: boolean;
    localDictionaryMaxResults: number;
    localDictionaryShowKanji: boolean;
    kanjiDictionariesAlias: string;
    kanjiDictionariesPriority: number;
    dictionarySourcesInitiallyExpanded: boolean;
    dictionaryPreferences: DictionaryPreference[];
    dictionaryLookupLinks: DictionaryLookupLink[];
    yomitanSettingsBackup?: unknown;
    subtitlePlayerEnabled: boolean;
    subtitleAutoDetect: boolean;
    subtitleOverlayVisible: boolean;
    subtitleSecondaryVisible: boolean;
    subtitleNativeBlurred: boolean;
    subtitleKaraokeMode: boolean;
    subtitleTranscriptVisible: boolean;
    subtitlePausePanel: boolean;
    subtitleShadowAutoPause: boolean;
    subtitleTranscriptPlacement: SubtitleTranscriptPlacement;
    subtitleTranscriptAutoScroll: boolean;
    // Seconds a manual transcript scroll pauses auto-follow before it resumes.
    subtitleTranscriptAutoScrollResumeSeconds: number;
    subtitleAutoCopyLine: boolean;
    subtitleCopyIncludeTranslation: boolean;
    subtitleControlsMode: SubtitleControlsMode;
    subtitleFontSize: number;
    subtitleBottomOffset: number;
    subtitleTextColor: string;
    subtitleOutlineColor: string;
    subtitleBackgroundColor: string;
    subtitleBackgroundOpacity: number;
    subtitleFontFamily: string;
    subtitleFontWeight: number;
    subtitleMiningPause: boolean;
    subtitleHoverPause: boolean;
    subtitleSeekPadding: number;
    youtubeImmersionEnabled: boolean;
    youtubeShowFilterNotice: boolean;
    youtubeShowChannelRecommendations: boolean;
    preferJapaneseSiteLanguage: boolean;
    ankiEnabled: boolean;
    ankiSectionEnabled: boolean;
    ankiSectionAlias: string;
    ankiSectionPriority: number;
    ankiConnectUrl: string;
    ankiDeck: string;
    ankiModel: string;
    ankiTags: string;
    ankiMineWithJpdb: boolean;
    ankiCaptureScreenshot: boolean;
    ankiFieldMappings: AnkiFieldMappings;
    ankiTemplateMode: AnkiTemplateMode;
    ankiFrontReading: boolean;
    ankiFrontSentence: boolean;
    ankiFrontImage: boolean;
    ankiMobileHandoff: boolean;
    studyTranslationEnabled: boolean;
    studyTranslationAlias: string;
    studyTranslationPriority: number;
    studyGrammarEnabled: boolean;
    studyGrammarAlias: string;
    studyGrammarPriority: number;
    enableLogging: boolean;
    theme: 'auto' | 'light' | 'dark';
    popupMode: 'auto' | 'sheet' | 'popover';
    stickyBottomSheet: boolean;
    popoverBackdropEnabled: boolean;
    popoverWidth: number;
    popoverHeight: number;
    popoverHeightMode: 'available' | 'fixed';
    readerFontFamily: string;
    popupFontFamily: string;
    popupFontWeight: number;
    miningDeck: string;
    autoMineOnReview: boolean;
    jpdbMiningEnabled: boolean;
    bunproMiningEnabled: boolean;
    yomuLocalSrsEnabled: boolean;
    apiGradingProvider: 'jpdb' | 'jiten' | 'bunpro';
    neverForgetDeck: string;
    blacklistDeck: string;
    addToForq: boolean;
    enableReviews: boolean;
    twoButtonReviews: boolean;
    shortcuts: {
        scanPage: string;
        hoverLookup: string;
        openSettings: string;
        playAudio: string;
        closePopup: string;
        previousLookupWord: string;
        nextLookupWord: string;
        previousSubtitle: string;
        nextSubtitle: string;
        copySubtitle: string;
        toggleOcr: string;
        toggleSubtitleOverlay: string;
        toggleYoutubeImmersion: string;
        scanImages: string;
        massReviewVisible: string;
        studyReveal: string;
        studyRevealAlternate: string;
        studyUndo: string;
        studyPrevious: string;
        studyPreviousAlternate: string;
        studyNext: string;
        studyNextAlternate: string;
        gradeNothing: string;
        gradeSomething: string;
        gradeHard: string;
        gradeOkay: string;
        gradeEasy: string;
        gradeFail: string;
        gradePass: string;
    };
}

declare global {
    const __YOMU_VERSION__: string;
    const __YOMU_EXTENSION_BUILD__: undefined | boolean;
    // True only in the new-tab study PWA build; lets the offline-first network
    // guard tree-shake out of the size-limited userscript bundle.
    const __YOMU_NEWTAB_BUILD__: undefined | boolean;
    const __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__: undefined | string;

    type UserscriptHttpResponse = { status: number; response: unknown; responseText?: string; finalUrl?: string };
    type UserscriptHttpRequestHandle = { abort?: () => void };
    type UserscriptHttpRequest = (details: {
        method?: string;
        url: string;
        headers?: Record<string, string>;
        data?: string | Blob | FormData | ArrayBuffer;
        responseType?: 'blob' | 'json' | 'text' | 'arraybuffer';
        timeout?: number;
        anonymous?: boolean;
        withCredentials?: boolean;
        cookie?: string;
        onload?: (response: UserscriptHttpResponse) => void;
        onprogress?: (event: { lengthComputable?: boolean; loaded: number; total: number }) => void;
        onerror?: (error: unknown) => void;
        ontimeout?: () => void;
    }) => void | UserscriptHttpRequestHandle | Promise<UserscriptHttpResponse>;

    const GM_xmlhttpRequest: undefined | ((details: {
        method?: string;
        url: string;
        headers?: Record<string, string>;
        data?: string | Blob | FormData | ArrayBuffer;
        responseType?: 'blob' | 'json' | 'text' | 'arraybuffer';
        timeout?: number;
        anonymous?: boolean;
        withCredentials?: boolean;
        cookie?: string;
        onload?: (response: { status: number; response: unknown; responseText?: string; finalUrl?: string }) => void;
        onprogress?: (event: { lengthComputable?: boolean; loaded: number; total: number }) => void;
        onerror?: (error: unknown) => void;
        ontimeout?: () => void;
    }) => void);
    const GM: undefined | {
        getValue?: <T>(key: string, defaultValue: T) => T | Promise<T>;
        setValue?: (key: string, value: unknown) => void | Promise<void>;
        deleteValue?: (key: string) => void | Promise<void>;
        listValues?: () => string[] | Promise<string[]>;
        xmlHttpRequest?: UserscriptHttpRequest;
        xmlhttpRequest?: UserscriptHttpRequest;
        openInTab?: (url: string, options?: { active?: boolean; insert?: boolean; setParent?: boolean } | boolean) => unknown;
        registerMenuCommand?: (name: string, fn: () => void) => void;
    };
    const GM_info: undefined | Record<string, unknown>;
    const GM_setValue: undefined | ((key: string, value: unknown) => void | Promise<void>);
    const GM_getValue: undefined | (<T>(key: string, defaultValue: T) => T | Promise<T>);
    const GM_deleteValue: undefined | ((key: string) => void | Promise<void>);
    const GM_listValues: undefined | (() => string[] | Promise<string[]>);
    const GM_addValueChangeListener: undefined | ((
        key: string,
        listener: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
    ) => number);
    const GM_removeValueChangeListener: undefined | ((listenerId: number) => void);
    const GM_getResourceText: undefined | ((name: string) => string);
    const GM_registerMenuCommand: undefined | ((name: string, fn: () => void) => void);
    const GM_openInTab: undefined | ((url: string, options?: { active?: boolean; insert?: boolean; setParent?: boolean } | boolean) => unknown);
}
