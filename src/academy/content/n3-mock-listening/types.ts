import type {
    ActivityModel,
    FeedbackBlock,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N3_MOCK_LISTENING_ACTIVITY_KIND = 'academy-n3-mock-listening' as const;
export const N3_MOCK_LISTENING_BATCH_ID = 'cur-007-n3-mock-listening-v1' as const;

export const N3_MOCK_LISTENING_PACKAGE_IDS = Object.freeze([
    'n3-mock-listening-01-action',
    'n3-mock-listening-02-point',
    'n3-mock-listening-03-overview',
    'n3-mock-listening-04-expression',
    'n3-mock-listening-05-response',
] as const);

export type N3MockListeningPackageId = typeof N3_MOCK_LISTENING_PACKAGE_IDS[number];
export type N3MockListeningMechanic =
    | 'task-comprehension'
    | 'point-comprehension'
    | 'overview-comprehension'
    | 'expression-choice'
    | 'quick-response';
export type N3MockListeningPracticePhase = 'guided' | 'independent' | 'delayed-revisit' | 'changed-context-transfer';

export interface N3MockListeningTeachingPoint {
    readonly title: LocalizedText;
    readonly cue: string;
    readonly explanation: LocalizedText;
}

export interface N3MockListeningOption {
    readonly id: string;
    readonly label: LocalizedText;
}

export interface N3MockListeningQuestion {
    readonly id: string;
    readonly sourceCandidateId: string;
    readonly officialCalibrationId?: string;
    readonly phase: N3MockListeningPracticePhase;
    readonly audioText: string;
    readonly prompt: LocalizedText;
    readonly options: readonly N3MockListeningOption[];
    readonly correctOptionId: string;
    readonly explanation: LocalizedText;
    readonly errorTag: string;
    readonly conceptId: string;
}

export interface N3MockListeningProduction {
    readonly id: string;
    readonly prompt: LocalizedText;
    readonly scenario: LocalizedText;
    readonly modelAnswer: string;
    readonly minimumCharacters: number;
    readonly acceptedFragments: readonly (readonly string[])[];
    readonly errorTag: string;
    readonly conceptId: string;
}

export interface N3MockListeningReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface N3MockListeningProvenance {
    readonly batchId: typeof N3_MOCK_LISTENING_BATCH_ID;
    readonly packageId: N3MockListeningPackageId;
    readonly sourceRecord: 'module-local:n3-mock-listening/audit.ts';
    readonly sourceCandidateIds: readonly string[];
    readonly officialCalibrationIds: readonly string[];
    readonly contentAuthorship: 'original-yomu';
    readonly sourceWordingDelivered: false;
    readonly sourceMediaDelivered: false;
}

export interface N3MockListeningModel extends ActivityModel {
    readonly kind: typeof N3_MOCK_LISTENING_ACTIVITY_KIND;
    readonly responseKind: 'n3-mock-listening-v1';
    readonly provenance: N3MockListeningProvenance;
    readonly payload: {
        readonly mechanic: N3MockListeningMechanic;
        readonly teaching: readonly N3MockListeningTeachingPoint[];
        readonly questions: readonly N3MockListeningQuestion[];
        readonly production?: N3MockListeningProduction;
        readonly delayedReviewOf: readonly string[];
        readonly passScore: number;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N3MockListeningReviewTarget[];
    };
}

export interface N3MockListeningResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
    readonly production?: string;
}

export interface N3MockListeningPrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export interface N3MockListeningReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
    readonly delayedReviewOf: readonly string[];
}

export interface N3MockListeningPackage {
    readonly id: N3MockListeningPackageId;
    readonly band: 'N3';
    readonly sequence: {
        readonly ordinal: 1 | 2 | 3 | 4 | 5;
        readonly previousPackageId?: N3MockListeningPackageId;
    };
    readonly prerequisites: readonly N3MockListeningPrerequisite[];
    readonly activity: N3MockListeningModel;
    readonly readerSrs: N3MockListeningReaderSrsProjection;
}

export type Cur007RightsVerdict = 'blocked-no-redistribution-record' | 'blocked-publication-use-not-cleared';
export type Cur007WordingVerdict =
    | 'not-shippable-adapt-mechanic-only'
    | 'not-shippable-format-calibration-only';
export type Cur007AdaptationDecision = 'original-yomu-mechanic-adaptation' | 'format-calibration-only';

export interface Cur007CandidateAuditRecord {
    readonly id: string;
    readonly sourceFamily: 'soya' | 'official-jlpt';
    readonly source: {
        readonly locator: string;
        readonly artifactSha256: string;
        readonly itemSha256?: string;
        readonly companionArtifactSha256?: readonly string[];
    };
    readonly level: 'N3';
    readonly skill: 'listening';
    readonly function: N3MockListeningMechanic;
    readonly rights: {
        readonly verdict: Cur007RightsVerdict;
        readonly evidence: string;
        readonly evidenceLocator: string;
        readonly checkedOn: '2026-07-20';
    };
    readonly wording: {
        readonly verdict: Cur007WordingVerdict;
    };
    readonly answer: {
        readonly availability: 'available-static' | 'available-official-key';
        readonly verdict: 'verified-single-answer';
    };
    readonly media: {
        readonly availability: 'available-private-static' | 'available-official-public';
        readonly verdict: 'not-shippable';
        readonly locator: string;
        readonly sha256: string;
        readonly bytes?: number;
    };
    readonly adaptation: {
        readonly decision: Cur007AdaptationDecision;
        readonly note: string;
        readonly sourceContentReuse: 'none';
        readonly packageId: N3MockListeningPackageId;
        readonly learnerItemId: string;
        readonly learnerSkills: readonly ('listening' | 'speaking')[];
    };
    readonly canonical: {
        readonly conceptId: string;
        readonly srsIdentity: string;
    };
    readonly reachability: {
        readonly lessonId: `advanced:${N3MockListeningPackageId}`;
        readonly status: 'learner-route';
    };
}

export interface Cur007N3BatchAudit {
    readonly schema: 'yomu-academy.cur007-n3-audit/v1';
    readonly batchId: 'cur-007-n3-mock-listening-v1';
    readonly reviewedOn: '2026-07-20';
    readonly denominator: {
        readonly total: 36;
        readonly soya: 28;
        readonly official: 8;
        readonly byFunction: Readonly<Record<N3MockListeningMechanic, Readonly<{ soya: number; official: number }>>>;
    };
    readonly globalSoyaQuestionMap: {
        readonly total: 487;
        readonly reviewedBeforeBatch: 2;
        readonly overlapWithBatch: 1;
        readonly newlyReviewed: 27;
        readonly reviewedAfterBatch: 29;
        readonly remaining: 458;
    };
    readonly records: readonly Cur007CandidateAuditRecord[];
}
