import { isTargetLanguageText } from '../lookup/target-text';
import { HIRAGANA_WITH_PROLONGED, KANA, KANJI_LIKE_RE, KANJI_LIKE_WITH_COUNTERS, KATAKANA_WITH_PROLONGED, PROLONGED_SOUND_MARK } from '../lookup/japanese-script';

const QUERY_RUN_RE = new RegExp(`[${KANA}${KANJI_LIKE_WITH_COUNTERS}${PROLONGED_SOUND_MARK}]+`, 'gu');
const SCRIPT_GROUP_RE = new RegExp(`[${KANJI_LIKE_WITH_COUNTERS}]+|[${HIRAGANA_WITH_PROLONGED}]+|[${KATAKANA_WITH_PROLONGED}]+`, 'gu');
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
    return KANJI_LIKE_RE.test(value);
}

export function shouldRequireOriginalSurfaceMatch(value: string): boolean {
    return queryHasKanji(value) && queryLength(value) >= 3;
}

export function shouldFilterImmersionExamplesBySurface(query: string): boolean {
    return queryHasKanji(query) || shouldRequireOriginalSurfaceMatch(query);
}

export function immersionSentenceContainsQuery(sentence: string, query: string): boolean {
    const s = normalizeSurface(sentence);
    const q = normalizeSurface(query);
    return Boolean(q) && s.includes(q);
}

export function isUsefulImmersionFallbackQuery(query: string, exactQuery: string): boolean {
    if (isSameImmersionQuery(query, exactQuery)) return false;
    return isUsefulStandaloneQuery(query);
}

export function isUsefulImmersionPreloadQuery(query: string): boolean {
    return isUsefulStandaloneQuery(query);
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
    const runs = normalizeImmersionSearchQuery(value).match(QUERY_RUN_RE) ?? [];
    for (const run of runs) {
        fragments.push(...scriptFragments(run));
    }
    return uniqueImmersionQueries(fragments)
        .sort(compareFallbackFragments);
}

function normalizeSurface(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function isSameImmersionQuery(query: string, exactQuery: string): boolean {
    return queryKey(query) === queryKey(exactQuery);
}

function isUsefulStandaloneQuery(query: string): boolean {
    if (!query || !isTargetLanguageText(query)) return false;
    if (COMMON_PARTICLES.has(queryKey(query))) return false;
    return queryLength(query) >= 2;
}

function scriptFragments(run: string): string[] {
    const groups = run.match(SCRIPT_GROUP_RE) ?? [];
    if (groups.length <= 1) return groups;
    const result = [...groups];
    for (let i = 0; i < groups.length; i++) {
        let q = groups[i] as string;
        for (let j = i + 1; j < groups.length; j++) {
            q += groups[j];
            result.push(q);
        }
    }
    result.push(groups.filter(queryHasKanji).join(''));
    return result;
}

function compareFallbackFragments(a: string, b: string): number {
    const order = Number(queryHasKanji(b)) - Number(queryHasKanji(a));
    if (order) return order;
    return queryLength(b) - queryLength(a);
}
