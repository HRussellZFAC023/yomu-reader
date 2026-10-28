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
        const patterns = localPitchPatternsFromMeta('はし', 'はし', [
            pitchMeta({ reading: 'はし', pitches: [{ position: 0 }, { position: 1 }] }),
        ]);
        expect(patterns).toHaveLength(2);
        expect(new Set(patterns).size).toBe(2);
    });

    it('merges across entries and dedupes repeated positions', () => {
        const patterns = localPitchPatternsFromMeta('はし', 'はし', [
            pitchMeta({ reading: 'はし', position: 1 }),
            pitchMeta({ reading: 'はし', pitches: [{ position: 1 }, { position: 2 }] }),
            pitchMeta({ reading: 'ちがう', position: 0 }),
        ]);
        expect(patterns).toHaveLength(2);
    });

    it('keeps the single-pattern helper behavior', () => {
        expect(localPitchPatternFromMeta('はし', 'はし', [pitchMeta({ reading: 'はし', position: 0 })])).toBeTruthy();
        expect(localPitchPatternFromMeta('はし', 'はし', [])).toBe('');
    });

    it('accepts Yomitan pitch records whose position is an H/L pattern string', () => {
        expect(localPitchPatternFromMeta('はし', 'はし', [pitchMeta({ reading: 'はし', position: 'LH' })])).toBe('LH');
        expect(localPitchPatternsFromMeta('はし', 'はし', [
            pitchMeta({ reading: 'はし', pitches: [{ position: 'HL' }] }),
        ])).toEqual(['HL']);
    });

    it('continues to parse numeric position strings as downstep numbers', () => {
        expect(localPitchPatternFromMeta('はし', 'はし', [pitchMeta({ reading: 'はし', position: '1' })])).toBe('HLL');
    });

    it('matches a katakana card reading against the hiragana stored reading', () => {
        expect(localPitchPatternFromMeta('はし', 'ハシ', [pitchMeta({ reading: 'はし', position: 1 })])).toBeTruthy();
    });

    it('rejects a mismatched stored reading even when it is the only candidate', () => {
        expect(localPitchPatternFromMeta('はし', 'ちがうよ', [
            pitchMeta({ reading: 'はし', position: 1 }),
            pitchMeta({ reading: 'はし', position: 2 }),
        ])).toBe('');
        expect(localPitchPatternFromMeta('はし', 'こい', [
            pitchMeta({ reading: 'はし', position: 1 }),
            pitchMeta({ reading: 'あめ', position: 0 }),
        ])).toBe('');
    });

    it('requires normalized exact expression identity as well as reading identity', () => {
        expect(localPitchPatternFromMeta('Ａ', 'はし', [
            { ...pitchMeta({ reading: 'はし', position: 1 }), expression: 'A' },
        ])).toBeTruthy();
        expect(localPitchPatternFromMeta('橋', 'はし', [
            { ...pitchMeta({ reading: 'はし', position: 1 }), expression: '箸' },
        ])).toBe('');
    });
});
