import fs from 'node:fs';
import { startRepeatRequestCoverageSession, transitionRepeatRequestCoverageSession,
    type RepeatRequestCoverageAction } from '../../src/academy/content/lesson-zero-repeat-request-coverage';
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
            conceptIds: [...new Set([...definition.conceptIds, ...definition.coverageProbes.flatMap(probe => probe.conceptIds)])],
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
