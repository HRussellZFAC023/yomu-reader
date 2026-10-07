import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

// Headword/reading/POS facts transcribed from the locally archived EDRDG JMdict_e
// (references-academy/open-corpora/edrdg-jmdict-kanjidic/JMdict_e.gz).
// Entry IDs preserve provenance; definitions are unnecessary for this span test.
// The score models Yomitan priority metadata: 成る is marked ichi1/news2/nf34;
// 綯う has no priority tags. Only their relative order matters here.
const LEXICON = [
    ['1538920', '唯一', 'ゆいいつ', 'n'], ['1538900', '唯', 'ただ', 'n'], ['1160790', '一', 'いち', 'num'],
    ['1546210', '用いる', 'もちいる', 'v1'], ['1546200', '用', 'よう', 'n'], ['1577980', '居る', 'いる', 'v1'],
    ['1274950', '公用語', 'こうようご', 'n'], ['1578630', '公', 'こう', 'n'], ['1546270', '用語', 'ようご', 'n'],
    ['1006730', '然して', 'そして', 'conj'], ['1375610', '成る', 'なる', 'v5r'], ['2132290', '綯う', 'なう', 'v5u'],
];
const SENTENCE = 'において日本語を用いることが規定され、学校教育においては「国語」の教科として学習を行うなど、事実上日本国内において唯一の公用語となっている。';
const store = new YomitanDictionaryStore();
afterEach(async () => { await store.clear(); });

describe('reported Wikipedia dictionary parsing', () => {
    it('prefers an exact written particle over a higher-scored reading homophone', async () => {
        // JMdict 2028920/2028930 are kana-written particles; 1313000/1197760
        // are 歯/蛾, retrieved by the same reading index. Priority tags can
        // give the nouns a higher score without changing what was written.
        const terms = [
            { expression: '歯', reading: 'は', rules: 'n', score: 30 },
            { expression: '蛾', reading: 'が', rules: 'n', score: 20 },
            { expression: 'は', reading: 'は', rules: 'prt', score: 10 },
            { expression: 'が', reading: 'が', rules: 'prt', score: 10 },
        ].map(entry => ({ ...entry, glossary: [], dictionary: 'JMdict regression facts' }));
        await store.importFile(new File([JSON.stringify({ formatName: 'yomu-yomitan-dictionaries', formatVersion: 2, terms })], 'particles.json', { type: 'application/json' }));
        const parser = new ReaderParser({ getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', parserProvider: 'local', localDictionariesEnabled: true, showPitchAccent: false }), jpdb: {} as never, dictionaries: store });
        const [tokens] = await parser.parse(['日本は言語がある。'], { allowSegmentedFallback: true });
        for (const surface of ['は', 'が']) {
            const token = tokens.find(token => '日本は言語がある。'.slice(token.start, token.end) === surface);
            expect(token?.card.spelling).toBe(surface);
            expect(token?.card.partOfSpeech).toContain('prt');
        }
        const [writtenTooth] = await parser.parse(['歯'], { allowSegmentedFallback: true });
        expect(writtenTooth[0]?.card.spelling).toBe('歯');
    });

    it('keeps dictionary-confirmed compounds and chooses the common inflection', async () => {
        await store.clear();
        await store.importFile(new File([JSON.stringify({ formatName: 'yomu-yomitan-dictionaries', formatVersion: 2,
            terms: LEXICON.map(([id, expression, reading, rules]) => ({ expression, reading, rules, score: id === '1375610' ? 10 : 0, glossary: [`JMdict ${id}`], dictionary: 'JMdict regression facts' })),
        })], 'jmdict-regression.json', { type: 'application/json' }));
        const parser = new ReaderParser({ getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', parserProvider: 'local', localDictionariesEnabled: true, showPitchAccent: false }), jpdb: {} as never, dictionaries: store });
        const [tokens] = await parser.parse([SENTENCE], { allowSegmentedFallback: true });
        for (const surface of ['唯一', '用いる', '公用語']) {
            expect(tokens.find(token => SENTENCE.slice(token.start, token.end) === surface)?.card.spelling).toBe(surface);
        }
        expect(tokens.find(token => SENTENCE.slice(token.start, token.end).startsWith('なって'))?.card.spelling).toBe('成る');
        const [conjunction] = await parser.parse(['そして国外移民'], { allowSegmentedFallback: true });
        expect(conjunction.find(token => token.start === 0)?.end).toBe(3);
    });
});
