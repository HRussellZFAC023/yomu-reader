import fs from 'node:fs';
import path from 'node:path';
import {
    classroomActivityCompletionEvaluation,
    classroomProbeRecording,
    classroomStateForActivity,
    completedClassroomActivityIds,
    LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS,
    newlyCompletedClassroomActivityIds,
} from '../../src/academy/content/lesson-zero-classroom-runtime';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    startClassroomExpressionSession,
    transitionClassroomExpressionSession,
} from '../../src/academy/domain/classroom-expression-session';

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
            'activity:lesson-zero-reconstruct-repair',
        );

        expect(positioned.cursor).toMatchObject({
            phaseId: 'understanding-and-repair',
            probeId: 'probe:classroom-08-check',
        });
    });

    it('turns one source-linked response into idempotent evidence and a useful SRS seed', () => {
        const definition = classroom();
        const state = classroomStateForActivity(
            definition,
            startClassroomExpressionSession(definition),
            'activity:lesson-zero-reconstruct-repair',
        );
        const transition = transitionClassroomExpressionSession(definition, state, {
            kind: 'submit', response: 'わかりますか',
        }, 100);
        const recording = classroomProbeRecording(definition, transition);

        expect(recording).toMatchObject({
            bindingActivityId: 'activity:lesson-zero-reconstruct-repair',
            evaluation: {
                attempt: {
                    eventId: expect.stringContaining('probe:classroom-08-check:attempt:1'),
                    activityId: 'probe:classroom-08-check',
                    sourceQuestionId: 'source-question:classroom-phrase-08',
                    outcome: 'pass',
                },
                reviewSeeds: [{
                    id: 'review:lesson-zero:classroom-08-check',
                    content: {
                        expression: 'わかりますか',
                        reading: 'わかりますか',
                        meanings: ['Do you understand?'],
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
            'activity:lesson-zero-reconstruct-repair',
        );
        const initial = state;
        let at = 200;
        while (!completedClassroomActivityIds(definition, state)
            .includes('activity:lesson-zero-reconstruct-repair')) {
            state = transitionClassroomExpressionSession(definition, state, {
                kind: 'submit', response: answers.get(state.cursor.probeId)!,
            }, at++).state;
        }

        expect(newlyCompletedClassroomActivityIds(definition, initial, state))
            .toEqual(['activity:lesson-zero-reconstruct-repair']);
        expect(completedClassroomActivityIds(definition, state))
            .not.toContain('activity:lesson-zero-follow-instructions');

        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
        const activity = lesson.activities.find(candidate =>
            candidate.id === 'activity:lesson-zero-reconstruct-repair')!;
        expect(classroomActivityCompletionEvaluation(activity, 300).attempt).toMatchObject({
            eventId: 'session:lesson-zero-classroom-expressions:activity:lesson-zero-reconstruct-repair:complete',
            activityId: activity.id,
            outcome: 'pass',
        });
    });
});
