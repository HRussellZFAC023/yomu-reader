import type { JPDBToken } from '../types';
import { pruneOldestCacheEntries } from './cache-utils';

export interface ParsedTokenCacheEntry {
    promise: Promise<JPDBToken[]>;
    tokens?: JPDBToken[];
}

export function loadCachedParsedTokens(
    cache: Map<string, ParsedTokenCacheEntry>,
    key: string,
    limit: number,
    parse: () => Promise<JPDBToken[]>,
    shouldCache: (tokens: JPDBToken[]) => boolean,
): Promise<JPDBToken[]> {
    const cached = cache.get(key);
    if (cached) return cached.tokens ? Promise.resolve(cached.tokens) : cached.promise;

    const entry: ParsedTokenCacheEntry = { promise: Promise.resolve([]) };
    entry.promise = parse()
        .then(tokens => {
            if (shouldCache(tokens)) entry.tokens = tokens;
            else if (cache.get(key) === entry) cache.delete(key);
            return tokens;
        })
        .catch(error => {
            if (cache.get(key) === entry) cache.delete(key);
            throw error;
        });
    cache.set(key, entry);
    pruneOldestCacheEntries(cache, limit);
    return entry.promise;
}
