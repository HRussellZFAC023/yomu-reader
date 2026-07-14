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
});
