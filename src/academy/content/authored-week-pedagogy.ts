import {
    assertActivityPedagogy,
    assertBoundedRepairHints,
} from '../domain/lesson-pedagogy';
import type {
    LearnerAuthoredActivity,
    LearnerAuthoredChoice,
    LearnerAuthoredWeek,
} from './authored-week-adapter';

const IMPOSSIBLE_TEXT_RESPONSE = '__yomu_pedagogy_lapse_probe__';

/** A package must pass this assertion before Class can advertise it as playable. */
export function assertAuthoredWeekPedagogy(week: LearnerAuthoredWeek): LearnerAuthoredWeek {
    if (!week.activities.length) throw new TypeError(`Reachable lesson ${week.id} needs activities.`);
    const activityIds = new Set<string>();
    for (const activity of week.activities) {
        if (activityIds.has(activity.id)) throw new TypeError(`Reachable lesson ${week.id} repeats activity ${activity.id}.`);
        activityIds.add(activity.id);
        assertActivityPedagogy(activity, activity.teachingSupport, { requireCurriculumPhase: true });
        const lapse = lapseEvaluation(week, activity);
        if (lapse.result.outcome !== 'lapse') {
            throw new TypeError(`Reachable activity ${activity.id} has no repairable lapse path.`);
        }
        assertBoundedRepairHints(activity.id, lapse.result.feedback);
    }
    return week;
}

function lapseEvaluation(week: LearnerAuthoredWeek, activity: LearnerAuthoredActivity) {
    if (activity.kind === 'academy-source-vocabulary-sheet') return week.evaluate(activity.id, 'reveal');
    if (activity.kind === 'text') return week.evaluate(activity.id, IMPOSSIBLE_TEXT_RESPONSE);
    const lapse = (activity as LearnerAuthoredChoice).options
        .map(option => week.evaluate(activity.id, option.id))
        .find(evaluation => evaluation.result.outcome === 'lapse');
    if (!lapse) throw new TypeError(`Reachable activity ${activity.id} needs at least one plausible distractor.`);
    return lapse;
}
