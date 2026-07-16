import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const REASON_CHAIN_KIND = 'academy-reason-chain' as const;

export type ReasonChainInteraction = 'plain-form-select' | 'reason-order-choice' | 'typed-chain';

export interface ReasonChainSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface ReasonChainOption {
    readonly value: string;
    readonly label: LocalizedText;
}

export interface ReasonChainRound {
    readonly id: string;
    readonly interaction: ReasonChainInteraction;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly sourcePage: 1 | 2;
    readonly sourceTask: 1 | 2;
    readonly sourceItem: 1 | 2 | 3 | 4;
    readonly sourcePrompt: string;
    readonly options: readonly ReasonChainOption[];
    readonly answerValue: string;
    readonly answerExpression: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface ReasonChainResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export interface ReasonChainModel extends ActivityModel {
    readonly kind: typeof REASON_CHAIN_KIND;
    readonly responseKind: 'moodle-chapter-28-shi-varied-chain';
    readonly provenance: {
        readonly packageId: 'l2-l13';
        readonly packageOrder: 40;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8121266;
            readonly archiveId: 'archive-000092';
            readonly sourceSheets: readonly [ReasonChainSourceVisual, ReasonChainSourceVisual];
            readonly media: {
                readonly status: 'audio-members-quarantined-unpaired';
                readonly sourceAudioMembers: 5;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts';
        };
        readonly support: {
            readonly minna: {
                readonly reference: 'Minna no Nihongo II · Lesson 28';
                readonly reuse: 'chronology-and-scope-only';
            };
            readonly genki: {
                readonly crosswalk: '≈ Genki II · Listing reasons and soft refusal';
                readonly reuse: 'sequence-only';
            };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeadings: readonly [
            '1: please connect the phrases using 〜し、〜し.',
            '2: please connect the phrases using 〜し、〜し, then telling the conclusions.',
        ];
        readonly rounds: readonly ReasonChainRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
