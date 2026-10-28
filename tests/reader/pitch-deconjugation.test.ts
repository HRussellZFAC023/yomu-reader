import { describe, expect, it, vi } from 'vitest';

import { localPitchResolutionFromMetaLookup } from '../../src/reader/lookup/pitch-meta';
import type { YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';

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
describe('deconjugated pitch fallback', () => {
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
