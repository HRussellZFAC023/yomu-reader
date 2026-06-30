import { describe, expect, it } from 'vitest';
import { renderWordPills } from '../../src/reader/sources/word-pills';
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
    it('stays hidden by default', () => {
        expect(renderPills(settingsWithBunproPill(false))).not.toContain('>Bunpro ');
    });

    it('renders as an enabled lookup pill with Bunpro URL and color token', () => {
        const html = renderPills(settingsWithBunproPill(true));

        expect(html).toContain('>Bunpro ');
        expect(html).toContain('href="https://bunpro.jp/search?query=%E9%A3%9F%E3%81%B9%E3%82%8B"');
        expect(html).toContain('--chip-bg:#be3455');
        expect(html).toContain('--chip-border:#fb7185');
    });
});
