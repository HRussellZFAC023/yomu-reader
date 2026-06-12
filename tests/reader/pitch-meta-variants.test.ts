import { describe, expect, it } from 'vitest';

import { localPitchPatternFromMeta, localPitchPatternsFromMeta } from '../../src/reader/lookup/pitch-meta';
import type { YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';

function pitchMeta(data: unknown): YomitanMetaEntry {
    return { expression: 'はし', mode: 'pitch', data, dictionary: 'probe-pitch' } as YomitanMetaEntry;
}

// UT-65: words commonly have several accepted accents — surface all of them,
// not just the first dictionary hit.
describe('localPitchPatternsFromMeta', () => {
    it('returns every distinct pattern from a pitches array', () => {
        const patterns = localPitchPatternsFromMeta('はし', [
            pitchMeta({ reading: 'はし', pitches: [{ position: 0 }, { position: 1 }] }),
        ]);
        expect(patterns).toHaveLength(2);
        expect(new Set(patterns).size).toBe(2);
    });

    it('merges across entries and dedupes repeated positions', () => {
        const patterns = localPitchPatternsFromMeta('はし', [
            pitchMeta({ reading: 'はし', position: 1 }),
            pitchMeta({ reading: 'はし', pitches: [{ position: 1 }, { position: 2 }] }),
            pitchMeta({ reading: 'ちがう', position: 0 }),
        ]);
        expect(patterns).toHaveLength(2);
    });

    it('keeps the single-pattern helper behavior', () => {
        expect(localPitchPatternFromMeta('はし', [pitchMeta({ reading: 'はし', position: 0 })])).toBeTruthy();
        expect(localPitchPatternFromMeta('はし', [])).toBe('');
    });
});
