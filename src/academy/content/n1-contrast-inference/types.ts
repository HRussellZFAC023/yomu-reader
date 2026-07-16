import type {
  ActivityModel,
  FeedbackBlock,
} from "../../domain/activity-runtime";
import type { LocalizedText } from "../../domain/source-library";
import type { MiningRequest } from "../../integration/yomu-bridge";

export const N1_CONTRAST_INFERENCE_ACTIVITY_KIND =
  "academy-n1-contrast-inference" as const;

export interface N1ContrastInferencePrerequisite {
  readonly conceptId: string;
  readonly minimumEvidence: "introduced-and-attempted";
  readonly reason: LocalizedText;
}

export interface N1ContrastInferenceQuestion {
  readonly id: string;
  readonly stage: "contrast-map" | "transfer";
  readonly prompt: LocalizedText;
  readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
  readonly correctOptionId: string;
  readonly errorTag: string;
}

export interface N1ContrastInferenceReviewTarget {
  readonly id: string;
  readonly conceptId: string;
  readonly expression: string;
  readonly reading?: string;
  readonly meanings: readonly string[];
  readonly sentence: string;
  readonly repairFor: readonly string[];
}

export interface N1ContrastInferenceModel extends ActivityModel {
  readonly kind: typeof N1_CONTRAST_INFERENCE_ACTIVITY_KIND;
  readonly responseKind: "n1-contrast-inference-v1";
  readonly provenance: {
    readonly packageId: "n1-contrast-inference-01";
    readonly sourceScope: "japanese-library";
    readonly sourceId: string;
    readonly sourceFamily: "shin-kanzen";
    readonly sourceTitle: "新完全マスター読解 N1";
    readonly relativePath: string;
    readonly sourceDocumentSha256: string;
    readonly sourceDocumentByteLength: number;
    readonly sourcePageImageSha256: string;
    readonly sourceLocus: {
      readonly pdfPage: 15;
      readonly printedPage: 5;
      readonly section: string;
      readonly item: string;
    };
    readonly sourceLocusSha256: string;
    readonly rights: {
      readonly state: "user-permitted-local-reference-only";
      readonly sourceTextDelivery: "not-delivered";
      readonly sourceMediaDelivery: "not-delivered";
      readonly learnerActivityText: "original-yomu-authored";
    };
    readonly sourceMediaState: "unverified-pairing-not-delivered";
  };
  readonly payload: {
    readonly teaching: readonly Readonly<{
      readonly title: LocalizedText;
      readonly example: string;
      readonly explanation: LocalizedText;
    }>[];
    readonly contrastMap: readonly Readonly<{
      readonly side: "before" | "after";
      readonly claim: string;
    }>[];
    readonly transfer: {
      readonly title: LocalizedText;
      readonly paragraphs: readonly string[];
      readonly playbackText: string;
      readonly authorship: "original-yomu-n1-transfer";
    };
    readonly production: {
      readonly prompt: LocalizedText;
      readonly guidance: LocalizedText;
      readonly fieldLabel: LocalizedText;
      readonly authorship: "learner-authored-ungraded";
    };
    readonly questions: readonly N1ContrastInferenceQuestion[];
    readonly passScore: 1;
    readonly feedback: {
      readonly pass: FeedbackBlock;
      readonly lapse: Required<
        Pick<FeedbackBlock, "explanation" | "repairPrompt" | "nearbyExample">
      >;
    };
    readonly reviewTargets: readonly N1ContrastInferenceReviewTarget[];
  };
}

export interface N1ContrastInferenceResponse {
  readonly answers: readonly Readonly<{
    questionId: string;
    optionId: string;
  }>[];
  readonly production: string;
}

export interface N1ContrastInferenceReaderSrsProjection {
  readonly readerSurfaceIds: readonly string[];
  readonly miningRequests: readonly MiningRequest[];
}

export interface N1ContrastInferencePackage {
  readonly id: "n1-contrast-inference-01";
  readonly band: "N1";
  readonly prerequisites: readonly N1ContrastInferencePrerequisite[];
  readonly activity: N1ContrastInferenceModel;
  readonly readerSrs: N1ContrastInferenceReaderSrsProjection;
}
