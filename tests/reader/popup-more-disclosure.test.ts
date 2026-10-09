import { describe, expect, it } from 'vitest';

import { rerenderAroundMiningControls } from '../../src/reader/study/mining-controls';
import { DictionarySourceStateController } from '../../src/reader/sources/state';
import { renderLocalDefinitionSourcesSection } from '../../src/reader/sources/definition-render';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
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


describe('More disclosures survive one popup render by source and kind', () => {
    const sourceState = () => new DictionarySourceStateController({ onStateChange: () => undefined });
    const meanings = ['one', 'two', 'three', 'four', 'five'];
    const examples: ProviderExampleView[] = ['一。', '二。', '三。'].map((sentence, index) => ({
        id: String(index), sentence, sentenceHtml: sentence, translation: '',
    }));
    const detail = (root: HTMLElement, source: string, kind: string) => root.querySelector<HTMLDetailsElement>(
        `[data-source="${source}"] [data-more-kind="${kind}"]`,
    )!;

    it('keeps explicit open and closed choices when providers reorder, new sources arrive, and labels change', () => {
        const state = sourceState();
        const attrs = state.attributes.bind(state);
        const info = jitenInfo([definition(0, meanings)]);
        const jiten = (language: 'en' | 'ja') => renderJitenDefinitionSource(card(), attrs, info, language);
        const jpdb = (language: 'en' | 'ja') => renderJpdbDefinitionSource(card({ source: 'jpdb', meanings: meanings.map(gloss => ({ glosses: [gloss], partOfSpeech: [] })) }), attrs,
            { meanings, compounds: [], examples: examples.map(({ sentence }) => ({ sentence, translation: '' })) }, language);
        const root = mount(jiten('en') + jpdb('en'));
        state.installTracking(root);
        detail(root, 'jiten', 'meanings').open = true;
        detail(root, 'jpdb', 'examples').open = true;
        const before = detail(root, 'jiten', 'meanings');
        const newcomer = renderProviderExamples('bunpro', 'bunpro', { availability: 'loaded', items: examples }, attrs, 'ja');
        rerenderAroundMiningControls(root, () => '', () => { root.innerHTML = newcomer + jpdb('ja') + jiten('ja'); });
        expect(detail(root, 'jiten', 'meanings')).not.toBe(before);
        expect(detail(root, 'jiten', 'meanings').open).toBe(true);
        expect(detail(root, 'jpdb', 'meanings').open).toBe(false);
        expect(detail(root, 'jpdb', 'examples').open).toBe(true);
        expect(root.querySelector<HTMLDetailsElement>('[data-example-provider="bunpro"] .jpdb-reader-more')!.open).toBe(false);

        detail(root, 'jiten', 'meanings').open = false;
        rerenderAroundMiningControls(root, () => '', () => { root.innerHTML = jiten('en') + jpdb('en'); });
        expect(detail(root, 'jiten', 'meanings').open).toBe(false);
        // A different popup has no inherited More preference, even with the same providers.
        const nextPopup = mount(jiten('en') + jpdb('en'));
        expect(detail(nextPopup, 'jpdb', 'examples').open).toBe(false);
    });

    it('does not transfer a local entry disclosure when same-dictionary headwords change order', () => {
        const state = sourceState();
        const entries = (expression: string) => meanings.map(gloss => ({ dictionary: 'Local', expression, reading: expression, glossary: [gloss] }));
        const render = (words: string[]) => renderLocalDefinitionSourcesSection(['Local'], new Map([
            ['Local', words.flatMap(entries)],
        ]), DEFAULT_SETTINGS, state.attributes.bind(state), name => name);
        const root = mount(render(['持つ', '保つ']));
        const localMore = () => [...root.querySelectorAll<HTMLDetailsElement>('.jpdb-reader-more')];
        expect(localMore()).toHaveLength(2);
        localMore()[0]!.open = true;
        rerenderAroundMiningControls(root, () => '', () => { root.innerHTML = render(['新しい', '保つ', '持つ']); });
        expect(localMore().map(node => node.open)).toEqual([false, false, true]);
    });
});
