import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const OPINION_TRANSFORMATION_KIND = 'academy-opinion-transformation' as const;

export interface OpinionTransformationSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: number;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface OpinionTransformationRound {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface OpinionTransformationResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export interface OpinionTransformationModel extends ActivityModel {
    readonly kind: typeof OPINION_TRANSFORMATION_KIND;
    readonly responseKind: 'moodle-chapter-21-opinion-transformation';
    readonly provenance: {
        readonly packageId: 'l2-l06';
        readonly packageOrder: 33;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974652;
            readonly vocabularySheet: OpinionTransformationSourceVisual;
            readonly teachingSheet: OpinionTransformationSourceVisual;
            readonly taskSheet: OpinionTransformationSourceVisual;
            readonly audio: {
                readonly status: 'quarantined-unresolved-pairing';
                readonly sourceAudioMembers: 2;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'yomu-derived-plain-form-transformations-over-verbatim-source-prompts';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 21'; readonly reuse: 'chronology-and-scope-only' };
            readonly genki: { readonly crosswalk: 'none-verified'; readonly reuse: 'none' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: LocalizedText; pattern: string; instruction: LocalizedText }>[];
        readonly rounds: readonly OpinionTransformationRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
