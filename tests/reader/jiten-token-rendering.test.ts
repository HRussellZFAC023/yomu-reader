import { describe, expect, it } from 'vitest';

import { renderTokensToHtml } from '../../src/reader/dom/index';
import { renderCardSpellingWithFurigana } from '../../src/reader/cards/reading-display';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';

const JITEN_SETTINGS: ReaderSettings = {
    ...DEFAULT_SETTINGS,
    apiKey: '',
    jitenApiKey: 'jiten-key',
    ankiEnabled: false,
};

describe('Jiten token rendering', () => {
    it('renders Jiten Young with provider and colorable status classes', () => {
        const html = renderJitenToken('読む', 'young', { furiganaMode: 'all' });

        document.body.innerHTML = html;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        expect(word.classList.contains('jpdb-young')).toBe(true);
        expect(word.classList.contains('jiten-young')).toBe(true);
        expect(word.dataset.cardSource).toBe('jiten');
        expect(word.dataset.cardState).toBe('young');
        expect(word.querySelector('rt')?.textContent).toBe('よ');
    });

    it('hides Jiten known-family furigana in known-status mode (UT-47 default groups)', () => {
        for (const state of ['mature', 'mastered'] as const) {
            const html = renderJitenToken('読む', state, { furiganaMode: 'known-status' });

            expect(html).toContain(`jpdb-${state}`);
            expect(html).toContain(`jiten-${state}`);
            expect(html).not.toContain('<rt');
            expect(html).not.toContain('jpdb-reader-has-furi');
        }
        // Learning-family words keep their ruby unless the user opts the
        // "learning" group into hiding.
        expect(renderJitenToken('読む', 'young', { furiganaMode: 'known-status' })).toContain('<rt');
        expect(renderJitenToken('読む', 'young', { furiganaMode: 'known-status', furiganaHiddenStateGroups: ['learning'] })).not.toContain('<rt');
    });

    it('uses Jiten credentials to hide user-known furigana in auto mode', () => {
        expect(renderJitenToken('読む', 'mature', { furiganaMode: 'auto' })).not.toContain('<rt');
        expect(renderJitenToken('読む', 'mastered', { furiganaMode: 'auto' })).not.toContain('<rt');
    });

    it('renders ruby for every word in hover mode (visibility is CSS-driven)', () => {
        expect(renderJitenToken('読む', 'mastered', { furiganaMode: 'hover' })).toContain('<rt');
    });

    it('still shows Jiten ruby in all mode', () => {
        const html = renderJitenToken('読む', 'young', { furiganaMode: 'all' });

        expect(html).toContain('jpdb-reader-has-furi');
        expect(html).toContain('<rt class="jpdb-reader-furi">よ</rt>');
    });

    it('stamps Jiten deck membership on rendered words for deck-based styling', () => {
        const html = renderJitenToken('読む', 'young', { furiganaMode: 'all' }, {
            deckNames: ['Yomu E2E Seed'],
        });

        document.body.innerHTML = html;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        expect(word.classList.contains('yomu-deck-member')).toBe(true);
        expect(word.classList.contains('jiten-deck-member')).toBe(true);
        expect(word.classList.contains('yomu-deck-yomu-e2e-seed')).toBe(true);
        expect(word.classList.contains('jiten-deck-yomu-e2e-seed')).toBe(true);
        expect(word.dataset.deckMember).toBe('true');
        expect(word.dataset.deckSource).toBe('jiten');
        expect(word.dataset.deckNames).toBe('Yomu E2E Seed');
    });

    it('anchors full-surface ruby readings to the kanji inside kana-mixed tokens', () => {
        const html = renderTokensToHtml('あなた達', [{
            ...jitenToken('あなた達', 'young', {
                spelling: 'あなた達',
                reading: 'あなたたち',
            }),
            rubies: [{ text: 'たち', start: 0, end: 4, length: 4 }],
        }], { ...JITEN_SETTINGS, furiganaMode: 'all' });

        document.body.innerHTML = html;
        const ruby = document.querySelector('ruby')!;

        expect(ruby.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('達');
        expect(ruby.querySelector('rt')?.textContent).toBe('たち');
        expect(document.body.textContent).toContain('あなた達');
    });

    it('anchors popup wordWithReading ruby to 達 instead of all of あなた達', () => {
        const html = renderCardSpellingWithFurigana({
            ...jitenCard('young'),
            spelling: 'あなた達',
            reading: 'あなたたち',
            wordWithReading: 'あなた達[たち]',
        }, { ...JITEN_SETTINGS, furiganaMode: 'all' });

        document.body.innerHTML = html;
        const ruby = document.querySelector('ruby')!;

        expect(ruby.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('達');
        expect(ruby.querySelector('rt')?.textContent).toBe('たち');
        expect(document.body.textContent).toContain('あなた達');
    });
});

function renderJitenToken(surface: string, state: CardState, settings: Partial<ReaderSettings>, cardOverrides: Partial<JPDBCard> = {}): string {
    return renderTokensToHtml(surface, [jitenToken(surface, state, cardOverrides)], { ...JITEN_SETTINGS, ...settings });
}

function jitenToken(surface: string, state: CardState, cardOverrides: Partial<JPDBCard> = {}): JPDBToken {
    return {
        card: { ...jitenCard(state), ...cardOverrides },
        start: 0,
        end: surface.length,
        length: surface.length,
        rubies: [{ text: 'よむ', start: 0, end: surface.length, length: surface.length }],
        pitchClass: 'heiban',
        sentence: surface,
    };
}

function jitenCard(state: CardState): JPDBCard {
    return {
        vid: 42,
        sid: 0,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: 400,
        partOfSpeech: ['v5m'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        cardState: [state],
        pitchAccent: ['LH'],
        wordWithReading: null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: 42,
        jitenReadingIndex: 0,
    };
}
