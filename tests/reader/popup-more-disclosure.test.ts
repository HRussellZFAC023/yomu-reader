import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import type { JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';
import { renderJitenDefinitionSource } from '../../src/reader/jiten/jiten-definition-source-render';
import { renderJpdbDefinitionSource } from '../../src/reader/jpdb/jpdb-definition-source-render';
import { renderProviderExamples, type ProviderExampleView } from '../../src/reader/sources/provider-examples';

// Design item 5: a long entry opens on its first useful senses and one
// example; everything else waits behind one collapsed "More" disclosure.

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling: '持つ',
        reading: 'もつ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        jitenWordId: 7,
        jitenReadingIndex: 0,
        ...overrides,
    };
}

function definition(index: number, meanings: string[], partsOfSpeech = ['Godan verb', 'transitive verb']): JitenVocabularyInfo['definitions'][number] {
    return { index, meanings, partsOfSpeech, field: [], dial: [], misc: [], restrictedToReadingIndices: [] };
}

function jitenInfo(definitions: JitenVocabularyInfo['definitions']): JitenVocabularyInfo {
    return {
        wordId: 7,
        mainReading: { text: '持[も]つ', readingIndex: 0, frequencyRank: 100, usedInMediaAmount: null },
        alternativeReadings: [],
        partsOfSpeech: [],
        definitions,
        pitchAccents: [],
        knownStates: ['new'],
        composedOf: [],
        usedIn: [],
        examples: [],
    };
}

function mount(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

function visibleText(element: Element): string[] {
    return [...element.querySelectorAll('.jpdb-reader-meaning')]
        .filter(meaning => !meaning.closest('details.jpdb-reader-more'))
        .map(meaning => meaning.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('popup meanings come first and extras wait behind one disclosure', () => {
    it('shows the first three Jiten senses and discloses the rest, other parts of speech included', () => {
        const info = jitenInfo([
            definition(0, ['to hold', 'to carry', 'to possess', 'to maintain', 'to last']),
            definition(1, ['to take charge of'], ['Godan verb', 'intransitive verb']),
        ]);
        const root = mount(renderJitenDefinitionSource(card(), () => '', info, 'en'));

        expect(visibleText(root)).toEqual(['1 to hold', '2 to carry', '3 to possess']);
        const more = root.querySelector<HTMLDetailsElement>('details.jpdb-reader-more')!;
        expect(more.open).toBe(false);
        expect(more.querySelector('summary')?.textContent).toBe('More meanings');
        expect([...more.querySelectorAll('.jpdb-reader-meaning')].map(meaning => meaning.textContent?.replace(/\s+/g, ' ').trim()))
            .toEqual(['4 to maintain', '5 to last', '6 to take charge of']);
    });

    it('never hides a single leftover sense', () => {
        const info = jitenInfo([definition(0, ['to hold', 'to carry', 'to possess', 'to maintain'])]);
        const root = mount(renderJitenDefinitionSource(card(), () => '', info, 'ja'));

        expect(root.querySelector('details.jpdb-reader-more')).toBeNull();
        expect(visibleText(root)).toHaveLength(4);
    });

    it('labels the disclosure in Japanese', () => {
        const info = jitenInfo([definition(0, ['a', 'b', 'c', 'd', 'e'])]);
        const root = mount(renderJitenDefinitionSource(card(), () => '', info, 'ja'));

        expect(root.querySelector('details.jpdb-reader-more summary')?.textContent).toBe('ほかの意味');
    });

    it('discloses JPDB meanings past the first three', () => {
        const jpdbCard = card({
            source: 'jpdb',
            meanings: ['to hold', 'to carry', 'to possess', 'to maintain', 'to last'].map(gloss => ({ glosses: [gloss], partOfSpeech: [] })),
        });
        const root = mount(renderJpdbDefinitionSource(jpdbCard, () => '', null, 'en'));

        expect(visibleText(root)).toEqual(['to hold', 'to carry', 'to possess']);
        expect(root.querySelectorAll('details.jpdb-reader-more .jpdb-reader-meaning')).toHaveLength(2);
    });

    it('shows one example sentence and discloses the others', () => {
        const items: ProviderExampleView[] = ['一つ目の例。', '二つ目の例。', '三つ目の例。'].map((sentence, index) => ({
            id: String(index),
            sentence,
            sentenceHtml: sentence,
            translation: '',
        }));
        const root = mount(renderProviderExamples('jiten', 'jiten', { availability: 'loaded', items }, () => '', 'en'));

        const outside = [...root.querySelectorAll('.jpdb-reader-jpdb-example')].filter(example => !example.closest('details.jpdb-reader-more'));
        expect(outside.map(example => example.textContent?.trim().slice(0, 6))).toEqual(['一つ目の例。']);
        const more = root.querySelector<HTMLDetailsElement>('details.jpdb-reader-more')!;
        expect(more.open).toBe(false);
        expect(more.querySelector('summary')?.textContent).toBe('More examples');
        expect(more.querySelectorAll('.jpdb-reader-jpdb-example')).toHaveLength(2);
    });

    it('keeps two examples in one list', () => {
        const items: ProviderExampleView[] = ['一つ目の例。', '二つ目の例。'].map((sentence, index) => ({
            id: String(index),
            sentence,
            sentenceHtml: sentence,
            translation: '',
        }));
        const root = mount(renderProviderExamples('jpdb', 'jpdb', { availability: 'loaded', items }, () => '', 'en'));

        expect(root.querySelector('details.jpdb-reader-more')).toBeNull();
        expect(root.querySelectorAll('.jpdb-reader-jpdb-example')).toHaveLength(2);
    });
});
