import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const OCCASION_ROUTE_KIND = 'academy-occasion-route' as const;

export type OccasionRouteMode = 'affirmative' | 'negative';

export interface OccasionRouteSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface OccasionRouteRound {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4;
    readonly sourcePage: 1;
    readonly sourceTask: '1-1';
    readonly sourceItem: 1 | 2 | 3 | 4;
    readonly sourcePrompt: string;
    readonly affirmativeClause: string;
    readonly negativeClause: string;
    readonly mainClause: string;
    readonly correctMode: OccasionRouteMode;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface OccasionRouteResponse {
    readonly routes: readonly Readonly<{
        roundId: string;
        mode: OccasionRouteMode;
    }>[];
}

export interface OccasionRouteModel extends ActivityModel {
    readonly kind: typeof OCCASION_ROUTE_KIND;
    readonly responseKind: 'moodle-chapter-23-occasion-route';
    readonly provenance: {
        readonly packageId: 'l2-l11';
        readonly packageOrder: 38;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974661;
            readonly sourceSheets: readonly [OccasionRouteSourceVisual];
            readonly media: {
                readonly status: 'no-audio-members-in-package';
                readonly sourceAudioMembers: 0;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts';
        };
        readonly support: {
            readonly minna: {
                readonly reference: 'Minna no Nihongo I · Lessons 20, 23 and 25';
                readonly reuse: 'chronology-and-scope-only';
            };
            readonly genki: { readonly crosswalk: '≈ Genki II · L17'; readonly reuse: 'sequence-only' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeading: '1-1: Using 〜とき, change the sentences to one sentence.';
        readonly rounds: readonly OccasionRouteRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
