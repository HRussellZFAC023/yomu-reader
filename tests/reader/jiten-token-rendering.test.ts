import { describe, expect, it } from 'vitest';

import { renderTokensToHtml } from '../../src/reader/dom/index';
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
});

function renderJitenToken(surface: string, state: CardState, settings: Partial<ReaderSettings>): string {
    return renderTokensToHtml(surface, [jitenToken(surface, state)], { ...JITEN_SETTINGS, ...settings });
}

function jitenToken(surface: string, state: CardState): JPDBToken {
    return {
        card: jitenCard(state),
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
