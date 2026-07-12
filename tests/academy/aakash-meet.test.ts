import { choiceActivityPlugin } from '../../src/academy/activities/choice';
import { AAKASH_RAINY_DIRECTIONS_SCENE_ID, createAakashDirectionsActivity } from '../../src/academy/content/aakash-meet';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';

describe('Aakash rainy-directions bond beat', () => {
    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const model = createAakashDirectionsActivity();

    it('records direction evidence and a Yomu review seed', () => {
        expect(runtime.validate(model)).toEqual([]);
        const result = runtime.evaluate(model, 'straight-right');
        expect(result.result.outcome).toBe('pass');
        expect(result.attempt).toMatchObject({
            activityId: 'activity:aakash-rainy-directions',
            conceptIds: ['concept:directions-straight-right'],
        });
        expect(result.reviewSeeds[0]?.content.expression).toBe('まっすぐ行って、右です。');
        expect(AAKASH_RAINY_DIRECTIONS_SCENE_ID).toBe('scene:aakash-rainy-directions');
    });

    it('repairs a left/right confusion before retry', () => {
        const result = runtime.evaluate(model, 'straight-left');
        expect(result.result.outcome).toBe('lapse');
        expect(result.result.errorTags).toContain('direction-side-confusion');
        expect(result.result.feedback.repairPrompt?.ja).toContain('「左」を「右」に');
        expect(result.result.feedback.nearbyExample?.en).toContain('station');
    });
});
