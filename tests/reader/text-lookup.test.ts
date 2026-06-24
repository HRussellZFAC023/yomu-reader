import { describe, expect, it, vi } from 'vitest';

import {
    createTextLookupDisplayContext,
    lookupRenderedSelection,
    type TextLookupDisplayState,
} from '../../src/reader/main/text-lookup';
import type { JPDBCard } from '../../src/reader/app/types';

const HOVER_DISPLAY_STATE: TextLookupDisplayState = {
    defaultTrigger: 'hover',
    hasActivePopover: true,
    previousNavigationEntry: () => undefined,
};

const CARD: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '今日',
    reading: 'きょう',
    frequencyRank: 100,
    partOfSpeech: ['n'],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
};

describe('text lookup display context', () => {
    it('opens selection lookups as modal lookups even when a hover popover is active', () => {
        expect(createTextLookupDisplayContext('今日', { source: 'selection' }, HOVER_DISPLAY_STATE))
            .toEqual(expect.objectContaining({ trigger: 'modal', focusOnMount: false }));
        expect(createTextLookupDisplayContext('今日', {}, HOVER_DISPLAY_STATE))
            .toEqual(expect.objectContaining({ trigger: 'hover' }));
    });

    it('keeps rendered selection lookups modal instead of inheriting hover state', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.expression = '今日';
        word.dataset.sentence = '今日は静かです。';
        word.textContent = '今日';
        document.body.append(word);

        const range = document.createRange();
        range.selectNodeContents(word);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);

        const showCard = vi.fn();
        const showTokenList = vi.fn();

        try {
            expect(lookupRenderedSelection('今日', {
                cardForRenderedWord: () => CARD,
                displayState: HOVER_DISPLAY_STATE,
                fallbackCardFromText: () => CARD,
                lookupableReaderWords: () => [word],
                renderedWordSentence: () => '今日は静かです。',
                showCard,
                showTokenList,
            })).toBe(true);

            expect(showTokenList).not.toHaveBeenCalled();
            expect(showCard).toHaveBeenCalledWith(
                CARD,
                '今日は静かです。',
                word,
                expect.objectContaining({ trigger: 'modal', focusOnMount: false }),
            );
        } finally {
            selection.removeAllRanges();
            document.body.replaceChildren();
        }
    });
});
