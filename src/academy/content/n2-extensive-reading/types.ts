import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N2_EXTENSIVE_READING_ACTIVITY_KIND = 'academy-n2-extensive-reading' as const;

export interface N2ExtensiveReadingQuestion {
    readonly id: string;
    readonly stage: 'source-comprehension' | 'n1-transfer';
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface N2ExtensiveReadingReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface N2ExtensiveReadingModel extends ActivityModel {
    readonly kind: typeof N2_EXTENSIVE_READING_ACTIVITY_KIND;
    readonly responseKind: 'n2-n1-extensive-reading-v1';
    readonly provenance: {
        readonly packageId: 'n2-extensive-reading-01';
        readonly sourceScope: 'soya-research';
        readonly sourceId: string;
        readonly relativePath: 'data/courses/jlpt_n2/mock_test_no1.js';
        readonly payloadSha256: string;
        readonly sourceItemId: 'n2_m1_reading_long_2_1';
        readonly sourceItemSha256: string;
        readonly sourcePassageSha256: string;
        readonly sourceLocus: Readonly<{ kind: 'exported-array-item'; exportName: 'n2_mock_no1_pool' }>;
        readonly permission: 'user-permitted-local-educational-use';
        readonly answerVisibility: 'after-attempt';
        readonly sourceMediaState: 'none-declared-or-delivered';
    };
    readonly payload: {
        readonly strategy: readonly Readonly<{
            id: 'preview' | 'pivots' | 'flow';
            title: LocalizedText;
            instruction: LocalizedText;
        }>[];
        readonly source: Readonly<{
            title: LocalizedText;
            paragraphs: readonly string[];
            authorship: 'exact-soya-source-item';
            timing: 'untimed';
        }>;
        readonly transfer: Readonly<{
            title: LocalizedText;
            paragraphs: readonly string[];
            authorship: 'original-yomu-n1-transfer';
        }>;
        readonly reflection: Readonly<{
            label: LocalizedText;
            guidance: LocalizedText;
            authorship: 'learner-authored-ungraded';
        }>;
        readonly questions: readonly N2ExtensiveReadingQuestion[];
        readonly passScore: 1;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N2ExtensiveReadingReviewTarget[];
    };
}

export interface N2ExtensiveReadingResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
    readonly reflection?: string;
}

export interface N2ExtensiveReadingPackage {
    readonly id: 'n2-extensive-reading-01';
    readonly band: 'N2-to-N1';
    readonly prerequisites: readonly Readonly<{
        conceptId: string;
        minimumEvidence: 'introduced-and-attempted';
        reason: LocalizedText;
    }>[];
    readonly activity: N2ExtensiveReadingModel;
    readonly readerSrs: Readonly<{
        readerSurfaceIds: readonly string[];
        miningRequests: readonly MiningRequest[];
    }>;
}
