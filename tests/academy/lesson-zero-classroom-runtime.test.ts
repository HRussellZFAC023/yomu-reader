import fs from 'node:fs';
import path from 'node:path';
import { classroomActivityCompletionEvaluation, classroomProbeRecording, classroomStateForActivity, completedClassroomActivityIds, LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS, newlyCompletedClassroomActivityIds, restartClassroomActivity } from '../../src/academy/content/lesson-zero-classroom-runtime';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startClassroomExpressionSession, transitionClassroomExpressionSession } from '../../src/academy/domain/classroom-expression-session';
import { createLessonZeroDeskLanguageDefinition, LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID, LESSON_ZERO_DESK_LANGUAGE_CHILD_ACTIVITY_IDS, lessonZeroDeskLanguageCompletionEvaluation } from '../../src/academy/content/lesson-zero-desk-language';
import { lessonZeroDeskLanguageSessionSnapshotShapeIsValid, startLessonZeroDeskLanguageSession, transitionLessonZeroDeskLanguageSession } from '../../src/academy/domain/lesson-zero-desk-language-session';
import { createLessonZeroFollowInstructionDefinition, LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID, LESSON_ZERO_FOLLOW_INSTRUCTION_CHILD_ACTIVITY_IDS, lessonZeroFollowInstructionCompletionEvaluation } from '../../src/academy/content/lesson-zero-follow-instructions';
import { classroomInstructionCurrentCue, classroomInstructionSessionSnapshotShapeIsValid, startClassroomInstructionSession, transitionClassroomInstructionSession } from '../../src/academy/domain/classroom-instruction-session';
import { createLessonZeroGreetingDefinition } from '../../src/academy/content/lesson-zero-greeting';
import { lessonZeroGreetingSessionSnapshotShapeIsValid, startLessonZeroGreetingSession, transitionLessonZeroGreetingSession } from '../../src/academy/domain/lesson-zero-greeting-session';
import { describe, expect, it } from 'vitest';
import { createLessonZeroHiraganaDefinition } from '../../src/academy/content/lesson-zero-hiragana';
import { lessonZeroHiraganaChoices, lessonZeroHiraganaCurrentItem, lessonZeroHiraganaSessionSnapshotShapeIsValid, startLessonZeroHiraganaSession, transitionLessonZeroHiraganaSession, type LessonZeroHiraganaSessionState } from '../../src/academy/domain/lesson-zero-hiragana-session';
import { createLessonZeroNameCardDefinition } from '../../src/academy/content/lesson-zero-name-card';
import { lessonZeroNameCardLine, lessonZeroNameCardSessionSnapshotShapeIsValid, startLessonZeroNameCardSession, transitionLessonZeroNameCardSession, type LessonZeroNameCardDefinition } from '../../src/academy/domain/lesson-zero-name-card-session';
import { startRepeatRequestCoverageSession, transitionRepeatRequestCoverageSession, type RepeatRequestCoverageAction } from '../../src/academy/content/lesson-zero-repeat-request-coverage';
import { createLessonZeroRepeatRequestDefinition, LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID } from '../../src/academy/content/lesson-zero-repeat-request';
import { lessonZeroRepeatRequestSessionSnapshotShapeIsValid, startLessonZeroRepeatRequestSession, transitionLessonZeroRepeatRequestSession } from '../../src/academy/domain/lesson-zero-repeat-request-session';
import { createLessonZeroSentenceFrameDefinition } from '../../src/academy/content/lesson-zero-sentence-frames';
import { lessonZeroSentenceFrameSessionSnapshotShapeIsValid, startLessonZeroSentenceFrameSession, transitionLessonZeroSentenceFrameSession, type LessonZeroSentenceFrameSessionDefinition, type LessonZeroSentenceFrameSessionState } from '../../src/academy/domain/lesson-zero-sentence-frame-session';
import { createLessonZeroSoundDefinition } from '../../src/academy/content/lesson-zero-sound';
import { lessonZeroSoundSessionSnapshotShapeIsValid, startLessonZeroSoundSession, transitionLessonZeroSoundSession, type LessonZeroSoundDefinition, type LessonZeroSoundSessionState } from '../../src/academy/domain/lesson-zero-sound-session';
import { createLessonZeroVowelBingo, createLessonZeroVowelSoundMap } from '../../src/academy/content/lesson-zero-vowel-sound-map';
import { lessonZeroVowelResponse, lessonZeroVowelSessionSnapshotShapeIsValid, startLessonZeroVowelSession, transitionLessonZeroVowelSession } from '../../src/academy/domain/lesson-zero-vowel-session';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { LESSON_ZERO_VOWEL_WRITING_CHILD_ACTIVITY_IDS, LESSON_ZERO_VOWEL_WRITING_ID, createLessonZeroVowelWritingDefinition, evaluateLessonZeroVowelWriting, lessonZeroVowelWritingCompletionEvaluation, evaluateLessonZeroVowelWritingRecall } from '../../src/academy/content/lesson-zero-vowel-writing';
import { LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER, lessonZeroVowelWritingAveragePassScore, lessonZeroVowelWritingSessionSnapshotShapeIsValid, startLessonZeroVowelWritingSession, transitionLessonZeroVowelWritingSession } from '../../src/academy/domain/lesson-zero-vowel-writing-session';

const CLASSROOM_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function classroom() {
    return validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')));
}

describe('Lesson Zero classroom runtime bridge', () => {
    it('registers every completable classroom parent in the trusted-source evidence channel', () => {
        const registration = getCompleteLessonRegistration('lesson:foundation-00');
        expect(registration.releaseChannel).toBe('trusted-source');
        for (const activityId of LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS) {
            expect(registration.trustedActivityIds).toContain(activityId);
        }
    });

    it('starts the selected constructed activity at its first unresolved probe', () => {
        const definition = classroom();
        const positioned = classroomStateForActivity(
            definition,
            startClassroomExpressionSession(definition),
            'activity:lesson-zero-desk-language',
        );

        expect(positioned.cursor).toMatchObject({
            phaseId: 'desk-language',
            probeId: 'probe:classroom-13-homework',
        });
    });

    it('turns one source-linked response into idempotent evidence and a useful SRS seed', () => {
        const definition = classroom();
        const state = classroomStateForActivity(
            definition,
            startClassroomExpressionSession(definition),
            'activity:lesson-zero-desk-language',
        );
        const transition = transitionClassroomExpressionSession(definition, state, {
            kind: 'submit', response: 'しゅくだい',
        }, 100);
        const recording = classroomProbeRecording(definition, transition);

        expect(recording).toMatchObject({
            bindingActivityId: 'activity:lesson-zero-desk-language',
            evaluation: {
                attempt: {
                    eventId: expect.stringContaining('probe:classroom-13-homework:attempt:1'),
                    activityId: 'probe:classroom-13-homework',
                    sourceQuestionId: 'source-question:classroom-phrase-13',
                    outcome: 'pass',
                },
                reviewSeeds: [{
                    id: 'review:lesson-zero:classroom-13-homework',
                    content: {
                        expression: 'しゅくだい',
                        reading: 'しゅくだい',
                        meanings: ['homework'],
                    },
                }],
            },
            adaptive: {
                eventId: expect.stringContaining(':learning'),
                independent: true,
            },
        });
    });

    it('closes only the construct-matched parent set after all of its probes pass', () => {
        const definition = classroom();
        const answers = new Map(definition.expressions.flatMap(expression =>
            expression.probes.map(probe => [probe.id, probe.modelAnswer] as const)));
        let state = classroomStateForActivity(
            definition,
            startClassroomExpressionSession(definition),
            'activity:lesson-zero-desk-language',
        );
        const initial = state;
        let at = 200;
        while (!completedClassroomActivityIds(definition, state)
            .includes('activity:lesson-zero-desk-language')) {
            state = transitionClassroomExpressionSession(definition, state, {
                kind: 'submit', response: answers.get(state.cursor.probeId)!,
            }, at++).state;
        }

        expect(newlyCompletedClassroomActivityIds(definition, initial, state))
            .toEqual(['activity:lesson-zero-desk-language']);
        expect(completedClassroomActivityIds(definition, state))
            .not.toContain('activity:lesson-zero-follow-instructions');

        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
        const activity = lesson.activities.find(candidate =>
            candidate.id === 'activity:lesson-zero-desk-language')!;
        expect(classroomActivityCompletionEvaluation(activity, 300).attempt).toMatchObject({
            eventId: 'session:lesson-zero-classroom-expressions:activity:lesson-zero-desk-language:complete',
            activityId: activity.id,
            outcome: 'pass',
        });
    });

    it('replays one classroom set without erasing progress from its sibling set', () => {
        const definition = classroom();
        const answers = new Map(definition.expressions.flatMap(expression =>
            expression.probes.map(probe => [probe.id, probe.modelAnswer] as const)));
        let state = classroomStateForActivity(
            definition,
            startClassroomExpressionSession(definition),
            'activity:lesson-zero-follow-instructions',
        );
        state = transitionClassroomExpressionSession(definition, state, {
            kind: 'submit', response: answers.get(state.cursor.probeId)!,
        }, 400).state;
        const siblingProbeId = 'probe:classroom-01-start';
        state = classroomStateForActivity(definition, state, 'activity:lesson-zero-desk-language');
        while (!completedClassroomActivityIds(definition, state)
            .includes('activity:lesson-zero-desk-language')) {
            state = transitionClassroomExpressionSession(definition, state, {
                kind: 'submit', response: answers.get(state.cursor.probeId)!,
            }, 401 + state.attempts.length).state;
        }

        const replay = restartClassroomActivity(
            definition,
            state,
            'activity:lesson-zero-desk-language',
        );

        expect(replay.cursor.probeId).toBe('probe:classroom-13-homework');
        expect(replay.passedProbeIds).toContain(siblingProbeId);
        expect(replay.passedProbeIds).not.toContain('probe:classroom-13-homework');
        expect(replay.attempts.some(attempt => attempt.probeId === siblingProbeId)).toBe(true);
    });
});

describe('lesson-zero-desk-language-session behavior', () => {
    const CLASSROOM_PATH = path.resolve(
        'public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json',
    );
    
    const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
    
    function fixture() {
        const classroom = validateLessonZeroClassroomExpressions(
            JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')),
        );
        const lesson = validateLessonZeroPackage(
            JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8')),
        ).lesson;
        const activity = lesson.activities.find(candidate =>
            candidate.id === LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID)!;
        return {
            activity,
            definition: createLessonZeroDeskLanguageDefinition(classroom, activity),
        };
    }
    
    function reachPractice() {
        const { definition } = fixture();
        let state = transitionLessonZeroDeskLanguageSession(
            definition,
            startLessonZeroDeskLanguageSession(definition),
            { kind: 'start' },
            1,
        ).state;
        state = transitionLessonZeroDeskLanguageSession(
            definition,
            state,
            { kind: 'next-introduction' },
            2,
        ).state;
        state = transitionLessonZeroDeskLanguageSession(
            definition,
            state,
            { kind: 'next-introduction' },
            3,
        ).state;
        return { definition, state };
    }
    
    describe('Lesson Zero desk-language session', () => {
        it('grounds exactly two useful desk labels before asking for retrieval', () => {
            const { activity, definition } = fixture();
            expect(definition.words).toEqual([
                expect.objectContaining({
                    id: 'homework',
                    japanese: 'しゅくだい',
                    reading: 'しゅくだい',
                    soundCue: 'shu-ku-dai',
                    propId: 'take-home-sheet',
                }),
                expect.objectContaining({
                    id: 'example',
                    japanese: 'れい',
                    reading: 'れい',
                    soundCue: 'rei',
                    propId: 'worked-example',
                }),
            ]);
            expect(definition.practiceOrder).toEqual(['homework', 'example']);
            expect(definition.transferOrder).toEqual(['example', 'homework']);
            expect(getCompleteLessonRegistration('lesson:foundation-00').trustedActivityIds)
                .toEqual(expect.arrayContaining([
                    LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID,
                    ...LESSON_ZERO_DESK_LANGUAGE_CHILD_ACTIVITY_IDS,
                ]));
            expect(lessonZeroDeskLanguageCompletionEvaluation(activity, definition, 50).attempt)
                .toMatchObject({
                    activityId: LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID,
                    responseKind: 'object-labels',
                    outcome: 'pass',
                });
        });
    
        it('introduces each prop before practice and repairs only the confused label', () => {
            const { definition, state: practice } = reachPractice();
            expect(practice).toMatchObject({
                status: 'active',
                stage: 'practice',
                practiceIndex: 0,
            });
    
            const lapse = transitionLessonZeroDeskLanguageSession(
                definition,
                practice,
                { kind: 'choose-prop', propId: 'worked-example' },
                4,
            );
            expect(lapse).toMatchObject({
                state: { stage: 'practice-repair', practiceIndex: 0 },
                attempt: {
                    round: 'practice',
                    wordId: 'homework',
                    outcome: 'lapse',
                    errorTag: 'desk-language-homework-confused-with-example',
                },
                supportEvents: [{ supportKind: 'hint', choiceId: 'homework' }],
            });
            expect(lapse.evaluation?.reviewSeeds).toEqual([]);
    
            let state = transitionLessonZeroDeskLanguageSession(
                definition,
                lapse.state,
                { kind: 'begin-retry' },
                5,
            ).state;
            const repaired = transitionLessonZeroDeskLanguageSession(
                definition,
                state,
                { kind: 'choose-prop', propId: 'take-home-sheet' },
                6,
            );
            expect(repaired.state).toMatchObject({
                stage: 'practice',
                practiceIndex: 1,
                practicePassedWordIds: ['homework'],
            });
            expect(repaired.adaptive).toMatchObject({
                skill: 'listening',
                action: 'repair',
                independent: false,
            });
            expect(repaired.evaluation?.reviewSeeds).toEqual([
                expect.objectContaining({
                    id: 'review:lesson-zero:classroom-13-homework',
                    reason: 'repair',
                }),
            ]);
    
            state = transitionLessonZeroDeskLanguageSession(
                definition,
                repaired.state,
                { kind: 'choose-prop', propId: 'worked-example' },
                7,
            ).state;
            expect(state).toMatchObject({
                stage: 'transfer-ready',
                practiceIndex: 2,
                practicePassedWordIds: ['homework', 'example'],
            });
        });
    
        it('changes the prop order for transfer without scheduling either word twice', () => {
            const { definition, state: initial } = reachPractice();
            let transition = transitionLessonZeroDeskLanguageSession(
                definition,
                initial,
                { kind: 'choose-prop', propId: 'take-home-sheet' },
                4,
            );
            expect(transition.evaluation?.reviewSeeds).toHaveLength(1);
            transition = transitionLessonZeroDeskLanguageSession(
                definition,
                transition.state,
                { kind: 'choose-prop', propId: 'worked-example' },
                5,
            );
            expect(transition.evaluation?.reviewSeeds).toHaveLength(1);
    
            let state = transitionLessonZeroDeskLanguageSession(
                definition,
                transition.state,
                { kind: 'begin-transfer' },
                6,
            ).state;
            transition = transitionLessonZeroDeskLanguageSession(
                definition,
                state,
                { kind: 'choose-prop', propId: 'worked-example' },
                7,
            );
            expect(transition.evaluation?.reviewSeeds).toEqual([]);
            state = transition.state;
            transition = transitionLessonZeroDeskLanguageSession(
                definition,
                state,
                { kind: 'choose-prop', propId: 'take-home-sheet' },
                8,
            );
            expect(transition.state).toMatchObject({
                status: 'complete',
                stage: 'complete',
                transferIndex: 2,
                transferPassedWordIds: ['example', 'homework'],
            });
            expect(transition.evaluation?.reviewSeeds).toEqual([]);
            expect(transition.adaptive).toMatchObject({
                skill: 'transfer',
                action: 'transfer',
                independent: true,
            });
        });
    
        it('round-trips a pause and rejects impossible progress snapshots', () => {
            const { definition, state } = reachPractice();
            const paused = transitionLessonZeroDeskLanguageSession(
                definition,
                state,
                { kind: 'pause' },
                4,
            ).state;
            expect(startLessonZeroDeskLanguageSession(definition, paused)).toEqual(paused);
            expect(lessonZeroDeskLanguageSessionSnapshotShapeIsValid({
                ...paused,
                practiceIndex: -1,
            })).toBe(false);
            expect(() => startLessonZeroDeskLanguageSession(definition, {
                ...paused,
                status: 'complete',
                stage: 'complete',
            })).toThrow('does not match');
        });
    });
});

describe('lesson-zero-follow-instructions behavior', () => {
    const CLASSROOM_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');
    
    const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
    
    function fixture() {
        const classroom = validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')));
        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
        const activity = lesson.activities.find(candidate => candidate.id === LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID)!;
        return {
            activity,
            definition: createLessonZeroFollowInstructionDefinition(classroom, activity),
        };
    }
    
    describe('Lesson Zero follow-instructions runtime', () => {
        it('builds seven source-linked listening cues and registers the child and parent evidence ids', () => {
            const { definition } = fixture();
            expect(definition.cues).toHaveLength(7);
            expect(definition.cues.map(cue => cue.actionId)).toEqual([
                'begin', 'finish', 'break', 'look', 'say-together', 'listen', 'write',
            ]);
            expect(definition.recallActionOrder).toEqual([
                'look', 'begin', 'write', 'break', 'listen', 'finish', 'say-together',
            ]);
            expect(new Set(definition.cues.map(cue => cue.sourceQuestionId)).size).toBe(7);
            expect(new Set(definition.cues.map(cue => cue.japanese)).size).toBe(7);
            expect(new Set(definition.cues.map(cue => cue.voiceBindingId)).size).toBe(7);
            const registration = getCompleteLessonRegistration('lesson:foundation-00');
            expect(registration.trustedActivityIds).toContain(LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID);
            for (const activityId of LESSON_ZERO_FOLLOW_INSTRUCTION_CHILD_ACTIVITY_IDS) {
                expect(registration.trustedActivityIds).toContain(activityId);
            }
        });
    
        it('keeps a missed instruction open, earns transcript support, then records repaired listening', () => {
            const { definition } = fixture();
            let state = transitionClassroomInstructionSession(
                definition,
                startClassroomInstructionSession(definition),
                { kind: 'start' },
                10,
            ).state;
            expect(state.stage).toBe('teach');
            expect(transitionClassroomInstructionSession(
                definition,
                state,
                { kind: 'choose', actionId: 'begin' },
                11,
            ).evaluation).toBeUndefined();
            state = transitionClassroomInstructionSession(
                definition,
                state,
                { kind: 'introduce' },
                12,
            ).state;
            const missed = transitionClassroomInstructionSession(definition, state, { kind: 'choose', actionId: 'break' }, 20);
            expect(missed.state.cursor).toBe(0);
            expect(missed.state.stage).toBe('practice-repair');
            expect(missed.evaluation).toMatchObject({
                attempt: {
                    activityId: `${LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID}:begin`,
                    sourceQuestionId: 'source-question:classroom-phrase-01',
                    outcome: 'lapse',
                },
                reviewSeeds: [],
            });
            expect(missed.supportEvents.map(event => event.supportKind)).toEqual(['transcript', 'translation']);
    
            state = transitionClassroomInstructionSession(
                definition,
                missed.state,
                { kind: 'begin-retry' },
                25,
            ).state;
            const repaired = transitionClassroomInstructionSession(definition, state, { kind: 'choose', actionId: 'begin' }, 30);
            expect(repaired.state.cursor).toBe(1);
            expect(repaired.state.stage).toBe('teach');
            expect(repaired.adaptive).toMatchObject({ action: 'repair', independent: false });
            expect(repaired.evaluation?.reviewSeeds[0]).toMatchObject({
                id: 'review:lesson-zero:instruction:begin',
                reason: 'repair',
                content: { expression: 'はじめましょう', meanings: ["Let's begin."] },
            });
        });
    
        it('completes only after supported practice and delayed mixed recall of all seven moves', () => {
            const { activity, definition } = fixture();
            let state = transitionClassroomInstructionSession(
                definition,
                startClassroomInstructionSession(definition),
                { kind: 'start' },
                100,
            ).state;
            let at = 101;
            for (const cue of definition.cues) {
                state = transitionClassroomInstructionSession(
                    definition,
                    state,
                    { kind: 'introduce' },
                    at++,
                ).state;
                state = transitionClassroomInstructionSession(
                    definition,
                    state,
                    { kind: 'choose', actionId: cue.actionId },
                    at++,
                ).state;
            }
            expect(state).toMatchObject({ status: 'active', stage: 'recall', cursor: 7 });
            expect(state.passedCueIds).toHaveLength(7);
            expect(state.recalledCueIds).toEqual([]);
            for (const actionId of definition.recallActionOrder) {
                expect(classroomInstructionCurrentCue(definition, state)?.actionId).toBe(actionId);
                const transition = transitionClassroomInstructionSession(
                    definition,
                    state,
                    { kind: 'choose', actionId },
                    at++,
                );
                expect(transition.round).toBe('recall');
                expect(transition.adaptive).toMatchObject({ action: 'recall', independent: true });
                expect(transition.evaluation?.reviewSeeds).toEqual([]);
                state = transition.state;
            }
            expect(state).toMatchObject({ status: 'complete', stage: 'complete', cursor: 7 });
            expect(state.recalledCueIds).toHaveLength(7);
            expect(lessonZeroFollowInstructionCompletionEvaluation(activity, 200).attempt).toMatchObject({
                eventId: `${LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID}:complete`,
                activityId: LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID,
                responseKind: 'scene-actions',
                outcome: 'pass',
            });
        });
    
        it('migrates an earned legacy completion without discarding learner progress', () => {
            const { definition } = fixture();
            const legacy = {
                schemaVersion: 1 as const,
                sessionId: 'session:lesson-zero-follow-instructions' as const,
                status: 'complete' as const,
                cursor: 7,
                passedCueIds: definition.cues.map(cue => cue.id),
                attempts: definition.cues.map((cue, index) => ({
                    cueId: cue.id,
                    chosenActionId: cue.actionId,
                    outcome: 'pass' as const,
                    at: index + 1,
                })),
            };
            const restored = startClassroomInstructionSession(definition, legacy);
            expect(restored).toMatchObject({ status: 'complete', stage: 'complete' });
            expect(restored.recalledCueIds).toHaveLength(7);
        });
    
        it('rejects malformed persisted progress at the storage boundary', () => {
            expect(classroomInstructionSessionSnapshotShapeIsValid({
                schemaVersion: 1,
                sessionId: 'session:lesson-zero-follow-instructions',
                status: 'active',
                cursor: -1,
                passedCueIds: [],
                attempts: [],
            })).toBe(false);
        });
    });
});

describe('lesson-zero-greeting-session behavior', () => {
    function definition() {
        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
            'utf8',
        ))).lesson;
        return createLessonZeroGreetingDefinition(
            lesson.activities.find(activity => activity.id === 'activity:lesson-zero-greet-rie')!,
            'Henry',
        );
    }
    
    function arrangedState() {
        const content = definition();
        let state = transitionLessonZeroGreetingSession(
            content,
            startLessonZeroGreetingSession(content),
            { kind: 'start' },
            1,
        ).state;
        for (const chunkId of ['evening', 'first-meeting', 'name', 'closing'] as const) {
            state = transitionLessonZeroGreetingSession(content, state, { kind: 'select-chunk', chunkId }, 2).state;
        }
        return {
            content,
            state: transitionLessonZeroGreetingSession(content, state, { kind: 'check-arrangement' }, 3).state,
        };
    }
    
    describe('Lesson Zero first greeting session', () => {
    
        it('keeps arrangement instructional and assesses the independent greeting', () => {
            const content = definition();
            let state = transitionLessonZeroGreetingSession(
                content,
                startLessonZeroGreetingSession(content),
                { kind: 'start' },
                1,
            ).state;
            for (const chunkId of ['closing', 'name', 'first-meeting', 'evening'] as const) {
                state = transitionLessonZeroGreetingSession(content, state, { kind: 'select-chunk', chunkId }, 2).state;
            }
            const wrong = transitionLessonZeroGreetingSession(content, state, { kind: 'check-arrangement' }, 3);
            expect(wrong.arrangementCorrect).toBe(false);
            expect(wrong.evaluation).toBeUndefined();
            expect(wrong.state.stage).toBe('arrange');
        });
    
        it('records a transparent lapse, earned supports, repair and four SRS memories', () => {
            const { content, state: arranged } = arrangedState();
            let state = transitionLessonZeroGreetingSession(
                content,
                arranged,
                { kind: 'choose-mode', mode: 'typed' },
                4,
            ).state;
            const lapse = transitionLessonZeroGreetingSession(
                content,
                state,
                { kind: 'submit-typed', response: 'はじめまして。Henryです。' },
                5,
            );
            expect(lapse.evaluation).toMatchObject({
                attempt: {
                    activityId: 'activity:lesson-zero-greet-rie',
                    responseKind: 'typed-accessible-speaking-alternative',
                    outcome: 'lapse',
                    errorTags: ['greeting-order'],
                },
            });
            expect(lapse.supportEvents.map(event => event.supportKind)).toEqual([
                'transcript',
                'translation',
                'model-answer',
            ]);
            expect(lapse.evaluation?.reviewSeeds).toEqual([]);
    
            state = lapse.state;
            const repaired = transitionLessonZeroGreetingSession(
                content,
                state,
                {
                    kind: 'submit-typed',
                    response: 'こんばんは。はじめまして。 Henry です。よろしくお願いします。',
                },
                6,
            );
            expect(repaired.state.status).toBe('complete');
            expect(repaired.evaluation?.reviewSeeds).toHaveLength(4);
            expect(repaired.evaluation?.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
            expect(repaired.adaptive).toMatchObject({ skill: 'writing', action: 'repair', independent: false });
        });
    
        it('accepts a recorded take only after both learner checks are explicit', () => {
            const { content, state: arranged } = arrangedState();
            let state = transitionLessonZeroGreetingSession(
                content,
                arranged,
                { kind: 'choose-mode', mode: 'recorded' },
                4,
            ).state;
            const lapse = transitionLessonZeroGreetingSession(
                content,
                state,
                { kind: 'submit-self-check', greetingOrder: true, nameIntelligible: false },
                5,
            );
            expect(lapse.evaluation?.attempt).toMatchObject({ outcome: 'lapse', errorTags: ['name-intelligibility'] });
            state = lapse.state;
            const pass = transitionLessonZeroGreetingSession(
                content,
                state,
                { kind: 'submit-self-check', greetingOrder: true, nameIntelligible: true },
                6,
            );
            expect(pass.evaluation?.attempt.responseKind).toBe('spoken-self-check');
            expect(pass.adaptive).toMatchObject({ skill: 'speaking', action: 'repair' });
        });
    
        it('round-trips paused snapshots and rejects impossible complete snapshots', () => {
            const { content, state } = arrangedState();
            const paused = transitionLessonZeroGreetingSession(content, state, { kind: 'pause' }, 4).state;
            expect(startLessonZeroGreetingSession(content, paused)).toEqual(paused);
            expect(lessonZeroGreetingSessionSnapshotShapeIsValid({ ...paused, status: 'complete' })).toBe(false);
            expect(lessonZeroGreetingSessionSnapshotShapeIsValid({ ...paused, stage: 'complete' })).toBe(false);
        });
    });
});

describe('lesson-zero-hiragana-session behavior', () => {
    describe('Lesson Zero full hiragana route', () => {
    
        it('drills every row, requeues lapses, and schedules all 46 only after cumulative recall', () => {
            const definition = createLessonZeroHiraganaDefinition();
            let state = startLessonZeroHiraganaSession(definition);
            state = step(definition, state, { kind: 'start-guided' });
            state = step(definition, state, { kind: 'begin-row' });
    
            const first = lessonZeroHiraganaCurrentItem(definition, state)!;
            const lapse = transitionLessonZeroHiraganaSession(
                definition,
                state,
                { kind: 'answer', response: 'wrong' },
                4,
            );
            expect(lapse.evaluation?.result.outcome).toBe('lapse');
            expect(lapse.state.queue.at(-1)).toBe(first.id);
            expect(lapse.state.repairedItemIds).toContain(first.id);
            state = lapse.state;
    
            while (state.stage !== 'mastery-ready') {
                if (state.stage === 'row-preview') state = step(definition, state, { kind: 'begin-row' });
                else if (state.stage === 'row-drill') {
                    const item = lessonZeroHiraganaCurrentItem(definition, state)!;
                    state = step(definition, state, { kind: 'answer', response: item.romaji });
                } else if (state.stage === 'row-result') state = step(definition, state, { kind: 'next-row' });
                else throw new Error(`Unexpected stage: ${state.stage}`);
            }
            expect(state.guidedPassedItemIds).toHaveLength(46);
    
            state = step(definition, state, { kind: 'begin-mastery' });
            let completion;
            while (state.stage === 'mastery') {
                const item = lessonZeroHiraganaCurrentItem(definition, state)!;
                const transition = transitionLessonZeroHiraganaSession(
                    definition,
                    state,
                    { kind: 'answer', response: item.romaji },
                    10_000 + state.attempts.length,
                );
                state = transition.state;
                completion = transition.completionEvaluation ?? completion;
            }
    
            expect(state.status).toBe('complete');
            expect(state.masteryPassedItemIds).toHaveLength(46);
            expect(completion?.reviewSeeds).toHaveLength(46);
            expect(completion?.reviewSeeds.find(seed => seed.id.endsWith(first.id))?.reason).toBe('repair');
            expect(completion?.reviewSeeds.every(seed => seed.schedule?.dueAfterMs === 86_400_000)).toBe(true);
            expect(lessonZeroHiraganaSessionSnapshotShapeIsValid(state)).toBe(true);
        });
    
        it('lets an experienced learner take the full placement check without repeating guided rows', () => {
            const definition = createLessonZeroHiraganaDefinition();
            let state = startLessonZeroHiraganaSession(definition);
            state = step(definition, state, { kind: 'start-placement' });
            expect(state.stage).toBe('mastery-ready');
            expect(state.guidedPassedItemIds).toEqual([]);
    
            state = step(definition, state, { kind: 'begin-mastery' });
            while (state.stage === 'mastery') {
                const item = lessonZeroHiraganaCurrentItem(definition, state)!;
                state = step(definition, state, { kind: 'answer', response: item.romaji });
            }
    
            expect(state).toMatchObject({
                route: 'placement',
                status: 'complete',
                stage: 'complete',
            });
            expect(state.masteryPassedItemIds).toHaveLength(46);
        });
    
        it('keeps deterministic, compact row choices and survives pause/resume', () => {
            const definition = createLessonZeroHiraganaDefinition();
            let state = startLessonZeroHiraganaSession(definition);
            state = step(definition, state, { kind: 'start-guided' });
            state = step(definition, state, { kind: 'begin-row' });
            const current = lessonZeroHiraganaCurrentItem(definition, state)!;
    
            expect(lessonZeroHiraganaChoices(definition, current.id)).toHaveLength(4);
            expect(lessonZeroHiraganaChoices(definition, current.id)).toContain(current.romaji);
            expect(lessonZeroHiraganaChoices(definition, current.id))
                .toEqual(lessonZeroHiraganaChoices(definition, current.id));
    
            state = step(definition, state, { kind: 'pause' });
            expect(state.status).toBe('paused');
            const resumed = startLessonZeroHiraganaSession(definition, state);
            expect(resumed.queue).toEqual(state.queue);
            expect(step(definition, resumed, { kind: 'resume' }).status).toBe('active');
        });
    });
    
    function step(
        definition: ReturnType<typeof createLessonZeroHiraganaDefinition>,
        state: LessonZeroHiraganaSessionState,
        action: Parameters<typeof transitionLessonZeroHiraganaSession>[2],
    ): LessonZeroHiraganaSessionState {
        return transitionLessonZeroHiraganaSession(
            definition,
            state,
            action,
            1_000 + state.attempts.length,
        ).state;
    }
});

describe('lesson-zero-name-card-session behavior', () => {
    const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
    
    function definition(): LessonZeroNameCardDefinition {
        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
        return createLessonZeroNameCardDefinition(
            lesson.activities.find(activity => activity.id === 'activity:lesson-zero-name-card-draft')!,
            'Henry',
        );
    }
    
    describe('Lesson Zero name-card session', () => {
        it('makes the saved name a katakana-first naming moment without copying it into progress', () => {
            const content = definition();
            expect(content.activityId).toBe('activity:lesson-zero-name-card-draft');
            expect(getCompleteLessonRegistration('lesson:foundation-00').trustedActivityIds)
                .toContain(content.activityId);
            expect(content.conceptIds).toEqual([
                'concept:self-introduction-name',
                'concept:copula-affirmative',
            ]);
            expect(content.correctOrder).toEqual(['learner-name', 'desu']);
            expect(content).toMatchObject({
                usualName: 'Henry',
                katakanaName: 'ヘンリー',
                defaultNameVariant: 'katakana',
            });
            expect(lessonZeroNameCardLine(content)).toBe('ヘンリーです。');
            expect(lessonZeroNameCardLine(content, 'usual')).toBe('Henryです。');
            expect(JSON.stringify(startLessonZeroNameCardSession(content))).not.toMatch(/Henry|ヘンリー/);
        });
    
        it('repairs the name order and changed-person transfer before seeding SRS', () => {
            const content = definition();
            let state = startLessonZeroNameCardSession(content);
            const earlyHelp = transitionLessonZeroNameCardSession(content, state, { kind: 'reveal-model' }, 2);
            expect(earlyHelp.state.modelRevealed).toBe(false);
            expect(earlyHelp.supportEvents).toEqual([]);
    
            state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 3).state;
            state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 4).state;
            const buildLapse = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 5);
            expect(buildLapse.state.stage).toBe('build-result');
            expect(buildLapse.evaluation).toMatchObject({
                attempt: {
                    outcome: 'lapse',
                    responseKind: 'tapped-name-card-frame',
                    errorTags: ['name-card:word-order'],
                },
                reviewSeeds: [],
            });
    
            const buildSupport = transitionLessonZeroNameCardSession(content, buildLapse.state, { kind: 'reveal-model' }, 6);
            expect(buildSupport.state.modelRevealed).toBe(true);
            expect(buildSupport.supportEvents.map(event => event.supportKind)).toEqual([
                'transcript', 'translation', 'model-answer',
            ]);
            state = transitionLessonZeroNameCardSession(content, buildSupport.state, { kind: 'retry' }, 7).state;
            state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 8).state;
            state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 9).state;
            const buildPass = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 10);
            expect(buildPass.state).toMatchObject({ status: 'active', stage: 'transfer' });
            expect(buildPass.evaluation?.reviewSeeds).toEqual([]);
    
            state = transitionLessonZeroNameCardSession(
                content,
                buildPass.state,
                { kind: 'select-transfer', transferId: 'learner' },
                11,
            ).state;
            const transferLapse = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 12);
            expect(transferLapse.state.stage).toBe('transfer-result');
            expect(transferLapse.evaluation).toMatchObject({
                attempt: {
                    outcome: 'lapse',
                    responseKind: 'selected-changed-person-name-card',
                    errorTags: ['name-card:changed-person'],
                },
                reviewSeeds: [],
            });
    
            const transferSupport = transitionLessonZeroNameCardSession(
                content,
                transferLapse.state,
                { kind: 'reveal-model' },
                13,
            );
            state = transitionLessonZeroNameCardSession(content, transferSupport.state, { kind: 'retry' }, 14).state;
            state = transitionLessonZeroNameCardSession(
                content,
                state,
                { kind: 'select-transfer', transferId: 'rie' },
                15,
            ).state;
            const repaired = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 16);
    
            expect(repaired.state).toMatchObject({ status: 'complete', stage: 'complete' });
            expect(repaired.evaluation?.reviewSeeds).toEqual([
                expect.objectContaining({ id: 'review:lesson-zero:name-card:desu', reason: 'repair' }),
            ]);
            expect(repaired.adaptive).toMatchObject({ skill: 'grammar', action: 'repair', independent: false });
        });
    
        it('records independent production and transfer as separate evidence', () => {
            const content = definition();
            let state = startLessonZeroNameCardSession(content);
            state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 2).state;
            state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 3).state;
            const build = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 4);
            expect(build.evaluation?.attempt).toMatchObject({ outcome: 'pass', score: 1 });
            expect(build.evaluation?.reviewSeeds).toEqual([]);
            expect(build.adaptive).toMatchObject({ action: 'produce', independent: true });
    
            state = transitionLessonZeroNameCardSession(
                content,
                build.state,
                { kind: 'select-transfer', transferId: 'rie' },
                5,
            ).state;
            const transfer = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 6);
            expect(transfer.evaluation?.attempt).toMatchObject({
                outcome: 'pass',
                responseKind: 'selected-changed-person-name-card',
            });
            expect(transfer.evaluation?.reviewSeeds).toEqual([
                expect.objectContaining({ reason: 'new-learning' }),
            ]);
            expect(transfer.adaptive).toMatchObject({ action: 'transfer', independent: true });
        });
    
        it('round-trips a paused choice without storing names and rejects impossible snapshots', () => {
            const content = definition();
            let state = startLessonZeroNameCardSession(content);
            state = transitionLessonZeroNameCardSession(
                content,
                state,
                { kind: 'choose-name-variant', variant: 'usual' },
                2,
            ).state;
            state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 3).state;
            const paused = transitionLessonZeroNameCardSession(content, state, { kind: 'pause' }, 4).state;
            expect(startLessonZeroNameCardSession(content, paused)).toEqual(paused);
            expect(JSON.stringify(paused)).not.toMatch(/Henry|ヘンリー/);
            expect(paused.nameVariant).toBe('usual');
            expect(lessonZeroNameCardSessionSnapshotShapeIsValid({
                ...paused,
                status: 'complete',
                stage: 'complete',
            })).toBe(false);
            expect(() => startLessonZeroNameCardSession(content, {
                ...paused,
                selectedTokenIds: ['learner-name', 'learner-name'],
            })).toThrow(/invalid Lesson Zero name-card snapshot/i);
        });
    });
});

describe('lesson-zero-repeat-request-session behavior', () => {
    const CLASSROOM_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');
    
    const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
    
    function fixture() {
        const classroom = validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')));
        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
        const activity = lesson.activities.find(candidate =>
            candidate.id === LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID)!;
        return {
            activity,
            definition: createLessonZeroRepeatRequestDefinition(classroom, activity),
        };
    }
    
    function begin() {
        const { definition } = fixture();
        const state = transitionLessonZeroRepeatRequestSession(
            definition,
            startLessonZeroRepeatRequestSession(definition),
            { kind: 'start' },
            1,
        ).state;
        return { definition, state };
    }
    
    function select(
        definition: ReturnType<typeof fixture>['definition'],
        state: ReturnType<typeof begin>['state'],
        chunkId: 'once-more' | 'please' | 'desu',
        at: number,
    ) {
        return transitionLessonZeroRepeatRequestSession(
            definition,
            state,
            { kind: 'select', chunkId },
            at,
        ).state;
    }
    
    describe('Lesson Zero repetition-request session', () => {
        it('requires every source probe after repeat transfer, with repair and persisted resume', () => {
            const { definition } = fixture();
            const classroom = validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')));
            const sourceProbes = classroom.expressions
                .filter(expression => ['08', '09', '10', '11', '12'].some(id => expression.id === `expression:classroom-${id}`))
                .flatMap(expression => expression.probes.map(probe => probe.id));
            expect(['probe:classroom-09-repeat', ...definition.coverageProbes.map(probe => probe.id)].sort())
                .toEqual(sourceProbes.sort());
            let state = startRepeatRequestCoverageSession(definition);
            const evaluations: string[] = [];
            let time = 0;
            const act = (action: RepeatRequestCoverageAction) => {
                const next = transitionRepeatRequestCoverageSession(definition, state, action, ++time);
                state = next.state;
                if (next.evaluation?.attempt.outcome === 'pass') evaluations.push(next.evaluation.attempt.sourceQuestionId!);
                return next;
            };
            act({ kind: 'coverage-begin' });
            expect(state.stage).toBe('meet');
            act({ kind: 'start' });
            for (const kind of ['practice', 'transfer']) {
                if (kind === 'transfer') act({ kind: 'begin-transfer' });
                act({ kind: 'select', chunkId: 'once-more' });
                act({ kind: 'select', chunkId: 'please' });
                act({ kind: 'submit' });
            }
            expect(state.status).toBe('active');
            expect(state.repairCoverage?.stage).toBe('teach');
            for (const [index, probe] of definition.coverageProbes.entries()) {
                expect(state.repairCoverage?.index).toBe(index);
                act({ kind: 'coverage-next' }); // Teaching cannot be skipped.
                expect(state.repairCoverage?.stage).toBe('teach');
                act({ kind: 'coverage-begin' });
                act({ kind: 'coverage-select', index: 1 });
                act({ kind: 'coverage-select', index: 0 });
                const wrong = act({ kind: 'coverage-submit' });
                expect(wrong.evaluation?.attempt).toMatchObject({ sourceQuestionId: probe.sourceQuestionId, outcome: 'lapse' });
                expect(state.repairCoverage?.passedProbeIds).not.toContain(probe.id);
                act({ kind: 'pause' });
                state = startRepeatRequestCoverageSession(definition, JSON.parse(JSON.stringify(state)));
                act({ kind: 'resume' });
                expect(state.repairCoverage?.outcome).toBe('lapse');
                act({ kind: 'coverage-next' });
                act({ kind: 'coverage-begin' });
                act({ kind: 'coverage-select', index: 0 });
                act({ kind: 'coverage-select', index: 1 });
                const correct = act({ kind: 'coverage-submit' });
                expect(correct.evaluation?.attempt.activityId).toBe(`activity:lesson-zero-reconstruct-repair:${probe.id.replace('probe:', '')}`);
                expect(state.status).toBe('active'); // Feedback must be acknowledged.
                act({ kind: 'coverage-next' });
            }
            expect(state.status).toBe('complete');
            expect(state.repairCoverage?.passedProbeIds).toEqual(definition.coverageProbes.map(probe => probe.id));
            expect([...new Set(evaluations)].sort()).toEqual(['08', '09', '10', '11', '12'].map(id => `source-question:classroom-phrase-${id}`));
            const { repairCoverage: _coverage, ...legacy } = state;
            const resumed = startRepeatRequestCoverageSession(definition, legacy);
            expect(resumed.status).toBe('active');
            expect(resumed.repairCoverage?.passedProbeIds).toEqual([]);
            expect(() => startRepeatRequestCoverageSession(definition, {
                ...state, repairCoverage: { ...state.repairCoverage!, passedProbeIds: ['probe:classroom-12-wrong'] },
            })).toThrow('coverage progress');
        });
    
        it('rejects source wording drift rather than assigning coverage to substitute phrases', () => {
            const classroom = validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')));
            const { activity } = fixture();
            for (const id of ['08', '10', '11', '12']) {
                const altered = structuredClone(classroom);
                (altered.expressions.find(expression => expression.id === `expression:classroom-${id}`)!.probes[0] as { modelAnswer: string }).modelAnswer = '別の答え';
                expect(() => createLessonZeroRepeatRequestDefinition(altered, activity)).toThrow('drifted');
            }
        });
    
        it('repairs only the slipped chunk and creates one canonical review after guided practice', () => {
            const { definition, state: initial } = begin();
            let state = select(definition, initial, 'please', 2);
            state = select(definition, state, 'once-more', 3);
            const lapse = transitionLessonZeroRepeatRequestSession(
                definition,
                state,
                { kind: 'submit' },
                4,
            );
            expect(lapse).toMatchObject({
                state: { stage: 'practice-repair', practicePassed: false },
                attempt: {
                    round: 'practice',
                    outcome: 'lapse',
                    errorTag: 'repeat-request-order',
                    slippedChunkId: 'once-more',
                },
                supportEvents: [{ supportKind: 'hint', choiceId: 'once-more' }],
            });
            expect(lapse.evaluation?.reviewSeeds).toEqual([]);
    
            state = transitionLessonZeroRepeatRequestSession(
                definition,
                lapse.state,
                { kind: 'begin-retry' },
                5,
            ).state;
            state = select(definition, state, 'once-more', 6);
            state = select(definition, state, 'please', 7);
            const repaired = transitionLessonZeroRepeatRequestSession(
                definition,
                state,
                { kind: 'submit' },
                8,
            );
            expect(repaired.state).toMatchObject({
                status: 'active',
                stage: 'transfer-ready',
                practicePassed: true,
                transferPassed: false,
            });
            expect(repaired.adaptive).toMatchObject({
                skill: 'repair',
                action: 'repair',
                independent: false,
            });
            expect(repaired.evaluation?.reviewSeeds).toEqual([
                expect.objectContaining({
                    id: 'review:lesson-zero:classroom-09-repeat',
                    reason: 'repair',
                    content: expect.objectContaining({
                        expression: 'もう一度お願いします。',
                        reading: 'もういちどおねがいします',
                    }),
                }),
            ]);
        });
    
        it('requires changed-context transfer and does not schedule the same phrase twice', () => {
            const { definition, state: initial } = begin();
            let state = select(definition, initial, 'once-more', 2);
            state = select(definition, state, 'please', 3);
            const practice = transitionLessonZeroRepeatRequestSession(
                definition,
                state,
                { kind: 'submit' },
                4,
            );
            expect(practice.state.status).toBe('active');
            expect(practice.evaluation?.reviewSeeds).toHaveLength(1);
    
            state = transitionLessonZeroRepeatRequestSession(
                definition,
                practice.state,
                { kind: 'begin-transfer' },
                5,
            ).state;
            state = select(definition, state, 'desu', 6);
            state = select(definition, state, 'once-more', 7);
            const intrusion = transitionLessonZeroRepeatRequestSession(
                definition,
                state,
                { kind: 'submit' },
                8,
            );
            expect(intrusion.attempt).toMatchObject({
                round: 'transfer',
                errorTag: 'repeat-request-known-pattern-intrusion',
                slippedChunkId: 'please',
            });
    
            state = transitionLessonZeroRepeatRequestSession(
                definition,
                intrusion.state,
                { kind: 'begin-retry' },
                9,
            ).state;
            state = select(definition, state, 'once-more', 10);
            state = select(definition, state, 'please', 11);
            const transfer = transitionLessonZeroRepeatRequestSession(
                definition,
                state,
                { kind: 'submit' },
                12,
            );
            expect(transfer.state).toMatchObject({
                status: 'complete',
                stage: 'complete',
                practicePassed: true,
                transferPassed: true,
            });
            expect(transfer.evaluation?.reviewSeeds).toEqual([]);
            expect(transfer.adaptive).toMatchObject({
                skill: 'transfer',
                action: 'repair',
                independent: false,
            });
        });
    
        it('round-trips a paused build and rejects impossible completion', () => {
            const { definition, state: initial } = begin();
            const selected = select(definition, initial, 'once-more', 2);
            const paused = transitionLessonZeroRepeatRequestSession(
                definition,
                selected,
                { kind: 'pause' },
                3,
            ).state;
            expect(startLessonZeroRepeatRequestSession(definition, paused)).toEqual(paused);
            expect(lessonZeroRepeatRequestSessionSnapshotShapeIsValid({
                ...paused,
                status: 'complete',
                stage: 'complete',
            })).toBe(true);
            expect(() => startLessonZeroRepeatRequestSession(definition, {
                ...paused,
                status: 'complete',
                stage: 'complete',
            })).toThrow('without both passes');
        });
    });
});

describe('lesson-zero-sentence-frame-session behavior', () => {
    function definition(): LessonZeroSentenceFrameSessionDefinition {
        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
            'utf8',
        ))).lesson;
        return createLessonZeroSentenceFrameDefinition(
            lesson.activities.find(activity => activity.id === 'activity:lesson-zero-build-sentence-frames')!,
        );
    }
    
    function started(content = definition()): LessonZeroSentenceFrameSessionState {
        return transitionLessonZeroSentenceFrameSession(
            content,
            startLessonZeroSentenceFrameSession(content),
            { kind: 'start' },
            1,
        ).state;
    }
    
    function selectOrder(
        content: LessonZeroSentenceFrameSessionDefinition,
        state: LessonZeroSentenceFrameSessionState,
        order: readonly string[],
    ): LessonZeroSentenceFrameSessionState {
        let next = state.stage === 'teach'
            ? transitionLessonZeroSentenceFrameSession(content, state, { kind: 'open-build' }, 2).state
            : state;
        for (const tokenId of order) {
            next = transitionLessonZeroSentenceFrameSession(content, next, { kind: 'select-token', tokenId }, 3).state;
        }
        return next;
    }
    
    describe('Lesson Zero first-sentence session', () => {
    
        it('records a lapse, earns exact support, then schedules the repaired line', () => {
            const content = definition();
            const frame = content.frames[0]!;
            let state = selectOrder(content, started(content), frame.target.bankOrder);
            const lapse = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 4);
            expect(lapse.evaluation).toMatchObject({
                attempt: {
                    activityId: 'activity:lesson-zero-build-sentence-frames:identity',
                    outcome: 'lapse',
                    responseKind: 'tapped-token-order',
                },
                reviewSeeds: [],
            });
            expect(lapse.supportEvents).toEqual([]);
    
            const support = transitionLessonZeroSentenceFrameSession(
                content,
                lapse.state,
                { kind: 'reveal-model' },
                5,
            );
            expect(support.supportEvents.map(event => event.supportKind)).toEqual([
                'transcript',
                'translation',
                'model-answer',
            ]);
            state = transitionLessonZeroSentenceFrameSession(content, support.state, { kind: 'retry' }, 6).state;
            state = selectOrder(content, state, frame.target.correctOrder);
            const repaired = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 7);
            expect(repaired.evaluation?.reviewSeeds).toEqual([
                expect.objectContaining({
                    id: 'review:lesson-zero:sentence-frame:identity',
                    reason: 'repair',
                }),
            ]);
            expect(repaired.adaptive).toMatchObject({ action: 'repair', independent: false, skill: 'writing' });
            expect(repaired.state.stage).toBe('result');
        });
    
        it('repairs a recall lapse without scheduling a duplicate review card', () => {
            const content = definition();
            let state = started(content);
            for (const [index, frame] of content.frames.entries()) {
                state = selectOrder(content, state, frame.target.correctOrder);
                const checked = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 80 + index);
                state = index < content.frames.length - 1
                    ? transitionLessonZeroSentenceFrameSession(
                        content,
                        checked.state,
                        { kind: 'next-frame' },
                        90 + index,
                    ).state
                    : transitionLessonZeroSentenceFrameSession(
                        content,
                        checked.state,
                        { kind: 'begin-transfer' },
                        100,
                    ).state;
            }
    
            const frame = content.frames[0]!;
            state = selectOrder(content, state, frame.target.bankOrder);
            const lapse = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 101);
            expect(lapse.evaluation).toMatchObject({
                attempt: {
                    responseKind: 'tapped-token-order-transfer',
                    outcome: 'lapse',
                },
                reviewSeeds: [],
            });
            const support = transitionLessonZeroSentenceFrameSession(
                content,
                lapse.state,
                { kind: 'reveal-model' },
                102,
            );
            expect(support.state.revealedTransferModelFrameIds).toEqual(['identity']);
            expect(support.supportEvents.map(event => event.supportKind)).toEqual([
                'transcript',
                'translation',
                'model-answer',
            ]);
            state = transitionLessonZeroSentenceFrameSession(content, support.state, { kind: 'retry' }, 103).state;
            state = selectOrder(content, state, frame.target.correctOrder);
            const repaired = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 104);
            expect(repaired.evaluation?.reviewSeeds).toEqual([]);
            expect(repaired.adaptive).toMatchObject({ action: 'repair', independent: false, skill: 'writing' });
            expect(repaired.state.stage).toBe('transfer-result');
        });
    
        it('completes only after five guided builds and five unscaffolded recalls', () => {
            const content = definition();
            let state = started(content);
            for (const [index, frame] of content.frames.entries()) {
                state = selectOrder(content, state, frame.target.correctOrder);
                const checked = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 10 + index);
                expect(checked.evaluation?.attempt.activityId).toBe(frame.activityId);
                expect(checked.evaluation?.attempt.responseKind).toBe('tapped-token-order');
                expect(checked.evaluation?.reviewSeeds).toEqual([
                    expect.objectContaining({ id: `review:lesson-zero:sentence-frame:${frame.id}` }),
                ]);
                expect(checked.completionEvaluation).toBeUndefined();
                if (index < content.frames.length - 1) {
                    state = transitionLessonZeroSentenceFrameSession(content, checked.state, { kind: 'next-frame' }, 20 + index).state;
                } else {
                    state = transitionLessonZeroSentenceFrameSession(
                        content,
                        checked.state,
                        { kind: 'begin-transfer' },
                        30,
                    ).state;
                }
            }
            expect(state).toMatchObject({ stage: 'transfer-build', cursor: 0, status: 'active' });
    
            for (const [index, frame] of content.frames.entries()) {
                state = selectOrder(content, state, frame.target.correctOrder);
                const recalled = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 40 + index);
                expect(recalled.evaluation).toMatchObject({
                    attempt: {
                        activityId: frame.activityId,
                        responseKind: 'tapped-token-order-transfer',
                        outcome: 'pass',
                    },
                    reviewSeeds: [],
                });
                expect(recalled.adaptive).toMatchObject({
                    action: 'transfer',
                    independent: true,
                    skill: 'writing',
                });
                if (index < content.frames.length - 1) {
                    expect(recalled.completionEvaluation).toBeUndefined();
                    state = transitionLessonZeroSentenceFrameSession(
                        content,
                        recalled.state,
                        { kind: 'next-transfer' },
                        50 + index,
                    ).state;
                } else {
                    expect(recalled.completionEvaluation?.attempt).toMatchObject({
                        activityId: 'activity:lesson-zero-build-sentence-frames',
                        responseKind: 'sentence-constructions',
                        outcome: 'pass',
                    });
                    state = recalled.state;
                }
            }
            expect(state.status).toBe('complete');
            expect(state.passedFrameIds).toEqual(['identity', 'correction', 'question', 'noun-link', 'parallel']);
            expect(state.attempts.filter(attempt => attempt.phase === 'transfer')).toHaveLength(5);
        });
    
        it('round-trips a paused build and rejects impossible chronological completion', () => {
            const content = definition();
            let state = transitionLessonZeroSentenceFrameSession(content, started(content), { kind: 'open-build' }, 2).state;
            state = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'select-token', tokenId: 'self' }, 3).state;
            const paused = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'pause' }, 4).state;
            expect(startLessonZeroSentenceFrameSession(content, paused)).toEqual(paused);
            expect(lessonZeroSentenceFrameSessionSnapshotShapeIsValid({
                ...paused,
                status: 'complete',
                stage: 'complete',
            })).toBe(false);
            expect(() => startLessonZeroSentenceFrameSession(content, {
                ...paused,
                passedFrameIds: ['correction'],
            })).toThrow(/chronological/i);
        });
    
        it('keeps a completed checkpoint from the pre-recall release valid', () => {
            const content = definition();
            let state = started(content);
            for (const [index, frame] of content.frames.entries()) {
                state = selectOrder(content, state, frame.target.correctOrder);
                const checked = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 60 + index);
                const legacyAttempts = checked.state.attempts.map(({ phase: _phase, ...attempt }) => attempt);
                if (index < content.frames.length - 1) {
                    state = transitionLessonZeroSentenceFrameSession(
                        content,
                        { ...checked.state, attempts: legacyAttempts },
                        { kind: 'next-frame' },
                        70 + index,
                    ).state;
                } else {
                    const legacy = {
                        ...checked.state,
                        status: 'complete' as const,
                        stage: 'complete' as const,
                        attempts: legacyAttempts,
                    };
                    expect(lessonZeroSentenceFrameSessionSnapshotShapeIsValid(legacy)).toBe(true);
                    expect(startLessonZeroSentenceFrameSession(content, legacy)).toMatchObject({
                        status: 'complete',
                        stage: 'complete',
                    });
                }
            }
        });
    });
});

describe('lesson-zero-sound-session behavior', () => {
    const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
    
    function definition() {
        const data = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8')));
        return createLessonZeroSoundDefinition({
            lesson: data.lesson,
            sourceLibrary: {} as never,
            grounding: {} as never,
        });
    }
    
    describe('Lesson Zero sound session', () => {
    
        it('teaches both exact names before testing them in reversed speaker order', () => {
            const content = definition();
            let state = startLessonZeroSoundSession(content);
            expect(state).toMatchObject({ stage: 'meet', introduced: false });
    
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard',
                lineId: 'line:lesson-zero-sound-mika-names-xingyu',
            }, 1).state;
            expect(state.heardLineIds).toEqual([]);
            expect(transitionLessonZeroSoundSession(content, state, { kind: 'begin-check' }, 2).state.stage)
                .toBe('meet');
    
            state = meetAndBegin(content, state, 10);
            expect(state).toMatchObject({ stage: 'attempt', introduced: true, heardLineIds: [] });
            expect(checkLines(content).map(line => [line.speakerId, line.targetSpeakerId])).toEqual([
                ['mika', 'xingyu'],
                ['xingyu', 'mika'],
            ]);
    
            for (const line of checkLines(content)) {
                state = transitionLessonZeroSoundSession(content, state, {
                    kind: 'select-speaker',
                    lineId: line.id,
                    speakerId: line.targetSpeakerId,
                }, 20).state;
                expect(state.selections.some(selection => selection.lineId === line.id)).toBe(false);
                state = transitionLessonZeroSoundSession(content, state, {
                    kind: 'mark-heard',
                    lineId: line.id,
                }, 21).state;
                state = transitionLessonZeroSoundSession(content, state, {
                    kind: 'select-speaker',
                    lineId: line.id,
                    speakerId: line.targetSpeakerId,
                }, 22).state;
            }
            const passed = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 23);
    
            expect(passed.state).toMatchObject({ status: 'complete', stage: 'complete' });
            expect(passed.evaluation?.attempt).toMatchObject({
                outcome: 'pass', score: 1, responseKind: 'audio-name-match',
            });
            expect(passed.evaluation?.reviewSeeds.map(seed => [seed.id, seed.content.expression])).toEqual([
                ['review:lesson-zero:name:xingyu', 'シンユ'],
                ['review:lesson-zero:name:mika', 'ミカ'],
            ]);
            expect(passed.adaptive).toMatchObject({ skill: 'listening', action: 'listen', independent: true });
        });
    
        it('repairs only the missed name, then retries only that changed-speaker line', () => {
            const content = definition();
            let state = meetAndBegin(content, startLessonZeroSoundSession(content), 10);
            const [xingyuCheck, mikaCheck] = checkLines(content);
            for (const line of checkLines(content)) {
                state = transitionLessonZeroSoundSession(content, state, {
                    kind: 'mark-heard', lineId: line.id,
                }, 20).state;
            }
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker', lineId: xingyuCheck!.id, speakerId: 'xingyu',
            }, 21).state;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker', lineId: mikaCheck!.id, speakerId: 'xingyu',
            }, 22).state;
            const lapse = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 23);
            expect(lapse.state.stage).toBe('repair');
            expect(lapse.evaluation?.attempt).toMatchObject({ outcome: 'lapse', score: 0.5 });
            expect(lapse.state.attempts[0]?.missedLineIds).toEqual([mikaCheck!.id]);
    
            expect(transitionLessonZeroSoundSession(content, lapse.state, { kind: 'retry' }, 24).state.stage)
                .toBe('repair');
            const support = transitionLessonZeroSoundSession(content, lapse.state, { kind: 'reveal-model' }, 25);
            expect(support.supportEvents.map(event => event.supportKind)).toEqual([
                'transcript', 'translation', 'model-answer',
            ]);
            state = transitionLessonZeroSoundSession(content, support.state, {
                kind: 'mark-repair-heard', lineId: xingyuCheck!.id,
            }, 26).state;
            expect(state.repairedLineIds).toEqual([]);
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-repair-heard', lineId: mikaCheck!.id,
            }, 27).state;
            state = transitionLessonZeroSoundSession(content, state, { kind: 'retry' }, 28).state;
            expect(state).toMatchObject({
                stage: 'attempt',
                heardLineIds: [],
                selections: [],
                repairedLineIds: [mikaCheck!.id],
            });
    
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: mikaCheck!.id,
            }, 29).state;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker', lineId: mikaCheck!.id, speakerId: 'mika',
            }, 30).state;
            const repaired = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 31);
            expect(repaired.state.status).toBe('complete');
            expect(repaired.evaluation?.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
            expect(repaired.adaptive).toMatchObject({ skill: 'listening', action: 'repair', independent: false });
        });
    
        it('ends after the single repair even if the retry still misses, while scheduling review', () => {
            const content = definition();
            let state = meetAndBegin(content, startLessonZeroSoundSession(content), 10);
            const checks = checkLines(content);
            for (const line of checks) {
                state = transitionLessonZeroSoundSession(content, state, {
                    kind: 'mark-heard', lineId: line.id,
                }, 20).state;
                state = transitionLessonZeroSoundSession(content, state, {
                    kind: 'select-speaker', lineId: line.id, speakerId: 'xingyu',
                }, 21).state;
            }
            state = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 22).state;
            const missed = state.attempts.at(-1)!.missedLineIds[0]!;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-repair-heard', lineId: missed,
            }, 23).state;
            state = transitionLessonZeroSoundSession(content, state, { kind: 'retry' }, 24).state;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: missed,
            }, 25).state;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker', lineId: missed, speakerId: 'xingyu',
            }, 26).state;
            const assisted = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 27);
    
            expect(assisted.state).toMatchObject({
                status: 'complete',
                stage: 'complete',
                modelRevealed: true,
            });
            expect(assisted.evaluation?.result.outcome).toBe('lapse');
            expect(assisted.evaluation?.reviewSeeds).toHaveLength(2);
            expect(assisted.supportEvents.map(event => event.supportKind)).toEqual([
                'transcript', 'translation', 'model-answer',
            ]);
        });
    
        it('round-trips the exact meet cursor and safely restarts incomplete legacy checkpoints', () => {
            const content = definition();
            let state = startLessonZeroSoundSession(content);
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: 'line:lesson-zero-sound-xingyu',
            }, 1).state;
            const paused = transitionLessonZeroSoundSession(content, state, { kind: 'pause' }, 2).state;
            expect(startLessonZeroSoundSession(content, paused)).toEqual(paused);
    
            const legacy = {
                ...paused,
                stage: 'attempt' as const,
                introduced: undefined,
                status: 'active' as const,
            };
            expect(startLessonZeroSoundSession(content, legacy)).toMatchObject({
                stage: 'meet',
                introduced: false,
                heardLineIds: [],
            });
            expect(lessonZeroSoundSessionSnapshotShapeIsValid({
                ...paused,
                selections: [{ lineId: 'line:unknown', speakerId: 'xingyu' }],
            })).toBe(false);
            expect(lessonZeroSoundSessionSnapshotShapeIsValid({
                ...paused,
                status: 'complete',
                stage: 'complete',
            })).toBe(false);
        });
    });
    
    function meetAndBegin(
        content: LessonZeroSoundDefinition,
        initial: LessonZeroSoundSessionState,
        at: number,
    ): LessonZeroSoundSessionState {
        let state = initial;
        for (const line of content.lines.filter(candidate => candidate.phase === 'introduction')) {
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: line.id,
            }, at).state;
        }
        return transitionLessonZeroSoundSession(content, state, { kind: 'begin-check' }, at + 1).state;
    }
    
    function checkLines(content: LessonZeroSoundDefinition) {
        return content.lines.filter(line => line.phase === 'check');
    }
});

describe('lesson-zero-vowel-session behavior', () => {
    function taughtState() {
        const model = createLessonZeroVowelSoundMap();
        let state = transitionLessonZeroVowelSession(
            model,
            startLessonZeroVowelSession(model),
            { kind: 'start' },
            1,
        ).state;
        for (const item of model.payload.items) {
            state = transitionLessonZeroVowelSession(model, state, { kind: 'learn-item', itemId: item.id }, 2).state;
        }
        return { model, state };
    }
    
    function completeRound(
        model: ReturnType<typeof createLessonZeroVowelSoundMap>,
        input: ReturnType<typeof startLessonZeroVowelSession>,
        wrongFirst = false,
    ) {
        let state = input;
        for (let index = 0; index < state.roundOrder.length; index += 1) {
            const roundId = state.roundOrder[index];
            state = transitionLessonZeroVowelSession(model, state, { kind: 'mark-heard', roundId }, 10 + index).state;
            const target = wrongFirst && index === 0
                ? model.payload.items.find(item => item.id !== roundId)!.id
                : roundId;
            state = transitionLessonZeroVowelSession(model, state, { kind: 'select', kanaId: target }, 10 + index).state;
        }
        return state;
    }
    
    describe('Lesson Zero five-vowel session', () => {
        it('teaches all five anchors before a shuffled independent listening round', () => {
            const { model, state: taught } = taughtState();
            let state = transitionLessonZeroVowelSession(model, taught, { kind: 'begin-attempt' }, 3).state;
            expect(state.roundOrder).toHaveLength(5);
            expect(state.roundOrder).not.toEqual(model.payload.items.map(item => item.id));
            expect(() => transitionLessonZeroVowelSession(
                model,
                state,
                { kind: 'select', kanaId: state.roundOrder[0] },
                4,
            )).toThrow('Listen to the current sound');
    
            state = completeRound(model, state);
            const response = lessonZeroVowelResponse(model, state);
            const evaluation = createAcademyActivityRuntime().evaluate(model, response);
            const complete = transitionLessonZeroVowelSession(model, state, { kind: 'record-result', evaluation }, 20);
            expect(complete.state).toMatchObject({ status: 'complete', stage: 'complete', baseCompleted: true });
            expect(complete.evaluation?.reviewSeeds).toHaveLength(5);
            expect(complete.adaptive).toMatchObject({ skill: 'listening', action: 'listen', independent: true });
        });
    
        it('repairs only missed sounds and then requires the complete five-sound route again', () => {
            const { model, state: taught } = taughtState();
            let state = transitionLessonZeroVowelSession(model, taught, { kind: 'begin-attempt' }, 3).state;
            state = completeRound(model, state, true);
            const lapse = createAcademyActivityRuntime().evaluate(model, lessonZeroVowelResponse(model, state));
            const repair = transitionLessonZeroVowelSession(model, state, { kind: 'record-result', evaluation: lapse }, 20);
            expect(repair.state.stage).toBe('repair');
            expect(repair.state.repairItemIds).toHaveLength(1);
    
            state = transitionLessonZeroVowelSession(model, repair.state, { kind: 'choose-mode', mode: 'visual' }, 21).state;
            state = transitionLessonZeroVowelSession(
                model,
                state,
                { kind: 'complete-repair-item', itemId: state.repairItemIds[0] },
                22,
            ).state;
            state = transitionLessonZeroVowelSession(model, state, { kind: 'begin-retry' }, 23).state;
            expect(state).toMatchObject({ stage: 'attempt', mode: 'visual', selections: [] });
            expect(state.roundOrder).toHaveLength(5);
        });
    
        it('keeps bingo optional, repeatable and durable after the base lesson passes', () => {
            const { model, state: taught } = taughtState();
            let state = transitionLessonZeroVowelSession(model, taught, { kind: 'begin-attempt' }, 3).state;
            state = completeRound(model, state);
            const runtime = createAcademyActivityRuntime();
            state = transitionLessonZeroVowelSession(
                model,
                state,
                { kind: 'record-result', evaluation: runtime.evaluate(model, lessonZeroVowelResponse(model, state)) },
                20,
            ).state;
            state = transitionLessonZeroVowelSession(model, state, { kind: 'start-bingo' }, 21).state;
            state = completeRound(model, state);
            const bingo = createLessonZeroVowelBingo();
            state = transitionLessonZeroVowelSession(
                model,
                state,
                { kind: 'record-result', evaluation: runtime.evaluate(bingo, lessonZeroVowelResponse(model, state)) },
                30,
            ).state;
            expect(state).toMatchObject({ status: 'complete', variant: 'bingo', bingoWins: 1 });
            expect(startLessonZeroVowelSession(model, state)).toEqual(state);
            expect(lessonZeroVowelSessionSnapshotShapeIsValid(state)).toBe(true);
        });
    });
});

describe('lesson-zero-vowel-writing-content behavior', () => {
    describe('Lesson Zero five-vowel writing content', () => {
        it('keeps the canonical five-kana order and gates the source guide until after an attempt', () => {
            const definition = createLessonZeroVowelWritingDefinition();
    
            expect(definition.id).toBe(LESSON_ZERO_VOWEL_WRITING_ID);
            expect(definition.items.map(item => item.kana)).toEqual(['あ', 'い', 'う', 'え', 'お']);
            expect(definition.items.map(item => item.strokeCount)).toEqual([3, 2, 2, 2, 3]);
            expect(definition.items.every(item => item.strokeShapes.length === item.strokeCount)).toBe(true);
            expect(definition.source).toMatchObject({
                answerGate: 'after-first-attempt',
                storySceneId: 'scene:blank-atlas:sound-script-map',
            });
            expect(definition.source.runtimeUrl).toContain('hiragana-a-row-page-1.png');
            expect(definition.source.sha256).toMatch(/^[a-f0-9]{64}$/);
            expect(LESSON_ZERO_VOWEL_WRITING_CHILD_ACTIVITY_IDS).toEqual([
                'activity:lesson-zero-vowel-doodle:hira-a',
                'activity:lesson-zero-vowel-doodle:hira-i',
                'activity:lesson-zero-vowel-doodle:hira-u',
                'activity:lesson-zero-vowel-doodle:hira-e',
                'activity:lesson-zero-vowel-doodle:hira-o',
            ]);
        });
    
        it('records independent draw evidence and schedules the individual kana', () => {
            const definition = createLessonZeroVowelWritingDefinition();
            const item = definition.items[0];
            const evaluation = evaluateLessonZeroVowelWriting(definition, item, {
                mode: 'draw',
                assessment: {
                    passed: true,
                    score: 91,
                    expectedStrokes: 3,
                    actualStrokes: 3,
                    shapeScore: 0.84,
                    message: 'Looks right',
                },
            });
    
            expect(evaluation.result).toMatchObject({ outcome: 'pass', score: 0.91 });
            expect(evaluation.attempt).toMatchObject({
                activityId: 'activity:lesson-zero-vowel-doodle:hira-a',
                responseKind: 'kana-doodle',
                conceptIds: ['concept:hiragana-vowel-row'],
            });
            expect(evaluation.reviewSeeds).toEqual([
                expect.objectContaining({
                    id: 'review:lesson-zero:vowel-writing:hira-a',
                    reason: 'new-learning',
                    content: expect.objectContaining({ expression: 'あ', reading: 'あ' }),
                }),
            ]);
        });
    
        it('turns a wrong access-route plan into repair evidence without passing the parent activity', () => {
            const definition = createLessonZeroVowelWritingDefinition();
            const item = definition.items[1];
            const wrongPlan = item.plans.find(plan => plan.id !== item.correctPlanId)!;
            const lapse = evaluateLessonZeroVowelWriting(definition, item, {
                mode: 'plan',
                selectedPlanId: wrongPlan.id,
            });
    
            expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 0 });
            expect(lapse.result.feedback.repairPrompt?.en).toContain('Left down');
            expect(lapse.attempt).toMatchObject({
                activityId: 'activity:lesson-zero-vowel-doodle:hira-i',
                responseKind: 'kana-stroke-plan',
            });
            expect(lapse.reviewSeeds[0]).toMatchObject({ reason: 'repair' });
    
            const completion = lessonZeroVowelWritingCompletionEvaluation(definition, 0.88);
            expect(completion.attempt).toMatchObject({
                activityId: LESSON_ZERO_VOWEL_WRITING_ID,
                responseKind: 'stroke-attempts',
                outcome: 'pass',
                score: 0.88,
            });
            expect(completion.reviewSeeds).toEqual([]);
        });
    });
});

describe('lesson-zero-vowel-writing-session behavior', () => {
    function startInPlanMode() {
        const definition = createLessonZeroVowelWritingDefinition();
        let state = transitionLessonZeroVowelWritingSession(
            definition,
            startLessonZeroVowelWritingSession(definition),
            { kind: 'start' },
            1,
        ).state;
        state = transitionLessonZeroVowelWritingSession(
            definition,
            state,
            { kind: 'choose-mode', mode: 'plan' },
            2,
        ).state;
        return { definition, state };
    }
    
    describe('Lesson Zero five-vowel writing session', () => {
        it('requires five writing passes and a mixed-order delayed recall before completing the parent', () => {
            const { definition } = startInPlanMode();
            let { state } = startInPlanMode();
    
            definition.items.forEach((item, index) => {
                if (index === 0) {
                    state = transitionLessonZeroVowelWritingSession(
                        definition,
                        state,
                        { kind: 'choose-mode', mode: 'draw' },
                        9,
                    ).state;
                }
                state = transitionLessonZeroVowelWritingSession(
                    definition,
                    state,
                    { kind: 'learn-item', itemId: item.id },
                    10 + index * 2,
                ).state;
                const evaluation = index === 0
                    ? evaluateLessonZeroVowelWriting(definition, item, {
                        mode: 'draw',
                        assessment: {
                            passed: true,
                            score: 82,
                            expectedStrokes: 3,
                            actualStrokes: 3,
                            shapeScore: 0.72,
                            message: 'Looks right',
                        },
                    })
                    : evaluateLessonZeroVowelWriting(definition, item, {
                        mode: 'plan',
                        selectedPlanId: item.correctPlanId,
                    });
                const transition = transitionLessonZeroVowelWritingSession(
                    definition,
                    state,
                    { kind: 'record-result', evaluation },
                    11 + index * 2,
                );
                state = transition.state;
    
                expect(transition.evaluation?.attempt.activityId).toBe(`activity:lesson-zero-vowel-doodle:${item.id}`);
                expect(state.status).toBe('active');
                expect(state.completedItemIds).toHaveLength(index + 1);
                if (index === 0) {
                    state = transitionLessonZeroVowelWritingSession(
                        definition,
                        state,
                        { kind: 'choose-mode', mode: 'plan' },
                        12,
                    ).state;
                }
            });
    
            expect(state).toMatchObject({
                stage: 'recall',
                completedItemIds: ['hira-a', 'hira-i', 'hira-u', 'hira-e', 'hira-o'],
                recalledItemIds: [],
            });
    
            LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER.forEach((itemId, index) => {
                const item = definition.items.find(candidate => candidate.id === itemId)!;
                const evaluation = evaluateLessonZeroVowelWritingRecall(definition, item, { selectedItemId: item.id });
                const transition = transitionLessonZeroVowelWritingSession(
                    definition,
                    state,
                    { kind: 'record-recall-result', evaluation },
                    30 + index,
                );
                state = transition.state;
                expect(transition.adaptive).toMatchObject({
                    modeId: 'lesson-zero-vowel-writing:recall',
                    skill: 'kana',
                    action: 'recall',
                });
                expect(state.status).toBe(index === 4 ? 'complete' : 'active');
            });
    
            expect(state).toMatchObject({
                stage: 'complete',
                recalledItemIds: ['hira-u', 'hira-a', 'hira-o', 'hira-i', 'hira-e'],
            });
            expect(lessonZeroVowelWritingAveragePassScore(state)).toBeCloseTo(0.964);
            expect(lessonZeroVowelWritingSessionSnapshotShapeIsValid(state)).toBe(true);
        });
    
        it('repairs only the missed sound-shape link during delayed recall', () => {
            const { definition } = startInPlanMode();
            let { state } = startInPlanMode();
            for (const [index, item] of definition.items.entries()) {
                state = transitionLessonZeroVowelWritingSession(
                    definition,
                    state,
                    { kind: 'learn-item', itemId: item.id },
                    10 + index * 2,
                ).state;
                state = transitionLessonZeroVowelWritingSession(
                    definition,
                    state,
                    {
                        kind: 'record-result',
                        evaluation: evaluateLessonZeroVowelWriting(definition, item, {
                            mode: 'plan',
                            selectedPlanId: item.correctPlanId,
                        }),
                    },
                    11 + index * 2,
                ).state;
            }
    
            const target = definition.items.find(item => item.id === 'hira-u')!;
            const lapse = transitionLessonZeroVowelWritingSession(
                definition,
                state,
                {
                    kind: 'record-recall-result',
                    evaluation: evaluateLessonZeroVowelWritingRecall(definition, target, { selectedItemId: 'hira-a' }),
                },
                30,
            );
            expect(lapse.state).toMatchObject({ stage: 'recall-repair', recalledItemIds: [] });
            expect(lapse.adaptive).toMatchObject({ skill: 'kana', action: 'recall', independent: true });
    
            state = transitionLessonZeroVowelWritingSession(
                definition,
                lapse.state,
                { kind: 'begin-retry' },
                31,
            ).state;
            const recovered = transitionLessonZeroVowelWritingSession(
                definition,
                state,
                {
                    kind: 'record-recall-result',
                    evaluation: evaluateLessonZeroVowelWritingRecall(definition, target, { selectedItemId: 'hira-u' }),
                },
                32,
            );
            expect(recovered.state).toMatchObject({ stage: 'recall', recalledItemIds: ['hira-u'] });
            expect(recovered.adaptive).toMatchObject({ skill: 'repair', action: 'repair', independent: true });
        });
    
        it('reveals only the missed kana guide, then marks the retry as repair evidence', () => {
            const definition = createLessonZeroVowelWritingDefinition();
            let state = transitionLessonZeroVowelWritingSession(
                definition,
                startLessonZeroVowelWritingSession(definition),
                { kind: 'start' },
                1,
            ).state;
            const item = definition.items[0];
            state = transitionLessonZeroVowelWritingSession(
                definition,
                state,
                { kind: 'learn-item', itemId: item.id },
                2,
            ).state;
            const lapse = evaluateLessonZeroVowelWriting(definition, item, {
                mode: 'draw',
                assessment: {
                    passed: false,
                    score: 24,
                    expectedStrokes: 3,
                    actualStrokes: 1,
                    message: 'Check stroke count',
                },
            });
            const repair = transitionLessonZeroVowelWritingSession(
                definition,
                state,
                { kind: 'record-result', evaluation: lapse },
                3,
            );
            expect(repair.state).toMatchObject({ stage: 'repair', guideItemIds: ['hira-a'] });
            expect(repair.adaptive).toMatchObject({ skill: 'writing', action: 'write', independent: true });
    
            state = transitionLessonZeroVowelWritingSession(
                definition,
                repair.state,
                { kind: 'begin-retry' },
                4,
            ).state;
            const pass = evaluateLessonZeroVowelWriting(definition, item, {
                mode: 'draw',
                assessment: {
                    passed: true,
                    score: 86,
                    expectedStrokes: 3,
                    actualStrokes: 3,
                    shapeScore: 0.75,
                    message: 'Looks right',
                },
            });
            const recovered = transitionLessonZeroVowelWritingSession(
                definition,
                state,
                { kind: 'record-result', evaluation: pass },
                5,
            );
            expect(recovered.state).toMatchObject({ stage: 'learn', completedItemIds: ['hira-a'] });
            expect(recovered.adaptive).toMatchObject({ skill: 'repair', action: 'repair', independent: true });
        });
    
        it('pauses and resumes without losing the exact kana position', () => {
            const { definition, state: started } = startInPlanMode();
            const learned = transitionLessonZeroVowelWritingSession(
                definition,
                started,
                { kind: 'learn-item', itemId: 'hira-a' },
                3,
            ).state;
            const paused = transitionLessonZeroVowelWritingSession(definition, learned, { kind: 'pause' }, 4).state;
            const resumed = transitionLessonZeroVowelWritingSession(definition, paused, { kind: 'resume' }, 5).state;
    
            expect(paused).toMatchObject({ status: 'paused', stage: 'attempt', mode: 'plan', learnedItemIds: ['hira-a'] });
            expect(startLessonZeroVowelWritingSession(definition, paused)).toEqual(paused);
            expect(resumed).toMatchObject({ status: 'active', stage: 'attempt', mode: 'plan', learnedItemIds: ['hira-a'] });
        });
    
        it('rejects malformed or out-of-order durable snapshots', () => {
            const definition = createLessonZeroVowelWritingDefinition();
            const invalid = {
                ...startLessonZeroVowelWritingSession(definition),
                status: 'active' as const,
                learnedItemIds: ['hira-i'] as const,
            };
    
            expect(lessonZeroVowelWritingSessionSnapshotShapeIsValid(invalid)).toBe(true);
            expect(() => startLessonZeroVowelWritingSession(definition, invalid)).toThrow('canonical five vowels');
        });
    });
});
