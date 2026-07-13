import { choiceActivityPlugin } from '../../src/academy/activities/choice';
import { bandEntrySceneId, createBandEntryActivity } from '../../src/academy/content/band-entry';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import type { JlptBand } from '../../src/academy/domain/learner-record';

describe('level-matched midstream entry', () => {
    const bands: readonly JlptBand[] = ['n5', 'n4', 'n3', 'n2', 'n1'];
    const runtime = createActivityRuntime([choiceActivityPlugin]);

    it.each(bands)('provides a valid, review-producing %s transfer task', band => {
        const model = createBandEntryActivity(band);
        const correct = model.payload.options.find(option => option.correct);
        expect(runtime.validate(model)).toEqual([]);
        expect(correct).toBeDefined();

        const evaluation = runtime.evaluate(model, correct!.id);
        expect(evaluation.result.outcome).toBe('pass');
        expect(evaluation.attempt.activityId).toBe(`activity:band-entry:${band}`);
        expect(evaluation.reviewSeeds).toHaveLength(1);
        expect(bandEntrySceneId(band)).toBe(`scene:band-entry:${band}`);
    });

    it.each(bands)('gives a precise repair and nearby example for a wrong %s response', band => {
        const model = createBandEntryActivity(band);
        const wrong = model.payload.options.find(option => !option.correct);
        const evaluation = runtime.evaluate(model, wrong!.id);

        expect(evaluation.result.outcome).toBe('lapse');
        expect(evaluation.result.errorTags).not.toHaveLength(0);
        expect(evaluation.result.feedback.repairPrompt?.en).toBeTruthy();
        expect(evaluation.result.feedback.repairPrompt?.ja).toBeTruthy();
        expect(evaluation.result.feedback.nearbyExample?.en).toBeTruthy();
        expect(evaluation.result.feedback.nearbyExample?.ja).toBeTruthy();
    });

    it('uses Alex\'s confirmed Latin name in Japanese content', () => {
        const model = createBandEntryActivity('n3');
        const visibleJapanese = [
            model.prompt.en,
            model.prompt.ja,
            ...model.payload.options.flatMap(option => [
                option.label.ja,
                option.explanation?.ja,
                option.repairPrompt?.ja,
                option.nearbyExample?.ja,
            ]),
        ].filter(Boolean).join('\n');
        expect(visibleJapanese).toContain('Alexさん');
        expect(visibleJapanese).not.toContain('アレックス');
    });
});
