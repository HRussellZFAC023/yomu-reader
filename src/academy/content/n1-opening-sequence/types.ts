import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N1_OPENING_SEQUENCE_ACTIVITY_KIND = 'academy-n1-opening-sequence' as const;

export type N1OpeningSequenceModality = 'reading' | 'grammar' | 'listening';

/** Explicit, exhaustive stimulus roles: exact source anchor vs original Yomu transfer. */
export type N1OpeningSequenceStimulusRole =
    | 'source-reading'
    | 'transfer-reading'
    | 'grammar'
    | 'source-listening'
    | 'transfer-listening';

export type N1OpeningSequenceProductionCheckId =
    | 'length-band'
    | 'evidence-balance'
    | 'qualification-marker'
    | 'provisional-no-overclaim';

export interface N1OpeningSequencePrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export type N1OpeningSequenceSourceFamily = 'shin-kanzen' | 'so-matome' | 'tobira';

export interface N1OpeningSequenceSourceLocus {
    readonly pdfPage: number;
    readonly printedPage: number;
    readonly section: string;
    readonly item: string;
}

export interface N1OpeningSequenceSourceRef {
    readonly role: 'reading-anchor' | 'grammar-anchor' | 'listening-anchor' | 'transfer-bridge-reference';
    readonly sourceFamily: N1OpeningSequenceSourceFamily;
    readonly sourceId: string;
    readonly sourceTitle: string;
    readonly relativePath: string;
    readonly sourceDocumentSha256: string;
    readonly sourceDocumentByteLength: number;
    readonly sourcePageImageSha256: string;
    readonly sourcePageImageByteLength: number;
    readonly sourceLocus: N1OpeningSequenceSourceLocus;
    /** Present only for sources with a second artifact page (So-matome question + answer/script). */
    readonly secondaryPageImageSha256?: string;
    readonly secondaryPageImageByteLength?: number;
    readonly secondaryLocus?: N1OpeningSequenceSourceLocus;
    /** SHA-256 of the exact excerpt text used verbatim in the learner-facing payload; distinct from Yomu-authored content hashes. */
    readonly sourceExcerptSha256: string;
}

export interface N1OpeningSequenceQuestion {
    readonly id: string;
    readonly modality: N1OpeningSequenceModality;
    readonly stimulusRole: N1OpeningSequenceStimulusRole;
    readonly prompt: LocalizedText;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
    /** Only populated for questions whose answer key needs an explanatory rationale (e.g. the exact source-audio mismatch). */
    readonly rationale?: LocalizedText;
}

export interface N1OpeningSequenceProductionCheck {
    readonly id: N1OpeningSequenceProductionCheckId;
    readonly errorTag: string;
    readonly label: LocalizedText;
}

export interface N1OpeningSequenceReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
    /** Honest attribution: exact source text must never be labelled Yomu-authored. */
    readonly attribution: 'yomu-authored' | 'exact-source';
}

export interface N1OpeningSequenceSourceAudioCodec {
    readonly format: 'mp3';
    readonly sampleRateHz: number;
    readonly channels: number;
    readonly bitrateKbps: number;
}

export interface N1OpeningSequenceModel extends ActivityModel {
    readonly kind: typeof N1_OPENING_SEQUENCE_ACTIVITY_KIND;
    readonly responseKind: 'n1-opening-sequence-v1';
    readonly provenance: {
        readonly packageId: 'n1-opening-sequence-01';
        readonly sourceScope: 'japanese-library';
        readonly sourceSetId: string;
        readonly sourceFamily: 'mixed';
        readonly sources: readonly N1OpeningSequenceSourceRef[];
        readonly deliveredAudio: {
            readonly relativePath: string;
            readonly packageRelativePath: string;
            readonly packageUrl: string;
            readonly sha256: string;
            readonly byteLength: number;
            readonly durationSeconds: number;
            readonly track: 'CD1-55';
            readonly codec: N1OpeningSequenceSourceAudioCodec;
            readonly state: 'package-local-exact-source';
        };
        readonly gapEvidence: {
            readonly sourceId: string;
            readonly repoRelativePath: string;
            readonly sha256: string;
            readonly byteLength: number;
            readonly state: 'inspected-empty-not-used';
        };
        readonly sourceSetSha256: string;
        readonly deliveredSourceSha256: string;
        readonly authoredContentSha256: string;
        readonly rights: {
            readonly state: 'user-directed-package-local-short-excerpts-and-exact-track';
            readonly sourceTextDelivery: 'delivered-short-excerpts';
            readonly sourceImageDelivery: 'not-delivered';
            readonly sourceAudioDelivery: 'delivered-exact-track';
            readonly learnerActivityText: 'mixed-exact-source-excerpt-and-yomu-transfer';
            readonly playback: 'exact-source-audio-and-tts-transfer';
        };
        readonly sourceMediaState: 'mixed-short-source-excerpts-and-package-local-audio';
    };
    readonly payload: {
        readonly prerequisiteRefresh: readonly Readonly<{
            readonly conceptId: string;
            readonly bridge: LocalizedText;
            readonly example: string;
            readonly exampleSource: 'authored' | 'exact-source-tobira';
        }>[];
        readonly reading: {
            readonly sourceAnchor: {
                readonly title: LocalizedText;
                readonly paragraphs: readonly string[];
                readonly authorship: 'exact-source-shin-kanzen-reading';
            };
            readonly transfer: {
                readonly title: LocalizedText;
                readonly paragraphs: readonly string[];
                readonly authorship: 'original-yomu-n1-reading';
            };
        };
        readonly grammar: {
            readonly title: LocalizedText;
            readonly forms: readonly Readonly<{
                readonly id: string;
                readonly form: string;
                readonly example: string;
                readonly exampleAuthorship: 'exact-source-shin-kanzen-grammar';
                readonly registerNote: LocalizedText;
                readonly agentNote: LocalizedText;
                readonly eventNote: LocalizedText;
            }>[];
        };
        readonly listening: {
            readonly sourceAudio: {
                readonly title: LocalizedText;
                readonly packageUrl: string;
                readonly sha256: string;
                readonly byteLength: number;
                readonly durationSeconds: number;
                readonly track: 'CD1-55';
                readonly transcript: string;
                readonly rationale: LocalizedText;
                readonly authorship: 'exact-source-somatome-listening';
            };
            readonly transfer: {
                readonly title: LocalizedText;
                readonly scenario: LocalizedText;
                readonly script: string;
                readonly authorship: 'original-yomu-n1-listening';
            };
        };
        readonly production: {
            readonly prompt: LocalizedText;
            readonly guidance: LocalizedText;
            readonly fieldLabel: LocalizedText;
            readonly authorship: 'learner-authored-deterministically-checked';
            readonly minLengthChars: number;
            readonly maxLengthChars: number;
            readonly demandAnchors: readonly string[];
            readonly accessAnchors: readonly string[];
            readonly contrastMarkers: readonly string[];
            readonly provisionalMarkers: readonly string[];
            readonly overclaimTerms: readonly string[];
            readonly checks: readonly N1OpeningSequenceProductionCheck[];
            readonly modelAnswer: string;
        };
        readonly questions: readonly N1OpeningSequenceQuestion[];
        readonly passScore: number;
        readonly modalityFloors: {
            readonly reading: number;
            readonly grammar: number;
            readonly listening: number;
            readonly production: number;
        };
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N1OpeningSequenceReviewTarget[];
    };
}

export interface N1OpeningSequenceResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
    readonly production: string;
}

export interface N1OpeningSequenceProductionCheckResult {
    readonly id: N1OpeningSequenceProductionCheckId;
    readonly errorTag: string;
    readonly label: LocalizedText;
    readonly met: boolean;
}

export interface N1OpeningSequenceReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
}

export interface N1OpeningSequencePackage {
    readonly id: 'n1-opening-sequence-01';
    readonly band: 'N1';
    readonly prerequisites: readonly N1OpeningSequencePrerequisite[];
    readonly activity: N1OpeningSequenceModel;
    readonly readerSrs: N1OpeningSequenceReaderSrsProjection;
}
