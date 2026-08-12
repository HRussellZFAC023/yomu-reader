import type { JPDBCard, JPDBToken } from '../../../src/reader/app/types';
import { applyTokensToScanTarget, collectTextTargetsIn } from '../../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../../src/reader/settings';

export const MIRROR_TEXT = '日本語';

export function mirrorToken(spelling = MIRROR_TEXT, reading = 'にほんご'): JPDBToken {
    const length = spelling.length;
    const card: JPDBCard = {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
    return {
        card,
        start: 0,
        end: length,
        length,
        rubies: [{ text: reading, start: 0, end: length, length }],
        pitchClass: '',
        sentence: spelling,
    };
}

export function paintMirrorToken(host: HTMLElement, options: { forceInlineRender?: boolean; nonDestructive?: boolean } = {}): void {
    const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === MIRROR_TEXT);
    if (!target) throw new Error(`Expected a ${MIRROR_TEXT} text target`);
    applyTokensToScanTarget({ ...target, ...options }, [mirrorToken()], {
        ...DEFAULT_SETTINGS,
        furiganaMode: 'all',
    });
}

export function ocrToken(sentence: string): JPDBToken {
    const card: JPDBCard = {
        vid: 1,
        sid: 1,
        rid: 1,
        spelling: MIRROR_TEXT,
        reading: 'にほんご',
        frequencyRank: 1,
        partOfSpeech: ['n'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
    };
    return {
        card,
        start: 0,
        end: MIRROR_TEXT.length,
        length: MIRROR_TEXT.length,
        rubies: [],
        pitchClass: 'unknown',
        sentence,
    };
}
