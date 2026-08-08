import { afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';

import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { createLearningTargetModule } from '../../src/reader/languages/module';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../src/reader/languages/registry';
import type { LanguageLookupCandidate } from '../../src/reader/languages/types';

/**
 * The lookup path a reader actually goes through, driven by a target that is
 * not Japanese.
 *
 * `YomitanDictionaryStore.findTermMatches` is what annotates a page, a caption
 * and an OCR result. It used to open by testing every character against a kana
 * and kanji range, so a page of Spanish produced zero candidates and every
 * Spanish dictionary in Settings was unreachable no matter how well it had
 * installed. Nothing below mocks the engine: a real store, a real import, and
 * the same entry point the reader calls.
 */

const stores: YomitanDictionaryStore[] = [];
const AD_HOC_LANGUAGES = ['es'] as const;
const YOMITAN_DB_NAME = 'jpdb-popup-reader-yomitan';
const LEGACY_YOMITAN_DB_VERSION = 4;

// Rules exactly as a Wiktionary-derived Spanish dictionary tags them: a
// part-of-speech string, in a vocabulary that has nothing to do with JMdict.
const SPANISH_TERMS = [
    { expression: 'comer', rules: 'v', glossary: ['to eat'] },
    { expression: 'paella', rules: 'n', glossary: ['paella'] },
    { expression: 'ella', rules: 'pron', glossary: ['she'] },
    { expression: 'gustar', rules: 'v', glossary: ['to be pleasing'] },
];

/**
 * A Spanish target with real morphology in its own tag vocabulary. Only two
 * facts about Spanish are stated — its letters, and that a present-tense verb
 * ending folds back to the infinitive — which is the whole point: the engine
 * below is handed those and nothing else.
 */
function spanishTarget() {
    return createLearningTargetModule({
        id: 'spanish-lookup-test-target',
        language: 'es',
        featureSemantics: {
            characterSystem: 'latin',
            phoneticScripts: ['latin'],
            pronunciation: 'stress',
            readingAnnotation: 'none',
        },
        detectsText: /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/u,
        normalizeText: (text: string) => text.normalize('NFC').trim(),
        lookupCandidates(text: string): readonly LanguageLookupCandidate[] {
            const candidates: LanguageLookupCandidate[] = [{ term: text, rules: [], reasons: [], depth: 0 }];
            const stem = /^(.+)(?:o|as|a|amos|áis|an)$/u.exec(text)?.[1];
            if (stem) {
                for (const ending of ['ar', 'er', 'ir']) {
                    candidates.push({ term: `${stem}${ending}`, rules: ['v'], reasons: ['present tense'], depth: 1 });
                }
            }
            return candidates;
        },
    });
}

function dexieTermFile(rows: Array<Record<string, unknown>>, name: string): File {
    return new File([JSON.stringify({
        formatName: 'dexie',
        data: { data: [{ tableName: 'terms', rows: rows.map((row, index) => ({ $: [index + 1, row] })) }] },
    })], name, { type: 'application/json' });
}

function seedLegacyV4LookupRows(source: string): Promise<void> {
    return deleteYomitanDatabase().then(() => new Promise((resolve, reject) => {
        const request = indexedDB.open(YOMITAN_DB_NAME, LEGACY_YOMITAN_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            const terms = db.createObjectStore('terms', { keyPath: 'id', autoIncrement: true });
            terms.createIndex('expression', 'expression');
            terms.createIndex('reading', 'reading');
            terms.createIndex('dictionary', 'dictionary');
            const termMeta = db.createObjectStore('termMeta', { keyPath: 'id', autoIncrement: true });
            termMeta.createIndex('expression', 'expression');
            termMeta.createIndex('dictionary', 'dictionary');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(['terms', 'termMeta'], 'readwrite');
            tx.objectStore('terms').add({
                expression: source,
                reading: source,
                glossary: ['cafe'],
                dictionary: 'Legacy raw fixture',
            });
            tx.objectStore('termMeta').add({
                expression: source,
                mode: 'freq',
                data: { frequency: 17 },
                dictionary: 'Legacy raw fixture',
            });
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
            tx.onabort = () => {
                db.close();
                reject(tx.error);
            };
        };
    }));
}

function deleteYomitanDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(YOMITAN_DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Could not close the v4 lookup fixture database.'));
    });
}

async function spanishStore(): Promise<YomitanDictionaryStore> {
    return dictionaryStore(
        SPANISH_TERMS.map(term => ({
            expression: term.expression,
            reading: term.expression,
            glossary: term.glossary,
            rules: term.rules,
            score: 10,
            dictionary: 'wty-es-en',
        })),
        'wty-es-en.json',
    );
}

async function dictionaryStore(rows: Array<Record<string, unknown>>, filename: string): Promise<YomitanDictionaryStore> {
    const store = new YomitanDictionaryStore();
    stores.push(store);
    await store.clear();
    await store.importFile(dexieTermFile(rows, filename));
    return store;
}

afterEach(async () => {
    resetActiveLearningTargetLanguage();
    for (const language of AD_HOC_LANGUAGES) unregisterLearningTargetModule(language);
    await Promise.all(stores.splice(0).map(store => store.clear()));
});

describe('a non-Japanese target resolves dictionary entries through the normal lookup path', () => {
    it('finds canonical, case-folded, and bounded subsegment entries end to end', async () => {
        const store = await dictionaryStore([
            { expression: 'paella', reading: 'paella', glossary: ['paella'], dictionary: 'W11 fixture' },
            { expression: 'Café', reading: 'Café', glossary: ['cafe'], dictionary: 'W11 fixture' },
            { expression: 'сестра', reading: 'сестра', glossary: ['sister'], dictionary: 'W11 fixture' },
            { expression: 'ทำ', reading: 'ทำ', glossary: ['do'], dictionary: 'W11 fixture' },
            { expression: 'ຄຳ', reading: 'ຄຳ', glossary: ['word'], dictionary: 'W11 fixture' },
            { expression: '학생', reading: '학생', glossary: ['student'], dictionary: 'W11 fixture' },
            { expression: 'ｶﾀｶﾅ', reading: 'ｶﾀｶﾅ', glossary: ['katakana'], dictionary: 'W11 fixture' },
        ], 'w11-lookup-fixture.json');

        setActiveLearningTargetLanguage('es');
        expect((await store.findTermMatches('Paella', 4)).map(match => match.entry.expression))
            .toEqual(['paella']);
        expect((await store.lookup('Cafe\u0301', 'Cafe\u0301', 4)).map(entry => entry.expression))
            .toEqual(['Café']);

        setActiveLearningTargetLanguage('ru');
        expect((await store.findTermMatches('Сестра', 4)).map(match => match.entry.expression))
            .toEqual(['сестра']);

        setActiveLearningTargetLanguage('th');
        expect((await store.findTermMatches('ทำ', 4)).map(match => match.entry.expression))
            .toEqual(['ทำ']);

        setActiveLearningTargetLanguage('lo');
        expect((await store.findTermMatches('ຄຳ', 4)).map(match => match.entry.expression))
            .toEqual(['ຄຳ']);

        setActiveLearningTargetLanguage('ko');
        const [korean] = await store.findTermMatches('학생이', 4);
        expect(korean?.entry.expression).toBe('학생');
        expect(korean?.surface).toBe('학생');
        expect([korean?.start, korean?.end]).toEqual([0, 2]);

        setActiveLearningTargetLanguage('ja');
        const [japanese] = await store.findTermMatches('ｶﾀｶﾅ', 4);
        expect(japanese?.entry.expression).toBe('カタカナ');
        expect(japanese?.surface).toBe('ｶﾀｶﾅ');
        expect([japanese?.start, japanese?.end]).toEqual([0, 4]);

        setActiveLearningTargetLanguage('ko');
        const falsePositiveStore = await dictionaryStore([
            { expression: '학', reading: '학', glossary: ['study'], dictionary: 'W11 negative fixture' },
        ], 'w11-korean-negative-fixture.json');
        expect(await falsePositiveStore.findTermMatches('학생이', 4)).toEqual([]);
    });

    it('finds Spanish terms in Spanish text', async () => {
        registerLearningTargetModule(spanishTarget());
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        const store = await spanishStore();

        const matches = await store.findTermMatches('Me gusta comer paella.', 16);

        expect(matches.map(match => match.entry.expression)).toEqual(['gustar', 'comer', 'paella']);
        expect(matches.map(match => match.surface)).toEqual(['gusta', 'comer', 'paella']);
        expect(matches.every(match => match.entry.dictionary === 'wty-es-en')).toBe(true);
    });

    it('drops an in-flight dictionary sweep after an away-and-back target switch', async () => {
        registerLearningTargetModule(spanishTarget());
        setActiveLearningTargetLanguage('es');
        const store = await spanishStore();

        const pending = store.findTermMatches('Me gusta comer paella.', 16);
        setActiveLearningTargetLanguage('ja');
        setActiveLearningTargetLanguage('es');

        await expect(pending).resolves.toEqual([]);
    });

    it('normalizes reader-export terms and metadata through their shared write door', async () => {
        const source = 'Cafe\u0301';
        const store = new YomitanDictionaryStore();
        stores.push(store);
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries',
            formatVersion: 2,
            terms: [{
                expression: source,
                reading: source,
                glossary: ['cafe'],
                dictionary: 'Canonical fixture',
            }],
            termMeta: [{
                expression: source,
                mode: 'freq',
                data: { frequency: 12 },
                dictionary: 'Canonical fixture',
            }],
        })], 'canonical-reader-term-meta.json', { type: 'application/json' }));

        await expect(store.lookup('Café', 'Café', 4)).resolves.toMatchObject([
            { expression: 'Café', reading: 'Café' },
        ]);
        await expect(store.lookupTermMeta('Café', 4)).resolves.toMatchObject([
            { expression: 'Café', mode: 'freq', data: { frequency: 12 } },
        ]);
        await expect(store.searchTerms(source, 4)).resolves.toMatchObject([
            { expression: 'Café', reading: 'Café' },
        ]);
    });

    it('migrates canonically different rows already stored by schema v4', async () => {
        const source = 'Cafe\u0301';
        await seedLegacyV4LookupRows(source);
        const store = new YomitanDictionaryStore();
        stores.push(store);
        setActiveLearningTargetLanguage('es');

        await expect(store.lookup('Café', 'Café', 4)).resolves.toMatchObject([
            { expression: 'Café', reading: 'Café' },
        ]);
        await expect(store.lookupTermMeta('Café', 4)).resolves.toMatchObject([
            { expression: 'Café', mode: 'freq', data: { frequency: 17 } },
        ]);
        await expect(store.findTermMatches('Café', 4)).resolves.toMatchObject([
            { entry: { expression: 'Café' }, surface: 'Café', start: 0, end: 4 },
        ]);
    });

    /**
     * Morphology reaches the engine through the contract, so the entry a
     * conjugated surface resolves to is the dictionary form — and the analysis
     * that got there rides along, exactly as a deinflected Japanese match does.
     */
    it('resolves a conjugated surface to its dictionary entry', async () => {
        registerLearningTargetModule(spanishTarget());
        setActiveLearningTargetLanguage('es');
        const store = await spanishStore();

        const [match] = await store.findTermMatches('gusta', 4);

        expect(match?.entry.expression).toBe('gustar');
        expect(match?.surface).toBe('gusta');
        expect(match?.deinflected?.reasons).toEqual(['present tense']);
    });

    /**
     * The reason a space-delimited target looks up its own segments and not
     * every substring. `ella` is a real Spanish word sitting inside `botella`,
     * which is not in this dictionary — so a substring sweep would annotate the
     * last four letters of "bottle" as the pronoun "she". A target that writes
     * its word boundaries has no excuse for that: the word is `botella`, the
     * dictionary does not have it, and the answer is nothing.
     */
    it('never matches a word hiding inside a longer word the dictionary lacks', async () => {
        registerLearningTargetModule(spanishTarget());
        setActiveLearningTargetLanguage('es');
        const store = await spanishStore();

        expect(SPANISH_TERMS.map(term => term.expression)).toContain('ella');
        expect(SPANISH_TERMS.map(term => term.expression)).not.toContain('botella');
        expect(await store.findTermMatches('Bebo de la botella', 8)).toEqual([]);
        // The same letters, standing on their own, still match.
        expect((await store.findTermMatches('ella', 8)).map(match => match.entry.expression))
            .toEqual(['ella']);
    });

    /**
     * Rule tags belong to the target that produced them. A Spanish `v` must
     * never be answered by an entry the way JMdict's `v5` would be, and an
     * entry whose tags the target rejects is simply not a match.
     */
    it('lets the target decide which entry answers a candidate', async () => {
        registerLearningTargetModule(createLearningTargetModule({
            id: 'spanish-strict-rules-test-target',
            language: 'es',
            featureSemantics: {
                characterSystem: 'latin',
                phoneticScripts: ['latin'],
                pronunciation: 'stress',
                readingAnnotation: 'none',
            },
            detectsText: /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/u,
            lookupCandidates: (text: string): readonly LanguageLookupCandidate[] => [
                { term: text, rules: ['adjective-only'], reasons: [], depth: 0 },
            ],
            matchesLookupCandidateRules: (entryRules, candidateRules) =>
                candidateRules.every(rule => (entryRules ?? '').split(/\s+/u).includes(rule)),
        }));
        setActiveLearningTargetLanguage('es');
        const store = await spanishStore();

        expect(await store.findTermMatches('paella', 8)).toEqual([]);
    });

    it('uses left-to-right longest exact matches when ICU over-merges Mandarin', async () => {
        setActiveLearningTargetLanguage('zh');
        const expressions = ['我', '去', '市場', '他', '是', '學生', '這個', '很', '好'];
        const store = await dictionaryStore([
            ...expressions.map(expression => ({
                expression,
                reading: expression,
                glossary: [`definition of ${expression}`],
                dictionary: 'w13-zh-fixture',
            })),
            // A reading-index hit is not evidence that this Han surface is the
            // expression. The exact-only policy must stay silent for it.
            {
                expression: '錯',
                reading: '我去',
                glossary: ['wrong reading-only answer'],
                dictionary: 'w13-zh-fixture',
            },
        ], 'w13-zh-fixture.json');

        const matches = await store.findTermMatches('我去市場。他是學生。這個很好。', 32);

        expect(matches.map(match => match.entry.expression)).toEqual(expressions);
        expect(matches.map(match => [match.surface, match.start, match.end])).toEqual([
            ['我', 0, 1],
            ['去', 1, 2],
            ['市場', 2, 4],
            ['他', 5, 6],
            ['是', 6, 7],
            ['學生', 7, 9],
            ['這個', 10, 12],
            ['很', 12, 13],
            ['好', 13, 14],
        ]);
    });

    it('recovers Cantonese words across ICU splits and keeps supplementary offsets intact', async () => {
        setActiveLearningTargetLanguage('yue');
        const store = await dictionaryStore([
            { expression: '鍾意', reading: 'zung1 ji3', glossary: ['to like'], dictionary: 'w13-yue-fixture' },
            { expression: '𡃁好', reading: 'ngam4 hou2', glossary: ['supplementary fixture'], dictionary: 'w13-yue-fixture' },
        ], 'w13-yue-fixture.json');

        await expect(store.findTermMatches('我鍾意食', 8)).resolves.toMatchObject([
            { entry: { expression: '鍾意' }, surface: '鍾意', start: 1, end: 3 },
        ]);
        await expect(store.findTermMatches('我𡃁好', 8)).resolves.toMatchObject([
            { entry: { expression: '𡃁好' }, surface: '𡃁好', start: 1, end: 4 },
        ]);
    });

    it('does not split supplementary Han at a lookup-window boundary', async () => {
        setActiveLearningTargetLanguage('zh');
        const store = await dictionaryStore([
            { expression: '𡃁好', reading: '𡃁好', glossary: ['boundary fixture'], dictionary: 'w13-window-fixture' },
        ], 'w13-window-fixture.json');
        const text = `${'我'.repeat(239)}𡃁好`;

        await expect(store.findTermMatches(text, 8)).resolves.toMatchObject([
            { entry: { expression: '𡃁好' }, surface: '𡃁好', start: 239, end: 242 },
        ]);
    });

    it('caps term-search queries without indexing a lone surrogate', async () => {
        setActiveLearningTargetLanguage('zh');
        const safePrefix = '我'.repeat(79);
        const store = await dictionaryStore([
            { expression: safePrefix, reading: safePrefix, glossary: ['boundary fixture'], dictionary: 'w13-search-boundary-fixture' },
        ], 'w13-search-boundary-fixture.json');

        await expect(store.searchTerms(`${safePrefix}𡃁tail`, 4)).resolves.toMatchObject([
            { expression: safePrefix },
        ]);
    });
});
