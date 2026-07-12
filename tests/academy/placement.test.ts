import { ORIENTATION_MOCK_ITEMS, scoreOrientationMock } from '../../src/academy/placement/orientation';

describe('orientation placement mock', () => {
    it('reports receptive skills separately and recommends without locking', () => {
        const result = scoreOrientationMock('n3', {
            'orientation:knowledge:reason': 'because',
            'orientation:reading:change': 'six-thirty',
            'orientation:listening:library': 'six-fifty',
        }, { speaking: 0.5, writing: 0.25 });

        expect(result.scores).toEqual({
            'language-knowledge': 1,
            reading: 1,
            listening: 0,
            'speaking-confidence': 0.5,
            'writing-confidence': 0.25,
        });
        expect(result.recommendedBand).toBe('n3');
        expect(result.calibration).toBe('vertical-slice');
        expect(result.itemIds).toEqual(ORIENTATION_MOCK_ITEMS.map(item => item.id));
    });

    it('steps down conservatively when the evidence is weak', () => {
        const result = scoreOrientationMock('n2', {}, { speaking: -1, writing: 2 });
        expect(result.recommendedBand).toBe('n4');
        expect(result.scores['speaking-confidence']).toBe(0);
        expect(result.scores['writing-confidence']).toBe(1);
    });
});
