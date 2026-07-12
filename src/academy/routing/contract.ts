import { sessionCanResume } from '../access/gateway';
import type { ThemeSlot } from '../audio/types';
import type { LearnerProjection } from '../domain/learner-record';
import type { AcademyCheckpoint, AcademyRoute } from '../persistence/indexeddb';
import type { AcademyNavigation } from '../ui/shell';

export function normalizeResumeCheckpoint(
    checkpoint: AcademyCheckpoint,
    projection: LearnerProjection,
    now: number,
    online: boolean,
): AcademyCheckpoint {
    const session = checkpoint.session;
    if (!session || !sessionCanResume(session, now, online)) {
        return { schemaVersion: 1, route: 'access', updatedAt: now };
    }
    let normalized = checkpoint;
    if (!projection.profile) normalized = { ...normalized, route: 'profile' };
    else if (normalized.route === 'access' || normalized.route === 'profile') normalized = { ...normalized, route: 'start' };
    if (normalized.route === 'rie-unlock' && !projection.profile) normalized = { ...normalized, route: 'profile' };
    if (normalized.route === 'placement-result' && !projection.latestPlacement) normalized = { ...normalized, route: 'placement-mock' };
    if (normalized.route === 'arrival-bridge' && !normalized.selectedBand) normalized = { ...normalized, route: 'start' };
    if (normalized.route === 'band-entry' && !normalized.selectedBand) {
        normalized = projection.curriculumEntry?.band
            ? { ...normalized, selectedBand: projection.curriculumEntry.band }
            : { ...normalized, route: 'start' };
    }
    if (normalized.route === 'source-activity' && projection.completedScenes.includes('scene:lesson-zero-first-repair')) {
        normalized = { ...normalized, route: 'aakash-meet' };
    }
    if (normalized.route === 'writing-practice' && projection.completedScenes.includes('scene:lesson-zero-writing-desk')) {
        normalized = { ...normalized, route: 'campus' };
    }
    return normalized;
}

export function navigationForRoute(route: AcademyRoute): AcademyNavigation | undefined {
    if (route === 'lab') return 'campus';
    if (route === 'campus' || route === 'review' || route === 'journal') return route;
    return undefined;
}

export function themeForRoute(route: AcademyRoute): ThemeSlot {
    if (route === 'access' || route === 'profile' || route === 'rie-unlock' || route === 'start') return 'opening.invitation';
    if (route === 'placement-mock' || route === 'placement-result') return 'silence';
    if (route === 'writing-practice') return 'challenge.kanji';
    if (route === 'campus') return 'campus.evening';
    if (route === 'lab') return 'lab.listening';
    if (route === 'review') return 'library.quiet';
    if (route === 'journal') return 'bond.quiet';
    return 'classroom.focus';
}
