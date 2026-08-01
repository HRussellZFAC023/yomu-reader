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

    it('degrades keyed users to the capped keyless lookup when the keyed transport has no proxy', async () => {
        // Hosted page with a Jiten API key but no GM bridge and no configured
        // proxy: the keyed reader/parse POST has zero fetch candidates. The
        // fallback must behave like a keyless user, not return nothing.
        const card = fallbackCard({ vid: -1, sid: -1, spelling: '青空' });
        const publicHit = jitenCard({ vid: 1381470, spelling: '青空', reading: 'あおぞら' });
        const parse = vi.fn(async () => {
            throw new Error('No configured proxy.');
        });
        const lookupMany = vi.fn(async () => new Map([[normalizedJitenLookupKey('青空'), publicHit]]));
        const deps = keylessDeps({ jitenApiActive: () => true, parse, lookupMany, publicSpellingCard: noPublicSweep() });

        const result = await publicLookupFallbackCards([card], deps, { concurrency: 2 });

        expect(parse).toHaveBeenCalledTimes(1);
        expect(lookupMany).toHaveBeenCalledTimes(1);
        expect(result.get(cardKey(card))).toBe(publicHit);
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

    it('gives every visible entry a first candidate before spending slots on later inflection candidates', async () => {
        const inflected = fallbackCard({
            vid: -1,
            sid: -1,
            spelling: '食べました',
            fallbackLookupTerms: ['食べる', '食う'],
        });
        const sky = fallbackCard({ vid: -2, sid: -2, spelling: '青空' });
        const badmouth = fallbackCard({ vid: -3, sid: -3, spelling: '悪口' });
        const inflectedTerms = fallbackLookupTermsForCard(inflected);
        expect(inflectedTerms).toHaveLength(3);
        const resolved = new Map<string, JPDBCard>([
            [inflectedTerms[0], jitenCard({ vid: 100, spelling: inflectedTerms[0], reading: 'たべる' })],
            ['青空', jitenCard({ vid: 101, spelling: '青空', reading: 'あおぞら' })],
            ['悪口', jitenCard({ vid: 102, spelling: '悪口', reading: 'わるぐち' })],
        ]);
        const lookupMany = vi.fn(async (terms: string[], options?: { detailLimit?: number }) => new Map(
            terms.slice(0, options?.detailLimit).flatMap(term => {
                const card = resolved.get(term);
                return card ? [[term, card] as const] : [];
            }),
        ));

        const result = await publicLookupFallbackCards(
            [inflected, sky, badmouth],
            keylessDeps({ lookupMany, publicSpellingCard: noPublicSweep() }),
            { concurrency: 2, detailLimit: count => count, jpdbPublicLookup: false },
        );

        expect(lookupMany).toHaveBeenCalledWith([
            inflectedTerms[0],
            '青空',
            '悪口',
            inflectedTerms[1],
            inflectedTerms[2],
        ], { detailLimit: 3 });
        expect(result.get(cardKey(inflected))).toBe(resolved.get(inflectedTerms[0]));
        expect(result.get(cardKey(sky))).toBe(resolved.get('青空'));
        expect(result.get(cardKey(badmouth))).toBe(resolved.get('悪口'));
    });

    it('uses later validated lemmas without spending the next visible word\'s detail slot', async () => {
        const reported = [
            fallbackCard({ vid: -1, sid: -1, spelling: '私' }),
            fallbackCard({ vid: -2, sid: -2, spelling: '彼ら' }),
            fallbackCard({ vid: -3, sid: -3, spelling: '悪口' }),
            fallbackCard({
                vid: -4,
                sid: -4,
                spelling: '言いたくない',
                fallbackLookupTerms: ['言いたくなう', '言いたくる', '言いる', '言う', '言いたう', '言いたい'],
            }),
        ];
        const resolved = new Map<string, JPDBCard>([
            ['私', jitenCard({ vid: 1311110, spelling: '私', reading: 'わたし' })],
            ['彼ら', jitenCard({ vid: 1483090, spelling: '彼ら', reading: 'かれら' })],
            ['悪口', jitenCard({ vid: 1575730, spelling: '悪口', reading: 'わるぐち' })],
            // Jiten parses the whole inflected surface, then its detail endpoint
            // returns the dictionary card. The lemma is a validated fallback
            // candidate, but is later than the three-term subtitle lookup cap.
            ['言いたくない', jitenCard({ vid: 1587040, spelling: '言う', reading: 'いう' })],
        ]);
        const lookupMany = vi.fn(async (terms: string[], options?: { detailLimit?: number }) => new Map(
            terms.slice(0, options?.detailLimit).flatMap(term => {
                const card = resolved.get(term);
                return card ? [[term, card] as const] : [];
            }),
        ));

        const result = await publicLookupFallbackCards(
            reported,
            keylessDeps({ lookupMany, publicSpellingCard: noPublicSweep() }),
            { concurrency: 2, termLimit: 3, detailLimit: count => count, jpdbPublicLookup: false },
        );

        expect(lookupMany).toHaveBeenCalledWith([
            '私',
            '彼ら',
            '悪口',
            '言いたくない',
            '言いたくなう',
            '言いたくる',
        ], { detailLimit: 4 });
        expect(result.get(cardKey(reported[0]))?.reading).toBe('わたし');
        expect(result.get(cardKey(reported[1]))?.reading).toBe('かれら');
        expect(result.get(cardKey(reported[2]))?.reading).toBe('わるぐち');
        expect(result.get(cardKey(reported[3]))?.spelling).toBe('言う');
    });

    it('keeps exact nouns ahead of ambiguous continuative-stem verbs', async () => {
        const movement = fallbackCard({ vid: -1, sid: -1, spelling: '動き', fallbackLookupTerms: ['動く'] });
        const listening = fallbackCard({ vid: -2, sid: -2, spelling: '聞き', fallbackLookupTerms: ['聞く'] });
        const movementNoun = jitenCard({ vid: 10, spelling: '動き', reading: 'うごき' });
        const movementVerb = jitenCard({ vid: 11, spelling: '動く', reading: 'うごく' });
        const listeningVerb = jitenCard({ vid: 12, spelling: '聞く', reading: 'きく' });
        const lookupMany = vi.fn(async (terms: string[]) => new Map<string, JPDBCard>(terms.flatMap(term => {
            if (term === '動き') return [[term, movementNoun]];
            if (term === '動く') return [[term, movementVerb]];
            if (term === '聞く') return [[term, listeningVerb]];
            return [];
        })));

        const result = await publicLookupFallbackCards(
            [movement, listening],
            keylessDeps({ lookupMany, publicSpellingCard: noPublicSweep() }),
            { concurrency: 2, jpdbPublicLookup: false },
        );

        expect(lookupMany).toHaveBeenCalledWith(['動き', '聞き', '動く', '聞く'], undefined);
        expect(result.get(cardKey(movement))).toBe(movementNoun);
        expect(result.get(cardKey(listening))).toBe(listeningVerb);
    });

    it('prefers a later exact candidate over an earlier entry-wide lemma match', async () => {
        const card = fallbackCard({
            vid: -1,
            sid: -1,
            spelling: '対象',
            fallbackLookupTerms: ['先候補', '本命'],
        });
        const inferredFromEarlierCandidate = jitenCard({
            vid: 10,
            spelling: '本命',
            reading: 'ほんめい',
            meanings: [{ glosses: ['inferred'], partOfSpeech: [] }],
        });
        const exactLaterCandidate = jitenCard({
            vid: 11,
            spelling: '本命',
            reading: 'ほんめい',
            meanings: [{ glosses: ['exact'], partOfSpeech: [] }],
        });
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>([
            ['先候補', inferredFromEarlierCandidate],
            ['本命', exactLaterCandidate],
        ]));

        const result = await publicLookupFallbackCards(
            [card],
            keylessDeps({ lookupMany, publicSpellingCard: noPublicSweep() }),
            { concurrency: 2, termLimit: 3, jpdbPublicLookup: false },
        );

        expect(lookupMany).toHaveBeenCalledWith(['先候補', '本命', '対象'], undefined);
        expect(result.get(cardKey(card))).toBe(exactLaterCandidate);
    });

    it('rejects a partial surname hit and continues to the real inflected lemma', async () => {
        const visited = fallbackCard({
            vid: -1,
            sid: -1,
            spelling: '訪れた',
            fallbackLookupTerms: ['訪る', '訪れる'],
        });
        const surname = jitenCard({ vid: 5639848, spelling: '訪', reading: 'ほう' });
        const verb = jitenCard({ vid: 1518080, spelling: '訪れる', reading: 'おとずれる', pitchAccent: ['LHHHL'] });
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>([
            ['訪る', surname],
            ['訪れる', verb],
        ]));

        const result = await publicLookupFallbackCards(
            [visited],
            keylessDeps({ lookupMany, publicSpellingCard: noPublicSweep() }),
            { concurrency: 2, jpdbPublicLookup: false },
        );

        expect(result.get(cardKey(visited))).toBe(verb);
        expect(result.get(cardKey(visited))).not.toBe(surname);
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

    it('keeps both ながら lemma candidates when background lookup is capped to one term', async () => {
        const card = fallbackCard({
            vid: -1,
            sid: -1,
            spelling: '聞きながら',
            fallbackLookupTerms: ['聞きる', '聞く'],
        });
        const listeningVerb = jitenCard({ vid: 12, spelling: '聞く', reading: 'きく' });
        const lookupMany = vi.fn(async (terms: string[]) => new Map(
            terms.includes('聞く') ? [['聞く', listeningVerb]] : [],
        ));

        const result = await publicLookupFallbackCards(
            [card],
            keylessDeps({ lookupMany, publicSpellingCard: noPublicSweep() }),
            { concurrency: 2, termLimit: 1, jpdbPublicLookup: false },
        );

        expect(lookupMany).toHaveBeenCalledWith(['聞きる', '聞く'], undefined);
        expect(result.get(cardKey(card))).toBe(listeningVerb);
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

    it('rejects unrelated partial jiten tokens and never returns non-jiten cards', async () => {
        const strayJiten = jitenCard({ vid: 424200, spelling: 'コツ', reading: 'コツ' });
        const jpdbOnly = jitenCard({ vid: 1381470, spelling: '青空', reading: 'あおぞら', source: 'jpdb' });
        const parse = vi.fn(async (terms: string[]) => terms.map(term => {
            if (term === 'ネコ') return [tokenFor(strayJiten, 'コツ')];
            if (term === '青空') return [tokenFor(jpdbOnly, '青空')];
            return [];
        }));

        const cards = await batchJitenFallbackCards(['ネコ', '青空'], parse);

        expect(cards.has('ネコ')).toBe(false);
        expect(cards.has('青空')).toBe(false);
    });

    it('does not let the 訪る deinflection candidate resolve to the surname 訪', async () => {
        const surname = jitenCard({ vid: 5639848, spelling: '訪', reading: 'ほう' });
        const verb = jitenCard({ vid: 1518080, spelling: '訪れる', reading: 'おとずれる' });
        const parse = vi.fn(async (terms: string[]) => terms.map(term => {
            if (term === '訪る') return [{ ...tokenFor(surname, '訪る'), end: 1, length: 1 }];
            if (term === '訪れる') return [tokenFor(verb, '訪れる')];
            return [];
        }));

        const cards = await batchJitenFallbackCards(['訪る', '訪れる'], parse);

        expect(cards.has('訪る')).toBe(false);
        expect(cards.get('訪れる')).toBe(verb);
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

    it('rethrows a missing-proxy transport failure so callers can degrade to the keyless lookup', async () => {
        const warn = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const parse = vi.fn(async () => {
            throw new Error('No configured proxy.');
        });

        try {
            await expect(batchJitenFallbackCards(['読む'], parse)).rejects.toThrow('No configured proxy.');
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
