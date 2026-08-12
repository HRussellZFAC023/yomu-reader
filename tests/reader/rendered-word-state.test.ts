import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard } from '../../src/reader/app/types';
import { renderTokensToHtml, setInnerHtml } from '../../src/reader/dom/index';
import { registerRenderedWordPrivateState } from '../../src/reader/dom/rendered-word-private-state';
import {
    applyLocalYomuSrsStateToRenderedWord,
    fallbackVocabularySpanCacheKey,
    refreshRenderedMiningInsights,
    renderedFallbackVocabularyCacheKey,
    setRenderedWordCardIdentity,
} from '../../src/reader/dom/rendered-word-state';

beforeEach(() => {
    vi.stubGlobal('location', { href: 'https://yomureader.com/study/' });
});

describe('rendered word card identity', () => {
    it('keeps fallback resolution cache identities occurrence-scoped', () => {
        const card = renderedWordCard({
            vid: -7,
            sid: -7,
            spelling: '優しい言葉',
            reading: '',
            source: 'fallback',
        });
        const first = fallbackVocabularySpanCacheKey(card, { start: 0, end: 5 });
        const second = fallbackVocabularySpanCacheKey(card, { start: 8, end: 13 });
        expect(first).not.toBe(second);

        const word = document.createElement('span');
        registerRenderedWordPrivateState(word, { vid: String(card.vid), sid: String(card.sid) });
        word.dataset.expression = card.spelling;
        word.dataset.tokenStart = '8';
        word.dataset.tokenEnd = '13';
        expect(renderedFallbackVocabularyCacheKey(word)).toBe(second);
    });

    it('replaces stale fallback metadata when a word resolves to a Jiten card', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-not-in-deck fallback-not-in-deck jpdb-pitch-atamadaka';
        word.dataset.vid = '-1805781283';
        word.dataset.sid = '-1805781283';
        word.dataset.cardSource = 'fallback';
        word.dataset.cardId = '-1805781283';
        word.dataset.readingIndex = '-1805781283';
        word.dataset.cardState = 'not-in-deck';
        word.dataset.expression = 'よむ';
        word.dataset.reading = 'よむ';

        const card: JPDBCard = {
            vid: 1456360,
            sid: 3,
            rid: 0,
            jitenWordId: 1456360,
            jitenReadingIndex: 3,
            source: 'jiten',
            reviewSource: 'jiten-api',
            spelling: 'よむ',
            reading: 'よむ',
            frequencyRank: 20215,
            partOfSpeech: ['v5m'],
            meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
            cardState: ['mature'],
            pitchAccent: ['LH'],
            wordWithReading: null,
        };

        setRenderedWordCardIdentity(word, card);

        expect(word.dataset.vid).toBe('1456360');
        expect(word.dataset.sid).toBe('3');
        expect(word.dataset.cardSource).toBe('jiten');
        expect(word.dataset.cardId).toBe('1456360');
        expect(word.dataset.readingIndex).toBe('3');
        expect(word.dataset.cardState).toBe('mature');
        expect(word.dataset.pitchAccent).toBe('LH');
        expect(word.dataset.wordWithReading).toBeUndefined();
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(false);
        expect(word.classList.contains('fallback-not-in-deck')).toBe(false);
        expect(word.classList.contains('jpdb-mature')).toBe(true);
        expect(word.classList.contains('jiten-mature')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
    });

    it('stamps and clears rendered pitch metadata', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.pitchAccent = 'stale';

        setRenderedWordCardIdentity(word, renderedWordCard({
            pitchAccent: ['LHHL'],
        }));

        expect(word.dataset.pitchAccent).toBe('LHHL');

        setRenderedWordCardIdentity(word, renderedWordCard({
            pitchAccent: [],
        }));

        expect(word.dataset.pitchAccent).toBeUndefined();
    });

    it('repairs particle, pitch, and mining semantics when sparse detail resolves late', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-heiban jpdb-reader-i-plus-one';
        word.dataset.pitchClass = 'heiban';
        word.dataset.pitchAccent = 'LHH';
        word.dataset.pitchComponents = 'true';
        word.dataset.miningInsight = 'i-plus-one';
        word.style.setProperty('--jpdb-reader-inline-pitch-gradient', 'linear-gradient(red, red)');

        setRenderedWordCardIdentity(word, renderedWordCard({
            spelling: 'まで',
            reading: 'まで',
            partOfSpeech: ['prt'],
            pitchAccent: ['LHH'],
        }));

        expect(word.classList.contains('jpdb-reader-particle')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-particle')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(false);
        expect(word.dataset.pitchClass).toBe('particle');
        expect(word.dataset.pitchAccent).toBeUndefined();
        expect(word.dataset.pitchComponents).toBeUndefined();
        expect(word.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient')).toBe('');
        expect(word.classList.contains('jpdb-reader-i-plus-one')).toBe(false);
        expect(word.dataset.miningInsight).toBeUndefined();
    });

    it('moves i+1 to the real unknown when a sparse multi-character particle resolves', () => {
        const root = document.createElement('p');
        const sentence = '冒険を始めるまで旅する。';
        const append = (lookupCard: JPDBCard): HTMLElement => {
            const wrapper = document.createElement('span');
            const word = document.createElement('span');
            word.className = 'jpdb-reader-word';
            word.dataset.sentence = sentence;
            word.textContent = lookupCard.spelling;
            setRenderedWordCardIdentity(word, lookupCard);
            wrapper.append(word);
            root.append(wrapper);
            return word;
        };
        const adventure = append(renderedWordCard({ vid: 1, sid: 0, spelling: '冒険', cardState: ['not-in-deck'] }));
        append(renderedWordCard({ vid: 2, sid: 0, spelling: '始める', cardState: ['known'] }));
        append(renderedWordCard({ vid: 3, sid: 0, spelling: '旅', cardState: ['known'] }));
        const until = append(renderedWordCard({ vid: 4, sid: 0, spelling: 'まで', reading: '', partOfSpeech: [], cardState: ['not-in-deck'] }));
        document.body.append(root);

        expect(refreshRenderedMiningInsights(root)).toEqual([]);
        expect(adventure.classList.contains('jpdb-reader-i-plus-one')).toBe(false);

        setRenderedWordCardIdentity(until, renderedWordCard({
            vid: 4,
            sid: 0,
            spelling: 'まで',
            reading: 'まで',
            partOfSpeech: ['prt'],
            cardState: ['not-in-deck'],
        }));
        expect(refreshRenderedMiningInsights(root)).toEqual([adventure]);
        expect(until.classList.contains('jpdb-reader-particle')).toBe(true);
        expect(adventure.classList.contains('jpdb-reader-i-plus-one')).toBe(true);
        expect(adventure.dataset.miningInsight).toBe('i-plus-one');
        // An already-consistent root must emit no redundant class/data writes.
        expect(refreshRenderedMiningInsights(root)).toEqual([]);
    });

    it('clears Bunpro fill state when the word resolves to a real card', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-learning bunpro-learning';
        word.dataset.cardState = 'learning';
        word.dataset.bunproState = 'learning';
        registerRenderedWordPrivateState(word, { cardState: 'learning', bunproState: 'learning' });

        setRenderedWordCardIdentity(word, renderedWordCard({
            source: 'jiten',
            cardState: ['mature'],
        }));

        expect(word.classList.contains('bunpro-learning')).toBe(false);
        expect(word.classList.contains('jpdb-learning')).toBe(false);
        expect(word.classList.contains('jpdb-mature')).toBe(true);
        expect(word.dataset.bunproState).toBeUndefined();
        expect(word.dataset.cardState).toBe('mature');
    });

    // Cluster I0: the public/pitch hydration cascade repaints with a card that
    // never carries authenticated SRS state. Before the guard it unconditionally
    // stamped not-in-deck, erasing a real jpdb-known word the instant pitch
    // landed ("pitch appears, status vanishes").
    it('does NOT downgrade an authoritative status when a provisional public card repaints it', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-known';
        word.dataset.vid = '1456360';
        word.dataset.sid = '3';
        word.dataset.cardSource = 'jpdb';
        word.dataset.cardId = '1456360';
        word.dataset.readingIndex = '3';
        word.dataset.cardState = 'known';
        word.dataset.stateProvenance = 'authoritative';
        registerRenderedWordPrivateState(word, {
            vid: '1456360',
            sid: '3',
            cardSource: 'jpdb',
            cardId: '1456360',
            readingIndex: '3',
            cardState: 'known',
            stateProvenance: 'authoritative',
        });

        setRenderedWordCardIdentity(word, renderedWordCard({
            source: 'jiten',
            provisionalState: true,
            cardState: ['not-in-deck'],
            reading: 'よむ',
            pitchAccent: ['LH'],
        }));

        // Status channel preserved.
        expect(word.dataset.cardState).toBe('known');
        expect(word.classList.contains('jpdb-known')).toBe(true);
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(false);
        expect(word.classList.contains('jiten-not-in-deck')).toBe(false);
        expect(word.dataset.cardSource).toBe('jiten');
        expect(word.dataset.cardId).toBe('1456360');
        expect(word.dataset.readingIndex).toBe('3');
        expect(word.dataset.stateProvenance).toBe('authoritative');
        // ...but the late pitch/reading identity still lands.
        expect(word.dataset.pitchAccent).toBe('LH');
        expect(word.dataset.reading).toBe('よむ');
    });

    it('protects a genuine authoritative not-in-deck from a provisional repaint', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jiten-not-in-deck';
        word.dataset.vid = '1456360';
        word.dataset.sid = '3';
        word.dataset.cardSource = 'jiten';
        word.dataset.cardState = 'not-in-deck';
        word.dataset.stateProvenance = 'authoritative';
        registerRenderedWordPrivateState(word, {
            vid: '1456360',
            sid: '3',
            cardSource: 'jiten',
            cardState: 'not-in-deck',
            stateProvenance: 'authoritative',
        });

        setRenderedWordCardIdentity(word, renderedWordCard({
            source: 'jiten',
            provisionalState: true,
            cardState: ['not-in-deck'],
            pitchAccent: ['LHH'],
        }));

        // Provenance stays authoritative so the backfill never re-requests it.
        expect(word.dataset.stateProvenance).toBe('authoritative');
        expect(word.dataset.pitchAccent).toBe('LHH');
    });

    it('still lets an authenticated card change status in both directions', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-known';
        word.dataset.vid = '1456360';
        word.dataset.sid = '3';
        word.dataset.cardSource = 'jpdb';
        word.dataset.cardState = 'known';
        word.dataset.stateProvenance = 'authoritative';

        // Authenticated card (no provisionalState) — a real review moved it down.
        setRenderedWordCardIdentity(word, renderedWordCard({ source: 'jiten', cardState: ['not-in-deck'] }));

        expect(word.dataset.cardState).toBe('not-in-deck');
        expect(word.classList.contains('jpdb-known')).toBe(false);
        expect(word.classList.contains('jiten-not-in-deck')).toBe(true);
        expect(word.dataset.stateProvenance).toBe('authoritative');
    });

    it('lets statePolicy replace force a provisional card to overwrite an authoritative state', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-known';
        word.dataset.cardState = 'known';
        word.dataset.stateProvenance = 'authoritative';

        setRenderedWordCardIdentity(word, renderedWordCard({
            source: 'jiten',
            provisionalState: true,
            cardState: ['not-in-deck'],
        }), { statePolicy: 'replace' });

        expect(word.dataset.cardState).toBe('not-in-deck');
        expect(word.dataset.stateProvenance).toBe('provisional');
    });

    it('stamps provenance from the card so a first render is classified correctly', () => {
        const authoritative = document.createElement('span');
        authoritative.className = 'jpdb-reader-word';
        setRenderedWordCardIdentity(authoritative, renderedWordCard({ source: 'jiten', cardState: ['learning'] }));
        expect(authoritative.dataset.stateProvenance).toBe('authoritative');

        const provisional = document.createElement('span');
        provisional.className = 'jpdb-reader-word';
        setRenderedWordCardIdentity(provisional, renderedWordCard({ source: 'jiten', provisionalState: true, cardState: ['not-in-deck'] }));
        expect(provisional.dataset.stateProvenance).toBe('provisional');
    });
});

describe('rendered word deck styling parity', () => {
    const deckStylingCases: Array<{ source: NonNullable<JPDBCard['source']>; deckFields: Partial<JPDBCard> }> = [
        { source: 'jpdb', deckFields: { deckNames: ['Mining'] } },
        { source: 'jiten', deckFields: { deckNames: ['Mining'], sourceDeckName: 'Mining' } },
        { source: 'anki', deckFields: { ankiDeckNames: ['Mining'] } },
    ];

    it.each(deckStylingCases)('stamps $source deck membership on reader words', ({ source, deckFields }) => {
        setInnerHtml(document.body, renderTokensToHtml('読む', [{
            card: renderedWordCard({
                source,
                cardState: ['in-deck'],
                ...deckFields,
            }),
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'unknown',
        }], DEFAULT_SETTINGS));

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('yomu-deck-member')).toBe(true);
        expect(word.classList.contains(`${source}-deck-member`)).toBe(true);
        expect(word.classList.contains('yomu-deck-mining')).toBe(true);
        expect(word.classList.contains(`${source}-deck-mining`)).toBe(true);
        expect(word.dataset.deckMember).toBe('true');
        expect(word.dataset.deckSource).toBe(source);
        expect(word.dataset.deckNames).toBe('Mining');
    });

    it('keeps merged Anki deck metadata on Anki deck classes', () => {
        setInnerHtml(document.body, renderTokensToHtml('読む', [{
            card: renderedWordCard({
                source: 'jpdb',
                cardState: ['known'],
                ankiDeckNames: ['Mining'],
            }),
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'unknown',
        }], DEFAULT_SETTINGS));

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('anki-deck-member')).toBe(true);
        expect(word.classList.contains('anki-deck-mining')).toBe(true);
        expect(word.classList.contains('jpdb-deck-member')).toBe(false);
        expect(word.dataset.deckSource).toBe('anki');
        expect(word.dataset.deckNames).toBe('Mining');
    });

    it('replaces stale provider deck styling when retargeting a rendered word', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word yomu-deck-member yomu-deck-old jiten-deck-member jiten-deck-old';
        word.dataset.deckMember = 'true';
        word.dataset.deckSource = 'jiten';
        word.dataset.deckNames = 'Old';

        setRenderedWordCardIdentity(word, renderedWordCard({
            source: 'jpdb',
            cardState: ['not-in-deck'],
            deckNames: [],
        }));

        expect(word.classList.contains('yomu-deck-member')).toBe(false);
        expect(word.classList.contains('yomu-deck-old')).toBe(false);
        expect(word.classList.contains('jiten-deck-member')).toBe(false);
        expect(word.classList.contains('jiten-deck-old')).toBe(false);
        expect(word.dataset.deckMember).toBeUndefined();
        expect(word.dataset.deckSource).toBeUndefined();
        expect(word.dataset.deckNames).toBeUndefined();
    });

    it('does not mutate an already exact local-SRS repaint', async () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        const card = renderedWordCard({ cardState: ['known'], reviewSource: 'yomu-local' });
        expect(applyLocalYomuSrsStateToRenderedWord(word, card)).toBe(true);
        const mutations: MutationRecord[] = [];
        const observer = new MutationObserver(records => mutations.push(...records));
        observer.observe(word, { attributes: true });

        expect(applyLocalYomuSrsStateToRenderedWord(word, card)).toBe(false);
        await Promise.resolve();
        observer.disconnect();

        expect(mutations).toEqual([]);
    });
});

function renderedWordCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1456360,
        sid: 3,
        rid: 0,
        source: 'jpdb',
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: 20215,
        partOfSpeech: ['v5m'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}
