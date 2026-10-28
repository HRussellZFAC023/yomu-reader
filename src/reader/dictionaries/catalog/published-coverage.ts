import { requestJson } from '../../network/http';

export const PUBLISHED_DICTIONARY_CATALOG_URL = 'https://dictionaries.yomureader.com/v1/catalog.json';

type JsonRequester = (url: string) => Promise<unknown>;

/**
 * Reads live, acquirable headword coverage from the published catalogue.
 * `languages.json.readiness` is deliberately not part of this interface.
 */
export async function publishedDictionaryHeadwordLanguages(
    requester: JsonRequester = requestPublishedCatalog,
): Promise<ReadonlySet<string>> {
    return acquirableHeadwordLanguages(await requester(PUBLISHED_DICTIONARY_CATALOG_URL));
}

export function acquirableHeadwordLanguages(value: unknown): ReadonlySet<string> {
    const entries = (value as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) return new Set();
    return new Set(
        entries.flatMap(entry => {
            const candidate = entry as {
                distribution?: { state?: unknown };
                headwordLanguages?: unknown;
            } | null;
            const state = candidate?.distribution?.state;
            if (
                (state !== 'published' && state !== 'upstream')
                || !Array.isArray(candidate?.headwordLanguages)
            ) return [];
            return candidate.headwordLanguages
                .filter((language): language is string => typeof language === 'string' && Boolean(language.trim()))
                .map(language => language.trim().toLowerCase().split('-')[0]!);
        }),
    );
}

function requestPublishedCatalog(url: string): Promise<unknown> {
    return requestJson(url, {
        allowDirectCrossOrigin: true,
        failureLabel: 'Published dictionary catalogue request',
        preferFetch: true,
        timeoutMs: 15_000,
    });
}
