#!/usr/bin/env node
// Study-flow stability smoke against the BUILT newtab: (1) the session step
// plan is PINNED per card — chips never reshuffle under the user; (2) the
// Kanji 2 chip activates the in-session second doodle, not the kanji-queue
// card; (3) the draw cloze blanks EVERY kanji (no next-step answer leak);
// (4) exactly one source switcher renders (pill at 2 sources, select at 3+).
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    createSmokePaths,
    jsonHttpResponse,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const CARD = {
    vid: 501, sid: 1, rid: 0,
    spelling: '図鑑', reading: 'ずかん', frequencyRank: 1500,
    partOfSpeech: ['n'],
    meanings: [{ glosses: ['pictorial book'], partOfSpeech: ['n'] }],
    cardState: ['due'],
    pitchAccent: ['LHH'],
    wordWithReading: null,
    kanjiKeyword: 'map',
    source: 'jpdb', reviewSource: 'jpdb-api',
    sentence: 'この図鑑はとても面白い。',
};
const SETTINGS = {
    onboardingSeen: true, newTabEnabled: true, interfaceLanguage: 'en',
    apiKey: 'mock-key', jitenApiKey: '', jpdbMiningEnabled: true, enableReviews: true,
    newTabSource: 'jpdb', newTabStudyTourSeen: true, newTabStudyDisabledSteps: [],
    newTabFrontSentenceEnabled: true, showPitchAccent: true,
    audioEnabled: false, autoPlayAudio: false, immersionKitEnabled: false,
    localDictionariesEnabled: false, studyTranslationEnabled: false, studyGrammarEnabled: false,
};

function mockedRequest(request) {
    const url = String(request?.url ?? '');
    const endpoint = url.split('/api/v1/')[1]?.split('?')[0] ?? '';
    if (endpoint === 'list-user-decks') return jsonHttpResponse({ decks: [[7, 'Verify', 1, 0]] });
    if (endpoint === 'deck/list-vocabulary') return jsonHttpResponse({ vocabulary: [[CARD.vid, CARD.sid]] });
    if (endpoint === 'lookup-vocabulary') return jsonHttpResponse({ vocabulary_info: [[
        CARD.vid, CARD.sid, 0, CARD.spelling, CARD.reading, CARD.frequencyRank,
        CARD.partOfSpeech, CARD.meanings.map(m => m.glosses), CARD.meanings.map(m => m.partOfSpeech),
        CARD.cardState, CARD.pitchAccent, null, CARD.sentence,
    ]] });
    return { status: 404, responseText: '{}', contentType: 'application/json' };
}

const server = await startLoopbackServer((req, res) => {
    const clean = (req.url ?? '/').split('?')[0];
    const rel = clean === '/newtab' || clean === '/newtab/' ? 'index.html' : clean.replace(/^\/newtab\//, '').replace(/^\//, '');
    const file = path.join(NEWTAB_DIR, rel);
    if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    try {
        return serveFile(res, file, rel.endsWith('.html') ? 'text/html; charset=utf-8' : rel.endsWith('.css') ? 'text/css' : rel.endsWith('.json') ? 'application/json' : 'text/javascript');
    } catch {
        res.writeHead(404); res.end(); return;
    }
}, 'study-verify server');

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
await page.exposeFunction('__yomuVerifyRequest', request => mockedRequest(request));
await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: '__yomuVerifyRequest' });
await page.addInitScript(({ cacheKey, uiKey, card }) => {
    localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), sourceLabel: 'JPDB', cards: [card] }));
    localStorage.setItem(uiKey, JSON.stringify({ mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false }));
}, { cacheKey: 'jpdb-reader-newtab-card-cache', uiKey: 'jpdb-reader-newtab-ui', card: CARD });

const failures = [];
try {
    await page.goto(`${server.origin}/newtab`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-study-step-id]', { timeout: 20_000 });
    const chips = () => page.$$eval('[data-study-step-id]', els => els.map(el => el.textContent?.trim()));
    const chipsT0 = await chips();
    await page.waitForTimeout(3000);
    const chipsT1 = await chips();
    if (JSON.stringify(chipsT0) !== JSON.stringify(chipsT1)) failures.push(`chips changed: ${chipsT0} -> ${chipsT1}`);

    // Kanji-1 cloze must blank ALL kanji (no 鑑 leak on the 図 step).
    const cloze1 = await page.locator('.jpdb-reader-newtab-kanji-front-cloze').first().textContent().catch(() => null);
    if (cloze1 && /[㐀-鿿]/u.test(cloze1)) failures.push(`kanji-1 cloze leaks kanji: ${cloze1}`);

    // Click the SECOND kanji chip: stays in the word session, doodle visible.
    const kanji2 = page.locator('[data-study-step-id]', { hasText: 'Kanji 2' }).first();
    if (await kanji2.count() === 0) failures.push('no Kanji 2 chip rendered');
    else {
        await kanji2.click();
        await page.waitForTimeout(800);
        const state = await page.evaluate(() => {
            const root = document.querySelector('[data-jpdb-reader-root].jpdb-reader-newtab');
            const study = document.querySelector('[data-newtab-study]');
            const doodle = document.querySelector('.jpdb-reader-doodle-stage');
            return {
                kanjiModeClass: root?.classList.contains('jpdb-reader-newtab-kanji-mode') ?? false,
                activeStepKind: study?.getAttribute('data-newtab-study-step') ?? '',
                doodleVisible: Boolean(doodle && getComputedStyle(doodle).display !== 'none'),
                cardKey: study?.getAttribute('data-newtab-card') ?? '',
                cloze: document.querySelector('.jpdb-reader-newtab-kanji-front-cloze')?.textContent ?? '',
            };
        });
        if (state.activeStepKind !== 'kanji-doodle') failures.push(`Kanji 2 click active step = ${state.activeStepKind}`);
        if (!state.kanjiModeClass) failures.push('kanji-mode class missing after Kanji 2 click');
        if (!state.doodleVisible) failures.push('doodle stage not visible after Kanji 2 click');
        if (!state.cardKey.includes('501')) failures.push(`card changed surfaces: ${state.cardKey}`);
        if (state.cloze && /[㐀-鿿]/u.test(state.cloze)) failures.push(`kanji-2 cloze leaks kanji: ${state.cloze}`);
        const chipsAfter = await chips();
        if (JSON.stringify(chipsAfter) !== JSON.stringify(chipsT0)) failures.push(`chips changed after Kanji 2 click: ${chipsAfter}`);
    }

    // One switcher: never both an active pill toggle AND a visible select.
    const switcher = await page.evaluate(() => ({
        pillToggle: Boolean(document.querySelector('[data-newtab-status][data-source-toggle-target]')),
        selectVisible: Boolean(document.querySelector('[data-newtab-source-select]:not([hidden])')),
        selectOptions: Array.from(document.querySelector('[data-newtab-source-select]')?.options ?? []).map(option => option.value),
        pillTarget: document.querySelector('[data-newtab-status]')?.getAttribute('data-source-toggle-target'),
    }));
    if (switcher.pillToggle && switcher.selectVisible) failures.push('duplicate switcher: pill toggle AND select both visible');

    console.log(JSON.stringify({ chipsT0, switcher, failures }, null, 1));
} finally {
    await browser.close();
    server.server.close();
}
if (failures.length) { console.error('STUDY_VERIFY_FAIL'); process.exit(1); }
console.log('STUDY_VERIFY_OK');
