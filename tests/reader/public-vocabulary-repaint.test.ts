import { describe, expect, it } from 'vitest';

import { applyPublicVocabularyFurigana } from '../../src/reader/app/dom-helpers';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { readerWordSurfaceText } from '../../src/reader/dom/index';
import { setRenderedWordCardIdentity } from '../../src/reader/dom/rendered-word-state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 11,
        sid: 22,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['known'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        ...overrides,
    };
}

describe('public vocabulary repaint', () => {
    it('updates state classes and removes stale furigana when a reviewed word enters a hidden group', () => {
        document.body.innerHTML = `
            <span class="jpdb-reader-word jpdb-learning jiten-learning jpdb-reader-has-furi jpdb-reader-i-plus-one" data-vid="11" data-sid="22" data-card-state="learning" data-expression="読む" data-mining-insight="i-plus-one">
                <ruby><span class="jpdb-reader-ruby-base">読</span><rt class="jpdb-reader-furi">よ</rt></ruby>む
            </span>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const reviewed = card({ cardState: ['known'] });
        const settings = {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'known-status' as const,
            furiganaHiddenStateGroups: ['known'] as ReaderSettings['furiganaHiddenStateGroups'],
        };

        setRenderedWordCardIdentity(word, reviewed);
        applyPublicVocabularyFurigana(word, reviewed, settings);

        expect(word.dataset.cardState).toBe('known');
        expect(word.classList.contains('jpdb-known')).toBe(true);
        expect(word.classList.contains('jiten-known')).toBe(true);
        expect(word.classList.contains('jpdb-learning')).toBe(false);
        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(false);
        expect(word.classList.contains('jpdb-reader-i-plus-one')).toBe(false);
        expect(word.dataset.miningInsight).toBeUndefined();
        expect(word.querySelector('rt')).toBeNull();
        expect(readerWordSurfaceText(word)).toBe('読む');
    });

    it('keeps existing furigana when the policy still allows it and fresh lookup data cannot add new ruby', () => {
        document.body.innerHTML = `
            <span class="jpdb-reader-word jpdb-learning jpdb-reader-has-furi" data-vid="11" data-sid="22" data-card-state="learning" data-expression="読む">
                <ruby><span class="jpdb-reader-ruby-base">読</span><rt class="jpdb-reader-furi">よ</rt></ruby>む
            </span>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const sparse = card({ cardState: ['learning'], reading: '' });

        applyPublicVocabularyFurigana(word, sparse, {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'known-status',
            furiganaHiddenStateGroups: ['known'],
        });

        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(word.querySelector('rt')?.textContent).toBe('よ');
    });

    it('normalizes OCR words and clears the line furigana flag only after the last ruby is removed', () => {
        document.body.innerHTML = `
            <div class="jpdb-ocr-line" data-has-furi="true">
                <span class="jpdb-ocr-line-text">
                    <span class="jpdb-reader-word jpdb-learning jpdb-reader-has-furi" data-vid="11" data-sid="22" data-expression="読む">
                        <span class="jpdb-ocr-ruby"><span class="jpdb-ocr-ruby-base"><span class="jpdb-ocr-furi">よ</span><span class="jpdb-ocr-ruby-base-text">読</span></span></span><span class="jpdb-ocr-plain">む</span>
                    </span>
                    <span class="jpdb-reader-word jpdb-learning jpdb-reader-has-furi" data-vid="33" data-sid="44" data-expression="書く">
                        <span class="jpdb-ocr-ruby"><span class="jpdb-ocr-ruby-base"><span class="jpdb-ocr-furi">か</span><span class="jpdb-ocr-ruby-base-text">書</span></span></span><span class="jpdb-ocr-plain">く</span>
                    </span>
                </span>
            </div>
        `;
        const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
        const [first, second] = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
        const settings = {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'known-status' as const,
            furiganaHiddenStateGroups: ['known'] as ReaderSettings['furiganaHiddenStateGroups'],
        };

        applyPublicVocabularyFurigana(first!, card({ cardState: ['known'] }), settings);

        expect(first!.classList.contains('jpdb-reader-has-furi')).toBe(false);
        expect(first!.querySelector('.jpdb-ocr-furi')).toBeNull();
        expect(first!.querySelector('.jpdb-ocr-plain')?.textContent).toBe('読む');
        expect(line.dataset.hasFuri).toBe('true');

        applyPublicVocabularyFurigana(second!, card({
            vid: 33,
            sid: 44,
            spelling: '書く',
            reading: 'かく',
            cardState: ['known'],
        }), settings);

        expect(second!.classList.contains('jpdb-reader-has-furi')).toBe(false);
        expect(second!.querySelector('.jpdb-ocr-furi')).toBeNull();
        expect(second!.querySelector('.jpdb-ocr-plain')?.textContent).toBe('書く');
        expect(line.dataset.hasFuri).toBeUndefined();
    });
});
