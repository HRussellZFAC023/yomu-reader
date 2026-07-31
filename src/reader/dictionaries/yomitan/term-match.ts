import { targetLookupCandidateRulesMatch } from '../../languages/morphology';
import { genericLookupTextVariants } from '../../languages/lookup-normalization';
import { dictionaryEnabled, dictionaryPriority } from './ranking';
import type { DictionaryPreference } from '../../app/types';
import type { LanguageLookupCandidate, LearningTargetModule } from '../../languages/types';
import type { YomitanTermEntry, YomitanTermMatch } from './types';

const WHITESPACE_RE = /\s/u;

export interface TermMatchCandidatePosition {
    start: number;
    end: number;
    surface: string;
    deinflected: LanguageLookupCandidate;
}

export type TermMatchCandidates = Map<string, TermMatchCandidatePosition[]>;

export interface TargetTermMatchLookupCandidate {
    key: string;
    deinflected: LanguageLookupCandidate;
}

/**
 * The exact expression/reading keys queried for one target-owned surface.
 *
 * Keep this pure seam shared by the production IndexedDB lookup and the
 * authoritative published-archive scanner. The scanner can then discard rows
 * which the production matcher provably cannot request without copying the
 * target's morphology or Unicode-normalisation rules.
 */
export function targetTermMatchLookupCandidates(
    target: LearningTargetModule,
    surface: string,
): readonly TargetTermMatchLookupCandidate[] {
    const result: TargetTermMatchLookupCandidate[] = [];
    for (const deinflected of target.lookupCandidates(surface)) {
        if (!target.isLookupableText(deinflected.term)) continue;
        for (const key of genericLookupTextVariants(deinflected.term)) {
            result.push({ key, deinflected });
        }
    }
    return result;
}

/** Whether production asks the reading index in addition to expression. */
export function targetTermMatchQueriesReadingIndex(target: LearningTargetModule): boolean {
    return target.lookupSweepMode !== 'left-to-right-longest-exact';
}

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

/**
 * Whether a swept substring is worth asking the dictionary about.
 *
 * Two claims, both the target's to make rather than the engine's: the substring
 * is text in the language being read, and it is one word. The whitespace rule
 * is why the sweep terminates at all — without it every span of a paragraph
 * would be a candidate — and it is also this path's honest limit: a term
 * written with a space in it is not reachable here.
 */
export function isSearchableTargetSurface(surface: string, target: LearningTargetModule): boolean {
    return target.isLookupableText(surface) && !WHITESPACE_RE.test(surface);
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
    // Rule tags are the target's own vocabulary — Japanese knows `v5m` is a
    // kind of `v5`, and nothing else does — so the engine asks the target
    // whether an entry answers a candidate instead of comparing tags itself.
    const entry = entries.find(item => targetLookupCandidateRulesMatch(item.rules, position.deinflected.rules));
    return entry
        ? {
            entry,
            ...position,
            deinflected: position.deinflected.depth > 0 ? position.deinflected : undefined,
        }
        : null;
}
