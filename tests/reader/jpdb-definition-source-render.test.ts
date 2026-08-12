import { describe, expect, it } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import { setInnerHtml } from '../../src/reader/dom';
import { renderJpdbDefinitionSource } from '../../src/reader/jpdb/jpdb-definition-source-render';
import { renderedJpdbRelatedWords } from '../../src/reader/jpdb/jpdb-related-words';
import type { JpdbVocabularyInfo } from '../../src/reader/jpdb/jpdb-vocabulary';

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling: '大学',
        reading: 'だいがく',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['university'], partOfSpeech: [] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

describe('JPDB definition source rendering', () => {
    it('uses the configured source title', () => {
        const mount = document.createElement('div');
        setInnerHtml(mount, renderJpdbDefinitionSource(card(), key => `data-source-state-key="${key}"`, null, 'en', 'Cards API'));

        expect(mount.querySelector('summary')?.textContent?.trim()).toBe('Cards API');
    });

    it('renders used-in words for enrichment and examples for nested parsing', () => {
        const info: JpdbVocabularyInfo = {
            meanings: ['university'],
            compounds: [],
            usedInVocabulary: [{
                term: '大学院',
                reading: 'だいがくいん',
                meaning: 'graduate school',
                url: '/vocabulary/123/%E5%A4%A7%E5%AD%A6%E9%99%A2/%E3%81%A0%E3%81%84%E3%81%8C%E3%81%8F%E3%81%84%E3%82%93#a',
                termHtml: '<ruby><span class="jpdb-reader-ruby-base">大学</span><rp>(</rp><rt class="jpdb-reader-furi">だいがく</rt><rp>)</rp></ruby>院',
            }],
            examples: [{
                sentence: '大学で日本語を勉強します。',
                sentenceHtml: '',
                translation: 'I study Japanese at university.',
                audioIds: [],
            }],
        };
        const mount = document.createElement('div');
        setInnerHtml(mount, renderJpdbDefinitionSource(card(), key => `data-source-state-key="${key}"`, info, 'en'));

        const related = renderedJpdbRelatedWords(mount);
        expect(related).toHaveLength(1);
        expect(related[0]?.token.card).toMatchObject({
            vid: 123,
            sid: 0,
            spelling: '大学院',
            reading: 'だいがくいん',
            source: 'jpdb',
        });
        expect(related[0]?.word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(related[0]?.word.dataset.pitchClass).toBe('unknown');

        const example = mount.querySelector<HTMLElement>('.jpdb-reader-example-sentence');
        expect(example?.classList.contains('jpdb-reader-parseable')).toBe(true);
        // The headword occurrence is rendered as a rich passive JPDB word (with
        // ruby), but it is scoped out of renderedJpdbRelatedWords above.
        const exampleWord = example?.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="大学"]');
        expect(exampleWord).not.toBeNull();
        expect(example?.textContent?.startsWith('大学')).toBe(true);
        expect(example?.textContent).toContain('で日本語を勉強します。');
        expect(mount.querySelector<HTMLElement>('[data-provider-example-translation]')?.dataset.providerTranslationBlurred).toBe('true');
    });
});
