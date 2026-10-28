import { describe, expect, it } from 'vitest';
import { escapeAnkiSearchText, quoteAnkiSearch } from '../../src/reader/anki/search-escape';

describe('anki search escaping', () => {
    it('escapes wildcards so quoted terms match literally', () => {
        // Inside Anki double quotes, * and _ still act as wildcards.
        expect(quoteAnkiSearch('Core_2k')).toBe('"Core\\_2k"');
        expect(quoteAnkiSearch('読む*')).toBe('"読む\\*"');
    });

    it('escapes quotes and backslashes', () => {
        expect(quoteAnkiSearch('say "yes"')).toBe('"say \\"yes\\""');
        expect(quoteAnkiSearch('a\\b')).toBe('"a\\\\b"');
    });

    it('keeps deck nesting colons unescaped so subdecks stay included', () => {
        expect(quoteAnkiSearch('Japanese::Mining')).toBe('"Japanese::Mining"');
    });

    it('leaves plain Japanese terms untouched', () => {
        expect(escapeAnkiSearchText('日本語')).toBe('日本語');
        expect(quoteAnkiSearch('にほんご')).toBe('"にほんご"');
    });
});
