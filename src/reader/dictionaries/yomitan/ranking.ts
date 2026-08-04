import { normalizeDictionaryPreferences } from '../../settings/index';
import type { DictionaryPreference } from '../../app/types';
import type { YomitanMetaEntry, YomitanTermMatch } from './types';

type DictionaryRank = Map<string, DictionaryPreference>;
type TermMatchComparator = (a: YomitanTermMatch, b: YomitanTermMatch, rank?: DictionaryRank) => number;

/**
 * Which entry answers for a span, in order of what decides it.
 *
 * Length, deinflection depth and start pick the SPAN, so they come first --
 * dictionary order must never change where a word begins or ends. Once the span
 * is settled the remaining question is which dictionary answers for it, and
 * until now that was decided ALPHABETICALLY by dictionary name: the shelf order
 * a learner arranged in Settings had no effect on lookups at all (GitHub #43).
 */
const TERM_MATCH_SELECTION_COMPARATORS: TermMatchComparator[] = [
    compareTermMatchLengthDescending,
    compareTermMatchDeinflectionDepth,
    compareTermMatchStart,
    compareTermMatchDictionaryPriority,
    compareTermMatchDictionaryName,
    compareTermMatchEntryScoreDescending,
];

export function dictionaryRank(preferences: DictionaryPreference[]): DictionaryRank {
    const rank = new Map(normalizeDictionaryPreferences(preferences).map(item => [item.name, item]));
    return rank;
}

export function dictionaryEnabled(dictionary: string, rank: DictionaryRank): boolean {
    return rank.get(dictionary)?.enabled ?? true;
}

export function dictionaryPriority(dictionary: string, rank: DictionaryRank): number {
    return rank.get(dictionary)?.priority ?? 9999;
}

export function compareMetaEntries(a: YomitanMetaEntry, b: YomitanMetaEntry, rank: DictionaryRank): number {
    return compareMetaModes(a, b) || compareMetaEntriesWithinMode(a, b, rank);
}

function compareMetaModes(a: YomitanMetaEntry, b: YomitanMetaEntry): number {
    return metaModePriority(a) - metaModePriority(b);
}

function metaModePriority(entry: YomitanMetaEntry): number {
    return entry.mode === 'freq' ? 0 : 1;
}

function compareMetaEntriesWithinMode(a: YomitanMetaEntry, b: YomitanMetaEntry, rank: DictionaryRank): number {
    return a.mode === 'freq' && b.mode === 'freq'
        ? compareFrequencyMetaEntries(a, b, rank)
        : compareDictionaryMetaEntries(a, b, rank);
}

function compareFrequencyMetaEntries(a: YomitanMetaEntry, b: YomitanMetaEntry, rank: DictionaryRank): number {
    // A shelf order the learner arranged outranks Yomu's own preference for a
    // JPDB frequency list; the JPDB default only decides between dictionaries
    // the learner has never ordered.
    return compareDeclaredDictionaryPriority(a, b, rank)
        || jpdbFrequencyPriority(a) - jpdbFrequencyPriority(b)
        || compareDictionaryPriority(a, b, rank)
        || frequencyRank(a.data) - frequencyRank(b.data)
        || compareDictionaryName(a, b);
}

function compareDeclaredDictionaryPriority(a: YomitanMetaEntry, b: YomitanMetaEntry, rank: DictionaryRank): number {
    return rank.has(a.dictionary) && rank.has(b.dictionary) ? compareDictionaryPriority(a, b, rank) : 0;
}

function jpdbFrequencyPriority(entry: YomitanMetaEntry): number {
    return isJpdbFrequencyDictionary(entry.dictionary) ? 0 : 1;
}

function compareDictionaryMetaEntries(a: YomitanMetaEntry, b: YomitanMetaEntry, rank: DictionaryRank): number {
    return compareDictionaryPriority(a, b, rank) || compareDictionaryName(a, b);
}

function compareDictionaryPriority(a: YomitanMetaEntry, b: YomitanMetaEntry, rank: DictionaryRank): number {
    return dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank);
}

function compareDictionaryName(a: YomitanMetaEntry, b: YomitanMetaEntry): number {
    return a.dictionary.localeCompare(b.dictionary);
}

export function extractFrequency(value: unknown): number | undefined {
    const rank = frequencyRank(value);
    return Number.isFinite(rank) ? rank : undefined;
}

export function nonOverlappingMatches(matches: YomitanTermMatch[], limit: number, rank?: DictionaryRank): YomitanTermMatch[] {
    const selected: YomitanTermMatch[] = [];
    const occupied: Array<[number, number]> = [];
    const overlaps = (match: YomitanTermMatch) => occupied.some(([start, end]) => match.start < end && match.end > start);
    for (const match of matches.sort((left, right) => compareTermMatchesForSelection(left, right, rank))) {
        if (overlaps(match)) continue;
        selected.push(match);
        occupied.push([match.start, match.end]);
        if (selected.length >= limit) break;
    }
    const result = selected.sort((a, b) => a.start - b.start);
    return result;
}

/**
 * Conventional maximal matching for unspaced Han text.
 *
 * At the earliest dictionary-backed start, take the longest exact expression
 * and advance to its end. A position with no hit emits nothing. This never
 * turns an ICU boundary guess into an answer and never lets a later long word
 * displace an earlier word merely because it is longer.
 */
export function leftToRightLongestMatches(matches: YomitanTermMatch[], limit: number, rank?: DictionaryRank): YomitanTermMatch[] {
    const candidates = [...matches].sort((a, b) =>
        a.start - b.start
        || compareTermMatchLengthDescending(a, b)
        || compareTermMatchDeinflectionDepth(a, b)
        || compareTermMatchDictionaryPriority(a, b, rank)
        || compareTermMatchDictionaryName(a, b)
        || compareTermMatchEntryScoreDescending(a, b),
    );
    const selected: YomitanTermMatch[] = [];
    let coveredUntil = 0;
    for (const match of candidates) {
        if (match.start < coveredUntil) continue;
        selected.push(match);
        coveredUntil = match.end;
        if (selected.length >= limit) break;
    }
    return selected;
}

function compareTermMatchesForSelection(a: YomitanTermMatch, b: YomitanTermMatch, rank?: DictionaryRank): number {
    for (const compare of TERM_MATCH_SELECTION_COMPARATORS) {
        const result = compare(a, b, rank);
        if (result) return result;
    }
    return 0;
}

function compareTermMatchDictionaryPriority(a: YomitanTermMatch, b: YomitanTermMatch, rank?: DictionaryRank): number {
    if (!rank) return 0;
    return dictionaryPriority(a.entry.dictionary, rank) - dictionaryPriority(b.entry.dictionary, rank);
}

function compareTermMatchLengthDescending(a: YomitanTermMatch, b: YomitanTermMatch): number {
    return (b.end - b.start) - (a.end - a.start);
}

function compareTermMatchDeinflectionDepth(a: YomitanTermMatch, b: YomitanTermMatch): number {
    return (a.deinflected?.depth ?? 0) - (b.deinflected?.depth ?? 0);
}

function compareTermMatchStart(a: YomitanTermMatch, b: YomitanTermMatch): number {
    return a.start - b.start;
}

function compareTermMatchDictionaryName(a: YomitanTermMatch, b: YomitanTermMatch): number {
    return a.entry.dictionary.localeCompare(b.entry.dictionary);
}

function compareTermMatchEntryScoreDescending(a: YomitanTermMatch, b: YomitanTermMatch): number {
    return (b.entry.score ?? 0) - (a.entry.score ?? 0);
}

function isJpdbFrequencyDictionary(dictionary: string): boolean {
    return /jpdb/i.test(dictionary);
}

function frequencyRank(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return rankFromFrequencyString(value);
    const nested = nestedFrequencyValue(value);
    return nested === undefined ? Number.POSITIVE_INFINITY : frequencyRank(nested);
}

function rankFromFrequencyString(value: string): number {
    return Number(value.replace(/[^\d.]/g, '')) || Number.POSITIVE_INFINITY;
}

function nestedFrequencyValue(value: unknown): unknown | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    return record.frequency ?? record.value ?? record.displayValue;
}
