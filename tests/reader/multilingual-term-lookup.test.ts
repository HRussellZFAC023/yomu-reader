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
        capabilities: { segmentation: true, morphology: true, 'term-lookup': true },
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

async function spanishStore(): Promise<YomitanDictionaryStore> {
    const store = new YomitanDictionaryStore();
    stores.push(store);
    await store.clear();
    await store.importFile(dexieTermFile(
        SPANISH_TERMS.map(term => ({
            expression: term.expression,
            reading: term.expression,
            glossary: term.glossary,
            rules: term.rules,
            score: 10,
            dictionary: 'wty-es-en',
        })),
        'wty-es-en.json',
    ));
    return store;
}

afterEach(async () => {
    resetActiveLearningTargetLanguage();
    for (const language of AD_HOC_LANGUAGES) unregisterLearningTargetModule(language);
    await Promise.all(stores.splice(0).map(store => store.clear()));
});

describe('a non-Japanese target resolves dictionary entries through the normal lookup path', () => {
    it('finds Spanish terms in Spanish text', async () => {
        registerLearningTargetModule(spanishTarget());
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        const store = await spanishStore();

        const matches = await store.findTermMatches('Me gusta comer paella.', 16);

        expect(matches.map(match => match.entry.expression)).toEqual(['gustar', 'comer', 'paella']);
        expect(matches.map(match => match.surface)).toEqual(['gusta', 'comer', 'paella']);
        expect(matches.every(match => match.entry.dictionary === 'wty-es-en')).toBe(true);
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
            capabilities: { segmentation: true, morphology: true, 'term-lookup': true },
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
});
