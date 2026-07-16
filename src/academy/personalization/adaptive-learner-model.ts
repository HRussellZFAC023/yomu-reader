import type { LearningSkill } from '../domain/learner-record';
import type {
    LearnerModelPlugin,
    LearningCandidate,
    NextActionInput,
    NextActionSelection,
    NextLearningAction,
    RetrievalOutcome,
    RetrievalScheduleHook,
    ScaffoldPlan,
    SelectionReason,
    SkillEvidence,
} from './contracts';
import { projectSkillEvidence } from './skill-evidence';

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETRIEVAL_INTERVALS = [1, 3, 7, 14, 30] as const;
const PURPOSES = ['learn', 'practice', 'retrieval', 'repair', 'test-out'] as const;

interface RankedAction {
    readonly action: NextLearningAction;
    readonly score: number;
}

export function createAdaptiveLearnerModel(): LearnerModelPlugin {
    return {
        id: 'academy-adaptive-learner-v1',
        projectEvidence: projectSkillEvidence,
        selectNext,
        retrievalHook,
    };
}

function selectNext(input: NextActionInput): NextActionSelection {
    requireTimestamp(input.now, 'now');
    const candidateIds = input.candidates.map(candidate => requireText(candidate.id, 'candidate.id'));
    if (new Set(candidateIds).size !== candidateIds.length) throw new TypeError('Learning candidate ids must be unique.');
    const evidence = projectSkillEvidence(input.events, input.now);
    const bySkill = new Map(evidence.map(item => [item.skill, item]));
    const missionTags = new Set((input.missionTags ?? []).map(tag => requireText(tag, 'missionTag')));
    const ranked = input.candidates
        .map(candidate => validateCandidate(candidate))
        .filter(candidate => eligible(candidate, bySkill, input.now))
        .map(candidate => rank(candidate, requireEvidence(bySkill, candidate.skill), missionTags, input.now))
        .sort((left, right) => right.score - left.score || left.action.candidate.id.localeCompare(right.action.candidate.id));
    const primary = ranked[0]?.action ?? null;
    if (!primary) return { primary: null, alternatives: [] };
    const alternative = ranked.slice(1).find(item =>
        item.action.candidate.skill !== primary.candidate.skill
        || item.action.candidate.purpose !== primary.candidate.purpose)?.action;
    return { primary, alternatives: alternative ? [alternative] : [] };
}

function eligible(
    candidate: LearningCandidate,
    evidence: ReadonlyMap<LearningSkill, SkillEvidence>,
    now: number,
): boolean {
    if (candidate.recommendation === 'opt-in-only') return false;
    if (candidate.prerequisites?.some(prerequisite =>
        requireEvidence(evidence, prerequisite.skill).storageLevel < prerequisite.minimumStorageLevel)) return false;
    const skill = requireEvidence(evidence, candidate.skill);
    if (candidate.purpose === 'repair') return skill.repairDebt > 0;
    if (candidate.purpose === 'test-out') return skill.attempts === 0;
    if (candidate.purpose === 'retrieval') return candidate.dueAt !== undefined && candidate.dueAt <= now;
    return true;
}

function rank(
    candidate: LearningCandidate,
    evidence: SkillEvidence,
    missionTags: ReadonlySet<string>,
    now: number,
): RankedAction {
    const target = Math.min(5, evidence.storageLevel + 1);
    const reasons: SelectionReason[] = [];
    let score: number;

    if (candidate.purpose === 'repair') {
        score = 500 + Math.min(5, evidence.repairDebt) * 10;
        reasons.push('repair-due');
    } else if (candidate.purpose === 'retrieval') {
        const overdueDays = Math.floor((now - (candidate.dueAt ?? now)) / DAY_MS);
        score = 450 + Math.min(30, Math.max(0, overdueDays));
        reasons.push('retrieval-due');
    } else if (candidate.purpose === 'test-out') {
        score = 350;
        reasons.push('test-out');
    } else if (candidate.challengeLevel === target) {
        score = 300;
        reasons.push('n-plus-one');
    } else {
        const distance = Math.abs(candidate.challengeLevel - target);
        score = candidate.challengeLevel < target ? 220 - distance * 20 : 160 - distance * 40;
        reasons.push('consolidate');
    }

    if (candidate.missionTags?.some(tag => missionTags.has(tag.trim()))) {
        score += 25;
        reasons.push('mission-aligned');
    }
    return {
        score,
        action: {
            candidate: structuredClone(candidate),
            reasons,
            scaffold: scaffoldFor(candidate, evidence),
        },
    };
}

function scaffoldFor(candidate: LearningCandidate, evidence: SkillEvidence): ScaffoldPlan {
    const strategy = { kind: 'strategy-reminder', availableAfter: 'first-attempt', answerBearing: false } as const;
    const cue = { kind: 'partial-cue', availableAfter: 'lapse', answerBearing: false } as const;
    const example = { kind: 'worked-example', availableAfter: 'lapse', answerBearing: true } as const;
    if (candidate.purpose === 'repair' || evidence.repairDebt > 1 || evidence.storageLevel <= 1) {
        return { intensity: 'guided', stages: [strategy, cue, example] };
    }
    if (evidence.storageLevel <= 3) return { intensity: 'light', stages: [strategy, cue] };
    return { intensity: 'minimal', stages: [strategy] };
}

function retrievalHook(outcome: RetrievalOutcome): RetrievalScheduleHook {
    requireTimestamp(outcome.at, 'outcome.at');
    if (!Number.isSafeInteger(outcome.successfulRetrievals) || outcome.successfulRetrievals < 0) {
        throw new TypeError('successfulRetrievals must be a non-negative integer.');
    }
    if (!outcome.conceptIds.length) throw new TypeError('A retrieval hook needs at least one concept id.');
    const conceptIds = unique(outcome.conceptIds);
    const advances = outcome.outcome === 'pass' && outcome.independent;
    const intervalDays = advances
        ? RETRIEVAL_INTERVALS[Math.min(outcome.successfulRetrievals, RETRIEVAL_INTERVALS.length - 1)]
        : RETRIEVAL_INTERVALS[0];
    const reason = outcome.outcome === 'lapse'
        ? 'lapse-reset'
        : outcome.independent ? 'retrieval-success' : 'supported-reinforcement';
    return {
        schemaVersion: 1,
        kind: 'schedule-retrieval',
        skill: outcome.skill,
        conceptIds,
        dueAt: outcome.at + intervalDays * DAY_MS,
        intervalDays,
        reason,
    };
}

function validateCandidate(candidate: LearningCandidate): LearningCandidate {
    requireText(candidate.id, 'candidate.id');
    if (!(PURPOSES as readonly string[]).includes(candidate.purpose)) {
        throw new TypeError(`Candidate ${candidate.id} has an invalid learning purpose.`);
    }
    if (!Number.isInteger(candidate.challengeLevel) || candidate.challengeLevel < 1 || candidate.challengeLevel > 5) {
        throw new TypeError(`Candidate ${candidate.id} challengeLevel must be from 1 to 5.`);
    }
    if (!candidate.conceptIds.length) throw new TypeError(`Candidate ${candidate.id} needs concept ids.`);
    unique(candidate.conceptIds);
    if (candidate.purpose === 'retrieval' && candidate.dueAt === undefined) {
        throw new TypeError(`Retrieval candidate ${candidate.id} needs dueAt.`);
    }
    if (candidate.dueAt !== undefined) requireTimestamp(candidate.dueAt, `candidate ${candidate.id} dueAt`);
    if (candidate.recommendation !== undefined
        && candidate.recommendation !== 'automatic'
        && candidate.recommendation !== 'opt-in-only') {
        throw new TypeError(`Candidate ${candidate.id} has an invalid recommendation policy.`);
    }
    candidate.missionTags?.forEach(tag => requireText(tag, `candidate ${candidate.id} missionTag`));
    candidate.prerequisites?.forEach(prerequisite => {
        if (!Number.isInteger(prerequisite.minimumStorageLevel)
            || prerequisite.minimumStorageLevel < 0
            || prerequisite.minimumStorageLevel > 5) {
            throw new TypeError(`Candidate ${candidate.id} has an invalid prerequisite level.`);
        }
    });
    return candidate;
}

function requireEvidence(
    evidence: ReadonlyMap<LearningSkill, SkillEvidence>,
    skill: LearningSkill,
): SkillEvidence {
    const value = evidence.get(skill);
    if (!value) throw new Error(`Missing learner evidence projection for ${skill}.`);
    return value;
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values.map(value => requireText(value, 'conceptId')))].sort();
}

function requireText(value: string, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value.trim();
}

function requireTimestamp(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer timestamp.`);
}
