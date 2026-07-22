import {
    createLessonZeroVowelWritingDefinition,
    evaluateLessonZeroVowelWriting,
} from '../../src/academy/content/lesson-zero-vowel-writing';
import {
    lessonZeroVowelWritingAveragePassScore,
    lessonZeroVowelWritingSessionSnapshotShapeIsValid,
    startLessonZeroVowelWritingSession,
    transitionLessonZeroVowelWritingSession,
} from '../../src/academy/domain/lesson-zero-vowel-writing-session';

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
    it('requires a passing child attempt for all five kana before completing the parent', () => {
        const { definition } = startInPlanMode();
        let { state } = startInPlanMode();

        definition.items.forEach((item, index) => {
            state = transitionLessonZeroVowelWritingSession(
                definition,
                state,
                { kind: 'learn-item', itemId: item.id },
                10 + index * 2,
            ).state;
            const evaluation = evaluateLessonZeroVowelWriting(definition, item, {
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
            expect(state.status).toBe(index === 4 ? 'complete' : 'active');
            expect(state.completedItemIds).toHaveLength(index + 1);
        });

        expect(state).toMatchObject({ stage: 'complete', completedItemIds: ['hira-a', 'hira-i', 'hira-u', 'hira-e', 'hira-o'] });
        expect(lessonZeroVowelWritingAveragePassScore(state)).toBe(1);
        expect(lessonZeroVowelWritingSessionSnapshotShapeIsValid(state)).toBe(true);
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
