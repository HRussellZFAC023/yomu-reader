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
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RenderJpdbKanjiInfoFn = typeof import('../popup/jpdb-kanji-info').renderJpdbKanjiInfo;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RenderJpdbKanjiMiningControlsFn = typeof import('../popup/jpdb-kanji-info').renderJpdbKanjiMiningControls;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RenderKanjiPracticeFn = typeof import('../popup/kanji-practice').renderKanjiPractice;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RenderKanjiOriginsFn = typeof import('../popup/kanji-origin').renderKanjiOrigins;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type BuildRtkComponentSummariesFn = typeof import('../popup/rtk-info').buildRtkComponentSummaries;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RenderKanjiKeywordLineFn = typeof import('../popup/rtk-info').renderKanjiKeywordLine;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type RenderRtkInfoFn = typeof import('../popup/rtk-info').renderRtkInfo;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type InstallOriginGraphInteractionsFn = typeof import('../popup/origin-graph-interactions').installOriginGraphInteractions;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
export type BuildKanjiFactsFn = typeof import('../kanji/origin').buildKanjiFacts;
// Consumed by the registry slot type below and the companion build.
// fallow-ignore-next-line unused-type
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
    if (writeYomuCompanionsTarget(globalThis, value)) return;
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
