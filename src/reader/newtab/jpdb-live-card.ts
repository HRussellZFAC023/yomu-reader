import type { JPDBCard } from '../app/types';
import type { JpdbReviewBridgeCard } from '../jpdb/jpdb-review-bridge';
import { normalizedJapaneseCardReading } from '../cards/highlight';
import { cardKey } from '../cards/utils';

const LIVE_REVIEW_CARD_ID = /^v[a-z]?,(\d+),(\d+)$/;

export function liveJpdbCardIdentity(card: JPDBCard): string {
    return card.jpdbReviewId || cardKey(card);
}

export function liveJpdbCardFromBridgeCard(card: JpdbReviewBridgeCard, spelling: string): JPDBCard {
    const { vid, sid } = cardReviewIds(card);
    return {
        vid,
        sid,
        rid: 0,
        spelling,
        reading: cardReading(card, spelling),
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: cardGlosses(card), partOfSpeech: [] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        sentence: cardSentence(card),
        reviewSource: 'jpdb-live',
        jpdbReviewId: card.id,
        kanjiKeyword: cardKeyword(card),
        jpdbDeckMembership: card.deckMembership,
    };
}

// The review URL's c= parameter ('vf,<vid>,<sid>') rides on the bridge card
// id; real ids let the API read the card's post-grade state back.
function cardReviewIds(card: JpdbReviewBridgeCard): { vid: number; sid: number } {
    const match = LIVE_REVIEW_CARD_ID.exec(card.id ?? '');
    if (!match) return { vid: 0, sid: 0 };
    return { vid: Number(match[1]), sid: Number(match[2]) };
}

function cardReading(card: JpdbReviewBridgeCard, spelling: string): string {
    return normalizedJapaneseCardReading(spelling, card.reading || spelling);
}

function cardGlosses(card: JpdbReviewBridgeCard): string[] {
    return card.kind === 'kanji' ? [cardKeyword(card)].filter(Boolean) : [];
}

function cardSentence(card: JpdbReviewBridgeCard): string {
    return card.sentence || card.prompt;
}

function cardKeyword(card: JpdbReviewBridgeCard): string {
    return card.keyword || card.prompt;
}
