import { deinflectJapaneseTerm } from '../../lookup/deinflect';
import {
    isSearchableJapaneseSurface,
    rankedDictionaryEntries,
    readIndexRequestValues,
    requestTermMatchIndex,
    sortedTermMatchExpressions,
    termMatchesForEntries,
    type TermMatchCandidates,
} from './term-match';
import { uiText } from '../../app/i18n';
import { Logger } from '../../app/logger';
import { normalizeDictionaryPreferences } from '../../settings/index';
import type { DictionaryPreference, InterfaceLanguage } from '../../app/types';
import { readBlobText, readDexieTableRowCounts, streamDexieTables } from './dexie-stream';
import { fileSummary, filenameFromUrl, formatBytes, formatPercent, namedBlobFile, requestBlob, safeHost } from './file-utils';
import { renderDictionaryScopedStyles } from './glossary';
import { glossaryValueToSearchText, normalizeGlossarySearchText } from './glossary-text';
import { JAPANESE_RE, splitTags } from './row-coerce';
import {
    dictionaryCountsFromSummary,
    dictionaryTypeFromCounts,
    dictionaryTypesFromReaderExport,
    hasTermDictionaryRows,
    importEntryStores,
    isEntryStoreName,
    isReaderDictionaryExport,
    readerExportDictionaryInfo,
    readerExportDictionaryNames,
    readerExportSummary,
    readerExportTerms,
    type ReaderDictionaryExport,
} from './dictionary-type';
import { readZipArchive, type ZipArchive } from './zip';
import {
    compareMetaEntries,
    dictionaryEnabled,
    dictionaryPriority,
    dictionaryRank,
    extractFrequency,
    nonOverlappingMatches,
} from './ranking';
import {
    normalizeDexieTermRow,
    normalizeDexieDictionaryRow,
    normalizeDexieKanjiRow,
    normalizeDexieTermMetaRow,
    normalizeDexieKanjiMetaRow,
} from './dexie-normalize';
import type {
    DictionarySummary,
    EntryStoreName,
    ImportSummary,
    StoreName,
    YomitanDictionaryInfo,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanTermEntry,
    YomitanTermMatch,
} from './types';

const DB_NAME = 'jpdb-popup-reader-yomitan';
const DB_VERSION = 4;
const DEXIE_IMPORT_BATCH_SIZE = 5000;
const DICTIONARY_DELETE_BATCH_SIZE = 5000;
const DEXIE_PROGRESS_INTERVAL = DEXIE_IMPORT_BATCH_SIZE;
const STORE_WRITE_BATCH_SIZE = 1000;
const ZIP_IMPORT_FLUSH_ENTRY_LIMIT = 10000;
const HOT_LOOKUP_CACHE_TTL_MS = 2000;
const TOP_TERM_EXPRESSION_ENTRY_LIMIT = 500;
const TERM_SEARCH_INDEX_BATCH_SIZE = 300;
const TERM_SEARCH_INDEX_MAX_TOKENS_PER_TERM = 40;
const TERM_SEARCH_INDEX_MIN_TOKEN_LENGTH = 2;
const TERM_SEARCH_INDEX_MIN_SUFFIX_LENGTH = 3;
const TERM_SEARCH_PREFIX_BOUNDARY = String.fromCharCode(0xf8ff);
const TERM_SEARCH_LEGACY_FALLBACK_MAX_ROWS = 12000;
const TERM_SEARCH_LEGACY_FALLBACK_MAX_MS = 140;
const TERM_SEARCH_INDEX_CURSOR_MAX_ROWS = 8000;
const TERM_SEARCH_INDEX_CURSOR_MAX_MS = 180;
const TERM_SEARCH_DEFAULT_CANDIDATE_LIMIT = 240;
const RANDOM_TERM_LIST_MAX_ROWS = 20000;
const RANDOM_TERM_LIST_MAX_MS = 220;
const RANDOM_TOP_TERM_LIST_MAX_ROWS = 30000;
const RANDOM_TOP_TERM_LIST_MAX_MS = 320;
const TERM_KANJI_INDEX_BATCH_SIZE = 5000;
const TERM_KANJI_INDEX_FALLBACK_MAX_ROWS = 12000;
const TERM_KANJI_INDEX_FALLBACK_MAX_MS = 140;
const DB_DELETE_BLOCKED_TIMEOUT_MS = 12000;
const DB_FACTORY_RESET_DELETE_TIMEOUT_MS = 2500;
const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const log = Logger.scope('Yomitan');

type InternalStoreName = StoreName | 'termKanji';
type UiTextKey = Parameters<typeof uiText>[1];
type UiTextLookup = (key: UiTextKey) => string;

interface TermSearchCandidate {
    entry: YomitanTermEntry;
    rank: number;
}

interface YomitanTermSearchEntry extends YomitanTermEntry {
    token: string;
}

interface YomitanTermKanjiEntry extends YomitanTermEntry {
    character: string;
}

interface GlossaryCursorSearchOptions {
    maxRows?: number;
    maxMs?: number;
}

interface TermIndexQuery {
    indexName: string;
    range: IDBKeyRange;
    limit: number;
}

interface StoreCursorScanOptions {
    storeName: StoreName;
    maxRows: number;
    maxMs: number;
    errorMessage: string;
}

interface TermSearchOptions {
    candidateLimit?: number;
    glossaryIndexMaxRows?: number;
    glossaryIndexMaxMs?: number;
    glossaryFallbackMaxRows?: number;
    glossaryFallbackMaxMs?: number;
    prepareIndex?: boolean;
    fallbackWhileIndexing?: boolean;
}

interface HotLookupCacheEntry<T> {
    expiresAt: number;
    promise: Promise<T>;
}

export type {
    DictionarySummary,
    ImportSummary,
    YomitanDictionaryInfo,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanTermEntry,
    YomitanTermMatch,
} from './types';
export { glossaryToHtml, glossaryToText, renderDictionaryScopedStyles } from './glossary';
export { parseYomitanSettingsExport } from './settings-import';

type YomitanZipIndex = { title?: string; format?: number; version?: number; revision?: string };
interface RandomTopTermOptions {
    fallbackToRandom?: boolean;
    maxRows?: number;
    maxMs?: number;
    fallbackMaxRows?: number;
    fallbackMaxMs?: number;
}

// Best-effort: browsers may prompt or silently deny; either way the request
// marks the origin as a persistence candidate (Safari honors it for
// frequently-used and Home-Screen sites).
let persistentStorageRequested = false;
function requestPersistentDictionaryStorage(): void {
    if (persistentStorageRequested) return;
    persistentStorageRequested = true;
    try {
        void navigator.storage?.persist?.().then(granted => {
            log.info('Persistent storage request', { granted });
        }).catch(() => undefined);
    } catch {
        // navigator.storage unavailable (older WebKit) — nothing to do.
    }
}

export class YomitanDictionaryStore {
    private dbPromise?: Promise<IDBDatabase>;
    private dictionaryInfoPromise?: Promise<YomitanDictionaryInfo[]>;
    private summaryPromise?: Promise<DictionarySummary>;
    private dictionaryStyleCssCache = new Map<string, string>();
    private termSearchIndexPromise?: Promise<void>;
    private termKanjiIndexPromise?: Promise<void>;
    private termKanjiIndexReady = false;
    private termIndexGeneration = 0;
    private hotLookupCache = new Map<string, HotLookupCacheEntry<unknown>>();

    constructor(
        private readonly getCorsProxyUrl: () => string = () => '',
        private readonly getInterfaceLanguage: () => InterfaceLanguage = () => 'en',
    ) {}

    private text(key: UiTextKey): string {
        return uiText(this.getInterfaceLanguage(), key);
    }

    prepareTermSearchIndex(): Promise<void> {
        if (this.termSearchIndexPromise) return this.termSearchIndexPromise;
        const promise = this.db()
            .then(db => this.ensureTermSearchIndex(db))
            .catch(error => {
                log.warn('Term search index preparation failed', { error });
            })
            .finally(() => {
                if (this.termSearchIndexPromise === promise) this.termSearchIndexPromise = undefined;
            });
        this.termSearchIndexPromise = promise;
        return this.termSearchIndexPromise;
    }

    private hotLookupCacheKey(kind: string, values: Array<string | number>, preferences: DictionaryPreference[]): string {
        return JSON.stringify([kind, ...values, normalizeDictionaryPreferences(preferences)]);
    }

    private getHotLookup<T>(key: string, factory: () => Promise<T>): Promise<T> {
        const now = performance.now();
        const cached = this.hotLookupCache.get(key) as HotLookupCacheEntry<T> | undefined;
        if (cached && cached.expiresAt > now) return cached.promise;
        const entry: HotLookupCacheEntry<T> = {
            expiresAt: Number.POSITIVE_INFINITY,
            promise: Promise.resolve()
                .then(factory)
                .then(
                    value => {
                        entry.expiresAt = performance.now() + HOT_LOOKUP_CACHE_TTL_MS;
                        return value;
                    },
                    error => {
                        if (this.hotLookupCache.get(key) === entry) this.hotLookupCache.delete(key);
                        throw error;
                    },
                ),
        };
        this.hotLookupCache.set(key, entry as HotLookupCacheEntry<unknown>);
        return entry.promise;
    }

    async lookup(expression: string, reading: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        return this.getHotLookup(
            this.hotLookupCacheKey('lookup', [expression, reading, limit], preferences),
            async () => {
                const done = log.time('Term lookup', { expression, reading, limit, dictionaries: preferences.length });
                try {
                    const db = await this.db();
                    const entries = await this.getTermLookupEntries(
                        db,
                        expression,
                        reading && reading !== expression ? reading : '',
                        Math.max(limit * 40, 500),
                        Math.max(limit * 20, 250),
                    );

                    const rank = dictionaryRank(preferences);
                    const seen = new Set<string>();
                    const results = rankedDictionaryEntries(
                        entries,
                        rank,
                        undefined,
                        (a, b) =>
                            dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)
                            || Number(b.expression === expression) - Number(a.expression === expression)
                            || Number(b.reading === reading) - Number(a.reading === reading)
                            || (b.score ?? 0) - (a.score ?? 0),
                    ).filter(entry => {
                            const key = termLookupDedupKey(entry);
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        })
                        .slice(0, limit);
                    return results;
                } catch (error) {
                    log.warn('Term lookup failed', { expression, reading, error });
                    throw error;
                } finally {
                    done();
                }
            },
        );
    }

    async searchTerms(query: string, limit: number, preferences: DictionaryPreference[] = [], options: TermSearchOptions = {}): Promise<YomitanTermEntry[]> {
        const normalizedQuery = normalizeTermSearchQuery(query);
        const done = log.time('Term search', { query: normalizedQuery, limit, dictionaries: preferences.length });
        if (!normalizedQuery) {
            done();
            return [];
        }

        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const candidateLimit = options.candidateLimit ?? Math.max(limit * 24, TERM_SEARCH_DEFAULT_CANDIDATE_LIMIT);
            const [indexedEntries, glossaryCandidates] = await Promise.all([
                this.getIndexedTermSearchEntries(db, normalizedQuery, Math.max(limit * 12, 120)),
                shouldSearchTermGlossaries(normalizedQuery)
                    ? this.getGlossaryTermSearchCandidates(db, normalizedQuery, candidateLimit, rank, options)
                    : Promise.resolve([]),
            ]);
            const candidates = [
                ...indexedEntries.map(entry => ({ entry, rank: indexedTermSearchRank(entry, normalizedQuery) })),
                ...glossaryCandidates,
            ];
            return rankedTermSearchResults(candidates, normalizedQuery, limit, rank);
        } catch (error) {
            log.warn('Term search failed', { query: normalizedQuery, error });
            throw error;
        } finally {
            done();
        }
    }

    async lookupKanji(text: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanKanjiEntry[]> {
        return this.getHotLookup(
            this.hotLookupCacheKey('lookupKanji', [text, limit], preferences),
            async () => {
                const done = log.time('Kanji lookup', { length: text.length, limit, dictionaries: preferences.length });
                try {
                    const db = await this.db();
                    const rank = dictionaryRank(preferences);
                    const characters = [...new Set(Array.from(text).filter(isKanji))];
                    const entries = await this.getManyByIndex<YomitanKanjiEntry>(db, 'kanji', 'character', characters, limit);
                    const results = rankedDictionaryEntries(entries, rank, limit);
                    return results;
                } catch (error) {
                    log.warn('Kanji lookup failed', { length: text.length, error });
                    throw error;
                } finally {
                    done();
                }
            },
        );
    }

    // NewTabController loads dictionary kanji through the injected store dependency.
    // fallow-ignore-next-line unused-class-member
    async listKanjiCharacters(limit: number, preferences: DictionaryPreference[] = []): Promise<string[]> {
        const done = log.time('Kanji character list', { limit, dictionaries: preferences.length });
        try {
            if (limit <= 0) return [];
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            return await this.getKanjiCharacters(db, limit, rank);
        } catch (error) {
            log.warn('Kanji character list failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async lookupTermMeta(expression: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanMetaEntry[]> {
        return this.getHotLookup(
            this.hotLookupCacheKey('lookupTermMeta', [expression, limit], preferences),
            async () => {
                const done = log.time('Term metadata lookup', { expression, limit, dictionaries: preferences.length });
                try {
                    const db = await this.db();
                    const rank = dictionaryRank(preferences);
                    const entries = await this.getByIndex<YomitanMetaEntry>(db, 'termMeta', 'expression', expression, Math.max(limit * 8, 80));
                    const results = entries
                        .filter(entry => dictionaryEnabled(entry.dictionary, rank))
                        .sort((a, b) => compareMetaEntries(a, b, rank))
                        .slice(0, limit);
                    return results;
                } catch (error) {
                    log.warn('Term metadata lookup failed', { expression, error });
                    throw error;
                } finally {
                    done();
                }
            },
        );
    }

    async lookupSimilarTermsByKanji(character: string, limit: number, preferences: DictionaryPreference[] = []): Promise<YomitanTermEntry[]> {
        return this.getHotLookup(
            this.hotLookupCacheKey('lookupSimilarTermsByKanji', [character, limit], preferences),
            async () => {
                const done = log.time('Similar terms by kanji lookup', { character, limit, dictionaries: preferences.length });
                try {
                    const db = await this.db();
                    const rank = dictionaryRank(preferences);
                    const entries = await this.getSimilarTermEntriesByKanji(db, character, Math.max(limit * 8, 80), rank);
                    const results = entries
                        .sort((a, b) =>
                            dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)
                            || (b.score ?? 0) - (a.score ?? 0)
                            || a.expression.length - b.expression.length,
                        )
                        .slice(0, limit);
                    return results;
                } catch (error) {
                    log.warn('Similar terms by kanji lookup failed', { character, error });
                    throw error;
                } finally {
                    done();
                }
            },
        );
    }

    async findTermMatches(text: string, limit = 32, preferences: DictionaryPreference[] = []): Promise<YomitanTermMatch[]> {
        const done = log.time('Inline term match search', { length: text.length, limit, dictionaries: preferences.length });
        const source = text.slice(0, 240);
        if (!source.trim()) {
            done();
            return [];
        }

        const candidates = this.collectTermMatchCandidates(source);
        if (!candidates.size) {
            done();
            return [];
        }

        try {
            const matches = await this.lookupTermMatchCandidates(candidates, preferences);

            const results = nonOverlappingMatches(matches, limit);
            return results;
        } catch (error) {
            log.warn('Inline term match search failed', { length: source.length, candidates: candidates.size, error });
            throw error;
        } finally {
            done();
        }
    }

    private collectTermMatchCandidates(source: string): TermMatchCandidates {
        const candidates: TermMatchCandidates = new Map();
        const maxLength = Math.min(18, source.length);
        for (let start = 0; start < source.length; start++) {
            if (!JAPANESE_CHARACTER_RE.test(source[start])) continue;
            this.collectTermMatchCandidatesAt(source, start, maxLength, candidates);
        }
        return candidates;
    }

    private collectTermMatchCandidatesAt(source: string, start: number, maxLength: number, candidates: TermMatchCandidates): void {
        for (let length = Math.min(maxLength, source.length - start); length > 0; length--) {
            const surface = source.slice(start, start + length);
            if (!isSearchableJapaneseSurface(surface)) continue;
            this.addDeinflectedTermCandidates(surface, start, candidates);
        }
    }

    private addDeinflectedTermCandidates(surface: string, start: number, candidates: TermMatchCandidates): void {
        for (const deinflected of deinflectJapaneseTerm(surface)) {
            if (!JAPANESE_RE.test(deinflected.term)) continue;
            const positions = candidates.get(deinflected.term) ?? [];
            positions.push({ start, end: start + surface.length, surface, deinflected });
            candidates.set(deinflected.term, positions);
        }
    }

    private async lookupTermMatchCandidates(candidates: TermMatchCandidates, preferences: DictionaryPreference[]): Promise<YomitanTermMatch[]> {
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        return await new Promise<YomitanTermMatch[]>((resolve, reject) => {
            const tx = db.transaction('terms', 'readonly');
            const store = tx.objectStore('terms');
            const expressionIndex = store.index('expression');
            const readingIndex = store.index('reading');
            const results: YomitanTermMatch[] = [];
            const expressions = sortedTermMatchExpressions(candidates);
            let pending = expressions.length * 2;
            const finish = () => {
                if (--pending <= 0) resolve(results);
            };
            const addMatches = (expression: string, foundEntries: YomitanTermEntry[]) => {
                results.push(...termMatchesForEntries(expression, foundEntries, candidates, rank));
            };
            for (const expression of expressions) {
                requestTermMatchIndex(expressionIndex, expression, addMatches, finish, reject);
                requestTermMatchIndex(readingIndex, expression, addMatches, finish, reject);
            }
            tx.onerror = () => reject(tx.error);
        });
    }

    async summary(): Promise<DictionarySummary> {
        const done = log.time('Dictionary summary');
        try {
            if (this.summaryPromise) {
                const summary = await this.summaryPromise;
                return summary;
            }
            const db = await this.db();
            this.summaryPromise = Promise.all([
                this.getAllDictionaryInfo(db),
                this.countStore(db, 'terms'),
                this.countStore(db, 'kanji'),
                this.countStore(db, 'termMeta'),
                this.countStore(db, 'kanjiMeta'),
            ]).then(([dictionaries, terms, kanji, termMeta, kanjiMeta]) => ({ dictionaries, terms, kanji, termMeta, kanjiMeta }))
                .catch(error => {
                    this.summaryPromise = undefined;
                    throw error;
                });
            const summary = await this.summaryPromise;
            return summary;
        } catch (error) {
            log.warn('Dictionary summary failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async countEntries(): Promise<number> {
        const summary = await this.summary();
        return summary.terms + summary.kanji + summary.termMeta + summary.kanjiMeta;
    }

    // NewTabController checks local dictionary availability through this injected store.
    // fallow-ignore-next-line unused-class-member
    async hasDictionaries(): Promise<boolean> {
        const done = log.time('Dictionary presence check');
        try {
            const db = await this.db();
            return (await this.getAllDictionaryInfo(db)).length > 0;
        } catch (error) {
            log.warn('Dictionary presence check failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    // Lookup parsing checks term dictionary availability through this injected store.
    // fallow-ignore-next-line unused-class-member
    async hasTermDictionaries(): Promise<boolean> {
        const done = log.time('Term dictionary presence check');
        try {
            const db = await this.db();
            return (await this.getAllDictionaryInfo(db)).some(hasTermDictionaryRows);
        } catch (error) {
            log.warn('Term dictionary presence check failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async listRandomTerms(limit: number, preferences: DictionaryPreference[] = [], options: GlossaryCursorSearchOptions = {}): Promise<YomitanTermEntry[]> {
        const done = log.time('Random term listing', { limit, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            return await this.collectRandomTermReservoir(db, limit, rank, options, addRandomListTermToReservoir);
        } catch (error) {
            log.warn('Random term listing failed', { limit, error });
            return [];
        } finally {
            done();
        }
    }

    async listRandomTopTerms(limit: number, maxRank: number, preferences: DictionaryPreference[] = [], options: RandomTopTermOptions = {}): Promise<YomitanTermEntry[]> {
        const done = log.time('Random top term listing', { limit, maxRank, dictionaries: preferences.length });
        try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const topTerms = await this.collectTopFrequencyTerms(db, maxRank, rank, {
                maxRows: options.maxRows ?? RANDOM_TOP_TERM_LIST_MAX_ROWS,
                maxMs: options.maxMs ?? RANDOM_TOP_TERM_LIST_MAX_MS,
            });
            const results = await this.randomTopTermResults(db, topTerms, limit, rank, preferences, options);
            if (options.fallbackToRandom !== false && this.shouldFallbackToRandomTerms(topTerms, results)) {
                return await this.listRandomTerms(limit, preferences, {
                    maxRows: options.fallbackMaxRows,
                    maxMs: options.fallbackMaxMs,
                });
            }
            return results;
        } catch (error) {
            log.warn('Random top term listing failed', { limit, error });
            return [];
        } finally {
            done();
        }
    }

    private async randomTopTermResults(
        db: IDBDatabase,
        topTerms: Map<string, number>,
        limit: number,
        rank: Map<string, DictionaryPreference>,
        preferences: DictionaryPreference[],
        options: RandomTopTermOptions,
    ): Promise<YomitanTermEntry[]> {
        return topTerms.size
            ? await this.entriesForRandomExpressions(db, topTerms, limit, preferences)
            : await this.listRandomCommonTerms(db, limit, rank, {
                maxRows: options.fallbackMaxRows,
                maxMs: options.fallbackMaxMs,
            });
    }

    private shouldFallbackToRandomTerms(topTerms: Map<string, number>, results: YomitanTermEntry[]): boolean {
        return !topTerms.size && !results.length;
    }

    private async collectTopFrequencyTerms(
        db: IDBDatabase,
        maxRank: number,
        rank: Map<string, DictionaryPreference>,
        options: GlossaryCursorSearchOptions = {},
    ): Promise<Map<string, number>> {
        const expressions = new Map<string, number>();
        const maxRows = options.maxRows ?? RANDOM_TOP_TERM_LIST_MAX_ROWS;
        const maxMs = options.maxMs ?? RANDOM_TOP_TERM_LIST_MAX_MS;
        await scanObjectStoreCursor<YomitanMetaEntry>(
            db,
            { storeName: 'termMeta', maxRows, maxMs, errorMessage: 'Could not list dictionary term meta.' },
            entry => {
                addTopFrequencyExpression(expressions, entry, maxRank, rank);
            },
        );
        return expressions;
    }

    private async entriesForRandomExpressions(db: IDBDatabase, expressions: Map<string, number>, limit: number, preferences: DictionaryPreference[]): Promise<YomitanTermEntry[]> {
        const sampled = reservoirSample([...expressions.keys()], limit);
        const rank = dictionaryRank(preferences);
        const entriesByExpression = await this.getEntriesForExpressions(db, sampled, TOP_TERM_EXPRESSION_ENTRY_LIMIT);
        return sampled.flatMap(expression => {
            const entry = bestTermLookupEntry(entriesByExpression.get(expression) ?? [], expression, rank);
            return entry ? [{ ...entry, jpdbFrequency: expressions.get(expression) }] : [];
        });
    }

    private async getEntriesForExpressions(db: IDBDatabase, expressions: string[], limit: number): Promise<Map<string, YomitanTermEntry[]>> {
        if (!expressions.length) return new Map();
        return new Promise((resolve, reject) => {
            const results = new Map<string, YomitanTermEntry[]>();
            const tx = db.transaction('terms', 'readonly');
            const index = tx.objectStore('terms').index('expression');
            let pending = expressions.length;
            const finish = () => {
                if (--pending <= 0) resolve(results);
            };
            const fail = (error: unknown) => reject(error ?? new Error('Could not load top dictionary terms.'));

            for (const expression of expressions) {
                readIndexRequestValues<YomitanTermEntry>(
                    index,
                    IDBKeyRange.only(expression),
                    limit,
                    entries => {
                        results.set(expression, entries);
                        finish();
                    },
                    fail,
                );
            }
            tx.onerror = () => fail(tx.error);
        });
    }

    private async listRandomCommonTerms(
        db: IDBDatabase,
        limit: number,
        rank: Map<string, DictionaryPreference>,
        options: GlossaryCursorSearchOptions = {},
    ): Promise<YomitanTermEntry[]> {
        return await this.collectRandomTermReservoir(db, limit, rank, options, addCommonTermToReservoir);
    }

    private async collectRandomTermReservoir(
        db: IDBDatabase,
        limit: number,
        rank: Map<string, DictionaryPreference>,
        options: GlossaryCursorSearchOptions,
        addTerm: (
            entry: YomitanTermEntry,
            rank: Map<string, DictionaryPreference>,
            seen: Set<string>,
            reservoir: YomitanTermEntry[],
            limit: number,
            count: number,
        ) => number,
    ): Promise<YomitanTermEntry[]> {
        const reservoir: YomitanTermEntry[] = [];
        const seen = new Set<string>();
        const maxRows = options.maxRows ?? RANDOM_TERM_LIST_MAX_ROWS;
        const maxMs = options.maxMs ?? RANDOM_TERM_LIST_MAX_MS;
        let count = 0;
        await scanObjectStoreCursor<YomitanTermEntry>(
            db,
            { storeName: 'terms', maxRows, maxMs, errorMessage: 'Could not list dictionary terms.' },
            entry => {
                count = addTerm(entry, rank, seen, reservoir, limit, count);
            },
        );
        return reservoir;
    }

    async importFile(file: File, onProgress?: (message: string) => void, sourceUrl = ''): Promise<ImportSummary> {
        const done = log.time('Dictionary file import', fileSummary(file, sourceUrl));
        try {
            log.info('Dictionary file import started', fileSummary(file, sourceUrl));
            // UT-72: imports live in IndexedDB, which Safari evicts after ~7
            // days of inactivity for non-persisted origins. Ask for durable
            // storage up front.
            requestPersistentDictionaryStorage();
            const summary = /\.zip$/i.test(file.name)
                ? await this.importZip(file, onProgress, sourceUrl)
                : await this.importJson(file, onProgress);
            log.info('Dictionary file import completed', summary);
            return summary;
        } catch (error) {
            log.warn('Dictionary file import failed', { ...fileSummary(file, sourceUrl), error });
            throw error;
        } finally {
            done();
        }
    }

    async importFromUrl(url: string, filename = filenameFromUrl(url), onProgress?: (message: string) => void): Promise<ImportSummary> {
        log.info('Dictionary URL import started', { filename, host: safeHost(url) });
        onProgress?.(`${this.text('dictionaryDownloading')}: ${filename}...`);
        const blob = await requestBlob(url, this.getCorsProxyUrl(), onProgress, this.getInterfaceLanguage());
        const file = namedBlobFile(blob, filename, blob.type || 'application/zip');
        const summary = await this.importFile(file, onProgress, url);
        log.info('Dictionary URL import completed', { filename, host: safeHost(url), ...summary });
        return summary;
    }

    async importZip(file: File, onProgress?: (message: string) => void, sourceUrl = ''): Promise<ImportSummary> {
        const language = this.getInterfaceLanguage();
        onProgress?.(`${this.text('dictionaryReadingZip')} ${formatBytes(file.size)}...`);
        const zip = await readZipArchive(file, progress => {
            if (progress.phase === 'read') {
                onProgress?.(`${this.text('dictionaryReadingZip')} ${formatPercent(progress.loaded, progress.total)} (${formatBytes(progress.loaded)} / ${formatBytes(progress.total)})...`);
                return;
            }
            onProgress?.(`${this.text('dictionaryReadingZip')} ${progress.entries?.toLocaleString() ?? '0'} files found. ${uiText(language, 'dictionaryCheckingIndex')}`);
        });
        const zipEntries = zip.entries();
        onProgress?.(`${this.text('dictionaryReadingZip')} ${zipEntries.length.toLocaleString()} files found. ${uiText(language, 'dictionaryCheckingIndex')}`);
        const index = await readYomitanZipIndex(zip, this.getInterfaceLanguage());
        const dictionary = yomitanZipDictionaryName(index, file.name);
        const version = yomitanZipVersion(index);
        const bankCount = countYomitanZipBanks(zipEntries);
        onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${formatUiTemplate(uiText(language, 'dictionaryBanksFound'), {
            count: bankCount.toLocaleString(),
            plural: bankCount === 1 ? '' : 's',
        })}`);
        onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${uiText(language, 'dictionaryRemovingExisting')}...`);
        await this.deleteDictionary(dictionary);
        onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: preparing storage...`);
        const db = await this.db();
        const info = await yomitanZipDictionaryInfo(zip, index, dictionary, sourceUrl);

        const summary: ImportSummary = { dictionaries: [dictionary], dictionaryTypes: {}, entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
        let clearedTermIndexesForImport = false;
        let importedTerms = false;
        const importBank = async <T>(pattern: RegExp, label: keyof Pick<ImportSummary, 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta'>, store: StoreName, normalize: (row: unknown) => T | null) => {
            const files = zip.entries().filter(entry => pattern.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            let pending: T[] = [];
            let saved = 0;
            const flush = async () => {
                if (!pending.length) return;
                if (store === 'terms' && !clearedTermIndexesForImport) {
                    await this.clearDerivedTermIndexes(db);
                    clearedTermIndexesForImport = true;
                }
                const entries = pending;
                const parsed = summary[label];
                pending = [];
                onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${uiText(language, 'dictionarySavingBank')} ${label} ${saved.toLocaleString()} / ${parsed.toLocaleString()} ${this.text('dictionaryEntries')}...`);
                await this.addToStore(store, entries, false, store !== 'terms', written => {
                    onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${uiText(language, 'dictionarySavingBank')} ${label} ${(saved + written).toLocaleString()} / ${parsed.toLocaleString()} ${this.text('dictionaryEntries')}...`);
                });
                saved += entries.length;
                if (store === 'terms') importedTerms = true;
            };
            for (const [index, bankFile] of files.entries()) {
                onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${uiText(language, 'dictionaryReadingBank')} ${bankFile.name} (${index + 1}/${files.length}, ${formatBytes(bankFile.uncompressedSize)})...`);
                const bankText = await zip.text(bankFile.name, progress => {
                    if (progress.loaded <= 0) return;
                    onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${uiText(language, 'dictionaryReadingBank')} ${bankFile.name} (${index + 1}/${files.length}, ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)})...`);
                });
                onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${uiText(language, 'dictionaryParsingBank')} ${bankFile.name} (${index + 1}/${files.length})...`);
                const rows = JSON.parse(bankText) as unknown[];
                for (const row of rows) {
                    const entry = normalize(row);
                    if (!entry) continue;
                    if (store === 'terms') await inlineStructuredImageDataUrls(zip, (entry as unknown as YomitanTermEntry).glossary);
                    pending.push(entry);
                    summary[label]++;
                    summary.entries++;
                    if (pending.length >= ZIP_IMPORT_FLUSH_ENTRY_LIMIT) await flush();
                }
                await flush();
            }
            await flush();
            if (files.length) {
                onProgress?.(`${this.text('dictionaryImporting')} ${dictionary}: ${label} ${saved.toLocaleString()} ${this.text('dictionaryEntries')} saved...`);
            }
        };

        await importBank(/^term_bank_\d+\.json$/i, 'terms', 'terms', row => normalizeZipTermRow(row, dictionary));
        await importBank(/^kanji_bank_\d+\.json$/i, 'kanji', 'kanji', row => normalizeZipKanjiRow(row, dictionary, version));
        await importBank(/^term_meta_bank_\d+\.json$/i, 'termMeta', 'termMeta', row => normalizeZipTermMetaRow(row, dictionary));
        await importBank(/^kanji_meta_bank_\d+\.json$/i, 'kanjiMeta', 'kanjiMeta', row => normalizeZipKanjiMetaRow(row, dictionary));

        if (summary.entries === 0) throw new Error(this.text('dictionaryNoSupportedBanks'));
        if (importedTerms) await this.clearDerivedTermIndexes(db);
        info.counts = dictionaryCountsFromSummary(summary);
        info.type = dictionaryTypeFromCounts(info.counts);
        summary.dictionaryTypes = { [dictionary]: info.type };
        await this.putDictionaryInfo(info);
        log.info('ZIP dictionary import parsed', summary);
        return summary;
    }

    async importJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        const head = await readBlobText(file.slice(0, 4096));
        if (head.includes('"formatName":"dexie"') || head.includes('"formatName": "dexie"')) {
            return this.importDexieJson(file, onProgress);
        }

        const json = JSON.parse(await readBlobText(file)) as unknown;
        if (isReaderDictionaryExport(json)) {
            return this.importReaderJson(json);
        }

        throw new Error(this.text('dictionaryUnsupportedJson'));
    }

    private async importReaderJson(json: ReaderDictionaryExport): Promise<ImportSummary> {
        await this.clear();
        const terms = readerExportTerms(json);
        const dictionaryTypes = dictionaryTypesFromReaderExport(json);
        const dictionaryNames = readerExportDictionaryNames(json, terms);
        const dictionaries = readerExportDictionaryInfo(json, dictionaryNames, dictionaryTypes);
        await Promise.all([
            this.addToStore('dictionaryInfo', dictionaries, true),
            this.addToStore('terms', terms, false, false),
            this.addToStore('kanji', json.kanji ?? []),
            this.addToStore('termMeta', json.termMeta ?? []),
            this.addToStore('kanjiMeta', json.kanjiMeta ?? []),
        ]);
        const summary = readerExportSummary(json, terms, dictionaryNames, dictionaryTypes);
        log.info('JSON dictionary import parsed', summary);
        return summary;
    }

    async importDexieJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary> {
        onProgress?.('Streaming Yomitan dictionary export...');
        await this.clear();
        const rowCounts: Partial<Record<string, number>> = await readDexieTableRowCounts(file).catch(() => ({}));
        const totalRows = importEntryStores().reduce((total, store) => total + (rowCounts[store] ?? 0), 0);
        if (totalRows > 0) onProgress?.(`${this.text('dictionaryPreparingImport')} ${totalRows.toLocaleString()} ${this.text('dictionaryRecords')}...`);
        const dictionaries = new Set<string>();
        const dictionaryInfo = new Map<string, YomitanDictionaryInfo>();
        const dictionaryCounts = new Map<string, Partial<Record<EntryStoreName, number>>>();
        const summary: ImportSummary = { dictionaries: [], dictionaryTypes: {}, entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
        const batches: Record<EntryStoreName, unknown[]> = { terms: [], kanji: [], termMeta: [], kanjiMeta: [] };
        const progressAt: Record<EntryStoreName, number> = { terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };

        const emitProgress = (message: string) => {
            onProgress?.(message);
        };
        const reportProgress = (store?: EntryStoreName, force = false) => {
            if (!store) {
                emitProgress(formatDexieImportProgress(this.text.bind(this), summary.entries, totalRows));
                return;
            }

            const imported = summary[store];
            const tableTotal = rowCounts[store] ?? 0;
            if (!force && imported < progressAt[store]) return;
            progressAt[store] = imported + DEXIE_PROGRESS_INTERVAL;
            emitProgress(formatDexieStoreImportProgress(this.text.bind(this), store, imported, tableTotal, summary.entries, totalRows));
        };

        const flush = async (store: EntryStoreName, forceProgress = false) => {
            const batch = batches[store];
            if (!batch.length) return;
            await this.addToStore(store, batch, false, store !== 'terms');
            batches[store] = [];
            reportProgress(store, forceProgress);
        };
        const addBatch = async (store: EntryStoreName, entry: unknown) => {
            batches[store].push(entry);
            summary[store]++;
            summary.entries++;
            const dictionary = (entry as { dictionary?: unknown }).dictionary;
            if (typeof dictionary === 'string') {
                dictionaries.add(dictionary);
                const counts = dictionaryCounts.get(dictionary) ?? {};
                counts[store] = (counts[store] ?? 0) + 1;
                dictionaryCounts.set(dictionary, counts);
            }
            if (batches[store].length >= DEXIE_IMPORT_BATCH_SIZE) {
                await flush(store);
            }
        };

        await streamDexieTables(file, {
            dictionaries: async row => {
                const info = normalizeDexieDictionaryRow(row);
                if (!info) return;
                dictionaries.add(info.title);
                dictionaryInfo.set(info.title, info);
            },
            terms: async row => {
                const entry = normalizeDexieTermRow(row);
                if (entry) await addBatch('terms', entry);
            },
            kanji: async row => {
                const entry = normalizeDexieKanjiRow(row);
                if (entry) await addBatch('kanji', entry);
            },
            termMeta: async row => {
                const entry = normalizeDexieTermMetaRow(row);
                if (entry) await addBatch('termMeta', entry);
            },
            kanjiMeta: async row => {
                const entry = normalizeDexieKanjiMetaRow(row);
                if (entry) await addBatch('kanjiMeta', entry);
            },
        }, table => {
            if (isEntryStoreName(table)) {
                reportProgress(table, true);
                return;
            }
            onProgress?.(`${this.text('dictionaryImporting')} Yomitan ${table}...`);
        });

        await Promise.all(importEntryStores().map(store => flush(store, true)));
        reportProgress(undefined, true);
        summary.dictionaries = [...dictionaries];
        summary.dictionaryTypes = {};
        await Promise.all(summary.dictionaries.map(dictionary => {
            const counts = dictionaryCounts.get(dictionary) ?? {};
            const info = dictionaryInfo.get(dictionary) ?? {
                title: dictionary,
                alias: dictionary,
                enabled: true,
                priority: dictionaryInfo.size,
                importDate: Date.now(),
            };
            info.counts = { ...(info.counts ?? {}), ...counts };
            info.type = dictionaryTypeFromCounts(info.counts);
            summary.dictionaryTypes![dictionary] = info.type;
            return this.putDictionaryInfo(info);
        }));
        log.info('Dexie dictionary import parsed', summary);
        return summary;
    }

    // SettingsDialogController exports dictionaries through the injected store dependency.
    // fallow-ignore-next-line unused-class-member
    async exportJson(): Promise<Blob> {
        const done = log.time('Dictionary export');
        try {
            const db = await this.db();
            const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
                this.getAllFromStore<YomitanDictionaryInfo>(db, 'dictionaryInfo'),
                this.getAllFromStore<YomitanTermEntry>(db, 'terms'),
                this.getAllFromStore<YomitanKanjiEntry>(db, 'kanji'),
                this.getAllFromStore<YomitanMetaEntry>(db, 'termMeta'),
                this.getAllFromStore<YomitanMetaEntry>(db, 'kanjiMeta'),
            ]);
            log.info('Dictionary export prepared', {
                dictionaries: dictionaries.length,
                terms: terms.length,
                kanji: kanji.length,
                termMeta: termMeta.length,
                kanjiMeta: kanjiMeta.length,
            });
            return new Blob([JSON.stringify({
                formatName: 'yomu-yomitan-dictionaries',
                formatVersion: 2,
                exportedAt: new Date().toISOString(),
                dictionaries,
                terms,
                kanji,
                termMeta,
                kanjiMeta,
            })], { type: 'application/json' });
        } catch (error) {
            log.warn('Dictionary export failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async dictionaryStyleCss(preferences: DictionaryPreference[] = []): Promise<string> {
        try {
            const cacheKey = JSON.stringify(normalizeDictionaryPreferences(preferences));
            const cached = this.dictionaryStyleCssCache.get(cacheKey);
            if (cached !== undefined) {
                return cached;
            }
            const db = await this.db();
            const dictionaries = await this.getAllDictionaryInfo(db);
            const css = renderDictionaryScopedStyles(dictionaries, preferences);
            this.dictionaryStyleCssCache.set(cacheKey, css);
            return css;
        } catch (error) {
            log.warn('Dictionary stylesheet render failed', { error });
            throw error;
        }
    }

    async clear(): Promise<void> {
        const done = log.time('Dictionary store clear');
        try {
            const db = await this.db();
            await this.clearDictionaryStores(db);
            this.invalidateCaches();
            log.info('Dictionary store cleared');
        } catch (error) {
            log.warn('Dictionary store clear failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async resetDatabase(options: { deleteTimeoutMs?: number } = {}): Promise<{ cleared: boolean; deleted: boolean }> {
        const done = log.time('Dictionary database factory reset');
        let cleared = false;
        try {
            await this.clear();
            cleared = true;
            await this.deleteDatabase({ timeoutMs: options.deleteTimeoutMs ?? DB_FACTORY_RESET_DELETE_TIMEOUT_MS });
            return { cleared, deleted: true };
        } catch (error) {
            if (!cleared) {
                log.warn('Dictionary reset pre-clear failed', { error });
                throw error;
            }
            log.warn('Dictionary delete incomplete after clear', { error });
            return { cleared, deleted: false };
        } finally {
            done();
        }
    }

    async invalidateForFactoryReset(): Promise<void> {
        const dbPromise = this.dbPromise;
        this.dbPromise = undefined;
        this.invalidateCaches();
        if (!dbPromise) return;
        try {
            const db = await dbPromise;
            db.close();
            log.info('Dictionary DB closed for reset', { name: DB_NAME });
        } catch {
        }
    }

    async deleteDatabase(options: { timeoutMs?: number } = {}): Promise<void> {
        const done = log.time('Dictionary database delete');
        try {
            const timeoutMs = options.timeoutMs ?? DB_DELETE_BLOCKED_TIMEOUT_MS;
            const db = this.dbPromise ? await this.dbPromise.catch(() => undefined) : undefined;
            db?.close();
            this.dbPromise = undefined;
            this.invalidateCaches();
            await new Promise<void>((resolve, reject) => {
                let blocked = false;
                let settled = false;
                const timeout = globalThis.setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    reject(new Error(blocked
                        ? 'Dictionary database reset is still waiting on another open Yomu tab. Reload the other Yomu tabs, then try again.'
                        : 'Dictionary database reset timed out.'));
                }, timeoutMs);
                const settle = (callback: () => void) => {
                    if (settled) return;
                    settled = true;
                    globalThis.clearTimeout(timeout);
                    callback();
                };
                const request = indexedDB.deleteDatabase(DB_NAME);
                request.onsuccess = () => settle(resolve);
                request.onerror = () => settle(() => reject(request.error ?? new Error('Dictionary database reset failed.')));
                request.onblocked = () => {
                    blocked = true;
                    log.warn('Dictionary delete blocked by another tab', { name: DB_NAME });
                };
            });
            log.info('Dictionary database deleted', { name: DB_NAME });
        } catch (error) {
            log.warn('Dictionary database delete failed', { error });
            throw error;
        } finally {
            done();
        }
    }

    async deleteDictionary(dictionary: string): Promise<void> {
        const done = log.time('Dictionary delete', { dictionary });
        try {
            const db = await this.db();
            const dictionaries = await this.getAllDictionaryInfo(db);
            if (!dictionaries.some(item => item.title === dictionary)) {
                log.info('Dictionary delete skipped; not installed', { dictionary });
                return;
            }
            if (dictionaries.length === 1) {
                await this.clearDictionaryStores(db);
                this.invalidateCaches();
                log.info('Only installed dictionary cleared', { dictionary });
                return;
            }
            const stores = existingStores(db, ['terms', 'kanji', 'termMeta', 'kanjiMeta']);
            for (const store of stores) {
                await deleteByDictionary(db, store, dictionary);
            }
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('dictionaryInfo', 'readwrite');
                tx.objectStore('dictionaryInfo').delete(dictionary);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(transactionError(tx, `Could not remove ${dictionary} from dictionary metadata.`));
                tx.onabort = () => reject(transactionError(tx, `Could not remove ${dictionary} from dictionary metadata.`));
            });
            await this.clearDerivedTermIndexes(db);
            this.invalidateCaches();
            log.info('Dictionary deleted', { dictionary });
        } catch (error) {
            log.warn('Dictionary delete failed', { dictionary, error });
            throw error;
        } finally {
            done();
        }
    }

    private async putDictionaryInfo(info: YomitanDictionaryInfo): Promise<void> {
        await this.addToStore('dictionaryInfo', [info], true);
    }

    private async clearDictionaryStores(db: IDBDatabase): Promise<void> {
        this.termIndexGeneration++;
        await clearStores(db, existingStores(db, ['terms', 'kanji', 'termMeta', 'kanjiMeta', 'dictionaryInfo', 'termSearch', 'termKanji']));
        this.termKanjiIndexReady = false;
    }

    private async addToStore<T>(
        storeName: StoreName,
        entries: T[],
        put = false,
        clearTermIndexes = true,
        onChunk?: (written: number, total: number) => void,
    ): Promise<void> {
        if (!entries.length) return;
        const db = await this.db();
        if (storeName === 'terms' && clearTermIndexes) await this.clearDerivedTermIndexes(db);
        let written = 0;
        for (let start = 0; start < entries.length; start += STORE_WRITE_BATCH_SIZE) {
            const chunk = entries.slice(start, start + STORE_WRITE_BATCH_SIZE);
            await this.addStoreChunk(db, storeName, chunk, put);
            written += chunk.length;
            onChunk?.(written, entries.length);
            await nextTask();
        }
    }

    private addStoreChunk<T>(db: IDBDatabase, storeName: StoreName, entries: T[], put: boolean): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const tx = readwriteTransaction(db, storeName);
            const store = tx.objectStore(storeName);
            for (const entry of entries) {
                put ? store.put(entry) : store.add(entry);
            }
            tx.oncomplete = () => {
                this.invalidateCaches();
                resolve();
            };
            tx.onerror = () => reject(transactionError(tx, `Could not add entries to ${storeName}.`));
            tx.onabort = () => reject(transactionError(tx, `Could not add entries to ${storeName}.`));
            commitTransaction(tx);
        });
    }

    private async getByIndex<T>(db: IDBDatabase, storeName: StoreName, indexName: string, value: string, limit: number): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const index = tx.objectStore(storeName).index(indexName);
            readIndexRequestValues<T>(index, IDBKeyRange.only(value), limit, resolve, reject);
        });
    }

    private async getManyByIndex<T>(db: IDBDatabase, storeName: StoreName, indexName: string, values: string[], limit: number): Promise<T[]> {
        if (!values.length) return [];
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const index = tx.objectStore(storeName).index(indexName);
            const results: T[] = [];
            let pending = values.length;
            const finish = () => {
                if (--pending <= 0) resolve(results);
            };
            const fail = (error: unknown) => reject(error ?? new Error(`Could not read ${storeName} entries.`));

            for (const value of values) {
                readIndexRequestValues<T>(
                    index,
                    IDBKeyRange.only(value),
                    limit,
                    entries => {
                        results.push(...entries);
                        finish();
                    },
                    fail,
                );
            }
            tx.onerror = () => fail(tx.error);
        });
    }

    private async getTermLookupEntries(db: IDBDatabase, expression: string, reading: string, expressionLimit: number, readingLimit: number): Promise<YomitanTermEntry[]> {
        const queries = [
            { indexName: 'expression', range: IDBKeyRange.only(expression), limit: expressionLimit },
            ...(reading ? [{ indexName: 'reading', range: IDBKeyRange.only(reading), limit: readingLimit }] : []),
        ];
        return this.getTermIndexEntries(db, queries);
    }

    private async getSimilarTermEntriesByKanji(
        db: IDBDatabase,
        character: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
    ): Promise<YomitanTermEntry[]> {
        if (hasStore(db, 'termKanji')) {
            await this.ensureTermKanjiIndex(db);
            return this.getTermKanjiIndexEntries(db, character, candidateLimit, rank);
        }
        return this.getSimilarTermCursorEntries(db, character, candidateLimit, rank, {
            maxRows: TERM_KANJI_INDEX_FALLBACK_MAX_ROWS,
            maxMs: TERM_KANJI_INDEX_FALLBACK_MAX_MS,
        });
    }

    private async getTermKanjiIndexEntries(
        db: IDBDatabase,
        character: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
    ): Promise<YomitanTermEntry[]> {
        return new Promise((resolve, reject) => {
            const entries: YomitanTermEntry[] = [];
            const seen = new Set<string>();
            const request = db.transaction('termKanji', 'readonly')
                .objectStore('termKanji')
                .index('character')
                .openCursor(IDBKeyRange.only(character));
            request.onerror = () => reject(request.error ?? new Error('Could not search local dictionary kanji index.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || entries.length >= candidateLimit) {
                    resolve(entries);
                    return;
                }
                const row = cursor.value as YomitanTermKanjiEntry;
                if (dictionaryEnabled(row.dictionary, rank)) {
                    const entry = termEntryFromKanjiEntry(row);
                    const key = `${entry.expression}\n${entry.reading}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        entries.push(entry);
                    }
                }
                cursor.continue();
            };
        });
    }

    private async getSimilarTermCursorEntries(
        db: IDBDatabase,
        character: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
        options: GlossaryCursorSearchOptions = {},
    ): Promise<YomitanTermEntry[]> {
        return new Promise((resolve, reject) => {
            const entries: YomitanTermEntry[] = [];
            const seen = new Set<string>();
            const startedAt = performance.now();
            let visited = 0;
            const request = db.transaction('terms', 'readonly').objectStore('terms').openCursor();
            request.onerror = () => reject(request.error ?? new Error('Could not search local dictionaries.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || entries.length >= candidateLimit) {
                    resolve(entries);
                    return;
                }
                if (optionalCursorScanLimitReached(options, visited, startedAt)) {
                    resolve(entries);
                    return;
                }
                visited++;
                const entry = cursor.value as YomitanTermEntry;
                addSimilarTermByKanjiCandidate(entries, seen, entry, character, rank);
                cursor.continue();
            };
        });
    }

    private async getIndexedTermSearchEntries(db: IDBDatabase, query: string, limit: number): Promise<YomitanTermEntry[]> {
        return this.getTermIndexEntries(db, [
            { indexName: 'expression', range: IDBKeyRange.only(query), limit },
            { indexName: 'reading', range: IDBKeyRange.only(query), limit },
            { indexName: 'expression', range: termSearchPrefixRange(query), limit },
            { indexName: 'reading', range: termSearchPrefixRange(query), limit },
        ]);
    }

    private async getTermIndexEntries(db: IDBDatabase, queries: TermIndexQuery[]): Promise<YomitanTermEntry[]> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('terms', 'readonly');
            const store = tx.objectStore('terms');
            const entries: YomitanTermEntry[] = [];
            let pending = queries.length;
            const finish = () => {
                if (--pending <= 0) resolve(entries);
            };
            const fail = (error: unknown) => reject(error ?? new Error('Could not search local dictionary terms.'));

            for (const item of queries) {
                readIndexRequestValues<YomitanTermEntry>(
                    store.index(item.indexName),
                    item.range,
                    item.limit,
                    found => {
                        entries.push(...found);
                        finish();
                    },
                    fail,
                );
            }
            tx.onerror = () => fail(tx.error);
        });
    }

    private async getGlossaryTermSearchCandidates(
        db: IDBDatabase,
        query: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
        options: TermSearchOptions = {},
    ): Promise<TermSearchCandidate[]> {
        if (!hasStore(db, 'termSearch')) {
            return this.getGlossaryTermCursorSearchCandidates(db, query, candidateLimit, rank);
        }
        return this.getGlossaryTermSearchCandidatesWithIndex(db, query, candidateLimit, rank, options);
    }

    private async getGlossaryTermSearchCandidatesWithIndex(
        db: IDBDatabase,
        query: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
        options: TermSearchOptions,
    ): Promise<TermSearchCandidate[]> {
        const indexed = await this.getGlossaryTermSearchIndexCandidates(db, query, candidateLimit, rank, glossaryIndexSearchOptions(options));
        if (indexed.length) return indexed;

        const building = Boolean(this.termSearchIndexPromise);
        const indexedCount = await this.countStore(db, 'termSearch');
        if (hasReadyEmptyGlossarySearchIndex(indexedCount, building)) return indexed;
        this.prepareTermSearchIndexIfIdle(building, options);
        if (shouldSkipGlossaryFallback(building, options)) return indexed;
        return this.getGlossaryTermCursorSearchCandidates(db, query, candidateLimit, rank, glossaryFallbackSearchOptions(options));
    }

    private prepareTermSearchIndexIfIdle(building: boolean, options: TermSearchOptions): void {
        if (building) return;
        if (options.prepareIndex === false) return;
        void this.prepareTermSearchIndex();
    }

    private async getGlossaryTermCursorSearchCandidates(
        db: IDBDatabase,
        query: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
        options: GlossaryCursorSearchOptions = {},
    ): Promise<TermSearchCandidate[]> {
        const request = db.transaction('terms', 'readonly').objectStore('terms').openCursor();
        return this.collectGlossaryTermSearchCandidates(
            request,
            query,
            candidateLimit,
            rank,
            options,
            'Could not search local dictionary glossaries.',
            entry => {
                trimTermSearchCandidates(entry.candidates, candidateLimit, query, rank);
            },
            false,
        );
    }

    private async getGlossaryTermSearchIndexCandidates(
        db: IDBDatabase,
        query: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
        options: GlossaryCursorSearchOptions = {},
    ): Promise<TermSearchCandidate[]> {
        const token = termSearchIndexToken(query);
        if (!token) return [];
        const request = db.transaction('termSearch', 'readonly')
            .objectStore('termSearch')
            .index('token')
            .openCursor(termSearchPrefixRange(token));
        return this.collectGlossaryTermSearchCandidates(
            request,
            query,
            candidateLimit,
            rank,
            options,
            'Could not search local dictionary glossary index.',
            undefined,
            true,
            entry => termEntryFromSearchEntry(entry as YomitanTermSearchEntry),
        );
    }

    private async collectGlossaryTermSearchCandidates(
        request: IDBRequest<IDBCursorWithValue | null>,
        query: string,
        candidateLimit: number,
        rank: Map<string, DictionaryPreference>,
        options: GlossaryCursorSearchOptions,
        errorMessage: string,
        afterPush?: (state: { candidates: TermSearchCandidate[] }) => void,
        stopAtCandidateLimit = true,
        entryFromCursorValue: (entry: YomitanTermEntry | YomitanTermSearchEntry) => YomitanTermEntry = entry => entry,
    ): Promise<TermSearchCandidate[]> {
        return new Promise((resolve, reject) => {
            const candidates: TermSearchCandidate[] = [];
            const startedAt = performance.now();
            let visited = 0;
            request.onerror = () => reject(request.error ?? new Error(errorMessage));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor
                    || (stopAtCandidateLimit && candidates.length >= candidateLimit)
                    || glossaryCursorSearchExpired(options, visited, startedAt)) {
                    resolve(candidates);
                    return;
                }
                visited++;
                const entry = cursor.value as YomitanTermEntry | YomitanTermSearchEntry;
                if (dictionaryEnabled(entry.dictionary, rank)) {
                    const searchRank = glossaryTermSearchRank(entry.glossary, query);
                    if (searchRank < Number.POSITIVE_INFINITY) {
                        candidates.push({ entry: entryFromCursorValue(entry), rank: searchRank });
                        afterPush?.({ candidates });
                    }
                }
                cursor.continue();
            };
        });
    }

    private async getAllDictionaryInfo(db: IDBDatabase): Promise<YomitanDictionaryInfo[]> {
        this.dictionaryInfoPromise ??= this.getAllFromStore<YomitanDictionaryInfo>(db, 'dictionaryInfo')
            .then(items => items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title)))
            .catch(error => {
                this.dictionaryInfoPromise = undefined;
                throw error;
            });
        return this.dictionaryInfoPromise;
    }

    private async getAllFromStore<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const results: T[] = [];
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }
                results.push(cursor.value as T);
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    }

    private async getKanjiCharacters(db: IDBDatabase, limit: number, rank: Map<string, DictionaryPreference>): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const characters: string[] = [];
            const seen = new Set<string>();
            const request = db.transaction('kanji', 'readonly').objectStore('kanji').openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || characters.length >= limit) {
                    resolve(characters);
                    return;
                }
                const entry = cursor.value as YomitanKanjiEntry;
                if (dictionaryEnabled(entry.dictionary, rank) && isKanji(entry.character) && !seen.has(entry.character)) {
                    seen.add(entry.character);
                    characters.push(entry.character);
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    }

    private async ensureTermSearchIndex(db: IDBDatabase): Promise<void> {
        if (!hasStore(db, 'termSearch')) return;
        const [terms, indexed] = await Promise.all([
            this.countStore(db, 'terms'),
            this.countStore(db, 'termSearch'),
        ]);
        if (!terms || indexed) return;
        await this.rebuildTermSearchIndex(db);
    }

    private async ensureTermKanjiIndex(db: IDBDatabase): Promise<void> {
        if (!hasStore(db, 'termKanji') || this.termKanjiIndexReady) return;
        const [terms, indexed] = await Promise.all([
            this.countStore(db, 'terms'),
            this.countStore(db, 'termKanji'),
        ]);
        if (!terms || indexed) {
            this.termKanjiIndexReady = true;
            return;
        }
        if (!this.termKanjiIndexPromise) {
            this.termKanjiIndexPromise = this.rebuildTermKanjiIndex(db)
                .then(() => {
                    this.termKanjiIndexReady = true;
                })
                .finally(() => {
                    this.termKanjiIndexPromise = undefined;
                });
        }
        await this.termKanjiIndexPromise;
    }

    private async rebuildTermSearchIndex(db: IDBDatabase): Promise<void> {
        const done = log.time('Term search index rebuild');
        const generation = this.termIndexGeneration;
        try {
            await this.clearTermSearchIndex(db);
            let indexedTerms = 0;
            let lastKey: IDBValidKey | undefined;
            for (;;) {
                if (generation !== this.termIndexGeneration) return;
                const chunk = await this.getTermSearchIndexSourceChunk(db, lastKey, TERM_SEARCH_INDEX_BATCH_SIZE);
                if (!chunk.terms.length) break;
                if (generation !== this.termIndexGeneration) return;
                await this.addTermSearchIndexChunk(db, chunk.terms);
                indexedTerms += chunk.terms.length;
                await nextTask();
                if (chunk.done) break;
                lastKey = chunk.lastKey;
            }
            log.info('Term search index rebuilt', { terms: indexedTerms });
        } finally {
            done();
        }
    }

    private async rebuildTermKanjiIndex(db: IDBDatabase): Promise<void> {
        const done = log.time('Term kanji index rebuild');
        const generation = this.termIndexGeneration;
        try {
            await this.clearTermKanjiIndex(db);
            let indexedTerms = 0;
            let lastKey: IDBValidKey | undefined;
            for (;;) {
                if (generation !== this.termIndexGeneration) return;
                const chunk = await this.getTermSearchIndexSourceChunk(db, lastKey, TERM_KANJI_INDEX_BATCH_SIZE);
                if (!chunk.terms.length) break;
                if (generation !== this.termIndexGeneration) return;
                await this.addTermKanjiIndexChunk(db, chunk.terms);
                indexedTerms += chunk.terms.length;
                await nextTask();
                if (chunk.done) break;
                lastKey = chunk.lastKey;
            }
            log.info('Term kanji index rebuilt', { terms: indexedTerms });
        } finally {
            done();
        }
    }

    private getTermSearchIndexSourceChunk(
        db: IDBDatabase,
        afterKey: IDBValidKey | undefined,
        limit: number,
    ): Promise<{ terms: YomitanTermEntry[]; lastKey: IDBValidKey | undefined; done: boolean }> {
        return new Promise((resolve, reject) => {
            const terms: YomitanTermEntry[] = [];
            let lastKey: IDBValidKey | undefined = afterKey;
            const range = afterKey == null ? undefined : IDBKeyRange.lowerBound(afterKey, true);
            const request = db.transaction('terms', 'readonly').objectStore('terms').openCursor(range);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve({ terms, lastKey, done: true });
                    return;
                }
                terms.push(cursor.value as YomitanTermEntry);
                lastKey = cursor.key;
                if (terms.length >= limit) {
                    resolve({ terms, lastKey, done: false });
                    return;
                }
                cursor.continue();
            };
        });
    }

    private clearTermSearchIndex(db: IDBDatabase): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('termSearch', 'readwrite');
            tx.objectStore('termSearch').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    private clearTermKanjiIndex(db: IDBDatabase): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('termKanji', 'readwrite');
            tx.objectStore('termKanji').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    private async clearDerivedTermIndexes(db: IDBDatabase): Promise<void> {
        this.termIndexGeneration++;
        const stores = existingStores(db, ['termSearch', 'termKanji']);
        if (!stores.length) return;
        await clearStores(db, stores);
        this.termKanjiIndexReady = false;
    }

    private addTermSearchIndexChunk(db: IDBDatabase, terms: YomitanTermEntry[]): Promise<void> {
        return this.addDerivedTermIndexChunk(db, 'termSearch', terms, termSearchEntries);
    }

    private addTermKanjiIndexChunk(db: IDBDatabase, terms: YomitanTermEntry[]): Promise<void> {
        return this.addDerivedTermIndexChunk(db, 'termKanji', terms, termKanjiEntries);
    }

    private addDerivedTermIndexChunk<Row>(
        db: IDBDatabase,
        storeName: 'termSearch' | 'termKanji',
        terms: YomitanTermEntry[],
        rowsForTerm: (term: YomitanTermEntry) => Row[],
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            for (const term of terms) {
                for (const row of rowsForTerm(term)) store.add(row);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
            commitTransaction(tx);
        });
    }

    private countStore(db: IDBDatabase, storeName: InternalStoreName): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(storeName)) {
                resolve(0);
                return;
            }
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private db(): Promise<IDBDatabase> {
        this.dbPromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = event => {
                const db = request.result;
                const tx = request.transaction!;
                log.info('Upgrading dictionary database', { oldVersion: event.oldVersion, newVersion: DB_VERSION });
                const terms = ensureStore(db, tx, 'terms');
                ensureIndex(terms, 'expression', 'expression');
                ensureIndex(terms, 'reading', 'reading');
                ensureIndex(terms, 'dictionary', 'dictionary');

                const kanji = ensureStore(db, tx, 'kanji');
                ensureIndex(kanji, 'character', 'character');
                ensureIndex(kanji, 'dictionary', 'dictionary');

                const termMeta = ensureStore(db, tx, 'termMeta');
                ensureIndex(termMeta, 'expression', 'expression');
                ensureIndex(termMeta, 'dictionary', 'dictionary');

                const kanjiMeta = ensureStore(db, tx, 'kanjiMeta');
                ensureIndex(kanjiMeta, 'character', 'character');
                ensureIndex(kanjiMeta, 'dictionary', 'dictionary');

                if (!db.objectStoreNames.contains('dictionaryInfo')) {
                    db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
                }
                const termSearch = ensureStore(db, tx, 'termSearch');
                ensureIndex(termSearch, 'token', 'token');
                ensureIndex(termSearch, 'dictionary', 'dictionary');

                const termKanji = ensureStore(db, tx, 'termKanji');
                ensureIndex(termKanji, 'character', 'character');
                ensureIndex(termKanji, 'dictionary', 'dictionary');

            };
            request.onsuccess = () => {
                const db = request.result;
                this.installVersionChangeHandler(db);
                resolve(db);
            };
            request.onerror = () => {
                log.warn('Dictionary database open failed', { error: request.error });
                reject(request.error);
            };
        });
        return this.dbPromise;
    }

    private installVersionChangeHandler(db: IDBDatabase): void {
        db.onversionchange = event => {
            log.info('Dictionary DB version change; closing', {
                name: DB_NAME,
                oldVersion: event.oldVersion,
                newVersion: event.newVersion,
            });
            db.close();
            this.dbPromise = undefined;
            this.invalidateCaches();
        };
    }

    invalidateCaches(): void {
        this.dictionaryInfoPromise = undefined;
        this.summaryPromise = undefined;
        this.dictionaryStyleCssCache.clear();
        this.hotLookupCache.clear();
        this.termKanjiIndexReady = false;
    }
}

async function readYomitanZipIndex(zip: ZipArchive, language: InterfaceLanguage = 'en'): Promise<YomitanZipIndex> {
    return JSON.parse(await readZipText(zip, 'index.json').catch(() => {
        throw new Error(uiText(language, 'dictionaryZipMissingIndex'));
    })) as YomitanZipIndex;
}

function countYomitanZipBanks(entries: ReturnType<ZipArchive['entries']>): number {
    return entries.filter(entry => /^(term|kanji|term_meta|kanji_meta)_bank_\d+\.json$/i.test(entry.name)).length;
}

function formatUiTemplate(template: string, values: Record<string, string>): string {
    return Object.entries(values).reduce((value, [key, replacement]) => value.replaceAll(`{${key}}`, replacement), template);
}

function cursorScanLimitReached(visited: number, startedAt: number, maxRows: number, maxMs: number): boolean {
    return positiveLimitReached(maxRows, visited) || positiveLimitReached(maxMs, performance.now() - startedAt);
}

async function scanObjectStoreCursor<T>(
    db: IDBDatabase,
    { storeName, maxRows, maxMs, errorMessage }: StoreCursorScanOptions,
    visit: (entry: T) => void,
): Promise<void> {
    const startedAt = performance.now();
    let visited = 0;
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).openCursor();
        request.onerror = () => reject(request.error ?? new Error(errorMessage));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || cursorScanLimitReached(visited, startedAt, maxRows, maxMs)) {
                resolve();
                return;
            }
            visited++;
            visit(cursor.value as T);
            cursor.continue();
        };
    });
}

function optionalCursorScanLimitReached(options: GlossaryCursorSearchOptions, visited: number, startedAt: number): boolean {
    return optionalLimitReached(options.maxRows, visited) || optionalLimitReached(options.maxMs, performance.now() - startedAt);
}

function positiveLimitReached(limit: number, value: number): boolean {
    return limit > 0 && value >= limit;
}

function optionalLimitReached(limit: number | undefined, value: number): boolean {
    return Boolean(limit && value >= limit);
}

function addRandomListTermToReservoir(
    entry: YomitanTermEntry,
    rank: Map<string, DictionaryPreference>,
    seen: Set<string>,
    reservoir: YomitanTermEntry[],
    limit: number,
    count: number,
): number {
    if (!isRandomListTerm(entry, rank)) return count;
    return addUniqueTermToReservoir(entry, seen, reservoir, limit, count);
}

function addCommonTermToReservoir(
    entry: YomitanTermEntry,
    rank: Map<string, DictionaryPreference>,
    seen: Set<string>,
    reservoir: YomitanTermEntry[],
    limit: number,
    count: number,
): number {
    if (!isCommonDictionaryTerm(entry, rank)) return count;
    return addUniqueTermToReservoir(entry, seen, reservoir, limit, count);
}

function addUniqueTermToReservoir(
    entry: YomitanTermEntry,
    seen: Set<string>,
    reservoir: YomitanTermEntry[],
    limit: number,
    count: number,
): number {
    const key = termExpressionReadingKey(entry);
    if (seen.has(key)) return count;
    seen.add(key);
    const nextCount = count + 1;
    if (reservoir.length < limit) {
        reservoir.push(entry);
        return nextCount;
    }
    const index = Math.floor(Math.random() * nextCount);
    if (index < limit) reservoir[index] = entry;
    return nextCount;
}

function isRandomListTerm(entry: YomitanTermEntry, rank: Map<string, DictionaryPreference>): boolean {
    if (!entry.expression) return false;
    if (!JAPANESE_RE.test(entry.expression)) return false;
    if (entry.expression.length > 6) return false;
    return dictionaryEnabled(entry.dictionary, rank);
}

function addTopFrequencyExpression(
    expressions: Map<string, number>,
    entry: YomitanMetaEntry,
    maxRank: number,
    rank: Map<string, DictionaryPreference>,
): void {
    if (entry.mode !== 'freq') return;
    if (!entry.expression) return;
    if (!dictionaryEnabled(entry.dictionary, rank)) return;
    const freq = extractFrequency(entry.data);
    if (freq === undefined) return;
    if (freq > maxRank) return;
    expressions.set(entry.expression, Math.min(freq, expressions.get(entry.expression) ?? Number.POSITIVE_INFINITY));
}

function addSimilarTermByKanjiCandidate(
    entries: YomitanTermEntry[],
    seen: Set<string>,
    entry: YomitanTermEntry,
    character: string,
    rank: Map<string, DictionaryPreference>,
): void {
    if (!entry.expression?.includes(character)) return;
    if (!dictionaryEnabled(entry.dictionary, rank)) return;
    addUniqueTermEntry(entries, seen, entry);
}

function addUniqueTermEntry(entries: YomitanTermEntry[], seen: Set<string>, entry: YomitanTermEntry): void {
    const key = termExpressionReadingKey(entry);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
}

function termExpressionReadingKey(entry: Pick<YomitanTermEntry, 'expression' | 'reading'>): string {
    return `${entry.expression}\n${entry.reading}`;
}

function formatDexieImportProgress(text: UiTextLookup, imported: number, totalRows: number): string {
    const importedCount = imported.toLocaleString();
    if (totalRows > 0) {
        return `${text('dictionaryImported')} ${importedCount} / ${totalRows.toLocaleString()} ${text('dictionaryRecords')}...`;
    }
    return `${text('dictionaryImported')} ${importedCount} ${text('dictionaryRecords')}...`;
}

function formatDexieStoreImportProgress(
    text: UiTextLookup,
    store: EntryStoreName,
    imported: number,
    tableTotal: number,
    totalImported: number,
    totalRows: number,
): string {
    const importedCount = imported.toLocaleString();
    if (tableTotal > 0 && totalRows > 0) {
        return `${text('dictionaryImporting')} ${store}: ${importedCount} / ${tableTotal.toLocaleString()} ${text('dictionaryEntries')} (${totalImported.toLocaleString()} / ${totalRows.toLocaleString()} ${text('dictionaryTotal')})...`;
    }
    return `${text('dictionaryImporting')} ${store}: ${importedCount} ${text('dictionaryEntries')}...`;
}

function glossaryIndexSearchOptions(options: TermSearchOptions): GlossaryCursorSearchOptions {
    return {
        maxRows: options.glossaryIndexMaxRows ?? TERM_SEARCH_INDEX_CURSOR_MAX_ROWS,
        maxMs: options.glossaryIndexMaxMs ?? TERM_SEARCH_INDEX_CURSOR_MAX_MS,
    };
}

function glossaryFallbackSearchOptions(options: TermSearchOptions): GlossaryCursorSearchOptions {
    return {
        maxRows: options.glossaryFallbackMaxRows ?? TERM_SEARCH_LEGACY_FALLBACK_MAX_ROWS,
        maxMs: options.glossaryFallbackMaxMs ?? TERM_SEARCH_LEGACY_FALLBACK_MAX_MS,
    };
}

function glossaryCursorSearchExpired(options: GlossaryCursorSearchOptions, visited: number, startedAt: number): boolean {
    return Boolean((options.maxRows && visited >= options.maxRows)
        || (options.maxMs && performance.now() - startedAt >= options.maxMs));
}

function hasReadyEmptyGlossarySearchIndex(indexedCount: number, building: boolean): boolean {
    return indexedCount > 0 && !building;
}

function shouldSkipGlossaryFallback(building: boolean, options: TermSearchOptions): boolean {
    return building && options.fallbackWhileIndexing === false;
}

function yomitanZipDictionaryName(index: YomitanZipIndex, filename: string): string {
    return index.title?.trim() || filename.replace(/\.zip$/i, '');
}

function yomitanZipVersion(index: YomitanZipIndex): number {
    return index.format ?? index.version ?? 3;
}

async function yomitanZipDictionaryInfo(
    zip: ZipArchive,
    index: YomitanZipIndex,
    dictionary: string,
    sourceUrl: string,
): Promise<YomitanDictionaryInfo> {
    return {
        title: dictionary,
        alias: dictionary,
        enabled: true,
        priority: 0,
        styles: await readOptionalZipText(zip, 'styles.css'),
        revision: typeof index.revision === 'string' ? index.revision : undefined,
        downloadUrl: sourceUrl || undefined,
        importDate: Date.now(),
    };
}

async function readOptionalZipText(zip: ZipArchive, name: string): Promise<string> {
    return readZipText(zip, name).catch(() => '');
}

async function readZipText(zip: ZipArchive, name: string): Promise<string> {
    return zip.text(name);
}

async function inlineStructuredImageDataUrls(zip: ZipArchive, value: unknown): Promise<void> {
    if (value == null) return;
    if (Array.isArray(value)) {
        for (const item of value) await inlineStructuredImageDataUrls(zip, item);
        return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const path = typeof record.path === 'string' ? normalizeMediaPath(record.path) : '';
    if (path && record.type === 'image') {
        const dataUrl = await zipImageDataUrl(zip, path);
        if (dataUrl) record.path = dataUrl;
    }
    await inlineStructuredImageDataUrls(zip, record.content);
}

async function zipImageDataUrl(zip: ZipArchive, path: string): Promise<string> {
    const bytes = await zip.bytes(path).catch(() => null);
    return bytes ? `data:${imageMimeType(path)};base64,${bytesToBase64(bytes)}` : '';
}

function imageMimeType(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function normalizeZipTermRow(row: unknown, dictionary: string): YomitanTermEntry | null {
    if (!Array.isArray(row)) return null;
    const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = row;
    if (typeof expression !== 'string') return null;
    return {
        expression,
        reading: zipTermReading(reading, expression),
        definitionTags: zipStringField(definitionTags),
        rules: zipStringField(rules),
        score: zipNumberField(score, 0),
        glossary: zipGlossaryField(glossary),
        sequence: zipOptionalNumberField(sequence),
        termTags: zipStringField(termTags),
        dictionary,
    };
}

function zipTermReading(value: unknown, expression: string): string {
    return typeof value === 'string' && value ? value : expression;
}

function zipStringField(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function zipNumberField(value: unknown, fallback: number): number {
    return typeof value === 'number' ? value : fallback;
}

function zipOptionalNumberField(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function zipGlossaryField(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function normalizeZipKanjiRow(row: unknown, dictionary: string, version: number): YomitanKanjiEntry | null {
    if (!Array.isArray(row)) return null;
    const [character, onyomi, kunyomi, tags, meaningsOrFirst, stats] = row;
    if (typeof character !== 'string') return null;
    const meanings = version === 1 ? row.slice(4) : meaningsOrFirst;
    return {
        character,
        onyomi: splitTags(onyomi),
        kunyomi: splitTags(kunyomi),
        tags: splitTags(tags),
        meanings: Array.isArray(meanings) ? meanings.map(String) : [],
        stats,
        dictionary,
    };
}

function normalizeZipTermMetaRow(row: unknown, dictionary: string): YomitanMetaEntry | null {
    if (!Array.isArray(row)) return null;
    const [expression, mode, data] = row;
    return typeof expression === 'string' && typeof mode === 'string' ? { expression, mode, data, dictionary } : null;
}

function normalizeZipKanjiMetaRow(row: unknown, dictionary: string): YomitanMetaEntry | null {
    if (!Array.isArray(row)) return null;
    const [character, mode, data] = row;
    return typeof character === 'string' && typeof mode === 'string' ? { character, mode, data, dictionary } : null;
}

function termLookupDedupKey(entry: YomitanTermEntry): string {
    const glossaryKey = JSON.stringify(entry.glossary);
    return entry.sequence !== undefined
        ? `${entry.dictionary}\nsequence:${entry.sequence}\n${glossaryKey}`
        : `${entry.dictionary}\n${entry.expression}\n${entry.reading}\n${glossaryKey}`;
}

function bestTermLookupEntry(
    entries: YomitanTermEntry[],
    expression: string,
    rank: Map<string, DictionaryPreference>,
): YomitanTermEntry | null {
    const seen = new Set<string>();
    for (const entry of [...entries].sort((a, b) => compareTermLookupEntries(a, b, expression, rank))) {
        if (!dictionaryEnabled(entry.dictionary, rank)) continue;
        const key = termLookupDedupKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        return entry;
    }
    return null;
}

function compareTermLookupEntries(
    a: YomitanTermEntry,
    b: YomitanTermEntry,
    expression: string,
    rank: Map<string, DictionaryPreference>,
): number {
    return dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)
        || Number(b.expression === expression) - Number(a.expression === expression)
        || (b.score ?? 0) - (a.score ?? 0);
}

function normalizeTermSearchQuery(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function shouldSearchTermGlossaries(query: string): boolean {
    return !JAPANESE_RE.test(query);
}

function termSearchIndexToken(query: string): string {
    return glossaryWords(normalizeGlossarySearchText(query)).find(word => word.length >= TERM_SEARCH_INDEX_MIN_TOKEN_LENGTH) ?? '';
}

function termSearchPrefixRange(query: string): IDBKeyRange {
    return IDBKeyRange.bound(query, `${query}${TERM_SEARCH_PREFIX_BOUNDARY}`, false, false);
}

function rankedTermSearchResults(
    candidates: TermSearchCandidate[],
    query: string,
    limit: number,
    rank: Map<string, DictionaryPreference>,
): YomitanTermEntry[] {
    const seen = new Set<string>();
    return candidates
        .filter(candidate => dictionaryEnabled(candidate.entry.dictionary, rank))
        .sort((a, b) => compareTermSearchCandidates(a, b, query, rank))
        .filter(candidate => {
            const key = termLookupDedupKey(candidate.entry);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map(candidate => candidate.entry)
        .slice(0, limit);
}

function indexedTermSearchRank(entry: YomitanTermEntry, query: string): number {
    if (entry.expression === query) return 0;
    if (entry.reading === query) return 4;
    if (entry.expression.startsWith(query)) return 10;
    if (entry.reading.startsWith(query)) return 12;
    if (entry.expression.includes(query)) return 24;
    if (entry.reading.includes(query)) return 26;
    return 60;
}

function glossaryTermSearchRank(glossary: unknown[], query: string): number {
    const normalizedQuery = normalizeGlossarySearchText(query);
    if (!normalizedQuery) return Number.POSITIVE_INFINITY;
    const text = normalizeGlossarySearchText(glossaryValueToSearchText(glossary));
    if (!text) return Number.POSITIVE_INFINITY;
    if (text === normalizedQuery) return 30;
    if (glossaryHasExactWord(text, normalizedQuery)) return 34;
    if (glossaryHasWordPrefix(text, normalizedQuery)) return 44;
    if (text.includes(normalizedQuery)) return 68;
    return Number.POSITIVE_INFINITY;
}

function glossaryHasExactWord(text: string, query: string): boolean {
    return glossaryWords(text).some(word => word === query);
}

function glossaryHasWordPrefix(text: string, query: string): boolean {
    return glossaryWords(text).some(word => word.startsWith(query));
}

function glossaryWords(text: string): string[] {
    return text.split(/\s+/u).filter(Boolean);
}

function termSearchEntries(entry: YomitanTermEntry): YomitanTermSearchEntry[] {
    const { id: _id, ...entryWithoutId } = entry;
    return glossarySearchTokens(entry.glossary).map(token => ({
        ...entryWithoutId,
        token,
    }));
}

function termEntryFromSearchEntry(entry: YomitanTermSearchEntry): YomitanTermEntry {
    const { id: _id, token: _token, ...term } = entry;
    return term;
}

function termKanjiEntries(entry: YomitanTermEntry): YomitanTermKanjiEntry[] {
    const { id: _id, ...entryWithoutId } = entry;
    return uniqueExpressionKanji(entry.expression).map(character => ({
        ...entryWithoutId,
        character,
    }));
}

function termEntryFromKanjiEntry(entry: YomitanTermKanjiEntry): YomitanTermEntry {
    const { id: _id, character: _character, ...term } = entry;
    return term;
}

function uniqueExpressionKanji(expression: string): string[] {
    const seen = new Set<string>();
    return Array.from(expression).filter(character => {
        if (!isKanji(character) || seen.has(character)) return false;
        seen.add(character);
        return true;
    });
}

function glossarySearchTokens(glossary: unknown[]): string[] {
    return uniqueSearchTokens(glossaryWords(normalizeGlossarySearchText(glossaryValueToSearchText(glossary))).flatMap(glossaryWordSearchTokens))
        .slice(0, TERM_SEARCH_INDEX_MAX_TOKENS_PER_TERM);
}

function glossaryWordSearchTokens(word: string): string[] {
    const tokens: string[] = [];
    const variants = uniqueSearchTokens([
        word,
        word.endsWith("'s") ? word.slice(0, -2) : '',
        word.endsWith('s') ? word.slice(0, -1) : '',
    ]);
    for (const variant of variants) {
        tokens.push(variant);
        for (let start = 1; start <= variant.length - TERM_SEARCH_INDEX_MIN_SUFFIX_LENGTH; start++) {
            tokens.push(variant.slice(start));
        }
    }
    return tokens;
}

function uniqueSearchTokens(tokens: string[]): string[] {
    const seen = new Set<string>();
    return tokens.filter(token => {
        if (token.length < TERM_SEARCH_INDEX_MIN_TOKEN_LENGTH || seen.has(token)) return false;
        seen.add(token);
        return true;
    });
}

function trimTermSearchCandidates(
    candidates: TermSearchCandidate[],
    candidateLimit: number,
    query: string,
    rank: Map<string, DictionaryPreference>,
): void {
    if (candidates.length <= candidateLimit * 2) return;
    candidates.sort((a, b) => compareTermSearchCandidates(a, b, query, rank));
    candidates.length = candidateLimit;
}

function compareTermSearchCandidates(
    a: TermSearchCandidate,
    b: TermSearchCandidate,
    query: string,
    rank: Map<string, DictionaryPreference>,
): number {
    return a.rank - b.rank
        || dictionaryPriority(a.entry.dictionary, rank) - dictionaryPriority(b.entry.dictionary, rank)
        || (b.entry.score ?? 0) - (a.entry.score ?? 0)
        || Number(b.entry.expression === query) - Number(a.entry.expression === query)
        || a.entry.expression.length - b.entry.expression.length;
}

function reservoirSample<T>(items: T[], limit: number): T[] {
    const reservoir: T[] = [];
    let count = 0;
    for (const item of items) {
        count++;
        if (reservoir.length < limit) {
            reservoir.push(item);
        } else {
            const index = Math.floor(Math.random() * count);
            if (index < limit) reservoir[index] = item;
        }
    }
    return reservoir;
}

function isCommonDictionaryTerm(entry: YomitanTermEntry, rank: Map<string, DictionaryPreference>): boolean {
    return isCommonDictionaryTermCandidate(entry, rank)
        && (hasCommonDictionaryTags(entry) || hasCommonDictionaryScore(entry));
}

function isCommonDictionaryTermCandidate(entry: YomitanTermEntry, rank: Map<string, DictionaryPreference>): boolean {
    return Boolean(entry.expression
        && JAPANESE_RE.test(entry.expression)
        && entry.expression.length <= 8
        && dictionaryEnabled(entry.dictionary, rank));
}

function hasCommonDictionaryTags(entry: YomitanTermEntry): boolean {
    return /\b(common|ichi1|news1|spec1|gai1|freq|popular)\b/.test(dictionaryTermTags(entry));
}

function dictionaryTermTags(entry: YomitanTermEntry): string {
    return `${entry.definitionTags ?? ''} ${entry.termTags ?? ''} ${entry.rules ?? ''}`.toLowerCase();
}

function hasCommonDictionaryScore(entry: YomitanTermEntry): boolean {
    return typeof entry.score === 'number' && entry.score >= 5;
}

function isKanji(value: string): boolean {
    const code = value.codePointAt(0) ?? 0;
    return code >= 0x3400 && code <= 0x9fff;
}

function ensureStore(db: IDBDatabase, tx: IDBTransaction, name: InternalStoreName): IDBObjectStore {
    return db.objectStoreNames.contains(name)
        ? tx.objectStore(name)
        : db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
}

function hasStore(db: IDBDatabase, name: InternalStoreName): boolean {
    return db.objectStoreNames.contains(name);
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string): void {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
}

function existingStores<T extends InternalStoreName>(db: IDBDatabase, names: T[]): T[] {
    return names.filter(name => db.objectStoreNames.contains(name));
}

function normalizeMediaPath(path: string): string {
    return path.trim().replace(/^\.?\//, '').replace(/\\/g, '/');
}

function readwriteTransaction(db: IDBDatabase, storeNames: string | string[]): IDBTransaction {
    try {
        return db.transaction(storeNames, 'readwrite', { durability: 'relaxed' });
    } catch {
        return db.transaction(storeNames, 'readwrite');
    }
}

function commitTransaction(tx: IDBTransaction): void {
    try {
        tx.commit?.();
    } catch {
        // Older browsers, Safari in particular, may not support explicit commits.
    }
}

function clearStores(db: IDBDatabase, stores: InternalStoreName[]): Promise<void> {
    if (!stores.length) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const tx = readwriteTransaction(db, stores);
        for (const store of stores) tx.objectStore(store).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(transactionError(tx, `Could not clear dictionary stores: ${stores.join(', ')}.`));
        tx.onabort = () => reject(transactionError(tx, `Could not clear dictionary stores: ${stores.join(', ')}.`));
        commitTransaction(tx);
    });
}

async function deleteByDictionary(db: IDBDatabase, storeName: InternalStoreName, dictionary: string): Promise<void> {
    while (await deleteDictionaryBatch(db, storeName, dictionary, DICTIONARY_DELETE_BATCH_SIZE) >= DICTIONARY_DELETE_BATCH_SIZE) {
        await nextTask();
    }
}

function deleteDictionaryBatch(db: IDBDatabase, storeName: InternalStoreName, dictionary: string, limit: number): Promise<number> {
    return new Promise((resolve, reject) => {
        let deleted = 0;
        const tx = readwriteTransaction(db, storeName);
        const index = tx.objectStore(storeName).index('dictionary');
        const request = index.openCursor(IDBKeyRange.only(dictionary));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || deleted >= limit) return;
            cursor.delete();
            deleted++;
            if (deleted >= limit) return;
            cursor.continue();
        };
        request.onerror = () => reject(request.error ?? new Error(`Could not delete ${dictionary} entries from ${storeName}.`));
        tx.oncomplete = () => resolve(deleted);
        tx.onerror = () => reject(transactionError(tx, `Could not delete ${dictionary} entries from ${storeName}.`));
        tx.onabort = () => reject(transactionError(tx, `Could not delete ${dictionary} entries from ${storeName}.`));
    });
}

function transactionError(tx: IDBTransaction, fallback: string): Error {
    return tx.error ?? new Error(fallback);
}

function nextTask(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}
