import type { LearnerEvent, LearningSkill } from '../domain/learner-record';

export type ChallengeLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type CandidateChallengeLevel = Exclude<ChallengeLevel, 0>;
export type LearningPurpose = 'learn' | 'practice' | 'retrieval' | 'repair' | 'test-out';

export interface SkillEvidence {
    readonly skill: LearningSkill;
    readonly attempts: number;
    readonly independentPasses: number;
    readonly supportedPasses: number;
    readonly lapses: number;
    readonly distinctIndependentDays: number;
    readonly recentIndependentPasses: number;
    readonly storageLevel: ChallengeLevel;
    readonly fluency: 'unobserved' | 'fragile' | 'available';
    readonly repairDebt: number;
    readonly lastAttemptAt: number | null;
}

export interface CandidatePrerequisite {
    readonly skill: LearningSkill;
    readonly minimumStorageLevel: ChallengeLevel;
}

export interface LearningCandidate {
    readonly id: string;
    readonly skill: LearningSkill;
    readonly purpose: LearningPurpose;
    readonly challengeLevel: CandidateChallengeLevel;
    readonly conceptIds: readonly string[];
    readonly prerequisites?: readonly CandidatePrerequisite[];
    readonly missionTags?: readonly string[];
    readonly dueAt?: number;
    readonly recommendation?: 'automatic' | 'opt-in-only';
}

export type ScaffoldKind = 'strategy-reminder' | 'partial-cue' | 'worked-example';

export interface ScaffoldStage {
    readonly kind: ScaffoldKind;
    readonly availableAfter: 'first-attempt' | 'lapse';
    readonly answerBearing: boolean;
}

export interface ScaffoldPlan {
    readonly intensity: 'minimal' | 'light' | 'guided';
    readonly stages: readonly ScaffoldStage[];
}

export type SelectionReason =
    | 'repair-due'
    | 'retrieval-due'
    | 'test-out'
    | 'n-plus-one'
    | 'consolidate'
    | 'mission-aligned';

export interface NextLearningAction {
    readonly candidate: LearningCandidate;
    readonly reasons: readonly SelectionReason[];
    readonly scaffold: ScaffoldPlan;
}

export interface NextActionSelection {
    readonly primary: NextLearningAction | null;
    readonly alternatives: readonly NextLearningAction[];
}

export interface NextActionInput {
    readonly events: readonly LearnerEvent[];
    readonly candidates: readonly LearningCandidate[];
    readonly now: number;
    readonly missionTags?: readonly string[];
}

export interface RetrievalOutcome {
    readonly skill: LearningSkill;
    readonly conceptIds: readonly string[];
    readonly at: number;
    readonly outcome: 'pass' | 'lapse';
    readonly independent: boolean;
    /** Successful independent retrievals before this outcome. */
    readonly successfulRetrievals: number;
}

export interface RetrievalScheduleHook {
    readonly schemaVersion: 1;
    readonly kind: 'schedule-retrieval';
    readonly skill: LearningSkill;
    readonly conceptIds: readonly string[];
    readonly dueAt: number;
    readonly intervalDays: 1 | 3 | 7 | 14 | 30;
    readonly reason: 'retrieval-success' | 'lapse-reset' | 'supported-reinforcement';
}

export interface LearnerModelPlugin {
    readonly id: string;
    projectEvidence(events: readonly LearnerEvent[], now: number): readonly SkillEvidence[];
    selectNext(input: NextActionInput): NextActionSelection;
    retrievalHook(outcome: RetrievalOutcome): RetrievalScheduleHook;
}
