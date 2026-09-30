// The mini local dictionary the lookup-perf gate hovers against.
//
// Since 1.9.1 an ordinary page never shows the settings form or its dictionary
// import (sensitive setup opens on Study; see sensitive-settings-surface.ts), so
// the gate cannot import through the page it measures. It seeds the page-local
// store an older import left on that origin instead: ADR-0010 keeps those
// readable under the one v1.9.3 database name. The schema is created at
// version 1 on purpose, so production still runs every later migration, derived
// index and managed-state stamp itself before the gate measures anything.
import { yomitanDatabaseName } from './yomitan-database-name.mjs';

export const MINI_LOOKUP_DICTIONARY_TITLE = 'Mini Lookup Perf';

const FIXTURE_TERMS = [
    ['図書館', 'としょかん', '', ['library'], 1],
    ['漢字', 'かんじ', '', ['Chinese character', 'kanji'], 2],
    ['調べる', 'しらべる', 'v1', ['to look up'], 3],
    ['練習', 'れんしゅう', 'vs', ['practice'], 4],
    ['静か', 'しずか', 'adj-na', ['quiet'], 5],
];

/** The settings rows a Study import of this dictionary writes (1.9.1+). */
export function miniLookupDictionarySettings() {
    const title = MINI_LOOKUP_DICTIONARY_TITLE;
    return {
        learningTargetChosen: true,
        activeLanguageProfileId: 'lookup-perf-ja',
        languageProfiles: [{
            schemaVersion: 2,
            id: 'lookup-perf-ja',
            outputLanguage: 'en',
            learnerLanguage: 'en',
            targetLanguage: 'ja',
            uiLocale: 'en',
            parserProvider: 'local',
            dictionaries: { installed: [title], enabled: [title], order: [title] },
            definitionTranslationProviderIds: [],
        }],
        parserProvider: 'local',
        localDictionariesEnabled: true,
        dictionaryPreferences: [{
            name: title,
            alias: title,
            enabled: true,
            priority: 0,
            allowSecondarySearches: false,
            type: 'terms',
        }],
    };
}

/** Writes the fixture store on the page's origin. Call before Yomu boots there. */
export async function seedMiniLookupDictionary(page) {
    await page.evaluate(async ({ dbName, title, fixtureTerms }) => {
        await requestResult(indexedDB.deleteDatabase(dbName), 'Fixture dictionary database deletion was blocked');
        const openRequest = indexedDB.open(dbName, 1);
        openRequest.addEventListener('upgradeneeded', () => createVersionOneSchema(openRequest.result), { once: true });
        const database = await requestResult(openRequest);
        const transaction = database.transaction(['dictionaryInfo', 'terms', 'termMeta'], 'readwrite');
        const complete = new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        transaction.objectStore('dictionaryInfo').put({
            title,
            alias: title,
            enabled: true,
            priority: 0,
            type: 'terms',
            counts: { terms: fixtureTerms.length, termMeta: fixtureTerms.length },
        });
        for (const [expression, reading, rules, glossary, sequence] of fixtureTerms) {
            transaction.objectStore('terms').add({
                expression, reading, definitionTags: '', rules, score: 10, glossary, sequence, termTags: '', dictionary: title,
            });
            transaction.objectStore('termMeta').add({
                expression, mode: 'pitch', data: { reading, pitches: [{ position: 0 }] }, dictionary: title,
            });
        }
        await complete;
        database.close();

        function createVersionOneSchema(db) {
            for (const [storeName, indexes] of [['terms', ['expression', 'reading', 'dictionary']], ['termMeta', ['expression', 'dictionary']]]) {
                const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                indexes.forEach(index => store.createIndex(index, index));
            }
            db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
        }

        function requestResult(request, blockedMessage = '') {
            return new Promise((resolve, reject) => {
                request.addEventListener('success', () => resolve(request.result), { once: true });
                request.addEventListener('error', () => reject(request.error), { once: true });
                if (blockedMessage) request.addEventListener('blocked', () => reject(new Error(blockedMessage)), { once: true });
            });
        }
    }, { dbName: yomitanDatabaseName(), title: MINI_LOOKUP_DICTIONARY_TITLE, fixtureTerms: FIXTURE_TERMS });
}
