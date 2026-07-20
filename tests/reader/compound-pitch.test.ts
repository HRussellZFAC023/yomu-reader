import { describe, expect, it, vi } from 'vitest';

import { localPitchPatternsFromMetaLookup, localPitchResolutionFromMetaLookup } from '../../src/reader/lookup/pitch-meta';
import { alignedExpressionComponentPitches, renderExpressionComponentPitches } from '../../src/reader/popup/pitch';
import type { JPDBCard } from '../../src/reader/app/types';
import type { YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';

function pitchEntry(expression: string, reading: string, position: number): YomitanMetaEntry {
    return { expression, mode: 'pitch', data: { reading, pitches: [{ position }] }, dictionary: 'probe-pitch' };
}

function bankLookup(bank: Record<string, YomitanMetaEntry[]>) {
    return vi.fn(async (expression: string) => bank[expression] ?? []);
}

describe('whole-word pitch evidence', () => {
    it('uses an exact expression-and-reading row as the whole-word contour', async () => {
        const lookup = bankLookup({
            双子座流星群: [pitchEntry('双子座流星群', 'ふたござりゅうせいぐん', 3)],
            双子座: [pitchEntry('双子座', 'ふたござ', 0)],
            流星群: [pitchEntry('流星群', 'りゅうせいぐん', 3)],
        });

        const resolution = await localPitchResolutionFromMetaLookup('双子座流星群', 'ふたござりゅうせいぐん', lookup);

        expect(resolution.patterns).toHaveLength(1);
        expect(resolution.patterns[0]).toMatch(/^[HL]+$/);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('双子座流星群');
    });

    it('keeps the whole word unknown when only component pitch rows exist', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('登録', 'とうろく', 0)],
            者: [pitchEntry('者', 'しゃ', 1)],
            数: [pitchEntry('数', 'すう', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('登録者数', 'とうろくしゃすう', lookup)).resolves.toEqual([]);
        expect(lookup).toHaveBeenCalledWith('登録者数');
        expect(lookup).not.toHaveBeenCalledWith('とうろくしゃすう');
        expect(lookup).not.toHaveBeenCalledWith('登録');
        expect(lookup).not.toHaveBeenCalledWith('者');
        expect(lookup).not.toHaveBeenCalledWith('数');
    });

    it('does not substitute a reading-key row for missing exact-expression evidence', async () => {
        const lookup = bankLookup({
            これら: [pitchEntry('これら', 'これら', 1)],
            これ: [pitchEntry('これ', 'これ', 1)],
            等: [pitchEntry('等', 'ら', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('これ等', 'これら', lookup)).resolves.toEqual([]);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('これ等');
        expect(lookup).not.toHaveBeenCalledWith('これら');
        expect(lookup).not.toHaveBeenCalledWith('これ');
        expect(lookup).not.toHaveBeenCalledWith('等');
    });

    it('rejects a lone mismatched stored reading instead of reshaping its contour for the target', async () => {
        const lookup = bankLookup({
            日本代表: [pitchEntry('日本代表', 'にほんだいひょう', 2)],
        });

        await expect(localPitchPatternsFromMetaLookup('日本代表', 'にっぽんだいひょう', lookup)).resolves.toEqual([]);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('日本代表');
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

    it('labels the pitched morpheme of a partial decomposition on its own', () => {
        const card = { spelling: '登録者数', reading: 'とうろくしゃすう', wordWithReading: null };
        const components = [{ text: '登録', reading: 'とうろく' }, { text: '者数', reading: 'しゃすう' }];
        const partial = [{ text: '登録', reading: 'とうろく', pitch: 'LHHHH' }];

        // 者数 has no bank entry; 登録's accent still earns its own labelled
        // graph rather than the whole compound going pitch-less.
        expect(alignedExpressionComponentPitches(card, components, partial)).toEqual(partial);
        const html = renderExpressionComponentPitches(alignedExpressionComponentPitches(card, components, partial));
        expect(html).toContain('登録');
        expect(html).not.toContain('者数');
    });

    it('voids the fallback when the components do not reconstruct the reading', () => {
        const card = { spelling: '登録者数', reading: 'とうろくしゃすう', wordWithReading: null };
        // 者数 → しゃかず no longer lines up with the card reading after 登録, so
        // the substrings are misaligned and nothing is labelled even permissively.
        const components = [{ text: '登録', reading: 'とうろく' }, { text: '者数', reading: 'しゃかず' }];
        const pitches = [{ text: '登録', reading: 'とうろく', pitch: 'LHHHH' }];

        expect(alignedExpressionComponentPitches(card, components, pitches)).toEqual([]);
        expect(renderExpressionComponentPitches([])).toBe('');
    });
});
