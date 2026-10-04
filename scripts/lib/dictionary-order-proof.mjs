// GitHub #43 (BACKLOG-V2 C03, regressed in 1.8.71 and 1.8.81): the order a
// learner gives the definition sources in Settings must decide the order of the
// popup's sections AND which imported dictionary answers a word, and it must
// survive a reload, a second tab and an untouched Save. A later import only
// joins the end. A kanji dictionary orders the kanji section instead, so it is
// shown and ordered in the Kanji editor alone, with the same guarantees.
//
// Settings and imports run where a learner runs them since 1.9.1: hosted Study
// with the built userscript installed, driven with trusted clicks. The popup
// runs on an ordinary FIXTURE page that reads the same GM settings and still
// holds page-local copies of the same dictionaries, which ADR-0010 keeps
// readable. Jiten answers keylessly from a local mock so a built-in source has
// a place in that order too; every other host answers 503.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    addGmStorageBridgeInitScript,
    assert,
    createSmokePaths,
    installGmStorageBridgeOnCurrentPage,
    startLoopbackServer,
    closeServer,
    YOMU_SETTINGS_KEY,
} from './smoke-harness.mjs';
import { addScriptTagWithCspFallback, addUserscriptGraphInitScripts, installUserscriptCssResource } from './smoke-test-helpers.mjs';
import {
    attachSmokeDebugLogging,
    fulfillHostedStudyAsset,
    HOSTED_STUDY_ORIGIN,
    HOSTED_STUDY_URL,
    importYomitanDictionaryThroughSettings,
    readPrefixedGmValues,
    writePrefixedGmValues,
} from './hosted-study-harness.mjs';
import { seedPageLocalDictionaries } from './lookup-perf-fixture.mjs';

const { artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(path.join(import.meta.dirname, '..'));
const REQUEST_BRIDGE_NAME = '__yomuDictionaryOrderRequest';
const GM_STORAGE_PREFIX = '__yomu_dictionary_order_gm__:';
const INTENT_LEDGER_KEY = 'yomu:settings-intent:v2';
const COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';
const PAGE_PATH = '/dictionary-order-fixture.html';
const CATALOG_URL = 'https://dictionaries.yomureader.com/v1/catalog.json';
// Settings hides the dictionary shelf until the published catalogue answers
// whether the target has dictionaries at all.
const CATALOG = { entries: [{ id: 'fixture-ja', distribution: { state: 'published' }, headwordLanguages: ['ja'] }] };
const JITEN = { id: '__jiten__', wordId: 4304300, gloss: 'library (Jiten)' };
const LIBRARY = '図書館';
const JAPAN = '日本';
// Both dictionaries define both words. 日本 differs in reading, so whichever
// dictionary answers it decides what the page and the popup read.
const ALPHA = dictionary('Alpha Dict', [[LIBRARY, 'としょかん', 'library (Alpha)'], [JAPAN, 'にほん', 'Japan (Alpha)']]);
const BETA = dictionary('Beta Dict', [[LIBRARY, 'としょかん', 'library (Beta)'], [JAPAN, 'にっぽん', 'Japan (Beta)']]);
const GAMMA = dictionary('Gamma Dict', [[LIBRARY, 'としょかん', 'library (Gamma)']]);
const KANJI = { title: 'Kanji Fixture', kanji: [['館', 'カン', 'やかた たて', '', ['building', 'mansion'], {}]] };
const KANJI_ROW = `__kanji_dictionary__:${KANJI.title}`;
const SOURCES_EDITOR = '[data-definition-source-editor]';
const KANJI_EDITOR = '.jpdb-reader-kanji-priorities';
const SETTINGS = {
    onboardingSeen: true,
    learningTargetChosen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    parserProvider: 'local',
    showFurigana: true,
    furiganaMode: 'all',
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    showFloatingButton: false,
    lookupOnClick: true,
    popupActivationMode: 'click',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

/** Runs the whole proof in `browser` and returns the evidence it asserted. */
export async function proveDictionaryOrder(browser) {
    const server = await startLoopbackServer(serveFixturePage, 'Could not bind dictionary order fixture server');
    try {
        const study = await proveOrderOnStudy(browser);
        const kanji = await proveKanjiDictionaryOrderOnStudy(browser);
        const beforeReorder = await lookUpOnOrdinaryPage(browser, server.origin, study.gmAfterImport, [ALPHA, BETA], 'after-import');
        const afterReorder = await lookUpOnOrdinaryPage(browser, server.origin, study.gmAfterAppend, [ALPHA, BETA, GAMMA], 'after-reorder');
        assertOrdinaryLookups(study, beforeReorder, afterReorder);
        return { study: study.evidence, kanji, ordinary: { beforeReorder, afterReorder } };
    } finally {
        await closeServer(server.server);
    }
}

async function proveOrderOnStudy(browser) {
    const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1100, height: 900 } });
    try {
        await installStudyContext(context);
        const page = await newStudyTab(context, 'study');

        await openSettings(page, 'backup');
        await importYomitanDictionaryThroughSettings(page, { ...ALPHA, gmStoragePrefix: GM_STORAGE_PREFIX });
        await importYomitanDictionaryThroughSettings(page, { ...BETA, gmStoragePrefix: GM_STORAGE_PREFIX });
        const imported = await openSettings(page, 'dictionaries');
        const builtIns = imported.filter(id => id.startsWith('__'));
        assert(sameList(imported, [...builtIns, ALPHA.title, BETA.title]),
            'Imported dictionaries were not appended after the built-in sources', { imported });
        const gmAfterImport = await readPrefixedGmValues(page, GM_STORAGE_PREFIX);
        const importedRecord = storedRecord(gmAfterImport);
        // The first Save after an import is untouched too: it writes back exactly
        // what the import stored, renumbering no source and recording no choice.
        const firstSave = await saveSettings(page);
        const firstSaveDiff = recordDifferences(importedRecord, firstSave);
        assert(!firstSaveDiff.length, 'The first untouched Save after an import changed the stored settings or intent records', firstSaveDiff);
        const afterFirstSave = await openSettings(page, 'dictionaries');
        assert(sameList(afterFirstSave, imported), 'The first untouched Save after an import reordered the shelf', { imported, afterFirstSave });
        const importedLookup = await studyLookup(page, LIBRARY);

        // The learner's order: Beta above every built-in, Alpha below them all.
        await openSettings(page, 'dictionaries');
        await moveRow(page, BETA.title, 'up', rows => rows[0] === BETA.title);
        await moveRow(page, ALPHA.title, 'down', rows => rows.at(-1) === ALPHA.title);
        const chosen = await sourceRows(page);
        assert(sameList(chosen, [BETA.title, ...builtIns, ALPHA.title]), 'Trusted reorder did not arrange the shelf', { chosen });
        const saved = await saveSettings(page);
        assert(sameList(profileOrder(saved), [BETA.title, ALPHA.title]), 'Save did not store the chosen dictionary order', profileOrder(saved));

        // Refresh: reload Study, then reach Sources through its own menu.
        await page.reload({ waitUntil: 'domcontentloaded' });
        const reloaded = await openSettingsFromStudyMenu(page);
        assert(sameList(reloaded, chosen), 'Chosen order did not survive a reload', { chosen, reloaded });

        // Untouched Save: the stored settings and intent records are byte-identical
        // apart from the per-write commit id.
        const untouched = await saveSettings(page);
        const untouchedDiff = recordDifferences(saved, untouched);
        assert(!untouchedDiff.length, 'An untouched Save changed the stored settings or intent records', untouchedDiff);

        // Second tab, and the lookup there follows the same order.
        const second = await newStudyTab(context, 'second-tab');
        await second.goto(HOSTED_STUDY_URL, { waitUntil: 'domcontentloaded' });
        const secondTab = await openSettingsFromStudyMenu(second);
        assert(sameList(secondTab, chosen), 'A second tab showed a different order', { chosen, secondTab });
        const reorderedLookup = await studyLookup(second, LIBRARY);
        await second.close();

        // A later import appends without moving anything already ordered.
        await openSettings(page, 'backup');
        await importYomitanDictionaryThroughSettings(page, { ...GAMMA, gmStoragePrefix: GM_STORAGE_PREFIX });
        const appended = await openSettings(page, 'dictionaries');
        assert(sameList(appended, [...chosen, GAMMA.title]), 'A new import moved an existing dictionary instead of appending', { chosen, appended });
        const gmAfterAppend = await readPrefixedGmValues(page, GM_STORAGE_PREFIX);
        const appendedRecord = storedRecord(gmAfterAppend);
        assert(sameList(profileOrder(appendedRecord), [BETA.title, ALPHA.title, GAMMA.title]), 'Stored order did not append the new import', profileOrder(appendedRecord));
        const existingRowsKept = JSON.stringify(preferenceRows(appendedRecord, [BETA.title, ALPHA.title]))
            === JSON.stringify(preferenceRows(untouched, [BETA.title, ALPHA.title]));
        assert(existingRowsKept, 'A new import rewrote the existing dictionaries\' stored rows', {
            before: preferenceRows(untouched, [BETA.title, ALPHA.title]),
            after: preferenceRows(appendedRecord, [BETA.title, ALPHA.title]),
        });

        assert(sameList(importedLookup, [JITEN.id, ALPHA.title, BETA.title]), 'Study lookup did not follow the imported order', { importedLookup });
        assert(sameList(reorderedLookup, [BETA.title, JITEN.id, ALPHA.title]), 'Study lookup did not follow the chosen order', { reorderedLookup });
        return {
            builtIns,
            gmAfterImport,
            gmAfterAppend,
            evidence: {
                imported,
                chosen,
                reloaded,
                secondTab,
                appended,
                storedOrder: { imported: profileOrder(importedRecord), saved: profileOrder(saved), appended: profileOrder(appendedRecord) },
                firstSaveAfterImport: { byteIdenticalApartFromCommitId: true, commitIds: [importedRecord.commit, firstSave.commit] },
                untouchedSave: { byteIdenticalApartFromCommitId: true, commitIds: [saved.commit, untouched.commit] },
                studyLookup: { imported: importedLookup, reordered: reorderedLookup },
            },
        };
    } finally {
        await context.close();
    }
}

// The kanji dictionary used to be a Sources row too, under the same form field
// names; Save read the Sources copy, so moving it in the Kanji editor saved
// nothing and it fell back to the end.
async function proveKanjiDictionaryOrderOnStudy(browser) {
    const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1100, height: 900 } });
    try {
        await installStudyContext(context);
        const page = await newStudyTab(context, 'kanji');

        await openSettings(page, 'backup');
        await importYomitanDictionaryThroughSettings(page, { ...KANJI, gmStoragePrefix: GM_STORAGE_PREFIX });
        const sources = await openSettings(page, 'dictionaries');
        const imported = await sourceRows(page, KANJI_EDITOR);
        assert(imported.at(-1) === KANJI_ROW, 'A kanji import did not join the end of the Kanji editor', { imported });
        const importedRecord = storedRecord(await readPrefixedGmValues(page, GM_STORAGE_PREFIX));
        const firstSave = await saveSettings(page);
        const firstSaveDiff = recordDifferences(importedRecord, firstSave);
        assert(!firstSaveDiff.length, 'The first untouched Save after a kanji import changed the stored settings or intent records', firstSaveDiff);

        await openSettings(page, 'dictionaries');
        await moveRow(page, KANJI_ROW, 'up', rows => rows[0] === KANJI_ROW, KANJI_EDITOR);
        const chosen = await sourceRows(page, KANJI_EDITOR);
        const saved = await saveSettings(page);
        const reopenedSources = await openSettings(page, 'dictionaries');
        const reopened = await sourceRows(page, KANJI_EDITOR);
        assert(sameList(reopened, chosen), 'A kanji dictionary moved in the Kanji editor did not keep its place', { chosen, reopened });
        assert(!sources.includes(KANJI.title), 'The Sources editor listed a kanji dictionary', { sources });
        assert(sameList(reopenedSources, sources), 'Moving a kanji dictionary changed the Sources editor', { sources, reopenedSources });
        const untouched = await saveSettings(page);
        const untouchedDiff = recordDifferences(saved, untouched);
        assert(!untouchedDiff.length, 'An untouched Save after a kanji move changed the stored settings or intent records', untouchedDiff);
        return {
            sources,
            imported,
            chosen,
            reopened,
            firstSaveAfterImport: { byteIdenticalApartFromCommitId: true, commitIds: [importedRecord.commit, firstSave.commit] },
            untouchedSave: { byteIdenticalApartFromCommitId: true, commitIds: [saved.commit, untouched.commit] },
        };
    } finally {
        await context.close();
    }
}

async function installStudyContext(context) {
    await context.route(url => url.origin !== HOSTED_STUDY_ORIGIN, route => {
        const response = externalResponse(route.request().url());
        return route.fulfill({ status: response.status, contentType: response.contentType, headers: { 'access-control-allow-origin': '*' }, body: response.responseText });
    });
    await context.route(`${HOSTED_STUDY_ORIGIN}/**`, route => fulfillHostedStudyAsset(route));
    await context.exposeFunction(REQUEST_BRIDGE_NAME, request => externalResponse(request.url));
    // One GM store per context, as a manager keeps one per installation;
    // `ifMissing` so a second tab or a reload never re-seeds over saved settings.
    await addGmStorageBridgeInitScript(context, {
        key: YOMU_SETTINGS_KEY,
        value: SETTINGS,
        requestBridgeName: REQUEST_BRIDGE_NAME,
        storagePrefix: GM_STORAGE_PREFIX,
        initialize: 'ifMissing',
        css: readFileSync(CSS_PATH, 'utf8'),
    });
    await addUserscriptGraphInitScripts(context, SCRIPT_PATH);
}

async function newStudyTab(context, label) {
    const page = await context.newPage();
    attachSmokeDebugLogging(page, label);
    return page;
}

/** A fresh document load of Study's Settings on `panel`, as the off-site launcher opens it. */
async function openSettings(page, panel) {
    await page.goto('about:blank');
    await page.goto(`${HOSTED_STUDY_URL}#settings=${panel}`, { waitUntil: 'domcontentloaded' });
    if (panel === 'backup') {
        await page.locator('.jpdb-reader-settings [data-action="import-yomitan-dictionary"]').waitFor({ state: 'visible', timeout: 30_000 });
        return [];
    }
    return waitForSourceRows(page);
}

/** Settings as a learner reaches it on Study: More, Connections & settings, Sources. */
async function openSettingsFromStudyMenu(page) {
    await page.locator('.jpdb-reader-newtab-more > summary').first().click({ timeout: 30_000 });
    await page.locator('.jpdb-reader-newtab-more-menu [data-newtab-action="settings"]').first().click();
    await page.locator('.jpdb-reader-settings [data-action="settings-panel"][data-panel="dictionaries"]').click();
    return waitForSourceRows(page);
}

async function waitForSourceRows(page) {
    for (const editor of [SOURCES_EDITOR, KANJI_EDITOR]) {
        await page.locator(`[data-settings-panel="dictionaries"]:not([hidden]) ${editor} [data-source-row]`).first()
            .waitFor({ state: 'visible', timeout: 30_000 });
    }
    return sourceRows(page);
}

function sourceRows(page, editor = SOURCES_EDITOR) {
    return page.locator(`${editor} [data-source-row]`)
        .evaluateAll(rows => rows.map(row => row.getAttribute('data-source-id') ?? ''));
}

async function moveRow(page, sourceId, direction, done, editor = SOURCES_EDITOR) {
    for (let step = 0; step < 20 && !done(await sourceRows(page, editor)); step += 1) {
        await page.locator(`${editor} [data-source-row][data-source-id="${sourceId}"] [data-action="dictionary-source-${direction}"]`).click();
    }
    assert(done(await sourceRows(page, editor)), `Could not move ${sourceId} ${direction}`, { rows: await sourceRows(page, editor) });
}

/**
 * Presses Save and waits until the settings/intent pair carries a new commit.
 * Save keeps Settings open with "Settings saved." in its footer; Cancel then
 * closes it without touching what was stored.
 */
async function saveSettings(page) {
    const before = storedRecord(await readPrefixedGmValues(page, GM_STORAGE_PREFIX)).commit;
    await page.locator('.jpdb-reader-settings button[type="submit"]').click();
    await page.waitForFunction(({ prefix, settingsKey, ledgerKey, field, previous }) => {
        const read = key => JSON.parse(localStorage.getItem(`${prefix}${key}`) ?? 'null');
        const settings = read(settingsKey);
        const ledger = read(ledgerKey);
        return Boolean(settings?.[field] && settings[field] !== previous && ledger?.[field] === settings[field]);
    }, { prefix: GM_STORAGE_PREFIX, settingsKey: YOMU_SETTINGS_KEY, ledgerKey: INTENT_LEDGER_KEY, field: COMMIT_FIELD, previous: before }, { timeout: 15_000 });
    await page.locator('.jpdb-reader-settings [data-settings-save-status]:not([hidden])', { hasText: 'Settings saved.' })
        .waitFor({ state: 'visible', timeout: 15_000 });
    const saved = storedRecord(await readPrefixedGmValues(page, GM_STORAGE_PREFIX));
    await moveAfterSaveClearsConfirmation(page);
    await page.locator('.jpdb-reader-settings [data-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'), undefined, { timeout: 15_000 });
    const afterCancel = storedRecord(await readPrefixedGmValues(page, GM_STORAGE_PREFIX));
    const cancelDiff = recordDifferences(saved, afterCancel);
    assert(!cancelDiff.length && saved.commit === afterCancel.commit, 'Cancel after a Save changed the stored settings or intent records', cancelDiff);
    return afterCancel;
}

/**
 * A Popup order move after Save is not saved: the footer must stop saying
 * "Settings saved.", and the Cancel that follows drops the move (the caller
 * checks that nothing stored changed).
 */
async function moveAfterSaveClearsConfirmation(page) {
    const arrow = page.locator(`[data-settings-panel="dictionaries"]:not([hidden]) ${SOURCES_EDITOR} [data-action="dictionary-source-down"]`).first();
    if (!await arrow.isVisible()) return;
    await arrow.click();
    await page.locator('.jpdb-reader-settings [data-settings-save-status]')
        .waitFor({ state: 'hidden', timeout: 5_000 })
        .catch(() => assert(false, '"Settings saved." stayed after an unsaved Popup order move'));
}

function storedRecord(gmValues) {
    const settings = JSON.parse(gmValues[YOMU_SETTINGS_KEY] ?? '{}');
    const ledger = JSON.parse(gmValues[INTENT_LEDGER_KEY] ?? '{}');
    return { settings, ledger, commit: settings[COMMIT_FIELD] ?? '' };
}

function profileOrder(record) {
    const active = record.settings.languageProfiles?.find(profile => profile.id === record.settings.activeLanguageProfileId);
    return active?.dictionaries?.order ?? [];
}

function preferenceRows(record, names) {
    return names.map(name => record.settings.dictionaryPreferences?.find(row => row.name === name) ?? null);
}

/** Every stored field that differs, ignoring only the per-write commit id. */
function recordDifferences(before, after) {
    const differences = [];
    for (const [label, left, right] of [['settings', before.settings, after.settings], ['intent', before.ledger, after.ledger]]) {
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
        keys.delete(COMMIT_FIELD);
        for (const key of keys) {
            const from = JSON.stringify(left[key]);
            const to = JSON.stringify(right[key]);
            if (from !== to) differences.push(`${label}.${key}: ${from?.slice(0, 160)} -> ${to?.slice(0, 160)}`);
        }
    }
    return differences;
}

/** Looks `word` up in Study's search and returns its definition sources in order. */
async function studyLookup(page, word) {
    await page.goto('about:blank');
    await page.goto(`${HOSTED_STUDY_URL}?q=${encodeURIComponent(word)}`, { waitUntil: 'domcontentloaded' });
    const result = page.locator(`[data-newtab-action="search-result-word"][data-expression="${word}"]`).first();
    await result.waitFor({ state: 'visible', timeout: 30_000 });
    await result.click();
    const detail = page.locator('[data-newtab-search-card-shell][data-newtab-search-expanded="true"] [data-newtab-search-detail]');
    return waitForDefinitionSources(detail);
}

// The sources this proof arranges: every imported dictionary card and Jiten.
async function waitForDefinitionSources(root) {
    await root.locator('[data-source="jiten"]').first().waitFor({ state: 'attached', timeout: 20_000 });
    await root.locator('[data-source="local-dictionary"]').first().waitFor({ state: 'attached', timeout: 20_000 });
    return root.evaluate(node => [...node.querySelectorAll('[data-source="jiten"], [data-source="local-dictionary"]')]
        .map(source => (source.getAttribute('data-source') === 'jiten' ? '__jiten__' : source.getAttribute('data-dictionary') ?? '')));
}

// The page-local copies are seeded in import order (Alpha first), so a popup
// that followed the store's own shelf instead of the learner's would show it.
async function lookUpOnOrdinaryPage(browser, origin, gmValues, dictionaries, label) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 900 } });
    try {
        await context.route(url => url.origin !== origin, route => {
            const response = externalResponse(route.request().url());
            return route.fulfill({ status: response.status, contentType: response.contentType, headers: { 'access-control-allow-origin': '*' }, body: response.responseText });
        });
        const page = await context.newPage();
        attachSmokeDebugLogging(page, `ordinary-${label}`);
        await page.exposeFunction(REQUEST_BRIDGE_NAME, request => externalResponse(request.url));
        await page.goto(`${origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
        await seedPageLocalDictionaries(page, dictionaries);
        const screenshot = path.join(ARTIFACTS, `dictionary-order-popup-${label}-${browser.browserType().name()}.png`);
        const first = await bootAndLookUp(page, gmValues, screenshot);
        // Refresh on the lookup surface too: the same answers after a reload.
        await page.goto(`${origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
        const reloaded = await bootAndLookUp(page, null);
        assert(JSON.stringify(reloaded) === JSON.stringify(first), `Ordinary-page lookups changed after a reload (${label})`, { first, reloaded });
        return { ...first, screenshot };
    } finally {
        await context.close();
    }
}

async function bootAndLookUp(page, gmValues, screenshot = '') {
    if (gmValues) await writePrefixedGmValues(page, GM_STORAGE_PREFIX, gmValues);
    await installGmStorageBridgeOnCurrentPage(page, {
        key: YOMU_SETTINGS_KEY,
        value: SETTINGS,
        requestBridgeName: REQUEST_BRIDGE_NAME,
        storagePrefix: GM_STORAGE_PREFIX,
        initialize: 'ifMissing',
    });
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')), null, { timeout: 15_000 });
    const word = text => page.locator('[data-order-sentence] .jpdb-reader-word', { hasText: text }).first();
    await word(JAPAN).waitFor({ state: 'attached', timeout: 30_000 });
    await word(LIBRARY).waitFor({ state: 'attached', timeout: 30_000 });
    const pageReading = await rubyReading(word(JAPAN));

    const library = await openPopover(page, word(LIBRARY));
    const sources = await waitForDefinitionSources(library);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
    await closePopover(page);
    const japan = await openPopover(page, word(JAPAN));
    await japan.locator('.jpdb-reader-spelling rt').first().waitFor({ state: 'attached', timeout: 15_000 });
    const popupReading = await rubyReading(japan.locator('.jpdb-reader-spelling'));
    await closePopover(page);
    return { sources, japan: { pageReading, popupReading } };
}

async function openPopover(page, word) {
    await word.click();
    const popover = page.locator('.jpdb-reader-popover').last();
    await popover.waitFor({ state: 'visible', timeout: 15_000 });
    return popover;
}

async function closePopover(page) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => ![...document.querySelectorAll('.jpdb-reader-popover')].some(node => node.getClientRects().length), null, { timeout: 10_000 });
}

function rubyReading(locator) {
    return locator.evaluate(node => [...node.querySelectorAll('rt')].map(rt => rt.textContent ?? '').join('').trim());
}

function assertOrdinaryLookups(study, beforeReorder, afterReorder) {
    assert(sameList(beforeReorder.sources, [JITEN.id, ALPHA.title, BETA.title]),
        'Ordinary-page popup did not follow the imported order', beforeReorder);
    assert(beforeReorder.japan.pageReading === 'にほん' && beforeReorder.japan.popupReading === 'にほん',
        'Alpha Dict did not answer 日本 while it was first', beforeReorder);
    assert(sameList(afterReorder.sources, [BETA.title, JITEN.id, ALPHA.title, GAMMA.title]),
        'Ordinary-page popup did not follow the chosen order', afterReorder);
    assert(afterReorder.japan.pageReading === 'にっぽん' && afterReorder.japan.popupReading === 'にっぽん',
        'Beta Dict did not answer 日本 once the learner put it first', afterReorder);
    assert(study.builtIns.includes(JITEN.id), 'The shelf listed no Jiten row to order against', study.builtIns);
}

function externalResponse(rawUrl) {
    const url = new URL(rawUrl);
    if (url.href === CATALOG_URL) return json(CATALOG);
    if (url.host === 'api.jiten.moe') return jitenResponse(url);
    return { status: 503, contentType: 'text/plain', responseText: '' };
}

function jitenResponse(url) {
    if (url.pathname === '/api/vocabulary/search') {
        const results = url.searchParams.get('query') === LIBRARY ? [{
            wordId: JITEN.wordId,
            readingIndex: 0,
            text: LIBRARY,
            rubyText: '図書館[としょかん]',
            frequencyRank: 3000,
            partsOfSpeech: ['noun'],
            meanings: [JITEN.gloss],
        }] : [];
        return json({ results });
    }
    if (url.pathname === `/api/vocabulary/${JITEN.wordId}/0/info`) {
        return json({
            wordId: JITEN.wordId,
            mainReading: { text: '図書館[としょかん]', readingIndex: 0, frequencyRank: 3000 },
            alternativeReadings: [],
            partsOfSpeech: ['noun'],
            definitions: [{ senseIndex: 0, englishMeanings: [JITEN.gloss], pos: ['noun'] }],
            pitchAccents: [2],
            knownStates: [],
            composedOf: [],
            usedIn: [],
        });
    }
    return { status: 404, contentType: 'text/plain', responseText: 'unknown Jiten endpoint' };
}

function json(value) {
    return { status: 200, contentType: 'application/json', responseText: JSON.stringify(value) };
}

function dictionary(title, rows) {
    return {
        title,
        terms: rows.map(([expression, reading, gloss], index) => [expression, reading, '', '', 10, [gloss], index + 1, '']),
    };
}

function sameList(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

function serveFixturePage(request, response) {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        return response.end('Not found');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>dictionary order fixture</title></head>
<body><main style="max-width:720px;margin:48px auto;font:20px/2.4 system-ui"><p>Fixture page (dictionary order smoke)</p><p data-order-sentence>${JAPAN}の${LIBRARY}で調べます。</p></main></body></html>`);
}
