import { describe, expect, it, vi } from 'vitest';

import { composeCompoundPitchPatternFromMeta } from '../../src/reader/lookup/pitch-meta';
import type { YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';

function pitchEntry(reading: string, position: number): YomitanMetaEntry {
    return { mode: 'pitch', data: { reading, pitches: [{ position }] } } as unknown as YomitanMetaEntry;
}

function bankLookup(bank: Record<string, YomitanMetaEntry[]>) {
    return vi.fn(async (expression: string) => bank[expression] ?? []);
}

describe('composeCompoundPitchPatternFromMeta', () => {
    it('composes 登録者数 from constituent bank rows when the whole compound has none', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('しゃ', 1)],
            数: [pitchEntry('すう', 1)],
        });
        const pattern = await composeCompoundPitchPatternFromMeta('登録者数', 'とうろくしゃすう', lookup);
        // 登録 LHHH(+H particle dropped) + 者 H(L dropped) + 数 HLL (final keeps particle level)
        expect(pattern).toBe('LHHHHHLL');
    });

    it('never colours a compound when any constituent is missing from the bank', async () => {
        const lookup = bankLookup({ 登録: [pitchEntry('とうろく', 0)] });
        await expect(composeCompoundPitchPatternFromMeta('登録者数', 'とうろくしゃすう', lookup)).resolves.toBe('');
    });

    it('rejects constituents whose stored reading does not align with the compound reading', async () => {
        const lookup = bankLookup({
            者数: [pitchEntry('もの', 0)],
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('もの', 0)],
            数: [pitchEntry('かず', 0)],
        });
        await expect(composeCompoundPitchPatternFromMeta('登録者数', 'とうろくしゃすう', lookup)).resolves.toBe('');
    });

    it('does not re-run the whole-compound lookup the caller already tried', async () => {
        const lookup = bankLookup({ 話題: [pitchEntry('わだい', 0)] });
        await expect(composeCompoundPitchPatternFromMeta('話題', 'わだい', lookup)).resolves.toBe('');
        expect(lookup).not.toHaveBeenCalledWith('話題');
    });

    it('matches katakana card readings against hiragana bank rows', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('しゃ', 1)],
            数: [pitchEntry('すう', 1)],
        });
        const pattern = await composeCompoundPitchPatternFromMeta('登録者数', 'トウロクシャスウ', lookup);
        expect(pattern).toBe('LHHHHHLL');
    });

    it('never splits a mora: a constituent reading may not strand a small kana', async () => {
        const lookup = bankLookup({
            会: [pitchEntry('かい', 1), pitchEntry('か', 1)],
            社: [pitchEntry('しゃ', 1)],
        });
        // かいしゃ must segment as かい+しゃ, not か+いしゃ (い would strand nothing
        // here, but the し of 社 must not be able to bind the ゃ-less prefix).
        await expect(composeCompoundPitchPatternFromMeta('会社', 'かいしゃ', lookup)).resolves.toBe('HLHL');
    });

    it('backtracks when the greedy longest constituent dead-ends', async () => {
        const lookup = bankLookup({
            日本: [pitchEntry('にほん', 2), pitchEntry('にっぽん', 3)],
            日: [pitchEntry('ひ', 0)],
            本人: [pitchEntry('ほんにん', 1)],
        });
        // 日本+人 fails (人 missing); 日 misaligns; but 日本(にほん) rejected only if
        // 人 lookup fails — full consumption must fail cleanly, not throw.
        await expect(composeCompoundPitchPatternFromMeta('日本人', 'にほんじん', lookup)).resolves.toBe('');
    });
});
