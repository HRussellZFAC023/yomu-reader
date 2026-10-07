import type { JPDBCard, JPDBToken } from '../app/types';
import { Logger } from '../app/logger';
import { isMissingProxyTransportError } from '../network/proxy-fetch';
import { cardKey } from '../cards/utils';
import { runLimited } from '../core/async-utils';
import { fallbackLookupTermsForCard } from './japanese-segments';
import { deinflectJapaneseTerm, termRulesMatch } from './deinflect';

const log = Logger.scope('PublicLookupFallback');

interface FallbackLookupEntry {
    key: string;
    surface: string;
    terms: string[];
    spellingTerms: string[];
}

export interface PublicLookupFallbackDeps {
    jitenApiActive(): boolean;
    parse(terms: string[]): Promise<JPDBToken[][]>;
    lookupMany(terms: string[], options?: { detailLimit?: number }): Promise<Map<string, JPDBCard>>;
    publicSpellingCard(term: string): Promise<JPDBCard | undefined>;
}

export interface PublicLookupFallbackOptions {
    concurrency: number;
    termLimit?: number;
    jpdbPublicLookup?: boolean;
    detailLimit?: (entryCount: number) => number;
}

export function normalizedJitenLookupKey(term: string): string {
    return term.replace(/\s+/g, '');
}

function jitenFallbackTokenMatches(term: string, token: JPDBToken): boolean {
    const normalizedTerm = normalizedJitenLookupKey(term);
    const tokenSurface = normalizedJitenLookupKey(token.sentence?.slice(token.start, token.end) ?? '');
    return tokenSurface === normalizedTerm
        || normalizedJitenLookupKey(token.card.spelling) === normalizedTerm
        || normalizedJitenLookupKey(token.card.reading) === normalizedTerm;
}

function jitenFallbackCardMatchesTerm(term: string, card: JPDBCard): boolean {
    const normalizedTerm = normalizedJitenLookupKey(term);
    return normalizedJitenLookupKey(card.spelling) === normalizedTerm
        || normalizedJitenLookupKey(card.reading) === normalizedTerm;
}

function cardCanAnalyzeSurface(surface: string, card: JPDBCard): boolean {
    if (jitenFallbackCardMatchesTerm(surface, card)) return true;
    const rules = [...card.partOfSpeech, ...card.meanings.flatMap(meaning => meaning.partOfSpeech)].join(' ');
    return deinflectJapaneseTerm(surface).some(candidate => candidate.depth > 0
        && jitenFallbackCardMatchesTerm(candidate.term, card)
        && termRulesMatch(rules, candidate.rules));
}

function uniqueFallbackLookupEntries(cards: readonly JPDBCard[], termLimit?: number): FallbackLookupEntry[] {
    const seen = new Set<string>();
    const entries: FallbackLookupEntry[] = [];
    for (const card of cards) {
        const key = cardKey(card);
        if (seen.has(key)) continue;
        seen.add(key);
        // Public /parse understands inflected source text; exact-dictionary
        // candidate ordering would spend its first detail slot on a guess.
        const surface = normalizedJitenLookupKey(card.spelling);
        const dictionaryTerms = fallbackLookupTermsForCard(card);
        const allTerms = [...new Set([surface, ...dictionaryTerms])].filter(Boolean);
        const terms = typeof termLimit === 'number'
            ? allTerms.slice(0, Math.max(card.spelling.endsWith('ながら') ? 2 : 1, Math.floor(termLimit)))
            : allTerms;
        const spellingTerms = dictionaryTerms.slice(0, terms.length);
        if (terms.length) entries.push({ key, surface, terms, spellingTerms });
    }
    return entries;
}

function fairFallbackLookupTerms(entries: readonly FallbackLookupEntry[]): string[] {
    const terms: string[] = [];
    const seen = new Set<string>();
    const rounds = entries.reduce((maximum, entry) => Math.max(maximum, entry.terms.length), 0);
    for (let candidateIndex = 0; candidateIndex < rounds; candidateIndex++) {
        for (const entry of entries) {
            const term = entry.terms[candidateIndex];
            if (!term || seen.has(term)) continue;
            seen.add(term);
            terms.push(term);
        }
    }
    return terms;
}

// Resolve fallback terms through Jiten with ZERO per-word requests: ALL terms
// go through one batched reader/parse (each term as its own line), which
// returns full vocabulary in a single request and is metered by Jiten's
// per-user parse budget. Only called for keyed users; keyless never bulk-hits
// Jiten this way (that path was the per-word /info request storm).
export async function batchJitenFallbackCards(
    terms: readonly string[],
    parse: PublicLookupFallbackDeps['parse'],
): Promise<Map<string, JPDBCard>> {
    const cards = new Map<string, JPDBCard>();
    const uniqueTerms = [...new Set(terms.map(term => term.trim()).filter(Boolean))];
    if (!uniqueTerms.length) return cards;
    const parsed = await parse(uniqueTerms).catch(error => {
        log.warn('Jiten batch fallback parse failed', { terms: uniqueTerms.length }, error);
        // The keyed transport can be entirely absent (hosted page: no GM
        // bridge, no configured proxy, and api.jiten.moe sends no CORS
        // headers). Rethrow so callers degrade to the keyless public lookup
        // instead of treating "no transport" as "no results".
        if (isMissingProxyTransportError(error)) throw error;
        return [] as JPDBToken[][];
    });
    uniqueTerms.forEach((term, index) => {
        const tokens = parsed[index] ?? [];
        // A deinflection candidate can itself be nonsense (訪れた also yields
        // 訪る). Jiten then parses only the valid prefix 訪, whose first card is
        // the surname "Hou". Accepting an arbitrary first token poisoned the
        // whole fallback chain before it reached the correct 訪れる candidate.
        const card = tokens.find(token => jitenFallbackTokenMatches(term, token))?.card;
        if (card?.source === 'jiten') cards.set(normalizedJitenLookupKey(term), card);
    });
    return cards;
}

async function jitenFallbackCards(
    terms: string[],
    entryCount: number,
    deps: PublicLookupFallbackDeps,
    options: PublicLookupFallbackOptions,
): Promise<Map<string, JPDBCard>> {
    if (deps.jitenApiActive()) {
        const batched = await batchJitenFallbackCards(terms, deps.parse).catch(error => {
            if (!isMissingProxyTransportError(error)) throw error;
            return null;
        });
        if (batched) return batched;
        // Keyed transport is dead — degrade to the capped keyless lookup below.
    }
    const loaded = await deps.lookupMany(terms, options.detailLimit ? { detailLimit: options.detailLimit(entryCount) } : undefined).catch(error => {
        log.warn('Jiten fallback failed', { terms: terms.length }, error);
        return new Map<string, JPDBCard>();
    });
    // lookupMany keys by its own whitespace-stripped normalization; re-key
    // here so a drift there can never silently miss.
    const cards = new Map<string, JPDBCard>();
    loaded.forEach((card, term) => cards.set(normalizedJitenLookupKey(term), card));
    return cards;
}

// One batched Jiten pass over every entry's terms (keyed users parse, keyless
// use the capped public lookup), then a bounded per-term public JPDB sweep
// for whatever Jiten could not resolve. Both the userscript reader and the
// hosted new-tab runtime route their card fallbacks through here so the
// batch-not-per-word contract cannot drift between them.
export async function publicLookupFallbackCards(
    cards: readonly JPDBCard[],
    deps: PublicLookupFallbackDeps,
    options: PublicLookupFallbackOptions,
): Promise<Map<string, JPDBCard>> {
    const result = new Map<string, JPDBCard>();
    const entries = uniqueFallbackLookupEntries(cards, options.termLimit);
    if (!entries.length) return result;

    // Keyless Jiten hydrates only `detailLimit(entryCount)` terms. Interleave
    // candidate ranks so every visible entry gets its first choice before an
    // inflected entry can spend a second slot. Later rounds retain each entry's
    // candidate order and global dedup keeps the request no larger than before.
    const terms = fairFallbackLookupTerms(entries);
    const jitenCards = await jitenFallbackCards(terms, entries.length, deps, options);
    for (const entry of entries) {
        let resolved: JPDBCard | undefined;
        for (const term of entry.terms) {
            const card = jitenCards.get(normalizedJitenLookupKey(term));
            if (!card || !cardCanAnalyzeSurface(entry.surface, card)) continue;
            // A validated analysis of the actual source outranks a different
            // lemma obtained by parsing one of our speculative dictionary forms.
            if (term === entry.surface || jitenFallbackCardMatchesTerm(term, card)) {
                resolved = card;
                break;
            }
            // A speculative candidate can itself parse to a different valid
            // lemma. Keep it only until an exact candidate answer arrives;
            // source/POS validation above has already rejected unrelated hits.
            resolved ??= card;
        }
        if (resolved) result.set(entry.key, resolved);
    }

    if (options.jpdbPublicLookup === false) return result;
    const unresolved = entries.filter(entry => !result.has(entry.key));
    await runLimited(unresolved, options.concurrency, async entry => {
        for (const term of entry.spellingTerms) {
            const publicCard = await deps.publicSpellingCard(term);
            if (!publicCard || !cardCanAnalyzeSurface(entry.surface, publicCard)) continue;
            result.set(entry.key, publicCard);
            return;
        }
    });
    return result;
}
