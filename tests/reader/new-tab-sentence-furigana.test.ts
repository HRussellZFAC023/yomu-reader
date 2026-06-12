import { describe, expect, it } from 'vitest';

import { renderNewTabSentenceHtml } from '../../src/reader/newtab/card-view';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';

// UT-22: the study page is an SRS surface — sentence words the user already
// knows (known / mature / never-forget) must not carry furigana even when
// the global furigana mode is "all".
describe('new tab study sentence furigana', () => {
    it('hides furigana for known-status words even in all mode', () => {
        for (const state of ['known', 'mature', 'never-forget'] as const) {
            const html = renderSentence(state, 'all');

            expect(html).toContain('jpdb-reader-word');
            expect(html).not.toContain('<rt');
            expect(html).not.toContain('jpdb-reader-has-furi');
        }
    });

    it('keeps furigana for unknown words in all mode', () => {
        for (const state of ['not-in-deck', 'new', 'learning'] as const) {
            expect(renderSentence(state, 'all')).toContain('<rt class="jpdb-reader-furi">わたし</rt>');
        }
    });

    it('leaves stricter explicit modes untouched', () => {
        expect(renderSentence('not-in-deck', 'off')).not.toContain('<rt');
        expect(renderSentence('never-forget', 'known-status')).not.toContain('<rt');
    });
});

function renderSentence(state: CardState, furiganaMode: ReaderSettings['furiganaMode']): string {
    const sentence = '私は読む。';
    const target = sentenceCard(99, '読む', 'よむ', 'not-in-deck');
    const token = sentenceToken(sentenceCard(42, '私', 'わたし', state), 0, 1, sentence);
    return renderNewTabSentenceHtml(sentence, target, { ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', furiganaMode }, [token]);
}

function sentenceToken(card: JPDBCard, start: number, end: number, sentence: string): JPDBToken {
    return {
        card,
        start,
        end,
        length: end - start,
        rubies: [{ text: card.reading, start, end, length: end - start }],
        pitchClass: 'heiban',
        sentence,
    };
}

function sentenceCard(vid: number, spelling: string, reading: string, state: CardState): JPDBCard {
    return {
        vid,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: 100,
        partOfSpeech: ['pn'],
        meanings: [{ glosses: ['I'], partOfSpeech: ['pn'] }],
        cardState: [state],
        pitchAccent: ['LH'],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
    };
}
