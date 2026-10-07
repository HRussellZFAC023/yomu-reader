import { describe, expect, it } from 'vitest';
import {
    DEFAULT_DICTIONARY_LOOKUP_LINKS,
    defaultDictionaryLookupLinks,
    normalizeDictionaryLookupLinkSettings,
} from '../../../src/reader/settings/dictionary';

describe('lookup pill row', () => {
    it('ships the Japanese pill row unchanged', () => {
        expect(defaultDictionaryLookupLinks('local').map(({ priority, ...link }) => link))
            .toEqual(DEFAULT_DICTIONARY_LOOKUP_LINKS.map(({ priority, ...link }) => link));
    });

    it('drops the built-in pills earlier versions gave other learning targets, and keeps custom ones', () => {
        const custom = { id: 'custom-1', label: 'Mine', urlTemplate: 'https://example.com/?q={query}', enabled: true, priority: 1 };
        const links = normalizeDictionaryLookupLinkSettings({
            dictionaryLookupLinks: [
                { id: 'rae', label: 'RAE', urlTemplate: 'https://dle.rae.es/{query}', enabled: true, priority: 0 },
                custom,
                { id: 'naver', label: 'Naver', urlTemplate: 'https://dict.naver.com/{query}', enabled: true, priority: 2 },
            ],
        });
        const ids = links.map(link => link.id);
        expect(ids).not.toContain('rae');
        expect(ids).not.toContain('naver');
        expect(ids).toContain('custom-1');
        for (const builtIn of DEFAULT_DICTIONARY_LOOKUP_LINKS) expect(ids).toContain(builtIn.id);
    });
});
