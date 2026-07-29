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
    const entries = isRecord(value) && Array.isArray(value.entries) ? value.entries : [];
    const languages = new Set<string>();
    for (const entry of entries) {
        if (!isRecord(entry) || !isAcquirableDistribution(entry.distribution)) continue;
        if (!Array.isArray(entry.headwordLanguages)) continue;
        for (const language of entry.headwordLanguages) {
            if (typeof language === 'string' && language.trim()) {
                languages.add(language.trim().toLowerCase().split('-')[0]!);
            }
        }
    }
    return languages;
}

function requestPublishedCatalog(url: string): Promise<unknown> {
    return requestJson(url, {
        allowDirectCrossOrigin: true,
        failureLabel: 'Published dictionary catalogue request',
        preferFetch: true,
        timeoutMs: 15_000,
    });
}

function isAcquirableDistribution(value: unknown): boolean {
    return isRecord(value) && (value.state === 'published' || value.state === 'upstream');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
