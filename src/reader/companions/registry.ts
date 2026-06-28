export type SettingsDialogControllerClass = typeof import('../settings/dialog-controller').SettingsDialogController;
export type SettingsDialogControllerInstance = InstanceType<SettingsDialogControllerClass>;
export type SubtitlePlayerControllerClass = typeof import('../subtitles/controller').SubtitlePlayerController;
export type SubtitlePlayerControllerInstance = InstanceType<SubtitlePlayerControllerClass>;
export type YoutubeImmersionFilterClass = typeof import('../subtitles/youtube').YoutubeImmersionFilter;
export type YoutubeImmersionFilterInstance = InstanceType<YoutubeImmersionFilterClass>;
export type ImageOcrControllerClass = typeof import('../ocr/controller').ImageOcrController;
export type NormalizeOcrRenderedTextFn = typeof import('../ocr/rendered-text').normalizeOcrRenderedText;
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

interface YomuCompanionRegistry {
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
    };
    video?: {
        SubtitlePlayerController: SubtitlePlayerControllerClass;
        YoutubeImmersionFilter: YoutubeImmersionFilterClass;
    };
    ocr?: {
        ImageOcrController: ImageOcrControllerClass;
        normalizeOcrRenderedText?: NormalizeOcrRenderedTextFn;
    };
    // ADR-0003 Kanji/Study extraction (scaffolding shipped 0.6.112; core
    // import-severing remains a follow-up lane).
    kanjiStudy?: {
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
        writeYomuCompanionsTarget(window, value);
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
