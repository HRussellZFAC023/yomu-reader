import { Logger } from './logger';
import { gmStorageGet, gmStorageSet } from './storage';
import { getUserscriptHttpRequest } from './userscript';
import type { GrammarHint, GrammarLevel } from './study-tools';

const log = Logger.scope('HanabiraGrammar');
const HANABIRA_RAW_BASE = 'https://raw.githubusercontent.com/tristcoil/hanabira.org/main/backend/express/json_data';
const HANABIRA_GRAMMAR_FILES = ['N5', 'N4', 'N3', 'N2', 'N1']
    .map(level => `grammar_ja_JLPT_${level}_0001.json`);
const HANABIRA_CACHE_KEY = 'yomu.hanabiraGrammarIndex.v1';
const HANABIRA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const ROMAN_PLACEHOLDER_RE = /\b(?:A|B|Noun\d*|Nouns?|Verb|Verbs?|Adjective|Adjectives?|い-Adjective|な-Adjective|i-Adjective|na-Adjective|casual|plain|dictionary|form|stem|te|ta|ru|negative|volitional)\b/gi;

interface HanabiraGrammarPoint {
    title?: string;
    short_explanation?: string;
    long_explanation?: string;
    formation?: string;
    p_tag?: string;
    s_tag?: string;
}

export interface HanabiraGrammarIndexItem {
    title: string;
    short: string;
    detail: string;
    formation: string;
    level: GrammarLevel;
    candidates: string[];
}

interface HanabiraGrammarCache {
    fetchedAt: number;
    items: HanabiraGrammarIndexItem[];
}

let grammarIndexPromise: Promise<HanabiraGrammarIndexItem[]> | undefined;

export async function detectHanabiraGrammarHints(sentence: string): Promise<GrammarHint[]> {
    const index = await loadHanabiraGrammarIndex();
    return detectHanabiraGrammarHintsFromIndex(sentence, index);
}

export async function loadHanabiraGrammarIndex(): Promise<HanabiraGrammarIndexItem[]> {
    if (grammarIndexPromise) return grammarIndexPromise;
    grammarIndexPromise = loadHanabiraGrammarIndexUncached().catch(error => {
        grammarIndexPromise = undefined;
        throw error;
    });
    return grammarIndexPromise;
}

export function detectHanabiraGrammarHintsFromIndex(sentence: string, index: HanabiraGrammarIndexItem[]): GrammarHint[] {
    const normalized = normalizeGrammarText(sentence);
    if (!normalized) return [];
    const ranked: Array<GrammarHint & { candidateLength: number }> = [];
    for (const item of index) {
        const hint = grammarHintFromIndexItem(normalized, item);
        if (hint) ranked.push(hint);
    }
    return ranked
        .sort(compareGrammarHints)
        .slice(0, 10)
        .map(({ candidateLength: _candidateLength, ...hint }) => hint);
}

function grammarHintFromIndexItem(normalizedSentence: string, item: HanabiraGrammarIndexItem): GrammarHint & { candidateLength: number } | null {
    const match = bestCandidateMatch(normalizedSentence, item.candidates);
    if (!match) return null;
    return grammarHintFromMatch(item, match);
}

function grammarHintFromMatch(item: HanabiraGrammarIndexItem, match: NonNullable<ReturnType<typeof bestCandidateMatch>>): GrammarHint & { candidateLength: number } {
    const fallbackText = hanabiraFallbackText(item);
    return {
        ruleId: hanabiraRuleId(item.title),
        name: item.title,
        level: item.level,
        kind: 'Hanabira grammar',
        short: item.short || fallbackText,
        detail: item.detail || item.short || fallbackText,
        url: `https://hanabira.org/japanese/grammarpoint/${encodeURIComponent(item.title)}`,
        match: match.candidate,
        confidence: match.candidate.length >= 4 ? 'high' : 'medium',
        index: match.index,
        candidateLength: match.candidate.length,
    };
}

function hanabiraFallbackText(item: HanabiraGrammarIndexItem): string {
    return item.formation || item.title;
}

function compareGrammarHints(
    a: GrammarHint & { candidateLength: number },
    b: GrammarHint & { candidateLength: number },
): number {
    return a.index - b.index
        || b.candidateLength - a.candidateLength
        || grammarLevelRank(a.level) - grammarLevelRank(b.level);
}

export function buildHanabiraGrammarIndex(points: HanabiraGrammarPoint[]): HanabiraGrammarIndexItem[] {
    return points
        .map(point => {
            const title = cleanText(point.title ?? '');
            const formation = cleanText(point.formation ?? '');
            const candidates = grammarCandidatesForPoint(title, formation);
            if (!title || !candidates.length) return null;
            return {
                title,
                short: cleanText(point.short_explanation ?? ''),
                detail: cleanText(point.long_explanation ?? ''),
                formation,
                level: grammarLevelFromTag(point.p_tag),
                candidates,
            } satisfies HanabiraGrammarIndexItem;
        })
        .filter((item): item is HanabiraGrammarIndexItem => Boolean(item));
}

function grammarCandidatesForPoint(title: string, formation: string): string[] {
    const candidates = new Set<string>();
    for (const source of [title, formation]) {
        const withoutRomaji = source.replace(/\([^ぁ-んァ-ン一-龯々〆ヵヶ]*\)/gu, ' ');
        for (const piece of withoutRomaji.split(/[,\n;|]/u)) {
            const normalized = normalizeGrammarCandidate(piece);
            addCandidateVariants(candidates, normalized);
        }
    }
    return Array.from(candidates)
        .filter(candidate => candidate.length >= 3 && JAPANESE_TEXT_RE.test(candidate))
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .slice(0, 8);
}

function addCandidateVariants(candidates: Set<string>, candidate: string): void {
    if (!candidate) return;
    candidates.add(candidate);
    if (candidate.startsWith('る') && candidate.length > 3) candidates.add(candidate.slice(1));
}

function normalizeGrammarCandidate(value: string): string {
    return normalizeGrammarText(value
        .replace(ROMAN_PLACEHOLDER_RE, ' ')
        .replace(/[A-Za-z0-9_+\-=~～「」『』"'()[\]{}<>]/gu, ' ')
        .replace(/[、。！？!?]/gu, ' '));
}

function normalizeGrammarText(value: string): string {
    return value
        .normalize('NFKC')
        .replace(/\s+/gu, '')
        .replace(/[+・]/gu, '')
        .trim();
}

function bestCandidateMatch(sentence: string, candidates: string[]): { candidate: string; index: number } | null {
    let best: { candidate: string; index: number } | null = null;
    for (const candidate of candidates) {
        best = betterCandidateMatch(best, candidateMatch(sentence, candidate));
    }
    return best;
}

function candidateMatch(sentence: string, candidate: string): { candidate: string; index: number } | null {
    const index = sentence.indexOf(candidate);
    return index < 0 ? null : { candidate, index };
}

function betterCandidateMatch(
    best: { candidate: string; index: number } | null,
    next: { candidate: string; index: number } | null,
): { candidate: string; index: number } | null {
    if (!next) return best;
    if (!best) return next;
    return isBetterCandidateMatch(next, best) ? next : best;
}

function isBetterCandidateMatch(next: { candidate: string; index: number }, best: { candidate: string; index: number }): boolean {
    return next.index < best.index
        || (next.index === best.index && next.candidate.length > best.candidate.length);
}

async function loadHanabiraGrammarIndexUncached(): Promise<HanabiraGrammarIndexItem[]> {
    const cached = await gmStorageGet<HanabiraGrammarCache | null>(HANABIRA_CACHE_KEY, null);
    if (cached && Date.now() - cached.fetchedAt < HANABIRA_CACHE_TTL_MS && Array.isArray(cached.items)) {
        log.debug('Hanabira grammar index cache hit', { items: cached.items.length });
        return cached.items;
    }

    const done = log.time('Load Hanabira grammar index');
    try {
        const files = await Promise.all(HANABIRA_GRAMMAR_FILES.map(async file => requestJson<HanabiraGrammarPoint[]>(`${HANABIRA_RAW_BASE}/${file}`)));
        const items = buildHanabiraGrammarIndex(files.flat());
        await gmStorageSet(HANABIRA_CACHE_KEY, { fetchedAt: Date.now(), items } satisfies HanabiraGrammarCache);
        log.info('Hanabira grammar index loaded', { items: items.length });
        return items;
    } finally {
        done();
    }
}

function grammarLevelFromTag(tag?: string): GrammarLevel {
    const match = tag?.match(/N([1-5])/i);
    return match ? `N${match[1]}` as GrammarLevel : 'Core';
}

function grammarLevelRank(level: GrammarLevel): number {
    return { Core: 0, N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 }[level] ?? 9;
}

function hanabiraRuleId(title: string): string {
    const slug = title.normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    return slug ? `hanabira-${slug}` : 'hanabira-grammar';
}

function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function requestJson<T>(url: string): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'json',
                timeout: 10000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve((response.response ?? JSON.parse(String(response.responseText ?? 'null'))) as T);
                    } else {
                        reject(new Error(`Hanabira grammar request failed (${response.status}).`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Hanabira grammar request timed out.')),
            });
        });
    }
    return fetch(url).then(async response => {
        if (!response.ok) throw new Error(`Hanabira grammar request failed (${response.status}).`);
        return response.json() as Promise<T>;
    });
}
