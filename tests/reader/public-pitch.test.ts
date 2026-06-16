import { describe, expect, it, vi } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import { lookupPublicPitchAccent, publicJitenPitchForCard } from '../../src/reader/lookup/public-pitch';

function card(spelling: string, reading: string, pitchAccent: string[] = []): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent,
        wordWithReading: null,
    } as JPDBCard;
}

describe('public pitch lookup', () => {
    it('uses matching public Jiten pitch before scraping JPDB public search', async () => {
        const target = card('英会話', 'えいかいわ');
        const jitenLookup = vi.fn(async () => card('英会話', 'えいかいわ', ['LHHH']));
        const jpdbLookup = vi.fn(async () => ['HLLL']);

        await expect(lookupPublicPitchAccent(target, {
            jitenPublicVocabulary: { lookup: jitenLookup },
            jpdbPublicPitch: { lookup: jpdbLookup },
        })).resolves.toEqual(['LHHH']);

        expect(jitenLookup).toHaveBeenCalledWith('英会話');
        expect(jpdbLookup).not.toHaveBeenCalled();
    });

    it('falls back to JPDB public pitch when Jiten returns a different reading', async () => {
        const target = card('生物', 'せいぶつ');
        const jitenLookup = vi.fn(async () => card('生物', 'なまもの', ['HLLL']));
        const jpdbLookup = vi.fn(async () => ['LHHH']);

        await expect(lookupPublicPitchAccent(target, {
            jitenPublicVocabulary: { lookup: jitenLookup },
            jpdbPublicPitch: { lookup: jpdbLookup },
        })).resolves.toEqual(['LHHH']);

        expect(jpdbLookup).toHaveBeenCalledWith('生物', 'せいぶつ');
    });

    it('rejects public Jiten pitch for unrelated cards', () => {
        expect(publicJitenPitchForCard(card('音楽', 'おんがく'), card('音読', 'おんどく', ['LHLL']))).toEqual([]);
    });
});
