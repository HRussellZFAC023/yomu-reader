import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const HOLIDAY_ITINERARY_TAPE_KIND = 'academy-holiday-itinerary-tape' as const;

export interface HolidayItineraryPin {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4;
    readonly correctSpeakerId: 'speaker-a' | 'speaker-b';
    readonly conceptId: string;
    readonly errorTag: string;
    readonly reviewExpression: string;
}

export interface HolidayItineraryTranscriptLine {
    readonly speaker: string;
    readonly text: string;
}

export interface HolidayItineraryTapeResponse {
    readonly answers: readonly Readonly<{ pinId: string; speakerId: 'speaker-a' | 'speaker-b' }> [];
}

export interface HolidayItinerarySourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface HolidayItineraryTapeModel extends ActivityModel {
    readonly kind: typeof HOLIDAY_ITINERARY_TAPE_KIND;
    readonly responseKind: 'moodle-b22-holiday-itinerary-tape';
    readonly provenance: {
        readonly packageId: 'l2-l03';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 7011919;
            readonly vocabularySheet: HolidayItinerarySourceVisual;
            readonly grammarSheet: HolidayItinerarySourceVisual;
            readonly audio: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly url: string;
                readonly durationSeconds: 45.093333;
                readonly transcriptStatus: 'audio-reviewed-speaker-pins-hidden-until-attempt';
            };
            readonly answerKeyBasis: 'source-grammar-page-three-and-audio-reviewed-speaker-pins';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 19'; readonly reuse: 'sequence-only' };
            readonly genki: { readonly sourceId: string; readonly payloadSha256: string; readonly relation: 'prior-form-context-only-no-genki-task-shown' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: LocalizedText; pattern: string; instruction: LocalizedText }> [];
        readonly pins: readonly HolidayItineraryPin[];
        readonly transcript: readonly HolidayItineraryTranscriptLine[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}
