import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N3_N4_SLEEP_BRIDGE_ACTIVITY_KIND = 'academy-n3-n4-sleep-bridge' as const;

export interface N3N4SleepBridgeSourceSegment {
    readonly id: string;
    readonly text: string;
    readonly translation: string;
}

export interface N3N4SleepBridgePrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export interface N3N4SleepBridgeQuestion {
    readonly id: string;
    readonly stage: 'source-rehearsal' | 'original-transfer';
    readonly activityMode: 'listening-choice' | 'evidence-sort' | 'cloze' | 'conclusion-choice';
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }> [];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface N3N4SleepBridgeReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface N3N4SleepBridgeModel extends ActivityModel {
    readonly kind: typeof N3_N4_SLEEP_BRIDGE_ACTIVITY_KIND;
    readonly responseKind: 'n3-n4-sleep-bridge-v1';
    readonly provenance: {
        readonly packageId: 'n3-n4-sleep-bridge-01';
        readonly sourceScope: 'soya-research';
        readonly sourceId: string;
        readonly relativePath: string;
        readonly payloadSha256: string;
        readonly sourceItemId: 'mock1_r_03';
        readonly sourceItemSha256: string;
        readonly permission: 'user-permitted-local-educational-use';
        readonly originalMediaState: 'not-paired-not-delivered';
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{
            readonly title: LocalizedText;
            readonly example: string;
            readonly explanation: LocalizedText;
        }>[];
        readonly sourceSegments: readonly N3N4SleepBridgeSourceSegment[];
        readonly transfer: {
            readonly title: LocalizedText;
            readonly paragraphs: readonly string[];
            readonly playbackText: string;
            readonly authorship: 'original-yomu-n3-n4-bridge-transfer';
        };
        readonly questions: readonly N3N4SleepBridgeQuestion[];
        readonly passScore: 1;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N3N4SleepBridgeReviewTarget[];
    };
}

export interface N3N4SleepBridgeResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
}

export interface N3N4SleepBridgeReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
}

export interface N3N4SleepBridgePackage {
    readonly id: 'n3-n4-sleep-bridge-01';
    readonly band: 'N3';
    readonly prerequisites: readonly N3N4SleepBridgePrerequisite[];
    readonly activity: N3N4SleepBridgeModel;
    readonly readerSrs: N3N4SleepBridgeReaderSrsProjection;
}
