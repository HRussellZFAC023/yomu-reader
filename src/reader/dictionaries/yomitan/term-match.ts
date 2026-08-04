import { targetLookupCandidateRulesMatch } from '../../languages/morphology';
import { genericLookupTextVariants } from '../../languages/lookup-normalization';
import { dictionaryEnabled, dictionaryPriority } from './ranking';
import type { DictionaryPreference } from '../../app/types';
import type { LanguageLookupCandidate, LearningTargetModule } from '../../languages/types';
import type {
    YomitanExactTermCandidateMatch,
    YomitanExactTermCandidateRequest,
    YomitanTermEntry,
    YomitanTermMatch,
} from './types';

const WHITESPACE_RE = /\s/u;
const TERM_MATCH_INDEX_FAST_ROWS = 8;
const TERM_MATCH_INDEX_OVERFLOW_PROBE_ROWS = TERM_MATCH_INDEX_FAST_ROWS + 1;

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

type LookupCandidateRuleMatcher = (
    entryRules: string | undefined,
    candidateRules: readonly string[],
) => boolean;

export interface TermMatchEntryCollector {
    add(entry: YomitanTermEntry): void;
    matches(): YomitanTermMatch[];
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

/**
 * Adapts already-enumerated candidate requests to the term-match engine.
 * `start` is an internal request slot here, never a source-text offset; the
 * public exact API converts every match back to its original request object.
 */
export function exactTermMatchCandidates(
    target: LearningTargetModule,
    requests: readonly YomitanExactTermCandidateRequest[],
): TermMatchCandidates {
    const candidates: TermMatchCandidates = new Map();
    requests.forEach((request, requestIndex) => {
        if (!target.isLookupableText(request.lookupCandidate.term)) return;
        const position: TermMatchCandidatePosition = {
            start: requestIndex,
            end: requestIndex + 1,
            surface: request.surface,
            deinflected: request.lookupCandidate,
        };
        for (const key of genericLookupTextVariants(request.lookupCandidate.term)) {
            const positions = candidates.get(key) ?? [];
            positions.push(position);
            candidates.set(key, positions);
        }
    });
    return candidates;
}

/** Select one preference/rule-aware entry per exact request, in request order. */
export function exactTermCandidateMatches<
    TRequest extends YomitanExactTermCandidateRequest,
>(
    requests: readonly TRequest[],
    matches: readonly YomitanTermMatch[],
    rank: Map<string, DictionaryPreference>,
): Array<YomitanExactTermCandidateMatch<TRequest>> {
    const entryByRequestIndex = new Map<number, YomitanTermEntry>();
    for (const match of matches) {
        const requestIndex = exactRequestIndex(match, requests);
        if (requestIndex === undefined) continue;
        retainExactTermCandidateEntry(requestIndex, match.entry, entryByRequestIndex, rank);
    }
    return requests.flatMap((request, requestIndex) => {
        const entry = entryByRequestIndex.get(requestIndex);
        return entry ? [{ request, requestIndex, entry }] : [];
    });
}

function retainExactTermCandidateEntry(
    requestIndex: number,
    entry: YomitanTermEntry,
    entryByRequestIndex: Map<number, YomitanTermEntry>,
    rank: Map<string, DictionaryPreference>,
): void {
    const current = entryByRequestIndex.get(requestIndex);
    if (current && compareTermMatchEntries(entry, current, rank) >= 0) return;
    entryByRequestIndex.set(requestIndex, entry);
}

function exactRequestIndex(
    match: YomitanTermMatch,
    requests: readonly YomitanExactTermCandidateRequest[],
): number | undefined {
    const requestIndex = match.start;
    const request = requests[requestIndex];
    if (!request || match.end !== requestIndex + 1 || match.surface !== request.surface) return undefined;
    return requestIndex;
}

export function requestTermMatchIndex(
    index: IDBIndex,
    expression: string,
    visit: (expression: string, entry: YomitanTermEntry) => void,
    finish: () => void,
    reject: (reason?: unknown) => void,
): void {
    const query = IDBKeyRange.only(expression);
    const request = index.getAll(query, TERM_MATCH_INDEX_OVERFLOW_PROBE_ROWS);
    request.onsuccess = () => {
        const entries = request.result as YomitanTermEntry[];
        if (entries.length < TERM_MATCH_INDEX_OVERFLOW_PROBE_ROWS) {
            for (const entry of entries) visit(expression, entry);
            finish();
            return;
        }

        // Most lookup keys have only a handful of rows, so keep their single
        // getAll request. A common kana key can have dozens or hundreds: the
        // ninth row is proof that the old eight-row result was truncated. Scan
        // that exact key and let the candidate-aware collector retain only the
        // best compatible rows instead of materialising the whole fan-out.
        const cursorRequest = index.openCursor(query);
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
                finish();
                return;
            }
            visit(expression, cursor.value as YomitanTermEntry);
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    };
    request.onerror = () => reject(request.error);
}

export function createTermMatchEntryCollector(
    expression: string,
    candidates: TermMatchCandidates,
    rank: Map<string, DictionaryPreference>,
    matchesRules: LookupCandidateRuleMatcher = targetLookupCandidateRulesMatch,
): TermMatchEntryCollector {
    const positions = candidates.get(expression) ?? [];
    const candidateRules = distinctCandidateRules(positions);
    const bestEntryByRules = new Map<string, YomitanTermEntry>();

    return {
        add(entry) {
            if (!dictionaryEnabled(entry.dictionary, rank)) return;
            collectCompatibleTermEntry(entry, candidateRules, bestEntryByRules, rank, matchesRules);
        },
        matches() {
            return positions.flatMap(position => {
                const entry = bestEntryByRules.get(candidateRulesKey(position.deinflected.rules));
                return entry ? [termMatchForEntry(position, entry)] : [];
            });
        },
    };
}

function collectCompatibleTermEntry(
    entry: YomitanTermEntry,
    candidateRules: ReadonlyMap<string, readonly string[]>,
    bestEntryByRules: Map<string, YomitanTermEntry>,
    rank: Map<string, DictionaryPreference>,
    matchesRules: LookupCandidateRuleMatcher,
): void {
    for (const [rulesKey, rules] of candidateRules) {
        if (!matchesRules(entry.rules, rules)) continue;
        retainBetterTermEntry(rulesKey, entry, bestEntryByRules, rank);
    }
}

function retainBetterTermEntry(
    rulesKey: string,
    entry: YomitanTermEntry,
    bestEntryByRules: Map<string, YomitanTermEntry>,
    rank: Map<string, DictionaryPreference>,
): void {
    const current = bestEntryByRules.get(rulesKey);
    if (current && compareTermMatchEntries(entry, current, rank) >= 0) return;
    bestEntryByRules.set(rulesKey, entry);
}

export function termMatchesForEntries(
    expression: string,
    foundEntries: YomitanTermEntry[],
    candidates: TermMatchCandidates,
    rank: Map<string, DictionaryPreference>,
): YomitanTermMatch[] {
    const collector = createTermMatchEntryCollector(expression, candidates, rank);
    for (const entry of foundEntries) collector.add(entry);
    return collector.matches();
}

function distinctCandidateRules(
    positions: readonly TermMatchCandidatePosition[],
): Map<string, readonly string[]> {
    const result = new Map<string, readonly string[]>();
    for (const position of positions) {
        const rules = position.deinflected.rules;
        const key = candidateRulesKey(rules);
        if (!result.has(key)) result.set(key, rules);
    }
    return result;
}

function candidateRulesKey(rules: readonly string[]): string {
    return rules.join('\u0000');
}

function compareTermMatchEntries(
    a: YomitanTermEntry,
    b: YomitanTermEntry,
    rank: Map<string, DictionaryPreference>,
): number {
    return dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)
        || (b.score ?? 0) - (a.score ?? 0);
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

function termMatchForEntry(position: TermMatchCandidatePosition, entry: YomitanTermEntry): YomitanTermMatch {
    return {
        entry,
        ...position,
        deinflected: position.deinflected.depth > 0 ? position.deinflected : undefined,
    };
}

/**
 * One readonly transaction answering every expression in the candidate set,
 * fanned across the expression index (and the reading index for targets that
 * query it), each key collected by its candidate-aware entry collector.
 */
export function collectTermMatchCandidates(
    db: IDBDatabase,
    target: LearningTargetModule,
    candidates: TermMatchCandidates,
    rank: Map<string, DictionaryPreference>,
): Promise<YomitanTermMatch[]> {
    return new Promise<YomitanTermMatch[]>((resolve, reject) => {
        const tx = db.transaction('terms', 'readonly');
        const store = tx.objectStore('terms');
        const expressionIndex = store.index('expression');
        const readingIndex = store.index('reading');
        const expressions = sortedTermMatchExpressions(candidates);
        const collectors = new Map(expressions.map(expression => [
            expression,
            createTermMatchEntryCollector(
                expression,
                candidates,
                rank,
                (entryRules, candidateRules) => target.matchesLookupCandidateRules(entryRules, candidateRules),
            ),
        ]));
        const queriesReadingIndex = targetTermMatchQueriesReadingIndex(target);
        let pending = expressions.length * (queriesReadingIndex ? 2 : 1);
        const finish = () => {
            if (--pending <= 0) {
                resolve(expressions.flatMap(expression => collectors.get(expression)?.matches() ?? []));
            }
        };
        const visit = (expression: string, entry: YomitanTermEntry) => {
            collectors.get(expression)?.add(entry);
        };
        for (const expression of expressions) {
            requestTermMatchIndex(expressionIndex, expression, visit, finish, reject);
            if (queriesReadingIndex) {
                requestTermMatchIndex(readingIndex, expression, visit, finish, reject);
            }
        }
        tx.onerror = () => reject(tx.error);
        // A conforming abort fires an error at every unfinished request, so
        // this is usually redundant. It is the only signal left in the iPad
        // WebKit failure mode this codebase already fights, where a request
        // settles neither way: without it the callers waiting on this parse
        // wait for a completion that is never coming.
        tx.onabort = () => reject(tx.error ?? new Error('Could not read dictionary term matches.'));
    });
}
