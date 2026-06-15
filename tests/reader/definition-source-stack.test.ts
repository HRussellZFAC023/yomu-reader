import { describe, expect, it } from 'vitest';
import { JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../../src/reader/app/constants';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderDefinitionSourcesStack } from '../../src/reader/sources/definition-stack';
import { orderedDefinitionSourceIds } from '../../src/reader/sources/sections';
import type { JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';

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
): string {
    return renderDefinitionSourcesStack({
        card: sourceCard,
        entries: [],
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

    it('renders a keyless Jiten source without copying JPDB meanings', () => {
        const html = renderSources(card({ source: 'jpdb' }));

        expect(html).toContain('data-source="jpdb"');
        expect(html).toContain('data-source="jiten"');
        expect(html).toContain('https://jiten.moe/parse?text=%E8%AA%AD%E3%82%80');
        expect(html).not.toContain('jpdb-reader-no-definitions');
        expect(html.match(/to read/g)).toHaveLength(1);
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
