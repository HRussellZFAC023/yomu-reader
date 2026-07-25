import { projectLearnerRecord, type LearnerEvent } from '../../src/academy/domain/learner-record';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import {

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
    accountRequired: false,
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
        expect(themeForRoute('start')).toBe('opening.invitation');
        expect(themeForRoute('manual-band')).toBe('opening.invitation');
        expect(themeForRoute('arrival-bridge')).toBe('opening.invitation');
        expect(themeForRoute('placement-mock')).toBe('classroom.focus');
        expect(themeForRoute('placement-result')).toBe('classroom.focus');
    });

    it('resumes the one-time Rie meeting until it is complete, then keeps it out of the live route', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Mina', learningReason: 'Speak with friends', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const before = projectLearnerRecord([profile]);
        expect(normalizeResumeCheckpoint(checkpoint('profile'), before, 1_000, true, true).route).toBe('rie-unlock');
        expect(normalizeResumeCheckpoint(checkpoint('start'), before, 1_000, true, true).route).toBe('rie-unlock');
        expect(normalizeResumeCheckpoint(checkpoint('rie-unlock'), before, 1_000, true, true).route).toBe('rie-unlock');

        const introduction = event<Extract<LearnerEvent, { kind: 'characters-encountered' }>>({
            kind: 'characters-encountered',
            encounterId: 'opening-rie-introduction',
            sceneId: 'scene:opening-rie-introduction',
            attendeeIds: ['rie'],
        }, 2);
        const after = projectLearnerRecord([profile, introduction]);
        expect(normalizeResumeCheckpoint(checkpoint('rie-unlock'), after, 1_000, true, true).route).toBe('start');
        expect(normalizeResumeCheckpoint(checkpoint('profile'), after, 1_000, true, true).route).toBe('start');
    });

    it('cold-resumes a submitted placement result without requiring a canonical placement event', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Mina', learningReason: 'Speak', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const introduction = event<Extract<LearnerEvent, { kind: 'characters-encountered' }>>({
            kind: 'characters-encountered',
            encounterId: 'opening-rie-introduction',
            sceneId: 'scene:opening-rie-introduction',
            attendeeIds: ['rie'],
        }, 2);
        const placementProgress = {
            schemaVersion: 1 as const,
            step: 8,
            submitted: true,
            draft: {
                targetBand: 'n5' as const,
                responses: {},
                listeningModes: {},
                production: {
                    speaking: { mode: 'aloud' as const, completed: true, response: '', confidence: 0.5, rated: true },
                    writing: { mode: 'typed' as const, completed: true, response: 'ねこです。', confidence: 0.5, rated: true },
                },
            },
        };
        const projection = projectLearnerRecord([profile, introduction]);

        expect(normalizeResumeCheckpoint({
            ...checkpoint('placement-result'),
            placementProgress,
        }, projection, 1_000, true, true).route).toBe('placement-result');
        expect(normalizeResumeCheckpoint({
            ...checkpoint('placement-result'),
            placementProgress: { ...placementProgress, submitted: false },
        }, projection, 1_000, true, true).route).toBe('placement-mock');
    });

    it('restores a missing selected band from curriculum evidence', () => {
        const projection = projectLearnerRecord([
            event({
                kind: 'profile-changed',
                profile: { displayName: 'Mina', learningReason: 'Work', portraitId: 'quality-3' },
            } as LearnerEvent, 1),
            event({ kind: 'curriculum-entry-chosen', route: 'manual-band', band: 'n3' } as LearnerEvent, 2),
        ]);
        expect(normalizeResumeCheckpoint(checkpoint('band-entry'), projection, 1_000, true, true)).toMatchObject({
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

        expect(normalizeResumeCheckpoint(checkpoint('source-activity'), projectLearnerRecord([profile, sourceComplete]), 1_000, true, true))
            .toMatchObject({ route: 'lesson-overview', lessonId: 'lesson:foundation-00' });
        expect(normalizeResumeCheckpoint(checkpoint('writing-practice'), projectLearnerRecord([profile, writingComplete]), 1_000, true, true))
            .toMatchObject({ route: 'lesson-overview', lessonId: 'lesson:foundation-00' });
    });

    it('repairs an advanced checkpoint to its exact activity instead of falling back to Lesson 0', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Listen', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const normalized = normalizeResumeCheckpoint({
            ...checkpoint('source-activity'),
            selectedBand: 'n3',
            lessonId: 'advanced:n3-mock-listening-01-action',
            activityId: undefined,
        }, projectLearnerRecord([profile]), 1_000, true, true);

        expect(normalized).toMatchObject({
            route: 'source-activity',
            lessonId: 'advanced:n3-mock-listening-01-action',
            activityId: 'activity:n3-mock-listening-01-action',
        });
        expect(normalized.lessonId).not.toBe('lesson:foundation-00');
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

        expect(normalizeResumeCheckpoint(textCheckpoint, projection, 1_000, true, true)).toMatchObject({
            route: 'lesson-overview', selectedFork: 'text', lessonId: 'lesson:foundation-00',
        });
        expect(normalizeResumeCheckpoint(soundCheckpoint, projection, 1_000, true, true)).toMatchObject({
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

        expect(normalizeResumeCheckpoint({ ...checkpoint('source-activity'), selectedFork: 'sound' }, projection, 1_000, true, true).route)
            .toBe('lesson-overview');
        expect(normalizeResumeCheckpoint({ ...checkpoint('source-activity'), selectedFork: 'speaking' }, projection, 1_000, true, true).route)
            .toBe('lesson-overview');
    });

    it('returns to access when neither online nor offline session validity remains', () => {
        const expired = normalizeResumeCheckpoint(
            {
                ...checkpoint('campus'),
                routeHistory: [{ route: 'access' }, { route: 'profile' }, { route: 'start' }],
                authoredWeekProgress: {
                    'l1-l01': {
                        sourceSha256: '0'.repeat(64),
                        position: { phase: 'question', activityId: 'activity:one' },
                    },
                },
                classroomInstructionProgress: {
                    schemaVersion: 1,
                    sessionId: 'session:lesson-zero-follow-instructions',
                    status: 'paused',
                    cursor: 1,
                    passedCueIds: ['cue:lesson-zero-instruction:look'],
                    attempts: [{
                        cueId: 'cue:lesson-zero-instruction:look',
                        chosenActionId: 'look',
                        outcome: 'pass',
                        at: 100,
                    }],
                },
                lessonZeroDeskLanguageProgress: {
                    schemaVersion: 1,
                    sessionId: 'session:lesson-zero-desk-language',
                    status: 'paused',
                    stage: 'practice',
                    practiceIndex: 1,
                    transferIndex: 0,
                    practicePassedWordIds: ['homework'],
                    transferPassedWordIds: [],
                    attempts: [{
                        round: 'practice',
                        wordId: 'homework',
                        chosenPropId: 'take-home-sheet',
                        outcome: 'pass',
                        at: 100,
                    }],
                },
                lessonZeroGreetingProgress: {
                    schemaVersion: 1,
                    sessionId: 'session:lesson-zero-greet-rie',
                    status: 'paused',
                    stage: 'rehearse',
                    selectedChunkIds: ['evening', 'first-meeting', 'name', 'closing'],
                    arrangementAttempts: 1,
                    mode: 'typed',
                    attempts: [],
                },
                lessonZeroVowelProgress: {
                    schemaVersion: 1,
                    sessionId: 'session:lesson-zero-vowel-listen',
                    status: 'paused',
                    stage: 'learn',
                    variant: 'lesson',
                    mode: 'audio',
                    learnedItemIds: ['hira-a'],
                    roundOrder: [],
                    heardRoundIds: [],
                    selections: [],
                    repairItemIds: [],
                    repairCursor: 0,
                    baseCompleted: false,
                    bingoWins: 0,
                    attempts: [],
                },
                lessonZeroVowelWritingProgress: {
                    schemaVersion: 1,
                    sessionId: 'session:lesson-zero-vowel-doodle',
                    status: 'paused',
                    stage: 'attempt',
                    mode: 'plan',
                    learnedItemIds: ['hira-a'],
                    completedItemIds: [],
                    guideItemIds: [],
                    attempts: [],
                },
            },
            projectLearnerRecord([]),
            4_000,
            false,
            true,
        );
        expect(expired.route).toBe('access');
        expect(expired.routeHistory).toEqual([]);
        expect(expired.session).toBeUndefined();
        expect(expired.authoredWeekProgress).toEqual({
            'l1-l01': {
                sourceSha256: '0'.repeat(64),
                position: { phase: 'question', activityId: 'activity:one' },
            },
        });
        expect(expired.classroomInstructionProgress).toMatchObject({ status: 'paused', cursor: 1 });
        expect(expired.lessonZeroDeskLanguageProgress).toMatchObject({
            status: 'paused',
            stage: 'practice',
            practicePassedWordIds: ['homework'],
        });
        expect(expired.lessonZeroGreetingProgress).toMatchObject({ status: 'paused', stage: 'rehearse' });
        expect(expired.lessonZeroVowelProgress).toMatchObject({ status: 'paused', learnedItemIds: ['hira-a'] });
        expect(expired.lessonZeroVowelWritingProgress).toMatchObject({
            status: 'paused',
            stage: 'attempt',
            learnedItemIds: ['hira-a'],
        });
    });

    it('resumes the day-end pause without inventing lesson completion evidence', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const projection = projectLearnerRecord([profile]);

        expect(normalizeResumeCheckpoint(checkpoint('day-end'), projection, 1_000, true, true).route).toBe('day-end');
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
        expect(globalNavigationIsAvailable(checkpoint('source-activity'), true, true)).toBe(true);
        expect(globalNavigationIsAvailable(checkpoint('profile'), false, true)).toBe(false);
        expect(globalNavigationIsAvailable({ ...checkpoint('access'), session: undefined }, true, true)).toBe(false);
    });

    it('withholds global navigation until the session holds a Google-linked account', () => {
        expect(globalNavigationIsAvailable(checkpoint('source-activity'), true, false)).toBe(false);
        expect(globalNavigationIsAvailable(checkpoint('campus'), true, false)).toBe(false);
    });

    it('gates every resume path on a Google-linked account, including reusable class invites', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const projection = projectLearnerRecord([profile]);
        for (const route of ['campus', 'world', 'class', 'lesson-overview', 'profile', 'start', 'access'] as const) {
            const gated = normalizeResumeCheckpoint(checkpoint(route), projection, 1_000, true, false);
            expect(gated.route, route).toBe('profile-sync');
            expect(gated.session).toEqual(SESSION);
            expect(gated.routeHistory).toEqual([]);
        }
        // Offline resume without linked-account evidence is gated identically.
        expect(normalizeResumeCheckpoint(checkpoint('campus'), projectLearnerRecord([]), 2_500, false, false).route)
            .toBe('profile-sync');
        // An expired session still falls back to the invite screen first.
        expect(normalizeResumeCheckpoint(checkpoint('campus'), projection, 4_000, false, false).route).toBe('access');
    });

    it('keeps the sign-in gate stable while awaiting Google', () => {
        const gated = normalizeResumeCheckpoint(checkpoint('profile-sync'), projectLearnerRecord([]), 1_000, true, false);
        expect(gated.route).toBe('profile-sync');
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
        }, projection, 1_000, true, true);

        expect(resumed.route).toBe('campus');
        expect(resumed.routeHistory).toEqual([{ route: 'review' }]);
        expect(resumed.presentationMode).toBe('course');
    });
});
