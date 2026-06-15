import { describe, expect, it } from 'vitest';
import { JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../../src/reader/app/constants';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderDefinitionSourcesStack } from '../../src/reader/sources/definition-stack';
import { orderedDefinitionSourceIds } from '../../src/reader/sources/sections';
import type { JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';
import type { YomitanTermEntry } from '../../src/reader/dictionaries/yomitan';

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

function renderSources(
    sourceCard: JPDBCard,
    settings: ReaderSettings = DEFAULT_SETTINGS,
    extraSectionsOrOptions?: Parameters<typeof renderDefinitionSourcesStack>[0]['extraSectionsOrOptions'],
    jitenVocabularyInfo?: JitenVocabularyInfo | null,
    entries: YomitanTermEntry[] = [],
): string {
    return renderDefinitionSourcesStack({
        card: sourceCard,
        entries,
        settings,
        sourceAttributes: key => `data-source-state-key="${key}"`,
        dictionaryLabel: name => name,
        noDefinitionsHtml: () => '<p>No definitions</p>',
        extraSectionsOrOptions,
        jitenVocabularyInfo,
        renderTranslationSource: () => '',
        renderGrammarSource: () => '',
        renderImmersionSource: () => '',
    });
}

function jitenInfo(meanings: string[]): JitenVocabularyInfo {
    return {
        wordId: 10,
        mainReading: { text: '大学', readingIndex: 0, frequencyRank: 500, usedInMediaAmount: null },
        alternativeReadings: [],
        partsOfSpeech: ['noun'],
        definitions: [{
            index: 0,
            meanings,
            partsOfSpeech: ['noun'],
            field: [],
            dial: [],
            misc: [],
            restrictedToReadingIndices: [],
        }],
        pitchAccents: [],
        knownStates: ['not-in-deck'],
        composedOf: [],
        usedIn: [],
        usedInTotal: 0,
        examples: [],
    };
}

describe('definition source stack', () => {
    it('keeps JPDB and Jiten as separate enabled default source IDs', () => {
        expect(orderedDefinitionSourceIds(DEFAULT_SETTINGS, [])).toEqual(expect.arrayContaining([
            JPDB_DEFINITION_SOURCE_ID,
            JITEN_DEFINITION_SOURCE_ID,
        ]));
    });

    it('hides an empty keyless Jiten source instead of replacing content with an external button', () => {
        const html = renderSources(card({ source: 'jpdb' }));

        expect(html).toContain('data-source="jpdb"');
        expect(html).not.toContain('data-source="jiten"');
        expect(html).not.toContain('https://jiten.moe/parse?text=%E8%AA%AD%E3%82%80');
        expect(html).not.toContain('jpdb-reader-no-definitions');
        expect(html.match(/to read/g)).toHaveLength(1);
    });

    it('keeps imported Jitendex entries out of the real Jiten source', () => {
        const html = renderSources(card({
            source: 'jpdb',
            spelling: '復習',
            reading: 'ふくしゅう',
            meanings: [{ glosses: ['JPDB review meaning'], partOfSpeech: [] }],
        }), DEFAULT_SETTINGS, undefined, null, [{
            expression: '復習',
            reading: 'ふくしゅう',
            dictionary: 'Jitendex',
            glossary: ['review; revision', { type: 'structured-content', content: { tag: 'div', content: '復習する時間です。' } }],
            score: 10,
        }]);

        expect(html).not.toContain('data-source="jiten"');
        expect(html).toContain('review; revision');
        expect(html).toContain('復習する時間です。');
        expect(html).not.toContain('https://jiten.moe/parse?text=%E5%BE%A9%E7%BF%92');
        expect(html).not.toContain('jpdb-reader-jiten-local-definitions');
        expect(html.match(/JPDB review meaning/g)).toHaveLength(1);
    });

    it('renders keyless-loaded Jiten info with related words, examples, and audio controls', () => {
        const html = renderSources(card({
            source: 'jpdb',
            spelling: '復習',
            reading: 'ふくしゅう',
            meanings: [{ glosses: ['JPDB review meaning'], partOfSpeech: [] }],
        }), DEFAULT_SETTINGS, undefined, {
            wordId: 1500800,
            mainReading: { text: '復習', readingIndex: 0, frequencyRank: 12435, usedInMediaAmount: null },
            alternativeReadings: [],
            partsOfSpeech: ['noun', 'suru verb'],
            definitions: [{
                index: 0,
                meanings: ['review; revision'],
                partsOfSpeech: ['noun'],
                field: [],
                dial: [],
                misc: [],
                restrictedToReadingIndices: [],
            }],
            pitchAccents: [],
            knownStates: ['not-in-deck'],
            composedOf: [{
                wordId: 101,
                readingIndex: 0,
                reading: '復',
                readingFurigana: '復[ふく]',
                mainDefinition: 'again; restore',
                frequencyRank: null,
                matchSurface: '復',
                audioUrls: ['https://audio.example.test/fuku.mp3'],
            }],
            usedIn: [{
                wordId: 102,
                readingIndex: 0,
                reading: '復習会',
                readingFurigana: '復習会[ふくしゅうかい]',
                mainDefinition: 'review session',
                frequencyRank: 32000,
                matchSurface: '復習会',
            }],
            usedInTotal: 1,
            examples: [{
                sentenceId: 99,
                text: '毎日復習する。',
                wordPosition: 2,
                wordLength: 2,
                difficulty: null,
                sourceTitle: 'Jiten examples',
                audioUrls: ['https://audio.example.test/review-sentence.mp3'],
            }],
        });

        const root = document.createElement('div');
        root.innerHTML = html;
        const jiten = root.querySelector<HTMLElement>('[data-source="jiten"]');
        expect(jiten).not.toBeNull();
        const jitenText = jiten?.textContent ?? '';
        expect(jiten?.textContent).toContain('review; revision');
        expect(jiten?.textContent).toContain('復習会');
        expect(jitenText).toContain('毎日');
        expect(jitenText).toContain('復習');
        expect(jitenText).toContain('する。');
        expect(jiten?.querySelector('.jpdb-reader-jiten-example-row.has-audio')).not.toBeNull();
        expect(jiten?.querySelectorAll('.jpdb-reader-jiten-audio')).toHaveLength(3);
        expect(jiten?.querySelector('.jpdb-reader-jiten-local-definitions')).toBeNull();
        expect(jiten?.querySelector('.jpdb-reader-jiten-external-lookup')).toBeNull();
        expect(jiten?.textContent).not.toContain('Jitenで開く');
        expect(html.match(/JPDB review meaning/g)).toHaveLength(1);
    });

    it('renders Jiten source definitions from loaded Jiten info without copying JPDB meanings', () => {
        const html = renderSources(card({
            source: 'jpdb',
            spelling: '大学',
            reading: 'だいがく',
            meanings: [{ glosses: ['JPDB meaning only'], partOfSpeech: [] }],
        }), DEFAULT_SETTINGS, undefined, jitenInfo(['university; college']));

        expect(html).toContain('data-source="jpdb"');
        expect(html).toContain('data-source="jiten"');
        expect(html).toContain('JPDB meaning only');
        expect(html).toContain('university; college');
    });

    it('does not render JPDB from Jiten card meanings when both sources are enabled', () => {
        const html = renderSources(card({
            source: 'jiten',
            jitenWordId: 10,
            jitenReadingIndex: 0,
        }));

        expect(html).toContain('data-source="jiten"');
        expect(html).not.toContain('data-source="jpdb"');
    });

    it('keeps Jiten available when the JPDB source panel is disabled', () => {
        const html = renderSources(card({ source: 'jpdb' }), DEFAULT_SETTINGS, { includeJpdbSource: false }, jitenInfo(['dictionary definition']));

        expect(html).toContain('data-source="jiten"');
        expect(html).not.toContain('data-source="jpdb"');
    });
});
