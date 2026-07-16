import type { LearnerEvent } from './learner-record';
import {
    LANTERN_ATLAS_CANON,
    type LanternAtlasCanon,
    type LanternAtlasCanonChapter,
} from '../content/lantern-atlas-canon';

export interface StoryProgressionProjection {
    readonly canonId: string;
    /** Evidence for known canon chapters, including an out-of-order record. */
    readonly recordedChapterIds: readonly string[];
    /** Only the contiguous canonical prefix is allowed to change story state. */
    readonly completedChapterIds: readonly string[];
    readonly completedChapterCount: number;
    readonly nextChapter: LanternAtlasCanonChapter | null;
    readonly state: 'in-progress' | 'graduated';
    readonly replayAvailable: boolean;
    readonly canonicalWritesFromReplay: false;
}

/**
 * Canon progression is a projection of canonical completion evidence, never a
 * target that replay can write. A later recorded chapter cannot skip the
 * missing story between it and the learner's current canonical checkpoint.
 */
export function projectStoryProgression(
    events: readonly LearnerEvent[],
    canon: LanternAtlasCanon = LANTERN_ATLAS_CANON,
): StoryProgressionProjection {
    const recorded = new Set(events.flatMap(event => canonicalChapterEvidence(event, canon)));
    const completed: string[] = [];
    for (const chapter of canon.chapters) {
        if (!recorded.has(chapter.id)) break;
        completed.push(chapter.id);
    }
    const nextChapter = canon.chapters[completed.length] ?? null;
    return Object.freeze({
        canonId: canon.id,
        recordedChapterIds: Object.freeze(canon.chapters.filter(chapter => recorded.has(chapter.id)).map(chapter => chapter.id)),
        completedChapterIds: Object.freeze(completed),
        completedChapterCount: completed.length,
        nextChapter,
        state: nextChapter ? 'in-progress' : 'graduated',
        replayAvailable: completed.length > 0,
        canonicalWritesFromReplay: false,
    });
}

function canonicalChapterEvidence(event: LearnerEvent, canon: LanternAtlasCanon): readonly string[] {
    const value = event.kind === 'characters-encountered'
        ? event.encounterId
        : event.kind === 'scene-completed'
            ? event.sceneId
            : undefined;
    if (!value) return [];
    const chapter = canon.chapters.find(candidate =>
        value === `story:${candidate.id}`
        || value.startsWith(`story:${candidate.id}:scene:`)
        || value === `scene:story:${candidate.id}`);
    return chapter ? [chapter.id] : [];
}
