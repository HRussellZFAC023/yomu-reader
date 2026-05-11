import { escapeHtml } from './dom';
import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

const log = Logger.scope('StudyTools');

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
    const hints = GRAMMAR_PATTERNS
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
    log.debug('Grammar hints detected', { sentenceLength: sentence.length, hints: hints.map(hint => hint.name) });
    return hints;
}

export async function translateJapaneseSentence(sentence: string): Promise<string> {
    const trimmed = sentence.trim();
    if (!trimmed) return '';
    const cached = translationCache.get(trimmed);
    if (cached) {
        log.debug('Translation cache hit', { sentenceLength: trimmed.length });
        return cached;
    }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&dt=bd&dj=1&q=${encodeURIComponent(trimmed)}`;
    const done = log.time('Translate sentence', { sentenceLength: trimmed.length });
    try {
        const json = await requestJson<GoogleTranslateResponse>(url);
        const translated = (json.sentences ?? []).map(item => item.trans ?? '').join('').trim();
        if (!translated) throw new Error('No translation returned.');
        translationCache.set(trimmed, translated);
        log.info('Translation completed', { sentenceLength: trimmed.length, translationLength: translated.length });
        return translated;
    } catch (error) {
        log.warn('Translation failed', { sentenceLength: trimmed.length, error });
        throw error;
    } finally {
        done();
    }
}

export function renderGrammarHints(hints: GrammarHint[], sentence: string): string {
    if (!hints.length) return '';
    return `
        <div class="jpdb-reader-study-title">Sentence</div>
        <div class="jpdb-reader-study-original jpdb-reader-parseable">${escapeHtml(sentence)}</div>
        <div class="jpdb-reader-study-title">Breakdown</div>
        <div class="jpdb-reader-study-note">Pattern hints are best guesses from the full sentence shape.</div>
        ${hints.map(hint => `
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
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Translation request using userscript request');
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'json',
                timeout: 8000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        log.debug('Translation request completed', { status: response.status });
                        resolve((response.response ?? JSON.parse(String(response.responseText ?? '{}'))) as T);
                    } else {
                        log.warn('Translation request returned HTTP error', { status: response.status });
                        reject(new Error(`Translation request failed (${response.status}).`));
                    }
                },
                onerror: error => {
                    log.warn('Translation request failed', { error });
                    reject(error);
                },
                ontimeout: () => {
                    log.warn('Translation request timed out');
                    reject(new Error('Translation timed out.'));
                },
            });
        });
    }
    log.debug('Translation request using fetch');
    return fetch(url).then(async response => {
        if (!response.ok) {
            log.warn('Translation request returned HTTP error', { status: response.status });
            throw new Error(`Translation request failed (${response.status}).`);
        }
        log.debug('Translation request completed', { status: response.status });
        return response.json() as Promise<T>;
    });
}
