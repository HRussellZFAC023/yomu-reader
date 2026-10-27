import { describe, expect, it } from 'vitest';

import { localPitchPatternFromMeta, localPitchPatternsFromMeta } from '../../src/reader/lookup/pitch-meta';
import type { YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';
import { vi } from "vitest";
import { localPitchResolutionFromMetaLookup } from "../../src/reader/lookup/pitch-meta";

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

describe('deconjugated pitch fallback', () => {
    function pitchMeta(expression: string, data: unknown): YomitanMetaEntry {
        return { expression, mode: 'pitch', data, dictionary: 'probe-pitch' } as YomitanMetaEntry;
    }

    function metaLookup(bank: Record<string, YomitanMetaEntry[]>) {
        return vi.fn(async (expression: string) => bank[expression] ?? []);
    }

    // Entries whose lemma is itself inflected (問わず — jiten lexicalises it) miss
    // the exact dictionary-form pitch lookup even though the base verb is listed.
    // The fallback deinflects and projects the base accent onto the surface
    // reading — but only for heiban bases, whose contour is exact in every
    // conjugation.

    it('projects a heiban base onto the inflected surface (問わず → 問う)', async () => {
        const lookup = metaLookup({ 問う: [pitchMeta('問う', { reading: 'とう', position: 0 })] });
        const resolution = await localPitchResolutionFromMetaLookup('問わず', 'とわず', lookup);
        expect(resolution.patterns).toEqual(['LHHH']);
        expect(lookup).toHaveBeenCalledWith('問う');
    });

    it('refuses to guess a projected accent for an accented base', async () => {
        const lookup = metaLookup({ 問う: [pitchMeta('問う', { reading: 'とう', position: 1 })] });
        const resolution = await localPitchResolutionFromMetaLookup('問わず', 'とわず', lookup);
        expect(resolution.patterns).toEqual([]);
    });

    it('projects heiban when the base lists it among several accents', async () => {
        const lookup = metaLookup({
            問う: [pitchMeta('問う', { reading: 'とう', pitches: [{ position: 1 }, { position: 0 }] })],
        });
        const resolution = await localPitchResolutionFromMetaLookup('問わず', 'とわず', lookup);
        expect(resolution.patterns).toEqual(['LHHH']);
    });

    it('bails when the reading does not carry the inflected suffix', async () => {
        const lookup = metaLookup({ 問う: [pitchMeta('問う', { reading: 'とう', position: 0 })] });
        const resolution = await localPitchResolutionFromMetaLookup('問わず', 'とい', lookup);
        expect(resolution.patterns).toEqual([]);
    });

    it('still prefers the exact-form entry when the dictionary has one', async () => {
        const lookup = metaLookup({
            問わず: [pitchMeta('問わず', { reading: 'とわず', position: 2 })],
            問う: [pitchMeta('問う', { reading: 'とう', position: 0 })],
        });
        const resolution = await localPitchResolutionFromMetaLookup('問わず', 'とわず', lookup);
        expect(resolution.patterns).toEqual(['LHLL']);
        expect(lookup).not.toHaveBeenCalledWith('問う');
    });

    it('covers kana-only polite forms of heiban verbs (いきます → いく)', async () => {
        const lookup = metaLookup({ いく: [pitchMeta('いく', { reading: 'いく', position: 0 })] });
        const resolution = await localPitchResolutionFromMetaLookup('いきます', 'いきます', lookup);
        expect(resolution.patterns).toEqual(['LHHHH']);
    });
});
