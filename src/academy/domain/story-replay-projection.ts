import { LANTERN_ATLAS_CANON, type LanternAtlasCanon } from '../content/lantern-atlas-canon';
import { activeReviewSchedules, type LearnerEvent } from './learner-record';
import { projectStoryProgression } from './story-progression';

const DAY = 86_400_000;
const LANGUAGE_LADDER = ['foundation', 'n5', 'n4', 'n3', 'n2', 'n1', 'ngPlus'] as const;

export type ReplayLanguageBand = typeof LANGUAGE_LADDER[number];
export type ReplayCadence = 'daily' | 'weekly';

/** The New Game+ selector offers only higher layers that an authored memory supports. */
export function replayLanguageBands(scenes: readonly ReplaySceneDefinition[]): readonly Exclude<ReplayLanguageBand, 'foundation'>[] {
    const available = new Set(scenes.flatMap(scene => scene.availableLanguageBands
        .filter(band => LANGUAGE_LADDER.indexOf(band) > LANGUAGE_LADDER.indexOf(scene.introducedAt))));
    return LANGUAGE_LADDER.filter((band): band is Exclude<ReplayLanguageBand, 'foundation'> =>
        band !== 'foundation' && available.has(band));
}

export interface ReplaySceneDefinition {
    readonly id: string;
    readonly chapterId: string;
    /** Exact scene completion evidence; whole-chapter completion is not enough. */
    readonly completionSceneId: string;
    readonly introducedAt: ReplayLanguageBand;
    readonly availableLanguageBands: readonly ReplayLanguageBand[];
    readonly conceptIds: readonly string[];
    /** Existing activity evidence may add concepts to this exact authored scene. */
    readonly activityIds?: readonly string[];
    /** The completed lesson can be revisited independently of canon replay. */
    readonly lessonId?: string;
}

export interface ReplayPracticeTask {
    readonly id: string;
    readonly kind: 'srs-callback' | 'slice-of-life';
    readonly cadence: ReplayCadence;
    readonly sceneId: string;
    readonly chapterId: string;
    readonly languageBand: ReplayLanguageBand;
    readonly conceptIds: readonly string[];
    readonly reviewItemId?: string;
    readonly lessonId?: string;
    readonly practiceMemory: true;
    readonly canonicalWrites: false;
}

export interface ReplayPracticeDay {
    readonly localDay: string;
    readonly tasks: readonly ReplayPracticeTask[];
}

export interface ReplayPracticeOptions {
    readonly now: number;
    readonly targetLanguageBand: ReplayLanguageBand;
    readonly excludedSceneIds?: ReadonlySet<string>;
    readonly excludedReviewItemIds?: ReadonlySet<string>;
    readonly canon?: LanternAtlasCanon;
}

/**
 * Produces no prose and no plot branch. Every task is a memory of a completed
 * canonical scene, using independently mastered concepts and an authored
 * higher language layer. Selection is deterministic for a given date and log.
 */
export function projectDailyReplayPractice(
    events: readonly LearnerEvent[],
    scenes: readonly ReplaySceneDefinition[],
    options: ReplayPracticeOptions,
): ReplayPracticeDay {
    const canon = options.canon ?? LANTERN_ATLAS_CANON;
    validateReplayScenes(scenes, canon);
    const eligible = eligibleScenes(events, scenes, options.targetLanguageBand, canon)
        .filter(scene => !options.excludedSceneIds?.has(scene.id));
    const due = dueReviewItems(events, options.now)
        .filter(item => !options.excludedReviewItemIds?.has(item.reviewItemId));
    const callbacks = due.flatMap(item => eligible
        .filter(scene => sceneConceptIds(scene, events).includes(item.conceptId))
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(scene => createTask('srs-callback', 'daily', scene, options.targetLanguageBand, item.reviewItemId, events)));
    const callback = callbacks[0];
    const remaining = eligible.filter(scene => scene.id !== callback?.sceneId);
    const revisit = remaining.length
        ? createTask('slice-of-life', 'daily', remaining[stableIndex(options.now, remaining.length)]!, options.targetLanguageBand, undefined, events)
        : undefined;
    return Object.freeze({
        localDay: utcDay(options.now),
        tasks: Object.freeze([callback, revisit].filter((task): task is ReplayPracticeTask => Boolean(task))),
    });
}

/** Seven deterministic daily queues. A due SRS callback and a scene appear at most once per generated week. */
export function projectWeeklyReplayPractice(
    events: readonly LearnerEvent[],
    scenes: readonly ReplaySceneDefinition[],
    options: Omit<ReplayPracticeOptions, 'excludedSceneIds' | 'excludedReviewItemIds'>,
): readonly ReplayPracticeDay[] {
    const firstDay = Math.floor(options.now / DAY) * DAY;
    const usedScenes = new Set<string>();
    const usedReviews = new Set<string>();
    return Object.freeze(Array.from({ length: 7 }, (_, index) => {
        const day = projectDailyReplayPractice(events, scenes, {
            ...options,
            now: firstDay + index * DAY,
            excludedSceneIds: usedScenes,
            excludedReviewItemIds: usedReviews,
        });
        day.tasks.forEach(task => {
            usedScenes.add(task.sceneId);
            if (task.reviewItemId) usedReviews.add(task.reviewItemId);
        });
        return day;
    }));
}

function eligibleScenes(
    events: readonly LearnerEvent[],
    scenes: readonly ReplaySceneDefinition[],
    targetBand: ReplayLanguageBand,
    canon: LanternAtlasCanon,
): readonly ReplaySceneDefinition[] {
    // Placement may make a current-season scene canonical without backfilling
    // earlier chapters. That scene is a valid memory, while canon progression
    // itself remains the stricter contiguous projection.
    const completedChapters = new Set(projectStoryProgression(events, canon).recordedChapterIds);
    const completedScenes = new Set(events.flatMap(event =>
        event.kind === 'scene-completed' || event.kind === 'characters-encountered' ? [event.sceneId] : []));
    const mastered = masteredConceptIds(events);
    return scenes.filter(scene => completedChapters.has(scene.chapterId)
        && completedScenes.has(scene.completionSceneId)
        && isHigherLayer(scene, targetBand)
        && sceneConceptIds(scene, events).some(conceptId => mastered.has(conceptId)));
}

function masteredConceptIds(events: readonly LearnerEvent[]): ReadonlySet<string> {
    const attempts = new Map<string, Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }>[] >();
    events.forEach(event => {
        if (event.kind !== 'learning-evidence-recorded' || !event.independent) return;
        event.conceptIds.forEach(conceptId => {
            const entries = attempts.get(conceptId) ?? [];
            entries.push(event);
            attempts.set(conceptId, entries);
        });
    });
    return new Set([...attempts].flatMap(([conceptId, entries]) => {
        const ordered = [...entries].sort((left, right) => left.at - right.at || left.eventId.localeCompare(right.eventId));
        const passes = ordered.filter(entry => entry.outcome === 'pass');
        const days = new Set(passes.map(entry => utcDay(entry.at)));
        return passes.length >= 3 && days.size >= 2 && ordered.at(-1)?.outcome === 'pass' ? [conceptId] : [];
    }));
}

function dueReviewItems(events: readonly LearnerEvent[], now: number): readonly Extract<LearnerEvent, { kind: 'review-scheduled' }>[] {
    const latestSchedules = new Map<string, Extract<LearnerEvent, { kind: 'review-scheduled' }>>();
    activeReviewSchedules(events).forEach(schedule => {
        const previous = latestSchedules.get(schedule.reviewItemId);
        if (!previous || compareEvent(schedule, previous) > 0) latestSchedules.set(schedule.reviewItemId, schedule);
    });
    const latestRatings = new Map<string, Extract<LearnerEvent, { kind: 'review-rated' }>>();
    events.forEach(event => {
        if (event.kind !== 'review-rated') return;
        const previous = latestRatings.get(event.reviewItemId);
        if (!previous || compareEvent(event, previous) > 0) latestRatings.set(event.reviewItemId, event);
    });
    return [...latestSchedules.values()]
        .filter(schedule => schedule.dueAt <= now && compareEvent(latestRatings.get(schedule.reviewItemId), schedule) < 0)
        .sort((left, right) => left.dueAt - right.dueAt || left.reviewItemId.localeCompare(right.reviewItemId));
}

function createTask(
    kind: ReplayPracticeTask['kind'],
    cadence: ReplayCadence,
    scene: ReplaySceneDefinition,
    languageBand: ReplayLanguageBand,
    reviewItemId?: string,
    events: readonly LearnerEvent[] = [],
): ReplayPracticeTask {
    return Object.freeze({
        id: `${kind}:${scene.id}:${languageBand}${reviewItemId ? `:${reviewItemId}` : ''}`,
        kind,
        cadence,
        sceneId: scene.id,
        chapterId: scene.chapterId,
        languageBand,
        conceptIds: Object.freeze(sceneConceptIds(scene, events)),
        ...(reviewItemId ? { reviewItemId } : {}),
        ...(scene.lessonId ? { lessonId: scene.lessonId } : {}),
        practiceMemory: true as const,
        canonicalWrites: false as const,
    });
}

function validateReplayScenes(scenes: readonly ReplaySceneDefinition[], canon: LanternAtlasCanon): void {
    const ids = new Set<string>();
    scenes.forEach(scene => {
        if (!scene.id || ids.has(scene.id)) throw new TypeError('Replay scene IDs must be unique.');
        ids.add(scene.id);
        if (!canon.chapter(scene.chapterId)) throw new TypeError(`Replay scene ${scene.id} points outside finite canon.`);
        if (!scene.completionSceneId || (!scene.conceptIds.length && !scene.activityIds?.length) || !scene.availableLanguageBands.length) {
            throw new TypeError(`Replay scene ${scene.id} is missing its authored evidence contract.`);
        }
        if (!scene.availableLanguageBands.includes(scene.introducedAt)) {
            throw new TypeError(`Replay scene ${scene.id} must retain its introductory language layer.`);
        }
    });
}

function sceneConceptIds(scene: ReplaySceneDefinition, events: readonly LearnerEvent[]): readonly string[] {
    const activityIds = new Set(scene.activityIds ?? []);
    return [...new Set([
        ...scene.conceptIds,
        ...events.flatMap(event => event.kind === 'learning-evidence-recorded' && activityIds.has(event.activityId)
            ? event.conceptIds
            : []),
    ])].sort();
}

function isHigherLayer(scene: ReplaySceneDefinition, targetBand: ReplayLanguageBand): boolean {
    return scene.availableLanguageBands.includes(targetBand)
        && LANGUAGE_LADDER.indexOf(targetBand) > LANGUAGE_LADDER.indexOf(scene.introducedAt);
}

function compareEvent(
    left: Pick<LearnerEvent, 'at' | 'eventId'> | undefined,
    right: Pick<LearnerEvent, 'at' | 'eventId'> | undefined,
): number {
    if (!left) return right ? -1 : 0;
    if (!right) return 1;
    return left.at - right.at || left.eventId.localeCompare(right.eventId);
}

function stableIndex(now: number, length: number): number {
    const day = utcDay(now);
    return [...day].reduce((sum, character) => sum + character.charCodeAt(0), 0) % length;
}

function utcDay(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10);
}
