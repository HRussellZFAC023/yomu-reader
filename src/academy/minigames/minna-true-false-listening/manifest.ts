import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const MINNA_TRUE_FALSE_LISTENING_KIND = 'academy-minna-true-false-listening' as const;

export type MinnaTruthMark = 'circle' | 'cross';

export interface MinnaTrueFalseTask {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5;
    readonly sourceQuestionId: string;
    readonly statement: string;
    readonly correctMark: MinnaTruthMark;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface MinnaTrueFalseTranscriptLine {
    readonly item: 1 | 2 | 3 | 4 | 5;
    readonly speaker: 'A' | 'B' | '文';
    readonly text: string;
}

export interface MinnaTrueFalseListeningModel extends ActivityModel {
    readonly kind: typeof MINNA_TRUE_FALSE_LISTENING_KIND;
    readonly responseKind: 'minna-074-mondai-2-true-false' | 'minna-077-mondai-2-true-false';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l07' | 'l2-l10';
        readonly packageOrder: 34 | 37;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974653 | 6974659;
            readonly audio: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly locator: string;
                readonly url: string;
                readonly durationSeconds: number;
                readonly label: string;
            };
            readonly sourceTask: 'recording-embedded-mondai-2';
            readonly answerKeyBasis: 'reviewed-original-audio-statements-and-dialogues';
        };
    };
    readonly payload: {
        readonly sourceCaption: LocalizedText;
        readonly tasks: readonly MinnaTrueFalseTask[];
        readonly transcript: readonly MinnaTrueFalseTranscriptLine[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

export interface MinnaTrueFalseListeningResponse {
    readonly answers: readonly Readonly<{ taskId: string; mark: MinnaTruthMark }>[];
}
