import type { LearnerEvent } from './learner-record';
import { projectStreak, type StreakPolicy } from './progress-projections';

export type ClassBoardMetricId = 'known-word-count' | 'review-activity' | 'lesson-progress' | 'streak';

export interface ClassBoardMetricDefinition {
    readonly id: ClassBoardMetricId;
    readonly accountRequired: true;
    readonly optInRequired: true;
    readonly aggregateOnly: true;
    readonly excludes: readonly ['raw-events', 'answers', 'failed-items', 'word-lists'];
    readonly window: 'all-time' | 'rolling-7-days' | 'current-streak';
    readonly meaning: string;
}

export interface ClassBoardEntry {
    readonly identity: {
        readonly displayName: string;
        readonly discriminator: string;
        readonly label: string;
    };
    readonly metrics: Partial<Readonly<Record<ClassBoardMetricId, number>>>;
}

export const CLASS_BOARD_METRICS: readonly ClassBoardMetricDefinition[] = [
    metric('known-word-count', 'Vocabulary concepts demonstrated independently at least three times on two local days.', 'all-time'),
    metric('review-activity', 'Completed review ratings in the rolling seven-day window; the grade itself is never shared.', 'rolling-7-days'),
    metric('lesson-progress', 'Academy days closed after their main lesson.', 'all-time'),
    metric('streak', 'Current non-punitive qualifying-day run under the declared local-day policy.', 'current-streak'),
];

export function projectClassBoardEntry(
    identity: { readonly displayName: string; readonly discriminator: string } | null,
    optedInMetrics: readonly ClassBoardMetricId[],
    events: readonly LearnerEvent[],
    now: number,
    streakPolicy: StreakPolicy,
): ClassBoardEntry | null {
    if (!identity?.displayName.trim()) return null;
    if (identity.displayName.trim().length > 40 || /[#\p{C}]/u.test(identity.displayName)) throw new TypeError('Class Board displayName is invalid.');
    if (!/^\d{6}$/.test(identity.discriminator)) throw new TypeError('Class Board discriminator must be an opaque six-digit value.');
    const enabled = new Set(optedInMetrics);
    const metrics: Partial<Record<ClassBoardMetricId, number>> = {};
    if (enabled.has('known-word-count')) metrics['known-word-count'] = knownWordCount(events, streakPolicy);
    if (enabled.has('review-activity')) metrics['review-activity'] = events.filter(event => event.kind === 'review-rated' && event.at >= now - 7 * 86_400_000 && event.at <= now).length;
    if (enabled.has('lesson-progress')) metrics['lesson-progress'] = new Set(events
        .filter((event): event is Extract<LearnerEvent, { kind: 'academy-day-closed' }> => event.kind === 'academy-day-closed' && event.mainLessonCompleted)
        .map(event => event.dayId)).size;
    if (enabled.has('streak')) metrics.streak = projectStreak(events, now, streakPolicy).currentDays;
    return {
        identity: {
            displayName: identity.displayName.trim(),
            discriminator: identity.discriminator,
            label: `${identity.displayName.trim()}#${identity.discriminator}`,
        },
        metrics,
    };
}

function knownWordCount(events: readonly LearnerEvent[], policy: StreakPolicy): number {
    const evidence = new Map<string, { passes: number; days: Set<string> }>();
    events.forEach(event => {
        if (event.kind !== 'learning-evidence-recorded' || event.skill !== 'vocabulary' || !event.independent || event.outcome !== 'pass') return;
        event.conceptIds.forEach(conceptId => {
            const current = evidence.get(conceptId) ?? { passes: 0, days: new Set<string>() };
            current.passes += 1;
            current.days.add(localDayKey(event.at, policy.timeZone, policy.dayBoundaryHour));
            evidence.set(conceptId, current);
        });
    });
    return [...evidence.values()].filter(value => value.passes >= 3 && value.days.size >= 2).length;
}

function metric(id: ClassBoardMetricId, meaning: string, window: ClassBoardMetricDefinition['window']): ClassBoardMetricDefinition {
    return {
        id,
        accountRequired: true,
        optInRequired: true,
        aggregateOnly: true,
        excludes: ['raw-events', 'answers', 'failed-items', 'word-lists'],
        window,
        meaning,
    };
}

function localDayKey(at: number, timeZone: string, boundaryHour: number): string {
    const shifted = at - boundaryHour * 60 * 60 * 1_000;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(shifted));
}
