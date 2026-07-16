import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const PLAIN_STYLE_MATRIX_KIND = 'academy-plain-style-matrix' as const;

export interface PlainStyleMatrixPrompt {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4;
    readonly politeForm: string;
    readonly targetColumn: 'dictionary' | 'negative' | 'past-negative';
    readonly options: readonly Readonly<{ id: 'a' | 'b' | 'c'; label: string }> [];
    readonly correctOptionId: 'a' | 'b' | 'c';
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface PlainStyleMatrixResponse {
    readonly answers: readonly Readonly<{ promptId: string; optionId: 'a' | 'b' | 'c' }> [];
}

export interface PlainStyleMatrixSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface PlainStyleMatrixModel extends ActivityModel {
    readonly kind: typeof PLAIN_STYLE_MATRIX_KIND;
    readonly responseKind: 'moodle-chapter-20-plain-style-matrix';
    readonly provenance: {
        readonly packageId: 'l2-l04';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 7011920;
            readonly vocabularySheet: PlainStyleMatrixSourceVisual;
            readonly grammarSheet: PlainStyleMatrixSourceVisual;
            readonly answerKeyBasis: 'yomu-derived-plain-form-completion-over-verbatim-source-matrix';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 20'; readonly reuse: 'sequence-only' };
            readonly genki: { readonly sourceId: string; readonly payloadSha256: string; readonly relation: 'post-instruction-short-form-support-only-no-genki-task-shown' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: LocalizedText; pattern: string; instruction: LocalizedText }> [];
        readonly prompts: readonly PlainStyleMatrixPrompt[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
