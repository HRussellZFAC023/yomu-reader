import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Node ingestion script has no declaration file.
import { fetchTadokuCatalog, parseTadokuCatalog as parseSource, validateTadokuRefresh, TADOKU_CATALOG_URL } from '../../scripts/library/tadoku-catalog.mjs';

const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;
const parseTadokuCatalog = (body: string) => parseSource(page(body));

const genre = '<label><input name="genre[]" value="135"><div class="fb-genre-jp">動物</div><div class="fb-genre-en">Animals</div></label>';
const item = (id = '1', title = '猫の本', level = 'l0', genres = '["135"]', href = `https://tadoku.org/japanese/book/${id}/`) =>
    `<div class="freebooks-book-item" data-level="${level}" data-genres='${genres}'><div class="bl-thumb"><img src="https://tadoku.org/japanese/wp-content/uploads/${id}.jpg"></div><div class="bl-title"><a href="${href}">${title}</a></div></div>`;

describe('Tadoku catalogue ingestion', () => {
    it('keeps every record with its source identity, title, level and genres', () => {
        const catalog = parseTadokuCatalog(genre + item() + item('2', '<ruby>犬<rt>いぬ</rt></ruby>の本', 'l-start'));
        expect(catalog.sourceItemCount).toBe(2);
        expect(catalog.books).toEqual([
            { id: '1', title: '猫の本', level: 'l0', genreIds: ['135'], sourceUrl: 'https://tadoku.org/japanese/book/1/', coverUrl: 'https://tadoku.org/japanese/wp-content/uploads/1.jpg' },
            { id: '2', title: '犬の本', level: 'l-start', genreIds: ['135'], sourceUrl: 'https://tadoku.org/japanese/book/2/', coverUrl: 'https://tadoku.org/japanese/wp-content/uploads/2.jpg' },
        ]);
        expect(catalog.genres).toEqual([{ id: '135', label: { ja: '動物', en: 'Animals' } }]);
    });

    it.each([
        ['empty response', '<h1>Unavailable</h1>'],
        ['missing catalogue', genre],
        ['duplicate book', genre + item() + item()],
        ['unknown level', genre + item('1', '猫', 'l6')],
        ['unknown genre', genre + item('1', '猫', 'l0', '["999"]')],
        ['missing title', genre + item('1', '')],
        ['foreign URL', genre + item('1', '猫', 'l0', '[]', 'https://example.com/japanese/book/1/')],
        ['invalid URL', genre + item('1', '猫', 'l0', '[]', 'javascript:alert(1)')],
    ])('rejects %s instead of publishing an apparently complete partial catalogue', (_name, html) => {
        expect(() => parseTadokuCatalog(html)).toThrow();
    });

    it('does not run embedded source scripts or include descriptions and private reviews', () => {
        const catalog = parseTadokuCatalog(genre + item('1', '猫 &amp; 犬') + '<script>throw new Error("executed")</script><p>private review text</p>');
        expect(catalog.books[0].title).toBe('猫 & 犬');
        expect(JSON.stringify(catalog)).not.toContain('private review');
    });

    it('rejects an upstream failure rather than replacing the catalogue with an empty list', async () => {
        const fetcher = vi.fn(async () => new Response('Unavailable', { status: 503 }));
        await expect(fetchTadokuCatalog(fetcher)).rejects.toThrow('HTTP 503');
        expect(fetcher).toHaveBeenCalledWith(TADOKU_CATALOG_URL, expect.objectContaining({ redirect: 'error' }));
    });

    it('permits new books and corrected metadata but refuses a silent loss of existing source IDs', () => {
        const previous = parseTadokuCatalog(genre + item());
        expect(() => validateTadokuRefresh(parseTadokuCatalog(genre + item('1', '新しい題名') + item('2')), previous)).not.toThrow();
        expect(() => validateTadokuRefresh(parseTadokuCatalog(genre + item('2')), previous)).toThrow('omitted 1 existing books');
        expect(() => validateTadokuRefresh(parseTadokuCatalog(genre + item('1', '猫', 'l0', '[]')), previous)).toThrow('erased existing genres');
    });

    it('rejects truncation even when the last source ID and part of its title survived', () => {
        const complete = page(genre + item());
        expect(() => parseSource(complete.slice(0, complete.indexOf('猫の本') + 1))).toThrow('Incomplete');
        expect(() => parseSource(genre + item())).toThrow('Incomplete');
        expect(parseSource(complete + '<!-- upstream cache footer -->').books).toHaveLength(1);
    });
});
