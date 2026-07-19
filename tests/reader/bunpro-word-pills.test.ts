import { describe, expect, it } from 'vitest';
import { renderWordPills } from '../../src/reader/sources/word-pills';
import { bunproFrequencyRank } from '../../src/reader/cards/frequency-ranks';
import { DEFAULT_SETTINGS, defaultDictionaryLookupLinks } from '../../src/reader/settings';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

const card: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '食べる',
    reading: 'たべる',
    frequencyRank: null,
    partOfSpeech: ['verb'],
    meanings: [{ glosses: ['to eat'], partOfSpeech: ['verb'] }],
    cardState: ['new'],
    pitchAccent: [],
    wordWithReading: null,
};

function settingsWithBunproPill(enabled: boolean): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        dictionaryLookupLinks: defaultDictionaryLookupLinks('local').map(link =>
            link.id === 'bunpro' ? { ...link, enabled } : link,
        ),
    };
}

function renderPills(settings: ReaderSettings): string {
    return renderWordPills({
        card,
        jpdbUrl: 'https://jpdb.io/vocabulary/1/食べる/たべる',
        settings,
        isJpdbBackedCard: () => false,
        dictionaryLabel: name => name,
    });
}

describe('Bunpro lookup pill', () => {
    it('can be disabled explicitly', () => {
        expect(renderPills(settingsWithBunproPill(false))).not.toContain('>Bunpro ');
    });

    it('is enabled for fresh installs alongside Jiten and JPDB', () => {
        const defaults = defaultDictionaryLookupLinks('local');
        expect(defaults.find(link => link.id === 'bunpro')?.enabled).toBe(true);
        expect(renderPills({ ...DEFAULT_SETTINGS, dictionaryLookupLinks: defaults })).toContain('>Bunpro ');
    });

    it('renders as an enabled lookup pill with Bunpro URL and color token', () => {
        const html = renderPills(settingsWithBunproPill(true));

        expect(html).toContain('>Bunpro ');
        expect(html).toContain('href="https://bunpro.jp/search?query=%E9%A3%9F%E3%81%B9%E3%82%8B"');
        expect(html).toContain('--chip-bg:#be3455');
        expect(html).toContain('--chip-border:#fb7185');
    });
});

describe('Bunpro multi-list frequency pills', () => {
    const frequencies = [
        { list: 'anime', rank: 793 },
        { list: 'novels', rank: 6182 },
        { list: 'netflix', rank: 778 },
        { list: 'dictionary', rank: 40271 },
    ];

    function renderWithBunproRank(settings: ReaderSettings = settingsWithBunproPill(true)): string {
        const rank = bunproFrequencyRank(card, { expression: card.spelling, reading: card.reading, frequencies });
        return renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1/食べる/たべる',
            settings,
            frequencyRanks: rank ? { bunpro: rank } : {},
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
    }

    it('merges the primary rank inline on the Bunpro pill, one number wide', () => {
        const html = renderWithBunproRank();
        expect(html).toContain('>Bunpro #40271 ');
        // No standalone corpus pills bloating the row.
        expect(html).not.toContain('jpdb-reader-bunpro-frequency-pill');
        expect(html).not.toContain('>Dictionary #40,271</span>');
    });

    it('carries the per-corpus breakdown in the Bunpro pill tooltip', () => {
        const html = renderWithBunproRank();
        expect(html).toContain('Dictionary #40,271');
        expect(html).toContain('Anime #793');
        expect(html).toContain('Novels #6,182');
        expect(html).toContain('Netflix #778');
        // Breakdown lives on the link pill itself (title attribute), so it
        // must appear before the pill body closes.
        const pill = html.slice(html.indexOf('href="https://bunpro.jp/search'));
        expect(pill.slice(0, pill.indexOf('</a>'))).toContain('Anime #793');
    });

    it('shows no rank when the bunpro-frequency link is disabled', () => {
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            dictionaryLookupLinks: defaultDictionaryLookupLinks('local').map(link =>
                link.id === 'bunpro-frequency' ? { ...link, enabled: false } : link,
            ),
        };
        const html = renderWithBunproRank(settings);
        expect(html).toContain('>Bunpro ');
        expect(html).not.toContain('>Bunpro #');
        expect(html).not.toContain('Anime #793');
    });

    it('localizes the tooltip corpus labels in Japanese mode', () => {
        const html = renderWithBunproRank({ ...settingsWithBunproPill(true), interfaceLanguage: 'ja' });
        expect(html).toContain('辞書 #40,271');
        expect(html).toContain('アニメ #793');
        expect(html).toContain('小説 #6,182');
        expect(html).not.toContain('未翻訳');
    });

    it('returns null evidence when every list is null', () => {
        expect(bunproFrequencyRank(card, { expression: card.spelling, reading: card.reading, frequencies: [] })).toBeNull();
        expect(bunproFrequencyRank(card, null)).toBeNull();
    });

    it('prefers the general list as primary when populated', () => {
        const rank = bunproFrequencyRank(card, {
            expression: card.spelling,
            reading: card.reading,
            frequencies: [{ list: 'anime', rank: 188 }, { list: 'general', rank: 178 }],
        });
        expect(rank?.rank).toBe(178);
        expect(rank?.lists).toHaveLength(2);
    });
});
