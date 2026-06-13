import { HAS_JAPANESE } from '../dom/index';

const JAPANESE_QUERY_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]+/gu;
const JAPANESE_SCRIPT_GROUP_RE = /[\u3400-\u9fff々〆ヵヶ]+|[\u3040-\u309fー]+|[\u30a0-\u30ffー]+/gu;
const COMMON_PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'や', 'か', 'ね', 'よ', 'ぞ', 'ぜ', 'な', 'わ', 'から', 'まで', 'だけ', 'しか', 'より']);

export const IMMERSION_FALLBACK_QUERY_LIMIT = 5;

export function normalizeImmersionSearchQuery(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function queryKey(value: string): string {
    return normalizeImmersionSearchQuery(value).replace(/\s+/g, '').toLowerCase();
}

export function queryLength(value: string): number {
    return Array.from(queryKey(value)).length;
}

export function queryHasKanji(value: string): boolean {
    return /[\u3400-\u9fff々〆]/u.test(value);
}

export function shouldRequireOriginalSurfaceMatch(value: string): boolean {
    return queryHasKanji(value) && queryLength(value) >= 3;
}

export function shouldFilterImmersionExamplesBySurface(query: string): boolean {
    return queryHasKanji(query) || shouldRequireOriginalSurfaceMatch(query);
}

export function immersionSentenceContainsQuery(sentence: string, query: string): boolean {
    const normalizedSentence = normalizeImmersionSurface(sentence);
    const normalizedQuery = normalizeImmersionSurface(query);
    return Boolean(normalizedQuery) && normalizedSentence.includes(normalizedQuery);
}

export function isUsefulImmersionFallbackQuery(query: string, exactQuery: string): boolean {
    if (isSameImmersionQuery(query, exactQuery)) return false;
    return isUsefulStandaloneImmersionQuery(query);
}

export function isUsefulImmersionPreloadQuery(query: string): boolean {
    return isUsefulStandaloneImmersionQuery(query);
}

export function uniqueImmersionQueries(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const query = normalizeImmersionSearchQuery(value);
        const key = queryKey(query);
        if (!query || seen.has(key)) continue;
        seen.add(key);
        result.push(query);
    }
    return result;
}

export function immersionFallbackFragments(value: string): string[] {
    const fragments: string[] = [];
    const runs = normalizeImmersionSearchQuery(value).match(JAPANESE_QUERY_RUN_RE) ?? [];
    for (const run of runs) {
        fragments.push(...scriptGroupFallbackFragments(run));
    }
    return uniqueImmersionQueries(fragments)
        .sort(compareImmersionFallbackFragments);
}

function normalizeImmersionSurface(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function isSameImmersionQuery(query: string, exactQuery: string): boolean {
    return queryKey(query) === queryKey(exactQuery);
}

function isUsefulStandaloneImmersionQuery(query: string): boolean {
    if (!query || !HAS_JAPANESE.test(query)) return false;
    if (COMMON_PARTICLES.has(queryKey(query))) return false;
    return queryLength(query) >= 2;
}

function scriptGroupFallbackFragments(run: string): string[] {
    const scriptGroups = run.match(JAPANESE_SCRIPT_GROUP_RE) ?? [];
    if (scriptGroups.length <= 1) return scriptGroups;
    return [...scriptGroups, ...scriptGroups.filter(queryHasKanji)];
}

function compareImmersionFallbackFragments(a: string, b: string): number {
    const kanjiOrder = Number(queryHasKanji(b)) - Number(queryHasKanji(a));
    if (kanjiOrder) return kanjiOrder;
    return queryLength(b) - queryLength(a);
}
