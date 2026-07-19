import type { RecommendationCandidate } from './adaptive-recommendations';
import { activeReviewSchedules, type AttemptOutcome, type LearnerEvent } from './learner-record';
import type { StreakPolicy } from './progress-projections';

export type DiegeticIncentive = Readonly<{
    kind: 'journal-memory' | 'bond-scene' | 'place-discovery' | 'source-unlock';
    id: string;
}>;

interface CrossYomuEvidenceBase {
    readonly evidenceId: string;
    readonly at: number;
    readonly sourceId: string;
    readonly conceptIds: readonly string[];
    /** Projected only after this evidence passes its kind-specific verification rule. */
    readonly incentive?: DiegeticIncentive;
}

export type CrossYomuEvidence =
    | (CrossYomuEvidenceBase & {
          readonly kind: 'japanese-subtitle-viewing';
          readonly sustained: boolean;
      })
    | (CrossYomuEvidenceBase & {
          readonly kind: 'reader-mode-use';
          readonly mode: 'japanese-only' | 'immersion-filter';
          readonly engagement: 'toggle' | 'active-reading';
      })
    | (CrossYomuEvidenceBase & {
          readonly kind: 'passage-read';
          readonly completed: boolean;
      })
    | (CrossYomuEvidenceBase & {
          readonly kind: 'vocabulary-mined';
          readonly collectionItemId: string;
      })
    | (CrossYomuEvidenceBase & {
          readonly kind: 'later-recall';
          readonly priorEvidenceId: string;
          readonly outcome: AttemptOutcome;
          readonly independent: boolean;
      })
    | (CrossYomuEvidenceBase & {
          readonly kind: 'spaced-passage-return';
          readonly priorEvidenceId: string;
          readonly outcome: AttemptOutcome;
          readonly independent: boolean;
      });

type CandidateCore = Pick<RecommendationCandidate, 'id' | 'modeId' | 'skill' | 'format'> &
    Readonly<{
        label: string;
        conceptIds: readonly string[];
        incentive: DiegeticIncentive;
    }>;

export type DailyLearningCandidate =
    | (CandidateCore & {
          readonly kind: 'lesson';
          readonly sequence: number;
          readonly completionActivityId: string;
          readonly completionEncounterIds?: readonly string[];
          readonly grounding: Readonly<{ sourceId: string }>;
      })
    | (CandidateCore & {
          readonly kind: 'encounter';
          readonly encounterKind: 'world' | 'bond';
          readonly characterId?: string;
      });

export interface DailyLearningLoopInput {
    readonly events: readonly LearnerEvent[];
    readonly evidence: readonly CrossYomuEvidence[];
    readonly candidates: readonly DailyLearningCandidate[];
    readonly targetConceptIds?: readonly string[];
    readonly now: number;
    readonly dayBoundary: Pick<StreakPolicy, 'timeZone' | 'dayBoundaryHour'>;
}

interface RouteActionBase {
    readonly id: string;
    readonly label: string;
    readonly modeId: RecommendationCandidate['modeId'];
    readonly skill: RecommendationCandidate['skill'];
    readonly format: RecommendationCandidate['format'];
    readonly conceptIds: readonly string[];
    readonly incentive: DiegeticIncentive;
}

export type DailyRouteAction =
    | (RouteActionBase & {
          readonly kind: 'repair';
          readonly reason: 'due-srs';
          readonly reviewItemIds: readonly string[];
      })
    | (RouteActionBase & {
          readonly kind: 'lesson';
          readonly reason: 'next-grounded-lesson';
          readonly grounding: Readonly<{ sourceId: string }>;
      })
    | (RouteActionBase & {
          readonly kind: 'encounter';
          readonly reason: 'n-plus-one';
          readonly encounterKind: 'world' | 'bond';
          readonly characterId?: string;
          readonly coverage: Readonly<{
              knownConceptIds: readonly string[];
              newConceptIds: readonly string[];
              targetConceptIds: readonly string[];
          }>;
      });

export interface DailyRecovery {
    readonly mode: 'continue' | 'welcome-back';
    readonly missedDays: number;
    readonly message: 'Continue when you are ready.' | 'Welcome back. Continue from where you left off.';
    readonly rewardsPreserved: true;
    readonly preservedAcademyRewardEventIds: readonly string[];
}

export interface DailyMotivationalArc {
    readonly anticipation: Readonly<{
        actionId: string;
        message: string;
    }>;
    readonly competence: Readonly<{
        basis: 'ready' | 'verified-practice' | 'n-plus-one' | 'welcome-back';
        message: string;
    }>;
    readonly connection: Readonly<{
        kind: 'relationship' | 'world';
        actionId: string;
        incentiveId: string;
        characterId?: string;
        message: string;
    }> | null;
    readonly closure: Readonly<{
        afterActionId: string;
        nextActionId?: string;
        message: string;
    }>;
}

export interface DailyLearningRoute {
    /** A single field makes multiple competing primaries impossible. */
    readonly primaryAction: DailyRouteAction;
    /** At most two more actions; the complete visible route is therefore capped at three. */
    readonly supportingActions: readonly DailyRouteAction[];
    /** Binary, deduplicated recognitions; repetitions and duration never increase them. */
    readonly earnedIncentives: readonly DiegeticIncentive[];
    readonly recovery: DailyRecovery;
    readonly motivation: DailyMotivationalArc;
}

type EvidenceIndex = ReadonlyMap<string, CrossYomuEvidence>;

/**
 * Projects one small route from immutable history. Selection is lane-based,
 * never score/point based: due repair, the next grounded lesson, then n+1.
 */
export function projectDailyLearningRoute(input: DailyLearningLoopInput): DailyLearningRoute {
    validateInput(input);
    const currentEvidence = input.evidence.filter((evidence) => evidence.at <= input.now);
    const evidenceById = new Map(currentEvidence.map((evidence) => [evidence.evidenceId, evidence]));
    const verifiedEvidence = currentEvidence.filter((evidence) => isVerifiedBehavior(evidence, evidenceById));
    const knowledge = projectConceptKnowledge(input.events, currentEvidence, evidenceById, input.now);
    const candidates = input.candidates.filter((candidate) => candidate.modeId !== 'inferno-pressure');

    const actions = [
        projectDueRepair(input.events, input.now),
        projectNextLesson(candidates, input.events, input.now),
        projectNextEncounter(candidates, input.events, input.now, knowledge, input.targetConceptIds ?? [], [
            ...verifiedEvidence,
            ...currentEvidence.filter((evidence) => evidence.kind === 'vocabulary-mined'),
        ]),
    ].filter((action): action is DailyRouteAction => action !== null);

    const primaryAction = actions[0];
    if (!primaryAction) throw new Error('A daily learning route needs at least one available action.');
    const supportingActions = actions.slice(1, 3);
    const earnedIncentives = projectEarnedIncentives(verifiedEvidence);
    const recovery = projectRecovery(input.events, verifiedEvidence, input.now, input.dayBoundary);

    return {
        primaryAction,
        supportingActions,
        earnedIncentives,
        recovery,
        motivation: projectMotivationalArc(primaryAction, supportingActions, earnedIncentives, recovery),
    };
}

function projectMotivationalArc(
    primaryAction: DailyRouteAction,
    supportingActions: readonly DailyRouteAction[],
    earnedIncentives: readonly DiegeticIncentive[],
    recovery: DailyRecovery,
): DailyMotivationalArc {
    const storyAction = [primaryAction, ...supportingActions].find(
        (action) => action.incentive.kind === 'bond-scene' || action.incentive.kind === 'place-discovery',
    );
    const nextAction = supportingActions[0];
    return {
        anticipation: {
            actionId: primaryAction.id,
            message: {
                'due-srs': 'Begin with the due repair; one clear pass is enough to start.',
                'next-grounded-lesson': 'Begin with the next grounded lesson.',
                'n-plus-one': 'Begin with the selected n+1 encounter.',
            }[primaryAction.reason],
        },
        competence: projectCompetence(primaryAction, earnedIncentives, recovery),
        connection: storyAction ? projectConnection(storyAction) : null,
        closure: nextAction
            ? {
                  afterActionId: primaryAction.id,
                  nextActionId: nextAction.id,
                  message: 'After the primary action, choose whether to continue with the next thread.',
              }
            : {
                  afterActionId: primaryAction.id,
                  message: 'After the primary action, close the route when you are ready.',
              },
    };
}

function projectCompetence(
    primaryAction: DailyRouteAction,
    earnedIncentives: readonly DiegeticIncentive[],
    recovery: DailyRecovery,
): DailyMotivationalArc['competence'] {
    if (recovery.mode === 'welcome-back')
        return {
            basis: 'welcome-back',
            message: 'Welcome back. Everything already earned is still here; continue at your own pace.',
        };
    if (earnedIncentives.length)
        return {
            basis: 'verified-practice',
            message: 'Verified learning from earlier actions is carrying forward into this route.',
        };
    if (primaryAction.kind === 'encounter' && primaryAction.coverage.knownConceptIds.length)
        return {
            basis: 'n-plus-one',
            message: 'This encounter builds from Japanese already demonstrated and adds a next step.',
        };
    return {
        basis: 'ready',
        message: 'One completed learning action is enough progress for this route.',
    };
}

function projectConnection(action: DailyRouteAction): NonNullable<DailyMotivationalArc['connection']> {
    if (action.incentive.kind === 'bond-scene')
        return {
            kind: 'relationship',
            actionId: action.id,
            incentiveId: action.incentive.id,
            ...(action.kind === 'encounter' && action.characterId ? { characterId: action.characterId } : {}),
            message: 'This action can continue a grounded relationship thread.',
        };
    return {
        kind: 'world',
        actionId: action.id,
        incentiveId: action.incentive.id,
        message: 'This action can open a grounded place-discovery thread.',
    };
}

function projectDueRepair(events: readonly LearnerEvent[], now: number): DailyRouteAction | null {
    const schedules = latestActiveSchedules(events, now);
    const ratings = latestRatings(events, now);
    const due = [...schedules.values()]
        // A rating closes one schedule occurrence, including `again`; SRS must
        // append the next schedule occurrence when more repair is needed.
        .filter((schedule) => schedule.dueAt <= now && (ratings.get(schedule.reviewItemId)?.at ?? -1) < schedule.at)
        .sort((left, right) => left.reviewItemId.localeCompare(right.reviewItemId));
    if (!due.length) return null;
    const reviewItemIds = due.map((schedule) => schedule.reviewItemId);
    return {
        kind: 'repair',
        reason: 'due-srs',
        id: `daily-repair:${reviewItemIds.map(encodeURIComponent).join('+')}`,
        label: 'Repair due memories',
        modeId: 'repair-review',
        skill: 'repair',
        format: 'mixed',
        reviewItemIds,
        conceptIds: sortedUnique(due.map((schedule) => schedule.conceptId)),
        incentive: { kind: 'journal-memory', id: 'daily-repair-memory' },
    };
}

function projectNextLesson(candidates: readonly DailyLearningCandidate[], events: readonly LearnerEvent[], now: number): DailyRouteAction | null {
    const completedActivities = new Set(
        events.flatMap((event) => {
            if (event.at > now) return [];
            if ((event.kind === 'attempt-recorded' || event.kind === 'learning-evidence-recorded') && event.outcome === 'pass') return [event.activityId];
            return [];
        }),
    );
    const completedEncounters = new Set(events.flatMap((event) => (event.at <= now && event.kind === 'characters-encountered' ? [event.encounterId] : [])));
    const lesson = candidates
        .filter(
            (candidate): candidate is Extract<DailyLearningCandidate, { kind: 'lesson' }> =>
                candidate.kind === 'lesson' &&
                !completedActivities.has(candidate.completionActivityId) &&
                !candidate.completionEncounterIds?.some((id) => completedEncounters.has(id)),
        )
        .slice()
        .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))[0];
    if (!lesson) return null;
    return {
        kind: 'lesson',
        reason: 'next-grounded-lesson',
        id: lesson.id,
        label: lesson.label,
        modeId: lesson.modeId,
        skill: lesson.skill,
        format: lesson.format,
        conceptIds: sortedUnique(lesson.conceptIds),
        incentive: { ...lesson.incentive },
        grounding: { ...lesson.grounding },
    };
}

function projectNextEncounter(
    candidates: readonly DailyLearningCandidate[],
    events: readonly LearnerEvent[],
    now: number,
    knownConceptIds: ReadonlySet<string>,
    targetConceptIds: readonly string[],
    targetEvidence: readonly CrossYomuEvidence[],
): DailyRouteAction | null {
    const completedEncounterIds = new Set(
        events.flatMap((event) =>
            event.at > now ? [] : event.kind === 'characters-encountered' ? [event.encounterId] : event.kind === 'scene-completed' ? [event.sceneId] : [],
        ),
    );
    const evidenceTargets = new Set(targetEvidence.flatMap((item) => item.conceptIds));
    const targets = new Set(targetConceptIds);
    const encounter = candidates
        .filter(
            (candidate): candidate is Extract<DailyLearningCandidate, { kind: 'encounter' }> =>
                candidate.kind === 'encounter' && !completedEncounterIds.has(candidate.id),
        )
        .slice()
        .sort((left, right) => compareEncounters(left, right, knownConceptIds, targets, evidenceTargets))[0];
    if (!encounter) return null;
    const conceptIds = sortedUnique(encounter.conceptIds);
    return {
        kind: 'encounter',
        reason: 'n-plus-one',
        id: encounter.id,
        label: encounter.label,
        modeId: encounter.modeId,
        skill: encounter.skill,
        format: encounter.format,
        conceptIds,
        incentive: { ...encounter.incentive },
        encounterKind: encounter.encounterKind,
        ...(encounter.characterId ? { characterId: encounter.characterId } : {}),
        coverage: {
            knownConceptIds: conceptIds.filter((id) => knownConceptIds.has(id)),
            newConceptIds: conceptIds.filter((id) => !knownConceptIds.has(id)),
            targetConceptIds: conceptIds.filter((id) => !knownConceptIds.has(id) && (targets.has(id) || evidenceTargets.has(id))),
        },
    };
}

function compareEncounters(
    left: Extract<DailyLearningCandidate, { kind: 'encounter' }>,
    right: Extract<DailyLearningCandidate, { kind: 'encounter' }>,
    known: ReadonlySet<string>,
    targets: ReadonlySet<string>,
    evidenceTargets: ReadonlySet<string>,
): number {
    const leftFit = nPlusOneFit(left.conceptIds, known, targets, evidenceTargets);
    const rightFit = nPlusOneFit(right.conceptIds, known, targets, evidenceTargets);
    return (
        leftFit.tier - rightFit.tier ||
        leftFit.unknownCount - rightFit.unknownCount ||
        rightFit.knownRatio - leftFit.knownRatio ||
        rightFit.targetCount - leftFit.targetCount ||
        rightFit.evidenceTargetCount - leftFit.evidenceTargetCount ||
        left.id.localeCompare(right.id)
    );
}

function nPlusOneFit(
    conceptIds: readonly string[],
    known: ReadonlySet<string>,
    targets: ReadonlySet<string>,
    evidenceTargets: ReadonlySet<string>,
): {
    tier: number;
    unknownCount: number;
    knownRatio: number;
    targetCount: number;
    evidenceTargetCount: number;
} {
    const concepts = sortedUnique(conceptIds);
    const unknown = concepts.filter((id) => !known.has(id));
    return {
        tier: unknown.length === 1 ? 0 : unknown.length > 1 ? 1 : 2,
        unknownCount: unknown.length || Number.MAX_SAFE_INTEGER,
        knownRatio: concepts.filter((id) => known.has(id)).length / concepts.length,
        targetCount: unknown.filter((id) => targets.has(id)).length,
        evidenceTargetCount: unknown.filter((id) => evidenceTargets.has(id)).length,
    };
}

function projectConceptKnowledge(
    events: readonly LearnerEvent[],
    evidence: readonly CrossYomuEvidence[],
    evidenceById: EvidenceIndex,
    now: number,
): ReadonlySet<string> {
    const known = new Set(
        events.flatMap((event) =>
            event.at <= now && event.kind === 'learning-evidence-recorded' && event.independent && event.outcome === 'pass' ? event.conceptIds : [],
        ),
    );
    const schedules = latestActiveSchedules(events, now);
    latestRatings(events, now).forEach((rating, reviewItemId) => {
        const schedule = schedules.get(reviewItemId);
        if (schedule && rating.at >= schedule.at && (rating.rating === 'good' || rating.rating === 'easy')) {
            known.add(schedule.conceptId);
        }
    });
    evidence.forEach((item) => {
        if (isConceptDemonstration(item, evidenceById)) item.conceptIds.forEach((id) => known.add(id));
    });
    return known;
}

function isVerifiedBehavior(evidence: CrossYomuEvidence, evidenceById: EvidenceIndex): boolean {
    switch (evidence.kind) {
        case 'japanese-subtitle-viewing':
            return evidence.sustained;
        case 'reader-mode-use':
            return evidence.engagement === 'active-reading';
        case 'passage-read':
            return evidence.completed;
        case 'vocabulary-mined':
            return false;
        case 'later-recall':
            // The independent attempt is learning behavior even after a lapse;
            // only isConceptDemonstration promotes a successful pass to knowledge.
            return evidence.independent && followsPriorEvidence(evidence, evidenceById, false);
        case 'spaced-passage-return':
            return evidence.independent && followsPriorEvidence(evidence, evidenceById, true);
    }
}

function isConceptDemonstration(evidence: CrossYomuEvidence, evidenceById: EvidenceIndex): boolean {
    return (
        (evidence.kind === 'later-recall' || evidence.kind === 'spaced-passage-return') &&
        evidence.outcome === 'pass' &&
        isVerifiedBehavior(evidence, evidenceById)
    );
}

function followsPriorEvidence(
    evidence: Extract<CrossYomuEvidence, { kind: 'later-recall' | 'spaced-passage-return' }>,
    evidenceById: EvidenceIndex,
    requireSameSource: boolean,
): boolean {
    const prior = evidenceById.get(evidence.priorEvidenceId);
    if (!prior || prior.at >= evidence.at) return false;
    if (requireSameSource && (prior.kind !== 'passage-read' || !prior.completed || prior.sourceId !== evidence.sourceId)) return false;
    if (!requireSameSource && !isRecallablePrior(prior)) return false;
    const priorConcepts = new Set(prior.conceptIds);
    return evidence.conceptIds.some((id) => priorConcepts.has(id));
}

function isRecallablePrior(evidence: CrossYomuEvidence): boolean {
    if (evidence.kind === 'vocabulary-mined') return true;
    if (evidence.kind === 'japanese-subtitle-viewing') return evidence.sustained;
    if (evidence.kind === 'reader-mode-use') return evidence.engagement === 'active-reading';
    if (evidence.kind === 'passage-read') return evidence.completed;
    return false;
}

function projectEarnedIncentives(evidence: readonly CrossYomuEvidence[]): readonly DiegeticIncentive[] {
    const incentives = new Map<string, DiegeticIncentive>();
    evidence.forEach((item) => {
        if (!item.incentive) return;
        incentives.set(`${item.incentive.kind}:${item.incentive.id}`, {
            ...item.incentive,
        });
    });
    return [...incentives.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

function projectRecovery(
    events: readonly LearnerEvent[],
    verifiedEvidence: readonly CrossYomuEvidence[],
    now: number,
    boundary: DailyLearningLoopInput['dayBoundary'],
): DailyRecovery {
    const activityTimes = [
        ...events.flatMap((event) => (event.at <= now && academyEventIsLearningActivity(event) ? [event.at] : [])),
        ...verifiedEvidence.map((evidence) => evidence.at),
    ];
    const latestAt = activityTimes.length ? Math.max(...activityTimes) : null;
    const elapsedLearningDays = latestAt === null ? 0 : calendarDayDifference(localLearningDay(latestAt, boundary), localLearningDay(now, boundary));
    const missedDays = Math.max(0, elapsedLearningDays - 1);
    const returning = missedDays > 0;
    return {
        mode: returning ? 'welcome-back' : 'continue',
        missedDays,
        message: returning ? 'Welcome back. Continue from where you left off.' : 'Continue when you are ready.',
        rewardsPreserved: true,
        preservedAcademyRewardEventIds: events
            .filter(
                (event) =>
                    event.at <= now &&
                    (event.kind === 'journal-line-recorded' || event.kind === 'relationship-chapter-unlocked' || event.kind === 'asset-unlocked'),
            )
            .map((event) => event.eventId)
            .sort(),
    };
}

function academyEventIsLearningActivity(event: LearnerEvent): boolean {
    return (
        event.kind === 'attempt-recorded' ||
        event.kind === 'learning-evidence-recorded' ||
        event.kind === 'review-rated' ||
        (event.kind === 'academy-day-closed' && event.mainLessonCompleted)
    );
}

function latestActiveSchedules(events: readonly LearnerEvent[], now: number): ReadonlyMap<string, Extract<LearnerEvent, { kind: 'review-scheduled' }>> {
    const latest = new Map<string, Extract<LearnerEvent, { kind: 'review-scheduled' }>>();
    activeReviewSchedules(events.filter((event) => event.at <= now)).forEach((schedule) => {
        const previous = latest.get(schedule.reviewItemId);
        if (!previous || eventIsLater(schedule, previous)) latest.set(schedule.reviewItemId, schedule);
    });
    return latest;
}

function latestRatings(events: readonly LearnerEvent[], now: number): ReadonlyMap<string, Extract<LearnerEvent, { kind: 'review-rated' }>> {
    const latest = new Map<string, Extract<LearnerEvent, { kind: 'review-rated' }>>();
    events.forEach((event) => {
        if (event.kind !== 'review-rated' || event.at > now) return;
        const previous = latest.get(event.reviewItemId);
        if (!previous || eventIsLater(event, previous)) latest.set(event.reviewItemId, event);
    });
    return latest;
}

function eventIsLater(left: LearnerEvent, right: LearnerEvent): boolean {
    return left.at > right.at || (left.at === right.at && left.eventId.localeCompare(right.eventId) > 0);
}

function localLearningDay(at: number, boundary: DailyLearningLoopInput['dayBoundary']): string {
    const shifted = at - boundary.dayBoundaryHour * 60 * 60 * 1_000;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: boundary.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(shifted));
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((value) => value.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function calendarDayDifference(earlier: string, later: string): number {
    const parse = (value: string): number => {
        const [year, month, day] = value.split('-').map(Number);
        return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
    };
    return Math.max(0, Math.round((parse(later) - parse(earlier)) / 86_400_000));
}

function validateInput(input: DailyLearningLoopInput): void {
    nonNegativeInteger(input.now, 'now');
    if (!Number.isInteger(input.dayBoundary.dayBoundaryHour) || input.dayBoundary.dayBoundaryHour < 0 || input.dayBoundary.dayBoundaryHour > 23) {
        throw new TypeError('dayBoundaryHour must be between 0 and 23.');
    }
    new Intl.DateTimeFormat('en-CA', {
        timeZone: input.dayBoundary.timeZone,
    }).format(0);
    uniqueNonEmptyIds(
        input.candidates.map((candidate) => candidate.id),
        'candidate id',
    );
    uniqueNonEmptyIds(
        input.evidence.map((evidence) => evidence.evidenceId),
        'evidence id',
    );
    if (input.targetConceptIds) input.targetConceptIds.forEach((id) => nonEmpty(id, 'target concept id'));
    input.candidates.forEach((candidate) => {
        nonEmpty(candidate.label, 'candidate label');
        nonEmptyConcepts(candidate.conceptIds, `${candidate.id} conceptIds`);
        validateIncentive(candidate.incentive);
        if (candidate.kind === 'lesson') {
            nonNegativeInteger(candidate.sequence, `${candidate.id} sequence`);
            nonEmpty(candidate.completionActivityId, `${candidate.id} completionActivityId`);
            candidate.completionEncounterIds?.forEach((id) => nonEmpty(id, `${candidate.id} completionEncounterId`));
            nonEmpty(candidate.grounding.sourceId, `${candidate.id} grounding sourceId`);
        } else if (candidate.encounterKind === 'bond' && !candidate.characterId?.trim()) {
            throw new TypeError(`Bond encounter ${candidate.id} needs a characterId.`);
        }
    });
    input.evidence.forEach((evidence) => {
        nonNegativeInteger(evidence.at, `${evidence.evidenceId} at`);
        nonEmpty(evidence.sourceId, `${evidence.evidenceId} sourceId`);
        nonEmptyConcepts(evidence.conceptIds, `${evidence.evidenceId} conceptIds`);
        if (evidence.incentive) validateIncentive(evidence.incentive);
        if (evidence.kind === 'vocabulary-mined') nonEmpty(evidence.collectionItemId, 'collectionItemId');
        if (evidence.kind === 'later-recall' || evidence.kind === 'spaced-passage-return') {
            nonEmpty(evidence.priorEvidenceId, `${evidence.evidenceId} priorEvidenceId`);
        }
    });
}

function validateIncentive(incentive: DiegeticIncentive): void {
    if (!['journal-memory', 'bond-scene', 'place-discovery', 'source-unlock'].includes(incentive.kind)) {
        throw new TypeError('Daily incentives must be diegetic.');
    }
    nonEmpty(incentive.id, 'incentive id');
}

function uniqueNonEmptyIds(ids: readonly string[], label: string): void {
    ids.forEach((id) => nonEmpty(id, label));
    if (new Set(ids).size !== ids.length) throw new TypeError(`${label}s must be unique.`);
}

function nonEmptyConcepts(ids: readonly string[], label: string): void {
    if (!ids.length) throw new TypeError(`${label} must not be empty.`);
    ids.forEach((id) => nonEmpty(id, label));
}

function nonEmpty(value: string, label: string): void {
    if (!value.trim()) throw new TypeError(`${label} must be non-empty.`);
}

function nonNegativeInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
}

function sortedUnique(values: readonly string[]): readonly string[] {
    return [...new Set(values)].sort();
}
