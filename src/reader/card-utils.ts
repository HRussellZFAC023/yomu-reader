import type { JPDBCard } from './types';

export function cardKey(card: JPDBCard): string {
    return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
}

export function createAudioPreviewCard(): JPDBCard {
    return {
        vid: 1456360,
        sid: 0,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: [],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}
