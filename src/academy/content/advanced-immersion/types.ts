import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';
import type { ActivityFeedbackSet } from '../../minigames/activity-kit/shared';

export const ADVANCED_IMMERSION_ACTIVITY_KIND = 'academy-advanced-epistemic-immersion' as const;

export type EpistemicFunction = 'qualified-observation' | 'contrast-with-limit' | 'bounded-conclusion';

export interface AdvancedImmersionSourceSegment {
    readonly id: string;
    readonly text: string;
    readonly translation: string;
}

export interface AdvancedImmersionQuestion {
    readonly id: string;
    readonly stage: 'source-rehearsal' | 'n1-transfer';
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface AdvancedImmersionReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface AdvancedImmersionPrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export interface AdvancedImmersionQuarantine {
    readonly id: string;
    readonly sourceFamily: 'tobira' | 'shin-kanzen' | 'sou-matome' | 'soya-audio';
    readonly state: 'quarantined-not-playable';
    readonly gaps: readonly ('rights-review-required' | 'item-locus-unverified' | 'transcript-audio-pairing-unverified')[];
}

export interface AdvancedImmersionModel extends ActivityModel {
    readonly kind: typeof ADVANCED_IMMERSION_ACTIVITY_KIND;
    readonly responseKind: 'n3-n1-evidence-boundary-immersion-v1';
    readonly provenance: {
        readonly packageId: 'advanced-immersion-n3-n1-01';
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
            function: EpistemicFunction;
            title: LocalizedText;
            example: string;
            explanation: LocalizedText;
        }>[];
        readonly sourceSegments: readonly AdvancedImmersionSourceSegment[];
        readonly transfer: {
            readonly title: LocalizedText;
            readonly paragraphs: readonly string[];
            readonly playbackText: string;
            readonly authorship: 'original-yomu-n1-transfer';
        };
        readonly questions: readonly AdvancedImmersionQuestion[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly AdvancedImmersionReviewTarget[];
    };
}

export interface AdvancedImmersionResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
}

export interface AdvancedImmersionReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
}

export interface AdvancedImmersionPackage {
    readonly id: 'advanced-immersion-n3-n1-01';
    readonly band: 'N3-to-N1';
    readonly prerequisites: readonly AdvancedImmersionPrerequisite[];
    readonly activity: AdvancedImmersionModel;
    readonly readerSrs: AdvancedImmersionReaderSrsProjection;
    readonly quarantine: readonly AdvancedImmersionQuarantine[];
}
