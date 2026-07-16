import {
    transitionAcademyRoute,
    type AcademyRouteHistoryState,
} from '../../src/academy/routing/route-history';

function state(
    route: AcademyRouteHistoryState['route'] = 'class',
    routeHistory: AcademyRouteHistoryState['routeHistory'] = [],
    presentationMode: AcademyRouteHistoryState['presentationMode'] = 'story',
): AcademyRouteHistoryState {
    return { route, routeHistory, presentationMode };
}

describe('Academy route history', () => {
    it('pushes origins, ignores a same-route render and resumes from persisted state', () => {
        const opened = transitionAcademyRoute(state(), { kind: 'push', route: 'review' });
        expect(opened).toEqual({ route: 'review', routeHistory: [{ route: 'class' }], presentationMode: 'story' });

        const rerendered = transitionAcademyRoute(opened, { kind: 'push', route: 'review' });
        expect(rerendered).toBe(opened);

        const resumed = structuredClone(rerendered);
        expect(transitionAcademyRoute(resumed, { kind: 'back' })).toEqual(state('class'));
    });

    it('replaces without growing history and resets to a new safe floor', () => {
        const opened = state('review', [{ route: 'campus' }, { route: 'class' }]);
        expect(transitionAcademyRoute(opened, { kind: 'replace', route: 'journal' })).toEqual({
            route: 'journal',
            routeHistory: [{ route: 'campus' }, { route: 'class' }],
            presentationMode: 'story',
        });
        expect(transitionAcademyRoute(opened, { kind: 'reset', route: 'access' })).toEqual(state('access'));
    });

    it('does not pop below the safe floor', () => {
        const floor = state('access');
        expect(transitionAcademyRoute(floor, { kind: 'back' })).toBe(floor);
    });

    it('changes presentation without resetting route history or learner-facing navigation state', () => {
        const campus = {
            ...state('campus', [{ route: 'review' }]),
            selectedFork: 'sound' as const,
            session: { sessionId: 'still-valid' },
        };
        expect(transitionAcademyRoute(campus, { kind: 'presentation', mode: 'course' })).toEqual({
            route: 'class',
            routeHistory: [{ route: 'review' }],
            presentationMode: 'course',
            selectedFork: 'sound',
            session: { sessionId: 'still-valid' },
        });
        expect(transitionAcademyRoute({
            ...campus,
            route: 'class',
            presentationMode: 'course',
        }, { kind: 'presentation', mode: 'story' })).toEqual({
            route: 'campus',
            routeHistory: [{ route: 'review' }],
            presentationMode: 'story',
            selectedFork: 'sound',
            session: { sessionId: 'still-valid' },
        });

        const lesson = state('source-activity', [{ route: 'class' }], 'course');
        expect(transitionAcademyRoute(lesson, { kind: 'presentation', mode: 'story' })).toEqual({
            route: 'source-activity',
            routeHistory: [{ route: 'class' }],
            presentationMode: 'story',
        });
    });

    it('snapshots route context so Back restores a prior fork, band, lesson section and activity', () => {
        const overview = {
            ...state('source-activity'),
            selectedBand: 'n5' as const,
            selectedFork: 'text' as const,
            lessonId: 'lesson-zero',
            sectionId: 'overview',
            activityId: 'activity:overview',
            session: { sessionId: 'not-part-of-history' },
        };
        const focused = transitionAcademyRoute(overview, {
            kind: 'push',
            route: 'source-activity',
            context: {
                selectedBand: 'n4',
                selectedFork: 'sound',
                lessonId: 'lesson-one',
                sectionId: 'listening-2',
                activityId: 'activity:listening-2',
            },
        });

        expect(focused.routeHistory).toEqual([{
            route: 'source-activity',
            selectedBand: 'n5',
            selectedFork: 'text',
            lessonId: 'lesson-zero',
            sectionId: 'overview',
            activityId: 'activity:overview',
        }]);
        expect(focused.routeHistory[0]).not.toHaveProperty('session');
        expect(transitionAcademyRoute(focused, { kind: 'back' })).toEqual(overview);
    });

    it('restores Class after opening a lesson overview', () => {
        const opened = transitionAcademyRoute(state('class'), {
            kind: 'push',
            route: 'lesson-overview',
            context: { lessonId: 'lesson:foundation-00' },
        });
        expect(opened).toEqual({
            route: 'lesson-overview',
            routeHistory: [{ route: 'class' }],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
        });
        expect(transitionAcademyRoute(opened, { kind: 'back' })).toEqual(state('class'));
    });

    it('returns to an exact prior place without leaving Class and lesson frames behind', () => {
        const ramen = state('ramen', [{ route: 'campus' }]);
        const classPath = transitionAcademyRoute(ramen, { kind: 'push', route: 'class' });
        const lesson = transitionAcademyRoute(classPath, {
            kind: 'push',
            route: 'lesson-overview',
            context: { lessonId: 'authored-week:l1-l18' },
        });

        expect(transitionAcademyRoute(lesson, { kind: 'return', destination: { route: 'ramen' } })).toEqual(ramen);
    });

    it('returns to the exact generic world frame instead of collapsing it to a route name', () => {
        const museum = state('world', [{ route: 'street' }]);
        const museumFrame = { route: 'world' as const, worldPlace: 'museum' as const };
        const atMuseum = { ...museum, ...museumFrame };
        const classPath = transitionAcademyRoute(atMuseum, { kind: 'push', route: 'class' });
        const lesson = transitionAcademyRoute(classPath, {
            kind: 'push',
            route: 'lesson-overview',
            context: { lessonId: 'authored-week:l1-l17' },
        });

        expect(transitionAcademyRoute(lesson, { kind: 'return', destination: museumFrame })).toEqual(atMuseum);
    });

    it('keeps the exact Classroom frame when Class clears inherited lesson context', () => {
        const classroom = {
            ...state('classroom', [{ route: 'campus' }]),
            lessonId: 'lesson:foundation-00',
            sectionId: 'stale-section',
            activityId: 'stale-activity',
        };
        const classPath = transitionAcademyRoute(classroom, {
            kind: 'push',
            route: 'class',
            context: { lessonId: undefined, sectionId: undefined, activityId: undefined },
        });

        expect(classPath).toEqual({
            route: 'class',
            routeHistory: [
                { route: 'campus' },
                {
                    route: 'classroom',
                    lessonId: 'lesson:foundation-00',
                    sectionId: 'stale-section',
                    activityId: 'stale-activity',
                },
            ],
            presentationMode: 'story',
        });
        expect(transitionAcademyRoute(classPath, { kind: 'back' })).toEqual(classroom);
    });

    it('restores the prior Story episode through route history', () => {
        const list = state('story', [{ route: 'campus' }]);
        const episode = transitionAcademyRoute(list, {
            kind: 'push',
            route: 'story',
            context: { sectionId: 's1e01-the-blank-atlas' },
        });
        const next = transitionAcademyRoute(episode, {
            kind: 'push',
            route: 'story',
            context: { sectionId: 's1e02-margin-map' },
        });

        expect(next.routeHistory.at(-1)).toEqual({ route: 'story', sectionId: 's1e01-the-blank-atlas' });
        expect(transitionAcademyRoute(next, { kind: 'back' })).toEqual(episode);
    });

    it('persists Cafe as the current route and restores Campus through real Back history', () => {
        const cafe = transitionAcademyRoute(state('campus'), { kind: 'push', route: 'cafe' });

        expect(structuredClone(cafe)).toEqual({
            route: 'cafe',
            routeHistory: [{ route: 'campus' }],
            presentationMode: 'story',
        });
        expect(transitionAcademyRoute(cafe, { kind: 'presentation', mode: 'course' })).toMatchObject({
            route: 'cafe',
            routeHistory: [{ route: 'campus' }],
            presentationMode: 'course',
        });
        expect(transitionAcademyRoute(cafe, { kind: 'back' })).toEqual(state('campus'));
    });

    it('keeps street and station as distinct places so Back returns through the route actually travelled', () => {
        const street = transitionAcademyRoute(state('campus'), { kind: 'push', route: 'street' });
        const station = transitionAcademyRoute(street, { kind: 'push', route: 'station' });

        expect(station).toMatchObject({
            route: 'station',
            routeHistory: [{ route: 'campus' }, { route: 'street' }],
        });
        expect(transitionAcademyRoute(station, { kind: 'back' })).toEqual(street);
        expect(transitionAcademyRoute(street, { kind: 'back' })).toEqual(state('campus'));
    });

    it('keeps future registry places in one persisted world route and restores their exact location on Back', () => {
        const supermarket = transitionAcademyRoute(state('street'), {
            kind: 'push', route: 'world', context: { worldPlace: 'supermarket' },
        });
        const museum = transitionAcademyRoute(supermarket, {
            kind: 'push', route: 'world', context: { worldPlace: 'museum' },
        });

        expect(museum).toMatchObject({
            route: 'world',
            worldPlace: 'museum',
            routeHistory: [{ route: 'street' }, { route: 'world', worldPlace: 'supermarket' }],
        });
        expect(transitionAcademyRoute(museum, { kind: 'back' })).toEqual(supermarket);
    });
});
