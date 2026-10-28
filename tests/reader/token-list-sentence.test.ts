import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTokenListHtml } from '../../src/reader/main/token-list';
import { CardPopoverRenderer, type CardPopoverRendererDependencies } from '../../src/reader/cards/popover-renderer';
import type { CardRenderData } from '../../src/reader/cards/render-data';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { readTokenChoiceCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { setInnerHtml } from '../../src/reader/dom/html';

const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');
const NORMALIZED_POPOVER_CSS = POPOVER_CORE_CSS.replace(/\s+/g, ' ');

function testCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 3,
        spelling: '食べる',
        reading: 'たべる',
        frequencyRank: 100,
        partOfSpeech: ['v1'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: ['LHH'],
        wordWithReading: null,
        ...overrides,
    } as JPDBCard;
}

function token(overrides: Partial<JPDBToken> & { card: JPDBCard }): JPDBToken {
    return {
        start: 0,
        end: overrides.card.spelling.length,
        length: overrides.card.spelling.length,
        rubies: [],
        pitchClass: '',
        sentence: '',
        ...overrides,
    } as JPDBToken;
}

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return { ...DEFAULT_SETTINGS, showPitchAccent: true, ...overrides };
}

function renderStrip(tokens: JPDBToken[], selected: string, extra: Partial<ReaderSettings> = {}): HTMLElement {
    const wrapper = document.createElement('div');
    setInnerHtml(wrapper, renderTokenListHtml(tokens, selected, undefined, settings(extra)));
    return wrapper;
}

function tokenChoice(root: ParentNode, vid: number): HTMLButtonElement {
    return [...root.querySelectorAll<HTMLButtonElement>('button[data-token-choice]')]
        .find(button => readTokenChoiceCommandCapability(button)?.vid === vid)!;
}

describe('token list sentence strip', () => {
    const selected = '毎日50ページ読んだ';
    const tokens = [
        token({ card: testCard({ vid: 11, sid: 11, spelling: '毎日', reading: 'まいにち' }), start: 0, end: 2, pitchClass: 'heiban' }),
        token({ card: testCard({ vid: 12, sid: 12, spelling: 'ページ', reading: 'ページ', pitchAccent: [] }), start: 4, end: 7 }),
        token({ card: testCard({ vid: 13, sid: 13, spelling: '読む', reading: 'よむ', pitchAccent: ['HL'], cardState: ['known'] }), start: 7, end: 10 }),
    ];

    it('renders tokens inline in one flowing sentence container instead of stacked rows', () => {
        const wrapper = renderStrip(tokens, selected);
        const strip = wrapper.querySelector<HTMLElement>('.jpdb-reader-meanings.jpdb-reader-token-sentence')!;
        expect(strip).not.toBeNull();
        const buttons = [...strip.querySelectorAll<HTMLButtonElement>('button[data-token-choice]')];
        expect(buttons.map(button => readTokenChoiceCommandCapability(button)?.vid)).toEqual([11, 12, 13]);
        buttons.forEach(button => expect(button.dataset.vid).toBeUndefined());
        // The strip flows as a sentence (block container of inline words), not
        // the stacked full-width grid used for dictionary meanings.
        expect(NORMALIZED_POPOVER_CSS).toContain('.jpdb-reader-meanings.jpdb-reader-token-sentence { display: block;');
        expect(NORMALIZED_POPOVER_CSS).toContain('button.jpdb-reader-token-sentence-word { display: inline;');
        buttons.forEach(button => expect(button.classList.contains('jpdb-reader-btn')).toBe(false));
    });

    it('preserves non-Japanese gap text like numbers in reading order', () => {
        const strip = renderStrip(tokens, selected).querySelector<HTMLElement>('.jpdb-reader-token-sentence')!;
        expect(strip.textContent).toContain('50');
        // Reading order preserved: 毎日, then the 50 gap, then ページ.
        const text = strip.textContent!.replace(/\s+/g, '');
        expect(text.indexOf('毎日')).toBeLessThan(text.indexOf('50'));
        expect(text.indexOf('50')).toBeLessThan(text.indexOf('ページ'));
        expect(strip.querySelector('.jpdb-reader-token-sentence-gap')?.textContent).toBe('50');
    });

    it('keeps the conjugated surface from the sentence for dictionary-form tokens', () => {
        const strip = renderStrip(tokens, selected).querySelector<HTMLElement>('.jpdb-reader-token-sentence')!;
        const conjugated = tokenChoice(strip, 13);
        expect(conjugated.dataset.surface).toBe('読んだ');
        expect(conjugated.dataset.expression).toBe('読む');
    });

    it('carries the same pitch and card-state classes as page words', () => {
        const strip = renderStrip(tokens, selected).querySelector<HTMLElement>('.jpdb-reader-token-sentence')!;
        const first = tokenChoice(strip, 11);
        const read = tokenChoice(strip, 13);
        expect(first.classList.contains('jpdb-reader-word')).toBe(true);
        expect(first.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(first.classList.contains('jpdb-not-in-deck')).toBe(true);
        // Pitch derived from card pitchAccent when the token has no pitchClass.
        expect(read.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
        expect(read.classList.contains('jpdb-known')).toBe(true);
    });

    it('re-anchors tokens whose offsets index into the surrounding sentence', () => {
        // Offsets relative to a longer sentence, not the selected slice.
        const sentenceTokens = [
            token({ card: testCard({ vid: 21, sid: 21, spelling: '毎日', reading: 'まいにち' }), start: 5, end: 7 }),
            token({ card: testCard({ vid: 22, sid: 22, spelling: 'ページ', reading: 'ページ', pitchAccent: [] }), start: 9, end: 12 }),
        ];
        const strip = renderStrip(sentenceTokens, '毎日50ページ').querySelector<HTMLElement>('.jpdb-reader-token-sentence')!;
        const buttons = [...strip.querySelectorAll<HTMLButtonElement>('button[data-token-choice]')];
        expect(buttons.map(button => button.dataset.surface)).toEqual(['毎日', 'ページ']);
        expect(strip.textContent).toContain('50');
    });
});

function composedOfRenderer(overrides: Partial<CardPopoverRendererDependencies> = {}): CardPopoverRenderer {
    return new CardPopoverRenderer({
        getSettings: () => settings(),
        isJpdbBackedCard: () => true,
        renderWordHistory: () => '',
        renderWordPills: () => '',
        renderDefinitionSources: () => '',
        dictionarySourceAttributes: () => 'open',
        dictionaryLabel: name => name,
        ...overrides,
    });
}

function renderComposedOf(componentPitches: Array<{ text: string; reading: string; pitch: string }>): HTMLElement {
    const renderer = composedOfRenderer();
    document.body.innerHTML = renderer.render(testCard({
        spelling: '跳梁跋扈',
        reading: 'ちょうりょうばっこ',
        pitchAccent: [],
    }), '跳梁跋扈だ。', 'modal', {
        localEntries: [],
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        jpdbDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo: null,
        loading: false,
        expressionComponents: [
            { text: '跳梁', reading: 'ちょうりょう' },
            { text: '跋扈', reading: 'ばっこ' },
        ],
        componentPitches,
    } as unknown as CardRenderData & { loading: boolean });
    return document.querySelector<HTMLElement>('.jpdb-reader-expression-components')!;
}

describe('composed of section', () => {
    it('renders keyboard-accessible component chips in a wrapping row with a gap above the header', () => {
        const section = renderComposedOf([
            { text: '跳梁', reading: 'ちょうりょう', pitch: 'LHHHHH' },
            { text: '跋扈', reading: 'ばっこ', pitch: 'HLL' },
        ]);
        const links = [...section.querySelectorAll<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]')];
        expect(links.length).toBe(2);
        links.forEach(link => {
            expect(link.getAttribute('role')).toBe('button');
            expect(link.getAttribute('tabindex')).toBe('0');
        });
        expect(NORMALIZED_POPOVER_CSS).toContain('.jpdb-reader-expression-components { margin-top:');
        expect(NORMALIZED_POPOVER_CSS).toMatch(/\.jpdb-reader-jpdb-used-in\.jpdb-reader-expression-component-list \{ display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;/);
        expect(NORMALIZED_POPOVER_CSS).toContain('.jpdb-reader-expression-component-link.gloss-link { display: inline-flex;');
        expect(NORMALIZED_POPOVER_CSS).toContain('.jpdb-reader-jpdb-used-in-row.jpdb-reader-expression-component-row:not(:last-child)::after { content: "•";');
    });

    it('keeps pitch colouring when component pitch readings differ from the component reading', () => {
        const section = renderComposedOf([
            { text: '跳梁', reading: 'チョウリョウ', pitch: 'LHHHHH' },
            { text: '跋扈', reading: 'バッコ', pitch: 'HLL' },
        ]);
        const words = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-expression-component-term')];
        expect(words.map(word => word.dataset.pitchClass)).toEqual(['heiban', 'atamadaka']);
    });
});
