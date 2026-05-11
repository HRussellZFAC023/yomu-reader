import { escapeHtml } from './dom';

export interface GrammarHint {
    name: string;
    short: string;
    url: string;
    match: string;
    confidence: 'high' | 'medium';
}

const GRAMMAR_PATTERNS: Array<{ pattern: RegExp; name: string; short: string; url: string; confidence: GrammarHint['confidence'] }> = [
    { pattern: /[ぁ-んァ-ン一-龯]+[てで](?:い(?:る|ます|た|ない)?|る|た)/u, name: 'ている', short: 'ongoing action or resulting state', url: 'https://www.tofugu.com/japanese-grammar/verb-continuous-form-teiru/', confidence: 'high' },
    { pattern: /[ぁ-んァ-ン一-龯]+(?:たい|たくない|たかった)/u, name: 'たい', short: 'want to do something', url: 'https://www.tofugu.com/japanese-grammar/tai-form/', confidence: 'high' },
    { pattern: /[ぁ-んァ-ン一-龯]+(?:ない|ません|なかった|ませんでした)/u, name: 'ない', short: 'negative form', url: 'https://www.tofugu.com/japanese-grammar/verb-negative-nai-form/', confidence: 'medium' },
    { pattern: /[ぁ-んァ-ン一-龯]+たら/u, name: 'たら', short: 'conditional or time sequence', url: 'https://www.tofugu.com/japanese-grammar/conditional-form-tara/', confidence: 'high' },
    { pattern: /[ぁ-んァ-ン一-龯]+(?:えば|ければ)/u, name: 'ば', short: 'conditional if', url: 'https://www.tofugu.com/japanese-grammar/verb-conditional-form-ba/', confidence: 'high' },
    { pattern: /(?:なので|ので)/u, name: 'ので', short: 'reason or cause', url: 'https://www.tofugu.com/japanese-grammar/conjunctive-particle-node/', confidence: 'high' },
    { pattern: /[ぁ-んァ-ン一-龯]+から/u, name: 'から', short: 'reason, source, or starting point', url: 'https://www.tofugu.com/japanese-grammar/particle-kara/', confidence: 'medium' },
    { pattern: /[ぁ-んァ-ン一-龯]+てもいい/u, name: 'てもいい', short: 'permission or approval', url: 'https://www.tofugu.com/japanese-grammar/temoii/', confidence: 'high' },
    { pattern: /[ぁ-んァ-ン一-龯]+そう/u, name: 'そう', short: 'looks like something will happen', url: 'https://www.tofugu.com/japanese-grammar/verb-sou/', confidence: 'medium' },
    { pattern: /[ぁ-んァ-ン一-龯]+よう/u, name: 'よう', short: 'volition, proposal, or invitation', url: 'https://www.tofugu.com/japanese-grammar/verb-volitional-form-you/', confidence: 'medium' },
    { pattern: /のに/u, name: 'のに', short: 'although, despite, or frustrated expectation', url: 'https://www.tofugu.com/japanese-grammar/conjunctive-particle-noni/', confidence: 'high' },
    { pattern: /こと(?:が|を|に|は|も)/u, name: 'こと', short: 'abstract thing or nominalizer', url: 'https://www.tofugu.com/japanese-grammar/koto/', confidence: 'medium' },
];

const translationCache = new Map<string, string>();

export function detectGrammarHints(sentence: string): GrammarHint[] {
    const normalized = sentence.replace(/\s+/g, '');
    const seen = new Set<string>();
    return GRAMMAR_PATTERNS
        .map(item => ({ item, match: item.pattern.exec(normalized)?.[0] ?? '' }))
        .filter(result => result.match)
        .map(({ item, match }) => ({
            name: item.name,
            short: item.short,
            url: item.url,
            match,
            confidence: item.confidence,
        }))
        .filter(item => {
            if (seen.has(item.name)) return false;
            seen.add(item.name);
            return true;
        })
        .slice(0, 6);
}

export async function translateJapaneseSentence(sentence: string): Promise<string> {
    const trimmed = sentence.trim();
    if (!trimmed) return '';
    const cached = translationCache.get(trimmed);
    if (cached) return cached;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&dt=bd&dj=1&q=${encodeURIComponent(trimmed)}`;
    const json = await requestJson<GoogleTranslateResponse>(url);
    const translated = (json.sentences ?? []).map(item => item.trans ?? '').join('').trim();
    if (!translated) throw new Error('No translation returned.');
    translationCache.set(trimmed, translated);
    return translated;
}

export function renderGrammarHints(hints: GrammarHint[], sentence = ''): string {
    if (!hints.length) {
        const searchUrl = `https://www.tofugu.com/japanese-grammar/?search=${encodeURIComponent(sentence.slice(0, 40))}`;
        return `<div class="jpdb-reader-study-empty">No obvious grammar pattern found.</div><a href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener">Open Tofugu grammar index</a>`;
    }
    return `<div class="jpdb-reader-study-note">Pattern hints are best guesses from the sentence shape.</div>${hints.map(hint => `
        <div class="jpdb-reader-study-item">
            <div>
                <div class="jpdb-reader-study-name">${escapeHtml(hint.name)}</div>
                <div class="jpdb-reader-study-match">${escapeHtml(hint.match)}</div>
            </div>
            <div class="jpdb-reader-study-short">${escapeHtml(hint.short)} · ${hint.confidence}</div>
            <a href="${escapeHtml(hint.url)}" target="_blank" rel="noopener">Guide</a>
        </div>
    `).join('')}`;
}

interface GoogleTranslateResponse {
    sentences?: Array<{ trans?: string }>;
}

function requestJson<T>(url: string): Promise<T> {
    const userscriptRequest = typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : typeof GM !== 'undefined' ? GM.xmlHttpRequest ?? GM.xmlhttpRequest : undefined;
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'json',
                timeout: 8000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve((response.response ?? JSON.parse(String(response.responseText ?? '{}'))) as T);
                    } else {
                        reject(new Error(`Translation request failed (${response.status}).`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Translation timed out.')),
            });
        });
    }
    return fetch(url).then(async response => {
        if (!response.ok) throw new Error(`Translation request failed (${response.status}).`);
        return response.json() as Promise<T>;
    });
}
