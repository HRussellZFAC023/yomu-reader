import type { LearnerEventInput } from './learner-record';

export interface AcademyDayPlan {
    readonly id: string;
    readonly mainLessonId: string;
    readonly optionalActivityIds: readonly string[];
    readonly specialEvents: readonly {
        readonly assetId: string;
        readonly requiresActivityIds: readonly string[];
    }[];
}

export interface AcademyDayState {
    readonly completedActivityIds: readonly string[];
    readonly mainLessonCompleted: boolean;
}

export interface CloseAcademyDayResult {
    readonly events: readonly LearnerEventInput[];
    readonly canContinue: true;
    readonly optionalActivityIds: readonly string[];
}

export function completeDayActivity(plan: AcademyDayPlan, state: AcademyDayState, activityId: string): AcademyDayState {
    validateDayPlan(plan);
    const allowed = new Set([plan.mainLessonId, ...plan.optionalActivityIds]);
    if (!allowed.has(activityId)) throw new Error(`Activity ${activityId} does not belong to Academy day ${plan.id}.`);
    const completedActivityIds = [...new Set([...state.completedActivityIds, activityId])].sort();
    return { completedActivityIds, mainLessonCompleted: completedActivityIds.includes(plan.mainLessonId) };
}

export function closeAcademyDay(plan: AcademyDayPlan, state: AcademyDayState, elapsedMs: number): CloseAcademyDayResult {
    validateDayPlan(plan);
    if (!state.mainLessonCompleted) throw new Error('The main lesson must be completed before closing the day.');
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) throw new TypeError('Day elapsedMs must be a non-negative integer.');
    const completedOptional = plan.optionalActivityIds.filter(id => state.completedActivityIds.includes(id));
    const closureVariant = completedOptional.length ? completedOptional.map(encodeURIComponent).join('+') : 'main';
    const unlocks = plan.specialEvents.filter(event =>
        event.requiresActivityIds.length > 0
        && event.requiresActivityIds.every(id => completedOptional.includes(id)));
    return {
        events: [
            {
                kind: 'academy-day-closed',
                eventId: `academy-day:${plan.id}:closed:${closureVariant}`,
                dayId: plan.id,
                mainLessonCompleted: true,
                optionalActivityIds: completedOptional,
                elapsedMs,
            },
            ...unlocks.map(event => ({
                kind: 'asset-unlocked' as const,
                eventId: `academy-day:${plan.id}:special:${event.assetId}`,
                assetId: event.assetId,
            })),
        ],
        canContinue: true,
        optionalActivityIds: plan.optionalActivityIds.filter(id => !completedOptional.includes(id)),
    };
}

function validateDayPlan(plan: AcademyDayPlan): void {
    if (!plan.id.trim() || !plan.mainLessonId.trim()) throw new TypeError('Academy day needs stable day and main-lesson ids.');
    if (new Set(plan.optionalActivityIds).size !== plan.optionalActivityIds.length || plan.optionalActivityIds.includes(plan.mainLessonId)) {
        throw new TypeError('Academy optional activity ids must be unique and distinct from the main lesson.');
    }
    const optional = new Set(plan.optionalActivityIds);
    plan.specialEvents.forEach(event => {
        if (!event.assetId.trim() || !event.requiresActivityIds.length || event.requiresActivityIds.some(id => !optional.has(id))) {
            throw new TypeError('Special events need an asset id and optional-activity requirements from this day.');
        }
    });
}
