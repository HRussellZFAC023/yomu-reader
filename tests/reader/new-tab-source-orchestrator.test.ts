import { describe, expect, it } from 'vitest';
import { emptyNewTabLoadAccumulator, newTabLoadResult } from '../../src/reader/newtab/source-orchestrator';

describe('new tab source orchestrator', () => {
    it('carries the practice-word fallback notice through to the load result', () => {
        const accumulator = emptyNewTabLoadAccumulator();
        accumulator.fallbackNotice = true;
        accumulator.labels.push('Study words');

        const result = newTabLoadResult(accumulator, 'en');

        expect(result.fallbackNotice).toBe(true);
        expect(result.sourceLabel).toBe('Study words');
    });

    it('does not flag results that came from the requested review sources', () => {
        const result = newTabLoadResult(emptyNewTabLoadAccumulator(), 'en');
        expect(result.fallbackNotice).toBeUndefined();
    });
});
