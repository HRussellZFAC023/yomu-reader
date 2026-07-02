import { describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { cardKey } from '../../src/reader/cards/utils';
import { fallbackLookupTermsForCard } from '../../src/reader/lookup/japanese-segments';
import {
    batchJitenFallbackCards,
    normalizedJitenLookupKey,
    publicLookupFallbackCards,
    type PublicLookupFallbackDeps,
} from '../../src/reader/lookup/public-fallback-cards';

const baseCard: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '食べる',
    reading: 'たべる',
    frequencyRank: 100,
    partOfSpeech: ['v1'],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: ['LHH'],
    wordWithReading: null,
};

function fallbackCard(overrides: Partial<JPDBCard> & Pick<JPDBCard, 'vid' | 'sid' | 'spelling'>): JPDBCard {
    return { ...baseCard, rid: 0, reading: '', source: 'fallback', pitchAccent: [], ...overrides };
}

function jitenCard(overrides: Partial<JPDBCard> & Pick<JPDBCard, 'vid' | 'spelling' | 'reading'>): JPDBCard {
    return { ...baseCard, sid: 0, rid: 0, source: 'jiten', ...overrides };
}

function tokenFor(card: JPDBCard, sentence: string): JPDBToken {
    return { card, start: 0, end: sentence.length, length: sentence.length, rubies: [], pitchClass: '', sentence };
}


function keylessDeps(overrides: Partial<PublicLookupFallbackDeps> = {}): PublicLookupFallbackDeps {
    return {
        jitenApiActive: () => false,
        parse: vi.fn(async () => []),
        lookupMany: vi.fn(async () => new Map<string, JPDBCard>()),
        publicSpellingCard: vi.fn(async () => undefined),
        ...overrides,
    };
}

function noPublicSweep(): (term: string) => Promise<JPDBCard | undefined> {
    return vi.fn(async () => undefined);
}

describe('publicLookupFallbackCards', () => {
    it('routes keyed users through ONE batched parse and never touches the public jiten lookup', async () => {
        const spellings = ['青空', '読む', '会話'];
        const cards = spellings.map((spelling, index) => fallbackCard({ vid: -(index + 1), sid: -(index + 1), spelling }));
        const resolved = new Map(spellings.map(spelling => [spelling, jitenCard({ vid: 1000, spelling, reading: 'よみ' })]));
        const parse = vi.fn(async (terms: string[]) => terms.map(term => {
            const card = resolved.get(term);
            return card ? [tokenFor(card, term)] : [];
        }));
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const publicSpellingCard = noPublicSweep();
        const deps = keylessDeps({ jitenApiActive: () => true, parse, lookupMany, publicSpellingCard });

        const result = await publicLookupFallbackCards(cards, deps, { concurrency: 2, detailLimit: count => count });

        expect(parse).toHaveBeenCalledTimes(1);
        expect(lookupMany).not.toHaveBeenCalled();
        expect(publicSpellingCard).not.toHaveBeenCalled();
        expect(result.size).toBe(spellings.length);
    });

    it('resolves every fallback entry through ONE batched jiten request, never per-word', async () => {
        const spellings = ['青空', '読む', '当たり', '会話', '大切'];
        const cards = spellings.map((spelling, index) => fallbackCard({ vid: -(index + 1), sid: -(index + 1), spelling }));
        const duplicate = fallbackCard({ vid: -1, sid: -1, spelling: '青空' });
        const resolved = new Map(spellings.map(spelling => [spelling, jitenCard({ vid: 1000, spelling, reading: 'よみ' })]));
        const lookupMany = vi.fn(async (terms: string[], _lookupOptions?: { detailLimit?: number }) => new Map(
            terms.flatMap(term => {
                const card = resolved.get(term);
                return card ? [[normalizedJitenLookupKey(term), card] as const] : [];
            }),
        ));
        const publicSpellingCard = noPublicSweep();
        const deps = keylessDeps({ lookupMany, publicSpellingCard });

        const result = await publicLookupFallbackCards([...cards, duplicate], deps, { concurrency: 2, detailLimit: count => count * 2 });

        expect(lookupMany).toHaveBeenCalledTimes(1);
        const [terms, lookupOptions] = lookupMany.mock.calls[0];
        expect([...terms].sort()).toEqual([...spellings].sort());
        expect(lookupOptions).toEqual({ detailLimit: spellings.length * 2 });
        expect(publicSpellingCard).not.toHaveBeenCalled();
        expect(result.size).toBe(spellings.length);
        for (const card of cards) {
            expect(result.get(cardKey(card))).toBe(resolved.get(card.spelling));
        }
    });

    it('sweeps only jiten misses through the bounded public lookup and stops at the first hit per entry', async () => {
        const resolvedByJiten = fallbackCard({ vid: -1, sid: -1, spelling: '青空' });
        const missed = fallbackCard({ vid: -2, sid: -2, spelling: '食べました', fallbackLookupTerms: ['食べる', '食う'] });
        const missedTerms = fallbackLookupTermsForCard(missed);
        expect(missedTerms.length).toBeGreaterThanOrEqual(3);
        const jitenHit = jitenCard({ vid: 1381470, spelling: '青空', reading: 'あおぞら' });
        const publicHit = jitenCard({ vid: 2000, spelling: missedTerms[1], reading: 'よみ', source: 'jpdb' });
        const lookupMany = vi.fn(async () => new Map([[normalizedJitenLookupKey('青空'), jitenHit]]));
        const publicSpellingCard = vi.fn(async (term: string) => term === missedTerms[1] ? publicHit : undefined);

        const result = await publicLookupFallbackCards([resolvedByJiten, missed], keylessDeps({ lookupMany, publicSpellingCard }), { concurrency: 2 });

        expect(result.get(cardKey(resolvedByJiten))).toBe(jitenHit);
        expect(result.get(cardKey(missed))).toBe(publicHit);
        expect(publicSpellingCard).toHaveBeenCalledWith(missedTerms[0]);
        expect(publicSpellingCard).toHaveBeenCalledWith(missedTerms[1]);
        expect(publicSpellingCard).not.toHaveBeenCalledWith(missedTerms[2]);
        expect(publicSpellingCard).not.toHaveBeenCalledWith('青空');
    });

    it('skips the public sweep entirely when jpdbPublicLookup is false', async () => {
        const card = fallbackCard({ vid: -1, sid: -1, spelling: '会話' });
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const publicSpellingCard = noPublicSweep();

        const result = await publicLookupFallbackCards([card], keylessDeps({ lookupMany, publicSpellingCard }), { concurrency: 2, jpdbPublicLookup: false });

        expect(lookupMany).toHaveBeenCalledTimes(1);
        expect(publicSpellingCard).not.toHaveBeenCalled();
        expect(result.size).toBe(0);
    });

    it('truncates each entry to termLimit candidate terms', async () => {
        const card = fallbackCard({ vid: -1, sid: -1, spelling: '食べました', fallbackLookupTerms: ['食べる', '食う'] });
        const allTerms = fallbackLookupTermsForCard(card);
        expect(allTerms.length).toBeGreaterThan(1);
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const publicSpellingCard = noPublicSweep();

        await publicLookupFallbackCards([card], keylessDeps({ lookupMany, publicSpellingCard }), { concurrency: 2, termLimit: 1 });

        expect(lookupMany).toHaveBeenCalledWith([allTerms[0]], undefined);
        expect(publicSpellingCard).toHaveBeenCalledTimes(1);
        expect(publicSpellingCard).toHaveBeenCalledWith(allTerms[0]);
    });

    it('resolves whitespace-carrying terms via the stripped keys jiten lookupMany maps use', async () => {
        const card = fallbackCard({ vid: -1, sid: -1, spelling: 'お 茶' });
        const publicCard = jitenCard({ vid: 3000, spelling: 'お茶', reading: 'おちゃ' });
        // jiten-public-vocabulary keys its lookupMany result by fully
        // whitespace-STRIPPED terms; the module renormalizes returned keys so
        // a spaced term can never silently miss the batch it just paid for —
        // even if the client's keying ever drifts (raw key used here).
        const lookupMany = vi.fn(async () => new Map([['お 茶', publicCard]]));
        const publicSpellingCard = noPublicSweep();

        const result = await publicLookupFallbackCards([card], keylessDeps({ lookupMany, publicSpellingCard }), { concurrency: 2 });

        expect(normalizedJitenLookupKey('お 茶')).toBe('お茶');
        expect(result.get(cardKey(card))).toBe(publicCard);
        expect(publicSpellingCard).not.toHaveBeenCalled();
    });

    it('makes zero requests when no entry has lookup terms', async () => {
        const card = fallbackCard({ vid: -1, sid: -1, spelling: '   ' });
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const publicSpellingCard = noPublicSweep();

        const result = await publicLookupFallbackCards([card], keylessDeps({ lookupMany, publicSpellingCard }), { concurrency: 2 });

        expect(lookupMany).not.toHaveBeenCalled();
        expect(publicSpellingCard).not.toHaveBeenCalled();
        expect(result.size).toBe(0);
    });

    it('bounds public sweep concurrency', async () => {
        const cards = Array.from({ length: 6 }, (_, index) => fallbackCard({ vid: -(index + 1), sid: -(index + 1), spelling: `背景${index}` }));
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        let active = 0;
        let maxActive = 0;
        const publicSpellingCard = vi.fn(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>(resolve => setTimeout(resolve, 1));
            active--;
            return undefined;
        });

        await publicLookupFallbackCards(cards, keylessDeps({ lookupMany, publicSpellingCard }), { concurrency: 2 });

        expect(publicSpellingCard).toHaveBeenCalledTimes(6);
        expect(maxActive).toBeLessThanOrEqual(2);
    });
});

describe('batchJitenFallbackCards', () => {
    it('sends all unique trimmed terms through one parse request and keys results by stripped term', async () => {
        const readCard = jitenCard({ vid: 1556420, spelling: '読む', reading: 'よむ' });
        const missCard = jitenCard({ vid: 1775000, spelling: '外れ', reading: 'はずれ' });
        const hitCard = jitenCard({ vid: 1775001, spelling: '当たり', reading: 'あたり' });
        const teaCard = jitenCard({ vid: 3000, spelling: 'お茶', reading: 'おちゃ' });
        const responses = new Map<string, JPDBToken[]>([
            ['読む', [tokenFor(readCard, '読む')]],
            ['当たり', [tokenFor(missCard, '外れ'), tokenFor(hitCard, '当たり')]],
            ['お 茶', [tokenFor(teaCard, 'お茶')]],
        ]);
        const parse = vi.fn(async (terms: string[]) => terms.map(term => responses.get(term) ?? []));

        const cards = await batchJitenFallbackCards([' 読む ', '読む', '', '  ', '当たり', 'お 茶'], parse);

        expect(parse).toHaveBeenCalledTimes(1);
        expect(parse).toHaveBeenCalledWith(['読む', '当たり', 'お 茶']);
        expect(cards.get('読む')).toBe(readCard);
        expect(cards.get('当たり')).toBe(hitCard);
        expect(cards.get('お茶')).toBe(teaCard);
    });

    it('falls back to the first jiten token when nothing matches and never returns non-jiten cards', async () => {
        const strayJiten = jitenCard({ vid: 424200, spelling: 'コツ', reading: 'コツ' });
        const jpdbOnly = jitenCard({ vid: 1381470, spelling: '青空', reading: 'あおぞら', source: 'jpdb' });
        const parse = vi.fn(async (terms: string[]) => terms.map(term => {
            if (term === 'ネコ') return [tokenFor(strayJiten, 'コツ')];
            if (term === '青空') return [tokenFor(jpdbOnly, '青空')];
            return [];
        }));

        const cards = await batchJitenFallbackCards(['ネコ', '青空'], parse);

        expect(cards.get('ネコ')).toBe(strayJiten);
        expect(cards.has('青空')).toBe(false);
    });

    it('returns an empty map when the batched parse fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const parse = vi.fn(async () => {
            throw new Error('parse offline');
        });

        try {
            await expect(batchJitenFallbackCards(['読む'], parse)).resolves.toEqual(new Map());
            expect(parse).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });

    it('skips the parse request entirely for empty term lists', async () => {
        const parse = vi.fn(async () => []);

        await expect(batchJitenFallbackCards(['', '   '], parse)).resolves.toEqual(new Map());

        expect(parse).not.toHaveBeenCalled();
    });
});

describe('jiten fallback token matching', () => {
    it('matches terms against token surface, spelling, or reading with whitespace stripped', async () => {
        const card = jitenCard({ vid: 1556420, spelling: '読む', reading: 'よむ' });
        const parse = vi.fn(async (terms: string[]) => terms.map(() => [tokenFor(card, '本')]));

        const byReading = await batchJitenFallbackCards(['よむ'], parse);
        expect(byReading.get('よむ')).toBe(card);

        const bySpacedSpelling = await batchJitenFallbackCards(['読 む'], parse);
        expect(bySpacedSpelling.get('読む')).toBe(card);
    });
});
