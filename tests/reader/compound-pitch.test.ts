import { describe, expect, it, vi } from 'vitest';

import { localPitchPatternsFromMetaLookup, localPitchResolutionFromMetaLookup } from '../../src/reader/lookup/pitch-meta';
import { alignedExpressionComponentPitches, renderExpressionComponentPitches } from '../../src/reader/popup/pitch';
import type { JPDBCard } from '../../src/reader/app/types';
import type { YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';

function pitchEntry(reading: string, position: number): YomitanMetaEntry {
    return { mode: 'pitch', data: { reading, pitches: [{ position }] } } as unknown as YomitanMetaEntry;
}

function bankLookup(bank: Record<string, YomitanMetaEntry[]>) {
    return vi.fn(async (expression: string) => bank[expression] ?? []);
}

describe('whole-word pitch evidence', () => {
    it('uses an exact expression-and-reading row as the whole-word contour', async () => {
        const lookup = bankLookup({
            双子座流星群: [pitchEntry('ふたござりゅうせいぐん', 3)],
            双子座: [pitchEntry('ふたござ', 0)],
            流星群: [pitchEntry('りゅうせいぐん', 3)],
        });

        const resolution = await localPitchResolutionFromMetaLookup('双子座流星群', 'ふたござりゅうせいぐん', lookup);

        expect(resolution.patterns).toHaveLength(1);
        expect(resolution.patterns[0]).toMatch(/^[HL]+$/);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('双子座流星群');
    });

    it('keeps the whole word unknown when only component pitch rows exist', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('しゃ', 1)],
            数: [pitchEntry('すう', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('登録者数', 'とうろくしゃすう', lookup)).resolves.toEqual([]);
        expect(lookup).toHaveBeenCalledWith('登録者数');
        expect(lookup).toHaveBeenCalledWith('とうろくしゃすう');
        expect(lookup).not.toHaveBeenCalledWith('登録');
        expect(lookup).not.toHaveBeenCalledWith('者');
        expect(lookup).not.toHaveBeenCalledWith('数');
    });

    it('accepts an exact reading-key row without consulting components', async () => {
        const lookup = bankLookup({
            これら: [pitchEntry('これら', 1)],
            これ: [pitchEntry('これ', 1)],
            等: [pitchEntry('ら', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('これ等', 'これら', lookup)).resolves.toEqual(['HLLL']);
        expect(lookup).not.toHaveBeenCalledWith('これ');
        expect(lookup).not.toHaveBeenCalledWith('等');
    });
});

describe('component pitch evidence', () => {
    it('renders aligned component pitches as separately labelled graphs', () => {
        const card = {
            spelling: '登録者数',
            reading: 'とうろくしゃすう',
            wordWithReading: null,
        } satisfies Pick<JPDBCard, 'spelling' | 'reading' | 'wordWithReading'>;
        const components = [
            { text: '登録', reading: 'とうろく' },
            { text: '者数', reading: 'しゃすう' },
        ];
        const componentPitches = [
            { ...components[0], pitch: 'LHHHH' },
            { ...components[1], pitch: 'LHLL' },
        ];

        const aligned = alignedExpressionComponentPitches(card, components, componentPitches);
        const html = renderExpressionComponentPitches(aligned);

        expect(aligned).toEqual(componentPitches);
        expect(html).toContain('jpdb-reader-pitch-components');
        expect(html).toContain('jpdb-reader-pitch-component-label');
        expect(html).toContain('登録');
        expect(html).toContain('者数');
    });

    it('does not label partial or reading-misaligned evidence as the compound', () => {
        const card = { spelling: '登録者数', reading: 'とうろくしゃすう', wordWithReading: null };
        const components = [{ text: '登録', reading: 'とうろく' }, { text: '者数', reading: 'しゃすう' }];
        const partial = [{ text: '登録', reading: 'とうろく', pitch: 'LHHHH' }];

        expect(alignedExpressionComponentPitches(card, components, partial)).toEqual([]);
        expect(renderExpressionComponentPitches([])).toBe('');
    });
});
