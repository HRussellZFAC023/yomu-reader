export type SettingsDialogControllerClass = typeof import('../settings/dialog-controller').SettingsDialogController;
export type SettingsDialogControllerInstance = InstanceType<SettingsDialogControllerClass>;
export type LookupModalAccessibilityClass = typeof import('../popup/modal-accessibility-impl').LookupModalAccessibility;
export type LookupModalAccessibilityInstance = InstanceType<LookupModalAccessibilityClass>;
export type OnboardingControllerClass = typeof import('../app/onboarding').OnboardingController;
type InstallOfflineParsingDictionariesFn = typeof import('../dictionaries/offline-setup').installOfflineParsingDictionaries;
type InstallDefinitionTranslationBehaviorsFn = typeof import('../sources/definition-translation').installDefinitionTranslationBehaviors;
interface SettingsSelfEnhancementCompanion {
    SETTINGS_PARSE_TARGET_LIMIT: typeof import('../lookup/nested-text-parse').SETTINGS_PARSE_TARGET_LIMIT;
    nestedSettingsParseAlreadyRendered: typeof import('../lookup/nested-text-parse').nestedSettingsParseAlreadyRendered;
    nestedSettingsTextParsePlan: typeof import('../lookup/nested-text-parse').nestedSettingsTextParsePlan;
    parsedSettingsTargetsForCurrentPlan: typeof import('../lookup/settings-fallback-tokens').parsedSettingsTargetsForCurrentPlan;
    supplementSettingsFallbackTokens: typeof import('../lookup/settings-fallback-tokens').supplementSettingsFallbackTokens;
    addSettingsRubyFromRenderedReadings: typeof import('../lookup/settings-parse-render').addSettingsRubyFromRenderedReadings;
    settingsForSettingsFormParse: typeof import('../lookup/settings-parse-render').settingsForSettingsFormParse;
}
export type AudioPlayerClass = typeof import('../audio/player').AudioPlayer;
export type AudioPlayerInstance = InstanceType<AudioPlayerClass>;
export type ReaderAudioActionsClass = typeof import('../audio/actions').ReaderAudioActions;
export type ReaderAudioActionsInstance = InstanceType<ReaderAudioActionsClass>;
export type JpdbClientClass = typeof import('../jpdb/jpdb').JpdbClient;
export type JpdbClientInstance = InstanceType<JpdbClientClass>;
export type JpdbVocabularyClientClass = typeof import('../jpdb/jpdb-vocabulary').JpdbVocabularyClient;
export type JpdbVocabularyClientInstance = InstanceType<JpdbVocabularyClientClass>;
export type JpdbPublicPitchClientClass = typeof import('../jpdb/jpdb-public-pitch').JpdbPublicPitchClient;
export type JpdbPublicPitchClientInstance = InstanceType<JpdbPublicPitchClientClass>;
type InitJpdbReviewPageBridgeFn = typeof import('../jpdb/jpdb-review-bridge').initJpdbReviewPageBridge;
type RenderJpdbDefinitionSourceFn = typeof import('../jpdb/jpdb-definition-source-render').renderJpdbDefinitionSource;
type RenderedJpdbRelatedWordsFn = typeof import('../jpdb/jpdb-related-words').renderedJpdbRelatedWords;
export type JitenPublicVocabularyClientClass = typeof import('../dictionaries/jiten-public-vocabulary').JitenPublicVocabularyClient;
export type JitenPublicVocabularyClientInstance = InstanceType<JitenPublicVocabularyClientClass>;
type ParsedCardHydrationKeyFn = typeof import('../dictionaries/jiten-public-vocabulary').parsedCardHydrationKey;
type PublicJitenBackoffRemainingMsFn = typeof import('../dictionaries/jiten-public-vocabulary').publicJitenBackoffRemainingMs;
type RenderJitenDefinitionSourceFn = typeof import('../jiten/jiten-definition-source-render').renderJitenDefinitionSource;
type WanikaniClientClass = typeof import('../wanikani/wanikani').WanikaniClient;
type WanikaniLookupClientClass = typeof import('../wanikani/wanikani-lookup').WanikaniLookupClient;
type WanikaniSourceControllerClass = typeof import('../wanikani/wanikani-source').WanikaniSourceController;
type RenderWanikaniDefinitionMountFn = typeof import('../wanikani/wanikani-source').renderWanikaniDefinitionMount;
type CreateWanikaniSrsAdapterFn = typeof import('../srs/wanikani').createWanikaniSrsAdapter;
export type SubtitlePlayerControllerClass = typeof import('../subtitles/controller').SubtitlePlayerController;
export type YoutubeImmersionFilterClass = typeof import('../subtitles/youtube').YoutubeImmersionFilter;
export type YoutubeImmersionFilterInstance = InstanceType<YoutubeImmersionFilterClass>;
export type ImageOcrControllerClass = typeof import('../ocr/controller').ImageOcrController;
export type NormalizeOcrRenderedTextFn = typeof import('../ocr/rendered-text').normalizeOcrRenderedText;
export type I18nCompanion = typeof import('../app/i18n');
export type RenderAnkiActionRowFn = typeof import('../anki/render-impl').renderAnkiActionRow;
export type RenderAnkiExistingSectionFn = typeof import('../anki/render-impl').renderAnkiExistingSection;
export type RenderAnkiNewCardPreviewFn = typeof import('../anki/render-impl').renderAnkiNewCardPreview;
export type PruneRedundantAnkiGlyphRepeatsFn = typeof import('../anki/render-impl').pruneRedundantAnkiGlyphRepeats;
export type RenderAnkiRenderedCardStudyBodyFn = typeof import('../anki/render-impl').renderAnkiRenderedCardStudyBody;
export type RenderReviewButtonsFn = typeof import('../anki/render-impl').renderReviewButtons;
export type ReviewButtonGradesFn = typeof import('../anki/render-impl').reviewButtonGrades;
// Consumed by the registry slot type below and the companion build.
export type AnkiConnectClientClass = typeof import('../anki/client').AnkiConnectClient;
// Consumed by the registry slot type below and the companion build.
export type AnkiDuplicateNoteErrorClass = typeof import('../anki/client').AnkiDuplicateNoteError;
// Consumed by the registry slot type below and the companion build.
export type AnkiLookupWithUnavailableDetailsFn = typeof import('../anki/client').ankiLookupWithUnavailableDetails;
// Consumed by the registry slot type below and the companion build.
export type BuildYomuAnkiFieldsFn = typeof import('../anki/field-render').buildYomuAnkiFields;
// Consumed by the registry slot type below and the companion build.
export type BuildYomuAnkiPreviewFieldsFn = typeof import('../anki/field-render').buildYomuAnkiPreviewFields;
// Consumed by the registry slot type below and the companion build.
export type CanUseMobileAnkiHandoffFn = typeof import('../anki/mobile-handoff').canUseMobileAnkiHandoff;
// Consumed by the registry slot type below and the companion build.
export type CaptureActiveVideoFrameFn = typeof import('../anki/client').captureActiveVideoFrame;
// Consumed by the registry slot type below and the companion build.
export type IsAnkiDuplicateNoteErrorFn = typeof import('../anki/client').isAnkiDuplicateNoteError;
// Consumed by the registry slot type below and the companion build.
export type MobileAnkiHandoffAppNameFn = typeof import('../anki/mobile-handoff').mobileAnkiHandoffAppName;
// Consumed by the registry slot type below and the companion build.
export type ResolveAnkiWordAudioFn = typeof import('../anki/audio').resolveAnkiWordAudio;
type InstallUchisenCarouselFn = typeof import('../dictionaries/uchisen').installUchisenCarousel;
type LoadUchisenDataFn = typeof import('../dictionaries/uchisen').loadUchisenData;
type ResetGrammarRuleDataCacheForTestsFn = typeof import('../study/tools-impl').resetGrammarRuleDataCacheForTests;
type ListLocalGrammarRuleExamplesFn = typeof import('../study/tools-impl').listLocalGrammarRuleExamples;
type ListLocalGrammarRulesFn = typeof import('../study/tools-impl').listLocalGrammarRules;
type DetectGrammarHintsFn = typeof import('../study/tools-impl').detectGrammarHints;
type PreloadGrammarResourcesFn = typeof import('../study/tools-impl').preloadGrammarResources;
type PreloadJapaneseSentenceTranslationFn = typeof import('../study/tools-impl').preloadJapaneseSentenceTranslation;
type SetGrammarRuleKnownFn = typeof import('../study/tools-impl').setGrammarRuleKnown;
type SetKnownGrammarVisibleFn = typeof import('../study/tools-impl').setKnownGrammarVisible;
type TranslateJapaneseSentenceFn = typeof import('../study/tools-impl').translateJapaneseSentence;
type RenderGrammarHintsFn = typeof import('../study/tools-impl').renderGrammarHints;
type NormalizeMiningSentenceFn = typeof import('../study/mining-context').normalizeMiningSentence;
type InferMiningSourceKindFn = typeof import('../study/mining-context').inferMiningSourceKind;
type CreateFallbackMiningContextFn = typeof import('../study/mining-context').createFallbackMiningContext;
type ResolveMiningContextFn = typeof import('../study/mining-context').resolveMiningContext;
type SaveMiningContextFn = typeof import('../study/mining-context').saveMiningContext;
type LoadMiningContextFn = typeof import('../study/mining-context').loadMiningContext;
type ImmersionContextFromExampleFn = typeof import('../study/mining-context').immersionContextFromExample;
type ImmersionContextFromElementFn = typeof import('../study/mining-context').immersionContextFromElement;
type PageMiningContextFn = typeof import('../study/mining-context').pageMiningContext;
type ContextLabelFn = typeof import('../study/mining-context').contextLabel;
type StudySourceControllerClass = typeof import('../study/sources').StudySourceController;
type LearningTargetRuntime = Pick<
    typeof import('../languages/target-runtime'),
    | 'activeLearningTarget'
    | 'activeLearningTargetGeneration'
    | 'activeLearningTargetLanguage'
    | 'adoptLearningTargetLanguage'
    | 'defaultLearningTargetModule'
    | 'learningTargetModuleFor'
    | 'normalizeLearningTargetLanguage'
    | 'registeredLearningTargetModules'
>;

interface YomuCompanionRegistry {
    learningTargets?: LearningTargetRuntime;
    annotations?: {
        clearProjectedReadings: typeof import('../dom/detached-reading-overlay-impl').clearProjectedReadings;
        clearProjectedReadingsWithin: typeof import('../dom/detached-reading-overlay-impl').clearProjectedReadingsWithin;
        projectedReadingWordAtPoint: typeof import('../dom/detached-reading-overlay-impl').projectedReadingWordAtPoint;
        pruneProjectedReadings: typeof import('../dom/detached-reading-overlay-impl').pruneProjectedReadings;
        syncProjectedReadings: typeof import('../dom/detached-reading-overlay-impl').syncProjectedReadings;
    };
    // The Bunpro provider suite (client, SRS adapter, word-state colouring,
    // token importer, definition section) ships in the Yomu Bunpro companion;
    // core keeps only the tiny status-attribute helper and type imports.
    bunpro?: {
        BunproClient: typeof import('../bunpro/bunpro').BunproClient;
        BunproWordStateStore: typeof import('../bunpro/word-states').BunproWordStateStore;
        createBunproSrsAdapter: typeof import('../srs/bunpro').createBunproSrsAdapter;
        effectiveBunproWordState: typeof import('../bunpro/word-states').effectiveBunproWordState;
        installBunproFrontendTokenImporter: typeof import('../bunpro/frontend-token-importer').installBunproFrontendTokenImporter;
        lookupBunproDefinitionResult: typeof import('../bunpro/definition').lookupBunproDefinitionResult;
        renderBunproDefinitionSource: typeof import('../bunpro/definition').renderBunproDefinitionSource;
    };
    // Pronunciation playback (candidate discovery, blob fetching, JPDB audio
    // files, TTS fallbacks) ships in the Yomu Audio companion; core keeps only
    // the auto-play gate and the source-name helpers the settings model needs.
    audio?: {
        AudioPlayer: AudioPlayerClass;
        ReaderAudioActions: ReaderAudioActionsClass;
    };
    // The WaniKani provider suite (API client, subject parsing, definition
    // mounts, SRS adapter) ships in the Yomu WaniKani companion; without it the
    // provider reports no credential and stays inert.
    wanikani?: {
        WanikaniClient: WanikaniClientClass;
        WanikaniLookupClient: WanikaniLookupClientClass;
        WanikaniSourceController: WanikaniSourceControllerClass;
        renderWanikaniDefinitionMount: RenderWanikaniDefinitionMountFn;
        createWanikaniSrsAdapter: CreateWanikaniSrsAdapterFn;
    };
    // The JPDB provider suite (API client, public vocabulary/pitch scrapers,
    // the jpdb.io review-page bridge, and the JPDB definition card) ships in
    // the Yomu JPDB companion; core keeps the tiny shared text/pitch helpers
    // its other providers already reuse. Without the companion every JPDB
    // entry point behaves like an unconfigured provider: no requests, no
    // review bridge, no JPDB definition section.
    jpdb?: {
        JpdbClient: JpdbClientClass;
        JpdbVocabularyClient: JpdbVocabularyClientClass;
        JpdbPublicPitchClient: JpdbPublicPitchClientClass;
        initJpdbReviewPageBridge: InitJpdbReviewPageBridgeFn;
        renderJpdbDefinitionSource: RenderJpdbDefinitionSourceFn;
        renderedJpdbRelatedWords: RenderedJpdbRelatedWordsFn;
    };
    // The Jiten provider's keyless public vocabulary/parse client and its
    // definition card ship in the Yomu Jiten companion. Core keeps the
    // credentialed JitenApiClient (it is the shared card/frequency backbone);
    // without the companion the public fallback answers nothing and the Jiten
    // definition section renders empty rather than throwing.
    jiten?: {
        JitenPublicVocabularyClient: JitenPublicVocabularyClientClass;
        JITEN_BACKGROUND_DETAIL_TIMEOUT_MS: number;
        parsedCardHydrationKey: ParsedCardHydrationKeyFn;
        publicJitenBackoffRemainingMs: PublicJitenBackoffRemainingMsFn;
        renderJitenDefinitionSource: RenderJitenDefinitionSourceFn;
    };
    localDictionaries?: {
        YomitanDictionaryStore: typeof import('../dictionaries/yomitan').YomitanDictionaryStore;
        renderStructuredGlossaryHtml?: typeof import('../dictionaries/yomitan/structured-content').renderStructuredGlossaryHtml;
        enumerateDictionaryArchiveStorageKeys?: typeof import('../dictionaries/archive-cache').enumerateDictionaryArchiveStorageKeys;
    };
    anki?: {
        AnkiConnectClient: AnkiConnectClientClass;
        AnkiDuplicateNoteError: AnkiDuplicateNoteErrorClass;
        ankiLookupWithUnavailableDetails: AnkiLookupWithUnavailableDetailsFn;
        buildYomuAnkiFields: BuildYomuAnkiFieldsFn;
        buildYomuAnkiPreviewFields: BuildYomuAnkiPreviewFieldsFn;
        canUseMobileAnkiHandoff: CanUseMobileAnkiHandoffFn;
        captureActiveVideoFrame: CaptureActiveVideoFrameFn;
        isAnkiDuplicateNoteError: IsAnkiDuplicateNoteErrorFn;
        mobileAnkiHandoffAppName: MobileAnkiHandoffAppNameFn;
        resolveAnkiWordAudio: ResolveAnkiWordAudioFn;
        renderAnkiActionRow: RenderAnkiActionRowFn;
        renderAnkiExistingSection: RenderAnkiExistingSectionFn;
        renderAnkiNewCardPreview: RenderAnkiNewCardPreviewFn;
        pruneRedundantAnkiGlyphRepeats: PruneRedundantAnkiGlyphRepeatsFn;
        renderAnkiRenderedCardStudyBody: RenderAnkiRenderedCardStudyBodyFn;
        renderReviewButtons: RenderReviewButtonsFn;
        reviewButtonGrades: ReviewButtonGradesFn;
    };
    settings?: {
        SettingsDialogController: SettingsDialogControllerClass;
        LookupModalAccessibility?: LookupModalAccessibilityClass;
        OnboardingController: OnboardingControllerClass;
        // Multilingual catalogues and locale copy are intentionally owned by
        // the settings companion so they do not enter the size-limited core.
        installOfflineParsingDictionaries: InstallOfflineParsingDictionariesFn;
        installDefinitionTranslationBehaviors: InstallDefinitionTranslationBehaviorsFn;
        // Academy account pairing/device sync is an account-surface feature and
        // rides with the settings companion that owns the account panel.
        installAcademyReaderSrsSync?: typeof import('../srs/account-sync').installAcademyReaderSrsSync;
        selfEnhancement: SettingsSelfEnhancementCompanion;
        lookupLinks?: {
            hasTargetLookupSites: typeof import('../settings/lookup-links').hasTargetLookupSites;
            targetLookupSiteIds: typeof import('../settings/lookup-links').targetLookupSiteIds;
            isTargetLookupLinkId: typeof import('../settings/lookup-links').isTargetLookupLinkId;
            targetLookupSites: typeof import('../settings/lookup-links').targetLookupSites;
            targetLookupLinks: typeof import('../settings/lookup-links').targetLookupLinks;
            lookupSiteComponents: typeof import('../settings/lookup-links').lookupSiteComponents;
            missingLookupComponents: typeof import('../settings/lookup-links').missingLookupComponents;
        };
    };
    video?: {
        SubtitlePlayerController: SubtitlePlayerControllerClass;
        YoutubeImmersionFilter: YoutubeImmersionFilterClass;
        // Japanese-site-language preference (spoofing + redirects) rides in
        // the video companion as a sibling immersion feature; absent
        // companion means the preference is inert.
        installPreferredJapaneseSiteLanguageFromStoredSettings?: typeof import('../app/preferred-site-language-impl').installPreferredJapaneseSiteLanguageFromStoredSettings;
        applyPreferredJapaneseSiteLanguage?: typeof import('../app/preferred-site-language-impl').applyPreferredJapaneseSiteLanguage;
        preferredJapaneseSiteUrl?: typeof import('../app/preferred-site-language-impl').preferredJapaneseSiteUrl;
    };
    ocr?: {
        ImageOcrController: ImageOcrControllerClass;
        normalizeOcrRenderedText?: NormalizeOcrRenderedTextFn;
    };
    i18n?: Pick<I18nCompanion,
        | 'CARD_STATE_LABEL_KEYS'
        | 'audioSourceLabel'
        | 'cardStateLabel'
        | 'formatUiText'
        | 'grammarRuleText'
        | 'nextExplicitUiLanguage'
        | 'resolveUiLanguage'
        | 'uiList'
        | 'uiText'
    >;
    // ADR-0003 Kanji/Study extraction (scaffolding shipped 0.6.112; core
    // import-severing remains a follow-up lane).
    kanjiStudy?: {
        // Immersion Kit is study material (example sentences with media), so it
        // ships in the Kanji/Study companion; core only keeps the cheap
        // query-usefulness gate (../immersion/query) for preload decisions.
        ImmersionKitClient: typeof import('../immersion/kit').ImmersionKitClient;
        ImmersionPopoverController: typeof import('../immersion/popover-controller').ImmersionPopoverController;
        KanjiOriginClient: typeof import('../kanji/origin').KanjiOriginClient;
        KanjiVGClient: typeof import('../kanji/vg').KanjiVGClient;
        RtkClient: typeof import('../kanji/rtk').RtkClient;
        JpdbKanjiClient: typeof import('../jpdb/jpdb-kanji').JpdbKanjiClient;
        renderKanjiOriginGraph: typeof import('../popup/origin-graph').renderKanjiOriginGraph;
        renderJpdbKanjiInfo: typeof import('../popup/jpdb-kanji-info').renderJpdbKanjiInfo;
        renderJpdbKanjiMiningControls: typeof import('../popup/jpdb-kanji-info').renderJpdbKanjiMiningControls;
        renderKanjiPractice: typeof import('../popup/kanji-practice').renderKanjiPractice;
        installKanjiPracticeDoodle?: typeof import('../kanji/practice-grader').installKanjiPracticeDoodle;
        renderKanjiOrigins: typeof import('../popup/kanji-origin').renderKanjiOrigins;
        buildRtkComponentSummaries: typeof import('../popup/rtk-info').buildRtkComponentSummaries;
        renderKanjiKeywordLine: typeof import('../popup/rtk-info').renderKanjiKeywordLine;
        renderRtkInfo: typeof import('../popup/rtk-info').renderRtkInfo;
        installOriginGraphInteractions: typeof import('../popup/origin-graph-interactions').installOriginGraphInteractions;
        buildKanjiFacts: typeof import('../kanji/origin').buildKanjiFacts;
        buildKanjiOriginGraph: typeof import('../kanji/origin').buildKanjiOriginGraph;
        installUchisenCarousel: InstallUchisenCarouselFn;
        loadUchisenData: LoadUchisenDataFn;
        resetGrammarRuleDataCacheForTests?: ResetGrammarRuleDataCacheForTestsFn;
        listLocalGrammarRuleExamples?: ListLocalGrammarRuleExamplesFn;
        listLocalGrammarRules?: ListLocalGrammarRulesFn;
        detectGrammarHints?: DetectGrammarHintsFn;
        preloadGrammarResources?: PreloadGrammarResourcesFn;
        preloadJapaneseSentenceTranslation?: PreloadJapaneseSentenceTranslationFn;
        setGrammarRuleKnown?: SetGrammarRuleKnownFn;
        setKnownGrammarVisible?: SetKnownGrammarVisibleFn;
        translateJapaneseSentence?: TranslateJapaneseSentenceFn;
        renderGrammarHints?: RenderGrammarHintsFn;
        renderStudyToolResult?: typeof import('../study/render-impl').renderStudyToolResult;
        handleStudyGrammarAction?: typeof import('../study/render-impl').handleStudyGrammarAction;
        toggleMiningControls?: typeof import('../study/mining-controls-impl').toggleMiningControls;
        setMiningControlsExpanded?: typeof import('../study/mining-controls-impl').setMiningControlsExpanded;
        openDeckPickerForCardAdd?: typeof import('../study/mining-controls-impl').openDeckPickerForCardAdd;
        updateKanjiMiningControlsMount?: typeof import('../kanji/mining-controls-impl').updateKanjiMiningControlsMount;
        normalizeMiningSentence?: NormalizeMiningSentenceFn;
        inferMiningSourceKind?: InferMiningSourceKindFn;
        createFallbackMiningContext?: CreateFallbackMiningContextFn;
        resolveMiningContext?: ResolveMiningContextFn;
        saveMiningContext?: SaveMiningContextFn;
        loadMiningContext?: LoadMiningContextFn;
        immersionContextFromExample?: ImmersionContextFromExampleFn;
        immersionContextFromElement?: ImmersionContextFromElementFn;
        pageMiningContext?: PageMiningContextFn;
        contextLabel?: ContextLabelFn;
        StudySourceController?: StudySourceControllerClass;
        // Jiten kanji panels (fact rows, keyword lines, word paging) are kanji
        // study material, so their renderers ship here; core keeps the popover
        // shell that mounts them.
        renderJitenKanjiInfo?: typeof import('../jiten/jiten-kanji-info-render').renderJitenKanjiInfo;
        renderJitenKanjiKeywordLine?: typeof import('../jiten/jiten-kanji-info-render').renderJitenKanjiKeywordLine;
        jitenKanjiOriginFactLabels?: typeof import('../jiten/jiten-kanji-info-render').jitenKanjiOriginFactLabels;
        filterJitenKanjiWords?: typeof import('../jiten/jiten-kanji-words-actions').filterJitenKanjiWords;
        loadMoreJitenKanjiWords?: typeof import('../jiten/jiten-kanji-words-actions').loadMoreJitenKanjiWords;
    };
}

type YomuCompanionWindow = typeof globalThis & {
    __yomuCompanions?: YomuCompanionRegistry;
};

let sandboxCompanions: YomuCompanionRegistry = {};

export function registerYomuCompanion<K extends keyof YomuCompanionRegistry>(
    key: K,
    value: NonNullable<YomuCompanionRegistry[K]>,
): void {
    writeYomuCompanions({
        ...yomuCompanions(),
        [key]: value,
    });
}

export function yomuSettingsDialogController(): SettingsDialogControllerClass | undefined {
    return yomuCompanions().settings?.SettingsDialogController;
}

export function yomuOnboardingController(): OnboardingControllerClass | undefined {
    return yomuCompanions().settings?.OnboardingController;
}

export function yomuSettingsSurfaceCompanion(): NonNullable<YomuCompanionRegistry['settings']> | undefined {
    return yomuCompanions().settings;
}

export function yomuAnkiCompanion(): NonNullable<YomuCompanionRegistry['anki']> | undefined {
    return yomuCompanions().anki;
}

export function yomuAudioCompanion(): NonNullable<YomuCompanionRegistry['audio']> | undefined {
    return yomuCompanions().audio;
}

export function yomuWanikaniCompanion(): NonNullable<YomuCompanionRegistry['wanikani']> | undefined {
    return yomuCompanions().wanikani;
}

export function yomuJpdbCompanion(): NonNullable<YomuCompanionRegistry['jpdb']> | undefined {
    return yomuCompanions().jpdb;
}

export function yomuJitenCompanion(): NonNullable<YomuCompanionRegistry['jiten']> | undefined {
    return yomuCompanions().jiten;
}

export function yomuVideoCompanionSlot(): YomuCompanionRegistry['video'] | undefined {
    return yomuCompanions().video;
}

export function yomuAnnotationsCompanion(): YomuCompanionRegistry['annotations'] | undefined {
    return yomuCompanions().annotations;
}

export function yomuSubtitlePlayerController(): SubtitlePlayerControllerClass | undefined {
    return yomuCompanions().video?.SubtitlePlayerController;
}

export function yomuYoutubeImmersionFilter(): YoutubeImmersionFilterClass | undefined {
    return yomuCompanions().video?.YoutubeImmersionFilter;
}

export function yomuImageOcrController(): ImageOcrControllerClass | undefined {
    return yomuCompanions().ocr?.ImageOcrController;
}

export function yomuNormalizeOcrRenderedText(): NormalizeOcrRenderedTextFn | undefined {
    return yomuCompanions().ocr?.normalizeOcrRenderedText;
}

export function yomuLocalDictionaries(): NonNullable<YomuCompanionRegistry['localDictionaries']> | undefined {
    return yomuCompanions().localDictionaries;
}

export function yomuLearningTargetRuntime(): YomuCompanionRegistry['learningTargets'] | undefined {
    return yomuCompanions().learningTargets;
}

export function yomuI18nCompanion(): YomuCompanionRegistry['i18n'] | undefined {
    return yomuCompanions().i18n;
}

export function yomuBunproCompanion(): YomuCompanionRegistry['bunpro'] | undefined {
    return yomuCompanions().bunpro;
}

export function yomuKanjiStudyCompanion(): NonNullable<YomuCompanionRegistry['kanjiStudy']> | undefined {
    return yomuCompanions().kanjiStudy;
}

function yomuCompanions(): YomuCompanionRegistry {
    return readYomuCompanions(globalThis)
        ?? sandboxCompanions
        ?? (typeof window === 'undefined' ? undefined : readYomuCompanions(window))
        ?? {};
}

function writeYomuCompanions(value: YomuCompanionRegistry): void {
    sandboxCompanions = value;
    writeYomuCompanionsTarget(globalThis, value);
    if (typeof window !== 'undefined' && window !== globalThis) {
        // Cross-compartment target (Firefox userscript sandbox → Xray page window):
        // a sandbox object may not be defined on the page window ("Not allowed to
        // define cross-origin object as property" console errors on every page);
        // it must be cloned into the page compartment first, and skipped if the
        // clone is refused.
        const pageValue = pageCompartmentRegistryValue(value);
        if (pageValue) writeYomuCompanionsTarget(window, pageValue);
    }
}

function pageCompartmentRegistryValue(value: YomuCompanionRegistry): YomuCompanionRegistry | undefined {
    const cloneInto = (globalThis as {
        cloneInto?: (value: unknown, scope: object, options?: { cloneFunctions?: boolean; wrapReflectors?: boolean }) => unknown;
    }).cloneInto;
    if (typeof cloneInto !== 'function') return value;
    try {
        return cloneInto(value, window, { cloneFunctions: true, wrapReflectors: true }) as YomuCompanionRegistry;
    } catch {
        return undefined;
    }
}

function writeYomuCompanionsTarget(target: unknown, value: YomuCompanionRegistry): boolean {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return false;
    const writable = target as YomuCompanionWindow;
    try {
        writable.__yomuCompanions = value;
        return true;
    } catch {
    }
    try {
        Object.defineProperty(writable, '__yomuCompanions', {
            configurable: true,
            enumerable: false,
            writable: true,
            value,
        });
        return true;
    } catch {
        return false;
    }
}

function readYomuCompanions(target: unknown): YomuCompanionRegistry | undefined {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return undefined;
    try {
        return (target as YomuCompanionWindow).__yomuCompanions;
    } catch {
        return undefined;
    }
}
