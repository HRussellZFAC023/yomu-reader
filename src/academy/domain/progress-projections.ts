import { ACADEMY_ASSETS } from '../assets';
import { ACADEMY_CAST, type AcademyCastMemberId } from './cast-registry';
import {
    activeReviewSchedules,
    type LearnerEvent,
    type LearnerProjection,
    type LearningSkill,
} from './learner-record';

export interface CharacterDirectoryEntryProjection {
    readonly characterId: AcademyCastMemberId;
    readonly name: string;
    readonly category: 'teacher' | 'classmate' | 'extended-member';
    readonly unlocked: boolean;
    readonly chapters: readonly number[];
    readonly revisitPaths: readonly CharacterRevisitPath[];
    readonly portrait?: string;
}

export type CharacterRevisitPath = Readonly<{
    encounterId: string;
    kind: 'memory' | 'class-week' | 'story-episode';
    targetId: string;
}>;

const CHARACTER_PORTRAITS = {
    ...ACADEMY_ASSETS.characters.journalReview,
} as const satisfies Readonly<Partial<Record<AcademyCastMemberId, string>>>;

/**
 * The single directory view of encounter history. Class and Journal must both
 * consume this projection rather than independently inferring who was met.
 */
export function projectCharacterDirectory(
    projection: LearnerProjection,
): readonly CharacterDirectoryEntryProjection[] {
    return ACADEMY_CAST
        .filter((member): member is typeof member & { category: 'teacher' | 'classmate' | 'extended-member' } =>
            member.category !== 'textbook-legend')
        .map(member => {
            const encounter = projection.encounteredCharacters[member.id];
            const unlocked = Boolean(encounter);
            const portrait = CHARACTER_PORTRAITS[member.id as keyof typeof CHARACTER_PORTRAITS];
            return {
                characterId: member.id as AcademyCastMemberId,
                name: member.firstName,
                category: member.category,
                unlocked,
                chapters: projection.relationshipJournal[member.id]?.chapters ?? [],
                revisitPaths: uniqueRevisitPaths(encounter?.encounterIds.flatMap(encounterId => {
                    const path = characterRevisitPath(encounterId);
                    return path ? [path] : [];
                }) ?? []),
                ...(unlocked && portrait ? { portrait } : {}),
            };
        });
}

function characterRevisitPath(encounterId: string): CharacterRevisitPath | undefined {
    if (encounterId === 'opening-rie-introduction') {
        return { encounterId, kind: 'memory', targetId: 'rie-opening' };
    }
    if (encounterId === 'aakash-rainy-directions') {
        return { encounterId, kind: 'memory', targetId: 'aakash-rainy-directions' };
    }
    if (encounterId.startsWith('class-week:')) {
        return { encounterId, kind: 'class-week', targetId: encounterId.slice('class-week:'.length) };
    }
    if (encounterId.startsWith('story:')) {
        const target = encounterId.slice('story:'.length).split(':scene:')[0] ?? '';
        return target ? { encounterId, kind: 'story-episode', targetId: target } : undefined;
    }
    return undefined;
}

function uniqueRevisitPaths(paths: readonly CharacterRevisitPath[]): readonly CharacterRevisitPath[] {
    return [...new Map(paths.map(path => [`${path.kind}:${path.targetId}`, path])).values()];
}

export interface TodayProgress {
    readonly goalMinutes: number;
    readonly activeMinutes: number;
    readonly goalItems: number;
    readonly completedItems: number;
    readonly minuteRatio: number;
    readonly itemRatio: number;
    readonly mainLessonCompleted: boolean;
    readonly dayClosed: boolean;
}

export interface SkillProgress {
    readonly skill: LearningSkill;
    readonly attempts: number;
    readonly independentPasses: number;
    readonly lapses: number;
    readonly evidence: 'no-evidence' | 'emerging' | 'practised' | 'reliable';
}

export interface CurriculumTarget {
    readonly id: string;
    readonly conceptIds: readonly string[];
}

export interface CurriculumProgress {
    readonly id: string;
    readonly demonstratedConceptIds: readonly string[];
    readonly totalConcepts: number;
    readonly ratio: number;
}

export interface SourceProgress {
    readonly sourceId: string;
    readonly attempts: number;
    readonly passedActivities: number;
    readonly explicitlyCompleted: boolean;
}

export interface ReviewHealth {
    readonly scheduled: number;
    readonly due: number;
    readonly ratings: Readonly<Record<'again' | 'hard' | 'good' | 'easy', number>>;
    readonly repairNeeded: number;
}

export interface KanjiGardenPlot {
    readonly kanji: string;
    readonly attempts: number;
    readonly independentPasses: number;
    readonly distinctPracticeDays: number;
    readonly lapses: number;
    readonly state: 'encountered' | 'practising' | 'recalled' | 'produced' | 'reliable';
    readonly heat: number;
}

export type StreakQualifyingEventKind = 'learning-evidence-recorded' | 'review-rated' | 'academy-day-closed';

export interface StreakPolicy {
    readonly timeZone: string;
    readonly dayBoundaryHour: number;
    readonly qualifyingEventKinds: readonly StreakQualifyingEventKind[];
}

export interface StreakProgress {
    readonly currentDays: number;
    readonly longestDays: number;
    readonly lastQualifyingLocalDay: string | null;
    readonly timeZone: string;
    readonly dayBoundaryHour: number;
    readonly qualifyingEventKinds: readonly StreakQualifyingEventKind[];
    readonly punitive: false;
}

const SKILLS: readonly LearningSkill[] = [
    'kana', 'kanji', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'repair', 'transfer',
];

export function projectTodayProgress(
    events: readonly LearnerEvent[],
    window: { readonly startAt: number; readonly endAt: number },
    goal: { readonly minutes: number; readonly items: number },
): TodayProgress {
    const today = events.filter(event => event.at >= window.startAt && event.at < window.endAt);
    const learning = today.filter((event): event is Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }> => event.kind === 'learning-evidence-recorded');
    const closures = today.filter((event): event is Extract<LearnerEvent, { kind: 'academy-day-closed' }> => event.kind === 'academy-day-closed');
    const activeMinutes = Math.floor(learning.reduce((sum, event) => sum + (event.durationMs ?? 0), 0) / 60_000);
    const completedItems = learning.length;
    return {
        goalMinutes: goal.minutes,
        activeMinutes,
        goalItems: goal.items,
        completedItems,
        minuteRatio: ratio(activeMinutes, goal.minutes),
        itemRatio: ratio(completedItems, goal.items),
        mainLessonCompleted: closures.some(event => event.mainLessonCompleted),
        dayClosed: closures.length > 0,
    };
}

export function projectSkillProgress(events: readonly LearnerEvent[]): readonly SkillProgress[] {
    const learning = events.filter((event): event is Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }> => event.kind === 'learning-evidence-recorded');
    return SKILLS.map(skill => {
        const relevant = learning.filter(event => event.skill === skill);
        const independentPasses = relevant.filter(event => event.independent && event.outcome === 'pass').length;
        const lapses = relevant.filter(event => event.outcome === 'lapse').length;
        return {
            skill,
            attempts: relevant.length,
            independentPasses,
            lapses,
            evidence: skillEvidence(relevant.length, independentPasses, lapses),
        };
    });
}

export function projectCurriculumProgress(
    events: readonly LearnerEvent[],
    targets: readonly CurriculumTarget[],
): readonly CurriculumProgress[] {
    const demonstrated = new Set(events.flatMap(event =>
        event.kind === 'learning-evidence-recorded' && event.independent && event.outcome === 'pass'
            ? event.conceptIds
            : []));
    return targets.map(target => {
        const ids = [...new Set(target.conceptIds)];
        const demonstratedConceptIds = ids.filter(id => demonstrated.has(id)).sort();
        return {
            id: target.id,
            demonstratedConceptIds,
            totalConcepts: ids.length,
            ratio: ratio(demonstratedConceptIds.length, ids.length),
        };
    });
}

export function projectSourceCompletion(events: readonly LearnerEvent[]): readonly SourceProgress[] {
    const sourceIds = new Set(events.flatMap(event =>
        event.kind === 'learning-evidence-recorded' && event.sourceId ? [event.sourceId] : []));
    return [...sourceIds].sort().map(sourceId => {
        const relevant = events.filter((event): event is Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }> =>
            event.kind === 'learning-evidence-recorded' && event.sourceId === sourceId);
        return {
            sourceId,
            attempts: relevant.length,
            passedActivities: new Set(relevant.filter(event => event.outcome === 'pass').map(event => event.activityId)).size,
            explicitlyCompleted: relevant.some(event => event.action === 'source-complete' && event.outcome === 'pass'),
        };
    });
}

export function projectReviewHealth(events: readonly LearnerEvent[], now: number): ReviewHealth {
    const scheduled = new Map<string, Extract<LearnerEvent, { kind: 'review-scheduled' }>>();
    const latestRating = new Map<string, Extract<LearnerEvent, { kind: 'review-rated' }>>();
    activeReviewSchedules(events).forEach(event => scheduled.set(event.reviewItemId, event));
    events.forEach(event => {
        if (event.kind === 'review-rated') latestRating.set(event.reviewItemId, event);
    });
    const ratings = { again: 0, hard: 0, good: 0, easy: 0 };
    latestRating.forEach(event => { ratings[event.rating] += 1; });
    return {
        scheduled: scheduled.size,
        due: [...scheduled.values()].filter(event => {
            const rating = latestRating.get(event.reviewItemId);
            return event.dueAt <= now && (!rating || rating.at < event.at);
        }).length,
        ratings,
        repairNeeded: ratings.again + events.filter(event => event.kind === 'learning-evidence-recorded' && event.outcome === 'lapse').length,
    };
}

export function projectKanjiGarden(events: readonly LearnerEvent[]): readonly KanjiGardenPlot[] {
    const kanji = new Set(events.flatMap(event => event.kind === 'learning-evidence-recorded' && event.kanji ? [event.kanji] : []));
    return [...kanji].sort().map(character => {
        const relevant = events.filter((event): event is Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }> =>
            event.kind === 'learning-evidence-recorded' && event.kanji === character);
        const passes = relevant.filter(event => event.independent && event.outcome === 'pass');
        const lapses = relevant.filter(event => event.outcome === 'lapse').length;
        const days = new Set(passes.map(event => utcDay(event.at))).size;
        const produced = passes.some(event => event.action === 'produce' || event.action === 'write');
        const state = kanjiState(relevant.length, passes.length, days, produced, lapses);
        return {
            kanji: character,
            attempts: relevant.length,
            independentPasses: passes.length,
            distinctPracticeDays: days,
            lapses,
            state,
            heat: ({ encountered: 0.2, practising: 0.4, recalled: 0.6, produced: 0.8, reliable: 1 })[state],
        };
    });
}

export function projectStreak(events: readonly LearnerEvent[], now: number, policy: StreakPolicy): StreakProgress {
    if (!Number.isInteger(policy.dayBoundaryHour) || policy.dayBoundaryHour < 0 || policy.dayBoundaryHour > 23) {
        throw new TypeError('dayBoundaryHour must be between 0 and 23.');
    }
    const qualifyingKinds = new Set(policy.qualifyingEventKinds);
    const days = [...new Set(events
        .filter(event => qualifyingKinds.has(event.kind as StreakQualifyingEventKind))
        .map(event => localDay(event.at, policy)))]
        .sort();
    let longestDays = 0;
    let run = 0;
    let previous: string | null = null;
    days.forEach(day => {
        run = previous && nextDay(previous) === day ? run + 1 : 1;
        longestDays = Math.max(longestDays, run);
        previous = day;
    });
    const today = localDay(now, policy);
    const latest = days.at(-1) ?? null;
    let currentDays = 0;
    if (latest === today || latest === previousDay(today)) {
        currentDays = 1;
        for (let index = days.length - 2; index >= 0; index -= 1) {
            if (nextDay(days[index] ?? '') !== (days[index + 1] ?? '')) break;
            currentDays += 1;
        }
    }
    return {
        currentDays,
        longestDays,
        lastQualifyingLocalDay: latest,
        timeZone: policy.timeZone,
        dayBoundaryHour: policy.dayBoundaryHour,
        qualifyingEventKinds: [...policy.qualifyingEventKinds],
        punitive: false,
    };
}

function skillEvidence(attempts: number, passes: number, lapses: number): SkillProgress['evidence'] {
    if (!attempts) return 'no-evidence';
    if (passes >= 5 && lapses / attempts <= 0.25) return 'reliable';
    if (passes >= 2) return 'practised';
    return 'emerging';
}

function kanjiState(attempts: number, passes: number, days: number, produced: boolean, lapses: number): KanjiGardenPlot['state'] {
    if (passes >= 4 && days >= 3 && lapses / attempts <= 0.25) return 'reliable';
    if (produced && passes >= 2) return 'produced';
    if (passes >= 2) return 'recalled';
    if (attempts >= 2) return 'practising';
    return 'encountered';
}

function ratio(value: number, target: number): number {
    return target <= 0 ? 1 : Math.min(1, value / target);
}

function utcDay(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

function localDay(at: number, policy: StreakPolicy): string {
    const shifted = at - policy.dayBoundaryHour * 60 * 60 * 1_000;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: policy.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(shifted));
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

function nextDay(day: string): string {
    return offsetDay(day, 1);
}

function previousDay(day: string): string {
    return offsetDay(day, -1);
}

function offsetDay(day: string, delta: number): string {
    const [year, month, date] = day.split('-').map(Number);
    const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (date ?? 1) + delta));
    return shifted.toISOString().slice(0, 10);
}
