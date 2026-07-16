import type { ActivityModel } from '../../domain/activity-runtime';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet, ReviewableTarget } from '../activity-kit/shared';

export type ClassActivityFormat = 'pair' | 'group' | 'info-gap' | 'role-card' | 'board' | 'race';

export interface ClassActivitySource {
    readonly lessonPackageId: string;
    readonly exactPrompt: string;
    readonly promptLanguage: 'en' | 'ja';
    readonly mappings: readonly Readonly<{
        corpus: 'moodle' | 'minna' | 'genki';
        reference: string;
        relation: 'canonical-material' | 'scope' | 'crosswalk';
    }>[];
    readonly evidenceItem?: Readonly<{
        title: string;
        payloadSha256: string;
    }>;
}

export interface ClassActivityRole {
    readonly id: string;
    readonly characterId: string;
    readonly name: string;
    readonly controller: 'learner' | 'classmate';
    readonly label: LocalizedText;
    readonly privateCard?: LocalizedText;
}

export interface ClassActivityOption {
    readonly id: string;
    readonly label: LocalizedText;
}

interface ClassActivityTurnBase {
    readonly id: string;
    readonly actorRoleId: string;
    readonly boardSpaceId?: string;
    readonly checkpoint?: number;
}

export interface ClassmateTurn extends ClassActivityTurnBase {
    readonly kind: 'classmate';
    readonly line: LocalizedText;
}

export interface LearnerChoiceTurn extends ClassActivityTurnBase {
    readonly kind: 'learner-choice';
    readonly prompt: LocalizedText;
    readonly options: readonly ClassActivityOption[];
    readonly acceptedOptionIds: readonly string[];
    readonly evidence: ClassActivityTurnEvidence;
}

export interface LearnerTextTurn extends ClassActivityTurnBase {
    readonly kind: 'learner-text';
    readonly prompt: LocalizedText;
    readonly inputLabel: LocalizedText;
    readonly acceptedAnswers?: readonly string[];
    readonly requiredGroups?: readonly (readonly string[])[];
    readonly evidence: ClassActivityTurnEvidence;
}

export interface ClassActivityTurnEvidence {
    readonly conceptId: string;
    readonly errorTag: string;
}

export type ClassActivityTurn = ClassmateTurn | LearnerChoiceTurn | LearnerTextTurn;

export interface ClassActivityBoard {
    readonly spaces: readonly Readonly<{ id: string; label: LocalizedText }>[];
}

export interface ClassActivityRace {
    readonly pace: 'untimed';
    readonly checkpointCount: number;
    readonly finishLabel: LocalizedText;
}

export interface ClassActivitySimulatorModel extends ActivityModel {
    readonly kind: 'academy-class-simulator';
    readonly responseKind: 'class-activity-turns';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly format: ClassActivityFormat;
        readonly source: ClassActivitySource;
        readonly location: LocalizedText;
        readonly roles: readonly ClassActivityRole[];
        readonly turns: readonly ClassActivityTurn[];
        readonly board?: ClassActivityBoard;
        readonly race?: ClassActivityRace;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

export interface ClassActivityResponse {
    readonly answers: readonly Readonly<{ turnId: string; value: string }>[];
}
