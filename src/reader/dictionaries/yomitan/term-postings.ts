import { dictionaryEnabled } from './ranking';
import { glossaryCursorSearchExpired } from './sampling';
import type { DictionaryPreference } from '../../app/types';
import type { GlossaryCursorSearchOptions, YomitanTermEntry } from './types';

type DictionaryRank = Map<string, DictionaryPreference>;

/**
 * termSearch and termKanji are derived indexes over `terms`. Their rows are
 * postings — a search key plus the id of the term row that owns it — never
 * copies of the term. Earlier schemas cloned the entire term row (glossary,
 * inlined images and all) into every posting, so one imported term cost up to
 * TERM_SEARCH_INDEX_MAX_TOKENS_PER_TERM copies of itself on disk.
 *
 * The trade is one extra `terms` read per surviving posting, which is why
 * every collector here takes a budget: postings are candidates, the caller
 * re-ranks them, and only the survivors are worth hydrating.
 */
export interface YomitanTermSearchPosting {
    id?: number;
    token: string;
    dictionary: string;
    termId: number;
}

export interface YomitanTermKanjiPosting {
    id?: number;
    character: string;
    dictionary: string;
    termId: number;
}

export function termSearchPostings(
    entry: YomitanTermEntry,
    tokens: string[],
): YomitanTermSearchPosting[] {
    const termId = entry.id;
    if (typeof termId !== 'number') return [];
    return tokens.map(token => ({ token, dictionary: entry.dictionary, termId }));
}

export function termKanjiPostings(
    entry: YomitanTermEntry,
    characters: string[],
): YomitanTermKanjiPosting[] {
    const termId = entry.id;
    if (typeof termId !== 'number') return [];
    return characters.map(character => ({ character, dictionary: entry.dictionary, termId }));
}

/**
 * Read the term rows a set of postings point at. Missing ids are skipped
 * rather than failing the read: a posting can outlive its term row between a
 * dictionary delete and the derived index rebuild, and a stale posting must
 * degrade to "no result" instead of breaking the whole lookup.
 */
export function hydrateTermsByIds(db: IDBDatabase, ids: number[]): Promise<Map<number, YomitanTermEntry>> {
    return new Promise((resolve, reject) => {
        const result = new Map<number, YomitanTermEntry>();
        if (!ids.length) {
            resolve(result);
            return;
        }
        const store = db.transaction('terms', 'readonly').objectStore('terms');
        let pending = ids.length;
        const settleOne = () => {
            pending -= 1;
            if (pending === 0) resolve(result);
        };
        for (const id of ids) {
            const request = store.get(id);
            request.onsuccess = () => {
                const value = request.result as YomitanTermEntry | undefined;
                if (value) result.set(id, value);
                settleOne();
            };
            request.onerror = () => reject(request.error ?? new Error('Could not load local dictionary terms by id.'));
        }
    });
}

/** Term ids whose expression contains `character`, in index order. */
export function collectTermKanjiPostingIds(
    db: IDBDatabase,
    character: string,
    budget: number,
    rank: DictionaryRank,
): Promise<number[]> {
    return new Promise((resolve, reject) => {
        const ids: number[] = [];
        const seenIds = new Set<number>();
        const request = db.transaction('termKanji', 'readonly')
            .objectStore('termKanji')
            .index('character')
            .openCursor(IDBKeyRange.only(character));
        request.onerror = () => reject(request.error ?? new Error('Could not search local dictionary kanji index.'));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || ids.length >= budget) {
                resolve(ids);
                return;
            }
            const posting = cursor.value as YomitanTermKanjiPosting;
            if (dictionaryEnabled(posting.dictionary, rank)
                && typeof posting.termId === 'number'
                && !seenIds.has(posting.termId)) {
                seenIds.add(posting.termId);
                ids.push(posting.termId);
            }
            cursor.continue();
        };
    });
}

/** Glossary-token postings over a prefix range, one per term id. */
export function collectTermSearchPostings(
    db: IDBDatabase,
    range: IDBKeyRange,
    budget: number,
    rank: DictionaryRank,
    options: GlossaryCursorSearchOptions,
): Promise<YomitanTermSearchPosting[]> {
    return new Promise((resolve, reject) => {
        const postings: YomitanTermSearchPosting[] = [];
        const seenTermIds = new Set<number>();
        const startedAt = performance.now();
        let visited = 0;
        const request = db.transaction('termSearch', 'readonly')
            .objectStore('termSearch')
            .index('token')
            .openCursor(range);
        request.onerror = () => reject(request.error ?? new Error('Could not search local dictionary glossary index.'));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || postings.length >= budget || glossaryCursorSearchExpired(options, visited, startedAt)) {
                resolve(postings);
                return;
            }
            visited++;
            const posting = cursor.value as YomitanTermSearchPosting;
            if (dictionaryEnabled(posting.dictionary, rank)
                && typeof posting.termId === 'number'
                && !seenTermIds.has(posting.termId)) {
                seenTermIds.add(posting.termId);
                postings.push(posting);
            }
            cursor.continue();
        };
    });
}

/**
 * Hydrated term entries for a posting id list, deduplicated by
 * expression/reading. Two dictionaries can post the same pair, so the id list
 * is collected with headroom and trimmed to `limit` only after hydration.
 */
export function dedupedTermsForPostingIds(
    termIds: number[],
    terms: Map<number, YomitanTermEntry>,
    limit: number,
): YomitanTermEntry[] {
    const entries: YomitanTermEntry[] = [];
    const seen = new Set<string>();
    for (const termId of termIds) {
        if (entries.length >= limit) break;
        const entry = terms.get(termId);
        if (!entry) continue;
        const key = `${entry.expression}\n${entry.reading}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push(entry);
    }
    return entries;
}
