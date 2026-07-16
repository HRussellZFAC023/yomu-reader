import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const EXPERIENCE_POSTCARD_LISTENING_KIND = 'academy-experience-postcard-listening' as const;

export interface ExperiencePostcardPrompt {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3;
    readonly correctOptionId: 'a' | 'b' | 'c';
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface ExperiencePostcardListeningResponse {
    readonly answers: readonly Readonly<{ promptId: string; optionId: 'a' | 'b' | 'c' }> [];
}

export interface ExperiencePostcardListeningModel extends ActivityModel {
    readonly kind: typeof EXPERIENCE_POSTCARD_LISTENING_KIND;
    readonly responseKind: 'moodle-b21-experience-postcard-rail';
    readonly provenance: {
        readonly packageId: 'l2-l02';
        readonly answerVisibility: 'after-attempt';
        readonly vocabularySheet: SourceVisual;
        readonly listeningSheet: SourceVisual;
        readonly moodle: {
            readonly moduleId: 7011918;
            readonly vocabularySheet: SourceVisual;
            readonly listeningSheet: SourceVisual;
            readonly audio: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly url: string;
                readonly durationSeconds: 127.906667;
                readonly transcriptStatus: 'audio-reviewed-answer-keys-hidden-until-attempt';
            };
            readonly answerKeyBasis: 'source-audio-verified-picture-selections';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 19'; readonly reuse: 'sequence-only' };
            readonly genki: { readonly sourceId: string; readonly payloadSha256: string; readonly relation: 'post-instruction-experience-form-support-only' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: LocalizedText; pattern: string; instruction: LocalizedText }> [];
        readonly prompts: readonly ExperiencePostcardPrompt[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

export interface SourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}
