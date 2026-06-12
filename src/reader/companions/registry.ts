export type SettingsDialogControllerClass = typeof import('../settings/dialog-controller').SettingsDialogController;
export type SettingsDialogControllerInstance = InstanceType<SettingsDialogControllerClass>;
export type SubtitlePlayerControllerClass = typeof import('../subtitles/controller').SubtitlePlayerController;
export type SubtitlePlayerControllerInstance = InstanceType<SubtitlePlayerControllerClass>;
export type YoutubeImmersionFilterClass = typeof import('../subtitles/youtube').YoutubeImmersionFilter;
export type YoutubeImmersionFilterInstance = InstanceType<YoutubeImmersionFilterClass>;
export type ImageOcrControllerClass = typeof import('../ocr/controller').ImageOcrController;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type KanjiOriginClientClass = typeof import('../kanji/origin').KanjiOriginClient;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type KanjiVGClientClass = typeof import('../kanji/vg').KanjiVGClient;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RtkClientClass = typeof import('../kanji/rtk').RtkClient;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type JpdbKanjiClientClass = typeof import('../jpdb/jpdb-kanji').JpdbKanjiClient;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RenderKanjiOriginGraphFn = typeof import('../popup/origin-graph').renderKanjiOriginGraph;
export type RenderJpdbKanjiInfoFn = typeof import('../popup/jpdb-kanji-info').renderJpdbKanjiInfo;
export type RenderJpdbKanjiMiningControlsFn = typeof import('../popup/jpdb-kanji-info').renderJpdbKanjiMiningControls;
export type RenderKanjiPracticeFn = typeof import('../popup/kanji-practice').renderKanjiPractice;
export type RenderKanjiOriginsFn = typeof import('../popup/kanji-origin').renderKanjiOrigins;
export type BuildRtkComponentSummariesFn = typeof import('../popup/rtk-info').buildRtkComponentSummaries;
export type RenderKanjiKeywordLineFn = typeof import('../popup/rtk-info').renderKanjiKeywordLine;
export type RenderRtkInfoFn = typeof import('../popup/rtk-info').renderRtkInfo;
export type InstallOriginGraphInteractionsFn = typeof import('../popup/origin-graph-interactions').installOriginGraphInteractions;
export type BuildKanjiFactsFn = typeof import('../kanji/origin').buildKanjiFacts;
export type BuildKanjiOriginGraphFn = typeof import('../kanji/origin').buildKanjiOriginGraph;
export type RenderAnkiActionRowFn = typeof import('../anki/render-impl').renderAnkiActionRow;
export type RenderAnkiExistingSectionFn = typeof import('../anki/render-impl').renderAnkiExistingSection;
export type RenderAnkiNewCardPreviewFn = typeof import('../anki/render-impl').renderAnkiNewCardPreview;
export type PruneRedundantAnkiGlyphRepeatsFn = typeof import('../anki/render-impl').pruneRedundantAnkiGlyphRepeats;
export type RenderAnkiRenderedCardStudyBodyFn = typeof import('../anki/render-impl').renderAnkiRenderedCardStudyBody;
export type RenderReviewButtonsFn = typeof import('../anki/render-impl').renderReviewButtons;
export type ReviewButtonGradesFn = typeof import('../anki/render-impl').reviewButtonGrades;

interface YomuCompanionRegistry {
    anki?: {
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
    };
    // ADR-0003 Kanji/Study extraction (scaffolding shipped 0.6.112; core
    // import-severing is the follow-up lane — see refactor-backlog).
    kanjiStudy?: {
        KanjiOriginClient: KanjiOriginClientClass;
        KanjiVGClient: KanjiVGClientClass;
        RtkClient: RtkClientClass;
        JpdbKanjiClient: JpdbKanjiClientClass;
        renderKanjiOriginGraph: RenderKanjiOriginGraphFn;
        renderJpdbKanjiInfo: RenderJpdbKanjiInfoFn;
        renderJpdbKanjiMiningControls: RenderJpdbKanjiMiningControlsFn;
        renderKanjiPractice: RenderKanjiPracticeFn;
        renderKanjiOrigins: RenderKanjiOriginsFn;
        buildRtkComponentSummaries: BuildRtkComponentSummariesFn;
        renderKanjiKeywordLine: RenderKanjiKeywordLineFn;
        renderRtkInfo: RenderRtkInfoFn;
        installOriginGraphInteractions: InstallOriginGraphInteractionsFn;
        buildKanjiFacts: BuildKanjiFactsFn;
        buildKanjiOriginGraph: BuildKanjiOriginGraphFn;
    };
}

type YomuCompanionWindow = typeof globalThis & {
    __yomuCompanions?: YomuCompanionRegistry;
};

export function registerYomuCompanion<K extends keyof YomuCompanionRegistry>(
    key: K,
    value: NonNullable<YomuCompanionRegistry[K]>,
): void {
    const target = globalThis as YomuCompanionWindow;
    target.__yomuCompanions = {
        ...(target.__yomuCompanions ?? {}),
        [key]: value,
    };
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

export function yomuKanjiStudyCompanion(): NonNullable<YomuCompanionRegistry['kanjiStudy']> | undefined {
    return yomuCompanions().kanjiStudy;
}

function yomuCompanions(): YomuCompanionRegistry {
    return (globalThis as YomuCompanionWindow).__yomuCompanions ?? {};
}
