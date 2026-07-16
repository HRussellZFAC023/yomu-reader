import { projectLearnerRecord, type LearnerEvent } from '../../src/academy/domain/learner-record';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import {
    AAKASH_CONTINUATION_ROUTE,
    globalNavigationIsAvailable,
    navigationForRoute,
    normalizeResumeCheckpoint,
    themeForRoute,
    themeForWorldPlace,
} from '../../src/academy/routing/contract';
import { AUTHORIZED_AUDIO_CATALOG } from '../../src/academy/audio/manifest';

const SESSION = {
    sessionId: 'session',
    expiresAt: 2_000,
    offlineResumeUntil: 3_000,
    source: 'local-qa' as const,
};

function checkpoint(route: AcademyCheckpoint['route']): AcademyCheckpoint {
    return {
        schemaVersion: 2,
        route,
        routeHistory: [],
        presentationMode: 'story',
        session: SESSION,
        updatedAt: 100,
    };
}

function event<T extends LearnerEvent>(value: Omit<T, 'schemaVersion' | 'eventId' | 'at'>, index: number): T {
    return { ...value, schemaVersion: 1, eventId: `event-${index}`, at: 100 + index } as T;
}

describe('Academy resume route contract', () => {
    it('does not request protected soundtrack media before invite authentication', () => {
        expect(themeForRoute('access')).toBe('silence');
        expect(themeForRoute('profile')).toBe('opening.invitation');
    });

    it('restores a missing selected band from curriculum evidence', () => {
        const projection = projectLearnerRecord([
            event({
                kind: 'profile-changed',
                profile: { displayName: 'Mina', learningReason: 'Work', portraitId: 'quality-3' },
            } as LearnerEvent, 1),
            event({ kind: 'curriculum-entry-chosen', route: 'manual-band', band: 'n3' } as LearnerEvent, 2),
        ]);
        expect(normalizeResumeCheckpoint(checkpoint('band-entry'), projection, 1_000, true)).toMatchObject({
            route: 'class',
            selectedBand: 'n3',
        });
    });

    it('migrates legacy one-task checkpoints into the complete lesson overview', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const sourceComplete = event({ kind: 'scene-completed', sceneId: 'scene:lesson-zero-first-repair' } as LearnerEvent, 2);
        const writingComplete = event({ kind: 'scene-completed', sceneId: 'scene:lesson-zero-writing-desk' } as LearnerEvent, 3);

        expect(normalizeResumeCheckpoint(checkpoint('source-activity'), projectLearnerRecord([profile, sourceComplete]), 1_000, true))
            .toMatchObject({ route: 'lesson-overview', lessonId: 'lesson:foundation-00' });
        expect(normalizeResumeCheckpoint(checkpoint('writing-practice'), projectLearnerRecord([profile, writingComplete]), 1_000, true))
            .toMatchObject({ route: 'lesson-overview', lessonId: 'lesson:foundation-00' });
    });

    it('returns from Aakash to campus while keeping writing practice optional', () => {
        expect(AAKASH_CONTINUATION_ROUTE).toBe('campus');
        expect(checkpoint('writing-practice').route).toBe('writing-practice');
    });

    it('preserves the chosen mission while returning legacy progress to the overview', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const textAttempt = event<Extract<LearnerEvent, { kind: 'attempt-recorded' }>>({
            kind: 'attempt-recorded',
            activityId: 'activity:lesson-zero-reconstruct-repair',
            sourceQuestionId: 'source-question:classroom-phrase-09',
            conceptIds: ['concept:classroom-repair-repeat'],
            responseKind: 'choice',
            outcome: 'pass',
        }, 2);
        const textCheckpoint = { ...checkpoint('source-activity'), selectedFork: 'text' as const };
        const soundCheckpoint = { ...checkpoint('source-activity'), selectedFork: 'sound' as const };
        const projection = projectLearnerRecord([profile, textAttempt]);

        expect(normalizeResumeCheckpoint(textCheckpoint, projection, 1_000, true)).toMatchObject({
            route: 'lesson-overview', selectedFork: 'text', lessonId: 'lesson:foundation-00',
        });
        expect(normalizeResumeCheckpoint(soundCheckpoint, projection, 1_000, true)).toMatchObject({
            route: 'lesson-overview', selectedFork: 'sound', lessonId: 'lesson:foundation-00',
        });
    });

    it('does not let old Sound/Speaking task state bypass the grounded lesson', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const soundAttempt = event<Extract<LearnerEvent, { kind: 'attempt-recorded' }>>({
            kind: 'attempt-recorded',
            activityId: 'activity:lesson-zero-first-repair:sound',
            sourceQuestionId: 'source-question:classroom-phrase-09',
            conceptIds: ['concept:classroom-repair-repeat'],
            responseKind: 'choice',
            outcome: 'pass',
        }, 2);
        const projection = projectLearnerRecord([profile, soundAttempt]);

        expect(normalizeResumeCheckpoint({ ...checkpoint('source-activity'), selectedFork: 'sound' }, projection, 1_000, true).route)
            .toBe('lesson-overview');
        expect(normalizeResumeCheckpoint({ ...checkpoint('source-activity'), selectedFork: 'speaking' }, projection, 1_000, true).route)
            .toBe('lesson-overview');
    });

    it('returns to access when neither online nor offline session validity remains', () => {
        const expired = normalizeResumeCheckpoint(
            { ...checkpoint('campus'), routeHistory: [{ route: 'access' }, { route: 'profile' }, { route: 'start' }] },
            projectLearnerRecord([]),
            4_000,
            false,
        );
        expect(expired.route).toBe('access');
        expect(expired.routeHistory).toEqual([]);
        expect(expired.session).toBeUndefined();
    });

    it('resumes the day-end pause without inventing lesson completion evidence', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const projection = projectLearnerRecord([profile]);

        expect(normalizeResumeCheckpoint(checkpoint('day-end'), projection, 1_000, true).route).toBe('day-end');
        expect(projection.completedScenes).toEqual([]);
        expect(themeForRoute('day-end')).toBe('support.kindness');
    });

    it('keeps Class inside the native overflow navigation and classroom audio state', () => {
        expect(navigationForRoute('class')).toBe('class');
        expect(themeForRoute('class')).toBe('classroom.focus');
    });

    it('gives every current place a distinct authorized theme and preserves world-place routing', () => {
        const places = [
            'courtyard', 'classroom', 'library', 'cafe', 'lab', 'street', 'station', 'konbini', 'ramen',
            'japan-centre', 'home', 'park', 'station-platform',
        ] as const;
        const themes = places.map(themeForWorldPlace);
        const tracks = themes.map(theme => AUTHORIZED_AUDIO_CATALOG[theme].music?.id);
        expect(new Set(themes).size).toBe(places.length);
        expect(new Set(tracks).size).toBe(places.length);
        expect(themeForRoute('world', 'station')).toBe('world.station');
        expect(themeForRoute('station')).toBe('world.station');
        expect(AUTHORIZED_AUDIO_CATALOG['world.station'].crossfadeMs).toBeGreaterThan(0);
        expect(themeForRoute('world', 'train')).toBe('silence');
    });

    it('keeps global destinations available on a focused activity after enrollment', () => {
        expect(globalNavigationIsAvailable(checkpoint('source-activity'), true)).toBe(true);
        expect(globalNavigationIsAvailable(checkpoint('profile'), false)).toBe(false);
        expect(globalNavigationIsAvailable({ ...checkpoint('access'), session: undefined }, true)).toBe(false);
    });

    it('preserves an explicit Campus visit while course view remains selected', () => {
        const projection = projectLearnerRecord([
            event({
                kind: 'profile-changed',
                profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
            } as LearnerEvent, 1),
        ]);
        const resumed = normalizeResumeCheckpoint({
            ...checkpoint('campus'),
            presentationMode: 'course',
            routeHistory: [{ route: 'review' }],
        }, projection, 1_000, true);

        expect(resumed.route).toBe('campus');
        expect(resumed.routeHistory).toEqual([{ route: 'review' }]);
        expect(resumed.presentationMode).toBe('course');
    });
});
