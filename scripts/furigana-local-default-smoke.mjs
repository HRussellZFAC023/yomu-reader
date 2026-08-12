#!/usr/bin/env node
// Regression smoke: a default install that finished the onboarding offline
// setup (parserProvider 'local' + imported term/pitch dictionaries) must still
// decorate page text automatically — furigana on difficult kanji (including
// deinflected verbs) and pitch-accent classes at rest, with no API keys.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createReaderSmokeSettings,
    createSmokePaths,
    launchSmokeBrowser,
    startHtmlFixtureServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SETTINGS_COMPANION_PATH = path.join(ROOT, 'dist', 'greasyfork', 'yomu-settings-surface.user.js');
const YOMITAN_STORE_SOURCE_PATH = path.join(ROOT, 'src', 'reader', 'dictionaries', 'yomitan', 'index.ts');
const YOMITAN_DB_NAME = readYomitanDbName(YOMITAN_STORE_SOURCE_PATH);
const PAGE_PATH = '/furigana-local-default.html';
const REQUEST_BRIDGE_NAME = '__yomuFuriganaLocalSmokeRequest';
const DICTIONARY_TITLE = 'Mini Jitendex';
const LANGUAGE_PROFILE_ID = 'furigana-local-default-smoke';
const SENTENCE = '図書館で漢字を調べています。練習をします。';
const NOUNS = ['図書館', '漢字', '練習'];

const settings = createReaderSmokeSettings({
    onboardingSeen: true,
    learningTargetChosen: true,
    activeLanguageProfileId: LANGUAGE_PROFILE_ID,
    languageProfiles: [{
        schemaVersion: 2,
        id: LANGUAGE_PROFILE_ID,
        outputLanguage: 'en',
        learnerLanguage: 'en',
        targetLanguage: 'ja',
        uiLocale: 'en',
        parserProvider: 'local',
        dictionaries: {
            installed: [DICTIONARY_TITLE],
            enabled: [DICTIONARY_TITLE],
            order: [DICTIONARY_TITLE],
        },
        definitionTranslationProviderIds: [],
    }],
    apiKey: '',
    parserProvider: 'local',
    localDictionariesEnabled: true,
    dictionaryPreferences: [{
        name: DICTIONARY_TITLE,
        alias: DICTIONARY_TITLE,
        enabled: true,
        priority: 0,
        type: 'terms',
    }],
    showFurigana: true,
    furiganaMode: 'difficult-kanji',
    showPitchAccent: true,
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
});

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const server = await startHtmlFixtureServer(
    PAGE_PATH,
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>furigana local default smoke</title></head>
    <body><main><p data-smoke-sentence>${SENTENCE}</p></main></body></html>`,
    'Could not bind furigana local default smoke server',
);
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    await runFuriganaLocalDefaultSmoke(browser, server.origin);
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function runFuriganaLocalDefaultSmoke(browser, fixtureOrigin) {
    const { context, page, externalRequests } = await createFuriganaSmokePage(browser);
    await prepareLocalDictionaryFixture(page, fixtureOrigin);
    let state = await readWordState(page);
    assertOffhostPrivacy(state);
    assertVisibleLocalFurigana(state);
    await waitForLibraryPitch(page);
    state = await readWordState(page);
    assertLibraryPitch(state);
    assertNoExternalDictionaryEnrichment(externalRequests);
    await recordFuriganaSmoke(page, state, externalRequests);
    await context.close();
}

function assertNoExternalDictionaryEnrichment(externalRequests) {
    const seededTerms = ['図書館', '漢字', '調べる', '練習'];
    const leakedSeededTerms = externalRequests.filter(url => seededTerms.some(term => decodeURIComponent(url).includes(term)));
    assert(leakedSeededTerms.length === 0, 'Seeded local dictionary terms leaked to a provider request', { leakedSeededTerms });
}

async function createFuriganaSmokePage(browser) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    installSmokeDebugLogging(page);
    const externalRequests = [];
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => {
        externalRequests.push(request.url);
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    return { context, page, externalRequests };
}

function installSmokeDebugLogging(page) {
    if (!process.env.SMOKE_DEBUG) return;
    page.on('console', message => console.error('[console]', message.type(), message.text().slice(0, 300)));
    page.on('pageerror', error => console.error('[pageerror]', error.message.slice(0, 300)));
}

async function prepareLocalDictionaryFixture(page, fixtureOrigin) {
    // Prepare the post-import backend state before Yomu boots. The harness owns
    // this fixture database; an off-host page never receives settings/import UI.
    await page.goto(`${fixtureOrigin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await seedMiniDictionaryBackend(page);
    await injectLocalDictionaryReader(page);
    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 4, null, { timeout: 20_000 });
}

async function readWordState(page) {
    return page.evaluate(nouns => {
        const words = [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')]
            .map(renderedWordState);
        const bySurface = surface => words.find(word => word.expression === surface || word.surface.startsWith(surface));
        return {
            words,
            nouns: nouns.map(noun => ({ noun, word: bySurface(noun) })),
            verb: words.find(word => word.expression === '調べる' || word.surface.startsWith('調')),
            settingsSurfaceCount: document.querySelectorAll('.jpdb-reader-settings').length,
            importControlCount: document.querySelectorAll('[data-action="import-yomitan-dictionary"]').length,
        };

        function renderedWordState(word) {
            return {
                surface: surfaceText(word),
                expression: attributeValue(word, 'data-expression'),
                hasFuri: word.classList.contains('jpdb-reader-has-furi'),
                rubyVisible: visibleRuby(word.querySelector('ruby rt')),
                pitchClass: attributeValue(word, 'data-pitch-class'),
                pitchAccent: attributeValue(word, 'data-pitch-accent'),
                privateProviderAttributes: privateProviderAttributes(word),
            };
        }

        function visibleRuby(ruby) {
            if (!(ruby instanceof HTMLElement)) return false;
            return [rubyStyleIsVisible, rubyHasText, rubyHasHeight].every(predicate => predicate(ruby));
        }

        function rubyStyleIsVisible(ruby) {
            const style = getComputedStyle(ruby);
            return style.display !== 'none' && style.visibility !== 'hidden';
        }

        function rubyHasText(ruby) {
            return (ruby.textContent || '').trim().length > 0;
        }

        function rubyHasHeight(ruby) {
            return ruby.getBoundingClientRect().height > 0;
        }

        function surfaceText(word) {
            return word.getAttribute('data-surface') || word.textContent || '';
        }

        function attributeValue(word, name) {
            return word.getAttribute(name) || '';
        }

        function privateProviderAttributes(word) {
            return [
                'data-vid',
                'data-sid',
                'data-card-source',
                'data-card-id',
                'data-reading-index',
            ].filter(attribute => word.hasAttribute(attribute));
        }
    }, NOUNS);
}

function assertOffhostPrivacy(state) {
    assert(state.words.length >= 4, 'Local-first parse did not annotate the fixture sentence', state);
    assert(state.settingsSurfaceCount + state.importControlCount === 0, 'Off-host fixture exposed settings or dictionary-import DOM', state);
    const identityLeaks = state.words.filter(word => word.privateProviderAttributes.length > 0);
    assert(identityLeaks.length === 0, 'Off-host reader words exposed private provider identity', identityLeaks);
}

function assertVisibleLocalFurigana(state) {
    // Furigana must be present at rest immediately after the scan applies.
    for (const { noun, word } of state.nouns) {
        assert(word, `No reader word rendered for ${noun}`, state);
        assert(word.hasFuri, `${noun} lost its furigana markup in local-first parsing`, word);
        assert(word.rubyVisible, `${noun} furigana was not visible at rest`, word);
    }
    assert(state.verb, 'No reader word rendered for the inflected verb 調べて', state);
    assert(state.verb.hasFuri, 'Deinflected verb 調べて lost its furigana markup', state.verb);
    assert(state.verb.rubyVisible, 'Deinflected verb 調べて furigana was not visible at rest', state.verb);
}

async function waitForLibraryPitch(page) {
    // Pitch accent must resolve from the imported pitch bank shortly after
    // apply (local IndexedDB enrichment — no network involved).
    await page.waitForFunction(() => {
        const word = [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')]
            .find(candidate => candidate.getAttribute('data-expression') === '図書館');
        if (!word) return false;
        const pitchClass = word.getAttribute('data-pitch-class') ?? '';
        return pitchClass !== '' && pitchClass !== 'unknown';
    }, null, { timeout: 15_000 });
}

function assertLibraryPitch(state) {
    const library = state.nouns.find(({ noun }) => noun === '図書館')?.word;
    assert(library && library.pitchClass !== '' && library.pitchClass !== 'unknown', 'Imported local pitch was not painted on 図書館', state);
}

async function recordFuriganaSmoke(page, state, externalRequests) {
    const screenshotPath = path.join(ARTIFACTS, 'furigana-local-default-smoke.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const report = {
        ok: true,
        sentence: SENTENCE,
        words: state.words,
        externalRequests,
        screenshot: screenshotPath,
    };
    writeFileSync(path.join(ARTIFACTS, 'furigana-local-default-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('furigana-local-default smoke passed');
}

function readYomitanDbName(sourcePath) {
    const source = readFileSync(sourcePath, 'utf8');
    const name = source.match(/^const DB_NAME = '([^']+)';/m)?.[1];
    if (!name) throw new Error(`Could not read the Yomitan DB name from ${sourcePath}`);
    return name;
}

async function injectLocalDictionaryReader(page) {
    await installUserscriptCssResource(page, CSS_PATH);
    for (const scriptPath of [SETTINGS_COMPANION_PATH, SCRIPT_PATH]) {
        await addScriptTagWithCspFallback(page, scriptPath);
    }
    await page.locator('#jpdb-reader-runtime-owner').waitFor({ state: 'attached', timeout: 8000 });
}

async function seedMiniDictionaryBackend(page) {
    await page.evaluate(async ({ dbName, dictionaryTitle }) => {
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(dbName);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Fixture dictionary database deletion was blocked'));
        });
        const db = await new Promise((resolve, reject) => {
            // Version 1 is deliberate: production owns every later migration,
            // including derived indexes and the managed-state epoch marker.
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = () => installFixtureStores(request);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const terms = [
            term('図書館', 'としょかん', '', 'library', 1),
            term('漢字', 'かんじ', '', 'kanji', 2),
            term('調べる', 'しらべる', 'v1', 'to look up', 3),
            term('練習', 'れんしゅう', 'vs', 'practice', 4),
        ];
        const pitch = [
            meta('図書館', 'としょかん', 2),
            meta('漢字', 'かんじ', 0),
            meta('調べる', 'しらべる', 3),
            meta('練習', 'れんしゅう', 0),
        ];
        const tx = db.transaction(['dictionaryInfo', 'terms', 'termMeta'], 'readwrite');
        const complete = transactionCompletion(tx);
        tx.objectStore('dictionaryInfo').put({
            title: dictionaryTitle,
            alias: dictionaryTitle,
            enabled: true,
            priority: 0,
            type: 'terms',
            counts: { terms: terms.length, termMeta: pitch.length },
        });
        terms.forEach(entry => tx.objectStore('terms').add(entry));
        pitch.forEach(entry => tx.objectStore('termMeta').add(entry));
        await complete;
        db.close();

        function installFixtureStores(request) {
            const terms = request.result.createObjectStore('terms', { keyPath: 'id', autoIncrement: true });
            terms.createIndex('expression', 'expression');
            terms.createIndex('reading', 'reading');
            terms.createIndex('dictionary', 'dictionary');
            const termMeta = request.result.createObjectStore('termMeta', { keyPath: 'id', autoIncrement: true });
            termMeta.createIndex('expression', 'expression');
            termMeta.createIndex('dictionary', 'dictionary');
            request.result.createObjectStore('dictionaryInfo', { keyPath: 'title' });
        }

        function term(expression, reading, rules, gloss, sequence) {
            return { expression, reading, definitionTags: '', rules, score: 10, glossary: [gloss], sequence, termTags: '', dictionary: dictionaryTitle };
        }

        function meta(expression, reading, position) {
            return { expression, mode: 'pitch', data: { reading, pitches: [{ position }] }, dictionary: dictionaryTitle };
        }

        function transactionCompletion(transaction) {
            return new Promise((resolve, reject) => {
                transaction.addEventListener('complete', () => resolve(), { once: true });
                transaction.addEventListener('error', () => reject(transaction.error), { once: true });
                transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
            });
        }
    }, { dbName: YOMITAN_DB_NAME, dictionaryTitle: DICTIONARY_TITLE });
}
