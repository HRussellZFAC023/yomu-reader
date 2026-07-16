import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const CONFIRMATION_SIGNAL_KIND = 'academy-confirmation-signal' as const;

export interface ConfirmationSignalSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface ConfirmationSignalOption {
    readonly id: string;
    readonly label: string;
}

export interface ConfirmationSignalRound {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4;
    readonly sourcePrompt: string;
    readonly options: readonly [ConfirmationSignalOption, ConfirmationSignalOption, ConfirmationSignalOption];
    readonly correctOptionId: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface ConfirmationSignalResponse {
    readonly signals: readonly Readonly<{ roundId: string; optionId: string; rising: boolean }>[];
}

export interface ConfirmationSignalModel extends ActivityModel {
    readonly kind: typeof CONFIRMATION_SIGNAL_KIND;
    readonly responseKind: 'moodle-chapter-21-deshou-confirmation-signal';
    readonly provenance: {
        readonly packageId: 'l2-l07';
        readonly packageOrder: 34;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974653;
            readonly sourceSheet: ConfirmationSignalSourceVisual;
            readonly audio: {
                readonly status: 'minna-074-recording-embedded-true-false-reviewed';
                readonly sourceAudioMembers: 8;
                readonly sourceAudioTracksDelivered: 1;
                readonly quarantinedSourceAudioMembers: 7;
            };
            readonly answerKeyBasis: 'yomu-derived-deshou-transformations-over-verbatim-source-teaching-and-prompts';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 21'; readonly reuse: 'chronology-and-scope-only' };
            readonly genki: { readonly crosswalk: 'none-verified'; readonly reuse: 'none' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly rounds: readonly ConfirmationSignalRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
