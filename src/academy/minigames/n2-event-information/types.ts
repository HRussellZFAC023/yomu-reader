import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N2_EVENT_INFORMATION_ACTIVITY_KIND = 'academy-n2-event-information' as const;

export interface N2EventInformationPrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export interface N2EventInformationQuestion {
    readonly id: string;
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface N2EventInformationReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface N2EventInformationModel extends ActivityModel {
    readonly kind: typeof N2_EVENT_INFORMATION_ACTIVITY_KIND;
    readonly responseKind: 'n2-event-information-v1';
    readonly provenance: {
        readonly packageId: 'n2-event-information-01';
        readonly sourceScope: 'soya-research';
        readonly sourceId: string;
        readonly sourceFamily: 'soya-jlpt';
        readonly relativePath: 'data/courses/jlpt_n2/mock_test_no1.js';
        readonly sourceDocumentSha256: string;
        readonly sourceDocumentByteLength: 292617;
        readonly sourceItemId: 'n2_m1_reading_info_0_1';
        readonly sourceItemJsonSha256: string;
        readonly sourceLocusSha256: string;
        readonly rights: {
            readonly state: 'user-permitted-local-reference-only';
            readonly sourceTextDelivery: 'not-delivered';
            readonly sourceAnswerDelivery: 'not-delivered';
            readonly sourceMediaDelivery: 'not-delivered';
            readonly learnerActivityText: 'original-yomu-authored';
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{
            readonly title: LocalizedText;
            readonly example: string;
            readonly explanation: LocalizedText;
        }>[];
        readonly notice: {
            readonly title: LocalizedText;
            readonly paragraphs: readonly string[];
            readonly facts: readonly Readonly<{ label: LocalizedText; value: string }>[];
            readonly playbackText: string;
            readonly authorship: 'original-yomu-n2-notice';
        };
        readonly questions: readonly N2EventInformationQuestion[];
        readonly actionSequence: {
            readonly prompt: LocalizedText;
            readonly actions: readonly Readonly<{ id: string; label: LocalizedText }>[];
            readonly correctOrder: readonly string[];
            readonly errorTag: 'action-sequence';
        };
        readonly passScore: 1;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N2EventInformationReviewTarget[];
    };
}

export interface N2EventInformationResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
    readonly actionOrder: readonly string[];
}

export interface N2EventInformationReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
    readonly networkDependencies: readonly [];
}

export interface N2EventInformationPackage {
    readonly id: 'n2-event-information-01';
    readonly band: 'N2';
    readonly prerequisites: readonly N2EventInformationPrerequisite[];
    readonly activity: N2EventInformationModel;
    readonly readerSrs: N2EventInformationReaderSrsProjection;
}
