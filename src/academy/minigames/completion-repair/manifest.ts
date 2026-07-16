import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const COMPLETION_REPAIR_KIND = 'academy-completion-repair' as const;

export type CompletionRepairInteraction =
    | 'completion-select'
    | 'typed-transform'
    | 'finish-first-choice'
    | 'typed-regret-link';

export interface CompletionRepairSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2 | 3 | 4 | 5;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface CompletionRepairOption {
    readonly value: string;
    readonly label: LocalizedText;
}

export interface CompletionRepairRound {
    readonly id: string;
    readonly interaction: CompletionRepairInteraction;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly sourcePage: 1 | 2 | 3;
    readonly sourceTask: 1 | 3 | 4;
    readonly sourceItem: 1 | 2 | 3 | 4;
    readonly sourcePrompt: string;
    readonly options: readonly CompletionRepairOption[];
    readonly answerValue: string;
    readonly answerExpression: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface CompletionRepairResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export interface CompletionRepairModel extends ActivityModel {
    readonly kind: typeof COMPLETION_REPAIR_KIND;
    readonly responseKind: 'moodle-chapter-29-completion-and-regret-repair';
    readonly provenance: {
        readonly packageId: 'l2-l15';
        readonly packageOrder: 42;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8121268;
            readonly archiveId: 'archive-000016';
            readonly sourceSheets: readonly [
                CompletionRepairSourceVisual,
                CompletionRepairSourceVisual,
                CompletionRepairSourceVisual,
                CompletionRepairSourceVisual,
                CompletionRepairSourceVisual,
            ];
            readonly media: {
                readonly status: 'audio-members-quarantined-unpaired';
                readonly sourceAudioMembers: 3;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'yomu-derived-completions-over-canonical-source-pages-and-prompts';
        };
        readonly support: {
            readonly minna: {
                readonly reference: 'Minna no Nihongo II · Lesson 29';
                readonly reuse: 'chronology-and-scope-only';
            };
            readonly genki: {
                readonly crosswalk: '≈ Genki L18 (grammar overlay)';
                readonly reuse: 'sequence-only';
            };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeadings: readonly Readonly<{ sourceTask: 1 | 3 | 4; text: string }>[];
        readonly rounds: readonly CompletionRepairRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
