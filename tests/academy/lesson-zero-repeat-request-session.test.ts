import fs from 'node:fs';
import path from 'node:path';
import {
    createLessonZeroRepeatRequestDefinition,
    LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID,
    LESSON_ZERO_REPEAT_REQUEST_CHILD_ACTIVITY_IDS,
    lessonZeroRepeatRequestCompletionEvaluation,
} from '../../src/academy/content/lesson-zero-repeat-request';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    lessonZeroRepeatRequestSessionSnapshotShapeIsValid,
    startLessonZeroRepeatRequestSession,
    transitionLessonZeroRepeatRequestSession,
} from '../../src/academy/domain/lesson-zero-repeat-request-session';

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
    it('grounds one survival phrase in two sound chunks and registers both evidence rounds', () => {
        const { activity, definition } = fixture();
        expect(definition.target).toMatchObject({
            japanese: 'もう一度お願いします。',
            reading: 'もういちどおねがいします',
            voiceBindingId: 'world-practice:lab-classroom-repeat',
        });
        expect(definition.practiceChunkIds).toEqual(['once-more', 'please']);
        expect(definition.chunks.map(chunk => chunk.soundCue)).toEqual([
            'mou ichido',
            'onegaishimasu',
            'desu',
        ]);
        const registration = getCompleteLessonRegistration('lesson:foundation-00');
        expect(registration.trustedActivityIds).toContain(LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID);
        expect(registration.trustedActivityIds).toEqual(expect.arrayContaining(
            [...LESSON_ZERO_REPEAT_REQUEST_CHILD_ACTIVITY_IDS],
        ));
        expect(lessonZeroRepeatRequestCompletionEvaluation(activity, definition, 40).attempt).toMatchObject({
            activityId: LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID,
            conceptIds: ['concept:classroom-repair-repeat', 'concept:polite-request'],
            outcome: 'pass',
        });
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
