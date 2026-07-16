import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N3_PET_HOUSING_ACTIVITY_KIND = 'academy-n3-pet-housing-immersion' as const;

export interface N3PetHousingSourceSegment {
    readonly id: string;
    readonly text: string;
    readonly translation: string;
}

export interface N3PetHousingQuestion {
    readonly id: string;
    readonly stage: 'source-rehearsal' | 'original-transfer';
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface N3PetHousingReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface N3PetHousingPrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export interface N3PetHousingQuarantine {
    readonly id: string;
    readonly sourceFamily: 'tobira' | 'shin-kanzen' | 'sou-matome' | 'soya-audio';
    readonly state: 'quarantined-not-playable';
    readonly gaps: readonly ('rights-review-required' | 'item-locus-unverified' | 'transcript-audio-pairing-unverified')[];
}

export interface N3PetHousingModel extends ActivityModel {
    readonly kind: typeof N3_PET_HOUSING_ACTIVITY_KIND;
    readonly responseKind: 'n3-pet-housing-source-rehearsal-and-transfer-v1';
    readonly provenance: {
        readonly packageId: 'n3-pet-housing-01';
        readonly sourceScope: 'soya-research';
        readonly sourceId: string;
        readonly relativePath: string;
        readonly payloadSha256: string;
        readonly sourceItemId: 'mock1_r_04';
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
        readonly sourceSegments: readonly N3PetHousingSourceSegment[];
        readonly transfer: {
            readonly title: LocalizedText;
            readonly paragraphs: readonly string[];
            readonly playbackText: string;
            readonly authorship: 'original-yomu-n3-transfer';
        };
        readonly questions: readonly N3PetHousingQuestion[];
        readonly passScore: 1;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N3PetHousingReviewTarget[];
    };
}

export interface N3PetHousingResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
}

export interface N3PetHousingReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
}

export interface N3PetHousingPackage {
    readonly id: 'n3-pet-housing-01';
    readonly band: 'N3';
    readonly prerequisites: readonly N3PetHousingPrerequisite[];
    readonly activity: N3PetHousingModel;
    readonly readerSrs: N3PetHousingReaderSrsProjection;
    readonly quarantine: readonly N3PetHousingQuarantine[];
}
