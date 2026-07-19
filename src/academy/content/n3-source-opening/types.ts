import type {
  ActivityModel,
  FeedbackBlock,
} from "../../domain/activity-runtime";
import type { LocalizedText } from "../../domain/source-library";
import type { MiningRequest } from "../../integration/yomu-bridge";

export const N3_SOURCE_OPENING_ACTIVITY_KIND =
  "academy-n3-source-opening" as const;

export type N3SourceOpeningPackageId =
  "n3-source-opening-01" | "n3-source-opening-02" | "n3-source-opening-03";

export type N3SourceOpeningStage =
  "town-flow" | "geography-listening" | "evidence-reading";

export type N3SourceOpeningActivityMode =
  | "cloze-select"
  | "listening-gist"
  | "map-evidence-match"
  | "source-status-choice"
  | "cause-choice"
  | "source-claim-choice"
  | "hygiene-evidence-choice"
  | "main-claim-choice";

export interface N3SourceOpeningSourceRecord {
  readonly id: string;
  readonly scope:
    "japanese-library" | "soya-research" | "yomu-academy" | "official-web";
  readonly role:
    | "delivered-excerpt"
    | "delivered-remote-media"
    | "verification-copy"
    | "private-reference"
    | "chronology-anchor"
    | "task-calibration";
  readonly title: string;
  readonly relativePath?: string;
  readonly url?: string;
  readonly originPageUrl?: string;
  readonly retrievedAt?: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly durationSeconds?: number;
  readonly permission:
    "user-permitted-local-educational-use" | "official-reference-use";
  readonly delivery: "reviewed-excerpts" | "official-remote" | "not-delivered";
}

export interface N3SourceOpeningStageProvenance {
  readonly trancheId: "n3-source-opening-v1";
  readonly packageId: N3SourceOpeningPackageId;
  readonly stage: N3SourceOpeningStage;
  readonly sourceRecord: "module-local:n3-source-opening/source.ts";
  readonly sourceRefs: readonly string[];
  readonly sourceItemIds: readonly string[];
  readonly sourceItemSha256: string;
}

export interface N3SourceOpeningPrerequisite {
  readonly conceptId: string;
  readonly minimumEvidence: "introduced-and-attempted";
  readonly reason: LocalizedText;
}

export interface N3SourceOpeningQuestion {
  readonly id: string;
  readonly sourceItemId: string;
  readonly activityMode: N3SourceOpeningActivityMode;
  readonly prompt: LocalizedText;
  readonly options: readonly Readonly<{ id: string; label: string }>[];
  readonly correctOptionId: string;
  readonly explanation: LocalizedText;
  readonly errorTag: string;
  readonly conceptId: string;
}

export interface N3SourceOpeningTeachingPoint {
  readonly title: LocalizedText;
  readonly example: string;
  readonly explanation: LocalizedText;
}

export interface N3SourceOpeningReviewTarget {
  readonly id: string;
  readonly conceptId: string;
  readonly expression: string;
  readonly reading?: string;
  readonly meanings: readonly string[];
  readonly sentence: string;
  readonly repairFor: readonly string[];
}

export type N3SourceOpeningStimulus =
  | Readonly<{
      kind: "cloze-sequence";
      title: LocalizedText;
      sourceItemIds: readonly string[];
    }>
  | Readonly<{
      kind: "official-audio";
      title: LocalizedText;
      audioUrl: string;
      evidenceExcerpts: readonly Readonly<{
        id: string;
        japanese: string;
        translation: string;
      }>[];
    }>
  | Readonly<{
      kind: "source-reading";
      title: LocalizedText;
      paragraphs: readonly string[];
      postAttemptNote: LocalizedText;
    }>;

export interface N3SourceOpeningProduction {
  readonly authorship: "original-yomu-n3-source-transfer";
  readonly prompt: LocalizedText;
  readonly facts: readonly string[];
  readonly minimumCharacters: number;
  readonly modelAnswer: string;
  readonly attributionErrorTag: string;
  readonly boundaryErrorTag: string;
  readonly substanceErrorTag: string;
  readonly conceptId: string;
}

export interface N3SourceOpeningModel extends ActivityModel {
  readonly kind: typeof N3_SOURCE_OPENING_ACTIVITY_KIND;
  readonly responseKind: "n3-source-opening-v1";
  readonly provenance: N3SourceOpeningStageProvenance;
  readonly payload: {
    readonly stage: N3SourceOpeningStage;
    readonly teaching: readonly N3SourceOpeningTeachingPoint[];
    readonly stimulus: N3SourceOpeningStimulus;
    readonly questions: readonly N3SourceOpeningQuestion[];
    readonly production?: N3SourceOpeningProduction;
    readonly passScore: number;
    readonly feedback: {
      readonly pass: FeedbackBlock;
      readonly lapse: Required<
        Pick<FeedbackBlock, "explanation" | "repairPrompt" | "nearbyExample">
      >;
    };
    readonly reviewTargets: readonly N3SourceOpeningReviewTarget[];
  };
}

export interface N3SourceOpeningResponse {
  readonly answers: readonly Readonly<{
    questionId: string;
    optionId: string;
  }>[];
  readonly production?: string;
}

export interface N3SourceOpeningReaderSrsProjection {
  readonly readerSurfaceIds: readonly string[];
  readonly miningRequests: readonly MiningRequest[];
}

export interface N3SourceOpeningPackage {
  readonly id: N3SourceOpeningPackageId;
  readonly band: "N3";
  readonly sequence: {
    readonly ordinal: 1 | 2 | 3;
    readonly previousPackageId?: N3SourceOpeningPackageId;
  };
  readonly prerequisites: readonly N3SourceOpeningPrerequisite[];
  readonly activity: N3SourceOpeningModel;
  readonly readerSrs: N3SourceOpeningReaderSrsProjection;
}
