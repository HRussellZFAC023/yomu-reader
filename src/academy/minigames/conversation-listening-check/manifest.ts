import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const CONVERSATION_LISTENING_CHECK_KIND = 'academy-conversation-listening-check' as const;

export interface ConversationListeningTask {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly prompt: string;
    readonly answer: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface ConversationListeningCheckModel extends ActivityModel {
    readonly kind: typeof CONVERSATION_LISTENING_CHECK_KIND;
    readonly responseKind:
        | 'minna-069-conversation-comprehension'
        | 'minna-072-conversation-comprehension'
        | 'minna-075-conversation-comprehension';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l05' | 'l2-l06' | 'l2-l09';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974651 | 6974652 | 6974657;
            readonly worksheet: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: string;
                readonly page: 1;
                readonly url: string;
                readonly sha256: string;
            };
            readonly support: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: string;
                readonly page: 1;
                readonly role: 'reviewed-transcript' | 'vocabulary-and-grammar-support' | 'worksheet-and-audio-review';
            };
            readonly audio: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly locator: string;
                readonly url: string;
                readonly durationSeconds: number;
                readonly label: string;
            };
            readonly answerKeyBasis:
                | 'source-worksheet-questions-script-and-exact-minna-069-recording'
                | 'source-worksheet-questions-and-audio-reviewed-exact-minna-072-recording'
                | 'source-worksheet-questions-and-audio-reviewed-exact-minna-075-recording';
        };
    };
    readonly payload: {
        readonly sourceCaption: LocalizedText;
        readonly tasks: readonly ConversationListeningTask[];
        readonly transcript: readonly Readonly<{ speaker: string; text: string }>[];
        readonly feedback: ActivityFeedbackSet;
    };
}

export interface ConversationListeningCheckResponse {
    readonly answers: readonly Readonly<{ taskId: string; value: string }>[];
}
