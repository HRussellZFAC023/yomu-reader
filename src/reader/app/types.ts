import type { LanguageProfile, ParserProvider } from '../languages/types';

export type { LanguageProfile, ParserProvider } from '../languages/types';

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
    | 'bunpro'
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
export type AnkiFieldMappingRole = 'expression' | 'reading' | 'meaning' | 'sentence' | 'audio' | 'sentenceAudio' | 'image';
export type AnkiFieldMapping = Partial<Record<AnkiFieldMappingRole, string>>;
export type AnkiFieldMappings = Record<string, AnkiFieldMapping>;

export type NewTabWordSource = 'auto' | 'jpdb' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki' | 'dictionary';

export type NewTabJpdbReviewMode = 'auto' | 'api-vocabulary' | 'live-review';

export type NewTabKanjiKeywordSource = 'auto' | 'rtk' | 'jpdb' | 'local';

export type NewTabStudyChallengeStep =
    | 'kanji-doodle'
    | 'word'
    | 'recall-cloze'
    | 'listen-pitch'
    | 'speaking'
    | 'type-word';

export type NewTabTypeWordInputMode = 'keyboard' | 'handwriting';

export type ReaderColorSource = 'auto' | 'status' | 'jpdb' | 'anki' | 'pitch' | 'off';

export type FuriganaMode = 'auto' | 'all' | 'difficult-kanji' | 'known-status' | 'hover' | 'off';

export type FuriganaStateGroup = 'new' | 'learning' | 'known' | 'due' | 'failed';

/**
 * Word-state groups whose COLOUR can be opted out of.
 *
 * A superset of the furigana groups, because the colour layer has an
 * ignored/suspended/blacklisted/locked family that furigana does not: those
 * states share one colour and one picker. The colour opt-out was originally
 * typed `FuriganaStateGroup[]`, borrowing the furigana taxonomy verbatim, which
 * left that whole family structurally unreachable — a learner with the common
 * particles and Kaishi 1.5k blacklisted had almost every word on the page
 * coloured with no way to turn it off (GitHub #37).
 */
export type WordColorStateGroup = FuriganaStateGroup | 'ignored';

export type WordColorStates = 'all' | 'new-only';

export interface AudioSubSourceSetting {
    name: string;
    enabled: boolean;
}

export interface AudioSourceSetting {
    type: AudioSourceType;
    url: string;
    voice: string;
    enabled: boolean;
    subSources?: AudioSubSourceSetting[];
}

export interface DictionaryPreference {
    name: string;
    alias: string;
    enabled: boolean;
    priority: number;
    allowSecondarySearches?: boolean;
    type?: 'terms' | 'kanji' | 'frequency' | 'pronunciation' | 'metadata';
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

// A compound can have no defensible whole-expression accent while each
// aligned lexical component does (王子様 → 王子 + 様). Keep those contours
// separate so inline rendering can segment its underline instead of falsely
// presenting either component as the pitch of the whole expression.
export interface JPDBPitchComponent {
    spelling: string;
    reading: string;
    pitchAccent: string[];
    wordWithReading: string | null;
    // Geometry recovered from an exact bracket reading, not provider-supplied
    // lexical decomposition. This provenance must survive repeated enrichment
    // so neutral kana tails never become homophone lookup candidates.
    inferredFromAnnotatedReading?: true;
}

export type AnkiCardKind = 'word' | 'kanji' | 'kana' | 'sentence' | 'other';

export interface JPDBCard {
    vid: number;
    sid: number;
    rid: number;
    spelling: string;
    reading: string;
    /** Target language for language-aware local card identity; missing means Japanese. */
    language?: LanguageProfile['targetLanguage'];
    frequencyRank: number | null;
    partOfSpeech: string[];
    meanings: JPDBMeaning[];
    cardState: CardState[];
    // The card's SRS state did NOT come from an authenticated known-state
    // response: it is the public/keyless-lane (jiten public API), local
    // dictionary, or segmented-fallback default (always not-in-deck). Rendered
    // words carry this as data-state-provenance="provisional" so (a) a later
    // public repaint never DOWNGRADES a word that already carries an
    // authoritative jpdb/jiten state, and (b) the known-state backfill knows
    // which words still need an authenticated lookup. Authenticated responses
    // (jpdb, jiten parse/info/study knownState, Bunpro, Anki) leave this unset,
    // so a genuine authenticated not-in-deck stays authoritative and is never
    // re-requested.
    provisionalState?: boolean;
    pitchAccent: string[];
    // jpdb API due_at (unix seconds): the card's next scheduled review.
    // Sorting due cards ascending reproduces jpdb's exact Learn queue order.
    dueAt?: number | null;
    // Provider review timestamp (unix milliseconds), used by the My Cards history sort.
    lastReviewAt?: number | null;
    wordWithReading: string | null;
    source?: 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'local' | 'anki' | 'fallback';
    sentence?: string;
    reviewSource?: 'jpdb-api' | 'jpdb-live' | 'jiten-api' | 'bunpro-api' | 'wanikani-api' | 'yomu-local' | 'anki' | 'dictionary';
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
    // Bunpro's private review endpoint is session-scoped. These values come
    // only from /reviews/quiz_index and are required before Yomu may grade.
    bunproReviewSessionId?: string;
    bunproReviewInputMode?: 'regular' | 'fsrs';
    bunproReviewEndpoint?: 'review' | 'ghost-review' | 'self-study-review';
    // WaniKani subject+assignment identity. A card is WaniKani-gradeable only
    // when wanikaniAssignmentId is set (it came from a real due assignment);
    // ordinary popup matches carry only wanikaniSubjectId for lookup/status.
    wanikaniSubjectId?: number;
    wanikaniAssignmentId?: number;
    wanikaniSubjectType?: 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary';
    wanikaniSrsStage?: string;
    wanikaniAudioUrls?: string[];
    // Transient popover choice: which SRS this card's grade/deck buttons act
    // on, set by the ⇄ provider toggle. Wins over the global apiGradingProvider
    // while the card object lives (not persisted).
    apiGradingProviderOverride?: 'jpdb' | 'jiten' | 'bunpro' | 'wanikani';
    kanjiKeyword?: string;
    sourceCardKey?: string;
    fallbackLookupTerms?: string[];
    pitchComponents?: JPDBPitchComponent[];
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
    wanikaniApiToken: string;
    onboardingSeen: boolean;
    /**
     * True only after the learner has explicitly confirmed a learning target.
     * Pre-1.9 stored settings migrate to true so their existing target remains
     * authoritative; a genuinely fresh profile starts false and fails closed.
     */
    learningTargetChosen: boolean;
    interfaceLanguage: InterfaceLanguage;
    /**
     * Versioned multilingual profiles. Root-level language/parser settings
     * remain compatibility mirrors while callers move to the active profile.
     */
    languageProfiles: LanguageProfile[];
    activeLanguageProfileId: string;
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
    bunproDefinitionsEnabled: boolean;
    bunproDefinitionsAlias: string;
    bunproDefinitionsPriority: number;
    wanikaniDefinitionsEnabled: boolean;
    wanikaniDefinitionsAlias: string;
    wanikaniDefinitionsPriority: number;
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
    wanikaniKanjiEnabled: boolean;
    wanikaniKanjiAlias: string;
    wanikaniKanjiPriority: number;
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
    immersionKitExpandedLimitMigrated20260721: boolean;
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
    newTabTypeWordInputMode: NewTabTypeWordInputMode;
    newTabStudyTourSeen: boolean;
    puckPositionX?: number;
    puckPositionY?: number;
    // Master pause toggled from the puck radial. While paused, Yomu adds no new
    // annotations, removes existing ones, and suppresses hover lookups until
    // resumed. The puck colour reflects this state.
    annotationsPaused: boolean;
    showFurigana: boolean;
    furiganaMode: FuriganaMode;
    // Readings on clamped/clip-constrained CONTENT rows (owner amendment
    // 2026-07-11): 'show' (default) keeps furigana at rest — the row grows
    // naturally in flow; 'hover' re-hides them until hover/focus.
    clampedRowReadings: 'show' | 'hover';
    // Furigana mode the puck's power cycle hid, persisted so resuming after a
    // navigation or reload still restores it ('' = nothing to restore). The
    // cycle collapsed to pause<->resume before this survived the page.
    puckFuriganaModeBeforeHide: FuriganaMode | '';
    furiganaHiddenStateGroups: FuriganaStateGroup[];
    wordColorStates: WordColorStates;
    // Word-state groups whose colour/highlight/underline is suppressed while
    // everything else stays coloured (e.g. "no highlight on known words"). The
    // same five-group taxonomy as furigana hiding; empty = colour every state.
    wordColorHiddenStateGroups: WordColorStateGroup[];
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
    parserProvider: ParserProvider;
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
    // Set once the user picks an overlay's visibility themselves (settings
    // checkbox, rail eye, shortcut). Automatic track selection may only reveal
    // an overlay while the marker is false, so an explicit "off" survives the
    // next auto-selected track instead of being written back to true.
    subtitleOverlayVisibleChosen: boolean;
    subtitleSecondaryVisibleChosen: boolean;
    subtitleNativeBlurred: boolean;
    subtitleNativeBlurStrength: number;
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
    /** True once the learner explicitly changes Japanese YouTube filtering. */
    youtubeImmersionEnabledChosen: boolean;
    youtubeShowFilterNotice: boolean;
    youtubeFilterNoticeRestored20260711: boolean;
    /** Marks the one-time move of a stored `theme: 'light'` default to 'auto'. */
    themeAutoRestored20260730: boolean;
    youtubeShowChannelRecommendations: boolean;
    /** True once the learner explicitly changes Japanese channel suggestions. */
    youtubeShowChannelRecommendationsChosen: boolean;
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
    // Marker for the one-time move of sentence-audio field mappings off the
    // word-audio role (see migrateAnkiSentenceAudioMappings). Deliberate later
    // choices in the mapping editor must stick, so this only ever runs once.
    ankiSentenceAudioMappingMigrated: boolean;
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
    hoverPopupMode: 'auto' | 'sheet' | 'popover';
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
    wanikaniReviewEnabled: boolean;
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
    const __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__: undefined | boolean;

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
    // Synchronous in Tampermonkey/Violentmonkey; the browser-extension GM shim
    // (UserScript Compiler) resolves the resource over XHR and returns a Promise.
    const GM_getResourceText: undefined | ((name: string) => string | Promise<string>);
    const GM_registerMenuCommand: undefined | ((name: string, fn: () => void) => void);
    const GM_openInTab: undefined | ((url: string, options?: { active?: boolean; insert?: boolean; setParent?: boolean } | boolean) => unknown);
}
