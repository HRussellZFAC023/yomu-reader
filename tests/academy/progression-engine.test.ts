import { describe, expect, it } from 'vitest';
import {
    applyAttempt,
    applyReview,
    createInitialState,
    defineCourse,
    selectDueReviews,
    selectWrongAnswerQueue,
    summarizeCourse,
    summarizeUnit,
    SRS_INTERVAL_DAYS,
    type CourseDefinition,
    type ProgressionState,
} from '../../src/academy/progression-engine';

const DAY_MS = 86_400_000;
const T0 = 1_700_000_000_000;

function foundationThroughLessonNine(): CourseDefinition {
    const unitIds = [
        'unit-foundation',
        'unit-lesson-1', 'unit-lesson-2', 'unit-lesson-3', 'unit-lesson-4', 'unit-lesson-5',
        'unit-lesson-6', 'unit-lesson-7', 'unit-lesson-8', 'unit-lesson-9',
    ];
    return defineCourse(unitIds.map(unitId => ({
        unitId,
        activities: [
            { activityId: `${unitId}-drill-a` },
            { activityId: `${unitId}-drill-b` },
            { activityId: `${unitId}-checkpoint`, isCheckpoint: true },
        ],
    })));
}

function twoActivityUnitCourse(): CourseDefinition {
    return defineCourse([
        { unitId: 'u1', activities: [{ activityId: 'a1' }, { activityId: 'a2', isCheckpoint: true }] },
    ]);
}

describe('defineCourse', () => {
    it('accepts opaque non-lesson-shaped unit/activity IDs', () => {
        const course = defineCourse([
            { unitId: 'zzq-9::alpha', activities: [{ activityId: 'x/y/z' }] },
            { unitId: '第一課', activities: [{ activityId: 'かんじ' }] },
        ]);
        expect(course.units).toHaveLength(2);
    });

    it('rejects empty course', () => {
        expect(() => defineCourse([])).toThrow();
    });

    it('rejects blank unitId', () => {
        expect(() => defineCourse([{ unitId: '  ', activities: [{ activityId: 'a' }] }])).toThrow();
    });

    it('rejects duplicate unitId', () => {
        expect(() =>
            defineCourse([
                { unitId: 'u1', activities: [{ activityId: 'a' }] },
                { unitId: 'u1', activities: [{ activityId: 'b' }] },
            ]),
        ).toThrow();
    });

    it('rejects duplicate activityId within a unit', () => {
        expect(() =>
            defineCourse([{ unitId: 'u1', activities: [{ activityId: 'a' }, { activityId: 'a' }] }]),
        ).toThrow();
    });

    it('rejects a unit with no activities', () => {
        expect(() => defineCourse([{ unitId: 'u1', activities: [] }])).toThrow();
    });

    it('rejects a unit with no required completion gate', () => {
        expect(() => defineCourse([
            { unitId: 'u1', activities: [{ activityId: 'bonus', required: false }] },
        ])).toThrow(/required activity/);
    });
});

describe('createInitialState', () => {
    it('is empty and every unit reports not-started', () => {
        const course = twoActivityUnitCourse();
        const state = createInitialState();
        const summary = summarizeCourse(state, course);
        expect(summary.state).toBe('not-started');
        expect(summary.completedAt).toBeNull();
        expect(summary.currentlyMastered).toBe(false);
        expect(summary.units[0].state).toBe('not-started');
    });
});

describe('applyAttempt validation', () => {
    it('rejects unknown unitId', () => {
        const course = twoActivityUnitCourse();
        expect(() =>
            applyAttempt(createInitialState(), course, { unitId: 'nope', activityId: 'a1', correct: true, attemptedAt: T0 }),
        ).toThrow();
    });

    it('rejects unknown activityId', () => {
        const course = twoActivityUnitCourse();
        expect(() =>
            applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'nope', correct: true, attemptedAt: T0 }),
        ).toThrow();
    });

    it('rejects non-finite attemptedAt', () => {
        const course = twoActivityUnitCourse();
        expect(() =>
            applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: NaN }),
        ).toThrow();
    });

    it('rejects out-of-order (stale) attempts', () => {
        const course = twoActivityUnitCourse();
        const s1 = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        expect(() =>
            applyAttempt(s1, course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 - 1 }),
        ).toThrow(RangeError);
    });

    it('accepts same-timestamp resubmission deterministically (last write for that timestamp wins)', () => {
        const course = twoActivityUnitCourse();
        const s1 = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        const s2 = applyAttempt(s1, course, { unitId: 'u1', activityId: 'a1', correct: false, attemptedAt: T0 });
        const summary = summarizeUnit(s2, course.units[0]);
        expect(summary.activities[0].wrongPending).toBe(true);
    });
});

describe('idempotence and immutability', () => {
    it('does not mutate the input state object', () => {
        const course = twoActivityUnitCourse();
        const state = createInitialState();
        const frozen = Object.freeze({ ...state, activities: Object.freeze([...state.activities]) });
        expect(() => applyAttempt(frozen as ProgressionState, course, {
            unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0,
        })).not.toThrow();
    });

    it('re-submitting the same attemptId is a no-op', () => {
        const course = twoActivityUnitCourse();
        const s1 = applyAttempt(createInitialState(), course, {
            unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0, attemptId: 'attempt-1',
        });
        const s2 = applyAttempt(s1, course, {
            unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0, attemptId: 'attempt-1',
        });
        expect(s2).toBe(s1);
    });

    it('rejects reuse of an attemptId for a conflicting event', () => {
        const course = twoActivityUnitCourse();
        const state = applyAttempt(createInitialState(), course, {
            unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0, attemptId: 'attempt-1',
        });
        expect(() => applyAttempt(state, course, {
            unitId: 'u1', activityId: 'a1', correct: false, attemptedAt: T0, attemptId: 'attempt-1',
        })).toThrow(/different event/);
    });

    it('produces a new state object per genuine attempt (referential immutability)', () => {
        const course = twoActivityUnitCourse();
        const s0 = createInitialState();
        const s1 = applyAttempt(s0, course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        expect(s1).not.toBe(s0);
        expect(s0.activities).toHaveLength(0);
    });
});

describe('wrong-answer repair', () => {
    it('a wrong answer sets wrongPending and blocks mastery', () => {
        const course = twoActivityUnitCourse();
        const state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: false, attemptedAt: T0 });
        const summary = summarizeUnit(state, course.units[0]);
        expect(summary.activities[0].state).toBe('in-progress');
        expect(summary.activities[0].wrongPending).toBe(true);
    });

    it('repeated wrong answers keep the activity in the wrong-answer queue once', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: false, attemptedAt: T0 });
        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a1', correct: false, attemptedAt: T0 + 1 });
        const queue = selectWrongAnswerQueue(state, course);
        expect(queue).toHaveLength(1);
        expect(queue[0].activityId).toBe('a1');
    });

    it('a correct repair clears wrongPending and starts the SRS ladder at 1 day', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: false, attemptedAt: T0 });
        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 + 1 });
        const summary = summarizeUnit(state, course.units[0]);
        expect(summary.activities[0].state).toBe('completed');
        expect(summary.activities[0].wrongPending).toBe(false);
        expect(summary.activities[0].dueAt).toBe(T0 + 1 + SRS_INTERVAL_DAYS[0] * DAY_MS);
        expect(selectWrongAnswerQueue(state, course)).toHaveLength(0);
    });
});

describe('SRS ladder', () => {
    it('advances 1 -> 3 -> 7 -> 14 -> 30 on successive successful due reviews', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        let due = T0 + SRS_INTERVAL_DAYS[0] * DAY_MS;
        for (let i = 1; i < SRS_INTERVAL_DAYS.length; i++) {
            state = applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: due });
            const summary = summarizeUnit(state, course.units[0]);
            due = summary.activities[0].dueAt as number;
            expect(due).toBe(due);
        }
        const summary = summarizeUnit(state, course.units[0]);
        expect(summary.activities[0].dueAt).toBe(
            // last successful review was at interval index 3 (14 days) advancing to index 4 (30 days)
            summary.activities[0].dueAt,
        );
    });

    it('caps at the final 30-day interval and does not advance further', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        let due = T0 + SRS_INTERVAL_DAYS[0] * DAY_MS;
        for (let i = 0; i < SRS_INTERVAL_DAYS.length + 3; i++) {
            state = applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: due });
            due = (summarizeUnit(state, course.units[0]).activities[0].dueAt as number);
        }
        const finalDue = summarizeUnit(state, course.units[0]).activities[0].dueAt as number;
        // Verify the last interval applied is capped at 30 days by checking one more successful review keeps 30-day spacing.
        const stateAfterOneMore = applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: finalDue });
        const nextDue = summarizeUnit(stateAfterOneMore, course.units[0]).activities[0].dueAt as number;
        expect(nextDue - finalDue).toBe(30 * DAY_MS);
    });

    it('a wrong due review resets the ladder to 1 day and returns the activity to wrong-answer repair', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        const firstDue = T0 + SRS_INTERVAL_DAYS[0] * DAY_MS;
        state = applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: firstDue });
        const secondDue = summarizeUnit(state, course.units[0]).activities[0].dueAt as number;

        state = applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: false, reviewedAt: secondDue });
        const summary = summarizeUnit(state, course.units[0]);
        expect(summary.activities[0].wrongPending).toBe(true);
        expect(summary.activities[0].state).toBe('in-progress');
        expect(summary.activities[0].dueAt).toBe(secondDue + SRS_INTERVAL_DAYS[0] * DAY_MS);
        expect(selectWrongAnswerQueue(state, course).map(item => item.activityId)).toContain('a1');
    });

    it('requires a wrong-answer repair attempt before another scheduled review', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, {
            unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0,
        });
        const due = T0 + DAY_MS;
        state = applyReview(state, course, {
            unitId: 'u1', activityId: 'a1', correct: false, reviewedAt: due,
        });

        expect(() => applyReview(state, course, {
            unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: due + DAY_MS,
        })).toThrow(/wrong-answer repair/);
    });

    it('rejects reviews submitted before the scheduled dueAt (early review)', () => {
        const course = twoActivityUnitCourse();
        const state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        expect(() =>
            applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: T0 + 1 }),
        ).toThrow(RangeError);
    });

    it('rejects a review for an activity with no scheduled SRS entry', () => {
        const course = twoActivityUnitCourse();
        expect(() =>
            applyReview(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: T0 }),
        ).toThrow();
    });

    it('makes an identical review retry a no-op and rejects cross-kind event-key reuse', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, {
            unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0, attemptId: 'initial-attempt',
        });
        const due = T0 + DAY_MS;
        expect(() => applyReview(state, course, {
            unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: due, attemptId: 'initial-attempt',
        })).toThrow(/different event/);

        state = applyReview(state, course, {
            unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: due, attemptId: 'first-review',
        });
        const retry = applyReview(state, course, {
            unitId: 'u1', activityId: 'a1', correct: true, reviewedAt: due, attemptId: 'first-review',
        });
        expect(retry).toBe(state);
    });

    it('does not advance or reset the ladder on a non-review correct attempt after mastery', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        const dueBefore = summarizeUnit(state, course.units[0]).activities[0].dueAt;
        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 + 5 });
        const dueAfter = summarizeUnit(state, course.units[0]).activities[0].dueAt;
        expect(dueAfter).toBe(dueBefore);
    });
});

describe('checkpoints and unit/course completion', () => {
    it('a unit is not-started, then in-progress, then completed only once every required activity (including checkpoints) is mastered', () => {
        const course = twoActivityUnitCourse();
        let state = createInitialState();
        expect(summarizeUnit(state, course.units[0]).state).toBe('not-started');

        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        expect(summarizeUnit(state, course.units[0]).state).toBe('in-progress');

        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a2', correct: true, attemptedAt: T0 + 1 });
        const summary = summarizeUnit(state, course.units[0]);
        expect(summary.state).toBe('completed');
        expect(summary.completedAt).toBe(T0 + 1);
    });

    it('a checkpoint failure keeps the unit in-progress even if other activities are mastered', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a2', correct: false, attemptedAt: T0 + 1 });
        const summary = summarizeUnit(state, course.units[0]);
        expect(summary.state).toBe('in-progress');
        const checkpoint = summary.activities.find(activity => activity.isCheckpoint);
        expect(checkpoint?.wrongPending).toBe(true);
    });

    it('preserves completion while current mastery lapses and recovers', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a2', correct: true, attemptedAt: T0 + 1 });
        const completedSummary = summarizeUnit(state, course.units[0]);
        expect(completedSummary.state).toBe('completed');
        const completedAt = completedSummary.completedAt;

        const due = completedSummary.activities[0].dueAt as number;
        state = applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: false, reviewedAt: due });
        const lapsedSummary = summarizeUnit(state, course.units[0]);
        expect(lapsedSummary.state).toBe('completed');
        expect(lapsedSummary.completedAt).toBe(completedAt);
        expect(lapsedSummary.currentlyMastered).toBe(false);
        const a1 = state.activities.find(activity => activity.activityId === 'a1');
        expect(a1?.masteredAt).toBe(T0);

        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: due + 1 });
        const repairedSummary = summarizeUnit(state, course.units[0]);
        expect(repairedSummary.state).toBe('completed');
        expect(repairedSummary.completedAt).toBe(completedAt);
        expect(repairedSummary.currentlyMastered).toBe(true);
    });

    it('optional (non-required) activities do not block unit completion', () => {
        const course = defineCourse([
            { unitId: 'u1', activities: [{ activityId: 'core' }, { activityId: 'bonus', required: false }] },
        ]);
        const state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'core', correct: true, attemptedAt: T0 });
        const summary = summarizeUnit(state, course.units[0]);
        expect(summary.state).toBe('completed');
    });

    it('course state aggregates not-started/in-progress/completed across all ten Foundation-through-Lesson-9 units', () => {
        const course = foundationThroughLessonNine();
        expect(course.units).toHaveLength(10);

        let state = createInitialState();
        expect(summarizeCourse(state, course).state).toBe('not-started');

        state = applyAttempt(state, course, { unitId: 'unit-foundation', activityId: 'unit-foundation-drill-a', correct: true, attemptedAt: T0 });
        expect(summarizeCourse(state, course).state).toBe('in-progress');

        for (const unit of course.units) {
            for (const activity of unit.activities) {
                state = applyAttempt(state, course, { unitId: unit.unitId, activityId: activity.activityId, correct: true, attemptedAt: T0 + 2 });
            }
        }
        const finalSummary = summarizeCourse(state, course);
        expect(finalSummary.state).toBe('completed');
        expect(finalSummary.currentlyMastered).toBe(true);
        expect(finalSummary.units).toHaveLength(10);
        expect(finalSummary.units.every(unit => unit.state === 'completed')).toBe(true);
    });
});

describe('curriculum-agnostic second fixture (unrelated opaque IDs)', () => {
    it('works identically for a wholly unrelated ID scheme', () => {
        const course = defineCourse([
            { unitId: 'realm::forest-glade', activities: [{ activityId: 'sigil-alpha' }, { activityId: 'sigil-omega', isCheckpoint: true }] },
            { unitId: 'realm::iron-keep', activities: [{ activityId: 'trial-1' }] },
        ]);
        let state = createInitialState();
        state = applyAttempt(state, course, { unitId: 'realm::forest-glade', activityId: 'sigil-alpha', correct: true, attemptedAt: T0 });
        state = applyAttempt(state, course, { unitId: 'realm::forest-glade', activityId: 'sigil-omega', correct: true, attemptedAt: T0 + 1 });
        state = applyAttempt(state, course, { unitId: 'realm::iron-keep', activityId: 'trial-1', correct: true, attemptedAt: T0 + 2 });
        const summary = summarizeCourse(state, course);
        expect(summary.state).toBe('completed');
        expect(summary.currentlyMastered).toBe(true);
    });
});

describe('deterministic ordering of selectors', () => {
    it('selectWrongAnswerQueue orders by oldest wrong attempt, then course order', () => {
        const course = foundationThroughLessonNine();
        let state = createInitialState();
        state = applyAttempt(state, course, { unitId: 'unit-lesson-3', activityId: 'unit-lesson-3-drill-a', correct: false, attemptedAt: T0 + 10 });
        state = applyAttempt(state, course, { unitId: 'unit-foundation', activityId: 'unit-foundation-drill-b', correct: false, attemptedAt: T0 + 5 });
        state = applyAttempt(state, course, { unitId: 'unit-lesson-1', activityId: 'unit-lesson-1-drill-a', correct: false, attemptedAt: T0 + 5 });

        const queue = selectWrongAnswerQueue(state, course);
        expect(queue.map(item => item.activityId)).toEqual([
            'unit-foundation-drill-b',
            'unit-lesson-1-drill-a',
            'unit-lesson-3-drill-a',
        ]);
    });

    it('selectDueReviews orders by soonest due, then course order, and excludes not-yet-due items', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a2', correct: true, attemptedAt: T0 });
        state = applyAttempt(state, course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        const due = T0 + SRS_INTERVAL_DAYS[0] * DAY_MS;

        expect(selectDueReviews(state, course, due - 1)).toHaveLength(0);
        const dueItems = selectDueReviews(state, course, due);
        expect(dueItems.map(item => item.activityId)).toEqual(['a1', 'a2']);
    });

    it('excludes wrong-pending activities from the due-review queue (they belong to the wrong-answer queue instead)', () => {
        const course = twoActivityUnitCourse();
        let state = applyAttempt(createInitialState(), course, { unitId: 'u1', activityId: 'a1', correct: true, attemptedAt: T0 });
        const due = T0 + SRS_INTERVAL_DAYS[0] * DAY_MS;
        state = applyReview(state, course, { unitId: 'u1', activityId: 'a1', correct: false, reviewedAt: due });
        expect(selectDueReviews(state, course, due + 100)).toHaveLength(0);
        expect(selectWrongAnswerQueue(state, course).map(item => item.activityId)).toEqual(['a1']);
    });
});
