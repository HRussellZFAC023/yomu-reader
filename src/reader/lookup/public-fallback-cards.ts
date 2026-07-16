import type { JPDBCard, JPDBToken } from '../app/types';
import { Logger } from '../app/logger';
import { cardKey } from '../cards/utils';
import { runLimited } from '../core/async-utils';
import { fallbackLookupTermsForCard } from './japanese-segments';

const log = Logger.scope('PublicLookupFallback');

interface FallbackLookupEntry {
    key: string;
    terms: string[];
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

function uniqueFallbackLookupEntries(cards: readonly JPDBCard[], termLimit?: number): FallbackLookupEntry[] {
    const seen = new Set<string>();
    const entries: FallbackLookupEntry[] = [];
    for (const card of cards) {
        const key = cardKey(card);
        if (seen.has(key)) continue;
        seen.add(key);
        const allTerms = fallbackLookupTermsForCard(card);
        const terms = typeof termLimit === 'number'
            ? allTerms.slice(0, Math.max(card.spelling.endsWith('ながら') ? 2 : 1, Math.floor(termLimit)))
            : allTerms;
        if (terms.length) entries.push({ key, terms });
    }
    return entries;
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
        return [] as JPDBToken[][];
    });
    uniqueTerms.forEach((term, index) => {
        const tokens = parsed[index] ?? [];
        const card = tokens.find(token => jitenFallbackTokenMatches(term, token))?.card
            ?? tokens.find(token => token.card.source === 'jiten')?.card;
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
    if (deps.jitenApiActive()) return batchJitenFallbackCards(terms, deps.parse);
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

    const terms = [...new Set(entries.flatMap(entry => entry.terms))];
    const jitenCards = await jitenFallbackCards(terms, entries.length, deps, options);
    for (const entry of entries) {
        for (const term of entry.terms) {
            const card = jitenCards.get(normalizedJitenLookupKey(term));
            if (!card) continue;
            result.set(entry.key, card);
            break;
        }
    }

    if (options.jpdbPublicLookup === false) return result;
    const unresolved = entries.filter(entry => !result.has(entry.key));
    await runLimited(unresolved, options.concurrency, async entry => {
        for (const term of entry.terms) {
            const publicCard = await deps.publicSpellingCard(term);
            if (!publicCard) continue;
            result.set(entry.key, publicCard);
            return;
        }
    });
    return result;
}
