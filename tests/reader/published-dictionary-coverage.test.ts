import { describe, expect, it, vi } from 'vitest';

import {
    PUBLISHED_DICTIONARY_CATALOG_URL,
    acquirableHeadwordLanguages,
    publishedDictionaryHeadwordLanguages,
} from '../../src/reader/dictionaries/catalog/published-coverage';

describe('published dictionary coverage', () => {
    const catalogue = {
        entries: [
            {
                id: 'published-spanish',
                headwordLanguages: ['es-MX'],
                distribution: { state: 'published' },
                readiness: 'not-ready',
            },
            {
                id: 'upstream-korean',
                headwordLanguages: ['ko'],
                distribution: { state: 'upstream' },
                readiness: 'not-ready',
            },
            {
                id: 'blocked-english',
                headwordLanguages: ['en'],
                distribution: { state: 'blocked' },
                readiness: 'ready',
            },
            {
                id: 'source-only-french',
                headwordLanguages: ['fr'],
                distribution: { state: 'source-only' },
                readiness: 'ready',
            },
        ],
    };

    it('derives availability only from acquirable live catalogue entries', () => {
        expect([...acquirableHeadwordLanguages(catalogue)]).toEqual(['es', 'ko']);
    });

    it('requests the published catalogue instead of a generated readiness file', async () => {
        const requester = vi.fn().mockResolvedValue(catalogue);

        await expect(publishedDictionaryHeadwordLanguages(requester)).resolves.toEqual(
            new Set(['es', 'ko']),
        );
        expect(requester).toHaveBeenCalledOnce();
        expect(requester).toHaveBeenCalledWith(PUBLISHED_DICTIONARY_CATALOG_URL);
    });
});
