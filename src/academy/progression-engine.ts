/**
 * Deterministic Academy progression engine: mastery, wrong-answer repair,
 * SRS scheduling, checkpoints, and unit/course completion — as pure
 * functions over serializable state. Curriculum-agnostic: unit/activity
 * IDs are opaque non-empty strings, never parsed or pattern-matched.
 *
 * See docs/academy/PROGRESSION-SRS.md for the normative specification.
 */

export const SRS_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
const DAY_MS = 86_400_000;

type SrsIntervalDays = (typeof SRS_INTERVAL_DAYS)[number];

export type CompletionState = 'not-started' | 'in-progress' | 'completed';

/** An assessed activity; checkpoints participate in the unit completion gate. */
export interface ActivityDefinition {
    readonly activityId: string;
    /** Checkpoints are explicit assessed activities that gate unit completion in addition to normal mastery. */
    readonly isCheckpoint?: boolean;
    /** Non-required activities (e.g. optional bonus drills) do not block unit completion. Defaults to true. */
    readonly required?: boolean;
}

export interface UnitDefinition {
    readonly unitId: string;
    readonly activities: readonly ActivityDefinition[];
}

export interface CourseDefinition {
    readonly units: readonly UnitDefinition[];
}

export interface AttemptInput {
    readonly unitId: string;
    readonly activityId: string;
    readonly correct: boolean;
    readonly attemptedAt: number;
    /** Optional idempotence key: re-submitting the same attemptId against the same activity is a no-op. */
    readonly attemptId?: string;
}

export interface ReviewInput {
    readonly unitId: string;
    readonly activityId: string;
    readonly correct: boolean;
    readonly reviewedAt: number;
    readonly attemptId?: string;
}

export interface SrsSchedule {
    readonly intervalIndex: number;
    readonly intervalDays: SrsIntervalDays;
    readonly dueAt: number;
}

/** Per-activity mastery state. `wrongPending` blocks mastery until repaired by a correct answer. */
export interface ActivityState {
    readonly unitId: string;
    readonly activityId: string;
    readonly attemptCount: number;
    readonly firstAttemptedAt: number;
    readonly lastAttemptedAt: number;
    readonly lastAttemptId: string | null;
    readonly lastEventKind: 'attempt' | 'review';
    readonly lastEventCorrect: boolean;
    readonly wrongPending: boolean;
    readonly masteredAt: number | null;
    readonly srs: SrsSchedule | null;
}

export interface UnitCompletionRecord {
    readonly unitId: string;
    readonly completedAt: number;
}

export interface ProgressionState {
    readonly version: 1;
    readonly activities: readonly ActivityState[];
    readonly unitCompletions: readonly UnitCompletionRecord[];
    readonly courseCompletedAt: number | null;
}

export interface ActivitySummary {
    readonly unitId: string;
    readonly activityId: string;
    readonly isCheckpoint: boolean;
    readonly required: boolean;
    readonly state: CompletionState;
    readonly wrongPending: boolean;
    readonly attemptCount: number;
    readonly masteredAt: number | null;
    readonly dueAt: number | null;
}

export interface UnitSummary {
    readonly unitId: string;
    readonly state: CompletionState;
    readonly completedAt: number | null;
    readonly currentlyMastered: boolean;
    readonly activities: readonly ActivitySummary[];
}

export interface CourseSummary {
    readonly state: CompletionState;
    readonly completedAt: number | null;
    readonly currentlyMastered: boolean;
    readonly units: readonly UnitSummary[];
}

export interface ReviewQueueItem {
    readonly unitId: string;
    readonly activityId: string;
    readonly dueAt: number;
    readonly intervalDays: SrsIntervalDays;
}

export interface WrongAnswerQueueItem {
    readonly unitId: string;
    readonly activityId: string;
    readonly lastAttemptedAt: number;
}

/** Validates a course definition: opaque non-empty unit/activity IDs, no duplicates across the whole course. */
export function defineCourse(units: readonly UnitDefinition[]): CourseDefinition {
    if (units.length === 0) throw new TypeError('Course must define at least one unit.');
    const seenUnits = new Set<string>();
    const seenActivities = new Set<string>();
    const normalizedUnits: UnitDefinition[] = [];

    for (const unit of units) {
        const unitId = requiredId(unit.unitId, 'unitId');
        if (seenUnits.has(unitId)) throw new TypeError(`Duplicate unitId: ${unitId}`);
        seenUnits.add(unitId);

        if (!unit.activities || unit.activities.length === 0) {
            throw new TypeError(`Unit "${unitId}" must define at least one activity.`);
        }
        const normalizedActivities: ActivityDefinition[] = [];
        for (const activity of unit.activities) {
            const activityId = requiredId(activity.activityId, 'activityId');
            const key = activityKey(unitId, activityId);
            if (seenActivities.has(key)) throw new TypeError(`Duplicate activityId "${activityId}" in unit "${unitId}".`);
            seenActivities.add(key);
            normalizedActivities.push({
                activityId,
                isCheckpoint: activity.isCheckpoint === true,
                required: activity.required !== false,
            });
        }
        if (!normalizedActivities.some(activity => activity.required)) {
            throw new TypeError(`Unit "${unitId}" must define at least one required activity.`);
        }
        normalizedUnits.push({ unitId, activities: normalizedActivities });
    }

    return { units: normalizedUnits };
}

/** Deterministic empty state: no attempts recorded. */
export function createInitialState(): ProgressionState {
    return { version: 1, activities: [], unitCompletions: [], courseCompletedAt: null };
}

/**
 * Applies a single assessed attempt. Pure: returns a new state, never mutates `state`.
 *
 * - Wrong (`correct: false`) sets `wrongPending`, blocking mastery until a correct repair.
 * - Correct while `wrongPending`, or on an activity with no SRS schedule yet, (re)starts the
 *   SRS ladder at interval index 0 (1 day) — this is the only way the ladder resets besides a
 *   failed review.
 * - Correct on an activity that already has an SRS schedule (already mastered, not repairing)
 *   leaves the schedule untouched: attempts do not advance or reset an in-flight review ladder,
 *   only reviews do (see `applyReview`).
 * - If `attemptId` matches the activity's `lastAttemptId`, the attempt is idempotent and the
 *   state is returned unchanged (no double-counting of retried submissions).
 * - Attempts with `attemptedAt` strictly before the activity's `lastAttemptedAt` are rejected
 *   as out-of-order (stale writes must not silently corrupt state).
 */
export function applyAttempt(state: ProgressionState, course: CourseDefinition, input: AttemptInput): ProgressionState {
    const unitId = requiredId(input.unitId, 'unitId');
    const activityId = requiredId(input.activityId, 'activityId');
    requireActivityDefined(course, unitId, activityId);
    if (typeof input.correct !== 'boolean') throw new TypeError('correct must be a boolean.');
    const attemptedAt = requireFiniteTimestamp(input.attemptedAt, 'attemptedAt');

    const key = activityKey(unitId, activityId);
    const previous = state.activities.find(activity => activityKey(activity.unitId, activity.activityId) === key) ?? null;

    const attemptId = optionalId(input.attemptId, 'attemptId');
    if (previous && attemptId !== undefined && previous.lastAttemptId === attemptId) {
        return duplicateEvent(previous, 'attempt', input.correct, attemptedAt, state);
    }
    if (previous && attemptedAt < previous.lastAttemptedAt) {
        throw new RangeError(
            `attemptedAt (${attemptedAt}) is earlier than the last recorded attempt (${previous.lastAttemptedAt}) for "${activityId}".`,
        );
    }

    const isRepairOrFirstMastery = input.correct && (previous?.wrongPending || !previous?.srs);
    const next: ActivityState = {
        unitId,
        activityId,
        attemptCount: (previous?.attemptCount ?? 0) + 1,
        firstAttemptedAt: previous?.firstAttemptedAt ?? attemptedAt,
        lastAttemptedAt: attemptedAt,
        lastAttemptId: attemptId ?? null,
        lastEventKind: 'attempt',
        lastEventCorrect: input.correct,
        wrongPending: input.correct ? false : true,
        masteredAt: input.correct ? (previous?.masteredAt ?? attemptedAt) : previous?.masteredAt ?? null,
        srs: input.correct
            ? (isRepairOrFirstMastery ? startSrsLadder(attemptedAt) : (previous?.srs ?? startSrsLadder(attemptedAt)))
            : previous?.srs ?? null,
    };

    return recordCompletions(replaceActivity(state, key, next), course, attemptedAt);
}

/**
 * Applies a scheduled SRS review outcome. Only valid for activities that are due (or later);
 * reviews submitted strictly before `dueAt` are rejected as premature rather than silently accepted.
 *
 * - Successful review advances the ladder one step (capped at 30 days).
 * - Failed review resets the ladder to 1 day AND sets `wrongPending`, returning the activity to
 *   wrong-answer repair — a due lapse behaves like a fresh wrong answer for gating purposes.
 */
export function applyReview(state: ProgressionState, course: CourseDefinition, input: ReviewInput): ProgressionState {
    const unitId = requiredId(input.unitId, 'unitId');
    const activityId = requiredId(input.activityId, 'activityId');
    requireActivityDefined(course, unitId, activityId);
    if (typeof input.correct !== 'boolean') throw new TypeError('correct must be a boolean.');
    const reviewedAt = requireFiniteTimestamp(input.reviewedAt, 'reviewedAt');

    const key = activityKey(unitId, activityId);
    const previous = state.activities.find(activity => activityKey(activity.unitId, activity.activityId) === key) ?? null;
    if (!previous || !previous.srs) {
        throw new TypeError(`Activity "${activityId}" in unit "${unitId}" has no scheduled review.`);
    }
    const attemptId = optionalId(input.attemptId, 'attemptId');
    if (attemptId !== undefined && previous.lastAttemptId === attemptId) {
        return duplicateEvent(previous, 'review', input.correct, reviewedAt, state);
    }
    if (previous.wrongPending) {
        throw new TypeError(`Activity "${activityId}" is awaiting wrong-answer repair; use applyAttempt before reviewing it.`);
    }
    if (reviewedAt < previous.srs.dueAt) {
        throw new RangeError(
            `reviewedAt (${reviewedAt}) is before the review's dueAt (${previous.srs.dueAt}) for "${activityId}". Early reviews are not accepted.`,
        );
    }
    if (reviewedAt < previous.lastAttemptedAt) {
        throw new RangeError(`reviewedAt (${reviewedAt}) is earlier than the last recorded activity timestamp.`);
    }

    const next: ActivityState = {
        ...previous,
        attemptCount: previous.attemptCount + 1,
        lastAttemptedAt: reviewedAt,
        lastAttemptId: attemptId ?? null,
        lastEventKind: 'review',
        lastEventCorrect: input.correct,
        wrongPending: input.correct ? false : true,
        masteredAt: input.correct ? (previous.masteredAt ?? reviewedAt) : previous.masteredAt,
        srs: input.correct ? advanceSrsLadder(previous.srs, reviewedAt) : startSrsLadder(reviewedAt),
    };

    return recordCompletions(replaceActivity(state, key, next), course, reviewedAt);
}

/** Wrong-answer review queue, stable order: oldest wrong attempt first, then unit/activity order in the course. */
export function selectWrongAnswerQueue(state: ProgressionState, course: CourseDefinition): readonly WrongAnswerQueueItem[] {
    const order = courseOrderIndex(course);
    return state.activities
        .filter(activity => activity.wrongPending)
        .map((activity): WrongAnswerQueueItem => ({
            unitId: activity.unitId,
            activityId: activity.activityId,
            lastAttemptedAt: activity.lastAttemptedAt,
        }))
        .sort((left, right) =>
            left.lastAttemptedAt - right.lastAttemptedAt
            || order(left.unitId, left.activityId) - order(right.unitId, right.activityId));
}

/** Due SRS reviews as of `now`, stable order: earliest due first, then unit/activity order in the course. */
export function selectDueReviews(state: ProgressionState, course: CourseDefinition, now: number): readonly ReviewQueueItem[] {
    if (!Number.isFinite(now)) throw new TypeError('now must be a finite timestamp.');
    const order = courseOrderIndex(course);
    return state.activities
        .filter(activity => !activity.wrongPending && activity.srs !== null && activity.srs.dueAt <= now)
        .map((activity): ReviewQueueItem => ({
            unitId: activity.unitId,
            activityId: activity.activityId,
            dueAt: (activity.srs as SrsSchedule).dueAt,
            intervalDays: (activity.srs as SrsSchedule).intervalDays,
        }))
        .sort((left, right) =>
            left.dueAt - right.dueAt
            || order(left.unitId, left.activityId) - order(right.unitId, right.activityId));
}

/** Summarizes every unit and the overall course, in course-declared order. */
export function summarizeCourse(state: ProgressionState, course: CourseDefinition): CourseSummary {
    const units = course.units.map(unit => summarizeUnit(state, unit));
    const allMastered = units.every(unit => unit.currentlyMastered);
    const anyStarted = units.some(unit => unit.state !== 'not-started');
    const completedAt = state.courseCompletedAt;
    return {
        state: completedAt !== null ? 'completed' : anyStarted ? 'in-progress' : 'not-started',
        completedAt,
        currentlyMastered: allMastered,
        units,
    };
}

/** Summarizes one unit definition against the supplied progression state. */
export function summarizeUnit(state: ProgressionState, unit: UnitDefinition): UnitSummary {
    const activities = unit.activities.map((activity): ActivitySummary => {
        const found = state.activities.find(
            candidate => candidate.unitId === unit.unitId && candidate.activityId === activity.activityId,
        );
        return summarizeActivity(unit.unitId, activity, found ?? null);
    });

    const currentlyMastered = isUnitCurrentlyMastered(state, unit);
    const anyStarted = activities.some(activity => activity.state !== 'not-started');
    const completedAt = state.unitCompletions.find(completion => completion.unitId === unit.unitId)?.completedAt ?? null;

    return {
        unitId: unit.unitId,
        state: completedAt !== null ? 'completed' : anyStarted ? 'in-progress' : 'not-started',
        completedAt,
        currentlyMastered,
        activities,
    };
}

function summarizeActivity(unitId: string, definition: ActivityDefinition, found: ActivityState | null): ActivitySummary {
    const isCheckpoint = definition.isCheckpoint === true;
    const required = definition.required !== false;
    if (!found) {
        return {
            unitId,
            activityId: definition.activityId,
            isCheckpoint,
            required,
            state: 'not-started',
            wrongPending: false,
            attemptCount: 0,
            masteredAt: null,
            dueAt: null,
        };
    }
    const mastered = found.masteredAt !== null && !found.wrongPending;
    return {
        unitId,
        activityId: definition.activityId,
        isCheckpoint,
        required,
        state: mastered ? 'completed' : 'in-progress',
        wrongPending: found.wrongPending,
        attemptCount: found.attemptCount,
        masteredAt: found.masteredAt,
        dueAt: found.srs?.dueAt ?? null,
    };
}

function startSrsLadder(at: number): SrsSchedule {
    return { intervalIndex: 0, intervalDays: SRS_INTERVAL_DAYS[0], dueAt: at + SRS_INTERVAL_DAYS[0] * DAY_MS };
}

function advanceSrsLadder(previous: SrsSchedule, at: number): SrsSchedule {
    const intervalIndex = Math.min(previous.intervalIndex + 1, SRS_INTERVAL_DAYS.length - 1);
    const intervalDays = SRS_INTERVAL_DAYS[intervalIndex];
    return { intervalIndex, intervalDays, dueAt: at + intervalDays * DAY_MS };
}

function replaceActivity(state: ProgressionState, key: string, next: ActivityState): ProgressionState {
    const index = state.activities.findIndex(activity => activityKey(activity.unitId, activity.activityId) === key);
    const activities = index < 0
        ? [...state.activities, next]
        : state.activities.map((activity, position) => (position === index ? next : activity));
    return { ...state, activities };
}

function recordCompletions(state: ProgressionState, course: CourseDefinition, at: number): ProgressionState {
    const completedUnitIds = new Set(state.unitCompletions.map(completion => completion.unitId));
    const unitCompletions = [...state.unitCompletions];

    for (const unit of course.units) {
        if (completedUnitIds.has(unit.unitId) || !isUnitCurrentlyMastered(state, unit)) continue;
        unitCompletions.push({ unitId: unit.unitId, completedAt: at });
        completedUnitIds.add(unit.unitId);
    }

    const courseCompletedAt = state.courseCompletedAt
        ?? (course.units.every(unit => completedUnitIds.has(unit.unitId)) ? at : null);
    return unitCompletions.length === state.unitCompletions.length && courseCompletedAt === state.courseCompletedAt
        ? state
        : { ...state, unitCompletions, courseCompletedAt };
}

function isUnitCurrentlyMastered(state: ProgressionState, unit: UnitDefinition): boolean {
    const required = unit.activities.filter(activity => activity.required !== false);
    return required.length > 0 && required.every(activity => {
        const progress = state.activities.find(candidate =>
            candidate.unitId === unit.unitId && candidate.activityId === activity.activityId);
        return progress?.masteredAt !== null && progress?.wrongPending === false;
    });
}

function duplicateEvent(
    previous: ActivityState,
    kind: ActivityState['lastEventKind'],
    correct: boolean,
    at: number,
    state: ProgressionState,
): ProgressionState {
    if (previous.lastEventKind === kind && previous.lastEventCorrect === correct && previous.lastAttemptedAt === at) return state;
    throw new TypeError(`attemptId "${previous.lastAttemptId}" was already used for a different event.`);
}

function courseOrderIndex(course: CourseDefinition): (unitId: string, activityId: string) => number {
    const order = new Map<string, number>();
    let index = 0;
    for (const unit of course.units) {
        for (const activity of unit.activities) {
            order.set(activityKey(unit.unitId, activity.activityId), index++);
        }
    }
    return (unitId, activityId) => order.get(activityKey(unitId, activityId)) ?? Number.MAX_SAFE_INTEGER;
}

function requireActivityDefined(course: CourseDefinition, unitId: string, activityId: string): void {
    const unit = course.units.find(candidate => candidate.unitId === unitId);
    if (!unit) throw new TypeError(`Unknown unitId: ${unitId}`);
    const activity = unit.activities.find(candidate => candidate.activityId === activityId);
    if (!activity) throw new TypeError(`Unknown activityId "${activityId}" in unit "${unitId}".`);
}

function activityKey(unitId: string, activityId: string): string {
    return JSON.stringify([unitId, activityId]);
}

function requiredId(value: string, label: string): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
    return normalized;
}

function optionalId(value: string | undefined, label: string): string | undefined {
    return value === undefined ? undefined : requiredId(value, label);
}

function requireFiniteTimestamp(value: number, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
    return value;
}
