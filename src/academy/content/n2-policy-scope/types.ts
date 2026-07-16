import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N2_POLICY_SCOPE_ACTIVITY_KIND = 'academy-n2-policy-scope-rehearsal' as const;

export interface N2PolicyScopePrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export interface N2PolicyScopeQuestion {
    readonly id: string;
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface N2PolicyScopeReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface N2PolicyScopeModel extends ActivityModel {
    readonly kind: typeof N2_POLICY_SCOPE_ACTIVITY_KIND;
    readonly responseKind: 'n2-policy-scope-rehearsal-v1';
    readonly provenance: {
        readonly packageId: 'n2-policy-scope-01';
        readonly sourceScope: 'japanese-library';
        readonly sourceId: string;
        readonly sourceFamily: 'shin-kanzen';
        readonly sourceTitle: '新完全マスター文法 N2';
        readonly relativePath: string;
        readonly sourceDocumentSha256: string;
        readonly sourceDocumentByteLength: number;
        readonly sourcePageImageSha256: string;
        readonly sourceLocus: {
            readonly pdfPage: 15;
            readonly printedPage: 4;
            readonly section: 'III:文章の文法';
            readonly item: '問題15:空所1-5';
        };
        readonly sourceLocusSha256: string;
        readonly rights: {
            readonly state: 'user-permitted-local-reference-only';
            readonly sourceTextDelivery: 'not-delivered';
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
        readonly rehearsal: {
            readonly title: LocalizedText;
            readonly paragraphs: readonly string[];
            readonly playbackText: string;
            readonly authorship: 'original-yomu-n2-rehearsal';
        };
        readonly questions: readonly N2PolicyScopeQuestion[];
        readonly passScore: 1;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N2PolicyScopeReviewTarget[];
    };
}

export interface N2PolicyScopeResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
}

export interface N2PolicyScopeReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
}

export interface N2PolicyScopePackage {
    readonly id: 'n2-policy-scope-01';
    readonly band: 'N2';
    readonly prerequisites: readonly N2PolicyScopePrerequisite[];
    readonly activity: N2PolicyScopeModel;
    readonly readerSrs: N2PolicyScopeReaderSrsProjection;
}
