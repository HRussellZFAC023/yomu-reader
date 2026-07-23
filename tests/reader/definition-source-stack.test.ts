import { afterEach, describe, expect, it, vi } from 'vitest';
import { JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../../src/reader/app/constants';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { testEnSettings } from './helpers/settings-fixture';
import { renderDefinitionSourcesStack } from '../../src/reader/sources/definition-stack';
import { orderedDefinitionSourceIds } from '../../src/reader/sources/sections';
import type { JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';
import type { JpdbVocabularyInfo } from '../../src/reader/jpdb/jpdb-vocabulary';
import type { YomitanTermEntry } from '../../src/reader/dictionaries/yomitan';
import { normalizeBunproDefinitionSearch } from '../../src/reader/bunpro/definition';
import type { BunproDefinitionInfo } from '../../src/reader/bunpro/definition';

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
    jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
    bunproDefinitionInfo: BunproDefinitionInfo | null = null,
): string {
    return renderDefinitionSourcesStack({
        card: sourceCard,
        entries,
        settings,
        sourceAttributes: key => `data-source-state-key="${key}"`,
        dictionaryLabel: name => name,
        noDefinitionsHtml: () => '<p>No definitions</p>',
        extraSectionsOrOptions,
        jpdbVocabularyInfo,
        jitenVocabularyInfo,
        bunproDefinitionInfo,
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
    it('keeps Jiten and JPDB as separate enabled default source IDs with Jiten first', () => {
        expect(orderedDefinitionSourceIds(DEFAULT_SETTINGS, []).slice(0, 2)).toEqual([
            JITEN_DEFINITION_SOURCE_ID,
            JPDB_DEFINITION_SOURCE_ID,
        ]);
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

    it('renders imported dictionaries as top-level sources without an aggregate dictionaries panel', () => {
        const html = renderSources(card({
            source: 'jpdb',
            spelling: '復習',
            reading: 'ふくしゅう',
        }), testEnSettings(), undefined, null, [
            {
                expression: '復習',
                reading: 'ふくしゅう',
                dictionary: 'Jitendex',
                glossary: ['review; revision'],
            },
            {
                expression: '復習',
                reading: 'ふくしゅう',
                dictionary: 'JMdict',
                glossary: ['review'],
            },
        ]);

        const root = document.createElement('div');
        root.innerHTML = html;
        const stack = root.querySelector('.jpdb-reader-definition-stack');
        const localDictionaries = root.querySelector('[data-source="local-dictionaries"]');
        const dictionarySources = Array.from(root.querySelectorAll<HTMLElement>('[data-source="local-dictionary"]'));

        expect(localDictionaries).toBeNull();
        expect(dictionarySources).toHaveLength(2);
        expect(dictionarySources.every(source => source.parentElement === stack)).toBe(true);
        expect(dictionarySources.map(source => (source.querySelector('summary')?.textContent ?? '').replace(/\s+/g, ' ').trim())).toEqual([
            'Jitendex 1 entry',
            'JMdict 1 entry',
        ]);
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
                translation: '',
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

    it('renders public JPDB details beside a Jiten-backed card when both sources have content', () => {
        const html = renderSources(card({
            source: 'jiten',
            jitenWordId: 10,
            jitenReadingIndex: 0,
            spelling: '復習',
            reading: 'ふくしゅう',
            meanings: [{ glosses: ['Jiten card meaning only'], partOfSpeech: [] }],
        }), DEFAULT_SETTINGS, undefined, jitenInfo(['Jiten real meaning']), [], {
            meanings: ['JPDB public meaning'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        });

        expect(html).toContain('data-source="jpdb"');
        expect(html).toContain('data-source="jiten"');
        expect(html).toContain('JPDB public meaning');
        expect(html).toContain('Jiten real meaning');
        expect(html).not.toContain('Jiten card meaning only');
    });

    it('keeps Jiten available when the JPDB source panel is disabled', () => {
        const html = renderSources(card({ source: 'jpdb' }), DEFAULT_SETTINGS, { includeJpdbSource: false }, jitenInfo(['dictionary definition']));

        expect(html).toContain('data-source="jiten"');
        expect(html).not.toContain('data-source="jpdb"');
    });

    it('omits disabled JPDB and Bunpro sources even when provider data is available', () => {
        const jpdbInfo: JpdbVocabularyInfo = {
            meanings: ['JPDB provider meaning'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        };
        const bunproInfo = normalizeBunproDefinitionSearch({
            vocabs: { data: [{
                id: 42,
                attributes: {
                    id: 42,
                    title: '読む',
                    kana: 'よむ',
                    meaning: 'Bunpro provider meaning',
                },
            }] },
        }, '読む', 'よむ');
        expect(bunproInfo).not.toBeNull();

        const enabled = renderSources(card({ source: 'local' }), DEFAULT_SETTINGS, undefined, null, [], jpdbInfo, bunproInfo);
        expect(enabled).toContain('data-source="jpdb"');
        expect(enabled).toContain('data-source="bunpro"');

        const disabled = renderSources(card({ source: 'local' }), {
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: false,
            bunproDefinitionsEnabled: false,
        }, undefined, null, [], jpdbInfo, bunproInfo);
        expect(disabled).not.toContain('data-source="jpdb"');
        expect(disabled).not.toContain('data-source="bunpro"');
        expect(disabled).not.toContain('JPDB provider meaning');
        expect(disabled).not.toContain('Bunpro provider meaning');
    });
});

describe('definition source stack host suppression', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function jitenBackedCard(): JPDBCard {
        return card({
            source: 'jiten',
            jitenWordId: 10,
            jitenReadingIndex: 0,
            spelling: '大学',
            reading: 'だいがく',
            meanings: [{ glosses: ['JPDB meaning only'], partOfSpeech: [] }],
        });
    }

    it('suppresses the Jiten source on jiten.moe but keeps JPDB', () => {
        vi.stubGlobal('location', { hostname: 'jiten.moe', pathname: '/parse' });
        const html = renderSources(jitenBackedCard(), DEFAULT_SETTINGS, undefined, jitenInfo(['university; college']), [], {
            meanings: ['JPDB public meaning'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        });

        expect(html).not.toContain('data-source="jiten"');
        expect(html).toContain('data-source="jpdb"');
    });

    it('suppresses the JPDB source on jpdb.io but keeps Jiten', () => {
        vi.stubGlobal('location', { hostname: 'jpdb.io', pathname: '/vocabulary' });
        const html = renderSources(jitenBackedCard(), DEFAULT_SETTINGS, undefined, jitenInfo(['university; college']), [], {
            meanings: ['JPDB public meaning'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        });

        expect(html).toContain('data-source="jiten"');
        expect(html).not.toContain('data-source="jpdb"');
    });

    it('renders both sources off-site (e.g. while reading on a third-party page)', () => {
        vi.stubGlobal('location', { hostname: 'example.com', pathname: '/' });
        const html = renderSources(jitenBackedCard(), DEFAULT_SETTINGS, undefined, jitenInfo(['university; college']), [], {
            meanings: ['JPDB public meaning'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        });

        expect(html).toContain('data-source="jiten"');
        expect(html).toContain('data-source="jpdb"');
    });

    it('lets an explicit includeJitenSource override the on-site default', () => {
        vi.stubGlobal('location', { hostname: 'jiten.moe', pathname: '/parse' });
        const html = renderSources(jitenBackedCard(), DEFAULT_SETTINGS, { includeJitenSource: true }, jitenInfo(['university; college']));

        expect(html).toContain('data-source="jiten"');
    });
});
