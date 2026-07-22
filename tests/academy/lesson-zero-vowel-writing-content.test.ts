import {
    LESSON_ZERO_VOWEL_WRITING_CHILD_ACTIVITY_IDS,
    LESSON_ZERO_VOWEL_WRITING_ID,
    createLessonZeroVowelWritingDefinition,
    evaluateLessonZeroVowelWriting,
    lessonZeroVowelWritingCompletionEvaluation,
} from '../../src/academy/content/lesson-zero-vowel-writing';

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
