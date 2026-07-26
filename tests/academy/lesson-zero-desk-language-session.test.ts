import fs from 'node:fs';
import path from 'node:path';
import {
    createLessonZeroDeskLanguageDefinition,
    LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID,
    LESSON_ZERO_DESK_LANGUAGE_CHILD_ACTIVITY_IDS,
    lessonZeroDeskLanguageCompletionEvaluation,
} from '../../src/academy/content/lesson-zero-desk-language';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    lessonZeroDeskLanguageSessionSnapshotShapeIsValid,
    startLessonZeroDeskLanguageSession,
    transitionLessonZeroDeskLanguageSession,
} from '../../src/academy/domain/lesson-zero-desk-language-session';

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
