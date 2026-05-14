import { HAS_JAPANESE } from './dom';

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

export function immersionSentenceContainsQuery(sentence: string, query: string): boolean {
    const normalizedSentence = normalizeImmersionSurface(sentence);
    const normalizedQuery = normalizeImmersionSurface(query);
    return Boolean(normalizedQuery) && normalizedSentence.includes(normalizedQuery);
}

export function isUsefulImmersionFallbackQuery(query: string, exactQuery: string): boolean {
    if (!query || queryKey(query) === queryKey(exactQuery) || !HAS_JAPANESE.test(query)) return false;
    if (COMMON_PARTICLES.has(queryKey(query))) return false;
    return queryLength(query) >= 2;
}

export function isUsefulImmersionPreloadQuery(query: string): boolean {
    if (!query || !HAS_JAPANESE.test(query)) return false;
    if (COMMON_PARTICLES.has(queryKey(query))) return false;
    return queryLength(query) >= 2;
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
        const scriptGroups = run.match(JAPANESE_SCRIPT_GROUP_RE) ?? [];
        fragments.push(...scriptGroups);
        if (scriptGroups.length > 1) {
            fragments.push(...scriptGroups.filter(queryHasKanji));
        }
    }
    return uniqueImmersionQueries(fragments)
        .sort((a, b) => Number(queryHasKanji(b)) - Number(queryHasKanji(a)) || queryLength(b) - queryLength(a));
}

function normalizeImmersionSurface(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}
