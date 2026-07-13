import { sessionCanResume } from '../access/gateway';
import type { ThemeSlot } from '../audio/types';
import type { LearnerProjection } from '../domain/learner-record';
import type { AcademyCheckpoint, AcademyRoute } from '../persistence/indexeddb';
import type { AcademyNavigation } from '../ui/shell';
import {
    ACADEMY_ROUTES,
    academyRouteKind,
    transitionAcademyRoute,
    type AcademyRouteTransition,
} from './route-history';

export const AAKASH_CONTINUATION_ROUTE: AcademyRoute = 'campus';

export const UNGROUNDED_ACTIVITY_ROUTES: ReadonlySet<AcademyRoute> = new Set(
    ACADEMY_ROUTES.filter(route => academyRouteKind(route) === 'legacy-ungrounded-activity'),
);

export function normalizeResumeCheckpoint(
    checkpoint: AcademyCheckpoint,
    projection: LearnerProjection,
    now: number,
    online: boolean,
): AcademyCheckpoint {
    const session = checkpoint.session;
    if (!session || !sessionCanResume(session, now, online)) {
        return {
            schemaVersion: 2,
            route: 'access',
            routeHistory: [],
            presentationMode: checkpoint.presentationMode,
            updatedAt: now,
        };
    }
    let normalized = checkpoint;
    if (!projection.profile) normalized = transitionCheckpoint(normalized, { kind: 'reset', route: 'profile' }, now);
    else if (normalized.route === 'access' || normalized.route === 'profile') {
        normalized = transitionCheckpoint(normalized, { kind: 'reset', route: 'start' }, now);
    }
    if (normalized.route === 'rie-unlock' && !projection.profile) {
        normalized = transitionCheckpoint(normalized, { kind: 'reset', route: 'profile' }, now);
    }
    if (normalized.route === 'placement-result' && !projection.latestPlacement) {
        normalized = transitionCheckpoint(normalized, { kind: 'replace', route: 'placement-mock' }, now);
    }
    if (normalized.route === 'arrival-bridge' && !normalized.selectedBand) {
        normalized = transitionCheckpoint(normalized, { kind: 'replace', route: 'start' }, now);
    }
    if (normalized.route === 'band-entry' && !normalized.selectedBand && projection.curriculumEntry?.band) {
        normalized = { ...normalized, selectedBand: projection.curriculumEntry.band, updatedAt: now };
    }
    if (['lesson-fork', 'source-activity', 'writing-practice'].includes(normalized.route)) {
        normalized = {
            ...transitionCheckpoint(normalized, { kind: 'replace', route: 'lesson-overview' }, now),
            lessonId: 'lesson:foundation-00',
            sectionId: undefined,
            activityId: undefined,
        };
    } else if (normalized.route === 'band-entry') {
        normalized = transitionCheckpoint(normalized, { kind: 'replace', route: 'class' }, now);
    } else if (normalized.route === 'aakash-meet' || normalized.route === 'lab') {
        normalized = transitionCheckpoint(normalized, { kind: 'replace', route: 'campus' }, now);
    }
    const routeHistory = normalized.routeHistory.filter(frame => !UNGROUNDED_ACTIVITY_ROUTES.has(frame.route));
    if (routeHistory.length !== normalized.routeHistory.length) {
        normalized = { ...normalized, routeHistory, updatedAt: now };
    }
    return normalized;
}

function transitionCheckpoint(
    checkpoint: AcademyCheckpoint,
    transition: AcademyRouteTransition,
    updatedAt: number,
): AcademyCheckpoint {
    const navigation = transitionAcademyRoute(checkpoint, transition);
    if (navigation === checkpoint) return checkpoint;
    return { ...checkpoint, ...navigation, schemaVersion: 2, updatedAt };
}

export function navigationForRoute(route: AcademyRoute): AcademyNavigation | undefined {
    if (route === 'lab') return 'campus';
    if (route === 'lesson-overview') return 'class';
    if (route === 'campus' || route === 'class' || route === 'review' || route === 'journal') return route;
    return undefined;
}

export function globalNavigationIsAvailable(checkpoint: AcademyCheckpoint, hasProfile: boolean): boolean {
    return hasProfile && checkpoint.session !== undefined && checkpoint.route !== 'access';
}

export function themeForRoute(route: AcademyRoute): ThemeSlot {
    // Protected soundtrack requests begin only after the invite exchange has
    // established its HttpOnly session cookie. The first authenticated Rie
    // scene still receives the opening theme on the same user gesture.
    if (route === 'access') return 'silence';
    if (route === 'profile' || route === 'rie-unlock' || route === 'start') return 'opening.invitation';
    if (route === 'placement-mock' || route === 'placement-result') return 'silence';
    if (route === 'writing-practice') return 'challenge.kanji';
    if (route === 'campus') return 'campus.evening';
    if (route === 'class') return 'classroom.focus';
    if (route === 'lesson-overview') return 'classroom.focus';
    if (route === 'lab') return 'lab.listening';
    if (route === 'review') return 'library.quiet';
    if (route === 'journal') return 'bond.quiet';
    if (route === 'day-end') return 'support.kindness';
    return 'classroom.focus';
}
