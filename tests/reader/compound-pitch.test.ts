import { describe, expect, it, vi } from 'vitest';

import { composeCompoundPitchPatternFromMeta, composeCompoundPitchSegmentsFromMeta, localPitchPatternsFromMetaLookup, localPitchResolutionFromMetaLookup } from '../../src/reader/lookup/pitch-meta';
import { compoundPitchGradientCss } from '../../src/reader/lookup/pitch-accent';
import { renderPitchGraphSvg } from '../../src/reader/popup/pitch';
import { ReaderParser, type ReaderParserParseOptions } from '../../src/reader/lookup/parser';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import type { YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';

function pitchEntry(reading: string, position: number): YomitanMetaEntry {
    return { mode: 'pitch', data: { reading, pitches: [{ position }] } } as unknown as YomitanMetaEntry;
}

function bankLookup(bank: Record<string, YomitanMetaEntry[]>) {
    return vi.fn(async (expression: string) => bank[expression] ?? []);
}

function localCompoundCard(vid: number): JPDBCard {
    return {
        vid,
        sid: vid,
        rid: 0,
        spelling: '登録者数',
        reading: 'とうろくしゃすう',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
    };
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

    it('composes a kanji-stem compound via a reading-keyed constituent (国内向け)', async () => {
        // 向け has no surface bank headword, but its reading むけ does (Kanjium
        // keys kana rows). The reading-key fallback resolves the tail so the
        // compound gets a real pitch instead of staying grey.
        const withReadingRow = bankLookup({
            国内: [pitchEntry('こくない', 0)],
            むけ: [pitchEntry('むけ', 0)],
        });
        const composed = await composeCompoundPitchPatternFromMeta('国内向け', 'こくないむけ', withReadingRow);
        expect(composed).toMatch(/^[LH]+$/);
        expect(composed.length).toBeGreaterThanOrEqual(6);

        // Without the reading-keyed tail row it stays grey (graceful, no guess).
        const withoutTail = bankLookup({ 国内: [pitchEntry('こくない', 0)] });
        await expect(composeCompoundPitchPatternFromMeta('国内向け', 'こくないむけ', withoutTail)).resolves.toBe('');
    });

    it('composes the mixed-kana compound もう一度 from constituent pitch rows', async () => {
        const lookup = bankLookup({
            もう: [pitchEntry('もう', 1)],
            一度: [pitchEntry('いちど', 0)],
        });

        const composed = await composeCompoundPitchPatternFromMeta('もう一度', 'もういちど', lookup);
        expect(composed).toBe('HLLHHH');
    });

    it('declines a reading-keyed constituent when the reading is ambiguous', async () => {
        // Two distinct pitches under reading むけ = ambiguous; the fallback must
        // decline rather than mis-colour a homograph.
        const ambiguous = bankLookup({
            国内: [pitchEntry('こくない', 0)],
            むけ: [pitchEntry('むけ', 0), pitchEntry('むけ', 2)],
        });
        await expect(composeCompoundPitchPatternFromMeta('国内向け', 'こくないむけ', ambiguous)).resolves.toBe('');
    });

    it('reading-key matches only the FINAL constituent (surface-aligned, no mid-compound mis-tile)', async () => {
        // Only reading-keyed rows, no surface rows: 国内 (non-final) cannot resolve
        // via reading key, so the compound stays grey instead of mis-tiling
        // 国内向→こくない + け→むけ (the surface/reading misalignment a whole-prefix
        // reading fallback would allow).
        const readingOnly = bankLookup({
            こくない: [pitchEntry('こくない', 0)],
            むけ: [pitchEntry('むけ', 0)],
        });
        await expect(composeCompoundPitchPatternFromMeta('国内向け', 'こくないむけ', readingOnly)).resolves.toBe('');
    });

    it('resolves a non-final okurigana stem via its reading row (食べ物)', async () => {
        // 食べ has no surface bank headword, but its reading たべ does. The kana
        // okurigana (べ) pins the reading boundary against the compound reading,
        // so this is surface-aligned and safe to resolve even though 食べ is not
        // the final constituent.
        const lookup = bankLookup({
            たべ: [pitchEntry('たべ', 2)],
            物: [pitchEntry('もの', 2)],
        });
        const composed = await composeCompoundPitchPatternFromMeta('食べ物', 'たべもの', lookup);
        // 食べ contributes 2 morae (particle level dropped, non-final); 物 keeps
        // its final particle level → 2 + 3 = 5 levels for a 4-mora reading.
        expect(composed).toMatch(/^[LH]+$/);
        expect(composed).toBe('LHLHL');
    });

    it('does not reading-key a non-final pure-kanji constituent (no okurigana anchor)', async () => {
        // 国内 is pure kanji with no okurigana to pin the reading boundary; a
        // reading-key match on an arbitrary prefix could mis-tile, so it must
        // stay grey when only reading rows exist for the non-final part.
        const readingOnly = bankLookup({
            こくない: [pitchEntry('こくない', 0)],
            むけ: [pitchEntry('むけ', 0)],
        });
        await expect(composeCompoundPitchPatternFromMeta('国内向け', 'こくないむけ', readingOnly)).resolves.toBe('');
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

describe('localPitchPatternsFromMetaLookup', () => {
    it('uses direct metadata before reading-keyed or compound fallbacks', async () => {
        const lookup = bankLookup({
            計量: [pitchEntry('けいりょう', 0)],
            けいりょう: [pitchEntry('けいりょう', 1)],
            計: [pitchEntry('けい', 1)],
            量: [pitchEntry('りょう', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('計量', 'けいりょう', lookup)).resolves.toEqual(['LHHHH']);
        expect(lookup).toHaveBeenCalledWith('計量');
        expect(lookup).not.toHaveBeenCalledWith('けいりょう');
    });

    it('retries kana reading metadata before composing constituents', async () => {
        const lookup = bankLookup({
            これ等: [],
            これら: [pitchEntry('これら', 1)],
            これ: [pitchEntry('これ', 1)],
            等: [pitchEntry('ら', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('これ等', 'これら', lookup)).resolves.toEqual(['HLLL']);
        expect(lookup).toHaveBeenCalledWith('これ等');
        expect(lookup).toHaveBeenCalledWith('これら');
        expect(lookup).not.toHaveBeenCalledWith('これ');
    });

    it('composes compound pitch after whole-word and reading-keyed misses', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('しゃ', 1)],
            数: [pitchEntry('すう', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('登録者数', 'とうろくしゃすう', lookup)).resolves.toEqual(['LHHHHHLL']);
    });

    it('can skip compound fallback when a caller only wants whole-word variants', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('しゃ', 1)],
            数: [pitchEntry('すう', 1)],
        });

        await expect(localPitchPatternsFromMetaLookup('登録者数', 'とうろくしゃすう', lookup, { includeCompound: false })).resolves.toEqual([]);
        expect(lookup).not.toHaveBeenCalledWith('登録');
    });
});

describe('compound pitch segments', () => {
    it('exposes per-constituent segments with their readings for two-colour rendering', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('しゃ', 1)],
            数: [pitchEntry('すう', 1)],
        });
        const segments = await composeCompoundPitchSegmentsFromMeta('登録者数', 'とうろくしゃすう', lookup);
        expect(segments.map(segment => segment.reading)).toEqual(['とうろく', 'しゃ', 'すう']);
        expect(segments.map(segment => segment.pattern).join('')).toBe('LHHHHHLL');
    });

    it('resolution reports compound segments alongside the composed pattern', async () => {
        const lookup = bankLookup({
            登録: [pitchEntry('とうろく', 0)],
            者: [pitchEntry('しゃ', 1)],
            数: [pitchEntry('すう', 1)],
        });
        const resolution = await localPitchResolutionFromMetaLookup('登録者数', 'とうろくしゃすう', lookup);
        expect(resolution.patterns).toEqual(['LHHHHHLL']);
        expect(resolution.compoundSegments).toHaveLength(3);
    });

    it('direct bank hits carry no compound segments', async () => {
        const lookup = bankLookup({ 安定: [pitchEntry('あんてい', 0)] });
        const resolution = await localPitchResolutionFromMetaLookup('安定', 'あんてい', lookup);
        expect(resolution.patterns.length).toBeGreaterThan(0);
        expect(resolution.compoundSegments).toBeUndefined();
    });

    it('retains 双子座流星群 component boundaries beside its exact whole-word pitch', async () => {
        const lookup = bankLookup({
            双子座流星群: [pitchEntry('ふたござりゅうせいぐん', 0)],
            双子座: [pitchEntry('ふたござ', 0)],
            流星群: [pitchEntry('りゅうせいぐん', 3)],
        });
        const resolution = await localPitchResolutionFromMetaLookup(
            '双子座流星群',
            'ふたござりゅうせいぐん',
            lookup,
            { includeDirectCompoundSegments: true },
        );

        expect(resolution.patterns).toEqual(['LHHHHHHHHHH']);
        expect(resolution.compoundSegments?.map(segment => segment.reading)).toEqual(['ふたござ', 'りゅうせいぐん']);
        expect(resolution.compoundSegments?.map(segment => segment.pattern)).toEqual(['LHHH', 'LHHLLLL']);
    });

    it('builds a two-colour underline gradient weighted by contributed morae', () => {
        const gradient = compoundPitchGradientCss([
            { pattern: 'LHHH', reading: 'とうろく' },
            { pattern: 'HLL', reading: 'しゃすう' },
        ]);
        expect(gradient).toContain('linear-gradient(to right');
        expect(gradient).toContain('var(--jpdb-reader-pitch-heiban) 0.0% 57.1%');
        expect(gradient).toContain('var(--jpdb-reader-pitch-atamadaka) 57.1% 100.0%');
    });

    it('draws the compound graph with per-constituent colours and a connected contour', () => {
        const svg = renderPitchGraphSvg('とうろくしゃすう', 'LHHHHHLL', {
            segments: [
                { pattern: 'LHHHH', reading: 'とうろくしゃ' },
                { pattern: 'HLL', reading: 'すう' },
            ],
        });
        expect(svg).toContain('polyline class="heiban"');
        expect(svg).toContain('polyline class="atamadaka"');
        expect(svg).toContain('circle class="heiban"');
        expect(svg).toContain('circle class="atamadaka"');
    });
});

describe('compound pitch resolution caches', () => {
    const settings: ReaderSettings = {
        ...DEFAULT_SETTINGS,
        localDictionariesEnabled: true,
        showPitchAccent: true,
    };
    const bank = {
        登録: [pitchEntry('とうろく', 0)],
        者: [pitchEntry('しゃ', 1)],
        数: [pitchEntry('すう', 1)],
    };

    it('reapplies parser compound segments to each card served from the pitch cache', async () => {
        const lookupTermMeta = bankLookup(bank);
        const parser = new ReaderParser({
            getSettings: () => settings,
            jpdb: {} as never,
            dictionaries: { lookupTermMeta } as never,
        }) as unknown as {
            localPitchPattern(card: JPDBCard, options: ReaderParserParseOptions): Promise<string>;
        };
        const first = localCompoundCard(101);
        const repeated = localCompoundCard(102);

        await expect(parser.localPitchPattern(first, {})).resolves.toBe('LHHHHHLL');
        const callsAfterMiss = lookupTermMeta.mock.calls.length;
        await expect(parser.localPitchPattern(repeated, {})).resolves.toBe('LHHHHHLL');

        expect(repeated.pitchSegments).toEqual(first.pitchSegments);
        expect(repeated.pitchSegments?.map(segment => segment.reading)).toEqual(['とうろく', 'しゃ', 'すう']);
        expect(lookupTermMeta).toHaveBeenCalledTimes(callsAfterMiss);
    });

    it('reapplies app enrichment compound segments to each card served from the pitch cache', async () => {
        const lookupTermMeta = bankLookup(bank);
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            dictionaries: { lookupTermMeta: typeof lookupTermMeta };
            localPitchPatternForCard(card: JPDBCard): Promise<string>;
        };
        app.settings = settings;
        app.dictionaries = { lookupTermMeta };
        const first = localCompoundCard(201);
        const repeated = localCompoundCard(202);

        await expect(app.localPitchPatternForCard(first)).resolves.toBe('LHHHHHLL');
        const callsAfterMiss = lookupTermMeta.mock.calls.length;
        await expect(app.localPitchPatternForCard(repeated)).resolves.toBe('LHHHHHLL');

        expect(repeated.pitchSegments).toEqual(first.pitchSegments);
        expect(repeated.pitchSegments?.map(segment => segment.reading)).toEqual(['とうろく', 'しゃ', 'すう']);
        expect(lookupTermMeta).toHaveBeenCalledTimes(callsAfterMiss);
    });
});
