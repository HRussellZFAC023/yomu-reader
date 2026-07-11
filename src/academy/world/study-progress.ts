/**
 * Yomu Academy — study progress bridge.
 *
 * Adapts the course facade (weeks + their exercises) into the pure
 * progression engine (units + activities), persists engine state, and
 * exposes the two flows the app needs: record a lesson attempt, and run
 * the due-review queue (which re-presents the original exercises).
 */

import {
    applyAttempt,
    applyReview,
    createInitialState,
    defineCourse,
    selectDueReviews,
    type CourseDefinition,
    type ProgressionState,
} from '../progression-engine';
import type { CourseView } from '../content/course';
import type { WeekExercise } from '../player/week-exercises';

const STORAGE_KEY = 'yomu:academy:progression:v1';

export interface ReviewQueueEntry {
    weekId: string;
    exercise: WeekExercise;
}

export class StudyProgress {
    private state: ProgressionState;
    private course: CourseDefinition | null = null;
    private readonly exerciseIndex = new Map<string, WeekExercise>();

    constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
        this.state = this.load();
    }

    /** Build the engine course from authored weeks (those with exercises). */
    attach(view: CourseView): void {
        const units = [];
        for (const week of view.weeks) {
            if (!week.week) continue;
            const components = (week.week.components ?? []) as { exercises?: WeekExercise[] }[];
            const exercises = components.flatMap(component => component.exercises ?? []);
            if (!exercises.length) continue;
            for (const exercise of exercises) this.exerciseIndex.set(`${week.id}::${exercise.id}`, exercise);
            units.push({
                unitId: week.id,
                activities: exercises.map(exercise => ({ activityId: exercise.id })),
            });
        }
        this.course = units.length ? defineCourse(units) : null;
    }

    recordAttempt(weekId: string, exerciseId: string, correct: boolean): void {
        if (!this.course) return;
        if (!this.exerciseIndex.has(`${weekId}::${exerciseId}`)) return;
        try {
            this.state = applyAttempt(this.state, this.course, {
                unitId: weekId,
                activityId: exerciseId,
                correct,
                attemptedAt: Date.now(),
            });
            this.save();
        } catch {
            /* unknown unit/activity — content changed since attach; skip */
        }
    }

    recordReview(weekId: string, exerciseId: string, correct: boolean): void {
        if (!this.course) return;
        try {
            this.state = applyReview(this.state, this.course, {
                unitId: weekId,
                activityId: exerciseId,
                correct,
                reviewedAt: Date.now(),
            });
            this.save();
        } catch {
            /* stale queue entry; skip */
        }
    }

    dueReviews(now: number = Date.now()): ReviewQueueEntry[] {
        if (!this.course) return [];
        const due = selectDueReviews(this.state, this.course, now);
        const queue: ReviewQueueEntry[] = [];
        for (const item of due) {
            const exercise = this.exerciseIndex.get(`${item.unitId}::${item.activityId}`);
            if (exercise) queue.push({ weekId: item.unitId, exercise });
        }
        return queue;
    }

    private load(): ProgressionState {
        try {
            const raw = this.storage.getItem(STORAGE_KEY);
            if (!raw) return createInitialState();
            const parsed = JSON.parse(raw) as ProgressionState;
            return parsed?.version === 1 ? parsed : createInitialState();
        } catch {
            return createInitialState();
        }
    }

    private save(): void {
        try {
            this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch {
            /* storage unavailable; keep in memory */
        }
    }
}
