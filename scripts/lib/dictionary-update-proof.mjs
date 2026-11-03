import { deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
    addGmStorageBridgeInitScript,
    assert,
    YOMU_SETTINGS_KEY,
} from './smoke-harness.mjs';
import { addUserscriptGraphInitScripts } from './smoke-test-helpers.mjs';
import {
    fulfillHostedStudyAsset,
    HOSTED_STUDY_ORIGIN,
    HOSTED_STUDY_URL,
    readPrefixedGmValues,
    writePrefixedGmValues,
} from './hosted-study-harness.mjs';
import { yomitanDatabaseName } from './yomitan-database-name.mjs';

const TITLE = 'Jitendex.org [2026-05-05]';
const WORD = '図書館';
const GLOSS = 'library (stored before update)';
const PREFIX = '__yomu_dictionary_update_gm__:';
const REQUEST = '__yomuDictionaryUpdateRequest';
const EPOCH = { version: 1, generation: 3, resetId: 'fixture-reset', committedAt: 1000 };

// Code updates must reopen the learner's existing library, without a ZIP import
// or an archive cache to rescue a destructive migration. These are generated
// schema fixtures, not copies of Jitendex's licensed dictionary content.
export async function proveStoredDictionarySurvivesUpdate(browser, { scriptPath, cssPath, settings }) {
    const reports = [];
    for (const version of [5, 6]) {
        const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block' });
        try {
            await context.route(url => url.origin !== HOSTED_STUDY_ORIGIN, route => route.fulfill({ status: 503, body: '' }));
            await context.route(`${HOSTED_STUDY_ORIGIN}/**`, route => fulfillHostedStudyAsset(route));
            const page = await context.newPage();
            await page.route(`${HOSTED_STUDY_ORIGIN}/dictionary-update-fixture.html`, route => route.fulfill({
                contentType: 'text/html', body: '<!doctype html><title>Generated legacy dictionary fixture</title>',
            }));
            await page.goto(`${HOSTED_STUDY_ORIGIN}/dictionary-update-fixture.html`);
            await seedLegacyLibrary(page, version);
            const preference = { name: TITLE, alias: 'Jitendex fixture', enabled: true, priority: 0, type: 'terms', allowSecondarySearches: false };
            await writePrefixedGmValues(page, PREFIX, {
                [YOMU_SETTINGS_KEY]: JSON.stringify({ ...settings, localDictionariesEnabled: true, dictionaryPreferences: [preference] }),
                'yomu:state-epoch': JSON.stringify(EPOCH),
            });
            await page.exposeFunction(REQUEST, () => ({ status: 503, responseText: '' }));
            await addGmStorageBridgeInitScript(page, {
                key: YOMU_SETTINGS_KEY, value: settings, initialize: 'ifMissing',
                storagePrefix: PREFIX, requestBridgeName: REQUEST, css: readFileSync(cssPath, 'utf8'),
            });
            await addUserscriptGraphInitScripts(page, scriptPath);

            const loads = [];
            for (let load = 0; load < 2; load++) {
                await page.goto(`${HOSTED_STUDY_URL}?q=${encodeURIComponent(WORD)}`, { waitUntil: 'domcontentloaded' });
                const result = page.locator(`[data-newtab-action="search-result-word"][data-expression="${WORD}"]`).first();
                await result.waitFor({ state: 'visible', timeout: 30_000 }).catch(async error => {
                    throw new Error(`Stored Jitendex lookup disappeared after schema v${version} update: ${JSON.stringify(await readLibrary(page))}`, { cause: error });
                });
                await result.click();
                const card = page.locator(`[data-newtab-search-expanded="true"] [data-source="local-dictionary"][data-dictionary="${TITLE}"]`);
                await card.getByText(GLOSS, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
                assert(await card.count() === 1, 'Updated code did not recognize exactly the stored Jitendex source', { version, load });
                const stored = await readLibrary(page);
                assertStoredLibrary(stored, { version, load });
                const values = await readPrefixedGmValues(page, PREFIX);
                assert(!values['yomu-dictionary-archives'], 'Update proof unexpectedly created an archive', Object.keys(values));
                const preferences = JSON.parse(values[YOMU_SETTINGS_KEY]).dictionaryPreferences;
                assert(preferences.some(row => row.name === TITLE && row.enabled && row.alias === preference.alias),
                    'Update disabled the learner\'s existing dictionary preference', { version, load, preferences });
                loads.push(stored);
            }
            reports.push({ oldVersion: version, noReimport: true, noArchive: true, loads });
        } finally {
            await context.close();
        }
    }
    return reports;
}

function assertStoredLibrary(stored, scenario) {
    const actual = {
        version: stored.version, titles: stored.titles,
        terms: stored.terms.map(term => ({ id: term.id, gloss: term.glossary[0] })),
        revision: stored.info.revision, importDate: stored.info.importDate, epoch: stored.epoch.token,
    };
    deepStrictEqual(actual, {
        version: 7, titles: [TITLE], terms: [{ id: 1, gloss: GLOSS }],
        revision: 'fixture-before-update', importDate: 100, epoch: '3:fixture-reset',
    }, `Update lost stored dictionary content or metadata: ${JSON.stringify(scenario)}`);
}

async function seedLegacyLibrary(page, version) {
    await page.evaluate(({ name, version, title, word, gloss, epoch }) => new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const [storeName, indexes] of [
                ['terms', ['expression', 'reading', 'dictionary']],
                ['kanji', ['character', 'dictionary']],
                ['termMeta', ['expression', 'dictionary']],
                ['kanjiMeta', ['character', 'dictionary']],
                ['termSearch', ['token', 'dictionary']],
                ['termKanji', ['character', 'dictionary']],
            ]) {
                const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                for (const index of indexes) store.createIndex(index, index);
            }
            db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
            if (version >= 6) db.createObjectStore('managedState', { keyPath: 'key' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction([...db.objectStoreNames], 'readwrite');
            const term = { expression: word, reading: 'としょかん', dictionary: title, glossary: [gloss], score: 10, sequence: 1 };
            tx.objectStore('terms').add(term);
            tx.objectStore('dictionaryInfo').put({ title, alias: 'Jitendex fixture', enabled: true, priority: 0,
                counts: { terms: 1 }, type: 'terms', revision: 'fixture-before-update', importDate: 100 });
            // Old derived rows copied full terms; current code must rebuild them
            // as postings while retaining the authoritative imported term.
            tx.objectStore('termSearch').add({ ...term, token: 'library' });
            tx.objectStore('termKanji').add({ ...term, character: '図' });
            if (version >= 6) tx.objectStore('managedState').put({ key: 'epoch', token: `${epoch.generation}:${epoch.resetId}` });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        };
    }), { name: yomitanDatabaseName(), version, title: TITLE, word: WORD, gloss: GLOSS, epoch: EPOCH });
}

async function readLibrary(page) {
    return page.evaluate(name => new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(['terms', 'dictionaryInfo', 'managedState'], 'readonly');
            const terms = tx.objectStore('terms').getAll();
            const info = tx.objectStore('dictionaryInfo').getAll();
            const epoch = tx.objectStore('managedState').get('epoch');
            tx.oncomplete = () => {
                const stored = { version: db.version, titles: info.result.map(row => row.title), info: info.result[0], terms: terms.result, epoch: epoch.result };
                db.close();
                resolve(stored);
            };
            tx.onerror = () => { db.close(); reject(tx.error); };
        };
    }), yomitanDatabaseName());
}
