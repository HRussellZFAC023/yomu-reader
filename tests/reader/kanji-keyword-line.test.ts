import { describe, expect, it } from 'vitest';
import { renderKanjiKeywordChips } from '../../src/reader/popup/kanji-keyword-line';
import { renderKanjiKeywordLine } from '../../src/reader/popup/rtk-info';
import { renderJitenKanjiKeywordLine } from '../../src/reader/jiten/jiten-kanji-info-render';
import type { JpdbKanjiInfo } from '../../src/reader/jpdb/jpdb-kanji';
import type { JitenKanjiInfo } from '../../src/reader/dictionaries/jiten';
import type { RtkInfo } from '../../src/reader/kanji/rtk';

function parse(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

describe('renderKanjiKeywordChips', () => {
    it('merges agreeing sources into one chip with a combined badge', () => {
        const root = parse(renderKanjiKeywordChips([
            { text: 'water', label: 'JPDB', canonical: true },
            { text: 'Water', label: 'RTK' },
            { text: 'water', label: 'dict' },
        ], 'en'));
        const chips = root.querySelectorAll('.jpdb-reader-kanji-keyword');
        expect(chips).toHaveLength(1);
        expect(chips[0]?.querySelector('.jpdb-reader-kanji-keyword-source')?.textContent).toBe('JPDB/RTK/dict');
        expect(chips[0]?.querySelector('.jpdb-reader-kanji-keyword-text')?.textContent).toBe('water');
        expect(chips[0]?.hasAttribute('data-canonical')).toBe(true);
    });

    it('keeps distinct keywords as separate chips in source-priority order', () => {
        const root = parse(renderKanjiKeywordChips([
            { text: 'adhere', label: 'Jiten', canonical: true },
            { text: 'glue', label: 'RTK' },
            { text: 'sticky', label: 'dict' },
        ], 'en'));
        const texts = Array.from(root.querySelectorAll('.jpdb-reader-kanji-keyword-text')).map(node => node.textContent);
        expect(texts).toEqual(['adhere', 'glue', 'sticky']);
        const chips = root.querySelectorAll('.jpdb-reader-kanji-keyword');
        expect(chips[0]?.hasAttribute('data-canonical')).toBe(true);
        expect(chips[1]?.hasAttribute('data-canonical')).toBe(false);
    });

    it('adds a distinct Kanji Alive primary gloss after JPDB and RTK', () => {
        const root = parse(renderKanjiKeywordLine(
            { keyword: 'birth' } as unknown as JpdbKanjiInfo,
            { keyword: 'live' } as unknown as RtkInfo,
            [],
            'en',
            { kanjiAliveKeyword: 'life' },
        ));
        const chips = Array.from(root.querySelectorAll('.jpdb-reader-kanji-keyword'));
        expect(chips.map(chip => chip.querySelector('.jpdb-reader-kanji-keyword-text')?.textContent)).toEqual(['birth', 'live', 'life']);
        expect(chips[2]?.querySelector('.jpdb-reader-kanji-keyword-source')?.textContent).toBe('Kanji Alive');
        expect(chips[2]?.hasAttribute('data-canonical')).toBe(false);
    });

    it('merges an agreeing Kanji Alive gloss into the canonical primary chip', () => {
        const root = parse(renderKanjiKeywordLine(
            { keyword: 'Life' } as unknown as JpdbKanjiInfo,
            null,
            [],
            'en',
            { kanjiAliveKeyword: 'life' },
        ));
        const chip = root.querySelector('.jpdb-reader-kanji-keyword');
        expect(root.querySelectorAll('.jpdb-reader-kanji-keyword')).toHaveLength(1);
        expect(chip?.querySelector('.jpdb-reader-kanji-keyword-source')?.textContent).toBe('JPDB/Kanji Alive');
        expect(chip?.hasAttribute('data-canonical')).toBe(true);
    });

    it('uses the same Kanji Alive source in the Japanese Jiten row without untranslated copy', () => {
        const root = parse(renderJitenKanjiKeywordLine(
            { meanings: ['birth'] } as unknown as JitenKanjiInfo,
            null,
            [],
            'ja',
            { kanjiAliveKeyword: 'life' },
        ));
        expect(root.textContent).toContain('Kanji Alive');
        expect(root.textContent).toContain('life');
        expect(root.textContent).not.toContain('未翻訳');
    });

    it('caps visible chips at five and renders an overflow chip listing the rest', () => {
        const root = parse(renderKanjiKeywordChips(
            ['one', 'two', 'three', 'four', 'five', 'six', 'seven'].map(text => ({ text, label: 'dict' })),
            'en',
        ));
        expect(root.querySelectorAll('.jpdb-reader-kanji-keyword:not(.jpdb-reader-kanji-keyword-more)')).toHaveLength(5);
        const more = root.querySelector('.jpdb-reader-kanji-keyword-more');
        expect(more?.textContent).toBe('+2');
        expect(more?.getAttribute('title')).toBe('six · seven');
    });

    it('renders the unavailable help line when no keywords exist', () => {
        const root = parse(renderKanjiKeywordChips([{ text: '  ', label: 'RTK' }], 'en'));
        expect(root.querySelector('.jpdb-reader-kanji-keyword')).toBeNull();
        expect(root.querySelector('.jpdb-reader-help')).not.toBeNull();
    });

    it('escapes keyword text and titles', () => {
        const root = parse(renderKanjiKeywordChips([{ text: '<b>x</b>', label: 'RTK' }], 'en'));
        expect(root.querySelector('.jpdb-reader-kanji-keyword-text')?.textContent).toBe('<b>x</b>');
        expect(root.querySelector('.jpdb-reader-kanji-keyword-text b')).toBeNull();
    });
});
