import type { JPDBCard } from './types';

export function cardKey(card: JPDBCard): string {
    return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
}

export async function waitForInstantData<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
    let timeout = 0;
    return Promise.race([
        promise,
        new Promise<null>(resolve => {
            timeout = window.setTimeout(() => resolve(null), timeoutMs);
        }),
    ]).finally(() => window.clearTimeout(timeout));
}

export function createAudioPreviewCard(): JPDBCard {
    return {
        vid: 0,
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
        source: 'fallback',
    };
}
