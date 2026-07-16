import {
    validateAnswerSupportContract,
    type ActivityTeachingSupport,
    type AnswerSupportContract,
    type FeedbackBlock,
} from './activity-runtime';

export const MAX_PROGRESSIVE_REPAIR_HINTS = 2;

const CURRICULUM_PHASES = new Set([
    'context',
    'instruction',
    'guided-practice',
    'assessed-recognition',
    'assessed-production',
]);

export interface PedagogyActivity {
    readonly id: string;
    readonly conceptIds: readonly string[];
    readonly curriculumPhase?: string;
    readonly answerSupport?: AnswerSupportContract;
    readonly teachingSupport?: ActivityTeachingSupport;
    readonly options?: readonly Readonly<Record<string, unknown>>[];
    readonly listening?: Readonly<{ transcriptReveal?: string }>;
    readonly answer?: unknown;
}

/** Shared release assertion for activities that a lesson route can mount. */
export function assertActivityPedagogy(
    activity: PedagogyActivity,
    teachingSupport: ActivityTeachingSupport | undefined = activity.teachingSupport,
    options: Readonly<{ requireCurriculumPhase?: boolean }> = {},
): void {
    if (!activity.id?.trim()) throw new TypeError('A reachable lesson activity needs a stable id.');
    if (!activity.conceptIds?.length || activity.conceptIds.some(conceptId => !conceptId.trim())) {
        throw new TypeError(`Reachable activity ${activity.id} needs assessed prerequisite concepts.`);
    }
    if (options.requireCurriculumPhase && !CURRICULUM_PHASES.has(activity.curriculumPhase ?? '')) {
        throw new TypeError(`Reachable activity ${activity.id} needs an explicit curriculum phase.`);
    }

    const answerIssues = validateAnswerSupportContract(activity.answerSupport);
    if (answerIssues.length) {
        throw new TypeError(`Reachable activity ${activity.id} has unsafe answer support: ${answerIssues
            .map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
    }
    assertTeachingSupport(activity.id, teachingSupport);

    if (activity.answer !== undefined) {
        throw new TypeError(`Reachable activity ${activity.id} exposes its answer through the learner model.`);
    }
    for (const option of activity.options ?? []) {
        if ('correct' in option || 'isCorrect' in option || 'answer' in option) {
            throw new TypeError(`Reachable activity ${activity.id} exposes correctness metadata before commitment.`);
        }
    }
    if (activity.listening && activity.listening.transcriptReveal !== 'after-attempt') {
        throw new TypeError(`Reachable activity ${activity.id} exposes its transcript before commitment.`);
    }
}

export function assertBoundedRepairHints(activityId: string, feedback: FeedbackBlock): void {
    const count = [feedback.repairPrompt, feedback.nearbyExample].filter(Boolean).length;
    if (count < 1 || count > MAX_PROGRESSIVE_REPAIR_HINTS) {
        throw new TypeError(
            `Reachable activity ${activityId} needs 1-${MAX_PROGRESSIVE_REPAIR_HINTS} post-attempt repair hints.`,
        );
    }
}

function assertTeachingSupport(activityId: string, support: ActivityTeachingSupport | undefined): void {
    if (!support?.title.en.trim() || !support.title.ja.trim() || !support.entries.length) {
        throw new TypeError(`Reachable activity ${activityId} needs teaching before assessment.`);
    }
    for (const [index, entry] of support.entries.entries()) {
        if (!entry.japanese.trim()) {
            throw new TypeError(`Reachable activity ${activityId} has empty teaching entry ${index + 1}.`);
        }
    }
}
