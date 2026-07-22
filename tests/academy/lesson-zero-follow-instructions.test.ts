import fs from 'node:fs';
import path from 'node:path';
import {
    createLessonZeroFollowInstructionDefinition,
    LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID,
    LESSON_ZERO_FOLLOW_INSTRUCTION_CHILD_ACTIVITY_IDS,
    lessonZeroFollowInstructionCompletionEvaluation,
} from '../../src/academy/content/lesson-zero-follow-instructions';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    classroomInstructionSessionSnapshotShapeIsValid,
    startClassroomInstructionSession,
    transitionClassroomInstructionSession,
} from '../../src/academy/domain/classroom-instruction-session';

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
            'look', 'begin', 'write', 'break', 'listen', 'finish', 'say-together',
        ]);
        expect(new Set(definition.cues.map(cue => cue.sourceQuestionId)).size).toBe(7);
        expect(new Set(definition.cues.map(cue => cue.japanese)).size).toBe(7);
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
        const missed = transitionClassroomInstructionSession(definition, state, { kind: 'choose', actionId: 'write' }, 20);
        expect(missed.state.cursor).toBe(0);
        expect(missed.evaluation).toMatchObject({
            attempt: {
                activityId: `${LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID}:look`,
                sourceQuestionId: 'source-question:classroom-phrase-04',
                outcome: 'lapse',
            },
            reviewSeeds: [],
        });
        expect(missed.supportEvents.map(event => event.supportKind)).toEqual(['transcript', 'translation']);

        state = missed.state;
        const repaired = transitionClassroomInstructionSession(definition, state, { kind: 'choose', actionId: 'look' }, 30);
        expect(repaired.state.cursor).toBe(1);
        expect(repaired.adaptive).toMatchObject({ action: 'repair', independent: false });
        expect(repaired.evaluation?.reviewSeeds[0]).toMatchObject({
            id: 'review:lesson-zero:instruction:look',
            reason: 'repair',
            content: { expression: 'みてください', meanings: ['Please look.'] },
        });
    });

    it('completes only after all seven different room actions pass', () => {
        const { activity, definition } = fixture();
        let state = transitionClassroomInstructionSession(
            definition,
            startClassroomInstructionSession(definition),
            { kind: 'start' },
            100,
        ).state;
        for (const cue of definition.cues) {
            const transition = transitionClassroomInstructionSession(
                definition,
                state,
                { kind: 'choose', actionId: cue.actionId },
                101 + state.cursor,
            );
            state = transition.state;
        }
        expect(state).toMatchObject({ status: 'complete', cursor: 7 });
        expect(state.passedCueIds).toHaveLength(7);
        expect(lessonZeroFollowInstructionCompletionEvaluation(activity, 200).attempt).toMatchObject({
            eventId: `${LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID}:complete`,
            activityId: LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID,
            responseKind: 'scene-actions',
            outcome: 'pass',
        });
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
