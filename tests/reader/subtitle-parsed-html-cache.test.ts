import { describe, expect, it } from 'vitest';
import { SubtitleParsedHtmlCache } from '../../src/reader/subtitles/parsed-html-cache';
import { DEFAULT_SETTINGS, makeSubtitleToken } from './subtitles-controller/fixtures';

const FULLY_ANNOTATED_HTML = [
    '<span class="jpdb-reader-word jpdb-reader-has-furi">',
    '<ruby><span class="jpdb-reader-ruby-base">悪口</span><rt class="jpdb-reader-furi">わるぐち</rt></ruby>',
    '</span>',
].join('');

const PARTIALLY_ANNOTATED_HTML = '<span class="jpdb-reader-word">悪口</span>';

function createParsedHtmlCache(parseContextKey: () => string = () => '0:ja:en'): SubtitleParsedHtmlCache {
    return new SubtitleParsedHtmlCache({
        getSettings: () => DEFAULT_SETTINGS,
        parseContextKey,
        shouldParseSubtitles: () => true,
        hasAuthoritativeParseTier: () => false,
        transcriptRowCount: () => 0,
    });
}

describe('subtitle parsed-html cache', () => {
    it('rejects late writes after the target-generation context changes', () => {
        let context = '0:ja:en';
        const cache = createParsedHtmlCache(() => context);
        const japaneseKey = cache.parseCacheKey('no');
        cache.rememberParsedCueHtml(japaneseKey, FULLY_ANNOTATED_HTML);

        context = '1:es:en';
        cache.invalidateParseContext();
        const spanishKey = cache.parseCacheKey('no');
        expect(spanishKey).not.toBe(japaneseKey);
        expect(() => cache.rememberParsedCueHtml(japaneseKey, PARTIALLY_ANNOTATED_HTML))
            .toThrow('Subtitle parse context changed');
        expect(cache.parsedHtmlCache.has(japaneseKey)).toBe(false);
        expect(cache.parsedHtmlCache.has(spanishKey)).toBe(false);
        expect(cache.cachedParsedCueHtml(japaneseKey, DEFAULT_SETTINGS)).toBeUndefined();
    });

    it('does not let a late cheap provisional parse overwrite an enriched cue', () => {
        const cache = createParsedHtmlCache();
        const key = cache.parseCacheKey('私も彼らの悪口を言いたくない');
        const enrichedTokens = [makeSubtitleToken('悪口', {
            reading: 'わるぐち',
            rubies: [{ start: 0, end: 2, length: 2, text: 'わるぐち' }],
        })];
        const cheapTokens = [makeSubtitleToken('悪口')];

        cache.rememberParsedCueHtml(key, FULLY_ANNOTATED_HTML, enrichedTokens, {
            provisional: true,
            enriched: true,
        });
        // Background warmup can finish after visible enrichment when both
        // parses were already in flight for the same cue.
        const lateWrite = cache.rememberParsedCueHtml(key, PARTIALLY_ANNOTATED_HTML, cheapTokens, {
            provisional: true,
            enriched: false,
        });

        expect(lateWrite).toEqual({ html: FULLY_ANNOTATED_HTML, provisional: true });
        expect(cache.provisionalParsedHtmlCache.get(key)).toBe(FULLY_ANNOTATED_HTML);
        expect(cache.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(true);
        expect(cache.parsedTokenCache.get(key)).toBe(enrichedTokens);
    });

    it('returns enriched canonical html instead of a late empty provisional result', () => {
        const cache = createParsedHtmlCache();
        const key = cache.parseCacheKey('悪口');
        const enrichedTokens = [makeSubtitleToken('悪口', {
            reading: 'わるぐち',
            rubies: [{ start: 0, end: 2, length: 2, text: 'わるぐち' }],
        })];
        cache.rememberParsedCueHtml(key, FULLY_ANNOTATED_HTML, enrichedTokens, {
            provisional: true,
            enriched: true,
        });

        const lateWrite = cache.rememberParsedCueHtml(key, '悪口', [], {
            provisional: true,
            enriched: false,
        });

        expect(lateWrite).toEqual({ html: FULLY_ANNOTATED_HTML, provisional: true });
        expect(cache.freshEmptyParsedHtml(key)).toBeUndefined();
        expect(cache.provisionalParsedHtmlCache.get(key)).toBe(FULLY_ANNOTATED_HTML);
        expect(cache.parsedTokenCache.get(key)).toBe(enrichedTokens);
    });

    it('still lets the authoritative tier supersede an enriched provisional cue', () => {
        const cache = createParsedHtmlCache();
        const key = cache.parseCacheKey('悪口');
        const provisionalTokens = [makeSubtitleToken('悪口', {
            reading: 'わるぐち',
            rubies: [{ start: 0, end: 2, length: 2, text: 'わるぐち' }],
        })];
        const authoritativeTokens = [makeSubtitleToken('悪口', { reading: 'わるくち' })];
        const authoritativeHtml = '<span class="jpdb-reader-word">authoritative</span>';

        cache.rememberParsedCueHtml(key, FULLY_ANNOTATED_HTML, provisionalTokens, {
            provisional: true,
            enriched: true,
        });
        const authoritativeWrite = cache.rememberParsedCueHtml(key, authoritativeHtml, authoritativeTokens);

        expect(authoritativeWrite).toEqual({ html: authoritativeHtml, provisional: false });
        expect(cache.parsedHtmlCache.get(key)).toBe(authoritativeHtml);
        expect(cache.provisionalParsedHtmlCache.has(key)).toBe(false);
        expect(cache.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(false);
        expect(cache.parsedTokenCache.get(key)).toBe(authoritativeTokens);
    });

    it('discards incomplete provisional state when a parser failure settles plain', () => {
        const cache = createParsedHtmlCache();
        const key = cache.parseCacheKey('悪口');
        const token = makeSubtitleToken('悪口');
        cache.rememberParsedCueHtml(key, PARTIALLY_ANNOTATED_HTML, [token], {
            provisional: true,
            enriched: false,
        });
        cache.incompleteEnrichmentAttempts.set(key, 2);
        cache.sessionParseCacheChecked.add(key);

        expect(cache.rememberPlainCueFallback(key, '悪口')).toBe('悪口');
        expect(cache.freshEmptyParsedHtml(key)).toBe('悪口');
        expect(cache.provisionalParsedHtmlCache.has(key)).toBe(false);
        expect(cache.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(false);
        expect(cache.incompleteEnrichmentAttempts.has(key)).toBe(false);
        expect(cache.sessionParseCacheChecked.has(key)).toBe(false);
        expect(cache.parsedTokenCache.has(key)).toBe(false);
    });
});
