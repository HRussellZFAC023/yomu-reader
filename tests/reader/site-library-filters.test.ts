import { describe, expect, it } from 'vitest';
import catalog from '../../config/library/tadoku.catalog.json';
import { libraryFilterUrl, normalizeLibraryQuery, readLibraryFilters } from '../../docs/.vitepress/theme/library-filters';

describe('reading library search', () => {
    it.each(['きつね', 'キツネ', 'ｷﾂﾈ'])('finds the same catalogue titles for %s', query => {
        const matches = catalog.books.filter(book => normalizeLibraryQuery(book.title).includes(normalizeLibraryQuery(query)));
        expect(matches.map(book => book.id)).toContain('45891');
        expect(matches.map(book => book.id)).toContain('3146');
    });
    it('keeps Latin width and case folding, without removing Japanese voicing', () => {
        expect(normalizeLibraryQuery(' ＴＫＧ ')).toBe('tkg');
        expect(normalizeLibraryQuery('ガ')).toBe('が');
        expect(normalizeLibraryQuery('が')).not.toBe(normalizeLibraryQuery('か'));
    });
    it('round-trips filters while retaining unrelated parameters and the fragment', () => {
        const filters = { query: '猫 & 犬', level: 'l0', genre: '135' };
        const url = new URL(libraryFilterUrl('https://yomureader.com/library/?from=read#books', filters));
        expect(readLibraryFilters(url.search, ['l0'], ['135'])).toEqual(filters);
        expect(url.searchParams.get('from')).toBe('read');
        expect(url.hash).toBe('#books');
        const cleared = new URL(libraryFilterUrl(url.href, { query: '', level: '', genre: '' }));
        expect(cleared.search).toBe('?from=read');
    });
    it('ignores invalid level and genre values in a shared link', () => {
        expect(readLibraryFilters('?q=猫&level=garbage&genre=unknown', ['l0'], ['135']))
            .toEqual({ query: '猫', level: '', genre: '' });
    });
});
