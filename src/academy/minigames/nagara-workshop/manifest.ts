import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const NAGARA_WORKSHOP_KIND = 'academy-nagara-workshop' as const;

export type NagaraInteraction = 'stem-select' | 'main-clause-choice' | 'typed-join';

export interface NagaraSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface NagaraOption {
    readonly value: string;
    readonly label: LocalizedText;
}

export interface NagaraWorkshopRound {
    readonly id: string;
    readonly interaction: NagaraInteraction;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6;
    readonly sourcePage: 1;
    readonly sourceTask: 2;
    readonly sourceItem: 1 | 2 | 3 | 4 | 5 | 6;
    readonly sourcePrompt: string;
    readonly options: readonly NagaraOption[];
    readonly answerValue: string;
    readonly answerExpression: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface NagaraWorkshopResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export interface NagaraWorkshopModel extends ActivityModel {
    readonly kind: typeof NAGARA_WORKSHOP_KIND;
    readonly responseKind: 'moodle-chapter-28-nagara-varied-join';
    readonly provenance: {
        readonly packageId: 'l2-l12';
        readonly packageOrder: 39;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8121261;
            readonly archiveId: 'archive-000032';
            readonly sourceSheets: readonly [NagaraSourceVisual, NagaraSourceVisual];
            readonly media: {
                readonly status: 'audio-members-quarantined-unpaired';
                readonly sourceAudioMembers: 4;
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
                readonly crosswalk: '≈ Genki II · Simultaneous actions and routines';
                readonly reuse: 'sequence-only';
            };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeading: '2: please change two sentences to one long sentence.';
        readonly rounds: readonly NagaraWorkshopRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
