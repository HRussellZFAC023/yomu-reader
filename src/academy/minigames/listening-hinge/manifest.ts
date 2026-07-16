import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const LISTENING_HINGE_KIND = 'academy-listening-hinge' as const;

export interface ListeningHingeSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface ListeningHingePrompt {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3;
    readonly correctOptionId: 'left' | 'right';
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface ListeningHingeResponse { readonly answers: readonly Readonly<{ promptId: string; optionId: 'left' | 'right' }>[]; }

export interface ListeningHingeModel extends ActivityModel {
    readonly kind: typeof LISTENING_HINGE_KIND;
    readonly responseKind: 'moodle-b24-listening-hinge';
    readonly provenance: {
        readonly packageId: 'l2-l05';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974651;
            readonly vocabularySheet: ListeningHingeSourceVisual;
            readonly listeningSheet: ListeningHingeSourceVisual;
            readonly audio: { readonly sourceId: string; readonly payloadSha256: string; readonly url: string; readonly durationSeconds: 82.56; readonly transcriptStatus: 'audio-reviewed-b24-choice-pairing-hidden-until-attempt'; };
            readonly answerKeyBasis: 'source-worksheet-prompts-and-audio-reviewed-b24-choices';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 20'; readonly reuse: 'sequence-only' };
            readonly genki: { readonly sourceId: string; readonly payloadSha256: string; readonly relation: 'prior-short-form-context-only-no-genki-task-shown' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: LocalizedText; pattern: string; instruction: LocalizedText }>[];
        readonly prompts: readonly ListeningHingePrompt[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
