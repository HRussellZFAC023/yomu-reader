import { dictionaryEnabled, extractFrequency } from './ranking';
import { JAPANESE_RE } from './row-coerce';
import type { YomitanTermEntry, YomitanMetaEntry, GlossaryCursorSearchOptions, TermSearchOptions } from './types';
import type { DictionaryPreference } from '../../app/types';

const TERM_SEARCH_LEGACY_FALLBACK_MAX_ROWS = 12000;
const TERM_SEARCH_LEGACY_FALLBACK_MAX_MS = 140;
const TERM_SEARCH_INDEX_CURSOR_MAX_ROWS = 8000;
const TERM_SEARCH_INDEX_CURSOR_MAX_MS = 180;

export function cursorScanLimitReached(visited: number, startedAt: number, maxRows: number, maxMs: number): boolean {
    return positiveLimitReached(maxRows, visited) || positiveLimitReached(maxMs, performance.now() - startedAt);
}

export function optionalCursorScanLimitReached(options: GlossaryCursorSearchOptions, visited: number, startedAt: number): boolean {
    return optionalLimitReached(options.maxRows, visited) || optionalLimitReached(options.maxMs, performance.now() - startedAt);
}

function positiveLimitReached(limit: number, value: number): boolean {
    return limit > 0 && value >= limit;
}

function optionalLimitReached(limit: number | undefined, value: number): boolean {
    return Boolean(limit && value >= limit);
}

export function addRandomListTermToReservoir(
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

export function addCommonTermToReservoir(
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

export function addTopFrequencyExpression(
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

export function addSimilarTermByKanjiCandidate(
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

export function glossaryIndexSearchOptions(options: TermSearchOptions): GlossaryCursorSearchOptions {
    return {
        maxRows: options.glossaryIndexMaxRows ?? TERM_SEARCH_INDEX_CURSOR_MAX_ROWS,
        maxMs: options.glossaryIndexMaxMs ?? TERM_SEARCH_INDEX_CURSOR_MAX_MS,
    };
}

export function glossaryFallbackSearchOptions(options: TermSearchOptions): GlossaryCursorSearchOptions {
    return {
        maxRows: options.glossaryFallbackMaxRows ?? TERM_SEARCH_LEGACY_FALLBACK_MAX_ROWS,
        maxMs: options.glossaryFallbackMaxMs ?? TERM_SEARCH_LEGACY_FALLBACK_MAX_MS,
    };
}

export function glossaryCursorSearchExpired(options: GlossaryCursorSearchOptions, visited: number, startedAt: number): boolean {
    return Boolean((options.maxRows && visited >= options.maxRows)
        || (options.maxMs && performance.now() - startedAt >= options.maxMs));
}

export function hasReadyEmptyGlossarySearchIndex(indexedCount: number, building: boolean): boolean {
    return indexedCount > 0 && !building;
}

export function shouldSkipGlossaryFallback(building: boolean, options: TermSearchOptions): boolean {
    return building && options.fallbackWhileIndexing === false;
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
