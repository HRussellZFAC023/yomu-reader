import { sessionCanResume } from '../access/gateway';
import type { ThemeSlot } from '../audio/types';
import type { LearnerProjection } from '../domain/learner-record';
import type { WorldPlaceId } from '../domain/world-locations';
import { worldLocationTheme } from '../vn/world-location-audio';
import type { AcademyCheckpoint, AcademyRoute } from '../persistence/indexeddb';
import type { AcademyNavigation } from '../ui/shell';
import {
    advancedPackageIdFromLessonId,
    resolveAdvancedCurriculumEntry,
} from '../content/advanced-curriculum';
import {
    ACADEMY_ROUTES,
    academyRouteKind,
    transitionAcademyRoute,
    type AcademyRouteTransition,
} from './route-history';

export const UNGROUNDED_ACTIVITY_ROUTES: ReadonlySet<AcademyRoute> = new Set(
    ACADEMY_ROUTES.filter(route => academyRouteKind(route) === 'legacy-ungrounded-activity'),
);

export function normalizeResumeCheckpoint(
    checkpoint: AcademyCheckpoint,
    projection: LearnerProjection,
    now: number,
    online: boolean,
    accountLinked: boolean,
): AcademyCheckpoint {
    const session = checkpoint.session;
    if (!session || !sessionCanResume(session, now, online)) {
        return {
            schemaVersion: 2,
            route: 'access',
            routeHistory: [],
            presentationMode: checkpoint.presentationMode,
            ...(checkpoint.authoredWeekProgress
                ? { authoredWeekProgress: checkpoint.authoredWeekProgress }
                : {}),
            ...(checkpoint.classroomExpressionProgress
                ? { classroomExpressionProgress: checkpoint.classroomExpressionProgress }
                : {}),
            ...(checkpoint.classroomInstructionProgress
                ? { classroomInstructionProgress: checkpoint.classroomInstructionProgress }
                : {}),
            ...(checkpoint.lessonZeroGreetingProgress
                ? { lessonZeroGreetingProgress: checkpoint.lessonZeroGreetingProgress }
                : {}),
            ...(checkpoint.lessonZeroVowelProgress
                ? { lessonZeroVowelProgress: checkpoint.lessonZeroVowelProgress }
                : {}),
            ...(checkpoint.lessonZeroVowelWritingProgress
                ? { lessonZeroVowelWritingProgress: checkpoint.lessonZeroVowelWritingProgress }
                : {}),
            updatedAt: now,
        };
    }
    // An invite session alone is not a credential: every invite path — paid
    // or reusable class code — must hold a Google-linked account before any
    // Academy profile, curriculum, media, or world route is reachable. Until
    // then the only destination past the invite screen is the sign-in gate.
    if (!accountLinked) {
        return checkpoint.route === 'profile-sync'
            ? checkpoint
            : transitionCheckpoint(checkpoint, { kind: 'reset', route: 'profile-sync' }, now);
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
    const advancedPackageId = normalized.route === 'source-activity'
        ? advancedPackageIdFromLessonId(normalized.lessonId)
        : undefined;
    if (advancedPackageId) {
        const entry = resolveAdvancedCurriculumEntry(advancedPackageId);
        if (normalized.activityId !== entry.activity.id) {
            normalized = { ...normalized, lessonId: entry.lessonId, activityId: entry.activity.id, updatedAt: now };
        }
    } else if (normalized.route === 'source-activity' && (!normalized.lessonId || !normalized.activityId)) {
        normalized = {
            ...transitionCheckpoint(normalized, { kind: 'replace', route: 'lesson-overview' }, now),
            lessonId: 'lesson:foundation-00',
            sectionId: undefined,
            activityId: undefined,
        };
    } else if (normalized.route === 'writing-practice'
        && projection.completedScenes.includes('scene:lesson-zero-writing-desk')) {
        normalized = {
            ...transitionCheckpoint(normalized, { kind: 'replace', route: 'lesson-overview' }, now),
            lessonId: 'lesson:foundation-00',
            sectionId: undefined,
            activityId: undefined,
        };
    } else if (normalized.route === 'band-entry') {
        normalized = transitionCheckpoint(normalized, { kind: 'replace', route: 'class' }, now);
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
    if (['classroom', 'cafe', 'lab', 'street', 'station', 'konbini', 'ramen', 'home', 'world'].includes(route)) return 'campus';
    if (route === 'lesson-overview') return 'class';
    if (route === 'campus' || route === 'class' || route === 'review' || route === 'journal') return route;
    return undefined;
}

export function globalNavigationIsAvailable(
    checkpoint: AcademyCheckpoint,
    hasProfile: boolean,
    accountLinked: boolean,
): boolean {
    return accountLinked && hasProfile && checkpoint.session !== undefined && checkpoint.route !== 'access';
}

export function themeForRoute(route: AcademyRoute, worldPlace?: WorldPlaceId): ThemeSlot {
    // Protected soundtrack requests begin only after the invite exchange has
    // established its HttpOnly session cookie. The first authenticated Rie
    // scene still receives the opening theme on the same user gesture.
    if (route === 'access') return 'silence';
    if (route === 'profile' || route === 'rie-unlock' || route === 'start') return 'opening.invitation';
    if (route === 'placement-mock' || route === 'placement-result') return 'silence';
    if (route === 'writing-practice') return 'challenge.kanji';
    if (route === 'campus') return 'world.courtyard';
    if (route === 'world') return worldPlace ? themeForWorldPlace(worldPlace) : 'unlock.world';
    if (route === 'street') return 'world.street';
    if (route === 'station') return 'world.station';
    if (route === 'konbini') return 'world.konbini';
    if (route === 'ramen') return 'world.ramen';
    if (route === 'cafe') return 'world.cafe';
    if (route === 'home') return 'world.home';
    if (route === 'class') return 'classroom.focus';
    if (route === 'lesson-overview') return 'classroom.focus';
    if (route === 'classroom') return 'world.classroom';
    if (route === 'lab') return 'world.lab';
    if (route === 'review') return 'world.library';
    if (route === 'journal' || route === 'profile-sync' || route === 'class-board') return 'bond.quiet';
    if (route === 'day-end') return 'support.kindness';
    return 'classroom.focus';
}

export function themeForWorldPlace(place: WorldPlaceId): ThemeSlot {
    return worldLocationTheme(place);
}
