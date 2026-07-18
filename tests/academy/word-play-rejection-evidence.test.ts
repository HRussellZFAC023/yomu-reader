import { playShiritoriTurn, type ShiritoriState, type ShiritoriWord } from '../../src/academy/domain/word-play';

const word = (over: Partial<ShiritoriWord> = {}): ShiritoriWord => ({
    expression: '鹿',
    reading: 'しか',
    noun: true,
    conceptIds: ['word:deer'],
    ...over,
});

describe('shiritori rejection evidence (Kotoba Adapt decision)', () => {
    it('records a dead-end (final ん) as lapse evidence rather than a lost life', () => {
        const state: ShiritoriState = { usedReadings: [], requiredKana: ['し'] };
        const result = playShiritoriTurn(state, word({ expression: '新聞', reading: 'しんぶん', conceptIds: ['word:newspaper'] }), 10);
        expect(result).toMatchObject({ accepted: false, reason: 'ends-with-n' });
        if (result.accepted) throw new Error('expected rejection');
        expect(result.evidence).toMatchObject({
            kind: 'learning-evidence-recorded',
            modeId: 'shiritori',
            action: 'produce',
            outcome: 'lapse',
            conceptIds: ['word:newspaper'],
            independent: true,
            at: 10,
        });
        expect(result.evidence?.activityId).toBe('shiritori:しんぶん');
    });

    it('records a loop (reading reused) as lapse evidence', () => {
        const state: ShiritoriState = { usedReadings: ['しか'], requiredKana: ['し'] };
        const result = playShiritoriTurn(state, word(), 20);
        expect(result).toMatchObject({ accepted: false, reason: 'reading-used' });
        if (result.accepted) throw new Error('expected rejection');
        expect(result.evidence).toMatchObject({ outcome: 'lapse', conceptIds: ['word:deer'] });
    });

    it('records a wrong-start rule break as lapse evidence with the expected mora', () => {
        const state: ShiritoriState = { usedReadings: [], requiredKana: ['か'] };
        const result = playShiritoriTurn(state, word(), 30);
        expect(result).toMatchObject({ accepted: false, reason: 'wrong-start', expectedKana: ['か'] });
        if (result.accepted) throw new Error('expected rejection');
        expect(result.evidence).toMatchObject({ outcome: 'lapse' });
    });

    it('records a not-noun rule break as lapse evidence', () => {
        const state: ShiritoriState = { usedReadings: [], requiredKana: [] };
        const result = playShiritoriTurn(state, word({ expression: '走る', reading: 'はしる', noun: false, conceptIds: ['word:run'] }), 40);
        expect(result).toMatchObject({ accepted: false, reason: 'not-noun' });
        if (result.accepted) throw new Error('expected rejection');
        expect(result.evidence).toMatchObject({ outcome: 'lapse', conceptIds: ['word:run'] });
    });

    it('leaves an unknown word without evidence because no concept can be attributed', () => {
        const state: ShiritoriState = { usedReadings: [], requiredKana: ['し'] };
        const result = playShiritoriTurn(state, null, 50);
        expect(result).toMatchObject({ accepted: false, reason: 'unknown-word' });
        if (result.accepted) throw new Error('expected rejection');
        expect(result.evidence).toBeUndefined();
    });

    it('still emits pass evidence for a valid production turn', () => {
        const state: ShiritoriState = { usedReadings: ['すし'], requiredKana: ['し'] };
        const result = playShiritoriTurn(state, word(), 60);
        expect(result.accepted).toBe(true);
        if (!result.accepted) throw new Error('expected acceptance');
        expect(result.evidence).toMatchObject({ outcome: 'pass', action: 'produce' });
    });
});
