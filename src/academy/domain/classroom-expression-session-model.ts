import type { AnswerSupportContract } from './activity-runtime';
import type { LearnerEventInput, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

export type ClassroomExpressionPhaseId =
    | 'room-rhythm'
    | 'understanding-and-repair'
    | 'feedback'
    | 'desk-language';

export interface ClassroomExpressionRepair {
    readonly errorTag: string;
    readonly contrast: LocalizedText;
    readonly retryPrompt: LocalizedText;
    readonly nearbyExample: LocalizedText;
}

export interface ClassroomExpressionProbe {
    readonly id: string;
    readonly prompt: LocalizedText;
    readonly acceptedAnswers: readonly string[];
    readonly modelAnswer: string;
    readonly repair: ClassroomExpressionRepair;
}

export interface ClassroomExpressionItem {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly phaseId: ClassroomExpressionPhaseId;
    readonly order: number;
    readonly conceptIds: readonly string[];
    readonly skill: Extract<LearningSkill, 'writing' | 'repair'>;
    readonly responseKind: 'constructed-japanese';
    readonly inputMode: 'ime';
    readonly probes: readonly ClassroomExpressionProbe[];
}

export interface ClassroomExpressionPhase {
    readonly id: ClassroomExpressionPhaseId;
    readonly order: number;
    readonly title: LocalizedText;
    readonly expressionIds: readonly string[];
}

export interface ClassroomExpressionTeachingBlock {
    readonly id: string;
    readonly conceptId: string;
    readonly expressionIds: readonly string[];
    readonly explanation: LocalizedText;
    readonly workedExample: Readonly<{
        context: LocalizedText;
        japanese: string;
        reading: string;
        meaning: LocalizedText;
    }>;
}

export interface ClassroomExpressionSessionDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-classroom-expressions';
    readonly contentVersion: string;
    readonly responseKind: 'constructed-japanese';
    readonly inputMode: 'ime';
    readonly completionPolicy: 'all-probes-pass';
    readonly navigationPolicy: 'free-with-resume';
    readonly answerSupport: AnswerSupportContract;
    readonly teachingBlocks: readonly ClassroomExpressionTeachingBlock[];
    readonly phaseIds: readonly ClassroomExpressionPhaseId[];
    readonly phases: readonly ClassroomExpressionPhase[];
    readonly expressions: readonly ClassroomExpressionItem[];
}

export interface ClassroomExpressionCursor {
    readonly phaseId: ClassroomExpressionPhaseId;
    readonly expressionId: string;
    readonly probeId: string;
}

export interface ClassroomExpressionAttempt {
    readonly probeId: string;
    readonly sourceQuestionId: string;
    readonly outcome: 'pass' | 'lapse';
    readonly independent: boolean;
    readonly at: number;
}

export interface ClassroomExpressionSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: ClassroomExpressionSessionDefinition['id'];
    readonly status: 'active' | 'paused' | 'complete';
    readonly cursor: ClassroomExpressionCursor;
    readonly attempts: readonly ClassroomExpressionAttempt[];
    readonly passedProbeIds: readonly string[];
    readonly revealedModelProbeIds: readonly string[];
    readonly visitedExpressionIds: readonly string[];
}

export type ClassroomExpressionSessionAction =
    | { readonly kind: 'submit'; readonly response: string }
    | { readonly kind: 'reveal-model' }
    | { readonly kind: 'navigate'; readonly target:
        | { readonly kind: 'next' | 'previous' }
        | { readonly kind: 'phase'; readonly id: ClassroomExpressionPhaseId }
        | { readonly kind: 'expression'; readonly id: string }
    }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface ClassroomExpressionSessionView {
    readonly sessionId: ClassroomExpressionSessionDefinition['id'];
    readonly status: ClassroomExpressionSessionState['status'];
    readonly cursor: ClassroomExpressionCursor;
    readonly phaseTitle: LocalizedText;
    readonly prompt: LocalizedText;
    readonly responseKind: 'constructed-japanese';
    readonly inputMode: 'ime';
    readonly sourceQuestionId: string;
    readonly preAssessmentTeaching: Readonly<{
        explanation: LocalizedText;
        workedExample: ClassroomExpressionTeachingBlock['workedExample'];
    }>;
    readonly earnedRepair?: Readonly<{
        contrast: LocalizedText;
        retryPrompt: LocalizedText;
        nearbyExample: LocalizedText;
        modelAnswerAvailable: true;
        modelAnswer?: string;
    }>;
    readonly progress: ClassroomExpressionSessionReport;
}

export interface ClassroomExpressionSessionTransition {
    readonly state: ClassroomExpressionSessionState;
    readonly view: ClassroomExpressionSessionView;
    readonly evidence: readonly LearnerEventInput[];
}

export interface ClassroomExpressionSessionReport {
    readonly sourceQuestions: Readonly<{
        total: 14;
        attempted: number;
        completed: number;
        completedIds: readonly string[];
        unresolvedIds: readonly string[];
    }>;
    readonly probes: Readonly<{
        total: number;
        completed: number;
        repaired: number;
    }>;
    readonly phases: readonly Readonly<{
        id: ClassroomExpressionPhaseId;
        completedExpressions: number;
        totalExpressions: number;
    }>[];
}
