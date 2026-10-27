#!/usr/bin/env node
// Built userscript + exact @require graph and @resource CSS on recorded real
// Wikipedia. Provider responses are mocked; no real Anki data is accessed.
// Filter probes toggle the existing root presentation classes on real rendered
// words, isolating F171's CSS precedence from Settings persistence/layout.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';
import { openRecordedPage } from './lib/recorded-page.mjs';
import { assert, launchSmokeBrowser, mockAnkiConnectResponse, mockJpdbParseFromVocabulary, readAnkiStatusStorage, readJsonBody } from './lib/smoke-harness.mjs';

const OUT = path.resolve('artifacts/anki-known-interval');
mkdirSync(OUT, { recursive: true });
const WORDS = [
    { text: '日本語', reading: 'にほんご', interval: 3, state: 'learning' },
    { text: '言語', reading: 'げんご', interval: 30, state: 'known' },
    { text: '使用', reading: 'しよう', interval: 30, state: 'due' },
    { text: '移民', reading: 'いみん', interval: 3, state: 'suspended' },
].map((word, index) => ({ ...word, cardId: index + 1, noteId: index + 101 }));
const ROWS = WORDS.map(word => [word.text, word.text, word.reading, word.text, ['n'], 100, ['not-in-deck'], []]);
const SETTINGS = {
    onboardingSeen: true, interfaceLanguage: 'en', apiKey: 'mock-jpdb-token', jitenApiKey: '',
    ankiEnabled: true, ankiMobileHandoff: false, ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiModel: 'Imported Core', jitenDefinitionsEnabled: false, ankiDeck: 'Core', localDictionariesEnabled: false,
    audioEnabled: false, autoPlayAudio: false, immersionKitEnabled: false,
    studyTranslationEnabled: false, studyGrammarEnabled: false, jpdbDefinitionsEnabled: false,
    ocrEnabled: false, showFloatingButton: false, enableLogging: false,
    // Keep the shipping Known/Due furigana filters and Known/Ignored colour
    // filters; an Anki colour channel exposes only the provider-neutral lane.
    wordUnderlineColorSource: 'status', wordTextColorSource: 'anki', wordHighlightColorSource: 'off',
};
const byId = id => WORDS.find(word => word.cardId === Number(id));
const notes = ids => ids.map(id => WORDS.find(word => word.noteId === Number(id))).filter(Boolean).map(word => ({
    noteId: word.noteId, modelName: 'Imported Core', tags: [], cards: [word.cardId],
    fields: { Expression: { value: word.text }, Reading: { value: word.reading }, Meaning: { value: word.text } },
}));
const queries = [];
function anki(action, params) {
    if (action === 'version') return 6;
    if (action === 'findCards') {
        queries.push(params.query);
        if (params.query === 'deck:*') return WORDS.map(word => word.cardId);
        if (params.query === 'deck:* is:due') return [3];
        if (params.query === 'deck:* is:suspended') return [4];
        if (params.query === 'deck:* is:review prop:ivl<21') return [1, 4];
        return [];
    }
    if (action === 'cardsToNotes') return params.cards.map(id => byId(id).noteId);
    if (action === 'getDecks') return { Core: params.cards };
    if (action === 'getDeckStats') return { 1: { name: 'Core', total_in_deck: WORDS.length } };
    if (action === 'findNotes') return WORDS.filter(word => params.query === 'deck:*' || String(params.query).includes(word.text) || String(params.query).includes(word.reading)).map(word => word.noteId);
    if (action === 'notesInfo') return notes(params.notes);
    if (action === 'areDue') return params.cards.map(id => Number(id) === 3);
    if (action === 'cardsInfo') return params.cards.map(id => { const word = byId(id); return { cardId: word.cardId, note: word.noteId, deckName: 'Core', queue: word.state === 'suspended' ? -1 : 2, type: 2, interval: word.interval, due: 100, reps: 5, lapses: 0 }; });
    if (action === 'modelFieldNames') return ['Expression', 'Reading', 'Meaning'];
    if (action === 'modelNames') return ['Imported Core'];
    if (action === 'deckNames') return ['Core'];
    return null;
}
const jsonAnswer = value => ({ status: 200, body: JSON.stringify(value), contentType: 'application/json; charset=utf-8' });
function network(request) {
    const url = new URL(request.url);
    if (url.port === '8765') return jsonAnswer(mockAnkiConnectResponse(readJsonBody(request.data), anki));
    if (url.hostname === 'jpdb.io' && url.pathname === '/api/v1/parse') return jsonAnswer(mockJpdbParseFromVocabulary(readJsonBody(request.data), ROWS, { tokenReading: word => [[word.surface, word.reading]] }));
    if (url.hostname === 'api.jiten.moe') return jsonAnswer([]);
    return undefined;
}
const requested = process.env.YOMU_ANKI_INTERVAL_ENGINE;
for (const engine of requested ? [requested] : ['chromium', 'webkit']) {
    assert(['chromium', 'webkit'].includes(engine), `Unknown engine ${engine}`);
    queries.length = 0;
    const browser = await launchSmokeBrowser(engine === 'webkit' ? webkit : chromium, engine, { headless: true });
    let run;
    const report = { engine, recording: 'ja-wikipedia-nihongo', providerData: 'mock', checks: [] };
    try {
        run = await openRecordedPage({ browser, slug: 'ja-wikipedia-nihongo', settings: SETTINGS, onGmRequest: network,
            gmNetwork: 'offline',
            contextOptions: engine === 'webkit' ? { ...devices['iPad (gen 7)'], viewport: { width: 820, height: 1180 } } : { viewport: { width: 1280, height: 900 } },
        });
        let page = run.page;
        await page.waitForFunction(() => ['日本語', '言語', '使用', '移民'].every(text => document.querySelector(`.jpdb-reader-word[data-expression="${text}"].yomu-review-${({ 日本語: 'learning', 言語: 'known', 使用: 'due', 移民: 'suspended' })[text]}`)), null, { timeout: 45000 });
        await page.waitForFunction(() => document.querySelector('.jpdb-reader-word[data-expression="日本語"] .jpdb-reader-furi'), null, { timeout: 15000 });
        await page.waitForFunction(() => { const index = JSON.parse(localStorage.getItem('yomu:anki-status-index:v1') ?? 'null'); return index?.cardCount === 4; }, null, { timeout: 45000 });
        const snapshot = () => page.evaluate(words => Object.fromEntries(words.map(text => {
            const word = document.querySelector(`.mw-parser-output p .jpdb-reader-word[data-expression="${text}"]`) ?? document.querySelector(`.jpdb-reader-word[data-expression="${text}"]`);
            const rt = word.querySelector('.jpdb-reader-furi'); const css = getComputedStyle(word);
            return [text, { classes: word.className, readingVisible: Boolean(rt && getComputedStyle(rt).display !== 'none' && getComputedStyle(rt).visibility !== 'hidden'),
                underline: css.getPropertyValue('--jpdb-reader-word-underline').trim(), style: css.getPropertyValue('--jpdb-reader-word-underline-style').trim(),
                border: getComputedStyle(word, '::after').borderBottomStyle, colour: css.color }];
        })), WORDS.map(word => word.text));
        const check = (condition, message, detail) => { report.checks.push({ message, passed: Boolean(condition), detail }); assert(condition, `${engine}: ${message}`, detail); };
        const defaults = await snapshot();
        check(defaults.日本語.readingVisible && defaults.日本語.style === 'dashed' && defaults.日本語.underline !== 'transparent', 'ivl 3 retains reading and dashed Learning underline', defaults);
        check(!defaults.言語.readingVisible && !defaults.使用.readingVisible, 'ivl 30 Known and Due hide readings by default', defaults);
        check(defaults.使用.style === 'dotted' && defaults.使用.underline !== 'transparent', 'Due outranks JPDB not-in-deck on Status underline', defaults.使用);
        report.storage = await readAnkiStatusStorage(page);
        check(report.storage.cardCount === 4, 'complete index refresh stored all four cards', report.storage);
        check(queries.filter(query => query === 'deck:* is:review prop:ivl<21').length === 1 && queries.length === 7, 'exactly one additional findCards per index refresh (7 total)', queries.slice());
        report.queries = queries.slice();
        // A fresh page with no hidden groups isolates CSS filters. Put their
        // existing classes on the recorded content root: the app owns and
        // reapplies the document root's settings classes while scanning.
        await run.close();
        run = await openRecordedPage({ browser, slug: 'ja-wikipedia-nihongo',
            settings: { ...SETTINGS, furiganaMode: 'all', furiganaHiddenStateGroups: [], wordColorHiddenStateGroups: [] },
            onGmRequest: network, gmNetwork: 'offline',
            contextOptions: engine === 'webkit' ? { ...devices['iPad (gen 7)'], viewport: { width: 820, height: 1180 } } : { viewport: { width: 1280, height: 900 } },
        });
        page = run.page;
        await page.waitForFunction(() => ['日本語', '言語', '使用', '移民'].every(text => document.querySelector(`.mw-parser-output p .jpdb-reader-word[data-expression="${text}"].yomu-review-${({ 日本語: 'learning', 言語: 'known', 使用: 'due', 移民: 'suspended' })[text]}`)), null, { timeout: 45000 });
        await page.waitForFunction(() => ['日本語', '言語', '使用'].every(text => document.querySelector(`.mw-parser-output p .jpdb-reader-word[data-expression="${text}"] .jpdb-reader-furi`)), null, { timeout: 15000 });
        // Isolate all existing filters on that recorded content.
        await page.evaluate(() => {
            const root = document.querySelector('.mw-parser-output');
            root.classList.remove('yomu-furi-hide-known', 'yomu-furi-hide-due', 'yomu-word-color-hide-known', 'yomu-word-color-hide-ignored');
            root.classList.add('yomu-furi-hide-new', 'yomu-word-color-hide-new');
        });
        const hideNew = await snapshot();
        check(WORDS.slice(0, 3).every(word => hideNew[word.text].readingVisible && hideNew[word.text].underline !== 'transparent'), 'Hide New cannot suppress tracked review states through JPDB not-in-deck', hideNew);
        for (const state of ['known', 'due', 'learning']) {
            await page.evaluate(state => {
                const root = document.querySelector('.mw-parser-output');
                root.classList.remove('yomu-furi-hide-new', 'yomu-word-color-hide-new', 'yomu-furi-hide-known', 'yomu-furi-hide-due', 'yomu-furi-hide-learning', 'yomu-word-color-hide-known', 'yomu-word-color-hide-due', 'yomu-word-color-hide-learning');
                root.classList.add(`yomu-furi-hide-${state}`, `yomu-word-color-hide-${state}`);
            }, state);
            const hidden = await snapshot(); const target = WORDS.find(word => word.state === state).text;
            check(!hidden[target].readingVisible && hidden[target].underline === 'transparent', `Hide ${state} reaches provider-neutral review state`, hidden);
        }
        await page.evaluate(() => {
            document.querySelector('.mw-parser-output').classList.remove('yomu-word-color-hide-learning');
            document.querySelector('.mw-parser-output').classList.add('yomu-word-color-new-only');
        });
        const onlyNew = await snapshot();
        check(WORDS.slice(0, 3).every(word => onlyNew[word.text].underline === 'transparent'), 'Only New hides Learning, Due and Known despite JPDB not-in-deck', onlyNew);
        await page.screenshot({ path: path.join(OUT, `${engine}.png`) });
        report.pageErrors = run.pageErrors;
        console.log(`PASS ${engine}: ${report.checks.length} recorded-page interval/rendering checks`);
    } catch (error) {
        report.error = String(error);
        report.queries = queries.slice();
        if (run) {
            report.pageErrors = run.pageErrors;
            report.diagnostics = await run.page.evaluate(() => ({ root: document.documentElement.className, words: [...document.querySelectorAll('.jpdb-reader-word')].slice(0, 30).map(word => [word.dataset.expression, word.className]) })).catch(String);
            await run.page.screenshot({ path: path.join(OUT, `${engine}-failure.png`) }).catch(() => undefined);
        }
        console.error(JSON.stringify(report));
        throw error;
    } finally {
        writeFileSync(path.join(OUT, `${engine}.json`), `${JSON.stringify(report, null, 2)}\n`);
        if (run) await run.close();
        await browser.close();
    }
}
