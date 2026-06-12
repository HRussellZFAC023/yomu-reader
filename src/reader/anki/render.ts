// ADR-0003 Anki render extraction: Anki-specific sections live in the
// Yomu Anki companion. Core keeps only a tiny review-button fallback because
// JPDB/Jiten grade controls also use this module.
import { yomuAnkiCompanion, type PruneRedundantAnkiGlyphRepeatsFn, type RenderAnkiActionRowFn, type RenderAnkiExistingSectionFn, type RenderAnkiNewCardPreviewFn, type RenderAnkiRenderedCardStudyBodyFn, type RenderReviewButtonsFn, type ReviewButtonGradesFn } from '../companions/registry';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings, ReviewGradeIntervals } from '../app/types';
import type { AnkiExistingNote } from './types';
import { escapeHtml } from '../dom';

type ReviewButtonOptions = NonNullable<Parameters<RenderReviewButtonsFn>[2]>;

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
    return yomuAnkiCompanion()?.renderReviewButtons(...args) ?? renderReviewButtonsFallback(...args);
}

export function reviewButtonGrades(...args: Parameters<ReviewButtonGradesFn>): ReturnType<ReviewButtonGradesFn> {
    return yomuAnkiCompanion()?.reviewButtonGrades(...args) ?? reviewButtonGradesFallback(...args);
}

function renderReviewButtonsFallback(
    settings: ReaderSettings,
    ankiNote: AnkiExistingNote | null = null,
    options: ReviewButtonOptions = {},
): string {
    const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
    const grades = reviewButtonGradesFallback(settings);
    const target = options.targetLabel ? `<div class="jpdb-reader-review-target">${escapeHtml(options.targetLabel)}</div>` : '';
    const intervals = options.intervals ?? ankiNote?.reviewGradeIntervals;
    const intervalSpan = (grade: string): string => {
        const interval = intervals?.[grade as keyof ReviewGradeIntervals];
        const label = interval?.buttonLabel || interval?.intervalLabel || '';
        return label ? `<span class="jpdb-reader-grade-interval">${escapeHtml(label)}</span>` : '';
    };
    return `
        ${target}
        <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}">
            ${grades.map(([grade, label]) => `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${ankiAttrs}${reviewButtonAttrs(options, label, settings.interfaceLanguage)}>${label}${intervalSpan(grade)}</button>`).join('')}
        </div>
    `;
}

function reviewButtonAttrs(options: Pick<ReviewButtonOptions, 'disabled' | 'title' | 'targetLabel'>, buttonLabel: string, language: InterfaceLanguage): string {
    const title = options.title || options.targetLabel || '';
    const disabled = options.disabled ? ` disabled` : '';
    const titleAttr = options.disabled || title
        ? ` title="${escapeHtml(options.disabled ? title || uiText(language, 'unavailable') : title)}"`
        : '';
    const aria = title
        ? ` aria-label="${escapeHtml(`${buttonLabel}: ${title}`)}"`
        : '';
    return `${disabled}${titleAttr}${aria}`;
}

function reviewButtonGradesFallback(settings: ReaderSettings): Array<[string, string]> {
    const language = settings.interfaceLanguage;
    return settings.twoButtonReviews
        ? [['fail', uiText(language, 'gradeFailLabel')], ['pass', uiText(language, 'gradePassLabel')]]
        : [['nothing', uiText(language, 'gradeNothingLabel')], ['something', uiText(language, 'gradeSomethingLabel')], ['hard', uiText(language, 'gradeHardLabel')], ['okay', uiText(language, 'gradeOkayLabel')], ['easy', uiText(language, 'gradeEasyLabel')]];
}
