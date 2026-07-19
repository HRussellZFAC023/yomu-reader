export type SettingsDialogControllerClass = typeof import('../settings/dialog-controller').SettingsDialogController;
export type SettingsDialogControllerInstance = InstanceType<SettingsDialogControllerClass>;
export type OnboardingControllerClass = typeof import('../app/onboarding').OnboardingController;
export type SubtitlePlayerControllerClass = typeof import('../subtitles/controller').SubtitlePlayerController;
export type SubtitlePlayerControllerInstance = InstanceType<SubtitlePlayerControllerClass>;
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

interface YomuCompanionRegistry {
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
    localDictionaries?: {
        YomitanDictionaryStore: typeof import('../dictionaries/yomitan').YomitanDictionaryStore;
        // Rebuilds this origin's per-origin dictionary store from the
        // cross-origin archive cache; ships with the settings-surface
        // companion because core has no local dictionaries without it.
        ensureLocalDictionariesReplicated?: typeof import('../dictionaries/replication').ensureLocalDictionariesReplicated;
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
        OnboardingController: OnboardingControllerClass;
    };
    video?: {
        SubtitlePlayerController: SubtitlePlayerControllerClass;
        YoutubeImmersionFilter: YoutubeImmersionFilterClass;
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

export function yomuAnkiCompanion(): NonNullable<YomuCompanionRegistry['anki']> | undefined {
    return yomuCompanions().anki;
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
