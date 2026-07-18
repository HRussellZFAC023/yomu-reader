import { describe, expect, it } from 'vitest';
import { renderKanjiKeywordChips } from '../../src/reader/popup/kanji-keyword-line';

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
