import { shouldRenderRuby } from '../dom/index';
import { normalizedJapaneseCardReading } from './highlight';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';

function compactReading(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

export function isPlainReadingDuplicatedByVisibleRuby(
    card: Pick<JPDBCard, 'spelling' | 'reading' | 'cardState' | 'partOfSpeech'>,
    settings: ReaderSettings,
    plainReading: string,
): boolean {
    const spelling = card.spelling.trim();
    const normalizedPlainReading = compactReading(plainReading);
    if (!spelling || !normalizedPlainReading || normalizedPlainReading === compactReading(spelling)) return false;

    const rubyReading = normalizedJapaneseCardReading(spelling, card.reading).trim();
    if (!rubyReading || compactReading(rubyReading) !== normalizedPlainReading) return false;

    const token: JPDBToken = {
        card: { ...card, spelling, reading: rubyReading } as JPDBCard,
        start: 0,
        end: spelling.length,
        length: spelling.length,
        rubies: [],
        pitchClass: '',
        sentence: spelling,
    };
    return shouldRenderRuby(spelling, token, settings);
}
