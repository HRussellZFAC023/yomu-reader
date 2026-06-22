// ADR-0003 Anki render extraction: Anki-specific sections live in the
// Yomu Anki companion. Core keeps only tiny dispatch wrappers.
import { yomuAnkiCompanion, type PruneRedundantAnkiGlyphRepeatsFn, type RenderAnkiActionRowFn, type RenderAnkiExistingSectionFn, type RenderAnkiNewCardPreviewFn, type RenderAnkiRenderedCardStudyBodyFn, type RenderReviewButtonsFn, type ReviewButtonGradesFn } from '../companions/registry';

export function renderAnkiActionRow(...args: Parameters<RenderAnkiActionRowFn>): string {
    return yomuAnkiCompanion()?.renderAnkiActionRow(...args) ?? '';
}

export function renderAnkiExistingSection(...args: Parameters<RenderAnkiExistingSectionFn>): string {
    return yomuAnkiCompanion()?.renderAnkiExistingSection(...args) ?? '';
}

export function renderAnkiNewCardPreview(...args: Parameters<RenderAnkiNewCardPreviewFn>): string {
    return yomuAnkiCompanion()?.renderAnkiNewCardPreview(...args) ?? '';
}

export function pruneRedundantAnkiGlyphRepeats(...args: Parameters<PruneRedundantAnkiGlyphRepeatsFn>): string {
    return yomuAnkiCompanion()?.pruneRedundantAnkiGlyphRepeats(...args) ?? args[0];
}

export function renderAnkiRenderedCardStudyBody(...args: Parameters<RenderAnkiRenderedCardStudyBodyFn>): string {
    return yomuAnkiCompanion()?.renderAnkiRenderedCardStudyBody(...args) ?? '';
}

export function renderReviewButtons(...args: Parameters<RenderReviewButtonsFn>): string {
    return yomuAnkiCompanion()?.renderReviewButtons(...args) ?? '';
}

export function reviewButtonGrades(...args: Parameters<ReviewButtonGradesFn>): ReturnType<ReviewButtonGradesFn> {
    return yomuAnkiCompanion()?.reviewButtonGrades(...args) ?? [] as ReturnType<ReviewButtonGradesFn>;
}
