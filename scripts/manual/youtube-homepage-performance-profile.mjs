#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    arrayParam,
    corsHeaders,
    dismissConsent,
    gmRequestFetchBody,
    mockAnkiConnectResponse,
    mockJpdbParseFromVocabulary,
    resolveAnkiAction,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';
import { createYomuPaths } from '../lib/paths.mjs';
import { cdpMetrics, metricDelta } from '../lib/cdp-performance-metrics.mjs';

const { appRoot, qaArtifactsRoot } = createYomuPaths(import.meta.dirname);
const userscriptPath = resolve(process.env.YOMU_HOME_PROFILE_USERSCRIPT ?? join(appRoot, 'dist/yomu.user.js'));
const cssPath = resolve(process.env.YOMU_HOME_PROFILE_CSS ?? join(appRoot, 'dist/yomu.css'));
const companionDir = resolve(process.env.YOMU_HOME_PROFILE_COMPANION_DIR ?? join(appRoot, 'dist/greasyfork'));
const companionPaths = ['yomu-anki.user.js', 'yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => join(companionDir, name))
    .filter(existsSync);
const outputRoot = resolve(process.env.YOMU_HOME_PROFILE_OUTPUT_DIR ?? join(qaArtifactsRoot, 'youtube-homepage-performance', process.env.YOMU_HOME_PROFILE_LABEL ?? 'latest'));
const stressDurationMs = Number(process.env.YOMU_HOME_PROFILE_STRESS_MS ?? 15_000);
const readyTimeoutMs = Number(process.env.YOMU_HOME_PROFILE_READY_TIMEOUT_MS ?? 30_000);
const thumbnailTimeoutMs = Number(process.env.YOMU_HOME_PROFILE_THUMBNAIL_TIMEOUT_MS ?? 12_000);
const headed = process.env.YOMU_HOME_PROFILE_HEADED === '1';
const captureConsole = process.env.YOMU_HOME_PROFILE_CAPTURE_CONSOLE === '1';
const profileDir = process.env.YOMU_HOME_PROFILE_USER_DATA_DIR?.trim();
const channel = process.env.YOMU_HOME_PROFILE_CHANNEL || 'chrome';
const requestBridgeName = '__yomuYoutubeHomePerfRequest';
const jpdbParseUrl = 'https://jpdb.io/api/v1/parse';
const ankiConnectUrl = 'http://127.0.0.1:8765';
const vocabularyRows = [
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['known'], ['LHHH']],
    ['字幕', '字幕', 'じまく', 'subtitles', ['n'], 1500, ['known'], ['LHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['n', 'vs'], 900, ['known'], ['LHHH']],
    ['復習', '復習', 'ふくしゅう', 'review', ['n', 'vs'], 1200, ['known'], ['LHHH']],
    ['説明', '説明', 'せつめい', 'explanation', ['n', 'vs'], 600, ['known'], ['LHHH']],
    ['配信', '配信', 'はいしん', 'stream', ['n', 'vs'], 1700, ['known'], ['LHHH']],
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']],
    ['作成', '作成', 'さくせい', 'create', ['n', 'vs'], 850, ['known'], ['LHHH']],
    ['音楽', '音楽', 'おんがく', 'music', ['n'], 450, ['known'], ['LHHH']],
    ['動画', '動画', 'どうが', 'video', ['n'], 650, ['known'], ['LHH']],
    ['発見', '発見', 'はっけん', 'discovery', ['n', 'vs'], 900, ['known'], ['LHHH']],
    ['初心者', '初心者', 'しょしんしゃ', 'beginner', ['n'], 1500, ['known'], ['LHHHH']],
    ['基礎', '基礎', 'きそ', 'basics', ['n'], 1100, ['known'], ['LH']],
    ['観光', '観光', 'かんこう', 'sightseeing', ['n', 'vs'], 1400, ['known'], ['LHHH']],
    ['視聴', '視聴', 'しちょう', 'watching', ['n', 'vs'], 1200, ['known'], ['LHHH']],
    ['本', '本', 'ほん', 'book', ['n'], 350, ['known'], ['L']],
    ['読む', '読む', 'よむ', 'read', ['v5m'], 400, ['known'], ['LH']],
    ['読みます', '読む', 'よみます', 'read', ['v5m'], 401, ['known'], ['LH']],
    ['質問', '質問', 'しつもん', 'question', ['n', 'vs'], 1300, ['known'], ['LHHH']],
    ['関連動画', '関連動画', 'かんれんどうが', 'related video', ['n'], 2800, ['not-in-deck'], ['LHHHHH']],
    ['発行', '発行', 'はっこう', 'publication', ['n', 'vs'], 2300, ['not-in-deck'], ['LHHH']],
    ['話', '話', 'はなし', 'story', ['n'], 800, ['known'], ['LHH']],
    ['東京', '東京', 'とうきょう', 'Tokyo', ['n'], 500, ['known'], ['LHHH']],
    ['春', '春', 'はる', 'spring', ['n'], 1100, ['known'], ['LH']],
    ['勉強', '勉強', 'べんきょう', 'study', ['n', 'vs'], 700, ['known'], ['LHHH']],
    ['仕事', '仕事', 'しごと', 'work', ['n'], 650, ['known'], ['LHH']],
    ['新卒', '新卒', 'しんそつ', 'new graduate', ['n'], 2100, ['not-in-deck'], ['LHHH']],
    ['京都', '京都', 'きょうと', 'Kyoto', ['n'], 900, ['known'], ['LHHH']],
    ['大阪', '大阪', 'おおさか', 'Osaka', ['n'], 1000, ['known'], ['LHHH']],
    ['朝ごはん', '朝ごはん', 'あさごはん', 'breakfast', ['n'], 1800, ['known'], ['LHHHH']],
];

for (const filePath of [userscriptPath, cssPath]) {
    if (!existsSync(filePath)) throw new Error(`Missing built artifact: ${filePath}. Run npm run build first.`);
}

const scenarioNames = profileScenarioNames();
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const report = {
    generatedAt: new Date().toISOString(),
    stressDurationMs,
    artifacts: { userscriptPath, cssPath, companionPaths },
    profileDir: profileDir || null,
    scenarios: [],
};

for (const scenario of scenarioNames.map(profileScenario)) {
    console.error(`[youtube-home-profile] scenario ${scenario.name}`);
    report.scenarios.push(await runScenario(scenario));
}

writeFileSync(join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function profileScenarioNames() {
    const raw = process.env.YOMU_HOME_PROFILE_SCENARIOS ?? 'jpdb,anki,jiten,anki-jiten,no-api';
    return raw.split(',').map(value => value.trim()).filter(Boolean);
}

function profileScenario(name) {
    const scenarios = {
        jpdb: { name: 'jpdb', jpdb: true, anki: false, jiten: false },
        anki: { name: 'anki', jpdb: true, anki: true, jiten: false },
        jiten: { name: 'jiten', jpdb: false, anki: false, jiten: true },
        'anki-jiten': { name: 'anki-jiten', jpdb: false, anki: true, jiten: true },
        'no-api': { name: 'no-api', jpdb: false, anki: false, jiten: false },
    };
    const scenario = scenarios[name];
    if (!scenario) throw new Error(`Unknown YouTube homepage profile scenario: ${name}`);
    return scenario;
}

function scenarioSettings(scenario) {
    return {
        onboardingSeen: true,
        interfaceLanguage: 'en',
        apiKey: scenario.jpdb ? 'profile-jpdb-key' : '',
        jitenApiKey: scenario.jiten ? 'ak_profile_jiten_key' : '',
        ankiEnabled: scenario.anki,
        ankiSectionEnabled: scenario.anki,
        ankiConnectUrl,
        ankiDeck: 'Mining',
        ankiModel: 'よむ Japanese',
        localDictionariesEnabled: false,
        jpdbDefinitionsEnabled: true,
        audioEnabled: true,
        autoPlayAudio: true,
        audioAutoPlayMode: 'hover',
        audioEnableDefaultSources: false,
        audioSelectionMode: 'random',
        audioViaBlob: false,
        audioSources: [{ type: 'custom-json', url: 'https://audio.test/nested-json?term={term}&reading={reading}', voice: '', enabled: true }],
        audioTimeoutMs: 2500,
        immersionKitEnabled: false,
        studyTranslationEnabled: false,
        studyGrammarEnabled: false,
        lookupOnClick: true,
        lookupOnHover: true,
        hoverOpenDelayMs: 0,
        hoverCloseDelayMs: 120,
        popupActivationMode: 'click',
        showFloatingButton: false,
        enableLogging: captureConsole,
        furiganaMode: 'all',
        wordTextColorSource: scenario.anki ? 'anki' : 'jpdb',
        wordUnderlineColorSource: 'pitch',
        wordHighlightColorSource: 'off',
        ocrEnabled: true,
        ocrAutoScanImages: false,
        ocrProvider: 'local-service',
        ocrVideoPauseFrames: true,
        ocrShowTextOverlay: true,
        ocrMinImageArea: 1,
        ocrMaxImagesPerPage: 5,
        ocrPrefetchMargin: 0,
        showPitchAccent: true,
        youtubeImmersionEnabled: true,
    };
}

async function runScenario(scenario) {
    const scenarioDir = join(outputRoot, scenario.name);
    mkdirSync(scenarioDir, { recursive: true });
    const requests = [];
    const errors = [];
    const pages = selectedPageNames();
    const { browser, context } = await openContext(scenario, requests);
    try {
        const desktop = pages.has('desktop-home') ? await runPageProfile(context, scenario, requests, errors, {
            name: 'desktop-home',
            url: 'https://www.youtube.com/',
            viewport: { width: 1440, height: 950 },
            artifactsDir: scenarioDir,
            mobile: false,
        }) : null;
        const desktopSearch = pages.has('desktop-search') ? await runPageProfile(context, scenario, requests, errors, {
            name: 'desktop-search',
            url: 'https://www.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC%E8%AA%9E',
            viewport: { width: 1440, height: 950 },
            artifactsDir: scenarioDir,
            mobile: false,
        }) : null;
        const mobile = pages.has('mobile-home') ? await runPageProfile(context, scenario, requests, errors, {
            name: 'mobile-home',
            url: 'https://m.youtube.com/',
            viewport: devices['iPhone 13'].viewport,
            artifactsDir: scenarioDir,
            mobile: true,
        }) : null;
        const mobileSearch = pages.has('mobile-search') ? await runPageProfile(context, scenario, requests, errors, {
            name: 'mobile-search',
            url: 'https://m.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC%E8%AA%9E',
            viewport: devices['iPhone 13'].viewport,
            artifactsDir: scenarioDir,
            mobile: true,
        }) : null;
        return {
            name: scenario.name,
            settings: { jpdb: scenario.jpdb, anki: scenario.anki, jiten: scenario.jiten },
            auth: { signedIn: desktop?.signedIn ?? null, mobileSignedIn: mobile?.signedIn ?? null },
            desktop,
            desktopSearch,
            mobile,
            mobileSearch,
            requests: summarizeRequests(requests),
            errors: errors.slice(0, 8),
        };
    } finally {
        await closeWithTimeout(() => context.close(), 5_000);
        if (browser) await closeWithTimeout(() => browser.close(), 5_000);
    }
}

function selectedPageNames() {
    const fallback = process.env.YOMU_HOME_PROFILE_INCLUDE_SEARCH === '0'
        ? 'desktop-home,mobile-home'
        : 'desktop-home,desktop-search,mobile-home,mobile-search';
    return new Set((process.env.YOMU_HOME_PROFILE_PAGES ?? fallback).split(',').map(value => value.trim()).filter(Boolean));
}

async function openContext(scenario, requests) {
    const options = {
        channel,
        headless: !headed,
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1440, height: 950 },
    };
    let browser = null;
    let context;
    if (profileDir) {
        context = await chromium.launchPersistentContext(resolve(profileDir), options);
    } else {
        browser = await chromium.launch(options);
        context = await browser.newContext({ bypassCSP: true, locale: 'ja-JP', viewport: { width: 1440, height: 950 } });
    }
    await installConsentCookies(context);
    await installInstrumentation(context);
    await installUserscriptContext(context, scenarioSettings(scenario), scenario, requests);
    return { browser, context };
}

async function installConsentCookies(context) {
    await context.addCookies([
        { name: 'CONSENT', value: 'YES+cb.20240101-08-p0.ja+FX+667', domain: '.youtube.com', path: '/' },
        { name: 'SOCS', value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA4X3AwGgJqYSACGgYIgJzqrQY', domain: '.youtube.com', path: '/' },
    ]).catch(() => undefined);
}

async function installUserscriptContext(context, settings, scenario, requests) {
    await addGmStorageBridgeInitScript(context, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(cssPath, 'utf8'),
        requestBridgeName,
    });
    await context.exposeFunction(requestBridgeName, request => bridgeResponse(request, scenario, requests));
    for (const companionPath of companionPaths) await context.addInitScript({ path: companionPath });
    await context.addInitScript({ path: userscriptPath });
}

async function runPageProfile(context, scenario, requests, errors, spec) {
    console.error(`[youtube-home-profile] ${scenario.name}/${spec.name} ${spec.url}`);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error?.message || error)));
    page.on('request', request => {
        const url = request.url();
        if (!captureConsole) return;
        if (/jpdb|jiten|yomu-jpdb-public-proxy|audio\.test|127\.0\.0\.1:8765/i.test(url)) {
            errors.push(`[request:${request.method()}] ${url}`);
        }
    });
    page.on('console', message => {
        const text = message.text();
        if (captureConsole && /Yomu|ReaderParser|VisiblePageScanner|JpdbClient|JpdbApi/i.test(text)) {
            errors.push(`[console:${message.type()}] ${text}`);
        } else if (message.type() === 'error' && /yomu|jpdb|jiten|anki|ocr|audio/i.test(text)) {
            errors.push(text);
        }
    });
    await routeProfileRequests(page, scenario, requests);
    await page.setViewportSize(spec.viewport);
    const client = await context.newCDPSession(page);
    await client.send('Performance.enable').catch(() => undefined);
    if (spec.mobile) await client.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.YOMU_HOME_PROFILE_MOBILE_CPU ?? 4) }).catch(() => undefined);

    const started = Date.now();
    await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await dismissConsent(page);
    await page.waitForSelector('ytd-rich-grid-renderer, ytd-browse, ytm-rich-grid-renderer, ytm-browse, ytm-app', { timeout: readyTimeoutMs }).catch(() => undefined);
    const thumbnailLoad = await waitForThumbnailReadiness(page, thumbnailTimeoutMs);
    await page.waitForTimeout(1200);
    const initial = await readPageState(page, client);
    const stressStarted = await beginStress(page, client, requests);
    const stress = await runHomepageStress(page, { durationMs: stressDurationMs, mobile: spec.mobile });
    const afterStress = await finishStress(page, client, requests, stressStarted);
    await page.screenshot({ path: join(spec.artifactsDir, `${spec.name}.png`), fullPage: false }).catch(() => undefined);
    const final = await readPageState(page, client);
    await page.close().catch(() => undefined);
    console.error(`[youtube-home-profile] ${scenario.name}/${spec.name} done`);
    return {
        name: spec.name,
        url: spec.url,
        mobile: spec.mobile,
        elapsedMs: Date.now() - started,
        signedIn: initial.youtube.signedIn,
        thumbnailLoad,
        initial,
        stress,
        afterStress,
        final,
    };
}

async function routeProfileRequests(page, scenario, requests) {
    await page.route('**/*', async route => {
        const request = route.request();
        const response = routeResponse(request.url(), request.postData() ?? '', scenario, requests, request.method());
        if (!response) {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: response.status,
            headers: response.headers,
            contentType: response.contentType,
            body: response.responseText,
        });
    });
}

async function bridgeResponse(request, scenario, requests) {
    const response = routeResponse(request.url, gmRequestFetchBody(request), scenario, requests, request.method || 'GET');
    if (response) return response;
    requests.push({ kind: 'passthrough-bridge', url: request.url, method: request.method || 'GET' });
    return textResponse('', 'text/plain', 204);
}

function routeResponse(url, rawBody, scenario, requests, method = 'GET') {
    const parsed = new URL(url);
    const target = proxiedTargetUrl(parsed) ?? parsed;
    if (method === 'OPTIONS') return textResponse('', 'text/plain', 204);
    if (target.href.startsWith(jpdbParseUrl)) return jpdbParseResponse(rawBody, scenario, requests);
    if (target.hostname === 'api.jiten.moe' && target.pathname.startsWith('/api/')) return jitenResponse(target, rawBody, scenario, requests);
    if (isAnkiConnectUrl(parsed)) return ankiConnectResponse(rawBody, scenario, requests);
    if (target.hostname === 'jpdb.io' && target.pathname === '/search') return jpdbSearchResponse(target, requests);
    if (target.hostname === 'audio.test') return audioResponse(target, requests);
    return null;
}

function proxiedTargetUrl(url) {
    const target = url.searchParams.get('url');
    if (!target) return null;
    try {
        return new URL(target);
    } catch {
        return null;
    }
}

function jpdbParseResponse(rawBody, scenario, requests) {
    const body = parseJsonBody(rawBody);
    const text = Array.isArray(body.text) ? body.text.map(String) : [];
    const response = mockJpdbParseFromVocabulary({ text }, vocabularyRows, { defaultState: scenario.anki ? ['not-in-deck'] : ['known'] });
    requests.push({ kind: 'jpdb-parse', scenario: scenario.name, paragraphs: text.length, chars: text.join('').length });
    return jsonResponse(response);
}

function jitenResponse(url, rawBody, scenario, requests) {
    const endpoint = url.pathname.replace(/^\/api\/?/, '');
    requests.push({ kind: 'jiten', scenario: scenario.name, endpoint });
    if (endpoint === 'reader/ping') return jsonResponse({ ok: true });
    if (endpoint === 'reader/parse') return jsonResponse(jitenParseResponse(parseJsonBody(rawBody)));
    if (endpoint === 'vocabulary/parse') return jsonResponse(jitenPublicParseResponse(url.searchParams.get('text') ?? ''));
    if (endpoint === 'srs/reader-study-decks') return jsonResponse([{ userStudyDeckId: 1, name: 'Mining' }]);
    if (/^vocabulary\/\d+\/\d+\/info$/.test(endpoint)) return jsonResponse(jitenVocabularyInfo(endpoint));
    if (/^vocabulary\/\d+\/\d+\/random-example-sentences$/.test(endpoint)) return jsonResponse([]);
    return jsonResponse({});
}

function jitenPublicParseResponse(text) {
    return vocabularyRows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => text.includes(row[1]) || text.includes(row[0]))
        .map(({ row, index }) => ({
            wordId: 600_001 + index,
            originalText: row[1],
            readingIndex: 0,
            conjugations: [],
        }));
}

function jitenParseResponse(body) {
    const paragraphs = Array.isArray(body.text) ? body.text.map(String) : [];
    const vocab = [];
    const vocabKey = new Map();
    const tokens = paragraphs.map(text => {
        const result = [];
        for (let index = 0; index < text.length;) {
            const entry = vocabularyRows.find(row => text.startsWith(row[0], index));
            if (!entry) {
                index += 1;
                continue;
            }
            const key = `${entry[1]}:${entry[2]}`;
            let record = vocabKey.get(key);
            if (!record) {
                record = jitenVocabularyRecord(entry, vocab.length + 1);
                vocabKey.set(key, record);
                vocab.push(record);
            }
            result.push({ wordId: record.wordId, readingIndex: record.readingIndex, start: index, end: index + entry[0].length, length: entry[0].length });
            index += entry[0].length;
        }
        return result;
    });
    return { tokens, vocabulary: vocab };
}

function jitenVocabularyRecord(row, id) {
    const [, spelling, reading, gloss, partsOfSpeech, frequency, state, pitch] = row;
    return {
        wordId: 600_000 + id,
        readingIndex: 0,
        spelling,
        reading,
        frequencyRank: frequency,
        partsOfSpeech,
        meaningsChunks: [[gloss]],
        meaningsPartOfSpeech: [partsOfSpeech],
        knownState: state.includes('known') ? [2] : [0],
        pitchAccents: jitenPitchPositions(reading, pitch[0] ?? ''),
        sourceDeckName: 'Mining',
    };
}

function jitenPitchPositions(reading, pattern) {
    if (!pattern) return [];
    const chars = Array.from(reading);
    const firstDrop = chars.findIndex((_, index) => pattern[index] === 'H' && pattern[index + 1] === 'L');
    return [firstDrop >= 0 ? firstDrop + 1 : 0];
}

function jitenVocabularyInfo(endpoint) {
    const [, wordIdRaw, readingIndexRaw] = endpoint.match(/^vocabulary\/(\d+)\/(\d+)\/info$/) ?? [];
    const wordId = Number(wordIdRaw) || 1;
    const readingIndex = Number(readingIndexRaw) || 0;
    const row = vocabularyRows[(wordId - 600_001) % vocabularyRows.length] ?? vocabularyRows[0];
    return {
        wordId,
        mainReading: { text: row[2], readingIndex, frequencyRank: row[5], usedInMediaAmount: 10 },
        alternativeReadings: [],
        partsOfSpeech: row[4],
        definitions: [{ index: 0, meanings: [row[3]], partsOfSpeech: row[4] }],
        pitchAccents: jitenPitchPositions(row[2], row[7][0] ?? ''),
        knownStates: row[6].includes('known') ? [2] : [0],
        composedOf: [],
        usedIn: [],
        usedInTotal: 0,
    };
}

function ankiConnectResponse(rawBody, scenario, requests) {
    const body = parseJsonBody(rawBody);
    requests.push({ kind: 'anki', scenario: scenario.name, action: String(body.action ?? ''), params: summarizeAnkiParams(body.params ?? {}) });
    return jsonResponse(mockAnkiConnectResponse(body, resolveProfileAnkiAction, { scenario }));
}

function resolveProfileAnkiAction(action, params) {
    const handlers = {
        version: () => 6,
        deckNames: () => ['Mining'],
        getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 1 } }),
        modelNames: () => ['よむ Japanese'],
        modelFieldNames: () => ['Expression', 'Reading', 'Meaning', 'Sentence', 'Audio'],
        findCards: value => (/先生|日本語|読む|今日|字幕|東京|勉強|仕事/.test(String(value.query ?? '')) ? [8801] : []),
        findNotes: value => (/先生|日本語|読む|今日|字幕|東京|勉強|仕事/.test(String(value.query ?? '')) ? [9901] : []),
        notesInfo: value => arrayParam(value.notes).map(noteId => ({
            noteId,
            modelName: 'よむ Japanese',
            tags: ['youtube-home-profile'],
            fields: { Expression: { value: '日本語' }, Reading: { value: 'にほんご' }, Meaning: { value: 'Japanese language' } },
            cards: [8801],
        })),
        cardsInfo: value => arrayParam(value.cards).map(cardId => ({ cardId, note: 9901, deckName: 'Mining', queue: 2, type: 2, due: 1 })),
        areDue: value => arrayParam(value.cards).map(() => true),
        canAddNotes: value => arrayParam(value.notes).map(() => true),
        retrieveMediaFile: () => false,
        createDeck: () => null,
        createModel: () => null,
        addNote: () => 9902,
        updateNoteFields: () => null,
    };
    return resolveAnkiAction(action, params, handlers);
}

function jpdbSearchResponse(url, requests) {
    const query = url.searchParams.get('q') ?? '';
    requests.push({ kind: 'jpdb-search', query });
    const candidates = vocabularyRows.filter(([, spelling, reading]) => spelling.includes(query) || reading.includes(query) || query.includes(spelling)).slice(0, 4);
    return textResponse(`<!doctype html><html><body><div class="results search">${candidates.map(jpdbSearchResultHtml).join('')}</div></body></html>`, 'text/html; charset=utf-8');
}

function jpdbSearchResultHtml(row, index) {
    const [, spelling, reading, gloss, partOfSpeech, rank, , pitch] = row;
    const vid = 700_000 + index;
    return `<div class="result vocabulary">
      <div class="subsection-headword"><div class="primary-spelling"><div class="spelling"><a href="/vocabulary/${vid}/${escapeURIComponent(spelling)}/${escapeURIComponent(reading)}"><ruby>${escapeHtml(spelling)}<rt>${escapeHtml(reading)}</rt></ruby></a></div></div></div>
      <div class="tags"><div class="tag">Top ${rank}</div></div>
      <div class="subsection-meanings"><div class="part-of-speech">${partOfSpeech.map(pos => `<div>${escapeHtml(pos)}</div>`).join('')}</div><div class="description">${escapeHtml(gloss)}</div></div>
      <div class="subsection-pitch-accent"><div class="subsection"><div><div>${jpdbPitchRowsHtml(reading, pitch[0] ?? '')}</div></div></div></div>
    </div>`;
}

function jpdbPitchRowsHtml(reading, pattern) {
    return Array.from(reading).map((character, index) => `<div style="${pattern[index] === 'H' ? '--pitch-high' : '--pitch-low'}: 1">${escapeHtml(character)}</div>`).join('');
}

function audioResponse(url, requests) {
    requests.push({ kind: 'audio', url: url.href });
    if (url.pathname === '/nested-json') {
        return jsonResponse({
            audioSources: [
                { source: { url: 'https://audio.test/clip-a.mp3' } },
                { source: { url: 'https://audio.test/clip-b.mp3' } },
                { source: { url: 'https://audio.test/clip-c.mp3' } },
            ],
        });
    }
    return {
        status: 200,
        responseText: silentWavBytes(),
        contentType: 'audio/mpeg',
        headers: corsHeaders(),
    };
}

async function waitForThumbnailReadiness(page, timeoutMs) {
    const started = Date.now();
    const samples = [];
    while (Date.now() - started < timeoutMs) {
        const sample = await page.evaluate(readThumbnailState);
        samples.push(sample);
        if (sample.visible >= 6 && sample.loaded >= Math.min(6, sample.visible * 0.7)) {
            return { ms: Date.now() - started, samples, final: sample };
        }
        await page.waitForTimeout(250);
    }
    return { ms: Date.now() - started, timedOut: true, samples, final: samples.at(-1) ?? null };
}

function readThumbnailState() {
    const images = visibleElements('ytd-rich-item-renderer img, ytd-video-renderer img, ytd-thumbnail img, yt-image img, ytm-video-with-context-renderer img, ytm-rich-item-renderer img');
    const uniqueSrc = new Set(images.map(image => image.currentSrc || image.src).filter(Boolean));
    return {
        visible: images.length,
        loaded: images.filter(image => image.complete && image.naturalWidth > 0).length,
        uniqueSrc: uniqueSrc.size,
        blank: images.filter(image => !image.complete || image.naturalWidth <= 0).length,
    };
}

async function beginStress(page, client, requests) {
    await page.evaluate(() => window.__yomuHomeResetPerf?.());
    return { cdp: await cdpMetrics(client), requestIndex: requests.length };
}

async function finishStress(page, client, requests, started) {
    const cdp = await cdpMetrics(client);
    return {
        cdpDelta: metricDelta(started.cdp, cdp),
        page: await readPageState(page, client),
        requests: summarizeRequests(requests.slice(started.requestIndex)),
    };
}

async function runHomepageStress(page, options) {
    const startedAt = Date.now();
    const hoverSamples = [];
    const previewSamples = [];
    const scrollSamples = [];
    let previewDone = false;
    let direction = 1;
    while (Date.now() - startedAt < options.durationMs) {
        const elapsed = Date.now() - startedAt;
        await page.evaluate(({ direction: scrollDirection, mobile }) => {
            const delta = mobile ? 520 : 760;
            window.scrollBy({ top: delta * scrollDirection, behavior: 'instant' });
            if (window.scrollY <= 20) return;
            if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 80) window.scrollBy({ top: -delta * 2, behavior: 'instant' });
        }, { direction, mobile: options.mobile });
        if (elapsed > options.durationMs * 0.55) direction = -1;
        if (!options.mobile && !previewDone && elapsed > 1200) {
            previewDone = true;
            previewSamples.push(await hoverPreviewProbe(page));
        }
        if (!options.mobile) hoverSamples.push(...await hoverWordSequence(page, 3));
        scrollSamples.push(await page.evaluate(() => ({
            y: Math.round(window.scrollY),
            viewportWords: visibleElements('.jpdb-reader-word').length,
            thumbnails: readThumbnailState(),
            ocrFrames: document.querySelectorAll('.jpdb-ocr-video-frame, .jpdb-ocr-layer .jpdb-ocr-line').length,
        })));
        await page.waitForTimeout(options.mobile ? 220 : 160);
    }
    await page.mouse.move(6, 6).catch(() => undefined);
    return {
        durationMs: Date.now() - startedAt,
        hover: hoverSummary(hoverSamples),
        hoverSamples,
        preview: previewSamples,
        scrollSamples: summarizeScrollSamples(scrollSamples),
    };
}

async function hoverWordSequence(page, limit) {
    const targets = await page.evaluate(max => {
        const words = visibleElements('.jpdb-reader-word[data-expression], .jpdb-reader-word[data-surface]')
            .filter(word => !word.closest('[data-jpdb-reader-root]'))
            .slice(0, max);
        return words.map(word => {
            const rect = word.getBoundingClientRect();
            return {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                expected: word.dataset.expression || word.dataset.surface || '',
                text: (word.textContent || '').replace(/\s+/g, '').slice(0, 24),
            };
        });
    }, limit);
    const samples = [];
    for (const target of targets) samples.push(await hoverWordProbe(page, target));
    return samples;
}

async function hoverWordProbe(page, target) {
    const started = await page.evaluate(expected => {
        window.__yomuHomeHoverProbe = { startedAt: performance.now(), shellAt: null, contentAt: null, expected, text: '' };
        return window.__yomuHomeHoverProbe.startedAt;
    }, target.expected);
    await page.mouse.move(target.x, target.y);
    await page.waitForFunction(() => {
        const probe = window.__yomuHomeHoverProbe;
        const popover = document.querySelector('.jpdb-reader-popover');
        if (popover && probe && probe.shellAt === null) probe.shellAt = performance.now();
        const text = popover?.textContent?.replace(/\s+/g, '') ?? '';
        const expected = probe?.expected ?? '';
        const hasContent = Boolean(text && (!expected || text.includes(expected) || text.length > 28));
        if (popover && hasContent && probe && probe.contentAt === null) {
            probe.contentAt = performance.now();
            probe.text = text.slice(0, 140);
        }
        return Boolean(probe?.contentAt);
    }, null, { timeout: 2500 }).catch(() => undefined);
    const probe = await page.evaluate(() => window.__yomuHomeHoverProbe ?? null);
    return {
        target,
        shellMs: probe?.shellAt ? rounded(probe.shellAt - started) : null,
        contentMs: probe?.contentAt ? rounded(probe.contentAt - started) : null,
        opened: Boolean(probe?.contentAt),
        popoverText: probe?.text ?? '',
    };
}

async function hoverPreviewProbe(page) {
    const target = await page.evaluate(() => {
        const cards = visibleElements('ytd-rich-item-renderer, ytd-video-renderer, ytm-video-with-context-renderer');
        const card = cards.find(item => item.querySelector('a[href*="/watch"]')) ?? cards[0];
        if (!card) return null;
        const rect = card.getBoundingClientRect();
        return { x: Math.round(rect.left + Math.min(rect.width / 2, 180)), y: Math.round(rect.top + Math.min(rect.height / 2, 110)) };
    });
    if (!target) return { skipped: true };
    const before = await page.evaluate(() => window.__yomuHomeMediaEvents.length);
    await page.mouse.move(target.x, target.y);
    const samples = [];
    for (let index = 0; index < 12; index += 1) {
        samples.push(await page.evaluate(() => {
            const videos = visibleElements('ytd-rich-item-renderer video, ytd-video-renderer video, ytm-video-with-context-renderer video, ytd-video-preview video');
            return videos.map(video => ({ currentTime: video.currentTime, paused: video.paused, rect: rectJson(video.getBoundingClientRect()) }));
        }));
        await page.waitForTimeout(250);
    }
    const after = await page.evaluate(startIndex => ({
        mediaEvents: window.__yomuHomeMediaEvents.slice(startIndex),
        ocrFrames: document.querySelectorAll('.jpdb-ocr-video-frame, .jpdb-ocr-layer .jpdb-ocr-line').length,
    }), before);
    return {
        target,
        resets: countVideoTimeResets(samples),
        samples: samples.map(group => group.length),
        mediaEvents: after.mediaEvents,
        ocrFrames: after.ocrFrames,
    };
}

function countVideoTimeResets(sampleGroups) {
    let resets = 0;
    const previous = new Map();
    sampleGroups.forEach(group => {
        group.forEach((sample, index) => {
            const last = previous.get(index);
            if (typeof last === 'number' && sample.currentTime + 0.15 < last) resets += 1;
            previous.set(index, sample.currentTime);
        });
    });
    return resets;
}

async function readPageState(page, client) {
    const [state, cdp] = await Promise.all([
        page.evaluate(() => {
            const words = [...document.querySelectorAll('.jpdb-reader-word')];
            const visibleWords = visibleElements('.jpdb-reader-word');
            const missingBases = words.filter(word => {
                const rt = word.querySelector('rt,.jpdb-reader-furi');
                if (!rt) return false;
                const rect = word.getBoundingClientRect();
                return rect.height <= 2 || getComputedStyle(word).color === 'rgba(0, 0, 0, 0)';
            }).length;
            const concretePitchRe = /jpdb-pitch-(heiban|atamadaka|nakadaka|odaka)/u;
            const concretePitchWords = words.filter(word => concretePitchRe.test(word.className));
            const unknownPitchWords = words.filter(word => /\bjpdb-pitch-unknown\b/u.test(word.className));
            const visibleConcretePitchWords = visibleWords.filter(word => concretePitchRe.test(word.className));
            const resolvedWords = words.filter(word => word.dataset.cardSource === 'jpdb');
            const visibleResolvedWords = visibleWords.filter(word => word.dataset.cardSource === 'jpdb');
            return {
                perf: window.__yomuHomePerf,
                settings: window.yomuSettingsSnapshot?.() ?? null,
                youtube: {
                    signedIn: Boolean(document.querySelector('button#avatar-btn, ytd-topbar-menu-button-renderer button#avatar-btn')),
                    feedItems: document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytm-video-with-context-renderer, ytm-rich-item-renderer').length,
                    text: (document.body?.innerText || '').slice(0, 160),
                },
                thumbnails: readThumbnailState(),
                words: {
                    total: words.length,
                    visible: visibleWords.length,
                    ruby: words.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length,
                    pitch: concretePitchWords.length,
                    pitchConcrete: concretePitchWords.length,
                    pitchConcreteVisible: visibleConcretePitchWords.length,
                    pitchUnknown: unknownPitchWords.length,
                    pitchAny: concretePitchWords.length + unknownPitchWords.length,
                    resolved: resolvedWords.length,
                    resolvedVisible: visibleResolvedWords.length,
                    colored: words.filter(word => /jpdb-(known|new|not-in-deck|learning|due|failed)|anki-|jiten-/u.test(word.className)).length,
                    missingBases,
                },
                ocr: {
                    frames: document.querySelectorAll('.jpdb-ocr-video-frame').length,
                    lines: document.querySelectorAll('.jpdb-ocr-line').length,
                    rubyWords: [...document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')].filter(word => word.querySelector('rt,.jpdb-ocr-furi')).length,
                },
                mediaEvents: window.__yomuHomeMediaEvents.slice(-80),
            };
        }),
        cdpMetrics(client).catch(() => ({})),
    ]);
    return { ...state, cdp };
}

async function installInstrumentation(context) {
    await context.addInitScript(() => {
        const JapaneseText = /[\u3040-\u30ff\u3400-\u9fff]/u;
        window.__yomuHomeMediaEvents = [];
        const perf = {
            initAt: performance.now(),
            firstJapaneseTextAt: null,
            firstReaderWordAt: null,
            firstRubyAt: null,
            firstResolvedVocabularyAt: null,
            firstPitchAt: null,
            addedReaderWords: 0,
            removedReaderWords: 0,
            addedJapaneseMutations: 0,
            mutationCallbacks: 0,
            mutationRecords: 0,
            longTasks: 0,
            longTaskMs: 0,
            maxLongTaskMs: 0,
            rafSamples: 0,
            maxFrameGapMs: 0,
            over50MsFrames: 0,
        };
        window.__yomuHomePerf = perf;
        window.__yomuHomeResetPerf = () => {
            perf.initAt = performance.now();
            for (const key of Object.keys(perf)) {
                if (key === 'initAt') continue;
                perf[key] = /At$/.test(key) ? null : 0;
            }
            window.__yomuHomeMediaEvents.length = 0;
            sampleMilestones();
        };
        window.visibleElements = selector => [...document.querySelectorAll(selector)].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 2
                && rect.height > 2
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth;
        });
        window.rectJson = rect => ({
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
        });
        window.readThumbnailState = () => {
            const images = window.visibleElements('ytd-rich-item-renderer img, ytd-video-renderer img, ytd-thumbnail img, yt-image img, ytm-video-with-context-renderer img, ytm-rich-item-renderer img');
            const uniqueSrc = new Set(images.map(image => image.currentSrc || image.src).filter(Boolean));
            return {
                visible: images.length,
                loaded: images.filter(image => image.complete && image.naturalWidth > 0).length,
                uniqueSrc: uniqueSrc.size,
                blank: images.filter(image => !image.complete || image.naturalWidth <= 0).length,
            };
        };
        window.yomuSettingsSnapshot = () => {
            const settings = readYomuSettings();
            if (!settings || typeof settings !== 'object') return null;
            return {
                hasApiKey: Boolean(String(settings.apiKey ?? '').trim()),
                hasJitenApiKey: Boolean(String(settings.jitenApiKey ?? '').trim()),
                ankiEnabled: Boolean(settings.ankiEnabled),
                showPitchAccent: settings.showPitchAccent,
                furiganaMode: settings.furiganaMode,
                wordTextColorSource: settings.wordTextColorSource,
                wordUnderlineColorSource: settings.wordUnderlineColorSource,
                audioEnabled: settings.audioEnabled,
                autoPlayAudio: settings.autoPlayAudio,
                audioAutoPlayMode: settings.audioAutoPlayMode,
                audioSelectionMode: settings.audioSelectionMode,
                ocrVideoPauseFrames: settings.ocrVideoPauseFrames,
                youtubeImmersionEnabled: settings.youtubeImmersionEnabled,
            };
        };

        const NativeMutationObserver = window.MutationObserver;
        window.MutationObserver = class ProfiledMutationObserver extends NativeMutationObserver {
            constructor(callback) {
                super((mutations, observer) => {
                    perf.mutationCallbacks += 1;
                    perf.mutationRecords += mutations.length;
                    for (const mutation of mutations) recordMutation(mutation);
                    sampleMilestones();
                    callback(mutations, observer);
                });
            }
        };
        new NativeMutationObserver(sampleMilestones).observe(document, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'data-card-source'],
        });
        requestAnimationFrame(sampleMilestones);
        observeLongTasks();
        sampleFrames();
        patchMedia();

        function observeLongTasks() {
            try {
                new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        perf.longTasks += 1;
                        perf.longTaskMs += entry.duration;
                        perf.maxLongTaskMs = Math.max(perf.maxLongTaskMs, entry.duration);
                    }
                }).observe({ entryTypes: ['longtask'] });
            } catch {
                // Not available in every browser context.
            }
        }

        function sampleFrames() {
            let last = performance.now();
            const tick = now => {
                const gap = now - last;
                perf.rafSamples += 1;
                perf.maxFrameGapMs = Math.max(perf.maxFrameGapMs, gap);
                if (gap > 50) perf.over50MsFrames += 1;
                last = now;
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }

        function patchMedia() {
            const play = HTMLMediaElement.prototype.play;
            const pause = HTMLMediaElement.prototype.pause;
            const load = HTMLMediaElement.prototype.load;
            HTMLMediaElement.prototype.play = function patchedPlay(...args) {
                recordMedia('play', this);
                try {
                    const result = play.apply(this, args);
                    if (result?.catch) result.catch(error => recordMedia('play-failed', this, String(error?.message || error)));
                    return result;
                } catch (error) {
                    recordMedia('play-failed', this, String(error?.message || error));
                    throw error;
                }
            };
            HTMLMediaElement.prototype.pause = function patchedPause(...args) {
                recordMedia('pause', this);
                return pause.apply(this, args);
            };
            HTMLMediaElement.prototype.load = function patchedLoad(...args) {
                recordMedia('load', this);
                return load.apply(this, args);
            };
        }

        function recordMedia(type, element, error) {
            const rect = element.getBoundingClientRect?.() ?? { width: 0, height: 0, top: 0, left: 0 };
            window.__yomuHomeMediaEvents.push({
                type,
                tag: element.tagName,
                t: Math.round(performance.now() * 10) / 10,
                currentTime: Math.round((element.currentTime || 0) * 100) / 100,
                src: String(element.currentSrc || element.src || '').slice(0, 120),
                inFeed: Boolean(element.closest?.('ytd-rich-item-renderer,ytd-video-renderer,ytm-video-with-context-renderer,ytd-video-preview')),
                rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
                error,
            });
            if (window.__yomuHomeMediaEvents.length > 300) window.__yomuHomeMediaEvents.splice(0, 120);
        }

        function recordMutation(mutation) {
            if ([...mutation.addedNodes].some(node => JapaneseText.test(node.textContent || ''))) perf.addedJapaneseMutations += 1;
            perf.addedReaderWords += countReaderWords(mutation.addedNodes);
            perf.removedReaderWords += countReaderWords(mutation.removedNodes);
        }

        function countReaderWords(nodes) {
            return [...nodes].reduce((total, node) => total + readerWordCount(node), 0);
        }

        function readerWordCount(node) {
            if (!(node instanceof Element)) return 0;
            return (node.matches('.jpdb-reader-word') ? 1 : 0) + node.querySelectorAll('.jpdb-reader-word').length;
        }

        function sampleMilestones() {
            const text = document.body?.textContent || '';
            if (perf.firstJapaneseTextAt === null && JapaneseText.test(text)) perf.firstJapaneseTextAt = rounded(performance.now());
            if (perf.firstReaderWordAt === null && document.querySelector('.jpdb-reader-word')) perf.firstReaderWordAt = rounded(performance.now());
            if (perf.firstRubyAt === null && document.querySelector('.jpdb-reader-word rt,.jpdb-reader-word .jpdb-reader-furi')) perf.firstRubyAt = rounded(performance.now());
            if (perf.firstResolvedVocabularyAt === null && document.querySelector('.jpdb-reader-word[data-card-source="jpdb"]')) perf.firstResolvedVocabularyAt = rounded(performance.now());
            if (perf.firstPitchAt === null && document.querySelector('.jpdb-reader-word:is(.jpdb-pitch-heiban,.jpdb-pitch-atamadaka,.jpdb-pitch-nakadaka,.jpdb-pitch-odaka)')) perf.firstPitchAt = rounded(performance.now());
        }

        function readYomuSettings() {
            try {
                if (typeof GM_getValue === 'function') return GM_getValue('jpdb-popup-reader-settings', null);
            } catch {
                // fall through to web storage
            }
            try {
                const raw = localStorage.getItem('jpdb-popup-reader-settings');
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        }

        function rounded(value) {
            return Math.round(value * 10) / 10;
        }
    });
}

function visibleElements(selector) {
    return [...document.querySelectorAll(selector)].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    });
}

function rectJson(rect) {
    return { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) };
}

function hoverSummary(samples) {
    const shell = samples.map(sample => sample.shellMs).filter(value => typeof value === 'number').sort((a, b) => a - b);
    const content = samples.map(sample => sample.contentMs).filter(value => typeof value === 'number').sort((a, b) => a - b);
    return {
        count: samples.length,
        opened: content.length,
        timedOut: samples.filter(sample => !sample.opened).length,
        shellP50Ms: percentile(shell, 0.5),
        shellP95Ms: percentile(shell, 0.95),
        contentP50Ms: percentile(content, 0.5),
        contentP95Ms: percentile(content, 0.95),
        maxContentMs: content.at(-1) ?? null,
        over250Ms: content.filter(ms => ms > 250).length,
        over1000Ms: content.filter(ms => ms > 1000).length,
        slaNearInstant: content.length > 0 && content.every(ms => ms <= 250),
    };
}

function summarizeScrollSamples(samples) {
    return {
        count: samples.length,
        maxVisibleWords: Math.max(0, ...samples.map(sample => sample.viewportWords)),
        maxOcrFrames: Math.max(0, ...samples.map(sample => sample.ocrFrames)),
        minLoadedThumbs: Math.min(...samples.map(sample => sample.thumbnails.loaded).filter(Number.isFinite)),
        maxBlankThumbs: Math.max(0, ...samples.map(sample => sample.thumbnails.blank)),
    };
}

async function closeWithTimeout(close, timeoutMs) {
    await Promise.race([
        close().catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
}

function percentile(values, percentileValue) {
    if (!values.length) return null;
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1));
    return rounded(values[index]);
}

function rounded(value) {
    return Math.round(value * 10) / 10;
}

function summarizeRequests(requests) {
    const byKind = {};
    for (const request of requests) byKind[request.kind] = (byKind[request.kind] ?? 0) + 1;
    const searchCounts = new Map();
    requests.filter(request => request.kind === 'jpdb-search').forEach(request => {
        const query = String(request.query ?? '');
        searchCounts.set(query, (searchCounts.get(query) ?? 0) + 1);
    });
    return {
        count: requests.length,
        byKind,
        jpdbParseChars: requests.filter(request => request.kind === 'jpdb-parse').reduce((sum, request) => sum + (request.chars ?? 0), 0),
        topSearchQueries: [...searchCounts.entries()]
            .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
            .slice(0, 12)
            .map(([query, count]) => ({ query, count })),
        ankiActions: [...new Set(requests.filter(request => request.kind === 'anki').map(request => request.action).filter(Boolean))],
        jitenEndpoints: [...new Set(requests.filter(request => request.kind === 'jiten').map(request => request.endpoint).filter(Boolean))],
        audioUrls: [...new Set(requests.filter(request => request.kind === 'audio').map(request => request.url).filter(Boolean))].slice(0, 8),
    };
}

function summarizeAnkiParams(params) {
    if (!params || typeof params !== 'object') return {};
    const summary = {};
    if (params.query) summary.query = String(params.query).slice(0, 160);
    if (params.actions) summary.actions = arrayParam(params.actions).map(action => action.action);
    if (params.cards) summary.cards = arrayParam(params.cards).length;
    if (params.notes) summary.notes = arrayParam(params.notes).length;
    return summary;
}

function isAnkiConnectUrl(url) {
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '8765';
}

function parseJsonBody(rawBody) {
    if (!rawBody) return {};
    if (Buffer.isBuffer(rawBody)) return JSON.parse(rawBody.toString('utf8'));
    if (typeof rawBody === 'string') return JSON.parse(rawBody || '{}');
    return rawBody;
}

function jsonResponse(value, status = 200) {
    const responseText = JSON.stringify(value);
    return {
        status,
        responseText,
        bytes: [...Buffer.from(responseText)],
        contentType: 'application/json; charset=utf-8',
        headers: corsHeaders(),
    };
}

function textResponse(responseText, contentType, status = 200) {
    return {
        status,
        responseText,
        bytes: [...Buffer.from(String(responseText))],
        contentType,
        headers: corsHeaders(),
    };
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function escapeURIComponent(value) {
    return encodeURIComponent(String(value ?? ''));
}

function silentWavBytes() {
    return Buffer.from('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==', 'base64');
}
