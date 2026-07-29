import { beforeEach, describe, expect, it } from 'vitest';
import {
    mergeStoredYomuSrsCards,
    mergeStoredYomuSrsDecks,
    normalizeStoredYomuSrsDeck,
    type StoredYomuSrsCard,
} from '../../src/reader/srs/local-yomu-deck';
import { rebuildReaderDeckEventStream } from '../../src/reader/srs/account-sync';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';

describe('multilingual local card identity', () => {
    beforeEach(() => localStorage.clear());

    it('keeps the legacy Japanese key byte-identical to the literal 本\\0ほん and elides only trailing defaults', () => {
        expect(canonicalStudyCardKey('本', 'ほん')).toBe('本\u0000ほん');
        expect(canonicalStudyCardKey('本', 'ほん', { language: 'ja' })).toBe('本\u0000ほん');
        expect(canonicalStudyCardKey('本', 'ほん', { partOfSpeech: 'noun', language: 'ja' }))
            .toBe('本\u0000ほん\u0000noun');
        expect(canonicalStudyCardKey('casa', 'casa', { language: 'es' }))
            .toBe('casa\u0000casa\u0000\u0000es');
        expect(canonicalStudyCardKey('casa', 'casa', { partOfSpeech: 'verb', language: 'es' }))
            .toBe('casa\u0000casa\u0000verb\u0000es');
    });

    it('stores and retrieves same-spelling Latin cards independently by language', async () => {
        const repository = new LocalYomuSrsRepository(() => 1_000);
        await repository.mine({ expression: 'casa', reading: 'casa', language: 'es', meaning: 'house' });
        await repository.mine({ expression: 'casa', reading: 'casa', language: 'fr', meaning: 'hut' });

        const esKey = canonicalStudyCardKey('casa', 'casa', { language: 'es' });
        const frKey = canonicalStudyCardKey('casa', 'casa', { language: 'fr' });
        expect(esKey).not.toBe(frKey);
        expect(Object.keys((await repository.snapshot()).cards).sort()).toEqual([esKey, frKey].sort());

        const cards = await repository.lookupCards([
            { expression: 'casa', reading: 'casa', language: 'es' },
            { expression: 'casa', reading: 'casa', language: 'fr' },
        ]);
        expect(cards).toEqual(expect.arrayContaining([
            expect.objectContaining({ providerCardId: esKey, language: 'es' }),
            expect.objectContaining({ providerCardId: frKey, language: 'fr' }),
        ]));
    });

    it('refuses to merge cards whose languages make their identities different', () => {
        const es = storedCard('casa', 'casa', 'es');
        const fr = storedCard('casa', 'casa', 'fr');

        expect(() => mergeStoredYomuSrsCards(es, fr))
            .toThrowError('Cannot merge Yomu SRS cards with different identities.');
    });

    it('applies an es tombstone without deleting the same-spelling fr card', () => {
        const es = storedCard('casa', 'casa', 'es');
        const fr = storedCard('casa', 'casa', 'fr');
        const merged = mergeStoredYomuSrsDecks(
            { version: 1, cards: { [es.id]: es, [fr.id]: fr } },
            { version: 1, cards: {}, tombstones: { [es.id]: 2_000 } },
        );

        expect(merged.cards[es.id]).toBeUndefined();
        expect(merged.tombstones?.[es.id]).toBe(2_000);
        expect(merged.cards[fr.id]).toMatchObject(fr);
    });

    it('rebuilds the same deck from a pre-change version-1 event stream with no language field', () => {
        const legacy = storedCard('本', 'ほん', 'ja');
        delete legacy.language;
        const stream = [{ version: 1, kind: 'card', card: legacy }];

        expect(Object.hasOwn(legacy, 'language')).toBe(false);
        expect(rebuildReaderDeckEventStream(stream)).toEqual(normalizeStoredYomuSrsDeck({
            version: 1,
            cards: { [legacy.id]: legacy },
        }));
        expect(Object.hasOwn(rebuildReaderDeckEventStream(stream).cards[legacy.id]!, 'language')).toBe(false);
    });
});

function storedCard(expression: string, reading: string, language: string): StoredYomuSrsCard {
    const id = canonicalStudyCardKey(expression, reading, { language });
    return {
        id,
        expression,
        reading,
        language,
        meanings: [],
        dueAt: 1_000,
        lastReviewAt: null,
        createdAt: 1_000,
        updatedAt: 1_000,
        reviews: 0,
        lapses: 0,
        intervalDays: 0,
        ease: 2.5,
        retainWithoutAcademyProvenance: true,
        academyProvenance: {},
    };
}
