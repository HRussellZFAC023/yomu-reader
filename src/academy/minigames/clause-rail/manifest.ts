import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const CLAUSE_RAIL_KIND = 'academy-clause-rail' as const;

export interface ClauseRailSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface ClauseRailOption {
    readonly id: string;
    readonly label: string;
}

export interface ClauseRailRound {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4;
    readonly sourcePrompt: string;
    readonly noun: string;
    readonly options: readonly [ClauseRailOption, ClauseRailOption, ClauseRailOption];
    readonly correctOptionId: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface ClauseRailResponse {
    readonly placements: readonly Readonly<{ roundId: string; optionId: string; attached: boolean }>[];
}

export interface ClauseRailModel extends ActivityModel {
    readonly kind: typeof CLAUSE_RAIL_KIND;
    readonly responseKind: 'moodle-chapter-22-clause-rail';
    readonly provenance: {
        readonly packageId: 'l2-l08';
        readonly packageOrder: 35;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974656;
            readonly sourceSheet: ClauseRailSourceVisual;
            readonly audio: {
                readonly status: 'quarantined-unresolved-pairing';
                readonly sourceAudioMembers: 2;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'yomu-derived-clause-transformations-over-verbatim-source-teaching-and-prompts';
        };
        readonly support: {
            readonly minna: {
                readonly reference: 'Minna no Nihongo I · Chapter 22 (source inventory label)';
                readonly reuse: 'chronology-and-scope-only';
            };
            readonly genki: { readonly crosswalk: 'none-verified'; readonly reuse: 'none' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly rounds: readonly ClauseRailRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
