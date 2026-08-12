import { describe, expect, it } from 'vitest';

import { renderTokensToHtml, setInnerHtml } from '../../src/reader/dom/index';
import { readRenderedWordPrivateState } from '../../src/reader/dom/rendered-word-private-state';
import { isPlainReadingRedundantForHeadword, renderCardSpellingWithFurigana } from '../../src/reader/cards/reading-display';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';

const JITEN_SETTINGS: ReaderSettings = {
    ...DEFAULT_SETTINGS,
    apiKey: '',
    jitenApiKey: 'jiten-key',
    ankiEnabled: false,
};

function expectSingleRenderedRuby(
    html: string,
    expectedSurface: string,
    expectedBase: string,
    expectedReading: string,
): void {
    setInnerHtml(document.body, html);
    const ruby = document.querySelector('ruby')!;

    expect(ruby.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe(expectedBase);
    expect(ruby.querySelector('rt')?.textContent).toBe(expectedReading);
    expect(document.body.textContent).toContain(expectedSurface);
}

describe('Jiten token rendering', () => {
    it('renders Jiten Young with generic colorable status and private provider state', () => {
        const html = renderJitenToken('読む', 'young', { furiganaMode: 'all' });

        setInnerHtml(document.body, html);
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        expect(word.classList.contains('jpdb-young')).toBe(true);
        expect(word.classList.contains('jiten-young')).toBe(false);
        expect(readRenderedWordPrivateState(word)).toMatchObject({ cardSource: 'jiten', cardState: 'young' });
        expect(word.querySelector('rt')?.textContent).toBe('よ');
    });

    it('hides Jiten known-family furigana in known-status mode (UT-47 default groups)', () => {
        for (const state of ['mature', 'mastered'] as const) {
            const html = renderJitenToken('読む', state, { furiganaMode: 'known-status' });

            expect(html).toContain(`jpdb-${state}`);
            expect(html).not.toContain(`jiten-${state}`);
            expect(html).not.toContain('<rt');
            expect(html).not.toContain('jpdb-reader-has-furi');
            setInnerHtml(document.body, html);
            expect(readRenderedWordPrivateState(document.querySelector<HTMLElement>('.jpdb-reader-word')!))
                .toMatchObject({ cardSource: 'jiten', cardState: state });
        }
        // Learning-family words keep their ruby unless the user opts the
        // "learning" group into hiding.
        expect(renderJitenToken('読む', 'young', { furiganaMode: 'known-status' })).toContain('<rt');
        expect(renderJitenToken('読む', 'young', { furiganaMode: 'known-status', furiganaHiddenStateGroups: ['learning'] })).not.toContain('<rt');
    });

    it('keeps legacy auto transparent even when Jiten status is available', () => {
        expect(renderJitenToken('読む', 'mature', { furiganaMode: 'auto' })).toContain('<rt');
        expect(renderJitenToken('読む', 'mastered', { furiganaMode: 'auto' })).toContain('<rt');
        expect(renderJitenToken('読む', 'mature', { furiganaMode: 'known-status' })).not.toContain('<rt');
    });

    it('renders ruby for every word in hover mode (visibility is CSS-driven)', () => {
        expect(renderJitenToken('読む', 'mastered', { furiganaMode: 'hover' })).toContain('<rt');
    });

    it('still shows Jiten ruby in all mode', () => {
        const html = renderJitenToken('読む', 'young', { furiganaMode: 'all' });

        expect(html).toContain('jpdb-reader-has-furi');
        expect(html).toContain('<rt class="jpdb-reader-furi">よ</rt>');
    });

    it('keeps Jiten deck membership generic on an offhost rendered word', () => {
        const html = renderJitenToken('読む', 'young', { furiganaMode: 'all' }, {
            deckNames: ['Yomu E2E Seed'],
        });

        setInnerHtml(document.body, html);
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        expect(word.classList.contains('yomu-deck-member')).toBe(true);
        expect(word.classList.contains('jiten-deck-member')).toBe(false);
        expect(word.classList.contains('yomu-deck-yomu-e2e-seed')).toBe(false);
        expect(word.classList.contains('jiten-deck-yomu-e2e-seed')).toBe(false);
        expect(word.dataset.deckMember).toBeUndefined();
        expect(word.dataset.deckSource).toBeUndefined();
        expect(word.dataset.deckNames).toBeUndefined();
        expect(readRenderedWordPrivateState(word)).toMatchObject({ cardSource: 'jiten' });
    });

    it('anchors full-surface ruby readings to the kanji inside kana-mixed tokens', () => {
        const html = renderTokensToHtml('あなた達', [{
            ...jitenToken('あなた達', 'young', {
                spelling: 'あなた達',
                reading: 'あなたたち',
            }),
            rubies: [{ text: 'たち', start: 0, end: 4, length: 4 }],
        }], { ...JITEN_SETTINGS, furiganaMode: 'all' });

        expectSingleRenderedRuby(html, 'あなた達', '達', 'たち');
    });

    it('anchors popup wordWithReading ruby to 達 instead of all of あなた達', () => {
        const html = renderCardSpellingWithFurigana({
            ...jitenCard('young'),
            spelling: 'あなた達',
            reading: 'あなたたち',
            wordWithReading: 'あなた達[たち]',
        }, { ...JITEN_SETTINGS, furiganaMode: 'all' });

        expectSingleRenderedRuby(html, 'あなた達', '達', 'たち');
    });

    it('binds bracket readings to the trailing kanji run across interleaved kana', () => {
        const card = {
            ...jitenCard('young'),
            spelling: '並べ替え',
            reading: 'ならべかえ',
            wordWithReading: '並[なら]べ替[か]え',
        };
        const html = renderCardSpellingWithFurigana(card, { ...JITEN_SETTINGS, furiganaMode: 'all' });

        document.body.innerHTML = html;
        const bases = [...document.querySelectorAll('.jpdb-reader-ruby-base')].map(base => base.textContent);
        const readings = [...document.querySelectorAll('rt')].map(rt => rt.textContent);

        expect(bases).toEqual(['並', '替']);
        expect(readings).toEqual(['なら', 'か']);
        // The furigana already spells out the reading, so the plain kana
        // duplicate beside the headword must be suppressed.
        expect(isPlainReadingRedundantForHeadword(card, { ...JITEN_SETTINGS, furiganaMode: 'all' }, 'ならべかえ')).toBe(true);
    });

    it('keeps lookup headword readings in ruby even when page furigana is disabled', () => {
        const card = {
            ...jitenCard('young'),
            spelling: '説明',
            reading: 'せつめい',
            wordWithReading: '説明[せつめい]',
        };
        const settings = { ...JITEN_SETTINGS, showFurigana: false, furiganaMode: 'off' as const };

        document.body.innerHTML = renderCardSpellingWithFurigana(card, settings);

        expect(document.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('説明');
        expect(document.querySelector('rt.jpdb-reader-furi')?.textContent).toBe('せつめい');
        expect(isPlainReadingRedundantForHeadword(card, settings, 'せつめい')).toBe(true);
    });
});

// The scan/subtitle render path (renderTokensToHtml) must segment-pair furigana
// exactly per the rubies the dictionary attests: one <ruby> base per per-position
// reading, and a single whole-run base when only a merged reading exists. This is
// the invariant that both fixes the 技 術 wedge (a per-kanji run never stretches a
// base under a wider whole-word reading) AND protects the 1.6.245 trailing-kanji
// binding — a merged run is NEVER guessed apart (jukujikun, or a server that only
// sends 技術[ぎじゅつ]).
describe('scan-word furigana segment pairing', () => {
    function rubyToken(surface: string, rubies: JPDBToken['rubies'], reading: string): JPDBToken {
        return {
            card: { ...jitenCard('young'), spelling: surface, reading, wordWithReading: null },
            start: 0,
            end: surface.length,
            length: surface.length,
            rubies,
            pitchClass: 'unknown',
            sentence: surface,
        };
    }

    function renderedRuby(surface: string, token: JPDBToken): { bases: (string | null)[]; readings: (string | null)[] } {
        setInnerHtml(document.body, renderTokensToHtml(surface, [token], { ...JITEN_SETTINGS, furiganaMode: 'all' }));
        return {
            bases: [...document.querySelectorAll('.jpdb-reader-ruby-base')].map(base => base.textContent),
            readings: [...document.querySelectorAll('rt')].map(rt => rt.textContent),
        };
    }

    it('renders per-position kanji rubies as one paired base+rt each (no wedged run)', () => {
        // 技[ぎ]術[じゅつ]: dictionary evidence exists for each kanji, so each kanji
        // carries its own reading and neither base is stretched under ぎじゅつ.
        const token = rubyToken('技術', [
            { text: 'ぎ', start: 0, end: 1, length: 1 },
            { text: 'じゅつ', start: 1, end: 2, length: 1 },
        ], 'ぎじゅつ');

        expect(renderedRuby('技術', token)).toEqual({ bases: ['技', '術'], readings: ['ぎ', 'じゅつ'] });
    });

    it('keeps a merged adjacent-kanji reading as one whole-run base (never a guessed split)', () => {
        // Only a whole-run reading is attested (no per-kanji evidence). Splitting
        // it would be a guess — the exact class of bug that duplicated kana in
        // reference injectors — so the run stays one base under one rt.
        const token = rubyToken('技術', [{ text: 'ぎじゅつ', start: 0, end: 2, length: 2 }], 'ぎじゅつ');

        expect(renderedRuby('技術', token)).toEqual({ bases: ['技術'], readings: ['ぎじゅつ'] });
    });

    it('keeps a jukujikun reading spanning the run as one base', () => {
        // 昨日/きのう has no per-kanji decomposition; the reading spans the run.
        const token = rubyToken('昨日', [{ text: 'きのう', start: 0, end: 2, length: 2 }], 'きのう');

        expect(renderedRuby('昨日', token)).toEqual({ bases: ['昨日'], readings: ['きのう'] });
    });

    it('binds interleaved-kana kanji rubies to their own kanji (並べ替え stays paired)', () => {
        // Guards the 1.6.245 trailing-kanji-run fix through the scan path too:
        // 並[なら]…替[か] must not spill kana onto the wrong kanji.
        const token = rubyToken('並べ替え', [
            { text: 'なら', start: 0, end: 1, length: 1 },
            { text: 'か', start: 2, end: 3, length: 1 },
        ], 'ならべかえ');

        expect(renderedRuby('並べ替え', token)).toEqual({ bases: ['並', '替'], readings: ['なら', 'か'] });
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
