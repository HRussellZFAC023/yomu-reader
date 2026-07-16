import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const STATE_INSPECTION_KIND = 'academy-state-inspection' as const;

export type StateInspectionInteraction = 'state-select' | 'action-choice' | 'typed-report';

export interface StateInspectionSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2 | 3 | 4 | 5;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
    readonly presentation?: 'inspectable' | 'inline-reference';
}

export interface StateInspectionOption {
    readonly value: string;
    readonly label: LocalizedText;
}

export interface StateInspectionRound {
    readonly id: string;
    readonly interaction: StateInspectionInteraction;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly sourcePage: 1 | 2 | 3 | 4 | 5;
    readonly sourceTask: 1 | 2 | 3 | 4 | 5 | 6 | 'note' | 'room-a' | 'vocabulary' | 'listening' | 'message' | 'review' | 'grammar' | 'speaking' | 'homework' | 'word-table';
    readonly sourceItem: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 11 | 12 | 13 | 18 | 21;
    readonly sourcePrompt: string;
    readonly options: readonly StateInspectionOption[];
    readonly answerValue: string;
    readonly answerExpression: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface StateInspectionResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export interface StateInspectionModel extends ActivityModel {
    readonly kind: typeof STATE_INSPECTION_KIND;
    readonly responseKind:
        | 'moodle-chapter-29-resulting-state-inspection'
        | 'moodle-chapter-30-prepared-state-audit'
        | 'moodle-chapter-30-advance-preparation'
        | 'moodle-chapter-30-message-handoff'
        | 'moodle-chapter-31-volitional-plan'
        | 'moodle-chapter-31-intention-route'
        | 'moodle-chapter-31-plan-change-repair'
        | 'moodle-chapter-32-probability-briefing'
        | 'moodle-chapter-34-means-and-tea-listening'
        | 'moodle-chapter-35-conditional-workshop'
        | 'moodle-chapter-35-adjective-noun-conditionals'
        | 'moodle-chapter-35-nara-guidance-workshop'
        | 'moodle-kanji-7-menu-reading';
    readonly provenance: {
        readonly packageId: 'l2-l14' | 'l2-l16' | 'l2-l17' | 'l2-l18' | 'l2-l19' | 'l2-l20' | 'l2-l21' | 'l2-l25' | 'l2-l29' | 'l2-l30' | 'l2-l31' | 'l2-l32' | 'l2-l33' | 'l2-l34';
        readonly packageOrder: 41 | 43 | 44 | 45 | 46 | 47 | 48 | 52 | 56 | 57 | 58 | 59 | 60 | 61;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8121267 | 8121269 | 8121270 | 8121271 | 8121273 | 8121275 | 8121277 | 8121279 | 8121293 | 8121295 | 8121299 | 8121300 | 8121301;
            readonly archiveId: 'archive-000087' | 'archive-000066' | 'archive-000008' | 'archive-000044' | 'archive-000084' | 'archive-000064' | 'archive-000010' | 'archive-000078' | 'archive-000096' | 'archive-000001' | 'archive-000025' | 'archive-000048' | 'archive-000042';
            readonly sourceSheets: readonly StateInspectionSourceVisual[];
            readonly answerSheets?: readonly StateInspectionSourceVisual[];
            readonly media: {
                readonly status:
                    | 'audio-members-quarantined-unpaired'
                    | 'audio-member-quarantined-pairing-unproven'
                    | 'audio-member-verified-script-and-worksheet-pairing'
                    | 'audio-member-verified-by-archive-task-script-identity'
                    | 'no-audio-members-in-package'
                    | 'three-audio-members-quarantined-unresolved-pairing';
                readonly sourceAudioMembers: 0 | 1 | 3 | 4 | 6;
                readonly sourceAudioTracksDelivered: 0 | 1;
                readonly quarantinedPayloadSha256?: string;
                readonly durationSeconds?: number;
                readonly audio?: {
                    readonly url: string;
                    readonly payloadSha256: string;
                    readonly durationSeconds: number;
                    readonly transcriptPayloadSha256: string;
                    readonly worksheetPayloadSha256: string;
                    readonly verification:
                        | 'exact-script-and-independent-transcript-match'
                        | 'same-archive-adjacency-and-exact-task-script-identity';
                };
            };
                readonly answerKeyBasis:
                    | 'yomu-derived-completions-over-canonical-source-pages-and-prompts'
                    | 'yomu-derived-prepared-state-reports-over-canonical-source-pages-and-prompts'
                    | 'sensei-verbatim-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages'
                    | 'sensei-verbatim-examples-and-separately-attributed-yomu-model-completions-over-canonical-source-pages'
                    | 'sensei-verbatim-form-tables-and-yomu-derived-deterministic-volitional-completions-over-canonical-source-pages'
                    | 'sensei-verbatim-intention-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages'
                    | 'sensei-verbatim-probability-examples-over-canonical-source-pages'
                    | 'sensei-verbatim-grammar-choices-and-script-grounded-listening-answers'
                    | 'sensei-verbatim-tables-proverb-and-example-with-yomu-derived-deterministic-conditional-joins'
                    | 'sensei-verbatim-vocabulary-and-prompts-with-yomu-derived-deterministic-adjective-noun-conditionals'
                    | 'sensei-verbatim-adjective-noun-and-nara-examples-with-no-source-answer-key-claim'
                    | 'source-provided-readings-with-yomu-derived-deterministic-reading-pairing';
        };
        readonly support: {
            readonly minna: {
                readonly reference:
                    | 'Minna no Nihongo II · Lesson 29'
                    | 'Minna no Nihongo II · Lesson 30'
                    | 'Minna no Nihongo II · Lesson 31'
                    | 'Minna no Nihongo II · Lessons 26 and 30 review'
                    | 'Minna no Nihongo II · Lesson 32'
                    | 'Minna no Nihongo II · Lesson 34'
                    | 'Minna no Nihongo II · Lesson 35'
                    | 'Minna no Nihongo II · Lessons 35–36'
                    | 'Minna no Nihongo II · food and quantity vocabulary';
                readonly reuse: 'chronology-and-scope-only';
            };
            readonly genki: {
                    readonly crosswalk:
                        | '≈ Genki II · Resulting states and verb pairs'
                        | '≈ Genki II · Prepared resultant states'
                        | '≈ Genki II · Advance preparation and leaving things as they are'
                        | '≈ Genki II · Examples, explanations, and careful requests'
                        | '≈ Genki II · Volitional form and intentions'
                        | 'No Genki prerequisite anchor; curriculum crosswalk gap declared'
                        | '≈ Genki II · Means, attendant circumstances, and following instructions'
                        | '≈ Genki II · parallel N4 scope'
                        | '≈ Genki II · parallel N4 kanji scope';
                readonly reuse: 'sequence-only';
            };
            readonly references?: {
                readonly shinKanzen: {
                    readonly reference: 'Shin Kanzen Master N3 private library';
                    readonly reuse: 'scope-and-contrast-only';
                    readonly learnerFacingMaterial: false;
                };
                readonly tobira: {
                    readonly reference: 'Tobira private library';
                    readonly reuse: 'scope-and-contrast-only';
                    readonly learnerFacingMaterial: false;
                };
                readonly soya: {
                    readonly reference: 'Soya N3 research corpus';
                    readonly reuse: 'format-and-audio-research-only';
                    readonly rightsState: 'item-review-required';
                    readonly learnerFacingMaterial: false;
                };
            };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeadings: readonly Readonly<{
            sourceTask: 1 | 2 | 3 | 4 | 5 | 6 | 'note' | 'room-a' | 'vocabulary' | 'listening' | 'message' | 'review' | 'grammar' | 'speaking' | 'homework' | 'word-table';
            text: string;
        }>[];
        readonly rounds: readonly StateInspectionRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
