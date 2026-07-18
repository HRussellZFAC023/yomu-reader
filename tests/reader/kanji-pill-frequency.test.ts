import { describe, expect, it } from 'vitest';
import { kanjiFrequencyRanks } from '../../src/reader/cards/frequency-ranks';
import { updateHeadingWordPills } from '../../src/reader/sources/word-pills';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard } from '../../src/reader/app/types';

function kanjiCard(): JPDBCard {
    return {
        vid: 1463520,
        sid: 0,
        rid: 0,
        spelling: '肉',
        reading: 'にく',
        frequencyRank: 1250,
        partOfSpeech: ['n'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        sentence: '肉',
    } as unknown as JPDBCard;
}

// The kanji popover shell renders its pills inside .jpdb-reader-heading and the
// detail hooks refresh them via updateHeadingWordPills once each provider's
// kanji info arrives (main.ts renderKanjiDetailsInto, newtab runtime
// renderKanjiLookupDetails). This drives that update against the shell markup.
function kanjiShellPopover(): HTMLElement {
    const popover = document.createElement('div');
    popover.innerHTML = `
        <div class="jpdb-reader-heading">
            <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                <div class="jpdb-reader-kanji-display">肉</div>
                <div class="jpdb-reader-word-pills"></div>
            </div>
        </div>
    `;
    document.body.append(popover);
    return popover;
}

describe('kanji popover pill frequency update', () => {
    it('folds each provider kanji rank into the heading pills', () => {
        const popover = kanjiShellPopover();
        updateHeadingWordPills(popover, {
            card: kanjiCard(),
            jpdbUrl: 'https://jpdb.io/kanji/%E8%82%89',
            settings: DEFAULT_SETTINGS,
            metaEntries: [],
            overrideQuery: '肉',
            frequencyRanks: kanjiFrequencyRanks('肉', 516, 'Top 300-400'),
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });

        const pills = popover.querySelector('.jpdb-reader-word-pills')?.textContent ?? '';
        expect(pills).toContain('Jiten #516');
        expect(pills).toContain('JPDB Top 300-400');
        popover.remove();
    });

    it('leaves pills rank-free when neither provider reports a kanji rank', () => {
        const ranks = kanjiFrequencyRanks('肉', null, '');
        expect(ranks).toEqual({});
    });
});
