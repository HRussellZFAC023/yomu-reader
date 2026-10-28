import { describe, expect, it } from 'vitest';

import { InlineTermCandidateCollector } from '../../src/reader/dictionaries/yomitan/inline-term-candidates';
import { JAPANESE_LEARNING_TARGET } from '../../src/reader/languages/japanese';

describe('inline term candidates', () => {
    it('confines start positions to the window while a surface may cross its end', () => {
        const source = '本を読んだ';
        const candidates = new InlineTermCandidateCollector().collect(JAPANESE_LEARNING_TARGET, source, 2, 3);

        expect(candidates.has('本')).toBe(false);
        expect(candidates.has('を読')).toBe(false);
        expect(candidates.get('読んだ')).toContainEqual(expect.objectContaining({ start: 2, end: 5, surface: '読んだ' }));
        expect(candidates.get('読む')).toContainEqual(expect.objectContaining({ start: 2, end: 5, surface: '読んだ' }));
    });
});
