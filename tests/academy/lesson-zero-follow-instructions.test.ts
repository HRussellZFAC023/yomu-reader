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
    classroomInstructionCurrentCue,
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
