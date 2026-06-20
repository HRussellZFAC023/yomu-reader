import { termRulesMatch, type DeinflectedTerm } from '../../lookup/deinflect';
import { dictionaryEnabled, dictionaryPriority } from './ranking';
import type { DictionaryPreference } from '../../app/types';
import type { YomitanTermEntry, YomitanTermMatch } from './types';

const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

export interface TermMatchCandidatePosition {
    start: number;
    end: number;
    surface: string;
    deinflected: DeinflectedTerm;
}

export type TermMatchCandidates = Map<string, TermMatchCandidatePosition[]>;

interface RankedDictionaryEntry {
    dictionary: string;
}

export function readIndexRequestValues<T>(
    index: IDBIndex,
    query: IDBKeyRange,
    limit: number,
    resolve: (entries: T[]) => void,
    reject: (reason?: unknown) => void,
): void {
    if (typeof index.getAll === 'function') {
        const request = index.getAll(query, limit);
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
        return;
    }

    const results: T[] = [];
    let count = 0;
    const request = index.openCursor(query);
    request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || count >= limit) {
            resolve(results);
            return;
        }
        results.push(cursor.value as T);
        count++;
        cursor.continue();
    };
    request.onerror = () => reject(request.error);
}

export function isSearchableJapaneseSurface(surface: string): boolean {
    return JAPANESE_RE.test(surface) && !/\s/.test(surface);
}

export function sortedTermMatchExpressions(candidates: TermMatchCandidates): string[] {
    return Array.from(candidates.keys()).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function requestTermMatchIndex(
    index: IDBIndex,
    expression: string,
    addMatches: (expression: string, entries: YomitanTermEntry[]) => void,
    finish: () => void,
    reject: (reason?: unknown) => void,
): void {
    const request = index.getAll(IDBKeyRange.only(expression), 8);
    request.onsuccess = () => {
        addMatches(expression, request.result as YomitanTermEntry[]);
        finish();
    };
    request.onerror = () => reject(request.error);
}

export function termMatchesForEntries(
    expression: string,
    foundEntries: YomitanTermEntry[],
    candidates: TermMatchCandidates,
    rank: Map<string, DictionaryPreference>,
): YomitanTermMatch[] {
    const entries = sortTermMatchEntries(deduplicateTermMatchEntries(foundEntries), rank);
    if (!entries.length) return [];
    return (candidates.get(expression) ?? [])
        .map(position => termMatchForPosition(position, entries))
        .filter((match): match is YomitanTermMatch => Boolean(match));
}

function deduplicateTermMatchEntries(entries: YomitanTermEntry[]): YomitanTermEntry[] {
    const seen = new Set<string>();
    return entries.filter(item => {
        const key = `${item.id ?? ''}\n${item.dictionary}\n${item.expression}\n${item.reading}\n${item.sequence ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function sortTermMatchEntries(entries: YomitanTermEntry[], rank: Map<string, DictionaryPreference>): YomitanTermEntry[] {
    return entries
        .filter(item => dictionaryEnabled(item.dictionary, rank))
        .sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || (b.score ?? 0) - (a.score ?? 0));
}

export function rankedDictionaryEntries<T extends RankedDictionaryEntry>(
    entries: T[],
    rank: Map<string, DictionaryPreference>,
    limit?: number,
    compare: (a: T, b: T) => number = (a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank),
): T[] {
    const ranked = entries
        .filter(entry => dictionaryEnabled(entry.dictionary, rank))
        .sort(compare);
    return limit === undefined ? ranked : ranked.slice(0, limit);
}

function termMatchForPosition(position: TermMatchCandidatePosition, entries: YomitanTermEntry[]): YomitanTermMatch | null {
    const entry = entries.find(item => termRulesMatch(item.rules, position.deinflected.rules));
    return entry
        ? {
            entry,
            ...position,
            deinflected: position.deinflected.depth > 0 ? position.deinflected : undefined,
        }
        : null;
}
