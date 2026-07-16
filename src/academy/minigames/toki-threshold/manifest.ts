import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const TOKI_THRESHOLD_KIND = 'academy-toki-threshold' as const;

export type TokiTiming = 'before' | 'after';

export interface TokiThresholdSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 4 | 5;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface TokiThresholdRound {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4;
    readonly sourcePage: 5;
    readonly sourceTask: 7;
    readonly sourceItem: 1 | 2 | 3 | 4;
    readonly sourcePrompt: string;
    readonly beforeForm: string;
    readonly afterForm: string;
    readonly correctTiming: TokiTiming;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface TokiThresholdResponse {
    readonly thresholds: readonly Readonly<{
        roundId: string;
        timing: TokiTiming;
    }>[];
}

export interface TokiThresholdModel extends ActivityModel {
    readonly kind: typeof TOKI_THRESHOLD_KIND;
    readonly responseKind: 'moodle-chapter-23-toki-threshold';
    readonly provenance: {
        readonly packageId: 'l2-l10';
        readonly packageOrder: 37;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974659;
            readonly sourceSheets: readonly [TokiThresholdSourceVisual, TokiThresholdSourceVisual];
            readonly audio: {
                readonly status: 'quarantined-unresolved-pairing';
                readonly sourceAudioMembers: 4;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'yomu-derived-timing-completions-over-verbatim-source-teaching-and-prompts';
        };
        readonly support: {
            readonly minna: {
                readonly reference: 'Minna no Nihongo I · Lessons 22–23';
                readonly reuse: 'chronology-and-scope-only';
            };
            readonly genki: { readonly crosswalk: '≈ Genki II · L16'; readonly reuse: 'sequence-only' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeading: '7: Look at the picture below and create sentences.';
        readonly rounds: readonly TokiThresholdRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
