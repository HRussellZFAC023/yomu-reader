import { escapeHtml } from './dom';
import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

const log = Logger.scope('StudyTools');

export interface GrammarHint {
    name: string;
    kind: string;
    short: string;
    detail: string;
    url: string;
    match: string;
    confidence: 'high' | 'medium';
    index: number;
}

interface GrammarPattern {
    pattern: RegExp;
    name: string;
    kind: string;
    short: string;
    detail: string;
    url: string;
    confidence: GrammarHint['confidence'];
}

const PARTICLE_CHUNK = String.raw`[^はがをにへとでもやの、。！？\s]{1,16}`;
const FORM_CHUNK = String.raw`[ぁ-んァ-ン一-龯]{1,16}`;

const GRAMMAR_PATTERNS: GrammarPattern[] = [
    { pattern: new RegExp(`${PARTICLE_CHUNK}は`, 'u'), name: 'は', kind: 'Topic particle', short: 'sets the topic or contrast', detail: 'Read it as "as for..." and look to the rest of the sentence for the new information.', url: 'https://www.tofugu.com/japanese-grammar/particle-wa/', confidence: 'high' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}が`, 'u'), name: 'が', kind: 'Subject particle', short: 'marks the doer or focus', detail: 'Highlights the subject of the clause, often when that subject is new or important.', url: 'https://www.tofugu.com/japanese-grammar/particle-ga/', confidence: 'high' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}を`, 'u'), name: 'を', kind: 'Object particle', short: 'marks what receives the action', detail: 'The phrase before を is usually what the following verb acts on.', url: 'https://www.tofugu.com/japanese-grammar/particle-wo/', confidence: 'high' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}で(?!き)`, 'u'), name: 'で', kind: 'Context particle', short: 'marks where or how an action happens', detail: 'Often points to the setting, tool, method, or conditions for the action.', url: 'https://www.tofugu.com/japanese-grammar/particle-de/', confidence: 'medium' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}に`, 'u'), name: 'に', kind: 'Target particle', short: 'marks a target, point, time, or adverbial role', detail: 'Think of に as pinning the action to a destination, time, target, or manner.', url: 'https://www.tofugu.com/japanese-grammar/particle-ni/', confidence: 'medium' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}の`, 'u'), name: 'の', kind: 'Noun linker', short: 'connects or labels nouns', detail: 'The phrase before の modifies or belongs with the noun that follows.', url: 'https://www.tofugu.com/japanese-grammar/particle-no-noun-modifier/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}[てで](?:い(?:る|ます|た|ない)?|る|た)`, 'u'), name: 'ている', kind: 'Verb form', short: 'ongoing action or resulting state', detail: 'Shows an action in progress, or a state that remains after something changed.', url: 'https://www.tofugu.com/japanese-grammar/verb-continuous-form-teiru/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}(?:たい|たくない|たかった)`, 'u'), name: 'たい', kind: 'Verb ending', short: 'want to do something', detail: 'Attaches to a verb stem to say the speaker wants to do that action.', url: 'https://www.tofugu.com/japanese-grammar/tai-form/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}(?:ない|ません|なかった|ませんでした)`, 'u'), name: 'ない', kind: 'Verb ending', short: 'negative form', detail: 'Turns the verb or expression into "do not," "is not," or "did not."', url: 'https://www.tofugu.com/japanese-grammar/verb-negative-nai-form/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}ました`, 'u'), name: 'ました', kind: 'Polite past', short: 'polite completed action', detail: 'A polite ます-form verb in the past tense: "did" or "was/were."', url: 'https://www.tofugu.com/japanese-grammar/masu/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}ます`, 'u'), name: 'ます', kind: 'Polite form', short: 'polite non-past verb', detail: 'Softens the verb into polite speech; tense depends on the surrounding sentence.', url: 'https://www.tofugu.com/japanese-grammar/masu/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}たら`, 'u'), name: 'たら', kind: 'Clause linker', short: 'conditional or time sequence', detail: 'Turns the first clause into the condition or timing for what follows: "if," "when," or "after."', url: 'https://www.tofugu.com/japanese-grammar/conditional-form-tara/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}(?:えば|ければ)`, 'u'), name: 'ば', kind: 'Conditional', short: 'conditional if', detail: 'Marks the condition that needs to be true for the next clause to happen.', url: 'https://www.tofugu.com/japanese-grammar/verb-conditional-form-ba/', confidence: 'high' },
    { pattern: /(?:なので|ので)/u, name: 'ので', kind: 'Clause linker', short: 'reason or cause', detail: 'Gives the reason or cause for the following statement, usually with a softer tone than から.', url: 'https://www.tofugu.com/japanese-grammar/conjunctive-particle-node/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}から`, 'u'), name: 'から', kind: 'Particle / linker', short: 'reason, source, or starting point', detail: 'Can mean "because," "from," or "after," depending on what surrounds it.', url: 'https://www.tofugu.com/japanese-grammar/particle-kara/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}てもいい`, 'u'), name: 'てもいい', kind: 'Permission', short: 'permission or approval', detail: 'Means it is okay to do the action before てもいい.', url: 'https://www.tofugu.com/japanese-grammar/temoii/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}そう`, 'u'), name: 'そう', kind: 'Appearance', short: 'looks like something will happen', detail: 'Describes how something seems based on what the speaker can observe.', url: 'https://www.tofugu.com/japanese-grammar/verb-sou/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}よう`, 'u'), name: 'よう', kind: 'Volitional', short: 'volition, proposal, or invitation', detail: 'Often expresses "let us," "I will," or a suggestion to do something together.', url: 'https://www.tofugu.com/japanese-grammar/verb-volitional-form-you/', confidence: 'medium' },
    { pattern: /のに/u, name: 'のに', kind: 'Clause linker', short: 'although, despite, or frustrated expectation', detail: 'Connects two ideas when the second one is surprising or disappointing given the first.', url: 'https://www.tofugu.com/japanese-grammar/conjunctive-particle-noni/', confidence: 'high' },
    { pattern: /こと(?:が|を|に|は|も)/u, name: 'こと', kind: 'Nominalizer', short: 'abstract thing or nominalizer', detail: 'Turns an action or idea into a noun-like concept that particles can attach to.', url: 'https://www.tofugu.com/japanese-grammar/koto/', confidence: 'medium' },
];

const translationCache = new Map<string, string>();

export function detectGrammarHints(sentence: string): GrammarHint[] {
    const normalized = sentence.replace(/\s+/g, '');
    const seenMatches = new Set<string>();
    const seenNames = new Map<string, number>();
    const hints = GRAMMAR_PATTERNS
        .flatMap(item => grammarMatches(item, normalized))
        .sort((a, b) => a.index - b.index || a.name.localeCompare(b.name))
        .filter(item => {
            const key = `${item.name}:${item.match}`;
            if (seenMatches.has(key)) return false;
            const count = seenNames.get(item.name) ?? 0;
            if (count >= 2) return false;
            seenMatches.add(key);
            seenNames.set(item.name, count + 1);
            return true;
        })
        .slice(0, 10);
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
        <div class="jpdb-reader-study-block jpdb-reader-study-sentence-block">
            <div class="jpdb-reader-study-original jpdb-reader-parseable">${escapeHtml(sentence)}</div>
        </div>
        <ol class="jpdb-reader-study-list">
        ${hints.map(hint => `
            <li class="jpdb-reader-study-item">
                <div class="jpdb-reader-study-name">${escapeHtml(hint.name)}</div>
                <div class="jpdb-reader-study-body">
                    <div class="jpdb-reader-study-item-head">
                        <div class="jpdb-reader-study-kind">${escapeHtml(hint.kind)}</div>
                    </div>
                    <div class="jpdb-reader-study-short">${escapeHtml(hint.short)}</div>
                    <div class="jpdb-reader-study-detail">${escapeHtml(hint.detail)}</div>
                    <div class="jpdb-reader-study-match"><span>Found in</span>${escapeHtml(hint.match)}</div>
                    <a class="jpdb-reader-study-guide" href="${escapeHtml(hint.url)}" target="_blank" rel="noopener">Guide</a>
                </div>
            </li>
        `).join('')}
        </ol>`;
}

function grammarMatches(item: GrammarPattern, sentence: string): GrammarHint[] {
    const flags = item.pattern.flags.includes('g') ? item.pattern.flags : `${item.pattern.flags}g`;
    const pattern = new RegExp(item.pattern.source, flags);
    return Array.from(sentence.matchAll(pattern))
        .map(match => ({
            name: item.name,
            kind: item.kind,
            short: item.short,
            detail: item.detail,
            url: item.url,
            match: learnerMatch(item.name, match[0]),
            confidence: item.confidence,
            index: match.index ?? 0,
        }))
        .filter(hint => hint.match.length > 0);
}

function learnerMatch(name: string, rawMatch: string): string {
    let match = rawMatch.replace(/^(?:そして|それで|でも|また)/u, '');
    if (!['たい', 'ない', 'ました', 'ます'].includes(name)) return match;
    const afterLastParticle = match.replace(/^.*[はがをにへともやの]/u, '');
    return afterLastParticle || match;
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
